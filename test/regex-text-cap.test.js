const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 };
globalThis.Logger = globalThis.Logger || { warn() {}, debug() {}, get debugMode() { return false; } };

const { PatternCache } = require('../utils/pattern-cache.js');
const DetectionUtils = globalThis.DetectionUtils = require('../utils/detection-utils.js');
const { demMatchPattern, demMatchPatternWithCapture } = require('../modules/detection/engine/detection-engine-matching.js');

// A regex a person wrote or imported reads the first PatternCache.REGEX_TEXT_LIMIT characters of a text and no more: a repeat such as
// `.*` between two literals takes time that grows with the square of one long line (a minified bundle: 130 ms for 100,000 characters,
// 0.8 s for 250,000, minutes for 3 MB), and a synchronous match in the worker cannot be stopped. A regex an official rule ships is
// exempt, so what Scrapfly detects does not change.

const LIMIT = PatternCache.REGEX_TEXT_LIMIT;
const official = (extra = {}) => ({ id: 'detect-shipped', name: 'Shipped', author: 'Scrapfly', detection: { content: [{ id: 'c1', text: 'need.e', textRegex: true }] }, ...extra });
const person = (text = 'need.e') => ({ id: 'detect-mine', name: 'Mine', author: 'Me', detection: { content: [{ id: 'c1', text, textRegex: true }] } });

// What matchPattern and matchPatternWithCapture are called on: the engine, which holds the rules
function engine(detectors) {
  globalThis.DetectionEngineManager = { patternCache: new PatternCache() };
  return {
    detectors,
    escapeRegExp: (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    matchPattern(...args) { return demMatchPattern.apply(this, args); },
    matchPatternWithCapture(...args) { return demMatchPatternWithCapture.apply(this, args); }
  };
}
const after = (position, word = 'needle') => 'x'.repeat(position) + word;

beforeEach(() => DetectionUtils.setOfficialDetectorIds(['detect-shipped']));

test('the limit is a number of characters well above a page and a script, and PatternCache cuts a text there', () => {
  assert.ok(Number.isInteger(LIMIT) && LIMIT >= 50000 && LIMIT <= 250000, String(LIMIT));
  const cache = new PatternCache();
  assert.equal(cache.textForRegex('abc'), 'abc');
  assert.equal(cache.textForRegex('a'.repeat(LIMIT)).length, LIMIT);
  assert.equal(cache.textForRegex('a'.repeat(LIMIT + 1)).length, LIMIT);
  assert.equal(cache.textForRegex('a'.repeat(LIMIT) + 'b'), 'a'.repeat(LIMIT));
});

test('a regex of a rule the person wrote reads the first characters of a long text: what comes after them is not found', () => {
  const e = engine({ antibot: { 'detect-mine': person() } });
  assert.equal(e.matchPattern(after(10), 'need.e', { regex: true }), true, 'near the start');
  assert.equal(e.matchPattern(after(LIMIT - 6), 'need.e', { regex: true }), true, 'ending exactly at the limit');
  assert.equal(e.matchPattern(after(LIMIT - 5), 'need.e', { regex: true }), false, 'one character past it');
  assert.equal(e.matchPattern(after(LIMIT * 5), 'need.e', { regex: true }), false, 'far past it');
});

test('the cap holds with the lowercased copy the engine hands over for the page, and with a case-sensitive rule', () => {
  const e = engine({});
  const page = after(LIMIT + 10, 'NEEDLE');
  assert.equal(e.matchPattern(page, 'need.e', { regex: true }, page.toLowerCase()), false);
  assert.equal(e.matchPattern(page, 'NEED.E', { regex: true, caseSensitive: true }), false);
  const early = 'NEEDLE' + 'x'.repeat(LIMIT * 2);
  assert.equal(e.matchPattern(early, 'need.e', { regex: true }, early.toLowerCase()), true);
  assert.equal(e.matchPattern(early, 'NEED.E', { regex: true, caseSensitive: true }), true);
});

test('capturing a match (URL rules, response bodies) reads the same first characters', () => {
  const e = engine({});
  assert.equal(e.matchPatternWithCapture(after(10), 'need.e', { regex: true }), 'needle');
  assert.equal(e.matchPatternWithCapture(after(LIMIT * 2), 'need.e', { regex: true }), null);
});

test('plain text and Whole word are linear and read all of a long text', () => {
  const e = engine({});
  const text = 'x'.repeat(LIMIT * 4) + ' needle'; // a word of its own: Whole word needs the boundary
  assert.equal(e.matchPattern(text, 'needle', {}), true);
  assert.equal(e.matchPattern(text, 'needle', { wholeWord: true }), true);
  assert.equal(e.matchPatternWithCapture(text, 'needle', {}), 'needle');
});

test('a regex an official rule ships reads all of the text, whoever else runs it', () => {
  const e = engine({ antibot: { 'detect-shipped': official(), 'detect-mine': person('other.*') } });
  assert.equal(e.matchPattern(after(LIMIT * 4), 'need.e', { regex: true }), true);
  assert.equal(e.matchPatternWithCapture(after(LIMIT * 4), 'need.e', { regex: true }), 'needle');
  assert.equal(e.matchPattern(after(LIMIT * 4), 'other.*', { regex: true }), false, 'the person\'s own regex stays cut');
});

test('a rule that only says it is Scrapfly\'s is not exempt: the author is not enough, the id has to be a shipped one', () => {
  const forged = { 'detect-forged': official({ id: 'detect-forged' }) };
  const e = engine({ antibot: forged });
  assert.equal(e.matchPattern(after(LIMIT * 2), 'need.e', { regex: true }), false);
});

test('an official rule the person edited keeps its shipped regexes exempt and cuts the ones the person wrote', () => {
  const shipped = official();
  const edited = official({ userModified: true, officialSnapshot: shipped, detection: { content: [{ id: 'c1', text: 'edit.d', textRegex: true }] } });
  const e = engine({ antibot: { 'detect-shipped': edited } });
  assert.equal(e.matchPattern(after(LIMIT * 2, 'edited'), 'edit.d', { regex: true }), false, 'the person\'s edit');
  assert.equal(e.matchPattern(after(LIMIT * 2), 'need.e', { regex: true }), true, 'the shipped copy it keeps');
});

test('a pattern is the regex of a rule only when the rule marks it as one', () => {
  const plain = official({ detection: { content: [{ id: 'c1', text: 'need.e' }] } });
  const e = engine({ antibot: { 'detect-shipped': plain } });
  assert.equal(e.matchPattern(after(LIMIT * 2), 'need.e', { regex: true }), false);
});

test('the engine without rules, or a rule set it cannot read, cuts as well: never an error', () => {
  for (const detectors of [undefined, null, {}, { antibot: null }, { antibot: { 'detect-shipped': null } }, { antibot: { 'detect-shipped': { id: 'detect-shipped', author: 'Scrapfly', detection: { content: 'broken' } } } }]) {
    const e = engine(detectors);
    assert.equal(e.matchPattern(after(LIMIT * 2), 'need.e', { regex: true }), false, JSON.stringify(detectors));
  }
});
