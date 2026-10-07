#!/usr/bin/env node
/**
 * Every detection method, end to end, in the real extension (unpacked in
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
 *   npm run e2e:methods
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
const DETECTOR = {
  id: 'detect-methodprobe', name: 'Method Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Low',
  version: '1.0.0', lastUpdated: '2026-10-06', icon: 'custom.png', description: 'one rule per detection method',
  detection: {
    url: [R({ id: 'm-url', text: '^https?://[^/?#]+/probe-url-marker\\.js(?:[?#]|$)', textRegex: true, textScope: 'all' })],
    cookie: [
      R({ id: 'm-cookie-request', name: '^probe_doc_cookie$', nameRegex: true, nameScope: 'request', valueScope: 'request' }),
      R({ id: 'm-cookie-response', name: '^probe_resp_cookie$', nameRegex: true, nameScope: 'response', valueScope: 'response' }),
      R({ id: 'g-cookie-js-as-response', name: '^probe_doc_cookie$', nameRegex: true, nameScope: 'response', valueScope: 'response' })
    ],
    header: [
      R({ id: 'm-header-response', name: '^x-probe-resp$', nameRegex: true, value: '^resp-ok$', valueRegex: true, nameScope: 'response', valueScope: 'response' }),
      R({ id: 'm-header-request', name: '^cookie$', nameRegex: true, value: 'probe_resp_cookie=1', nameScope: 'request', valueScope: 'request' }),
      R({ id: 'g-header-resp-as-request', name: '^x-probe-resp$', nameRegex: true, nameScope: 'request', valueScope: 'request' })
    ],
    content: [
      R({ id: 'm-content-inline', text: 'probe-inline-text', scope: 'scripts', checkScripts: true, confidence: 10 }),
      R({ id: 'm-content-external', text: 'probeExternalMarker', scope: 'scripts', checkScripts: true, confidence: 10 }),
      R({ id: 'g-content-body-as-script', text: 'probe-body-only-text', scope: 'scripts', checkScripts: true, confidence: 10 })
    ],
    dom: [R({ id: 'm-dom', selector: '#probe-dom[data-probe]' })],
    window: [R({ id: 'm-window', path: 'probeGlobal.ready', condition: 'truthy' })],
    payload: [R({ id: 'm-payload', text: 'probe_payload_token=', urlPattern: '/api/collect', methods: ['POST'] })]
  },
  combinations: [{ id: 'm-combo', name: 'url + response header', confidence: 90, when: { all: [{ pattern: 'm-url' }, { pattern: 'm-header-response' }] } }]
};
const MUST = ['m-url', 'm-cookie-request', 'm-cookie-response', 'm-header-response', 'm-header-request', 'm-content-inline', 'm-content-external', 'm-dom', 'm-window', 'm-payload'];
const MUST_NOT = ['g-cookie-js-as-response', 'g-header-resp-as-request', 'g-content-body-as-script'];

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

  // prime: set the probe cookie on the host first. Never for the clean page,
  // whose host must carry no signal at all (the cookie would be one)
  async function run(url, { prime = true } = {}) {
    const page = await ctx.newPage();
    // Prime the cookie on another page (cache is keyed by full URL), so the
    // page under test gets a fresh detection whose own request carries it
    if (prime) {
      await page.goto(new URL('/prime', url).href, { waitUntil: 'domcontentloaded' });
      await sleep(1500);
    }
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
  const probe = full.find(d => d.name === 'Method Probe');
  const seen = new Map();
  for (const m of probe?.matches || []) seen.set(m.desc || m.id, m.type);
  console.log(`Method Probe on the full page: ${probe ? probe.confidence + '%' : 'NOT DETECTED'}`);
  let fail = 0;
  for (const id of MUST) {
    const ok = seen.has(id);
    if (!ok) fail++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(22)} ${ok ? 'matched as ' + seen.get(id) : 'NOT matched'}`);
  }
  for (const id of MUST_NOT) {
    const bad = seen.has(id);
    if (bad) fail++;
    console.log(`  ${bad ? 'FAIL' : 'PASS'}  ${id.padEnd(22)} ${bad ? 'matched but must not (scope is fake)' : 'correctly not matched'}`);
  }
  const comboOk = probe && probe.confidence >= 90;
  if (!comboOk) fail++;
  console.log(`  ${comboOk ? 'PASS' : 'FAIL'}  combination (url + response header) reaches its 90% tier`);
  const canvas = full.find(d => /canvas/i.test(d.name || ''));
  const hookOk = canvas && canvas.matches.some(m => m.type === 'js_hooks');
  if (!hookOk) fail++;
  console.log(`  ${hookOk ? 'PASS' : 'FAIL'}  js_hooks: Canvas Fingerprint ${canvas ? canvas.confidence + '% via ' + [...new Set(canvas.matches.map(m => m.type))].join(',') : 'not detected'}`);

  const clean = await run(`http://localhost:${port}/clean`, { prime: false });
  const cleanProbe = clean.find(d => d.name === 'Method Probe');
  const cleanCanvas = clean.find(d => /canvas/i.test(d.name || ''));
  const cleanOk = !cleanProbe && !cleanCanvas;
  if (!cleanOk) fail++;
  console.log(`\nClean page (other host): ${cleanOk ? 'PASS  no Method Probe, no Canvas Fingerprint' : 'FAIL  ' + JSON.stringify(clean.map(d => d.name))}`);
  console.log(`\nRESULT ${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}`);
  await ctx.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); server.close(); process.exit(2); });
