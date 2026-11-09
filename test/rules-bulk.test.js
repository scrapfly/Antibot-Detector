const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Rules tab: with a search or a chip on, the toolbar menu can export, switch on or switch off only the rules the list shows.
// The pure module decides what changes and what the file holds; the tab does the saving.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const B = () => require('../modules/core/rules-bulk.js');
const entry = (category, id, extra = {}) => ({ category, detectorName: id, detector: { id, name: id, ...extra } });
const shown = [
  entry('antibot', 'a', { enabled: true }),
  entry('antibot', 'b', { enabled: false }),
  entry('captcha', 'c'),                                  // no flag: on
  entry('fingerprint', 'd', { enabled: false, _searchStrings: ['x'] })
];
const ids = (list) => list.map(e => e.detectorName);

test('toChange keeps the rules that are not yet in the wanted state', () => {
  assert.deepEqual(ids(B().toChange(shown, true)), ['b', 'd']);
  assert.deepEqual(ids(B().toChange(shown, false)), ['a', 'c']);
});

test('toChange ignores empty entries and bad input', () => {
  assert.deepEqual(B().toChange(undefined, true), []);
  assert.equal(B().toChange([null, {}, { detector: null }, ...shown], true).length, 2);
});

test('counts say what each menu item would do, and nothing without a filter', () => {
  assert.deepEqual(B().counts(shown, true), { export: 4, on: 2, off: 2 });
  assert.deepEqual(B().counts(shown, false), { export: 0, on: 0, off: 0 });
  assert.deepEqual(B().counts([], true), { export: 0, on: 0, off: 0 });
});

test('exportOf writes the import file format for the shown rules only, without the search cache', () => {
  const file = B().exportOf([shown[0], shown[1], shown[3]], new Date('2026-11-09T10:00:00Z'));
  assert.equal(file.version, '1.0');
  assert.equal(file.exportedAt, '2026-11-09T10:00:00.000Z');
  assert.deepEqual(Object.keys(file.detectors), ['antibot', 'fingerprint']);
  assert.deepEqual(Object.keys(file.detectors.antibot), ['a', 'b']);
  assert.equal(file.detectors.fingerprint.d._searchStrings, undefined);
  assert.equal(shown[3].detector._searchStrings.length, 1, 'the list keeps its own copy');
  file.detectors.antibot.a.name = 'changed';
  assert.equal(shown[0].detector.name, 'a', 'a copy, not the rule itself');
});

test('exportOf of nothing is an empty file body', () => {
  assert.deepEqual(B().exportOf([], new Date(0)).detectors, {});
});

test('the menu items, the strings and the script are wired', () => {
  const html = read('sections/rules/rules.html');
  for (const id of ['exportShownRulesBtn', 'enableShownRulesBtn', 'disableShownRulesBtn']) assert.match(html, new RegExp(`id="${id}"[^>]*hidden`));
  const popup = read('popup.html');
  assert.ok(popup.indexOf('modules/core/rules-bulk.js') > popup.indexOf('modules/core/rules-filter.js'));
  const en = JSON.parse(read('_locales/en/messages.json'));
  for (const key of ['rulesExportShownFmt', 'rulesEnableShownFmt', 'rulesDisableShownFmt', 'rulesShownOnDoneFmt', 'rulesShownOffDoneFmt']) {
    assert.ok(en[key], key);
  }
});
