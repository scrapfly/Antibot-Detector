#!/usr/bin/env node
/**
 * The 3.1.3 detector changes end to end, in the real extension (unpacked in Chromium):
 *
 *   SiteGround SG-CAPTCHA   a local site answers like the challenge page SiteGround served on 2026-11-05 (the response header
 *                           sg-captcha: challenge, the page under /.well-known/sgcaptcha/ with its inline constants): the
 *                           extension names it SiteGround SG-CAPTCHA at 100% with the three rules and the three combinations;
 *                           a SiteGround-hosted page that challenges nobody (only the platform's headers) is not named
 *   Custom detector         with the interface in Spanish and in Japanese, Rules → Add opens the editor on a new detector whose
 *                           description reads in that language; in English it reads as it is stored
 *
 * Nothing here touches SiteGround: the page is a copy of what it sent, without the solver bundle, so nothing grinds a hash or
 * navigates away.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:all -- --only v313-detectors
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

// ---- What SiteGround sent (www.siteground.es and vocationalmedia.com, 2026-11-05) ----------------------------------------
const CHALLENGE_HEADERS = {
  server: 'nginx', 'content-type': 'text/html', vary: 'Accept-Encoding', 'sg-captcha': 'challenge', 'x-robots-tag': 'noindex',
  expires: 'Thu, 01 Jan 1970 00:00:01 GMT', 'cache-control': 'no-store,no-cache,max-age=0',
  'host-header': '8441280b0c35cbc1147f8ba998a563a7', 'x-proxy-cache-info': 'DT:1'
};
// The head and the markup as received (the solver bundle, the second inline script, is left out)
const CHALLENGE_PAGE = '<!doctype html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en"><head><meta charset="utf-8"/>' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="ROBOTS" content="NOINDEX, NOFOLLOW">' +
  '<noscript><meta http-equiv="refresh" content="0;/.well-known/captcha/?r=/"></noscript><title>Robot Challenge Screen</title>' +
  '<link rel="icon" href="data:;"><script>const sgchallenge="21:1793868422:7ab7936f:ffad8c23974f425c09561b5609c72e4a3410ef4177d002616c22846d666815e0:";\n' +
  'const sgsubmit_url="/.well-known/sgcaptcha/?r=/";const sgfallback_url="/.well-known/captcha/?y=err&r=/";</script></head>' +
  '<body style="text-align: center; margin: 0; padding: 0; height: 100%; color: #363636;"><section><div id="powCaptcha"><h1>127.0.0.1</h1>' +
  '<p>Checking the site connection security</p></div></section></body></html>';
// An ordinary page of a SiteGround-hosted site: the platform's headers and nothing that challenges
const HOSTING_HEADERS = {
  'content-type': 'text/html; charset=UTF-8', server: 'nginx', 'x-httpd-modphp': '1', 'host-header': '6b7412fb82ca5edfd0917e3957f05d89',
  'x-proxy-cache': 'MISS', 'x-proxy-cache-info': '0 NC:000000 UP:'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/.well-known/sgcaptcha/') { res.writeHead(200, CHALLENGE_HEADERS); return res.end(CHALLENGE_PAGE); }
  if (url.pathname === '/plain') {
    res.writeHead(200, HOSTING_HEADERS);
    return res.end('<!doctype html><html><head><title>A page of a SiteGround-hosted site</title></head><body><p>Nothing challenges you here.</p></body></html>');
  }
  res.writeHead(404); res.end();
});

// ---- Harness ------------------------------------------------------------------------------------
const results = [];
async function scenario(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push(true);
    console.log(`PASS  ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
  } catch (error) {
    results.push(false);
    console.log(`FAIL  ${name}\n      ${String((error && error.stack) || error).split('\n').slice(0, 6).join('\n      ')}`);
  }
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v313-detectors-')), {
    headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
  });
  const pageErrors = [];
  let extId;

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
  const W = async (fn, arg) => (await getWorker()).evaluate(fn, arg);
  async function openExtensionPage() {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { polling: 250, timeout: 30000 });
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
  /** The saved scan result of a page (the full address is the cache key), or null. */
  const savedResult = (url) => W(async (u) => {
    let storage = (await chrome.storage.local.get(DetectionEngineManager.STORAGE_KEY))[DetectionEngineManager.STORAGE_KEY] || {};
    if (typeof storage === 'string') storage = JSON.parse(storage);
    return JSON.parse(JSON.stringify(storage[UrlUtils.hashUrl(u, 'full')] || null));
  }, url);

  // ---- Start-up: English, the full address as cache key, no update check over the network -----------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  await W(() => SettingsStore.mutate({ operation: 'patch', patch: { detection: { cacheScope: 'full' } } }).then(r => r.success === true));
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

  // ===============================================================================================
  await scenario('SiteGround SG-CAPTCHA: the challenge page is named at 100% with its rules and combinations; a SiteGround-hosted page that challenges nobody is not', async () => {
    const url = `${origin}/.well-known/sgcaptcha/?r=/`;
    const page = await open(url);
    const tabId = await tabIdOf(url);
    await until(async () => /SiteGround SG-CAPTCHA/.test(await titleOf(tabId)), 25000, 'the hover text of the challenge page');
    assert.equal(await titleOf(tabId), 'Scrapfly: SiteGround SG-CAPTCHA 100%');
    const saved = await until(() => savedResult(url), 10000, 'the saved result');
    const found = saved.detectionResults.filter(d => d.detector.id === 'detect-siteground-captcha');
    assert.equal(found.length, 1, `the detections: ${saved.detectionResults.map(d => d.detector.id).join(', ')}`);
    assert.equal(found[0].detector.name, 'SiteGround SG-CAPTCHA');
    assert.equal(found[0].category, 'antibot');
    assert.equal(found[0].confidence, 100);
    assert.deepEqual([...new Set(found[0].matches.map(m => `${m.type}:${m.patternId}`))].sort(),
      ['content:sgcaptcha-script-constants', 'header:sg-captcha-header', 'url:sgcaptcha-wellknown-path']);
    assert.deepEqual(found[0].combinations.map(c => c.id).sort(), ['sgcaptcha-challenge-page', 'sgcaptcha-header-script', 'sgcaptcha-page-script']);
    assert.deepEqual(saved.detectionResults.map(d => d.detector.id), ['detect-siteground-captcha'], 'nothing else is named on that page');
    await page.close();

    const plainUrl = `${origin}/plain`;
    const plain = await open(plainUrl);
    const plainTab = await tabIdOf(plainUrl);
    await until(async () => (await titleOf(plainTab)) === 'Scrapfly: No protections found', 25000, 'the clean hover text');
    const savedPlain = await savedResult(plainUrl);
    assert.ok(!savedPlain || !savedPlain.detectionResults.some(d => d.detector.id === 'detect-siteground-captcha'), 'a SiteGround-hosted page is not the challenge');
    await plain.close();
  });

  // ===============================================================================================
  await scenario('Custom detector: Rules → Add opens on a description that reads in the interface language; in English it reads as stored', async () => {
    for (const [locale, expected] of [['es', 'Detector personalizado'], ['ja', 'カスタム検出器'], ['en', 'Custom detector']]) {
      await W((l) => chrome.storage.local.set({ scrapfly_language_override: l }), locale);
      const page = await openExtensionPage();
      await page.$eval('.tab-btn[data-tab="rules"]', el => el.click());
      await page.waitForSelector('#addDetectorBtn', { state: 'visible', timeout: 15000 });
      await page.$eval('#addDetectorBtn', el => el.click());
      await page.waitForSelector('#saveRuleEdit', { state: 'visible', timeout: 15000 });
      await until(async () => (await page.$eval('#detectorDescriptionInput', el => el.value)) === expected, 10000, `the description in ${locale} to read "${expected}"`);
      await page.$eval('#cancelRuleEdit', el => el.click());
      await page.close();
    }
  });

  await ctx.close();
  server.close();
  if (pageErrors.length) console.log(`Page errors: ${pageErrors.join(' | ')}`);
  const ok = results.every(Boolean) && pageErrors.length === 0;
  console.log(ok ? `\nRESULT ALL PASS (${results.length} scenarios), no page errors` : `\nRESULT ${results.filter(r => !r).length} of ${results.length} FAILED`);
  process.exitCode = ok ? 0 : 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
