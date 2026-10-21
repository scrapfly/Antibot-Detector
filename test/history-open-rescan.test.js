'use strict';
// History → … → Open page and Scan again now (also in the details window).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));

function load(openTabs = [], { reloadFails = false } = {}) {
  const calls = { created: [], reloaded: [], messages: [], activated: [], focused: [] };
  const chrome = {
    runtime: { getURL: p => p, async sendMessage(m) { calls.messages.push(m); return { status: 'cleared' }; } },
    tabs: {
      async create(o) { calls.created.push(o); return { id: 99 }; },
      async query(q) { calls.query = q; return openTabs; },
      async reload(id) { if (reloadFails) throw new Error('No tab with id'); calls.reloaded.push(id); },
      async update(id, o) { calls.activated.push([id, o]); }
    },
    windows: { async update(id, o) { calls.focused.push([id, o]); } }
  };
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, URL, Intl, chrome,
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: require('../utils/format-utils.js'),
    WorkerMessages: { HISTORY_CLEAR_CACHE: 'HISTORY_CLEAR_CACHE' }
  });
  context.self = context; context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/history/history.js'), 'utf8') + '\n;globalThis.History = History;', context);
  return { view: Object.create(context.History.prototype), History: context.History, calls, get plain() { return JSON.parse(JSON.stringify(calls)); } };
}

const item = { id: 'e1', url: 'https://shop.example/cart?x=1', cacheScope: 'path' };

test('Open page opens the saved address in a new tab', async () => {
  const { view, calls } = load();
  assert.strictEqual(await view.openHistoryItem(item), true);
  assert.deepStrictEqual(plain(calls).created, [{ url: 'https://shop.example/cart?x=1', active: true }]);
});

test('Scan again clears the saved result in its scope, then opens the page when no tab shows it', async () => {
  const { view, calls } = load([]);
  assert.strictEqual(await view.rescanHistoryItem(item), 'opened');
  assert.deepStrictEqual(plain(calls).messages, [{ type: 'HISTORY_CLEAR_CACHE', url: item.url, cacheScope: 'path' }]);
  assert.deepStrictEqual(plain(calls).created, [{ url: item.url, active: true }]);
  assert.deepStrictEqual(plain(calls).reloaded, []);
});

test('Scan again reloads and focuses the tab that already shows the page, clearing that tab too', async () => {
  const { view, calls } = load([{ id: 5, windowId: 2, url: item.url }]);
  assert.strictEqual(await view.rescanHistoryItem({ ...item, cacheScope: 'url' }), 'reloaded');
  assert.deepStrictEqual(plain(calls).messages, [{ type: 'HISTORY_CLEAR_CACHE', url: item.url, cacheScope: 'full', tabId: 5 }]);
  assert.deepStrictEqual(plain(calls).reloaded, [5]);
  assert.deepStrictEqual(plain(calls).activated, [[5, { active: true }]]);
  assert.deepStrictEqual(plain(calls).focused, [[2, { focused: true }]]);
  assert.deepStrictEqual(plain(calls).created, []);
});

test('an entry that is not a web page is neither opened nor scanned', async () => {
  const { view, calls } = load();
  for (const url of ['javascript:alert(1)', 'chrome://settings', '', undefined]) {
    assert.strictEqual(await view.openHistoryItem({ url }), false);
    assert.strictEqual(await view.rescanHistoryItem({ url }), false);
  }
  assert.deepStrictEqual(plain(calls).created, []);
  assert.deepStrictEqual(plain(calls).messages, []);
});

test('the menu and the details window offer both, wired to these methods', () => {
  const html = fs.readFileSync(path.join(root, 'sections/history/history.html'), 'utf8');
  const menu = html.slice(html.indexOf('id="historyItemMenu"'), html.indexOf('id="historyList"'));
  assert.ok(menu.includes('data-action="open"') && menu.includes('data-action="rescan"'));
  assert.ok(html.includes('id="historyModalRescan"'));
  const js = fs.readFileSync(path.join(root, 'sections/history/history.js'), 'utf8');
  assert.ok(js.includes("action === 'open'") && js.includes('this.openHistoryItem(item)'));
  assert.ok(js.includes("action === 'rescan'") && js.includes('this.rescanHistoryItem(item)'));
});

test('Scan again opens the page when the tab that showed it closed in between', async () => {
  const { view, calls } = load([{ id: 5, windowId: 2, url: item.url }], { reloadFails: true });
  assert.strictEqual(await view.rescanHistoryItem(item), 'opened');
  assert.deepStrictEqual(plain(calls).created, [{ url: item.url, active: true }]);
});
