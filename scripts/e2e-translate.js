#!/usr/bin/env node
/**
 * Rules → editor → "Translate the rule", end to end in the real extension (unpacked in Chromium):
 *
 *   Official rule   every text of a shipped rule has its translations, so the bar stays hidden
 *   New texts       a changed description, a new pattern description and a new combination name are noticed as they are
 *                   written: the bar counts them and offers one button
 *   One click       every language missing for every text is filled: the description's Translations fields, the pattern's
 *                   translations and the combination's name translations; the bar says how many, and goes once they are covered
 *   Save            the fills are stored with the rule like typed ones, and a reopened editor has nothing missing
 *   Unavailable     without Chrome's Translator the bar still says what is missing, and the button is off
 *
 * Chromium here may not have a working on-device Translator (a language model download), so the page gets a stand-in with
 * the same shape: create({ sourceLanguage, targetLanguage }) → { translate(text), destroy() }, answering "[de] text".
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:translate [-- --shots /tmp/shots]
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const shotsAt = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : '';
const REPO = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--shots') || path.join(__dirname, '..'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const LOCALES = ['ar', 'cs', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pl', 'pt_BR', 'ru', 'sv', 'th', 'tr', 'uk', 'vi', 'zh_CN', 'zh_TW'];

const STAND_IN = `(() => {
  globalThis.__translated = [];
  globalThis.Translator = { create: async ({ sourceLanguage, targetLanguage }) => ({
    translate: async (text) => { __translated.push([targetLanguage, text]); return '[' + targetLanguage + '] ' + text; },
    destroy() {}
  }) };
})()`;

(async () => {
  if (shotsAt) fs.mkdirSync(shotsAt, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-translate-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
      args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await sleep(2500);
    const errors = [];
    const waitFor = async (check, what, timeout = 20000) => {
      const end = Date.now() + timeout;
      for (;;) {
        if (await check()) return;
        if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
        await sleep(200);
      }
    };
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { polling: 250 });
    await page.evaluate(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
    await page.reload();
    await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { polling: 250 });

    const openEditor = async () => {
      await page.$eval('.tab-btn[data-tab="rules"]', el => el.click());
      await page.waitForSelector('#rulesSearch', { state: 'visible' });
      await page.fill('#rulesSearch', 'CHEQ');
      const edit = '.detector-card[data-detector-id="detect-cheq"] .edit-btn';
      await page.waitForSelector(edit, { state: 'attached' });
      await page.$eval(edit, el => el.click());
      await page.waitForSelector('#saveRuleEdit', { state: 'visible' });
      await sleep(1000);
    };
    // The header's Translate button: 'done' when nothing is left; its hover text's first line says what is missing, and
    // a run's result is a notice (recorded here as it is shown)
    const bar = () => page.evaluate(() => {
      if (!window.__notes) {
        window.__notes = [];
        for (const kind of ['success', 'warning', 'info']) {
          const show = NotificationHelper[kind].bind(NotificationHelper);
          NotificationHelper[kind] = (message, ...rest) => { window.__notes.push(message); return show(message, ...rest); };
        }
      }
      const button = document.querySelector('#ruleTranslateBtn');
      const done = button.dataset.state === 'done';
      const note = window.__notes[window.__notes.length - 1];
      return { hidden: done, state: button.dataset.state, text: done && note ? note : button.title.split('\n')[0],
        button: { hidden: done, disabled: button.disabled, title: button.title } };
    });
    const barIs = async (check, what) => {
      try { await waitFor(async () => check(await bar()), what); } catch (error) { throw new Error(`${error.message}; the bar was ${JSON.stringify(await bar())}`); }
    };

    // 1. An official rule is translated into every language already
    await openEditor();
    await sleep(800);
    assert.equal((await bar()).hidden, true, 'a shipped rule misses no translation: nothing to do, no bar');
    console.log('PASS Official rule: every text of CHEQ has its translations, so the bar stays hidden');

    // 2. New texts are noticed as they are written
    await page.evaluate(STAND_IN);
    await page.fill('#detectorDescriptionInput', 'A brand-new description of this protection');
    await barIs(b => !b.hidden && /: 1$/.test(b.text), 'the bar for the new description');
    await page.evaluate(() => {
      const rules = window.popupInstance.rules;
      rules.combinationsModel[0].name = 'A brand-new combination name';
      rules.renderCombinations();
      const item = document.querySelector('#editRuleModal .method-item');
      item.dataset.description = 'A brand-new pattern description';
      item.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.$eval('#detectorDescriptionInput', el => el.dispatchEvent(new Event('input', { bubbles: true })));
    await barIs(b => !b.hidden && b.text === 'Texts not yet translated into every language: 3', 'the bar counting three texts');
    const waiting = await bar();
    assert.equal(waiting.button.hidden, false);
    assert.equal(waiting.button.disabled, false);
    assert.match(waiting.button.title, /on-device translator/);
    if (shotsAt) { await page.$eval('#ruleTranslateBtn', el => el.scrollIntoView({ block: 'start' })); await page.screenshot({ path: path.join(shotsAt, 'translate-bar.png') }); }
    console.log('PASS New texts: a changed description, a new pattern description and a new combination name are counted as they are written');

    // 3. One click fills every language of every text
    await page.$eval('#ruleTranslateBtn', el => el.click());
    await barIs(b => /^Filled 63 translations\. Check them before saving\.$/.test(b.text), 'the result of the translation');
    const filled = await page.evaluate(() => {
      const rules = window.popupInstance.rules;
      const description = [...document.querySelectorAll('#detectorTranslationFields .rule-translation-input')].map(input => [input.dataset.locale, input.value]);
      const item = document.querySelector('#editRuleModal .method-item');
      return {
        description,
        pattern: JSON.parse(item.dataset.descriptionI18n || '{}'),
        combination: rules.combinationsModel[0].nameI18n,
        asked: [...new Set(globalThis.__translated.map(([to]) => to))].length,
        calls: globalThis.__translated.length
      };
    });
    assert.deepEqual(filled.description.map(([locale]) => locale), LOCALES);
    assert.ok(filled.description.every(([locale, value]) => value === `[${locale === 'pt_BR' ? 'pt' : locale === 'zh_CN' ? 'zh' : locale === 'zh_TW' ? 'zh-Hant' : locale}] A brand-new description of this protection`), 'the description is in every language');
    assert.equal(Object.keys(filled.pattern).length, 21);
    assert.equal(Object.keys(filled.combination).length, 21);
    assert.equal(filled.asked, 21);
    assert.equal(filled.calls, 63, 'one translator per language, three texts each');
    assert.ok((await bar()).button.hidden, 'nothing left to translate');
    if (shotsAt) await page.screenshot({ path: path.join(shotsAt, 'translate-done.png') });
    // A click anywhere in the editor clears the result
    await page.$eval('#editRuleModal .rule-modal-body', el => el.click());
    await barIs(b => b.hidden, 'the bar going away');
    console.log('PASS One click: 21 languages for 3 texts, in the description, the pattern and the combination, and the bar goes once they are covered');

    // 4. Save stores them like typed ones; a reopened editor misses nothing
    await page.$eval('#saveRuleEdit', el => el.click());
    await page.waitForFunction(() => document.querySelector('#editRuleModal').style.display === 'none', null, { polling: 250, timeout: 15000 });
    const stored = await page.evaluate(async () => {
      const raw = (await chrome.storage.local.get('scrapfly_detectors')).scrapfly_detectors;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const detector = (parsed.data || parsed).detectors.antibot['detect-cheq'];
      const pattern = Object.values(detector.detection).flat().find(rule => rule && rule.description === 'A brand-new pattern description');
      return {
        description: detector.description, descriptionLocales: Object.keys(detector.descriptionI18n || {}).length,
        patternLocales: pattern ? Object.keys(pattern.descriptionI18n || {}).length : -1,
        comboLocales: Object.keys((detector.combinations.find(c => c.name === 'A brand-new combination name') || {}).nameI18n || {}).length
      };
    });
    assert.deepEqual(stored, { description: 'A brand-new description of this protection', descriptionLocales: 21, patternLocales: 21, comboLocales: 21 });
    await openEditor();
    await sleep(800);
    assert.equal((await bar()).hidden, true, 'every language is covered by what was saved');
    console.log('PASS Save: the translations are stored with the rule, and a reopened editor misses nothing');

    // 5. Without the translator the bar says what is missing and the button is off
    // (a text that already carries translations typed in the rule counts as translated, whatever it says now: only a
    // text with none, like this new name, is missing)
    await page.evaluate(() => {
      delete globalThis.Translator;
      const rules = window.popupInstance.rules;
      rules.combinationsModel[1].name = 'Yet another combination name';
      rules.renderCombinations();
    });
    await page.$eval('#detectorDescriptionInput', el => el.dispatchEvent(new Event('input', { bubbles: true })));
    await barIs(b => !b.hidden && /: 1$/.test(b.text), 'the bar without a translator');
    const off = await bar();
    assert.equal(off.button.disabled, true);
    assert.match(off.button.title, /Chrome 138 or newer/);
    console.log('PASS Unavailable: without Chrome\'s Translator the bar still counts what is missing, and the button is off');

    assert.deepEqual(errors, [], 'no page errors');
    console.log('RESULT ALL PASS, no page errors');
  } finally {
    try { if (context) await context.close(); } finally { fs.rmSync(profile, { recursive: true, force: true }); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
