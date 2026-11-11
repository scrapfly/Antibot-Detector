const { test } = require('node:test');
const assert = require('node:assert');
const withinLimit = require('./helpers/hard-limit.js');

globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 };
globalThis.Logger = globalThis.Logger || { warn() {}, debug() {}, get debugMode() { return false; } };

const { PatternCache } = require('../utils/pattern-cache.js');
const { demMatchPattern, demMatchPatternWithCapture, demMatchCookieName } = require('../modules/detection/engine/detection-engine-matching.js');

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

// "Case sensitive" off must not change what a regex means: \D \S \W \B are
// not \d \s \w \b (the engine used to lowercase the pattern itself)
test('case-insensitive regex keeps uppercase escape classes', () => {
  const opts = { regex: true, caseSensitive: false };
  assert.strictEqual(demMatchPattern.call(freshThis(), 'ID-42', '^ID\\D\\d+$', opts), true);
  assert.strictEqual(demMatchPattern.call(freshThis(), 'id42', '^id\\D', opts), false, '\\D is a non-digit');
  assert.strictEqual(demMatchPattern.call(freshThis(), 'a b', '^\\S\\s\\S$', opts), true);
  assert.strictEqual(demMatchPattern.call(freshThis(), 'ABC', '^abc$', opts), true, 'still case-insensitive');
  assert.strictEqual(demMatchPatternWithCapture.call(freshThis(), 'Token-XYZ', 'token\\W\\w+', opts), 'Token-XYZ');
  assert.strictEqual(demMatchPatternWithCapture.call(freshThis(), 'TOKEN9', 'token\\W', opts), null);
});

// A cookie name with "*" stands for any run of characters. It used to become a regex of ".*" runs, which a cookie name that almost
// matches (a hostile page sets them) made take exponential time in the service worker.
test('wildcard cookie names: * is any run of characters, nothing else is special', () => {
  const hit = (name, pattern, options) => demMatchCookieName.call(freshThis(), name, pattern, options);
  assert.strictEqual(hit('awswaf_session', 'awswaf*'), true);
  assert.strictEqual(hit('x-awswaf', '*awswaf'), true);
  assert.strictEqual(hit('a1b22c', 'a*b*c'), true);
  assert.strictEqual(hit('abc', 'a*b*c'), true, 'the stars may match nothing');
  assert.strictEqual(hit('ac', 'a*b*c'), false);
  assert.strictEqual(hit('ab', 'ab*b'), false, 'the pieces cannot overlap');
  assert.strictEqual(hit('abb', 'ab*b'), true);
  assert.strictEqual(hit('x.y', 'x.y*'), true, 'a dot is a dot');
  assert.strictEqual(hit('xzy', 'x.y*'), false);
  assert.strictEqual(hit('AWSWAF_x', 'awswaf*'), true, 'case-insensitive unless asked');
  assert.strictEqual(hit('AWSWAF_x', 'awswaf*', { caseSensitive: true }), false);
  assert.strictEqual(hit('abc', '*'), true);
});

test('a wildcard cookie name that almost matches is answered at once', () => {
  const name = 'a'.repeat(5000);
  for (const pattern of ['*a*a*a*a*a*a*a*a*b', 'a*a*a*a*a*a*a*a*b']) {
    assert.strictEqual(withinLimit(() => demMatchCookieName.call(freshThis(), name, pattern), `the pattern ${pattern}`), false);
  }
});

// "İ" (a dotted capital I, in Turkish text) is two characters in lower case: the place found in the lower-case copy is not the
// place in the page's own text
test('the matched text is cut from the page text although lowercasing changed its length', () => {
  const body = 'İSTANBUL İZMİR İSTANBUL {"proofofwork":{"required":true}}';
  const value = demMatchPatternWithCapture.call(freshThis(), body, '"proofofwork"', {});
  assert.strictEqual(value, '"proofofwork"');
  assert.strictEqual(demMatchPatternWithCapture.call(freshThis(), 'İİİ PoW', 'pow', {}), 'PoW');
  assert.strictEqual(demMatchPatternWithCapture.call(freshThis(), 'plain ASCII Token', 'token', {}), 'Token');
});
