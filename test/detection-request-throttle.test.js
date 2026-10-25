const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.join(__dirname, '..');
function harness() {
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
          messages.push({ tabId, type: data.type, documentId: options.documentId });
          callback?.({ status: data.type === 'GET_DETECTION_STATUS' ? 'active' : 'collecting_data' });
        }
      } }
  };
  vm.createContext(context);
  for (const file of ['modules/core/constants.js', 'utils/utils.js', 'modules/detection/engine/detection-engine-manager.js'])
    vm.runInContext(fs.readFileSync(path.join(repo, file), 'utf8'), context, { filename: file });
  vm.runInContext('globalThis.Engine = DetectionEngineManager; globalThis.RealUtils = Utils;', context);
  context.Engine.getStoredDetection = async () => null;
  context.RealUtils.isUrlBlacklisted = async () => false;
  const dependencies = { chrome: context.chrome, Utils: context.RealUtils, CategoryManager: {}, HistoryRecorder: {}, categoryManager: {}, recentDetectionRequests: new Map() };
  return {
    messages,
    advance: ms => now += ms,
    run: (documentId, url) => {
      current = { documentId, url };
      return context.Engine.handlePageLoadNotification({ url, triggerSource: 'page_load' }, { documentId, tab: { id: 7, url } }, dependencies);
    },
    manual: async (documentId, url) => {
      current = { documentId, url };
      let response;
      await context.Engine.handleRequestDetection({ tabId: 7 }, value => { response = value; }, dependencies);
      return response;
    }
  };
}
test('repeated notifications from the same document are coalesced', async () => {
  const h = harness();
  await h.run('document-a', 'https://example.test/a'); h.advance(250);
  await h.run('document-a', 'https://example.test/a');
  assert.equal(h.messages.length, 1);
});
test('a new document in the same tab is collected even inside the previous document debounce interval', async () => {
  const h = harness();
  await h.run('document-a', 'https://example.test/a'); h.advance(250);
  await h.run('document-b', 'https://example.test/b');
  assert.deepEqual(h.messages.map(m => m.documentId), ['document-a', 'document-b']);
});
test('a reload is a new document even when its URL is unchanged', async () => {
  const h = harness();
  await h.run('document-a', 'https://example.test/a'); h.advance(250);
  await h.run('document-b', 'https://example.test/a');
  assert.deepEqual(h.messages.map(m => m.documentId), ['document-a', 'document-b']);
});

test('manual and page-load requests share the same-document throttle in both directions', async () => {
  const pageFirst = harness();
  await pageFirst.run('document-a', 'https://example.test/a');
  pageFirst.advance(250);
  assert.equal((await pageFirst.manual('document-a', 'https://example.test/a')).status, 'skipped');
  assert.equal(pageFirst.messages.length, 1);

  const manualFirst = harness();
  assert.equal((await manualFirst.manual('document-a', 'https://example.test/a')).status, 'requested');
  manualFirst.advance(250);
  await manualFirst.run('document-a', 'https://example.test/a');
  assert.deepEqual(manualFirst.messages.map(m => m.type), ['GET_DETECTION_STATUS', 'RUN_DETECTION']);
});

test('a prior page-load request does not suppress a manual scan of the replacement document', async () => {
  const h = harness();
  await h.run('document-a', 'https://example.test/a');
  h.advance(250);
  assert.equal((await h.manual('document-b', 'https://example.test/a')).status, 'requested');
  assert.equal(h.messages.at(-1).documentId, 'document-b');
});

test('without document IDs, different page URLs still get independent scans', async () => {
  const h = harness();
  await h.run(undefined, 'https://example.test/a');
  h.advance(250);
  await h.run(undefined, 'https://example.test/a');
  await h.run(undefined, 'https://example.test/b');
  assert.equal(h.messages.length, 2);
});
