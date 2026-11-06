#!/usr/bin/env node
/**
 * The Rules and Advanced tabs for a keyboard and a screen reader, end to end in the real extension (unpacked in Chromium):
 *
 *   Update badge    Rules → Update badge and the notice for rules that need a newer extension follow Settings → Data → Clear (pending
 *                   rule updates) and Settings → Check now, with the popup left open; nothing watches while another tab is shown
 *   Rules focus     Delete and Reset to official, pressed from the keyboard: the list stays on its page and the focus goes to the card
 *                   that took the place (the one before it at the end of the list, Clear filters when the filters emptied it)
 *   Rules status    a status region that is always in the page says what the search, the chips and the pager leave, once per change
 *   Capture rows    Advanced → History rows are labelled groups of three real buttons (open, Copy, Delete) and are still one click target;
 *                   a capture deleted from the keyboard hands the focus to the next row; a chip pressed from the keyboard keeps it
 *   Help dialog     the "?" dialog is a modal dialog with a name: the focus moves in, Tab stays in, Escape closes it and the focus
 *                   goes back to the "?" button
 *   Looks           the rows and the dialog in the dark and the light theme and in Arabic (right to left): the row is laid out as before
 *   Editor          the Add pattern button still adds a row, and the editor has no "add section" button (removed dead code)
 *
 * No web page is needed: the Rules tab lists the shipped rules, the saved captures are seeded, and the popup is a tab of its own.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup
 *   node scripts/e2e-v314-rules-advanced-ui.js [<checkout>] [--only=<text>]       V314_SHOTS=<folder> also saves screenshots
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
const SHOTS = process.env.V314_SHOTS || '';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const PENDING = 'scrapfly_pending_updates';
const INCOMPATIBLE = 'scrapfly_incompatible_updates';

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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-rules-advanced-ui-'));
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
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
  async function until(check, ms = 20000, what = 'condition') {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(200);
    }
  }
  /** The popup, as a page of its own (no web page behind it: the Rules and Advanced tabs need none). */
  async function popupFor(file = 'popup.html') {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${file}: ${e.message}`));
    await page.goto(`chrome-extension://${extId}/${file}`);
    await page.waitForFunction(() => window.popupInstance && window.popupInstance.detectorManager && window.popupInstance.detectorManager.initialized, null, { polling: 250, timeout: 30000 });
    return page;
  }
  const setTheme = (page, value) => page.evaluate((v) => window.ScrapflyTheme.apply(v), value);
  async function shot(page, name, clip = { x: 0, y: 0, width: 420, height: 650 }) {
    if (!SHOTS) return;
    await sleep(400);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), clip });
  }
  /** What has the keyboard focus: its element, and the card or row it belongs to. */
  const focused = (page) => page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { body: true };
    return {
      tag: el.tagName, id: el.id || '', classes: String(el.className || ''), action: el.dataset.action || '',
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 80),
      card: (el.closest('.detector-card') || {}).dataset ? el.closest('.detector-card').dataset.detectorId : null,
      row: el.closest('.cap-row') ? el.closest('.cap-row').dataset.captureId : null,
      chip: el.dataset.filterValue ? `${el.dataset.filterGroup}:${el.dataset.filterValue}` : null
    };
  });
  const toasts = (page) => page.$$eval('.notification-toast .notification-message', els => els.map(el => el.textContent.trim()));

  // ---- Start-up: English, no auto-update (it would ask GitHub) ----------------------------------------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  await W(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });

  // ---- Rules helpers ---------------------------------------------------------------------------------
  async function openRules(popup) {
    await popup.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await popup.waitForFunction(() => {
      const r = window.popupInstance.rules;
      return r && r.initialized && r.allDetectors.length > 20 && document.querySelectorAll('#rulesList .detector-card').length > 0;
    }, null, { polling: 250, timeout: 30000 });
  }
  const ruleIds = (page) => page.$$eval('#rulesList .detector-card', cards => cards.map(card => card.dataset.detectorId));
  const pagerText = (page) => page.$eval('#rulesPagination .pagination-info', el => el.textContent.replace(/\s+/g, ' ').trim());
  const pagerFrom = async (page) => Number((await pagerText(page)).match(/(\d+)-\d+ of \d+/)[1]);
  const pagerTotal = async (page) => Number((await pagerText(page)).match(/of (\d+)/)[1]);
  const nextPage = async (page, times = 1) => {
    for (let i = 0; i < times; i++) {
      const from = await pagerFrom(page);
      await page.$eval('#rulesPagination .pagination-btn-next', el => el.click());
      await until(async () => (await pagerFrom(page)) > from, 5000, 'the next page');
    }
  };
  /** The keyboard path to a card's menu item: the "More actions" button, Enter, arrows to the item, Enter. */
  async function pressMenuItem(page, cardSelector, itemClass) {
    await page.focus(`${cardSelector} .rules-menu-trigger`);
    await page.keyboard.press('Enter');
    await until(() => page.evaluate(() => !!document.querySelector('#rulesList .rules-menu.open')), 5000, 'the menu');
    for (let i = 0; i < 6; i++) {
      if (await page.evaluate((cls) => document.activeElement.classList.contains(cls), itemClass)) break;
      await page.keyboard.press('ArrowDown');
    }
    assert.equal(await page.evaluate((cls) => document.activeElement.classList.contains(cls), itemClass), true, `the keyboard reached ${itemClass}`);
    await page.keyboard.press('Enter');
  }
  /** Answer the confirmation dialog from the keyboard: Tab to the confirm button, Enter. */
  async function confirmWithKeyboard(page) {
    await page.waitForSelector('.notification-confirm[data-open="true"] .notification-btn-confirm', { timeout: 8000 });
    await page.focus('.notification-confirm[data-open="true"] .notification-btn-confirm');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.notification-confirm[data-open="true"]'), null, { polling: 100, timeout: 8000 });
  }

  // ===============================================================================================
  await scenario('Update badge: Settings → Data → Clear and Settings → Check now redraw the Rules badge and notice with the popup left open', async () => {
    await W(({ PENDING, INCOMPATIBLE }) => chrome.storage.local.set({
      [PENDING]: [{ id: 'detect-e2e-a', source: 'bundled', version: '9.9.9', name: 'E2E A' }, { id: 'detect-e2e-b', source: 'bundled', version: '9.9.9', name: 'E2E B' }],
      [INCOMPATIBLE]: [{ id: 'detect-e2e-future', name: 'E2E Future', remoteVersion: '9.9.9', minExtensionVersion: '99.0' }]
    }), { PENDING, INCOMPATIBLE });
    const popup = await popupFor();
    await popup.evaluate(() => { window.__sameDocument = 'yes'; });
    await openRules(popup);
    const shown = () => popup.evaluate(() => {
      const badge = document.querySelector('#updatesBadge');
      const notice = document.querySelector('#rulesExtensionNotice');
      return {
        badge: getComputedStyle(badge).display === 'none' ? '' : badge.textContent.trim(),
        lit: document.querySelector('#checkUpdatesBtn').classList.contains('has-updates'),
        notice: notice.hidden ? '' : notice.querySelector('.rules-ext-notice-text').textContent.trim()
      };
    });
    await until(async () => (await shown()).badge === '2', 8000, 'the badge to show 2');
    let now = await shown();
    assert.equal(now.lit, true);
    assert.match(now.notice, /E2E Future/);
    await shot(popup, 'rules-update-badge-before');

    // Settings → Data → Clear "Pending rule updates"
    await popup.$eval('#settingsBtn', el => el.click());
    await popup.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 200, timeout: 10000 });
    await popup.$eval('.settings-tab-btn[data-settings-tab="data"]', el => el.click());
    await popup.$eval('#storageTotalText', el => el.closest('.data-card-head').click());
    await popup.waitForFunction(() => document.querySelectorAll('#storageRows .storage-row').length === 8, null, { polling: 200, timeout: 10000 });
    await popup.$eval('[data-clear="updates"]', el => el.click());
    await popup.waitForSelector('.notification-confirm .notification-btn-confirm');
    await popup.$eval('.notification-btn-confirm', el => el.click());
    await popup.waitForFunction(() => !document.querySelector('.notification-confirm'), null, { polling: 200, timeout: 8000 });
    assert.equal(await W((key) => chrome.storage.local.get(key).then(r => r[key]), PENDING), undefined, 'Clear removed the stored updates');
    await until(async () => { const s = await shown(); return s.badge === '' && s.notice === ''; }, 6000, 'the badge and the notice to go (they stayed until the popup was opened again)');
    now = await shown();
    assert.equal(now.lit, false, 'the Update button is no longer lit');
    assert.equal(await popup.evaluate(() => window.__sameDocument), 'yes', 'the popup was not reopened');
    await popup.$eval('#closeSettingsModal', el => el.click());
    await popup.waitForFunction(() => !document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 200, timeout: 8000 });
    await shot(popup, 'rules-update-badge-cleared');

    // Settings → Check now finds updates: the same two keys are written (the check is stood in for: it would ask GitHub)
    await popup.evaluate(({ PENDING, INCOMPATIBLE }) => {
      UpdateManager.checkAndInstall = async () => {
        await chrome.storage.local.set({
          [PENDING]: [1, 2, 3].map(n => ({ id: `detect-e2e-${n}`, source: 'bundled', version: '9.9.9', name: `E2E ${n}` })),
          [INCOMPATIBLE]: [{ id: 'detect-e2e-newer', name: 'E2E Newer', remoteVersion: '9.9.9', minExtensionVersion: '99.0' }]
        });
        return { error: null, release: 'v-e2e', installed: [], needsDecision: [], failed: [], incompatible: [{ id: 'detect-e2e-newer', name: 'E2E Newer', minExtensionVersion: '99.0' }] };
      };
    }, { PENDING, INCOMPATIBLE });
    await popup.$eval('#settingsBtn', el => el.click());
    await popup.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 200, timeout: 10000 });
    await popup.$eval('.settings-tab-btn[data-settings-tab="general"]', el => el.click());
    await popup.$eval('#checkUpdatesNowBtn', el => el.click());
    await until(async () => (await shown()).badge === '3', 6000, 'the badge to show 3 after Check now');
    now = await shown();
    assert.match(now.notice, /E2E Newer/, 'the notice names the rule that waits for a newer extension');
    assert.equal(now.lit, true);
    await popup.$eval('#closeSettingsModal', el => el.click());
    await shot(popup, 'rules-update-badge-found');

    // Another tab: nothing watches; coming back reads what is stored now
    const watching = () => popup.evaluate(() => !!window.popupInstance.rules._pendingUpdatesWatcher);
    assert.equal(await watching(), true, 'watching while the Rules tab is shown');
    await popup.$eval('.tab-btn[data-tab="detection"]', el => el.click());
    await until(async () => !(await watching()), 5000, 'the watcher to go when the tab is left');
    await popup.evaluate((key) => chrome.storage.local.remove(key), PENDING);
    await popup.evaluate((key) => chrome.storage.local.remove(key), INCOMPATIBLE);
    await sleep(300);
    await popup.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await until(async () => { const s = await shown(); return s.badge === '' && s.notice === ''; }, 6000, 'the Rules tab to read the cleared updates when it comes back');
    assert.equal(await watching(), true, 'watching again');
    await popup.close();
  });

  // ===============================================================================================
  await scenario('Rules focus: a rule deleted from the keyboard keeps the page and the focus goes to the card that took its place', async () => {
    const popup = await popupFor();
    await openRules(popup);
    const total = await pagerTotal(popup);
    await nextPage(popup, 2);                                       // page 3: rules 5 and 6 of the list
    const from = await pagerFrom(popup);
    assert.equal(from, 5, 'two to a page: page 3 starts at 5');
    const order = await popup.evaluate(() => window.popupInstance.rules.filteredDetectors.map(e => e.detectorName));
    assert.deepEqual(await ruleIds(popup), [order[4], order[5]]);
    // The first card of the page: More actions → Delete → confirm, all from the keyboard
    await pressMenuItem(popup, '#rulesList .detector-card:nth-child(1)', 'delete-btn');
    await popup.waitForSelector('.notification-confirm[data-open="true"]', { timeout: 8000 });
    // (Cancel is where the dialog starts: Escape leaves everything as it was, and the focus goes back to the button)
    await popup.keyboard.press('Escape');
    await popup.waitForFunction(() => !document.querySelector('.notification-confirm[data-open="true"]'), null, { polling: 100, timeout: 5000 });
    assert.deepEqual(await ruleIds(popup), [order[4], order[5]], 'cancelled: nothing deleted');
    assert.equal((await focused(popup)).card, order[4], 'cancelled: the focus is back on that card\'s menu button');
    await pressMenuItem(popup, '#rulesList .detector-card:nth-child(1)', 'delete-btn');
    await confirmWithKeyboard(popup);
    await until(async () => !(await ruleIds(popup)).includes(order[4]), 8000, 'the card to go');
    assert.equal(await pagerTotal(popup), total - 1, 'one rule fewer');
    assert.equal(await pagerFrom(popup), 5, 'still page 3: a delete no longer sends the list back to page 1');
    assert.deepEqual(await ruleIds(popup), [order[5], order[6]], 'the next rules slid up');
    let now = await focused(popup);
    assert.equal(now.body, undefined, 'the focus did not fall to the page');
    assert.equal(now.card, order[5], `the card now where the deleted one was has the focus: ${JSON.stringify(now)}`);
    assert.match(now.classes, /rules-menu-trigger/, 'on its More actions button');
    await shot(popup, 'rules-focus-after-delete');

    // The same from the second card of a page; then the last card of the last page
    await pressMenuItem(popup, '#rulesList .detector-card:nth-child(2)', 'delete-btn');
    await confirmWithKeyboard(popup);
    await until(async () => !(await ruleIds(popup)).includes(order[6]), 8000, 'the second card to go');
    assert.equal(await pagerFrom(popup), 5);
    now = await focused(popup);
    assert.equal(now.card, order[7], 'the next rule, which came up from the following page, has the focus');

    // The last page: with the odd number of rules left it holds one card; deleting it takes the page, and the card before it has the focus
    const last = await popup.evaluate(() => { const p = window.popupInstance.rules.paginationManager; p.goToPage(p.getTotalPages()); return p.currentPage; });
    const remaining = await pagerTotal(popup);
    const lastIds = await ruleIds(popup);
    const all = await popup.evaluate(() => window.popupInstance.rules.filteredDetectors.map(e => e.detectorName));
    const target = lastIds[lastIds.length - 1];
    assert.equal(target, all[all.length - 1]);
    await pressMenuItem(popup, `#rulesList .detector-card:nth-child(${lastIds.length})`, 'delete-btn');
    await confirmWithKeyboard(popup);
    await until(async () => (await pagerTotal(popup)) === remaining - 1, 8000, 'the last card to go');
    const after = await ruleIds(popup);
    now = await focused(popup);
    assert.equal(now.body, undefined, 'the focus did not fall to the page');
    assert.ok(after.includes(now.card), `the focus is on a card of the page now shown: ${JSON.stringify(now)} in ${after}`);
    assert.equal(now.card, after[after.length - 1], 'the card before the deleted one, the last of the page now shown');
    assert.ok(await pagerFrom(popup) <= last * 2, 'the list did not jump back to page 1');
    assert.notEqual(await pagerFrom(popup), 1, 'not page 1');
    await popup.close();
  });

  // ===============================================================================================
  await scenario('Rules focus: with the Custom chip on, deleting the last custom rule leaves the focus on Clear filters', async () => {
    const popup = await popupFor();
    await openRules(popup);
    await popup.evaluate(async () => {
      const dm = window.popupInstance.detectorManager;
      await dm.addDetector('antibot', 'detect-e2e-custom', { id: 'detect-e2e-custom', name: 'E2E Custom Rule', author: 'E2E', enabled: true, category: 'Anti-Bot', difficulty: 'Medium',
        version: '1.0.0', lastUpdated: '2026-11-06', icon: 'custom.png', description: 'A rule for the focus scenario', detection: { content: [{ id: 'c1', text: 'e2e-marker', confidence: 90, standalone: true }] } });
      await window.popupInstance.rules.displayRules();
    });
    await popup.$eval('#rulesFilters .history-filter-chip[data-filter="custom"]', el => el.click());
    await until(async () => (await ruleIds(popup)).join() === 'detect-e2e-custom', 6000, 'the Custom chip to leave the one custom rule');
    await pressMenuItem(popup, '#rulesList .detector-card:nth-child(1)', 'delete-btn');
    await confirmWithKeyboard(popup);
    await until(async () => (await ruleIds(popup)).length === 0, 8000, 'the card to go');
    assert.equal(await popup.$eval('#rulesNoResults', el => !el.hidden), true, 'the filters left nothing: the message with the way back shows');
    const now = await focused(popup);
    assert.equal(now.id, 'rulesClearFilters', `Clear filters has the focus: ${JSON.stringify(now)}`);
    await shot(popup, 'rules-focus-clear-filters');
    await popup.keyboard.press('Enter');
    await until(async () => (await ruleIds(popup)).length === 2, 6000, 'Clear filters to bring the list back');
    await popup.close();
  });

  // ===============================================================================================
  await scenario('Rules focus: Reset to official puts the focus back on the same rule, on the same page', async () => {
    const popup = await popupFor();
    await openRules(popup);
    // A shipped rule the person edited: its menu has Reset to official
    const edited = await popup.evaluate(async () => {
      const dm = window.popupInstance.detectorManager;
      const edit = dm.getDetector('antibot', 'detect-cloudflare');
      const copy = JSON.parse(JSON.stringify(edit));
      copy.description = 'Edited by the focus scenario';
      DetectorManager.markUserEdited(copy, edit);
      dm.detectors.antibot['detect-cloudflare'] = copy;
      await dm.saveDetectorsToStorage();
      await window.popupInstance.rules.displayRules();
      return DetectorManager.isUserEdited(dm.getDetector('antibot', 'detect-cloudflare'));
    });
    assert.equal(edited, true, 'the fixture rule is an edited shipped rule');
    await popup.fill('#rulesSearch', 'cloudflare');
    await until(async () => (await ruleIds(popup)).includes('detect-cloudflare'), 6000, 'the search to find the rule');
    const index = (await ruleIds(popup)).indexOf('detect-cloudflare') + 1;
    assert.equal(await popup.$eval(`#rulesList .detector-card:nth-child(${index}) .rule-edited-tag`, el => el.textContent.trim()), 'Edited');
    await pressMenuItem(popup, `#rulesList .detector-card:nth-child(${index})`, 'reset-official-btn');
    await confirmWithKeyboard(popup);
    await until(() => popup.evaluate(() => !document.querySelector('#rulesList .detector-card[data-detector-id="detect-cloudflare"] .rule-edited-tag')), 8000, 'the Edited tag to go');
    const now = await focused(popup);
    assert.equal(now.body, undefined, `the focus did not fall to the page: ${JSON.stringify(now)}`);
    assert.equal(now.card, 'detect-cloudflare', 'the same rule');
    assert.match(now.classes, /rules-menu-trigger/);
    assert.equal(await popup.$eval('#rulesSearch', el => el.value), 'cloudflare', 'the search is still there');
    await shot(popup, 'rules-focus-after-reset');
    await popup.close();
  });

  // ===============================================================================================
  await scenario('Rules status: the region is in the page from the start, and says the count, the no-results line and each page, once per change', async () => {
    const popup = await popupFor();
    await openRules(popup);
    const region = await popup.$eval('#rulesResultsStatus', el => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { role: el.getAttribute('role'), live: el.getAttribute('aria-live'), atomic: el.getAttribute('aria-atomic'), hidden: el.hidden, display: style.display, visibility: style.visibility,
        width: Math.round(box.width), height: Math.round(box.height), position: style.position, inHeader: !!el.closest('.rules-header') };
    });
    assert.deepEqual({ role: region.role, live: region.live, atomic: region.atomic, hidden: region.hidden, display: region.display, visibility: region.visibility, inHeader: region.inHeader },
      { role: 'status', live: 'polite', atomic: 'true', hidden: false, display: 'block', visibility: 'visible', inHeader: true });
    assert.deepEqual([region.width, region.height, region.position], [1, 1, 'absolute'], 'said, not shown: no room in the layout');
    // Record every text the region takes
    await popup.evaluate(() => {
      const el = document.querySelector('#rulesResultsStatus');
      window.__said = [];
      new MutationObserver(() => window.__said.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
    });
    const said = () => popup.evaluate(() => window.__said.slice());
    const text = () => popup.$eval('#rulesResultsStatus', el => el.textContent);
    const total = await pagerTotal(popup);
    // The same words as the visible pager line
    assert.equal(await text(), await pagerText(popup));
    assert.equal(await text(), `Showing 1-2 of ${total}`);
    // A search: a new count each time it changes
    await popup.fill('#rulesSearch', 'akamai');
    await until(async () => (await text()) !== `Showing 1-2 of ${total}`, 5000, 'the count to follow the search');
    const searched = await text();
    assert.match(searched, /^Showing 1-\d+ of \d+$/);
    assert.equal(searched, await pagerText(popup), 'what the pager shows');
    // A search with no match: the no-results line, which the page already shows
    await popup.fill('#rulesSearch', 'zzz no such rule');
    await until(async () => (await text()) === 'No entries match your search or filters.', 5000, 'the no-results line');
    assert.equal(await popup.$eval('#rulesNoResults p', el => el.textContent.trim()), 'No entries match your search or filters.');
    assert.equal(await popup.$eval('#rulesNoResults', el => el.hidden), false);
    // A chip that leaves something, then Clear filters
    await popup.$eval('#rulesFilters .history-filter-chip[data-filter="captcha"]', el => el.click());
    assert.equal(await text(), 'No entries match your search or filters.', 'the chip with the search still leaves nothing: said once, not again');
    await popup.$eval('#rulesClearFilters', el => el.click());
    await until(async () => (await text()) === `Showing 1-2 of ${total}`, 5000, 'the full count after Clear filters');
    await popup.$eval('#rulesFilters .history-filter-chip[data-filter="captcha"]', el => el.click());
    await until(async () => { const t = await text(); return /^Showing 1-2 of \d+$/.test(t) && t !== `Showing 1-2 of ${total}`; }, 5000, 'the captcha chip count');
    // A page flip: the pager line changes and so does the region
    const before = await text();
    await popup.$eval('#rulesPagination .pagination-btn-next', el => el.click());
    await until(async () => (await text()) !== before, 5000, 'the page flip');
    assert.match(await text(), /^Showing 3-4 of \d+$/);
    assert.equal(await text(), await pagerText(popup));
    // Drawing the same list again says nothing again
    const spoken = (await said()).length;
    await popup.evaluate(() => window.popupInstance.rules.displayRules({ keepPage: true }));
    await popup.evaluate(() => window.popupInstance.rules.syncFilterUi());
    await sleep(300);
    assert.equal((await said()).length, spoken, 'the same words are not written again');
    // Every text it took is a real line, never half of one
    for (const line of await said()) assert.ok(line === '' || /^Showing \d+-\d+ of \d+$/.test(line) || line === 'No entries match your search or filters.', `a clean line: "${line}"`);
    await popup.close();
  });

  // ---- Advanced helpers ------------------------------------------------------------------------------
  const MODULES = [['akamai', 'akamaiCheckCookies'], ['hcaptcha', 'hcaptchaExtractSiteKey'], ['recaptcha', 'recaptchaExtract']];
  /** Three vendors, three captures each, newest first in the order akamai 0..2, hcaptcha 0..2, recaptcha 0..2. */
  async function seedCaptures(popup) {
    await popup.evaluate(async (modules) => {
      let n = 0;
      const base = Date.now();
      for (const [id, tool] of modules) {
        for (let i = 0; i < 3; i++) {
          await AdvancedHistoryStore.appendCapture(id, { id: `e2e-${id}-${i}`, timestamp: base - (n++) * 1000, url: `http://127.0.0.1/p/${id}-${i}`, hostname: '127.0.0.1',
            data: { schemaVersion: 1, tool, vendorId: id, label: tool, result: { kind: 'seed', n } } }, { expiryMinutes: 30 });
        }
      }
    }, MODULES);
  }
  async function openCaptures(popup) {
    await popup.$eval('.tab-btn[data-tab="advanced"]', el => el.click());
    await popup.waitForFunction(() => window.popupInstance.advanced && window.popupInstance.advanced.initialized && !!document.querySelector('#advancedCaptureTab'), null, { polling: 250, timeout: 30000 });
    await popup.$eval('#advancedCaptureTab', el => el.click());
    await popup.waitForFunction(() => document.querySelector('#capturesPanel').classList.contains('active'), null, { polling: 200, timeout: 10000 });
    await popup.$eval('.cap-scope-btn[data-site="all"]', el => el.click());
    await popup.waitForFunction(() => document.querySelectorAll('#captureGrid .cap-row').length > 0, null, { polling: 200, timeout: 10000 });
  }
  const rowIds = (page) => page.$$eval('#captureGrid .cap-row', rows => rows.map(row => row.dataset.captureId));

  // ===============================================================================================
  await scenario('Capture rows: a labelled group of three real buttons, no button inside a button, still one click target', async () => {
    const popup = await popupFor();
    await seedCaptures(popup);
    await openCaptures(popup);
    const ids = await rowIds(popup);
    assert.equal(ids.length, 9);
    const rows = await popup.$$eval('#captureGrid .cap-row', list => list.map(row => ({
      role: row.getAttribute('role'), label: row.getAttribute('aria-label'), tabindex: row.getAttribute('tabindex'),
      buttons: [...row.querySelectorAll('button')].map(button => ({ cls: button.className, action: button.dataset.action || '', label: button.getAttribute('aria-label'), nested: !!button.parentElement.closest('button') })),
      openIsFirst: row.firstElementChild.matches('button.cap-row-open')
    })));
    for (const row of rows) {
      assert.equal(row.role, 'group');
      assert.match(row.label, /^.+ · (Akamai|hCaptcha|reCAPTCHA).* · 127\.0\.0\.1$/, `the group's name: ${row.label}`);
      assert.equal(row.tabindex, null, 'the row itself is not a stop');
      assert.equal(row.buttons.length, 3);
      assert.deepEqual(row.buttons.map(b => b.action), ['', 'copy', 'delete']);
      assert.ok(row.buttons.every(b => !b.nested), 'no button inside a button');
      assert.equal(row.buttons[0].label, `View: ${row.label}`);
      assert.equal(row.openIsFirst, true);
    }
    assert.equal(await popup.$$eval('#captureGrid [role="button"]', els => els.length), 0, 'no role="button" left in the list');
    assert.equal(await popup.$$eval('#captureGrid [role="button"] button, #captureGrid button button', els => els.length), 0, 'nothing nested');
    // The accessibility tree reaches Copy and Delete (the reason for the change): the row is a group holding three buttons
    const tree = await popup.locator('#captureGrid .cap-row').first().ariaSnapshot();
    assert.match(tree, /group/);
    assert.equal((tree.match(/button/g) || []).length, 3, `three buttons in the row's tree:\n${tree}`);
    // The keyboard: one Tab stop per button, in the row's order
    await popup.focus('#captureGrid .cap-row:nth-child(1) .cap-row-open');
    assert.equal((await focused(popup)).row, ids[0]);
    await popup.keyboard.press('Tab');
    assert.equal((await focused(popup)).action, 'copy');
    await popup.keyboard.press('Tab');
    assert.equal((await focused(popup)).action, 'delete');
    await popup.keyboard.press('Tab');
    assert.equal((await focused(popup)).row, ids[1], 'the next row\'s open button');
    // Enter on the open button opens the capture; Copy and Delete do not
    await popup.focus('#captureGrid .cap-row:nth-child(1) .cap-row-open');
    await popup.keyboard.press('Enter');
    await popup.waitForSelector('.adv-kit-overlay .adv-kit-title', { timeout: 10000 });
    await popup.$eval('.adv-kit-overlay .advanced-modal-close-btn', el => el.click());
    await popup.waitForFunction(() => !document.querySelector('.adv-kit-overlay'), null, { polling: 200, timeout: 8000 });
    await popup.focus('#captureGrid .cap-row:nth-child(2) .cap-row-open');
    await popup.keyboard.press(' ');
    await popup.waitForSelector('.adv-kit-overlay .adv-kit-title', { timeout: 10000 });
    await popup.$eval('.adv-kit-overlay .advanced-modal-close-btn', el => el.click());
    await popup.waitForFunction(() => !document.querySelector('.adv-kit-overlay'), null, { polling: 200, timeout: 8000 });
    await popup.evaluate(() => { window.__copied = []; });
    await popup.focus('#captureGrid .cap-row:nth-child(3) [data-action="copy"]');
    await popup.keyboard.press('Enter');
    await until(async () => (await toasts(popup)).some(t => /copied/i.test(t)), 8000, 'the Copy toast');
    assert.equal(await popup.$$eval('.adv-kit-overlay', els => els.length), 0, 'Copy opened nothing');
    // The whole row is still a click target: the open button, the logo, and the row's own padding at its right edge
    const geometry = await popup.$eval('#captureGrid .cap-row:nth-child(1)', row => {
      const r = row.getBoundingClientRect();
      const open = row.querySelector('.cap-row-open').getBoundingClientRect();
      const actions = row.querySelector('.cap-row-actions').getBoundingClientRect();
      return { row: { x: r.x, y: r.y, w: r.width, h: r.height }, open: { x: open.x, w: open.width, h: open.height }, actions: { x: actions.x, w: actions.width }, rtl: getComputedStyle(row).direction === 'rtl' };
    });
    assert.ok(geometry.open.w > geometry.row.w * 0.6, `the open button fills what the actions leave: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.open.h >= 40, 'about the row\'s height');
    for (const [name, x] of [['the logo', geometry.row.x + 18], ['the text', geometry.row.x + 120], ['the row\'s right edge', geometry.row.x + geometry.row.w - 2]]) {
      await popup.mouse.click(x, geometry.row.y + geometry.row.h / 2);
      await popup.waitForSelector('.adv-kit-overlay .adv-kit-title', { timeout: 10000 }).catch(() => { throw new Error(`a click on ${name} did not open the capture`); });
      await popup.$eval('.adv-kit-overlay .advanced-modal-close-btn', el => el.click());
      await popup.waitForFunction(() => !document.querySelector('.adv-kit-overlay'), null, { polling: 200, timeout: 8000 });
    }
    await shot(popup, 'capture-rows-dark');
    await popup.close();
  });

  // ===============================================================================================
  await scenario('Capture rows: a capture deleted from the keyboard hands the focus to the next row, the one before at the end, and Open tools when none is left', async () => {
    const popup = await popupFor();
    await seedCaptures(popup);
    await openCaptures(popup);
    let ids = await rowIds(popup);
    // Delete the 2nd row from its Delete button (no question is asked)
    await popup.focus('#captureGrid .cap-row:nth-child(2) [data-action="delete"]');
    await popup.keyboard.press('Enter');
    await until(async () => !(await rowIds(popup)).includes(ids[1]), 8000, 'the row to go');
    let now = await focused(popup);
    assert.equal(now.body, undefined, 'the focus did not fall to the page');
    assert.equal(now.row, ids[2], 'the row that took its place');
    assert.match(now.classes, /cap-row-open/, 'its open button, not its Delete button (a second Enter must not delete that capture too)');
    assert.equal((await rowIds(popup)).length, 8);
    // A second Enter on that open button opens the capture rather than deleting it
    await popup.keyboard.press('Enter');
    await popup.waitForSelector('.adv-kit-overlay .adv-kit-title', { timeout: 10000 });
    assert.equal((await rowIds(popup)).length, 8, 'nothing more was deleted');
    await popup.$eval('.adv-kit-overlay .advanced-modal-close-btn', el => el.click());
    await popup.waitForFunction(() => !document.querySelector('.adv-kit-overlay'), null, { polling: 200, timeout: 8000 });
    // The last row
    ids = await rowIds(popup);
    await popup.focus(`#captureGrid .cap-row:nth-child(${ids.length}) [data-action="delete"]`);
    await popup.keyboard.press('Enter');
    await until(async () => (await rowIds(popup)).length === ids.length - 1, 8000, 'the last row to go');
    now = await focused(popup);
    assert.equal(now.row, ids[ids.length - 2], 'the row before it');
    // Everything left: the empty state offers Open tools, and that has the focus
    for (let guard = 0; guard < 12 && (await rowIds(popup)).length > 0; guard++) {
      const count = (await rowIds(popup)).length;
      await popup.focus('#captureGrid .cap-row:nth-child(1) [data-action="delete"]');
      await popup.keyboard.press('Enter');
      await until(async () => (await rowIds(popup)).length < count, 8000, 'a row to go');
    }
    await until(() => popup.evaluate(() => getComputedStyle(document.querySelector('#captureEmptyState')).display !== 'none'), 8000, 'the empty state');
    now = await focused(popup);
    assert.equal(now.id, 'captureOpenToolsBtn', `Open tools has the focus: ${JSON.stringify(now)}`);
    await shot(popup, 'capture-rows-empty-focus');
    await popup.close();
  });

  // ===============================================================================================
  await scenario('Capture rows: a vendor chip pressed from the keyboard keeps the focus; a filter that hides the rest leaves it on Reset all filters', async () => {
    const popup = await popupFor();
    await seedCaptures(popup);
    await openCaptures(popup);
    const chip = (group, value) => `#captureChips .cap-chip[data-filter-group="${group}"][data-filter-value="${value}"]`;
    await popup.focus(chip('module', 'hcaptcha'));
    await popup.keyboard.press(' ');
    await until(async () => (await rowIds(popup)).length === 3, 6000, 'the vendor chip to narrow the list');
    let now = await focused(popup);
    assert.equal(now.body, undefined, `the focus did not fall to the page: ${JSON.stringify(now)}`);
    assert.equal(now.chip, 'module:hcaptcha', 'still on the chip that was pressed');
    assert.equal(await popup.$eval(chip('module', 'hcaptcha'), el => el.getAttribute('aria-pressed')), 'true');
    await popup.keyboard.press('Enter');
    await until(async () => (await rowIds(popup)).length === 9, 6000, 'the chip pressed again to show everything');
    now = await focused(popup);
    assert.equal(now.chip, 'module:hcaptcha');
    await popup.close();
  });

  // ===============================================================================================
  async function showTools(popup) {
    // Two protections with tools on the page the popup shows: the "?" button is part of that view
    await popup.$eval('.tab-btn[data-tab="advanced"]', el => el.click());
    await popup.waitForFunction(() => window.popupInstance.advanced && window.popupInstance.advanced.initialized, null, { polling: 250, timeout: 30000 });
    await popup.evaluate(() => {
      const dm = window.popupInstance.detectorManager;
      const detection = (id) => ({ detector: dm.findDetectorById(id), confidence: 95, methods: [] });
      window.popupInstance.advanced.onDetectionDataReady([detection('detect-akamai'), detection('detect-datadome')]);
    });
    await popup.waitForFunction(() => document.querySelectorAll('.advanced-launch-card').length === 2 && !!document.querySelector('#showAdvancedHelp'), null, { polling: 250, timeout: 15000 });
  }
  const helpOpen = (page) => page.evaluate(() => getComputedStyle(document.querySelector('#advancedInfoModal')).display === 'flex');
  const insideHelp = (page) => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#advancedInfoModal .advanced-info-container'));

  await scenario('Help dialog: a named modal dialog; the focus moves in, Tab and Shift+Tab stay in, Escape closes it and the focus goes back to the "?" button', async () => {
    const popup = await popupFor();
    await showTools(popup);
    const dialog = await popup.$eval('#advancedInfoModal .advanced-info-container', el => ({ role: el.getAttribute('role'), modal: el.getAttribute('aria-modal'), by: el.getAttribute('aria-labelledby'),
      name: document.getElementById(el.getAttribute('aria-labelledby')).textContent.trim() }));
    assert.deepEqual(dialog, { role: 'dialog', modal: 'true', by: 'advancedInfoTitle', name: 'Advanced Detection Tools' });
    await popup.focus('#showAdvancedHelp');
    await popup.keyboard.press('Enter');
    await until(() => helpOpen(popup), 5000, 'the dialog');
    assert.equal((await focused(popup)).id, 'closeAdvancedInfoModal', 'the focus moved into the dialog, to its close button');
    // The page behind is not reachable: Tab and Shift+Tab many times
    for (let i = 0; i < 6; i++) {
      await popup.keyboard.press('Tab');
      assert.equal(await insideHelp(popup), true, `Tab ${i + 1} stayed in the dialog: ${JSON.stringify(await focused(popup))}`);
    }
    for (let i = 0; i < 3; i++) {
      await popup.keyboard.press('Shift+Tab');
      assert.equal(await insideHelp(popup), true, `Shift+Tab ${i + 1} stayed in the dialog`);
    }
    assert.equal(await popup.$eval('#advancedInfoModal .advanced-info-container', el => el.getBoundingClientRect().height > 100), true);
    await shot(popup, 'advanced-help-dark');
    await popup.keyboard.press('Escape');
    await until(async () => !(await helpOpen(popup)), 5000, 'Escape to close it');
    assert.equal((await focused(popup)).id, 'showAdvancedHelp', 'the focus is back on the "?" button');
    // Again, closed with its button this time, and from the mouse
    await popup.$eval('#showAdvancedHelp', el => el.click());
    await until(() => helpOpen(popup), 5000, 'the dialog again');
    assert.equal(await insideHelp(popup), true);
    await popup.$eval('#closeAdvancedInfoModal', el => el.click());
    await until(async () => !(await helpOpen(popup)), 5000, 'the close button');
    assert.equal((await focused(popup)).id, 'showAdvancedHelp');
    // A click on the backdrop closes it too
    await popup.focus('#showAdvancedHelp');
    await popup.keyboard.press('Enter');
    await until(() => helpOpen(popup), 5000, 'the dialog a third time');
    await popup.mouse.click(4, 4);
    await until(async () => !(await helpOpen(popup)), 5000, 'the backdrop click');
    assert.equal((await focused(popup)).id, 'showAdvancedHelp');
    await popup.close();
  });

  // ===============================================================================================
  await scenario('Looks: the capture rows and the Help dialog in the dark and the light theme and in Arabic; the row keeps its layout, nothing spills', async () => {
    const popup = await popupFor();
    await seedCaptures(popup);
    await openCaptures(popup);
    const layout = () => popup.$eval('#captureGrid .cap-row', row => {
      const box = row.getBoundingClientRect();
      const open = row.querySelector('.cap-row-open').getBoundingClientRect();
      const mark = row.querySelector('.cap-row-mark').getBoundingClientRect();
      const actions = row.querySelector('.cap-row-actions').getBoundingClientRect();
      const grid = document.querySelector('#captureGrid');
      return { dir: getComputedStyle(row).direction, height: Math.round(box.height), openToActions: Math.round(Math.abs(open.right - actions.left)), openToActionsRtl: Math.round(Math.abs(actions.right - open.left)),
        markAtStart: getComputedStyle(row).direction === 'rtl' ? mark.right > box.left + box.width / 2 : mark.left < box.left + box.width / 2,
        openText: getComputedStyle(row.querySelector('.cap-row-open')).textAlign, spills: grid.scrollWidth > grid.clientWidth + 1 || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        overlap: open.right > actions.left + 1 && open.left < actions.right - 1 };
    });
    const dark = await layout();
    assert.equal(dark.spills, false);
    assert.equal(dark.overlap, false, 'the open button and the actions do not overlap');
    assert.ok(dark.height >= 52 && dark.height <= 60, `a row is about 52px high: ${dark.height}`);
    await popup.focus('#captureGrid .cap-row:nth-child(1) .cap-row-open');
    await popup.keyboard.press('Shift+Tab');
    await popup.keyboard.press('Tab');
    const ring = await popup.$eval('#captureGrid .cap-row:nth-child(1)', row => { row.style.transition = 'none'; const s = getComputedStyle(row); return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset }; });
    assert.deepEqual(ring, { style: 'solid', width: '2px', offset: '-2px' }, 'the focus ring is around the whole row, as it was');
    const buttonRing = await popup.$eval('#captureGrid .cap-row:nth-child(1) .cap-row-open', el => getComputedStyle(el).outlineStyle);
    assert.equal(buttonRing, 'none', 'and not a second one around the button');
    await shot(popup, 'capture-row-focus-dark', { x: 0, y: 180, width: 420, height: 260 });
    await setTheme(popup, 'light');
    const light = await layout();
    assert.deepEqual([light.height, light.spills], [dark.height, false]);
    await shot(popup, 'capture-rows-light');
    await shot(popup, 'capture-row-focus-light', { x: 0, y: 180, width: 420, height: 260 });
    await setTheme(popup, 'dark');
    await popup.close();

    // Arabic (right to left): the row mirrors, the open button's text starts on the right, the actions are on the left
    await W(() => chrome.storage.local.set({ scrapfly_language_override: 'ar' }));
    try {
      const ar = await popupFor();
      await seedCaptures(ar);
      await openCaptures(ar);
      const rtl = await ar.$eval('#captureGrid .cap-row', row => {
        const box = row.getBoundingClientRect();
        const open = row.querySelector('.cap-row-open').getBoundingClientRect();
        const actions = row.querySelector('.cap-row-actions').getBoundingClientRect();
        const mark = row.querySelector('.cap-row-mark').getBoundingClientRect();
        const style = getComputedStyle(row.querySelector('.cap-row-open'));
        return { dir: getComputedStyle(document.documentElement).direction, actionsAtLeft: actions.left < box.left + box.width / 2 && open.left >= actions.right - 1,
          markAtRight: mark.right > box.left + box.width / 2, textAlign: style.textAlign, spills: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
      });
      assert.equal(rtl.dir, 'rtl');
      assert.equal(rtl.actionsAtLeft, true, 'Copy and Delete on the left');
      assert.equal(rtl.markAtRight, true, 'the logo at the start (right)');
      assert.equal(rtl.spills, false);
      assert.ok(['start', 'right'].includes(rtl.textAlign));
      assert.match(await ar.$eval('#captureGrid .cap-row', row => row.getAttribute('aria-label')), /127\.0\.0\.1/);
      await shot(ar, 'capture-rows-rtl');
      // The dialog in Arabic: named by its own (translated) title
      await showTools(ar);
      await ar.focus('#showAdvancedHelp');
      await ar.keyboard.press('Enter');
      await until(() => helpOpen(ar), 5000, 'the dialog in Arabic');
      const name = await ar.$eval('#advancedInfoModal .advanced-info-container', el => document.getElementById(el.getAttribute('aria-labelledby')).textContent.trim());
      const messages = JSON.parse(fs.readFileSync(path.join(REPO, '_locales', 'ar', 'messages.json'), 'utf8'));
      assert.equal(name, messages.advancedModalTitle.message, 'named in the interface language');
      assert.equal(await ar.evaluate(() => getComputedStyle(document.querySelector('#advancedInfoModal .advanced-info-container')).direction), 'rtl');
      await shot(ar, 'advanced-help-rtl');
      await ar.keyboard.press('Escape');
      await until(async () => !(await helpOpen(ar)), 5000, 'Escape in Arabic');
      assert.equal((await focused(ar)).id, 'showAdvancedHelp');
      await ar.close();
    } finally {
      await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
    }
  });

  // ===============================================================================================
  await scenario('Editor: the Add pattern button still adds a row, and there is no "add section" button or prompt left', async () => {
    const popup = await popupFor();
    await openRules(popup);
    await popup.fill('#rulesSearch', 'cloudflare');
    await until(async () => (await ruleIds(popup)).includes('detect-cloudflare'), 6000, 'the search');
    await popup.$eval('#rulesList .detector-card[data-detector-id="detect-cloudflare"] .edit-btn', el => el.click());
    await popup.waitForFunction(() => getComputedStyle(document.querySelector('#editRuleModal')).display !== 'none', null, { polling: 200, timeout: 10000 });
    await popup.$eval('#detectionMethodsCard .modal-card-header--toggle', el => el.click());
    await popup.waitForSelector('#detectionMethodsContainer .method-section .add-method-btn', { state: 'visible', timeout: 10000 });
    assert.equal(await popup.$$eval('#editRuleModal .add-section-btn', els => els.length), 0, 'no add-section button');
    const before = await popup.$$eval('#detectionMethodsContainer .method-item', els => els.length);
    await popup.$eval('#detectionMethodsContainer .method-section .add-method-btn', el => el.click());
    await until(async () => (await popup.$$eval('#detectionMethodsContainer .method-item', els => els.length)) === before + 1, 5000, 'the new pattern row');
    assert.equal(await popup.evaluate(() => typeof window.popupInstance.rules.addNewMethodSection), 'undefined', 'the removed function is gone');
    await popup.$eval('#cancelRuleEdit', el => el.click());
    await popup.close();
  });

  // ---- Report ----------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${[...new Set(pageErrors)].join('\n  ')}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  console.log(failed.length || pageErrors.length ? 'RESULT FAILED' : `RESULT ALL PASS (${results.length} scenarios)`);
  await ctx.close();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
