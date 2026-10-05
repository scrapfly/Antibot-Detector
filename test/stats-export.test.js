'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const HistoryStats = require('../sections/stats/history-stats.js');
const StatsExport = require('../sections/stats/stats-export.js');
const now = new Date(2026, 9, 3, 12).getTime();
const options = { days: 30, now };
const visit = (overrides = {}) => ({ timestamp: now, hostname: 'example.com', detections: [], ...overrides });

test('exports only normalized allowlisted fields without mutating input', () => {
  const input = [visit({ url: 'https://example.com/path?token=SECRET', cookies: 'SECRET', settings: { token: 'SECRET' },
    detections: [{ detector: { name: '防护', category: 'CAPTCHA', rules: 'SECRET' }, confidence: 95, matches: 'SECRET', content: 'SECRET' }] })];
  const before = JSON.stringify(input);
  const payload = StatsExport.build(input, options);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(payload.entries[0], { timestamp: new Date(now).toISOString(), hostname: 'example.com', difficulty: 'High',
    detections: [{ name: '防护', category: 'captcha', confidence: 95 }] });
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.generatedAt, new Date(now).toISOString());
  assert.ok(!StatsExport.toJSON(payload).includes('SECRET'));
  assert.deepEqual(JSON.parse(StatsExport.toJSON(payload)), payload);
  assert.ok(Object.isFrozen(payload));
  assert.ok(Object.isFrozen(payload.entries[0].detections[0]));
  assert.ok(Object.isFrozen(payload.summary));
  assert.throws(() => { payload.entries.push(visit()); }, TypeError);
  assert.equal(Object.isFrozen(input[0]), false);
});

test('range dates and membership agree with analytics, empty range has header only', () => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 29);
  const input = [visit({ timestamp: start.getTime() - 1 }), visit({ timestamp: start.getTime() }), visit(), visit({ timestamp: now + 1 })];
  const payload = StatsExport.build(input, options);
  assert.equal(payload.range.start, start.toISOString());
  assert.equal(payload.range.end, new Date(now).toISOString());
  assert.equal(payload.entries.length, HistoryStats.filterByRange(input, 30, now).length);
  assert.deepEqual(payload.entries.map((row) => row.timestamp), [start.toISOString(), new Date(now).toISOString()]);
  assert.equal(StatsExport.toCSV(StatsExport.build([], options)), 'timestamp,hostname,difficulty,detector,category,confidence\r\n');
  assert.equal(StatsExport.build([visit({ timestamp: 'invalid' })], { days: 0, now }).entries[0].timestamp, null);
  assert.equal(StatsExport.build([], { days: 0, now }).range.start, null);
});

test('invalid confidence is null, valid numeric zero and decimals stay accurate', () => {
  const scores = [null, undefined, '', '  ', false, true, NaN, Infinity, -1, 101, {}, 0, 100, 92.5, '80'];
  const payload = StatsExport.build([visit({ detections: scores.map((confidence) => ({ name: 'Detector', confidence })) })], options);
  assert.deepEqual(payload.entries[0].detections.map((d) => d.confidence), [null, null, null, null, null, null, null, null, null, null, null, 0, 100, 92.5, null]);
  assert.match(StatsExport.toCSV(payload), /Detector,other,92\.5\r\n/);
});

test('CSV flattens visits, preserves Unicode and quotes commas, newlines and double quotes', () => {
  const payload = StatsExport.build([visit({ hostname: '例子.com', detections: [
    { name: 'A,"B"\n防护', category: 'captcha', confidence: 0 }, { name: 'Second', confidence: 100 }
  ] }), visit({ hostname: 'empty.example' })], options);
  const csv = StatsExport.toCSV(payload);
  assert.ok(csv.includes('例子.com,High,"A,""B""\n防护",captcha,0\r\n'));
  assert.ok(csv.includes('例子.com,High,Second,other,100\r\n'));
  assert.ok(csv.endsWith('empty.example,None,,,\r\n'));
});

test('CSV neutralizes formulas after whitespace, tabs and newline prefixes', () => {
  for (const text of ['=1+1', '+SUM(1)', '-1+1', '@SUM(1)', '  =1', '\t=1', '\r\n@SUM(1)']) {
    const payload = { entries: [{ timestamp: null, hostname: text, difficulty: 'Medium', detections: [{ name: text, category: 'other', confidence: 75 }] }] };
    const csv = StatsExport.toCSV(payload);
    assert.ok(csv.includes("'" + text), text);
    assert.ok(csv.endsWith(',other,75\r\n'));
    assert.equal(payload.entries[0].hostname, text);
  }
});

test('JSON includes all aggregates beyond dashboard top eight and hostname only from URL', () => {
  const input = Array.from({ length: 15 }, (_, i) => visit({ hostname: '', url: `https://site${i}.example/path?secret=PRIVATE`, detections: [{ name: `Detector ${i}`, confidence: 90 }] }));
  const payload = StatsExport.build(input, options);
  assert.equal(payload.summary.topDomains.length, 15);
  assert.equal(payload.summary.topDetectors.length, 15);
  assert.equal(payload.entries.length, 15);
  assert.ok(!StatsExport.toJSON(payload).includes('PRIVATE'));
  assert.equal(payload.entries[0].hostname, 'site0.example');
});

test('malformed rows and sensitive hostname paths never leak into exports', () => {
  const payload = StatsExport.build([null, false, [], visit({ hostname: 'https://example.com/private?token=SECRET',
    detections: [null, false, [], { detector: { id: 'nested-id', type: 'Fingerprint' }, confidence: 88 }] }),
    visit({ hostname: 'example.org/path?token=SECRET' })], options);
  assert.equal(payload.entries.length, 2);
  assert.equal(payload.entries[0].hostname, 'example.com');
  assert.equal(payload.entries[1].hostname, 'example.org');
  assert.deepEqual(payload.entries[0].detections, [{ name: 'nested-id', category: 'fingerprint', confidence: 88 }]);
  assert.ok(!StatsExport.toJSON(payload).includes('SECRET'));
  assert.ok(!StatsExport.toJSON(payload).includes('https://'));
});

test('filename and invalid options are predictable', () => {
  assert.equal(StatsExport.filename('csv', options), 'scrapfly-history-statistics-2026-10-03.csv');
  assert.equal(StatsExport.filename('json', options), 'scrapfly-history-statistics-2026-10-03.json');
  assert.throws(() => StatsExport.filename('xml', options), /Unsupported/);
  for (const days of [-1, NaN, Infinity, '30', 1.5]) assert.throws(() => StatsExport.build([], { days, now }), /time range/);
  for (const invalid of [null, 'today', Infinity, 9e20]) assert.throws(() => StatsExport.build([], { now: invalid }), /reference time/);
});

test('production DetectionUtils custom difficulty matches dashboard in entries, CSV and JSON summary', () => {
  const context = { window: {} };
  vm.createContext(context);
  for (const file of ['../utils/detection-utils.js', '../sections/stats/history-stats.js', '../sections/stats/stats-export.js']) {
    vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8'), context);
  }
  const input = [visit({ hostname: 'high.example', detections: [{ detector: { name: 'Custom fingerprint', category: 'fingerprint',
    difficulty: 'High', rules: { token: 'SECRET' } }, confidence: 40, matches: 'SECRET' }] }),
    visit({ hostname: 'low.example', detections: [{ detector: { name: 'Custom captcha', category: 'captcha', difficulty: 'Low' }, confidence: 40 }] })];
  const before = JSON.stringify(input);
  const payload = context.StatsExport.build(input, options);
  const dashboard = vm.runInContext('HistoryStats', context).compute(input, options);
  assert.equal(payload.entries[0].difficulty, 'High');
  assert.equal(payload.entries[1].difficulty, 'Low');
  assert.deepEqual(JSON.parse(JSON.stringify(payload.summary.difficulty)), JSON.parse(JSON.stringify(dashboard.difficulty)));
  const csv = context.StatsExport.toCSV(payload);
  assert.ok(csv.includes('high.example,High,Custom fingerprint,fingerprint,40'));
  assert.ok(csv.includes('low.example,Low,Custom captcha,captcha,40'));
  const json = context.StatsExport.toJSON(payload);
  assert.ok(!json.includes('SECRET'));
  assert.deepEqual(Object.keys(JSON.parse(json).entries[0].detections[0]), ['name', 'category', 'confidence']);
  assert.equal(JSON.stringify(input), before);
});

const browserExport = (download) => {
  const effects = { revoked: [], timers: [], blobs: [] };
  const context = {
    HistoryStats, Blob, chrome: { downloads: { download }, runtime: {} },
    URL: { createObjectURL(blob) { effects.blobs.push(blob); return 'blob:local-export'; }, revokeObjectURL(url) { effects.revoked.push(url); } },
    setTimeout(fn, delay) { effects.timers.push({ fn, delay }); }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../sections/stats/stats-export.js'), 'utf8'), context);
  return { api: context.StatsExport, context, effects };
};

test('mock Chrome download API uses UTF-8 CSV BOM bytes and delayed revocation', async () => {
  let request;
  const { api, effects } = browserExport((args, callback) => { request = args; callback(42); });
  const result = await api.download('csv', [visit({ hostname: '例子.com' })], options);
  assert.equal(result.downloadId, 42);
  assert.equal(request.saveAs, true);
  assert.equal(request.filename, 'scrapfly-history-statistics-2026-10-03.csv');
  assert.equal(request.url, 'blob:local-export');
  assert.equal(effects.blobs[0].type, 'text/csv;charset=utf-8');
  assert.equal(await effects.blobs[0].text(), api.toCSV(api.build([visit({ hostname: '例子.com' })], options)));
  const bytes = new Uint8Array(await effects.blobs[0].arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xEF, 0xBB, 0xBF]);
  assert.equal(new TextDecoder().decode(bytes.slice(3)), api.toCSV(api.build([visit({ hostname: '例子.com' })], options)));
  assert.equal(effects.revoked.length, 0);
  assert.equal(effects.timers[0].delay, 60000);
  effects.timers[0].fn();
  assert.deepEqual(effects.revoked, ['blob:local-export']);
});

test('mock Chrome JSON downloads and errors reject gracefully and still revoke', async () => {
  const good = browserExport((args, callback) => callback(1));
  await good.api.download('json', [], options);
  assert.equal(good.effects.blobs[0].type, 'application/json;charset=utf-8');
  assert.equal(JSON.parse(await good.effects.blobs[0].text()).schemaVersion, 1);
  const bad = browserExport((args, callback) => { bad.context.chrome.runtime.lastError = { message: 'User cancelled' }; callback(); });
  await assert.rejects(bad.api.download('json', [], options), /User cancelled/);
  assert.equal(bad.effects.timers.length, 1);
  const thrown = browserExport(() => { throw new Error('Unavailable'); });
  await assert.rejects(thrown.api.download('csv', [], options), /Unavailable/);
  assert.equal(thrown.effects.timers.length, 1);
  const missing = browserExport((args, callback) => callback());
  await assert.rejects(missing.api.download('csv', [], options), /not started/);
  await assert.rejects(StatsExport.download('csv', [], options), /unavailable/);
});
