const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// "Cache scope: Domain", "Pages: 12": a label and its value are joined the way the language writes it (French puts a
// narrow no-break space before the colon, Chinese and Japanese use a full-width colon), and a size in Advanced →
// Captures has the decimal mark of the language ("1,5 KB" in German).

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const messages = (locale) => JSON.parse(read(`_locales/${locale}/messages.json`));
const FormatUtils = require('../utils/format-utils.js');

const withI18n = (locale, fn) => {
  const all = messages(locale);
  globalThis.I18n = {
    locale: () => locale,
    get: (key) => (all[key] ? all[key].message : ''),
    format: (key, ...args) => (all[key] ? all[key].message.replace(/\{(\d)\}/g, (m, i) => String(args[i])) : null)
  };
  try { return fn(); } finally { delete globalThis.I18n; }
};
afterEach(() => { delete globalThis.I18n; });

test('every language has the label-and-value pattern with both placeholders, written its own way', () => {
  for (const locale of fs.readdirSync(path.join(root, '_locales'))) {
    const message = messages(locale).labelValueFmt.message;
    assert.equal(message.indexOf('{0}'), 0, `${locale}: the label first`);
    assert.ok(message.endsWith('{1}'), `${locale}: the value last`);
  }
  assert.equal(messages('fr').labelValueFmt.message, '{0} : {1}');
  for (const locale of ['ja', 'zh_CN', 'zh_TW']) assert.equal(messages(locale).labelValueFmt.message, '{0}：{1}', locale);
  assert.equal(messages('en').labelValueFmt.message, '{0}: {1}');
});

test('labelValue joins in the interface language, and in English without one', () => {
  assert.equal(FormatUtils.labelValue('Cache scope', 'Domain'), 'Cache scope: Domain');
  assert.equal(withI18n('fr', () => FormatUtils.labelValue('Portée', 'Domaine')), 'Portée : Domaine');
  assert.equal(withI18n('zh_CN', () => FormatUtils.labelValue('页面', 12)), '页面：12');
  assert.equal(withI18n('de', () => FormatUtils.labelValue('Seiten', 12)), 'Seiten: 12');
});

test('labelValueHtml keeps the label and value markup and escapes only the pattern', () => {
  assert.equal(FormatUtils.labelValueHtml('<b>A</b>', '<i>B</i>'), '<b>A</b>: <i>B</i>');
  assert.equal(withI18n('fr', () => FormatUtils.labelValueHtml('<b>A</b>', 'B')), '<b>A</b> : B');
});

// The places that joined a label and a value with a fixed English ": "
const FILES = ['sections/stats/stats-activity.js', 'sections/stats/stats-evidence.js', 'sections/stats/stats-overview.js',
  'sections/stats/stats-protections.js', 'sections/stats/stats-rules.js', 'sections/stats/stats-charts.js',
  'sections/detection/detection-ui.js', 'sections/detection/detection-modals.js', 'sections/history/history.js',
  'sections/rules/rules-handlers.js', 'sections/rules/rules-suggest-ui.js', 'modules/ui/combination-checklist.js',
  'sections/advanced/components/code-generator-dialog.js', 'sections/advanced/components/cookie-results.js',
  'sections/advanced/history/view.js', 'sections/settings/settings-ui-webhook.js', 'sections/settings/settings-ui.js'];

test('no label is joined to its value with a fixed ": " any more', () => {
  const fixed = [/`: \$\{/, /['"]: ['"]\s*\+/, /\+\s*['"]: ['"]/, /\}: \$\{/, /join\(['"]: ['"]\)/, /\}:<\/span>/];
  for (const file of FILES) {
    read(file).split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      for (const pattern of fixed) assert.ok(!pattern.test(line), `${file}:${i + 1} joins with a fixed ": ": ${line.trim().slice(0, 120)}`);
    });
  }
});

// ---- Advanced → Captures sizes ----------------------------------------------------------------------------------------

function advancedUtils() {
  const context = vm.createContext({ console, FormatUtils, window: {}, chrome: {}, Logger: { ui() {}, debug() {}, info() {} }, document: { addEventListener() {} } });
  vm.runInContext(read('sections/advanced/advanced-utils.js'), context);
  return context.window.AdvancedUtils;
}

test('a capture size has the decimal mark of the language, and Latin digits', () => {
  const utils = advancedUtils();
  assert.equal(utils.formatBytes(1536), '1.5 KB', 'no language: the English form');
  assert.equal(withI18n('de', () => utils.formatBytes(1536)), '1,5 KB');
  assert.equal(withI18n('ru', () => utils.formatBytes(2.25 * 1048576)), '2,25 MB');
  assert.equal(withI18n('en', () => utils.formatBytes(1536)), '1.5 KB');
  assert.equal(withI18n('ar', () => utils.formatBytes(1536)), '1.5 KB', 'Latin digits, as the rest of the row');
  assert.equal(withI18n('de', () => utils.formatBytes(1000)), '1000 B', 'no thousands separator that would read as a decimal');
  assert.equal(utils.formatBytes(0), '0 B');
});

test('formatNumber: the language\'s decimal mark, the plain number without a language', () => {
  assert.equal(FormatUtils.formatNumber(1.25, { maximumFractionDigits: 2 }), '1.25');
  assert.equal(withI18n('fr', () => FormatUtils.formatNumber(1.25, { maximumFractionDigits: 2 })), '1,25');
  assert.equal(withI18n('de', () => FormatUtils.formatNumber(2.1, { minimumFractionDigits: 1, maximumFractionDigits: 1 })), '2,1');
  assert.equal(FormatUtils.formatNumber(2, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), '2.0');
});
