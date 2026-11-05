const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A saved scan result belongs to the rules it was found with. Saving, toggling, importing, resetting or restoring rules
// and Rules → Update all end in one of two places (the worker's RELOAD_DETECTORS handler and
// UpdateManager.notifyDetectorsChanged), and both now stamp a new rules revision: a result stored under an older one is a
// miss, so the next visit is scanned with the new rules instead of showing, for the rest of the 7 days, a card of a
// detector that was edited or switched off.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const HOUR = 3600 * 1000;

const FILES = [
  'modules/core/constants.js',
  'modules/core/categories.js',
  'utils/format-utils.js',
  'utils/url-utils.js',
  'utils/detection-utils.js',
  'utils/utils.js',
  'utils/pattern-cache.js',
  'modules/detection/managers/confidence-manager.js',
  'modules/detection/detection-combinations.js',
  'modules/detection/engine/detection-engine-manager.js',
  'modules/detection/rules/update-manager.js',
  'background/handlers/messages-settings.js'
];

/**
 * The real engine, update manager and settings handlers over an async fake chrome.storage.local. `popup: true` gives the
 * context a window (the popup: the update manager asks the worker to reload); without it the context is the worker.
 */
function load({ scope = 'domain', popup = false, now = () => Date.now() } = {}) {
  const store = {};
  const sent = [];
  const reloads = [];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const FakeDate = class extends Date { static now() { return now(); } };
  const chrome = {
    storage: { local: {
      get: async (keys) => { const out = {}; for (const key of [].concat(keys)) if (key in store) out[key] = clone(store[key]); return out; },
      set: async (values) => { Object.assign(store, clone(values)); },
      remove: async (keys) => { for (const key of [].concat(keys)) delete store[key]; }
    } },
    runtime: { getURL: (p) => `chrome-extension://test/${p}`, sendMessage: (message, callback) => { sent.push(message); if (callback) callback(); } }
  };
  const ctx = { chrome, console, setTimeout, clearTimeout, Date: FakeDate, JSON, Promise, Math, Set, Map, URL, Object, Array, Error, Number, String,
    Logger: new Proxy({}, { get: () => () => {} }),
    WorkerMessages: require('../modules/core/worker-messages.js'),
    MessageSender: require('../modules/core/message-sender.js'),
    SettingsStore: { registerHandlers() {} },
    // What the worker reloads when the rules change
    detectorManager: { initialized: true, async initialize() { this.initialized = true; reloads.push('reloaded'); }, getDetectorCount: () => 7 } };
  ctx.self = ctx;
  ctx.globalThis = ctx;
  if (popup) ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of FILES) vm.runInContext(read(file), ctx, { filename: file });
  const Engine = vm.runInContext('DetectionEngineManager', ctx);
  vm.runInContext(`Utils.getCacheScope = async () => ${JSON.stringify(scope)};`, ctx);
  Engine.getExpiryMs = async () => 7 * 24 * HOUR;
  const registry = {};
  ctx.registerSettingsHandlers(registry, {});
  /** What the Rules tab does after a save: tells the worker to reload the detectors. */
  const reloadDetectors = () => new Promise((resolve) => {
    registry[ctx.WorkerMessages.RELOAD_DETECTORS]({ request: {}, sender: undefined, sendResponse: resolve });
  });
  return { ctx, Engine, UpdateManager: ctx.UpdateManager, store, sent, reloads, reloadDetectors };
}

const found = (id = 'cloudflare') => [{ id, category: 'antibot', confidence: 90, detector: { id, name: id }, matches: [{ type: 'cookie', pattern: 'x', confidence: 90 }] }];
const page = (host) => ({ url: `https://${host}/`, hostname: host });
const save = (Engine, host, results = found()) => Engine.storeDetection(`https://${host}/`, page(host), results);
const ids = (stored) => (stored ? stored.detectionResults.map(d => d.id) : null);

test('a rule change (the worker reloads the detectors) makes every saved result a miss; the next scan is saved and served again', async () => {
  const { Engine, reloadDetectors, reloads } = load();
  await save(Engine, 'shop.example');
  await save(Engine, 'bank.example', found('akamai'));
  assert.deepStrictEqual(ids(await Engine.getStoredDetection('https://shop.example/')), ['cloudflare']);
  assert.deepStrictEqual(ids(await Engine.getStoredDetection('https://bank.example/')), ['akamai']);

  const answer = await reloadDetectors();
  assert.strictEqual(answer.status, 'reloaded');
  assert.deepStrictEqual(reloads, ['reloaded']);
  assert.strictEqual(await Engine.getStoredDetection('https://shop.example/'), null, 'the card of the old rules is not shown again');
  assert.strictEqual(await Engine.getStoredDetection('https://bank.example/'), null, 'no page keeps its result');

  const again = await save(Engine, 'shop.example', found('datadome'));
  assert.deepStrictEqual(ids(again), ['datadome']);
  assert.deepStrictEqual(ids(await Engine.getStoredDetection('https://shop.example/')), ['datadome'], 'a result found with the new rules is served');
  assert.strictEqual(await Engine.getStoredDetection('https://bank.example/'), null);
});

test('Rules → Update in the worker (notifyDetectorsChanged) drops the saved results as well', async () => {
  const { Engine, UpdateManager, reloads } = load();
  await save(Engine, 'shop.example');
  assert.ok(await Engine.getStoredDetection('https://shop.example/'));
  await UpdateManager.notifyDetectorsChanged();
  assert.deepStrictEqual(reloads, ['reloaded'], 'the worker reloaded its detectors itself');
  assert.strictEqual(await Engine.getStoredDetection('https://shop.example/'), null);
  assert.deepStrictEqual(ids(await save(Engine, 'shop.example', found('akamai'))), ['akamai']);
  assert.deepStrictEqual(ids(await Engine.getStoredDetection('https://shop.example/')), ['akamai']);
});

test('from a popup, notifyDetectorsChanged only asks the worker to reload: the worker stamps the change once', async () => {
  const { Engine, UpdateManager, sent, store } = load({ popup: true });
  await save(Engine, 'shop.example');
  await UpdateManager.notifyDetectorsChanged();
  assert.deepStrictEqual(sent.map(m => m.type), ['RELOAD_DETECTORS']);
  assert.ok(!('scrapfly_rules_rev' in store), 'a popup does not stamp anything');
  assert.ok(await Engine.getStoredDetection('https://shop.example/'), 'until the worker reloads, nothing changed');
});

test('results saved before the stamp existed count as revision 0: upgrading drops nothing, the first rule change drops them', async () => {
  const { Engine, store, reloadDetectors } = load();
  await save(Engine, 'old.example');
  const key = Object.keys(store.scrapfly_detection_storage)[0];
  delete store.scrapfly_detection_storage[key].rulesRev; // what 3.1.2 stored
  assert.ok(!('scrapfly_rules_rev' in store), 'no change has been stamped yet');
  assert.deepStrictEqual(ids(await Engine.getStoredDetection('https://old.example/')), ['cloudflare'], 'served as before');
  await reloadDetectors();
  assert.strictEqual(await Engine.getStoredDetection('https://old.example/'), null);
});

test('the hostname fallback and a weak rescan do not bring back a result found with older rules', async () => {
  const { Engine, reloadDetectors } = load();
  // "Domain" scope: www and the bare host share one result through the hostname fallback
  await Engine.storeDetection('https://www.shop.example/', page('www.shop.example'), found());
  assert.ok(await Engine.getStoredDetection('https://shop.example/x'), 'before the change the bare host is answered by the www entry');
  await reloadDetectors();
  assert.strictEqual(await Engine.getStoredDetection('https://shop.example/x'), null, 'after it, not any more');

  // A rescan that finds nothing keeps an earlier positive result, unless the rules changed since: then a detector that was
  // switched off would keep showing its card
  const url = 'https://bank.example/';
  await Engine.storeDetection(url, page('bank.example'), found('akamai'));
  const kept = await Engine.storeDetection(url, page('bank.example'), []);
  assert.strictEqual(kept.preservedExisting, true, 'same rules: the positive result is kept');
  await reloadDetectors();
  const empty = await Engine.storeDetection(url, page('bank.example'), []);
  assert.ok(!empty.preservedExisting, 'new rules: nothing is kept');
  assert.strictEqual(empty.detectionCount, 0);
  assert.strictEqual((await Engine.getStoredDetection(url)).detectionCount, 0, 'and the page is saved as clean');
});

test('a store removes the results of older rules from other pages in the same write', async () => {
  const { Engine, store, reloadDetectors } = load();
  await save(Engine, 'a.example');
  await save(Engine, 'b.example');
  await reloadDetectors();
  await save(Engine, 'c.example');
  assert.deepStrictEqual(Object.values(store.scrapfly_detection_storage).map(e => e.hostname), ['c.example']);
});

test('a scan that began before the rules changed is not served afterwards', async () => {
  const { Engine, reloadDetectors } = load();
  const startedAt = Date.now() - 2000; // the scan began, then the rules changed while it ran
  await reloadDetectors();
  await Engine.storeDetection('https://shop.example/', { ...page('shop.example'), scanStartedAt: startedAt }, found());
  assert.strictEqual(await Engine.getStoredDetection('https://shop.example/'), null, 'it may have been found with the old rules');
  await Engine.storeDetection('https://bank.example/', { ...page('bank.example'), scanStartedAt: Date.now() }, found('akamai'));
  assert.deepStrictEqual(ids(await Engine.getStoredDetection('https://bank.example/')), ['akamai'], 'a scan that began after the change is');
});

test('each change takes a revision above the last, also for two at once and for a clock set back a little', async () => {
  let clock = 1000000;
  const { Engine, store } = load({ now: () => clock });
  const first = await Engine.bumpRulesRevision();
  assert.strictEqual(first, 1000000);
  assert.strictEqual(store.scrapfly_rules_rev, first);
  clock -= 30 * 1000; // the system clock was set back by half a minute: still within what counts as one clock
  const second = await Engine.bumpRulesRevision();
  assert.ok(second > first, `${second} should be above ${first}`);
  const both = await Promise.all([Engine.bumpRulesRevision(), Engine.bumpRulesRevision()]);
  assert.ok(both[0] > second && both[1] > both[0], `two changes at once: ${both}`);
  assert.strictEqual(store.scrapfly_rules_rev, both[1]);
});

test('a clock that was ahead when the rules changed and was then corrected does not switch caching off: scans after the correction are served', async () => {
  const hour = 3600 * 1000;
  let clock = Date.UTC(2026, 10, 5, 12, 0, 0);
  const real = clock;
  const { Engine } = load({ now: () => clock });
  clock = real + 24 * hour; // the system clock is a day ahead (wrong) when the person edits a rule
  assert.strictEqual(await Engine.bumpRulesRevision(), real + 24 * hour);
  clock = real + hour; // the clock is corrected: the revision now lies a day ahead of it
  for (const host of ['a.example', 'b.example', 'c.example']) {
    // A scan that begins now is after the change, however far ahead the revision's time lies: it is served
    await Engine.storeDetection(`https://${host}/`, { ...page(host), scanStartedAt: clock }, found());
    assert.deepStrictEqual(ids(await Engine.getStoredDetection(`https://${host}/`)), ['cloudflare'], `${host} is served after the correction`);
    clock += 60 * 1000;
  }
});

test('after the clock is corrected the next change starts again from the clock; what was saved under the revision from the wrong clock is not served', async () => {
  const hour = 3600 * 1000;
  let clock = Date.UTC(2026, 10, 5, 12, 0, 0);
  const real = clock;
  const { Engine, store } = load({ now: () => clock });
  clock = real + 24 * hour;
  const ahead = await Engine.bumpRulesRevision();
  await Engine.storeDetection('https://old.example/', { ...page('old.example'), scanStartedAt: clock }, found());
  assert.deepStrictEqual(ids(await Engine.getStoredDetection('https://old.example/')), ['cloudflare']);
  clock = real + hour; // corrected
  const next = await Engine.bumpRulesRevision();
  assert.strictEqual(next, real + hour, 'from the clock, not a day above the wrong one');
  assert.ok(next < ahead && store.scrapfly_rules_rev === next);
  assert.strictEqual(await Engine.getStoredDetection('https://old.example/'), null, 'another revision: not served');
  await Engine.storeDetection('https://new.example/', { ...page('new.example'), scanStartedAt: clock + 1 }, found('akamai'));
  assert.deepStrictEqual(ids(await Engine.getStoredDetection('https://new.example/')), ['akamai']);
  // Two changes in the same millisecond are still two
  const [x, y] = [await Engine.bumpRulesRevision(), await Engine.bumpRulesRevision()];
  assert.ok(x > next && y > x, `${next} < ${x} < ${y}`);
});

test('a scan that began before a change does not take the place of a result another tab saved under the new rules', async () => {
  let clock = Date.UTC(2026, 10, 7, 12, 0, 0);
  const { Engine } = load({ now: () => clock });
  const aStart = clock; // tab A's scan begins, on the old rules
  clock += 1000;
  await Engine.bumpRulesRevision(); // the rules change
  clock += 1000;
  const bStart = clock; // tab B loads the page: its scan is of the new rules and finishes first
  clock += 3000;
  await Engine.storeDetection('https://shop.example/', { ...page('shop.example'), scanStartedAt: bStart }, found('datadome'));
  assert.deepStrictEqual(ids(await Engine.getStoredDetection('https://shop.example/')), ['datadome']);
  clock += 2000; // tab A's stale scan finishes last
  const stale = await Engine.storeDetection('https://shop.example/', { ...page('shop.example'), scanStartedAt: aStart }, found('cloudflare'));
  assert.deepStrictEqual(ids(await Engine.getStoredDetection('https://shop.example/')), ['datadome'], 'the result that is served stays');
  assert.strictEqual(stale.detectionCount, 1, 'the scan itself still reports what it found');
  // With no newer result to keep, a scan that began before the change is still saved as stale, never served
  await Engine.storeDetection('https://other.example/', { ...page('other.example'), scanStartedAt: aStart }, found('cloudflare'));
  assert.strictEqual(await Engine.getStoredDetection('https://other.example/'), null);
});

test('the worker\'s RELOAD_DETECTORS handler stamps the change, also when the reload fails', async () => {
  const { reloadDetectors, store, ctx } = load();
  assert.ok(!('scrapfly_rules_rev' in store), 'nothing stamped yet');
  assert.strictEqual((await reloadDetectors()).status, 'reloaded');
  const first = store.scrapfly_rules_rev;
  assert.ok(first > 0, 'a reload that worked stamps the change');
  ctx.detectorManager.initialize = async () => { throw new Error('the rules cannot be read'); };
  assert.strictEqual((await reloadDetectors()).status, 'error');
  assert.ok(store.scrapfly_rules_rev > first, 'a reload that failed stamps it too: the rules in storage changed either way');
});

test('Rules → Update in the worker (notifyDetectorsChanged) stamps the change, also when the reload fails', async () => {
  const { UpdateManager, store, ctx } = load();
  assert.ok(!('scrapfly_rules_rev' in store), 'nothing stamped yet');
  await UpdateManager.notifyDetectorsChanged();
  const first = store.scrapfly_rules_rev;
  assert.ok(first > 0, 'a reload that worked stamps the change');
  ctx.detectorManager.initialize = async () => { throw new Error('the rules cannot be read'); };
  await UpdateManager.notifyDetectorsChanged(); // the failure is logged, never thrown at the caller
  assert.ok(store.scrapfly_rules_rev > first, 'a reload that failed stamps it too');
});
