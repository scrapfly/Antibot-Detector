'use strict';
const test = require('node:test');
const assert = require('node:assert');
const HistorySort = require('../modules/core/history-sort.js');

const entry = (url, timestamp, count) => ({ url, timestamp, detections: Array.from({ length: count }, (_, i) => ({ name: `d${i}` })) });
const A = entry('https://www.zeta.example/a', 300, 1);
const B = entry('https://alpha.example/b', 200, 3);
const C = entry('https://mid.example/c', 100, 3);
const list = [A, B, C];

test('recent and unknown keys keep the stored order, as a new list', () => {
  for (const key of ['recent', undefined, 'nonsense']) {
    const out = HistorySort.sort(list, key);
    assert.deepStrictEqual(out, list);
    assert.notStrictEqual(out, list);
  }
});

test('oldest puts the earliest scan first', () => {
  assert.deepStrictEqual(HistorySort.sort(list, 'oldest'), [C, B, A]);
});

test('detections: most protections first, a tie shows the newer scan first', () => {
  assert.deepStrictEqual(HistorySort.sort(list, 'detections'), [B, C, A]);
});

test('host: A to Z, ignoring www and case', () => {
  assert.deepStrictEqual(HistorySort.sort(list, 'host'), [B, C, A]);
});

test('the list passed is not changed, and junk entries are dropped', () => {
  const copy = list.slice();
  HistorySort.sort(list, 'oldest');
  assert.deepStrictEqual(list, copy);
  assert.deepStrictEqual(HistorySort.sort([null, A, undefined], 'host'), [A]);
  assert.deepStrictEqual(HistorySort.sort('x', 'host'), []);
});

test('entries without a date, a list or a valid address do not throw', () => {
  const odd = [{ url: 'not a url' }, { detections: 'x' }, {}];
  for (const key of HistorySort.KEYS) assert.strictEqual(HistorySort.sort(odd, key).length, 3);
});

test('equal entries keep their order', () => {
  const x = entry('https://same.example/1', 5, 2);
  const y = entry('https://same.example/2', 5, 2);
  assert.deepStrictEqual(HistorySort.sort([x, y], 'detections'), [x, y]);
  assert.deepStrictEqual(HistorySort.sort([y, x], 'oldest'), [y, x]);
});

test('isKey knows the four keys', () => {
  assert.ok(HistorySort.KEYS.every(HistorySort.isKey));
  assert.ok(!HistorySort.isKey('size'));
});
