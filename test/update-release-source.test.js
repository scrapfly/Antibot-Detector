const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Rules → Update reads the latest GitHub release, never main: a merge to main
// reaches nobody until a release is published. One click checks and installs;
// a rule that needs a newer extension is not an update yet, it waits and is
// named. The real UpdateManager runs against a fake GitHub.

const root = path.join(__dirname, '..');
const RAW = 'https://raw.githubusercontent.com/scrapfly/Antibot-Detector';
const API = 'https://api.github.com/repos/scrapfly/Antibot-Detector/releases/latest';

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => JSON.parse(JSON.stringify(body))
  };
}

/**
 * @param {object} local - chrome.storage.local contents
 * @param {object} github - { latest: tag | (() => response), releases: { tag: { 'antibot/detect-x': json, index: json } } }
 */
function load(local, github, state = { version: '2.8.3' }) {
  const requests = [];
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Date, Math, Set, Map, Object, Array, Error, AbortController,
    Logger: new Proxy({}, { get: () => () => {} }),
    Constants: { UPDATE_CHECK_TIMEOUT: 30000, DEFAULT_CACHE_EXPIRY_HOURS: 12, UPDATE_FETCH_TIMEOUT: 5000 },
    Utils: { getSettings: async () => ({ updates: { autoUpdate: true } }) },
    StorageManager: {
      normalizeStoredValue: async (_k, v) => (typeof v === 'string' ? JSON.parse(v) : v),
      saveToStorage: async (key, value) => { local[key] = JSON.parse(JSON.stringify(value)); return true; },
      saveSettings: async () => true
    },
    fetch: async (url) => {
      requests.push(url);
      if (url === API) {
        return typeof github.latest === 'function' ? github.latest() : response(200, { tag_name: github.latest });
      }
      const match = url.startsWith(`${RAW}/`) && url.slice(RAW.length + 1).match(/^([^/]+)\/detectors\/(.+)\.json$/);
      const release = match && github.releases[decodeURIComponent(match[1])];
      const file = release && release[match[2]];
      return file ? response(200, file) : response(404, {});
    },
    chrome: {
      runtime: { getManifest: () => ({ version: state.version }), sendMessage: (_m, cb) => { if (cb) cb(); } },
      storage: { local: {
        get: async (keys) => { const o = {}; for (const k of [].concat(keys)) if (k in local) o[k] = local[k]; return o; },
        set: async (obj) => { Object.assign(local, JSON.parse(JSON.stringify(obj))); },
        remove: async (keys) => { for (const k of [].concat(keys)) delete local[k]; }
      } }
    }
  };
  ctx.self = ctx;
  ctx.window = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/core/update-manager.js'), 'utf8'), ctx);
  return { UM: ctx.UpdateManager, requests, state };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const official = (id, version, extra = {}) => ({ id, name: id.replace('detect-', ''), version, author: 'Scrapfly',
  minExtensionVersion: '2.8', detection: { cookie: [{ name: `${id}-v${version}` }] }, ...extra });
const stored = (local) => local.scrapfly_detectors.detectors.antibot;
const installedWith = (local, ...pairs) => ({ scrapfly_detectors: { detectors: { antibot: Object.fromEntries(pairs.map(([id, v]) => [id, official(id, v)])) } }, ...local });
const release = (detectors) => ({
  index: { antibot: { detectors: Object.keys(detectors) } },
  ...Object.fromEntries(Object.entries(detectors).map(([id, d]) => [`antibot/${id}`, d]))
});

test('the check reads the latest release tag, never main', async () => {
  const local = installedWith({}, ['detect-akamai', '2.0.0']);
  const { UM, requests } = load(local, {
    latest: 'v2.8.4',
    releases: { 'v2.8.4': release({ 'detect-akamai': official('detect-akamai', '2.1.0') }) }
  });
  const check = await UM.checkForUpdates(true);
  assert.strictEqual(check.error, null);
  assert.strictEqual(check.release, 'v2.8.4');
  assert.deepStrictEqual(plain(check.updates.map(u => [u.id, u.remoteVersion, u.tag])), [['detect-akamai', '2.1.0', 'v2.8.4']]);
  assert.deepStrictEqual(requests, [API, `${RAW}/v2.8.4/detectors/index.json`, `${RAW}/v2.8.4/detectors/antibot/detect-akamai.json`]);
  assert.ok(!requests.some(u => u.includes('/main/')));
});

test('an install fetches the release it was checked against, even if a newer one is out by then', async () => {
  const github = {
    latest: 'v2.8.4',
    releases: {
      'v2.8.4': release({ 'detect-akamai': official('detect-akamai', '2.1.0') }),
      'v2.8.5': release({ 'detect-akamai': official('detect-akamai', '2.2.0') })
    }
  };
  const local = installedWith({}, ['detect-akamai', '2.0.0']);
  const { UM } = load(local, github);
  await UM.checkForUpdates(true);
  github.latest = 'v2.8.5';
  const applied = await UM.applyUpdates();
  assert.deepStrictEqual(plain(applied.installed), [{ id: 'detect-akamai', name: 'akamai', remoteVersion: '2.1.0', isNew: false }]);
  assert.strictEqual(stored(local)['detect-akamai'].version, '2.1.0');
});

test('an entry queued by an older build (from main, no tag) is never fetched from main', async () => {
  const local = installedWith({ scrapfly_pending_updates: [{ id: 'detect-akamai', category: 'antibot', remoteVersion: '2.1.0' }] },
    ['detect-akamai', '2.0.0']);
  const { UM, requests } = load(local, { latest: 'v2.8.4', releases: {} });
  const applied = await UM.applyUpdates();
  assert.strictEqual(applied.count, 0);
  assert.strictEqual(applied.failed, 1, 'kept pending until the next check replaces it');
  assert.deepStrictEqual(requests, []);
});

test('one click installs unedited rules, returns edited ones to ask about, and names what failed', async () => {
  const edited = { ...official('detect-cloudflare', '1.0.0'), userModified: true, officialSnapshot: official('detect-cloudflare', '1.0.0') };
  const local = installedWith({}, ['detect-akamai', '2.0.0'], ['detect-datadome', '1.0.0']);
  stored(local)['detect-cloudflare'] = edited;
  const tag = release({
    'detect-akamai': official('detect-akamai', '2.1.0'),
    'detect-cloudflare': official('detect-cloudflare', '1.1.0'),
    'detect-new': official('detect-new', '1.0.0')
  });
  tag.index.antibot.detectors.push('detect-datadome'); // listed, but its file is missing
  const { UM } = load(local, { latest: 'v2.8.4', releases: { 'v2.8.4': tag } });

  const result = await UM.checkAndInstall();
  assert.strictEqual(result.error, null);
  assert.strictEqual(result.release, 'v2.8.4');
  assert.deepStrictEqual(plain(result.installed.map(u => [u.id, u.isNew])).sort(), [['detect-akamai', false], ['detect-new', true]]);
  assert.deepStrictEqual(plain(result.needsDecision.map(u => u.id)), ['detect-cloudflare']);
  assert.deepStrictEqual(plain(result.failed.map(u => u.name)), ['datadome'], 'named as the installed rule');
  assert.strictEqual(stored(local)['detect-cloudflare'].userModified, true, 'edits untouched');
  assert.deepStrictEqual(plain(local.scrapfly_pending_updates.map(u => [u.id, u.tag])), [['detect-cloudflare', 'v2.8.4']]);
});

test('a rule that needs a newer extension is not an update: not installed, not counted, named until the extension catches up', async () => {
  const local = installedWith({}, ['detect-akamai', '2.0.0'], ['detect-kasada', '2.0.0']);
  const { UM, state } = load(local, {
    latest: 'v2.9.0',
    releases: { 'v2.9.0': release({
      'detect-akamai': official('detect-akamai', '2.1.0'),
      'detect-kasada': official('detect-kasada', '3.0.0', { minExtensionVersion: '2.9.0' })
    }) }
  });
  const result = await UM.checkAndInstall();
  assert.deepStrictEqual(plain(result.installed.map(u => u.id)), ['detect-akamai']);
  assert.deepStrictEqual(plain(result.incompatible.map(u => [u.id, u.minExtensionVersion])), [['detect-kasada', '2.9.0']]);
  assert.strictEqual(stored(local)['detect-kasada'].version, '2.0.0');
  assert.strictEqual(await UM.getPendingUpdatesCount(), 0, 'no badge for it');
  assert.deepStrictEqual(plain((await UM.getIncompatibleUpdates()).map(u => u.id)), ['detect-kasada']);

  state.version = '2.9.0'; // Chrome updated the extension
  assert.deepStrictEqual(plain(await UM.getIncompatibleUpdates()), [], 'no stale notice once it is satisfied');
  const next = await UM.checkAndInstall();
  assert.deepStrictEqual(plain(next.installed.map(u => u.id)), ['detect-kasada']);
});

test('GitHub failures are told apart, and none of them reads as "up to date"', async () => {
  const local = installedWith({ scrapfly_pending_updates: [{ id: 'detect-akamai', category: 'antibot', remoteVersion: '2.1.0', tag: 'v1' }] },
    ['detect-akamai', '2.0.0']);
  const cases = [
    [() => response(404, { message: 'Not Found' }), 'no_release'],
    [() => response(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000000' }), 'rate_limited'],
    [() => response(429, {}, { 'retry-after': '120' }), 'rate_limited'],
    [() => response(500, {}), 'unreachable'],
    [() => { throw new TypeError('Failed to fetch'); }, 'unreachable'],
    [() => response(200, { tag_name: '../main' }), 'no_release']
  ];
  for (const [latest, code] of cases) {
    const { UM } = load(JSON.parse(JSON.stringify(local)), { latest, releases: {} });
    const result = await UM.checkAndInstall();
    assert.strictEqual(result.errorCode, code, `${latest}`);
    assert.ok(result.error);
    assert.deepStrictEqual(plain(result.installed), []);
  }
  const { UM } = load(local, { latest: cases[1][0], releases: {} });
  const limited = await UM.checkAndInstall();
  assert.strictEqual(limited.retryAt, 2000000000 * 1000);
  assert.strictEqual(local.scrapfly_pending_updates, undefined, 'stale GitHub entries are dropped');
});

test('the summary: installed names, up to date only when nothing else, the extension it waits for, failures, errors', () => {
  const { UM } = load({}, { latest: 'v1', releases: {} });
  const base = { error: null, errorCode: null, release: 'v2.8.4', installed: [], needsDecision: [], incompatible: [], failed: [] };
  const say = (fields, options) => plain(UM.resultMessages({ ...base, ...fields }, options));

  assert.deepStrictEqual(say({}), [{ type: 'success', text: 'All rules are up to date with release v2.8.4.' }]);
  assert.deepStrictEqual(say({ installed: [{ name: 'F5' }, { name: 'Jiasule' }] }),
    [{ type: 'success', text: 'Rules updated from release v2.8.4: F5, Jiasule' }]);
  const many = Array.from({ length: 6 }, (_, i) => ({ name: `R${i}` }));
  assert.deepStrictEqual(say({ installed: many })[0].text, 'Rules updated from release v2.8.4: 6', 'more than five: the count');
  assert.deepStrictEqual(say({ incompatible: [{ name: 'Kasada', minExtensionVersion: '2.8.10' }, { name: 'X', minExtensionVersion: '2.9' }] }),
    [{ type: 'warning', text: 'Waiting for extension 2.9 or newer: Kasada, X. They install once Chrome updates the extension.' }]);
  assert.deepStrictEqual(say({ failed: [{ id: 'detect-a', name: 'A' }] }), [{ type: 'warning', text: 'Could not download: A. Try again later.' }]);
  assert.deepStrictEqual(say({ needsDecision: [{ name: 'Cloudflare' }] }), [], 'Rules asks about them in a dialog');
  assert.deepStrictEqual(say({ needsDecision: [{ name: 'Cloudflare' }] }, { mentionEdited: true }),
    [{ type: 'info', text: 'Rules you edited wait for your decision in Rules → Update: Cloudflare' }]);
  assert.deepStrictEqual(say({}, { list: (names) => names.join(' + ') }), say({}), 'the list joiner is only used for names');
  assert.deepStrictEqual(say({ installed: [{ name: 'A' }, { name: 'B' }] }, { list: (names) => names.join(' + ') })[0].text,
    'Rules updated from release v2.8.4: A + B');

  assert.deepStrictEqual(say({ error: 'x', errorCode: 'unreachable' }), [{ type: 'error', text: 'Could not reach GitHub to check for rule updates.' }]);
  assert.deepStrictEqual(say({ error: 'x', errorCode: 'no_release' }), [{ type: 'error', text: 'No published Scrapfly release was found on GitHub.' }]);
  assert.deepStrictEqual(say({ error: 'x', errorCode: 'rate_limited', retryAt: Date.now() + 4.5 * 60000 }),
    [{ type: 'error', text: 'GitHub is limiting update checks. Try again in 5 min.' }]);
  assert.deepStrictEqual(say({ error: 'disk full', errorCode: 'failed' }), [{ type: 'error', text: 'Failed to check for updates: disk full' }]);
  const keyed = UM.resultMessages({ ...base, installed: [{ name: 'F5' }] }, { t: (key, _fallback, ...args) => `${key}(${args.join('|')})` });
  assert.deepStrictEqual(plain(keyed), [{ type: 'success', text: 'updateResultInstalledFmt(v2.8.4|F5)' }], 'texts come from locale keys');
});
