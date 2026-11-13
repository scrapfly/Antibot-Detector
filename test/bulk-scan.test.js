const { test } = require('node:test');
const assert = require('node:assert/strict');
const withinLimit = require('./helpers/hard-limit.js');

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
  const text = '\uFEFFhttps://a.example/\r\n\n# a comment\nb.example/path\n  "https://c.example/?q=1"  \n' +
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

test('hold: the extension switched off pauses a run at once, its page being scanned waiting again, with the reason until Resume', () => {
  const run = sampleRun();
  BulkScan.begin(run, 0, 2000);
  assert.equal(BulkScan.hold(run, 'off'), true);
  assert.deepEqual([run.status, run.reason], ['paused', 'off']);
  assert.equal(run.items[0].status, 'waiting', 'given up mid-scan: no result, so it waits');
  assert.equal(run.items[0].startedAt, undefined);
  assert.equal(BulkScan.finish(run, 0, { detections: [] }), false, 'a scan that comes in late is not taken');
  assert.equal(BulkScan.begin(run, 1), false, 'held: no new page');
  assert.equal(BulkScan.isActive(run), true, 'still the run in progress: Resume goes on with it');
  // A run the person had paused, its page still finishing, takes the reason and gives up that page too
  const paused = sampleRun();
  BulkScan.begin(paused, 0);
  BulkScan.pause(paused);
  assert.equal(BulkScan.hold(paused, 'off'), true);
  assert.deepEqual([paused.status, paused.reason, paused.items[0].status], ['paused', 'off', 'waiting']);
  // On again: the reason goes, the run waits for Resume; Resume clears a reason it still has
  assert.equal(BulkScan.release(run, 'user'), false, 'only the reason it was held for');
  assert.equal(BulkScan.release(run, 'off'), true);
  assert.deepEqual([run.status, run.reason], ['paused', null]);
  assert.equal(BulkScan.release(run, 'off'), false, 'once');
  assert.equal(BulkScan.resume(paused), true);
  assert.deepEqual([paused.status, paused.reason], ['running', null]);
  // A run that is over is not held
  const over = sampleRun();
  BulkScan.stop(over, 'user');
  assert.equal(BulkScan.hold(over, 'off'), false);
  assert.deepEqual([over.status, over.reason], ['stopped', 'user']);
  assert.equal(BulkScan.hold(null, 'off'), false);
  // A worker that starts again keeps a held run held, with its reason
  const held = sampleRun();
  BulkScan.hold(held, 'off');
  assert.deepEqual([BulkScan.recover(plain(held)).status, BulkScan.recover(plain(held)).reason], ['paused', 'off']);
});

test('worker restart: a run found running is marked stopped, never left running; a paused one stays paused; a finished one is kept', () => {
  const run = sampleRun();
  BulkScan.begin(run, 0);
  const recovered = BulkScan.recover(JSON.parse(JSON.stringify(run)), 7000);
  assert.equal(recovered.status, 'stopped');
  assert.equal(recovered.reason, 'restart');
  assert.equal(recovered.items[0].status, 'waiting');
  assert.equal(recovered.items.some(item => item.status === 'scanning'), false);
  // Chrome stops an idle worker, and a pause is idle: the person's Resume still has to work after it
  const paused = sampleRun();
  BulkScan.begin(paused, 0);
  BulkScan.pause(paused);
  const kept = BulkScan.recover(JSON.parse(JSON.stringify(paused)), 7000);
  assert.equal(kept.status, 'paused');
  assert.equal(kept.reason, null);
  assert.equal(kept.items[0].status, 'waiting', 'nothing scans it now: the page being scanned waits again');
  assert.equal(kept.items.some(item => item.status === 'scanning'), false);
  assert.equal(BulkScan.resume(kept), true);
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
  assert.equal(lines[0], 'url,status,reason,final_url,difficulty,protection,category,confidence,scanned_at,http_status');
  assert.equal(lines[1], 'https://a.example/,done,,,Medium,Cloudflare,antibot,95,2026-10-26T10:00:00.000Z,');
  assert.equal(lines[2], 'https://a.example/,done,,,Medium,"\'=HYPERLINK(""x"")",other,50,2026-10-26T10:00:00.000Z,');
  assert.equal(lines[3], 'https://b.example/,failed,load,,,,,,,');
  assert.equal(lines[4], 'ftp://c.example/,skipped,scheme,,,,,,,');
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


test('a comma or semicolon that ends a line is not part of the address, and an empty query is no query', () => {
  assert.deepEqual(BulkScan.linesOf('https://a.example/x,\nhttps://b.example/y;\nhttps://c.example/?ids=1,2,3'),
    ['https://a.example/x', 'https://b.example/y', 'https://c.example/?ids=1,2,3'], 'only the one with nothing after it ends the address');
  assert.deepEqual(BulkScan.normalize('https://a.example/?'), { url: 'https://a.example/' });
  assert.deepEqual(BulkScan.normalize('https://a.example/x?#top'), { url: 'https://a.example/x' });
  const prepared = BulkScan.prepare(['https://a.example', 'https://a.example/', 'a.example', 'https://A.EXAMPLE/#x', 'https://a.example/?']);
  assert.equal(prepared.items.length, 1, 'five spellings of one page are scanned once');
  assert.equal(prepared.duplicates, 4);
  assert.deepEqual(BulkScan.normalize('https://a.example/?q=1'), { url: 'https://a.example/?q=1' }, 'a real query stays');
});

test('the Markdown export is a heading, the counts and one row per page: names only, addresses without query or fragment, cells escaped', () => {
  const run = BulkScan.createRun({ items: ['https://a.example/p?token=SECRET#x', 'https://b.example/', 'https://c.example/', 'https://d.example/'].map(url => ({ url, status: 'waiting' })) }, { now: 1 });
  run.items[0].status = 'done';
  run.items[0].difficulty = 'Medium';
  run.items[0].detections = [{ name: 'Cloudflare', category: 'antibot', confidence: 95 }, { name: 're_CAPTCHA | v3', category: 'captcha', confidence: 80 }];
  run.items[1].status = 'failed';
  run.items[1].reason = 'timeout';
  run.items[2].status = 'done';
  run.items[2].detections = [];
  const built = BulkScan.build(run, { format: 'md' });
  assert.equal(built.type, 'text/markdown');
  assert.equal(built.extension, 'md');
  assert.equal(built.fileText, built.text, 'a Markdown file has no byte-order mark');
  assert.deepEqual(built.text.split('\n'), [
    '# Scrapfly Antibot Detector: Bulk scan', '',
    '4 pages, 2 scanned, 1 failed, 1 waiting; 1 with protections', '',
    'Most seen: Cloudflare (1 page), re\\_CAPTCHA \\| v3 (1 page)', '',
    '| Page | Status | Difficulty | Protections |', '| --- | --- | --- | --- |',
    '| <https://a.example/p> | done | Medium | Cloudflare (antibot, 95%); re\\_CAPTCHA \\| v3 (captcha, 80%) |',
    '| <https://b.example/> | failed: timeout |  | - |',
    '| <https://c.example/> | done |  | - |',
    '| <https://d.example/> | waiting |  | - |', '']);
  assert.ok(BulkScan.build(BulkScan.createRun({ items: [{ url: 'https://a.example/x_y/~z', status: 'waiting' }] }, { now: 1 }), { format: 'md' }).text
    .includes('| <https://a.example/x_y/~z> | waiting |'), 'an underscore in a path has no backslash: the address is a link');
  assert.ok(!built.text.includes('SECRET'), 'the query, where tokens live, is left out');
  assert.equal(BulkScan.fileName('md', '2026-11-01'), 'scrapfly-bulk-scan-2026-11-01.md');
  assert.ok(BulkScan.FORMATS.includes('md'));
  assert.equal(BulkScan.build(null, { format: 'md' }).text.split('\n')[2], '0 pages; 0 with protections', 'no run: an empty table');
});

test('a CSV file starts with the byte-order mark so a spreadsheet reads UTF-8, and the other formats are written as they are', () => {
  const run = BulkScan.createRun(BulkScan.prepare(['https://a.example/']), { now: 1 });
  const csv = BulkScan.build(run, { format: 'csv' });
  assert.ok(!csv.text.startsWith('\uFEFF'));
  assert.ok(csv.fileText.startsWith('\uFEFFurl,status,'));
  const json = BulkScan.build(run, { format: 'json', now: 5 });
  assert.equal(json.fileText, json.text);
});

test('a list of thousands of addresses on one line is read in one pass, with the same result as one per line', () => {
  const addresses = Array.from({ length: 20000 }, (_, i) => `https://site${i}.example/page?ids=1,2,3`);
  const parsed = withinLimit(() => BulkScan.linesOf(addresses.join(', ')), '20000 addresses on one line', 15000);
  assert.deepStrictEqual(parsed, addresses);
  assert.deepStrictEqual(BulkScan.linesOf(addresses.slice(0, 50).join('\n')), addresses.slice(0, 50));
});

test('sameSite: a sitemap speaks for its own host; www, the port and the scheme do not matter, another host never does', () => {
  const site = 'https://example.com/sitemap.xml';
  const own = ['https://example.com/', 'https://www.example.com/a', 'http://example.com:8080/b?x=1#top', 'HTTPS://EXAMPLE.COM/C', 'https://example.com./dot', 'example.com/bare', 'www.example.com'];
  for (const loc of own) assert.equal(BulkScan.sameSite(site, loc), true, loc);
  const other = [
    'http://127.0.0.1/', 'http://127.0.0.1:8080/x', 'http://localhost/', 'http://[::1]/', 'http://192.168.1.5/', 'http://10.0.0.1/', 'http://169.254.169.254/latest/meta-data/',
    'https://other.example/', 'https://shop.example.com/', 'https://example.com.evil.example/', 'https://evil.example/?u=https://example.com/', 'https://example.com@evil.example/',
    'https://evil.example\\@example.com/x', 'https://evilexample.com/', 'https://notwww.example.com/',
    'ftp://example.com/file', 'file:///etc/passwd', 'javascript:alert(1)', 'mailto:a@example.com', 'chrome://settings', '', '   ', null, undefined, 'not an address', '/relative', '//example.com/x'
  ];
  for (const loc of other) assert.equal(BulkScan.sameSite(site, loc), false, String(loc));
  // the other way round, and an address of the machine itself is its own site
  assert.equal(BulkScan.sameSite('https://www.example.com/s.xml', 'https://example.com/a'), true);
  assert.equal(BulkScan.sameSite('https://127.0.0.1:8443/sitemap.xml', 'http://127.0.0.1/x'), true, 'a local sitemap lists local pages of its own host');
  assert.equal(BulkScan.sameSite('https://127.0.0.1/sitemap.xml', 'http://localhost/x'), false, 'two names of one machine are two hosts');
  assert.equal(BulkScan.sameSite('https://[::1]/sitemap.xml', 'http://[::1]:3000/x'), true);
  // a sitemap with no usable address of its own speaks for nobody: two empty sites are not the same site
  for (const bad of ['', null, undefined, 'not a url', 'ftp://example.com/s.xml']) assert.equal(BulkScan.sameSite(bad, bad), false, String(bad));
  assert.equal(BulkScan.sameSite('', 'https://example.com/'), false);
  // "www." is only dropped from a host that has a name under it
  assert.equal(BulkScan.sameSite('https://www.com/s.xml', 'https://com/x'), false);
  assert.equal(BulkScan.sameSite('https://www.example.com/s.xml', 'https://www.example.org/x'), false);
});

test('sameSite judges the address that will be scanned: the one prepare() makes of the text', () => {
  const site = 'https://example.com/sitemap.xml';
  for (const loc of ['https://example.com/a', 'https://www.example.com/a b', ' https://example.com/tab\there ', 'example.com:8443/x', 'https://example.com/%2F..%2Fa']) {
    const normal = BulkScan.normalize(loc);
    assert.equal(BulkScan.sameSite(site, loc), true, loc);
    assert.equal(BulkScan.prepare([loc]).items[0].url, normal.url, 'what is checked is what is scanned');
  }
  // a listed address the check keeps off is not one prepare() would scan as a page of this site (what is judged is the address as listed: the
  // worker opens it and follows its redirects)
  for (const loc of ['http://127.0.0.1/a', 'http://169.254.169.254/', 'https://example.com.evil.example/a']) {
    assert.equal(BulkScan.sameSite(site, loc), false, loc);
    assert.notEqual(new URL(BulkScan.normalize(loc).url).hostname.replace(/^www\./, ''), 'example.com');
  }
});

// ---- The protections seen on the most pages ("Most seen")

const found = (name, category = 'antibot', confidence = 90) => ({ name, category, confidence });
/** Seven pages: four protected in different ways, one clean, one failed (carrying a detection it cannot have), one skipped. */
function totalsRun() {
  const run = BulkScan.createRun({ items: 'abcdefg'.split('').map(n => ({ url: `https://${n}.example/`, status: 'waiting' })) }, { now: 1 });
  const done = (index, detections) => { run.items[index].status = 'done'; run.items[index].detections = detections; run.items[index].finishedAt = Date.UTC(2026, 10, 5, 10); };
  done(0, [found('Cloudflare'), found('reCAPTCHA', 'captcha'), found('Canvas', 'fingerprint', 40)]);
  done(1, [found('Cloudflare'), found('Akamai')]);
  done(2, [found('Cloudflare'), found('Cloudflare', 'captcha')]);
  done(3, [found('Akamai'), found('reCAPTCHA', 'captcha')]);
  done(4, []);
  Object.assign(run.items[5], { status: 'failed', reason: 'timeout', detections: [found('DataDome')] });
  Object.assign(run.items[6], { status: 'skipped', reason: 'scope' });
  return run;
}
const TOTALS = [
  { name: 'Cloudflare', category: 'antibot', pages: 3 },
  { name: 'Akamai', category: 'antibot', pages: 2 },
  { name: 'reCAPTCHA', category: 'captcha', pages: 2 },
  { name: 'Canvas', category: 'fingerprint', pages: 1 }
];

test('protectionTotals: how many scanned pages each protection was found on, most first, then by name', () => {
  assert.deepEqual(plain(BulkScan.protectionTotals(totalsRun())), TOTALS);
});

test('protectionTotals counts a page once per protection, and counts only pages that were scanned', () => {
  const totals = Object.fromEntries(BulkScan.protectionTotals(totalsRun()).map(row => [row.name, row.pages]));
  assert.equal(totals.Cloudflare, 3, 'the page that names it twice (in two categories) is one page');
  assert.equal(totals.DataDome, undefined, 'a failed page has no result');
  const notScanned = BulkScan.createRun({ items: [
    { url: 'https://a.example/', status: 'waiting', detections: [found('X')] }, { url: 'https://b.example/', status: 'scanning', detections: [found('X')] },
    { url: 'https://c.example/', status: 'skipped', detections: [found('X')] }] });
  assert.deepEqual(BulkScan.protectionTotals(notScanned), [], 'neither does a page still waiting, being scanned or skipped');
  const names = BulkScan.createRun({ items: ['Cloudflare', 'cloudflare', 'PerimeterX', 'HUMAN (PerimeterX)'].map((name, i) => ({ url: `https://p${i}.example/`, status: 'done', detections: [found(name)] })) });
  assert.deepEqual(BulkScan.protectionTotals(names).map(row => [row.name, row.pages]), [['Cloudflare', 2], ['PerimeterX', 2]],
    'the spellings of a name, and the names one protection has had, are one row (as History groups them), under the first spelling met');
});

test('protectionTotals has a stable order: the same count is sorted by name, whatever order the pages came in', () => {
  const names = (...list) => BulkScan.protectionTotals(BulkScan.createRun({ items: list.map((name, i) => ({ url: `https://p${i}.example/`, status: 'done', detections: [found(name)] })) })).map(row => row.name);
  assert.deepEqual(names('Zeta', 'Alpha', 'Mid'), ['Alpha', 'Mid', 'Zeta']);
  assert.deepEqual(names('Mid', 'Zeta', 'Alpha'), ['Alpha', 'Mid', 'Zeta']);
  assert.deepEqual(names('zeta', 'Alpha', 'beta'), ['Alpha', 'beta', 'zeta'], 'case does not decide');
  const twice = BulkScan.createRun({ items: ['Zeta', 'Zeta', 'Alpha', 'Beta'].map((name, i) => ({ url: `https://p${i}.example/`, status: 'done', detections: [found(name)] })) });
  assert.deepEqual(BulkScan.protectionTotals(twice).map(row => [row.name, row.pages]), [['Zeta', 2], ['Alpha', 1], ['Beta', 1]], 'more pages first, then by name');
});

test('protectionTotals reads whatever shape a run has: no run, no pages, nameless detections, junk', () => {
  for (const nothing of [null, undefined, {}, { items: null }, { items: [] }, { items: [null, 7, 'x'] }]) assert.deepEqual(BulkScan.protectionTotals(nothing), [], JSON.stringify(nothing));
  const odd = BulkScan.createRun({ items: [{ url: 'https://a.example/', status: 'done',
    detections: [null, 3, {}, { name: '' }, { name: '?' }, { name: '  ' }, { detector: { name: 'Legacy' }, category: 'Anti-Bot' }, 'text', found('Real')] }] });
  assert.deepEqual(plain(BulkScan.protectionTotals(odd)), [{ name: 'Legacy', category: 'antibot', pages: 1 }, { name: 'Real', category: 'antibot', pages: 1 }],
    'a name is needed (a "?" is the placeholder of a detection without one); the older shape is read: the name under detector, the category as the detector file writes it');
  assert.equal(BulkScan.MOST_SEEN, 5, 'the page and the Markdown export show the top five');
});

test('the Markdown export says which protections were seen on the most pages, in a line under the counts, and leaves it out when none was found', () => {
  const lines = BulkScan.build(totalsRun(), { format: 'md' }).text.split('\n');
  assert.equal(lines[2], '7 pages, 5 scanned, 1 failed, 1 skipped; 4 with protections');
  assert.equal(lines[3], '');
  assert.equal(lines[4], 'Most seen: Cloudflare (3 pages), Akamai (2 pages), reCAPTCHA (2 pages), Canvas (1 page)');
  assert.equal(lines[5], '');
  assert.equal(lines[6], '| Page | Status | Difficulty | Protections |');
  const many = BulkScan.createRun({ items: 'abcdefgh'.split('').map((n, i) => ({ url: `https://${n}.example/`, status: 'done', detections: [found(`P${i}`)] })) });
  assert.equal(BulkScan.build(many, { format: 'md' }).text.split('\n')[4], 'Most seen: P0 (1 page), P1 (1 page), P2 (1 page), P3 (1 page), P4 (1 page)', 'the top five; the JSON has them all');
  const none = BulkScan.createRun({ items: [{ url: 'https://a.example/', status: 'done', detections: [] }, { url: 'https://b.example/', status: 'failed' }] });
  assert.ok(!BulkScan.build(none, { format: 'md' }).text.includes('Most seen'));
  assert.ok(!BulkScan.build(null, { format: 'md' }).text.includes('Most seen'));
});

test('the JSON export carries every protection with the number of pages it was found on, and an empty list when none was found', () => {
  const data = JSON.parse(BulkScan.build(totalsRun(), { format: 'json', now: 1 }).text);
  assert.deepEqual(data.run.protectionTotals, TOTALS);
  assert.deepEqual(data.run.counts, { total: 7, waiting: 0, scanning: 0, done: 5, failed: 1, skipped: 1, found: 4 }, 'what was there stays');
  assert.deepEqual(JSON.parse(BulkScan.build(sampleRun(), { format: 'json', now: 1 }).text).run.protectionTotals, []);
  assert.equal(JSON.parse(BulkScan.build(null, { format: 'json', now: 1 }).text).run, null, 'no run: still null');
  const many = BulkScan.createRun({ items: 'abcdefgh'.split('').map((n, i) => ({ url: `https://${n}.example/`, status: 'done', detections: [found(`P${i}`)] })) });
  assert.equal(JSON.parse(BulkScan.build(many, { format: 'json', now: 1 }).text).run.protectionTotals.length, 8, 'all of them, not the top five');
});

test('the CSV export is as before: a header and a row per protection (or per page without one), no totals', () => {
  const run = totalsRun();
  const lines = BulkScan.build(run, { format: 'csv' }).text.trimEnd().split('\r\n');
  // 3.1.8 added http_status as the last column (the page's HTTP status), so the columns before it keep their places
  assert.equal(lines[0], 'url,status,reason,final_url,difficulty,protection,category,confidence,scanned_at,http_status');
  const rows = run.items.reduce((count, item) => count + Math.max(1, (item.detections || []).length), 0);
  assert.equal(lines.length, 1 + rows, 'nothing else is added');
  assert.equal(lines[1], 'https://a.example/,done,,,,Cloudflare,antibot,90,2026-11-05T10:00:00.000Z,');
  assert.ok(!/most seen|protectionTotals/i.test(lines.join('\n')));
  assert.equal(BulkScan.build(run, { format: 'csv' }).text, BulkScan.build(JSON.parse(JSON.stringify(run)), { format: 'csv' }).text, 'a run read back from storage gives the same file');
});

test('a sitemap that moved to another site is a reason of its own, and prepare keeps the reasons it knows', () => {
  assert.ok(BulkScan.REASONS.includes('moved'));
  const prepared = BulkScan.prepare([
    { url: 'https://moved.example/sitemap.xml', reason: 'moved' }, { url: 'https://down.example/sitemap.xml', reason: 'sitemap' }, { url: 'https://odd.example/s.xml', reason: 'nonsense' }]);
  assert.deepEqual(plain(prepared.items.map(item => [item.status, item.reason])), [['skipped', 'moved'], ['skipped', 'sitemap'], ['skipped', 'invalid']]);
  const run = BulkScan.createRun(prepared);
  const csv = BulkScan.build(run, { format: 'csv' }).text.split('\r\n');
  assert.equal(csv[1], 'https://moved.example/sitemap.xml,skipped,moved,,,,,,,', 'the exports say why, in the same words');
  assert.ok(BulkScan.build(run, { format: 'md' }).text.includes('skipped: moved'));
});

test('oneLines gives one line per page: address without query, protections with confidence, a dash when none, the status when not scanned', () => {
  const run = { items: [
    { url: 'https://a.example/p?token=SECRET#x', status: 'done', detections: [{ name: 'Cloudflare', confidence: 90.4 }, { name: 'reCAPTCHA' }] },
    { url: 'https://b.example/', status: 'done', detections: [] },
    { url: 'https://c.example/', status: 'failed', reason: 'load' },
    { url: 'https://d.example/', status: 'waiting' }
  ] };
  assert.equal(BulkScan.oneLines(run), [
    'https://a.example/p: Cloudflare 90%, reCAPTCHA', 'https://b.example/: -', 'https://c.example/: failed (load)', 'https://d.example/: waiting'].join('\n'));
  assert.equal(BulkScan.oneLines({ items: [] }), '');
  assert.equal(BulkScan.oneLines(null), '');
});

test('a finished page keeps its HTTP status, which every export gives; an unknown or 304 status is left out', () => {
  const run = sampleRun();
  BulkScan.begin(run, 0, 2000);
  BulkScan.finish(run, 0, { detections: [{ name: 'DataDome', category: 'antibot', confidence: 88 }], difficulty: 'High', httpStatus: 403 }, 3000);
  BulkScan.begin(run, 1, 4000);
  BulkScan.finish(run, 1, { detections: [], httpStatus: 304 }, 5000);
  assert.equal(run.items[0].httpStatus, 403);
  assert.equal('httpStatus' in run.items[1], false, 'a 304 says nothing about the page');

  const csv = BulkScan.build(run, { format: 'csv' }).text.trimEnd().split('\r\n');
  assert.equal(csv[0].split(',').pop(), 'http_status', 'the last column');
  assert.equal(csv[1], `https://a.example/,done,,,High,DataDome,antibot,88,${new Date(3000).toISOString()},403`);
  assert.equal(csv[2], `https://b.example/,done,,,,,,,${new Date(5000).toISOString()},`);

  const json = JSON.parse(BulkScan.build(run, { format: 'json' }).text);
  assert.deepEqual(json.pages.map(p => p.httpStatus), [403, null, null]);

  const md = BulkScan.build(run, { format: 'md' }).text;
  assert.ok(md.includes('| done · 403 |'), 'the Markdown status reads as the table does');

  // Scanning a page again forgets the status of the scan before when the new one has none
  run.items[0].status = 'scanning';
  BulkScan.finish(run, 0, { detections: [] }, 6000);
  assert.equal('httpStatus' in run.items[0], false);
});

test('the runner hands the page\'s HTTP status to finish(), and the table shows it beside Done with the error tone', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const runner = fs.readFileSync(path.join(__dirname, '..', 'background/bulk-scan-runner.js'), 'utf8');
  assert.match(runner, /BulkScan\.finish\(run, index, \{ \.\.\.summary, finalUrl: outcome\.url, httpStatus: outcome\.httpStatus \}\)/);
  const page = fs.readFileSync(path.join(__dirname, '..', 'sections/bulk/bulk.js'), 'utf8');
  assert.match(page, /item\.status === 'done' \? HttpStatus\.of\(item\.httpStatus\) : null/);
  assert.match(page, /bulk-http--\$\{HttpStatus\.tone\(code\)\}/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'sections/bulk/bulk.css'), 'utf8');
  for (const tone of ['ok', 'warn', 'error']) assert.match(css, new RegExp(`\\.bulk-http${tone === 'ok' ? '' : `--${tone}`} \\{`), tone);
});

test('"Wait between pages": 0 to 60 seconds on the run (0 by default), counted from the end of the last page visited', () => {
  const make = (delaySec) => BulkScan.createRun(BulkScan.prepare(['https://a.example/', 'https://b.example/', 'https://c.example/']), { now: 1000, delaySec });
  assert.deepEqual([undefined, 0, 12, '30', -5, 61, 'x'].map(value => make(value).delaySec), [0, 0, 12, 30, 0, 60, 0]);
  assert.deepEqual(BulkScan.DELAY_S, { min: 0, max: 60, default: 0 });
  const run = make(10);
  assert.equal(BulkScan.waitBefore(run, 5000), 0, 'nothing visited yet: no wait before the first page');
  BulkScan.begin(run, 0, 1000);
  BulkScan.finish(run, 0, {}, 2000);
  assert.equal(BulkScan.waitBefore(run, 2000), 10000);
  assert.equal(BulkScan.waitBefore(run, 9000), 3000, 'what is left of it');
  assert.equal(BulkScan.waitBefore(run, 20000), 0);
  assert.equal(BulkScan.waitBefore(run, -50000), 10000, 'a clock that went back never makes it longer');
  BulkScan.begin(run, 1, 3000);
  BulkScan.fail(run, 1, 'timeout', 6000);
  assert.equal(BulkScan.waitBefore(run, 6000), 10000, 'a page that failed was visited too');
  BulkScan.skip(run, 2, 'scope', 50000);
  assert.equal(BulkScan.waitBefore(run, 16000), 0, 'a page skipped for its site was never opened');
  assert.equal(BulkScan.waitBefore(make(0), 0), 0);
  assert.equal(BulkScan.waitBefore(null), 0);
  assert.equal(JSON.parse(BulkScan.build(run, { format: 'json' }).text).run.delaySec, 10, 'the JSON export says it');
});
