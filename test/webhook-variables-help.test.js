const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → Webhook → Template variables opens a window inside Settings. Escape closes that window only (its own
// focus scope on top of Settings'), and closing Settings takes the window with it.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function harness() {
  const scopes = [];
  const state = { overlay: null, removed: 0, released: 0 };
  const closeButton = { focus() {} };
  const card = { id: 'card' };
  const host = { appendChild: (node) => { state.overlay = node; } };
  const settingsModal = { classList: { remove() {} } };
  const document = {
    querySelector: (selector) => {
      if (selector === '#settingsModal .base-modal-content') return host;
      if (selector === '#webhookVariablesModal') return state.overlay;
      if (selector === '#settingsModal') return settingsModal;
      return null;
    },
    createElement: () => {
      const node = {
        innerHTML: '', addEventListener() {},
        querySelector: (selector) => (selector === '.webhook-vars-card' ? card : selector === '.webhook-vars-close' ? closeButton : null),
        remove: () => { state.removed++; if (state.overlay === node) state.overlay = null; }
      };
      return node;
    }
  };
  const ModalFocus = {
    activate: (dialog, options) => { const scope = { dialog, options, open: true }; scopes.push(scope); return () => { scope.open = false; state.released++; }; }
  };
  const context = vm.createContext({
    console, JSON, Date, URL, document, ModalFocus,
    Logger: { warn() {}, debug() {} },
    WebhookBody: { VARIABLES: [{ token: '{{url}}', key: 'url', desc: 'Page address' }], sampleContext: () => ({ url: 'https://example.test/"q"' }) },
    CloseButton: { html: () => '<button class="webhook-vars-close"></button>' },
    FormatUtils: require('../utils/format-utils.js'),
    chrome: { tabs: { query: async () => [] } }
  });
  vm.runInContext(read('sections/settings/settings-ui.js'), context);
  vm.runInContext(read('sections/settings/settings-ui-webhook.js'), context);
  context.SettingsUI = vm.runInContext('SettingsUI', context);
  const ui = Object.assign(Object.create(context.SettingsUI), { escapeHtml: (text) => context.FormatUtils.escapeHtml(text) });
  return { context, ui, scopes, state, card };
}

test('the window gets its own focus scope, and its Escape closes it alone', async () => {
  const h = harness();
  await h.context.SettingsUI.openWebhookVariablesHelp.call(h.ui);
  assert.ok(h.state.overlay, 'the window is in Settings');
  assert.equal(h.scopes.length, 1);
  assert.equal(h.scopes[0].dialog, h.card);
  // ModalFocus calls onClose on Escape for the scope on top
  h.scopes[0].options.onClose();
  assert.equal(h.state.overlay, null);
  assert.equal(h.state.released, 1, 'its focus scope is given back, Settings keeps its own');
});

test('closing Settings closes the window too, so it is not there on the next open', async () => {
  const h = harness();
  await h.context.SettingsUI.openWebhookVariablesHelp.call(h.ui);
  h.context.SettingsUI.hideSettings.call(h.ui);
  assert.equal(h.state.overlay, null);
  assert.equal(h.state.released, 1);
  // Opened twice: the first window and its scope go before the second comes
  await h.context.SettingsUI.openWebhookVariablesHelp.call(h.ui);
  await h.context.SettingsUI.openWebhookVariablesHelp.call(h.ui);
  assert.equal(h.scopes.filter(scope => scope.open).length, 1);
});

test('closing Settings stops reading the log counter every 2 seconds', () => {
  const timers = new Set();
  let next = 1;
  const context = vm.createContext({
    console, FormatUtils: require('../utils/format-utils.js'),
    WorkerMessages: require('../modules/core/worker-messages.js'),
    setInterval: () => { const id = next++; timers.add(id); return id; },
    clearInterval: (id) => timers.delete(id),
    chrome: { runtime: { sendMessage: () => Promise.resolve({ count: 3 }) } },
    document: { querySelector: (selector) => (selector === '#settingsModal' ? { classList: { remove() {} } } : null) }
  });
  vm.runInContext(read('sections/settings/settings-ui.js'), context);
  vm.runInContext(read('sections/settings/settings-ui-logs.js'), context);
  const SettingsUI = vm.runInContext('SettingsUI', context);
  const ui = Object.create(SettingsUI);
  ui.startLogCountUpdate();
  assert.equal(timers.size, 1);
  SettingsUI.hideSettings.call(ui);
  assert.equal(timers.size, 0);
});

test('the method buttons are wired once, however often Settings is populated', () => {
  const listeners = [];
  const radio = { value: 'PUT', addEventListener: (type) => listeners.push(['radio', type]), closest: () => null };
  const custom = { value: '', addEventListener: (type) => listeners.push(['custom', type]) };
  const context = vm.createContext({
    console, FormatUtils: require('../utils/format-utils.js'),
    document: {
      querySelectorAll: (selector) => (selector === 'input[name="webhookMethodRadio"]' ? [radio] : []),
      querySelector: (selector) => (selector === '#webhookCustomMethod' ? custom : null)
    }
  });
  vm.runInContext(read('sections/settings/settings-ui.js'), context);
  vm.runInContext(read('sections/settings/settings-ui-webhook.js'), context);
  const SettingsUI = vm.runInContext('SettingsUI', context);
  for (let i = 0; i < 4; i++) SettingsUI.setupWebhookMethodRadios.call({});
  assert.deepEqual(listeners, [['radio', 'change'], ['custom', 'input']]);
});
