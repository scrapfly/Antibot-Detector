const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Cache lookup honours the cache scope (Settings → Data): under "Path" or
// "Full URL" another page of the same site must be a miss, so it is scanned,
// while "Domain" still treats www.example.com and example.com as one site.
const root = path.join(__dirname, '..');

function engineWith(scope, storage) {
  const context = vm.createContext({
    URL, Date, JSON, Math, Map, Set, Promise, console,
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
    Logger: { warn() {}, debug() {}, detection() {}, cache() {}, error() {}, debugMode: false },
    Utils: { getCacheScope: async () => scope },
    chrome: { storage: { local: {
      get: async () => ({ scrapfly_detection_storage: storage }),
      set: async () => {}
    } } },
    CustomEvent: class {}
  });
  for (const file of ['utils/url-utils.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
    'modules/detection/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
    ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(n => `modules/detection/engine/detection-engine-${n}.js`)]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  const Engine = vm.runInContext('DetectionEngineManager', context);
  const UrlUtils = vm.runInContext('UrlUtils', context);
  assert.strictEqual(Engine.STORAGE_KEY, 'scrapfly_detection_storage');
  return { Engine, UrlUtils };
}

const NOW = Date.now();
const entry = (url, scope) => ({ url, hostname: new URL(url).hostname, cacheScope: scope, timestamp: NOW, expiry: NOW + 3600000,
  detectionCount: 1, detectionResults: [{ id: `seen-on ${url}` }] });

function store(UrlUtils, entries) {
  return Object.fromEntries(entries.map(([url, scope]) => [UrlUtils.hashUrl(url, scope), entry(url, scope)]));
}

test('"Full URL": another page of the same site is a cache miss', async () => {
  const { UrlUtils } = engineWith('full', {});
  const storage = store(UrlUtils, [['https://site.test/demo/a', 'full']]);
  const { Engine } = engineWith('full', storage);
  assert.strictEqual(await Engine.getStoredDetection('https://site.test/demo/b'), null);
  assert.strictEqual((await Engine.getStoredDetection('https://site.test/demo/a')).url, 'https://site.test/demo/a');
});

test('"Path": a domain-scope entry is not reused, the same path is', async () => {
  const { UrlUtils } = engineWith('path', {});
  const storage = store(UrlUtils, [['https://site.test/', 'domain'], ['https://site.test/a?x=1', 'full']]);
  const { Engine } = engineWith('path', storage);
  assert.strictEqual(await Engine.getStoredDetection('https://site.test/b'), null);
  assert.strictEqual((await Engine.getStoredDetection('https://site.test/a?x=1')).url, 'https://site.test/a?x=1');
});

test('"Domain": www and the bare host share one result', async () => {
  const { UrlUtils } = engineWith('domain', {});
  const storage = store(UrlUtils, [['https://www.site.test/x', 'domain']]);
  const { Engine } = engineWith('domain', storage);
  assert.strictEqual((await Engine.getStoredDetection('https://site.test/y')).url, 'https://www.site.test/x');
});
