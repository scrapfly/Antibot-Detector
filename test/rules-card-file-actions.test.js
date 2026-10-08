const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// A Rules card's "⋯" menu: Export downloads just that detector in the same
// file format as Rules → Export, so the toolbar Import reads it back. The
// card menu has no Import of its own.

global.self = global;
global.Logger = { ui() {}, debug() {}, error() {}, warn() {}, storage() {} };
global.DetectionUtils = require('../utils/detection-utils.js');
global.StorageManager = { saveToStorage: async () => true };
global.chrome = { storage: { local: { get: async () => ({}), set: async () => {} } }, runtime: { getURL: p => p } };
const DetectorManager = require('../modules/detection/managers/detector-manager.js');

function makeManager() {
  const dm = new DetectorManager({ initialized: true });
  dm.detectors = {
    antibot: {
      'detect-my-rule': { id: 'detect-my-rule', name: 'My rule', author: 'Jane Doe', enabled: true, detection: {}, _searchStrings: ['x'] },
      'detect-other': { id: 'detect-other', name: 'Other', author: 'Jane Doe', enabled: true, detection: {} }
    }
  };
  return dm;
}

test('Export on a card holds only that detector, in the full-export format', () => {
  const dm = makeManager();
  const data = dm.exportDetector('antibot', 'detect-my-rule');
  assert.strictEqual(data.version, '1.0');
  assert.ok(!Number.isNaN(Date.parse(data.exportedAt)));
  assert.deepStrictEqual(Object.keys(data.detectors), ['antibot']);
  assert.deepStrictEqual(Object.keys(data.detectors.antibot), ['detect-my-rule']);
  assert.strictEqual(data.detectors.antibot['detect-my-rule']._searchStrings, undefined);
  assert.deepStrictEqual(dm.detectors.antibot['detect-my-rule']._searchStrings, ['x'], 'the stored detector is untouched');
  assert.strictEqual(dm.exportDetector('antibot', 'detect-missing'), null);
  assert.strictEqual(dm.exportDetector('captcha', 'detect-my-rule'), null);
});

test('the exported file imports back into another install', async () => {
  const data = JSON.parse(JSON.stringify(makeManager().exportDetector('antibot', 'detect-my-rule')));
  const target = new DetectorManager({ initialized: true });
  target.detectors = { antibot: { 'detect-kept': { id: 'detect-kept', name: 'Kept', author: 'Jane Doe', enabled: true, detection: {} } } };
  assert.strictEqual(await target.importDetectors(data, true), true);
  assert.deepStrictEqual(Object.keys(target.detectors.antibot).sort(), ['detect-kept', 'detect-my-rule']);
  assert.strictEqual(target.detectors.antibot['detect-my-rule'].name, 'My rule');
});

test('every card menu offers Export, and no Import', () => {
  const display = fs.readFileSync(path.join(__dirname, '..', 'sections/rules/rules-display.js'), 'utf8');
  assert.match(display, /class="rules-menu-item export-detector-btn"[^>]*data-detector-id=/);
  assert.doesNotMatch(display, /import-detector-btn/);
  assert.match(display, /\$\{fileItems\}\s*\$\{resetItem\}\s*\$\{deleteItem\}/);
  const handlers = fs.readFileSync(path.join(__dirname, '..', 'sections/rules/rules-handlers.js'), 'utf8');
  assert.doesNotMatch(handlers, /handleImportDetectorsFile/);
});
