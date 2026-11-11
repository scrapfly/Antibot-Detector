'use strict';
// History → … → Export history, after the person searched, filtered (the chips) and sorted the list: the dialog offers "Only the
// entries shown (N)", which starts checked when a search or a chip narrows the list, and the file then holds the entries the list
// shows, in the order it shows them. The real History runs in a vm; the DOM is a small stand-in that can build the dialog's fields.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

class Dom {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.handlers = {}; this.classes = new Set(); this._text = ''; this.style = {}; this.hidden = false; this.value = ''; this.checked = false; this.type = ''; }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get classList() {
    const set = this.classes;
    return { add: (name) => set.add(name), remove: (name) => set.delete(name), contains: (name) => set.has(name), toggle: (name, force) => { const on = force === undefined ? !set.has(name) : !!force; if (on) set.add(name); else set.delete(name); return on; } };
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
  appendChild(child) { this.children.push(child); return child; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text; }
  set textContent(value) { this._text = String(value); this.children = []; }
  addEventListener(type, handler) { (this.handlers[type] = this.handlers[type] || []).push(handler); }
  fire(type) { for (const handler of this.handlers[type] || []) handler({ target: this }); }
  find(className) { const found = []; const walk = (node) => { for (const child of node.children) { if (child.classes.has(className)) found.push(child); walk(child); } }; walk(this); return found; }
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 10, 12);
const det = (name, category, confidence = 80) => ({ detector: { name }, name, category, confidence });
const entry = (id, host, ageDays, detections, extra = {}) => ({ id, url: `https://${host}/p?x=1`, hostname: host, title: `Page ${id}`, timestamp: NOW - ageDays * DAY, detections, ...extra });
// Stored newest first, as History keeps them
const ENTRIES = [
  entry('shop-new', 'shop.example', 1, [det('Cloudflare', 'Anti-Bot', 95)], { pinned: true }),
  entry('news', 'news.example', 2, [det('reCAPTCHA', 'CAPTCHA', 80)]),
  entry('shop-old', 'shop.example', 9, [det('Akamai', 'Anti-Bot', 70), det('Turnstile', 'CAPTCHA', 60)]),
  entry('bank', 'bank.example', 12, [det('DataDome', 'Anti-Bot', 85)], { pinned: true }),
  entry('blog', 'blog.example', 20, [])
];
const ALL = ENTRIES.map((item) => item.id);

/** The dialog opened on a list the person has narrowed (or not): the fields it built, and what a confirmed export wrote. */
async function openExport({ items = ENTRIES, query = '', chips = {}, sortKey = 'recent', settings = { exportFormat: 'json' } } = {}) {
  const blobs = [];
  const toasts = [];
  let opened = null;
  let close;
  class FakeURL extends URL {
    static createObjectURL(blob) { blobs.push(blob); return 'blob:test'; }
    static revokeObjectURL() {}
  }
  const document = { createElement: (tag) => { const node = new Dom(tag); if (tag === 'a') node.click = () => {}; return node; } };
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, Intl, Object, Array, String, Number, Promise, Blob, URL: FakeURL, document,
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: Object.assign(Object.create(require('../utils/format-utils.js')), { t: (key, fallback, ...args) => fallback.replace(/\{(\d)\}/g, (_, i) => args[i]) }),
    Utils: { getHistorySettings: async () => settings },
    NotificationHelper: {
      success: (m) => toasts.push(['success', m]), error: (m) => toasts.push(['error', m]),
      form: (options) => { opened = options; return new Promise((resolve) => { close = resolve; }); }
    }
  });
  context.self = context; context.globalThis = context;
  for (const file of ['modules/core/categories.js', 'modules/core/history-filter.js', 'modules/core/history-sort.js', 'modules/core/history-export.js']) vm.runInContext(read(file), context);
  vm.runInContext(`${read('sections/history/history.js')}\n;globalThis.History = History;`, context);
  const view = Object.create(context.History.prototype);
  Object.assign(view, { historyItems: items, searchQuery: query, activeChips: context.HistoryFilter.normalizeChips(chips), sortKey });
  const done = view.exportHistory();
  for (let waited = 0; !opened && waited < 50; waited++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(opened, 'the export dialog opened');
  const form = opened.content;
  const checks = form.find('history-dialog-check');
  const shown = checks.find((row) => /^Only the entries shown/.test(row.textContent));
  return {
    view, form, options: opened, toasts, checks, shown,
    box: shown && shown.children[0],
    count: form.find('history-dialog-count')[0],
    boxOf: (label) => checks.find((row) => row.textContent === label).children[0],
    fields: form.children,
    // The dialog is answered; what it wrote is the file's text (null when it wrote none)
    confirm: async () => { close(true); await done; return blobs.length ? blobs[0].text() : null; },
    cancel: async () => { close(false); await done; return blobs.length; }
  };
}
const toggle = (box, on) => { box.checked = on; box.fire('change'); };
/** The ids of the entries a JSON file holds, in file order. */
const idsOf = (text) => (text === null ? null : JSON.parse(text).items.map((item) => item.id));

test('the dialog offers "Only the entries shown", counting what the list shows now, after the other two checkboxes and above the count', async () => {
  const d = await openExport({ query: 'shop' });
  assert.ok(d.shown, 'a checkbox "Only the entries shown (N)"');
  assert.equal(d.shown.textContent, 'Only the entries shown (2)', 'the count is what the search leaves: two entries of shop.example');
  assert.equal(d.box.type, 'checkbox');
  assert.ok(d.box.classes.has('ui-checkbox'), 'the box the interface draws, as the dialog\'s other checkboxes');
  assert.ok(d.shown.classes.has('history-dialog-check'));
  // The two that were there keep their places (the browser tests tick them by position), and the new one sits right above the line it changes
  assert.deepEqual(d.checks.map((row) => row.textContent), ['Pinned pages only', 'Changed pages only', 'Only the entries shown (2)']);
  assert.deepEqual(d.fields.slice(-4), [d.checks[0], d.checks[1], d.shown, d.count], 'in the dialog\'s tab order, with the count after them');
  await d.cancel();
});

test('it starts checked when a search narrows the list, and unchecked when nothing does', async () => {
  const everything = await openExport();
  assert.equal(everything.box.checked, false, 'no search, no chip: the list shows every entry, so there is nothing to narrow');
  assert.equal(everything.shown.textContent, 'Only the entries shown (5)');
  await everything.cancel();
  const searched = await openExport({ query: 'shop' });
  assert.equal(searched.box.checked, true);
  await searched.cancel();
});

test('it starts checked when a chip narrows the list, a flag or a category; a sort alone is no narrowing', async () => {
  for (const chips of [{ pinned: true }, { changed: true }, { combinations: true }, { categories: ['captcha'] }, { pinned: true, categories: ['antibot', 'captcha'] }]) {
    const d = await openExport({ chips });
    assert.equal(d.box.checked, true, JSON.stringify(chips));
    await d.cancel();
  }
  const pinned = await openExport({ chips: { pinned: true } });
  assert.equal(pinned.shown.textContent, 'Only the entries shown (2)', 'the two pinned entries');
  await pinned.cancel();
  const sorted = await openExport({ sortKey: 'host' });
  assert.equal(sorted.box.checked, false, 'the same entries in another order: nothing is hidden');
  await sorted.cancel();
  const both = await openExport({ query: 'shop', chips: { categories: ['captcha'] } });
  assert.equal(both.box.checked, true);
  assert.equal(both.shown.textContent, 'Only the entries shown (1)', 'search and chips together, as the list combines them: shop.example with a CAPTCHA');
  await both.cancel();
});

test('checked, the file holds only the entries shown, in the order the list shows them (the sort too)', async () => {
  const searched = await openExport({ query: 'shop', sortKey: 'oldest' });
  assert.deepEqual(idsOf(await searched.confirm()), ['shop-old', 'shop-new'], 'oldest first, as the list shows them, not as History stores them');
  const chipped = await openExport({ chips: { pinned: true }, sortKey: 'host' });
  assert.deepEqual(idsOf(await chipped.confirm()), ['bank', 'shop-new'], 'Site A to Z among the pinned ones');
  assert.deepEqual(idsOf(await (await openExport({ query: 'news' })).confirm()), ['news'], 'one entry shown, one entry exported');
});

test('checked with nothing shown, the export says so and writes no file', async () => {
  const none = await openExport({ query: 'nothing-matches-this' });
  assert.equal(none.box.checked, true);
  assert.equal(none.shown.textContent, 'Only the entries shown (0)');
  assert.equal(await none.confirm(), null);
  assert.deepEqual(none.toasts, [['error', 'No entries match these filters']]);
});

test('unchecked, the file holds every entry, as before, whatever the list shows', async () => {
  const d = await openExport({ query: 'shop', sortKey: 'oldest' });
  toggle(d.box, false);
  assert.deepEqual(idsOf(await d.confirm()), ALL, 'every entry, in the order History keeps them');
  const untouched = await openExport();
  assert.deepEqual(idsOf(await untouched.confirm()), ALL, 'a list nobody narrowed exports all, with the box unchecked');
  assert.deepEqual(untouched.toasts, [['success', 'Exported 5 history items']]);
});

test('the dialog\'s own choices still apply on top of the entries shown (the same filters, the same file)', async () => {
  const d = await openExport({ query: 'shop' });
  const category = d.fields[1].children[1];
  assert.equal(category.tagName, 'SELECT', 'the Protections list');
  category.value = 'captcha';
  category.fire('change');
  assert.equal(d.count.textContent, '1 of 5 entries will be exported', 'the shop.example entries with a CAPTCHA');
  assert.deepEqual(idsOf(await d.confirm()), ['shop-old']);
  const pinned = await openExport({ query: 'shop' });
  toggle(pinned.boxOf('Pinned pages only'), true);
  assert.deepEqual(idsOf(await pinned.confirm()), ['shop-new'], 'pinned, among the shop.example entries');
  const unchecked = await openExport({ query: 'shop' });
  toggle(unchecked.box, false);
  toggle(unchecked.boxOf('Pinned pages only'), true);
  assert.deepEqual(idsOf(await unchecked.confirm()), ['shop-new', 'bank'], 'unchecked: pinned among every entry, as before');
});

test('the count line and the label follow the box: the entries shown, or every entry', async () => {
  const d = await openExport({ query: 'shop' });
  assert.equal(d.count.textContent, '2 of 5 entries will be exported');
  toggle(d.box, false);
  assert.equal(d.count.textContent, '5 of 5 entries will be exported');
  assert.equal(d.shown.textContent, 'Only the entries shown (2)', 'the label still says how many are shown');
  toggle(d.box, true);
  assert.equal(d.count.textContent, '2 of 5 entries will be exported');
  assert.equal(d.count.classes.has('is-empty'), false);
  await d.cancel();
  const none = await openExport({ query: 'nothing-matches-this' });
  assert.equal(none.count.textContent, 'No entries match these filters');
  assert.equal(none.count.classes.has('is-empty'), true);
  toggle(none.box, false);
  assert.equal(none.count.textContent, '5 of 5 entries will be exported');
  assert.equal(none.count.classes.has('is-empty'), false);
  await none.cancel();
});

test('Cancel writes nothing, and the other formats are written from the entries shown too', async () => {
  assert.equal(await (await openExport({ query: 'shop' })).cancel(), 0);
  const md = await openExport({ query: 'shop', settings: { exportFormat: 'md', includeTimestamps: false } });
  const text = await md.confirm();
  assert.equal((text.match(/<https:\/\/shop\.example\/p>/g) || []).length, 2, 'one row for each of the two entries shown');
  assert.ok(!/news\.example|bank\.example|blog\.example/.test(text), text);
  const csv = await openExport({ query: 'shop', settings: { exportFormat: 'csv', includeTimestamps: false } });
  const rows = (await csv.confirm()).replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(rows.length, 1 + 3, 'the header and a row for each protection of the two entries (one has two)');
  assert.ok(rows.slice(1).every((row) => row.includes('shop.example')), rows.join('\n'));
});
