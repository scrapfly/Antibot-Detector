#!/usr/bin/env node
/** Real popup regressions: unsupported pages, paused actions, and competing message listeners. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const REPO = path.resolve(process.argv[2] || path.join(__dirname, '..'));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-popup-guards-'));
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>Popup guards fixture</title><p>Local fixture</p>');
  });
  let context;
  let failed = 0;
  const check = async (name, fn) => {
    try { await fn(); console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
  };
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
      args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(() => { UpdateManager.runAutoUpdate = async () => ({}); });
    const errors = [];
    const popup = async tab => {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(target => {
        const query = chrome.tabs.query.bind(chrome.tabs);
        chrome.tabs.query = (info, callback) => {
          if (info?.active) {
            if (callback) { callback([target]); return; }
            return Promise.resolve([target]);
          }
          return query(info, callback);
        };
      }, tab);
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      await page.waitForFunction(() => window.popupInstance?.detection?.initialized && window.popupInstance?.settings?.settingsBaseline);
      return page;
    };
    const tabFor = url => worker.evaluate(async value => (await chrome.tabs.query({})).find(tab => tab.url === value), url);
    const restricted = await context.newPage();
    await restricted.goto('chrome://version/');
    let page = await popup(await tabFor(restricted.url()));
    await check('restricted page is unscanned, with no clean-result badges', async () => {
      await page.waitForFunction(() => window.popupInstance.detection.scanOutcome === 'unsupported', null, { timeout: 5000 });
      assert.equal(await page.locator('#emptyState .state-card-title').innerText(), 'This page cannot be scanned');
      assert.equal(await page.locator('#emptyState .state-card-badges').isVisible(), false);
      await page.evaluate(() => window.popupInstance.requestCurrentTabDetection());
      assert.equal(await page.evaluate(() => window.popupInstance.detection.scanOutcome), 'unsupported');
    });
    await page.close();
    await restricted.close();

    const site = await context.newPage();
    await site.goto(`http://127.0.0.1:${server.address().port}/`);
    const tab = await tabFor(site.url());
    page = await popup(tab);
    for (const mode of ['allowlist', 'blocklist']) {
      await check(`${mode}: only the correct paused-site action is rendered`, async () => {
        await page.evaluate(async scanMode => {
          const assertPatch = await StorageManager.patchSettings({ detection: { scanMode, allowedDomains: [], blacklistedDomains: ['127.0.0.1'] } });
          if (!assertPatch) throw new Error('settings patch failed');
          window.popupInstance.lastCheckTime = 0;
          await window.popupInstance.checkAndDisplayExistingDetection();
        }, mode);
        await page.waitForSelector('#blacklistWarning', { state: 'visible' });
        assert.equal(await page.locator('#allowSiteBtn').isVisible(), mode === 'allowlist');
        assert.equal(await page.locator('#removeFromBlacklistBtn').isVisible(), mode === 'blocklist');
      });
    }
    await check('two popups preserve Advanced History worker replies and settings writes', async () => {
      const second = await popup(tab);
      try {
        for (let i = 0; i < 3; i++) {
          const response = await page.evaluate(() => chrome.runtime.sendMessage({ type: AdvancedMessageTypes.ADVANCED_HISTORY, method: 'load', args: [] }));
          assert.equal(response.status, 'ok');
        }
        assert.equal(await page.evaluate(() => StorageManager.patchSettings({ detection: { scanMode: 'blocklist', blacklistedDomains: [] } })), true);
      } finally { await second.close(); }
    });
    await check('ordinary completed web scans still show their clean-result badges', async () => {
      await page.evaluate(() => {
        const detection = window.popupInstance.detection;
        detection.blacklistedDomain = null;
        detection.showEmptyState();
      });
      assert.equal(await page.locator('#emptyState .state-card-title').innerText(), 'Nothing Detected');
      assert.equal(await page.locator('#emptyState .state-card-badges').isVisible(), true);
    });
    assert.deepEqual(errors, [], 'no popup runtime exceptions');
    if (failed) throw new Error(`${failed} popup guard scenarios failed`);
    console.log('RESULT ALL PASS');
  } finally {
    if (context) await context.close();
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
