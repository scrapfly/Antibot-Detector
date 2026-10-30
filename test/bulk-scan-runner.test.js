const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Bulk scan in the service worker: the run lives there, opens one inactive background tab at a time through the
// watchlist's machinery (BackgroundTabScan), keeps its state in session storage, and a worker that starts again marks a
// run it finds running as stopped. The worker files run here in a vm context with a browser the test controls.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));

const FILES = ['modules/core/worker-messages.js', 'modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js',
  'modules/core/message-sender.js', 'modules/core/bulk-scan.js', 'background/background-tab-scan.js', 'background/bulk-scan-runner.js'];

/**
 * @param {object} options
 *   scans: url -> { results, finalUrl, silent (never finishes), excluded, loadError, delay }
 *   session: a shared session store (a worker restart keeps it)
 */
function world({ scans = {}, settings = {}, windows = [{ id: 3, incognito: false }], enabled = true, session = {} } = {}) {
  const local = { scrapfly_enabled: enabled };
  const log = { created: [], removed: [], open: new Set(), maxOpen: 0, bypass: [], restored: [], keepalive: [] };
  const errorListeners = [];
  const ctx = vm.createContext({
    console, URL, Date, JSON, Math, Set, Map, Promise, setTimeout, clearTimeout,
    Logger: new Proxy({}, { get: () => () => {} }),
    Utils: { getSettings: async () => ({ detection: { scanMode: 'blocklist', blacklistedDomains: [], allowedDomains: [], ...settings } }) },
    DetectionEngineManager: { bypassCache: (url) => log.bypass.push(url), restoreCache: (url) => log.restored.push(url) },
    DetectionUtils: { getDifficultyLevel: (results) => (results.length > 1 ? 'High' : 'Medium') },
    workerKeepaliveManager: { startOperation: (id) => log.keepalive.push(['start', id]), endOperation: (id) => log.keepalive.push(['end', id]) },
    chrome: {
      runtime: { getURL: (p) => `chrome-extension://abc/${p}` },
      storage: {
        local: { get: async (keys) => Object.fromEntries([].concat(keys).filter(k => k in local).map(k => [k, local[k]])), set: async (v) => { Object.assign(local, v); } },
        session: {
          get: async (key) => (key in session ? { [key]: plain(session[key]) } : {}),
          set: async (values) => { Object.assign(session, plain(values)); },
          remove: async (key) => { delete session[key]; }
        }
      },
      windows: { getAll: async () => windows },
      webNavigation: { onErrorOccurred: { addListener: (fn) => errorListeners.push(fn) } },
      tabs: {
        nextId: 500,
        create: async (options) => {
          const tab = { id: ctx.chrome.tabs.nextId++, url: options.url };
          log.created.push({ ...options, id: tab.id });
          log.open.add(tab.id);
          log.maxOpen = Math.max(log.maxOpen, log.open.size);
          const plan = scans[options.url] || {};
          if (!plan.silent) {
            setTimeout(() => {
              if (plan.loadError) errorListeners.forEach(fn => fn({ tabId: tab.id, frameId: 0, error: plan.loadError }));
              else ctx.BackgroundTabScan.scanFinished(tab.id, plan.finalUrl || options.url, plan.results || [], plan.excluded ? { excluded: true } : {});
            }, plan.delay || 3);
          }
          return tab;
        },
        remove: async (id) => { log.removed.push(id); log.open.delete(id); }
      }
    }
  });
  ctx.self = ctx;
  for (const file of FILES) vm.runInContext(read(file), ctx, { filename: file });
  const Runner = ctx.BulkScanRunner;
  Runner.GAP_MS = 1;
  ctx.BackgroundTabScan.init();
  Runner.init();
  return { ctx, Runner, Tabs: ctx.BackgroundTabScan, log, local, session, stored: () => session[Runner.STATE_KEY] };
}

const found = (...names) => names.map(name => ({ detector: { name }, category: 'Anti-Bot', confidence: 90 }));
const finished = async (w) => { while (w.Runner._loop) await w.Runner._loop; };

test('a list is scanned one page at a time in inactive tabs of a normal window, each tab closed, the run done', async () => {
  const w = world({ scans: { 'https://a.example/': { results: found('Cloudflare', 'DataDome') }, 'https://b.example/': { results: [] } } });
  const started = await w.Runner.start({ entries: ['https://a.example/', 'b.example', 'https://a.example/#dup', 'mailto:x@y.example'], timeoutSec: 20 });
  assert.equal(started.ok, true);
  await finished(w);
  assert.deepEqual(w.log.created.map(c => [c.url, c.active, c.windowId]), [['https://a.example/', false, 3], ['https://b.example/', false, 3]]);
  assert.equal(w.log.maxOpen, 1, 'never more than one scan tab at a time');
  assert.deepEqual(w.log.removed, w.log.created.map(c => c.id), 'every tab closed');
  assert.deepEqual(w.log.bypass, w.log.restored, 'the cache is set aside for each page and restored after');
  const run = w.stored();
  assert.equal(run.status, 'done');
  assert.equal(run.duplicates, 1);
  assert.deepEqual(run.items.map(i => [i.url, i.status, i.reason || '']), [
    ['https://a.example/', 'done', ''], ['https://b.example/', 'done', ''], ['mailto:x@y.example', 'skipped', 'scheme']
  ]);
  assert.deepEqual(plain(run.items[0].detections.map(d => [d.name, d.category])), [['Cloudflare', 'antibot'], ['DataDome', 'antibot']]);
  assert.equal(run.items[0].difficulty, 'High');
  assert.deepEqual(w.log.keepalive, [['start', 'bulk-scan'], ['end', 'bulk-scan']], 'the worker is kept awake for the run only');
  assert.deepEqual(w.session[w.Tabs.OPEN_TABS_KEY], [], 'no scan tab left listed');
});

test('the "Sites to scan" setting: skipped sites are listed with the reason at start, during the run, and when a page ends on one', async () => {
  const w = world({
    settings: { blacklistedDomains: ['skip.example'] },
    scans: { 'https://a.example/': { results: [] }, 'https://redirects.example/': { excluded: true, finalUrl: 'https://skip.example/' }, 'https://later.example/': { results: [] } }
  });
  await w.Runner.start({ entries: ['https://skip.example/', 'https://a.example/', 'https://redirects.example/', 'https://later.example/'] });
  // The person skips later.example while the run goes on
  w.ctx.Utils.getSettings = async () => ({ detection: { scanMode: 'blocklist', blacklistedDomains: ['skip.example', 'later.example'] } });
  await finished(w);
  assert.deepEqual(w.stored().items.map(i => [i.url, i.status, i.reason || '']), [
    ['https://skip.example/', 'skipped', 'scope'], ['https://a.example/', 'done', ''],
    ['https://redirects.example/', 'skipped', 'scope'], ['https://later.example/', 'skipped', 'scope']
  ]);
  assert.equal(w.log.created.some(c => c.url === 'https://later.example/' || c.url === 'https://skip.example/'), false, 'skipped sites are never opened');
});

test('"only these sites" mode skips every site that is not chosen', async () => {
  const w = world({ settings: { scanMode: 'allowlist', allowedDomains: ['ok.example'] }, scans: { 'https://www.ok.example/': { results: [] } } });
  await w.Runner.start({ entries: ['https://www.ok.example/', 'https://other.example/'] });
  await finished(w);
  assert.deepEqual(w.stored().items.map(i => [i.url, i.status, i.reason || '']), [['https://www.ok.example/', 'done', ''], ['https://other.example/', 'skipped', 'scope']]);
});

test('a page past the time limit, or one that does not load, fails with the reason and its tab is closed', async () => {
  const w = world({ scans: { 'https://slow.example/': { silent: true }, 'https://gone.example/': { loadError: 'net::ERR_NAME_NOT_RESOLVED' }, 'https://ok.example/': { results: [] } } });
  await w.Runner.start({ entries: ['https://slow.example/', 'https://gone.example/', 'https://ok.example/'], timeoutSec: 10 });
  w.Runner._run.timeoutSec = 0.03; // 30 ms for the test
  await finished(w);
  assert.deepEqual(w.stored().items.map(i => [i.status, i.reason || '']), [['failed', 'timeout'], ['failed', 'load'], ['done', '']]);
  assert.equal(w.log.open.size, 0);
});

test('a load error the page replaced with another navigation is not a failure', async () => {
  const w = world({ scans: { 'https://a.example/': { silent: true } } });
  await w.Runner.start({ entries: ['https://a.example/'] });
  await tick(10);
  const tabId = w.log.created[0].id;
  w.Tabs.loadFailed({ tabId, frameId: 0, error: 'net::ERR_ABORTED' });
  w.Tabs.loadFailed({ tabId, frameId: 3, error: 'net::ERR_FAILED' });
  await tick(10);
  assert.equal(w.stored().items[0].status, 'scanning');
  w.Tabs.scanFinished(tabId, 'https://a.example/', found('Akamai'));
  await finished(w);
  assert.equal(w.stored().items[0].status, 'done');
});

test('pause lets the page being scanned finish and starts no other; resume goes on', async () => {
  const w = world({ scans: { 'https://a.example/': { results: [], delay: 20 }, 'https://b.example/': { results: [] } } });
  await w.Runner.start({ entries: ['https://a.example/', 'https://b.example/'] });
  await tick(5);
  assert.equal(await w.Runner.pause(), true);
  await tick(60);
  assert.equal(w.stored().status, 'paused');
  assert.deepEqual(w.stored().items.map(i => i.status), ['done', 'waiting']);
  assert.equal(w.log.created.length, 1);
  assert.equal(await w.Runner.resume(), true);
  await finished(w);
  assert.equal(w.stored().status, 'done');
  assert.deepEqual(w.stored().items.map(i => i.status), ['done', 'done']);
});

test('stop closes the scan tab at once; the page being scanned and the rest stay waiting; the run can be cleared', async () => {
  const w = world({ scans: { 'https://a.example/': { silent: true } } });
  await w.Runner.start({ entries: ['https://a.example/', 'https://b.example/'], timeoutSec: 120 });
  await tick(10);
  assert.equal(w.log.open.size, 1);
  assert.equal(await w.Runner.clear(), false, 'a running run is not cleared');
  assert.equal(await w.Runner.stop(), true);
  await finished(w);
  assert.equal(w.log.open.size, 0, 'the tab is closed without waiting for the time limit');
  assert.equal(w.stored().status, 'stopped');
  assert.equal(w.stored().reason, 'user');
  assert.deepEqual(w.stored().items.map(i => i.status), ['waiting', 'waiting']);
  assert.equal(w.log.created.length, 1, 'nothing opened after Stop');
  assert.equal(await w.Runner.clear(), true);
  assert.equal(w.stored(), undefined);
});

test('stop while paused ends the run without opening anything', async () => {
  const w = world({ scans: { 'https://a.example/': { results: [] } } });
  await w.Runner.start({ entries: ['https://a.example/', 'https://b.example/'] });
  await w.Runner.pause();
  await tick(20);
  await w.Runner.stop();
  await finished(w);
  assert.equal(w.stored().status, 'stopped');
  assert.equal(w.log.created.length, 0, 'paused before the first page opened: nothing ever opened');
  assert.deepEqual(w.stored().items.map(i => i.status), ['waiting', 'waiting']);
});

test('a worker that starts again marks a running run stopped (not stuck) and closes the scan tab it left', async () => {
  const session = {};
  const first = world({ session, scans: { 'https://a.example/': { silent: true } } });
  await first.Runner.start({ entries: ['https://a.example/', 'https://b.example/'] });
  await tick(10);
  assert.equal(session[first.Runner.STATE_KEY].status, 'running');
  assert.deepEqual(session[first.Tabs.OPEN_TABS_KEY], [first.log.created[0].id]);
  // Chrome stops the worker: its timers and loop are gone, session storage stays
  const second = world({ session });
  const run = await second.Runner.state();
  assert.equal(run.status, 'stopped');
  assert.equal(run.reason, 'restart');
  assert.deepEqual(run.items.map(i => i.status), ['waiting', 'waiting']);
  assert.equal(session[second.Runner.STATE_KEY].status, 'stopped', 'saved, so a reopened page shows it stopped');
  await tick(5);
  assert.deepEqual(second.log.removed, [first.log.created[0].id], 'the leftover scan tab is closed');
  assert.equal((await second.Runner.start({ entries: ['https://c.example/'] })).ok, true, 'a new run can start');
  // The old worker is gone: drop its pending timer so the test ends
  first.Tabs.cancel(first.Runner._token);
  first.Runner._run = null;
  await second.Runner.stop();
  await finished(second);
});

test('start refuses a second run, a switched-off extension and a browser with no window; a list with nothing to scan is done at once', async () => {
  const w = world({ scans: { 'https://a.example/': { silent: true } } });
  await w.Runner.start({ entries: ['https://a.example/'] });
  assert.equal((await w.Runner.start({ entries: ['https://b.example/'] })).error, 'busy');
  await w.Runner.stop();
  await finished(w);

  const off = world({ enabled: false });
  assert.equal((await off.Runner.start({ entries: ['https://a.example/'] })).error, 'off');
  assert.equal(off.log.created.length, 0);

  const windowless = world({ windows: [{ id: 1, incognito: true }] });
  assert.equal((await windowless.Runner.start({ entries: ['https://a.example/'] })).error, 'no_window', 'a private window is never used');

  const empty = world();
  const result = await empty.Runner.start({ entries: ['ftp://a.example/', 'nonsense'] });
  assert.equal(result.error, 'empty');
  assert.equal(empty.stored().status, 'done');
  assert.equal(empty.log.created.length, 0);
});

test('switching the extension off during a run stops it', async () => {
  const w = world({ scans: { 'https://a.example/': { results: [] } } });
  await w.Runner.start({ entries: ['https://a.example/', 'https://b.example/'] });
  w.local.scrapfly_enabled = false;
  await finished(w);
  assert.equal(w.stored().status, 'stopped');
  assert.equal(w.stored().reason, 'off');
  assert.deepEqual(w.stored().items.map(i => i.status), ['done', 'waiting']);
});

test('the messages are answered for extension pages only', async () => {
  const w = world({ scans: { 'https://a.example/': { results: [] } } });
  const registry = {};
  w.Runner.registerHandlers(registry);
  const call = (type, sender, request = {}) => new Promise(resolve => { registry[type]({ request: { type, ...request }, sender, sendResponse: resolve }); });
  const M = w.ctx.WorkerMessages;
  for (const type of [M.BULK_SCAN_START, M.BULK_SCAN_PAUSE, M.BULK_SCAN_RESUME, M.BULK_SCAN_STOP, M.BULK_SCAN_STATE, M.BULK_SCAN_CLEAR]) {
    const refused = await call(type, { tab: { id: 9 }, url: 'https://evil.example/' }, { entries: ['https://a.example/'] });
    assert.equal(refused.status, 'error', type);
  }
  assert.equal(w.log.created.length, 0, 'a web page cannot start a run');
  const page = { url: 'chrome-extension://abc/sections/bulk/bulk.html', tab: { id: 4 } };
  const started = await call(M.BULK_SCAN_START, page, { entries: ['https://a.example/'] });
  assert.equal(started.status, 'ok');
  await finished(w);
  const state = await call(M.BULK_SCAN_STATE, page);
  assert.equal(state.run.status, 'done');
});

test('"Scan the pages still waiting" goes on with the stopped run: the finished pages stay in the list with their results', async () => {
  const w = world({ scans: {
    'https://a.example/': { results: found('Cloudflare') }, 'https://b.example/': { results: found('DataDome', 'Kasada'), delay: 30 },
    'https://c.example/': { results: [] }, 'https://d.example/': { results: found('Akamai') } } });
  await w.Runner.start({ entries: ['https://a.example/', 'https://b.example/', 'https://c.example/', 'https://d.example/', 'mailto:x@y.example'] });
  while (w.stored().items[0].status !== 'done') await tick(2);
  await w.Runner.stop();
  await finished(w);
  const stopped = w.stored();
  assert.equal(stopped.status, 'stopped');
  assert.deepEqual(stopped.items.map(i => i.status), ['done', 'waiting', 'waiting', 'waiting', 'skipped']);

  // The page sends the waiting addresses too, but the run's own state is what counts
  const again = await w.Runner.start({ entries: ['https://not-in-the-run.example/'], continueRun: true });
  assert.equal(again.ok, true);
  await finished(w);
  const run = w.stored();
  assert.equal(run.status, 'done');
  assert.deepEqual(run.items.map(i => [i.url, i.status]), [
    ['https://a.example/', 'done'], ['mailto:x@y.example', 'skipped'],
    ['https://b.example/', 'done'], ['https://c.example/', 'done'], ['https://d.example/', 'done']
  ], 'the finished and the skipped pages first, then the ones scanned now');
  assert.deepEqual(plain(run.items[0].detections.map(d => d.name)), ['Cloudflare'], 'a finished page keeps its result');
  assert.deepEqual(plain(w.ctx.BulkScan.counts(run)), { total: 5, waiting: 0, scanning: 0, done: 4, failed: 0, skipped: 1, found: 3 });
  assert.equal(w.log.created.filter(c => c.url === 'https://a.example/').length, 1, 'a page that was done is not scanned again');
  assert.ok(!w.log.created.some(c => c.url === 'https://not-in-the-run.example/'), 'only what the run left waiting is scanned');
});

test('a start without continueRun still replaces the run, and a run that is not over or has nothing waiting cannot be continued', async () => {
  const w = world({ scans: { 'https://a.example/': { results: [] }, 'https://b.example/': { results: [] }, 'https://c.example/': { results: [] } } });
  await w.Runner.start({ entries: ['https://a.example/', 'https://b.example/'] });
  await finished(w);
  assert.equal(w.stored().status, 'done');
  // Nothing waits: continueRun falls back to the entries it was sent
  const fresh = await w.Runner.start({ entries: ['https://c.example/'], continueRun: true });
  assert.equal(fresh.ok, true);
  await finished(w);
  assert.deepEqual(w.stored().items.map(i => i.url), ['https://c.example/'], 'nothing to carry over: a plain new run');
  // Without the flag the earlier results are replaced, as before
  await w.Runner.start({ entries: ['https://a.example/'] });
  await finished(w);
  assert.deepEqual(w.stored().items.map(i => i.url), ['https://a.example/']);
});

test('"Scan the failed pages again" scans the pages that failed, keeps the finished ones with their results, and leaves the done pages alone', async () => {
  const scans = { 'https://a.example/': { results: found('Cloudflare') }, 'https://b.example/': { loadError: 'net::ERR_CONNECTION_RESET' }, 'https://c.example/': { results: [] } };
  const w = world({ scans });
  await w.Runner.start({ entries: ['https://a.example/', 'https://b.example/', 'https://c.example/'] });
  await finished(w);
  assert.deepEqual(w.stored().items.map(i => [i.url, i.status]), [['https://a.example/', 'done'], ['https://b.example/', 'failed'], ['https://c.example/', 'done']]);
  assert.equal(w.stored().status, 'done');
  const createdBefore = w.log.created.length;
  scans['https://b.example/'] = { results: found('DataDome') }; // the site answers this time
  const again = await w.Runner.start({ entries: [], continueRun: true, retryFailed: true });
  assert.equal(again.ok, true);
  await finished(w);
  const run = w.stored();
  assert.deepEqual(run.items.map(i => [i.url, i.status]), [['https://a.example/', 'done'], ['https://c.example/', 'done'], ['https://b.example/', 'done']], 'the finished pages first, the retried one after');
  assert.deepEqual(plain(run.items[0].detections.map(d => d.name)), ['Cloudflare'], 'a finished page keeps its result');
  assert.deepEqual(plain(run.items[2].detections.map(d => d.name)), ['DataDome']);
  assert.deepEqual(w.log.created.slice(createdBefore).map(c => c.url), ['https://b.example/'], 'only the failed page was opened again');
  // Without retryFailed the same request only continues what waits: nothing, so it is a plain new run of its entries
  const plainStart = await w.Runner.start({ entries: ['https://c.example/'], continueRun: true });
  assert.equal(plainStart.ok, true);
  await finished(w);
  assert.deepEqual(w.stored().items.map(i => i.url), ['https://c.example/']);
});

