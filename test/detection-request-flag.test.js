const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A request that fails before the worker is asked (storage unavailable, a bad address) must not leave the
// "already requesting" flag set: every later request would be skipped and the tab would stay as it is.

function load({ storageFails }) {
  const sent = [];
  const context = vm.createContext({
    console, URL,
    WorkerMessages: require('../modules/core/worker-messages.js'),
    Logger: { debug() {}, error() {}, warn() {} },
    chrome: {
      tabs: { query: async () => [{ id: 7, url: 'https://shop.example/' }] },
      storage: { local: { get: async () => { if (storageFails) throw new Error('storage gone'); return {}; } } },
      runtime: { sendMessage: (message, callback) => { sent.push(message); } }
    }
  });
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/detection/detection-requests.js'), 'utf8'), context);
  const states = [];
  const detection = {
    isRequestingDetection: false,
    showEmptyState: (state) => states.push(state.outcome),
    setExtensionEnabled() {}
  };
  const Utils = { isUrlBlacklisted: async () => false, isValidContentScriptTab: () => true };
  return { DetectionRequests: context.DetectionRequests, detection, Utils, states, sent };
}

test('a failed request clears its flag, so the next one runs', async () => {
  const h = load({ storageFails: true });
  await h.DetectionRequests.requestCurrentTabDetection({ detection: h.detection, Utils: h.Utils });
  assert.deepEqual(h.states, ['failed']);
  assert.equal(h.detection.isRequestingDetection, false);
});

test('a request sent to the worker keeps its flag until the answer arrives', async () => {
  const h = load({ storageFails: false });
  await h.DetectionRequests.requestCurrentTabDetection({ detection: h.detection, Utils: h.Utils });
  assert.equal(h.sent.length, 1);
  assert.equal(h.detection.isRequestingDetection, true, 'the duplicate guard holds while the worker answers');
});
