'use strict';
// A loose smoke test: on a synthetic 10,000-entry History the statistics must not go quadratic.
// The bound is generous on purpose (slow CI machines); it only catches accidental O(n^2).
const test = require('node:test');
const assert = require('node:assert/strict');
const HistoryStats = require('../sections/stats/history-stats.js');
const RuleStats = require('../sections/stats/rule-stats.js');

const DAY = 86400000;
const NOW = new Date(2026, 9, 17, 12).getTime();
const ENTRIES = 10000;

/** Deterministic, synthetic and unrelated to any real browsing. */
const buildHistory = () => {
  let seed = 20260917;
  const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const pool = [
    ...['Alpha Shield', 'Beta Guard', 'Gamma Wall', 'Delta Filter', 'Epsilon Gate', 'Zeta Lock', 'Eta Bot Check', 'Theta Proxy'].map((name) => ({ name, category: 'antibot' })),
    ...['Iota Puzzle', 'Kappa Slider', 'Lambda Click'].map((name) => ({ name, category: 'captcha' })),
    ...Array.from({ length: 14 }, (_, i) => ({ name: 'Probe ' + i, category: 'fingerprint' }))
  ];
  const paths = ['/', '/shop', '/cart', '/login', '/product/1', '/product/22', '/product/333', '/blog/post-4', '/account/settings'];
  const items = [];
  for (let i = 0; i < ENTRIES; i++) {
    const host = 'site' + String(Math.floor(random() * 400)).padStart(3, '0') + '.example';
    const detections = [];
    for (let n = Math.floor(random() * 8); n > 0; n--) {
      const { name, category } = pick(pool);
      detections.push({ detector: { id: 'detect-' + name.toLowerCase().replace(/ /g, '-'), name }, category, confidence: Math.floor(random() * 101),
        matches: [{ type: pick(['cookie', 'header', 'url', 'content']), name: 'sig' + Math.floor(random() * 30), confidence: Math.floor(random() * 101) }],
        ...(random() < 0.2 ? { combinations: [{ id: 'combo-' + Math.floor(random() * 5), confidence: 90 }] } : {}) });
    }
    items.push({ id: 'synthetic_' + i, hostname: host, url: 'https://' + host + pick(paths) + '?q=' + i, timestamp: NOW - Math.floor(random() * 90 * DAY), detections });
  }
  return items.sort((a, b) => b.timestamp - a.timestamp);
};

test('10,000 entries: scope, compute, summary, comparison and changes stay far from quadratic', () => {
  const items = buildHistory();
  assert.equal(items.length, ENTRIES);
  const started = process.hrtime.bigint();
  const scoped = HistoryStats.scopeItems(items, HistoryStats.DEFAULT_SCOPE);
  const counts = HistoryStats.categoryCounts(items);
  const stats = HistoryStats.compute(scoped, { now: NOW, days: 90, top: 8 });
  const window = HistoryStats.previousWindow(scoped, 30, NOW);
  const current = HistoryStats.summary(HistoryStats.filterByRange(scoped, 30, NOW));
  const previous = HistoryStats.summary(window.items);
  const movers = HistoryStats.movers(HistoryStats.protectionIndex(HistoryStats.filterByRange(scoped, 30, NOW)), HistoryStats.protectionIndex(window.items));
  const changes = HistoryStats.protectionChanges(scoped, { since: HistoryStats.rangeStart(30, NOW), now: NOW });
  const seen = HistoryStats.detectorSeen(items);
  const rules = RuleStats.compute([], { detectorMetrics: HistoryStats.detectorSummary(items), seen, historyEntries: items.length });
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(scoped.length, ENTRIES, 'the scope never drops an entry');
  assert.equal(stats.totals.entries, ENTRIES);
  assert.equal(stats.totals.detections, counts.total - counts.fingerprint, 'only fingerprinting was stripped');
  assert.equal(Object.values(stats.pageTiers).reduce((a, b) => a + b, 0), ENTRIES);
  assert.equal(current.pages + previous.pages <= ENTRIES, true);
  assert.ok(stats.timeline.length === 90 && stats.timeline.at(-1).partial);
  assert.ok(stats.stackMetrics.length > 0 && stats.stackMetrics.length <= 20);
  assert.ok(Array.isArray(movers.rising) && Array.isArray(rules.neverMatched));
  assert.ok(changes.rows.length <= 200 && changes.count >= changes.rows.length);
  assert.ok(elapsed < 3000, 'took ' + elapsed.toFixed(0) + ' ms');
});

test('scoping a large History does not copy untouched entries or change its identity for a full scope', () => {
  const items = buildHistory().slice(0, 2000);
  assert.equal(HistoryStats.scopeItems(items, HistoryStats.SCOPE_KEYS), items);
  const scoped = HistoryStats.scopeItems(items, ['antibot', 'captcha', 'fingerprint']);
  const untouched = scoped.filter((row, i) => row === items[i]).length;
  assert.ok(untouched > 0, 'entries with nothing to strip are shared with the input');
  assert.equal(scoped.length, items.length);
});
