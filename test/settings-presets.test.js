const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

global.self = global;
require('../modules/core/categories.js');
require('../modules/core/domain-list.js');
require('../modules/core/scan-scope.js');
const SettingsPresets = require('../modules/settings/settings-presets.js');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const defaults = JSON.parse(read('sections/settings/default-settings.json')).settings;
const english = JSON.parse(read('_locales/en/messages.json'));

test('every change of a preset names a setting that exists, and its words are English messages', () => {
  for (const [id, preset] of Object.entries(SettingsPresets.PRESETS)) {
    for (const key of [preset.nameKey, preset.descKey]) assert.ok(english[key], `${id}: ${key}`);
    assert.strictEqual(english[preset.nameKey].message, preset.name);
    assert.strictEqual(english[preset.descKey].message, preset.desc);
    assert.ok(preset.changes.length >= 5, id);
    for (const change of preset.changes) {
      assert.notStrictEqual(SettingsPresets.getPath(defaults, change.path), undefined, `${id}: ${change.path} is a default setting`);
      assert.strictEqual(typeof SettingsPresets.getPath(defaults, change.path), typeof change.value, `${id}: ${change.path} keeps its type`);
      assert.ok(english[change.key] && english[change.key].message === change.label, `${id}: ${change.key} is the English line "${change.label}"`);
    }
  }
});

test('a preset only changes plain preferences: never the site lists, the connections, the language, the theme or the rules', () => {
  const protectedPaths = [...SettingsPresets.KEEP, ...SettingsPresets.CONNECTIONS];
  for (const [id, preset] of Object.entries(SettingsPresets.PRESETS)) {
    for (const change of preset.changes) {
      assert.ok(!protectedPaths.includes(change.path), `${id} touches ${change.path}`);
      assert.ok(!/^(detectors|categories|history\.historyExcludedDomains|language|theme|enabled)/.test(change.path), `${id}: ${change.path}`);
    }
  }
});

test('pending() lists only what would change, counting a missing setting as its default', () => {
  const ids = (id, settings) => SettingsPresets.pending(id, settings, defaults).map(change => change.path);
  // Nothing saved yet: only the privacy settings whose default is not the preset's value change
  assert.deepStrictEqual(ids('privacy', {}), ['history.historyEnabled', 'history.historyClearOnClose', 'notificationsEnabled']);
  assert.deepStrictEqual(ids('developer', {}), ['debugMode', 'debugVerbose', 'logCollectorEnabled', 'jsApi.enableJsApi'], 'the 5000 lines are the default already');
  assert.deepStrictEqual(ids('developer', { logCollectorMaxLogs: 200 }).includes('logCollectorMaxLogs'), true);
  // Everything already set
  const done = { history: { historyEnabled: false, historyClearOnClose: true }, notificationsEnabled: false };
  assert.deepStrictEqual(ids('privacy', done), []);
  // A saved value wins over the default
  assert.deepStrictEqual(ids('privacy', { webhook: { enableWebhook: true }, history: { historyBackup: 'weekly' } }).filter(path => /webhook|Backup/.test(path)), ['history.historyBackup', 'webhook.enableWebhook']);
  assert.deepStrictEqual(ids('nothing', {}), []);
});

test('patchOf() is the nested object of the pending changes', () => {
  assert.deepStrictEqual(SettingsPresets.patchOf('developer', { debugMode: true, jsApi: { enableJsApi: true } }, defaults),
    { debugVerbose: true, logCollectorEnabled: true });
  assert.deepStrictEqual(SettingsPresets.patchOf('privacy', {}, defaults), { history: { historyEnabled: false, historyClearOnClose: true }, notificationsEnabled: false });
  assert.deepStrictEqual(SettingsPresets.patchOf('privacy', { history: { historyEnabled: false, historyClearOnClose: true }, notificationsEnabled: false }, defaults), {});
});

test('a reset keeps the site lists and the rules check time, and the connections unless they are removed', () => {
  const kept = SettingsPresets.resetKeep();
  assert.deepStrictEqual(kept.slice(0, 5), ['detection.blacklistedDomains', 'detection.allowedDomains', 'detection.hooksOffDomains', 'history.historyExcludedDomains', 'updates.lastCheckTimestamp']);
  assert.ok(kept.includes('webhook.webhookUrl') && kept.includes('share.githubToken'));
  assert.ok(kept.includes('webhook.webhookSecret'), 'the signing secret is a connection: kept unless the connections are removed');
  assert.ok(!SettingsPresets.resetKeep({ disconnect: true }).includes('webhook.webhookSecret'));
  assert.deepStrictEqual(SettingsPresets.resetKeep({ disconnect: true }), [...SettingsPresets.KEEP]);
  for (const keptPath of kept) assert.notStrictEqual(SettingsPresets.getPath(defaults, keptPath), undefined, `${keptPath} is a default setting`);
});

test('a reset keeps how much History may hold, so it never deletes pages (its limit and its size)', () => {
  for (const options of [{}, { disconnect: true }]) {
    const kept = SettingsPresets.resetKeep(options);
    assert.ok(kept.includes('history.historyLimit') && kept.includes('history.historyMaxMB'), JSON.stringify(options));
  }
  // The other History defaults can only keep more, never delete: off switches and no extra clocks
  const history = defaults.history;
  assert.deepStrictEqual([history.historyAutoDelete, history.historyClearOnClose, history.historyFingerprintDays], [false, false, 0]);
});

test('the connection details are exactly the webhook and sharing settings that a settings export leaves out', () => {
  require('../modules/settings/settings-transfer.js');
  const SettingsTransfer = globalThis.SettingsTransfer;
  const exported = SettingsTransfer.portable(defaults);
  const connection = (group) => Object.keys(defaults[group]).filter(key => !(exported[group] && key in exported[group]));
  const listed = (group) => SettingsPresets.CONNECTIONS.filter(path => path.startsWith(`${group}.`)).map(path => path.slice(group.length + 1));
  // A webhook is not exported at all: its connection is everything but the two switches and the "send only when" filter (preferences)
  const preferences = ['enableWebhook', 'webhookOnCache', 'webhookRetry', 'webhookMinConfidence', 'webhookCategories', 'webhookDomains'];
  assert.deepStrictEqual(listed('webhook').sort(), connection('webhook').filter(key => !preferences.includes(key)).sort());
  assert.deepStrictEqual(listed('share').sort(), connection('share').sort());
});

test('a reset keeps which site list is in use, so "only the sites I choose" never turns back into every site', () => {
  assert.ok(SettingsPresets.KEEP.includes('detection.scanMode'));
  for (const key of ['detection.allowedDomains', 'detection.blacklistedDomains', 'detection.hooksOffDomains']) assert.ok(SettingsPresets.KEEP.includes(key), key);
});
