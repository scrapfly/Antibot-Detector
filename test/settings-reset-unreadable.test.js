const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → Data → Reset is how a person gets out of stored settings that cannot be read. The worker already accepted such a
// reset (test/settings-store.test.js); the Settings page refused it first: it had no copy of the settings loaded (they could not
// be read) and Save, a reset included, asked for one.

const source = fs.readFileSync(path.join(__dirname, '..', 'sections/settings/settings-ui.js'), 'utf8');

function harness() {
  const calls = { reset: [], commit: 0, toasts: [] };
  const context = vm.createContext({
    console, self: {}, window: {}, Promise, JSON,
    Logger: new Proxy({}, { get: () => () => {} }),
    StorageManager: {
      resetSettings: async (defaults, keep) => { calls.reset.push([defaults, keep]); return { success: true, settings: defaults, previous: {} }; },
      commitSettings: async () => { calls.commit++; return { success: true, settings: {}, previous: {} }; }
    },
    SettingsTransfer: { diagnostics: () => ({}) },
    NotificationHelper: { success: (text) => calls.toasts.push(['ok', text]), error: (text) => calls.toasts.push(['error', text]), _notificationCache: null },
    WorkerMessages: new Proxy({}, { get: (_, name) => String(name) }),
    UrlUtils: { clearUrlHashCache() {} },
    chrome: { runtime: { sendMessage: () => Promise.resolve() } }
  });
  vm.runInContext(source, context, { filename: 'settings-ui.js' });
  return { calls, ui: vm.runInContext('SettingsUI', context) };
}

test('a reset saves although the settings could not be loaded, and the page then holds the defaults', async () => {
  const { ui, calls } = harness();
  const page = Object.assign(Object.create(ui), { settings: undefined, settingsBaseline: undefined });
  const defaults = { debugMode: false, detection: { cacheDuration: 7 } };
  const saved = await ui.saveSettings.call(page, { notify: false, reset: { defaults, keep: ['detection.blacklistedDomains'] } });
  assert.equal(saved, true, 'the reset went through');
  assert.deepEqual(calls.reset, [[defaults, ['detection.blacklistedDomains']]]);
  assert.deepEqual(page.settings, defaults);
  assert.deepEqual(page.settingsBaseline, defaults, 'later saves are measured from the repaired settings');
  assert.deepEqual(calls.toasts, [], 'no error toast');
});

test('any other save still needs the settings to have been loaded', async () => {
  const { ui, calls } = harness();
  const page = Object.assign(Object.create(ui), { settings: { debugMode: true }, settingsBaseline: undefined });
  assert.equal(await ui.saveSettings.call(page, { notify: false }), false);
  assert.equal(calls.commit, 0, 'nothing was written over what is stored');
  assert.equal(calls.toasts.length, 1);
  assert.equal(calls.toasts[0][0], 'error');
});
