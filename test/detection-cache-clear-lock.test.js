const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Runs the real detection-engine-manager.js against an async fake
// chrome.storage.local. A "Clear cache" for page A that overlaps a
// storeDetection for page B must not come back: before the clear took the
// detection storage lock, B's write (based on a read taken before the clear)
// restored A while the popup was told "cleared".

const root = path.join(__dirname, '..');
const FILES = [
  'modules/core/constants.js',
  'utils/format-utils.js',
  'utils/url-utils.js',
  'utils/detection-utils.js',
  'utils/utils.js',
  'utils/pattern-cache.js',
  'modules/detection/managers/confidence-manager.js',
  'modules/detection/detection-combinations.js',
  'modules/detection/engine/detection-engine-manager.js'
];

function loadManager() {
  const store = {};
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const chrome = {
    storage: { local: {
      get: async (keys) => { await delay(5); const o = {}; for (const k of [].concat(keys)) if (k in store) o[k] = clone(store[k]); return o; },
      set: async (obj) => { await delay(5); Object.assign(store, clone(obj)); }
    } },
    runtime: { getURL: p => p }
  };
  const ctx = { chrome, console, setTimeout, clearTimeout, Date, JSON, Promise, Math, Set, Map, URL, self: {},
    Logger: new Proxy({}, { get: () => () => {} }) };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of FILES) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const DEM = vm.runInContext('DetectionEngineManager', ctx);
  vm.runInContext('Utils.getCacheScope = async () => "domain";', ctx);
  DEM.getExpiryMs = async () => 3600e3;
  return { DEM, store };
}

const detections = [{ detector: { name: 'X' }, category: 'Anti-Bot', confidence: 90, matches: [] }];
const page = (host) => ({ url: `https://${host}/`, hostname: host });
const cachedHosts = (DEM, store) => Object.values(store[DEM.STORAGE_KEY] || {}).map(e => e.hostname || e.url);

test('a cleared cache entry stays cleared when a store overlaps the clear', async () => {
  const { DEM, store } = loadManager();
  await DEM.storeDetection('https://a.com/', page('a.com'), detections);
  assert.deepStrictEqual(cachedHosts(DEM, store), ['a.com']);

  let response = null;
  await Promise.all([
    DEM.storeDetection('https://b.com/', page('b.com'), detections),
    DEM.handleClearDetectionCache({ url: 'https://a.com/', cacheScope: 'domain' }, (r) => { response = r; })
  ]);

  assert.strictEqual(response.status, 'cleared');
  assert.deepStrictEqual(cachedHosts(DEM, store), ['b.com']);
});

test('clearing a page that is not cached answers not_found and writes nothing', async () => {
  const { DEM, store } = loadManager();
  await DEM.storeDetection('https://a.com/', page('a.com'), detections);
  let response = null;
  await DEM.handleClearDetectionCache({ url: 'https://zzz.com/', cacheScope: 'domain' }, (r) => { response = r; });
  assert.strictEqual(response.status, 'not_found');
  assert.deepStrictEqual(cachedHosts(DEM, store), ['a.com']);
});
