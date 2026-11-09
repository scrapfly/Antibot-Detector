#!/usr/bin/env node
/**
 * The 3.0.3 features end to end, in the real extension (unpacked in Chromium):
 *
 *   Toolbar title     the icon's hover text names what a scanned page has, a skipped site and the off switch say so
 *   Copy menu         Detection tab → Copy: summary, Markdown table, JSON; no cookie values; Escape closes it
 *   Rescan shortcut   Settings → General names the keys; the worker's rescan clears the result and reloads the page
 *   Notifications     a change notification opens its page; popup.html?settings=history opens Settings → History
 *   History           … → Open page and Scan again now; Copy entry without values; Markdown in the export dialog
 *   Duplicate rule    a card's … → Duplicate opens the editor on "<name> (copy)"; Save adds it, the original stays
 *   Statistics        Export → Markdown downloads a report
 *
 * A local site shows one marker per protection and a probe detector recognizes it, so the scans are real.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:quickwins
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
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- Local site ---------------------------------------------------------------------------------
const MARKER = 'quickwin-marker-bot';
const loads = {}; // page name -> how many times the server sent it
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/p') {
    const name = url.searchParams.get('n') || 'page';
    loads[name] = (loads[name] || 0) + 1;
    const marked = url.searchParams.get('m') !== '0';
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store', 'set-cookie': `qw_session=SECRETCOOKIE${name}; Path=/` });
    return res.end(`<!doctype html><html><head><title>Quick ${name}</title></head><body>${marked ? `<p>${MARKER}</p>` : ''}<p>probe page</p>${url.searchParams.get('dom') === '1' ? '<span class="qw-promo" data-qw="1">promo</span>' : ''}</body></html>`);
  }
  res.writeHead(404); res.end();
});

const PROBE = {
  id: 'detect-qwprobe', name: 'QuickWin Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium',
  version: '1.0.0', lastUpdated: '2026-10-21', icon: 'custom.png', description: 'Quick wins probe',
  detection: {
    content: [{ id: 'qw-marker', text: MARKER, confidence: 90, standalone: true, description: 'marker' }],
    cookies: [{ id: 'qw-cookie', name: 'qw_session', confidence: 60, description: 'session cookie' }]
  }
};

// ---- Harness ------------------------------------------------------------------------------------
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

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-quickwins-'));
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
    const ready = await sw.evaluate(() => globalThis.__e2e === true).catch(() => false);
    if (!ready) {
      await sw.evaluate(() => {
        globalThis.__e2e = true;
        globalThis.__notes = [];
        chrome.notifications.create = (id, options, cb) => { __notes.push({ id, ...options }); if (typeof cb === 'function') cb(id); return Promise.resolve(id); };
      });
    }
    return sw.evaluate(fn, arg);
  }
  const items = async () => JSON.parse((await W(() => chrome.storage.local.get('scrapfly_history'))).scrapfly_history || '{"items":[]}').items;
  const patchSettings = (patch) => W((p) => SettingsStore.mutate({ operation: 'patch', patch: p }).then(r => r.success === true), patch);
  async function openExtensionPage(file = 'popup.html') {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${file}: ${e.message}`));
    await page.goto(`chrome-extension://${extId}/${file}`);
    if (file.startsWith('popup.html')) {
      await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { polling: 250, timeout: 30000 });
    }
    return page;
  }
  async function open(url) {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'commit' }).catch(() => {});
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    return page;
  }
  async function until(check, ms = 20000, what = 'condition') {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(400);
    }
  }
  /** The tab id Chrome gives a page (looked up by its address). */
  const tabIdOf = (url) => W(async (u) => (await chrome.tabs.query({})).find(t => t.url === u)?.id, url);
  const titleOf = (tabId) => W((id) => chrome.action.getTitle({ tabId: id }), tabId);
  /** When the page's saved scan result was stored; a fresh scan changes it, a cache hit keeps it. 0 when there is none. */
  const cacheStamp = (url) => W(async (u) => {
    let storage = (await chrome.storage.local.get(DetectionEngineManager.STORAGE_KEY))[DetectionEngineManager.STORAGE_KEY] || {};
    if (typeof storage === 'string') storage = JSON.parse(storage);
    const entry = storage[UrlUtils.hashUrl(u, 'full')];
    return (entry && entry.timestamp) || 0;
  }, url);
  let counter = 0;
  const uniq = () => `${Date.now().toString(36)}${counter++}`;

  // ---- Start-up: the probe detector, English, the full address as cache key -----------------------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  const admin = await openExtensionPage();
  await admin.evaluate(async (probe) => {
    await window.popupInstance.detectorManager.addDetector('antibot', probe.id, probe);
    await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
  }, PROBE);
  await admin.close();
  await sleep(1500);
  await patchSettings({ detection: { cacheScope: 'full' }, history: { historyEnabled: true, historyBypassCache: true } });
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

  /** Visit a page and wait until History has its entry; the page stays open. */
  async function scanned(name, query = '') {
    const url = `${origin}/p?n=${name}${query}`;
    const page = await open(url);
    await until(async () => (await items()).some(i => i.url === url), 25000, `the History entry of ${url}`);
    return { page, url };
  }

  // ===============================================================================================
  await scenario('toolbar title: a scanned page names its protection, a skipped site and the off switch say so', async () => {
    const { page, url } = await scanned(`title-${uniq()}`);
    const tabId = await tabIdOf(url);
    const title = await until(async () => { const t = await titleOf(tabId); return /QuickWin Probe \d+%/.test(t) ? t : null; }, 15000, 'the hover text');
    assert.match(title, /^Scrapfly: QuickWin Probe \d+%$/);
    await page.close();

    const host = '127.0.0.1';
    assert.ok(await patchSettings({ detection: { blacklistedDomains: [host] } }), 'the site is skipped');
    try {
      assert.equal(await W((u) => Utils.isUrlBlacklisted(u), `${origin}/p`), true);
      const p2 = await open(`${origin}/p?n=skip-${uniq()}`);
      const id2 = await tabIdOf(p2.url());
      await until(async () => (await titleOf(id2)) === 'Scrapfly: This site is not scanned', 15000, 'the skipped text');
      await p2.close();
    } finally {
      assert.ok(await patchSettings({ detection: { blacklistedDomains: [] } }));
    }

    await W(() => chrome.storage.local.set({ scrapfly_enabled: false }));
    await W(() => { cachedEnabledState = { value: false, timestamp: Date.now() }; });
    try {
      const p3 = await open(`${origin}/p?n=off-${uniq()}`);
      const id3 = await tabIdOf(p3.url());
      await until(async () => (await titleOf(id3)) === 'Scrapfly: Detection is switched off', 15000, 'the off text');
      await p3.close();
    } finally {
      await W(() => chrome.storage.local.set({ scrapfly_enabled: true }));
      await W(() => { cachedEnabledState = { value: true, timestamp: Date.now() }; });
    }
  });

  // ===============================================================================================
  await scenario('toolbar title: a page answered from the saved result has its hover text too', async () => {
    const name = `cached-${uniq()}`;
    const { page, url } = await scanned(name);
    const tabId = await tabIdOf(url);
    const first = await until(() => cacheStamp(url), 10000, 'the saved result');
    await until(async () => /QuickWin Probe \d+%/.test(await titleOf(tabId)), 15000, 'the hover text after the scan');
    // Navigating to the page again: Chrome drops the tab's title, the saved result answers, the title comes back
    const loadsBefore = loads[name];
    await page.goto(`${origin}/p?n=${name}`, { waitUntil: 'commit' });
    await until(() => loads[name] > loadsBefore, 10000, 'the second visit');
    await until(async () => /^Scrapfly: QuickWin Probe \d+%$/.test(await titleOf(tabId)), 15000, 'the hover text of a cached page');
    assert.equal(await cacheStamp(url), first, 'the second visit was a cache hit');
    await page.close();
  });

  // ===============================================================================================
  await scenario('Detection copy menu: summary, Markdown and JSON without a cookie value, curl and Python with the browser headers; Escape closes it', async () => {
    const page = await openExtensionPage();
    await page.$eval('.tab-btn[data-tab="detection"]', el => el.click());
    await page.waitForSelector('#copyOverviewBtn', { state: 'attached', timeout: 15000 });
    const probeResults = [{ detector: { name: 'QuickWin Probe' }, category: 'Anti-Bot', confidence: 90,
      matches: [{ type: 'cookie', value: 'qw_session=SECRETCOOKIE' }, { type: 'content', value: 'quickwin-marker-bot' }] }];
    await page.evaluate(() => {
      globalThis.__copied = [];
      FormatUtils.copyToClipboard = async (text) => { globalThis.__copied.push(text); return true; };
      DetectionActions.currentPageUrl = async () => 'https://shop.example/cart?session=SECRETURL';
    });
    const menuShown = () => page.$eval('#copyOverviewMenu', el => !el.hidden);
    for (const format of ['overview', 'markdown', 'json', 'curl', 'python']) {
      const before = await page.evaluate(() => globalThis.__copied.length);
      await page.$eval('#copyOverviewBtn', el => el.click());
      assert.equal(await menuShown(), true, 'the menu opens');
      assert.equal(await page.$eval('#copyOverviewBtn', el => el.getAttribute('aria-expanded')), 'true');
      // The popup also scans its own tab and shows an empty state when that ends, which clears the results:
      // put them back in the same turn as the click, so no late answer can land in between
      await page.evaluate(({ format, results }) => {
        window.popupInstance.detection.currentResults = results;
        document.querySelector(`#copyOverviewMenu [data-copy-format="${format}"]`).click();
      }, { format, results: probeResults });
      await until(async () => (await page.evaluate(() => globalThis.__copied.length)) > before && !(await menuShown()), 5000, `the ${format} copy`);
    }
    const copied = await page.evaluate(() => globalThis.__copied);
    assert.equal(copied.length, 5);
    // The replay kit: this browser's own User-Agent and the page address, as a curl command and a Python script
    const ua = await page.evaluate(() => navigator.userAgent);
    assert.ok(copied[3].includes("curl -g 'https://shop.example/cart?session=SECRETURL'") && copied[3].includes(`-H 'User-Agent: ${ua}'`), copied[3]);
    assert.ok(copied[3].includes('# Detected: QuickWin Probe') && copied[3].includes('TLS/HTTP2 fingerprint'), copied[3]);
    assert.ok(copied[4].includes('import requests') && copied[4].includes('requests.get(url, headers=headers'), copied[4]);
    copied.splice(3);
    assert.ok(copied[0].startsWith('====='), 'summary first line');
    assert.ok(copied[1].startsWith('## Protections on shop.example'), copied[1]);
    assert.ok(copied[1].includes('| QuickWin Probe | Anti-Bot | 90% | cookie, content |'), copied[1]);
    assert.equal(JSON.parse(copied[2]).detections[0].name, 'QuickWin Probe');
    for (const text of copied) assert.ok(!/SECRET/.test(text), 'a value or the query string was copied');
    await page.$eval('#copyOverviewBtn', el => el.click());
    await page.keyboard.press('Escape');
    assert.equal(await menuShown(), false, 'Escape closes the menu');
    const labels = await page.$$eval('#copyOverviewMenu [data-copy-format]', els => els.map(el => el.textContent.trim()));
    assert.deepEqual(labels, ['Summary (as uploaded)', 'Markdown table', 'One line', 'JSON', 'curl command', 'Python (requests)', 'Node.js (fetch)']);
    await page.close();
  });

  // ===============================================================================================
  // ===============================================================================================
  await scenario('Detection details: the methods are listed, each row folded to its type and score until it is clicked; the value copies', async () => {
    const page = await openExtensionPage();
    await page.$eval('.tab-btn[data-tab="detection"]', el => el.click());
    await page.waitForSelector('#copyOverviewBtn', { state: 'attached', timeout: 15000 });
    // The popup also scans its own tab and clears the results when that ends: set them and open in the same turn
    await page.evaluate(() => {
      globalThis.__copied = [];
      FormatUtils.copyToClipboard = async (text) => { globalThis.__copied.push(text); return true; };
      window.popupInstance.detection.currentResults = [{ detector: { name: 'QuickWin Probe' }, category: 'Anti-Bot', confidence: 90,
        matches: [{ type: 'content', pattern: 'quickwin-marker-bot', value: 'quickwin-marker-bot', confidence: 20 }, { type: 'cookie', pattern: 'qw_session', value: 'qw_session=x', confidence: 100 }] }];
      window.popupInstance.detection.openDetectionModal(0);
    });
    await page.waitForSelector('#detectionModalMethods .method-item-card', { state: 'visible' });
    const rows = () => page.$$eval('#detectionModalMethods .method-item-card', cards => cards.map(card => ({
      head: card.querySelector('.method-fold-head').offsetParent !== null,
      score: !!card.querySelector('.method-fold-head .method-confidence'),
      value: card.querySelector('.method-value-btn').offsetParent !== null,
      expanded: card.querySelector('.method-fold-head').getAttribute('aria-expanded')
    })));
    assert.equal(await page.$eval('#detectionModalMethods', el => el.offsetParent !== null), true, 'the section itself is shown');
    assert.deepEqual(await rows(), [{ head: true, score: true, value: false, expanded: 'false' }, { head: true, score: true, value: false, expanded: 'false' }], 'every row is folded');
    await page.$$eval('#detectionModalMethods .method-fold-head', heads => heads[0].click());
    assert.deepEqual((await rows()).map(r => [r.value, r.expanded]), [[true, 'true'], [false, 'false']], 'a click on a head shows that row only');
    await page.$eval('#detectionModalMethods .copyable-value', el => el.click());
    await until(async () => (await page.evaluate(() => globalThis.__copied)).includes('quickwin-marker-bot'), 5000, 'the value copy');
    assert.equal((await rows())[0].value, true, 'copying leaves the row open');
    await page.focus('#detectionModalMethods .method-fold-head');
    await page.keyboard.press('Enter');
    assert.deepEqual((await rows()).map(r => r.value), [false, false], 'Enter on the head folds it again');
    await page.keyboard.press(' ');
    assert.equal((await rows())[0].value, true, 'and Space shows it');
    await page.$eval('#closeDetectionModal', el => el.click());
    await page.evaluate(() => window.popupInstance.detection.openDetectionModal(0));
    await page.waitForSelector('#detectionModalMethods .method-item-card', { state: 'visible' });
    assert.deepEqual((await rows()).map(r => r.value), [false, false], 'folded again on the next open');
    await page.close();
  });

  await scenario('rescan shortcut: Settings names the keys, and the command clears the result and reloads the page', async () => {
    const commands = await W(() => chrome.commands.getAll());
    const rescan = commands.find(c => c.name === 'rescan-tab');
    assert.ok(rescan, 'the command is registered');
    const page = await openExtensionPage();
    await page.$eval('#settingsBtn', el => el.click());
    await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 250 });
    const line = await until(() => page.$eval('#settingsShortcutRescan', el => el.textContent.trim()).then(t => (t.startsWith('Scan this page again: ') ? t : null)), 5000, 'the shortcut line');
    assert.equal(line, `Scan this page again: ${rescan.shortcut || 'not set'}`);
    await page.close();

    const name = `rescan-${uniq()}`;
    const { page: site, url } = await scanned(name);
    const tabId = await tabIdOf(url);
    const first = await until(() => cacheStamp(url), 10000, 'the saved result');
    // Control: a plain reload is answered from the saved result, which keeps its time
    let loadsBefore = loads[name];
    await site.reload({ waitUntil: 'commit' });
    await until(() => loads[name] > loadsBefore, 10000, 'the plain reload');
    await sleep(2500);
    assert.equal(await cacheStamp(url), first, 'a plain reload must be a cache hit (the control)');
    // The shortcut: the saved result is cleared and the page is scanned from the start
    loadsBefore = loads[name];
    const outcome = await W(async (id) => Commands.rescan(await chrome.tabs.get(id)), tabId);
    assert.equal(outcome, 'reloaded');
    await until(() => loads[name] > loadsBefore, 10000, 'the reload');
    const second = await until(async () => { const t = await cacheStamp(url); return t > first ? t : 0; }, 25000, 'a new saved result');
    assert.ok(second > first, 'the rescan produced a fresh scan');
    await until(async () => /QuickWin Probe \d+%/.test(await titleOf(tabId)), 15000, 'the hover text of the new scan');
    assert.equal(await W(async (id) => Commands.rescan({ id, url: 'chrome://settings' }), tabId), 'unsupported');
    await site.close();
  });

  // ===============================================================================================
  await scenario('notifications: a change notification opens its page; ?settings=history opens Settings → History', async () => {
    const target = `${origin}/p?n=note-${uniq()}&m=0`;
    await W(() => { globalThis.__notes = []; });
    await W((u) => HistoryRecorder.notifyChange({ hostname: '127.0.0.1', url: u, added: ['QuickWin Probe'], removed: [] }, chrome), target);
    const note = await until(async () => (await W(() => globalThis.__notes))[0], 5000, 'the notification');
    assert.match(note.id, /^scrapfly-history-change-/);
    assert.equal(note.title, 'Protections changed on 127.0.0.1');
    const opened = new Promise(r => ctx.once('page', r));
    await W((id) => NotificationClicks.handleClick(id), note.id);
    const page = await opened;
    await page.waitForURL(target, { timeout: 10000 });
    await page.close();

    const settings = await openExtensionPage('popup.html?settings=history');
    await settings.waitForFunction(() => document.querySelector('#settingsModal')?.classList.contains('is-open'), null, { polling: 250, timeout: 10000 });
    const active = await settings.$eval('.settings-tab-btn.active', el => el.dataset.settingsTab);
    assert.equal(active, 'history');
    await settings.close();
  });

  // ===============================================================================================
  await scenario('History: Open page, Scan again now, Copy entry without values, Copy as Markdown, Markdown in the export dialog', async () => {
    const name = `hist-${uniq()}`;
    const { page: site, url } = await scanned(name);
    await site.close();
    const page = await openExtensionPage();
    await page.evaluate(() => {
      globalThis.__copied = [];
      FormatUtils.copyToClipboard = async (text) => { globalThis.__copied.push(text); return true; };
    });
    await page.$eval('#nav-history', el => el.click());
    await page.waitForSelector('.history-item');
    const menu = async (action) => {
      await page.$$eval('.history-item .history-more-btn', els => els[0].click());
      await page.waitForSelector('#historyItemMenu:not([hidden])');
      await page.$eval(`#historyItemMenu [data-action="${action}"]`, el => el.click());
    };
    // Open page
    let next = new Promise(r => ctx.once('page', r));
    await menu('open');
    let tab = await next;
    await tab.waitForURL(url, { timeout: 10000 });
    await sleep(1500);
    // Scan again now: the open tab is reloaded and the page is scanned from the start (a fresh saved result)
    const stampBefore = await cacheStamp(url);
    assert.ok(stampBefore > 0, 'the page has a saved result');
    const before = loads[name];
    await page.bringToFront();
    await menu('rescan');
    await until(() => loads[name] > before, 10000, 'the page sent again');
    await until(async () => (await cacheStamp(url)) > stampBefore, 25000, 'a fresh scan after Scan again now');
    await tab.close();
    // Scan again now with no tab showing it: a new tab opens
    next = new Promise(r => ctx.once('page', r));
    await page.bringToFront();
    await menu('rescan');
    tab = await next;
    await tab.waitForURL(url, { timeout: 10000 });
    await tab.close();
    // Copy entry: the cookie's name, not its value
    await page.bringToFront();
    await menu('copy');
    const text = await until(() => page.evaluate(() => globalThis.__copied[0]), 5000, 'the copied entry');
    assert.ok(text.includes('QuickWin Probe'), text);
    assert.ok(!text.includes('SECRETCOOKIE'), 'Copy entry copied a cookie value');
    // Copy as Markdown: the heading and one table row, the protections by name, no cookie value and no query
    await menu('copy-markdown');
    const markdown = await until(() => page.evaluate(() => globalThis.__copied[1]), 5000, 'the Markdown copy');
    assert.ok(markdown.startsWith('# Scrapfly Antibot Detector: History\n\n| Page | Address |'), markdown);
    assert.ok(markdown.includes('QuickWin Probe'), markdown);
    assert.ok(!markdown.includes('SECRETCOOKIE'), 'Copy as Markdown copied a cookie value');
    assert.ok(!markdown.includes('/p?n='), 'and the address has no query');
    // The export dialog offers Markdown
    await page.$eval('#historyMenuBtn', el => el.click()).catch(() => {});
    const formats = await page.evaluate(() => HistoryExport.FORMATS.slice());
    assert.ok(formats.includes('md'));
    const md = await page.evaluate(() => HistoryExport.build([{ url: 'https://a.example/', title: 'A', detections: [] }], { format: 'md' }).text);
    assert.ok(md.startsWith('# Scrapfly Antibot Detector: History'));
    await page.close();
  });

  // ===============================================================================================
  await scenario('Rules "…" menu by keyboard: the focus goes into the menu, arrows move, Escape and Tab come back to the button', async () => {
    const page = await openExtensionPage();
    try {
      await page.$eval('.tab-btn[data-tab="rules"]', el => el.click());
      await page.waitForSelector('#rulesSearch', { state: 'visible' });
      await page.fill('#rulesSearch', 'QuickWin');
      const card = `.detector-card[data-detector-id="${PROBE.id}"]`;
      await page.waitForSelector(card, { state: 'attached', timeout: 15000 });
      const trigger = `${card} .rules-menu-trigger`;
      const active = () => page.evaluate(() => { const el = document.activeElement; return el ? { cls: el.className, text: (el.textContent || '').trim(), inMenu: !!el.closest('.rules-menu-list') } : null; });
      await page.$eval(trigger, el => el.focus());
      await page.keyboard.press('Enter');
      await page.waitForSelector(`${card} .rules-menu.open`);
      const first = await active();
      assert.equal(first.inMenu, true, 'the focus went into the menu: ' + JSON.stringify(first));
      assert.ok(/rules-menu-item/.test(first.cls), first.cls);
      await page.keyboard.press('ArrowDown');
      const second = await active();
      assert.equal(second.inMenu, true);
      assert.notEqual(second.text, first.text, 'ArrowDown moved to the next entry');
      await page.keyboard.press('Home');
      assert.equal((await active()).text, first.text, 'Home is the first entry');
      await page.keyboard.press('End');
      assert.notEqual((await active()).text, first.text, 'End is the last entry');
      await page.keyboard.press('Escape');
      await page.waitForSelector(`${card} .rules-menu.open`, { state: 'detached' });
      assert.ok(/rules-menu-trigger/.test((await active()).cls), 'Escape put the focus back on the "…" button');
      assert.equal(await page.$eval(trigger, el => el.getAttribute('aria-expanded')), 'false');
      // Tab leaves the menu: it closes and the focus is not left on something that went away
      await page.keyboard.press('Enter');
      await page.waitForSelector(`${card} .rules-menu.open`);
      await page.keyboard.press('Tab');
      await page.waitForSelector(`${card} .rules-menu.open`, { state: 'detached' });
      assert.equal((await active()).inMenu, false, 'the focus is outside the closed menu');
    } finally { await page.close(); }
  });

  // ===============================================================================================
  await scenario('Duplicate rule: the editor opens on "<name> (copy)", Save adds it, the original stays', async () => {
    const page = await openExtensionPage();
    await page.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await page.waitForSelector('#rulesSearch', { state: 'visible' });
    await page.fill('#rulesSearch', 'QuickWin');
    const card = `.detector-card[data-detector-id="${PROBE.id}"]`;
    await page.waitForSelector(card, { state: 'attached', timeout: 15000 });
    await page.$eval(`${card} .duplicate-detector-btn`, el => el.click());
    await page.waitForSelector('#saveRuleEdit', { state: 'visible' });
    assert.equal(await page.$eval('#detectorNameInput', el => el.value), 'QuickWin Probe (copy)');
    await page.$eval('#saveRuleEdit', el => el.click());
    const rules = await until(() => page.evaluate(() => {
      const all = window.popupInstance.detectorManager.detectors.antibot || {};
      const copies = Object.values(all).filter(d => d.name === 'QuickWin Probe (copy)');
      return copies.length ? { copies, original: all['detect-qwprobe'] } : null;
    }), 10000, 'the saved copy');
    assert.equal(rules.copies.length, 1);
    assert.notEqual(rules.copies[0].id, PROBE.id);
    assert.deepEqual(Object.keys(rules.copies[0].detection).sort(), ['content', 'cookies']);
    assert.equal(rules.original.name, 'QuickWin Probe');
    await page.close();
  });

  // ===============================================================================================
  await scenario('Duplicate rule: the copy of a shipped rule keeps what the editor does not show (a payload rule that reads the response)', async () => {
    const page = await openExtensionPage();
    await page.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await page.waitForSelector('#rulesSearch', { state: 'visible' });
    await page.fill('#rulesSearch', 'Turnstile');
    const card = '.detector-card[data-detector-id="detect-turnstile"]';
    await page.waitForSelector(card, { state: 'attached', timeout: 15000 });
    await page.$eval(`${card} .duplicate-detector-btn`, el => el.click());
    await page.waitForSelector('#saveRuleEdit', { state: 'visible' });
    await page.$eval('#saveRuleEdit', el => el.click());
    const found = await until(() => page.evaluate(() => {
      const all = window.popupInstance.detectorManager.detectors.captcha || {};
      const copy = Object.values(all).find(d => /\(copy\)$/.test(d.name || '') && /turnstile/i.test(d.name));
      return copy ? { payload: copy.detection.payload || [], original: all['detect-turnstile'].detection.payload || [] } : null;
    }), 10000, 'the saved copy of Turnstile');
    assert.ok(found.original.some(rule => rule.body === 'response'), 'the shipped rule reads a response body');
    assert.deepEqual(found.payload.map(rule => [rule.id, rule.body]), found.original.map(rule => [rule.id, rule.body]), 'every payload rule keeps its body setting');
    await page.close();
  });

  // ===============================================================================================
  await scenario('a DOM rule added after a page loaded matches that page on a manual scan, without reloading it', async () => {
    const { page, url } = await scanned(`late-rule-${uniq()}`, '&dom=1');
    const tabId = await tabIdOf(url);
    const admin = await openExtensionPage();
    await admin.evaluate(async (rule) => {
      await window.popupInstance.detectorManager.addDetector('antibot', rule.id, rule);
      await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
    }, {
      id: 'detect-qwdom', name: 'QuickWin DOM Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium',
      version: '1.0.0', lastUpdated: '2026-11-04', icon: 'custom.png', description: 'A rule saved after the page loaded',
      detection: { dom: [{ id: 'qw-dom', selector: 'span.qw-promo[data-qw]', confidence: 90, standalone: true, description: 'promo span' }] }
    });
    try {
      assert.ok(!/QuickWin DOM Probe/.test(await titleOf(tabId)), 'the page was scanned before the rule existed');
      // What the popup's Refresh sends; the tab is not reloaded
      await admin.evaluate((id) => new Promise(r => chrome.runtime.sendMessage({ type: 'REQUEST_DETECTION', tabId: id }, () => r())), tabId);
      const title = await until(async () => { const t = await titleOf(tabId); return /QuickWin DOM Probe/.test(t) ? t : null; }, 20000, 'the new rule on the hover text');
      assert.match(title, /QuickWin DOM Probe/);
    } finally {
      await admin.evaluate(async () => { await window.popupInstance.detectorManager.deleteDetector?.('antibot', 'detect-qwdom'); });
      await admin.close();
      await page.close();
    }
  });

  // ===============================================================================================
  await scenario('Settings tabs: a tab list, the open tab is selected and in the Tab order, arrows and Home/End move and open', async () => {
    const page = await openExtensionPage();
    await page.$eval('#settingsBtn', el => el.click());
    await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 250 });
    const state = () => page.evaluate(() => ({
      list: document.querySelector('.settings-tabs').getAttribute('role'),
      tabs: [...document.querySelectorAll('.settings-tab-btn')].map(b => [b.dataset.settingsTab, b.getAttribute('role'), b.getAttribute('aria-selected'), b.tabIndex]),
      shown: [...document.querySelectorAll('.settings-tab-content')].filter(p => p.classList.contains('active')).map(p => p.id),
      focused: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.settingsTab : null
    }));
    let now = await state();
    assert.equal(now.list, 'tablist');
    assert.deepEqual(now.tabs, [['general', 'tab', 'true', 0], ['detection', 'tab', 'false', -1], ['history', 'tab', 'false', -1], ['data', 'tab', 'false', -1]]);
    await page.focus('.settings-tab-btn[data-settings-tab="general"]');
    await page.keyboard.press('ArrowRight');
    now = await state();
    assert.equal(now.focused, 'detection');
    assert.deepEqual(now.tabs.map(t => t[2]), ['false', 'true', 'false', 'false']);
    assert.deepEqual(now.shown, ['settingsPanel-detection']);
    await page.keyboard.press('End');
    assert.equal((await state()).focused, 'data');
    await page.keyboard.press('ArrowRight');
    now = await state();
    assert.equal(now.focused, 'general', 'it wraps around');
    assert.deepEqual(now.shown, ['settingsPanel-general']);
    await page.keyboard.press('ArrowLeft');
    assert.equal((await state()).focused, 'data');
    await page.keyboard.press('Home');
    now = await state();
    assert.equal(now.focused, 'general');
    assert.deepEqual(now.tabs.map(t => t[3]), [0, -1, -1, -1]);
    await page.close();
  });

  // ===============================================================================================
  await scenario('Rules dialogs keep keyboard focus: Tab wraps inside the editor and the icon picker above it, closing returns to the opener', async () => {
    const page = await openExtensionPage();
    await page.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await page.waitForSelector('#rulesSearch', { state: 'visible' });
    await page.fill('#rulesSearch', 'QuickWin');
    const card = `.detector-card[data-detector-id="${PROBE.id}"]`;
    await page.waitForSelector(card, { state: 'attached', timeout: 15000 });
    await page.focus(`${card} .edit-btn`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#editRuleModal .rule-modal-content', { state: 'visible' });
    const where = (dialog) => page.evaluate((selector) => {
      const root = document.querySelector(selector);
      const items = [...root.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.hidden && el.getClientRects().length > 0);
      return { inside: root.contains(document.activeElement), first: document.activeElement === items[0], last: document.activeElement === items[items.length - 1], count: items.length };
    }, dialog);
    // The focus starts inside the dialog
    await until(async () => (await where('#editRuleModal .rule-modal-content')).inside, 5000, 'the focus inside the editor');
    let now = await where('#editRuleModal .rule-modal-content');
    assert.ok(now.count > 5, `the editor has controls (${now.count})`);
    // Shift+Tab from the first control goes to the last one, and Tab from the last to the first
    assert.ok(now.first, 'it starts on the first control');
    await page.keyboard.press('Shift+Tab');
    now = await where('#editRuleModal .rule-modal-content');
    assert.ok(now.inside && now.last, 'Shift+Tab from the first lands on the last, inside the editor');
    await page.keyboard.press('Tab');
    now = await where('#editRuleModal .rule-modal-content');
    assert.ok(now.inside && now.first, 'Tab from the last lands on the first');
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    assert.ok((await where('#editRuleModal .rule-modal-content')).inside, 'twelve Tabs later it is still inside');

    // A dialog above it takes the focus, and giving it up returns to the button that opened it
    await page.focus('#openIconPickerBtn');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.icon-picker-modal .rule-modal-content', { state: 'visible' });
    await until(async () => (await where('.icon-picker-modal .rule-modal-content')).inside, 5000, 'the focus inside the icon picker');
    for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
    assert.ok((await where('.icon-picker-modal .rule-modal-content')).inside, 'forty Tabs later it is still inside the icon picker');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.icon-picker-modal', { state: 'detached' });
    await until(async () => page.evaluate(() => document.activeElement && document.activeElement.id === 'openIconPickerBtn'), 5000, 'the focus back on the icon button');
    assert.ok((await where('#editRuleModal .rule-modal-content')).inside, 'back in the editor');

    // Closing the editor returns the focus to the card's edit button
    await page.$eval('#cancelRuleEdit', el => el.click());
    await page.waitForSelector('#editRuleModal', { state: 'hidden' });
    await until(async () => page.evaluate((id) => document.activeElement && document.activeElement.classList.contains('edit-btn') && document.activeElement.dataset.detectorId === id, PROBE.id), 5000, 'the focus back on the edit button');
    await page.close();
  });

  // ===============================================================================================
  await scenario('Detection details: a combination lists its signals as folded rows like the Detection methods; a click shows the value', async () => {
    const page = await openExtensionPage();
    // The Navigator fingerprint's "browser profile": language preferences together with the user agent or the platform
    const shown = await page.evaluate(async () => {
      const manager = window.popupInstance.detectorManager;
      const def = Object.values(manager.getAllDetectors().fingerprint || {}).find(d => d.id === 'detect-navigator-fingerprint');
      if (!def) return { error: 'no detect-navigator-fingerprint' };
      const hook = (id) => { const rule = def.detection.js_hooks.find(r => r.id === id); return { type: 'js_hooks', patternId: id, pattern: rule.target, value: rule.target, confidence: rule.confidence, description: rule.description }; };
      const scored = DetectionCombinations.score(def, [hook('navigator-languages'), hook('navigator-agent'), hook('navigator-platform')]);
      const detection = { detector: { id: def.id, name: def.name, icon: def.icon, difficulty: 'Low', category: 'fingerprint' }, name: def.name, category: 'fingerprint',
        confidence: scored.confidence, difficulty: 'Low', matches: scored.matches, combinations: scored.combinations };
      await window.popupInstance.detection.displayResults([detection], { url: 'https://shop.example.test/', cacheMetadata: { scope: 'domain', expiry: Date.now() + 86400000, timestamp: Date.now() } });
      return { combos: scored.combinations.map(c => c.id) };
    });
    assert.ok(!shown.error, shown.error);
    assert.ok(shown.combos.includes('navigator-browser-profile'), JSON.stringify(shown));
    await page.$eval('.detection-card', el => el.click());
    await page.waitForSelector('#detectionModalCombinations .match-combo[data-combo-id="navigator-browser-profile"]', { state: 'visible' });
    const card = '#detectionModalCombinations .match-combo[data-combo-id="navigator-browser-profile"]';
    await page.$eval(`${card} .match-combo-toggle`, el => el.click());
    await page.waitForSelector(`${card} .method-item-card`, { state: 'visible' });
    const rows = () => page.$$eval(`${card} .method-item-card`, list => list.map(row => ({
      folded: row.classList.contains('is-folded'), expanded: row.querySelector('.method-fold-head').getAttribute('aria-expanded'),
      type: row.querySelector('.method-type-badge').textContent.trim(), score: (row.querySelector('.method-confidence') || {}).textContent.trim(),
      value: row.querySelector('.method-value-btn').textContent.trim(), valueShown: getComputedStyle(row.querySelector('.method-value-btn')).display !== 'none',
      note: (row.querySelector('.method-value-note') || {}).textContent || ''
    })));
    let list = await rows();
    assert.equal(list.length, 3, 'the language preferences, the user agent and the platform');
    assert.ok(list.every(row => row.folded && row.expanded === 'false' && !row.valueShown), 'every row starts folded');
    assert.ok(list.every(row => row.type === 'JavaScript hooks' && /^\d+%$/.test(row.score)), JSON.stringify(list));
    assert.deepEqual(list.map(row => row.value).sort(), ['Navigator.prototype.languages', 'Navigator.prototype.platform', 'Navigator.prototype.userAgent']);
    assert.ok(list.some(row => row.note === 'Reads browser user agent string'), 'what a signal means stays under its value');
    assert.equal(await page.$(`${card} .match-combo-lead, ${card} .match-combo-rows`), null, 'no checklist');
    // A click on the row's head shows the value in the code box; a second click folds it again
    await page.$eval(`${card} .method-item-card .method-fold-head`, el => el.click());
    list = await rows();
    assert.ok(!list[0].folded && list[0].expanded === 'true' && list[0].valueShown, 'the first row is open');
    assert.ok(list.slice(1).every(row => row.folded), 'the others stay folded');
    if (process.env.QW_SHOTS) { await sleep(700); await page.screenshot({ path: `${process.env.QW_SHOTS}/combination-rows.png` }); }
    await page.$eval(`${card} .method-item-card .method-fold-head`, el => el.click());
    assert.ok((await rows())[0].folded, 'folded again');
    await page.close();
  });

  // ===============================================================================================
  await scenario('History details: a saved combination lists its signals as folded rows too', async () => {
    const page = await openExtensionPage();
    await page.$eval('.tab-btn[data-tab="history"]', el => el.click());
    await page.waitForSelector('#historyDetailModal', { state: 'attached', timeout: 15000 });
    const opened = await page.evaluate(async () => {
      const manager = window.popupInstance.detectorManager;
      const def = Object.values(manager.getAllDetectors().fingerprint || {}).find(d => d.id === 'detect-navigator-fingerprint');
      const hook = (id) => { const rule = def.detection.js_hooks.find(r => r.id === id); return { type: 'js_hooks', patternId: id, pattern: rule.target, value: rule.target, confidence: rule.confidence, description: rule.description }; };
      const scored = DetectionCombinations.score(def, [hook('navigator-languages'), hook('navigator-agent'), hook('navigator-platform')]);
      // What the worker stores after a scan: the slim entry
      const entry = HistoryStore.slimEntry({ id: 'qw-combo', url: 'https://shop.example.test/', hostname: 'shop.example.test', title: 'Shop', timestamp: Date.now(), detections: [{
        detector: { id: def.id, name: def.name }, name: def.name, category: 'fingerprint', confidence: scored.confidence, combinations: scored.combinations, matches: scored.matches }] });
      window.popupInstance.history.showHistoryItemDetails(entry);
      return scored.combinations.map(c => c.id);
    });
    assert.ok(opened.includes('navigator-browser-profile'), JSON.stringify(opened));
    const card = '#historyDetailModal .match-combo[data-combo-id="navigator-browser-profile"]';
    await page.waitForSelector('#historyDetailModal .history-modal-detection-header', { state: 'visible' });
    await page.$eval('#historyDetailModal .history-modal-detection-header', el => el.click());
    await page.waitForSelector(card, { state: 'visible' });
    await page.$eval(`${card} .match-combo-toggle`, el => el.click());
    await page.waitForSelector(`${card} .history-modal-method-item`, { state: 'visible' });
    const rows = () => page.$$eval(`${card} .history-modal-method-item`, list => list.map(row => ({
      folded: row.classList.contains('is-folded'), expanded: row.querySelector('.history-modal-method-head').getAttribute('aria-expanded'),
      type: row.querySelector('.history-modal-method-badge').textContent.trim(), score: (row.querySelector('.history-modal-method-confidence') || {}).textContent.trim(),
      value: row.querySelector('.history-modal-method-value').textContent.trim(), valueShown: getComputedStyle(row.querySelector('.history-modal-method-value')).display !== 'none'
    })));
    let list = await rows();
    assert.equal(list.length, 3);
    assert.ok(list.every(row => row.folded && row.expanded === 'false' && !row.valueShown && row.type === 'JavaScript hooks' && /^\d+%$/.test(row.score)), JSON.stringify(list));
    await page.$eval(`${card} .history-modal-method-item .history-modal-method-head`, el => el.click());
    list = await rows();
    assert.ok(!list[0].folded && list[0].valueShown && /^Navigator\.prototype\./.test(list[0].value), JSON.stringify(list[0]));
    assert.ok(list.slice(1).every(row => row.folded), 'the others stay folded');
    if (process.env.QW_SHOTS) await page.screenshot({ path: `${process.env.QW_SHOTS}/combination-rows-history.png` });
    await page.close();
  });

  // ===============================================================================================
  await scenario('History card: the combinations that fired are counted right after the fingerprint total', async () => {
    const page = await openExtensionPage();
    await page.$eval('.tab-btn[data-tab="history"]', el => el.click());
    await page.waitForSelector('#historyList', { state: 'attached', timeout: 15000 });
    const made = await page.evaluate(async () => {
      const def = Object.values(window.popupInstance.detectorManager.getAllDetectors().fingerprint || {}).find(d => d.id === 'detect-navigator-fingerprint');
      const hook = (id) => { const rule = def.detection.js_hooks.find(r => r.id === id); return { type: 'js_hooks', patternId: id, pattern: rule.target, value: rule.target, confidence: rule.confidence, description: rule.description }; };
      const scored = DetectionCombinations.score(def, [hook('navigator-languages'), hook('navigator-agent'), hook('navigator-platform'), hook('navigator-cpu'), hook('navigator-memory')]);
      const entry = HistoryStore.slimEntry({ id: 'qw-card', url: 'https://shop.example.test/', hostname: 'shop.example.test', title: 'Shop', timestamp: Date.now(), detections: [
        { detector: { id: def.id, name: def.name }, name: def.name, category: 'fingerprint', confidence: scored.confidence, combinations: scored.combinations, matches: scored.matches },
        { detector: { id: 'detect-cloudflare', name: 'Cloudflare' }, name: 'Cloudflare', category: 'antibot', confidence: 100, matches: [] }] });
      window.popupInstance.history.renderHistoryPage([entry]);
      return scored.combinations.length;
    });
    assert.ok(made >= 2, `combinations that fired: ${made}`);
    await page.waitForSelector('#historyList .history-item .history-summary', { state: 'visible' });
    const chips = await page.$$eval('#historyList .history-item .history-cat-count', list => list.map(chip => ({ tip: chip.getAttribute('data-tip').split('\n')[0], value: chip.querySelector('.history-cat-value').textContent, zero: chip.classList.contains('is-zero'), svg: !!chip.querySelector('svg') })));
    assert.deepEqual(chips.map(chip => chip.tip.replace(/:.*/, '')), ['Anti-bot', 'Captcha', 'Fingerprint', 'Matched combinations'], JSON.stringify(chips));
    assert.equal(chips[3].value, String(made));
    assert.ok(!chips[3].zero && chips.every(chip => chip.svg));
    if (process.env.QW_SHOTS) await page.screenshot({ path: `${process.env.QW_SHOTS}/history-card-combinations.png`, clip: { x: 0, y: 100, width: 420, height: 160 } });
    await page.close();
  });

  // ===============================================================================================
  await scenario('History filter: the Combinations chip keeps only the pages where a combination fired; Clear filters turns it off', async () => {
    const page = await openExtensionPage();
    await page.$eval('.tab-btn[data-tab="history"]', el => el.click());
    await page.waitForSelector('#historyList', { state: 'attached', timeout: 15000 });
    const made = await page.evaluate(async () => {
      const def = Object.values(window.popupInstance.detectorManager.getAllDetectors().fingerprint || {}).find(d => d.id === 'detect-navigator-fingerprint');
      const hook = (id) => { const rule = def.detection.js_hooks.find(r => r.id === id); return { type: 'js_hooks', patternId: id, pattern: rule.target, value: rule.target, confidence: rule.confidence, description: rule.description }; };
      const scored = DetectionCombinations.score(def, [hook('navigator-languages'), hook('navigator-agent'), hook('navigator-platform'), hook('navigator-cpu'), hook('navigator-memory')]);
      const withCombos = HistoryStore.slimEntry({ id: 'qw-chip-a', url: 'https://combos.example.test/', hostname: 'combos.example.test', title: 'With combinations', timestamp: Date.now(), detections: [
        { detector: { id: def.id, name: def.name }, name: def.name, category: 'fingerprint', confidence: scored.confidence, combinations: scored.combinations, matches: scored.matches }] });
      const plain = HistoryStore.slimEntry({ id: 'qw-chip-b', url: 'https://plain.example.test/', hostname: 'plain.example.test', title: 'Plain', timestamp: Date.now() - 1000, detections: [
        { detector: { id: 'detect-cloudflare', name: 'Cloudflare' }, name: 'Cloudflare', category: 'antibot', confidence: 100, matches: [] }] });
      const history = window.popupInstance.history;
      history.historyItems = [withCombos, plain];
      history.renderHistory();
      return scored.combinations.length;
    });
    assert.ok(made >= 1, `combinations that fired: ${made}`);
    await page.waitForSelector('#historyFilters:not([hidden])', { timeout: 15000 });
    const shown = () => page.$$eval('#historyList .history-item', list => list.map(card => (card.textContent.includes('combos.example.test') ? 'combos' : card.textContent.includes('plain.example.test') ? 'plain' : '?')));
    const chip = '#historyFilters .history-filter-chip[data-filter="combinations"]';
    const pressed = () => page.$eval(chip, el => el.getAttribute('aria-pressed'));
    await page.waitForFunction(() => document.querySelectorAll('#historyList .history-item').length === 2, null, { polling: 250, timeout: 10000 });
    assert.deepEqual(await shown(), ['combos', 'plain']);
    assert.equal(await pressed(), 'false', 'off to start with');
    assert.ok(await page.$eval(`${chip} svg`, el => !!el), 'the chip carries the same icon as the card count');
    assert.match(await page.$eval(chip, el => el.textContent.trim()), /Combinations/);
    assert.deepEqual(await page.$$eval('#historyFilters .history-filter-chip', list => list.map(el => el.dataset.filter)), ['pinned', 'changed', 'antibot', 'captcha', 'fingerprint', 'combinations']);
    await page.$eval(chip, el => el.click());
    await page.waitForFunction(() => document.querySelectorAll('#historyList .history-item').length === 1, null, { polling: 250, timeout: 10000 });
    assert.deepEqual(await shown(), ['combos'], 'only the page where a combination fired');
    assert.equal(await pressed(), 'true');
    if (process.env.QW_SHOTS) await (await page.$('#historyFilters')).screenshot({ path: `${process.env.QW_SHOTS}/history-combinations-chip.png` });
    // With a category that page does not have, nothing is left and the message offers the way back
    await page.$eval('#historyFilters .history-filter-chip[data-filter="captcha"]', el => el.click());
    await page.waitForSelector('#historyNoResults:not([hidden])', { timeout: 10000 });
    await page.$eval('#historyClearFilters', el => el.click());
    await page.waitForFunction(() => document.querySelectorAll('#historyList .history-item').length === 2, null, { polling: 250, timeout: 10000 });
    assert.equal(await pressed(), 'false', 'Clear filters turns the chip off');
    assert.equal(await page.$eval('#historyFilters .history-filter-chip[data-filter="captcha"]', el => el.getAttribute('aria-pressed')), 'false');
    await page.close();
  });

  // ===============================================================================================
  await scenario('Statistics → Export → Markdown downloads a report', async () => {
    const page = await openExtensionPage('sections/stats/stats.html');
    await page.evaluate(() => {
      globalThis.__dl = null;
      chrome.downloads.download = (options, cb) => { globalThis.__dl = options; cb(7); };
    });
    await page.waitForSelector('[data-export="md"]:not([disabled])', { state: 'attached', timeout: 20000 });
    await page.$eval('#statsExportBtn', el => el.click());
    await page.$eval('[data-export="md"]', el => el.click());
    const dl = await until(() => page.evaluate(() => globalThis.__dl), 10000, 'the download');
    assert.match(dl.filename, /^scrapfly-history-statistics-.+\.md$/);
    const text = await page.evaluate(async (u) => (await fetch(u)).text(), dl.url);
    assert.ok(text.startsWith('# Scrapfly Antibot Detector: statistics'), text.slice(0, 80));
    assert.ok(text.includes('QuickWin Probe'));
    assert.equal(await page.$eval('[data-export="md"]', el => el.textContent.trim()), 'Export Markdown');
    await page.close();
  });

  // ---- Report -------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${pageErrors.join('\n  ')}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  await ctx.close();
  server.close();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
