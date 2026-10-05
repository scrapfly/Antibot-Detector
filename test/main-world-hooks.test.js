const { test } = require('node:test');
const assert = require('node:assert');
const { createPage, installDetail, bootstrapDetail, sleep, P } = require('./helpers/main-world-page.js');

// The MAIN world end to end in a fake page: install, fire, report, complete.
const TOKEN = 'a'.repeat(32);
const FAST = { ACTIVITY_TIMEOUT_MS: 250, MAX_DETECTION_MS: 1000, MIN_MONITOR_MS: 0 };
const T = P.MESSAGE_TYPES;
const R = P.HOOK_FAILURE_REASONS;

function bootstrapped() {
  const page = createPage();
  page.bootstrap(bootstrapDetail(TOKEN));
  return page;
}

const detector = (id, targets) => ({ id, name: id.toUpperCase(), category: 'fingerprint',
  hooks: targets.map(target => ({ target, confidence: 70, description: `uses ${target}` })) });

test('hooks install, fire once per detector, uninstall and complete', async () => {
  const page = bootstrapped();
  const originalGetBattery = page.run('Navigator.prototype.getBattery');
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [
    detector('a', ['Navigator.prototype.getBattery', 'Navigator.prototype.hardwareConcurrency']),
    detector('b', ['Navigator.prototype.getBattery'])
  ] }));

  assert.notStrictEqual(page.run('Navigator.prototype.getBattery'), originalGetBattery, 'method wrapped');
  assert.strictEqual(page.run('Navigator.prototype.getBattery.name'), 'getBattery', 'name copied through the shim');
  assert.strictEqual(page.run('navigator.getBattery()'), 'battery');
  assert.strictEqual(page.run('navigator.getBattery()'), 'battery');
  assert.strictEqual(page.run('navigator.hardwareConcurrency'), 8);

  const fired = page.ofType(T.JS_HOOK_DETECTION).map(m => `${m.detection.detectorId}>${m.detection.hook.target}`).sort();
  assert.deepStrictEqual(fired, ['a>Navigator.prototype.getBattery', 'a>Navigator.prototype.hardwareConcurrency',
    'b>Navigator.prototype.getBattery']);
  assert.strictEqual(page.run('Navigator.prototype.getBattery'), originalGetBattery, 'uninstalled after firing');
  assert.ok(page.posted.every(m => m[P.FIELDS.TOKEN] === TOKEN), 'every report carries the token');

  await sleep(700);
  const [done] = page.ofType(T.JS_HOOKS_COMPLETE);
  assert.ok(done, 'completion sent');
  assert.strictEqual(done.completionReason, P.COMPLETION_REASONS.HOOKS.ACTIVITY_TIMEOUT);
  assert.strictEqual(done.totalDetections, 3);
  assert.strictEqual(done.uniqueHooks, 3);
  assert.deepStrictEqual(page.ofType(T.HOOK_FAILURE_REPORT), []);
});

test('unhookable targets are reported with their reason and nothing is wrapped', async () => {
  const page = bootstrapped();
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [
    detector('bad', ['Nope', 'Missing.prototype.x', 'Navigator.prototype.nothing', 'Navigator.prototype.plainValue', 'Navigator'])
  ] }));
  const reasons = Object.fromEntries(page.ofType(T.HOOK_FAILURE_REPORT).map(m => [m.target, [m.failureType, m.message]]));
  const install = P.HOOK_FAILURE_TYPES.INSTALL_FAILED;
  assert.deepStrictEqual(reasons, {
    Nope: [install, R.INVALID_PATH],
    'Missing.prototype.x': [install, R.PATH_NOT_FOUND],
    'Navigator.prototype.nothing': [install, R.PROPERTY_NOT_FOUND],
    'Navigator.prototype.plainValue': [install, R.NOT_HOOKABLE],
    Navigator: [install, R.INVALID_PATH]
  });
  await sleep(700);
  assert.strictEqual(page.ofType(T.JS_HOOKS_COMPLETE)[0].completionReason, P.COMPLETION_REASONS.HOOKS.ACTIVITY_TIMEOUT);
});

test('constructor-like targets are refused', () => {
  const page = bootstrapped();
  page.run('window.Thing = { Ctor: function Ctor() {} }');
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [detector('c', ['Thing.Ctor'])] }));
  const [report] = page.ofType(T.HOOK_FAILURE_REPORT);
  assert.strictEqual(report.message, R.CONSTRUCTOR_TARGET_NOT_HOOKABLE);
});

test('an unbound call to a wrapped method falls back to the engine-resolved context', () => {
  const page = bootstrapped();
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [{
    id: 'm', name: 'M', category: 'fingerprint',
    hooks: [{ target: 'MediaDevices.prototype.enumerateDevices', contextPaths: ['navigator.mediaDevices'] }]
  }] }));
  assert.strictEqual(page.run('const f = navigator.mediaDevices.enumerateDevices; f()'), 'devices');
});

test('an install event without the page token is ignored', () => {
  const page = bootstrapped();
  page.install(installDetail('b'.repeat(32), { hookDefinitions: [detector('x', ['Navigator.prototype.getBattery'])] }));
  assert.deepStrictEqual(page.posted, []);
});

test('no hooks: completion is immediate', () => {
  const page = bootstrapped();
  page.install(installDetail(TOKEN, { overrides: FAST }));
  const [done] = page.ofType(T.JS_HOOKS_COMPLETE);
  assert.strictEqual(done.completionReason, P.COMPLETION_REASONS.HOOKS.NO_HOOKS);
  assert.strictEqual(page.ofType(T.WINDOW_PROPS_COMPLETE).length, 1);
});

test('debug logs keep their level, source and prefix, and window detections their report shape', async () => {
  const page = bootstrapped();
  page.run('window.probeObj = { a: 1 }; window.probeStr = "x".repeat(300); window.probeNull = null;');
  const detail = installDetail(TOKEN, { overrides: FAST, windowProperties: [
    { path: 'probeObj', condition: 'exists', detectorId: 'w', detectorName: 'W', category: 'antibot', confidence: 80 },
    { path: 'probeStr', detectorId: 'w', detectorName: 'W', category: 'antibot', confidence: 80 },
    { path: 'probeNull', condition: '=== null', detectorId: 'w', detectorName: 'W', category: 'antibot', confidence: 80 }
  ] });
  detail.debugMode = true;
  detail.debugVerbose = true;
  page.install(detail);
  await sleep(300);
  const logs = page.ofType(T.DEBUG_LOG);
  const main = logs.filter(l => l.source === P.LOG.SOURCES.MAIN_WORLD);
  const tracker = logs.filter(l => l.source === P.LOG.SOURCES.WINDOW_TRACKER);
  assert.ok(main.length > 0 && tracker.length > 0);
  assert.ok(main.every(l => l.message.startsWith('[MAIN_WORLD] [Hooks] ') && ['log', 'warn', 'error'].includes(l.level)));
  assert.ok(tracker.every(l => l.message.startsWith('[WindowPropertyTracker] ') && l.level === 'log'));
  assert.ok(main.some(l => /^\[MAIN_WORLD\] \[Hooks\] Install: 0 hook detectors, 3 window checks, fingerprint on$/.test(l.message)),
    'one install summary line');
  const props = Object.fromEntries(page.ofType(T.WINDOW_DETECTIONS).flatMap(m => m.detections).map(d => [d.property.path, d.property]));
  assert.deepStrictEqual([props.probeObj.actualType, props.probeObj.actualValue], ['object', '[object]']);
  assert.deepStrictEqual([props.probeStr.actualType, props.probeStr.actualValue], ['string', 'x'.repeat(100)]);
  assert.deepStrictEqual([props.probeNull.actualType, props.probeNull.actualValue], ['null', '[object]']);
  assert.strictEqual(props.probeStr.condition, 'truthy');
});

test('Debug mode without Verbose logs sends no routine MAIN-world traces', async () => {
  const page = bootstrapped();
  const detail = installDetail(TOKEN, { overrides: FAST, windowProperties: [
    { path: 'probeObj', condition: 'exists', detectorId: 'w', detectorName: 'W', category: 'antibot', confidence: 80 }
  ] });
  detail.debugMode = true;
  page.install(detail);
  await sleep(300);
  assert.deepStrictEqual(page.ofType(T.DEBUG_LOG).filter(l => l.level === P.LOG.LEVELS.LOG), []);
});

test('the engine-sent bind shims are active right after the bootstrap', () => {
  const page = createPage();
  assert.throws(() => page.run('const g = navigator.getBattery; g()'), /Illegal invocation/);
  page.bootstrap(bootstrapDetail(TOKEN));
  assert.strictEqual(page.run('const g1 = navigator.getBattery; g1()'), 'battery');
  assert.strictEqual(page.run('const g2 = navigator.mediaDevices.enumerateDevices; g2()'), 'devices');
  assert.strictEqual(page.run('navigator.getBattery.call(navigator)'), 'battery');
  assert.strictEqual(page.run('Navigator.prototype.getBattery')[P.MAIN_WORLD.BIND_SHIM_MARKER], true);
  // Looks like the native member: name, length, no prototype, not constructible
  assert.strictEqual(page.run('Navigator.prototype.getBattery.name'), 'getBattery');
  assert.strictEqual(page.run('MediaDevices.prototype.enumerateDevices.name'), 'enumerateDevices');
  assert.strictEqual(page.run('Navigator.prototype.getBattery.length'), 0);
  assert.strictEqual(page.run('Object.prototype.hasOwnProperty.call(Navigator.prototype.getBattery, "prototype")'), false);
  assert.throws(() => page.run('new Navigator.prototype.getBattery()'), /not a constructor/);
});

test('a forged later bootstrap cannot add bind shims', () => {
  const page = createPage();
  page.bootstrap(bootstrapDetail(TOKEN));
  const forged = bootstrapDetail('f'.repeat(32));
  forged.bindShims = [{ target: 'Navigator.prototype.hardwareConcurrency', contextPaths: ['navigator'] },
    { target: 'MediaDevices.prototype.enumerateDevices', contextPaths: ['document'] }];
  const before = page.run('Object.getOwnPropertyDescriptor(Navigator.prototype, "hardwareConcurrency").get');
  const enumerate = page.run('MediaDevices.prototype.enumerateDevices');
  page.bootstrap(forged);
  assert.strictEqual(page.run('Object.getOwnPropertyDescriptor(Navigator.prototype, "hardwareConcurrency").get'), before);
  assert.strictEqual(page.run('MediaDevices.prototype.enumerateDevices'), enumerate);
});

// A wrapper retries a call on its fallback instance only for the browser's own
// illegal-invocation error: prove the message is read from the browser, not spelled.
function retryWorks(options) {
  const page = createPage(options);
  page.bootstrap(bootstrapDetail(TOKEN));
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [{
    id: 'm', name: 'M', category: 'fingerprint',
    hooks: [{ target: 'MediaDevices.prototype.enumerateDevices', contextPaths: ['navigator.mediaDevices'] }]
  }] }));
  // Wrong (non-nullish) receiver: the native call fails its brand check, the wrapper retries
  try {
    return page.run('MediaDevices.prototype.enumerateDevices.call({})') === 'devices';
  } catch (e) {
    return false;
  }
}

test('the illegal-invocation message is derived from the browser', () => {
  assert.strictEqual(retryWorks({}), true);
  // A browser with a different message: still recognised, because it is read from the browser
  assert.strictEqual(retryWorks({ illegal: 'Receiver is not a MediaDevices' }), true);
});

test('without a derivable message the protocol fallback is used', () => {
  // Fallback text matches the (default) fake browser: retry works
  assert.strictEqual(retryWorks({ noNavigator: true }), true);
  // Fallback text does not match this browser's message: no retry, the error propagates
  assert.strictEqual(retryWorks({ noNavigator: true, illegal: 'Receiver is not a MediaDevices' }), false);
});

test('a failed method call leaves its hook installed until a successful call', () => {
  const page = bootstrapped();
  page.run(`
    window.result = Promise.resolve('result');
    window.nativeError = new TypeError('Illegal invocation');
    window.calls = 0;
    window.Probe = class Probe {
      method() {
        calls++;
        if (this !== probe) throw nativeError;
        return result;
      }
    };
    window.probe = new Probe();
    window.original = Probe.prototype.method;
  `);
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [
    detector('method', ['Probe.prototype.method'])
  ] }));
  const wrapped = page.run('Probe.prototype.method');
  assert.throws(() => page.run('Probe.prototype.method.call({})'), error => error === page.run('nativeError'));
  assert.strictEqual(page.ofType(T.JS_HOOK_DETECTION).length, 0);
  assert.strictEqual(page.run('Probe.prototype.method'), wrapped, 'failed call does not uninstall');
  assert.strictEqual(page.run('calls'), 1, 'failed native method executes once');
  assert.strictEqual(page.run('probe.method()'), page.run('result'), 'promise identity is preserved');
  assert.strictEqual(page.run('Probe.prototype.method'), page.run('original'));
  assert.strictEqual(page.run('probe.method()'), page.run('result'));
  assert.strictEqual(page.ofType(T.JS_HOOK_DETECTION).length, 1);
});

test('a failed getter call leaves its hook installed until a successful read', () => {
  const page = bootstrapped();
  page.run(`
    window.result = {};
    window.nativeError = new TypeError('Illegal invocation');
    window.calls = 0;
    window.Probe = class Probe {
      get value() {
        calls++;
        if (this !== probe) throw nativeError;
        return result;
      }
    };
    window.probe = new Probe();
    window.original = Object.getOwnPropertyDescriptor(Probe.prototype, 'value').get;
  `);
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [
    detector('getter', ['Probe.prototype.value'])
  ] }));
  const wrapped = page.run("Object.getOwnPropertyDescriptor(Probe.prototype, 'value').get");
  assert.throws(() => page.run("Object.getOwnPropertyDescriptor(Probe.prototype, 'value').get.call({})"),
    error => error === page.run('nativeError'));
  assert.strictEqual(page.ofType(T.JS_HOOK_DETECTION).length, 0);
  assert.strictEqual(page.run("Object.getOwnPropertyDescriptor(Probe.prototype, 'value').get"), wrapped);
  assert.strictEqual(page.run('calls'), 1);
  assert.strictEqual(page.run('probe.value'), page.run('result'), 'object identity is preserved');
  assert.strictEqual(page.run("Object.getOwnPropertyDescriptor(Probe.prototype, 'value').get"), page.run('original'));
  assert.strictEqual(page.run('probe.value'), page.run('result'));
  assert.strictEqual(page.ofType(T.JS_HOOK_DETECTION).length, 1);
});

test('only a successful illegal-invocation fallback reports and preserves the exact result', () => {
  const page = bootstrapped();
  page.run(`
    window.result = Promise.resolve('fallback');
    window.fallbackError = new Error('native fallback failure');
    window.calls = 0;
    window.failFallback = true;
    window.Probe = class Probe {
      method() {
        calls++;
        if (this !== probe) throw new TypeError('Illegal invocation');
        if (failFallback) throw fallbackError;
        return result;
      }
    };
    window.probe = new Probe();
  `);
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [{
    id: 'fallback', name: 'Fallback', category: 'fingerprint',
    hooks: [{ target: 'Probe.prototype.method', contextPaths: ['probe'] }]
  }] }));
  const wrapped = page.run('Probe.prototype.method');
  assert.throws(() => page.run('Probe.prototype.method.call({})'), error => error === page.run('fallbackError'));
  assert.strictEqual(page.run('calls'), 2, 'one wrong-receiver attempt and one fallback attempt');
  assert.strictEqual(page.ofType(T.JS_HOOK_DETECTION).length, 0);
  assert.strictEqual(page.run('Probe.prototype.method'), wrapped);
  page.run('failFallback = false');
  assert.strictEqual(page.run('Probe.prototype.method.call({})'), page.run('result'));
  assert.strictEqual(page.run('calls'), 4);
  assert.strictEqual(page.ofType(T.JS_HOOK_DETECTION).length, 1);
});

test('ordinary native errors propagate unchanged without retrying or consuming the hook', () => {
  const page = bootstrapped();
  page.run(`
    window.nativeError = new TypeError('invalid argument');
    window.calls = 0;
    window.shouldFail = true;
    window.Probe = class Probe {
      method() { calls++; if (shouldFail) throw nativeError; return 42; }
    };
    window.probe = new Probe();
  `);
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [{
    id: 'ordinary', name: 'Ordinary', category: 'fingerprint',
    hooks: [{ target: 'Probe.prototype.method', contextPaths: ['probe'] }]
  }] }));
  const wrapped = page.run('Probe.prototype.method');
  assert.throws(() => page.run('Probe.prototype.method.call({})'), error => error === page.run('nativeError'));
  assert.strictEqual(page.run('calls'), 1, 'non-brand failure never retries on the fallback');
  assert.strictEqual(page.ofType(T.JS_HOOK_DETECTION).length, 0);
  assert.strictEqual(page.run('Probe.prototype.method'), wrapped);
  page.run('shouldFail = false');
  assert.strictEqual(page.run('probe.method()'), 42);
  assert.strictEqual(page.ofType(T.JS_HOOK_DETECTION).length, 1);
});

test('the page cannot swap the condition grammar or evaluator after the bootstrap', async () => {
  const page = bootstrapped();
  const forged = bootstrapDetail('f'.repeat(32));
  forged.conditionGrammar.EXACT.exists = 'FALSY';
  page.bootstrap(forged);
  page.run(`ScrapflyWindowConditionLanguage.configure(${JSON.stringify(forged.conditionGrammar)});
    window.ScrapflyWindowConditionLanguage = { evaluate: () => false, DEFAULT_CONDITION: 'x' };
    window.present = 1;`);
  page.install(installDetail(TOKEN, { overrides: FAST, windowProperties: [
    { path: 'present', condition: 'exists', detectorId: 'w', detectorName: 'W', category: 'antibot', confidence: 80 }
  ] }));
  await sleep(250);
  // Either swap would make 'exists' fail on a present property
  const detected = page.ofType(T.WINDOW_DETECTIONS).flatMap(m => m.detections);
  assert.strictEqual(detected.length, 1);
  assert.strictEqual(detected[0].property.condition, 'exists');
});

// The page's own observer-only getEntriesByType call must not make the browser
// log "Deprecated API for given entry type." against content-main-world.js.
test('getEntriesByType hook swaps observer-only types so no warning is blamed on the extension', () => {
  const page = bootstrapped();
  const hook = { target: 'Performance.prototype.getEntriesByType', confidence: 10 };
  const argSubstitution = page.engineArgSubstitution(hook);
  assert.ok(argSubstitution, 'engine supplies a substitution for this target');
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [
    { id: 'perf', name: 'PERF', category: 'fingerprint', hooks: [{ ...hook, argSubstitution }] }
  ] }));

  assert.deepStrictEqual(page.run('performance.getEntriesByType("longtask")'), [], 'same empty result');
  assert.deepStrictEqual(page.context.performanceWarnings, [], 'no deprecation warning while hooked');
  assert.strictEqual(page.ofType(T.JS_HOOK_DETECTION).length, 1, 'the call is still detected');
});

test('getEntriesByType substitution leaves other types, non-strings and brand checks untouched', () => {
  const page = bootstrapped();
  const hook = { target: 'Performance.prototype.getEntriesByType', confidence: 10 };
  // Keep the wrapper itself: the hook uninstalls after its first fire
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [
    { id: 'p1', name: 'P1', category: 'fingerprint', hooks: [{ ...hook, argSubstitution: page.engineArgSubstitution(hook) }] }
  ] }));
  page.run('var hooked = Performance.prototype.getEntriesByType');
  assert.deepStrictEqual(page.run('hooked.call(performance, "resource")'), [{ entryType: 'resource' }]);
  assert.deepStrictEqual(page.run('hooked.call(performance, "nonsense")'), []);
  assert.deepStrictEqual(page.run('hooked.call(performance, { toString() { return "longtask"; } })'), [],
    'a non-string argument reaches the native call unchanged');
  assert.deepStrictEqual(page.context.performanceWarnings, ['longtask'], 'only the untouched object argument warned');
  assert.throws(() => page.run('hooked.call({}, "longtask")'), /Illegal invocation/, 'brand check preserved');
});

test('the engine has no substitution for other targets, and bad specs are ignored', () => {
  const page = bootstrapped();
  assert.strictEqual(page.engineArgSubstitution({ target: 'Navigator.prototype.getBattery' }), null);
  page.install(installDetail(TOKEN, { overrides: FAST, hookDefinitions: [
    { id: 'bad', name: 'BAD', category: 'fingerprint', hooks: [
      { target: 'Performance.prototype.getEntriesByType', confidence: 10, argSubstitution: { index: -1, values: 'longtask' } }
    ] }
  ] }));
  assert.deepStrictEqual(page.run('performance.getEntriesByType("longtask")'), []);
  assert.deepStrictEqual(page.context.performanceWarnings, ['longtask'], 'invalid spec: native call unchanged');
});
