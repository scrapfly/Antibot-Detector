#!/usr/bin/env node
/**
 * Every per-rule setting (scope, regex, whole word, case, payload filters), end to end, in the real extension (unpacked in
 * Chromium). A local site emits exactly one signal per method and a test
 * detector has one rule per method: URL, request cookie, response cookie
 * (Set-Cookie), response header, request header (Cookie), inline and external
 * script content, DOM, window property, POST payload, a combination, and the
 * JS hooks via Canvas Fingerprint. Guard rules check that scopes are real
 * (a JS-set cookie is not a Set-Cookie, a response header is not a request
 * header, page text is not script text), and a clean page on another host
 * must match nothing.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:settings
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const REPO = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const FULL = `<!doctype html><html><head><title>probe full</title>
<script>
  var probeInlineMarker = 'probe-inline-text';
  window.probeGlobal = { ready: true };
  document.cookie = 'probe_doc_cookie=1; path=/';
</script>
<script src="/static/probe-external.js"></script>
<script src="/probe-url-marker.js"></script>
</head><body>
<p>probe-body-only-text</p>
<div id="probe-dom" class="probe-dom-class" data-probe="1">x</div>
<canvas id="c" width="20" height="20"></canvas>
<script>
  fetch('/api/collect', { method: 'POST', headers: { 'X-Probe-Req': 'req-ok', 'Content-Type': 'text/plain' }, body: 'probe_payload_token=abc123' });
  const c = document.getElementById('c'); const g = c.getContext('2d');
  g.fillText('probe', 2, 10); c.toDataURL(); g.getImageData(0, 0, 5, 5);
</script>
</body></html>`;
const CLEAN = `<!doctype html><html><head><title>probe clean</title></head><body><p>nothing here</p></body></html>`;

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/full') {
    res.writeHead(200, { 'content-type': 'text/html', 'x-probe-resp': 'resp-ok', 'set-cookie': 'probe_resp_cookie=1; Path=/' });
    return res.end(FULL);
  }
  if (u === '/prime') { res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'probe_resp_cookie=1; Path=/' }); return res.end('<!doctype html><title>prime</title>'); }
  if (u === '/clean') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(CLEAN); }
  if (u === '/static/probe-external.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); return res.end('window.__ext = "probeExternalMarker";'); }
  if (u === '/probe-url-marker.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); return res.end('/* url marker */'); }
  if (u === '/api/collect') { let b = ''; req.on('data', d => b += d); req.on('end', () => { res.writeHead(204); res.end(); }); return; }
  res.writeHead(404); res.end();
});

const R = (o) => ({ confidence: 40, standalone: true, ...o, description: o.id });
// Each setting is checked as a pair: same rule, one setting changed; one must
// match and the other must not. An ignored setting fails one of the two.
const DETECTOR = {
  id: 'detect-settingsprobe', name: 'Settings Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Low',
  version: '1.0.0', lastUpdated: '2026-10-06', icon: 'custom.png', description: 'one rule pair per rule setting',
  detection: {
    url: [
      R({ id: 'y-url-scope-page-only', text: '/full', textScope: 'page_only' }),
      R({ id: 'n-url-scope-page-only', text: '/api/collect', textScope: 'page_only' }),
      R({ id: 'y-url-scope-scripts', text: 'probe-url-marker.js', textScope: 'page_and_scripts' }),
      R({ id: 'n-url-scope-scripts', text: '/api/collect', textScope: 'page_and_scripts' }),
      R({ id: 'y-url-scope-all', text: '/api/collect', textScope: 'all' }),
      R({ id: 'y-url-regex', text: '^https?://[^/?#]+/probe-url-marker\\.js$', textRegex: true }),
      R({ id: 'n-url-regex-off', text: '^https?://[^/?#]+/probe-url-marker\\.js$' }),
      R({ id: 'y-url-case-off', text: 'PROBE-URL-MARKER' }),
      R({ id: 'n-url-case-on', text: 'PROBE-URL-MARKER', textCaseSensitive: true }),
      R({ id: 'y-url-wholeword-off', text: 'probe-url-mark' }),
      R({ id: 'n-url-wholeword-on', text: 'probe-url-mark', textWholeWord: true })
    ],
    cookie: [
      R({ id: 'y-cookie-name-regex', name: '^probe_doc_cook', nameRegex: true, nameScope: 'all', valueScope: 'all' }),
      R({ id: 'n-cookie-name-regex-off', name: '^probe_doc_cook', nameScope: 'all', valueScope: 'all' }),
      R({ id: 'y-cookie-wholeword-off', name: 'probe_doc', nameScope: 'all', valueScope: 'all' }),
      R({ id: 'n-cookie-wholeword-on', name: 'probe_doc', nameWholeWord: true, nameScope: 'all', valueScope: 'all' }),
      R({ id: 'y-cookie-case-off', name: 'PROBE_DOC_COOKIE', nameScope: 'all', valueScope: 'all' }),
      R({ id: 'n-cookie-case-on', name: 'PROBE_DOC_COOKIE', nameCaseSensitive: true, nameScope: 'all', valueScope: 'all' }),
      R({ id: 'y-cookie-value', name: 'probe_doc_cookie', value: '^1$', valueRegex: true, nameScope: 'all', valueScope: 'all' }),
      R({ id: 'n-cookie-value', name: 'probe_doc_cookie', value: '^2$', valueRegex: true, nameScope: 'all', valueScope: 'all' }),
      R({ id: 'y-cookie-scope-all-response', name: 'probe_resp_cookie', nameScope: 'all', valueScope: 'all' }),
      R({ id: 'y-cookie-scope-request', name: 'probe_doc_cookie', nameScope: 'request', valueScope: 'request' }),
      R({ id: 'y-cookie-scope-response', name: 'probe_resp_cookie', nameScope: 'response', valueScope: 'response' }),
      R({ id: 'n-cookie-scope-response', name: 'probe_doc_cookie', nameScope: 'response', valueScope: 'response' })
    ],
    header: [
      R({ id: 'y-header-scope-response', name: 'x-probe-resp', nameScope: 'response', valueScope: 'response' }),
      R({ id: 'n-header-scope-request', name: 'x-probe-resp', nameScope: 'request', valueScope: 'request' }),
      R({ id: 'y-header-scope-all-response', name: 'x-probe-resp', nameScope: 'all', valueScope: 'all' }),
      R({ id: 'y-header-scope-all-request', name: 'cookie', value: 'probe_resp_cookie', nameScope: 'all', valueScope: 'all' }),
      R({ id: 'y-header-value-case-off', name: 'x-probe-resp', value: 'RESP-OK', nameScope: 'response', valueScope: 'response' }),
      R({ id: 'n-header-value-case-on', name: 'x-probe-resp', value: 'RESP-OK', valueCaseSensitive: true, nameScope: 'response', valueScope: 'response' }),
      R({ id: 'y-header-value-regex', name: 'x-probe-resp', value: '^resp-o.$', valueRegex: true, nameScope: 'response', valueScope: 'response' }),
      R({ id: 'n-header-value-regex-off', name: 'x-probe-resp', value: '^resp-o.$', nameScope: 'response', valueScope: 'response' }),
      R({ id: 'y-header-value-wholeword-off', name: 'x-probe-resp', value: 'resp-o', nameScope: 'response', valueScope: 'response' }),
      R({ id: 'n-header-value-wholeword-on', name: 'x-probe-resp', value: 'resp-o', valueWholeWord: true, nameScope: 'response', valueScope: 'response' })
    ],
    content: [
      R({ id: 'y-content-whole-page', text: 'probe-body-only-text', confidence: 10 }),
      R({ id: 'n-content-scripts-only', text: 'probe-body-only-text', checkScripts: true, confidence: 10 }),
      R({ id: 'y-content-scripts-only', text: 'probe-inline-text', checkScripts: true, confidence: 10 })
    ],
    payload: [
      R({ id: 'y-payload-post', text: 'probe_payload_token', methods: ['POST'] }),
      R({ id: 'n-payload-get', text: 'probe_payload_token', methods: ['GET'] }),
      R({ id: 'y-payload-url', text: 'probe_payload_token', urlPattern: '/api/collect' }),
      R({ id: 'n-payload-url', text: 'probe_payload_token', urlPattern: '/api/other' }),
      R({ id: 'y-payload-url-regex', text: 'probe_payload_token', urlPattern: '^https?://[^/]+/api/collect$', urlRegex: true }),
      R({ id: 'n-payload-url-regex-off', text: 'probe_payload_token', urlPattern: '^https?://[^/]+/api/collect$' }),
      R({ id: 'y-payload-url-case-off', text: 'probe_payload_token', urlPattern: '/API/COLLECT' }),
      R({ id: 'n-payload-url-case-on', text: 'probe_payload_token', urlPattern: '/API/COLLECT', urlCaseSensitive: true }),
      R({ id: 'y-payload-text-regex', text: 'probe_payload_token=[a-z0-9]+', textRegex: true }),
      R({ id: 'n-payload-text-regex-off', text: 'probe_payload_token=[a-z0-9]+' })
    ]
  },
  // A combination makes every rule its own condition, so two rules may match
  // the same cookie or payload (detectors without one count each value once)
  combinations: [{ id: 'per-rule', name: 'per-rule scoring', confidence: 50, when: { all: [{ pattern: 'y-url-regex' }, { pattern: 'y-cookie-value' }] } }]
};
const ALL_IDS = Object.values(DETECTOR.detection).flat().map(r => r.id);
const MUST = ALL_IDS.filter(id => id.startsWith('y-'));
const MUST_NOT = ALL_IDS.filter(id => id.startsWith('n-'));

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'methods-')), {
    headless: true, channel: 'chromium', args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`] });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await sleep(2500);

  // Install the probe detector the way a user-added rule is stored, then reload
  const admin = await ctx.newPage();
  await admin.goto(`chrome-extension://${extId}/popup.html`);
  await admin.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { timeout: 15000 }).catch(() => {});
  await admin.evaluate(async () => {
    const raw = (await chrome.storage.local.get('scrapfly_settings')).scrapfly_settings;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    const settings = parsed.settings || parsed;
    settings.detection = { ...(settings.detection || {}), cacheScope: 'full' };
    await chrome.storage.local.set({ scrapfly_settings: JSON.stringify({ timestamp: new Date().toISOString(), settings }) });
  });
  await admin.evaluate(async (det) => {
    const dm = window.popupInstance.detectorManager;
    if (!dm.initialized) await dm.initialize();
    await dm.addDetector('antibot', det.id, det);
    await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
  }, DETECTOR);
  await admin.close();
  await sleep(1500);

  async function run(url) {
    const page = await ctx.newPage();
    // Prime the cookie on another page (cache is keyed by full URL), so the
    // page under test gets a fresh detection whose own request carries it
    await page.goto(new URL('/prime', url).href, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    // A second navigation in the same tab sometimes never reports its load
    // events to Playwright (seen without the extension too): wait for the
    // response to commit, then give the page a fixed time to run
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    await sleep(9000);
    const tab = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find(t => t.url === u) || null, url);
    const popup = await ctx.newPage();
    await popup.addInitScript((t) => {
      const original = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = (info, cb) => { if (info && info.active) { if (cb) { cb([t]); return undefined; } return Promise.resolve([t]); } return original(info, cb); };
    }, tab);
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForFunction(() => window.popupInstance?.detection?.initialized, null, { timeout: 15000 }).catch(() => {});
    await sleep(3000);
    const results = await popup.evaluate(() => (window.popupInstance.detection.currentResults || []).map(d => ({
      name: d.detector?.name || d.name, confidence: d.confidence,
      matches: (d.matches || []).map(m => ({ type: m.type, id: m.patternId || m.description || null, desc: m.description || null }))
    })));
    await popup.close(); await page.close();
    return results;
  }

  const full = await run(`http://127.0.0.1:${port}/full`);
  const probe = full.find(d => d.name === 'Settings Probe');
  const seen = new Map();
  for (const m of probe?.matches || []) seen.set(m.desc || m.id, m.type);
  console.log(`Settings Probe on the full page: ${probe ? probe.confidence + '%' : 'NOT DETECTED'}`);
  let fail = 0;
  for (const id of MUST) {
    const ok = seen.has(id);
    if (!ok) fail++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(22)} ${ok ? 'matched as ' + seen.get(id) : 'NOT matched'}`);
  }
  for (const id of MUST_NOT) {
    const bad = seen.has(id);
    if (bad) fail++;
    console.log(`  ${bad ? 'FAIL' : 'PASS'}  ${id.padEnd(22)} ${bad ? 'matched but must not (setting ignored)' : 'correctly not matched'}`);
  }
  const clean = await run(`http://localhost:${port}/clean`);
  const cleanProbe = clean.find(d => d.name === 'Settings Probe');
    const cleanOk = !cleanProbe;
  if (!cleanOk) fail++;
  console.log(`\nClean page (other host): ${cleanOk ? 'PASS  no Settings Probe match' : 'FAIL  ' + JSON.stringify(clean.map(d => d.name))}`);
  console.log(`\nRESULT ${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}`);
  await ctx.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); server.close(); process.exit(2); });
