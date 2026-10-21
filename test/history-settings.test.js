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
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js', 'modules/settings/settings-transfer.js']) vm.runInContext(read(file), ctx);
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

// ---- Pages that pin themselves, and the clock of fingerprinting-only pages

test('settings saved before automatic pinning existed pin nothing, and junk in the lists is dropped', async () => {
  const old = await loadUtils({ history: { historyLimit: 50 } }).getHistorySettings();
  assert.equal(old.historyAutoPinHard, false);
  assert.deepEqual(plain(old.historyAutoPinVendors), []);
  const s = await loadUtils({ history: { historyAutoPinHard: 'yes', historyAutoPinVendors: ['Cloudflare', 5, null, ' DataDome '], historyAutoPinMinConfidence: 95 } }).getHistorySettings();
  assert.equal(s.historyAutoPinHard, false, 'only the boolean true switches it on');
  assert.deepEqual(plain(s.historyAutoPinVendors), ['Cloudflare', ' DataDome '], 'the policy trims the names');
  assert.equal(s.historyAutoPinMinConfidence, 95);
  const on = await loadUtils({ history: { historyAutoPinHard: true, historyAutoPinVendors: 'Cloudflare' } }).getHistorySettings();
  assert.equal(on.historyAutoPinHard, true);
  assert.deepEqual(plain(on.historyAutoPinVendors), [], 'a list is a list');
});

test('a settings export carries the automatic pinning and the fingerprinting-only days', () => {
  const ctx = vm.createContext({ self: {} });
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js', 'modules/settings/settings-transfer.js']) vm.runInContext(read(file), ctx);
  const history = { historyFingerprintDays: 14, historyAutoPinHard: true, historyAutoPinVendors: ['Cloudflare'], historyAutoPinMinConfidence: 90 };
  assert.deepEqual(plain(ctx.SettingsTransfer.portable({ history })).history, history);
});

test('Settings reads a box of names as a clean list: trimmed, one spelling of each, at most 100', () => {
  const lines = (text) => ({ document: { querySelector: selector => (selector === '#box' ? { value: text } : null) } });
  const load = (text) => {
    const ctx = vm.createContext({ ...lines(text), self: {}, console });
    vm.runInContext(read('sections/settings/settings-ui.js'), ctx, { filename: 'settings-ui.js' });
    return vm.runInContext('SettingsUI', ctx);
  };
  assert.deepEqual(plain(load('  Cloudflare \n\ndatadome\r\nCLOUDFLARE\n  Google   reCAPTCHA ').readNameList('#box', ['kept'])), ['Cloudflare', 'datadome', 'Google reCAPTCHA']);
  assert.deepEqual(plain(load('x').readNameList('#missing', ['kept'])), ['kept'], 'no box on the page: what is saved stays');
  assert.deepEqual(plain(load('x').readNameList('#missing')), []);
  assert.equal(load(Array.from({ length: 150 }, (_, i) => `Name ${i}`).join('\n')).readNameList('#box').length, 100);
});

test('the History tab declares the boxes the scripts fill', () => {
  const html = read('sections/settings/settings.html');
  for (const id of ['historyFingerprintDays', 'historyAutoPinHard', 'historyAutoPinVendors', 'historyAutoPinMinConfidence', 'historyAutoPinNote']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /id="historyAutoPinNote" data-i18n-fmt="settingsHistoryAutoPinNote"/, 'the cap is filled in by the script, from the policy');
  assert.match(html, /<textarea id="historyAutoPinVendors"[^>]*site-list-box/);
  const ui = read('sections/settings/settings-ui.js');
  for (const key of ['historyFingerprintDays', 'historyAutoPinHard', 'historyAutoPinVendors', 'historyAutoPinMinConfidence']) {
    assert.ok(ui.includes(`${key}:`), `${key} is read from the form`);
    assert.ok(ui.includes(`'${key}'`) || ui.includes(`#${key}`), `${key} is shown in the form`);
  }
});
