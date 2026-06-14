const { test } = require('node:test');
const assert = require('node:assert');

globalThis.Logger = globalThis.Logger || { warn() {}, debug() {} };
globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 };

const { isLikelyEvilRegex, simpleHash } = require('../utils/pattern-cache.js');

test('isLikelyEvilRegex flags catastrophic-backtracking patterns', () => {
  assert.strictEqual(isLikelyEvilRegex('(a+)+'), true);
  assert.strictEqual(isLikelyEvilRegex('(\\d+)+'), true);
  assert.strictEqual(isLikelyEvilRegex('a'.repeat(1001)), true); // length guard
});

test('isLikelyEvilRegex allows ordinary detector patterns', () => {
  assert.strictEqual(isLikelyEvilRegex('cf_clearance'), false);
  assert.strictEqual(isLikelyEvilRegex('datadome|akamai'), false);
});

test('simpleHash is deterministic and distinguishes different inputs', () => {
  assert.strictEqual(simpleHash('abc'), simpleHash('abc'));
  assert.notStrictEqual(simpleHash('abc'), simpleHash('abd'));
});
