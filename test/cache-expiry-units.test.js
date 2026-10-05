const { test, afterEach } = require('node:test');
const assert = require('node:assert');

// The Detection tab's cache-expiry tile ("3h 5m") takes its compact unit
// suffixes and the pair joiner from locale keys, with the English output as
// the fallback.

global.self = global;
global.Logger = { ui() {}, debug() {}, error() {}, detection() {}, warn() {} };
global.chrome = { runtime: { getURL: (p) => p } };
global.document = { querySelector: () => null };

require('../sections/detection/detection-ui.js');
const DetectionUI = global.self.DetectionUI;

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function stubI18n(messages) {
  global.I18n = {
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

test('English fallback output is unchanged', () => {
  assert.strictEqual(DetectionUI.formatExpiryRemaining(3 * HOUR + 5 * MIN), '3h 5m');
  assert.strictEqual(DetectionUI.formatExpiryRemaining(2 * DAY + 4 * HOUR), '2d 4h');
  assert.strictEqual(DetectionUI.formatExpiryRemaining(40 * DAY), '1mo 10d');
  assert.strictEqual(DetectionUI.formatExpiryRemaining(400 * DAY), '1y 1mo');
  assert.strictEqual(DetectionUI.formatExpiryRemaining(7 * MIN), '7m');
  assert.strictEqual(DetectionUI.formatExpiryRemaining(20 * 1000), '<1m');
  assert.strictEqual(DetectionUI.formatExpiryRemaining(0), 'Expired');
});

test('unit suffixes and the joiner come from the locale', () => {
  stubI18n({
    detectionUiDurHoursFmt: '{0}時間',
    detectionUiDurMinutesFmt: '{0}分',
    detectionUiDurPairFmt: '{0}{1}',
    detectionUiDurUnderMinute: '1分未満',
    cacheExpiredLabel: '期限切れ'
  });
  assert.strictEqual(DetectionUI.formatExpiryRemaining(3 * HOUR + 5 * MIN), '3時間5分');
  assert.strictEqual(DetectionUI.formatExpiryRemaining(20 * 1000), '1分未満');
  assert.strictEqual(DetectionUI.formatExpiryRemaining(-1), '期限切れ');
});

test('a whole hour shows only the hour unit', () => {
  stubI18n({ detectionUiDurHoursFmt: '{0} h', detectionUiDurPairFmt: '{0} + {1}' });
  assert.strictEqual(DetectionUI.formatExpiryRemaining(2 * HOUR), '2 h');
});

test('copy labels are localised with the value', () => {
  assert.deepStrictEqual(DetectionUI.copyLabelText('URL', 'https://a.test/'), {
    action: 'Copy URL',
    withValue: 'Copy URL: https://a.test/'
  });
  stubI18n({ detectionUiCopyCategory: 'Copiar categoría', detectionUiCopyCategoryFmt: 'Copiar categoría: {0}' });
  assert.deepStrictEqual(DetectionUI.copyLabelText('category', 'Captcha'), {
    action: 'Copiar categoría',
    withValue: 'Copiar categoría: Captcha'
  });
});
