const { test } = require('node:test');
const assert = require('node:assert');

const HistoryRetention = require('../background/history-retention.js');

// Pinned entries survive every cleanup, and "Clear on browser close" removes the rest
// when the last window closes (or at the next start, when the browser was killed).

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const entry = (id, ageDays, extra = {}) => ({ id, timestamp: NOW - ageDays * DAY, ...extra });
const ids = (store) => JSON.parse(store.scrapfly_history).items.map(i => i.id);

function world({ clearOnClose = true, windows = [], items } = {}) {
  const store = {
    scrapfly_settings: JSON.stringify({ settings: { history: { historyClearOnClose: clearOnClose, historyLimit: 0 } } }),
    scrapfly_history: JSON.stringify({ items: items || [entry('a', 1), entry('p', 2, { pinned: true }), entry('b', 3)] })
  };
  const listeners = { windowRemoved: [], startup: [], changed: [], alarm: [] };
  let windowQuery = null;
  global.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries([].concat(keys).map(k => [k, store[k]])),
        set: async (obj) => { Object.assign(store, obj); }
      },
      onChanged: { addListener: (fn) => listeners.changed.push(fn) }
    },
    alarms: { get: async () => null, create() {}, clear: async () => true, onAlarm: { addListener: (fn) => listeners.alarm.push(fn) } },
    windows: {
      getAll: async (query) => { windowQuery = query; return windows; },
      onRemoved: { addListener: (fn) => listeners.windowRemoved.push(fn) }
    },
    runtime: { onStartup: { addListener: (fn) => listeners.startup.push(fn) } }
  };
  return { store, listeners, query: () => windowQuery };
}
const fresh = () => Object.assign(Object.create(HistoryRetention), { _initialized: false, _timer: null });
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('prune: age and the entry limit never remove a pinned entry', () => {
  const items = [entry('n1', 1), entry('p-old', 400, { pinned: true }), entry('n2', 2), entry('n3', 3), entry('n-old', 90)];
  const byAge = HistoryRetention.prune(items, { autoDelete: true, days: 30, limit: 0 }, NOW);
  assert.deepStrictEqual(byAge.items.map(i => i.id), ['n1', 'p-old', 'n2', 'n3']);
  const byLimit = HistoryRetention.prune(items, { autoDelete: false, days: 30, limit: 2 }, NOW);
  assert.deepStrictEqual(byLimit.items.map(i => i.id), ['n1', 'p-old', 'n2']);
  assert.strictEqual(byLimit.removed, 2);
});

test('clearUnpinned removes everything except pinned entries', async () => {
  const w = world();
  try {
    assert.strictEqual(await HistoryRetention.clearUnpinned('test'), 2);
    assert.deepStrictEqual(ids(w.store), ['p']);
    assert.strictEqual(await HistoryRetention.clearUnpinned('test'), 0, 'nothing left to remove, nothing written');
  } finally { delete global.chrome; }
});

test('clearUnpinned on an empty History does nothing', async () => {
  const w = world({ items: [] });
  try {
    assert.strictEqual(await HistoryRetention.clearUnpinned('test'), 0);
    assert.deepStrictEqual(ids(w.store), []);
  } finally { delete global.chrome; }
});

test('closing a window while others remain keeps History', async () => {
  const w = world({ windows: [{ id: 2 }] });
  try {
    assert.strictEqual(await HistoryRetention.onWindowRemoved(), 0);
    assert.deepStrictEqual(ids(w.store), ['a', 'p', 'b']);
  } finally { delete global.chrome; }
});

test('closing the last window clears History except pinned entries', async () => {
  const w = world({ windows: [] });
  try {
    assert.strictEqual(await HistoryRetention.onWindowRemoved(), 2);
    assert.deepStrictEqual(ids(w.store), ['p']);
    assert.deepStrictEqual(w.query(), { windowTypes: ['normal'] });
  } finally { delete global.chrome; }
});

test('with the setting off, closing the last window keeps everything', async () => {
  const w = world({ clearOnClose: false, windows: [] });
  try {
    assert.strictEqual(await HistoryRetention.onWindowRemoved(), 0);
    assert.deepStrictEqual(ids(w.store), ['a', 'p', 'b']);
  } finally { delete global.chrome; }
});

test('init listens for window close and for browser start', async () => {
  const w = world({ windows: [] });
  try {
    const retention = fresh();
    retention.init();
    assert.strictEqual(w.listeners.windowRemoved.length, 1);
    assert.strictEqual(w.listeners.startup.length, 1);
    await settle(); // the start-up compaction and run
    w.listeners.windowRemoved[0](5);
    await settle();
    assert.deepStrictEqual(ids(w.store), ['p']);
  } finally { delete global.chrome; }
});

test('at browser start History is cleared when the browser closed without running code', async () => {
  const w = world();
  try {
    const retention = fresh();
    retention.init();
    await settle();
    w.listeners.startup[0]();
    await settle();
    assert.deepStrictEqual(ids(w.store), ['p']);
  } finally { delete global.chrome; }
});

test('at browser start nothing is cleared when the setting is off', async () => {
  const w = world({ clearOnClose: false });
  try {
    const retention = fresh();
    retention.init();
    await settle();
    w.listeners.startup[0]();
    await settle();
    assert.deepStrictEqual(ids(w.store), ['a', 'p', 'b']);
  } finally { delete global.chrome; }
});
