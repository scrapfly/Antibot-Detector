const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The content script forwards the MAIN world's completion signals to the worker. WINDOW_PROPS_COMPLETE lost
// its reason on the way, so the worker never saw 'cache_hit' and opened, on every cached page load, a scan
// that never finished.

const root = path.join(__dirname, '..');
const ctx = vm.createContext({
  WorkerMessages: require('../modules/core/worker-messages.js'),
  Logger: { debug() {}, detection() {}, error() {}, warn() {}, info() {} },
  setTimeout, clearTimeout, console
});
ctx.globalThis = ctx;
vm.runInContext('var window = this;', ctx);
for (const file of ['modules/core/bridge-protocol.js', 'modules/core/constants.js', 'utils/pattern-cache.js', 'modules/detection/engine/detection-engine-hooks.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}
const T = ctx.ScrapflyBridgeProtocol.MESSAGE_TYPES;

test('WINDOW_PROPS_COMPLETE reaches the worker with its reason, count checked and time', async () => {
  const sent = [];
  const chrome = { runtime: { id: 'ext', sendMessage: async (message) => { sent.push(message); } } };
  const data = { type: T.WINDOW_PROPS_COMPLETE, url: 'https://a.example/', timestamp: 1, detectedCount: 2, totalChecked: 40, elapsedMs: 12, reason: 'cache_hit' };
  assert.equal(ctx.demHandleHookMessage({ source: vm.runInContext('window', ctx), data }, chrome, null), true);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(sent.length, 1);
  const { type, url, timestamp, detectedCount, totalChecked, elapsedMs, reason } = sent[0];
  assert.deepEqual({ type, url, timestamp, detectedCount, totalChecked, elapsedMs, reason }, data);
});
