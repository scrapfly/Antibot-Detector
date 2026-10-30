const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Cache lookup honours the cache scope (Settings → Data): under "Path" or
// "Full URL" another page of the same site must be a miss, so it is scanned,
// while "Domain" still treats www.example.com and example.com as one site.
const root = path.join(__dirname, '..');

function engineWith(scope, storage, tabs = {}) {
  const context = vm.createContext({
    URL, Date, JSON, Math, Map, Set, Promise, console,
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
    Logger: { warn() {}, debug() {}, detection() {}, cache() {}, error() {}, debugMode: false },
    Utils: { getCacheScope: async () => scope },
    chrome: { storage: { local: {
      get: async () => ({ scrapfly_detection_storage: storage }),
      set: async () => {}
    } }, tabs: { get: async (id) => tabs[id] } },
    CustomEvent: class {}
  });
  for (const file of ['utils/url-utils.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
    'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
    ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(n => `modules/detection/engine/detection-engine-${n}.js`)]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  const Engine = vm.runInContext('DetectionEngineManager', context);
  const UrlUtils = vm.runInContext('UrlUtils', context);
  assert.strictEqual(Engine.STORAGE_KEY, 'scrapfly_detection_storage');
  return { Engine, UrlUtils, context };
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

test('a page scanned in a private window answers only a private window, whoever asks without saying', async () => {
  const { UrlUtils } = engineWith('domain', {});
  const url = 'https://site.test/';
  const key = UrlUtils.hashUrl(url, 'domain');
  const storage = { [key]: { ...entry(url, 'domain'), privateWindow: true } };
  const tabs = { 1: { id: 1, url, incognito: false }, 2: { id: 2, url, incognito: true } };
  const { Engine } = engineWith('domain', storage, tabs);
  assert.strictEqual(await Engine.getStoredDetection(url), null, 'a caller that does not say is a normal window');
  assert.strictEqual(await Engine.getStoredDetection(url, { privateWindow: false }), null);
  assert.strictEqual((await Engine.getStoredDetection(url, { privateWindow: true })).url, url);
  assert.strictEqual(await Engine.getDetectionData(1), null, 'the popup of a normal tab on the same page');
  assert.strictEqual((await Engine.getDetectionData(2)).fromStorage, true, 'the popup of the private tab itself');
});

test('a Bulk scan tab scans every page fresh; a watchlist check and any other tab do not', () => {
  const { Engine, context } = engineWith('domain', {});
  assert.strictEqual(Engine.scansFresh(7), false, 'no scan tabs at all');
  context.BackgroundTabScan = { isScanTab: (id) => id === 7 || id === 8, isQuiet: (id) => id === 8 };
  assert.strictEqual(Engine.scansFresh(7), true, 'Bulk scan');
  assert.strictEqual(Engine.scansFresh(8), false, 'watchlist check (quiet)');
  assert.strictEqual(Engine.scansFresh(9), false, 'a person\'s tab');
});

test('a port that is not the scheme\'s own is another site: its own key, and no hostname fallback across ports', async () => {
  const { UrlUtils } = engineWith('domain', {});
  for (const scope of ['domain', 'path']) {
    assert.notStrictEqual(UrlUtils.hashUrl('http://localhost:3000/app', scope), UrlUtils.hashUrl('http://localhost:8080/app', scope), `${scope}: two dev servers`);
    assert.strictEqual(UrlUtils.hashUrl('https://a.example.com:443/x', scope), UrlUtils.hashUrl('https://a.example.com/x', scope), `${scope}: the scheme's own port is none`);
  }
  const storage = store(UrlUtils, [['http://localhost:3000/app', 'domain']]);
  const { Engine } = engineWith('domain', storage);
  assert.strictEqual((await Engine.getStoredDetection('http://localhost:3000/other')).url, 'http://localhost:3000/app', 'the same port: the site\'s result');
  assert.strictEqual(await Engine.getStoredDetection('http://localhost:8080/app'), null, 'another port: a scan of its own, not the other server\'s result');
  const www = store(UrlUtils, [['https://www.shop.example/', 'domain']]);
  assert.ok(await engineWith('domain', www).Engine.getStoredDetection('https://shop.example/'), 'www and the bare host still share one result');
});

test('Clear cache removes every entry a lookup of that page could be answered from, not only one key', async () => {
  const { UrlUtils } = engineWith('domain', {});
  const storage = store(UrlUtils, [['https://www.example.com/', 'domain'], ['https://example.com/', 'domain'], ['https://other.example.org/', 'domain'], ['http://localhost:3000/', 'domain']]);
  storage[UrlUtils.hashUrl('https://example.com/page', 'path')] = entry('https://example.com/page', 'path');
  const { Engine, context } = engineWith('domain', storage);
  context.Utils.getCacheScope = async () => 'domain';
  const answers = [];
  await Engine.handleClearDetectionCache({ url: 'https://example.com/page' }, (response) => answers.push(response.status));
  assert.deepEqual(answers, ['cleared']);
  assert.strictEqual(await Engine.getStoredDetection('https://example.com/page'), null, 'a reload is not served from the www or path entry');
  assert.strictEqual(await Engine.getStoredDetection('https://www.example.com/'), null);
  assert.ok(await Engine.getStoredDetection('https://other.example.org/'), 'another site keeps its result');
  assert.ok(await Engine.getStoredDetection('http://localhost:3000/'), 'and so does another port');
  const again = [];
  await Engine.handleClearDetectionCache({ url: 'https://example.com/page' }, (response) => again.push(response.status));
  assert.deepEqual(again, ['not_found'], 'nothing left to clear');
});

