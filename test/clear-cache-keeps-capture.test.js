const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Detection → Clear Cache removed the tab's response headers, cookies and requests along with the saved result, so
// the scan that followed without a reload (the popup asking again) stored a poorer result than the first one.

test('Clear Cache drops the saved result and keeps the tab\'s network capture', async () => {
  const stores = Object.fromEntries(['headersStore', 'requestHeadersStore', 'responseCookiesStore', 'payloadStore', 'networkUrlsStore', 'responseStore']
    .map(name => [name, new Map([[7, [{ url: 'https://shop.example/' }]]])]));
  const cleared = [];
  const cancelled = [];
  const context = vm.createContext({
    WorkerMessages: require('../modules/core/worker-messages.js'),
    Logger: new Proxy({}, { get: () => () => {} }),
    Constants: { RECENTLY_CLEARED_TAB_TIMEOUT: 1000 },
    BADGE: { TEXT: { CLEARED: 'CLR' }, COLORS: { CLEARED: '#999' } },
    setBadgeTextColor: async () => {},
    chrome: { action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} } },
    DetectionEngineManager: { handleClearDetectionCache: async (request, sendResponse) => { cleared.push(request.tabId); sendResponse({ success: true }); } },
    DetectionSessionStore: { cancel: (tabId, reason) => cancelled.push([tabId, reason]) },
    tabsUsingCache: new Set([7]), recentlyClearedTabs: new Set(),
    setTimeout: () => 0,
    ...stores
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background/handlers/messages-cache.js'), 'utf8'), context, { filename: 'messages-cache.js' });
  await context.clearTabDetectionCache({ tabId: 7, url: 'https://shop.example/' });
  assert.deepEqual(cleared, [7], 'the saved result is removed');
  assert.deepEqual(cancelled, [[7, 'cache_cleared']], 'a running scan ends');
  assert.equal(context.tabsUsingCache.has(7), false, 'the tab scans again');
  assert.ok(context.recentlyClearedTabs.has(7));
  for (const [name, store] of Object.entries(stores)) assert.equal(store.has(7), true, `${name} kept`);
});
