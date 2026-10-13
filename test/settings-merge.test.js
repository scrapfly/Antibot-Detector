const { test } = require('node:test');
const assert = require('node:assert');

// Settings saves start from what is stored now: a domain blocked from the
// Detection or History tab, or the last update check, must survive the
// Settings form saving the copy it loaded earlier.

global.self = global;
global.Logger = { error() {}, debug() {}, warn() {} };
require('../modules/core/storage-manager.js');
require('../modules/settings/settings-store.js');
global.ScrapflyBridgeProtocol = { MESSAGE_TYPES: { SETTINGS_MUTATE: 'SETTINGS_MUTATE' } };
global.SettingsStore.registerHandlers({});
const StorageManager = global.StorageManager;
const merge = (b, m, s) => JSON.parse(JSON.stringify(StorageManager.mergeSettingsChanges(b, m, s)));

test('the form only overrides what it changed since loading', () => {
  const base = { detection: { cacheDuration: 7, cacheUnit: 'days', blacklistedDomains: ['a.com'] }, updates: { lastCheckTimestamp: 1 } };
  const mine = { detection: { cacheDuration: 3, cacheUnit: 'days', blacklistedDomains: ['a.com'] }, updates: { lastCheckTimestamp: 1 } };
  // Meanwhile: b.com blocked from the Detection tab, an update check ran
  const stored = { detection: { cacheDuration: 7, cacheUnit: 'days', blacklistedDomains: ['a.com', 'b.com'] }, updates: { lastCheckTimestamp: 2 } };
  assert.deepStrictEqual(merge(base, mine, stored), {
    detection: { cacheDuration: 3, cacheUnit: 'days', blacklistedDomains: ['a.com', 'b.com'] },
    updates: { lastCheckTimestamp: 2 }
  });
});

test('a list the form itself edited wins, and form defaults missing from storage are kept', () => {
  const base = { detection: { blacklistedDomains: ['a.com'] }, theme: 'dark' };
  const mine = { detection: { blacklistedDomains: [] }, theme: 'dark', newDefault: true };
  const stored = { detection: { blacklistedDomains: ['a.com'] } };
  assert.deepStrictEqual(merge(base, mine, stored), { detection: { blacklistedDomains: [] }, theme: 'dark', newDefault: true });
});

test('updateSettings changes the stored settings in one read-and-write', async () => {
  let stored = JSON.stringify({ settings: { detection: { blacklistedDomains: ['a.com'] } } });
  global.chrome = { storage: { local: {
    get: async () => ({ scrapfly_settings: stored }),
    set: async (obj) => { stored = obj.scrapfly_settings; }
  } } };
  try {
    assert.strictEqual(await StorageManager.updateSettings(s => { s.detection.blacklistedDomains.push('b.com'); }), true);
    assert.deepStrictEqual(JSON.parse(stored).settings.detection.blacklistedDomains, ['a.com', 'b.com']);
    const before = stored;
    assert.strictEqual(await StorageManager.updateSettings(() => false), true);
    assert.strictEqual(stored, before, 'returning false skips the write');
  } finally {
    delete global.chrome;
  }
});
