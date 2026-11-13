const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → Data: a preset, an imported settings file and a restored backup replace the whole form. With edits in it that are
// not saved they ask first, as closing Settings and changing the language do: Save first, Discard, or Cancel (nothing changes).

global.self = global;
require('../modules/core/categories.js');
require('../modules/core/domain-list.js');
require('../modules/core/scan-scope.js');
require('../modules/settings/settings-transfer.js');
const BackupBundle = require('../modules/settings/backup-bundle.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness({ dirty = true, answers = [] } = {}) {
  const asked = [];
  const confirms = [];
  const commits = [];
  const notices = [];
  const format = (text, args) => String(text).replace(/\{(\d+)\}/g, (_, index) => args[Number(index)]);
  const context = vm.createContext({
    self: {}, console,
    Logger: new Proxy({}, { get: () => () => {} }),
    WorkerMessages: require('../modules/core/worker-messages.js'),
    SettingsTransfer: globalThis.SettingsTransfer, BackupBundle,
    DetectionUtils: { isOfficialDetector: () => false },
    FormatUtils: { t: (key, fallback, ...args) => format(fallback, args), localDay: () => 'today', formatDateTime: () => 'today' },
    I18n: { get: () => null, format: () => null },
    NotificationHelper: {
      choose: async (options) => { asked.push(options); return answers.shift(); },
      confirm: async (options) => { confirms.push(options); return true; },
      success: (text) => notices.push(['success', text]), error: (text) => notices.push(['error', text]),
      info: (text) => notices.push(['info', text]), warning: (text) => notices.push(['warning', text])
    },
    StorageManager: {
      commitSettings: async (mutation) => { commits.push(plain(mutation)); return { settings: plain(mutation.candidate), previous: plain(mutation.baseline) }; }
    },
    chrome: { storage: { local: { get: async () => ({}) } }, runtime: { sendMessage: async () => ({}), getManifest: () => ({ version: '3.1.9' }), lastError: null } },
    window: { popupInstance: null },
    document: { querySelector: () => null, querySelectorAll: () => [] }
  });
  for (const file of ['modules/settings/settings-presets.js', 'sections/settings/settings-ui.js', 'sections/settings/settings-ui-data.js',
    'sections/settings/settings-ui-presets.js', 'sections/settings/settings-ui-backup.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const ui = context.self.SettingsUI;
  const state = { dirty };
  // settings-ui-language.js answers these in the real popup
  ui.hasUnsavedChanges = () => state.dirty;
  ui.confirmHistorySizeFor = async () => {};
  ui.LANGUAGE_OPTIONS = [{ value: 'en' }];
  ui.languageInForce = async () => 'en';
  const saved = { debugMode: false, detection: { cacheDuration: 7, cacheUnit: 'days' } };
  const owner = {
    settings: plain(saved), settingsBaseline: plain(saved), defaultSettings: plain(saved), renders: 0,
    // The form holds an edit nobody saved: debug mode switched on
    getSettingsFromUI: () => ({ debugMode: true }),
    deepMerge: (...args) => ui.deepMerge(...args),
    validateSettings: () => ({ isValid: true, errors: [] }),
    updateSettingsUI() { this.renders++; state.dirty = false; },
    saveSettings(...args) { return ui.saveSettings.apply(this, args); }
  };
  return { ui, owner, context, asked, confirms, commits, notices, state };
}

// Privacy turns debug mode off, the edit in the form turns it on: what lands shows which one won
const presetId = () => 'privacy';

const importEvent = (settings) => ({ target: { value: 'file', files: [{ size: 10, text: async () => JSON.stringify({ settings }) }] } });

test('a preset with unsaved edits asks first; Cancel leaves the form and the saved settings as they are', async () => {
  const h = harness({ answers: ['cancel'] });
  await h.ui.applyPreset.call(h.owner, presetId(h.context));
  assert.equal(h.asked.length, 1);
  assert.equal(h.asked[0].title, 'Unsaved settings');
  assert.deepEqual(plain(h.asked[0].actions.map(action => action.value)), ['discard', 'save']);
  assert.equal(h.confirms.length, 0, 'the preset is not offered while the person stays with the edits');
  assert.equal(h.commits.length, 0);
  assert.equal(h.owner.renders, 0, 'the form is not redrawn over the edits');
});

test('a preset with unsaved edits: Save first saves the form, then the preset lands over it', async () => {
  const h = harness({ answers: ['save'] });
  await h.ui.applyPreset.call(h.owner, presetId(h.context));
  assert.ok(h.commits.length >= 1);
  assert.equal(h.commits[0].candidate.debugMode, true, 'the edit is saved first');
  if (h.commits.length > 1) assert.equal(h.commits[1].baseline.debugMode, true, 'the preset starts from what was just saved');
});

test('a preset with unsaved edits: Discard drops them and the preset goes on', async () => {
  const h = harness({ answers: ['discard'] });
  h.owner.settings.detection.cacheDuration = 99; // staged, not saved
  await h.ui.applyPreset.call(h.owner, presetId(h.context));
  assert.ok(h.commits.every(commit => commit.candidate.debugMode !== true), 'the discarded edit is never saved');
  assert.ok(h.owner.renders >= 1, 'the form shows the saved settings again');
  assert.equal(h.owner.settingsBaseline.detection.cacheDuration, 7);
});

test('with nothing unsaved a preset asks nothing more than its own question', async () => {
  const h = harness({ dirty: false });
  await h.ui.applyPreset.call(h.owner, presetId(h.context));
  assert.equal(h.asked.length, 0);
});

test('importing a settings file with unsaved edits asks first; Cancel changes nothing and clears the file input', async () => {
  const h = harness({ answers: [undefined] });
  const event = importEvent({ debugMode: false, theme: 'x' });
  await h.ui.importSettingsFile.call(h.owner, event);
  assert.equal(h.asked.length, 1);
  assert.equal(h.commits.length, 0);
  assert.equal(h.owner.renders, 0);
  assert.equal(event.target.value, '');
  assert.ok(!h.notices.some(([kind]) => kind === 'error'), 'staying is not an error');
});

test('importing a settings file with unsaved edits: Save first saves the form, then the import lands', async () => {
  const h = harness({ answers: ['save'] });
  await h.ui.importSettingsFile.call(h.owner, importEvent({ detection: { cacheDuration: 3 } }));
  assert.equal(h.commits.length, 2);
  assert.equal(h.commits[0].candidate.debugMode, true);
  assert.equal(h.commits[1].candidate.debugMode, true, 'the import merges over what was just saved');
  assert.equal(h.commits[1].candidate.detection.cacheDuration, 3);
});

test('restoring a backup that holds settings with unsaved edits asks first; Cancel restores nothing', async () => {
  const h = harness({ answers: ['cancel'] });
  const bundle = BackupBundle.build({ extensionVersion: '3.1.9', settings: { debugMode: false }, languageOverride: 'auto', detectors: null, historyItems: [] });
  h.ui.chooseRestore = async () => ({ parts: { settings: true, rules: false, history: false }, mode: 'merge' });
  const event = { target: { value: 'file', files: [{ size: 10, text: async () => JSON.stringify(bundle) }] } };
  await h.ui.restoreBackupFile.call(h.owner, event);
  assert.equal(h.asked.length, 1);
  assert.equal(h.commits.length, 0);
  assert.ok(!h.notices.some(([kind]) => kind === 'success'));
});

test('restoring a backup without its settings part does not ask about the form', async () => {
  const h = harness({ answers: [] });
  const bundle = BackupBundle.build({ extensionVersion: '3.1.9', settings: { debugMode: false }, languageOverride: 'auto', detectors: null, historyItems: [] });
  h.ui.chooseRestore = async () => ({ parts: { settings: false, rules: false, history: false }, mode: 'merge' });
  const event = { target: { value: 'file', files: [{ size: 10, text: async () => JSON.stringify(bundle) }] } };
  await h.ui.restoreBackupFile.call(h.owner, event);
  assert.equal(h.asked.length, 0);
});
