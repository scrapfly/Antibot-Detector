const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Back up and Restore keep the state a person would expect to come back: the official rules they switched off and the theme
// travel in the file, and the dialog says what a backup never holds (the webhook and sharing details, the watchlist).

global.self = global;
require('../modules/core/categories.js');
require('../modules/core/domain-list.js');
require('../modules/core/scan-scope.js');
require('../modules/settings/settings-transfer.js');
const BackupBundle = require('../modules/settings/backup-bundle.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function fakeElement(tag) {
  return { tag, children: [], style: {}, dataset: {}, className: '', textContent: '', type: '', checked: false,
    append(...nodes) { this.children.push(...nodes); } };
}
const textOf = (node) => [node.textContent, ...node.children.map(textOf)].filter(Boolean).join('\n');

function load({ theme = 'dark', withTheme = true, saveOk = true } = {}) {
  const downloads = [];
  const applied = [];
  const themeSelect = { value: theme };
  const format = (text, args) => text.replace(/\{(\d+)\}/g, (_, index) => args[Number(index)]);
  const rules = { version: '1.0', exportedAt: 'x', detectors: { antibot: {
    'detect-cloudflare': { id: 'detect-cloudflare', author: 'Scrapfly', name: 'Cloudflare', enabled: false },
    'detect-akamai': { id: 'detect-akamai', author: 'Scrapfly', name: 'Akamai', enabled: true },
    'detect-mine': { id: 'detect-mine', author: 'Me', name: 'Mine', enabled: true } } } };
  const state = { theme, formContent: null };
  const context = vm.createContext({
    console, Logger: new Proxy({}, { get: () => () => {} }), SettingsUI: {},
    WorkerMessages: { RELOAD_DETECTORS: 'reload' },
    BackupBundle, SettingsTransfer: globalThis.SettingsTransfer,
    DetectionUtils: { isOfficialDetector: (detector) => detector.author === 'Scrapfly' },
    FormatUtils: { t: (key, fallback, ...args) => format(fallback, args), formatDateTime: () => 'today' },
    NotificationHelper: { success() {}, error() {}, warning() {}, info() {}, form: async (options) => { state.formContent = options.content; return false; } },
    chrome: { storage: { local: { get: async () => ({ scrapfly_language_override: 'en' }) } }, runtime: { getManifest: () => ({ version: '3.1.4' }), sendMessage() {}, lastError: null } },
    window: { popupInstance: { detectorManager: { exportDetectors: () => rules } } },
    document: { querySelector: (selector) => (selector === '#themeChoice' ? themeSelect : null), createElement: fakeElement }
  });
  if (withTheme) {
    context.ScrapflyTheme = { VALUES: ['dark', 'light', 'system'], get: () => state.theme, set: async (value) => { applied.push(value); state.theme = value; return value; } };
  }
  vm.runInContext(read('sections/settings/settings-ui-backup.js'), context);
  const ui = context.SettingsUI;
  ui._readStoredHistoryItems = async () => [];
  ui._downloadFile = (content) => downloads.push(JSON.parse(content));
  ui.confirmHistorySizeFor = async () => {};
  ui.LANGUAGE_OPTIONS = [{ value: 'en' }];
  ui.languageInForce = async () => 'en';
  const form = {
    settingsBaseline: { debugMode: false }, settings: { debugMode: false },
    deepMerge: (a, b) => ({ ...a, ...b }), validateSettings: () => ({ isValid: true }),
    saveSettings: async () => saveOk, updateSettingsUI() {}
  };
  return { ui, form, downloads, applied, themeSelect, state };
}

test('Back up writes the theme beside the settings, and the official rules the person switched off beside their own', async () => {
  const h = load({ theme: 'light' });
  await h.ui.backUpEverything.call(h.form);
  assert.equal(h.downloads.length, 1);
  const [bundle] = h.downloads;
  assert.equal(bundle.theme, 'light');
  assert.deepEqual(Object.keys(bundle.detectors.detectors.antibot), ['detect-cloudflare', 'detect-mine'], 'an official rule that is on stays out');
  assert.equal(bundle.detectors.detectors.antibot['detect-cloudflare'].enabled, false);
});

test('without a theme module (a page that has none) Back up writes no theme and still works', async () => {
  const h = load({ withTheme: false });
  await h.ui.backUpEverything.call(h.form);
  assert.equal(h.downloads.length, 1);
  assert.ok(!('theme' in h.downloads[0]));
});

const settingsPart = (extra = {}) => ({ settings: { debugMode: true }, languageOverride: 'en', ...extra });

test('Restore of the settings brings the theme back: applied, and shown in the Theme list', async () => {
  const h = load({ theme: 'dark' });
  const result = plain(await h.ui.applyBackup.call(h.form, settingsPart({ theme: 'light' }), { parts: { settings: true }, mode: 'merge' }));
  assert.deepEqual(result.done, ['settings']);
  assert.deepEqual(plain(h.applied), ['light']);
  assert.equal(h.themeSelect.value, 'light', 'the list in General shows it without reopening Settings');
});

test('a theme that is not one of ours, none at all, or the one already shown changes nothing', async () => {
  for (const theme of ['purple', '', 5, null, undefined, 'dark']) {
    const h = load({ theme: 'dark' });
    await h.ui.applyBackup.call(h.form, settingsPart(theme === undefined ? {} : { theme }), { parts: { settings: true }, mode: 'merge' });
    assert.deepEqual(plain(h.applied), [], `theme ${JSON.stringify(theme)}`);
    assert.equal(h.themeSelect.value, 'dark');
  }
});

test('the theme comes with the settings part only: unchecked, or a settings save that failed, leaves it alone', async () => {
  const unchecked = load();
  await unchecked.ui.applyBackup.call(unchecked.form, settingsPart({ theme: 'light' }), { parts: { settings: false, history: false }, mode: 'merge' });
  assert.deepEqual(plain(unchecked.applied), []);
  const failing = load({ saveOk: false });
  const result = plain(await failing.ui.applyBackup.call(failing.form, settingsPart({ theme: 'light' }), { parts: { settings: true }, mode: 'merge' }));
  assert.deepEqual(result.failed, ['settings']);
  assert.deepEqual(plain(failing.applied), [], 'the settings were not restored, so the theme is not either');
});

test('a restore on a page without the theme module still restores the settings', async () => {
  const h = load({ withTheme: false });
  const result = plain(await h.ui.applyBackup.call(h.form, settingsPart({ theme: 'light' }), { parts: { settings: true }, mode: 'merge' }));
  assert.deepEqual(result.done, ['settings']);
});

test('the restore dialog says what a backup never holds', async () => {
  const h = load();
  const parsed = { bundle: { extensionVersion: '3.1.4', createdAt: new Date().toISOString() }, summary: { settings: true, rules: 1, history: 2 } };
  await h.ui.chooseRestore.call(h.form, parsed);
  const lines = textOf(h.state.formContent).split('\n');
  assert.ok(lines.includes('Not part of a backup: webhook and sharing details, and which History pages are watched.'), lines.join(' | '));
  assert.match(read('_locales/en/messages.json'), /"restoreNotIncludedNote": \{/);
});
