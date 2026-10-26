const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The clickable non-buttons of the rule editor and History are reachable and usable with the keyboard.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const context = vm.createContext({ console, document: {}, FormatUtils: require('../utils/format-utils.js') });
  vm.runInContext('function Rules() {}', context);
  vm.runInContext(read('sections/rules/rules-method-settings.js'), context);
  vm.runInContext(read('sections/rules/rules-condition-ui.js'), context);
  return vm.runInContext('Rules', context);
}

function key(name, target) {
  return { key: name, target, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
}

function control(matches) {
  const node = { clicks: 0, click() { this.clicks++; } };
  node.closest = (selector) => (selector.split(', ').some(part => matches.includes(part)) ? node : null);
  return node;
}

test('Enter and Space click a pattern type header or a condition choice, and only when it has the focus itself', () => {
  const Rules = load();
  const header = control(['.method-header-left[role="button"]']);
  const enter = key('Enter', header);
  assert.equal(Rules.onRuleControlKey(enter), true);
  assert.equal(header.clicks, 1);
  assert.equal(enter.defaultPrevented, true);

  const option = control(['.condition-option']);
  assert.equal(Rules.onRuleControlKey(key(' ', option)), true);
  assert.equal(option.clicks, 1);

  const field = { closest: () => null };
  assert.equal(Rules.onRuleControlKey(key('Enter', field)), false);
  assert.equal(Rules.onRuleControlKey(key('a', header)), false);
});

test('Escape closes an open condition list before the editor sees it, and puts the focus back on its field', () => {
  const Rules = load();
  const classes = new Set(['condition-dropdown', 'open']);
  const trigger = { attrs: {}, focused: false, setAttribute(k, v) { this.attrs[k] = v; }, focus() { this.focused = true; } };
  const dropdown = { classList: { remove: (c) => classes.delete(c) }, querySelector: () => trigger };
  const option = { closest: (selector) => (selector === '.condition-dropdown.open' && classes.has('open') ? dropdown : null) };
  const escape = key('Escape', option);
  assert.equal(Rules.onRuleControlKey(escape), true);
  assert.equal(escape.defaultPrevented, true, 'the editor\'s Escape skips a handled key');
  assert.equal(classes.has('open'), false);
  assert.equal(trigger.attrs['aria-expanded'], 'false');
  assert.equal(trigger.focused, true);
  // Closed: Escape is the editor's again
  assert.equal(Rules.onRuleControlKey(key('Escape', option)), false);
});

test('the condition list is a listbox of focusable options that say which one is chosen', () => {
  const Rules = load();
  const rules = new Rules();
  rules.getWindowConditionGroups = () => [{ label: 'Basic', values: ['exists', 'truthy'] }];
  rules.getWindowConditionOptions = () => ['exists', 'truthy'];
  rules.getWindowConditionGroupLabel = (label) => label;
  const html = rules.renderInlineConditionDropdown('truthy', 'window', 0);
  assert.match(html, /class="condition-dropdown-trigger" aria-haspopup="listbox" aria-expanded="false"/);
  assert.match(html, /class="condition-dropdown-menu" role="listbox"/);
  assert.match(html, /class="condition-option selected" role="option" tabindex="0" aria-selected="true" data-value="truthy"/);
  assert.match(html, /class="condition-option" role="option" tabindex="0" aria-selected="false" data-value="exists"/);
});

test('History cards, pattern type headers and icon tiles can be reached with Tab', () => {
  assert.match(read('sections/history/history.js'), /class="history-item[^"]*"[^>]*role="group" tabindex="0" aria-label="\$\{attrTitle\}"/);
  assert.match(read('sections/history/history.js'), /e\.key !== 'Enter' && e\.key !== ' '/);
  assert.match(read('sections/rules/rules-editor.js'), /class="method-header-left" role="button" tabindex="0" aria-expanded="false"/);
  const picker = read('sections/rules/modals/icon-picker-modal.js');
  assert.match(picker, /role="dialog" aria-modal="true" aria-labelledby="iconPickerTitle"/);
  assert.match(picker, /data-icon="[^"]*" role="button" tabindex="0" aria-label=/);
});
