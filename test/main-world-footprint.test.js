const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPage, installDetail, bootstrapDetail, sleep, P } = require('./helpers/main-world-page.js');

// The MAIN world shares its global object with the page, so whatever it puts there, any page script can read. The window
// property checks used to count their own page reads with a number kept on window (an own, enumerable property): the page
// could see it, and could write it to silence every hook. The count is a variable of content-main-world.js now, handed to
// the tracker when the checks are set up. What matters is what the page's window holds after the extension has run, and that
// the extension's own reads are still not taken for the page's.

const TOKEN = 'f'.repeat(32);
const T = P.MESSAGE_TYPES;
const FAST = { ACTIVITY_TIMEOUT_MS: 1500, MAX_DETECTION_MS: 3000, MIN_MONITOR_MS: 0, INSTALL_DEBOUNCE_MS: 0 };
const COUNTER = '__scrapflyHookSuppressionDepth';

const hook = (id, targets) => ({ id, name: id.toUpperCase(), category: 'fingerprint',
  hooks: targets.map(target => ({ target, confidence: 70, description: `uses ${target}` })) });
const windowProperty = (path, detectorId = 'w') => ({ path, condition: 'exists', detectorId, detectorName: detectorId.toUpperCase(), category: 'antibot', confidence: 80 });

/** A page with the MAIN world bootstrapped (without the early recorders) and an install event sent. */
function installed({ hooks = [], windowProperties = [], before = '' } = {}) {
  const page = createPage();
  const detail = bootstrapDetail(TOKEN);
  delete detail.earlyHooks; // this pins the install path itself
  page.bootstrap(detail);
  if (before) page.run(before);
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: hooks, windowProperties }));
  return page;
}
/** Ends the page's window polling and hook monitoring, so no timer outlives the test. */
function stop(page) {
  page.toMain({ type: T.STOP_WINDOW_POLLING, [P.FIELDS.TOKEN]: TOKEN });
  page.toMain({ type: T.DISABLE_MONITORING, [P.FIELDS.TOKEN]: TOKEN });
}
async function until(check, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await sleep(25);
  }
}

test('after the window property checks have run, the page\'s window holds nothing the extension put there', async () => {
  const page = installed({
    before: 'window.probe = 1; window.faulty = { get value() { throw new Error("not yet"); } };',
    windowProperties: [windowProperty('probe'), windowProperty('navigator.userAgent'), windowProperty('missing.thing'), windowProperty('faulty.value')]
  });
  await until(() => page.ofType(T.WINDOW_DETECTIONS).length > 0);
  await sleep(300); // a few more polls: the absent and failing paths are read again
  assert.deepEqual(page.ofType(T.WINDOW_DETECTIONS).flatMap(m => m.detections).map(d => d.property.path).sort(), ['navigator.userAgent', 'probe']);
  // Only what this test itself defined: no named property, no symbol
  const { names, symbols } = page.footprint();
  assert.deepEqual({ names: names.sort(), symbols }, { names: ['faulty', 'probe'], symbols: [] });
  assert.equal(page.run(`${JSON.stringify(COUNTER)} in window`), false);
  stop(page);
});

test('the extension\'s own reads are not taken for the page\'s: they report no hook, and the page\'s own call still does', async () => {
  const page = installed({
    before: 'window.faulty = { get value() { throw new Error("not yet"); } };',
    hooks: [hook('h', ['Navigator.prototype.userAgent'])],
    // One property whose read calls the hooked getter, one that is absent, one whose getter throws
    windowProperties: [windowProperty('navigator.userAgent'), windowProperty('missing.thing'), windowProperty('faulty.value')]
  });
  await until(() => page.ofType(T.WINDOW_DETECTIONS).length > 0);
  await sleep(300);
  assert.deepEqual(page.ofType(T.JS_HOOK_DETECTION), [], 'reading navigator.userAgent for a window check is not a call by the page');
  // Whatever the checks found (present, absent, failing), the count is back to nothing: the page's own call reports
  assert.equal(page.run('navigator.userAgent'), 'fake');
  assert.deepEqual(page.ofType(T.JS_HOOK_DETECTION).map(m => m.detection.detectorId), ['h']);
  stop(page);
});

test('a page cannot silence the hooks by writing to its own window', () => {
  const page = installed({ hooks: [hook('h', ['Navigator.prototype.userAgent'])], before: `window[${JSON.stringify(COUNTER)}] = 99;` });
  assert.equal(page.run('navigator.userAgent'), 'fake');
  assert.deepEqual(page.ofType(T.JS_HOOK_DETECTION).map(m => m.detection.detectorId), ['h'], 'the call is reported all the same');
  stop(page);
});

test('a cache hit that arrives while the window checks are running stops them: the page\'s getters are not read again', async () => {
  // A page that loads faster than the cache check starts the checks before the answer comes; what they find is dropped, and each
  // read of a path runs the page's own getter (which can see who is calling)
  const page = installed({
    before: 'window.reads = 0; Object.defineProperty(window, "watched", { configurable: true, get() { window.reads += 1; } });',
    windowProperties: [windowProperty('watched')]
  });
  await until(() => page.run('window.reads') > 0);
  page.toMain({ type: T.CACHE_HIT, [P.FIELDS.TOKEN]: TOKEN });
  const readsAtTheAnswer = page.run('window.reads');
  await sleep(900); // the path is read again every 250 to 300 ms while it stays unmet
  assert.equal(page.run('window.reads'), readsAtTheAnswer, 'no read after the answer');
  assert.deepEqual(page.ofType(T.WINDOW_PROPS_COMPLETE).map(m => m.reason), [P.COMPLETION_REASONS.WINDOW.CACHE_HIT], 'the worker is told once, as when the checks are skipped');
  stop(page);
});

test('a cache hit, a re-arm and the JS API event add to the page\'s window only the documented public global', async () => {
  const page = createPage();
  const detail = bootstrapDetail(TOKEN);
  delete detail.earlyHooks;
  page.bootstrap(detail);
  page.toMain({ type: T.CACHE_HIT, [P.FIELDS.TOKEN]: TOKEN });
  assert.deepEqual(page.footprint(), { names: [], symbols: [] }, 'a cached load');
  const rearm = installDetail(TOKEN, { overrides: FAST, hookDefinitions: [hook('h', ['Navigator.prototype.getBattery'])], windowProperties: [windowProperty('navigator.userAgent')] });
  rearm.rearm = true;
  page.install(rearm);
  await until(() => page.ofType(T.WINDOW_DETECTIONS).length > 0);
  assert.deepEqual(page.footprint(), { names: [], symbols: [] }, 'a scan after the re-arm');
  // The JS API (off unless the person turns it on) hands the last onDetection payload to the page: __scrapflyLastDetection
  page.toMain({ type: T.JS_API_EVENT, eventName: 'onDetection', detail: { detectionCount: 0 }, windowCallback: true, [P.FIELDS.TOKEN]: TOKEN });
  assert.deepEqual(page.footprint(), { names: [P.GLOBALS.LAST_DETECTION], symbols: [] }, 'only the public API\'s own global');
  stop(page);
});
