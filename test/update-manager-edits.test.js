const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Rules → Update and the extension-update merge must never silently replace
// an official rule the user edited (BYT-1593): it stays pending until the user
// keeps their edits or takes the new version. Edits keep the official version
// number, stale pending entries are dropped, and a check that could not
// compare is an error, not "up to date".

const root = path.join(__dirname, '..');

global.self = global;
global.Logger = { ui() {}, debug() {}, error() {}, warn() {}, storage() {} };
const DetectorManager = require('../modules/detection/managers/detector-manager.js');

function load(local, { remote = {}, bundled = {}, bundledIndex = null } = {}) {
  const messages = [];
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Date, Math, Set, Map, Object, Array, Error,
    Logger: new Proxy({}, { get: () => () => {} }),
    Constants: { UPDATE_CHECK_TIMEOUT: 30000, DEFAULT_CACHE_EXPIRY_HOURS: 12 },
    Utils: { getSettings: async () => ({ updates: { autoUpdate: true } }) },
    StorageManager: {
      normalizeStoredValue: async (_k, v) => (typeof v === 'string' ? JSON.parse(v) : v),
      saveToStorage: async (key, value) => { local[key] = JSON.parse(JSON.stringify(value)); return true; },
      saveSettings: async () => true
    },
    fetch: async (url) => {
      const json = url === 'ext://detectors/index.json' ? bundledIndex : bundled[url];
      return json ? { ok: true, json: async () => JSON.parse(JSON.stringify(json)) } : { ok: false, status: 404 };
    },
    chrome: {
      runtime: {
        getManifest: () => ({ version: '2.8.1' }),
        getURL: (p) => `ext://${p}`,
        sendMessage: (msg, cb) => { messages.push(msg); if (cb) cb(); }
      },
      storage: { local: {
        get: async (keys) => { const o = {}; for (const k of [].concat(keys)) if (k in local) o[k] = local[k]; return o; },
        set: async (obj) => { Object.assign(local, JSON.parse(JSON.stringify(obj))); },
        remove: async (keys) => { for (const k of [].concat(keys)) delete local[k]; }
      } }
    }
  };
  ctx.self = ctx;
  ctx.window = {}; // popup context: reloads go through RELOAD_DETECTORS
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/core/update-manager.js'), 'utf8'), ctx);
  const UM = ctx.UpdateManager;
  // GitHub stand-in: the latest release and its index (tests may override)
  UM.fetchLatestRelease = async () => ({ tag: 'v9.9.9' });
  UM.fetchRemoteIndex = async () => index;
  UM.fetchRemoteDetector = async (_cat, id) => (remote[id] ? JSON.parse(JSON.stringify(remote[id])) : null);
  return { UM, messages };
}

// Values created inside the vm context have that context's prototypes
const plain = (v) => JSON.parse(JSON.stringify(v));
const official = (id, version, extra = {}) => ({ id, name: id, version, author: 'Scrapfly', detection: { cookie: [{ name: `${id}-v${version}` }] }, ...extra });
const stored = (local) => local.scrapfly_detectors.detectors.antibot;
const index = { antibot: { detectors: ['detect-akamai', 'detect-cloudflare'] } };

// ------------------------------------------------------------- editor helpers
test('editing an official rule keeps its official version and a snapshot to reset to', () => {
  const original = official('detect-akamai', '2.0.0', { enabled: false, displayName: 'Akamai' });
  const edited = { ...original, version: '2.0.0', detection: { cookie: [{ name: 'mine' }] } };
  DetectorManager.markUserEdited(edited, original);
  assert.strictEqual(edited.userModified, true);
  assert.strictEqual(edited.version, '2.0.0', 'no local version bump');
  assert.deepStrictEqual(edited.officialSnapshot.detection, original.detection);
  assert.ok(!('displayName' in edited.officialSnapshot), 'UI-only fields are not part of the snapshot');

  // A second edit keeps the first official snapshot
  const again = { ...edited, detection: { cookie: [{ name: 'mine-2' }] } };
  DetectorManager.markUserEdited(again, edited);
  assert.deepStrictEqual(again.officialSnapshot.detection, original.detection);

  const reset = DetectorManager.officialVersionOf({ ...again, enabled: false, difficulty: 'Hard' });
  assert.deepStrictEqual(reset.detection, original.detection);
  assert.strictEqual(reset.enabled, false, 'on/off choice kept');
  assert.strictEqual(reset.difficulty, 'Hard');
  assert.ok(!reset.userModified && !reset.officialSnapshot);
  assert.strictEqual(DetectorManager.officialVersionOf(original), null, 'nothing to reset on an unedited rule');
});

test('custom rule versions bump as semver and never go backwards', () => {
  assert.strictEqual(DetectorManager.bumpVersion('1.0'), '1.0.1');
  assert.strictEqual(DetectorManager.bumpVersion('1.2.9'), '1.2.10');
  assert.strictEqual(DetectorManager.bumpVersion(undefined), '1.0.1');
  const { UM } = load({});
  assert.ok(UM.isNewerVersion(DetectorManager.bumpVersion('1.9'), '1.9'));
  assert.ok(UM.isNewerVersion(DetectorManager.bumpVersion('1.10'), '1.10'), 'the old parseFloat bump turned 1.10 into 1.2');
});

// ------------------------------------------------------------------- updater
test('an update never replaces an edited rule without asking; unedited rules update and reload', async () => {
  const edited = DetectorManager.markUserEdited(
    { ...official('detect-akamai', '2.0.0'), detection: { cookie: [{ name: 'mine' }] } },
    official('detect-akamai', '2.0.0'));
  const local = { scrapfly_detectors: { detectors: { antibot: {
    'detect-akamai': edited,
    'detect-cloudflare': official('detect-cloudflare', '1.0.0', { enabled: false })
  } } } };
  const { UM, messages } = load(local, { remote: {
    'detect-akamai': official('detect-akamai', '2.1.0'),
    'detect-cloudflare': official('detect-cloudflare', '1.1.0')
  } });
  UM.fetchRemoteIndex = async () => index;

  const check = await UM.checkForUpdates(true);
  assert.strictEqual(check.error, null);
  const akamai = check.updates.find(u => u.id === 'detect-akamai');
  assert.strictEqual(akamai.userModified, true);
  assert.strictEqual(akamai.localVersion, '2.0.0');

  const result = await UM.applyUpdates();
  assert.strictEqual(result.count, 1);
  assert.deepStrictEqual(plain(result.needsDecision.map(u => u.id)), ['detect-akamai']);
  assert.deepStrictEqual(stored(local)['detect-akamai'].detection, { cookie: [{ name: 'mine' }] }, 'edits kept');
  assert.strictEqual(stored(local)['detect-cloudflare'].version, '1.1.0');
  assert.strictEqual(stored(local)['detect-cloudflare'].enabled, false, 'user toggle kept');
  assert.deepStrictEqual(plain(local.scrapfly_pending_updates.map(u => u.id)), ['detect-akamai'], 'still pending');
  assert.ok(messages.some(m => m.type === 'RELOAD_DETECTORS'), 'running detection reloads');
});

test('"Use new version" replaces the edited rule; "Keep my edits" stops offering that version only', async () => {
  const mk = () => DetectorManager.markUserEdited(
    { ...official('detect-akamai', '2.0.0'), detection: { cookie: [{ name: 'mine' }] } },
    official('detect-akamai', '2.0.0'));
  const pending = [{ id: 'detect-akamai', category: 'antibot', remoteVersion: '2.1.0', userModified: true }];

  // Use new version
  let local = { scrapfly_detectors: { detectors: { antibot: { 'detect-akamai': mk() } } }, scrapfly_pending_updates: pending };
  let { UM } = load(local, { remote: { 'detect-akamai': official('detect-akamai', '2.1.0') } });
  const replaced = await UM.applyUpdates({ ids: ['detect-akamai'], overwriteModified: true });
  assert.strictEqual(replaced.count, 1);
  assert.strictEqual(stored(local)['detect-akamai'].version, '2.1.0');
  assert.ok(!stored(local)['detect-akamai'].userModified, 'the rule is official again');
  assert.strictEqual(local.scrapfly_pending_updates, undefined);

  // Keep my edits
  local = { scrapfly_detectors: { detectors: { antibot: { 'detect-akamai': mk() } } }, scrapfly_pending_updates: pending };
  ({ UM } = load(local, { remote: { 'detect-akamai': official('detect-akamai', '2.1.0') } }));
  assert.strictEqual(await UM.keepUserEdits(['detect-akamai']), 1);
  assert.strictEqual(stored(local)['detect-akamai'].dismissedVersion, '2.1.0');
  assert.deepStrictEqual(stored(local)['detect-akamai'].detection, { cookie: [{ name: 'mine' }] });
  assert.strictEqual(local.scrapfly_pending_updates, undefined);
  assert.deepStrictEqual(plain((await UM.compareVersions(index)).updates), [], 'the declined version is not offered again');

  ({ UM } = load(local, { remote: { 'detect-akamai': official('detect-akamai', '2.2.0') } }));
  assert.deepStrictEqual(plain((await UM.compareVersions(index)).updates.map(u => u.remoteVersion)), ['2.2.0'], 'a newer one is');
});

test('a check with nothing new clears an old pending list', async () => {
  const local = {
    scrapfly_detectors: { detectors: { antibot: { 'detect-akamai': official('detect-akamai', '2.0.0') } } },
    scrapfly_pending_updates: [{ id: 'detect-akamai', category: 'antibot', remoteVersion: '2.0.0' }]
  };
  const { UM } = load(local, { remote: { 'detect-akamai': official('detect-akamai', '2.0.0') } });
  const result = await UM.checkForUpdates(true);
  assert.strictEqual(result.available, false);
  assert.strictEqual(local.scrapfly_pending_updates, undefined);
});

test('a pending entry that is no longer newer than the local copy is dropped on apply', async () => {
  const local = {
    scrapfly_detectors: { detectors: { antibot: { 'detect-akamai': official('detect-akamai', '2.1.0', { detection: { cookie: [{ name: 'local' }] } }) } } },
    scrapfly_pending_updates: [{ id: 'detect-akamai', category: 'antibot', remoteVersion: '2.1.0' }]
  };
  const { UM } = load(local, { remote: { 'detect-akamai': official('detect-akamai', '2.1.0') } });
  const result = await UM.applyUpdates();
  assert.strictEqual(result.count, 0);
  assert.deepStrictEqual(stored(local)['detect-akamai'].detection, { cookie: [{ name: 'local' }] });
  assert.strictEqual(local.scrapfly_pending_updates, undefined);
});

test('a check where every detector fails to download is an error, not "up to date"', async () => {
  const local = { scrapfly_detectors: { detectors: { antibot: {} } } };
  const { UM } = load(local, { remote: {} });
  UM.fetchRemoteIndex = async () => index;
  const result = await UM.checkForUpdates(true);
  assert.ok(result.error, 'reported as a failed check');
  assert.strictEqual(result.available, false);
});

test('a new official detector installed by an update counts as official', async () => {
  const local = {
    scrapfly_detectors: { detectors: { antibot: {} } },
    scrapfly_pending_updates: [{ id: 'detect-akamai', category: 'antibot', remoteVersion: '2.0.0', isNew: true }]
  };
  const { UM } = load(local, { remote: { 'detect-akamai': official('detect-akamai', '2.0.0') } });
  await UM.applyUpdates();
  assert.deepStrictEqual(local.scrapfly_remote_official_ids, ['detect-akamai']);
});

// ------------------------------------------------- extension update (bundled)
test('an extension update brings new and newer bundled detectors to an existing install', async () => {
  const edited = DetectorManager.markUserEdited(
    { ...official('detect-cloudflare', '1.0.0'), detection: { cookie: [{ name: 'mine' }] } },
    official('detect-cloudflare', '1.0.0'));
  const local = {
    scrapfly_detectors: { detectors: { antibot: {
      'detect-akamai': official('detect-akamai', '2.0.0', { enabled: false }),
      'detect-cloudflare': edited
    } } },
    scrapfly_deleted_official_detectors: ['detect-deleted']
  };
  const { UM } = load(local, {
    bundledIndex: { antibot: { detectors: ['detect-akamai', 'detect-cloudflare', 'detect-fresh', 'detect-deleted'] } },
    bundled: {
      'ext://detectors/antibot/detect-akamai.json': official('detect-akamai', '2.1.0'),
      'ext://detectors/antibot/detect-cloudflare.json': official('detect-cloudflare', '1.1.0'),
      'ext://detectors/antibot/detect-fresh.json': official('detect-fresh', '1.0.0'),
      'ext://detectors/antibot/detect-deleted.json': official('detect-deleted', '1.0.0')
    }
  });

  const merged = await UM.mergeBundledDetectors();
  assert.deepStrictEqual(plain(merged), { installed: 2, pending: 1, rerated: 0 });
  assert.strictEqual(stored(local)['detect-akamai'].version, '2.1.0');
  assert.strictEqual(stored(local)['detect-akamai'].enabled, false, 'user toggle kept');
  assert.ok(stored(local)['detect-fresh'], 'new bundled detector added');
  assert.strictEqual(stored(local)['detect-deleted'], undefined, 'a deleted official detector stays deleted');
  assert.deepStrictEqual(stored(local)['detect-cloudflare'].detection, { cookie: [{ name: 'mine' }] }, 'edits kept');
  assert.deepStrictEqual(plain(local.scrapfly_pending_updates.map(u => [u.id, u.source, u.userModified])), [['detect-cloudflare', 'bundled', true]]);

  // A GitHub check does not drop the bundled decision
  UM.fetchRemoteIndex = async () => ({ antibot: { detectors: [] } });
  await UM.checkForUpdates(true);
  assert.deepStrictEqual(plain(local.scrapfly_pending_updates.map(u => u.id)), ['detect-cloudflare']);

  // ...and "Use new version" installs the bundled copy
  const result = await UM.applyUpdates({ ids: ['detect-cloudflare'], overwriteModified: true });
  assert.strictEqual(result.count, 1);
  assert.strictEqual(stored(local)['detect-cloudflare'].version, '1.1.0');
});

// --------------------------------------------------------------- difficulty
// Scrapfly's ratings must reach installed copies; a difficulty the user
// picked in the editor must not be overwritten (BYT-1623).
test('an update applies Scrapfly\'s new difficulty unless the user picked one', async () => {
  const local = { scrapfly_detectors: { detectors: { antibot: {
    'detect-akamai': official('detect-akamai', '2.0.0', { difficulty: 'High' }),
    'detect-cloudflare': official('detect-cloudflare', '1.0.0', { difficulty: 'High', difficultyChosen: true, enabled: false })
  } } } };
  const { UM } = load(local, { remote: {
    'detect-akamai': official('detect-akamai', '2.0.1', { difficulty: 'Low' }),
    'detect-cloudflare': official('detect-cloudflare', '1.0.1', { difficulty: 'Low' })
  } });
  UM.fetchRemoteIndex = async () => index;
  await UM.checkForUpdates(true);
  const result = await UM.applyUpdates();
  assert.strictEqual(result.count, 2);
  assert.strictEqual(stored(local)['detect-akamai'].difficulty, 'Low', 'the new rating reaches an unedited copy');
  assert.strictEqual(stored(local)['detect-akamai'].difficultyChosen, undefined);
  assert.strictEqual(stored(local)['detect-cloudflare'].difficulty, 'High', 'the user\'s pick stays');
  assert.strictEqual(stored(local)['detect-cloudflare'].difficultyChosen, true);
  assert.strictEqual(stored(local)['detect-cloudflare'].enabled, false);
  assert.strictEqual(stored(local)['detect-cloudflare'].version, '1.0.1');
});

test('after an extension update, copies still on the pre-2.8.2 rating take the new one; picked ones stay', async () => {
  const before = (id, version, difficulty, extra = {}) => official(id, version, { difficulty, ...extra });
  const local = { scrapfly_detectors: { detectors: { antibot: {
    // Already took 2.0.1 from GitHub through 2.8.1, which kept the old rating
    'detect-radware': before('detect-radware', '2.0.1', 'High'),
    // Older than the bundle, still on the old rating
    'detect-jiasule': before('detect-jiasule', '2.0.0', 'Medium'),
    // The user had picked High: never shipped for Reblaze (Medium before, Low now)
    'detect-reblaze': before('detect-reblaze', '2.0.1', 'High'),
    // Not re-rated, but the user changed it
    'detect-akamai': before('detect-akamai', '2.0.0', 'Low'),
    // Not re-rated, untouched
    'detect-datadome': before('detect-datadome', '2.0.0', 'Medium'),
    // Edited by the user: the decision stays with them
    'detect-sucuri': DetectorManager.markUserEdited(
      { ...before('detect-sucuri', '2.0.0', 'Medium'), detection: { cookie: [{ name: 'mine' }] } },
      before('detect-sucuri', '2.0.0', 'Medium'))
  } } } };
  const ids = Object.keys(local.scrapfly_detectors.detectors.antibot);
  const shipped = {
    'detect-radware': ['2.0.1', 'Low'], 'detect-jiasule': ['2.0.1', 'Low'], 'detect-reblaze': ['2.0.1', 'Low'],
    'detect-akamai': ['2.0.0', 'Medium'], 'detect-datadome': ['2.0.0', 'Medium'], 'detect-sucuri': ['2.0.1', 'Low']
  };
  const bundled = Object.fromEntries(ids.map(id => [`ext://detectors/antibot/${id}.json`, before(id, shipped[id][0], shipped[id][1])]));
  const { UM } = load(local, { bundledIndex: { antibot: { detectors: ids } }, bundled });

  const merged = await UM.mergeBundledDetectors();
  assert.deepStrictEqual(plain(merged), { installed: 1, pending: 1, rerated: 1 });
  const s = stored(local);
  assert.deepStrictEqual([s['detect-radware'].version, s['detect-radware'].difficulty], ['2.0.1', 'Low'], 'same version, old rating: re-rated');
  assert.deepStrictEqual([s['detect-jiasule'].version, s['detect-jiasule'].difficulty], ['2.0.1', 'Low'], 'newer bundle installed with its rating');
  assert.deepStrictEqual([s['detect-reblaze'].difficulty, s['detect-reblaze'].difficultyChosen], ['High', true], 'a rating never shipped is the user\'s');
  assert.deepStrictEqual([s['detect-akamai'].difficulty, s['detect-akamai'].difficultyChosen], ['Low', true]);
  assert.deepStrictEqual([s['detect-datadome'].difficulty, s['detect-datadome'].difficultyChosen], ['Medium', undefined]);
  assert.deepStrictEqual([s['detect-sucuri'].difficulty, s['detect-sucuri'].userModified], ['Medium', true], 'edited rule untouched, update pending');

  // A second run (next extension update) changes nothing more
  assert.deepStrictEqual(plain(await UM.mergeBundledDetectors()), { installed: 0, pending: 1, rerated: 0 });
  // Later GitHub updates keep the picked ratings and follow Scrapfly's for the rest
  UM.fetchRemoteIndex = async () => ({ antibot: { detectors: ['detect-akamai', 'detect-radware'] } });
  UM.fetchRemoteDetector = async (_c, id) => before(id, id === 'detect-akamai' ? '2.0.1' : '2.0.2', 'High');
  await UM.checkForUpdates(true);
  await UM.applyUpdates();
  assert.strictEqual(stored(local)['detect-akamai'].difficulty, 'Low', 'picked rating survives a GitHub update');
  assert.strictEqual(stored(local)['detect-radware'].difficulty, 'High', 'a later re-rating by Scrapfly applies');
});

test('the rule editor records a changed difficulty as the user\'s choice', () => {
  const original = official('detect-akamai', '2.0.0', { difficulty: 'Medium' });
  const same = DetectorManager.applyDifficultyChoice({ ...original }, DetectorManager.cleanDetectorCopy(original), 'Medium');
  assert.strictEqual(same.difficultyChosen, undefined, 'saving without changing it keeps following Scrapfly');
  const picked = DetectorManager.applyDifficultyChoice({ ...original }, DetectorManager.cleanDetectorCopy(original), 'High');
  assert.deepStrictEqual([picked.difficulty, picked.difficultyChosen], ['High', true]);
  const fresh = DetectorManager.applyDifficultyChoice({ id: 'mine' }, null, 'Low');
  assert.deepStrictEqual([fresh.difficulty, fresh.difficultyChosen], ['Low', undefined], 'a new custom rule has no official rating to follow');
  // Never part of an official snapshot; "Reset to official" keeps the choice
  assert.ok(!('difficultyChosen' in DetectorManager.cleanDetectorCopy(picked)));
  const edited = DetectorManager.markUserEdited({ ...picked, detection: { cookie: [{ name: 'mine' }] } }, original);
  assert.ok(!('difficultyChosen' in edited.officialSnapshot));
  const reset = DetectorManager.officialVersionOf(edited);
  assert.deepStrictEqual([reset.difficulty, reset.difficultyChosen], ['High', true]);
});

test('the pre-2.8.2 ratings table only lists shipped detectors that were re-rated', () => {
  const { UM } = load({});
  const index = JSON.parse(fs.readFileSync(path.join(root, 'detectors/index.json'), 'utf8'));
  const where = {};
  for (const [category, entry] of Object.entries(index)) for (const id of entry.detectors || []) where[id] = category;
  const table = plain(UM.DIFFICULTY_BEFORE_2_8_2);
  assert.strictEqual(Object.keys(table).length, 23);
  for (const [id, previous] of Object.entries(table)) {
    assert.ok(where[id], `${id} is a shipped detector`);
    assert.ok(['Low', 'Medium', 'High'].includes(previous), id);
    const current = JSON.parse(fs.readFileSync(path.join(root, 'detectors', where[id], `${id}.json`), 'utf8')).difficulty;
    assert.notStrictEqual(current, previous, `${id}: listed as re-rated but still ${current}`);
  }
});
