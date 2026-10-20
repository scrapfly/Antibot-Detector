const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Rule editor translations: "Translate automatically" requests every missing
// language in the click's own task (Chrome starts a model download only right
// after a click; asked one by one, only the first got through), skips the
// languages with a shipped translation, and translated rule texts show in the
// UI language while the editor keeps their original text.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/** A Translations panel: its fields, count, status and button, found by class as in the popup. */
function panel(fields) {
  const parts = {
    '.rule-translations-status': { textContent: '' },
    '[data-rule-translate]': { disabled: false },
    '.rule-translations-count': { textContent: '', classList: { toggle() {} } }
  };
  return {
    parts, open: false,
    querySelector: (sel) => parts[sel] || fields.find(f => sel === `.rule-translation-input[data-locale="${f.dataset.locale}"]`) || null,
    querySelectorAll: (sel) => (sel === '.rule-translation-input' ? fields : [])
  };
}

function load({ fields, description, translator }) {
  const scope = panel(fields);
  const elements = {
    '#methodDescriptionInput': { value: description },
    '#methodDescriptionTranslations': scope,
    '#methodTranslateStatus': scope.parts['.rule-translations-status'],
    '#methodTranslationsCount': scope.parts['.rule-translations-count']
  };
  const document = {
    querySelector: (sel) => elements[sel] || null,
    querySelectorAll: () => []
  };
  const context = vm.createContext({ console, setTimeout, document, Logger: { debug() {} }, Translator: translator, self: {} });
  context.self = context;
  vm.runInContext(read('modules/core/categories.js'), context);
  vm.runInContext(read('utils/format-utils.js'), context);
  vm.runInContext(read('modules/core/rule-i18n.js'), context);
  vm.runInContext('function Rules() {}', context);
  vm.runInContext(read('sections/rules/rules-translations-ui.js'), context);
  return { context, elements, rules: new context.Rules() };
}
const field = (locale, value = '', placeholder = '') => ({ dataset: { locale }, value, placeholder });

test('Translate automatically asks for every missing language at once, in the click\'s task', async () => {
  const created = [];
  let clickTask = true;
  const translator = { create: ({ targetLanguage }) => { created.push(`${targetLanguage}:${clickTask}`);
    return new Promise(resolve => setTimeout(() => resolve({ translate: async (t) => `[${targetLanguage}] ${t}`, destroy() {} }), 5)); } };
  const fields = [field('de'), field('es', '', 'Ya traducido'), field('ja', 'Mine'), field('pt_BR'), field('zh_CN'), field('zh_TW')];
  const { rules, elements, context } = load({ fields, description: 'A new text', translator });
  const done = rules.autoTranslateDescription();
  clickTask = false;
  await done;
  assert.deepEqual(created, ['de:true', 'pt:true', 'zh:true', 'zh-Hant:true'], 'only languages with no translation, all before anything is awaited; Traditional Chinese is zh-Hant for Chrome\'s Translator');
  assert.equal(fields[0].value, '[de] A new text');
  assert.equal(fields[1].value, '', 'a shipped translation is kept as it is');
  assert.equal(fields[2].value, 'Mine', 'a typed translation is kept');
  assert.equal(elements['#methodTranslationsCount'].textContent, `6 of ${context.RuleI18n.LOCALES.length}`);
  assert.match(elements['#methodTranslateStatus'].textContent, /^Filled 4 languages/);
});

test('with a translation in every language there is nothing to translate', async () => {
  let calls = 0;
  const fields = [field('de', '', 'Übersetzt'), field('es', 'Mía')];
  const { rules, elements } = load({ fields, description: 'Official text', translator: { create: () => { calls++; } } });
  await rules.autoTranslateDescription();
  assert.equal(calls, 0);
  assert.equal(elements['#methodTranslateStatus'].textContent, 'Every language already has a translation.');
});

test('a translated rule text shows in the UI language and keeps its original for editing', () => {
  const { context } = load({ fields: [], description: '' });
  context.RuleI18n.addShipped('es', { 'Sensor cookie with session cookie': 'Cookie de sensor con cookie de sesión' });
  context.RuleI18n.setLocale('es');
  const shown = context.Rules.localizedEditable('Sensor cookie with session cookie', null);
  assert.equal(shown.shown, 'Cookie de sensor con cookie de sesión');
  assert.match(shown.attrs, /data-i18n-source="Sensor cookie with session cookie"/);
  assert.match(shown.attrs, /data-i18n-showing="1"/);
  assert.equal(context.Rules.localizedEditable('Sensor cookie with session cookie', { es: 'Propia' }).shown, 'Propia', 'the rule\'s own translation first');
  assert.deepEqual({ ...context.Rules.localizedEditable('No translation here', null) }, { shown: 'No translation here', attrs: '' });
  context.RuleI18n.setLocale(null);
  assert.equal(context.Rules.localizedEditable('Sensor cookie with session cookie', null).attrs, '', 'English: shown as written');
});

test('a combination name has Translations too: filled into the combination, kept when it is redrawn or renamed', async () => {
  const fields = [field('de'), field('es', '', 'Cookie de cola'), field('fr', 'Le mien')];
  const scope = { ...panel(fields), dataset: { comboId: 'c1' } };
  const translator = { create: ({ targetLanguage }) => Promise.resolve({ translate: async (t) => `[${targetLanguage}] ${t}`, destroy() {} }) };
  const { context, rules } = load({ fields: [], description: '', translator });
  context.document.querySelectorAll = (sel) => (sel === '#combinationsContainer .combo-translations' ? [scope] : []);
  context.FormatUtils.escapeHtml = (v) => String(v);
  vm.runInContext(read('sections/rules/rules-combinations.js'), context);
  const combo = { id: 'c1', name: 'Queue cookie', nameI18n: { fr: 'Le mien' }, when: { all: [{ pattern: 'a' }] } };
  rules.combinationsModel = [combo];
  rules._comboTranslateStatus = new Map();
  await rules.autoTranslateComboName(combo);
  assert.deepEqual({ ...combo.nameI18n }, { fr: 'Le mien', de: '[de] Queue cookie' }, 'only the missing language, saved on the combination');
  assert.equal(fields[0].value, '[de] Queue cookie');
  assert.match(rules._comboTranslateStatus.get('c1').text, /^Filled 1 languages/);
  rules.setComboNameTranslation(combo, 'fr', '  ');
  assert.deepEqual({ ...combo.nameI18n }, { de: '[de] Queue cookie' }, 'an emptied field removes that translation');
  combo.name = 'Renamed queue cookie';
  const saved = rules.buildCombinationsForSave(null, { validate: false }).combinations[0];
  assert.deepEqual({ ...saved.nameI18n }, { de: '[de] Queue cookie' }, 'translations stay with the combination when it is renamed');
  rules.setComboNameTranslation(combo, 'de', '');
  assert.equal('nameI18n' in rules.buildCombinationsForSave(null, { validate: false }).combinations[0], false, 'no translations: no nameI18n');
});

test('a combination without a name asks for one before translating', async () => {
  const scope = { ...panel([field('de')]), dataset: { comboId: 'c1' } };
  const { context, rules } = load({ fields: [], description: '', translator: { create: () => { throw new Error('not called'); } } });
  context.document.querySelectorAll = () => [scope];
  vm.runInContext(read('sections/rules/rules-combinations.js'), context);
  rules._comboTranslateStatus = new Map();
  await rules.autoTranslateComboName({ id: 'c1', name: '  ', when: { all: [] } });
  assert.equal(scope.parts['.rule-translations-status'].textContent, 'Write the name first.');
});

test('the detector\'s own description has Translations and Translate automatically too', async () => {
  const fields = [field('de'), field('es', 'Mía'), field('fr')];
  const scope = panel(fields);
  const host = { innerHTML: '' };
  const input = { value: '' };
  const translator = { create: ({ targetLanguage }) => Promise.resolve({ translate: async (t) => `[${targetLanguage}] ${t}`, destroy() {} }) };
  const { context, rules } = load({ fields: [], description: '', translator });
  Object.assign(context.document, { querySelector: (sel) => ({ '#detectorDescriptionInput': input, '#detectorDescriptionTranslations': scope, '#detectorTranslationFields': host })[sel] || null });

  rules.renderDetectorDescription({ description: 'Bot detection on login pages', descriptionI18n: { es: 'Mía', xx: 'ignored' } });
  assert.equal(input.value, 'Bot detection on login pages');
  assert.equal(input.maxLength, 300);
  assert.match(host.innerHTML, /id="detectorTranslation-es"[^>]*maxlength="400"[^>]*>Mía<\/textarea>/);
  assert.equal(scope.open, true, 'opens when it has translations of its own');

  await rules.autoTranslateDetectorDescription();
  assert.deepEqual(fields.map(f => f.value), ['[de] Bot detection on login pages', 'Mía', '[fr] Bot detection on login pages']);

  input.value = '  Bot detection   on login pages ';
  assert.deepEqual(JSON.parse(JSON.stringify(rules.collectDetectorDescription())), { description: 'Bot detection on login pages',
    descriptionI18n: { de: '[de] Bot detection on login pages', es: 'Mía', fr: '[fr] Bot detection on login pages' } });
  input.value = ' ';
  assert.deepEqual(JSON.parse(JSON.stringify(rules.collectDetectorDescription())), { description: '', descriptionI18n: {} }, 'no translations without a text');

  // A longer stored description is never cut by the field's limit
  rules.renderDetectorDescription({ description: 'x'.repeat(320) });
  assert.equal(input.maxLength, 320);
  assert.equal(scope.open, false);
});
