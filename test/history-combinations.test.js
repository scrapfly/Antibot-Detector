const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// History details show each matched combination as the same checklist as
// Detection, rebuilt from the slim entry and the rule as it is now.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadHistory() {
  const context = vm.createContext({ console, setTimeout, clearTimeout, chrome: { runtime: { getURL: (p) => `chrome-extension://id/${p}` } } });
  context.self = context;
  context.window = context;
  for (const file of ['utils/format-utils.js', 'modules/detection/detection-combinations.js', 'modules/ui/combination-checklist.js',
    'modules/core/history-store.js', 'sections/history/history.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context;
}

const definition = {
  id: 'detect-recaptcha', name: 'Google reCAPTCHA', icon: 'recaptcha_official.png',
  detection: {
    url: [{ id: 'google-sdk', text: '^https://www\\.google\\.com/recaptcha/api\\.js', confidence: 50, description: 'Official SDK script' }],
    dom: [{ id: 'configured-widget', selector: '.g-recaptcha[data-sitekey]', confidence: 40, description: 'Widget with a site key' }],
    window: [{ id: 'render-api', path: 'grecaptcha.render', confidence: 10, standalone: false, description: 'Render API' },
      { id: 'execute-api', path: 'grecaptcha.execute', confidence: 10, standalone: false, description: 'Execute API' }]
  },
  combinations: [{ id: 'sdk-widget-api', name: 'Official SDK, configured widget and compatible API', confidence: 90,
    when: { all: [{ pattern: 'google-sdk' }, { pattern: 'configured-widget' }, { any: [{ pattern: 'render-api' }, { pattern: 'execute-api' }] }] } }]
};

function historyWith(context, rules) {
  const history = Object.create(context.History.prototype);
  history.detectorManager = {
    findDetectorById: (id) => (rules[id] || null),
    getDetectorByName: () => null,
    categoryManager: { getTagColor: () => '#666666' }
  };
  return history;
}

test('a saved scan shows its checklist in History details, above the methods', () => {
  const context = loadHistory();
  // What the worker stores after a scan
  const scored = context.DetectionCombinations.score(definition, [
    { type: 'url', patternId: 'google-sdk', confidence: 50 },
    { type: 'dom', patternId: 'configured-widget', confidence: 40 },
    { type: 'window', pattern: 'grecaptcha.render', confidence: 10 }
  ]);
  const entry = context.HistoryStore.slimEntry({ id: 'e1', detections: [{
    detector: { id: 'detect-recaptcha', name: 'Google reCAPTCHA' }, category: 'CAPTCHA', confidence: scored.confidence,
    combinations: scored.combinations, matches: scored.matches
  }] });
  const history = historyWith(context, { 'detect-recaptcha': definition });
  history._historyComboCards = new Map();
  const html = history.renderDetectionDetails(entry.detections);
  const combos = html.indexOf('history-modal-combos');
  const methods = html.indexOf('history-modal-detection-methods');
  assert.ok(combos > 0 && combos < methods, 'checklist above the methods');
  assert.match(html, /Official SDK, configured widget and compatible API/);
  assert.match(html, /Sets the detection score/);
  assert.strictEqual((html.match(/aria-label="Found"><svg/g) || []).length, 4, 'SDK, widget, the group and the render API');
  assert.match(html, /aria-label="Not found"><svg[^]*?<\/span>[\s\S]*?Execute API/);
  assert.strictEqual(history._historyComboCards.get('0').length, 1);
});

test('after the rule was edited, History shows only the name and score', () => {
  const context = loadHistory();
  const edited = { ...definition, combinations: [{ ...definition.combinations[0], when: { all: [{ pattern: 'google-sdk' }] } }] };
  const stored = [{ detector: { id: 'detect-recaptcha', name: 'Google reCAPTCHA' }, category: 'CAPTCHA', confidence: 90,
    combinations: [{ id: 'sdk-widget-api', confidence: 90, h: context.DetectionCombinations.treeKey(definition.combinations[0].when) }],
    matches: [{ type: 'url', confidence: 50 }] }];
  const html = historyWith(context, { 'detect-recaptcha': edited }).renderDetectionDetails(stored);
  assert.match(html, /This rule changed or was removed after the scan/);
  assert.ok(!/match-combo-rows/.test(html));
});
