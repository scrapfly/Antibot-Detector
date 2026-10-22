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
    return res.end(`<!doctype html><html><head><title>Quick ${name}</title></head><body>${marked ? `<p>${MARKER}</p>` : ''}<p>probe page</p></body></html>`);
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
      await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { timeout: 30000 });
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
  await scenario('Detection copy menu: summary, Markdown and JSON, never a cookie value; Escape closes it', async () => {
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
    for (const format of ['overview', 'markdown', 'json']) {
      await page.$eval('#copyOverviewBtn', el => el.click());
      assert.equal(await menuShown(), true, 'the menu opens');
      assert.equal(await page.$eval('#copyOverviewBtn', el => el.getAttribute('aria-expanded')), 'true');
      // The popup also scans its own tab and shows an empty state when that ends, which clears the results:
      // put them back in the same turn as the click, so no late answer can land in between
      await page.evaluate(({ format, results }) => {
        window.popupInstance.detection.currentResults = results;
        document.querySelector(`#copyOverviewMenu [data-copy-format="${format}"]`).click();
      }, { format, results: probeResults });
      await until(async () => (await page.evaluate(() => globalThis.__copied.length)) > 0 && !(await menuShown()), 5000, `the ${format} copy`);
    }
    const copied = await page.evaluate(() => globalThis.__copied);
    assert.equal(copied.length, 3);
    assert.ok(copied[0].startsWith('====='), 'summary first line');
    assert.ok(copied[1].startsWith('## Protections on shop.example'), copied[1]);
    assert.ok(copied[1].includes('| QuickWin Probe | Anti-Bot | 90% | cookie, content |'), copied[1]);
    assert.equal(JSON.parse(copied[2]).detections[0].name, 'QuickWin Probe');
    for (const text of copied) assert.ok(!/SECRET/.test(text), 'a value or the query string was copied');
    await page.$eval('#copyOverviewBtn', el => el.click());
    await page.keyboard.press('Escape');
    assert.equal(await menuShown(), false, 'Escape closes the menu');
    const labels = await page.$$eval('#copyOverviewMenu [data-copy-format]', els => els.map(el => el.textContent.trim()));
    assert.deepEqual(labels, ['Summary (as uploaded)', 'Markdown table', 'JSON']);
    await page.close();
  });

  // ===============================================================================================
  await scenario('rescan shortcut: Settings names the keys, and the command clears the result and reloads the page', async () => {
    const commands = await W(() => chrome.commands.getAll());
    const rescan = commands.find(c => c.name === 'rescan-tab');
    assert.ok(rescan, 'the command is registered');
    const page = await openExtensionPage();
    await page.$eval('#settingsBtn', el => el.click());
    await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'));
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
    await settings.waitForFunction(() => document.querySelector('#settingsModal')?.classList.contains('is-open'), null, { timeout: 10000 });
    const active = await settings.$eval('.settings-tab-btn.active', el => el.dataset.settingsTab);
    assert.equal(active, 'history');
    await settings.close();
  });

  // ===============================================================================================
  await scenario('History: Open page, Scan again now, Copy entry without values, Markdown in the export dialog', async () => {
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
    // The export dialog offers Markdown
    await page.$eval('#historyMenuBtn', el => el.click()).catch(() => {});
    const formats = await page.evaluate(() => HistoryExport.FORMATS.slice());
    assert.ok(formats.includes('md'));
    const md = await page.evaluate(() => HistoryExport.build([{ url: 'https://a.example/', title: 'A', detections: [] }], { format: 'md' }).text);
    assert.ok(md.startsWith('# Scrapfly Antibot Detector: History'));
    await page.close();
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
