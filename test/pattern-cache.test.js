const { test } = require('node:test');
const assert = require('node:assert');

globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 };
globalThis.Logger = globalThis.Logger || { warn() {}, debug() {} };

const { PatternCache } = require('../utils/pattern-cache.js');

test('compiled regex is NOT global (so .test() is stateless)', () => {
  const c = new PatternCache();
  const rx = c.getCompiledPattern('abc', { regex: true });
  assert.strictEqual(rx.global, false);
});

test('reused cached regex gives correct .test() across texts (no lastIndex carryover)', () => {
  const c = new PatternCache();
  const rx = c.getCompiledPattern('a', { regex: true });
  const rx2 = c.getCompiledPattern('a', { regex: true });
  assert.strictEqual(rx, rx2); // cache hit returns the same object
  assert.strictEqual(rx.test('xa'), true); // match near the end (would set lastIndex if global)
  assert.strictEqual(rx.test('a'), true);  // with a global regex this would wrongly return false
  assert.strictEqual(rx.test('a'), true);  // still correct on repeat
});

test('whole-word compiled regex is also non-global', () => {
  const c = new PatternCache();
  const rx = c.getCompiledPattern('word', { wholeWord: true });
  assert.strictEqual(rx.global, false);
});

test('ReDoS guard still rejects catastrophic patterns', () => {
  const c = new PatternCache();
  assert.strictEqual(c.getCompiledPattern('(a+)+', { regex: true }), null);
});
