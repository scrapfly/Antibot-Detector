const { test } = require('node:test');
const assert = require('node:assert');

// Browser IIFE: requiring it attaches to globalThis.
require('../modules/detection/hooks/window-condition-language.js');
const WCL = globalThis.ScrapflyWindowConditionLanguage;

test('exposes the expected public API', () => {
  assert.ok(WCL, 'ScrapflyWindowConditionLanguage should be defined');
  for (const fn of ['compile', 'evaluate', 'getPresetGroups', 'getPresetValues', 'describe']) {
    assert.strictEqual(typeof WCL[fn], 'function', `${fn} should be a function`);
  }
});

test('evaluate handles existence and truthiness conditions', () => {
  assert.strictEqual(WCL.evaluate('x', 'exists'), true);
  assert.strictEqual(WCL.evaluate(undefined, 'exists'), false);
  assert.strictEqual(WCL.evaluate(1, 'truthy'), true);
  assert.strictEqual(WCL.evaluate(0, 'truthy'), false);
  assert.strictEqual(WCL.evaluate(0, 'falsy'), true);
});

test('evaluate handles typeof conditions (including synced symbol/bigint)', () => {
  assert.strictEqual(WCL.evaluate({}, 'typeof object'), true);
  assert.strictEqual(WCL.evaluate(function () {}, 'typeof function'), true);
  assert.strictEqual(WCL.evaluate('s', 'typeof string'), true);
  assert.strictEqual(WCL.evaluate(5, 'typeof number'), true);
  assert.strictEqual(WCL.evaluate(true, 'typeof boolean'), true);
  assert.strictEqual(WCL.evaluate(Symbol('s'), 'typeof symbol'), true);
  assert.strictEqual(WCL.evaluate(10n, 'typeof bigint'), true);
});

test('evaluate handles null/undefined comparisons', () => {
  assert.strictEqual(WCL.evaluate(null, '=== null'), true);
  assert.strictEqual(WCL.evaluate(undefined, '=== undefined'), true);
  assert.strictEqual(WCL.evaluate(1, '!== undefined'), true);
  assert.strictEqual(WCL.evaluate(1, '!== null'), true);
});

test('evaluate handles numeric conditions (including synced !== 0)', () => {
  assert.strictEqual(WCL.evaluate(5, '> 0'), true);
  assert.strictEqual(WCL.evaluate(0, '=== 0'), true);
  assert.strictEqual(WCL.evaluate(1, '!== 0'), true);
  assert.strictEqual(WCL.evaluate(0, '!== 0'), false);
});

test('evaluate handles collection and length conditions', () => {
  assert.strictEqual(WCL.evaluate([1, 2], 'array'), true);
  assert.strictEqual(WCL.evaluate([1], 'non-empty array'), true);
  assert.strictEqual(WCL.evaluate([], 'empty array'), true);
  assert.strictEqual(WCL.evaluate('ab', 'length > 0'), true);
  assert.strictEqual(WCL.evaluate('', 'length === 0'), true);
  assert.strictEqual(WCL.evaluate(true, '=== true'), true);
  assert.strictEqual(WCL.evaluate(false, '=== false'), true);
});

test('getPresetValues exposes the canonical set (synced values present, aliases removed)', () => {
  const values = WCL.getPresetValues();
  assert.ok(Array.isArray(values) && values.length > 0);
  // Values added when fixing the fallback drift:
  for (const v of ['typeof symbol', 'typeof bigint', 'has length', '!== 0']) {
    assert.ok(values.includes(v), `canonical set missing: ${v}`);
  }
  // A representative spread across groups:
  for (const v of ['typeof object', 'exists', '=== null', '> 0', 'length > 0', '=== true']) {
    assert.ok(values.includes(v), `canonical set missing: ${v}`);
  }
  // Non-canonical aliases that were removed:
  for (const removed of ['not undefined', 'not null']) {
    assert.ok(!values.includes(removed), `canonical set should not include alias: ${removed}`);
  }
});
