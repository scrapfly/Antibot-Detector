#!/usr/bin/env node
/**
 * Every History option, end to end, in the real extension (unpacked in Chromium):
 *
 *   Settings → History  the new controls, their defaults, saving, reloading, validation, the storage meter
 *   What is recorded    pause, private windows, ignored sites (and their subdomains), minimum confidence,
 *                       fingerprint-only pages
 *   Same page again     skip, or update the earlier entry (same id, moved up, pin and note kept)
 *   Changed + alerts    the badge, its hover text, notifications for all / pinned / no pages
 *   Pins and notes      the "…" menu, the note dialog, the pin icon, what survives auto-delete and the entry limit
 *   Export              the dialog (format, protections, period, site, pinned only), the real file for each format
 *   Backup              Back up now and the alarm write real files to Downloads, in parts when large; the schedule
 *   Storage             the warning near the limit and the record of what was removed
 *   Clear on close      a second browser window closing keeps History; closing the browser clears it (restart check)
 *
 * A local site shows one marker per protection, and four probe detectors (anti-bot A and B, CAPTCHA, fingerprint)
 * recognize them, so the scans are real. Not simulated: a private window (Chromium cannot open one with an
 * unpacked extension in this harness), so the private-tab check makes the worker see a tab flagged `incognito`.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:history
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
const DAY = 24 * 60 * 60 * 1000;

// ---- Local site ---------------------------------------------------------------------------------
const MARKERS = { 'bot-a': 'hist-marker-bot-a', 'bot-b': 'hist-marker-bot-b', captcha: 'hist-marker-captcha', fp: 'hist-marker-fp' };
const dyn = {}; // id -> markers the page shows now (changed by the test between two scans)
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/p') {
    const list = url.searchParams.get('dyn') ? (dyn[url.searchParams.get('dyn')] || []) : (url.searchParams.get('m') || '').split(',').filter(Boolean);
    const body = `<!doctype html><html><head><title>Probe ${url.searchParams.get('n') || url.searchParams.get('dyn') || 'page'}</title></head><body>${list.map(m => `<p>${MARKERS[m] || ''}</p>`).join('')}<p>probe page</p></body></html>`;
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(body);
  }
  res.writeHead(404); res.end();
});

const R = (o) => ({ confidence: 90, standalone: true, ...o, description: o.id });
const probe = (id, name, category, marker, confidence) => ({
  id, name, author: 'Probe', enabled: true, category, difficulty: 'Medium', version: '1.0.0', lastUpdated: '2026-10-19',
  icon: 'custom.png', description: 'History probe', detection: { content: [R({ id: `${id}-marker`, text: marker, confidence })] }
});
const PROBES = [
  ['antibot', probe('detect-histprobe-a', 'HistProbe Bot A', 'Anti-Bot', MARKERS['bot-a'], 90)],
  ['antibot', probe('detect-histprobe-b', 'HistProbe Bot B', 'Anti-Bot', MARKERS['bot-b'], 85)],
  ['captcha', probe('detect-histprobe-c', 'HistProbe Captcha', 'CAPTCHA', MARKERS.captcha, 70)],
  ['fingerprint', probe('detect-histprobe-f', 'HistProbe Fingerprint', 'Fingerprint', MARKERS.fp, 40)]
];

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
    console.log(`FAIL  ${name}\n      ${String((error && error.message) || error).split('\n').join('\n      ')}`);
  }
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-history-'));
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-history-dl-'));
  fs.mkdirSync(path.join(profile, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({
    download: { default_directory: downloads, prompt_for_download: false, directory_upgrade: true },
    savefile: { default_directory: downloads }
  }));

  const launch = () => chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 420, height: 650 }, acceptDownloads: true,
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
  });
  let ctx = await launch();
  let extId;
  const pageErrors = [];

  // The worker may be restarted by Chromium when idle: every call goes through here and re-installs the stubs
  /** The extension's service worker; one that Chromium stopped is woken by opening an extension page. */
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
    let sw = await getWorker();
    if (!(await sw.evaluate(() => globalThis.__e2e === true).catch(() => false))) {
      await sleep(300);
      sw = await getWorker();
      await sw.evaluate(() => {
        globalThis.__e2e = true;
        globalThis.__notes = [];
        chrome.notifications.create = (id, options, cb) => { __notes.push({ id, ...options }); if (typeof cb === 'function') cb(id); return Promise.resolve(id); };
        // What failed inside the worker while saving settings, for the failure messages
        for (const name of ['readSettingsStrict', 'mergeSettingsChanges']) {
          const f = StorageManager[name].bind(StorageManager);
          StorageManager[name] = (...a) => {
            try { const r = f(...a); return r && r.then ? r.catch((e) => { globalThis.__swError = `${name}: ${e.message}`; throw e; }) : r; } catch (e) { globalThis.__swError = `${name}: ${e.message}`; throw e; }
          };
        }
        const setValues = chrome.storage.local.set.bind(chrome.storage.local);
        chrome.storage.local.set = (...a) => setValues(...a).catch((e) => { globalThis.__swError = `storage.set: ${e.message}`; throw e; });
        // Downloads the extension starts: what it asked for (Playwright stores the finished files under random names)
        globalThis.__downloads = [];
        const download = chrome.downloads.download.bind(chrome.downloads);
        chrome.downloads.download = async (options) => {
          if (globalThis.__failDownloads) throw new Error(globalThis.__failDownloads);
          const id = await download(options);
          __downloads.push({ id, filename: options.filename, saveAs: options.saveAs, conflictAction: options.conflictAction });
          return id;
        };
        // A tab whose address contains this text is reported as a private-window tab
        const original = chrome.tabs.get.bind(chrome.tabs);
        chrome.tabs.get = (id, cb) => {
          const p = original(id).then(t => (globalThis.__incognitoMatch && t && t.url && t.url.includes(globalThis.__incognitoMatch) ? { ...t, incognito: true } : t));
          if (typeof cb === 'function') { p.then(cb); return undefined; }
          return p;
        };
      });
    }
    return sw.evaluate(fn, arg);
  }
  const readHistory = async () => JSON.parse((await W(() => chrome.storage.local.get('scrapfly_history'))).scrapfly_history || '{"items":[]}');
  const items = async () => (await readHistory()).items;
  const resetHistory = () => W(() => chrome.storage.local.remove(['scrapfly_history', 'scrapfly_history_storage_notice', 'scrapfly_history_backup']));
  const setHistory = (list, container = {}) => W((value) => chrome.storage.local.set({ scrapfly_history: JSON.stringify(value) }), { items: list, ...container });
  const notes = () => W(() => globalThis.__notes.slice());
  const clearNotes = () => W(() => { globalThis.__notes = []; });
  const names = (item) => (item.detections || []).map(d => (d.detector && d.detector.name) || d.name).sort();

  async function openExtensionPage(file = 'popup.html') {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${file}: ${e.message}`));
    await page.goto(`chrome-extension://${extId}/${file}`);
    await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized && window.popupInstance?.settings?.settingsBaseline, null, { timeout: 30000 });
    return page;
  }
  // Settings are changed in the worker, not from a page: a second popup page would answer the
  // settings request of the page under test first ('received'), which never happens with one popup open
  const patchSettings = (patch) => W((p) => SettingsStore.mutate({ operation: 'patch', patch: p }).then(r => r.success === true), patch);
  const settingsNow = () => W(() => StorageManager.readSettingsStrict());
  const historySettings = (patch, duplicatePrevention) => patchSettings({ history: patch, ...(duplicatePrevention ? { duplicatePrevention } : {}) });

  async function open(url) {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'commit' }).catch(() => {});
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    return page;
  }
  /** Wait until `predicate(items)` holds (a scan finished and was recorded); false after `ms`. */
  async function waitFor(predicate, ms = 20000) {
    const end = Date.now() + ms;
    for (;;) {
      const list = await items();
      if (predicate(list)) return list;
      if (Date.now() > end) return null;
      await sleep(400);
    }
  }
  /** Visit a page and wait for its entry (count grows by one, or `match` finds it). */
  async function visitSaved(url, { match } = {}) {
    const before = (await items()).length;
    const page = await open(url);
    try {
      const list = await waitFor(l => (match ? l.some(match) : l.length > before));
      assert.ok(list, `no History entry appeared for ${url}`);
      return match ? list.find(match) : list[0];
    } finally { await page.close(); }
  }
  /** Visit pages that must NOT be recorded: wait long enough for a scan to finish, then compare. */
  async function visitNotSaved(urls, settle = 9000) {
    const before = JSON.stringify((await items()).map(i => i.id));
    const pages = await Promise.all(urls.map(open));
    await sleep(settle);
    await Promise.all(pages.map(p => p.close()));
    assert.equal(JSON.stringify((await items()).map(i => i.id)), before, `History changed for ${urls.join(' ')}`);
  }
  // A closed dialog fades out for a moment: the next one must not be confused with it
  const dialogsGone = (page) => page.waitForFunction(() => document.querySelectorAll('.notification-confirm').length === 0, null, { timeout: 8000 });
  const url = (query, base = origin) => `${base}/p?${query}`;
  let counter = 0;
  const uniq = () => `n=${Date.now().toString(36)}${counter++}`;

  // ---- Start-up: probe detectors, scan cache per full address ---------------------------------------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  const warm = await ctx.newPage();
  await warm.goto(`chrome-extension://${extId}/popup.html`);
  await warm.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  await warm.close();

  const admin = await openExtensionPage();
  await admin.evaluate(async (probes) => {
    const dm = window.popupInstance.detectorManager;
    for (const [category, det] of probes) await dm.addDetector(category, det.id, det);
    await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r()));
  }, PROBES);
  await admin.close();
  await sleep(1500);
  await patchSettings({ detection: { cacheScope: 'full' } });
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

  const baseline = { historyBypassCache: false, historyEnabled: true, historySkipIncognito: true, historyMinConfidence: 0, historySkipFingerprintOnly: false, historyExcludedDomains: [], historyChangeAlerts: 'off', historyBackup: 'off', historyClearOnClose: false, historyLimit: 0, historyAutoDelete: false, exportFormat: 'json', includeTimestamps: true };
  const baseDup = { preventDuplicates: false, duplicateAction: 'skip', duplicateScope: 'full_url', duplicateDuration: 1, duplicateUnit: 'hours' };
  const resetSettings = async () => { await historySettings(baseline, baseDup); await W(() => { globalThis.__incognitoMatch = ''; }); };
  await resetSettings();
  await resetHistory();

  // ===============================================================================================
  await scenario('probe detectors: a page is recorded with the right protections (the harness works)', async () => {
    const entry = await visitSaved(url(`m=bot-a,captcha,fp&${uniq()}`));
    assert.deepEqual(names(entry), ['HistProbe Bot A', 'HistProbe Captcha', 'HistProbe Fingerprint']);
    const strongest = Math.max(...entry.detections.map(d => d.confidence));
    assert.ok(strongest >= 85, `strongest confidence ${strongest}`);
    console.log(`      confidence by probe: ${entry.detections.map(d => `${(d.detector && d.detector.name) || d.name}=${d.confidence}`).join(', ')}`);
  });

  // ===============================================================================================
  await scenario('Settings → History: every new control exists with its default, saves, reloads, and rejects a bad value', async () => {
    await resetHistory();
    await resetSettings();
    const page = await openExtensionPage();
    const click = (selector) => page.$eval(selector, el => el.click());
    const field = (selector, value) => page.$eval(selector, (el, v) => {
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    const read = (selector) => page.$eval(selector, el => (el.type === 'checkbox' ? el.checked : el.value));
    const open = async () => {
      await click('#settingsBtn');
      await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'));
      await page.evaluate(() => window.popupInstance.settings.loadSettings());
      await click('.settings-tab-btn[data-settings-tab="history"]');
    };
    const noticeLog = () => page.evaluate(() => globalThis.__notices || []);
    const consoleLog = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleLog.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
    await page.evaluate(() => {
      const commit = StorageManager.commitSettings.bind(StorageManager);
      StorageManager.commitSettings = async (...args) => {
        try { return await commit(...args); } catch (error) { globalThis.__commitError = String((error && error.message) || error); throw error; }
      };
      globalThis.__notices = [];
      for (const type of ['error', 'success']) {
        const original = NotificationHelper[type].bind(NotificationHelper);
        NotificationHelper[type] = (...args) => { __notices.push(type); return original(...args); };
      }
    });
    try {
      await open();
      const defaults = { '#historyEnabled': true, '#historySkipIncognito': true, '#historyMinConfidence': '0', '#historySkipFingerprintOnly': false, '#historyExcludedDomains': '', '#historyChangeAlerts': 'off', '#historyBackup': 'off', '#historyClearOnClose': false, '#duplicateAction': 'skip' };
      for (const [selector, expected] of Object.entries(defaults)) assert.equal(await read(selector), expected, `default of ${selector}`);

      const wanted = { '#historyEnabled': false, '#historySkipIncognito': false, '#historyMinConfidence': '55', '#historySkipFingerprintOnly': true, '#historyExcludedDomains': 'Bank.com\nhttps://shop.example.org:8443/x, *.cdn.net', '#historyChangeAlerts': 'pinned', '#historyBackup': 'weekly', '#historyClearOnClose': true, '#duplicateAction': 'update' };
      for (const [selector, value] of Object.entries(wanted)) await field(selector, value);
      await click('#saveSettingsBtn');
      await page.waitForFunction(() => !document.querySelector('#settingsModal').classList.contains('is-open'), null, { timeout: 10000 }).catch(async (error) => {
        const toasts = await page.$$eval('.notification-message, .notification-toast', els => els.map(el => el.textContent.trim()).filter(Boolean));
        // Replay the same change inside the worker to read the real reason
        const replay = await page.evaluate(() => { const ui = window.popupInstance.settings; return { baseline: ui.settingsBaseline, candidate: ui.deepMerge(ui.settings, ui.getSettingsFromUI()) }; });
        const reason = await W(async (m) => { try { await SettingsStore.mutate({ operation: 'merge', ...m }); return 'the same change saves when replayed in the worker'; } catch (e) { return String((e && e.stack) || e).split('\n').slice(0, 4).join(' / '); } }, replay);
        const why = `${await page.evaluate(() => globalThis.__commitError || '')} ${reason}`.trim();
        throw new Error(`Save did not close Settings: ${toasts.join(' | ') || 'no message shown'}${why ? ` [${why}]` : ''} (${error.message.split('\n')[0]})\n${consoleLog.slice(-6).join('\n')}`);
      });
      const saved = await settingsNow();
      assert.equal(saved.history.historyEnabled, false);
      assert.equal(saved.history.historySkipIncognito, false);
      assert.equal(saved.history.historyMinConfidence, 55);
      assert.equal(saved.history.historySkipFingerprintOnly, true);
      assert.deepEqual(saved.history.historyExcludedDomains, ['bank.com', 'shop.example.org', 'cdn.net']);
      assert.equal(saved.history.historyChangeAlerts, 'pinned');
      assert.equal(saved.history.historyBackup, 'weekly');
      assert.equal(saved.history.historyClearOnClose, true);
      assert.equal(saved.duplicatePrevention.duplicateAction, 'update');

      // The controls show what was saved
      await open();
      assert.equal(await read('#historyEnabled'), false);
      assert.equal(await read('#historyMinConfidence'), '55');
      assert.equal(await read('#historyExcludedDomains'), 'bank.com\nshop.example.org\ncdn.net');
      assert.equal(await read('#historyChangeAlerts'), 'pinned');
      assert.equal(await read('#historyBackup'), 'weekly');
      assert.equal(await read('#duplicateAction'), 'update');

      // A value out of range is refused and nothing is saved
      await field('#historyMinConfidence', '150');
      await page.evaluate(() => { __notices.length = 0; });
      await click('#saveSettingsBtn');
      await sleep(800);
      assert.equal((await settingsNow()).history.historyMinConfidence, 55, 'the bad value was not saved');
      assert.ok((await noticeLog()).includes('error'), 'an error was shown');
      assert.ok(await page.$eval('#settingsModal', el => el.classList.contains('is-open')), 'the settings stay open');
      await click('#cancelSettingsBtn');
    } finally { await page.close(); }
    await resetSettings();
  });

  // ===============================================================================================
  await scenario('Pause History (master switch)', async () => {
    await resetHistory();
    await historySettings({ historyEnabled: false });
    await visitNotSaved([url(`m=bot-a&${uniq()}`)]);
    await historySettings({ historyEnabled: true });
    const entry = await visitSaved(url(`m=bot-a&${uniq()}`));
    assert.deepEqual(names(entry), ['HistProbe Bot A']);
  });

  await scenario("Don't save private-window pages (the worker sees a private tab)", async () => {
    await resetHistory();
    await W(() => { globalThis.__incognitoMatch = 'incog'; });
    await historySettings({ historySkipIncognito: true });
    await visitNotSaved([url(`m=bot-a&incog=1&${uniq()}`)]);
    await visitSaved(url(`m=bot-a&${uniq()}`)); // a normal tab is recorded
    await historySettings({ historySkipIncognito: false });
    const entry = await visitSaved(url(`m=bot-a&incog=2&${uniq()}`), { match: i => /incog=2/.test(i.url) });
    assert.ok(entry, 'recorded once private pages are allowed');
    await W(() => { globalThis.__incognitoMatch = ''; });
    await resetSettings();
  });

  await scenario('Ignored sites: the site and its subdomains are skipped, others are recorded', async () => {
    await resetHistory();
    await historySettings({ historyExcludedDomains: ['localhost'] });
    await visitNotSaved([url(`m=bot-a&${uniq()}`, `http://localhost:${port}`), url(`m=bot-a&${uniq()}`, `http://sub.localhost:${port}`)]);
    const entry = await visitSaved(url(`m=bot-a&${uniq()}`)); // 127.0.0.1 is another site
    assert.equal(entry.hostname, '127.0.0.1');
    await resetSettings();
  });

  await scenario('Minimum confidence: weaker pages are skipped, the minimum itself is recorded', async () => {
    await resetHistory();
    await historySettings({ historyMinConfidence: 80 });
    await visitNotSaved([url(`m=captcha&${uniq()}`)]); // 70
    await visitSaved(url(`m=bot-a&${uniq()}`)); // 90
    await historySettings({ historyMinConfidence: 90 });
    await visitSaved(url(`m=bot-a,captcha&${uniq()}`), { match: i => i.detections.length === 2 });
    await resetSettings();
  });

  await scenario('Skip fingerprint-only pages', async () => {
    await resetHistory();
    await historySettings({ historySkipFingerprintOnly: true });
    await visitNotSaved([url(`m=fp&${uniq()}`)]);
    const entry = await visitSaved(url(`m=fp,captcha&${uniq()}`));
    assert.deepEqual(names(entry), ['HistProbe Captcha', 'HistProbe Fingerprint']);
    await historySettings({ historySkipFingerprintOnly: false });
    await visitSaved(url(`m=fp&${uniq()}`)); // off: a fingerprint-only page is recorded
    await resetSettings();
  });

  // ===============================================================================================
  await scenario('Same page again: skip keeps one entry; "update" refreshes it (same id, moved up, pin and note kept)', async () => {
    await resetHistory();
    // A revisit is saved from the scan cache only with "Save to History even when the result comes from cache" on
    await historySettings({ historyBypassCache: true }, { preventDuplicates: true, duplicateAction: 'skip', duplicateScope: 'full_url', duplicateDuration: 1, duplicateUnit: 'hours' });
    const pageUrl = url(`m=bot-a&dup=1&${uniq()}`);
    const first = await visitSaved(pageUrl);
    await visitSaved(url(`m=captcha&other=1&${uniq()}`)); // another page, so the first is no longer on top
    await clearNotes();
    // Revisit while the scan is cached (a cache hit) and with skip on: nothing new
    let page = await open(pageUrl);
    await sleep(8000);
    await page.close();
    assert.equal((await items()).filter(i => i.url === pageUrl).length, 1, 'skip: still one entry');
    assert.equal((await items()).findIndex(i => i.url === pageUrl), 1, 'skip: not moved');

    // Pin it and add a note the way the History tab does (through the worker)
    const popup = await openExtensionPage();
    await popup.evaluate((id) => chrome.runtime.sendMessage({ type: HistoryStore.Messages.UPDATE_ITEM, id, patch: { pinned: true, note: 'keep me' } }), first.id);
    await popup.close();

    await historySettings({}, { duplicateAction: 'update' });
    page = await open(pageUrl);
    const updated = await waitFor(l => l[0] && l[0].url === pageUrl, 20000);
    await page.close();
    assert.ok(updated, 'the entry moved to the top');
    const list = await items();
    assert.equal(list.filter(i => i.url === pageUrl).length, 1, 'update: still one entry');
    assert.equal(list[0].id, first.id, 'same entry');
    assert.equal(list[0].firstSeen, first.timestamp, 'first-seen date kept');
    assert.ok(list[0].timestamp > first.timestamp, 'newer scan time');
    assert.equal(list[0].pinned, true);
    assert.equal(list[0].note, 'keep me');
    await resetSettings();
  });

  // ===============================================================================================
  const changePage = (id, n) => url(`dyn=${id}&${n}`);
  async function scanChange(id, firstMarkers, secondMarkers) {
    dyn[id] = firstMarkers;
    const first = await visitSaved(changePage(id, 'v=1'), { match: i => i.url === changePage(id, 'v=1') });
    dyn[id] = secondMarkers;
    const second = await visitSaved(changePage(id, 'v=2'), { match: i => i.url === changePage(id, 'v=2') });
    return { first, second };
  }
  const swNoteFor = async (host) => (await notes()).filter(n => /scrapfly-history-change/.test(n.id) && n.title.includes(host));

  await scenario('Changed badge and alerts: all pages', async () => {
    await resetHistory(); await clearNotes();
    await historySettings({ historyChangeAlerts: 'all' });
    const { first, second } = await scanChange('chg-all', ['bot-a', 'fp'], ['bot-b', 'captcha', 'fp']);
    assert.ok(!first.changed, 'the first scan has no change');
    assert.deepEqual(second.changed && { added: second.changed.added.sort(), removed: second.changed.removed }, { added: ['HistProbe Bot B', 'HistProbe Captcha'], removed: ['HistProbe Bot A'] });
    const sent = await swNoteFor('127.0.0.1');
    assert.equal(sent.length, 1, JSON.stringify(await notes()));
    assert.match(sent[0].title, /^Protections changed on 127\.0\.0\.1$/);
    assert.match(sent[0].message, /Added: .*HistProbe Bot B/);
    assert.match(sent[0].message, /Removed: HistProbe Bot A/);
  });

  await scenario('Change alerts: off sends nothing but the badge is still recorded; pinned-only alerts only for pinned pages', async () => {
    await resetHistory(); await clearNotes();
    await historySettings({ historyChangeAlerts: 'off' });
    const off = await scanChange('chg-off', ['bot-a'], ['bot-b']);
    assert.ok(off.second.changed);
    assert.equal((await swNoteFor('127.0.0.1')).length, 0, 'off: silent');

    await resetHistory(); await clearNotes();
    await historySettings({ historyChangeAlerts: 'pinned' });
    const plain = await scanChange('chg-pinned-no', ['bot-a'], ['bot-b']);
    assert.ok(plain.second.changed);
    assert.equal((await swNoteFor('127.0.0.1')).length, 0, 'pinned only: an unpinned page is silent');

    // Same page family, now pinned before the second scan
    dyn['chg-pinned-yes'] = ['bot-a'];
    const first = await visitSaved(changePage('chg-pinned-yes', 'v=1'), { match: i => i.url === changePage('chg-pinned-yes', 'v=1') });
    const popup = await openExtensionPage();
    await popup.evaluate((id) => chrome.runtime.sendMessage({ type: HistoryStore.Messages.UPDATE_ITEM, id, patch: { pinned: true } }), first.id);
    await popup.close();
    dyn['chg-pinned-yes'] = ['bot-b'];
    await visitSaved(changePage('chg-pinned-yes', 'v=2'), { match: i => i.url === changePage('chg-pinned-yes', 'v=2') });
    assert.equal((await swNoteFor('127.0.0.1')).length, 1, 'pinned only: a pinned page is announced');
    await resetSettings();
  });

  // ===============================================================================================
  await scenario('History tab: pin icon, note, Changed badge with its hover text, and the "…" menu', async () => {
    const now = Date.now();
    await setHistory([
      { id: 'u1', url: 'https://one.example/', hostname: 'one.example', title: 'One', timestamp: now, detections: [{ detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 95, difficulty: 'Medium' }], pinned: true, note: 'check the captcha later', changed: { at: now - 3600000, added: ['DataDome'], removed: ['Akamai'] } },
      { id: 'u2', url: 'https://two.example/', hostname: 'two.example', title: 'Two', timestamp: now - 1000, detections: [{ detector: { name: 'hCaptcha' }, category: 'CAPTCHA', confidence: 80, difficulty: 'Low' }] }
    ]);
    const page = await openExtensionPage();
    try {
      await page.$eval('#nav-history', el => el.click());
      await page.waitForSelector('.history-item');
      const cards = await page.$$eval('.history-item', els => els.map(el => ({
        id: el.dataset.historyId, pin: !!el.querySelector('.history-pin'), note: (el.querySelector('.history-note') || {}).textContent || '',
        badge: (el.querySelector('.history-changed-badge') || {}).textContent || '',
        badgeTip: (el.querySelector('.history-changed-badge') || { getAttribute() {} }).getAttribute('data-tip-rows')
      })));
      assert.deepEqual(cards.map(c => [c.id, c.pin, c.note, c.badge]), [['u1', true, 'check the captcha later', 'Changed'], ['u2', false, '', '']]);
      const rows = JSON.parse(cards[0].badgeTip).map(r => r.label);
      assert.deepEqual(rows, ['Added: DataDome', 'Removed: Akamai']);

      // The menu names the action for this entry (Unpin / Edit note on the first, Pin / Add note on the second)
      const menuLabels = async (index) => {
        await page.$$eval('.history-item .history-more-btn', (els, i) => els[i].click(), index);
        await page.waitForSelector('#historyItemMenu:not([hidden])');
        const labels = await page.$$eval('#historyItemMenu [data-menu-label]', els => els.map(el => el.textContent));
        return labels;
      };
      assert.deepEqual(await menuLabels(0), ['Unpin', 'Edit note']);
      await page.keyboard.press('Escape');
      assert.deepEqual(await menuLabels(1), ['Pin', 'Add note']);

      // Pin the second entry
      await page.$eval('#historyItemMenu [data-action="pin"]', el => el.click());
      await waitFor(l => l.find(i => i.id === 'u2')?.pinned === true, 8000);
      assert.equal((await items()).find(i => i.id === 'u2').pinned, true);
      await page.waitForFunction(() => document.querySelectorAll('.history-pin').length === 2);

      // Add a note through the dialog
      await page.$$eval('.history-item .history-more-btn', (els) => els[1].click());
      await page.waitForSelector('#historyItemMenu:not([hidden])');
      await page.$eval('#historyItemMenu [data-action="note"]', el => el.click());
      await page.waitForSelector('.notification-confirm textarea');
      assert.equal(await page.$eval('.notification-confirm textarea', el => el.value), '', 'a new note starts empty');
      assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.tagName), 'TEXTAREA', 'the field has focus');
      await page.fill('.notification-confirm textarea', '  looks  protected\nby   hCaptcha ');
      await page.$eval('.notification-btn-confirm', el => el.click());
      await dialogsGone(page);
      await waitFor(l => !!l.find(i => i.id === 'u2')?.note, 8000);
      assert.equal((await items()).find(i => i.id === 'u2').note, 'looks protected by hCaptcha', 'one trimmed line');
      await page.waitForFunction(() => [...document.querySelectorAll('.history-note')].some(el => el.textContent === 'looks protected by hCaptcha'));

      // Edit it: the dialog starts with the saved note; Cancel changes nothing, an empty note removes it
      await page.$$eval('.history-item .history-more-btn', (els) => els[1].click());
      await page.waitForSelector('#historyItemMenu:not([hidden])');
      await page.$eval('#historyItemMenu [data-action="note"]', el => el.click());
      await page.waitForSelector('.notification-confirm textarea');
      assert.equal(await page.$eval('.notification-confirm textarea', el => el.value), 'looks protected by hCaptcha');
      await page.fill('.notification-confirm textarea', 'changed my mind');
      await page.$eval('.notification-btn-cancel', el => el.click());
      await dialogsGone(page);
      assert.equal((await items()).find(i => i.id === 'u2').note, 'looks protected by hCaptcha', 'Cancel keeps the note');
      await page.$$eval('.history-item .history-more-btn', (els) => els[1].click());
      await page.waitForSelector('#historyItemMenu:not([hidden])');
      await page.$eval('#historyItemMenu [data-action="note"]', el => el.click());
      await page.waitForSelector('.notification-confirm textarea');
      await page.fill('.notification-confirm textarea', '');
      await page.keyboard.press('Enter'); // Enter in a multi-line field adds a line, it does not submit
      assert.equal(await page.$$eval('.notification-confirm', els => els.length), 1, 'Enter inside the note field does not close the dialog');
      await page.fill('.notification-confirm textarea', '');
      await page.$eval('.notification-btn-confirm', el => el.click());
      await dialogsGone(page);
      await waitFor(l => !('note' in l.find(i => i.id === 'u2')), 8000);
      assert.ok(!('note' in (await items()).find(i => i.id === 'u2')), 'an empty note removes it');

      // Unpin the first entry
      await page.$$eval('.history-item .history-more-btn', (els) => els[0].click());
      await page.waitForSelector('#historyItemMenu:not([hidden])');
      await page.$eval('#historyItemMenu [data-action="pin"]', el => el.click());
      await waitFor(l => !l.find(i => i.id === 'u1')?.pinned, 8000);
      assert.ok(!(await items()).find(i => i.id === 'u1').pinned);
    } finally { await page.close(); }
  });

  await scenario('Pinned entries survive auto-delete and the entry limit; unpinned ones go', async () => {
    const now = Date.now();
    const old = (id, ageDays, extra = {}) => ({ id, url: `https://${id}.example/`, hostname: `${id}.example`, title: id, timestamp: now - ageDays * DAY, detections: [{ detector: { name: 'X' }, category: 'Anti-Bot', confidence: 90 }], ...extra });
    await setHistory([old('new1', 1), old('new2', 2), old('pin-old', 400, { pinned: true }), old('old1', 100), old('old2', 200)]);
    await historySettings({ historyAutoDelete: true, historyAutoDeleteDays: 30 });
    const removed = await W(() => HistoryRetention.run('e2e'));
    assert.equal(removed, 2);
    assert.deepEqual((await items()).map(i => i.id), ['new1', 'new2', 'pin-old']);
    await historySettings({ historyAutoDelete: false, historyLimit: 1 });
    await W(() => HistoryRetention.run('e2e'));
    assert.deepEqual((await items()).map(i => i.id), ['new1', 'pin-old']);
    await resetSettings();
  });

  // ===============================================================================================
  const exportSeed = () => {
    const now = Date.now();
    const d = (name, category, confidence) => ({ detector: { name }, category, confidence, difficulty: 'Medium' });
    return [
      { id: 'x1', url: 'https://shop.example.com/a?x=1', hostname: 'shop.example.com', title: 'Shop', timestamp: now - 1 * DAY, detections: [d('Cloudflare', 'Anti-Bot', 95)], pinned: true, note: 'a "quoted", note' },
      { id: 'x2', url: 'https://news.example.org/', hostname: 'news.example.org', title: 'News', timestamp: now - 10 * DAY, detections: [d('reCAPTCHA', 'CAPTCHA', 80), d('Canvas', 'Fingerprint', 30)] },
      { id: 'x3', url: 'https://old.example.net/', hostname: 'old.example.net', title: 'Old', timestamp: now - 60 * DAY, detections: [d('Canvas', 'Fingerprint', 40)] },
      { id: 'x4', url: 'https://bank.test/', hostname: 'bank.test', title: 'Bank', timestamp: now - 120 * DAY, detections: [d('Akamai', 'Anti-Bot', 70)], pinned: true }
    ];
  };
  async function exportVia(page, choices) {
    await dialogsGone(page);
    await page.$eval('#historyMenuBtn', el => el.click());
    await page.waitForSelector('#historyMenu:not([hidden])');
    await page.$eval('#exportHistoryBtn', el => el.click());
    await page.waitForSelector('.notification-confirm .history-dialog-form');
    const set = (index, value) => page.$$eval('.notification-confirm .history-dialog-input', (els, [i, v]) => {
      els[i].value = v; els[i].dispatchEvent(new Event(els[i].tagName === 'INPUT' ? 'input' : 'change', { bubbles: true }));
    }, [index, value]);
    // order: format, protections, period, site
    if (choices.format) await set(0, choices.format);
    if (choices.category) await set(1, choices.category);
    if (choices.days !== undefined) await set(2, String(choices.days));
    if (choices.domain !== undefined) await set(3, choices.domain);
    if (choices.pinnedOnly !== undefined) await page.$eval('.notification-confirm .history-dialog-check input', (el, v) => { el.checked = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, choices.pinnedOnly);
    const count = await page.$eval('.history-dialog-count', el => el.textContent);
    if (choices.cancel) { await page.$eval('.notification-btn-cancel', el => el.click()); await dialogsGone(page); return { count }; }
    const downloadPromise = page.waitForEvent('download', { timeout: choices.expectNone ? 2500 : 10000 }).catch(() => null);
    await page.$eval('.notification-btn-confirm', el => el.click());
    const download = await downloadPromise;
    await dialogsGone(page);
    if (!download) return { count, none: true };
    return { count, file: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8') };
  }

  await scenario('Export dialog: default format from Settings, filters, counts, and the real file for each format', async () => {
    await setHistory(exportSeed());
    await historySettings({ exportFormat: 'csv', includeTimestamps: false });
    const page = await openExtensionPage();
    try {
      await page.$eval('#nav-history', el => el.click());
      await page.waitForSelector('.history-item');

      // The dialog starts with the format chosen in Settings and counts every entry
      await page.$eval('#historyMenuBtn', el => el.click());
      await page.waitForSelector('#historyMenu:not([hidden])');
      await page.$eval('#exportHistoryBtn', el => el.click());
      await page.waitForSelector('.notification-confirm .history-dialog-form');
      assert.equal(await page.$eval('.notification-confirm .history-dialog-input', el => el.value), 'csv');
      assert.match(await page.$eval('.history-dialog-count', el => el.textContent), /4/);
      await page.$eval('.notification-btn-cancel', el => el.click());
      await dialogsGone(page);

      // CSV without timestamps, pinned pages only
      let out = await exportVia(page, { pinnedOnly: true });
      assert.match(out.file, /^scrapfly-history-\d{4}-\d{2}-\d{2}\.csv$/);
      const lines = out.text.trim().split('\r\n');
      assert.equal(lines[0], 'url,hostname,title,protection,category,confidence,difficulty,pinned,note');
      assert.equal(lines.length, 3, 'two pinned entries, one detection each');
      assert.ok(lines[1].includes('"a ""quoted"", note"'), lines[1]);
      assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(out.text), 'no timestamps');

      // The count text follows the filters
      await page.$eval('#historyMenuBtn', el => el.click());
      await page.waitForSelector('#historyMenu:not([hidden])');
      await page.$eval('#exportHistoryBtn', el => el.click());
      await page.waitForSelector('.notification-confirm .history-dialog-form');
      const countAfter = async (index, value) => {
        await page.$$eval('.notification-confirm .history-dialog-input', (els, [i, v]) => { els[i].value = v; els[i].dispatchEvent(new Event(els[i].tagName === 'INPUT' ? 'input' : 'change', { bubbles: true })); }, [index, value]);
        return page.$eval('.history-dialog-count', el => el.textContent);
      };
      assert.match(await countAfter(1, 'fingerprint'), /2/);
      assert.match(await countAfter(1, 'captcha'), /1/);
      await countAfter(1, 'all');
      assert.match(await countAfter(2, '30'), /2/);
      assert.match(await countAfter(2, '90'), /3/);
      await countAfter(2, '0');
      assert.match(await countAfter(3, 'EXAMPLE'), /3/);
      assert.match(await countAfter(3, 'zzz-none'), /No entries match/i);
      await page.$eval('.notification-btn-cancel', el => el.click());
      await dialogsGone(page);

      // Nothing matches: confirming exports nothing and says so
      out = await exportVia(page, { domain: 'zzz-none', expectNone: true });
      assert.ok(out.none, 'no file for an empty selection');
      await sleep(500);

      // JSON keeps every field, whatever the timestamp setting
      out = await exportVia(page, { format: 'json', category: 'antibot', days: 30 });
      const data = JSON.parse(out.text);
      assert.match(out.file, /\.json$/);
      assert.equal(data.itemsCount, 1);
      assert.equal(data.items[0].id, 'x1');
      assert.ok(Number.isFinite(data.items[0].timestamp), 'the JSON export keeps the timestamp');
      assert.equal(data.items[0].pinned, true);
      assert.equal(data.items[0].note, 'a "quoted", note');

      // Plain text, with dates once Settings asks for them
      await historySettings({ includeTimestamps: true });
      await page.close();
      const page2 = await openExtensionPage();
      await page2.$eval('#nav-history', el => el.click());
      await page2.waitForSelector('.history-item');
      out = await exportVia(page2, { format: 'txt', domain: 'shop' });
      assert.match(out.file, /\.txt$/);
      assert.match(out.text, /^Shop\nhttps:\/\/shop\.example\.com\/a\?x=1\nDate: \d{4}-\d{2}-\d{2}T/);
      assert.match(out.text, /Pinned\nNote: a "quoted", note/);
      await page2.close();
    } finally { await page.close().catch(() => {}); }
    await resetSettings();
  });

  // ===============================================================================================
  /** The downloads the extension started, once finished: the name it asked for and where the file ended up. */
  const waitDownloads = async (count, ms = 20000) => {
    const end = Date.now() + ms;
    for (;;) {
      const started = await W(() => globalThis.__downloads.slice());
      const states = await W((ids) => Promise.all(ids.map(id => chrome.downloads.search({ id }).then(r => r[0] && { state: r[0].state, file: r[0].filename }))), started.map(d => d.id));
      const done = started.map((d, i) => ({ name: d.filename, saveAs: d.saveAs, conflictAction: d.conflictAction, state: states[i] && states[i].state, file: states[i] && states[i].file })).filter(d => d.state === 'complete');
      if (done.length >= count) return done;
      if (Date.now() > end) throw new Error(`downloads: wanted ${count} finished, got ${JSON.stringify(started)} / ${JSON.stringify(states)}`);
      await sleep(400);
    }
  };

  await scenario('Backup: "Back up now" writes a real file to Downloads/Scrapfly; the file is a valid export', async () => {
    await setHistory(exportSeed());
    await historySettings({ exportFormat: 'json', includeTimestamps: true });
    const page = await openExtensionPage();
    try {
      await page.$eval('#settingsBtn', el => el.click());
      await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'));
      await page.$eval('.settings-tab-btn[data-settings-tab="history"]', el => el.click());
      await page.waitForFunction(() => /No backup yet/i.test(document.querySelector('#historyBackupLast')?.textContent || ''), null, { timeout: 8000 });
      await page.$eval('#historyBackupNowBtn', el => el.click());
      const [backup] = await waitDownloads(1);
      assert.match(backup.name, /^Scrapfly\/scrapfly-history-\d{4}-\d{2}-\d{2}\.json$/);
      assert.equal(backup.saveAs, false, 'saved without asking');
      assert.equal(backup.conflictAction, 'uniquify');
      const data = JSON.parse(fs.readFileSync(backup.file, 'utf8'));
      assert.equal(data.itemsCount, 4);
      assert.deepEqual(data.items.map(i => i.id), ['x1', 'x2', 'x3', 'x4']);
      await page.waitForFunction(() => /Last backup/i.test(document.querySelector('#historyBackupLast')?.textContent || ''), null, { timeout: 8000 });
      const state = (await W(() => chrome.storage.local.get('scrapfly_history_backup'))).scrapfly_history_backup;
      assert.equal(state.ok, true);
      assert.equal(state.entries, 4);
      assert.equal(state.trigger, 'manual');
    } finally { await page.close(); }
  });

  await scenario('Backup: honours the export format and timestamp setting, and splits a large History into parts that each import', async () => {
    const before = (await waitDownloads(0)).length;
    // About 3 MB of History: more than one part (each part is at most 900 KB)
    const now = Date.now();
    const big = Array.from({ length: 30 }, (_, i) => ({ id: `big${i}`, url: `https://big${i}.example/`, hostname: `big${i}.example`, title: `Big ${i}`, timestamp: now - i * 1000, detections: [{ detector: { name: 'X' }, category: 'Anti-Bot', confidence: 90 }], note: 'n'.repeat(100000) }));
    await setHistory(big.map(i => ({ ...i, note: i.note.slice(0, 100000) })));
    await historySettings({ exportFormat: 'json' });
    const result = await W(() => HistoryBackup.run('manual'));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.files >= 3, `expected several parts, got ${result.files}`);
    const files = (await waitDownloads(before + result.files)).filter(d => /-part-\d+\.json$/.test(d.name));
    assert.equal(files.length, result.files);
    const ids = [];
    for (const part of files.sort((a, b) => Number(/part-(\d+)/.exec(a.name)[1]) - Number(/part-(\d+)/.exec(b.name)[1]))) {
      assert.ok(fs.statSync(part.file).size < 1000000, `${part.name} is ${fs.statSync(part.file).size} bytes`);
      ids.push(...JSON.parse(fs.readFileSync(part.file, 'utf8')).items.map(i => i.id));
    }
    assert.deepEqual(files.map(d => d.name).sort(), Array.from({ length: result.files }, (_, i) => `Scrapfly/scrapfly-history-${new Date().toISOString().split('T')[0]}-part-${i + 1}.json`), 'numbered parts');
    assert.deepEqual(ids, big.map(i => i.id), 'every entry, once, in order');

    await setHistory(exportSeed());
    await historySettings({ exportFormat: 'csv', includeTimestamps: false });
    const csvBefore = (await waitDownloads(0)).length;
    assert.equal((await W(() => HistoryBackup.run('manual'))).ok, true);
    const all = await waitDownloads(csvBefore + 1);
    const csv = all.find(d => /\.csv$/.test(d.name));
    assert.ok(csv, 'a CSV backup was written');
    assert.equal(fs.readFileSync(csv.file, 'utf8').split('\r\n')[0], 'url,hostname,title,protection,category,confidence,difficulty,pinned,note');
    await resetSettings();
  });

  await scenario('Backup schedule: the alarm follows the setting, and a real alarm writes a backup', async () => {
    await setHistory(exportSeed());
    const alarm = () => W(() => chrome.alarms.get('scrapfly-history-backup'));
    await historySettings({ historyBackup: 'daily' });
    await sleep(800);
    assert.equal((await alarm()).periodInMinutes, 1440);
    await historySettings({ historyBackup: 'weekly' });
    await sleep(800);
    assert.equal((await alarm()).periodInMinutes, 10080);
    await historySettings({ historyBackup: 'monthly' });
    await sleep(800);
    assert.equal((await alarm()).periodInMinutes, 43200);
    await historySettings({ historyBackup: 'off' });
    await sleep(800);
    assert.equal(await alarm(), undefined, 'off: no alarm');

    // A real alarm event: re-create the alarm to fire in a few seconds (unpacked extensions may use short delays)
    const before = (await waitDownloads(0)).length;
    await W(() => { chrome.alarms.create('scrapfly-history-backup', { delayInMinutes: 0.05 }); });
    await waitDownloads(before + 1, 30000);
    const state = (await W(() => chrome.storage.local.get('scrapfly_history_backup'))).scrapfly_history_backup;
    assert.equal(state.trigger, 'alarm');
    assert.equal(state.ok, true);
    await W(() => chrome.alarms.clear('scrapfly-history-backup'));
  });

  // ===============================================================================================
  const settingsHistoryTab = async (page) => {
    await page.$eval('#settingsBtn', el => el.click());
    await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'));
    await page.$eval('.settings-tab-btn[data-settings-tab="history"]', el => el.click());
  };
  const toastTexts = (page) => page.$$eval('.notification-message', els => els.map(el => el.textContent.trim()).filter(Boolean));

  await scenario('Back up now: a failure says why (the browser refused the download)', async () => {
    await setHistory(exportSeed());
    await W(() => { globalThis.__failDownloads = 'Download blocked by policy'; });
    const page = await openExtensionPage();
    try {
      await settingsHistoryTab(page);
      await page.$eval('#historyBackupNowBtn', el => el.click());
      await page.waitForFunction(() => [...document.querySelectorAll('.notification-message')].some(el => /History backup failed/.test(el.textContent)), null, { timeout: 8000 });
      const toasts = await toastTexts(page);
      assert.ok(toasts.some(t => t === 'History backup failed: Download blocked by policy'), toasts.join(' | '));
    } finally { await page.close(); await W(() => { globalThis.__failDownloads = ''; }); }
  });

  await scenario('A background worker that was not reloaded is explained, not just reported as a failure', async () => {
    await setHistory(exportSeed());
    // What a worker that still runs the code from before the update does: it does not know the new requests
    await W(() => {
      globalThis.__savedHandlers = { ping: __messageHandlerRegistry['HISTORY_PING'], backup: __messageHandlerRegistry['HISTORY_BACKUP_NOW'], update: __messageHandlerRegistry['HISTORY_UPDATE_ITEM'] };
      delete __messageHandlerRegistry['HISTORY_PING']; delete __messageHandlerRegistry['HISTORY_BACKUP_NOW']; delete __messageHandlerRegistry['HISTORY_UPDATE_ITEM'];
    });
    const hint = /background part is out of date/;
    const page = await openExtensionPage();
    try {
      // The History tab says so once it opens
      await page.$eval('#nav-history', el => el.click());
      await page.waitForFunction(() => [...document.querySelectorAll('.notification-message')].some(el => /out of date/.test(el.textContent)), null, { timeout: 8000 });
      // Pinning is refused with the same explanation
      await page.waitForSelector('.history-item');
      await page.$eval('.history-item .history-more-btn', el => el.click());
      await page.waitForSelector('#historyItemMenu:not([hidden])');
      await page.$eval('#historyItemMenu [data-action="pin"]', el => el.click());
      await sleep(800);
      assert.ok((await toastTexts(page)).filter(t => hint.test(t)).length >= 1);
      assert.deepEqual((await items()).filter(i => i.pinned === true).map(i => i.id), ['x1', 'x4'], 'the pins did not change (x1 is pinned in the seed, so the menu offered Unpin)');
      // Settings → History: the note under the meter, and Back up now
      await settingsHistoryTab(page);
      await page.waitForFunction(() => /background part is out of date/.test(document.querySelector('#historyMeterNote')?.textContent || ''), null, { timeout: 8000 });
      assert.equal(await page.$eval('#historyMeterNote', el => el.hidden), false);
      await page.evaluate(() => document.querySelectorAll('.notification-toast, .notification-item').forEach(el => el.remove()));
      await page.$eval('#historyBackupNowBtn', el => el.click());
      await sleep(1200);
      const toasts = await toastTexts(page);
      assert.ok(toasts.some(t => hint.test(t)), toasts.join(' | '));
      assert.ok(!toasts.some(t => t === 'History backup failed'), 'not the bare failure message');
    } finally {
      await page.close();
      await W(() => { const s = globalThis.__savedHandlers; __messageHandlerRegistry['HISTORY_PING'] = s.ping; __messageHandlerRegistry['HISTORY_BACKUP_NOW'] = s.backup; __messageHandlerRegistry['HISTORY_UPDATE_ITEM'] = s.update; });
    }
    // With the current worker the note is gone and the backup works
    const page2 = await openExtensionPage();
    try {
      await settingsHistoryTab(page2);
      await sleep(1000);
      assert.equal(await page2.$eval('#historyMeterNote', el => /out of date/.test(el.textContent)), false, 'no stale-worker note with a current worker');
    } finally { await page2.close(); }
  });

  // ===============================================================================================
  await scenario('Storage meter and warning: amber near the limit, a notification once, and the record of what was removed', async () => {
    const now = Date.now();
    const filler = (count, noteSize) => Array.from({ length: count }, (_, i) => ({ id: `f${i}`, url: `https://f${i}.example/`, hostname: `f${i}.example`, title: `F${i}`, timestamp: now - (i + 1) * 1000, detections: [{ detector: { name: 'X' }, category: 'Anti-Bot', confidence: 90 }], note: 'x'.repeat(noteSize) }));
    const openHistorySettings = async () => {
      const page = await openExtensionPage();
      await page.$eval('#settingsBtn', el => el.click());
      await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'));
      await page.$eval('.settings-tab-btn[data-settings-tab="history"]', el => el.click());
      return page;
    };
    // Entries may be dropped by the same save, so the count cannot tell that this one was recorded: find it by address
    const visitRecorded = (query) => { const target = url(`${query}&${uniq()}`); return visitSaved(target, { match: i => i.url === target }); };
    const warnings = async () => (await notes()).filter(n => n.id === 'scrapfly-history-storage');

    // About 5.7 MB of the 6 MB budget: the meter is amber and the next save warns once
    await W(() => chrome.storage.local.remove(['scrapfly_history_storage_notice']));
    await setHistory(filler(57, 100000));
    await clearNotes();
    let page = await openHistorySettings();
    try {
      await page.waitForFunction(() => /57 entries/.test(document.querySelector('#historyMeterText')?.textContent || ''), null, { timeout: 8000 });
      const meter = await page.evaluate(() => ({ text: document.querySelector('#historyMeterText').textContent, warn: document.querySelector('#historyMeter').classList.contains('is-warn'), now: document.querySelector('#historyMeter').getAttribute('aria-valuenow'), note: document.querySelector('#historyMeterNote').textContent, noteHidden: document.querySelector('#historyMeterNote').hidden }));
      assert.match(meter.text, /MB of .*used/);
      assert.ok(Number(meter.now) >= 90, `meter at ${meter.now}%`);
      assert.ok(meter.warn, 'amber at 90%');
      assert.match(meter.note, /Almost full/);
      assert.equal(meter.noteHidden, false);
    } finally { await page.close(); }
    await visitRecorded('m=bot-a');
    assert.equal((await warnings()).length, 1, JSON.stringify(await notes()));
    assert.equal((await warnings())[0].title, 'History is almost full');
    await visitRecorded('m=bot-a');
    assert.equal((await warnings()).length, 1, 'warned only once');

    // Over the budget: the oldest entries go, the worker warns again (a new warning cycle), and the record is kept
    await W(() => chrome.storage.local.remove(['scrapfly_history_storage_notice']));
    await setHistory(filler(63, 100000));
    await clearNotes();
    await visitRecorded('m=bot-a');
    const stored = JSON.parse((await W(() => chrome.storage.local.get('scrapfly_history'))).scrapfly_history);
    assert.ok(stored.trimmed && stored.trimmed.count >= 1, `trim record: ${JSON.stringify(stored.trimmed)}`);
    assert.ok(stored.items.length < 64, `${stored.items.length} entries kept`);
    assert.equal((await warnings()).length, 1, JSON.stringify(await notes()));
    page = await openHistorySettings();
    try {
      await page.waitForFunction(() => /removed to stay within the limit/.test(document.querySelector('#historyMeterNote')?.textContent || ''), null, { timeout: 8000 });
    } finally { await page.close(); }

    // Pinned entries are the last to go
    await setHistory([...filler(62, 100000), { ...filler(1, 100000)[0], id: 'pinned-old', timestamp: now - 10 * DAY, pinned: true }]);
    await visitRecorded('m=bot-a');
    assert.ok((await items()).some(i => i.id === 'pinned-old'), 'the pinned entry survived the size limit');

    // Clearing History clears the record too
    const popup = await openExtensionPage();
    await popup.evaluate(() => chrome.runtime.sendMessage({ type: HistoryStore.Messages.CLEAR }));
    await popup.close();
    const after = JSON.parse((await W(() => chrome.storage.local.get('scrapfly_history'))).scrapfly_history);
    assert.ok(!after.trimmed, 'the record of removed entries is gone after Clear history');
    await W(() => chrome.storage.local.remove(['scrapfly_history_storage_notice']));
  });

  // ===============================================================================================
  await scenario('Clear on browser close: closing one of two windows keeps History', async () => {
    const now = Date.now();
    const e = (id, extra = {}) => ({ id, url: `https://${id}.example/`, hostname: `${id}.example`, title: id, timestamp: now, detections: [{ detector: { name: 'X' }, category: 'Anti-Bot', confidence: 90 }], ...extra });
    await setHistory([e('keep-1'), e('pin-1', { pinned: true })]);
    await historySettings({ historyClearOnClose: true });
    // Open and close a second window with the real API: a window remains, so nothing is cleared
    const windowsBefore = await W(() => chrome.windows.getAll().then(w => w.length));
    const created = await W(() => chrome.windows.create({ url: 'about:blank' }).then(w => w.id));
    await sleep(500);
    await W((id) => chrome.windows.remove(id), created);
    await sleep(2500);
    assert.equal(await W(() => chrome.windows.getAll().then(w => w.length)), windowsBefore);
    assert.deepEqual((await items()).map(i => i.id), ['keep-1', 'pin-1'], 'History stays while a window is open');
    await resetSettings();
  });

  // ---- Restart check: closing every window clears History (except pinned), at close or at the next start ----
  if (!only || /restart|clear on browser close/i.test(only)) {
    const now = Date.now();
    const e = (id, extra = {}) => ({ id, url: `https://${id}.example/`, hostname: `${id}.example`, title: id, timestamp: now, detections: [{ detector: { name: 'X' }, category: 'Anti-Bot', confidence: 90 }], ...extra });
    await setHistory([e('gone-1'), e('gone-2'), e('pin-1', { pinned: true })]);
    await historySettings({ historyClearOnClose: true });
    await sleep(500);
    // Close every window: the browser exits, as when a person quits it
    await W(async () => { for (const w of await chrome.windows.getAll()) await chrome.windows.remove(w.id).catch(() => {}); }).catch(() => {});
    await Promise.race([new Promise(r => ctx.once('close', r)), sleep(15000)]);
    await ctx.close().catch(() => {});
    // A browser started while the old one still holds the profile hands over to it and exits: wait for the lock
    const locked = () => { try { fs.lstatSync(path.join(profile, 'SingletonLock')); return true; } catch (_) { return false; } };
    for (let waited = 0; locked() && waited < 30000; waited += 250) await sleep(250);
    await sleep(1000);
    ctx = await launch();
    await sleep(6000);
    await scenario('Clear on browser close (restart): after the browser was closed and started again only pinned entries remain', async () => {
      const list = await waitFor(l => !l.some(i => /^gone-/.test(i.id)), 20000);
      assert.ok(list, `unpinned entries are still there: ${JSON.stringify((await items()).map(i => i.id))}`);
      assert.deepEqual(list.map(i => i.id), ['pin-1']);
    });
    extId = new URL((await getWorker()).url()).host;
  }

  // ---- Finish ---------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`\nPage errors (${pageErrors.length}):\n  ${[...new Set(pageErrors)].slice(0, 8).join('\n  ')}`);
  console.log(`\nRESULT ${failed.length === 0 ? `ALL PASS (${results.length} scenarios)` : `${failed.length} of ${results.length} FAILED`}`);
  await ctx.close().catch(() => {});
  server.close();
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error('ERROR', error); server.close(); process.exit(2); });
