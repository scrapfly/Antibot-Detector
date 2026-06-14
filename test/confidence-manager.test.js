const { test } = require('node:test');
const assert = require('node:assert');

const ConfidenceManager = require('../modules/detection/managers/confidence-manager.js');

test('calculateConfidence returns the max confidence of the matches', () => {
  const cm = new ConfidenceManager();
  assert.strictEqual(cm.calculateConfidence([{ confidence: 50 }, { confidence: 80 }, { confidence: 30 }]), 80);
});

test('calculateConfidence returns 0 for empty / missing matches', () => {
  const cm = new ConfidenceManager();
  assert.strictEqual(cm.calculateConfidence([]), 0);
  assert.strictEqual(cm.calculateConfidence(), 0);
});

test('dead calculationMethod field was removed (cleanup regression guard)', () => {
  const cm = new ConfidenceManager();
  assert.strictEqual('calculationMethod' in cm, false);
});
