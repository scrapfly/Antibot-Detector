const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// background/init.js, chrome.runtime.onInstalled: a build can change what a scan finds (the engine, the extractors, the hooks)
// without any detector changing, and a saved result is served for days. After an update the results the previous build saved are
// not served by this one (the rules revision moves, see DetectionEngineManager.bumpRulesRevision), so each page is scanned again
// with the new code the next time it is opened.

function harness({ merged = { installed: 0, rerated: 0, unmarked: 0 }, bump = async () => 1 } = {}) {
  const calls = [];
  let onInstalled = null;
  const noop = { init() {}, setupAlarmListener() {}, scheduleCheck() {}, initWebhookRetries() {}, setQuotaRelief() {}, setBudget() {},
    shedStoredDetections() {}, syncOverrideFromStorage() {} };
  const context = {
    console, Date, Promise, Map, Set, setTimeout,
    initializationInProgress: false, initializationPromise: null,
    workerKeepaliveManager: {}, WorkerKeepaliveManager: class {},
    ensureDetectorManagerInitialized: async () => {},
    detectorManager: { getDetectorCount: () => 3, initialized: true },
    Constants: { DETECTOR_LOAD_MAX_RETRIES: 0, DETECTOR_LOAD_RETRY_DELAY: 0 },
    Logger: new Proxy({}, { get: () => () => {} }),
    isExtensionEnabled: async () => true,
    activeDetections: new Map(), detectionStates: new Map(),
    setBadgeTextColor: () => {},
    DetectionSessionStore: { cancel() {} },
    UpdateManager: { ...noop,
      mergeBundledDetectors: async () => { calls.push('merge'); return merged; },
      notifyDetectorsChanged: async () => { calls.push('detectors-changed'); },
      pruneIncompatibleUpdates: async () => { calls.push('prune'); },
      scheduleCheck() { calls.push('schedule'); } },
    HistoryRetention: noop, HistoryBackup: noop, BackgroundTabScan: noop, HistoryWatch: noop,
    CookieTimelineRecorder: noop, BulkScanRunner: noop, SettingsRuntime: noop, HistoryStore: noop,
    DetectionEngineManager: { ...noop, bumpRulesRevision: async () => { calls.push('bump'); return bump(); } },
    I18n: noop, DetectionCacheRetention: noop,
    chrome: {
      runtime: { onInstalled: { addListener(fn) { onInstalled = fn; } }, onStartup: { addListener() {} } },
      tabs: { query: async () => [] },
      action: { getBadgeText: async () => '', setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} }
    }
  };
  vm.createContext(context);
  for (const file of ['modules/core/badge-constants.js', 'background/init.js']) vm.runInContext(read(file), context, { filename: file });
  return { calls, fire: (details) => onInstalled(details) };
}

test('an update moves the rules revision, so what the previous build saved is not served', async () => {
  const h = harness();
  await h.fire({ reason: 'update', previousVersion: '3.1.3' });
  assert.deepEqual(h.calls.filter(c => c === 'bump'), ['bump'], 'once');
  assert.ok(h.calls.includes('schedule'), 'the rest of the update work still runs');
});

test('a first install, and an update of the browser alone, leave the saved results as they are', async () => {
  for (const reason of ['install', 'chrome_update', 'browser_update', 'shared_module_update']) {
    const h = harness();
    await h.fire({ reason });
    assert.ok(!h.calls.includes('bump'), reason);
  }
});

test('a detector change in the same update has already done it: no second move', async () => {
  const h = harness({ merged: { installed: 1, rerated: 0, unmarked: 0 } });
  await h.fire({ reason: 'update', previousVersion: '3.1.3' });
  assert.ok(h.calls.includes('detectors-changed'));
  assert.ok(!h.calls.includes('bump'), 'one move is enough');
});

test('a revision that cannot be written does not stop the rest of the update', async () => {
  const h = harness({ bump: async () => { throw new Error('storage is unavailable'); } });
  await h.fire({ reason: 'update', previousVersion: '3.1.3' });
  assert.ok(h.calls.includes('prune') && h.calls.includes('schedule'));
});
