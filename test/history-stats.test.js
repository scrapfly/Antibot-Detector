const { test } = require('node:test');
const assert = require('node:assert');

const HistoryStats = require('../sections/stats/history-stats.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 29, 15, 0, 0).getTime();
const det = (name, category, confidence = 90) => ({ name, category, confidence });

const items = [
  { url: 'https://a.com/x', hostname: 'a.com', timestamp: NOW, detections: [det('Cloudflare', 'Anti-Bot'), det('reCAPTCHA', 'CAPTCHA')] },
  { url: 'https://a.com/y', hostname: 'a.com', timestamp: NOW - DAY, detections: [det('Cloudflare', 'Anti-Bot'), det('Cloudflare', 'Anti-Bot')] },
  { url: 'https://b.com/', hostname: 'b.com', timestamp: NOW - 2 * DAY, detections: [det('FingerprintJS', 'Fingerprint')] },
  { url: 'https://c.com/', timestamp: new Date(NOW - 40 * DAY).toISOString(), detections: [] }
];

test('totals count entries, unique domains and detections', () => {
  const { totals } = HistoryStats.compute(items, { now: NOW });
  assert.strictEqual(totals.entries, 4);
  assert.strictEqual(totals.uniqueDomains, 3); // c.com comes from the URL
  assert.strictEqual(totals.detections, 5);
  assert.strictEqual(totals.uniqueDetectors, 3);
  assert.strictEqual(totals.entriesWithDetections, 3);
});

test('top detectors count pages, not repeated matches on one page', () => {
  const { topDetectors } = HistoryStats.compute(items, { now: NOW });
  assert.deepStrictEqual(topDetectors[0], { name: 'Cloudflare', category: 'antibot', pages: 2, domains: 1 });
  assert.strictEqual(topDetectors.length, 3);
});

test('category and difficulty distributions', () => {
  const { categories, difficulty } = HistoryStats.compute(items, { now: NOW });
  assert.deepStrictEqual(categories, { antibot: 3, captcha: 1, fingerprint: 1, other: 0 });
  assert.strictEqual(difficulty.None, 1);
  assert.strictEqual(difficulty.High + difficulty.Medium + difficulty.Low, 3);
});

test('timeline has one bucket per day ending today; older entries fall outside', () => {
  const { timeline } = HistoryStats.compute(items, { now: NOW, days: 30 });
  assert.strictEqual(timeline.length, 30);
  assert.deepStrictEqual(timeline.slice(-3).map((d) => d.entries), [1, 1, 1]);
  assert.strictEqual(timeline.reduce((sum, d) => sum + d.entries, 0), 3);
});

test('parseStoredHistory handles the stored JSON string and bad input', () => {
  assert.strictEqual(HistoryStats.parseStoredHistory(JSON.stringify({ items })).length, 4);
  assert.deepStrictEqual(HistoryStats.parseStoredHistory('{bad'), []);
  assert.deepStrictEqual(HistoryStats.parseStoredHistory(null), []);
  assert.deepStrictEqual(HistoryStats.parseStoredHistory([null, [], false, {}, 1]), [{}]);
});

test('empty sparse malformed inputs yield complete distributions', () => {
  for (const rows of [null, {}, [], [null, false, [], 3], new Array(3)]) {
    const s = HistoryStats.compute(rows, { now: NOW });
    assert.strictEqual(s.totals.entries, 0);
    assert.strictEqual(s.hourly.length, 24);
    assert.deepStrictEqual(s.weekdays.map((b) => b.weekday), [0, 1, 2, 3, 4, 5, 6]);
    assert.ok(s.timeline.every((b) => b.avgConfidence === null && b.uniqueDomains === 0));
    assert.ok(s.categoryConfidence.every((b) => b.avgConfidence === null));
  }
});

test('timestamps reject malformed values and overflow but accept legacy strings', () => {
  for (const timestamp of [null, undefined, '', ' ', true, false, {}, [], NaN, Infinity, 1e20, 'bad']) {
    assert.strictEqual(HistoryStats.getTimestamp({ timestamp }), null);
  }
  assert.strictEqual(HistoryStats.getTimestamp({ timestamp: String(NOW) }), NOW);
  assert.strictEqual(HistoryStats.getTimestamp({ timestamp: new Date(NOW).toISOString() }), NOW);
  assert.strictEqual(HistoryStats.getTimestamp({ timestamp: 0 }), 0);
});

test('ranges include local midnight and now, exclude future and unknown dates', () => {
  const midnight = new Date(NOW);
  midnight.setHours(0, 0, 0, 0);
  const rows = [midnight.getTime() - 1, midnight.getTime(), NOW, NOW + 1, 'bad'].map((timestamp) => ({ timestamp }));
  assert.deepStrictEqual(HistoryStats.filterByRange(rows, 1, NOW), rows.slice(1, 3));
  assert.deepStrictEqual(HistoryStats.filterByRange([...rows, null, []], 0, NOW), rows);
  assert.notStrictEqual(HistoryStats.filterByRange(rows, 0, NOW), rows);
  assert.strictEqual(HistoryStats.filterByRange(rows, 0.5, NOW).length, 2);
  assert.deepStrictEqual(HistoryStats.filterByRange(null, 7, NOW), []);
  assert.deepStrictEqual(HistoryStats.filterByRange(rows, Number.MAX_VALUE, NOW), rows.slice(0, 3));
  for (const days of [NaN, Infinity, -1, '7', null]) {
    assert.deepStrictEqual(HistoryStats.filterByRange(rows, days, NOW), rows.slice(0, 3));
  }
});

test('timelineDays derives bounded all-time local-calendar spans', () => {
  assert.strictEqual(HistoryStats.timelineDays([], 0, NOW), 1);
  assert.strictEqual(HistoryStats.timelineDays(items, 0, NOW), 41);
  assert.strictEqual(HistoryStats.timelineDays(items, 0, NOW, 10), 10);
  assert.strictEqual(HistoryStats.timelineDays(items, 1000, NOW), 365);
  assert.strictEqual(HistoryStats.timelineDays(items, Infinity, NOW), 30);
  assert.strictEqual(HistoryStats.timelineDays([{ timestamp: NOW + DAY }, { timestamp: 1e20 }], 0, NOW), 1);
  const ancient = new Date(0);
  ancient.setFullYear(25, 0, 2);
  const previous = new Date(ancient);
  previous.setDate(previous.getDate() - 1);
  assert.strictEqual(HistoryStats.timelineDays([{ timestamp: previous.getTime() }], 0, ancient.getTime()), 2);
});

test('confidence rejects coercion and out-of-range scores and counts unknowns', () => {
  const valid = [0, 19, 19.5, 20, 39, 40, 59, 60, 79, 80, 100];
  const invalid = [null, undefined, '', '90', false, true, NaN, Infinity, -1, 101, {}, []];
  const detections = [...valid, ...invalid].map((confidence) => ({ name: 'X', confidence }));
  const s = HistoryStats.compute([{ timestamp: NOW, hostname: 'a.com', detections }], { now: NOW });
  assert.strictEqual(s.totals.validConfidenceCount, valid.length);
  assert.strictEqual(s.totals.unknownConfidenceCount, invalid.length);
  assert.deepStrictEqual(s.confidenceBuckets.map((b) => b.count), [3, 2, 2, 2, 2]);
  assert.strictEqual(s.totals.avgConfidence, Math.round(valid.reduce((a, b) => a + b) / valid.length));
  assert.strictEqual(s.detectorMetrics[0].avgConfidence, s.totals.avgConfidence);
  assert.strictEqual(s.domainMetrics[0].avgConfidence, s.totals.avgConfidence);
  assert.strictEqual(s.categoryConfidence[3].withConfidence, valid.length);
  for (const score of invalid) assert.strictEqual(HistoryStats.confidenceOf({ confidence: score }), null);
});

test('nested variants and duplicate matches count detections but deduplicate page metrics', () => {
  const ds = [{ detector: { name: 'Nested', category: 'CAPTCHA' }, confidence: 100 },
    { name: 'nested', category: 'captcha', confidence: 0 }, { detector: 'Bot', type: 'WAF' },
    { detector: { id: 'Legacy', type: 'Fingerprint' }, confidence: 80 }];
  const rows = [{ timestamp: NOW, hostname: ' A.COM ', detections: ds },
    { timestamp: NOW - DAY, url: 'https://a.com/path', detections: [ds[0]] },
    { hostname: 'b.com', detections: [null, false, [], 'bad'] }];
  const s = HistoryStats.compute(rows, { now: NOW, top: 1 });
  assert.strictEqual(s.totals.entries, 3);
  assert.strictEqual(s.totals.detections, 5);
  assert.strictEqual(s.totals.activeDays, 2);
  assert.strictEqual(s.totals.detectionRate, 2 / 3 * 100);
  assert.strictEqual(s.topDetectors.length, 1);
  assert.strictEqual(s.detectorMetrics.length, 3);
  assert.deepStrictEqual(s.detectorMetrics[0], { name: 'Nested', category: 'captcha', pages: 2, domains: 1, avgConfidence: 67 });
  assert.deepStrictEqual(s.domainMetrics[0], { hostname: 'a.com', visits: 2, detections: 5, uniqueDetectors: 3, avgConfidence: 70 });
  assert.strictEqual(s.categoryOverlap.captcha.antibot, 1);
  assert.strictEqual(s.categoryOverlap.antibot.captcha, 1);
  assert.strictEqual(s.categoryOverlap.captcha.captcha, 2);
  assert.strictEqual(s.timeline.at(-1).uniqueDomains, 1);
  assert.strictEqual(s.timeline.at(-1).avgConfidence, 60);
  assert.strictEqual(s.hourly[15].entries, 2);
  assert.strictEqual(s.hourly[15].detections, 5);
  assert.strictEqual(s.difficulty.High, 2);
});

test('unknown new averages remain null, and zero is known', () => {
  const s = HistoryStats.compute([{ timestamp: NOW, hostname: 'a.com', detections: [{ name: 'X', confidence: null }] }], { now: NOW });
  assert.strictEqual(s.timeline.at(-1).avgConfidence, null);
  assert.strictEqual(s.detectorMetrics[0].avgConfidence, null);
  assert.strictEqual(s.domainMetrics[0].avgConfidence, null);
  assert.strictEqual(s.totals.avgConfidence, 0);
  assert.strictEqual(HistoryStats.confidenceOf({ confidence: 0 }), 0);
});

test('compute totals are not implicitly filtered but timeline excludes future records', () => {
  const s = HistoryStats.compute([{ timestamp: NOW }, { timestamp: NOW + 1 }, { timestamp: 'bad' }], { now: NOW, days: 1 });
  assert.strictEqual(s.totals.entries, 3);
  assert.strictEqual(s.timeline[0].entries, 1);
  assert.strictEqual(s.totals.lastTimestamp, NOW + 1);
});

test('aggregation preserves frozen inputs and legacy top-list exact shapes', () => {
  const rows = Object.freeze(items.map((item) => Object.freeze({ ...item, detections: Object.freeze(item.detections.map((d) => Object.freeze({ ...d }))) })));
  const before = JSON.stringify(rows);
  const s = HistoryStats.compute(rows, Object.freeze({ now: NOW }));
  HistoryStats.filterByRange(rows, 7, NOW);
  HistoryStats.timelineDays(rows, 0, NOW);
  assert.strictEqual(JSON.stringify(rows), before);
  assert.deepStrictEqual(Object.keys(s.topDomains[0]), ['hostname', 'visits', 'detections']);
  assert.deepStrictEqual(Object.keys(s.topDetectors[0]), ['name', 'category', 'pages', 'domains']);
});

test('ties sort alphabetically', () => {
  const rows = ['z.com', 'a.com'].map((hostname, i) => ({ hostname, detections: [{ name: i ? 'Alpha' : 'Zulu' }] }));
  const s = HistoryStats.compute(rows, { now: NOW });
  assert.deepStrictEqual(s.topDomains.map((d) => d.hostname), ['a.com', 'z.com']);
  assert.deepStrictEqual(s.topDetectors.map((d) => d.name), ['Alpha', 'Zulu']);
});

test('local calendars survive DST spring/fall transitions in separate timezones', () => {
  const { spawnSync } = require('node:child_process');
  const script = `
    const assert = require('node:assert/strict');
    const H = require('./sections/stats/history-stats');
    for (const [month, day] of [[2, 9], [10, 2], [2, 30], [9, 26]]) {
      const now = new Date(2026, month, day, 12).getTime();
      const start = new Date(2026, month, day - 2, 0).getTime();
      const rows = [{timestamp:start-1},{timestamp:start},{timestamp:now},{timestamp:now+1}];
      assert.deepEqual(H.filterByRange(rows,3,now),rows.slice(1,3));
      assert.equal(H.timelineDays(rows.slice(1,3),0,now),3);
      const s = H.compute(rows,{days:3,now});
      assert.equal(new Set(s.timeline.map(b=>b.date)).size,3);
      assert.deepEqual(s.timeline.map(b=>b.entries),[1,0,1]);
      assert.equal(s.timeline[0].date,H.dayKey(start));
    }
  `;
  for (const TZ of ['America/New_York', 'Europe/Berlin', 'UTC']) {
    const result = spawnSync(process.execPath, ['-e', script], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.strictEqual(result.status, 0, TZ + ': ' + result.stderr);
  }
});
