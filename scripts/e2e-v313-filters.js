#!/usr/bin/env node
/**
 * The 3.1.3 filters of the Detection and Rules tabs, end to end in the real extension (unpacked in Chromium):
 *
 *   Scan again        Detection → the button next to Clear cache, and the one on a page with no completed scan: the saved result
 *                     goes, the page reloads, the scanning screen shows until the new result arrives; a page that cannot be
 *                     scanned, a skipped site and the off switch get a toast and no reload
 *   Detection chips   one per category under the search: they filter the list, combine with the search, keep their state across
 *                     a new scan, say when nothing is left, and clear again; the row hides with the results
 *   Rules chips       the three categories, Custom, Edited and Disabled: they filter the list, combine with the search, keep what
 *                     the cards show (the Edited tag, the Custom tip), survive a redraw and clear again
 *   Look              both rows in the dark and the light theme, inside their card and header, no sideways scrolling
 *   First pages       a first page of results (one category header, two, three categories, two results, the highest-confidence
 *                     order) needs no scrolling: the last card ends above the pagination bar, chip row included
 *   Cache scope       Settings → Detection → Cache scope, saved with results showing: the results saved under the old scope go
 *                     (3.1.4), so the page shows the no-completed-scan card with the tab's markup kept, and the next scan lands
 *                     in the same tab (results, search, chips)
 *
 * A local site shows one marker per protection and probe detectors recognize them, so the scans are real.
 * The popup is opened as a page; its active tab is the local site's (chrome.tabs.query is told so), as in the other suites.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup
 *   node scripts/e2e-v313-filters.js [--only=<text>]        V313_SHOTS=<folder> also saves screenshots of both tabs, dark and light
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm run e2e:setup (or npm i --no-save playwright && npx playwright install chromium)');
  process.exit(2);
}
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const SHOTS = process.env.V313_SHOTS || '';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- Local site -----------------------------------------------------------------------------------
const MARKERS = { b: 'v313-bot-marker', c: 'v313-captcha-marker', f: 'v313-fingerprint-marker', b2: 'v313-bot2-marker', c2: 'v313-captcha2-marker' };
const loads = {}; // page name -> how many times the server sent it
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/p') {
    const name = url.searchParams.get('n') || 'page';
    loads[name] = (loads[name] || 0) + 1;
    const shown = Object.entries(MARKERS).filter(([flag]) => url.searchParams.get(flag) === '1').map(([, text]) => `<p>${text}</p>`).join('');
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(`<!doctype html><html><head><title>Filters ${name}</title></head><body>${shown}<p>probe page</p></body></html>`);
  }
  res.writeHead(404); res.end();
});

const probe = (id, name, category, marker) => ({
  id, name, author: 'Probe', enabled: true, category, difficulty: 'Medium', version: '1.0.0', lastUpdated: '2026-11-05',
  icon: 'custom.png', description: `${name}: a probe for the filter scenarios`,
  detection: { content: [{ id: `${id}-marker`, text: marker, confidence: 90, standalone: true, description: 'marker' }] }
});
const BOT = probe('detect-v313-bot', 'V313 Bot Probe', 'Anti-Bot', MARKERS.b);
const CAPTCHA = probe('detect-v313-captcha', 'V313 Captcha Probe', 'CAPTCHA', MARKERS.c);
const FINGERPRINT = probe('detect-v313-fingerprint', 'V313 Fingerprint Probe', 'Fingerprint', MARKERS.f);
const PROBES = [['antibot', BOT], ['captcha', CAPTCHA], ['fingerprint', FINGERPRINT]];
// Two more, so that a page can hold two results of one category (added when first needed)
const BOT2 = probe('detect-v313-bot2', 'V313 Bot Probe 2', 'Anti-Bot', MARKERS.b2);
const CAPTCHA2 = probe('detect-v313-captcha2', 'V313 Captcha Probe 2', 'CAPTCHA', MARKERS.c2);
const EXTRA_PROBES = [['antibot', BOT2], ['captcha', CAPTCHA2]];
const ALL = '&b=1&c=1&f=1';

// ---- Harness ---------------------------------------------------------------------------------------
const results = [];
async function scenario(name, fn) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return;
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`FAIL  ${name}\n      ${String((error && error.stack) || error).split('\n').slice(0, 8).join('\n      ')}`);
  }
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v313-filters-'));
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
  });
  let extId;
  const pageErrors = [];

  async function getWorker(ms = 40000) {
    const end = Date.now() + ms;
    let woke = 0;
    for (;;) {
      const sw = ctx.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
      if (sw) return sw;
      if (Date.now() > end) throw new Error('the extension service worker did not start');
      if (extId && Date.now() - woke > 4000) {
        woke = Date.now();
        const wake = await ctx.newPage();
        await wake.goto(`chrome-extension://${extId}/popup.html`).catch(() => {});
        await sleep(800);
        await wake.close();
      }
      await sleep(200);
    }
  }
  async function W(fn, arg) {
    const sw = await getWorker();
    return sw.evaluate(fn, arg);
  }
  const patchSettings = (patch) => W((p) => SettingsStore.mutate({ operation: 'patch', patch: p }).then(r => r.success === true), patch);
  async function until(check, ms = 20000, what = 'condition') {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(300);
    }
  }
  /** The site tab Chrome gave a page (looked up by its address). */
  const tabOf = (url) => W(async (u) => { const t = (await chrome.tabs.query({})).find(x => x.url === u); return t ? { id: t.id, url: t.url, windowId: t.windowId } : null; }, url);
  /** When the page's saved scan result was stored (under the key of any scope); a fresh scan changes it. 0 when there is none. */
  const cacheStamp = (url) => W(async (u) => {
    let storage = (await chrome.storage.local.get(DetectionEngineManager.STORAGE_KEY))[DetectionEngineManager.STORAGE_KEY] || {};
    if (typeof storage === 'string') storage = JSON.parse(storage);
    return Math.max(0, ...['domain', 'path', 'full'].map(scope => (storage[UrlUtils.hashUrl(u, scope)] || {}).timestamp || 0));
  }, url);
  let counter = 0;
  const uniq = () => `${Date.now().toString(36)}${counter++}`;

  /** Visit a page and wait until its scan is saved; the page stays open. */
  async function scanned(name, query = '') {
    const url = `${origin}/p?n=${name}${query}`;
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`site: ${e.message}`));
    await page.goto(url, { waitUntil: 'commit' }).catch(() => {});
    await until(() => cacheStamp(url), 25000, `the saved result of ${url}`);
    const tab = await until(() => tabOf(url), 5000, 'the tab');
    return { page, url, tab, name };
  }
  /** The popup, as a page whose active tab is `tab` (as the other suites do). */
  async function popupFor(tab, file = 'popup.html') {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${file}: ${e.message}`));
    if (tab) {
      await page.addInitScript((t) => {
        const original = chrome.tabs.query.bind(chrome.tabs);
        chrome.tabs.query = (info, cb) => { if (info && info.active) { if (cb) { cb([t]); return undefined; } return Promise.resolve([t]); } return original(info, cb); };
      }, tab);
    }
    await page.goto(`chrome-extension://${extId}/${file}`);
    await page.waitForFunction(() => window.popupInstance && window.popupInstance.detectorManager && window.popupInstance.detectorManager.initialized, null, { polling: 250, timeout: 30000 });
    return page;
  }
  /** The Detection tab shows `count` results of the scan (not a state card, not the scanning screen). */
  const resultsShown = (page, count) => page.waitForFunction((n) => {
    const d = window.popupInstance && window.popupInstance.detection;
    const box = document.querySelector('#detectionResults');
    return !!d && d.isShowingResults && d.currentResults.length === n && !!box && box.style.display === 'flex';
  }, count, { polling: 250, timeout: 30000 });
  const listed = (page) => page.evaluate(() => window.popupInstance.detection.paginationManager.filteredItems.map(d => d.detector.name));
  const cardsOnPage = (page) => page.$$eval('#resultsList .detector-name', els => els.map(el => el.textContent.trim()));
  const pressed = (page, selector) => page.$$eval(selector, els => els.map(el => `${el.dataset.filter}:${el.getAttribute('aria-pressed')}`));
  const toasts = (page) => page.$$eval('.notification-toast .notification-message', els => els.map(el => el.textContent.trim()));
  const setTheme = (page, value) => page.evaluate((v) => window.ScrapflyTheme.apply(v), value);
  async function shot(page, name, clip = { x: 0, y: 0, width: 400, height: 580 }) {
    if (!SHOTS) return;
    await sleep(450); // the cards fade in
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), clip });
  }
  /** What a row of chips looks like on screen: the lines it wraps to, whether it spills sideways, and the room it takes. */
  const rowMetrics = (page, selector) => page.$eval(selector, (row) => {
    const box = row.getBoundingClientRect();
    const chips = [...row.querySelectorAll('.history-filter-chip')].map(chip => chip.getBoundingClientRect());
    const lines = new Set(chips.map(rect => Math.round(rect.top)));
    return {
      visible: box.width > 0 && box.height > 0, lines: lines.size, height: Math.round(box.height), width: Math.round(box.width),
      spills: row.scrollWidth > row.clientWidth + 1 || chips.some(rect => rect.right > box.right + 1 || rect.left < box.left - 1),
      chipHeights: [...new Set(chips.map(rect => Math.round(rect.height)))]
    };
  });

  /** What a first page of results leaves: whether the shared scrollport has to scroll, its headers and cards, and how far the last card ends above the pagination bar. */
  const fitOf = (page) => page.evaluate(() => {
    const main = document.querySelector('#app > .main');
    const cards = [...document.querySelectorAll('#resultsList .detection-card')].map(card => card.getBoundingClientRect());
    const bar = document.querySelector('#detectionPagination').getBoundingClientRect();
    return {
      overflow: Math.max(0, main.scrollHeight - main.clientHeight), headers: document.querySelectorAll('#resultsList .detection-group-head').length,
      cards: cards.length, cardHeights: cards.map(rect => Math.round(rect.height)), gap: Math.round(bar.top - cards.at(-1).bottom)
    };
  });
  /** Settings → Detection → Cache scope, through the real modal: open it, pick the scope, save (which closes it). */
  async function saveCacheScope(popup, scope) {
    await popup.$eval('#settingsBtn', el => el.click());
    await popup.waitForFunction(() => { const modal = document.querySelector('#settingsModal'); return !!modal && modal.classList.contains('is-open'); }, null, { polling: 250, timeout: 10000 });
    await popup.$eval('.settings-tab-btn[data-settings-tab="detection"]', el => el.click());
    // The cache settings are a card that starts folded: open it
    await popup.$eval('#cacheScope', (select) => {
      const card = select.closest('.settings-card');
      if (card && card.classList.contains('is-collapsed')) card.querySelector(':scope > .settings-card-head').click();
    });
    await popup.waitForFunction(() => { const select = document.querySelector('#cacheScope'); return !!select && select.offsetParent !== null; }, null, { polling: 250, timeout: 10000 });
    await popup.selectOption('#cacheScope', scope);
    await popup.$eval('#saveSettingsBtn', el => el.click());
    await popup.waitForFunction(() => { const modal = document.querySelector('#settingsModal'); return !modal || !modal.classList.contains('is-open'); }, null, { polling: 250, timeout: 10000 });
  }
  /** What of the Detection tab's own markup is there: the list, the search, the chips and the pagination are what results are drawn into. */
  const markupOf = (page) => page.evaluate(() => ({
    list: !!document.querySelector('#resultsList'), search: !!document.querySelector('#detectionSearch'),
    chips: document.querySelectorAll('#detectionFilters .history-filter-chip').length, pagination: !!document.querySelector('#detectionPagination')
  }));
  /** until(), whose timeout message also says what of the Detection tab's markup is there. */
  async function untilDrawn(popup, check, ms, what) {
    try {
      return await until(check, ms, what);
    } catch (error) {
      throw new Error(`${error.message} (the tab's markup: ${JSON.stringify(await markupOf(popup))})`);
    }
  }
  async function ensureExtraProbes() {
    const admin = await popupFor(null);
    await admin.evaluate(async (list) => {
      const dm = window.popupInstance.detectorManager;
      for (const [category, rule] of list) if (!dm.getDetector(category, rule.id)) await dm.addDetector(category, rule.id, rule);
      await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
    }, EXTRA_PROBES);
    await admin.close();
    await sleep(1500);
  }

  // ---- Start-up: the probe detectors, English, the full address as cache key --------------------------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  const admin = await popupFor(null);
  await admin.evaluate(async (probes) => {
    for (const [category, rule] of probes) await window.popupInstance.detectorManager.addDetector(category, rule.id, rule);
    await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
  }, PROBES);
  await admin.close();
  await sleep(1500);
  await patchSettings({ detection: { cacheScope: 'full' } });
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

  // ===============================================================================================
  await scenario('Scan again: the button next to Clear cache rescans the page the popup shows; the scanning screen shows until the new result arrives', async () => {
    const { page: site, url, tab, name } = await scanned(`rescan-${uniq()}`, ALL);
    const popup = await popupFor(tab);
    await resultsShown(popup, 3);
    assert.deepEqual(await popup.$$eval('.url-action-buttons .url-action-btn', els => els.map(el => el.id)),
      ['scrapflyExportBtn', 'uploadPasteBtn', 'rescanBtn', 'clearCacheBtn', 'copyOverviewBtn', 'addToBlacklistBtn'], 'right before Clear cache');
    assert.equal(await popup.$eval('#rescanBtn', el => el.getAttribute('title')), 'Scan again now');
    assert.equal(await popup.$eval('#rescanBtn', el => el.getAttribute('aria-label')), 'Scan again now');
    const sizes = await popup.$$eval('.url-action-buttons .url-action-btn', els => els.map(el => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    assert.ok(sizes.every(([w, h]) => w === 28 && h === 28), `every action button is a 28px square: ${JSON.stringify(sizes)}`);
    const siteWidth = await popup.$eval('.url-display-container', el => Math.round(el.getBoundingClientRect().width));
    assert.ok(siteWidth >= 120, `the site tile keeps room for a host name: ${siteWidth}px`);
    await shot(popup, 'detection-results-dark');

    const first = await cacheStamp(url);
    const before = loads[name];
    await popup.evaluate(() => {
      window.__sawScan = false;
      const el = document.querySelector('#loadingState');
      new MutationObserver(() => { if (el.style.display !== 'none') window.__sawScan = true; }).observe(el, { attributes: true, attributeFilter: ['style'] });
    });
    await popup.$eval('#rescanBtn', el => el.click());
    await until(() => loads[name] > before, 10000, 'the page sent again');
    assert.equal(await popup.evaluate(() => window.__sawScan), true, 'the scanning screen showed while the page reloaded');
    assert.deepEqual(await popup.evaluate(() => window.popupInstance.detection.currentResults.length === 0 || window.popupInstance.detection.isShowingResults), true);
    const second = await until(async () => { const t = await cacheStamp(url); return t > first ? t : 0; }, 25000, 'a fresh saved result');
    assert.ok(second > first, 'the rescan produced a fresh scan, not the saved result again');
    await resultsShown(popup, 3);
    assert.equal(await popup.$eval('#loadingState', el => getComputedStyle(el).display), 'none', 'the scanning screen is gone');
    assert.deepEqual(await popup.evaluate(() => [window.popupInstance.detection.isRescanning, document.querySelector('#rescanBtn').disabled]), [false, false], 'free to scan again');
    await popup.close();
    await site.close();
  });

  // ===============================================================================================
  await scenario('Scan again on the card of a page with no completed scan: shown for none yet, failed and interrupted; not for a page that cannot be scanned or a clean result', async () => {
    const { page: site, url, tab, name } = await scanned(`deadend-${uniq()}`, ALL);
    const popup = await popupFor(tab);
    await resultsShown(popup, 3);
    const offered = async (options) => {
      await popup.evaluate((o) => window.popupInstance.detection.showEmptyState(o), options);
      return popup.$eval('#emptyRescanBtn', el => !el.hidden && el.offsetParent !== null);
    };
    assert.equal(await offered({ outcome: 'unscanned' }), true, 'no completed scan');
    assert.equal(await popup.$eval('#emptyRescanBtn', el => el.textContent.trim()), 'Scan again now');
    await shot(popup, 'detection-no-scan-dark');
    await setTheme(popup, 'light');
    await shot(popup, 'detection-no-scan-light');
    await setTheme(popup, 'dark');
    assert.equal(await offered({ outcome: 'failed' }), true, 'the scan failed');
    assert.equal(await offered({ outcome: 'interrupted' }), true, 'the scan was interrupted');
    assert.equal(await offered({ noCache: true, showBadges: false }), true, 'detection was just switched on');
    assert.equal(await offered({ outcome: 'unsupported' }), false, 'a page that cannot be scanned');
    assert.equal(await offered({}), false, 'a scan that found nothing');
    // The card's button does the same as the toolbar one
    assert.equal(await offered({ outcome: 'interrupted' }), true);
    const first = await cacheStamp(url);
    const before = loads[name];
    await popup.$eval('#emptyRescanBtn', el => el.click());
    await until(() => loads[name] > before, 10000, 'the page sent again');
    await until(async () => (await cacheStamp(url)) > first, 25000, 'a fresh saved result');
    await resultsShown(popup, 3);
    await popup.close();
    await site.close();
  });

  // ===============================================================================================
  await scenario('Scan again says why when it cannot: a page that cannot be scanned, a skipped site and the off switch each get a toast, and nothing reloads', async () => {
    const { page: site, tab, name } = await scanned(`refused-${uniq()}`, ALL);
    const popup = await popupFor(tab);
    await resultsShown(popup, 3);
    const refuse = async (expected) => {
      const before = loads[name];
      await popup.evaluate(() => window.popupInstance.detection.rescan());
      await until(async () => (await toasts(popup)).includes(expected), 8000, `the toast "${expected}"`);
      await sleep(1200);
      assert.equal(loads[name], before, `"${expected}": the page was not reloaded`);
      await popup.evaluate(() => document.querySelectorAll('.notification-toast').forEach(el => el.remove()));
    };
    // the extension's own page is not one the extension scans
    const own = await W(async (host) => { const t = (await chrome.tabs.query({})).find(x => x.url && x.url.startsWith(`chrome-extension://${host}/popup.html`)); return t && { id: t.id, url: t.url }; }, extId);
    await popup.evaluate((t) => { window.__real = chrome.tabs.query; chrome.tabs.query = async () => [t]; }, own);
    await refuse('This page cannot be scanned');
    await popup.evaluate((t) => { chrome.tabs.query = async () => [t]; }, tab);
    // a site the person skips
    assert.ok(await patchSettings({ detection: { blacklistedDomains: ['127.0.0.1'] } }));
    try { await refuse('This site is not scanned'); } finally { assert.ok(await patchSettings({ detection: { blacklistedDomains: [] } })); }
    // detection switched off
    await W(() => chrome.storage.local.set({ scrapfly_enabled: false }));
    await W(() => { cachedEnabledState = { value: false, timestamp: Date.now() }; });
    try { await refuse('Detection is switched off'); } finally {
      await W(() => chrome.storage.local.set({ scrapfly_enabled: true }));
      await W(() => { cachedEnabledState = { value: true, timestamp: Date.now() }; });
    }
    assert.deepEqual(await popup.evaluate(() => [window.popupInstance.detection.isRescanning, document.querySelector('#rescanBtn').disabled]), [false, false]);
    await popup.close();
    await site.close();
  });

  // ===============================================================================================
  await scenario('Scan again against a worker that does not know the message (older than the popup) says to reload the extension and reloads nothing', async () => {
    const { page: site, tab, name } = await scanned(`outdated-${uniq()}`, ALL);
    const popup = await popupFor(tab);
    await resultsShown(popup, 3);
    const hint = "The extension's background part is out of date. Reload the extension on the extensions page and try again.";
    // The worker as it was before this button: the router answers { status: 'unknown' } to a message with no handler. The popup's
    // files are read fresh on every open and the worker only when the extension is reloaded, so this is what a person sees after
    // updating the files without reloading
    await W(() => { delete __messageHandlerRegistry[WorkerMessages.RESCAN_TAB]; });
    try {
      const before = loads[name];
      await popup.$eval('#rescanBtn', el => el.click());
      await until(async () => (await toasts(popup)).includes(hint), 8000, 'the toast that says to reload the extension');
      await sleep(1200);
      assert.equal(loads[name], before, 'the page was not reloaded');
      assert.deepEqual(await popup.evaluate(() => [window.popupInstance.detection.isRescanning, document.querySelector('#rescanBtn').disabled]), [false, false], 'free to try again');
      assert.equal(await popup.evaluate(() => window.popupInstance.detection.isShowingResults), true, 'the results stay');
    } finally {
      await W(() => { Commands.registerHandlers(__messageHandlerRegistry); });
    }
    // with the handler back (the extension reloaded), the same button rescans
    await popup.evaluate(() => document.querySelectorAll('.notification-toast').forEach(el => el.remove()));
    const again = loads[name];
    await popup.$eval('#rescanBtn', el => el.click());
    await until(() => loads[name] > again, 10000, 'the page sent again');
    await popup.close();
    await site.close();
  });

  // ===============================================================================================
  await scenario('The popup says so when it opens if the background worker is older than its files; a current worker is not named', async () => {
    const hint = "The extension's background part is out of date. Reload the extension on the extensions page and try again.";
    const { page: site, tab } = await scanned(`staleopen-${uniq()}`, ALL);
    // a current worker: nothing is said
    let popup = await popupFor(tab);
    await resultsShown(popup, 3);
    await sleep(1500);
    assert.equal((await toasts(popup)).includes(hint), false, 'a current worker is not named');
    await popup.close();
    await W(() => { globalThis.__fingerprintHandler = __messageHandlerRegistry[WorkerMessages.WORKER_FINGERPRINT]; });
    try {
      // a worker from before the check does not know the question
      await W(() => { delete __messageHandlerRegistry[WorkerMessages.WORKER_FINGERPRINT]; });
      popup = await popupFor(tab);
      await until(async () => (await toasts(popup)).includes(hint), 8000, 'the toast on a worker that does not know the question');
      await popup.close();
      // a worker that runs another list of messages
      await W(() => { __messageHandlerRegistry[WorkerMessages.WORKER_FINGERPRINT] = ({ sendResponse }) => { sendResponse({ status: 'ok', fingerprint: '00000000-1' }); return false; }; });
      popup = await popupFor(tab);
      await until(async () => (await toasts(popup)).includes(hint), 8000, 'the toast on a worker with another list of messages');
      await popup.close();
    } finally {
      await W(() => { __messageHandlerRegistry[WorkerMessages.WORKER_FINGERPRINT] = globalThis.__fingerprintHandler; });
    }
    // the worker is current again: the next popup says nothing
    popup = await popupFor(tab);
    await resultsShown(popup, 3);
    await sleep(1500);
    assert.equal((await toasts(popup)).includes(hint), false, 'current again');
    await popup.close();
    await site.close();
  });

  // ===============================================================================================
  await scenario('Detection chips: one per category filter the list, combine with the search, say when nothing is left, and clear again', async () => {
    const { page: site, tab } = await scanned(`chips-${uniq()}`, ALL);
    const popup = await popupFor(tab);
    await resultsShown(popup, 3);
    await popup.waitForFunction(() => document.querySelector('#detectionFilters .history-filter-chip svg'), null, { polling: 250, timeout: 10000 });
    const chip = (key) => `#detectionFilters .history-filter-chip[data-filter="${key}"]`;
    const click = (key) => popup.$eval(chip(key), el => el.click());
    const chips = '#detectionFilters .history-filter-chip';

    // The row: a labelled group under the search, in the summary card, one chip per category in the category order
    assert.equal(await popup.$eval('#detectionFilters', el => el.getAttribute('aria-label')), 'Filter detections');
    assert.equal(await popup.$eval('#detectionFilters', el => el.getAttribute('role')), 'group');
    assert.deepEqual(await popup.$$eval(chips, els => els.map(el => el.textContent.trim())), ['Anti-bot', 'Captcha', 'Fingerprint', 'Combinations']);
    assert.deepEqual(await pressed(popup, chips), ['antibot:false', 'captcha:false', 'fingerprint:false', 'combinations:false'], 'off to start with');
    assert.ok(await popup.$eval('#detectionFilters', el => !!el.closest('#detectionOverview') && !!el.closest('.detection-search')), 'in the summary card, under the search');
    assert.ok(await popup.evaluate(() => document.querySelector('#detectionSearch').getBoundingClientRect().bottom <= document.querySelector('#detectionFilters').getBoundingClientRect().top), 'below the search field');
    assert.deepEqual(await popup.$$eval(`${chips} svg`, els => els.length), 4, 'every chip has its icon');
    assert.deepEqual(await popup.$$eval(chips, els => els.slice(0, 3).map(el => el.style.getPropertyValue('--chip-color'))), ['#FF5733', '#33C3FF', '#3b82f6'], 'the Settings → Category colours');
    const metrics = await rowMetrics(popup, '#detectionFilters');
    assert.equal(metrics.visible, true);
    assert.equal(metrics.spills, false, 'nothing spills out of the row');
    assert.deepEqual(metrics.chipHeights, [24], 'the chip size of History');
    assert.equal(metrics.lines, 1, 'four chips fit on one line');
    // the chips are buttons a keyboard reaches, with a name
    assert.deepEqual(await popup.$$eval(chips, els => els.map(el => [el.tagName, el.type, !!el.textContent.trim()])), [['BUTTON', 'button', true], ['BUTTON', 'button', true], ['BUTTON', 'button', true], ['BUTTON', 'button', true]]);
    // the whole list to start with: the three protections, two to a page
    assert.deepEqual(await listed(popup), ['V313 Bot Probe', 'V313 Captcha Probe', 'V313 Fingerprint Probe']);
    assert.deepEqual(await cardsOnPage(popup), ['V313 Bot Probe', 'V313 Captcha Probe']);
    assert.equal(await popup.$eval('#detectionNoResults', el => el.hidden), true);

    // The room the row takes: both cards of the first page still have to fit above the pagination, without scrolling
    const room = await fitOf(popup);
    console.log(`      first page: ${JSON.stringify(room)}`);
    assert.equal(room.overflow, 0, `the first page scrolls ${room.overflow}px: its second card is under the pagination bar`);
    assert.ok(room.gap >= 6, `the last card ends ${room.gap}px above the bar, which covers 6px above itself`);
    await shot(popup, 'detection-chips-off-dark');
    await shot(popup, 'detection-chips-row-dark', await popup.$eval('#detectionOverview', el => { const r = el.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 4), width: 400, height: Math.ceil(r.height + 8) }; }));

    // One chip: only that category, and the pagination says so
    await click('fingerprint');
    await until(async () => (await listed(popup)).length === 1, 5000, 'the fingerprint filter');
    assert.deepEqual(await listed(popup), ['V313 Fingerprint Probe']);
    assert.deepEqual(await cardsOnPage(popup), ['V313 Fingerprint Probe']);
    assert.deepEqual(await pressed(popup, chips), ['antibot:false', 'captcha:false', 'fingerprint:true', 'combinations:false']);
    assert.match(await popup.$eval('#detectionPagination .pagination-info', el => el.textContent.replace(/\s+/g, ' ').trim()), /1-1 of 1/);
    // (a page in the background does not run CSS transitions: read the colour with them off)
    const border = (key) => popup.$eval(chip(key), el => { el.style.transition = 'none'; return getComputedStyle(el).borderTopColor; });
    assert.notEqual(await border('fingerprint'), await border('captcha'), 'the pressed chip has a border of its own (the accent), not the quiet one');
    await shot(popup, 'detection-chip-on-dark');
    // Several: either of them
    await click('antibot');
    await until(async () => (await listed(popup)).length === 2, 5000, 'two categories');
    assert.deepEqual(await listed(popup), ['V313 Bot Probe', 'V313 Fingerprint Probe'], 'either, in the category order');
    // The search narrows what the chips left (AND), and nothing left says so with the way back
    await popup.fill('#detectionSearch', 'captcha');
    await until(async () => (await listed(popup)).length === 0, 5000, 'the search with the chips');
    assert.equal(await popup.$eval('#detectionNoResults', el => !el.hidden && el.offsetParent !== null), true, 'the message shows');
    assert.equal(await popup.$eval('#detectionNoResults p', el => el.textContent.trim()), 'No entries match your search or filters.');
    assert.equal(await popup.$eval('#detectionClearFilters', el => el.textContent.trim()), 'Clear filters');
    assert.deepEqual(await cardsOnPage(popup), []);
    await shot(popup, 'detection-no-match-dark');
    await popup.$eval('#detectionClearFilters', el => el.click());
    await until(async () => (await listed(popup)).length === 3, 5000, 'Clear filters');
    assert.deepEqual(await pressed(popup, chips), ['antibot:false', 'captcha:false', 'fingerprint:false', 'combinations:false'], 'every chip is off again');
    assert.equal(await popup.$eval('#detectionSearch', el => el.value), '', 'and the search is empty');
    assert.equal(await popup.$eval('#detectionNoResults', el => el.hidden), true);
    // The search alone still works, and a chip turned on after it keeps it
    await popup.fill('#detectionSearch', 'probe');
    await click('captcha');
    await until(async () => (await listed(popup)).length === 1, 5000, 'the search and a chip');
    assert.deepEqual(await listed(popup), ['V313 Captcha Probe']);
    await click('captcha');
    await until(async () => (await listed(popup)).length === 3, 5000, 'the chip off again');
    await popup.fill('#detectionSearch', '');
    // The keyboard: Space turns a chip on, Enter off
    await popup.focus(chip('captcha'));
    await popup.keyboard.press(' ');
    await until(async () => (await listed(popup)).length === 1, 5000, 'Space on the chip');
    await popup.keyboard.press('Enter');
    await until(async () => (await listed(popup)).length === 3, 5000, 'Enter on the chip');
    assert.equal(await popup.evaluate(() => document.activeElement && document.activeElement.dataset.filter), 'captcha', 'the focus stays on the chip');
    // Light theme
    await setTheme(popup, 'light');
    await shot(popup, 'detection-chips-off-light');
    await click('captcha');
    await until(async () => (await listed(popup)).length === 1, 5000, 'a chip in the light theme');
    await shot(popup, 'detection-chip-on-light');
    await shot(popup, 'detection-chips-row-light', await popup.$eval('#detectionOverview', el => { const r = el.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 4), width: 400, height: Math.ceil(r.height + 8) }; }));
    await click('captcha');
    await setTheme(popup, 'dark');
    await popup.close();
    await site.close();
  });

  // ===============================================================================================
  await scenario('Detection chips keep their state across a new scan, and the row goes with the results of a page with none', async () => {
    const { page: site, url, tab, name } = await scanned(`kept-${uniq()}`, ALL);
    const popup = await popupFor(tab);
    await resultsShown(popup, 3);
    await popup.$eval('#detectionFilters .history-filter-chip[data-filter="captcha"]', el => el.click());
    await until(async () => (await listed(popup)).length === 1, 5000, 'the Captcha chip');
    const first = await cacheStamp(url);
    const before = loads[name];
    await popup.$eval('#rescanBtn', el => el.click());
    await until(() => loads[name] > before, 10000, 'the page sent again');
    await until(async () => (await cacheStamp(url)) > first, 25000, 'a fresh saved result');
    await resultsShown(popup, 3);
    assert.deepEqual(await pressed(popup, '#detectionFilters .history-filter-chip'), ['antibot:false', 'captcha:true', 'fingerprint:false', 'combinations:false'], 'the chip is still on after the new scan');
    assert.deepEqual(await listed(popup), ['V313 Captcha Probe'], 'and the new results are filtered by it');
    assert.deepEqual(await cardsOnPage(popup), ['V313 Captcha Probe']);
    await popup.close();

    // A page with no detections: the summary card, and the row with it, is not shown
    const clean = await scanned(`clean-${uniq()}`);
    const cleanPopup = await popupFor(clean.tab);
    await cleanPopup.waitForFunction(() => { const empty = document.querySelector('#emptyState'); return !!empty && empty.style.display === 'flex'; }, null, { polling: 250, timeout: 30000 });
    assert.equal(await cleanPopup.$eval('#detectionFilters', el => el.getBoundingClientRect().width === 0 || el.offsetParent === null), true, 'no row without results');
    assert.equal(await cleanPopup.$eval('#emptyRescanBtn', el => el.hidden), true, 'and no Scan again card button on a scan that found nothing');
    await cleanPopup.close();
    await clean.page.close();
    await site.close();
  });

  // ===============================================================================================
  await scenario('"/" goes to the search box of the open tab (Detection, History, Rules), not from a field, with a modifier or with a dialog open', async () => {
    const { page: site, tab } = await scanned(`slash-${uniq()}`, ALL);
    const popup = await popupFor(tab);
    await resultsShown(popup, 3);
    const focused = () => popup.evaluate(() => (document.activeElement && document.activeElement.id) || document.activeElement.tagName);
    const blur = () => popup.evaluate(() => { document.activeElement.blur(); window.getSelection().removeAllRanges(); });
    // Detection
    await popup.fill('#detectionSearch', 'probe');
    await blur();
    await popup.keyboard.press('/');
    assert.equal(await focused(), 'detectionSearch', 'Detection: the search box');
    assert.equal(await popup.$eval('#detectionSearch', el => el.value), 'probe', 'the "/" is not typed into it');
    assert.deepEqual(await popup.$eval('#detectionSearch', el => [el.selectionStart, el.selectionEnd]), [0, 5], 'what it holds is selected, to type over');
    await popup.fill('#detectionSearch', '');
    // Typed in a field it is a character like any other
    await popup.keyboard.press('/');
    assert.equal(await popup.$eval('#detectionSearch', el => el.value), '/', 'in a field "/" is typed');
    await popup.fill('#detectionSearch', '');
    await blur();
    // With a modifier it is not the shortcut
    await popup.keyboard.press('Control+/');
    assert.notEqual(await focused(), 'detectionSearch', 'Ctrl+/ is not the shortcut');
    // A dialog open owns the keys
    await popup.evaluate(() => window.popupInstance.detection.openDetectionModal(0));
    await popup.waitForSelector('#detectionModalMethods .method-item-card', { state: 'visible' });
    await popup.keyboard.press('/');
    assert.notEqual(await focused(), 'detectionSearch', 'not behind the detection details');
    await popup.$eval('#closeDetectionModal', el => el.click());
    // History
    await popup.$eval('.tab-btn[data-tab="history"]', el => el.click());
    await popup.waitForSelector('#historySearch', { state: 'visible', timeout: 15000 });
    await blur();
    await popup.keyboard.press('/');
    assert.equal(await focused(), 'historySearch', 'History: its search box, as before');
    // Rules
    await popup.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await popup.waitForSelector('#rulesSearch', { state: 'visible', timeout: 15000 });
    await blur();
    await popup.keyboard.press('/');
    assert.equal(await focused(), 'rulesSearch', 'Rules: the rules search box');
    assert.deepEqual(await popup.$$eval('#detectionSearch, #historySearch, #rulesSearch', els => els.map(el => el.getAttribute('aria-keyshortcuts'))), ['/', '/', '/'], 'a screen reader can say the key');
    // Settings open: the key stays with Settings
    await blur();
    await popup.$eval('#settingsBtn', el => el.click());
    await popup.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 250 });
    await popup.keyboard.press('/');
    assert.notEqual(await focused(), 'rulesSearch', 'not behind Settings');
    // Settings → General → Keyboard shortcuts lists the popup's keys beside the browser's
    const lines = await popup.$$eval('.settings-row--shortcuts .settings-row-desc', els => els.map(el => el.textContent.trim()));
    for (const line of ['Search the open tab: /', 'Move between History entries: j / k, ↓ / ↑', 'Close a dialog: Esc']) assert.ok(lines.includes(line), `listed: ${line} (${lines.join(' | ')})`);
    assert.ok(lines.some(line => line.startsWith('Open the extension: ')), 'the browser shortcut that opens the popup');
    assert.ok(lines.some(line => line.startsWith('Scan this page again: ')), 'and the rescan one');
    await popup.close();
    await site.close();
  });

  // ===============================================================================================
  await scenario('Rules chips: the categories, Custom, Edited and Disabled filter the list, combine with the search, survive a redraw and clear again', async () => {
    const popup = await popupFor(null);
    await popup.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await popup.waitForFunction(() => { const r = window.popupInstance.rules; return r && r.initialized && r.allDetectors.length > 20 && document.querySelector('#rulesFilters .history-filter-chip svg'); }, null, { polling: 250, timeout: 30000 });
    // The six chips with words; the Recently updated chip (3.1.7) is an icon with a name of its own, checked on its own
    const chips = '#rulesFilters .history-filter-chip:not([data-filter="updated"])';
    const chip = (key) => `#rulesFilters .history-filter-chip[data-filter="${key}"]`;
    const click = (key) => popup.$eval(chip(key), el => el.click());
    const names = () => popup.evaluate(() => window.popupInstance.rules.filteredDetectors.map(e => e.detector.displayName || e.detectorName));
    const total = await popup.evaluate(() => window.popupInstance.rules.allDetectors.length);
    const cards = () => popup.$$eval('#rulesList .detector-name', els => els.map(el => el.textContent.trim()));

    // The row: a labelled group under the search, the categories, then Custom, Edited and Disabled, with the words of the cards
    assert.equal(await popup.$eval('#rulesFilters', el => el.getAttribute('aria-label')), 'Filter rules');
    assert.equal(await popup.$eval('#rulesFilters', el => el.getAttribute('role')), 'group');
    assert.deepEqual(await popup.$$eval(chips, els => els.map(el => el.textContent.trim())), ['Anti-bot', 'Captcha', 'Fingerprint', 'Custom', 'Edited', 'Disabled']);
    assert.deepEqual(await pressed(popup, chips), ['antibot:false', 'captcha:false', 'fingerprint:false', 'custom:false', 'edited:false', 'disabled:false']);
    assert.equal(await popup.evaluate(() => document.querySelector('#rulesSearch').getBoundingClientRect().bottom <= document.querySelector('#rulesFilters').getBoundingClientRect().top), true, 'under the search');
    assert.equal(await popup.$$eval(`${chips} svg`, els => els.length), 6, 'every chip has an icon');
    assert.deepEqual(await popup.$eval(chip('updated'), el => [el.textContent.trim(), el.getAttribute('aria-label'), !!el.querySelector('svg')]), ['', 'Recently updated', true], 'the Recently updated chip is an icon with a name');
    assert.deepEqual(await popup.$$eval(chips, els => els.slice(0, 3).map(el => el.style.getPropertyValue('--chip-color'))), ['#FF5733', '#33C3FF', '#3b82f6'], 'the Settings → Category colours');
    const metrics = await rowMetrics(popup, '#rulesFilters');
    console.log(`      rules row: ${JSON.stringify(metrics)}`);
    assert.equal(metrics.spills, false, 'nothing spills out of the row');
    assert.deepEqual(metrics.chipHeights, [24]);
    assert.ok(metrics.lines <= 2, `the six chips wrap to at most two lines: ${metrics.lines}`);
    assert.equal(await popup.$eval('#rulesNoResults', el => el.hidden), true);
    await shot(popup, 'rules-chips-off-dark');

    // Make the library show every kind of rule: a shipped rule the person edited, and two that are switched off
    const prepared = await popup.evaluate(async () => {
      const dm = window.popupInstance.detectorManager;
      const edit = dm.getDetector('antibot', 'detect-cloudflare');
      const edited = JSON.parse(JSON.stringify(edit));
      edited.description = 'Edited by the filter scenario';
      DetectorManager.markUserEdited(edited, edit);
      dm.detectors.antibot['detect-cloudflare'] = edited;
      dm.getDetector('captcha', 'detect-v313-captcha').enabled = false;
      dm.getDetector('antibot', 'detect-akamai').enabled = false;
      await dm.saveDetectorsToStorage();
      await window.popupInstance.rules.displayRules();
      return { isEdited: DetectorManager.isUserEdited(dm.getDetector('antibot', 'detect-cloudflare')), disabled: ['detect-v313-captcha', 'detect-akamai'] };
    });
    assert.equal(prepared.isEdited, true, 'the fixture rule really is an edited shipped rule');

    // Custom: the person's own rules only (the three probes), and the cards say so
    await click('custom');
    await until(async () => (await names()).length === 3, 5000, 'the Custom chip');
    assert.deepEqual((await names()).sort(), ['V313 Bot Probe', 'V313 Captcha Probe', 'V313 Fingerprint Probe']);
    assert.deepEqual(await cards(), ['V313 Bot Probe', 'V313 Fingerprint Probe'], 'the enabled ones first, two to a page');
    assert.deepEqual(await pressed(popup, chips), ['antibot:false', 'captcha:false', 'fingerprint:false', 'custom:true', 'edited:false', 'disabled:false']);
    const customTips = await popup.$$eval('#rulesList .version-author', els => els.map(el => el.getAttribute('data-tip-detail')));
    assert.deepEqual(customTips, ['Custom detector', 'Custom detector'], 'the cards on screen say they are custom rules');
    await shot(popup, 'rules-custom-dark');
    // Edited: a shipped rule the person changed, and the card on screen carries the tag
    await click('custom');
    await click('edited');
    await until(async () => (await names()).length === 1, 5000, 'the Edited chip');
    assert.equal((await names())[0], await popup.evaluate(() => window.popupInstance.detectorManager.getDetector('antibot', 'detect-cloudflare').displayName || window.popupInstance.detectorManager.getDetector('antibot', 'detect-cloudflare').name));
    assert.equal(await popup.$$eval('#rulesList .rule-edited-tag', els => els.length), 1, 'the card shows the Edited tag');
    assert.equal(await popup.$$eval('#rulesList .detector-card', els => els.length), 1);
    await shot(popup, 'rules-edited-dark');
    // Custom and Edited together: either (what the person made or changed)
    await click('custom');
    await until(async () => (await names()).length === 4, 5000, 'Custom and Edited together');
    // Disabled narrows: the disabled probe, and the Edited rule is not disabled
    await click('disabled');
    await until(async () => (await names()).length === 1, 5000, 'Disabled narrowing');
    assert.deepEqual(await names(), ['V313 Captcha Probe']);
    await click('custom');
    await click('edited');
    await until(async () => (await names()).length === 2, 5000, 'Disabled alone');
    assert.deepEqual((await names()).sort(), ['Akamai Bot Manager', 'V313 Captcha Probe'].sort());
    assert.equal(await popup.$$eval('#rulesList .detector-disabled', els => els.length), await popup.$$eval('#rulesList .detector-card', els => els.length), 'every card on screen is a switched-off one');
    // Categories: any of them, then narrowed by Disabled
    await click('disabled');
    await click('captcha');
    await until(async () => (await popup.evaluate(() => window.popupInstance.rules.filteredDetectors.every(e => /captcha/i.test(e.category)))) && (await names()).length > 3, 5000, 'the Captcha chip');
    await click('antibot');
    const either = await popup.evaluate(() => [...new Set(window.popupInstance.rules.filteredDetectors.map(e => e.category))].sort());
    assert.deepEqual(either, ['antibot', 'captcha'], 'Captcha or Anti-bot');
    await click('disabled');
    await until(async () => (await names()).length === 2, 5000, 'the categories narrowed by Disabled');
    assert.deepEqual((await names()).sort(), ['Akamai Bot Manager', 'V313 Captcha Probe'].sort());
    // The search combines with the chips (AND)
    await popup.fill('#rulesSearch', 'v313');
    await until(async () => (await names()).length === 1, 5000, 'the search with the chips');
    assert.deepEqual(await names(), ['V313 Captcha Probe']);
    await popup.fill('#rulesSearch', 'cloudflare');
    await until(async () => (await names()).length === 0, 5000, 'a search the chips rule out');
    assert.equal(await popup.$eval('#rulesNoResults', el => !el.hidden && el.offsetParent !== null), true, 'the message shows');
    assert.equal(await popup.$eval('#rulesNoResults p', el => el.textContent.trim()), 'No entries match your search or filters.');
    await shot(popup, 'rules-no-match-dark');
    // A redraw keeps the chips and the search (a rule deleted, restored, updated, edited)
    await popup.fill('#rulesSearch', 'v313');
    await until(async () => (await names()).length === 1, 5000, 'the search again');
    await popup.evaluate(() => window.popupInstance.rules.displayRules());
    assert.deepEqual(await names(), ['V313 Captcha Probe'], 'the redraw read the same chips and the same search');
    assert.deepEqual(await pressed(popup, chips), ['antibot:true', 'captcha:true', 'fingerprint:false', 'custom:false', 'edited:false', 'disabled:true']);
    // Clear filters
    await popup.fill('#rulesSearch', 'cloudflare');
    await until(async () => (await names()).length === 0, 5000, 'nothing left');
    await popup.$eval('#rulesClearFilters', el => el.click());
    await until(async () => (await names()).length === total, 5000, 'Clear filters');
    assert.deepEqual(await pressed(popup, chips), ['antibot:false', 'captcha:false', 'fingerprint:false', 'custom:false', 'edited:false', 'disabled:false']);
    assert.equal(await popup.$eval('#rulesSearch', el => el.value), '');
    assert.equal(await popup.$eval('#rulesNoResults', el => el.hidden), true);
    // Fingerprint (the shipped ones are many)
    await click('fingerprint');
    await until(async () => (await names()).length > 3, 5000, 'the Fingerprint chip');
    assert.ok((await popup.evaluate(() => window.popupInstance.rules.filteredDetectors.every(e => /fingerprint/i.test(e.category)))));
    await click('fingerprint');
    // The keyboard
    await popup.focus(chip('disabled'));
    await popup.keyboard.press(' ');
    await until(async () => (await names()).length === 2, 5000, 'Space on the Disabled chip');
    await popup.keyboard.press('Enter');
    await until(async () => (await names()).length === total, 5000, 'Enter on the Disabled chip');
    // The light theme
    await setTheme(popup, 'light');
    await shot(popup, 'rules-chips-off-light');
    await click('custom');
    await until(async () => (await names()).length === 3, 5000, 'Custom in the light theme');
    await shot(popup, 'rules-custom-light');
    await click('custom');
    await click('edited');
    await click('disabled');
    await shot(popup, 'rules-edited-disabled-light');
    await click('edited');
    await click('disabled');
    await setTheme(popup, 'dark');

    // Put the library back as it was
    await popup.evaluate(async () => {
      const dm = window.popupInstance.detectorManager;
      dm.getDetector('captcha', 'detect-v313-captcha').enabled = true;
      dm.getDetector('antibot', 'detect-akamai').enabled = true;
      await dm.saveDetectorsToStorage();
    });
    await popup.close();
  });

  // ===============================================================================================
  await scenario('Detection first pages fit above the pagination without scrolling: one header, two headers, three categories, two results, a last page of one card, the highest-confidence order', async () => {
    await ensureExtraProbes();
    // A page holds two cards, so it has one or two category headers (two cards of one category, or of two)
    const shapes = [
      ['one header: two anti-bot results first', '&b=1&b2=1&c=1', 3, 1, 'one-header'],
      ['two headers: anti-bot, then captcha', '&b=1&c=1&c2=1', 3, 2, 'two-headers'],
      ['three categories: anti-bot, captcha, fingerprint', ALL, 3, 2, 'three-categories'],
      ['exactly two results, one header', '&b=1&b2=1', 2, 1, 'two-results-one-header'],
      ['exactly two results, two headers', '&b=1&c=1', 2, 2, 'two-results-two-headers']
    ];
    for (const [label, query, count, headers, slug] of shapes) {
      const { page: site, tab } = await scanned(`fit-${uniq()}`, query);
      const popup = await popupFor(tab);
      await resultsShown(popup, count);
      await popup.waitForFunction(() => document.querySelector('#detectionFilters .history-filter-chip svg'), null, { polling: 250, timeout: 10000 });
      await sleep(400);
      const fit = await fitOf(popup);
      console.log(`      ${label}: ${JSON.stringify(fit)}`);
      assert.equal(fit.headers, headers, `${label}: category headers on the page`);
      assert.equal(fit.cards, 2, `${label}: cards on the page`);
      assert.equal(fit.overflow, 0, `${label}: the first page scrolls ${fit.overflow}px, its last card is under the pagination bar`);
      assert.ok(fit.gap >= 6, `${label}: the last card ends ${fit.gap}px above the bar, which covers 6px above itself`);
      await shot(popup, `detection-fit-${slug}-dark`);
      await setTheme(popup, 'light');
      await shot(popup, `detection-fit-${slug}-light`);
      await setTheme(popup, 'dark');
      if (slug === 'three-categories') {
        // The last page: one card, and the bar still ends the popup
        await popup.evaluate(() => window.popupInstance.detection.paginationManager.goToPage(2));
        await sleep(400);
        const last = await fitOf(popup);
        console.log(`      last page of ${label}: ${JSON.stringify(last)}`);
        assert.equal(last.cards, 1);
        assert.equal(last.overflow, 0);
        assert.ok(last.gap >= 6);
        await shot(popup, 'detection-fit-last-page-dark');
      }
      await popup.close();
      await site.close();
    }
    // The highest-confidence order has no category headers: it has the room, and its cards need nothing tighter
    assert.ok(await patchSettings({ detection: { sortBy: 'confidence' } }));
    try {
      const { page: site, tab } = await scanned(`fit-${uniq()}`, ALL);
      const popup = await popupFor(tab);
      await resultsShown(popup, 3);
      await sleep(500);
      const fit = await fitOf(popup);
      console.log(`      highest-confidence order: ${JSON.stringify(fit)}`);
      assert.equal(fit.headers, 0);
      assert.equal(fit.cards, 2);
      assert.equal(fit.overflow, 0, `the highest-confidence order scrolls ${fit.overflow}px`);
      assert.ok(fit.gap >= 6, `the last card ends ${fit.gap}px above the bar`);
      await shot(popup, 'detection-fit-confidence-order-dark');
      await popup.close();
      await site.close();
    } finally {
      assert.ok(await patchSettings({ detection: { sortBy: 'category' } }));
    }
  });

  // ===============================================================================================
  await scenario('Settings → Cache scope: saved with results showing, the results of the old scope go: the no-completed-scan card in the same tab, the next scan lands there (results, search, chips), in both directions', async () => {
    const chips = '#detectionFilters .history-filter-chip';
    const chip = (key) => `${chips}[data-filter="${key}"]`;
    const names = (page) => page.$$eval('#resultsList .detector-name', els => els.map(el => el.textContent.trim()));
    try {
      // 1. 3.1.4: a scope change drops the results saved under the old scope (back under Domain, a page is never served another
      //    page's Full URL result), so the page shows the no-completed-scan card in the same tab, its markup kept; Scan again
      //    draws the new results there, and the search and the chips work on them
      // (No Domain result of this local site is left from an earlier scenario: it would answer every page of it)
      const clean = await popupFor(null);
      await clean.evaluate(() => new Promise(r => chrome.runtime.sendMessage({ type: 'DETECTION_CLEAR_ALL_CACHE' }, () => r())));
      await clean.close();
      assert.ok(await patchSettings({ detection: { cacheScope: 'full' } }));
      const first = await scanned(`scope-${uniq()}`, ALL);
      const popup = await popupFor(first.tab);
      await resultsShown(popup, 3);
      await popup.waitForFunction(() => document.querySelector('#detectionFilters .history-filter-chip svg'), null, { polling: 250, timeout: 10000 });
      const fullStamp = await cacheStamp(first.url);
      await saveCacheScope(popup, 'domain');
      await until(() => popup.evaluate(() => { const empty = document.querySelector('#emptyState'); return !!empty && empty.style.display === 'flex'; }), 15000, 'the no-completed-scan card: the Full URL result is gone under Domain');
      assert.equal(await popup.$eval('#emptyState .state-card-title', el => el.textContent.trim()), 'No completed scan');
      assert.equal(await popup.$eval('#detectionResults', el => getComputedStyle(el).display), 'none', 'no stale results under the card');
      assert.deepEqual(await markupOf(popup), { list: true, search: true, chips: 4, pagination: true }, 'the tab\'s markup is still there');
      const before1 = loads[first.name];
      await popup.$eval('#emptyRescanBtn', el => el.click());
      await until(() => loads[first.name] > before1, 10000, 'the page sent again');
      await until(async () => { const stamp = await cacheStamp(first.url); return stamp && stamp !== fullStamp; }, 25000, 'a scan saved under Domain');
      await untilDrawn(popup, async () => (await listed(popup)).length === 3, 30000, 'the new results drawn in the same tab');
      assert.equal(await popup.$eval('#detectionResults', el => getComputedStyle(el).display), 'flex');
      assert.equal(await popup.$eval('#detectionFilters', el => el.getBoundingClientRect().width > 0), true, 'and the chip row is on screen');
      // The search and the chips work on them
      await popup.$eval(chip('captcha'), el => el.click());
      await until(async () => (await listed(popup)).length === 1, 5000, 'the Captcha chip');
      assert.deepEqual(await listed(popup), ['V313 Captcha Probe']);
      await popup.$eval(chip('captcha'), el => el.click());
      await until(async () => (await listed(popup)).length === 3, 5000, 'the Captcha chip off again');
      await popup.fill('#detectionSearch', 'fingerprint');
      await until(async () => (await listed(popup)).length === 1, 5000, 'the search');
      assert.deepEqual(await listed(popup), ['V313 Fingerprint Probe']);
      await popup.fill('#detectionSearch', '');
      await until(async () => (await listed(popup)).length === 3, 5000, 'the search cleared');
      // A visit to another tab and back shows the results, not the clean "Nothing Detected" card
      await popup.$eval('.tab-btn[data-tab="history"]', el => el.click());
      await popup.$eval('.tab-btn[data-tab="detection"]', el => el.click());
      await untilDrawn(popup, async () => (await names(popup)).length === 2, 15000, 'the results after a visit to History and back');
      assert.equal(await popup.$eval('#emptyState', el => getComputedStyle(el).display), 'none', 'no empty card over the results');
      await shot(popup, 'detection-cache-scope-results-dark');
      await popup.close();
      await first.page.close();

      // 2. Nothing saved under the new scope: Full URL does not read the entry a Domain scan saved
      const admin = await popupFor(null);
      await admin.evaluate(() => new Promise(r => chrome.runtime.sendMessage({ type: 'DETECTION_CLEAR_ALL_CACHE' }, () => r())));
      await admin.close();
      assert.ok(await patchSettings({ detection: { cacheScope: 'domain' } }));
      const second = await scanned(`scope-${uniq()}`, ALL);
      const saved = await cacheStamp(second.url);
      const popup2 = await popupFor(second.tab);
      await resultsShown(popup2, 3);
      await saveCacheScope(popup2, 'full');
      await until(() => popup2.evaluate(() => { const empty = document.querySelector('#emptyState'); return !!empty && empty.style.display === 'flex'; }), 15000, 'the no-completed-scan card after the new scope was saved');
      assert.equal(await popup2.$eval('#emptyState .state-card-title', el => el.textContent.trim()), 'No completed scan');
      assert.equal(await popup2.$eval('#emptyRescanBtn', el => !el.hidden && el.offsetParent !== null), true, 'with Scan again');
      assert.deepEqual(await markupOf(popup2), { list: true, search: true, chips: 4, pagination: true }, 'the markup is there for the next scan to draw into');
      await shot(popup2, 'detection-cache-scope-no-scan-dark');
      const before = loads[second.name];
      await popup2.$eval('#emptyRescanBtn', el => el.click());
      await until(() => loads[second.name] > before, 10000, 'the page sent again');
      await until(async () => (await cacheStamp(second.url)) > saved, 25000, 'a scan saved under the new scope');
      await untilDrawn(popup2, async () => (await names(popup2)).length === 2, 30000, 'the new results drawn in the same tab');
      assert.deepEqual(await names(popup2), ['V313 Bot Probe', 'V313 Captcha Probe'], 'the new results are drawn in the same tab');
      assert.deepEqual(await markupOf(popup2), { list: true, search: true, chips: 4, pagination: true });
      assert.equal(await popup2.$eval('#detectionFilters', el => el.getBoundingClientRect().width > 0), true, 'the chips are on screen again');
      assert.equal(await popup2.$eval('#detectionSearch', el => el.getBoundingClientRect().width > 0), true, 'and so is the search');
      await shot(popup2, 'detection-cache-scope-new-scan-dark');
      await popup2.close();
      await second.page.close();
    } finally {
      assert.ok(await patchSettings({ detection: { cacheScope: 'full' } }));
    }
  });

  // ===============================================================================================
  await scenario('the new texts follow the interface language (Spanish, Arabic), and both rows hold their shape in a right-to-left language', async () => {
    const { page: site, tab } = await scanned(`lang-${uniq()}`, ALL);
    try {
      for (const locale of ['es', 'ar']) {
        const messages = JSON.parse(fs.readFileSync(path.join(REPO, '_locales', locale, 'messages.json'), 'utf8'));
        const say = (key) => messages[key].message;
        await W((l) => chrome.storage.local.set({ scrapfly_language_override: l }), locale);
        const popup = await popupFor(tab);
        await resultsShown(popup, 3);
        await popup.waitForFunction(() => document.querySelector('#detectionFilters .history-filter-chip svg'), null, { polling: 250, timeout: 10000 });
        assert.equal(await popup.$eval('#detectionFilters', el => el.getAttribute('aria-label')), say('detectionFiltersLabel'), `${locale}: the row's name`);
        assert.deepEqual(await popup.$$eval('#detectionFilters .history-filter-chip', els => els.map(el => el.textContent.trim())), [say('categoryAntibot'), say('categoryCaptcha'), say('categoryFingerprint'), say('historyFilterCombinations')], `${locale}: the chips`);
        assert.equal(await popup.$eval('#rescanBtn', el => el.getAttribute('title')), say('historyScanAgain'), `${locale}: the toolbar button`);
        assert.equal(await popup.$eval('#rescanBtn', el => el.getAttribute('aria-label')), say('historyScanAgain'));
        // The first page still fits above the pagination in a language with other letter shapes and line heights: Spanish needs
        // no scrolling; the Arabic group header lines are 3px taller, so its first page scrolls 1px, as it did in 3.1.2
        await sleep(400);
        const fit = await fitOf(popup);
        console.log(`      ${locale}: first page ${JSON.stringify(fit)}`);
        assert.ok(fit.overflow <= (locale === 'ar' ? 1 : 0), `${locale}: the first page scrolls ${fit.overflow}px`);
        assert.ok(fit.gap >= 6, `${locale}: the last card ends ${fit.gap}px above the pagination bar`);
        const detection = await rowMetrics(popup, '#detectionFilters');
        assert.equal(detection.spills, false, `${locale}: the Detection row stays inside the card: ${JSON.stringify(detection)}`);
        assert.ok(detection.lines <= 2, `${locale}: the Detection row wraps to at most two lines: ${detection.lines}`);
        await popup.$eval('#detectionFilters .history-filter-chip[data-filter="antibot"]', el => el.click());
        await popup.fill('#detectionSearch', 'zzz-no-match');
        await popup.waitForFunction(() => { const none = document.querySelector('#detectionNoResults'); return !!none && !none.hidden; }, null, { polling: 250, timeout: 10000 });
        assert.equal(await popup.$eval('#detectionNoResults p', el => el.textContent.trim()), say('historyNoResults'), `${locale}: the no-results line`);
        assert.equal(await popup.$eval('#detectionClearFilters', el => el.textContent.trim()), say('historyClearFilters'));
        await shot(popup, `detection-no-match-${locale}`);
        await popup.$eval('#detectionClearFilters', el => el.click());
        await popup.evaluate(() => window.popupInstance.detection.showEmptyState({ outcome: 'unscanned' }));
        assert.equal(await popup.$eval('#emptyRescanBtn', el => el.textContent.trim()), say('historyScanAgain'), `${locale}: the dead-end card's button`);
        await shot(popup, `detection-no-scan-${locale}`);

        await popup.$eval('.tab-btn[data-tab="rules"]', el => el.click());
        await popup.waitForFunction(() => document.querySelector('#rulesFilters .history-filter-chip svg'), null, { polling: 250, timeout: 30000 });
        assert.equal(await popup.$eval('#rulesFilters', el => el.getAttribute('aria-label')), say('rulesFiltersLabel'), `${locale}: the Rules row's name`);
        assert.equal(await popup.$eval('#rulesFilters .history-filter-chip[data-filter="updated"]', el => el.getAttribute('aria-label')), say('rulesRecentlyUpdated'), `${locale}: the Recently updated chip's name`);
        assert.deepEqual(await popup.$$eval('#rulesFilters .history-filter-chip:not([data-filter="updated"])', els => els.map(el => el.textContent.trim())),
          [say('categoryAntibot'), say('categoryCaptcha'), say('categoryFingerprint'), say('statsRulesCustom'), say('ruleEditedTag'), say('statsRulesDisabled')], `${locale}: the Rules chips`);
        const rules = await rowMetrics(popup, '#rulesFilters');
        assert.equal(rules.spills, false, `${locale}: the Rules row stays inside the header: ${JSON.stringify(rules)}`);
        assert.ok(rules.lines <= 3, `${locale}: the Rules row wraps to at most three lines: ${rules.lines}`);
        console.log(`      ${locale}: Detection row ${JSON.stringify(detection)}; Rules row ${JSON.stringify(rules)}; direction ${await popup.evaluate(() => getComputedStyle(document.documentElement).direction)}`);
        await shot(popup, `rules-chips-${locale}`);
        await popup.close();
      }
    } finally {
      await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
      await site.close();
    }
  });

  // ---- Report ----------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${pageErrors.join('\n  ')}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  console.log(failed.length || pageErrors.length ? 'RESULT FAILED' : `RESULT ALL PASS (${results.length} scenarios)`);
  await ctx.close();
  server.close();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
