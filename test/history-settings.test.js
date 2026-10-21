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

// ---- The size History may take

test('the History size is saved, exported and 6 MB by default; the manifest has the permission a larger size needs', async () => {
  const HistoryStore = require('../modules/core/history-store.js');
  assert.equal(defaults.history.historyMaxMB, HistoryStore.SIZES_MB[0]);
  assert.equal((await loadUtils({ history: { historyMaxMB: 25 } }).getHistorySettings()).historyMaxMB, 25);
  assert.equal((await loadUtils({}).getHistorySettings()).historyMaxMB, undefined, 'older settings: the budget falls back to the smallest size');
  const ctx = vm.createContext({ self: {} });
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js', 'modules/settings/settings-transfer.js']) vm.runInContext(read(file), ctx);
  assert.equal(plain(ctx.SettingsTransfer.portable({ history: { historyMaxMB: 12 } })).history.historyMaxMB, 12);
  const manifest = JSON.parse(read('manifest.json'));
  assert.ok(manifest.permissions.includes('unlimitedStorage'));
  assert.ok(!manifest.optional_permissions, 'Chrome does not accept unlimitedStorage as an optional permission: it would be dropped and never granted');
  assert.equal(HistoryStore.hasUnlimitedStorage(manifest), true);
  assert.equal(HistoryStore.hasUnlimitedStorage({ permissions: ['storage'] }), false);
  assert.equal(HistoryStore.hasUnlimitedStorage({}), false);
  assert.equal(HistoryStore.hasUnlimitedStorage(null), false);
});

function sizeHarness({ unlimited = true, used = 0, confirm = true } = {}) {
  const state = { confirms: [] };
  const select = { value: '', dataset: {}, children: [], replaceChildren(...nodes) { this.children = nodes; } };
  const ctx = vm.createContext({
    console, self: {},
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: { t: (key, fallback, ...args) => args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), fallback) },
    NotificationHelper: { confirm: async (options) => { state.confirms.push(options); return confirm; } },
    document: {
      querySelector: selector => (selector === '#historyMaxMB' ? select : null),
      createElement: () => ({ value: '', textContent: '' })
    },
    chrome: {
      runtime: { getManifest: () => ({ permissions: unlimited ? ['storage', 'unlimitedStorage'] : ['storage'] }) },
      storage: { local: { get: async () => ({ scrapfly_history: used ? JSON.stringify({ items: [{ id: 'x', pad: 'p'.repeat(used) }] }) : undefined }) } }
    }
  });
  ctx.self = ctx;
  vm.runInContext(read('modules/core/history-store.js'), ctx, { filename: 'history-store.js' }); // in the page's own context, as in the popup
  vm.runInContext(read('sections/settings/settings-ui.js'), ctx, { filename: 'settings-ui.js' });
  const SettingsUI = vm.runInContext('SettingsUI', ctx);
  SettingsUI.formatStorageSize = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
  return { SettingsUI, state, select };
}
const MBYTES = 1024 * 1024;

test('the size box offers each size and selects the saved one, the smallest when it is not an offered size', () => {
  const h = sizeHarness();
  h.SettingsUI.populateHistorySize(25);
  assert.deepEqual(h.select.children.map(o => [o.value, o.textContent]), [['6', '6 MB'], ['12', '12 MB'], ['25', '25 MB']]);
  assert.equal(h.select.value, '25');
  assert.equal(h.select.dataset.applied, '25');
  for (const junk of [undefined, null, 99, 'x']) { h.SettingsUI.populateHistorySize(junk); assert.equal(h.select.value, '6', String(junk)); }
});

test('lowering the size below what History uses asks first, and Cancel keeps the earlier size', async () => {
  const used = 8 * MBYTES;
  const cancel = sizeHarness({ used, confirm: false });
  cancel.SettingsUI.populateHistorySize(25);
  cancel.select.value = '6';
  await cancel.SettingsUI.chooseHistorySize();
  assert.equal(cancel.state.confirms.length, 1);
  assert.match(cancel.state.confirms[0].message, /^History uses 8\.0 MB and the new limit is 6\.0 MB\. The oldest pages that are not pinned will be removed to fit\.$/);
  assert.equal(cancel.select.value, '25');
  assert.equal(cancel.select.dataset.applied, '25');

  const accept = sizeHarness({ used, confirm: true });
  accept.SettingsUI.populateHistorySize(25);
  accept.select.value = '6';
  await accept.SettingsUI.chooseHistorySize();
  assert.equal(accept.select.value, '6');
  assert.equal(accept.select.dataset.applied, '6');

  const fits = sizeHarness({ used: 3 * MBYTES });
  fits.SettingsUI.populateHistorySize(25);
  fits.select.value = '12';
  await fits.SettingsUI.chooseHistorySize();
  assert.equal(fits.state.confirms.length, 0, 'it still fits: nothing is removed, so nothing is asked');
  assert.equal(fits.select.value, '12');

  const grow = sizeHarness({ used });
  grow.SettingsUI.populateHistorySize(6);
  grow.select.value = '25';
  await grow.SettingsUI.chooseHistorySize();
  assert.equal(grow.state.confirms.length, 0, 'a larger size removes nothing');
  assert.equal(grow.select.dataset.applied, '25');
});

test('the budget the meter shows is the saved size', () => {
  const on = sizeHarness();
  assert.equal(on.SettingsUI.historyBudget.call({ settings: { history: { historyMaxMB: 25 } } }), 25 * MBYTES);
  assert.equal(on.SettingsUI.historyBudget.call({}), 6 * MBYTES);
  const off = sizeHarness({ unlimited: false });
  assert.equal(off.SettingsUI.historyBudget.call({ settings: { history: { historyMaxMB: 25 } } }), 6 * MBYTES, 'a build without the permission is held to the quota');
});

test('the History tab declares the size box and its hint, and only an offered size is saved', () => {
  const html = read('sections/settings/settings.html');
  assert.match(html, /<select id="historyMaxMB" class="select-field"><\/select>/, 'the sizes come from HistoryStore.SIZES_MB, not from the page');
  assert.ok(html.includes('data-i18n="settingsHistorySizeHint"'));
  const ui = read('sections/settings/settings-ui.js');
  assert.match(ui, /HistoryStore\.SIZES_MB\.includes\(settings\.history\.historyMaxMB\)/);
});
