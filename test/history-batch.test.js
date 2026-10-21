'use strict';
// History → Select: the worker applies one pin or watch change to many entries in one write.
const test = require('node:test');
const assert = require('node:assert/strict');

const HistoryStore = require('../modules/core/history-store.js');

const SENDER = { id: 'ext', url: 'chrome-extension://ext/popup.html' };
const entry = (id, extra = {}) => ({ id, url: `https://${id}.example/`, hostname: `${id}.example`, title: id, timestamp: 1_800_000_000_000, detections: [], ...extra });

function world(items) {
  const store = { scrapfly_history: JSON.stringify({ items }) };
  const storage = {
    async get(keys) { return Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, store[k]])); },
    async set(obj) { Object.assign(store, obj); }
  };
  const registry = {};
  HistoryStore.registerHandlers(registry, storage);
  globalThis.chrome = { runtime: { id: 'ext', getURL: (p) => `chrome-extension://ext/${p}` } };
  const call = (type, request, sender = SENDER) => new Promise((resolve) => {
    const handled = registry[type]({ request, sender, sendResponse: resolve });
    if (handled === false) return; // answered synchronously
  });
  const read = () => JSON.parse(store.scrapfly_history).items;
  return { call, read, store };
}

test('pinning many entries is one write; the others are untouched', async () => {
  const w = world([entry('a'), entry('b'), entry('c', { pinned: true, autoPinned: true }), entry('d')]);
  const answer = await w.call(HistoryStore.Messages.UPDATE_ITEMS, { ids: ['a', 'c', 'zzz'], patch: { pinned: true } });
  assert.equal(answer.status, 'ok');
  assert.equal(answer.updated, 2, 'an id History does not hold is not counted');
  const byId = Object.fromEntries(w.read().map(i => [i.id, i]));
  assert.equal(byId.a.pinned, true);
  assert.ok(!('autoPinned' in byId.c), 'a pin the person makes is their own');
  assert.ok(!('pinned' in byId.b) && !('pinned' in byId.d));
});

test('unpinning marks each entry so it never pins itself again, and stops its watching', async () => {
  const w = world([entry('a', { pinned: true, watch: true, watchedAt: 5 }), entry('b', { pinned: true }), entry('c')]);
  await w.call(HistoryStore.Messages.UPDATE_ITEMS, { ids: ['a', 'b', 'c'], patch: { pinned: false } });
  const byId = Object.fromEntries(w.read().map(i => [i.id, i]));
  assert.deepEqual([byId.a.unpinned, byId.b.unpinned, byId.c.unpinned], [true, true, undefined]);
  assert.ok(!('pinned' in byId.a) && !('watch' in byId.a) && !('watchedAt' in byId.a));
});

test('watching pins the entries and stops at the watchlist limit, newest first', async () => {
  const limit = require('../modules/core/history-policy.js').MAX_WATCHED;
  const items = Array.from({ length: limit + 3 }, (_, i) => entry(`p${i}`));
  const w = world(items);
  const answer = await w.call(HistoryStore.Messages.UPDATE_ITEMS, { ids: items.map(i => i.id), patch: { watch: true } });
  assert.equal(answer.updated, limit);
  assert.equal(answer.skipped, 3);
  assert.equal(answer.limit, limit);
  const watched = w.read().filter(i => i.watch === true);
  assert.equal(watched.length, limit);
  assert.ok(watched.every(i => i.pinned === true));
  assert.deepEqual(watched.map(i => i.id), items.slice(0, limit).map(i => i.id), 'the first in the list get the room');
  // Already-watched entries need no room, a second request adds nothing
  const again = await w.call(HistoryStore.Messages.UPDATE_ITEMS, { ids: items.map(i => i.id), patch: { watch: true } });
  assert.equal(again.updated, limit);
  assert.equal(again.skipped, 3);
});

test('a note is never applied to a selection, and a bad request changes nothing', async () => {
  const w = world([entry('a', { note: 'mine' }), entry('b')]);
  const before = w.store.scrapfly_history;
  for (const request of [{ ids: ['a', 'b'], patch: { note: 'x' } }, { ids: [], patch: { pinned: true } }, { ids: ['a'], patch: {} }, { patch: { pinned: true } }, { ids: [7, null], patch: { pinned: true } }]) {
    const answer = await w.call(HistoryStore.Messages.UPDATE_ITEMS, request);
    assert.equal(answer.status, 'error', JSON.stringify(request));
  }
  const mixed = await w.call(HistoryStore.Messages.UPDATE_ITEMS, { ids: ['b'], patch: { pinned: true, note: 'ignored' } });
  assert.equal(mixed.status, 'ok');
  const byId = Object.fromEntries(w.read().map(i => [i.id, i]));
  assert.ok(!('note' in byId.b), 'the note part of a mixed patch is dropped');
  assert.equal(byId.a.note, 'mine');
  assert.notEqual(w.store.scrapfly_history, before);
});

test('only an extension page may change History, a page of a web site may not', async () => {
  const w = world([entry('a')]);
  const answer = await w.call(HistoryStore.Messages.UPDATE_ITEMS, { ids: ['a'], patch: { pinned: true } }, { id: 'ext', url: 'https://evil.example/', tab: { id: 3 } });
  assert.equal(answer.status, 'error');
  assert.ok(!('pinned' in w.read()[0]));
});
