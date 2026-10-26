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
