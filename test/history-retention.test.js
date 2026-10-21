const { test } = require('node:test');
const assert = require('node:assert');

const HistoryRetention = require('../background/history-retention.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);
const entry = (id, ageDays) => ({ id, timestamp: NOW - ageDays * DAY });

test('auto-delete removes entries older than N days and keeps newer ones', () => {
  const items = [entry('a', 1), entry('b', 29), entry('c', 31), entry('d', 400)];
  const { items: kept, removed } = HistoryRetention.prune(items, { autoDelete: true, days: 30, limit: 0 }, NOW);
  assert.deepStrictEqual(kept.map((i) => i.id), ['a', 'b']);
  assert.strictEqual(removed, 2);
});

test('auto-delete off keeps old entries', () => {
  const items = [entry('a', 1), entry('b', 400)];
  const { items: kept, removed } = HistoryRetention.prune(items, { autoDelete: false, days: 30, limit: 0 }, NOW);
  assert.strictEqual(kept.length, 2);
  assert.strictEqual(removed, 0);
});

test('ISO-string timestamps are honoured; unreadable ones are kept', () => {
  const items = [
    { id: 'iso-old', timestamp: new Date(NOW - 10 * DAY).toISOString() },
    { id: 'iso-new', timestamp: new Date(NOW - 1 * DAY).toISOString() },
    { id: 'garbage', timestamp: 'not a date' },
    { id: 'missing' }
  ];
  const { items: kept } = HistoryRetention.prune(items, { autoDelete: true, days: 7, limit: 0 }, NOW);
  assert.deepStrictEqual(kept.map((i) => i.id), ['iso-new', 'garbage', 'missing']);
});

test('limit 0 applies the 1,000-entry safety cap, keeping the newest (head)', () => {
  const items = Array.from({ length: 1005 }, (_, i) => entry(`e${i}`, 0));
  const config = HistoryRetention.getConfig({ history: { historyLimit: 0 } });
  const { items: kept, removed } = HistoryRetention.prune(items, config, NOW);
  assert.strictEqual(kept.length, 1000);
  assert.strictEqual(kept[0].id, 'e0');
  assert.strictEqual(removed, 5);
});

test('getConfig reads the settings and clamps the day count to 1-3650', () => {
  assert.deepStrictEqual(
    HistoryRetention.getConfig({ history: { historyAutoDelete: true, historyAutoDeleteDays: 90, historyLimit: 50 } }),
    { autoDelete: true, days: 90, fingerprintDays: 0, limit: 50, clearOnClose: false }
  );
  assert.strictEqual(HistoryRetention.getConfig({ history: { historyClearOnClose: true } }).clearOnClose, true);
  assert.strictEqual(HistoryRetention.getConfig({ history: { historyAutoDeleteDays: 0 } }).days, 1);
  assert.strictEqual(HistoryRetention.getConfig({ history: { historyAutoDeleteDays: 99999 } }).days, 3650);
  assert.strictEqual(HistoryRetention.getConfig({}).autoDelete, false);
  assert.strictEqual(HistoryRetention.getConfig({}).days, 30);
});

test('parseStored accepts the JSON-string container, arrays and junk', () => {
  const stored = JSON.stringify({ items: [entry('a', 1)], lastUpdated: 1 });
  assert.strictEqual(HistoryRetention.parseStored(stored).items.length, 1);
  assert.strictEqual(HistoryRetention.parseStored([entry('a', 1)]).items.length, 1);
  assert.deepStrictEqual(HistoryRetention.parseStored('{oops').items, []);
  assert.deepStrictEqual(HistoryRetention.parseStored(undefined).items, []);
});

test('run() prunes storage and writes only when something was removed', async () => {
  const store = {
    scrapfly_settings: JSON.stringify({ settings: { history: { historyAutoDelete: true, historyAutoDeleteDays: 30, historyLimit: 0 } } }),
    scrapfly_history: JSON.stringify({ items: [entry('new', 1), entry('old', 45)], lastUpdated: 1 })
  };
  let writes = 0;
  global.chrome = {
    storage: { local: {
      get: async (keys) => Object.fromEntries(keys.map((k) => [k, store[k]])),
      set: async (obj) => { writes += 1; Object.assign(store, obj); }
    } }
  };
  const realNow = Date.now;
  Date.now = () => NOW;
  try {
    assert.strictEqual(await HistoryRetention.run('test'), 1);
    assert.deepStrictEqual(JSON.parse(store.scrapfly_history).items.map((i) => i.id), ['new']);
    assert.strictEqual(await HistoryRetention.run('test'), 0);
    assert.strictEqual(writes, 1);
  } finally {
    Date.now = realNow;
    delete global.chrome;
  }
});

// ---- Fingerprinting-only pages have a clock of their own

const detection = (category, name = 'X') => ({ category, detector: { name } });
const fingerprintOnly = (id, ageDays, extra = {}) => ({ id, timestamp: NOW - ageDays * DAY, detections: [detection('fingerprint', 'Canvas'), detection('fingerprint', 'Audio')], ...extra });
const protectedPage = (id, ageDays, extra = {}) => ({ id, timestamp: NOW - ageDays * DAY, detections: [detection('antibot', 'Cloudflare'), detection('fingerprint', 'Canvas')], ...extra });

test('fingerprinting-only pages are removed after their own number of days, whatever auto-delete says', () => {
  const items = [fingerprintOnly('fp-new', 2), fingerprintOnly('fp-old', 10), protectedPage('guarded-old', 400), entry('bare-old', 400), fingerprintOnly('fp-fresh', 6.5)];
  const { items: kept, removed } = HistoryRetention.prune(items, { autoDelete: false, days: 30, fingerprintDays: 7, limit: 0 }, NOW);
  assert.deepStrictEqual(kept.map(i => i.id), ['fp-new', 'guarded-old', 'bare-old', 'fp-fresh']);
  assert.strictEqual(removed, 1);
});

test('a page with an anti-bot or CAPTCHA protection is not fingerprinting-only, and a page with no detections is not either', () => {
  const items = [protectedPage('a', 100), { id: 'none', timestamp: NOW - 100 * DAY, detections: [] }, { id: 'missing', timestamp: NOW - 100 * DAY }, { id: 'captcha', timestamp: NOW - 100 * DAY, detections: [detection('captcha', 'reCAPTCHA')] }];
  const { removed } = HistoryRetention.prune(items, { autoDelete: false, days: 30, fingerprintDays: 1, limit: 0 }, NOW);
  assert.strictEqual(removed, 0);
});

test('pinned fingerprinting-only pages stay, and a page with no readable date stays', () => {
  const items = [fingerprintOnly('pinned', 100, { pinned: true }), fingerprintOnly('undated', 0, { timestamp: 'not a date' })];
  assert.strictEqual(HistoryRetention.prune(items, { autoDelete: false, days: 30, fingerprintDays: 1, limit: 0 }, NOW).removed, 0);
});

test('0 means fingerprinting-only pages are kept like every other page; the two rules add up when both are on', () => {
  const items = [fingerprintOnly('fp', 100), protectedPage('guarded', 100)];
  assert.strictEqual(HistoryRetention.prune(items, { autoDelete: false, days: 30, fingerprintDays: 0, limit: 0 }, NOW).removed, 0);
  assert.strictEqual(HistoryRetention.prune(items, { autoDelete: true, days: 365, fingerprintDays: 30, limit: 0 }, NOW).removed, 1, 'only the fingerprinting-only page is past its clock');
  assert.strictEqual(HistoryRetention.prune(items, { autoDelete: true, days: 30, fingerprintDays: 365, limit: 0 }, NOW).removed, 2, 'auto-delete still takes the others');
});

test('the number of days is a whole number from 0 to 3650', () => {
  const n = (value) => HistoryRetention.getConfig({ history: { historyFingerprintDays: value } }).fingerprintDays;
  assert.deepStrictEqual([n(undefined), n(null), n('x'), n(-5), n(0), n('7'), n(7.9), n(99999)], [0, 0, 0, 0, 0, 7, 7, 3650]);
});

test('the periodic alarm runs for the fingerprinting-only rule alone, and stops when neither rule is on', async () => {
  const alarms = new Map();
  global.chrome = { alarms: {
    get: async (name) => alarms.get(name),
    create: (name, info) => alarms.set(name, info),
    clear: async (name) => alarms.delete(name)
  } };
  try {
    await HistoryRetention.syncAlarm({ autoDelete: false, fingerprintDays: 7 });
    assert.ok(alarms.has(HistoryRetention.ALARM_NAME), 'only the fingerprinting rule is set');
    await HistoryRetention.syncAlarm({ autoDelete: true, fingerprintDays: 0 });
    assert.ok(alarms.has(HistoryRetention.ALARM_NAME));
    await HistoryRetention.syncAlarm({ autoDelete: false, fingerprintDays: 0 });
    assert.ok(!alarms.has(HistoryRetention.ALARM_NAME));
  } finally {
    delete global.chrome;
  }
});

test('run() applies the fingerprinting-only rule from the saved settings', async () => {
  const store = {
    scrapfly_settings: JSON.stringify({ settings: { history: { historyAutoDelete: false, historyFingerprintDays: 7, historyLimit: 0 } } }),
    scrapfly_history: JSON.stringify({ items: [fingerprintOnly('fp-old', 20), protectedPage('guarded-old', 20), fingerprintOnly('fp-pinned', 20, { pinned: true })], lastUpdated: 1 })
  };
  global.chrome = { storage: { local: {
    get: async (keys) => Object.fromEntries(keys.map((k) => [k, store[k]])),
    set: async (obj) => { Object.assign(store, obj); }
  } } };
  const realNow = Date.now;
  Date.now = () => NOW;
  try {
    assert.strictEqual(await HistoryRetention.run('test'), 1);
    assert.deepStrictEqual(JSON.parse(store.scrapfly_history).items.map((i) => i.id), ['guarded-old', 'fp-pinned']);
  } finally {
    Date.now = realNow;
    delete global.chrome;
  }
});

// ---- A new History size, or a permission taken away, is applied when Settings are saved

test('saving Settings fits History to the size in force at once; other runs leave a History that fits alone', async () => {
  const MB = 1024 * 1024;
  const store = {
    scrapfly_settings: JSON.stringify({ settings: { history: { historyLimit: 100000 } } })
  };
  const big = (id) => ({ id, url: `https://${id}.example/`, hostname: `${id}.example`, title: id, timestamp: NOW, detections: [{ detector: { name: 'X' }, category: 'Anti-Bot', confidence: 90, matches: [{ type: 'content', value: 'v'.repeat(250) }] }], note: 'n'.repeat(250) });
  const items = Array.from({ length: 30000 }, (_, i) => big(`e${i}`));
  const HistoryStore = require('../modules/core/history-store.js');
  global.chrome = { storage: { local: {
    get: async (keys) => Object.fromEntries([].concat(keys).filter(k => k in store).map((k) => [k, store[k]])),
    set: async (obj) => { Object.assign(store, obj); }
  } } };
  try {
    HistoryStore.setBudget(async () => 25 * MB);
    await HistoryStore.mutate(() => items, global.chrome.storage.local);
    const wide = store.scrapfly_history.length;
    assert.ok(wide > 6 * MB, `${wide} bytes`);
    HistoryStore.setBudget(async () => 6 * MB);
    await HistoryRetention.run('history_write');
    assert.strictEqual(store.scrapfly_history.length, wide, 'an ordinary run does not rewrite History');
    await HistoryRetention.run('settings_saved');
    assert.ok(store.scrapfly_history.length <= 6 * MB, 'saving Settings applies the lower size');
    assert.ok(JSON.parse(store.scrapfly_history).items.length < items.length);
  } finally {
    HistoryStore.setBudget(null);
    delete global.chrome;
  }
});
