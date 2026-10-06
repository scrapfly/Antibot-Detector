const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// DetectionUtils.normalizeDifficulty accepts only Low, Medium and High; any
// other label is dropped and the category default shown instead, so a
// detector saying "Easy" or "Hard" silently displays as Medium.

const root = path.join(__dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'detectors/index.json'), 'utf8'));

test('every detector difficulty is one the extension understands', () => {
  for (const [category, entry] of Object.entries(index)) {
    for (const id of entry.detectors || []) {
      const detector = JSON.parse(fs.readFileSync(path.join(root, 'detectors', category, `${id}.json`), 'utf8'));
      assert.ok(['Low', 'Medium', 'High'].includes(detector.difficulty), `${id}: difficulty "${detector.difficulty}"`);
    }
  }
});
