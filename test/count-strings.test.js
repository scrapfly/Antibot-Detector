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
// A count after a label ("Entries: 2", "Pages: 3 of 10", "Other pages: +2") or alone in brackets after a whole phrase
// ("Only the entries shown (2)"): no noun takes the number. Between the label's colon and the count only other numbers,
// signs and at most two short words ("of", "из", "में से") may stand, and no word may follow the count.
const labelled = (message, index) => {
  const at = message.lastIndexOf(`{${index}}`); // the last: “At least {0}” needs {0} patterns
  if (at < 0) return false;
  if (new RegExp(`[(（]\\s*\\{${index}\\}\\s*[)）]`).test(message)) return true;
  const before = message.slice(0, at);
  const colon = Math.max(before.lastIndexOf(':'), before.lastIndexOf('：'));
  if (colon < 0) return false;
  // "{0} of {1}": the words before the next count are not the count's noun
  const after = message.slice(at + `{${index}}`.length).replace(/^(?:[\s\u00a0\u202f\-–+/]*(?:[^\s{}:：.,]{1,6}[\s\u00a0\u202f]*){0,2}\{\d\})+/u, '');
  if (/^[\s\u00a0\u202f]*\p{L}/u.test(after)) return false;
  const between = before.slice(colon + 1).replace(/\{\d\}/g, ' ');
  return /^[\s\u00a0\u202f\-–+/]*(?:[^\s{}:：.,]{1,6}[\s\u00a0\u202f\-–+/]*){0,2}$/u.test(between);
};
const indexes = (value) => (Array.isArray(value) ? value : [value]);

// Used for any count, one included (no singular twin): the key and the number(s) of its count placeholder(s)
const ANY_COUNT = { settingsHistoryStorageUsedFmt: 2, settingsHistoryStorageTrimmedFmt: 0, settingsHistoryBackupLastFmt: 1,
  settingsHistoryBackupDoneFmt: 0, restorePartHistoryFmt: 0, capturesExportedFmt: 0, statsKpiProtectionsRulesFmt: 0, historyExportShownFmt: 0, rulesExportedFmt: 0,
  // 3.1.9: "Checked 1 pages", "1 of 1 pages", "fires on 1 pages", "1 detectors updated", "Read 1 scripts"...
  settingsHistoryWatchDoneFmt: [0, 1], ruleLiveTestPageFmt: [0, 1, 2, 3], ruleHistoryCheckSummaryFmt: [1, 0], ruleHistoryCheckRulePagesFmt: [0, 1],
  ruleHistoryCheckOtherFmt: 0, ruleHistoryCheckCombinationFmt: 0, detectorsUpdatedFmt: 0, customDetectorsClearedFmt: 0, historyCategoryShareFmt: [0, 1],
  historyExportCountFmt: [0, 1], statsRulesCoverageFmt: [0, 1], statsStrongEvidenceTipFmt: [0, 1], statsTableCountFmt: [0, 1], bulkShowingFmt: [0, 1],
  importHistoryModeMessageFmt: [0, 1], advCommonCharsFmt: 0, advPanelCookiesFoundFmt: [0, 1], statsKpiProtectionsNewFmt: 0,
  statsTipPagesFmt: 0, statsTimelineMetaFmt: [0, 1] };
// The Arabic "N of the captures" says it for any number (one of the captures, two of them, fifteen of them)
const READS_RIGHT = { capturesExportedFmt: ['ar'] };

test('a count with no singular twin is written as a label in every language that inflects by number', () => {
  for (const locale of INFLECTING) {
    const all = messages(locale);
    for (const [key, value] of Object.entries(ANY_COUNT)) {
      if ((READS_RIGHT[key] || []).includes(locale)) continue;
      for (const index of indexes(value)) {
        assert.ok(labelled(all[key].message, index), `${locale} ${key} {${index}}: "${all[key].message}" has the count before a noun ("1 entries"); put it after a label`);
      }
    }
  }
});

// Shown only from two on (a singular twin takes one, or the number is never one): the key and its count placeholder(s)
const FROM_TWO = { historyMatchCountFmt: 0, methodPatternsFmt: 0, combinationsCountFmt: 0,
  officialDetectorsRestoredFmt: 0, notificationHistoryExportedFmt: 0, notificationHistoryMergedFmt: 0, notificationHistoryReplacedFmt: 0,
  tipConfidenceAverageFmt: 0, tipDifficultyManyFmt: 0, advCookieTimelineChangedFmt: 0, combinationSentenceAllFmt: 0, combinationSentenceAnyFmt: 0,
  combinationSentenceAtLeastFmt: [0, 1], combinationInvalidAtLeastFmt: 0, shareExpiryDaysFmt: 0, advAkamaiSensorDataCharsFmt: 0,
  advAkamaiSbsdDataCharsFmt: 0, statsTimelineLimitFmt: 0 };
// An abbreviated unit ("дн.", "d") is the same after any number
const FROM_TWO_READS_RIGHT = { shareExpiryDaysFmt: ['ru', 'uk', 'pl', 'cs'] };

test('the counts shown only from two on (a singular twin takes one) are labels in the languages whose plural forms differ by number', () => {
  // "{0} совпадений" is the form for 5 or more: 2 to 4 are "совпадения". Arabic has a dual, a plural of 3 to 10 and a singular for 11+
  for (const locale of ['ru', 'uk', 'pl', 'cs', 'ar']) {
    const all = messages(locale);
    for (const [key, value] of Object.entries(FROM_TWO)) {
      if ((FROM_TWO_READS_RIGHT[key] || []).includes(locale)) continue;
      for (const index of indexes(value)) assert.ok(labelled(all[key].message, index), `${locale} ${key} {${index}}: "${all[key].message}"`);
    }
  }
});

test('every reworded message keeps its placeholders, and English still says what it did', () => {
  const english = messages('en');
  for (const locale of fs.readdirSync(path.join(root, '_locales'))) {
    const all = messages(locale);
    for (const key of [...Object.keys(ANY_COUNT), ...Object.keys(FROM_TWO)]) {
      const tokens = (text) => (text.match(/\{\d\}/g) || []).sort().join('');
      assert.equal(tokens(all[key].message), tokens(english[key].message), `${locale} ${key}`);
    }
  }
});

test('the labelled check itself: a count after a noun fails, a count after a label passes', () => {
  assert.equal(labelled('{0} pages', 0), false);
  assert.equal(labelled('Checked {0} pages, {1} changed', 0), false);
  assert.equal(labelled('Pages: {0} of {1}', 1), true);
  assert.equal(labelled('Pages: {0} of {1} entries', 1), false, 'a noun after the count');
  assert.equal(labelled('Other pages: +{0}', 0), true);
  assert.equal(labelled('Записей: {0} из {1}', 1), true);
  assert.equal(labelled('Pages checked: {0} · changed: {1}', 1), true);
  assert.equal(labelled('Pages: {0}. Read {1} scripts', 1), false);
  assert.equal(labelled('Pages: {0} of {1}', 0), true);
  assert.equal(labelled('Detections: {0} of {1} detections', 0), false);
  assert.equal(labelled('Only the entries shown ({0})', 0), true);
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

// ---- counts that pick their words in code -----------------------------------------------------------------------------

test('a share kept for one day says "1 day", not "1 days"; other numbers keep the count', () => {
  const context = vm.createContext({ console, FormatUtils: { t: (key, fallback, ...args) => String(fallback).replace(/\{(\d)\}/g, (m, i) => String(args[i])) } });
  context.self = context;
  vm.runInContext(read('sections/detection/detection-actions.js'), context);
  const describe = (days) => context.DetectionActions.describeShareExpiry({ kind: 'days', days });
  assert.equal(describe(1), 'deleted after 1 day');
  assert.equal(describe(7), 'deleted after 7 days');
});

test('"at least 1 of these conditions" is worded as "any one of these" in the Detection checklist', () => {
  global.DetectionCombinations = require('../modules/detection/detection-combinations.js');
  const Checklist = require('../modules/ui/combination-checklist.js');
  const tree = (atLeast) => ({ kind: 'group', mode: 'of', atLeast, items: [{ kind: 'pattern' }, { kind: 'pattern' }, { kind: 'pattern' }] });
  assert.equal(Checklist.firesWhen(tree(1)), 'Fires when any one of these 3 conditions is met.');
  assert.equal(Checklist.firesWhen(tree(2)), 'Fires when at least 2 of these 3 conditions are met.');
  // The Rules editor's own sentence: test/rules-combinations-editor.test.js
});

test('the Rules pattern pager says "1 match" or "1 pattern" for one, not "Showing 1-1 of 1 matches"', () => {
  const context = vm.createContext({ console, document: {}, FormatUtils: require('../utils/format-utils.js') });
  vm.runInContext('function Rules() {}', context);
  vm.runInContext(read('sections/rules/rules-editor.js'), context);
  const Rules = vm.runInContext('Rules', context);
  const pager = (count, searchQuery) => {
    const info = { textContent: '' };
    const items = Array.from({ length: count }, () => ({ style: {} }));
    const section = { classList: { contains: () => false },
      querySelector: (selector) => (selector === '.method-pagination-info' ? info : null),
      querySelectorAll: () => items };
    const entry = { page: 1, searchQuery: '' };
    const self = { getMethodSectionType: () => 'url', getMethodPaginationEntry: () => entry,
      updateMethodPatternCount: () => count, methodItemMatchesSearch: () => true };
    Rules.prototype.updateMethodSectionPagination.call(self, section, searchQuery ? { searchQuery } : {});
    return info.textContent;
  };
  assert.equal(pager(1, 'sdk'), '1 match');
  assert.equal(pager(1), '1 pattern');
  assert.equal(pager(5, 'sdk'), 'Showing 1-3 of 5 matches');
});
