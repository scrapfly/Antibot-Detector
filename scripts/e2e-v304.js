#!/usr/bin/env node
/**
 * The 3.0.4 features end to end, in the real extension (unpacked in Chromium):
 *
 *   Statistics        a protection's name shows the domains that have it; a site's name opens its History in a new tab,
 *                     already narrowed to that site (popup.html?tab=history&search=...)
 *   Select entries    History → … → Select entries: checkboxes, the bar, Select all, a search that unselects what it hides,
 *                     Pin, Watch, Export (a real file) and Delete (asks first), Done and Escape
 *   Webhook retry     a failed delivery is held in memory (storage.session) and logged with an id; Recent deliveries shows
 *                     Retry on it and it delivers; the alarm retries by itself; the switch turns holding off
 *   Test on this page Rules → editor → Test on this page: an unsaved rule runs against the real page (a cookie, a DOM selector no
 *                     saved rule uses, script content, a request URL); header and window patterns say "needs a real scan"
 *   Folding cards     Rules → editor: Detection methods, Combinations, Check against History and Test on this page start
 *                     folded with their counts; a click or Enter opens them; Save opens the card it points into
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
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const shotsDir = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// A page with known markers for the rule tester: a cookie, an element only the rule under test selects, inline script text and a script request
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/tp.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('window.tpLoaded = 1;'); }
  if (url.pathname === '/page') {
    res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'tp_sid=abc123; Path=/', 'cache-control': 'no-store' });
    return res.end('<!doctype html><html><head><title>Rule test page</title></head><body><div id="tp-box" data-tp-challenge="1">hello</div><script>window.__tpbot = { key: "SECRET_KEY_VALUE" };</script><script src="/tp.js"></script></body></html>');
  }
  res.writeHead(404); res.end();
});

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
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v304-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 420, height: 650 }, acceptDownloads: true,
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
  const patchSettings = (patch) => W((p) => SettingsStore.mutate({ operation: 'patch', patch: p }).then(r => r.success === true), patch);
  const seed = (list) => W((value) => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items: value }) }), list);
  async function openExtensionPage(file = 'popup.html') {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${file}: ${e.message}`));
    await page.goto(`chrome-extension://${extId}/${file}`);
    // The page in front: a tab the browser counts as hidden gets no animation frames, and Playwright's default waits use them
    await page.bringToFront();
    if (file.startsWith('popup.html')) await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { timeout: 30000, polling: 250 });
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
    await page.waitForFunction(() => !document.querySelector('#stats-panel-domains').hidden, null, { timeout: 5000, polling: 250 });
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

  // ===============================================================================================
  await scenario('History → Select entries: select, Select all, search prunes, Pin, Watch, Export, Delete, Done', async () => {
    await seed(SEED);
    const stored = async () => JSON.parse((await W(() => chrome.storage.local.get('scrapfly_history'))).scrapfly_history).items;
    const page = await openExtensionPage();
    await page.$eval('#nav-history', el => el.click());
    await page.waitForSelector('.history-item', { timeout: 20000 });
    const count = () => page.$eval('#historySelectCount', el => el.textContent.trim());
    const checked = () => page.$$eval('.history-item.is-selected', els => els.map(el => el.dataset.historyId).sort());
    const card = (id) => `.history-item[data-history-id="${id}"]`;

    // Not selecting: no checkboxes, no bar
    assert.equal(await page.$eval('#historySelectBar', el => el.hidden), true);
    assert.equal(await page.$$eval('.history-select-input', els => els.length), 0);
    await page.$eval('#historyMenuBtn', el => el.click());
    await page.$eval('#selectHistoryBtn', el => el.click());
    await page.waitForSelector('#historySelectBar:not([hidden])');
    assert.equal(await page.$$eval('.history-select-input', els => els.length), 5, 'a checkbox on every card');
    assert.equal(await count(), '0 selected');
    for (const id of ['historySelectPin', 'historySelectWatch', 'historySelectExport', 'historySelectDelete']) {
      assert.equal(await page.$eval(`#${id}`, el => el.disabled), true, `${id} needs a selection`);
    }

    // A click anywhere on a card selects it; the box and the card agree
    await page.$eval(`${card('c3')} .history-title`, el => el.click());
    await page.$eval(`${card('n1')} .history-select-input`, el => el.click());
    assert.deepEqual(await checked(), ['c3', 'n1']);
    assert.equal(await count(), '2 selected');
    assert.equal(await page.$eval(`${card('c3')} .history-select-input`, el => el.checked), true);
    assert.equal(await page.$eval('#historyList .history-item-action-btn', el => getComputedStyle(el).display), 'none', 'the card buttons step aside');
    await page.$eval(`${card('n1')} .history-title`, el => el.click());
    assert.deepEqual(await checked(), ['c3']);

    // Select all, then a search hides some: they are unselected, so an action cannot reach them
    await page.$eval('#historySelectAll', el => el.click());
    assert.equal(await count(), '5 selected');
    assert.equal(await page.$eval('#historySelectAll', el => el.textContent.trim()), 'Select none');
    if (shotsDir) { fs.mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: path.join(shotsDir, 'select-mode.png') }); }
    await page.fill('#historySearch', 'shop.example');
    await until(async () => (await count()) === '3 selected', 5000, 'the selection follows the search');
    assert.deepEqual(await checked(), ['c1', 'c2', 'c3']);
    await page.fill('#historySearch', '');
    await until(async () => (await page.$$eval('.history-item', els => els.length)) === 5, 5000, 'the full list');
    assert.equal(await count(), '3 selected', 'what the search hid stays unselected');

    // Pin: the three shop pages; the button then offers Unpin
    assert.equal(await page.$eval('#historySelectPin span', el => el.textContent.trim()), 'Pin');
    await page.$eval('#historySelectPin', el => el.click());
    await until(async () => (await stored()).filter(i => i.pinned === true).length === 3, 8000, 'three pinned entries');
    assert.deepEqual((await stored()).filter(i => i.pinned).map(i => i.id).sort(), ['c1', 'c2', 'c3']);
    await until(async () => (await page.$eval('#historySelectPin span', el => el.textContent.trim())) === 'Unpin', 5000, 'the Unpin label');
    assert.equal(await count(), '3 selected', 'the selection survives the change');

    // Watch: watching pins and flags them
    await page.$eval('#historySelectWatch', el => el.click());
    await until(async () => (await stored()).filter(i => i.watch === true).length === 3, 8000, 'three watched entries');
    assert.equal(await page.$eval('#historySelectWatch span', el => el.textContent.trim()), 'Stop watching');
    await page.$eval('#historySelectWatch', el => el.click());
    await until(async () => (await stored()).filter(i => i.watch === true).length === 0, 8000, 'watching stopped');

    // Export the three as one file, in the format Settings holds (JSON)
    const download = page.waitForEvent('download', { timeout: 10000 });
    await page.$eval('#historySelectExport', el => el.click());
    const file = await download;
    assert.match(file.suggestedFilename(), /^scrapfly-history-\d{4}-\d{2}-\d{2}\.json$/);
    const exported = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
    assert.deepEqual(exported.items.map(i => i.id).sort(), ['c1', 'c2', 'c3']);
    assert.equal(exported.itemsCount, 3);

    // Delete: it asks first, names the count and how many are pinned, and only then removes
    await page.$eval('#historySelectAll', el => el.click()); // three of five are selected: all five now
    assert.equal(await count(), '5 selected');
    await page.$eval(`${card('c3')} .history-title`, el => el.click()); // unselect c3 (pinned)
    assert.equal(await count(), '4 selected');
    await page.$eval('#historySelectDelete', el => el.click());
    await page.waitForSelector('.notification-confirm', { timeout: 8000 });
    const message = await page.$eval('.notification-confirm', el => el.innerText.replace(/\s+/g, ' '));
    assert.ok(/Delete selected entries/.test(message) && /\(4\)/.test(message) && /Pinned among them: 2\./.test(message), message);
    await page.$eval('.notification-confirm .notification-btn-cancel', el => el.click());
    await sleep(500);
    assert.equal((await stored()).length, 5, 'Cancel deletes nothing');
    await page.$eval('#historySelectDelete', el => el.click());
    await page.waitForSelector('.notification-confirm', { timeout: 8000 });
    await page.$eval('.notification-confirm .notification-btn-confirm', el => el.click());
    await until(async () => (await stored()).length === 1, 8000, 'four entries deleted');
    assert.deepEqual((await stored()).map(i => i.id), ['c3']);

    // Escape and Done leave Select mode: no bar, no checkboxes
    await until(async () => (await page.$$eval('.history-item', els => els.length)) === 1, 5000, 'the list after deleting');
    await page.keyboard.press('Escape');
    await until(() => page.$eval('#historySelectBar', el => el.hidden), 5000, 'Escape leaves Select mode');
    assert.equal(await page.$$eval('.history-select-input', els => els.length), 0);
    await page.$eval('#historyMenuBtn', el => el.click());
    await page.$eval('#selectHistoryBtn', el => el.click());
    await page.waitForSelector('#historySelectBar:not([hidden])');
    await page.$eval('#historySelectDone', el => el.click());
    assert.equal(await page.$eval('#historySelectBar', el => el.hidden), true);
    await page.close();
  });

  // ===============================================================================================
  await scenario('Webhook retry: held in memory, Retry in Recent deliveries, the alarm, and the switch', async () => {
    const HOOK = 'https://hooks.example/hook';
    const sw = await getWorker();
    await sw.evaluate(`(() => {
      const state = { calls: [], status: 503 };
      const original = globalThis.fetch.bind(globalThis);
      globalThis.__hook = state;
      globalThis.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input && input.url) || String(input);
        if (!url.startsWith('https://hooks.example/')) return original(input, init);
        state.calls.push({ url, method: init && init.method, body: init && typeof init.body === 'string' ? init.body : null });
        return { ok: state.status >= 200 && state.status < 300, status: state.status };
      };
    })()`);
    const status = (code) => sw.evaluate((c) => { globalThis.__hook.status = c; }, code);
    const calls = () => sw.evaluate(() => globalThis.__hook.calls.map(c => ({ ...c })));
    const log = () => W(async () => (await chrome.storage.local.get('scrapfly_webhook_log')).scrapfly_webhook_log || []);
    const held = () => W(async () => (await chrome.storage.session.get('session_webhook_held')).session_webhook_held || {});
    const deliver = (url) => W(async (u) => SettingsRuntime.sendWebhookIfEnabled({ url: u, title: 'Cart' }, [{ detector: { name: 'Cloudflare' }, name: 'Cloudflare', category: 'Anti-Bot', confidence: 90 }]), url);
    const patchWebhook = (changes) => patchSettings({ webhook: { enableWebhook: true, webhookUrl: HOOK, webhookMethod: 'POST', webhookContentType: 'application/json', webhookPayload: '', webhookHeaders: [], webhookSecret: '', ...changes } });
    await W(() => SettingsRuntime.clearWebhookLog());
    await W(() => chrome.storage.session.remove('session_webhook_held'));
    assert.ok(await patchWebhook({ webhookRetry: true }));

    // A delivery that fails: logged with an id and the time of the next retry, held in memory, an alarm set
    await status(503);
    await deliver('https://shop.example/cart?id=1');
    const [first] = await log();
    assert.deepEqual([first.outcome, first.status, first.page], ['failed', 503, 'shop.example']);
    assert.match(first.id, /^[a-z0-9]+$/);
    assert.ok(first.retryAt > Date.now() && first.retryAt <= Date.now() + 61000, `retryAt ${first.retryAt - Date.now()} ms away`);
    assert.deepEqual(Object.keys(await held()), [first.id]);
    assert.ok(!JSON.stringify(await log()).includes('hooks.example') && !JSON.stringify(await held()).includes('hooks.example'), 'neither the record nor the held data names the webhook address');
    const alarm = await W(() => chrome.alarms.get('scrapfly-webhook-retry'));
    assert.ok(alarm && alarm.scheduledTime > Date.now(), 'an alarm is set');

    // Settings → Detection → Webhook: the switch is on, and the failed line has Retry and says when
    const page = await openExtensionPage();
    await page.$eval('#settingsBtn', el => el.click());
    await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 250 });
    await page.$eval('.settings-tab-btn[data-settings-tab="detection"]', el => el.click());
    await page.waitForSelector('#webhookLogList .webhook-log-item', { state: 'attached', timeout: 10000 });
    assert.equal(await page.$eval('#webhookRetry', el => el.checked), true, 'on by default');
    if (shotsDir) { await page.evaluate(() => document.querySelector('#webhookRetry').scrollIntoView({ block: 'center' })); await sleep(400); fs.mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: path.join(shotsDir, 'webhook-retry-switch.png') }); }
    const rows = () => page.$$eval('#webhookLogList .webhook-log-item', items => items.map(item => ({
      text: item.querySelector('.webhook-log-text').textContent, retry: !!item.querySelector('.webhook-log-retry'), page: item.querySelector('.webhook-log-page').textContent })));
    let list = await rows();
    assert.equal(list.length, 1);
    assert.ok(/^Failed 503 · \d+ ms · retrying at /.test(list[0].text) && list[0].retry, JSON.stringify(list));

    // Retry: the webhook answers now, and the retry is delivered from the settings of this moment
    await status(200);
    await page.$eval('#webhookLogList .webhook-log-retry', el => el.click());
    await until(async () => (await rows()).length === 2, 10000, 'the retry line');
    list = await rows();
    assert.equal(list[0].text.startsWith('Sent 200'), true, JSON.stringify(list));
    assert.ok(/retry 1/.test(list[0].text), list[0].text);
    assert.ok(list.every(row => !row.retry), 'nothing left to retry');
    assert.deepEqual(await held(), {});
    assert.equal(await W(() => chrome.alarms.get('scrapfly-webhook-retry')), undefined);
    const sent = await calls();
    assert.equal(sent.length, 2);
    assert.equal(JSON.parse(sent[1].body).url, 'https://shop.example/cart?id=1', 'the same page data');
    if (shotsDir) { await page.evaluate(() => document.querySelector('#webhookLogGroup').scrollIntoView()); await sleep(400); fs.mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: path.join(shotsDir, 'webhook-retry.png') }); }

    // The alarm: a due retry runs by itself (its due time is moved into the past, the alarm brought forward)
    await status(502);
    await deliver('https://news.example/');
    const id2 = (await log()).at(-1).id;
    await status(200);
    await W(async (id) => {
      const stored = (await chrome.storage.session.get('session_webhook_held')).session_webhook_held;
      stored[id].due = Date.now() - 1000;
      await chrome.storage.session.set({ session_webhook_held: stored });
      chrome.alarms.create('scrapfly-webhook-retry', { when: Date.now() + 500 });
    }, id2);
    await until(async () => (await log()).some(e => e.page === 'news.example' && e.trigger === 'retry' && e.outcome === 'sent'), 15000, 'the retry by the alarm');
    assert.deepEqual(await held(), {});

    // Turned off in Settings: a failure is not held and has no Retry
    await page.$eval('#webhookRetry', el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.$eval('#saveSettingsBtn', el => el.click());
    await until(async () => (await W(() => StorageManager.readSettingsStrict())).webhook.webhookRetry === false, 10000, 'the saved switch');
    await status(503);
    await deliver('https://off.example/');
    const last = (await log()).at(-1);
    assert.deepEqual([last.page, last.outcome, last.id, last.retryAt], ['off.example', 'failed', undefined, undefined]);
    assert.deepEqual(await held(), {});
    await page.close();
  });

  // ===============================================================================================
  await scenario('Rules → Test on this page: an unsaved rule runs on the real page', async () => {
    const site = await ctx.newPage();
    await site.goto(`${origin}/page`);
    await site.waitForLoadState('load');
    await sleep(2500); // the content script is ready, the page's requests were seen
    const siteTab = await W(async (u) => { const t = (await chrome.tabs.query({})).find(x => x.url === u); return t && { id: t.id, url: t.url }; }, `${origin}/page`);
    assert.ok(siteTab, 'the site tab');
    const RULE = { id: 'tp-rule', name: 'TP rule', category: 'antibot', difficulty: 'Medium', description: 'test rule', enabled: true, detection: {
      cookie: [{ name: 'tp_sid', confidence: 60, description: 'session cookie' }, { name: 'tp_missing', confidence: 40 }],
      dom: [{ selector: 'div[data-tp-challenge]', confidence: 80, description: 'a selector no saved rule uses' }],
      content: [{ text: '__tpbot', confidence: 50 }],
      url: [{ text: '/tp.js', confidence: 70 }],
      header: [{ name: 'x-tp', confidence: 90 }],
      window: [{ path: 'tpKey', condition: 'typeof string', confidence: 60 }]
    } };
    const page = await openExtensionPage();
    await page.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await page.waitForSelector('#rulesSearch', { state: 'visible' });
    // The popup of a real browser belongs to the site's tab; this page is its own tab, so it is told which one
    await page.evaluate((tab) => { chrome.tabs.query = async () => [tab]; }, siteTab);
    await page.evaluate((rule) => window.popupInstance.rules.openEditModal(JSON.parse(JSON.stringify(rule)), 'antibot', rule.id, true), RULE);
    // The card starts folded, like Detection methods, Combinations and Check against History: open it as a person does
    await page.$eval('#ruleLiveTestCard .card-toggle-btn', el => el.click());
    await page.waitForSelector('#ruleLiveTestBtn', { state: 'visible', timeout: 10000 });
    assert.equal(await page.$eval('#ruleLiveTestResults', el => el.children.length), 0, 'nothing before the test');
    await page.$eval('#ruleLiveTestBtn', el => el.click());
    await page.waitForSelector('#ruleLiveTestResults .rule-check-row', { timeout: 30000 });
    const rows = await page.$$eval('#ruleLiveTestResults .rule-check-row', els => els.map(el => ({
      raw: el.querySelector('.rule-check-raw') ? el.querySelector('.rule-check-raw').textContent : '', status: el.querySelector('.live-test-status').textContent.trim(), kind: [...el.classList].filter(c => c.startsWith('is-')).join(' ') })));
    const byRaw = Object.fromEntries(rows.map(r => [r.raw, r]));
    assert.equal(byRaw.tp_sid.status, '1 found', JSON.stringify(rows));
    assert.equal(byRaw.tp_missing.status, 'no match');
    assert.equal(byRaw['div[data-tp-challenge]'].status, '1 found', 'a selector only this unsaved rule uses is found');
    assert.equal(byRaw.__tpbot.status, '1 found');
    assert.equal(byRaw['/tp.js'].status, '1 found');
    assert.equal(byRaw['x-tp'].status, 'needs a real scan');
    assert.equal(byRaw.tpKey.status, 'needs a real scan');
    assert.equal(byRaw['x-tp'].kind, 'is-untested');
    const summary = await page.$eval('#ruleLiveTestResults .rule-check-summary-text', el => el.textContent.trim());
    assert.match(summary, /^The rule matches 127\.0\.0\.1 \(confidence \d+%\)$/, summary);
    const notes = await page.$$eval('#ruleLiveTestResults .rule-check-note', els => els.map(el => el.textContent.trim()));
    assert.ok(notes.some(n => /^Read \d+ scripts, \d+ elements, \d+ cookies and \d+ requests\.$/.test(n)), notes.join(' | '));
    assert.ok(notes.some(n => /needs a real scan/.test(n)), 'the note explains the marks');
    assert.ok(!(await page.$eval('#ruleLiveTestResults', el => el.innerText)).includes('SECRET_KEY_VALUE'), 'no page value is shown');
    // Nothing came of it: no saved result, no History entry for the site
    assert.equal(await W(async () => { const items = JSON.parse((await chrome.storage.local.get('scrapfly_history')).scrapfly_history || '{"items":[]}').items; return items.filter(i => /127\.0\.0\.1/.test(i.url || '')).length; }), 0);
    if (shotsDir) { await page.evaluate(() => document.querySelector('#ruleLiveTestCard').scrollIntoView()); await sleep(400); fs.mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: path.join(shotsDir, 'rule-live-test.png') }); }

    // A popup that does not belong to a web page says so instead of failing
    const ownTab = await W(async (host) => { const t = (await chrome.tabs.query({})).find(x => x.url && x.url.startsWith(`chrome-extension://${host}/popup.html`)); return t && { id: t.id, url: t.url }; }, extId);
    await page.evaluate((tab) => { chrome.tabs.query = async () => [tab]; }, ownTab);
    await page.$eval('#ruleLiveTestBtn', el => el.click());
    await until(async () => /Open the popup on a web page/.test(await page.$eval('#ruleLiveTestResults', el => el.textContent)), 10000, 'the unsupported message');
    await page.close();
    await site.close();
  });

  // ===============================================================================================
  await scenario('Rule editor: Detection methods, Combinations, Check against History and Test on this page start folded', async () => {
    const page = await openExtensionPage();
    await page.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await page.waitForSelector('#rulesSearch', { state: 'visible' });
    const open = (rule, isNew) => page.evaluate(([r, n]) => window.popupInstance.rules.openEditModal(JSON.parse(JSON.stringify(r)), 'antibot', r.id, n), [rule, isNew]);
    const state = () => page.evaluate(() => Object.fromEntries(['detectionMethodsBody', 'combinationsBody', 'ruleHistoryCheckBody', 'ruleLiveTestBody'].map(id => [id, {
      hidden: document.getElementById(id).hidden,
      expanded: document.querySelector(`.card-toggle-btn[aria-controls="${id}"]`).getAttribute('aria-expanded')
    }])));
    const summaries = () => page.evaluate(() => [document.getElementById('detectionMethodsSummary').textContent, document.getElementById('combinationsSummary').textContent]);
    const RULE = { id: 'fold-rule', name: 'Fold rule', category: 'antibot', difficulty: 'Medium', enabled: true, detection: {
      cookie: [{ name: 'fold_a', confidence: 60 }, { name: 'fold_b', confidence: 50 }], content: [{ text: 'fold-marker', confidence: 40 }] },
      combinations: [{ id: 'c1', name: 'Both cookies', confidence: 90, when: { all: [{ method: 'cookie', index: 0 }, { method: 'cookie', index: 1 }] } }] };
    await open(RULE, false);
    let s = await state();
    assert.ok(Object.values(s).every(card => card.hidden && card.expanded === 'false'), JSON.stringify(s));
    assert.deepEqual(await summaries(), ['3 patterns', '1'], 'the folded headers say how much they hold');
    // A click on the header opens a card, and again closes it; the arrow button does the same from the keyboard
    await page.$eval('#detectionMethodsCard .modal-card-header--toggle h3', el => el.click());
    s = await state();
    assert.deepEqual([s.detectionMethodsBody.hidden, s.detectionMethodsBody.expanded], [false, 'true']);
    await page.$eval('#detectionMethodsCard .modal-card-header--toggle h3', el => el.click());
    assert.equal((await state()).detectionMethodsBody.hidden, true);
    await page.focus('#combinationsCard .card-toggle-btn');
    await page.keyboard.press('Enter');
    assert.equal((await state()).combinationsBody.hidden, false, 'Enter on the arrow opens Combinations');
    // Opened again later, a rule starts folded again
    await page.evaluate(() => document.querySelector('#cancelRuleEdit').click());
    await sleep(300);
    await open(RULE, false);
    assert.equal((await state()).combinationsBody.hidden, true, 'every open starts folded');
    // Save pointing at an empty pattern opens the card that holds it
    await page.evaluate(() => { const input = document.querySelector('#detectionMethodsContainer .method-item .method-name'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.evaluate(() => document.querySelector('#saveRuleEdit').click());
    await until(async () => !(await state()).detectionMethodsBody.hidden, 5000, 'Detection methods opened by Save');
    await page.evaluate(() => document.querySelector('#cancelRuleEdit').click());
    await sleep(300);
    // A new rule with no pattern opens on its patterns: there is nothing to hide
    await open({ id: 'fold-new', name: '', category: 'antibot', detection: {} }, true);
    s = await state();
    assert.deepEqual([s.detectionMethodsBody.hidden, s.combinationsBody.hidden], [false, true]);
    if (shotsDir) { fs.mkdirSync(shotsDir, { recursive: true }); }
    await page.evaluate(() => document.querySelector('#cancelRuleEdit').click());
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
