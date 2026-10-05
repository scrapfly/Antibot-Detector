const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Rules tab localisation: relative times come from Intl.RelativeTimeFormat in
// the UI language, and the default name of a new detector is shown (and
// stored) in the UI language, never as the English "New Detector".
// Loads the real browser files into a vm context with small stubs.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const SPANISH = {
  rulesUiNewDetectorName: 'Nuevo detector',
  rulesUiAddDetectorTitleFmt: 'Añadir {0}',
  rulesUiEditDetectorTitleFmt: 'Editar {0}'
};

function load({ locale, messages = {}, intl } = {}) {
  const i18n = {
    get: (key) => (key in messages ? messages[key] : null),
    format: (key, ...args) => {
      if (!(key in messages)) return null;
      return args.reduce((msg, arg, i) => msg.split('{' + i + '}').join(String(arg)), messages[key]);
    }
  };
  if (locale !== undefined) i18n.locale = () => locale;

  const elements = {
    '#editRuleModal': { style: {}, querySelector: () => null },
    '#editRuleModalAction': { textContent: '' }
  };
  const context = {
    Rules: function Rules() {},
    I18n: i18n,
    FormatUtils: {
      escapeHtml: (s) => String(s || ''),
      escapeAttr: (s) => String(s || '').replace(/"/g, '&quot;')
    },
    chrome: { runtime: { getURL: (p) => 'chrome-extension://x/' + p } },
    document: {
      querySelector: (selector) => elements[selector] || null,
      body: { style: {} }
    }
  };
  if (intl !== undefined) context.Intl = intl;
  vm.createContext(context);
  vm.runInContext(read('sections/rules/rules-formatters.js'), context);
  vm.runInContext(read('sections/rules/rules-editor-modal.js'), context);

  const rules = new context.Rules();
  // The editor body needs a real DOM; the title is what these tests check.
  rules.populateModalData = () => {};
  rules._collectDetectionFromForm = () => ({});
  return { rules, context, elements };
}

const NOW = new Date('2026-09-30T12:00:00Z');
const ago = (ms) => new Date(NOW.getTime() - ms);
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test('relative times use Intl.RelativeTimeFormat in the UI language (English)', () => {
  const { rules } = load({ locale: 'en' });
  assert.strictEqual(rules.getRelativeTime(ago(0), NOW), 'now');
  assert.strictEqual(rules.getRelativeTime(ago(30 * 1000), NOW), '30 seconds ago');
  assert.strictEqual(rules.getRelativeTime(ago(5 * MIN), NOW), '5 minutes ago');
  assert.strictEqual(rules.getRelativeTime(ago(3 * HOUR), NOW), '3 hours ago');
  assert.strictEqual(rules.getRelativeTime(ago(DAY), NOW), 'yesterday');
  assert.strictEqual(rules.getRelativeTime(ago(7 * DAY), NOW), 'last week');
  assert.strictEqual(rules.getRelativeTime(ago(14 * DAY), NOW), '2 weeks ago');
  assert.strictEqual(rules.getRelativeTime(ago(29 * DAY), NOW), 'last month', '28-29 days is one month, not "0 months"');
  assert.strictEqual(rules.getRelativeTime(ago(90 * DAY), NOW), '3 months ago');
  assert.strictEqual(rules.getRelativeTime(ago(362 * DAY), NOW), 'last year', '360-364 days is one year, not "0 years"');
  assert.strictEqual(rules.getRelativeTime(ago(800 * DAY), NOW), '2 years ago');
});

test('relative times follow the UI language, not English', () => {
  const { rules } = load({ locale: 'es' });
  assert.strictEqual(rules.getRelativeTime(ago(0), NOW), 'ahora');
  assert.strictEqual(rules.getRelativeTime(ago(5 * MIN), NOW), 'hace 5 minutos');
  assert.strictEqual(rules.getRelativeTime(ago(DAY), NOW), 'ayer');

  const { rules: ja } = load({ locale: 'ja' });
  assert.notStrictEqual(ja.getRelativeTime(ago(DAY), NOW), 'yesterday');
});

test('a future timestamp (clock skew) reads as now', () => {
  const { rules } = load({ locale: 'en' });
  assert.strictEqual(rules.getRelativeTime(new Date(NOW.getTime() + 5 * MIN), NOW), 'now');
});

test('relative times survive a missing I18n.locale() and an unsupported tag', () => {
  const { rules: noLocale } = load();
  assert.ok(noLocale.getRelativeTime(ago(5 * MIN), NOW).length > 0);

  const { rules: badTag } = load({ locale: 'not a tag!' });
  assert.ok(badTag.getRelativeTime(ago(5 * MIN), NOW).length > 0);
});

test('without Intl.RelativeTimeFormat the relative time falls back to English', () => {
  const { rules } = load({ locale: 'es', intl: {} });
  assert.strictEqual(rules.getRelativeTime(ago(10 * 1000), NOW), 'just now');
  assert.strictEqual(rules.getRelativeTime(ago(MIN), NOW), '1 minute ago');
  assert.strictEqual(rules.getRelativeTime(ago(3 * DAY), NOW), '3 days ago');
  assert.strictEqual(rules.getRelativeTime(ago(14 * DAY), NOW), '2 weeks ago');
});

test('the compact date uses the UI language, with the manual format as fallback', () => {
  const date = new Date(2026, 8, 30, 14, 5);
  const { rules: es } = load({ locale: 'es' });
  const { rules: en } = load({ locale: 'en' });
  assert.notStrictEqual(es.formatCompactDate(date), en.formatCompactDate(date));
  assert.match(es.formatCompactDate(date), /14:05/);

  const { rules: noIntl } = load({ locale: 'es', intl: {} });
  assert.strictEqual(noIntl.formatCompactDate(date), '30 sep 2026, 14:05');
});

test('the legacy English default name displays in the UI language', () => {
  const { rules } = load({ messages: SPANISH });
  assert.strictEqual(rules.getDefaultDetectorName(), 'Nuevo detector');
  assert.strictEqual(rules.getDetectorDisplayName('New Detector'), 'Nuevo detector');
  assert.strictEqual(rules.getDetectorDisplayName('Akamai'), 'Akamai');
  assert.strictEqual(rules.getDetectorDisplayName('New Detector v2'), 'New Detector v2');
  assert.strictEqual(rules.getDetectorDisplayName(''), '');
  assert.strictEqual(rules.getDetectorDisplayName(undefined), '');

  const { rules: english } = load();
  assert.strictEqual(english.getDetectorDisplayName('New Detector'), 'New detector');
});

test('saving never stores the English default name', () => {
  const { rules } = load({ messages: SPANISH });
  // New detector, field left as shown or emptied: the localised default
  assert.strictEqual(rules.resolveDetectorNameForSave('Nuevo detector', ''), 'Nuevo detector');
  assert.strictEqual(rules.resolveDetectorNameForSave('   ', ''), 'Nuevo detector');
  assert.strictEqual(rules.resolveDetectorNameForSave('', undefined), 'Nuevo detector');
  // A renamed detector keeps what the user typed
  assert.strictEqual(rules.resolveDetectorNameForSave('My detector', ''), 'My detector');
  assert.strictEqual(rules.resolveDetectorNameForSave('Mine', 'New Detector'), 'Mine');
  // A legacy "New Detector" saved without renaming keeps its stored name
  assert.strictEqual(rules.resolveDetectorNameForSave('Nuevo detector', 'New Detector'), 'New Detector');
});

test('the editor title is one format key with the localised default name', () => {
  const { rules, elements } = load({ messages: SPANISH });

  rules.openEditModal({ name: '', displayName: '' }, 'antibot', 'custom-1', true);
  assert.strictEqual(elements['#editRuleModalAction'].textContent, 'Añadir Nuevo detector');

  rules.openEditModal({ name: 'New Detector', displayName: 'Nuevo detector' }, 'antibot', 'new-detector', false);
  assert.strictEqual(elements['#editRuleModalAction'].textContent, 'Editar Nuevo detector');

  rules.openEditModal({ name: 'Akamai', displayName: 'Akamai' }, 'antibot', 'akamai', false);
  assert.strictEqual(elements['#editRuleModalAction'].textContent, 'Editar Akamai');

  const { rules: english, elements: englishElements } = load();
  english.openEditModal({ name: '' }, 'antibot', 'custom-1', true);
  assert.strictEqual(englishElements['#editRuleModalAction'].textContent, 'Add New detector');
});
