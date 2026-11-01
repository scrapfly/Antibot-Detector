const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// background/init.js: what the toolbar badges say after the service worker starts (it restarts after about 30 s of idling,
// with every in-memory map empty, while the toolbar still shows each page's result).

function harness({ enabled = true, tabs = [] } = {}) {
  const badges = new Map(tabs.map(tab => [tab.id, tab.badge]));
  const writes = [];
  const noop = { init() {}, setupAlarmListener() {}, scheduleCheck() {}, initWebhookRetries() {}, setQuotaRelief() {}, setBudget() {},
    shedStoredDetections() {}, syncOverrideFromStorage() {} };
  const listener = { addListener() {} };
  const context = {
    console, Date, Promise, Map, Set, setTimeout,
    initializationInProgress: false, initializationPromise: null,
    workerKeepaliveManager: {}, WorkerKeepaliveManager: class {},
    ensureDetectorManagerInitialized: async () => {},
    detectorManager: { getDetectorCount: () => 3 },
    Constants: { DETECTOR_LOAD_MAX_RETRIES: 0, DETECTOR_LOAD_RETRY_DELAY: 0 },
    Logger: new Proxy({}, { get: () => () => {} }),
    isExtensionEnabled: async () => enabled,
    activeDetections: new Map(), detectionStates: new Map(),
    setBadgeTextColor: () => {},
    UpdateManager: noop, HistoryRetention: noop, HistoryBackup: noop, BackgroundTabScan: noop, HistoryWatch: noop,
    CookieTimelineRecorder: noop, BulkScanRunner: noop, SettingsRuntime: noop, HistoryStore: noop, DetectionEngineManager: noop,
    I18n: noop, DetectionCacheRetention: noop,
    chrome: {
      runtime: { onInstalled: listener, onStartup: listener },
      tabs: { query: async () => tabs.map(tab => ({ id: tab.id })) },
      action: {
        getBadgeText: async ({ tabId }) => badges.get(tabId) || '',
        setBadgeText: async ({ text, tabId }) => { writes.push({ tabId, text }); badges.set(tabId, text); },
        setBadgeBackgroundColor: async () => {}
      }
    }
  };
  vm.createContext(context);
  for (const file of ['modules/core/badge-constants.js', 'background/init.js']) vm.runInContext(read(file), context, { filename: file });
  return { context, writes, badges };
}

test('a worker that restarts keeps the result each tab shows, and clears only an OFF badge or a scan spinner', async () => {
  const h = harness({ tabs: [{ id: 1, badge: '3' }, { id: 2, badge: 'OFF' }, { id: 3, badge: '' }, { id: 4, badge: '2' }] });
  const { BADGE } = h.context;
  assert.equal(await h.context.initialize('startup'), true);
  assert.equal(h.badges.get(1), '3', 'a result stays');
  assert.equal(h.badges.get(4), '2');
  assert.equal(h.badges.get(2), BADGE.TEXT.EMPTY, 'the OFF of a switch turned on is cleared');
  assert.deepEqual(h.writes.map(write => write.tabId), [2], 'nothing else is written');
});

test('a tab with a scan in the worker is left alone, and switched off every tab says OFF', async () => {
  const running = harness({ tabs: [{ id: 5, badge: 'OFF' }] });
  running.context.detectionStates.set(5, {});
  await running.context.initialize('startup');
  assert.deepEqual(running.writes, [], 'its own scan decides what it shows');

  const off = harness({ enabled: false, tabs: [{ id: 1, badge: '3' }] });
  await off.context.initialize('startup');
  assert.equal(off.badges.get(1), off.context.BADGE.TEXT.DISABLED);
});
