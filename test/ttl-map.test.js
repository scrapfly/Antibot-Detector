const { test } = require('node:test');
const assert = require('node:assert');

const TTLMap = require('../modules/core/ttl-map.js');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test('evicts the oldest entry when over maxSize', () => {
  const m = new TTLMap(300000, 2);
  m.set('a', 1);
  m.set('b', 2);
  m.set('c', 3); // exceeds maxSize 2 → evicts oldest ('a')
  assert.strictEqual(m.size, 2);
  assert.strictEqual(m.has('a'), false);
  assert.strictEqual(m.has('c'), true);
  m.clear(); // clear pending timers so the test runner can exit
});

test('entry expires after its ttl (lazy check)', async () => {
  const m = new TTLMap(20, 100);
  m.set('k', 'v');
  assert.strictEqual(m.has('k'), true);
  await delay(45);
  assert.strictEqual(m.has('k'), false);
  m.clear();
});
