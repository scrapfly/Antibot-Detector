const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A settings file or a backup that is far bigger than anything the extension writes is refused before it is read into memory
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function harness() {
  const notes = [];
  const context = vm.createContext({
    WorkerMessages: require('../modules/core/worker-messages.js'),
    SettingsUI: {},
    self: {},
    Logger: { error() {}, debug() {}, warn() {} },
    FormatUtils: { t: (key, fallback) => fallback },
    NotificationHelper: { error: text => notes.push(['error', text]), success: text => notes.push(['success', text]), info() {}, warning() {} },
    document: { querySelector() { return null; } },
    chrome: { runtime: { sendMessage: async () => ({}) } }
  });
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js', 'modules/settings/settings-transfer.js',
    'modules/settings/backup-bundle.js', 'sections/settings/settings-ui.js', 'sections/settings/settings-ui-data.js', 'sections/settings/settings-ui-backup.js']) vm.runInContext(read(file), context);
  return { ui: context.self.SettingsUI, notes };
}

function hugeFile(size) {
  let reads = 0;
  const input = { files: [{ size, text: async () => { reads++; return '{}'; } }], value: 'x' };
  return { event: { target: input }, input, reads: () => reads };
}

test('an oversized backup is refused without being read', async () => {
  const { ui, notes } = harness();
  const file = hugeFile(500 * 1024 * 1024);
  await ui.restoreBackupFile.call({}, file.event);
  assert.equal(file.reads(), 0);
  assert.equal(notes[0][0], 'error');
  assert.equal(file.input.value, '');
});

test('an oversized settings file is refused without being read', async () => {
  const { ui, notes } = harness();
  const file = hugeFile(500 * 1024 * 1024);
  await ui.importSettingsFile.call({}, file.event);
  assert.equal(file.reads(), 0);
  assert.equal(notes[0][0], 'error');
});

test('files of a normal size are still read', async () => {
  const { ui } = harness();
  const file = hugeFile(200 * 1024);
  await ui.importSettingsFile.call({ deepMerge() { return {}; }, validateSettings: () => ({ isValid: false }) }, file.event);
  assert.equal(file.reads(), 1);
});
