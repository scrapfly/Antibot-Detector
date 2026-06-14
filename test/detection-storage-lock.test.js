const { test } = require('node:test');
const assert = require('node:assert');

// Mirrors acquireDetectionStorageLock's contract. The real helper is module-scoped
// inside detection-engine-manager.js (alongside chrome.* deps), so this verifies
// the serialization guarantee the fix relies on, in isolation.
let chain = Promise.resolve();
function acquire() {
  let release;
  const next = new Promise((r) => { release = r; });
  const prior = chain;
  chain = next;
  return prior.then(() => release);
}

test('critical sections run strictly serially (no interleave)', async () => {
  const order = [];
  const a = (async () => {
    const release = await acquire();
    order.push('A-start');
    await new Promise((r) => setTimeout(r, 20));
    order.push('A-end');
    release();
  })();
  const b = (async () => {
    const release = await acquire();
    order.push('B-start');
    order.push('B-end');
    release();
  })();
  await Promise.all([a, b]);
  // B must not interleave into A's critical section.
  assert.deepStrictEqual(order, ['A-start', 'A-end', 'B-start', 'B-end']);
});
