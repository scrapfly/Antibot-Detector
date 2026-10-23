'use strict';
// History → Select entries: the selection logic (the real History and its mixin run in a vm with a stub DOM).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));

function load() {
  const els = {};
  const stub = (id) => (els[id] = els[id] || { id, textContent: '', disabled: false, hidden: true, children: {}, classList: { toggle() {}, add() {}, remove() {} }, querySelector(sel) { return this.children[sel] || null; } });
  const bar = stub('#historySelectBar');
  for (const sel of ['#historySelectCount', '#historySelectAll', '#historySelectPin', '#historySelectWatch', '#historySelectExport', '#historySelectDelete', '#historySelectPin span', '#historySelectWatch span']) bar.children[sel] = stub(sel);
  const toasts = [];
  const confirms = [];
  const state = { confirm: true, settings: {} };
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, URL, Intl, Object, Array, String, Number, Promise,
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: Object.assign(Object.create(require('../utils/format-utils.js')), { t: (key, fallback, ...args) => fallback.replace(/\{(\d)\}/g, (_, i) => args[i]) }),
    NotificationHelper: {
      success: (m) => toasts.push(['success', m]), error: (m) => toasts.push(['error', m]),
      confirm: async (options) => { confirms.push(options); return state.confirm; }
    },
    Utils: { getHistorySettings: async () => state.settings },
    document: { querySelector: (sel) => (sel === '#historySelectBar' ? bar : null), querySelectorAll: () => [] },
    chrome: { runtime: { getURL: p => p } }
  });
  context.self = context; context.globalThis = context;
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/history-policy.js', 'modules/core/history-store.js', 'modules/core/history-export.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  for (const file of ['sections/history/history.js', 'sections/history/history-select.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8') + '\n;globalThis.History = globalThis.History || History;', context);
  }
  const view = Object.create(context.History.prototype);
  view.historyItems = [{ id: 'a', pinned: true, watch: true }, { id: 'b', pinned: true }, { id: 'c' }, { id: 'd' }];
  view.selectMode = true;
  view.selectedIds = new Set();
  view.closeMenus = () => {};
  view.shown = view.historyItems; // what the list shows now
  view.getFilteredItems = () => view.shown;
  const sent = [];
  let reply = null; // by default the worker changes every id it is sent
  view.sendHistoryChange = async (message) => {
    sent.push(plain(message));
    const n = (message.ids || []).length;
    return reply || { status: 'ok', updated: n, removed: n, skipped: 0 };
  };
  view.loadHistoryFromStorage = async () => {};
  view.renderHistory = () => {};
  return { view, els, toasts, confirms, state, sent, setReply: (r) => { reply = r; } };
}

test('selectedItems() follows the ids, in the list\'s order', () => {
  const { view } = load();
  view.selectedIds = new Set(['c', 'a', 'zzz']);
  assert.deepEqual(view.selectedItems().map(i => i.id), ['a', 'c']);
});

test('what a search or a chip hides is unselected, what stays shown stays selected', () => {
  const { view } = load();
  view.selectedIds = new Set(['a', 'b', 'c']);
  view.pruneSelection([{ id: 'a' }, { id: 'c' }, { id: 'd' }]);
  assert.deepEqual([...view.selectedIds].sort(), ['a', 'c']);
  view.selectMode = false;
  view.selectedIds = new Set(['a']);
  view.pruneSelection([]);
  assert.deepEqual([...view.selectedIds], ['a'], 'outside Select mode nothing is touched');
});

test('Select all takes every entry the list shows (not just a page), and a second press takes none', () => {
  const { view } = load();
  view.shown = view.historyItems.slice(0, 3);
  view.toggleSelectAll();
  assert.deepEqual([...view.selectedIds].sort(), ['a', 'b', 'c']);
  view.toggleSelectAll();
  assert.deepEqual([...view.selectedIds], []);
  view.selectedIds = new Set(['a']);
  view.toggleSelectAll();
  assert.equal(view.selectedIds.size, 3, 'a part of the list selected: the rest joins');
});

test('the bar says how many are selected and what Pin and Watch would do', () => {
  const { view, els } = load();
  view.selectedIds = new Set(['a', 'b']);
  view.syncSelectBar();
  assert.equal(els['#historySelectCount'].textContent, '2 selected');
  assert.equal(els['#historySelectPin span'].textContent, 'Unpin', 'both are pinned');
  assert.equal(els['#historySelectWatch span'].textContent, 'Watch for changes', 'only one is watched');
  assert.equal(els['#historySelectDelete'].disabled, false);
  assert.equal(els['#historySelectAll'].textContent, 'Select all');
  view.selectedIds = new Set(['a', 'b', 'c', 'd']);
  view.syncSelectBar();
  assert.equal(els['#historySelectAll'].textContent, 'Select none');
  assert.equal(els['#historySelectPin span'].textContent, 'Pin');
  view.selectedIds = new Set();
  view.syncSelectBar();
  assert.equal(els['#historySelectCount'].textContent, '0 selected');
  for (const id of ['#historySelectPin', '#historySelectWatch', '#historySelectExport', '#historySelectDelete']) assert.equal(els[id].disabled, true, id);
});

test('Pin and Watch are one message with the selected ids they change; all pinned (or watched) means undo', async () => {
  const { view, sent, toasts, state } = load();
  state.settings = { historyWatch: 'daily' };
  view.selectedIds = new Set(['c', 'd']);
  await view.bulkPin();
  assert.deepEqual(sent[0], { type: 'HISTORY_UPDATE_ITEMS', ids: ['c', 'd'], patch: { pinned: true } });
  view.selectedIds = new Set(['a', 'b']);
  await view.bulkPin();
  assert.deepEqual(sent[1], { type: 'HISTORY_UPDATE_ITEMS', ids: ['a', 'b'], patch: { pinned: false } });
  view.selectedIds = new Set(['a', 'c']);
  await view.bulkWatch();
  assert.deepEqual(sent[2], { type: 'HISTORY_UPDATE_ITEMS', ids: ['c'], patch: { watch: true } }, 'a is watched already');
  view.selectedIds = new Set(['a']);
  await view.bulkWatch();
  assert.deepEqual(sent[3].patch, { watch: false });
  assert.deepEqual(toasts.map(t => t[1]), ['Pinned: 2', 'Unpinned: 2', 'Watching: 1', 'Stopped watching: 1']);
  view.selectedIds = new Set(['a', 'c']); // a pinned, c not: Pin pins c alone and says 1
  await view.bulkPin();
  assert.deepEqual(sent[4].ids, ['c']);
  assert.equal(toasts.at(-1)[1], 'Pinned: 1');
});

test('Watch says so when the watchlist is switched off in Settings, so nothing will be checked yet', async () => {
  const { view, toasts, state } = load();
  state.settings = { historyWatch: 'off' };
  view.selectedIds = new Set(['c', 'd']);
  await view.bulkWatch();
  assert.deepEqual(toasts, [['success', 'Watching: 2. Turn on Watch pinned pages in Settings → History for them to be checked.']]);
});

test('Watch tells how many the watchlist could not take', async () => {
  const { view, toasts, setReply } = load();
  view.selectedIds = new Set(['c', 'd']);
  setReply({ status: 'ok', updated: 1, skipped: 1, limit: 10 });
  await view.bulkWatch();
  assert.deepEqual(toasts, [['error', 'Watching: 1. Not added: 1 (you can watch up to 10 pages).']]);
});

test('Delete asks first (naming the pinned ones), Cancel deletes nothing, and only the selected ids go', async () => {
  const { view, sent, confirms, toasts, state } = load();
  view.selectedIds = new Set(['a', 'c', 'd']);
  state.confirm = false;
  await view.bulkDelete();
  assert.deepEqual(sent, [], 'Cancel sends nothing');
  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].title, 'Delete selected entries');
  assert.equal(confirms[0].message, 'Delete the selected entries (3) from History? This cannot be undone. Pinned among them: 1.');
  assert.equal(confirms[0].type, 'danger');
  state.confirm = true;
  await view.bulkDelete();
  assert.deepEqual(sent, [{ type: 'HISTORY_DELETE_ITEMS', ids: ['a', 'c', 'd'] }]);
  assert.deepEqual(toasts, [['success', 'Deleted: 3']]);
  assert.equal(view.selectedIds.size, 0);
});

test('a change the worker refuses is shown, not swallowed, and nothing is asked when nothing is selected', async () => {
  const { view, toasts, confirms, sent } = load();
  view.selectedIds = new Set(['c']);
  view.sendHistoryChange = async () => { throw new Error('History changes are only accepted from extension pages'); };
  await view.bulkPin();
  assert.deepEqual(toasts, [['error', 'History changes are only accepted from extension pages']]);
  view.selectedIds = new Set();
  await view.bulkDelete();
  await view.bulkWatch();
  assert.deepEqual(confirms, []);
  assert.deepEqual(sent, []);
});

test('the worker message exists, and the cards, the bar and the menu item are in the markup', () => {
  const html = fs.readFileSync(path.join(root, 'sections/history/history.html'), 'utf8');
  for (const id of ['selectHistoryBtn', 'historySelectBar', 'historySelectCount', 'historySelectAll', 'historySelectPin', 'historySelectWatch', 'historySelectExport', 'historySelectDelete', 'historySelectDone']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  const popup = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  assert.ok(popup.indexOf('sections/history/history.js') < popup.indexOf('sections/history/history-select.js'));
  const history = fs.readFileSync(path.join(root, 'sections/history/history.js'), 'utf8');
  assert.ok(history.includes('class="history-select-input"') && history.includes('this.onSelectClick(e, historyId)'));
});
