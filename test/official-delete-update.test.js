const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Deleting an official detector must survive "Update": the real UpdateManager
// may not offer it as a new detector, and a pending update queued before the
// delete may not re-add it. Other detectors still update normally.

const root = path.join(__dirname, '..');

function load(local) {
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Date, Math, Set, Map, Object, Array,
    Logger: new Proxy({}, { get: () => () => {} }),
    Constants: { UPDATE_CHECK_TIMEOUT: 30000, DEFAULT_CACHE_EXPIRY_HOURS: 12 },
    Utils: { getSettings: async () => ({ updates: { autoUpdate: true } }) },
    StorageManager: {
      normalizeStoredValue: async (_k, v) => (typeof v === 'string' ? JSON.parse(v) : v),
      saveToStorage: async (key, value) => { local[key] = JSON.parse(JSON.stringify(value)); return true; }
    },
    chrome: {
      runtime: { getManifest: () => ({ version: '2.8' }) },
      storage: { local: {
        get: async (keys) => { const o = {}; for (const k of [].concat(keys)) if (k in local) o[k] = local[k]; return o; },
        set: async (obj) => { Object.assign(local, JSON.parse(JSON.stringify(obj))); },
        remove: async (keys) => { for (const k of [].concat(keys)) delete local[k]; }
      } }
    }
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/core/update-manager.js'), 'utf8'), ctx);
  const UM = ctx.UpdateManager;
  const remote = {
    'detect-akamai': { id: 'detect-akamai', name: 'Akamai', version: '2.0', author: 'Scrapfly', detection: {} },
    'detect-cloudflare': { id: 'detect-cloudflare', name: 'Cloudflare', version: '3.0', author: 'Scrapfly', detection: {} }
  };
  UM.fetchRemoteDetector = async (_cat, id) => JSON.parse(JSON.stringify(remote[id]));
  return UM;
}

const index = { antibot: { detectors: ['detect-akamai', 'detect-cloudflare'] } };

test('a deleted official detector is not offered as new; others still update', async () => {
  const local = {
    scrapfly_detectors: { detectors: { antibot: { 'detect-cloudflare': { id: 'detect-cloudflare', version: '1.0' } } } },
    scrapfly_deleted_official_detectors: ['detect-akamai']
  };
  const UM = load(local);
  const { updates } = await UM.compareVersions(index);
  assert.deepStrictEqual([...updates.map(u => u.id)], ['detect-cloudflare']);
});

test('without the deletion record the missing official detector is offered as new', async () => {
  const local = { scrapfly_detectors: { detectors: { antibot: {} } } };
  const UM = load(local);
  const { updates } = await UM.compareVersions(index);
  assert.deepStrictEqual([...updates.map(u => u.id)].sort(), ['detect-akamai', 'detect-cloudflare']);
});

test('a pending update queued before the delete does not re-add it', async () => {
  const local = {
    scrapfly_detectors: { detectors: { antibot: { 'detect-cloudflare': { id: 'detect-cloudflare', version: '1.0', enabled: false } } } },
    scrapfly_deleted_official_detectors: ['detect-akamai'],
    scrapfly_pending_updates: [
      { id: 'detect-akamai', category: 'antibot', remoteVersion: '2.0', isNew: true },
      { id: 'detect-cloudflare', category: 'antibot', remoteVersion: '3.0' }
    ]
  };
  const UM = load(local);
  await UM.applyUpdates();
  const stored = local.scrapfly_detectors.detectors.antibot;
  assert.strictEqual(stored['detect-akamai'], undefined);
  assert.strictEqual(stored['detect-cloudflare'].version, '3.0');
  assert.strictEqual(stored['detect-cloudflare'].enabled, false, 'user toggle kept');
});
