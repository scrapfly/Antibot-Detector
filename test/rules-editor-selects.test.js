const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The rule editor's dropdowns (Category, Difficulty, the scopes in Method Settings, the Window helper's condition) drew their own
// arrow in a fixed light grey: on the light theme's white fields it was nearly invisible (about 1.3:1). They now take the shared
// .ui-select look, whose arrow has one colour per theme and moves to the other side in a right-to-left language. The Window and
// DOM helpers' search icon sat on the physical left: in Arabic it now sits at the start of the box, on the right.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('sections/rules/rules.html');
const styles = ['sections/rules/styles/editor.css', 'sections/rules/styles/method-settings.css', 'sections/rules/rule-helpers.css'];

/** The declarations of every rule whose selector list names `name` (a class), in a CSS text */
function rulesNaming(css, name) {
  const found = [];
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (new RegExp(`\\.${name}(?![\\w-])`).test(match[1])) found.push({ selector: match[1].trim(), body: match[2] });
  }
  return found;
}

test('every dropdown of the rule editor and its dialogs has the shared .ui-select look', () => {
  const selects = [...html.matchAll(/<select\b[^>]*>/g)].map(match => match[0]);
  const editor = selects.filter(tag => /class="[^"]*\b(form-select|scope-select|rh-select)\b/.test(tag));
  assert.ok(editor.length >= 6, `the editor's dropdowns are found (${editor.length})`);
  for (const tag of editor) assert.match(tag, /class="[^"]*\bui-select\b/, tag);
});

test('none of them draws an arrow of its own, so the theme\'s arrow is the one shown', () => {
  for (const file of styles) {
    const css = read(file);
    for (const name of ['form-select', 'scope-select', 'rh-select']) {
      for (const rule of rulesNaming(css, name)) {
        assert.ok(!/background-image\s*:/.test(rule.body), `${file}: ${rule.selector} sets its own background image`);
        assert.ok(!/background-position\s*:/.test(rule.body), `${file}: ${rule.selector} places an arrow`);
        assert.ok(!/padding-right\s*:/.test(rule.body), `${file}: ${rule.selector} keeps room on the right only (use padding-inline-end)`);
      }
    }
    assert.ok(!/%23e0e0e0/i.test(css), `${file}: no arrow is drawn in the fixed light grey`);
  }
});

test('the room for the arrow is at the end of the box in either direction where a rule\'s own padding would cover it', () => {
  const settings = read('sections/rules/styles/method-settings.css');
  const find = (selector) => rulesNaming(settings, selector.split('.').pop()).find(rule => rule.selector === selector);
  assert.match(find('#editRuleModal .form-select').body, /padding-inline-end:\s*30px/);
  assert.match(find('#methodSettingsModal .scope-select').body, /padding-inline-end:\s*30px/);
});

test('the helpers\' search icon sits at the start of the box, on the right in a right-to-left language', () => {
  const css = read('sections/rules/rule-helpers.css');
  const icon = rulesNaming(css, 'rh-search-icon').find(rule => rule.selector === '.rh-search-icon');
  assert.match(icon.body, /inset-inline-start:\s*10px/);
  assert.ok(!/(^|[\s;])left\s*:/.test(icon.body), 'no physical left');
  const input = rulesNaming(css, 'rh-search-input').find(rule => rule.selector === '.rh-search-input');
  assert.match(input.body, /padding-inline:\s*31px 10px/);
  assert.ok(!/(^|[\s;])padding\s*:\s*0 10px 0 31px/.test(input.body), 'no physical padding for the icon');
});
