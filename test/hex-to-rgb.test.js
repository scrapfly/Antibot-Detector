const { test } = require('node:test');
const assert = require('node:assert');

// One shared hex -> RGB helper replaces the copies that lived in the colour
// manager, detection UI, history and settings colour rows.
const FormatUtils = require('../utils/format-utils.js');

test('six-digit hex with or without # converts', () => {
  assert.deepStrictEqual(FormatUtils.hexToRgb('#FF5733'), { r: 255, g: 87, b: 51 });
  assert.deepStrictEqual(FormatUtils.hexToRgb('00ff7f'), { r: 0, g: 255, b: 127 });
  assert.deepStrictEqual(FormatUtils.hexToRgb(' #0a0B0c '), { r: 10, g: 11, b: 12 });
});

test('anything else is null', () => {
  for (const bad of [null, undefined, '', '#fff', '#12345g', 'red', 42, '#1234567']) {
    assert.strictEqual(FormatUtils.hexToRgb(bad), null, String(bad));
  }
});
