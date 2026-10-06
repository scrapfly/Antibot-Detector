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
