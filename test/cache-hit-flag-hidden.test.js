const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createPage, installDetail, bootstrapDetail, sleep, P } = require('./helpers/main-world-page.js');

// "This page was answered from the cache" used to be a property of the page's own window, set by the MAIN world script. Any
// page script could read it: it says that this extension is installed, and whether the page came from the cache, and it
// stays true through clearing cookies. The MAIN world keeps it in a variable now, and the content script (the ISOLATED
// world, with its own global object) in its own, handing it to the engine where the hook reports are checked.

const root = path.join(__dirname, '..');
const TOKEN = 'd'.repeat(32);
const T = P.MESSAGE_TYPES;
const FLAG = '__scrapflyCacheHitEarlyExit';
const FAST = { ACTIVITY_TIMEOUT_MS: 250, MAX_DETECTION_MS: 1000, MIN_MONITOR_MS: 0, INSTALL_DEBOUNCE_MS: 0 };
const hookDefinitions = [{ id: 'a', name: 'A', category: 'fingerprint', hooks: [{ target: 'Navigator.prototype.getBattery', confidence: 70 }] }];

test('a cached page load leaves nothing of the extension on the page\'s window: not the flag, not any global', () => {
  const page = createPage();
  const before = new Set(page.run('Object.getOwnPropertyNames(window)'));
  const added = () => page.run('Object.getOwnPropertyNames(window)').filter(name => !before.has(name));
  page.bootstrap(bootstrapDetail(TOKEN));
  assert.deepEqual(added(), [], 'after the bootstrap');
  assert.equal(page.run(`window.${FLAG}`), undefined);
  assert.equal(page.run(`${JSON.stringify(FLAG)} in window`), false);

  page.toMain({ type: T.CACHE_HIT, [P.FIELDS.TOKEN]: TOKEN });
  assert.deepEqual(added(), [], 'after the cache hit');
  assert.equal(page.run(`window.${FLAG}`), undefined, 'the page cannot tell that this load was answered from the cache');
});

test('the extension still skips the work on a cache hit, and a re-arm scans again, with the flag out of the page', () => {
  const page = createPage();
  const detail = bootstrapDetail(TOKEN);
  delete detail.earlyHooks; // without the early recorders: this pins the install path itself
  page.bootstrap(detail);
  const original = page.run('Navigator.prototype.getBattery');
  page.toMain({ type: T.CACHE_HIT, [P.FIELDS.TOKEN]: TOKEN });

  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions }));
  assert.strictEqual(page.run('Navigator.prototype.getBattery'), original, 'a cached load hooks nothing');

  const rearm = installDetail(TOKEN, { overrides: FAST, hookDefinitions });
  rearm.rearm = true;
  page.install(rearm);
  assert.notStrictEqual(page.run('Navigator.prototype.getBattery'), original, 'the re-arm hooks the page');
  assert.equal(page.run('navigator.getBattery()'), 'battery');
  assert.deepEqual(page.ofType(T.JS_HOOK_DETECTION).map(m => m.detection.detectorId), ['a']);
  assert.equal(page.run(`${JSON.stringify(FLAG)} in window`), false, 'also after the re-arm');
});

test('the content script drops hook and window reports after a cache hit from the state it passes the engine, never from a global', async () => {
  const ctx = vm.createContext({
    WorkerMessages: require('../modules/core/worker-messages.js'),
    Logger: { debug() {}, detection() {}, error() {}, warn() {}, info() {} },
    setTimeout, clearTimeout, console
  });
  ctx.globalThis = ctx;
  vm.runInContext('var window = this;', ctx);
  for (const file of ['modules/core/bridge-protocol.js', 'modules/core/constants.js', 'utils/pattern-cache.js', 'modules/detection/engine/detection-engine-hooks.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  }
  const types = ctx.ScrapflyBridgeProtocol.MESSAGE_TYPES;
  const added = [];
  const sent = [];
  const hookBatcher = { addHook: (hook) => added.push(hook) };
  const chrome = { runtime: { id: 'ext', sendMessage: async (message) => { sent.push(message.type); } } };
  const report = { type: types.JS_HOOK_DETECTION, url: 'https://a.example/', detection: { detectorId: 'a', hook: { target: 'x' }, timestamp: 1 } };
  const windowReport = { type: types.WINDOW_DETECTIONS, detections: [{ detectorId: 'w' }], timestamp: 1, elapsedMs: 1 };
  const handle = (data, state) => ctx.demHandleHookMessage({ source: vm.runInContext('window', ctx), data }, chrome, hookBatcher, state);

  assert.equal(handle(report, { cacheHit: true }), true);
  assert.equal(handle(windowReport, { cacheHit: true }), true);
  await sleep(10);
  assert.deepEqual(added, [], 'no hook report after a cache hit');
  assert.deepEqual(sent, [], 'no window report either');

  assert.equal(handle(report, { cacheHit: false }), true);
  assert.equal(handle(report), true, 'a caller that does not say is not on a cached load');
  assert.equal(handle(windowReport, {}), true);
  await sleep(10);
  assert.equal(added.length, 2, 'without a cache hit they are batched as before');
  assert.deepEqual(sent, [types.WINDOW_DETECTIONS]);
  // The flag is never read from the global object of the world the engine runs in
  vm.runInContext(`window[${JSON.stringify(FLAG)}] = true;`, ctx);
  handle(report, { cacheHit: false });
  assert.equal(added.length, 3);
});

test('no extension script spells the flag, and the protocol no longer lists it as a shared global', () => {
  const offenders = [];
  const skip = new Set(['node_modules', 'test', 'scripts', '.git', '.claude', 'detectors', '_locales', 'assets', 'icons', 'store']);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(path.join(dir, entry.name)); continue; }
      if (entry.name.endsWith('.js') && fs.readFileSync(path.join(dir, entry.name), 'utf8').includes(FLAG)) offenders.push(path.relative(root, path.join(dir, entry.name)));
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
  assert.deepEqual(Object.keys(P.GLOBALS).sort(), ['LAST_DETECTION']);

  const main = fs.readFileSync(path.join(root, 'content-main-world.js'), 'utf8');
  assert.ok(!/window\[GLOBALS\.CACHE_HIT/.test(main), 'the MAIN world keeps the flag in a variable');
  const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  assert.ok(!/window\[CACHE_HIT/.test(content) && !content.includes('GLOBALS.CACHE_HIT'), 'the content script keeps its own');
  assert.match(content, /handleHookMessage\(\{ source: window, data \}, chrome, hookBatcher, \{ cacheHit: cacheHitEarlyExit \}\)/, 'and hands it to the engine');
});
