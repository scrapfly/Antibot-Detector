const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Counts that read wrongly: "1 entries", Russian "2 дней", Arabic with one plural form for every number. A count with a noun
// after it needs the plural forms of the language; a count after a label ("Entries: 2") needs none, so that is how the
// languages that inflect by number word the counts that have no singular twin.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const messages = (locale) => JSON.parse(read(`_locales/${locale}/messages.json`));
const CaptureRetention = require('../modules/core/capture-retention.js');

// Languages whose nouns change with the number (the others, Chinese, Japanese, Korean, Thai, Vietnamese, Indonesian and
// Turkish, keep the noun as it is after any number)
const INFLECTING = ['ar', 'cs', 'de', 'en', 'es', 'fr', 'hi', 'it', 'nl', 'pl', 'pt_BR', 'ru', 'sv', 'uk'];
// A count after a label ("Entries: 2") or alone in brackets after a whole phrase ("Only the entries shown (2)"): no noun takes the number
const labelled = (message, index) => new RegExp(`[:：]\\s*\\{${index}\\}|[(（]\\s*\\{${index}\\}\\s*[)）]`).test(message);

// Used for any count, one included (no singular twin): the key and the number of its count placeholder
const ANY_COUNT = { settingsHistoryStorageUsedFmt: 2, settingsHistoryStorageTrimmedFmt: 0, settingsHistoryBackupLastFmt: 1,
  settingsHistoryBackupDoneFmt: 0, restorePartHistoryFmt: 0, capturesExportedFmt: 0, statsKpiProtectionsRulesFmt: 0, historyExportShownFmt: 0, rulesExportedFmt: 0 };
// The Arabic "N of the captures" says it for any number (one of the captures, two of them, fifteen of them)
const READS_RIGHT = { capturesExportedFmt: ['ar'] };

test('a count with no singular twin is written as a label in every language that inflects by number', () => {
  for (const locale of INFLECTING) {
    const all = messages(locale);
    for (const [key, index] of Object.entries(ANY_COUNT)) {
      if ((READS_RIGHT[key] || []).includes(locale)) continue;
      assert.ok(labelled(all[key].message, index), `${locale} ${key}: "${all[key].message}" has the count after a noun ("1 entries"); put it after a label`);
    }
  }
});

test('the counts shown only from two on (a singular twin takes one) are labels in Russian and Arabic, whose plural forms differ by number', () => {
  // "{0} совпадений" is the form for 5 or more: 2 to 4 are "совпадения". Arabic has a dual, a plural of 3 to 10 and a singular for 11+
  for (const locale of ['ru', 'uk', 'pl', 'cs', 'ar']) {
    const all = messages(locale);
    for (const key of ['historyMatchCountFmt', 'methodPatternsFmt', 'combinationsCountFmt']) {
      assert.ok(labelled(all[key].message, 0), `${locale} ${key}: "${all[key].message}"`);
    }
  }
});

test('every reworded message keeps its placeholders, and English still says what it did', () => {
  const english = messages('en');
  for (const locale of fs.readdirSync(path.join(root, '_locales'))) {
    const all = messages(locale);
    for (const key of [...Object.keys(ANY_COUNT), 'historyMatchCountFmt', 'methodPatternsFmt', 'combinationsCountFmt']) {
      const tokens = (text) => (text.match(/\{\d\}/g) || []).sort().join('');
      assert.equal(tokens(all[key].message), tokens(english[key].message), `${locale} ${key}`);
    }
  }
});

// ---- the capture retention label -------------------------------------------------------------------------------------

const withLocale = (locale, fn) => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'I18n');
  const before = globalThis.I18n;
  globalThis.I18n = { locale: () => locale };
  try { return fn(); } finally { if (had) globalThis.I18n = before; else delete globalThis.I18n; }
};
afterEach(() => { delete globalThis.I18n; });
const noWords = (key, fallback) => fallback;

test('the retention label counts in the language of the interface: "1 minute", "2 дня", Arabic dual', () => {
  const label = (minutes, locale) => withLocale(locale, () => CaptureRetention.label(minutes, noWords));
  assert.equal(label(1, 'en'), '1 minute');
  assert.equal(label(45, 'en'), '45 minutes');
  assert.equal(label(120, 'en'), '2 hours');
  assert.equal(label(2880, 'en'), '2 days');
  assert.equal(label(10080, 'en'), '7 days');
  assert.equal(label(2, 'ru'), '2 минуты');
  assert.equal(label(5, 'ru'), '5 минут');
  assert.equal(label(2880, 'ru'), '2 дня');
  assert.equal(label(7200, 'ru'), '5 дней');
  assert.equal(label(120, 'ru'), '2 часа');
  assert.equal(label(2880, 'de'), '2 Tage', 'a German noun keeps its capital');
  assert.equal(label(2, 'ar'), 'دقيقتان');
  assert.equal(label(2880, 'ar'), 'يومان');
  assert.equal(label(2880, 'pt_BR'), '2 dias', 'Chrome-style codes (pt_BR) are accepted');
});

test('the common choices keep their own words, translated', () => {
  const words = { settingsCaptureRetention30m: 'trente minutes', settingsCaptureRetention1h: 'une heure' };
  const tr = (key, fallback) => words[key] || fallback;
  assert.equal(withLocale('fr', () => CaptureRetention.label(30, tr)), 'trente minutes');
  assert.equal(withLocale('fr', () => CaptureRetention.label(60, tr)), 'une heure');
});

test('without a language to count in (Node, the worker) the label is the English one it always was', () => {
  assert.equal(CaptureRetention.label(2880, noWords), '2 days');
  assert.equal(CaptureRetention.label(45, noWords), '45 minutes');
  assert.equal(CaptureRetention.label(180, noWords), '3 hours');
  // a language the platform rejects does not throw
  assert.equal(withLocale('not a locale!!', () => CaptureRetention.label(2880, noWords)), '2 days');
});

// ---- the storage size ------------------------------------------------------------------------------------------------

function loadSettingsUI(uiLocale) {
  const context = vm.createContext({ self: {}, console, FormatUtils: { uiLocale: () => uiLocale } });
  vm.runInContext(read('sections/settings/settings-ui.js'), context);
  return vm.runInContext('SettingsUI', context);
}

test('a size is written with the decimal mark of the language, and still in MB and KB', () => {
  const MB = 1048576;
  const size = (locale, bytes) => loadSettingsUI(locale).formatStorageSize(bytes);
  assert.equal(size('en', 2.14 * MB), '2.1 MB');
  assert.equal(size('de', 2.14 * MB), '2,1 MB');
  assert.equal(size('ru', 2.14 * MB), '2,1 MB');
  assert.equal(size('fr', 6 * MB), '6,0 MB');
  assert.equal(size('ar', 2.14 * MB), '2.1 MB', 'Latin digits, as the counts beside it');
  assert.equal(size(null, 2.14 * MB), '2.1 MB', 'no language: the English form');
  assert.equal(size('not a locale!!', 2.14 * MB), '2.1 MB');
  assert.equal(size('en', 12 * MB), '12.0 MB');
  assert.equal(size('en', 630 * 1024), '630 KB');
  assert.equal(size('de', 1), '1 KB');
  assert.equal(size('en', MB - 1), '1024 KB', 'no thousands separator that would read as a decimal');
  assert.equal(size('en', 1234.5 * MB), '1234.5 MB');
});
