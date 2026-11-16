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

// 3.2.0: History → … → Site report opens the Statistics page on the entry's site

test('Site report opens Statistics on the entry\'s site, in a new tab, and is off for an entry with no site', () => {
  const { view, calls } = load();
  assert.strictEqual(view.openSiteReport({ id: 'e1', url: 'https://www.shop.example/cart?x=1', hostname: 'www.shop.example' }), true);
  assert.strictEqual(view.openSiteReport({ id: 'e2', url: 'https://shop.example/' }), true, 'the address gives the host when the entry has none');
  assert.strictEqual(view.openSiteReport({ id: 'e3', url: 'not an address', hostname: 'unknown' }), false);
  assert.deepStrictEqual(plain(calls).created, [{ url: 'sections/stats/stats.html?site=www.shop.example' }, { url: 'sections/stats/stats.html?site=shop.example' }]);

  const items = { 'site-report': { disabled: false } };
  const menu = { querySelector: (selector) => { const m = selector.match(/data-action="([^"]+)"/); return m ? items[m[1]] || null : null; } };
  view.historyItems = [];
  view.syncItemMenu(menu, { id: 'e3', url: '' });
  assert.strictEqual(items['site-report'].disabled, true);
  view.syncItemMenu(menu, { id: 'e1', url: 'https://shop.example/' });
  assert.strictEqual(items['site-report'].disabled, false);
  const html = fs.readFileSync(path.join(root, 'sections/history/history.html'), 'utf8');
  assert.ok(/data-action="site-report">[\s\S]*?<span data-i18n="statsSiteReport">Site report<\/span>/.test(html));
  assert.ok(fs.readFileSync(path.join(root, 'sections/history/history.js'), 'utf8').includes("action === 'site-report'"));
});
