const { test } = require('node:test');
const assert = require('node:assert/strict');

// History and Statistics: what a stored scan keeps of a match, what retention does with an entry that has no readable date, which
// scans Compare offers, and the formula guard of the CSV export.

global.Categories = require('../modules/core/categories.js');
const HistoryStore = require('../modules/core/history-store.js');
const HistoryStats = require('../sections/stats/history-stats.js');
const HistoryRetention = require('../background/history-retention.js');
const HistoryCompare = require('../modules/core/history-compare.js');
const HistoryExport = require('../modules/core/history-export.js');

const DAY = 86400000;

test('a stored url or payload match keeps the rule\'s pattern beside the address or value, so Statistics names the rule', () => {
  const entry = HistoryStore.slimEntry({ id: 'e', url: 'https://shop.example/', hostname: 'shop.example', timestamp: 1, detections: [{
    detector: { name: 'Akamai' }, category: 'antibot', confidence: 90, matches: [
      { type: 'url', fullUrl: 'https://shop.example/akam/11/aa11bb22', pattern: '/akam/\\d+/[0-9a-f]{8}', confidence: 90 },
      { type: 'payload', value: 'sensor_data=abc', pattern: 'sensor_data', confidence: 80 },
      { type: 'cookie', name: '_abck', value: '_abck=x', pattern: '_abck', confidence: 70 }
    ] }] });
  const [url, payload, cookie] = entry.detections[0].matches;
  assert.equal(url.fullUrl, 'https://shop.example/akam/11/aa11bb22');
  assert.equal(url.pattern, '/akam/\\d+/[0-9a-f]{8}');
  assert.equal(payload.pattern, 'sensor_data');
  assert.ok(!('pattern' in cookie), 'a cookie is named by its own name');
  // Five pages, one rule: one signal row, not one per address
  const label = HistoryStats.signalLabel;
  assert.equal(label(url), '/akam/\\d+/[0-9a-f]{8}');
  assert.equal(label(payload), 'sensor_data');
  const long = HistoryStore.slimEntry({ id: 'l', detections: [{ detector: { name: 'X' }, matches: [{ type: 'url', value: 'https://a/', pattern: 'p'.repeat(500) }] }] });
  assert.ok(long.detections[0].matches[0].pattern.length <= 161, 'the pattern is clipped');
});

test('an entry with no readable date is kept by auto-delete, one with an old date is not', () => {
  const now = Date.UTC(2026, 10, 4);
  const items = [
    { id: 'no-date', timestamp: 0 }, { id: 'text', timestamp: 'never' }, { id: 'missing' },
    { id: 'old-number', timestamp: now - 90 * DAY }, { id: 'old-text', timestamp: String(now - 90 * DAY) }, { id: 'new', timestamp: now - DAY }
  ];
  const { items: kept } = HistoryRetention.prune(items, { autoDelete: true, days: 30, limit: 0 }, now);
  assert.deepEqual(kept.map(item => item.id), ['no-date', 'text', 'missing', 'new']);
});

test('an imported date written as milliseconds in text is a date, not "no date"', () => {
  const clean = HistoryStore.cleanImported([{ id: 'a', timestamp: '1730000000000', detections: [] }, { id: 'b', timestamp: 'garbage', detections: [] }]);
  const merged = HistoryStore.applyImport([], clean, 'replace', 0);
  assert.deepEqual(merged.map(item => item.id), ['a', 'b'], 'the dated one is newer than the undated');
});

test('Compare offers the scans of this page, not scans served from the cache that may hold another page\'s result', () => {
  const at = Date.UTC(2026, 9, 19, 9);
  const e = (id, hour, extra = {}) => ({ id, url: 'https://shop.example/b', hostname: 'shop.example', timestamp: at + hour * 3600000, detections: [], ...extra });
  const items = [e('now', 3), e('cached', 2, { fromCache: true }), e('scan', 1), e('older', 0)];
  assert.deepEqual(HistoryCompare.others(items, items[0]).map(item => item.id), ['scan', 'older']);
});

test('the History CSV guards a formula after leading spaces, as the Statistics CSV does', () => {
  const built = HistoryExport.build([{ id: 'x', url: 'https://a.example/', hostname: 'a.example', title: '  =1+1', note: '=cmd', timestamp: Date.UTC(2026, 10, 4), detections: [] }], { format: 'csv' });
  assert.match(built.text, /"?'  =1\+1/, 'the title starts with an apostrophe');
  assert.match(built.text, /'=cmd/);
  const plain = HistoryExport.build([{ id: 'y', url: 'https://a.example/', hostname: 'a.example', title: 'Plain title', timestamp: Date.UTC(2026, 10, 4), detections: [] }], { format: 'csv' });
  assert.ok(!/'Plain/.test(plain.text));
});

test('Statistics does not read two ports of one host as one page: no "replaced" row between two apps', () => {
  const at = Date.UTC(2026, 10, 3);
  const scan = (url, name, hours) => ({ id: `${url}${hours}`, url, hostname: 'localhost', timestamp: at + hours * 3600000,
    detections: [{ detector: { name }, name, category: 'antibot', confidence: 95 }] });
  const apps = [scan('http://localhost:3000/', 'Cloudflare', 0), scan('http://localhost:8080/', 'DataDome', 1)];
  const changes = HistoryStats.protectionChanges(apps, { now: at + 5 * 3600000, since: 0 });
  assert.equal(changes.count, 0, JSON.stringify(changes));
  // The same app scanned twice still compares
  const same = [scan('http://localhost:3000/', 'Cloudflare', 0), scan('http://localhost:3000/', 'DataDome', 1)];
  const replaced = HistoryStats.protectionChanges(same, { now: at + 5 * 3600000, since: 0 });
  assert.equal(replaced.count, 1);
  assert.equal(replaced.rows[0].kind, 'replaced');
});
