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
  assert.deepStrictEqual(counts, ['Anti-bot: 1', 'Captcha: 0', 'Fingerprint: 2']);
  assert.match(html, /history-cat-count is-zero/, 'an empty category is dimmed, not hidden');
  assert.strictEqual((html.match(/<svg/g) || []).length, 3, 'three category icons');
  assert.ok(!/<button|data-action/.test(html), 'not its own button: a click opens the card details');
  assert.ok(!html.includes('more-detections'), 'no "+N"');
  assert.match(html, /Canvas Fingerprint/, 'the tip lists the protections of the category');
});

test('Settings → Show first decides the order of the totals', () => {
  const history = loadHistory();
  history.detectionSort = { categoryOrder: ['fingerprint', 'antibot', 'captcha'] };
  const html = history.renderHistorySummary(detections);
  const counts = [...html.matchAll(/data-tip="([^":]*):/g)].map(m => m[1]);
  assert.deepStrictEqual(counts, ['Fingerprint', 'Anti-bot', 'Captcha']);
});

test('no detections: the card keeps its "No detections" label', () => {
  const history = loadHistory();
  assert.match(history.renderHistorySummary([]), /history-detection-tag/);
});
