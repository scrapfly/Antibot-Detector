const { test } = require('node:test');
const assert = require('node:assert/strict');

// The list of official rules the person deleted keeps Rules → Update from bringing them back. A read of it that fails is not an
// empty list: writing one more id (or the failed ones) over it would forget every other deletion.

const { storageWorld, plain } = require('./helpers/unreadable-storage');

const FILES = ['modules/core/constants.js', 'modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'modules/core/storage-manager.js',
  'utils/utils.js', 'modules/detection/managers/category-manager.js', 'modules/detection/rules/detector-schema.js',
  'modules/detection/rules/historical-migrations.js', 'modules/detection/rules/detector-manager.js'];
const KEY = 'scrapfly_deleted_official_detectors';

async function world(deleted) {
  const w = storageWorld({ store: { [KEY]: deleted }, files: [] });
  w.ctx.chrome.runtime.getManifest = () => ({ version: '3.1.6' });
  for (const file of FILES) w.run(file);
  const dm = new w.ctx.DetectorManager(new w.ctx.CategoryManager());
  await dm.initialize();
  w.writes.length = 0;
  return { ...w, dm };
}

test('deleting an official rule while the deleted list cannot be read keeps the rule and the list', async () => {
  const w = await world(['detect-f5']);
  w.state.failGet = (key) => key === KEY;
  await assert.rejects(w.dm.deleteDetector('antibot', 'detect-akamai'));
  assert.ok(w.dm.getDetector('antibot', 'detect-akamai'), 'the rule is still there');
  assert.deepEqual(plain(w.store[KEY]), ['detect-f5'], 'the list is what it was');
});

test('restoring official rules while the deleted list cannot be read does not empty the list', async () => {
  const w = await world(['detect-f5']);
  w.state.failGet = (key) => key === KEY;
  await w.dm.restoreOfficialDetectors().catch(() => {});
  assert.deepEqual(plain(w.store[KEY]), ['detect-f5'], 'the list is what it was');
});
