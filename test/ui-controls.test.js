const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The choice controls of the interface are one style each (modules/styles/common.css): .ui-checkbox (History's Select mode, the dialogs,
// the rule suggestions), .ui-radio (the restore dialog) and .ui-select (the dropdowns of History's dialogs), so none of them is the
// browser's plain white square, round button or arrow-less box on a dark card.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the shared style draws the box, its states and its fallbacks', () => {
  const css = read('modules/styles/common.css');
  const block = (selector) => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, `${selector} is defined`);
    return css.slice(at, css.indexOf('}', at));
  };
  assert.match(block('.ui-checkbox'), /appearance: none;/, 'the browser\'s own box is not used');
  assert.match(block('.ui-checkbox'), /border-radius: 5px;/);
  assert.match(block('.ui-checkbox:checked'), /var\(--accent\)/);
  assert.match(block('.ui-checkbox:checked'), /data:image\/svg\+xml/, 'the tick is an image, as everywhere in the interface');
  assert.match(block('.ui-checkbox:hover:not(:disabled)'), /var\(--accent-light\)/);
  assert.match(block('.ui-checkbox:focus-visible'), /outline: 2px solid/, 'a keyboard user sees where the focus is');
  assert.match(block('.ui-checkbox:disabled'), /not-allowed/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ui-checkbox\s*\{\s*transition: none;/);
  assert.match(css, /@media \(forced-colors: active\)\s*\{\s*\.ui-checkbox\s*\{\s*appearance: auto;/, 'high contrast keeps the browser\'s box, which shows its state');
  assert.ok(!/\.ui-checkbox[^{]*\{[^}]*#[0-9a-fA-F]{3,6}\b(?!.*svg)/.test(block('.ui-checkbox')), 'colours come from the theme');
});

test('every visible checkbox the interface builds uses it (switches and hidden inputs are their own)', () => {
  const files = ['sections/history/history.js', 'sections/settings/settings-ui-backup.js', 'sections/settings/settings-ui-presets.js',
    'modules/integrations/scrapfly/dialog.js', 'sections/rules/rules-suggest-ui.js'];
  let seen = 0;
  for (const file of files) {
    const lines = read(file).split('\n');
    lines.forEach((line, index) => {
      if (!/<input[^>]*type="checkbox"|\.type = 'checkbox'/.test(line)) return;
      if (/role="switch"/.test(line)) return; // a switch has its own look
      seen++;
      const near = lines.slice(index, index + 3).join('\n');
      assert.match(near, /ui-checkbox/, `${file}:${index + 1} builds a checkbox without the shared class`);
    });
  }
  assert.equal(seen, 6, 'History (card, export dialog), restore dialog, reset dialog, Scrapfly options, rule suggestions');
});

test('the looks it replaced are gone, and the rows that frame a box keep their own layout', () => {
  const history = read('sections/history/history.css');
  assert.ok(!/\.history-dialog-check input\s*\{/.test(history), 'History\'s dialog box is the shared one');
  assert.ok(!/\.history-select-input\s*\{/.test(history), 'so is the card\'s');
  assert.match(history, /\.history-dialog-check \{[^}]*display: flex;/, 'the row around it stays');
  assert.match(history, /#historyTab \.history-item\.is-selected \{[^}]*color-mix\(in srgb, var\(--accent\) 10%, var\(--bg-secondary\)\)/, 'a selected card is tinted, not only outlined');
  const suggest = read('sections/rules/styles/suggest.css');
  assert.ok(!/^\.sr-check\s*\{/m.test(suggest), 'the suggestion box is the shared one');
  assert.match(suggest, /\.sr-row \.sr-check:focus-visible \{\s*outline: none;/, 'its row shows the focus ring instead');
  assert.ok(!/accent-color/.test(read('modules/integrations/scrapfly/dialog.css')), 'no browser-coloured box is left in the Scrapfly dialog');
});

test('the shared radio draws a circle with a dot, and the dropdown an arrow that follows the theme', () => {
  const css = read('modules/styles/common.css');
  const block = (selector) => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, `${selector} is defined`);
    return css.slice(at, css.indexOf('}', at));
  };
  assert.match(block('.ui-radio'), /appearance: none;/);
  assert.match(block('.ui-radio'), /border-radius: 50%;/);
  assert.match(block('.ui-radio:checked'), /radial-gradient\(circle, #fff/, 'the dot');
  assert.match(block('.ui-radio:checked'), /var\(--accent\)/);
  assert.match(block('.ui-radio:focus-visible'), /outline: 2px solid/);
  assert.match(block('.ui-radio:disabled'), /not-allowed/);
  assert.match(css, /@media \(forced-colors: active\)\s*\{\s*\.ui-radio\s*\{\s*appearance: auto;/);
  assert.match(block('select.ui-select'), /data:image\/svg\+xml/, 'an arrow is drawn: common.css hides the native one');
  assert.match(block('select.ui-select'), /padding-right: 30px;/, 'the text never runs under it');
  assert.notEqual(block('select.ui-select').match(/stroke='(%23[0-9a-f]{6})'/i)[1], block(':root[data-theme="light"] select.ui-select').match(/stroke='(%23[0-9a-f]{6})'/i)[1], 'one colour for each theme');
  assert.match(block('[dir="rtl"] select.ui-select'), /padding-left: 30px;/, 'and it moves to the other side in a right-to-left language');
});

test('every radio and dropdown the interface builds uses them', () => {
  const files = ['sections/history/history.js', 'sections/settings/settings-ui-backup.js', 'sections/settings/settings-ui-presets.js',
    'modules/integrations/scrapfly/dialog.js', 'sections/rules/rules-suggest-ui.js', 'sections/settings/settings-ui.js', 'sections/bulk/bulk.js'];
  let radios = 0;
  let selects = 0;
  for (const file of files) {
    const lines = read(file).split('\n');
    lines.forEach((line, index) => {
      const near = lines.slice(index, index + 3).join('\n');
      if (/\.type = 'radio'/.test(line)) { radios++; assert.match(near, /ui-radio/, `${file}:${index + 1} builds a radio without the shared class`); }
      if (/createElement\('select'\)|make\('select'/.test(line)) { selects++; assert.match(near, /ui-select/, `${file}:${index + 1} builds a dropdown without the shared arrow`); }
    });
  }
  assert.equal(radios, 1, 'the restore dialog\'s Merge / Replace');
  assert.equal(selects, 2, 'the export and the compare dialogs of History');
});
