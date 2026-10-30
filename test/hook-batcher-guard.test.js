const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The content script batches the MAIN world's hook reports before the worker. A report without its detector or
// target used to throw at the dedupe key on every flush, so the whole batch, and every one after it, was lost.

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

const report = (detectorId, target) => ({ detection: { detectorId, hook: { target }, timestamp: 1 }, url: 'https://a.example/', timestamp: 1 });

test('malformed hook reports are dropped and the good ones still go out once each', () => {
  const sent = [];
  const chrome = { runtime: { id: 'ext', sendMessage: (message) => { sent.push(message); return Promise.resolve(); } } };
  const batcher = ctx.demCreateHookBatcher(chrome);
  batcher.addHook(null);
  batcher.addHook({});
  batcher.addHook({ detection: null });
  batcher.addHook({ detection: { detectorId: 7, hook: { target: 'A.b' } } });
  batcher.addHook({ detection: { detectorId: 'x', hook: null } });
  batcher.addHook({ detection: { detectorId: 'x', hook: { target: {} } } });
  batcher.addHook(report('a', 'Navigator.prototype.getBattery'));
  batcher.addHook(report('a', 'Navigator.prototype.getBattery'));
  batcher.addHook(report('b', 'Navigator.prototype.getBattery'));
  assert.doesNotThrow(() => batcher.flush());
  batcher.clearTimeout();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].detections.length, 2, 'one report per detector and target');
});
