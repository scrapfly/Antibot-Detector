const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Rules tab: chips under the search for the three categories, Custom (the person's own rules), Edited (a shipped rule the
// person changed), Disabled and Recently updated (a rule updated in the last 30 days). The pure module decides which rule stays:
// the categories mean "any of them", Custom and Edited together keep either (a rule is never both), Disabled and Recently updated
// narrow, and everything combines with the search with AND.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
// Loaded inside each test, so a missing module is one failure per test and not one failure of the whole file
const F = () => require('../modules/core/rules-filter.js');
const Categories = require('../modules/core/categories.js');

const OFFICIAL = new Set(['detect-cloudflare', 'detect-datadome', 'detect-recaptcha', 'detect-canvas', 'detect-akamai']);
const shipped = { id: 'x', name: 'Shipped text' };
/** { category, detectorName, detector }, as the Rules tab lists them */
const rule = (id, category, extra = {}) => ({ category, detectorName: id, detector: { id, name: id, displayName: id, description: `Finds ${id}`, enabled: true, author: OFFICIAL.has(id) ? 'Scrapfly' : 'Me', detection: { cookie: [{ id: 'c' }], url: [] }, ...extra } });
const rules = [
  rule('detect-cloudflare', 'antibot'),                                                                        // shipped, as it came
  rule('detect-datadome', 'antibot', { userModified: true, officialSnapshot: shipped }),                       // shipped, edited by the person
  rule('detect-recaptcha', 'captcha', { enabled: false }),                                                     // shipped, switched off
  rule('custom-1', 'captcha'),                                                                                 // the person's own
  rule('custom-2', 'fingerprint', { enabled: false }),                                                         // the person's own, switched off
  rule('detect-canvas', 'fingerprint', { userModified: true, officialSnapshot: shipped, enabled: false }),     // shipped, edited and switched off
  rule('detect-akamai', 'antibot', { userModified: true })                                                      // marked, but with nothing to go back to: not edited
];
const isOfficial = (entry) => OFFICIAL.has(entry.detector.id) && entry.detector.author === 'Scrapfly';
const ids = (list) => list.map(entry => entry.detectorName);
const keep = (chips, extra = {}) => ids(F().filter(rules, { chips, isOfficial, ...extra }));

test('no search and no chips keeps every rule in its order, and drops empty ones', () => {
  assert.deepEqual(ids(F().filter(rules)), ids(rules));
  assert.deepEqual(ids(F().filter([null, ...rules, undefined, {}, { detector: null }], { query: '  ', chips: {} })), ids(rules));
  assert.deepEqual(F().filter(undefined, { query: 'x' }), []);
  assert.notStrictEqual(F().filter(rules), rules, 'a new list: the tab keeps both');
});

test('Custom keeps the rules that are not Scrapfly\'s own; Edited a shipped rule the person changed; Disabled a rule switched off', () => {
  assert.deepEqual(keep({ custom: true }), ['custom-1', 'custom-2']);
  assert.deepEqual(keep({ edited: true }), ['detect-datadome', 'detect-canvas'], 'a mark without a snapshot is not an edit');
  assert.deepEqual(keep({ disabled: true }), ['detect-recaptcha', 'custom-2', 'detect-canvas']);
});

test('a shipped rule the person edited is Edited and not Custom; the person\'s own rule is Custom and not Edited', () => {
  const edited = rules[1];
  const own = rules[3];
  assert.ok(keep({ edited: true }).includes(edited.detectorName) && !keep({ custom: true }).includes(edited.detectorName));
  assert.ok(keep({ custom: true }).includes(own.detectorName) && !keep({ edited: true }).includes(own.detectorName));
});

test('Edited asks the popup\'s own reader, so an edit that only translated the rule is not one', () => {
  const asked = [];
  const translated = (entry) => { asked.push(entry.detectorName); return entry.detectorName === 'detect-canvas'; };
  assert.deepEqual(keep({ edited: true }, { isEdited: translated }), ['detect-canvas']);
  assert.ok(asked.includes('detect-datadome'), 'every rule was put to the reader');
  // without a reader the rule's own marks decide, as the card does without DetectorManager
  assert.deepEqual(keep({ edited: true }), ['detect-datadome', 'detect-canvas']);
});

test('Custom and Edited together keep either, and every other chip narrows what they keep', () => {
  assert.deepEqual(keep({ custom: true, edited: true }), ['detect-datadome', 'custom-1', 'custom-2', 'detect-canvas'], 'the rules the person made or changed');
  assert.deepEqual(keep({ custom: true, disabled: true }), ['custom-2']);
  assert.deepEqual(keep({ edited: true, disabled: true }), ['detect-canvas']);
  assert.deepEqual(keep({ custom: true, edited: true, disabled: true }), ['custom-2', 'detect-canvas']);
  assert.deepEqual(keep({ custom: true, categories: ['captcha'] }), ['custom-1']);
  assert.deepEqual(keep({ edited: true, categories: ['captcha'] }), [], 'no edited captcha rule');
});

test('category chips mean "any of these", and narrow with the other chips', () => {
  assert.deepEqual(keep({ categories: ['antibot'] }), ['detect-cloudflare', 'detect-datadome', 'detect-akamai']);
  assert.deepEqual(keep({ categories: ['captcha'] }), ['detect-recaptcha', 'custom-1']);
  assert.deepEqual(keep({ categories: ['antibot', 'captcha'] }), ['detect-cloudflare', 'detect-datadome', 'detect-recaptcha', 'custom-1', 'detect-akamai'], 'either');
  assert.deepEqual(keep({ categories: ['captcha', 'fingerprint'], disabled: true }), ['detect-recaptcha', 'custom-2', 'detect-canvas']);
  assert.deepEqual(keep({ categories: ['antibot'], disabled: true }), []);
});

test('everything combines with the search with AND', () => {
  assert.deepEqual(keep({ edited: true }, { query: 'datadome' }), ['detect-datadome']);
  assert.deepEqual(keep({ custom: true }, { query: 'datadome' }), [], 'the right text, the wrong kind of rule');
  assert.deepEqual(keep({ disabled: true, categories: ['fingerprint'] }, { query: 'CUSTOM' }), ['custom-2']);
  assert.deepEqual(keep({ disabled: true, categories: ['fingerprint'] }, { query: 'detect-' }), ['detect-canvas']);
  assert.deepEqual(keep({ custom: true, edited: true, disabled: true, categories: ['fingerprint'] }, { query: 'nothing matches' }), []);
  assert.deepEqual(keep({}, { query: 'finds detect-recaptcha' }), ['detect-recaptcha'], 'the search alone: the description counts');
});

test('the search looks in the name, the category (as the card shows it too), the description and the method types, and ranks the best name first', () => {
  const entry = (name, category = 'captcha', extra = {}) => ({ category, detectorName: name, detector: { name, displayName: name, description: '', ...extra } });
  const list = [entry('reCAPTCHA'), entry('Capy'), entry('hCaptcha'), entry('Cap'), entry('Cloudflare', 'antibot', { description: 'no match' }), entry('Turnstile')];
  assert.deepEqual(ids(F().filter(list, { query: 'cap' })), ['Cap', 'Capy', 'reCAPTCHA', 'hCaptcha', 'Turnstile'], 'exact name, names that start with it, names that contain it, then the others in their order');
  assert.deepEqual(ids(F().filter(list, { query: '' })), ids(list));
  const labelled = F().filter(list, { query: 'robot', categoryLabelOf: (e) => (e.category === 'antibot' ? 'Robots' : '') });
  assert.deepEqual(ids(labelled), ['Cloudflare'], 'the category as the card shows it');
  const methods = [entry('One', 'antibot', { detection: { cookie: [{}], dom_rule: [{}], url: [] } }), entry('Two', 'antibot', { detection: { header: [{}] } })];
  assert.deepEqual(ids(F().filter(methods, { query: 'dom rule' })), ['One'], 'a method type with rules');
  assert.deepEqual(ids(F().filter(methods, { query: 'url' })), [], 'a method type with no rules is not searched');
});

test('chips are normalised: unknown names and non-booleans are ignored, duplicates collapse; isActive, isChip and toggle', () => {
  const f = F();
  assert.deepEqual(f.normalizeChips(undefined), { custom: false, edited: false, disabled: false, updated: false, categories: [] });
  assert.deepEqual(f.normalizeChips({ custom: 'yes', edited: 1, disabled: true, updated: 'recently', categories: ['captcha', 'captcha', 'other', 7, 'x'] }), { custom: false, edited: false, disabled: true, updated: false, categories: ['captcha'] });
  assert.deepEqual(f.FLAGS, ['custom', 'edited', 'disabled', 'updated'], 'the on/off chips, in the order of the row');
  assert.deepEqual(f.CATEGORIES, [...Categories.KEYS]);
  assert.equal(f.isActive({}), false);
  assert.equal(f.isActive({ categories: ['other'] }), false);
  for (const chips of [{ custom: true }, { edited: true }, { disabled: true }, { updated: true }, { categories: ['fingerprint'] }]) assert.equal(f.isActive(chips), true, JSON.stringify(chips));
  for (const key of [...f.FLAGS, ...f.CATEGORIES]) assert.equal(f.isChip(key), true, key);
  for (const key of ['other', '', undefined, 'pinned', 'recent']) assert.equal(f.isChip(key), false, String(key));

  const start = f.normalizeChips();
  const edited = f.toggle(start, 'edited');
  assert.deepEqual(edited, { custom: false, edited: true, disabled: false, updated: false, categories: [] });
  assert.deepEqual(start, { custom: false, edited: false, disabled: false, updated: false, categories: [] }, 'the chips it was given are left alone');
  assert.deepEqual(f.toggle(edited, 'edited'), start, 'a second click turns it off');
  assert.deepEqual(f.toggle(f.toggle(start, 'captcha'), 'antibot'), { custom: false, edited: false, disabled: false, updated: false, categories: ['captcha', 'antibot'] });
  assert.deepEqual(f.toggle(f.toggle(start, 'updated'), 'updated'), start, 'Recently updated turns on and off like the others');
  assert.equal(f.toggle(start, 'updated').updated, true);
  assert.deepEqual(f.toggle(start, 'not-a-chip'), start);
});

// ---- Recently updated: a rule whose last update is inside the last 30 days ----

const DAY = 86400000;
const NOW = new Date(2026, 10, 11, 12, 0, 0).getTime(); // 11 November 2026, noon, local time
/** A moment written as the editor writes a rule's date: local time, "YYYY-MM-DD HH:MM:SS" */
const stampOf = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
/** The date a rule carries when it was updated `days` days before NOW */
const ago = (days) => stampOf(NOW - days * DAY);
const dated = [
  rule('today', 'antibot', { lastUpdated: ago(0) }),
  rule('week-old', 'captcha', { lastUpdated: ago(7) }),
  rule('edge-in', 'antibot', { lastUpdated: ago(29.9) }),
  rule('edge-out', 'fingerprint', { lastUpdated: ago(30.1) }),
  rule('stale', 'captcha', { lastUpdated: '2025-01-01' }),
  rule('no-date', 'antibot'),
  rule('bad-date', 'fingerprint', { lastUpdated: 'soon' }),
  rule('future', 'antibot', { lastUpdated: ago(-2) }),
  rule('stamp-ms', 'captcha', { lastUpdated: NOW - 3 * DAY })
];
const recent = (chips = {}, extra = {}) => ids(F().filter(dated, { chips: { updated: true, ...chips }, now: NOW, ...extra }));

test('Recently updated keeps the rules updated in the last 30 days, and the window is 30 days', () => {
  assert.equal(F().RECENT_DAYS, 30);
  assert.deepEqual(recent(), ['today', 'week-old', 'edge-in', 'future', 'stamp-ms'], 'inside the window, or later than now');
  assert.deepEqual(ids(F().filter(dated, { now: NOW })), ids(dated), 'with the chip off every rule stays');
});

test('a rule with no date, or a date that cannot be read, is not recently updated', () => {
  const out = recent();
  assert.ok(!out.includes('no-date') && !out.includes('bad-date') && !out.includes('stale'));
  assert.equal(F().matches(rule('odd', 'antibot', { lastUpdated: { nested: true } }), { chips: { updated: true }, now: NOW }), false);
  assert.equal(F().matches(rule('nan', 'antibot', { lastUpdated: NaN }), { chips: { updated: true }, now: NOW }), false);
});

test('the dates are read as the rules write them: a day, a day with a time, an ISO date, milliseconds', () => {
  const at = (lastUpdated) => F().matches(rule('x', 'antibot', { lastUpdated }), { chips: { updated: true }, now: NOW });
  assert.equal(at('2026-11-01'), true, 'a day');
  assert.equal(at('2026-11-01 08:00:00'), true, 'a day with a time');
  assert.equal(at('2026-11-01T08:00:00'), true, 'an ISO date');
  assert.equal(at(NOW - 5 * DAY), true, 'milliseconds');
  assert.equal(at('2026-10-01'), false, 'a day outside the window');
  assert.equal(at(NOW - 45 * DAY), false, 'milliseconds outside the window');
});

test('"now" is the real clock unless the caller gives one, as a number or a Date', () => {
  const justNow = rule('x', 'antibot', { lastUpdated: Date.now() - 1000 });
  const longAgo = rule('y', 'antibot', { lastUpdated: Date.now() - 60 * DAY });
  assert.equal(F().matches(justNow, { chips: { updated: true } }), true);
  assert.equal(F().matches(longAgo, { chips: { updated: true } }), false);
  const old = rule('z', 'antibot', { lastUpdated: ago(5) });
  assert.equal(F().matches(old, { chips: { updated: true }, now: new Date(NOW) }), true, 'a Date');
  assert.equal(F().matches(old, { chips: { updated: true }, now: NOW + 40 * DAY }), false, 'the window moves with the clock');
  for (const unreadable of ['nonsense', NaN, {}, null, undefined]) {
    assert.equal(F().matches(justNow, { chips: { updated: true }, now: unreadable }), true, `a "now" nobody can read (${String(unreadable)}) is the real clock: a rule from a second ago is recent`);
    assert.equal(F().matches(longAgo, { chips: { updated: true }, now: unreadable }), false, `${String(unreadable)}: and one from 60 days ago is not`);
  }
});

test('Recently updated narrows with the other chips and the search, and never widens Custom or Edited', () => {
  assert.deepEqual(recent({ categories: ['captcha'] }), ['week-old', 'stamp-ms']);
  assert.deepEqual(recent({ categories: ['antibot', 'fingerprint'] }), ['today', 'edge-in', 'future']);
  assert.deepEqual(recent({ custom: true }, { isOfficial: () => false }), ['today', 'week-old', 'edge-in', 'future', 'stamp-ms'], 'every one is custom here, so only the date narrows');
  assert.deepEqual(recent({ custom: true }, { isOfficial: (entry) => entry.detectorName !== 'week-old' }), ['week-old'], 'Custom AND recently updated');
  assert.deepEqual(recent({}, { query: 'week' }), ['week-old'], 'the search too');
  assert.deepEqual(recent({}, { query: 'stale' }), [], 'the right text, the wrong age');
  assert.deepEqual(ids(F().filter(dated, { chips: { disabled: true, updated: true }, now: NOW })), [], 'nothing here is switched off');
});

test('Recently updated is on its own when the chips are read: isActive, toggle and the redraw all see it', () => {
  const f = F();
  assert.equal(f.isActive({ updated: true }), true);
  assert.equal(f.normalizeChips({ updated: true }).updated, true);
  assert.equal(f.normalizeChips({ updated: 'true' }).updated, false, 'only a real true turns it on');
  assert.equal(f.matches(rule('x', 'antibot', { lastUpdated: ago(1) }), { chips: f.toggle(undefined, 'updated'), now: NOW }), true);
});

test('without a reader for "official" nothing counts as custom (the chip fails closed), and junk never throws', () => {
  assert.deepEqual(ids(F().filter(rules, { chips: { custom: true } })), []);
  for (const junk of [null, undefined, 'text', 7, {}, [], { detector: null }, { detector: 'Plain', category: 5 }, { category: 'antibot', detector: { name: 5 } }]) {
    assert.doesNotThrow(() => F().matches(junk, { query: 'x', chips: { custom: true, edited: true, disabled: true, categories: ['antibot'] }, isOfficial }), String(junk));
  }
  assert.equal(F().matches(null), false);
});

// ---- The tab: Rules keeps the chips, applies them with the search when the list is drawn again ----

function sandbox({ official = [...OFFICIAL], edited = (detector) => !!(detector.userModified && detector.officialSnapshot) } = {}) {
  const elements = {};
  const el = (extra = {}) => ({ hidden: false, style: { display: '', props: {}, setProperty(name, value) { this.props[name] = value; } }, value: '', innerHTML: '', ...extra });
  const icon = () => el({ firstChild: null });
  const chip = (key, category) => ({ dataset: category ? { filter: key, category } : { filter: key }, attrs: {}, icon: category ? icon() : null,
    style: { props: {}, setProperty(name, value) { this.props[name] = value; } }, setAttribute(name, value) { this.attrs[name] = value; },
    querySelector(selector) { return selector === '.category-icon' ? this.icon : null; } });
  const chips = [...Categories.KEYS.map(key => chip(key, key)), chip('custom'), chip('edited'), chip('disabled'), chip('updated')];
  elements['#rulesFilters'] = el({ querySelectorAll: () => chips });
  elements['#rulesNoResults'] = el({ hidden: true });
  elements['#rulesSearch'] = el();
  elements['#rulesList'] = el({ querySelectorAll: () => [] });
  elements['#detectorsEmpty'] = el();
  const context = vm.createContext({ console, self: {}, Logger: { debug() {}, error() {}, ui() {} }, Rules: function Rules() {},
    Utils: { getSettings: async () => ({ detection: {} }) }, document: { querySelector: (selector) => elements[selector] || null },
    FormatUtils: require('../utils/format-utils.js') });
  context.DetectorManager = { isUserEdited: edited };
  for (const file of ['modules/core/categories.js', 'modules/core/rules-sort.js', 'modules/core/rules-filter.js']) vm.runInContext(read(file), context, { filename: file });
  vm.runInContext(read('utils/detection-utils.js') + '\nthis.DetectionUtils = DetectionUtils;', context);
  context.DetectionUtils._officialDetectorIds = new Set(official);
  vm.runInContext(read('sections/rules/rules-handlers.js'), context, { filename: 'rules-handlers.js' });
  vm.runInContext(read('sections/rules/rules-display.js'), context, { filename: 'rules-display.js' });
  const shown = [];
  const view = Object.create(context.Rules.prototype);
  // every rule is old by default, so only the ones a test dates inside the last 30 days are recently updated
  const detector = (id, extra = {}) => ({ id, name: id, displayName: id, description: `Finds ${id}`, enabled: true, lastUpdated: '2020-01-01', author: OFFICIAL.has(id) ? 'Scrapfly' : 'Me', detection: {}, ...extra });
  const library = {
    antibot: { 'detect-cloudflare': detector('detect-cloudflare'), 'detect-datadome': detector('detect-datadome', { userModified: true, officialSnapshot: shipped }) },
    captcha: { 'detect-recaptcha': detector('detect-recaptcha', { enabled: false }), 'custom-1': detector('custom-1') },
    fingerprint: { 'custom-2': detector('custom-2', { enabled: false }) }
  };
  Object.assign(view, {
    initialized: true, activeChips: context.RulesFilter.normalizeChips(), allDetectors: [], filteredDetectors: [],
    paginationManager: { setItems(items) { shown.push(Array.from(items, entry => entry.detectorName)); } },
    categoryManager: { getCategoryInfo: (key) => ({ antibot: { colour: '#aa0000' }, captcha: { colour: '#00aa00' }, fingerprint: { colour: '#0000aa' } }[key]) },
    getDetectorDisplayName: (name) => name, getSortTimestamp: (value) => Date.parse(value) || 0,
    detectorManager: { getAllDetectors: () => library }
  });
  return { context, view, elements, chips, shown, library };
}

test('turning chips on and off redraws the list with what they leave, and the search stays applied', async () => {
  const { view, elements, shown } = sandbox();
  await view.displayRules();
  // the list order: enabled rules first, then the category order; the switched-off ones last
  assert.deepEqual(shown.at(-1), ['detect-cloudflare', 'detect-datadome', 'custom-1', 'detect-recaptcha', 'custom-2'], 'every rule to start with');
  view.toggleFilterChip('custom');
  assert.deepEqual(shown.at(-1), ['custom-1', 'custom-2']);
  view.toggleFilterChip('edited');
  assert.deepEqual(shown.at(-1), ['detect-datadome', 'custom-1', 'custom-2'], 'Custom or Edited');
  view.toggleFilterChip('disabled');
  assert.deepEqual(shown.at(-1), ['custom-2'], 'narrowed by Disabled');
  view.toggleFilterChip('edited');
  assert.deepEqual(shown.at(-1), ['custom-2']);
  view.toggleFilterChip('disabled');
  assert.deepEqual(shown.at(-1), ['custom-1', 'custom-2']);
  elements['#rulesSearch'].value = 'custom-1';
  view.handleSearch('custom-1');
  assert.deepEqual(shown.at(-1), ['custom-1'], 'Custom AND the search');
  view.toggleFilterChip('custom');
  assert.deepEqual(shown.at(-1), ['custom-1'], 'a chip turned off with a search typed keeps the search (it is read from the box)');
  const before = shown.length;
  view.toggleFilterChip('not-a-chip');
  view.toggleFilterChip('');
  assert.equal(shown.length, before, 'an unknown chip redraws nothing');
});

test('the chips are applied again when the list is drawn again (a rule deleted, restored, updated, edited)', async () => {
  const { view, library, shown } = sandbox();
  await view.displayRules();
  view.toggleFilterChip('edited');
  assert.deepEqual(shown.at(-1), ['detect-datadome']);
  library.antibot['detect-cloudflare'].userModified = true;
  library.antibot['detect-cloudflare'].officialSnapshot = shipped;
  await view.displayRules();
  assert.deepEqual(shown.at(-1), ['detect-cloudflare', 'detect-datadome'], 'the redraw read the new rule and kept the chip on');
  delete library.antibot['detect-datadome'];
  await view.displayRules();
  assert.deepEqual(shown.at(-1), ['detect-cloudflare']);
  assert.deepEqual(JSON.parse(JSON.stringify(view.activeChips)), { custom: false, edited: true, disabled: false, updated: false, categories: [] }, 'the chip state survives the redraws');
});

test('the card and the chip agree on what is Custom and what is Edited: the popup\'s own readers decide both', async () => {
  const translatedOnly = (detector) => detector.userModified === true && detector.officialSnapshot === shipped && detector.realEdit === true;
  const { view, library, shown } = sandbox({ edited: translatedOnly });
  library.antibot['detect-datadome'].realEdit = false; // marked and snapshotted, but only translated
  library.antibot['detect-cloudflare'].userModified = true;
  library.antibot['detect-cloudflare'].officialSnapshot = shipped;
  library.antibot['detect-cloudflare'].realEdit = true;
  await view.displayRules();
  view.toggleFilterChip('edited');
  assert.deepEqual(shown.at(-1), ['detect-cloudflare'], 'DetectorManager.isUserEdited decides, as for the card\'s Edited tag');
  view.toggleFilterChip('edited');
  view.toggleFilterChip('custom');
  assert.deepEqual(shown.at(-1), ['custom-1', 'custom-2'], 'DetectionUtils.isOfficialDetector (id and author) decides, as for the card\'s tip');
  // an author typed into a custom rule does not make it official
  library.captcha['custom-1'].author = 'Scrapfly';
  await view.displayRules();
  assert.deepEqual(shown.at(-1), ['custom-1', 'custom-2']);
});

test('the cards show the Edited tag and the "Custom detector" tip for exactly the rules the Edited and Custom chips keep', async () => {
  const { view, library, shown } = sandbox();
  Object.assign(view, { getDetectorIcon: () => '', getDetectionMethods: () => '', formatLastUpdated: () => '2026-01-01', getCategoryLabel: (category) => category, setupDetectorCardListeners() {} });
  library.antibot['detect-akamai'] = { id: 'detect-akamai', name: 'detect-akamai', displayName: 'detect-akamai', enabled: true, author: 'Scrapfly', userModified: true, detection: {} };
  await view.displayRules();
  // one page for the cards, with the same readers the popup has
  const list = { innerHTML: '', querySelectorAll: () => [] };
  const context = vm.createContext({ Rules: function Rules() {}, FormatUtils: require('../utils/format-utils.js'), document: { querySelector: () => list } });
  vm.runInContext(read('modules/core/categories.js'), context);
  vm.runInContext(read('sections/rules/rules-display.js'), context);
  vm.runInContext(read('utils/detection-utils.js') + '\nthis.DetectionUtils = DetectionUtils;', context);
  context.DetectionUtils._officialDetectorIds = new Set(OFFICIAL);
  context.DetectorManager = { isUserEdited: (detector) => !!(detector.userModified && detector.officialSnapshot) };
  const shower = Object.assign(Object.create(context.Rules.prototype), { categoryManager: view.categoryManager, getDetectorIcon: view.getDetectorIcon, getDetectionMethods: view.getDetectionMethods,
    formatLastUpdated: view.formatLastUpdated, getCategoryLabel: view.getCategoryLabel, setupDetectorCardListeners() {} });
  const card = (entry) => { shower.renderDetectorsPage([entry]); return list.innerHTML; };
  const withTag = view.allDetectors.filter(entry => card(entry).includes('rule-edited-tag')).map(entry => entry.detectorName);
  const withCustomTip = view.allDetectors.filter(entry => card(entry).includes('Custom detector')).map(entry => entry.detectorName);
  assert.ok(withTag.length >= 1 && withCustomTip.length >= 1 && withTag.length < view.allDetectors.length);
  view.toggleFilterChip('edited');
  assert.deepEqual([...shown.at(-1)].sort(), [...withTag].sort(), 'Edited: the cards that carry the tag');
  assert.ok(!shown.at(-1).includes('detect-akamai'), 'a mark with nothing to go back to is no edit, on the card or in the chip');
  view.toggleFilterChip('edited');
  view.toggleFilterChip('custom');
  assert.deepEqual([...shown.at(-1)].sort(), [...withCustomTip].sort(), 'Custom: the cards whose tip says so');
});

test('each chip shows whether it is on and the category chips carry their icon in the colour chosen in Settings', async () => {
  const { view, chips } = sandbox();
  await view.displayRules();
  view.toggleFilterChip('captcha');
  view.toggleFilterChip('disabled');
  assert.deepEqual(chips.map(chip => `${chip.dataset.filter}:${chip.attrs['aria-pressed']}`),
    ['antibot:false', 'captcha:true', 'fingerprint:false', 'custom:false', 'edited:false', 'disabled:true', 'updated:false']);
  assert.deepEqual(chips.slice(0, 3).map(chip => chip.style.props['--chip-color']), ['#aa0000', '#00aa00', '#0000aa'], 'the Settings → Category colours');
  assert.ok(chips.slice(0, 3).every(chip => /^<svg /.test(chip.icon.innerHTML)), 'the category icon');
  assert.ok(chips.slice(3).every(chip => chip.style.props['--chip-color'] === undefined), 'the other chips keep the stylesheet\'s colour');
  view.categoryManager = null;
  view.toggleFilterChip('captcha');
  assert.deepEqual(chips.slice(0, 3).map(chip => chip.style.props['--chip-color']), ['#FF5733', '#33C3FF', '#3b82f6'], 'without the manager: the default colours');
});

test('the row hides with no rules; a message with Clear filters shows when the chips and the search leave nothing; Clear filters turns every chip off and empties the search', async () => {
  const { view, elements, shown, library } = sandbox();
  await view.displayRules();
  assert.equal(elements['#rulesFilters'].hidden, false);
  assert.equal(elements['#rulesNoResults'].hidden, true, 'there are rules to show');
  view.toggleFilterChip('edited');
  view.toggleFilterChip('captcha');
  assert.deepEqual(shown.at(-1), [], 'no edited captcha rule');
  assert.equal(elements['#rulesNoResults'].hidden, false, 'the way back is on screen');
  elements['#rulesSearch'].value = 'cloud';
  view.clearFilters();
  assert.deepEqual(JSON.parse(JSON.stringify(view.activeChips)), { custom: false, edited: false, disabled: false, updated: false, categories: [] });
  assert.equal(elements['#rulesSearch'].value, '', 'the search box is emptied too');
  assert.equal(shown.at(-1).length, 5, 'every rule again');
  assert.equal(elements['#rulesNoResults'].hidden, true);
  // a search with no match, without any chip, gets the same message
  elements['#rulesSearch'].value = 'nothing matches';
  view.handleSearch('nothing matches');
  assert.equal(elements['#rulesNoResults'].hidden, false);
  // no rules at all: nothing to filter, and nothing to say about it
  for (const category of Object.keys(library)) delete library[category];
  elements['#rulesSearch'].value = '';
  await view.displayRules();
  assert.equal(elements['#rulesFilters'].hidden, true);
  assert.equal(elements['#rulesNoResults'].hidden, true);
});

test('the Recently updated chip redraws the list with the rules updated in the last 30 days, narrows with the other chips, and clears with them', async () => {
  const { view, library, shown, chips, elements } = sandbox();
  const before = (days) => stampOf(Date.now() - days * DAY); // the real clock: the tab asks it
  library.antibot['detect-datadome'].lastUpdated = before(3);   // edited by the person, updated 3 days ago
  library.captcha['custom-1'].lastUpdated = before(10);         // the person's own, 10 days ago
  library.fingerprint['custom-2'].lastUpdated = before(2);      // switched off, 2 days ago
  // detect-cloudflare and detect-recaptcha keep the old date every rule of the sandbox starts with
  await view.displayRules();
  assert.equal(shown.at(-1).length, 5, 'every rule to start with');
  const chip = chips.find(entry => entry.dataset.filter === 'updated');
  view.toggleFilterChip('updated');
  assert.deepEqual(shown.at(-1), ['detect-datadome', 'custom-1', 'custom-2'], 'the list order, only the rules updated in the last 30 days');
  assert.equal(chip.attrs['aria-pressed'], 'true', 'the chip shows it is on');
  view.toggleFilterChip('disabled');
  assert.deepEqual(shown.at(-1), ['custom-2'], 'narrowed by Disabled');
  view.toggleFilterChip('disabled');
  elements['#rulesSearch'].value = 'custom-1';
  view.handleSearch('custom-1');
  assert.deepEqual(shown.at(-1), ['custom-1'], 'and by the search');
  view.clearFilters();
  assert.equal(shown.at(-1).length, 5, 'every rule again');
  assert.equal(chip.attrs['aria-pressed'], 'false');
  assert.equal(JSON.parse(JSON.stringify(view.activeChips)).updated, false);
});

test('a rule edited now is recently updated: the editor stamps its date and the chip reads that stamp', async () => {
  const { view, library, shown } = sandbox();
  await view.displayRules();
  view.toggleFilterChip('updated');
  assert.deepEqual(shown.at(-1), [], 'every rule is from 2020: none is recent');
  // the stamp saveRule writes when a rule is saved
  library.captcha['custom-1'].lastUpdated = stampOf(Date.now());
  await view.displayRules();
  assert.deepEqual(shown.at(-1), ['custom-1']);
});

// ---- The markup, its registration and its words ----

const html = read('sections/rules/rules.html');
const row = html.slice(html.indexOf('id="rulesFilters"'), html.indexOf('id="rulesList"'));

test('the row sits in the header under the search, is a labelled group, and has the categories, then Custom, Edited, Disabled and Recently updated', () => {
  assert.ok(html.indexOf('id="rulesFilters"') > html.indexOf('id="rulesSearch"'), 'under the search');
  const header = html.slice(html.indexOf('class="rules-header"'), html.indexOf('id="rulesList"'));
  assert.ok(header.includes('id="rulesFilters"'), 'in the header, above the list');
  const open = html.match(/<div id="rulesFilters"[^>]*>/)[0];
  assert.match(open, /role="group"/);
  assert.match(open, /aria-label="Filter rules"/);
  assert.match(open, /data-i18n-aria-label="rulesFiltersLabel"/);
  const chips = [...row.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match => ({
    attrs: match[1], filter: (match[1].match(/data-filter="([a-z]+)"/) || [])[1], category: (match[1].match(/data-category="([a-z]+)"/) || [])[1],
    label: (match[2].match(/data-i18n="([A-Za-z]+)"/) || [])[1], body: match[2]
  })).filter(chip => chip.filter);
  assert.deepEqual(chips.map(chip => chip.filter), [...Categories.KEYS, 'custom', 'edited', 'disabled', 'updated']);
  for (const chip of chips) {
    assert.match(chip.attrs, /type="button"/);
    assert.match(chip.attrs, /aria-pressed="false"/, 'off to start with');
    assert.match(chip.attrs, /class="history-filter-chip"/, 'the chip look History already has');
    assert.match(chip.body, /class="history-filter-icon/, `${chip.filter} has an icon`);
  }
  for (const key of Categories.KEYS) {
    const chip = chips.find(entry => entry.filter === key);
    assert.equal(chip.category, key);
    assert.equal(chip.label, Categories.LABELS[key][0], 'named as the rest of the extension names the category');
    assert.match(chip.body, /class="history-filter-icon category-icon"/);
  }
  // the words of the cards and of Statistics, not new ones
  assert.equal(chips.find(chip => chip.filter === 'custom').label, 'statsRulesCustom');
  assert.equal(chips.find(chip => chip.filter === 'edited').label, 'ruleEditedTag', 'the word on the card\'s tag');
  assert.equal(chips.find(chip => chip.filter === 'disabled').label, 'statsRulesDisabled');
  const en = JSON.parse(read('_locales/en/messages.json'));
  assert.deepEqual(['statsRulesCustom', 'ruleEditedTag', 'statsRulesDisabled'].map(key => en[key].message), ['Custom', 'Edited', 'Disabled']);
  // Recently updated is new: its own word, with the 30 days said where the pointer rests (and to a screen reader, as its description)
  const updated = chips.find(chip => chip.filter === 'updated');
  assert.equal(updated.label, 'rulesRecentlyUpdated');
  assert.match(updated.attrs, /title="Updated in the last 30 days"/);
  assert.match(updated.attrs, /data-i18n-title="rulesRecentlyUpdatedTip"/);
  assert.equal(en.rulesRecentlyUpdated.message, 'Recently updated');
  assert.equal(en.rulesRecentlyUpdatedTip.message, 'Updated in the last 30 days');
  assert.match(updated.body, /class="history-filter-icon" aria-hidden="true"\s*>\s*<svg\b/, 'its icon is decoration, as the others: the chip names it');
});

test('the no-results block uses History\'s words and button, and sits between the list and the pagination', () => {
  const block = html.match(/<div id="rulesNoResults"[^>]*>[\s\S]*?<\/div>/)[0];
  assert.match(block, /\bhidden\b/);
  assert.match(block, /data-i18n="historyNoResults"/);
  assert.match(block, /id="rulesClearFilters"[^>]*data-i18n="historyClearFilters"/);
  assert.ok(html.indexOf('id="rulesList"') < html.indexOf('id="rulesNoResults"') && html.indexOf('id="rulesNoResults"') < html.indexOf('id="rulesPagination"'));
});

test('the tab wires the chips and Clear filters, and the popup loads the module before the Rules scripts', () => {
  const source = read('sections/rules/rules.js');
  assert.match(source, /#rulesFilters/);
  assert.match(source, /#rulesClearFilters/);
  assert.match(source, /activeChips = RulesFilter\.normalizeChips\(\)/, 'kept while the popup is open');
  const popup = [...read('popup.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const module = 'modules/core/rules-filter.js';
  assert.ok(popup.includes(module), 'registered in the popup');
  assert.ok(popup.indexOf('modules/core/categories.js') < popup.indexOf(module), 'after the categories it reads');
  for (const user of ['sections/rules/rules.js', 'sections/rules/rules-handlers.js', 'sections/rules/rules-display.js']) assert.ok(popup.indexOf(module) < popup.indexOf(user), `before ${user}`);
  assert.ok(!read('background.js').includes('rules-filter'));
  const manifest = JSON.parse(read('manifest.json'));
  assert.ok(!manifest.content_scripts.some(entry => entry.js.includes(module)));
});

test('every language has the row\'s label, translated', () => {
  const en = JSON.parse(read('_locales/en/messages.json'));
  assert.equal(en.rulesFiltersLabel.message, 'Filter rules');
  assert.ok(en.rulesFiltersLabel.description, 'English says where it is used');
  for (const locale of fs.readdirSync(path.join(root, '_locales')).filter(name => name !== 'en')) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    assert.ok(messages.rulesFiltersLabel && messages.rulesFiltersLabel.message.trim(), locale);
    assert.notEqual(messages.rulesFiltersLabel.message, en.rulesFiltersLabel.message, `${locale} is translated`);
  }
});
