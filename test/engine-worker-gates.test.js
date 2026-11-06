const { test } = require('node:test');
const assert = require('node:assert/strict');
const { engineContext, ENGINE_FILES } = require('./helpers/engine-context.js');

// Two gates of the worker's scan handlers (DetectionEngineManager.handlePageLoadNotification and handleRequestDetection):
//
//  - The extension's on/off switch and the settings are read before anything is scanned. A read that failed used to be logged
//    and the scan went on, so a switched-off extension, or a site the person left out of scanning, was scanned because the
//    setting that says so could not be read. A read that fails (or settings that are not JSON, or not an object) now scans
//    nothing, and says so once, naming the error and never the stored text.
//  - The webhook "Send on every page load" is not sent for a page in a private window, also when the tab cannot be read
//    (tabs.get fails): the sender of the message says which kind of window it is.

const WorkerMessages = require('../modules/core/worker-messages.js');
const pick = (store, keys) => Object.fromEntries([].concat(keys).filter(key => key in store).map(key => [key, store[key]]));

const URL_OF_PAGE = 'https://site.test/page';
const CACHED = { detectionCount: 1, detectionResults: [{ detector: { id: 'detect-x', name: 'X' }, confidence: 90, matches: [] }], expiry: 9e15, timestamp: 1, cacheScope: 'full' };

function worker({ store = { scrapfly_enabled: true }, get, stored = null, tabsGet, sender = { documentId: 'doc', tab: { id: 7, url: URL_OF_PAGE, incognito: false } } } = {}) {
  const sent = [];
  const badge = [];
  const webhooks = [];
  const chrome = {
    storage: { local: { get: get || (async (keys) => pick(store, keys)) } },
    action: { setBadgeText: async (value) => { badge.push(value.text); }, setBadgeBackgroundColor: async () => {} },
    runtime: { sendMessage: async () => {} },
    webNavigation: { getFrame: async () => ({ url: URL_OF_PAGE, documentId: 'doc' }) },
    tabs: {
      get: tabsGet || (async () => ({ id: 7, url: URL_OF_PAGE, title: 'A page', favIconUrl: '', incognito: false })),
      sendMessage: (tabId, data, options, callback) => {
        sent.push(data.type);
        const reply = { status: data.type === 'GET_DETECTION_STATUS' ? 'active' : 'collecting_data' };
        if (callback) callback(reply);
        return Promise.resolve(reply);
      }
    }
  };
  const { Engine, context, logs } = engineContext({
    chrome, WorkerMessages, AbortController,
    setTimeout: () => 1, clearTimeout() {}, // the pending-scan timer of a request must not keep the test process alive
    setPausedIcon() {}, startBadgeSpinner() {}, setBadgeTextColor() {},
    DetectionUtils: { getBadgeColor: () => '#000000' }
  }, { files: [...ENGINE_FILES, 'modules/core/storage-manager.js', 'modules/core/badge-constants.js'] });
  const Utils = {
    isUrlBlacklisted: async () => false, getHistorySettings: async () => ({}), shouldSkipDetection: () => false,
    isValidContentScriptTab: () => true
  };
  Engine.getStoredDetection = async () => stored;
  const dependencies = {
    chrome, Utils, CategoryManager: { getBadgeColors: async () => ({}) }, HistoryRecorder: {}, categoryManager: {}, recentDetectionRequests: new Map(),
    Settings: { sendWebhookIfEnabled: (page, results, options) => { webhooks.push({ page, results, options }); return Promise.resolve(); } },
    activeDetections: new Map()
  };
  return {
    sent, badge, webhooks, logs, context,
    pageLoad: (triggerSource = 'page_load') => Engine.handlePageLoadNotification({ url: URL_OF_PAGE, triggerSource }, sender, dependencies),
    request: async () => {
      let response;
      await Engine.handleRequestDetection({ tabId: 7 }, (value) => { response = value; }, dependencies);
      return response;
    }
  };
}

const UNREADABLE = {
  'a string that is not JSON': { scrapfly_enabled: true, scrapfly_settings: '{"detection": {"blacklistedDomains": ["site.test"' },
  'the JSON text null': { scrapfly_enabled: true, scrapfly_settings: 'null' },
  'a list': { scrapfly_enabled: true, scrapfly_settings: [] },
  'a number': { scrapfly_enabled: true, scrapfly_settings: 7 }
};
const failure = () => Object.assign(new Error('stored text: {"secret":"value"}'), { name: 'StorageReadError' });

const saidOnce = (logs, pattern) => {
  assert.equal(logs.warn.length, 1, JSON.stringify(logs.warn));
  assert.equal(logs.warn[0].length, 2, 'no error object is handed to the log');
  assert.match(logs.warn[0][1], pattern);
  assert.ok(!JSON.stringify(logs.warn).includes('secret'));
};

// ---- A page load

test('page load: with the extension on and its settings readable the page is scanned', async () => {
  const w = worker();
  await w.pageLoad();
  assert.deepEqual(w.sent, ['REQUEST_PAGE_DATA']);
  assert.deepEqual(w.logs.warn, []);
});

test('page load: a storage read that fails scans nothing and names the error', async () => {
  const w = worker({ get: async () => { throw failure(); } });
  await w.pageLoad();
  assert.deepEqual(w.sent, [], 'no scan on a guess');
  assert.deepEqual(w.badge, [], 'and no badge claiming a state nobody read');
  saidOnce(w.logs, /\(StorageReadError\)/);
});

for (const [label, store] of Object.entries(UNREADABLE)) {
  test(`page load: settings stored as ${label} scan nothing`, async () => {
    const w = worker({ store });
    await w.pageLoad();
    assert.deepEqual(w.sent, []);
    assert.deepEqual(w.badge, []);
    saidOnce(w.logs, /cannot be read/);
  });
}

test('page load: the same unreadable settings are said once for any number of pages', async () => {
  const w = worker({ store: UNREADABLE['a number'] });
  await w.pageLoad(); await w.pageLoad(); await w.pageLoad();
  assert.deepEqual(w.sent, []);
  assert.equal(w.logs.warn.length, 1);
});

test('page load: a switched-off extension still shows its off badge, whatever its settings hold', async () => {
  const w = worker({ store: { scrapfly_enabled: false, scrapfly_settings: '{broken' } });
  await w.pageLoad();
  assert.deepEqual(w.sent, []);
  assert.ok(w.badge.length > 0, 'the toolbar says it is off');
  assert.deepEqual(w.logs.warn, []);
});

test('page load: absent settings are the defaults, not a failure', async () => {
  for (const store of [{}, { scrapfly_enabled: true }, { scrapfly_enabled: true, scrapfly_settings: '{}' }, { scrapfly_settings: { settings: { detection: {} } } }]) {
    const w = worker({ store });
    await w.pageLoad();
    assert.deepEqual(w.sent, ['REQUEST_PAGE_DATA'], JSON.stringify(store));
  }
});

// ---- A scan on request

test('request: with the extension on and its settings readable a scan is requested', async () => {
  const w = worker();
  const response = await w.request();
  assert.equal(response.status, 'requested', JSON.stringify(response));
  assert.ok(w.sent.includes('RUN_DETECTION'));
});

test('request: a storage read that fails answers an error and starts no scan', async () => {
  const w = worker({ get: async () => { throw failure(); } });
  const response = await w.request();
  assert.equal(response.status, 'error');
  assert.ok(!w.sent.includes('RUN_DETECTION'));
  assert.ok(!JSON.stringify(response).includes('secret'));
  saidOnce(w.logs, /\(StorageReadError\)/);
});

for (const [label, store] of Object.entries(UNREADABLE)) {
  test(`request: settings stored as ${label} answer an error and start no scan`, async () => {
    const w = worker({ store });
    const response = await w.request();
    assert.equal(response.status, 'error');
    assert.deepEqual(w.sent, []);
    saidOnce(w.logs, /cannot be read/);
  });
}

test('request: a switched-off extension is answered as before', async () => {
  const w = worker({ store: { scrapfly_enabled: false } });
  assert.deepEqual({ ...(await w.request()) }, { status: 'error', error: 'Extension is disabled' });
});

// ---- The webhook on a cache hit

const hit = { stored: CACHED };
const unreadableTab = async () => { throw new Error('No tab with id: 7'); };

test('cache hit: the webhook is not sent for a private window when the tab cannot be read', async () => {
  const w = worker({ ...hit, tabsGet: unreadableTab, sender: { documentId: 'doc', tab: { id: 7, url: URL_OF_PAGE, incognito: true } } });
  await w.pageLoad();
  assert.equal(w.webhooks.length, 0);
});

test('cache hit: the webhook is not sent for a private window when the tab reads as private either', async () => {
  const w = worker({ ...hit, tabsGet: async () => ({ id: 7, url: URL_OF_PAGE, title: 'A page', incognito: true }), sender: { documentId: 'doc', tab: { id: 7, url: URL_OF_PAGE, incognito: true } } });
  await w.pageLoad();
  assert.equal(w.webhooks.length, 0);
});

test('cache hit: the webhook is not sent when neither the sender nor the tab can say which window it is', async () => {
  const w = worker({ ...hit, tabsGet: unreadableTab, sender: { documentId: 'doc', tab: { id: 7, url: URL_OF_PAGE } } });
  await w.pageLoad();
  assert.equal(w.webhooks.length, 0);
});

test('cache hit: a page in a normal window is sent, with the tab\'s title, and still when the tab cannot be read', async () => {
  const read = worker(hit);
  await read.pageLoad();
  assert.equal(read.webhooks.length, 1);
  assert.equal(read.webhooks[0].page.title, 'A page');
  assert.equal(read.webhooks[0].options.trigger, 'cache');

  const unread = worker({ ...hit, tabsGet: unreadableTab });
  await unread.pageLoad();
  assert.equal(unread.webhooks.length, 1, 'the sender says it is a normal window');
  assert.equal(unread.webhooks[0].page.title, 'Untitled');
});
