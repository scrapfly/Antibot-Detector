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
    { autoDelete: true, days: 90, limit: 50 }
  );
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
