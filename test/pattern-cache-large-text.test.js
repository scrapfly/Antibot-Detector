const { test } = require('node:test');
const assert = require('node:assert/strict');

globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 };
globalThis.Logger = globalThis.Logger || { warn() {}, debug() {} };

const { PatternCache } = require('../utils/pattern-cache.js');

// A page's whole HTML was hashed once per content pattern just to look up (and store) a match result that was
// rarely asked for again. Texts over the limit are matched without the cache.

test('a long text is neither looked up nor stored in the match cache', () => {
  const cache = new PatternCache(100);
  const page = 'x'.repeat(PatternCache.MATCH_CACHE_MAX_TEXT + 1);
  assert.equal(cache.textKeyFor(page), null);
  cache.cacheMatch(page, 'p', {}, true);
  assert.equal(cache.matchCache.size, 0);
  assert.equal(cache.getCachedMatch(page, 'p', {}).found, false);
});

test('short texts are still cached', () => {
  const cache = new PatternCache(100);
  const cookie = 'y'.repeat(PatternCache.MATCH_CACHE_MAX_TEXT);
  assert.notEqual(cache.textKeyFor(cookie), null);
  cache.cacheMatch(cookie, 'p', {}, true);
  assert.deepEqual(cache.getCachedMatch(cookie, 'p', {}), { found: true, result: true });
  assert.equal(cache.textKeyFor('short'), 'short');
});
