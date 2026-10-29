const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Restoring a backup with "Merge" imports the valid rules of it; the ones this version cannot take are named to the person
// (as Rules → Import does), not dropped while the summary counts every rule of the file as restored
const root = path.join(__dirname, '..');

function restore({ skipped, importOk = true, mode = 'merge' }) {
  const warnings = [];
  const manager = { importDetectors: async () => importOk, lastImportSkipped: skipped };
  const ctx = { console, Logger: new Proxy({}, { get: () => () => {} }), SettingsUI: {}, WorkerMessages: { RELOAD_DETECTORS: 'reload' },
    chrome: { runtime: { sendMessage: (_m, cb) => cb && cb(), lastError: null } },
    window: { popupInstance: { detectorManager: manager } },
    NotificationHelper: { warning: (m) => warnings.push(m) }, FormatUtils: { t: (_k, fallback) => fallback } };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/settings/settings-ui-backup.js'), 'utf8'), ctx);
  return ctx.SettingsUI.applyBackup.call({}, { detectors: { antibot: {} } }, { parts: { rules: true }, mode })
    .then(result => ({ result: JSON.parse(JSON.stringify(result)), warnings })); // the arrays are built in the script's own realm
}

test('a restore reports the rules it skipped', async () => {
  const { result } = await restore({ skipped: ['detect-badregex', 'p'] });
  assert.deepEqual(result.done, ['rules']);
  assert.deepEqual(result.skipped, ['detect-badregex', 'p']);
});

test('a restore that skipped nothing, or failed, reports none', async () => {
  assert.deepEqual((await restore({ skipped: [] })).result.skipped, []);
  assert.deepEqual((await restore({ skipped: undefined })).result.skipped, []);
  const failed = (await restore({ skipped: ['x'], importOk: false })).result;
  assert.deepEqual(failed.failed, ['rules']);
  assert.deepEqual(failed.skipped, []);
});
