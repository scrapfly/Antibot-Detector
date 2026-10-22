#!/usr/bin/env node
/**
 * Settings modal persistence in the unpacked extension:
 * draft Save/Cancel, concurrent mutations, rejected writes, and portable imports.
 * All values are synthetic and automatic rule downloads are stubbed.
 *
 * Not part of `npm run verify`: requires Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   node scripts/e2e-settings-modal.js [repository]
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
const REPO = path.resolve(process.argv[2] || path.join(__dirname, '..'));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-settings-modal-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      channel: 'chromium',
      viewport: { width: 420, height: 650 },
      args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    // Saving auto-update is part of this test; actual downloads belong to
    // e2e-updater. Keep this profile entirely independent of live rule releases.
    await worker.evaluate(() => {
      UpdateManager.runAutoUpdate = async () => ({ testOnly: true });
    });

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline
      && window.popupInstance?.detectorManager?.initialized, null, { polling: 250 });
    await page.evaluate(async () => {
      const saved = await StorageManager.patchSettings({
        debugMode: false,
        logCollectorEnabled: false,
        updates: { autoUpdate: false, checkIntervalHours: 168, lastCheckTimestamp: Date.now() },
        detection: { blacklistedDomains: ['saved.example'] },
        webhook: {
          enableWebhook: false,
          webhookUrl: 'https://hooks.example/SYNTHETIC_EXISTING',
          webhookHeaders: [{ name: 'X-Test', value: 'SYNTHETIC_EXISTING' }],
          webhookPayload: 'SYNTHETIC_EXISTING',
          webhookSecret: 'SYNTHETIC_EXISTING'
        },
        share: {
          provider: 'dpaste_com',
          githubToken: 'SYNTHETIC_EXISTING',
          customUrl: 'https://upload.example/SYNTHETIC_EXISTING'
        }
      });
      if (!saved) throw new Error('Settings fixture setup failed');
      await chrome.storage.local.set({ scrapfly_language_override: 'en' });
      globalThis.settingsReviewNotices = [];
      for (const type of ['error', 'success']) {
        const original = NotificationHelper[type].bind(NotificationHelper);
        NotificationHelper[type] = (...args) => {
          settingsReviewNotices.push(type);
          return original(...args);
        };
      }
    });

    const stored = () => page.evaluate(() => StorageManager.readSettingsStrict());
    // Direct DOM clicks exercise the real listeners without waiting for popup
    // animations to become stable; inputs in styled switches may be hidden.
    const click = selector => page.$eval(selector, element => element.click());
    const open = async () => {
      await click('#settingsBtn');
      await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 250 });
      await page.evaluate(() => window.popupInstance.settings.loadSettings());
    };
    const tab = name => click(`.settings-tab-btn[data-settings-tab="${name}"]`);
    const notices = () => page.evaluate(() => settingsReviewNotices);
    const clearNotices = () => page.evaluate(() => { settingsReviewNotices = []; });
    const failWrites = () => worker.evaluate(() => {
      globalThis.settingsReviewOriginalSet = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = values => Object.prototype.hasOwnProperty.call(values, 'scrapfly_settings')
        ? Promise.reject(new Error('Synthetic write failure'))
        : settingsReviewOriginalSet(values);
    });
    const restoreWrites = () => worker.evaluate(() => {
      chrome.storage.local.set = settingsReviewOriginalSet;
    });
    const importFile = data => page.locator('#importFile').setInputFiles({
      name: 'synthetic-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data))
    });

    // 1. Ordinary preferences stay staged until Save, including exclusions.
    await open();
    await tab('general');
    await click('#autoUpdate');
    await page.selectOption('#checkIntervalHours', '6');
    await tab('detection');
    await click('.remove-blacklist-btn[data-domain="saved.example"]');
    assert.equal((await stored()).updates.autoUpdate, false);
    assert.deepEqual((await stored()).detection.blacklistedDomains, ['saved.example']);
    await click('#cancelSettingsBtn');
    await open();
    assert.equal(await page.$eval('#autoUpdate', element => element.checked), false);
    assert.equal(await page.$eval('#checkIntervalHours', element => element.value), '168');
    assert.equal(await page.locator('.remove-blacklist-btn[data-domain="saved.example"]').count(), 1);
    console.log('PASS modal stages schedule/domain changes and Cancel restores saved values');

    // 2. Changes from another client/worker while the form is open survive.
    await tab('general');
    await click('#autoUpdate');
    await page.selectOption('#checkIntervalHours', '6');
    await tab('detection');
    await click('.remove-blacklist-btn[data-domain="saved.example"]');
    await page.evaluate(async () => {
      if (!await StorageManager.setDomainExcluded('concurrent.example', true)) {
        throw new Error('Concurrent domain fixture failed');
      }
      if (!await StorageManager.patchSettings({ updates: { lastCheckTimestamp: 123456789 } })) {
        throw new Error('Concurrent update fixture failed');
      }
    });
    await clearNotices();
    await page.evaluate(() => window.popupInstance.settings.handleSaveSettings());
    assert.equal(await page.$eval('#settingsModal', element => element.classList.contains('is-open')), false);
    let current = await stored();
    assert.equal(current.updates.autoUpdate, true);
    assert.equal(current.updates.checkIntervalHours, 6);
    assert.equal(current.updates.lastCheckTimestamp, 123456789);
    assert.deepEqual(current.detection.blacklistedDomains, ['concurrent.example']);
    assert.deepEqual(await notices(), ['success']);
    console.log('PASS Save persists draft while retaining concurrent domain and updater metadata');

    // 3. Simulate a storage rejection in the actual service worker.
    await open();
    await tab('general');
    await click('#autoUpdate');
    await clearNotices();
    await failWrites();
    await page.evaluate(() => window.popupInstance.settings.handleSaveSettings());
    assert.equal(await page.$eval('#settingsModal', element => element.classList.contains('is-open')), true);
    assert.equal((await stored()).updates.autoUpdate, true);
    assert.equal(await page.evaluate(() => window.popupInstance.settings.settings.updates.autoUpdate), false);
    assert.deepEqual(await notices(), ['error']);
    console.log('PASS rejected worker write keeps modal/draft and emits one error');

    // 4. Failed imports cannot mutate the model or the separate language key.
    const before = await page.evaluate(() => JSON.stringify(window.popupInstance.settings.settings));
    const imported = {
      settings: {
        debugMode: true,
        webhook: {
          webhookUrl: 'https://untrusted.example/replaced',
          webhookHeaders: [{ name: 'X-Test', value: 'SYNTHETIC_REPLACEMENT' }],
          webhookSecret: 'SYNTHETIC_REPLACEMENT'
        },
        share: { githubToken: 'SYNTHETIC_REPLACEMENT', customUrl: 'https://untrusted.example/replaced' }
      }
    };
    await tab('data');
    await clearNotices();
    await importFile({ ...imported, languageOverride: 'es' });
    await page.waitForFunction(() => settingsReviewNotices.length === 1, null, { polling: 250 });
    assert.deepEqual(await notices(), ['error']);
    assert.equal(await page.evaluate(() => JSON.stringify(window.popupInstance.settings.settings)), before);
    assert.equal(await page.evaluate(async () => (await chrome.storage.local.get('scrapfly_language_override')).scrapfly_language_override), 'en');
    assert.equal((await stored()).debugMode, false);
    console.log('PASS failed file import preserves model, saved preferences and language');

    // 5. Old exports containing connections still import only preferences.
    await restoreWrites();
    await clearNotices();
    await importFile(imported);
    await page.waitForFunction(() => settingsReviewNotices.length === 1, null, { polling: 250 });
    assert.deepEqual(await notices(), ['success']);
    current = await stored();
    assert.equal(current.debugMode, true);
    assert.equal(current.webhook.webhookUrl, 'https://hooks.example/SYNTHETIC_EXISTING');
    assert.equal(current.webhook.webhookHeaders[0].value, 'SYNTHETIC_EXISTING');
    assert.equal(current.webhook.webhookSecret, 'SYNTHETIC_EXISTING', 'an imported file never replaces the signing secret');
    assert.equal(current.share.githubToken, 'SYNTHETIC_EXISTING');
    assert.equal(current.share.customUrl, 'https://upload.example/SYNTHETIC_EXISTING');
    console.log('PASS successful portable import keeps existing local webhook/share connections');

    // 6. Colours: the toolbar uses the colours the modal shows, and a tag colour chosen there reaches every chip
    await open();
    await tab('general');
    const shown = await page.evaluate(() => ({
      low: document.querySelector('#colorBadgeLow').value, medium: document.querySelector('#colorBadgeMedium').value, high: document.querySelector('#colorBadgeHigh').value
    }));
    assert.deepEqual(await worker.evaluate(() => CategoryManager.getBadgeColors()), shown, 'the toolbar badge starts from the colours Settings shows');
    assert.equal(await page.evaluate(() => window.popupInstance.detectorManager.categoryManager.getTagColor('dom').toLowerCase()),
      await page.$eval('#colorTagDOM', input => input.value.toLowerCase()), 'a chip starts from the colour Settings shows for the tag');
    await page.$eval('#colorTagDOM', input => {
      input.value = '#123456';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.evaluate(() => window.popupInstance.settings.handleSaveSettings());
    assert.equal((await stored()).tagColors.dom, '#123456');
    // The worker syncs it into the categories the chips read, and the open popup follows without being reopened
    await page.waitForFunction(() => window.popupInstance.detectorManager.categoryManager.getTagColor('dom') === '#123456', null, { polling: 250 });
    assert.equal(await worker.evaluate(() => detectorManager.categoryManager.getTagColor('dom')), '#123456');
    console.log('PASS the toolbar badge and the tag chips use the colours of Settings, a new tag colour reaches the open popup');

    assert.deepEqual(errors, [], 'no popup runtime exceptions');
    console.log('RESULT ALL PASS: 6 modal scenarios, no page errors');
  } finally {
    try {
      if (context) await context.close();
    } finally {
      // Only this run's mkdtemp directory is eligible for removal.
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
