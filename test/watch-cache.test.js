const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A watchlist check scans a page whose result is already cached. While it does, that result must neither answer (nothing
// would be scanned) nor be kept in place of an empty scan (a page that lost its protections must say so).

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function harness(scope = 'domain') {
  const stored = {};
  const context = vm.createContext({
    URL, Date, JSON, Math, Map, Set, Promise, console,
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
    Logger: { warn() {}, debug() {}, detection() {}, cache() {}, error() {}, debugMode: false },
    Utils: { getCacheScope: async () => scope, getSettings: async () => ({}) },
    chrome: { storage: { local: {
      get: async () => ({ scrapfly_detection_storage: stored }),
      set: async (values) => { Object.assign(stored, values.scrapfly_detection_storage); }
    } } },
    CustomEvent: class {}
  });
  context.self = context;
  for (const file of ['utils/url-utils.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js', 'modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js',
    'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
    ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(name => `modules/detection/engine/detection-engine-${name}.js`)]) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return { Engine: vm.runInContext('DetectionEngineManager', context), stored };
}
const found = (id) => [{ id, category: 'antibot', confidence: 90, detector: { id, name: id }, matches: [{ type: 'cookie', pattern: 'x', confidence: 90 }] }];
const URL_A = 'https://shop.example.com/product?id=1';

test('while a page is being checked its cached result does not answer, and it answers again afterwards', async () => {
  const { Engine } = harness();
  await Engine.storeDetection(URL_A, { url: URL_A, hostname: 'shop.example.com' }, found('cloudflare'));
  assert.equal((await Engine.getStoredDetection(URL_A)).detectionResults[0].id, 'cloudflare');

  Engine.bypassCache(URL_A);
  assert.equal(Engine.isCacheBypassed(URL_A), true);
  assert.equal(await Engine.getStoredDetection(URL_A), null, 'the scan must not be cut short by the cache');
  assert.equal(await Engine.getStoredDetection('https://shop.example.com/product?id=2'), null, 'the same page under another query');
  assert.equal(Engine.isCacheBypassed('https://shop.example.com/other'), false, 'another page of the site');
  assert.equal(Engine.isCacheBypassed('https://other.example.com/product'), false, 'another site');
  assert.ok(await Engine.getStoredDetection('https://shop.example.com/other'), 'under the Domain scope another page of the site still has its result');

  Engine.restoreCache(URL_A);
  assert.equal(Engine.isCacheBypassed(URL_A), false);
  assert.equal((await Engine.getStoredDetection(URL_A)).detectionResults[0].id, 'cloudflare');
});

test('two checks of the same page keep the cache aside until both are over', () => {
  const { Engine } = harness();
  Engine.bypassCache(URL_A);
  Engine.bypassCache(URL_A);
  Engine.restoreCache(URL_A);
  assert.equal(Engine.isCacheBypassed(URL_A), true);
  Engine.restoreCache(URL_A);
  assert.equal(Engine.isCacheBypassed(URL_A), false);
  Engine.restoreCache(URL_A); // one too many changes nothing
  assert.equal(Engine.isCacheBypassed(URL_A), false);
});

test('an empty scan of a page being checked is stored as empty; any other empty scan keeps the earlier positive result', async () => {
  const normal = harness();
  await normal.Engine.storeDetection(URL_A, { url: URL_A, hostname: 'shop.example.com' }, found('cloudflare'));
  const kept = await normal.Engine.storeDetection(URL_A, { url: URL_A, hostname: 'shop.example.com' }, []);
  assert.equal(kept.preservedExisting, true, 'a weak rescan does not erase a positive result');

  const check = harness();
  await check.Engine.storeDetection(URL_A, { url: URL_A, hostname: 'shop.example.com' }, found('cloudflare'));
  check.Engine.bypassCache(URL_A);
  const stored = await check.Engine.storeDetection(URL_A, { url: URL_A, hostname: 'shop.example.com' }, []);
  assert.ok(!stored.preservedExisting);
  assert.equal(stored.detectionCount, 0, 'the page no longer shows its protection, and the cache says so');
  check.Engine.restoreCache(URL_A);
  assert.equal((await check.Engine.getStoredDetection(URL_A)).detectionCount, 0);
});

test('cached by page or by full address, a clean page does not take the detections of another page of the site', async () => {
  const LOGIN = 'https://shop.example.com/login', ABOUT = 'https://shop.example.com/about';
  for (const scope of ['path', 'full']) {
    const { Engine } = harness(scope);
    await Engine.storeDetection(LOGIN, { url: LOGIN, hostname: 'shop.example.com' }, found('recaptcha'));
    const about = await Engine.storeDetection(ABOUT, { url: ABOUT, hostname: 'shop.example.com' }, []);
    assert.ok(!about.preservedExisting, `${scope}: /about found nothing and says so`);
    assert.equal((await Engine.getStoredDetection(ABOUT)).detectionCount, 0, scope);
    const login = await Engine.storeDetection(LOGIN, { url: LOGIN, hostname: 'shop.example.com' }, []);
    assert.equal(login.preservedExisting, true, `${scope}: a weak rescan of /login keeps its own result`);
  }
  const { Engine } = harness('domain');
  await Engine.storeDetection(LOGIN, { url: LOGIN, hostname: 'shop.example.com' }, found('recaptcha'));
  assert.equal((await Engine.storeDetection(ABOUT, { url: ABOUT, hostname: 'shop.example.com' }, [])).preservedExisting, true,
    'cached by site, every page of it shares the result');
});
