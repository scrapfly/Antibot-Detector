const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Advanced captures hold cookie values, headers and request bodies. They were bounded by a count (100 per tool) and a
// retention in time, but not by size, and with the unlimitedStorage permission no quota error ever stopped them: every
// append reads and writes the whole record. The record now stays under a byte limit, the oldest captures going first.

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture() {
  let saved = {}, session = {};
  const context = {
    console, URL, Logger: { error() {}, warn() {}, debug() {}, network() {} },
    chrome: { storage: {
      local: {
        async get() { await Promise.resolve(); return structuredClone({ scrapfly_advanced_history: saved }); },
        async set(value) { await Promise.resolve(); saved = structuredClone(value.scrapfly_advanced_history); }
      },
      session: {
        async get() { await Promise.resolve(); return structuredClone({ session_advanced_private: session }); },
        async set(value) { await Promise.resolve(); session = structuredClone(value.session_advanced_private); }
      }
    } }
  };
  context.self = context;
  vm.createContext(context);
  for (const file of ['modules/core/capture-retention.js', 'background/advanced/history-store.js']) vm.runInContext(read(file), context, { filename: file });
  const store = context.AdvancedHistoryStore;
  const stored = () => JSON.stringify(saved).length;
  const ids = () => Object.values(saved).flat().map(entry => entry.id).sort();
  return { store, saved: () => saved, session: () => session, stored, ids };
}

// A capture of about `bytes` bytes of request body; timestamps rise with `n`, so "older" is "smaller n"
const capture = (n, bytes, extra = {}) => ({ id: `c${n}`, timestamp: 1_000_000 + n, url: 'https://shop.example/', hostname: 'shop.example', data: { body: 'x'.repeat(bytes) }, ...extra });

test('the limit is a few megabytes: far above one capture and well below what the browser would allow without a quota', () => {
  const { store } = fixture();
  assert.ok(store.MAX_BYTES >= 1024 * 1024 && store.MAX_BYTES <= 8 * 1024 * 1024, `${store.MAX_BYTES}`);
});

test('what is kept never goes over the limit: the oldest captures, of any tool, go first', async () => {
  const f = fixture();
  const piece = Math.floor(f.store.MAX_BYTES / 5);
  const tools = ['akamai', 'cloudflare'];
  for (let n = 0; n < 9; n++) {
    await f.store.appendCapture(tools[n % 2], capture(n, piece));
    assert.ok(f.stored() <= f.store.MAX_BYTES, `after capture ${n}: ${f.stored()} bytes`);
  }
  assert.deepEqual(f.ids(), ['c5', 'c6', 'c7', 'c8'], 'only the newest four fit');
  // each tool keeps its own newest ones
  assert.deepEqual(f.saved().akamai.map(entry => entry.id), ['c8', 'c6']);
  assert.deepEqual(f.saved().cloudflare.map(entry => entry.id), ['c7', 'c5']);
});

test('under the limit nothing is dropped, and the count limit of a tool still applies', async () => {
  const f = fixture();
  for (let n = 0; n < 120; n++) await f.store.appendCapture('akamai', capture(n, 20));
  assert.equal(f.saved().akamai.length, f.store.DEFAULT_HISTORY_LIMIT, 'the count limit: the newest 100');
  assert.equal(f.saved().akamai[0].id, 'c119');
  assert.equal(f.saved().akamai.at(-1).id, 'c20');
  await f.store.appendCapture('cloudflare', capture(500, 20));
  assert.equal(f.ids().length, 101);
});

test('the capture just taken is kept even when it alone is over the limit, and everything older goes', async () => {
  const f = fixture();
  await f.store.appendCapture('akamai', capture(1, 100));
  await f.store.appendCapture('cloudflare', capture(2, 100));
  const big = await f.store.appendCapture('datadome', capture(3, f.store.MAX_BYTES * 2));
  assert.equal(big.id, 'c3');
  assert.deepEqual(f.ids(), ['c3']);
  // the next one makes room by dropping it: the newest is the one that stays
  await f.store.appendCapture('akamai', capture(4, 100));
  assert.deepEqual(f.ids(), ['c4']);
});

test('a capture older than the others (saved late) is the first to go, and the new one still stays', async () => {
  const f = fixture();
  const piece = Math.floor(f.store.MAX_BYTES / 3);
  await f.store.appendCapture('akamai', capture(10, piece));
  await f.store.appendCapture('akamai', capture(11, piece));
  await f.store.appendCapture('cloudflare', capture(1, piece));   // taken earlier, saved last
  assert.deepEqual(f.ids(), ['c1', 'c11'], 'c10 (older than c11, but c1 is the new one) goes; the new capture stays');
});

test('captures kept in memory for a private window count toward the same limit, and go the same way', async () => {
  const f = fixture();
  const piece = Math.floor(f.store.MAX_BYTES / 3);
  await f.store.appendCapture('akamai', capture(1, piece), { privateSession: true });
  await f.store.appendCapture('akamai', capture(2, piece));
  await f.store.appendCapture('cloudflare', capture(3, piece), { privateSession: true });
  await f.store.appendCapture('cloudflare', capture(4, piece));
  const all = Object.entries(await f.store.load()).flatMap(([tool, list]) => list.map(entry => entry.id)).sort();
  assert.deepEqual(all, ['c3', 'c4'].sort(), 'the two oldest (one private, one not) went');
  assert.ok(f.stored() <= f.store.MAX_BYTES);
  assert.ok(JSON.stringify(f.session()).length <= f.store.MAX_BYTES);
  assert.deepEqual(Object.values(f.session()).flat().map(entry => entry.id), ['c3']);
});

test('a retried completion (same id) is not stored twice and does not drop anything', async () => {
  const f = fixture();
  const piece = Math.floor(f.store.MAX_BYTES / 5);
  for (let n = 0; n < 4; n++) await f.store.appendCapture('akamai', capture(n, piece));
  const before = f.ids();
  await f.store.appendCapture('akamai', capture(3, piece));
  assert.deepEqual(f.ids(), before);
});
