const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Switching the UI language reloads the popup (JS-built text in every section
// would otherwise stay in the old language) and remembers where the user was.

const root = path.join(__dirname, '..');

function load({ currentTab = 'history', settingsTab = 'general' } = {}) {
  const store = new Map();
  const events = [];
  const context = vm.createContext({
    console, JSON, Promise,
    SettingsUI: { setLanguagePickerValue() {}, _closeLanguagePicker() {} },
    Logger: { error() {} },
    sessionStorage: { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k) },
    location: { reload: () => events.push('reload') },
    document: { querySelector: (s) => (s === '.settings-tab-btn.active' ? { getAttribute: () => settingsTab } : null) },
    chrome: { storage: { local: { set: async (v) => events.push(['saved', v]) } } },
    I18n: { loadOverride: async () => events.push('partial-refresh') }
  });
  context.window = context;
  context.popupInstance = { currentTab };
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/settings/settings-ui-language.js'), 'utf8'), context);
  return { SettingsUI: context.SettingsUI, store, events };
}

test('choosing a language saves it, remembers the tabs and reloads the popup', async () => {
  const { SettingsUI, store, events } = load({ currentTab: 'rules', settingsTab: 'general' });
  await SettingsUI._applyLanguageChoice('es');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(events)), [['saved', { scrapfly_language_override: 'es' }], 'reload']);
  assert.deepStrictEqual(JSON.parse(store.get(SettingsUI.RELOAD_STATE_KEY)), { tab: 'rules', settingsTab: 'general' });
});

test('the popup restores the remembered tabs once, then falls back to the default', async () => {
  const src = fs.readFileSync(path.join(root, 'popup.js'), 'utf8').replace(/\r/g, '');
  const body = src.slice(src.indexOf('async restoreAfterLanguageChange() {'));
  const fn = body.slice(0, body.indexOf('\n  }\n') + 4);
  const store = new Map([['scrapfly_reopen_after_language', JSON.stringify({ tab: 'rules', settingsTab: 'data' })]]);
  const calls = [];
  const context = vm.createContext({
    JSON,
    SettingsUI: { RELOAD_STATE_KEY: 'scrapfly_reopen_after_language' },
    sessionStorage: { getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k) }
  });
  vm.runInContext(`var Popup = class { ${fn} }`, context);
  const popup = new context.Popup();
  popup.switchTab = async (t) => calls.push(['tab', t]);
  popup.settings = { showSettings: () => calls.push('settings'), switchTab: (t) => calls.push(['settingsTab', t]) };
  assert.strictEqual(await popup.restoreAfterLanguageChange(), true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [['tab', 'rules'], 'settings', ['settingsTab', 'data']]);
  assert.strictEqual(await popup.restoreAfterLanguageChange(), false);
});
