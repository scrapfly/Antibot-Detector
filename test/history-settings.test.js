const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The History settings: their defaults, how they are read, and what a settings export carries.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const defaults = JSON.parse(read('sections/settings/default-settings.json')).settings;

function loadUtils(settings) {
  const ctx = vm.createContext({ console, Logger: new Proxy({}, { get: () => () => {} }), Constants: {}, chrome: {} });
  vm.runInContext(read('utils/utils.js'), ctx);
  const Utils = vm.runInContext('Utils', ctx);
  Utils.getSettings = async () => settings;
  return Utils;
}

test('defaults: History records everything except private windows, keeps full addresses, and does nothing in the background', () => {
  const h = defaults.history;
  assert.equal(h.historyEnabled, true);
  assert.equal(h.historySkipIncognito, true);
  assert.equal(h.historyMinConfidence, 0);
  assert.equal(h.historySkipFingerprintOnly, false);
  assert.deepEqual(h.historyExcludedDomains, []);
  assert.equal(h.historyChangeAlerts, 'off');
  assert.equal(h.historyBackup, 'off');
  assert.equal(h.historyClearOnClose, false);
  assert.equal(defaults.duplicatePrevention.duplicateAction, 'skip');
});

test('the defaults read back unchanged', async () => {
  const read = await loadUtils(defaults).getHistorySettings();
  for (const key of Object.keys(defaults.history)) {
    if (key in read) assert.deepEqual(plain(read[key]), defaults.history[key], key);
  }
  assert.equal(read.duplicateAction, 'skip');
});

test('settings saved by an older version (none of the new keys) get the old behaviour, plus private windows skipped', async () => {
  const s = await loadUtils({ history: { historyLimit: 50 }, duplicatePrevention: { preventDuplicates: true } }).getHistorySettings();
  assert.equal(s.historyLimit, 50);
  assert.equal(s.historyEnabled, true);
  assert.equal(s.historySkipIncognito, true);
  assert.equal(s.historyMinConfidence, 0);
  assert.deepEqual(plain(s.historyExcludedDomains), []);
  assert.equal(s.historyChangeAlerts, 'off');
  assert.equal(s.historyBackup, 'off');
  assert.equal(s.historyClearOnClose, false);
  assert.equal(s.duplicateAction, 'skip');
});

test('values are normalized: unknown choices fall back, numbers are clamped, lists are cleaned', async () => {
  const s = await loadUtils({
    history: {
      historyEnabled: false, historySkipIncognito: false, historyMinConfidence: '250', historySkipFingerprintOnly: true,
      historyExcludedDomains: ['a.com', 5, null, 'b.org'], historyChangeAlerts: 'sometimes',
      historyBackup: 'hourly', historyClearOnClose: 'yes'
    },
    duplicatePrevention: { duplicateAction: 'merge' }
  }).getHistorySettings();
  assert.equal(s.historyEnabled, false);
  assert.equal(s.historySkipIncognito, false);
  assert.equal(s.historyMinConfidence, 100);
  assert.equal(s.historySkipFingerprintOnly, true);
  assert.deepEqual(plain(s.historyExcludedDomains), ['a.com', 'b.org']);
  assert.equal(s.historyChangeAlerts, 'off');
  assert.equal(s.historyBackup, 'off');
  assert.equal(s.historyClearOnClose, false, 'only the boolean true switches it on');
  assert.equal(s.duplicateAction, 'skip');
  const valid = await loadUtils({ history: { historyMinConfidence: -5, historyChangeAlerts: 'pinned', historyBackup: 'weekly', historyClearOnClose: true }, duplicatePrevention: { duplicateAction: 'update' } }).getHistorySettings();
  assert.equal(valid.historyMinConfidence, 0);
  assert.equal(valid.historyChangeAlerts, 'pinned');
  assert.equal(valid.historyBackup, 'weekly');
  assert.equal(valid.historyClearOnClose, true);
  assert.equal(valid.duplicateAction, 'update');
});

test('a settings export carries every History setting and the capture time, and nothing unknown', () => {
  const ctx = vm.createContext({ self: {} });
  vm.runInContext(read('modules/settings/settings-transfer.js'), ctx);
  const history = {
    historyEnabled: false, historySkipIncognito: true, historyMinConfidence: 40, historySkipFingerprintOnly: true,
    historyExcludedDomains: ['a.com'], historyChangeAlerts: 'all', historyBackup: 'daily', historyClearOnClose: true,
    historyLimit: 10, exportFormat: 'csv', includeTimestamps: false, secretLooking: 'x'
  };
  const portable = plain(ctx.SettingsTransfer.portable({
    history,
    duplicatePrevention: { preventDuplicates: true, duplicateAction: 'update', stray: 1 },
    detection: { captureRetentionMinutes: 15 }
  }));
  const { secretLooking, ...expected } = history;
  assert.deepEqual(portable.history, expected);
  assert.deepEqual(portable.duplicatePrevention, { preventDuplicates: true, duplicateAction: 'update' });
  assert.equal(portable.detection.captureRetentionMinutes, 15);
});
