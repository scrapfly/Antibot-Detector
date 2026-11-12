#!/usr/bin/env node
/**
 * 3.1.3 Bulk scan and History retention, end to end, in the real extension (unpacked in Chromium):
 *
 *   Sitemap     a public sitemap only contributes the listed addresses of its own site: its own pages (and the www spelling
 *               of its host) are scanned, while the 127.0.0.1, localhost, other-host, private and cloud metadata addresses
 *               it lists are not opened, and a sitemap listed for another host is never fetched. A sitemap the site answers
 *               with an error is listed as one that could not be read, and the table has words for a sitemap that ended on
 *               another site. Addresses pasted into the list stay as they are. What is judged is the address as listed: a
 *               redirect from a listed address is not followed up.
 *               Not here: a sitemap that REDIRECTS to another site. Playwright's router cannot make a fetch follow a redirect
 *               (the fetch fails with "Failed to fetch" and the router never sees the target), so that path is covered by
 *               test/bulk-page.test.js, whose fetch answers with the address the redirect ended on.
 *   Most seen   the protections found on the most pages are named under the totals (hidden when nothing was found), the
 *               Markdown export has a line for them, the JSON export a field, and the CSV is as it was.
 *   Settings    while the stored settings cannot be read, History is not trimmed (not to the 1,000-entry cap, not to the
 *               6 MB default size) and nothing is cleared; once they read again the person's limits apply.
 *
 * One local server answers on 127.0.0.1, localhost and, through the browser's host mapping, sitemap.test,
 * www.sitemap.test and other.test. Every request is logged by its Host header: a listed address that must not be opened is
 * /offsite-probe. The sitemaps are served over https by Playwright's router (an extension page may only fetch https
 * addresses: its connect-src).
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup && npm run e2e:all -- --only v313-bulk
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const hits = []; // `${Host header}${path}` of every request the local server answered
const server = http.createServer((req, res) => {
  hits.push(`${req.headers.host}${req.url}`);
  const url = new URL(req.url, 'http://x');
  const html = (body, title) => {
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    res.end(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`);
  };
  if (url.pathname === '/protected') return html('<p>bulk-probe-marker</p>', 'Protected');
  if (url.pathname === '/clean') return html('<p>nothing here</p>', 'Clean');
  if (url.pathname === '/offsite-probe') return html('<p>nothing here</p>', 'Off site');
  res.writeHead(404); res.end();
});

const PROBE = {
  id: 'detect-bulkprobe', name: 'Bulk Probe', author: 'Probe', enabled: true, category: 'Anti-Bot', difficulty: 'Medium', version: '1.0.0',
  lastUpdated: '2026-11-05', icon: 'custom.png', description: 'Bulk scan probe',
  detection: { content: [{ id: 'bulk-marker', text: 'bulk-probe-marker', confidence: 90, standalone: true, description: 'bulk-marker' }] }
};

const FSI = '⁨';
const PDI = '⁩';
const urlset = (...locs) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map(loc => `<url><loc>${loc.replace(/&/g, '&amp;')}</loc></url>`).join('')}</urlset>`;
const sitemapIndex = (...locs) => `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map(loc => `<sitemap><loc>${loc}</loc></sitemap>`).join('')}</sitemapindex>`;

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const at = (p, host = '127.0.0.1') => `http://${host}:${port}${p}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v313-bulk-'));
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v313-bulk-dl-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: 'chromium', viewport: { width: 1100, height: 800 }, acceptDownloads: true, downloadsPath: downloads,
      args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`,
        '--host-resolver-rules=MAP sitemap.test 127.0.0.1, MAP www.sitemap.test 127.0.0.1, MAP other.test 127.0.0.1']
    });
    let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const base = `chrome-extension://${extensionId}`;
    const errors = [];
    context.on('serviceworker', (w) => { if (w.url().startsWith(base)) worker = w; });
    const W = async (fn, arg) => {
      for (let i = 0; i < 40; i++) {
        try { return await worker.evaluate(fn, arg); } catch (error) { if (i === 39) throw error; await sleep(250); }
      }
      return undefined;
    };
    await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

    // The sitemaps, over https (the router answers the extension page's fetch)
    const fetched = { other: 0 };
    await context.route('https://sitemap.test/**', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/index.xml') {
        return route.fulfill({ status: 200, contentType: 'application/xml', body: sitemapIndex('https://sitemap.test/pages.xml', 'https://other-sitemap.test/evil.xml', at('/evil-index.xml')) });
      }
      if (u.pathname === '/pages.xml') {
        return route.fulfill({ status: 200, contentType: 'application/xml', body: urlset(
          at('/protected?p=1', 'sitemap.test'), at('/offsite-probe?from=sitemap'), at('/offsite-probe?from=sitemap', 'localhost'), at('/protected?p=2', 'sitemap.test'),
          at('/offsite-probe?from=sitemap', 'other.test'), 'http://192.168.1.5/router', 'http://169.254.169.254/latest/meta-data/', `http://[::1]:${port}/offsite-probe`,
          at('/clean?p=3', 'sitemap.test'), at('/clean?p=www', 'www.sitemap.test')) });
      }
      return route.fulfill({ status: 404, body: 'no' });
    });
    await context.route('https://other-sitemap.test/**', (route) => {
      fetched.other++;
      return route.fulfill({ status: 200, contentType: 'application/xml', body: urlset(at('/offsite-probe?from=other-sitemap', 'other.test')) });
    });
    // A sitemap the site answers with an error
    await context.route('https://down.test/**', (route) => route.fulfill({ status: 404, body: 'no' }));

    // Setup: the probe rule, nothing skipped, History on, English
    const admin = await context.newPage();
    admin.on('pageerror', error => errors.push(`popup: ${error.message}`));
    await admin.goto(`${base}/popup.html`);
    await admin.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized, null, { polling: 250, timeout: 30000 });
    await admin.evaluate(async (rule) => { await window.popupInstance.detectorManager.addDetector('antibot', rule.id, rule); await new Promise(r => chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => r())); }, PROBE);
    await W(() => SettingsStore.mutate({ operation: 'patch', patch: { detection: { cacheScope: 'full', scanMode: 'blocklist', blacklistedDomains: [], allowedDomains: [] }, history: { historyEnabled: true, historyExcludedDomains: [] }, duplicatePrevention: { preventDuplicates: false } } }));
    await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
    await W(() => Promise.all([chrome.storage.local.remove(['scrapfly_history', 'scrapfly_detection_storage'])]));
    await sleep(800);
    await admin.close();

    const bulk = await context.newPage();
    bulk.on('pageerror', error => errors.push(`bulk: ${error.message}`));
    await bulk.goto(`${base}/sections/bulk/bulk.html`);
    await bulk.waitForFunction(() => document.body.classList.contains('is-ready'), null, { polling: 250, timeout: 15000 });
    const X = async (fn, arg) => {
      for (let i = 0; ; i++) {
        try { return await bulk.evaluate(fn, arg); } catch (error) { if (i >= 40) throw error; await sleep(250); }
      }
    };
    const run = () => X(async () => (await chrome.storage.session.get('session_bulk_scan')).session_bulk_scan || null);
    async function waitRun(predicate, ms = 120000) {
      const end = Date.now() + ms;
      for (;;) {
        const r = await run();
        if (r && predicate(r)) return r;
        if (Date.now() > end) throw new Error(`run did not reach the state: ${JSON.stringify(r && { status: r.status, items: r.items.map(i => [i.url, i.status]) })}`);
        await sleep(300);
      }
    }
    const download = async (button) => {
      const pending = bulk.waitForEvent('download');
      await bulk.click(button);
      return fs.readFileSync(await (await pending).path(), 'utf8');
    };

    // 1. A public sitemap only contributes the listed addresses of its own site
    const list = [at('/clean?pasted=1'), at('/offsite-probe?pasted=1', 'localhost'), 'https://sitemap.test/index.xml', 'https://down.test/sitemap.xml'];
    await bulk.fill('#bulkInput', list.join('\n'));
    await bulk.fill('#bulkTimeout', '15');
    await bulk.click('#bulkStartBtn');
    const finished = await waitRun(r => r.status === 'done');
    assert.deepEqual(finished.items.map(i => [i.url, i.status, i.reason || '']), [
      [at('/clean?pasted=1'), 'done', ''],
      [at('/offsite-probe?pasted=1', 'localhost'), 'done', ''],
      [at('/protected?p=1', 'sitemap.test'), 'done', ''],
      [at('/protected?p=2', 'sitemap.test'), 'done', ''],
      [at('/clean?p=3', 'sitemap.test'), 'done', ''],
      [at('/clean?p=www', 'www.sitemap.test'), 'done', ''],
      ['https://down.test/sitemap.xml', 'skipped', 'sitemap']
    ], 'the pasted lines (a local address too), the sitemap\'s own pages and the www spelling, and the sitemap that failed listed as one that could not be read');
    const visited = hits.filter(h => h.includes('/offsite-probe'));
    assert.deepEqual(visited, [`localhost:${port}/offsite-probe?pasted=1`], 'no listed off-site address was opened: the only one is what the person pasted');
    assert.ok(hits.includes(`sitemap.test:${port}/protected?p=1`) && hits.includes(`www.sitemap.test:${port}/clean?p=www`), 'control: the sitemap\'s own pages were visited');
    assert.equal(fetched.other, 0, 'a sitemap listed for another host is never fetched');
    assert.ok(!finished.items.some(i => /192\.168|169\.254|\[::1\]|other\.test|evil-index/.test(i.url)), 'nothing the sitemaps listed for another host is in the run');
    // The table says why, in words
    await bulk.waitForFunction(() => /Finished/.test(document.querySelector('#bulkRunStatus').textContent), null, { polling: 250, timeout: 10000 });
    const tableRows = await bulk.$$eval('#bulkRows tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent.trim())));
    const downRow = tableRows.find(r => r[1].startsWith('https://down.test/sitemap.xml'));
    assert.match(downRow[2], /^Skipped\s*The sitemap could not be read\. Only https sitemaps can be read\.$/);
    console.log('PASS Sitemap: only the listed addresses of the site itself are scanned; the 127.0.0.1, localhost, other-host, private and metadata addresses a sitemap lists are not opened; a sitemap listed for another host is never fetched; a sitemap the site answers with an error is listed as one that could not be read; pasted lines stay');

    // 2. Most seen
    const seen = await bulk.$eval('#bulkRunMostSeen', el => ({ hidden: el.hidden, text: el.textContent, after: el.previousElementSibling && el.previousElementSibling.id }));
    assert.deepEqual(seen, { hidden: false, text: `Most seen: ${FSI}Bulk Probe (2)${PDI}`, after: 'bulkRunCounts' });
    assert.match(await bulk.$eval('#bulkRunCounts', el => el.textContent), /Done: 6 · With protections: 2 · Failed: 0 · Skipped: 1/);
    const markdown = await download('#bulkExportMarkdownBtn');
    assert.match(markdown, /^# Scrapfly Antibot Detector: Bulk scan\n\n7 pages, 6 scanned, 1 skipped; 2 with protections\n\nMost seen: Bulk Probe \(2 pages\)\n\n\| Page \| Status \| Difficulty \| Protections \|\n/);
    const json = JSON.parse(await download('#bulkExportJsonBtn'));
    assert.deepEqual(json.run.protectionTotals, [{ name: 'Bulk Probe', category: 'antibot', pages: 2 }]);
    assert.equal(json.run.counts.found, 2);
    const csv = await download('#bulkExportCsvBtn');
    assert.match(csv.slice(1), /^url,status,reason,final_url,difficulty,protection,category,confidence,scanned_at,http_status\r\n/);
    assert.ok(!/most seen|protectionTotals/i.test(csv), 'the CSV has no totals');
    assert.equal(csv.trimEnd().split('\r\n').length, 1 + finished.items.length, 'a header and one row per page (each protected page has one protection)');
    console.log('PASS Most seen: the line under the totals, a line in the Markdown export, a field in the JSON export, the CSV as it was (plus the HTTP status column 3.1.8 added last)');

    // A run with nothing found has no line
    await bulk.click('#bulkNewBtn');
    await bulk.waitForSelector('#bulkRunCard', { state: 'hidden' });
    await bulk.fill('#bulkInput', [at('/clean?q=1'), at('/clean?q=2')].join('\n'));
    await bulk.click('#bulkStartBtn');
    await waitRun(r => r.status === 'done' && r.items.length === 2);
    await bulk.waitForFunction(() => /Finished/.test(document.querySelector('#bulkRunStatus').textContent), null, { polling: 250, timeout: 10000 });
    assert.deepEqual(await bulk.$eval('#bulkRunMostSeen', el => ({ hidden: el.hidden, text: el.textContent })), { hidden: true, text: '' });
    assert.ok(!(await download('#bulkExportMarkdownBtn')).includes('Most seen'));
    assert.deepEqual(JSON.parse(await download('#bulkExportJsonBtn')).run.protectionTotals, []);
    console.log('PASS Most seen: scanned pages with no protection leave the line hidden and out of the exports');

    // The words for a sitemap that ended on another site, drawn by the real page from a run state as the worker writes it (the reason is
    // 'moved'; a redirect itself cannot be made to happen in this browser, see the header)
    await bulk.click('#bulkNewBtn');
    await bulk.waitForSelector('#bulkRunCard', { state: 'hidden' });
    await bulk.evaluate(() => chrome.storage.session.set({ session_bulk_scan: {
      id: 'bulk_seeded', status: 'done', reason: null, startedAt: 1, finishedAt: 2, timeoutSec: 45, cap: 200, duplicates: 0, overCap: 0, skippedOver: 0,
      items: [{ url: 'https://moved.test/sitemap.xml', status: 'skipped', reason: 'moved', finishedAt: 2 }, { url: 'https://down.test/sitemap.xml', status: 'skipped', reason: 'sitemap', finishedAt: 2 }]
    } }));
    await bulk.waitForFunction(() => document.querySelectorAll('#bulkRows tr').length === 2, null, { polling: 250, timeout: 10000 });
    const seededRows = await bulk.$$eval('#bulkRows tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent.trim())));
    assert.match(seededRows[0][2], /^Skipped\s*The file could not be read\.$/, 'a sitemap that ended on another site');
    assert.ok(!seededRows[0][2].includes('https sitemaps'), 'not the hint for a sitemap that was not fetched');
    assert.match(seededRows[1][2], /^Skipped\s*The sitemap could not be read\. Only https sitemaps can be read\.$/, 'and one that could not be fetched keeps its own');
    console.log('PASS Sitemap: a sitemap that ended on another site says the file could not be read, not that only https sitemaps can be');
    await bulk.click('#bulkNewBtn');
    await bulk.waitForSelector('#bulkRunCard', { state: 'hidden' });

    // 3. History is not trimmed while the settings cannot be read
    const MB = 1024 * 1024;
    // The size is the length of the stored text: what the size limit (6, 12 or 25 MB) is measured on
    const historyState = () => W(async () => {
      const stored = (await chrome.storage.local.get('scrapfly_history')).scrapfly_history;
      return { count: (await HistoryStore.read(chrome.storage.local)).length, bytes: typeof stored === 'string' ? stored.length : JSON.stringify(stored || '').length };
    });
    await W(() => SettingsStore.mutate({ operation: 'patch', patch: { history: { historyEnabled: true, historyLimit: 2000, historyMaxMB: 25, historyAutoDelete: false, historyClearOnClose: false, historyFingerprintDays: 0 } } }));
    await W(async () => {
      const pad = 'n'.repeat(5000);
      const items = Array.from({ length: 1500 }, (_, i) => ({ id: `seed_${i}`, url: `https://seed${i}.example/`, hostname: `seed${i}.example`, title: `Seed ${i}`, timestamp: Date.now() - i * 60000, detections: [], note: pad }));
      await HistoryStore.mutate(() => items, chrome.storage.local);
    });
    await sleep(4000); // the retention runs 1.5 s after a write
    let state = await historyState();
    assert.equal(state.count, 1500, 'settings that read fine and a limit of 2,000: all kept');
    assert.ok(state.bytes > 6 * MB, `more than the default size, as the person chose 25 MB (${state.bytes} bytes)`);

    const good = await W(async () => (await chrome.storage.local.get('scrapfly_settings')).scrapfly_settings);
    await W(() => chrome.storage.local.set({ scrapfly_settings: '{oops' }));
    assert.equal(await W(async () => (await HistoryRetention.readConfig()) === null), true, 'the retention cannot read them');
    await sleep(4500); // the run the change of settings schedules
    state = await historyState();
    assert.equal(state.count, 1500, 'unreadable settings: the retention took nothing (the 1,000-entry cap would have taken 500)');
    assert.ok(state.bytes > 6 * MB, 'and nothing was cut to the default size');
    const saved = await W(async () => {
      const result = await HistoryStore.mutate((items) => [{ id: 'saved_while_unreadable', url: 'https://saved.example/', hostname: 'saved.example', title: 'Saved', timestamp: Date.now(), detections: [] }, ...items], chrome.storage.local);
      return { dropped: result.dropped };
    });
    assert.equal(saved.dropped, 0, 'a page saved meanwhile cuts nothing for size');
    state = await historyState();
    assert.equal(state.count, 1501);

    await W((value) => chrome.storage.local.set({ scrapfly_settings: value }), good);
    await sleep(4500);
    state = await historyState();
    assert.equal(state.count, 1501, 'readable again, the person\'s limit of 2,000 keeps them all');
    console.log('PASS Settings: unreadable settings leave History as it is (no 1,000-entry cap, no 6 MB default), and the person\'s limits apply again once they read');

    // The person's own limits still trim
    await W(() => SettingsStore.mutate({ operation: 'patch', patch: { history: { historyLimit: 1000, historyMaxMB: 6 } } }));
    await sleep(5000);
    state = await historyState();
    assert.ok(state.count <= 1000 && state.bytes <= 6 * MB, `a limit of 1,000 entries and 6 MB: ${state.count} entries, ${state.bytes} bytes`);
    assert.ok(state.count > 500, `and it keeps the newest (${state.count})`);
    console.log('PASS Settings: a lower limit saved by the person still trims History');

    await W(async () => { await chrome.storage.local.remove(['scrapfly_history']); await SettingsStore.mutate({ operation: 'patch', patch: { history: { historyLimit: 0, historyMaxMB: 6 } } }); });
    assert.deepEqual(errors, [], 'no page errors');
    console.log('RESULT ALL PASS, no page errors');
  } finally {
    try { if (context) await context.close(); } finally {
      server.close();
      fs.rmSync(profile, { recursive: true, force: true });
      fs.rmSync(downloads, { recursive: true, force: true });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
