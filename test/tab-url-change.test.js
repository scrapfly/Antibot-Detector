const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A page that changes its own address without loading (history.replaceState to drop tracking parameters, a
// single-page app's pushState, a #hash) is the same document: the scan running on it went on being cancelled.

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(frame) {
  let onUpdated, onCommitted;
  const context = {
    console, setTimeout, clearTimeout, Date, Map, Set, Promise,
    Logger: { debug() {}, warn() {}, error() {} },
    chrome: {
      tabs: { onRemoved: { addListener() {} }, onUpdated: { addListener(f) { onUpdated = f; } }, onActivated: { addListener() {} } },
      action: { setBadgeText: async () => {} },
      webNavigation: { getFrame: async () => frame(), onCommitted: { addListener(f) { onCommitted = f; } } }
    },
    detectionStates: new Map(), activeDetections: new Map(), interruptedDetections: new Map(), batchProcessingFlags: new Map(),
    finalizationDebounce: new Map(), tabsUsingCache: new Set(), workerKeepaliveManager: null,
    isExtensionEnabled: async () => true, stopBadgeSpinner() {}
  };
  vm.createContext(context);
  vm.runInContext(read('background/detection-session-store.js'), context);
  vm.runInContext(read('background/tab-events.js') + ';setupTabListeners()', context);
  const scan = (documentId = 'doc-1') => {
    const state = { url: 'https://shop.test/?utm_source=x', documentId, hooksData: new Map(), completedMethods: new Set(), timers: new Map() };
    context.detectionStates.set(7, state);
    return state;
  };
  const update = async (changeInfo) => { await onUpdated(7, changeInfo, { url: changeInfo.url }); await flush(); };
  const commit = (documentId) => onCommitted({ tabId: 7, frameId: 0, documentId });
  return { ctx: context, scan, update, commit };
}

test('an address change in the same document keeps the scan running', async () => {
  const h = harness(() => ({ documentId: 'doc-1', url: 'https://shop.test/' }));
  const state = h.scan();
  // Chrome reports history.replaceState as loading with the new address
  for (const changeInfo of [{ url: 'https://shop.test/' }, { status: 'loading', url: 'https://shop.test/#top' }]) {
    await h.update(changeInfo);
    assert.equal(h.ctx.detectionStates.get(7), state, JSON.stringify(changeInfo));
    assert.equal(state.interrupted, undefined);
  }
});

test('a navigation that started under the old document is cancelled when the new one commits', async () => {
  const h = harness(() => ({ documentId: 'doc-1' })); // not committed yet: the frame still holds the old page
  const state = h.scan();
  await h.update({ status: 'loading', url: 'https://shop.test/next' });
  assert.equal(h.ctx.detectionStates.get(7), state);
  h.commit('doc-1'); // the same document (a same-document commit) changes nothing
  assert.equal(h.ctx.detectionStates.get(7), state);
  h.commit('doc-2');
  assert.equal(h.ctx.detectionStates.has(7), false);
  assert.equal(state.interrupted, true);
});

test('an address change that brought another document cancels the scan', async () => {
  const h = harness(() => ({ documentId: 'doc-2', url: 'https://shop.test/next' }));
  const state = h.scan();
  await h.update({ url: 'https://shop.test/next' });
  assert.equal(h.ctx.detectionStates.has(7), false);
  assert.equal(state.interrupted, true);
});

test('status-only loading from a same-document history update preserves main results and pending hooks', async () => {
  const h = harness(() => ({ documentId: 'doc-1' }));
  const state = h.scan();
  state.mainStarted = true;
  state.mainComplete = true;
  state.mainData = [{ detector: { id: 'detect-example' } }];
  await h.update({ status: 'loading' });
  assert.equal(h.ctx.detectionStates.get(7), state);
  assert.equal(state.interrupted, undefined);
  assert.equal(state.mainData.length, 1);
});

test('status-only loading waits for a different document before cancelling a reload', async () => {
  const h = harness(() => ({ documentId: 'doc-1' }));
  const state = h.scan();
  await h.update({ status: 'loading' });
  assert.equal(h.ctx.detectionStates.get(7), state);
  h.commit('doc-2');
  assert.equal(h.ctx.detectionStates.has(7), false);
  assert.equal(state.interrupted, true);
});

test('status-only loading cancels when the new document is already committed', async () => {
  const h = harness(() => ({ documentId: 'doc-2' }));
  const state = h.scan();
  await h.update({ status: 'loading' });
  assert.equal(h.ctx.detectionStates.has(7), false);
  assert.equal(state.interrupted, true);
});

test('a scan whose document is not known is cancelled as before', async () => {
  const h = harness(() => ({ documentId: 'doc-1' }));
  const state = h.scan(null);
  await h.update({ url: 'https://shop.test/' });
  assert.equal(state.interrupted, true);
});
