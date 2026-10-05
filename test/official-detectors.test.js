const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Official detector = author "Scrapfly" AND an ID bundled in detectors/index.json.
// Official detectors can be deleted from their card; the deletion is remembered
// so Update does not bring them back, and "Restore official detectors" undoes
// it. Clear (custom only) and imports still never remove or overwrite them.

global.self = global;
global.Logger = { ui() {}, debug() {}, error() {}, warn() {}, storage() {} };

const DetectionUtils = require('../utils/detection-utils.js');
global.DetectionUtils = DetectionUtils;

const saved = [];
// Minimal chrome.storage.local for the deleted-official list
const local = {};
global.chrome = { storage: { local: {
  get: async (key) => ({ [key]: local[key] }),
  set: async (obj) => { Object.assign(local, JSON.parse(JSON.stringify(obj))); }
} }, runtime: { getURL: p => p } };

global.StorageManager = {
  saveToStorage: async (key, value) => { saved.push({ key, value: JSON.parse(JSON.stringify(value)) }); return true; }
};

const DetectorManager = require('../modules/detection/managers/detector-manager.js');

const index = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'detectors', 'index.json'), 'utf8'));
const BUNDLED_IDS = Object.values(index).flatMap(v => (v && Array.isArray(v.detectors)) ? v.detectors : []);

function makeManager() {
  const dm = new DetectorManager({ initialized: true });
  dm.detectors = {
    antibot: {
      'detect-akamai': { id: 'detect-akamai', name: 'Akamai', author: 'Scrapfly', enabled: true, detection: {} },
      'detect-my-rule': { id: 'detect-my-rule', name: 'My rule', author: 'Jane Doe', enabled: true, detection: {} },
      'detect-fake-official': { id: 'detect-fake-official', name: 'Fake', author: 'Scrapfly', enabled: true, detection: {} }
    },
    captcha: {
      'detect-hcaptcha': { id: 'detect-hcaptcha', name: 'hCaptcha', author: 'scrapfly ', enabled: false, detection: {} }
    }
  };
  return dm;
}

beforeEach(() => {
  saved.length = 0;
  for (const k of Object.keys(local)) delete local[k];
  DetectionUtils.setOfficialDetectorIds(BUNDLED_IDS);
});

test('bundled index contains the detectors the fixtures rely on', () => {
  assert.ok(BUNDLED_IDS.includes('detect-akamai'));
  assert.ok(BUNDLED_IDS.includes('detect-hcaptcha'));
  assert.ok(!BUNDLED_IDS.includes('detect-fake-official'));
});

test('isReservedAuthor matches "Scrapfly" in any case, ignoring surrounding whitespace', () => {
  for (const name of ['Scrapfly', 'scrapfly', 'SCRAPFLY', '  ScrapFly  ', '\tscrapfly\n']) {
    assert.strictEqual(DetectionUtils.isReservedAuthor(name), true, name);
  }
  for (const name of ['Scrapfly Team', 'scrap fly', '', null, undefined, 42]) {
    assert.strictEqual(DetectionUtils.isReservedAuthor(name), false, String(name));
  }
});

test('isOfficialDetector needs both the Scrapfly author and a bundled ID', () => {
  assert.strictEqual(DetectionUtils.isOfficialDetector({ id: 'detect-akamai', author: 'Scrapfly' }), true);
  assert.strictEqual(DetectionUtils.isOfficialDetector({ id: 'detect-akamai', author: ' SCRAPFLY ' }), true);
  // Spoofed author on a custom/imported ID
  assert.strictEqual(DetectionUtils.isOfficialDetector({ id: 'detect-fake-official', author: 'Scrapfly' }), false);
  // Bundled ID whose author was changed away from Scrapfly
  assert.strictEqual(DetectionUtils.isOfficialDetector({ id: 'detect-akamai', author: 'Jane Doe' }), false);
  assert.strictEqual(DetectionUtils.isOfficialDetector({ id: 'detect-akamai' }), false);
  assert.strictEqual(DetectionUtils.isOfficialDetector(null), false);
  assert.strictEqual(DetectionUtils.isOfficialDetector(undefined), false);
});

test('isOfficialDetector accepts an explicit ID list and fails closed with none registered', () => {
  const d = { id: 'detect-x', author: 'Scrapfly' };
  assert.strictEqual(DetectionUtils.isOfficialDetector(d, ['detect-x']), true);
  assert.strictEqual(DetectionUtils.isOfficialDetector(d, new Set(['detect-x'])), true);
  DetectionUtils.setOfficialDetectorIds([]);
  assert.strictEqual(DetectionUtils.isOfficialDetector({ id: 'detect-akamai', author: 'Scrapfly' }), false);
});

test('deleteDetector deletes an official detector and remembers it', async () => {
  const dm = makeManager();
  const result = await dm.deleteDetector('antibot', 'detect-akamai');
  assert.deepStrictEqual(result, { deleted: true, official: true, reason: null });
  assert.strictEqual(dm.detectors.antibot['detect-akamai'], undefined);
  assert.strictEqual(saved.length, 1);
  assert.deepStrictEqual(await DetectorManager.getDeletedOfficialIds(), ['detect-akamai']);
});

test('restoreOfficialDetectors reloads deleted official detectors and forgets the deletion', async () => {
  const dm = makeManager();
  dm.categoryManager = { getAllCategories: () => ({ antibot: { detectors: ['detect-akamai'] } }) };
  dm.loadDetectorFile = async (cat, id) => { dm.detectors[cat][id] = { id, name: 'Akamai', author: 'Scrapfly', enabled: true, detection: {} }; };
  await dm.deleteDetector('antibot', 'detect-akamai');
  assert.strictEqual(await dm.restoreOfficialDetectors(), 1);
  assert.ok(dm.detectors.antibot['detect-akamai']);
  assert.deepStrictEqual(await DetectorManager.getDeletedOfficialIds(), []);
  assert.strictEqual(await dm.restoreOfficialDetectors(), 0);
});

test('deleteDetector removes custom detectors, including ones spoofing the Scrapfly author', async () => {
  const dm = makeManager();
  assert.deepStrictEqual(await dm.deleteDetector('antibot', 'detect-my-rule'), { deleted: true, official: false, reason: null });
  assert.deepStrictEqual(await dm.deleteDetector('antibot', 'detect-fake-official'), { deleted: true, official: false, reason: null });
  // Custom deletions are not recorded as official ones
  assert.deepStrictEqual(await DetectorManager.getDeletedOfficialIds(), []);
  assert.strictEqual(dm.detectors.antibot['detect-my-rule'], undefined);
  assert.strictEqual(dm.detectors.antibot['detect-fake-official'], undefined);
  assert.strictEqual(saved.length, 2);
  assert.deepStrictEqual(await dm.deleteDetector('antibot', 'detect-missing'), { deleted: false, official: false, reason: 'not_found' });
});

test('clearCustomDetectors keeps every official detector and removes the rest', async () => {
  const dm = makeManager();
  const removed = await dm.clearCustomDetectors();
  assert.strictEqual(removed, 2);
  assert.deepStrictEqual(Object.keys(dm.detectors.antibot), ['detect-akamai']);
  assert.deepStrictEqual(Object.keys(dm.detectors.captcha), ['detect-hcaptcha']);
  assert.strictEqual(saved.length, 1);
  // Nothing left to clear: no save
  assert.strictEqual(await dm.clearCustomDetectors(), 0);
  assert.strictEqual(saved.length, 1);
});

test('importDetectors "replace all" keeps official detectors and never overwrites them', async () => {
  const dm = makeManager();
  const ok = await dm.importDetectors({
    detectors: {
      antibot: {
        'detect-akamai': { id: 'detect-akamai', name: 'Hijacked', author: 'Scrapfly', enabled: false, detection: {} },
        'detect-imported': { id: 'detect-imported', name: 'Imported', author: 'SCRAPFLY', detection: {} }
      }
    }
  }, false);
  assert.strictEqual(ok, true);
  // Official kept, content not replaced, only the enabled flag taken from the file
  assert.strictEqual(dm.detectors.antibot['detect-akamai'].name, 'Akamai');
  assert.strictEqual(dm.detectors.antibot['detect-akamai'].enabled, false);
  assert.ok(dm.detectors.captcha['detect-hcaptcha']);
  // Custom detectors replaced by the imported one
  assert.strictEqual(dm.detectors.antibot['detect-my-rule'], undefined);
  assert.ok(dm.detectors.antibot['detect-imported']);
  // Claiming the Scrapfly author does not make an imported detector official
  assert.strictEqual(DetectionUtils.isOfficialDetector(dm.detectors.antibot['detect-imported']), false);
  assert.deepStrictEqual(await dm.deleteDetector('antibot', 'detect-imported'), { deleted: true, official: false, reason: null });
});

test('importDetectors rejects files with no detectors', async () => {
  const dm = makeManager();
  assert.strictEqual(await dm.importDetectors(null, true), false);
  assert.strictEqual(await dm.importDetectors([], true), false);
  assert.strictEqual(await dm.importDetectors({ detectors: {} }, true), false);
  assert.strictEqual(saved.length, 0);
});

test('exportDetectors round-trips through importDetectors', async () => {
  const dm = makeManager();
  const exported = dm.exportDetectors();
  assert.ok(exported.detectors.antibot['detect-my-rule']);
  const other = makeManager();
  await other.clearCustomDetectors();
  assert.strictEqual(await other.importDetectors(exported, true), true);
  assert.ok(other.detectors.antibot['detect-my-rule']);
});
