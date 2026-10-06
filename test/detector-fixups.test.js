const { test } = require('node:test');
const assert = require('node:assert');

// applyDetectorFixups heals detector copies persisted in storage, which keep
// the rules they were saved with even after the packaged files are fixed.
// GitHub issue #4: v2.1 shipped Shape Security's dynamic header patterns
// unanchored, so "x-datadome-cid" matched x-[a-z0-9]{8}-c and a DataDome
// header showed up as a 95% Shape detection.

global.self = global;
global.Logger = { ui() {}, debug() {}, error() {}, warn() {}, storage() {} };

const DetectorManager = require('../modules/detection/managers/detector-manager.js');

const shapeWithHeaderRules = (names) => ({
  id: 'detect-shapesecurity',
  name: 'Shape Security',
  detection: { header: names.map(name => ({ name, nameRegex: true, confidence: 95 })) }
});

test('legacy unanchored Shape header patterns are anchored on load', () => {
  const detector = shapeWithHeaderRules(['x-[a-z0-9]{8}-c', ' x-[a-z0-9]{8}-a ']);
  DetectorManager.applyDetectorFixups(detector, { source: 'storage' });
  assert.deepStrictEqual(
    detector.detection.header.map(r => r.name),
    ['^x-[a-z0-9]{8}-c$', '^x-[a-z0-9]{8}-a$']
  );
});

test('already-anchored and unrelated Shape rules are left alone', () => {
  const detector = shapeWithHeaderRules(['^x-[a-z0-9]{8}-c$', '^server$', 'x-frame-options']);
  DetectorManager.applyDetectorFixups(detector, { source: 'storage' });
  assert.deepStrictEqual(
    detector.detection.header.map(r => r.name),
    ['^x-[a-z0-9]{8}-c$', '^server$', 'x-frame-options']
  );
});

test('the anchored pattern no longer matches the DataDome header, the legacy one did', () => {
  const headerName = 'x-datadome-cid';
  assert.ok(new RegExp('x-[a-z0-9]{8}-c').test(headerName), 'legacy unanchored pattern matches (the bug)');
  assert.ok(!new RegExp('^x-[a-z0-9]{8}-c$').test(headerName), 'anchored pattern does not match');
});

test('the fixup also runs through normalizeDetectorSchema for stored detectors', () => {
  const detector = shapeWithHeaderRules(['x-[a-z0-9]{8}-f']);
  const normalized = DetectorManager.normalizeDetectorSchema(detector, {
    categoryName: 'antibot',
    detectorName: 'detect-shapesecurity',
    source: 'storage'
  });
  assert.strictEqual(normalized.detection.header[0].name, '^x-[a-z0-9]{8}-f$');
});

test('other detectors keep their header rules untouched', () => {
  const detector = {
    id: 'detect-other',
    name: 'Other',
    detection: { header: [{ name: 'x-[a-z0-9]{8}-c', nameRegex: true, confidence: 95 }] }
  };
  DetectorManager.applyDetectorFixups(detector, { source: 'storage' });
  assert.strictEqual(detector.detection.header[0].name, 'x-[a-z0-9]{8}-c');
});
