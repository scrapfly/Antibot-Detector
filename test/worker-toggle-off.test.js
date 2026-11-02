const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Switching the extension off: a scan already under way must not finish into it (its result over the OFF badge, a History
// entry, a webhook delivery). The handler cancels every scan and its spinner before the OFF badges are written.

function harness() {
  const order = [];
  const spinners = [];
  const context = {
    console, Map, Set, Promise,
    WorkerMessages: require('../modules/core/worker-messages.js'),
    Logger: new Proxy({}, { get: () => () => {} }),
    SettingsStore: { registerHandlers() {} },
    MessageSender: require('../modules/core/message-sender.js'),
    detectionStates: new Map(), activeDetections: new Map(),
    DetectionSessionStore: { cancel: (tabId, reason) => { order.push(`cancel:${tabId}:${reason}`); return true; } },
    stopBadgeSpinner: (tabId) => spinners.push(tabId),
    DetectionEngineManager: {}, CategoryManager: {}, categoryManager: {}, detectorManager: {},
    Settings: { handleEnableToggle: async (enabled) => { order.push(`toggle:${enabled}`); } }
  };
  vm.createContext(context);
  vm.runInContext(read('background/handlers/messages-settings.js'), context, { filename: 'messages-settings.js' });
  const registry = {};
  context.registerSettingsHandlers(registry, {});
  const send = (enabled) => new Promise((resolve) => {
    registry[context.WorkerMessages.EXTENSION_TOGGLE_CHANGED]({ request: { enabled }, sender: undefined, sendResponse: resolve });
  });
  return { context, order, spinners, send };
}

test('switching off cancels every scan and its spinner, before the OFF badges are written', async () => {
  const h = harness();
  h.context.detectionStates.set(3, {});
  h.context.detectionStates.set(4, {});
  h.context.activeDetections.set(4, {});
  h.context.activeDetections.set(9, {}); // a scan with no state of its own is cancelled too
  const response = await h.send(false);
  assert.equal(response.status, 'success');
  assert.deepEqual(h.order, ['cancel:3:disabled', 'cancel:4:disabled', 'cancel:9:disabled', 'toggle:false']);
  assert.deepEqual(h.spinners.sort(), [3, 4, 9]);
});

test('switching on cancels nothing', async () => {
  const h = harness();
  h.context.detectionStates.set(3, {});
  await h.send(true);
  assert.deepEqual(h.order, ['toggle:true']);
  assert.deepEqual(h.spinners, []);
});
