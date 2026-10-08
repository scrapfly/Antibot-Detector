#!/usr/bin/env node
/**
 * End-to-end check of Rules → Update (the detector auto-updater) against the
 * real extension, loaded unpacked in Chromium. A copy of this working tree is
 * pointed at a local fake "GitHub" (RELEASES_URL and RAW_URL, plus
 * http://127.0.0.1 in the copy's CSP); nothing else changes. The fake has a
 * main branch and published releases: only a release reaches users. Covers
 * one-click updates, rules the user edited (keep / use new / decide later /
 * reset), Settings → Check now, auto-update and its alarm, a server outage, a
 * rate limit, minExtensionVersion and an extension update.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:updater
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const REPO = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'antibot-e2e-updater-'));
const EXT = path.join(WORK, 'ext');
const REMOTE = path.join(WORK, 'remote');
const MAIN = path.join(REMOTE, 'main'); // what is merged; users get only releases
const results = [];

// ------------------------------------------------------------------ helpers
function copyDir(src, dst, skip = new Set()) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const s = path.join(src, entry.name), d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2)); };
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Merge a new version of a detector to the fake main branch (not released yet) */
function remotePublish(category, id, version, mutate = (d) => d) {
  const p = path.join(MAIN, 'detectors', category, `${id}.json`);
  const d = readJSON(path.join(REPO, 'detectors', category, `${id}.json`));
  d.version = version;
  d.description = `E2E remote v${version}`;
  writeJSON(p, mutate(d));
}

/** Publish a release: a tag of main as it is now becomes the latest release */
let latestTag = null;
function publishRelease(tag) {
  copyDir(path.join(MAIN, 'detectors'), path.join(REMOTE, 'releases', tag, 'detectors'));
  latestTag = tag;
}

// ------------------------------------------------------------- fake GitHub
// /api/latest: the releases API; /raw/<tag>/detectors/...: raw files of a tag
let serverMode = 'up';
const requests = [];
const server = http.createServer((req, res) => {
  requests.push(req.url);
  if (serverMode === 'down') { res.writeHead(503); return res.end('down'); }
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/latest') {
    if (serverMode === 'ratelimit') {
      res.writeHead(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) });
      return res.end('{"message":"API rate limit exceeded"}');
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ tag_name: latestTag }));
  }
  const raw = url.match(/^\/raw\/([^/]+)\/(detectors\/.+)$/);
  const base = raw && path.join(REMOTE, 'releases', raw[1]);
  const file = base && path.join(base, raw[2]);
  if (!file || !file.startsWith(base) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'application/json' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  // Extension under test: the working tree, with the update URL redirected
  copyDir(REPO, EXT, new Set(['.git', 'node_modules', '.claude', 'test']));
  const umPath = path.join(EXT, 'modules/core/update-manager.js');
  const um = fs.readFileSync(umPath, 'utf8');
  const patched = um
    .replace(/static RELEASES_URL = '[^']+';/, `static RELEASES_URL = 'http://127.0.0.1:${port}/api/latest';`)
    .replace(/static RAW_URL = '[^']+';/, `static RAW_URL = 'http://127.0.0.1:${port}/raw';`);
  if (!patched.includes(`127.0.0.1:${port}/api/latest`) || !patched.includes(`127.0.0.1:${port}/raw'`)) throw new Error('GitHub URLs not patched');
  fs.writeFileSync(umPath, patched);
  // The shipped CSP allows https only (GitHub); the fake server is plain http
  const manifestPath = path.join(EXT, 'manifest.json');
  const manifest = readJSON(manifestPath);
  manifest.content_security_policy.extension_pages = manifest.content_security_policy.extension_pages
    .replace("connect-src 'self' https:", "connect-src 'self' https: http://127.0.0.1:*");
  writeJSON(manifestPath, manifest);
  // Remote starts identical to what this build ships: nothing to update
  copyDir(path.join(REPO, 'detectors'), path.join(MAIN, 'detectors'), new Set(['icons']));
  publishRelease('v-e2e-1');

  let ctx = await chromium.launchPersistentContext(path.join(WORK, 'profile'), {
    headless: true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await sleep(2500); // onInstalled → initialize

  const storage = async (keys) => sw.evaluate(async (k) => chrome.storage.local.get(k), keys);
  const storedDetector = async (cat, id) => {
    const raw = (await storage('scrapfly_detectors')).scrapfly_detectors;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (parsed.data || parsed).detectors?.[cat]?.[id];
  };
  // What the running service worker detects with right now
  const liveDetector = async (cat, id) => sw.evaluate(([c, i]) => {
    const d = detectorManager.getDetector(c, i); // eslint-disable-line no-undef
    return d ? { version: d.version, description: d.description, userModified: !!d.userModified } : null;
  }, [cat, id]);

  const popup = await ctx.newPage();
  const openRules = async () => {
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    // The tabs only switch once the popup has started (a click before that is lost)
    await popup.waitForFunction(() => window.popupInstance, null, { timeout: 15000 });
    await sleep(500);
    await popup.click('.tab-btn[data-tab="rules"]');
    await popup.waitForSelector('#checkUpdatesBtn');
    await sleep(600);
  };
  const toasts = async () => popup.$$eval('.notification-message', els => els.map(e => e.textContent.trim()));
  const clearToasts = async () => popup.evaluate(() => document.querySelectorAll('.notification-toast').forEach(t => t.remove()));
  const clickUpdate = async () => {
    await clearToasts();
    await popup.click('#checkUpdatesBtn');
    await popup.waitForFunction(() => !document.querySelector('#checkUpdatesBtn').classList.contains('checking')
      || document.querySelector('.notification-confirm'), null, { timeout: 30000 });
    await sleep(400);
  };
  const badge = async () => popup.$eval('#updatesBadge', b => (b.style.display === 'none' ? 0 : Number(b.textContent)));
  const searchRule = async (q) => { await popup.fill('#rulesSearch', q); await sleep(500); };

  // ======================================================= 1. up to date
  await openRules();
  await clickUpdate();
  check('1. nothing new in the latest release → "up to date", no pending', (await toasts()).some(t => /up to date/i.test(t) && t.includes('v-e2e-1'))
    && !(await storage('scrapfly_pending_updates')).scrapfly_pending_updates, JSON.stringify(await toasts()));

  // ======================== 2. merged to main is not shipped; a release is
  remotePublish('antibot', 'detect-akamai', '9.0.0');
  const idx = readJSON(path.join(MAIN, 'detectors/index.json'));
  idx.antibot.detectors.push('detect-e2enew');
  writeJSON(path.join(MAIN, 'detectors/index.json'), idx);
  writeJSON(path.join(MAIN, 'detectors/antibot/detect-e2enew.json'),
    { ...readJSON(path.join(REPO, 'detectors/antibot/detect-netacea.json')), id: 'detect-e2enew', name: 'E2E New', version: '2.0.0' });

  await clickUpdate();
  check('2a. merged to main but not released → still up to date', (await toasts()).some(t => /up to date/i.test(t))
    && (await storedDetector('antibot', 'detect-akamai')).version !== '9.0.0', JSON.stringify(await toasts()));

  publishRelease('v-e2e-2');
  const firstRequest = requests.length;
  await clickUpdate();
  const akStored = await storedDetector('antibot', 'detect-akamai');
  check('2b. one click checks and installs the release', akStored?.version === '9.0.0', akStored?.version);
  const summary = (await toasts()).join(' | ');
  check('2c. the summary names the release and the rules', summary.includes('v-e2e-2') && /akamai/i.test(summary) && summary.includes('E2E New'), summary);
  await sleep(800);
  const akLive = await liveDetector('antibot', 'detect-akamai');
  check('2d. running detection uses it without a restart', akLive?.version === '9.0.0', JSON.stringify(akLive));
  check('2e. new remote detector installed and live', (await liveDetector('antibot', 'detect-e2enew'))?.version === '2.0.0');
  const officialNew = await sw.evaluate(() => DetectionUtils.isOfficialDetector(detectorManager.getDetector('antibot', 'detect-e2enew'))); // eslint-disable-line no-undef
  check('2f. new remote detector counts as official', officialNew === true);
  check('2g. no badge left after the install', (await badge()) === 0);
  const rawRequests = requests.slice(firstRequest).filter(u => u.startsWith('/raw/'));
  check('2h. every file came from the release tag', rawRequests.length > 0 && rawRequests.every(u => u.startsWith('/raw/v-e2e-2/')), rawRequests.slice(0, 3).join(', '));
  await searchRule('akamai');
  const cardText = await popup.$eval('.detector-card[data-detector-id="detect-akamai"] .version-author', e => e.textContent);
  check('2i. Rules card shows the new version without reopening', cardText.includes('9.0.0'), cardText);

  // ================================ 3. edit an official rule in the editor
  await searchRule('cloudflare');
  await popup.click('.detector-card[data-detector-id="detect-cloudflare"] .edit-btn');
  await popup.waitForSelector('#editRuleModal .method-input.method-name', { state: 'attached' });
  await popup.evaluate(() => {
    const input = document.querySelector('#editRuleModal .method-input.method-name');
    input.value = 'e2e-user-edit';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const cfBefore = await storedDetector('antibot', 'detect-cloudflare');
  await popup.click('#saveRuleEdit');
  await sleep(1200);
  const cfEdited = await storedDetector('antibot', 'detect-cloudflare');
  const hasEdit = JSON.stringify(cfEdited?.detection).includes('e2e-user-edit');
  check('3a. editor saved the edit', hasEdit);
  check('3b. edited official rule is marked and keeps its official version',
    cfEdited?.userModified === true && cfEdited.version === cfBefore.version && !!cfEdited.officialSnapshot,
    `version ${cfBefore.version} → ${cfEdited?.version}`);
  await searchRule('cloudflare');
  check('3c. card shows the Edited tag', !!(await popup.$('.detector-card[data-detector-id="detect-cloudflare"] .rule-edited-tag')));
  check('3d. running detection has the edit', (await liveDetector('antibot', 'detect-cloudflare'))?.userModified === true);

  // ============================== 4. update for the edited rule → Keep mine
  remotePublish('antibot', 'detect-cloudflare', '9.0.0');
  publishRelease('v-e2e-3');
  await clickUpdate(); // one click: check, install, then the dialog
  const dialog = await popup.waitForSelector('.notification-confirm', { timeout: 5000 }).catch(() => null);
  const dialogText = dialog ? await dialog.textContent() : '';
  check('4a. Update asks before touching the edited rule', !!dialog && /edited/i.test(dialogText), dialogText.slice(0, 140));
  check('4b. edit still intact while the dialog is open',
    JSON.stringify((await storedDetector('antibot', 'detect-cloudflare')).detection).includes('e2e-user-edit'));
  await popup.click('.notification-confirm button:has-text("Keep my edits")');
  await sleep(1200);
  const cfKept = await storedDetector('antibot', 'detect-cloudflare');
  check('4c. Keep my edits: edit kept, version 9.0.0 declined',
    JSON.stringify(cfKept.detection).includes('e2e-user-edit') && cfKept.dismissedVersion === '9.0.0', `dismissed=${cfKept.dismissedVersion}`);
  check('4d. nothing left pending', !(await storage('scrapfly_pending_updates')).scrapfly_pending_updates && (await badge()) === 0);
  await clickUpdate();
  check('4e. the declined version is not offered again', (await toasts()).some(t => /up to date/i.test(t)) && !(await popup.$('.notification-confirm')),
    JSON.stringify(await toasts()));

  // ============================ 5. newer version → asks again → Use new
  remotePublish('antibot', 'detect-cloudflare', '9.1.0');
  publishRelease('v-e2e-4');
  await clickUpdate();
  const again = await popup.waitForSelector('.notification-confirm', { timeout: 5000 }).catch(() => null);
  check('5a. a newer version is offered again', !!again);
  await popup.click('.notification-confirm button:has-text("Use new version")');
  await sleep(1500);
  const cfNew = await storedDetector('antibot', 'detect-cloudflare');
  check('5b. Use new version replaces the edit', cfNew.version === '9.1.0' && !cfNew.userModified
    && !JSON.stringify(cfNew.detection).includes('e2e-user-edit'), cfNew.version);
  check('5c. running detection has 9.1.0', (await liveDetector('antibot', 'detect-cloudflare'))?.version === '9.1.0');

  // ============================== 6. Decide later keeps it pending
  await searchRule('datadome');
  await popup.click('.detector-card[data-detector-id="detect-datadome"] .edit-btn');
  await popup.waitForSelector('#editRuleModal .method-input.method-name', { state: 'attached' });
  await popup.evaluate(() => {
    const input = document.querySelector('#editRuleModal .method-input.method-name');
    input.value = 'e2e-dd-edit';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await popup.click('#saveRuleEdit');
  await sleep(1000);
  remotePublish('antibot', 'detect-datadome', '9.0.0');
  publishRelease('v-e2e-5');
  await clickUpdate();
  await popup.waitForSelector('.notification-confirm', { timeout: 5000 });
  await popup.click('.notification-confirm button:has-text("Decide later")');
  await sleep(800);
  check('6a. Decide later: still pending, badge on, edit kept', (await badge()) === 1
    && JSON.stringify((await storedDetector('antibot', 'detect-datadome')).detection).includes('e2e-dd-edit'), `badge=${await badge()}`);

  // ============================== 7. Reset to official
  await searchRule('datadome');
  await popup.click('.detector-card[data-detector-id="detect-datadome"] .rules-menu-trigger');
  await popup.click('.reset-official-btn');
  await popup.waitForSelector('.notification-confirm');
  await popup.click('.notification-confirm .notification-btn-confirm');
  await sleep(1200);
  const ddReset = await storedDetector('antibot', 'detect-datadome');
  check('7a. Reset to official restores the shipped rule', !ddReset.userModified
    && !JSON.stringify(ddReset.detection).includes('e2e-dd-edit'), ddReset.version);
  check('7b. running detection reset too', (await liveDetector('antibot', 'detect-datadome'))?.userModified === false);
  await clickUpdate(); // DataDome 9.0.0 now installs without asking
  check('7c. after reset the update installs without a dialog',
    !(await popup.$('.notification-confirm')) && (await storedDetector('antibot', 'detect-datadome')).version === '9.0.0');

  // ======================= 8. server down / rate limit → error, not "up to date"
  serverMode = 'down';
  await clickUpdate();
  check('8a. server down → error toast', (await toasts()).some(t => /reach github/i.test(t)) && !(await toasts()).some(t => /up to date/i.test(t)), JSON.stringify(await toasts()));
  serverMode = 'ratelimit';
  await clickUpdate();
  check('8b. rate limited → says so, with the wait', (await toasts()).some(t => /limiting/i.test(t) && /\d+ min/.test(t)), JSON.stringify(await toasts()));
  serverMode = 'up';

  // ============================== 9. settings → alarm, automatic install
  const alarm = async () => sw.evaluate(() => chrome.alarms.get('scrapfly-update-check'));
  const writeSettings = async (mutate) => popup.evaluate(async (m) => {
    const raw = (await chrome.storage.local.get('scrapfly_settings')).scrapfly_settings;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    const settings = parsed.settings || parsed;
    settings.updates = { ...(settings.updates || {}), ...m };
    await chrome.storage.local.set({ scrapfly_settings: JSON.stringify({ timestamp: new Date().toISOString(), settings }) });
  }, mutate);
  check('9a. auto-update off by default → no alarm', !(await alarm()));
  await writeSettings({ autoUpdate: true, checkIntervalHours: 6 });
  await sleep(800);
  const a1 = await alarm();
  check('9b. turning auto-update on creates the alarm now', a1?.periodInMinutes === 360, JSON.stringify(a1));
  await writeSettings({ lastCheckTimestamp: Date.now() });
  await sleep(500);
  const a2 = await alarm();
  check('9c. unrelated settings writes do not reset the alarm', a2?.scheduledTime === a1?.scheduledTime);
  await writeSettings({ checkIntervalHours: 24 });
  await sleep(800);
  check('9d. changing the interval reschedules it', (await alarm())?.periodInMinutes === 1440);

  // automatic run: what the alarm and the startup check execute
  remotePublish('antibot', 'detect-perimeterx', '9.0.0');
  publishRelease('v-e2e-6');
  await writeSettings({ lastCheckTimestamp: 0 });
  await sleep(300);
  await sw.evaluate(() => UpdateManager.runAutoUpdate());
  await sleep(800);
  check('9e. auto-update installs by itself, live in detection',
    (await storedDetector('antibot', 'detect-perimeterx')).version === '9.0.0'
    && (await liveDetector('antibot', 'detect-perimeterx'))?.version === '9.0.0');

  // Settings → Check now (shown while auto-update is on) does the same as Update
  remotePublish('antibot', 'detect-incapsula', '9.0.0');
  publishRelease('v-e2e-7');
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.click('#settingsBtn');
  await popup.waitForSelector('#checkUpdatesNowBtn', { state: 'visible', timeout: 10000 });
  await clearToasts();
  await popup.click('#checkUpdatesNowBtn');
  await popup.waitForFunction(() => !document.querySelector('#checkUpdatesNowBtn').disabled, null, { timeout: 30000 });
  await sleep(500);
  check('9f. Settings → Check now installs and says so', (await storedDetector('antibot', 'detect-incapsula')).version === '9.0.0'
    && (await toasts()).some(t => t.includes('v-e2e-7')), JSON.stringify(await toasts()));

  await writeSettings({ autoUpdate: false });
  await sleep(800);
  check('9g. turning it off clears the alarm', !(await alarm()));

  // ============================== 11. minExtensionVersion gate
  // A detector that needs a newer extension is never installed or counted
  remotePublish('antibot', 'detect-kasada', '9.0.0', (d) => ({ ...d, minExtensionVersion: '99.0' }));
  publishRelease('v-e2e-8');
  await openRules();
  await clickUpdate();
  const incompatible = (await storage('scrapfly_incompatible_updates')).scrapfly_incompatible_updates || [];
  check('11a. a detector needing a newer extension is not installed',
    (await badge()) === 0 && incompatible.some(u => u.id === 'detect-kasada')
    && (await storedDetector('antibot', 'detect-kasada')).version !== '9.0.0', `incompatible=${incompatible.map(u => u.id)}`);
  check('11b. the summary says which extension it waits for', (await toasts()).some(t => t.includes('99.0') && /kasada/i.test(t)), JSON.stringify(await toasts()));
  await openRules();
  const notice = await popup.$eval('#rulesExtensionNotice', n => ({ hidden: n.hidden, text: n.textContent.trim(), link: n.querySelector('a')?.href }));
  check('11c. the Rules tab keeps a notice with the extension link', !notice.hidden && notice.text.includes('99.0') && /chromewebstore/.test(notice.link), JSON.stringify(notice));

  // ============================== 10. extension update delivers bundled detectors
  const bundledShape = readJSON(path.join(EXT, 'detectors/antibot/detect-shapesecurity.json'));
  bundledShape.version = '9.9.0';
  writeJSON(path.join(EXT, 'detectors/antibot/detect-shapesecurity.json'), bundledShape);
  const bIdx = readJSON(path.join(EXT, 'detectors/index.json'));
  bIdx.antibot.detectors.push('detect-e2ebundled');
  writeJSON(path.join(EXT, 'detectors/index.json'), bIdx);
  writeJSON(path.join(EXT, 'detectors/antibot/detect-e2ebundled.json'),
    { ...readJSON(path.join(REPO, 'detectors/antibot/detect-netacea.json')), id: 'detect-e2ebundled', name: 'E2E Bundled', version: '2.0.0' });
  // Ship it as a new extension version: restart the browser on the same
  // profile, so Chrome fires a real onInstalled { reason: 'update' }
  const m2 = readJSON(path.join(EXT, 'manifest.json'));
  const fromVersion = m2.version;
  m2.version = fromVersion.split('.').map((n, i, a) => (i === a.length - 1 ? Number(n) + 1 : n)).join('.');
  writeJSON(path.join(EXT, 'manifest.json'), m2);
  await ctx.close();
  ctx = await chromium.launchPersistentContext(path.join(WORK, 'profile'), {
    headless: true, channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  await sleep(4000);
  const installedVersion = await sw.evaluate(() => chrome.runtime.getManifest().version);
  check('10. (setup) extension updated', installedVersion === m2.version, `${fromVersion} → ${installedVersion}`);
  check('10a. extension update: newer bundled detector reaches the existing install',
    (await storedDetector('antibot', 'detect-shapesecurity'))?.version === '9.9.0'
    && (await liveDetector('antibot', 'detect-shapesecurity'))?.version === '9.9.0');
  check('10b. extension update: new bundled detector added', !!(await liveDetector('antibot', 'detect-e2ebundled')));
  check('10c. earlier updates survive the extension update', (await storedDetector('antibot', 'detect-akamai'))?.version === '9.0.0');

  await ctx.close();
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — FAILED: ${failed.map(f => f.name.split('.')[0]).join(', ')}` : ''}`);
  console.log(`requests to fake GitHub: ${requests.length}`);
  if (failed.length) console.log(`work dir kept for inspection: ${WORK}`);
  else fs.rmSync(WORK, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error('HARNESS ERROR', e); server.close(); process.exit(2); });
