const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// detection-utils.js attaches to `self` outside a window.
global.self = global;
require('../utils/detection-utils.js');
const DetectionUtils = global.DetectionUtils;

const colors = { low: '#low', medium: '#medium', high: '#high' };
const fingerprint = (name) => ({ name, category: 'Fingerprint', confidence: 80 });

test('badge colour follows the popup difficulty, not the detection count', () => {
  // Seven fingerprint-only detections: the popup shows "Baja", so the badge is low
  // even though the old count rule (>= 5) painted it high.
  const seven = Array.from({ length: 7 }, (_, i) => fingerprint(`FP ${i}`));
  assert.strictEqual(DetectionUtils.getDifficultyLevel(seven), 'Low');
  assert.strictEqual(DetectionUtils.getBadgeColor(seven, colors), '#low');

  const hard = [{ name: 'hCaptcha', category: 'CAPTCHA', confidence: 95 }];
  const expected = { Low: '#low', Medium: '#medium', High: '#high' }[DetectionUtils.getDifficultyLevel(hard)];
  assert.strictEqual(DetectionUtils.getBadgeColor(hard, colors), expected);
});

test('no badge setter derives its colour from the detection count', () => {
  const root = path.join(__dirname, '..');
  const files = ['background/utilities.js', 'background/handlers/messages-cache.js',
    'modules/detection/engine/detection-engine-manager.js', 'sections/settings/settings-runtime.js',
    'sections/detection/detection-actions.js', 'sections/detection/detection-ui.js'];
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!/detectionCount\s*>=\s*\d[^;]*badgeColors/.test(src), `${file} colours the badge by count`);
    assert.ok(!src.includes('getBadgeColorForCount'), `${file} uses the removed count helper`);
  }
});
