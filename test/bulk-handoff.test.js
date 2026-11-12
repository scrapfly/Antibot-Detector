'use strict';
// History → Select entries → Bulk scan: the selected entries' addresses handed to the Bulk scan page (modules/core/bulk-handoff.js),
// and the History side that writes the hand-over and opens the page (the real History and its mixin in a vm with a stub DOM).
// The page side (it reads, removes and fills its list) is in bulk-page.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const BulkHandoff = require('../modules/core/bulk-handoff.js');

test('create() keeps each address once, in the order given, and leaves out entries without one', () => {
  const made = BulkHandoff.create([{ url: 'https://a.example/' }, { url: ' https://b.example/x ' }, {}, null, { url: 42 }, { url: 'https://a.example/' }, { url: '' }], 1000);
  assert.deepEqual(plain(made), { urls: ['https://a.example/', 'https://b.example/x'], at: 1000 });
  assert.deepEqual(plain(BulkHandoff.create(undefined, 5)), { urls: [], at: 5 });
});

test('read() gives the addresses of a fresh hand-over, and null for one that is too old, from the future, empty or not one', () => {
  const now = 10 * 60 * 1000;
  assert.deepEqual(BulkHandoff.read({ urls: ['https://a.example/', 'https://a.example/'], at: now - 1000 }, now), ['https://a.example/']);
  assert.equal(BulkHandoff.read({ urls: ['https://a.example/'], at: now - BulkHandoff.MAX_AGE_MS - 1 }, now), null, 'never taken in time');
  assert.equal(BulkHandoff.read({ urls: ['https://a.example/'], at: now + BulkHandoff.MAX_AGE_MS + 1 }, now), null);
  assert.equal(BulkHandoff.read({ urls: [], at: now }, now), null);
  for (const junk of [undefined, null, 'x', 1, [], { urls: 'x', at: now }, { urls: ['https://a.example/'] }]) assert.equal(BulkHandoff.read(junk, now), null);
});

test('the hand-over is not where the cap is applied: the worker cuts a run when it starts, as it does a typed list', () => {
  const many = Array.from({ length: 450 }, (_, i) => ({ url: `https://s${i}.example/` }));
  assert.equal(BulkHandoff.create(many).urls.length, 450);
  assert.ok(BulkHandoff.MAX_URLS >= 450);
});

test('the module is loaded by the popup and the Bulk page before the code that uses it, and uses no browser API', () => {
  const popup = read('popup.html');
  assert.ok(popup.indexOf('modules/core/bulk-handoff.js') < popup.indexOf('sections/history/history-select.js'));
  const page = read('sections/bulk/bulk.html');
  assert.ok(page.indexOf('modules/core/bulk-handoff.js') > 0 && page.indexOf('modules/core/bulk-handoff.js') < page.indexOf('bulk.js"'));
  assert.ok(!/chrome\./.test(read('modules/core/bulk-handoff.js').replace(/\/\*[\s\S]*?\*\//g, '')), 'pure: the callers hold the storage');
});

function historyWorld({ failSet = false } = {}) {
  const writes = [];
  const opened = [];
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, URL, Intl, Object, Array, String, Number, Promise,
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: Object.assign(Object.create(require('../utils/format-utils.js')), { t: (key, fallback) => fallback }),
    NotificationHelper: { success() {}, error() {}, info() {} },
    document: { querySelector: () => null, querySelectorAll: () => [] },
    chrome: {
      runtime: { getURL: p => p },
      storage: { session: { set: async (value) => { if (failSet) throw new Error('quota'); writes.push(plain(value)); } } }
    }
  });
  context.self = context; context.globalThis = context;
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/history-policy.js', 'modules/core/history-store.js', 'modules/core/history-export.js', 'modules/core/bulk-handoff.js']) {
    vm.runInContext(read(file), context);
  }
  for (const file of ['sections/history/history.js', 'sections/history/history-select.js']) {
    vm.runInContext(read(file) + '\n;globalThis.History = globalThis.History || History;', context);
  }
  const view = Object.create(context.History.prototype);
  view.historyItems = [
    { id: 'a', url: 'https://a.example/1' }, { id: 'b', url: 'https://b.example/' }, { id: 'c', url: 'https://a.example/1' }, { id: 'd', url: 'https://d.example/' }
  ];
  view.selectMode = true;
  view.selectedIds = new Set();
  view.getFilteredItems = () => [view.historyItems[3], view.historyItems[2], view.historyItems[1], view.historyItems[0]]; // the list's sort
  view.openBulkScan = async () => { opened.push(true); };
  return { view, writes, opened, context };
}

test('Bulk scan in the Select bar hands the selected addresses over (each once, in the list\'s order) and opens the page', async () => {
  const { view, writes, opened } = historyWorld();
  view.selectedIds = new Set(['a', 'c', 'd']);
  await view.bulkScanSelected();
  assert.equal(writes.length, 1);
  const stored = writes[0][BulkHandoff.KEY];
  assert.deepEqual(stored.urls, ['https://d.example/', 'https://a.example/1']);
  assert.ok(Math.abs(stored.at - Date.now()) < 5000);
  assert.equal(opened.length, 1, 'the existing opener runs (a new tab, or the open page brought forward)');
});

test('nothing selected: nothing is handed over and nothing opens; a refused write still opens the page, empty', async () => {
  const empty = historyWorld();
  await empty.view.bulkScanSelected();
  assert.equal(empty.writes.length + empty.opened.length, 0);
  const failing = historyWorld({ failSet: true });
  failing.view.selectedIds = new Set(['b']);
  await failing.view.bulkScanSelected();
  assert.equal(failing.opened.length, 1);
});

test('the Select bar has the button (named by Bulk scan\'s own words, off until something is selected) and its click is wired', async () => {
  const html = read('sections/history/history.html');
  const bar = html.slice(html.indexOf('id="historySelectBar"'), html.indexOf('id="historyList"'));
  const button = bar.match(/<button\b[^>]*\bid="historySelectBulkScan"[\s\S]*?<\/button>/)[0];
  assert.ok(/type="button"/.test(button) && /\bdisabled\b/.test(button));
  assert.ok(/<span data-i18n="historyBulkScan">Bulk scan<\/span>/.test(button));
  assert.ok(/aria-hidden="true"/.test(button));
  const { view, writes, context } = historyWorld();
  const clicks = {};
  context.document.addEventListener = () => {};
  context.document.querySelector = (selector) => ({ addEventListener: (type, handler) => { if (type === 'click') clicks[selector] = handler; } });
  view.setupSelectListeners();
  assert.equal(typeof clicks['#historySelectBulkScan'], 'function', 'the click is wired');
  view.selectedIds = new Set(['b']);
  await clicks['#historySelectBulkScan']();
  assert.deepEqual(writes.map(write => write[BulkHandoff.KEY].urls), [['https://b.example/']]);
});
