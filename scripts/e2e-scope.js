#!/usr/bin/env node
/**
 * Settings → Detection → Sites to scan, end to end, in the real extension (unpacked in Chromium):
 *
 *   Skipped sites   "every site except these": a skipped host is not scanned, every other host is
 *   Chosen sites    "only these sites": switching the mode in Settings, adding the current page to the list, Save;
 *                   a chosen site and its subdomains are scanned, every other site is paused (nothing stored)
 *   Paused card     the Detection tab of a paused site offers "Scan this site" (and hides "Block this domain"),
 *                   which adds the site and scans it; the History menu offers the same
 *   Back            switching back to the skipped sites keeps both lists
 *   Tab switch      returning to the tab of a skipped (or not chosen) site scans nothing, also after the worker was
 *                   restarted: nothing was cached for it, so the tab switch used to ask for a scan that stored and recorded it
 *
 * One local server answers on 127.0.0.1, localhost and a.localhost, so a site is told apart by its host. A probe rule
 * (a marker in the page) makes a real scan leave a result in the detection cache: a scanned page has an entry there, a
 * paused one never does.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:scope
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/p') {
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end('<!doctype html><html><head><title>Scope probe</title></head><body><p>scope-probe-marker</p></body></html>');
  }
  res.writeHead(404); res.end();
});

const PROBE = {
  id: 'detect-scopeprobe', name: 'Scope Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium', version: '1.0.0',
  lastUpdated: '2026-10-20', icon: 'custom.png', description: 'Scope probe',
  detection: { content: [{ id: 'scope-marker', text: 'scope-probe-marker', confidence: 90, standalone: true, description: 'scope-marker' }] }
};

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const at = (host, query = '') => `http://${host}:${port}/p${query}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-scope-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
      args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });
    const errors = [];

    const popupPage = async (activeTab) => {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      if (activeTab) {
        await page.addInitScript((tab) => {
          const original = chrome.tabs.query.bind(chrome.tabs);
          chrome.tabs.query = (info, cb) => { if (info && info.active) { if (cb) { cb([tab]); return undefined; } return Promise.resolve([tab]); } return original(info, cb); };
        }, activeTab);
      }
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      await page.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized);
      return page;
    };
    const stored = (page) => page.evaluate(() => StorageManager.readSettingsStrict());
    const patch = (page, value) => page.evaluate(async (v) => { if (!await StorageManager.patchSettings(v)) throw new Error('fixture failed'); }, value);
    const entries = (host) => worker.evaluate(async (h) => Object.values((await chrome.storage.local.get('scrapfly_detection_storage')).scrapfly_detection_storage || {})
      .filter(entry => new URL(entry.url).hostname === h).length, host);
    const wipeCache = () => worker.evaluate(() => chrome.storage.local.remove('scrapfly_detection_storage'));
    const visit = async (url) => {
      const page = await context.newPage();
      page.on('pageerror', () => {});
      await page.goto(url, { waitUntil: 'commit' });
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await sleep(6000);
      const tab = await worker.evaluate(async (u) => (await chrome.tabs.query({})).find(t => t.url === u) || null, url);
      return { page, tab };
    };

    // Open a paused site in one tab and a scanned one in another, then return to the paused tab: nothing may be
    // scanned, cached or recorded for it, and its badge stays the paused one
    const PAUSED_BADGE = [30, 41, 59, 255]; // BADGE.COLORS.BLACKLISTED, #1e293b
    const returnToTab = async (pausedHost, otherHost, query) => {
      const count = (host) => worker.evaluate(async (h) => ({
        cached: Object.values((await chrome.storage.local.get('scrapfly_detection_storage')).scrapfly_detection_storage || {})
          .filter(entry => new URL(entry.url).hostname === h).length,
        history: (await HistoryStore.read(chrome.storage.local)).filter(entry => entry && entry.hostname === h).length
      }), host);
      const before = await count(pausedHost);
      const paused = await visit(at(pausedHost, query));
      const other = await visit(at(otherHost, query));
      // As after Chrome stops the idle worker and starts it again: its in-memory scan sessions are gone, only storage
      // remains (while the worker stays up, the page's unfinished hook session happens to block the request)
      await worker.evaluate(() => { detectionStates.clear(); activeDetections.clear(); });
      await paused.page.bringToFront();
      await sleep(6000);
      const after = await count(pausedHost);
      const badge = paused.tab ? await worker.evaluate((id) => chrome.action.getBadgeBackgroundColor({ tabId: id }), paused.tab.id) : null;
      await paused.page.close(); await other.page.close();
      return { before, after, badge };
    };

    // Setup: the probe rule, results cached per full address, a known state
    const admin = await popupPage();
    await admin.evaluate(async (rule) => { await window.popupInstance.detectorManager.addDetector('antibot', rule.id, rule); await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r())); }, PROBE);
    await patch(admin, { detection: { cacheScope: 'full', scanMode: 'blocklist', blacklistedDomains: ['localhost'], allowedDomains: [] }, debugMode: false });
    await admin.evaluate(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
    await sleep(1500);
    await wipeCache();

    // 1. Skipped sites: localhost is skipped, 127.0.0.1 is scanned
    let page = (await visit(at('localhost', '?s=1'))).page; await page.close();
    assert.equal(await entries('localhost'), 0, 'a skipped site leaves nothing in the cache');
    page = (await visit(at('127.0.0.1', '?s=1'))).page; await page.close();
    assert.ok(await entries('127.0.0.1') >= 1, 'every other site is scanned');
    console.log('PASS Skipped sites: the listed host is not scanned, every other host is');

    // 1b. Returning to the tab of a skipped site scans nothing
    let back = await returnToTab('localhost', '127.0.0.1', '?t=1');
    assert.deepEqual(back.after, back.before, 'returning to the tab of a skipped site scans, caches and records nothing');
    assert.deepEqual(back.badge, PAUSED_BADGE, 'and its badge stays paused');
    console.log('PASS Tab switch: returning to the tab of a skipped site scans nothing');

    // 2. Chosen sites, through Settings: the mode, the empty list, Add Current Page, Save
    await admin.reload();
    await admin.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized);
    await admin.$eval('#settingsBtn', el => el.click());
    await admin.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'));
    await admin.$eval('.settings-tab-btn[data-settings-tab="detection"]', el => el.click());
    // The card is collapsed until its heading is clicked, like the other cards of the tab
    const expandSites = async () => { await admin.$eval('#scanMode', el => el.closest('.settings-card').querySelector(':scope > .settings-row--head:not([hidden])').click()); await admin.waitForSelector('#scanMode', { state: 'visible' }); };
    await expandSites();
    const shown = () => admin.$$eval('[data-scan-mode-show]', els => els.filter(el => !el.hidden).map(el => el.dataset.scanModeShow));
    const visible = () => admin.$$eval('#settingsModal [data-scan-mode-show]', els => els.filter(el => !el.hidden && el.getBoundingClientRect().width > 0).map(el => el.dataset.scanModeShow));
    assert.equal(await admin.$eval('#scanMode', el => el.value), 'blocklist');
    assert.equal(await admin.$$eval('#blacklistContainer .blacklist-item', els => els.length), 1, 'the skipped list shows localhost');
    await admin.selectOption('#scanMode', 'allowlist');
    assert.equal(await admin.$eval('#scanMode', el => el.value), 'allowlist');
    assert.ok((await shown()).every(mode => mode === 'allowlist') && (await shown()).length >= 2, 'only the allowlist titles are shown');
    assert.match(await admin.$eval('#blacklistContainer', el => el.textContent), /No sites chosen/);
    assert.deepEqual((await stored(admin)).detection.scanMode, 'blocklist', 'the mode is staged until Save');
    await admin.evaluate((port) => {
      const original = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = (info, cb) => { const tab = { id: 1, url: `http://localhost:${port}/p` }; if (info && info.active) { if (cb) { cb([tab]); return undefined; } return Promise.resolve([tab]); } return original(info, cb); };
    }, port);
    await admin.$eval('#addCurrentDomainBtn', el => el.click());
    await admin.waitForFunction(() => /localhost/.test(document.querySelector('#blacklistContainer').textContent));
    assert.equal(await admin.$$eval('#blacklistContainer .blacklist-item', els => els.length), 1);
    await admin.$eval('#addCurrentDomainBtn', el => el.click());   // already there: nothing is added twice
    assert.equal(await admin.$$eval('#blacklistContainer .blacklist-item', els => els.length), 1);
    await admin.evaluate(() => window.popupInstance.settings.handleSaveSettings());
    await admin.waitForFunction(() => window.popupInstance.settings.settings.detection.scanMode === 'allowlist');
    let now = await stored(admin);
    assert.equal(now.detection.scanMode, 'allowlist');
    assert.deepEqual(now.detection.allowedDomains, ['localhost']);
    assert.deepEqual(now.detection.blacklistedDomains, ['localhost'], 'the skipped list is kept for when the person switches back');
    void visible;
    console.log('PASS Chosen sites: the mode is staged, the list starts empty, Add Current Page adds once, Save keeps both lists');

    // 3. Scanning follows the list: the chosen site and its subdomains, nothing else
    await wipeCache();
    await sleep(500);
    page = (await visit(at('127.0.0.1', '?c=1'))).page; await page.close();
    assert.equal(await entries('127.0.0.1'), 0, 'a site that is not chosen is not scanned');
    page = (await visit(at('localhost', '?c=1'))).page; await page.close();
    assert.ok(await entries('localhost') >= 1, 'the chosen site is scanned');
    page = (await visit(at('a.localhost', '?c=1'))).page; await page.close();
    assert.ok(await entries('a.localhost') >= 1, 'a subdomain of a chosen site is scanned');
    console.log('PASS Chosen sites: the site and its subdomains are scanned, any other site is not');

    // 3b. Returning to the tab of a site that is not chosen scans nothing either
    back = await returnToTab('127.0.0.1', 'localhost', '?t=2');
    assert.deepEqual(back.after, back.before, 'returning to the tab of a site that is not chosen scans, caches and records nothing');
    assert.deepEqual(back.badge, PAUSED_BADGE, 'and its badge stays paused');
    console.log('PASS Tab switch: returning to the tab of a site that is not chosen scans nothing');

    // 4. The paused card of a site that is not chosen: its own words, no "Block this domain", and "Scan this site" works
    const blocked = await visit(at('127.0.0.1', '?c=2'));
    const popup = await popupPage(blocked.tab);
    await popup.waitForFunction(() => document.querySelector('#blacklistWarning') && getComputedStyle(document.querySelector('#blacklistWarning')).display !== 'none', null, { timeout: 15000 });
    const card = await popup.evaluate(() => ({
      visible: [...document.querySelectorAll('#blacklistWarning [data-scan-mode-show]')].filter(el => !el.hidden).map(el => el.textContent.trim().replace(/\s+/g, ' ')),
      blockHidden: document.querySelector('#addToBlacklistBtn').hidden,
      domain: document.querySelector('#blacklistDomain').textContent
    }));
    assert.equal(card.domain, '127.0.0.1');
    assert.deepEqual(card.visible, ['Detection paused: this site is not on your list', 'Scan this site', 'Or go to Settings → Detection → Sites to scan to manage the list.']);
    assert.equal(card.blockHidden, true, '"Block this domain" has no meaning in this mode');
    await popup.$eval('#nav-history', el => el.click());
    await popup.waitForSelector('#historyItemMenu [data-scan-mode-show]', { state: 'attached' });
    assert.equal(await popup.$eval('#historyItemMenu [data-scan-mode-show="allowlist"]', el => el.hidden), false, 'the History menu offers the action of this mode');
    assert.equal(await popup.$eval('#historyItemMenu [data-scan-mode-show="blocklist"]', el => el.hidden), true);
    await popup.$eval('#allowSiteBtn', el => el.click());
    await popup.waitForFunction(() => window.popupInstance.settings.settings, null, { timeout: 5000 });
    await sleep(2500);
    now = await stored(popup);
    assert.deepEqual(now.detection.allowedDomains.sort(), ['127.0.0.1', 'localhost'], 'the site joined the list');
    await popup.close(); await blocked.page.close();
    page = (await visit(at('127.0.0.1', '?c=3'))).page; await page.close();
    assert.ok(await entries('127.0.0.1') >= 1, 'now that it is chosen, it is scanned');
    console.log('PASS Paused card: its own words, "Block this domain" hidden, "Scan this site" adds the site and the site is scanned');

    // 5. Back to the skipped sites: both lists are as they were
    await admin.reload();
    await admin.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized);
    await admin.$eval('#settingsBtn', el => el.click());
    await admin.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'));
    await admin.$eval('.settings-tab-btn[data-settings-tab="detection"]', el => el.click());
    await expandSites();
    assert.equal(await admin.$eval('#scanMode', el => el.value), 'allowlist', 'the saved mode is shown');
    assert.equal(await admin.$$eval('#blacklistContainer .blacklist-item', els => els.length), 2, 'the chosen list shows both sites');
    await admin.selectOption('#scanMode', 'blocklist');
    assert.equal(await admin.$$eval('#blacklistContainer .blacklist-item', els => els.length), 1, 'the skipped list shows localhost');
    await admin.evaluate(() => window.popupInstance.settings.handleSaveSettings());
    await admin.waitForFunction(() => window.popupInstance.settings.settings.detection.scanMode === 'blocklist');
    now = await stored(admin);
    assert.deepEqual([now.detection.scanMode, now.detection.blacklistedDomains, now.detection.allowedDomains.sort()], ['blocklist', ['localhost'], ['127.0.0.1', 'localhost']]);
    await wipeCache();
    await sleep(500);
    page = (await visit(at('localhost', '?b=1'))).page; await page.close();
    assert.equal(await entries('localhost'), 0, 'localhost is skipped again');
    console.log('PASS Back: switching the mode back keeps both lists and the skipped site is skipped again');

    assert.deepEqual(errors, [], 'no popup runtime exceptions');
    console.log('RESULT ALL PASS, no page errors');
  } finally {
    try { if (context) await context.close(); } finally { server.close(); fs.rmSync(profile, { recursive: true, force: true }); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
