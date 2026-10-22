#!/usr/bin/env node
/** Deterministic popup checks for the 2.8.6 ownership and lifecycle changes. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const REPO = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const output = path.join(os.tmpdir(), 'antibot-286-ui');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-')), {
    headless: true, channel: 'chromium', viewport: { width: 400, height: 600 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'Win32' }));
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { polling: 250 });
    assert.equal(await page.evaluate(async () => {
      const result = await chrome.runtime.sendMessage({ type: 'GET_DETECTION_DATA', tabId: -1 });
      return typeof result?.status;
    }), 'string', 'worker router answers after cold startup');
    console.log('PASS worker and popup boot from the new module graph');

    await page.evaluate(async () => {
      await chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items: [{
        id: 'ui-probe', url: 'https://example.test/catalog', hostname: 'example.test',
        title: 'A saved page with a long title for the History layout check', timestamp: Date.now(),
        detections: [
          { detector: { id: 'cloudflare', name: 'Cloudflare', difficulty: 'Medium' }, category: 'antibot', confidence: 95, matches: [] },
          { detector: { id: 'turnstile', name: 'Turnstile', difficulty: 'Medium' }, category: 'captcha', confidence: 90, matches: [] },
          { detector: { id: 'canvas', name: 'Canvas' }, category: 'fingerprint', confidence: 50, matches: [] }
        ]
      }] }) });
      await window.popupInstance.switchTab('history');
    });
    await page.waitForSelector('.history-item-bottom .history-metrics');
    assert.equal(await page.locator('.history-subline .history-metrics').count(), 0);
    assert.ok(await page.evaluate(() => {
      const bottom = document.querySelector('.history-item-bottom').getBoundingClientRect();
      return [...document.querySelectorAll('.history-item-bottom > *')].every(el => {
        const box = el.getBoundingClientRect();
        return box.left >= bottom.left - 1 && box.right <= bottom.right + 1;
      });
    }), 'summary fits the lower row at popup width');
    await page.screenshot({ path: path.join(output, 'history-dark.png') });
    await page.locator('#nav-history').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.popupInstance.currentTab === 'rules', null, { polling: 250 });
    assert.equal(await page.locator('#nav-rules').getAttribute('aria-selected'), 'true');
    console.log('PASS lower-row History metrics and keyboard tab navigation');

    await page.evaluate(async () => {
      await window.popupInstance.switchTab('history');
      window.popupInstance.history.showHistoryItemDetails(window.popupInstance.history.historyItems[0]);
    });
    assert.ok(await page.evaluate(() => document.querySelector('#historyDetailModal').contains(document.activeElement)));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#historyDetailModal', { state: 'hidden' });

    await page.evaluate(() => {
      window.probeOwner = Object.create(BaseAdvancedModule.prototype);
      window.probeOwner.openKitModal({ title: 'Parent result', body: '<button id="nested-export">Export code</button>' });
      document.querySelector('#nested-export').onclick = () => AdvancedCodeDialog.open(window.probeOwner, {
        title: 'Child code', languages: [{ id: 'javascript', label: 'JavaScript' }],
        getCode: () => 'console.log("synthetic");'
      });
    });
    await page.locator('#nested-export').click();
    await page.waitForSelector('.advanced-code-dialog');
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => document.querySelector('.advanced-code-dialog').contains(document.activeElement)), 'focus stays in the child dialog');
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('.advanced-code-dialog', { state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'nested-export');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.adv-kit-overlay', { state: 'detached' });
    console.log('PASS nested dialog focus and Escape restoration');

    await page.evaluate(() => ScrapflyExport.open({ url: 'https://example.test/' }));
    for (const language of ['curl', 'cli']) {
      await page.locator(`#scrapflyExportTab-${language}`).click();
      assert.match(await page.locator('.scrapfly-export-step.is-key code').textContent(), /^export SCRAPFLY_API_KEY=/);
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('.adv-kit-overlay', { state: 'detached' });
    console.log('PASS Windows terminal tabs show matching Bash setup');

    // Finalized empty and failed scans share layout, but never the same claim.
    await page.evaluate(async () => {
      await window.popupInstance.switchTab('detection');
      const detection = window.popupInstance.detection;
      detection.isExtensionEnabled = true;
      detection.blacklistedDomain = null;
      detection.showEmptyState({ outcome: 'failed' });
    });
    assert.equal(await page.locator('#emptyState .state-card-title').textContent(), 'Scan failed');
    await page.evaluate(async () => {
      await I18n.loadOverride('ar');
      window.popupInstance.detection.showEmptyState({ outcome: 'interrupted' });
      document.documentElement.setAttribute('data-theme', 'light');
    });
    assert.equal(await page.locator('#emptyState .state-card-title').textContent(), 'توقف الفحص');
    await page.screenshot({ path: path.join(output, 'interrupted-ar.png') });
    console.log('PASS failed/interrupted scan copy and Arabic locale');
    assert.deepEqual(errors, [], 'no popup runtime exceptions');
    console.log(`PASS popup verification; screenshots: ${output}`);
  } finally {
    await context.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
