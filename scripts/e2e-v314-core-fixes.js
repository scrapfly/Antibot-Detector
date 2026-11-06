#!/usr/bin/env node
/**
 * 3.1.4 core fixes, end to end in the real extension (unpacked in Chromium).
 *
 *   Rules that cannot be read   the stored rules are text that is not JSON: the popup says so once (the built-in rules are in
 *                               use and rule changes are not saved), a rule switched off in the Rules tab goes back and is not
 *                               saved, the stored text stays as it is, and an import with Replace All writes the rules again;
 *                               the popup opened after that says nothing, and the worker reads the repaired rules
 *   Cache scope back to Domain  pages of one site scanned under "Full URL", then the scope set back to "Domain" as Settings
 *                               sets it: the results saved under "Full URL" are gone, and another page of the site gets a scan of
 *                               its own instead of one of those results
 *
 * The popup is opened as a page, as in the other suites. Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup
 *   node scripts/e2e-v314-core-fixes.js [<repo checkout>] [--only=<text>]
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

const MARKER = 'v314-core-fixes-marker';
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/p')) {
    const name = url.searchParams.get('n') || 'page';
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(`<!doctype html><html><head><title>Core ${name}</title></head><body><p>${MARKER}</p><p>${name}</p></body></html>`);
  }
  res.writeHead(404); res.end();
});

const PROBE = {
  id: 'detect-v314-core', name: 'V314 Core Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium', version: '1.0.0',
  lastUpdated: '2026-11-06', icon: 'custom.png', description: 'A probe for the core fixes',
  detection: { content: [{ id: 'v314-core-marker', text: MARKER, confidence: 90, standalone: true, description: 'marker' }] }
};
const SAD_RULES = 'S3CR3T-RULE-TEXT is not json';
const RULES_HINT = 'The stored rules could not be read: the built-in rules are in use and rule changes are not saved. To replace the stored rules, import a rules file in the Rules tab and choose Replace All.';
const TOGGLE_FAILED = 'Could not save the change. Try again.';

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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-core-fixes-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
  });
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
  async function until(check, ms = 20000, what = 'condition') {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(300);
    }
  }
  const extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  const patchSettings = (patch) => W((p) => SettingsStore.mutate({ operation: 'patch', patch: p }).then(r => r.success === true), patch);
  const rawStored = (key) => W(async (k) => (await chrome.storage.local.get(k))[k], key);
  const setStored = (values) => W((v) => chrome.storage.local.set(v), values);
  const cacheEntries = () => W(async () => {
    const storage = (await chrome.storage.local.get(DetectionEngineManager.STORAGE_KEY))[DetectionEngineManager.STORAGE_KEY] || {};
    return Object.values(storage).map(entry => ({ url: entry.url, scope: entry.cacheScope, at: entry.timestamp }));
  });
  async function popupFor() {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`popup: ${e.message}`));
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await page.waitForFunction(() => window.popupInstance && window.popupInstance.detectorManager
      && (window.popupInstance.detectorManager.initialized || window.popupInstance.detectorManager.getDetectorCount() > 0), null, { polling: 250, timeout: 30000 });
    return page;
  }
  const toasts = (page) => page.$$eval('.notification-toast .notification-message', els => els.map(el => el.textContent.trim()));
  const reloadRules = (page) => page.evaluate(() => new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => r(response))));

  await patchSettings({ updates: { autoUpdate: false } });
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

  // ===============================================================================================
  await scenario('Rules that cannot be read: the popup says so once, a switch is not saved over them, and Replace All repairs them', async () => {
    await setStored({ scrapfly_detectors: SAD_RULES });
    const popup = await popupFor();
    const said = await until(async () => { const list = await toasts(popup); return list.includes(RULES_HINT) ? list : null; }, 10000, 'the rules notice');
    assert.equal(said.filter(text => text === RULES_HINT).length, 1, `once: ${JSON.stringify(said)}`);
    assert.ok(!said.join('').includes('S3CR3T'), 'never with the stored text');
    // The worker reloads them (what a rule save sends) and writes nothing either
    await reloadRules(popup);

    // Rules tab: the person switches a built-in rule off
    await popup.evaluate(() => window.popupInstance.rules.updateDetectorEnabledState('antibot', 'detect-akamai', false));
    const after = await until(async () => { const list = await toasts(popup); return list.includes(TOGGLE_FAILED) ? list : null; }, 5000, 'the toggle failure');
    assert.ok(after.includes(TOGGLE_FAILED));
    assert.equal(await popup.evaluate(() => window.popupInstance.detectorManager.getDetector('antibot', 'detect-akamai').enabled), true, 'the switch went back');
    await sleep(1000);
    assert.equal(await rawStored('scrapfly_detectors'), SAD_RULES, 'the stored rules are what they were: nothing was written over them');

    // Import with Replace All: the person replaces them
    const imported = await popup.evaluate((probe) => window.popupInstance.detectorManager.importDetectors({ detectors: { antibot: { [probe.id]: probe } } }, false), PROBE);
    assert.equal(imported, true);
    const stored = await rawStored('scrapfly_detectors');
    assert.ok(stored && typeof stored === 'object' && stored.detectors.antibot[PROBE.id] && stored.detectors.antibot['detect-akamai'], 'the rules are written: the imported one beside the built-in ones');
    await reloadRules(popup);
    await popup.close();

    const clean = await popupFor();
    await sleep(1500);
    assert.ok(!(await toasts(clean)).includes(RULES_HINT), 'no notice once the rules read');
    assert.equal(await clean.evaluate(() => window.popupInstance.detectorManager.storageState), 'loaded');
    await clean.close();
    const worker = await until(() => W(() => (detectorManager && detectorManager.initialized && detectorManager.getDetector('antibot', 'detect-v314-core') ? true : null)), 10000, 'the worker to read the repaired rules');
    assert.equal(worker, true);
  });

  // ===============================================================================================
  await scenario('Cache scope back to Domain: the results saved under Full URL go, and another page of the site is scanned for itself', async () => {
    await patchSettings({ detection: { cacheScope: 'full' } });
    await W(() => chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: {} }));
    const visit = async (name) => {
      const url = `${origin}/p/${name}`;
      const page = await ctx.newPage();
      page.on('pageerror', (e) => pageErrors.push(`site: ${e.message}`));
      await page.goto(url, { waitUntil: 'commit' }).catch(() => {});
      const entry = await until(async () => (await cacheEntries()).find(e => e.url === url), 25000, `the saved result of ${url}`);
      await page.close();
      return entry;
    };
    const a = await visit('a');
    const b = await visit('b');
    assert.deepEqual([a.scope, b.scope], ['full', 'full']);

    // What Settings → Save does when the scope changes
    await patchSettings({ detection: { cacheScope: 'domain' } });
    const admin = await popupFor();
    await admin.evaluate(() => new Promise(r => chrome.runtime.sendMessage({ type: 'CACHE_SCOPE_CHANGED' }, () => r())));
    const left = await until(async () => { const list = await cacheEntries(); return list.every(e => e.scope === 'domain') ? list : null; }, 10000, 'the Full URL results to go');
    assert.deepEqual(left, []);
    await admin.close();

    // Another page of the site: its own scan, saved under Domain, not a's or b's result
    const startedAt = Date.now();
    const c = await visit('c');
    assert.equal(c.scope, 'domain');
    assert.ok(c.at >= startedAt, 'a new scan');
  });

  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${pageErrors.join('\n  ')}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  console.log(failed.length || pageErrors.length ? 'RESULT FAILED' : `RESULT ALL PASS (${results.length} scenarios)`);
  await ctx.close();
  server.close();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
