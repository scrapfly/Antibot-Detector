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


test('isLikelyEvilRegex refuses three or more adjacent unbounded repeats over the same characters (polynomial backtracking)', () => {
  for (const pattern of ['a*a*a*a*a*a*b', '.*.*.*.*.*x', '\\w+\\w+\\w+x', '[a-z]*[a-z0-9]*[a-z]*[0-9a-f]*!']) assert.strictEqual(isLikelyEvilRegex(pattern), true, pattern);
  // Rules people write: a few wildcards between literals, two in a row, separated or different characters
  for (const pattern of ['.*.*x', '^.*foo.*bar.*baz', '\\s*,\\s*', '[a-z]+\\d+[a-z]+', 'a+b+c+', '^eyJ[\\w-]+\\.eyJ', 'user.*session.*id=.*token']) {
    assert.strictEqual(isLikelyEvilRegex(pattern), false, pattern);
  }
});

test('every regular expression the shipped detectors carry passes the ReDoS check', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..', 'detectors');
  const flagged = [];
  let checked = 0;
  const visit = (node, file) => {
    if (Array.isArray(node)) return node.forEach(item => visit(item, file));
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const regexFlag = { name: 'nameRegex', value: 'valueRegex', text: 'textRegex', urlPattern: 'urlRegex', pattern: 'regex' }[key];
      if (typeof value === 'string' && regexFlag && node[regexFlag] === true) { checked++; if (isLikelyEvilRegex(value)) flagged.push(`${file}: ${value}`); }
      else visit(value, file);
    }
  };
  for (const category of fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name !== 'i18n' && entry.name !== 'icons')) {
    for (const file of fs.readdirSync(path.join(root, category.name)).filter(name => name.endsWith('.json'))) {
      visit(JSON.parse(fs.readFileSync(path.join(root, category.name, file), 'utf8')), `${category.name}/${file}`);
    }
  }
  assert.ok(checked > 100, `the scan found the regexes (${checked})`);
  assert.deepStrictEqual(flagged, []);
});
