const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// detection-engine-hooks.js reads the bridge protocol at load time.
require('../modules/core/bridge-protocol.js');
require('../modules/core/constants.js');
require('../modules/detection/window-condition-grammar.js');
require('../modules/detection/hooks/window-condition-language.js');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const context = vm.createContext({ globalThis: null, Object, Array, RegExp });
context.globalThis = context;
context.ScrapflyBridgeProtocol = globalThis.ScrapflyBridgeProtocol;
vm.runInContext(fs.readFileSync(path.join(root, 'modules/detection/engine/detection-engine-hooks.js'), 'utf8'), context);
const demHookContextPaths = context.demHookContextPaths;

// The instance table 2.8 hardcoded in content-main-world.js (resolveContextFromTarget),
// expressed as the window paths it read. Moving it to the engine must not change it.
const V28_TABLE = [
  ['Navigator.prototype.', ['navigator']],
  ['NavigatorUAData.prototype.', ['navigator.userAgentData']],
  ['MediaDevices.prototype.', ['navigator.mediaDevices']],
  ['Performance.prototype.', ['performance']],
  ['Screen.prototype.', ['screen']],
  ['History.prototype.', ['history']],
  ['Location.prototype.', ['location']],
  ['Document.prototype.', ['document']],
  ['HTMLDocument.prototype.', ['document']],
  ['Storage.prototype.', ['localStorage', 'sessionStorage']]
];
const v28Paths = (target) => (V28_TABLE.find(([prefix]) => target.startsWith(prefix)) || [null, []])[1];

function bundledHooks() {
  const dir = path.join(root, 'detectors', 'fingerprint');
  return fs.readdirSync(dir).flatMap(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).detection?.js_hooks || []);
}

test('every bundled hook gets windowPath first, then the 2.8 interface instance', () => {
  const hooks = bundledHooks();
  assert.ok(hooks.length > 50, 'expected the bundled fingerprint hooks');
  for (const hook of hooks) {
    const expected = [...(hook.windowPath ? [hook.windowPath] : []), ...v28Paths(hook.target)];
    assert.deepStrictEqual(Array.from(demHookContextPaths(hook)), expected, hook.target);
  }
});

test('the table covers each 2.8 prefix and nothing that merely starts alike', () => {
  for (const [prefix, paths] of V28_TABLE) {
    assert.deepStrictEqual(Array.from(demHookContextPaths({ target: `${prefix}x` })), paths, prefix);
  }
  assert.deepStrictEqual(Array.from(demHookContextPaths({ target: 'NavigatorFoo.prototype.x' })), []);
  assert.deepStrictEqual(Array.from(demHookContextPaths({ target: 'window.devicePixelRatio' })), []);
  assert.deepStrictEqual(Array.from(demHookContextPaths({ target: 'Navigator.getBattery' })), []);
  assert.deepStrictEqual(Array.from(demHookContextPaths({ target: 'X.prototype.y', windowPath: 'a.b' })), ['a.b']);
});

test('the early bind shims are engine data, identical to the 2.8 MAIN-world table', () => {
  // 2.8 content-main-world.js EARLY_BIND_SHIMS: { target, instancePath }
  const V28_SHIMS = [['Navigator.prototype.getBattery', 'navigator'],
    ['MediaDevices.prototype.enumerateDevices', 'navigator.mediaDevices']];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(context.demEarlyBindShims())),
    V28_SHIMS.map(([target, instancePath]) => ({ target, contextPaths: [instancePath] })));
  const detail = context.demMainWorldBootstrapDetail('t'.repeat(32));
  assert.strictEqual(detail.protocol, globalThis.ScrapflyBridgeProtocol);
  assert.strictEqual(detail[globalThis.ScrapflyBridgeProtocol.FIELDS.TOKEN], 't'.repeat(32));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(detail.bindShims)), JSON.parse(JSON.stringify(context.demEarlyBindShims())));
});

test('content-main-world.js holds no interface/instance knowledge of its own', () => {
  const src = fs.readFileSync(path.join(root, 'content-main-world.js'), 'utf8');
  assert.strictEqual(src.includes('EARLY_BIND_SHIMS'), false);
  assert.strictEqual(/getBattery|enumerateDevices/.test(src.replace(/\/\/[^\n]*/g, '')), false);
  assert.strictEqual(src.includes('resolveContextFromTarget'), false);
  for (const [prefix] of V28_TABLE) {
    assert.strictEqual(src.includes(`'${prefix}`), false, `${prefix} still spelled in the MAIN world`);
  }
  // Window-property defaults come from the engine / condition language
  assert.strictEqual(/\|\|\s*80\b/.test(src), false);
  assert.strictEqual(src.includes("|| 'truthy'"), false);
  const tracker = fs.readFileSync(path.join(root, 'modules/detection/hooks/window-property-tracker.js'), 'utf8');
  assert.strictEqual(/\|\|\s*80\b/.test(tracker), false);
  assert.strictEqual(tracker.includes("|| 'truthy'"), false);
});

test('window-property defaults keep their 2.8 values at their new owners', () => {
  assert.strictEqual(globalThis.Constants.DEFAULT_MATCH_CONFIDENCE, 80);
  assert.strictEqual(globalThis.ScrapflyWindowConditionLanguage.DEFAULT_CONDITION, 'truthy');
  assert.strictEqual(globalThis.ScrapflyWindowConditionLanguage.compile('').normalized, 'truthy');
  assert.strictEqual(globalThis.ScrapflyWindowConditionLanguage.evaluate(1, undefined), true);
  assert.strictEqual(globalThis.ScrapflyWindowConditionLanguage.evaluate(0, undefined), false);
});
