const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

globalThis.Logger = globalThis.Logger || { warn() {}, debug() {} };
globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 };

const { isLikelyEvilRegex, PatternCache } = require('../utils/pattern-cache.js');

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

// A group repeated a fixed number of times runs its rounds one after another as + does: (a+){10}b takes as long as (a+)+b
test('a bounded repeat of a group that holds an unbounded repeat that runs into the next round is rejected', () => {
  for (const pattern of ['(a+){10}b', '^(\\w+\\s?){1,30}$', '(\\w+\\s?){1,10}$', '(.+?){8}x', '(\\d+){2,}', '(?:a*){3}$']) {
    assert.equal(isLikelyEvilRegex(pattern), true, pattern);
  }
});

test('a name or a path made of repeated pieces that a dot or a slash splits one way is accepted, bounded or not', () => {
  for (const pattern of ['([a-z0-9]+\\.)+example\\.com', '^(?:[a-z0-9-]+\\.)+[a-z]{2,}$', '(?:\\w+/)+index\\.js', '(?:ab){3}', '(\\d{1,3}\\.){3}\\d{1,3}',
    '(foo|bar){2}', '^(?:[a-z0-9-]+\\.){2,5}com$', '(?:\\w+-){2}\\w+']) {
    assert.equal(isLikelyEvilRegex(pattern), false, pattern);
  }
});

test('a pattern the reading cannot follow is judged by the cruder checks, which still refuse (a+)+', () => {
  assert.equal(isLikelyEvilRegex('(?<name>a+)+(?'), true);
  assert.equal(isLikelyEvilRegex('(?<=x)(a+)+'), true);
});

// A group repeated a number of times, with a choice or a repeat of limited length in it, can cut the same text in several ways
// per round, and the ways multiply with the rounds. None of these was refused before; measured, (a|a?){16}b on 16 characters took
// 8 s (14 rounds 0.8 s), (a{1,2}){22}b on 44 characters 2.2 s and (\d{1,3}){1,14}x on 42 digits 2.3 s
test('a bounded repeat of a group that can split the same text in more than one way is rejected', () => {
  for (const pattern of ['(a|a?){16}b', '(a{1,2}){22}b', '(\\d{1,3}){1,14}x',
    '(a|a?){5}b', '(?:a|ab){20}c', '(?:\\d\\d?){12}$', '(a?){30}a{30}', '(a|b|ab){1,12}c', '^(\\w{1,3}){12}$', '(?:[a-z]{1,2}){9}!',
    '(?:a{0,3}){10}x', '(.{1,5}){10}$', '(\\s|\\S){20}x', '(a|){20}b', '((a|a){2}){10}b', '(?:a|b|a){1,30}c']) {
    assert.equal(isLikelyEvilRegex(pattern), true, pattern);
  }
});

test('the same shapes under an unbounded repeat are rejected too: a repeat of limited length is still a way to cut the text', () => {
  for (const pattern of ['(a{1,2})+b', '(\\d{1,3})*x', '(?:\\w{1,5}\\s?)+$', '(?:a?a?)*b', '(?:\\s?,\\s?)*;']) {
    assert.equal(isLikelyEvilRegex(pattern), true, pattern);
  }
});

test('the rounds of such groups add up over a pattern, and multiply when one sits in another', () => {
  for (const pattern of ['(a|a?){3}(a|a?){2}b', '(a{1,2}){3}(a{1,2}){3}b', '(?:(?:a|a?){2}x){3}', '(\\d{1,3}\\.?){6}x']) {
    assert.equal(isLikelyEvilRegex(pattern), true, pattern);
  }
});

test('a few rounds of such a group are cheap and accepted, and so is every group something splits one way', () => {
  for (const pattern of ['(a|a?){4}b', '(a|a?){2}(a|a?){2}b', '(\\d{1,3}\\.?){4}', '(foo|bar){2}', '(?:ab|cd){3}', '(?:png|jpe?g|gif|webp){1,3}', '(?:com|co\\.uk|org){1,2}',
    '^(?:\\d{1,3}\\.){3}\\d{1,3}$', '^(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)$', '^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$',
    '^(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$', '^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$', '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$',
    '^v?\\d+(?:\\.\\d+){1,3}$', '^\\+?(?:\\d[ -]?){6,14}\\d$', '^(?:\\d{4}[ -]?){3}\\d{4}$', '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$',
    '(?:[a-z]{2,12}-){0,4}x', '^https?://(?:[a-z0-9-]{1,63}\\.){0,4}example\\.com/', '^(?:\\w{2,8}\\.){2,4}\\w{2,8}$', '(?:\\\\u[0-9a-f]{4}){1,4}']) {
    assert.equal(isLikelyEvilRegex(pattern), false, pattern);
  }
});

// [^&] is every character but &, so a round that ends at & splits the text one way. Read as "any character" it hid that, and the
// bounded form of a pattern people write to skip parameters, (?:[^&]{0,200}&){0,10}, would have been refused with the rest
test('a repeated piece that a character it cannot match ends is accepted when it is a negated class, and refused when nothing splits it', () => {
  for (const pattern of ['(?:[^&]{0,200}&){0,10}', '^https://[^/]+/(?:[^#&]{0,200}&){0,10}apiKey=', '(?:[^&]*&)+', '(?:[^/]+/)*[^/]+', '(?:[^,]+,)+x', '(?:[^\\d,]+,){1,6}']) {
    assert.equal(isLikelyEvilRegex(pattern), false, pattern);
  }
  // An optional separator splits nothing, and a class with letters or escapes the reading approximates stays "any character"
  for (const pattern of ['(?:[^&]+&?)+', '(?:[^&]{1,5}&?){9}x', '(?:[^a]+a?)+', '(?:[^\\W]+\\.?)+', '(?:[^\\x41]+A?)+']) {
    assert.equal(isLikelyEvilRegex(pattern), true, pattern);
  }
});

test('the engine never compiles what the guard refuses, so the shapes above match nothing at run time', () => {
  const cache = new PatternCache();
  for (const pattern of ['(a|a?){16}b', '(a{1,2}){22}b', '(\\d{1,3}){1,14}x']) assert.equal(cache.getCompiledPattern(pattern, { regex: true }), null, pattern);
  assert.ok(cache.getCompiledPattern('^(?:\\d{1,3}\\.){3}\\d{1,3}$', { regex: true }) instanceof RegExp);
});

test('a single wildcard between literals stays accepted on purpose: its cost is bounded by the text limit, not by the source', () => {
  for (const pattern of ['function.*zzz', 'foo.*bar', 'user.*session.*id=.*token']) assert.equal(isLikelyEvilRegex(pattern), false, pattern);
  assert.ok(PatternCache.REGEX_TEXT_LIMIT > 0);
});
