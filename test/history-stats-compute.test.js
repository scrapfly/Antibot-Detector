'use strict';
// Statistics: what compute() and its light companions add for the redesigned page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const HistoryStats = require('../sections/stats/history-stats.js');

const DAY = 86400000;
const NOW = new Date(2026, 8, 29, 15, 0, 0).getTime();
const det = (name, category = 'antibot', confidence = 90, extra = {}) => ({ name, category, confidence, ...extra });
const page = (hostname, detections, timestamp = NOW, extra = {}) => ({ hostname, url: 'https://' + hostname + '/', timestamp, detections, ...extra });
const hasMapOrSet = (value) => {
  if (value instanceof Map || value instanceof Set) return true;
  return value && typeof value === 'object' ? Object.values(value).some(hasMapOrSet) : false;
};

test('compute keeps every field it had and stays JSON-safe', () => {
  const s = HistoryStats.compute([page('a.com', [det('Cloudflare'), det('Canvas', 'fingerprint', 20)]), page('a.com', [det('Cloudflare')], NOW - DAY)], { now: NOW });
  for (const key of ['totals', 'topDetectors', 'topDomains', 'categories', 'difficulty', 'timeline', 'hourly', 'weekdays', 'confidenceBuckets', 'categoryConfidence',
    'categoryOverlap', 'detectorMetrics', 'domainMetrics', 'methods', 'methodsByCategory', 'totalMatches', 'signalMetrics', 'weakEvidence', 'decided',
    'combinationMetrics', 'togetherMetrics', 'domainChanges', 'domainChangeCount']) assert.ok(key in s, key);
  for (const key of ['pageTiers', 'confidenceByCategory', 'decidedByCategory', 'unconfirmed', 'stackMetrics']) assert.ok(key in s, key);
  assert.deepEqual(Object.keys(s.totals), ['entries', 'uniqueDomains', 'detections', 'uniqueDetectors', 'entriesWithDetections', 'avgDetectionsPerEntry', 'avgConfidence',
    'firstTimestamp', 'lastTimestamp', 'activeDays', 'detectionRate', 'validConfidenceCount', 'unknownConfidenceCount']);
  assert.equal(hasMapOrSet(s), false, 'no Map or Set in the output');
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('compute() does not depend on a scope, so scoped input is all it ever needs', () => {
  const items = [page('a.com', [det('Cloudflare'), det('Canvas', 'fingerprint', 20)])];
  const full = HistoryStats.compute(items, { now: NOW });
  const scoped = HistoryStats.compute(HistoryStats.scopeItems(items, HistoryStats.DEFAULT_SCOPE), { now: NOW });
  assert.equal(full.totals.detections, 2);
  assert.equal(scoped.totals.detections, 1);
  assert.equal(scoped.totals.entries, full.totals.entries, 'entries are never dropped by the scope');
  assert.equal(scoped.totals.uniqueDomains, full.totals.uniqueDomains);
  assert.equal(scoped.totals.activeDays, full.totals.activeDays);
});

test('timeline days carry protections, layered domains and the day still counting', () => {
  const items = [
    page('a.com', [det('Cloudflare'), det('reCAPTCHA', 'captcha')]),
    page('b.com', [det('Cloudflare')]),
    page('c.com', [det('Canvas', 'fingerprint', 20), det('Audio', 'fingerprint', 20)]),
    page('d.com', [det('DataDome'), det('Canvas', 'fingerprint', 20)]),
    page('a.com', [det('Akamai')], NOW - DAY), page('a.com', [det('Shape')], NOW - DAY),
    page('e.com', [], NOW - DAY)
  ];
  const { timeline } = HistoryStats.compute(items, { now: NOW, days: 3 });
  assert.equal(timeline.length, 3);
  assert.deepEqual(timeline.map((d) => d.partial), [false, false, true], 'only today is still counting');
  assert.deepEqual(timeline.map((d) => d.protections), [0, 2, 5], 'distinct names per day: Akamai and Shape; then Cloudflare, reCAPTCHA, Canvas, Audio, DataDome');
  assert.deepEqual(timeline.map((d) => d.layeredDomains), [0, 0, 1], 'only protections together on one page layer a domain (a.com yesterday changed provider between two entries); fingerprinting never layers a domain');
  assert.equal(timeline[2].entries, 4);
  assert.equal(timeline[0].partial, false);
  assert.equal(typeof timeline[1].protections, 'number');
});

test('the day of the reference time is the one still counting, even when it is in the past', () => {
  const { timeline } = HistoryStats.compute([page('a.com', [det('X')], NOW - 5 * DAY)], { now: NOW - 2 * DAY, days: 4 });
  assert.equal(timeline.at(-1).date, HistoryStats.dayKey(NOW - 2 * DAY));
  assert.equal(timeline.at(-1).partial, true, 'the last day of a timeline is the day of `now`');
  assert.equal(timeline.filter((d) => d.partial).length, 1);
});

test('pageTiers sorts every page into one tier and sums to the entries', () => {
  const items = [
    page('1.com', [det('Cloudflare'), det('reCAPTCHA', 'captcha')]),
    page('2.com', [det('Cloudflare')]),
    page('3.com', [det('Custom', 'something else')]),
    page('4.com', [det('reCAPTCHA', 'captcha')]),
    page('5.com', [det('Canvas', 'fingerprint', 20)]),
    page('6.com', []),
    page('7.com', [det('Canvas', 'fingerprint', 20), det('hCaptcha', 'captcha')]),
    page('8.com', [det('Custom', 'other'), det('Turnstile', 'captcha')]),
    null
  ];
  const s = HistoryStats.compute(items, { now: NOW });
  assert.deepEqual(s.pageTiers, { both: 2, antibot: 2, captcha: 2, none: 2 });
  assert.equal(Object.values(s.pageTiers).reduce((a, b) => a + b, 0), s.totals.entries);
  assert.deepEqual(HistoryStats.compute([], { now: NOW }).pageTiers, { both: 0, antibot: 0, captcha: 0, none: 0 });
});

test('evidence tiers split at 40 and 80, repeats count, unknown scores do not', () => {
  const scores = [100, 80, 79, 40, 39, 0, null, '90', 101, -1];
  const s = HistoryStats.compute([page('a.com', scores.map((c) => ({ name: 'X', category: 'antibot', confidence: c })))], { now: NOW });
  const row = s.detectorMetrics[0];
  assert.deepEqual([row.strong, row.moderate, row.weak], [2, 2, 2]);
  assert.equal(row.pages, 1, 'tier counts are detections while pages stay pages');
  assert.equal(s.categoryConfidence[0].strong, 2);
  assert.equal(s.categoryConfidence[0].withConfidence, 6);
  assert.deepEqual(s.categoryConfidence.map((c) => c.strong), [2, 0, 0, 0]);
  for (const c of s.categoryConfidence) assert.deepEqual(Object.keys(c), ['category', 'detections', 'withConfidence', 'avgConfidence', 'strong']);
});

test('strong evidence is 80 and up: 79 is moderate, 80 is strong', () => {
  for (const [score, tier] of [[79, 'moderate'], [80, 'strong'], [100, 'strong'], [40, 'moderate'], [39, 'weak']]) {
    const row = HistoryStats.compute([page('a.com', [det('X', 'captcha', score)])], { now: NOW }).detectorMetrics[0];
    assert.equal(row[tier], 1, score + ' is ' + tier);
    assert.equal(row.strong + row.moderate + row.weak, 1);
  }
});

test('confidenceByCategory splits the bands by category and matches confidenceBuckets', () => {
  const items = [page('a.com', [det('A', 'antibot', 95), det('B', 'antibot', 85), det('C', 'captcha', 100), det('D', 'fingerprint', 5), det('E', 'fingerprint', 19.5),
    det('F', 'fingerprint', 20), det('G', 'other', 45), det('H', 'antibot', 61), det('I', 'antibot', null)])];
  const s = HistoryStats.compute(items, { now: NOW });
  assert.deepEqual(s.confidenceByCategory.map((b) => [b.min, b.max]), s.confidenceBuckets.map((b) => [b.min, b.max]));
  assert.deepEqual(s.confidenceByCategory[4], { min: 80, max: 100, antibot: 2, captcha: 1, fingerprint: 0, other: 0 });
  assert.deepEqual(s.confidenceByCategory[0], { min: 0, max: 19, antibot: 0, captcha: 0, fingerprint: 2, other: 0 });
  assert.deepEqual(s.confidenceByCategory[1], { min: 20, max: 39, antibot: 0, captcha: 0, fingerprint: 1, other: 0 });
  assert.deepEqual(s.confidenceByCategory[2], { min: 40, max: 59, antibot: 0, captcha: 0, fingerprint: 0, other: 1 });
  assert.deepEqual(s.confidenceByCategory[3], { min: 60, max: 79, antibot: 1, captcha: 0, fingerprint: 0, other: 0 });
  s.confidenceByCategory.forEach((band, i) => {
    assert.equal(band.antibot + band.captcha + band.fingerprint + band.other, s.confidenceBuckets[i].count);
  });
});

test('decidedByCategory says how each category was decided and adds up to decided', () => {
  const combo = (id, confidence) => ({ combinations: [{ id, confidence }] });
  const items = [page('a.com', [det('A', 'antibot', 60), det('B', 'antibot', 98, combo('c1')), det('C', 'antibot', 94, combo('c2')),
    det('D', 'captcha', 70), det('E', 'fingerprint', 10), det('F', 'fingerprint', null), det('G', 'other', 50, combo('c3'))])];
  const s = HistoryStats.compute(items, { now: NOW });
  assert.deepEqual(s.decidedByCategory.antibot, { single: { detections: 1, avgConfidence: 60 }, combination: { detections: 2, avgConfidence: 96 } });
  assert.deepEqual(s.decidedByCategory.captcha, { single: { detections: 1, avgConfidence: 70 }, combination: { detections: 0, avgConfidence: null } });
  assert.deepEqual(s.decidedByCategory.fingerprint, { single: { detections: 2, avgConfidence: 10 }, combination: { detections: 0, avgConfidence: null } });
  assert.deepEqual(s.decidedByCategory.other, { single: { detections: 0, avgConfidence: null }, combination: { detections: 1, avgConfidence: 50 } });
  assert.deepEqual(Object.keys(s.decidedByCategory), ['antibot', 'captcha', 'fingerprint', 'other']);
  for (const way of ['single', 'combination']) {
    assert.equal(Object.values(s.decidedByCategory).reduce((sum, c) => sum + c[way].detections, 0), s.decided[way].detections, way);
  }
});

test('domainMetrics carry difficulty, CAPTCHA flag, stack and dates without changing their order', () => {
  const names = Array.from({ length: 10 }, (_, i) => 'Bot ' + String.fromCharCode(74 - i)); // Bot J .. Bot A
  const items = [
    page('big.com', [det('Canvas', 'fingerprint', 20), det('Audio', 'fingerprint', 20), det('Custom', 'other'), det('reCAPTCHA', 'captcha'), ...names.map((n) => det(n))], NOW - 2 * DAY),
    page('big.com', [], NOW),
    page('mid.com', [det('Cloudflare')], NOW - 3 * DAY), page('mid.com', [], NOW - 5 * DAY), page('mid.com', [det('Cloudflare')], NOW - DAY),
    page('low.com', [det('Canvas', 'fingerprint', 20)], NOW),
    page('none.com', [], NOW - 7 * DAY), page('none.com', [], undefined, { timestamp: undefined })
  ];
  const s = HistoryStats.compute(items, { now: NOW });
  assert.deepEqual(s.domainMetrics.map((d) => [d.hostname, d.visits]), [['mid.com', 3], ['big.com', 2], ['none.com', 2], ['low.com', 1]], 'rows keep their order: pages, then name');
  const by = (host) => s.domainMetrics.find((d) => d.hostname === host);
  assert.deepEqual([by('big.com').difficulty, by('mid.com').difficulty, by('low.com').difficulty, by('none.com').difficulty], ['High', 'Medium', 'Low', 'None'],
    'the worst level over the entries of the domain');
  assert.deepEqual([by('big.com').hasCaptcha, by('mid.com').hasCaptcha], [true, false]);
  assert.equal(by('big.com').uniqueDetectors, 14);
  assert.equal(by('big.com').stackTotal, 14, 'stackTotal equals uniqueDetectors');
  assert.equal(by('big.com').stack.length, 8, 'at most eight in the stack');
  assert.deepEqual(by('big.com').stack.map((p) => p.name), ['reCAPTCHA', 'Bot A', 'Bot B', 'Bot C', 'Bot D', 'Bot E', 'Bot F', 'Bot G'],
    'CAPTCHA first, then anti-bot by name; fingerprinting is last and so cut');
  assert.deepEqual(by('big.com').stack[0], { name: 'reCAPTCHA', category: 'captcha' });
  assert.deepEqual(by('low.com').stack, [{ name: 'Canvas', category: 'fingerprint' }]);
  assert.deepEqual(by('none.com').stack, []);
  assert.deepEqual([by('mid.com').firstTimestamp, by('mid.com').lastTimestamp], [NOW - 5 * DAY, NOW - DAY]);
  assert.deepEqual([by('none.com').firstTimestamp, by('none.com').lastTimestamp], [NOW - 7 * DAY, NOW - 7 * DAY], 'an entry without a date adds no date');
  assert.deepEqual(Object.keys(by('mid.com')).slice(0, 5), ['hostname', 'visits', 'detections', 'uniqueDetectors', 'avgConfidence']);
  const empty = HistoryStats.compute([{ hostname: 'x.com' }], { now: NOW }).domainMetrics[0];
  assert.deepEqual([empty.firstTimestamp, empty.lastTimestamp], [null, null]);
});

test('an unknown difficulty level counts as Medium for a domain, as it does in the totals', () => {
  const context = { DetectionUtils: { getDifficultyLevel: () => 'Mystery' } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../sections/stats/history-stats.js'), 'utf8'), context);
  const s = vm.runInContext('HistoryStats', context).compute([page('a.com', [det('X')])], { now: NOW });
  assert.equal(s.difficulty.Medium, 1);
  assert.equal(s.domainMetrics[0].difficulty, 'Medium');
});

test('unconfirmed lists often-found protections that rarely have strong evidence (Turnstile 0/5/36)', () => {
  const items = [];
  for (let i = 0; i < 5; i++) items.push(page('moderate' + i + '.com', [det('Turnstile', 'captcha', 50, { detector: { id: 'detect-turnstile' }, matches: [{ type: 'cookie', name: 'cf_turnstile', confidence: 50 }] })]));
  for (let i = 0; i < 36; i++) items.push(page('weak' + i + '.com', [det('Turnstile', 'captcha', 20, { detector: { id: 'detect-turnstile' }, matches: [{ type: 'content', pattern: 'turnstile', confidence: 20 }] })]));
  for (let i = 0; i < 4; i++) items.push(page('cf' + i + '.com', [det('Cloudflare', 'antibot', 95), det('Canvas', 'fingerprint', 10)]));
  for (let i = 0; i < 2; i++) items.push(page('rare' + i + '.com', [det('Rare', 'antibot', 10)]));
  for (let i = 0; i < 3; i++) items.push(page('half' + i + '.com', [det('Half', 'antibot', 90), det('Half', 'antibot', 50)]));
  const { unconfirmed, detectorMetrics } = HistoryStats.compute(items, { now: NOW });
  const turnstile = detectorMetrics.find((row) => row.name === 'Turnstile');
  assert.deepEqual([turnstile.pages, turnstile.strong, turnstile.moderate, turnstile.weak], [41, 0, 5, 36]);
  assert.deepEqual(unconfirmed.map((row) => row.name), ['Turnstile'], 'Canvas is fingerprinting, Rare has under three pages, Cloudflare and Half are confirmed (half is not under half)');
  assert.deepEqual(unconfirmed[0], { name: 'Turnstile', id: 'detect-turnstile', category: 'captcha', pages: 41, strong: 0, moderate: 5, weak: 36,
    driver: { method: 'content', label: 'turnstile', pages: 36, avgConfidence: 20, detectorId: 'detect-turnstile' } });
});

test('unconfirmed ranks by weak detections, picks the weakest-signal driver and has none when nothing stands out', () => {
  const items = [];
  const weak = (name, n, matches) => { for (let i = 0; i < n; i++) items.push(page('h' + name + i + '.com', [det(name, 'antibot', 10, { matches })])); };
  weak('Alpha', 3, [{ type: 'url', pattern: 'alpha.js', confidence: 10 }, { type: 'url', pattern: 'a.js', confidence: 10 }]);
  weak('Beta', 6, []);
  weak('Gamma', 6, [{ type: 'cookie', name: 'g', confidence: 90 }]);
  const { unconfirmed } = HistoryStats.compute(items, { now: NOW });
  assert.deepEqual(unconfirmed.map((row) => [row.name, row.weak]), [['Beta', 6], ['Gamma', 6], ['Alpha', 3]], 'weak desc, then pages, then name');
  assert.equal(unconfirmed[0].driver, null, 'no signal at all: nothing stands out');
  assert.equal(unconfirmed[1].driver, null, 'a strong signal is not the reason it is weak');
  assert.deepEqual(unconfirmed[2].driver, { method: 'url', label: 'a.js', pages: 3, avgConfidence: 10, detectorId: '' }, 'ties on pages and matches go to the label');
  const many = [];
  for (let n = 0; n < 15; n++) for (let i = 0; i < 3; i++) many.push(page('m' + n + '-' + i + '.com', [det('Rule ' + String(n).padStart(2, '0'), 'antibot', 10)]));
  assert.equal(HistoryStats.compute(many, { now: NOW }).unconfirmed.length, 12, 'capped at twelve');
});

test('stackMetrics groups domains by the protections on their latest page, ignoring fingerprinting', () => {
  const items = [
    page('a.com', [det('Cloudflare'), det('reCAPTCHA', 'captcha'), det('Canvas', 'fingerprint', 20)], NOW),
    page('a.com', [det('DataDome')], NOW - 5 * DAY),
    page('a.com', [det('Akamai')], NOW - 6 * DAY),
    page('b.com', [det('reCAPTCHA', 'captcha'), det('cloudflare')], NOW - DAY),
    page('b.com', [det('Shape')], NOW - 9 * DAY),
    page('c.com', [det('DataDome')], NOW - 2 * DAY),
    page('d.com', [det('Canvas', 'fingerprint', 20)], NOW),
    page('e.com', [det('Shape')], NOW - 4 * DAY),
    page('e.com', [det('Akamai')], undefined, { timestamp: undefined }),
    page('f.com', [det('Akamai')], undefined, { timestamp: undefined }),
    page('f.com', [det('Kasada')], undefined, { timestamp: undefined }),
    page('g.com', [])
  ];
  const { stackMetrics } = HistoryStats.compute(items, { now: NOW });
  assert.deepEqual(stackMetrics.map((g) => [g.names.join(' + '), g.domains]), [
    ['reCAPTCHA + Cloudflare', 2], ['Akamai', 1], ['DataDome', 1], ['Shape', 1]], 'domains desc, then names; fingerprint-only and empty domains are skipped');
  assert.deepEqual(stackMetrics[0].keys, ['cloudflare', 'recaptcha'], 'keys are lower-cased and sorted');
  assert.deepEqual(stackMetrics[0].hostnames, ['a.com', 'b.com'], 'by pages, then name');
  assert.deepEqual(stackMetrics[1].hostnames, ['f.com'], 'with no dates the first entry of a domain stands (History is newest first)');
  assert.deepEqual(stackMetrics[3].hostnames, ['e.com'], 'an entry without a date counts as earlier than a dated one');
  assert.equal(stackMetrics.every((g) => g.names.length === g.keys.length), true);
});

test('stackMetrics lists at most three hostnames per stack and twenty stacks', () => {
  const items = [];
  for (let i = 0; i < 5; i++) items.push(page('same' + i + '.com', [det('Cloudflare'), det('DataDome')]));
  items.push(page('same4.com', [det('Cloudflare'), det('DataDome')], NOW - DAY), page('same3.com', [det('Cloudflare'), det('DataDome')], NOW - DAY));
  for (let i = 0; i < 25; i++) items.push(page('solo' + i + '.com', [det('Solo ' + String(i).padStart(2, '0'))]));
  const { stackMetrics } = HistoryStats.compute(items, { now: NOW });
  assert.equal(stackMetrics.length, 20);
  assert.equal(stackMetrics[0].domains, 5);
  assert.deepEqual(stackMetrics[0].hostnames, ['same3.com', 'same4.com', 'same0.com']);
  assert.equal(stackMetrics[1].names[0], 'Solo 00');
});

test('detectorSummary has the values and order of detectorMetrics', () => {
  const items = [
    page('a.com', [det('Cloudflare', 'antibot', 90, { detector: { id: 'detect-cloudflare' } }), det('Cloudflare', 'antibot', 70), det('reCAPTCHA', 'captcha', null)]),
    page('b.com', [det('cloudflare', 'antibot', 50), det('Canvas', 'fingerprint', 20)]),
    page('c.com', [{ detector: { id: 'legacy-id' }, confidence: 100 }, det('Zeta', 'other', 5), det('Alpha', 'other', 5)]),
    null, { detections: 'bad' }, page('d.com', [null, false, det('')])
  ];
  const summary = HistoryStats.detectorSummary(items);
  const metrics = HistoryStats.compute(items, { now: NOW }).detectorMetrics.map(({ name, id, category, pages, domains, avgConfidence }) => ({ name, id, category, pages, domains, avgConfidence }));
  assert.deepEqual(summary, metrics);
  assert.equal(summary[0].name, 'Cloudflare');
  assert.deepEqual(summary[0], { name: 'Cloudflare', id: 'detect-cloudflare', category: 'antibot', pages: 2, domains: 2, avgConfidence: 70 });
  assert.deepEqual(HistoryStats.detectorSummary(null), []);
});

test('detectorSeen counts pages and dates per id and per name over all of History', () => {
  const items = [
    page('a.com', [det('Cloudflare', 'antibot', 90, { detector: { id: 'detect-cloudflare' } }), det('Cloudflare', 'antibot', 90)], NOW - 3 * DAY),
    page('b.com', [det('cloudflare', 'antibot', 90, { id: 'detect-cloudflare' })], NOW - DAY),
    page('c.com', [det('Cloudflare')], undefined, { timestamp: undefined }),
    page('d.com', [{ detector: { id: 'only-id' } }]), null, 'x', { detections: 'bad' }
  ];
  const seen = HistoryStats.detectorSeen(items);
  assert.deepEqual(seen.byId.get('detect-cloudflare'), { pages: 2, firstTs: NOW - 3 * DAY, lastTs: NOW - DAY });
  assert.deepEqual(seen.byName.get('cloudflare'), { pages: 3, firstTs: NOW - 3 * DAY, lastTs: NOW - DAY }, 'names are lower-cased; an undated page counts but dates nothing');
  assert.deepEqual(seen.byId.get('only-id'), { pages: 1, firstTs: NOW, lastTs: NOW });
  assert.ok(seen.byId instanceof Map && seen.byName instanceof Map);
  assert.equal(HistoryStats.detectorSeen(undefined).byId.size, 0);
});

test('activityFacts reads the busiest day, streak, peak hour and quiet days from compute()', () => {
  const at = (daysAgo, hour) => new Date(2026, 8, 29 - daysAgo, hour, 0, 0).getTime();
  const items = [
    ...[0, 1, 2].map((d) => page('a.com', [det('X')], at(d, 9))), page('a.com', [det('X')], at(1, 9)), page('a.com', [det('X')], at(1, 14)),
    ...[5, 6].map((d) => page('b.com', [det('X')], at(d, 14))), page('b.com', [det('X')], at(6, 14)), page('b.com', [det('X')], at(9, 9))
  ];
  const stats = HistoryStats.compute(items, { now: NOW, days: 10 });
  const facts = HistoryStats.activityFacts(stats);
  assert.equal(facts.busiest.entries, 3);
  assert.equal(facts.busiest.date, HistoryStats.dayKey(at(1, 0)), 'the day with the most pages');
  assert.equal(facts.longestStreak, 3, 'today, yesterday and the day before');
  assert.deepEqual(facts.peakHour, { hour: 9, entries: 5 });
  assert.equal(facts.quietDays, 4, 'ten days, six of them with pages');
  const ties = HistoryStats.activityFacts({ timeline: [{ date: '2026-01-01', entries: 2 }, { date: '2026-01-02', entries: 2 }, { date: '2026-01-03', entries: 0 }],
    hourly: [{ hour: 5, entries: 1 }, { hour: 2, entries: 1 }, { hour: 9, entries: 0 }] });
  assert.deepEqual(ties, { busiest: { date: '2026-01-02', entries: 2 }, longestStreak: 2, peakHour: { hour: 2, entries: 1 }, quietDays: 1 }, 'ties go to the latest day and the earliest hour');
});

test('activityFacts leaves out the day still counting and handles no entries', () => {
  const timeline = [{ date: 'a', entries: 1 }, { date: 'b', entries: 0 }, { date: 'c', entries: 3 }, { date: 'd', entries: 0, partial: true }];
  assert.equal(HistoryStats.activityFacts({ timeline }).quietDays, 1, 'today is not "a day with nothing saved" until it is over');
  assert.equal(HistoryStats.activityFacts({ timeline }).longestStreak, 1);
  const none = HistoryStats.activityFacts(HistoryStats.compute([], { now: NOW, days: 7 }));
  assert.deepEqual(none, { busiest: null, longestStreak: 0, peakHour: null, quietDays: 6 });
  for (const bad of [null, undefined, {}, { timeline: 'x', hourly: 3 }, { timeline: [null, 5, {}], hourly: [null] }]) {
    assert.deepEqual(HistoryStats.activityFacts(bad), { busiest: null, longestStreak: 0, peakHour: null, quietDays: bad && Array.isArray(bad.timeline) ? 1 : 0 }, JSON.stringify(bad));
  }
  assert.equal(HistoryStats.activityFacts({ timeline }, { from: 'c' }).quietDays, 0, 'options.from ignores earlier days, e.g. those before History began');
  assert.equal(HistoryStats.activityFacts({ timeline }, { from: 'c' }).busiest.date, 'c');
});

test('no function reads the clock when it is given a reference time', () => {
  const realNow = Date.now;
  const items = [page('a.com', [det('Cloudflare')], NOW - 2 * DAY), page('a.com', [det('Cloudflare'), det('DataDome')], NOW - DAY), page('b.com', [det('X', 'captcha')], NOW)];
  Date.now = () => { throw new Error('Date.now was read'); };
  try {
    const stats = HistoryStats.compute(items, { now: NOW, days: 7 });
    HistoryStats.timelineDays(items, 0, NOW);
    HistoryStats.rangeStart(7, NOW);
    HistoryStats.filterByRange(items, 7, NOW);
    HistoryStats.previousWindow(items, 7, NOW);
    HistoryStats.firstSeen(items, HistoryStats.rangeStart(7, NOW), NOW);
    HistoryStats.protectionChanges(items, { since: null, now: NOW });
    HistoryStats.scopeItems(items, ['captcha']);
    HistoryStats.summary(items);
    HistoryStats.activityFacts(stats);
    assert.equal(stats.timeline.at(-1).partial, true);
  } finally { Date.now = realNow; }
});

test('a domain is layered by its richest saved page, not by the union of its pages', () => {
  const items = [
    page('migrated.com', [det('Kasada')], NOW - 3 * DAY), page('migrated.com', [det('Cloudflare')], NOW),
    page('stacked.com', [det('Cloudflare'), det('hCaptcha', 'captcha')], NOW), page('stacked.com', [det('Cloudflare')], NOW - DAY),
    page('single.com', [det('Akamai')], NOW)
  ];
  const { domainMetrics } = HistoryStats.compute(items, { now: NOW, days: 30 });
  const byHost = Object.fromEntries(domainMetrics.map((d) => [d.hostname, d]));
  assert.equal(byHost['migrated.com'].maxStack, 1, 'Kasada then Cloudflare: never both on one page');
  assert.equal(byHost['migrated.com'].stackTotal, 2, 'but both were seen on the domain');
  assert.equal(byHost['stacked.com'].maxStack, 2);
  assert.equal(byHost['single.com'].maxStack, 1);
});
