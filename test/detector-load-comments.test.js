const { test } = require('node:test');
const assert = require('node:assert/strict');

// A rule file someone added a comment to ("note": "hi" under detection) was accepted on import, then read as a
// damaged rule set on the next load, which reloaded the shipped rules and lost every custom one.

global.self = global;
global.Logger = new Proxy({}, { get: () => () => {} });
global.DetectionUtils = require('../utils/detection-utils.js');
const DetectorManager = require('../modules/detection/rules/detector-manager.js');

test('text under a rule\'s detection is dropped on load; the custom rules stay', async () => {
  const stored = { detectors: { antibot: { 'detect-mine': { id: 'detect-mine', name: 'Mine', author: 'Me', version: '1.0',
    detection: { cookie: [{ name: 'mine_cookie' }], note: 'hi', future: [{ x: 1 }] } } } } };
  let reloadedShipped = false;
  global.StorageManager = { batchLoadStorage: async () => ({ scrapfly_detectors: JSON.parse(JSON.stringify(stored)) }), saveToStorage: async () => true };
  const dm = new DetectorManager({ initialized: true });
  dm.loadDetectorsFromIndex = async () => { reloadedShipped = true; };
  dm.saveDetectorsToStorage = async () => true;
  dm.categoryManager = { categories: {} };
  await dm.loadFromStorage();
  assert.equal(reloadedShipped, false, 'not treated as damage');
  const mine = dm.detectors.antibot['detect-mine'];
  assert.deepEqual(mine.detection.cookie, [{ name: 'mine_cookie' }].map(r => ({ ...mine.detection.cookie[0], ...r })));
  assert.equal(mine.detection.note, undefined);
  assert.deepEqual(mine.detection.future, [{ x: 1 }], 'a method of a newer build is kept');
});

test('a known method stored as text is still the old damage, and is repaired from the shipped rules', async () => {
  const stored = { detectors: { antibot: { 'detect-mine': { id: 'detect-mine', name: 'Mine', detection: { cookie: '[{"name":"x"}]' } } } } };
  let reloadedShipped = false;
  global.StorageManager = { batchLoadStorage: async () => ({ scrapfly_detectors: stored }), saveToStorage: async () => true };
  const dm = new DetectorManager({ initialized: true });
  dm.loadDetectorsFromIndex = async () => { reloadedShipped = true; };
  dm.saveDetectorsToStorage = async () => true;
  dm.categoryManager = { categories: {} };
  await dm.loadFromStorage();
  assert.equal(reloadedShipped, true);
});
