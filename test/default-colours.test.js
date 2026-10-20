const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The default palette (toolbar badge, category and tag colours) is the shared one everywhere. It used to be written
// in seven places that disagreed: the toolbar showed #4CAF50-style greens until the first Save in Settings, which
// showed (and then saved) #22c55e, and a tag colour chosen in Settings reached the detection cards but not the chips
// in the details, History and Rules.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));

const sandbox = (extra = {}) => {
  const context = vm.createContext({ window: {}, console, ...extra });
  vm.runInContext(read('modules/core/categories.js'), context);
  vm.runInContext(read('utils/format-utils.js') + '\nthis.FormatUtils = FormatUtils;', context);
  vm.runInContext(read('modules/core/badge-constants.js') + '\nthis.BADGE = BADGE;', context);
  vm.runInContext(read('modules/detection/managers/category-manager.js'), context);
  return context;
};
const plain = (value) => JSON.parse(JSON.stringify(value));

test('the default settings are the shared palette', () => {
  const { FormatUtils, BADGE, Categories } = sandbox();
  const defaults = json('sections/settings/default-settings.json').settings;
  assert.deepStrictEqual(plain(defaults.badgeColors), { low: BADGE.COLORS.LOW, medium: BADGE.COLORS.MEDIUM, high: BADGE.COLORS.HIGH });
  assert.deepStrictEqual(plain(defaults.categoryColors), plain(Categories.DEFAULT_COLORS));
  assert.deepStrictEqual(plain(defaults.tagColors), plain(FormatUtils.DEFAULT_TAG_COLORS));
});

test('the packaged detector index starts from the same tag colours and keeps no badge colours of its own', () => {
  const { FormatUtils } = sandbox();
  const index = json('detectors/index.json');
  assert.strictEqual(index.badge, undefined, 'the toolbar colours are Settings\' own');
  for (const [method, key] of Object.entries(FormatUtils.METHOD_TAG_COLOR_KEYS)) {
    assert.strictEqual(index.tags[method].colour.toLowerCase(), FormatUtils.DEFAULT_TAG_COLORS[key].toLowerCase(), method);
  }
  assert.deepStrictEqual(Object.keys(index.tags).sort(), Object.keys(FormatUtils.METHOD_TAG_COLOR_KEYS).sort());
});

test('the colour inputs of the Settings page start from the shared palette, and the code names no colour itself', () => {
  const { FormatUtils, BADGE, Categories } = sandbox();
  const html = read('sections/settings/settings.html');
  const staticValue = (id) => (html.match(new RegExp(`id="${id}"[^>]*value="(#[0-9a-fA-F]{6})"`)) || [])[1];
  const hexShown = (id) => (html.match(new RegExp(`id="${id}">(#[0-9a-fA-F]{6})<`)) || [])[1];
  const ui = vm.createContext({ window: {}, BADGE, FormatUtils, Categories, document: {}, self: {} });
  vm.runInContext(read('sections/settings/settings-ui.js'), ui);
  const groups = ui.self.SettingsUI ? ui.self.SettingsUI.colorGroups() : vm.runInContext('SettingsUI.colorGroups()', ui);
  assert.deepStrictEqual(plain(groups.map(group => group.group)), ['badgeColors', 'categoryColors', 'tagColors']);
  let inputs = 0;
  for (const { inputs: selectors, defaults } of groups) {
    for (const [key, selector] of Object.entries(selectors)) {
      const id = selector.slice(1);
      inputs++;
      assert.strictEqual((staticValue(id) || '').toLowerCase(), String(defaults[key]).toLowerCase(), `${id} starts from the default`);
    }
  }
  assert.strictEqual(inputs, 14);
  for (const id of ['hexBadgeLow', 'hexBadgeMedium', 'hexBadgeHigh']) assert.ok(hexShown(id), id);
  assert.strictEqual(hexShown('hexBadgeLow').toLowerCase(), BADGE.COLORS.LOW);
  assert.strictEqual(hexShown('hexBadgeMedium').toLowerCase(), BADGE.COLORS.MEDIUM);
  assert.strictEqual(hexShown('hexBadgeHigh').toLowerCase(), BADGE.COLORS.HIGH);
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(read('sections/settings/settings-ui.js')), 'settings-ui.js reads its default colours from the shared constants');
});

const settingsStore = (settings, extra = {}) => {
  const written = [];
  const listeners = [];
  const context = sandbox({
    Logger: { error() {}, warn() {}, debug() {} },
    Utils: { getSettings: async () => settings },
    StorageManager: {
      saveToStorage: async (key, data) => { written.push([key, JSON.parse(JSON.stringify(data))]); return true; },
      parseStoredValue: raw => (typeof raw === 'string' ? JSON.parse(raw) : raw)
    },
    chrome: { storage: { local: { get: async () => extra.stored || {} }, onChanged: { addListener: listener => listeners.push(listener) } } }
  });
  return { context, written, listeners };
};

test('the toolbar badge uses the colours Settings shows: the saved ones, else the shared defaults (never the index)', async () => {
  const defaults = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };
  // Nothing saved yet, and a categories copy in storage that still carries the old shades
  let { context } = settingsStore({}, { stored: { scrapfly_categories: { categories: { badge: { low: { colour: '#4CAF50' }, medium: { colour: '#FFA500' }, high: { colour: '#FF4444' } } } } } });
  assert.deepStrictEqual(plain(await context.window.CategoryManager.getBadgeColors()), defaults);
  assert.deepStrictEqual(plain(await context.window.CategoryManager.getBadgeColors({ initialized: true })), defaults, 'a manager instance changes nothing');
  // Saved in Settings: those win, a missing or invalid one falls back to its default
  ({ context } = settingsStore({}, { stored: { scrapfly_settings: { settings: { badgeColors: { low: '#112233', medium: 'red' } } } } }));
  assert.deepStrictEqual(plain(await context.window.CategoryManager.getBadgeColors()), { low: '#112233', medium: '#f59e0b', high: '#ef4444' });
  // The same object written as a JSON string, as older versions stored it
  ({ context } = settingsStore({}, { stored: { scrapfly_settings: JSON.stringify({ badgeColors: { low: '#010203', medium: '#040506', high: '#070809' } }) } }));
  assert.deepStrictEqual(plain(await context.window.CategoryManager.getBadgeColors()), { low: '#010203', medium: '#040506', high: '#070809' });
});

test('a tag colour chosen in Settings reaches every chip: the category manager takes it like it takes the category colours', async () => {
  const settings = {
    categoryColors: { antibot: '#111111', captcha: '#222222', fingerprint: '#333333' },
    tagColors: { dom: '#010101', headers: '#020202', cookies: '#030303', content: '#040404', urls: '#050505', js_hooks: '#060606', window: '#070707', payload: 'not a colour' }
  };
  const { context, written } = settingsStore(settings);
  const manager = new context.window.CategoryManager();
  manager.categories = plain(context.window.CategoryManager.getPackagedFallbackIndex());
  assert.strictEqual(manager.getTagColor('dom'), '#8D33FF', 'before the sync: the default, the same one Settings shows');
  assert.strictEqual(await manager.syncColorsFromSettings(), true);
  assert.strictEqual(manager.getCategoryInfo('captcha').colour, '#222222');
  const expected = { dom: '#010101', header: '#020202', cookie: '#030303', content: '#040404', url: '#050505', js_hooks: '#060606', window: '#070707' };
  for (const [method, colour] of Object.entries(expected)) assert.strictEqual(manager.getTagColor(method), colour, method);
  assert.strictEqual(manager.getTagColor('payload'), '#9C27B0', 'an invalid colour is ignored');
  assert.strictEqual(manager.getTagColor('DOM'), '#010101', 'the method name is not case sensitive');
  assert.strictEqual(written.length, 1);
  assert.strictEqual(written[0][0], 'scrapfly_categories');
  assert.strictEqual(written[0][1].categories.tags.window.colour, '#070707');
});

test('the colours of Settings are read at every place a chip is drawn: the views never keep a colour of their own', () => {
  for (const file of ['sections/detection/detection-ui.js', 'sections/history/history.js', 'sections/rules/rules-formatters.js']) {
    const source = read(file);
    assert.ok(/categoryManager\??\.getTagColor\(/.test(source) || /FormatUtils\.methodColor\(/.test(source), `${file} reads the tag colours`);
    assert.ok(!/(?:dom|header|cookie|url|payload):\s*'#[0-9a-fA-F]{6}'/.test(source), `${file} names no tag colour`);
  }
});

test('an open popup picks up colours saved by the worker without being reopened', () => {
  const { context, listeners } = settingsStore({});
  const manager = new context.window.CategoryManager();
  manager.categories = plain(context.window.CategoryManager.getPackagedFallbackIndex());
  assert.strictEqual(listeners.length, 1, 'each manager watches storage once');
  const saved = (dom) => ({ scrapfly_categories: { newValue: { categories: { tags: { dom: { colour: dom } }, antibot: { colour: '#0a0b0c' } } } } });
  // Not ready yet, another area and another key: nothing changes
  listeners[0](saved('#aaaaaa'), 'local');
  assert.strictEqual(manager.getTagColor('dom'), '#8D33FF', 'a manager that has not loaded yet ignores it');
  manager.initialized = true;
  listeners[0](saved('#aaaaaa'), 'sync');
  listeners[0]({ scrapfly_settings: { newValue: {} } }, 'local');
  assert.strictEqual(manager.getTagColor('dom'), '#8D33FF');
  // The worker's sync (an object, or the JSON string older versions stored)
  listeners[0](saved('#123456'), 'local');
  assert.strictEqual(manager.getTagColor('dom'), '#123456');
  assert.strictEqual(manager.getCategoryInfo('antibot').colour, '#0a0b0c');
  listeners[0]({ scrapfly_categories: { newValue: JSON.stringify({ categories: { tags: { dom: { colour: '#654321' } } } }) } }, 'local');
  assert.strictEqual(manager.getTagColor('dom'), '#654321');
  listeners[0]({ scrapfly_categories: { newValue: null } }, 'local');
  assert.strictEqual(manager.getTagColor('dom'), '#654321', 'a removed key leaves the colours as they are');
});
