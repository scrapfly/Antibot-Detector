const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The watchlist: pinned pages marked "Watch for changes" are visited again in a background tab, one at a time, and the
// entry of each is updated. The worker file runs here in a vm context with real policy and address helpers, and a
// browser that opens tabs the test controls.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

const antibot = (name) => ({ detector: { name }, category: 'Anti-Bot', confidence: 90 });
const fingerprint = (name) => ({ detector: { name }, category: 'Fingerprint', confidence: 50 });
const entry = (id, url, extra = {}) => ({ id, url, hostname: new URL(url).hostname, title: id, timestamp: 1000, detections: [antibot('Cloudflare')], pinned: true, watch: true, ...extra });

function world({ items = [], settings = {}, windows = [{ id: 7, incognito: false }], blocked = [], scans = {}, scanTimeout = 5000 } = {}) {
  const store = { scrapfly_history: JSON.stringify({ items }) };
  const log = { created: [], removed: [], bypass: [], restored: [], applied: [], alarms: new Map(), cleared: [], sleeps: [] };
  const timers = [];
  const ctx = vm.createContext({
    console, URL, Date, JSON, Math, Set, Map, Promise, setTimeout, clearTimeout,
    Logger: new Proxy({}, { get: () => () => {} }),
    Utils: {
      getHistorySettings: async () => ({ historyEnabled: true, historyExcludedDomains: [], historyWatch: 'daily', ...settings }),
      isUrlBlacklisted: async (url) => blocked.some(host => new URL(url).hostname === host)
    },
    DetectionEngineManager: { bypassCache: (url) => log.bypass.push(url), restoreCache: (url) => log.restored.push(url) },
    HistoryRecorder: { applyWatchResult: async (id, results) => { log.applied.push({ id, names: results.map(r => r.detector.name) }); return world.applyResult(id, results); } },
    chrome: {
      storage: { local: {
        get: async (keys) => Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, store[k]])),
        set: async (values) => { Object.assign(store, values); }
      } },
      windows: { getAll: async () => windows },
      runtime: { getURL: (p) => `chrome-extension://abc/${p}` },
      tabs: {
        nextId: 100,
        create: async (options) => {
          const tab = { id: ctx.chrome.tabs.nextId++, url: options.url };
          log.created.push({ ...options, id: tab.id });
          const plan = (scans[options.url] || [])[log.created.filter(c => c.url === options.url).length - 1];
          if (plan && plan.throws) throw new Error(plan.throws);
          if (plan && plan.silent) return tab; // never finishes: the check times out
          const finish = plan || { results: [antibot('Cloudflare')] };
          setTimeout(() => ctx.HistoryWatch.scanFinished(tab.id, finish.finalUrl || options.url, finish.results || []), 5);
          return tab;
        },
        remove: async (id) => { log.removed.push(id); }
      },
      alarms: {
        get: async (name) => log.alarms.get(name),
        create: (name, info) => { log.alarms.set(name, info); },
        clear: async (name) => { log.cleared.push(name); return log.alarms.delete(name); }
      }
    }
  });
  ctx.self = ctx;
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'utils/url-utils.js', 'modules/core/message-sender.js', 'modules/core/history-store.js', 'modules/core/history-policy.js', 'background/history-watch.js']) {
    vm.runInContext(read(file), ctx, { filename: file });
  }
  const Watch = ctx.HistoryWatch;
  Watch.JITTER_MS = [1, 2];
  Watch.SCAN_TIMEOUT_MS = scanTimeout;
  Watch.sleep = (ms) => { log.sleeps.push(ms); return new Promise(resolve => setTimeout(resolve, Math.min(ms, 3))); };
  world.applyResult = (id, results) => {
    const list = JSON.parse(store.scrapfly_history).items;
    const target = list.find(item => item.id === id);
    if (!target || !target.watch || !target.pinned) return { found: false, changed: false };
    const diff = ctx.HistoryPolicy.diffProtections(target.detections, results);
    return { found: true, changed: diff.changed };
  };
  return { ctx, Watch, store, log, timers, state: () => JSON.parse(store.scrapfly_state || 'null'), saved: () => store[Watch.STATE_KEY] };
}

test('no page is watched: nothing is opened, and the check is recorded', async () => {
  const w = world({ items: [entry('a', 'https://a.example/', { watch: undefined })] });
  const result = await w.Watch.run('manual');
  assert.deepEqual(plain(result), { ok: true, checked: 0, changed: 0, skipped: 0, failed: 0 });
  assert.equal(w.log.created.length, 0);
  assert.equal(w.saved().checked, 0);
  assert.equal(w.saved().trigger, 'manual');
});

test('a watched page is opened in a background tab of a normal window, scanned with its cache set aside, and the tab is closed', async () => {
  const w = world({ items: [entry('a', 'https://a.example/page')] });
  const result = await w.Watch.run('alarm');
  assert.deepEqual(plain(result), { ok: true, checked: 1, changed: 0, skipped: 0, failed: 0 });
  assert.equal(w.log.created.length, 1);
  assert.deepEqual({ url: w.log.created[0].url, active: w.log.created[0].active, windowId: w.log.created[0].windowId }, { url: 'https://a.example/page', active: false, windowId: 7 });
  assert.deepEqual(w.log.bypass, ['https://a.example/page']);
  assert.deepEqual(w.log.restored, ['https://a.example/page'], 'the cached result answers again once the check is over');
  assert.deepEqual(w.log.removed, [w.log.created[0].id]);
  assert.equal(w.Watch.isWatchTab(w.log.created[0].id), false);
  assert.deepEqual(plain(w.log.applied), [{ id: 'a', names: ['Cloudflare'] }]);
  assert.equal(w.saved().trigger, 'alarm');
});

test('while a page is checked its tab is a watch tab, so the scan pipeline knows to leave no entry of its own', async () => {
  const w = world({ items: [entry('a', 'https://a.example/')] });
  let during;
  w.ctx.chrome.tabs.create = async (options) => {
    const tab = { id: 55, url: options.url };
    during = w.Watch.isWatchTab(55);
    setTimeout(() => w.Watch.scanFinished(55, options.url, [antibot('Cloudflare')]), 5);
    return tab;
  };
  // the tab is registered after create returns: ask once the scan is under way
  const running = w.Watch.run('manual');
  await new Promise(resolve => setTimeout(resolve, 1));
  await running;
  assert.equal(during, false, 'registered just after the tab exists');
  assert.equal(w.Watch.isWatchTab(55), false, 'and forgotten when the check ends');
  w.Watch.scanFinished(999, 'https://nowhere.example/', []); // nobody is waiting: nothing happens
});

test('a page that gained a protection is applied only when a second scan agrees', async () => {
  const gained = [antibot('Cloudflare'), antibot('DataDome')];
  const agree = world({ items: [entry('a', 'https://a.example/')], scans: { 'https://a.example/': [{ results: gained }, { results: [antibot('datadome'), antibot('Cloudflare')] }] } });
  const result = await agree.Watch.run('manual');
  assert.deepEqual(plain(result), { ok: true, checked: 1, changed: 1, skipped: 0, failed: 0 });
  assert.equal(agree.log.created.length, 2, 'two scans');
  assert.deepEqual(agree.log.removed.length, 2, 'both tabs closed');
  assert.equal(agree.log.applied.length, 1);

  const flaky = world({ items: [entry('a', 'https://a.example/')], scans: { 'https://a.example/': [{ results: gained }, { results: [antibot('Cloudflare')] }] } });
  assert.deepEqual(plain(await flaky.Watch.run('manual')), { ok: true, checked: 0, changed: 0, skipped: 0, failed: 1 }, 'the second scan did not see it: a challenge that comes and goes');
  assert.equal(flaky.log.applied.length, 0);

  const other = world({ items: [entry('a', 'https://a.example/')], scans: { 'https://a.example/': [{ results: gained }, { results: [antibot('Cloudflare'), antibot('Akamai')] }] } });
  assert.equal((await other.Watch.run('manual')).failed, 1, 'a different change the second time');
  assert.equal(other.log.applied.length, 0);

  const broken = world({ items: [entry('a', 'https://a.example/')], scans: { 'https://a.example/': [{ results: gained }, { throws: 'tab refused' }] } });
  assert.equal((await broken.Watch.run('manual')).failed, 1);
  assert.equal(broken.log.applied.length, 0);
  assert.equal(broken.log.restored.length, 2, 'the cache is released whatever happens');
});

test('a protection that went away is a change too, and fingerprinting alone never is', async () => {
  const gone = world({ items: [entry('a', 'https://a.example/')], scans: { 'https://a.example/': [{ results: [] }, { results: [] }] } });
  assert.equal((await gone.Watch.run('manual')).changed, 1, 'the page lost its only protection');
  const noise = world({ items: [entry('a', 'https://a.example/')], scans: { 'https://a.example/': [{ results: [antibot('Cloudflare'), fingerprint('Canvas')] }] } });
  const result = await noise.Watch.run('manual');
  assert.equal(result.changed, 0);
  assert.equal(noise.log.created.length, 1, 'no second scan: nothing to confirm');
});

test('a page that ends somewhere else says nothing about the page, and is not compared', async () => {
  const w = world({ items: [entry('a', 'https://a.example/account')], scans: { 'https://a.example/account': [{ finalUrl: 'https://a.example/login', results: [antibot('Cloudflare'), antibot('Turnstile')] }] } });
  assert.deepEqual(plain(await w.Watch.run('manual')), { ok: true, checked: 0, changed: 0, skipped: 0, failed: 1 });
  assert.equal(w.log.applied.length, 0);
  assert.deepEqual(w.log.removed.length, 1);
  assert.equal(w.Watch.samePage('https://a.example/x?y=1#z', 'https://a.example/x'), true, 'a query and a fragment are the same page');
  assert.equal(w.Watch.samePage('https://a.example/x', 'https://a.example/y'), false);
  assert.equal(w.Watch.samePage('https://a.example/x', 'http://a.example/x'), false);
  assert.equal(w.Watch.samePage('https://a.example/x', 'https://b.example/x'), false);
});

test('a scan that never finishes is given up, a tab that cannot be opened fails, and the tab and the cache are released either way', async () => {
  const slow = world({ items: [entry('a', 'https://a.example/')], scans: { 'https://a.example/': [{ silent: true }] }, scanTimeout: 30 });
  assert.equal((await slow.Watch.run('manual')).failed, 1);
  assert.equal(slow.log.removed.length, 1);
  assert.equal(slow.log.restored.length, 1);
  assert.equal(slow.Watch.isWatchTab(slow.log.created[0].id), false);

  const refused = world({ items: [entry('a', 'https://a.example/')], scans: { 'https://a.example/': [{ throws: 'No window with id: 7' }] } });
  assert.equal((await refused.Watch.run('manual')).failed, 1);
  assert.equal(refused.log.removed.length, 0, 'there was no tab to close');
  assert.equal(refused.log.restored.length, 1);
});

test('skipped sites and sites History ignores are not visited; paused History and no open window stop the check', async () => {
  const items = [entry('a', 'https://skipped.example/'), entry('b', 'https://ignored.example/x'), entry('c', 'https://ok.example/')];
  const w = world({ items, blocked: ['skipped.example'], settings: { historyExcludedDomains: ['ignored.example'] } });
  assert.deepEqual(plain(await w.Watch.run('manual')), { ok: true, checked: 1, changed: 0, skipped: 2, failed: 0 });
  assert.deepEqual(w.log.created.map(c => c.url), ['https://ok.example/']);

  const paused = world({ items: [entry('a', 'https://a.example/')], settings: { historyEnabled: false } });
  assert.deepEqual(plain(await paused.Watch.run('manual')), { ok: false, checked: 0, changed: 0, skipped: 0, failed: 0, error: 'paused' });
  assert.equal(paused.log.created.length, 0);

  for (const windows of [[], [{ id: 3, incognito: true }]]) {
    const none = world({ items: [entry('a', 'https://a.example/')], windows });
    const result = await none.Watch.run('manual');
    assert.equal(result.error, 'no_window');
    assert.equal(result.ok, false);
    assert.equal(none.log.created.length, 0, 'a private window is not used');
    assert.equal(none.saved().error, 'no_window');
  }
});

test('the extension\'s own switch: off means no check at all (no tab opened), recorded so Settings can say why', async () => {
  const w = world({ items: [entry('a', 'https://a.example/')] });
  w.store.scrapfly_enabled = false;
  assert.deepEqual(plain(await w.Watch.run('manual')), { ok: false, checked: 0, changed: 0, skipped: 0, failed: 0, error: 'off' });
  assert.equal(w.log.created.length, 0, 'no background tab');
  assert.equal(w.saved().error, 'off');
  assert.equal(w.saved().ok, false);
  // Switched on again: the next check runs
  w.store.scrapfly_enabled = true;
  assert.equal((await w.Watch.run('manual')).ok, true);
  assert.equal(w.log.created.length, 1);
});

test('a scheduled check within 6 hours of the last one is skipped and leaves the record alone; "Check now" always runs', async () => {
  const w = world({ items: [entry('a', 'https://a.example/')] });
  const recent = { at: Date.now() - 60 * 60 * 1000, trigger: 'alarm', ok: true, checked: 1, changed: 0, skipped: 0, failed: 0 };
  w.store[w.Watch.STATE_KEY] = recent;
  for (const reason of ['alarm', 'startup']) {
    assert.deepEqual(plain(await w.Watch.run(reason)), { ok: true, checked: 0, changed: 0, skipped: 0, failed: 0, error: 'recent' }, reason);
    assert.equal(w.log.created.length, 0, `${reason}: no tab opened`);
    assert.deepEqual(plain(w.saved()), recent, `${reason}: the last check's record is untouched`);
  }
  assert.equal((await w.Watch.run('manual')).checked, 1, 'Check now runs');
  assert.equal(w.log.created.length, 1);
  // Long enough ago: the alarm runs
  w.store[w.Watch.STATE_KEY] = { ...recent, at: Date.now() - 7 * 60 * 60 * 1000 };
  assert.equal((await w.Watch.run('alarm')).checked, 1);
  assert.equal(w.log.created.length, 2);
});

test('at most ten pages are checked, the one checked longest ago first, one at a time with a pause between', async () => {
  const items = Array.from({ length: 13 }, (_, i) => entry(`p${i}`, `https://p${i}.example/`, { watchedAt: 1000 + (i % 2 ? i : 100 - i) }));
  const w = world({ items });
  const order = [];
  w.ctx.chrome.tabs.create = async (options) => {
    order.push(options.url);
    const tab = { id: 200 + order.length, url: options.url };
    setTimeout(() => w.Watch.scanFinished(tab.id, options.url, [antibot('Cloudflare')]), 1);
    return tab;
  };
  const result = await w.Watch.run('manual');
  assert.equal(result.checked, 10);
  assert.equal(order.length, 10);
  const expected = [...items].sort((a, b) => a.watchedAt - b.watchedAt).slice(0, 10).map(i => i.url);
  assert.deepEqual(order, expected);
  assert.equal(w.log.sleeps.length, 9, 'a pause before every page but the first');
  assert.ok(w.log.sleeps.every(ms => ms >= 1 && ms <= 2));
});

test('two checks at once are one: an alarm during a manual check joins it', async () => {
  const w = world({ items: [entry('a', 'https://a.example/')] });
  const first = w.Watch.run('manual');
  const second = w.Watch.run('alarm');
  assert.equal(first, second);
  await first;
  assert.equal(w.log.created.length, 1);
  assert.equal(w.Watch._running, null);
});

test('the alarm follows the mode, and a check that came due while the browser was closed is scheduled once, a little after it opens', async () => {
  const w = world();
  w.ctx.chrome.alarms.get = async (name) => w.log.alarms.get(name);
  const settingsMode = (mode) => { w.ctx.Utils.getHistorySettings = async () => ({ historyEnabled: true, historyWatch: mode }); };
  settingsMode('daily');
  await w.Watch.sync(false);
  assert.deepEqual(plain(w.log.alarms.get(w.Watch.ALARM_NAME)), { delayInMinutes: 1440, periodInMinutes: 1440 });
  settingsMode('weekly');
  await w.Watch.sync(false);
  assert.equal(w.log.alarms.get(w.Watch.ALARM_NAME).periodInMinutes, 10080, 're-timed');
  settingsMode('off');
  await w.Watch.sync(false);
  assert.ok(!w.log.alarms.has(w.Watch.ALARM_NAME));
  assert.ok(w.log.cleared.includes(w.Watch.SOON_ALARM_NAME));
  settingsMode('bogus');
  await w.Watch.sync(false);
  assert.ok(!w.log.alarms.has(w.Watch.ALARM_NAME), 'an unknown mode is off');

  settingsMode('daily');
  await w.Watch.sync(true);
  assert.deepEqual(plain(w.log.alarms.get(w.Watch.SOON_ALARM_NAME)), { delayInMinutes: 2 }, 'never checked: due');
  w.log.alarms.delete(w.Watch.SOON_ALARM_NAME);
  w.store[w.Watch.STATE_KEY] = { at: Date.now() - 3600000 };
  await w.Watch.sync(true);
  assert.ok(!w.log.alarms.has(w.Watch.SOON_ALARM_NAME), 'checked an hour ago: not due');
  w.store[w.Watch.STATE_KEY] = { at: Date.now() - 25 * 3600000 };
  await w.Watch.sync(true);
  assert.ok(w.log.alarms.has(w.Watch.SOON_ALARM_NAME), 'checked yesterday: due');
});

test('"Check now" is answered for extension pages only', async () => {
  const w = world({ items: [entry('a', 'https://a.example/')] });
  const registry = {};
  w.Watch.registerHandlers(registry);
  w.ctx.chrome.runtime.getURL = (p) => `chrome-extension://abc/${p}`;
  const call = (sender) => new Promise((resolve) => { registry[w.Watch.Messages.CHECK_NOW]({ sender, sendResponse: resolve }); });
  const refused = await call({ tab: { id: 1 }, url: 'https://evil.example/' });
  assert.equal(refused.status, 'error');
  assert.equal(w.log.created.length, 0);
  const answered = await call({ url: 'chrome-extension://abc/popup.html' });
  assert.equal(answered.status, 'ok');
  assert.equal(answered.checked, 1);
  assert.equal(w.Watch.Messages.CHECK_NOW, 'HISTORY_WATCH_NOW');
});
