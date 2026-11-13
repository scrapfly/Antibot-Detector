'use strict';
// The History tab and the changes made to the stored list behind it: a single entry's export reads back, the merge count and the
// limit follow Settings, one initialisation at a time, a list that follows what the worker stores, Select mode on an empty list.
// The real History (and its Select mixin) runs in a vm with a stub DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function load({ settings = {} } = {}) {
  const toasts = [];
  const blobs = [];
  const timers = new Map();
  let timerId = 0;
  const listeners = { storage: [], message: [] };
  class FakeURL extends URL {
    static createObjectURL(blob) { blobs.push(blob); return 'blob:test'; }
    static revokeObjectURL() {}
  }
  const state = { settings, mode: 'merge' };
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, Intl, Object, Array, String, Number, Promise, Blob, URL: FakeURL,
    clearTimeout: (id) => timers.delete(id),
    setTimeout: (fn) => { const id = ++timerId; timers.set(id, fn); return id; },
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: Object.assign(Object.create(require('../utils/format-utils.js')), { t: (key, fallback, ...args) => fallback.replace(/\{(\d)\}/g, (_, i) => args[i]) }),
    NotificationHelper: {
      success: (m) => toasts.push(['success', m]), error: (m) => toasts.push(['error', m]),
      chooseImportMode: async () => state.mode
    },
    Utils: { getHistorySettings: async () => state.settings, getSettings: async () => ({}) },
    WorkerMessages: { SETTINGS_UPDATED: 'SETTINGS_UPDATED' },
    document: { querySelector: () => null, querySelectorAll: () => [], activeElement: null, createElement: () => ({ click() {}, set href(v) {}, set download(v) {} }) },
    chrome: {
      runtime: { getURL: (p) => p, onMessage: { addListener: (fn) => listeners.message.push(fn) } },
      storage: { local: {}, onChanged: { addListener: (fn) => listeners.storage.push(fn) } }
    }
  });
  context.self = context; context.globalThis = context;
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/history-policy.js', 'modules/core/history-store.js',
    'modules/core/history-export.js', 'modules/settings/backup-bundle.js']) {
    vm.runInContext(read(file), context);
  }
  for (const file of ['sections/history/history.js', 'sections/history/history-select.js']) {
    vm.runInContext(read(file) + '\n;globalThis.History = globalThis.History || History;', context);
  }
  const view = Object.create(context.History.prototype);
  view.historyItems = [];
  view.historyLimit = 0;
  const rendered = [];
  view.renderHistory = context.History.prototype.renderHistory.bind(view);
  return { view, context, toasts, blobs, timers, listeners, state, rendered };
}

const entry = (id, timestamp, extra = {}) => ({ id, url: `https://${id}.example/`, hostname: `${id}.example`, title: id, timestamp, detections: [], ...extra });
const importEvent = (payload) => ({ target: { files: [{ text: async () => JSON.stringify(payload) }], value: 'x.json' } });

test('a single entry exported from its menu is a file Import and Restore read back', async () => {
  const h = load();
  h.view.exportHistoryItem(entry('a', 1000, { note: 'keep' }));
  const data = JSON.parse(await h.blobs[0].text());
  assert.ok(Array.isArray(data.items) && data.items.length === 1 && data.items[0].id === 'a', 'the entries are in "items", as every History file has them');
  assert.equal(data.item.id, 'a', 'and "item" stays for anything that read the old file');
  assert.equal(h.context.BackupBundle.legacyKind(data), 'history', 'Settings → Restore knows it');
});

test('"Merged N new history items" counts the entries that were added, also when the limit cuts as many old ones', async () => {
  const h = load();
  h.view.historyLimit = 3;
  h.view.historyItems = [entry('o3', 30), entry('o2', 20), entry('o1', 10)];
  h.view.refreshHistoryLimit = async () => {};
  h.view.saveHistoryToStorage = async () => {};
  h.view.renderHistory = () => {};
  await h.view.handleImport(importEvent({ items: [entry('n1', 100), entry('n2', 200), entry('o1', 10)] }));
  assert.deepEqual(h.toasts.at(-1), ['success', 'Merged 2 new history items'], 'a list that stays 3 long still got two new entries');
});

test('the limit an import and a restore send is the one in Settings, though History was never opened in this popup', async () => {
  const h = load({ settings: { historyLimit: '50' } });
  assert.equal(h.view.historyLimit, 0, 'never opened: unlimited');
  const sent = [];
  h.view.sendHistoryChange = async (message) => { sent.push(message); return { status: 'ok' }; };
  h.view.loadHistoryFromStorage = async () => {};
  await h.view.saveHistoryToStorage([entry('a', 1)], 'merge');
  assert.equal(sent[0].limit, 50);
  assert.equal(h.view.historyLimit, 50);
});

test('two callers that initialise History together run it once: the markup is not loaded over the page the first one wired', async () => {
  const h = load();
  const calls = [];
  const gate = new Promise((resolve) => setTimeout(resolve, 10));
  Object.assign(h.view, {
    refreshHistoryLimit: async () => { calls.push('limit'); },
    refreshDetectionSort: async () => {},
    loadHTML: async () => { calls.push('html'); await gate; },
    setupPagination() { calls.push('pagination'); },
    setupEventListeners() { calls.push('listeners'); },
    registerSettingsListener() { calls.push('settings'); }
  });
  await Promise.all([h.view.initialize(), h.view.initialize(), h.view.initialize()]);
  assert.deepEqual(calls, ['limit', 'html', 'pagination', 'listeners', 'settings']);
  assert.equal(h.view.initialized, true);
  await h.view.initialize();
  assert.equal(calls.length, 5, 'and once it is done, it is not done again');
});

test('the list follows the stored History: a scan saved after the popup was told, drawn once after the last write', async () => {
  const h = load();
  const loads = [];
  h.view.initialized = true;
  h.view.loadHistoryFromStorage = async () => { loads.push('load'); };
  h.view.renderHistory = () => { loads.push('render'); };
  h.view.refreshDetectionSort = async () => {};
  h.view.refreshHistoryLimit = async () => {};
  h.view.registerSettingsListener();
  assert.equal(h.listeners.storage.length, 1);
  const onChanged = h.listeners.storage[0];
  onChanged({ scrapfly_history: {} }, 'local');
  onChanged({ scrapfly_history: {} }, 'local');
  onChanged({ scrapfly_history: {} }, 'local');
  assert.equal(h.timers.size, 1, 'three writes in a row wait for one redraw');
  onChanged({ scrapfly_history: {} }, 'session');
  onChanged({ something_else: {} }, 'local');
  assert.equal(h.timers.size, 1, 'other areas and other keys change nothing');
  [...h.timers.values()][0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(loads, ['load', 'render']);

  // Before History was ever shown there is nothing to redraw
  const idle = load();
  idle.view.registerSettingsListener();
  idle.listeners.storage[0]({ scrapfly_history: {} }, 'local');
  assert.equal(idle.timers.size, 0);
});

test('a new History limit saved in Settings shows at once, in a popup that never gets its own SETTINGS_UPDATED message', async () => {
  const h = load();
  const loads = [];
  h.view.initialized = true;
  h.view.historyLimit = 100;
  h.view.refreshDetectionSort = async () => {};
  h.view.refreshHistoryLimit = async () => { h.view.historyLimit = 20; };
  h.view.loadHistoryFromStorage = async () => { loads.push('load'); };
  h.view.renderHistory = () => { loads.push('render'); };
  h.view.registerSettingsListener();
  h.listeners.storage[0]({ scrapfly_settings: {} }, 'local');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(loads, ['load', 'render']);
});

test('the last entry deleted in Select mode ends it, and an empty History cannot start it', () => {
  const h = load();
  const calls = [];
  h.view.showEmptyState = () => calls.push('empty');
  h.view.syncSelectBar = () => calls.push('bar');
  h.view.selectMode = true;
  h.view.selectedIds = new Set();
  h.view.historyItems = [];
  h.view.renderHistory();
  assert.equal(h.view.selectMode, false, 'no bar left saying "0 selected"');
  assert.ok(calls.includes('empty'));

  h.view.enterSelectMode();
  assert.equal(h.view.selectMode, false, 'nothing to pick');
  h.view.historyItems = [entry('a', 1)];
  h.view.closeMenus = () => {};
  h.view.getFilteredItems = () => h.view.historyItems;
  h.view.enterSelectMode();
  assert.equal(h.view.selectMode, true);
});

test('"Copy as Markdown" copies the entry as the heading and table History exports: protections by name, no query, no values', async () => {
  const h = load({ settings: { includeTimestamps: true } });
  const copied = [];
  h.context.FormatUtils.copyToClipboard = async (text) => { copied.push(text); return true; };
  const item = entry('shop', Date.UTC(2026, 9, 19, 12), {
    url: 'https://shop.example/cart?session=SECRET#top', title: 'Shop | Cart', note: 'check later', pinned: true,
    detections: [{ detector: { name: 'Cloudflare' }, category: 'antibot', confidence: 90, matches: [{ type: 'cookie', value: 'cf_clearance=SECRET_VALUE' }] }]
  });
  await h.view.copyHistoryItemMarkdown(item);
  assert.equal(copied.length, 1);
  assert.deepEqual(copied[0].split('\n'), [
    '# Scrapfly Antibot Detector: History', '',
    '| Page | Address | Date | Protections | Pinned | Note | HTTP status |', '| --- | --- | --- | --- | --- | --- | --- |',
    '| Shop \\| Cart | <https://shop.example/cart> | 2026-10-19T12:00:00.000Z | Cloudflare (antibot, 90%) | yes | check later |  |', '']);
  assert.ok(!copied[0].includes('SECRET'), 'neither the query nor a cookie value');

  // The timestamps follow the History setting, as in the export
  const plain = load({ settings: { includeTimestamps: false } });
  plain.context.FormatUtils.copyToClipboard = async (text) => { copied.push(text); return true; };
  await plain.view.copyHistoryItemMarkdown(item);
  assert.match(copied[1], /\| Page \| Address \| Protections \| Pinned \| Note \| HTTP status \|/);
});

test('the entry menu offers it, wired to its own action', () => {
  const html = fs.readFileSync(path.join(root, 'sections/history/history.html'), 'utf8');
  assert.match(html, /data-action="copy-markdown"[\s\S]{0,400}data-i18n="historyCopyMarkdown"/);
  const source = fs.readFileSync(path.join(root, 'sections/history/history.js'), 'utf8');
  assert.match(source, /action === 'copy-markdown'\) \{\s*this\.copyHistoryItemMarkdown\(item\)/);
});
