const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// processDetectionData needs the Detection tab's own engine and detector
// manager. The slow-scan fallback (results arrive after the popup gave up
// waiting) passed window.detectionEngine / window.detectorManager, which are
// never set, and failed with "Cannot read properties of undefined (reading
// 'setDetectors')" exactly when there were results to show.

const root = path.join(__dirname, '..');
const files = ['sections/detection/detection-ui.js', 'sections/detection/detection-actions.js', 'sections/detection/detection.js'];

test('every processDetectionData caller passes the tab\'s own engine and detectors', () => {
  let calls = 0;
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of src.matchAll(/Detection\.processDetectionData\(\s*\{([\s\S]*?)\}/g)) {
      calls++;
      assert.match(match[1], /detectionEngine:\s*this\.detectionEngine/, `${file}: detectionEngine`);
      assert.match(match[1], /detectorManager:\s*this\.detectorManager/, `${file}: detectorManager`);
    }
    assert.doesNotMatch(src, /detectionEngine:\s*window\.detectionEngine|detectorManager:\s*window\.detectorManager/, file);
  }
  assert.ok(calls >= 4, `found ${calls} callers`);
});
