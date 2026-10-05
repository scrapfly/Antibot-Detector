const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Retention = require('../background/detection-cache-retention.js');

const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
// entry aged `ageH` hours, expiring `ttlH` hours after it was stored
const entry = (host, ageH, ttlH = 12) => ({ hostname: host, timestamp: NOW - ageH * HOUR, expiry: NOW - ageH * HOUR + ttlH * HOUR });

test('expired entries are removed, valid ones kept', () => {
  const storage = { a: entry('a', 1), b: entry('b', 13), c: entry('c', 400), d: entry('d', 11.9) };
  const { storage: kept, expired, evicted } = Retention.prune(storage, { now: NOW });
  assert.deepStrictEqual(Object.keys(kept).sort(), ['a', 'd']);
  assert.strictEqual(expired, 2);
  assert.strictEqual(evicted, 0);
});

test('an entry expiring exactly now counts as expired (matches the lookup rule)', () => {
  const { storage: kept } = Retention.prune({ a: { timestamp: NOW - HOUR, expiry: NOW } }, { now: NOW });
  assert.deepStrictEqual(kept, {});
});

test('null / non-object entries are dropped; entries without an expiry are kept', () => {
  const { storage: kept, expired } = Retention.prune({ a: null, b: 'x', c: { timestamp: NOW } }, { now: NOW });
  assert.deepStrictEqual(Object.keys(kept), ['c']);
  assert.strictEqual(expired, 2);
});

test('the cap evicts oldest first and never touches entries under it', () => {
  const storage = {};
  for (let i = 0; i < 10; i++) storage['k' + i] = entry('h' + i, i); // k0 newest
  const { storage: kept, expired, evicted } = Retention.prune(storage, { now: NOW, maxEntries: 6 });
  assert.deepStrictEqual(Object.keys(kept).sort(), ['k0', 'k1', 'k2', 'k3', 'k4', 'k5']);
  assert.strictEqual(expired, 0);
  assert.strictEqual(evicted, 4);
});

test('expired entries go before the cap is applied', () => {
  const storage = { old1: entry('o1', 20), old2: entry('o2', 30), a: entry('a', 1), b: entry('b', 2), c: entry('c', 3) };
  const { storage: kept, expired, evicted } = Retention.prune(storage, { now: NOW, maxEntries: 3 });
  assert.deepStrictEqual(Object.keys(kept).sort(), ['a', 'b', 'c']);
  assert.strictEqual(expired, 2);
  assert.strictEqual(evicted, 0);
});

test('under the cap and nothing expired: same entries, nothing removed', () => {
  const storage = { a: entry('a', 1), b: entry('b', 2) };
  const result = Retention.prune(storage, { now: NOW });
  assert.deepStrictEqual(result.storage, storage);
  assert.strictEqual(result.expired + result.evicted, 0);
});

test('default cap is 500 entries', () => {
  const storage = {};
  for (let i = 0; i < 520; i++) storage['k' + i] = { timestamp: NOW - i, expiry: NOW + HOUR };
  const { storage: kept, evicted } = Retention.prune(storage, { now: NOW });
  assert.strictEqual(Object.keys(kept).length, 500);
  assert.strictEqual(evicted, 20);
  assert.ok(kept.k0 && kept.k499 && !kept.k500);
});

// ---- Wired into the engine: storeDetection and pruneStoredDetections ------
function loadEngine(initial) {
  const store = { scrapfly_detection_storage: initial };
  const writes = [];
  const context = vm.createContext({
    console, Date, Math, JSON, Object, Array, Number, String, Promise, Set, Map,
    PatternCache: class { constructor() {} },
    Constants: { ANALYSIS_CACHE_TTL: 300000 },
    Logger: { warn() {}, error() {}, detection() {}, cache() {}, background() {}, debugMode: false },
    Utils: { getCacheScope: async () => 'domain', getSettings: async () => ({}) },
    UrlUtils: {
      hashUrl: (url) => 'hash:' + new URL(url).hostname,
      getHostnameFromUrl: (url) => { try { return new URL(url).hostname; } catch { return ''; } },
      hostnamesMatch: (a, b) => a === b,
      normalizeFaviconForStorage: () => ''
    },
    FormatUtils: { convertToMilliseconds: () => 12 * HOUR },
    chrome: {
      storage: {
        local: {
          get: async (keys) => ({ scrapfly_detection_storage: JSON.parse(JSON.stringify(store.scrapfly_detection_storage)) }),
          set: async (obj) => { writes.push(obj); Object.assign(store, JSON.parse(JSON.stringify(obj))); }
        }
      }
    }
  });
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background/detection-cache-retention.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'modules/detection/engine/detection-engine-manager.js'), 'utf8') + '\nself.DetectionEngineManager = DetectionEngineManager;', context);
  return { Engine: context.DetectionEngineManager, store, writes };
}

test('storeDetection drops expired entries of other sites in the same write', async () => {
  const now = Date.now();
  const { Engine, store, writes } = loadEngine({
    'hash:stale.example': { hostname: 'stale.example', timestamp: now - 48 * HOUR, expiry: now - 36 * HOUR },
    'hash:fresh.example': { hostname: 'fresh.example', timestamp: now - HOUR, expiry: now + HOUR }
  });
  await Engine.storeDetection('https://new.example/', { url: 'https://new.example/', hostname: 'new.example' },
    [{ id: 'x', confidence: 90, category: 'Anti-Bot', detector: { id: 'x', name: 'X' }, matches: [] }]);
  assert.strictEqual(writes.length, 1);
  assert.deepStrictEqual(Object.keys(store.scrapfly_detection_storage).sort(), ['hash:fresh.example', 'hash:new.example']);
});

test('pruneStoredDetections writes only when something was removed', async () => {
  const now = Date.now();
  const clean = loadEngine({ 'hash:a': { timestamp: now, expiry: now + HOUR } });
  assert.deepStrictEqual({ ...await clean.Engine.pruneStoredDetections() }, { expired: 0, evicted: 0 });
  assert.strictEqual(clean.writes.length, 0);

  const dirty = loadEngine({ 'hash:a': { timestamp: now, expiry: now + HOUR }, 'hash:b': { timestamp: now - 2 * HOUR, expiry: now - HOUR } });
  assert.deepStrictEqual({ ...await dirty.Engine.pruneStoredDetections() }, { expired: 1, evicted: 0 });
  assert.deepStrictEqual(Object.keys(dirty.store.scrapfly_detection_storage), ['hash:a']);
});
