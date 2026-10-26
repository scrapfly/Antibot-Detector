const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { createPage, installDetail, bootstrapDetail } = require('./helpers/main-world-page.js');

// The MAIN world's wrappers must read as native functions: no own `toString`,
// and Function.prototype.toString (patched once per realm) answers for each
// wrapper with the text of the member it replaced.
const TOKEN = 'b'.repeat(32);
const FAST = { ACTIVITY_TIMEOUT_MS: 250, MAX_DETECTION_MS: 1000, MIN_MONITOR_MS: 0 };
const detector = (id, targets) => ({ id, name: id.toUpperCase(), category: 'fingerprint',
  hooks: targets.map(target => ({ target, confidence: 70, description: `uses ${target}` })) });

const GET = 'Object.getOwnPropertyDescriptor(Navigator.prototype, "hardwareConcurrency").get';

// A page whose native members are recognisable through the realm's real
// (unpatched) Function.prototype.toString, captured before the MAIN world loads
function pageWithNatives(options) {
  const page = createPage({ realmInterfaces: true, ...options });
  page.run('var __nativeToString = Function.prototype.toString;');
  page.native = (expr) => page.run(`__nativeToString.call(${expr})`);
  return page;
}

function assertLooksNative(page, expr, originalSource) {
  assert.deepStrictEqual(page.run(`Object.getOwnPropertyNames(${expr}).filter(k => k === "toString")`), [],
    `${expr} has no own toString`);
  assert.strictEqual(page.run(`Object.prototype.hasOwnProperty.call(${expr}, "toString")`), false);
  assert.strictEqual(page.run(`Function.prototype.toString.call(${expr})`), originalSource, `${expr} source`);
  assert.strictEqual(page.run(`String(${expr})`), originalSource);
  assert.strictEqual(page.run(`${expr}.toString()`), originalSource);
}

test('Function.prototype.toString is patched at the bootstrap and itself looks native', () => {
  const page = pageWithNatives();
  const nativeText = page.native('__nativeToString');
  const nativeDescriptor = page.run('Object.getOwnPropertyDescriptor(Function.prototype, "toString")');
  page.bootstrap(bootstrapDetail(TOKEN));
  assert.notStrictEqual(page.run('Function.prototype.toString'), page.run('__nativeToString'), 'patched');

  assert.strictEqual(page.run('Function.prototype.toString.call(Function.prototype.toString)'), nativeText);
  assert.strictEqual(page.run('Function.prototype.toString.toString()'), nativeText);
  assert.strictEqual(page.run('String(Function.prototype.toString)'), nativeText);
  assert.strictEqual(page.run('Function.prototype.toString.name'), 'toString');
  assert.strictEqual(page.run('Function.prototype.toString.length'), 0);
  const d = page.run('Object.getOwnPropertyDescriptor(Function.prototype, "toString")');
  assert.deepStrictEqual([d.writable, d.enumerable, d.configurable],
    [nativeDescriptor.writable, nativeDescriptor.enumerable, nativeDescriptor.configurable]);
  assert.deepStrictEqual(page.run('Object.getOwnPropertyNames(Function.prototype.toString).sort()'), ['length', 'name']);
  assert.strictEqual(page.run('Object.getPrototypeOf(Function.prototype.toString) === Function.prototype'), true);
  assert.throws(() => page.run('new Function.prototype.toString()'), /not a constructor/);
  // No page-visible global for any of it
  const plain = pageWithNatives();
  plain.bootstrap(bootstrapDetail(TOKEN));
  assert.deepStrictEqual(page.run('Object.getOwnPropertyNames(window).sort()'),
    plain.run('Object.getOwnPropertyNames(window).sort()'));
});

test('non-function receivers throw the native TypeError', () => {
  const page = pageWithNatives();
  const nativeError = (receiver) => {
    try { page.run(`__nativeToString.call(${receiver})`); } catch (e) { return [e.constructor.name, e.message]; }
    return null;
  };
  const patchedError = (receiver) => {
    try { page.run(`Function.prototype.toString.call(${receiver})`); } catch (e) { return [e.constructor.name, e.message]; }
    return null;
  };
  const receivers = ['{}', 'null', 'undefined', '1', '"x"', 'Symbol()', 'Object.create(Function.prototype)'];
  const expected = receivers.map(nativeError);
  page.bootstrap(bootstrapDetail(TOKEN));
  assert.deepStrictEqual(receivers.map(patchedError), expected);
  for (const e of expected) assert.strictEqual(e[0], 'TypeError');
  // The very same error class as the native one (the realm's own TypeError)
  assert.strictEqual(page.run(`(() => {
    const kind = (f) => { try { f.call({}); } catch (e) { return e.constructor; } };
    return kind(Function.prototype.toString) === kind(__nativeToString);
  })()`), true);
});

test('page functions keep their own source', () => {
  const page = pageWithNatives();
  page.run('function pageFn(a, b) { return a + b; } var arrow = (x) => x * 2; class K { m() {} }');
  const before = ['pageFn', 'arrow', 'K', 'K.prototype.m', 'Math.max', 'Function.prototype', 'pageFn.bind(null)']
    .map(e => page.native(e));
  page.bootstrap(bootstrapDetail(TOKEN));
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [detector('a', ['Navigator.prototype.getBattery'])] }));
  assert.deepStrictEqual(['pageFn', 'arrow', 'K', 'K.prototype.m', 'Math.max', 'Function.prototype', 'pageFn.bind(null)']
    .map(e => page.run(`Function.prototype.toString.call(${e})`)), before);
  assert.strictEqual(page.run('pageFn.toString()'), 'function pageFn(a, b) { return a + b; }');
  // A page function that overrides toString on itself is left alone
  assert.strictEqual(page.run('var own = function () {}; own.toString = () => "mine"; String(own)'), 'mine');
});

test('bind shims and early recorders carry no own toString and read as the native member', () => {
  const page = pageWithNatives();
  const getBatterySource = page.native('Navigator.prototype.getBattery');
  const getterSource = page.native(GET);
  const enumerateSource = page.native('MediaDevices.prototype.enumerateDevices');
  page.bootstrap(bootstrapDetail(TOKEN));
  // getBattery: a recorder around the bind shim around the native member
  assert.notStrictEqual(page.native('Navigator.prototype.getBattery'), getBatterySource, 'really wrapped');
  assertLooksNative(page, 'Navigator.prototype.getBattery', getBatterySource);
  assertLooksNative(page, 'MediaDevices.prototype.enumerateDevices', enumerateSource);
  assertLooksNative(page, GET, getterSource);
  assert.strictEqual(page.run(`${GET}.name`), 'get hardwareConcurrency');
});

test('installed hooks carry no own toString and read as the native member', () => {
  const page = pageWithNatives();
  const getterSource = page.native(GET);
  const batterySource = page.native('Navigator.prototype.getBattery');
  page.bootstrap(bootstrapDetail(TOKEN));
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [
    detector('a', ['Navigator.prototype.hardwareConcurrency', 'Navigator.prototype.getBattery'])
  ] }));
  assert.notStrictEqual(page.native(GET), getterSource, 'the hook is in place');
  assertLooksNative(page, GET, getterSource);
  assertLooksNative(page, 'Navigator.prototype.getBattery', batterySource);
  assert.strictEqual(page.run(`${GET}.name`), 'get hardwareConcurrency');
  assert.strictEqual(page.run('Navigator.prototype.getBattery.length'), 0);
});

test('a site with the JS hooks off keeps a working, native-looking toString', () => {
  const page = pageWithNatives();
  const batterySource = page.native('Navigator.prototype.getBattery');
  page.bootstrap(bootstrapDetail(TOKEN));
  const detail = installDetail(TOKEN, { overrides: FAST });
  detail.hooksOff = true;
  page.install(detail);
  assertLooksNative(page, 'Navigator.prototype.getBattery', batterySource);
  assert.strictEqual(page.run('const g = navigator.getBattery; g()'), 'battery');
  assert.strictEqual(page.run('Function.prototype.toString.call(Function.prototype.toString)'), page.native('__nativeToString'));
});

// A same-origin child window with a realm of its own (its own Function)
function childRealm() {
  const child = vm.createContext({});
  vm.runInContext(`
    var window = globalThis;
    // A browser window exposes its built-ins as properties; a vm sandbox must be told to
    globalThis.Function = Function;
    globalThis.Object = Object;
    var document = {};
    var __nativeToString = Function.prototype.toString;
    function Navigator() {}
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get() { return 4; }, configurable: true });
    var navigator = Object.create(Navigator.prototype);
    function childFn() { return 'child'; }
  `, child);
  return child;
}

test('a child realm gets its own patched toString and its wrappers read as native', () => {
  const page = pageWithNatives();
  const child = childRealm();
  page.context.__child = child;
  page.run(`
    function HTMLIFrameElement() {}
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { get() { return __child; }, configurable: true });
    var frame = Object.create(HTMLIFrameElement.prototype);
  `);
  const childGet = 'Object.getOwnPropertyDescriptor(Navigator.prototype, "hardwareConcurrency").get';
  const childNative = (expr) => vm.runInContext(`__nativeToString.call(${expr})`, child);
  const childRun = (code) => vm.runInContext(code, child);
  const getterSource = childNative(childGet);
  const toStringSource = childNative('__nativeToString');
  const accessorSource = page.native('Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow").get');

  page.bootstrap(bootstrapDetail(TOKEN));
  // The frame accessor is wrapped in the page realm
  assertLooksNative(page, 'Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow").get', accessorSource);
  assert.strictEqual(page.run('frame.contentWindow') === child, true);

  // The child realm was instrumented: a recorder in it, and its own toString patched
  assert.notStrictEqual(childNative(childGet), getterSource, 'child getter wrapped');
  assert.notStrictEqual(childRun('Function.prototype.toString'), childRun('__nativeToString'), 'child toString patched');
  assert.strictEqual(childRun(`Function.prototype.toString.call(${childGet})`), getterSource);
  assert.strictEqual(childRun(`String(${childGet})`), getterSource);
  assert.strictEqual(childRun(`Object.prototype.hasOwnProperty.call(${childGet}, "toString")`), false);
  assert.strictEqual(childRun(`Object.getPrototypeOf(${childGet}) === Function.prototype`), true);
  assert.strictEqual(childRun('Function.prototype.toString.call(Function.prototype.toString)'), toStringSource);
  assert.strictEqual(childRun('Object.getPrototypeOf(Function.prototype.toString) === Function.prototype'), true);
  assert.strictEqual(childRun('Function.prototype.toString.name'), 'toString');
  assert.strictEqual(childRun('Function.prototype.toString.length'), 0);
  assert.strictEqual(childRun('Object.prototype.hasOwnProperty.call(Function.prototype.toString, "prototype")'), false);
  assert.throws(() => childRun('Function.prototype.toString.call({})'), (e) => e.name === 'TypeError');
  assert.strictEqual(childRun('Function.prototype.toString.call(childFn)'), "function childFn() { return 'child'; }");
  // The parent's toString also answers for the child's wrapper
  assert.strictEqual(page.run('Function.prototype.toString.call(Object.getOwnPropertyDescriptor(frame.contentWindow.Navigator.prototype, "hardwareConcurrency").get)'), getterSource);
  // Reached again: patched once
  const patched = childRun('Function.prototype.toString');
  page.run('frame.contentWindow');
  assert.strictEqual(childRun('Function.prototype.toString'), patched);
  assert.strictEqual(childRun('navigator.hardwareConcurrency'), 4);
});
