const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function popups() {
  const listeners = [];
  const toggles = [];
  const context = vm.createContext({
    WorkerMessages: require('../modules/core/worker-messages.js'),
    Logger: { debug() {} },
    chrome: { runtime: { onMessage: { addListener: fn => listeners.push(fn) } } },
    document: { addEventListener() {} }, window: { addEventListener() {} }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/core/bridge-protocol.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8') + '\nthis.Popup = ScrapflyPopup;', context);
  for (let i = 0; i < 2; i++) {
    const popup = Object.create(context.Popup.prototype);
    Object.assign(popup, {
      currentTab: 'history', detectionViewRequestId: 0,
      detection: { setExtensionEnabled: enabled => toggles.push([i, enabled]) }
    });
    popup.setupMessageHandlers();
  }
  // Chrome delivers a message to every listener, but only the first response wins.
  const request = message => new Promise(resolve => {
    for (const listener of listeners) listener(message, {}, resolve);
    queueMicrotask(() => resolve({ status: 'ok', data: { owner: 'worker' } }));
  });
  return { request, toggles, context };
}

test('two popup listeners leave worker requests to the worker', async () => {
  const { request, context } = popups();
  for (const type of ['ADVANCED_HISTORY', context.WorkerMessages.REQUEST_DETECTION, 'FUTURE_WORKER_REQUEST']) {
    assert.deepEqual(await request({ type, method: 'load', args: [] }), { status: 'ok', data: { owner: 'worker' } }, type);
  }
});

test('multiple popups still apply their own toggle notifications', async () => {
  const { request, toggles, context } = popups();
  await request({ type: context.WorkerMessages.EXTENSION_TOGGLE_CHANGED, enabled: false });
  assert.deepEqual(toggles, [[0, false], [1, false]]);
});
