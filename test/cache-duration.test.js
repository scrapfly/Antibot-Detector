const { test } = require('node:test');
const assert = require('node:assert');

const FormatUtils = require('../utils/format-utils.js');

const DAY = 24 * 60 * 60 * 1000;
const ms = (r) => FormatUtils.convertToMilliseconds(r.duration, r.unit);
const norm = (d, u) => FormatUtils.normalizeCacheDuration(d, u);

test('months and years convert as 30 and 365 days', () => {
  assert.strictEqual(FormatUtils.convertToMilliseconds(2, 'months'), 60 * DAY);
  assert.strictEqual(FormatUtils.convertToMilliseconds(1, 'years'), 365 * DAY);
  assert.strictEqual(FormatUtils.convertToMilliseconds(3, 'bogus'), 3 * 60 * 60 * 1000); // unknown -> hours
});

test('in-range values are kept as they are', () => {
  assert.deepStrictEqual(norm(12, 'hours'), { duration: 12, unit: 'hours', exact: true });
  assert.deepStrictEqual(norm(30, 'days'), { duration: 30, unit: 'days', exact: true });
});

test('48 hours becomes 2 days with the same expiry', () => {
  const r = norm(48, 'hours');
  assert.deepStrictEqual(r, { duration: 2, unit: 'days', exact: true });
  assert.strictEqual(ms(r), 48 * 60 * 60 * 1000);
});

test('72 hours becomes 3 days with the same expiry', () => {
  const r = norm(72, 'hours');
  assert.deepStrictEqual(r, { duration: 3, unit: 'days', exact: true });
  assert.strictEqual(ms(r), 72 * 60 * 60 * 1000);
});

test('90 minutes has no exact in-range form: nearest valid, ties to the longer', () => {
  const r = norm(90, 'minutes');
  assert.deepStrictEqual(r, { duration: 2, unit: 'hours', exact: false });
  assert.ok(FormatUtils.CACHE_UNIT_MAX[r.unit] >= r.duration);
});

test('45 days has no exact in-range form: nearest valid, ties to the longer', () => {
  const r = norm(45, 'days');
  assert.deepStrictEqual(r, { duration: 2, unit: 'months', exact: false });
  assert.strictEqual(Math.abs(ms(r) - 45 * DAY), 15 * DAY);
});

test('400 days becomes the nearest valid duration, 1 year', () => {
  assert.deepStrictEqual(norm(400, 'days'), { duration: 1, unit: 'years', exact: false });
});

test('60 days and 730 days keep their exact length', () => {
  assert.deepStrictEqual(norm(60, 'days'), { duration: 2, unit: 'months', exact: true });
  assert.deepStrictEqual(norm(730, 'days'), { duration: 2, unit: 'years', exact: true });
});

test('garbage falls back to the 12-hour default', () => {
  assert.deepStrictEqual(norm(0, 'hours'), { duration: 12, unit: 'hours', exact: false });
  assert.deepStrictEqual(norm('x', 'days'), { duration: 12, unit: 'hours', exact: false });
});
