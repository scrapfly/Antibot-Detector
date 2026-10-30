const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The detection methods are listed open, but each row starts folded: its head (type, score, chevron) is a button
// that shows the value, and the value copies. Same in the Detection details and in the History details.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const matches = [
  { type: 'content', pattern: '_cf_chl_opt', confidence: 20 },
  { type: 'cookie', value: 'cf_clearance=abc', confidence: 100 },
  { type: 'header', value: 'server: cloudflare', confidence: 85 }
];
const count = (html, re) => (html.match(re) || []).length;

test('Detection details: every row starts folded, with the score in the head and the value after it', () => {
  const context = vm.createContext({ console, self: {}, encodeURIComponent, decodeURIComponent });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'sections/detection/detection-ui.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const html = context.DetectionUI.getMethodBadges.call({ detectorManager: { categoryManager: { getTagColor: () => '#00BCD4' } } }, matches);
  assert.equal(count(html, /class="method-item-card [^"]*is-folded"/g), 3, 'one folded row per match');
  assert.equal(count(html, /<button type="button" class="method-fold-head" aria-expanded="false">/g), 3);
  for (const row of html.split('<div class="method-item-card').slice(1)) {
    const head = row.slice(row.indexOf('method-fold-head'), row.indexOf('</button>'));
    assert.ok(head.includes('method-type-badge') && head.includes('method-confidence') && head.includes('method-fold-chevron'), 'type, score and chevron are the head');
    assert.ok(/method-value-btn/.test(row.slice(row.indexOf('</button>'))), 'the value comes after the head');
  }
});

test('History details: every row starts folded, and only the value carries the copy hint', () => {
  const context = vm.createContext({ console, setTimeout, clearTimeout, chrome: { runtime: { getURL: (p) => `chrome-extension://id/${p}` } } });
  context.self = context;
  context.window = context;
  for (const file of ['modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'modules/detection/detection-combinations.js', 'modules/ui/combination-checklist.js',
    'modules/core/history-store.js', 'sections/history/history.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const history = Object.create(context.History.prototype);
  history.detectorManager = { categoryManager: { getTagColor: () => '#666666' } };
  const html = history.renderDetectionMethods(matches);
  assert.equal(count(html, /class="history-modal-method-item is-folded"/g), 3);
  assert.equal(count(html, /<button type="button" class="history-modal-method-head" aria-expanded="false">/g), 3);
  assert.equal(count(html, /class="history-modal-method-value" title="[^"]+"/g), 3, 'the value says it copies');
  assert.ok(!/class="history-modal-method-item[^>]*title=/.test(html), 'the row itself no longer copies');
});

test('the folded value is hidden and the head is the toggle, in both stylesheets', () => {
  const detection = read('sections/detection/detection.css');
  const history = read('sections/history/history.css');
  assert.match(detection, /\.method-item-card\.is-folded > \.method-value-btn \{\s*display: none;/);
  assert.match(history, /\.history-modal-method-item\.is-folded > \.history-modal-method-value \{\s*display: none;/);
  assert.match(detection, /\.method-item-card\.is-folded \{\s*grid-template-areas: "head";/, 'no empty value row under a folded head');
  assert.match(history, /\.history-modal-method-item\.is-folded \{\s*grid-template-areas: "head";/);
  assert.match(detection, /\.method-fold-head\[aria-expanded="true"\] \.method-fold-chevron \{\s*transform: rotate\(180deg\)/);
  assert.match(history, /\.history-modal-method-head\[aria-expanded="true"\] \.history-modal-method-chevron \{\s*transform: rotate\(180deg\)/);
});
