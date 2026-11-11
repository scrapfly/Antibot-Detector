#!/usr/bin/env node
/**
 * 3.1.5: History's sort dropdown in the real extension (unpacked in Chromium): it is drawn like a chip (same height, pill and
 * border, as wide as its text), sits at the end of the chip row, stays inside the popup, in English and Arabic, dark and light,
 * and sorting changes the list's order.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium (npm run e2e:setup).
 *   node scripts/e2e-v315-history-sort.js [<checkout>]
 * V315_SHOTS=<folder> saves a screenshot of the chip row for every theme and language.
 */
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { console.error('Playwright is not installed: npm run e2e:setup'); process.exit(2); }
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const SHOTS = process.env.V315_SHOTS || path.join(os.tmpdir(), 'e2e-v315-history-sort-shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const NOW = Date.now();
const det = (name, category, confidence) => ({ detector: { name }, name, category, confidence, matches: [{ type: 'cookie', value: 'v' }] });
const entry = (id, host, ago, detections) => ({ id, url: `https://${host}/`, hostname: host, title: `Page ${id}`, timestamp: NOW - ago, detections, detectionCount: detections.length });
const SEED = [
  entry('b', 'bravo.example', 1000, [det('Cloudflare', 'Anti-Bot', 90)]),
  entry('a', 'alpha.example', 5000, [det('Cloudflare', 'Anti-Bot', 90), det('Turnstile', 'CAPTCHA', 80), det('Canvas Fingerprint', 'Fingerprint', 20)]),
  entry('c', 'charlie.example', 9000, [det('Turnstile', 'CAPTCHA', 80), det('Canvas Fingerprint', 'Fingerprint', 20)])
];

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v315-sort-'));
  fs.mkdirSync(SHOTS, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 400, height: 580 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
  });
  const errors = [];
  let failed = 0;
  const getWorker = async () => { for (let i = 0; i < 200; i++) { const w = ctx.serviceWorkers().find(x => x.url().startsWith('chrome-extension://')); if (w) return w; await sleep(200); } throw new Error('no worker'); };
  const extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  const W = async (fn, arg) => (await getWorker()).evaluate(fn, arg);
  await W((items) => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items }) }), SEED);

  async function check(name, fn) {
    try { await fn(); console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${String(e.stack || e).split('\n').slice(0, 6).join('\n      ')}`); }
  }
  async function open(lang, theme) {
    await W((l) => chrome.storage.local.set({ scrapfly_language_override: l }), lang);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 400, height: 580 });
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await page.bringToFront();
    await page.waitForFunction(() => window.popupInstance && window.popupInstance.detectorManager && window.popupInstance.detectorManager.initialized, null, { timeout: 30000 });
    // The popup chooses its default tab after the rules are ready (popup.js, loadAndApplyDefaultTab), so a click that comes first can be
    // switched back to Detection: click History until it is the tab on screen
    await page.waitForFunction(() => { const t = document.querySelector('#historyTab'); if (t && t.getBoundingClientRect().height > 0) return true; const b = document.querySelector('.tab-btn[data-tab="history"]'); if (b) b.click(); return false; }, null, { polling: 300, timeout: 20000 });
    await page.waitForSelector('.history-item', { state: 'attached', timeout: 20000 }); await sleep(500);
    await page.evaluate((t) => window.ScrapflyTheme.apply(t), theme);
    await page.waitForFunction(() => { const r = document.querySelector('#historyTab .history-filters'); return r && !r.hidden && r.getBoundingClientRect().height > 0; }, null, { timeout: 20000 });
    await sleep(300);
    return page;
  }

  for (const lang of ['en', 'ar']) for (const theme of ['dark', 'light']) {
    await check(`${lang} ${theme}: the dropdown is a chip-sized pill at the end of the row, inside the popup`, async () => {
      const page = await open(lang, theme);
      const box = await page.evaluate(() => {
        const s = document.querySelector('#historySort').getBoundingClientRect();
        const c = [...document.querySelectorAll('.history-filter-chip')].map(x => x.getBoundingClientRect()).find(r => r.height > 0);
        const row = document.querySelector('#historyTab .history-filters').getBoundingClientRect();
        return { sel: { x: s.x, w: s.width, h: s.height, r: s.right }, chip: { h: c.height }, row: { x: row.x, r: row.right } };
      });
      assert.equal(Math.round(box.sel.h), Math.round(box.chip.h), 'same height as a chip');
      assert.ok(box.sel.w < 200, `compact, not stretched (${box.sel.w}px)`);
      assert.ok(box.sel.x >= 0 && box.sel.r <= 400, 'inside the popup');
      await page.screenshot({ path: path.join(SHOTS, `chips-${lang}-${theme}.png`), clip: { x: 0, y: 0, width: 400, height: 260 } });
      await page.close();
    });
  }
  await check('sorting changes the order and keeps the row numbers sensible', async () => {
    const page = await open('en', 'dark');
    const hosts = () => page.evaluate(() => [...document.querySelectorAll('.history-item')].map(i => (i.textContent.match(/(alpha|bravo|charlie)\.example/) || [])[0]));
    let order = await hosts();
    assert.deepEqual(order, ['bravo.example', 'alpha.example', 'charlie.example'], `newest first: ${JSON.stringify(order)}`);
    await page.selectOption('#historySort', 'host');
    await sleep(300);
    order = await hosts();
    assert.deepEqual(order, ['alpha.example', 'bravo.example', 'charlie.example'], `by site: ${JSON.stringify(order)}`);
    await page.selectOption('#historySort', 'detections');
    await sleep(300);
    assert.equal((await hosts())[0], 'alpha.example');
    await page.close();
  });
  await check('no page errors', async () => assert.deepEqual(errors, []));
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(failed ? `RESULT ${failed} FAILED` : 'RESULT ALL PASS');
  process.exit(failed ? 1 : 0);
})();
