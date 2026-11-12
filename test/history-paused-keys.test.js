'use strict';
// History tab, 3.1.8: the note when History is paused (with Resume), moving between entries with the keyboard, and Statistics
// from the "…" menu. The real History runs in a vm with a stub DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const html = read('sections/history/history.html');

function world({ settings = {}, patchOk = true } = {}) {
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, hidden: false, disabled: false, focus() { context.document.activeElement = this; } });
  const patches = [];
  const errors = [];
  const tabs = [];
  const state = { settings };
  const resumeButtons = [el('resume-note'), el('resume-empty')];
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, URL, Intl, Object, Array, String, Number, Promise,
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: Object.assign(Object.create(require('../utils/format-utils.js')), { t: (key, fallback) => fallback }),
    NotificationHelper: { success() {}, info() {}, error: (m) => errors.push(m) },
    Utils: { getSettings: async () => state.settings },
    StorageManager: { patchSettings: async (patch) => { patches.push(plain(patch)); return patchOk; } },
    document: {
      activeElement: null,
      querySelector: (sel) => (['#historyPaused', '#historyEmptyPaused', '#historyEmptyDescription', '#historySearch'].includes(sel) ? el(sel) : null),
      querySelectorAll: (sel) => (sel === '#historyTab .history-paused-resume' ? resumeButtons : [])
    },
    chrome: { runtime: { getURL: p => p }, tabs: { create: (o) => tabs.push(o.url) } }
  });
  context.self = context; context.globalThis = context;
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/history-policy.js', 'modules/core/history-store.js', 'modules/core/history-export.js']) {
    vm.runInContext(read(file), context);
  }
  vm.runInContext(read('sections/history/history.js') + '\n;globalThis.History = globalThis.History || History;', context);
  const view = Object.create(context.History.prototype);
  view.historyItems = [];
  return { view, els, el, patches, errors, tabs, state, context, resumeButtons };
}

/* ---------- Paused ---------- */

test('paused with entries: the note shows above the list; the empty state keeps its own words until it is shown', async () => {
  const w = world({ settings: { history: { historyEnabled: false } } });
  w.view.historyItems = [{ id: 'a' }];
  await w.view.refreshPaused();
  assert.equal(w.view.historyPaused, true);
  assert.equal(w.els['#historyPaused'].hidden, false);
  assert.equal(w.els['#historyEmptyPaused'].hidden, false);
  assert.equal(w.els['#historyEmptyDescription'].hidden, true, 'the empty state no longer promises entries that will not come');
});

test('paused and empty: the empty state says History is paused, and the note above the list stays hidden (one message, not two)', async () => {
  const w = world({ settings: { history: { historyEnabled: false } } });
  await w.view.refreshPaused();
  assert.equal(w.els['#historyPaused'].hidden, true);
  assert.equal(w.els['#historyEmptyPaused'].hidden, false);
  assert.equal(w.els['#historyEmptyDescription'].hidden, true);
});

test('recording (the default, or no history settings at all): no note, and the empty state promises entries as before', async () => {
  for (const settings of [{}, { history: {} }, { history: { historyEnabled: true } }]) {
    const w = world({ settings });
    w.view.historyItems = [{ id: 'a' }];
    await w.view.refreshPaused();
    assert.equal(w.view.historyPaused, false);
    assert.equal(w.els['#historyPaused'].hidden, true);
    assert.equal(w.els['#historyEmptyPaused'].hidden, true);
    assert.equal(w.els['#historyEmptyDescription'].hidden, false);
  }
});

test('Resume turns recording on through the worker (one patch, nothing else), hides the note and moves the keyboard to the search', async () => {
  const w = world({ settings: { history: { historyEnabled: false } } });
  w.view.historyItems = [{ id: 'a' }];
  await w.view.refreshPaused();
  w.context.document.activeElement = w.resumeButtons[0];
  assert.equal(await w.view.resumeHistory(w.resumeButtons[0]), true);
  assert.deepEqual(w.patches, [{ history: { historyEnabled: true } }]);
  assert.equal(w.els['#historyPaused'].hidden, true);
  assert.equal(w.els['#historyEmptyDescription'].hidden, false);
  assert.equal(w.context.document.activeElement, w.els['#historySearch']);
  assert.ok(w.resumeButtons.every(b => b.disabled === false));
});

test('a Resume the worker refuses says so and keeps the note', async () => {
  const w = world({ settings: { history: { historyEnabled: false } }, patchOk: false });
  w.view.historyItems = [{ id: 'a' }];
  await w.view.refreshPaused();
  assert.equal(await w.view.resumeHistory(), false);
  assert.equal(w.errors.length, 1);
  assert.equal(w.els['#historyPaused'].hidden, false);
});

test('the note follows the setting while the popup is open: a settings change in storage reads it again', () => {
  const src = read('sections/history/history.js');
  const listener = src.slice(src.indexOf('registerSettingsListener() {'), src.indexOf('setupPagination() {'));
  assert.ok(/if \(!changes\.scrapfly_settings\) return;\s*\/\/[^\n]*\n\s*this\.refreshPaused\(\);/.test(listener), 'refreshPaused runs on every stored settings change');
  assert.ok(/this\.registerSettingsListener\(\);\s*await this\.refreshPaused\(\);/.test(src), 'and once when the tab starts');
});

test('the markup: a quiet note above the list and one in the empty state, each with a Resume button named by its note', () => {
  const note = html.match(/<div id="historyPaused"[\s\S]*?<\/div>/)[0];
  assert.ok(/\bhidden\b/.test(note.split('>')[0]));
  assert.ok(html.indexOf('id="historyPaused"') < html.indexOf('id="historyList"'));
  assert.ok(/data-i18n="historyPausedNote"/.test(note) && /data-i18n="bulkResume"/.test(note));
  assert.ok(/<button type="button" class="history-paused-resume" aria-describedby="historyPausedText"/.test(note));
  const empty = html.slice(html.indexOf('id="historyEmpty"'));
  assert.ok(/id="historyEmptyDescription"/.test(empty) && /id="historyEmptyPaused"[^>]*hidden/.test(empty));
  assert.ok(/aria-describedby="historyEmptyPausedText"/.test(empty));
  const css = read('sections/history/history.css');
  assert.ok(/\.history-paused\[hidden\],\s*\.history-empty-paused\[hidden\]\s*\{\s*display: none;/.test(css), 'hidden wins over the flex layout');
  for (const code of fs.readdirSync(path.join(root, '_locales'))) {
    const messages = JSON.parse(read(`_locales/${code}/messages.json`));
    assert.ok(messages.historyPausedNote && messages.historyPausedNote.message, code);
  }
});

/* ---------- Keyboard ---------- */

test('cardMove: j/ArrowDown and k/ArrowUp go to the next and previous card, Home and End to the first and last of the page', () => {
  const move = (key, index, count = 5, page = 2, pages = 3) => plain(world().context.History.cardMove(key, index, count, page, pages));
  assert.deepEqual(move('j', 1), { page: 2, index: 2 });
  assert.deepEqual(move('ArrowDown', 1), { page: 2, index: 2 });
  assert.deepEqual(move('k', 1), { page: 2, index: 0 });
  assert.deepEqual(move('ArrowUp', 1), { page: 2, index: 0 });
  assert.deepEqual(move('Home', 3), { page: 2, index: 0 });
  assert.deepEqual(move('End', 1), { page: 2, index: 4 });
  assert.equal(move('Home', 0), null, 'already there');
  assert.equal(move('End', 4), null);
  for (const key of ['ArrowLeft', 'ArrowRight', 'J', 'x', 'Enter', 'PageDown']) assert.equal(move(key, 1), null, key);
});

test('cardMove: at the edge of a page the page turns, to its first card going down and its last going up; not past the ends', () => {
  const { History } = world().context;
  assert.deepEqual(plain(History.cardMove('j', 4, 5, 2, 3)), { page: 3, index: 'first' });
  assert.deepEqual(plain(History.cardMove('k', 0, 5, 2, 3)), { page: 1, index: 'last' });
  assert.equal(History.cardMove('j', 4, 5, 3, 3), null, 'the last card of the last page');
  assert.equal(History.cardMove('k', 0, 5, 1, 3), null, 'the first card of the first page');
  assert.equal(History.cardMove('j', 0, 0, 1, 1), null);
});

function keyWorld({ perPage = 3, total = 7, page = 1 } = {}) {
  const w = world();
  const all = Array.from({ length: total }, (_, i) => `e${i}`);
  const pm = {
    currentPage: page,
    getTotalPages: () => Math.ceil(total / perPage),
    goToPage(p) { this.currentPage = p; draw(); }
  };
  let cards = [];
  const list = { querySelectorAll: (sel) => (sel === '.history-item' ? cards : []) };
  function draw() {
    const start = (pm.currentPage - 1) * perPage;
    cards = all.slice(start, start + perPage).map(id => ({ id, scrollIntoView() {}, focus() { w.context.document.activeElement = this; } }));
  }
  draw();
  const doc = w.context.document;
  const base = doc.querySelector;
  doc.querySelector = (sel) => (sel === '#historyList' ? list : (sel === '.modal.show, .modal-overlay.show' ? w.state.modal || null : base(sel)));
  w.view.paginationManager = pm;
  w.view.closeMenus = () => {};
  const press = (key, at, mods = {}) => {
    const event = { key, currentTarget: cards[at], target: cards[at], ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods };
    return w.view.moveCardFocus(event);
  };
  return { w, pm, press, focused: () => (doc.activeElement ? doc.activeElement.id : null) };
}

test('moving on a page, and turning the page at its edge, focuses the right card', () => {
  const k = keyWorld();
  assert.equal(k.press('j', 0), true);
  assert.equal(k.focused(), 'e1');
  assert.equal(k.press('End', 0), true);
  assert.equal(k.focused(), 'e2');
  assert.equal(k.press('ArrowDown', 2), true, 'the last card of page 1');
  assert.equal(k.pm.currentPage, 2);
  assert.equal(k.focused(), 'e3', 'the first card of page 2');
  assert.equal(k.press('k', 0), true);
  assert.equal(k.pm.currentPage, 1);
  assert.equal(k.focused(), 'e2', 'back to the last card of page 1');
});

test('the last page may be short: going up from it into a full page lands on that page\'s last card', () => {
  const k = keyWorld({ page: 3 });
  assert.equal(k.press('Home', 0), true, 'already the first card: the key is still the list\'s (the popup does not scroll instead)');
  assert.equal(k.focused(), null, 'and the focus is not moved');
  assert.equal(k.press('ArrowUp', 0), true);
  assert.equal(k.pm.currentPage, 2);
  assert.equal(k.focused(), 'e5');
});

test('never with a modifier key or with a dialog open; the edge of History takes the key but goes nowhere', () => {
  const k = keyWorld();
  for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
    assert.equal(k.press('j', 0, mods), false, JSON.stringify(mods));
  }
  assert.equal(k.focused(), null);
  k.w.state.modal = {};
  assert.equal(k.press('j', 0), false, 'a dialog is open');
  k.w.state.modal = null;
  assert.equal(k.press('k', 0), true, 'the first card of History: the arrow does not scroll the popup instead');
  assert.equal(k.pm.currentPage, 1);
});

test('the card handler only moves for keys on the card itself (not its buttons), and cards name their shortcuts', () => {
  const src = read('sections/history/history.js');
  assert.ok(/if \(e\.target !== e\.currentTarget\) return;\s*if \(e\.key !== 'Enter' && e\.key !== ' '\) \{\s*if \(this\.moveCardFocus\(e\)\) e\.preventDefault\(\);/.test(src));
  assert.ok(src.includes('aria-keyshortcuts="${History.CARD_KEYS}"'));
  assert.equal(world().context.History.CARD_KEYS, 'j k ArrowDown ArrowUp Home End');
});

/* ---------- Statistics ---------- */

test('History\'s "…" menu opens Statistics with Settings\' own words, in a new tab like Settings → Data does', () => {
  const menu = html.slice(html.indexOf('id="historyMenu"'), html.indexOf('id="importHistoryBtn"'));
  assert.ok(/<button id="openStatsBtn" class="history-menu-item" role="menuitem">[\s\S]*?<span data-i18n="settingsOpenStats">Open statistics<\/span>/.test(menu));
  const w = world();
  w.view.openStatistics();
  assert.deepEqual(w.tabs, ['sections/stats/stats.html']);
  // In the popup Settings' own opener is used when it is loaded
  const calls = [];
  w.context.SettingsUI = { openHistoryStats: () => calls.push(true) };
  w.view.openStatistics();
  assert.equal(calls.length, 1);
  assert.equal(w.tabs.length, 1);
  assert.ok(read('sections/history/history.js').includes("document.querySelector('#historyTab #openStatsBtn')"));
});
