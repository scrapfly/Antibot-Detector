const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Adding a language touches several lists. Each must name exactly the _locales folders, so a language
// can never ship half-wired (in the folder but not in the picker, without a flag, or refused on import).

global.self = global;
const RuleI18n = require('../modules/core/rule-i18n.js');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const folders = fs.readdirSync(path.join(root, '_locales')).filter(l => fs.statSync(path.join(root, '_locales', l)).isDirectory()).sort();
const translated = folders.filter(l => l !== 'en');
const quoted = (text) => [...text.matchAll(/'([A-Za-z_]+)'/g)].map(m => m[1]);
const same = (actual, expected, label) => assert.deepStrictEqual([...actual].sort(), [...expected].sort(), label);

// The codes Chrome accepts for an extension's _locales folders
const CHROME_LOCALES = new Set(['ar', 'am', 'bg', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'en_AU', 'en_GB', 'en_US', 'es', 'es_419', 'et', 'fa', 'fi', 'fil',
  'fr', 'gu', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'kn', 'ko', 'lt', 'lv', 'ml', 'mr', 'ms', 'nl', 'no', 'pl', 'pt_BR', 'pt_PT', 'ro', 'ru', 'sk', 'sl', 'sr',
  'sv', 'sw', 'ta', 'te', 'th', 'tr', 'uk', 'vi', 'zh_CN', 'zh_TW']);

test('every _locales folder is a code Chrome accepts, and English is the default', () => {
  for (const folder of folders) assert.ok(CHROME_LOCALES.has(folder), `${folder} is not a Chrome locale code`);
  assert.ok(folders.includes('en'));
  assert.strictEqual(JSON.parse(read('manifest.json')).default_locale, 'en');
});

test('the language picker lists auto and every folder once, each with its own name', () => {
  const context = vm.createContext({ SettingsUI: {} });
  vm.runInContext(read('sections/settings/settings-ui-language.js'), context);
  const options = context.SettingsUI.LANGUAGE_OPTIONS;
  same(options.map(o => o.value), ['auto', ...folders], 'picker options');
  assert.strictEqual(new Set(options.map(o => o.value)).size, options.length, 'a language listed twice');
  for (const o of options.filter(o => o.value !== 'auto')) assert.ok(o.label && o.label.trim(), `${o.value} has no name`);
});

test('every language has a flag', () => {
  const block = /LOCALE_FLAG_COUNTRY = \{([^}]*)\}/.exec(read('utils/url-utils.js'))[1];
  const flags = Object.fromEntries([...block.matchAll(/(\w+):\s*'(\w+)'/g)].map(m => [m[1], m[2]]));
  same(Object.keys(flags), folders, 'flags');
  for (const code of Object.values(flags)) assert.match(code, /^[a-z]{2}$/);
});

test('rule texts, the updater, the editor and the import allowlist know the same languages', () => {
  same(RuleI18n.LOCALES, translated, 'RuleI18n.LOCALES');
  same(quoted(/RULE_I18N_LOCALES = \[([^\]]*)\]/.exec(read('modules/detection/rules/update-manager.js'))[1]), translated, 'UpdateManager.RULE_I18N_LOCALES');
  same(quoted(/RULE_TRANSLATION_LOCALES = [^;]*?\|\| \[([^\]]*)\]/s.exec(read('sections/rules/rules-translations-ui.js'))[1]), translated, 'the rule editor fallback list');
  const allow = /\[('auto'[^\]]*)\]\.includes\(mutation\.languageOverride\)/.exec(read('modules/settings/settings-store.js'))[1];
  same(quoted(allow), ['auto', ...folders], 'settings import allowlist');
  for (const locale of translated) assert.ok(fs.existsSync(path.join(root, 'detectors/i18n', `${locale}.json`)), `detectors/i18n/${locale}.json`);
});

test('the service worker loads the module the update uses to pick the rule-text language', () => {
  const worker = read('background.js');
  assert.ok(worker.indexOf("./modules/core/rule-i18n.js") > worker.indexOf("./modules/core/i18n.js"), 'rule-i18n.js after i18n.js');
});

test('Traditional Chinese has its own fonts and is not drawn with the Simplified stack', () => {
  const css = read('modules/styles/common.css');
  assert.match(css, /--font-sans-zh-tw:/);
  assert.match(css, /--font-mono-zh-tw:/);
  assert.match(css, /:root:is\(:lang\(zh-TW\)[^{]*\{[^}]*--font-sans: var\(--font-sans-zh-tw\)/s);
  // after the Simplified rule, so it wins
  assert.ok(css.indexOf(':lang(zh-TW)') > css.indexOf(':root:lang(zh)'), 'zh-TW rule after the zh rule');
});

test('the update downloads only the language in use, never all of them', () => {
  const code = read('modules/detection/rules/update-manager.js');
  const body = /static activeRuleI18nLocales\(\) \{([\s\S]*?)\n    \}/.exec(code)[1];
  const activeRuleI18nLocales = new Function('RuleI18n', 'I18n', 'self', `const t = { RULE_I18N_LOCALES: ['all'] }; return (function() {${body}}).call(t);`);
  assert.deepStrictEqual(activeRuleI18nLocales(RuleI18n, { locale: () => 'uk-UA' }, {}), ['uk']);
  assert.deepStrictEqual(activeRuleI18nLocales(RuleI18n, { locale: () => 'zh-TW' }, {}), ['zh_TW']);
  assert.deepStrictEqual(activeRuleI18nLocales(RuleI18n, { locale: () => 'en-US' }, {}), [], 'English reads no dictionary');
});
