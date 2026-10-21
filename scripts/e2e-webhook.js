#!/usr/bin/env node
/**
 * Settings → Detection → Webhook: the filter, "Send on every page load" and the Recent deliveries list, end to end in the
 * real extension (unpacked in Chromium):
 *
 *   Off        a webhook that is off sends nothing and records nothing
 *   Sent       a scanned page is sent with its finished results; the record names the page, the status and the time, never the address
 *   Filters    minimum confidence, categories and sites: a page that does not pass is held back and the record says why
 *   Cache      a page answered from the cache is sent only with "Send on every page load"
 *   Failures   an answer of 500 and no answer at all are recorded as failed, with the kind of error and never its text
 *   Settings   the fields show and save the filter; Recent deliveries shows the record in the page's language, follows it
 *              while Settings is open, has the Test line and Clear
 *   Signed     a signing secret (saved, or only typed for Test) signs every request with a body the way Scrapfly's own
 *              webhooks are signed; GET, HEAD and multipart are not; Generate and Copy; nothing about the secret leaks
 *
 * The extension only sends to a public HTTPS address, so the webhook is a made-up one (https://hooks.example/...) whose
 * request is caught where the extension makes it: in the service worker (pages) and in the popup (Test). Pages come from a
 * local server on 127.0.0.1, localhost and a.localhost, so a site is told apart by its host. Two probe rules (a marker in
 * the page: an anti-bot one at 92% and a CAPTCHA one at 85%) make a real scan leave a result.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:webhook [-- --shots /tmp/shots]
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

const args = process.argv.slice(2);
const shotsAt = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : '';
const REPO = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--shots') || path.join(__dirname, '..'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = 'https://hooks.example/';
const { createHmac } = require('node:crypto');
const hmac = (secret, body) => createHmac('sha256', secret).update(body, 'utf8').digest('hex');

const PAGES = { '/a': 'webhook-antibot-marker', '/c': 'webhook-captcha-marker', '/both': 'webhook-antibot-marker webhook-captcha-marker' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (PAGES[url.pathname]) {
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(`<!doctype html><html><head><title>Webhook probe</title></head><body><p>${PAGES[url.pathname]}</p></body></html>`);
  }
  res.writeHead(404); res.end();
});

const rule = (id, name, category, marker, confidence) => ({
  id, name, author: 'Probe', enabled: true, category, difficulty: 'Medium', version: '1.0.0', lastUpdated: '2026-10-20', icon: 'custom.png', description: name,
  detection: { content: [{ id: `${id}-marker`, text: marker, confidence, standalone: true, description: `${id}-marker` }] }
});
const ANTIBOT = rule('detect-whantibot', 'Webhook Antibot Probe', 'Anti-Bot', 'webhook-antibot-marker', 92);
const CAPTCHA = rule('detect-whcaptcha', 'Webhook Captcha Probe', 'Captcha', 'webhook-captcha-marker', 85);

// Caught in whichever context sends: a request to the made-up address is recorded and answered as the test says
const CATCH = `(() => {
  const state = { calls: [], status: 200, fail: false };
  const original = globalThis.fetch.bind(globalThis);
  globalThis.__hook = state;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (!url.startsWith(${JSON.stringify(HOOK)})) return original(input, init);
    state.calls.push({ url, method: init && init.method, body: init && typeof init.body === 'string' ? init.body : null,
      headers: init && init.headers ? Object.fromEntries(new Headers(init.headers)) : {} });
    if (state.fail) throw new TypeError('Failed to fetch ' + url);
    return { ok: state.status >= 200 && state.status < 300, status: state.status };
  };
})()`;

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const at = (host, page, query = '') => `http://${host}:${port}${page}${query}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-webhook-'));
  if (shotsAt) fs.mkdirSync(shotsAt, { recursive: true });
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
      args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });
    await worker.evaluate(CATCH);
    const errors = [];
    const waitFor = async (check, what, timeout = 25000) => {
      const end = Date.now() + timeout;
      for (;;) {
        if (await check()) return;
        if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
        await sleep(250);
      }
    };

    const hookState = (state) => worker.evaluate((s) => Object.assign(globalThis.__hook, s), state);
    const calls = () => worker.evaluate(() => globalThis.__hook.calls.map(call => ({ ...call })));
    const record = () => worker.evaluate(async () => (await chrome.storage.local.get('scrapfly_webhook_log')).scrapfly_webhook_log || []);
    const clearRecord = () => worker.evaluate(() => SettingsRuntime.clearWebhookLog());
    const webhook = (changes = {}) => ({
      enableWebhook: true, webhookUrl: `${HOOK}hook`, webhookMethod: 'POST', webhookContentType: 'application/json', webhookPayload: '', webhookHeaders: [],
      webhookOnCache: false, webhookMinConfidence: 0, webhookCategories: [], webhookDomains: [], webhookSecret: '', ...changes
    });

    const popupPage = async () => {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      await page.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized);
      return page;
    };
    const stored = (page) => page.evaluate(() => StorageManager.readSettingsStrict());
    const patch = (page, value) => page.evaluate(async (v) => { if (!await StorageManager.patchSettings(v)) throw new Error('fixture failed'); }, value);

    // A page is scanned: `lines` new lines are expected in the record (0: wait and check that nothing came)
    const scan = async (url, lines) => {
      const before = (await record()).length;
      const page = await context.newPage();
      page.on('pageerror', () => {});
      try {
        await page.goto(url, { waitUntil: 'commit' });
        if (lines === 0) await sleep(7000);
        else await waitFor(async () => (await record()).length >= before + lines, `${lines} line(s) in the record for ${url}`);
      } finally { await page.close(); }
      const now = await record();
      assert.equal(now.length, before + lines, `${url}: ${now.length - before} new line(s) in the record`);
      return now.slice(before);
    };
    const summary = (entry) => ({ page: entry.page, outcome: entry.outcome, trigger: entry.trigger, ...(entry.reason ? { reason: entry.reason } : {}), ...(entry.status ? { status: entry.status } : {}), ...(entry.error ? { error: entry.error } : {}) });

    // Setup: the two probe rules, results cached per full address, English, the webhook off
    const admin = await popupPage();
    await admin.evaluate(async ([antibot, captcha]) => {
      await window.popupInstance.detectorManager.addDetector('antibot', antibot.id, antibot);
      await window.popupInstance.detectorManager.addDetector('captcha', captcha.id, captcha);
      await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
    }, [ANTIBOT, CAPTCHA]);
    await patch(admin, { detection: { cacheScope: 'full', scanMode: 'blocklist', blacklistedDomains: [], allowedDomains: [] }, webhook: webhook({ enableWebhook: false }), debugMode: false });
    await admin.evaluate(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
    await sleep(1500);
    await clearRecord();

    // 1. Off
    assert.deepEqual(await scan(at('127.0.0.1', '/a', '?off=1'), 0), []);
    assert.deepEqual(await calls(), [], 'nothing was sent');
    console.log('PASS Off: a webhook that is off sends nothing and records nothing');

    // 2. Sent: the finished results, the record without the address
    await patch(admin, { webhook: webhook() });
    await sleep(1500);
    const [sent] = await scan(at('127.0.0.1', '/a', '?on=1'), 1);
    assert.deepEqual(summary(sent), { page: '127.0.0.1', outcome: 'sent', trigger: 'scan', status: 200 });
    assert.equal(typeof sent.ms, 'number');
    assert.ok(Math.abs(sent.t - Date.now()) < 60000, 'the line carries the time');
    const first = (await calls())[0];
    assert.equal(first.method, 'POST');
    const body = JSON.parse(first.body);
    assert.equal(body.hostname, '127.0.0.1');
    assert.ok(body.detections.some(detection => detection.detector && detection.detector.name === 'Webhook Antibot Probe'), 'the body lists what was found on the page');
    assert.ok(!JSON.stringify(await record()).includes('hooks.example'), 'the record never holds the address');
    console.log('PASS Sent: a scanned page is sent with its results; the record has the page, the status and the time, not the address');

    // 3. Filters
    await clearRecord();
    await patch(admin, { webhook: webhook({ webhookMinConfidence: 95 }) });
    await sleep(1200);
    let [line] = await scan(at('127.0.0.1', '/a', '?f=1'), 1);
    assert.deepEqual(summary(line), { page: '127.0.0.1', outcome: 'skipped', trigger: 'scan', reason: 'confidence' });
    await patch(admin, { webhook: webhook({ webhookMinConfidence: 90 }) });
    await sleep(1200);
    [line] = await scan(at('127.0.0.1', '/a', '?f=2'), 1);
    assert.equal(line.outcome, 'sent', '92% passes a minimum of 90');
    await patch(admin, { webhook: webhook({ webhookCategories: ['captcha'] }) });
    await sleep(1200);
    [line] = await scan(at('127.0.0.1', '/a', '?f=3'), 1);
    assert.deepEqual(summary(line), { page: '127.0.0.1', outcome: 'skipped', trigger: 'scan', reason: 'category' });
    [line] = await scan(at('127.0.0.1', '/c', '?f=3'), 1);
    assert.equal(line.outcome, 'sent', 'a CAPTCHA page passes when CAPTCHA is chosen');
    await patch(admin, { webhook: webhook({ webhookCategories: ['antibot', 'captcha'], webhookMinConfidence: 90 }) });
    await sleep(1200);
    [line] = await scan(at('127.0.0.1', '/c', '?f=4'), 1);
    assert.deepEqual(summary(line), { page: '127.0.0.1', outcome: 'skipped', trigger: 'scan', reason: 'confidence' }, '85% is under 90');
    [line] = await scan(at('127.0.0.1', '/both', '?f=4'), 1);
    assert.equal(line.outcome, 'sent', 'the strongest detection of the page counts');
    await patch(admin, { webhook: webhook({ webhookDomains: ['a.localhost'] }) });
    await sleep(1200);
    [line] = await scan(at('127.0.0.1', '/a', '?f=5'), 1);
    assert.deepEqual(summary(line), { page: '127.0.0.1', outcome: 'skipped', trigger: 'scan', reason: 'site' });
    [line] = await scan(at('a.localhost', '/a', '?f=5'), 1);
    assert.deepEqual(summary(line), { page: 'a.localhost', outcome: 'sent', trigger: 'scan', status: 200 });
    assert.ok((await calls()).some(call => JSON.parse(call.body).hostname === 'a.localhost'), 'the site that passed was sent');
    console.log('PASS Filters: confidence, categories and sites hold a page back and the record says why');

    // 4. Cache
    await clearRecord();
    await patch(admin, { webhook: webhook() });
    await sleep(1200);
    const cached = at('127.0.0.1', '/a', '?cache=1');
    [line] = await scan(cached, 1);
    assert.equal(line.trigger, 'scan');
    await scan(cached, 0);
    assert.equal((await record()).length, 1, 'the second visit came from the cache and was not sent');
    await patch(admin, { webhook: webhook({ webhookOnCache: true }) });
    await sleep(1200);
    [line] = await scan(cached, 1);
    assert.deepEqual(summary(line), { page: '127.0.0.1', outcome: 'sent', trigger: 'cache', status: 200 }, 'with "Send on every page load" the cached page is sent too');
    await patch(admin, { webhook: webhook({ webhookOnCache: true, webhookCategories: ['captcha'] }) });
    await sleep(1200);
    [line] = await scan(cached, 1);
    assert.deepEqual(summary(line), { page: '127.0.0.1', outcome: 'skipped', trigger: 'cache', reason: 'category' }, 'a cached page goes through the same filter');
    console.log('PASS Cache: a cached page is sent only with "Send on every page load", and through the same filter');

    // 5. Failures
    await clearRecord();
    await patch(admin, { webhook: webhook() });
    await sleep(1200);
    await hookState({ status: 500 });
    [line] = await scan(at('127.0.0.1', '/a', '?x=1'), 1);
    assert.deepEqual(summary(line), { page: '127.0.0.1', outcome: 'failed', trigger: 'scan', status: 500 });
    await hookState({ status: 200, fail: true });
    [line] = await scan(at('127.0.0.1', '/a', '?x=2'), 1);
    assert.deepEqual(summary(line), { page: '127.0.0.1', outcome: 'failed', trigger: 'scan', error: 'network' });
    const text = JSON.stringify(await record());
    assert.ok(!text.includes('hooks.example') && !text.includes('Failed to fetch'), 'the error text and the address stay out of the record');
    await hookState({ fail: false });
    console.log('PASS Failures: a 500 and no answer are recorded as failed, with the kind of error and never its text');

    // 6. Settings: the fields, the list, Test, Clear
    await patch(admin, { webhook: webhook({ webhookMinConfidence: 40, webhookCategories: ['fingerprint'], webhookDomains: ['shop.example.com'] }) });
    await clearRecord();
    await worker.evaluate(async () => {
      const now = Date.now();
      for (const entry of [
        { t: now - 6000, page: 'old.example', outcome: 'sent', status: 200, ms: 84, trigger: 'scan' },
        { t: now - 5000, page: 'cached.example', outcome: 'sent', status: 204, ms: 12, trigger: 'cache' },
        { t: now - 4000, page: 'down.example', outcome: 'failed', error: 'network', trigger: 'scan' },
        { t: now - 3000, page: 'broken.example', outcome: 'failed', status: 503, ms: 30, trigger: 'scan' },
        { t: now - 2000, page: 'weak.example', outcome: 'skipped', reason: 'confidence', trigger: 'scan' },
        { t: now - 1000, page: 'other.example', outcome: 'skipped', reason: 'site', trigger: 'scan' }
      ]) await SettingsRuntime.recordWebhookDelivery(entry);
    });
    await admin.reload();
    await admin.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized);
    await admin.evaluate(CATCH);
    // Save closes Settings: it is opened again, on the Detection tab, whenever the script needs it
    const openSettings = async () => {
      await admin.$eval('#settingsBtn', el => el.click());
      await admin.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'));
      await admin.$eval('.settings-tab-btn[data-settings-tab="detection"]', el => el.click());
    };
    await openSettings();

    const palette = await admin.evaluate(() => Categories.KEYS.map(key => [key, Categories.DEFAULT_COLORS[key]]));
    const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
    assert.deepEqual(await admin.$$eval('.webhook-category', labels => labels.map(label => {
      const icon = label.querySelector('.category-icon');
      const svg = icon && icon.querySelector('svg');
      const box = svg && svg.getBoundingClientRect();
      return [label.querySelector('[data-webhook-category]').dataset.webhookCategory, !!svg && box.width > 0 && box.height > 0, icon && getComputedStyle(icon).color];
    })), palette.map(([key, hex]) => [key, true, rgb(hex)]), 'each category checkbox shows its icon in the category\'s colour');
    assert.equal(await admin.$eval('#webhookMinConfidence', el => el.value), '40');
    assert.deepEqual(await admin.$$eval('[data-webhook-category]', els => els.filter(el => el.checked).map(el => el.dataset.webhookCategory)), ['fingerprint']);
    assert.equal(await admin.$eval('#webhookDomains', el => el.value), 'shop.example.com');
    const list = () => admin.$$eval('#webhookLogList .webhook-log-item', items => items.map(item => ({
      page: item.querySelector('.webhook-log-page').textContent,
      text: item.querySelector('.webhook-log-text').textContent,
      kind: item.className.replace('webhook-log-item webhook-log-item--', ''),
      when: item.querySelector('.webhook-log-when').textContent
    })));
    let rows = await list();
    assert.deepEqual(rows.map(row => [row.page, row.text, row.kind]), [
      ['other.example', 'Not sent (site not on the list)', 'skipped'],
      ['weak.example', 'Not sent (below the minimum confidence)', 'skipped'],
      ['broken.example', 'Failed 503 · 30 ms', 'failed'],
      ['down.example', 'Failed (no answer)', 'failed'],
      ['cached.example', 'Sent 204 · 12 ms · cached page', 'sent'],
      ['old.example', 'Sent 200 · 84 ms', 'sent']
    ], 'the record, newest first, in the page\'s language');
    assert.ok(rows.every(row => row.when.length > 5), 'every line shows when');
    assert.equal(await admin.$eval('#webhookLogClearBtn', el => el.disabled), false);
    if (shotsAt) {
      await admin.$eval('#testWebhookBtn', el => el.scrollIntoView({ block: 'center' }));
      await admin.screenshot({ path: path.join(shotsAt, 'webhook-test-group.png') });
      await admin.$eval('#webhookFilterGroup', el => el.scrollIntoView({ block: 'start' }));
      await admin.screenshot({ path: path.join(shotsAt, 'webhook-filter.png') });
      await admin.$eval('#webhookLogGroup', el => el.scrollIntoView({ block: 'center' }));
      await admin.screenshot({ path: path.join(shotsAt, 'webhook-log.png') });
    }

    // Edit the fields and Save: the settings hold the new filter, in the app's order, with bare hosts
    await admin.fill('#webhookMinConfidence', '77');
    await admin.uncheck('[data-webhook-category="fingerprint"]');
    await admin.check('[data-webhook-category="captcha"]');
    await admin.check('[data-webhook-category="antibot"]');
    await admin.fill('#webhookDomains', 'HTTPS://Shop.Example.com/cart\nother.example.org');
    await admin.evaluate(() => window.popupInstance.settings.handleSaveSettings());
    await waitFor(async () => (await stored(admin)).webhook.webhookMinConfidence === 77, 'the saved filter');
    let now = (await stored(admin)).webhook;
    assert.deepEqual([now.webhookMinConfidence, now.webhookCategories, now.webhookDomains], [77, ['antibot', 'captcha'], ['shop.example.com', 'other.example.org']]);
    assert.equal(now.webhookUrl, `${HOOK}hook`, 'saving the filter keeps the connection');
    await waitFor(async () => !(await admin.$eval('#settingsModal', el => el.classList.contains('is-open'))), 'Settings closing after Save');
    await openSettings();
    assert.equal(await admin.$eval('#webhookMinConfidence', el => el.value), '77', 'the saved filter is shown when Settings is opened again');
    assert.deepEqual(await admin.$$eval('[data-webhook-category]', els => els.filter(el => el.checked).map(el => el.dataset.webhookCategory)), ['antibot', 'captcha']);
    assert.equal(await admin.$eval('#webhookDomains', el => el.value), 'shop.example.com\nother.example.org');
    await admin.fill('#webhookMinConfidence', '250');
    await admin.evaluate(() => window.popupInstance.settings.handleSaveSettings());
    await waitFor(async () => (await stored(admin)).webhook.webhookMinConfidence === 100, 'the clamped confidence');
    await waitFor(async () => !(await admin.$eval('#settingsModal', el => el.classList.contains('is-open'))), 'Settings closing after Save');
    await openSettings();
    console.log('PASS Settings: the fields show the saved filter; Save keeps it in the app\'s order, as bare hosts, clamped, with the connection');

    // Test adds its own line, live
    const sampleHost = await admin.evaluate(() => WebhookBody.sampleContext().hostname);
    await admin.evaluate(() => { window.__hook.status = 200; window.__hook.fail = false; });
    await admin.$eval('#testWebhookBtn', el => el.click());
    await waitFor(async () => (await list()).length === 7, 'the Test line');
    rows = await list();
    assert.equal(rows[0].page, sampleHost);
    assert.match(rows[0].text, /^Sent 200 · \d+ ms · test$/);
    await admin.evaluate(() => { window.__hook.status = 500; });
    await admin.$eval('#testWebhookBtn', el => el.click());
    await waitFor(async () => (await list()).length === 8, 'the second Test line');
    assert.match((await list())[0].text, /^Failed 500 · \d+ ms · test$/);
    await admin.evaluate(() => { window.__hook.status = 200; window.__hook.fail = true; });
    await admin.$eval('#testWebhookBtn', el => el.click());
    await waitFor(async () => (await list()).length === 9, 'the third Test line');
    assert.equal((await list())[0].text, 'Failed (no answer) · test');
    const lastTests = (await record()).slice(-3);
    assert.deepEqual(lastTests.map(entry => entry.trigger), ['test', 'test', 'test']);
    assert.ok(!JSON.stringify(lastTests).includes('hooks.example') && !JSON.stringify(lastTests).includes('Failed to fetch'));
    console.log('PASS Test: each press leaves a line (sent, 500, no answer) that appears at once, without the address or the error text');

    // A real scan while Settings is open shows up without reopening
    await patch(admin, { webhook: webhook() });
    await admin.evaluate(() => { window.__hook.fail = false; });
    await sleep(1200);
    const live = await context.newPage();
    live.on('pageerror', () => {});
    await live.goto(at('127.0.0.1', '/a', '?live=1'), { waitUntil: 'commit' });
    await waitFor(async () => (await list()).length === 10, 'the live line');
    await live.close();
    assert.deepEqual([(await list())[0].page, (await list())[0].kind], ['127.0.0.1', 'sent']);
    console.log('PASS Live: a page sent while Settings is open appears in the list without reopening it');

    // Clear
    await admin.$eval('#webhookLogClearBtn', el => el.click());
    await waitFor(async () => (await record()).length === 0, 'the cleared record');
    await waitFor(async () => (await list()).length === 0, 'the cleared list');
    assert.equal(await admin.$eval('#webhookLogList .webhook-log-empty', el => el.textContent), 'Nothing sent yet.');
    assert.equal(await admin.$eval('#webhookLogClearBtn', el => el.disabled), true);
    console.log('PASS Clear: the record and the list are emptied, and Clear is off until there is something to clear');

    // 7. Signed. Debug and the log collector are on and the popup console is read, so anything logged would show
    const SIG = 'x-scrapfly-webhook-signature', SIG_LOWER = 'x-scrapfly-webhook-signature-lowercase'; // as recorded: fetch lowercases names
    const digests = [];
    const consoleLines = [];
    admin.on('console', message => consoleLines.push(message.text()));
    await patch(admin, { debugMode: true, logCollectorEnabled: true, webhook: webhook({ webhookHeaders: [{ name: 'x-scrapfly-webhook-signature', value: 'forged' }] }) });
    await admin.reload();
    await admin.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized);
    await admin.evaluate(CATCH);
    await openSettings();
    // A secret typed with spaces around it is saved trimmed
    await admin.fill('#webhookSecret', '  SYNTHETIC_SECRET_SAVED  ');
    await admin.evaluate(() => window.popupInstance.settings.handleSaveSettings());
    await waitFor(async () => (await stored(admin)).webhook.webhookSecret === 'SYNTHETIC_SECRET_SAVED', 'the saved secret');
    // A scanned page is signed with it, in both headers, and the forged custom header is gone
    const resetCalls = () => worker.evaluate(() => { globalThis.__hook.calls.length = 0; globalThis.__hook.status = 200; globalThis.__hook.fail = false; });
    await resetCalls();
    await clearRecord();
    await scan(at('127.0.0.1', '/a', '?signed=1'), 1);
    let [signedCall] = await calls();
    assert.equal(typeof signedCall.body, 'string');
    digests.push(hmac('SYNTHETIC_SECRET_SAVED', signedCall.body));
    assert.equal(signedCall.headers[SIG], digests[0].toUpperCase(), 'the uppercase signature, as Scrapfly sends it');
    assert.equal(signedCall.headers[SIG_LOWER], digests[0], 'and its lowercase copy');
    assert.ok(!JSON.stringify(signedCall.headers).includes('forged'), 'a custom header cannot pose as the signature');
    // Test signs with the secret in the field, saved or not; Cancel drops the typed one
    await openSettings();
    await admin.fill('#webhookSecret', 'SYNTHETIC_SECRET_UNSAVED');
    await admin.evaluate(() => { window.__hook.calls.length = 0; window.__hook.status = 200; window.__hook.fail = false; });
    await admin.$eval('#testWebhookBtn', el => el.click());
    await waitFor(async () => (await admin.evaluate(() => window.__hook.calls.length)) === 1, 'the Test request');
    const testCall = await admin.evaluate(() => ({ ...window.__hook.calls[0] }));
    digests.push(hmac('SYNTHETIC_SECRET_UNSAVED', testCall.body));
    assert.equal(testCall.headers[SIG_LOWER], digests[1], 'Test signs with the secret in the field, saved or not');
    await admin.$eval('#cancelSettingsBtn', el => el.click());
    assert.equal((await stored(admin)).webhook.webhookSecret, 'SYNTHETIC_SECRET_SAVED', 'Cancel keeps the saved secret');
    // Generate stages 64 hex characters and Copy hands exactly them to the clipboard; neither saves anything
    await openSettings();
    assert.equal(await admin.$eval('#webhookSecret', el => el.value), 'SYNTHETIC_SECRET_SAVED', 'the field shows the saved secret again');
    await admin.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = async (text) => { window.__copied.push(text); }; });
    await admin.$eval('#webhookSecretGenerateBtn', el => el.click());
    const generated = await admin.$eval('#webhookSecret', el => el.value);
    assert.match(generated, /^[0-9a-f]{64}$/, 'Generate fills 64 hex characters');
    assert.equal(await admin.$eval('#webhookSecretCopyBtn', el => el.disabled), false);
    await admin.$eval('#webhookSecretCopyBtn', el => el.click());
    await waitFor(async () => (await admin.evaluate(() => window.__copied.length)) === 1, 'the copy');
    assert.deepEqual(await admin.evaluate(() => window.__copied), [generated], 'Copy hands exactly the field to the clipboard');
    assert.equal(await admin.$eval('#webhookSecret', el => el.value), generated, 'the field keeps its value after Copy');
    assert.equal((await stored(admin)).webhook.webhookSecret, 'SYNTHETIC_SECRET_SAVED', 'neither Generate nor Copy saves anything');
    // A secret no server could check: the error under the field, and Save is refused
    await admin.fill('#webhookSecret', 'clé');
    assert.equal(await admin.$eval('#webhookSecretError', el => el.hidden), false, 'the error shows under the field');
    assert.equal(await admin.$eval('#webhookSecret', el => el.getAttribute('aria-invalid')), 'true');
    await admin.evaluate(() => window.popupInstance.settings.handleSaveSettings());
    await sleep(1500);
    assert.equal((await stored(admin)).webhook.webhookSecret, 'SYNTHETIC_SECRET_SAVED', 'Save is refused');
    assert.ok(await admin.evaluate(() => document.querySelector('#settingsModal').classList.contains('is-open')), 'Settings stays open');
    await admin.$eval('#cancelSettingsBtn', el => el.click());
    // GET, multipart and an empty secret: not signed
    const unsigned = [['GET', { webhookMethod: 'GET', webhookSecret: 'SYNTHETIC_SECRET_SAVED' }], ['multipart', { webhookContentType: 'multipart/form-data', webhookSecret: 'SYNTHETIC_SECRET_SAVED' }], ['no secret', { webhookSecret: '' }]];
    for (let i = 0; i < unsigned.length; i++) {
      const [what, changes] = unsigned[i];
      await patch(admin, { webhook: webhook(changes) });
      await sleep(800);
      await resetCalls();
      await clearRecord();
      await scan(at('127.0.0.1', '/a', `?unsigned=${i}`), 1);
      [signedCall] = await calls();
      assert.equal(signedCall.headers[SIG], undefined, `${what}: not signed`);
      assert.equal(signedCall.headers[SIG_LOWER], undefined, `${what}: not signed`);
    }
    // Nothing about the secrets or the signatures reached the record, the worker's collected logs or the popup console
    const collected = await worker.evaluate(() => logCollector.exportAsText());
    const everywhere = JSON.stringify([await record(), collected, consoleLines]);
    for (const secretish of ['SYNTHETIC_SECRET', generated, ...digests, ...digests.map(d => d.toUpperCase())]) assert.ok(!everywhere.includes(secretish), `leaked: ${secretish.slice(0, 12)}…`);
    await patch(admin, { debugMode: false, logCollectorEnabled: false, webhook: webhook({ enableWebhook: false }) });
    console.log('PASS Signed: saved and typed secrets sign scans and Test alike, Generate and Copy stage only, an unusable secret is refused, GET/multipart/none stay unsigned, and no secret or signature leaks');

    assert.deepEqual(errors, [], 'no popup runtime exceptions');
    console.log('RESULT ALL PASS, no page errors');
  } finally {
    try { if (context) await context.close(); } finally { server.close(); fs.rmSync(profile, { recursive: true, force: true }); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
