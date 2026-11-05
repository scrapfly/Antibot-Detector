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

// ---- The Detection tab's Scan again button: the shortcut's rescan, asked by the popup for the tab it shows ----
const WorkerMessages = require('../modules/core/worker-messages.js');
const MessageSender = require('../modules/core/message-sender.js');

/** The worker's handler for the popup's Scan again message, with a fake browser and the same fakes as `deps`. */
function rescanHandler(options = {}) {
  const d = deps(options);
  const tabs = options.tabs || { 4: tab, 9: { id: 9, url: 'https://other.example/' } };
  d.chrome.tabs.get = async (id) => { if (!tabs[id]) throw new Error(`No tab with id: ${id}`); return tabs[id]; };
  d.chrome.runtime = { getURL: (suffix = '') => `chrome-extension://abc/${suffix}` };
  const registry = {};
  Commands.registerHandlers(registry, d);
  const ask = (request, sender = { url: 'chrome-extension://abc/popup.html' }) => new Promise((resolve) => {
    const result = registry[WorkerMessages.RESCAN_TAB]({ request, sender, sendResponse: resolve });
    // a handler that never answers (and does not keep the channel open) would hang the test: fail it instead
    if (result !== true) setTimeout(() => resolve('no answer'), 50);
  });
  return { ...d, registry, ask };
}

test('the Scan again message rescans the tab the popup names, not the active one, and answers with the outcome', async () => {
  const h = rescanHandler({ active: { id: 9, url: 'https://other.example/' } });
  assert.strictEqual(typeof h.registry[WorkerMessages.RESCAN_TAB], 'function', 'a handler is registered under WorkerMessages.RESCAN_TAB');
  assert.deepStrictEqual(await h.ask({ type: WorkerMessages.RESCAN_TAB, tabId: 4 }), { status: 'ok', outcome: 'reloaded' });
  assert.deepStrictEqual(h.calls.cleared, [{ url: 'https://shop.example/cart', tabId: 4 }]);
  assert.deepStrictEqual(h.calls.reloaded, [4], 'only tab 4 reloaded: the active tab 9 was left alone');
});

test('the Scan again message says why nothing happened: off, a skipped site, a page it cannot scan, no tab', async () => {
  for (const [options, outcome] of [[{ enabled: false }, 'off'], [{ skipped: true }, 'skipped'], [{ valid: false }, 'unsupported']]) {
    const h = rescanHandler(options);
    assert.deepStrictEqual(await h.ask({ tabId: 4 }), { status: 'ok', outcome });
    assert.deepStrictEqual(h.calls.reloaded, [], `${outcome}: nothing reloaded`);
    assert.deepStrictEqual(h.calls.cleared, [], `${outcome}: nothing cleared`);
  }
  // A tab that closed since the popup looked, a message without a tab and a tab id that is not a number: never the active tab instead
  const h = rescanHandler({ active: { id: 9, url: 'https://other.example/' } });
  for (const request of [{ tabId: 77 }, {}, { tabId: '4' }, { tabId: null }, { tabId: -1 }]) {
    assert.deepStrictEqual(await h.ask(request), { status: 'ok', outcome: 'no_tab' }, JSON.stringify(request));
  }
  assert.deepStrictEqual(h.calls.reloaded, [], 'the active tab was not rescanned in its place');
  assert.deepStrictEqual(h.calls.cleared, []);
});

test('the Scan again message is for the extension\'s own pages: a content script in a web page is refused', async () => {
  const h = rescanHandler();
  const answer = await h.ask({ tabId: 4 }, { tab: { id: 4 }, url: 'https://evil.example/page' });
  assert.strictEqual(answer.status, 'error');
  assert.deepStrictEqual(h.calls.reloaded, []);
  assert.deepStrictEqual(h.calls.cleared, []);
});

test('a failing reload is an answer, not an exception; a worker error still answers', async () => {
  assert.deepStrictEqual(await rescanHandler({ reloadFails: true }).ask({ tabId: 4 }), { status: 'ok', outcome: 'failed' });
  const h = rescanHandler();
  h.chrome.tabs.get = async () => { throw new TypeError('boom'); };
  assert.deepStrictEqual(await h.ask({ tabId: 4 }), { status: 'ok', outcome: 'no_tab' }, 'a tab that cannot be read is no tab');
});

test('the worker\'s router registers the Scan again handler, and the rescan stays one function for the shortcut and the button', () => {
  const context = vm.createContext({ Commands, console });
  vm.runInContext(fs.readFileSync(path.join(root, 'background/handlers/router-registry.js'), 'utf8'), context);
  const registry = context.buildMessageHandlerRegistry({});
  assert.strictEqual(typeof registry[WorkerMessages.RESCAN_TAB], 'function');
  const source = fs.readFileSync(path.join(root, 'background/commands.js'), 'utf8');
  assert.strictEqual((source.match(/async rescan\(/g) || []).length, 1, 'one rescan implementation');
});
