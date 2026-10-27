#!/usr/bin/env node
/**
 * Rules → editor in another language than English (Spanish), end to end in the real extension (unpacked in Chromium):
 *
 *   Your language   an official rule's description and combination names show in Spanish; the English original is
 *                   not shown; with nothing to translate there is no bar
 *   Edit            typing a Spanish description and combination name saves them as the Spanish translations; the
 *                   English originals are unchanged
 *   Changes         a text rewritten in Spanish is counted on the bar ("Textos que cambiaste en Español: 1"); Translate
 *                   the changes puts the new wording into English (the new original) and every other language
 *
 * Chromium here may not have a working on-device Translator, so the page gets a stand-in with the same shape that
 * answers "[es>en] text" / "[en>de] text".
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:translate-local
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

const REPO = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const scenario = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`PASS ${name}`); } catch (error) { results.push(false); console.log(`FAIL ${name}\n     ${error.message}`); }
};

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'translate-local-')), {
    headless: true, channel: 'chromium', viewport: { width: 400, height: 600 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`] });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    // As Chrome and Brave do: a language in self.__notDownloaded is 'downloadable' and creating it needs a click, one
    // download per click (the click's activation is used up by the first)
    self.__notDownloaded = new Set();
    document.addEventListener('click', () => { self.__gesture = true; }, true);
    self.Translator = { availability: async ({ targetLanguage }) => self.__notDownloaded.has(targetLanguage) ? 'downloadable' : 'available',
      create: async ({ sourceLanguage, targetLanguage }) => {
        if (self.__notDownloaded.has(targetLanguage)) {
          if (!self.__gesture) throw new DOMException('Requires a user gesture', 'NotAllowedError');
          self.__gesture = false;
          self.__notDownloaded.delete(targetLanguage);
        }
        return { translate: async (text) => {
        if (self.__failTo === targetLanguage) throw new Error('not downloaded yet');
        return `[${sourceLanguage}>${targetLanguage}] ${text}`;
      }, destroy() {} };
      } };
  });
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.evaluate(async () => { await chrome.storage.local.set({ scrapfly_language_override: 'es' }); });
  await page.reload();
  await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { polling: 250, timeout: 20000 });
  await sleep(800);

  const openEditor = async () => {
    await page.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await page.waitForSelector('#rulesSearch', { state: 'visible' });
    await page.fill('#rulesSearch', 'Azure Front Door');
    await sleep(600);
    await page.$eval('.detector-card[data-detector-id="detect-azurefrontdoor"] .edit-btn', el => el.click());
    await page.waitForSelector('#saveRuleEdit', { state: 'visible' });
    await sleep(1200);
    await page.$$eval('#editRuleModal .card-toggle-btn[aria-expanded="false"]', buttons => buttons.forEach(b => b.click()));
    await sleep(500);
  };
  const stored = () => page.evaluate(async () => {
    const raw = (await chrome.storage.local.get('scrapfly_detectors')).scrapfly_detectors;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (data.data || data).detectors.antibot['detect-azurefrontdoor'];
  });
  // The header's Translate button: its state, and its hover text's first line says what it would do
  const bar = () => page.evaluate(() => {
    const button = document.querySelector('#ruleTranslateBtn');
    return { hidden: button.dataset.state === 'done', text: button.title.split('\n')[0],
      changes: button.dataset.state === 'changed', all: button.dataset.state === 'missing' };
  });
  const original = await stored();

  await scenario('Your language: Spanish texts in the fields, no English original, no Translations panel, the button says Translated (nothing to do)', async () => {
    await openEditor();
    const view = await page.evaluate(() => ({
      local: document.querySelector('#detectorDescriptionLocal').value, localHidden: document.querySelector('#detectorDescriptionLocal').hidden,
      originalShown: getComputedStyle(document.querySelector('#detectorDescriptionInput')).display !== 'none',
      translationsShown: !!document.querySelector('#detectorDescriptionTranslations').offsetParent,
      combo: document.querySelector('#combinationsContainer .combo-summary-name').value
    }));
    assert.equal(view.localHidden, false);
    assert.equal(view.originalShown, false, 'the English original is not shown: the text is edited in Spanish');
    assert.equal(view.translationsShown, false, 'no per-text Translations panel: the header button translates the rule');
    assert.ok(/^Edge de CDN/.test(view.local), `Spanish description: ${view.local}`);
    assert.ok(/^Cabecera de referencia/.test(view.combo), `Spanish combination name: ${view.combo}`);
    const b = await bar();
    assert.equal(b.changes, false);
    assert.equal(b.hidden, true, 'every text is translated: the button says Translated');
  });

  await scenario('Edit: what is typed in Spanish is saved as the Spanish translation, the originals stay', async () => {
    await page.fill('#detectorDescriptionLocal', 'Borde de Azure Front Door (texto propio)');
    await page.$eval('#saveRuleEdit', el => el.click());
    await page.waitForFunction(() => document.querySelector('#editRuleModal').style.display === 'none', null, { polling: 250, timeout: 15000 });
    const now = await stored();
    assert.equal(now.description, original.description, 'English description unchanged');
    assert.equal(now.descriptionI18n.es, 'Borde de Azure Front Door (texto propio)');
  });

  const closeEditor = async () => {
    await page.$eval('#cancelRuleEdit', el => el.click());
    await page.waitForFunction(() => document.querySelector('#editRuleModal').style.display === 'none', null, { polling: 250, timeout: 15000 });
    await sleep(300);
  };

  await scenario('Undo: a name or description changed and typed back as it was is no change, so there is nothing to translate', async () => {
    await openEditor();
    const before = await page.$eval('#combinationsContainer .combo-summary-name', el => el.value);
    await page.fill('#combinationsContainer .combo-summary-name', 'Otro nombre');
    await sleep(800);
    assert.equal((await bar()).changes, true, 'a real change is counted');
    await page.fill('#combinationsContainer .combo-summary-name', before);
    await sleep(800);
    const b = await bar();
    assert.equal(b.changes, false, `typed back: ${b.text}`);
    assert.equal(b.hidden, true, 'the button says Translated again');
    const description = await page.$eval('#detectorDescriptionLocal', el => el.value);
    await page.fill('#detectorDescriptionLocal', `${description} y más`);
    await sleep(800);
    assert.equal((await bar()).changes, true, 'a changed description is counted');
    await page.fill('#detectorDescriptionLocal', description);
    await sleep(800);
    assert.equal((await bar()).hidden, true, 'the description typed back: Translated again');
    await closeEditor();
  });

  await scenario('A language the browser cannot translate yet: Translate changes leaves that text as it was, nothing is lost', async () => {
    await openEditor();
    const before = await page.evaluate(() => JSON.parse(JSON.stringify(window.popupInstance.rules.combinationsModel[0])));
    await page.evaluate(() => { self.__failTo = 'de'; });
    await page.fill('#combinationsContainer .combo-summary-name', 'Cabecera con caché nueva');
    await sleep(800);
    await page.$eval('#ruleTranslateBtn', el => el.click());
    await sleep(1500);
    const after = await page.evaluate(() => JSON.parse(JSON.stringify(window.popupInstance.rules.combinationsModel[0])));
    await page.evaluate(() => { self.__failTo = null; });
    assert.equal(after.name, before.name, 'the English original is unchanged');
    for (const [code, text] of Object.entries(before.nameI18n || {})) {
      if (code !== 'es') assert.equal(after.nameI18n[code], text, `${code} keeps its translation`);
    }
    assert.equal((await bar()).changes, true, 'still counted, for another try');
    await closeEditor();
  });

  await scenario('Languages not downloaded yet: each click downloads one and says how many are ready; the click that downloads the last translates the change', async () => {
    await openEditor();
    const before = await page.evaluate(() => JSON.parse(JSON.stringify(window.popupInstance.rules.combinationsModel[0])));
    await page.evaluate(() => {
      self.__notDownloaded = new Set(['de', 'fr']);
      window.__notes = [];
      for (const kind of ['success', 'warning', 'info']) {
        const show = NotificationHelper[kind].bind(NotificationHelper);
        NotificationHelper[kind] = (message, ...rest) => { window.__notes.push(message); return show(message, ...rest); };
      }
    });
    await page.fill('#combinationsContainer .combo-summary-name', 'Cabecera descargada');
    await sleep(800);
    // English and the 20 other languages: German downloads on the first click (20 of 21 ready); the click that
    // downloads the last one (French) also translates the change
    for (const [language, ready] of [['Deutsch', 20]]) {
      await page.$eval('#ruleTranslateBtn', el => el.click());
      await sleep(1500);
      const notes = await page.evaluate(() => window.__notes);
      assert.match(notes[notes.length - 1] || '', new RegExp(`${language}.*${ready} de 21`), `the notice after a download: ${notes.join(' | ')}`);
      const now = await page.evaluate(() => window.popupInstance.rules.combinationsModel[0].name);
      assert.equal(now, before.name, 'nothing is applied while a language is missing');
      assert.equal((await bar()).changes, true, 'still to translate');
    }
    await page.$eval('#ruleTranslateBtn', el => el.click());
    await sleep(1500);
    const after = await page.evaluate(() => JSON.parse(JSON.stringify(window.popupInstance.rules.combinationsModel[0])));
    assert.equal(after.name, '[es>en] Cabecera descargada', 'every language ready: the change is translated');
    assert.equal(after.nameI18n.de, '[en>de] [es>en] Cabecera descargada');
    assert.equal((await bar()).changes, false);
    await closeEditor();
  });

  await scenario('Changes: a combination renamed in Spanish is counted, and one click translates it into English and every language', async () => {
    await openEditor();
    await page.fill('#combinationsContainer .combo-summary-name', 'Cabecera de referencia con caché');
    await sleep(800);
    const counted = await bar();
    assert.equal(counted.changes, true, `the bar offers Translate the changes: ${counted.text}`);
    assert.match(counted.text, /Español: 1/);
    await page.$eval('#ruleTranslateBtn', el => el.click());
    await sleep(1500);
    assert.equal((await bar()).changes, false, 'nothing changed is left');
    await page.$eval('#saveRuleEdit', el => el.click());
    await page.waitForFunction(() => document.querySelector('#editRuleModal').style.display === 'none', null, { polling: 250, timeout: 15000 });
    const combo = (await stored()).combinations[0];
    assert.equal(combo.name, '[es>en] Cabecera de referencia con caché', 'the new English original');
    assert.equal(combo.nameI18n.es, 'Cabecera de referencia con caché', 'what was typed stays');
    assert.equal(combo.nameI18n.de, '[en>de] [es>en] Cabecera de referencia con caché');
    assert.equal(Object.keys(combo.nameI18n).length, 21);
  });

  await ctx.close();
  if (pageErrors.length) console.log(`Page errors: ${pageErrors.join(' | ')}`);
  const ok = results.every(Boolean) && pageErrors.length === 0;
  console.log(ok ? `\nRESULT ALL PASS (${results.length} scenarios), no page errors` : `\nRESULT ${results.filter(r => !r).length} of ${results.length} FAILED`);
  process.exitCode = ok ? 0 : 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
