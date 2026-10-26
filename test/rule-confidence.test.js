const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A rule that declares no confidence gets the default whatever its method
// (URL, content and JS hook rules used to score 0), an explicit 0 stays 0, and
// in a detector without combinations the order of its cookie rows never
// changes the score: every row is checked and the highest confidence wins.

const root = path.join(__dirname, '..');
const DEFAULT = 80;
const context = vm.createContext({
  WorkerMessages: require('../modules/core/worker-messages.js'),
  Constants: { DEFAULT_MATCH_CONFIDENCE: DEFAULT, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000,
    PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
  Logger: new Proxy({}, { get: (_, key) => key === 'debugMode' ? false : key === 'error' ? (...args) => console.error(...args) : () => {} }),
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  setTimeout, clearTimeout, URL
});
context.window = context;
for (const file of [
  'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/categories.js', 'modules/core/domain-list.js',
  'modules/core/scan-scope.js', 'modules/core/hooks-config.js',
  'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/conditions/window-condition-evaluator.js',
  'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
  ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(name => `modules/detection/engine/detection-engine-${name}.js`),
  'background/detection-session-store.js', 'background/detection-lifecycle.js', 'background/handlers/messages-detection.js'
]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const Engine = vm.runInContext('DetectionEngineManager', context);
const engine = new Engine();

const pageData = {
  url: 'https://a.test/akam/11/abcdef12',
  content: [{ type: 'inline', src: null, content: 'var bmak = {}' }],
  cookies: [{ name: 'x_sess', value: '1' }],
  allCookies: [{ name: 'x_sess', value: '1' }]
};
const plain = (value) => JSON.parse(JSON.stringify(value)); // out of the vm realm, for deepEqual
const run = (detection) => engine.runDetector({ id: 'd', name: 'D', detection }, pageData);

test('URL and content rules without a confidence score the default, like the other methods', () => {
  for (const detection of [
    { url: [{ text: '/akam/' }] },
    { content: [{ text: 'bmak', scope: 'scripts' }] },
    { cookie: [{ name: 'x_sess' }] }
  ]) {
    const result = run(detection);
    assert.equal(result.detected, true, JSON.stringify(detection));
    assert.equal(result.confidence, DEFAULT, JSON.stringify(detection));
    assert.deepEqual(plain(result.matches.map(m => m.confidence)), [DEFAULT]);
  }
});

test('an explicit confidence of 0 stays 0 for every method, as the rule editor shows it', () => {
  for (const detection of [{ url: [{ text: '/akam/', confidence: 0 }] }, { content: [{ text: 'bmak', confidence: 0 }] },
    { cookie: [{ name: 'x_sess', confidence: 0 }] }]) {
    const result = run(detection);
    assert.equal(result.confidence, 0, JSON.stringify(detection));
    assert.equal(result.detected, false);
  }
  assert.equal(run({ url: [{ text: '/akam/', confidence: 35 }] }).confidence, 35);
});

test('cookie rows in either order give the same score, and the cookie is listed once', () => {
  const weak = { name: 'x_sess', confidence: 20 };
  const strong = { name: 'x_sess', value: '^1$', valueRegex: true, confidence: 100 };
  for (const rows of [[weak, strong], [strong, weak]]) {
    const result = run({ cookie: rows });
    assert.equal(result.confidence, 100, `order ${rows.map(r => r.confidence)}`);
    assert.deepEqual(plain(result.matches.map(m => [m.name, m.confidence])), [['x_sess', 100]]);
  }
});

test('a JS hook without a confidence is recorded with the default; an explicit 0 stays 0', async () => {
  const detectors = {
    'hook-default': { id: 'hook-default', name: 'Hook default', category: 'fingerprint' },
    'hook-zero': { id: 'hook-zero', name: 'Hook zero', category: 'fingerprint' }
  };
  context.detectorManager = { getDetector: (_, id) => detectors[id], findDetectorById: id => detectors[id], initialized: true };
  context.detectorInitializationPromise = null;
  context.ensureDetectorManagerInitialized = async () => context.detectorManager;
  for (const key of ['detectionStates', 'activeDetections', 'interruptedDetections', 'finalizationDebounce',
    'batchProcessingFlags', 'payloadStore', 'networkUrlsStore']) context[key] = new Map();
  context.tabsUsingCache = new Set();
  context.workerKeepaliveManager = null;
  context.checkAndFinalizeDetection = () => {};
  context.getHooksDeadline = start => start + 1000;
  context.cachedHooksConfig = { MAX_DETECTION_MS: 1000 };
  context.chrome = { runtime: { sendMessage: async () => {} }, tabs: { sendMessage: async () => {} } };
  Engine.getStoredDetection = async () => null;
  const registry = {};
  context.registerDetectionHandlers(registry, {});
  const url = 'https://a.test/';
  const hit = (detectorId, hook) => ({ url, detection: { detectorId, detectorName: detectorId, category: 'fingerprint', hook } });
  registry[context.ScrapflyBridgeProtocol.MESSAGE_TYPES.JS_HOOK_DETECTION_BATCH]({
    request: { detections: [
      hit('hook-default', { target: 'Navigator.prototype.getBattery' }),
      hit('hook-zero', { target: 'Navigator.prototype.getBattery', confidence: 0 })
    ] },
    sender: { tab: { id: 3, url } },
    sendResponse: () => {}
  });
  let state;
  for (let i = 0; i < 50 && !(state = context.detectionStates.get(3))?.hooksData?.size; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  for (let i = 0; i < 50 && state.hooksData.size < 2; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.hooksData.get('hook-default').confidence, DEFAULT);
  assert.deepEqual(plain(state.hooksData.get('hook-default').matches.map(m => m.confidence)), [DEFAULT]);
  assert.equal(state.hooksData.get('hook-zero').confidence, 0);
});
