const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BulkFilter = require('../modules/core/bulk-filter.js');
const BulkScan = require('../modules/core/bulk-scan.js');

const run = () => ({
  status: 'done', timeoutSec: 45,
  items: [
    { url: 'https://a.example/', status: 'done', detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 90 }] },
    { url: 'https://b.example/', status: 'done', detections: [] },
    { url: 'https://c.example/', status: 'failed', reason: 'timeout' },
    { url: 'https://d.example/', status: 'skipped', reason: 'scope' },
    { url: 'https://e.example/', status: 'waiting' }
  ]
});
const urls = (r) => r.items.map(i => i.url[8]);

test('each filter keeps the pages of its outcome', () => {
  assert.deepEqual(urls(BulkFilter.apply(run(), 'found')), ['a']);
  assert.deepEqual(urls(BulkFilter.apply(run(), 'clear')), ['b']);
  assert.deepEqual(urls(BulkFilter.apply(run(), 'problem')), ['c', 'd']);
  assert.deepEqual(urls(BulkFilter.apply(run(), 'all')), ['a', 'b', 'c', 'd', 'e']);
});

test('an unknown filter shows everything and apply leaves the run itself alone', () => {
  const original = run();
  assert.equal(BulkFilter.normalize('nope'), 'all');
  assert.equal(BulkFilter.apply(original, 'nope'), original);
  BulkFilter.apply(original, 'found');
  assert.equal(original.items.length, 5);
  assert.equal(BulkFilter.apply(null, 'found'), null);
});

test('a filtered run exports only its pages', () => {
  const out = BulkScan.build(BulkFilter.apply(run(), 'problem'), { format: 'csv' });
  assert.ok(out.text.includes('https://c.example/') && out.text.includes('https://d.example/'));
  assert.ok(!out.text.includes('https://a.example/'));
});

test('a page that is waiting belongs to no outcome filter, and a bad item to none', () => {
  for (const f of ['found', 'clear', 'problem']) assert.equal(BulkFilter.matches({ status: 'waiting' }, f), false);
  assert.equal(BulkFilter.matches(null, 'all'), false);
});

test('the bulk page loads the filter before its own script', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sections/bulk/bulk.html'), 'utf8');
  const filter = html.indexOf('modules/core/bulk-filter.js');
  assert.ok(filter > -1 && filter < html.indexOf('src="bulk.js"'));
});

// 3.1.9: Error status and one filter per protection the run found
const mixed = () => ({
  status: 'done', timeoutSec: 45,
  items: [
    { url: 'https://a.example/', status: 'done', httpStatus: 403, detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 90 }] },
    { url: 'https://b.example/', status: 'done', httpStatus: 200, detections: [{ name: 'DataDome', category: 'antibot', confidence: 90 }, { name: 'reCAPTCHA', category: 'captcha', confidence: 80 }] },
    { url: 'https://c.example/', status: 'done', httpStatus: 503, detections: [] },
    { url: 'https://d.example/', status: 'done', detections: [{ name: 'cloudflare', category: 'antibot', confidence: 70 }] },
    { url: 'https://e.example/', status: 'failed', reason: 'timeout', httpStatus: 500 },
    { url: 'https://f.example/', status: 'waiting' }
  ]
});

test('Error status keeps the scanned pages that answered 4xx or 5xx; a page with no known status is not one of them', () => {
  assert.deepEqual(urls(BulkFilter.apply(mixed(), 'httpError')), ['a', 'c']);
  assert.equal(BulkFilter.normalize('httpError'), 'httpError');
  assert.ok(BulkFilter.FILTERS.includes('httpError'));
});

test('a protection\'s filter keeps the scanned pages where it was found, under any spelling the run totals group', () => {
  const only = BulkFilter.forProtection('Cloudflare');
  assert.equal(only, 'protection:Cloudflare');
  assert.equal(BulkFilter.protectionOf(only), 'Cloudflare');
  assert.deepEqual(urls(BulkFilter.apply(mixed(), only)), ['a', 'd'], 'Cloudflare and cloudflare are one protection');
  assert.deepEqual(urls(BulkFilter.apply(mixed(), BulkFilter.forProtection('reCAPTCHA'))), ['b']);
  assert.deepEqual(urls(BulkFilter.apply(mixed(), BulkFilter.forProtection('Akamai'))), [], 'one the run never found: no page');
  // Every name the totals list has a filter that keeps exactly the pages it counts
  for (const row of BulkScan.protectionTotals(mixed())) {
    assert.equal(BulkFilter.apply(mixed(), BulkFilter.forProtection(row.name)).items.length, row.pages, row.name);
  }
});

test('a remembered choice is read back as it was, and anything else is all pages', () => {
  assert.equal(BulkFilter.normalize('protection:DataDome'), 'protection:DataDome');
  assert.equal(BulkFilter.normalize('protection:  DataDome '), 'protection:DataDome');
  for (const junk of ['protection:', 'protection:   ', `protection:${'x'.repeat(201)}`, 'Protection:DataDome', null, 7]) assert.equal(BulkFilter.normalize(junk), 'all', String(junk));
  assert.equal(BulkFilter.forProtection(''), 'all');
  assert.equal(BulkFilter.protectionOf('found'), '');
});

test('exports and Copy as lines follow the new filters too', () => {
  const csv = BulkScan.build(BulkFilter.apply(mixed(), 'httpError'), { format: 'csv' }).text;
  assert.ok(csv.includes('https://a.example/') && csv.includes('https://c.example/') && !csv.includes('https://b.example/'));
  const lines = BulkScan.oneLines(BulkFilter.apply(mixed(), BulkFilter.forProtection('DataDome')));
  assert.equal(lines.split('\n').length, 1);
  assert.ok(lines.startsWith('https://b.example/'));
});
