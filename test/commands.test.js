'use strict';
// The rescan shortcut: the page's saved result is cleared and the page reloads,
// except while the extension is off, on a page it cannot scan or a skipped site.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const Commands = require('../background/commands.js');

function deps({ enabled = true, skipped = false, valid = true, active = null, reloadFails = false } = {}) {
  const calls = { cleared: [], reloaded: [] };
  return {
    calls,
    chrome: { tabs: {
      async query() { return active ? [active] : []; },
      async reload(id) { if (reloadFails) throw new Error('No tab with id'); calls.reloaded.push(id); }
    } },
    Utils: { isValidContentScriptTab: (tab) => valid && /^https?:/.test(tab.url), isUrlBlacklisted: async () => skipped },
    isEnabled: async () => enabled,
    clear: async (request) => { calls.cleared.push(request); }
  };
}

const tab = { id: 4, url: 'https://shop.example/cart' };

test('clears the page result, then reloads the tab', async () => {
  const d = deps();
  assert.strictEqual(await Commands.rescan(tab, d), 'reloaded');
  assert.deepStrictEqual(d.calls.cleared, [{ url: 'https://shop.example/cart', tabId: 4 }]);
  assert.deepStrictEqual(d.calls.reloaded, [4]);
});

test('without a tab from Chrome it uses the active tab', async () => {
  const d = deps({ active: { id: 9, url: 'https://a.example/' } });
  assert.strictEqual(await Commands.rescan(undefined, d), 'reloaded');
  assert.deepStrictEqual(d.calls.reloaded, [9]);
  assert.strictEqual(await Commands.rescan(undefined, deps()), 'no_tab');
});

test('does nothing while off, on a skipped site or a page it cannot scan', async () => {
  for (const [options, outcome, page] of [
    [{ enabled: false }, 'off', tab],
    [{ skipped: true }, 'skipped', tab],
    [{}, 'unsupported', { id: 1, url: 'chrome://settings' }]
  ]) {
    const d = deps(options);
    assert.strictEqual(await Commands.rescan(page, d), outcome);
    assert.deepStrictEqual(d.calls.cleared, []);
    assert.deepStrictEqual(d.calls.reloaded, []);
  }
});

test('a tab that closed in between is a failure, not an exception', async () => {
  assert.strictEqual(await Commands.rescan(tab, deps({ reloadFails: true })), 'failed');
});

test('only the rescan command is handled, and the manifest declares it with a description', async () => {
  let listener = null;
  const chrome = { commands: { onCommand: { addListener(fn) { listener = fn; } } } };
  assert.strictEqual(Commands.register(chrome), true);
  const original = Commands.rescan;
  const seen = [];
  Commands.rescan = (t) => { seen.push(t); return Promise.resolve('reloaded'); };
  try {
    listener('something-else', tab);
    listener('rescan-tab', tab);
  } finally {
    Commands.rescan = original;
  }
  assert.deepStrictEqual(seen, [tab]);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.commands['rescan-tab'].description, '__MSG_commandRescanTab__');
  assert.strictEqual(manifest.commands['rescan-tab'].suggested_key.default, 'Alt+Shift+S');
  assert.ok(!('suggested_key' in manifest.commands._execute_action), 'Alt+Shift+A is a browser shortcut; the popup has none by default');
  assert.ok(!manifest.permissions.includes('commands'), 'commands is a manifest key, not a permission');
  const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
  assert.ok(en.commandRescanTab && en.commandOpenPopup);
});

test('the Detection and History Clear cache and the shortcut share one clear function', () => {
  const source = fs.readFileSync(path.join(root, 'background/handlers/messages-cache.js'), 'utf8');
  assert.ok(/async function clearTabDetectionCache\(request, sendResponse = \(\) => \{\}\)/.test(source));
  assert.ok(source.includes('clearTabDetectionCache(request, sendResponse);'));
  const bootstrap = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  assert.ok(bootstrap.indexOf('background/handlers/messages-cache.js') < bootstrap.indexOf('background/commands.js'));
});

test('Settings shows the shortcut the browser has, or "not set"', () => {
  const context = vm.createContext({ FormatUtils: { t: (key, fallback, ...args) => fallback.replace(/\{(\d)\}/g, (_, i) => args[i]) }, SettingsUI: {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/settings/settings-ui-shortcuts.js'), 'utf8'), context);
  const { shortcutText } = context.SettingsUI;
  assert.strictEqual(shortcutText([{ name: 'rescan-tab', shortcut: 'Ctrl+Shift+Y' }], 'rescan-tab'), 'Ctrl+Shift+Y');
  assert.strictEqual(shortcutText([{ name: 'rescan-tab', shortcut: '' }], 'rescan-tab'), 'not set');
  assert.strictEqual(shortcutText(null, 'rescan-tab'), 'not set');
});
