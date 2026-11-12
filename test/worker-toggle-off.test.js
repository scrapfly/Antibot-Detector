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
    Settings: { handleEnableToggle: async (enabled) => { order.push(`toggle:${enabled}`); } },
    // The held webhook deliveries' alarm: re-armed when the extension is switched back on
    SettingsRuntime: { _scheduleWebhookRetries: async () => { order.push('webhook-retries'); } }
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

test('switching on cancels nothing, and re-arms the alarm of the held webhook deliveries', async () => {
  const h = harness();
  h.context.detectionStates.set(3, {});
  await h.send(true);
  // The alarm that retries a held delivery is one-shot: it went off while the extension was off (and sent nothing), so without
  // this a delivery held for an hour waits out the hour even though the extension is on again after ten minutes
  assert.deepEqual(h.order, ['toggle:true', 'webhook-retries']);
  assert.deepEqual(h.spinners, []);
});

test('switching off does not arm the retry alarm', async () => {
  const h = harness();
  await h.send(false);
  assert.ok(!h.order.includes('webhook-retries'));
});

test('switching off stops the background work too: the watchlist check under way, before the OFF badges are written', async () => {
  const h = harness();
  h.context.HistoryWatch = { stop: (reason) => { h.order.push(`watch-stop:${reason}`); return true; } };
  h.context.detectionStates.set(3, {});
  assert.equal((await h.send(false)).status, 'success');
  assert.deepEqual(h.order, ['cancel:3:disabled', 'watch-stop:off', 'toggle:false']);
  // Switched on again, nothing of it is stopped
  const on = harness();
  on.context.HistoryWatch = { stop: (reason) => { on.order.push(`watch-stop:${reason}`); return true; } };
  await on.send(true);
  assert.ok(!on.order.some(step => step.startsWith('watch-stop')));
});

test('switching off pauses a Bulk scan at once (after the watchlist stops, before the OFF badges); switching on lets it be resumed', async () => {
  const withBoth = () => {
    const h = harness();
    h.context.HistoryWatch = { stop: (reason) => { h.order.push(`watch-stop:${reason}`); return true; } };
    h.context.BulkScanRunner = {
      hold: async (reason) => { h.order.push(`bulk-hold:${reason}`); return true; },
      release: async (reason) => { h.order.push(`bulk-release:${reason}`); return true; }
    };
    return h;
  };
  const off = withBoth();
  assert.equal((await off.send(false)).status, 'success');
  assert.deepEqual(off.order, ['watch-stop:off', 'bulk-hold:off', 'toggle:false']);
  const on = withBoth();
  assert.equal((await on.send(true)).status, 'success');
  // On again, the run held for it stops saying the extension is off; it waits for the person's Resume
  assert.deepEqual(on.order, ['toggle:true', 'webhook-retries', 'bulk-release:off']);
  // A Bulk scan that cannot be reached does not keep the switch from being answered
  const broken = withBoth();
  broken.context.BulkScanRunner.hold = async () => { throw new Error('session storage unavailable'); };
  assert.equal((await broken.send(false)).status, 'success');
  assert.deepEqual(broken.order, ['watch-stop:off', 'toggle:false']);
});
