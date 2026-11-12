const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// What keeps something of a page (a scan's result, the late responses and requests added to it, a cached result served to it, the
// cookie timeline) asks Utils.isUrlBlacklisted with { failClosed: true }: while the settings cannot be read, their skip lists
// and chosen sites are not known, so every site counts as skipped there, as History, the webhook and the watchlist already do.
// What only draws a state (the popup, the badge) keeps the default answer.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

// Utils.isUrlBlacklisted as it answers while the settings cannot be read (checked against the real one below)
const unreadableSettings = async (url, { failClosed = false } = {}) => failClosed;

test('the real Utils.isUrlBlacklisted: unreadable settings are "skipped" only when asked fail-closed', async () => {
  const unreadable = Object.defineProperty({}, 'settingsUnreadable', { value: true });
  const context = vm.createContext({ Logger: { error() {}, warn() {}, debug() {} }, console, URL,
    StorageManager: { getSettings: async () => unreadable }, ScanScope: { isExcluded: () => false }, chrome: {} });
  vm.runInContext(`${read('utils/utils.js')}\nthis.Utils = Utils;`, context);
  context.Utils.applyDebugMode = () => {};
  assert.equal(await context.Utils.isUrlBlacklisted('https://site.test/', { failClosed: true }), true);
  assert.equal(await context.Utils.isUrlBlacklisted('https://site.test/'), false);
});

test('the scan\'s finish, the late responses and the late requests all ask fail-closed', () => {
  const source = read('background/detection-lifecycle.js');
  const calls = source.match(/Utils\.isUrlBlacklisted\([^)]*\)/g) || [];
  assert.equal(calls.length, 3, calls.join('\n'));
  for (const call of calls) assert.match(call, /\{ failClosed: true \}/, call);
});

// ---- A scan that finishes while the settings cannot be read keeps nothing

function lifecycle() {
  const calls = { history: [], stored: 0, webhook: 0 };
  const context = {
    MessageSender: require('../modules/core/message-sender.js'),
    WorkerMessages: require('../modules/core/worker-messages.js'),
    Map, Set, Date, Promise, AbortController, console,
    Constants: { FINALIZATION_CHECK_DELAY: 10, MIN_DETECTION_TIME: 0, BATCH_SETTLE_TIME: 0, SAFETY_TIMEOUT: 50, DETECTION_TIMEOUT: 20, COOKIE_VALUE_MAX_LENGTH: 128 },
    cachedHooksConfig: { MAX_DETECTION_MS: 100 }, getHooksDeadline: start => start + 100, ensureHooksDeadline: async state => state.hooksDeadline,
    Logger: new Proxy({}, { get: () => () => {} }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    workerKeepaliveManager: { startOperation() {}, endOperation() {} },
    detectorManager: { initialized: true, getAllDetectors: () => ({}) },
    categoryManager: {}, detectorInitializationPromise: null,
    DetectionEngineManager: { storeDetection: async (url, page, results) => { calls.stored++; return { ...page, detectionResults: results }; }, getStoredDetection: async () => null },
    UrlUtils: { normalizeFaviconForStorage: () => null, getHostnameFromUrl: () => 'example.test' },
    Utils: { getHistorySettings: async () => ({}), isUrlBlacklisted: unreadableSettings },
    HistoryRecorder: { shouldSaveToHistory: async () => true, saveDetectionToHistory: async (...args) => calls.history.push(args) },
    CategoryManager: { getBadgeColors: async () => ({}), getBadgeCountMode: async () => 'all' },
    DetectionUtils: { getBadgeColor: () => '#112233', badgeCount: require('../utils/detection-utils.js').badgeCount, readBadgeCountMode: require('../utils/detection-utils.js').readBadgeCountMode },
    Settings: { sendWebhookIfEnabled: async () => { calls.webhook++; } },
    sendProgressUpdate: () => {},
    isExtensionEnabled: async () => true,
    chrome: {
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {}, setIcon: async () => {}, setTitle: async () => {} },
      runtime: { sendMessage: async () => {} }, tabs: { sendMessage: async () => {} }, cookies: { getAll: async () => [] }
    }
  };
  for (const key of ['detectionStates', 'activeDetections', 'interruptedDetections', 'finalizationDebounce', 'batchProcessingFlags',
    'payloadStore', 'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore']) context[key] = new Map();
  vm.createContext(context);
  for (const file of ['modules/core/badge-constants.js', 'utils/page-cookies.js', 'background/detection-session-store.js', 'background/utilities.js', 'background/detection-lifecycle.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return { ctx: context, calls };
}

test('a scan that finishes while the settings cannot be read saves no result, History entry or webhook', async () => {
  const h = lifecycle();
  const state = h.ctx.DetectionSessionStore.begin(7, 'https://example.test/');
  Object.assign(state, { hooksComplete: true, mainComplete: true,
    completedMethods: new Set(['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload']),
    mainData: [{ detector: { id: 'detect-demo' }, confidence: 90, matches: [] }] });
  await h.ctx.finalizeDetection(7, state);
  assert.equal(h.calls.stored, 0, 'no cache entry');
  assert.equal(h.calls.history.length, 0);
  assert.equal(h.calls.webhook, 0);
});

// ---- A cached result is not served while the settings cannot be read

test('the page-load cache check serves no cached result while the settings cannot be read', async () => {
  const context = vm.createContext({
    Promise, Map, Set, console,
    MessageSender: require('../modules/core/message-sender.js'),
    WorkerMessages: require('../modules/core/worker-messages.js'),
    Logger: new Proxy({}, { get: () => () => {} }),
    Utils: { isUrlBlacklisted: unreadableSettings },
    DetectionEngineManager: { scansFresh: () => false, getStoredDetection: async () => ({ detectionCount: 1, detectionResults: [{ id: 'old' }] }) },
    tabsUsingCache: new Set(), recentlyClearedTabs: new Set(), chrome: {}
  });
  vm.runInContext(read('background/handlers/messages-cache.js'), context, { filename: 'messages-cache.js' });
  const registry = {};
  context.registerCacheHandlers(registry, {});
  const answer = await new Promise((resolve) => registry.CHECK_CACHE_EARLY({
    request: { url: 'https://example.test/' }, sender: { tab: { id: 7 } }, sendResponse: resolve, context: {}
  }));
  assert.equal(answer.cacheHit, false);
  assert.equal(context.tabsUsingCache.has(7), false);
});

// ---- The cookie timeline records nothing while the settings cannot be read

test('the cookie timeline records no site while the settings cannot be read', async () => {
  const had = Object.fromEntries(['chrome', 'Utils', 'ensureDetectorManagerInitialized', 'CookieTimeline', 'WorkerMessages', 'MessageSender'].map(key => [key, globalThis[key]]));
  global.CookieTimeline = require('../modules/core/cookie-timeline.js');
  global.WorkerMessages = require('../modules/core/worker-messages.js');
  global.MessageSender = require('../modules/core/message-sender.js');
  const Recorder = require('../background/cookie-timeline.js');
  const hadRecorder = Recorder.recorder;
  let onChanged;
  const data = {};
  const session = { async get(key) { return key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {}; }, async set(items) { Object.assign(data, JSON.parse(JSON.stringify(items))); } };
  globalThis.chrome = { cookies: { onChanged: { addListener: (fn) => { onChanged = fn; } } }, storage: { session } };
  globalThis.Utils = { isUrlBlacklisted: unreadableSettings };
  const detectors = { antibot: { d: { name: 'D', detection: { cookie: [{ name: '_abck' }] } } } };
  globalThis.ensureDetectorManagerInitialized = async () => ({ getAllDetectors: () => detectors, addChangeListener() {} });
  Recorder._initialized = false;
  try {
    Recorder.init();
    onChanged({ removed: false, cause: 'explicit', cookie: { name: '_abck', value: 'AAAA~0~', domain: '.shop.example.com', storeId: '0', session: true } });
    await flush();
    const shop = await Recorder.recorder.get('https://shop.example.com/');
    assert.deepEqual(shop.cookies, {}, 'not recorded');
  } finally {
    Recorder._initialized = false;
    Recorder.recorder = hadRecorder;
    for (const [key, value] of Object.entries(had)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
