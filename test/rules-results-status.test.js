const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Typing in the Rules search, turning a chip on and flipping a page changed the list and said nothing to a screen reader: the count is
// a line of the pager (no role), and "No entries match" is a block that was hidden and is shown (a region that appears with its text is
// not announced). A status region that is always in the page now carries what the list leaves: the pager's own line, or the no-results
// line. Both are words the page already has.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const SHOWING = (from, to, total) => `Showing ${from}-${to} of ${total}`;
const NONE = 'No entries match your search or filters.';

function fixture(count = 5) {
  const writes = [];
  const status = { text: '', get textContent() { return this.text; }, set textContent(value) { writes.push(value); this.text = value; } };
  const info = { textContent: 'No items to display' };
  const noResults = { hidden: true };
  const elements = {
    '#rulesResultsStatus': status, '#rulesPagination .pagination-info': info, '#rulesNoResults': noResults,
    '#rulesNoResults p': { textContent: NONE },
    '#rulesFilters': { hidden: false, querySelectorAll: () => [] }, '#rulesSearch': { value: '' }, '#rulesList': { innerHTML: '' },
    '#detectorsEmpty': { style: {} }
  };
  function Rules() {}
  const context = vm.createContext({ console, Rules, Logger: { debug() {}, error() {} }, document: { querySelector: (selector) => elements[selector] || null },
    Utils: { getSettings: async () => ({ detection: {} }) }, FormatUtils: require('../utils/format-utils.js') });
  for (const file of ['modules/core/categories.js', 'modules/core/rules-filter.js']) vm.runInContext(read(file), context, { filename: file });
  vm.runInContext(read('utils/detection-utils.js') + '\nthis.DetectionUtils = DetectionUtils;', context);
  for (const file of ['sections/rules/rules-handlers.js', 'sections/rules/rules-display.js']) vm.runInContext(read(file), context, { filename: file });
  const view = Object.create(Rules.prototype);
  const library = { antibot: {} };
  for (let i = 1; i <= count; i++) library.antibot[`rule${i}x`] = { id: `rule${i}x`, name: `rule${i}x`, displayName: `rule${i}x`, enabled: true, lastUpdated: '2026-01-01', author: 'Me', detection: {} };
  // As the real pager: its line first, then the page callback the tab gives it (rules.js: draw the page, then the status)
  const pager = {
    setItems(items) {
      info.textContent = items.length ? SHOWING(1, Math.min(2, items.length), items.length) : 'No items to display';
      if (typeof view.syncResultsStatus === 'function') view.syncResultsStatus();
    }
  };
  Object.assign(view, { initialized: true, activeChips: context.RulesFilter.normalizeChips(), allDetectors: [], filteredDetectors: [], paginationManager: pager,
    categoryManager: { getCategoryInfo: () => ({ colour: '#000000' }) }, getDetectorDisplayName: (name) => name, getSortTimestamp: () => 0,
    detectorManager: { getAllDetectors: () => library } });
  return { view, elements, status, writes, info, noResults, library, context };
}

test('the status says how many rules the list shows, in the pager\'s own words', async () => {
  const f = fixture(5);
  await f.view.displayRules();
  assert.equal(f.status.text, SHOWING(1, 2, 5));
  f.elements['#rulesSearch'].value = 'rule3x';
  f.view.handleSearch('rule3x');
  assert.equal(f.status.text, SHOWING(1, 1, 1), 'a search that leaves one rule');
});

test('the status carries the no-results line when there are rules and none match, and the count again once something does', async () => {
  const f = fixture(3);
  await f.view.displayRules();
  f.view.handleSearch('nothing matches this');
  assert.equal(f.status.text, NONE);
  f.view.toggleFilterChip('edited');
  assert.equal(f.status.text, NONE, 'a chip that leaves nothing says the same');
  f.view.clearFilters();
  assert.equal(f.status.text, SHOWING(1, 2, 3));
});

test('with no rules at all the status says nothing (the empty state is its own message)', async () => {
  const f = fixture(2);
  await f.view.displayRules();
  assert.equal(f.status.text, SHOWING(1, 2, 2));
  for (const key of Object.keys(f.library.antibot)) delete f.library.antibot[key];
  await f.view.displayRules();
  assert.equal(f.status.text, '');
});

test('the status is written only when its words change, so drawing the same list again is not announced again', async () => {
  const f = fixture(4);
  await f.view.displayRules();
  await f.view.displayRules();
  f.view.syncFilterUi();
  f.view.handleSearch('');
  assert.deepEqual(f.writes, [SHOWING(1, 2, 4)]);
  f.view.handleSearch('rule1x');
  assert.deepEqual(f.writes, [SHOWING(1, 2, 4), SHOWING(1, 1, 1)]);
});

test('a page change of the pager updates it too: the tab hands the pager a callback that draws the page and the status', () => {
  const seen = [];
  const context = vm.createContext({ console, RulesFilter: { normalizeChips: () => ({}) },
    PaginationManager: class { constructor(id, options) { seen.push({ id, options }); } } });
  vm.runInContext(read('sections/rules/rules.js'), context, { filename: 'rules.js' });
  const RealRules = vm.runInContext('Rules', context);
  const view = Object.create(RealRules.prototype);
  const calls = [];
  view.renderDetectorsPage = (items) => calls.push(['page', items]);
  view.syncResultsStatus = () => calls.push(['status']);
  view.setupPagination();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].id, 'rulesPagination');
  seen[0].options.onPageChange(2, ['x', 'y']);
  assert.deepEqual(calls, [['page', ['x', 'y']], ['status']]);
});

// ---- The markup and its look ----

const html = read('sections/rules/rules.html');

test('the region is in the page from the start: not hidden, not inside the no-results block, a polite status in the header', () => {
  const tag = html.match(/<(\w+) id="rulesResultsStatus"[^>]*>/);
  assert.ok(tag, 'a region with that id');
  assert.match(tag[0], /role="status"/);
  assert.match(tag[0], /aria-live="polite"/);
  assert.doesNotMatch(tag[0], /\bhidden\b/, 'a region that is shown with its text is not announced');
  assert.doesNotMatch(tag[0], /display:\s*none/);
  const at = html.indexOf('id="rulesResultsStatus"');
  assert.ok(at > html.indexOf('id="rulesFilters"') && at < html.indexOf('id="rulesList"'), 'with the search and the chips, above the list');
  const header = html.slice(html.indexOf('class="rules-header"'), html.indexOf('id="rulesList"'));
  assert.ok(header.includes('id="rulesResultsStatus"'), 'in the header');
  const noResults = html.match(/<div id="rulesNoResults"[^>]*>[\s\S]*?<\/div>/)[0];
  assert.ok(!noResults.includes('rulesResultsStatus'));
});

test('it is said, not shown: the stylesheet takes it out of the layout without hiding it from a screen reader', () => {
  const css = read('sections/rules/styles/list.css');
  const rule = css.match(/\.rules-results-status\s*\{([^}]*)\}/);
  assert.ok(rule, 'a rule for it');
  assert.match(rule[1], /position:\s*absolute/);
  assert.match(rule[1], /width:\s*1px/);
  assert.match(rule[1], /height:\s*1px/);
  assert.match(rule[1], /overflow:\s*hidden/);
  assert.match(rule[1], /clip(-path)?:/);
  assert.doesNotMatch(rule[1], /display:\s*none|visibility:\s*hidden/);
});
