#!/usr/bin/env node
/**
 * The 3.1.3 engine fixes end to end, in the real extension (unpacked in Chromium):
 *
 *   F-9  Cache-hit flag   the page's own window carries no trace of the extension on a scanned load and on a cache hit,
 *                         while a second visit is still answered from the saved result
 *   F-1  Rule changes     a saved result survives nothing that changes the rules: switching a rule off, then on, makes the
 *                         next visit a scan, and the page no longer shows the card of the rule that was switched off
 *   F-6  Clear cache      History's request names the scope the entry was recorded under (Path); the result was saved under
 *                         the Domain key: the request clears it and the next visit is scanned
 *   F-8  DOM rules        a rule on a script in the <head> and one on an inline script's attribute match a real page
 *   F-9b Page footprint   the page's window, document and events with the extension against the same page in a Chromium
 *                         without it, on a scanned load and on a cache hit; the JS API adds its documented global only when on
 *
 * A local site serves the pages and throwaway user rules (added through the Rules code, as the popup does) recognise them, so
 * the scans are real.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup && npm run e2e:all -- --only v313-engine
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
const FLAG = '__scrapflyCacheHitEarlyExit';

// ---- Local site ---------------------------------------------------------------------------------
const MARKER = 'v313-engine-marker-bot';
const loads = {}; // page name -> how many times the server sent it

/**
 * A page that records, from its own first script (before anything else of the page runs), what it can see of the extension: its
 * window's own names and symbols at start, on load and later (while the hooks and the window checks run, and after), the bridge
 * events it could hear, the extension's public JS API events, the frames an error thrown through a wrapped member shows (a gap that is
 * reported, not asserted: the wrappers' own frames name the extension's script), and its document's own
 * names, root attributes and element count. The same page is loaded with and without the extension and the records are compared.
 */
const auditPage = (name) => `<!doctype html><html><head><title>Audit ${name}</title>
<script>
(function () {
  var snap = function () { return { names: Object.getOwnPropertyNames(window), symbols: Object.getOwnPropertySymbols(window).map(String) }; };
  var heard = [];
  ['scrapfly-bridge-init', 'scrapfly-isolated-bridge-message', 'scrapfly-main-bridge-message', 'scrapfly-install-hooks'].forEach(function (type) {
    window.addEventListener(type, function () { heard.push(type); }, true);
    window.addEventListener(type, function () { heard.push(type + ' (bubble)'); });
    document.addEventListener(type, function () { heard.push(type + ' (document)'); }, true);
  });
  var api = [];
  ['ready', 'onStart', 'onProgress', 'onDetection', 'onError', 'onHooksComplete', 'onWindowPropsComplete'].forEach(function (n) {
    window.addEventListener('scrapfly:' + n, function () { api.push(n); });
  });
  // An error thrown by a hooked member (a getter called on a foreign object) shows the frames of the script that wraps it
  var frames = function () {
    var found = [];
    var probes = [function () { HTMLCanvasElement.prototype.toDataURL.call({}); }, function () { Function.prototype.toString.call({}); }];
    ['userAgent', 'platform', 'hardwareConcurrency', 'deviceMemory', 'languages'].forEach(function (key) {
      var descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, key);
      if (descriptor && descriptor.get) probes.push(function () { descriptor.get.call({}); });
    });
    probes.forEach(function (probe) {
      try { probe(); } catch (e) {
        var lines = String(e && e.stack).split('\\n').filter(function (line) { return line.indexOf('chrome-extension://') !== -1; });
        if (lines.length) found.push(lines[0].trim());
      }
    });
    return found;
  };
  // A getter the page defines on a path the extension's window checks poll (bmak, Akamai's) runs when they read it, and its own
  // error stack shows who is reading
  var getterFrames = [];
  Object.defineProperty(window, 'bmak', { configurable: true, get: function () {
    var lines = String(new Error().stack).split('\\n').filter(function (line) { return line.indexOf('chrome-extension://') !== -1; });
    if (lines.length) getterFrames.push(lines[0].trim());
  } });
  var audit = { times: { start: snap() }, heard: heard, api: api, frames: { start: frames() }, getterFrames: getterFrames };
  window.addEventListener('load', function () { audit.times.load = snap(); });
  [1500, 4000, 9000].forEach(function (ms) {
    setTimeout(function () {
      audit.times['t' + ms] = snap();
      if (ms === 1500) audit.frames.t1500 = frames();
      if (ms === 9000) {
        audit.getterReads = getterFrames.length;
        audit.doc = { names: Object.getOwnPropertyNames(document), symbols: Object.getOwnPropertySymbols(document).map(String),
          htmlAttrs: document.documentElement.getAttributeNames(), elements: document.getElementsByTagName('*').length };
      }
    }, ms);
  });
  window.__audit = audit;
})();
</script></head><body><p>${MARKER}</p></body></html>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const name = url.searchParams.get('n') || 'page';
  if (url.pathname === '/p') {
    loads[name] = (loads[name] || 0) + 1;
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(`<!doctype html><html><head><title>Engine ${name}</title></head><body><p>${MARKER}</p><p>probe page</p></body></html>`);
  }
  if (url.pathname === '/h') {
    // The scripts DOM rules name sit in the head: a connector tag with its attribute, and an inline script with a marker
    loads[name] = (loads[name] || 0) + 1;
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(`<!doctype html><html><head><title>Head ${name}</title>
<script src="/empty.js" data-queueit-c="e2ecustomer"></script>
<script type="text/javascript" r="m">window.__engineInline = 'INLINE-SECRET-TEXT';</script>
</head><body><p>scripts in the head</p></body></html>`);
  }
  if (url.pathname === '/audit') {
    loads[name] = (loads[name] || 0) + 1;
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(auditPage(name));
  }
  if (url.pathname === '/empty.js') {
    res.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' });
    return res.end('');
  }
  res.writeHead(404); res.end();
});

const PROBE = {
  id: 'detect-v313probe', name: 'V313 Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium',
  version: '1.0.0', lastUpdated: '2026-11-05', icon: 'custom.png', description: 'Engine probe',
  detection: { content: [{ id: 'v313-marker', text: MARKER, confidence: 90, standalone: true, description: 'marker' }] }
};
const DOM_PROBE = {
  id: 'detect-v313dom', name: 'V313 DOM Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium',
  version: '1.0.0', lastUpdated: '2026-11-05', icon: 'custom.png', description: 'DOM probe',
  detection: { dom: [
    { id: 'head-connector', selector: 'script[data-queueit-c="e2ecustomer"]', confidence: 90, standalone: true, description: 'a script in the head' },
    { id: 'inline-marker', selector: 'script[r="m"]', confidence: 85, standalone: true, description: 'an inline script' }
  ] }
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v313-engine-'));
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
  const tabIdOf = (url) => W(async (u) => (await chrome.tabs.query({})).find(t => t.url === u)?.id, url);
  const titleOf = (tabId) => W((id) => chrome.action.getTitle({ tabId: id }), tabId);
  /** The page's saved result under the key of one scope, or null. */
  const entryFor = (url, scope) => W(async ({ u, s }) => {
    let storage = (await chrome.storage.local.get(DetectionEngineManager.STORAGE_KEY))[DetectionEngineManager.STORAGE_KEY] || {};
    if (typeof storage === 'string') storage = JSON.parse(storage);
    return storage[UrlUtils.hashUrl(u, s)] || null;
  }, { u: url, s: scope });
  const stampOf = async (url, scope = 'full') => ((await entryFor(url, scope)) || {}).timestamp || 0;
  /** The worker marks a tab whose page was answered from the saved result (the early cache check), at once. */
  const answeredFromCache = (tabId) => W((id) => tabsUsingCache.has(id), tabId);
  const rulesRev = () => W(async () => (await chrome.storage.local.get('scrapfly_rules_rev')).scrapfly_rules_rev || 0);
  const detectorIds = (entry) => ((entry && entry.detectionResults) || []).map(d => (d.detector && d.detector.id) || d.id);
  let counter = 0;
  const uniq = () => `${Date.now().toString(36)}${counter++}`;

  /** What the Rules tab does when a rule is switched on or off: save, then tell the worker to reload (rules.js). */
  async function setEnabled(id, enabled) {
    const admin = await openExtensionPage();
    try {
      await admin.evaluate(async ({ id, enabled }) => {
        const manager = window.popupInstance.detectorManager;
        manager.getDetector('antibot', id).enabled = enabled;
        await manager.saveDetectorsToStorage();
        await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
      }, { id, enabled });
    } finally {
      await admin.close();
    }
  }

  // ---- Start-up: the probe rules, English, the full address as cache key --------------------------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  const admin = await openExtensionPage();
  await admin.evaluate(async ({ probe, dom }) => {
    await window.popupInstance.detectorManager.addDetector('antibot', probe.id, probe);
    await window.popupInstance.detectorManager.addDetector('antibot', dom.id, dom);
    await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
  }, { probe: PROBE, dom: DOM_PROBE });
  await admin.close();
  await sleep(1500);
  await patchSettings({ detection: { cacheScope: 'full' }, history: { historyEnabled: true, historyBypassCache: true } });
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

  /** Visit a page and wait until its result is saved; the page stays open. */
  async function scanned(pathAndQuery, scope = 'full') {
    const url = `${origin}${pathAndQuery}`;
    const page = await open(url);
    await until(() => stampOf(url, scope), 30000, `the saved result of ${url}`);
    return { page, url };
  }
  /** Visit a page again and say whether the saved result answered (it keeps its time) or a scan replaced it. */
  async function revisit(page, url, scope = 'full') {
    const before = await stampOf(url, scope);
    const name = new URL(url).searchParams.get('n');
    const loadsBefore = loads[name];
    await page.goto(url, { waitUntil: 'commit' });
    await until(() => loads[name] > loadsBefore, 10000, 'the next visit');
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    return before;
  }

  // ===============================================================================================
  await scenario('F-9 the page\'s window has no trace of a cache hit: the flag is absent on a scan and on a hit, and the hit still skips the scan', async () => {
    const { page, url } = await scanned(`/p?n=flag-${uniq()}`);
    const tabId = await tabIdOf(url);
    const seen = () => page.evaluate((flag) => ({ value: window[flag], has: flag in window, own: Object.getOwnPropertyNames(window).includes(flag) }), FLAG);
    assert.deepEqual(await seen(), { value: undefined, has: false, own: false }, 'a scanned load');

    const first = await stampOf(url);
    await revisit(page, url);
    // The saved result answers: the worker marks the tab and the toolbar says what the page has, before any scan could end
    await until(() => answeredFromCache(tabId), 15000, 'the early cache check to answer');
    await until(async () => /^Scrapfly: .*V313 Probe \d+%/.test(await titleOf(tabId)), 15000, 'the hover text of the cached page');
    assert.deepEqual(await seen(), { value: undefined, has: false, own: false }, 'a load answered from the saved result');
    assert.equal(await stampOf(url), first, 'it really was answered from the saved result: no scan replaced it');
    const visible = await page.evaluate(() => Object.getOwnPropertyNames(window).filter(n => /scrapfly/i.test(n)));
    console.log(`      globals on the page that name the extension after a cache hit: ${JSON.stringify(visible)}`);
    await page.close();
  });

  // ===============================================================================================
  await scenario('F-1 switching a rule off makes the next visit a scan without its card; switching it on again brings it back', async () => {
    const { page, url } = await scanned(`/p?n=rev-${uniq()}`);
    const first = await stampOf(url);
    const before = await entryFor(url, 'full');
    assert.ok(detectorIds(before).includes(PROBE.id), 'the first scan found the probe');
    const revBefore = await rulesRev();

    // Control: a plain reload is answered from the saved result
    const tabId = await tabIdOf(url);
    await revisit(page, url);
    await until(() => answeredFromCache(tabId), 15000, 'the early cache check to answer');
    await sleep(6000); // longer than a scan takes: none replaced the result
    assert.equal(await stampOf(url), first, 'the result is reused while the rules stay as they are');

    await setEnabled(PROBE.id, false);
    const revOff = await rulesRev();
    assert.ok(revOff > revBefore, `the change is stamped (${revBefore} -> ${revOff})`);
    await revisit(page, url);
    const rescan = await until(async () => { const t = await stampOf(url); return t > first ? t : 0; }, 30000, 'a scan of the page after the rule was switched off');
    assert.equal(await answeredFromCache(tabId), false, 'the saved result did not answer after the change');
    const after = await entryFor(url, 'full');
    assert.ok(!detectorIds(after).includes(PROBE.id), `the switched-off rule's card is not served again: ${JSON.stringify(detectorIds(after))}`);
    assert.equal(after.rulesRev, revOff, 'the new result carries the revision it was found under');

    await setEnabled(PROBE.id, true);
    await revisit(page, url);
    await until(async () => (await stampOf(url)) > rescan, 30000, 'a scan after the rule was switched on');
    assert.ok(detectorIds(await entryFor(url, 'full')).includes(PROBE.id), 'and the card is back');
    await page.close();
  });

  // ===============================================================================================
  await scenario('F-6 History\'s Clear cache for a Path-scoped entry clears the result saved under the Domain key', async () => {
    assert.ok(await patchSettings({ detection: { cacheScope: 'domain' } }), 'the setting is Domain');
    // Under Domain one result answers every page of the site: start from an empty cache, so this visit is a scan
    await W(() => new Promise(resolve => DetectionEngineManager.handleClearAllDetectionCache(resolve)));
    try {
      const { page, url } = await scanned(`/p?n=scope-${uniq()}`, 'domain');
      const first = await stampOf(url, 'domain');
      assert.ok(first > 0, 'the result is under the Domain key');
      assert.equal(await entryFor(url, 'path'), null, 'and not under the Path key');

      // The History tab's request for an entry recorded under Path (sections/history/history.js), from an extension page
      const tabId = await tabIdOf(url);
      const history = await openExtensionPage();
      let answer;
      try {
        answer = await history.evaluate((request) => chrome.runtime.sendMessage(request), { type: 'HISTORY_CLEAR_CACHE', url, cacheScope: 'path', tabId });
      } finally {
        await history.close();
      }
      assert.equal(answer && answer.status, 'cleared', `the request answers "cleared": ${JSON.stringify(answer)}`);
      assert.equal(await entryFor(url, 'domain'), null, 'the Domain-key result is gone');

      await revisit(page, url, 'domain');
      await until(async () => (await stampOf(url, 'domain')) > 0, 30000, 'a new scan after the clear');
      assert.ok((await stampOf(url, 'domain')) > first, 'the reload was a scan, not the old result');
      await page.close();
    } finally {
      assert.ok(await patchSettings({ detection: { cacheScope: 'full' } }), 'the setting is back to the full address');
    }
  });

  // ===============================================================================================
  await scenario('F-8 a rule on a script in the head and one on an inline script\'s attribute match a real page', async () => {
    const { page, url } = await scanned(`/h?n=head-${uniq()}`);
    const entry = await entryFor(url, 'full');
    const found = ((entry.detectionResults || []).find(d => ((d.detector && d.detector.id) || d.id) === DOM_PROBE.id)) || null;
    assert.ok(found, `the probe is on the page's result: ${JSON.stringify(detectorIds(entry))}`);
    const seen = found.matches.filter(m => m.type === 'dom').map(m => m.value);
    assert.ok(seen.some(value => value.startsWith('script[data-queueit-c="e2ecustomer"]')), `script[data-queueit-c] in the head: ${JSON.stringify(seen)}`);
    assert.ok(seen.some(value => value.startsWith('script[r="m"]')), `script[r="m"] inline: ${JSON.stringify(seen)}`);
    assert.ok(!JSON.stringify(entry).includes('INLINE-SECRET-TEXT'), 'nothing of the inline script\'s text is saved with the result');
    console.log(`      detectors on the head page: ${JSON.stringify(detectorIds(entry))}`);
    await page.close();
  });

  // ===============================================================================================
  await scenario('F-9b the page\'s window, document and events hold the same with the extension as without it, on a scan and on a cache hit; the JS API adds its documented global only when on', async () => {
    const pagePath = `/audit?n=audit-${uniq()}`;
    const collect = async (page) => {
      await page.waitForFunction(() => window.__audit && window.__audit.times && window.__audit.times.t9000 && window.__audit.doc, null, { polling: 250, timeout: 40000 });
      return page.evaluate(() => JSON.parse(JSON.stringify(window.__audit)));
    };
    /** The names the page holds in one load and not in the other, per moment: { "names:x": ["start", "t1500"] } */
    const footprint = (withExt, without) => {
      const added = {};
      const removed = {};
      for (const label of Object.keys(without.times)) {
        for (const kind of ['names', 'symbols']) {
          const w = withExt.times[label][kind];
          const o = without.times[label][kind];
          for (const n of w) if (!o.includes(n)) (added[`${kind}:${n}`] = added[`${kind}:${n}`] || []).push(label);
          for (const n of o) if (!w.includes(n)) (removed[`${kind}:${n}`] = removed[`${kind}:${n}`] || []).push(label);
        }
      }
      for (const kind of ['names', 'symbols']) {
        for (const n of withExt.doc[kind]) if (!without.doc[kind].includes(n)) (added[`document ${kind}:${n}`] = []).push('doc');
        for (const n of without.doc[kind]) if (!withExt.doc[kind].includes(n)) (removed[`document ${kind}:${n}`] = []).push('doc');
      }
      if (JSON.stringify(withExt.doc.htmlAttrs) !== JSON.stringify(without.doc.htmlAttrs)) added['html attributes'] = [JSON.stringify(withExt.doc.htmlAttrs), JSON.stringify(without.doc.htmlAttrs)];
      if (withExt.doc.elements !== without.doc.elements) added['element count'] = [withExt.doc.elements, without.doc.elements];
      return { added, removed };
    };

    // Without the extension: the same page loaded twice in a Chromium that has none (the second load tells the noise of the comparison)
    const plain = await chromium.launch({ headless: true, channel: 'chromium' });
    let plainFirst;
    let plainSecond;
    try {
      const context = await plain.newContext({ viewport: { width: 420, height: 650 } });
      const first = await context.newPage();
      await first.goto(`${origin}${pagePath}`);
      plainFirst = await collect(first);
      await first.close();
      const second = await context.newPage();
      await second.goto(`${origin}${pagePath}`);
      plainSecond = await collect(second);
      await second.close();
    } finally {
      await plain.close();
    }
    const noise = footprint(plainFirst, plainSecond);
    const noisy = new Set([...Object.keys(noise.added), ...Object.keys(noise.removed)]);
    const against = (loaded, baseline) => {
      const d = footprint(loaded, baseline);
      for (const key of noisy) { delete d.added[key]; delete d.removed[key]; }
      return d;
    };

    // With the extension: a scanned load, then the same page answered from the saved result
    const { page, url } = await scanned(pagePath);
    const tabId = await tabIdOf(url);
    const scan = await collect(page);
    await revisit(page, url);
    await until(() => answeredFromCache(tabId), 15000, 'the early cache check to answer');
    const hit = await collect(page);
    await page.close();

    const report = (label, loaded, diff) => console.log(`      ${label}: only with the extension ${JSON.stringify(diff.added)}; only without it ${JSON.stringify(diff.removed)}; bridge events heard ${JSON.stringify(loaded.heard)}; JS API events ${JSON.stringify(loaded.api)}; error frames ${JSON.stringify(loaded.frames)}`);
    console.log(`      noise between two loads without the extension: ${JSON.stringify(noise)}`);
    const scanDiff = against(scan, plainFirst);
    const hitDiff = against(hit, plainSecond);
    report('scanned load', scan, scanDiff);
    report('cache hit   ', hit, hitDiff);
    // A gap, not a pass: an error thrown through a wrapped member carries the wrapper's frame, which names the extension's script
    console.log(`      KNOWN GAP (reported, not asserted): frames naming the extension's script in the stack of an error thrown through a wrapped member: scanned load ${JSON.stringify(Object.fromEntries(Object.entries(scan.frames).map(([k, v]) => [k, v.length])))}, cache hit ${JSON.stringify(Object.fromEntries(Object.entries(hit.frames).map(([k, v]) => [k, v.length])))}; without the extension ${JSON.stringify(plainFirst.frames)}`);
    console.log(`      KNOWN GAP (by design): a getter the page defines on a path the window checks poll sees the extension's frames in its own stack: scanned load ${scan.getterReads} reads, first frame ${JSON.stringify(scan.getterFrames[0])}; cache hit ${hit.getterReads} reads; without the extension ${plainFirst.getterReads}`);
    for (const [label, diff, loaded] of [['scanned load', scanDiff, scan], ['cache hit', hitDiff, hit]]) {
      assert.deepEqual(diff.added, {}, `${label}: nothing is on the page's window or document that is not there without the extension`);
      assert.deepEqual(diff.removed, {}, `${label}: nothing is missing from it`);
      assert.deepEqual(loaded.heard, [], `${label}: the page hears no bridge event`);
      assert.deepEqual(loaded.api, [], `${label}: the JS API is off, so the page gets none of its events`);
    }

    // The JS API (opt-in) hands the page its events and the last detection; the page then holds that one global more
    assert.ok(await patchSettings({ jsApi: { enableJsApi: true } }), 'the JS API is on');
    try {
      await W(() => new Promise(resolve => DetectionEngineManager.handleClearAllDetectionCache(resolve)));
      const withApi = await scanned(pagePath);
      const apiTab = await tabIdOf(withApi.url);
      const apiScan = await collect(withApi.page);
      await revisit(withApi.page, withApi.url);
      await until(() => answeredFromCache(apiTab), 15000, 'the early cache check to answer');
      const apiHit = await collect(withApi.page);
      await withApi.page.close();
      const apiScanDiff = against(apiScan, plainFirst);
      const apiHitDiff = against(apiHit, plainSecond);
      report('JS API on, scanned load', apiScan, apiScanDiff);
      report('JS API on, cache hit   ', apiHit, apiHitDiff);
      for (const [label, diff, loaded] of [['scanned load', apiScanDiff, apiScan], ['cache hit', apiHitDiff, apiHit]]) {
        assert.deepEqual(Object.keys(diff.added), ['names:__scrapflyLastDetection'], `${label} with the JS API on: its one documented global`);
        assert.deepEqual(diff.removed, {}, label);
        assert.deepEqual(loaded.heard, [], `${label}: the bridge events stay out of the page's hearing`);
        assert.ok(loaded.api.length > 0, `${label}: the JS API events reach the page (${JSON.stringify(loaded.api)})`);
      }
    } finally {
      assert.ok(await patchSettings({ jsApi: { enableJsApi: false } }), 'the JS API is off again');
    }
  });

  // ---- Report -------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${pageErrors.join('\n  ')}`);
  console.log(`\nRESULT ${failed.length || pageErrors.length ? 'FAILED' : 'ALL PASS'} (${results.length} scenarios, ${failed.length} failed)`);
  await ctx.close();
  server.close();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
