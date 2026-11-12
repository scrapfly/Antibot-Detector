'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Detection tab, 3.1.8: three quiet lines.
//   1. Under the site's name: the results were found on another page of the site (the Domain cache scope), which one and when,
//      with Scan again now. Never under the Path or Full URL scopes.
//   2. Under the all-clear card of a scan that found nothing: "Last checked …" and Scan again now (a clean result is cached for
//      days, so a reload shows the same card).
//   3. Under the stats: what History says changed on the page since its earlier scan, with Compare scans and Watch for changes.
//      Read from History after the results are drawn; skipped while History is paused and when line 1 shows.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('sections/detection/detection.html');
const HistoryStore = require('../modules/core/history-store.js');

const plain = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value));
const HOUR = 60 * 60 * 1000;
const flush = () => new Promise(resolve => setTimeout(resolve, 5));

function element(children = {}) {
  const attributes = new Map();
  const handlers = {};
  return {
    hidden: true, disabled: false, textContent: '', title: '', handlers,
    setAttribute(key, value) { attributes.set(key, String(value)); },
    getAttribute(key) { return attributes.has(key) ? attributes.get(key) : null; },
    removeAttribute(key) { attributes.delete(key); if (key === 'title') this.title = ''; },
    addEventListener(type, fn) { handlers[type] = fn; },
    click() { return handlers.click && handlers.click({ stopPropagation() {} }); },
    querySelector(selector) { return children[selector] || null; },
    querySelectorAll() { return []; }
  };
}

/** A note as the template draws it: a text span, separators and action groups. */
function note(actions = []) {
  const children = { '.detection-note-text': element(), '.detection-note-sep': element() };
  for (const action of actions) children[`[data-change-action="${action}"]`] = element();
  const node = element(children);
  node.text = children['.detection-note-text'];
  node.action = (name) => children[`[data-change-action="${name}"]`];
  return node;
}

function fixture({ tabUrl = 'https://shop.example/login', history = [], settings = {}, answer = { status: 'ok', updated: 1 }, popup = null } = {}) {
  const log = { reads: 0, messages: [], toasts: [] };
  const els = {
    '#detectionSourceNote': note(), '#emptyCheckedNote': note(), '#detectionChangeNote': note(['compare', 'watch', 'watching']),
    '#changeWatchBtn': element()
  };
  const context = {
    console, setTimeout, clearTimeout, URL, Intl,
    Logger: { debug() {}, warn() {}, error() {} },
    NotificationHelper: { error: (text) => log.toasts.push(['error', text]), success: (text) => log.toasts.push(['success', text]), info() {} },
    Utils: { getHistorySettings: async () => ({ historyEnabled: settings.historyEnabled !== false, ...settings }) },
    HistoryStore: { ...HistoryStore, read: async () => { log.reads++; return history; } },
    chrome: {
      tabs: { query: async () => [{ id: 3, url: tabUrl }] },
      runtime: { sendMessage: async (message) => { log.messages.push(message); return answer; }, getURL: (p) => p },
      storage: { local: {} }
    },
    document: { querySelector: (selector) => els[selector] || null, querySelectorAll: () => [] }
  };
  context.window = popup ? { popupInstance: popup } : {};
  context.self = context;
  vm.createContext(context);
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/history-filter.js', 'modules/core/history-policy.js',
    'modules/core/history-compare.js', 'modules/core/detection-history.js', 'utils/format-utils.js',
    'sections/detection/detection-ui.js', 'sections/detection/detection-actions.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const detection = { isShowingResults: true, currentResults: [], cacheMetadata: null, viewedTabUrl: tabUrl };
  return { UI: context.DetectionUI, A: context.DetectionActions, detection, els, log };
}

const det = (name, category = 'antibot') => ({ name, category, confidence: 90 });

test('the three lines are in the template, hidden until they have something to say, with link-style buttons', () => {
  const summary = html.slice(html.indexOf('class="url-display-line"'), html.indexOf('class="search-container detection-search"'));
  const source = summary.indexOf('id="detectionSourceNote"');
  assert.ok(source > summary.indexOf('id="copyOverviewMenu"') && source < summary.indexOf('class="stats-line"'), 'under the Site row, above the stats');
  const change = summary.indexOf('id="detectionChangeNote"');
  assert.ok(change > summary.indexOf('class="cache-expiry-line"'), 'under the stats, above the search');
  const card = html.slice(html.indexOf('id="emptyState"'), html.indexOf('id="detectionResults"'));
  assert.ok(card.indexOf('id="emptyCheckedNote"') > card.indexOf('class="state-card-badges"'), 'under the all-clear badges');

  for (const id of ['detectionSourceNote', 'emptyCheckedNote', 'detectionChangeNote']) {
    assert.match(html.match(new RegExp(`<[a-z]+ id="${id}"[^>]*>`))[0], /\bhidden\b/, id);
  }
  for (const [id, key] of [['sourceRescanBtn', 'historyScanAgain'], ['checkedRescanBtn', 'historyScanAgain'], ['changeCompareBtn', 'historyCompareTitle'], ['changeWatchBtn', 'historyWatch']]) {
    const tag = html.match(new RegExp(`<button id="${id}"[^>]*>`))[0];
    assert.match(tag, /class="detection-link-btn"/, id);
    assert.match(tag, /type="button"/, id);
    assert.match(tag, new RegExp(`data-i18n="${key}"`), `${id}: the existing wording`);
  }
  const css = read('sections/detection/detection.css');
  const link = css.match(/\.detection-link-btn\s*\{[^}]*\}/)[0];
  assert.match(link, /color:\s*var\(--text-secondary\)/, 'secondary text, no accent colour');
  assert.doesNotMatch(link, /--accent/);
  assert.match(css, /\.detection-link-btn:focus-visible\s*\{[^}]*--accent/, 'the accent only on focus');
  assert.doesNotMatch(css.slice(css.indexOf('.detection-summary-note {')), /\b(margin|padding)-(left|right)\b|text-align:\s*(left|right)/, 'RTL-safe');
});

test('Scan again works from every button of the tab, the two new ones too', () => {
  const ids = ['rescanBtn', 'emptyRescanBtn', 'checkedRescanBtn', 'sourceRescanBtn'];
  const buttons = Object.fromEntries(ids.map(id => [`#${id}`, element()]));
  const context = vm.createContext({
    console, window: {}, Logger: { debug() {}, warn() {}, error() {} },
    chrome: { storage: { local: { get: async () => ({}) } }, runtime: { onMessage: { addListener() {} } }, tabs: { onUpdated: { addListener() {} } }, action: {} },
    DetectionUI: { observeResultsListSize() {} }, DetectionModals: { initializeModalElements() {} },
    document: { querySelector: (selector) => buttons[selector] || null }
  });
  vm.runInContext(read('sections/detection/detection.js'), context, { filename: 'detection.js' });
  const detection = Object.create(context.window.Detection.prototype);
  let asked = 0;
  detection.rescan = () => { asked++; };
  detection.setupEventListeners();
  for (const id of ids) buttons[`#${id}`].click();
  assert.equal(asked, ids.length);
  // and all of them are off while the worker answers
  assert.match(read('sections/detection/detection-actions.js'), /RESCAN_BUTTONS = '#rescanBtn, #emptyRescanBtn, #checkedRescanBtn, #sourceRescanBtn'/);
});

test('line 1: results found on another page of the site say which page and when', async () => {
  const { UI, detection, els } = fixture({ tabUrl: 'https://shop.example/login' });
  const other = await UI.syncSourceNote.call(detection, { url: 'https://shop.example/', timestamp: Date.now() - 3 * HOUR, cacheScope: 'domain' });
  assert.equal(other.path, '/');
  const line = els['#detectionSourceNote'];
  assert.equal(line.hidden, false);
  assert.equal(line.text.textContent, 'From a scan of /, 3h ago');
  assert.match(line.text.title, /^https:\/\/shop\.example\//, 'the whole address on hover');
});

test('line 1: this page\'s own scan, and the Path and Full URL scopes, show nothing', async () => {
  for (const meta of [
    { url: 'https://shop.example/login?next=1', timestamp: Date.now(), cacheScope: 'domain' },
    { url: 'https://shop.example/', timestamp: Date.now(), cacheScope: 'path' },
    { url: 'https://shop.example/', timestamp: Date.now(), cacheScope: 'full' },
    null
  ]) {
    const { UI, detection, els } = fixture({ tabUrl: 'https://shop.example/login' });
    els['#detectionSourceNote'].hidden = false;
    await UI.syncSourceNote.call(detection, meta);
    assert.equal(els['#detectionSourceNote'].hidden, true, JSON.stringify(meta));
  }
});

test('line 2: a clean result says when it was checked and offers Scan again now; another page\'s clean result says which page', async () => {
  const at = Date.now() - 2 * HOUR;
  const own = fixture({ tabUrl: 'https://shop.example/' });
  own.detection.scanOutcome = 'complete';
  await own.UI.syncCheckedNote.call(own.detection, { url: 'https://shop.example/', timestamp: at, cacheScope: 'domain' });
  assert.equal(own.els['#emptyCheckedNote'].hidden, false);
  assert.equal(own.els['#emptyCheckedNote'].text.textContent, 'Last checked 2h ago', 'the existing "Last checked {0}" wording');

  const other = fixture({ tabUrl: 'https://shop.example/login' });
  other.detection.scanOutcome = 'complete';
  await other.UI.syncCheckedNote.call(other.detection, { url: 'https://shop.example/', timestamp: at, cacheScope: 'domain' });
  assert.equal(other.els['#emptyCheckedNote'].text.textContent, 'From a scan of /, 2h ago');

  // no date known: only the button
  const bare = fixture();
  bare.detection.scanOutcome = 'complete';
  await bare.UI.syncCheckedNote.call(bare.detection, {});
  assert.equal(bare.els['#emptyCheckedNote'].hidden, false);
  assert.equal(bare.els['#emptyCheckedNote'].text.textContent, '');
});

test('line 2: no completed scan (failed, interrupted, none yet) has no Last checked line', async () => {
  const { UI, detection, els } = fixture();
  els['#emptyCheckedNote'].hidden = false;
  detection.scanOutcome = 'failed';
  await UI.syncCheckedNote.call(detection, { timestamp: Date.now() });
  assert.equal(els['#emptyCheckedNote'].hidden, true);
  detection.scanOutcome = 'complete';
  els['#emptyCheckedNote'].hidden = false;
  await UI.syncCheckedNote.call(detection, null);
  assert.equal(els['#emptyCheckedNote'].hidden, true);
});

test('showEmptyState hands the scan to line 2 only for a completed scan; displayResults passes the result\'s metadata', () => {
  const ui = read('sections/detection/detection-ui.js');
  assert.match(ui, /syncCheckedNote\.call\(this, this\.scanOutcome === 'complete' \? \(options\.scan \|\| \{\}\) : null\)/);
  assert.match(ui, /this\.showEmptyState\(\{ scan: options\.cacheMetadata \|\| null \}\)/);
});

const T0 = Date.UTC(2026, 10, 1, 9, 0, 0);
const changed = [
  { id: 'a', url: 'https://shop.example/login', timestamp: T0, detections: [det('Kasada')] },
  { id: 'b', url: 'https://shop.example/login', timestamp: T0 + HOUR, detections: [det('DataDome')], changed: { at: T0 + HOUR, added: ['DataDome'], removed: ['Kasada'] } }
];

test('line 3: a change since the earlier scan names what came and went, with Compare scans and Watch for changes', async () => {
  const { UI, detection, els, log } = fixture({ history: changed });
  detection.currentResults = [det('DataDome')];
  await UI.syncChangeNote.call(detection);
  const line = els['#detectionChangeNote'];
  assert.equal(log.reads, 1);
  assert.equal(line.hidden, false);
  assert.match(line.text.textContent, /^Changed since .+: \+DataDome −Kasada$/);
  assert.equal(line.action('compare').hidden, false);
  assert.equal(line.action('watch').hidden, false);
  assert.equal(line.action('watching').hidden, true);
  assert.equal(detection.changeEntry.id, 'b', 'the newest saved scan is what Compare and Watch act on');
});

test('line 3: the line is one line, so its hover text holds what an ellipsis may cut, and the date', async () => {
  const { UI, detection, els } = fixture({ history: changed });
  detection.currentResults = [det('DataDome')];
  await UI.syncChangeNote.call(detection);
  const line = els['#detectionChangeNote'];
  const [whole, date] = line.text.title.split('\n');
  assert.equal(whole, line.text.textContent, 'the whole line on hover');
  assert.ok(date && /\d/.test(date), `the date of the earlier scan on hover: ${line.text.title}`);
});

test('the summary card\'s lines take one line each, and the results list gives their room back (the first page fits)', () => {
  // 3.1.8 merge: the change line wrapped to two or three lines and the two cards of a first page went under the pagination bar
  // (e2e-v313-filters "Detection first pages fit above the pagination without scrolling")
  const css = read('sections/detection/detection.css');
  const rule = (selector) => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, selector);
    return css.slice(at, css.indexOf('}', at));
  };
  const summary = rule('.detection-summary-note');
  assert.match(summary, /white-space:\s*nowrap/, 'one line');
  assert.match(summary, /overflow:\s*hidden/);
  assert.doesNotMatch(summary, /overflow-wrap:\s*anywhere/);
  const text = rule('.detection-summary-note .detection-note-text');
  assert.match(text, /text-overflow:\s*ellipsis/, 'the text gives way');
  assert.match(text, /min-width:\s*0/);
  assert.match(rule('.detection-summary-note .detection-note-action'), /flex:\s*0 0 auto/, 'the buttons stay whole');
  for (const target of ['.results-list {', '.detection-group-head {', '.card-header {']) {
    assert.ok(css.split('.detection-results:has(.detection-summary-note:not([hidden]))').slice(1).some(part => part.split('\n')[0].includes(target)),
      `the list gives the room back: ${target}`);
  }
});

test('line 3: no change, and a watched page says Watching', async () => {
  const history = [
    { id: 'a', url: 'https://shop.example/login', timestamp: T0, detections: [det('Akamai')] },
    { id: 'b', url: 'https://shop.example/login', timestamp: T0 + HOUR, detections: [det('Akamai')], watch: true, pinned: true }
  ];
  const { UI, detection, els } = fixture({ history });
  detection.currentResults = [det('Akamai')];
  await UI.syncChangeNote.call(detection);
  const line = els['#detectionChangeNote'];
  assert.match(line.text.textContent, /^No change since /);
  assert.equal(line.action('watch').hidden, true);
  assert.equal(line.action('watching').hidden, false);
});

test('line 3: History paused, or results from another page, show nothing and do not read History', async () => {
  const paused = fixture({ history: changed, settings: { historyEnabled: false } });
  paused.detection.currentResults = [det('DataDome')];
  paused.els['#detectionChangeNote'].hidden = false;
  await paused.UI.syncChangeNote.call(paused.detection);
  assert.equal(paused.els['#detectionChangeNote'].hidden, true);
  assert.equal(paused.log.reads, 0);

  const other = fixture({ history: changed, tabUrl: 'https://shop.example/login' });
  other.detection.currentResults = [det('DataDome')];
  other.detection.cacheMetadata = { url: 'https://shop.example/', timestamp: T0, cacheScope: 'domain' };
  other.els['#detectionChangeNote'].hidden = false;
  await other.UI.syncChangeNote.call(other.detection);
  assert.equal(other.els['#detectionChangeNote'].hidden, true);
  assert.equal(other.log.reads, 0);
});

test('line 3: a page with no saved entry, or results the tab no longer shows, leave the line hidden', async () => {
  const none = fixture({ history: [] });
  await none.UI.syncChangeNote.call(none.detection);
  assert.equal(none.els['#detectionChangeNote'].hidden, true);

  const gone = fixture({ history: changed });
  gone.detection.currentResults = [det('DataDome')];
  const pending = gone.UI.syncChangeNote.call(gone.detection);
  gone.detection.isShowingResults = false;
  await pending;
  assert.equal(gone.log.reads, 0, 'the read waits for the results to be drawn, and a tab that moved on does not read');
});

test('displayResults draws the results before it reads History, and the line follows stored History', () => {
  const ui = read('sections/detection/detection-ui.js');
  const display = ui.slice(ui.indexOf('DetectionUI.displayResults = '), ui.indexOf('DetectionUI.updateStats = '));
  assert.ok(display.indexOf('this.paginationManager.setItems') < display.indexOf('DetectionUI.syncChangeNote.call(this)'));
  assert.doesNotMatch(display, /await DetectionUI\.syncChangeNote/, 'never awaited: History cannot hold the results back');
  const js = read('sections/detection/detection.js');
  assert.match(js, /changes\[HistoryStore\.STORAGE_KEY\]\)\)\s*\{\s*DetectionUI\.scheduleChangeNote\.call\(this\)/);
});

test('Watch for changes asks the worker by name, as History\'s menu does, and says so', async () => {
  const { A, detection, log } = fixture({ history: changed });
  detection.changeEntry = changed[1];
  await A.watchChange.call(detection);
  assert.deepEqual(plain(log.messages), [{ type: HistoryStore.Messages.UPDATE_ITEM, id: 'b', patch: { watch: true } }]);
  assert.deepEqual(plain(log.toasts), [['success', 'Watching this page. Turn on Watch pinned pages in Settings → History for it to be checked.']], 'the watchlist is off by default');
});

test('Watch for changes on a full watchlist says so in History\'s words', async () => {
  const { A, detection, log } = fixture({ history: changed, answer: { status: 'ok', updated: 0, limit: 20 } });
  detection.changeEntry = changed[1];
  await A.watchChange.call(detection);
  assert.deepEqual(plain(log.toasts), [['error', 'You can watch up to 20 pages. Stop watching one first.']]);
});

test('Compare scans opens the History tab and its compare dialog on the page\'s newest saved scan', async () => {
  const steps = [];
  const stored = { ...changed[1], fresh: true };
  const popup = {
    switchTab: async (tab) => { steps.push(['tab', tab]); },
    history: {
      historyItems: [],
      loadHistoryFromStorage: async function() { steps.push(['load']); this.historyItems = [changed[0], stored]; },
      compareHistoryItem: async (item) => { steps.push(['compare', item.id, item.fresh === true]); return true; }
    }
  };
  const { A, detection } = fixture({ history: changed, popup });
  detection.changeEntry = changed[1];
  await A.compareChange.call(detection);
  await flush();
  assert.deepEqual(steps, [['tab', 'history'], ['load'], ['compare', 'b', true]], 'History\'s own copy of the entry');
});
