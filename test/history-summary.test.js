const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// History cards: one total per category (anti-bot, captcha, fingerprint) with
// the category icons instead of a row of logos cut at "+N"; clicking the card
// opens the details, which list every protection.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadHistory() {
  const context = vm.createContext({ console, setTimeout, clearTimeout, chrome: { runtime: { getURL: (p) => `chrome-extension://id/${p}` } } });
  context.self = context;
  context.window = context;
  for (const file of ['modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'modules/detection/detection-combinations.js', 'modules/ui/combination-checklist.js',
    'modules/core/history-store.js', 'sections/history/history.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const history = Object.create(context.History.prototype);
  history.detectorManager = { getDetectorByName: () => null, getCategoryInfo: () => null };
  return history;
}

const detections = [
  { detector: { name: 'Navigator Fingerprint' }, category: 'Fingerprint', confidence: 10 },
  { detector: { name: 'Canvas Fingerprint' }, category: 'Fingerprint', confidence: 20 },
  { detector: { name: 'Cloudflare Waiting Room' }, category: 'Anti-Bot', confidence: 85 }
];

test('the card shows one total per category, anti-bot first, with icons and a tip naming each', () => {
  const history = loadHistory();
  const html = history.renderHistorySummary(detections);
  const counts = [...html.matchAll(/class="history-cat-count[^"]*" data-tip="([^"]*)"/g)].map(m => m[1]);
  assert.deepStrictEqual(counts, ['Anti-bot: 1', 'Captcha: 0', 'Fingerprint: 2', 'Matched combinations: 0']);
  assert.match(html, /history-cat-count is-zero/, 'an empty category is dimmed, not hidden');
  assert.strictEqual((html.match(/<svg/g) || []).length, 4, 'three category icons and the combinations');
  assert.ok(!/<button|data-action/.test(html), 'not its own button: a click opens the card details');
  assert.ok(!html.includes('more-detections'), 'no "+N"');
  assert.match(html, /Canvas Fingerprint/, 'the tip lists the protections of the category');
});

test('Settings → Show first decides the order of the totals', () => {
  const history = loadHistory();
  history.detectionSort = { categoryOrder: ['fingerprint', 'antibot', 'captcha'] };
  const html = history.renderHistorySummary(detections);
  const counts = [...html.matchAll(/data-tip="([^":]*):/g)].map(m => m[1]);
  assert.deepStrictEqual(counts, ['Fingerprint', 'Matched combinations', 'Anti-bot', 'Captcha'], 'the combinations stay beside the fingerprint');
});

test('no detections: the card keeps its "No detections" label', () => {
  const history = loadHistory();
  assert.match(history.renderHistorySummary([]), /history-detection-tag/);
});

// The combinations that fired on the page, beside the fingerprint total
test('the card counts the combinations that fired, right after the fingerprint total, and names each in the hover', () => {
  const history = loadHistory();
  history.detectorManager = { getDetectorByName: () => null, getCategoryInfo: () => null,
    findDetectorById: (id) => (id === 'detect-nav' ? { id, combinations: [{ id: 'profile', name: 'Browser profile' }] } : null) };
  const withCombos = [
    { detector: { id: 'detect-nav', name: 'Navigator Fingerprint' }, category: 'Fingerprint', confidence: 30,
      combinations: [{ id: 'profile', confidence: 30 }, { id: 'device', name: 'Device profile', confidence: 60 }] },
    { detector: { name: 'Canvas Fingerprint' }, category: 'Fingerprint', confidence: 20, combinations: [{ id: 'x', confidence: 10 }] },
    { detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 85 }
  ];
  const html = history.renderHistorySummary(withCombos);
  const chips = [...html.matchAll(/class="history-cat-count([^"]*)" data-tip="([^"]*)"/g)].map(m => [m[2], /is-zero/.test(m[1])]);
  assert.deepStrictEqual(chips, [['Anti-bot: 1', false], ['Captcha: 0', true], ['Fingerprint: 2', false], ['Matched combinations: 3', false]]);
  const chip = html.slice(html.indexOf('history-combo-count'));
  assert.match(chip, /<span class="history-cat-value">3<\/span>/);
  // Highest first; a name the saved entry does not hold comes from the rule as it is now; an unnamed rule is numbered
  const order = ['Device profile', 'Browser profile', 'Combination 3'].map(name => chip.indexOf(name));
  assert.ok(order.every(at => at > 0) && order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
  assert.match(chip, /60%/);
});

test('with no combination the total is there, dimmed like an empty category; with no detections only "No detections" shows', () => {
  const history = loadHistory();
  const html = history.renderHistorySummary(detections);
  assert.match(html, /history-cat-count history-combo-count is-zero" [^>]*data-tip="Matched combinations: 0"/);
  assert.ok(!/history-combo-count/.test(history.renderHistorySummary([])));
});

test('the combinations total follows the fingerprint wherever Settings puts it, and ends the row when there is no fingerprint slot', () => {
  const history = loadHistory();
  history.detectionSort = { categoryOrder: ['antibot', 'fingerprint', 'captcha'] };
  const tips = [...history.renderHistorySummary(detections).matchAll(/data-tip="([^":]*):/g)].map(m => m[1]);
  assert.deepStrictEqual(tips, ['Anti-bot', 'Fingerprint', 'Matched combinations', 'Captcha']);
});
