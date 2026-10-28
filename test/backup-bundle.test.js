const { test } = require('node:test');
const assert = require('node:assert');

global.self = global;
require('../modules/core/categories.js');
require('../modules/core/domain-list.js');
require('../modules/core/scan-scope.js');
require('../modules/settings/settings-transfer.js');
const B = require('../modules/settings/backup-bundle.js');

const NOW = Date.UTC(2026, 9, 20, 18, 50);
const settings = {
  debugMode: true, notificationsEnabled: false,
  detection: { cacheDuration: 7, cacheUnit: 'days', blacklistedDomains: ['skip.example'], secretish: 'x' },
  history: { historyEnabled: true, historyLimit: 50 },
  webhook: { enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC_TOKEN_1', webhookHeaders: [{ name: 'Authorization', value: 'Bearer SYNTHETIC_TOKEN_2' }], webhookPayload: 'SYNTHETIC_PAYLOAD', webhookSecret: 'SYNTHETIC_SECRET_7' },
  share: { provider: 'github_gist', githubToken: 'SYNTHETIC_TOKEN_3', pastebinKey: 'SYNTHETIC_KEY_4', customUrl: 'https://u.example/SYNTHETIC_5', customHeaders: 'X: SYNTHETIC_6' }
};
const official = { id: 'detect-akamai', author: 'Scrapfly', name: 'Akamai' };
const mine = { id: 'detect-mine', author: 'Me', name: 'Mine', category: 'Anti-Bot', detection: {} };
const exported = { version: '1.0', exportedAt: '2026-10-20T00:00:00Z', detectors: { antibot: { 'detect-akamai': official, 'detect-mine': mine }, captcha: { 'detect-cap': { id: 'detect-cap', author: 'Me' } } } };
const items = [{ id: 'a', url: 'https://a.example/', note: 'check it', pinned: true, detections: [] }, { id: 'b', url: 'https://b.example/', detections: [] }];
const parts = { extensionVersion: '3.0.2', now: NOW, settings, languageOverride: 'es', detectors: B.customOnly(exported, d => d.id === 'detect-akamai'), historyItems: items };

test('a backup holds settings, the person\'s own rules and History, and nothing that connects the extension to a service', () => {
  const bundle = B.build(parts);
  assert.strictEqual(bundle.format, 'scrapfly-backup');
  assert.strictEqual(bundle.version, 1);
  assert.strictEqual(bundle.extensionVersion, '3.0.2');
  assert.strictEqual(bundle.createdAt, '2026-10-20T18:50:00.000Z');
  assert.strictEqual(bundle.languageOverride, 'es');
  assert.deepStrictEqual(bundle.settings.detection.blacklistedDomains, ['skip.example']);
  assert.strictEqual(bundle.settings.detection.secretish, undefined, 'only the known preferences go in');
  assert.deepStrictEqual(Object.keys(bundle.detectors.detectors.antibot), ['detect-mine']);
  assert.strictEqual(bundle.history.items.length, 2);
  const text = JSON.stringify(bundle);
  for (const secret of ['SYNTHETIC', 'hooks.example', 'Authorization', 'github_gist-token', 'u.example']) assert.ok(!text.includes(secret), `the backup leaks ${secret}`);
  assert.strictEqual(bundle.settings.webhook, undefined);
  assert.deepStrictEqual(Object.keys(bundle.settings.share || {}), ['provider'], 'sharing keeps only the provider choice');
});

test('customOnly() keeps the rules a restore would apply and drops the official ones', () => {
  const custom = B.customOnly(exported, d => d.id === 'detect-akamai');
  assert.deepStrictEqual(Object.keys(custom.detectors), ['antibot', 'captcha']);
  assert.deepStrictEqual(Object.keys(custom.detectors.antibot), ['detect-mine']);
  assert.strictEqual(custom.version, '1.0');
  assert.deepStrictEqual(B.customOnly(undefined, () => false).detectors, {});
  assert.deepStrictEqual(B.customOnly({ detectors: { x: 5, y: { a: null } } }, () => false).detectors, {});
});

test('parse() accepts a backup and says what it holds', () => {
  const result = B.parse(JSON.stringify(B.build(parts)));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.summary, { settings: true, rules: 2, history: 2 });
  assert.strictEqual(result.bundle.history.items[0].note, 'check it');
});

test('parse() refuses what is not a backup of this extension, with the reason', () => {
  const bundle = B.build(parts);
  const reason = (value) => B.parse(typeof value === 'string' ? value : JSON.stringify(value)).reason;
  assert.strictEqual(reason('{not json'), 'json');
  assert.strictEqual(reason('[]'), 'format');
  assert.strictEqual(reason({ items: [] }), 'format', 'a History export is not a backup');
  assert.strictEqual(reason({ ...bundle, format: 'other' }), 'format');
  assert.strictEqual(reason({ ...bundle, version: 2 }), 'newer');
  assert.strictEqual(reason({ ...bundle, version: 0 }), 'invalid');
  assert.strictEqual(reason({ ...bundle, version: '1' }), 'invalid');
  assert.strictEqual(reason({ ...bundle, settings: [] }), 'invalid');
  assert.strictEqual(reason({ ...bundle, detectors: { detectors: [] } }), 'invalid');
  assert.strictEqual(reason({ ...bundle, history: { items: 'x' } }), 'invalid');
  assert.strictEqual(reason({ format: 'scrapfly-backup', version: 1, settings: {}, detectors: { detectors: {} }, history: { items: [] } }), 'empty');
});

test('a backup that holds only some of the parts still restores those', () => {
  const only = { format: 'scrapfly-backup', version: 1, history: { items } };
  const parsed = B.parse(JSON.stringify(only));
  assert.strictEqual(parsed.ok, true);
  assert.deepStrictEqual(parsed.summary, { settings: false, rules: 0, history: 2 });
});

test('legacyKind() recognises the older exports so Restore can hand them to their importers', () => {
  assert.strictEqual(B.legacyKind({ version: '1.0', timestamp: 'x', itemsCount: 2, items }), 'history');
  assert.strictEqual(B.legacyKind(exported), 'rules');
  assert.strictEqual(B.legacyKind({ version: '3.0.1', timestamp: 'x', settings: { debugMode: true }, languageOverride: 'auto' }), 'settings');
  assert.strictEqual(B.legacyKind({ debugMode: true }), 'settings');
  assert.strictEqual(B.legacyKind(B.build(parts)), null, 'a backup is not legacy');
  for (const other of [null, 5, [], {}, { hello: 'world' }]) assert.strictEqual(B.legacyKind(other), null, JSON.stringify(other));
});

test('the file name carries the date, and build() needs SettingsTransfer', () => {
  assert.strictEqual(B.fileName(NOW), 'scrapfly-backup-2026-10-20.json');
  assert.deepStrictEqual(B.summarize(null), { settings: false, rules: 0, history: 0 });
  const saved = globalThis.SettingsTransfer;
  globalThis.SettingsTransfer = undefined;
  assert.throws(() => B.build(parts), /SettingsTransfer is not loaded/);
  globalThis.SettingsTransfer = saved;
});

test('a settings file brings in only hex colours: anything else in a colour (markup, a url) is left out', () => {
  const imported = globalThis.SettingsTransfer.portable({
    categoryColors: { antibot: '#000"><img src=https://x.example/t>', captcha: '#3b82f6', fingerprint: 'url(https://x.example)' },
    tagColors: { dom: '#abc', headers: 'red; background:url(x)' },
    badgeColors: { low: '#22c55e', high: 42 }
  });
  assert.deepStrictEqual(imported.categoryColors, { captcha: '#3b82f6' });
  assert.deepStrictEqual(imported.tagColors, { dom: '#abc' });
  assert.deepStrictEqual(imported.badgeColors, { low: '#22c55e' });
});
