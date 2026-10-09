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
const plain = (value) => JSON.parse(JSON.stringify(value));

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

// The packaged index the restore reads ({category: {detectors: [ids]}})
const packagedIndex = (categories) => ({ getAllCategories: () => categories });
const loads = (dm, names, fail = []) => async (cat, id) => {
  if (fail.includes(id)) throw new Error('broken file');
  dm.detectors[cat][id] = { id, name: names[id] || id, author: 'Scrapfly', enabled: true, detection: {} };
};

test('restoreOfficialDetectors reloads deleted official detectors and forgets the deletion', async () => {
  const dm = makeManager();
  dm.categoryManager = packagedIndex({ antibot: { detectors: ['detect-akamai'] } });
  dm.loadDetectorFile = loads(dm, { 'detect-akamai': 'Akamai' });
  await dm.deleteDetector('antibot', 'detect-akamai');
  const result = await dm.restoreOfficialDetectors();
  assert.deepStrictEqual(plain(result), { restored: [{ id: 'detect-akamai', name: 'Akamai', source: 'package' }], failed: [], updateOnly: [] });
  assert.ok(dm.detectors.antibot['detect-akamai']);
  assert.deepStrictEqual(await DetectorManager.getDeletedOfficialIds(), []);
  assert.deepStrictEqual(plain(await dm.restoreOfficialDetectors()), { restored: [], failed: [], updateOnly: [] });
});

test('restoreOfficialDetectors restores the others when one fails, and keeps the failed one to retry', async () => {
  const dm = makeManager();
  dm.categoryManager = packagedIndex({ antibot: { detectors: ['detect-akamai', 'detect-f5'] } });
  dm.detectors.antibot['detect-f5'] = { id: 'detect-f5', name: 'F5', author: 'Scrapfly', enabled: true, detection: {} };
  await dm.deleteDetector('antibot', 'detect-akamai');
  await dm.deleteDetector('antibot', 'detect-f5');
  dm.loadDetectorFile = loads(dm, { 'detect-f5': 'F5' }, ['detect-akamai']);
  const result = await dm.restoreOfficialDetectors();
  assert.deepStrictEqual(result.restored.map(d => d.id), ['detect-f5']);
  assert.deepStrictEqual(plain(result.failed), ['detect-akamai']);
  assert.ok(dm.detectors.antibot['detect-f5']);
  assert.deepStrictEqual(await DetectorManager.getDeletedOfficialIds(), ['detect-akamai']);
});

test('restore brings back an official detector that is missing without a recorded deletion', async () => {
  // Builds before 2.8 deleted official detectors without recording it
  const dm = makeManager();
  dm.categoryManager = packagedIndex({ antibot: { detectors: ['detect-akamai', 'detect-datadome'] }, captcha: { detectors: ['detect-hcaptcha'] } });
  dm.loadDetectorFile = loads(dm, { 'detect-datadome': 'DataDome' });
  const found = await dm.getMissingOfficialDetectors();
  assert.deepStrictEqual(plain(found.missing.map(d => [d.category, d.id, d.packaged, d.inRelease])), [['antibot', 'detect-datadome', true, false]]);
  const result = await dm.restoreOfficialDetectors(found);
  assert.deepStrictEqual(plain(result.restored), [{ id: 'detect-datadome', name: 'DataDome', source: 'package' }]);
  assert.ok(dm.detectors.antibot['detect-datadome']);
});

test('a missing detector that fails to load is not recorded as deleted, so Update can still add it', async () => {
  const dm = makeManager();
  dm.categoryManager = packagedIndex({ antibot: { detectors: ['detect-datadome'] } });
  dm.loadDetectorFile = loads(dm, {}, ['detect-datadome']);
  const result = await dm.restoreOfficialDetectors();
  assert.deepStrictEqual(plain(result.failed), ['detect-datadome']);
  assert.deepStrictEqual(await DetectorManager.getDeletedOfficialIds(), []);
});

test('without a release, a deleted detector only Update provides is un-deleted for Update', async () => {
  const dm = makeManager();
  dm.categoryManager = packagedIndex({ antibot: { detectors: ['detect-akamai'] } });
  let loaded = 0;
  dm.loadDetectorFile = async () => { loaded++; };
  await DetectorManager.markOfficialDeleted('detect-new-vendor', true);
  const found = await dm.getMissingOfficialDetectors();
  assert.deepStrictEqual(plain(found), { missing: [], updateOnly: ['detect-new-vendor'] });
  const result = await dm.restoreOfficialDetectors(found);
  assert.strictEqual(loaded, 0);
  assert.deepStrictEqual(plain(result.updateOnly), ['detect-new-vendor']);
  assert.deepStrictEqual(await DetectorManager.getDeletedOfficialIds(), []);
});

test('with a release, detectors come from GitHub, and the package is the fallback', async () => {
  const dm = makeManager();
  dm.categoryManager = packagedIndex({ antibot: { detectors: ['detect-akamai', 'detect-datadome', 'detect-f5'] } });
  dm.loadDetectorFile = loads(dm, { 'detect-f5': 'F5 (packaged)' });
  await DetectorManager.markOfficialDeleted('detect-new-vendor', true);
  await DetectorManager.markOfficialDeleted('detect-akamai', true);
  delete dm.detectors.antibot['detect-akamai'];
  const release = { tag: 'v9.9.9', index: {
    antibot: { detectors: ['detect-akamai', 'detect-datadome', 'detect-f5', 'detect-new-vendor', 'detect-never-installed'] } } };
  const found = await dm.getMissingOfficialDetectors(release);
  // A release-only detector the user never had is an update, not a restore
  assert.deepStrictEqual(found.missing.map(d => d.id).sort(), ['detect-akamai', 'detect-datadome', 'detect-f5', 'detect-new-vendor']);
  assert.deepStrictEqual(plain(found.updateOnly), []);
  const fetched = [];
  const result = await dm.restoreOfficialDetectors(found, {
    fetchReleased: async (category, id) => {
      fetched.push(id);
      if (id === 'detect-f5') return null; // e.g. needs a newer extension
      return { id, name: `${id} (release)`, author: 'Scrapfly', version: '9.9.9', detection: {} };
    }
  });
  const by = Object.fromEntries(result.restored.map(d => [d.id, d.source]));
  assert.deepStrictEqual(by, { 'detect-akamai': 'release', 'detect-datadome': 'release', 'detect-f5': 'package', 'detect-new-vendor': 'release' });
  assert.strictEqual(dm.detectors.antibot['detect-akamai'].version, '9.9.9');
  assert.strictEqual(dm.detectors.antibot['detect-f5'].name, 'F5 (packaged)');
  assert.deepStrictEqual(await DetectorManager.getDeletedOfficialIds(), []);
  // Restored from the release only: remembered as official, like an Update install
  assert.deepStrictEqual(local[DetectorManager.REMOTE_OFFICIAL_KEY], ['detect-new-vendor']);
});

test('nothing is missing when every packaged detector is installed', async () => {
  const dm = makeManager();
  dm.categoryManager = packagedIndex({ antibot: { detectors: ['detect-akamai'] }, captcha: { detectors: ['detect-hcaptcha'] } });
  assert.deepStrictEqual(plain(await dm.getMissingOfficialDetectors()), { missing: [], updateOnly: [] });
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
