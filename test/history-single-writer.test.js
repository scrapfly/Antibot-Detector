const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The popup and the service worker are separate JS contexts sharing one
// chrome.storage.local. The popup used to write `scrapfly_history` from the
// copy it loaded when it opened, so a delete / import / clear dropped any entry
// the worker had saved in the meantime. Now the worker is the only writer
// (HistoryStore) and the popup sends HISTORY_* messages. These tests load the
// real files into two vm contexts wired together like the extension.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function makeWorld() {
  const store = {};
  const writes = [];
  const storage = {
    get: async (keys) => { await delay(3); const o = {}; for (const k of [].concat(keys)) if (k in store) o[k] = store[k]; return o; },
    set: async (obj) => { await delay(3); Object.assign(store, obj); writes.push(Object.keys(obj)); },
    remove: async (keys) => { for (const k of [].concat(keys)) delete store[k]; writes.push([].concat(keys)); }
  };
  const registry = {};
  const base = () => ({
    console, setTimeout, clearTimeout, Date, JSON, Promise, Math, Set, Map, URL,
    Logger: new Proxy({}, { get: () => () => {} }),
    NotificationHelper: { confirm: async () => true, success() {}, error() {}, chooseImportMode: async () => 'merge' },
    Utils: {
      getHistorySettings: async () => ({ historyEnabled: true, historyLimit: 0, preventDuplicates: false }),
      getCacheScope: async () => 'domain'
    },
    UrlUtils: { normalizeFaviconForStorage: f => f || '', getHostnameFromUrl: u => new URL(u).hostname },
    FormatUtils: { t: (k, f) => f, convertToMilliseconds: () => 0 }
  });

  // Service worker: HistoryStore + History (static save) + retention + message handlers
  const sw = base();
  sw.chrome = { storage: { local: storage }, runtime: { getURL: p => `chrome-extension://abc/${p}` }, tabs: { get: async () => ({ title: 'T', url: 'https://x' }) } };
  sw.self = sw; sw.globalThis = sw;
  vm.createContext(sw);
  vm.runInContext(read('modules/core/history-store.js'), sw);
  vm.runInContext(read('sections/history/history.js') + '\n;globalThis.History = History;', sw);
  vm.runInContext(read('background/history-retention.js').replace(/^const HistoryRetention/m, 'globalThis.HistoryRetention'), sw);
  sw.HistoryStore.registerHandlers(registry, storage);

  // Popup: its own HistoryStore copy, messages routed to the worker registry
  const popup = base();
  popup.chrome = {
    storage: { local: storage },
    runtime: {
      getURL: p => p,
      onMessage: { addListener() {} },
      sendMessage: (request) => new Promise((resolve) => {
        const handler = registry[request.type];
        if (!handler) return resolve({ status: 'error', error: 'unknown' });
        handler({ request, sender: { id: 'abc', url: 'chrome-extension://abc/popup.html' }, sendResponse: resolve });
      })
    }
  };
  popup.self = popup; popup.globalThis = popup;
  vm.createContext(popup);
  vm.runInContext(read('modules/core/history-store.js'), popup);
  vm.runInContext(read('sections/history/history.js') + '\n;globalThis.History = History;', popup);

  const view = Object.create(popup.History.prototype);
  Object.assign(view, { historyItems: [], historyLimit: 0, renderHistory() {}, showEmptyState() {} });

  const seed = (ids) => { store.scrapfly_history = JSON.stringify({ items: ids.map((id, i) => ({ id, url: `https://${id}.com`, timestamp: 1000 - i, detections: [] })) }); };
  const ids = () => JSON.parse(store.scrapfly_history || '{"items":[]}').items.map(i => i.id || i.hostname);
  const saveInWorker = (host) => sw.History.saveDetectionToHistory(1, { url: `https://${host}/`, hostname: host, title: host },
    [{ detector: { name: 'X' }, category: 'Anti-Bot', confidence: 90 }], sw.chrome, { source: 'test' });
  return { sw, popup, view, store, registry, writes, seed, ids, saveInWorker };
}

test('popup delete keeps an entry the worker saved after the popup opened', async () => {
  const w = makeWorld();
  w.seed(['a', 'b', 'c']);
  await w.view.loadHistoryFromStorage();           // popup opens with a, b, c
  await w.saveInWorker('new.com');                 // detection finishes in the worker
  await w.view.deleteHistoryItem({ id: 'c', url: 'https://c.com' });
  const left = w.ids();
  assert.ok(left.some(id => String(id).startsWith('detection_')), `worker entry lost: ${left}`);
  assert.ok(!left.includes('c'));
  assert.deepStrictEqual(w.view.historyItems.map(i => i.id), left, 'popup reloads the stored list');
});

test('delete and a worker save running at the same time both land', async () => {
  const w = makeWorld();
  w.seed(['a', 'b', 'c']);
  await w.view.loadHistoryFromStorage();
  await Promise.all([w.saveInWorker('new.com'), w.view.deleteHistoryItem({ id: 'a', url: 'https://a.com' })]);
  const left = w.ids();
  assert.strictEqual(left.length, 3);
  assert.ok(!left.includes('a'));
  assert.ok(left.some(id => String(id).startsWith('detection_')));
});

test('import merge keeps entries the worker saved meanwhile', async () => {
  const w = makeWorld();
  w.seed(['a']);
  await w.view.loadHistoryFromStorage();
  await w.saveInWorker('new.com');
  const file = { items: [{ id: 'imported', timestamp: 5000 }] };
  await w.view.handleImport({ target: { files: [{ text: async () => JSON.stringify(file) }], value: 'x' } });
  const left = w.ids();
  assert.ok(left.includes('a') && left.includes('imported'));
  assert.ok(left.some(id => String(id).startsWith('detection_')), `worker entry lost: ${left}`);
});

test('clear empties the stored history through the worker', async () => {
  const w = makeWorld();
  w.seed(['a', 'b']);
  await w.view.loadHistoryFromStorage();
  await w.view.clearHistory();
  assert.deepStrictEqual(w.ids(), []);
  assert.strictEqual(w.view.historyItems.length, 0);
});

test('the popup never writes scrapfly_history itself', async () => {
  const w = makeWorld();
  w.seed(['a', 'b']);
  await w.view.loadHistoryFromStorage();
  const before = w.writes.length;
  const popupSet = w.popup.chrome.storage.local.set;
  let popupWrites = 0;
  w.popup.chrome.storage.local = { ...w.popup.chrome.storage.local, set: async (o) => { popupWrites++; return popupSet(o); }, remove: async () => { popupWrites++; } };
  await w.view.deleteHistoryItem({ id: 'a', url: 'https://a.com' });
  await w.view.clearHistory();
  assert.strictEqual(popupWrites, 0);
  assert.ok(w.writes.length > before, 'the worker wrote instead');
});

test('retention prune and a worker save are serialized', async () => {
  const w = makeWorld();
  w.seed([]);
  w.sw.chrome.storage.local.get = (orig => async (keys) => {
    const out = await orig(keys);
    if ([].concat(keys).includes('scrapfly_settings')) out.scrapfly_settings = JSON.stringify({ history: { historyLimit: 2 } });
    return out;
  })(w.sw.chrome.storage.local.get);
  w.sw.HistoryRetention.syncAlarm = async () => {};
  await Promise.all([w.saveInWorker('one.com'), w.saveInWorker('two.com'), w.saveInWorker('three.com'), w.sw.HistoryRetention.run('test')]);
  await w.sw.HistoryRetention.run('test');
  assert.strictEqual(w.ids().length, 2);
});

test('history messages from a web page (content script) are refused', async () => {
  const w = makeWorld();
  w.seed(['a', 'b']);
  const response = await new Promise((resolve) => {
    w.registry.HISTORY_CLEAR({ request: { type: 'HISTORY_CLEAR' }, sender: { id: 'abc', tab: { id: 3 }, url: 'https://evil.example/' }, sendResponse: resolve });
  });
  assert.strictEqual(response.status, 'error');
  assert.deepStrictEqual(w.ids(), ['a', 'b']);
});

test('an extension page opened in a tab (stats, detached popup) is accepted', async () => {
  const w = makeWorld();
  w.seed(['a', 'b']);
  const response = await new Promise((resolve) => {
    w.registry.HISTORY_DELETE_ITEMS({ request: { ids: ['a'] }, sender: { id: 'abc', tab: { id: 9 }, url: 'chrome-extension://abc/popup.html' }, sendResponse: resolve });
  });
  assert.strictEqual(response.status, 'ok');
  assert.deepStrictEqual(w.ids(), ['b']);
});

test('HistoryStore.parse accepts the string container, arrays and junk', () => {
  const HistoryStore = require('../modules/core/history-store.js');
  assert.deepStrictEqual(HistoryStore.parse(JSON.stringify({ items: [{ id: 1 }] })).items, [{ id: 1 }]);
  assert.deepStrictEqual(HistoryStore.parse([{ id: 2 }]).items, [{ id: 2 }]);
  assert.deepStrictEqual(HistoryStore.parse({ items: [{ id: 3 }] }).items, [{ id: 3 }]);
  assert.deepStrictEqual(HistoryStore.parse('{bad').items, []);
  assert.deepStrictEqual(HistoryStore.parse(undefined).items, []);
});
