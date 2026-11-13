const { test } = require('node:test');
const assert = require('node:assert/strict');

// 3.2.0 Bulk scan: a run compared with the earlier run of the same list (BulkScan.diff), the finished runs the worker keeps for
// that and for the page after a browser restart (BulkRuns), and a CSV's other columns kept with the results (readList, exports).

const BulkScan = require('../modules/core/bulk-scan.js');
const BulkRuns = require('../modules/core/bulk-runs.js');
const BulkFilter = require('../modules/core/bulk-filter.js');

const d = (name, confidence = 90, category = 'antibot') => ({ name, category, confidence });
const page = (url, detections = [], extra = {}) => ({ url, status: 'done', detections, finishedAt: 1000, ...extra });
const run = (items, extra = {}) => ({ id: `bulk_${Math.random()}`, status: 'done', startedAt: 1, finishedAt: 2, timeoutSec: 45, delaySec: 0, cap: 200, items, ...extra });

/* ---------- diff ---------- */

test('diff: protections added and removed by name, a confidence that moved, an HTTP status and an outcome that changed', () => {
  const prev = run([
    page('https://a.example/', [d('Kasada'), d('Cloudflare', 70)], { httpStatus: 200 }),
    page('https://b.example/', [d('reCAPTCHA', 80)]),
    page('https://c.example/', []),
    { url: 'https://e.example/', status: 'failed', reason: 'timeout' }
  ]);
  const next = run([
    page('https://a.example/', [d('DataDome'), d('cloudflare', 95)], { httpStatus: 403 }),
    page('https://b.example/', [d('reCAPTCHA', 80)]),
    { url: 'https://c.example/', status: 'failed', reason: 'load' },
    page('https://d.example/', []),
    page('https://e.example/', []),
    { url: 'https://f.example/', status: 'waiting' }
  ]);
  const result = BulkScan.diff(prev, next);
  assert.equal(result.compared, 5, 'a page still waiting has nothing to compare yet');
  assert.equal(result.changed, 4);
  const a = BulkScan.diffOf(result, next.items[0]);
  assert.deepEqual(a.added.map(x => x.name), ['DataDome']);
  assert.deepEqual(a.removed.map(x => x.name), ['Kasada']);
  assert.deepEqual(a.confidence, [{ name: 'cloudflare', from: 70, to: 95 }], 'one protection under two spellings is one');
  assert.deepEqual(a.http, { from: 200, to: 403 });
  assert.equal(BulkScan.diffText(a), '+DataDome −Kasada · cloudflare 70% → 95% · 200 → 403');
  assert.equal(BulkScan.diffOf(result, next.items[1]).changed, false);
  assert.equal(BulkScan.diffText(BulkScan.diffOf(result, next.items[1])), 'unchanged');
  const c = BulkScan.diffOf(result, next.items[2]);
  assert.deepEqual(c.status, { from: 'done', to: 'failed' });
  assert.deepEqual([c.added, c.removed], [[], []], 'a page that failed has no protections, not none found');
  assert.equal(BulkScan.diffText(c, { status: (s) => s.toUpperCase() }), 'DONE → FAILED');
  assert.equal(BulkScan.diffOf(result, next.items[3]).inPrevious, false);
  assert.equal(BulkScan.diffText(BulkScan.diffOf(result, next.items[3]), { new: 'new' }), 'new');
  assert.equal(BulkScan.diffOf(result, next.items[5]), undefined);
  assert.equal(BulkScan.diff(null, next), null);
});

test('diff matches pages by their address as it is scanned: a bare host, a #fragment and an empty query are the same page', () => {
  const prev = run([page('a.example', [d('Akamai')]), page('https://b.example/x#top', [])]);
  const next = run([page('https://a.example/', [d('Akamai')]), page('https://b.example/x?', [])]);
  const result = BulkScan.diff(prev, next);
  assert.equal(result.changed, 0);
  assert.ok(next.items.every(item => BulkScan.diffOf(result, item).inPrevious));
});

test('a status code only one of the two runs knew is no change', () => {
  const result = BulkScan.diff(run([page('https://a.example/', [])]), run([page('https://a.example/', [], { httpStatus: 200 })]));
  assert.equal(result.changed, 0);
});

test('Show → Changed since previous run keeps the changed pages and those the earlier run did not have; with no comparison, none', () => {
  const prev = run([page('https://a.example/', [d('Kasada')]), page('https://b.example/', [])]);
  const next = run([page('https://a.example/', []), page('https://b.example/', []), page('https://c.example/', [])]);
  const compare = BulkScan.diff(prev, next);
  assert.ok(BulkFilter.FILTERS.includes('changed'));
  assert.deepEqual(BulkFilter.apply(next, 'changed', { compare }).items.map(i => i.url), ['https://a.example/', 'https://c.example/']);
  assert.deepEqual(BulkFilter.apply(next, 'changed').items, []);
  assert.equal(BulkFilter.normalize('changed'), 'changed');
});

/* ---------- exports with the comparison ---------- */

test('the exports carry the change: a vs_previous column at the end of the CSV, previous per page in JSON, a column in Markdown', () => {
  const prev = run([page('https://a.example/', [d('Kasada')], { httpStatus: 200 })], { startedAt: Date.UTC(2026, 10, 1), finishedAt: Date.UTC(2026, 10, 1, 1) });
  const next = run([page('https://a.example/', [d('DataDome')], { httpStatus: 403 })]);
  const compare = BulkScan.diff(prev, next);
  const csv = BulkScan.build(next, { format: 'csv', compare }).text.split('\r\n');
  assert.equal(csv[0], 'url,status,reason,final_url,difficulty,protection,category,confidence,scanned_at,http_status,vs_previous');
  // Text that starts with + is kept as text in a spreadsheet, like every other cell of the CSV
  assert.ok(csv[1].endsWith(",403,'+DataDome \u2212Kasada \u00b7 200 \u2192 403"), csv[1]);
  const json = JSON.parse(BulkScan.build(next, { format: 'json', compare, now: 5 }).text);
  assert.equal(json.run.comparedWith.finishedAt, '2026-11-01T01:00:00.000Z');
  assert.deepEqual(json.pages[0].previous.added, ['DataDome']);
  assert.deepEqual(json.pages[0].previous.httpStatus, { from: 200, to: 403 });
  const md = BulkScan.build(next, { format: 'md', compare }).text;
  assert.match(md, /\| Page \| Status \| Difficulty \| Protections \| Vs previous run \|/);
  assert.match(md, /\+DataDome −Kasada/);
  // Without a comparison the exports are as before
  assert.equal(BulkScan.build(next, { format: 'csv' }).text.split('\r\n')[0], 'url,status,reason,final_url,difficulty,protection,category,confidence,scanned_at,http_status');
  assert.equal(JSON.parse(BulkScan.build(next, { format: 'json' }).text).pages[0].previous, undefined);
});

/* ---------- the person's other CSV columns ---------- */

test('readList keeps a CSV header and the other cells of each row; linesOf still gives the addresses only', () => {
  const text = 'id,url,owner,note\n1,https://a.example/,Ann,"big, shop"\n2,b.example,Bob,\n';
  const list = BulkScan.readList(text);
  assert.deepEqual(list.addresses, ['https://a.example/', 'b.example']);
  assert.deepEqual(BulkScan.linesOf(text), list.addresses);
  assert.deepEqual(list.columns, ['id', 'owner', 'note']);
  assert.deepEqual(list.rows.map(r => r.cells), [['1', 'Ann', 'big, shop'], ['2', 'Bob', '']]);
  const extras = BulkScan.extrasOf(list);
  assert.deepEqual(extras.rows, { 'https://a.example/': ['1', 'Ann', 'big, shop'], 'https://b.example/': ['2', 'Bob', ''] }, 'keyed by the address as it is scanned');
});

test('a table without a header names its columns by place; a plain list has no other columns', () => {
  const list = BulkScan.readList('https://a.example/\tShop A\nhttps://b.example/\tShop B');
  assert.deepEqual(list.columns, ['column_2']);
  assert.deepEqual(BulkScan.readList('https://a.example/\nhttps://b.example/, Shop B').columns, []);
  assert.equal(BulkScan.extrasOf(BulkScan.readList('https://a.example/')), null);
});

test('the other columns are bounded: at most 10 columns, 200 characters a cell, 60 a column name', () => {
  const header = ['url', ...Array.from({ length: 14 }, (_, i) => `${'h'.repeat(80)}${i}`)].join(',');
  const row = ['https://a.example/', ...Array.from({ length: 14 }, () => 'x'.repeat(500))].join(',');
  const list = BulkScan.readList(`${header}\n${row}`);
  assert.equal(list.columns.length, BulkScan.MAX_EXTRA_COLUMNS);
  assert.ok(list.columns.every(name => name.length <= BulkScan.MAX_HEADER));
  assert.ok(list.rows[0].cells.every(cell => cell.length <= BulkScan.MAX_CELL));
  // What the worker is handed is checked again, whoever sent it
  const clean = BulkScan.cleanExtras({ columns: Array(30).fill('c'), rows: { 'https://a.example/': [{ evil: 1 }, 'y'.repeat(999)], bad: 'x' } });
  assert.equal(clean.columns.length, BulkScan.MAX_EXTRA_COLUMNS);
  assert.deepEqual(clean.rows['https://a.example/'].slice(0, 2), ['', 'y'.repeat(BulkScan.MAX_CELL)]);
  assert.equal(clean.rows.bad, undefined);
  assert.equal(BulkScan.cleanExtras({ columns: 'x', rows: {} }), null);
});

test('the other columns come back after http_status in the CSV (formulas kept as text), and in the JSON and Markdown exports', () => {
  const r = BulkScan.createRun(BulkScan.prepare(['https://a.example/', 'https://b.example/']), { now: 1 });
  BulkScan.attachExtras(r, { columns: ['owner', '=total'], rows: { 'https://a.example/': ['=HYPERLINK("x")', '+1'] } });
  assert.deepEqual(r.items.map(i => i.extra), [['=HYPERLINK("x")', '+1'], ['', '']], 'a page the list did not give gets empty cells');
  const csv = BulkScan.build(r, { format: 'csv' }).text.split('\r\n');
  assert.equal(csv[0], "url,status,reason,final_url,difficulty,protection,category,confidence,scanned_at,http_status,owner,'=total");
  assert.ok(csv[1].endsWith(`,"'=HYPERLINK(""x"")",'+1`), csv[1]);
  const json = JSON.parse(BulkScan.build(r, { format: 'json', now: 1 }).text);
  assert.deepEqual(json.run.columns, ['owner', '=total']);
  assert.deepEqual(json.pages[0].extra, ['=HYPERLINK("x")', '+1']);
  assert.match(BulkScan.build(r, { format: 'md' }).text, /\| Page \| Status \| Difficulty \| Protections \| owner \| =total \|/);
  assert.deepEqual(BulkScan.extrasOfRun(r).rows['https://a.example/'], ['=HYPERLINK("x")', '+1']);
});

/* ---------- the kept runs ---------- */

test('a list is the set of its pages, in any order; skipped lines are not part of it', () => {
  const a = run([page('https://a.example/'), page('https://b.example/'), { url: 'mailto:x', status: 'skipped', reason: 'scheme' }]);
  const b = run([page('b.example'), { url: 'https://a.example/', status: 'failed', reason: 'load' }]);
  assert.equal(BulkRuns.listKey(a), BulkRuns.listKey(b));
  assert.notEqual(BulkRuns.listKey(a), BulkRuns.listKey(run([page('https://a.example/')])));
  assert.equal(BulkRuns.listKey(run([{ url: 'x', status: 'skipped', reason: 'invalid' }])), '');
});

test('what is kept of a run: addresses, outcomes, protection names and confidences, HTTP status, times; no evidence, no CSV cells', () => {
  const kept = BulkRuns.slim(run([page('https://a.example/', [{ name: 'Cloudflare', category: 'antibot', confidence: 90, matches: [{ type: 'cookie', value: 'cf_clearance=secret' }] }],
    { httpStatus: 403, difficulty: 'High', extra: ['private note'], headers: { cookie: 'session=1' } })], { columns: ['note'] }));
  const text = JSON.stringify(kept);
  assert.ok(!/secret|session=1|private note|cookie/.test(text), text);
  assert.deepEqual(kept.items[0], { url: 'https://a.example/', status: 'done', httpStatus: 403, difficulty: 'High', finishedAt: 1000, detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 90 }] });
  assert.equal(kept.columns, undefined);
});

test('remember keeps the last run of each list and the one before it, the list run last first, at most five lists', () => {
  const list1 = [page('https://a.example/')];
  const first = run(list1, { id: 'r1' });
  const second = run([page('https://a.example/', [d('Kasada')])], { id: 'r2' });
  let store = BulkRuns.remember(null, first);
  store = BulkRuns.remember(store, second);
  assert.equal(store.lists.length, 1);
  assert.equal(store.lists[0].latest.id, 'r2');
  assert.equal(store.lists[0].previous.id, 'r1');
  assert.equal(BulkRuns.previousFor(store, second).id, 'r1', 'the run just kept is compared with the one before it');
  assert.equal(BulkRuns.previousFor(store, run(list1, { id: 'r3', status: 'running' })).id, 'r2', 'a new run of the list, with the last one');
  assert.equal(BulkRuns.remember(store, second).lists[0].previous.id, 'r1', 'the same run kept twice keeps the one before it');
  for (let i = 0; i < 7; i++) store = BulkRuns.remember(store, run([page(`https://site${i}.example/`)], { id: `s${i}` }));
  assert.equal(store.lists.length, BulkRuns.MAX_LISTS);
  assert.equal(BulkRuns.latest(store).id, 's6');
  assert.ok(!store.lists.some(entry => entry.latest.id === 'r2'), 'the list run longest ago went first');
});

test('only a run that is done is kept: not one stopped, running, or with no page scanned', () => {
  assert.deepEqual(BulkRuns.remember(null, run([page('https://a.example/')], { status: 'stopped' })).lists, []);
  assert.deepEqual(BulkRuns.remember(null, run([page('https://a.example/')], { status: 'running' })).lists, []);
  assert.deepEqual(BulkRuns.remember(null, run([{ url: 'x', status: 'skipped', reason: 'invalid' }])).lists, []);
});

test('the store stays within its size: lists run longest ago go first, then the earlier run, and a page keeps at most 12 protections', () => {
  // 400 pages (200 scanned and 200 skipped listed is the most a run holds) with long addresses: about 1 MB each
  const many = (id, host) => run(Array.from({ length: 400 }, (_, i) => page(`https://${host}.example/${'p'.repeat(1500)}${i}`,
    Array.from({ length: 30 }, (_, j) => d(`Protection number ${j}`)))), { id });
  let store = null;
  for (let i = 0; i < 5; i++) store = BulkRuns.remember(store, many(`r${i}`, `h${i}`));
  assert.ok(BulkRuns.sizeOf(store) <= BulkRuns.MAX_BYTES, String(BulkRuns.sizeOf(store)));
  assert.equal(store.lists.length, 1);
  assert.equal(store.lists[0].latest.id, 'r4');
  assert.ok(store.lists[0].latest.items.every(item => item.detections.length <= BulkRuns.MAX_DETECTIONS));
  const small = BulkRuns.remember(BulkRuns.remember(null, run([page('https://a.example/')], { id: 'a' }), { maxBytes: 1e9 }), run([page('https://a.example/')], { id: 'b' }), { maxBytes: 300 });
  assert.equal(small.lists[0].latest.id, 'b');
  assert.equal(small.lists[0].previous, undefined, 'the earlier run goes before the last one');
  assert.deepEqual(BulkRuns.normalizeStore({ version: 1, lists: 'junk' }).lists, []);
  assert.deepEqual(BulkRuns.normalizeStore({ version: 9, lists: [] }).lists, []);
});

test('an earlier JSON export is read back to compare with; anything else is refused, and a huge file is capped', () => {
  const r = run([page('https://a.example/', [d('Kasada')], { httpStatus: 200 }), { url: 'https://b.example/', status: 'failed', reason: 'load' }]);
  const exported = BulkScan.build(r, { format: 'json', now: 5 }).text;
  const read = BulkRuns.fromExport(exported);
  assert.equal(read.ok, true);
  assert.deepEqual(read.run.items.map(i => [i.url, i.status, i.httpStatus || null]), [['https://a.example/', 'done', 200], ['https://b.example/', 'failed', null]]);
  assert.equal(BulkScan.diff(read.run, run([page('https://a.example/', [], { httpStatus: 403 })])).changed, 1);
  assert.deepEqual(BulkRuns.fromExport('not json'), { ok: false, error: 'invalid' });
  assert.deepEqual(BulkRuns.fromExport(JSON.stringify({ type: 'scrapfly-backup', pages: [] })), { ok: false, error: 'invalid' });
  assert.deepEqual(BulkRuns.fromExport(JSON.stringify({ type: 'bulk-scan', pages: [{ nope: 1 }, 5] })), { ok: false, error: 'empty' });
  assert.deepEqual(BulkRuns.fromExport(' '.repeat(BulkRuns.MAX_IMPORT_CHARS + 1)), { ok: false, error: 'large' });
  const big = JSON.stringify({ type: 'bulk-scan', pages: Array.from({ length: 3000 }, (_, i) => ({ url: `https://a.example/${i}`, status: 'done', detections: [{ name: 'x'.repeat(500), confidence: 'high' }] })) });
  const capped = BulkRuns.fromExport(big).run;
  assert.equal(capped.items.length, BulkRuns.MAX_ITEMS);
  assert.ok(capped.items[0].detections[0].name.length <= 100);
  assert.equal(capped.items[0].detections[0].confidence, null);
});
