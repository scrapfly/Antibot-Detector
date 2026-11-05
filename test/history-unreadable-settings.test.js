const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// How much History may take is the size the person chose in Settings. When the settings cannot be read (the storage did
// not answer, the stored value is not JSON) that size is unknown, and cutting History to the default 6 MB would take the
// older entries of a person who chose 12 or 25 MB. A write, and the compaction at every worker start, cut to the largest size
// anyone can have chosen then (25 MB; 6 MB in a build without unlimitedStorage): nothing a person chose is lost, and History
// still has a ceiling while the settings stay unreadable. The failure is told once, never with the text it quotes.
// background/init.js runs here with the real StorageManager, Utils and HistoryStore, as the worker has them.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const MB = 1024 * 1024;
const settingsOf = (mb) => JSON.stringify({ timestamp: '2026-11-05T00:00:00.000Z', settings: { history: { historyMaxMB: mb, historyLimit: 0 } } });

// About 1.6 KB each: 5,000 of them are 8 MB, over the 6 MB default and under the 12 MB a person may have chosen
const entry = (i) => ({
  id: `e${i}`, url: `https://site${i}.example/`, hostname: `site${i}.example`, title: `Site ${i}`,
  timestamp: 2_000_000_000_000 - i * 60_000, detections: [], note: 'n'.repeat(1400)
});
const history = (count) => Array.from({ length: count }, (_, i) => entry(i));

function worker({ settings, unlimited = true } = {}) {
  const store = {};
  if (settings !== undefined) store.scrapfly_settings = settings;
  const state = { failSettingsRead: false };
  // What the worker would log: only warnings are kept
  const warnings = [];
  const logger = new Proxy({}, { get: (_, name) => (...args) => { if (name === 'warn') warnings.push(args); } });
  const storage = {
    store,
    get: async (keys) => {
      if (state.failSettingsRead && [].concat(keys).includes('scrapfly_settings')) throw new Error('storage is unavailable');
      return Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, store[k]]));
    },
    set: async (values) => { Object.assign(store, values); }
  };
  const noop = { init() {}, setupAlarmListener() {}, scheduleCheck() {}, initWebhookRetries() {}, shedStoredDetections() {}, syncOverrideFromStorage() {} };
  const listener = { addListener() {} };
  const ctx = vm.createContext({
    console, Date, Promise, Map, Set, JSON, Math, setTimeout,
    Logger: logger, Constants: {},
    initializationInProgress: false, initializationPromise: null,
    workerKeepaliveManager: {}, WorkerKeepaliveManager: class {},
    ensureDetectorManagerInitialized: async () => {},
    detectorManager: { initialized: true, getDetectorCount: () => 3 },
    isExtensionEnabled: async () => true, activeDetections: new Map(), detectionStates: new Map(), setBadgeTextColor: () => {},
    UpdateManager: noop, HistoryRetention: noop, HistoryBackup: noop, BackgroundTabScan: noop, HistoryWatch: noop,
    CookieTimelineRecorder: noop, BulkScanRunner: noop, SettingsRuntime: noop, DetectionEngineManager: noop, I18n: noop, DetectionCacheRetention: noop,
    chrome: {
      runtime: { onInstalled: listener, onStartup: listener, getManifest: () => ({ permissions: unlimited ? ['storage', 'unlimitedStorage'] : ['storage'] }) },
      storage: { local: storage },
      tabs: { query: async () => [] }
    }
  });
  ctx.self = ctx;
  for (const file of ['modules/core/badge-constants.js', 'modules/core/storage-manager.js', 'utils/utils.js', 'modules/core/history-store.js', 'background/init.js']) {
    vm.runInContext(read(file), ctx, { filename: file });
  }
  return { HistoryStore: ctx.HistoryStore, storage, state, warnings };
}

const stored = (w) => w.HistoryStore.parse(w.storage.store.scrapfly_history).items;

test('a write cuts History to the size the person chose: 25 MB keeps 8 MB, 6 MB takes it down', async () => {
  const wide = worker({ settings: settingsOf(25) });
  const written = await wide.HistoryStore.mutate(() => history(5000), wide.storage);
  assert.equal(written.dropped, 0);
  assert.ok(written.bytes > 6 * MB && written.bytes <= 25 * MB, `${written.bytes} bytes`);

  const narrow = worker({ settings: settingsOf(6) });
  const cut = await narrow.HistoryStore.mutate(() => history(5000), narrow.storage);
  assert.ok(cut.dropped > 0 && cut.bytes <= 6 * MB, `${cut.dropped} dropped, ${cut.bytes} bytes`);
});

test('settings that cannot be read leave History as it is: no write cuts it to the default size', async () => {
  const unreadable = [
    ['a read that fails', (w) => { w.state.failSettingsRead = true; }],
    ['text that is not JSON', (w) => { w.storage.store.scrapfly_settings = '{oops'; }],
    ['JSON that is not an object', (w) => { w.storage.store.scrapfly_settings = '42'; }]
  ];
  for (const [what, spoil] of unreadable) {
    const w = worker({ settings: settingsOf(25) });
    await w.HistoryStore.mutate(() => history(5000), w.storage);
    const before = w.storage.store.scrapfly_history.length;
    assert.ok(before > 6 * MB, 'History is larger than the default size');
    spoil(w);

    // A scan saves a page: the new entry goes in, no old one goes out
    const saved = await w.HistoryStore.mutate((items) => [entry(-1), ...items], w.storage);
    assert.equal(saved.dropped, 0, `${what}: nothing is cut for size`);
    assert.equal(stored(w).length, 5001, `${what}: every entry is still there`);
    assert.ok(w.storage.store.scrapfly_history.length > before, what);

    // The compaction that runs at every worker start
    const compacted = await w.HistoryStore.compact(w.storage);
    assert.equal(compacted.dropped, 0, `${what}: the compaction cuts nothing`);
    assert.equal(stored(w).length, 5001, what);
  }
});

test('once the settings read again, the size the person chose is applied at the next write', async () => {
  const w = worker({ settings: settingsOf(25) });
  await w.HistoryStore.mutate(() => history(5000), w.storage);
  w.state.failSettingsRead = true;
  await w.HistoryStore.mutate((items) => [entry(-1), ...items], w.storage);
  assert.equal(stored(w).length, 5001);

  w.state.failSettingsRead = false;
  w.storage.store.scrapfly_settings = settingsOf(6);
  const cut = await w.HistoryStore.mutate((items) => [entry(-2), ...items], w.storage);
  assert.ok(cut.dropped > 0 && cut.bytes <= 6 * MB, `${cut.dropped} dropped, ${cut.bytes} bytes`);
});

test('settings that were never saved are a normal read: the default 6 MB applies', async () => {
  const w = worker();
  const cut = await w.HistoryStore.mutate(() => history(5000), w.storage);
  assert.ok(cut.dropped > 0 && cut.bytes <= 6 * MB, `${cut.dropped} dropped, ${cut.bytes} bytes`);
});

test('without the unlimitedStorage permission a chosen 25 MB is still 6 MB', async () => {
  const w = worker({ settings: settingsOf(25), unlimited: false });
  const cut = await w.HistoryStore.mutate(() => history(5000), w.storage);
  assert.ok(cut.dropped > 0 && cut.bytes <= 6 * MB, `${cut.dropped} dropped, ${cut.bytes} bytes`);
});

// ---- The ceiling while the size cannot be read, and what is said about it

// About 2.9 KB each, so that a History over 25 MB is not too many objects
const heavy = (i) => ({ ...entry(i), note: 'n'.repeat(2800) });

test('while the settings cannot be read, History over the largest size is cut to it, and a build without the permission has 6 MB', async () => {
  const over = worker({ settings: settingsOf(25) });
  over.storage.store.scrapfly_history = JSON.stringify({ items: Array.from({ length: 9300 }, (_, i) => heavy(i)) });
  assert.ok(over.storage.store.scrapfly_history.length > 25 * MB, 'a History over 25 MB, as an older build or a restore can leave one');
  over.state.failSettingsRead = true;
  const cut = await over.HistoryStore.mutate((items) => [heavy(-1), ...items], over.storage);
  assert.ok(cut.dropped > 0, `${cut.dropped} dropped`);
  // (the record of what was cut adds a few bytes after the size is budgeted: a kilobyte of room)
  assert.ok(cut.bytes <= 25 * MB + 1024 && cut.bytes > 24 * MB, `${cut.bytes} bytes: down to the ceiling and no further`);
  assert.equal(stored(over)[0].id, 'e-1', 'the newest entry stays');

  const noPermission = worker({ settings: settingsOf(25), unlimited: false });
  noPermission.storage.store.scrapfly_history = JSON.stringify({ items: history(5000) });
  noPermission.state.failSettingsRead = true;
  const small = await noPermission.HistoryStore.mutate((items) => [entry(-1), ...items], noPermission.storage);
  assert.ok(small.dropped > 0 && small.bytes <= 6 * MB + 1024, `${small.dropped} dropped, ${small.bytes} bytes`);
});

test('History between 6 and 25 MB is left whole while the settings cannot be read, as a person who chose 12 or 25 MB wants', async () => {
  for (const spoil of [(w) => { w.state.failSettingsRead = true; }, (w) => { w.storage.store.scrapfly_settings = '{oops'; }]) {
    const w = worker({ settings: settingsOf(12) });
    await w.HistoryStore.mutate(() => history(6500), w.storage);
    assert.ok(w.storage.store.scrapfly_history.length > 9 * MB && w.storage.store.scrapfly_history.length < 12 * MB);
    spoil(w);
    const saved = await w.HistoryStore.mutate((items) => [entry(-1), ...items], w.storage);
    assert.equal(saved.dropped, 0);
    assert.equal(saved.budget, 25 * MB);
    assert.equal(stored(w).length, 6501);
  }
});

test('an unreadable size is told once per failure, as the kind of error, never the text of the settings; a new failure is told again', async () => {
  const w = worker({ settings: settingsOf(25) });
  w.storage.store.scrapfly_settings = '{S3CR3T-WEBHOOK-VALUE';
  for (let i = 0; i < 3; i++) await w.HistoryStore.mutate((items) => [entry(i), ...items], w.storage);
  assert.equal(w.warnings.length, 1, 'one line for three saves');
  assert.ok(!JSON.stringify(w.warnings).includes('S3CR3T'), 'the text a JSON error quotes (a webhook secret may be in it) is not logged');
  assert.ok(JSON.stringify(w.warnings).includes('SyntaxError'));

  w.storage.store.scrapfly_settings = settingsOf(25);
  await w.HistoryStore.mutate((items) => [entry(10), ...items], w.storage);
  assert.equal(w.warnings.length, 1, 'readable again: nothing to tell');
  w.state.failSettingsRead = true;
  await w.HistoryStore.mutate((items) => [entry(11), ...items], w.storage);
  await w.HistoryStore.mutate((items) => [entry(12), ...items], w.storage);
  assert.equal(w.warnings.length, 2, 'unreadable again: told again, once');
});
