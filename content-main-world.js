/**
 * Content Script - MAIN World
 * Runs in the MAIN world (page's JavaScript context) to install fingerprinting hooks
 * Receives hook definitions from content.js (ISOLATED world) via CustomEvent
 */

(function() {
  'use strict';

  // The one name both worlds must agree on before anything else is known: the
  // ISOLATED world (content.js) fires it synchronously at document_start, before
  // any page script, carrying the page's bridge token and the whole bridge
  // protocol (modules/core/bridge-protocol.js). Every other event name, message
  // type, reason and shared global key comes from that protocol object, so this
  // world spells none of them. Pinned to EVENTS.BRIDGE_INIT by
  // test/bridge-protocol-guard.test.js.
  const BOOTSTRAP_EVENT = 'scrapfly-bridge-init';

  // Bridge protocol, adopted from the first bootstrap event (see adoptBootstrap).
  // Besides the message vocabulary it carries this world's identity and
  // conventions (MAIN_WORLD: script name, path separator, markers) and its log
  // labels (LOG); tuning (caps, timings) comes with every install event instead.
  let PROTOCOL = null;
  let EVENTS, FIELDS, MESSAGE_TYPES, HOOK_FAILURE_REASONS, GLOBALS, HOOKS_REASONS, WINDOW_REASONS;
  let LOG, MAIN_WORLD, PATH_SEPARATOR;
  let ALLOWED_ISOLATED_MESSAGE_TYPES = new Set();
  // The browser's text for a member called on a foreign `this`: the only error
  // our wrappers retry or silence. Read from the browser itself while this file
  // loads (before any page script or hook exists): a Web IDL getter called on a
  // plain object fails its brand check with exactly that TypeError. The
  // protocol's MAIN_WORLD.ILLEGAL_INVOCATION_FALLBACK is used only if that fails.
  const derivedIllegalInvocationMessage = (() => {
    try {
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(Navigator.prototype))) {
        if (typeof descriptor.get !== 'function') continue;
        try {
          Reflect.apply(descriptor.get, {}, []);
        } catch (e) {
          if (e instanceof TypeError && typeof e.message === 'string' && e.message) return e.message;
        }
        return null;
      }
    } catch (e) {
      // No Navigator interface in this context
    }
    return null;
  })();
  let illegalInvocationMessage = null;

  let debugMode = false; // Will be set by ISOLATED world
  // Verbose logs: routine traces (logDebug). Plain Debug mode sends warnings and
  // errors only; the worker's scan report covers the rest.
  let debugVerbose = false;
  let logCollectorEnabled = false;
  let bridgeToken = null;
  let lastHooksInstallAt = 0;

  // Token format rules come with the protocol (BRIDGE_TOKEN): content.js mints
  // 32 hex chars, anything outside the rules did not come from the extension
  function isValidBridgeToken(token, rules) {
    if (typeof token !== 'string' || token.length < rules.MIN_LENGTH || token.length > rules.MAX_LENGTH) return false;
    try {
      return new RegExp(rules.PATTERN).test(token);
    } catch (e) {
      return false;
    }
  }

  function postBridgeMessage(message) {
    if (!bridgeToken || !message || typeof message !== 'object') {
      return false;
    }

    try {
      window.dispatchEvent(new CustomEvent(EVENTS.MAIN_TO_ISOLATED, {
        detail: {
          ...message,
          [FIELDS.TOKEN]: bridgeToken
        }
      }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function getTrustedIsolatedMessageData(event) {
    const data = event?.detail;
    if (!data || typeof data !== 'object') return null;
    if (data[FIELDS.TOKEN] !== bridgeToken) return null;
    if (!ALLOWED_ISOLATED_MESSAGE_TYPES.has(data.type)) return null;
    return data;
  }

  function isProtocolShape(p) {
    return !!p && typeof p === 'object' &&
      !!p.EVENTS && typeof p.EVENTS.INSTALL_HOOKS === 'string' && typeof p.EVENTS.ISOLATED_TO_MAIN === 'string' &&
      typeof p.EVENTS.MAIN_TO_ISOLATED === 'string' && typeof p.EVENTS.JS_API_PREFIX === 'string' &&
      !!p.FIELDS && typeof p.FIELDS.TOKEN === 'string' &&
      !!p.MESSAGE_TYPES && typeof p.MESSAGE_TYPES === 'object' && Array.isArray(p.TO_MAIN_TYPES) &&
      !!p.COMPLETION_REASONS && !!p.COMPLETION_REASONS.HOOKS && !!p.COMPLETION_REASONS.WINDOW &&
      !!p.HOOK_FAILURE_REASONS && !!p.GLOBALS && !!p.HOOK_FAILURE_MESSAGES && !!p.REPORTED_VALUE &&
      !!p.BRIDGE_TOKEN && isNonNegativeNumber(p.BRIDGE_TOKEN.MIN_LENGTH) &&
      isNonNegativeNumber(p.BRIDGE_TOKEN.MAX_LENGTH) && typeof p.BRIDGE_TOKEN.PATTERN === 'string' &&
      !!p.LOG && !!p.LOG.LEVELS && !!p.LOG.SOURCES && !!p.LOG.PREFIXES &&
      !!p.MAIN_WORLD && typeof p.MAIN_WORLD.HOOKS_SCRIPT === 'string' && !!p.MAIN_WORLD.PATH_SEPARATOR &&
      typeof p.MAIN_WORLD.PATH_SEPARATOR === 'string' && typeof p.MAIN_WORLD.BIND_SHIM_MARKER === 'string' &&
      typeof p.MAIN_WORLD.ILLEGAL_INVOCATION_FALLBACK === 'string' &&
      typeof p.MAIN_WORLD.JS_API_CONSOLE_LABEL === 'string';
  }

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const key of Object.keys(value)) deepFreeze(value[key]);
      Object.freeze(value);
    }
    return value;
  }

  // The protocol and the token are adopted together from the first valid
  // bootstrap, and never again: content.js fires it before any page script can
  // run, and its later ones (re-arms) carry the same values. A malformed one
  // adopts nothing, so neither half can be filled in later by someone else.
  function adoptBootstrap(detail) {
    if (!detail || typeof detail !== 'object' || !isProtocolShape(detail.protocol)) return false;
    let copy;
    try {
      copy = JSON.parse(JSON.stringify(detail.protocol)); // own, frozen copy of what crossed the world boundary
    } catch (e) {
      return false;
    }
    const token = detail[copy.FIELDS.TOKEN];
    if (!isValidBridgeToken(token, copy.BRIDGE_TOKEN)) return false;
    bridgeToken = token;
    PROTOCOL = deepFreeze(copy);
    ({ EVENTS, FIELDS, MESSAGE_TYPES, HOOK_FAILURE_REASONS, GLOBALS } = PROTOCOL);
    HOOKS_REASONS = PROTOCOL.COMPLETION_REASONS.HOOKS;
    WINDOW_REASONS = PROTOCOL.COMPLETION_REASONS.WINDOW;
    ({ LOG, MAIN_WORLD } = PROTOCOL);
    PATH_SEPARATOR = MAIN_WORLD.PATH_SEPARATOR;
    illegalInvocationMessage = derivedIllegalInvocationMessage || MAIN_WORLD.ILLEGAL_INVOCATION_FALLBACK;
    HOOK_SUPPRESSION_DEPTH_KEY = GLOBALS.HOOK_SUPPRESSION_DEPTH;
    ALLOWED_ISOLATED_MESSAGE_TYPES = new Set(PROTOCOL.TO_MAIN_TYPES);
    if (hookResilienceManager) {
      hookResilienceManager.setProtocol(PROTOCOL);
      hookResilienceManager.setFailureReporter(postBridgeMessage);
    }
    // Still before any page script: the bootstrap is fired synchronously by
    // content.js at document_start. Malformed shim data only costs the shims.
    let bindShims = [];
    try {
      bindShims = Array.isArray(detail.bindShims) ? JSON.parse(JSON.stringify(detail.bindShims)) : [];
    } catch (e) {
      bindShims = [];
    }
    installEarlyBindShims(bindShims.filter(isBindShimSpec));
    // After the shims, so a recorder calls through the shim
    let earlyHooks = null;
    try {
      earlyHooks = detail.earlyHooks ? JSON.parse(JSON.stringify(detail.earlyHooks)) : null;
    } catch (e) {
      earlyHooks = null;
    }
    if (isEarlyHooksSpec(earlyHooks)) {
      installEarlyHooks(earlyHooks);
    }
    // The condition evaluator copies and freezes the grammar; first one wins
    if (conditionLanguage) {
      conditionLanguage.configure(detail.conditionGrammar);
    }
    startBridge();
    return true;
  }

  window.addEventListener(BOOTSTRAP_EVENT, (event) => {
    // Always swallowed: the page must never see the token (re-arms included)
    event.stopImmediatePropagation?.();
    if (PROTOCOL) return;
    adoptBootstrap(event.detail);
  }, true);

  // Suppress hook reporting during extension-driven property reads (key from GLOBALS)
  let HOOK_SUPPRESSION_DEPTH_KEY = null;

  function isHookReportingSuppressed() {
    return (window[HOOK_SUPPRESSION_DEPTH_KEY] || 0) > 0;
  }

  let logRateWindowStart = Date.now();
  let logRateCount = 0;

  // Tuning config (hook timing, window-property polling, log throttling).
  // Defaults and bounds live in modules/core/hooks-config.js (ISOLATED world),
  // which sends a complete, clamped config with every install event; this world
  // only checks its shape and never invents values. test/hooks-config.test.js
  // pins that every key read here exists in that schema.
  let activeHooksConfig = null; // null until the first valid install
  // Minimum monitoring window, computed by HooksConfig.minMonitorMs on the
  // ISOLATED side and sent with the config it belongs to
  let activeMinMonitorMs = 0;

  function isNonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  function isValidHooksConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
    const values = Object.values(config);
    return values.length > 0 && values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  }

  const getErrorMessage = (err) => {
    if (!err) return '';
    if (typeof err.message === 'string') return err.message;
    try {
      return String(err);
    } catch (e) {
      return '';
    }
  };

  const isIllegalInvocationError = (err) => {
    return !!illegalInvocationMessage && getErrorMessage(err).includes(illegalInvocationMessage);
  };

  // Suppress hook-related errors from breaking the page. Registered from the
  // bootstrap (before any page script). Only our own internal illegal-invocation
  // noise is suppressed — never genuine page/API errors that merely pass through
  // our frame.
  function installErrorFilters() {
    const ownScript = MAIN_WORLD.HOOKS_SCRIPT;

    window.addEventListener('error', (event) => {
      const msg = getErrorMessage(event.error || event.message || event);
      if (event.filename && event.filename.includes(ownScript) && isIllegalInvocationError(msg)) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
      }
    }, true);

    // Suppress unhandled promise rejections from hook wrappers
    window.addEventListener('unhandledrejection', (event) => {
      try {
        if (!isIllegalInvocationError(event.reason)) return;

        const stack = event.reason && typeof event.reason.stack === 'string' ? event.reason.stack : '';
        if (stack.includes(ownScript)) {
          event.preventDefault();
          event.stopImmediatePropagation?.();
        }
      } catch (e) {
        logError(`[Hooks MAIN] unhandledrejection inspection failed: ${getErrorMessage(e)}`);
      }
    }, true);
  }

  // The MAIN-world helpers load before this file (same manifest entry, pinned by
  // test/bridge-protocol-guard.test.js). Their globals are page-visible, so take
  // the references now, before any page script could replace or delete them.
  const windowPropertyTracker = window.__WindowPropertyTracker || null;
  const hookResilienceManager = window.__HookResilienceManager || null;
  const conditionLanguage = window.ScrapflyWindowConditionLanguage || null;

  // Hooks monitoring state (module scope for disable monitoring)
  let installedHooks = new Map(); // Map: hook.target -> {obj, propertyName, originalDescriptor, detectors (Map), wrapper, fallbackContext}
  let completionTimeout = null;
  let pageReadySignalReceived = false;
  const pageReadyCallbacks = [];


  // Resolve a dotted path from window ("navigator.mediaDevices"); null when a
  // segment is missing or a getter throws.
  function resolveWindowPath(dottedPath) {
    try {
      return dottedPath.split(PATH_SEPARATOR).reduce((parent, part) => parent?.[part], window) ?? null;
    } catch (e) {
      return null;
    }
  }

  // `this` for calls that arrive without one: the first of the engine-resolved
  // contextPaths (a detector's windowPath, then the target interface's usual
  // instance) that names a live object.
  function resolveContext(contextPaths) {
    for (const contextPath of contextPaths) {
      const value = resolveWindowPath(contextPath);
      // A constructor (e.g. windowPath "BatteryManager") is not a usable instance
      if (value && typeof value !== 'function') return value;
    }
    return null;
  }

  // Early bind shims: let page code call some methods unbound without an
  // illegal-invocation TypeError. Which methods, and the instance each falls
  // back to, is engine data (detection-engine-hooks.js, demEarlyBindShims)
  // delivered in the bootstrap event, which content.js fires synchronously at
  // document_start: before the first install event (which waits on storage)
  // and before page scripts can capture the originals.
  function isBindShimSpec(spec) {
    return !!spec && typeof spec.target === 'string' && Array.isArray(spec.contextPaths) &&
      spec.contextPaths.every(p => typeof p === 'string');
  }

  // Shims that could not be installed, reported with the first debug-mode install
  const bindShimFailures = [];

  const createBindShim = (original, instance, propertyName) => {
    // A method definition, like the native member: same name, no own
    // `prototype`, not constructible (a plain function would expose name
    // "shim" and a prototype object to the page)
    const { [propertyName]: shim } = {
      [propertyName](...args) {
        const ctx = (this === undefined || this === null || this === window) ? instance : this;
        try {
          // Return the original result/promise untouched to preserve identity.
          return Reflect.apply(original, ctx, args);
        } catch (e) {
          // Retry only for a genuine illegal invocation; all other errors
          // propagate exactly like the native call.
          if (instance && instance !== ctx && isIllegalInvocationError(e)) {
            return Reflect.apply(original, instance, args);
          }
          throw e;
        }
      }
    };

    Object.defineProperty(shim, MAIN_WORLD.BIND_SHIM_MARKER, { value: true });
    Object.defineProperties(shim, {
      name: { value: original.name, writable: false, enumerable: false, configurable: true },
      length: { value: original.length, writable: false, enumerable: false, configurable: true },
      toString: {
        value: function toString() {
          return Function.prototype.toString.call(original);
        },
        writable: true,
        configurable: true
      }
    });

    return shim;
  };

  const installEarlyBindShims = (specs) => {
    for (const spec of specs) {
      try {
        const targetParts = spec.target.split(PATH_SEPARATOR);
        const propertyName = targetParts.pop();
        const proto = resolveWindowPath(targetParts.join(PATH_SEPARATOR));
        const instance = resolveContext(spec.contextPaths);

        // Prefer prototype patch (affects all instances)
        if (proto) {
          const desc = Object.getOwnPropertyDescriptor(proto, propertyName);
          if (desc && typeof desc.value === 'function' && !desc.value[MAIN_WORLD.BIND_SHIM_MARKER]) {
            const shim = createBindShim(desc.value, instance, propertyName);
            try {
              Object.defineProperty(proto, propertyName, {
                value: shim,
                writable: desc.writable,
                enumerable: desc.enumerable,
                configurable: desc.configurable
              });
              continue;
            } catch (e) {
              // Fall through to instance patch
            }
          }
        }

        // Fallback: instance patch (if prototype is locked)
        if (instance && typeof instance[propertyName] === 'function' && !instance[propertyName][MAIN_WORLD.BIND_SHIM_MARKER]) {
          const shim = createBindShim(instance[propertyName], instance, propertyName);
          try {
            // Prefer direct assignment (works for many DOM instances)
            instance[propertyName] = shim;
          } catch (e) {
            try {
              Object.defineProperty(instance, propertyName, { value: shim, writable: true, configurable: true });
            } catch (e2) {
              bindShimFailures.push({ target: spec.target, error: getErrorMessage(e2) });
            }
          }
        }
      } catch (e) {
        bindShimFailures.push({ target: spec.target, error: getErrorMessage(e) });
      }
    }
  };

  // A non-`.prototype.` function target that owns a real prototype object is a
  // constructor/namespace (Intl.DateTimeFormat, DeviceMotionEvent, …). Wrapping it
  // as a plain function would silently drop its static methods (e.g.
  // Intl.DateTimeFormat.supportedLocalesOf) and break `new`/subclassing, which
  // crashes strict apps during init. We refuse to hook these.
  // "X.prototype.y": a segment other than the first and the last is `prototype`
  function isPrototypeMemberTarget(target) {
    return target.split(PATH_SEPARATOR).slice(1, -1).includes('prototype');
  }

  function isConstructorLikeTarget(fn) {
    try {
      const protoDesc = Object.getOwnPropertyDescriptor(fn, 'prototype');
      return !!(protoDesc && protoDesc.value && typeof protoDesc.value === 'object');
    } catch (e) {
      return true; // conservative: if unsure, don't wrap
    }
  }

// Early hook recording. Hook definitions arrive with the first install event,
  // which waits on storage, so calls a page makes in its first moments would be
  // missed. From the bootstrap (before any page script) every target the engine
  // lists (demEarlyHooks in detection-engine-hooks.js) is wrapped by a recorder
  // that only notes the call; the install event puts the APIs back and reports
  // the noted targets through the real hooks. Same-origin child windows (blank
  // iframes, where content scripts do not run and fingerprinting scripts like
  // to call pristine APIs) get recorders when the page first reaches them;
  // their calls are reported through the current install.
  let earlyTargets = [];
  const earlyRecorders = new Map(); // target -> {obj, propertyName, originalDescriptor, replacement}
  let earlyCalls = null;            // targets called before the install event
  let earlyRetireTimer = null;
  let activeHookReporter = null;    // the current install's reporter, for calls after it
  const instrumentedDocuments = new WeakSet();
  // Taken before any page script can replace it
  const NativeMutationObserver = typeof window.MutationObserver === 'function' ? window.MutationObserver : null;

  function isEarlyHooksSpec(spec) {
    return !!spec && Array.isArray(spec.targets) && Array.isArray(spec.childWindowAccessors) &&
      Number.isFinite(spec.maxMs) && spec.maxMs > 0;
  }

  function resolvePathFrom(root, parts) {
    try {
      return parts.reduce((parent, part) => parent?.[part], root) ?? null;
    } catch (e) {
      return null; // a cross-origin window throws on any property
    }
  }

  // Same name, length, source text and prototype as the native member
  function disguiseAs(wrapper, original) {
    try {
      Object.defineProperties(wrapper, {
        name: { value: original.name, writable: false, enumerable: false, configurable: true },
        length: { value: original.length, writable: false, enumerable: false, configurable: true },
        toString: {
          value: function toString() {
            return Function.prototype.toString.call(original);
          },
          writable: true,
          configurable: true
        }
      });
      Object.setPrototypeOf(wrapper, Object.getPrototypeOf(original));
    } catch (e) {
      // Disguise failed, the wrapper still works
    }
    return wrapper;
  }

  function noteHookCall(target) {
    if (isHookReportingSuppressed()) return;
    if (earlyCalls) {
      earlyCalls.add(target);
    } else if (activeHookReporter) {
      activeHookReporter(target);
    }
  }

  // A method definition (no own prototype, not constructible) that calls the
  // native member exactly as the page did and notes the target only on success
  function createRecorder(original, target, propertyName) {
    const { [propertyName]: recorder } = {
      [propertyName](...args) {
        const result = Reflect.apply(original, this, args);
        try {
          noteHookCall(target);
        } catch (e) {
          // Recording must never break the page API
        }
        return result;
      }
    };
    return disguiseAs(recorder, original);
  }

  // Wrap `target` (resolved from `root`) with a recorder; null when it cannot be
  function wrapWithRecorder(root, target) {
    const parts = target.split(PATH_SEPARATOR);
    const propertyName = parts.pop();
    if (parts.length === 0) return null;
    const obj = resolvePathFrom(root, parts);
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return null;
    const originalDescriptor = Object.getOwnPropertyDescriptor(obj, propertyName);
    if (!originalDescriptor || !originalDescriptor.configurable) return null;
    let replacement;
    if (typeof originalDescriptor.get === 'function' && !originalDescriptor.value) {
      replacement = { ...originalDescriptor, get: createRecorder(originalDescriptor.get, target, propertyName) };
    } else if (typeof originalDescriptor.value === 'function') {
      if (!isPrototypeMemberTarget(target) && isConstructorLikeTarget(originalDescriptor.value)) return null;
      replacement = { ...originalDescriptor, value: createRecorder(originalDescriptor.value, target, propertyName) };
    } else {
      return null;
    }
    Object.defineProperty(obj, propertyName, replacement);
    return { obj, propertyName, originalDescriptor, replacement };
  }

  // Recorders on a child window's own interfaces, plus its own frame accessors
  // (nested frames). Cross-origin windows throw on access and are skipped.
  function instrumentChild(win, accessors) {
    if (!win || win === window) return;
    let doc;
    try {
      doc = win.document;
    } catch (e) {
      return;
    }
    // Keyed by document: a frame keeps its window object across navigations
    if (!doc || instrumentedDocuments.has(doc)) return;
    instrumentedDocuments.add(doc);
    for (const { target } of earlyTargets) {
      try {
        wrapWithRecorder(win, target);
      } catch (e) {
        // Not hookable in this window
      }
    }
    installChildWindowAccessors(win, accessors);
    watchFrames(win, doc, accessors);
    instrumentFramesOf(win, accessors);
  }

  // Frames reached by index (window[n]) never pass an accessor: instrument
  // every same-origin frame of `win` that is not yet (nested ones through
  // instrumentChild)
  function instrumentFramesOf(win, accessors) {
    let count = 0;
    try {
      count = win.length;
    } catch (e) {
      return;
    }
    for (let i = 0; i < count; i++) {
      let child = null;
      try {
        child = win[i];
      } catch (e) {
        child = null;
      }
      instrumentChild(child, accessors);
    }
  }

  // New frames appear with DOM insertions; the observer runs before the
  // inserting script's next task, early enough for fingerprinting that starts
  // after an await or a timer
  function watchFrames(win, doc, accessors) {
    if (!NativeMutationObserver) return;
    try {
      const observer = new NativeMutationObserver(() => instrumentFramesOf(win, accessors));
      observer.observe(doc, { childList: true, subtree: true });
    } catch (e) {
      // No frame watching in this document
    }
  }

  function installChildWindowAccessors(root, accessors) {
    for (const spec of accessors) {
      try {
        const parts = spec.target.split(PATH_SEPARATOR);
        const propertyName = parts.pop();
        const obj = resolvePathFrom(root, parts);
        const descriptor = obj && Object.getOwnPropertyDescriptor(obj, propertyName);
        if (!descriptor || typeof descriptor.get !== 'function' || !descriptor.configurable) continue;
        const original = descriptor.get;
        const viewProperty = typeof spec.viewProperty === 'string' && spec.viewProperty ? spec.viewProperty : null;
        const { [propertyName]: getter } = {
          [propertyName](...args) {
            const result = Reflect.apply(original, this, args);
            try {
              instrumentChild(viewProperty ? result?.[viewProperty] : result, accessors);
            } catch (e) {
              // Instrumentation must never break the page
            }
            return result;
          }
        };
        Object.defineProperty(obj, propertyName, { ...descriptor, get: disguiseAs(getter, original) });
      } catch (e) {
        // Accessor missing in this browser
      }
    }
  }

  function installEarlyHooks(spec) {
    earlyTargets = spec.targets.filter(t => t && typeof t.target === 'string' && t.target);
    const accessors = spec.childWindowAccessors.filter(a => a && typeof a.target === 'string' && a.target);
    earlyCalls = new Set();
    for (const { target } of earlyTargets) {
      try {
        const wrapped = wrapWithRecorder(window, target);
        if (wrapped) earlyRecorders.set(target, wrapped);
      } catch (e) {
        // Not hookable here; the real hook reports why
      }
    }
    installChildWindowAccessors(window, accessors);
    watchFrames(window, document, accessors);
    // If no install event comes, do not leave the recorders in place
    earlyRetireTimer = setTimeout(restoreEarlyRecorders, spec.maxMs);
  }

  // Put the APIs back (unless the page replaced them since); a captured
  // recorder keeps working and routes its calls to the current install
  function restoreEarlyRecorders() {
    if (earlyRetireTimer) {
      clearTimeout(earlyRetireTimer);
      earlyRetireTimer = null;
    }
    for (const { obj, propertyName, originalDescriptor, replacement } of earlyRecorders.values()) {
      try {
        const current = Object.getOwnPropertyDescriptor(obj, propertyName);
        if (current && current.get === replacement.get && current.value === replacement.value) {
          Object.defineProperty(obj, propertyName, originalDescriptor);
        }
      } catch (e) {
        // Stays a recorder
      }
    }
    earlyRecorders.clear();
  }

  // The targets called before the first install event; recording stops here
  function takeEarlyCalls() {
    const calls = earlyCalls ? Array.from(earlyCalls) : [];
    earlyCalls = null;
    return calls;
  }

  // Uninstall failure tracking (module scope for cross-function access)
  const uninstallStats = {
    attempts: 0,
    successes: 0,
    failures: 0,
    failedTargets: []
  };

  /**
   * Check if cache hit flag is set (helper to reduce duplication)
   * @returns {boolean} True if should exit due to cache hit
   */
  function shouldSkipDueToCacheHit() {
    return window[GLOBALS.CACHE_HIT_EARLY_EXIT] === true;
  }

  /**
   * Reset module state for SPA navigation
   * Prevents memory leaks from accumulating state across page transitions
   */
  function resetModuleState() {
    // Restore previous hooks to avoid stacking wrappers across reinjection / SPA re-init.
    try {
      uninstallAllRemainingHooks();
    } catch (e) {
      // Best-effort cleanup only
    }

    // Clear any pending completion timeout
    if (completionTimeout) {
      clearTimeout(completionTimeout);
      completionTimeout = null;
    }

    // Reset page ready state
    pageReadySignalReceived = false;
    pageReadyCallbacks.length = 0;

    // Reset uninstall stats
    uninstallStats.attempts = 0;
    uninstallStats.successes = 0;
    uninstallStats.failures = 0;
    uninstallStats.failedTargets.length = 0;

    if (windowPropertyTracker) {
      windowPropertyTracker.reset();
    }
  }

  // Send debug logs to service worker when debug mode enabled
  const formatLogArg = (arg) => {
    if (arg === null || arg === undefined) return String(arg);
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') {
      return String(arg);
    }
    if (arg instanceof Error) {
      return `Error(${arg.message})`;
    }
    if (Array.isArray(arg)) {
      return `[Array(${arg.length})]`;
    }
    if (typeof arg === 'object') {
      try {
        const keys = Object.keys(arg).slice(0, activeHooksConfig.LOG_OBJECT_PREVIEW_KEYS);
        return `{${keys.join(', ')}}`;
      } catch (e) {
        return '[Object]';
      }
    }
    return String(arg);
  };

  // Debug-log text: one line, prefixed with this world's label, capped at LOG_MAX_MESSAGE_LENGTH
  function formatLogLine(args, config) {
    let message = [LOG.PREFIXES.MAIN_WORLD, ...args].map(formatLogArg).join(' ');
    if (message.length > config.LOG_MAX_MESSAGE_LENGTH) {
      message = `${message.slice(0, config.LOG_MAX_MESSAGE_LENGTH)}...`;
    }
    return message;
  }

  const sendLog = function(level, args) {
    // Early return for zero overhead when debug disabled (and nothing to throttle
    // with before the first valid config)
    if (!debugMode || !activeHooksConfig) return;
    const config = activeHooksConfig;

    // Routine traces only with Verbose logs (and never into the Log Collector)
    if (level === LOG.LEVELS.LOG && (!debugVerbose || logCollectorEnabled)) {
      return;
    }

    const now = Date.now();
    if (now - logRateWindowStart >= config.LOG_RATE_WINDOW_MS) {
      logRateWindowStart = now;
      logRateCount = 0;
    }
    logRateCount += 1;
    const maxPerWindow = logCollectorEnabled ? config.LOG_MAX_PER_WINDOW_WITH_COLLECTOR : config.LOG_MAX_PER_WINDOW;
    if (logRateCount > maxPerWindow) {
      return;
    }

    try {
      postBridgeMessage({
        type: MESSAGE_TYPES.DEBUG_LOG,
        level: level,
        message: formatLogLine(args, config),
        source: LOG.SOURCES.MAIN_WORLD,
        timestamp: Date.now()
      });
    } catch (e) {
      // Silently fail
    }
  };
  const logDebug = (...args) => sendLog(LOG.LEVELS.LOG, args);
  const logWarn = (...args) => sendLog(LOG.LEVELS.WARN, args);
  const logError = (...args) => sendLog(LOG.LEVELS.ERROR, args);

  /**
   * Put a hooked property back to its original descriptor
   * @returns {boolean} false when it cannot be restored (likely non-configurable);
   *   the entry then stays in installedHooks and the hook stays active until unload
   */
  function restoreHook(hookTarget, hookData) {
    const { obj, propertyName, originalDescriptor } = hookData;
    try {
      Object.defineProperty(obj, propertyName, originalDescriptor);
      installedHooks.delete(hookTarget);
      return true;
    } catch (e) {
      logError(`[Hooks MAIN] Failed to uninstall ${hookTarget} (property "${propertyName}" is likely non-configurable): ${e.message}`);
      return false;
    }
  }

  /**
   * Uninstall all remaining hooks (called on disable or completion)
   * @returns {Object} - Statistics about uninstall results
   */
  function uninstallAllRemainingHooks() {
    if (installedHooks.size === 0) {
      return { total: 0, successes: 0, failures: 0, failedTargets: [] };
    }

    const targetsToUninstall = Array.from(installedHooks.keys());

    const stats = {
      total: targetsToUninstall.length,
      successes: 0,
      failures: 0,
      failedTargets: []
    };

    // Batch uninstall - iterate once
    for (const hookTarget of targetsToUninstall) {
      const hookData = installedHooks.get(hookTarget);
      if (!hookData) continue;

      if (restoreHook(hookTarget, hookData)) {
        stats.successes++;
      } else {
        stats.failures++;
        stats.failedTargets.push(hookTarget);
      }
    }

    if (stats.failures > 0) {
      logWarn(`[Hooks MAIN] Failed hooks remain active: ${stats.failedTargets.join(', ')}`);
    }

    return stats;
  }

  // Listen for authenticated control messages from ISOLATED world.
  const onIsolatedMessage = (event) => {
    event.stopImmediatePropagation?.();
    const data = getTrustedIsolatedMessageData(event);
    if (!data) return;

    if (data && data.type === MESSAGE_TYPES.PAGE_READY) {
      if (!pageReadySignalReceived) {
        pageReadySignalReceived = true;
        logDebug('[MAIN WORLD] Page ready message received');
        while (pageReadyCallbacks.length > 0) {
          const callback = pageReadyCallbacks.shift();
          try {
            callback();
          } catch (e) {
            logError('[MAIN WORLD] Error executing page ready callback:', e);
          }
        }
      }
      return;
    }

    // Handle cache hit notification from ISOLATED world
    if (data && data.type === MESSAGE_TYPES.CACHE_HIT) {
      logDebug('[MAIN WORLD] Cache hit notification received - setting flag to stop hook reporting');
      window[GLOBALS.CACHE_HIT_EARLY_EXIT] = true;
      return;
    }

    // Handle disable monitoring command (cache hit)
    if (data && data.type === MESSAGE_TYPES.DISABLE_MONITORING) {
      logDebug(`Monitoring stopped (${data.reason || 'cache hit'})`);

      // Disable hooks monitoring - clear timeout
      if (completionTimeout) {
        clearTimeout(completionTimeout);
        completionTimeout = null;
      }

      // Uninstall any installed hooks to reduce overhead
      const cacheHitUninstallStats = uninstallAllRemainingHooks();
      if (cacheHitUninstallStats.failures > 0) {
        logWarn(`Cache hit cleanup: ${cacheHitUninstallStats.failures} hooks could not be removed`);
      }
    }

    // Stop window property polling after detection completes (late results won't update anything)
    if (data && data.type === MESSAGE_TYPES.STOP_WINDOW_POLLING) {
      if (windowPropertyTracker && windowPropertyTracker.isPolling) {
        windowPropertyTracker.stop();
        logDebug('[MAIN WORLD] Window property polling stopped (detection finalized)');
      }
    }

    // Handle JS API events from ISOLATED world - dispatch CustomEvent to page
    // This bridges the ISOLATED/MAIN world gap so page scripts can receive events
    if (data && data.type === MESSAGE_TYPES.JS_API_EVENT) {
      try {
        const eventName = data.eventName;
        const eventDetail = data.detail;
        const fullEventName = `${EVENTS.JS_API_PREFIX}${eventName}`;

        // Echo to the PAGE DevTools console only in Debug mode: otherwise every
        // site's console filled with ~11 collapsed groups per page load. Page
        // scripts still receive every event (CustomEvent and window callbacks).
        try {
          if (debugMode && typeof console !== 'undefined' && console) {
            const label = `${MAIN_WORLD.JS_API_CONSOLE_LABEL}${fullEventName}`;
            if (typeof console.groupCollapsed === 'function') {
              console.groupCollapsed(label);
              console.log(eventDetail);
              if (typeof console.groupEnd === 'function') console.groupEnd();
            } else if (typeof console.info === 'function') {
              console.info(label, eventDetail);
            } else if (typeof console.log === 'function') {
              console.log(label, eventDetail);
            }
          }
        } catch (e) {
          // Never let console logging break event dispatch
        }

        // Store last detection for sync access by page scripts
        window[GLOBALS.LAST_DETECTION] = eventDetail;

        // Method 1: Dispatch CustomEvent to page window (MAIN world)
        const event = new CustomEvent(fullEventName, {
          detail: eventDetail,
          bubbles: true,
          cancelable: false
        });
        window.dispatchEvent(event);

        // Method 2: Call callback function if defined (for early setup)
        // Page can do: window.onDetection = (data) => console.log(data);
        // eventName is already like 'onDetection', so use it directly
        if (typeof window[eventName] === 'function') {
          try {
            window[eventName](eventDetail);
            logDebug(`[MAIN WORLD] Called callback: window.${eventName}()`);
          } catch (callbackError) {
            logError(`[MAIN WORLD] Callback error: ${callbackError.message}`);
          }
        }
      } catch (e) {
        logError('[MAIN WORLD] Failed to dispatch JS API event:', e.message);
      }
      return;
    }
  };

  const onInstallHooks = (event) => {
    event.stopImmediatePropagation?.();
    if (event.detail?.[FIELDS.TOKEN] !== bridgeToken) {
      return;
    }
    // The real hooks resolve the APIs next: take the early recorders off first
    restoreEarlyRecorders();

    const now = Date.now();
    if (activeHooksConfig && now - lastHooksInstallAt < activeHooksConfig.INSTALL_DEBOUNCE_MS) {
      return;
    }
    lastHooksInstallAt = now;

    // Check if cache hit - skip hook installation entirely
    if (shouldSkipDueToCacheHit()) {
      return;
    }

    const earlyCalled = takeEarlyCalls();

    // Reset module state for SPA navigation (prevents memory leaks)
    resetModuleState();

    // Set debugMode first, before any logging
    debugMode = event.detail?.debugMode || false; // Receive debug mode from ISOLATED world
    debugVerbose = debugMode && event.detail?.debugVerbose === true;
    logCollectorEnabled = event.detail?.logCollectorEnabled || false;

    const receivedHooksConfig = event.detail?.hooksConfig;
    const receivedMinMonitorMs = event.detail?.minMonitorMs;
    if (isValidHooksConfig(receivedHooksConfig) && isNonNegativeNumber(receivedMinMonitorMs)) {
      activeHooksConfig = Object.freeze({ ...receivedHooksConfig });
      activeMinMonitorMs = receivedMinMonitorMs;
    } else if (activeHooksConfig) {
      logError('[MAIN WORLD] Invalid hooksConfig received; keeping the previous config', receivedHooksConfig);
    } else {
      // Only reachable if the ISOLATED world stops attaching a resolved config.
      // Install nothing rather than guess timings; the empty install still completes.
      logError('[MAIN WORLD] Missing or invalid hooksConfig on first install; skipping JS hooks', receivedHooksConfig);
    }

    if (debugMode && bindShimFailures.length > 0) {
      logWarn('[Bind shims] Not installed:', bindShimFailures.map(f => `${f.target}: ${f.error}`).join('; '));
      bindShimFailures.length = 0;
    }

    // Handle fingerprintEnabled flag from event
    // This is the authoritative value from ISOLATED world (updated from storage)
    const fingerprintEnabled = event.detail?.fingerprintEnabled !== false;

    const hasHooksConfig = activeHooksConfig !== null;
    const hookDefinitions = hasHooksConfig ? (event.detail?.hookDefinitions || []) : [];
    const windowProperties = hasHooksConfig ? (event.detail?.windowProperties || []) : [];

    logDebug(`Install: ${hookDefinitions.length} hook detectors, ${windowProperties.length} window checks, fingerprint ${fingerprintEnabled ? 'on' : 'off'}`);

    if (hookResilienceManager) {
      hookResilienceManager.setExpectedTargets(hookDefinitions);
    }

    // Check window properties with WindowPropertyTracker
    if (windowProperties.length > 0) {

      const startWindowChecksWithTracker = () => {
        // Check cache flag before starting
        if (shouldSkipDueToCacheHit()) {
          logDebug('[Window Props] Cache hit - skipping window property checks');
          postBridgeMessage({
            type: MESSAGE_TYPES.WINDOW_PROPS_COMPLETE,
            url: window.location.href,
            timestamp: Date.now(),
            detectedCount: 0,
            reason: WINDOW_REASONS.CACHE_HIT
          });
          return;
        }

        if (!windowPropertyTracker) {
          // Only reachable if the manifest stops loading the tracker before this file
          logError('[Window Props] WindowPropertyTracker not loaded; no window property checks');
          postBridgeMessage({
            type: MESSAGE_TYPES.WINDOW_PROPS_COMPLETE,
            url: window.location.href,
            timestamp: Date.now(),
            detectedCount: 0,
            reason: WINDOW_REASONS.TRACKER_UNAVAILABLE
          });
          return;
        }

        windowPropertyTracker.initialize(windowProperties, {
          protocol: PROTOCOL,
          conditionLanguage,
          config: activeHooksConfig,
          debugMode: debugMode && debugVerbose,
          postMessageToIsolated: postBridgeMessage,
          onDetection: (detections) => {
            // Forward detections to content script
            postBridgeMessage({
              type: MESSAGE_TYPES.WINDOW_DETECTIONS,
              detections: detections,
              timestamp: Date.now()
            });
            },
            onComplete: (result) => {
              logDebug(`[Window Props] WindowPropertyTracker complete: ${result.detectedCount}/${result.totalChecked} in ${result.elapsedMs}ms (${result.reason})`);
              // WINDOW_PROPS_COMPLETE is sent by the tracker itself
            }
          });

        // Adaptive polling: EARLY -> NORMAL -> LATE -> FINAL phases from the config (WINDOW_PHASE_*)
        windowPropertyTracker.startPolling();
      };

      if (document.readyState === 'complete' || pageReadySignalReceived) {
        startWindowChecksWithTracker();
      } else {
        pageReadyCallbacks.push(startWindowChecksWithTracker);
      }
    } else {
      // No window properties to check - send completion immediately
      logDebug('[Window Props] No window properties to check - sending completion immediately');
      postBridgeMessage({
        type: MESSAGE_TYPES.WINDOW_PROPS_COMPLETE,
        url: window.location.href,
        timestamp: Date.now(),
        detectedCount: 0
      });
    }

    // Initialize/reset hooks state for this page load
    // target -> ids of the detectors that already reported it (one-shot each)
    const firedDetectors = new Map();
    let detectionCount = 0;
    const hasFired = (detectorId, target) => firedDetectors.get(target)?.has(detectorId) === true;
    // Targets whose detectors have all fired their one-shot detection. The
    // wrapper short-circuits the entire detection path for these, eliminating
    // per-call overhead on hot APIs (e.g. performance.now, getComputedStyle).
    // Lives in the per-install scope, so it resets naturally on SPA re-init.
    const exhaustedHooks = new Set();
    let hooksStartTime = Date.now();
    const minMonitorMs = hasHooksConfig ? activeMinMonitorMs : 0;

    // Unified completion system with single entry point
    // Prevents race conditions between activity timeout (2s) and max timeout (3s)
    let maxTimeoutId = null;
    let completionSignalSent = false;

    /**
     * Complete hook detection with cleanup
     * @param {string} reason - one of COMPLETION_REASONS.HOOKS
     */
    const completeDetection = (reason) => {
      if (completionSignalSent) return;
      completionSignalSent = true;

      const elapsed = Date.now() - hooksStartTime;
      // Cleanup: uninstall any remaining hooks (only needed for timeout completions)
      if (reason !== HOOKS_REASONS.NO_HOOKS && reason !== HOOKS_REASONS.CACHE_HIT && installedHooks.size > 0) {
        const bulkUninstallStats = uninstallAllRemainingHooks();
        uninstallStats.attempts += bulkUninstallStats.total;
        uninstallStats.successes += bulkUninstallStats.successes;
        uninstallStats.failures += bulkUninstallStats.failures;
        uninstallStats.failedTargets.push(...bulkUninstallStats.failedTargets);
      }
      const fired = Array.from(firedDetectors.keys()).sort();
      logDebug(`Hooks done (${reason}) in ${elapsed}ms: ${fired.length}/${originalHooksCount || 0} fired${fired.length ? ` [${fired.join(', ')}]` : ''}, ${uninstallStats.successes}/${uninstallStats.attempts} removed`);

      // Clear pending timeouts
      if (completionTimeout) {
        clearTimeout(completionTimeout);
        completionTimeout = null;
      }
      if (maxTimeoutId) {
        clearTimeout(maxTimeoutId);
        maxTimeoutId = null;
      }

      // Send completion signal
      postBridgeMessage({
        type: MESSAGE_TYPES.JS_HOOKS_COMPLETE,
        url: window.location.href,
        timestamp: Date.now(),
        totalDetections: detectionCount,
        uniqueHooks: detectionCount,
        completionReason: reason,
        completionTime: elapsed,
        uninstallStats: {
          attempts: uninstallStats.attempts,
          successes: uninstallStats.successes,
          failures: uninstallStats.failures,
          failedTargets: uninstallStats.failedTargets.slice()
        }
      });
    };

    let totalHooksCount = 0;
    for (const detector of hookDefinitions) {
      totalHooksCount += detector.hooks.length;
    }

    /**
     * Uninstall a hook by restoring its original property descriptor
     * @param {string} hookTarget - Hook target (e.g., "Performance.prototype.now")
     * @returns {boolean} - True if uninstalled successfully, false if failed
     */
    function uninstallHook(hookTarget) {
      const hookData = installedHooks.get(hookTarget);
      if (!hookData) {
        logWarn(`[Hooks MAIN] Cannot uninstall ${hookTarget} - not found in installedHooks`);
        return false; // Already uninstalled or never installed
      }

      return restoreHook(hookTarget, hookData);
    }

    /**
     * Schedule completion after activity timeout (2s of inactivity)
     * Resets on each hook detection
     */
    function scheduleCompletion() {
      if (completionTimeout) clearTimeout(completionTimeout);
      completionTimeout = setTimeout(() => {
        const elapsed = Date.now() - hooksStartTime;
        if (elapsed < minMonitorMs) {
          const remaining = minMonitorMs - elapsed;
          logDebug(`[Hooks MAIN] Minimum monitor window not reached (${elapsed}ms/${minMonitorMs}ms) - extending by ${remaining}ms`);
          completionTimeout = setTimeout(() => {
            completeDetection(HOOKS_REASONS.ACTIVITY_TIMEOUT);
          }, remaining);
          return;
        }

        completeDetection(HOOKS_REASONS.ACTIVITY_TIMEOUT);
      }, activeHooksConfig.ACTIVITY_TIMEOUT_MS);
    }

    function reportHookDetectionsForTarget(hookTarget) {
      // Cache-hit decisions must come from authoritative signals (ISOLATED world/background).
      // sessionStorage-based cache hints can go stale after manual cache clears or settings changes.
      if (shouldSkipDueToCacheHit()) {
        return;
      }

      const hookData = installedHooks.get(hookTarget);
      const detectors = hookData && hookData.detectors instanceof Map ? hookData.detectors : null;
      const detectorCount = detectors ? detectors.size : 0;

      if (!detectors || detectorCount === 0) {
        // Still count activity so completion can settle reliably.
        scheduleCompletion();
        return;
      }

      const timeElapsed = Date.now() - hooksStartTime;
      let newDetections = 0;

      for (const [detectorId, info] of detectors.entries()) {
        if (hasFired(detectorId, hookTarget)) continue;

        if (!firedDetectors.has(hookTarget)) firedDetectors.set(hookTarget, new Set());
        firedDetectors.get(hookTarget).add(detectorId);
        detectionCount++;
        newDetections++;

        const detectorName = info?.detectorName || detectorId;
        const category = info?.category;
        const hook = info?.hook || { target: hookTarget };

        postBridgeMessage({
          type: MESSAGE_TYPES.JS_HOOK_DETECTION,
          detection: {
            detectorId: detectorId,
            detectorName: detectorName,
            category: category,
            hook: {
              target: hookTarget,
              confidence: hook.confidence,
              description: hook.description
            },
            timestamp: Date.now()
          },
          url: window.location.href
        });
      }

      if (newDetections > 0) {
        // One line per target, on its first fire (repeat calls are not logged)
        logDebug(`Hook fired at ${timeElapsed}ms: ${hookTarget} (${detectorCount} detector${detectorCount === 1 ? '' : 's'})`);
        // Reset the inactivity timer only on genuine NEW detections. Duplicate
        // fires of an already-detected target are not new activity and must not
        // churn clearTimeout/setTimeout on every hot-path call.
        scheduleCompletion();
      }

      // Once every detector for this target has fired its one-shot message, mark
      // the target exhausted so the wrapper stops invoking the detection path.
      // This also covers non-configurable targets that cannot be uninstalled.
      if (Array.from(detectors.keys()).every(detectorId => hasFired(detectorId, hookTarget))) {
        exhaustedHooks.add(hookTarget);
      }

      // Uninstall hook immediately after firing to reduce overhead
      if (newDetections > 0) {
        const uninstalled = uninstallHook(hookTarget);
        if (uninstalled) {
          uninstallStats.successes++;
        } else {
          uninstallStats.failures++;
          uninstallStats.failedTargets.push(hookTarget);
          logWarn(`[Hooks MAIN] Failed to uninstall: ${hookTarget}`);
        }
      }
    }

    // Calls from early recorders the page kept and from child windows
    activeHookReporter = (hookTarget) => {
      if (installedHooks.has(hookTarget) && !exhaustedHooks.has(hookTarget)) {
        reportHookDetectionsForTarget(hookTarget);
      }
    };

    const stealthDescriptors = {
      name: { writable: false, enumerable: false, configurable: true },
      length: { writable: false, enumerable: false, configurable: true },
      toString: { writable: true, enumerable: false, configurable: true }
    };

    // Wrapper factory for faster hook creation
    // Creates lightweight wrappers without repeated property definitions
    // FIXED: Preserves proper 'this' context to avoid illegal-invocation errors
    function getContextPaths(hook) {
      if (Array.isArray(hook.contextPaths)) return hook.contextPaths.filter(p => typeof p === 'string' && p);
      return typeof hook.windowPath === 'string' && hook.windowPath ? [hook.windowPath] : [];
    }

    // Engine-supplied argument swap (detection-engine-hooks.js,
    // demHookArgSubstitution): a string argument listed in `values` is replaced
    // before the native call, so the browser does not log a page's own
    // deprecation warning against this file. Invalid specs are ignored.
    function createArgSubstituter(spec) {
      if (!spec || !Number.isInteger(spec.index) || spec.index < 0 || !Array.isArray(spec.values)) return null;
      const values = new Set(spec.values.filter(v => typeof v === 'string'));
      if (values.size === 0) return null;
      const { index, replacement } = spec;
      return (args) => {
        if (args.length <= index || typeof args[index] !== 'string' || !values.has(args[index])) return args;
        const swapped = args.slice();
        swapped[index] = replacement;
        return swapped;
      };
    }

    function createStealthWrapper(original, callback, explicitContext, target, contextPaths, isGetter = false, substituteArgs = null) {
      const wrapper = function(...args) {
        // Prefer the natural 'this'; fall back to a resolved context only when
        // 'this' is missing (e.g. destructured calls: const { getBattery } = navigator).
        const dynamicContext = (explicitContext && typeof explicitContext !== 'function')
          ? explicitContext
          : resolveContext(contextPaths);
        const context = (this === undefined || this === null) ? (dynamicContext || this) : this;
        const callArgs = substituteArgs ? substituteArgs(args) : args;

        let result;
        try {
          result = Reflect.apply(original, context, callArgs);
        } catch (e) {
          // Last-resort retry ONLY for a genuine illegal invocation when a
          // different context is available. All other errors propagate exactly
          // like the native call (no double-execution of side-effecting APIs).
          if (dynamicContext && dynamicContext !== context && isIllegalInvocationError(e)) {
            result = Reflect.apply(original, dynamicContext, callArgs);
          } else {
            throw e;
          }
        }

        // Failed native calls (including brand-check probes) must neither report
        // nor consume this target's one-shot detection. A successful fallback
        // reaches the same reporting path, without awaiting or replacing promises.
        if (!isHookReportingSuppressed() && !exhaustedHooks.has(target)) {
          try {
            callback();
          } catch (e) {
            // Detection error must never break the page API.
            logError(`[Hooks MAIN] Detection callback error for ${target}: ${getErrorMessage(e)}`);
          }
        }
        return result;
      };

      // Apply stealth properties in one batch
      try {
        Object.defineProperties(wrapper, {
          name: { ...stealthDescriptors.name, value: original.name },
          length: { ...stealthDescriptors.length, value: original.length },
          toString: {
            ...stealthDescriptors.toString,
            value: function toString() {
              return Function.prototype.toString.call(original);
            }
          }
        });

        // Copy prototype for methods
        if (!isGetter && original.prototype) {
          wrapper.prototype = original.prototype;
          Object.setPrototypeOf(wrapper, Object.getPrototypeOf(original));
        }
      } catch (e) {
        // Stealth properties failed, wrapper still works
      }

      return wrapper;
    }

    function installHook(detectorId, detectorName, category, hook) {
      const resilienceManager = hookResilienceManager;
      if (!resilienceManager) {
        // Only reachable if the manifest stops loading it before this file
        logError(`[Hooks MAIN] HookResilienceManager not loaded; cannot install ${hook.target}`);
        return false;
      }
      try {
        // The resilience manager resolves the target (path walk + descriptor) and
        // decides whether it can be wrapped; its result is what gets hooked
        const verification = resilienceManager.verifyHookTarget(hook.target);
        if (!verification.canInstall) {
          resilienceManager.registerHookFailure(hook.target, verification.reason);
          logWarn(`[Hooks MAIN] Verification failed for ${hook.target}: ${verification.reason}`);
          return false;
        }
        const { obj, propertyName, descriptor: originalDescriptor } = verification;

        // Never destructively wrap a constructor/namespace target. Detectors that
        // target these (e.g. Intl.DateTimeFormat) must use a window-property check
        // instead. Accessor/data window.* props (devicePixelRatio, innerHeight,
        // speechSynthesis) are NOT functions, so they remain hookable.
        if (!isPrototypeMemberTarget(hook.target) &&
            typeof originalDescriptor.value === 'function' &&
            isConstructorLikeTarget(originalDescriptor.value)) {
          resilienceManager.registerHookFailure(hook.target, HOOK_FAILURE_REASONS.CONSTRUCTOR_TARGET_NOT_HOOKABLE);
          logWarn(`[Hooks MAIN] Skipped constructor/namespace target (would break page): ${hook.target}`);
          return false;
        }

        const existingHook = installedHooks.get(hook.target);
        if (existingHook) {
          // Hook already installed - just add this detector to its list
          existingHook.detectors.set(detectorId, { detectorName, category, hook });
          return existingHook;
        }

        // Fallback `this` for unbound calls, from the detector's windowPath or the
        // target interface's instance (engine-resolved contextPaths)
        const contextPaths = getContextPaths(hook);
        const explicitContext = resolveContext(contextPaths);
        if (!explicitContext && hook.windowPath) {
          logDebug(`[Hooks] No usable instance at windowPath "${hook.windowPath}" for ${hook.target}`);
        }

        const hookMetadata = {
          obj,
          propertyName,
          originalDescriptor,
          detectors: new Map([[detectorId, { detectorName, category, hook }]]),
          wrapper: null
        };

        // Create callback once to avoid closure overhead
        const reportCallback = () => reportHookDetectionsForTarget(hook.target);

        // Handle getter properties - use optimized wrapper factory
        let wrapperDescriptor = null;
        if (originalDescriptor.get && !originalDescriptor.value) {
          const stealthGetter = createStealthWrapper(originalDescriptor.get, reportCallback, explicitContext, hook.target, contextPaths, true);

          wrapperDescriptor = {
            get: stealthGetter,
            set: originalDescriptor.set,
            enumerable: originalDescriptor.enumerable,
            configurable: originalDescriptor.configurable
          };
          Object.defineProperty(obj, propertyName, wrapperDescriptor);
          hookMetadata.wrapper = stealthGetter;
        }
        // Handle regular methods - use optimized wrapper factory
        else if (typeof originalDescriptor.value === 'function') {
          const wrapper = createStealthWrapper(originalDescriptor.value, reportCallback, explicitContext, hook.target, contextPaths, false, createArgSubstituter(hook.argSubstitution));

          wrapperDescriptor = {
            value: wrapper,
            writable: originalDescriptor.writable,
            enumerable: originalDescriptor.enumerable,
            configurable: originalDescriptor.configurable
          };
          Object.defineProperty(obj, propertyName, wrapperDescriptor);
          hookMetadata.wrapper = wrapper;
        }

        installedHooks.set(hook.target, hookMetadata);

        // Register successful installation with HookResilienceManager
        if (wrapperDescriptor) {
          resilienceManager.registerHookInstall(hook.target, obj, propertyName, wrapperDescriptor);
        }

        return hookMetadata;
      } catch (error) {
        logError(`[Hooks MAIN] Failed to install ${hook.target}:`, error);
        resilienceManager.registerHookFailure(hook.target, error.message);
        return false;
      }
    }

    // Track installation success/failure
    let successCount = 0;
    let failCount = 0;
    const failed = [];
    const expectedFailed = [];
    const installed = new Map();
    const failureReasons = {};

    for (const detector of hookDefinitions) {
      for (const hook of detector.hooks) {
        try {
          const installResult = installHook(detector.id, detector.name, detector.category, hook);

          if (installResult !== false) {
            const alreadyInstalled = installed.has(hook.target);
            if (!alreadyInstalled) {
              successCount++;
            }

            const entry = installed.get(hook.target) || { detectors: new Set() };
            entry.detectors.add(detector.name);
            installed.set(hook.target, entry);
          } else {
            failCount++;
            // Detectors flag hooks on APIs that legitimately may not exist (e.g. WebUSB)
            const isExpectedFailure = hook.optional === true;

            if (isExpectedFailure) {
              expectedFailed.push(hook.target);
            } else {
              failed.push(hook.target);
              logWarn(`Hook not installed: ${hook.target} (${detector.name})`);
            }

          }
        } catch (e) {
          failCount++;
          failed.push(hook.target);
          failureReasons[hook.target] = (failureReasons[hook.target] || []).concat(e.message);
          logError(`Hook install threw: ${hook.target} (${detector.name}): ${e.message}`);
        }
      }
    }

    // CRITICAL TIMING: Record when hook installation completes
    // Avoid performance.now(): Performance.prototype.now is a JS_HOOKS target.
    const hooksInstalledTime = Date.now();

    logDebug(`Hooks installed: ${installed.size} targets (${successCount} ok, ${expectedFailed.length} optional APIs missing${failed.length ? `, ${failed.length} failed` : ''})${hasHooksConfig ? `; watching up to ${activeHooksConfig.MAX_DETECTION_MS}ms, idle ${activeHooksConfig.ACTIVITY_TIMEOUT_MS}ms, min ${minMonitorMs}ms` : ''}`);
    if (failed.length > 0) {
      logWarn(`Hooks failed (${failed.length}): ${failed.join(', ')}`, failureReasons);
    }

    // Calls the page made before this event, now reported through the real hooks
    for (const hookTarget of earlyCalled) {
      activeHookReporter(hookTarget);
    }
    if (earlyCalled.length > 0) {
      logDebug(`Early calls before install: ${earlyCalled.join(', ')}`);
    }

    // Save original hooks list since they're uninstalled when they fire
    const originallyInstalledHooks = Array.from(installedHooks.keys());
    const originalHooksCount = originallyInstalledHooks.length;

    const startHookMonitoring = () => {
      // Maximum timeout for guaranteed completion (even if hooks keep firing)
      maxTimeoutId = setTimeout(() => {
        completeDetection(HOOKS_REASONS.MAX_TIMEOUT);
      }, activeHooksConfig.MAX_DETECTION_MS);

      // Activity timeout (2s of inactivity)
      scheduleCompletion();
    };

    if (!hasHooksConfig) {
      // Nothing was installed; completion below reports no_hooks without timers
    } else if (pageReadySignalReceived || document.readyState === 'complete') {
      startHookMonitoring();
    } else {
      pageReadyCallbacks.push(startHookMonitoring);
    }

    // Send completion if no hooks installed
    if (hookDefinitions.length === 0 || hookDefinitions.every(d => d.hooks.length === 0)) {
      completeDetection(HOOKS_REASONS.NO_HOOKS);
    }
  };

  // Runs once, from the first bootstrap event (still before any page script)
  function startBridge() {
    installErrorFilters();
    // Cache hit confirmed async by ISOLATED world/background via bridge message
    window[GLOBALS.CACHE_HIT_EARLY_EXIT] = false;
    window.addEventListener(EVENTS.ISOLATED_TO_MAIN, onIsolatedMessage, true);
    window.addEventListener(EVENTS.INSTALL_HOOKS, onInstallHooks, { capture: true });
  }
})();
