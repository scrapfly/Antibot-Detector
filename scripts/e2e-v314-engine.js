#!/usr/bin/env node
/**
 * The 3.1.4 engine fixes end to end, in the real extension (unpacked in Chromium):
 *
 *   E-03  Same-text URL rules   two URL rules with the same text (a copy with another confidence) both match a script address:
 *                               two matches, the stronger rule's confidence wins
 *   E-08  DOM rule on 300 links one match for the rule with its count in the value, not 300 matches in the saved result
 *   E-11  Rules switched off    a rule with its own `enabled: false` (content, DOM, URL) matches nothing; its sibling does
 *   E-07  Page text, styles     a stylesheet is not downloaded a second time by the scan when no content rule reads it (the
 *                               page's server sees one request, not two); a "Page content" rule brings the second one back, and
 *                               finds a marker that is only in the stylesheet and one that is only in the page text
 *   E-12  Extension switched off  the page's frame accessors and the recorders put into a frame are not left on a page loaded
 *                               while the extension is off
 *   F1    Unreadable settings   settings stored as text that is not JSON: the page is not scanned; readable again, it is
 *
 * A local site serves the pages and throwaway user rules (added through the Rules code, as the popup does) recognise them, so the
 * scans are real.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup && npm run e2e:all -- --only v314-engine
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
const TIMES = '×';

// ---- Local site ---------------------------------------------------------------------------------
const loads = {};      // page name -> how many times the server sent the page
const cssHits = {};    // page name -> how many times the server sent its stylesheet
const CSS_MARKER = 'E07-CSS-ONLY-MARKER';
const BODY_MARKER = 'E07-BODY-ONLY-MARKER';
const LINKS = 300;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const name = url.searchParams.get('n') || 'page';
  const html = (body, head = '') => {
    loads[name] = (loads[name] || 0) + 1;
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    res.end(`<!doctype html><html><head><title>Engine ${name}</title>${head}</head><body>${body}</body></html>`);
  };
  switch (url.pathname) {
    case '/s1': // two scripts' worth of the same address: the script tag the two rules read
      return html('<p>same-text rules</p>', `<script src="/e03-probe.js?n=${name}"></script>`);
    case '/s2':
      return html(Array.from({ length: LINKS }, (_, i) => `<a href="/link-${i}">link ${i}</a>`).join('\n'));
    case '/s3':
      return html('<div id="e11-off"></div><div id="e11-on"></div>',
        `<script>var a = 'E11-OFF-INLINE'; var b = 'E11-ON-INLINE';</script><script src="/e11-off.js?n=${name}"></script><script src="/e11-on.js?n=${name}"></script>`);
    case '/css':
      return html(`<p>${BODY_MARKER}</p>`, `<link rel="stylesheet" href="/style.css?n=${name}">`);
    case '/style.css':
      cssHits[name] = (cssHits[name] || 0) + 1;
      res.writeHead(200, { 'content-type': 'text/css', 'cache-control': 'no-store' });
      return res.end(`/* ${CSS_MARKER} */ body { margin: 0; }`);
    case '/off':
      return html('<p>a page with a frame</p><iframe id="child" src="/frame"></iframe>');
    case '/frame':
      return html('<p>the frame</p>');
    case '/f1':
      return html('<p>settings</p><script>var marker = "F1-ENGINE-MARKER";</script>');
    case '/e03-probe.js': case '/e11-off.js': case '/e11-on.js':
      res.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' });
      return res.end('');
    default:
      res.writeHead(404); return res.end();
  }
});

const probe = (id, name, detection) => ({
  id, name, author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium', version: '1.0.0', lastUpdated: '2026-11-06',
  icon: 'custom.png', description: name, detection
});
const SAME = probe('detect-v314same', 'V314 Same Text', { url: [
  { id: 'weak', text: '/e03-probe.js', confidence: 40, textScope: 'all', standalone: true },
  { id: 'strong', text: '/e03-probe.js', confidence: 90, textScope: 'all', standalone: true }
] });
const LINKS_RULE = probe('detect-v314links', 'V314 Links', { dom: [{ id: 'links', selector: 'a[href]', confidence: 60, standalone: true }] });
const OFF = probe('detect-v314off', 'V314 Rules Off', {
  content: [
    { id: 'c-off', text: 'E11-OFF-INLINE', scope: 'scripts', confidence: 70, standalone: true, enabled: false },
    { id: 'c-on', text: 'E11-ON-INLINE', scope: 'scripts', confidence: 55, standalone: true }
  ],
  dom: [
    { id: 'd-off', selector: 'div#e11-off', confidence: 70, standalone: true, enabled: false },
    { id: 'd-on', selector: 'div#e11-on', confidence: 55, standalone: true }
  ],
  url: [
    { id: 'u-off', text: '/e11-off.js', confidence: 70, textScope: 'all', standalone: true, enabled: false },
    { id: 'u-on', text: '/e11-on.js', confidence: 55, textScope: 'all', standalone: true }
  ]
});
const STYLE_URL_RULE = probe('detect-v314styleurl', 'V314 Stylesheet Address', { url: [{ id: 'style-url', text: '/style.css', confidence: 70, textScope: 'all', standalone: true }] });
const PAGE_TEXT = probe('detect-v314pagetext', 'V314 Page Content', { content: [
  { id: 'css-marker', text: CSS_MARKER, confidence: 90, standalone: true },
  { id: 'body-marker', text: BODY_MARKER, confidence: 85, standalone: true }
] });
const F1_RULE = probe('detect-v314f1', 'V314 Settings Probe', { content: [{ id: 'f1-marker', text: 'F1-ENGINE-MARKER', scope: 'scripts', confidence: 90, standalone: true }] });

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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-engine-'));
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
    return sw.evaluate(fn, arg);
  }
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
  /** The page's saved result under the key of one scope, or null. */
  const entryFor = (url, scope = 'full') => W(async ({ u, s }) => {
    let storage = (await chrome.storage.local.get(DetectionEngineManager.STORAGE_KEY))[DetectionEngineManager.STORAGE_KEY] || {};
    if (typeof storage === 'string') storage = JSON.parse(storage);
    return storage[UrlUtils.hashUrl(u, s)] || null;
  }, { u: url, s: scope });
  const stampOf = async (url) => ((await entryFor(url)) || {}).timestamp || 0;
  const detectionOf = (entry, id) => ((entry && entry.detectionResults) || []).find(d => ((d.detector && d.detector.id) || d.id) === id) || null;
  const idsOf = (entry) => ((entry && entry.detectionResults) || []).map(d => (d.detector && d.detector.id) || d.id);
  let counter = 0;
  const uniq = () => `${Date.now().toString(36)}${counter++}`;

  /** What the Rules tab does when a rule is added: save it, then tell the worker to reload (rules.js). */
  async function addRules(...detectors) {
    const admin = await openExtensionPage();
    try {
      await admin.evaluate(async (list) => {
        for (const detector of list) await window.popupInstance.detectorManager.addDetector('antibot', detector.id, detector);
        await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
      }, detectors);
    } finally {
      await admin.close();
    }
    await sleep(1500);
  }
  /** Visit a page and wait until its result is saved; the page stays open. */
  async function scanned(pathAndQuery) {
    const url = `${origin}${pathAndQuery}`;
    const page = await open(url);
    await until(() => stampOf(url), 30000, `the saved result of ${url}`);
    return { page, url };
  }

  // ---- Start-up: the probe rules (none of them reads the page text), English, the full address as cache key
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  await addRules(SAME, LINKS_RULE, OFF, STYLE_URL_RULE, F1_RULE);
  assert.ok(await patchSettings({ detection: { cacheScope: 'full' } }), 'the address is the cache key');
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

  // ===============================================================================================
  await scenario('E-03 two URL rules with the same text both match a script address, and the stronger one keeps its confidence', async () => {
    const { page, url } = await scanned(`/s1?n=e03-${uniq()}`);
    const found = detectionOf(await entryFor(url), SAME.id);
    assert.ok(found, 'the probe is on the page\'s result');
    const urlMatches = found.matches.filter(m => m.type === 'url');
    assert.deepEqual(urlMatches.map(m => m.confidence).sort((a, b) => a - b), [40, 90], 'one match per rule');
    assert.equal(found.confidence, 90, 'the stronger rule decides');
    await page.close();
  });

  // ===============================================================================================
  await scenario(`E-08 a DOM rule on ${LINKS} links is one match with the number in its value, not ${LINKS} matches`, async () => {
    const { page, url } = await scanned(`/s2?n=e08-${uniq()}`);
    const entry = await entryFor(url);
    const found = detectionOf(entry, LINKS_RULE.id);
    assert.ok(found, 'the probe is on the page\'s result');
    const dom = found.matches.filter(m => m.type === 'dom');
    assert.equal(dom.length, 1, `${dom.length} DOM matches in the saved result`);
    // A saved match keeps type, pattern, value and confidence (not the selector): the value starts with it
    assert.equal(dom[0].value, `a[href]= ${TIMES}${LINKS}`);
    assert.equal(found.confidence, 60);
    console.log(`      the saved detection is ${JSON.stringify(found).length} bytes`);
    assert.ok(JSON.stringify(found).length < 3000);
    await page.close();
  });

  // ===============================================================================================
  await scenario('E-11 a rule with enabled: false matches nothing (content, DOM, URL), the rule beside it does', async () => {
    const stored = await W(async (id) => {
      const detectors = (await chrome.storage.local.get('scrapfly_detectors')).scrapfly_detectors.detectors;
      return Object.values(detectors).map(category => category[id]).find(Boolean);
    }, OFF.id);
    assert.equal(stored.detection.content[0].enabled, false, 'the saved rule still says it is off');
    const { page, url } = await scanned(`/s3?n=e11-${uniq()}`);
    const found = detectionOf(await entryFor(url), OFF.id);
    assert.ok(found, 'the rules that are on found the page');
    // A saved DOM match has no pattern: its value is "<selector>=<text>"
    const seen = found.matches.map(m => `${m.type}:${m.pattern || String(m.value).split('=')[0]}`).sort();
    assert.deepEqual(seen, ['content:E11-ON-INLINE', 'dom:div#e11-on', 'url:/e11-on.js']);
    assert.equal(found.confidence, 55, 'the rules that are off do not score');
    await page.close();
  });

  // ===============================================================================================
  await scenario('E-07 a stylesheet is downloaded once, by the page, when no content rule reads its text; a page-content rule brings the scan\'s own download back', async () => {
    // Only bundled rules (all limited to scripts) and probes that read no page text are loaded
    const a = `e07-a-${uniq()}`;
    const first = await scanned(`/css?n=${a}`);
    await sleep(1500); // a late second request would be here by now
    assert.equal(cssHits[a], 1, `the stylesheet was requested ${cssHits[a]} times: the page's own request only`);
    const entryA = await entryFor(first.url);
    const styleRule = detectionOf(entryA, STYLE_URL_RULE.id);
    assert.ok(styleRule, 'a URL rule on the stylesheet\'s address still matches');
    assert.ok(styleRule.matches.some(m => m.type === 'url' && /\/style\.css/.test(m.fullUrl || m.value)));
    assert.equal(detectionOf(entryA, PAGE_TEXT.id), null, 'no page-content rule is loaded yet');
    await first.page.close();

    await addRules(PAGE_TEXT);
    const b = `e07-b-${uniq()}`;
    const second = await scanned(`/css?n=${b}`);
    await sleep(1500);
    assert.equal(cssHits[b], 2, `the stylesheet was requested ${cssHits[b]} times: the page's and the scan's`);
    const found = detectionOf(await entryFor(second.url), PAGE_TEXT.id);
    assert.ok(found, 'the page-content rule found the page');
    // A saved match does not keep where it was found; each marker is in one place only
    const patterns = found.matches.filter(m => m.type === 'content').map(m => m.pattern);
    assert.ok(patterns.includes(CSS_MARKER), 'the marker that is only in the stylesheet');
    assert.ok(patterns.includes(BODY_MARKER), 'the marker that is only in the page text');
    await second.page.close();
  });

  // ===============================================================================================
  await scenario('E-12 a page loaded while the extension is off keeps no frame accessor and no recorder in its frames', async () => {
    const wrapped = (page) => page.evaluate(() => {
      const through = (fn) => {
        try { fn(); } catch (e) { return /chrome-extension:\/\//.test(String(e && e.stack)); }
        return null;
      };
      const getter = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow').get;
      const frame = document.getElementById('child');
      const child = frame.contentWindow;
      return {
        accessor: through(() => getter.call({})),
        childRecorder: child ? through(() => child.HTMLCanvasElement.prototype.toDataURL.call({})) : 'no child window'
      };
    });
    await W(() => chrome.storage.local.set({ scrapfly_enabled: false }));
    try {
      await sleep(500);
      const page = await open(`${origin}/off?n=e12-${uniq()}`);
      await page.waitForFunction(() => document.getElementById('child') && document.getElementById('child').contentDocument && document.getElementById('child').contentDocument.readyState === 'complete', null, { timeout: 15000 });
      await sleep(2500); // the install event reaches the page's world within tens of milliseconds
      const seen = await wrapped(page);
      console.log(`      with the extension off: ${JSON.stringify(seen)}`);
      assert.deepEqual(seen, { accessor: false, childRecorder: false }, 'nothing of the extension is left on the page or in its frame');
      await page.close();
    } finally {
      await W(() => chrome.storage.local.set({ scrapfly_enabled: true }));
      await sleep(500);
    }
  });

  // ===============================================================================================
  await scenario('F1 settings stored as text that is not JSON: the page is not scanned; readable again, it is', async () => {
    const original = await W(async () => (await chrome.storage.local.get('scrapfly_settings')).scrapfly_settings);
    // SettingsStore saves them as JSON text (a wrapper with the settings and a timestamp)
    assert.ok(typeof original === 'string' && JSON.parse(original).settings, 'the settings are saved and readable');
    const first = `${origin}/f1?n=f1-${uniq()}`;
    let broken;
    await W(() => chrome.storage.local.set({ scrapfly_settings: '{"detection": {"blacklistedDomains": ["127.0.0.1"' }));
    try {
      broken = await W(async () => (await chrome.storage.local.get('scrapfly_settings')).scrapfly_settings);
      assert.equal(typeof broken, 'string', 'the settings are still the broken text');
      const page = await open(first);
      await sleep(9000); // a scan takes a few seconds
      assert.equal(await entryFor(first), null, 'nothing was scanned on a guess');
      await page.close();
    } finally {
      await W((value) => chrome.storage.local.set({ scrapfly_settings: value }), original);
    }
    const second = `${origin}/f1?n=f1-${uniq()}`;
    const page = await open(second);
    await until(() => stampOf(second), 30000, 'a scan once the settings can be read');
    assert.ok(idsOf(await entryFor(second)).includes(F1_RULE.id), 'and it finds the page');
    await page.close();
  });

  // ---- Report -------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${pageErrors.join('\n  ')}`);
  console.log(`\nRESULT ${failed.length || pageErrors.length ? 'FAILED' : 'ALL PASS'} (${results.length} scenarios, ${failed.length} failed)`);
  await ctx.close();
  server.close();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
