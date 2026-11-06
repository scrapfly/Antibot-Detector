#!/usr/bin/env node
/**
 * 3.1.4: History → … → Compare with… in the real extension (unpacked in Chromium), redesigned:
 *
 *   The list         a scan is one short line (date without seconds, count); the other scan's page path sits under it when its
 *                    address differs (the whole address on hover); one range line
 *   The result       four counts (a kind with none is dimmed), then Added, Removed, Changed and Unchanged as rows: the category's
 *                    icon, the name, the score in a column; a changed row shows the move with its difference, its evidence under it
 *   Unchanged        its heading is a button when it holds more than three: folded, opened by a click, Enter or Space (Enter does
 *                    not copy and close the dialog); two identical scans keep it open
 *   Look             English and Arabic, dark and light, a long page path and long names: nothing spills sideways, the scores line up,
 *                    the text reads (contrast), right to left mirrors the rows; the dialog stays inside the popup
 *   Unchanged        Copy as Markdown copies the report as before (the dates with their seconds), Close and Escape copy nothing
 *
 * History is seeded with entries, so no site is visited. The popup is opened as a page 400 x 580, the size of the real popup.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup
 *   node scripts/e2e-v314-compare.js [<checkout>] [--only=<text>]
 * V314_SHOTS=<folder> saves a screenshot of the dialog for every case, theme and language (default: <tmp>/e2e-v314-compare-shots).
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm run e2e:setup (or npm i --no-save playwright && npx playwright install chromium)');
  process.exit(2);
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const SHOTS = process.env.V314_SHOTS || path.join(os.tmpdir(), 'e2e-v314-compare-shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- History to compare ----------------------------------------------------------------------------
const NOW = Date.now();
const HOUR = 3600000;
const DAY = 24 * HOUR;
const det = (name, category, confidence, types = ['cookie']) => ({ detector: { name }, name, category, confidence, matches: types.map(type => ({ type, value: `${type}-value` })) });
const entry = (id, url, ago, detections) => ({ id, url, hostname: new URL(url).hostname, title: `Page ${id}`, timestamp: NOW - ago, detections, detectionCount: detections.length, categories: [...new Set(detections.map(d => d.category))] });

// One protection changed among nine that did not (the dialog that was too tall to read)
const FINGERPRINTS = [['Canvas Fingerprint', 10], ['CSS Fingerprint', 10], ['Font Fingerprint', 10], ['Hardware Fingerprint', 15], ['Navigator Fingerprint', 30],
  ['Performance Fingerprint', 30], ['Screen Fingerprint', 25], ['Timezone/Intl Fingerprint', 15], ['Web Storage Fingerprint', 15]].map(([name, score]) => det(name, 'Fingerprint', score, ['js_hooks']));
const ONE_URL = 'https://search.example/u/1/search-console/performance/search-analytics';

// Several added, removed and changed (up, down, evidence only), four unchanged
const SHOP = 'https://shop.example/cart';
const MIX_BEFORE = [det('Akamai Bot Manager', 'Anti-Bot', 85), det('Cloudflare', 'Anti-Bot', 70), det('PerimeterX', 'Anti-Bot', 80, ['cookie', 'header']),
  det('Turnstile', 'CAPTCHA', 90, ['url']), det('hCaptcha', 'CAPTCHA', 60, ['url']),
  det('Canvas Fingerprint', 'Fingerprint', 30, ['js_hooks']), det('Audio Fingerprint', 'Fingerprint', 20, ['js_hooks']), det('Font Fingerprint', 'Fingerprint', 20, ['js_hooks']), det('Screen Fingerprint', 'Fingerprint', 15, ['js_hooks'])];
const MIX_AFTER = [det('Cloudflare', 'Anti-Bot', 95, ['cookie', 'header']), det('PerimeterX', 'Anti-Bot', 80), det('DataDome', 'Anti-Bot', 80), det('Kasada', 'Anti-Bot', 70, ['url']),
  det('Turnstile', 'CAPTCHA', 60, ['url']), det('reCAPTCHA', 'CAPTCHA', 50, ['url']),
  det('Canvas Fingerprint', 'Fingerprint', 30, ['js_hooks']), det('Audio Fingerprint', 'Fingerprint', 20, ['js_hooks']), det('Font Fingerprint', 'Fingerprint', 20, ['js_hooks']), det('Screen Fingerprint', 'Fingerprint', 15, ['js_hooks'])];

// Two scans that found exactly the same
const NEWS = 'https://news.example/front';
const SAME = [det('Cloudflare', 'Anti-Bot', 95, ['cookie', 'header']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Canvas Fingerprint', 'Fingerprint', 30, ['js_hooks']),
  det('Audio Fingerprint', 'Fingerprint', 20, ['js_hooks']), det('Font Fingerprint', 'Fingerprint', 20, ['js_hooks']), det('Screen Fingerprint', 'Fingerprint', 15, ['js_hooks'])];

// A very long page path, very long names (one with no spaces to break at, one in Arabic) and evidence of every kind
const LONG = 'https://app.example/workspace/organisation-settings/regional-offices/europe/western/very-deeply-nested/section/with-a-really-long-slug-that-keeps-going-and-going/reports/quarterly-protection-overview-for-every-single-region';
const LONG_NAME = 'A custom rule with a very long name that keeps going well past one line of the dialog (version 2)';
const NO_SPACES = 'Supercalifragilisticexpialidocious-ProtectionNameWithoutASingleSpaceToBreakAt-v1.2.3';
const ARABIC = 'حماية مخصصة لاختبار اتجاه النص';
const EVERY_KIND = ['cookie', 'header', 'url', 'content', 'dom', 'window', 'js_hooks', 'payload'];
const LONG_BEFORE = [det(LONG_NAME, 'Anti-Bot', 55, ['cookie']), det(NO_SPACES, 'CAPTCHA', 90, ['url']), det(ARABIC, 'Anti-Bot', 70, ['cookie']), det('Removed with a long name as well, to see it wrap', 'Fingerprint', 40, ['js_hooks']),
  det('Stays the same', 'Fingerprint', 20, ['js_hooks'])];
const LONG_AFTER = [det(LONG_NAME, 'Anti-Bot', 100, EVERY_KIND), det(NO_SPACES, 'CAPTCHA', 45, ['url']), det(ARABIC, 'Anti-Bot', 70, ['cookie', 'header']), det('Added with a long name as well, to see it wrap', 'Fingerprint', 40, ['js_hooks']),
  det('Stays the same', 'Fingerprint', 20, ['js_hooks'])];

const SEED = [
  entry('one-now', ONE_URL, 1 * HOUR, [...FINGERPRINTS, det('Crypto Fingerprint', 'Fingerprint', 15, ['js_hooks'])]),
  entry('one-before', `${ONE_URL}?resource_id=sc-domain%3Aexample.com&breakdown=query`, 22 * DAY, [...FINGERPRINTS, det('Crypto Fingerprint', 'Fingerprint', 10, ['js_hooks'])]),
  entry('mix-now', SHOP, 2 * HOUR, MIX_AFTER),
  entry('mix-before', SHOP, 30 * HOUR, MIX_BEFORE),
  entry('mix-oldest', `${SHOP}?ref=mail`, 9 * DAY, MIX_BEFORE.slice(0, 5)),
  entry('same-now', NEWS, 3 * HOUR, SAME),
  entry('same-before', NEWS, 50 * HOUR, SAME),
  entry('long-now', LONG, 4 * HOUR, LONG_AFTER),
  entry('long-before', `${LONG}?filter=${'status%3Dactive%26region%3Deurope%26'.repeat(3)}page%3D2#results-section`, 40 * HOUR, LONG_BEFORE)
];
// The scan to open the dialog from, and what to expect of it
const CASES = {
  one: { id: 'one-now', changed: 1, unchanged: 9, added: 0, removed: 0 },
  mix: { id: 'mix-now', changed: 3, unchanged: 4, added: 3, removed: 2 },
  same: { id: 'same-now', changed: 0, unchanged: 6, added: 0, removed: 0 },
  long: { id: 'long-now', changed: 3, unchanged: 1, added: 1, removed: 1 }
};

// ---- Colour maths (contrast of what the dialog draws) ----------------------------------------------
const parseColour = (text) => {
  const m = /rgba?\(([^)]+)\)/.exec(text || '');
  if (!m) throw new Error(`cannot read the colour "${text}"`);
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};
const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
const luminance = ({ r, g, b }) => { const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-compare-'));
  fs.mkdirSync(SHOTS, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 400, height: 580 },
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
  async function W(fn, arg) {
    const sw = await getWorker();
    return sw.evaluate(fn, arg);
  }
  async function until(check, ms = 15000, what = 'condition') {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(200);
    }
  }
  const setLanguage = (lang) => W((l) => chrome.storage.local.set({ scrapfly_language_override: l }), lang);
  const seed = (list) => W((items) => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items }) }), list);

  /** The popup as a page (the size of the real one) on its History tab, in the language set before. */
  async function historyPage() {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`popup: ${e.message}`));
    await page.setViewportSize({ width: 400, height: 580 });
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await page.bringToFront(); // a tab the browser counts as hidden gets no animation frames, and the dialog opens on one
    await page.waitForFunction(() => window.popupInstance && window.popupInstance.detectorManager && window.popupInstance.detectorManager.initialized, null, { polling: 250, timeout: 30000 });
    await page.evaluate(() => window.popupInstance.switchTab('history'));
    await page.waitForSelector('.history-item', { timeout: 20000 });
    await page.evaluate(() => {
      globalThis.__copied = [];
      FormatUtils.copyToClipboard = async (text) => { globalThis.__copied.push(text); return true; };
    });
    return page;
  }
  const setTheme = (page, value) => page.evaluate((v) => window.ScrapflyTheme.apply(v), value);
  /** Open the dialog from an entry (what the "…" menu's Compare with… does); the promise it returns ends when the dialog closes. */
  async function openCompare(page, id) {
    await page.evaluate((entryId) => {
      const history = window.popupInstance.history;
      window.__compare = history.compareHistoryItem(history.historyItems.find(item => item.id === entryId));
    }, id);
    await page.waitForSelector('.notification-confirm .history-compare', { timeout: 10000 });
    await page.waitForFunction(() => { const d = document.querySelector('.notification-confirm'); return d && d.getAttribute('data-show') === 'true'; }, null, { timeout: 5000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(350); // the dialog's entry animation
  }
  async function closeCompare(page) {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.notification-confirm'), null, { timeout: 5000 });
  }
  async function shot(page, name) {
    await page.mouse.move(2, 2); // the pointer is left where the menu was: over the list, whose hover text would be in the picture
    await sleep(150);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), clip: { x: 0, y: 0, width: 400, height: 580 } });
  }
  /** What the open dialog shows, as plain data. */
  const read = (page) => page.evaluate(() => {
    const q = (selector, root = document) => root.querySelector(selector);
    const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
    const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const dialog = q('.notification-confirm');
    const select = q('.history-compare select');
    const where = q('.history-compare-where');
    const range = q('.history-compare-range');
    const result = q('.history-compare-result');
    return {
      dialog: box(dialog), direction: getComputedStyle(dialog).direction,
      options: qa('option', select).map(o => o.textContent), selected: select.value, select: { ...box(select), scrollHeight: select.scrollHeight, clientHeight: select.clientHeight, tip: select.getAttribute('data-tip') || select.title, describedby: select.getAttribute('aria-describedby'), whiteSpace: getComputedStyle(select).whiteSpace, textOverflow: getComputedStyle(select).textOverflow },
      where: { hidden: where.hidden, shown: getComputedStyle(where).display !== 'none', text: where.textContent, title: where.getAttribute('data-tip'), id: where.id, ...box(where), scrollHeight: where.scrollHeight, clientHeight: where.clientHeight, font: getComputedStyle(where).fontFamily, clamp: getComputedStyle(where).webkitLineClamp, direction: getComputedStyle(where).direction },
      range: { text: range.textContent, title: range.getAttribute('data-tip'), role: range.getAttribute('role'), height: box(range).height },
      chips: qa('.history-compare-chip').map(c => ({ text: c.textContent, zero: c.classList.contains('is-zero'), opacity: getComputedStyle(c).opacity })),
      chipsLines: new Set(qa('.history-compare-chip').map(c => Math.round(c.getBoundingClientRect().top))).size,
      identical: (q('.history-compare-identical') || {}).textContent || '',
      groups: qa('.history-compare-group').map(g => {
        const toggle = q('.history-compare-toggle', g);
        const list = q('.history-compare-list', g);
        return {
          kind: [...g.classList].find(c => /^history-compare-(added|removed|changed|same)$/.test(c)).replace('history-compare-', ''),
          heading: q('.history-compare-heading', g).textContent, headingTag: q('.history-compare-heading', g).tagName,
          toggle: toggle ? { expanded: toggle.getAttribute('aria-expanded'), controls: toggle.getAttribute('aria-controls'), tag: toggle.tagName, type: toggle.getAttribute('type'), chevron: getComputedStyle(q('.history-compare-chevron', toggle)).transform } : null,
          list: { display: getComputedStyle(list).display, role: list.getAttribute('role'), id: list.id },
          rows: qa('.history-compare-row', g).map(r => {
            const name = q('.history-compare-name', r), icon = q('.category-icon', r), cat = q('.history-compare-cat', r), conf = q('.history-compare-conf', r);
            const to = q('.history-compare-to', r), from = q('.history-compare-from', r), delta = q('.history-compare-delta', r), notes = q('.history-compare-notes', r), arrow = q('.history-compare-arrow', r);
            return {
              name: name.textContent, nameBox: box(name), nameDir: name.firstElementChild && name.firstElementChild.getAttribute('dir'), category: cat.textContent,
              catBox: box(cat), iconBox: box(icon), iconHidden: icon.getAttribute('aria-hidden'), iconSvg: !!q('svg', icon), iconColour: icon.style.color, iconTitle: icon.title,
              conf: conf ? conf.textContent : null, confBox: conf ? box(conf) : null,
              from: from ? from.textContent : null, to: to ? to.textContent : null, toBox: to ? box(to) : null, arrow: arrow ? arrow.textContent : null, arrowTransform: arrow ? getComputedStyle(arrow).transform : null,
              delta: delta ? { text: delta.textContent, up: delta.classList.contains('is-up'), down: delta.classList.contains('is-down'), box: box(delta) } : null,
              notes: notes ? { text: notes.textContent, box: box(notes), nameBottom: box(name).bottom } : null,
              box: box(r), scrollWidth: r.scrollWidth, clientWidth: r.clientWidth, shown: r.offsetParent !== null
            };
          })
        };
      }),
      result: { scrollWidth: result.scrollWidth, clientWidth: result.clientWidth, scrollHeight: result.scrollHeight, clientHeight: result.clientHeight, ...box(result) },
      body: (() => { const b = q('.notification-confirm-body'); return { scrollHeight: b.scrollHeight, clientHeight: b.clientHeight, scrollWidth: b.scrollWidth, clientWidth: b.clientWidth }; })(),
      dialogScrollWidth: dialog.scrollWidth, dialogClientWidth: dialog.clientWidth,
      viewport: { width: innerWidth, height: innerHeight }
    };
  });
  /** The colours the dialog draws its text in, with what each sits on. */
  const coloursOf = (page) => page.evaluate(() => {
    const css = (el, prop) => getComputedStyle(el)[prop];
    const q = (selector, root = document) => root.querySelector(selector);
    const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
    const dialog = q('.notification-confirm');
    const list = q('.history-compare-list');
    const chip = q('.history-compare-chip:not(.is-zero)');
    const first = (selector) => q(selector);
    return {
      dialogBg: css(dialog, 'backgroundColor'), listBg: list ? css(list, 'backgroundColor') : null, chipBg: chip ? css(chip, 'backgroundColor') : null,
      headings: qa('.history-compare-group').map(g => ({ kind: g.className.replace(/.*history-compare-(added|removed|changed|same).*/, '$1'), color: css(q('.history-compare-heading', g), 'color') })),
      deltas: qa('.history-compare-delta').map(d => ({ text: d.textContent, color: css(d, 'color'), bg: css(d, 'backgroundColor') })),
      name: first('.history-compare-name') && css(first('.history-compare-name'), 'color'),
      conf: first('.history-compare-conf') && css(first('.history-compare-conf'), 'color'),
      notes: first('.history-compare-notes') && css(first('.history-compare-notes'), 'color'),
      where: first('.history-compare-where') && !first('.history-compare-where').hidden ? css(first('.history-compare-where'), 'color') : null,
      chipLabel: chip && css(chip, 'color'), chipCount: chip && css(q('.history-compare-chip-count', chip), 'color'),
      range: css(q('.history-compare-range'), 'color')
    };
  });
  /** Assert the dialog's text reads: 4.5:1 against what it sits on, in the theme the page is in. */
  async function assertContrast(page, label) {
    const c = await coloursOf(page);
    const dialogBg = parseColour(c.dialogBg);
    const listBg = c.listBg ? over(parseColour(c.listBg), dialogBg) : dialogBg;
    const chipBg = c.chipBg ? over(parseColour(c.chipBg), dialogBg) : dialogBg;
    const check = (what, fg, bg) => {
      const ratio = contrast(over(parseColour(fg), bg), bg);
      assert.ok(ratio >= 4.5, `${label}: ${what} is ${ratio.toFixed(2)}:1 (${fg} on rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})), under 4.5:1`);
    };
    for (const h of c.headings) check(`the ${h.kind} heading`, h.color, dialogBg);
    for (const d of c.deltas) check(`the difference ${d.text}`, d.color, over(parseColour(d.bg), listBg));
    if (c.name) check('a name', c.name, listBg);
    if (c.conf) check('a score', c.conf, listBg);
    if (c.notes) check('the evidence line', c.notes, listBg);
    if (c.where) check('the page path', c.where, dialogBg);
    if (c.chipLabel) { check('a count\'s label', c.chipLabel, chipBg); check('a count', c.chipCount, chipBg); }
    check('the range line', c.range, dialogBg);
  }
  /** Nothing of the dialog spills sideways or leaves the popup. */
  function assertFits(m, label) {
    assert.ok(m.dialogScrollWidth <= m.dialogClientWidth + 1, `${label}: the dialog scrolls sideways (${m.dialogScrollWidth} > ${m.dialogClientWidth})`);
    assert.ok(m.body.scrollWidth <= m.body.clientWidth + 1, `${label}: the dialog body scrolls sideways`);
    assert.ok(m.result.scrollWidth <= m.result.clientWidth + 1, `${label}: the results scroll sideways (${m.result.scrollWidth} > ${m.result.clientWidth})`);
    assert.ok(m.dialog.top >= 0 && m.dialog.bottom <= m.viewport.height && m.dialog.left >= 0 && m.dialog.right <= m.viewport.width, `${label}: the dialog leaves the popup: ${JSON.stringify(m.dialog)}`);
    assert.ok(m.body.scrollHeight <= m.body.clientHeight + 1, `${label}: the dialog body scrolls as well as the results (${m.body.scrollHeight} > ${m.body.clientHeight})`);
    for (const g of m.groups) {
      for (const r of g.rows.filter(row => row.shown)) {
        assert.ok(r.scrollWidth <= r.clientWidth + 1, `${label}: the row "${r.name}" spills sideways (${r.scrollWidth} > ${r.clientWidth})`);
        assert.ok(r.box.left >= m.result.left - 1 && r.box.right <= m.result.right + 1, `${label}: the row "${r.name}" leaves the results`);
      }
    }
  }
  /** The right edges (the left ones in a right-to-left language) of one kind of number are one line. */
  function assertColumn(rows, pick, label, rtl) {
    const placed = rows.filter(r => pick(r)).map(r => [r.name, rtl ? pick(r).left : pick(r).right]);
    if (placed.length < 2) return;
    const edges = placed.map(p => p[1]);
    assert.ok(Math.max(...edges) - Math.min(...edges) <= 1, `${label}: the scores are not in a column: ${placed.map(([name, edge]) => `${name.slice(0, 18)} ${edge.toFixed(1)}`).join(', ')}`);
  }

  // ---- Start-up -------------------------------------------------------------------------------------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  await setLanguage('en');
  await seed(SEED);

  // ===============================================================================================
  await scenario('The list is one short line, the page path sits under it only when the address differs, the range is one line', async () => {
    const page = await historyPage();
    // Through the real menu, as a person gets there
    await page.evaluate(() => document.querySelector('.history-item[data-history-id="one-now"] .history-more-btn').click());
    await page.waitForSelector('#historyItemMenu:not([hidden])');
    assert.equal(await page.$eval('#historyItemMenu [data-action="compare"]', el => el.disabled), false);
    await page.$eval('#historyItemMenu [data-action="compare"]', el => el.click());
    await page.waitForSelector('.notification-confirm .history-compare', { timeout: 10000 });
    await sleep(500);
    let m = await read(page);
    assert.equal(m.options.length, 1);
    assert.match(m.options[0], /^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M · 10 found$/, `the option: ${m.options[0]}`);
    assert.ok(!/\d:\d\d:\d\d/.test(m.options[0]), 'no seconds in the list');
    assert.ok(!m.options[0].includes('/'), 'no path in the list');
    assert.ok(m.select.height < 40, `the list is one line: ${m.select.height}px tall`);
    assert.ok(m.select.scrollHeight <= m.select.clientHeight + 1, 'its text does not wrap');
    assert.ok(m.chips.length === 4 && m.chipsLines === 1, `the four counts are one line: ${m.chipsLines}`);
    assert.equal(m.select.whiteSpace, 'nowrap');
    assert.equal(m.select.textOverflow, 'ellipsis');
    assert.equal(m.select.tip, '', 'the list, focused as the dialog opens, has no tip that would cover the dialog');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.ui-tip')].some(t => !t.hidden)), false, 'no tooltip shows as the dialog opens');
    // The other scan was of another address (its query): the page path, muted, mono, one line, the whole address on hover
    assert.equal(m.where.shown, true);
    assert.ok(m.where.text.startsWith('/u/1/search-console/performance/search-analytics?resource_id=sc-domain%3Aexample.com'), m.where.text);
    assert.ok(!m.where.text.includes('search.example'), 'origin-less');
    assert.equal(m.where.title, `${ONE_URL}?resource_id=sc-domain%3Aexample.com&breakdown=query`, 'the full address is the hover text');
    assert.match(m.where.font, /IBM Plex Mono|monospace/);
    assert.equal(m.where.clamp, '2', 'two lines at most, cut with an ellipsis');
    assert.ok(m.where.height <= 32, `two lines at most: ${m.where.height}px`);
    assert.equal(m.where.direction, 'ltr');
    assert.equal(m.select.describedby, m.where.id, 'a screen reader hears the path with the list');
    // The range: dates without seconds, one line, a live region
    assert.match(m.range.text, /^From [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M to [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M$/, m.range.text);
    assert.ok(m.range.height < 20, `the range is one line: ${m.range.height}px`);
    assert.equal(m.range.role, 'status');
    assert.match(m.range.title, /\d:\d\d:\d\d.*\d:\d\d:\d\d/, 'the seconds are the hover text');
    assert.deepEqual(m.chips.map(c => c.text), ['Added0', 'Removed0', 'Changed1', 'Unchanged9']);
    assertFits(m, 'one');
    await shot(page, 'menu-opened-en-dark-one');
    await closeCompare(page);
    await page.close();
  });

  // ===============================================================================================
  await scenario('Four counts at a glance; one changed row among nine unchanged ones that are folded; the dialog is short', async () => {
    const page = await historyPage();
    await openCompare(page, CASES.one.id);
    const m = await read(page);
    assert.deepEqual(m.chips.map(c => [c.text, c.zero]), [['Added0', true], ['Removed0', true], ['Changed1', false], ['Unchanged9', false]]);
    assert.ok(m.chips.filter(c => c.zero).every(c => Number(c.opacity) < 1) && m.chips.filter(c => !c.zero).every(c => Number(c.opacity) === 1), 'a zero count is dimmed');
    assert.deepEqual(m.groups.map(g => g.heading), ['Changed (1)', 'Unchanged (9)']);
    const [changed, unchanged] = m.groups;
    assert.equal(changed.headingTag, 'H4');
    assert.equal(changed.toggle, null, 'Changed has no button');
    assert.deepEqual(changed.rows.map(r => [r.name, r.from, r.arrow, r.to, r.delta && r.delta.text, r.delta && r.delta.up]), [['Crypto Fingerprint', '10%', '→', '15%', '+5', true]]);
    assert.equal(changed.rows[0].category, 'Fingerprint', 'the category name stays, for a screen reader');
    assert.equal(changed.rows[0].notes, null, 'no evidence changed: no second line');
    // Unchanged: a real button, folded, its nine rows kept (hidden) for the page
    assert.equal(unchanged.toggle.tag, 'BUTTON');
    assert.equal(unchanged.toggle.type, 'button');
    assert.equal(unchanged.toggle.expanded, 'false');
    assert.equal(unchanged.toggle.controls, unchanged.list.id);
    assert.equal(unchanged.list.display, 'none');
    assert.equal(unchanged.rows.length, 9);
    assert.ok(m.dialog.height < 400, `the dialog is short with Unchanged folded (it was about 490px with nine rows): ${Math.round(m.dialog.height)}px`);
    assertFits(m, 'one folded');
    await closeCompare(page);
    await page.close();
  });

  // ===============================================================================================
  await scenario('Unchanged opens with a click, Enter or Space; Enter does not copy and close the dialog; the keyboard goes select, button, Close, Copy', async () => {
    const page = await historyPage();
    await openCompare(page, CASES.one.id);
    const state = () => page.evaluate(() => {
      const toggle = document.querySelector('.history-compare-toggle');
      const list = document.getElementById(toggle.getAttribute('aria-controls'));
      return { expanded: toggle.getAttribute('aria-expanded'), shown: getComputedStyle(list).display !== 'none', open: !!document.querySelector('.notification-confirm'), copied: globalThis.__copied.length, focus: document.activeElement.className };
    });
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SELECT', 'the dialog opens on the list');
    await page.keyboard.press('Tab');
    assert.match((await state()).focus, /history-compare-toggle/, 'Tab from the list goes to the Unchanged button');
    await page.keyboard.press('Enter');
    let s = await state();
    assert.deepEqual([s.expanded, s.shown, s.open, s.copied], ['true', true, true, 0], 'Enter opens it, and the dialog stays');
    await page.keyboard.press('Space');
    s = await state();
    assert.deepEqual([s.expanded, s.shown, s.open, s.copied], ['false', false, true, 0], 'Space folds it again');
    await page.keyboard.press('Enter');
    assert.equal((await state()).expanded, 'true');
    assert.equal(await page.evaluate(() => globalThis.__copied.length), 0, 'nothing was copied');
    await page.keyboard.press('Enter');
    assert.equal((await state()).expanded, 'false');
    await page.$eval('.history-compare-toggle', el => el.click());
    assert.equal((await state()).expanded, 'true', 'a click opens it');
    // Focus order
    await page.focus('.history-compare select');
    const order = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => { const a = document.activeElement; return a.tagName === 'SELECT' ? 'select' : (a.className.match(/history-compare-toggle|notification-btn-cancel|notification-btn-confirm|notification-confirm-close/) || [a.className])[0]; }));
    }
    assert.deepEqual(order, ['history-compare-toggle', 'notification-btn-cancel', 'notification-btn-confirm', 'notification-confirm-close', 'select'], 'the dialog keeps focus inside, in reading order');
    // Enter on the Copy button still copies and closes
    await page.focus('.notification-btn-confirm');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.notification-confirm'), null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => globalThis.__copied.length), 1, 'Enter on "Copy as Markdown" copies');
    await page.close();
  });

  // ===============================================================================================
  await scenario('Copy as Markdown copies the report as before, Close and Escape copy nothing', async () => {
    const page = await historyPage();
    await openCompare(page, CASES.one.id);
    await page.$eval('.notification-btn-cancel', el => el.click());
    await page.waitForFunction(() => !document.querySelector('.notification-confirm'), null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => globalThis.__copied.length), 0, 'Close');
    await openCompare(page, CASES.one.id);
    await closeCompare(page);
    assert.equal(await page.evaluate(() => globalThis.__copied.length), 0, 'Escape');
    assert.equal(await page.evaluate(() => window.__compare), true, 'the dialog reported that it opened');
    await openCompare(page, CASES.one.id);
    await page.$eval('.notification-btn-confirm', el => el.click());
    await page.waitForFunction(() => globalThis.__copied.length === 1, null, { timeout: 5000 });
    const md = await page.evaluate(() => globalThis.__copied[0]);
    assert.ok(md.startsWith(`## Compare scans: search.example\n\n${ONE_URL}\n\nFrom `), md.slice(0, 160));
    assert.match(md, /From .*\d:\d\d:\d\d.* to .*\d:\d\d:\d\d/, 'the report keeps the seconds');
    assert.ok(md.includes('### Changed\n- Crypto Fingerprint (Fingerprint): 10% → 15% (+5)\n'), md);
    assert.ok(md.includes('### Unchanged\n- Canvas Fingerprint (Fingerprint, 10%)\n'), md);
    assert.ok(!md.includes('?resource_id'), 'no query in the report');
    // The report is what HistoryCompare writes for the same two scans
    const expected = await page.evaluate(() => {
      const history = window.popupInstance.history;
      const a = history.historyItems.find(i => i.id === 'one-now'), b = history.historyItems.find(i => i.id === 'one-before');
      return HistoryCompare.toMarkdown(HistoryCompare.compare(a, b), {
        host: a.hostname, address: a.url, t: (k, f, ...args) => FormatUtils.t(k, f, ...args), methodLabel: (type) => history.getMethodLabel(String(type).toLowerCase()),
        categoryLabel: (key) => FormatUtils.categoryLabel(key), dateText: (ms) => FormatUtils.formatDateTime(ms)
      });
    });
    assert.equal(md, expected, 'byte for byte');
    await page.close();
  });

  // ===============================================================================================
  await scenario('Several added, removed and changed: rows with the icon, the name and the score; the move and its difference; the evidence under the name; the scores line up', async () => {
    const page = await historyPage();
    await openCompare(page, CASES.mix.id);
    let m = await read(page);
    assert.deepEqual(m.chips.map(c => c.text), ['Added3', 'Removed2', 'Changed3', 'Unchanged4']);
    assert.deepEqual(m.groups.map(g => g.heading), ['Added (3)', 'Removed (2)', 'Changed (3)', 'Unchanged (4)']);
    const [added, removed, changed, unchanged] = m.groups;
    assert.equal(unchanged.toggle.expanded, 'false', 'four unchanged protections fold');
    assert.deepEqual(added.rows.map(r => [r.name, r.category, r.conf]), [['DataDome', 'Anti-bot', '80%'], ['Kasada', 'Anti-bot', '70%'], ['reCAPTCHA', 'Captcha', '50%']]);
    assert.deepEqual(removed.rows.map(r => [r.name, r.conf]), [['Akamai Bot Manager', '85%'], ['hCaptcha', '60%']]);
    const row = (name) => changed.rows.find(r => r.name === name);
    assert.deepEqual([row('Cloudflare').from, row('Cloudflare').to, row('Cloudflare').delta.text, row('Cloudflare').delta.up], ['70%', '95%', '+25', true]);
    assert.equal(row('Cloudflare').notes.text, 'New evidence: Headers');
    assert.deepEqual([row('Turnstile').from, row('Turnstile').to, row('Turnstile').delta.text, row('Turnstile').delta.down], ['90%', '60%', '\u221230', true]);
    assert.equal(row('Turnstile').notes, null);
    assert.equal(row('PerimeterX').conf, '80%', 'the score did not move: it shows as it is');
    assert.equal(row('PerimeterX').delta, null);
    assert.equal(row('PerimeterX').notes.text, 'Evidence gone: Headers');
    for (const g of [added, removed, changed]) {
      for (const r of g.rows) {
        assert.equal(r.iconHidden, 'true', `${r.name}: the icon is decoration`);
        assert.ok(r.iconSvg, `${r.name}: an icon`);
        assert.ok(r.iconColour, `${r.name}: in its category's colour`);
        assert.equal(r.nameDir, 'auto', `${r.name}: its own direction`);
        assert.ok(r.catBox.width <= 2 && r.catBox.height <= 2, `${r.name}: the category's name is there for a screen reader, not drawn`);
        assert.ok(r.iconBox.width > 0 && r.nameBox.left > r.iconBox.right - 1, `${r.name}: icon, then name`);
        if (r.notes) assert.ok(r.notes.box.top >= r.nameBox.bottom - 1 && r.notes.box.left >= r.nameBox.left - 1, `${r.name}: the evidence is under the name`);
      }
    }
    // Numbers: tabular, flush with the row's end, one column per kind of number
    assertColumn(added.rows, r => r.confBox, 'Added');
    assertColumn(removed.rows, r => r.confBox, 'Removed');
    assertColumn(changed.rows, r => r.toBox || r.confBox, 'Changed (the later scores)');
    assertColumn(changed.rows.filter(r => r.delta), r => r.delta.box, 'Changed (the differences)');
    assertFits(m, 'mix folded');
    await assertContrast(page, 'mix dark');
    await shot(page, 'en-dark-mix');
    // Open Unchanged: its four rows appear, the dialog still fits
    await page.$eval('.history-compare-toggle', el => el.click());
    m = await read(page);
    assert.equal(m.groups[3].toggle.expanded, 'true');
    assert.ok(m.groups[3].rows.every(r => r.shown));
    assertColumn(m.groups[3].rows, r => r.confBox, 'Unchanged');
    assertFits(m, 'mix open');
    await shot(page, 'en-dark-mix-unchanged-open');
    // The next scan picked keeps what the person chose
    await page.selectOption('.history-compare select', 'mix-oldest');
    await sleep(200);
    m = await read(page);
    assert.match(m.range.text, /^From /);
    assert.equal(m.options.length, 2);
    assert.equal(m.where.shown, true, 'the oldest scan is of another address (?ref=mail)');
    assert.equal(m.where.text, '/cart?ref=mail');
    await closeCompare(page);
    await page.close();
  });

  // ===============================================================================================
  await scenario('Two identical scans say so and keep Unchanged open; no path line when the address is the same', async () => {
    const page = await historyPage();
    await openCompare(page, CASES.same.id);
    const m = await read(page);
    assert.equal(m.identical, 'These two scans found the same protections, with the same confidence and evidence.');
    assert.deepEqual(m.chips.map(c => c.text), ['Added0', 'Removed0', 'Changed0', 'Unchanged6']);
    assert.equal(m.groups.length, 1);
    assert.equal(m.groups[0].toggle.expanded, 'true');
    assert.ok(m.groups[0].rows.every(r => r.shown));
    assert.equal(m.where.shown, false, 'the same address: nothing under the list');
    assert.equal(m.select.describedby, null);
    assertFits(m, 'same');
    await closeCompare(page);
    await page.close();
  });

  // ===============================================================================================
  await scenario('A very long page path and very long names wrap or are cut with an ellipsis; nothing spills sideways', async () => {
    const page = await historyPage();
    await openCompare(page, CASES.long.id);
    const m = await read(page);
    assert.equal(m.where.shown, true);
    assert.ok(m.where.scrollHeight > m.where.clientHeight, 'the path is longer than its two lines: cut with an ellipsis');
    assert.ok(m.where.height <= 32, `two lines at most: ${m.where.height}px`);
    assert.ok(m.where.title.startsWith(`${LONG}?filter=`) && m.where.title.endsWith('#results-section'), 'the whole address is the hover text');
    assert.ok(m.where.text.endsWith('#results-section'), 'the path keeps its query and fragment');
    const names = m.groups.flatMap(g => g.rows.map(r => r.name));
    assert.ok(names.includes(LONG_NAME) && names.includes(NO_SPACES) && names.includes(ARABIC), names.join(' | '));
    const changed = m.groups.find(g => g.kind === 'changed');
    const longRow = changed.rows.find(r => r.name === LONG_NAME);
    assert.equal(longRow.delta.text, '+45');
    assert.ok(longRow.notes.text.startsWith('New evidence: '), longRow.notes.text);
    assert.equal(longRow.notes.text.split(',').length, 7, `every kind of evidence is named: ${longRow.notes.text}`);
    assert.ok(longRow.box.height > 40, 'a long name and evidence wrap onto lines');
    assert.equal(changed.rows.find(r => r.name === ARABIC).nameDir, 'auto');
    assertFits(m, 'long');
    await assertContrast(page, 'long dark');
    await shot(page, 'en-dark-long');
    await page.$eval('.history-compare-toggle', el => el.click());
    assertFits(await read(page), 'long open');
    await closeCompare(page);
    await page.close();
  });

  // ===============================================================================================
  await scenario('The light theme reads: contrast of every text, every case', async () => {
    const page = await historyPage();
    await setTheme(page, 'light');
    for (const [name, c] of Object.entries(CASES)) {
      await openCompare(page, c.id);
      assertFits(await read(page), `${name} light`);
      await assertContrast(page, `${name} light`);
      await shot(page, `en-light-${name}`);
      if (name === 'one' || name === 'mix') {
        await page.$eval('.history-compare-toggle', el => el.click());
        await sleep(100);
        assertFits(await read(page), `${name} light open`);
        await assertContrast(page, `${name} light open`);
        await shot(page, `en-light-${name}-unchanged-open`);
      }
      await closeCompare(page);
    }
    await setTheme(page, 'dark');
    for (const [name, c] of [['one', CASES.one], ['same', CASES.same]]) {
      await openCompare(page, c.id);
      await assertContrast(page, `${name} dark`);
      await shot(page, `en-dark-${name}`);
      if (name === 'one') {
        await page.$eval('.history-compare-toggle', el => el.click());
        await sleep(100);
        await shot(page, 'en-dark-one-unchanged-open');
      }
      await closeCompare(page);
    }
    await page.close();
  });

  // ===============================================================================================
  await scenario('Arabic (right to left): the rows mirror, nothing spills, the text reads in both themes', async () => {
    await setLanguage('ar');
    try {
      const page = await historyPage();
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute('dir')), 'rtl');
      for (const theme of ['dark', 'light']) {
        await setTheme(page, theme);
        for (const [name, c] of Object.entries(CASES)) {
          await openCompare(page, c.id);
          let m = await read(page);
          const label = `ar ${theme} ${name}`;
          await shot(page, `ar-${theme}-${name}`);
          assert.equal(m.direction, 'rtl', label);
          assert.equal(m.chips.length, 4, label);
          assert.ok(m.select.height < 40, `${label}: the list is one line: ${m.select.height}px`);
          assert.ok(m.range.height < 24, `${label}: the range is one line: ${m.range.height}px`);
          if (m.where.shown) assert.equal(m.where.direction, 'ltr', `${label}: an address reads left to right`);
          const counts = m.groups.reduce((n, g) => n + g.rows.length, 0);
          assert.equal(counts, c.changed + c.unchanged + c.added + c.removed, label);
          for (const g of m.groups) {
            if (g.toggle) assert.ok(g.toggle.chevron.startsWith('matrix(-1') || g.toggle.expanded === 'true', `${label}: the chevron points along the reading direction while folded (${g.toggle.chevron})`);
            for (const r of g.rows.filter(row => row.shown)) {
              assert.ok(r.iconBox.left >= r.nameBox.right - 1, `${label}: "${r.name}": the icon is on the right of the name`);
              const scoreBox = r.toBox || r.confBox;
              if (scoreBox) assert.ok(scoreBox.right <= r.nameBox.left + 1, `${label}: "${r.name}": the score is on the left of the name`);
              if (r.arrow) assert.ok(r.arrowTransform.startsWith('matrix(-1'), `${label}: the arrow points along the reading direction`);
            }
            assertColumn(g.rows.filter(row => row.shown), r => r.toBox || r.confBox, `${label} ${g.kind}`, true);
          }
          assertFits(m, label);
          await assertContrast(page, label);
          if (name === 'one' || name === 'mix') {
            await page.$eval('.history-compare-toggle', el => el.click());
            await sleep(100);
            m = await read(page);
            assertFits(m, `${label} open`);
            assert.ok(m.groups.at(-1).toggle.chevron.startsWith('matrix(6.12') || /matrix\(0,\s?1,\s?-1,\s?0/.test(m.groups.at(-1).toggle.chevron), `${label}: open points down (${m.groups.at(-1).toggle.chevron})`);
            await shot(page, `ar-${theme}-${name}-unchanged-open`);
          }
          await closeCompare(page);
        }
      }
      await page.close();
    } finally {
      await setLanguage('en');
    }
  });

  // ---- Report ----------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${pageErrors.join('\n  ')}`);
  console.log(`Screenshots: ${SHOTS}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  console.log(failed.length || pageErrors.length ? 'RESULT FAILED' : `RESULT ALL PASS (${results.length} scenarios)`);
  await ctx.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* the browser may still hold it */ }
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
