const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Copy evidence names a DOM match by its selector. A DOM match's value is "selector=text", and a saved result kept only the
// value: after the popup was opened again, "iframe[src^='https://client-api.arkoselabs.com/fc/']" was copied as "iframe[src^"
// (cut at the first "="). A saved match keeps its selector (and a cookie's or header's name), and results saved before that
// are read without cutting a selector at an "=" inside its brackets or quotes.

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { signal, evidenceMarkdown } = require('../modules/core/detection-summary.js');
const ARKOSE = "iframe[src^='https://client-api.arkoselabs.com/fc/']";

function loadEngine() {
  const store = { scrapfly_detection_storage: {} };
  const context = vm.createContext({
    console, Date, Math, JSON, Object, Array, Number, String, Promise, Set, Map,
    PatternCache: class { constructor() {} },
    Constants: { ANALYSIS_CACHE_TTL: 300000 },
    Logger: { warn() {}, error() {}, debug() {}, detection() {}, cache() {}, background() {}, debugMode: false },
    Utils: { getCacheScope: async () => 'url', getSettings: async () => ({}) },
    UrlUtils: {
      hashUrl: (url) => `hash:${url}`,
      getHostnameFromUrl: (url) => { try { return new URL(url).hostname; } catch { return ''; } },
      hostnamesMatch: (a, b) => a === b,
      normalizeFaviconForStorage: () => ''
    },
    FormatUtils: { convertToMilliseconds: () => 3600000 },
    chrome: { storage: { local: {
      get: async () => JSON.parse(JSON.stringify(store)),
      set: async (obj) => { Object.assign(store, JSON.parse(JSON.stringify(obj))); }
    } } }
  });
  context.self = context;
  vm.runInContext(read('background/detection-cache-retention.js'), context);
  vm.runInContext(`${read('modules/detection/engine/detection-engine-manager.js')}\nself.DetectionEngineManager = DetectionEngineManager;`, context);
  return { Engine: context.DetectionEngineManager, store };
}

test('a saved result keeps a DOM match\'s selector and a cookie\'s name, so Copy evidence names the whole selector after reopening', async () => {
  const { Engine, store } = loadEngine();
  const url = 'https://shop.example/';
  await Engine.storeDetection(url, { url, hostname: 'shop.example' }, [{
    id: 'detect-funcaptcha', confidence: 90, category: 'CAPTCHA', detector: { id: 'detect-funcaptcha', name: 'FunCaptcha' },
    matches: [
      { type: 'dom', selector: ARKOSE, value: `${ARKOSE}=Verify you are human`, confidence: 90 },
      { type: 'cookie', name: '_arkose', value: '_arkose=abc', confidence: 40 }
    ]
  }]);
  const saved = Object.values(store.scrapfly_detection_storage)[0].detectionResults[0].matches;
  assert.equal(saved[0].selector, ARKOSE);
  assert.equal(saved[1].name, '_arkose');
  assert.equal(signal(saved[0]), ARKOSE);
  assert.equal(signal(saved[1]), '_arkose');
  const md = evidenceMarkdown({ detector: { name: 'FunCaptcha' }, confidence: 90, matches: saved });
  assert.ok(md.includes(`\`${ARKOSE}\``), md);
});

test('a result saved before keeps only "selector=text": the selector is read whole, not cut at an "=" inside it', () => {
  const dom = (value) => signal({ type: 'dom', value });
  assert.equal(dom(`${ARKOSE}=Verify you are human`), ARKOSE);
  assert.equal(dom('div[data-a="b=c"]=x=y'), 'div[data-a="b=c"]');
  assert.equal(dom('a[href*=foo]=link'), 'a[href*=foo]');
  assert.equal(dom('#challenge=Please wait'), '#challenge');
  assert.equal(dom('#challenge'), '#challenge');
  assert.equal(dom("input[name='x'], input[name=\"y\"]=a [b='c']"), "input[name='x'], input[name=\"y\"]");
  assert.equal(dom('input[name="unclosed=x'), 'input[name="unclosed=x', 'an unbalanced value is kept whole');
});

test('every bundled DOM selector with an "=" in it reads back whole from a value saved before', () => {
  const index = JSON.parse(read('detectors/index.json'));
  const selectors = [];
  for (const category of ['antibot', 'captcha', 'fingerprint']) {
    for (const id of index[category].detectors) {
      const file = path.join(root, 'detectors', category, `${id}.json`);
      if (!fs.existsSync(file)) continue;
      for (const rule of (JSON.parse(fs.readFileSync(file, 'utf8')).detection || {}).dom || []) {
        if (String(rule.selector).includes('=')) selectors.push(rule.selector);
      }
    }
  }
  assert.ok(selectors.length >= 20, `found ${selectors.length}`);
  for (const selector of selectors) {
    const expected = selector.length > 200 ? `${selector.slice(0, 199)}…` : selector;
    assert.equal(signal({ type: 'dom', value: `${selector}=Some text = with equals ×2` }), expected);
  }
});
