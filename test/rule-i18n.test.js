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
  // Chinese: Traditional for Taiwan, Hong Kong, Macau and the Hant script; Simplified for every other tag
  assert.strictEqual(R.localeKey('zh-TW'), 'zh_TW');
  assert.strictEqual(R.localeKey('zh_TW'), 'zh_TW');
  assert.strictEqual(R.localeKey('zh-HK'), 'zh_TW');
  assert.strictEqual(R.localeKey('zh-Hant-TW'), 'zh_TW');
  assert.strictEqual(R.localeKey('zh-CN'), 'zh_CN');
  assert.strictEqual(R.localeKey('zh-Hans'), 'zh_CN');
  assert.strictEqual(R.localeKey('zh'), 'zh_CN');
  assert.strictEqual(R.localeKey('uk-UA'), 'uk');
  assert.strictEqual(R.localeKey('th-TH'), 'th');
  assert.strictEqual(R.localeKey('vi'), 'vi');
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

test('rule translations downloaded from a release are used only while that release is newer than this build', () => {
  const R = require('../modules/core/rule-i18n.js');
  assert.equal(R.newerRelease('v3.0.6', '3.0.7'), false, 'an older download never covers this build\'s own translations');
  assert.equal(R.newerRelease('v3.0.7', '3.0.7'), false, 'the same release ships the same files');
  assert.equal(R.newerRelease('v3.0.8', '3.0.7'), true);
  assert.equal(R.newerRelease('v3.1', '3.0.12'), true);
});
