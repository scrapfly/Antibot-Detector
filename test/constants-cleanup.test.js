const { test } = require('node:test');
const assert = require('node:assert');

// constants.js attaches to globalThis on load.
require('../modules/core/constants.js');
const C = globalThis.Constants;

test('dead constants removed in the cleanup are gone', () => {
  assert.strictEqual(C.COMPLETION_DELAY, undefined, 'COMPLETION_DELAY should have been removed');
  assert.strictEqual(C.MAX_STORED_DETECTIONS, undefined, 'MAX_STORED_DETECTIONS should have been removed');
});

test('live constants are still present and numeric', () => {
  assert.ok(C, 'Constants should be defined');
  for (const key of ['NETWORK_DATA_TTL', 'CAPTURE_STATE_TTL', 'MATCH_CACHE_TTL']) {
    assert.strictEqual(typeof C[key], 'number', `${key} should be a number`);
  }
});

test('Constants object is frozen (immutable config)', () => {
  assert.strictEqual(Object.isFrozen(C), true);
});
