#!/usr/bin/env node
/**
 * Every checkbox, radio button and dropdown the person can see, in the real extension (unpacked in Chromium): none of them is
 * the browser's own default look (a white square or round button on a dark card, a dropdown with no arrow), and every form control
 * has a name a screen reader can say (a switch that reads "checkbox, not checked" is a control nobody can use).
 *
 * It opens each tab, each Settings page (every card unfolded), History's Select mode and its dialogs (export, compare), the Settings
 * dialogs (reset, restore a backup), the Scrapfly dialog, the Statistics page and Bulk scan, and in each reads the computed style of
 * every control on screen:
 *
 *   Checkbox, radio   `appearance` is none: drawn by the interface (.ui-checkbox, .ui-radio, the switches, the badges)
 *   Dropdown          it draws an arrow (a background image), or is a customizable select with a button of its own
 *   Shared look       the Select-mode checkbox, the restore dialog's radio and the History dialog's dropdown carry .ui-checkbox,
 *                     .ui-radio and .ui-select, and a ticked box is filled with the accent colour
 *   Name              every visible control has one: aria-labelledby, aria-label, a label with text, a title or a placeholder
 *   Coverage          each area really held the controls it should (a broken way in must not scan nothing and pass)
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium (npm run e2e:setup).
 *   npm run e2e:controls
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

const args = process.argv.slice(2);
const REPO = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// What is on screen: one record per control, read in the page
const SCAN = () => [...document.querySelectorAll('input:not([type="hidden"]):not([type="file"]),select,textarea')].map((el) => {
  const text = (node) => (node && node.textContent ? node.textContent : '').replace(/\s+/g, ' ').trim();
  // The accessible name, in the order the browser looks: aria-labelledby, aria-label, a label, then title and placeholder
  const name = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => text(document.getElementById(id))).join(' ').trim()
    || (el.getAttribute('aria-label') || '').trim() || [...(el.labels || [])].map(text).join(' ').trim()
    || (el.getAttribute('title') || el.getAttribute('placeholder') || '').trim();
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const visible = r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  // A switch's input is invisible (zero size or no opacity) and its label draws it: it is on screen when what holds it is
  const host = el.closest('label') || el.parentElement;
  const hostBox = host ? host.getBoundingClientRect() : { width: 0, height: 0 };
  const hostStyle = host ? getComputedStyle(host) : null;
  const shown = visible || (!!host && s.display !== 'none' && hostBox.width > 2 && hostBox.height > 2 && hostStyle.visibility !== 'hidden' && hostStyle.display !== 'none');
  return {
    kind: el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.type, id: el.id || '', name, cls: typeof el.className === 'string' ? el.className : '',
    appearance: s.appearance, width: Math.round(r.width), visible, shown, arrow: s.backgroundImage !== 'none', ownButton: el.tagName === 'SELECT' && !!el.querySelector(':scope > button'),
    multiple: el.tagName === 'SELECT' && el.multiple, checked: !!el.checked, background: s.backgroundColor
  };
});

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'antibot-controls-'));
  let context;
  const checks = [];
  const check = (name, fn) => { try { fn(); checks.push([name, null]); console.log(`PASS ${name}`); } catch (error) { checks.push([name, error]); console.error(`FAIL ${name}\n     ${String(error.message).split('\n').join('\n     ')}`); } };
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
      args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    // A fixed poll, not the default animation frame: a tab the browser counts as hidden gets no frames
    const ready = (p) => p.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized, null, { polling: 250 });
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await ready(page);

    const detection = (name, category, confidence) => ({ detector: { name, id: `detect-${name}`, icon: 'custom.png' }, category, confidence });
    const entry = { id: 'controls-1', url: 'https://shop.example.com/', hostname: 'shop.example.com', title: 'Shop', timestamp: Date.now(), detections: [detection('Cloudflare', 'antibot', 95)], detectionCount: 1, categories: ['antibot'] };
    const older = { ...entry, id: 'controls-2', timestamp: Date.now() - 86400000, detections: [detection('Cloudflare', 'antibot', 95), detection('reCAPTCHA', 'captcha', 80)], detectionCount: 2, categories: ['antibot', 'captcha'] };
    await page.evaluate((items) => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items, lastUpdated: Date.now() }), scrapfly_language_override: 'en' }), [entry, older]);
    await page.reload();
    await ready(page);

    // area -> the visible controls found there
    const areas = new Map();
    const shownAreas = new Map(); // the same, with the invisible inputs of switches whose label is on screen (for the names)
    const scan = async (area, p = page) => {
      const found = await p.evaluate(SCAN);
      areas.set(area, found.filter(control => control.visible));
      shownAreas.set(area, found.filter(control => control.shown));
    };
    const closeDialogs = async () => { await page.keyboard.press('Escape'); await sleep(300); await page.keyboard.press('Escape'); await sleep(300); };

    for (const tab of ['detection', 'history', 'rules', 'advanced']) {
      await page.click(`.tab-btn[data-tab="${tab}"]`);
      await sleep(900);
      await scan(`tab:${tab}`);
    }
    await page.click('.tab-btn[data-tab="history"]');
    await page.waitForSelector('.history-item');
    await page.evaluate(() => window.popupInstance.history.enterSelectMode());
    await page.waitForSelector('.history-select-input');
    await page.click('.history-item', { position: { x: 100, y: 30 } }); // one selected: a ticked box is on screen
    await sleep(300);
    await scan('history:select-mode');
    await page.evaluate(() => window.popupInstance.history.exitSelectMode());

    const dialog = async (area, open, waitFor, argument) => {
      page.evaluate(open, argument).catch(() => {}); // the dialog's promise ends when it closes
      await page.waitForSelector(waitFor, { timeout: 10000 }).catch(() => {});
      await sleep(500);
      await scan(area);
      await closeDialogs();
    };
    await dialog('history:export-dialog', () => window.popupInstance.history.exportHistory(), '.history-dialog-check');
    await dialog('history:compare-dialog', (item) => window.popupInstance.history.compareHistoryItem(item), '.history-dialog-input', entry);

    await page.evaluate(() => window.popupInstance.settings.showSettings());
    await sleep(600);
    const pages = await page.$$eval('.settings-tab-btn', els => els.map(el => el.dataset.settingsTab));
    for (const name of pages) {
      await page.evaluate((tab) => document.querySelector(`.settings-tab-btn[data-settings-tab="${tab}"]`)?.click(), name);
      await sleep(500);
      await page.evaluate(() => document.querySelectorAll('.settings-card.is-collapsed').forEach(card => card.classList.remove('is-collapsed')));
      await sleep(250);
      await scan(`settings:${name}`);
    }
    await dialog('settings:reset-dialog', () => SettingsUI.resetSettingsToDefaults.call(window.popupInstance.settings), '.notification-confirm-message');
    await dialog('settings:restore-dialog', () => SettingsUI.chooseRestore.call(window.popupInstance.settings, {
      bundle: { extensionVersion: '3.1.0', createdAt: new Date().toISOString() }, summary: { settings: true, rules: 3, history: 5 }
    }), 'input[name="restoreMode"]');
    await page.evaluate(() => window.popupInstance.settings.hideSettings());
    await sleep(300);
    await dialog('scrapfly-dialog', () => ScrapflyExport.open({ url: 'https://a.example/', detections: [] }), '.scrapfly-export-chk, .scrapfly-export-switch');

    for (const [area, file] of [['page:statistics', 'sections/stats/stats.html'], ['page:bulk', 'sections/bulk/bulk.html']]) {
      const other = await context.newPage();
      other.on('pageerror', e => errors.push(e.message));
      await other.goto(`chrome-extension://${extensionId}/${file}`);
      await sleep(1500);
      await scan(area, other);
      await other.close();
    }
    const accent = await page.evaluate(() => { const probe = document.createElement('span'); probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); document.body.append(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; });

    // --- The checks
    const all = [...areas.entries()].flatMap(([area, list]) => list.map(control => ({ area, ...control })));
    const describe = (control) => `${control.kind}${control.id ? `#${control.id}` : ''}${control.cls ? `.${control.cls.split(' ').join('.')}` : ''} in ${control.area}`;
    const count = (area, kind) => (areas.get(area) || []).filter(control => control.kind === kind).length;

    check('every checkbox and radio on screen is drawn by the interface, none is the browser\'s own', () => {
      const native = all.filter(control => (control.kind === 'checkbox' || control.kind === 'radio') && control.appearance !== 'none');
      assert.deepEqual(native.map(describe), []);
    });
    check('every dropdown on screen draws an arrow', () => {
      const bare = all.filter(control => control.kind === 'select' && !control.multiple && !control.arrow && !control.ownButton);
      assert.deepEqual(bare.map(describe), []);
    });
    check('the shared looks are in use: .ui-checkbox, .ui-radio, .ui-select', () => {
      const classes = (area, kind) => (areas.get(area) || []).filter(control => control.kind === kind).map(control => control.cls);
      assert.ok(classes('history:select-mode', 'checkbox').length >= 2 && classes('history:select-mode', 'checkbox').every(cls => /\bui-checkbox\b/.test(cls)), 'Select mode: ' + classes('history:select-mode', 'checkbox'));
      assert.ok(classes('history:export-dialog', 'checkbox').every(cls => /\bui-checkbox\b/.test(cls)), 'export dialog checkboxes');
      assert.ok(classes('settings:reset-dialog', 'checkbox').every(cls => /\bui-checkbox\b/.test(cls)), 'reset dialog checkbox');
      assert.ok(classes('settings:restore-dialog', 'radio').every(cls => /\bui-radio\b/.test(cls)), 'restore dialog radios');
      assert.ok(classes('history:export-dialog', 'select').every(cls => /\bui-select\b/.test(cls)), 'export dialog dropdowns');
      assert.ok(classes('history:compare-dialog', 'select').every(cls => /\bui-select\b/.test(cls)), 'compare dialog dropdown');
    });
    check('a ticked box is filled with the accent colour, an empty one is not', () => {
      const boxes = (areas.get('history:select-mode') || []).filter(control => control.kind === 'checkbox');
      assert.ok(boxes.some(control => control.checked && control.background === accent), `no ticked box in ${accent}: ${JSON.stringify(boxes.map(b => [b.checked, b.background]))}`);
      assert.ok(boxes.some(control => !control.checked && control.background !== accent), 'an empty box must not look ticked');
      assert.ok(boxes.every(control => control.width === 18), `${boxes.map(b => b.width)}`);
    });
    check('every control on screen has a name a screen reader can say', () => {
      const everything = [...shownAreas.entries()].flatMap(([area, list]) => list.map(control => ({ area, ...control })));
      assert.deepEqual(everything.filter(control => !control.name).map(describe), []);
      assert.ok(everything.length >= 120, `controls seen: ${everything.length}`);
      assert.ok(everything.filter(control => control.kind === 'checkbox' && !control.visible).length >= 20, 'the switches (invisible inputs) were seen too');
    });
    check('each area held the controls it should (a scan of nothing would pass the checks above)', () => {
      assert.ok(pages.length >= 4, `Settings pages: ${pages}`);
      assert.ok(count('history:select-mode', 'checkbox') >= 2, 'Select mode checkboxes');
      assert.ok(count('history:export-dialog', 'checkbox') >= 2 && count('history:export-dialog', 'select') >= 3, 'export dialog');
      assert.ok(count('history:compare-dialog', 'select') >= 1, 'compare dialog');
      assert.ok(count('settings:reset-dialog', 'checkbox') >= 1, 'reset dialog');
      assert.ok(count('settings:restore-dialog', 'radio') >= 2 && count('settings:restore-dialog', 'checkbox') >= 3, 'restore dialog');
      assert.ok(all.filter(control => control.kind === 'select').length >= 10, 'dropdowns seen');
    });
    check('no page error while opening them', () => assert.deepEqual(errors, []));

    const custom = {};
    for (const control of all.filter(c => (c.kind === 'checkbox' || c.kind === 'radio') && c.appearance === 'none')) {
      const key = `${control.kind} ${control.cls.split(' ')[0] || '(no class)'}`;
      custom[key] = (custom[key] || 0) + 1;
    }
    console.log(`\n${all.length} controls on screen in ${areas.size} areas; drawn checkboxes and radios by class: ${JSON.stringify(custom)}`);
  } finally {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  const failed = checks.filter(([, error]) => error).length;
  console.log(failed ? `RESULT ${failed} of ${checks.length} FAILED` : `RESULT ALL PASS (${checks.length} checks)`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
