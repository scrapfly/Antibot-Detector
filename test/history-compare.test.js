'use strict';
// History → … → Compare with…: the same page's other scans, and what changed between two of them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const C = require('../modules/core/history-compare.js');

const det = (name, category, confidence, types = []) => ({ detector: { name }, category, confidence, matches: types.map(type => ({ type })) });
const entry = (id, url, at, detections) => ({ id, url, hostname: new URL(url).hostname, timestamp: at, detections });
const T0 = Date.UTC(2026, 9, 19, 9);
const HOUR = 3600000;

test('the page of an entry is its address without the query and the fragment, like the recorder\'s change mark', () => {
  const sandbox = vm.createContext({ console, URL, Logger: new Proxy({}, { get: () => () => {} }), UrlUtils: { getHostnameFromUrl: u => { try { return new URL(u).hostname; } catch (_) { return ''; } } } });
  sandbox.globalThis = sandbox;
  vm.runInContext(fs.readFileSync(path.join(root, 'background/history-recorder.js'), 'utf8') + '\n;globalThis.HistoryRecorder = HistoryRecorder;', sandbox);
  for (const [url, hostname] of [
    ['https://Shop.Example/cart?id=3#top', 'shop.example'], ['http://a.example:8080/x/y/', 'a.example'], ['https://a.example', 'a.example'],
    ['not a url', 'fallback.example'], ['', 'only.example'], ['', ''], ['chrome-extension://abc/popup.html', 'abc']
  ]) {
    const expected = sandbox.HistoryRecorder.normalizeDuplicateKey(url, hostname, 'path');
    assert.strictEqual(C.pageKey({ url, hostname }) || null, expected, `${url} | ${hostname}`);
  }
});

test('others(): the same page\'s other entries, newest first; never the entry itself or another page', () => {
  const a = entry('a', 'https://s.example/cart?x=1', T0, []);
  const items = [a, entry('b', 'https://s.example/cart?x=2', T0 + HOUR, []), entry('c', 'https://s.example/cart', T0 - HOUR, []),
    entry('d', 'https://s.example/other', T0 + 2 * HOUR, []), entry('e', 'https://t.example/cart', T0 + 3 * HOUR, []), null];
  assert.deepEqual(C.others(items, a).map(i => i.id), ['b', 'c']);
  assert.deepEqual(C.others(items, { id: 'x', url: '', hostname: '' }), []);
  assert.deepEqual(C.others(null, a), []);
});

test('compare(): added, removed, changed and unchanged, with the earlier scan first whatever the order given', () => {
  const earlier = entry('old', 'https://s.example/', T0, [
    det('Akamai', 'Anti-Bot', 85, ['cookie']), det('Cloudflare', 'Anti-Bot', 70, ['cookie']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Canvas Fingerprint', 'Fingerprint', 30, ['js_hooks'])]);
  const later = entry('new', 'https://s.example/', T0 + HOUR, [
    det('Cloudflare', 'Anti-Bot', 95, ['cookie', 'header']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('DataDome', 'Anti-Bot', 80, ['cookie']), det('Canvas Fingerprint', 'Fingerprint', 30, ['js_hooks'])]);
  for (const [x, y] of [[earlier, later], [later, earlier]]) {
    const r = C.compare(x, y);
    assert.equal(r.earlier.id, 'old'); assert.equal(r.later.id, 'new');
    assert.deepEqual(r.added.map(d => d.name), ['DataDome']);
    assert.deepEqual(r.removed.map(d => d.name), ['Akamai']);
    assert.deepEqual(r.changed, [{ name: 'Cloudflare', category: 'antibot', from: 70, to: 95, delta: 25, methodsAdded: ['header'], methodsRemoved: [] }]);
    assert.deepEqual(r.same.map(d => d.name), ['Turnstile', 'Canvas Fingerprint'], 'anti-bot and CAPTCHA before fingerprinting');
    assert.equal(r.identical, false);
  }
});

test('compare(): names match without case, a missing score is not a change, evidence alone is', () => {
  const a = entry('a', 'https://s.example/', T0, [det('DataDome', 'Anti-Bot', null, ['cookie']), det('Kasada', 'Anti-Bot', 80, ['url'])]);
  const b = entry('b', 'https://s.example/', T0 + HOUR, [det('DATADOME', 'Anti-Bot', 90, ['cookie']), det('kasada', 'Anti-Bot', 80, ['headers', 'urls'])]);
  const r = C.compare(a, b);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.removed, []);
  const dd = r.changed.find(row => row.name === 'DATADOME');
  assert.equal(dd, undefined, 'no score on one side and the same evidence: not a change');
  assert.ok(r.same.some(row => row.name === 'DATADOME'));
  const k = r.changed.find(row => row.name === 'kasada');
  assert.deepEqual(k.methodsAdded, ['header'], 'plural legacy type names are read as header and url');
  assert.deepEqual(k.methodsRemoved, []);
  assert.equal(k.delta, 0);
});

test('compare(): two identical scans say so, and odd entries do not throw', () => {
  const a = entry('a', 'https://s.example/', T0, [det('Kasada', 'Anti-Bot', 80, ['url'])]);
  const b = entry('b', 'https://s.example/', T0 + HOUR, [det('Kasada', 'Anti-Bot', 80, ['url'])]);
  assert.equal(C.compare(a, b).identical, true);
  assert.doesNotThrow(() => C.compare({ id: 'x' }, { id: 'y', detections: [null, 'Cloudflare', {}] }));
  assert.equal(C.compare({}, {}).identical, true);
});

test('changeText(): the confidence move and the evidence, translated through the callbacks it is given', () => {
  const row = { name: 'Cloudflare', from: 70, to: 95, delta: 25, methodsAdded: ['header'], methodsRemoved: ['dom'] };
  assert.equal(C.changeText(row), '70% → 95% (+25) · New evidence: header · Evidence gone: dom');
  assert.equal(C.changeText({ ...row, from: 90, to: 60, delta: -30, methodsAdded: [], methodsRemoved: [] }), '90% → 60% (−30)');
  const t = (key, fallback, ...args) => `[${key}:${args.join(',')}]`;
  assert.equal(C.changeText(row, { t, methodLabel: m => m.toUpperCase() }), '[historyCompareChangeFmt:70,95,+25] · [historyCompareEvidenceAddedFmt:HEADER] · [historyCompareEvidenceRemovedFmt:DOM]');
});

test('toMarkdown(): a heading, the range and one section per kind of difference, escaped', () => {
  const a = entry('a', 'https://s.example/cart', T0, [det('Akamai', 'Anti-Bot', 85, ['cookie']), det('Pipe|Name', 'CAPTCHA', 90)]);
  const b = entry('b', 'https://s.example/cart', T0 + HOUR, [det('![x](https://t.example/p.gif)', 'Anti-Bot', 80, ['cookie']), det('Pipe|Name', 'CAPTCHA', 70)]);
  const md = C.toMarkdown(C.compare(a, b), { host: 's.example', address: 'https://s.example/cart' });
  assert.ok(md.startsWith('## Compare scans: s.example\n\nhttps://s.example/cart\n\nFrom 2026-10-19 09:00 to 2026-10-19 10:00\n'), md.slice(0, 120));
  assert.ok(md.includes('### Added\n- !\\[x\\](https://t.example/p.gif) (antibot, 80%)'), md);
  assert.ok(md.includes('### Removed\n- Akamai (antibot, 85%)'));
  assert.ok(md.includes('### Changed\n- Pipe\\|Name (captcha): 90% → 70% (−20)'));
  assert.ok(!md.includes('### Unchanged'));
  const same = C.toMarkdown(C.compare(a, a), { host: 's.example' });
  assert.ok(same.includes('These two scans found the same protections'), same);
  assert.ok(same.includes('### Unchanged'));
});

test('pickDefault(): the scan just before this entry, else the first one after it', () => {
  const mine = entry('m', 'https://s.example/', T0 + 5 * HOUR, []);
  const list = C.others([mine, entry('a', 'https://s.example/', T0, []), entry('b', 'https://s.example/', T0 + 3 * HOUR, []), entry('c', 'https://s.example/', T0 + 9 * HOUR, [])], mine);
  assert.equal(C.pickDefault(list, mine).id, 'b', 'the previous scan');
  const first = entry('f', 'https://s.example/', T0 - HOUR, []);
  const after = C.others([first, entry('x', 'https://s.example/', T0 + HOUR, []), entry('y', 'https://s.example/', T0 + 4 * HOUR, [])], first);
  assert.equal(C.pickDefault(after, first).id, 'x', 'no earlier scan: the next one');
  assert.equal(C.pickDefault([], first), null);
  assert.equal(C.pickDefault(null, first), null);
});

// ---- The dialog's pieces: dates, the address line, the rows ------------------------------------------------------------

const t = (key, fallback, ...args) => fallback.replace(/\{(\d)\}/g, (_, i) => args[i]);
const compared = (earlier, later) => C.compare(entry('a', 'https://s.example/', T0, earlier), entry('b', 'https://s.example/', T0 + HOUR, later));
const unicodeMinus = '−';

test('shortDateTime(): the date and time of a scan without the seconds, in the language it is given', () => {
  const at = Date.UTC(2026, 9, 15, 16, 28, 59);
  const flat = (text) => text.replace(/\s/g, ' ');
  assert.equal(flat(C.shortDateTime(at, 'en', 'UTC')), 'Oct 15, 2026, 4:28 PM');
  assert.equal(flat(C.shortDateTime(new Date(at), 'en', 'UTC')), 'Oct 15, 2026, 4:28 PM', 'a Date works as well as a number');
  for (const locale of ['de', 'ar', 'ja', 'th', 'hi', 'ru', 'zh-CN', 'pt-BR', 'tr', undefined, null, 'not a locale']) {
    const short = C.shortDateTime(at, locale, 'UTC');
    const known = locale && locale !== 'not a locale' ? locale : undefined;
    const withSeconds = new Intl.DateTimeFormat(known, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(at);
    assert.ok(short && short.length < withSeconds.length, `${locale}: "${short}" is shorter than "${withSeconds}"`);
  }
  assert.equal(typeof C.shortDateTime(NaN, 'en'), 'string');
  assert.equal(typeof C.shortDateTime(undefined), 'string');
});

test('timeOf(): when a saved scan was made, whatever form its time was saved in; 0 when it has none', () => {
  assert.equal(C.timeOf({ timestamp: T0 }), T0);
  assert.equal(C.timeOf({ timestamp: new Date(T0).toISOString() }), T0);
  assert.equal(C.timeOf({}), 0);
  assert.equal(C.timeOf(null), 0);
});

test('whereText(): the other scan\'s page path, only when its address is not the entry\'s own', () => {
  const own = { url: 'https://s.example/u/1/search?x=1' };
  assert.equal(C.pagePath('https://s.example/cart?ref=mail#top'), '/cart?ref=mail#top');
  assert.equal(C.pagePath('https://s.example'), '/');
  assert.equal(C.pagePath('not a url'), '');
  assert.equal(C.pagePath(undefined), '');
  assert.equal(C.whereText(own, { url: 'https://s.example/u/1/search?x=1' }), '', 'the same address: nothing to say');
  assert.equal(C.whereText(own, { url: 'https://S.EXAMPLE/u/1/search?x=1' }), '', 'a host name in capitals is the same address');
  assert.equal(C.whereText(own, { url: 'https://s.example/u/1/search?x=2#results' }), '/u/1/search?x=2#results', 'the query and the fragment are what tells two scans of one page apart');
  assert.equal(C.whereText(own, { url: 'not a url' }), '');
  assert.equal(C.whereText(own, null), '');
});

test('rangeDates(): the two dates of the range line, with their seconds only when the short ones would read the same', () => {
  const short = (ms) => `short ${Math.floor(ms / 60000)}`;
  const long = (ms) => `long ${ms / 1000}`;
  assert.deepEqual(C.rangeDates({ earlier: { timestamp: 1000 }, later: { timestamp: 61000 } }, { short, long }), ['short 0', 'short 1']);
  assert.deepEqual(C.rangeDates({ earlier: { timestamp: 1000 }, later: { timestamp: 5000 } }, { short, long }), ['long 1', 'long 5'], 'two scans in one minute: the seconds tell them apart');
});

test('view(): the four counts, and a group for each kind that has rows, in the order added, removed, changed, unchanged', () => {
  const r = compared(
    [det('Akamai', 'Anti-Bot', 85, ['cookie']), det('Cloudflare', 'Anti-Bot', 70, ['cookie']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Canvas Fingerprint', 'Fingerprint', 30)],
    [det('Cloudflare', 'Anti-Bot', 95, ['cookie', 'header']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('DataDome', 'Anti-Bot', 80, ['cookie']), det('Canvas Fingerprint', 'Fingerprint', 30)]);
  const v = C.view(r, { t });
  assert.equal(v.identical, false);
  assert.deepEqual(v.chips, [
    { kind: 'added', label: 'Added', count: 1 }, { kind: 'removed', label: 'Removed', count: 1 },
    { kind: 'changed', label: 'Changed', count: 1 }, { kind: 'same', label: 'Unchanged', count: 2 }]);
  assert.deepEqual(v.groups.map((g) => [g.kind, g.title, g.count, g.open, g.collapsible]),
    [['added', 'Added (1)', 1, true, false], ['removed', 'Removed (1)', 1, true, false], ['changed', 'Changed (1)', 1, true, false], ['same', 'Unchanged (2)', 2, true, true]]);
  assert.deepEqual(v.groups[0].rows, [{ name: 'DataDome', category: 'antibot', confidence: 80, from: null, to: null, delta: null, deltaText: '', tone: '', notes: '' }]);
  assert.deepEqual(v.groups[1].rows.map((row) => [row.name, row.confidence]), [['Akamai', 85]]);
  assert.deepEqual(v.groups[3].rows.map((row) => [row.name, row.category, row.confidence]), [['Turnstile', 'captcha', 90], ['Canvas Fingerprint', 'fingerprint', 30]]);

  const nothingNew = C.view(compared([det('Kasada', 'Anti-Bot', 80)], [det('Kasada', 'Anti-Bot', 80)]), { t });
  assert.deepEqual(nothingNew.chips.map((chip) => chip.count), [0, 0, 0, 1], 'an empty kind keeps its chip, dimmed by the dialog');
  assert.deepEqual(nothingNew.groups.map((g) => g.kind), ['same'], 'and has no group');
  assert.equal(nothingNew.identical, true);
});

test('view(): a score with no value is no number; the names and labels come through the translator it is given', () => {
  const r = compared([det('Kasada', 'Anti-Bot', null), det('Akamai', 'Anti-Bot', null)], [det('Kasada', 'Anti-Bot', null), det('Imperva', 'Anti-Bot', null)]);
  const v = C.view(r, { t: (key) => `[${key}]` });
  assert.deepEqual(v.chips.map((chip) => chip.label), ['[historyCompareAdded]', '[historyCompareRemoved]', '[historyCompareChanged]', '[historyCompareUnchanged]']);
  assert.deepEqual(v.groups.map((g) => g.title), ['[historyCompareAdded] (1)', '[historyCompareRemoved] (1)', '[historyCompareUnchanged] (1)']);
  assert.deepEqual(v.groups.map((g) => g.rows[0].confidence), [null, null, null]);
});

test('view(): a changed protection carries both scores, the signed difference with its direction, and the evidence on a line of its own', () => {
  const r = compared(
    [det('Up', 'Anti-Bot', 70, ['cookie']), det('Down', 'CAPTCHA', 90, ['url']), det('Evidence', 'Anti-Bot', 60, ['cookie']), det('NoScore', 'Anti-Bot', null, ['cookie'])],
    [det('Up', 'Anti-Bot', 95, ['cookie', 'header']), det('Down', 'CAPTCHA', 60, ['url']), det('Evidence', 'Anti-Bot', 60, ['header']), det('NoScore', 'Anti-Bot', 80, ['cookie', 'url'])]);
  const rows = C.view(r, { t, methodLabel: (type) => type[0].toUpperCase() + type.slice(1) }).groups.find((g) => g.kind === 'changed').rows;
  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
  assert.deepEqual(byName.Up, { name: 'Up', category: 'antibot', confidence: 95, from: 70, to: 95, delta: 25, deltaText: '+25', tone: 'up', notes: 'New evidence: Header' });
  assert.deepEqual(byName.Down, { name: 'Down', category: 'captcha', confidence: 60, from: 90, to: 60, delta: -30, deltaText: `${unicodeMinus}30`, tone: 'down', notes: '' });
  assert.deepEqual(byName.Evidence, { name: 'Evidence', category: 'antibot', confidence: 60, from: null, to: null, delta: null, deltaText: '', tone: '', notes: 'New evidence: Header · Evidence gone: Cookie' },
    'the score did not move: it shows as it is, with no difference');
  assert.deepEqual(byName.NoScore, { name: 'NoScore', category: 'antibot', confidence: 80, from: null, to: null, delta: null, deltaText: '', tone: '', notes: 'New evidence: Url' },
    'no score on one side: no move to show, the later score as it is');
  assert.deepEqual(rows.map((row) => row.name), ['Evidence', 'NoScore', 'Up', 'Down'], 'anti-bot before CAPTCHA, then by name');
});

test('view(): Unchanged folds when it holds more than three protections, and stays open when short or when the scans are identical', () => {
  const many = (n) => Array.from({ length: n }, (_, i) => det(`Protection ${i}`, 'Fingerprint', 20));
  const group = (n, later) => C.view(compared([...many(n), det('Cloudflare', 'Anti-Bot', 70)], [...many(n), det('Cloudflare', 'Anti-Bot', later)]), { t }).groups.find((g) => g.kind === 'same');
  assert.equal(C.COLLAPSE_AFTER, 3);
  assert.equal(group(3, 95).open, true, 'three rows are short enough');
  assert.equal(group(4, 95).open, false, 'a fourth folds it');
  assert.equal(group(9, 95).open, false);
  const identical = C.view(compared(many(9), many(9)), { t });
  assert.equal(identical.identical, true);
  assert.equal(identical.groups[0].open, true, 'identical scans: it is all there is');
  assert.ok(C.view(compared(many(9), many(9)), { t }).groups.every((g) => g.kind === 'same'));
  for (const kind of ['added', 'removed', 'changed']) {
    const rows = Array.from({ length: 12 }, (_, i) => det(`Row ${i}`, 'Anti-Bot', 50 + i, ['cookie']));
    const long = C.view(kind === 'added' ? compared([], rows) : kind === 'removed' ? compared(rows, []) : compared(rows, rows.map((d) => ({ ...d, confidence: d.confidence + 5 }))), { t });
    assert.equal(long.groups.find((g) => g.kind === kind).open, true, `${kind} is never folded`);
    assert.equal(long.groups.find((g) => g.kind === kind).collapsible, false);
  }
});

test('changeText() and toMarkdown() read the same after the dialog\'s rows were split out of them', () => {
  const row = { name: 'Cloudflare', from: 70, to: 95, delta: 25, methodsAdded: ['header'], methodsRemoved: ['dom'] };
  assert.equal(C.changeText(row), '70% → 95% (+25) · New evidence: header · Evidence gone: dom');
  assert.equal(C.changeText({ ...row, from: 90, to: 60, delta: -30, methodsAdded: [], methodsRemoved: [] }), `90% → 60% (${unicodeMinus}30)`);
  assert.equal(C.changeText({ ...row, delta: 0 }), 'New evidence: header · Evidence gone: dom');
  assert.equal(C.changeText({ ...row, delta: null, methodsAdded: [], methodsRemoved: [] }), '');
});

// ---- The dialog itself: History.compareHistoryItem builds it in a vm with a small stand-in for the DOM -------------------

class Dom {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.handlers = {}; this.classes = new Set(); this._text = ''; this.style = {}; this.hidden = false; this.value = ''; this.title = ''; this.id = ''; this.innerHTML = ''; this.scrollTop = 0; }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get classList() {
    const set = this.classes;
    return { add: (name) => set.add(name), remove: (name) => set.delete(name), contains: (name) => set.has(name), toggle: (name, force) => { const on = force === undefined ? !set.has(name) : !!force; if (on) set.add(name); else set.delete(name); return on; } };
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
  removeAttribute(name) { delete this.attrs[name]; }
  appendChild(child) { this.children.push(child); return child; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text; }
  set textContent(value) { this._text = String(value); this.children = []; }
  addEventListener(type, handler) { (this.handlers[type] = this.handlers[type] || []).push(handler); }
  fire(type) { for (const handler of this.handlers[type] || []) handler({ target: this }); }
  click() { this.fire('click'); }
  find(className) { const found = []; const walk = (node) => { for (const child of node.children) { if (child.classes.has(className)) found.push(child); walk(child); } }; walk(this); return found; }
  first(className) { return this.find(className)[0]; }
}

function compareDialog(items, entryToCompare) {
  const listeners = [];
  const copied = [];
  const infos = [];
  const document = { createElement: (tag) => new Dom(tag), activeElement: null };
  const window = {
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener: (type, fn) => { const at = listeners.findIndex((l) => l.type === type && l.fn === fn); if (at !== -1) listeners.splice(at, 1); }
  };
  let opened = null;
  let close;
  const FormatUtils = Object.assign(Object.create(require('../utils/format-utils.js')), { copyToClipboard: async (text) => { copied.push(text); return true; } });
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, URL, Intl, Promise, document, window, FormatUtils, HistoryCompare: C,
    Logger: new Proxy({}, { get: () => () => {} }),
    NotificationHelper: { info: (text) => infos.push(text), form: (options) => { opened = options; return new Promise((resolve) => { close = resolve; }); } }
  });
  context.self = context; context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/history/history.js'), 'utf8') + '\n;globalThis.History = History;', context);
  const view = Object.create(context.History.prototype);
  view.historyItems = items;
  const done = view.compareHistoryItem(entryToCompare);
  const form = opened && opened.content;
  const choose = (id) => { const select = form.first('ui-select'); select.value = id; select.fire('change'); };
  return { view, done, form, options: opened, listeners, copied, infos, document, choose, close: (value) => close(value),
    select: form && form.first('ui-select'), where: form && form.first('history-compare-where'), range: form && form.first('history-compare-range'),
    chips: () => form.find('history-compare-chip'), groups: () => form.find('history-compare-group'), rows: (group) => group.find('history-compare-row') };
}

const SEARCH = 'https://search.example/u/1/search-console/performance/search-analytics';
const NINE = ['Canvas Fingerprint', 'CSS Fingerprint', 'Font Fingerprint', 'Hardware Fingerprint', 'Navigator Fingerprint', 'Performance Fingerprint', 'Screen Fingerprint', 'Timezone/Intl Fingerprint', 'Web Storage Fingerprint']
  .map((name) => det(name, 'Fingerprint', 20));
const NOW = T0 + 5 * HOUR;
const shortAt = (ms) => C.shortDateTime(ms, null);

test('the dialog: one short line to pick the scan, its page path under it only when the address differs, one range line', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', `${SEARCH}?resource_id=sc-domain%3Aexample.com`, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const same = entry('same', SEARCH, T0 + HOUR, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const d = compareDialog([later, earlier, same], later);
  assert.deepEqual([d.options.title, d.options.confirmText, d.options.cancelText, d.options.focus === d.select], ['Compare scans', 'Copy as Markdown', 'Close', true]);
  assert.ok(d.form.classes.has('history-dialog-form') && d.form.classes.has('history-compare'));
  assert.ok(d.select.classes.has('ui-select'), 'a dropdown the interface draws');
  assert.equal(d.select.getAttribute('dir'), 'auto');
  const choices = d.select.children;
  assert.deepEqual(choices.map((option) => option.value), ['same', 'earlier'], 'newest first');
  assert.equal(choices[0].textContent, `${shortAt(T0 + HOUR)} · 10 found`, 'a date without seconds and the count: no path, no address');
  assert.equal(choices[1].textContent, `${shortAt(T0)} · 10 found`);
  assert.equal(d.select.value, 'same', 'the scan just before this one, as before');
  assert.equal(d.where.hidden, true, 'the same address: nothing under the list');
  assert.equal(d.select.getAttribute('aria-describedby'), null);
  assert.equal(d.range.textContent, `From ${shortAt(T0 + HOUR)} to ${shortAt(NOW)}`);
  assert.equal(d.range.getAttribute('role'), 'status');
  assert.ok(!/\d:\d\d:\d\d/.test(d.range.textContent), 'no seconds in the range line');

  d.choose('earlier');
  assert.equal(d.where.hidden, false, 'another address: its page path shows');
  assert.equal(d.where.textContent, '/u/1/search-console/performance/search-analytics?resource_id=sc-domain%3Aexample.com');
  assert.equal(d.where.getAttribute('data-tip'), `${SEARCH}?resource_id=sc-domain%3Aexample.com`, 'the full address is the hover text (the shared tooltip)');
  assert.equal(d.select.getAttribute('data-tip'), null, 'the list, focused as the dialog opens, has no tip to cover it');
  assert.match(d.range.getAttribute('data-tip'), /\d:\d\d:\d\d.*\d:\d\d:\d\d/, 'the range with its seconds is the hover text');
  assert.equal(d.select.getAttribute('aria-describedby'), d.where.id, 'a screen reader hears it with the list');
  assert.ok(d.where.id, 'the line has an id to be described by');
  assert.equal(d.range.textContent, `From ${shortAt(T0)} to ${shortAt(NOW)}`);
  d.choose('same');
  assert.equal(d.where.hidden, true);
  assert.equal(d.where.getAttribute('data-tip'), null, 'no stale address left on the hidden line');
  assert.equal(d.select.getAttribute('aria-describedby'), null);
  d.close(false);
  await d.done;
});

test('the dialog: four counts at a glance, the empty ones dimmed, then a group for each kind that has rows', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', SEARCH, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const d = compareDialog([later, earlier], later);
  assert.deepEqual(d.chips().map((chip) => chip.textContent), ['Added0', 'Removed0', 'Changed1', 'Unchanged9']);
  assert.deepEqual(d.chips().map((chip) => chip.classes.has('is-zero')), [true, true, false, false]);
  assert.deepEqual(d.chips().map((chip) => [...chip.classes].find((name) => /^is-(added|removed|changed|same)$/.test(name))), ['is-added', 'is-removed', 'is-changed', 'is-same']);
  const [changed, unchanged] = d.groups();
  assert.equal(d.groups().length, 2, 'no group for a kind with no rows');
  assert.ok(changed.classes.has('history-compare-changed') && unchanged.classes.has('history-compare-same'));
  assert.equal(changed.first('history-compare-heading').textContent, 'Changed (1)');
  assert.equal(changed.first('history-compare-heading').tagName, 'H4');
  assert.equal(changed.first('history-compare-toggle'), undefined, 'Changed has no button: it is always open');
  assert.equal(unchanged.first('history-compare-heading').textContent, 'Unchanged (9)', 'the heading text and the count, as before');
  d.close(false);
  await d.done;
});

test('the dialog: Unchanged is a real button, folded while it holds more than three rows; a click opens it and the choice is kept for the next scan picked', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', SEARCH, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const older = entry('older', SEARCH, T0 - HOUR, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 12)]);
  const d = compareDialog([later, earlier, older], later);
  let unchanged = d.groups()[1];
  let toggle = unchanged.first('history-compare-toggle');
  let list = unchanged.first('history-compare-list');
  assert.equal(toggle.tagName, 'BUTTON');
  assert.equal(toggle.getAttribute('type'), 'button');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false', 'nine rows: folded');
  assert.equal(toggle.getAttribute('aria-controls'), list.id);
  assert.ok(list.id);
  assert.equal(list.hidden, true);
  assert.equal(list.getAttribute('role'), 'list');
  assert.equal(toggle.textContent, 'Unchanged (9)');
  assert.equal(d.rows(unchanged).length, 9, 'the rows are in the page, hidden, not left out');
  toggle.click();
  assert.deepEqual([toggle.getAttribute('aria-expanded'), list.hidden], ['true', false]);
  toggle.click();
  assert.deepEqual([toggle.getAttribute('aria-expanded'), list.hidden], ['false', true]);
  toggle.click();

  d.choose('older');
  unchanged = d.groups()[1];
  toggle = unchanged.first('history-compare-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true', 'opened by the person: it stays open on the next comparison');
  assert.equal(unchanged.first('history-compare-list').hidden, false);
  d.close(false);
  await d.done;
});

test('the dialog: identical scans say so and keep Unchanged open, however long', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const twin = entry('twin', SEARCH, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const d = compareDialog([later, twin], later);
  assert.equal(d.form.first('history-compare-identical').textContent, 'These two scans found the same protections, with the same confidence and evidence.');
  assert.deepEqual(d.chips().map((chip) => chip.textContent), ['Added0', 'Removed0', 'Changed0', 'Unchanged10']);
  assert.equal(d.groups().length, 1);
  const toggle = d.groups()[0].first('history-compare-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(d.groups()[0].first('history-compare-list').hidden, false);
  d.close(false);
  await d.done;
});

test('the dialog: a row is the category\'s icon, the name, the score; a changed row shows the move, its difference and the evidence under the name', async () => {
  const later = entry('later', SEARCH, NOW, [
    det('Cloudflare', 'Anti-Bot', 95, ['cookie', 'header']), det('Turnstile', 'CAPTCHA', 60, ['url']), det('DataDome', 'Anti-Bot', 80, ['cookie']),
    det('Kasada', 'Anti-Bot', 70, ['header']), det('Canvas Fingerprint', 'Fingerprint', 30), det('Unscored', 'Anti-Bot', null, ['url'])]);
  const earlier = entry('earlier', SEARCH, T0, [
    det('Cloudflare', 'Anti-Bot', 70, ['cookie']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Akamai', 'Anti-Bot', 85, ['cookie']),
    det('Kasada', 'Anti-Bot', 70, ['cookie']), det('Canvas Fingerprint', 'Fingerprint', 30), det('Unscored', 'Anti-Bot', null, ['url'])]);
  const d = compareDialog([later, earlier], later);
  const [added, removed, changed, unchanged] = d.groups();
  assert.deepEqual([added, removed, changed, unchanged].map((g) => g.first('history-compare-heading').textContent), ['Added (1)', 'Removed (1)', 'Changed (3)', 'Unchanged (2)']);

  const row = d.rows(added)[0];
  assert.equal(row.tagName, 'LI');
  const icon = row.first('category-icon');
  assert.equal(icon.getAttribute('aria-hidden'), 'true', 'the icon is decoration');
  assert.ok(icon.innerHTML.includes('<svg'), 'the icon History cards use');
  assert.equal(icon.style.color, '#FF5733', 'in its category colour');
  assert.equal(row.first('history-compare-name').textContent, 'DataDome');
  assert.equal(row.first('history-compare-name').children[0].getAttribute('dir'), 'auto', 'a name is the person\'s text: its own direction');
  assert.equal(row.first('history-compare-cat').textContent, 'Anti-bot', 'the category name stays, for a screen reader');
  assert.equal(row.first('history-compare-conf').textContent, '80%');
  assert.equal(d.rows(removed)[0].first('history-compare-conf').textContent, '85%');
  assert.equal(d.rows(unchanged).find((r) => r.first('history-compare-name').textContent === 'Unscored').first('history-compare-conf'), undefined, 'no score, no number');

  const byName = (name) => d.rows(changed).find((r) => r.first('history-compare-name').textContent === name);
  const up = byName('Cloudflare');
  assert.deepEqual(['history-compare-from', 'history-compare-arrow', 'history-compare-to'].map((c) => up.first(c).textContent), ['70%', '→', '95%']);
  assert.equal(up.first('history-compare-delta').textContent, '+25');
  assert.ok(up.first('history-compare-delta').classes.has('is-up'));
  assert.equal(up.first('history-compare-notes').textContent, 'New evidence: HEADER');
  const down = byName('Turnstile');
  assert.equal(down.first('history-compare-delta').textContent, `${unicodeMinus}30`);
  assert.ok(down.first('history-compare-delta').classes.has('is-down'));
  assert.equal(down.first('history-compare-notes'), undefined, 'no evidence change, no second line');
  const evidenceOnly = byName('Kasada');
  assert.equal(evidenceOnly.first('history-compare-conf').textContent, '70%', 'the score did not move: it shows as it is');
  assert.equal(evidenceOnly.first('history-compare-delta'), undefined);
  assert.equal(evidenceOnly.first('history-compare-notes').textContent, 'New evidence: HEADER · Evidence gone: COOKIE');
  d.close(false);
  await d.done;
});

test('the dialog: Enter on the Unchanged button is the button\'s, not the dialog\'s "Copy as Markdown" (the dialog answers Enter by closing)', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', SEARCH, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const d = compareDialog([later, earlier], later);
  const guards = d.listeners.filter((l) => l.type === 'keydown' && l.capture === true);
  assert.equal(guards.length, 1, 'registered before the dialog\'s own handler, which is on the same target and phase');
  const press = (key) => { const event = { key, stopped: false, prevented: false, stopImmediatePropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } }; guards[0].fn(event); return event; };
  d.document.activeElement = d.groups()[1].first('history-compare-toggle');
  const enter = press('Enter');
  assert.deepEqual([enter.stopped, enter.prevented], [true, false], 'the dialog never sees it; the button is still pressed by it');
  assert.equal(press('Escape').stopped, false, 'Escape still closes the dialog');
  d.document.activeElement = d.select;
  assert.equal(press('Enter').stopped, false, 'anywhere else Enter is the dialog\'s');
  d.close(false);
  await d.done;
  assert.equal(d.listeners.filter((l) => l.type === 'keydown').length, 0, 'removed when the dialog closes');
});

test('the dialog: "Copy as Markdown" copies the same report as before, with the dates as the report wrote them; Close copies nothing', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', `${SEARCH}?x=1`, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const copy = compareDialog([later, earlier], later);
  copy.close(true);
  await copy.done;
  assert.equal(copy.copied.length, 1);
  const md = copy.copied[0];
  assert.ok(md.startsWith(`## Compare scans: search.example\n\n${SEARCH}\n\nFrom ${new Date(T0).toLocaleString()} to ${new Date(NOW).toLocaleString()}\n`), md.slice(0, 200));
  assert.ok(md.includes('### Changed\n- Crypto Fingerprint (Fingerprint): 10% → 15% (+5)'), md);
  assert.ok(md.includes('### Unchanged\n- Canvas Fingerprint (Fingerprint, 20%)'), md);
  const shut = compareDialog([later, earlier], later);
  shut.close(false);
  assert.equal(await shut.done, true);
  assert.deepEqual(shut.copied, []);
});

test('the dialog: a page with no other scan says so and opens nothing', async () => {
  const lonely = entry('lonely', SEARCH, NOW, []);
  const d = compareDialog([lonely, entry('other', 'https://other.example/', T0, [])], lonely);
  assert.equal(d.options, null);
  assert.deepEqual(d.infos, ['No other saved scan of this page to compare with']);
  assert.equal(await d.done, false);
});
