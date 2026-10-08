const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Test pattern (sections/rules/helpers/pattern-tester.js) must say what
// detection does: it runs on the real engine, and every sentence it shows is
// a locale key whose English fallback matches the locale.

const root = path.join(__dirname, '..');
const context = vm.createContext({
  Constants: { DEFAULT_MATCH_CONFIDENCE: 80, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
  Logger: new Proxy({}, { get: (_, key) => key === 'debugMode' ? false : () => {} }),
  setTimeout, clearTimeout
});
context.window = context;
for (const file of [
  'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
  'modules/detection/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js',
  'modules/detection/detection-combinations.js',
  ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(n => `modules/detection/engine/detection-engine-${n}.js`),
  'sections/rules/helpers/pattern-tester.js'
]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const PT = context.PatternTester;
const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const matches = (kind, pattern, options, samples) => samples.map(s => PT.evaluate(kind, s, pattern, options).matched);

test('each pattern field maps to the text detection matches it against', () => {
  assert.deepEqual(
    [['url', 'name'], ['content', 'name'], ['cookie', 'name'], ['cookie', 'value'], ['header', 'name'], ['header', 'value'],
      ['payload', 'name'], ['payload', 'payloadUrl'], ['dom', 'name'], ['window', 'name'], ['js_hooks', 'name']].map(([m, f]) => PT.kindFor(m, f)),
    ['url', 'content', 'cookieName', 'cookieValue', 'headerName', 'headerValue', 'payloadText', 'payloadUrl', null, null, null]);
});

test('cookie names: plain text is a prefix, * a wildcard, Regex and Whole word as written', () => {
  const samples = ['_abck', '_abck_2', '_ABCK', 'x_abck'];
  assert.deepEqual(matches('cookieName', '_abck', {}, samples), [true, true, true, false]);
  assert.deepEqual(matches('cookieName', '_abck', { caseSensitive: true }, samples), [true, true, false, false]);
  assert.deepEqual(matches('cookieName', '_abck', { wholeWord: true }, samples), [true, false, true, false]);
  assert.deepEqual(matches('cookieName', '^_abck$', { regex: true }, samples), [true, false, true, false]);
  assert.deepEqual(matches('cookieName', 'bm_*', {}, ['bm_sz', 'bm_sv', 'xbm_sz']), [true, true, false]);
  // A cookie value is "contains", not a prefix
  assert.deepEqual(matches('cookieValue', 'abc', {}, ['xxabcxx']), [true]);
});

test('contains, whole word (word boundaries) and case, like matchPattern', () => {
  const url = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
  assert.deepEqual(matches('url', 'challenges.cloudflare.com', {}, [url, url.toUpperCase()]), [true, true]);
  assert.deepEqual(matches('url', 'challenges.cloudflare.com', { caseSensitive: true }, [url, url.toUpperCase()]), [true, false]);
  assert.deepEqual(matches('content', '_abck', { wholeWord: true }, ['test _abck more', 'test_abck', 'x-_abck', '_abckMore']), [true, false, true, false]);
  // A pattern starting with a symbol needs a word character before it
  assert.deepEqual(matches('content', '/api/', { wholeWord: true }, ['https://e.com/api/v1', ' /api/ ']), [true, false]);
});

test('regex: case flag, ReDoS guard and invalid syntax as detection treats them', () => {
  assert.deepEqual(matches('url', '^https://www\\.google\\.com/js/th/', { regex: true },
    ['https://www.google.com/js/th/x.js', 'HTTPS://WWW.GOOGLE.COM/JS/TH/X.JS', 'https://evil.test/?u=https://www.google.com/js/th/']), [true, true, false]);
  assert.deepEqual(matches('url', '\\D+', { regex: true }, ['abc']), [true], 'case-insensitive regexes keep \\D');
  const evil = PT.evaluate('content', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab', '(a+)+$', { regex: true });
  assert.deepEqual([evil.matched, evil.rejected], [false, true]);
  const broken = PT.evaluate('content', 'x', '(', { regex: true });
  assert.equal(broken.matched, false);
  assert.match(broken.error, /./);
});

test('the request URL of a payload rule ignores Whole word, as detection does', () => {
  assert.deepEqual(matches('payloadUrl', 'api', { wholeWord: true }, ['https://e.com/xapi']), [true]);
  assert.deepEqual(matches('payloadText', 'api', { wholeWord: true }, ['xapi']), [false]);
});

test('the matched part is located for the highlight', () => {
  const at = (kind, text, pattern, options) => { const r = PT.evaluate(kind, text, pattern, options); return [r.start, r.end]; };
  assert.deepEqual(at('url', 'https://x.test/CHALLENGE', 'challenge', {}), [15, 24]);
  assert.deepEqual(at('url', 'https://x.test/v12/a', '/v\\d+/', { regex: true }), [14, 19]);
  assert.deepEqual(at('cookieName', '_abck_2', '_abck', {}), [0, 5]);
  assert.deepEqual(at('cookieName', 'bm_sz', 'bm_*', {}), [0, 5]);
  assert.deepEqual(at('content', 'a _abck b', '_abck', { wholeWord: true }), [2, 7]);
});

test('the plain-words sentence follows the options', () => {
  const keys = (kind, pattern, options) => plain(PT.describe(kind, pattern, options).map(s => s.key));
  assert.deepEqual(keys('url', '', {}), ['ptSaysEmpty']);
  assert.deepEqual(keys('url', 'x', {}), ['ptSaysContainsFmt', 'ptCaseIgnored']);
  assert.deepEqual(keys('cookieName', '_abck', {}), ['ptSaysPrefixFmt', 'ptCaseIgnored']);
  assert.deepEqual(keys('cookieName', 'bm_*', {}), ['ptSaysWildcardFmt', 'ptCaseIgnored']);
  assert.deepEqual(keys('content', 'x', { wholeWord: true, caseSensitive: true }), ['ptSaysWordFmt', 'ptCaseExact']);
  assert.deepEqual(keys('content', 'x', { regex: true, wholeWord: true }), ['ptSaysRegex', 'ptCaseIgnored']);
  assert.deepEqual(keys('payloadUrl', 'x', { wholeWord: true }), ['ptSaysContainsFmt', 'ptCaseIgnored']);
});

test('notes warn about the usual traps', () => {
  const keys = (kind, pattern, options) => plain(PT.notes(kind, pattern, options).map(n => n.key));
  assert.deepEqual(keys('url', '(', { regex: true }), ['ptNoteInvalidFmt']);
  assert.deepEqual(keys('url', '(a+)+$', { regex: true }), ['ptNoteRejected']);
  assert.deepEqual(keys('url', '/challenge/', { regex: true }), ['ptNoteSlashes']);
  assert.deepEqual(keys('url', 'cdn\\.example\\.com', {}), ['ptNoteLooksRegex']);
  assert.deepEqual(keys('url', '^https://x', {}), ['ptNoteLooksRegex']);
  assert.deepEqual(keys('url', 'challenges.cloudflare.com', {}), [], 'a plain URL is not mistaken for a regex');
  assert.deepEqual(keys('content', 'x', { regex: true, wholeWord: true }), ['ptNoteWordIgnored']);
  assert.deepEqual(keys('payloadUrl', 'x', { regex: true, wholeWord: true }), []);
  assert.deepEqual(keys('headerName', 'X-Datadome', { caseSensitive: true }), ['ptNoteHeaderCase']);
  assert.deepEqual(keys('headerName', 'x-datadome', { caseSensitive: true }), []);
  assert.deepEqual(keys('content', '.js', { wholeWord: true }), ['ptNoteWordEdges']);
});

test('default samples show a literal pattern joined, extended and in another case', () => {
  assert.deepEqual(plain(PT.defaultSamples('cookieName', '_abck', {})), ['_abck', 'x_abck', '_abck_2', '_ABCK']);
  assert.deepEqual(plain(PT.defaultSamples('cookieName', 'bm_*', {})), ['bm_abc', 'xbm_abc', 'bm_abc_2', 'BM_ABC']);
  assert.deepEqual(plain(PT.defaultSamples('url', '1234', {})), ['1234', 'x1234', '1234_2'], 'no duplicate when case does not change');
  assert.deepEqual(plain(PT.defaultSamples('url', '^x$', { regex: true })), []);
  assert.deepEqual(plain(PT.sampleLines(' a \n\n b\r\n')), ['a', 'b']);
  assert.equal(PT.sampleLines(Array.from({ length: 30 }, (_, i) => `s${i}`).join('\n')).length, 20);
});

test('every text the tester shows is a locale key with the same English', () => {
  const items = [
    ...['url', 'content', 'cookieName', 'cookieValue', 'headerName', 'headerValue', 'payloadText', 'payloadUrl']
      .flatMap(kind => [{ key: PT.KINDS[kind].label[0], fallback: PT.KINDS[kind].label[1] }]),
    ...PT.describe('url', '', {}), ...PT.describe('url', 'x', {}), ...PT.describe('cookieName', 'x', {}),
    ...PT.describe('cookieName', 'x*', {}), ...PT.describe('url', 'x', { wholeWord: true, caseSensitive: true }),
    ...PT.describe('url', 'x', { regex: true }),
    ...PT.notes('url', '(', { regex: true }), ...PT.notes('url', '(a+)+$', { regex: true }),
    ...PT.notes('url', '/a/', { regex: true, wholeWord: true }), ...PT.notes('url', '\\.js', {}),
    ...PT.notes('headerName', 'A', { caseSensitive: true }), ...PT.notes('content', '.js', { wholeWord: true })
  ];
  assert.ok(items.length > 20);
  for (const { key, fallback } of items) {
    assert.ok(en[key], `${key} missing from _locales/en`);
    assert.equal(en[key].message, fallback, `${key}: English fallback differs from the locale`);
  }
  const source = fs.readFileSync(path.join(root, 'sections/rules/helpers/pattern-tester.js'), 'utf8');
  for (const [, key, fallback] of source.matchAll(/\['[^']*', '(rhRef\w+)', '([^']+)'\]/g)) {
    assert.equal(en[key]?.message, fallback, `${key}: cheat sheet fallback differs from the locale`);
  }
});
