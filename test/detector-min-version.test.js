const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Rules → Update serves detectors/ to every installed version: 2.8.3 and
// later from the latest GitHub release, older builds from main. Detectors in
// the 2.8 format (combinations, standalone:false weak signals) misfire on the
// 2.7 engine, which scores each signal alone; the 2.7 updater skips files
// whose minExtensionVersion is newer than itself. Every detector must
// therefore declare at least 2.8 (BYT-1593).

const root = path.join(__dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'detectors/index.json'), 'utf8'));

const atLeast = (version, min) => {
  const a = String(version).split('.').map(n => parseInt(n, 10) || 0);
  const b = String(min).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
};

test('every detector requires an extension that understands its format (>= 2.8)', () => {
  let checked = 0;
  for (const [category, entry] of Object.entries(index)) {
    for (const id of entry.detectors || []) {
      const detector = JSON.parse(fs.readFileSync(path.join(root, 'detectors', category, `${id}.json`), 'utf8'));
      assert.ok(detector.minExtensionVersion, `${id}: minExtensionVersion missing`);
      assert.ok(atLeast(detector.minExtensionVersion, '2.8'), `${id}: minExtensionVersion ${detector.minExtensionVersion} < 2.8`);
      checked++;
    }
  }
  assert.ok(checked > 0);
});

test('this build accepts every detector it ships', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const [category, entry] of Object.entries(index)) {
    for (const id of entry.detectors || []) {
      const detector = JSON.parse(fs.readFileSync(path.join(root, 'detectors', category, `${id}.json`), 'utf8'));
      assert.ok(atLeast(manifest.version, detector.minExtensionVersion),
        `${id}: needs ${detector.minExtensionVersion}, manifest is ${manifest.version}`);
    }
  }
});
