const { test } = require('node:test');
const assert = require('node:assert');
const HistoryStore = require('../modules/core/history-store.js');
const HistoryExport = require('../modules/core/history-export.js');

// A quota error from the browser trims History by halves; pinned entries are exempt from every other limit,
// so the halving must take the oldest unpinned entries first.
test('a quota error while saving keeps pinned entries and trims unpinned ones first', async () => {
  const LIMIT = 4000;
  const store = {};
  const storage = {
    async get(keys) { return Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, store[k]])); },
    async set(obj) {
      if (Object.values(obj).some(v => JSON.stringify(v).length > LIMIT)) throw new Error('Resource::kQuotaBytes quota exceeded');
      Object.assign(store, obj);
    }
  };
  // Newest first; the only pinned entry is the oldest
  const items = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, url: `https://a${i}.example/`, hostname: `a${i}.example`, timestamp: 2e12 - i * 1000, detections: [], ...(i === 39 ? { pinned: true, note: 'keep me' } : {}) }));
  const out = await HistoryStore.mutate(() => items, storage);
  assert.ok(out.items.some(item => item.id === 'e39' && item.pinned === true), 'the pinned entry survives the quota trim');
  const stored = HistoryStore.parse(store.scrapfly_history).items;
  assert.ok(stored.some(item => item.id === 'e39'));
});

test('an imported date written as milliseconds in text is stored as a number, so exports can date it', () => {
  const [entry] = HistoryStore.cleanImported([{ id: 'a', timestamp: '1730000000000', detections: [] }]);
  assert.strictEqual(entry.timestamp, 1730000000000);
  const built = HistoryExport.build([entry], { format: 'csv' });
  assert.match(built.text, /2024-10-27T/);
});
