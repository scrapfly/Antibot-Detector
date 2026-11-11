#!/usr/bin/env node
/**
 * Settings → the search box, in the real extension (unpacked in Chromium), with a real keyboard:
 *
 *   Place       the box sits between the header and the tabs, outside the scrolling body (it stays when the body scrolls) and has a name
 *   Finding     "cache duration" opens the Detection tab, unfolds Cache Settings and leaves that one row on screen; "webhook secret"
 *               shows the switch that turns the fields on, and, with the webhook on, only the signing secret
 *   Nothing     a word nothing holds shows the line that says so, and the count is said through the status line
 *   Escape      the first one empties the box and keeps Settings open, the second closes Settings (focus trap and window listener)
 *   Clear       the button empties the box, hides itself and gives the focus back to it; Tab goes box → button → tabs
 *   Back        emptying the box puts back the tab and the folds as they were, and no setting value changed on the way
 *   Arabic      the page mirrors (magnifier at the right, clear button at the left) and an Arabic word finds its setting
 *   Light       the box looks like the other fields in the light theme
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium (npm run e2e:setup).
 *   node scripts/e2e-settings-search.js [repository] [--shots <folder>]     --shots saves a picture of each state
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
const flag = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
const REPO = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--shots') || path.join(__dirname, '..'));
const SHOTS = flag('--shots') ? path.resolve(flag('--shots')) : null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-settings-search-'));
  const checks = [];
  let context;
  const check = async (name, fn) => {
    try { await fn(); checks.push([name, null]); console.log(`PASS ${name}`); } catch (error) { checks.push([name, error]); console.error(`FAIL ${name}\n     ${String(error.message).split('\n').join('\n     ')}`); }
  };
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
      args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const ready = () => page.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized, null, { polling: 250 });
    const open = async () => {
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      await ready();
      await page.evaluate(() => window.popupInstance.settings.showSettings());
      await sleep(250);
    };
    const shot = async (name) => { if (SHOTS) await page.locator('#settingsModal .base-modal-content').screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
    const box = page.locator('#settingsSearchInput');
    const type = async (text) => { await box.click(); await box.fill(''); await page.keyboard.type(text, { delay: 15 }); await sleep(120); };
    const openTab = () => page.evaluate(() => document.querySelector('.settings-tab-btn.active').dataset.settingsTab);
    const isOpen = () => page.evaluate(() => document.querySelector('#settingsModal').classList.contains('is-open'));
    const shown = (selector) => page.locator(selector).first().isVisible();
    const values = () => page.evaluate(() => [...document.querySelectorAll('#settingsModal input:not(#settingsSearchInput), #settingsModal select, #settingsModal textarea')].map((el) => [el.id, el.value, el.checked]));

    await open();

    await check('the box sits between the header and the tabs, outside the scrolling body, and has a name', async () => {
      const place = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
        const input = document.querySelector('#settingsSearchInput');
        return { header: rect('#settingsModal .modal-header').bottom, box: rect('#settingsSearchInput'), tabs: rect('#settingsModal .settings-tabs').top, inBody: !!input.closest('.modal-body'),
          name: input.getAttribute('aria-label'), placeholder: input.placeholder, body: rect('#settingsModal .modal-body').height };
      });
      assert.ok(place.box.top >= place.header - 1 && place.box.bottom <= place.tabs + 1, JSON.stringify(place));
      assert.equal(place.inBody, false);
      assert.equal(place.name, 'Search settings...');
      assert.equal(place.placeholder, 'Search settings...');
      assert.ok(place.box.width > 200 && place.box.height >= 28, 'the box is wide enough to type in');
      assert.ok(place.body >= 280, `the body keeps room to scroll in: ${Math.round(place.body)}px`);
      await shot('01-empty');
    });

    await check('"cache duration" opens the Detection tab, unfolds Cache Settings and leaves that one row', async () => {
      await type('cache duration');
      assert.equal(await openTab(), 'detection');
      assert.equal(await shown('#cacheDuration'), true);
      assert.equal(await shown('#cacheScope'), false, 'the other row of the card is not about duration');
      assert.equal(await shown('#sortByConfidence'), false, 'the other cards are gone');
      assert.equal(await shown('#notificationsEnabled'), false, 'and the other tabs');
      assert.equal(await shown('#settingsSearchEmpty'), false);
      assert.equal(await page.locator('#cacheDuration').evaluate((el) => el.closest('.settings-card').classList.contains('is-collapsed')), false);
      await sleep(700);
      assert.equal(await page.locator('#settingsSearchStatus').textContent(), 'Settings found: 1');
      await shot('02-cache-duration');
    });

    await check('what is found by its description, and by words from the card title and the row together', async () => {
      await type('almost full backup fails');
      assert.equal(await openTab(), 'general');
      assert.equal(await shown('label:has(> #notificationsEnabled)'), true);
      assert.equal(await shown('#themeChoice'), false);
      assert.equal(await shown('#debugModeGeneral'), false);
      await shot('03-description');
    });

    await check('"webhook secret": the switch while the webhook is off, only the signing secret once it is on', async () => {
      const before = await values();
      await type('webhook secret');
      assert.equal(await openTab(), 'detection');
      // The checkbox of a switch has no size (the slider beside it is what shows), so the switch is its label
      assert.equal(await shown('label:has(> #enableWebhook)'), true, 'the switch that turns the fields on');
      assert.equal(await shown('#webhookSecret'), false, 'still off: the page decides that, not the search');
      await shot('04-webhook-off');
      await page.locator('#enableWebhook').evaluate((el) => el.closest('label').click()); // the visible part of the switch is its label
      await sleep(150);
      assert.equal(await shown('#webhookSecret'), true);
      assert.equal(await shown('#webhookUrl'), false, 'the other webhook fields are not about a secret');
      assert.equal(await shown('#testWebhookBtn'), false);
      await shot('05-webhook-on');
      await page.locator('#enableWebhook').evaluate((el) => el.closest('label').click());
      await sleep(150);
      await box.fill('');
      await box.dispatchEvent('input');
      assert.deepEqual(await values(), before, 'the switch is back where it was and nothing else moved');
    });

    await check('a word nothing holds shows the line that says so, and the status line says it too', async () => {
      await type('zzqqxx');
      assert.equal(await shown('#settingsSearchEmpty'), true);
      assert.equal((await page.locator('#settingsSearchEmpty').textContent()).trim(), 'No settings match your search.');
      assert.equal(await page.locator('#settingsModal .settings-tab-content.active .settings-card-group:visible').count(), 0);
      await sleep(700);
      assert.equal(await page.locator('#settingsSearchStatus').textContent(), 'No settings match your search.');
      assert.equal(await shown('#settingsSearchInput'), true, 'and the box is still there to be emptied');
      await shot('06-no-match');
    });

    await check('Escape empties the box and keeps Settings open; the next Escape closes Settings', async () => {
      await type('cache');
      await page.keyboard.press('Escape');
      assert.equal(await box.inputValue(), '');
      assert.equal(await isOpen(), true, 'the first Escape belongs to the search');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'settingsSearchInput', 'the focus stays in the box');
      assert.equal(await page.locator('#settingsModal .settings-search-hidden').count(), 0, 'everything is back');
      await page.keyboard.press('Escape');
      await sleep(150);
      assert.equal(await isOpen(), false, 'with nothing to empty, Escape closes Settings as it always did');
      await page.evaluate(() => window.popupInstance.settings.showSettings());
      await sleep(200);
    });

    await check('the clear button empties the box, hides itself and gives the focus back; Tab goes box, button, tabs', async () => {
      await type('cache');
      assert.equal(await shown('#settingsSearchClear'), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'settingsSearchClear');
      await page.keyboard.press('Tab');
      assert.match(await page.evaluate(() => document.activeElement.id), /^settingsTab-/);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'settingsSearchInput', 'and back');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal(await box.inputValue(), '');
      assert.equal(await shown('#settingsSearchClear'), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'settingsSearchInput');
    });

    await check('emptying the box puts back the tab and the folds, and the arrow keys still move along the tabs during a search', async () => {
      await page.evaluate(() => window.popupInstance.settings.showSettings());
      await page.locator('#settingsTab-general').click();
      const folds = () => page.evaluate(() => [...document.querySelectorAll('#settingsModal .settings-card.is-collapsible')].map((card) => card.classList.contains('is-collapsed')));
      const start = await folds();
      await type('cache');
      assert.equal(await openTab(), 'detection');
      await page.locator('#settingsTab-detection').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await openTab(), 'history');
      assert.equal(await page.evaluate(() => document.querySelector('#settingsTab-history').getAttribute('aria-selected')), 'true');
      assert.equal(await page.evaluate(() => document.querySelectorAll('.settings-tab-btn[aria-selected="true"]').length), 1);
      await box.fill('');
      await box.dispatchEvent('input');
      assert.equal(await openTab(), 'general');
      assert.deepEqual(await folds(), start);
    });

    await check('Settings opens with the box empty and nothing hidden, and a Save that finds a bad value shows the field', async () => {
      await type('theme');
      await page.evaluate(() => window.popupInstance.settings.hideSettings());
      await page.evaluate(() => window.popupInstance.settings.showSettings());
      assert.equal(await box.inputValue(), '');
      assert.equal(await page.locator('#settingsModal .settings-search-hidden').count(), 0);
      await type('theme');
      assert.equal(await shown('#cacheDuration'), false);
      await page.evaluate(() => { document.querySelector('#cacheDuration').value = '999'; });
      await page.locator('#saveSettingsBtn').click();
      await sleep(400);
      assert.equal(await box.inputValue(), '', 'the search stepped aside');
      assert.equal(await openTab(), 'detection');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'cacheDuration', 'the field is focused');
      assert.equal(await shown('#cacheDuration'), true);
      await page.evaluate(() => { document.querySelector('#cacheDuration').value = '7'; });
    });

    await check('the light theme: the box looks like the other fields', async () => {
      await page.evaluate(() => ScrapflyTheme.set('light'));
      await page.locator('#settingsTab-detection').click();
      await sleep(500); // the box's border colour eases over 0.2s; read it once it has settled
      const look = await page.evaluate(() => {
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        const [search, field] = [style('#settingsSearchInput'), style('#cacheDuration')];
        return { searchBg: search.backgroundColor, fieldBg: field.backgroundColor, searchBorder: search.borderTopColor, fieldBorder: field.borderTopColor, color: search.color };
      });
      assert.equal(look.searchBg, look.fieldBg);
      assert.equal(look.searchBorder, look.fieldBorder);
      await type('cache duration');
      await shot('07-light');
      await page.evaluate(() => ScrapflyTheme.set('dark'));
    });

    await check('Arabic mirrors the box, and an Arabic word finds its setting', async () => {
      const arabic = JSON.parse(fs.readFileSync(path.join(REPO, '_locales/ar/messages.json'), 'utf8'));
      await page.evaluate(() => chrome.storage.local.set({ scrapfly_language_override: 'ar' }));
      await open();
      assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
      const edge = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
        const [input, icon] = [rect('#settingsSearchInput'), rect('.settings-search-icon')];
        return { input: { left: input.left, right: input.right }, icon: { left: icon.left, right: icon.right }, placeholder: document.querySelector('#settingsSearchInput').placeholder };
      });
      assert.ok(edge.icon.left > (edge.input.left + edge.input.right) / 2, 'the magnifier is at the right in Arabic');
      assert.equal(edge.placeholder, arabic.settingsSearchPlaceholder.message);
      await type(arabic.cacheDuration.message);
      assert.equal(await shown('#cacheDuration'), true);
      const clearBox = await page.locator('#settingsSearchClear').boundingBox();
      const inputBox = await box.boundingBox();
      assert.ok(clearBox.x + clearBox.width / 2 < inputBox.x + inputBox.width / 2, 'the clear button is at the left in Arabic');
      await sleep(700);
      assert.match(await page.locator('#settingsSearchStatus').textContent(), new RegExp(arabic.settingsSearchCountFmt.message.split('{0}')[0].trim()));
      await shot('08-arabic');
      await page.keyboard.press('Escape');
      assert.equal(await box.inputValue(), '');
      await page.evaluate(() => chrome.storage.local.set({ scrapfly_language_override: 'auto' }));
    });

    await check('no script error on the way', async () => assert.deepEqual(errors, []));
  } finally {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  const failed = checks.filter(([, error]) => error);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
