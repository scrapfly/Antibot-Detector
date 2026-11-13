#!/usr/bin/env node
/**
 * A page Chrome prerenders, end to end in the real extension (unpacked in Chromium): a local page asks for its next page with
 * speculation rules, Chromium prerenders it, and the page then goes to it, which shows the prerendered page in the tab.
 *
 *   Prerendered   the page shown is the prerendered one: it ran while hidden and has an activation time
 *   Hooks         its canvas calls, made while it was hidden, are found through the JS hooks
 *   Headers       its own response header (cf-mitigated, sent while it was hidden) is found, and its HTTP status kept
 *   Skipped site  a prerendered page of a skipped site keeps none of its headers in the worker, and is not scanned
 *
 * Chromium does not prerender a page DevTools is attached to (PrerenderingDisabledByDevTools), and Playwright attaches to
 * every page it can see. So this suite starts Playwright's Chromium itself and speaks the DevTools protocol only to the
 * extension's service worker and its popup, never to the page under test; the page tells the local server when it is shown.
 *
 * Not part of `npm run verify`: it needs Playwright's Chromium (npm run e2e:setup) and a Node with WebSocket (22 or later).
 *   node scripts/e2e-prerender.js [checkout]   (or node scripts/e2e-all.js --only prerender)
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}
if (typeof WebSocket !== 'function') {
  console.error('This suite needs a Node with a global WebSocket (22 or later)');
  process.exit(2);
}
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const args = process.argv.slice(2);
const REPO = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// The canvas calls are spelled in pieces, so no rule that reads the page's text can find them: only the JS hooks can. Once
// shown, the page tells the server whether it ran while hidden and when it was shown
const NEXT = (id) => `<!doctype html><html><head><title>Prerendered</title></head><body><p>the next page</p>
<canvas id="c" width="20" height="20"></canvas>
<script>
  const hidden = document.prerendering === true;
  const word = (...parts) => parts.join('');
  const c = document.getElementById('c'); const g = c.getContext('2d');
  g[word('fill', 'Text')]('probe', 2, 10); c[word('toData', 'URL')](); g[word('getImage', 'Data')](0, 0, 5, 5);
  const report = () => fetch('/shown?id=${id}&hidden=' + hidden + '&activation=' + performance.getEntriesByType('navigation')[0].activationStart);
  if (document.prerendering) document.addEventListener('prerenderingchange', report, { once: true }); else report();
</script></body></html>`;
// The start page asks for the next one and goes to it once the hidden page has loaded, reported and gone quiet
const START = (next) => `<!doctype html><html><head><title>Start</title>
<script type="speculationrules">{"prerender":[{"source":"list","urls":["${next}"],"eagerness":"immediate"}]}</script>
</head><body><p>start</p><script>setTimeout(() => { location.href = ${JSON.stringify(next)}; }, 6000);</script></body></html>`;

const prerendered = new Set();
const shown = new Map();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const html = { 'content-type': 'text/html', 'cache-control': 'no-store' };
  const id = url.searchParams.get('id') || '';
  if (url.pathname === '/start') { res.writeHead(200, html); return res.end(START(`/next?id=${id}`)); }
  if (url.pathname === '/next') {
    if (/prerender/.test(String(req.headers['sec-purpose'] || ''))) prerendered.add(id);
    res.writeHead(200, { ...html, 'cf-mitigated': 'challenge' });
    return res.end(NEXT(id));
  }
  if (url.pathname === '/shown') {
    shown.set(id, { hidden: url.searchParams.get('hidden') === 'true', activation: Number(url.searchParams.get('activation')) });
    res.writeHead(204); return res.end();
  }
  res.writeHead(404); res.end();
});

/** The DevTools protocol over the browser's own endpoint, with flat sessions: only targets this suite attaches to. */
function devtools(endpoint) {
  const socket = new WebSocket(endpoint);
  let nextId = 0;
  const pending = new Map();
  const listeners = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method) for (const listener of listeners) listener(message);
    const waiting = message.id !== undefined && pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(`${waiting.method}: ${message.error.message}`));
    else waiting.resolve(message.result);
  });
  const opened = new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  const send = async (method, params = {}, sessionId) => {
    await opened;
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  };
  const evaluate = async (sessionId, expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (exceptionDetails) throw new Error(`evaluate: ${exceptionDetails.exception?.description || exceptionDetails.text}`);
    return result.value;
  };
  return { send, evaluate, on: (listener) => listeners.push(listener), close: () => socket.close() };
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-prerender-'));
  let browser;
  let cdp;
  try {
    browser = spawn(chromium.executablePath(), ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
      '--disable-background-networking', '--disable-component-update', '--disable-component-extensions-with-background-pages',
      '--disable-features=DisableLoadExtensionCommandLineSwitch', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
      `--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`, 'about:blank'], { stdio: 'ignore' });
    const waitFor = async (check, what, timeout = 30000) => {
      const end = Date.now() + timeout;
      for (;;) {
        const value = await check();
        if (value) return value;
        if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
        await sleep(250);
      }
    };
    const portFile = path.join(profile, 'DevToolsActivePort');
    await waitFor(() => fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').split('\n').length >= 2, 'Chromium to start');
    const [devtoolsPort, devtoolsPath] = fs.readFileSync(portFile, 'utf8').split('\n');
    cdp = devtools(`ws://127.0.0.1:${devtoolsPort}${devtoolsPath}`);

    const attach = async (targetId) => {
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
      return sessionId;
    };
    // Chromium runs extensions of its own too (some with a background.js): this checkout's is the one with its manifest
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
    const workerTarget = await waitFor(async () => {
      for (const target of (await cdp.send('Target.getTargets')).targetInfos) {
        if (target.type !== 'service_worker' || !target.url.startsWith('chrome-extension://')) continue;
        const session = await attach(target.targetId);
        const seen = await cdp.evaluate(session, "JSON.stringify([chrome.runtime.getManifest().version, typeof WorkerMessages, typeof prerenderPages])").catch(() => '');
        if (seen === JSON.stringify([manifest.version, 'object', 'object'])) return { target, session };
        await cdp.send('Target.detachFromTarget', { sessionId: session }).catch(() => {});
      }
      return null;
    }, 'the extension\'s service worker');
    const extensionId = new URL(workerTarget.target.url).host;
    const worker = workerTarget.session;
    await cdp.evaluate(worker, 'UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); true');
    const inWorker = (fn, ...values) => cdp.evaluate(worker, `(${fn})(...${JSON.stringify(values)})`);

    // Settings through the popup, the way a person changes them (the worker is the settings' only writer)
    const { targetId: popupTarget } = await cdp.send('Target.createTarget', { url: `chrome-extension://${extensionId}/popup.html` });
    const popup = await attach(popupTarget);
    await waitFor(() => cdp.evaluate(popup, '!!(window.popupInstance && window.popupInstance.settings && window.popupInstance.settings.settingsBaseline)'), 'the popup');
    const patch = (value) => cdp.evaluate(popup, `StorageManager.patchSettings(${JSON.stringify(value)})`);
    // The worker answers the popup: it runs this checkout's code (its message names match the popup's)
    assert.equal(await cdp.evaluate(popup, 'WorkerVersion.isOutdated((m) => chrome.runtime.sendMessage(m), WorkerMessages)'), false, 'the worker answers');
    const inPopup = (fn, ...values) => cdp.evaluate(popup, `(${fn})(...${JSON.stringify(values)})`);
    const entryOf = (url) => inPopup(async (u) => {
      const stored = (await chrome.storage.local.get('scrapfly_detection_storage')).scrapfly_detection_storage || {};
      const entry = Object.values(stored).find(item => item && item.url === u);
      return entry ? {
        httpStatus: entry.httpStatus ?? null,
        evidence: Object.fromEntries((entry.detectionResults || []).map(d => [d.detector && d.detector.name, [...new Set((d.matches || []).map(m => m.type))]]))
      } : null;
    }, url);
    assert.equal(await patch({ detection: { cacheScope: 'full', scanMode: 'blocklist', blacklistedDomains: [], allowedDomains: [], hooksOffDomains: [] }, debugMode: false }), true);
    await sleep(1500);

    // Opens /start in a tab of its own (no DevTools on it) and waits until the prerendered next page was shown there
    const prerenderAndShow = async (host, id) => {
      await cdp.send('Target.createTarget', { url: `http://${host}:${port}/start?id=${id}` });
      await waitFor(() => prerendered.has(id), 'Chromium to prerender the next page', 15000);
      const report = await waitFor(() => shown.get(id), 'the next page to be shown', 20000);
      return { report, url: `http://${host}:${port}/next?id=${id}` };
    };

    // 1. The page shown is the prerendered one; its hooks and headers are found
    const first = await prerenderAndShow('127.0.0.1', 'p1');
    assert.ok(first.report.hidden && first.report.activation > 0, `the page was prerendered, then shown: ${JSON.stringify(first.report)}`);
    console.log('PASS Prerendered: Chromium prerendered the next page, which ran hidden and was then shown');
    const entry = await waitFor(() => entryOf(first.url), `the scan of ${first.url}`);
    assert.ok(Object.entries(entry.evidence).some(([name, types]) => /canvas/i.test(name || '') && types.includes('js_hooks')),
      `the canvas calls made while hidden are found through the JS hooks: ${JSON.stringify(entry.evidence)}`);
    console.log('PASS Hooks: the canvas calls the page made while hidden are found through the JS hooks');
    assert.ok((entry.evidence['Cloudflare Bot Management'] || []).includes('header'), `the page's own response header is found: ${JSON.stringify(entry.evidence)}`);
    assert.equal(entry.httpStatus, 200, 'the page\'s own HTTP status is kept');
    console.log('PASS Headers: the response header of its hidden load is found, with its HTTP status');

    // 2. A skipped site: its prerendered page keeps nothing in the worker and is not scanned
    assert.equal(await patch({ detection: { blacklistedDomains: ['localhost'] } }), true);
    await sleep(1500);
    const skipped = await prerenderAndShow('localhost', 'p2');
    assert.ok(skipped.report.hidden && skipped.report.activation > 0, `prerendered, then shown: ${JSON.stringify(skipped.report)}`);
    await sleep(3000);
    const kept = await inWorker(() => {
      const ofLocalhost = (store) => [...store.values()].filter(item => item && /\/\/localhost[:/]/.test(item.url)).length;
      return { prerendered: [...prerenderPages.values()].flat().length, headers: ofLocalhost(headersStore), cookies: ofLocalhost(responseCookiesStore), request: ofLocalhost(requestHeadersStore) };
    });
    assert.deepEqual(kept, { prerendered: 0, headers: 0, cookies: 0, request: 0 }, `nothing of a skipped site is kept: ${JSON.stringify(kept)}`);
    assert.equal(await entryOf(skipped.url), null, 'and it is not scanned');
    console.log('PASS Skipped site: a prerendered page of a skipped site keeps none of its headers in the worker, and is not scanned');

    console.log('ALL PASS e2e-prerender');
  } catch (error) {
    console.error('FAIL', error && error.stack || error);
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    if (browser) browser.kill('SIGKILL');
    server.close();
    await sleep(500);
    fs.rmSync(profile, { recursive: true, force: true });
  }
})();
