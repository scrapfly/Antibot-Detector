const { test } = require('node:test');
const assert = require('node:assert/strict');

// Settings → Data → Back up everything names the official rules the person switched off, so that a restore switches them off
// again. It used to hold their whole records: Scrapfly's rule as this build has it. On a build whose schema refuses such a record
// (a rule that needs a newer extension, a field it does not know), a restore with Replace refused the whole rules part, the
// person's own rules included. Now the file holds a stub, {id, enabled: false}; the restore applies it to an installed official
// rule of that id and ignores it otherwise, and a stub never makes a rule. A backup of a 3.1.4 development build, which holds the
// full records, is read the same way.

const { storageWorld, read, plain } = require('./helpers/unreadable-storage');
global.self = global;
require('../modules/core/categories.js');
require('../modules/core/domain-list.js');
require('../modules/core/scan-scope.js');
require('../modules/settings/settings-transfer.js');
const B = require('../modules/settings/backup-bundle.js');

const realIndex = JSON.parse(read('detectors/index.json'));
const SHIPPED = { antibot: ['detect-akamai'], captcha: ['detect-hcaptcha'], fingerprint: ['detect-canvas-fingerprint'] };
const INDEX = { ...realIndex };
for (const [category, ids] of Object.entries(SHIPPED)) INDEX[category] = { ...realIndex[category], detectors: ids };
const FILES = ['modules/core/constants.js', 'modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'modules/core/storage-manager.js',
  'utils/utils.js', 'modules/detection/managers/category-manager.js', 'modules/detection/rules/detector-schema.js',
  'modules/detection/rules/historical-migrations.js', 'modules/detection/rules/detector-manager.js'];

const MINE = { id: 'detect-mine', name: 'Mine', author: 'Me', version: '1.0.1', category: 'Anti-Bot', enabled: true, difficulty: 'Medium',
  detection: { cookie: [{ id: 'mine-cookie', name: 'mine_cookie', confidence: 80 }] } };
const OLD_MINE = { ...MINE, id: 'detect-old-mine', name: 'Old mine' };

/** The person's browser: the shipped rules installed, and one rule of their own that Replace will remove. */
async function installed() {
  const w = storageWorld({ store: {}, files: [], index: INDEX });
  w.ctx.chrome.runtime.getManifest = () => ({ version: '3.1.4' });
  for (const file of FILES) w.run(file);
  const dm = new w.ctx.DetectorManager(new w.ctx.CategoryManager());
  await dm.initialize();
  assert.equal(await dm.addDetector('antibot', OLD_MINE.id, plain(OLD_MINE)), true);
  return { w, dm, enabled: (id) => (dm.findDetectorById(id) || {}).enabled, ids: () => Object.values(dm.detectors).flatMap(r => Object.keys(r)).sort() };
}

const backupOf = (detectors) => ({ version: '1.0', detectors });
const officialRecord = (category, id) => JSON.parse(read(`detectors/${category}/${id}.json`));

// ---- Back up

test('Back up names a switched-off official rule by id only; the person\'s own rules are whole; an official rule that is on is left out', () => {
  const isOfficial = (d) => d.author === 'Scrapfly';
  const exported = { version: '1.0', detectors: {
    antibot: { 'detect-akamai': { ...officialRecord('antibot', 'detect-akamai'), author: 'Scrapfly', enabled: false }, 'detect-mine': plain(MINE) },
    captcha: { 'detect-hcaptcha': { ...officialRecord('captcha', 'detect-hcaptcha'), author: 'Scrapfly', enabled: true } }
  } };
  const kept = B.customOnly(exported, isOfficial);
  assert.deepEqual(plain(kept.detectors), { antibot: { 'detect-akamai': { id: 'detect-akamai', enabled: false }, 'detect-mine': plain(MINE) } });
  assert.equal(B.isStateStub(kept.detectors.antibot['detect-akamai']), true);
  assert.equal(B.isStateStub(MINE), false);
});

test('"Your rules ({0})" counts the person\'s own rules only: a stub is never one, whoever is asked', () => {
  const bundle = { format: 'scrapfly-backup', version: 1, detectors: backupOf({ antibot: { 'detect-akamai': { id: 'detect-akamai', enabled: false }, 'detect-mine': plain(MINE) } }) };
  for (const isOfficial of [undefined, (d) => d.author === 'Scrapfly']) {
    const summary = B.summarize(bundle, isOfficial);
    assert.equal(summary.rules, 1);
    assert.equal(summary.ruleRecords, 2, 'and the file has a rules part to restore');
  }
  const switchesOnly = B.parse(JSON.stringify({ format: 'scrapfly-backup', version: 1, detectors: backupOf({ antibot: { 'detect-akamai': { id: 'detect-akamai', enabled: false } } }) }));
  assert.equal(switchesOnly.ok, true);
  assert.deepEqual([switchesOnly.summary.rules, switchesOnly.summary.ruleRecords], [0, 1]);
});

// ---- Restore

test('Restore with Replace: a stub switches the installed official rule off, the person\'s rules come in, and nothing else', async () => {
  const h = await installed();
  const file = backupOf({ antibot: { 'detect-akamai': { id: 'detect-akamai', enabled: false }, 'detect-mine': plain(MINE) } });
  assert.equal(await h.dm.importDetectors(file, false, { officialStates: true }), true);
  assert.equal(h.enabled('detect-akamai'), false, 'switched off again');
  assert.equal(h.dm.findDetectorById('detect-akamai').name, officialRecord('antibot', 'detect-akamai').name, 'and still Scrapfly\'s rule');
  assert.ok(h.dm.findDetectorById('detect-mine'));
  assert.equal(h.dm.findDetectorById('detect-old-mine'), null, 'Replace removed the rule of their own that the file does not hold');
  assert.equal(h.w.store.scrapfly_detectors.detectors.antibot['detect-akamai'].enabled, false, 'saved');
});

test('a stub never makes a rule: not for an id this build does not ship, a deleted official rule, or a rule of the person\'s own', async () => {
  const h = await installed();
  delete h.dm.detectors.captcha['detect-hcaptcha']; // deleted by the person
  const before = h.ids();
  const file = backupOf({ antibot: { 'detect-newer': { id: 'detect-newer', enabled: false }, 'detect-old-mine': { id: 'detect-old-mine', enabled: false } },
    captcha: { 'detect-hcaptcha': { id: 'detect-hcaptcha', enabled: false } } });
  assert.equal(await h.dm.importDetectors(file, true, { officialStates: true }), true, 'a file of switches only is a restore that worked');
  assert.deepEqual(h.ids(), before, 'no rule was made');
  assert.equal(h.enabled('detect-old-mine'), true, 'a stub does not switch a rule of the person\'s own');
  // The same stubs in a Rules → Import file
  assert.equal(await h.dm.importDetectors(file, true), true);
  assert.deepEqual(h.ids(), before);
});

test('a 3.1.4 development backup with full official records: one this build\'s schema refuses does not fail the Replace restore', async () => {
  const h = await installed();
  const newer = { ...officialRecord('antibot', 'detect-akamai'), author: 'Scrapfly', enabled: false, minExtensionVersion: '99.0' };
  const file = backupOf({ antibot: { 'detect-akamai': newer, 'detect-mine': plain(MINE) },
    captcha: { 'detect-hcaptcha': { ...officialRecord('captcha', 'detect-hcaptcha'), author: 'Scrapfly', enabled: false } } });
  assert.equal(await h.dm.importDetectors(file, false, { officialStates: true }), true, 'the rules part is restored');
  assert.equal(h.enabled('detect-akamai'), false);
  assert.equal(h.enabled('detect-hcaptcha'), false);
  assert.notEqual(h.dm.findDetectorById('detect-akamai').minExtensionVersion, '99.0', 'read as a switch: the installed rule is unchanged');
  assert.ok(h.dm.findDetectorById('detect-mine'));
  // A full official record of an id not installed is a switch too: it makes nothing
  delete h.dm.detectors.captcha['detect-hcaptcha'];
  assert.equal(await h.dm.importDetectors(backupOf({ captcha: { 'detect-hcaptcha': { ...officialRecord('captcha', 'detect-hcaptcha'), author: 'Scrapfly', enabled: false } } }), true, { officialStates: true }), true);
  assert.equal(h.dm.findDetectorById('detect-hcaptcha'), null);
});

test('Rules → Import reads a full official record as it always did: its on/off state, and the file is still checked', async () => {
  const h = await installed();
  const file = backupOf({ antibot: { 'detect-akamai': { ...officialRecord('antibot', 'detect-akamai'), author: 'Scrapfly', enabled: false } } });
  assert.equal(await h.dm.importDetectors(file, true), true);
  assert.equal(h.enabled('detect-akamai'), false);
  assert.equal(await h.dm.importDetectors({ detectors: {} }, true), false, 'a file with nothing in it is still refused');
});

test('the restore asks for official records to be read as switches', () => {
  assert.match(read('sections/settings/settings-ui-backup.js'), /importDetectors\(bundle\.detectors, choice\.mode === 'merge', \{ officialStates: true \}\)/);
});
