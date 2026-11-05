const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A detector the person makes (Rules → Add, or "New rule from this page") is stored with the English description
// "Custom detector". Rule texts are looked up by their English text (modules/core/rule-i18n.js), so the shipped
// dictionary of every language must hold that exact text, or the editor and the Detection window show it in English
// in every language. The wording is the one each language already uses for the same label: its tipCustomDetector.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const LOCALES = fs.readdirSync(path.join(root, '_locales')).filter(l => l !== 'en').sort();

/** The description the Rules tab's Add button stores, from the real file. */
function descriptionOfAddButton() {
  const context = vm.createContext({ console, Date });
  vm.runInContext('function Rules() {}', context);
  vm.runInContext(read('sections/rules/rules-handlers.js'), context);
  return new context.Rules().newDetectorTemplate().description;
}

/** The description "New rule from this page" stores, from the real file. */
function descriptionOfSuggestedRule() {
  const context = vm.createContext({ console, Date });
  context.self = context;
  vm.runInContext(read('modules/core/rule-suggest.js'), context);
  return context.RuleSuggest.buildRule({ id: 'custom-1', name: 'Acme', candidates: [] }).description;
}

/** The editor's box in a language, with the real rule-text lookup and the shipped dictionary of that language. */
function editorBox(locale) {
  const document = { querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  const context = vm.createContext({ console, setTimeout, document, Logger: { debug() {} } });
  context.self = context;
  vm.runInContext(read('modules/core/rule-i18n.js'), context);
  vm.runInContext('function Rules() {}', context);
  vm.runInContext(read('sections/rules/rules-text-fields.js'), context);
  context.RuleI18n.addShipped(locale, json(`detectors/i18n/${locale}.json`));
  return context;
}

test('both ways of making a detector store the same description, the English label of a custom detector', () => {
  const stored = descriptionOfAddButton();
  assert.equal(descriptionOfSuggestedRule(), stored, 'Add and "New rule from this page" store the same text');
  assert.equal(stored, json('_locales/en/messages.json').tipCustomDetector.message, 'the English label');
});

test('every language ships the description of a custom detector, worded like its own custom-detector label', () => {
  const stored = descriptionOfAddButton();
  assert.equal(LOCALES.length, 21);
  for (const locale of LOCALES) {
    const dict = json(`detectors/i18n/${locale}.json`);
    const label = json(`_locales/${locale}/messages.json`).tipCustomDetector.message;
    assert.ok(label && label !== stored, `${locale}: the label is translated`);
    assert.equal(dict[stored], label, `${locale}: detectors/i18n/${locale}.json translates "${stored}"`);
  }
});

test('a new detector\'s description shows in the person\'s language in the editor, and in English stays as written', () => {
  const stored = descriptionOfAddButton();
  for (const locale of LOCALES) {
    const context = editorBox(locale);
    const label = json(`_locales/${locale}/messages.json`).tipCustomDetector.message;
    assert.equal(context.RuleI18n.t(stored, locale), label, `${locale}: the lookup`);
    assert.equal(context.Rules.shownText(stored, {}, locale), label, `${locale}: the editor's box`);
    assert.equal(context.Rules.shownText(stored, {}, null), stored, `${locale}: English UI shows the text as written`);
  }
});
