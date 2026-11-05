const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Rules tab: the list holds its own copy of every rule (displayRules copies each one when it lists them). A card's switch
// changes the rule in the detector manager; the list's copy must follow, or the Disabled chip and any card drawn again
// (another page of the list, a new search) show the rule as it was when the tab was drawn.

const root = path.join(__dirname, '..');
const RulesFilter = require('../modules/core/rules-filter.js');

/** The Rules class as the popup loads it, over a detector manager whose own rule is `stored` and a list of copies. */
function tab({ failSave = false } = {}) {
  const stored = { enabled: true };
  const ctx = {
    window: {},
    RulesFilter,
    Logger: { debug() {}, ui() {}, error() {} },
    CSS: { escape: (text) => text },
    WorkerMessages: { RELOAD_DETECTORS: 'RELOAD_DETECTORS' },
    chrome: { runtime: { sendMessage() {} } },
    document: { querySelector: () => null },
    I18n: { get: () => '' },
    NotificationHelper: { error() {} }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/rules/rules.js'), 'utf8'), ctx, { filename: 'rules.js' });
  const rules = Object.create(ctx.window.Rules.prototype);
  rules.detectorManager = {
    getDetector: (category, name) => (name === 'detect-cloudflare' ? stored : null),
    saveDetectorsToStorage: async () => { if (failSave) throw new Error('storage is full'); }
  };
  // as displayRules lists them: a copy of each rule
  rules.allDetectors = [
    { category: 'antibot', detectorName: 'detect-cloudflare', detector: { ...stored } },
    { category: 'captcha', detectorName: 'detect-recaptcha', detector: { enabled: true } }
  ];
  rules.filteredDetectors = rules.allDetectors.slice();
  return { rules, stored };
}

const disabledChip = (rules) => RulesFilter.filter(rules.allDetectors, { chips: { disabled: true } }).map(entry => entry.detectorName);

test('a rule switched off is on the Disabled chip at once, and off it when switched on again', async () => {
  const { rules, stored } = tab();
  assert.deepEqual(disabledChip(rules), []);

  await rules.updateDetectorEnabledState('antibot', 'detect-cloudflare', false);
  assert.equal(stored.enabled, false, 'the detector manager has the change');
  assert.equal(rules.allDetectors[0].detector.enabled, false, 'the list\'s copy follows the switch');
  assert.deepEqual(disabledChip(rules), ['detect-cloudflare'], 'the Disabled chip lists it without the tab being drawn again');
  assert.equal(rules.filteredDetectors[0].detector.enabled, false, 'the shown list reads the same copy');

  await rules.updateDetectorEnabledState('antibot', 'detect-cloudflare', true);
  assert.equal(rules.allDetectors[0].detector.enabled, true);
  assert.deepEqual(disabledChip(rules), []);
});

test('the other rules of the list are left as they were', async () => {
  const { rules } = tab();
  await rules.updateDetectorEnabledState('antibot', 'detect-cloudflare', false);
  assert.equal(rules.allDetectors[1].detector.enabled, true);
});

test('a switch that could not be saved goes back in the list as well', async () => {
  const { rules, stored } = tab({ failSave: true });
  await rules.updateDetectorEnabledState('antibot', 'detect-cloudflare', false);
  assert.equal(stored.enabled, true, 'the rule went back');
  assert.equal(rules.allDetectors[0].detector.enabled, true, 'and so did the list\'s copy');
  assert.deepEqual(disabledChip(rules), []);
});

test('a rule the manager does not know changes nothing in the list', async () => {
  const { rules } = tab();
  await rules.updateDetectorEnabledState('captcha', 'detect-recaptcha', false);
  assert.equal(rules.allDetectors[1].detector.enabled, true, 'no stored rule: nothing was switched, so the list does not claim it was');
});
