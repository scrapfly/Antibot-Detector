const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.Logger = new Proxy({}, { get: () => () => {} });
global.DetectionUtils = require('../utils/detection-utils.js');
global.chrome = { runtime: { getManifest: () => ({ version: '2.8.6' }) } };
const DetectorManager = require('../modules/detection/rules/detector-manager.js');
const plain = value => JSON.parse(JSON.stringify(value));
let writes;
beforeEach(() => {
  writes = [];
  global.StorageManager = { saveToStorage: async (key, value) => { writes.push(plain(value)); return true; } };
  DetectionUtils.setOfficialDetectorIds(['detect-official']);
});
const definition = (id = 'detect-new', extra = {}) => ({ id, name: id, author: 'Custom author', detection: { cookie: [{ id: 'session', name: 'test-session', confidence: 50 }] }, ...extra });
function manager() {
  const dm = new DetectorManager({ initialized: true });
  dm.detectors = { antibot: { 'detect-kept': definition('detect-kept'), 'detect-official': definition('detect-official', { author: 'Scrapfly' }) } };
  return dm;
}

test('replace all rejects the entire import before deleting custom rules or changing official flags', async () => {
  const invalid = [null, [], 'broken', { detection: null }, definition('detect-bad', { detection: { cookie: 'broken' } }),
    definition('detect-bad', { detection: { cookie: [null] } }), definition('detect-bad', { detection: { cookie: [{ name: '(', nameRegex: true }] } }),
    definition('detect-bad', { minExtensionVersion: '99.0' }), definition('detect-bad', { enabled: 'false' }),
    definition('detect-bad', { combinations: [{ when: { pattern: 'missing' } }] }),
    // Values the engine reads as text (a number stops every scan) and logos that are markup
    definition('detect-bad', { detection: { cookie: [{ name: 'sess', value: 123 }] } }),
    definition('detect-bad', { detection: { payload: [{ text: 'x', urlPattern: 42 }] } }),
    definition('detect-bad', { detection: { payload: [{ text: 'x', methods: ['POST', 7] }] } }),
    definition('detect-bad', { icon: 5 }), definition('detect-bad', { icon: '<a href="https://x.test">Update</a>' }),
    definition('detect-bad', { customIcon: 'x" onerror="y' })];
  for (const bad of invalid) {
    const dm = manager();
    const before = plain(dm.detectors);
    const result = await dm.importDetectors({ detectors: { antibot: { 'detect-new': definition(), 'detect-bad': bad,
      'detect-official': definition('detect-official', { enabled: false }) } } }, false);
    assert.equal(result, false, JSON.stringify(bad));
    assert.deepEqual(dm.detectors, before);
  }
  assert.equal(writes.length, 0);
});

test('malformed category maps, duplicate IDs, and prototype keys cannot trigger replacement', async () => {
  for (const data of [{ detectors: [] }, { detectors: { antibot: [definition()] } },
    { detectors: { antibot: { 'detect-new': definition() }, captcha: { 'detect-new': definition() } } },
    JSON.parse('{"detectors":{"__proto__":{"detect-new":{"detection":{}}}}}')]) {
    const dm = manager();
    const before = plain(dm.detectors);
    assert.equal(await dm.importDetectors(data, false), false);
    assert.deepEqual(dm.detectors, before);
  }
  assert.equal(writes.length, 0);
});

test('valid bare legacy maps canonicalize IDs while preserving custom fields and combinations', async () => {
  const dm = manager();
  const source = { antibot: { legacy: definition('legacy', { enabled: false, difficulty: 'High', difficultyChosen: true,
    futureMetadata: { keep: ['unchanged'] }, nameI18n: { es: 'Mi regla' }, userModified: true,
    officialSnapshot: { version: '1.0', detection: {} }, combinations: [{ id: 'both', when: { all: [{ pattern: 'session' }, { not: { method: 'url' } }] } }] }) } };
  const before = plain(source);
  assert.equal(await dm.importDetectors(source, false), true);
  const imported = dm.detectors.antibot['detect-legacy'];
  assert.equal(imported.id, 'detect-legacy');
  for (const key of ['futureMetadata', 'nameI18n', 'combinations', 'detection', 'enabled', 'difficultyChosen']) {
    assert.deepEqual(imported[key], before.antibot.legacy[key], key);
  }
  // How a rule relates to Scrapfly's is this browser's to know, never a file's
  assert.equal(imported.userModified, undefined);
  assert.equal(imported.officialSnapshot, undefined);
  assert.deepEqual(source, before, 'admission does not mutate caller data');
  assert.equal(dm.detectors.antibot['detect-kept'], undefined);
  assert.ok(dm.detectors.antibot['detect-official']);
});

test('a failed import write keeps every live rule, and a retry can succeed', async () => {
  const dm = manager();
  const before = plain(dm.detectors);
  StorageManager.saveToStorage = async () => false;
  await assert.rejects(dm.importDetectors({ antibot: { 'detect-new': definition() } }, false), /returned false/);
  assert.deepEqual(dm.detectors, before);
  StorageManager.saveToStorage = async () => true;
  assert.equal(await dm.importDetectors({ antibot: { 'detect-new': definition() } }, false), true);
  assert.ok(dm.detectors.antibot['detect-new']);
});

test('every packaged definition passes import admission without losing its pattern and combination data', async () => {
  const dm = manager();
  const detectors = {};
  for (const category of ['antibot', 'captcha', 'fingerprint']) {
    detectors[category] = {};
    const dir = path.join(__dirname, '..', 'detectors', category);
    for (const file of fs.readdirSync(dir).filter(file => file.endsWith('.json'))) {
      const record = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      detectors[category][record.id] = record;
    }
  }
  assert.equal(await dm.importDetectors({ detectors }, true), true);
  for (const [category, records] of Object.entries(detectors)) {
    for (const [id, record] of Object.entries(records)) {
      assert.deepEqual(dm.detectors[category][id].detection, record.detection, id);
      assert.deepEqual(dm.detectors[category][id].combinations, record.combinations, id);
    }
  }
});


test('an import without an explicit enabled preference does not enable an official rule', async () => {
  const dm = manager();
  dm.detectors.antibot['detect-official'].enabled = false;
  assert.equal(await dm.importDetectors({ antibot: { 'detect-official': definition('detect-official') } }), true);
  assert.equal(dm.detectors.antibot['detect-official'].enabled, false);
});

test('a file cannot plant a Scrapfly rule under the id of an official rule the person deleted', async () => {
  const dm = manager();
  DetectionUtils.setOfficialDetectorIds(['detect-official', 'detect-cloudflare']);
  const forged = { antibot: { 'detect-cloudflare': definition('cloudflare', { id: 'detect-cloudflare', author: 'Scrapfly', version: '99.0',
    userModified: true, officialSnapshot: { version: '99.0', detection: {} }, dismissedVersion: '99.0' }) } };
  assert.equal(await dm.importDetectors(forged, true), true);
  const imported = dm.detectors.antibot['detect-cloudflare'];
  assert.ok(imported, 'kept as the person\'s own rule');
  assert.notEqual(String(imported.author || '').toLowerCase(), 'scrapfly');
  assert.equal(DetectionUtils.isOfficialDetector(imported), false, 'not shown as Scrapfly\'s');
  for (const field of ['userModified', 'officialSnapshot', 'dismissedVersion']) assert.equal(imported[field], undefined, field);
});

test('merge brings in the valid rules of a file and names the ones it leaves out; replace all still needs every rule valid', async () => {
  const file = { detectors: { antibot: { 'detect-new': definition(), 'detect-bad': definition('detect-bad', { name: 'Broken one', detection: { cookie: [{ name: 'cf_(', nameRegex: true }] } }) } } };
  const merged = manager();
  assert.equal(await merged.importDetectors(file, true), true);
  assert.ok(merged.detectors.antibot['detect-new']);
  assert.equal(merged.detectors.antibot['detect-bad'], undefined);
  assert.deepEqual(merged.lastImportSkipped, ['Broken one']);
  const replaced = manager();
  const before = plain(replaced.detectors);
  assert.equal(await replaced.importDetectors(file, false), false);
  assert.deepEqual(replaced.detectors, before, 'nothing deleted');
});

test('an import names the official rules it left as installed because the file holds other content, and stays silent when it is the same', async () => {
  const edited = manager();
  const changed = definition('detect-official', { author: 'Scrapfly', name: 'Official', detection: { cookie: [{ name: 'edited_cookie' }] } });
  assert.equal(await edited.importDetectors({ antibot: { 'detect-official': changed } }, true), true);
  assert.deepEqual(edited.lastImportKept, ['Official'], 'the edit is not applied, and the person is told');
  assert.notEqual(edited.detectors.antibot['detect-official'].detection.cookie[0].name, 'edited_cookie', 'official rules are still never overwritten');
  const same = manager();
  const installed = plain(same.detectors.antibot['detect-official']);
  assert.equal(await same.importDetectors({ antibot: { 'detect-official': { ...installed, enabled: false } } }, true), true);
  assert.deepEqual(same.lastImportKept, [], 'the same rule (only enabled differs) is not reported');
});

