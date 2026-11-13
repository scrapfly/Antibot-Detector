const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// With the Log collector on, every line is kept (up to 5,000 in memory, 1,000 in storage.local, where it outlives the
// browser) and can be exported. A line names the pages it is about (`shop.example: cached result reused`), so a site the
// person keeps out of records must not be named there: the sites History is told not to record, the sites skipped in
// Settings → Detection → Sites, and the pages open in a private window. The line stays, with the site's name left out.

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const HIDDEN = '[hidden site]';

function events() {
  const listeners = [];
  return { listeners, addListener: (fn) => listeners.push(fn), emit: (...args) => Promise.all(listeners.map(fn => fn(...args))) };
}

// `tabs`: what chrome.tabs.query answers; `noTabs`: a browser object with no tabs API; `queryFails`: a query that rejects
function harness(settings = {}, { tabs = [], noTabs = false, queryFails = false } = {}) {
  const state = { settings: { logCollectorEnabled: true, logCollectorMaxLogs: 5000, ...settings }, writes: [], timers: [], tabs };
  const noop = () => {};
  const storageChanged = events(), created = events(), updated = events(), removed = events();
  const ctx = vm.createContext({
    URL,
    DomainList: require('../modules/core/domain-list.js'),
    Constants: { LOG_COLLECTOR_MAX_LOGS: 5000, LOG_COLLECTOR_MAX_PERSISTED: 500, LOG_COLLECTOR_RATE_LIMIT: 100000 },
    Logger: { error: noop, debug: noop, warn: noop },
    console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
    chrome: {
      runtime: {},
      storage: {
        local: {
          get(keys, callback) { callback({ scrapfly_settings: { settings: state.settings } }); },
          set(value) { state.writes.push(value); return Promise.resolve(); },
          async remove() {}
        },
        onChanged: storageChanged
      },
      ...(noTabs ? {} : { tabs: { onCreated: created, onUpdated: updated, onRemoved: removed, query: async () => { if (queryFails) throw new Error('no tabs'); return state.tabs; } } })
    },
    StorageManager: { async patchSettings() { return true; }, async readSettingsStrict() { return state.settings; } },
    setTimeout: (fn) => { state.timers.push(fn); return state.timers.length; },
    clearTimeout() {}
  });
  ctx.self = ctx;
  ctx.importScripts = noop;
  vm.runInContext(read('modules/core/log-collector.js'), ctx, { filename: 'log-collector.js' });
  const collector = ctx.logCollector;
  const lines = () => Array.from(collector._getOrderedLogs(), entry => entry.message);
  const persist = () => { const fire = state.timers.splice(0); fire.forEach(fn => fn()); const last = state.writes.at(-1); return last ? Array.from(last.scrapfly_collected_logs, entry => entry.message) : []; };
  const change = async (next) => {
    state.settings = { ...state.settings, ...next };
    await storageChanged.emit({ scrapfly_settings: { newValue: { settings: state.settings } } }, 'local');
    await Promise.resolve();
  };
  return { collector, ctx, state, lines, persist, change, created, updated, removed, ready: async () => { await collector.initPromise; await new Promise(resolve => setImmediate(resolve)); } };
}

test('a site History is told not to record is not named in a collected line, in memory, in storage or in an export', async () => {
  const h = harness({ history: { historyExcludedDomains: ['Bank.Example', 'https://crm.corp.example/path'] } });
  await h.ready();
  h.collector.addLog('info', ['[13:22:45.856] bg/detection  bank.example: cached result reused']);
  h.collector.addLog('info', ['[13:22:46.001] bg/scan  www.bank.example: 7 detections in 4.6 s']);
  h.collector.addLog('info', ['[13:22:46.500] bg/scan  login.BANK.example: excluded domain, scan results not kept']);
  h.collector.addLog('warn', ['Scan failed on crm.corp.example (timeout)']);
  h.collector.addLog('info', ['[13:22:47.000] bg/detection  shop.example: 3 detections in 1.2 s']);
  assert.deepEqual(h.lines(), [
    `[13:22:45.856] bg/detection  ${HIDDEN}: cached result reused`,
    `[13:22:46.001] bg/scan  ${HIDDEN}: 7 detections in 4.6 s`,
    `[13:22:46.500] bg/scan  ${HIDDEN}: excluded domain, scan results not kept`,
    `Scan failed on ${HIDDEN} (timeout)`,
    '[13:22:47.000] bg/detection  shop.example: 3 detections in 1.2 s'
  ]);
  const stored = h.persist();
  assert.equal(stored.length, 5);
  assert.ok(!/bank\.example|corp\.example/i.test(stored.join('\n')), 'nothing of it reaches storage.local');
});

test('only the site and its subdomains are hidden: a site that merely ends or starts with the same letters is not', async () => {
  const h = harness({ history: { historyExcludedDomains: ['bank.example'] } });
  await h.ready();
  for (const text of ['notbank.example: ok', 'bank.example.org: ok', 'bank.examples: ok', 'xbank.example: ok', 'bank-example: ok', 'file bank.example.js:12']) h.collector.addLog('info', [text]);
  assert.deepEqual(h.lines(), ['notbank.example: ok', 'bank.example.org: ok', 'bank.examples: ok', 'xbank.example: ok', 'bank-example: ok', 'file bank.example.js:12']);
  h.collector.addLog('info', ['on bank.example. Then www.bank.example, (bank.example) and bank.example/path']);
  assert.equal(h.lines().at(-1), `on ${HIDDEN}. Then ${HIDDEN}, (${HIDDEN}) and ${HIDDEN}/path`);
});

test('a skipped site is not named either; in "only these sites" mode the list of skipped sites is not in use', async () => {
  const h = harness({ detection: { scanMode: 'blocklist', blacklistedDomains: ['skipped.example'] } });
  await h.ready();
  h.collector.addLog('info', ['skipped.example: excluded domain, not scanned']);
  h.collector.addLog('info', ['other.example: excluded domain, not scanned']);
  assert.deepEqual(h.lines(), [`${HIDDEN}: excluded domain, not scanned`, 'other.example: excluded domain, not scanned']);

  const allow = harness({ detection: { scanMode: 'allowlist', blacklistedDomains: ['skipped.example'], allowedDomains: ['chosen.example'] } });
  await allow.ready();
  allow.collector.addLog('info', ['skipped.example: x']);
  assert.deepEqual(allow.lines(), ['skipped.example: x']);

  // the list an older version kept at the top of the settings
  const legacy = harness({ blacklistedDomains: ['old.example'] });
  await legacy.ready();
  legacy.collector.addLog('info', ['old.example: x']);
  assert.deepEqual(legacy.lines(), [`${HIDDEN}: x`]);
});

test('the lists follow the settings as they are saved, without a reload', async () => {
  const h = harness();
  await h.ready();
  h.collector.addLog('info', ['later.example: before']);
  await h.change({ history: { historyExcludedDomains: ['later.example'] } });
  h.collector.addLog('info', ['later.example: after']);
  await h.change({ history: { historyExcludedDomains: [] } });
  h.collector.addLog('info', ['later.example: again']);
  assert.deepEqual(h.lines(), ['later.example: before', `${HIDDEN}: after`, 'later.example: again']);
});

test('a page open in a private window is not named while its tab is open; a normal tab\'s site always is', async () => {
  const h = harness({}, { tabs: [{ id: 1, incognito: true, url: 'https://secret.example/inbox' }, { id: 2, incognito: false, url: 'https://open.example/' }] });
  await h.ready();
  h.collector.addLog('info', ['secret.example: cached result reused']);
  h.collector.addLog('info', ['open.example: cached result reused']);
  assert.deepEqual(h.lines(), [`${HIDDEN}: cached result reused`, 'open.example: cached result reused'], 'a tab that was open when the worker started');

  const url = 'https://later-secret.example/a';
  h.created.emit({ id: 3, incognito: true, url: '' });
  h.collector.addLog('info', ['later-secret.example: before its address is known']);
  h.updated.emit(3, { url }, { id: 3, incognito: true, url });
  h.collector.addLog('info', ['later-secret.example: loaded']);
  h.updated.emit(4, { url: 'https://normal.example/' }, { id: 4, incognito: false, url: 'https://normal.example/' });
  h.collector.addLog('info', ['normal.example: loaded']);
  assert.deepEqual(h.lines().slice(2), ['later-secret.example: before its address is known', `${HIDDEN}: loaded`, 'normal.example: loaded']);

  // the tab goes somewhere else: the page it left is no longer open in a private window
  h.updated.emit(3, { url: 'https://moved.example/' }, { id: 3, incognito: true, url: 'https://moved.example/' });
  h.collector.addLog('info', ['later-secret.example: left behind']);
  h.collector.addLog('info', ['moved.example: here']);
  assert.deepEqual(h.lines().slice(-2), ['later-secret.example: left behind', `${HIDDEN}: here`]);

  // closed: the site is a site like any other again
  h.removed.emit(3);
  h.removed.emit(1);
  h.collector.addLog('info', ['moved.example: gone']);
  h.collector.addLog('info', ['secret.example: gone']);
  assert.deepEqual(h.lines().slice(-2), ['moved.example: gone', 'secret.example: gone']);
});

test('two private tabs on one site: it stays hidden until both are closed', async () => {
  const h = harness({}, { tabs: [{ id: 1, incognito: true, url: 'https://twin.example/a' }, { id: 2, incognito: true, url: 'https://twin.example/b' }] });
  await h.ready();
  h.removed.emit(1);
  h.collector.addLog('info', ['twin.example: one left']);
  h.removed.emit(2);
  h.collector.addLog('info', ['twin.example: both left']);
  assert.deepEqual(h.lines(), [`${HIDDEN}: one left`, 'twin.example: both left']);
});

test('what is saved to storage.local and what an export reads is the masked line, whatever happens to the lists later', async () => {
  const h = harness({}, { tabs: [{ id: 1, incognito: true, url: 'https://secret.example/' }] });
  await h.ready();
  h.collector.addLog('info', ['secret.example: scanned']);
  h.collector.addLog('error', ['Scan failed on secret.example']);
  h.removed.emit(1);
  const stored = h.persist();
  assert.deepEqual(stored, [`${HIDDEN}: scanned`, `Scan failed on ${HIDDEN}`]);
  assert.ok(!JSON.stringify(h.collector._getOrderedLogs()).includes('secret.example'));
});

test('the lines of console.warn and console.error the collector intercepts are masked like the rest', async () => {
  const h = harness({ history: { historyExcludedDomains: ['bank.example'] } });
  await h.ready();
  h.ctx.console.warn('Webhook failed for bank.example');
  h.ctx.console.error('Scan failed on bank.example');
  assert.deepEqual(h.lines(), [`Webhook failed for ${HIDDEN}`, `Scan failed on ${HIDDEN}`]);
});

test('without tabs, an unreadable list or odd settings, lines are kept as they are and nothing throws', async () => {
  const bare = harness({ history: { historyExcludedDomains: 'not a list' }, detection: { blacklistedDomains: { a: 1 } } }, { noTabs: true });
  await bare.ready();
  bare.collector.addLog('info', ['any.example: fine', 'not a list: fine']);
  assert.deepEqual(bare.lines(), ['any.example: fine not a list: fine']);
  const failing = harness({}, { queryFails: true });
  await failing.ready();
  failing.collector.addLog('info', ['any.example: fine']);
  assert.deepEqual(failing.lines(), ['any.example: fine']);
});
