const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// An entry with no readable date is stored with timestamp 0 and its card says "Unknown":
// the hover text and the copied details must not claim it was saved on 1 January 1970.

global.Logger = { error() {}, warn() {}, ui() {}, debug() {} };
const FormatUtils = require('../utils/format-utils.js');

test('formatKnownDateTime answers nothing for a missing or unreadable date', () => {
  assert.strictEqual(typeof FormatUtils.formatKnownDateTime, 'function');
  for (const value of [0, undefined, null, NaN, 'abc', -5]) {
    assert.strictEqual(FormatUtils.formatKnownDateTime(value), '', String(value));
  }
  assert.notStrictEqual(FormatUtils.formatKnownDateTime(1730000000000), '');
});

test('History cards, the details window and the copy use it for the saved date', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'sections', 'history', 'history.js'), 'utf8');
  assert.doesNotMatch(source, /formatDateTime\(item\.timestamp\)/);
  assert.doesNotMatch(source, /formatDateTime\(historyItem\.timestamp\)/);
  assert.match(source, /formatKnownDateTime\(item\.timestamp\)/);
});
