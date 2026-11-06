#!/usr/bin/env node
/**
 * The 3.1.4 rules-safety fixes, end to end in the real extension (unpacked in Chromium):
 *
 *   Import guard   Rules → Import (Merge) of a file with a valid rule and rules whose regex the editor refuses: the valid one
 *                  comes in, the others are left out and named in the toast
 *   Import size    a file over the size limit is refused before it is read: an error toast, nothing imported
 *   Text limit     a scan of a page whose script is one long line: a regex of a rule of your own finds what is in the first
 *                  100,000 characters and not what comes after; plain text finds both
 *   No freeze      a rule of your own with `function.*zzz` on a page with a 3 MB single-line script: the scan still ends in seconds
 *   Help           the DOM sheet of the Rules '?' help says the head is searched
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup
 *   node scripts/e2e-v314-rules-safety.js [repo] [--only=<text>]
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm run e2e:setup (or npm i --no-save playwright && npx playwright install chromium)');
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
const LIMIT = 100000;

// ---- Local site -----------------------------------------------------------------------------------
// /long: an inline script on one line, v314early at its start and v314late past the limit
// /huge: a 3 MB single-line script that starts with `function` and never says zzz
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const html = (script) => `<!doctype html><html><head><title>${url.pathname}</title></head><body><p>rules safety</p><script>${script}</script></body></html>`;
  res.writeHead(url.pathname === '/long' || url.pathname === '/huge' ? 200 : 404, { 'content-type': 'text/html', 'cache-control': 'no-store' });
  if (url.pathname === '/long') return res.end(html(`var v314early=1;var pad="${'x'.repeat(LIMIT * 3)}";var v314late=1;`));
  if (url.pathname === '/huge') return res.end(html(`function f(){return 1};var pad="${'y'.repeat(3 * 1024 * 1024)}";`));
  res.end();
});

const rule = (id, name, text, extra = {}) => ({
  id, name, author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium', version: '1.0.0', lastUpdated: '2026-11-06',
  icon: 'custom.png', description: `${name}: a probe for the rules-safety scenarios`,
  detection: { content: [{ id: `${id}-c`, text, confidence: 90, standalone: true, description: 'probe', ...extra }] }
});
const EARLY_REGEX = rule('detect-v314-early-re', 'V314 Early Regex', 'v314ear.y', { textRegex: true });
const LATE_REGEX = rule('detect-v314-late-re', 'V314 Late Regex', 'v314lat.', { textRegex: true });
const LATE_PLAIN = rule('detect-v314-late-plain', 'V314 Late Plain', 'v314late');
const SLOW = rule('detect-v314-slow', 'V314 Slow Wildcard', 'function.*zzz', { textRegex: true });
const PROBES = [EARLY_REGEX, LATE_REGEX, LATE_PLAIN, SLOW];

// ---- Harness ---------------------------------------------------------------------------------------
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
    console.log(`FAIL  ${name}\n      ${String((error && error.stack) || error).split('\n').slice(0, 8).join('\n      ')}`);
  }
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-rules-safety-'));
  const files = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-rules-safety-files-'));
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
  async function until(check, ms = 20000, what = 'condition') {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(300);
    }
  }
  /** The saved scan result of a page (the full address is the cache key), or null. */
  const savedResult = (url) => W(async (u) => {
    let storage = (await chrome.storage.local.get(DetectionEngineManager.STORAGE_KEY))[DetectionEngineManager.STORAGE_KEY] || {};
    if (typeof storage === 'string') storage = JSON.parse(storage);
    const entry = storage[UrlUtils.hashUrl(u, 'full')];
    return entry ? { ids: (entry.detectionResults || []).map(d => d.detector.id) } : null;
  }, url);
  async function popup() {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`popup: ${e.message}`));
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await page.waitForFunction(() => window.popupInstance && window.popupInstance.detectorManager && window.popupInstance.detectorManager.initialized, null, { polling: 250, timeout: 30000 });
    return page;
  }
  async function rulesTab(page) {
    await page.$eval('#nav-rules', el => el.click());
    await page.waitForSelector('#importRulesFile', { state: 'attached', timeout: 15000 });
  }
  const toasts = (page) => page.$$eval('.notification-toast', els => els.map(el => ({ type: el.className, text: el.textContent.trim() })));
  const has = (page, id) => page.evaluate((i) => Object.values(window.popupInstance.detectorManager.detectors).some(records => records && Object.values(records).some(d => d && d.id === i)), id);

  // ---- Start-up: English, the full address as cache key, no update check over the network -----------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  await W(() => SettingsStore.mutate({ operation: 'patch', patch: { detection: { cacheScope: 'full' } } }).then(r => r.success === true));
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

  // ===============================================================================================
  await scenario('Import guard: Merge brings in the valid rule and leaves out, by name, the ones whose regex could freeze scanning', async () => {
    const good = rule('detect-v314-import-ok', 'V314 Import OK', 'v314-import-ok');
    const evil = rule('detect-v314-import-evil', 'V314 Import Evil', '(a|a?){16}b', { textRegex: true });
    const nested = rule('detect-v314-import-nested', 'V314 Import Nested', '(a+)+$', { textRegex: true });
    const file = path.join(files, 'rules.json');
    fs.writeFileSync(file, JSON.stringify({ antibot: { [good.id]: good, [evil.id]: evil, [nested.id]: nested } }));
    const page = await popup();
    await rulesTab(page);
    await page.setInputFiles('#importRulesFile', file);
    await page.waitForSelector('.notification-btn-confirm', { timeout: 10000 });
    await page.$eval('.notification-btn-confirm', el => el.click()); // Merge
    const toast = await until(async () => (await toasts(page)).find(t => /except/i.test(t.text)), 15000, 'the skipped-rules toast');
    assert.match(toast.text, /V314 Import Evil/);
    assert.match(toast.text, /V314 Import Nested/);
    assert.match(toast.text, /could freeze scanning/);
    assert.doesNotMatch(toast.text, /V314 Import OK/);
    assert.equal(await has(page, good.id), true, 'the valid rule is imported');
    assert.equal(await has(page, evil.id), false);
    assert.equal(await has(page, nested.id), false);
    await page.close();
  });

  await scenario('Import size: a file over 10 MB is refused before it is read, and nothing comes in', async () => {
    const big = rule('detect-v314-import-big', 'V314 Import Big', 'v314-import-big');
    const file = path.join(files, 'big.json');
    fs.writeFileSync(file, JSON.stringify({ antibot: { [big.id]: big }, pad: 'z'.repeat(11 * 1024 * 1024) }));
    const page = await popup();
    await rulesTab(page);
    await page.setInputFiles('#importRulesFile', file);
    const toast = await until(async () => (await toasts(page)).find(t => /Failed to import/i.test(t.text)), 15000, 'the error toast');
    assert.match(toast.type, /notification-error/);
    assert.equal(await page.$('.notification-btn-confirm'), null, 'no Merge / Replace All question for a file that is not read');
    assert.equal(await has(page, big.id), false);
    assert.equal(await page.$eval('#importRulesFile', el => el.value), '', 'the file input is reset');
    await page.close();
  });

  // The probe rules of the scans, added as the editor's Save adds them
  {
    const admin = await popup();
    await admin.evaluate(async (probes) => {
      for (const r of probes) await window.popupInstance.detectorManager.addDetector('antibot', r.id, r);
      await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
    }, PROBES);
    await admin.close();
    await sleep(1500);
  }

  await scenario('Text limit: a regex of your own finds what is in the first 100,000 characters of a script and not what is after; plain text finds both', async () => {
    const url = `${origin}/long?t=${Date.now()}`;
    const site = await ctx.newPage();
    await site.goto(url, { waitUntil: 'commit' }).catch(() => {});
    const saved = await until(() => savedResult(url), 30000, 'the saved result');
    assert.ok(saved.ids.includes(EARLY_REGEX.id), `the early regex: ${saved.ids.join(', ')}`);
    assert.ok(saved.ids.includes(LATE_PLAIN.id), `plain text reads all of it: ${saved.ids.join(', ')}`);
    assert.ok(!saved.ids.includes(LATE_REGEX.id), `the late regex is past the limit: ${saved.ids.join(', ')}`);
    await site.close();
  });

  await scenario('No freeze: `function.*zzz` of your own on a page with a 3 MB single-line script, and the scan ends in seconds', async () => {
    const url = `${origin}/huge?t=${Date.now()}`;
    const started = Date.now();
    const site = await ctx.newPage();
    await site.goto(url, { waitUntil: 'commit' }).catch(() => {});
    const saved = await until(() => savedResult(url), 30000, 'the saved result (the scan did not end)');
    const took = Date.now() - started;
    assert.ok(!saved.ids.includes(SLOW.id));
    assert.ok(took < 20000, `the scan took ${took} ms`);
    console.log(`      the 3 MB page was scanned in ${took} ms`);
    // The worker still answers at once
    const t0 = Date.now();
    assert.equal(await W(() => 1), 1);
    assert.ok(Date.now() - t0 < 2000);
    await site.close();
  });

  await scenario('Help: the DOM sheet says the head is searched and no longer says the page body', async () => {
    const page = await popup();
    await rulesTab(page);
    const sheet = await page.evaluate(() => {
      const help = typeof METHOD_HELP !== 'undefined' ? METHOD_HELP.dom : null;
      if (!help) return null;
      const text = ([key, fallback]) => (window.I18n && I18n.get(key)) || fallback;
      return [help.intro, ...help.limits].map(text).join(' ');
    });
    assert.ok(sheet, 'the help of the Rules tab is loaded');
    assert.match(sheet, /head and body/);
    assert.doesNotMatch(sheet, /page body/);
    assert.doesNotMatch(sheet, /head[^.]*not searched/i);
    await page.close();
  });

  const relevant = pageErrors.filter(e => !/ResizeObserver/.test(e));
  if (relevant.length) {
    console.log(`page errors:\n  ${relevant.join('\n  ')}`);
    results.push({ name: 'no page errors', ok: false });
  }
  await ctx.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(files, { recursive: true, force: true });
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
