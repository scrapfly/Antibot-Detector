const { test } = require('node:test');
const assert = require('node:assert');

const kit = require('../sections/rules/helpers/helper-kit.js');
require('../modules/detection/window-condition-grammar.js');
require('../modules/detection/hooks/window-condition-language.js');

const items = [
  { value: 'navigator.webdriver', desc: 'WebDriver', chip: 'Automation' },
  { value: 'bmak', desc: 'Akamai Bot Manager', chip: 'Anti-bot' },
  { value: 'window.CheqSdk', desc: 'Cheq', chip: 'Anti-bot' },
  { value: 'webdriverFlag', desc: 'Other', chip: 'Custom' },
  { value: 'chrome', desc: 'Headless Chrome', chip: 'Automation' }
];

test('empty query keeps catalog order', () => {
  assert.deepStrictEqual(kit.rankItems(items, '').map((i) => i.value), items.map((i) => i.value));
});

test('ranking: exact, prefix, segment prefix, substring, description', () => {
  assert.deepStrictEqual(kit.rankItems(items, 'webdriver').map((i) => i.value),
    ['webdriverFlag', 'navigator.webdriver']);
  assert.deepStrictEqual(kit.rankItems(items, 'chrome').map((i) => i.value), ['chrome']);
  assert.deepStrictEqual(kit.rankItems(items, 'akamai').map((i) => i.value), ['bmak']);
  assert.deepStrictEqual(kit.rankItems(items, 'CHEQ').map((i) => i.value), ['window.CheqSdk']);
  assert.deepStrictEqual(kit.rankItems(items, 'zzz'), []);
});

test('uniqueByValue keeps the first entry per value', () => {
  const out = kit.uniqueByValue([{ value: 'a', desc: '1' }, { value: 'a', desc: '2' }, { value: '' }, { value: 'b' }]);
  assert.deepStrictEqual(out.map((i) => i.desc || i.value), ['1', 'b']);
});

test('fmt substitutes positional arguments without I18n', () => {
  assert.strictEqual(kit.fmt('missingKey', '“{0}” or “{1}”', 'a', 'b'), '“a” or “b”');
});

test('every canonical preset the helper offers is accepted by the engine', () => {
  const lang = globalThis.ScrapflyWindowConditionLanguage;
  for (const value of lang.getPresetValues()) {
    assert.ok(lang.compile(value).ok, `engine rejects preset ${value}`);
  }
});
