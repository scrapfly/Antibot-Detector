'use strict';
// Statistics export: the file name, the time zone, what the summary leaves out, and a dismissed Save As.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const HistoryStats = require('../sections/stats/history-stats.js');
const StatsExport = require('../sections/stats/stats-export.js');

const now = new Date(2026, 9, 3, 12).getTime();
const visit = (overrides = {}) => ({ timestamp: now, hostname: 'example.com', detections: [], ...overrides });

test('the file name carries the range and the local calendar day', () => {
  assert.equal(StatsExport.filename('csv', { days: 7, now }), 'scrapfly-history-statistics-7d-2026-10-03.csv');
  assert.equal(StatsExport.filename('json', { days: 30, now }), 'scrapfly-history-statistics-30d-2026-10-03.json');
  assert.equal(StatsExport.filename('csv', { days: 90, now }), 'scrapfly-history-statistics-90d-2026-10-03.csv');
  assert.equal(StatsExport.filename('json', { days: 0, now }), 'scrapfly-history-statistics-all-2026-10-03.json');
  assert.equal(StatsExport.filename('csv', { now }), 'scrapfly-history-statistics-30d-2026-10-03.csv', 'a missing range is the default 30 days');
  assert.throws(() => StatsExport.filename('csv', { days: 1.5, now }), /time range/);
  assert.throws(() => StatsExport.filename('pdf', { days: 7, now }), /Unsupported/);
});

test('the file name day is the local one, not the UTC one', () => {
  const script = `
    const assert = require('node:assert/strict');
    const E = require('./sections/stats/stats-export');
    const pad = (n) => String(n).padStart(2, '0');
    for (const [h, m] of [[23, 30], [0, 30], [12, 0], [0, 0], [23, 59]]) {
      const now = new Date(2026, 9, 3, h, m).getTime();
      assert.equal(E.filename('csv', { days: 7, now }), 'scrapfly-history-statistics-7d-2026-10-03.csv', h + ':' + m);
    }
  `;
  for (const TZ of ['America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Europe/Berlin', 'UTC']) {
    const result = spawnSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(result.status, 0, TZ + ': ' + result.stderr);
  }
});

test('the payload names its time zone next to generatedAt and keeps schema version 1', () => {
  const payload = StatsExport.build([visit()], { days: 30, now });
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  assert.deepEqual(Object.keys(payload), ['schemaVersion', 'generatedAt', 'timeZone', 'range', 'summary', 'entries']);
  assert.equal(StatsExport.build([], { days: 30, now, timeZone: 'Europe/Berlin' }).timeZone, 'Europe/Berlin');
  assert.equal(StatsExport.build([], { days: 30, now, timeZone: '' }).timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  assert.equal(JSON.parse(StatsExport.toJSON(payload)).timeZone, payload.timeZone);
  assert.ok(Object.isFrozen(payload));
});

test('the summary leaves out the dashboard-only lists and the match-level figures', () => {
  const items = [visit({ detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 20, matches: [{ type: 'cookie', value: 'cf=SECRET' }] }] }),
    visit({ detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 20 }] }), visit({ detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 20 }] })];
  const { summary } = StatsExport.build(items, { days: 30, now });
  for (const key of ['methods', 'methodsByCategory', 'totalMatches', 'signalMetrics', 'weakEvidence', 'unconfirmed', 'stackMetrics']) assert.ok(!(key in summary), key);
  for (const key of ['pageTiers', 'confidenceByCategory', 'decidedByCategory', 'timeline', 'detectorMetrics', 'domainMetrics', 'categoryConfidence']) assert.ok(key in summary, key);
  assert.deepEqual(summary.pageTiers, { both: 0, antibot: 3, captcha: 0, none: 0 });
  assert.deepEqual(summary.domainMetrics[0].stack, [{ name: 'Cloudflare', category: 'antibot' }]);
  assert.equal(summary.detectorMetrics[0].weak, 3);
  assert.ok(!StatsExport.toJSON(StatsExport.build(items, { days: 30, now })).includes('SECRET'));
});

test('entries and CSV are exactly what they were', () => {
  const payload = StatsExport.build([visit({ detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 90, matches: [{ type: 'cookie', value: 'a=SECRET' }], combinations: [{ id: 'c1' }] }] })], { days: 30, now });
  assert.deepEqual(JSON.parse(JSON.stringify(payload.entries)), [{ timestamp: new Date(now).toISOString(), hostname: 'example.com', difficulty: 'Medium',
    detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 90, methods: ['cookie'], combinations: ['c1'] }] }]);
  assert.equal(StatsExport.toCSV(payload), 'timestamp,hostname,difficulty,detector,category,confidence,methods,combinations\r\n' + new Date(now).toISOString() + ',example.com,Medium,Cloudflare,antibot,90,cookie,c1\r\n');
});

test('per-domain difficulty in the summary follows the production levels of the entries', () => {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of ['../modules/core/categories.js', '../utils/detection-utils.js', '../sections/stats/history-stats.js', '../sections/stats/stats-export.js']) {
    vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8'), context);
  }
  const input = [
    visit({ hostname: 'high.example', detections: [{ detector: { name: 'Custom fingerprint', category: 'fingerprint', difficulty: 'High' }, confidence: 40 }] }),
    visit({ hostname: 'low.example', detections: [{ detector: { name: 'Custom captcha', category: 'captcha', difficulty: 'Low' }, confidence: 40 }] }),
    visit({ hostname: 'none.example', detections: [] }),
    visit({ hostname: 'high.example', detections: [{ name: 'Other', category: 'fingerprint', confidence: 10 }] })
  ];
  const payload = context.StatsExport.build(input, { days: 30, now });
  const by = (host) => payload.summary.domainMetrics.find((d) => d.hostname === host);
  const level = (host) => payload.entries.filter((e) => e.hostname === host).map((e) => e.difficulty);
  assert.deepEqual(level('high.example'), ['High', 'Low']);
  assert.equal(by('high.example').difficulty, 'High', 'the worst production level over the domain, not the level of the stripped rows');
  assert.equal(by('low.example').difficulty, level('low.example')[0]);
  assert.equal(by('none.example').difficulty, 'None');
  assert.equal(payload.summary.difficulty.High, 1, 'the totals keep following the entries');
});

const browserExport = (download) => {
  const effects = { revoked: [], timers: [] };
  const context = {
    HistoryStats, Blob, chrome: { downloads: { download }, runtime: {} },
    URL: { createObjectURL() { return 'blob:local-export'; }, revokeObjectURL(url) { effects.revoked.push(url); } },
    setTimeout(fn, delay) { effects.timers.push({ fn, delay }); }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../sections/stats/stats-export.js'), 'utf8'), context);
  return { api: context.StatsExport, context, effects };
};

test('dismissing Save As rejects with canceled set, any other failure does not', async () => {
  for (const message of ['User cancelled', 'Download canceled by the user', 'CANCELLED', 'canceled']) {
    const bad = browserExport((args, callback) => { bad.context.chrome.runtime.lastError = { message }; callback(); });
    await assert.rejects(bad.api.download('csv', [], { days: 30, now }), (error) => {
      assert.equal(Object.prototype.toString.call(error), '[object Error]', 'an Error from the page realm');
      assert.equal(error.canceled, true, message);
      assert.equal(error.message, message);
      return true;
    });
    assert.equal(bad.effects.timers[0].delay, 60000, 'the blob is still released');
  }
  for (const message of ['Invalid filename', 'NETWORK_FAILED', '']) {
    const bad = browserExport((args, callback) => { bad.context.chrome.runtime.lastError = { message }; callback(); });
    await assert.rejects(bad.api.download('json', [], { days: 30, now }), (error) => Object.prototype.toString.call(error) === '[object Error]' && error.canceled !== true);
  }
  const good = browserExport((args, callback) => callback(7));
  const result = await good.api.download('csv', [visit()], { days: 7, now });
  assert.deepEqual({ ...result }, { downloadId: 7, filename: 'scrapfly-history-statistics-7d-2026-10-03.csv' });
});

test('a download names the file after the range it was asked for', async () => {
  let request;
  const { api } = browserExport((args, callback) => { request = args; callback(1); });
  await api.download('json', [visit()], { days: 0, now });
  assert.equal(request.filename, 'scrapfly-history-statistics-all-2026-10-03.json');
  await api.download('csv', [visit()], { days: 90, now });
  assert.equal(request.filename, 'scrapfly-history-statistics-90d-2026-10-03.csv');
  assert.equal(request.saveAs, true);
});
