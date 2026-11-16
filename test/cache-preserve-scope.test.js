// A scan that found nothing keeps a still-valid positive result of the same page or site (a revisit whose signals already
// fired): only one the cache lookup itself would serve, never another port's or another page's
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
function engine(scope, stored = {}) {
  const box = typeof scope === 'object' ? scope : { v: scope };
  const context = vm.createContext({ URL, Date, JSON, Math, Map, Set, Promise, console,
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
    Logger: { warn() {}, debug() {}, detection() {}, cache() {}, error() {}, debugMode: false },
    StorageManager: { normalizeSettings: s => s || {} }, CustomEvent: class {}, setTimeout, clearTimeout,
    Utils: { getCacheScope: async () => box.v, getSettings: async () => ({ detection: {} }) },
    chrome: { storage: { local: { get: async () => ({ scrapfly_detection_storage: stored }), set: async (v) => { Object.assign(stored, v.scrapfly_detection_storage); } } } } });
  context.self = context;
  for (const file of ['utils/url-utils.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js',
    'modules/core/hooks-config.js', 'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
    ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(n => `modules/detection/engine/detection-engine-${n}.js`)]) vm.runInContext(read(file), context, { filename: file });
  return vm.runInContext('DetectionEngineManager', context);
}
const det = [{ id: 'cf', category: 'antibot', confidence: 90, detector: { id: 'cf', name: 'Cloudflare' }, matches: [{ type: 'cookie', name: '__cf_bm', confidence: 90 }] }];
test('a scan of a clean page on another port does not take the other port\'s result', async () => {
  const E = engine('domain');
  await E.storeDetection('http://localhost:3000/', { url: 'http://localhost:3000/', hostname: 'localhost' }, det);
  assert.equal(await E.getStoredDetection('http://localhost:8080/'), null, 'the lookup: another port is a miss');
  const r = await E.storeDetection('http://localhost:8080/', { url: 'http://localhost:8080/', hostname: 'localhost' }, []);
  assert.notEqual(r.preservedExisting, true);
  assert.equal(r.detectionResults.length, 0);
});

test('under "Domain", a clean page does not take another page\'s result saved under "Path"', async () => {
  const box = { v: 'path' };
  const E = engine(box);
  await E.storeDetection('https://shop.test/login', { url: 'https://shop.test/login', hostname: 'shop.test' }, det);
  box.v = 'domain';
  assert.equal(await E.getStoredDetection('https://shop.test/about'), null);
  const r = await E.storeDetection('https://shop.test/about', { url: 'https://shop.test/about', hostname: 'shop.test' }, []);
  assert.notEqual(r.preservedExisting, true);
});

test('the same site under "Domain" (www and the bare host, same port) still keeps its positive result', async () => {
  const E = engine('domain');
  await E.storeDetection('https://www.shop.test/', { url: 'https://www.shop.test/', hostname: 'www.shop.test' }, det);
  const r = await E.storeDetection('https://shop.test/x', { url: 'https://shop.test/x', hostname: 'shop.test' }, []);
  assert.equal(r.preservedExisting, true);
  assert.equal(r.detectionResults.length, 1);
});
