const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const Commands = require('../background/commands.js');
require('../modules/core/history-store.js');
const HistoryRetention = require('../background/history-retention.js');

test('tabs.onUpdated and onActivated do not reject when the enabled flag cannot be read', async () => {
  let onUpdated, onActivated;
  const context = {
    console, setTimeout, clearTimeout, Date, Map, Set, Promise,
    Logger: { debug() {}, warn() {}, error() {} },
    chrome: {
      tabs: {
        onRemoved: { addListener() {} },
        onUpdated: { addListener(f) { onUpdated = f; } },
        onActivated: { addListener(f) { onActivated = f; } },
        get: async () => ({ url: 'https://shop.test/' })
      },
      action: { setBadgeText: async () => {}, getBadgeText: async () => '' }
    },
    currentActiveTab: null,
    detectionStates: new Map(), activeDetections: new Map(), interruptedDetections: new Map(), batchProcessingFlags: new Map(),
    finalizationDebounce: new Map(), tabsUsingCache: new Set(), workerKeepaliveManager: null,
    Utils: { isValidContentScriptUrl: () => true },
    isExtensionEnabled: async () => { throw new Error('storage is unavailable'); }, stopBadgeSpinner() {}
  };
  vm.createContext(context);
  vm.runInContext(read('background/tab-events.js') + ';setupTabListeners()', context);
  await onUpdated(7, { status: 'loading', url: 'https://shop.test/' }, { url: 'https://shop.test/' });
  await onActivated({ tabId: 7 });
});

test('the rescan shortcut does not leave a rejection when the enabled flag cannot be read', async () => {
  let handler;
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  const chromeApi = { commands: { onCommand: { addListener: (f) => { handler = f; } } }, tabs: { query: async () => [] } };
  const saved = globalThis.isExtensionEnabled;
  globalThis.isExtensionEnabled = async () => { throw new Error('storage is unavailable'); };
  globalThis.Utils = { isValidContentScriptTab: () => true, isUrlBlacklisted: async () => false };
  try {
    Commands.register(chromeApi);
    handler(Commands.RESCAN, { id: 1, url: 'https://shop.test/' });
    await new Promise(r => setTimeout(r, 20));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
    globalThis.isExtensionEnabled = saved;
    delete globalThis.Utils;
  }
});

test('clear on close ignores private windows: only a normal, non-private window keeps History', async () => {
  const store = {
    scrapfly_settings: JSON.stringify({ settings: { history: { historyClearOnClose: true, historyLimit: 0 } } }),
    scrapfly_history: JSON.stringify({ items: [{ id: 'a', timestamp: Date.now() }] })
  };
  const run = async (windows) => {
    global.chrome = {
      storage: { local: { get: async (k) => Object.fromEntries([].concat(k).map(x => [x, store[x]])), set: async (o) => { Object.assign(store, o); } }, onChanged: { addListener() {} } },
      windows: { getAll: async () => windows }
    };
    try { return await HistoryRetention.onWindowRemoved(); } finally { delete global.chrome; }
  };
  assert.equal(await run([{ id: 3, incognito: true }]), 1, 'only a private window remains: clear');
  store.scrapfly_history = JSON.stringify({ items: [{ id: 'a', timestamp: Date.now() }] });
  assert.equal(await run([{ id: 3, incognito: true }, { id: 4, incognito: false }]), 0, 'a normal window remains: keep');
});
