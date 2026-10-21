#!/usr/bin/env node
/**
 * The 3.0.4 features end to end, in the real extension (unpacked in Chromium):
 *
 *   Statistics        a protection's name shows the domains that have it; a site's name opens its History in a new tab,
 *                     already narrowed to that site (popup.html?tab=history&search=...)
 *   Compare scans     History → … → Compare with…: the dialog lists the page's other scans, shows what was added, removed
 *                     and changed, copies it as Markdown, and the item is disabled when there is nothing to compare with
 *
 * History is seeded with entries, so no site is visited.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:v304            (add --shots=<folder> to save screenshots of the new dialogs)
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
const shotsDir = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
    console.log(`FAIL  ${name}\n      ${String((error && error.stack) || error).split('\n').slice(0, 6).join('\n      ')}`);
  }
}

const NOW = Date.now();
const HOUR = 3600000;
const det = (name, category, confidence, types = ['cookie']) => ({ detector: { name }, name, category, confidence, matches: types.map(type => ({ type, value: `${type}-value` })) });
const entry = (id, url, ago, detections, extra = {}) => ({ id, url, hostname: new URL(url).hostname, title: `Page ${id}`, timestamp: NOW - ago, detections, detectionCount: detections.length, categories: [...new Set(detections.map(d => d.category))], ...extra });
// One page scanned three times (newest first), and two other sites
const SEED = [
  entry('c3', 'https://shop.example/cart', 1 * HOUR, [det('Cloudflare', 'Anti-Bot', 95, ['cookie', 'header']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('DataDome', 'Anti-Bot', 80), det('Canvas Fingerprint', 'Fingerprint', 30, ['js_hooks'])]),
  entry('c2', 'https://shop.example/cart', 30 * HOUR, [det('Cloudflare', 'Anti-Bot', 70), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Akamai', 'Anti-Bot', 85), det('Canvas Fingerprint', 'Fingerprint', 30, ['js_hooks'])]),
  entry('c1', 'https://shop.example/cart?ref=mail', 80 * HOUR, [det('Cloudflare', 'Anti-Bot', 70), det('Turnstile', 'CAPTCHA', 90, ['url'])]),
  entry('n1', 'https://news.example/', 5 * HOUR, [det('Turnstile', 'CAPTCHA', 90, ['url'])]),
  entry('s1', 'https://solo.example/page', 6 * HOUR, [det('Kasada', 'Anti-Bot', 80, ['url'])])
];

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v304-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
  });
  let extId;
  const pageErrors = [];

  async function getWorker(ms = 40000) {
    const end = Date.now() + ms;
    for (;;) {
      const sw = ctx.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
      if (sw) return sw;
      if (Date.now() > end) throw new Error('the extension service worker did not start');
      await sleep(200);
    }
  }
  const W = async (fn, arg) => (await getWorker()).evaluate(fn, arg);
  const seed = (list) => W((value) => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items: value }) }), list);
  async function openExtensionPage(file = 'popup.html') {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${file}: ${e.message}`));
    await page.goto(`chrome-extension://${extId}/${file}`);
    if (file.startsWith('popup.html')) await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { timeout: 30000 });
    return page;
  }
  async function until(check, ms = 15000, what = 'condition') {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(300);
    }
  }

  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  await seed(SEED);

  // ===============================================================================================
  await scenario('Statistics: a protection shows its domains, a site opens its History narrowed to it', async () => {
    const page = await openExtensionPage('sections/stats/stats.html');
    await page.waitForSelector('.stats-section-btn', { timeout: 15000 });
    await page.evaluate(() => document.querySelector('.stats-section-btn[data-section="protections"]').click());
    await page.waitForSelector('#statsProtectionTable .stats-cell-link', { timeout: 15000 });
    const names = await page.$$eval('#statsProtectionTable .stats-cell-link', els => els.map(el => el.textContent.trim()));
    assert.ok(names.includes('Turnstile') && names.includes('Cloudflare'), names.join(', '));
    // Turnstile is on shop.example and news.example only
    await page.evaluate(() => [...document.querySelectorAll('#statsProtectionTable .stats-cell-link')].find(el => el.textContent.trim() === 'Turnstile').click());
    await page.waitForFunction(() => !document.querySelector('#stats-panel-domains').hidden, null, { timeout: 5000 });
    assert.equal(await page.$eval('#statsDomainSearch', el => el.value), 'Turnstile');
    const hosts = await page.$$eval('#statsDomainTable .stats-link-btn', els => els.map(el => el.textContent.trim()).sort());
    assert.deepEqual(hosts, ['news.example', 'shop.example']);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#statsDomainTable .stats-link-btn')].find(el => el.textContent.trim() === 'news.example').getAttribute('title')), 'Open news.example in History');

    // A site's name opens the popup page on History, narrowed to that site, in a new tab
    const opened = new Promise(r => ctx.once('page', r));
    await page.evaluate(() => [...document.querySelectorAll('#statsDomainTable .stats-link-btn')].find(el => el.textContent.trim() === 'shop.example').click());
    const tab = await opened;
    pageErrors.length = 0;
    tab.on('pageerror', (e) => pageErrors.push(`history tab: ${e.message}`));
    await tab.waitForURL(/popup\.html\?tab=history&search=shop\.example$/, { timeout: 10000 });
    await tab.waitForSelector('.history-item', { timeout: 20000 });
    await until(async () => (await tab.$$eval('.history-item', els => els.length)) === 3, 10000, 'the History list narrowed to shop.example');
    assert.equal(await tab.$eval('#historySearch', el => el.value), 'shop.example');
    const titles = await tab.$$eval('.history-item', els => els.map(el => el.textContent.replace(/\s+/g, ' ')));
    assert.ok(titles.every(t => /shop\.example/.test(t)), titles.join(' | '));
    await tab.close();
    await page.close();
  });

  // ===============================================================================================
  await scenario('History → Compare with…: what was added, removed and changed, Markdown, and nothing to compare', async () => {
    const page = await openExtensionPage();
    await page.evaluate(() => {
      globalThis.__copied = [];
      FormatUtils.copyToClipboard = async (text) => { globalThis.__copied.push(text); return true; };
    });
    await page.$eval('#nav-history', el => el.click());
    await page.waitForSelector('.history-item', { timeout: 20000 });
    const menuFor = async (id) => {
      await page.evaluate((target) => document.querySelector(`.history-item[data-history-id="${target}"] .history-more-btn`).click(), id);
      await page.waitForSelector('#historyItemMenu:not([hidden])');
    };
    // The page with only one scan: the item is disabled and says why
    await menuFor('s1');
    assert.equal(await page.$eval('#historyItemMenu [data-action="compare"]', el => el.disabled), true);
    assert.equal(await page.$eval('#historyItemMenu [data-action="compare"]', el => el.title), 'No other saved scan of this page to compare with');
    await page.keyboard.press('Escape');

    // shop.example/cart: scanned three times (the third with another query); compare the newest with the one before it
    await menuFor('c3');
    assert.equal(await page.$eval('#historyItemMenu [data-action="compare"]', el => el.disabled), false);
    await page.$eval('#historyItemMenu [data-action="compare"]', el => el.click());
    await page.waitForSelector('.notification-confirm .history-compare', { timeout: 8000 });
    const dialog = () => page.$eval('.notification-confirm .history-compare', el => el.innerText.replace(/\n+/g, ' | '));
    const options = await page.$$eval('.notification-confirm .history-compare select option', els => els.map(el => el.textContent));
    assert.equal(options.length, 2, options.join(' / '));
    assert.ok(/ · 4 found$/.test(options[0]) && /· 2 found · \/cart\?ref=mail$/.test(options[1]), options.join(' / '));
    assert.equal(await page.$eval('.notification-confirm .history-compare select', el => el.selectedIndex), 0, 'the previous scan is picked first');
    let text = await dialog();
    assert.ok(/ADDED \(1\).*DataDome · Anti-bot · 80%/.test(text), text);
    assert.ok(/REMOVED \(1\).*Akamai · Anti-bot · 85%/.test(text), text);
    assert.ok(/CHANGED \(1\).*Cloudflare · Anti-bot · 70% → 95% \(\+25\) · New evidence: Headers/.test(text), text);
    assert.ok(/UNCHANGED \(2\)/.test(text) && /Turnstile/.test(text), text);

    if (shotsDir) { await sleep(700); fs.mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: path.join(shotsDir, 'compare-dialog.png') }); }
    // The older scan: Cloudflare 70 → 95 and the new evidence, Akamai gone is not in it
    await page.selectOption('.notification-confirm .history-compare select', { index: 1 });
    await until(async () => /ADDED \(2\)/.test(await dialog()), 5000, 'the second comparison');
    text = await dialog();
    assert.ok(text.includes('DataDome · Anti-bot · 80%') && text.includes('Canvas Fingerprint · Fingerprint · 30%'), text);
    assert.ok(/CHANGED \(1\).*Cloudflare/.test(text) && !/REMOVED/.test(text), text);

    // Copy as Markdown
    await page.$eval('.notification-confirm .notification-btn-confirm', el => el.click());
    const md = await until(() => page.evaluate(() => globalThis.__copied[0]), 5000, 'the copied Markdown');
    assert.ok(md.startsWith('## Compare scans: shop.example\n\nhttps://shop.example/cart\n'), md.slice(0, 100));
    assert.ok(md.includes('### Added\n- DataDome (Anti-bot, 80%)\n- Canvas Fingerprint (Fingerprint, 30%)'), md);
    assert.ok(md.includes('### Changed\n- Cloudflare (Anti-bot): 70% → 95% (+25) · New evidence: Headers'), md);
    assert.ok(!md.includes('### Removed'), md);
    await page.close();
  });

  // ---- Report -------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${pageErrors.join('\n  ')}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  await ctx.close();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
