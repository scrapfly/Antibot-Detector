const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// "What was checked" (the scan report) showed another tab's counts: the worker has one engine, the scan read its shared lastStats
// after matching, and matching yields every ~40 ms while the same engine runs other tabs' late-request checks, which set
// lastStats to theirs. Each detectOnPage call fills its own stats (options.stats), and the scan builds its report from those.

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function engine() {
  const context = vm.createContext({
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
    Logger: new Proxy({}, { get: (_, key) => (key === 'debugMode' ? false : () => {}) }), setTimeout, clearTimeout
  });
  context.window = context;
  for (const file of ['utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
    'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js',
    'modules/detection/detection-combinations.js', ...['analysis', 'extractors', 'matching', 'hooks', 'manager']
      .map(name => `modules/detection/engine/detection-engine-${name}.js`)]) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const instance = vm.runInContext('new DetectionEngineManager()', context);
  instance.setDetectors({ antibot: { a: { id: 'a', name: 'A', enabled: true, detection: { content: [{ text: 'vendor-a', confidence: 100 }] } } } });
  return instance;
}

test('each detectOnPage call fills its own stats, whatever another call on the same engine does meanwhile', async () => {
  const instance = engine();
  const page = {}, late = {};
  const scan = instance.detectOnPage({ url: 'https://a.example/', content: ['x', 'y', 'z'], pageHTML: 'vendor-a', dom: [{}, {}] }, { stats: page });
  const other = instance.detectOnPage({ networkUrls: [{ url: 'https://b.example/1' }] }, { stats: late });
  await Promise.all([scan, other]);
  assert.equal(page.scripts, 3);
  assert.equal(page.dom, 2);
  assert.equal(page.requests, 0);
  assert.equal(page.detectors, 1);
  assert.equal(typeof page.matchMs, 'number');
  assert.equal(late.scripts, 0);
  assert.equal(late.requests, 1);
});

function harness() {
  const context = {
    MessageSender: require('../modules/core/message-sender.js'), WorkerMessages: require('../modules/core/worker-messages.js'),
    Map, Set, Date, Promise, AbortController, console, URL,
    Constants: { FINALIZATION_CHECK_DELAY: 10, MIN_DETECTION_TIME: 0, BATCH_SETTLE_TIME: 0, SAFETY_TIMEOUT: 50, DETECTION_TIMEOUT: 1000, COOKIE_VALUE_MAX_LENGTH: 128 },
    cachedHooksConfig: { MAX_DETECTION_MS: 100 }, getHooksDeadline: start => start + 100, ensureHooksDeadline: async state => state.hooksDeadline,
    Logger: new Proxy({}, { get: () => () => {} }),
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    workerKeepaliveManager: { startOperation() {}, endOperation() {} },
    detectorManager: { initialized: true, getAllDetectors: () => ({}) }, categoryManager: {}, detectorInitializationPromise: null,
    DetectionEngineManager: { storeDetection: async () => ({}), getStoredDetection: async () => null },
    UrlUtils: { normalizeFaviconForStorage: () => null, getHostnameFromUrl: url => new URL(url).hostname },
    Utils: { getHistorySettings: async () => ({}), isUrlBlacklisted: async () => false },
    HistoryRecorder: { shouldSaveToHistory: async () => false },
    Settings: { sendWebhookIfEnabled: async () => {} },
    sendProgressUpdate: () => {}, isExtensionEnabled: async () => true, startBadgeSpinner: () => {},
    chrome: { action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {}, setIcon: async () => {}, setTitle: async () => {} }, runtime: { sendMessage: async () => {} }, tabs: { sendMessage: async () => {} }, cookies: { getAll: async () => [] } }
  };
  for (const key of ['detectionStates', 'activeDetections', 'interruptedDetections', 'finalizationDebounce', 'batchProcessingFlags',
    'payloadStore', 'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore', 'responseStore']) context[key] = new Map();
  vm.createContext(context);
  for (const file of ['modules/core/badge-constants.js', 'utils/page-cookies.js', 'background/detection-session-store.js', 'background/utilities.js', 'background/detection-lifecycle.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context;
}

test('the scan report counts this page, not what another tab\'s check left on the shared engine', async () => {
  const ctx = harness();
  // The real engine: while this page is matched, another tab's late-request check runs on it (between this scan's yields)
  const shared = engine();
  const ownDetect = shared.detectOnPage;
  shared.detectOnPage = async function (pageData, options) {
    const mine = ownDetect.call(this, pageData, options);
    await ownDetect.call(this, { networkUrls: new Array(57).fill({ url: 'https://other.example/x' }) }, { stats: {} });
    return mine;
  };
  shared.setDetectors = () => {};
  ctx.detectionEngine = shared;
  let state = null;
  const begin = ctx.DetectionSessionStore.begin;
  ctx.DetectionSessionStore.begin = (...args) => (state = begin.apply(ctx.DetectionSessionStore, args));
  ctx.checkAndFinalizeDetection = () => {};
  ctx.finalizeDetection = async () => {};
  await ctx.processDetectionData({ data: { url: 'https://page.example/', content: ['s1', 's2'], dom: [{}], pageHTML: 'vendor-a' } },
    { tab: { id: 3, url: 'https://page.example/' } });
  assert.ok(state && state.stats, 'the scan recorded its report');
  assert.equal(state.stats.scripts, 2);
  assert.equal(state.stats.dom, 1);
  assert.equal(state.stats.requests, 0, 'not the other tab\'s 57 requests');
  assert.equal(state.stats.detectors, 1);
  assert.equal(state.stats.cookies, 0);
});

test('the scan report counts the cookies the scan read: the page\'s own when the browser listed none for the site', async () => {
  const ctx = harness();
  const shared = engine();
  shared.setDetectors = () => {};
  ctx.detectionEngine = shared;
  let state = null;
  const begin = ctx.DetectionSessionStore.begin;
  ctx.DetectionSessionStore.begin = (...args) => (state = begin.apply(ctx.DetectionSessionStore, args));
  ctx.checkAndFinalizeDetection = () => {};
  ctx.finalizeDetection = async () => {};
  await ctx.processDetectionData({ data: { url: 'https://page.example/', content: [], dom: [], cookies: [{ name: 'a', value: '1' }, { name: 'b', value: '2' }] } },
    { tab: { id: 4, url: 'https://page.example/' } });
  assert.equal(state.stats.cookies, 2, 'not 0 because the site\'s cookie list came back empty');
});

test('the worker reads no shared lastStats for a report', () => {
  const src = read('background/detection-lifecycle.js');
  assert.ok(!src.includes('detectionEngine.lastStats'), 'detection-lifecycle.js reads detectionEngine.lastStats');
});
