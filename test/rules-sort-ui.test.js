'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Rules tab: a sort dropdown at the end of the search row (History's has its chip row; here the chips already fill two rows). The list is drawn in the order
// chosen (Default is the order the tab always had), the choice comes back the next time the popup opens (the browser's own storage,
// as History keeps its sort), and a search still puts the best name first. This file drives the real Rules scripts in a sandbox.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const Categories = require('../modules/core/categories.js');

/** A localStorage that remembers, or one that throws (private window, blocked site data). */
const storage = (data = {}, broken = false) => ({
  data,
  getItem(key) { if (broken) throw new Error('blocked'); return Object.hasOwn(data, key) ? data[key] : null; },
  setItem(key, value) { if (broken) throw new Error('blocked'); data[key] = String(value); }
});

const rule = (id, name, extra = {}) => ({ id, name, displayName: name, enabled: true, author: 'Me', detection: {}, ...extra });
/** What the tab keeps: the default order of this library is zed, abe, cap, fp, off (enabled first, the category order, newest update, name) */
const library = () => ({
  antibot: { zed: rule('zed', 'Zed', { lastUpdated: '2026-11-05' }), abe: rule('abe', 'abe', { lastUpdated: '2026-10-01 10:30:00' }) },
  captcha: { cap: rule('cap', 'Cap', { lastUpdated: '2026-11-07 10:00:00' }), off: rule('off', 'Off', { enabled: false, lastUpdated: '2026-11-09' }) },
  fingerprint: { fp: rule('fp', 'Fp') }
});
const DEFAULT = ['zed', 'abe', 'cap', 'fp', 'off'];
const BY_NAME = ['abe', 'cap', 'fp', 'off', 'zed'];
const BY_UPDATE = ['off', 'cap', 'zed', 'abe', 'fp'];

/**
 * The real Rules scripts, with one fake page: the dropdown, the search box, the chip row and the list. `local` is the browser's
 * localStorage for the popup (undefined: there is none).
 */
function tab({ local, rules = library() } = {}) {
  const calls = { options: [], shown: [] };
  const select = { value: 'default', listeners: {}, addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); } };
  const elements = {
    '#rulesSort': select,
    '#rulesList': { innerHTML: '', querySelectorAll: () => [], addEventListener() {} },
    '#detectorsEmpty': { style: {} },
    '#rulesSearch': { value: '', addEventListener() {} },
    '#rulesFilters': { hidden: false, querySelectorAll: () => [], addEventListener() {} },
    '#rulesNoResults': { hidden: true }
  };
  const sandbox = { console, Logger: { debug() {}, error() {}, ui() {}, warn() {} }, Utils: { getSettings: async () => ({ detection: {} }) },
    FormatUtils: require('../utils/format-utils.js'), document: { querySelector: (selector) => elements[selector] || null, querySelectorAll: () => [], addEventListener() {} } };
  if (local !== undefined) sandbox.localStorage = local;
  const context = vm.createContext(sandbox);
  for (const file of ['modules/core/categories.js', 'modules/core/rules-sort.js', 'modules/core/rules-filter.js']) vm.runInContext(read(file), context, { filename: file });
  vm.runInContext(read('utils/detection-utils.js') + '\nthis.DetectionUtils = DetectionUtils;', context);
  for (const file of ['sections/rules/rules.js', 'sections/rules/rules-handlers.js', 'sections/rules/rules-formatters.js', 'sections/rules/rules-display.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const Rules = vm.runInContext('Rules', context);
  const view = new Rules({ getCategoryManager: () => ({ getCategoryInfo: () => ({ colour: '#3b82f6' }) }), getAllDetectors: () => rules });
  Object.assign(view, {
    initialized: true,
    paginationManager: { setItems(items, options) { calls.shown.push(Array.from(items, entry => entry.detectorName)); calls.options.push(options); } },
    // what the other Rules scripts wire is tested elsewhere; the sort is under test here
    setupModalEventListeners() {}
  });
  const choose = async (key) => { select.value = key; for (const fn of select.listeners.change || []) fn(); await settle(); };
  return { view, select, elements, calls, choose, context, rules };
}

test('the list is drawn in the order chosen: Default keeps the order the tab always had, Name A to Z and Recently updated re-order it', async () => {
  const t = tab();
  await t.view.displayRules();
  assert.deepEqual(t.calls.shown.at(-1), DEFAULT, 'Default: the order of every earlier version');
  assert.equal(t.view.sortKey, 'default');
  t.view.sortKey = 'name';
  await t.view.displayRules();
  assert.deepEqual(t.calls.shown.at(-1), BY_NAME, 'Name A to Z: switched-off rules are not pushed to the end');
  t.view.sortKey = 'updated';
  await t.view.displayRules();
  assert.deepEqual(t.calls.shown.at(-1), BY_UPDATE, 'Recently updated: the newest first, a rule with no date last');
  t.view.sortKey = 'nonsense';
  await t.view.displayRules();
  assert.deepEqual(t.calls.shown.at(-1), DEFAULT, 'a key nobody knows is Default');
});

test('the order chosen applies to everything the tab lists, not only the pages: allDetectors and filteredDetectors agree with the pager', async () => {
  const t = tab();
  t.view.sortKey = 'name';
  await t.view.displayRules();
  // the lists live in the sandbox's realm: copied out, so they compare as plain arrays
  assert.deepEqual([...t.view.allDetectors].map(entry => entry.detectorName), BY_NAME);
  assert.deepEqual([...t.view.filteredDetectors].map(entry => entry.detectorName), BY_NAME);
});

test('picking an option in the dropdown redraws the list from page 1, and remembers the choice', async () => {
  const local = storage();
  const t = tab({ local });
  t.view.setupEventListeners();
  await settle();
  assert.equal(t.select.listeners.change.length, 1, 'the dropdown is wired once');
  await t.choose('name');
  assert.deepEqual(t.calls.shown.at(-1), BY_NAME);
  assert.equal(t.calls.options.at(-1).keepPage, false, 'a new order starts at the top, not on the page that was shown');
  assert.equal(t.view.sortKey, 'name');
  assert.equal(local.data.rulesSortKey, 'name', 'kept for the next time the popup opens');
  await t.choose('updated');
  assert.deepEqual(t.calls.shown.at(-1), BY_UPDATE);
  assert.equal(local.data.rulesSortKey, 'updated');
  await t.choose('default');
  assert.deepEqual(t.calls.shown.at(-1), DEFAULT);
  assert.equal(local.data.rulesSortKey, 'default');
  await t.choose('something-else');
  assert.equal(t.view.sortKey, 'default', 'a value the page does not offer is Default');
  assert.equal(local.data.historySortKey, undefined, 'History\'s own choice is not touched');
});

test('the order comes back the next time the popup opens: the new Rules tab starts with it, and the dropdown shows it', async () => {
  const local = storage();
  const first = tab({ local });
  first.view.setupEventListeners();
  await first.choose('updated');
  const next = tab({ local });
  assert.equal(next.view.sortKey, 'updated', 'read when the tab is created');
  next.view.setupEventListeners();
  assert.equal(next.select.value, 'updated', 'the dropdown shows the order it will draw');
  await next.view.displayRules();
  assert.deepEqual(next.calls.shown.at(-1), BY_UPDATE, 'and the first drawing uses it');
});

test('a stored order nobody knows, a storage that throws, or no storage at all leaves Default', async () => {
  const junk = tab({ local: storage({ rulesSortKey: 'sideways' }) });
  assert.equal(junk.view.sortKey, 'default');
  junk.view.setupEventListeners();
  assert.equal(junk.select.value, 'default');
  const history = tab({ local: storage({ rulesSortKey: 'host', historySortKey: 'host' }) });
  assert.equal(history.view.sortKey, 'default', 'a History key is not a Rules key');
  const blocked = tab({ local: storage({}, true) });
  assert.equal(blocked.view.sortKey, 'default');
  assert.doesNotThrow(() => blocked.view.saveViewPrefs());
  blocked.view.setupEventListeners();
  await blocked.choose('name');
  assert.deepEqual(blocked.calls.shown.at(-1), BY_NAME, 'the choice lasts until the popup closes even when it cannot be kept');
  const none = tab();
  assert.equal(none.view.sortKey, 'default');
  assert.doesNotThrow(() => none.view.restoreViewPrefs(), 'no localStorage at all');
  assert.doesNotThrow(() => none.view.saveViewPrefs());
});

test('the order the person chose is what the filters and the search work from: the best name first, ties in the chosen order', async () => {
  const rules = { antibot: {
    beta: rule('beta', 'Beta Cap', { lastUpdated: '2026-11-02' }), alpha: rule('alpha', 'Alpha cap', { lastUpdated: '2026-11-01' }),
    capy: rule('capy', 'Capy', { lastUpdated: '2026-10-01' }), cap: rule('cap', 'Cap', { lastUpdated: '2026-09-01' }) } };
  const t = tab({ rules });
  await t.view.displayRules();
  t.elements['#rulesSearch'].value = 'cap';
  t.view.handleSearch('cap');
  assert.deepEqual(t.calls.shown.at(-1), ['cap', 'capy', 'beta', 'alpha'], 'Default: the exact name, a name that starts with it, then the rest in the list order (newest first)');
  t.view.sortKey = 'name';
  await t.view.displayRules();
  assert.deepEqual(t.calls.shown.at(-1), ['cap', 'capy', 'alpha', 'beta'], 'Name A to Z: the same best matches first, the rest A to Z');
  t.view.sortKey = 'updated';
  await t.view.displayRules();
  assert.deepEqual(t.calls.shown.at(-1), ['cap', 'capy', 'beta', 'alpha'], 'Recently updated: the newest of the rest first');
});

test('Recently updated as a sort and as a chip work together: the chip keeps what changed lately, the sort puts the newest on top', async () => {
  const day = 86400000;
  const stamp = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  const rules = { antibot: {
    old: rule('old', 'Old one', { lastUpdated: '2020-01-01' }), fresh: rule('fresh', 'Fresh', { lastUpdated: stamp(Date.now() - 2 * day) }),
    fresher: rule('fresher', 'Fresher', { lastUpdated: stamp(Date.now() - 60 * 1000) }), none: rule('none', 'Dateless') } };
  const t = tab({ rules });
  t.view.sortKey = 'updated';
  await t.view.displayRules();
  assert.deepEqual(t.calls.shown.at(-1), ['fresher', 'fresh', 'old', 'none']);
  t.view.toggleFilterChip('updated');
  assert.deepEqual(t.calls.shown.at(-1), ['fresher', 'fresh'], 'the chip keeps the last 30 days, in the order chosen');
  t.view.sortKey = 'name';
  await t.view.displayRules();
  assert.deepEqual(t.calls.shown.at(-1), ['fresh', 'fresher'], 'the same rules, A to Z (the chip stays on across the redraw)');
});

test('getSortTimestamp, which the Default order reads, is the same reading the sort and the chip use', () => {
  const t = tab();
  for (const value of ['2026-11-05', '2026-11-05 10:30:00', '2026-11-05T10:30:00Z', 1762300800000, '', undefined, null, 'soon', {}]) {
    assert.equal(t.view.getSortTimestamp(value), t.context.RulesSort.timeOf(value), String(value));
  }
});

// ---- The markup, the style, the registration and the words ----

const html = read('sections/rules/rules.html');
const row = html.slice(html.indexOf('id="rulesFilters"'), html.indexOf('id="rulesList"'));
const searchRow = html.slice(html.indexOf('class="rules-search-row"'), html.indexOf('id="rulesFilters"'));
const select = searchRow.match(/<select\b[^>]*id="rulesSort"[^>]*>[\s\S]*?<\/select>/);

test('the dropdown sits at the end of the search row, so the chips below keep their height, and offers exactly the keys the module knows, in order', () => {
  assert.ok(html.indexOf('class="rules-search-row"') >= 0, 'the search box and the dropdown share a row');
  assert.ok(select, 'a select with the id rulesSort is in the search row');
  assert.ok(searchRow.indexOf('id="rulesSort"') > searchRow.indexOf('id="rulesSearch"'), 'after the search box');
  assert.ok(!row.includes('<select'), 'not in the chip row: it would add a third row there in English');
  const values = [...select[0].matchAll(/<option\b[^>]*value="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(values, require('../modules/core/rules-sort.js').KEYS);
  assert.deepEqual(values, ['default', 'name', 'updated']);
});

test('the dropdown has an accessible name, the shared arrow and select look, and every option is a translated word', () => {
  const open = select[0].match(/<select\b[^>]*>/)[0];
  assert.match(open, /aria-label="Sort rules"/);
  assert.match(open, /data-i18n-aria-label="rulesSortLabel"/);
  const classes = (open.match(/class="([^"]*)"/) || [])[1].split(/\s+/);
  assert.ok(classes.includes('ui-select'), 'the arrow every dropdown of the interface draws (test/ui-controls.test.js)');
  assert.ok(classes.includes('select-field') && classes.includes('rules-sort'));
  const en = JSON.parse(read('_locales/en/messages.json'));
  const options = [...select[0].matchAll(/<option\b[^>]*value="([^"]+)"[^>]*data-i18n="([A-Za-z]+)"[^>]*>([^<]*)<\/option>/g)].map(match => ({ value: match[1], key: match[2], text: match[3] }));
  assert.deepEqual(options.map(option => option.key), ['rulesSortDefault', 'rulesSortName', 'rulesRecentlyUpdated']);
  for (const option of options) assert.equal(option.text, en[option.key].message, `${option.value}: the page's own text is the English one`);
  assert.equal(en.rulesSortLabel.message, 'Sort rules');
  assert.deepEqual(['rulesSortDefault', 'rulesSortName', 'rulesRecentlyUpdated'].map(key => en[key].message), ['Default', 'Name A to Z', 'Recently updated']);
});

test('the dropdown is drawn as the search box beside it, keeps its own width, and mirrors for Arabic as History\'s does', () => {
  const declarations = (css, selector) => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, `${selector} is defined`);
    return Object.fromEntries(css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at)).replace(/\/\*[\s\S]*?\*\//g, '').split(';')
      .map(line => line.trim()).filter(Boolean).map(line => [line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()]));
  };
  const css = read('sections/rules/styles/list.css');
  const search = declarations(css, '.rules-header .search-input');
  const rules = declarations(css, '.rules-search-row select.rules-sort');
  for (const property of ['height', 'border', 'border-radius']) assert.equal(rules[property], search[property], `${property}: as the search box`);
  assert.equal(rules['background-color'], search.background, 'the same fill as the search box');
  assert.equal(rules.flex, '0 0 auto', 'not stretched: the search box takes the rest of the row');
  assert.match(rules.width, /^\d+px$/);
  assert.ok(parseInt(rules.width, 10) <= 140, 'narrow enough to leave the search box most of the row');
  assert.equal(declarations(css, '.rules-header .rules-search-row .search-container').flex, '1 1 auto');
  const rtl = declarations(css, '[dir="rtl"] .rules-search-row select.rules-sort');
  assert.equal(rtl.padding, '0 10px 0 26px', 'the arrow\'s room is on the left in Arabic');
  assert.equal(rtl['background-position'], 'left 9px center', 'and so is the arrow');
  const historyRtl = declarations(read('sections/history/history.css'), '[dir="rtl"] #historyTab .history-filters select.history-sort');
  assert.deepEqual(rtl, historyRtl, 'mirrored exactly as History\'s');
  for (const state of [':hover', ':focus', ':focus-visible']) assert.match(css, new RegExp(`\\.rules-search-row select\\.rules-sort${state.replace(':', '\\:')} \\{`), `${state} is styled`);
  assert.match(css, /\.rules-search-row select\.rules-sort:focus-visible \{\s*outline: 2px solid var\(--accent\);/, 'a keyboard user sees where the focus is');
});

test('the tab wires the dropdown and keeps its choice the way History does, and the popup loads the module before the Rules scripts', () => {
  const source = read('sections/rules/rules.js');
  assert.match(source, /#rulesSort/);
  assert.match(source, /localStorage\.getItem\('rulesSortKey'\)/);
  assert.match(source, /localStorage\.setItem\('rulesSortKey', this\.sortKey\)/);
  assert.match(source, /this\.sortKey = 'default'/);
  const popup = [...read('popup.html').matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  const module = 'modules/core/rules-sort.js';
  assert.equal(popup.filter(file => file === module).length, 1, 'registered once');
  assert.ok(popup.indexOf(module) < popup.indexOf('modules/core/rules-filter.js'), 'before the filter, which reads its dates');
  for (const user of ['sections/rules/rules.js', 'sections/rules/rules-formatters.js', 'sections/rules/rules-display.js']) assert.ok(popup.indexOf(module) < popup.indexOf(user), `before ${user}`);
  assert.ok(!read('background.js').includes('rules-sort'), 'popup only');
  assert.ok(!JSON.parse(read('manifest.json')).content_scripts.some(entry => entry.js.includes(module)));
});

test('every language has the five new words, and none of them was left in English', () => {
  const en = JSON.parse(read('_locales/en/messages.json'));
  const keys = ['rulesSortLabel', 'rulesSortDefault', 'rulesSortName', 'rulesRecentlyUpdated', 'rulesRecentlyUpdatedTip'];
  for (const key of keys) assert.ok(en[key].description, `${key}: English says where it is used`);
  assert.deepEqual(keys.map(key => en[key].message), ['Sort rules', 'Default', 'Name A to Z', 'Recently updated', 'Updated in the last 30 days']);
  const locales = fs.readdirSync(path.join(root, '_locales')).filter(name => name !== 'en');
  assert.equal(locales.length, 21);
  for (const locale of locales) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    for (const key of keys) {
      assert.ok(messages[key] && messages[key].message.trim(), `${locale} ${key}`);
      assert.notEqual(messages[key].message, en[key].message, `${locale} ${key} is translated`);
    }
    // the 30 days are in the tip, written as the language writes numbers
    assert.match(messages.rulesRecentlyUpdatedTip.message, /30/, `${locale}: the window is said`);
  }
});

test('the categories the row still names are the extension\'s own (the row did not lose a chip)', () => {
  const chips = [...row.matchAll(/<button\b[^>]*data-filter="([a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(chips, [...Categories.KEYS, 'updated', 'custom', 'edited', 'disabled']);
});
