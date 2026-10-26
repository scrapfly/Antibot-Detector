const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Pages the person did not see load got no scan and no badge: a page restored from the back/forward cache
// (no script runs again, the badge was reset when the tab left it) and a page Chrome prerendered (the worker
// turns away messages from a document that is not in the tab yet).

const repo = path.join(__dirname, '..');
const content = fs.readFileSync(path.join(repo, 'content.js'), 'utf8');
const fn = (name) => {
  const found = content.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(found, `${name} not found in content.js`);
  return found[0];
};

function contentPage({ prerendering = false, engine = true } = {}) {
  const listeners = [];
  const notified = [];
  const ctx = vm.createContext({
    document: { prerendering, addEventListener: (type, cb, options) => listeners.push({ type, cb, options }) },
    hasCleanedUp: false,
    detectionEngine: engine ? {} : null,
    notifyPageLoad: (source) => notified.push(source)
  });
  vm.runInContext(`${fn('whenPageShown')}\n${fn('onBackForwardRestore')}`, ctx);
  return { ctx, listeners, notified };
}

test('a prerendered page starts once it is shown, a visible one at once', () => {
  const visible = contentPage();
  let started = 0;
  visible.ctx.whenPageShown(() => started++);
  assert.equal(started, 1);

  const hidden = contentPage({ prerendering: true });
  hidden.ctx.whenPageShown(() => started++);
  assert.equal(started, 1, 'nothing while prerendering');
  assert.equal(hidden.listeners.length, 1);
  assert.equal(hidden.listeners[0].type, 'prerenderingchange');
  assert.equal(hidden.listeners[0].options.once, true);
  hidden.listeners[0].cb();
  assert.equal(started, 2);
  assert.match(content, /whenPageShown\(waitForUtilsAndInitialize\)/, 'the content script starts through it');
});

test('a page back from the back/forward cache asks the worker again', () => {
  const page = contentPage();
  page.ctx.onBackForwardRestore({ persisted: false }); // an ordinary first show
  assert.deepEqual(page.notified, []);
  page.ctx.onBackForwardRestore({ persisted: true });
  assert.deepEqual(page.notified, ['bfcache_restore']);
  const uninitialised = contentPage({ engine: false });
  uninitialised.ctx.onBackForwardRestore({ persisted: true });
  assert.deepEqual(uninitialised.notified, [], 'a page the content script never set up');
  assert.match(fn('setupDetectionTriggers'), /addEventListener\('pageshow', onBackForwardRestore\)/);
});

function worker(stored) {
  const sent = [];
  const badge = [];
  const context = {
    WorkerMessages: require(path.join(repo, 'modules/core/worker-messages.js')),
    URL, Map, Set, Promise, Date,
    PatternCache: class {}, Logger: new Proxy({}, { get: () => () => {} }),
    setTimeout: () => 1, clearTimeout: () => {}, setPausedIcon: () => {}, startBadgeSpinner: () => {},
    setBadgeTextColor: () => {},
    BADGE: { TEXT: { CLEAN: 'OK' }, COLORS: { CLEAN: '#0f0' } },
    ScrapflyBridgeProtocol: { MESSAGE_TYPES: { CACHE_HIT_DISABLE_MONITORING: 'CACHE_HIT_DISABLE_MONITORING' } },
    chrome: {
      storage: { local: { get: async () => ({ scrapfly_enabled: true }) } },
      action: { setBadgeText: async (value) => { badge.push(value.text); }, setBadgeBackgroundColor: async () => {} },
      runtime: { sendMessage: async () => {} },
      tabs: {
        get: async () => ({ id: 7, url: 'https://a.example/' }),
        sendMessage: (tabId, data, options, callback) => { sent.push(data.type); callback?.({}); return Promise.resolve(); }
      }
    }
  };
  vm.createContext(context);
  context.globalThis = context;
  for (const file of ['modules/core/constants.js', 'utils/utils.js', 'modules/detection/engine/detection-engine-manager.js'])
    vm.runInContext(fs.readFileSync(path.join(repo, file), 'utf8'), context, { filename: file });
  vm.runInContext('globalThis.Engine = DetectionEngineManager; globalThis.RealUtils = Utils;', context);
  context.Engine.getStoredDetection = async () => stored;
  context.RealUtils.isUrlBlacklisted = async () => false;
  context.RealUtils.getHistorySettings = async () => ({});
  const dependencies = { chrome: context.chrome, Utils: context.RealUtils, CategoryManager: {}, HistoryRecorder: {}, categoryManager: {}, recentDetectionRequests: new Map() };
  const run = (triggerSource) => context.Engine.handlePageLoadNotification(
    { url: 'https://a.example/', triggerSource }, { documentId: 'doc', tab: { id: 7, url: 'https://a.example/' } }, dependencies);
  return { run, sent, badge };
}

test('the worker restores a restored page\'s cached result and starts no scan for one it has none of', async () => {
  const cached = worker({ detectionCount: 0, detectionResults: [] });
  await cached.run('bfcache_restore');
  assert.deepEqual(cached.badge, ['OK'], 'the cached result is back on the badge');
  assert.ok(!cached.sent.includes('REQUEST_PAGE_DATA'));

  const uncached = worker(null);
  assert.equal((await uncached.run('bfcache_restore')).status, 'not_cached');
  assert.deepEqual(uncached.sent, [], 'no scan with the next page\'s headers');

  const load = worker(null);
  await load.run('page_load');
  assert.deepEqual(load.sent, ['REQUEST_PAGE_DATA'], 'an ordinary load still scans');
});
