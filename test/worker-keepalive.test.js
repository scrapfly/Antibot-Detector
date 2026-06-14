const { test } = require('node:test');
const assert = require('node:assert');

globalThis.Logger = globalThis.Logger || { background() {}, warn() {} };
globalThis.Constants = globalThis.Constants || { KEEPALIVE_PERIOD_MS: 20000, STALE_OPERATION_MS: 120000 };
globalThis.chrome = globalThis.chrome || { runtime: { getPlatformInfo: async () => ({}) } };

const WorkerKeepaliveManager = require('../modules/detection/hooks/worker-keepalive-manager.js');

test('stale operations are swept and keepalive stops when none remain', () => {
  const m = new WorkerKeepaliveManager();
  m.startOperation('detection-1', { tabId: 1 });
  assert.strictEqual(m.isRunning, true);
  // Backdate the op well past the stale threshold (simulates a leaked op).
  m.activeOperations.get('detection-1').startTime = Date.now() - (m.staleOperationMs + 1000);
  m._sweepStaleOperations();
  assert.strictEqual(m.activeOperations.size, 0);
  assert.strictEqual(m.isRunning, false); // interval cleared, worker may suspend
});

test('fresh operations are not swept', () => {
  const m = new WorkerKeepaliveManager();
  m.startOperation('detection-2', { tabId: 2 });
  m._sweepStaleOperations();
  assert.strictEqual(m.activeOperations.size, 1);
  m._stopKeepalive(); // clear the interval so the test runner can exit
});
