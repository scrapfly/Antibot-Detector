const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → Data → Storage: the captures row counts what a private window's captures hold in memory too, so the row
// is not "empty" (and its Clear button not disabled) while they are listed in Advanced → History
const root = path.join(__dirname, '..');
const StorageOverview = require('../modules/settings/storage-overview.js');

function sizes({ localCaptures = 0, memory = 0, session = true }) {
  const ctx = { console, StorageOverview, SettingsUI: {}, HistoryStore: { hasUnlimitedStorage: () => false },
    AdvancedHistoryStore: { PRIVATE_KEY: 'session_advanced_private' },
    chrome: { storage: {
      local: { QUOTA_BYTES: 10485760, getBytesInUse: async (keys) => (keys === null ? 5000 + localCaptures : (Array.isArray(keys) && keys.includes('scrapfly_advanced_history') ? localCaptures : 0)) },
      ...(session ? { session: { getBytesInUse: async () => memory } } : {})
    } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/settings/settings-ui-storage.js'), 'utf8'), ctx);
  return ctx.SettingsUI.readStorageSizes();
}

test('private-window captures kept in memory count in the Tool captures row, so it can be cleared', async () => {
  const summary = await sizes({ memory: 4000 });
  const row = summary.rows.find(r => r.id === 'captures');
  assert.equal(row.bytes, 4000);
  assert.equal(row.empty, false, 'not empty: the Clear button works');
  const both = (await sizes({ localCaptures: 2000, memory: 4000 })).rows.find(r => r.id === 'captures');
  assert.equal(both.bytes, 6000);
});

test('without session storage, or with nothing in memory, the row is the stored captures alone', async () => {
  assert.equal((await sizes({ localCaptures: 2000, session: false })).rows.find(r => r.id === 'captures').bytes, 2000);
  assert.equal((await sizes({ localCaptures: 2000, memory: 0 })).rows.find(r => r.id === 'captures').bytes, 2000);
});
