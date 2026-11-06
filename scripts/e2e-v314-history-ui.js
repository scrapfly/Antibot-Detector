#!/usr/bin/env node
/**
 * History for the keyboard and for a screen reader (3.1.4), end to end in the real extension (unpacked in Chromium):
 *
 *   Focus after a redraw   pin, note and delete from the "…" menu, by keyboard and by mouse: the focus is on the same entry's "…"
 *                          button, or on the next card when the entry is gone (the one before when it was the last, the search
 *                          when none is left); a redraw nobody asked for keeps it; the details window closes over a redrawn list
 *   Tab stops              a card is two stops (the card, "…"), Scrapfly is in the "…" menu and opens the same dialog
 *   Names                  what the browser's accessibility tree gives for a card, its numbers, its buttons and the details window
 *   Details window         headers named for their detection, the matched value a button that Enter and Space copy, said aloud
 *   Live regions           a search, a chip and Clear filters are said once typing pauses; a redraw of the same search says nothing
 *   French                 the confidence and difficulty tips in the language's own form
 *   Look                   the cards and the details window are where and how big they were (--measure writes the numbers to
 *                          --out=<file>, for a run on the earlier build), in the dark and the light theme and in Arabic (RTL):
 *                          V314_SHOTS=<folder> saves screenshots
 *
 * The History entries are written straight into storage; the worker applies the pin, the note and the delete for real.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup
 *   node scripts/e2e-v314-history-ui.js [<repo>] [--only=<text>] [--measure --out=<file>]
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm run e2e:setup (or npm i --no-save playwright && npx playwright install chromium)');
  process.exit(2);
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const MEASURE = process.argv.includes('--measure');
const OUT = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6);
const SHOTS = process.env.V314_SHOTS || '';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- Harness ---------------------------------------------------------------------------------------
const results = [];
async function scenario(name, fn) {
  if (MEASURE || (only && !name.toLowerCase().includes(only.toLowerCase()))) return;
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`FAIL  ${name}\n      ${String((error && error.message) || error).split('\n').slice(0, 12).join('\n      ')}`);
  }
}

const NOW = Date.now();
const det = (name, category, confidence, difficulty = 'Medium', matches = []) => ({ detector: { name }, category, confidence, difficulty, matches });
/** n entries, k1 first (newest). Page 1 has three protections with matches; the others one each. */
const seed = (n, { detections } = {}) => Array.from({ length: n }, (_, i) => ({
  id: `k${i + 1}`, url: `https://site${i + 1}.example/page`, hostname: `site${i + 1}.example`, title: `Page ${i + 1}`, timestamp: NOW - i * 1000,
  detections: detections && i === 0 ? detections : [det('Cloudflare', 'Anti-Bot', 90, 'Medium')]
}));
const RICH = [
  det('Cloudflare', 'Anti-Bot', 95, 'Medium', [{ type: 'cookie', pattern: 'cf_clearance', value: 'cf_clearance=abc123', confidence: 90 }, { type: 'header', value: 'server: cloudflare', confidence: 70 }]),
  det('hCaptcha', 'CAPTCHA', 80, 'High', [{ type: 'url', fullUrl: 'https://hcaptcha.com/1/api.js', confidence: 80 }]),
  det('Canvas Fingerprint', 'Fingerprint', 40, 'Low', [{ type: 'js_hooks', value: 'HTMLCanvasElement.toDataURL', confidence: 40 }])
];

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-history-ui-'));
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 420, height: 650 }, acceptDownloads: true,
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
  const W = async (fn, arg) => (await getWorker()).evaluate(fn, arg);
  const setHistory = (list) => W((value) => chrome.storage.local.set({ scrapfly_history: JSON.stringify(value) }), { items: list });
  const items = async () => JSON.parse((await W(() => chrome.storage.local.get('scrapfly_history'))).scrapfly_history || '{"items":[]}').items;
  const setLanguage = (lang) => W((value) => (value ? chrome.storage.local.set({ scrapfly_language_override: value }) : chrome.storage.local.remove('scrapfly_language_override')), lang);
  async function until(check, ms = 15000, what = 'condition') {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(150);
    }
  }

  /** The popup as a page, on the History tab. */
  async function historyPage({ theme } = {}) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`popup: ${e.message}`));
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await page.waitForFunction(() => window.popupInstance && window.popupInstance.detectorManager && window.popupInstance.detectorManager.initialized, null, { polling: 250, timeout: 30000 });
    if (theme) await page.evaluate((v) => window.ScrapflyTheme.apply(v), theme);
    await page.$eval('#nav-history', el => el.click());
    await page.waitForSelector('#historyList .history-item', { timeout: 15000 });
    return page;
  }
  /** Where the keyboard is: a card, one of its buttons, the search, a menu entry, a dialog button, or the page itself. */
  const focusAt = (page) => page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return { kind: 'page' };
    const card = el.closest && el.closest('.history-item');
    let kind;
    if (el === card) kind = 'card';
    else if (card && el.dataset && el.dataset.action) kind = el.dataset.action;
    else if (el.id === 'historySearch') kind = 'search';
    else if (el.closest && el.closest('#historyItemMenu')) kind = `menu:${el.dataset.action || ''}`;
    else if (el.closest && el.closest('.notification-confirm')) kind = `dialog:${(el.textContent || el.tagName).trim().slice(0, 20)}`;
    else if (el.closest && el.closest('#historyPagination')) kind = 'pagination';
    else kind = `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`;
    return { kind, id: card ? card.dataset.historyId : null };
  });
  const cardIds = (page) => page.$$eval('#historyList .history-item', els => els.map(el => el.dataset.historyId));
  /** Open the "…" menu of a card by keyboard (focus the button, Enter) and move to an entry. */
  async function menuEntry(page, id, action) {
    await page.focus(`#historyList [data-history-id="${id}"] .history-more-btn`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#historyItemMenu:not([hidden])');
    await page.focus(`#historyItemMenu [data-action="${action}"]`);
  }
  const toasts = (page) => page.$$eval('.notification-toast .notification-message', els => els.map(el => el.textContent.trim()));

  // ---- Start-up -----------------------------------------------------------------------------------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  const warm = await ctx.newPage();
  await warm.goto(`chrome-extension://${extId}/popup.html`);
  await warm.waitForFunction(() => window.popupInstance && window.popupInstance.detectorManager && window.popupInstance.detectorManager.initialized, null, { polling: 250, timeout: 30000 }).catch(() => {});
  await sleep(1500);
  await warm.close();
  await setLanguage('en');
  await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

  // ===============================================================================================
  await scenario('Focus after a pin, a note and a delete from the "…" menu (keyboard): the same entry\'s button, or the next card when it is gone', async () => {
    await setHistory(seed(5));
    const page = await historyPage();
    try {
      // Pin k2 with the keyboard
      await menuEntry(page, 'k2', 'pin');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#historyList [data-history-id="k2"] .history-pin');
      assert.deepEqual(await focusAt(page), { kind: 'menu', id: 'k2' }, 'after Pin: the "…" of the same card, not the page');
      await sleep(800); // the stored change draws the list once more: the focus stays
      assert.deepEqual(await focusAt(page), { kind: 'menu', id: 'k2' }, 'and after the redraw that follows the stored change');
      // The next Tab continues from there: the next card, not the top of the tab
      await page.keyboard.press('Tab');
      assert.deepEqual(await focusAt(page), { kind: 'card', id: 'k3' }, 'Tab goes to the next card');

      // A note on k4: the dialog takes the focus, Save gives it back
      await menuEntry(page, 'k4', 'note');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.notification-confirm textarea');
      await page.keyboard.type('needs a residential proxy');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      assert.match((await focusAt(page)).kind, /^dialog:Save/, 'Tab, Tab: the Save button');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#historyList [data-history-id="k4"] .history-note');
      assert.deepEqual(await focusAt(page), { kind: 'menu', id: 'k4' }, 'after Save: the "…" of the same card');

      // Delete k3 (in the middle): the next card, k4
      await menuEntry(page, 'k3', 'delete');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.notification-confirm');
      assert.match((await focusAt(page)).kind, /^dialog:Cancel/, 'a delete starts on Cancel');
      await page.keyboard.press('Tab');
      assert.match((await focusAt(page)).kind, /^dialog:Delete/);
      await page.keyboard.press('Enter');
      await until(async () => !(await cardIds(page)).includes('k3'), 15000, 'k3 gone');
      assert.deepEqual(await cardIds(page), ['k1', 'k2', 'k4', 'k5']);
      assert.deepEqual(await focusAt(page), { kind: 'card', id: 'k4' }, 'after Delete: the card that took its place');
      await sleep(800);
      assert.deepEqual(await focusAt(page), { kind: 'card', id: 'k4' }, 'also after the redraw that follows the stored change');

      // Delete k5, the last: the card before it, k4
      await menuEntry(page, 'k5', 'delete');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.notification-confirm');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await until(async () => !(await cardIds(page)).includes('k5'), 15000, 'k5 gone');
      assert.deepEqual(await focusAt(page), { kind: 'card', id: 'k4' }, 'the last one went: the card before it');
      assert.equal((await items()).length, 3, 'the worker removed both');
    } finally { await page.close(); }
  });

  // ===============================================================================================
  await scenario('Focus after the same actions with the mouse, a filter that drops the entry, and the last entry deleted', async () => {
    await setHistory(seed(3));
    const page = await historyPage();
    try {
      // Mouse: click "…", click Pin
      await page.click('#historyList [data-history-id="k1"] .history-more-btn');
      await page.click('#historyItemMenu [data-action="pin"]');
      await page.waitForSelector('#historyList [data-history-id="k1"] .history-pin');
      assert.deepEqual(await focusAt(page), { kind: 'menu', id: 'k1' }, 'a mouse pin: the same');
      // The Pinned chip is on: unpinning k1 takes it out of the list, so the card that takes its place gets the focus
      await page.click('.history-filter-chip[data-filter="pinned"]');
      assert.deepEqual(await cardIds(page), ['k1']);
      await page.click('#historyList [data-history-id="k1"] .history-more-btn');
      await page.click('#historyItemMenu [data-action="pin"]');
      await until(async () => (await cardIds(page)).length === 0, 15000, 'the list empty');
      assert.equal((await focusAt(page)).kind, 'search', 'no card is left: the search, not the page');
      assert.equal(await page.$eval('#historyNoResults', el => el.hidden), false, 'the message with the way back is shown');
      // Clear filters by keyboard: the button is hidden by the redraw, the focus goes to the search
      await page.focus('#historyClearFilters');
      await page.keyboard.press('Enter');
      await until(async () => (await cardIds(page)).length === 3, 15000, 'every entry back');
      assert.equal((await focusAt(page)).kind, 'search', 'after Clear filters: the search');
      // Delete everything, one by one: the last delete leaves the search
      for (const id of ['k1', 'k2', 'k3']) {
        await page.click(`#historyList [data-history-id="${id}"] .history-more-btn`);
        await page.click('#historyItemMenu [data-action="delete"]');
        await page.waitForSelector('.notification-confirm .notification-btn-confirm');
        await page.click('.notification-confirm .notification-btn-confirm');
        await until(async () => !(await cardIds(page)).includes(id), 15000, `${id} gone`);
        await page.waitForSelector('.notification-confirm', { state: 'detached', timeout: 8000 });
      }
      assert.equal((await focusAt(page)).kind, 'search', 'History is empty: the search');
      assert.equal(await page.$eval('#historyEmpty', el => getComputedStyle(el).display !== 'none'), true, 'the empty state shows');
    } finally { await page.close(); }
  });

  // ===============================================================================================
  await scenario('A redraw nobody asked for keeps the focus on its card; the focus is not taken from the search', async () => {
    await setHistory(seed(4));
    const page = await historyPage();
    try {
      await page.focus('#historyList [data-history-id="k3"]');
      // A scan saved elsewhere: the worker adds an entry, and the list is drawn again from storage
      await setHistory([{ id: 'fresh', url: 'https://fresh.example/', hostname: 'fresh.example', title: 'Fresh', timestamp: NOW + 5000, detections: [det('Akamai', 'Anti-Bot', 70)] }, ...seed(4)]);
      await until(async () => (await cardIds(page))[0] === 'fresh', 10000, 'the new entry drawn');
      assert.deepEqual(await focusAt(page), { kind: 'card', id: 'k3' }, 'the same card, still focused');
      await page.focus('#historySearch');
      await setHistory(seed(4));
      await until(async () => (await cardIds(page))[0] === 'k1', 10000, 'the list drawn again');
      assert.equal((await focusAt(page)).kind, 'search', 'a person typing in the search keeps it');
    } finally { await page.close(); }
  });

  // ===============================================================================================
  await scenario('Tab stops: a card is two (the card, "…"); Scrapfly is in the menu and opens the same dialog as its button', async () => {
    await setHistory(seed(6));
    const page = await historyPage();
    try {
      await page.focus('#historySearch');
      const stops = [];
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        const at = await focusAt(page);
        if (at.kind === 'pagination') break;
        stops.push(at);
      }
      const inList = stops.filter(at => at.id);
      assert.equal(inList.length, 12, `two stops for each of six cards: ${inList.map(at => `${at.id}:${at.kind}`).join(' ')}`);
      assert.deepEqual([...new Set(inList.map(at => at.kind))].sort(), ['card', 'menu']);
      assert.ok(!stops.some(at => at.kind === 'scrapfly'), 'no stop on a Scrapfly button');
      assert.equal(stops.length - inList.length <= 12, true, `the rest of the tab is the header and the chips: ${stops.length - inList.length} stops`);
      console.log(`      Tab stops before the pager: ${stops.length} (${inList.length} in the list of six cards)`);

      // The button is still there for the mouse...
      await page.click('#historyList [data-history-id="k2"] .history-scrapfly-btn');
      const overlay = '.scrapfly-export-overlay, .scrapfly-export-dialog, [class*="scrapfly-export-"][role="dialog"]';
      await page.waitForSelector('.scrapfly-export-intro', { timeout: 8000 });
      assert.ok(await page.$eval('.scrapfly-export-intro', el => el.offsetParent !== null), `the dialog opened (${overlay.length > 0})`);
      const urlOfDialog = await page.evaluate(() => document.querySelector('.scrapfly-export-code, .scrapfly-export-panel')?.textContent || '');
      assert.match(urlOfDialog, /site2\.example/, 'for that card\'s page');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.scrapfly-export-intro', { state: 'detached', timeout: 8000 }).catch(() => {});
      // ...and in the menu, for the keyboard
      await page.evaluate(() => document.querySelectorAll('.scrapfly-export-overlay').forEach(el => el.remove()));
      await menuEntry(page, 'k3', 'scrapfly');
      assert.equal(await page.$eval('#historyItemMenu [data-action="scrapfly"]', el => el.textContent.trim()), 'Scrape with Scrapfly');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.scrapfly-export-intro', { timeout: 8000 });
      assert.match(await page.evaluate(() => document.querySelector('.scrapfly-export-code, .scrapfly-export-panel')?.textContent || ''), /site3\.example/, 'the menu entry opens it for its own card');
      await page.keyboard.press('Escape');
      // A page that cannot be scraped has no entry
      await W(() => 1);
      await page.evaluate(() => { const h = window.popupInstance.history; h._menuItemId = 'x'; h.syncItemMenu(document.querySelector('#historyItemMenu'), { id: 'x', url: 'chrome://settings', detections: [] }); });
      assert.equal(await page.$eval('#historyItemMenu [data-action="scrapfly"]', el => getComputedStyle(el).display), 'none', 'hidden for chrome://settings');
    } finally { await page.close(); }
  });

  // ===============================================================================================
  await scenario('Names: what the accessibility tree gives for a card, its numbers, its buttons and the details window', async () => {
    await setHistory(seed(3, { detections: RICH }));
    const page = await historyPage();
    try {
      const card = page.locator('#historyList .history-item').first();
      const tree = await card.ariaSnapshot();
      console.log(tree.split('\n').map(line => `      | ${line}`).join('\n'));
      for (const name of ['Detections: 3', 'Confidence: 72%', 'Difficulty: High', 'Anti-bot: 1', 'Captcha: 1', 'Fingerprint: 1', 'Matched combinations: 0']) {
        assert.ok(tree.includes(`img "${name}"`), `the card says "${name}"`);
      }
      // Twenty identical "More actions" would be one name for every card: the title makes each its own
      for (const index of [1, 2, 3]) {
        assert.equal(await page.getByRole('button', { name: `More actions Page ${index}`, exact: true }).count(), 1, `"…" of Page ${index}`);
        assert.equal(await page.getByRole('button', { name: `Scrape with Scrapfly Page ${index}`, exact: true }).count(), 1, `Scrapfly of Page ${index}`);
      }
      // The details window
      await page.focus('#historyList [data-history-id="k1"]');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#historyModalContent .history-modal-detection-header');
      const names = await page.$$eval('#historyModalContent .history-modal-detection-header', els => els.map(el => el.getAttribute('aria-label')));
      assert.deepEqual(names, ['Cloudflare, Anti-bot, 95%', 'hCaptcha, Captcha, 80%', 'Canvas Fingerprint, Fingerprint, 40%']);
      for (const name of names) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 1, name);
      assert.equal(await page.getByRole('button', { name: 'Detection Methods' }).count(), 0, 'no more identical "Detection methods" buttons');
      const detailsTree = await page.locator('#historyDetailModal').ariaSnapshot();
      console.log(detailsTree.split('\n').slice(0, 24).map(line => `      | ${line}`).join('\n'));
    } finally { await page.close(); }
  });

  // ===============================================================================================
  await scenario('Details window by keyboard: Enter opens a detection, Tab reaches the matched value, Enter and Space copy it, and it is said aloud', async () => {
    await setHistory(seed(2, { detections: RICH }));
    const page = await historyPage();
    try {
      // The clipboard is the one thing the harness cannot be given: what is handed to it is recorded
      await page.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = async (text) => { window.__copied.push(text); }; });
      await page.evaluate(() => {
        window.__said = [];
        const region = document.querySelector('#historyModalStatus');
        new MutationObserver(() => { if (region.textContent) window.__said.push(region.textContent); }).observe(region, { childList: true, characterData: true, subtree: true });
      });
      await page.focus('#historyList [data-history-id="k1"]');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#historyDetailModal', { state: 'visible' });
      const header = page.getByRole('button', { name: 'Cloudflare, Anti-bot, 95%', exact: true });
      await header.focus();
      assert.equal(await header.getAttribute('aria-expanded'), 'false');
      await page.keyboard.press('Enter');
      assert.equal(await header.getAttribute('aria-expanded'), 'true', 'Enter opens it');
      // Tab: the head of the first method, Enter shows its value, Tab: the value
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'history-modal-method-head');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      const value = await page.evaluate(() => ({ tag: document.activeElement.tagName, cls: document.activeElement.className, text: document.activeElement.textContent }));
      assert.deepEqual(value, { tag: 'BUTTON', cls: 'history-modal-method-value', text: 'cf_clearance=abc123' }, 'a real button, reached with Tab');
      assert.equal(await page.getByRole('button', { name: 'Copy value: cf_clearance=abc123', exact: true }).count(), 1, 'its name has the action and the value');
      await page.keyboard.press('Enter');
      await until(() => page.evaluate(() => window.__copied.length === 1), 5000, 'the copy');
      assert.equal(await page.evaluate(() => window.__copied[0]), '[COOKIE] cf_clearance=abc123');
      assert.match(await page.evaluate(() => document.activeElement.textContent), /Copied/, 'the visible feedback is as before');
      await sleep(250);
      assert.equal(await page.$eval('#historyModalStatus', el => el.textContent), 'Copied', 'and the window says it aloud');
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('history-modal-method-value')), true, 'the focus stays on the button');
      // Space copies too, and is said again
      await sleep(1800);
      await page.keyboard.press(' ');
      await until(() => page.evaluate(() => window.__copied.length === 2), 5000, 'the second copy');
      await sleep(250);
      assert.equal(await page.evaluate(() => window.__said.length), 2, 'said twice: a second copy is news too');
      assert.equal(await page.$eval('#historyModalStatus', el => el.textContent), 'Copied');
      await sleep(6300);
      assert.equal(await page.$eval('#historyModalStatus', el => el.textContent), '', 'and the region is emptied again');
      assert.deepEqual(await toasts(page), [], 'no toast on top of the inline feedback (as before)');

      // The list is drawn again while the window is open (a scan saved): Escape returns to the card that was drawn anew
      await setHistory([{ id: 'fresh', url: 'https://fresh.example/', hostname: 'fresh.example', title: 'Fresh', timestamp: NOW + 5000, detections: [det('Akamai', 'Anti-Bot', 70)] }, ...seed(2, { detections: RICH })]);
      await until(async () => (await cardIds(page))[0] === 'fresh', 10000, 'the list drawn again behind the window');
      await page.keyboard.press('Escape');
      await page.waitForSelector('#historyDetailModal', { state: 'hidden' });
      assert.deepEqual(await focusAt(page), { kind: 'card', id: 'k1' }, 'Escape: the focus is on the card the window was opened from');
    } finally { await page.close(); }
  });

  // ===============================================================================================
  await scenario('Live regions: a search, a chip and Clear filters are said once typing pauses; a redraw of the same search says nothing', async () => {
    await setHistory(seed(5).map((entry, i) => ({ ...entry, pinned: i < 2 })));
    const page = await historyPage();
    try {
      await page.evaluate(() => {
        window.__said = [];
        const region = document.querySelector('#historyStatus');
        new MutationObserver(() => { if (region.textContent) window.__said.push(region.textContent); }).observe(region, { childList: true, characterData: true, subtree: true });
      });
      const said = () => page.evaluate(() => window.__said.slice());
      const status = () => page.$eval('#historyStatus', el => el.textContent);
      assert.equal(await page.$eval('#historyStatus', el => el.getAttribute('role') + '/' + el.getAttribute('aria-live')), 'status/polite');
      assert.deepEqual(await said(), [], 'opening the tab says nothing');
      // Typing "Page 2" a letter at a time: said once, at the end
      await page.focus('#historySearch');
      await page.keyboard.type('Page 2', { delay: 60 });
      await sleep(900);
      assert.deepEqual(await said(), ['Showing 1-1 of 1'], 'one line for the whole word');
      assert.equal(await status(), 'Showing 1-1 of 1');
      await sleep(6500);
      assert.equal(await status(), '', 'and it is gone after a few seconds');
      // Nothing matches: the visible block is hidden along with the pager, the region still speaks
      await page.fill('#historySearch', 'zzzz');
      await sleep(900);
      assert.equal(await status(), 'No entries match your search or filters.');
      assert.equal(await page.$eval('#historyPagination', el => getComputedStyle(el).display), 'none', 'the pager is hidden: the region is not in it');
      // Clear filters by keyboard: the count is said and the focus is on the search
      await page.focus('#historyClearFilters');
      await page.keyboard.press('Enter');
      await sleep(900);
      assert.equal(await status(), 'Showing 1-5 of 5', 'back to everything');
      assert.equal((await focusAt(page)).kind, 'search');
      // A chip
      await page.focus('.history-filter-chip[data-filter="pinned"]');
      await page.keyboard.press('Enter');
      await sleep(900);
      assert.equal(await status(), 'Showing 1-2 of 2', 'the Pinned chip');
      assert.equal(await page.$eval('.history-filter-chip[data-filter="pinned"]', el => el.getAttribute('aria-pressed')), 'true');
      // A pin redraws the same search: nothing new is said
      const before = (await said()).length;
      await page.click('#historyList [data-history-id="k1"] .history-more-btn');
      await page.click('#historyItemMenu [data-action="pin"]');
      await sleep(1500);
      assert.equal((await said()).length, before, 'unpinning one with the chip on redraws the list, and the count was not asked for');
    } finally { await page.close(); }
  });

  // ===============================================================================================
  await scenario('French: the confidence and difficulty tips use the language\'s own form (the details window too)', async () => {
    const fr = JSON.parse(fs.readFileSync(path.join(REPO, '_locales/fr/messages.json'), 'utf8'));
    const fill = (key, ...args) => fr[key].message.replace(/\{(\d+)\}/g, (_, i) => args[Number(i)]);
    await setLanguage('fr');
    await setHistory(seed(1, { detections: [det('Cloudflare', 'Anti-Bot', 90, 'Medium', [{ type: 'cookie', value: 'a=b', confidence: 90 }])] }));
    const page = await historyPage();
    try {
      const tip = (selector) => page.$eval(selector, el => el.getAttribute('data-tip'));
      assert.equal(await tip('#historyList .conf-metric'), fill('clipboardConfidenceFmt', 90));
      assert.equal(await tip('#historyList .diff-metric'), fill('clipboardDifficultyFmt', fr.difficultyMedium.message));
      assert.match(await tip('#historyList .conf-metric'), / : 90 %$/, 'a space before the colon, as French writes it');
      assert.equal(await page.$eval('#historyList .conf-metric', el => el.getAttribute('aria-label')), fill('clipboardConfidenceFmt', 90), 'and the reader hears the same');
      await page.focus('#historyList .history-item');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#historyModalStatus');
      assert.equal(await tip('#historyModalStats .hm-metric-confidence'), fill('clipboardConfidenceFmt', 90));
      assert.equal(await tip('#historyModalStats .hm-metric-difficulty'), fill('clipboardDifficultyFmt', fr.difficultyMedium.message));
    } finally { await page.close(); await setLanguage('en'); }
  });

  // ===============================================================================================
  /** Where the cards and the details window are and how big, for a run on the earlier build to be compared with. */
  async function look(page) {
    const rect = (selector, all) => page.evaluate(([sel, many]) => {
      const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; };
      const found = many ? [...document.querySelectorAll(sel)].map(box) : [document.querySelector(sel)].filter(Boolean).map(box);
      return many ? found : (found[0] || null);
    }, [selector, all]);
    const out = {};
    for (const selector of ['.history-item', '.history-item-top', '.history-title', '.history-url', '.history-scrapfly-btn', '.history-more-btn', '.history-metrics', '.history-metric', '.conf-metric', '.diff-metric', '.history-timestamp']) out[`list ${selector}`] = await rect(`#historyList ${selector}`);
    out['list cat counts'] = await rect('#historyList .history-cat-count', true);
    out['list height'] = await page.$eval('#historyList', el => [el.clientHeight, el.scrollHeight]);
    await page.focus('#historyList .history-item');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#historyDetailModal', { state: 'visible' });
    await page.$eval('#historyModalContent .history-modal-detection-header', el => el.click());
    await page.$$eval('#historyModalContent .history-modal-method-head', heads => heads.forEach(head => head.click()));
    await sleep(500);
    for (const selector of ['.history-modal-detection-header', '.history-modal-detection-details', '.history-modal-method-item', '.history-modal-method-head', '.history-modal-method-value']) out[`modal ${selector}`] = await rect(`#historyModalContent ${selector}`);
    out['modal values'] = await rect('#historyModalContent .history-modal-method-value', true);
    // The text inside the value: where its first line is drawn
    out['modal value text'] = await page.$eval('#historyModalContent .history-modal-method-value', (el) => {
      const range = document.createRange(); range.selectNodeContents(el);
      const r = range.getBoundingClientRect(); return [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
    });
    out['modal value style'] = await page.$eval('#historyModalContent .history-modal-method-value', (el) => {
      const s = getComputedStyle(el);
      return { fontSize: s.fontSize, fontFamily: s.fontFamily.slice(0, 40), fontWeight: s.fontWeight, lineHeight: s.lineHeight, color: s.color, background: s.backgroundColor, border: s.borderTopWidth + ' ' + s.borderTopColor, radius: s.borderTopLeftRadius, textAlign: s.textAlign };
    });
    return out;
  }

  await (async () => {
    const run = MEASURE || SHOTS;
    if (!run) return;
    const frames = [];
    for (const [label, theme, lang] of [['dark', 'dark', 'en'], ['light', 'light', 'en'], ['rtl', 'dark', 'ar']]) {
      await setLanguage(lang);
      await setHistory(seed(4, { detections: RICH }).map((entry, i) => (i === 1 ? { ...entry, pinned: true, note: 'needs a residential proxy', changed: { at: NOW, added: ['DataDome'], removed: [] } } : entry)));
      const page = await historyPage({ theme });
      try {
        await sleep(600);
        const numbers = await look(page);
        frames.push([label, numbers]);
        if (SHOTS) {
          await page.screenshot({ path: path.join(SHOTS, `details-${label}.png`), clip: { x: 0, y: 0, width: 420, height: 650 } });
          // The value button with the focus ring
          await page.focus('#historyModalContent .history-modal-method-value').catch(() => {});
          await page.screenshot({ path: path.join(SHOTS, `details-focus-${label}.png`), clip: { x: 0, y: 0, width: 420, height: 650 } });
          await page.keyboard.press('Escape');
          await page.waitForSelector('#historyDetailModal', { state: 'hidden' });
          await sleep(300);
          await page.screenshot({ path: path.join(SHOTS, `list-${label}.png`), clip: { x: 0, y: 0, width: 420, height: 650 } });
          await page.focus('#historyList .history-item .history-more-btn');
          await page.keyboard.press('Enter');
          await sleep(300);
          await page.screenshot({ path: path.join(SHOTS, `menu-${label}.png`), clip: { x: 0, y: 0, width: 420, height: 650 } });
        }
      } finally { await page.close(); }
    }
    await setLanguage('en');
    if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(Object.fromEntries(frames), null, 2)}\n`);
    if (MEASURE) console.log(`measured ${frames.length} frames${OUT ? ` into ${OUT}` : ''}`);
  })();

  await ctx.close();
  if (pageErrors.length) { console.log(`page errors:\n  ${pageErrors.join('\n  ')}`); results.push({ name: 'no page errors', ok: false, error: new Error(pageErrors.join('; ')) }); }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed${failed.length ? `; failed: ${failed.map(f => f.name).join(' | ')}` : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
