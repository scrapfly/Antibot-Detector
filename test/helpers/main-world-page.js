// Loads the MAIN-world scripts (manifest order) into a fake page so tests can
// drive the real bridge: bootstrap event, install event, hooks firing, and the
// messages the MAIN world posts back to the ISOLATED world.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const MAIN_FILES = manifest.content_scripts.find(cs => cs.world === 'MAIN').js;

require('../../modules/core/bridge-protocol.js');
require('../../modules/core/hooks-config.js');
const P = globalThis.ScrapflyBridgeProtocol;
const HooksConfig = globalThis.HooksConfig;

// The ISOLATED-side engine module that builds the bootstrap detail content.js sends
const engine = vm.createContext({ globalThis: null, Object, Array, RegExp, JSON });
engine.globalThis = engine;
engine.ScrapflyBridgeProtocol = P;
vm.runInContext(fs.readFileSync(path.join(root, 'modules/detection/window-condition-grammar.js'), 'utf8'), engine);
vm.runInContext(fs.readFileSync(path.join(root, 'modules/detection/engine/detection-engine-hooks.js'), 'utf8'), engine);
// Structured-clone like a CustomEvent detail crossing into the MAIN world
const bootstrapDetail = (token) => JSON.parse(JSON.stringify(engine.demMainWorldBootstrapDetail(token)));

// Web-IDL-like interfaces: members brand-check their receiver the way V8
// bindings do (TypeError "Illegal invocation" on a foreign `this`).
const ILLEGAL = 'Illegal invocation';
function makeInterfaces(ILLEGAL) {
  const brand = new WeakSet();
  class Navigator {
    get userAgent() { if (!brand.has(this)) throw new TypeError(ILLEGAL); return 'fake'; }
    get hardwareConcurrency() { if (!brand.has(this)) throw new TypeError(ILLEGAL); return 8; }
    getBattery() { if (!brand.has(this)) throw new TypeError(ILLEGAL); return 'battery'; }
  }
  class MediaDevices {
    enumerateDevices() { if (!brand.has(this)) throw new TypeError(ILLEGAL); return 'devices'; }
  }
  // Chromium's getEntriesByType: observer-only types return [] and log a
  // deprecation warning blamed on the calling frame (recorded in `warnings`).
  const OBSERVER_ONLY = new Set(['longtask', 'event', 'element', 'layout-shift', 'largest-contentful-paint',
    'interaction-contentful-paint', 'container', 'scroll']);
  const warnings = [];
  class Performance {
    getEntriesByType(type) {
      if (!brand.has(this)) throw new TypeError(ILLEGAL);
      const name = String(type);
      if (OBSERVER_ONLY.has(name)) { warnings.push(name); return []; }
      return name === 'resource' ? [{ entryType: 'resource' }] : [];
    }
  }
  const navigator = Object.create(Navigator.prototype);
  const mediaDevices = Object.create(MediaDevices.prototype);
  const performance = Object.create(Performance.prototype);
  brand.add(navigator);
  brand.add(mediaDevices);
  brand.add(performance);
  Object.defineProperty(Navigator.prototype, 'mediaDevices', { get() { return mediaDevices; }, configurable: true });
  // Not a hookable member kind
  Object.defineProperty(Navigator.prototype, 'plainValue', { value: 1, configurable: true });
  return { Navigator, MediaDevices, navigator, Performance, performance, performanceWarnings: warnings };
}

// illegal: the brand-check message this fake browser throws; noNavigator: no
// Navigator interface at all (the MAIN world must then use the protocol fallback)
function createPage({ href = 'https://example.test/', illegal = ILLEGAL, noNavigator = false } = {}) {
  const target = new EventTarget();
  const posted = [];
  const context = vm.createContext({
    Object, Array, Map, Set, WeakSet, WeakMap, JSON, Math, Date, String, Number, Boolean, Symbol, Reflect,
    Error, TypeError, RegExp, Promise, CustomEvent, Event, setTimeout, clearTimeout, console
  });
  context.window = context;
  context.globalThis = context;
  context.self = context;
  context.document = { readyState: 'complete' };
  context.location = { href };
  context.addEventListener = target.addEventListener.bind(target);
  context.removeEventListener = target.removeEventListener.bind(target);
  context.dispatchEvent = target.dispatchEvent.bind(target);
  const interfaces = makeInterfaces(illegal);
  if (noNavigator) {
    // The page's navigator object still exists; only the interface object is missing
    delete interfaces.Navigator;
  }
  Object.assign(context, interfaces);

  for (const file of MAIN_FILES) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: path.join(root, file) });
  }

  // What the ISOLATED world receives (registered after the MAIN scripts, like content.js)
  target.addEventListener(P.EVENTS.MAIN_TO_ISOLATED, (e) => posted.push(e.detail));

  const dispatch = (name, detail) => target.dispatchEvent(new CustomEvent(name, { detail }));
  return {
    context,
    posted,
    ofType: (type) => posted.filter(m => m.type === type),
    bootstrap: (detail) => dispatch(P.EVENTS.BRIDGE_INIT, detail),
    install: (detail) => dispatch(P.EVENTS.INSTALL_HOOKS, detail),
    toMain: (detail) => dispatch(P.EVENTS.ISOLATED_TO_MAIN, detail),
    // The engine's argSubstitution for a hook, structured-cloned like the install detail
    engineArgSubstitution: (hook) => JSON.parse(JSON.stringify(engine.demHookArgSubstitution(hook))),
    run: (code) => vm.runInContext(code, context)
  };
}

// The install detail the engine sends (DetectionEngineManager.installHooksOrchestrator)
function installDetail(token, { hookDefinitions = [], windowProperties = [], overrides = {} } = {}) {
  const hooksConfig = HooksConfig.resolve(overrides);
  return {
    hookDefinitions, windowProperties, debugMode: false, logCollectorEnabled: false,
    enableJsApi: true, fingerprintEnabled: true, hooksConfig,
    minMonitorMs: HooksConfig.minMonitorMs(hooksConfig),
    [P.FIELDS.TOKEN]: token
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = { createPage, installDetail, bootstrapDetail, sleep, P, HooksConfig, MAIN_FILES, ILLEGAL };
