#!/usr/bin/env node
/**
 * The 3.1.3 Advanced changes end to end, in the real extension (unpacked in Chromium):
 *
 *   Imperva         Analyze scripts keeps the POST bodies of Imperva's own requests only (real webRequest bodies), cut at a
 *                   fixed size; a beacon, a form and a third party that copies the ?d= naming are not kept
 *   Akamai          Extract Sensor deletes _abck once the extraction is armed, and the sensor the reload sends is captured
 *   Lemin, ALTCHA   Extract site key finds each key on a real page; Analyze scripts lists each vendor's own requests, from what
 *                   the page already loaded and from a reload; the Advanced tab's supported protections count both
 *
 * A local site stands in for each protection. The vendors' hosts do not resolve here (host-resolver rules), so nothing leaves the
 * machine; the requests are still seen by the extension, which is what the tools read.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium (npm run e2e:setup).
 *   npm run e2e:all -- --only v313-advanced
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

// ---- Local site ---------------------------------------------------------------------------------
// Reese84's sensor request: a JSON body that names solution, interrogation, old_token and performance (20 KB, as real ones are)
const SENSOR = `{"solution":{"interrogation":{"p":"${'A'.repeat(20000)}","st":1},"version":"stable"},"old_token":null,"error":null,"performance":{"interval":8}}`;
const LEMIN_KEY = 'CROPPED_3dfdd5c_d1872b526b794d83ba3b365eb15a200b';
const ALTCHA_KEY = 'key_AbC-123_xyz789';
const AKAMAI_SENSOR = '3;0;1;0;4733506;sensor-e2e-0123456789';
let port = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST') {
    req.resume();
    req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end('{}'); });
    return;
  }
  const page = (title, body, headers = {}) => {
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store', ...headers });
    res.end(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`);
  };
  // What a page protected by Imperva sends at load, among requests that are not Imperva's
  if (url.pathname === '/imperva') {
    return page('Imperva probe', `<p>imperva probe</p><script>
      const post = (target, body, extra) => fetch(target, Object.assign({ method: 'POST', body }, extra)).catch(() => {});
      post('/Disk-Lack-Be-Take-Dried?d=127.0.0.1', ${JSON.stringify(SENSOR)});
      post('/api/comments', 'my solution and its performance');
      post('http://beacon.example:${port}/collect', '{"event":"performance","solution":"x"}', { mode: 'no-cors' });
      post('http://beacon.example:${port}/collect?d=beacon.example', ${JSON.stringify(SENSOR)}, { mode: 'no-cors' });
    </script>`);
  }
  // Akamai's _abck cookie, and the sensor the page posts at load
  if (url.pathname === '/akamai') {
    return page('Akamai probe', `<p>akamai probe</p><script>
      fetch('/akam/11/pixel_9a8b7c?token=secret-token', { method: 'POST', body: ${JSON.stringify(AKAMAI_SENSOR)} }).catch(() => {});
    </script>`, { 'set-cookie': '_abck=E2E0123456789ABCDEF~-1~-1~-1; Path=/' });
  }
  // Lemin's widget script, ALTCHA's package and its challenge, and a Sentinel on the owner's own host (answered by the test)
  if (url.pathname === '/vendors') {
    return page('Vendors probe', `<div id="lemin-cropped-captcha"></div>
      <script src="https://api.leminnow.com/captcha/v1/cropped/${LEMIN_KEY}/js"></script>
      <script src="https://cdn.jsdelivr.net/npm/altcha@1.2.0/dist/altcha.min.js"></script>
      <altcha-widget challenge="https://sentinel.shop.example/v1/challenge?apiKey=${ALTCHA_KEY}"></altcha-widget>
      <script>
        fetch('https://sentinel.shop.example/v1/challenge?apiKey=${ALTCHA_KEY}').catch(() => {});
        fetch('https://eu.altcha.org/v1/challenge?apiKey=${ALTCHA_KEY}').catch(() => {});
      </script>`);
  }
  res.writeHead(404); res.end();
});

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
    console.log(`FAIL  ${name}\n      ${String((error && error.stack) || error).split('\n').slice(0, 8).join('\n      ')}`);
  }
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v313-advanced-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`,
      // The vendors' hosts fail at once (nothing leaves the machine; the extension still sees the requests); the beacon's is local
      '--host-resolver-rules=MAP api.leminnow.com ~NOTFOUND, MAP cdn.jsdelivr.net ~NOTFOUND, MAP eu.altcha.org ~NOTFOUND, MAP sentinel.shop.example ~NOTFOUND, MAP beacon.example 127.0.0.1']
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
  /** The tab id Chrome gives a page (looked up by its address). */
  const tabIdOf = (url) => W(async (u) => (await chrome.tabs.query({})).find(t => t.url === u)?.id, url);
  /** An extension page that keeps the last message of each type the worker sends (the tools answer that way). */
  async function listener() {
    const admin = await openExtensionPage();
    await admin.evaluate(() => {
      window.__messages = {};
      chrome.runtime.onMessage.addListener((message) => { if (message && message.type) window.__messages[message.type] = message; });
    });
    return {
      admin,
      send: (message) => admin.evaluate((m) => chrome.runtime.sendMessage(m), message),
      message: (type, ms = 40000) => until(() => admin.evaluate((t) => window.__messages[t] || null, type), ms, `${type}`)
    };
  }

  // ---- Start-up -----------------------------------------------------------------------------------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));

  // ===============================================================================================
  await scenario('Imperva: Analyze scripts keeps the body of Imperva\'s own request only, cut at 8192 characters', async () => {
    const url = `${origin}/imperva`;
    const page = await open(url);
    const tabId = await tabIdOf(url);
    const tool = await listener();
    const started = await tool.send({ type: 'IMPERVA_EXTRACT_SCRIPTS', tabId });
    assert.equal(started.status, 'success', JSON.stringify(started));
    await page.reload(); // the page posts its bodies at load: the sensor, a form, a beacon, and a third party that copies ?d=
    const { extractedData: data } = await tool.message('IMPERVA_EXTRACTION_COMPLETED');
    const urls = data.payloads.map(item => item.url);
    assert.equal(data.payloads.length, 1, `only Imperva's sensor is kept: ${JSON.stringify(urls)}`);
    assert.equal(new URL(urls[0]).pathname, '/Disk-Lack-Be-Take-Dried');
    const [stored] = data.payloads;
    assert.equal(stored.payload.length, 8192);
    assert.equal(stored.payload, SENSOR.slice(0, 8192));
    assert.equal(stored.truncated, true);
    assert.equal(stored.length, SENSOR.length, 'the size it had is kept');
    assert.deepEqual(stored.keywords, ['old_token', 'performance', 'solution']);
    assert.equal(data.challengeUrls.length, 1, JSON.stringify(data.challengeUrls));
    assert.ok(!JSON.stringify(data).includes('my solution and its performance'), 'the form\'s text is nowhere in the result');
    await tool.admin.close();
    await page.close();
  });

  // ===============================================================================================
  await scenario('Akamai: Extract Sensor deletes _abck once armed, and the sensor the reload sends is captured', async () => {
    const url = `${origin}/akamai`;
    const page = await open(url);
    const tabId = await tabIdOf(url);
    const cookie = () => W(async (u) => (await chrome.cookies.get({ url: u, name: '_abck' }))?.value ?? null, url);
    assert.ok(await cookie(), 'the page set _abck');
    const tool = await listener();
    const started = await tool.send({ type: 'AKAMAI_EXTRACT_SENSOR', tabId });
    assert.equal(started.status, 'success', JSON.stringify(started));
    assert.equal(await cookie(), null, 'the cookie is deleted');
    const state = await tool.send({ type: 'AKAMAI_GET_CAPTURE_STATE', tabId });
    assert.equal(state.isCapturing, true, 'and the extraction is armed for the reload');
    await page.reload(); // the popup reloads here
    const { extractedData: data } = await tool.message('AKAMAI_EXTRACTION_RESULT');
    assert.equal(data.sensorData, AKAMAI_SENSOR);
    assert.equal(data.akamaiVersion, 'Akamai V3');
    assert.deepEqual(data.endpoints, [`${origin}/akam/11/pixel_9a8b7c`], 'the endpoint, by path');
    await tool.admin.close();
    await page.close();
  });

  // ===============================================================================================
  await scenario('Lemin and ALTCHA: Extract site key finds each key on a real page and nothing of the other vendor', async () => {
    // A Sentinel on the owner's own host answers the widget; its request is in the page's Resource Timing list
    await ctx.route('https://sentinel.shop.example/**', route => route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"algorithm":"SHA-256"}'
    }));
    try {
      const url = `${origin}/vendors`;
      const page = await open(url);
      const tabId = await tabIdOf(url);
      await page.waitForFunction((key) => performance.getEntriesByType('resource').some(entry => entry.name.includes(key)), ALTCHA_KEY, { polling: 250, timeout: 20000 });
      const admin = await openExtensionPage();
      const keysOf = (vendorId) => admin.evaluate(async ({ id, vendor }) => {
        const result = await AdvancedSiteKeyProbe.extract(id, AdvancedCaptchaVendors.probeArgs(AdvancedCaptchaVendors.byVendorId[vendor]));
        return result.keys.map(entry => ({ sitekey: entry.sitekey, sources: entry.sources }));
      }, { id: tabId, vendor: vendorId });
      assert.deepEqual((await keysOf('lemin')).map(entry => entry.sitekey), [LEMIN_KEY]);
      const altcha = await keysOf('altcha');
      assert.deepEqual(altcha.map(entry => entry.sitekey), [ALTCHA_KEY]);
      assert.deepEqual(altcha[0].sources, ['request']);
      await admin.close();
      await page.close();
    } finally {
      await ctx.unroute('https://sentinel.shop.example/**');
    }
  });

  // ===============================================================================================
  await scenario('Lemin and ALTCHA: Analyze scripts lists the vendor\'s own requests, from the loaded page and from a reload', async () => {
    const url = `${origin}/vendors`;
    const page = await open(url);
    const tabId = await tabIdOf(url);
    const tool = await listener();
    const expected = {
      lemin: [['sdk', `https://api.leminnow.com/captcha/v1/cropped/${LEMIN_KEY}/js`]],
      altcha: [['widget', 'https://cdn.jsdelivr.net/npm/altcha@1.2.0/dist/altcha.min.js'], ['challenge', `https://eu.altcha.org/v1/challenge?apiKey=${ALTCHA_KEY}`]]
    };
    for (const vendor of ['lemin', 'altcha']) {
      // What the page loaded already: no reload (the script tags are there whether or not they could load)
      const loaded = await tool.send({ type: 'ADVANCED_LOADED_SCRIPTS', tabId, vendorId: vendor });
      assert.equal(loaded.status, 'ok', JSON.stringify(loaded));
      const fromPage = loaded.data.scripts.map(script => [script.type, script.url]);
      for (const entry of expected[vendor].filter(([type]) => type !== 'challenge')) assert.ok(fromPage.some(([type, address]) => type === entry[0] && address === entry[1]), `${vendor} loaded page: ${JSON.stringify(fromPage)}`);
      assert.ok(fromPage.every(([, address]) => !address.includes(vendor === 'lemin' ? 'altcha' : 'leminnow') && !address.includes('sentinel.shop.example')), `${vendor}: only its own requests: ${JSON.stringify(fromPage)}`);

      // A reload watched by the worker: the requests the extension sees, which is also what a page that loads late gives
      const answer = await tool.send({ type: `${vendor.toUpperCase()}_START_ANALYSIS`, tabId, url });
      assert.equal(answer.status, 'started', JSON.stringify(answer));
      await page.reload();
      const result = await tool.message(`${vendor.toUpperCase()}_ANALYSIS_RESULT`, 45000);
      assert.equal(result.status, 'completed', JSON.stringify(result));
      const seen = result.data.scripts.map(script => [script.type, script.url]);
      assert.deepEqual(seen.sort(), expected[vendor].map(entry => [...entry]).sort(), `${vendor} after a reload`);
    }
    await tool.admin.close();
    await page.close();
  });

  // ===============================================================================================
  await scenario('Advanced: the supported protections count Lemin Cropped Captcha and ALTCHA, with their logos', async () => {
    const page = await openExtensionPage();
    await page.$eval('.tab-btn[data-tab="advanced"]', el => el.click());
    await page.waitForFunction(() => document.querySelectorAll('.advanced-supported-logo').length > 0, null, { polling: 250, timeout: 30000 });
    const shown = await page.evaluate(() => ({
      titles: [...document.querySelectorAll('.advanced-supported-logo')].map(item => item.getAttribute('title')),
      counts: [...document.querySelectorAll('.advanced-supported-count')].map(item => item.textContent.trim())
    }));
    assert.equal(shown.titles.length, 27);
    assert.deepEqual(shown.counts, ['6', '21']);
    assert.ok(shown.titles.includes('Lemin Cropped Captcha') && shown.titles.includes('ALTCHA'), shown.titles.join(', '));
    const logos = await page.evaluate(async () => {
      const out = {};
      for (const file of ['lemin_official.png', 'altcha_official.png']) {
        for (const folder of ['detectors/icons', 'assets/logos-dark']) {
          const response = await fetch(chrome.runtime.getURL(`${folder}/${file}`));
          out[`${folder}/${file}`] = response.ok ? (await response.blob()).size : 0;
        }
      }
      return out;
    });
    for (const [file, size] of Object.entries(logos)) assert.ok(size > 100, `${file}: ${size} bytes`);
    await page.close();
  });

  // ---- Report -------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${pageErrors.join('\n  ')}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  console.log(failed.length || pageErrors.length ? `RESULT ${failed.length} FAILED` : `RESULT ALL PASS (${results.length} scenarios)`);
  await ctx.close();
  server.close();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
