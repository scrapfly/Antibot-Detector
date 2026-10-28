const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The texts of a rule in the editor (the detector's description, a pattern's description, a combination's name) are
// one plain box each. It shows the text as the interface language shows it; a change replaces the text for every
// language; left as shown, the rule keeps its text and translations; typed back, the original is put back.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function load({ locale = null, shipped = {} } = {}) {
  const document = { querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  const context = vm.createContext({ console, setTimeout, document, Logger: { debug() {} }, self: {} });
  context.self = context;
  vm.runInContext('function Rules() {}', context);
  // A stand-in for the rule-text dictionaries: the language and what the extension ships for it
  context.RuleI18n = { current: () => locale, t: (text, lang) => (shipped[lang] && shipped[lang][text]) || text, load: () => Promise.resolve() };
  vm.runInContext(read('sections/rules/rules-text-fields.js'), context);
  return { context, rules: new context.Rules() };
}
const box = (value = '') => ({ value, dataset: {} });

test('in English the box shows the text; left alone it keeps the text and its translations', () => {
  const { context, rules } = load();
  const input = box();
  rules.showRuleText(input, 'Edge of the CDN', { es: 'Borde de la CDN' });
  assert.equal(input.value, 'Edge of the CDN');
  assert.deepEqual(JSON.parse(JSON.stringify(context.Rules.collectRuleText(input))), { text: 'Edge of the CDN', translations: { es: 'Borde de la CDN' }, changed: false });
});

test('in Spanish the box shows the shipped translation, then the rule\'s own, and an untouched box keeps the English text', () => {
  const shipped = { es: { 'Edge of the CDN': 'Borde de la CDN' } };
  const { context, rules } = load({ locale: 'es', shipped });
  const input = box();
  rules.showRuleText(input, 'Edge of the CDN', {});
  assert.equal(input.value, 'Borde de la CDN', 'the extension\'s translation');
  const out = context.Rules.collectRuleText(input);
  assert.equal(out.text, 'Edge of the CDN', 'saved as it was: the English stays the English');
  assert.equal(out.changed, false);
  rules.showRuleText(input, 'Edge of the CDN', { es: 'Mi borde' });
  assert.equal(input.value, 'Mi borde', 'an older translation of the rule\'s own comes first');
});

test('a change replaces the text for every language and drops the translations of the old text', () => {
  const { context, rules } = load({ locale: 'es', shipped: { es: { 'Edge of the CDN': 'Borde de la CDN' } } });
  const input = box();
  rules.showRuleText(input, 'Edge of the CDN', { de: 'Rand des CDN' });
  input.value = 'Mi descripción';
  const out = JSON.parse(JSON.stringify(context.Rules.collectRuleText(input)));
  assert.deepEqual(out, { text: 'Mi descripción', translations: {}, changed: true });
});

test('typing back what the box showed (even with other spacing) is no change', () => {
  const { context, rules } = load({ locale: 'es', shipped: { es: { 'Edge of the CDN': 'Borde de la CDN' } } });
  const input = box();
  rules.showRuleText(input, 'Edge of the CDN', { de: 'Rand des CDN' });
  input.value = '  Borde   de la CDN ';
  const out = JSON.parse(JSON.stringify(context.Rules.collectRuleText(input)));
  assert.equal(out.changed, false);
  assert.equal(out.text, 'Edge of the CDN');
  assert.deepEqual(out.translations, { de: 'Rand des CDN' });
});

test('the detector description: collect gives its text and translations, and none without a text', () => {
  const { context, rules } = load({ locale: 'es', shipped: { es: { 'Edge of the CDN': 'Borde de la CDN' } } });
  const input = box();
  context.document.querySelector = (sel) => (sel === '#detectorDescriptionInput' ? input : null);
  rules.renderDetectorDescription({ description: 'Edge of the CDN', descriptionI18n: { de: 'Rand des CDN' } });
  assert.equal(input.value, 'Borde de la CDN');
  assert.ok(input.maxLength >= 400);
  assert.deepEqual(JSON.parse(JSON.stringify(rules.collectDetectorDescription())), { description: 'Edge of the CDN', descriptionI18n: { de: 'Rand des CDN' } });
  input.value = '';
  assert.deepEqual(JSON.parse(JSON.stringify(rules.collectDetectorDescription())), { description: '', descriptionI18n: {} });
});

test('shipped translations that finish loading later fill the box, unless something was typed; an older call never writes into a newer one', async () => {
  const shipped = { es: { 'Edge of the CDN': 'Borde de la CDN', 'Other text': 'Otro texto' } };
  const { context, rules } = load({ locale: 'es', shipped: {} });
  let release;
  context.RuleI18n.load = () => new Promise(resolve => { release = resolve; });
  context.RuleI18n.t = (text, lang) => (shipped[lang] && shipped[lang][text]) || text;
  // Nothing translated yet: the English shows; when the files come in, the box follows
  const input = box();
  const early = { t: context.RuleI18n.t };
  context.RuleI18n.t = (text) => text;
  rules.showRuleText(input, 'Edge of the CDN', {});
  assert.equal(input.value, 'Edge of the CDN');
  context.RuleI18n.t = early.t;
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(input.value, 'Borde de la CDN');
  // A box that was typed in stays as typed
  const typed = box();
  rules.showRuleText(typed, 'Edge of the CDN', {});
  typed.value = 'mine'; typed.dataset.edited = '1';
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(typed.value, 'mine');
  // Another rule opened in the same box before the first answer: that answer is dropped
  const reused = box();
  rules.showRuleText(reused, 'Edge of the CDN', {});
  const firstRelease = release;
  rules.showRuleText(reused, 'Other text', {});
  firstRelease();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(reused.value, 'Otro texto');
});
