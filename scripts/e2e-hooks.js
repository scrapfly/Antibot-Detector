#!/usr/bin/env node
/**
 * Settings → Detection → Sites without JS hooks, end to end in the real extension (unpacked in Chromium):
 *
 *   Hooks on    a page that draws on a canvas is found by its content probe and, through the JS hooks, as Canvas Fingerprint
 *   Hooks off   with the site on the list the canvas calls are not watched (no Canvas Fingerprint), the content probe is
 *               still found, and the result is cached marked as found without the hooks
 *   Switching   a result found under one setting is never reused under the other: the same address is scanned again,
 *               both ways; a site that is not on the list keeps its hooks
 *   Popup       on a site without hooks the results say fingerprinting is not checked, and an empty result says it
 *               instead of "No Fingerprinting"; any other site shows neither
 *   Settings    the box shows the list and saves it as bare hosts, with the other lists untouched
 *
 * One local server answers on 127.0.0.1, localhost and a.localhost, so a site is told apart by its host.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:hooks [-- --shots /tmp/shots]
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

// The canvas calls are spelled in pieces, so no rule that reads the page's text can find them: only the JS hooks can
const PAGE = (marker) => `<!doctype html><html><head><title>Hooks probe</title></head><body><p>${marker}</p>
<canvas id="c" width="20" height="20"></canvas>
<iframe id="f" src="/frame"></iframe>
<script>
  const word = (...parts) => parts.join('');
  const c = document.getElementById('c'); const g = c.getContext('2d');
  g[word('fill', 'Text')]('probe', 2, 10); c[word('toData', 'URL')](); g[word('getImage', 'Data')](0, 0, 5, 5);
</script></body></html>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/frame') { res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); return res.end('<!doctype html><html><head><title>Frame</title></head><body><p>frame</p></body></html>'); }
  if (url.pathname === '/canvas') { res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); return res.end(PAGE('hooks-probe-marker')); }
  if (url.pathname === '/clean') { res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); return res.end('<!doctype html><html><head><title>Clean</title></head><body><p>nothing here</p></body></html>'); }
  res.writeHead(404); res.end();
});

const PROBE = {
  id: 'detect-hooksprobe', name: 'Hooks Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium', version: '1.0.0',
  lastUpdated: '2026-10-20', icon: 'custom.png', description: 'Hooks probe',
  detection: { content: [{ id: 'hooks-marker', text: 'hooks-probe-marker', confidence: 90, standalone: true, description: 'hooks-marker' }] }
};

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const at = (host, page, query = '') => `http://${host}:${port}${page}${query}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-hooks-'));
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
    const errors = [];
    const waitFor = async (check, what, timeout = 30000) => {
      const end = Date.now() + timeout;
      for (;;) {
        if (await check()) return;
        if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
        await sleep(250);
      }
    };

    const entryOf = (url) => worker.evaluate(async (u) => {
      const stored = (await chrome.storage.local.get('scrapfly_detection_storage')).scrapfly_detection_storage || {};
      const entry = Object.values(stored).find(item => item && item.url === u);
      return entry ? {
        timestamp: entry.timestamp, hooksOff: entry.hooksOff === true, count: entry.detectionCount,
        names: (entry.detectionResults || []).map(d => d.detector && d.detector.name),
        evidence: Object.fromEntries((entry.detectionResults || []).map(d => [d.detector && d.detector.name, [...new Set((d.matches || []).map(m => m.type))]]))
      } : null;
    }, url);
    const popupPage = async (activeTab) => {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      if (activeTab) {
        await page.addInitScript((tab) => {
          const original = chrome.tabs.query.bind(chrome.tabs);
          chrome.tabs.query = (info, cb) => { if (info && info.active) { if (cb) { cb([tab]); return undefined; } return Promise.resolve([tab]); } return original(info, cb); };
        }, activeTab);
      }
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      await page.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized);
      return page;
    };
    const stored = (page) => page.evaluate(() => StorageManager.readSettingsStrict());
    const patch = (page, value) => page.evaluate(async (v) => { if (!await StorageManager.patchSettings(v)) throw new Error('fixture failed'); }, value);

    // The page is scanned (a fresh scan: the cache entry of the address is new); the page stays open when asked
    const scan = async (url, { keepOpen = false } = {}) => {
      const before = await entryOf(url);
      const page = await context.newPage();
      page.on('pageerror', () => {});
      await page.goto(url, { waitUntil: 'commit' });
      await waitFor(async () => { const now = await entryOf(url); return now && (!before || now.timestamp > before.timestamp); }, `a new scan of ${url}`);
      const entry = await entryOf(url);
      const tab = await worker.evaluate(async (u) => (await chrome.tabs.query({})).find(t => t.url === u) || null, url);
      if (!keepOpen) await page.close();
      return { entry, page, tab };
    };
    const hasCanvas = (entry) => entry.names.some(name => /canvas/i.test(name || ''));
    // Which of the page's and its frame's methods carry a wrapper of ours: a wrapper is given its own toString (so it
    // reads as native), a native method has none of its own
    const wrappedIn = (page) => page.evaluate(async () => {
      const frame = document.getElementById('f');
      if (!frame.contentDocument || frame.contentDocument.readyState !== 'complete') await new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
      const wrapped = (fn) => typeof fn === 'function' && Object.prototype.hasOwnProperty.call(fn, 'toString');
      const win = frame.contentWindow;
      const accessor = (w) => Object.getOwnPropertyDescriptor(w.HTMLIFrameElement.prototype, 'contentWindow').get;
      return { topCanvas: wrapped(HTMLCanvasElement.prototype.toDataURL), frameCanvas: wrapped(win.HTMLCanvasElement.prototype.toDataURL),
        topAccessor: wrapped(accessor(window)), frameAccessor: wrapped(accessor(win)) };
    });

    // Setup: the probe rule, results cached per full address, English, no hooks off
    const admin = await popupPage();
    await admin.evaluate(async (rule) => { await window.popupInstance.detectorManager.addDetector('antibot', rule.id, rule); await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r())); }, PROBE);
    await patch(admin, { detection: { cacheScope: 'full', scanMode: 'blocklist', blacklistedDomains: [], allowedDomains: [], hooksOffDomains: [] }, debugMode: false });
    await admin.evaluate(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
    await sleep(1500);

    // 1. Hooks on
    const canvasUrl = at('127.0.0.1', '/canvas', '?h=1');
    const on = await scan(canvasUrl, { keepOpen: true });
    let entry = on.entry;
    // With the hooks on: the page's own hooks are taken off when the scan ends, the frame's early recorders and the
    // frame accessors stay (they route a frame's later calls to the next install)
    const onState = await wrappedIn(on.page);
    assert.deepEqual(onState, { topCanvas: false, frameCanvas: true, topAccessor: true, frameAccessor: true }, `with the hooks on, the frame stays watched after the scan: ${JSON.stringify(onState)}`);
    await on.page.close();
    assert.ok(entry.names.includes('Hooks Probe'), 'the content probe is found');
    assert.ok(hasCanvas(entry), `the canvas calls are watched: ${JSON.stringify(entry.evidence)}`);
    assert.ok(Object.entries(entry.evidence).some(([name, types]) => /canvas/i.test(name) && types.includes('js_hooks')), 'and it is the JS hooks that found them');
    assert.equal(entry.hooksOff, false, 'a result found with the hooks carries no mark');
    console.log('PASS Hooks on: the content probe and Canvas Fingerprint (through the JS hooks) are found');

    // 2. Hooks off: the same address is scanned again, without the hooks
    await patch(admin, { detection: { hooksOffDomains: ['127.0.0.1'] } });
    await sleep(1500);
    const off = await scan(canvasUrl, { keepOpen: true });
    entry = off.entry;
    assert.ok(entry.names.includes('Hooks Probe'), 'the content probe is still found');
    assert.ok(!hasCanvas(entry), `the canvas calls are not watched: ${JSON.stringify(entry.evidence)}`);
    assert.equal(entry.hooksOff, true, 'the result is marked as found without the hooks');
    const offState = await wrappedIn(off.page);
    assert.deepEqual(offState, { topCanvas: false, frameCanvas: false, topAccessor: false, frameAccessor: false }, `with the hooks off, nothing of the page or its frame is wrapped: ${JSON.stringify(offState)}`);
    console.log('PASS Hooks off: the same address is scanned again (the result found with hooks was not reused), the probe is found, Canvas Fingerprint is not, the result is marked, nothing in the page or its frame is wrapped');

    // 3. The popup of that site says fingerprinting is not checked
    let popup = await popupPage(off.tab);
    await popup.waitForFunction(() => window.popupInstance.detection.currentResults?.length > 0, null, { timeout: 20000 });
    await waitFor(async () => !(await popup.$eval('#hooksOffNote', el => el.hidden)), 'the note on the results');
    assert.equal((await popup.$eval('#hooksOffNote', el => el.textContent)).trim().replace(/\s+/g, ' '), 'JS hooks are off on this site, so fingerprinting is not checked.');
    if (shotsAt) await popup.screenshot({ path: path.join(shotsAt, 'hooks-off-results.png') });
    await popup.close(); await off.page.close();

    // 4. Hooks on again: scanned again, the canvas calls are back, no note
    await patch(admin, { detection: { hooksOffDomains: [] } });
    await sleep(1500);
    const back = await scan(canvasUrl, { keepOpen: true });
    assert.ok(hasCanvas(back.entry), `the canvas calls are watched again: ${JSON.stringify(back.entry.names)}`);
    assert.equal(back.entry.hooksOff, false);
    popup = await popupPage(back.tab);
    await popup.waitForFunction(() => window.popupInstance.detection.currentResults?.length > 0, null, { timeout: 20000 });
    await sleep(800);
    assert.equal(await popup.$eval('#hooksOffNote', el => el.hidden), true, 'no note when the hooks are on');
    await popup.close(); await back.page.close();
    console.log('PASS Switching: turning the hooks back on scans the address again and Canvas Fingerprint is back; the note is gone');

    // 5. Another site keeps its hooks
    await patch(admin, { detection: { hooksOffDomains: ['127.0.0.1'] } });
    await sleep(1500);
    const other = await scan(at('localhost', '/canvas', '?h=1'));
    assert.ok(hasCanvas(other.entry), 'a site that is not on the list keeps its hooks');
    assert.equal(other.entry.hooksOff, false);
    console.log('PASS Other sites: a site that is not on the list is watched as before');

    // 6. An empty result on a site without hooks does not claim "No Fingerprinting"
    const cleanOff = await scan(at('127.0.0.1', '/clean', '?h=1'), { keepOpen: true });
    assert.equal(cleanOff.entry.count, 0);
    assert.equal(cleanOff.entry.hooksOff, true);
    popup = await popupPage(cleanOff.tab);
    await popup.waitForFunction(() => document.querySelector('#emptyState') && getComputedStyle(document.querySelector('#emptyState')).display !== 'none', null, { timeout: 20000 });
    await waitFor(() => popup.$eval('#emptyState [data-badge="fingerprint"]', el => el.classList.contains('state-card-badge--off')), 'the badge of a site without hooks');
    const emptyOff = await popup.evaluate(() => ({
      badge: document.querySelector('#emptyState [data-badge="fingerprint"]').textContent.trim(),
      description: document.querySelector('#emptyState .state-card-description').textContent.trim(),
      badges: [...document.querySelectorAll('#emptyState .state-card-badge')].map(el => el.textContent.trim())
    }));
    assert.equal(emptyOff.badge, 'Fingerprinting not checked');
    assert.match(emptyOff.description, /JS hooks are off here, so fingerprinting was not checked/);
    assert.ok(!emptyOff.badges.includes('✓ No Fingerprinting'));
    if (shotsAt) await popup.screenshot({ path: path.join(shotsAt, 'hooks-off-empty.png') });
    await popup.close(); await cleanOff.page.close();

    // A host with no earlier result: a weak rescan keeps a positive result of the same host, so localhost would not do
    const cleanOn = await scan(at('a.localhost', '/clean', '?h=1'), { keepOpen: true });
    popup = await popupPage(cleanOn.tab);
    await popup.waitForFunction(() => document.querySelector('#emptyState') && getComputedStyle(document.querySelector('#emptyState')).display !== 'none', null, { timeout: 20000 });
    await sleep(800);
    const emptyOn = await popup.evaluate(() => ({
      badge: document.querySelector('#emptyState [data-badge="fingerprint"]').textContent.trim(),
      off: document.querySelector('#emptyState [data-badge="fingerprint"]').classList.contains('state-card-badge--off')
    }));
    assert.deepEqual(emptyOn, { badge: '✓ No Fingerprinting', off: false });
    await popup.close(); await cleanOn.page.close();
    console.log('PASS Nothing detected: a site without hooks says fingerprinting was not checked; any other site keeps "No Fingerprinting"');

    // 7. Settings: the box and Save
    await admin.reload();
    await admin.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized);
    await admin.$eval('#settingsBtn', el => el.click());
    await admin.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'));
    await admin.$eval('.settings-tab-btn[data-settings-tab="detection"]', el => el.click());
    assert.equal(await admin.$eval('#hooksOffDomains', el => el.value), '127.0.0.1', 'the box shows the saved list');
    if (shotsAt) {
      await admin.$eval('#hooksOffDomains', el => el.scrollIntoView({ block: 'center' }));
      await admin.screenshot({ path: path.join(shotsAt, 'hooks-off-settings.png') });
    }
    await admin.fill('#hooksOffDomains', 'HTTPS://Shop.Example.com/cart\n127.0.0.1, *.cdn.example.net');
    await admin.evaluate(() => window.popupInstance.settings.handleSaveSettings());
    await waitFor(async () => (await stored(admin)).detection.hooksOffDomains.length === 3, 'the saved list');
    const now = (await stored(admin)).detection;
    // A saved site keeps its place, the sites typed now follow in the order typed (Save merges additions and removals)
    assert.deepEqual(now.hooksOffDomains, ['127.0.0.1', 'shop.example.com', 'cdn.example.net']);
    assert.deepEqual([now.blacklistedDomains, now.allowedDomains, now.scanMode], [[], [], 'blocklist'], 'the other lists are untouched');
    console.log('PASS Settings: the box shows the saved list and saves it as bare hosts, with the other lists untouched');

    assert.deepEqual(errors, [], 'no popup runtime exceptions');
    console.log('RESULT ALL PASS, no page errors');
  } finally {
    try { if (context) await context.close(); } finally { server.close(); fs.rmSync(profile, { recursive: true, force: true }); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
