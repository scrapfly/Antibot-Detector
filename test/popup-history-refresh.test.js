'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A scan result reached the popup as NEW_DETECTION_DATA, and the popup answered by re-reading and re-parsing the whole stored
// History (a plain storage read of one string, 6 to 25 MB on a full History), for every result, when the tab was not even shown:
// the list was drawn from the old data, because the worker tells the popup first and saves to History afterwards; the storage
// listener then did the same again 300 ms later; late evidence repeated it with no History write at all; and the first message
// initialised the History tab. The History tab already follows what the worker stores (a redraw once, a moment after the last
// write), so a scan result asks nothing of it.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function load({ currentTab = 'detection', historyInitialized = true } = {}) {
  const timers = new Map();
  let timerId = 0;
  const listeners = { storage: [], message: [] };
  const log = { reads: 0, draws: 0, initialised: 0, processed: 0, limits: 0 };
  const context = vm.createContext({
    console, Date, JSON, Math, Intl, Object, Array, String, Number, Promise, Set, Map, URL,
    clearTimeout: (id) => timers.delete(id),
    setTimeout: (fn) => { const id = ++timerId; timers.set(id, fn); return id; },
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: { t: (key, fallback) => fallback },
    NotificationHelper: { error() {}, success() {} },
    Utils: { getHistorySettings: async () => ({}), getSettings: async () => ({}) },
    WorkerMessages: require('../modules/core/worker-messages.js'),
    document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, activeElement: null },
    window: { addEventListener() {} },
    chrome: {
      runtime: { getURL: (p) => p, onMessage: { addListener: (fn) => listeners.message.push(fn) } },
      storage: { local: {}, onChanged: { addListener: (fn) => listeners.storage.push(fn) } },
      tabs: { query: (info, callback) => callback([{ id: 7, url: 'https://shop.example/cart' }]) }
    }
  });
  context.self = context; context.globalThis = context;
  for (const file of ['modules/core/bridge-protocol.js', 'modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/history-policy.js',
    'modules/core/history-store.js', 'modules/core/history-export.js', 'modules/settings/backup-bundle.js']) {
    vm.runInContext(read(file), context);
  }
  vm.runInContext(read('sections/history/history.js') + '\n;globalThis.History = globalThis.History || History;', context);
  vm.runInContext(read('popup.js') + '\n;globalThis.ScrapflyPopup = ScrapflyPopup;', context, { filename: 'popup.js' });

  // The real History, as the popup's History tab runs it: what it reads is counted, and what it draws
  const history = Object.create(context.History.prototype);
  Object.assign(history, {
    historyItems: [], historyLimit: 0, initialized: historyInitialized,
    initialize: async () => { log.initialised++; history.initialized = true; },
    refreshHistoryLimit: async () => { log.limits++; },
    refreshDetectionSort: async () => {},
    warnIfWorkerOutdated: async () => {},
    loadHistoryFromStorage: async () => { log.reads++; },
    renderHistory: () => { log.draws++; }
  });
  if (historyInitialized) history.registerSettingsListener();

  const popup = Object.create(context.ScrapflyPopup.prototype);
  Object.assign(popup, {
    currentTab, detectionViewRequestId: 0, history,
    detection: { setExtensionEnabled() {} },
    processDetectionData: async () => { log.processed++; },
    requestCurrentTabDetection: async () => {}
  });
  popup.setupMessageHandlers();
  const popupListener = listeners.message[listeners.message.length - 1];
  const scanResult = (extra = {}) => popupListener({
    type: context.WorkerMessages.NEW_DETECTION_DATA, tabId: 7, url: 'https://shop.example/cart',
    detectionResults: [{ detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 90 }], expiry: Date.now() + 1000, ...extra
  }, {}, () => {});
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const fireTimers = async () => { for (const fn of [...timers.values()]) fn(); timers.clear(); await settle(); };
  const stored = () => { for (const listener of listeners.storage) listener({ scrapfly_history: {} }, 'local'); };
  return { popup, history, log, timers, scanResult, settle, fireTimers, stored };
}

for (const currentTab of ['detection', 'history', 'rules']) {
  test(`a scan result does not make the popup read or redraw History (popup on the ${currentTab} tab)`, async () => {
    const h = load({ currentTab });
    h.scanResult();
    h.scanResult({ detectionResults: [] });
    await h.settle();
    await h.fireTimers();
    assert.equal(h.log.reads, 0, 'History is not read for a scan result');
    assert.equal(h.log.draws, 0, 'nor drawn');
    assert.equal(h.log.limits, 0, 'nor asked for its limit');
    assert.equal(h.log.initialised, 0, 'and the first message does not initialise the History tab');
    assert.equal(h.timers.size, 0, 'nothing is waiting to redraw it');
    assert.equal(h.log.processed, currentTab === 'detection' ? 2 : 0, 'the Detection tab still takes the results that came with the message');
  });
}

test('a History that was never opened is not initialised by a scan result either; opening it reads it once', async () => {
  const h = load({ currentTab: 'detection', historyInitialized: false });
  h.scanResult();
  await h.settle();
  assert.equal(h.log.initialised, 0);
  assert.equal(h.log.reads, 0);
});

test('an open History still follows the worker: one redraw a moment after the last write of the scan, whatever the number of messages', async () => {
  const h = load({ currentTab: 'history' });
  // The worker tells the popup first and saves afterwards, and late evidence tells it again: three messages, two writes
  h.scanResult();
  h.stored();
  h.scanResult();
  h.stored();
  h.scanResult();
  await h.settle();
  assert.equal(h.log.reads, 0, 'before the last write: nothing read');
  assert.equal(h.timers.size, 1, 'the writes wait for one redraw');
  await h.fireTimers();
  assert.equal(h.log.reads, 1, 'the History is read once');
  assert.equal(h.log.draws, 1, 'and drawn once, from what the worker saved');
});

test('the popup handler no longer names History at all', () => {
  const source = read('popup.js');
  const handler = source.slice(source.indexOf('case WorkerMessages.NEW_DETECTION_DATA:'), source.indexOf('case WorkerMessages.EXTENSION_TOGGLE_CHANGED'));
  assert.ok(handler.length > 200, 'the case was found');
  assert.doesNotMatch(handler, /history|displayHistory/i);
});
