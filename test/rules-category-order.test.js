const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → Detection order is the category order of the Detection list and
// History; the Rules list follows it too: disabled rules last, then the
// category order, then the newest update, then the name.

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function rulesWith(settings) {
  const context = { console, Logger: { debug() {}, error() {}, ui() {} }, Rules: function Rules() {},
    Utils: { getSettings: async () => settings }, document: { querySelector: selector => (selector === '#rulesList' ? {} : selector === '#rulesSearch' ? { value: '' } : { style: {} }) } };
  vm.createContext(context);
  vm.runInContext(read('utils/detection-utils.js') + '\nthis.DetectionUtils = DetectionUtils;', context);
  vm.runInContext(read('sections/rules/rules-display.js'), context);
  const detector = (name, lastUpdated, extra = {}) => ({ name, displayName: name, lastUpdated, enabled: true, ...extra });
  const rules = Object.create(context.Rules.prototype);
  Object.assign(rules, {
    initialized: true, paginationManager: { setItems() {} }, getDetectorDisplayName: name => name,
    getSortTimestamp: value => Date.parse(value) || 0,
    detectorManager: { getAllDetectors: () => ({
      antibot: { old_ab: detector('Old anti-bot', '2026-01-01'), new_ab: detector('New anti-bot', '2026-10-16') },
      captcha: { cap: detector('Captcha', '2026-05-05'), cap_off: detector('Disabled captcha', '2026-10-16', { enabled: false }) },
      fingerprint: { fp: detector('Fingerprint', '2026-10-16') }
    }) }
  });
  return rules;
}
const names = rules => Array.from(rules.allDetectors, d => d.detector.displayName);

test('Rules follow the default category order, newest update first inside a category', async () => {
  const rules = rulesWith({ detection: {} });
  await rules.displayRules();
  assert.deepEqual(names(rules), ['New anti-bot', 'Old anti-bot', 'Captcha', 'Fingerprint', 'Disabled captcha']);
});

test('Rules follow the category order chosen in Settings → Detection order', async () => {
  const rules = rulesWith({ detection: { categoryOrder: ['fingerprint', 'captcha', 'antibot'] } });
  await rules.displayRules();
  assert.deepEqual(names(rules), ['Fingerprint', 'Captcha', 'New anti-bot', 'Old anti-bot', 'Disabled captcha']);
});

test('without readable settings the Rules list keeps the default order', async () => {
  const rules = rulesWith(null);
  await rules.displayRules();
  assert.deepEqual(names(rules), ['New anti-bot', 'Old anti-bot', 'Captcha', 'Fingerprint', 'Disabled captcha']);
});
