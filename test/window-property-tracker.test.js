const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The window-property tracker runs in the MAIN world; load it into a fake window
// and drive it with the config and protocol the real MAIN world hands it.
require('../modules/core/bridge-protocol.js');
require('../modules/core/hooks-config.js');
const P = globalThis.ScrapflyBridgeProtocol;
const HooksConfig = globalThis.HooksConfig;
const root = path.join(__dirname, '..');

function loadTracker(pageGlobals = {}) {
  const context = vm.createContext({ Date, Math, JSON, Object, Map, Set, String, setTimeout, clearTimeout });
  Object.defineProperties(context, Object.getOwnPropertyDescriptors(pageGlobals));
  context.window = context;
  context.globalThis = context;
  context.location = { href: 'https://example.test/' };
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/detection/hooks/window-property-tracker.js'), 'utf8'), context);
  return { tracker: context.__WindowPropertyTracker, context };
}

function init(tracker, paths, config = HooksConfig.defaults) {
  const detections = [];
  tracker.initialize(paths.map((p) => ({ path: p, detectorId: 'd', detectorName: 'D', category: 'c' })), {
    protocol: P, config, onDetection: (d) => detections.push(...d)
  });
  return detections;
}

test('polling phases keep the 2.8 order, intervals and boundaries', () => {
  const { tracker } = loadTracker();
  init(tracker, []);
  assert.deepStrictEqual(tracker.pollingPhases.map(p => [p.name, p.interval, p.endsAt]), [
    ['EARLY', 100, 2000], ['NORMAL', 200, 10000], ['LATE', 500, 30000], ['FINAL', 1000, 60000]
  ]);
  const at = (ms) => tracker._determinePhase(ms).name;
  assert.deepStrictEqual([at(0), at(1999), at(2000), at(9999), at(10000), at(29999), at(30000), at(1e9)],
    ['EARLY', 'EARLY', 'NORMAL', 'NORMAL', 'LATE', 'LATE', 'FINAL', 'FINAL']);
});

test('retry backoffs keep the 2.8 delays', () => {
  const { tracker } = loadTracker();
  init(tracker, []);
  const r = tracker.retryConfig;
  // pathNotFound: min(100 + n x 50, 1000); propertyAbsent: min(200 + n x 50, 2000)
  assert.deepStrictEqual([1, 2, 18, 19].map(r.pathNotFound.delay), [150, 200, 1000, 1000]);
  assert.deepStrictEqual([1, 2, 36, 37].map(r.propertyAbsent.delay), [250, 300, 2000, 2000]);
  // getterError: min(50 x 1.5^(n-1), 2000)
  assert.deepStrictEqual([1, 2, 3, 20].map(r.getterError.delay), [50, 75, 112.5, 2000]);
  assert.deepStrictEqual([r.pathNotFound.maxRetries, r.getterError.maxRetries, r.propertyAbsent.maxRetries], [100, 10, 50]);
});

test('each lookup outcome maps to the 2.8 state and retry policy', () => {
  let throwing = true;
  const page = {
    present: { yes: 1, no: 0, nothing: null, text: 'abc' },
    api: { get flaky() { if (throwing) throw new Error('not yet'); return 1; } }
  };
  const { tracker } = loadTracker(page);
  init(tracker, ['present.yes', 'present.no', 'missing.x', 'present.missing', 'present.nothing.x', 'present.text.x', 'api.flaky']);
  tracker._performPollingCheck();
  const state = (p) => [tracker.properties.get(p).state, tracker.properties.get(p).retryCount];
  assert.deepStrictEqual(state('present.yes'), ['DETECTED', 0]);
  assert.deepStrictEqual(state('present.no'), ['NOT_MATCHED', 1]);      // condition unmet: propertyAbsent retry
  assert.deepStrictEqual(state('missing.x'), ['PATH_NOT_FOUND', 1]);
  assert.deepStrictEqual(state('present.missing'), ['PROPERTY_ABSENT', 1]);
  assert.deepStrictEqual(state('present.nothing.x'), ['PROPERTY_ABSENT', 1]); // parent null counts as absent
  assert.deepStrictEqual(state('present.text.x'), ['PENDING', 1]);       // `in` on a primitive throws: getter retry
  assert.deepStrictEqual(state('api.flaky'), ['PENDING', 1]);
  assert.strictEqual(tracker.properties.get('api.flaky').lastError, 'not yet');
  // getterError backoff was used (50 ms), propertyAbsent for the unmet condition (250 ms)
  const wait = (p) => tracker.properties.get(p).nextRetryTime - tracker.properties.get(p).lastCheckTime;
  assert.ok(wait('api.flaky') >= 50 && wait('api.flaky') < 60, `api.flaky waited ${wait('api.flaky')}`);
  assert.ok(wait('present.no') >= 250 && wait('present.no') < 260);
  throwing = false;
  tracker.properties.get('api.flaky').nextRetryTime = 0;
  tracker._performPollingCheck();
  assert.strictEqual(tracker.properties.get('api.flaky').state, 'DETECTED');
});

test('a property is abandoned after its policy\'s max retries', () => {
  const { tracker } = loadTracker();
  init(tracker, ['missing.x'], HooksConfig.resolve({ WINDOW_RETRY_PATH_MAX: 2 }));
  for (let i = 0; i < 3; i++) {
    tracker.properties.get('missing.x').nextRetryTime = 0;
    tracker._performPollingCheck();
  }
  assert.strictEqual(tracker.properties.get('missing.x').state, 'ABANDONED');
  assert.strictEqual(tracker.stats.abandoned, 1);
  assert.strictEqual(tracker._allPropertiesTerminal(), true);
});
