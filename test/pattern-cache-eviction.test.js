const { test } = require('node:test');
const assert = require('node:assert');

globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 };
globalThis.Logger = globalThis.Logger || { warn() {}, debug() {} };

const { PatternCache } = require('../utils/pattern-cache.js');

// Guards the eviction fix: Math.max(1, Math.floor(maxSize * 0.1)).
// The Math.max(1, ...) is what keeps the cache bounded when 10% of a small
// maxSize would floor to 0 — without it the cache would grow without limit.

test('match cache stays bounded by maxSize under heavy churn', () => {
  const c = new PatternCache(5);
  for (let i = 0; i < 50; i++) {
    c.cacheMatch(`text-${i}`, `pattern-${i}`, {}, { found: true });
  }
  assert.ok(c.matchCache.size <= 5, `expected matchCache.size <= 5, got ${c.matchCache.size}`);
});

test('eviction still makes progress when floor(maxSize * 0.1) === 0', () => {
  // maxSize=3 -> floor(0.3)=0; the Math.max(1, ...) guard must still evict >=1.
  const c = new PatternCache(3);
  for (let i = 0; i < 20; i++) {
    c.cacheMatch(`t${i}`, `p${i}`, {}, { found: true });
  }
  assert.ok(c.matchCache.size <= 3, `expected matchCache.size <= 3, got ${c.matchCache.size}`);
  assert.ok(c.insertionOrder.length <= 3, `insertionOrder should not grow unbounded, got ${c.insertionOrder.length}`);
});
