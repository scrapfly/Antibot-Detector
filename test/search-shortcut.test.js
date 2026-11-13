const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SearchShortcut = require('../modules/ui/search-shortcut.js');

// "/" in the popup takes the keyboard to the open tab's search box, on every tab that has one, and never while something is
// being typed, a modifier is held or a dialog is open.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function element(tagName, { visible = true, closest = null } = {}) {
  return {
    tagName, hidden: false, disabled: false, focused: 0, selected: 0,
    getClientRects: () => (visible ? [{}] : []),
    closest: () => closest,
    focus() { this.focused++; }, select() { this.selected++; }
  };
}

function page({ boxes = {}, dialogs = [] } = {}) {
  const listeners = [];
  return {
    listeners,
    querySelector: (selector) => boxes[selector] || null,
    querySelectorAll: () => dialogs,
    addEventListener: (type, fn) => listeners.push([type, fn])
  };
}

const key = (target, extra = {}) => ({ key: '/', target, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, ...extra });

test('every popup tab with a search box answers "/": Detection, History, Rules and Captures', () => {
  for (const [tab, selector] of Object.entries({ detection: '#detectionSearch', history: '#historySearch', rules: '#rulesSearch', advanced: '#captureSearchInput' })) {
    const box = element('INPUT');
    const doc = page({ boxes: { [selector]: box } });
    assert.equal(SearchShortcut.shouldHandle(key(element('BODY')), doc, tab), box, tab);
  }
});

test('"/" goes to the open tab only, and only to a search box on screen', () => {
  const doc = page({ boxes: { '#rulesSearch': element('INPUT'), '#detectionSearch': element('INPUT', { visible: false }) } });
  assert.equal(SearchShortcut.shouldHandle(key(element('BODY')), doc, 'history'), null, 'History has no box in this page');
  assert.equal(SearchShortcut.shouldHandle(key(element('BODY')), doc, 'detection'), null, 'a Detection tab with nothing found shows no box');
  assert.equal(SearchShortcut.shouldHandle(key(element('BODY')), doc, 'settings'), null);
});

test('"/" typed in a field, with a modifier, or while a dialog is open is left alone', () => {
  const box = element('INPUT');
  const doc = page({ boxes: { '#historySearch': box } });
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(SearchShortcut.shouldHandle(key(element(tag)), doc, 'history'), null, tag);
  assert.equal(SearchShortcut.shouldHandle(key({ tagName: 'DIV', isContentEditable: true }), doc, 'history'), null);
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'defaultPrevented']) {
    assert.equal(SearchShortcut.shouldHandle(key(element('BODY'), { [mod]: true }), doc, 'history'), null, mod);
  }
  assert.equal(SearchShortcut.shouldHandle(key(element('BODY'), { key: 'a' }), doc, 'history'), null);
  assert.equal(SearchShortcut.shouldHandle(key(element('BUTTON', { closest: {} })), doc, 'history'), null, 'a key inside a dialog');
  const withDialog = page({ boxes: { '#historySearch': box }, dialogs: [element('DIV')] });
  assert.equal(SearchShortcut.shouldHandle(key(element('BODY')), withDialog, 'history'), null, 'a dialog on screen');
  const hiddenDialog = page({ boxes: { '#historySearch': box }, dialogs: [element('DIV', { visible: false })] });
  assert.equal(SearchShortcut.shouldHandle(key(element('BODY')), hiddenDialog, 'history'), box, 'a dialog that is closed does not count');
});

test('install focuses and selects the box and keeps the key from typing a "/" anywhere; it listens once', () => {
  const box = element('INPUT');
  const doc = page({ boxes: { '#rulesSearch': box } });
  SearchShortcut.install(doc, () => 'rules');
  SearchShortcut.install(doc, () => 'rules');
  assert.equal(doc.listeners.length, 1);
  let prevented = 0;
  doc.listeners[0][1]({ ...key(element('BODY')), preventDefault() { prevented++; } });
  assert.deepEqual([box.focused, box.selected, prevented], [1, 1, 1]);
});

test('the popup installs the one handler, after its module; History no longer has its own', () => {
  const html = read('popup.html');
  assert.ok(html.indexOf('modules/ui/search-shortcut.js') < html.indexOf('src="popup.js"'));
  assert.match(read('popup.js'), /SearchShortcut\.install\(document/);
  assert.doesNotMatch(read('sections/history/history.js'), /e\.key !== '\/'/);
});

test('Settings → Keyboard shortcuts lists every shortcut, the browser ones with the keys the browser has now', async () => {
  const vm = require('node:vm');
  const lines = {};
  const node = () => ({ dir: '', textContent: '', parts: [], replaceChildren(...parts) { this.parts = parts; this.textContent = parts.map(p => (typeof p === 'string' ? p : p.textContent)).join(''); } });
  for (const id of ['settingsShortcutOpen', 'settingsShortcutRescan', 'settingsShortcutSearch', 'settingsShortcutHistory', 'settingsShortcutEscape']) lines[`#${id}`] = node();
  const context = vm.createContext({
    self: {}, SettingsUI: {},
    FormatUtils: { t: (key, fallback, ...args) => String(fallback).replace(/\{(\d+)\}/g, (_, i) => args[Number(i)]) },
    document: { querySelector: (selector) => lines[selector] || null, createElement: () => node() },
    chrome: { commands: { getAll: async () => [{ name: '_execute_action', shortcut: 'Ctrl+Shift+Y' }, { name: 'rescan-tab', shortcut: '' }] } }
  });
  vm.runInContext(read('sections/settings/settings-ui-shortcuts.js'), context);
  const text = await context.SettingsUI.refreshShortcuts();
  assert.equal(text, 'Scan this page again: not set');
  assert.equal(lines['#settingsShortcutOpen'].textContent, 'Open the extension: Ctrl+Shift+Y');
  assert.equal(lines['#settingsShortcutSearch'].textContent, 'Search the open tab: /');
  assert.equal(lines['#settingsShortcutHistory'].textContent, 'Move between History entries: j / k, ↓ / ↑');
  assert.equal(lines['#settingsShortcutEscape'].textContent, 'Close a dialog: Esc');
  assert.equal(lines['#settingsShortcutSearch'].parts[1].dir, 'ltr', 'the keys keep their order in a right-to-left language');
  const html = read('sections/settings/settings.html');
  for (const id of Object.keys(lines)) assert.ok(html.includes(`id="${id.slice(1)}"`), id);
});
