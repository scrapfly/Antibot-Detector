const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A single-page app that changes route soon after its first scan (a redirect after login, / to /home) must still get
// its new route scanned: the content script held the notice back for a second after the last collection and dropped it,
// and the worker coalesced it with the previous notice of the same document.

const repo = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(repo, file), 'utf8');

function contentHarness() {
  let now = 100000;
  const timers = [];
  const sent = [];
  const location = { href: 'https://example.test/a' };
  const context = {
    WorkerMessages: require(path.join(repo, 'modules/core/worker-messages.js')),
    Logger: new Proxy({}, { get: () => () => {} }),
    Date: class extends Date { static now() { return now; } },
    window: { location },
    setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms, cleared: false }); return timers.length; },
    clearTimeout: (id) => { if (id) timers[id - 1].cleared = true; },
    chrome: { runtime: { id: 'x', lastError: null, getURL: () => 'chrome-extension://x/', sendMessage: (message) => sent.push(message) } }
  };
  vm.createContext(context);
  vm.runInContext(read('utils/utils.js'), context, { filename: 'utils/utils.js' });
  vm.runInContext('globalThis.RealUtils = Utils;', context);
  return {
    sent, location,
    Utils: context.RealUtils,
    advance(ms) {
      now += ms;
      for (const timer of timers) if (!timer.cleared && timer.at <= now) { timer.cleared = true; timer.fn(); }
    },
    now: () => now
  };
}

function notice(h, engine) {
  return h.Utils.notifyPageLoad({
    detectionEngine: engine, isExtensionContextValid: () => true, cleanupOrphanedScript: () => {}, triggerSource: 'url_change'
  });
}

test('a route change right after a scan is sent once the window passes, with the route it ended on', async () => {
  const h = contentHarness();
  const engine = { lastDetectionTime: h.now() - 300, shouldRunDetection(min) { return !this.lastDetectionTime || (h.now() - this.lastDetectionTime) > min; } };
  h.location.href = 'https://example.test/b';
  await notice(h, engine);
  assert.equal(h.sent.length, 0, 'inside the window nothing goes out yet');
  h.location.href = 'https://example.test/c';
  await notice(h, engine);
  h.advance(2000);
  assert.equal(h.sent.length, 1, 'one notice, not one per route');
  assert.equal(h.sent[0].url, 'https://example.test/c');
  assert.equal(h.sent[0].triggerSource, 'url_change');
});

function workerHarness() {
  let now = 10000;
  let current;
  const messages = [];
  const context = {
    WorkerMessages: require(path.join(repo, 'modules/core/worker-messages.js')),
    URL, Map, Set, Promise, Date: class extends Date { static now() { return now; } },
    PatternCache: class {}, Logger: new Proxy({}, { get: () => () => {} }),
    setTimeout: () => 1, clearTimeout: () => {}, setPausedIcon: () => {}, startBadgeSpinner: () => {},
    chrome: { storage: { local: { get: async () => ({ scrapfly_enabled: true }) } },
      runtime: {}, webNavigation: { getFrame: async () => ({ ...current }) },
      tabs: {
        get: async () => ({ id: 7, url: current.url }),
        sendMessage: (tabId, data, options, callback) => {
          messages.push({ type: data.type, url: current.url });
          callback?.({ status: 'collecting_data' });
        }
      } }
  };
  vm.createContext(context);
  for (const file of ['modules/core/constants.js', 'utils/utils.js', 'modules/detection/engine/detection-engine-manager.js'])
    vm.runInContext(read(file), context, { filename: file });
  vm.runInContext('globalThis.Engine = DetectionEngineManager; globalThis.RealUtils = Utils;', context);
  context.Engine.getStoredDetection = async () => null;
  context.RealUtils.isUrlBlacklisted = async () => false;
  const dependencies = { chrome: context.chrome, Utils: context.RealUtils, CategoryManager: {}, HistoryRecorder: {}, categoryManager: {}, recentDetectionRequests: new Map() };
  return {
    messages,
    advance: ms => now += ms,
    run: (url, triggerSource) => {
      current = { documentId: 'document-a', url };
      return context.Engine.handlePageLoadNotification({ url, triggerSource }, { documentId: 'document-a', tab: { id: 7, url } }, dependencies);
    }
  };
}

test('the worker scans a new route of the same document at once, and still coalesces a repeat of the same route', async () => {
  const h = workerHarness();
  await h.run('https://example.test/a', 'page_load'); h.advance(250);
  await h.run('https://example.test/b', 'url_change');
  h.advance(100);
  await h.run('https://example.test/b', 'url_change');
  assert.deepEqual(h.messages.map(m => m.url), ['https://example.test/a', 'https://example.test/b']);
});
