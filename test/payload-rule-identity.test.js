const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Two request-payload rules of one detector are two rules, whatever their descriptions say: a row copied in the editor keeps its
// description, and each rule must still match on its own.

const root = path.join(__dirname, '..');
const context = vm.createContext({
  Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
  Logger: new Proxy({}, { get: (_, key) => (key === 'debugMode' ? false : () => {}) }),
  setTimeout, clearTimeout
});
context.window = context;
for (const file of [
  'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
  'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js',
  'modules/detection/detection-combinations.js',
  ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(name => `modules/detection/engine/detection-engine-${name}.js`)
]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const engine = new (vm.runInContext('DetectionEngineManager', context))();

const page = (payloads) => ({ url: 'https://example.test/', content: [], dom: [], headers: {}, allCookies: [], responseCookies: [], networkUrls: [],
  payloads: payloads.map(data => ({ method: 'POST', url: 'https://example.test/api', type: 'text', data })), responses: [] });
const detector = (rules) => ({ id: 'detect-demo', name: 'Demo', detection: { payload: rules } });

test('payload rules that share a description each match their own request', () => {
  const rules = [
    { id: 'payload-1', text: 'alpha', confidence: 40, description: 'Challenge request' },
    { id: 'payload-2', text: 'beta', confidence: 60, description: 'Challenge request' }
  ];
  const matches = engine.runDetector(detector(rules), page(['alpha=1', 'beta=2'])).matches;
  const found = matches.filter(match => match.type === 'payload');
  assert.deepEqual(Array.from(found, match => match.pattern).sort(), ['alpha', 'beta']);
});

test('one rule still counts once however many requests match it', () => {
  const rules = [{ id: 'payload-1', text: 'alpha', confidence: 40, description: 'Challenge request' }];
  const found = engine.runDetector(detector(rules), page(['alpha=1', 'alpha=2', 'x alpha y'])).matches.filter(match => match.type === 'payload');
  assert.equal(found.length, 1);
});

test('rules with no id fall back to their description, then their text', () => {
  const rules = [{ text: 'alpha', description: 'One' }, { text: 'beta', description: 'Two' }, { text: 'gamma' }];
  const found = engine.runDetector(detector(rules), page(['alpha beta gamma'])).matches.filter(match => match.type === 'payload');
  assert.equal(found.length, 3);
});
