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
 *    change its mode, save and check the stored tree; delete it, save, and
 *    check the combination is back as shipped.
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
    const card = '#combinationsContainer .combo-card[data-combo="0"]';
    const shipped = (await stored('captcha', id)).combinations[0];
    await openEditor(id, 'reCAPTCHA');
    await click(`${card} .combo-toggle`);
    await click(`${card} [data-combo-action="add-group"]`);
    await sleep(300);
    const focused = await p.evaluate(() => document.activeElement?.classList.contains('combo-picker-search'));
    report(focused, 'adding a group opens its picker with the search focused');
    for (const pick of ['standard-render-api', 'standard-execute-api']) await click(`${card} .combo-picker [data-value="pattern:${pick}"]`);
    await click(`${card} .combo-picker-add`);
    await sleep(300);
    const groupPath = String(shipped.when.all.length);
    await p.selectOption(`${card} .combo-group[data-path="${groupPath}"] select[data-combo-action="mode"]`, 'all');
    await sleep(300);
    await click('#saveRuleEdit');
    await sleep(1500);
    const withGroup = (await stored('captcha', id)).combinations.find(c => c.id === shipped.id);
    const expected = { all: [...shipped.when.all, { all: [{ pattern: 'standard-render-api' }, { pattern: 'standard-execute-api' }] }] };
    report(canon(withGroup?.when) === canon(expected), `group saved as ${JSON.stringify(withGroup?.when)}`);

    await openEditor(id, 'reCAPTCHA');
    await click(`${card} .combo-toggle`);
    await click(`${card} .combo-group[data-path="${groupPath}"] [data-combo-action="delete-group"]`);
    await sleep(300);
    const focusedAfterDelete = await p.evaluate(() => document.activeElement?.dataset?.comboAction === 'add-group');
    report(focusedAfterDelete, 'deleting a group moves focus to "Add group"');
    await click('#saveRuleEdit');
    await sleep(1500);
    const back = (await stored('captcha', id)).combinations.find(c => c.id === shipped.id);
    report(canon(back?.when) === canon(shipped.when), 'after deleting the group the combination is back as shipped');
  }

  console.log(`\nRESULT ${failures ? failures + ' FAILED' : 'ALL PASS'}`);
  await ctx.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
