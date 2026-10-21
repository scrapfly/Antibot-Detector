const { test } = require('node:test');
const assert = require('node:assert');

const D = require('../modules/settings/diagnostics-report.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const NOW = Date.UTC(2026, 9, 20, 18, 50);

const settings = {
  debugMode: true, debugVerbose: false, logCollectorEnabled: true, notificationsEnabled: true,
  jsApi: { enableJsApi: false },
  webhook: { enableWebhook: true, webhookUrl: 'https://hooks.example/services/SYNTHETIC_TOKEN_123', webhookHeaders: [{ name: 'Authorization', value: 'Bearer SYNTHETIC_TOKEN_456' }], webhookPayload: '{"key":"SYNTHETIC_PAYLOAD"}', webhookSecret: 'SYNTHETIC_SIGNING_SECRET' },
  share: { provider: 'github_gist', githubToken: 'SYNTHETIC_TOKEN_789', customUrl: 'https://upload.example/SYNTHETIC_UPLOAD', customHeaders: 'X-Key: SYNTHETIC_HEADER' },
  detection: { cacheDuration: 7, cacheUnit: 'days', cacheScope: 'domain', blacklistedDomains: ['secret-site.example', 'private.example'], sortBy: 'category', advancedToolsMinConfidence: 50 },
  history: { historyEnabled: true, historyLimit: 500, historyBackup: 'weekly', historyClearOnClose: false, historyExcludedDomains: ['bank.example'] },
  updates: { autoUpdate: true, checkIntervalHours: 168 }
};
const env = {
  version: '3.0.2', now: NOW, userAgent: UA, brands: [{ brand: 'Chromium', version: '142' }, { brand: 'Brave', version: '142' }], isBrave: true,
  uiLanguage: 'en-US', languageOverride: 'auto',
  detectors: { total: 70, official: 68, custom: 2, edited: 1, byCategory: { antibot: 30, captcha: 19, fingerprint: 21 }, lastCheckAt: NOW - 86400000 },
  history: { entries: 120, bytes: 1500000 }, storage: { used: 2300000, quota: 10485760 }, workerCurrent: true,
  logs: { enabled: true, errors: [
    { timestamp: NOW - 5000, message: 'Scan failed on private.example · Error: fetch https://private.example/cart?token=SYNTHETIC_QUERY failed for user@mail.example' },
    { timestamp: NOW - 1000, message: 'Webhook could not be sent to hooks.example with Bearer SYNTHETIC_TOKEN_456 from 10.1.2.3 (key SYNTHETIC_TOKEN_ABCDEFGHIJKLMNOPQRSTUV)' }
  ] }
};

test('the report names the versions, the counts and the switches', () => {
  const report = D.build(env, settings);
  assert.match(report, /^Scrapfly Antibot Detector 3\.0\.2 diagnostics\nGenerated: 2026-10-20 18:50 UTC\n/);
  assert.match(report, /Browser: Brave 142 \(Chromium 142\) on Windows/);
  assert.match(report, /Language: en-US \(browser\)/);
  assert.match(report, /Detectors: 70 in total \(30 antibot, 19 captcha, 21 fingerprint\); 2 custom, 1 edited/);
  assert.match(report, /Rules last checked: 2026-10-19 18:50 UTC; automatic updates on/);
  assert.match(report, /- Debug mode on, verbose off; log collector on/);
  assert.match(report, /- Notifications on; JS API off; webhook on/);
  assert.match(report, /- Cache: 7 days, domain scope/);
  assert.match(report, /- Sites: 2 skipped; JS hooks off on 0/);
  assert.match(report, /- History: on, limit 500 entries, up to 6 MB, backup weekly, clear on close off/);
  assert.match(report, /Storage: 2\.2 MB of 10\.0 MB; History 120 entries, 1\.4 MB/);
  assert.match(report, /Background part: up to date/);
});

test('nothing private reaches the report: no site, address, header, key or History content', () => {
  const report = D.build(env, settings);
  for (const secret of ['SYNTHETIC', 'hooks.example', 'upload.example', 'secret-site', 'private.example', 'bank.example', 'Authorization', 'user@mail', 'github_gist', '10.1.2.3', 'https://']) {
    assert.ok(!report.includes(secret), `the report leaks ${secret}`);
  }
  assert.match(report, /Scan failed on <site>/);
});

test('the log lines are cleaned, capped and quoted newest last', () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ timestamp: NOW - (14 - i) * 1000, message: `line ${i} at https://x.example/${'a'.repeat(300)}` }));
  const report = D.build({ ...env, logs: { enabled: true, errors: many } }, settings);
  const quoted = report.split('\n').filter(line => /^- 2026-10-20/.test(line));
  assert.strictEqual(quoted.length, 10);
  assert.match(quoted[0], /line 4 at <url>/);
  assert.match(quoted[9], /line 13 at <url>/);
  assert.match(report, /Recent errors \(10, newest last; addresses, sites and keys removed\)/);
  for (const line of quoted) assert.ok(line.length < 260, line.length);
  assert.strictEqual(D.redact('word '.repeat(100)).length, 220, 'one line is capped');
  assert.strictEqual(D.redact('x'.repeat(500)), '<token>', 'a long unbroken string is a key');
});

test('a switched-off collector says so, and an empty one says none', () => {
  assert.match(D.build({ ...env, logs: { enabled: false, errors: [] } }, settings), /Recent errors: log collector is off, so none were collected/);
  assert.match(D.build({ ...env, logs: { enabled: true, errors: [] } }, settings), /Recent errors \(0, newest last[^\n]*\n- none/);
});

test('redact() removes addresses, e-mails, sites, IPs and key-like strings and keeps file names and API calls', () => {
  const clean = D.redact('bg/scan walmart.com · modules/core/storage-manager.js · chrome.storage.local.get · JSON.parse failed · v3.0.2');
  assert.strictEqual(clean, 'bg/scan <site> · modules/core/storage-manager.js · chrome.storage.local.get · JSON.parse failed · v3.0.2');
  assert.strictEqual(D.redact('GET https://a.example/p?q=1#h and wss://b.example/s'), 'GET <url> and <url>');
  assert.strictEqual(D.redact('mail me at a.b+c@d-e.co.uk now'), 'mail me at <email> now');
  assert.strictEqual(D.redact('from 192.168.0.1'), 'from <ip>');
  assert.strictEqual(D.redact('SYNTHETICKEY0123456789ABCDEFGHIJKLMNOPQRSTUV'), '<token>');
  assert.strictEqual(D.redact(null), '');
});

test('browserOf() knows Brave, Edge, Opera, Chrome and what it does not know', () => {
  assert.strictEqual(D.browserOf(UA, [], false), 'Chrome 142 on Windows');
  assert.strictEqual(D.browserOf(UA, [{ brand: 'Microsoft Edge', version: '142' }], false), 'Microsoft Edge 142 (Chromium 142) on Windows');
  assert.strictEqual(D.browserOf(`${UA} Edg/141.0.1`, undefined, false), 'Microsoft Edge 141 (Chromium 142) on Windows');
  assert.strictEqual(D.browserOf(`${UA} OPR/120.0`, undefined, false), 'Opera 120 (Chromium 142) on Windows');
  assert.strictEqual(D.browserOf('Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0', [], true), 'Brave 140 (Chromium 140) on Linux');
  assert.strictEqual(D.browserOf('', undefined, undefined), 'Chromium-based browser on an unknown system');
});

test('an empty or hostile input still gives a report', () => {
  for (const [e, s] of [[undefined, undefined], [null, null], [{}, {}], [{ detectors: 'x', logs: 5, storage: [] }, { detection: { blacklistedDomains: 'x' }, history: [] }]]) {
    const report = D.build(e, s);
    assert.match(report, /^Scrapfly Antibot Detector unknown diagnostics/);
    assert.match(report, /Background part: unknown/);
  }
});

test('the report says whether a signing secret is set, and never what it is', () => {
  assert.match(D.build(env, settings), /webhook on, signing secret set/);
  const unsigned = { ...settings, webhook: { ...settings.webhook, webhookSecret: '   ' } };
  assert.match(D.build(env, unsigned), /webhook on\n/);
  assert.ok(!D.build(env, unsigned).includes('signing secret'));
  const off = { ...settings, webhook: { ...settings.webhook, enableWebhook: false } };
  assert.match(D.build(env, off), /webhook off\n/);
  assert.ok(!D.build(env, off).includes('signing secret'), 'nothing about a secret while the webhook is off');
});

test('the rule set is named by its versions and what is waiting, never by rule names', () => {
  const withVersions = { ...env, detectors: { ...env.detectors, indexVersion: '1.0.0', versions: { '2.1.0': 17, '1.2.0': 14, '2.3.0': 2, unversioned: 1 }, incompatible: 2, pending: 0, failed: 1 } };
  const report = D.build(withVersions, settings);
  assert.match(report, /^Rule set: index 1\.0\.0; official rules 2\.3\.0 ×2, 2\.1\.0 ×17, 1\.2\.0 ×14, unversioned ×1; updates: 2 waiting for a newer extension, 1 failed$/m);
  const bare = D.build({ ...env, detectors: { total: 3 } }, settings);
  assert.ok(!/Rule set:/.test(bare), 'nothing to say without versions or queues');
});
