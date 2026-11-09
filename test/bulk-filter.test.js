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
