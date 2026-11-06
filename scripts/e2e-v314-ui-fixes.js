#!/usr/bin/env node
/**
 * 3.1.4 review fixes of History and the toasts, in the real extension (unpacked in Chromium), where a browser shows what the unit
 * tests cannot:
 *
 *   Scrolling     a keyboard user scrolled History with the wheel; a write in the background draws the list again: the page stays
 *                 where it was scrolled to, and the focus is on the same entry's new card
 *   Dialogs       Compare and Delete close over a list drawn again under them: the focus is on an entry's card, not on the page
 *   Long result   Compare with a long result: Tab reaches the result (named like the dialog), the arrows scroll it, Tab goes on
 *                 to the buttons and comes back round to it
 *   Toasts        a "Copied" toast shows at once with two longer notes on screen; a toast drawn under a pointer that stays still
 *                 goes on time, one the pointer moves onto waits
 *   Look          the long compare result with its focus ring and the three toasts, light, dark and Arabic
 *
 * History is seeded with entries, so no site is visited. The popup is opened as a page 400 x 580, the size of the real popup.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup
 *   node scripts/e2e-v314-ui-fixes.js [<checkout>] [--only=<text>]
 * V314_SHOTS=<folder> saves the screenshots (default: <tmp>/e2e-v314-ui-fixes-shots).
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
const SHOTS = process.env.V314_SHOTS || path.join(os.tmpdir(), 'e2e-v314-ui-fixes-shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- History ----------------------------------------------------------------------------------------
const NOW = Date.now();
const MIN = 60000;
const det = (name, category, confidence) => ({ detector: { name }, name, category, confidence, matches: [{ type: 'cookie', value: 'v' }] });
const entry = (id, url, ago, detections) => ({ id, url, hostname: new URL(url).hostname, title: `Page ${id}`, timestamp: NOW - ago, detections, detectionCount: detections.length, categories: [...new Set(detections.map(d => d.category))] });
// Twenty cards on the first page, enough to scroll
const MANY = Array.from({ length: 20 }, (_, i) => entry(`site-${i}`, `https://site${i}.example/`, (i + 10) * 60 * MIN, [det('Cloudflare', 'Anti-Bot', 80)]));
// A page scanned three times: the later scan found many more protections, so the result is long
const LONG_BEFORE = [det('Cloudflare', 'Anti-Bot', 70)];
const LONG_AFTER = [...Array.from({ length: 14 }, (_, i) => det(`Fingerprint probe ${i + 1}`, 'Fingerprint', 10 + i)), det('Cloudflare', 'Anti-Bot', 95), det('Turnstile', 'CAPTCHA', 60)];
const SEED = [
  entry('long-now', 'https://shop.example/cart', 1 * MIN, LONG_AFTER),
  entry('long-before', 'https://shop.example/cart', 2 * MIN, LONG_BEFORE),
  ...MANY
];

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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-ui-fixes-'));
  fs.mkdirSync(SHOTS, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 400, height: 580 },
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
  async function until(check, ms = 15000, what = 'condition') {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(150);
    }
  }
  const setLanguage = (lang) => W((l) => chrome.storage.local.set({ scrapfly_language_override: l }), lang);
  const seed = (list) => W((items) => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items }) }), list);
  const setTheme = (page, value) => page.evaluate((v) => window.ScrapflyTheme.apply(v), value);

  /** The popup as a page (the size of the real one) on its History tab, in the language set before. */
  async function historyPage() {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`popup: ${e.message}`));
    await page.setViewportSize({ width: 400, height: 580 });
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await page.bringToFront(); // a tab the browser counts as hidden gets no animation frames
    await page.waitForFunction(() => window.popupInstance && window.popupInstance.detectorManager && window.popupInstance.detectorManager.initialized, null, { polling: 250, timeout: 30000 });
    await page.evaluate(() => window.popupInstance.switchTab('history'));
    await page.waitForSelector('.history-item', { timeout: 20000 });
    await sleep(300);
    return page;
  }
  /** Where the keyboard is: the entry whose card (or a control of it) has the focus, or what else has it. */
  const focusOf = (page) => page.evaluate(() => {
    const a = document.activeElement;
    const card = a && a.closest ? a.closest('.history-item') : null;
    if (card) return { entry: card.dataset.historyId, on: a === card ? 'card' : (a.dataset.action || a.className) };
    return { entry: null, on: a === document.body ? 'body' : `${a.tagName.toLowerCase()}.${a.className}` };
  });
  /** The element that scrolls History. */
  const scroller = (page) => page.evaluateHandle(() => {
    for (let el = document.querySelector('#historyList'); el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el;
    }
    return document.scrollingElement;
  });
  /** A write to History from elsewhere (a scan saved, the watchlist): the popup's storage listener draws the list again. */
  async function writeInBackground(page) {
    const before = await page.evaluate(() => { window.__drawn = 0; const h = window.popupInstance.history; const own = h.renderHistoryPage.bind(h); h.renderHistoryPage = (items) => { own(items); window.__drawn++; }; return 0; });
    await W(async () => {
      const raw = (await chrome.storage.local.get('scrapfly_history')).scrapfly_history;
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      data.items[data.items.length - 1].note = `touched ${Date.now()}`;
      await chrome.storage.local.set({ scrapfly_history: JSON.stringify(data) });
    });
    await until(() => page.evaluate(() => window.__drawn > 0), 10000, 'the list drawn again');
    await sleep(300);
    return before;
  }
  async function openCompare(page, id) {
    await page.evaluate((entryId) => {
      const history = window.popupInstance.history;
      window.__compare = history.compareHistoryItem(history.historyItems.find(item => item.id === entryId));
    }, id);
    await page.waitForSelector('.notification-confirm .history-compare', { timeout: 10000 });
    await page.waitForFunction(() => { const d = document.querySelector('.notification-confirm'); return d && d.getAttribute('data-show') === 'true'; }, null, { timeout: 5000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(350);
  }
  async function shot(page, name) {
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), clip: { x: 0, y: 0, width: 400, height: 580 } });
  }

  // ---- Start-up -------------------------------------------------------------------------------------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  await setLanguage('en');
  await seed(SEED);

  // ===============================================================================================
  await scenario('Scrolling: a redraw in the background leaves the page where the wheel put it, with the focus on the same entry', async () => {
    const page = await historyPage();
    await page.focus('.history-item[data-history-id="site-1"]');
    const box = await scroller(page);
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 900);
    await sleep(400);
    const scrolled = await box.evaluate(el => el.scrollTop);
    assert.ok(scrolled > 300, `the list scrolled: ${scrolled}`);
    await writeInBackground(page);
    const after = await box.evaluate(el => el.scrollTop);
    assert.ok(Math.abs(after - scrolled) <= 2, `the page stayed where it was scrolled to: ${scrolled} then ${after}`);
    assert.deepEqual(await focusOf(page), { entry: 'site-1', on: 'card' });
    await page.close();
  });

  await scenario('Dialogs: Compare and Delete closing over a list drawn again under them put the focus on an entry, not on the page', async () => {
    const page = await historyPage();
    // Compare, from the entry's "…" menu, as a person gets there
    await page.focus('.history-item[data-history-id="long-now"] .history-more-btn');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#historyItemMenu:not([hidden])');
    await page.$eval('#historyItemMenu [data-action="compare"]', el => el.click());
    await page.waitForSelector('.notification-confirm .history-compare', { timeout: 10000 });
    await sleep(400);
    await writeInBackground(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.notification-confirm'), null, { timeout: 5000 });
    await page.evaluate(() => window.__compare);
    assert.deepEqual(await focusOf(page), { entry: 'long-now', on: 'card' }, 'Compare: the entry it was opened for');

    // Delete, from the menu, confirmed with the keyboard after the list was drawn again
    await page.focus('.history-item[data-history-id="site-3"] .history-more-btn');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#historyItemMenu:not([hidden])');
    await page.$eval('#historyItemMenu [data-action="delete"]', el => el.click());
    await page.waitForSelector('.notification-confirm[data-open="true"]', { timeout: 10000 });
    await sleep(400);
    await writeInBackground(page);
    await page.evaluate(() => document.querySelector('.notification-confirm[data-open="true"] .notification-btn-confirm').focus());
    await page.keyboard.press('Enter');
    await until(() => page.evaluate(() => !document.querySelector('.history-item[data-history-id="site-3"]')), 10000, 'the entry deleted');
    await sleep(600);
    const after = await focusOf(page);
    assert.ok(after.entry, `Delete: the focus is on a card, not on ${after.on}`);
    await page.close();
    await seed(SEED);
  });

  await scenario('Long result: Tab reaches the compare result, the arrows scroll it, and the dialog\'s Tab loop includes it', async () => {
    const page = await historyPage();
    await openCompare(page, 'long-now');
    const info = await page.$eval('.history-compare-result', el => ({ tabIndex: el.tabIndex, role: el.getAttribute('role'), name: el.getAttribute('aria-label'), overflow: el.scrollHeight - el.clientHeight, title: document.querySelector('.notification-confirm-title').textContent.trim() }));
    assert.ok(info.overflow > 40, `the result is long enough to scroll: ${info.overflow}px more`);
    assert.equal(info.tabIndex, 0);
    assert.equal(info.role, 'region');
    assert.equal(info.name, info.title, 'named like the dialog');
    // From the list of scans, Tab: the Unchanged button is not there (nothing unchanged but Cloudflare's move), the result is next
    const stops = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      stops.push(await page.evaluate(() => { const a = document.activeElement; return a.classList.contains('history-compare-result') ? 'result' : (a.textContent.trim().slice(0, 20) || a.tagName); }));
    }
    assert.ok(stops.includes('result'), `Tab reaches the result: ${stops.join(' > ')}`);
    assert.ok(stops.filter(s => s === 'result').length >= 2, `the Tab loop comes back round to it: ${stops.join(' > ')}`);
    while (!(await page.evaluate(() => document.activeElement.classList.contains('history-compare-result')))) await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('PageDown');
    await sleep(300);
    assert.ok(await page.$eval('.history-compare-result', el => el.scrollTop) > 0, 'the arrows scroll the result');
    await page.evaluate(() => { document.querySelector('.history-compare-result').scrollTop = 0; });
    for (const [lang, theme] of [['en', 'light'], ['en', 'dark']]) {
      await setTheme(page, theme);
      await sleep(200);
      await shot(page, `compare-result-focus-${lang}-${theme}`);
    }
    await page.keyboard.press('Escape');
    await page.close();
  });

  await scenario('Toasts: "Copied" shows at once beside two longer notes; a still pointer does not hold a toast, a moving one does', async () => {
    const page = await historyPage();
    const visible = () => page.$$eval('.notification-toast[data-show="true"] .notification-message', els => els.map(el => el.textContent.trim()));
    await page.evaluate(() => {
      NotificationHelper.warning('Could not download: A. Try again later.', { duration: 8000 });
      NotificationHelper.warning('Could not download: B. Try again later.', { duration: 8000 });
      NotificationHelper.info('A note that waits for its place', { duration: 8000 });
    });
    await sleep(500);
    const t0 = Date.now();
    await page.evaluate(() => NotificationHelper.micro('Copied'));
    await until(async () => (await visible()).includes('Copied'), 1200, '"Copied" on screen');
    const shown = Date.now() - t0;
    assert.ok(shown < 1200, `"Copied" showed after ${shown} ms`);
    assert.ok(!(await visible()).includes('A note that waits for its place'), 'the longer note still waits');
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await sleep(150);
      await shot(page, `toasts-en-${theme}`);
    }
    await page.evaluate(() => { document.querySelectorAll('.notification-toast').forEach(t => t.remove()); });
    await sleep(100);

    // The pointer rests where the next toast appears, and stays still
    await page.evaluate(() => NotificationHelper.success('Where the toast shows'));
    await sleep(500);
    const spot = await page.$eval('.notification-toast', el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.evaluate(() => { document.querySelectorAll('.notification-toast').forEach(t => t.remove()); });
    await sleep(3600);
    await page.mouse.move(spot.x, spot.y);
    await sleep(200);
    await page.evaluate(() => NotificationHelper.success('Drawn under a still pointer'));
    await sleep(3000 + 900);
    assert.ok(!(await visible()).includes('Drawn under a still pointer'), 'it went away on time although the pointer rests on it');
    // The pointer moves onto a toast: its time waits
    await page.mouse.move(5, 300);
    await page.evaluate(() => NotificationHelper.success('Pointed at'));
    await sleep(400);
    const at = await page.$eval('.notification-toast[data-show="true"]', el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(at.x - 10, at.y, { steps: 4 });
    await page.mouse.move(at.x, at.y, { steps: 4 });
    await sleep(4500);
    assert.ok((await visible()).includes('Pointed at'), 'held while the pointer is on it');
    await page.mouse.move(5, 300, { steps: 4 });
    await until(async () => !(await visible()).includes('Pointed at'), 6000, 'the toast to go once the pointer left');
    await page.close();
  });

  await scenario('Look: the long compare result and the toasts in Arabic, light and dark', async () => {
    await setLanguage('ar');
    try {
      const page = await historyPage();
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).direction), 'rtl');
      await openCompare(page, 'long-now');
      await page.focus('.history-compare-result');
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        await sleep(200);
        await shot(page, `compare-result-focus-ar-${theme}`);
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.notification-confirm'), null, { timeout: 5000 });
      await page.mouse.move(5, 300);
      await page.evaluate(() => {
        NotificationHelper.warning(FormatUtils.t('backupFailed', 'Could not create the backup'), { duration: 8000 });
        NotificationHelper.info(FormatUtils.t('restoreNothing', 'Nothing is selected.'), { duration: 8000 });
        NotificationHelper.micro(FormatUtils.t('copiedNotification', 'Copied'));
      });
      await sleep(500);
      assert.equal((await page.$$('.notification-toast[data-show="true"]')).length, 3);
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        await sleep(150);
        await shot(page, `toasts-ar-${theme}`);
      }
      await page.close();
    } finally {
      await setLanguage('en');
    }
  });

  // ---- Report ----------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${pageErrors.join('\n  ')}`);
  console.log(`\nScreenshots: ${SHOTS}`);
  console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
  console.log(failed.length || pageErrors.length ? 'RESULT FAILED' : `RESULT ALL PASS (${results.length} scenarios)`);
  await ctx.close();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
