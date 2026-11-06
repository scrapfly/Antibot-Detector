const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → Data → Cache scope. Under "Domain" one result stands for a whole site; under "Path" or "Full URL" a result is one
// page's. After the scope went from "Full URL" back to "Domain", the site lookup took those one-page results as the site's, and
// every page of the site was answered with another page's result for up to 7 days; the cache clear Settings sends on a scope
// change carried no address and cleared nothing. Now the site lookup only takes results saved under "Domain", and a scope change
// drops the results saved under any other scope.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const NOW = Date.now();
const entry = (url, scope, id = url) => ({ url, hostname: new URL(url).hostname, cacheScope: scope, timestamp: NOW, expiry: NOW + 3600000,
  detectionCount: 1, detectionResults: [{ id: `seen-on ${id}` }] });

function engineWith(scope, storage = {}) {
  const box = { storage, writes: 0 };
  const context = vm.createContext({
    URL, Date, JSON, Math, Map, Set, Promise, console,
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
    Logger: { warn() {}, debug() {}, detection() {}, cache() {}, error() {}, debugMode: false },
    Utils: { getCacheScope: async () => scope },
    chrome: { storage: { local: {
      get: async () => ({ scrapfly_detection_storage: JSON.parse(JSON.stringify(box.storage)) }),
      set: async (values) => { box.writes++; box.storage = JSON.parse(JSON.stringify(values.scrapfly_detection_storage)); }
    } }, tabs: { get: async () => null } },
    CustomEvent: class {}
  });
  for (const file of ['utils/url-utils.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
    'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
    ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(n => `modules/detection/engine/detection-engine-${n}.js`)]) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return { Engine: vm.runInContext('DetectionEngineManager', context), UrlUtils: vm.runInContext('UrlUtils', context), box };
}

const keyed = (UrlUtils, list) => Object.fromEntries(list.map(([url, scope]) => [UrlUtils.hashUrl(url, scope), entry(url, scope)]));

test('back under "Domain", a page is never answered with another page\'s result saved under "Full URL" or "Path"', async () => {
  const { UrlUtils } = engineWith('domain');
  const storage = keyed(UrlUtils, [['https://site.test/a?x=1', 'full'], ['https://site.test/b/c', 'path']]);
  const { Engine } = engineWith('domain', storage);
  assert.equal(await Engine.getStoredDetection('https://site.test/other'), null, 'the reviewer\'s case: another page is scanned');
  assert.equal(await Engine.getStoredDetection('https://www.site.test/'), null);
  // The page's own result is still its own
  assert.equal((await Engine.getStoredDetection('https://site.test/a?x=1')).url, 'https://site.test/a?x=1');
});

test('under "Domain", a result saved under "Domain" still answers the whole site, www and the bare host alike', async () => {
  const { UrlUtils } = engineWith('domain');
  const storage = { ...keyed(UrlUtils, [['https://www.site.test/x', 'domain']]), ...keyed(UrlUtils, [['https://site.test/a?x=1', 'full']]) };
  const { Engine } = engineWith('domain', storage);
  assert.equal((await Engine.getStoredDetection('https://site.test/y')).url, 'https://www.site.test/x');
});

test('a scope change drops the results saved under any other scope, and keeps the ones of the new scope', async () => {
  const { UrlUtils } = engineWith('domain');
  const storage = keyed(UrlUtils, [['https://a.test/', 'domain'], ['https://b.test/p?q=1', 'full'], ['https://c.test/p', 'path']]);
  storage.oldEntry = { ...entry('https://d.test/', 'domain'), cacheScope: undefined };
  const { Engine, box } = engineWith('domain', storage);
  assert.equal(typeof Engine.dropOtherScopes, 'function');
  assert.equal(await Engine.dropOtherScopes('domain'), 3);
  assert.deepEqual(Object.values(box.storage).map(stored => stored.url), ['https://a.test/']);
  assert.equal(box.writes, 1);
  assert.equal(await Engine.dropOtherScopes('domain'), 0);
  assert.equal(box.writes, 1, 'nothing to drop: nothing written');
  assert.equal(await Engine.dropOtherScopes('nonsense'), 0, 'a scope that is not one drops nothing');
});

test('the worker drops them when Settings says the scope changed (the address-less clear Settings also sends cleared nothing)', async () => {
  const dropped = [];
  const context = vm.createContext({
    Promise, Map, Set, console, setTimeout: () => 0,
    MessageSender: require('../modules/core/message-sender.js'),
    WorkerMessages: require('../modules/core/worker-messages.js'),
    SettingsStore: { registerHandlers() {} },
    Logger: { background() {}, warn() {}, error() {}, debug() {} },
    UrlUtils: { clearUrlHashCache() {} },
    Utils: { getCacheScope: async () => 'domain' },
    DetectionEngineManager: { dropOtherScopes: async (scope) => { dropped.push(scope); return 2; }, getStoredDetection: async () => null },
    chrome: { tabs: { query: async () => [] } }
  });
  vm.runInContext(read('background/handlers/messages-settings.js'), context, { filename: 'messages-settings.js' });
  const registry = {};
  context.registerSettingsHandlers(registry, {});
  // (a sender with no tab and no address is another extension context, as the popup's message reads here)
  const answer = await new Promise((resolve) => registry.CACHE_SCOPE_CHANGED({ request: {}, sender: {}, sendResponse: resolve, context: {} }));
  assert.equal(answer.success, true);
  assert.deepEqual(dropped, ['domain'], 'the results of the old scope are dropped for the scope now in force');
});
