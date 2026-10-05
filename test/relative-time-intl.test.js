const { test, afterEach } = require('node:test');
const assert = require('node:assert');

// getTimeAgo formats "… ago" in the UI language with Intl.RelativeTimeFormat
// when the i18n layer reports a locale, and keeps the English / format-key
// output when it does not (Node tests, the service worker before i18n loads).

global.Logger = { error() {}, warn() {}, ui() {}, debug() {} };
const FormatUtils = require('../utils/format-utils.js');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Minimal I18n stand-in: no messages, a fixed UI locale
function stubI18n(locale, messages = {}) {
  global.I18n = {
    locale: () => locale,
    get: (key) => (key in messages ? messages[key] : null),
    format(key, ...args) {
      const msg = this.get(key);
      if (msg === null) return null;
      return args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), msg);
    }
  };
}

afterEach(() => {
  delete global.I18n;
});

test('without I18n the English compact output is unchanged', () => {
  const now = Date.now();
  assert.strictEqual(FormatUtils.getTimeAgo(now - 3 * HOUR - 5 * MIN), '3h ago');
  assert.strictEqual(FormatUtils.getTimeAgo(now - 2 * DAY), '2d ago');
  assert.strictEqual(FormatUtils.getTimeAgo(now - 7 * MIN), '7m ago');
  assert.strictEqual(FormatUtils.getTimeAgo(0), 'Unknown');
  assert.strictEqual(FormatUtils.getTimeAgo(now + MIN), 'Just now');
});

test('an I18n without locale() keeps the format-key output', () => {
  global.I18n = {
    get: () => null,
    format: (key, n) => (key === 'timeHoursAgoFmt' ? `hace ${n} h (clave)` : null)
  };
  assert.strictEqual(FormatUtils.getTimeAgo(Date.now() - 3 * HOUR), 'hace 3 h (clave)');
});

test('the UI locale drives Intl.RelativeTimeFormat', () => {
  const now = Date.now();
  const expected = (locale, value, unit) =>
    new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'narrow' }).format(value, unit);

  stubI18n('es');
  assert.strictEqual(FormatUtils.getTimeAgo(now - 3 * HOUR), expected('es', -3, 'hour'));
  assert.match(FormatUtils.getTimeAgo(now - 3 * HOUR), /^hace 3/);

  stubI18n('ja');
  assert.strictEqual(FormatUtils.getTimeAgo(now - 2 * DAY), expected('ja', -2, 'day'));
  assert.match(FormatUtils.getTimeAgo(now - 2 * DAY), /前/);

  stubI18n('en');
  assert.strictEqual(FormatUtils.getTimeAgo(now - 3 * HOUR), '3h ago');
});

test('Chrome-style locale codes (pt_BR, zh_CN) are accepted', () => {
  stubI18n('pt_BR');
  assert.strictEqual(FormatUtils.uiLocale(), 'pt-BR');
  assert.match(FormatUtils.getTimeAgo(Date.now() - 5 * MIN), /5/);
  assert.notStrictEqual(FormatUtils.getTimeAgo(Date.now() - 5 * MIN), '5m ago');
});

test('Unknown and Just now still come from their keys', () => {
  stubI18n('es', { timeUnknown: 'Desconocido', timeJustNow: 'Justo ahora' });
  assert.strictEqual(FormatUtils.getTimeAgo(0), 'Desconocido');
  assert.strictEqual(FormatUtils.getTimeAgo(Date.now() + MIN), 'Justo ahora');
});

test('an invalid locale falls back to the format keys instead of throwing', () => {
  stubI18n('not a locale!!', { timeMinutesAgoFmt: '{0} min (clave)' });
  assert.strictEqual(FormatUtils.getTimeAgo(Date.now() - 4 * MIN), '4 min (clave)');
});

test('formatDateTime uses the UI locale when there is one', () => {
  const ts = Date.UTC(2026, 0, 15, 12, 0, 0);
  stubI18n('de');
  assert.strictEqual(
    FormatUtils.formatDateTime(ts),
    new Intl.DateTimeFormat('de', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(ts))
  );
  delete global.I18n;
  assert.strictEqual(FormatUtils.formatDateTime(ts), new Date(ts).toLocaleString());
});

test('FormatUtils.t substitutes placeholders in the message or the fallback', () => {
  assert.strictEqual(FormatUtils.t('clipboardConfidenceFmt', 'Confidence: {0}%', 87), 'Confidence: 87%');
  stubI18n('fr', { clipboardConfidenceFmt: 'Confiance : {0} %' });
  assert.strictEqual(FormatUtils.t('clipboardConfidenceFmt', 'Confidence: {0}%', 87), 'Confiance : 87 %');
});
