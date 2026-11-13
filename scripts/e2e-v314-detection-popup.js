#!/usr/bin/env node
/**
 * The 3.1.4 Detection tab and popup shell, end to end in the real extension (unpacked in Chromium):
 *
 *   Paging          History and Rules: turning a page starts it at the top of the popup's one scrollport (the new page used to be drawn
 *                   at the old offset, its first entries above the viewport); the page box shows the page on screen: Enter on a page
 *                   there is not, or tabbing away with text in it, puts the current page back
 *   Live region     Detection: one persistent status region (role="status") says what the footer shows ("Showing 1-2 of 3"), the
 *                   no-match line when the search or the chips leave nothing, and how a scan ended; it is clear while a scan runs
 *   Clear cache     the worker's answer decides the toast and the card (cleared, already cleared, failed, an older worker); a failure,
 *                   a worker that cannot be reached and no active tab each say so and leave the button usable
 *   Upload          "Link copied to clipboard" only when the copy worked
 *   History         a scan result does not start the History tab (the change line reads History once per result and save); an open
 *                   History still follows what the worker saves
 *   Summary lines   3.1.8: results from another page of the site say which page (Scan again now); a clean result says when it was
 *                   checked (Scan again now); a change since the earlier scan, Watch for changes, Compare scans, nothing while paused
 *   Labels          the "Confidence: value" tips of the summary tiles and the cards use the translated forms (French, Traditional
 *                   Chinese)
 *   HTTP status     (3.1.8) the tile beside Cache shows the page's status: 403 amber, 503 red, 200 after a 301; a cache hit keeps
 *                   the saved one; a result without one hides the tile
 *   Strong toggle   (3.1.9) inside the search box, keeps the results at 80% or more, ANDs with the chips, off with Clear filters
 *   Details dialog  (3.1.9) what the difficulty means, the vendor's website, its docs page in the interface language, Open tools
 *                   opens the Advanced tab on that protection's tools
 *
 * A local site shows one marker per protection and probe detectors recognize them, so the scans are real.
 * The popup is opened as a page; its active tab is the local site's (chrome.tabs.query is told so), as in the other suites.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup
 *   node scripts/e2e-v314-detection-popup.js [<checkout>] [--only=<text>]
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const locale = (code) => JSON.parse(fs.readFileSync(path.join(REPO, '_locales', code, 'messages.json'), 'utf8'));
const EN = locale('en');
const say = (key, messages = EN) => messages[key].message;

// ---- Local site -----------------------------------------------------------------------------------
const MARKERS = { b: 'v314-bot-marker', c: 'v314-captcha-marker', f: 'v314-fingerprint-marker' };
const loads = {}; // page name -> how many times the server sent it
const served = {}; // page name -> the markers it shows from now on ('&c=1'), whatever its address says: the same page changes
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  // /p/<anything> too: pages of one site that History counts as different pages (it ignores the query)
  if (url.pathname === '/p' || url.pathname.startsWith('/p/')) {
    const name = url.searchParams.get('n') || 'page';
    loads[name] = (loads[name] || 0) + 1;
    const flags = served[name] !== undefined ? new URLSearchParams(served[name]) : url.searchParams;
    const shown = Object.entries(MARKERS).filter(([flag]) => flags.get(flag) === '1').map(([, text]) => `<p>${text}</p>`).join('');
    // s=403: the page answers with that HTTP status (a block page), still with its markers (3.1.8)
    res.writeHead(Number(url.searchParams.get('s')) || 200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(`<!doctype html><html><head><title>V314 ${name}</title></head><body>${shown}<p>probe page</p></body></html>`);
  }
  // /r?...: a 301 to /p with the same query (the page's status is the last hop's)
  if (url.pathname === '/r') {
    res.writeHead(301, { location: `/p${url.search}`, 'cache-control': 'no-store' });
    return res.end();
  }
  res.writeHead(404); res.end();
});

const probe = (id, name, category, marker) => ({
  id, name, author: 'Probe', enabled: true, category, difficulty: 'Medium', version: '1.0.0', lastUpdated: '2026-11-06',
  icon: 'custom.png', description: `${name}: a probe for the Detection tab scenarios`,
  detection: { content: [{ id: `${id}-marker`, text: marker, confidence: 90, standalone: true, description: 'marker' }] }
});
const PROBES = [
  ['antibot', probe('detect-v314-bot', 'V314 Bot Probe', 'Anti-Bot', MARKERS.b)],
  ['captcha', probe('detect-v314-captcha', 'V314 Captcha Probe', 'CAPTCHA', MARKERS.c)],
  ['fingerprint', probe('detect-v314-fingerprint', 'V314 Fingerprint Probe', 'Fingerprint', MARKERS.f)]
];
const ALL = '&b=1&c=1&f=1';
const HINT = say('workerOutdatedHint');

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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-detection-popup-'));
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
      await sleep(250);
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
  /** Drop every saved result of a page behind the popup's back (the worker is not asked). */
  const dropSavedResult = (url) => W(async (u) => {
    const key = DetectionEngineManager.STORAGE_KEY;
    const raw = (await chrome.storage.local.get(key))[key] || {};
    const storage = typeof raw === 'string' ? JSON.parse(raw) : raw;
    for (const scope of ['domain', 'path', 'full']) delete storage[UrlUtils.hashUrl(u, scope)];
    await chrome.storage.local.set({ [key]: typeof raw === 'string' ? JSON.stringify(storage) : storage });
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
  const toasts = (page) => page.$$eval('.notification-toast .notification-message', els => els.map(el => el.textContent.trim()));
  const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('.notification-toast').forEach(el => el.remove()));
  const said = (page) => page.$eval('#detectionStatus', el => el.textContent);
  const footer = (page) => page.$eval('#detectionPagination .pagination-info', el => el.textContent.trim());
  const listed = (page) => page.evaluate(() => window.popupInstance.detection.paginationManager.filteredItems.map(d => d.detector.name));
  /** Click a button that asks first, and agree. */
  async function confirmed(page, selector) {
    await page.$eval(selector, el => el.click());
    await page.waitForSelector('.notification-btn-confirm', { timeout: 8000 });
    await page.$eval('.notification-btn-confirm', el => el.click());
    await page.waitForFunction(() => document.querySelectorAll('.notification-confirm').length === 0, null, { polling: 100, timeout: 8000 });
  }
  const offset = (page) => page.evaluate(() => document.querySelector('#app > .main').scrollTop);
  const room = (page) => page.evaluate(() => { const main = document.querySelector('#app > .main'); return main.scrollHeight - main.clientHeight; });
  /** Scroll the popup's one scrollport as far as asked (or as far as it goes); what it reached. */
  const scrollTo = (page, to) => page.evaluate((n) => { const main = document.querySelector('#app > .main'); main.scrollTop = n; return main.scrollTop; }, to);

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
  await scenario('Paging: turning a page of History or Rules starts it at the top of the popup; the page box shows the page on screen', async () => {
    const entries = Array.from({ length: 45 }, (_, i) => ({
      id: `v314-${i}`, url: `https://seed${i}.example/`, hostname: `seed${i}.example`, title: `Seed ${String(i).padStart(2, '0')}`,
      timestamp: Date.now() - (i + 1) * 60000,
      detections: [{ detector: { name: 'Probe' }, category: 'Anti-Bot', confidence: 90, matches: [{ type: 'cookie', value: 'x', confidence: 90 }] }]
    }));
    await W((list) => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items: list }) }), entries);
    const popup = await popupFor(null);
    try {
      // ---- History: twenty cards a page, so the popup scrolls
      await popup.$eval('.tab-btn[data-tab="history"]', el => el.click());
      await popup.waitForFunction(() => document.querySelectorAll('#historyList .history-item').length === 20, null, { polling: 250, timeout: 20000 });
      const first = () => popup.$eval('#historyList .history-item .history-title', el => el.textContent.trim());
      const firstCardTop = () => popup.evaluate(() => {
        const main = document.querySelector('#app > .main');
        return Math.round(document.querySelector('#historyList .history-item').getBoundingClientRect().top - main.getBoundingClientRect().top);
      });
      assert.equal(await first(), 'Seed 00');
      const available = await room(popup);
      assert.ok(available > 600, `twenty cards scroll the popup (${available}px of room)`);
      const reached = await scrollTo(popup, 900);
      assert.ok(reached > 300, `scrolled to card 14 or so (${reached}px)`);
      await popup.$eval('#historyPagination .pagination-btn-next', el => el.click());
      await until(async () => (await first()) === 'Seed 20', 5000, 'page 2');
      assert.equal(await offset(popup), 0, 'History page 2 starts at the top, not at the old offset');
      const top = await firstCardTop();
      assert.ok(top >= 0 && top < 200, `the first card of page 2 is in view (${top}px below the top of the scrollport)`);

      // the page box: it names the page on screen
      const box = '#historyPagination .page-input';
      assert.equal(await popup.$eval(box, el => el.value), '2');
      await popup.fill(box, '99');
      await popup.press(box, 'Enter');
      assert.equal(await popup.$eval(box, el => el.value), '2', 'Enter on a page there is not');
      assert.equal(await first(), 'Seed 20', 'and nothing moved');
      await popup.fill(box, '3');
      await popup.press(box, 'Tab');
      assert.equal(await popup.$eval(box, el => el.value), '2', 'tabbing away with text in the box puts the page on screen back');
      assert.equal(await first(), 'Seed 20', 'and the page did not change: only Enter takes the number');
      await popup.fill(box, 'abc');
      await popup.$eval(box, el => el.blur());
      assert.equal(await popup.$eval(box, el => el.value), '2', 'text that is no number');
      await scrollTo(popup, 600);
      await popup.fill(box, '3');
      await popup.press(box, 'Enter');
      await until(async () => (await first()) === 'Seed 40', 5000, 'page 3 by number');
      assert.equal(await popup.$eval(box, el => el.value), '3');
      assert.equal(await offset(popup), 0, 'a page asked for by number starts at the top as well');
      await scrollTo(popup, 400);
      await popup.$eval('#historyPagination .pagination-btn-prev', el => el.click());
      await until(async () => (await first()) === 'Seed 20', 5000, 'back to page 2');
      assert.equal(await offset(popup), 0, 'Previous too');

      // ---- Rules: two cards a page, with the toolbar above them
      await popup.$eval('.tab-btn[data-tab="rules"]', el => el.click());
      await popup.waitForFunction(() => document.querySelectorAll('#rulesList > *').length >= 2 && Number(document.querySelector('#rulesPagination .total-pages').textContent) > 3, null, { polling: 250, timeout: 30000 });
      const rulesRoom = await room(popup);
      const ruleNames = () => popup.$$eval('#rulesList > *', els => els.map(el => el.textContent.trim().slice(0, 40)).join('|'));
      const before = await ruleNames();
      assert.ok(rulesRoom > 20, `the Rules tab scrolls (${rulesRoom}px of room) for the check to mean something`);
      const rulesReached = await scrollTo(popup, rulesRoom);
      assert.ok(rulesReached > 10, `scrolled down the Rules tab (${rulesReached}px)`);
      await popup.$eval('#rulesPagination .pagination-btn-next', el => el.click());
      await until(async () => (await ruleNames()) !== before, 5000, 'Rules page 2');
      assert.equal(await offset(popup), 0, 'Rules page 2 starts at the top too');
      const rulesBox = '#rulesPagination .page-input';
      await popup.fill(rulesBox, '999');
      await popup.press(rulesBox, 'Enter');
      assert.equal(await popup.$eval(rulesBox, el => el.value), '2', 'Rules: Enter on a page there is not');
      await popup.fill(rulesBox, '5');
      await popup.press(rulesBox, 'Tab');
      assert.equal(await popup.$eval(rulesBox, el => el.value), '2', 'Rules: tabbing away');
    } finally {
      await popup.close();
    }
  });

  // ===============================================================================================
  await scenario('Detection live region: the count, the no-match line and how a scan ended are read out; it is clear while a scan runs', async () => {
    const { page: site, name, tab } = await scanned(`live-${uniq()}`, ALL);
    const popup = await popupFor(tab);
    try {
      await resultsShown(popup, 3);
      const region = await popup.$eval('#detectionStatus', (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          role: el.getAttribute('role'), live: el.getAttribute('aria-live'), atomic: el.getAttribute('aria-atomic'),
          display: style.display, visibility: style.visibility, clipped: rect.width <= 1 && rect.height <= 1,
          inCard: !!el.closest('#loadingState, #emptyState, #detectionResults, #disabledState, #blacklistWarning, [hidden]'),
          directChild: el.parentElement.id === 'detectionTab'
        };
      });
      assert.deepEqual(region, { role: 'status', live: 'polite', atomic: 'true', display: 'block', visibility: 'visible', clipped: true, inCard: false, directChild: true });
      // It takes no room: a first page of three results (two cards) still needs no scrolling, as without it
      await popup.waitForFunction(() => document.querySelector('#detectionFilters .history-filter-chip svg'), null, { polling: 250, timeout: 10000 });
      await sleep(500); // the cards fade in
      assert.equal(await room(popup), 0, 'the first page fits the popup');
      assert.equal(await footer(popup), 'Showing 1-2 of 3');
      assert.equal(await said(popup), 'Showing 1-2 of 3', 'the results are read out as the footer shows them');

      // The search and the chips
      await popup.fill('#detectionSearch', 'zzz-no-match');
      await until(async () => (await said(popup)) === say('historyNoResults'), 5000, 'the no-match line');
      assert.equal(await popup.$eval('#detectionNoResults p', el => el.textContent.trim()), say('historyNoResults'), 'the line the page shows is the one that is read');
      await popup.$eval('#detectionClearFilters', el => el.click());
      await until(async () => (await said(popup)) === 'Showing 1-2 of 3', 5000, 'the search cleared');
      await popup.$eval('#detectionFilters .history-filter-chip[data-filter="captcha"]', el => el.click());
      await until(async () => (await said(popup)) === 'Showing 1-1 of 1', 5000, 'the Captcha chip');
      assert.deepEqual(await listed(popup), ['V314 Captcha Probe']);
      await popup.$eval('#detectionFilters .history-filter-chip[data-filter="captcha"]', el => el.click());
      await until(async () => (await said(popup)) === 'Showing 1-2 of 3', 5000, 'the chip off again');
      await popup.$eval('#detectionPagination .pagination-btn-next', el => el.click());
      await until(async () => (await said(popup)) === 'Showing 3-3 of 3', 5000, 'the next page');
      assert.equal(await said(popup), await footer(popup), 'always what the footer says');
      await popup.$eval('#detectionPagination .pagination-btn-prev', el => el.click());

      // How a scan ended
      await popup.evaluate(() => { window.popupInstance.detection.showEmptyState({ outcome: 'failed' }); });
      assert.equal(await said(popup), say('detectionFailedTitle'));
      assert.equal(await popup.$eval('#emptyState .state-card-title', el => el.textContent.trim()), 'Scan failed', 'the card\'s title is what is read');
      // Scan again: the region is clear while the scan runs, then it says the new result; every text it takes is recorded
      await popup.evaluate(() => {
        window.__said = [];
        const region = document.querySelector('#detectionStatus');
        new MutationObserver(() => window.__said.push(region.textContent)).observe(region, { childList: true, characterData: true, subtree: true });
      });
      const before = loads[name];
      await popup.$eval('#emptyRescanBtn', el => el.click());
      await until(() => loads[name] > before, 10000, 'the page sent again');
      await resultsShown(popup, 3);
      await until(async () => (await said(popup)) === 'Showing 1-2 of 3', 10000, 'the new result read out');
      const heard = await popup.evaluate(() => window.__said);
      const at = (text) => heard.indexOf(text);
      assert.ok(at('') >= 0 && at('Showing 1-2 of 3') > at(''), `silence while the scan runs, then the result: ${JSON.stringify(heard)}`);

      // A page the scan found nothing on, and one with no completed scan
      await popup.evaluate(() => window.popupInstance.detection.showEmptyState({}));
      assert.equal(await said(popup), say('detectionEmptyTitle'));
      await popup.evaluate(() => window.popupInstance.detection.showEmptyState({ outcome: 'unscanned' }));
      assert.equal(await said(popup), say('detectionUnscannedTitle'));
      await popup.evaluate(() => window.popupInstance.detection.showEmptyState({ outcome: 'interrupted' }));
      assert.equal(await said(popup), say('detectionInterruptedTitle'));
      // Paused: nothing left over from the results
      await popup.evaluate(() => window.popupInstance.detection.showDisabledState());
      assert.equal(await said(popup), '', 'switched off: no stale count for browse mode to find');
    } finally {
      await popup.close();
      await site.close();
    }
  });

  // ===============================================================================================
  await scenario('Detection live region: a page with no protection says "Nothing detected"; in Spanish and Arabic it reads what the footer shows', async () => {
    const clean = `${origin}/p?n=clean-${uniq()}`;
    const site = await ctx.newPage();
    site.on('pageerror', (e) => pageErrors.push(`site: ${e.message}`));
    await site.goto(clean, { waitUntil: 'commit' }).catch(() => {});
    const tab = await until(() => tabOf(clean), 10000, 'the tab');
    const found = await scanned(`lang-${uniq()}`, ALL);
    try {
      let popup = await popupFor(tab);
      await until(async () => (await said(popup)) === say('detectionEmptyTitle'), 30000, 'Nothing detected for a page with no protection');
      assert.equal(await popup.$eval('#emptyState .state-card-title', el => el.textContent.trim()), 'Nothing detected');
      await popup.close();
      for (const code of ['es', 'ar']) {
        const messages = locale(code);
        await W((l) => chrome.storage.local.set({ scrapfly_language_override: l }), code);
        popup = await popupFor(found.tab);
        await resultsShown(popup, 3);
        assert.equal(await said(popup), await footer(popup), `${code}: the footer's text, in the interface language`);
        assert.match(await said(popup), /\d/, `${code}: with its numbers`);
        await popup.fill('#detectionSearch', 'zzz-no-match');
        await until(async () => (await said(popup)) === say('historyNoResults', messages), 5000, `${code}: the no-match line`);
        assert.equal(await popup.evaluate(() => getComputedStyle(document.documentElement).direction), code === 'ar' ? 'rtl' : 'ltr');
        await popup.close();
      }
    } finally {
      await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
      await site.close();
      await found.page.close();
    }
  });

  // ===============================================================================================
  await scenario('Clear cache: the worker\'s answer decides the toast and the card; failures say so and leave the button usable', async () => {
    const { page: site, url, tab } = await scanned(`clear-${uniq()}`, ALL);
    const popup = await popupFor(tab);
    try {
      await resultsShown(popup, 3);
      await popup.evaluate(() => {
        window.__clearMode = 'real';
        window.__clearAsked = 0;
        const original = chrome.runtime.sendMessage.bind(chrome.runtime);
        chrome.runtime.sendMessage = (message, ...rest) => {
          if (message && message.type === 'DETECTION_CLEAR_CACHE' && window.__clearMode !== 'real') {
            window.__clearAsked++;
            if (window.__clearMode === 'reject') return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
            return Promise.resolve({ status: window.__clearMode }); // 'error', or 'unknown' as a worker older than the popup answers
          }
          return original(message, ...rest);
        };
      });
      const state = () => popup.evaluate(() => ({
        disabled: document.querySelector('#clearCacheBtn').disabled,
        results: window.popupInstance.detection.currentResults.length,
        showing: window.popupInstance.detection.isShowingResults,
        card: document.querySelector('#emptyState').style.display
      }));
      const kept = { disabled: false, results: 3, showing: true, card: 'none' };

      for (const [mode, text] of [['error', say('failedToClearCacheToast')], ['reject', say('failedToClearCacheToast')], ['unknown', HINT]]) {
        await popup.evaluate((m) => { window.__clearMode = m; }, mode);
        await confirmed(popup, '#clearCacheBtn');
        await until(async () => (await toasts(popup)).includes(text), 8000, `the toast "${text}" for "${mode}"`);
        assert.equal((await toasts(popup)).includes(say('cacheClearedToast')), false, `${mode}: no "Cache cleared"`);
        assert.deepEqual(await state(), kept, `${mode}: the results stay and the button is on again`);
        assert.ok(await cacheStamp(url), `${mode}: the saved result is still there`);
        await clearToasts(popup);
      }

      // No active tab: it said nothing and the button stayed off
      const asked = await popup.evaluate(() => window.__clearAsked);
      await popup.evaluate(() => { window.__query = chrome.tabs.query; chrome.tabs.query = async () => []; });
      await confirmed(popup, '#clearCacheBtn');
      await until(async () => (await toasts(popup)).includes(say('unableGetCurrentPage')), 8000, 'the no-tab toast');
      assert.deepEqual(await state(), kept, 'no tab: the button is on again');
      assert.equal(await popup.evaluate(() => window.__clearAsked), asked, 'the worker was not asked');
      await popup.evaluate(() => { chrome.tabs.query = window.__query; });
      await clearToasts(popup);

      // The worker finds nothing saved: that is not "cleared", and the page still ends without a saved result
      await dropSavedResult(url);
      assert.equal(await cacheStamp(url), 0);
      await popup.evaluate(() => { window.__clearMode = 'real'; });
      await confirmed(popup, '#clearCacheBtn');
      await until(async () => (await toasts(popup)).includes(say('notificationCacheAlreadyCleared')), 8000, 'the already-cleared toast');
      assert.equal((await toasts(popup)).includes(say('cacheClearedToast')), false);
      await until(() => popup.evaluate(() => document.querySelector('#emptyState').style.display === 'flex'), 8000, 'the no-completed-scan card');
      assert.equal(await popup.$eval('#emptyState .state-card-title', el => el.textContent.trim()), 'No completed scan');
      assert.equal((await state()).disabled, false);
      await clearToasts(popup);

      // Scan again, then clear for real: the saved result goes, the toast says so, the card shows
      await popup.$eval('#emptyRescanBtn', el => el.click());
      await resultsShown(popup, 3);
      assert.ok(await until(() => cacheStamp(url), 25000, 'a fresh saved result'));
      await confirmed(popup, '#clearCacheBtn');
      await until(async () => (await toasts(popup)).includes(say('cacheClearedToast')), 8000, 'the cleared toast');
      await until(() => popup.evaluate(() => document.querySelector('#emptyState').style.display === 'flex'), 8000, 'the card after clearing');
      assert.equal(await cacheStamp(url), 0, 'the saved result is gone');
      assert.equal((await state()).disabled, false);
    } finally {
      await popup.close();
      await site.close();
    }
  });

  // ===============================================================================================
  await scenario('Upload detections: "Link copied to clipboard" only when the copy worked', async () => {
    const { page: site, tab } = await scanned(`upload-${uniq()}`, ALL);
    const popup = await popupFor(tab);
    try {
      await resultsShown(popup, 3);
      await popup.evaluate(() => {
        ShareProviders.describe = () => ({ name: 'Test paste', expiry: { kind: 'never' } });
        ShareProviders.upload = async () => 'https://paste.example/abc';
        chrome.tabs.create = async (options) => { (window.__opened = window.__opened || []).push(options.url); };
        window.__clipboard = 'fail';
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (text) => { if (window.__clipboard === 'fail') throw new Error('The clipboard refused'); window.__copied = text; } }
        });
      });
      await confirmed(popup, '#uploadPasteBtn');
      await until(async () => (await toasts(popup)).length > 0, 8000, 'a toast');
      assert.deepEqual(await toasts(popup), [say('clipboardCopyFailed')], 'the clipboard refused: the toast says so, not "Link copied"');
      assert.deepEqual(await popup.evaluate(() => window.__opened), ['https://paste.example/abc'], 'the uploaded link still opens, to be copied from there');
      assert.equal(await popup.$eval('#uploadPasteBtn', el => el.disabled), false);
      await clearToasts(popup);
      await popup.evaluate(() => { window.__clipboard = 'ok'; });
      await confirmed(popup, '#uploadPasteBtn');
      await until(async () => (await toasts(popup)).length > 0, 8000, 'a toast');
      assert.deepEqual(await toasts(popup), [say('pasteUploadSuccessToast')]);
      assert.equal(await popup.evaluate(() => window.__copied), 'https://paste.example/abc');
    } finally {
      await popup.close();
      await site.close();
    }
  });

  // ===============================================================================================
  await scenario('History: a scan result alone does not start it (the change line reads it once per result and save); an open History still follows what the worker saves', async () => {
    await W(() => chrome.storage.local.remove(['scrapfly_history']));
    const first = await scanned(`hist-a-${uniq()}`, ALL);
    const popup = await popupFor(first.tab);
    try {
      await resultsShown(popup, 3);
      await popup.evaluate(() => {
        window.__reads = 0;
        window.__writes = 0;
        const get = chrome.storage.local.get.bind(chrome.storage.local);
        chrome.storage.local.get = (keys, ...rest) => { if ([].concat(keys).includes('scrapfly_history')) window.__reads++; return get(keys, ...rest); };
        chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.scrapfly_history) window.__writes++; });
      });
      // 1. The tab scans another page while the popup shows Detection and History was never opened in it
      const second = `hist-b-${uniq()}`;
      await first.page.goto(`${origin}/p?n=${second}${ALL}`, { waitUntil: 'commit' });
      await until(() => popup.evaluate((token) => { const d = window.popupInstance.detection; return d.isShowingResults && !!d.cacheMetadata && String(d.cacheMetadata.url).includes(token); }, second), 30000, 'the new result in the popup');
      await sleep(1500); // the worker saves History after it tells the popup; a redraw would follow the save by 300 ms
      assert.ok((await popup.evaluate(() => window.__writes)) >= 1, 'the worker saved the page to History');
      // Since 3.1.8 the summary's change line reads History once the result is drawn, and again when the worker saves the page:
      // at most one read for the result and one per save, and the History tab itself is not started
      const early = await popup.evaluate(() => ({ reads: window.__reads, writes: window.__writes, initialized: window.popupInstance.history.initialized }));
      assert.equal(early.initialized, false, 'a scan result does not start the History tab');
      assert.ok(early.reads <= early.writes + 1, `the change line reads History once per result and per save at most (${early.reads} reads, ${early.writes} saves)`);

      // 2. Open History: it shows both pages; a third scan while it is open lands in the list, read once per save
      await popup.$eval('.tab-btn[data-tab="history"]', el => el.click());
      await popup.waitForFunction(() => document.querySelectorAll('#historyList .history-item').length >= 2, null, { polling: 250, timeout: 20000 });
      await popup.evaluate(() => { window.__reads = 0; window.__writes = 0; });
      const third = `hist-c-${uniq()}`;
      await first.page.goto(`${origin}/p?n=${third}${ALL}`, { waitUntil: 'commit' });
      await until(() => popup.evaluate((token) => [...document.querySelectorAll('#historyList .history-url')].some(el => el.textContent.includes(token)), third), 30000, 'the new page in the open History list');
      await sleep(1500);
      const { reads, writes } = await popup.evaluate(() => ({ reads: window.__reads, writes: window.__writes }));
      console.log(`      open History: ${reads} read(s) for ${writes} save(s)`);
      assert.ok(writes >= 1 && reads >= 1, `the list followed the save (${reads} reads, ${writes} saves)`);
      // the open list and the Detection change line each read once per save
      assert.ok(reads <= 2 * writes, `one read per save and reader at most (${reads} reads, ${writes} saves)`);
    } finally {
      await popup.close();
      await first.page.close();
    }
  });

  // ===============================================================================================
  await scenario('the tips of the summary tiles and the cards use the translated "Label: value" forms (French, Traditional Chinese)', async () => {
    const { page: site, tab } = await scanned(`labels-${uniq()}`, ALL);
    try {
      for (const code of ['fr', 'zh_TW']) {
        const messages = locale(code);
        await W((l) => chrome.storage.local.set({ scrapfly_language_override: l }), code);
        const popup = await popupFor(tab);
        try {
          await resultsShown(popup, 3);
          const average = (await popup.$eval('#overallConfidence', el => el.textContent.trim())).replace('%', '');
          const level = await popup.$eval('#difficultyLevel', el => el.textContent.trim());
          const tip = (selector) => popup.$eval(selector, el => el.getAttribute('data-tip'));
          assert.equal(await tip('.overall-confidence'), say('clipboardConfidenceFmt', messages).replace('{0}', average), `${code}: the confidence tile`);
          assert.equal(await tip('.difficulty-level'), say('clipboardDifficultyFmt', messages).replace('{0}', level), `${code}: the difficulty tile`);
          const cardConfidence = await popup.$eval('#resultsList .card-sure', el => ({ tip: el.getAttribute('data-tip'), text: el.textContent }));
          const sure = (cardConfidence.text.match(/\d+/) || [])[0];
          assert.ok(sure, `the card says how sure it is: "${cardConfidence.text}"`);
          assert.equal(cardConfidence.tip, say('clipboardConfidenceFmt', messages).replace('{0}', sure), `${code}: the card's confidence tip`);
          const cardDifficulty = await popup.$eval('#resultsList .card-difficulty', el => ({ tip: el.getAttribute('data-tip'), text: el.textContent.trim() }));
          assert.equal(cardDifficulty.tip, say('clipboardDifficultyFmt', messages).replace('{0}', cardDifficulty.text), `${code}: the card's difficulty tip`);
          console.log(`      ${code}: "${await tip('.overall-confidence')}" · "${await tip('.difficulty-level')}"`);
        } finally {
          await popup.close();
        }
      }
    } finally {
      await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
      await site.close();
    }
  });

  // ===============================================================================================
  await scenario('HTTP status: the tile beside Cache shows the page\'s status (403 amber, 503 red, 200 after a 301), keeps it on a cache hit and hides without one', async () => {
    const tileOf = (popup) => popup.evaluate(() => {
      const tile = document.querySelector('#httpStatusTile');
      const value = document.querySelector('#httpStatusValue');
      return { hidden: tile.hidden, shown: tile.getBoundingClientRect().width > 0, value: value.textContent.trim(), tones: [...value.classList].filter(c => c.startsWith('tone-')),
        color: getComputedStyle(value).color, tip: tile.getAttribute('data-tip'), label: tile.querySelector('.stat-label-inline').textContent.trim() };
    });
    const open = [];
    try {
      const blocked = await scanned(`http403-${uniq()}`, `${ALL}&s=403`);
      open.push(blocked.page);
      let popup = await popupFor(blocked.tab);
      let tile;
      try {
        await resultsShown(popup, 3);
        tile = await until(async () => { const t = await tileOf(popup); return t.value === '403' ? t : null; }, 10000, 'the 403 tile');
        assert.equal(tile.hidden, false);
        assert.ok(tile.shown, 'drawn beside Cache');
        assert.deepEqual(tile.tones, ['tone-amber']);
        assert.equal(tile.label, say('detectionStatHttpStatus'));
        assert.equal(tile.tip, say('detectionHttpStatusFmt').replace('{0}', '403'));
        const amber = tile.color;
        console.log(`      403: "${tile.tip}" (${amber})`);

        // The copies read it from here (detection-actions.js)
        const copied = await popup.evaluate(() => window.popupInstance.detection.cacheMetadata.httpStatus);
        assert.equal(copied, 403, 'the popup holds the saved status');
      } finally {
        await popup.close();
      }

      const failing = await scanned(`http503-${uniq()}`, `${ALL}&s=503`);
      open.push(failing.page);
      popup = await popupFor(failing.tab);
      try {
        await resultsShown(popup, 3);
        tile = await until(async () => { const t = await tileOf(popup); return t.value === '503' ? t : null; }, 10000, 'the 503 tile');
        assert.deepEqual(tile.tones, ['tone-red']);
      } finally {
        await popup.close();
      }

      // A 301 then a 200: the last hop's status
      const name = `http301-${uniq()}`;
      const final = `${origin}/p?n=${name}${ALL}`;
      const moved = await ctx.newPage();
      open.push(moved);
      await moved.goto(`${origin}/r?n=${name}${ALL}`, { waitUntil: 'commit' }).catch(() => {});
      await until(() => cacheStamp(final), 25000, 'the saved result of the redirected page');
      const movedTab = await until(() => tabOf(final), 5000, 'the redirected tab');
      popup = await popupFor(movedTab);
      try {
        await resultsShown(popup, 3);
        tile = await until(async () => { const t = await tileOf(popup); return t.value === '200' ? t : null; }, 10000, 'the 200 tile');
        assert.deepEqual(tile.tones, [], 'graphite: a success is not flagged');
      } finally {
        await popup.close();
      }

      // A cache hit: the same 403 page in a new tab reuses the saved result and its status
      const stamp = await cacheStamp(blocked.url);
      const again = await ctx.newPage();
      open.push(again);
      await again.goto(blocked.url, { waitUntil: 'commit' }).catch(() => {});
      await sleep(2500);
      assert.equal(await cacheStamp(blocked.url), stamp, 'served from the saved result, not scanned again');
      const againTab = await until(() => W(async (u) => { const tabs = (await chrome.tabs.query({})).filter(x => x.url === u); const t = tabs[tabs.length - 1]; return t ? { id: t.id, url: t.url, windowId: t.windowId } : null; }, blocked.url), 5000, 'the second tab');
      popup = await popupFor(againTab);
      try {
        await resultsShown(popup, 3);
        tile = await until(async () => { const t = await tileOf(popup); return t.value === '403' ? t : null; }, 10000, 'the 403 tile on a cache hit');
      } finally {
        await popup.close();
      }

      // A result saved before 3.1.8 has no status: the tile hides
      await W(async (u) => {
        const key = DetectionEngineManager.STORAGE_KEY;
        const raw = (await chrome.storage.local.get(key))[key] || {};
        const storage = typeof raw === 'string' ? JSON.parse(raw) : raw;
        for (const scope of ['domain', 'path', 'full']) if (storage[UrlUtils.hashUrl(u, scope)]) delete storage[UrlUtils.hashUrl(u, scope)].httpStatus;
        await chrome.storage.local.set({ [key]: typeof raw === 'string' ? JSON.stringify(storage) : storage });
      }, blocked.url);
      popup = await popupFor(againTab);
      try {
        await resultsShown(popup, 3);
        await sleep(800);
        tile = await tileOf(popup);
        assert.equal(tile.hidden, true, `hidden without a status (${JSON.stringify(tile)})`);
        assert.equal(tile.shown, false);
      } finally {
        await popup.close();
      }
    } finally {
      for (const page of open) await page.close().catch(() => {});
    }
  });

  // 3.1.8: the Detection summary says where its results come from, when a clean page was checked, and what changed
  await scenario('Summary lines: results from another page of the site say which page, with Scan again now; this page\'s own scan does not', async () => {
    const token = uniq();
    const home = `${origin}/p/home-${token}?n=src-${token}&b=1`;
    const login = `${origin}/p/login-${token}?n=login-${token}&c=1`;
    await patchSettings({ detection: { cacheScope: 'domain' } });
    // The worker saves the next result under the scope it reads: wait until it reads Domain (a result saved as Full URL stands
    // for its own page only, and the other page would be scanned instead)
    await until(() => W(() => Utils.getCacheScope()).then(scope => scope === 'domain'), 10000, 'the Domain scope in the worker');
    const site = await ctx.newPage();
    const other = await ctx.newPage();
    let popup = null;
    try {
      site.on('pageerror', (e) => pageErrors.push(`site: ${e.message}`));
      other.on('pageerror', (e) => pageErrors.push(`site: ${e.message}`));
      await site.goto(home, { waitUntil: 'commit' }).catch(() => {});
      await until(() => W(async (u) => {
        let storage = (await chrome.storage.local.get(DetectionEngineManager.STORAGE_KEY))[DetectionEngineManager.STORAGE_KEY] || {};
        if (typeof storage === 'string') storage = JSON.parse(storage);
        const saved = storage[UrlUtils.hashUrl(u, 'domain')];
        return !!saved && saved.cacheScope === 'domain' && saved.url === u;
      }, home), 25000, 'the home page\'s result saved for the whole site');
      // and the home page's scan has settled (nothing saved for it for a moment): the other page is visited after it, not during it
      let stamp = await cacheStamp(home);
      await until(async () => { await sleep(1500); const now = await cacheStamp(home); const settled = now === stamp; stamp = now; return settled; }, 20000, 'the home page\'s scan to settle');
      // Another page of the site: under Domain it is served the home page's result
      await other.goto(login, { waitUntil: 'load' }).catch(() => {});
      const tab = await until(() => tabOf(login), 5000, 'the login tab');
      // The popup is opened once the page has taken the cached result (its badge shows the home page's count): opened while the
      // page is still loading, it would find no result for the tab yet
      await until(() => W((id) => chrome.action.getBadgeText({ tabId: id }), tab.id).then(text => text === '1'), 15000, 'the cached result on the login tab');
      await sleep(500);
      popup = await popupFor(tab);
      await resultsShown(popup, 1);
      const line = () => popup.$eval('#detectionSourceNote', el => ({ hidden: el.hidden, text: el.querySelector('.detection-note-text').textContent, title: el.querySelector('.detection-note-text').title }));
      const shown = await until(async () => { const l = await line(); return !l.hidden && l; }, 10000, 'the line under the site\'s name');
      assert.match(shown.text, new RegExp(`^From a scan of \\u2068/p/home-${token}\\u2069, `), shown.text); // the path isolated (FSI...PDI)
      assert.ok(shown.title.startsWith(home), 'the whole address on hover');
      assert.equal(await popup.$eval('#detectionChangeNote', el => el.hidden), true, 'no change line for another page\'s results');
      // Scan again now scans this page: its own result, and the line goes
      const before = await cacheStamp(login);
      await popup.$eval('#sourceRescanBtn', el => el.click());
      await until(() => popup.evaluate((t) => { const d = window.popupInstance.detection; return d.isShowingResults && !!d.cacheMetadata && String(d.cacheMetadata.url).includes(`login-${t}`); }, token), 30000, 'the login page\'s own result');
      assert.ok((await cacheStamp(login)) > before, 'a fresh scan of this page');
      await resultsShown(popup, 1);
      await until(async () => (await line()).hidden, 5000, 'the line hidden for this page\'s own scan');
      assert.deepEqual(await popup.evaluate(() => window.popupInstance.detection.currentResults.map(d => d.detector.name)), ['V314 Captcha Probe'], 'the CAPTCHA of this page is no longer hidden');
      console.log(`      "${shown.text}"`);
    } finally {
      if (popup) await popup.close();
      await site.close();
      await other.close();
      await dropSavedResult(home);
      await dropSavedResult(login);
      await patchSettings({ detection: { cacheScope: 'full' } });
    }
  });

  await scenario('Summary lines: a clean result says when it was checked and can be scanned again from the card', async () => {
    const url = `${origin}/p?n=checked-${uniq()}`;
    const site = await ctx.newPage();
    let popup = null;
    try {
      site.on('pageerror', (e) => pageErrors.push(`site: ${e.message}`));
      await site.goto(url, { waitUntil: 'commit' }).catch(() => {});
      await until(() => cacheStamp(url), 25000, 'the saved clean result');
      const tab = await until(() => tabOf(url), 5000, 'the tab');
      popup = await popupFor(tab);
      await until(async () => (await said(popup)) === say('detectionEmptyTitle'), 30000, 'Nothing detected');
      const note = await until(() => popup.$eval('#emptyCheckedNote', el => !el.hidden && el.offsetParent !== null && el.querySelector('.detection-note-text').textContent), 5000, 'the Last checked line');
      assert.match(note, /^Last checked /, note);
      assert.equal(await popup.$eval('#checkedRescanBtn', el => el.textContent.trim()), say('historyScanAgain'));
      const before = await cacheStamp(url);
      await popup.$eval('#checkedRescanBtn', el => el.click());
      await until(async () => (await cacheStamp(url)) > before, 30000, 'a fresh scan of the clean page');
      await until(async () => (await said(popup)) === say('detectionEmptyTitle'), 30000, 'Nothing detected again');
      console.log(`      "${note}"`);
    } finally {
      if (popup) await popup.close();
      await site.close();
    }
  });

  await scenario('Summary lines: a change since the earlier scan, Watch for changes, Compare scans; nothing while History is paused', async () => {
    await W(() => chrome.storage.local.remove(['scrapfly_history']));
    const name = `chg-${uniq()}`;
    const url = `${origin}/p?n=${name}`;
    served[name] = '&b=1';
    const site = await ctx.newPage();
    let popup = null;
    const historyOf = () => W(async (u) => (await HistoryStore.read(chrome.storage.local)).filter(item => item.url === u && item.fromCache !== true), url);
    try {
      site.on('pageerror', (e) => pageErrors.push(`site: ${e.message}`));
      await site.goto(url, { waitUntil: 'commit' }).catch(() => {});
      await until(async () => (await historyOf()).length === 1, 25000, 'the first scan in History');
      // The page changes: the bot protection goes, a CAPTCHA comes
      served[name] = '&c=1';
      await dropSavedResult(url);
      await site.reload({ waitUntil: 'commit' }).catch(() => {});
      await until(async () => (await historyOf()).length === 2, 25000, 'the second scan in History');
      const tab = await until(() => tabOf(url), 5000, 'the tab');
      popup = await popupFor(tab);
      await resultsShown(popup, 1);
      const line = () => popup.$eval('#detectionChangeNote', el => ({
        hidden: el.hidden, text: el.querySelector('.detection-note-text').textContent,
        actions: [...el.querySelectorAll('[data-change-action]')].filter(n => !n.hidden).map(n => n.dataset.changeAction)
      }));
      const shown = await until(async () => { const l = await line(); return !l.hidden && l; }, 10000, 'the change line');
      assert.match(shown.text, /^Changed since .+: \u2068\+V314 Captcha Probe\u2069 \u2068−V314 Bot Probe\u2069$/, shown.text); // each name isolated
      assert.deepEqual(shown.actions, ['compare', 'watch']);
      assert.equal(await popup.$eval('#detectionSourceNote', el => el.hidden), true, 'this page\'s own results');
      console.log(`      "${shown.text}"`);

      // Watch for changes: the entry joins the watchlist (and is pinned), and the line says Watching
      await clearToasts(popup);
      await popup.$eval('#changeWatchBtn', el => el.click());
      await until(async () => (await line()).actions.includes('watching'), 10000, 'Watching');
      assert.deepEqual((await line()).actions, ['compare', 'watching']);
      const watched = (await historyOf()).find(item => item.watch === true);
      assert.ok(watched && watched.pinned === true, 'the newest scan is watched and pinned');
      assert.ok((await toasts(popup)).some(text => text.startsWith('Watching this page')), JSON.stringify(await toasts(popup)));

      // Paused History: the line goes (stored settings changed), and comes back when History is on again
      await patchSettings({ history: { historyEnabled: false } });
      await until(async () => (await line()).hidden, 10000, 'no line while History is paused');
      await patchSettings({ history: { historyEnabled: true } });
      await until(async () => !(await line()).hidden, 10000, 'the line back');

      // Compare scans: the History tab, with the compare dialog open
      await popup.$eval('#changeCompareBtn', el => el.click());
      await popup.waitForSelector('.notification-confirm .history-compare', { timeout: 10000 });
      assert.equal(await popup.evaluate(() => window.popupInstance.currentTab), 'history');
      const options = await popup.$$eval('.history-compare select option', els => els.length);
      assert.equal(options, 1, 'the earlier scan to compare with');
    } finally {
      delete served[name];
      if (popup) await popup.close();
      await site.close();
      await patchSettings({ history: { historyEnabled: true } });
    }
  });

  // ===============================================================================================
  await scenario('Strong toggle (3.1.9): inside the search box, it keeps the results at 80% or more and ANDs with the chips; Clear filters turns it off', async () => {
    const { page: site, tab } = await scanned(`strong-${uniq()}`, ALL);
    const popup = await popupFor(tab);
    try {
      await resultsShown(popup, 3);
      const toggle = '#detectionStrongToggle';
      assert.equal(await popup.$eval(toggle, el => el.textContent.trim()), say('detectionStrongToggle'));
      const placed = await popup.evaluate(() => {
        const button = document.querySelector('#detectionStrongToggle').getBoundingClientRect();
        const field = document.querySelector('#detectionSearch').getBoundingClientRect();
        return { inside: button.left >= field.left && button.right <= field.right && button.top >= field.top && button.bottom <= field.bottom,
          chips: document.querySelectorAll('#detectionFilters .history-filter-chip').length,
          inRow: !!document.querySelector('#detectionStrongToggle').closest('#detectionFilters') };
      });
      assert.deepEqual(placed, { inside: true, chips: 4, inRow: false }, 'inside the search field, not a fifth chip');
      // The probes all score 90%: the fingerprint one is made weak for this check
      await popup.evaluate(() => {
        const d = window.popupInstance.detection;
        d.currentResults.find(r => r.detector.name === 'V314 Fingerprint Probe').confidence = 40;
        d.applyFilters ? d.applyFilters() : DetectionUI.applyFilters.call(d);
      });
      await popup.$eval(toggle, el => el.click());
      assert.equal(await popup.$eval(toggle, el => el.getAttribute('aria-pressed')), 'true');
      assert.deepEqual((await listed(popup)).sort(), ['V314 Bot Probe', 'V314 Captcha Probe']);
      await popup.$eval('#detectionFilters .history-filter-chip[data-filter="captcha"]', el => el.click());
      assert.deepEqual(await listed(popup), ['V314 Captcha Probe'], 'with a chip: AND');
      await popup.$eval('#detectionFilters .history-filter-chip[data-filter="captcha"]', el => el.click());
      await popup.$eval('#detectionFilters .history-filter-chip[data-filter="fingerprint"]', el => el.click());
      assert.deepEqual(await listed(popup), [], 'only the weak fingerprint: nothing');
      assert.equal(await popup.$eval('#detectionNoResults', el => el.hidden), false, 'the way back is offered');
      await popup.$eval('#detectionClearFilters', el => el.click());
      assert.equal(await popup.$eval(toggle, el => el.getAttribute('aria-pressed')), 'false', 'Clear filters turns it off');
      assert.equal((await listed(popup)).length, 3);
      // Keyboard: it is a button in the tab order
      await popup.focus(toggle);
      await popup.keyboard.press('Enter');
      assert.equal(await popup.$eval(toggle, el => el.getAttribute('aria-pressed')), 'true');
    } finally {
      await popup.close();
      await site.close();
    }
  });

  // ===============================================================================================
  await scenario('Details dialog (3.1.9): what the difficulty means, the vendor\'s website, its docs page in the interface language, Open tools to its Advanced tools', async () => {
    const cloudflare = JSON.parse(fs.readFileSync(path.join(REPO, 'detectors', 'antibot', 'detect-cloudflare.json'), 'utf8').replace(/^\uFEFF/, ''));
    const { page: site, tab } = await scanned(`about-${uniq()}`, '&b=1');
    let popup = await popupFor(tab);
    const open = (p) => p.evaluate(() => {
      const d = window.popupInstance.detection;
      const shown = [{ detector: { id: 'detect-cloudflare', name: 'Cloudflare Bot Management' }, category: 'Anti-Bot', confidence: 95,
        matches: [{ type: 'cookie', pattern: '^__cf_bm$', value: '__cf_bm', confidence: 85 }] }];
      d.currentResults = shown;
      d.paginationManager.setItems(shown);
      window.popupInstance.advanced.cachedDetectionResults = shown;
      d.openDetectionModal(0);
    });
    const about = (p) => p.evaluate(() => {
      const visible = (sel) => { const el = document.querySelector(sel); return !!el && !el.hidden && el.offsetParent !== null; };
      return {
        note: visible('#detectionModalDifficultyNote') ? document.querySelector('#detectionModalDifficultyNote').textContent : null,
        website: visible('#detectionModalWebsite') ? document.querySelector('#detectionModalWebsite').href : null,
        docs: visible('#detectionModalDocs') ? document.querySelector('#detectionModalDocs').href : null,
        tools: visible('#detectionModalOpenTools'),
        target: document.querySelector('#detectionModalWebsite').target
      };
    });
    try {
      await resultsShown(popup, 1);
      await open(popup);
      await popup.waitForSelector('#detectionModalOpenTools', { state: 'visible', timeout: 10000 });
      const shown = await about(popup);
      assert.equal(shown.note, say(`detectionModalDifficulty${cloudflare.difficulty}`), 'what its difficulty means');
      assert.equal(shown.website, new URL(cloudflare.website).href, 'the website from the detector\'s data');
      assert.equal(shown.docs, 'https://github.com/scrapfly/Antibot-Detector/blob/main/docs/antibots/cloudflare.md');
      assert.equal(shown.target, '_blank', 'opens in a new tab');
      assert.equal(shown.tools, true);
      assert.ok(fs.existsSync(path.join(REPO, 'docs', 'antibots', 'cloudflare.md')));

      // Open tools: the dialog closes, the Advanced tab opens on Cloudflare's tools, focus on them
      await popup.$eval('#detectionModalOpenTools', el => el.click());
      await popup.waitForFunction(() => window.popupInstance.currentTab === 'advanced'
        && document.querySelector('#detectionToolsPanel') && document.querySelector('#detectionToolsPanel').style.display === 'block', null, { polling: 250, timeout: 20000 });
      assert.equal(await popup.$eval('#detectionDetailModal', el => el.style.display), 'none', 'the dialog closed');
      assert.equal(await popup.evaluate(() => window.popupInstance.advanced.selectedDetection), 'detect-cloudflare');
      assert.match(await popup.$eval('#compactDetectionName', el => el.textContent), /Cloudflare/);
      await popup.close();

      // Spanish: the Spanish docs page and the Spanish explanation
      await W(() => chrome.storage.local.set({ scrapfly_language_override: 'es' }));
      popup = await popupFor(tab);
      await resultsShown(popup, 1);
      await open(popup);
      await popup.waitForSelector('#detectionModalDocs', { state: 'visible', timeout: 10000 });
      const es = await about(popup);
      assert.equal(es.docs, 'https://github.com/scrapfly/Antibot-Detector/blob/main/docs/antibots/es/cloudflare.md');
      assert.equal(es.note, say(`detectionModalDifficulty${cloudflare.difficulty}`, locale('es')));
      assert.ok(fs.existsSync(path.join(REPO, 'docs', 'antibots', 'es', 'cloudflare.md')));
    } finally {
      await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
      await popup.close();
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
