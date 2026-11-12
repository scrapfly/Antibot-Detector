const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// After a cache scope change, Settings sent the one-page cache clear with no address, to make the other extension pages refresh.
// The worker took it as a clear: UrlUtils.hashUrl(undefined) threw, and every scope change logged "Error clearing cache". Now the
// worker tells the other pages itself once the old results are gone, Settings sends no address-less clear, and a clear without an
// address is answered an error without one being thrown or logged.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function engine() {
  const errors = [];
  const context = vm.createContext({
    URL, Date, JSON, Math, Map, Set, Promise, console,
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
    Logger: { warn() {}, debug() {}, detection() {}, cache() {}, error: (...args) => errors.push(args), debugMode: false },
    Utils: { getCacheScope: async () => 'domain' },
    chrome: { storage: { local: { get: async () => ({}), set: async () => {} } }, tabs: { get: async () => null } },
    CustomEvent: class {}
  });
  for (const file of ['utils/url-utils.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
    'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
    ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(n => `modules/detection/engine/detection-engine-${n}.js`)]) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return { Engine: vm.runInContext('DetectionEngineManager', context), errors };
}

test('a cache clear with no address, or one that is not an address, is answered an error and logs none', async () => {
  for (const request of [{}, { url: undefined }, { url: '' }, { url: 42 }, { url: 'not a url' }]) {
    const { Engine, errors } = engine();
    const answers = [];
    await Engine.handleClearDetectionCache(request, (answer) => answers.push(answer));
    assert.deepEqual(JSON.parse(JSON.stringify(answers)), [{ status: 'error', error: 'invalid_url' }], JSON.stringify(request));
    assert.deepEqual(errors, [], `${JSON.stringify(request)}: nothing logged as an error`);
  }
});

test('the worker\'s clear handler leaves the tab alone when the request has no address', async () => {
  const touched = [];
  const context = vm.createContext({
    WorkerMessages: require('../modules/core/worker-messages.js'),
    Logger: new Proxy({}, { get: () => () => {} }),
    Constants: { RECENTLY_CLEARED_TAB_TIMEOUT: 1000 },
    BADGE: { TEXT: { CLEARED: 'CLR' }, COLORS: { CLEARED: '#999' } },
    setBadgeTextColor: async () => { touched.push('badge'); },
    chrome: { action: { setBadgeText: async () => touched.push('badge'), setBadgeBackgroundColor: async () => touched.push('badge') } },
    DetectionEngineManager: { handleClearDetectionCache: async (request, sendResponse) => { touched.push('engine'); sendResponse({ status: 'error', error: 'invalid_url' }); } },
    DetectionSessionStore: { cancel: () => touched.push('session') },
    tabsUsingCache: new Set([7]), recentlyClearedTabs: new Set(),
    setTimeout: () => 0
  });
  vm.runInContext(read('background/handlers/messages-cache.js'), context, { filename: 'messages-cache.js' });
  const answers = [];
  await context.clearTabDetectionCache({ tabId: 7 }, (answer) => answers.push(answer));
  assert.deepEqual(answers, [{ status: 'error', error: 'invalid_url' }]);
  assert.deepEqual(touched, ['engine'], 'no scan cancelled, no cleared mark');
  assert.equal(context.tabsUsingCache.has(7), true);
});

test('Settings sends no address-less clear on a scope change; the worker tells the other pages once the old results are gone', async () => {
  assert.doesNotMatch(read('sections/settings/settings-ui.js'), /notifyWorker\(WorkerMessages\.DETECTION_CLEAR_CACHE\)/);
  const order = [];
  const broadcasts = [];
  const context = vm.createContext({
    Promise, Map, Set, console, setTimeout: () => 0,
    MessageSender: require('../modules/core/message-sender.js'),
    WorkerMessages: require('../modules/core/worker-messages.js'),
    SettingsStore: { registerHandlers() {} },
    Logger: { background() {}, warn() {}, error() {}, debug() {} },
    UrlUtils: { clearUrlHashCache() {} },
    Utils: { getCacheScope: async () => 'domain' },
    Constants: { RECENTLY_CLEARED_TAB_TIMEOUT: 10000 },
    recentlyClearedTabs: new Set(), activeDetections: new Map(),
    DetectionEngineManager: { dropOtherScopes: async () => { order.push('drop'); return 1; }, getStoredDetection: async () => null },
    setBadgeForDetections: async () => {},
    chrome: {
      tabs: { query: async () => [] },
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
      runtime: { sendMessage: async (message) => { order.push('tell'); broadcasts.push(message); throw new Error('Could not establish connection. Receiving end does not exist.'); } }
    }
  });
  vm.runInContext(read('modules/core/badge-constants.js'), context, { filename: 'badge-constants.js' });
  vm.runInContext(read('background/handlers/messages-settings.js'), context, { filename: 'messages-settings.js' });
  const registry = {};
  context.registerSettingsHandlers(registry, {});
  const answer = await new Promise((resolve) => registry.CACHE_SCOPE_CHANGED({ request: {}, sender: {}, sendResponse: resolve, context: {} }));
  assert.equal(answer.success, true, 'no other page open: still a success');
  assert.deepEqual(order, ['drop', 'tell']);
  assert.deepEqual(JSON.parse(JSON.stringify(broadcasts)), [{ type: context.WorkerMessages.DETECTION_CLEAR_CACHE }]);
});
