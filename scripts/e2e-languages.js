#!/usr/bin/env node
/**
 * Every UI language, end to end, in the real extension (unpacked in Chromium).
 * For each _locales language it chooses that language in the extension, opens
 * each surface (Detection with results and its details, History, Rules and the
 * rule editor, Advanced, every Settings tab, the language picker, and the
 * Statistics page's tabs) and audits what is on screen:
 *
 *   - raw text: a message key, an unreplaced {0} / $1, "undefined", "[object"
 *   - English left in a language that has a translation for that text
 *     (a hardcoded string, or a text that never went through I18n)
 *   - a label cut off (ellipsis or clipped) that English shows whole
 *   - the page scrolling sideways
 *   - the document language, and console / page errors
 *
 * Findings that are certain fail the run; truncations are listed for review.
 * Screenshots of every surface can be written with --shots <folder>.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:languages                     all languages
 *   npm run e2e:languages -- --only uk,th     some of them
 *   npm run e2e:languages -- --shots /tmp/shots
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}
const fs = require('fs');
const os = require('os');
const path = require('path');
const REPO = path.resolve(path.join(__dirname, '..'));
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const only = opt('--only') ? opt('--only').split(',') : null;
const shotsDir = opt('--shots') ? path.resolve(opt('--shots')) : null;
const channel = process.env.E2E_CHANNEL || 'chromium';

const readMessages = (l) => JSON.parse(fs.readFileSync(path.join(REPO, '_locales', l, 'messages.json'), 'utf8'));
const ALL = fs.readdirSync(path.join(REPO, '_locales')).filter(l => fs.statSync(path.join(REPO, '_locales', l)).isDirectory()).sort();
const LOCALES = ['en', ...ALL.filter(l => l !== 'en')].filter(l => !only || only.includes(l) || l === 'en');
const english = readMessages('en');
const { ruleTexts } = require('./check-rule-i18n.js');
const ruleEnglish = [...ruleTexts().keys()];
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ---- Fixtures: what the pages show -------------------------------------------------------
const NOW = Date.now();
const FIXTURE_URL = 'https://shop.example.test/catalog?page=2';
const detections = [
  { detector: { id: 'detect-cloudflare', name: 'Cloudflare Bot Management', icon: 'cloudflare_official.png', difficulty: 'High', category: 'antibot' },
    name: 'Cloudflare Bot Management', category: 'antibot', confidence: 100, difficulty: 'High',
    matches: [
      { type: 'cookie', name: '__cf_bm', value: 'abc', baseConfidence: 100, confidence: 100, description: 'Cloudflare Bot Management cookie' },
      { type: 'header', name: 'cf-mitigated', value: 'challenge', baseConfidence: 90, confidence: 90 },
      { type: 'url', value: 'https://shop.example.test/cdn-cgi/challenge-platform/h/g/scripts/jsd/main.js', baseConfidence: 95, confidence: 95 },
      { type: 'content', value: 'cf_chl_opt', baseConfidence: 60, confidence: 60 },
      { type: 'dom', value: '#challenge-form', baseConfidence: 50, confidence: 50 }
    ], combinations: [{ id: 'cloudflare-challenge', name: 'Cloudflare challenge page', confidence: 100 }] },
  { detector: { id: 'detect-recaptcha', name: 'Google reCAPTCHA', icon: 'recaptcha_official.png', difficulty: 'Medium', category: 'captcha' },
    name: 'Google reCAPTCHA', category: 'captcha', confidence: 90, difficulty: 'Medium',
    matches: [{ type: 'url', value: 'https://www.google.com/recaptcha/api.js', baseConfidence: 90, confidence: 90 }, { type: 'window', value: 'grecaptcha', baseConfidence: 60, confidence: 60 }] },
  { detector: { id: 'detect-canvas-fingerprint', name: 'Canvas Fingerprint', icon: 'canvas_fingerprint.png', difficulty: 'Low', category: 'fingerprint' },
    name: 'Canvas Fingerprint', category: 'fingerprint', confidence: 45, difficulty: 'Low',
    matches: [{ type: 'js_hooks', value: 'HTMLCanvasElement.prototype.toDataURL', baseConfidence: 45, confidence: 45 }] }
];
const historyItem = (id, host, ageDays, names, extra = {}) => ({
  id, url: `https://${host}/`, hostname: host, title: `${host} home page`, timestamp: NOW - ageDays * 86400000,
  detections: names.map(([n, c, conf]) => ({ detector: { id: n.toLowerCase().replace(/\W+/g, '-'), name: n, difficulty: conf > 80 ? 'High' : 'Medium' }, name: n, category: c, confidence: conf, matches: [] })),
  ...extra
});
const historySeed = JSON.stringify({ items: [
  // Pinned, with a note and a Changed badge: the card shows all three
  historyItem('h1', 'shop.example.test', 0, [['Cloudflare Bot Management', 'antibot', 100], ['Google reCAPTCHA', 'captcha', 90], ['Canvas Fingerprint', 'fingerprint', 45]],
    { pinned: true, note: 'Checkout A', changed: { at: NOW - 3600000, added: ['Cloudflare Bot Management'], removed: ['DataDome'] } }),
  historyItem('h2', 'news.example.test', 1, [['Akamai Bot Manager', 'antibot', 95], ['Cloudflare Turnstile', 'captcha', 100]]),
  historyItem('h3', 'bank.example.test', 2, [['PerimeterX', 'antibot', 90], ['hCaptcha', 'captcha', 95]]),
  historyItem('h4', 'docs.example.test', 5, [['Google BotGuard', 'antibot', 80]]),
  historyItem('h5', 'blog.example.test', 9, [['Cloudflare Bot Management', 'antibot', 100]]),
  historyItem('h6', 'travel.example.test', 12, [['DataDome', 'antibot', 100], ['Google reCAPTCHA', 'captcha', 90]])
] });
const advancedSeed = JSON.stringify({ recaptcha: [{ id: 'cap1', timestamp: NOW - 60000, expiresAt: NOW + 25 * 60000, url: FIXTURE_URL, hostname: 'shop.example.test',
  data: { version: 'v2', siteKey: '6LcA2tEZAAAAAJj7FTYTF9cZ4NL3ShgBCBfkWov0' }, captureData: { version: 'v2', siteKey: '6LcA2tEZAAAAAJj7FTYTF9cZ4NL3ShgBCBfkWov0' } }] });

// ---- The audit, run inside the page --------------------------------------------------------
function auditInPage() {
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'HEAD', 'META', 'LINK', 'TITLE']);
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  const sig = (el) => {
    const key = el.getAttribute('data-i18n') || el.id || '';
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${key ? '#' + key : ''}`;
  };
  const texts = [], clipped = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      // Text marked as English on purpose (the English original of a rule text) is not a left-over
      if (skip.has(el.tagName.toUpperCase()) || el.closest('svg') || el.closest('[lang="en"]') || !visible(el)) continue;
      let own = '';
      for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
      own = own.replace(/\s+/g, ' ').trim();
      if (own) texts.push({ text: own, sig: sig(el) });
      for (const a of ['placeholder', 'title', 'aria-label', 'data-tip', 'data-tip-detail', 'alt']) {
        const v = (el.getAttribute(a) || '').replace(/\s+/g, ' ').trim();
        if (v) texts.push({ text: v, sig: sig(el) + '@' + a });
      }
      if (own && el.scrollWidth > el.clientWidth + 1) {
        const cs = getComputedStyle(el);
        // names, rule-editor method tags and dates are cut with an ellipsis on purpose (hover shows them whole)
        if (!/method-title|history-modal-detection-name|detector-name|last-updated-value|url-display/.test(sig(el)) && cs.overflowX !== 'visible' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') clipped.push({ text: own.slice(0, 60), sig: sig(el), by: el.scrollWidth - el.clientWidth });
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return { texts, clipped, scrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1, lang: document.documentElement.lang };
}

// ---- Classifying what the audit found -------------------------------------------------------
const templateRegex = (text) => new RegExp('^' + text.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\d\}/g, '.+') + '$');
const englishByText = new Map(); // normalized English text → key (messages without placeholders)
const englishTemplates = [];    // [RegExp, key] for messages with {0}
for (const [key, v] of Object.entries(english)) {
  const text = clean(v.message);
  if (!/[A-Za-z]{4,}/.test(text)) continue;
  if (/\{\d\}/.test(text)) englishTemplates.push([templateRegex(text), key, text.replace(/\{\d\}/g, '').length]);
  else englishByText.set(text, [...(englishByText.get(text) || []), key]);
}
const keyNames = new Set(Object.keys(english));
const ruleEnglishSet = new Set(ruleEnglish.map(clean));
// Texts that legitimately contain the JavaScript word "undefined" (rule-editor help), in any language
const undefinedTexts = new Set();
for (const l of ALL) for (const v of Object.values(readMessages(l))) if (/\bundefined\b/.test(v.message)) undefinedTexts.add(clean(v.message));
const RAW = /\{\d\}|\$\d|\[object |\bNaN\b/;

function classify(locale, messages, ruleDict, found) {
  const issues = [];
  for (const { text, sig } of found.texts) {
    if (keyNames.has(text) && /^[a-z][A-Za-z0-9]+$/.test(text)) issues.push(`raw key "${text}" (${sig})`);
    else if (RAW.test(text) || (/\bundefined\b/.test(text) && ![...undefinedTexts].some(u => text.includes(u) || u.includes(text)))) issues.push(`raw text "${text.slice(0, 70)}" (${sig})`);
    if (locale === 'en') continue;
    // A text equal to an English message, or fitting an English template with enough words of its own
    // (and not the language's own version of that template)
    // (several messages can share one English word: a language that keeps it for one of them, like "Export", is right)
    const sameText = englishByText.get(text);
    const key = sameText ? (sameText.every(k => messages[k] && clean(messages[k].message) !== clean(english[k].message)) ? sameText[0] : undefined)
      : (englishTemplates.find(([re, k, literal]) => literal >= 10 && re.test(text) && !(messages[k] && templateRegex(clean(messages[k].message)).test(text))) || [])[1];
    if (key && messages[key] && clean(messages[key].message) !== clean(english[key].message)) issues.push(`English left over "${text.slice(0, 70)}" (${sig}; translated as "${clean(messages[key].message).slice(0, 40)}")`);
    if (ruleEnglishSet.has(text) && ruleDict[text] && clean(ruleDict[text]) !== text) issues.push(`English rule text left over "${text.slice(0, 70)}" (${sig})`);
  }
  return [...new Set(issues)];
}

// ---- Surfaces -------------------------------------------------------------------------------
async function run() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-languages-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: true, channel, viewport: { width: 400, height: 600 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
  });
  const results = [];
  let baseline = null; // English truncations
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extId = new URL(worker.url()).host;
    const base = `chrome-extension://${extId}`;
    if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
    // The first load right after the browser starts can lose a startup fetch: open the popup once, unobserved
    const warm = await context.newPage();
    await warm.goto(`${base}/popup.html`);
    await warm.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { polling: 250, timeout: 30000 }).catch(() => {});
    await sleep(1500);
    await warm.close();

    for (const locale of LOCALES) {
      const messages = readMessages(locale);
      const ruleDict = locale === 'en' ? {} : JSON.parse(fs.readFileSync(path.join(REPO, 'detectors/i18n', `${locale}.json`), 'utf8'));
      const issues = [], errors = [], truncated = [], surfaces = [];
      const page = await context.newPage();
      const onError = (e) => errors.push(String(e.message || e).slice(0, 200));
      page.on('pageerror', onError);
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|flagcdn|ERR_(INTERNET|NAME|BLOCKED|CONNECTION|FAILED)|Failed to load resource|net::|Advanced history is available only to extension pages/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });

      // Choose the language and seed the pages' data, then open the popup in it
      await page.goto(`${base}/popup.html`);
      await page.evaluate(async ([lang, history, adv]) => {
        await chrome.storage.local.set({ scrapfly_language_override: lang, scrapfly_history: history, scrapfly_advanced_history: adv });
      }, [locale, historySeed, advancedSeed]);

      const audit = async (name, setup, { width, height } = {}) => {
        try {
          if (width) await page.setViewportSize({ width, height: height || 600 });
          if (setup) await setup();
          await sleep(350);
          const found = await page.evaluate(auditInPage);
          const surface = `${name}`;
          surfaces.push(surface);
          for (const i of classify(locale, messages, ruleDict, found)) issues.push(`[${surface}] ${i}`);
          const expectLang = locale.replace('_', '-');
          if (found.lang !== expectLang) issues.push(`[${surface}] document lang is "${found.lang}", expected "${expectLang}"`);
          if (found.scrollsSideways) issues.push(`[${surface}] the page scrolls sideways`);
          for (const c of found.clipped) truncated.push(`[${surface}] ${c.sig} "${c.text}" (cut by ${c.by}px)`);
          if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${locale}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`) });
        } catch (e) {
          issues.push(`[${name}] could not be checked: ${String(e.message).split('\n')[0].slice(0, 140)}`);
        }
      };
      const click = async (selector) => { await page.$eval(selector, el => el.click()); };
      const popup = async () => {
        await page.setViewportSize({ width: 400, height: 600 });
        await page.goto(`${base}/popup.html`);
        await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { polling: 250, timeout: 20000 });
        await sleep(600);
      };
      const tab = async (name) => { await page.evaluate((n) => window.popupInstance.switchTab(n), name); await sleep(450); };
      const closeModals = async () => page.evaluate(() => document.querySelectorAll('.modal-close, #closeSettingsModal, .detection-modal-close, #closeDetectionModal, #historyModalClose').forEach(b => { try { b.click(); } catch (_) {} }));

      await popup();
      // Detection: the empty state, then the results and the details of the first card
      await audit('detection-empty');
      await page.evaluate(async ([list, url]) => {
        const d = window.popupInstance.detection;
        await d.displayResults(list, { url, cacheMetadata: { scope: 'domain', expiry: Date.now() + 5 * 86400000, timestamp: Date.now() } });
      }, [detections, FIXTURE_URL]);
      await audit('detection-results');
      // The Copy menu (summary, Markdown, JSON)
      await audit('detection-copy-menu', async () => { await click('#copyOverviewBtn'); await sleep(300); });
      await page.keyboard.press('Escape');
      await audit('detection-details', async () => { await click('.detection-card'); await sleep(500); });
      await closeModals();
      await sleep(400);
      await tab('history'); await audit('history');
      await audit('history-details', async () => { await click('.history-item'); await sleep(500); });
      await closeModals();
      // The "…" menu (Unpin, Edit note on the pinned first card), the note dialog and the export dialog
      await audit('history-menu', async () => { await click('.history-item .history-more-btn'); await sleep(300); });
      await page.keyboard.press('Escape');
      const closeDialog = async () => { await page.evaluate(() => document.querySelector('.notification-confirm .notification-btn-cancel')?.click()); await sleep(450); };
      await audit('history-note', async () => {
        await click('.history-item .history-more-btn'); await sleep(250);
        await click('#historyItemMenu [data-action="note"]');
        await page.waitForSelector('.notification-confirm textarea', { timeout: 8000 }); await sleep(450);
      });
      await closeDialog();
      await audit('history-export', async () => {
        await click('#historyMenuBtn'); await sleep(250);
        await click('#exportHistoryBtn');
        await page.waitForSelector('.notification-confirm .history-dialog-form', { timeout: 8000 }); await sleep(450);
      });
      await closeDialog();
      await tab('rules'); await audit('rules');
      // A rule card's "…" menu (Duplicate, Export, Delete)
      await audit('rules-card-menu', async () => { await click('.detector-card .rules-menu-trigger'); await sleep(300); });
      await page.evaluate(() => document.querySelectorAll('.rules-menu.open').forEach(m => m.classList.remove('open')));
      await audit('rules-editor', async () => { await click('#addDetectorBtn'); await page.waitForSelector('#saveRuleEdit', { state: 'attached', timeout: 8000 }); await sleep(400); });
      await closeModals();
      await popup(); // a clean popup for the remaining tabs
      await page.evaluate(async ([list, url]) => { await window.popupInstance.detection.displayResults(list, { url, cacheMetadata: { scope: 'domain', expiry: Date.now() + 86400000, timestamp: Date.now() } }); }, [detections, FIXTURE_URL]);
      await tab('advanced'); await audit('advanced');
      await audit('advanced-captures', async () => { await page.evaluate(() => window.popupInstance.advanced.switchAdvancedTab('captures')); await sleep(500); });
      await popup();
      await click('#settingsBtn'); await sleep(500);
      for (const t of ['general', 'detection', 'history', 'data']) {
        await audit(`settings-${t}`, async () => {
          await page.evaluate((n) => document.querySelector(`.settings-tab-btn[data-settings-tab="${n}"]`)?.click(), t);
          await page.evaluate(() => document.querySelectorAll('#settingsModal .settings-card-head').forEach(h => { if (h.getAttribute('aria-expanded') !== 'true') h.click(); }));
          await sleep(350);
        });
      }
      await audit('settings-language-picker', async () => {
        await page.evaluate(() => document.querySelector('.settings-tab-btn[data-settings-tab="general"]')?.click());
        await sleep(200);
        await page.evaluate(() => document.querySelector('.language-picker-trigger')?.click());
        await sleep(300);
      });

      // The Statistics page, wider than the popup
      await page.goto(`${base}/sections/stats/stats.html`);
      await page.waitForSelector('.stats-section-btn', { timeout: 15000 });
      await sleep(900);
      for (const s of ['overview', 'protections', 'domains', 'evidence', 'activity', 'rules']) {
        await audit(`stats-${s}`, async () => { await page.evaluate((n) => document.querySelector(`.stats-section-btn[data-section="${n}"]`)?.click(), s); await sleep(500); }, { width: 1100, height: 800 });
      }
      // The Export menu (CSV, JSON, Markdown)
      await audit('stats-export-menu', async () => { await page.evaluate(() => document.querySelector('#statsExportBtn')?.click()); await sleep(300); }, { width: 1100, height: 800 });

      await page.close();
      if (locale === 'en') baseline = new Set(truncated.map(t => t.replace(/ "[^"]*" \(cut by \d+px\)/, '')));
      const newTruncations = locale === 'en' ? [] : truncated.filter(t => !baseline || !baseline.has(t.replace(/ "[^"]*" \(cut by \d+px\)/, '')));
      results.push({ locale, issues, errors: [...new Set(errors)], truncated: newTruncations, surfaces: surfaces.length });
      const bad = issues.length + errors.length;
      console.log(`${locale.padEnd(6)} ${bad ? 'FAIL' : 'ok  '} ${surfaces.length} surfaces · ${issues.length} issue(s) · ${errors.length} error(s) · ${newTruncations.length} new truncation(s)`);
      for (const line of issues.slice(0, 12)) console.log(`         ✖ ${line}`);
      if (issues.length > 12) console.log(`         … ${issues.length - 12} more`);
      for (const line of [...new Set(errors)].slice(0, 5)) console.log(`         ✖ ${line}`);
    }
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }

  const failed = results.filter(r => r.issues.length || r.errors.length);
  const withTruncation = results.filter(r => r.truncated.length);
  if (withTruncation.length) {
    console.log('\nLabels cut off that English shows whole (review; a long word may need a shorter translation):');
    for (const r of withTruncation) { console.log(`  ${r.locale}:`); for (const line of r.truncated.slice(0, 15)) console.log(`    ${line}`); if (r.truncated.length > 15) console.log(`    … ${r.truncated.length - 15} more`); }
  }
  fs.writeFileSync(path.join(os.tmpdir(), 'e2e-languages.json'), JSON.stringify(results, null, 1));
  console.log(failed.length ? `\nFAIL: ${failed.map(r => r.locale).join(', ')}` : `\nPASS ${results.length} languages (${withTruncation.length} with labels to review)`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
