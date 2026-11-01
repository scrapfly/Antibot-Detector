const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The tick box of the interface is one style (.ui-checkbox, modules/styles/common.css): History's Select mode, the dialogs and the rule
// suggestions all use it, so none of them is the browser's plain white square on a dark card.

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
