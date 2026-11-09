const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Detection tab: a chip per category under the search (Anti-bot, Captcha, Fingerprint). The pure module decides which results
// stay (the categories chosen mean "any of them", and they combine with the search with AND); the tab keeps the chips while the
// popup is open, hides the row with the results, and offers a way back when nothing is left.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
// Loaded inside each test, so a missing module is one failure per test and not one failure of the whole file
const F = () => require('../modules/core/detection-filter.js');
const Categories = require('../modules/core/categories.js');

const det = (name, category, extra = {}) => ({ detector: { name, description: `Finds ${name}` }, category, confidence: 80, ...extra });
const results = [
  det('Cloudflare', 'Anti-Bot'),
  det('DataDome', 'Anti-Bot'),
  det('reCAPTCHA', 'CAPTCHA'),
  det('Canvas Fingerprint', 'Fingerprint', { confidence: 40 }),
  det('Navigator Fingerprint', 'Fingerprint', { confidence: 30 }),
  det('Acme Shield', 'Acme custom category')
];
const names = (list) => list.map(entry => entry.detector.name);

test('no search and no chips keeps every result in its order, and drops empty ones', () => {
  assert.deepEqual(names(F().filter(results)), names(results));
  assert.deepEqual(names(F().filter([null, ...results, undefined], { query: '  ', chips: {} })), names(results));
  assert.deepEqual(F().filter(undefined, { query: 'x' }), []);
});

test('category chips mean "any of these", in the order of the results', () => {
  assert.deepEqual(names(F().filter(results, { chips: { categories: ['antibot'] } })), ['Cloudflare', 'DataDome']);
  assert.deepEqual(names(F().filter(results, { chips: { categories: ['captcha'] } })), ['reCAPTCHA']);
  assert.deepEqual(names(F().filter(results, { chips: { categories: ['fingerprint'] } })), ['Canvas Fingerprint', 'Navigator Fingerprint'], 'the fingerprint cards that crowd the list');
  assert.deepEqual(names(F().filter(results, { chips: { categories: ['antibot', 'captcha'] } })), ['Cloudflare', 'DataDome', 'reCAPTCHA'], 'either');
  assert.deepEqual(names(F().filter(results, { chips: { categories: ['captcha', 'antibot'] } })), ['Cloudflare', 'DataDome', 'reCAPTCHA'], 'the order of the chips does not matter');
  assert.deepEqual(names(F().filter(results, { chips: { categories: ['antibot', 'captcha', 'fingerprint'] } })), names(results.slice(0, 5)), 'all three chips: every built-in category, not the custom one');
});

test('a result with a category of its own is kept while no chip is on, and left out once one is', () => {
  assert.ok(names(F().filter(results, { chips: { combinations: false, categories: [] } })).includes('Acme Shield'));
  for (const key of Categories.KEYS) assert.ok(!names(F().filter(results, { chips: { categories: [key] } })).includes('Acme Shield'), key);
});

test('the search and the chips combine with AND', () => {
  assert.deepEqual(names(F().filter(results, { query: 'cloud', chips: { categories: ['antibot'] } })), ['Cloudflare']);
  assert.deepEqual(names(F().filter(results, { query: 'cloud', chips: { categories: ['captcha'] } })), [], 'the right text in the wrong category');
  assert.deepEqual(names(F().filter(results, { query: 'fingerprint', chips: { categories: ['fingerprint', 'captcha'] } })), ['Canvas Fingerprint', 'Navigator Fingerprint']);
  assert.deepEqual(names(F().filter(results, { query: 'DATADOME ' })), ['DataDome'], 'the search alone: any case, trimmed');
  assert.deepEqual(names(F().filter(results, { query: 'nothing matches this', chips: { categories: ['antibot'] } })), []);
});

test('the search looks in the name, the category and the description', () => {
  assert.deepEqual(names(F().filter(results, { query: 'recaptcha' })), ['reCAPTCHA'], 'name');
  assert.deepEqual(names(F().filter(results, { query: 'anti-bot' })), ['Cloudflare', 'DataDome'], 'category');
  assert.deepEqual(names(F().filter(results, { query: 'finds datadome' })), ['DataDome'], 'description');
  assert.deepEqual(names(F().filter(results, { query: 'acme custom' })), ['Acme Shield'], 'a category of its own is searchable too');
});

test('the popup can pass its own readers: the name, the texts to search and the category key', () => {
  const renamed = F().filter(results, { query: 'friendly', textsOf: () => ['Friendly name'] });
  assert.equal(renamed.length, results.length, 'every result matches the one text it is given');
  const only = F().filter(results, { query: 'zzz', textsOf: (entry) => [entry.detector.name === 'DataDome' ? 'has zzz inside' : 'no']});
  assert.deepEqual(names(only), ['DataDome']);
  const recategorised = F().filter(results, { chips: { categories: ['antibot'] }, categoryOf: () => 'antibot' });
  assert.equal(recategorised.length, results.length);
  const byName = F().filter(results, { query: 'chosen', nameOf: (entry) => (entry.detector.name === 'Cloudflare' ? 'The chosen one' : '') });
  assert.deepEqual(names(byName), ['Cloudflare'], 'nameOf feeds the default search texts');
});

test('chips are normalised: unknown categories and non-lists are ignored, duplicates collapse; isActive and toggle', () => {
  const f = F();
  assert.deepEqual(f.normalizeChips(undefined), { combinations: false, categories: [] });
  assert.deepEqual(f.normalizeChips({ categories: 'captcha' }), { combinations: false, categories: [] });
  assert.deepEqual(f.normalizeChips({ categories: ['captcha', 'captcha', 'other', 7, null, 'Captcha'] }), { combinations: false, categories: ['captcha'] });
  assert.equal(f.isActive(undefined), false);
  assert.equal(f.isActive({}), false);
  assert.equal(f.isActive({ categories: ['other'] }), false, 'a name that is not a chip is not a chip');
  assert.equal(f.isActive({ categories: ['fingerprint'] }), true);
  assert.deepEqual(f.CATEGORIES, [...Categories.KEYS], 'the chips are the extension\'s categories, in their order');

  const start = f.normalizeChips();
  const one = f.toggle(start, 'captcha');
  assert.deepEqual(one, { combinations: false, categories: ['captcha'] });
  assert.deepEqual(start, { combinations: false, categories: [] }, 'the chips it was given are left alone');
  assert.deepEqual(f.toggle(one, 'antibot'), { combinations: false, categories: ['captcha', 'antibot'] });
  assert.deepEqual(f.toggle(f.toggle(one, 'antibot'), 'captcha'), { combinations: false, categories: ['antibot'] }, 'a second click turns it off');
  assert.deepEqual(f.toggle(one, 'captcha'), { combinations: false, categories: [] });
  assert.deepEqual(f.toggle(one, 'not-a-category'), { combinations: false, categories: ['captcha'] }, 'an unknown key changes nothing');
  assert.deepEqual(f.toggle(undefined, 'fingerprint'), { combinations: false, categories: ['fingerprint'] });
});

test('Combinations keeps the results where a combination fired, with the same reading as History, and ANDs with the rest', () => {
  const f = F();
  const H = require('../modules/core/history-filter.js');
  const fired = (name, category, combinations) => det(name, category, { combinations });
  const list = [
    fired('Cloudflare', 'Anti-Bot', [{ id: 'c1', name: 'Turnstile + cookie', confidence: 90 }]),
    fired('DataDome', 'Anti-Bot', []),
    fired('reCAPTCHA', 'CAPTCHA', [{ id: 'r1' }, { id: 'r2' }]),
    fired('Canvas Fingerprint', 'Fingerprint', 'junk'),
    fired('Navigator Fingerprint', 'Fingerprint', [null, 'x', 7]),
    det('Acme Shield', 'Acme custom category', { combinations: [{ id: 'a' }] })
  ];
  const on = { combinations: true };
  assert.deepEqual(names(f.filter(list, { chips: on })), ['Cloudflare', 'reCAPTCHA', 'Acme Shield']);
  assert.deepEqual(names(f.filter(list, { chips: { ...on, categories: ['antibot'] } })), ['Cloudflare'], 'with a category: AND');
  assert.deepEqual(names(f.filter(list, { chips: { ...on, categories: ['antibot', 'captcha'] } })), ['Cloudflare', 'reCAPTCHA']);
  assert.deepEqual(names(f.filter(list, { query: 'recaptcha', chips: on })), ['reCAPTCHA'], 'with the search: AND');
  assert.deepEqual(names(f.filter(list, { query: 'datadome', chips: on })), [], 'the right text, no combination');
  // the same list History's chip and card count read: the two cannot disagree
  for (const d of list) assert.equal(f.matches(d, { chips: on }), H.firedCombinations([d]).length > 0, d.detector.name);
  assert.equal(f.isActive(on), true);
  assert.equal(f.isActive({ combinations: 'yes' }), false, 'only true turns it on');
  assert.deepEqual(f.normalizeChips({ combinations: true, categories: ['captcha'] }), { combinations: true, categories: ['captcha'] });
  assert.deepEqual(f.toggle(f.normalizeChips(), 'combinations'), { combinations: true, categories: [] });
  assert.deepEqual(f.toggle(f.toggle(f.normalizeChips(), 'combinations'), 'combinations'), { combinations: false, categories: [] }, 'a second click turns it off');
  assert.deepEqual(f.toggle({ combinations: true, categories: ['captcha'] }, 'antibot'), { combinations: true, categories: ['captcha', 'antibot'] }, 'a category click keeps the flag');
  assert.deepEqual(f.FLAGS, ['combinations']);
});

test('the chip row has a Combinations chip with the card\'s icon and History\'s label', () => {
  const html = read('sections/detection/detection.html');
  const row = html.slice(html.indexOf('id="detectionFilters"'));
  assert.match(row, /data-filter="combinations"[\s\S]*?data-ui-icon="combination"[\s\S]*?data-i18n="historyFilterCombinations"/);
  assert.match(row, /data-filter="combinations"[^>]*aria-pressed="false"/);
});

test('results saved in either shape are read, and junk never throws', () => {
  const flat = { name: 'Flat', category: 'CAPTCHA' };
  const nested = { detector: { name: 'Nested', category: 'Fingerprint' } };
  const byId = { detector: { id: 'detect-x' }, category: 'Anti-Bot' };
  assert.deepEqual(F().filter([flat, nested, byId], { chips: { categories: ['captcha'] } }), [flat]);
  assert.deepEqual(F().filter([flat, nested, byId], { chips: { categories: ['fingerprint'] } }), [nested], 'the category under detector');
  assert.deepEqual(F().filter([flat, nested, byId], { query: 'flat' }), [flat]);
  for (const junk of [null, undefined, 'text', 7, {}, [], { detector: null }, { detector: 'Plain string', category: 5 }]) {
    assert.doesNotThrow(() => F().matches(junk, { query: 'x', chips: { categories: ['antibot'] } }), String(junk));
  }
  assert.equal(F().matches(null), false);
});

// ---- The tab: DetectionUI keeps the chips, filters the list, tells the person when nothing is left ----

function sandbox() {
  const context = vm.createContext({ self: {}, console });
  for (const file of ['modules/core/categories.js', 'modules/core/detection-filter.js', 'utils/format-utils.js', 'utils/detection-utils.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  context.Categories = context.self.Categories;
  context.DetectionFilter = context.self.DetectionFilter;
  context.FormatUtils = context.self.FormatUtils;
  // a minimal page: the chip row, the no-results block, the search box and the list
  const elements = {};
  const el = (extra = {}) => ({ hidden: false, style: { display: '', props: {}, setProperty(name, value) { this.props[name] = value; } }, value: '', innerHTML: '', ...extra });
  const chip = (key) => {
    const icon = el({ firstChild: null });
    const holder = { dataset: { filter: key, category: key }, attrs: {}, style: { props: {}, setProperty(name, value) { this.props[name] = value; } },
      setAttribute(name, value) { this.attrs[name] = value; }, querySelector: (selector) => (selector === '.category-icon' ? icon : null), icon };
    return holder;
  };
  const chips = Categories.KEYS.map(chip);
  elements['#detectionFilters'] = el({ querySelectorAll: () => chips });
  elements['#detectionNoResults'] = el({ hidden: true });
  elements['#detectionSearch'] = el();
  elements['#resultsList'] = el({ classList: { toggle() {} } });
  context.document = { querySelector: (selector) => elements[selector] || null };
  vm.runInContext(read('sections/detection/detection-ui.js'), context, { filename: 'detection-ui.js' });
  return { context, ui: context.self.DetectionUI, elements, chips };
}

function tab(extra = {}) {
  const shown = [];
  const state = {
    currentResults: results, searchQuery: '', activeChips: { combinations: false, categories: [] }, sortBy: 'category', categoryOrder: [...Categories.KEYS],
    detectorManager: { getCategoryInfo: (key) => ({ antibot: { colour: '#FF5733' }, captcha: { colour: '#33C3FF' }, fingerprint: { colour: '#3b82f6' } }[key]) },
    paginationManager: { setItems(items) { shown.push(names(items)); } },
    ...extra
  };
  return { state, shown };
}

test('getFilteredResults leaves what the chips and the search keep, in the Settings order; with neither it is every result untouched', () => {
  const { ui, context } = sandbox();
  const { state } = tab();
  state.getFilteredResults = ui.getFilteredResults;
  state.sortDetectionsByCategory = ui.sortDetectionsByCategory;
  assert.strictEqual(ui.getFilteredResults.call(state), results, 'no filter: the very same list');
  state.activeChips = { categories: ['fingerprint', 'antibot'] };
  assert.deepEqual(names(ui.getFilteredResults.call(state)), ['Cloudflare', 'DataDome', 'Canvas Fingerprint', 'Navigator Fingerprint'], 'anti-bot first, as in Settings');
  state.categoryOrder = ['fingerprint', 'captcha', 'antibot'];
  assert.deepEqual(names(ui.getFilteredResults.call(state)), ['Canvas Fingerprint', 'Navigator Fingerprint', 'Cloudflare', 'DataDome'], 'the order chosen in Settings → Detection');
  state.searchQuery = 'navigator';
  assert.deepEqual(names(ui.getFilteredResults.call(state)), ['Navigator Fingerprint'], 'the search narrows the chips');
  void context;
});

test('turning a chip on shows only that category on the list, turning it off shows all again, and the search stays', () => {
  const { ui } = sandbox();
  const { state, shown } = tab();
  Object.assign(state, { getFilteredResults: ui.getFilteredResults, sortDetectionsByCategory: ui.sortDetectionsByCategory });
  ui.toggleFilterChip.call(state, 'captcha');
  assert.deepEqual(shown.at(-1), ['reCAPTCHA']);
  ui.toggleFilterChip.call(state, 'fingerprint');
  assert.deepEqual(shown.at(-1), ['reCAPTCHA', 'Canvas Fingerprint', 'Navigator Fingerprint'], 'captcha or fingerprint');
  ui.toggleFilterChip.call(state, 'captcha');
  assert.deepEqual(shown.at(-1), ['Canvas Fingerprint', 'Navigator Fingerprint']);
  ui.toggleFilterChip.call(state, 'fingerprint');
  assert.deepEqual(shown.at(-1), ['Cloudflare', 'DataDome', 'reCAPTCHA', 'Canvas Fingerprint', 'Navigator Fingerprint', 'Acme Shield'], 'every chip off: every result, in the Settings order');
  ui.toggleFilterChip.call(state, 'not-a-category');
  assert.equal(shown.length, 4, 'an unknown chip redraws nothing');
  // the search typed later narrows what the chips left
  ui.toggleFilterChip.call(state, 'fingerprint');
  ui.handleSearch.call(state, ' Canvas ');
  assert.deepEqual(shown.at(-1), ['Canvas Fingerprint']);
  assert.equal(state.searchQuery, 'canvas');
});

test('the chips show which are on (aria-pressed) and carry their category icon in the colour chosen in Settings', () => {
  const { ui, chips } = sandbox();
  const { state } = tab({ activeChips: { categories: ['captcha'] } });
  ui.syncFilterChips.call(state);
  assert.deepEqual(chips.map(chip => chip.attrs['aria-pressed']), ['false', 'true', 'false']);
  assert.ok(chips.every(chip => /^<svg /.test(chip.icon.innerHTML)), 'the category icon is drawn once, in each chip');
  assert.deepEqual(chips.map(chip => chip.style.props['--chip-color']), ['#FF5733', '#33C3FF', '#3b82f6'], 'the Settings → Category colours');
  state.activeChips = { combinations: false, categories: [] };
  state.detectorManager = null;
  ui.syncFilterChips.call(state);
  assert.deepEqual(chips.map(chip => chip.attrs['aria-pressed']), ['false', 'false', 'false']);
  assert.deepEqual(chips.map(chip => chip.style.props['--chip-color']), ['#FF5733', '#33C3FF', '#3b82f6'], 'without the manager: the default colours');
});

test('when the search and the chips leave nothing a message with Clear filters shows; Clear filters turns every chip off and empties the search', () => {
  const { ui, elements } = sandbox();
  const { state, shown } = tab();
  Object.assign(state, { getFilteredResults: ui.getFilteredResults, sortDetectionsByCategory: ui.sortDetectionsByCategory });
  elements['#detectionSearch'].value = 'cloudflare';
  state.searchQuery = 'cloudflare';
  state.activeChips = { categories: ['captcha'] };
  ui.applyFilters.call(state);
  assert.deepEqual(shown.at(-1), []);
  assert.equal(elements['#detectionNoResults'].hidden, false, 'the way back is on screen');
  ui.clearFilters.call(state);
  assert.deepEqual(JSON.parse(JSON.stringify(state.activeChips)), { combinations: false, categories: [] }, 'what the sandbox built, compared as data');
  assert.equal(state.searchQuery, '');
  assert.equal(elements['#detectionSearch'].value, '', 'the search box is emptied too');
  assert.equal(shown.at(-1).length, results.length, 'every result again');
  assert.equal(elements['#detectionNoResults'].hidden, true);
  // a search that finds nothing, without any chip, gets the same message
  state.searchQuery = 'nothing matches';
  ui.applyFilters.call(state);
  assert.equal(elements['#detectionNoResults'].hidden, false);
});

test('a new order saved in Settings redraws the filtered list, not the whole one', () => {
  const { ui } = sandbox();
  const context = vm.createContext({ console, window: {}, self: {} });
  for (const file of ['modules/core/categories.js', 'utils/detection-utils.js']) vm.runInContext(read(file), context, { filename: file });
  context.DetectionUI = ui;
  vm.runInContext(read('sections/detection/detection.js'), context, { filename: 'detection.js' });
  const Detection = context.window.Detection;
  const { state, shown } = tab({ activeChips: { categories: ['antibot'] } });
  const view = Object.assign(Object.create(Detection.prototype), state, {
    getFilteredResults: ui.getFilteredResults, sortDetectionsByCategory: ui.sortDetectionsByCategory
  });
  view.applyDetectionSort({ sortBy: 'category', categoryOrder: ['captcha', 'fingerprint', 'antibot'] }, { rerender: true });
  assert.deepEqual(shown.at(-1), ['Cloudflare', 'DataDome'], 'only the anti-bot results are laid out again');
});

// ---- The markup, its registration and its words ----

const html = read('sections/detection/detection.html');
const row = html.slice(html.indexOf('id="detectionFilters"'), html.indexOf('id="resultsList"'));

test('the row sits in the summary card under the search, is a labelled group, and has one chip for every category in the category order', () => {
  assert.ok(html.indexOf('id="detectionFilters"') > html.indexOf('id="detectionSearch"'), 'under the search');
  assert.ok(html.indexOf('id="detectionFilters"') < html.indexOf('id="resultsList"'), 'above the results');
  const overview = html.slice(html.indexOf('id="detectionOverview"'), html.indexOf('id="resultsList"'));
  assert.ok(overview.includes('id="detectionFilters"'), 'inside the overview: it is hidden with it when there are no results');
  const open = html.match(/<div id="detectionFilters"[^>]*>/)[0];
  assert.match(open, /role="group"/);
  assert.match(open, /aria-label="Filter detections"/);
  assert.match(open, /data-i18n-aria-label="detectionFiltersLabel"/);
  const chips = [...row.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match => ({
    attrs: match[1], filter: (match[1].match(/data-filter="([a-z]+)"/) || [])[1], category: (match[1].match(/data-category="([a-z]+)"/) || [])[1],
    label: (match[2].match(/data-i18n="([A-Za-z]+)"/) || [])[1], icon: /class="history-filter-icon category-icon"/.test(match[2])
  })).filter(chip => chip.filter);
  assert.deepEqual(chips.map(chip => chip.filter), [...Categories.KEYS, 'combinations'], 'one chip per category, in the category order, then Combinations');
  for (const chip of chips.filter(chip => chip.filter !== 'combinations')) {
    assert.match(chip.attrs, /type="button"/);
    assert.match(chip.attrs, /aria-pressed="false"/, 'off to start with');
    assert.match(chip.attrs, /class="history-filter-chip"/, 'the chip look History already has');
    assert.equal(chip.category, chip.filter, 'the category carries the icon and its colour');
    assert.equal(chip.label, Categories.LABELS[chip.filter][0], 'named as the rest of the extension names the category');
    assert.ok(chip.icon, 'with the category icon');
  }
});

test('the no-results block uses History\'s words and button, and sits between the list and the pagination', () => {
  const block = html.match(/<div id="detectionNoResults"[^>]*>[\s\S]*?<\/div>/)[0];
  assert.match(block, /\bhidden\b/);
  assert.match(block, /data-i18n="historyNoResults"/);
  assert.match(block, /id="detectionClearFilters"[^>]*data-i18n="historyClearFilters"/);
  assert.ok(html.indexOf('id="resultsList"') < html.indexOf('id="detectionNoResults"') && html.indexOf('id="detectionNoResults"') < html.indexOf('id="detectionPagination"'));
});

test('the tab wires the chips and Clear filters, and the popup loads the module before the Detection tab', () => {
  const source = read('sections/detection/detection.js');
  assert.match(source, /#detectionFilters/);
  assert.match(source, /#detectionClearFilters/);
  const popup = [...read('popup.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const module = 'modules/core/detection-filter.js';
  assert.ok(popup.includes(module), 'registered in the popup');
  assert.ok(popup.indexOf('modules/core/categories.js') < popup.indexOf(module), 'after the categories it reads');
  for (const user of ['sections/detection/detection.js', 'sections/detection/detection-ui.js']) assert.ok(popup.indexOf(module) < popup.indexOf(user), `before ${user}`);
  // the popup alone shows chips: nothing of it in the worker, the content script or the page's own world
  assert.ok(!read('background.js').includes('detection-filter'));
  const manifest = JSON.parse(read('manifest.json'));
  assert.ok(!manifest.content_scripts.some(entry => entry.js.includes(module)));
  assert.ok(popup.includes('modules/core/history-filter.js') && read('popup.html').includes('sections/history/history.css'), 'the chip look comes from the History stylesheet the popup already links');
});

test('every language has the row\'s label, translated', () => {
  const en = JSON.parse(read('_locales/en/messages.json'));
  assert.equal(en.detectionFiltersLabel.message, 'Filter detections');
  assert.ok(en.detectionFiltersLabel.description, 'English says where it is used');
  for (const locale of fs.readdirSync(path.join(root, '_locales')).filter(name => name !== 'en')) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    assert.ok(messages.detectionFiltersLabel && messages.detectionFiltersLabel.message.trim(), locale);
    assert.notEqual(messages.detectionFiltersLabel.message, en.detectionFiltersLabel.message, `${locale} is translated`);
  }
});
