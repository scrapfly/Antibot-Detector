'use strict';
// Statistics comparison with the previous period: window, summary, deltas, movers, hardest domains.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const HistoryStats = require('../sections/stats/history-stats.js');

const DAY = 86400000;
const NOW = new Date(2026, 8, 29, 15, 0, 0).getTime();
const midnight = (y, m, d) => new Date(y, m, d, 0, 0, 0, 0).getTime();
const det = (name, category = 'antibot', confidence = 90) => ({ name, category, confidence });
const page = (hostname, detections, timestamp = NOW) => ({ hostname, url: 'https://' + hostname + '/', timestamp, detections });

test('previousWindow is null for All and for a range that is not a positive number of days', () => {
  for (const days of [0, -1, NaN, Infinity, -Infinity, '7', null, undefined, {}]) {
    assert.equal(HistoryStats.previousWindow([page('a.com', [])], days, NOW), null, String(days));
  }
});

test('previousWindow covers the same number of calendar days right before the range', () => {
  const curStart = midnight(2026, 8, 23); // 7 days ending today: Sep 23 .. Sep 29
  const start = midnight(2026, 8, 16);
  assert.equal(HistoryStats.rangeStart(7, NOW), curStart);
  const rows = [page('a.com', [], start - 1), page('b.com', [], start), page('c.com', [], curStart - 1), page('d.com', [], curStart), page('e.com', [], NOW), null, 'x'];
  const w = HistoryStats.previousWindow(rows, 7, NOW);
  assert.equal(w.start, start);
  assert.equal(w.end, curStart - 1);
  assert.deepEqual(w.items.map((row) => row.hostname), ['b.com', 'c.com'], 'start is inclusive, the range start is not');
  assert.equal(w.oldest, start - 1, 'oldest looks at all entries, not only the window');
  assert.equal(w.coverage, 1);
  assert.equal(w.usable, true);
});

test('previousWindow coverage says how much of the previous period History reaches back to', () => {
  const curStart = midnight(2026, 8, 23);
  const at = (day) => [page('a.com', [], midnight(2026, 8, day))];
  const cover = (day) => HistoryStats.previousWindow(at(day), 7, NOW);
  assert.equal(cover(16).coverage, 1, 'History reaches the window start');
  assert.equal(cover(10).coverage, 1, 'and further back');
  assert.ok(Math.abs(cover(17).coverage - 6 / 7) < 1e-12);
  assert.equal(cover(17).usable, true, '6 of 7 days is above the 80% bar');
  assert.ok(Math.abs(cover(18).coverage - 5 / 7) < 1e-12);
  assert.equal(cover(18).usable, false, '5 of 7 days is not');
  assert.equal(cover(22).usable, false);
  assert.equal(cover(23).coverage, 0, 'History starting at the range start has no previous period');
  assert.equal(cover(28).coverage, 0, 'and neither does History starting later');
  const none = HistoryStats.previousWindow([], 30, NOW);
  assert.deepEqual([none.oldest, none.coverage, none.usable, none.items.length], [null, 0, false, 0]);
  assert.equal(HistoryStats.previousWindow(null, 30, NOW).coverage, 0);
  assert.equal(HistoryStats.previousWindow([{ timestamp: 'bad' }], 30, NOW).oldest, null);
  assert.equal(curStart - midnight(2026, 8, 16), 7 * DAY);
});

test('previousWindow is usable from exactly 80% coverage', () => {
  // UTC has no DST, so ten days are exactly 864,000,000 ms and 80% is an exact number of days
  const script = `
    const assert = require('node:assert/strict');
    const H = require('./sections/stats/history-stats');
    const now = Date.UTC(2026, 8, 29, 15);
    const w = H.previousWindow([], 10, now);
    const curStart = w.end + 1, day = 86400000;
    const at = (daysBack) => [{ timestamp: curStart - daysBack * day }];
    assert.equal(H.previousWindow(at(8), 10, now).coverage, 0.8);
    assert.equal(H.previousWindow(at(8), 10, now).usable, true, '80% is enough');
    assert.equal(H.previousWindow(at(8) .map((r) => ({ timestamp: r.timestamp + 1 })), 10, now).usable, false, 'a millisecond short is not');
    assert.equal(H.previousWindow(at(7), 10, now).usable, false);
    assert.equal(H.previousWindow(at(9), 10, now).usable, true);
  `;
  const result = spawnSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('previousWindow counts calendar days across a DST change in any time zone', () => {
  const script = `
    const assert = require('node:assert/strict');
    const H = require('./sections/stats/history-stats');
    let checked = 0;
    for (const [month, from, to] of [[2, 1, 31], [9, 20, 31], [10, 1, 10], [3, 1, 10]]) {
      for (let day = from; day <= to; day++) {
        const now = new Date(2026, month, day, 12).getTime();
        for (const days of [1, 2, 3, 7, 30]) {
          const w = H.previousWindow([], days, now);
          const curStart = new Date(2026, month, day - days + 1).getTime();
          const start = new Date(2026, month, day - 2 * days + 1).getTime();
          assert.equal(H.rangeStart(days, now), curStart);
          assert.equal(w.start, start, month + '/' + day + ' ' + days);
          assert.equal(w.end, curStart - 1);
          assert.equal(new Date(w.start).getHours(), 0, 'the window starts at local midnight');
          const rows = [{ timestamp: start - 1 }, { timestamp: start }, { timestamp: curStart - 1 }, { timestamp: curStart }];
          assert.equal(H.previousWindow(rows, days, now).items.length, 2);
          checked++;
        }
      }
    }
    assert.ok(checked > 300);
  `;
  for (const TZ of ['America/New_York', 'Europe/Berlin', 'Australia/Lord_Howe', 'UTC']) {
    const result = spawnSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(result.status, 0, TZ + ': ' + result.stderr);
  }
});

test('summary counts pages, domains, layered sites and CAPTCHA domains in one pass', () => {
  const items = [
    page('a.com', [det('Cloudflare'), det('reCAPTCHA', 'captcha')]),
    page('a.com', [det('Cloudflare')]),
    page('b.com', [det('Canvas', 'fingerprint', 20), det('Audio', 'fingerprint', 20)]),
    page('c.com', []),
    page('d.com', [det('Cloudflare'), det('DataDome')]),
    page('e.com', [det('Cloudflare'), det('Canvas', 'fingerprint', 20)]),
    null, 'junk', [], { timestamp: NOW }
  ];
  assert.deepEqual(HistoryStats.summary(items), {
    pages: 7, pagesWithDetections: 5, domains: 5, domainsWithDetections: 4,
    layeredDomains: 2, captchaDomains: 1, protections: 5, detections: 9 });
  assert.deepEqual(HistoryStats.summary(null), { pages: 0, pagesWithDetections: 0, domains: 0, domainsWithDetections: 0, layeredDomains: 0, captchaDomains: 0, protections: 0, detections: 0 });
  const wide = HistoryStats.summary([page('a.com', [det('Cloudflare')]), page('a.com', [det('DataDome')]), { url: 'https://A.com/x', timestamp: NOW, detections: [det('Akamai')] }]);
  assert.equal(wide.layeredDomains, 0, 'a site that changed provider between saved pages is not layered');
  assert.equal(wide.domains, 1, 'hostnames are lower-cased and read from the URL');
  const together = HistoryStats.summary([page('a.com', [det('Cloudflare')]), { url: 'https://A.com/x', timestamp: NOW, detections: [det('Akamai'), det('hCaptcha', 'captcha')] }]);
  assert.equal(together.layeredDomains, 1, 'two protections together on one saved page layer the domain, whatever the other pages hold');
});

test('summary ignores fingerprinting for layering but not for the protection count', () => {
  const s = HistoryStats.summary([page('a.com', [det('Canvas', 'fingerprint'), det('Audio', 'fingerprint'), det('Cloudflare')])]);
  assert.equal(s.layeredDomains, 0);
  assert.equal(s.protections, 3);
});

test('protectionIndex maps each protection to the pages that hold it', () => {
  const index = HistoryStats.protectionIndex([
    page('a.com', [det('Cloudflare'), det('cloudflare'), det('reCAPTCHA', 'captcha')]),
    page('b.com', [det('Cloudflare')]), page('c.com', []), null, { detections: 'bad' }
  ]);
  assert.deepEqual([...index.keys()], ['cloudflare', 'recaptcha']);
  assert.deepEqual(index.get('cloudflare'), { name: 'Cloudflare', category: 'antibot', pages: 2 });
  assert.deepEqual(index.get('recaptcha'), { name: 'reCAPTCHA', category: 'captcha', pages: 1 });
  assert.equal(HistoryStats.protectionIndex(undefined).size, 0);
});

test('delta follows the contract examples and its thresholds', () => {
  assert.deepEqual(HistoryStats.delta(12, 10), { kind: 'up', diff: 2, ratio: 0.2 });
  assert.deepEqual(HistoryStats.delta(104, 100), { kind: 'flat', diff: 4, ratio: 0.04 });
  assert.deepEqual(HistoryStats.delta(0, 5), { kind: 'down', diff: -5, ratio: null });
  assert.deepEqual(HistoryStats.delta(5, 0), { kind: 'new', diff: 5, ratio: null });
  assert.equal(HistoryStats.delta(0, 0), null);
  assert.deepEqual(HistoryStats.delta(217, 157), { kind: 'up', diff: 60, ratio: 60 / 157 });
  // a previous value under 10 is too small for a percentage
  assert.deepEqual(HistoryStats.delta(9, 9), { kind: 'flat', diff: 0, ratio: null });
  assert.deepEqual(HistoryStats.delta(4, 3), { kind: 'up', diff: 1, ratio: null });
  assert.deepEqual(HistoryStats.delta(2, 9), { kind: 'down', diff: -7, ratio: null });
  // from 10 on it is a ratio; under 5% is flat, 5% is not
  assert.deepEqual(HistoryStats.delta(10, 10), { kind: 'flat', diff: 0, ratio: 0 });
  assert.equal(HistoryStats.delta(10, 10).ratio, 0);
  assert.equal(HistoryStats.delta(104, 100).kind, 'flat');
  assert.equal(HistoryStats.delta(105, 100).kind, 'up');
  assert.equal(HistoryStats.delta(95, 100).kind, 'down');
  assert.equal(HistoryStats.delta(96, 100).kind, 'flat');
  assert.equal(HistoryStats.delta(0, 12).kind, 'down');
  assert.equal(HistoryStats.delta(0, 12).ratio, -1);
  for (const bad of [[NaN, 1], [1, NaN], [Infinity, 1], ['1', 1], [null, 1], [1, undefined], [-3, 0]]) assert.equal(HistoryStats.delta(...bad), null, String(bad));
});

const index = (rows) => new Map(rows.map(([name, pages, category = 'antibot']) => [name.toLowerCase(), { name, category, pages }]));

test('movers separates rising, falling and vanished protections', () => {
  const cur = index([['Cloudflare', 20], ['DataDome', 8], ['Turnstile', 5, 'captcha'], ['Akamai', 2], ['Shape', 9], ['Tiny', 3]]);
  const prev = index([['Cloudflare', 10], ['DataDome', 7], ['Akamai', 5], ['Shape', 15], ['Gone', 4], ['Small', 2], ['Tiny', 1]]);
  const m = HistoryStats.movers(cur, prev);
  assert.deepEqual(m.rising.map((r) => [r.name, r.now, r.before, r.diff]), [['Cloudflare', 20, 10, 10], ['Turnstile', 5, 0, 5]]);
  assert.deepEqual(m.falling.map((r) => [r.name, r.diff]), [['Shape', -6], ['Akamai', -3]]);
  assert.deepEqual(m.gone.map((r) => [r.name, r.before]), [['Gone', 4]], 'a protection that was under three pages is not "gone"');
  assert.equal(m.rising[1].category, 'captcha');
  assert.ok(!m.rising.some((r) => r.name === 'DataDome'), 'a change of one page is under the minimum');
  assert.ok(!m.rising.some((r) => r.name === 'Tiny'), 'a change of two pages is under the minimum');
});

test('movers needs the change to be big against the previous pages, honours exclude and limit', () => {
  const cur = index([['Big', 110], ['Grow', 130], ['New A', 4], ['New B', 6], ['New C', 9]]);
  const prev = index([['Big', 100], ['Grow', 100], ['Old A', 5], ['Old B', 8], ['Old C', 3]]);
  const m = HistoryStats.movers(cur, prev);
  assert.deepEqual(m.rising.map((r) => r.name), ['Grow', 'New C', 'New B', 'New A'], '+10 on 100 is under 25%; sorted by change then name');
  assert.deepEqual(m.gone.map((r) => r.name), ['Old B', 'Old A', 'Old C']);
  assert.equal(HistoryStats.movers(cur, prev, { limit: 10 }).rising.length, 4, 'Big (+10 on 100) never qualifies; the other four do');
  assert.deepEqual(HistoryStats.movers(cur, prev, { limit: 2 }).rising.map((r) => r.name), ['Grow', 'New C']);
  assert.deepEqual(HistoryStats.movers(cur, prev, { exclude: new Set(['new c', 'grow']) }).rising.map((r) => r.name), ['New B', 'New A'],
    'names first seen in the range are new, not rising');
  assert.deepEqual(HistoryStats.movers(cur, prev, { exclude: ['new c'] }).rising.map((r) => r.name), ['Grow', 'New B', 'New A']);
  assert.deepEqual(HistoryStats.movers(cur, prev, { min: 1, ratio: 0.05, limit: 10 }).rising.map((r) => r.name), ['Grow', 'Big', 'New C', 'New B', 'New A']);
  assert.deepEqual(HistoryStats.movers(null, undefined), { rising: [], falling: [], gone: [] });
  assert.deepEqual(HistoryStats.movers(index([['A', 3]]), index([['A', 3]])), { rising: [], falling: [], gone: [] });
});

test('hardestDomains puts the hardest first and keeps the same row objects', () => {
  const rows = [
    { hostname: 'b.com', difficulty: 'High', uniqueDetectors: 2, visits: 5 },
    { hostname: 'a.com', difficulty: 'High', uniqueDetectors: 2, visits: 5 },
    { hostname: 'c.com', difficulty: 'High', uniqueDetectors: 3, visits: 1 },
    { hostname: 'd.com', difficulty: 'Medium', uniqueDetectors: 9, visits: 9 },
    { hostname: 'e.com', difficulty: 'None', uniqueDetectors: 0, visits: 50 },
    { hostname: 'f.com', difficulty: 'Low', uniqueDetectors: 1, visits: 1 },
    { hostname: 'g.com', difficulty: 'Medium', uniqueDetectors: 9, visits: 10 },
    { hostname: 'h.com', difficulty: 'Unknown', uniqueDetectors: 4, visits: 1 },
    null, 'junk'
  ];
  const list = HistoryStats.hardestDomains(rows, 100);
  assert.deepEqual(list.map((r) => r.hostname), ['c.com', 'a.com', 'b.com', 'g.com', 'd.com', 'f.com', 'h.com'],
    'difficulty, then protections, then pages, then name; an unknown level ranks below Low');
  assert.ok(!list.some((r) => r.hostname === 'e.com'), 'a domain without protections is not hard');
  assert.equal(list[0], rows[2], 'the very same row objects');
  assert.deepEqual(HistoryStats.hardestDomains(rows, 2).map((r) => r.hostname), ['c.com', 'a.com']);
  assert.deepEqual(HistoryStats.hardestDomains(rows, 0), []);
  assert.deepEqual(HistoryStats.hardestDomains(null, 5), []);
  assert.equal(rows.length, 10, 'the input is not reordered');
  assert.equal(rows[0].hostname, 'b.com');
});

test('a protection that went by two names is one row of the previous period: HUMAN (PerimeterX) is not "new" when it was there before', () => {
  const human = det('HUMAN (PerimeterX)');
  const previous = Array.from({ length: 5 }, (_, i) => page(`p${i}.com`, [human], NOW - 40 * DAY));
  const current = Array.from({ length: 5 }, (_, i) => page(`c${i}.com`, [human], NOW - DAY));
  const prevIndex = HistoryStats.protectionIndex(previous), curIndex = HistoryStats.protectionIndex(current);
  assert.equal(HistoryStats.previousPages(prevIndex, 'HUMAN (PerimeterX)'), 5, 'looked up by the protection\'s key, not its lower-cased name');
  assert.equal(HistoryStats.previousPages(prevIndex, 'PerimeterX'), 5, 'under either name');
  assert.equal(HistoryStats.previousPages(prevIndex, 'Cloudflare'), 0);
  assert.equal(HistoryStats.previousPages(null, 'x'), 0);
  assert.equal(HistoryStats.delta(curIndex.get('perimeterx').pages, HistoryStats.previousPages(prevIndex, 'HUMAN (PerimeterX)')).kind, 'flat', '5 pages against 5');
});

test('the Statistics tabs look the previous period up through that helper, not by a lower-cased name', () => {
  const fs = require('node:fs');
  for (const file of ['stats-protections.js', 'stats-overview.js', 'stats.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'sections/stats', file), 'utf8');
    assert.ok(!/prevIndex\.get\([^)]*toLowerCase/.test(code), `${file}: no lower-cased lookup in the index`);
    assert.ok(!/exclude: new Set\([^)]*toLowerCase/.test(code), `${file}: the first-seen set uses the same key`);
  }
});

test('a domain row keeps every protection for the search and the filter, though its stack shows eight; exports do not carry the list', () => {
  const names = ['Cloudflare', 'reCAPTCHA', ...Array.from({ length: 10 }, (_, i) => `Fingerprint ${i}`)];
  const rows = Array.from({ length: 3 }, (_, i) => page(`d${i}.com`, names.map((name, n) => det(name, n < 2 ? 'antibot' : 'fingerprint'))));
  const stats = HistoryStats.compute(rows, { now: NOW });
  const row = stats.domainMetrics[0];
  assert.equal(row.stack.length, 8, 'the display is capped');
  assert.equal(row.stackTotal, 12);
  const all = HistoryStats.domainProtectionNames(row);
  assert.equal(all.length, 12, 'every protection is searchable');
  assert.ok(all.includes('Fingerprint 9'), 'also one past the eighth');
  assert.ok(!row.stack.some(item => item.name === 'Fingerprint 9'), 'which the stack does not show');
  assert.ok(!('allNames' in JSON.parse(JSON.stringify(row))), 'JSON.stringify leaves the list out');
  assert.deepEqual(Object.keys(row).includes('allNames'), false, 'not enumerable');
  assert.deepEqual(HistoryStats.domainProtectionNames({ stack: [{ name: 'A' }] }), ['A'], 'a row without the list falls back to its stack');
  assert.deepEqual(HistoryStats.domainProtectionNames(null), []);
});

