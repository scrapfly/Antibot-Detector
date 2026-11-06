#!/usr/bin/env node
/**
 * 3.1.4 integrity, end to end in the real extension (unpacked in Chromium): what the worker does when the storage or the stored
 * settings cannot be read. It must neither lose the person's rules nor forget the choices they made.
 *
 *   Rules, running worker   the storage stops answering for the rules while the worker reloads them (what happens after every rule
 *                           save): the custom rule, the edit to an official rule and the switched-off flag stay in the worker,
 *                           scans keep detecting the custom rule, and the stored rules are not written (they were rewritten from
 *                           the shipped files before); the next scan after the storage answers again loads them
 *   Settings                the stored settings are text that is not JSON: a paused History stays paused (the page is scanned, and
 *                           nothing is recorded), the backup and watchlist alarms are not cleared, Bulk scan does not start, the text
 *                           is not rewritten, and the popup says so, once, with the repair (Settings → Data → Reset). After the
 *                           reset the defaults apply and History records again
 *   Rules, cold worker      the stored rules are text that is not JSON when the worker starts again: the text stays as it is (it was
 *                           replaced by the shipped rules), scans go on with the shipped rules, and the rules come back at the next
 *                           scan once the stored value is repaired
 *   Both, worker restarted  the lot at once: rules and settings damaged, the worker stopped and started again: the pause is respected
 *                           by the new worker, nothing stored is changed, and restoring the saved values brings the custom rule back
 *
 * A local site shows the marker of a probe rule, and one page a Friendly Captcha widget (a shipped rule) so that a worker that has only
 * the shipped rules still finds something to record. The popup is opened as a page, as in the other suites.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup
 *   node scripts/e2e-v314-integrity.js [<repo checkout>] [--only=<text>]
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

// ---- Local site -----------------------------------------------------------------------------------
const MARKER = 'v314-integrity-marker';
const site = (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/p') {
    const name = url.searchParams.get('n') || 'page';
    const probe = url.searchParams.get('m') === '1' ? `<p>${MARKER}</p>` : '';
    const frc = url.searchParams.get('frc') === '1' ? '<div class="frc-captcha" data-sitekey="FC-0000"></div><input type="hidden" name="frc-captcha-solution" value="">' : '';
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(`<!doctype html><html><head><title>Integrity ${name}</title></head><body>${probe}${frc}<p>probe page</p></body></html>`);
  }
  res.writeHead(404); res.end();
};
const server = http.createServer(site);
const server2 = http.createServer(site);   // the same site under a second address (127.0.0.2), for the last scenario

const PROBE = {
  id: 'detect-v314-integrity', name: 'V314 Integrity Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium', version: '1.0.0',
  lastUpdated: '2026-11-06', icon: 'custom.png', description: 'A probe for the integrity scenarios',
  detection: { content: [{ id: 'v314-integrity-marker', text: MARKER, confidence: 90, standalone: true, description: 'marker' }] }
};
const EDITED_NOTE = 'Edited by the person (v314 integrity)';
const SAD_SETTINGS = 'S3CR3T-WEBHOOK-VALUE is not json';
const SAD_RULES = 'S3CR3T-RULE-TEXT is not json';
const HINT = 'The stored settings could not be read, so scanning, History and Bulk scan are paused. To repair them, use Settings → Data → Reset.';

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
  await new Promise(r => server2.listen(0, '127.0.0.2', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const origin2 = `http://127.0.0.2:${server2.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-integrity-'));
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
  // Playwright does not attach to a worker that was stopped and started again, so after a restart what the scenarios read and write
  // goes through an extension page (popup.html loads the same storage, URL, History and engine modules); the worker's memory is then
  // seen only through what it does: what a scan finds, what History records, what is stored
  let workerGone = false;
  let probe = null;
  async function onProbe(fn, arg) {
    if (!probe || probe.isClosed()) {
      probe = await ctx.newPage();
      probe.on('pageerror', (e) => pageErrors.push(`probe: ${e.message}`));
      await probe.goto(`chrome-extension://${extId}/popup.html`);
      await probe.waitForFunction(() => typeof HistoryStore !== 'undefined' && typeof DetectionEngineManager !== 'undefined', null, { polling: 200, timeout: 20000 });
    }
    return probe.evaluate(fn, arg);
  }
  async function W(fn, arg) {
    if (workerGone) return onProbe(fn, arg);
    for (let attempt = 0; ; attempt++) {
      try {
        const sw = await getWorker();
        return await sw.evaluate(fn, arg);
      } catch (error) {
        // A worker that was stopped between asking for it and using it: ask again
        if (attempt >= 3 || !/closed|destroyed|detached|Target/i.test(String(error.message))) throw error;
        await sleep(500);
      }
    }
  }
  const patchSettings = (patch) => W((p) => SettingsStore.mutate({ operation: 'patch', patch: p }).then(r => r.success === true), patch);
  async function until(check, ms = 20000, what = 'condition') {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(300);
    }
  }
  const tabOf = (url) => W(async (u) => { const t = (await chrome.tabs.query({})).find(x => x.url === u); return t ? { id: t.id, url: t.url, windowId: t.windowId } : null; }, url);
  /** The saved scan result of a page: when it was stored and what it found (the newest under any cache scope), or null. */
  const savedScan = (url) => W(async (u) => {
    let storage = (await chrome.storage.local.get(DetectionEngineManager.STORAGE_KEY))[DetectionEngineManager.STORAGE_KEY] || {};
    if (typeof storage === 'string') storage = JSON.parse(storage);
    const found = ['domain', 'path', 'full'].map(scope => storage[UrlUtils.hashUrl(u, scope)]).filter(Boolean).sort((a, b) => b.timestamp - a.timestamp)[0];
    return found ? { at: found.timestamp, names: (found.detectionResults || []).map(r => r.detector && r.detector.name) } : null;
  }, url);
  let counter = 0;
  const uniq = () => `${Date.now().toString(36)}${counter++}`;
  /** Visit a page and wait until its scan is saved; the page stays open. */
  // A page scanned while the settings cannot be read is on another host of the same site (`other`: localhost, or 127.0.0.2 when
  // given as 2): the cache scope the person chose (the full address) is in the settings, so the result is saved under the default
  // scope, and a host of its own keeps it apart from the results saved before under another scope
  async function scanned(name, query = '', { other = false } = {}) {
    const base = other === 2 ? origin2 : other ? origin.replace('127.0.0.1', 'localhost') : origin;
    const url = `${base}/p?n=${name}${query}`;
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`site: ${e.message}`));
    await page.goto(url, { waitUntil: 'commit' }).catch(() => {});
    const saved = await until(() => savedScan(url), 25000, `the saved result of ${url}`);
    return { page, url, saved };
  }
  async function popupFor(file = 'popup.html') {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${file}: ${e.message}`));
    await page.goto(`chrome-extension://${extId}/${file}`);
    // (rules that cannot be read leave the popup's manager not initialized, with the shipped rules in it)
    await page.waitForFunction(() => window.popupInstance && window.popupInstance.detectorManager
      && (window.popupInstance.detectorManager.initialized || window.popupInstance.detectorManager.getDetectorCount() > 0), null, { polling: 250, timeout: 30000 });
    return page;
  }
  const toasts = (page) => page.$$eval('.notification-toast .notification-message', els => els.map(el => el.textContent.trim()));
  const historyUrls = () => W(async () => (await HistoryStore.read(chrome.storage.local)).map(item => item.url));
  const rawStored = (key) => W(async (k) => { const read = globalThis.__realGet || chrome.storage.local.get.bind(chrome.storage.local); return (await read(k))[k]; }, key);
  const setStored = (values) => W((v) => chrome.storage.local.set(v), values);
  const alarmsNow = () => W(async () => Object.fromEntries((await chrome.alarms.getAll()).map(a => [a.name, a.periodInMinutes || true])));
  /** What the worker holds in memory of the three rules the scenarios care about, and whether its manager counts as loaded. */
  const inMemory = () => W(() => {
    const edited = detectorManager.getDetector('antibot', 'detect-akamai');
    return {
      initialized: detectorManager.initialized,
      count: detectorManager.getDetectorCount(),
      custom: !!detectorManager.getDetector('antibot', 'detect-v314-integrity'),
      hcaptchaEnabled: (detectorManager.findDetectorById('detect-hcaptcha') || {}).enabled,
      akamaiEdited: !!(edited && edited.userModified),
      akamaiNote: edited && edited.description
    };
  });
  const workerTargets = async (cdp) => (await cdp.send('Target.getTargets')).targetInfos
    .filter(t => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extId}/`));
  /** Stop the extension's service worker: the next event starts a new one with nothing in memory. (ServiceWorker.stopAllWorkers
   *  closes the whole browser in this Chromium, so the worker's target is closed instead.) */
  async function restartWorker(admin) {
    const cdp = await ctx.newCDPSession(admin);
    const before = await workerTargets(cdp);
    assert.ok(before.length, 'a worker to stop');
    for (const t of before) assert.equal((await cdp.send('Target.closeTarget', { targetId: t.targetId })).success, true, 'the worker was stopped');
    workerGone = true;
    await sleep(1500);
    await cdp.detach().catch(() => {});
  }
  /** A worker runs again (after a restart): the extension has a service worker target that was not there before. */
  async function workerRunning(admin) {
    const cdp = await ctx.newCDPSession(admin);
    try { return (await workerTargets(cdp)).length > 0; } finally { await cdp.detach().catch(() => {}); }
  }
  /** Make reads of the stored rules fail in this worker (a worker that has just started has none of it: the patch is installed again). */
  const installReadFailure = () => W(() => {
    if (globalThis.__realGet) return;
    const real = chrome.storage.local.get.bind(chrome.storage.local);
    globalThis.__realGet = real;
    globalThis.__failRules = false;
    chrome.storage.local.get = (keys, cb) => {
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : keys && typeof keys === 'object' ? Object.keys(keys) : [];
      if (globalThis.__failRules && !cb && list.includes('scrapfly_detectors')) return Promise.reject(new Error('Synthetic read failure'));
      return real(keys, cb);
    };
  });
  const failRules = (on) => W((flag) => { globalThis.__failRules = flag; }, on);
  const reload = async () => {
    const admin = await ctx.newPage();
    await admin.goto(`chrome-extension://${extId}/popup.html`);
    const reply = await admin.evaluate(() => new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => r(response))));
    await admin.close();
    return reply;
  };

  // ---- Start-up: the person's rules, English, the full address as cache key ----------------------------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  const admin = await popupFor();
  // A rule of their own, a shipped rule they switched off, and a shipped rule they edited
  await admin.evaluate(async ({ probe, note }) => {
    const dm = window.popupInstance.detectorManager;
    await dm.addDetector('antibot', probe.id, probe);
    dm.getDetector('captcha', 'detect-hcaptcha').enabled = false;
    const original = dm.getDetector('antibot', 'detect-akamai');
    const edited = JSON.parse(JSON.stringify(original));
    edited.description = note;
    dm.detectors.antibot['detect-akamai'] = DetectorManager.markUserEdited(edited, original);
    await dm.saveDetectorsToStorage();
    await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
  }, { probe: PROBE, note: EDITED_NOTE });
  await patchSettings({ detection: { cacheScope: 'full' }, updates: { autoUpdate: false } });
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });
  await sleep(1500);
  const rulesSnapshot = await rawStored('scrapfly_detectors');
  assert.ok(rulesSnapshot && rulesSnapshot.detectors.antibot[PROBE.id], 'the person\'s rules are saved');
  assert.equal(rulesSnapshot.detectors.captcha['detect-hcaptcha'].enabled, false);

  // ===============================================================================================
  await scenario('Rules, running worker: a reload that cannot read them keeps the custom rule, the edit and the switched-off flag, and saves nothing', async () => {
    await installReadFailure();
    const before = await inMemory();
    assert.deepEqual([before.initialized, before.custom, before.hcaptchaEnabled, before.akamaiEdited, before.akamaiNote], [true, true, false, true, EDITED_NOTE]);
    const stored = await rawStored('scrapfly_detectors');

    await failRules(true);
    const reply = await reload();                                        // what a rule save sends
    assert.ok(reply && (reply.status === 'reloaded' || reply.status === 'error'), JSON.stringify(reply));
    const during = await inMemory();
    assert.equal(during.custom, true, 'the custom rule is still in the worker');
    assert.equal(during.hcaptchaEnabled, false, 'so is the flag of the rule that was switched off');
    assert.deepEqual([during.akamaiEdited, during.akamaiNote], [true, EDITED_NOTE], 'and the edit to a shipped rule');
    assert.equal(during.initialized, false, 'the worker does not count its rules as loaded');
    assert.deepEqual(await rawStored('scrapfly_detectors'), stored, 'the stored rules are exactly what they were: nothing was written');

    // Scans go on, with the person\'s rules, while the storage still cannot be read
    const { page, url, saved } = await scanned(`rules-failing-${uniq()}`, '&m=1');
    assert.ok(saved.names.includes(PROBE.name), `the custom rule still detects: ${JSON.stringify(saved.names)}`);
    assert.deepEqual(await rawStored('scrapfly_detectors'), stored, 'a scan writes no rules');
    await page.close();
    assert.ok(url);

    // The storage answers again: the next scan loads the stored rules, and writes nothing over them
    await failRules(false);
    const { page: later, saved: again } = await scanned(`rules-back-${uniq()}`, '&m=1');
    assert.ok(again.names.includes(PROBE.name));
    const after = await until(async () => { const m = await inMemory(); return m.initialized ? m : null; }, 15000, 'the rules to be loaded again');
    assert.deepEqual([after.custom, after.hcaptchaEnabled, after.akamaiEdited], [true, false, true]);
    assert.deepEqual(await rawStored('scrapfly_detectors'), stored, 'and still nothing was written over the stored rules');
    await later.close();
  });

  // ===============================================================================================
  await scenario('Settings that cannot be read: a paused History stays paused, the alarms stay, Bulk scan does not start, the popup says so, and Reset repairs it', async () => {
    // History records while it is on (the control), then the person pauses it and sets a backup and a watchlist
    const base = (await historyUrls()).length;
    const first = await scanned(`history-on-${uniq()}`, '&m=1');
    await until(async () => (await historyUrls()).includes(first.url), 10000, 'the first page in History');
    await first.page.close();
    await patchSettings({ history: { historyEnabled: false, historyBackup: 'daily', historyWatch: 'daily' } });
    await until(async () => { const a = await alarmsNow(); return a['scrapfly-history-backup'] && a['scrapfly-history-watch']; }, 10000, 'the two alarms');
    const settingsText = await rawStored('scrapfly_settings');
    assert.equal(typeof settingsText, 'string');

    // The stored settings become text that is not JSON
    await setStored({ scrapfly_settings: SAD_SETTINGS });
    await sleep(1500);
    assert.deepEqual(Object.keys(await alarmsNow()).filter(name => name.startsWith('scrapfly-history')).sort(), ['scrapfly-history-backup', 'scrapfly-history-watch'], 'the alarms were not cleared as if switched off');

    const damaged = await scanned(`history-damaged-${uniq()}`, '&m=1', { other: true });
    assert.ok(damaged.saved.names.includes(PROBE.name), 'the page is scanned');
    await damaged.page.close();
    await sleep(2500);
    assert.equal((await historyUrls()).length, base + 1, 'but History is paused, and was not recorded to because its pause could not be read');
    assert.equal(await rawStored('scrapfly_settings'), SAD_SETTINGS, 'the stored text was not rewritten');

    // Bulk scan opens nothing on a guess
    const tabsBefore = (await W(() => chrome.tabs.query({}))).length;
    const bulk = await W((target) => BulkScanRunner.start({ entries: [target] }), `${origin}/p?n=bulk`);
    assert.deepEqual([bulk.ok, bulk.error], [false, 'settings']);
    await sleep(800);
    assert.equal((await W(() => chrome.tabs.query({}))).length, tabsBefore, 'no tab was opened');

    // The popup says so, once, in the words of the repair, and never with the text it could not read
    const popup = await popupFor();
    const said = await until(async () => { const list = await toasts(popup); return list.length ? list : null; }, 10000, 'the toast');
    // (the Settings modal's own load says "Could not load settings" too, when it reads them strictly as the popup opens)
    assert.equal(said.filter(text => text === HINT).length, 1, `the notice, once: ${JSON.stringify(said)}`);
    assert.ok(!said.join('').includes('S3CR3T'));
    await popup.close();

    // Reset (what Settings → Data → Reset sends) repairs it: the defaults apply, and History records again
    await W(async () => {
      const defaults = (await (await fetch(chrome.runtime.getURL('sections/settings/default-settings.json'))).json()).settings;
      const done = await SettingsStore.mutate({ operation: 'reset', defaults, keep: [] });
      if (!done.success) throw new Error('the reset failed');
    });
    // (the reset brought the default cache scope back: the full address again, as the person had it, for the scans that follow)
    await patchSettings({ updates: { autoUpdate: false }, detection: { cacheScope: 'full' } });
    const repaired = await W(() => StorageManager.readSettingsStrict().then(s => s.history.historyEnabled));
    assert.equal(repaired, true, 'readable again, with History on');
    await until(async () => { const a = await alarmsNow(); return !a['scrapfly-history-backup'] && !a['scrapfly-history-watch']; }, 10000, 'the alarms to follow the defaults (off)');
    const after = await scanned(`history-after-${uniq()}`, '&m=1');
    await until(async () => (await historyUrls()).includes(after.url), 10000, 'History to record again');
    await after.page.close();
    const clean = await popupFor();
    await sleep(1500);
    assert.deepEqual(await toasts(clean), [], 'no notice once the settings read');
    await clean.close();
  });

  // ===============================================================================================
  await scenario('Rules, cold worker: stored rules that are not JSON stay as they are; scans use the shipped rules; the repair is picked up at the next scan', async () => {
    const adminPage = await popupFor();
    await setStored({ scrapfly_detectors: SAD_RULES });
    await sleep(500);
    await restartWorker(adminPage);
    const { page, saved } = await scanned(`rules-cold-${uniq()}`, '&m=1&frc=1');
    assert.ok(await workerRunning(adminPage), 'a new worker scanned the page');
    assert.ok(!saved.names.includes(PROBE.name), `the shipped rules do not know the custom rule: ${JSON.stringify(saved.names)}`);
    assert.ok(saved.names.some(name => /Friendly/i.test(String(name))), `the shipped rules serve meanwhile: ${JSON.stringify(saved.names)}`);
    await sleep(1500);
    assert.equal(await rawStored('scrapfly_detectors'), SAD_RULES, 'the stored text is what it was: the shipped rules were not saved over it');
    await page.close();
    await adminPage.close();

    // The person restores their rules (a backup, a repair): the next scan reads them
    await setStored({ scrapfly_detectors: rulesSnapshot });
    const { page: back, saved: again } = await scanned(`rules-repaired-${uniq()}`, '&m=1');
    assert.ok(again.names.includes(PROBE.name), `the custom rule detects again: ${JSON.stringify(again.names)}`);
    await sleep(1500);
    assert.deepEqual(await rawStored('scrapfly_detectors'), rulesSnapshot, 'nothing was written over them');
    await back.close();
  });

  // ===============================================================================================
  await scenario('Both rules and settings damaged, worker restarted: the pause is respected by the new worker, nothing stored changes, and restoring the saved values brings the custom rule back', async () => {
    await W(async () => {
      const raw = (await chrome.storage.local.get('scrapfly_settings')).scrapfly_settings;
      const container = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const settings = container && container.settings && typeof container.settings === 'object' ? container.settings : container;
      settings.history = { ...(settings.history || {}), historyEnabled: false };
      await chrome.storage.local.set({ scrapfly_settings: typeof raw === 'string' ? JSON.stringify(container) : container });
    });
    assert.equal(await W(() => StorageManager.readSettingsStrict().then(s => s.history.historyEnabled)), false);
    const settingsText = await rawStored('scrapfly_settings');
    const historyBefore = (await historyUrls()).length;
    const adminPage = await popupFor();
    await setStored({ scrapfly_settings: SAD_SETTINGS, scrapfly_detectors: SAD_RULES });
    await sleep(500);
    await restartWorker(adminPage);

    // A page a shipped rule finds (the custom rule is not there to be found)
    const { page, saved } = await scanned(`both-${uniq()}`, '&frc=1', { other: 2 });
    assert.ok(saved.names.some(name => /Friendly/i.test(String(name))), `the new worker detects with the shipped rules: ${JSON.stringify(saved.names)}`);
    assert.ok(await workerRunning(adminPage), 'a new worker scanned the page');
    await adminPage.close();
    await page.close();
    await sleep(2500);
    assert.equal((await historyUrls()).length, historyBefore, 'nothing was recorded: History was paused and the new worker could not read that, so it did not guess');
    assert.equal(await rawStored('scrapfly_settings'), SAD_SETTINGS);
    assert.equal(await rawStored('scrapfly_detectors'), SAD_RULES);

    // The person restores both: the custom rule detects again, and the pause is still theirs
    await setStored({ scrapfly_settings: settingsText, scrapfly_detectors: rulesSnapshot });
    const { page: back, saved: again } = await scanned(`both-back-${uniq()}`, '&m=1');
    assert.ok(again.names.includes(PROBE.name), `the custom rule detects again: ${JSON.stringify(again.names)}`);
    await back.close();
    await sleep(2500);
    assert.equal((await historyUrls()).length, historyBefore, 'and History is still paused: the choice survived');
    assert.equal(await W(() => StorageManager.readSettingsStrict().then(s => s.history.historyEnabled)), false);
  });

  // ---- Report ----------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${pageErrors.join('\n  ')}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  console.log(failed.length || pageErrors.length ? 'RESULT FAILED' : `RESULT ALL PASS (${results.length} scenarios)`);
  await ctx.close();
  server.close();
  server2.close();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
