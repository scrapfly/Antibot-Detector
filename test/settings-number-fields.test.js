const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// An emptied number field in Settings reads as NaN. No range check (x < 0, x > 999) catches NaN, so it used to be
// saved: now it is refused with the field's own message, or the saved value is kept where there is none.

const root = path.join(__dirname, '..');

function load(fields = {}) {
  const context = vm.createContext({
    console, self: {},
    HistoryStore: require('../modules/core/history-store.js'),
    HistoryPolicy: require('../modules/core/history-policy.js'),
    FormatUtils: require('../utils/format-utils.js'),
    ScanScope: require('../modules/core/scan-scope.js'),
    Logger: new Proxy({}, { get: () => () => {} }),
    document: { querySelector: (selector) => fields[selector] || null }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/settings/settings-ui.js'), 'utf8'), context);
  return vm.runInContext('SettingsUI', context);
}

test('an empty History limit or duplicate duration is refused, with the field\'s message', () => {
  const SettingsUI = load();
  const limit = SettingsUI.validateSettings.call({}, { history: { historyLimit: NaN } });
  assert.equal(limit.isValid, false);
  assert.match(limit.errors.join(' '), /History limit must be between 0 \(unlimited\) and 10000/);
  const duration = SettingsUI.validateSettings.call({}, { duplicatePrevention: { duplicateDuration: NaN } });
  assert.equal(duration.isValid, false);
  assert.match(duration.errors.join(' '), /Duplicate duration must be between 1 and 999/);
  assert.equal(SettingsUI.validateSettings.call({}, { history: { historyLimit: 0 }, duplicatePrevention: { duplicateDuration: 2 } }).isValid, true);
});

test('an emptied log size keeps the saved one', () => {
  const source = fs.readFileSync(path.join(root, 'sections/settings/settings-ui.js'), 'utf8');
  assert.match(source, /const maxLogs = Number\.isFinite\(rawMaxLogs\) \? rawMaxLogs : \(parseInt\(this\.settings\.logCollectorMaxLogs, 10\) \|\| 5000\);/);
  assert.match(source, /settings\.logCollectorMaxLogs = Math\.min\(Math\.max\(maxLogs, 100\), 5000\);/);
});

test('a value a setting\'s list does not offer is refused when it is new, and tolerated when it is what is saved', () => {
  const SettingsUI = load();
  const check = (settings, baseline = {}) => SettingsUI.validateSettings.call({ settingsBaseline: baseline }, settings);
  // A hand-edited file: 72 hours is not one of the choices, the select would show blank and the next Save read NaN
  const bad = check({ updates: { checkIntervalHours: 72 } });
  assert.equal(bad.isValid, false);
  assert.match(bad.errors.join(' '), /updates\.checkIntervalHours/);
  assert.equal(check({ updates: { checkIntervalHours: 168 }, history: { exportFormat: 'csv', historyBackup: 'weekly' }, duplicatePrevention: { duplicateUnit: 'days', duplicateScope: 'path', duplicateAction: 'update' }, detection: { cacheScope: 'full' } }).isValid, true, 'every offered value is fine');
  for (const [group, key, value] of [['history', 'exportFormat', 'pdf'], ['history', 'historyBackup', 'hourly'], ['duplicatePrevention', 'duplicateUnit', 'weeks'], ['duplicatePrevention', 'duplicateScope', 'site'], ['detection', 'cacheScope', 'host']]) {
    assert.equal(check({ [group]: { [key]: value } }).isValid, false, `${group}.${key} = ${value}`);
  }
  // The value is already what is saved (an older version allowed it): an unrelated Save, an import and a restore go through
  assert.equal(check({ updates: { checkIntervalHours: 72 } }, { updates: { checkIntervalHours: 72 } }).isValid, true);
});

