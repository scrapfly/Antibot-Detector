const { test } = require('node:test');
const assert = require('node:assert');

const HistoryStore = require('../modules/core/history-store.js');

// Pinned entries, notes, the size limit and the storage meter's numbers.

const KEY = HistoryStore.STORAGE_KEY;
const memory = (initial) => {
  const store = {};
  if (initial !== undefined) store[KEY] = initial;
  return {
    store,
    get: async (keys) => { const o = {}; for (const k of [].concat(keys)) if (k in store) o[k] = store[k]; return o; },
    set: async (obj) => { Object.assign(store, obj); },
    remove: async (keys) => { for (const k of [].concat(keys)) delete store[k]; }
  };
};
const entry = (id, extra = {}) => ({ id, url: `https://${id}.com/`, hostname: `${id}.com`, title: id, timestamp: 1000, detections: [], ...extra });
const read = (storage) => JSON.parse(storage.store[KEY]);
const call = (registry, type, request, sender) => new Promise((resolve) => {
  const handler = registry[type];
  const keep = handler({ request: { type, ...request }, sender, sendResponse: resolve });
  assert.ok(keep === true || keep === false);
});

test('applyLimit keeps the newest N unpinned entries and every pinned one, in order', () => {
  const list = [entry('n1'), entry('p1', { pinned: true }), entry('n2'), entry('n3'), entry('p2', { pinned: true }), entry('n4')];
  assert.deepStrictEqual(HistoryStore.applyLimit(list, 2).map(i => i.id), ['n1', 'p1', 'n2', 'p2']);
  assert.deepStrictEqual(HistoryStore.applyLimit(list, 0).length, 6, '0 keeps everything');
  assert.deepStrictEqual(HistoryStore.applyLimit(list, 'x').length, 6);
  assert.deepStrictEqual(HistoryStore.applyLimit(list, 1).map(i => i.id), ['n1', 'p1', 'p2']);
});

test('applyImport honours pins when it cuts to the limit', () => {
  const current = [entry('a', { timestamp: 5 })];
  const imported = [entry('b', { timestamp: 9 }), entry('c', { timestamp: 1, pinned: true }), entry('d', { timestamp: 7 })];
  const merged = HistoryStore.applyImport(current, imported, 'merge', 1);
  assert.deepStrictEqual(merged.map(i => i.id), ['b', 'c']);
});

test('cleanAnnotation: a pin is a boolean, a note is one trimmed line of at most 300 characters', () => {
  assert.deepStrictEqual(HistoryStore.cleanAnnotation({ pinned: true, note: '  hello\n  world  ' }), { pinned: true, note: 'hello world' });
  assert.deepStrictEqual(HistoryStore.cleanAnnotation({ pinned: 'yes', note: 5, other: 1 }), {});
  assert.strictEqual(HistoryStore.cleanAnnotation({ note: 'x'.repeat(500) }).note.length, 300);
  assert.deepStrictEqual(HistoryStore.cleanAnnotation(undefined), {});
});

test('the size limit takes unpinned entries, oldest first, and keeps pinned ones', () => {
  const big = (id, extra) => entry(id, { note: 'n'.repeat(1000), ...extra });
  // Newest first: p-old is the oldest entry of all, but pinned
  const items = [big('new1'), big('new2'), big('new3'), big('new4'), big('p-old', { pinned: true })];
  const one = JSON.stringify(items[0]).length + 1;
  // Room for three entries
  const { items: kept, dropped } = HistoryStore.fitToBudget(items, one * 3 + 100);
  assert.strictEqual(dropped, 2);
  assert.deepStrictEqual(kept.map(i => i.id), ['new1', 'new2', 'p-old'], 'the two oldest unpinned went, the pinned one stayed');
  // Everything fits: nothing is dropped
  assert.strictEqual(HistoryStore.fitToBudget(items, one * 10).dropped, 0);
});

test('the newest entry is always kept, even alone over the budget', () => {
  const { items, dropped } = HistoryStore.fitToBudget([entry('a', { note: 'x'.repeat(5000) }), entry('b')], 500);
  assert.deepStrictEqual(items.map(i => i.id), ['a']);
  assert.strictEqual(dropped, 1);
});

test('usage reports bytes, entries, pins and what the limit removed', async () => {
  const storage = memory();
  assert.deepStrictEqual(await HistoryStore.usage(storage), { bytes: 0, budget: HistoryStore.MAX_BYTES, entries: 0, pinned: 0, trimmed: null });
  await HistoryStore.mutate(() => [entry('a', { pinned: true }), entry('b')], storage);
  const u = await HistoryStore.usage(storage);
  assert.strictEqual(u.entries, 2);
  assert.strictEqual(u.pinned, 1);
  assert.strictEqual(u.bytes, storage.store[KEY].length);
  assert.strictEqual(u.trimmed, null);
});

test('a write that drops entries records it beside History; clearing it removes the record', async () => {
  const storage = memory();
  const huge = Array.from({ length: 12 }, (_, i) => entry(`h${i}`, { note: 'z'.repeat(600000) }));
  const result = await HistoryStore.mutate(() => huge, storage);
  assert.ok(result.dropped > 0, 'about 6 MB fit, twelve 600 KB entries do not');
  const trimmed = (await HistoryStore.usage(storage)).trimmed;
  assert.strictEqual(trimmed.count, result.dropped);
  assert.strictEqual(trimmed.total, result.dropped);
  assert.ok(Number.isFinite(trimmed.at));
  await HistoryStore.mutate(() => [entry('x')], storage);
  assert.strictEqual((await HistoryStore.usage(storage)).trimmed.total, result.dropped, 'the record stays until History is emptied');
  await HistoryStore.mutate(() => [], storage);
  assert.strictEqual((await HistoryStore.usage(storage)).trimmed, null);
});

test('UPDATE_ITEM pins, unpins and sets or removes a note, leaving the entry otherwise alone', async () => {
  const storage = memory(JSON.stringify({ items: [entry('a', { detections: [{ name: 'X' }] }), entry('b')], extra: 'kept' }));
  const registry = {};
  HistoryStore.registerHandlers(registry, storage);
  const page = { url: 'chrome-extension://abc/popup.html' };
  global.chrome = { runtime: { getURL: (p) => `chrome-extension://abc/${p}` } };
  try {
    let r = await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'a', patch: { pinned: true, note: ' look  here ' } }, page);
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(r.updated, 1);
    let data = read(storage);
    assert.strictEqual(data.extra, 'kept');
    assert.deepStrictEqual(data.items[0], { ...entry('a', { detections: [{ name: 'X' }] }), pinned: true, note: 'look here' });
    assert.deepStrictEqual(data.items[1], entry('b'));

    r = await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'a', patch: { pinned: false, note: '' } }, page);
    assert.strictEqual(r.updated, 1);
    data = read(storage);
    assert.ok(!('pinned' in data.items[0]) && !('note' in data.items[0]), 'false and empty remove the fields');

    r = await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'missing', patch: { pinned: true } }, page);
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(r.updated, 0);

    r = await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'a', patch: { evil: 1 } }, page);
    assert.strictEqual(r.status, 'error');
    r = await call(registry, HistoryStore.Messages.UPDATE_ITEM, { patch: { pinned: true } }, page);
    assert.strictEqual(r.status, 'error');
  } finally {
    delete global.chrome;
  }
});

test('UPDATE_ITEM is refused for a content script on a web page', async () => {
  const storage = memory(JSON.stringify({ items: [entry('a')] }));
  const registry = {};
  HistoryStore.registerHandlers(registry, storage);
  global.chrome = { runtime: { getURL: (p) => `chrome-extension://abc/${p}` } };
  try {
    const r = await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'a', patch: { pinned: true } }, { tab: { id: 1 }, url: 'https://evil.example/' });
    assert.strictEqual(r.status, 'error');
    assert.ok(!('pinned' in read(storage).items[0]));
  } finally {
    delete global.chrome;
  }
});

test('PING answers ok, so the popup can tell a worker that has these features from one that was not reloaded', async () => {
  const registry = {};
  HistoryStore.registerHandlers(registry, memory());
  assert.strictEqual(HistoryStore.Messages.PING, 'HISTORY_PING');
  const answer = await new Promise((resolve) => {
    const keep = registry[HistoryStore.Messages.PING]({ request: { type: HistoryStore.Messages.PING }, sender: { tab: { id: 1 }, url: 'https://web.example/' }, sendResponse: resolve });
    assert.strictEqual(keep, false);
  });
  assert.deepStrictEqual(answer, { status: 'ok' });
});

// ---- Pages that pin themselves: unpinning is final

test('unpinning a pinned entry marks it, so a later scan never pins it again; pinning it again clears the mark', () => {
  const auto = entry('a', { pinned: true, autoPinned: true });
  const unpinned = HistoryStore.annotate(auto, { pinned: false });
  assert.deepStrictEqual(unpinned, entry('a', { unpinned: true }));
  const again = HistoryStore.annotate(unpinned, { pinned: true });
  assert.deepStrictEqual(again, entry('a', { pinned: true }), 'a pin the person chose is their own: not an automatic one');
  const own = HistoryStore.annotate(entry('b', { pinned: true }), { pinned: false });
  assert.deepStrictEqual(own, entry('b', { unpinned: true }), 'a pin the person chose is final too');
});

test('pinning an automatic pin by hand makes it the person\'s own, and unpinning an entry that was not pinned marks nothing', () => {
  assert.deepStrictEqual(HistoryStore.annotate(entry('a', { pinned: true, autoPinned: true }), { pinned: true }), entry('a', { pinned: true }));
  assert.deepStrictEqual(HistoryStore.annotate(entry('a'), { pinned: false }), entry('a'));
});

test('a note changes nothing about the pin', () => {
  const auto = entry('a', { pinned: true, autoPinned: true });
  assert.deepStrictEqual(HistoryStore.annotate(auto, { note: 'x' }), { ...auto, note: 'x' });
  assert.deepStrictEqual(HistoryStore.annotate(entry('a', { unpinned: true }), { note: 'x' }), entry('a', { unpinned: true, note: 'x' }));
  assert.ok(!('note' in HistoryStore.annotate(entry('a', { note: 'x' }), { note: '' })));
});

test('UPDATE_ITEM marks an unpinned entry in the stored history', async () => {
  const storage = memory(JSON.stringify({ items: [entry('a', { pinned: true, autoPinned: true }), entry('b', { pinned: true })] }));
  const registry = {};
  HistoryStore.registerHandlers(registry, storage);
  global.chrome = { runtime: { getURL: (p) => `chrome-extension://abc/${p}` } };
  try {
    const page = { url: 'chrome-extension://abc/popup.html' };
    await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'a', patch: { pinned: false } }, page);
    await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'b', patch: { note: 'keep' } }, page);
    const items = read(storage).items;
    assert.deepStrictEqual(items[0], entry('a', { unpinned: true }));
    assert.deepStrictEqual(items[1], entry('b', { pinned: true, note: 'keep' }));
  } finally {
    delete global.chrome;
  }
});

// ---- The watchlist: watching pins a page, unpinning stops it, and the list is short

test('watching a page pins it as the person\'s own pin; stopping removes the watchlist\'s bookkeeping', () => {
  const auto = entry('a', { pinned: true, autoPinned: true });
  assert.deepStrictEqual(HistoryStore.annotate(auto, { watch: true }), entry('a', { pinned: true, watch: true }), 'an automatic pin becomes the person\'s');
  assert.deepStrictEqual(HistoryStore.annotate(entry('b', { unpinned: true }), { watch: true }), entry('b', { pinned: true, watch: true }));
  assert.deepStrictEqual(HistoryStore.annotate(entry('c'), { watch: true }), entry('c', { pinned: true, watch: true }));
  assert.deepStrictEqual(HistoryStore.annotate(entry('d', { pinned: true, watch: true, watchedAt: 5 }), { watch: false }), entry('d', { pinned: true }), 'still pinned');
  assert.deepStrictEqual(HistoryStore.annotate(entry('e', { pinned: true, watch: true, watchedAt: 5 }), { pinned: false }), entry('e', { unpinned: true }), 'only a pinned page is watched');
});

test('the annotation of a patch keeps the watch flag only as a boolean', () => {
  assert.deepStrictEqual(HistoryStore.cleanAnnotation({ watch: true, pinned: 'yes', note: 'x' }), { watch: true, note: 'x' });
  assert.deepStrictEqual(HistoryStore.cleanAnnotation({ watch: 'yes' }), {});
});

test('UPDATE_ITEM refuses an eleventh watched page, and lets a watched one be set again or stopped', async () => {
  const watched = Array.from({ length: 10 }, (_, i) => entry(`w${i}`, { pinned: true, watch: true }));
  const storage = memory(JSON.stringify({ items: [entry('new'), ...watched] }));
  const registry = {};
  HistoryStore.registerHandlers(registry, storage);
  global.chrome = { runtime: { getURL: (p) => `chrome-extension://abc/${p}` } };
  try {
    const page = { url: 'chrome-extension://abc/popup.html' };
    let r = await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'new', patch: { watch: true } }, page);
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(r.updated, 0);
    assert.strictEqual(r.limit, 10);
    assert.ok(!read(storage).items.find(i => i.id === 'new').watch, 'nothing was changed');
    r = await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'w3', patch: { watch: true } }, page);
    assert.strictEqual(r.updated, 1, 'a page already on the list is not an eleventh');
    r = await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'w0', patch: { watch: false } }, page);
    assert.strictEqual(r.updated, 1);
    r = await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'new', patch: { watch: true } }, page);
    assert.strictEqual(r.updated, 1, 'room again');
    assert.deepStrictEqual(read(storage).items.find(i => i.id === 'new'), entry('new', { pinned: true, watch: true }));
    r = await call(registry, HistoryStore.Messages.UPDATE_ITEM, { id: 'w1', patch: { pinned: false } }, page);
    assert.ok(!read(storage).items.find(i => i.id === 'w1').watch, 'unpinning stops the watching');
    assert.strictEqual(HistoryStore.Messages.WATCH_NOW, 'HISTORY_WATCH_NOW');
  } finally {
    delete global.chrome;
  }
});
