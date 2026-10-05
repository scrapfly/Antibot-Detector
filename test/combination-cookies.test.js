const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Runs the real engine's runDetector on cookie rows: in a combination
// detector every row is its own condition, so two rows may match the same
// cookie; other detectors keep counting a cookie once, without pattern ids.

const root = path.join(__dirname, '..');
globalThis.Constants = globalThis.Constants || { PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 };
globalThis.Logger = globalThis.Logger || { warn() {}, debug() {}, error() {}, detection() {}, cache() {}, get debugMode() { return false; } };
Object.assign(globalThis, require(path.join(root, 'utils/pattern-cache.js')));
require(path.join(root, 'modules/core/bridge-protocol.js'));
for (const f of ['analysis', 'extractors', 'matching', 'hooks']) {
  Object.assign(globalThis, require(path.join(root, `modules/detection/engine/detection-engine-${f}.js`)));
}
globalThis.DetectionCombinations = require(path.join(root, 'modules/detection/detection-combinations.js'));
if (typeof globalThis.DetectionEngineManager !== 'function') {
  vm.runInThisContext(fs.readFileSync(path.join(root, 'modules/detection/engine/detection-engine-manager.js'), 'utf8')
    + '\n;globalThis.DetectionEngineManager = DetectionEngineManager;');
}
const engine = Object.create(globalThis.DetectionEngineManager.prototype);

const rows = () => [
  { name: '_abck', confidence: 50, standalone: false },
  { name: '_abck', value: '~-1~', confidence: 50, standalone: false }
];
const run = (detector, value) => {
  const cookies = [{ name: '_abck', value }];
  return engine.runDetector(detector, { url: 'https://a.test/', cookies, allCookies: cookies });
};

test('"cookie X but NOT cookie X = V" checks both rows against the same cookie', () => {
  const detector = {
    id: 'x', name: 'X', detection: { cookie: rows() },
    combinations: [{ id: 'c1', name: 'valid', when: { all: [{ pattern: 'cookie-1' }, { not: { pattern: 'cookie-2' } }] } }]
  };
  const flagged = run(detector, 'aaa~-1~bbb');
  assert.deepStrictEqual(flagged.matches.map(m => m.patternId), ['cookie-1', 'cookie-2']);
  assert.strictEqual(flagged.detected, false);

  const clean = run(detector, 'aaa~0~bbb');
  assert.deepStrictEqual(clean.matches.map(m => m.patternId), ['cookie-1']);
  assert.strictEqual(clean.confidence, 50); // cookie-1's own confidence
});

test('detectors without combinations still count a cookie once, without pattern ids', () => {
  const detector = { id: 'y', name: 'Y', detection: { cookie: rows().map(({ standalone, ...r }) => r) } };
  const result = run(detector, 'aaa~-1~bbb');
  assert.strictEqual(result.matches.length, 1);
  assert.strictEqual(result.matches[0].patternId, undefined);
  assert.strictEqual(result.confidence, 50);
});
