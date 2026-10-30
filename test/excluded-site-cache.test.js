const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A site that is skipped, or left out in "only these sites" mode, is never served a cached result: the content
// script's early cache check (before it collects anything) answers "no cache" for it, even when a result was saved
// before the site was excluded. The page-load check then paints the paused badge, as it does for any excluded site.

function harness({ excluded = false, cached = null, fresh = false } = {}) {
  const calls = { stored: 0, cleared: 0 };
  const context = vm.createContext({
    WorkerMessages: require('../modules/core/worker-messages.js'),
    Logger: new Proxy({}, { get: () => () => {} }),
    BADGE: { TEXT: { EMPTY: '', CLEAN: '0', DISABLED: '', BLACKLISTED: '' }, COLORS: {} },
    setBadgeText: async () => {}, setBadgeTextColor: async () => {}, setBadgeBackgroundColor: async () => {},
    chrome: { action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} }, runtime: { getURL: (path) => `chrome-extension://abc/${path}` } },
    tabsUsingCache: new Set(), recentlyClearedTabs: new Set(),
    Utils: { isUrlBlacklisted: async () => excluded },
    DetectionEngineManager: { getStoredDetection: async () => { calls.stored++; return cached; }, scansFresh: () => fresh, handleClearAllDetectionCache: async (send) => { calls.cleared++; send({ status: 'cleared' }); } },
    Promise, Map, Set, Date, console
  });
  // MessageSender as the worker loads it: in the context itself, so it reads this context's chrome.runtime
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'modules/core/message-sender.js'), 'utf8'), context, { filename: 'message-sender.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background/handlers/messages-cache.js'), 'utf8'), context, { filename: 'messages-cache.js' });
  const registry = {};
  context.registerCacheHandlers(registry, {});
  const early = (url) => new Promise(resolve => {
    registry[context.WorkerMessages.CHECK_CACHE_EARLY]({ request: { url }, sender: { tab: { id: 7 } }, sendResponse: resolve, context: {} });
  });
  return { context, early, calls, registry };
}

test('the early cache check serves a saved result to a site that is scanned', async () => {
  const h = harness({ cached: { detectionResults: [{ detector: { name: 'X' } }], detectionCount: 1 } });
  const answer = await h.early('https://shop.example/');
  assert.equal(answer.cacheHit, true);
  assert.equal(answer.detectionData.detectionCount, 1);
  assert.ok(h.context.tabsUsingCache.has(7));
});

test('a skipped site gets no cached result, even one saved before it was skipped, and is not marked as using the cache', async () => {
  const h = harness({ excluded: true, cached: { detectionResults: [{ detector: { name: 'X' } }], detectionCount: 1 } });
  h.context.tabsUsingCache.add(7);
  const answer = await h.early('https://skipped.example/');
  assert.deepEqual(JSON.parse(JSON.stringify(answer)), { cacheHit: false }); // the answer is built in the handler's own realm
  assert.equal(h.calls.stored, 0, 'the cache is not even read');
  assert.ok(!h.context.tabsUsingCache.has(7));
});

test('a Bulk scan tab is never served a saved result by the early check, and its capture is not switched off', async () => {
  const h = harness({ fresh: true, cached: { detectionResults: [{ detector: { name: 'X' } }], detectionCount: 1 } });
  h.context.tabsUsingCache.add(7);
  const answer = await h.early('https://www.shop.example/'); // the page the listed address redirected to
  assert.deepEqual(JSON.parse(JSON.stringify(answer)), { cacheHit: false });
  assert.equal(h.calls.stored, 0, 'the cache is not read');
  assert.ok(!h.context.tabsUsingCache.has(7), 'the tab keeps capturing its requests, headers and bodies');
});

test('clearing the whole cache is answered to extension pages only, never to a content script', async () => {
  const h = harness();
  const ask = (sender) => new Promise(resolve => {
    const kept = h.registry[h.context.WorkerMessages.DETECTION_CLEAR_ALL_CACHE]({ request: {}, sender, sendResponse: resolve, context: {} });
    void kept;
  });
  const web = await ask({ url: 'https://evil.example/', tab: { id: 3 } });
  assert.equal(web.status, 'error', 'a web page\'s content script is refused');
  assert.equal(h.calls.cleared, 0, 'and nothing was cleared');
  const own = await ask({ url: `${h.context.chrome.runtime.getURL('')}popup.html` });
  assert.equal(own.status, 'cleared', 'the popup is answered');
  assert.equal(h.calls.cleared, 1);
});

