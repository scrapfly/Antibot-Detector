const { test } = require('node:test');
const assert = require('node:assert');

// Browser IIFE: requiring it attaches to globalThis.
require('../modules/detection/window-condition-grammar.js');
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

// the evaluator holds no vocabulary; the grammar module does.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const GRAMMAR = globalThis.ScrapflyWindowConditionGrammar;

function bareEvaluator() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/detection/hooks/window-condition-language.js'), 'utf8'), context);
  return context.ScrapflyWindowConditionLanguage;
}

test('without a grammar the evaluator supports nothing', () => {
  const lang = bareEvaluator();
  assert.strictEqual(lang.DEFAULT_CONDITION, undefined);
  assert.strictEqual(lang.compile('exists').ok, false);
  assert.strictEqual(lang.evaluate(1, 'truthy'), false);
  assert.deepStrictEqual(Array.from(lang.getPresetValues()), []);
  assert.strictEqual(lang.describe(), '');
});

test('the first grammar adopted is kept and copied', () => {
  const lang = bareEvaluator();
  const mine = JSON.parse(JSON.stringify(GRAMMAR));
  assert.strictEqual(lang.configure(mine), true);
  mine.EXACT.exists = 'FALSY';
  const forged = JSON.parse(JSON.stringify(GRAMMAR));
  forged.EXACT.exists = 'FALSY';
  assert.strictEqual(lang.configure(forged), false);
  assert.strictEqual(lang.evaluate(1, 'exists'), true);
  assert.strictEqual(lang.DEFAULT_CONDITION, 'truthy');
});

test('a malformed grammar is not adopted', () => {
  const lang = bareEvaluator();
  for (const bad of [null, {}, { ...GRAMMAR, PATTERNS: {} }, { ...GRAMMAR, WHITESPACE: { source: '(', flags: '' } }]) {
    assert.strictEqual(lang.configure(bad), false);
  }
  assert.strictEqual(lang.configure(GRAMMAR), true);
});

test('the grammar is plain frozen data that survives the bootstrap copy', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(GRAMMAR)), GRAMMAR);
  assert.ok(Object.isFrozen(GRAMMAR) && Object.isFrozen(GRAMMAR.EXACT) && Object.isFrozen(GRAMMAR.PRESET_GROUPS[0].values));
  // Every EXACT/OPERATORS name has an implementation, checked through behaviour
  for (const condition of Object.keys(GRAMMAR.EXACT)) assert.strictEqual(WCL.compile(condition).ok, true, condition);
  for (const op of Object.keys(GRAMMAR.OPERATORS)) assert.strictEqual(WCL.compile(`${op} 1`).ok, true, op);
});

test('the 2.8 vocabulary is unchanged', () => {
  assert.strictEqual(GRAMMAR.DEFAULT_CONDITION, 'truthy');
  assert.strictEqual(GRAMMAR.COMPILE_CACHE_MAX_ENTRIES, 500);
  assert.deepStrictEqual({ ...GRAMMAR.ALIASES }, {
    'not undefined': '!== undefined', 'not null': '!== null', defined: '!== undefined', present: '!== undefined'
  });
  assert.deepStrictEqual({ ...GRAMMAR.REASONS }, { INVALID_NUMBER: 'INVALID_NUMBER', UNSUPPORTED_CONDITION: 'UNSUPPORTED_CONDITION' });
  assert.deepStrictEqual(WCL.getPresetGroups().map(g => g.label), ['Type', 'Existence', 'Collections', 'Numeric', 'String', 'Boolean']);
  assert.strictEqual(WCL.getPresetValues().length, 30);
  assert.strictEqual(WCL.compile('nope').reason, 'UNSUPPORTED_CONDITION');
  assert.strictEqual(WCL.compile(`> 1${'0'.repeat(400)}`).reason, 'INVALID_NUMBER');
  assert.strictEqual(WCL.describe(),
    'Supported: exists/truthy/falsy, typeof <type>, numeric comparisons (<op> N), length comparisons (length <op> N), arrays/objects helpers.');
});
