'use strict';
// popup.html?tab=&settings=&search=: what a notification click or a Statistics link opens.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function load(search) {
  const input = { value: '' };
  const context = vm.createContext({
    console, URLSearchParams, document: { addEventListener() {}, querySelector: (s) => (s === '#historySearch' ? input : null) },
    window: { addEventListener() {} }, location: { search }
  });
  context.globalThis = context;
  context.ScrapflyBridgeProtocol = { MESSAGE_TYPES: {} };
  vm.runInContext(fs.readFileSync(path.join(root, 'popup.js'), 'utf8') + '\n;globalThis.ScrapflyPopup = ScrapflyPopup;', context);
  const calls = [];
  const view = Object.create(context.ScrapflyPopup.prototype);
  view.switchTab = async (tab) => { calls.push(['switchTab', tab]); };
  view.loadAndApplyDefaultTab = async () => { calls.push(['default']); };
  view.history = { handleSearch: (q) => calls.push(['search', q]) };
  view.settings = { showSettings: () => calls.push(['showSettings']), switchTab: (t) => calls.push(['settingsTab', t]) };
  return { view, calls, input };
}

test('?tab=history&search=host opens History and narrows it to the host', async () => {
  const { view, calls, input } = load('?tab=history&search=shop.example');
  assert.strictEqual(await view.openFromAddress(), true);
  assert.deepStrictEqual(calls, [['switchTab', 'history'], ['search', 'shop.example']]);
  assert.strictEqual(input.value, 'shop.example');
});

test('a search without the History tab is ignored, and an empty address asks for nothing', async () => {
  const other = load('?tab=rules&search=shop.example');
  await other.view.openFromAddress();
  assert.deepStrictEqual(other.calls, [['switchTab', 'rules']]);
  const none = load('');
  assert.strictEqual(await none.view.openFromAddress(), false);
  assert.deepStrictEqual(none.calls, []);
});

test('?settings=history alone opens the default tab, then Settings on that sub-tab', async () => {
  const { view, calls } = load('?settings=history');
  assert.strictEqual(await view.openFromAddress(), true);
  assert.deepStrictEqual(calls, [['default'], ['showSettings'], ['settingsTab', 'history']]);
});
