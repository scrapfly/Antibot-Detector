const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Rule texts follow the UI language: the rule's own translations, then the
// shipped detectors/i18n/<locale>.json, else the English text.

global.self = global;
const R = require('../modules/core/rule-i18n.js');
const root = path.join(__dirname, '..');

test('locale keys follow the _locales folders; English needs none', () => {
  assert.strictEqual(R.localeKey('es-419'), 'es');
  assert.strictEqual(R.localeKey('pt-PT'), 'pt_BR');
  assert.strictEqual(R.localeKey('zh-TW'), 'zh_CN');
  assert.strictEqual(R.localeKey('en-US'), null);
  assert.strictEqual(R.localeKey('xx'), null);
});

test('rule translations win over shipped ones; unknown and English texts stay as written', () => {
  R.addShipped('es', { 'Reads the user agent': 'Lee el user agent', 'Shared text': 'Texto compartido' });
  R.indexRules({ antibot: { r: { description: 'Rule text', descriptionI18n: { es: 'Texto de la regla' },
    detection: { cookie: [{ description: 'Shared text', descriptionI18n: { es: 'Mi texto' } }] },
    combinations: [{ name: 'Combo', nameI18n: { de: 'Kombi' } }] } } });
  R.setLocale('es');
  try {
    assert.strictEqual(R.t('Reads   the user agent'), 'Lee el user agent', 'whitespace does not matter');
    assert.strictEqual(R.t('Shared text'), 'Mi texto', 'the rule\'s own translation first');
    assert.strictEqual(R.t('Rule text'), 'Texto de la regla');
    assert.strictEqual(R.t('Combo'), 'Combo', 'no Spanish for this one');
    assert.strictEqual(R.t('Written by a user'), 'Written by a user');
    assert.strictEqual(R.pick('Combo', { es: 'Combinación' }), 'Combinación');
    R.setLocale(null);
    assert.strictEqual(R.t('Reads the user agent'), 'Reads the user agent', 'English UI: the text as written');
  } finally {
    R.setLocale(undefined);
  }
});

test('shipped translation files are JSON objects of non-empty strings for every UI language', () => {
  for (const locale of R.LOCALES) {
    const file = path.join(root, 'detectors/i18n', `${locale}.json`);
    assert.ok(fs.existsSync(file), `${locale}.json missing`);
    const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(dict && typeof dict === 'object' && !Array.isArray(dict), locale);
    assert.ok(Object.values(dict).every(v => typeof v === 'string' && v.trim()), `${locale}: empty translation`);
  }
});
