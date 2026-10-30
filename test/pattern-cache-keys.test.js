const { test } = require('node:test');
const assert = require('node:assert/strict');

// The match cache answers "does this text match this pattern" from an earlier answer. Its key must tell two different
// (text, pattern, options) apart: a "|" in a text or a pattern, or two long texts with the same 32-bit hash, used to
// share one key and the second was served the first one's answer.
global.Constants = { MATCH_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500 };
const { PatternCache, simpleHash } = require('../utils/pattern-cache.js');

test('a "|" in the text or the pattern does not make two different pairs share an answer', () => {
  const cache = new PatternCache();
  cache.cacheMatch('abc', 'def|def', { regex: true }, false);
  assert.equal(cache.getCachedMatch('abc|def', 'def', { regex: true }).found, false, 'another text and pattern: a miss');
  assert.equal(cache.getCachedMatch('abc', 'def|def', { regex: true }).found, true, 'the same pair: a hit');
  assert.equal(cache.getCachedMatch('abc', 'def|def', { regex: false }).found, false, 'the same pair with other options: a miss');
  cache.cacheMatch('x', 'a|true', {}, true);
  assert.equal(cache.getCachedMatch('x', 'a', { regex: true }).found, false, 'a pattern that spells an option is not that option');
});

test('two long texts with the same 32-bit hash do not share an answer', () => {
  const first = 'Aa'.repeat(60), second = 'BB'.repeat(60);
  assert.equal(simpleHash(first), simpleHash(second), 'a known collision of the first hash');
  assert.notEqual(second, first);
  const cache = new PatternCache();
  cache.cacheMatch(first, 'bb', { caseSensitive: false }, false);
  assert.equal(cache.getCachedMatch(second, 'bb', { caseSensitive: false }).found, false, 'the second text is matched on its own');
  assert.equal(cache.getCachedMatch(first, 'bb', { caseSensitive: false }).found, true);
});

test('a short text that looks like a long text\'s key is not that text', () => {
  const cache = new PatternCache();
  const long = 'q'.repeat(150);
  const key = cache.textKeyFor(long);
  assert.notEqual(key, long);
  cache.cacheMatch(long, 'q', {}, true);
  assert.equal(cache.getCachedMatch(key, 'q', {}).found, false, 'the key itself, used as a text, is another text');
  assert.equal(cache.textKeyFor('short'), 'short', 'short texts are still their own key');
});
