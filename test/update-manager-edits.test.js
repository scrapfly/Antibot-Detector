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
  assert.deepStrictEqual(plain(merged), { installed: 2, pending: 1 });
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
