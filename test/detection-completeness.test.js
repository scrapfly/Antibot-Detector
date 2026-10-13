const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function engine(order) {
  const context = vm.createContext({
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
    Logger: new Proxy({}, { get: () => () => {} })
  });
  for (const file of ['utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
    'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js',
    'modules/detection/detection-combinations.js', ...['analysis', 'extractors', 'matching', 'hooks', 'manager']
      .map(name => `modules/detection/engine/detection-engine-${name}.js`)]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  const instance = vm.runInContext('new DetectionEngineManager()', context);
  instance.setDetectors({ antibot: Object.fromEntries(order.map(id => [id, {
    id, name: id, enabled: true, detection: { content: [{ text: id, confidence: 100 }] }
  }])) });
  return instance;
}

test('all matching vendors survive three high-confidence hits regardless of priority order', async () => {
  const ids = ['vendor-a', 'vendor-b', 'vendor-c', 'vendor-d', 'vendor-e'];
  for (const order of [ids, [...ids].reverse()]) {
    const instance = engine(order);
    const found = await instance.detectOnPage({ pageHTML: ids.join(' ') });
    assert.deepEqual(Array.from(found, result => result.detector.id).sort(), ids);
    assert.equal(instance.lastStats.detectors, ids.length);
  }
});
