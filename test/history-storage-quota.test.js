const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// chrome.storage.local holds 10 MB for the whole extension. History used to be
// stored pretty-printed with every rule description, icon and engine field of
// every detection: a real profile reached 10.2 MB with 449 entries, after
// which every cache and history write failed with "Resource::kQuotaBytes quota
// exceeded". History is now written compact, slim and under a byte budget.

const HistoryStore = require('../modules/core/history-store.js');
const Combos = require('../modules/detection/detection-combinations.js');
const root = path.join(__dirname, '..');

const QUOTA = 'Resource::kQuotaBytes quota exceeded';

// A detection as the worker finalizes it (the shape that was stored before).
// Real profile: 2.6 matches per detection on average, values ~17 characters.
function fullDetection(i, rich = false) {
  const matches = [
    { type: 'window', pattern: 'grecaptcha.render', confidence: 30, description: 'Render API of the reCAPTCHA widget', actualType: 'function', condition: 'typeof function' },
    { type: 'js_hooks', pattern: 'HTMLCanvasElement.prototype.toDataURL', value: 'toDataURL', confidence: 35, description: 'Reads rendered canvas pixels' },
    { type: 'content', pattern: 'grecaptcha', value: 'grecaptcha', confidence: 10, description: 'Script reference' }
  ];
  if (rich) {
    matches.push(
      { type: 'url', pattern: '^https://www\\.google\\.com/recaptcha/api\\.js', value: 'https://www.google.com/recaptcha/api.js',
        fullUrl: 'https://www.google.com/recaptcha/api.js?render=explicit', confidence: 60, baseConfidence: 60,
        description: 'Official reCAPTCHA JavaScript API', patternId: 'recaptcha-api', resourceType: 'script', method: 'GET' },
      { type: 'cookie', name: '_GRECAPTCHA', value: '_GRECAPTCHA=09A' + 'x'.repeat(85), confidence: 50, description: 'Cookie' },
      { type: 'header', name: '^x-long$', value: 'x-long: ' + 'y'.repeat(400), confidence: 40, description: 'Header' },
      { type: 'dom', selector: '.g-recaptcha[data-sitekey]', value: '.g-recaptcha[data-sitekey]=', confidence: 60 }
    );
  }
  return {
    detected: true,
    confidence: 70 + (i % 30),
    difficulty: 'High',
    category: i % 2 ? 'CAPTCHA' : 'fingerprint',
    detectionMethods: ['url', 'window', 'js_hooks'],
    combinations: [{ id: 'api-widget', name: 'API and widget', confidence: 85, when: { all: [{ pattern: 'a' }, { pattern: 'b' }] }, found: ['a', 'b'] }],
    detector: { id: `detect-${i}`, name: `Detector ${i}`, category: 'CAPTCHA', icon: 'recaptcha_official.png',
      description: 'A long rule description that the History views never show '.repeat(3), author: 'Scrapfly', difficulty: 'High' },
    matches
  };
}
const fullEntry = (i, detections = 12, rich = false) => ({
  id: `detection_${i}`, url: `https://site${i}.example/path`, hostname: `site${i}.example`, title: `Site ${i}`,
  favicon: `https://site${i}.example/favicon.ico`, timestamp: 2_000_000_000_000 - i * 60_000,
  detections: Array.from({ length: detections }, (_, k) => fullDetection(k, rich)), detectionCount: detections,
  categories: ['CAPTCHA', 'fingerprint'], cacheScope: 'domain'
});

function memoryStorage({ quota = Infinity, others = 0 } = {}) {
  const store = {};
  const used = () => others + Object.values(store).reduce((sum, value) => sum + JSON.stringify(value).length, 0);
  return {
    store,
    sets: 0,
    async get(keys) { return Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, store[k]])); },
    async set(obj) {
      this.sets += 1;
      const next = { ...store, ...obj };
      const size = others + Object.values(next).reduce((sum, value) => sum + JSON.stringify(value).length, 0);
      if (size > quota) throw new Error(QUOTA);
      Object.assign(store, obj);
    },
    used
  };
}

test('slim entries keep exactly what History, Statistics and exports display', () => {
  const entry = fullEntry(1, 2, true);
  const slim = HistoryStore.slimEntry(entry);
  // Entry fields untouched
  for (const key of ['id', 'url', 'hostname', 'title', 'favicon', 'timestamp', 'detectionCount', 'categories', 'cacheScope']) {
    assert.deepStrictEqual(slim[key], entry[key], key);
  }
  const d = slim.detections[1];
  assert.deepStrictEqual(d.detector, { id: 'detect-1', name: 'Detector 1' });
  assert.strictEqual(d.category, 'CAPTCHA');
  assert.strictEqual(d.difficulty, 'High');
  assert.strictEqual(d.confidence, 71);
  // The checklist is rebuilt from the rule: id, score and a key of the rule; the name comes from the rule
  assert.deepStrictEqual(d.combinations, [{ id: 'api-widget', confidence: 85, h: Combos.treeKey({ all: [{ pattern: 'a' }, { pattern: 'b' }] }) }]);
  assert.ok(!('comboFound' in d), 'both rows are implied by the rule');
  // The value each renderer shows (fullUrl > value > name > selector > pattern) survives
  const shown = m => m.fullUrl || m.value || m.name || m.selector || m.pattern;
  entry.detections[1].matches.forEach((match, i) => {
    const kept = d.matches[i];
    assert.strictEqual(kept.type, match.type);
    assert.strictEqual(kept.confidence, match.confidence);
    const original = shown(match);
    assert.strictEqual(shown(kept), original.length > 300 ? `${original.slice(0, 300)}…` : original);
  });
  for (const gone of ['description', 'icon', 'author']) assert.ok(!(gone in d.detector), gone);
  for (const gone of ['detected', 'detectionMethods']) assert.ok(!(gone in d), gone);
  for (const match of d.matches) {
    for (const gone of ['description', 'patternId', 'baseConfidence', 'resourceType', 'method', 'actualType', 'condition']) {
      assert.ok(!(gone in match), gone);
    }
  }
  // Idempotent
  assert.deepStrictEqual(HistoryStore.slimEntry(slim), slim);
});

test('combination checklists keep only the found rows the rule does not imply', () => {
  const when = { all: [{ pattern: 'sdk' }, { any: [{ pattern: 'render' }, { pattern: 'execute' }] }, { not: { pattern: 'block' } }] };
  const detection = { confidence: 90, matches: [], combinations: [
    { id: 'api', name: 'SDK and an API', confidence: 90, when, found: ['sdk', 'render'] },
    { id: 'pair', name: 'SDK and widget', confidence: 70, when: { all: [{ pattern: 'sdk' }, { pattern: 'widget' }] }, found: ['sdk', 'widget'] }
  ] };
  const slim = HistoryStore.slimEntry({ id: 'e', detections: [detection] }).detections[0];
  assert.deepStrictEqual(slim.combinations, [
    { id: 'api', confidence: 90, h: Combos.treeKey(when) },
    { id: 'pair', confidence: 70, h: Combos.treeKey(detection.combinations[1].when) }
  ]);
  assert.deepStrictEqual(slim.comboFound, ['render']);
  assert.deepStrictEqual(HistoryStore.slimEntry({ id: 'e', detections: [slim] }).detections[0], slim, 'idempotent');
  // Entries saved before checklists keep their name; a combination without an id keeps its name too
  const old = HistoryStore.slimEntry({ id: 'o', detections: [{ combinations: [{ id: 'x', name: 'Old', confidence: 50 }, { name: 'No id', confidence: 40, when }] }] });
  assert.deepStrictEqual(old.detections[0].combinations, [{ id: 'x', name: 'Old', confidence: 50 }, { name: 'No id', confidence: 40 }]);
  // At most 32 stored rows per detection
  const many = Array.from({ length: 40 }, (_, i) => ({ pattern: `p${i}` }));
  const wide = HistoryStore.slimEntry({ id: 'w', detections: [{ combinations: [{ id: 'w', confidence: 10, when: { any: many }, found: many.map(m => m.pattern) }] }] });
  assert.strictEqual(wide.detections[0].comboFound.length, 32);
});

test('a full 1,000-entry history fits even with the real combination names and ids', async () => {
  // Every detection carrying one of the shipped combinations: real names average
  // about 47 characters, far longer than the fixture's. Found: what the rule
  // requires plus one alternative of each "one of" / "at least" group, as on a
  // typical page.
  const typicalFound = (when) => {
    const out = new Set(Combos.mustHaveFound(when));
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      const options = node.any || node.of;
      if (options) {
        const count = node.of ? Number(node.atLeast) || 1 : 1;
        options.slice(0, count).forEach(option => Combos.mustHaveFound(option).forEach(id => out.add(id)));
      }
      (node.all || []).forEach(walk);
    };
    walk(when);
    return [...out];
  };
  const combos = [];
  for (const category of ['antibot', 'captcha', 'fingerprint']) {
    const dir = path.join(root, 'detectors', category);
    for (const file of fs.readdirSync(dir)) combos.push(...(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).combinations || []));
  }
  assert.ok(combos.length > 200);
  const items = Array.from({ length: 1000 }, (_, i) => {
    const entry = fullEntry(i, 15);
    entry.detections.forEach((detection, k) => {
      const combo = combos[(i * 15 + k) % combos.length];
      detection.combinations = [{ ...combo, found: typicalFound(combo.when) }];
    });
    return entry;
  });
  const storage = memoryStorage();
  const { items: kept } = await HistoryStore.mutate(() => items, storage);
  assert.strictEqual(kept.length, 1000);
  assert.ok(storage.store[HistoryStore.STORAGE_KEY].length < HistoryStore.MAX_BYTES);
});

test('legacy and odd shapes pass through without throwing', () => {
  assert.deepStrictEqual(HistoryStore.slimEntry({ id: 'x' }), { id: 'x' });
  const slim = HistoryStore.slimEntry({ id: 'y', detections: [null, 'Cloudflare', { detector: 'Akamai', confidence: 90, matches: [null, { type: 'url' }] }] });
  assert.deepStrictEqual(slim.detections, [null, 'Cloudflare', { detector: 'Akamai', confidence: 90, matches: [{ type: 'url' }] }]);
});

test('the real History renderers produce the same text from slim entries', () => {
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, URL, Intl,
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: require('../utils/format-utils.js'),
    chrome: { runtime: { getURL: p => p } }
  });
  context.self = context; context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/history/history.js'), 'utf8') + '\n;globalThis.History = History;', context);
  const view = Object.create(context.History.prototype);
  view.detectorManager = null;
  view.getMethodLabel = type => type;
  const entry = fullEntry(3, 4, true);
  const slim = HistoryStore.slimEntry(entry);
  // Values over 300 characters are cut with an ellipsis; everything else is identical
  const clip = text => text.replace(/y{200,}(?:…|%E2%80%A6)?/g, 'CLIPPED');
  assert.strictEqual(clip(view.formatHistoryItemText(slim)), clip(view.formatHistoryItemText(entry)));
  assert.strictEqual(clip(view.renderDetectionMethods(slim.detections[0].matches)), clip(view.renderDetectionMethods(entry.detections[0].matches)));
});

test('writes are compact JSON and stay under the byte budget, newest first', async () => {
  const storage = memoryStorage();
  // Heavy entries (7 matches per detection with long values) force the budget
  const items = Array.from({ length: 1500 }, (_, i) => fullEntry(i, 12, true));
  const { items: kept, changed, dropped } = await HistoryStore.mutate(() => items, storage);
  assert.ok(changed);
  const raw = storage.store[HistoryStore.STORAGE_KEY];
  assert.ok(!raw.includes('\n'), 'no pretty-printing');
  assert.ok(raw.length <= HistoryStore.MAX_BYTES, `${raw.length} > budget`);
  assert.ok(kept.length > 0 && dropped > 0, 'over-budget history is trimmed, not rejected');
  assert.strictEqual(dropped, items.length - kept.length);
  assert.deepStrictEqual(HistoryStore.parse(raw).items.map(i => i.id), items.slice(0, kept.length).map(i => i.id));
});

test('a full 1,000-entry history of typical pages fits the budget', async () => {
  const storage = memoryStorage();
  // 15 detections per page, about 2.6 matches each: the median entry on the reported profile
  const items = Array.from({ length: 1000 }, (_, i) => fullEntry(i, 15));
  const { items: kept } = await HistoryStore.mutate(() => items, storage);
  assert.strictEqual(kept.length, 1000);
  assert.ok(storage.store[HistoryStore.STORAGE_KEY].length < HistoryStore.MAX_BYTES);
});

test('on a quota error the detection cache gives up space before any history entry', async () => {
  const storage = memoryStorage({ quota: 10 * 1024 * 1024, others: 0 });
  storage.store.scrapfly_detection_storage = { big: 'z'.repeat(9 * 1024 * 1024) };
  let relieved = 0;
  HistoryStore.setQuotaRelief(async () => { relieved += 1; storage.store.scrapfly_detection_storage = {}; });
  try {
    const items = Array.from({ length: 200 }, (_, i) => fullEntry(i, 15));
    const { items: kept, dropped } = await HistoryStore.mutate(() => items, storage);
    assert.strictEqual(relieved, 1);
    assert.strictEqual(kept.length, 200);
    assert.strictEqual(dropped, 0);
  } finally {
    HistoryStore.setQuotaRelief(null);
  }
});

test('a write that hits the quota keeps the newest entries instead of failing', async () => {
  // Other keys already use most of the 10 MB, as on the reported profile
  const storage = memoryStorage({ quota: 10 * 1024 * 1024, others: 8.5 * 1024 * 1024 });
  const items = Array.from({ length: 600 }, (_, i) => fullEntry(i, 12, true));
  const { items: kept, dropped } = await HistoryStore.mutate(() => items, storage);
  assert.ok(kept.length > 0 && kept.length < items.length);
  assert.strictEqual(kept[0].id, 'detection_0', 'newest kept');
  assert.ok(dropped > 0);
  assert.ok(storage.used() <= 10 * 1024 * 1024);
});

test('a non-quota storage error still fails the write', async () => {
  const storage = memoryStorage();
  storage.set = async () => { throw new Error('IO error'); };
  await assert.rejects(HistoryStore.mutate(() => [fullEntry(0)], storage), /IO error/);
});

test('compact() shrinks a pretty-printed full history once and leaves a slim one alone', async () => {
  const storage = memoryStorage();
  const items = Array.from({ length: 300 }, (_, i) => fullEntry(i));
  storage.store[HistoryStore.STORAGE_KEY] = JSON.stringify({ items, lastUpdated: 1 }, null, 2);
  const first = await HistoryStore.compact(storage);
  assert.ok(first.changed);
  assert.strictEqual(first.dropped, 0);
  assert.ok(first.after < first.before / 3, `${first.before} -> ${first.after}`);
  assert.strictEqual(HistoryStore.parse(storage.store[HistoryStore.STORAGE_KEY]).items.length, 300);
  const writes = storage.sets;
  const second = await HistoryStore.compact(storage);
  assert.strictEqual(second.changed, false);
  assert.strictEqual(storage.sets, writes, 'no rewrite of an already slim history');
  assert.deepStrictEqual(await HistoryStore.compact(memoryStorage()), { changed: false, before: 0, after: 0, dropped: 0 });
});

test('compact() runs in the same queue as saves, so neither loses the other', async () => {
  const storage = memoryStorage();
  storage.store[HistoryStore.STORAGE_KEY] = JSON.stringify({ items: [fullEntry(5)] }, null, 2);
  await Promise.all([
    HistoryStore.compact(storage),
    HistoryStore.mutate(items => [fullEntry(4), ...items], storage)
  ]);
  assert.deepStrictEqual(HistoryStore.parse(storage.store[HistoryStore.STORAGE_KEY]).items.map(i => i.id), ['detection_4', 'detection_5']);
});

test('the reported 10 MB profile shape compacts to well under half of the quota', async () => {
  // 449 entries with ~15 detections each, pretty-printed, as measured on the user's browser
  const items = Array.from({ length: 449 }, (_, i) => fullEntry(i, 15));
  const storage = memoryStorage();
  storage.store[HistoryStore.STORAGE_KEY] = JSON.stringify({ items, lastUpdated: 1 }, null, 2);
  const result = await HistoryStore.compact(storage);
  assert.strictEqual(result.dropped, 0, 'every entry kept');
  assert.ok(result.after < 4 * 1024 * 1024, `${(result.after / 1048576).toFixed(1)} MB`);
});

test('storeDetection still caches the page when the quota is hit, by dropping old cache entries', async () => {
  const HOUR = 3600 * 1000;
  const now = Date.now();
  const store = {};
  let quotaHits = 0;
  // Twenty older cached pages fill the remaining space
  store.scrapfly_detection_storage = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`hash:old${i}.example`,
    { hostname: `old${i}.example`, timestamp: now - (i + 1) * 60_000, expiry: now + HOUR, detectionResults: [], blob: 'b'.repeat(4000) }]));
  store.scrapfly_history = JSON.stringify({ items: Array.from({ length: 50 }, (_, i) => fullEntry(i, 15)) });
  const limit = JSON.stringify(store.scrapfly_history).length + JSON.stringify(store.scrapfly_detection_storage).length + 500;
  const size = obj => Object.values(obj).reduce((sum, value) => sum + JSON.stringify(value).length, 0);
  const local = {
    get: async keys => Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, JSON.parse(JSON.stringify(store[k]))])),
    set: async obj => {
      if (size({ ...store, ...obj }) > limit) { quotaHits += 1; throw new Error(QUOTA); }
      Object.assign(store, JSON.parse(JSON.stringify(obj)));
    }
  };
  const logs = [];
  const context = vm.createContext({
    console, Date, Math, JSON, Object, Array, Number, String, Promise, Set, Map,
    PatternCache: class {},
    Constants: { ANALYSIS_CACHE_TTL: 300000 },
    Logger: { warn: (...a) => logs.push(['warn', ...a]), error: (...a) => logs.push(['error', ...a]), detection() {}, cache() {}, background() {}, debug() {}, debugMode: false },
    Utils: { getCacheScope: async () => 'domain', getSettings: async () => ({}) },
    UrlUtils: { hashUrl: url => 'hash:' + new URL(url).hostname, getHostnameFromUrl: url => new URL(url).hostname,
      hostnamesMatch: (a, b) => a === b, normalizeFaviconForStorage: () => '' },
    FormatUtils: { convertToMilliseconds: () => 12 * HOUR },
    chrome: { storage: { local } }
  });
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/core/history-store.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'background/detection-cache-retention.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/detection/engine/detection-engine-manager.js'), 'utf8') + '\nself.DetectionEngineManager = DetectionEngineManager;', context);
  const stored = await context.DetectionEngineManager.storeDetection('https://new.example/', { url: 'https://new.example/', hostname: 'new.example' },
    [fullDetection(1), fullDetection(2)]);
  assert.ok(stored, 'page cached');
  assert.ok(quotaHits >= 1, 'the first write really hit the quota');
  assert.ok(store.scrapfly_detection_storage['hash:new.example'], 'the new page is cached');
  assert.ok(Object.keys(store.scrapfly_detection_storage).length < 21, 'older cache entries made room');
  assert.strictEqual(HistoryStore.parse(store.scrapfly_history).items.length, 50, 'history untouched');
  assert.deepStrictEqual(logs, [], 'recovered without logging an error');
});

test('shedStoredDetections drops expired entries and the older half of the cache', async () => {
  const HOUR = 3600 * 1000;
  const now = Date.now();
  const store = { scrapfly_detection_storage: {
    a: { timestamp: now - 1000, expiry: now + HOUR }, b: { timestamp: now - 2000, expiry: now + HOUR },
    c: { timestamp: now - 3000, expiry: now + HOUR }, d: { timestamp: now - 4000, expiry: now + HOUR },
    gone: { timestamp: now - 5000, expiry: now - 1 }
  } };
  const context = vm.createContext({
    console, Date, Math, JSON, Object, Array, Number, String, Promise, Set, Map, PatternCache: class {},
    Constants: { ANALYSIS_CACHE_TTL: 300000 }, Logger: { warn() {}, error() {}, detection() {}, cache() {}, background() {}, debug() {}, debugMode: false },
    chrome: { storage: { local: { get: async () => JSON.parse(JSON.stringify(store)), set: async obj => Object.assign(store, obj) } } }
  });
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'background/detection-cache-retention.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/detection/engine/detection-engine-manager.js'), 'utf8') + '\nself.DetectionEngineManager = DetectionEngineManager;', context);
  assert.strictEqual((await context.DetectionEngineManager.shedStoredDetections()).removed, 3);
  assert.deepStrictEqual(Object.keys(store.scrapfly_detection_storage).sort(), ['a', 'b']);
});

test('a quota failure that cannot be recovered logs one short warning, not a stack dump', async () => {
  const logs = [];
  const context = vm.createContext({
    console, Date, Math, JSON, Object, Array, Number, String, Promise, Set, Map,
    PatternCache: class {},
    Constants: { ANALYSIS_CACHE_TTL: 300000 },
    Logger: { warn: (...a) => logs.push(['warn', ...a]), error: (...a) => logs.push(['error', ...a]), detection() {}, cache() {}, background() {}, debug() {}, debugMode: false },
    Utils: { getCacheScope: async () => 'domain', getSettings: async () => ({}) },
    UrlUtils: { hashUrl: () => 'hash:x', getHostnameFromUrl: () => 'x', hostnamesMatch: () => true, normalizeFaviconForStorage: () => '' },
    FormatUtils: { convertToMilliseconds: () => 1000 },
    chrome: { storage: { local: { get: async () => ({}), set: async () => { throw new Error(QUOTA); } } } }
  });
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/detection/engine/detection-engine-manager.js'), 'utf8') + '\nself.DetectionEngineManager = DetectionEngineManager;', context);
  const stored = await context.DetectionEngineManager.storeDetection('https://x/', { url: 'https://x/', hostname: 'x' }, [fullDetection(1)]);
  assert.strictEqual(stored, null);
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0][0], 'warn');
  assert.match(logs[0][2], /Storage is full/);
  assert.strictEqual(logs[0].length, 3, 'no error object attached');
});
