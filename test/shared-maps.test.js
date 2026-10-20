const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// One copy of each shared map (FormatUtils): fingerprint icons, method labels
// and default category colours. A second copy drifts (it already had).

global.self = global;
require('../utils/format-utils.js');
const vm = require('node:vm');
const FormatUtils = global.FormatUtils;
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const packagedIndex = () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(read('modules/core/categories.js'), context);
  vm.runInContext(read('utils/format-utils.js') + '\nthis.FormatUtils = FormatUtils;', context);
  vm.runInContext(read('modules/detection/managers/category-manager.js'), context);
  return context.window.CategoryManager.getPackagedFallbackIndex();
};

test('default category colours match the packaged category index', () => {
  const index = packagedIndex();
  for (const key of ['antibot', 'captcha', 'fingerprint']) {
    assert.strictEqual(FormatUtils.DEFAULT_CATEGORY_COLORS[key].toLowerCase(), String(index[key].colour).toLowerCase(), key);
  }
});

// The copy the worker falls back to when detectors/index.json cannot be read (it also decides which detectors count as
// official then) must say what the file says; it had lost 24 detectors.
test('the built-in fallback index is detectors/index.json', () => {
  const file = JSON.parse(read('detectors/index.json'));
  const fallback = JSON.parse(JSON.stringify(packagedIndex()));
  assert.deepStrictEqual(fallback, file, 'update CategoryManager.getPackagedFallbackIndex to the new detectors/index.json');
});

test('no view keeps its own copy of the icon, label or colour maps', () => {
  assert.ok(!/_fingerprint\.png':\s*'<svg/.test(read('sections/history/history.js')), 'History');
  assert.ok(!/_fingerprint\.png':\s*'<svg/.test(read('sections/detection/detection-ui.js')), 'Detection');
  for (const file of ['sections/detection/detection-ui.js', 'sections/rules/rules-formatters.js', 'sections/stats/stats.js']) {
    assert.ok(!/js_hooks:\s*\[?\s*'detectionMethodJsHooks'/.test(read(file)), `${file} has its own method labels`);
  }
  assert.ok(!/'#FF5733'/.test(read('sections/settings/settings-ui.js')) && !/'#FF5733'/.test(read('sections/stats/stats.js')));
});

test('method labels: plural aliases, other, and unknown keys as words', () => {
  assert.strictEqual(FormatUtils.methodLabel('cookies'), 'Cookies');
  assert.strictEqual(FormatUtils.methodLabel('js_hooks'), 'JavaScript hooks');
  assert.strictEqual(FormatUtils.methodLabel('other'), 'Other');
  assert.strictEqual(FormatUtils.methodLabel('some_method'), 'Some method');
  assert.strictEqual(Object.keys(FormatUtils.FINGERPRINT_ICONS).length, 21);
});
