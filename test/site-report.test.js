'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SiteReport = require('../modules/core/site-report.js');

// Statistics → Site: one site over time, from History. The pure module.

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 1, 12);
const det = (name, category, confidence = 90, extra = {}) => ({ name, category, confidence, matches: [{ type: 'cookie', name: 'cf_clearance', value: 'SECRET-COOKIE' }, { type: 'header', name: 'x-dd', value: 'SECRET-HEADER' }], ...extra });
let next = 0;
const entry = (url, day, detections = [], extra = {}) => ({ id: 'e' + (++next), url, hostname: new URL(url).hostname, timestamp: T0 + day * DAY, detections, ...extra });

test('siteOf: www and the bare host are one site, in lower case, without a trailing dot; www.com stays a host', () => {
  assert.equal(SiteReport.siteOf('www.Shop.Example'), 'shop.example');
  assert.equal(SiteReport.siteOf('https://WWW.shop.example./cart?x=1#y'), 'shop.example');
  assert.equal(SiteReport.siteOf('shop.example'), 'shop.example');
  assert.equal(SiteReport.siteOf('api.shop.example'), 'api.shop.example', 'another subdomain is another site');
  assert.equal(SiteReport.siteOf('www.com'), 'www.com');
  assert.equal(SiteReport.siteOf(''), '');
  assert.equal(SiteReport.siteOf(null), '');
  assert.equal(SiteReport.siteOf('   '), '');
});

test('entriesOf: the site\'s entries under both spellings, newest first, undated last, nothing else', () => {
  const items = [
    entry('https://shop.example/a', 1),
    entry('https://www.shop.example/b', 3),
    entry('https://other.example/', 5),
    { id: 'nodate', url: 'https://shop.example/c', hostname: 'shop.example', detections: [] },
    entry('https://api.shop.example/', 4),
    null, 'junk', [],
    { id: 'byurl', url: 'https://WWW.SHOP.EXAMPLE/d', timestamp: T0 + 2 * DAY }
  ];
  const ids = SiteReport.entriesOf(items, 'www.shop.example').map(item => item.id);
  assert.equal(ids.length, 4);
  assert.equal(ids[0], items[1].id, 'newest first');
  assert.equal(ids[1], 'byurl', 'an entry with no host name is placed by its address');
  assert.equal(ids[3], 'nodate', 'an entry without a date comes last');
  assert.deepEqual(SiteReport.entriesOf(items, ''), []);
  assert.deepEqual(SiteReport.entriesOf(null, 'shop.example'), []);
});

test('build: an empty History, or a site it does not hold, is an empty report', () => {
  for (const items of [[], null, undefined, [entry('https://other.example/', 1, [det('Cloudflare', 'Anti-Bot')])]]) {
    const r = SiteReport.build(items, 'shop.example');
    assert.equal(r.site, 'shop.example');
    assert.equal(r.scans, 0);
    assert.equal(r.pages, 0);
    assert.equal(r.first, null);
    assert.equal(r.last, null);
    assert.deepEqual(r.hosts, []);
    assert.deepEqual(r.protections, []);
    assert.deepEqual(r.statuses, []);
    assert.equal(r.unknownStatus, 0);
    assert.deepEqual(r.changes, []);
    assert.deepEqual({ ...r.timeline, scans: r.timeline.scans.length, rows: r.timeline.rows.length }, { total: 0, shown: 0, capped: false, limit: 30, scans: 0, rows: 0 });
  }
});

test('build: hosts merged, pages without query or fragment, first and last seen, pages, scans and the confidence range', () => {
  const items = [
    entry('https://shop.example/', 0, [det('Cloudflare', 'Anti-Bot', 70)]),
    entry('https://www.shop.example/?utm=1', 2, [det('Cloudflare', 'Anti-Bot', 95), det('Turnstile', 'CAPTCHA', 80)]),
    entry('https://shop.example/login#top', 5, [det('cloudflare', 'Anti-Bot', 85), det('Canvas Fingerprint', 'Fingerprint', 30)]),
    entry('https://other.example/', 6, [det('Kasada', 'Anti-Bot')])
  ];
  const r = SiteReport.build(items, 'https://www.shop.example/');
  assert.equal(r.site, 'shop.example');
  assert.deepEqual(r.hosts, ['shop.example', 'www.shop.example'], 'the site first, then the other spellings');
  assert.equal(r.scans, 3);
  assert.equal(r.pages, 2, '/ (with and without www, with a query) and /login');
  assert.equal(r.first, T0);
  assert.equal(r.last, T0 + 5 * DAY);
  assert.deepEqual(r.protections.map(p => p.name), ['cloudflare', 'Turnstile', 'Canvas Fingerprint'], 'anti-bot, CAPTCHA, fingerprint; a name in its latest spelling');
  const cf = r.protections[0];
  assert.equal(cf.category, 'antibot');
  assert.equal(cf.firstSeen, T0);
  assert.equal(cf.lastSeen, T0 + 5 * DAY);
  assert.equal(cf.scans, 3);
  assert.equal(cf.pages, 2);
  assert.deepEqual(cf.confidence, { min: 70, max: 95 });
  const ts = r.protections[1];
  assert.deepEqual([ts.firstSeen, ts.lastSeen, ts.scans, ts.pages], [T0 + 2 * DAY, T0 + 2 * DAY, 1, 1]);
  assert.deepEqual(ts.confidence, { min: 80, max: 80 });
});

test('build: a protection listed twice on one scan counts once, with its best score; junk scores are no score', () => {
  const items = [
    entry('https://shop.example/', 0, [det('DataDome', 'Anti-Bot', 40), det('DataDome', 'Anti-Bot', 90), det('Akamai', 'Anti-Bot', '80'), det('', 'Anti-Bot'), { junk: true }, null]),
    entry('https://shop.example/', 1, [det('Akamai', 'Anti-Bot', 150)])
  ];
  const r = SiteReport.build(items, 'shop.example');
  const dd = r.protections.find(p => p.name === 'DataDome');
  assert.equal(dd.scans, 1);
  assert.deepEqual(dd.confidence, { min: 90, max: 90 });
  const ak = r.protections.find(p => p.name === 'Akamai');
  assert.equal(ak.scans, 2);
  assert.deepEqual(ak.confidence, { min: null, max: null }, 'a string score and a score above 100 are not scores');
  assert.equal(SiteReport.confidenceText(ak.confidence), '');
  assert.equal(SiteReport.confidenceText(dd.confidence), '90%');
  assert.equal(SiteReport.confidenceText({ min: 70, max: 95 }), '70–95%');
  assert.equal(r.protections.length, 2);
});

test('build: entries without a date count as scans but give no first or last seen and stay off the timeline', () => {
  const items = [
    { id: 'u', url: 'https://shop.example/', hostname: 'shop.example', timestamp: 0, detections: [det('Kasada', 'Anti-Bot')] },
    entry('https://shop.example/', 3, [det('Cloudflare', 'Anti-Bot')])
  ];
  const r = SiteReport.build(items, 'shop.example');
  assert.equal(r.scans, 2);
  assert.equal(r.first, T0 + 3 * DAY);
  const kasada = r.protections.find(p => p.name === 'Kasada');
  assert.equal(kasada.firstSeen, null);
  assert.equal(kasada.lastSeen, null);
  assert.equal(r.timeline.total, 1);
  assert.deepEqual(r.timeline.rows.map(row => row.name), ['Cloudflare'], 'a protection seen only on an undated scan has no column to sit in');
});

test('build: the timeline holds the latest scans, oldest first, and says when it is capped', () => {
  const items = Array.from({ length: 45 }, (_, i) => entry(`https://shop.example/p${i}`, i, i % 2 ? [det('Cloudflare', 'Anti-Bot', 50 + i)] : [det('DataDome', 'Anti-Bot', 60)]));
  items.push(entry('https://shop.example/old', -10, [det('PerimeterX', 'Anti-Bot')]));
  const r = SiteReport.build(items, 'shop.example');
  assert.equal(r.timeline.total, 46);
  assert.equal(r.timeline.shown, 30);
  assert.equal(r.timeline.capped, true);
  assert.equal(r.timeline.scans[0].timestamp, T0 + 15 * DAY, 'the oldest of the latest 30');
  assert.equal(r.timeline.scans.at(-1).timestamp, T0 + 44 * DAY, 'the newest last');
  assert.equal(r.timeline.scans.at(-1).path, '/p44');
  assert.deepEqual(r.timeline.rows.map(row => row.name).sort(), ['Cloudflare', 'DataDome'], 'PerimeterX is only on a scan outside the timeline');
  const cf = r.timeline.rows.find(row => row.name === 'Cloudflare');
  assert.equal(cf.cells.length, 30);
  assert.deepEqual(cf.cells.at(-1), { found: false, confidence: null }, 'p44 found DataDome');
  assert.deepEqual(cf.cells.at(-2), { found: true, confidence: 93 });
  assert.ok(r.protections.some(p => p.name === 'PerimeterX'), 'the table still has every protection');

  const small = SiteReport.build(items, 'shop.example', { limit: 5 });
  assert.equal(small.timeline.shown, 5);
  assert.equal(small.timeline.limit, 5);
  const all = SiteReport.build(items.slice(0, 10), 'shop.example');
  assert.equal(all.timeline.capped, false);
  assert.equal(all.timeline.shown, 10);
  assert.equal(SiteReport.build(items, 'shop.example', { limit: -3 }).timeline.limit, SiteReport.TIMELINE_LIMIT, 'a bad limit is the default');
});

test('build: HTTP statuses with their scans and last date; entries without one are counted apart', () => {
  const items = [
    entry('https://shop.example/', 0, [], { httpStatus: 200 }),
    entry('https://shop.example/', 1, [], { httpStatus: 403 }),
    entry('https://www.shop.example/', 2, [], { httpStatus: 403 }),
    entry('https://shop.example/', 3, [], { httpStatus: 304 }),
    entry('https://shop.example/', 4, [], { httpStatus: '500' }),
    entry('https://shop.example/', 5, [])
  ];
  const r = SiteReport.build(items, 'shop.example');
  assert.deepEqual(r.statuses, [{ code: 200, scans: 1, last: T0 }, { code: 403, scans: 2, last: T0 + 2 * DAY }]);
  assert.equal(r.unknownStatus, 3, 'a 304, a text status and none at all say nothing about the page');
  assert.deepEqual(r.timeline.scans.map(s => s.httpStatus), [200, 403, 403, null, null, null]);
});

test('build: the pages History marked Changed, newest first, with their path and names', () => {
  const items = [
    entry('https://shop.example/cart?id=9', 1, [det('Turnstile', 'CAPTCHA')], { changed: { added: ['Turnstile'], removed: ['hCaptcha'], at: 1 } }),
    entry('https://www.shop.example/login', 4, [], { changed: { added: [], removed: 'Kasada' } }),
    entry('https://shop.example/', 2, [], { changed: { added: [], removed: [] } }),
    entry('https://shop.example/', 3, [], { changed: 'yes' })
  ];
  const r = SiteReport.build(items, 'shop.example');
  assert.deepEqual(r.changes.map(c => [c.host, c.path, c.added, c.removed]), [
    ['www.shop.example', '/login', [], ['Kasada']],
    ['shop.example', '/cart', ['Turnstile'], ['hCaptcha']]
  ], 'no query in the path; an empty record and junk are no change');
  assert.equal(r.changes[0].timestamp, T0 + 4 * DAY);
});

test('toJSON: names, counts, dates, paths and statuses, never a cookie or header value, a query or a note', () => {
  const items = [
    entry('https://shop.example/cart?token=SECRET-QUERY', 0, [det('Cloudflare', 'Anti-Bot', 70)], { httpStatus: 403, note: 'SECRET-NOTE', title: 'SECRET-TITLE' }),
    entry('https://www.shop.example/cart', 1, [det('Cloudflare', 'Anti-Bot', 95)], { changed: { added: ['Cloudflare'], removed: [] } })
  ];
  const text = SiteReport.toJSON(SiteReport.build(items, 'shop.example'), { now: T0 });
  for (const secret of ['SECRET', 'cf_clearance', 'x-dd', 'token=', 'e1', 'e2']) assert.ok(!text.includes(secret), secret);
  const data = JSON.parse(text);
  assert.equal(data.kind, 'site-report');
  assert.equal(data.site, 'shop.example');
  assert.deepEqual(data.hosts, ['shop.example', 'www.shop.example']);
  assert.equal(data.scans, 2);
  assert.equal(data.firstScan, new Date(T0).toISOString());
  assert.deepEqual(data.protections[0], { name: 'Cloudflare', category: 'antibot', firstSeen: new Date(T0).toISOString(), lastSeen: new Date(T0 + DAY).toISOString(), pages: 1, scans: 2, confidence: { min: 70, max: 95 } });
  assert.deepEqual(data.timeline.scans.map(s => s.path), ['/cart', '/cart']);
  assert.deepEqual(data.timeline.protections[0].confidence, [70, 95]);
  assert.deepEqual(data.httpStatuses, [{ code: 403, scans: 1, lastSeen: new Date(T0).toISOString() }]);
  assert.equal(data.scansWithoutStatus, 1);
  assert.deepEqual(data.changes, [{ timestamp: new Date(T0 + DAY).toISOString(), host: 'www.shop.example', path: '/cart', added: ['Cloudflare'], removed: [] }]);
});

test('toJSON: a protection missing from a scan is false, found without a score is null', () => {
  const items = [entry('https://shop.example/', 0, [det('Kasada', 'Anti-Bot', null)]), entry('https://shop.example/', 1, [])];
  const data = JSON.parse(SiteReport.toJSON(SiteReport.build(items, 'shop.example')));
  assert.deepEqual(data.timeline.protections[0].confidence, [null, false]);
  assert.equal(JSON.parse(SiteReport.toJSON(SiteReport.build([], 'shop.example'))).scans, 0, 'an empty report exports too');
});

test('toMarkdown: the sections, translated, with names escaped and no values', () => {
  const items = [
    entry('https://shop.example/a?q=SECRET-QUERY', 0, [det('Evil|Name *x*', 'Anti-Bot', 70), det('Turnstile', 'CAPTCHA', 80)], { httpStatus: 403 }),
    entry('https://www.shop.example/a', 1, [det('Evil|Name *x*', 'Anti-Bot', 90)], { changed: { added: [], removed: ['Turnstile'] } })
  ];
  const report = SiteReport.build(items, 'shop.example');
  const text = SiteReport.toMarkdown(report, { dateText: ms => new Date(ms).toISOString().slice(0, 10), categoryLabel: key => key.toUpperCase() });
  assert.ok(text.startsWith('# Site report: shop.example\n'));
  assert.match(text, /Pages: 1 · Scans: 2 · 2026-10-01 – 2026-10-02/);
  assert.match(text, /Also saved as: www\.shop\.example/);
  assert.match(text, /## Protections on this site/);
  assert.match(text, /\| Evil\\\|Name \\\*x\\\* \| ANTIBOT \| 2026-10-01 \| 2026-10-02 \| 1 \| 2 \| 70–90% \|/);
  assert.match(text, /## Timeline/);
  assert.match(text, /- 2026-10-02 · \/a: Evil\\\|Name \\\*x\\\* 90%/);
  assert.match(text, /- 2026-10-01 · \/a · 403: Evil\\\|Name \\\*x\\\* 70%, Turnstile 80%/);
  assert.match(text, /## HTTP statuses\n\n\| HTTP status \| Scans \| Last seen \|/);
  assert.match(text, /\| 403 \| 1 \| 2026-10-01 \|/);
  assert.match(text, /Scans without a known status: 1/);
  assert.match(text, /- 2026-10-02 · www\.shop\.example\/a: −Turnstile/);
  for (const secret of ['SECRET', 'cf_clearance']) assert.ok(!text.includes(secret), secret);
  const t = (key, fallback, ...args) => `[${key}]` + args.join('/');
  const translated = SiteReport.toMarkdown(report, { t });
  assert.ok(translated.startsWith('# \\[statsSiteReportForFmt\\]shop.example'), translated.slice(0, 60));
  assert.match(translated, /\\\[statsSiteTimeline\\\]/);
});

test('toMarkdown: an empty site says so in each section', () => {
  const text = SiteReport.toMarkdown(SiteReport.build([], 'shop.example'));
  assert.match(text, /Pages: 0 · Scans: 0 · –/);
  assert.match(text, /No protection found in this site's saved scans\./);
  assert.match(text, /No saved scan of this site changed its protections\./);
  assert.doesNotMatch(text, /Also saved as/);
});

test('toMarkdown: a capped timeline says how much of it is shown', () => {
  const items = Array.from({ length: 12 }, (_, i) => entry('https://shop.example/', i, [det('Cloudflare', 'Anti-Bot')]));
  const text = SiteReport.toMarkdown(SiteReport.build(items, 'shop.example', { limit: 10 }));
  assert.match(text, /Showing the latest 10 of 12 scans\./);
  assert.equal((text.match(/^- .*Cloudflare/gm) || []).length, 10);
});

test('filename: the site and the local day, nothing else of the address', () => {
  const now = new Date(2026, 10, 13, 9).getTime();
  assert.equal(SiteReport.filename('https://www.Shop.Example/x?y', 'md', now), 'scrapfly-site-report-shop.example-2026-11-13.md');
  assert.equal(SiteReport.filename('shop.example', 'json', now), 'scrapfly-site-report-shop.example-2026-11-13.json');
  assert.equal(SiteReport.filename('', 'json', now), 'scrapfly-site-report-site-2026-11-13.json');
  assert.equal(SiteReport.filename('xn--bcher-kva.de', 'md', now), 'scrapfly-site-report-xn--bcher-kva.de-2026-11-13.md');
});
