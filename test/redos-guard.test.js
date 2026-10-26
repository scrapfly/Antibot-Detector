const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

globalThis.Logger = globalThis.Logger || { warn() {}, debug() {} };
globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 };

const { isLikelyEvilRegex } = require('../utils/pattern-cache.js');

// The ReDoS guard on user rules caught (a+)+ but not a repeated choice whose branches overlap, (a|aa)+$ or
// (\w|\d)+$, nor nesting its one-level check could not see. It must still accept every official regex.

test('repeated choices whose branches can start alike, or be empty, are rejected', () => {
  for (const pattern of ['(a|aa)+$', '(\\w|\\d)+$', '(?:x|xy)*z', '(a|)+', '(a|b?)+', '(?:[a-c]|b)+', '(?:a+|b)+', '(A|a)+']) {
    assert.equal(isLikelyEvilRegex(pattern), true, pattern);
  }
});

test('repeats inside repeats that can run into the next round are rejected, at any depth', () => {
  for (const pattern of ['(a+)+', '(a*)*', '(\\d+)+', '(a{2,})+', '((a+)+b)+', '(?:(?:a+)b?)+', '(a+a)+$', '(b+a?)+', '(?:x(?:\\d*)*)']) {
    assert.equal(isLikelyEvilRegex(pattern), true, pattern);
  }
});

test('ordinary and safely repeated patterns are accepted', () => {
  for (const pattern of ['cf_clearance', 'datadome|akamai', '(foo|bar)+', '(?:x|y)+', '[a-z]+\\.js', '((ab)*c)+',
    '^https?://(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)*example\\.com/', '_px\\d?', '\\(a\\|aa\\)+', '[(]a|aa[)]+']) {
    assert.equal(isLikelyEvilRegex(pattern), false, pattern);
  }
});

test('every official detector regex passes the guard', () => {
  const found = [];
  const walk = (node, file) => {
    if (Array.isArray(node)) return node.forEach(item => walk(item, file));
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const flag = key === 'urlPattern' ? 'urlRegex' : `${key}Regex`;
      if (typeof value === 'string' && node[flag] === true) found.push([file, value]);
      walk(value, file);
    }
  };
  const files = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith('.json') ? [path.join(dir, entry.name)] : []);
  for (const file of files(path.join(__dirname, '..', 'detectors'))) walk(JSON.parse(fs.readFileSync(file, 'utf8')), path.basename(file));
  assert.ok(found.length > 100, `only ${found.length} regexes found`);
  for (const [file, pattern] of found) assert.equal(isLikelyEvilRegex(pattern), false, `${file}: ${pattern}`);
});
