'use strict';
// Statistics category scope: which detections a page shows, and what hiding them costs.
const test = require('node:test');
const assert = require('node:assert/strict');
const HistoryStats = require('../sections/stats/history-stats.js');

const det = (name, category, confidence = 90, extra = {}) => ({ name, category, confidence, ...extra });
const antibot = (name = 'Cloudflare', confidence) => det(name, 'antibot', confidence);
const captcha = (name = 'reCAPTCHA', confidence) => det(name, 'captcha', confidence);
const finger = (name = 'Canvas', confidence = 20) => det(name, 'fingerprint', confidence);
const page = (hostname, detections, extra = {}) => ({ hostname, url: 'https://' + hostname + '/', timestamp: 1, detections, ...extra });

test('constants describe the scope the page starts with', () => {
  assert.deepEqual(HistoryStats.SCOPE_KEYS, ['antibot', 'captcha', 'fingerprint', 'other']);
  assert.deepEqual(HistoryStats.DEFAULT_SCOPE, ['antibot', 'captcha', 'other'], 'fingerprinting starts hidden');
  assert.deepEqual(HistoryStats.CATEGORY_ORDER, ['captcha', 'antibot', 'other', 'fingerprint']);
  assert.deepEqual(HistoryStats.DIFFICULTY_RANK, { None: 0, Low: 1, Medium: 2, High: 3 });
  assert.equal(HistoryStats.STRONG_MIN, 80);
  assert.equal(HistoryStats.MODERATE_MIN, 40);
  assert.equal(HistoryStats.MOVER_MIN, 3);
  assert.equal(HistoryStats.MOVER_RATIO, 0.25);
  assert.equal(HistoryStats.COMPARE_MIN_COVERAGE, 0.8);
  assert.equal(HistoryStats.DELTA_SMALL_BASE, 10);
  assert.equal(HistoryStats.DELTA_FLAT_RATIO, 0.05);
  assert.equal(HistoryStats.UNCONFIRMED_MIN_PAGES, 3);
});

test('tierOf: strong from 80, moderate 40 to 79, weak below 40, unknown without a score', () => {
  const cases = [[100, 'strong'], [80, 'strong'], [79.9, 'moderate'], [79, 'moderate'], [40, 'moderate'], [39.9, 'weak'], [39, 'weak'], [0, 'weak']];
  for (const [score, tier] of cases) assert.equal(HistoryStats.tierOf(score), tier, String(score));
  for (const bad of [null, undefined, '', '90', NaN, Infinity, -1, 101, true, {}, []]) assert.equal(HistoryStats.tierOf(bad), 'unknown', String(bad));
});

test('scopeItems returns the same array when the scope holds every category or none we know', () => {
  const items = [page('a.com', [antibot(), finger()])];
  for (const scope of [HistoryStats.SCOPE_KEYS, new Set(HistoryStats.SCOPE_KEYS), [...HistoryStats.SCOPE_KEYS, 'junk'],
    [], new Set(), null, undefined, 'antibot', {}, ['junk', 3, null], 42]) {
    assert.equal(HistoryStats.scopeItems(items, scope), items, JSON.stringify([...(scope instanceof Set ? scope : Array.isArray(scope) ? scope : [])]));
  }
  assert.deepEqual(HistoryStats.scopeItems(null, ['antibot']), []);
  assert.deepEqual(HistoryStats.scopeItems({}, HistoryStats.DEFAULT_SCOPE), []);
});

test('scopeItems strips detections of the other categories and never drops an entry', () => {
  const items = [
    page('a.com', [antibot(), captcha(), finger('Canvas'), finger('Audio')]),
    page('b.com', [finger('Canvas')]),
    page('c.com', []),
    page('d.com', [det('Custom', 'something else')])
  ];
  const before = JSON.stringify(items);
  const scoped = HistoryStats.scopeItems(items, HistoryStats.DEFAULT_SCOPE);
  assert.equal(JSON.stringify(items), before, 'the input is not mutated');
  assert.equal(scoped.length, items.length, 'entries are never dropped');
  assert.deepEqual(scoped.map((row) => row.detections.map((d) => d.name)), [['Cloudflare', 'reCAPTCHA'], [], [], ['Custom']]);
  assert.equal(scoped[1].hostname, 'b.com', 'a page whose detections are all scoped away is still a page');
  assert.equal(scoped[2], items[2], 'an entry nothing was removed from keeps its identity');
  assert.deepEqual(HistoryStats.scopeItems(items, new Set(['fingerprint'])).map((row) => row.detections.length), [2, 1, 0, 0]);
  assert.deepEqual(HistoryStats.scopeItems(items, ['other', 'unknown']).map((row) => row.detections.length), [0, 0, 0, 1]);
});

test('scopeItems normalises raw category names and passes malformed rows through', () => {
  const nested = { detector: { name: 'Nested', category: 'Fingerprint' }, confidence: 10 };
  const legacy = { detector: 'Legacy', type: 'WAF', confidence: 10 };
  const junk = [null, false, 3, 'text', [], { hostname: 'no-detections.com' }, { detections: 'bad' },
    page('x.com', [null, false, [], nested, legacy, captcha()])];
  const scoped = HistoryStats.scopeItems(junk, ['antibot', 'captcha']);
  assert.equal(scoped.length, junk.length);
  for (let i = 0; i < 7; i++) assert.equal(scoped[i], junk[i], 'a non-record or a record without a detections array is passed through as is');
  assert.deepEqual(scoped[7].detections.map((d) => d.name || d.detector), ['Legacy', 'reCAPTCHA'], 'junk rows and the nested fingerprint are removed');
  assert.equal(HistoryStats.scopeItems(new Array(3), ['antibot']).length, 3, 'sparse arrays keep their length');
});

test('categoryCounts counts detections per category and the pages with fingerprinting', () => {
  const items = [
    page('a.com', [antibot(), captcha(), finger(), finger('Audio')]),
    page('b.com', [finger()]),
    page('c.com', [antibot('A'), antibot('B'), det('Odd', 'strange')]),
    page('d.com', []), null, 'x', { hostname: 'e.com' }
  ];
  assert.deepEqual(HistoryStats.categoryCounts(items), { antibot: 3, captcha: 1, fingerprint: 3, other: 1, total: 8, fingerprintPages: 2 });
  assert.deepEqual(HistoryStats.categoryCounts(null), { antibot: 0, captcha: 0, fingerprint: 0, other: 0, total: 0, fingerprintPages: 0 });
  const scoped = HistoryStats.scopeItems(items, HistoryStats.DEFAULT_SCOPE);
  assert.equal(HistoryStats.categoryCounts(scoped).fingerprint, 0);
  assert.equal(HistoryStats.categoryCounts(scoped).total, 5);
});

test('categoryProfile summarises one category: pages, techniques and average confidence', () => {
  const items = [
    page('a.com', [finger('Canvas', 30), finger('Canvas', 10), finger('Audio', 20), antibot()]),
    page('b.com', [finger('Canvas', 50), finger('WebGL', null)]),
    page('c.com', [finger('Audio', 40), finger('Fonts', 60), finger('Screen', 70)]),
    page('d.com', [antibot()]), page('e.com', [])
  ];
  const profile = HistoryStats.categoryProfile(items, 'fingerprint');
  assert.equal(profile.pages, 3);
  assert.equal(profile.detections, 8);
  assert.equal(profile.distinct, 5);
  assert.equal(profile.avgConfidence, Math.round((30 + 10 + 20 + 50 + 40 + 60 + 70) / 7), 'unknown scores are left out of the average');
  assert.deepEqual(profile.techniques, [{ name: 'Audio', pages: 2 }, { name: 'Canvas', pages: 2 }, { name: 'Fonts', pages: 1 }],
    'top three by pages, then by name; repeats on one page count once');
  assert.deepEqual(HistoryStats.categoryProfile(items, 'captcha'), { pages: 0, detections: 0, distinct: 0, avgConfidence: null, techniques: [] });
  assert.deepEqual(HistoryStats.categoryProfile(null, 'fingerprint'), { pages: 0, detections: 0, distinct: 0, avgConfidence: null, techniques: [] });
});

test('category normalisation is cached without changing its answers', () => {
  const raw = ['Anti-Bot', 'CAPTCHA', 'Fingerprint', 'WAF', 'bot', 'Other', '', null, undefined, 5, {}, 'CAPTCHA', 'Anti-Bot'];
  const expected = ['antibot', 'captcha', 'fingerprint', 'antibot', 'antibot', 'other', 'other', 'other', 'other', 'other', 'other', 'captcha', 'antibot'];
  assert.deepEqual(raw.map((value) => HistoryStats.normalizeCategory(value)), expected);
  assert.deepEqual(raw.map((value) => HistoryStats.normalizeCategory(value)), expected, 'a second pass reads the cache');
  for (let i = 0; i < 400; i++) HistoryStats.normalizeCategory('made up ' + i);
  assert.ok(HistoryStats._categoryCache.size <= 256, 'the cache stays bounded');
  assert.equal(HistoryStats.normalizeCategory('Fingerprint'), 'fingerprint');
});
