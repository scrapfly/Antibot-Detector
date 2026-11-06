'use strict';
// History for the keyboard and for a screen reader: where the focus goes when the list is drawn again (UI-03), what a card and
// its buttons say (UI-04), what the details window's headers and matched values say and do (UI-05), what a search or a chip leaves
// being said aloud (UI-08), and the tips' "label: value" written the way each language writes it (UI-12).
// The real History runs in a vm; the DOM is a small stand-in that knows the list, its cards and where the focus is.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
/** The attributes of every <name ...> tag in some HTML, as objects (so a test does not depend on the order they are written in). */
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'g'))]
  .map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1], attr[2]])));

/** The page: the elements History looks up by selector, a list that turns its HTML into cards, and the focus. */
function fakePage() {
  let active = null;
  const body = { tagName: 'BODY' };
  const doc = {
    body, elements: {}, items: [],
    get activeElement() { return active || body; },
    querySelector: (selector) => doc.elements[selector] || null,
    querySelectorAll: (selector) => (selector === '.history-modal-method-item[data-copy-payload]' ? doc.items : [])
  };
  const element = (selector, own = {}) => {
    // `own` keeps its getters and setters (Object.assign would turn them into plain values)
    const defaults = { hidden: false, style: {}, textContent: '', querySelectorAll: () => [], focus() { active = this; }, contains(other) { return other === this; } };
    for (const key of Object.keys(defaults)) if (!(key in own)) own[key] = defaults[key];
    doc.elements[selector] = own;
    return own;
  };
  const card = (id) => {
    const made = {
      dataset: { historyId: id },
      focus() { active = this; },
      closest: (selector) => (selector === '.history-item' ? made : null),
      querySelector: (selector) => (selector === '[data-action="menu"]' ? made.more : null)
    };
    made.more = { dataset: { action: 'menu' }, focus() { active = this; }, closest: (selector) => (selector === '.history-item' ? made : null) };
    return made;
  };
  const list = element('#historyList', {
    cards: [], html: '',
    contains(other) { return this.cards.some(entry => entry === other || entry.more === other); },
    querySelectorAll(selector) { return selector === '.history-item' ? this.cards.slice() : []; },
    get innerHTML() { return this.html; },
    set innerHTML(html) {
      // The focused button goes with the old cards: the browser leaves the focus on the page
      if (this.contains(active)) active = null;
      this.html = html;
      this.cards = [...html.matchAll(/class="history-item[^"]*" data-history-id="([^"]*)"/g)].map(match => card(match[1]));
    }
  });
  for (const selector of ['#historySearch', '#historyEmpty', '#historyNoResults', '#historyPagination', '#historyFilters',
    '#historyStatus', '#historyModalStatus', '#historyPagination .pagination-info']) element(selector);
  return { doc, list, focus: (el) => { active = el; }, blur: () => { active = null; }, get active() { return doc.activeElement; } };
}

const ENGLISH = {};
/** History, as the popup loads it, with a clock the test moves, the toasts, the clipboard and Scrapfly dialog it was asked for. */
function load({ messages = ENGLISH } = {}) {
  const page = fakePage();
  const clock = { now: 0, timers: [] };
  const calls = { copies: [], scrapfly: [], toasts: [] };
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, Intl, URL, Promise,
    setTimeout: (fn, ms = 0) => { clock.timers.push({ fn, at: clock.now + ms, live: true }); return clock.timers.length; },
    clearTimeout: (id) => { if (clock.timers[id - 1]) clock.timers[id - 1].live = false; },
    Logger: new Proxy({}, { get: () => () => {} }),
    chrome: { runtime: { getURL: (p) => `chrome-extension://id/${p}` } },
    UrlUtils: { resolveDisplayFavicon: () => 'fav.png', getDefaultFaviconUrl: () => 'default.png' },
    I18n: {
      get: (key) => (Object.hasOwn(messages, key) ? messages[key] : null),
      format: (key, ...args) => (Object.hasOwn(messages, key) ? messages[key].replace(/\{(\d+)\}/g, (_, i) => args[Number(i)]) : null),
      tr: (key, fallback) => (Object.hasOwn(messages, key) ? messages[key] : fallback)
    },
    ScrapflyExport: { logoHtml: (cls) => `<img class="${cls}" alt="">`, targetUrl: (url) => (/^https?:/.test(url) ? url : ''), open: (options) => calls.scrapfly.push(options) },
    NotificationHelper: {
      confirm: async () => true,
      form: async () => true,
      success: (m) => calls.toasts.push(['success', m]), error: (m) => calls.toasts.push(['error', m]), info: (m) => calls.toasts.push(['info', m])
    },
    document: page.doc
  });
  context.self = context; context.window = context; context.globalThis = context;
  for (const file of ['modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'modules/core/history-store.js',
    'modules/core/history-filter.js', 'sections/history/history.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  context.FormatUtils.copyToClipboard = async (text, options) => { calls.copies.push({ text, options }); return true; };
  const view = Object.create(context.History.prototype);
  Object.assign(view, {
    detectorManager: { getDetectorByName: () => null, getCategoryInfo: () => null, categoryManager: { getTagColor: () => '#666666' } },
    historyItems: [], searchQuery: '', activeChips: context.HistoryFilter.normalizeChips(), historyLimit: 0, selectMode: false
  });
  // What the pagination does: write the "Showing 1-20 of 57" line and draw the page
  view.paginationManager = {
    setItems(items) {
      page.doc.elements['#historyPagination .pagination-info'].textContent = items.length ? `Showing 1-${Math.min(20, items.length)} of ${items.length}` : 'No items to display';
      view.renderHistoryPage(items.slice(0, 20));
    }
  };
  // The clock: the timers due within `ms` run, in order, and the ones they set run too when they are due
  const advance = (ms) => {
    const until = clock.now + ms;
    for (;;) {
      const due = clock.timers.filter(timer => timer.live && timer.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.live = false; clock.now = due.at; due.fn();
    }
    clock.now = until;
  };
  return { view, page, context, calls, advance, History: context.History, FormatUtils: context.FormatUtils };
}

const det = (name, category, confidence, extra = {}) => ({ detector: { name }, category, confidence, ...extra });
const entry = (id, extra = {}) => ({ id, url: `https://${id}.example/page`, hostname: `${id}.example`, title: `Page ${id}`, timestamp: 1700000000000, detections: [det('Cloudflare', 'Anti-Bot', 85)], ...extra });
/** The entries are in storage; the list is drawn. */
function drawn(h, ids) {
  h.view.historyItems = ids.map((id, index) => entry(id, { timestamp: 1700000000000 - index }));
  h.view.renderHistory();
  return h;
}
const cardIds = (h) => h.page.list.cards.map(card => card.dataset.historyId);
const where = (h) => {
  const active = h.page.active;
  const card = active && active.closest ? active.closest('.history-item') : null;
  return { id: card ? card.dataset.historyId : null, control: active === card ? 'card' : (active && active.dataset && active.dataset.action) || (active === h.page.doc.elements['#historySearch'] ? 'search' : 'elsewhere') };
};

// ---------------------------------------------------------------------------------------------------------------------------------
// UI-03: the focus after the list is drawn again
// ---------------------------------------------------------------------------------------------------------------------------------
test('a pin or a note redraws the list: the focus is on the same entry\'s "…" button, not on the page', async () => {
  const h = drawn(load(), ['a', 'b', 'c']);
  const before = h.page.list.cards[1].more;
  h.page.focus(before);
  h.view.sendHistoryChange = async () => ({ status: 'ok' });
  h.view.loadHistoryFromStorage = async () => { h.view.historyItems = h.view.historyItems.map(item => (item.id === 'b' ? { ...item, pinned: true } : item)); };
  await h.view.annotateItem(h.view.historyItems[1], { pinned: true });
  assert.notEqual(h.page.list.cards[1].more, before, 'the card was drawn again');
  assert.deepEqual(where(h), { id: 'b', control: 'menu' });
});

test('a pin that moves the entry (the Pinned chip is on and it leaves) hands the focus to the card that took its place', async () => {
  const h = drawn(load(), ['a', 'b', 'c']);
  h.view.historyItems = h.view.historyItems.map(item => ({ ...item, pinned: true }));
  h.view.activeChips.pinned = true;
  h.view.renderHistory();
  h.page.focus(h.page.list.cards[1].more);
  h.view.sendHistoryChange = async () => ({ status: 'ok' });
  h.view.loadHistoryFromStorage = async () => { h.view.historyItems = h.view.historyItems.map(item => (item.id === 'b' ? { ...item, pinned: false } : item)); };
  await h.view.annotateItem(h.view.historyItems[1], { pinned: false });
  assert.deepEqual(cardIds(h), ['a', 'c']);
  assert.deepEqual(where(h), { id: 'c', control: 'card' });
});

test('deleting an entry puts the focus on the next card; on the one before when it was the last; on the search when none is left', async () => {
  const deleteFrom = async (h, id) => {
    h.view.sendHistoryChange = async () => ({ status: 'ok' });
    h.view.loadHistoryFromStorage = async () => { h.view.historyItems = h.view.historyItems.filter(item => item.id !== id); };
    await h.view.deleteHistoryItem(h.view.historyItems.find(item => item.id === id));
  };
  const h = drawn(load(), ['a', 'b', 'c']);
  h.page.focus(h.page.list.cards[1].more);
  await deleteFrom(h, 'b');
  assert.deepEqual(cardIds(h), ['a', 'c']);
  assert.deepEqual(where(h), { id: 'c', control: 'card' }, 'the next card');
  h.page.focus(h.page.list.cards[1].more);
  await deleteFrom(h, 'c');
  assert.deepEqual(where(h), { id: 'a', control: 'card' }, 'the last one went: the card before it');
  h.page.focus(h.page.list.cards[0].more);
  await deleteFrom(h, 'a');
  assert.equal(h.page.active, h.page.doc.elements['#historySearch'], 'nothing left to land on: the search');
});

test('the dialog of a note or a delete may have lost the focus before the list is drawn: the entry still gets it back', async () => {
  const h = drawn(load(), ['a', 'b', 'c']);
  h.page.blur();
  h.view.sendHistoryChange = async () => ({ status: 'ok' });
  h.view.loadHistoryFromStorage = async () => {};
  await h.view.annotateItem(h.view.historyItems[2], { note: 'x' });
  assert.deepEqual(where(h), { id: 'c', control: 'menu' });
  // ...and the same for a delete, to the card that takes its place
  h.page.blur();
  h.view.loadHistoryFromStorage = async () => { h.view.historyItems = h.view.historyItems.filter(item => item.id !== 'a'); };
  await h.view.deleteHistoryItem(h.view.historyItems[0]);
  assert.deepEqual(where(h), { id: 'b', control: 'card' });
});

test('a redraw never takes the focus from where the person has gone, and a hint is used once', async () => {
  const h = drawn(load(), ['a', 'b', 'c']);
  const search = h.page.doc.elements['#historySearch'];
  h.page.focus(h.page.list.cards[1].more);
  h.view.sendHistoryChange = async () => ({ status: 'ok' });
  h.view.loadHistoryFromStorage = async () => {};
  // They typed in the search while the worker was saving
  const saving = h.view.annotateItem(h.view.historyItems[1], { pinned: true });
  h.page.focus(search);
  await saving;
  assert.equal(h.page.active, search, 'the search keeps the focus');
  // The hint of that action is gone: a later redraw with the focus nowhere does not jump to the card
  h.page.blur();
  h.view.renderHistory();
  assert.equal(h.page.active, h.page.doc.body);
});

test('a redraw that nobody asked for (a scan saved, the watchlist) keeps the focus where it was in the list', () => {
  const h = drawn(load(), ['a', 'b', 'c']);
  h.page.focus(h.page.list.cards[2]);
  h.view.renderHistory();
  assert.deepEqual(where(h), { id: 'c', control: 'card' });
  h.page.focus(h.page.list.cards[0].more);
  h.view.historyItems = [entry('z', { timestamp: 1700000005000 }), ...h.view.historyItems];
  h.view.renderHistory();
  assert.deepEqual(where(h), { id: 'a', control: 'menu' }, 'a new entry on top: still the same entry\'s button');
  // The focus is not in the list: nothing is moved
  h.page.focus(h.page.doc.elements['#historySearch']);
  h.view.renderHistory();
  assert.equal(h.page.active, h.page.doc.elements['#historySearch']);
});

test('the list was drawn again while the "…" menu was open (a scan saved): closing it gives the focus to the entry\'s new button', async () => {
  const h = drawn(load(), ['a', 'b', 'c']);
  const old = h.page.list.cards[1].more;
  const menu = { id: 'historyItemMenu', hidden: false, contains: (other) => other === menu.entry, entry: { dataset: { action: 'pin' } } };
  old.setAttribute = () => {}; old.classList = { remove() {} };
  h.view._openMenu = { menu, anchor: old };
  h.view._menuItemId = 'b';
  // The keyboard is on a menu entry; a redraw replaces every card, the menu's button with them
  h.page.focus(menu.entry);
  h.view.renderHistory();
  old.isConnected = false;
  old.focus = () => {}; // the browser: a button that is no longer in the page does not take the focus
  h.view.closeMenus(true);
  assert.deepEqual(where(h), { id: 'b', control: 'menu' }, 'the same entry\'s new "…" button, not a button that is gone');
});

test('the details window closed over a list drawn again: the focus leaves the hidden window for the entry\'s new card', () => {
  const h = drawn(load(), ['a', 'b']);
  const value = { dataset: {} };
  const modal = { contains: (other) => other === value };
  // The browser leaves the focus on the value button of the window it just hid
  h.page.focus(value);
  h.view.refocusEntry('b', modal);
  assert.deepEqual(where(h), { id: 'b', control: 'card' });
  // The focus somewhere else (the person moved on): left alone
  const search = h.page.doc.elements['#historySearch'];
  h.page.focus(search);
  h.view.refocusEntry('a', modal);
  assert.equal(h.page.active, search);
});

test('the last entry deleted: the list is hidden, so the focus goes to the search; Clear filters (its own button goes away) does the same', () => {
  const h = drawn(load(), ['a']);
  h.page.focus(h.page.list.cards[0].more);
  h.view.historyItems = [];
  h.view.renderHistory();
  assert.equal(h.page.active, h.page.doc.elements['#historySearch']);

  const f = drawn(load(), ['a', 'b']);
  f.view.handleSearch('nothing like this');
  const clear = { focus() { f.page.focus(this); } };
  const block = f.page.doc.elements['#historyNoResults'];
  block.contains = (other) => other === clear || other === block;
  clear.focus();
  f.view.clearFilters();
  assert.equal(f.page.active, f.page.doc.elements['#historySearch'], 'the button that had the focus is hidden by now');
});

// ---------------------------------------------------------------------------------------------------------------------------------
// UI-04: what a card says and how many stops it has
// ---------------------------------------------------------------------------------------------------------------------------------
test('every number on a card has a name a screen reader can say, and the tips keep their texts', () => {
  const h = load();
  h.view.historyItems = [entry('a', { detections: [det('Cloudflare', 'Anti-Bot', 90), det('Canvas Fingerprint', 'Fingerprint', 40), det('Navigator Fingerprint', 'Fingerprint', 20)] })];
  h.view.renderHistory();
  const html = h.page.list.html;
  const named = tags(html, 'span').filter(attrs => attrs.role === 'img').map(attrs => attrs['aria-label']);
  assert.deepEqual(named, ['Detections: 3', 'Confidence: 50%', 'Difficulty: Medium', 'Anti-bot: 1', 'Captcha: 0', 'Fingerprint: 2', 'Matched combinations: 0']);
  // The hover texts are the same as before
  const tips = tags(html, 'span').map(attrs => attrs['data-tip']).filter(Boolean);
  for (const text of ['Detections', 'Confidence: 50%', 'Difficulty: Medium', 'Anti-bot: 1', 'Captcha: 0', 'Fingerprint: 2', 'Matched combinations: 0']) assert.ok(tips.includes(text), text);
  assert.ok(tags(html, 'svg').every(attrs => !attrs.role), 'the icons stay hidden from the reader');
});

test('a card with no detection names its numbers too (0, 0%, Low)', () => {
  const h = load();
  h.view.historyItems = [entry('a', { detections: [] })];
  h.view.renderHistory();
  const named = tags(h.page.list.html, 'span').filter(attrs => attrs.role === 'img').map(attrs => attrs['aria-label']);
  assert.deepEqual(named.slice(0, 3), ['Detections: 0', 'Confidence: 0%', 'Difficulty: Low']);
});

test('a card is two Tab stops (the card, "…"): Scrapfly is in the "…" menu, and its button is still there for the mouse', () => {
  const h = load();
  h.view.historyItems = [entry('a')];
  h.view.renderHistory();
  const html = h.page.list.html;
  const buttons = tags(html, 'button');
  const scrapfly = buttons.find(attrs => /history-scrapfly-btn/.test(attrs.class));
  assert.equal(scrapfly['data-action'], 'scrapfly');
  assert.equal(scrapfly.tabindex, '-1', 'not a stop');
  assert.equal(buttons.find(attrs => /history-more-btn/.test(attrs.class)).tabindex, undefined, '"…" stays a stop');
  const card = tags(html, 'div').find(attrs => /history-item\b/.test(attrs.class));
  assert.deepEqual([card.role, card.tabindex, card['aria-label']], ['group', '0', 'Page a'], 'the card stays a stop');
  assert.match(read('sections/history/history.html'), /<button class="history-menu-item" role="menuitem" data-action="scrapfly">/);
  assert.match(read('sections/history/history.css'), /\.history-menu-item\[hidden\]\s*\{\s*display:\s*none;/, 'a hidden entry is not drawn');
});

test('"…" and Scrapfly say which page they are for: the name is the button\'s label followed by the page\'s title', () => {
  const h = load();
  h.view.historyItems = [entry('a'), entry('b')];
  h.view.renderHistory();
  const html = h.page.list.html;
  const titles = tags(html, 'div').filter(attrs => attrs.class === 'history-title').map(attrs => attrs.id);
  assert.equal(titles.length, 2);
  const buttons = tags(html, 'button');
  const ids = [...titles, ...buttons.map(attrs => attrs.id)];
  assert.ok(ids.every(Boolean) && new Set(ids).size === ids.length, 'every one has an id of its own: ' + ids.join(' '));
  for (const [kind, label] of [['history-more-btn', 'More actions'], ['history-scrapfly-btn', 'Scrape with Scrapfly']]) {
    const own = buttons.filter(attrs => attrs.class.includes(kind));
    assert.equal(own.length, 2, kind);
    own.forEach((attrs, index) => {
      assert.equal(attrs['aria-label'], label, 'the label stays');
      assert.equal(attrs['aria-labelledby'], `${attrs.id} ${titles[index]}`, 'its own label, then the title of its own card');
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------
// The "…" menu's Scrapfly entry
// ---------------------------------------------------------------------------------------------------------------------------------
test('the menu offers Scrapfly only for a page it can scrape, and the entry opens the same dialog as the card\'s button', () => {
  const h = load();
  const menu = (sel) => ({ querySelector: (selector) => (selector === '[data-action="scrapfly"]' ? sel : null) });
  const entryOf = { hidden: false };
  h.view.syncItemMenu(menu(entryOf), entry('a'));
  assert.equal(entryOf.hidden, false);
  h.view.syncItemMenu(menu(entryOf), entry('b', { url: 'chrome://settings' }));
  assert.equal(entryOf.hidden, true, 'a page that is not a web page');
  const item = entry('c', { detections: [det('Cloudflare', 'Anti-Bot', 85)] });
  h.view.openScrapfly(item);
  assert.equal(h.calls.scrapfly.length, 1);
  assert.equal(h.calls.scrapfly[0].url, item.url);
  assert.equal(h.calls.scrapfly[0].detections.length, 1);
  assert.match(read('sections/history/history.js'), /action === 'scrapfly'/);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// UI-05: the details window
// ---------------------------------------------------------------------------------------------------------------------------------
const withMatches = [
  det('Cloudflare', 'Anti-Bot', 85, { matches: [{ type: 'cookie', value: '__cf_bm=abc', confidence: 85 }, { type: 'header', value: 'server: cloudflare', confidence: 60 }] }),
  det('hCaptcha', 'CAPTCHA', 80, { matches: [{ type: 'url', fullUrl: 'https://hcaptcha.com/1/api.js', confidence: 80 }] }),
  det('Canvas Fingerprint', 'Fingerprint', 20, { matches: [{ type: 'js_hooks', value: 'HTMLCanvasElement.toDataURL', confidence: 20 }] })
];

test('each expandable header is named for its detection, so five of them are not five identical "Detection methods"', () => {
  // The English texts of the three categories, as the locale file has them
  const h = load({ messages: { categoryAntibot: 'Anti-bot', categoryCaptcha: 'Captcha', categoryFingerprint: 'Fingerprint' } });
  const html = h.view.renderDetectionDetails(withMatches);
  const headers = [...html.matchAll(/<div class="history-modal-detection-header"([^>]*)>/g)].map(match => match[1]);
  assert.equal(headers.length, 3);
  const labels = headers.map(attrs => /aria-label="([^"]*)"/.exec(attrs)[1]);
  assert.deepEqual(labels, ['Cloudflare, Anti-bot, 85%', 'hCaptcha, Captcha, 80%', 'Canvas Fingerprint, Fingerprint, 20%']);
  for (const attrs of headers) {
    assert.match(attrs, / role="button" tabindex="0" aria-expanded="false"/);
    const controls = /aria-controls="([^"]*)"/.exec(attrs);
    assert.ok(controls && html.includes(`id="${controls[1]}"`), 'it points at the panel it opens');
  }
});

test('a matched value is a real button with the value in its name: Tab reaches it, Enter and Space copy', () => {
  const h = load();
  const html = h.view.renderDetectionDetails(withMatches);
  const values = tags(html, 'button').filter(attrs => /history-modal-method-value/.test(attrs.class));
  assert.equal(values.length, 4, 'one for each match');
  assert.deepEqual(values[0], { type: 'button', class: 'history-modal-method-value', title: 'Click to copy', 'aria-label': 'Copy value: __cf_bm=abc' });
  assert.ok(html.includes('>__cf_bm=abc</button>'));
  assert.ok(!tags(html, 'span').some(attrs => /history-modal-method-value/.test(attrs.class || '')), 'no span with a click handler left');
  // The same row serves the combinations' signals
  const signal = h.view.historyMethodRowHtml({ type: 'url', confidence: 50, displayValue: 'https://x.test/a?b="1"', caption: 'SDK' });
  assert.ok(signal.includes('aria-label="Copy value: https://x.test/a?b=&quot;1&quot;"'), 'a quote in a value stays escaped in the name');
  assert.ok(signal.includes('>https://x.test/a?b="1"</button>'));
  const css = read('sections/history/history.css');
  assert.match(css, /\.history-modal-method-value:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/, 'the focus shows');
});

test('copying a matched value says so aloud, inside the window, every time', async () => {
  const h = load();
  const handlers = [];
  const value = { addEventListener: (type, fn) => type === 'click' && handlers.push(fn) };
  const head = { addEventListener() {}, setAttribute() {} };
  const row = {
    classList: { add() {}, remove() {}, toggle: () => true },
    getAttribute: () => encodeURIComponent(JSON.stringify({ rawValue: '__cf_bm=abc', methodType: 'COOKIE', confidence: 85 })),
    querySelector: (selector) => (selector === '.history-modal-method-head' ? head : selector === '.history-modal-method-value' ? value : null)
  };
  h.page.doc.items = [row];
  h.view.setupMethodCopyHandlers();
  assert.equal(handlers.length, 1);
  const region = h.page.doc.elements['#historyModalStatus'];
  const copy = async () => { handlers[0]({ stopPropagation() {} }); await new Promise(resolve => setImmediate(resolve)); };
  await copy();
  assert.equal(h.calls.copies[0].text, '[COOKIE] __cf_bm=abc');
  assert.equal(region.textContent, '', 'not before the short wait');
  h.advance(100);
  assert.equal(region.textContent, 'Copied');
  // A second copy is said again, though the words are the same
  await copy();
  assert.equal(region.textContent, '', 'cleared first, so the same words are news again');
  h.advance(100);
  assert.equal(region.textContent, 'Copied');
  h.advance(10000);
  assert.equal(region.textContent, '', 'and the region does not keep it');
  const page = read('sections/history/history.html');
  assert.match(page.slice(page.indexOf('id="historyDetailModal"')), /<div id="historyModalStatus" class="visually-hidden" role="status" aria-live="polite"><\/div>/, 'it is inside the modal: a modal dialog hides what is outside it');
});

// ---------------------------------------------------------------------------------------------------------------------------------
// UI-08: results said aloud
// ---------------------------------------------------------------------------------------------------------------------------------
test('typing in the search says what is left once the typing pauses: the count, or that nothing matches', () => {
  const h = drawn(load(), ['alpha', 'alpine', 'beta', 'gamma', 'delta']);
  const status = h.page.doc.elements['#historyStatus'];
  h.advance(5000);
  assert.equal(status.textContent, '', 'drawing the list is not news');
  h.view.handleSearch('al');
  h.view.handleSearch('alp');
  h.advance(300);
  assert.equal(status.textContent, '', 'a keystroke is not news');
  h.advance(300);
  assert.equal(status.textContent, 'Showing 1-2 of 2', 'said once, for the last search');
  h.advance(10000);
  assert.equal(status.textContent, '', 'and gone after, so the region never states what is no longer true');
  h.view.handleSearch('zzz');
  h.advance(500);
  assert.equal(status.textContent, 'No entries match your search or filters.');
  assert.equal(h.page.doc.elements['#historyNoResults'].hidden, false, 'the visible block is as before');
});

test('a chip, and Clear filters, say it too; a redraw of the same search (a pin, a new scan) says nothing', () => {
  const h = drawn(load(), ['a', 'b', 'c']);
  h.view.historyItems[0].pinned = true;
  const status = h.page.doc.elements['#historyStatus'];
  h.view.toggleFilterChip('pinned');
  h.advance(500);
  assert.equal(status.textContent, 'Showing 1-1 of 1');
  h.advance(10000);
  h.view.renderHistory();
  h.view.renderHistory();
  h.advance(5000);
  assert.equal(status.textContent, '', 'the same chips: nothing to say');
  h.view.clearFilters();
  h.advance(500);
  assert.equal(status.textContent, 'Showing 1-3 of 3', 'back to everything');
});

test('the region is always in the page: it is not inside what the search hides', () => {
  const html = read('sections/history/history.html');
  const at = html.indexOf('id="historyStatus"');
  assert.ok(at > 0);
  assert.match(html.slice(at - 40, at + 120), /<div id="historyStatus" class="visually-hidden" role="status" aria-live="polite"><\/div>/);
  for (const hidden of ['id="historyNoResults"', 'id="historyPagination"', 'id="historyEmpty"', 'id="historyFilters"']) {
    const start = html.indexOf(hidden);
    const block = html.slice(start, html.indexOf('\n  <!--', start) > 0 ? html.indexOf('\n  <!--', start) : undefined);
    assert.ok(!block.includes('historyStatus'), `${hidden} does not hold it`);
  }
  assert.match(read('sections/history/history.css'), /#historyTab \.visually-hidden\s*\{[^}]*position:\s*absolute;[^}]*clip:\s*rect\(0, 0, 0, 0\)/);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// UI-12: "label: value" in the language's own form
// ---------------------------------------------------------------------------------------------------------------------------------
const FRENCH = {
  clipboardConfidenceFmt: 'Confiance : {0} %', clipboardDifficultyFmt: 'Difficulté : {0}', statConfidence: 'Confiance', statDifficulty: 'Difficulté',
  statDetections: 'Détections', difficultyMedium: 'Moyenne', difficultyLow: 'Faible', difficultyHigh: 'Élevée'
};

test('the card\'s confidence and difficulty tips use the translated forms (a space before the colon in French)', () => {
  const h = load({ messages: FRENCH });
  h.view.historyItems = [entry('a', { detections: [det('Cloudflare', 'Anti-Bot', 90), det('Canvas Fingerprint', 'Fingerprint', 40)] })];
  h.view.renderHistory();
  const html = h.page.list.html;
  assert.match(html, /data-tip="Confiance : 65 %"/);
  assert.match(html, /data-tip="Difficulté : Moyenne"/);
  assert.ok(!/Confiance: 65%|Difficulté: Moyenne/.test(html), 'not the ASCII colon joined by hand');
  assert.match(html, /aria-label="Confiance : 65 %"/, 'and the reader hears the same');
});

test('the details window\'s tiles do too', () => {
  const h = load({ messages: FRENCH });
  const html = h.view.renderHistoryModalSummary(entry('a', { detections: [det('Cloudflare', 'Anti-Bot', 90), det('Canvas Fingerprint', 'Fingerprint', 40)] }));
  assert.match(html, /data-tip="Confiance : 65 %"/);
  assert.match(html, /data-tip="Difficulté : Moyenne"/);
});

test('in English nothing changes: the tips read as before', () => {
  const h = load();
  const html = h.view.renderHistoryModalSummary(entry('a', { detections: [det('Cloudflare', 'Anti-Bot', 90)] }));
  assert.match(html, /data-tip="Confidence: 90%"/);
  assert.match(html, /data-tip="Difficulty: Medium"/);
});
