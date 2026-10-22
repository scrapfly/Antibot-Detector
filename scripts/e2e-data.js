#!/usr/bin/env node
/**
 * Settings → Data, end to end, in the real extension (unpacked in Chromium):
 *
 *   Storage          the overview adds up, each Clear button clears only its own part (cache, tool captures, pending rule updates, logs,
 *                    History), and settings and rules are never touched
 *   Diagnostics      Copy diagnostics puts a report on the clipboard that holds no site, address, key or private setting
 *   Backup           Back up writes settings, the person's own rules and History with no secret; Restore brings them back
 *                    (merge or replace, per part) and hands an older export to the importer it always had
 *   Presets          Privacy and Developer list what they change and change only that; Reset goes back to the defaults
 *                    and keeps site lists, connections, language, theme and rules
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:data
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-data-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: 'chromium', viewport: { width: 420, height: 650 }, acceptDownloads: true,
      args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });
    const W = (fn, arg) => worker.evaluate(fn, arg);

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const boot = async () => {
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      await page.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized, null, { polling: 250 });
    };
    await boot();
    await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
    const click = selector => page.$eval(selector, element => element.click());
    const dialogsGone = () => page.waitForFunction(() => document.querySelectorAll('.notification-confirm').length === 0, null, { polling: 250, timeout: 8000 });
    const confirmDialog = async () => { await page.waitForSelector('.notification-confirm .notification-btn-confirm'); await click('.notification-btn-confirm'); await dialogsGone(); };
    const openData = async () => {
      if (!await page.$eval('#settingsModal', el => el.classList.contains('is-open'))) {
        await click('#settingsBtn');
        await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 250 });
      }
      await click('.settings-tab-btn[data-settings-tab="data"]');
    };
    const get = (keys) => W((list) => chrome.storage.local.get(list), keys);

    // ---- Storage ----------------------------------------------------------------------------------------------
    if (!only || 'storage'.includes(only)) {
      const now = Date.now();
      const text = (n) => 'x'.repeat(n);
      await W(({ now, filler }) => chrome.storage.local.set({
        scrapfly_detection_storage: { a1: { url: 'https://a.test/', hostname: 'a.test', timestamp: now, expiry: now + 3.6e6, cacheScope: 'domain', detectionResults: [], filler }, b2: { url: 'https://b.test/', hostname: 'b.test', timestamp: now, expiry: now + 3.6e6, cacheScope: 'domain', detectionResults: [], filler } },
        scrapfly_advanced_history: { akamai: [{ id: 'cap1', timestamp: now, expiresAt: now + 3.6e6, hostname: 'a.test', data: { filler } }] },
        scrapfly_collected_logs: [{ t: now, level: 'info', msg: filler }],
        // a bundled pending update survives the worker's start-up (GitHub ones are dropped when the release cannot be read)
        scrapfly_pending_updates: [{ id: 'detect-pending', source: 'bundled', version: '9.9.9', minExtensionVersion: '99.0', filler }],
        scrapfly_update_errors: [{ id: 'detect-broken', error: 'synthetic', at: now, filler }],
        scrapfly_history: JSON.stringify({ items: [
          { id: 'h1', url: 'https://a.test/', hostname: 'a.test', title: 'A', timestamp: now, detections: [], detectionCount: 0, categories: [] },
          { id: 'h2', url: 'https://b.test/', hostname: 'b.test', title: 'B', timestamp: now - 1000, detections: [], detectionCount: 0, categories: [] }] })
      }), { now, filler: text(4000) });
      await boot();
      await openData();
      await page.$eval('#storageTotalText', el => el.closest('.data-card-head').click());
      await page.waitForFunction(() => document.querySelectorAll('#storageRows .storage-row').length === 8, null, { polling: 250 });
      const rows = () => page.$$eval('#storageRows .storage-row', items => Object.fromEntries(items.map(item => [item.dataset.storage, {
        text: item.querySelector('.storage-row-size').textContent, clear: !!item.querySelector('[data-clear]'), disabled: item.querySelector('[data-clear]') ? item.querySelector('[data-clear]').disabled : null }])));
      const exact = () => page.evaluate(() => SettingsUI.readStorageSizes());
      let overview = await rows();
      assert.deepEqual(Object.keys(overview), ['cache', 'captures', 'history', 'rules', 'updates', 'settings', 'logs', 'other']);
      for (const id of ['cache', 'captures', 'history', 'updates', 'logs']) assert.equal(overview[id].clear && !overview[id].disabled, true, `${id} can be cleared: ${JSON.stringify(overview[id])} stored=${JSON.stringify(Object.keys(await get(['scrapfly_pending_updates', 'scrapfly_update_errors', 'scrapfly_incompatible_updates'])))}`);
      for (const id of ['rules', 'settings', 'other']) assert.equal(overview[id].clear, false, `${id} has no Clear button`);
      let summary = await exact();
      assert.ok(summary.rows.find(row => row.id === 'cache').bytes > 8000, 'the cache holds what was seeded');
      assert.ok(summary.rows.find(row => row.id === 'rules').bytes > 1000, 'the rules are counted');
      const sum = summary.rows.reduce((total, row) => total + row.bytes, 0) + summary.other;
      assert.equal(sum, summary.total, 'the rows and the rest add up to the total');
      // The extension has unlimited storage (History can take 12 or 25 MB): there is no quota to fill, so no meter
      assert.match(await page.$eval('#storageTotalText', el => el.textContent), /^\d+(\.\d)? (KB|MB) used, no limit$/);
      assert.equal(await page.$eval('#storageMeter', el => el.hidden), true);
      const rulesBefore = JSON.stringify(summary.rows.filter(row => row.id === 'rules' || row.id === 'settings'));
      console.log('PASS the overview lists every part, adds up, and offers Clear only where it is safe');

      // Cache
      await page.$eval('[data-clear="cache"]', el => el.click());
      await page.waitForSelector('.notification-confirm');
      assert.match(await page.$eval('.notification-confirm', el => el.textContent), /Pages are scanned again/);
      await confirmDialog();
      await page.waitForFunction(() => document.querySelector('[data-storage="cache"] [data-clear]').disabled, null, { polling: 250 });
      assert.equal((await get(['scrapfly_detection_storage'])).scrapfly_detection_storage, undefined, 'the cache is gone');
      assert.ok((await get(['scrapfly_history'])).scrapfly_history, 'History is still there');
      // Tool captures
      await page.$eval('[data-clear="captures"]', el => el.click());
      await confirmDialog();
      await page.waitForFunction(() => document.querySelector('[data-storage="captures"] [data-clear]').disabled, null, { polling: 250 });
      const captures = (await get(['scrapfly_advanced_history'])).scrapfly_advanced_history;
      assert.equal(Object.values(captures || {}).flat().length, 0, 'the captures are gone');
      assert.ok((await get(['scrapfly_collected_logs'])).scrapfly_collected_logs, 'the logs are still there');
      // Logs
      await page.$eval('[data-clear="logs"]', el => el.click());
      await confirmDialog();
      await page.waitForFunction(() => document.querySelector('[data-storage="logs"] [data-clear]').disabled, null, { polling: 250 });
      assert.deepEqual((await get(['scrapfly_collected_logs'])).scrapfly_collected_logs || [], [], 'the logs are gone');
      assert.ok(JSON.parse((await get(['scrapfly_history'])).scrapfly_history).items.length === 2, 'History is still there');
      // Pending rule updates: the queues go, the rules stay
      await page.$eval('[data-clear="updates"]', el => el.click());
      await page.waitForSelector('.notification-confirm');
      assert.match(await page.$eval('.notification-confirm', el => el.textContent), /finds them again/);
      await confirmDialog();
      await page.waitForFunction(() => document.querySelector('[data-storage="updates"] [data-clear]').disabled, null, { polling: 250 });
      const queues = await get(['scrapfly_pending_updates', 'scrapfly_update_errors', 'scrapfly_incompatible_updates', 'scrapfly_detectors']);
      assert.deepEqual([queues.scrapfly_pending_updates, queues.scrapfly_update_errors, queues.scrapfly_incompatible_updates], [undefined, undefined, undefined], 'the queues are gone');
      assert.ok(queues.scrapfly_detectors, 'the rules are still there');
      console.log('PASS Clear removes the cache, the tool captures, the pending rule updates and the logs, each on its own');

      // History keeps its own flow: its confirmation, then the entries are gone
      await page.$eval('[data-clear="history"]', el => el.click());
      await confirmDialog();
      await page.waitForFunction(() => document.querySelector('[data-storage="history"] [data-clear]').disabled, null, { polling: 250 });
      const left = (await get(['scrapfly_history'])).scrapfly_history;
      assert.equal(left ? JSON.parse(left).items.length : 0, 0, 'History is empty');
      // Nothing that holds settings or rules changed size or went missing
      summary = await exact();
      assert.equal(JSON.stringify(summary.rows.filter(row => row.id === 'rules' || row.id === 'settings')), rulesBefore, 'settings and rules were not touched');
      assert.ok((await get(['scrapfly_settings', 'scrapfly_detectors'])).scrapfly_detectors, 'the rules are still stored');
      console.log('PASS Clear on History uses its own confirmation, and settings and rules are never touched');
    }

    // ---- Diagnostics ------------------------------------------------------------------------------------------
    if (!only || 'diagnostics'.includes(only)) {
      const now = Date.now();
      await page.evaluate(async () => {
        const saved = await StorageManager.patchSettings({
          debugMode: true, logCollectorEnabled: true,
          detection: { blacklistedDomains: ['secret-site.example', 'private.example'] },
          webhook: { enableWebhook: true, webhookUrl: 'https://hooks.example/services/SYNTHETIC_TOKEN_123', webhookHeaders: [{ name: 'Authorization', value: 'Bearer SYNTHETIC_TOKEN_456' }], webhookSecret: 'SYNTHETIC_SIGNING_SECRET' },
          share: { provider: 'github_gist', githubToken: 'SYNTHETIC_TOKEN_789' }
        });
        if (!saved) throw new Error('fixture failed');
      });
      await W(({ now }) => chrome.storage.local.set({ scrapfly_collected_logs: [
        { timestamp: now - 4000, level: 'info', message: 'Scan started on private.example' },
        { timestamp: now - 3000, level: 'error', message: 'Scan failed on private.example · fetch https://private.example/cart?token=SYNTHETIC_QUERY failed for user@mail.example' },
        { timestamp: now - 1000, level: 'error', message: 'Webhook could not be sent to hooks.example with Bearer SYNTHETIC_TOKEN_456' }] }), { now });
      await boot();
      await openData();
      await page.$eval('#copyDiagnosticsBtn', el => el.closest('.settings-card').querySelector('.data-card-head').click());
      await page.waitForSelector('#copyDiagnosticsBtn', { state: 'visible' });
      // The browser will not grant an extension page the clipboard permission in this harness, so the text is captured as it
      // is handed to the clipboard (a real click still does the handing over)
      await page.evaluate(() => {
        const original = navigator.clipboard.writeText.bind(navigator.clipboard);
        window.copiedText = null;
        navigator.clipboard.writeText = async (text) => { window.copiedText = text; return original(text).catch(() => {}); };
      });
      await page.click('#copyDiagnosticsBtn');
      await page.waitForFunction(() => /Diagnostics copied/.test(document.body.textContent), null, { polling: 250 });
      const copied = await page.evaluate(() => window.copiedText);
      const version = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8')).version;
      assert.match(copied, new RegExp(`^Scrapfly Antibot Detector ${version.replace(/\./g, '\\.')} diagnostics\n`));
      assert.match(copied, /Browser: .* on Linux/);
      assert.match(copied, /Detectors: \d+ in total \(\d+ antibot, \d+ captcha, \d+ fingerprint\); 0 custom, 0 edited/);
      assert.match(copied, /- Debug mode on, verbose off; log collector on/);
      assert.match(copied, /- Sites: 2 skipped; JS hooks off on 0/);
      assert.match(copied, /webhook on/);
      assert.match(copied, /Background part: up to date/);
      assert.match(copied, /Recent errors \(2, newest last; addresses, sites and keys removed\)/);
      assert.match(copied, /Scan failed on <site> · fetch <url> failed for <email>/);
      for (const secret of ['SYNTHETIC', 'hooks.example', 'private.example', 'secret-site', 'user@mail', 'github_gist', 'Authorization', 'https://']) {
        assert.ok(!copied.includes(secret), `the copied report leaks ${secret}`);
      }
      console.log('PASS Copy diagnostics puts a report on the clipboard with no site, address, key or setting value that is private');
    }

    // ---- Backup and restore ----------------------------------------------------------------------------------------
    if (!only || 'backup'.includes(only)) {
      const now = Date.now();
      const stored = () => page.evaluate(() => StorageManager.readSettingsStrict());
      const patch = (value) => page.evaluate(async (v) => { if (!await StorageManager.patchSettings(v)) throw new Error('fixture failed'); }, value);
      const history = async () => { const raw = (await get(['scrapfly_history'])).scrapfly_history; return raw ? JSON.parse(raw).items : []; };
      const entry = (id, extra = {}) => ({ id, url: `https://${id}.example/`, hostname: `${id}.example`, title: id, timestamp: now - 1000, detections: [{ detector: { name: 'X' }, category: 'Anti-Bot', confidence: 90 }], detectionCount: 1, categories: ['Anti-Bot'], ...extra });
      const myRule = { id: 'detect-backup-rule', name: 'Backup Rule', author: 'Me', enabled: true, category: 'Anti-Bot', difficulty: 'Medium', version: '1.0.0', icon: 'custom.png', description: 'Mine',
        detection: { content: [{ id: 'backup-rule-text', text: 'backup-rule-marker', confidence: 90, standalone: true, description: 'backup-rule-text' }] } };
      const hasRule = () => page.evaluate((id) => !!window.popupInstance.detectorManager.findDetectorById(id), myRule.id);
      const backupCard = () => page.$eval('#backUpEverythingBtn', el => el.closest('.settings-card').querySelector('.data-card-head').click());
      const restoreFrom = async (buffer) => page.setInputFiles('#restoreBackupFile', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(typeof buffer === 'string' ? buffer : JSON.stringify(buffer)) });
      const dialogText = () => page.$eval('.notification-confirm', el => el.textContent);

      await patch({ notificationsEnabled: true, debugMode: false, detection: { blacklistedDomains: ['backup-skip.example'], cacheDuration: 5, cacheUnit: 'days' },
        webhook: { enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC_TOKEN_A', webhookHeaders: [{ name: 'X-Key', value: 'SYNTHETIC_KEY_B' }], webhookSecret: 'SYNTHETIC_SECRET_D' }, share: { githubToken: 'SYNTHETIC_GITHUB_C' } });
      await W(({ list }) => chrome.storage.local.set({ scrapfly_language_override: 'fr', scrapfly_history: JSON.stringify({ items: list }) }), { list: [entry('b-one', { pinned: true, note: 'kept by the backup' }), entry('b-two')] });
      await boot();
      await page.evaluate(async (rule) => { const dm = window.popupInstance.detectorManager; await dm.addDetector('antibot', rule.id, rule); }, myRule);
      assert.equal(await hasRule(), true, 'the fixture rule exists');
      await openData();
      await backupCard();

      // Back up: one file with the three parts and no secret
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#backUpEverythingBtn')]);
      assert.match(download.suggestedFilename(), /^scrapfly-backup-\d{4}-\d{2}-\d{2}\.json$/);
      const fileText = fs.readFileSync(await download.path(), 'utf8');
      const bundle = JSON.parse(fileText);
      assert.equal(bundle.format, 'scrapfly-backup');
      assert.equal(bundle.version, 1);
      assert.equal(bundle.languageOverride, 'fr');
      assert.deepEqual(bundle.settings.detection.blacklistedDomains, ['backup-skip.example']);
      assert.deepEqual(Object.keys(bundle.detectors.detectors.antibot), ['detect-backup-rule'], 'only the person\'s own rules, never the official ones');
      assert.deepEqual(bundle.history.items.map(i => i.id), ['b-one', 'b-two']);
      assert.equal(bundle.history.items[0].note, 'kept by the backup');
      for (const secret of ['SYNTHETIC', 'hooks.example', 'X-Key']) assert.ok(!fileText.includes(secret), `the backup leaks ${secret}`);
      console.log('PASS Back up writes one file with settings, the person\'s own rules and History, and no connection details');

      // Lose everything, then restore it (merge): the rule, History with its pin and note, the settings and the language are back
      await page.evaluate(async (id) => { await window.popupInstance.detectorManager.deleteDetector('antibot', id); }, myRule.id);
      await W(() => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items: [] }), scrapfly_language_override: 'en' }));
      await patch({ detection: { blacklistedDomains: [], cacheDuration: 9 }, debugMode: true });
      assert.equal(await hasRule(), false);
      await boot();
      await openData();
      await backupCard();
      await restoreFrom(fileText);
      await page.waitForSelector('.notification-confirm input[data-part]');
      const asked = await dialogText();
      assert.match(asked, /holds/);
      assert.match(asked, /Settings/);
      assert.match(asked, /Your rules \(1\)/);
      assert.match(asked, /History \(2 entries\)/);
      assert.equal(await page.$$eval('.notification-confirm input[data-part]', els => els.filter(e => e.checked).length), 3, 'every part starts selected');
      assert.equal(await page.$eval('input[name="restoreMode"][value="merge"]', el => el.checked), true, 'merge is the default');
      await confirmDialog();
      // The language that comes with the settings is shown last and reloads the popup: the stored state is the proof
      const restored = async () => (await get(['scrapfly_language_override', 'scrapfly_detectors', 'scrapfly_history']));
      for (let waited = 0; waited < 30000; waited += 500) {
        const state = await restored();
        if (state.scrapfly_language_override === 'fr' && /detect-backup-rule/.test(JSON.stringify(state.scrapfly_detectors)) && /b-one/.test(state.scrapfly_history || '')) break;
        await sleep(500);
      }
      await boot();
      assert.equal(await hasRule(), true, 'the rule is back');
      assert.deepEqual((await history()).map(i => [i.id, !!i.pinned, i.note || '']), [['b-one', true, 'kept by the backup'], ['b-two', false, '']]);
      let now2 = await stored();
      assert.deepEqual(now2.detection.blacklistedDomains, ['backup-skip.example']);
      assert.equal(now2.detection.cacheDuration, 5);
      assert.equal(now2.webhook.webhookUrl, 'https://hooks.example/SYNTHETIC_TOKEN_A', 'the connection that was never in the file is untouched');
      assert.equal(now2.webhook.webhookSecret, 'SYNTHETIC_SECRET_D', 'the signing secret, never in the file, is untouched');
      assert.equal((await get(['scrapfly_language_override'])).scrapfly_language_override, 'fr', 'the language came back');
      assert.match(await page.$eval('html', el => el.lang), /^fr/, 'and the popup is shown in it');
      await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
      await boot();
      console.log('PASS Restore brings back the rule, History with its pin and note, the settings and the language, and leaves connections alone');

      // Replace: what was added since is gone; the official rules stay; unselected parts are left alone
      await W(({ list }) => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items: list }) }), { list: [entry('extra-1'), entry('b-one')] });
      await page.evaluate(async (rule) => { await window.popupInstance.detectorManager.addDetector('captcha', 'detect-extra-rule', { ...rule, id: 'detect-extra-rule', name: 'Extra', category: 'CAPTCHA' }); }, myRule);
      await boot();
      await openData();
      await backupCard();
      await restoreFrom(fileText);
      await page.waitForSelector('.notification-confirm input[data-part]');
      await page.$eval('input[data-part="settings"]', el => el.click());
      await page.$eval('input[name="restoreMode"][value="replace"]', el => el.click());
      await confirmDialog();
      await page.waitForFunction(() => /Restored: Your rules \(1\), History \(2 entries\)/.test(document.body.textContent), null, { polling: 250 });
      assert.deepEqual((await history()).map(i => i.id).sort(), ['b-one', 'b-two'], 'Replace removed the entry added since');
      assert.equal(await page.evaluate(() => !!window.popupInstance.detectorManager.findDetectorById('detect-extra-rule')), false, 'Replace removed the other custom rule');
      assert.equal(await hasRule(), true);
      assert.equal(await page.evaluate(() => !!window.popupInstance.detectorManager.findDetectorById('detect-akamai')), true, 'the official rules stay');
      console.log('PASS Restore with Replace removes what was added since, keeps the official rules, and skips the parts that are unchecked');

      // Older single-purpose exports go to the importer they always had; files that are not backups are refused
      await W(() => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items: [] }) }));
      await boot();
      await openData();
      await backupCard();
      await restoreFrom({ version: '1.0', timestamp: new Date().toISOString(), itemsCount: 1, items: [entry('legacy-1')] });
      await page.waitForSelector('.notification-confirm');
      assert.match(await dialogText(), /Import History|Import 1 history items/i, 'the History importer asks its own question');
      await page.$eval('.notification-confirm .notification-btn-confirm', el => el.click());
      await dialogsGone();
      await page.waitForFunction(async () => (JSON.parse((await chrome.storage.local.get('scrapfly_history')).scrapfly_history || '{"items":[]}').items || []).some(i => i.id === 'legacy-1'), null, { polling: 250 });
      await restoreFrom('{"hello": "world"}');
      await page.waitForFunction(() => /not a backup of this extension/.test(document.body.textContent), null, { polling: 250 });
      await restoreFrom({ ...bundle, version: 2 });
      await page.waitForFunction(() => /made by a newer version/.test(document.body.textContent), null, { polling: 250 });
      assert.equal(await page.$$eval('.notification-confirm', els => els.length), 0, 'no dialog for a file that is refused');
      console.log('PASS an older History export goes to the History importer, and a file that is not a backup (or is from a newer version) is refused');
    }

    // ---- Presets and reset ----------------------------------------------------------------------------------------
    if (!only || 'presets'.includes(only)) {
      await boot();
      const stored = () => page.evaluate(() => StorageManager.readSettingsStrict());
      const patch = (value) => page.evaluate(async (v) => { if (!await StorageManager.patchSettings(v)) throw new Error('fixture failed'); }, value);
      const reload = async () => { await boot(); await openData(); };
      const presetsCard = () => page.$eval('[data-preset="privacy"]', el => el.closest('.settings-card').querySelector('.data-card-head').click());
      const dialogText = () => page.$eval('.notification-confirm', el => el.textContent);
      // The language is Spanish here (the presets must keep it), so the dialogs are read in Spanish: the wording comes from its locale file
      const spanish = JSON.parse(fs.readFileSync(path.join(REPO, '_locales', 'es', 'messages.json'), 'utf8'));
      const es = (key, ...args) => args.reduce((text, arg, i) => text.replace(`{${i}}`, arg), spanish[key].message);
      await patch({
        notificationsEnabled: true, debugMode: false, debugVerbose: false, logCollectorEnabled: false, jsApi: { enableJsApi: false },
        history: { historyEnabled: true, historyClearOnClose: false, historyBackup: 'off', historyExcludedDomains: ['bank.example'], historyLimit: 5000, historyMaxMB: 25 },
        detection: { cacheDuration: 3, cacheUnit: 'hours', blacklistedDomains: ['keep.example'] },
        webhook: { enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC_TOKEN', webhookHeaders: [{ name: 'X-Key', value: 'SYNTHETIC_KEY' }], webhookSecret: 'SYNTHETIC_SECRET' },
        share: { githubToken: 'SYNTHETIC_GITHUB' }
      });
      await W(() => chrome.storage.local.set({ scrapfly_language_override: 'es', scrapfly_theme: 'light' }));
      // A History bigger than the default limit (1000 pages): Reset must not trim it
      const pages = Array.from({ length: 1200 }, (_, i) => ({ id: `reset-${i}`, url: `https://r${i}.example/`, hostname: `r${i}.example`, title: `r${i}`,
        timestamp: Date.now() - i * 1000, detections: [{ detector: { name: 'X' }, category: 'Anti-Bot', confidence: 90 }], detectionCount: 1, categories: ['Anti-Bot'] }));
      await W((items) => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items }) }), pages);
      const historyCount = async () => { const raw = (await get(['scrapfly_history'])).scrapfly_history; return raw ? JSON.parse(raw).items.length : 0; };
      await reload();
      await presetsCard();
      const detectorsBefore = (await get(['scrapfly_detectors'])).scrapfly_detectors;

      // Privacy: the dialog lists exactly what changes, then it changes
      await page.click('[data-preset="privacy"]');
      await page.waitForSelector('.notification-confirm');
      const asked = await dialogText();
      assert.ok(asked.includes(es('presetConfirmTitleFmt', es('presetPrivacyName'))), 'the dialog names the preset');
      for (const key of ['presetHistoryOff', 'presetClearOnClose', 'presetWebhookOff', 'presetNotificationsOff']) assert.ok(asked.includes(es(key)), `${key} is listed`);
      for (const key of ['presetDebugOff', 'presetJsApiOff', 'presetBackupOff', 'presetCollectorOff']) assert.ok(!asked.includes(es(key)), `${key} is already so: not listed`);
      await confirmDialog();
      // (the Privacy preset turns notifications off, so no toast is expected: the saved settings are the proof)
      await page.waitForFunction(() => window.popupInstance.settings.settings.history.historyEnabled === false, null, { polling: 250 });
      let now = await stored();
      assert.equal(now.history.historyEnabled, false);
      assert.equal(now.history.historyClearOnClose, true);
      assert.equal(now.notificationsEnabled, false);
      assert.equal(now.webhook.enableWebhook, false);
      assert.equal(now.webhook.webhookUrl, 'https://hooks.example/SYNTHETIC_TOKEN', 'the webhook address is still there, only switched off');
      assert.deepEqual(now.detection.blacklistedDomains, ['keep.example']);
      assert.deepEqual(now.history.historyExcludedDomains, ['bank.example']);
      assert.equal(now.history.historyLimit, 5000, 'settings outside the preset keep their value');
      assert.equal(await page.$eval('#notificationsEnabled', el => el.checked), false, 'the form shows it');
      // Applying it again has nothing to change
      await page.click('[data-preset="privacy"]');
      await sleep(800);
      assert.equal(await page.$$eval('.notification-confirm', els => els.length), 0, 'no dialog when nothing changes');
      // Developer
      await page.click('[data-preset="developer"]');
      await page.waitForSelector('.notification-confirm');
      assert.ok((await dialogText()).includes(es('presetVerboseOn')), 'the Developer preset lists what it turns on');
      await confirmDialog();
      await page.waitForFunction(() => window.popupInstance.settings.settings.debugVerbose === true, null, { polling: 250 });
      now = await stored();
      assert.deepEqual([now.debugMode, now.debugVerbose, now.logCollectorEnabled, now.jsApi.enableJsApi], [true, true, true, true]);
      console.log('PASS the Privacy and Developer presets list what they change, change only that, and keep connections, site lists and the rest');

      // Reset: defaults everywhere except the site lists, the connections, the language, the theme and the rules
      await page.click('#resetSettingsBtn');
      await page.waitForSelector('.notification-confirm #resetConnections');
      assert.ok((await dialogText()).includes(es('settingsResetMessage').split('.')[0]), 'the reset says what it does');
      await confirmDialog();
      await page.waitForFunction(() => window.popupInstance.settings.settings.debugMode === false, null, { polling: 250 });
      now = await stored();
      assert.deepEqual([now.debugMode, now.debugVerbose, now.logCollectorEnabled, now.jsApi.enableJsApi, now.notificationsEnabled], [false, false, false, false, true], 'the defaults are back');
      assert.deepEqual([now.detection.cacheDuration, now.detection.cacheUnit], [7, 'days']);
      assert.deepEqual([now.history.historyEnabled, now.history.historyClearOnClose], [true, false]);
      assert.deepEqual([now.history.historyLimit, now.history.historyMaxMB], [5000, 25], 'how much History may hold is kept: a reset never deletes pages');
      await sleep(2500); // History's clean-up runs a moment after settings are saved
      assert.equal(await historyCount(), 1200, 'no page left History after the reset');
      assert.equal(now.webhook.enableWebhook, false);
      assert.equal(now.webhook.webhookUrl, 'https://hooks.example/SYNTHETIC_TOKEN', 'the webhook connection is kept');
      assert.equal(now.share.githubToken, 'SYNTHETIC_GITHUB', 'the sharing key is kept');
      assert.equal(now.webhook.webhookSecret, 'SYNTHETIC_SECRET', 'the signing secret is kept');
      assert.deepEqual(now.detection.blacklistedDomains, ['keep.example']);
      assert.deepEqual(now.history.historyExcludedDomains, ['bank.example']);
      const other = await get(['scrapfly_language_override', 'scrapfly_theme', 'scrapfly_detectors']);
      assert.equal(other.scrapfly_language_override, 'es');
      assert.equal(other.scrapfly_theme, 'light');
      assert.equal(JSON.stringify(other.scrapfly_detectors), JSON.stringify(detectorsBefore), 'the rules were not touched');
      assert.equal(await page.$eval('#notificationsEnabled', el => el.checked), true, 'the form shows the defaults');
      // And once more, removing the connections too
      await page.click('#resetSettingsBtn');
      await page.waitForSelector('.notification-confirm #resetConnections');
      await page.click('#resetConnections');
      await confirmDialog();
      await page.waitForFunction(() => window.popupInstance.settings.settings.webhook.webhookUrl === '', null, { polling: 250 });
      now = await stored();
      assert.equal(now.webhook.webhookUrl, '');
      assert.deepEqual(now.webhook.webhookHeaders, []);
      assert.equal(now.webhook.webhookSecret, '', 'removing the connections removes the signing secret too');
      assert.equal(now.share.githubToken, '');
      assert.deepEqual(now.detection.blacklistedDomains, ['keep.example'], 'the site lists stay even then');
      // A settings export (the plain one, not the backup) holds no secret either
      await patch({ webhook: { webhookSecret: 'SYNTHETIC_EXPORT_SECRET', webhookUrl: 'https://hooks.example/SYNTHETIC_EXPORT_URL' } });
      await reload();
      await page.$eval('#exportSettingsBtn', el => el.closest('.settings-card').querySelector('.data-card-head').click()); // the card starts collapsed
      const [exported] = await Promise.all([page.waitForEvent('download'), page.click('#exportSettingsBtn')]);
      const exportedText = fs.readFileSync(await exported.path(), 'utf8');
      for (const secret of ['SYNTHETIC_EXPORT', 'hooks.example']) assert.ok(!exportedText.includes(secret), `the settings export leaks ${secret}`);
      console.log('PASS a settings export holds no connection details and no signing secret');
      await presetsCard(); // the reload collapsed the presets card again
      // Cancel changes nothing
      await patch({ debugMode: true });
      await page.click('#resetSettingsBtn');
      await page.waitForSelector('.notification-confirm');
      await page.$eval('.notification-btn-cancel', el => el.click());
      await dialogsGone();
      assert.equal((await stored()).debugMode, true, 'Cancel keeps the settings');
      console.log('PASS Reset returns the settings to their defaults and keeps site lists, connections, language, theme and rules, unless the connections are removed');
    }

    assert.deepEqual(errors, [], 'no popup runtime exceptions');
    console.log(`RESULT ALL PASS${only ? ` (only ${only})` : ''}, no page errors`);
  } finally {
    try { if (context) await context.close(); } finally { fs.rmSync(profile, { recursive: true, force: true }); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
