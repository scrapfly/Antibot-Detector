const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The rule editor had a "Badge Color" field: seven swatches and a custom-colour dialog. It showed the rule's category colour,
// and Save looped over the category names (plain strings) looking for the rule, so nothing was ever stored; it then saved the
// categories unchanged on every rule save, without waiting. No card, badge, History entry or export reads a colour of a rule:
// the badge follows the page's difficulty and categories take their colours from Settings. The field, its dialog, the module
// behind it, its style and its texts are gone; this keeps them from coming back.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function walk(dir, extensions, found = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(relative, extensions, found);
    else if (extensions.includes(path.extname(entry.name))) found.push(relative);
  }
  return found;
}
const sources = [...['sections', 'modules', 'utils', 'background'].flatMap(dir => walk(dir, ['.js', '.html', '.css'])), 'popup.html', 'popup.js', 'background.js', 'content.js'];

const REMOVED_KEYS = ['ruleSectionBadgeColor', 'rulesUiCustomColor', 'rulesColorPickerOk', 'rulesColorPickerCancel'];

test('the rule editor has no Badge Color field and no custom-colour dialog', () => {
  const html = read('sections/rules/rules.html');
  for (const needle of ['color-option', 'badgeColorLabel', 'rainbowPicker', 'advancedColorModal', 'colorCanvas', 'hueCanvas']) {
    assert.ok(!html.includes(needle), `rules.html still has ${needle}`);
  }
});

test('nothing loads or names the removed colour manager', () => {
  assert.ok(!fs.existsSync(path.join(root, 'modules/ui/color-manager.js')), 'modules/ui/color-manager.js still exists');
  const offenders = [];
  for (const file of sources) {
    const text = read(file);
    for (const needle of ['color-manager.js', 'ColorManager', 'colorManager', 'updateDetectorBadgeColor', 'advancedColorModal', '.color-option', 'rainbow-picker']) {
      if (text.includes(needle)) offenders.push(`${file}: ${needle}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('saving a rule does not write the categories', () => {
  const editor = read('sections/rules/rules-editor.js');
  assert.ok(!/categoryManager\.saveToStorage\s*\(/.test(editor), 'rules-editor.js saves the categories');
});

test('no language file keeps the removed field\'s texts', () => {
  const offenders = [];
  for (const code of fs.readdirSync(path.join(root, '_locales'))) {
    const messages = JSON.parse(read(`_locales/${code}/messages.json`));
    for (const key of REMOVED_KEYS) if (key in messages) offenders.push(`${code}: ${key}`);
  }
  assert.deepEqual(offenders, []);
});
