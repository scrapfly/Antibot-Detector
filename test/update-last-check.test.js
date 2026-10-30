const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → Updates → "Last check": the time since is worded by the UI language's own plural rules (Intl), not by one
// "{0} days ago" message for every number (which reads "2 дней назад" in Russian, where it is "2 дня назад").
const root = path.join(__dirname, '..');
function load(language) {
  const ctx = { console, Intl, Date, Logger: { debug() {}, error() {}, storage() {} }, Constants: {}, chrome: { storage: { local: {} } } };
  ctx.I18n = language ? { locale: () => language, get: () => null, format: () => null } : undefined;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/core/categories.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'utils/format-utils.js'), 'utf8') + '\nglobalThis.FormatUtils = FormatUtils;', ctx);
  const source = fs.readFileSync(path.join(root, 'modules/detection/rules/update-manager.js'), 'utf8');
  vm.runInContext(source, ctx);
  return ctx.UpdateManager;
}
const ago = (ms) => Date.now() - ms;

test('the time since the last check uses the language\'s plural forms, and the messages when there is no language', () => {
  const ru = load('ru');
  assert.equal(ru.formatLastCheck(ago(2 * 86400000 + 5000)), '2 дня назад');
  assert.equal(ru.formatLastCheck(ago(5 * 86400000 + 5000)), '5 дней назад');
  assert.equal(ru.formatLastCheck(ago(22 * 86400000 + 5000)), '22 дня назад');
  assert.equal(ru.formatLastCheck(ago(3 * 3600000 + 5000)), '3 часа назад');
  assert.match(load('en').formatLastCheck(ago(2 * 3600000 + 5000)), /^2 hours ago$/);
  // No I18n (the worker before the translations load, Node): the English fallback
  assert.equal(load(null).formatLastCheck(ago(2 * 86400000 + 5000)), '2 days ago');
  assert.equal(load(null).formatLastCheck(0), 'Never');
  assert.equal(load('ru').formatLastCheck(ago(1000)), 'Just now');
});
