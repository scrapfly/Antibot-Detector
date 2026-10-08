#!/usr/bin/env node
/**
 * Live check of the detectors on real pages, with the real extension loaded
 * unpacked in Chromium. Sites and expectations live in scripts/live-sites.json:
 *
 *   { "url": "...", "expect": [{ "detector": "detect-x", "min": 80 }],
 *     "forbid": ["detect-y"], "waitMs": 12000, "note": "why this site" }
 *
 * For every site it prints what the extension detected (confidence, the rule
 * ids that matched and the combinations that fired), checks expect/forbid,
 * and on a miss prints what the page really loaded (script/XHR URLs, cookies,
 * response headers, globals) so the rule can be fixed. Full results go to
 * --out (JSON).
 *
 *   npm run e2e:live                              all sites
 *   npm run e2e:live -- --only=datadome           sites whose url/expect matches
 *   npm run e2e:live -- --out=/tmp/live.json --signals
 *
 * Not part of `npm run verify`: it needs the network, Playwright and Chromium
 * (npm i --no-save playwright && npx playwright install chromium). Live sites
 * change and some block headless browsers, so a failure here is a lead to
 * investigate, not proof the rules are wrong.
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}
const path = require('path');
const fs = require('fs');
const os = require('os');

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => {
  const [k, ...v] = a.slice(2).split('=');
  return [k, v.length ? v.join('=') : true];
}));
const REPO = path.resolve(opt.repo || path.join(__dirname, '..'));
const SITES_FILE = path.resolve(opt.sites || path.join(__dirname, 'live-sites.json'));
const only = opt.only ? new RegExp(opt.only, 'i') : null;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const sites = JSON.parse(fs.readFileSync(SITES_FILE, 'utf8')).sites
  .filter(s => !only || only.test(s.url) || (s.expect || []).some(e => only.test(e.detector)));

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-live-')), {
    headless: true, channel: 'chromium', viewport: { width: 1280, height: 900 }, userAgent: UA, locale: 'en-US',
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await sleep(2500);

  // Cache by full URL so two pages on one host are detected separately
  const admin = await ctx.newPage();
  await admin.goto(`chrome-extension://${extId}/popup.html`);
  await admin.evaluate(async () => {
    const raw = (await chrome.storage.local.get('scrapfly_settings')).scrapfly_settings;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    const settings = parsed.settings || parsed;
    settings.detection = { ...(settings.detection || {}), cacheScope: 'full' };
    await chrome.storage.local.set({ scrapfly_settings: JSON.stringify({ timestamp: new Date().toISOString(), settings }) });
  });
  await admin.close();

  // Window properties every page has, to report only page-added globals
  const blank = await ctx.newPage();
  await blank.goto('https://example.com/', { waitUntil: 'commit', timeout: 30000 }).catch(() => {});
  await sleep(1500);
  const baseline = new Set(await blank.evaluate(() => Object.getOwnPropertyNames(window)).catch(() => []));
  await blank.close();

  const results = [];
  let failures = 0;
  for (const site of sites) {
    const page = await ctx.newPage();
    const requests = [];
    const docs = [];
    page.on('request', r => {
      if (['script', 'xhr', 'fetch', 'document', 'websocket', 'ping', 'other'].includes(r.resourceType())) {
        requests.push(`${r.resourceType()} ${r.method()} ${r.url().slice(0, 200)}`);
      }
    });
    page.on('response', async r => {
      if (r.request().resourceType() === 'document' && r.frame() === page.mainFrame()) {
        docs.push({ status: r.status(), url: r.url(), headers: await r.allHeaders().catch(() => ({})) });
      }
    });
    let loadError = null;
    try {
      await page.goto(site.url, { waitUntil: 'commit', timeout: 45000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    } catch (e) {
      loadError = e.message.split('\n')[0].slice(0, 140);
    }
    await sleep(site.waitMs || 12000);

    const finalUrl = page.url();
    const tab = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find(t => t.url === u) || null, finalUrl).catch(() => null);
    let detections = [];
    if (tab) {
      const popup = await ctx.newPage();
      await popup.addInitScript((t) => {
        const original = chrome.tabs.query.bind(chrome.tabs);
        chrome.tabs.query = (info, cb) => {
          if (info && info.active) { if (cb) { cb([t]); return undefined; } return Promise.resolve([t]); }
          return original(info, cb);
        };
      }, tab);
      await popup.goto(`chrome-extension://${extId}/popup.html`);
      await popup.waitForFunction(() => window.popupInstance?.detection?.initialized, null, { timeout: 15000 }).catch(() => {});
      await sleep(3000);
      detections = await popup.evaluate(() => (window.popupInstance.detection.currentResults || []).map(d => ({
        id: d.detector?.id || d.id,
        name: d.detector?.name || d.name,
        category: String(d.category || '').toLowerCase(),
        confidence: d.confidence,
        rules: [...new Set((d.matches || []).map(m => m.patternId || `${m.type}:${m.pattern || m.value || '?'}`))],
        combinations: (d.combinations || []).map(c => ({ id: c.id, confidence: c.confidence }))
      }))).catch(() => []);
      await popup.close();
    }
    const byId = new Map(detections.map(d => [d.id, d]));

    const checks = [];
    for (const e of site.expect || []) {
      const d = byId.get(e.detector);
      checks.push({ ok: !!d && d.confidence >= (e.min || 1), text: `expect ${e.detector} >= ${e.min || 1}: ${d ? d.confidence + '%' : 'not detected'}` });
    }
    for (const id of site.forbid || []) {
      const d = byId.get(id);
      checks.push({ ok: !d, text: `forbid ${id}: ${d ? 'DETECTED ' + d.confidence + '%' : 'not detected'}` });
    }
    const ok = !loadError && checks.every(c => c.ok);
    if (!ok) failures++;

    const signals = {
      status: docs.map(d => d.status), finalUrl,
      headers: docs.length ? docs[docs.length - 1].headers : {},
      cookies: (await ctx.cookies(finalUrl).catch(() => [])).map(c => c.name),
      globals: await page.evaluate((base) => Object.getOwnPropertyNames(window).filter(k => !base.includes(k)).slice(0, 150), [...baseline]).catch(() => []),
      requests: [...new Set(requests)]
    };
    results.push({ ...site, ok, loadError, checks, detections, signals });

    console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${site.url}  [${signals.status.join(',')}]${loadError ? '  ' + loadError : ''}${site.note ? '  — ' + site.note : ''}`);
    for (const c of checks) console.log(`      ${c.ok ? 'ok ' : 'NO '} ${c.text}`);
    for (const d of detections.filter(x => x.category !== 'fingerprint' || opt.fingerprint)) {
      console.log(`      ${String(d.confidence).padStart(3)}% ${d.name}  <- ${d.rules.join(', ')}`
        + (d.combinations?.length ? `  [combinations: ${d.combinations.map(c => `${c.id} ${c.confidence}%`).join(', ')}]` : ''));
    }
    const fp = detections.filter(x => x.category === 'fingerprint');
    if (fp.length && !opt.fingerprint) console.log(`      fingerprint: ${fp.map(d => `${d.name.replace(' Fingerprint', '')} ${d.confidence}`).join(', ')}`);
    if (opt.signals || !ok) {
      const h = Object.entries(signals.headers).filter(([k]) => !/^(date|content-|vary|cache-control|expires|last-modified|etag|accept-ranges|connection|transfer-encoding|age|pragma|strict-transport-security|report-to|nel|permissions-policy|referrer-policy|x-content-type-options|x-frame-options|x-xss-protection|alt-svc|link|cross-origin-.*|content-security-policy.*)$/.test(k));
      console.log(`      headers: ${h.map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(' | ')}`);
      console.log(`      cookies: ${signals.cookies.join(', ')}`);
      console.log(`      globals: ${signals.globals.slice(0, 60).join(', ')}`);
      const grep = opt.grep ? new RegExp(opt.grep, 'i') : null;
      const reqs = signals.requests.filter(r => !grep || grep.test(r));
      console.log(`      requests (${reqs.length}${grep ? ' matching' : ''}):`);
      reqs.slice(0, Number(opt.maxreq || 25)).forEach(r => console.log(`        ${r}`));
    }
    await page.close();
  }

  if (opt.out) fs.writeFileSync(path.resolve(opt.out), JSON.stringify(results, null, 2));
  console.log(`\nRESULT ${results.length - failures}/${results.length} sites passed${failures ? ` — ${failures} to investigate` : ''}`);
  await ctx.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
