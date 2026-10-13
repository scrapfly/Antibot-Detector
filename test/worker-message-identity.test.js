const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function harness() {
  let timerId = 0;
  const timers = new Map();
  const current = { url: 'https://example.test/', documentId: 'doc-current' };
  const context = {
    URL, Map, Set, Date, Promise, AbortController, console,
    Logger: new Proxy({}, { get: () => () => {} }),
    cachedHooksConfig: { MAX_DETECTION_MS: 100 }, getHooksDeadline: now => now + 100,
    workerKeepaliveManager: null, Constants: {},
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    chrome: { webNavigation: { getFrame: async () => ({ ...current }) } },
    detectorManager: { getDetector: () => ({ id: 'detect-demo', name: 'Demo' }), findDetectorById: () => null },
    ensureDetectorManagerInitialized: async () => {},
    DetectionEngineManager: { getStoredDetection: async () => null, handlePageLoadNotification: async () => {} },
    HistoryRecorder: {}, Settings: {}, CategoryManager: {}, categoryManager: {}, Utils: {},
    checkAndFinalizeDetection: () => {},
    markMethodComplete: (tabId, method) => context.detectionStates.get(tabId)?.completedMethods.add(method)
  };
  for (const key of ['detectionStates', 'activeDetections', 'interruptedDetections', 'finalizationDebounce', 'batchProcessingFlags',
    'payloadStore', 'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore', 'recentDetectionRequests']) context[key] = new Map();
  context.tabsUsingCache = new Set();
  vm.createContext(context);
  for (const file of ['modules/core/bridge-protocol.js', 'background/detection-session-store.js', 'background/handlers/messages-detection.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const registry = {};
  context.registerDetectionHandlers(registry, {});
  const sender = (url = current.url, documentId = current.documentId) => ({ frameId: 0, url, documentId, tab: { id: 7, url } });
  const message = (type, request, from = sender()) => {
    let response;
    registry[type]({ request, sender: from, sendResponse: value => { response = value; }, context: {} });
    return async () => { await flush(); return response; };
  };
  const begin = (documentId = current.documentId, url = current.url) => {
    const state = context.DetectionSessionStore.begin(7, url);
    state.documentId = documentId;
    return state;
  };
  return { ctx: context, current, timers, registry, sender, message, begin };
}

for (const type of ['JS_HOOKS_COMPLETE', 'WINDOW_PROPS_COMPLETE']) {
  test(`${type} cannot replace a newer URL or same-URL document`, async () => {
    const h = harness();
    const newer = h.begin();
    let response = await h.message(type, { url: 'https://old.example/' }, h.sender(h.current.url))();
    assert.equal(response.status, 'url_changed');
    assert.equal(h.ctx.detectionStates.get(7), newer);
    response = await h.message(type, { url: h.current.url }, h.sender(h.current.url, 'doc-old'))();
    assert.equal(response.status, 'url_changed');
    assert.equal(h.ctx.detectionStates.get(7), newer);
    assert.equal(newer.interrupted, undefined);
  });
}

test('legitimate early completion before PAGE_LOAD preserves its document and hook state into the main scan', async () => {
  const h = harness();
  const early = await h.message('JS_HOOKS_COMPLETE', { url: h.current.url })();
  assert.equal(early.status, 'success');
  const state = h.ctx.detectionStates.get(7);
  assert.equal(state.documentId, 'doc-current');
  assert.equal(state.hooksComplete, true);
  let dependencies;
  h.ctx.DetectionEngineManager.handlePageLoadNotification = async (_r, _s, deps) => { dependencies = deps; };
  assert.equal((await h.message('PAGE_LOAD_NOTIFICATION', { url: h.current.url })()).status, 'ok');
  assert.equal(h.ctx.detectionStates.get(7), state);
  assert.equal(dependencies.HistoryRecorder, h.ctx.HistoryRecorder);
  h.ctx.processDetectionData = async (_r, sender) => h.ctx.DetectionSessionStore.begin(sender.tab.id, sender.tab.url);
  assert.equal((await h.message('DETECTION_DATA', { data: { url: h.current.url } })()).status, 'received');
  assert.equal(h.ctx.detectionStates.get(7), state);
  assert.equal(state.documentId, 'doc-current');
  assert.equal(state.hooksComplete, true);
  h.current.documentId = 'doc-new';
  assert.equal(await dependencies.isCurrentDocument(), false);
});

test('a verified new document can replace a prior same-URL scan before tab events arrive', async () => {
  const h = harness();
  const old = h.begin('doc-old');
  assert.equal((await h.message('WINDOW_PROPS_COMPLETE', { url: h.current.url })()).status, 'success');
  const state = h.ctx.detectionStates.get(7);
  assert.notEqual(state, old);
  assert.equal(old.interrupted, true);
  assert.equal(state.documentId, 'doc-current');
  assert.equal(state.windowPropertiesComplete, true);
});

test('stale hook batch completion leaves a replacement batch flag and results untouched', async () => {
  const h = harness();
  const gate = deferred();
  const old = h.begin();
  h.ctx.DetectionEngineManager.getStoredDetection = () => gate.promise;
  h.message('JS_HOOK_DETECTION_BATCH', { detections: [{ url: h.current.url, detection: { detectorId: 'detect-demo' } }] });
  await flush();
  h.current.documentId = 'doc-new';
  const newer = h.begin();
  h.ctx.batchProcessingFlags.set(7, true);
  gate.resolve({ detectionResults: [] });
  await flush();
  assert.equal(h.ctx.batchProcessingFlags.get(7), true);
  assert.equal(newer.hooksData.size, 0);
  assert.equal(newer.usedCache, undefined);
  assert.equal(h.ctx.detectionStates.get(7), newer);
  assert.equal(old.interrupted, true);
});

test('an outdated frame query cannot authorize replacement of a state created while it awaited', async () => {
  const h = harness();
  const gate = deferred();
  h.ctx.chrome.webNavigation.getFrame = () => gate.promise;
  const response = h.message('JS_HOOKS_COMPLETE', { url: h.current.url });
  await flush();
  h.current.documentId = 'doc-new';
  const newer = h.begin();
  gate.resolve({ url: h.current.url, documentId: 'doc-current' });
  assert.equal((await response()).status, 'url_changed');
  assert.equal(h.ctx.detectionStates.get(7), newer);
});

test('a hook-complete retry belongs to its original scan', async () => {
  const h = harness();
  const old = h.begin();
  await h.message('JS_HOOKS_COMPLETE', { url: h.current.url })();
  const callback = [...h.timers.values()][0];
  const newer = h.begin();
  let checks = 0;
  h.ctx.checkAndFinalizeDetection = () => { checks++; };
  await callback();
  assert.equal(checks, 0);
  assert.equal(h.ctx.detectionStates.get(7), newer);
  assert.equal(old.interrupted, true);
});

test('a verified early document is accepted while the sender tab snapshot and cache flag still describe the old page', async () => {
  const h = harness();
  h.ctx.tabsUsingCache.add(7);
  const sender = h.sender();
  sender.tab.url = 'https://previous.example/';
  assert.equal((await h.message('WINDOW_PROPS_COMPLETE', { url: h.current.url }, sender)()).status, 'success');
  assert.equal(h.ctx.detectionStates.get(7).documentId, h.current.documentId);
});

for (const type of ['JS_HOOKS_COMPLETE', 'WINDOW_PROPS_COMPLETE', 'PAGE_LOAD_NOTIFICATION', 'DETECTION_DATA']) {
  test(`${type} responds when the sender has no tab`, async () => {
    const h = harness();
    assert.equal((await h.message(type, { url: h.current.url }, {})()).status, 'url_changed');
  });
}

test('PAGE_LOAD forwards the ignored response from its asynchronous engine work', async () => {
  const h = harness();
  h.ctx.DetectionEngineManager.handlePageLoadNotification = async () => ({ status: 'url_changed' });
  assert.equal((await h.message('PAGE_LOAD_NOTIFICATION', { url: h.current.url })()).status, 'url_changed');
});

function pageLoadHarness() {
  const effects = [];
  const timers = [];
  const state = { current: true, retry: false };
  const context = {
    Promise, Date, Map, Set, PatternCache: class {},
    Logger: new Proxy({}, { get: () => () => {} }),
    DetectionUtils: { getBadgeColor: () => '#123456' },
    UrlUtils: { getHostnameFromUrl: () => 'example.test', normalizeFaviconForStorage: value => value },
    setPausedIcon: () => {}, setBadgeTextColor: () => {},
    startBadgeSpinner: () => effects.push({ kind: 'spinner' }),
    setTimeout: callback => timers.push(callback),
    chrome: {
      storage: { local: { get: async () => ({ scrapfly_enabled: true }) } },
      action: {
        setBadgeText: async data => effects.push({ kind: 'badge', data }),
        setBadgeBackgroundColor: async data => effects.push({ kind: 'color', data })
      },
      runtime: { sendMessage: async data => effects.push({ kind: 'popup', data }) },
      tabs: {
        get: async () => ({ url: 'https://example.test/', title: 'Example' }),
        sendMessage: (tabId, data, options, callback) => {
          effects.push({ kind: 'tab', data, options });
          if (callback) {
            if (state.retry) context.chrome.runtime.lastError = { message: 'Receiving end does not exist' };
            callback();
            delete context.chrome.runtime.lastError;
          }
          return Promise.resolve();
        }
      }
    }
  };
  vm.createContext(context);
  for (const file of ['modules/core/bridge-protocol.js', 'modules/core/badge-constants.js', 'modules/detection/engine/detection-engine-manager.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  vm.runInContext('globalThis.Engine = DetectionEngineManager', context);
  context.Engine.getStoredDetection = async () => ({ detectionCount: 1, detectionResults: [{ detector: { name: 'Demo' } }] });
  const dependencies = {
    chrome: context.chrome, categoryManager: {}, recentDetectionRequests: new Map(),
    CategoryManager: { getBadgeColors: async () => ({}) },
    Utils: { isUrlBlacklisted: async () => false, getHistorySettings: async () => ({ historyBypassCache: true }), shouldSkipDetection: () => false },
    HistoryRecorder: { shouldSaveToHistory: async () => true, saveDetectionToHistory: async () => effects.push({ kind: 'history' }) },
    isCurrentDocument: async () => state.current
  };
  const run = () => context.Engine.handlePageLoadNotification(
    { url: 'https://example.test/' }, { documentId: 'doc-current', tab: { id: 7 } }, dependencies);
  return { context, state, effects, timers, dependencies, run };
}

for (const boundary of ['enabled', 'blacklist', 'cache', 'badge-colors']) {
  test(`PAGE_LOAD does not paint or notify a replacement document after awaiting ${boundary}`, async () => {
    const h = pageLoadHarness();
    const gate = deferred();
    if (boundary === 'enabled') h.context.chrome.storage.local.get = () => gate.promise;
    if (boundary === 'blacklist') h.dependencies.Utils.isUrlBlacklisted = () => gate.promise;
    if (boundary === 'cache') h.context.Engine.getStoredDetection = () => gate.promise;
    if (boundary === 'badge-colors') h.dependencies.CategoryManager.getBadgeColors = () => gate.promise;
    const result = h.run();
    await flush();
    h.state.current = false;
    gate.resolve(boundary === 'enabled' ? { scrapfly_enabled: false } : { detectionCount: 1, detectionResults: [{}] });
    assert.equal((await result).status, 'url_changed');
    assert.equal(h.effects.length, 0);
  });
}

for (const boundary of ['history-settings', 'history-admission', 'tab-details']) {
  test(`PAGE_LOAD does not save history for a replacement document after awaiting ${boundary}`, async () => {
    const h = pageLoadHarness();
    const gate = deferred();
    if (boundary === 'history-settings') h.dependencies.Utils.getHistorySettings = () => gate.promise;
    if (boundary === 'history-admission') h.dependencies.HistoryRecorder.shouldSaveToHistory = () => gate.promise;
    if (boundary === 'tab-details') h.context.chrome.tabs.get = () => gate.promise;
    const result = h.run();
    await flush();
    h.state.current = false;
    gate.resolve({ historyBypassCache: true, title: 'Next document' });
    assert.equal((await result).status, 'url_changed');
    assert.equal(h.effects.some(effect => effect.kind === 'history'), false);
  });
}

test('PAGE_LOAD cached notifications target the sending document and record its valid visit', async () => {
  const h = pageLoadHarness();
  await h.run();
  assert.equal(h.effects.find(effect => effect.kind === 'badge').data.text, '1');
  assert.deepEqual({ ...h.effects.find(effect => effect.kind === 'tab').options }, { documentId: 'doc-current' });
  assert.equal(h.effects.filter(effect => effect.kind === 'history').length, 1);
});

test('PAGE_LOAD retries stop when their document is replaced', async () => {
  const h = pageLoadHarness();
  h.context.Engine.getStoredDetection = async () => null;
  h.state.retry = true;
  await h.run();
  assert.equal(h.timers.length, 1);
  assert.deepEqual({ ...h.effects.find(effect => effect.kind === 'tab').options }, { documentId: 'doc-current' });
  h.state.current = false;
  await h.timers[0]();
  assert.equal(h.effects.filter(effect => effect.kind === 'tab').length, 1);
});

test('concurrent hook batches keep finalization blocked until every admitted lookup finishes', async () => {
  const h = harness();
  const state = h.begin();
  const first = deferred();
  const second = deferred();
  const gates = [first, second];
  h.ctx.DetectionEngineManager.getStoredDetection = () => gates.shift().promise;
  const request = { detections: [{ url: h.current.url, detection: {
    detectorId: 'detect-demo', hook: { target: 'Navigator.example', confidence: 50 }
  } }] };
  h.message('JS_HOOK_DETECTION_BATCH', request);
  h.message('JS_HOOK_DETECTION_BATCH', request);
  await flush();
  assert.equal(state.pendingHookBatches, 2);
  assert.equal(h.ctx.batchProcessingFlags.get(7), true);
  first.resolve(null);
  await flush();
  assert.equal(state.pendingHookBatches, 1);
  assert.equal(h.ctx.batchProcessingFlags.get(7), true);
  assert.equal(state.hooksData.size, 1);
  second.resolve(null);
  await flush();
  assert.equal(state.pendingHookBatches, 0);
  assert.equal(h.ctx.batchProcessingFlags.get(7), false);
  assert.equal(state.hooksData.get('detect-demo').matches.length, 1);
});


for (const cached of [null, { detectionResults: [] }]) test(`GET_DETECTION_DATA exposes a failed scan as an error (${cached ? 'older clean cache' : 'no cache'})`, async () => {
  const h = harness();
  h.ctx.currentActiveTab = 7;
  h.ctx.recentlyClearedTabs = new Set();
  h.ctx.DetectionEngineManager.getDetectionData = async () => cached;
  h.ctx.chrome.action = { getBadgeText: async () => '' };
  const state = h.begin();
  state.failed = true;
  h.ctx.activeDetections.delete(7);
  const response = await h.message('GET_DETECTION_DATA', { tabId: 7 })();
  assert.equal(response.status, 'error');
  assert.equal(response.data, null);
});
