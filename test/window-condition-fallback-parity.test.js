const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Drift guard: the hardcoded fallback condition lists in the Rules UI must mirror
// the canonical PRESET_GROUPS in window-condition-language.js. This is the exact
// bug the project hit before (fallbacks missing typeof symbol/bigint/has length/!== 0
// and carrying stale "not undefined"/"not null" aliases).

require('../modules/detection/hooks/window-condition-language.js');
const canonical = globalThis.ScrapflyWindowConditionLanguage.getPresetValues();

const FALLBACK_FILES = [
  '../sections/rules/rules-condition-ui.js',
  '../sections/rules/helpers/helper-window.js'
];

for (const rel of FALLBACK_FILES) {
  test(`fallback list in ${rel} contains every canonical condition`, () => {
    const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    const missing = canonical.filter(
      (v) => !src.includes(`'${v}'`) && !src.includes(`"${v}"`)
    );
    assert.deepStrictEqual(missing, [], `${rel} is missing canonical condition(s): ${missing.join(', ')}`);
  });
}

// The dropdown-options file must NOT offer non-canonical aliases as selectable
// values. (helper-window.js is exempt: its description-lookup intentionally
// still recognizes legacy aliases like "not undefined" for old saved rules.)
test('rules-condition-ui.js fallbacks offer no stale non-canonical aliases', () => {
  const src = fs.readFileSync(path.join(__dirname, '../sections/rules/rules-condition-ui.js'), 'utf8');
  for (const alias of ['not undefined', 'not null']) {
    assert.ok(
      !src.includes(`'${alias}'`) && !src.includes(`"${alias}"`),
      `rules-condition-ui.js still offers stale alias: ${alias}`
    );
  }
});
