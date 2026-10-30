const { test } = require('node:test');
const assert = require('node:assert/strict');

// Bulk scan's pure part: the list a person pastes or uploads, the sitemap it may name, the run's states and the
// exports. modules/core/bulk-scan.js runs here as it does in the page and the worker.

const BulkScan = require('../modules/core/bulk-scan.js');
const plain = (value) => JSON.parse(JSON.stringify(value));

test('a CSV quotes a cell with a comma: Bulk scan\'s own export reads back to the same pages', () => {
  const exported = '"https://a.example/?ids=1,2,3",done,2\n"https://b.example/x;y",done,0\n';
  assert.deepEqual(BulkScan.linesOf('url,status,found\n' + exported), ['https://a.example/?ids=1,2,3', 'https://b.example/x;y']);
  assert.deepEqual(BulkScan.linesOf(exported), ['https://a.example/?ids=1,2,3', 'https://b.example/x;y'], 'without the header too');
  assert.deepEqual(BulkScan.linesOf('"Shop, the ""big"" one",https://c.example/\n"Other",https://d.example/'), ['https://c.example/', 'https://d.example/']);
});

test('several addresses on one line are all scanned; a comma inside an address is not a separator, however many rows have one', () => {
  assert.deepEqual(BulkScan.linesOf('a.example,b.example,c.example'), ['a.example', 'b.example', 'c.example']);
  assert.deepEqual(BulkScan.linesOf('a.example, b.example'), ['a.example', 'b.example']);
  assert.deepEqual(BulkScan.linesOf('a.example\nb.example,Beta\nc.example'), ['a.example', 'b.example', 'c.example'], 'a name after an address is not part of it');
  assert.deepEqual(BulkScan.linesOf('https://a.example/?ids=1,2,3\nhttps://b.example/?ids=4,5,6'), ['https://a.example/?ids=1,2,3', 'https://b.example/?ids=4,5,6'],
    'two rows with as many commas are not a table');
  assert.deepEqual(BulkScan.linesOf('https://a.example/x;jsessionid=A1\nhttps://b.example/y;jsessionid=B2'), ['https://a.example/x;jsessionid=A1', 'https://b.example/y;jsessionid=B2']);
  assert.deepEqual(BulkScan.linesOf('https://a.example/,Shop A\nhttps://b.example/,Shop B'), ['https://a.example/', 'https://b.example/'], 'a table without a header');
});

test('a quoted cell may hold a line break: its lines are one row, and a stray quote cannot swallow the list below it', () => {
  assert.deepEqual(BulkScan.linesOf('https://a.example/,"Acme\nwww.acme.example, Inc"'), ['https://a.example/'], 'the note\'s second line is not a page');
  assert.deepEqual(BulkScan.linesOf('"Shop\nName",https://a.example/\n"Other",https://b.example/'), ['https://a.example/', 'https://b.example/']);
  assert.deepEqual(BulkScan.linesOf('"https://a.example/x\nhttps://b.example/y\nhttps://c.example/z'), ['https://a.example/x', 'https://b.example/y', 'https://c.example/z'], 'a quote never closed');
  assert.deepEqual(BulkScan.linesOf('"https://a.example/x"\nhttps://b.example/y'), ['https://a.example/x', 'https://b.example/y']);
  assert.deepEqual(BulkScan.linesOf('url,note\nhttps://a.example/,"line one\nline two"\nhttps://b.example/,plain'), ['https://a.example/', 'https://b.example/'], 'in a table too');
});

test('a list is read by explicit rules: a comma ends an address after a host, after a "/", before another address or before a note with a space', () => {
  const cases = [
    // a CSV with a header: commas separate cells, whatever the address holds
    ['url,name\nhttps://a.example/p?id=5,Alpha', ['https://a.example/p?id=5']],
    ['url;name\nhttps://a.example/p?id=5;Alpha', ['https://a.example/p?id=5']],
    ['name;url;status\nAlpha;https://a.example/p?id=5;done', ['https://a.example/p?id=5']],
    // a plain list: a comma in a path or a query is part of the address
    ['https://en.wikipedia.example/wiki/Portland,_Oregon', ['https://en.wikipedia.example/wiki/Portland,_Oregon']],
    ['https://maps.example/maps/@40.7128,-74.0060,15z', ['https://maps.example/maps/@40.7128,-74.0060,15z']],
    ['https://en.wikipedia.example/wiki/Portland,_Oregon\nhttps://a.example/x\nhttps://en.wikipedia.example/wiki/Paris,_Texas',
      ['https://en.wikipedia.example/wiki/Portland,_Oregon', 'https://a.example/x', 'https://en.wikipedia.example/wiki/Paris,_Texas']],
    ['https://a.example/?ids=1,2,3, my note', ['https://a.example/?ids=1,2,3']],
    // several addresses on one line, with or without a query
    ['https://a.example/?x=1, https://b.example/?y=2', ['https://a.example/?x=1', 'https://b.example/?y=2']],
    ['https://a.example/?x=1;https://b.example/?y=2', ['https://a.example/?x=1', 'https://b.example/?y=2']],
    ['a.example/?q=1, b.example/?q=2', ['a.example/?q=1', 'b.example/?q=2']],
    ['a.example, b.example, c.example\nd.example, e.example, f.example', ['a.example', 'b.example', 'c.example', 'd.example', 'e.example', 'f.example']],
    ['a.example,b.example\nc.example,d.example', ['a.example', 'b.example', 'c.example', 'd.example']],
    // an address and a name or a status after it
    ['https://a.example/,status=done\nhttps://b.example/,status=failed', ['https://a.example/', 'https://b.example/']],
    ['https://a.example/x,Alpha Beta', ['https://a.example/x']],
    ['a.example,', ['a.example']]
  ];
  for (const [input, expected] of cases) assert.deepEqual(BulkScan.linesOf(input), expected, JSON.stringify(input));
});

test('a pasted list or a .txt/.csv gives one address per line, the first address-like cell of a CSV row', () => {
  const text = '﻿https://a.example/\r\n\n# a comment\nb.example/path\n  "https://c.example/?q=1"  \n' +
    'url,title\nhttps://d.example/,Shop\nname;https://e.example/x;notes\nplain words\n';
  assert.deepEqual(BulkScan.linesOf(text), ['https://a.example/', 'b.example/path', 'https://c.example/?q=1', 'https://d.example/', 'https://e.example/x', 'plain words']);
  // A comma or semicolon in an address of a plain list belongs to it
  assert.deepEqual(BulkScan.linesOf('https://shop.example/search?ids=1,2,3\nhttps://x.example/a;jsessionid=abc\nexample.org'),
    ['https://shop.example/search?ids=1,2,3', 'https://x.example/a;jsessionid=abc', 'example.org']);
  // Rows of the same shape are a table even without a header
  assert.deepEqual(BulkScan.linesOf('https://a.example/,Shop A\nhttps://b.example/,Shop B'), ['https://a.example/', 'https://b.example/']);
  assert.deepEqual(BulkScan.linesOf('"https://q.example/";x'), ['https://q.example/']);
  assert.deepEqual(BulkScan.linesOf(''), []);
  assert.deepEqual(BulkScan.linesOf(null), []);
});

test('an address is scanned as http or https, a bare host gets https://, the fragment goes', () => {
  assert.deepEqual(BulkScan.normalize('example.com'), { url: 'https://example.com/' });
  assert.deepEqual(BulkScan.normalize('shop.example.com:8080/p?x=1#top'), { url: 'https://shop.example.com:8080/p?x=1' });
  assert.deepEqual(BulkScan.normalize('http://Example.COM/A'), { url: 'http://example.com/A' });
  assert.deepEqual(BulkScan.normalize('ftp://example.com/file'), { error: 'scheme' });
  assert.deepEqual(BulkScan.normalize('chrome://settings'), { error: 'scheme' });
  assert.deepEqual(BulkScan.normalize('javascript:alert(1)'), { error: 'scheme' });
  assert.deepEqual(BulkScan.normalize('file:///etc/passwd'), { error: 'scheme' });
  assert.deepEqual(BulkScan.normalize('not an address'), { error: 'invalid' });
  assert.deepEqual(BulkScan.normalize('   '), { error: 'invalid' });
});

test('the run\'s pages: duplicates removed and counted, the cap applied, every other line skipped with its reason', () => {
  const prepared = BulkScan.prepare([
    'https://a.example/', 'a.example', 'https://a.example/#again', 'http://a.example/',
    'ftp://x.example/', 'nonsense here', 'https://skipped.example/', 'https://b.example/',
    { url: 'https://broken.example/sitemap.xml', reason: 'sitemap' }, 'https://c.example/', 'https://d.example/'
  ], { cap: 3, isExcluded: (url) => new URL(url).hostname === 'skipped.example' });
  assert.deepEqual(plain(prepared.items), [
    { url: 'https://a.example/', status: 'waiting' },
    { url: 'http://a.example/', status: 'waiting' },
    { url: 'ftp://x.example/', status: 'skipped', reason: 'scheme' },
    { url: 'nonsense here', status: 'skipped', reason: 'invalid' },
    { url: 'https://skipped.example/', status: 'skipped', reason: 'scope' },
    { url: 'https://b.example/', status: 'waiting' },
    { url: 'https://broken.example/sitemap.xml', status: 'skipped', reason: 'sitemap' }
  ]);
  assert.equal(prepared.duplicates, 2, 'a.example and #again are the same page as https://a.example/');
  assert.equal(prepared.overCap, 2, 'c and d are over the cap of 3');
});

test('the cap is 1 to 200 (200 when unset), the time limit 10 to 120 seconds (45 when unset)', () => {
  assert.equal(BulkScan.capOf(undefined), 200);
  assert.equal(BulkScan.capOf(5000), 200);
  assert.equal(BulkScan.capOf(0), 1);
  assert.equal(BulkScan.capOf('25'), 25);
  assert.equal(BulkScan.timeoutOf(undefined), 45);
  assert.equal(BulkScan.timeoutOf(1), 10);
  assert.equal(BulkScan.timeoutOf(999), 120);
  const many = Array.from({ length: 450 }, (_, i) => `https://p${i}.example/`);
  const prepared = BulkScan.prepare(many);
  assert.equal(prepared.items.length, 200);
  assert.equal(prepared.overCap, 250);
});

test('skipped lines are listed up to a limit and counted past it', () => {
  const bad = Array.from({ length: BulkScan.MAX_SKIPPED_LISTED + 7 }, (_, i) => `ftp://f${i}.example/`);
  const prepared = BulkScan.prepare(bad);
  assert.equal(prepared.items.length, BulkScan.MAX_SKIPPED_LISTED);
  assert.equal(prepared.skippedOver, 7);
});

test('a sitemap and a sitemap index give their <loc> entries, entities and CDATA decoded', () => {
  const urlset = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-10-01</lastmod></url>
  <url><loc>
    https://example.com/search?q=a&amp;page=2
  </loc></url>
  <url><loc><![CDATA[https://example.com/caf&#233;]]></loc></url>
  <url><loc>https://example.com/&#x41;</loc></url>
</urlset>`;
  assert.deepEqual(plain(BulkScan.parseSitemap(urlset)), { kind: 'urlset', locs: ['https://example.com/', 'https://example.com/search?q=a&page=2', 'https://example.com/café', 'https://example.com/A'] });
  const index = '<sm:sitemapindex xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:sitemap><sm:loc>https://example.com/s1.xml</sm:loc></sm:sitemap></sm:sitemapindex>';
  assert.deepEqual(plain(BulkScan.parseSitemap(index)), { kind: 'sitemapindex', locs: ['https://example.com/s1.xml'] });
  assert.deepEqual(plain(BulkScan.parseSitemap('<html><body>not a sitemap</body></html>')), { kind: null, locs: [] });
  assert.equal(BulkScan.isSitemap('https://example.com/sitemap.xml'), true);
  assert.equal(BulkScan.isSitemap('https://example.com/sitemap_index.XML?x=1'), true);
  assert.equal(BulkScan.isSitemap('https://example.com/page'), false);
  assert.equal(BulkScan.isSitemap('not a url'), false);
});

function sampleRun() {
  return BulkScan.createRun(BulkScan.prepare(['https://a.example/', 'https://b.example/', 'ftp://c.example/']), { now: 1000, timeoutSec: 30 });
}

test('a run: waiting → scanning → done or failed, then done when nothing waits', () => {
  const run = sampleRun();
  assert.equal(run.status, 'running');
  assert.equal(run.timeoutSec, 30);
  assert.deepEqual(plain(BulkScan.counts(run)), { total: 3, waiting: 2, scanning: 0, done: 0, failed: 0, skipped: 1, found: 0 });
  assert.equal(BulkScan.nextWaiting(run), 0);
  assert.equal(BulkScan.finish(run, 0, {}), false, 'only a page being scanned can finish');
  assert.equal(BulkScan.begin(run, 0, 2000), true);
  assert.equal(BulkScan.begin(run, 0, 2000), false, 'once');
  assert.equal(BulkScan.finish(run, 0, { detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 90 }], difficulty: 'Medium', finalUrl: 'https://a.example/home' }, 3000), true);
  assert.equal(BulkScan.complete(run), false, 'b still waits');
  BulkScan.begin(run, 1, 4000);
  assert.equal(BulkScan.fail(run, 1, 'timeout', 5000), true);
  assert.equal(run.items[1].reason, 'timeout');
  assert.equal(BulkScan.complete(run, 6000), true);
  assert.equal(run.status, 'done');
  assert.equal(run.finishedAt, 6000);
  assert.deepEqual(plain(BulkScan.counts(run)), { total: 3, waiting: 0, scanning: 0, done: 1, failed: 1, skipped: 1, found: 1 });
  assert.equal(run.items[0].finalUrl, 'https://a.example/home');
  assert.equal(BulkScan.fail(run, 0, 'nonsense'), false);
});

test('pause and resume; a paused run starts no page; stop puts the page being scanned back to waiting', () => {
  const run = sampleRun();
  assert.equal(BulkScan.resume(run), false, 'only a paused run resumes');
  BulkScan.begin(run, 0);
  assert.equal(BulkScan.pause(run), true);
  assert.equal(BulkScan.pause(run), false);
  assert.equal(BulkScan.begin(run, 1), false, 'paused: no new page');
  assert.equal(BulkScan.finish(run, 0, { detections: [] }), true, 'the page being scanned still finishes');
  assert.equal(BulkScan.resume(run), true);
  BulkScan.begin(run, 1);
  assert.equal(BulkScan.stop(run, 'user', 9000), true);
  assert.equal(run.status, 'stopped');
  assert.equal(run.reason, 'user');
  assert.equal(run.items[1].status, 'waiting', 'stopped mid-scan: no result, so it waits');
  assert.equal(BulkScan.isActive(run), false);
  assert.equal(BulkScan.stop(run), false, 'once');
  assert.equal(BulkScan.begin(run, 1), false, 'a stopped run starts nothing');
  assert.equal(BulkScan.complete(run), false);
});

test('worker restart: a run found running or paused is marked stopped, never left running; a finished one is kept', () => {
  for (const status of ['running', 'paused']) {
    const run = sampleRun();
    BulkScan.begin(run, 0);
    if (status === 'paused') BulkScan.pause(run);
    const recovered = BulkScan.recover(JSON.parse(JSON.stringify(run)), 7000);
    assert.equal(recovered.status, 'stopped', status);
    assert.equal(recovered.reason, 'restart');
    assert.equal(recovered.items[0].status, 'waiting');
    assert.equal(recovered.items.some(item => item.status === 'scanning'), false);
  }
  const done = sampleRun();
  done.status = 'done';
  assert.equal(BulkScan.recover(done).status, 'done');
  assert.equal(BulkScan.recover(null), null);
  assert.equal(BulkScan.recover({ status: 'running' }), null, 'nothing usable');
});

test('a finished page is summarized strongest first, by category key, with the page difficulty', () => {
  const results = [
    { detector: { name: 'reCAPTCHA' }, category: 'CAPTCHA', confidence: 70.4 },
    { detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 95 },
    { name: 'Canvas', category: 'Fingerprint' }
  ];
  const summary = BulkScan.summarize(results, (list) => (list.length === 3 ? 'High' : 'Low'));
  assert.deepEqual(plain(summary), { detections: [
    { name: 'Cloudflare', category: 'antibot', confidence: 95 },
    { name: 'reCAPTCHA', category: 'captcha', confidence: 70 },
    { name: 'Canvas', category: 'fingerprint', confidence: null }
  ], difficulty: 'High' });
  assert.deepEqual(plain(BulkScan.summarize([], () => 'Low')), { detections: [], difficulty: '' }, 'nothing found: no difficulty');
  assert.equal(BulkScan.summarize(results, () => { throw new Error('x'); }).difficulty, '');
});

test('CSV export: one row per protection, a row for a page without one, formulas kept as text', () => {
  const run = sampleRun();
  BulkScan.begin(run, 0);
  BulkScan.finish(run, 0, { detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 95 }, { name: '=HYPERLINK("x")', category: 'other', confidence: 50 }], difficulty: 'Medium' }, Date.UTC(2026, 9, 26, 10));
  BulkScan.begin(run, 1);
  BulkScan.fail(run, 1, 'load');
  const out = BulkScan.build(run, { format: 'csv' });
  assert.equal(out.type, 'text/csv');
  assert.equal(out.extension, 'csv');
  const lines = out.text.trimEnd().split('\r\n');
  assert.equal(lines[0], 'url,status,reason,final_url,difficulty,protection,category,confidence,scanned_at');
  assert.equal(lines[1], 'https://a.example/,done,,,Medium,Cloudflare,antibot,95,2026-10-26T10:00:00.000Z');
  assert.equal(lines[2], 'https://a.example/,done,,,Medium,"\'=HYPERLINK(""x"")",other,50,2026-10-26T10:00:00.000Z');
  assert.equal(lines[3], 'https://b.example/,failed,load,,,,,,');
  assert.equal(lines[4], 'ftp://c.example/,skipped,scheme,,,,,,');
  assert.equal(lines.length, 5);
});

test('JSON export: the run and every page, with its reason and protections', () => {
  const run = sampleRun();
  BulkScan.begin(run, 0);
  BulkScan.finish(run, 0, { detections: [{ name: 'DataDome', category: 'antibot', confidence: 88 }], difficulty: 'High' }, 5000);
  BulkScan.stop(run, 'user', 6000);
  const out = BulkScan.build(run, { format: 'json', now: Date.UTC(2026, 9, 26) });
  assert.equal(out.type, 'application/json');
  const data = JSON.parse(out.text);
  assert.equal(data.type, 'bulk-scan');
  assert.equal(data.exportedAt, '2026-10-26T00:00:00.000Z');
  assert.equal(data.run.status, 'stopped');
  assert.deepEqual(data.run.counts, { total: 3, waiting: 1, scanning: 0, done: 1, failed: 0, skipped: 1, found: 1 });
  assert.deepEqual(data.pages.map(p => [p.url, p.status, p.reason, p.difficulty, p.detections.length]), [
    ['https://a.example/', 'done', null, 'High', 1],
    ['https://b.example/', 'waiting', null, null, 0],
    ['ftp://c.example/', 'skipped', 'scheme', null, 0]
  ]);
  assert.equal(data.pages[0].scannedAt, new Date(5000).toISOString());
});

test('file names carry the person\'s own day', () => {
  assert.equal(BulkScan.fileName('csv', '2026-10-26'), 'scrapfly-bulk-scan-2026-10-26.csv');
  assert.equal(BulkScan.fileName('json', '2026-10-26'), 'scrapfly-bulk-scan-2026-10-26.json');
  assert.equal(BulkScan.fileName('exe', 'not a day'), 'scrapfly-bulk-scan-export.json');
});

test('continuing a stopped run: the waiting addresses to scan, the finished pages kept, the counts of the first paste carried', () => {
  const run = BulkScan.createRun({ items: [
    { url: 'https://a.example/', status: 'waiting' }, { url: 'https://b.example/', status: 'waiting' }, { url: 'mailto:x', status: 'skipped', reason: 'scheme' }
  ], duplicates: 2, overCap: 3, skippedOver: 1 });
  BulkScan.begin(run, 0);
  BulkScan.finish(run, 0, { detections: [{ name: 'Akamai' }], difficulty: 'High', finalUrl: 'https://a.example/home' });
  assert.equal(BulkScan.continuation(run), null, 'a run that is still going is not continued');
  BulkScan.stop(run);
  const resumed = BulkScan.continuation(run);
  assert.deepEqual(plain(resumed.entries), ['https://b.example/']);
  assert.deepEqual(plain(resumed.kept.map(item => [item.url, item.status])), [['https://a.example/', 'done'], ['mailto:x', 'skipped']]);
  assert.equal(resumed.kept[0].finalUrl, 'https://a.example/home', 'a finished page keeps all it had');
  const next = BulkScan.carryOver(BulkScan.createRun(BulkScan.prepare(resumed.entries), {}), resumed);
  assert.deepEqual(plain(next.items.map(item => item.status)), ['done', 'skipped', 'waiting']);
  assert.deepEqual([next.duplicates, next.overCap, next.skippedOver], [2, 3, 1]);
  assert.deepEqual(plain(BulkScan.counts(next)), { total: 3, waiting: 1, scanning: 0, done: 1, failed: 0, skipped: 1, found: 1 });
  resumed.kept[0].status = 'changed';
  assert.equal(run.items[0].status, 'done', 'the kept pages are copies');
  assert.equal(BulkScan.continuation({ status: 'done', items: [{ url: 'https://a.example/', status: 'done' }] }), null, 'nothing waits');
  assert.equal(BulkScan.continuation(null), null);
});

test('scanning the failed pages again: failed (and waiting) addresses are scanned, done and skipped pages are kept', () => {
  const run = BulkScan.createRun({ items: [
    { url: 'https://a.example/', status: 'waiting' }, { url: 'https://b.example/', status: 'waiting' }, { url: 'https://c.example/', status: 'waiting' },
    { url: 'mailto:x', status: 'skipped', reason: 'scheme' }
  ] });
  BulkScan.begin(run, 0); BulkScan.finish(run, 0, { detections: [{ name: 'Akamai' }], difficulty: 'High' });
  BulkScan.begin(run, 1); BulkScan.fail(run, 1, 'timeout');
  BulkScan.stop(run);
  assert.deepEqual(plain(BulkScan.continuation(run).entries), ['https://c.example/'], 'by default only what waits');
  const again = BulkScan.continuation(run, { includeFailed: true });
  assert.deepEqual(plain(again.entries), ['https://b.example/', 'https://c.example/'], 'the failed page and the waiting one');
  assert.deepEqual(plain(again.kept.map(item => [item.url, item.status])), [['https://a.example/', 'done'], ['mailto:x', 'skipped']]);
  const done = BulkScan.createRun({ items: [{ url: 'https://a.example/', status: 'waiting' }, { url: 'https://b.example/', status: 'waiting' }] });
  BulkScan.begin(done, 0); BulkScan.finish(done, 0, {});
  BulkScan.begin(done, 1); BulkScan.fail(done, 1, 'load');
  BulkScan.complete(done);
  assert.equal(done.status, 'done');
  assert.deepEqual(plain(BulkScan.continuation(done, { includeFailed: true }).entries), ['https://b.example/'], 'a finished run with a failure can be retried');
  assert.equal(BulkScan.continuation(done), null, 'but nothing waits');
});

