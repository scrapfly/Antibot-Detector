const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Arabic is the only right-to-left language the extension ships (I18n.RTL_LANGUAGES); a browser in Hebrew, Persian or Urdu is served
// the English texts, which read left to right. The stylesheets follow the same rule, and what the translated text sits in is aligned
// to the start of the line, not to the left.

const root = path.join(__dirname, '..');
const cssFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'test' ? [] : cssFiles(full);
  return entry.name.endsWith('.css') ? [full] : [];
});
const files = cssFiles(root);
const rel = (file) => path.relative(root, file).split(path.sep).join('/');

test('no stylesheet turns a Hebrew, Persian or Urdu page right-to-left: the text on it is English', () => {
  const offenders = files.filter(file => /:lang\((he|fa|ur)\b/.test(fs.readFileSync(file, 'utf8'))).map(rel);
  assert.deepEqual(offenders, []);
  for (const page of ['sections/stats/stats.css', 'sections/bulk/bulk.css']) {
    assert.match(fs.readFileSync(path.join(root, page), 'utf8'), /:root:lang\(ar\)\s*\{\s*direction:\s*rtl;/, `${page} still mirrors for Arabic`);
  }
});

test('text-align: left is only left where the content is code, a path or a matched value (left to right in every language)', () => {
  const allowed = new Set(['.advanced-code-dialog__code', '.adv-script-path', '.method-value-btn']);
  const found = [];
  for (const file of files) {
    let selector = '';
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (/\{\s*$/.test(line) && !/^\s*(@|\/\*)/.test(line)) selector = line.replace(/\{\s*$/, '').trim();
      if (/text-align:\s*left\b/.test(line) && !allowed.has(selector)) found.push(`${rel(file)}: ${selector}`);
    }
  }
  assert.deepEqual(found, [], 'translated text aligns to the start of the line (start), so it follows the reading direction');
});

test('Arabic and Devanagari join their letters: the popup, like Statistics and Bulk scan, has no letter-spacing in them', () => {
  const common = fs.readFileSync(path.join(root, 'modules/styles/common.css'), 'utf8');
  assert.match(common, /:root:is\(:lang\(ar\), :lang\(hi\)\) \*\s*\{\s*letter-spacing:\s*0 !important;/);
});

test('the History dialogs keep the room for their dropdown arrow: the dialog rule is more specific than select.ui-select', () => {
  const history = fs.readFileSync(path.join(root, 'sections/history/history.css'), 'utf8');
  // .history-dialog-form .history-dialog-input sets the padding and wins over select.ui-select: its select has its own rule
  assert.match(history, /\.history-dialog-form select\.history-dialog-input\s*\{\s*padding-right:\s*30px;/);
  assert.match(history, /\[dir="rtl"\] \.history-dialog-form select\.history-dialog-input\s*\{\s*padding-right:\s*10px;\s*padding-left:\s*30px;/);
  const common = fs.readFileSync(path.join(root, 'modules/styles/common.css'), 'utf8');
  const block = /select\.ui-select\s*\{([^}]*)\}/.exec(common)[1];
  assert.match(block, /appearance:\s*none;/, 'a browser that draws a native arrow of its own does not show it beside ours');
});

test('keyboard focus is shown on the Rules switches, the method boxes and the slider whose input is invisible or has no outline', () => {
  const list = fs.readFileSync(path.join(root, 'sections/rules/styles/list.css'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'sections/rules/styles/editor.css'), 'utf8');
  assert.match(list, /\.toggle-switch-small input:focus-visible \+ \.toggle-slider-small\s*\{\s*outline:/);
  assert.match(editor, /\.toggle-input:focus-visible \+ \.toggle-slider\s*\{\s*outline:/);
  assert.match(editor, /\.confidence-slider:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  assert.match(editor, /\.http-method-badge:has\(input:focus-visible\)\s*\{\s*box-shadow:/);
});
