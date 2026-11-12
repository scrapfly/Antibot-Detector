const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.Logger = new Proxy({}, { get: () => () => {} });
global.DetectionUtils = require('../utils/detection-utils.js');
const DetectorManager = require('../modules/detection/rules/detector-manager.js');

// Saving a rule drew the list again from page 1, and the Edit button that opened the editor went with the old cards: a person who
// edited a rule on page 4 was sent back to page 1 with the focus on the page, and nothing said the rule was saved. Now the list shows
// the page that holds the saved rule (a new one, or one whose new date sorts it elsewhere, can land on another page), the focus goes
// to that rule's Edit button, and a message says it was saved. A plain redraw still starts on page 1 (list-focus-after-redraw.test.js).

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// ===============================================================================================
// The pager: show the page that holds an item
// ===============================================================================================
function pager(options = {}) {
  const context = vm.createContext({ window: {}, Logger: { error() {} }, document: { querySelector: () => null } });
  vm.runInContext(read('modules/ui/pagination-manager.js'), context);
  const manager = new context.window.PaginationManager('rulesPagination', options);
  const renders = [];
  manager.render = function() { renders.push(this.currentPage); };
  return { manager, renders };
}

test('showItem turns to the page that holds an item, with fixed and with variable pages', () => {
  const { manager, renders } = pager({ itemsPerPage: 10 });
  manager.setItems(Array.from({ length: 35 }, (_, i) => i));
  assert.equal(manager.showItem(23), true);
  assert.equal(manager.currentPage, 3);
  assert.equal(manager.showItem(0), true);
  assert.equal(manager.currentPage, 1);
  assert.equal(manager.showItem(34), true);
  assert.equal(manager.currentPage, 4);
  assert.deepEqual(renders.slice(-3), [3, 1, 4]);
  assert.equal(manager.showItem(35), false, 'past the end');
  assert.equal(manager.showItem(-1), false);
  assert.equal(manager.currentPage, 4, 'an item that is not listed leaves the page alone');

  const variable = pager({ pageSizer: () => [0, 3, 4, 9] }).manager;
  variable.setItems(Array.from({ length: 12 }, (_, i) => i));
  variable.showItem(3);
  assert.equal(variable.currentPage, 2);
  variable.showItem(8);
  assert.equal(variable.currentPage, 3);
  variable.showItem(11);
  assert.equal(variable.currentPage, 4);
});

// ===============================================================================================
// Save in the rule editor
// ===============================================================================================
const fixture = () => ({ id: 'detect-custom', name: 'Custom', category: 'antibot', version: '1.0', author: 'Tester', enabled: true,
  difficulty: 'Low', detection: { cookie: [{ id: 'session', name: 'original', confidence: 50 }] } });

function editor({ isNew = false, listed = (all) => all } = {}) {
  global.StorageManager = { saveToStorage: async () => true }; // the detector manager is loaded in this realm
  const successes = [];
  const warnings = [];
  const log = [];
  const body = { name: 'body', style: { overflow: 'hidden' } };
  const doc = { body, activeElement: body };
  const control = (name) => ({ name, focus() { doc.activeElement = this; } });
  let cards = [];
  const fields = {
    '#detectorNameInput': { value: 'Edited custom' }, '#detectorCategorySelect': { value: 'antibot' },
    '#detectorDifficultySelect': { value: 'Low' }, '#detectorAuthorInput': { value: 'Tester' },
    '#saveRuleEdit': { disabled: false }, '#editRuleModal': { style: { display: 'flex' } }
  };
  doc.querySelector = (key) => fields[key] || null;
  doc.querySelectorAll = (selector) => (selector === '#rulesList .detector-card' ? cards : []);
  const ctx = { WorkerMessages, Rules: function() {}, DetectorManager, DetectionUtils, Logger, JSON, Date, console, document: doc,
    chrome: { runtime: { sendMessage: (message, cb) => cb?.(), getURL: value => value } },
    FormatUtils: require('../utils/format-utils.js'),
    NotificationHelper: { error() {}, warning: value => warnings.push(value), success: value => successes.push(value) } };
  vm.createContext(ctx);
  vm.runInContext(read('modules/core/rule-duplicates.js'), ctx);
  vm.runInContext(read('sections/rules/rules-editor.js'), ctx);
  vm.runInContext(read('sections/rules/rules-editor-modal.js'), ctx);
  const rules = new ctx.Rules();
  const dm = new DetectorManager({ initialized: true });
  // Twelve other rules, two to a page as in the popup: the edited one sits on page 4
  const others = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`rule-${i}`, { ...fixture(), id: `rule-${i}`, name: `Rule ${i}`,
    detection: { cookie: [{ id: 'c', name: `other-${i}`, confidence: 50 }] } }]));
  dm.detectors = { antibot: { ...others, 'detect-custom': fixture() } };
  rules.detectorManager = dm;
  const original = fixture();
  rules.currentEditDetector = { detector: plain(original), original: plain(original), originalCategory: 'antibot', category: 'antibot',
    detectorName: 'detect-custom', originalDetection: plain(original.detection), originalCombinations: [], isNew, isOfficial: false };
  Object.assign(rules, {
    clearPatternValidationState() {}, validatePatternRows: () => ({ isValid: true }), clearAuthorError() {},
    buildCombinationsForSave: () => ({ invalidIndex: -1, combinations: [] }),
    _collectDetectionFromForm: () => ({ cookie: [{ ...original.detection.cookie[0], name: 'edited' }] }),
    resolveDetectorNameForSave: value => value,
    allDetectors: [],
    restoreListFocus(place) { log.push({ restoreListFocus: place }); }
  });
  const makeCard = ({ category, detectorName }) => ({ edit: control(`edit:${detectorName}`), more: control(`more:${detectorName}`),
    dataset: { category, detectorId: detectorName },
    querySelector(selector) { return selector === '.edit-btn' ? this.edit : selector === '.rules-menu-trigger' ? this.more : null; } });
  // The pager shows two rules a page; the list is the saved storage, newest first (a saved rule moves to the top)
  rules.paginationManager = {
    currentPage: 4,
    setItems(items, options) { log.push({ setItems: plain(options) }); this.items = items; if (!options.keepPage) this.currentPage = 1; this.draw(); },
    showItem(index) { log.push({ showItem: index }); this.currentPage = Math.floor(index / 2) + 1; this.draw(); return true; },
    draw() { cards = this.items.slice((this.currentPage - 1) * 2, this.currentPage * 2).map(makeCard); }
  };
  rules.displayRules = async (options = {}) => {
    log.push({ displayRules: plain(options) });
    const all = Object.entries(dm.detectors).flatMap(([category, records]) => Object.entries(records)
      .map(([detectorName, detector]) => ({ category, detectorName, detector })));
    // The saved rule sorts first, as a newer date does with the default order
    all.sort((a, b) => (b.detector.lastUpdated || '').localeCompare(a.detector.lastUpdated || ''));
    rules.allDetectors = all;
    rules.filteredDetectors = listed(all);
    rules.paginationManager.setItems(rules.filteredDetectors, options);
    doc.activeElement = body; // the old cards and the Edit button that had the focus are gone
  };
  // The editor was opened from the card on page 4: its Edit button had the focus
  rules.paginationManager.items = Object.entries(dm.detectors.antibot).map(([detectorName]) => ({ category: 'antibot', detectorName }));
  rules.paginationManager.draw();
  return { rules, dm, doc, log, successes, warnings, get cards() { return cards; } };
}

test('after Save the list shows the page holding the saved rule, its Edit button has the focus, and a message says it was saved', async () => {
  const state = editor();
  assert.equal(await state.rules.saveRule(), true);
  const index = state.rules.filteredDetectors.findIndex(entry => entry.detectorName === 'detect-custom');
  assert.ok(index >= 0);
  assert.deepEqual(state.log.find(entry => entry.displayRules), { displayRules: { keepPage: true } }, 'the list is drawn again on its page, not from page 1');
  assert.deepEqual(state.log.find(entry => 'showItem' in entry), { showItem: index });
  assert.equal(state.doc.activeElement.name, 'edit:detect-custom');
  assert.deepEqual(state.successes, ['Saved "Edited custom"']);
  assert.deepEqual(state.warnings, []);
});

test('a new rule: the list turns to the page it landed on and focuses its Edit button', async () => {
  // The new rule is listed last (the search box orders it there): it lands on the last page, not on the page shown
  const state = editor({ isNew: true, listed: (all) => [...all.filter(entry => !entry.detector.lastUpdated), ...all.filter(entry => entry.detector.lastUpdated)] });
  const before = new Set(Object.keys(state.dm.detectors.antibot));
  assert.equal(await state.rules.saveRule(), true);
  const id = Object.keys(state.dm.detectors.antibot).find(key => !before.has(key));
  assert.ok(id, 'a new id was given');
  const index = state.rules.filteredDetectors.findIndex(entry => entry.detectorName === id);
  assert.equal(index, state.rules.filteredDetectors.length - 1);
  assert.deepEqual(state.log.find(entry => 'showItem' in entry), { showItem: index });
  assert.equal(state.doc.activeElement.name, `edit:${id}`);
  assert.equal(state.successes.length, 1);
});

test('a saved rule the search or the chips hide: the page is kept and the focus goes back into the list', async () => {
  const state = editor({ listed: (all) => all.filter(entry => entry.detectorName !== 'detect-custom') });
  assert.equal(await state.rules.saveRule(), true);
  assert.equal(state.log.some(entry => 'showItem' in entry), false);
  const restored = state.log.find(entry => entry.restoreListFocus !== undefined);
  assert.ok(restored, 'the focus is put back into the list');
  assert.equal(state.successes.length, 1);
});

test('when Save already warns ("Saved. …") there is no second message', async () => {
  const state = editor();
  state.rules._collectDetectionFromForm = () => ({ cookie: [{ id: 'a', name: 'twice', confidence: 50 }, { id: 'b', name: 'twice', confidence: 50 }] });
  assert.equal(await state.rules.saveRule(), true);
  assert.equal(state.warnings.length, 1);
  assert.deepEqual(state.successes, []);
});
