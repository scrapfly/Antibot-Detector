'use strict';
// Statistics → Rules and Tools: what the rule library says about History, and what Advanced still holds.
const test = require('node:test');
const assert = require('node:assert/strict');
const RuleStats = require('../sections/stats/rule-stats.js');
const ToolsStats = require('../sections/stats/tools-stats.js');
const HistoryStats = require('../sections/stats/history-stats.js');

const NOW = new Date(2026, 9, 12, 15).getTime();
const MIN = 60000;

const rule = (id, name, extra = {}, detection = { url: [{ text: '/x/', description: 'Described' }] }) => ({ id, name, author: 'Scrapfly', detection, ...extra });
const library = (rules) => ({ detectors: { antibot: Object.fromEntries(rules.map((r) => [r.id, r])) } });
const OFFICIAL = ['detect-cloudflare', 'detect-amazon', 'detect-akamai', 'detect-quiet', 'detect-off'];
const fixtures = () => RuleStats.parseDetectors(library([
  rule('detect-cloudflare', 'Cloudflare'),
  rule('detect-amazon', 'Amazon Bot Protection', { userModified: true }),
  rule('detect-akamai', 'Akamai'),
  rule('detect-quiet', 'Quiet Vendor'),
  rule('my-waf', 'My WAF', { author: 'me' }, { header: [{ name: 'x-waf' }, { name: 'x-other', description: 'Has one' }] }),
  rule('my-seen', 'My Seen', { author: 'me' }, { cookie: [{ name: 'seen' }] }),
  rule('my-matched', 'My Matched', { author: 'me' }, { cookie: [{ name: 'matched' }] }),
  rule('detect-off', 'Switched Off', { enabled: false }),
  rule('my-off', 'My Off', { author: 'me', enabled: false })
]));
const metrics = [{ name: 'Cloudflare', id: 'detect-cloudflare', pages: 5, domains: 2, avgConfidence: 90 }, { name: 'my matched', id: '', pages: 1, domains: 1, avgConfidence: 50 },
  { name: 'Switched Off', id: 'detect-off', pages: 2, domains: 1, avgConfidence: 70 }];
const seenOf = (...names) => ({ byId: new Map(), byName: new Map(names.map((n) => [n.toLowerCase(), { pages: 3, firstTs: 1, lastTs: 2 }])) });
const compute = (extra = {}) => RuleStats.compute(fixtures(), { detectorMetrics: metrics, officialIds: OFFICIAL, ...extra });
const row = (r, id) => r.neverMatched.find((x) => x.id === id);

test('totals keep their old counts and add enabled, matched, attention and waiting', () => {
  const r = compute({ historyEntries: 500, seen: seenOf('Quiet Vendor'), incompatible: [{ id: 'detect-new', name: 'New Vendor' }, { id: 'detect-newer', name: 'Newer' }, 'junk'] });
  assert.deepEqual(r.totals, { total: 9, official: 5, custom: 4, modified: 1, disabled: 2, withCombinations: 0, patterns: 10, described: 7,
    enabled: 7, matched: 2, attention: 5, waiting: 2 });
  assert.deepEqual(r.neverMatched.filter((x) => x.attention).map((x) => x.id).sort(), ['detect-amazon', 'my-seen', 'my-waf'], 'plus the two updates waiting makes five');
  assert.equal(r.totals.enabled + r.totals.disabled, r.totals.total);
  assert.deepEqual(r.active.map((x) => x.id), ['detect-cloudflare', 'detect-off', 'my-matched'], 'a disabled rule that matched still shows as active');
  assert.equal(r.totals.matched, 2, 'but only enabled rules count as matched');
});

test('rules that found nothing are told apart: kind, quiet or unseen, and whether they need attention', () => {
  const r = compute({ historyEntries: 500, seen: seenOf('Quiet Vendor', 'My Seen', 'Amazon Bot Protection') });
  assert.deepEqual(r.neverMatched.map((x) => x.id).sort(), ['detect-akamai', 'detect-amazon', 'detect-quiet', 'my-seen', 'my-waf']);
  assert.deepEqual(['kind', 'status', 'attention'].map((k) => row(r, 'detect-akamai')[k]), ['official', 'unseen', false], 'an official rule for a vendor you have not met is normal');
  assert.deepEqual(['kind', 'status', 'attention'].map((k) => row(r, 'detect-quiet')[k]), ['official', 'quiet', false]);
  assert.deepEqual(['kind', 'status', 'attention'].map((k) => row(r, 'detect-amazon')[k]), ['edited', 'quiet', false], 'an edited official rule that History saw earlier is only quiet');
  assert.deepEqual(['kind', 'status', 'attention'].map((k) => row(r, 'my-seen')[k]), ['custom', 'quiet', false]);
  assert.deepEqual(['kind', 'status', 'attention'].map((k) => row(r, 'my-waf')[k]), ['custom', 'unseen', true], 'a custom rule History never saw, with enough History, needs a look');
  assert.equal(r.totals.attention, 1);
  assert.equal(row(r, 'my-waf').patterns, 2, 'the old row fields stay');
  assert.equal(r.neverMatched.find((x) => x.id === 'my-off'), undefined, 'disabled rules are not "found nothing"');
});

test('an edited official rule History never saw needs attention too, a custom one needs enough History', () => {
  const edited = RuleStats.compute(RuleStats.parseDetectors(library([rule('detect-amazon', 'Amazon', { userModified: true })])),
    { officialIds: ['detect-amazon'], historyEntries: 80, seen: seenOf() });
  assert.equal(edited.neverMatched[0].kind, 'edited');
  assert.equal(edited.neverMatched[0].attention, true);
  for (const [historyEntries, expected] of [[49, false], [50, true], [0, false], [undefined, false]]) {
    assert.equal(row(compute({ historyEntries, seen: seenOf() }), 'my-waf').attention, expected, String(historyEntries));
  }
  assert.equal(row(compute({ historyEntries: 20, minHistory: 10, seen: seenOf() }), 'my-waf').attention, true, 'the bar can be set');
});

test('without a seen list every unmatched rule is unseen, and a malformed one is ignored', () => {
  for (const seen of [undefined, null, {}, 'junk', { byId: {}, byName: [] }]) {
    const r = compute({ historyEntries: 500, seen });
    assert.ok(r.neverMatched.every((x) => x.status === 'unseen'), JSON.stringify(seen));
    assert.equal(row(r, 'my-seen').attention, true);
  }
});

test('a rule is seen by id or by name, as History sees it', () => {
  const seen = { byId: new Map([['detect-akamai', { pages: 1, firstTs: 1, lastTs: 1 }]]), byName: new Map([['my waf', { pages: 1, firstTs: 1, lastTs: 1 }]]) };
  const r = compute({ historyEntries: 500, seen });
  assert.equal(row(r, 'detect-akamai').status, 'quiet');
  assert.equal(row(r, 'my-waf').status, 'quiet');
  assert.equal(row(r, 'detect-quiet').status, 'unseen');
});

test('attention counts rules that need a look plus updates waiting for a newer extension; those rows come first', () => {
  const waiting = [{ id: 'detect-new', name: 'New Vendor', remoteVersion: '1.0.0', minExtensionVersion: '3.1' }];
  const r = compute({ historyEntries: 500, seen: seenOf('My Seen'), incompatible: waiting });
  assert.equal(r.totals.waiting, 1);
  assert.equal(r.totals.attention, 3, 'the edited Amazon rule and My WAF were never seen, plus one update waiting');
  assert.deepEqual(r.waiting.map((w) => w.name), ['New Vendor']);
  assert.deepEqual(r.neverMatched.slice(0, 2).map((x) => x.id), ['detect-amazon', 'my-waf'], 'attention rows lead');
  assert.deepEqual(r.neverMatched.slice(2).map((x) => x.name), ['Akamai', 'My Seen', 'Quiet Vendor'], 'the rest keep their order by name');
  const none = compute({ historyEntries: 10, seen: seenOf() });
  assert.deepEqual([none.totals.attention, none.totals.waiting], [0, 0]);
});

test('missing descriptions list only custom and edited rules, with their kind', () => {
  const r = compute();
  assert.deepEqual(r.missingDescriptions.map((x) => [x.id, x.kind, x.missing, x.patterns]),
    [['my-matched', 'custom', 1, 1], ['my-seen', 'custom', 1, 1], ['my-waf', 'custom', 1, 2]], 'most missing first, then by name');
  assert.ok(r.missingDescriptions.every((x) => x.kind !== 'official'), 'official descriptions are maintained by Scrapfly');
  assert.ok(r.missingDescriptions.every((x) => x.missing > 0));
  assert.equal(r.totals.patterns, 10, 'the pattern counts still include official rules');
  assert.equal(r.totals.described, 7);
  const edited = RuleStats.compute(RuleStats.parseDetectors(library([rule('detect-amazon', 'Amazon', { userModified: true }, { url: [{ text: '/a/' }] })])), { officialIds: ['detect-amazon'] });
  assert.deepEqual(edited.missingDescriptions.map((x) => [x.id, x.kind]), [['detect-amazon', 'edited']]);
});

test('RuleStats copes with no rules, junk and no options', () => {
  for (const rules of [null, undefined, [], 'x']) {
    const r = RuleStats.compute(rules);
    assert.deepEqual(r.totals, { total: 0, official: 0, custom: 0, modified: 0, disabled: 0, withCombinations: 0, patterns: 0, described: 0, enabled: 0, matched: 0, attention: 0, waiting: 0 });
    assert.deepEqual([r.neverMatched, r.missingDescriptions, r.active, r.waiting], [[], [], [], []]);
  }
  assert.doesNotThrow(() => RuleStats.compute(fixtures(), { seen: 7, historyEntries: 'many', minHistory: NaN, detectorMetrics: 'x' }));
});

test('rule statistics read HistoryStats.detectorSeen and detectorSummary', () => {
  const items = [
    { hostname: 'a.com', timestamp: NOW - 40 * 86400000, detections: [{ name: 'Akamai', category: 'antibot', confidence: 90, detector: { id: 'detect-akamai' } }] },
    { hostname: 'b.com', timestamp: NOW - 86400000, detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 90, detector: { id: 'detect-cloudflare' } }] }
  ];
  const range = HistoryStats.filterByRange(items, 30, NOW);
  const r = RuleStats.compute(fixtures(), { detectorMetrics: HistoryStats.detectorSummary(range), seen: HistoryStats.detectorSeen(items), historyEntries: items.length, officialIds: OFFICIAL });
  assert.equal(row(r, 'detect-akamai').status, 'quiet', 'Akamai was saved 40 days ago: seen, but not in this range');
  assert.equal(r.active[0].id, 'detect-cloudflare');
  assert.equal(r.totals.matched, 1);
});

const capture = (module, timestamp, extra = {}) => ({ timestamp, data: {}, ...extra });

test('ToolsStats.parse adds the expiry and the hostname of each capture', () => {
  const raw = {
    akamai: [
      capture('akamai', NOW, { expiresAt: NOW + 30 * MIN, url: 'https://Shop.Example.com/path?token=SECRET#x' }),
      capture('akamai', NOW - MIN, { expiresAt: String(NOW + MIN), hostname: ' API.Example.com ', url: 'https://ignored.example/' }),
      capture('akamai', NOW - 2 * MIN),
      capture('akamai', NOW - 3 * MIN, { expiresAt: null, url: 'not a url' }),
      capture('akamai', NOW - 4 * MIN, { expiresAt: true }), capture('akamai', NOW - 5 * MIN, { expiresAt: 'soon' }), capture('akamai', NOW - 6 * MIN, { expiresAt: '' }),
      capture('akamai', NOW - 7 * MIN, { expiresAt: NaN }), capture('akamai', NOW - 8 * MIN, { expiresAt: 0 })
    ]
  };
  const rows = ToolsStats.parse(raw);
  assert.deepEqual(rows.map((r) => r.expiresAt), [NOW + 30 * MIN, NOW + MIN, null, null, null, null, null, null, 0]);
  assert.deepEqual(rows.map((r) => r.hostname).slice(0, 4), ['shop.example.com', 'api.example.com', '', ''], 'a hostname, never a path or query');
  assert.deepEqual(Object.keys(rows[0]), ['module', 'timestamp', 'tool', 'expiresAt', 'hostname']);
  assert.ok(!JSON.stringify(rows).includes('SECRET'));
  assert.deepEqual(ToolsStats.parse('not json'), []);
});

const caps = (rows) => ToolsStats.parse({ akamai: rows.filter((r) => r.m === 'akamai').map((r) => r.c), awswaf: rows.filter((r) => r.m === 'awswaf').map((r) => r.c) });
const stored = (m, timestamp, extra) => ({ m, c: { timestamp, data: {}, ...extra } });

test('ToolsStats.compute counts live captures and sets expired ones apart', () => {
  const captures = caps([
    stored('akamai', NOW - 5 * MIN, { expiresAt: NOW + 25 * MIN, url: 'https://a.example/x' }),
    stored('akamai', NOW - 20 * MIN, { expiresAt: NOW + 9 * MIN, hostname: 'b.example', data: { tool: 't', label: 'Analyze Scripts' } }),
    stored('awswaf', NOW - 29 * MIN, { expiresAt: NOW + MIN }),
    stored('awswaf', NOW - 40 * MIN, { expiresAt: NOW - 10 * MIN }),
    stored('akamai', NOW - 41 * MIN, { expiresAt: NOW }),
    stored('akamai', NOW - MIN),
    stored('akamai', NOW + MIN, { expiresAt: NOW + 31 * MIN })
  ]);
  const t = ToolsStats.compute(captures, { since: null, now: NOW, dayKey: HistoryStats.dayKey });
  assert.equal(t.total, 4, 'live: two Akamai with an expiry, one AWS WAF, and one Akamai with no expiry; the future one is not saved yet');
  assert.equal(t.stale, 2, 'expired at or before now');
  assert.equal(t.expiringSoon, 2, 'within ten minutes: 9 and 1 minutes left');
  assert.deepEqual(t.live.map((c) => [c.name, c.hostname, c.tool]), [['Akamai Bot Manager', '', ''], ['Akamai Bot Manager', 'a.example', ''], ['Akamai Bot Manager', 'b.example', 'Analyze Scripts'], ['AWS WAF', '', '']],
    'newest first');
  assert.deepEqual(t.live.map((c) => c.timestamp), [NOW - MIN, NOW - 5 * MIN, NOW - 20 * MIN, NOW - 29 * MIN]);
  assert.deepEqual(Object.keys(t.live[0]), ['module', 'name', 'tool', 'hostname', 'timestamp', 'expiresAt']);
  assert.equal(t.live[0].expiresAt, null, 'a capture with no expiry is live and says so');
  assert.equal(t.live[1].expiresAt, NOW + 25 * MIN);
  assert.deepEqual(t.byModule.map((m) => [m.name, m.count]), [['Akamai Bot Manager', 3], ['AWS WAF', 1]], 'by vendor over live captures only');
  assert.deepEqual(t.byTool.map((x) => [x.capture, x.label, x.count]), [[true, '', 3], [false, 'Analyze Scripts', 1]]);
  assert.equal([...t.perDay.values()].reduce((a, b) => a + b, 0), 4);
});

test('ToolsStats.compute: the expiry boundaries and the range still apply', () => {
  const at = (expiresAt) => ToolsStats.compute(caps([stored('akamai', NOW - MIN, { expiresAt })]), { now: NOW });
  assert.deepEqual([at(NOW - 1).total, at(NOW - 1).stale], [0, 1]);
  assert.deepEqual([at(NOW).total, at(NOW).stale], [0, 1], 'expiring exactly now is expired');
  assert.deepEqual([at(NOW + 1).total, at(NOW + 1).stale], [1, 0]);
  assert.equal(at(NOW + 10 * MIN).expiringSoon, 1, 'ten minutes left is still soon');
  assert.equal(at(NOW + 10 * MIN + 1).expiringSoon, 0);
  assert.equal(at(undefined).expiringSoon, 0, 'no expiry never expires soon');
  const old = caps([stored('akamai', NOW - 3 * 86400000, { expiresAt: NOW + MIN }), stored('akamai', NOW - MIN, { expiresAt: NOW + MIN })]);
  assert.equal(ToolsStats.compute(old, { since: NOW - 86400000, now: NOW }).total, 1, 'since limits what is counted, though the page passes null');
  assert.equal(ToolsStats.compute(old, { since: null, now: NOW }).total, 2);
  const empty = ToolsStats.compute([], { now: NOW });
  assert.deepEqual([empty.total, empty.live, empty.stale, empty.expiringSoon, empty.byModule, empty.byTool], [0, [], 0, 0, [], []]);
  assert.deepEqual(ToolsStats.compute(null, { now: NOW }).live, []);
  assert.doesNotThrow(() => ToolsStats.compute([null, 5, {}], { now: NOW }));
});
