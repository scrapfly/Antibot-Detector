const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Every previous / next page button says what it does to a screen reader, every page field has a label, and the
// arrows (and the Settings fold arrows) follow a right-to-left language.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('previous / next page buttons have a translated name, and page fields a label', () => {
  for (const file of ['sections/detection/detection.html', 'sections/settings/settings.html', 'sections/history/history.html', 'sections/rules/rules.html']) {
    const html = read(file);
    const buttons = html.match(/<button[^>]*class="pagination-btn[^"]*"[^>]*>|<button[^>]*id="(?:color|blacklist)(?:Prev|Next)Btn"[^>]*>/g) || [];
    assert.ok(buttons.length > 0, file);
    for (const button of buttons) {
      assert.match(button, /aria-label="[^"]+" data-i18n-aria-label="pagination(?:Prev|Next)"/, `${file}: ${button}`);
    }
    for (const input of html.match(/<input[^>]*class="page-input"[^>]*>/g) || []) {
      assert.match(input, /aria-label="[^"]+"/, `${file}: ${input}`);
    }
  }
  const advanced = read('sections/advanced/history/module-history.js');
  assert.match(advanced, /pagination-btn-prev" aria-label="\$\{FormatUtils\.escapeAttr\(BaseAdvancedModule\._tr\('paginationPrev'/);
  assert.match(advanced, /pagination-btn-next" aria-label="\$\{FormatUtils\.escapeAttr\(BaseAdvancedModule\._tr\('paginationNext'/);
});

test('in a right-to-left language the page arrows are mirrored and the Settings fold arrow sits at the title\'s end', () => {
  assert.match(read('modules/styles/common.css'), /\[dir="rtl"\] :is\(\.pagination-btn, \.rh-pager-btn\) svg \{\s*transform: scaleX\(-1\);/);
  const settings = read('sections/settings/settings.css');
  assert.match(settings, /is-collapsible > \[role="button"\] \{[^}]*padding-inline-end: 34px;/);
  assert.match(settings, /is-collapsible \.settings-card-chevron \{[^}]*inset-inline-end: 12px;/);
});
