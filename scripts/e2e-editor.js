#!/usr/bin/env node
/**
 * Rule editor end to end, in the real popup (unpacked extension in Chromium).
 *
 * 1. Settings round trip: open a rule's Method Settings, change scope /
 *    regex / whole word / case / scripts-only / payload filters with real
 *    clicks, save, and check the stored rule and the reopened window.
 * 2. Nothing lost on save: open every shipped detector in the editor, save
 *    without changes, and diff every rule field and combination (key order
 *    inside a combination does not count).
 * 3. Combination groups: add a "one of" group to a reCAPTCHA combination,
 *    save, delete it and check the combination is back as shipped; change a
 *    group's mode and back; delete a group and check it is gone.
 * 4. Help: Test pattern opens with the pattern and options being edited,
 *    matches like detection, and its Apply only lands with the settings'
 *    Apply (Cancel keeps the rule); the DOM settings' "Browse" works the
 *    same way; every method's "?" opens its cheat sheet with real examples.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   npm run e2e:editor
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

const REPO = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// JSON with sorted object keys: the editor writes id, name, confidence, when
const canon = (value) => JSON.stringify(value, (key, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));
let failures = 0;
const report = (ok, line) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`); };

// [detector, category, method section, search text, field (name|value), changes, expected stored fields]
const CASES = [
  ['detect-netacea', 'antibot', 'cookie', 'Netacea', 'name',
    { selects: { nameScope: 'response' }, checks: { nameRegex: false, nameWholeWord: true, nameCaseSensitive: true } },
    { nameScope: 'response', nameRegex: false, nameWholeWord: true, nameCaseSensitive: true }],
  ['detect-jiasule', 'antibot', 'header', 'Jiasule', 'name',
    { selects: { nameScope: 'all' }, checks: { nameCaseSensitive: true } },
    { nameScope: 'all', nameCaseSensitive: true }],
  ['detect-jiasule', 'antibot', 'header', 'Jiasule', 'value',
    { selects: { valueScope: 'request' }, checks: { valueRegex: false, valueWholeWord: true, valueCaseSensitive: true } },
    { valueScope: 'request', valueRegex: false, valueWholeWord: true, valueCaseSensitive: true }],
  ['detect-yidun', 'captcha', 'url', 'NetEase Yidun', 'name',
    { selects: { textScope: 'page_only' }, checks: { nameRegex: false, nameCaseSensitive: true, nameWholeWord: true } },
    { textScope: 'page_only', textRegex: false, textCaseSensitive: true, textWholeWord: true }],
  ['detect-yidun', 'captcha', 'content', 'NetEase Yidun', 'name',
    { checks: { checkScripts: false, nameCaseSensitive: true } },
    { checkScripts: false, textCaseSensitive: true }],
  ['detect-akamai', 'antibot', 'payload', 'Akamai', 'name',
    { radio: 'payloadMethodPost', fills: { payloadUrlPattern: '/_bm/data' }, checks: { payloadUrlRegex: true, payloadUrlCaseSensitive: true } },
    { methods: ['POST'], urlPattern: '/_bm/data', urlRegex: true, urlCaseSensitive: true }]
];

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-editor-')), {
    headless: true, channel: 'chromium', viewport: { width: 400, height: 580 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await sleep(2500);
  const p = await ctx.newPage();
  // Direct DOM clicks: Playwright's "stable" wait sometimes never settles in
  // this popup, which would make the check flaky without testing anything
  const click = async (selector) => {
    const sel = selector.replace(/ >> nth=0$/, '');
    await p.waitForSelector(sel, { state: 'attached', timeout: 15000 });
    await p.$eval(sel, el => el.click());
  };
  p.on('pageerror', e => { failures++; console.log('PAGE ERROR', e.message); });

  const stored = async (cat, id) => p.evaluate(async ([c, i]) => {
    const raw = (await chrome.storage.local.get('scrapfly_detectors')).scrapfly_detectors;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (parsed.data || parsed).detectors[c][i];
  }, [cat, id]);
  const openEditor = async (id, searchText) => {
    await p.goto(`chrome-extension://${extId}/popup.html`);
    await p.waitForFunction(() => window.popupInstance, null, { timeout: 15000 });
    await sleep(700);
    await p.waitForSelector('.tab-btn[data-tab="rules"]', { state: 'visible', timeout: 30000 });
    // Direct click: Playwright's "stable" wait on the tab bar sometimes never
    // settles right after the popup opens
    await p.$eval('.tab-btn[data-tab="rules"]', el => el.click());
    await p.waitForSelector('#rulesSearch', { state: 'visible' });
    await p.fill('#rulesSearch', searchText);
    await sleep(500);
    const editBtn = `.detector-card[data-detector-id="${id}"] .edit-btn`;
    await p.waitForSelector(editBtn, { state: 'attached', timeout: 15000 });
    await p.$eval(editBtn, el => el.click());
    await p.waitForSelector('#saveRuleEdit', { state: 'visible' });
    await sleep(500);
  };
  const openSettings = async (method, field) => {
    const section = `#editRuleModal .method-section[data-method-type="${method}"]`;
    await p.evaluate((s) => document.querySelector(s)?.classList.remove('collapsed'), section);
    await click(`${section} .method-item .field-actions[data-field-type="${field}"] .method-action-btn.settings >> nth=0`);
    await p.waitForSelector('#methodSettingsModal', { state: 'visible' });
    await sleep(300);
  };

  // ---------------------------------------------------- 1. settings round trip
  await p.goto(`chrome-extension://${extId}/popup.html`);
  await p.waitForFunction(async () => Boolean((await chrome.storage.local.get('scrapfly_detectors')).scrapfly_detectors), null, { timeout: 20000, polling: 500 });
  console.log('Settings round trip');
  for (const [id, cat, method, search, field, change, expect] of CASES) {
    const before = await stored(cat, id);
    const firstRule = before.detection[method][0];
    await openEditor(id, search);
    await openSettings(method, field);
    for (const [sel, val] of Object.entries(change.selects || {})) await p.selectOption(`#${sel}`, val);
    for (const [cb, want] of Object.entries(change.checks || {})) {
      if (await p.$eval(`#${cb}`, e => e.checked) !== want) await p.$eval(`#${cb}`, e => e.click());
    }
    for (const [f, val] of Object.entries(change.fills || {})) await p.fill(`#${f}`, val);
    if (change.radio) await p.$eval(`#${change.radio}`, e => e.click());
    await click('#saveMethodSettings');
    await sleep(300);
    await click('#saveRuleEdit');
    await sleep(1500);

    const rule = (await stored(cat, id)).detection[method].find(r => r.id === firstRule.id);
    // A missing flag reads as off: the engine only acts on `=== true`
    const norm = (v) => (v === undefined ? false : v);
    const wrong = rule ? Object.entries(expect).filter(([k, v]) => JSON.stringify(norm(rule[k])) !== JSON.stringify(norm(v))) : [['rule', 'missing']];
    report(wrong.length === 0, `${id} ${method} ${field} settings saved` +
      (wrong.length ? ` — ${wrong.map(([k, v]) => `${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(rule?.[k])}`).join('; ')}` : ''));

    await openEditor(id, search);
    await openSettings(method, field);
    const want = { ...(change.selects || {}), ...(change.checks || {}), ...(change.fills || {}), ...(change.radio ? { [change.radio]: true } : {}) };
    const shown = await p.evaluate((keys) => Object.fromEntries(keys.map(k => {
      const el = document.querySelector('#' + k);
      return [k, el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value];
    })), Object.keys(want));
    const off = Object.entries(want).filter(([k, v]) => shown[k] !== v);
    report(off.length === 0, `${id} ${method} ${field} settings shown again when reopened` +
      (off.length ? ` — ${off.map(([k, v]) => `${k}: expected ${v}, shown ${shown[k]}`).join('; ')}` : ''));
  }

  // ------------------------------------------------- 2. nothing lost on save
  console.log('\nSave without changes keeps every field');
  const index = JSON.parse(fs.readFileSync(path.join(REPO, 'detectors/index.json'), 'utf8'));
  const editedAbove = new Set(CASES.map(c => c[0]));
  for (const [cat, entry] of Object.entries(index)) {
    if (!entry || !Array.isArray(entry.detectors)) continue;
    for (const id of entry.detectors) {
      if (editedAbove.has(id)) continue;
      const before = await stored(cat, id);
      if (!before) { report(false, `${id}: not in storage`); continue; }
      await openEditor(id, before.name);
      await click('#saveRuleEdit');
      await sleep(900);
      const after = await stored(cat, id);
      const diffs = [];
      for (const [method, rules] of Object.entries(before.detection || {})) {
        for (const r of rules) {
          const a = (after.detection?.[method] || []).find(x => x.id === r.id);
          if (!a) { diffs.push(`${method}/${r.id} removed`); continue; }
          for (const k of new Set([...Object.keys(r), ...Object.keys(a)])) {
            // Equivalent spellings the editor normalises: false flags dropped,
            // standalone true dropped, scope "scripts" carried as checkScripts
            if (JSON.stringify(a[k]) === JSON.stringify(r[k])) continue;
            if (a[k] === undefined && (r[k] === false || (k === 'standalone' && r[k] === true))) continue;
            if (r[k] === undefined && k === 'checkScripts' && a[k] === true && r.scope === 'scripts') continue;
            diffs.push(`${method}/${r.id}.${k}: ${JSON.stringify(r[k])} → ${JSON.stringify(a[k])}`);
          }
        }
      }
      if (canon(before.combinations || []) !== canon(after.combinations || [])) diffs.push('combinations changed');
      report(diffs.length === 0, `${id}` + (diffs.length ? `\n      ${diffs.slice(0, 6).join('\n      ')}${diffs.length > 6 ? `\n      … ${diffs.length - 6} more` : ''}` : ''));
    }
  }

  // ---------------------------------------------- 3. combination groups
  console.log('\nCombination groups');
  {
    const id = 'detect-recaptcha';
    const combos = (await stored('captcha', id)).combinations;
    const index = combos.findIndex(c => c.id === 'sdk-widget-api');
    const shipped = combos[index];
    const groupPath = String(shipped.when.all.findIndex(node => Array.isArray(node.any)));
    const card = `#combinationsContainer .combo-card[data-combo="${index}"]`;
    const group = `${card} .combo-group[data-path="${groupPath}"]`;
    const reopen = async () => { await openEditor(id, 'reCAPTCHA'); await click(`${card} .combo-toggle`); };

    // A new "one of" group with two patterns, saved and then removed again
    await reopen();
    await click(`${card} [data-combo-action="add-group"]`);
    await sleep(300);
    report(await p.evaluate(() => document.activeElement?.classList.contains('combo-picker-search')), 'adding a group opens its picker with the search focused');
    const newPath = String(shipped.when.all.length);
    for (const pick of ['configured-sdk', 'configured-enterprise-sdk']) await click(`${card} .combo-picker [data-value="pattern:${pick}"]`);
    await click(`${card} .combo-picker-add`);
    await sleep(300);
    await click('#saveRuleEdit');
    await sleep(1500);
    const added = (await stored('captcha', id)).combinations.find(c => c.id === shipped.id);
    report(canon(added?.when) === canon({ all: [...shipped.when.all, { any: [{ pattern: 'configured-sdk' }, { pattern: 'configured-enterprise-sdk' }] }] }), 'the new group is saved');
    await reopen();
    await click(`${card} .combo-group[data-path="${newPath}"] [data-combo-action="delete-group"]`);
    await sleep(300);
    await click('#saveRuleEdit');
    await sleep(1500);
    const removed = (await stored('captcha', id)).combinations.find(c => c.id === shipped.id);
    report(canon(removed?.when) === canon(shipped.when), 'deleting it gives the combination as shipped');

    await reopen();
    await p.selectOption(`${group} select[data-combo-action="mode"]`, 'all');
    await sleep(300);
    await click('#saveRuleEdit');
    await sleep(1500);
    const changed = (await stored('captcha', id)).combinations.find(c => c.id === shipped.id);
    report(Array.isArray(changed?.when?.all?.[Number(groupPath)]?.all), 'the group saved as "All of these"');

    await reopen();
    await p.selectOption(`${group} select[data-combo-action="mode"]`, 'any');
    await sleep(300);
    await click('#saveRuleEdit');
    await sleep(1500);
    const restored = (await stored('captcha', id)).combinations.find(c => c.id === shipped.id);
    report(canon(restored?.when) === canon(shipped.when), 'switching back gives the combination as shipped');

    await reopen();
    await click(`${group} [data-combo-action="delete-group"]`);
    await sleep(300);
    const focused = await p.evaluate(() => document.activeElement?.dataset?.comboAction === 'open-picker');
    report(focused, 'deleting a group moves focus to "+ Add pattern"');
    await click('#saveRuleEdit');
    await sleep(1500);
    const deleted = (await stored('captcha', id)).combinations.find(c => c.id === shipped.id);
    const expected = { all: shipped.when.all.filter((_, i) => i !== Number(groupPath)) };
    report(canon(deleted?.when) === canon(expected), 'the group is gone from the saved combination');
  }

  // ------------------------------------------------------------- 4. help
  console.log('\nHelp: Test pattern, DOM selector card, method help');
  {
    const cookieRule = async () => (await stored('antibot', 'detect-akamai')).detection.cookie.find(r => r.id === 'abck-sensor-cookie');
    const shipped = await cookieRule();
    const rowIndex = async () => p.evaluate(() => [...document.querySelectorAll('#editRuleModal .method-section[data-method-type="cookie"] .method-item')]
      .findIndex(item => item.dataset.patternId === 'abck-sensor-cookie'));
    const openCookieSettings = async () => {
      await openEditor('detect-akamai', 'Akamai');
      const section = '#editRuleModal .method-section[data-method-type="cookie"]';
      await p.evaluate((sel) => document.querySelector(sel)?.classList.remove('collapsed'), section);
      const index = await rowIndex();
      await p.evaluate(([sel, i]) => {
        const items = document.querySelectorAll(`${sel} .method-item`);
        items[i].querySelector('.field-actions[data-field-type="name"] .method-action-btn.settings').click();
      }, [section, index]);
      await p.waitForSelector('#methodSettingsModal', { state: 'visible' });
      await sleep(300);
    };

    await openCookieSettings();
    await click('[data-pattern-test="name"]');
    await p.waitForSelector('#patternTesterModal', { state: 'visible' });
    await sleep(300);
    const opened = await p.evaluate(() => ({
      title: document.querySelector('#patternTesterTitle').textContent,
      pattern: document.querySelector('#ptPattern').value,
      says: document.querySelector('#ptSays').textContent,
      results: [...document.querySelectorAll('#ptResults .pt-result')].map(r => [r.querySelector('.pt-sample').textContent, r.classList.contains('is-match')])
    }));
    report(/Cookie name/.test(opened.title) && opened.pattern === shipped.name, `the tester opens on the pattern being edited — ${opened.title}: ${opened.pattern}`);
    const expected = JSON.stringify([['_abck', true], ['x_abck', false], ['_abck_2', true], ['_ABCK', true]]);
    report(JSON.stringify(opened.results) === expected && /start with/.test(opened.says),
      `a plain cookie name matches as a prefix, like detection — ${JSON.stringify(opened.results)}`);

    await p.fill('#ptPattern', '^_abck$');
    await click('#patternTesterModal .pt-option[data-option="regex"]');
    await sleep(200);
    const asRegex = await p.$$eval('#ptResults .pt-result', rows => rows.map(r => r.classList.contains('is-match')));
    report(JSON.stringify(asRegex) === JSON.stringify([true, false, false, true]), `with Regex ^_abck$ only the exact name matches — ${JSON.stringify(asRegex)}`);
    await click('#applyPatternTester');
    await sleep(300);
    const handedBack = await p.evaluate(() => ({ regex: document.querySelector('#nameRegex').checked, preview: document.querySelector('[data-pattern-preview="name"]').textContent }));
    report(handedBack.regex && handedBack.preview === '^_abck$', 'Apply hands the pattern and Regex back to the settings');

    await click('#cancelMethodSettings');
    await sleep(300);
    const rowAfterCancel = await p.evaluate(() => document.querySelector('#editRuleModal .method-section[data-method-type="cookie"] .method-item[data-pattern-id="abck-sensor-cookie"] .method-input.method-name').value);
    report(rowAfterCancel === shipped.name, 'Cancel in the settings keeps the rule as it was');
    await click('#saveRuleEdit');
    await sleep(1500);
    const afterCancel = await cookieRule();
    report(afterCancel.name === shipped.name && afterCancel.nameRegex === shipped.nameRegex, 'and nothing changed in storage');

    await openCookieSettings();
    await click('[data-pattern-test="name"]');
    await p.waitForSelector('#patternTesterModal', { state: 'visible' });
    await p.fill('#ptPattern', '^_abck$');
    await click('#patternTesterModal .pt-option[data-option="regex"]');
    await click('#applyPatternTester');
    await sleep(200);
    await click('#saveMethodSettings');
    await sleep(300);
    await click('#saveRuleEdit');
    await sleep(1500);
    const applied = await cookieRule();
    report(applied.name === '^_abck$' && applied.nameRegex === true, `Apply in the settings saves it — ${applied.name}, regex ${applied.nameRegex}`);

    // DOM: the selector helper lives in the settings ("Browse")
    const domRule = async () => (await stored('captcha', 'detect-recaptcha')).detection.dom.find(r => r.id === 'configured-widget');
    const domShipped = await domRule();
    const openDomSettings = async () => {
      await openEditor('detect-recaptcha', 'reCAPTCHA');
      await openSettings('dom', 'name');
    };
    await openDomSettings();
    const domCard = await p.evaluate(() => ({
      card: getComputedStyle(document.querySelector('#domSelectorGroup')).display !== 'none',
      options: getComputedStyle(document.querySelector('#nameFieldOptionsGroup')).display !== 'none',
      rowHelper: !!document.querySelector('#editRuleModal .dom-helper-btn')
    }));
    report(domCard.card && !domCard.options && !domCard.rowHelper, 'DOM settings show the CSS selector card, no Regex / Whole word / Case, no "?" on the row');
    // Pick a selector other than the current one (the list opens on its page)
    const pickOther = async () => {
      await click('[data-dom-browse]');
      await p.waitForSelector('#domHelperModal', { state: 'visible' });
      await p.evaluate((current) => {
        const rows = [...document.querySelectorAll('#domSuggestions .rh-row')];
        (rows.find(r => r.querySelector('.rh-row-value').textContent.trim() !== current) || rows[0]).click();
      }, domShipped.selector);
      return p.$eval('#domPreviewContent', el => el.textContent.trim());
    };
    const picked = await pickOther();
    report(picked && picked !== domShipped.selector, `the helper opened from the settings picks another selector — ${picked}`);
    await click('#useDomSelector');
    await sleep(200);
    await click('#cancelMethodSettings');
    await sleep(200);
    await click('#saveRuleEdit');
    await sleep(1500);
    report((await domRule()).selector === domShipped.selector, 'a picked selector is dropped by Cancel');
    await openDomSettings();
    const pickedAgain = await pickOther();
    await click('#useDomSelector');
    await sleep(200);
    await click('#saveMethodSettings');
    await sleep(200);
    await click('#saveRuleEdit');
    await sleep(1500);
    report((await domRule()).selector === pickedAgain, `and saved by Apply — ${pickedAgain}`);

    // Method help: a cheat sheet per method, closed by Escape, one blur
    await openEditor('detect-recaptcha', 'reCAPTCHA');
    for (const method of ['url', 'header', 'cookie', 'content', 'dom', 'js_hooks', 'window', 'payload']) {
      await click(`#editRuleModal .method-section[data-method-type="${method}"] .method-help-btn`);
      await p.waitForSelector('#methodHelpModal', { state: 'visible' });
      const help = await p.evaluate(() => ({
        title: document.querySelector('#methodHelpTitle').textContent,
        examples: document.querySelectorAll('#methodHelpContent .mh-examples .rh-row').length,
        sections: document.querySelectorAll('#methodHelpContent .rh-section').length,
        footer: !!document.querySelector('#methodHelpModal .rule-modal-footer'),
        editorBlur: getComputedStyle(document.querySelector('#editRuleModal .rule-modal-backdrop')).display
      }));
      await p.keyboard.press('Escape');
      await sleep(200);
      const closed = await p.evaluate(() => getComputedStyle(document.querySelector('#methodHelpModal')).display === 'none'
        && getComputedStyle(document.querySelector('#editRuleModal .rule-modal-backdrop')).display !== 'none');
      report(help.title && help.examples >= 3 && help.sections === 3 && !help.footer && help.editorBlur === 'none' && closed,
        `${method}: "${help.title}", ${help.examples} real examples, Escape closes it`);
    }
  }

  console.log(`\nRESULT ${failures ? failures + ' FAILED' : 'ALL PASS'}`);
  await ctx.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
