const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → Detection → Category order decides which category the Detection
// list shows first; within a category the highest confidence comes first.

const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, Logger: new Proxy({}, { get: () => () => {} }) });
ctx.window = ctx; ctx.self = ctx;
for (const file of ['utils/detection-utils.js', 'sections/detection/detection-ui.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}
vm.runInContext('this.DetectionUtils = DetectionUtils; this.DetectionUI = DetectionUI;', ctx);
const { DetectionUtils, DetectionUI } = ctx;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('a saved order is normalised to a complete order of the three categories', () => {
  assert.deepStrictEqual(plain(DetectionUtils.normalizeCategoryOrder(undefined)), ['antibot', 'captcha', 'fingerprint']);
  assert.deepStrictEqual(plain(DetectionUtils.normalizeCategoryOrder('captcha,antibot,fingerprint')), ['captcha', 'antibot', 'fingerprint']);
  assert.deepStrictEqual(plain(DetectionUtils.normalizeCategoryOrder(['fingerprint'])), ['fingerprint', 'antibot', 'captcha']);
  assert.deepStrictEqual(plain(DetectionUtils.normalizeCategoryOrder(['Anti-Bot', 'bogus', 'captcha', 'captcha'])), ['antibot', 'captcha', 'fingerprint']);
});

test('the Detection list follows the chosen category order, then confidence', () => {
  const detections = [
    { name: 'Canvas', category: 'fingerprint', confidence: 70 },
    { name: 'Cloudflare', category: 'antibot', confidence: 50 },
    { name: 'hCaptcha', category: 'captcha', confidence: 95 },
    { name: 'reCAPTCHA', category: 'captcha', confidence: 10 },
    { name: 'DataDome', category: 'Anti-Bot', confidence: 90 }
  ];
  const sorted = (order) => DetectionUI.sortDetectionsByCategory.call({ categoryOrder: order }, detections).map(d => d.name);

  assert.deepStrictEqual(plain(sorted(['antibot', 'captcha', 'fingerprint'])), ['DataDome', 'Cloudflare', 'hCaptcha', 'reCAPTCHA', 'Canvas']);
  assert.deepStrictEqual(plain(sorted(['captcha', 'antibot', 'fingerprint'])), ['hCaptcha', 'reCAPTCHA', 'DataDome', 'Cloudflare', 'Canvas']);
  assert.deepStrictEqual(plain(sorted(['fingerprint', 'captcha', 'antibot'])), ['Canvas', 'hCaptcha', 'reCAPTCHA', 'DataDome', 'Cloudflare']);
  // No saved order: the previous fixed order
  assert.deepStrictEqual(plain(DetectionUI.sortDetectionsByCategory.call({}, detections).map(d => d.name)),
    ['DataDome', 'Cloudflare', 'hCaptcha', 'reCAPTCHA', 'Canvas']);
});

test('"Highest confidence" lists the strongest first, ties in category order', () => {
  const detections = [
    { name: 'Canvas', category: 'fingerprint', confidence: 70 },
    { name: 'Cloudflare', category: 'antibot', confidence: 50 },
    { name: 'hCaptcha', category: 'captcha', confidence: 95 },
    { name: 'Screen', category: 'Fingerprinting', confidence: 50 },
    { name: 'DataDome', category: 'Anti-Bot', confidence: 90 }
  ];
  const ctxSort = { sortBy: 'confidence', categoryOrder: ['fingerprint', 'captcha', 'antibot'] };
  assert.deepStrictEqual(plain(DetectionUI.sortDetectionsByCategory.call(ctxSort, detections).map(d => d.name)),
    ['hCaptcha', 'DataDome', 'Canvas', 'Screen', 'Cloudflare']);
});

test('History items sort the same way through a picker and keep their stored index', () => {
  const stored = [
    { category: 'captcha', confidence: 10 },
    { category: 'fingerprint', confidence: 65 },
    { category: 'antibot', confidence: 20 }
  ];
  const entries = stored.map((detection, index) => ({ detection, index }));
  const order = (sort) => plain(DetectionUtils.sortDetections(entries, sort, e => e.detection).map(e => e.index));
  assert.deepStrictEqual(order(DetectionUtils.detectionSortOf()), [2, 0, 1]);
  assert.deepStrictEqual(order(DetectionUtils.detectionSortOf({ categoryOrder: ['fingerprint', 'captcha', 'antibot'] })), [1, 0, 2]);
  assert.deepStrictEqual(order(DetectionUtils.detectionSortOf({ sortBy: 'confidence' })), [1, 2, 0]);
  // Unknown values fall back to the category order
  assert.deepStrictEqual(plain(DetectionUtils.detectionSortOf({ sortBy: 'bogus' })), { sortBy: 'category', categoryOrder: ['antibot', 'captcha', 'fingerprint'] });
});

test('Settings Detection order saves the card order and the confidence switch', () => {
  const sctx = vm.createContext({ console, DetectionUtils, Logger: new Proxy({}, { get: () => () => {} }) });
  sctx.window = sctx; sctx.self = sctx;
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/settings/settings-ui.js'), 'utf8'), sctx, { filename: 'settings-ui.js' });
  const { SettingsUI } = sctx.self;
  const previous = { sortBy: 'category', categoryOrder: ['captcha', 'antibot', 'fingerprint'] };
  // Switch on: confidence first, the card order is kept for ties
  assert.deepStrictEqual(plain(SettingsUI.readDetectionSort('captcha,antibot,fingerprint', true, previous)), { sortBy: 'confidence', categoryOrder: ['captcha', 'antibot', 'fingerprint'] });
  // Cards reordered with the switch off
  assert.deepStrictEqual(plain(SettingsUI.readDetectionSort('fingerprint,captcha,antibot', false, previous)), { sortBy: 'category', categoryOrder: ['fingerprint', 'captcha', 'antibot'] });
  // Controls missing: the saved choice stays
  assert.deepStrictEqual(plain(SettingsUI.readDetectionSort(undefined, undefined, previous)), previous);
});

test('Settings shows a switch and one movable card per category instead of a list of orders', () => {
  const html = fs.readFileSync(path.join(root, 'sections/settings/settings.html'), 'utf8');
  assert.match(html, /<input type="checkbox" id="sortByConfidence">/);
  assert.match(html, /<ol id="categoryOrderList" class="category-order-list"/);
  assert.match(html, /<input type="hidden" id="categoryOrder">/);
  assert.doesNotMatch(html, /<select id="categoryOrder"/);
  const ui = fs.readFileSync(path.join(root, 'sections/settings/settings-ui.js'), 'utf8');
  assert.match(ui, /item\.draggable = true/);
  assert.match(ui, /data-move="-1"/);
  assert.match(ui, /data-move="1"/);
});
