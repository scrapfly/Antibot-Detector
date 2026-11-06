const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Two things the History retention does besides trimming:
//  - At every service-worker start it compacts the stored History (an older build's pretty-printed copy can fill the quota),
//    which reads, parses and re-serializes all of it. The worker starts many times a day, and every write is already compact,
//    so it is done once per browser session and again after an update, not at every start.
//  - The webhook's record of recent deliveries names pages, so it goes where History's own record goes: when the browser
//    closes with "Clear on close" on, and when History is emptied.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition, what, limit = 3000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > limit) throw new Error(`timed out waiting for ${what}`);
    await sleep(2);
  }
}

const entry = (i) => ({
  id: `e${i}`, url: `https://site${i}.example/`, hostname: `site${i}.example`, title: `Site ${i}`, timestamp: 2_000_000_000_000 - i * 60_000,
  detections: [{ detector: { id: 'd', name: 'Demo', description: 'x'.repeat(200) }, category: 'antibot', confidence: 90, matches: [{ type: 'cookie', pattern: 'a', description: 'y'.repeat(200) }] }]
});
const prettyHistory = (count = 8) => JSON.stringify({ items: Array.from({ length: count }, (_, i) => entry(i)), lastUpdated: 1 }, null, 2);

function world({ version = '3.1.4', history = prettyHistory(), session = true, clearOnClose = false, deliveries = true, windows = [] } = {}) {
  const local = {
    scrapfly_settings: JSON.stringify({ settings: { history: { historyLimit: 0, historyClearOnClose: clearOnClose } } }),
    scrapfly_history: history
  };
  const memory = {};
  const area = (store) => ({
    get: async (keys) => Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, JSON.parse(JSON.stringify(store[k]))])),
    set: async (values) => { for (const [k, v] of Object.entries(values)) store[k] = typeof v === 'string' ? v : JSON.parse(JSON.stringify(v)); },
    remove: async (keys) => { for (const k of [].concat(keys)) delete store[k]; }
  });
  const state = { version, compactions: 0, mutations: 0, forgot: 0, failCompaction: 0, windows, listeners: { changed: [], windowRemoved: [], startup: [] } };
  const listener = (name) => ({ addListener: (fn) => state.listeners[name].push(fn) });
  const ctx = vm.createContext({
    console, Date, Promise, JSON, Math, setTimeout, clearTimeout, Map, Set,
    Logger: new Proxy({}, { get: () => () => {} }),
    chrome: {
      storage: { local: area(local), ...(session ? { session: area(memory) } : {}), onChanged: listener('changed') },
      runtime: { getManifest: () => ({ version: state.version, permissions: ['storage', 'unlimitedStorage'] }), onStartup: listener('startup') },
      windows: { getAll: async () => state.windows, onRemoved: listener('windowRemoved') },
      alarms: { get: async () => null, create() {}, clear: async () => true, onAlarm: { addListener() {} } }
    }
  });
  ctx.self = ctx;
  if (deliveries) ctx.SettingsRuntime = { clearWebhookLog: async () => { state.forgot++; } };
  for (const file of ['modules/core/storage-manager.js', 'modules/core/history-store.js', 'background/history-retention.js']) vm.runInContext(read(file), ctx, { filename: file });
  const compact = ctx.HistoryStore.compact;
  ctx.HistoryStore.compact = (...args) => {
    state.compactions++;
    if (state.failCompaction > 0) { state.failCompaction--; return Promise.reject(new Error('storage is busy')); }
    return compact(...args);
  };
  const mutate = ctx.HistoryStore.mutate;
  ctx.HistoryStore.mutate = (...args) => { state.mutations++; return mutate(...args); };
  const retention = () => Object.assign(Object.create(ctx.HistoryRetention), { _initialized: false, _timer: null, _reason: null, DEBOUNCE_MS: 5 });
  return {
    ctx, local, memory, state,
    /** A service worker that starts: its listeners are registered and the start-up work runs; resolves when the run is done. */
    async wake() {
      const before = state.mutations;
      const r = retention();
      r.init();
      await until(() => state.mutations > before, 'the start-up run');
      await sleep(5);
      return r;
    }
  };
}

// ---------------------------------------------------------------- the start-up compaction

test('the stored History is compacted at the first start and not again at the starts after it', async () => {
  const w = world();
  assert.ok(w.local.scrapfly_history.includes('\n'), 'the History an older build left is pretty-printed');
  const before = w.local.scrapfly_history.length;
  await w.wake();
  assert.equal(w.state.compactions, 1);
  assert.ok(!w.local.scrapfly_history.includes('\n') && w.local.scrapfly_history.length < before / 2, 'compacted');
  const compacted = w.local.scrapfly_history;
  for (let i = 0; i < 3; i++) await w.wake();
  assert.equal(w.state.compactions, 1, 'three more starts, no more compaction');
  assert.equal(w.local.scrapfly_history, compacted, 'and nothing was written');
  assert.ok(w.state.mutations >= 4, 'the retention itself still runs at every start');
});

test('an update (a new version) compacts once more, and so does a browser restart, which empties session storage', async () => {
  const w = world();
  await w.wake();
  await w.wake();
  assert.equal(w.state.compactions, 1);
  w.state.version = '3.1.5';
  await w.wake();
  assert.equal(w.state.compactions, 2, 'a new version');
  await w.wake();
  assert.equal(w.state.compactions, 2);
  for (const key of Object.keys(w.memory)) delete w.memory[key];
  await w.wake();
  assert.equal(w.state.compactions, 3, 'a new browser session');
});

test('the mark is kept in memory only: nothing is added to storage.local', async () => {
  const w = world();
  const keys = Object.keys(w.local).sort();
  await w.wake();
  assert.deepEqual(Object.keys(w.local).sort(), keys);
  assert.equal(Object.keys(w.memory).length, 1);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(Object.values(w.memory)[0]))).sort(), ['version'], 'only the version it was done for');
});

test('saving the settings still compacts (a smaller size may have been chosen), and the start after it does not repeat it', async () => {
  const w = world();
  const r = Object.assign(Object.create(w.ctx.HistoryRetention), { _initialized: false, _timer: null });
  await r.run('settings_saved');
  assert.equal(w.state.compactions, 1);
  await r.run('settings_saved');
  assert.equal(w.state.compactions, 2, 'every settings save compacts: the size limit may have changed');
  await w.wake();
  assert.equal(w.state.compactions, 2, 'the start finds it done');
});

test('a compaction that fails is not marked as done: the next start tries again', async () => {
  const w = world();
  w.state.failCompaction = 1;
  await w.wake();
  assert.equal(w.state.compactions, 1);
  assert.equal(Object.keys(w.memory).length, 0, 'no mark');
  await w.wake();
  assert.equal(w.state.compactions, 2, 'tried again');
  assert.ok(!w.local.scrapfly_history.includes('\n'));
  await w.wake();
  assert.equal(w.state.compactions, 2, 'and now it is done');
});

test('a browser without session storage compacts at every start, as before, and nothing breaks', async () => {
  const w = world({ session: false });
  await w.wake();
  await w.wake();
  assert.equal(w.state.compactions, 2);
});

test('settings that cannot be read leave the start-up as it was: nothing is trimmed, and a compaction already done is not repeated', async () => {
  const w = world();
  await w.wake();
  const get = w.ctx.chrome.storage.local.get;
  w.ctx.chrome.storage.local.get = async (keys) => { if ([].concat(keys).includes('scrapfly_settings')) throw new Error('storage is unavailable'); return get(keys); };
  const kept = w.local.scrapfly_history;
  const r = Object.assign(Object.create(w.ctx.HistoryRetention), { _initialized: false, _timer: null });
  r.init();
  await sleep(50);
  assert.equal(w.local.scrapfly_history, kept);
  assert.equal(w.state.compactions, 1);
});

// ---------------------------------------------------------------- the record of deliveries follows History

const EMPTY = '{"items":[],"lastUpdated":5}';

test('with "Clear on close" on, the last window closing forgets the delivery record, even when History had nothing to clear', async () => {
  const w = world({ clearOnClose: true, history: JSON.stringify({ items: [], lastUpdated: 1 }) });
  const r = await w.wake();
  const before = w.state.forgot;
  assert.equal(await r.onWindowRemoved(), 0);
  assert.equal(w.state.forgot, before + 1);

  const filled = world({ clearOnClose: true });
  const fr = await filled.wake();
  const b = filled.state.forgot;
  assert.equal(await fr.onWindowRemoved(), 8);
  assert.equal(filled.state.forgot, b + 1);
});

test('a window closing while others remain, or with the setting off, forgets nothing', async () => {
  const other = world({ clearOnClose: true, windows: [{ id: 2 }] });
  const r = await other.wake();
  const before = other.state.forgot;
  await r.onWindowRemoved();
  assert.equal(other.state.forgot, before);

  const off = world({ clearOnClose: false });
  const o = await off.wake();
  await o.onWindowRemoved();
  assert.equal(off.state.forgot, 0);
});

test('at the start of the browser, "Clear on close" forgets the delivery record the browser could not clear when it closed', async () => {
  const w = world({ clearOnClose: true });
  await w.wake();
  const before = w.state.forgot;
  w.state.listeners.startup[0]();
  await until(() => w.state.forgot > before, 'the record to be forgotten');
  assert.equal(w.state.forgot, before + 1);

  const off = world({ clearOnClose: false });
  await off.wake();
  off.state.listeners.startup[0]();
  await sleep(30);
  assert.equal(off.state.forgot, 0);
});

test('when History is emptied (Clear in History, or in Settings → Data) the delivery record goes too; a History with entries leaves it', async () => {
  const w = world();
  await w.wake();
  const change = (newValue, oldValue = w.local.scrapfly_history) => w.state.listeners.changed[0]({ scrapfly_history: { oldValue, newValue } }, 'local');
  change(EMPTY);
  assert.equal(w.state.forgot, 1);
  change(JSON.stringify({ items: [entry(1)], lastUpdated: 6 }));
  assert.equal(w.state.forgot, 1, 'one entry left: kept');
  change(undefined);
  assert.equal(w.state.forgot, 2, 'the key itself removed');
  w.state.listeners.changed[0]({ scrapfly_history: { oldValue: 'x', newValue: EMPTY } }, 'sync');
  assert.equal(w.state.forgot, 2, 'only storage.local counts');
  w.state.listeners.changed[0]({ scrapfly_settings: { newValue: '{}' } }, 'local');
  assert.equal(w.state.forgot, 2);
  await sleep(30);
});

test('a big History written by a scan is not parsed to find out whether it is empty', async () => {
  const w = world();
  await w.wake();
  let parsed = 0;
  const parse = w.ctx.HistoryStore.parse;
  w.ctx.HistoryStore.parse = (value) => { parsed += typeof value === 'string' && value.length > 1000 ? 1 : 0; return parse(value); };
  const big = JSON.stringify({ items: Array.from({ length: 50 }, (_, i) => entry(i)), lastUpdated: 7 });
  assert.ok(big.length > 1000);
  w.state.listeners.changed[0]({ scrapfly_history: { oldValue: big, newValue: big } }, 'local');
  assert.equal(parsed, 0);
  assert.equal(w.state.forgot, 0);
  await sleep(30);
});

test('a worker without the webhook runtime (or one whose clearing fails) still clears History', async () => {
  const none = world({ clearOnClose: true, deliveries: false });
  const r = await none.wake();
  assert.equal(await r.onWindowRemoved(), 8);

  const failing = world({ clearOnClose: true });
  failing.ctx.SettingsRuntime.clearWebhookLog = async () => { throw new Error('storage is full'); };
  const f = await failing.wake();
  assert.equal(await f.onWindowRemoved(), 8);
  assert.ok(!JSON.parse(failing.local.scrapfly_history).items.length);
});
