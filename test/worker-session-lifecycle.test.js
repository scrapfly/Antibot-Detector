const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function harness() {
  let nextTimer = 0;
  const timers = new Map();
  const calls = { badge: [], popup: [], page: [], history: [], ended: [], started: [] };
  const context = {
    Map, Set, Date, Promise, AbortController, console,
    Constants: { FINALIZATION_CHECK_DELAY: 10, MIN_DETECTION_TIME: 0, BATCH_SETTLE_TIME: 0, SAFETY_TIMEOUT: 50,
      DETECTION_TIMEOUT: 20, COOKIE_VALUE_MAX_LENGTH: 128 },
    cachedHooksConfig: { MAX_DETECTION_MS: 100 },
    getHooksDeadline: start => start + 100,
    ensureHooksDeadline: async state => state.hooksDeadline,
    Logger: new Proxy({}, { get: () => () => {} }),
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearInterval: id => timers.delete(id),
    workerKeepaliveManager: { startOperation: id => calls.started.push(id), endOperation: id => calls.ended.push(id) },
    detectorManager: { initialized: true, getAllDetectors: () => ({}) },
    categoryManager: {}, detectorInitializationPromise: null,
    DetectionEngineManager: { storeDetection: async (url, page, results) => ({ ...page, detectionResults: results }), getStoredDetection: async () => null },
    UrlUtils: { normalizeFaviconForStorage: () => null, getHostnameFromUrl: () => 'example.test' },
    Utils: { getHistorySettings: async () => ({}), isUrlBlacklisted: async () => false },
    HistoryRecorder: { shouldSaveToHistory: async () => true, saveDetectionToHistory: async (...args) => calls.history.push(args) },
    CategoryManager: { getBadgeColors: async () => ({}) },
    DetectionUtils: { getBadgeColor: () => '#112233' },
    Settings: { sendWebhookIfEnabled: async () => {} },
    sendProgressUpdate: () => {},
    isExtensionEnabled: async () => true,
    chrome: {
      action: { setBadgeText: async value => calls.badge.push(value), setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {}, setIcon: async () => {} },
      runtime: { sendMessage: async value => calls.popup.push(value) },
      tabs: { sendMessage: async (_tab, value) => calls.page.push(value) },
      cookies: { getAll: async () => [] }
    }
  };
  for (const key of ['detectionStates', 'activeDetections', 'interruptedDetections', 'finalizationDebounce', 'batchProcessingFlags',
    'payloadStore', 'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore']) context[key] = new Map();
  vm.createContext(context);
  for (const file of ['modules/core/badge-constants.js', 'background/detection-session-store.js', 'background/utilities.js', 'background/detection-lifecycle.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const begin = (url = 'https://example.test/') => {
    const state = context.DetectionSessionStore.begin(7, url);
    state.hooksComplete = true;
    state.mainComplete = true;
    state.completedMethods = new Set(['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload']);
    state.mainData = [{ detector: { id: 'detect-demo' }, confidence: 90, matches: [] }];
    return state;
  };
  return { ctx: context, calls, timers, begin };
}

for (const boundary of ['late requests', 'cache write', 'badge settings', 'history settings']) {
  test(`a superseded finalizer cannot repaint or delete its replacement after ${boundary}`, async () => {
    const h = harness();
    const gate = deferred();
    const arrived = deferred();
    const wait = async value => { arrived.resolve(); await gate.promise; return value; };
    if (boundary === 'late requests') {
      h.ctx.networkUrlsStore.set(7, [{ url: 'https://example.test/sdk' }]);
      h.ctx.detectionEngine = { detectOnPage: () => wait([]) };
    }
    if (boundary === 'cache write') h.ctx.DetectionEngineManager.storeDetection = () => wait({});
    if (boundary === 'badge settings') h.ctx.CategoryManager.getBadgeColors = () => wait({});
    if (boundary === 'history settings') h.ctx.Utils.getHistorySettings = () => wait({});
    const old = h.begin();
    const finishing = h.ctx.finalizeDetection(7, old);
    await arrived.promise;
    const replacement = h.begin();
    h.ctx.networkUrlsStore.set(7, ['replacement network data']);
    h.ctx.payloadStore.set(7, ['replacement payload']);
    const painted = h.calls.badge.length;
    const notified = h.calls.popup.length + h.calls.page.length;
    gate.resolve();
    await finishing;
    assert.equal(h.ctx.detectionStates.get(7), replacement);
    assert.equal(h.ctx.activeDetections.get(7), replacement.activeDetection);
    assert.deepEqual(h.ctx.networkUrlsStore.get(7), ['replacement network data']);
    assert.deepEqual(h.ctx.payloadStore.get(7), ['replacement payload']);
    assert.equal(h.calls.badge.length, painted);
    assert.equal(h.calls.popup.length + h.calls.page.length, notified);
    assert.equal(h.calls.history.length, 0);
    assert.ok(!h.calls.ended.includes(replacement.keepaliveId));
  });
}

test('finalization is idempotent while persisting and cleans only its own successful session', async () => {
  const h = harness();
  const gate = deferred();
  const arrived = deferred();
  let writes = 0;
  h.ctx.DetectionEngineManager.storeDetection = async () => { writes++; arrived.resolve(); await gate.promise; return {}; };
  const state = h.begin();
  const first = h.ctx.finalizeDetection(7, state);
  await arrived.promise;
  await h.ctx.finalizeDetection(7, state);
  assert.equal(writes, 1);
  gate.resolve();
  await first;
  assert.equal(h.calls.history.length, 1);
  assert.equal(h.ctx.detectionStates.has(7), false);
  assert.equal(h.ctx.activeDetections.has(7), false);
  assert.ok(h.calls.ended.includes(state.keepaliveId));
});

test('an old queued timer cannot finalize a replacement or remove its current timer', async () => {
  const h = harness();
  const old = h.begin();
  h.ctx.checkAndFinalizeDetection(7);
  const oldTimer = h.ctx.finalizationDebounce.get(7);
  const oldCallback = h.timers.get(oldTimer).callback;
  const next = h.begin();
  h.ctx.checkAndFinalizeDetection(7);
  const nextTimer = h.ctx.finalizationDebounce.get(7);
  assert.notEqual(oldTimer, nextTimer);
  await oldCallback(); // even a callback already queued before clearTimeout
  assert.equal(h.ctx.finalizationDebounce.get(7), nextTimer);
  assert.equal(h.ctx.detectionStates.get(7), next);
  assert.equal(next.finalized, undefined);
  assert.equal(h.timers.has(oldTimer), false);
});

test('navigation during initial collection prevents stale matching and state recreation', async () => {
  const h = harness();
  const gate = deferred();
  const arrived = deferred();
  h.ctx.chrome.cookies.getAll = async () => { arrived.resolve(); return gate.promise; };
  let matched = 0;
  h.ctx.detectionEngine = { setDetectors() {}, detectOnPage: async () => { matched++; return []; } };
  const processing = h.ctx.processDetectionData({ data: { url: 'https://old.example/' } }, { tab: { id: 7, url: 'https://old.example/' } });
  await arrived.promise;
  h.ctx.DetectionSessionStore.cancel(7, 'url_changed');
  const next = h.begin('https://new.example/');
  gate.resolve([]);
  await processing;
  assert.equal(matched, 0);
  assert.equal(h.ctx.detectionStates.get(7), next);
  assert.equal(h.calls.popup.length, 0);
});

test('initializer callers share one promise and can retry a failure with the same manager', async () => {
  const h = harness();
  h.ctx.detectorManager = null;
  h.ctx.categoryManager = null;
  const gate = deferred();
  let created = 0;
  let initializes = 0;
  h.ctx.CategoryManager = class {};
  h.ctx.DetectorManager = class {
    constructor() { created++; }
    async initialize() { initializes++; await gate.promise; this.initialized = true; }
  };
  const first = h.ctx.ensureDetectorManagerInitialized();
  const second = h.ctx.ensureDetectorManagerInitialized();
  await Promise.resolve();
  assert.equal(created, 1);
  assert.equal(initializes, 1);
  gate.resolve();
  assert.equal(await first, await second);
  assert.equal(h.ctx.detectorInitializationPromise, null);
  h.ctx.detectorManager.initialized = false;
  h.ctx.detectorManager.initialize = async () => { throw new Error('read failed'); };
  await assert.rejects(h.ctx.ensureDetectorManagerInitialized(), /read failed/);
  assert.equal(h.ctx.detectorInitializationPromise, null);
  h.ctx.detectorManager.initialize = async function() { this.initialized = true; };
  assert.equal(await h.ctx.ensureDetectorManagerInitialized(), h.ctx.detectorManager);
  assert.equal(created, 1);
});

test('startup initialization and an early event reuse one detector load', async () => {
  const h = harness();
  const gate = deferred();
  let created = 0;
  let initialized = 0;
  h.ctx.detectorManager = null;
  h.ctx.categoryManager = null;
  h.ctx.initializationInProgress = false;
  h.ctx.initializationPromise = null;
  h.ctx.CategoryManager = class {};
  h.ctx.DetectorManager = class {
    constructor() { created++; }
    async initialize() { initialized++; await gate.promise; this.initialized = true; }
    getDetectorCount() { return 1; }
  };
  h.ctx.WorkerKeepaliveManager = class {};
  h.ctx.chrome.runtime.onInstalled = { addListener() {} };
  h.ctx.chrome.runtime.onStartup = { addListener() {} };
  h.ctx.chrome.tabs.query = async () => [];
  h.ctx.UpdateManager = { setupAlarmListener() {}, scheduleCheck() {} };
  h.ctx.HistoryRetention = { init() {} };
  h.ctx.DetectionCacheRetention = { init() {} };
  h.ctx.HistoryStore = { setQuotaRelief() {} };
  h.ctx.I18n = { syncOverrideFromStorage() {} };
  vm.runInContext(read('background/init.js'), h.ctx, { filename: 'background/init.js' });
  const lazy = h.ctx.ensureDetectorManagerInitialized();
  const startup = h.ctx.initialize('startup');
  await Promise.resolve();
  assert.equal(created, 1);
  assert.equal(initialized, 1);
  gate.resolve();
  const manager = await lazy;
  assert.equal(await startup, true);
  assert.equal(h.ctx.detectorManager, manager);
  assert.equal(created, 1);
  assert.equal(initialized, 1);
});


test('failed matching cannot finalize an empty successful scan and remains retryable', async () => {
  const h = harness();
  let writes = 0;
  h.ctx.DetectionEngineManager.storeDetection = async () => { writes++; return {}; };
  h.ctx.detectionEngine = { setDetectors() {}, detectOnPage: async () => { throw new Error('synthetic matching failure'); } };
  await assert.rejects(h.ctx.processDetectionData({ data: { url: 'https://example.test/' } },
    { tab: { id: 7, url: 'https://example.test/' } }), /synthetic matching failure/);
  const failed = h.ctx.detectionStates.get(7);
  assert.equal(failed.failed, true);
  assert.equal(h.ctx.activeDetections.has(7), false);
  assert.equal(h.ctx.DetectionSessionStore.isCurrent(7, failed), false);
  assert.equal(failed.timers.size, 0);
  await h.ctx.finalizeDetection(7, failed);
  assert.equal(writes, 0);
  assert.equal(h.calls.popup.length, 0);
  const retry = h.begin();
  assert.notEqual(retry, failed);
  assert.equal(h.ctx.DetectionSessionStore.isCurrent(7, retry), true);
});

test('failed cache persistence releases scan resources and reports failure instead of completion', async () => {
  const h = harness();
  h.ctx.DetectionEngineManager.storeDetection = async () => { throw new Error('synthetic storage failure'); };
  const state = h.begin();
  await assert.rejects(h.ctx.finalizeDetection(7, state), /synthetic storage failure/);
  assert.equal(h.ctx.detectionStates.get(7), state);
  assert.equal(state.failed, true);
  assert.equal(state.finalized, false);
  assert.equal(h.ctx.activeDetections.has(7), false);
  assert.equal(h.calls.popup.length, 0);
  assert.equal(h.calls.history.length, 0);
  assert.ok(h.calls.ended.includes(state.keepaliveId));
});

test('a delayed failure cannot clear a newer session or its badge', () => {
  const h = harness();
  const old = h.begin();
  const next = h.begin();
  assert.equal(h.ctx.DetectionSessionStore.fail(7, old, new Error('late failure')), false);
  assert.equal(h.ctx.DetectionSessionStore.isCurrent(7, next), true);
  assert.equal(h.calls.badge.length, 0);
});


test('late completion cannot emit progress or restart finalization after a failed scan', () => {
  const h = harness();
  const state = h.begin();
  state.completedMethods = new Set();
  let progress = 0;
  h.ctx.sendProgressUpdate = () => { progress++; };
  h.ctx.DetectionSessionStore.fail(7, state, new Error('failed'));
  h.ctx.markMethodComplete(7, 'jsHooks');
  h.ctx.markMethodComplete(7, 'windowProperties');
  h.ctx.checkAndFinalizeDetection(7);
  assert.equal(progress, 0);
  assert.equal(state.completedMethods.size, 0);
  assert.equal(state.timers.size, 0);
});
