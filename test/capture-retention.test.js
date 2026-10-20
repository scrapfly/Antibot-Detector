const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// How long Advanced keeps a capture is written once, in modules/core/capture-retention.js. The worker, the Advanced
// footer and Settings each had their own reader and disagreed about a value outside the limits.

const CaptureRetention = require('../modules/core/capture-retention.js');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const english = JSON.parse(read('_locales/en/messages.json'));
const tr = (key, fallback) => (english[key] ? english[key].message : fallback);

test('the default and the limits', () => {
  assert.strictEqual(CaptureRetention.DEFAULT_MINUTES, 30);
  assert.strictEqual(CaptureRetention.MIN_MINUTES, 1);
  assert.strictEqual(CaptureRetention.MAX_MINUTES, 7 * 24 * 60);
});

test('minutesOf(): a usable number in range stays, a larger one is a week, anything else is the default', () => {
  const cases = new Map([[1, 1], [15, 15], [90, 90], ['45', 45], [10080, 10080], [10081, 10080], [20000, 10080], [12.6, 13], [Infinity, 30],
    [undefined, 30], [null, 30], ['', 30], ['abc', 30], [NaN, 30], [0, 30], [0.4, 30], [-5, 30], [{}, 30], [[], 30], [true, 1]]);
  for (const [input, expected] of cases) assert.strictEqual(CaptureRetention.minutesOf(input), expected, String(input));
});

test('label() words the retention as Settings does, and falls back to a number and a unit', () => {
  const expected = { 15: '15 minutes', 30: '30 minutes', 60: '1 hour', 180: '3 hours', 720: '12 hours', 1440: '24 hours',
    2880: '2 days', 10080: '7 days', 120: '2 hours', 45: '45 minutes', 61: '61 minutes' };
  for (const [minutes, text] of Object.entries(expected)) assert.strictEqual(CaptureRetention.label(Number(minutes), tr).toLowerCase(), text, minutes);
  // Untranslated: the English fallbacks
  assert.strictEqual(CaptureRetention.label(180, (key, fallback) => fallback), '3 hours');
  assert.strictEqual(CaptureRetention.label(2880, (key, fallback) => fallback), '2 days');
});

test('the Settings page starts from the same default and limits', () => {
  const html = read('sections/settings/settings.html');
  const input = html.match(/<input[^>]*id="captureRetentionDuration"[^>]*>/)[0];
  assert.strictEqual(Number(input.match(/\bmin="(\d+)"/)[1]), CaptureRetention.MIN_MINUTES);
  assert.strictEqual(Number(input.match(/\bmax="(\d+)"/)[1]), CaptureRetention.MAX_MINUTES);
  assert.strictEqual(Number(input.match(/\bvalue="(\d+)"/)[1]), CaptureRetention.DEFAULT_MINUTES);
  const defaults = JSON.parse(read('sections/settings/default-settings.json')).settings;
  assert.strictEqual(defaults.detection.captureRetentionMinutes, CaptureRetention.DEFAULT_MINUTES);
});

test('the worker, the Advanced footer and Settings read the retention through the module', () => {
  for (const file of ['background/advanced/history-store.js', 'sections/advanced/advanced-tools.js', 'sections/settings/settings-ui.js', 'sections/stats/stats.js']) {
    const source = read(file);
    assert.ok(/CaptureRetention\./.test(source), `${file} reads CaptureRetention`);
    assert.ok(!/10080/.test(source), `${file} has no limit of its own`);
  }
  assert.ok(!/30 minutes/i.test(read('sections/stats/stats-rules.js')), 'the stats note names the real retention');
});
