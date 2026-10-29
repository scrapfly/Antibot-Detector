#!/usr/bin/env node
/**
 * Bulk scan, end to end, in the real extension (unpacked in Chromium):
 *
 *   Opening      History's "…" menu → Bulk scan opens sections/bulk/bulk.html in a tab
 *   A run        a pasted list (duplicates, an ftp: line, a skipped site, a sitemap, a page that redirects to a skipped
 *                site, a host that does not resolve, a page that never answers) is scanned one page at a time in an
 *                inactive background tab: the person's tab stays active, at most one scan tab is open, every scan tab
 *                is closed, each line ends done, failed or skipped with its reason
 *   History      a page with a protection is recorded in History the normal way (by the scan pipeline)
 *   Reattach     the page is closed during the run and opened again: it shows the same run, live
 *   Exports      CSV and JSON downloads named for the local day, with the run's pages
 *   Controls     Pause lets the current page finish and opens no other; Resume goes on; Stop closes the scan tab at once
 *   Restart      the service worker is stopped during a run: when it starts again the run reads "stopped" (not stuck
 *                "running") and the scan tab it left is closed
 *
 * One local server answers on 127.0.0.1 and localhost (the skipped site). A probe rule (a marker in the page) makes a
 * page "protected". The sitemap is served at https://sitemap.test/ by Playwright's router: an extension page may only
 * fetch https addresses (its connect-src), so the local http server cannot serve it.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   node scripts/e2e-bulk.js
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const hanging = new Set();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const html = (body, title = 'Bulk probe') => {
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    res.end(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`);
  };
  if (url.pathname === '/protected') return html('<p>bulk-probe-marker</p>', 'Protected');
  if (url.pathname === '/clean') return html('<p>nothing here</p>', 'Clean');
  if (url.pathname === '/slow') return setTimeout(() => html('<p>slow</p>', 'Slow'), Number(url.searchParams.get('ms') || 2500));
  if (url.pathname === '/redirect') { res.writeHead(302, { location: `http://localhost:${server.address().port}/clean` }); return res.end(); }
  if (url.pathname === '/hang') { hanging.add(res); return undefined; } // never answers: the page times out
  res.writeHead(404); res.end();
});

const PROBE = {
  id: 'detect-bulkprobe', name: 'Bulk Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium', version: '1.0.0',
  lastUpdated: '2026-10-26', icon: 'custom.png', description: 'Bulk scan probe',
  detection: { content: [{ id: 'bulk-marker', text: 'bulk-probe-marker', confidence: 90, standalone: true, description: 'bulk-marker' }] }
};

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const at = (p, host = '127.0.0.1') => `http://${host}:${port}${p}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-bulk-'));
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-bulk-dl-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: 'chromium', viewport: { width: 1100, height: 800 }, acceptDownloads: true, downloadsPath: downloads,
      args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
    });
    let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const base = `chrome-extension://${extensionId}`;
    const errors = [];
    // A worker Chromium (or the test) stopped is replaced by a new one: use the newest
    context.on('serviceworker', (w) => { if (w.url().startsWith(base)) worker = w; });
    const W = async (fn, arg) => {
      for (let i = 0; i < 40; i++) {
        try { return await worker.evaluate(fn, arg); } catch (error) { if (i === 39) throw error; await sleep(250); }
      }
      return undefined;
    };
    await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

    // The sitemap, over https (the router answers the extension page's fetch)
    await context.route('https://sitemap.test/**', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/index.xml') {
        return route.fulfill({ status: 200, contentType: 'application/xml', body: '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://sitemap.test/pages.xml</loc></sitemap></sitemapindex>' });
      }
      if (u.pathname === '/pages.xml') {
        return route.fulfill({ status: 200, contentType: 'application/xml', body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${at('/clean?from=sitemap')}</loc></url><url><loc>${at('/protected?from=sitemap&amp;x=1')}</loc></url></urlset>` });
      }
      return route.fulfill({ status: 404, body: 'no' });
    });

    // Setup: the probe rule, localhost skipped, History on, English
    const admin = await context.newPage();
    admin.on('pageerror', error => errors.push(`popup: ${error.message}`));
    await admin.goto(`${base}/popup.html`);
    await admin.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized, null, { polling: 250, timeout: 30000 });
    await admin.evaluate(async (rule) => { await window.popupInstance.detectorManager.addDetector('antibot', rule.id, rule); await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r())); }, PROBE);
    await W(() => SettingsStore.mutate({ operation: 'patch', patch: { detection: { cacheScope: 'full', scanMode: 'blocklist', blacklistedDomains: ['localhost'], allowedDomains: [] }, history: { historyEnabled: true, historyExcludedDomains: [] }, duplicatePrevention: { preventDuplicates: false } } }));
    await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
    await W(() => Promise.all([chrome.storage.local.remove(['scrapfly_history', 'scrapfly_detection_storage'])]));
    await sleep(800);

    // 1. History "…" → Bulk scan opens the page in a tab
    await admin.reload();
    await admin.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { polling: 250, timeout: 30000 });
    await admin.$eval('#nav-history', el => el.click());
    await admin.waitForSelector('#historyMenuBtn', { timeout: 15000 });
    await admin.$eval('#historyMenuBtn', el => el.click());
    assert.equal(await admin.$eval('#bulkScanBtn', el => el.textContent.trim()), 'Bulk scan');
    const opened = context.waitForEvent('page');
    await admin.$eval('#bulkScanBtn', el => el.click());
    let bulk = await opened;
    bulk.on('pageerror', error => errors.push(`bulk: ${error.message}`));
    await bulk.waitForURL(`${base}/sections/bulk/bulk.html`);
    await bulk.waitForFunction(() => document.body.classList.contains('is-ready'), null, { polling: 250, timeout: 15000 });
    await admin.close();
    console.log('PASS Opening: History → … → Bulk scan opens the Bulk scan page');

    const openBulk = async () => {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(`bulk: ${error.message}`));
      await page.goto(`${base}/sections/bulk/bulk.html`);
      await page.waitForFunction(() => document.body.classList.contains('is-ready'), null, { polling: 250, timeout: 15000 });
      return page;
    };
    // Read through the Bulk scan page (an extension page sees session storage and the tabs too): it stays valid across a
    // worker restart, which a Playwright worker handle does not
    const X = async (fn, arg) => {
      for (let i = 0; ; i++) {
        try { return await bulk.evaluate(fn, arg); } catch (error) { if (i >= 40) throw error; await sleep(250); }
      }
    };
    const run = () => X(async () => (await chrome.storage.session.get('session_bulk_scan')).session_bulk_scan || null);
    const scanTabs = () => X(async (p) => (await chrome.tabs.query({})).filter(t => (t.url || t.pendingUrl || '').includes(`:${p}/`) || (t.url || t.pendingUrl || '').includes('does-not-exist.invalid')).map(t => ({ id: t.id, active: t.active, url: t.url || t.pendingUrl })), port);
    const activeTab = () => X(async () => { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return t ? t.url : null; });
    async function waitRun(predicate, ms = 90000, watch) {
      const end = Date.now() + ms;
      for (;;) {
        const r = await run();
        if (watch) await watch(r);
        if (r && predicate(r)) return r;
        if (Date.now() > end) throw new Error(`run did not reach the state: ${JSON.stringify(r && { status: r.status, items: r.items.map(i => i.status) })}`);
        await sleep(300);
      }
    }

    // 2. A run with every kind of line
    const list = [
      at('/protected?n=1'), at('/clean?n=1'), at('/protected?n=1#again'), 'ftp://files.example/x', at('/clean?n=2', 'localhost'),
      at('/redirect'), 'http://does-not-exist.invalid/', at('/hang'), 'https://sitemap.test/index.xml'
    ];
    await bulk.fill('#bulkInput', list.join('\n'));
    assert.equal(await bulk.$eval('#bulkInputCount', el => el.textContent), 'Addresses: 9');
    await bulk.fill('#bulkTimeout', '10');
    await bulk.click('#bulkStartBtn');
    let maxScanTabs = 0;
    let lostFocus = null;
    const watch = async () => {
      const tabs = await scanTabs();
      maxScanTabs = Math.max(maxScanTabs, tabs.length);
      if (tabs.some(t => t.active)) lostFocus = 'a scan tab became active';
      const active = await activeTab();
      if (active && !active.startsWith(base)) lostFocus = `active tab moved to ${active}`;
    };
    await waitRun(r => r.status === 'running' && r.items.some(i => i.status === 'done'), 60000, watch);
    // 3. Reattach: close the page mid-run and open it again
    const closing = bulk;
    bulk = await openBulk();
    await closing.close();
    await sleep(500);
    await bulk.reload();
    await bulk.waitForFunction(() => document.body.classList.contains('is-ready'), null, { polling: 250, timeout: 15000 });
    await bulk.waitForSelector('#bulkRunCard:not([hidden])', { timeout: 5000 });
    assert.match(await bulk.$eval('#bulkRunStatus', el => el.textContent), /^(Running|Finished) · \d+ of \d+ finished$/);
    assert.equal(await bulk.$eval('#bulkInput', el => el.readOnly), true, 'the list cannot be edited while the run goes on');
    console.log('PASS Reattach: a page opened again during the run shows it, live');
    let done = await waitRun(r => r.status === 'done', 120000, watch);
    assert.equal(lostFocus, null, lostFocus || '');
    assert.equal(maxScanTabs <= 1, true, `at most one scan tab at a time (saw ${maxScanTabs})`);
    await sleep(500);
    assert.deepEqual(await scanTabs(), [], 'every scan tab is closed');
    const byUrl = Object.fromEntries(done.items.map(i => [i.url, i]));
    const outcome = (u) => byUrl[u] && [byUrl[u].status, byUrl[u].reason || ''];
    assert.deepEqual(outcome(at('/protected?n=1')), ['done', '']);
    assert.deepEqual(byUrl[at('/protected?n=1')].detections.map(d => [d.name, d.category, d.confidence]), [['Bulk Probe', 'antibot', 90]]);
    assert.ok(byUrl[at('/protected?n=1')].difficulty, 'a difficulty is shown');
    assert.deepEqual(outcome(at('/clean?n=1')), ['done', '']);
    assert.deepEqual(byUrl[at('/clean?n=1')].detections, []);
    assert.deepEqual(outcome('ftp://files.example/x'), ['skipped', 'scheme']);
    assert.deepEqual(outcome(at('/clean?n=2', 'localhost')), ['skipped', 'scope']);
    assert.deepEqual(outcome(at('/redirect')), ['skipped', 'scope'], 'ended on a skipped site');
    assert.deepEqual(outcome('http://does-not-exist.invalid/'), ['failed', 'load']);
    assert.deepEqual(outcome(at('/hang')), ['failed', 'timeout']);
    assert.deepEqual(outcome(at('/clean?from=sitemap')), ['done', '']);
    assert.deepEqual(outcome(at('/protected?from=sitemap&x=1')), ['done', '']);
    assert.equal(done.duplicates, 1);
    assert.equal(done.items.length, 9, '9 lines, a duplicate out, the sitemap replaced by its 2 pages');
    console.log('PASS A run: one inactive background tab at a time, the active tab untouched, every line done, failed or skipped with its reason');

    // The table, in words
    await bulk.waitForFunction(() => /Finished/.test(document.querySelector('#bulkRunStatus').textContent), null, { polling: 250, timeout: 5000 });
    const rows = await bulk.$$eval('#bulkRows tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent.trim())));
    assert.equal(rows.length, 9);
    const row = (u) => rows.find(r => r[1].startsWith(u));
    assert.match(row(at('/protected?n=1'))[3], /Bulk Probe\s*90%/);
    assert.equal(row(at('/clean?n=1'))[3], 'No protection found');
    assert.match(row(at('/clean?n=2', 'localhost'))[2], /Skipped\s*Skipped by Settings → Detection → Sites to scan/);
    assert.match(row(at('/hang'))[2], /Failed\s*No result within the time limit/);
    assert.match(await bulk.$eval('#bulkRunNotes', el => el.textContent), /Duplicates removed: 1/);
    console.log('PASS Table: protections with confidence, statuses and reasons in words');

    // 4. History: the protected pages are recorded by the scan pipeline
    const history = await W(async () => (await HistoryStore.read(chrome.storage.local)).map(e => e.url));
    assert.ok(history.includes(at('/protected?n=1')), `History records the protected page (${history.join(', ')})`);
    assert.ok(!history.some(u => u.includes('/clean')), 'a page with nothing found leaves no entry, as for any visit');
    console.log('PASS History: the page with a protection is recorded the normal way');

    // 5. Exports
    const day = await bulk.evaluate(() => FormatUtils.localDay(Date.now()));
    for (const [button, ext] of [['#bulkExportCsvBtn', 'csv'], ['#bulkExportJsonBtn', 'json']]) {
      const pending = bulk.waitForEvent('download');
      await bulk.click(button);
      const download = await pending;
      assert.equal(download.suggestedFilename(), `scrapfly-bulk-scan-${day}.${ext}`);
      const text = fs.readFileSync(await download.path(), 'utf8');
      if (ext === 'csv') {
        assert.match(text, /^url,status,reason,final_url,difficulty,protection,category,confidence,scanned_at\r\n/);
        assert.match(text, new RegExp(`${at('/protected?n=1').replace(/[.?]/g, '\\$&')},done,,,\\w+,Bulk Probe,antibot,90,`));
      } else {
        const data = JSON.parse(text);
        assert.equal(data.type, 'bulk-scan');
        assert.equal(data.pages.length, 9);
      }
    }
    console.log('PASS Exports: CSV and JSON named for the local day');

    // 6. Pause, Resume, Stop
    await bulk.click('#bulkNewBtn');
    await bulk.waitForSelector('#bulkRunCard', { state: 'hidden' });
    await bulk.fill('#bulkInput', [at('/slow?ms=2500&a=1'), at('/slow?ms=2500&a=2'), at('/slow?ms=2500&a=3'), at('/hang?b=1'), at('/clean?b=2')].join('\n'));
    await bulk.fill('#bulkTimeout', '60');
    await bulk.click('#bulkStartBtn');
    await waitRun(r => r.items[0].status === 'scanning');
    await bulk.click('#bulkPauseBtn');
    let paused = await waitRun(r => r.status === 'paused' && r.items[0].status === 'done', 20000);
    await sleep(2500);
    paused = await run();
    assert.deepEqual(paused.items.map(i => i.status), ['done', 'waiting', 'waiting', 'waiting', 'waiting'], 'paused: the page being scanned finished, no other opened');
    assert.deepEqual(await scanTabs(), []);
    assert.equal(await bulk.$eval('#bulkResumeBtn', el => el.hidden), false);
    await bulk.click('#bulkResumeBtn');
    await waitRun(r => r.items[3].status === 'scanning', 30000);
    assert.equal((await scanTabs()).length, 1, 'the never-answering page is open');
    const stoppedAt = Date.now();
    await bulk.click('#bulkStopBtn');
    const stopped = await waitRun(r => r.status === 'stopped', 5000);
    await sleep(400);
    assert.deepEqual(await scanTabs(), [], 'Stop closes the scan tab at once');
    assert.ok(Date.now() - stoppedAt < 5000);
    assert.deepEqual(stopped.items.map(i => i.status), ['done', 'done', 'done', 'waiting', 'waiting']);
    assert.equal(await bulk.$eval('#bulkWaitingBtn', el => el.hidden), false, 'the pages still waiting can be scanned again');
    console.log('PASS Controls: Pause finishes the current page and opens no other, Resume goes on, Stop closes the scan tab at once');

    // Scan the pages still waiting: the pages already finished stay in the table and the run
    await bulk.click('#bulkWaitingBtn');
    const continued = await waitRun(r => r.status === 'running' && r.items.length === 5 && r.items[3].status === 'scanning', 30000);
    assert.deepEqual(continued.items.slice(0, 3).map(i => i.status), ['done', 'done', 'done'], 'the finished pages are kept with their results');
    assert.equal(await bulk.$$eval('#bulkRows tr', rows => rows.length), 5, 'the table shows the whole job, not only the pages scanned now');
    await bulk.click('#bulkStopBtn');
    await waitRun(r => r.status === 'stopped', 5000);
    await sleep(400);
    assert.deepEqual(await scanTabs(), [], 'Stop closes the scan tab again');
    console.log('PASS Continue: "Scan the pages still waiting" keeps the finished pages in the table and the run');

    // 7. A worker restart during a run: the run reads stopped, its tab is closed
    await bulk.click('#bulkNewBtn');
    await bulk.waitForSelector('#bulkRunCard', { state: 'hidden' });
    await bulk.fill('#bulkInput', [at('/hang?c=1'), at('/clean?c=2')].join('\n'));
    await bulk.click('#bulkStartBtn');
    await waitRun(r => r.items[0].status === 'scanning');
    await sleep(800);
    assert.equal((await scanTabs()).length, 1);
    const cdp = await context.newCDPSession(bulk);
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
    await sleep(1500);
    // The page asks the worker for the run: a new worker starts and finds the old one's run
    await bulk.reload();
    await bulk.waitForFunction(() => document.body.classList.contains('is-ready'), null, { polling: 250, timeout: 20000 });
    const restarted = await waitRun(r => r.status !== 'running', 20000);
    assert.equal(restarted.status, 'stopped');
    assert.equal(restarted.reason, 'restart');
    assert.deepEqual(restarted.items.map(i => i.status), ['waiting', 'waiting']);
    await bulk.waitForFunction(() => /^Stopped/.test(document.querySelector('#bulkRunStatus').textContent), null, { polling: 250, timeout: 5000 });
    assert.match(await bulk.$eval('#bulkRunReason', el => el.textContent), /restarted during the run/);
    await sleep(1000);
    assert.deepEqual(await scanTabs(), [], 'the scan tab the stopped worker left is closed');
    console.log('PASS Restart: a run the stopped worker left reads "stopped", and its tab is closed');

    assert.deepEqual(errors, [], 'no page errors');
    console.log('RESULT ALL PASS, no page errors');
  } finally {
    for (const res of hanging) { try { res.destroy(); } catch (_) { /* gone */ } }
    try { if (context) await context.close(); } finally {
      server.close();
      fs.rmSync(profile, { recursive: true, force: true });
      fs.rmSync(downloads, { recursive: true, force: true });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; for (const res of hanging) { try { res.destroy(); } catch (_) { /* gone */ } } server.close(); });
