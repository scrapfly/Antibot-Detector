const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Texts and layout that have to read the right way in a language that is not English: the label of the difficulty tip comes
// from the language's own "label: value" text, the arrows of the Arabic texts point where a right-to-left line flows, and the
// parts of the popup that sit "at the start" of a line follow the reading direction (left to right in English, right to left
// in Arabic). The rendered result is checked in the browser by scripts/e2e-v314-feedback-rtl.js.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const messagesOf = (locale) => JSON.parse(read(`_locales/${locale}/messages.json`));
const LOCALES = fs.readdirSync(path.join(root, '_locales')).filter(name => fs.statSync(path.join(root, '_locales', name)).isDirectory()).sort();

global.Logger = { error() {}, warn() {}, ui() {}, debug() {} };
global.DetectionUtils = require('../utils/detection-utils.js');
const FormatUtils = require('../utils/format-utils.js');

/** I18n as the pages have it for one language: the message with {0}... filled in, null when it has no such message */
function useLanguage(locale) {
  const messages = messagesOf(locale);
  global.I18n = {
    locale: () => locale,
    get: (key) => (messages[key] ? messages[key].message : null),
    format(key, ...args) {
      const text = this.get(key);
      return text === null ? null : args.reduce((out, arg, i) => out.split(`{${i}}`).join(String(arg)), text);
    }
  };
  return messages;
}

const detections = [
  { detector: { name: 'hCaptcha' }, category: 'CAPTCHA', confidence: 90, difficulty: 'High' },
  { detector: { name: 'Canvas Fingerprint' }, category: 'fingerprint', confidence: 40, difficulty: 'Low' }
];

test('the difficulty tip is titled with the language\'s own "label: value" text, not an English colon glued on (French spaces it, Chinese has its own)', () => {
  try {
    for (const locale of LOCALES) {
      const messages = useLanguage(locale);
      for (const [level, key] of [['High', 'difficultyHigh'], ['Medium', 'difficultyMedium'], ['Low', 'difficultyLow']]) {
        const expected = messages.clipboardDifficultyFmt.message.replace('{0}', messages[key].message);
        assert.equal(FormatUtils.difficultyTip(detections, level).title, expected, `${locale} ${level}`);
      }
    }
    // The caller's own title still wins
    useLanguage('fr');
    assert.equal(FormatUtils.difficultyTip(detections, 'High', 'Mon titre').title, 'Mon titre');
  } finally {
    delete global.I18n;
  }
  // Without a language, English
  assert.equal(FormatUtils.difficultyTip(detections, 'High').title, 'Difficulty: High');
});

test('Arabic arrows point the way a right-to-left line flows: ← (a → between two values points back at the first one, and arrows are not mirrored)', () => {
  const ar = messagesOf('ar');
  assert.deepEqual(Object.entries(ar).filter(([, v]) => v.message.includes('→')).map(([key]) => key), [], 'no message uses →');
  // The ones that were → in English: a change from one value to another, and the path of a setting. The change carries a sign
  // ("+25", "−30"): between two numbers the sign would lose its side in a right-to-left line and read "25+", so it is marked
  // left to right (U+200E)
  assert.match(ar.historyCompareChangeFmt.message, /^\{0\}% ← \{1\}% \(‎\{2\}\)$/);
  assert.match(ar.statsHeadlineRiserSubFmt.message, /\{0\} ← \{1\}/);
  assert.match(ar.bulkReasonScope.message, /← .+ ←/);
  // The languages that read left to right keep →
  for (const locale of LOCALES.filter(name => name !== 'ar')) {
    assert.ok(messagesOf(locale).historyCompareChangeFmt.message.includes('→'), `${locale} still has →`);
  }
});

/** The declarations of the first rule whose selector line is exactly `selector` */
function ruleOf(css, selector) {
  const start = css.split('\n').findIndex(line => line.trim() === `${selector} {`);
  assert.notEqual(start, -1, `rule ${selector}`);
  const lines = css.split('\n').slice(start + 1);
  return lines.slice(0, lines.findIndex(line => line.trim() === '}')).join('\n');
}
const physical = /(^|\s)(left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right):/m;

test('the language list opens from the start side of its picker: in Arabic it would run 42px past the picker\'s left edge, and 18px of it are cut', () => {
  const css = read('sections/settings/language.css');
  const menu = ruleOf(css, '#settingsModal .settings-row--language .language-picker-menu');
  assert.match(menu, /inset-inline-start:\s*auto;/);
  assert.match(menu, /inset-inline-end:\s*0;/);
  assert.doesNotMatch(menu, physical);
  const picker = ruleOf(css, '#settingsModal .settings-row--language .language-picker');
  assert.match(picker, /margin-inline-end:\s*-1px;/);
  assert.doesNotMatch(picker, physical);
  const trigger = ruleOf(css, '#settingsModal .settings-row--language .language-picker-trigger');
  assert.match(trigger, /padding-inline:\s*9px 10px;/, 'the flag side is 9px and the arrow side 10px, whichever way the row reads');
  assert.doesNotMatch(trigger, physical);
  assert.doesNotMatch(ruleOf(css, '#settingsModal .settings-row--language .language-picker-label'), physical);
});

test('the connector of the "How it works" steps starts at the number\'s side, which is the right one in Arabic', () => {
  const connector = ruleOf(read('sections/advanced/styles/dialogs.css'), '.advanced-info-step:not(:last-child)::after');
  assert.match(connector, /inset-inline-start:\s*11px;/);
  assert.doesNotMatch(connector, physical);
});

test('the bullets of the Rules help dialogs sit before the text: the padding and the dot are on the start side', () => {
  const css = read('sections/rules/rule-helpers.css');
  const item = ruleOf(css, '.rh-bullets li');
  assert.match(item, /padding-inline-start:\s*12px;/);
  assert.doesNotMatch(item, physical);
  const dot = ruleOf(css, '.rh-bullets li::before');
  assert.match(dot, /inset-inline-start:\s*1px;/);
  assert.doesNotMatch(dot, physical);
});

test('a toast keeps its type line, its padding and its close button on the sides of the reading direction', () => {
  const css = read('modules/styles/notification-manager.css');
  for (const selector of ['.notification-toast::before', '.notification-toast-content', '.notification-close', '.notification-micro .notification-toast-content']) {
    assert.doesNotMatch(ruleOf(css, selector), physical, selector);
  }
  assert.match(ruleOf(css, '.notification-toast::before'), /inset-inline-start:\s*0;/);
  assert.match(ruleOf(css, '.notification-toast-content'), /padding-inline:\s*13px 6px;/);
  assert.match(ruleOf(css, '.notification-close'), /margin-inline-start:\s*auto;/);
  assert.match(ruleOf(css, '.notification-micro .notification-toast-content'), /padding-inline:\s*12px 10px;/);
  // The stack sits at the end of the line and slides in from that side
  assert.match(ruleOf(css, '.notification-container'), /inset-inline-end:\s*10px;/);
  assert.doesNotMatch(ruleOf(css, '.notification-container'), physical);
  assert.match(css, /\[dir="rtl"\] \.notification-toast \{\s*transform:\s*translateX\(-120%\);/);
});
