const { test } = require('node:test');
const assert = require('node:assert');

globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 };
globalThis.Logger = globalThis.Logger || { warn() {}, debug() {}, get debugMode() { return false; } };

const { PatternCache } = require('../utils/pattern-cache.js');
const { demMatchPattern } = require('../modules/detection/engine/detection-engine-matching.js');

// demMatchPattern reads DetectionEngineManager.patternCache and `this`; give it a
// fresh cache per call so the 5-min result cache can't mask the comparison.
function freshThis() {
  globalThis.DetectionEngineManager = { patternCache: new PatternCache() };
  return {
    escapeRegExp: (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    matchPattern(...args) { return demMatchPattern.apply(this, args); },
  };
}

test('preparedLower path returns the same result as recompute (match)', () => {
  const text = 'Hello WORLD DataDome token';
  const without = demMatchPattern.call(freshThis(), text, 'datadome', {});
  const withPrep = demMatchPattern.call(freshThis(), text, 'datadome', {}, text.toLowerCase());
  assert.strictEqual(without, withPrep);
  assert.strictEqual(without, true);
});

test('preparedLower path returns the same result as recompute (non-match)', () => {
  const text = 'nothing relevant here';
  const without = demMatchPattern.call(freshThis(), text, 'datadome', {});
  const withPrep = demMatchPattern.call(freshThis(), text, 'datadome', {}, text.toLowerCase());
  assert.strictEqual(without, withPrep);
  assert.strictEqual(without, false);
});

test('case-sensitive matching ignores the preparedLower hint', () => {
  const text = 'DataDome';
  // case-sensitive uses the original text; a lowercased hint must not change it
  const exact = demMatchPattern.call(freshThis(), text, 'DataDome', { caseSensitive: true }, text.toLowerCase());
  const lowerMiss = demMatchPattern.call(freshThis(), text, 'datadome', { caseSensitive: true }, text.toLowerCase());
  assert.strictEqual(exact, true);
  assert.strictEqual(lowerMiss, false);
});
