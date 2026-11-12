'use strict';
// A page that loaded while its site was not scanned (skipped, left out of "only these sites", or the settings unreadable) kept
// none of its headers, cookies, request bodies or requests, and its JS hooks never ran (background/uncaptured-pages.js). Once the
// site is scanned again while that page stays open, every way of scanning it without a reload is closed:
//   - a scan asked on request (the popup, and returning to the tab) is answered "reload", and nothing is asked of the page;
//   - a route change of a single-page app, or a load notice that arrives after the site was turned back on, starts no scan
//     (a saved result of the page, from a complete scan, still answers);
//   - a scan that gets past those keeps nothing: no saved result, History entry, webhook or result for the popup.
// A page loaded again (another document) is scanned as before.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { engineContext, ENGINE_FILES } = require('./helpers/engine-context.js');

const WorkerMessages = require('../modules/core/worker-messages.js');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };
const PAGE = 'https://shop.example/account';

/** The page of tab 7 shown as `documentId` loaded with its capture refused (header-capture.js notes it at its commit). */
const noteUncaptured = (context, documentId, tabId = 7) => vm.runInContext('UncapturedPages', context).noteCommit(tabId, documentId, Promise.resolve(false));

// ---- A scan on request: the popup (DetectionEngineManager.handleRequestDetection) and returning to the tab (requestDetectionForTab)

function requestWorld() {
  const messages = [];
  const effects = [];
  const current = { url: PAGE, documentId: 'doc-skipped' };
  const context = {
    WorkerMessages, URL, Promise, Map, Set, Date, AbortController, PatternCache: class {},
    Constants: { REQUEST_DETECTION_PENDING_TIMEOUT: 10000, DETECTION_SKIP_THRESHOLD: 1500 },
    Logger: new Proxy({}, { get: () => () => {} }),
    cachedHooksConfig: { MAX_DETECTION_MS: 100 }, getHooksDeadline: (value) => value + 100,
    workerKeepaliveManager: null,
    setTimeout: () => 0, clearTimeout: () => {},
    startBadgeSpinner: (tabId) => effects.push({ type: 'spinner', tabId }),
    Utils: { isValidContentScriptTab: () => true, shouldSkipDetection: () => false, isUrlBlacklisted: async () => false },
    chrome: {
      storage: { local: { get: async () => ({ scrapfly_enabled: true }) } },
      runtime: {}, webNavigation: { getFrame: async () => ({ ...current }) },
      action: { setBadgeText: async (value) => effects.push({ type: 'badge', ...value }) },
      tabs: {
        get: async () => ({ id: 7, url: current.url }),
        sendMessage: (tabId, message, options, callback) => messages.push({ tabId, message, options, callback })
      }
    }
  };
  for (const key of ['activeDetections', 'detectionStates', 'recentDetectionRequests', 'interruptedDetections',
    'batchProcessingFlags', 'finalizationDebounce']) context[key] = new Map();
  vm.createContext(context);
  for (const file of ['modules/core/badge-constants.js', 'background/detection-session-store.js', 'modules/detection/engine/detection-engine-manager.js',
    'background/uncaptured-pages.js', 'background/utilities.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const Engine = vm.runInContext('DetectionEngineManager', context);
  const request = () => {
    const responses = [];
    const done = Engine.handleRequestDetection({ tabId: 7 }, (value) => responses.push(value), context);
    return { done, responses };
  };
  const reply = (entry, value) => entry.callback(value);
  return { context, current, messages, effects, request, reply };
}

test('asked to scan such a page, the worker asks nothing of it and answers that it must load again', async () => {
  const w = requestWorld();
  await noteUncaptured(w.context, 'doc-skipped');
  const request = w.request();
  await flush();
  assert.deepEqual(w.messages.map((entry) => entry.message.type), [], 'no content-script ping, no RUN_DETECTION');
  await request.done;
  assert.deepEqual({ ...request.responses[0] }, { status: 'needs_reload', reason: 'not_captured', message: 'Reload the page to run detection.' });
  assert.equal(w.context.activeDetections.size, 0, 'no pending scan');
  assert.equal(w.context.recentDetectionRequests.size, 0, 'and the throttle is not spent on it');
  assert.deepEqual(w.effects, [], 'no spinner, no badge change');
});

test('the same tab with its page loaded again (another document) is scanned on request as before', async () => {
  const w = requestWorld();
  await noteUncaptured(w.context, 'doc-skipped');
  w.current.documentId = 'doc-reloaded';
  const request = w.request();
  await flush();
  assert.deepEqual(w.messages.map((entry) => entry.message.type), ['GET_DETECTION_STATUS']);
  w.reply(w.messages[0], { status: 'active' });
  await flush();
  assert.deepEqual(w.messages.map((entry) => entry.message.type), ['GET_DETECTION_STATUS', 'RUN_DETECTION']);
  w.reply(w.messages[1], { status: 'detection_started' });
  await request.done;
  assert.equal(request.responses[0].status, 'requested');
});

test('returning to the tab of such a page (no saved result) starts no scan of it', async () => {
  const w = requestWorld();
  await noteUncaptured(w.context, 'doc-skipped');
  const requested = w.context.requestDetectionForTab(7, { source: 'tab_activated', silent: false });
  await flush();
  assert.deepEqual(w.messages.map((entry) => entry.message.type), [], 'the tab switch asks nothing of the page');
  assert.equal(await requested, false);
  assert.equal(w.context.activeDetections.size, 0);
});

// ---- A page-load notice: a route change of a single-page app, or a load notice after the site was turned back on

const CACHED = { detectionCount: 1, detectionResults: [{ detector: { id: 'detect-x', name: 'X' }, confidence: 90, matches: [] }], expiry: 9e15, timestamp: 1, cacheScope: 'full' };

function pageLoadWorld({ stored = null } = {}) {
  const sent = [];
  const webhooks = [];
  const titles = [];
  const chrome = {
    storage: { local: { get: async () => ({ scrapfly_enabled: true }) } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async (value) => { titles.push(value); } },
    runtime: { sendMessage: async () => {} },
    webNavigation: { getFrame: async () => ({ url: PAGE, documentId: 'doc-skipped' }) },
    tabs: {
      get: async () => ({ id: 7, url: PAGE, title: 'Account', favIconUrl: '', incognito: false }),
      sendMessage: (tabId, data, options, callback) => {
        sent.push(data.type);
        if (callback) callback({ status: 'collecting_data' });
        return Promise.resolve({});
      }
    }
  };
  const { Engine, context } = engineContext({
    chrome, WorkerMessages, AbortController,
    setTimeout: () => 1, clearTimeout() {},
    setPausedIcon() {}, startBadgeSpinner() {}, setBadgeTextColor() {},
    DetectionUtils: { getBadgeColor: () => '#000000', badgeCount: require('../utils/detection-utils.js').badgeCount, readBadgeCountMode: require('../utils/detection-utils.js').readBadgeCountMode }
  }, { files: [...ENGINE_FILES, 'modules/core/storage-manager.js', 'modules/core/badge-constants.js', 'background/uncaptured-pages.js'] });
  Engine.getStoredDetection = async () => stored;
  const dependencies = {
    chrome, CategoryManager: { getBadgeColors: async () => ({}), getBadgeCountMode: async () => 'all' }, HistoryRecorder: {}, categoryManager: {}, recentDetectionRequests: new Map(),
    Utils: { isUrlBlacklisted: async () => false, getHistorySettings: async () => ({}), shouldSkipDetection: () => false },
    Settings: { sendWebhookIfEnabled: (page, results, options) => { webhooks.push(options.trigger); return Promise.resolve(); } }
  };
  const notice = (triggerSource) => Engine.handlePageLoadNotification({ url: PAGE, triggerSource }, { documentId: 'doc-skipped', tab: { id: 7, url: PAGE, incognito: false } }, dependencies);
  return { context, sent, webhooks, titles, notice };
}

for (const trigger of ['url_change', 'page_load']) {
  test(`${trigger === 'url_change' ? 'a route change of a single-page app' : 'a load notice that arrives after the site was turned back on'}: such a page is not scanned`, async () => {
    const w = pageLoadWorld();
    await noteUncaptured(w.context, 'doc-skipped');
    const answer = await w.notice(trigger);
    assert.deepEqual(w.sent, [], 'no REQUEST_PAGE_DATA');
    assert.equal(answer && answer.status, 'needs_reload');
  });
}

test('a saved result of such a page still answers its route change: it comes from a complete scan of an earlier load', async () => {
  const w = pageLoadWorld({ stored: CACHED });
  await noteUncaptured(w.context, 'doc-skipped');
  await w.notice('url_change');
  assert.deepEqual(w.sent, ['CACHE_HIT_DISABLE_MONITORING'], 'the cached result is shown; nothing is scanned');
  assert.deepEqual(w.webhooks, ['cache'], '"Send on every page load" sends it as before');
});

test('a page that loaded while its site was scanned is scanned on a route change as before', async () => {
  const w = pageLoadWorld();
  await w.context.UncapturedPages.noteCommit(7, 'doc-skipped', Promise.resolve(true));
  await w.notice('url_change');
  assert.deepEqual(w.sent, ['REQUEST_PAGE_DATA']);
});

// ---- A scan that gets past those checks keeps nothing (finalizeDetection)

function finalizeWorld() {
  const calls = { stored: 0, history: 0, webhook: 0, popup: [], badge: [], page: [] };
  const context = {
    WorkerMessages, Map, Set, Date, Promise, AbortController, console,
    Constants: { FINALIZATION_CHECK_DELAY: 10, MIN_DETECTION_TIME: 0, BATCH_SETTLE_TIME: 0, SAFETY_TIMEOUT: 50, DETECTION_TIMEOUT: 20, COOKIE_VALUE_MAX_LENGTH: 128 },
    cachedHooksConfig: { MAX_DETECTION_MS: 100 }, getHooksDeadline: (start) => start + 100, ensureHooksDeadline: async (state) => state.hooksDeadline,
    Logger: new Proxy({}, { get: () => () => {} }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    workerKeepaliveManager: { startOperation() {}, endOperation() {} },
    detectorManager: { initialized: true, getAllDetectors: () => ({}) },
    categoryManager: {}, detectorInitializationPromise: null,
    DetectionEngineManager: { storeDetection: async (url, page, results) => { calls.stored++; return { ...page, detectionResults: results, expiry: 9e15 }; }, getStoredDetection: async () => null },
    UrlUtils: { normalizeFaviconForStorage: () => null, getHostnameFromUrl: () => 'shop.example' },
    Utils: { getHistorySettings: async () => ({}), isUrlBlacklisted: async () => false },
    HistoryRecorder: { shouldSaveToHistory: async () => true, saveDetectionToHistory: async () => { calls.history++; } },
    CategoryManager: { getBadgeColors: async () => ({}), getBadgeCountMode: async () => 'all' },
    DetectionUtils: { getBadgeColor: () => '#112233', badgeCount: require('../utils/detection-utils.js').badgeCount, readBadgeCountMode: require('../utils/detection-utils.js').readBadgeCountMode },
    Settings: { sendWebhookIfEnabled: async () => { calls.webhook++; } },
    sendProgressUpdate: () => {},
    isExtensionEnabled: async () => true,
    chrome: {
      action: { setBadgeText: async (value) => { calls.badge.push(value.text); }, setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {}, setIcon: async () => {}, setTitle: async () => {} },
      runtime: { sendMessage: async (message) => { calls.popup.push(message.type); } },
      tabs: { sendMessage: async (tabId, message) => { calls.page.push(message.type); } },
      cookies: { getAll: async () => [] }
    }
  };
  for (const key of ['detectionStates', 'activeDetections', 'interruptedDetections', 'finalizationDebounce', 'batchProcessingFlags',
    'payloadStore', 'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore']) context[key] = new Map();
  vm.createContext(context);
  for (const file of ['modules/core/badge-constants.js', 'utils/page-cookies.js', 'background/detection-session-store.js', 'background/utilities.js',
    'background/uncaptured-pages.js', 'background/detection-lifecycle.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const finish = async (documentId) => {
    const state = context.DetectionSessionStore.begin(7, PAGE);
    Object.assign(state, { documentId, hooksComplete: true, mainComplete: true,
      completedMethods: new Set(['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload']),
      mainData: [{ detector: { id: 'detect-demo', name: 'Demo' }, confidence: 90, matches: [{ type: 'dom', pattern: '#x' }] }] });
    await context.finalizeDetection(7, state);
    return state;
  };
  return { context, calls, finish };
}

test('a scan of such a page that gets past those checks keeps nothing: no saved result, History entry, webhook or result for the popup', async () => {
  const w = finalizeWorld();
  await noteUncaptured(w.context, 'doc-skipped');
  await w.finish('doc-skipped');
  assert.equal(w.calls.stored, 0, 'no cache entry');
  assert.equal(w.calls.history, 0, 'no History entry');
  assert.equal(w.calls.webhook, 0, 'no webhook');
  assert.deepEqual(w.calls.popup, [], 'no result for the popup');
  assert.deepEqual(w.calls.page, [], 'no onDetection event for the page');
  assert.ok(!w.calls.badge.includes('1'), 'no count on the badge');
  assert.equal(w.context.detectionStates.has(7), false, 'the scan is over');
});

test('a scan of a page that loaded scanned is kept as before', async () => {
  const w = finalizeWorld();
  await noteUncaptured(w.context, 'doc-skipped');
  await w.finish('doc-reloaded');
  assert.equal(w.calls.stored, 1);
  assert.equal(w.calls.history, 1);
  assert.equal(w.calls.webhook, 1);
  assert.deepEqual(w.calls.popup, ['NEW_DETECTION_DATA']);
  assert.ok(w.calls.badge.includes('1'));
});
