#!/usr/bin/env node
/**
 * Rules → editor texts in the real extension (unpacked in Chromium), with the interface in Spanish. A rule's
 * description, a pattern's description and a combination's name are one plain box each:
 *
 *   One box       the boxes show an official rule's texts in Spanish (the translations the extension ships); there is
 *                 no Translate button, no per-language fields and no "Original" panel
 *   Left alone    saving without touching a text keeps the rule exactly as it was: its English text, its translations,
 *                 not marked as edited
 *   Replaced      a text that is changed is saved as the text for every language (no translations left), and the
 *                 official rule is marked as edited
 *   Typed back    typing a text back to what the box showed is no change
 *   Pattern       the same in Pattern settings → Description
 *   Combination   the same for a combination's name
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:rule-texts
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
const RULE = 'detect-azurefrontdoor';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const scenario = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`PASS ${name}`); } catch (error) { results.push(false); console.log(`FAIL ${name}\n     ${error.message}`); }
};

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'rule-texts-')), {
    headless: true, channel: 'chromium', viewport: { width: 400, height: 600 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`] });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.evaluate(async () => { await chrome.storage.local.set({ scrapfly_language_override: 'es' }); });

  const loaded = async () => {
    await page.waitForFunction(() => window.popupInstance?.detectorManager?.initialized, null, { polling: 250, timeout: 20000 });
    await sleep(800);
  };
  await page.reload();
  await loaded();

  const stored = () => page.evaluate(async (id) => {
    const raw = (await chrome.storage.local.get('scrapfly_detectors')).scrapfly_detectors;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (data.data || data).detectors.antibot[id];
  }, RULE);
  // The rule as shipped, put back between scenarios
  const original = await stored();
  const restore = async () => {
    await page.evaluate(async ({ id, rule }) => {
      const raw = (await chrome.storage.local.get('scrapfly_detectors')).scrapfly_detectors;
      const asText = typeof raw === 'string';
      const data = asText ? JSON.parse(raw) : raw;
      (data.data || data).detectors.antibot[id] = rule;
      await chrome.storage.local.set({ scrapfly_detectors: asText ? JSON.stringify(data) : data });
    }, { id: RULE, rule: original });
    await page.reload();
    await loaded();
  };

  const openEditor = async () => {
    await page.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await page.waitForSelector('#rulesSearch', { state: 'visible' });
    await page.fill('#rulesSearch', 'Azure Front Door');
    await sleep(600);
    await page.$eval(`.detector-card[data-detector-id="${RULE}"] .edit-btn`, el => el.click());
    await page.waitForSelector('#saveRuleEdit', { state: 'visible' });
    await sleep(1200);
    await page.$$eval('#editRuleModal .card-toggle-btn[aria-expanded="false"]', buttons => buttons.forEach(b => b.click()));
    await sleep(500);
  };
  const save = async () => {
    await page.$eval('#saveRuleEdit', el => el.click());
    await page.waitForFunction(() => document.querySelector('#editRuleModal').style.display === 'none', null, { polling: 250, timeout: 15000 });
    await sleep(400);
  };
  const cancel = async () => {
    await page.$eval('#cancelRuleEdit', el => el.click());
    await page.waitForFunction(() => document.querySelector('#editRuleModal').style.display === 'none', null, { polling: 250, timeout: 15000 });
    await sleep(300);
  };
  const openPatternSettings = async () => {
    const section = '#editRuleModal .method-section[data-method-type="header"]';
    await page.evaluate((s) => document.querySelector(s)?.classList.remove('collapsed'), section);
    await page.$eval(`${section} .method-item .field-actions[data-field-type="name"] .method-action-btn.settings`, el => el.click());
    await page.waitForSelector('#methodSettingsModal', { state: 'visible' });
    await sleep(500);
  };
  const applyPatternSettings = async () => {
    await page.$eval('#saveMethodSettings', el => el.click());
    await sleep(500);
  };

  await scenario('One box: the texts show in Spanish; no Translate button, no per-language fields, no Original panel', async () => {
    await openEditor();
    const view = await page.evaluate(() => ({
      description: document.querySelector('#detectorDescriptionInput').value,
      combo: document.querySelector('#combinationsContainer .combo-summary-name').value,
      gone: ['#ruleTranslateBtn', '#detectorDescriptionLocal', '#detectorDescriptionTranslations', '.rule-translations', '.rule-original', '.combo-translations', '[data-rule-translate]']
        .filter(selector => document.querySelector(selector))
    }));
    assert.deepEqual(view.gone, [], `still in the editor: ${view.gone.join(', ')}`);
    assert.ok(/^Edge de CDN/.test(view.description), `Spanish description: ${view.description}`);
    assert.ok(/^Cabecera de referencia/.test(view.combo), `Spanish combination name: ${view.combo}`);
    assert.ok(await page.$eval('#detectorDescriptionInput', el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 40), 'the description box is there and tall enough');
  });

  await scenario('Left alone: saving without touching a text keeps the rule as it was (English text, translations, not edited)', async () => {
    await save();
    const now = await stored();
    assert.equal(now.description, original.description, 'the English description stays the English');
    assert.deepEqual(now.descriptionI18n, original.descriptionI18n);
    assert.deepEqual(now.combinations.map(c => [c.name, c.nameI18n]), original.combinations.map(c => [c.name, c.nameI18n]));
    assert.ok(!now.userModified && !now.officialSnapshot, 'not marked as edited');
    assert.equal(now.version, original.version);
  });

  await scenario('Replaced: a changed description is saved as the text for every language, and the official rule is marked as edited', async () => {
    await openEditor();
    await page.fill('#detectorDescriptionInput', 'Mi descripción escrita en español');
    await sleep(300);
    await save();
    const now = await stored();
    assert.equal(now.description, 'Mi descripción escrita en español');
    assert.equal(now.descriptionI18n, undefined, 'no translations of the old text are left');
    assert.equal(now.userModified, true);
    assert.equal(now.officialSnapshot.description, original.description, 'Reset to official has the original');
    await restore();
  });

  await scenario('Typed back: changing the description and typing back what the box showed is no change', async () => {
    await openEditor();
    const shown = await page.$eval('#detectorDescriptionInput', el => el.value);
    await page.fill('#detectorDescriptionInput', 'otra cosa');
    await sleep(200);
    await page.fill('#detectorDescriptionInput', `  ${shown.replace(/ /g, '  ')} `);
    await sleep(200);
    await save();
    const now = await stored();
    assert.equal(now.description, original.description);
    assert.ok(!now.userModified, 'not marked as edited');
  });

  await scenario('Combination: a changed name is saved for every language; typing the shown name back changes nothing', async () => {
    await openEditor();
    const first = await page.$eval('#combinationsContainer .combo-summary-name', el => el.value);
    await page.fill('#combinationsContainer .combo-summary-name', 'Mi combinación');
    await sleep(200);
    await page.fill('#combinationsContainer .combo-summary-name', first);
    await sleep(200);
    await save();
    let now = await stored();
    assert.deepEqual(now.combinations.map(c => c.name), original.combinations.map(c => c.name), 'typed back: the original names');
    assert.ok(!now.userModified, 'not marked as edited');

    await openEditor();
    await page.fill('#combinationsContainer .combo-summary-name', 'Mi combinación');
    await sleep(200);
    await save();
    now = await stored();
    assert.equal(now.combinations[0].name, 'Mi combinación');
    assert.equal(now.combinations[0].nameI18n, undefined);
    assert.equal(now.userModified, true);
    await restore();
  });

  await scenario('Pattern: Pattern settings → Description shows Spanish; left alone it keeps the rule; changed it replaces the text', async () => {
    const englishPattern = original.detection.header[0].description;
    await openEditor();
    await openPatternSettings();
    const shown = await page.$eval('#methodDescriptionInput', el => el.value);
    assert.ok(shown && shown !== englishPattern, `shows the Spanish text: ${shown}`);
    assert.equal(await page.$('#methodDescriptionLocal'), null);
    assert.equal(await page.$('#methodDescriptionTranslations'), null);
    await applyPatternSettings();
    await save();
    let now = await stored();
    assert.equal(now.detection.header[0].description, englishPattern, 'left alone: the English text stays');
    assert.ok(!now.userModified, 'not marked as edited');

    await openEditor();
    await openPatternSettings();
    await page.fill('#methodDescriptionInput', 'Mi patrón');
    await applyPatternSettings();
    await save();
    now = await stored();
    assert.equal(now.detection.header[0].description, 'Mi patrón');
    assert.equal(now.detection.header[0].descriptionI18n, undefined);
    assert.equal(now.userModified, true);
    await restore();
  });

  await ctx.close();
  if (pageErrors.length) console.log(`Page errors: ${pageErrors.join(' | ')}`);
  const ok = results.every(Boolean) && pageErrors.length === 0;
  console.log(ok ? `\nRESULT ALL PASS (${results.length} scenarios), no page errors` : `\nRESULT ${results.filter(r => !r).length} of ${results.length} FAILED`);
  process.exitCode = ok ? 0 : 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
