const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A list that is drawn again from scratch (innerHTML) destroys the button that had the focus: the focus falls to the page and the next
// Tab starts at the top of the popup. A keyboard or screen-reader person who pressed Delete (or Reset to official) on a rule, or Delete
// on a saved capture, lost their place. The focus now goes back into the list: to the same rule's "More actions" button, or to what took
// the place of the one that went, or, with no row left, to the way the page offers out of an empty list.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
// What the code under test builds lives in another realm: compare it as data
const plain = (value) => JSON.parse(JSON.stringify(value));

// A page of fake elements: a control takes the focus when it is focused, and the page knows what has it
function page() {
  const body = { name: 'body' };
  const doc = { body, activeElement: body };
  const control = (name) => ({ name, focus() { doc.activeElement = this; } });
  return { doc, body, control };
}

// ===============================================================================================
// Rules: delete and reset to official
// ===============================================================================================
function rulesFixture() {
  const { doc, body, control } = page();
  const search = control('search');
  let cards = [];
  const makeCard = ([category, id]) => ({ trigger: control(`more:${id}`), dataset: { category, detectorId: id },
    querySelector(selector) { return selector === '.rules-menu-trigger' ? this.trigger : null; } });
  const list = { contains: (element) => cards.some(card => card.trigger === element) };
  const noResults = { hidden: true };
  const clearFilters = control('clear-filters');
  const add = control('add');
  const elements = { '#rulesList': list, '#rulesNoResults': noResults, '#rulesClearFilters': clearFilters, '#addDetectorBtn': add, '#rulesSearch': search };
  doc.querySelector = (selector) => elements[selector] || null;
  doc.querySelectorAll = (selector) => (selector === '#rulesList .detector-card' ? cards : []);

  function Rules() {}
  const answer = { value: true };
  const context = vm.createContext({
    console, Rules, document: doc, Logger: { ui() {}, error() {}, debug() {} },
    chrome: { runtime: { sendMessage() {}, lastError: null } },
    WorkerMessages: { RELOAD_DETECTORS: 'RELOAD_DETECTORS' },
    DetectionUtils: { isOfficialDetector: () => true },
    DetectorManager: { officialVersionOf: (detector) => (detector && detector.officialSnapshot) || null },
    NotificationHelper: { confirm: async () => answer.value, success() {}, error() {}, warning() {}, info() {} },
    FormatUtils: require('../utils/format-utils.js')
  });
  for (const file of ['sections/rules/rules-display.js', 'sections/rules/rules-handlers.js']) vm.runInContext(read(file), context, { filename: file });
  const view = Object.create(Rules.prototype);
  const detectors = { antibot: {}, captcha: {} };
  view.detectorManager = {
    detectors,
    getDetector: (category, id) => detectors[category] && detectors[category][id],
    deleteDetector: async (category, id) => { delete detectors[category][id]; return { deleted: true }; },
    saveDetectorsToStorage: async () => {}
  };
  const log = [];
  view.paginationManager = { currentPage: 1 };
  return {
    view, doc, search, noResults, detectors, log,
    /** The cards on the page now (page number as given); the one at `focused` has the focus (the menu gave it back to its button) */
    show(items, focused = 0, page = 1) { cards = items.map(makeCard); view.paginationManager.currentPage = page; if (items.length) cards[focused].trigger.focus(); },
    /** What the next redraw leaves on the page: the old buttons are gone, so the page has the focus; `page` is the page shown then */
    redrawTo(items, { page } = {}) {
      view.displayRules = async (options) => {
        log.push({ redraw: options });
        await settle();
        cards = items.map(makeCard);
        if (page !== undefined) view.paginationManager.currentPage = page;
        doc.activeElement = body;
      };
    },
    answer: (value) => { answer.value = value; }
  };
}

test('after a delete the focus goes to the card that took the place of the deleted one', async () => {
  const f = rulesFixture();
  f.show([['antibot', 'a'], ['antibot', 'b']], 0);
  f.detectors.antibot.a = {};
  f.redrawTo([['antibot', 'b'], ['antibot', 'c']]);                // b slid up, c came in from the next page
  await f.view.handleDeleteDetector('antibot', 'a', 'A');
  assert.equal(f.doc.activeElement.name, 'more:b', 'the card now where the deleted one was');
});

test('deleting the last card of the page puts the focus on the one before it', async () => {
  const f = rulesFixture();
  f.show([['antibot', 'a'], ['antibot', 'b']], 1);
  f.detectors.antibot.b = {};
  f.redrawTo([['antibot', 'a']]);
  await f.view.handleDeleteDetector('antibot', 'b', 'B');
  assert.equal(f.doc.activeElement.name, 'more:a');
});

test('deleting the only card of the last page takes the page too: the focus goes to the last card of the page now shown', async () => {
  const f = rulesFixture();
  f.show([['antibot', 'z']], 0, 3);
  f.detectors.antibot.z = {};
  f.redrawTo([['antibot', 'x'], ['antibot', 'y']], { page: 2 });   // the pager clamps to the last page that is left
  await f.view.handleDeleteDetector('antibot', 'z', 'Z');
  assert.equal(f.doc.activeElement.name, 'more:y', 'the rule just before the deleted one, not the first of that page');
});

test('reset to official puts the focus back on the same rule, wherever the new order lists it', async () => {
  const f = rulesFixture();
  f.show([['antibot', 'a'], ['antibot', 'b']], 1);
  f.detectors.antibot.b = { officialSnapshot: { id: 'b', name: 'B official' } };
  f.redrawTo([['antibot', 'b'], ['antibot', 'a']]);                // the restored rule is newer: it moves up
  await f.view.handleResetToOfficial('antibot', 'b', 'B');
  assert.equal(f.doc.activeElement.name, 'more:b', 'the rule, not the position');
});

test('both redraws stay on the page the person was on', async () => {
  for (const act of [(view) => view.handleDeleteDetector('antibot', 'a', 'A'), (view) => view.handleResetToOfficial('antibot', 'a', 'A')]) {
    const f = rulesFixture();
    f.show([['antibot', 'a'], ['antibot', 'b']], 0);
    f.detectors.antibot.a = { officialSnapshot: { id: 'a' } };
    f.redrawTo([['antibot', 'a'], ['antibot', 'b']]);
    await act(f.view);
    assert.deepEqual(plain(f.log), [{ redraw: { keepPage: true } }], 'a list of two to a page would otherwise go back to page 1 after every delete');
  }
});

test('with no card left the focus goes to Clear filters when a search or chip emptied the list, else to Add', async () => {
  let f = rulesFixture();
  f.show([['antibot', 'a']]);
  f.detectors.antibot.a = {};
  f.noResults.hidden = false;                                      // the Custom chip is on and a was the last custom rule
  f.redrawTo([]);
  await f.view.handleDeleteDetector('antibot', 'a', 'A');
  assert.equal(f.doc.activeElement.name, 'clear-filters');

  f = rulesFixture();
  f.show([['antibot', 'a']]);
  f.detectors.antibot.a = {};
  f.redrawTo([]);                                                  // no rule at all: the empty state, and no no-results block
  await f.view.handleDeleteDetector('antibot', 'a', 'A');
  assert.equal(f.doc.activeElement.name, 'add');
});

test('the focus is not taken from somewhere the person moved it meanwhile', async () => {
  const f = rulesFixture();
  f.show([['antibot', 'a'], ['antibot', 'b']], 0);
  f.detectors.antibot.a = {};
  f.redrawTo([['antibot', 'b']]);
  const redraw = f.view.displayRules;
  f.view.displayRules = async (options) => { await redraw(options); f.search.focus(); };
  await f.view.handleDeleteDetector('antibot', 'a', 'A');
  assert.equal(f.doc.activeElement.name, 'search');
});

test('cancelling the question redraws nothing and moves nothing', async () => {
  const f = rulesFixture();
  f.show([['antibot', 'a']]);
  f.detectors.antibot.a = { officialSnapshot: { id: 'a' } };
  f.answer(false);
  f.redrawTo([]);
  await f.view.handleDeleteDetector('antibot', 'a', 'A');
  await f.view.handleResetToOfficial('antibot', 'a', 'A');
  assert.deepEqual(f.log, []);
  assert.equal(f.doc.activeElement.name, 'more:a');
});

// displayRules passes "stay on this page" to the pager, with and without a search typed in
function drawFixture() {
  const shown = [];
  const el = (extra = {}) => ({ hidden: false, style: {}, value: '', innerHTML: '', ...extra });
  const elements = { '#rulesFilters': el({ querySelectorAll: () => [] }), '#rulesNoResults': el({ hidden: true }), '#rulesSearch': el(),
    '#rulesList': el(), '#detectorsEmpty': el() };
  function Rules() {}
  const context = vm.createContext({ console, Rules, Logger: { debug() {}, error() {} }, document: { querySelector: (selector) => elements[selector] || null },
    Utils: { getSettings: async () => ({ detection: {} }) }, FormatUtils: require('../utils/format-utils.js') });
  for (const file of ['modules/core/categories.js', 'modules/core/rules-sort.js', 'modules/core/rules-filter.js']) vm.runInContext(read(file), context, { filename: file });
  vm.runInContext(read('utils/detection-utils.js') + '\nthis.DetectionUtils = DetectionUtils;', context);
  for (const file of ['sections/rules/rules-handlers.js', 'sections/rules/rules-display.js']) vm.runInContext(read(file), context, { filename: file });
  const view = Object.create(Rules.prototype);
  const detector = (id) => ({ id, name: id, displayName: id, enabled: true, lastUpdated: '2026-01-01', author: 'Me', detection: {} });
  Object.assign(view, { initialized: true, activeChips: context.RulesFilter.normalizeChips(), allDetectors: [], filteredDetectors: [],
    paginationManager: { setItems(items, options) { shown.push({ count: items.length, options }); } },
    categoryManager: { getCategoryInfo: () => ({ colour: '#000000' }) },
    getDetectorDisplayName: (name) => name, getSortTimestamp: () => 0,
    detectorManager: { getAllDetectors: () => ({ antibot: { xray: detector('xray'), zulu: detector('zulu') } }) } });
  return { view, elements, shown };
}

test('displayRules hands the pager "keep the page" when asked, with the whole list and with a search', async () => {
  const { view, elements, shown } = drawFixture();
  await view.displayRules();
  assert.deepEqual(plain(shown.at(-1)), { count: 2, options: { keepPage: false } }, 'a plain redraw starts on page 1, as before');
  await view.displayRules({ keepPage: true });
  assert.deepEqual(plain(shown.at(-1)), { count: 2, options: { keepPage: true } });
  elements['#rulesSearch'].value = 'xray';
  await view.displayRules({ keepPage: true });
  assert.deepEqual(plain(shown.at(-1)), { count: 1, options: { keepPage: true } }, 'the search is applied and the page is kept');
  view.handleSearch('zulu');
  assert.deepEqual(plain(shown.at(-1)), { count: 1, options: { keepPage: false } }, 'typing a new search goes back to page 1');
});

// ===============================================================================================
// Advanced → History: delete a capture, and the chips
// ===============================================================================================
function advancedFixture() {
  const { doc, body, control } = page();
  let rows = [];
  const panelClasses = new Set();
  const makeRow = (id) => ({ open: control(`open:${id}`), getAttribute(name) { return name === 'data-capture-id' ? id : null; },
    dataset: { captureId: id, moduleId: 'akamai' }, querySelector(selector) { return selector === '.cap-row-open' ? this.open : null; } });
  const grid = { contains: (element) => rows.some(row => row.open === element) };
  const panel = { classList: { contains: (name) => panelClasses.has(name) } };
  const emptyAction = control('open-tools');
  const resetFilters = control('reset-filters');
  const state = { resetFiltersShown: false };
  const elements = { '#captureGrid': grid, '#capturesPanel': panel, '#captureOpenToolsBtn': emptyAction };
  doc.querySelector = (selector) => (selector === '#resetAllFiltersBtn' ? (state.resetFiltersShown ? resetFilters : null) : elements[selector] || null);
  doc.querySelectorAll = (selector) => (selector === '#captureGrid .capture-card' ? rows : []);
  // The chip row: its chips are built from the markup it is given, and a focused chip that goes with the old markup leaves the page focused
  const chipRow = { hidden: false, html: '', chips: [],
    contains(element) { return this.chips.includes(element); },
    get innerHTML() { return this.html; },
    set innerHTML(html) {
      if (this.chips.includes(doc.activeElement)) doc.activeElement = body;
      this.html = html;
      this.chips = [...html.matchAll(/data-filter-group="(\w+)" data-filter-value="([^"]+)"/g)].map(([, filterGroup, filterValue]) => Object.assign(control(`chip:${filterGroup}:${filterValue}`), { dataset: { filterGroup, filterValue } }));
    },
    querySelectorAll(selector) { return selector === '.cap-chip' ? this.chips : []; } };
  elements['#captureChips'] = chipRow;
  const errors = [];
  const store = { deleteCapture: async () => {} };
  const context = vm.createContext({ window: {}, URL, console, document: doc, Logger: { ui() {}, debug() {}, error: (...args) => errors.push(args) },
    FormatUtils: require('../utils/format-utils.js'), NotificationHelper: { success() {}, error() {}, info() {}, warning() {} },
    AdvancedHistoryStore: store });
  vm.runInContext(read('modules/advanced/vendor-registry.js'), context);
  for (const file of ['advanced.js', 'history/controller.js', 'history/view.js']) vm.runInContext(read(`sections/advanced/${file}`), context, { filename: file });
  const advanced = new context.window.Advanced({}, {});
  advanced.updateCaptureCountBadge = async () => {};
  let redraws = 0;
  return {
    advanced, doc, control, store, errors, chipRow, redraws: () => redraws,
    /** The rows on the page now; the first one has the focus (its Delete button was just pressed) */
    show(ids, focused = 0) { rows = ids.map(makeRow); if (ids.length) rows[focused].open.focus(); },
    redrawTo(ids, { empty = false, noResults = false } = {}) {
      advanced.renderUnifiedCaptureHistory = async () => {
        redraws++;
        await settle();
        rows = ids.map(makeRow);
        doc.activeElement = body;
        if (empty) panelClasses.add('is-empty'); else panelClasses.delete('is-empty');
        state.resetFiltersShown = noResults;
      };
    }
  };
}

test('after a capture is deleted the focus goes to the open button of the row that took its place', async () => {
  const f = advancedFixture();
  f.show(['a', 'b', 'c'], 1);
  f.redrawTo(['a', 'c']);
  await f.advanced.deleteSingleCapture('akamai', 'b');
  assert.equal(f.doc.activeElement.name, 'open:c', 'the next capture, not its Delete button: a second Enter must not delete it too');
  assert.deepEqual(f.errors, []);
});

test('deleting the last capture of the list puts the focus on the one before it', async () => {
  const f = advancedFixture();
  f.show(['a', 'b', 'c'], 2);
  f.redrawTo(['a', 'b']);
  await f.advanced.deleteSingleCapture('akamai', 'c');
  assert.equal(f.doc.activeElement.name, 'open:b');
});

test('with no capture left the focus goes to Open tools (nothing saved) or to Reset all filters (the filters hide the rest)', async () => {
  let f = advancedFixture();
  f.show(['only']);
  f.redrawTo([], { empty: true });
  await f.advanced.deleteSingleCapture('akamai', 'only');
  assert.equal(f.doc.activeElement.name, 'open-tools');

  f = advancedFixture();
  f.show(['only']);
  f.redrawTo([], { noResults: true });
  await f.advanced.deleteSingleCapture('akamai', 'only');
  assert.equal(f.doc.activeElement.name, 'reset-filters');
});

test('the focus is not taken from somewhere the person moved it meanwhile', async () => {
  const f = advancedFixture();
  f.show(['a', 'b'], 0);
  f.redrawTo(['b']);
  const elsewhere = f.control('search');
  const redraw = f.advanced.renderUnifiedCaptureHistory;
  f.advanced.renderUnifiedCaptureHistory = async () => { await redraw(); elsewhere.focus(); };
  await f.advanced.deleteSingleCapture('akamai', 'a');
  assert.equal(f.doc.activeElement.name, 'search');
});

test('a delete that fails redraws nothing and leaves the focus on the button', async () => {
  const f = advancedFixture();
  f.show(['a', 'b'], 0);
  f.redrawTo(['b']);
  f.store.deleteCapture = async () => { throw new Error('storage full'); };
  await f.advanced.deleteSingleCapture('akamai', 'a');
  assert.equal(f.redraws(), 0);
  assert.equal(f.doc.activeElement.name, 'open:a');
  assert.equal(f.errors.length, 1, 'the failure is logged once');
});

test('a vendor chip that has the focus is found again when the chips are drawn again with the list', () => {
  const f = advancedFixture();
  f.advanced.captureFilters = { site: 'all', module: 'all', tool: 'all', search: '' };
  const captures = [{ moduleId: 'akamai', moduleName: 'Akamai' }, { moduleId: 'hcaptcha', moduleName: 'hCaptcha' }, { moduleId: 'hcaptcha', moduleName: 'hCaptcha' }];
  f.advanced.renderCaptureChips(captures);
  const before = f.chipRow.chips.find(chip => chip.name === 'chip:module:hcaptcha');
  assert.ok(before, 'a chip for each vendor');
  before.focus();
  f.advanced.captureFilters.module = 'hcaptcha';                    // what pressing it does, before the list is drawn again
  f.advanced.renderCaptureChips(captures);
  assert.notEqual(f.chipRow.chips.find(chip => chip.name === 'chip:module:hcaptcha'), before, 'the chip is a new element');
  assert.equal(f.doc.activeElement.name, 'chip:module:hcaptcha', 'and has the focus');
  assert.ok(f.chipRow.chips.includes(f.doc.activeElement));
});

test('a focus outside the chips is left alone, and a chip that is gone leaves the focus where the page puts it', () => {
  const f = advancedFixture();
  f.advanced.captureFilters = { site: 'all', module: 'all', tool: 'all', search: '' };
  const captures = [{ moduleId: 'akamai', moduleName: 'Akamai' }, { moduleId: 'hcaptcha', moduleName: 'hCaptcha' }];
  f.advanced.renderCaptureChips(captures);
  const search = f.control('search');
  search.focus();
  f.advanced.renderCaptureChips(captures);
  assert.equal(f.doc.activeElement.name, 'search');
  f.chipRow.chips.find(chip => chip.name === 'chip:module:akamai').focus();
  f.advanced.renderCaptureChips([{ moduleId: 'hcaptcha', moduleName: 'hCaptcha' }]);       // the vendor has no capture left: no chip for it
  assert.equal(f.doc.activeElement.name, 'body');
});
