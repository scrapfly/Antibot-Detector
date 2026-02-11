/**
 * Content Script - MAIN World
 * Runs in the MAIN world (page's JavaScript context) to install fingerprinting hooks
 * Receives hook definitions from content.js (ISOLATED world) via CustomEvent
 */

(function() {
  'use strict';

  let debugMode = false; // Will be set by ISOLATED world
  let logCollectorEnabled = false;

  // When the extension itself reads properties (e.g., WindowPropertyTracker),
  // those reads can traverse the same getters we hook for JS_HOOKS. That would
  // create false positives and can prematurely uninstall hooks. Use a depth
  // counter so internal reads can temporarily suppress hook reporting.
  const HOOK_SUPPRESSION_DEPTH_KEY = '__scrapflyHookSuppressionDepth';

  function isHookReportingSuppressed() {
    return (window[HOOK_SUPPRESSION_DEPTH_KEY] || 0) > 0;
  }

  function incrementSuppressionDepth() {
    window[HOOK_SUPPRESSION_DEPTH_KEY] = (window[HOOK_SUPPRESSION_DEPTH_KEY] || 0) + 1;
  }

  function decrementSuppressionDepth() {
    const current = window[HOOK_SUPPRESSION_DEPTH_KEY] || 0;
    if (current > 0) window[HOOK_SUPPRESSION_DEPTH_KEY] = current - 1;
  }

  const LOG_RATE_WINDOW_MS = 1000;
  const LOG_MAX_PER_WINDOW = 20;
  const LOG_MAX_PER_WINDOW_WITH_COLLECTOR = 5;
  const MAX_LOG_MESSAGE_LENGTH = 1000;
  let logRateWindowStart = Date.now();
  let logRateCount = 0;

  // Centralized configuration (7.7 - removes magic numbers)
  const DEFAULT_HOOKS_CONFIG = Object.freeze({
    // Completion timeouts - Multi-layer timeout system
    ACTIVITY_TIMEOUT_MS: 2000,      // Inactivity before completion (resets on activity)
    MAX_DETECTION_MS: 8000,         // Absolute maximum wait for hooks
    EMERGENCY_TIMEOUT_MS: 12000,    // Emergency fallback (should never fire)
    HEARTBEAT_TIMEOUT_MS: 25000,    // Heartbeat check (worker still alive?)

    // Window property polling (now uses WindowPropertyTracker)
    POLL_INTERVAL_MS: 100,          // Initial poll interval (EARLY phase)
    DEFAULT_MAX_WINDOW_MS: 60000,   // Extended to 60s for late-loading properties
    SETTLED_CHECKS: 50,             // Checks before "settled"

    // Memory limits
    MAX_INSTALLED_HOOKS: 500,       // Safety cap
    MAX_DETECTIONS_PER_TAB: 100     // Safety cap
  });

  // Active hooks config (merged from settings on install)
  let activeHooksConfig = { ...DEFAULT_HOOKS_CONFIG };

  // Clamp helper to keep settings within safe limits
  function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    if (min != null && num < min) return min;
    if (max != null && num > max) return max;
    return num;
  }

  function buildHooksConfig(overrides = {}) {
    const merged = { ...DEFAULT_HOOKS_CONFIG, ...(overrides || {}) };
    return {
      ACTIVITY_TIMEOUT_MS: clampNumber(merged.ACTIVITY_TIMEOUT_MS, 250, 20000, DEFAULT_HOOKS_CONFIG.ACTIVITY_TIMEOUT_MS),
      MAX_DETECTION_MS: clampNumber(merged.MAX_DETECTION_MS, 1000, 60000, DEFAULT_HOOKS_CONFIG.MAX_DETECTION_MS),
      EMERGENCY_TIMEOUT_MS: clampNumber(merged.EMERGENCY_TIMEOUT_MS, 2000, 120000, DEFAULT_HOOKS_CONFIG.EMERGENCY_TIMEOUT_MS),
      HEARTBEAT_TIMEOUT_MS: clampNumber(merged.HEARTBEAT_TIMEOUT_MS, 5000, 180000, DEFAULT_HOOKS_CONFIG.HEARTBEAT_TIMEOUT_MS),
      POLL_INTERVAL_MS: clampNumber(merged.POLL_INTERVAL_MS, 20, 2000, DEFAULT_HOOKS_CONFIG.POLL_INTERVAL_MS),
      DEFAULT_MAX_WINDOW_MS: clampNumber(merged.DEFAULT_MAX_WINDOW_MS, 5000, 120000, DEFAULT_HOOKS_CONFIG.DEFAULT_MAX_WINDOW_MS),
      SETTLED_CHECKS: clampNumber(merged.SETTLED_CHECKS, 5, 200, DEFAULT_HOOKS_CONFIG.SETTLED_CHECKS),
      MAX_INSTALLED_HOOKS: clampNumber(merged.MAX_INSTALLED_HOOKS, 50, 2000, DEFAULT_HOOKS_CONFIG.MAX_INSTALLED_HOOKS),
      MAX_DETECTIONS_PER_TAB: clampNumber(merged.MAX_DETECTIONS_PER_TAB, 20, 2000, DEFAULT_HOOKS_CONFIG.MAX_DETECTIONS_PER_TAB)
    };
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
    return getErrorMessage(err).includes('Illegal invocation');
  };

  // Global error handler: Prevent hook errors from breaking page
  window.addEventListener('error', (event) => {
    if (event.filename && event.filename.includes('content-main-world')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  // Promise rejections from hook wrappers can surface as "Uncaught (in promise) ... Illegal invocation"
  // in the page console. We only suppress ones that originate from this file.
  window.addEventListener('unhandledrejection', (event) => {
    try {
      const msg = getErrorMessage(event.reason);
      if (!msg.includes('Illegal invocation')) return;

      const stack = event.reason && typeof event.reason.stack === 'string' ? event.reason.stack : '';
      if (stack.includes('content-main-world.js')) {
        event.preventDefault();
        event.stopPropagation?.();
      }
    } catch (e) {
      // ignore
    }
  }, true);

  // Hooks monitoring state (module scope for disable monitoring)
  let installedHooks = new Map(); // Map: hook.target -> {obj, propertyName, originalDescriptor, detectors (Map), wrapper, fallbackContext}
  let completionTimeout = null;
  let pageReadySignalReceived = false;
  const pageReadyCallbacks = [];


  // Early bind shims: prevent "Illegal invocation" even if page code calls APIs unbound
  // (e.g., const f = navigator.getBattery; f()) before detector-driven hooks are installed.
  // These shims are tiny and safe; later detection wrappers will wrap these shims (and uninstall
  // back to them), so the page stays stable throughout.
  const EARLY_BIND_SHIMS = [
    {
      target: 'Navigator.prototype.getBattery',
      getProto: () => window.Navigator?.prototype,
      getInstance: () => window.navigator
    },
    {
      target: 'MediaDevices.prototype.enumerateDevices',
      getProto: () => window.MediaDevices?.prototype,
      getInstance: () => window.navigator?.mediaDevices
    }
  ];

  const createBindShim = (original, instance) => {
    const shim = function(...args) {
      const ctx = (this === undefined || this === null || this === window) ? instance : this;
      try {
        const result = Reflect.apply(original, ctx, args);
        if (instance && result && typeof result.then === 'function' && typeof result.catch === 'function') {
          return result.catch((err) => {
            if (isIllegalInvocationError(err)) {
              return Reflect.apply(original, instance, args);
            }
            throw err;
          });
        }
        return result;
      } catch (e) {
        if (instance) {
          try {
            return Reflect.apply(original, instance, args);
          } catch (e2) {
            throw e;
          }
        }
        throw e;
      }
    };

    // Mark as shimmed to prevent double-shimming
    Object.defineProperty(shim, '__scrapflyBindShim', { value: true });
    // Stealth: make toString look native
    Object.defineProperty(shim, 'toString', {
      value: function toString() {
        return Function.prototype.toString.call(original);
      },
      writable: true,
      configurable: true
    });

    return shim;
  };

  const installEarlyBindShims = () => {
    for (const spec of EARLY_BIND_SHIMS) {
      try {
        const proto = spec.getProto();
        const instance = spec.getInstance();
        const propertyName = spec.target.split('.').pop();

        // Prefer prototype patch (affects all instances)
        if (proto) {
          const desc = Object.getOwnPropertyDescriptor(proto, propertyName);
          if (desc && typeof desc.value === 'function' && !desc.value.__scrapflyBindShim) {
            const shim = createBindShim(desc.value, instance);
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
        if (instance && typeof instance[propertyName] === 'function' && !instance[propertyName].__scrapflyBindShim) {
          const shim = createBindShim(instance[propertyName], instance);
          try {
            // Prefer direct assignment (works for many DOM instances)
            instance[propertyName] = shim;
          } catch (e) {
            try {
              Object.defineProperty(instance, propertyName, { value: shim, writable: true, configurable: true });
            } catch (e2) {
              // ignore
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }
  };

  installEarlyBindShims();

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
    return window.__scrapflyCacheHitEarlyExit === true;
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

    // Clear window property path cache
    if (windowPropertyPathCache) {
      windowPropertyPathCache.clear();
    }
  }

  // Helper to send logs to service worker (only when debug enabled)
  // Logs are only sent to background/service-worker, not to page console
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
        const keys = Object.keys(arg).slice(0, 6);
        return `{${keys.join(', ')}}`;
      } catch (e) {
        return '[Object]';
      }
    }
    return String(arg);
  };

  const sendLog = function(level, ...args) {
    // Early return for zero overhead when debug disabled
    if (!debugMode) return;

    // When log collector is enabled, avoid chatty logs
    if (logCollectorEnabled && level === 'log') {
      return;
    }

    const now = Date.now();
    if (now - logRateWindowStart >= LOG_RATE_WINDOW_MS) {
      logRateWindowStart = now;
      logRateCount = 0;
    }
    logRateCount += 1;
    const maxPerWindow = logCollectorEnabled ? LOG_MAX_PER_WINDOW_WITH_COLLECTOR : LOG_MAX_PER_WINDOW;
    if (logRateCount > maxPerWindow) {
      return;
    }

    try {
      const prefix = '[MAIN_WORLD] [Hooks]';
      let message = [prefix, ...args].map(formatLogArg).join(' ');
      if (message.length > MAX_LOG_MESSAGE_LENGTH) {
        message = `${message.slice(0, MAX_LOG_MESSAGE_LENGTH)}...`;
      }

      window.postMessage({
        type: 'SCRAPFLY_DEBUG_LOG',
        level: level,
        message: message,
        source: 'content-main-world',
        timestamp: Date.now()
      }, '*');
    } catch (e) {
      // Silently fail
    }
  };

  // Shared, safe condition language (no eval). Provided by modules/detection/hooks/window-condition-language.js.
  const getConditionLanguage = () => {
    const lang = globalThis.ScrapflyWindowConditionLanguage;
    if (lang && typeof lang.compile === 'function' && typeof lang.describe === 'function') {
      return lang;
    }
    return null;
  };

  // Module-level cache persists across calls
  let windowPropertyPathCache = null;

  /**
   * Check window properties for detection
   * This is the FASTEST detection method - runs in microseconds
   * @param {Array} propertyDefinitions - Array of property definitions from detectors
   * @param {Function} onDetection - Optional callback for each detection batch
   * @returns {Array} detections - Array of detection objects
   */
  function checkWindowPropertiesCore(propertyDefinitions, onDetection) {
    if (!propertyDefinitions || propertyDefinitions.length === 0) return [];

    // Early exit on cache hit - skip all window property checks
    if (shouldSkipDueToCacheHit()) {
      sendLog('log', '[Window Props] Cache hit detected - skipping property checks');
      return [];
    }

    const detections = [];
    // Avoid performance.now(): Performance.prototype.now is a JS_HOOKS target.
    const startTime = Date.now();

    if (!windowPropertyPathCache) {
      windowPropertyPathCache = new Map();
    }

    for (const propDef of propertyDefinitions) {
      try {
        // Safely access nested properties (e.g., "navigator.brave" -> window.navigator.brave)
        let pathParts = windowPropertyPathCache.get(propDef.path);
        if (!pathParts) {
          pathParts = propDef.path.split('.');
          windowPropertyPathCache.set(propDef.path, pathParts);
        }
        let value = window;

        sendLog('log', `[Window Props] Checking: window.${propDef.path}`);

        // Suppress hook reporting for extension-driven property reads to avoid false positives.
        incrementSuppressionDepth();
        try {
          for (const part of pathParts) {
            if (value == null) break; // null or undefined
            value = value[part];
          }
        } finally {
          decrementSuppressionDepth();
        }

        // DEBUG: Log the actual value found
        const valueType = value === null ? 'null' : typeof value;
        const valuePreview = value === null ? 'null' :
                            value === undefined ? 'undefined' :
                            typeof value === 'object' ? '[object]' :
                            typeof value === 'function' ? '[function]' :
                            String(value).substring(0, 50);
        sendLog('log', `[Window Props] window.${propDef.path} = ${valuePreview} (type: ${valueType})`);

        // Evaluate the condition
        let conditionMet = false;
        const condition = propDef.condition || 'truthy';
        sendLog('log', `[Window Props] Testing condition: "${condition}"`);

        // SECURITY: No eval(). Conditions are compiled via the shared language module.
        const lang = getConditionLanguage();
        if (lang) {
          const compiled = lang.compile(condition);
          if (compiled.ok && typeof compiled.fn === 'function') {
            try {
              conditionMet = !!compiled.fn(value);
            } catch (e) {
              conditionMet = false;
            }
          } else {
            sendLog('error', `[Window Props] Unsupported condition: "${condition}" (${compiled.reason || 'UNSUPPORTED'}). ${lang.describe()}`);
            conditionMet = false;
          }
        } else {
          // Fallback: if the shared module didn't load, default to truthy.
          conditionMet = !!value;
        }


        if (conditionMet) {
          sendLog('log', `[Window Props] MATCH! Condition "${condition}" passed for window.${propDef.path}`);

          const confidence = propDef.confidence || 80;
          const detection = {
            detectorId: propDef.detectorId,
            detectorName: propDef.detectorName,
            category: propDef.category,
            property: {
              path: propDef.path,
              actualType: value === null ? 'null' : typeof value,
              actualValue: typeof value === 'object' ? '[object]' : String(value).substring(0, 100),
              condition: condition,
              confidence: confidence,
              description: propDef.description || `Window property ${propDef.path} detected`
            }
          };
          detections.push(detection);

          sendLog('log', `[Window Props] Detected: window.${propDef.path} (${propDef.detectorName})`);
        } else {
          sendLog('log', `[Window Props] NO MATCH: Condition "${condition}" failed for window.${propDef.path} (value: ${valuePreview}, type: ${valueType})`);
        }
      } catch (e) {
        // Property access might throw (e.g., cross-origin restrictions)
        sendLog('warn', `[Window Props] Error checking ${propDef.path}:`, e.message);
      }
    }

    const elapsed = Date.now() - startTime;
    sendLog('log', `[Window Props] Checked ${propertyDefinitions.length} properties in ${elapsed.toFixed(2)}ms - found ${detections.length} detections`);

    // Send detections to content script if any found
    if (detections.length > 0) {
      window.postMessage({
        type: 'WINDOW_DETECTIONS',
        detections: detections,
        timestamp: Date.now(),
        elapsedMs: elapsed
      }, '*');
    }

    // Call detection handler if provided (for retry mechanism tracking)
    if (onDetection && typeof onDetection === 'function') {
      onDetection(detections);
    }

    return detections;
  }

  /**
   * Uninstall all remaining hooks (called on disable or completion)
   * @returns {Object} - Statistics about uninstall results
   */
  function uninstallAllRemainingHooks() {
    if (installedHooks.size === 0) {
      sendLog('log', `[Hooks MAIN] All hooks already uninstalled`);
      return { total: 0, successes: 0, failures: 0, failedTargets: [] };
    }

    const targetsToUninstall = Array.from(installedHooks.keys());

    sendLog('log', `[Hooks MAIN] Uninstalling ${targetsToUninstall.length} remaining hooks...`);

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

      const { obj, propertyName, originalDescriptor } = hookData;
      try {
        Object.defineProperty(obj, propertyName, originalDescriptor);
        installedHooks.delete(hookTarget);
        stats.successes++;
        sendLog('log', `[Hooks MAIN] Uninstalled: ${hookTarget}`);
      } catch (e) {
        // Property might not be configurable
        stats.failures++;
        stats.failedTargets.push(hookTarget);
        sendLog('error', `[Hooks MAIN] Failed to uninstall ${hookTarget}: ${e.message}`);
      }
    }

    sendLog('log', `[Hooks MAIN] Uninstall complete: ${stats.successes} succeeded, ${stats.failures} failed`);
    if (stats.failures > 0) {
      sendLog('warn', `[Hooks MAIN] Failed hooks remain active: ${stats.failedTargets.join(', ')}`);
    }

    return stats;
  }

  // Cache hit flag - set by ISOLATED world when cache hit detected
  // IMPORTANT: Don't rely on sessionStorage for cache-hit decisions.
  // Cache hits are confirmed asynchronously by the ISOLATED world/background and signaled via postMessage.
  // This avoids stale cache-hit flags after manual cache clears or settings changes.
  window.__scrapflyCacheHitEarlyExit = false;

  // Listen for disable monitoring message from ISOLATED world (cache hit)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;

    if (data && data.type === 'SCRAPFLY_PAGE_READY') {
      if (!pageReadySignalReceived) {
        pageReadySignalReceived = true;
        sendLog('log', '[MAIN WORLD] Page ready message received');
        while (pageReadyCallbacks.length > 0) {
          const callback = pageReadyCallbacks.shift();
          try {
            callback();
          } catch (e) {
            sendLog('error', '[MAIN WORLD] Error executing page ready callback:', e);
          }
        }
      }
      return;
    }

    // Handle cache hit notification from ISOLATED world
    if (data && data.type === 'SCRAPFLY_CACHE_HIT') {
      sendLog('log', '[MAIN WORLD] Cache hit notification received - setting flag to stop hook reporting');
      window.__scrapflyCacheHitEarlyExit = true;
      return;
    }

    // Handle disable monitoring command (cache hit)
    if (data && data.type === 'DISABLE_MONITORING') {
      sendLog('log', '[MAIN WORLD] DISABLE_MONITORING received - cache hit, stopping all monitoring');
      sendLog('log', '[MAIN WORLD]   Reason:', data.reason);
      sendLog('log', '[MAIN WORLD]   URL:', data.url);

      // Disable hooks monitoring - clear timeout
      if (completionTimeout) {
        clearTimeout(completionTimeout);
        completionTimeout = null;
      }
      sendLog('log', '[Hooks MAIN] Hooks monitoring disabled due to cache hit');

      // Uninstall any installed hooks to reduce overhead
      const cacheHitUninstallStats = uninstallAllRemainingHooks();
      if (cacheHitUninstallStats.failures > 0) {
        sendLog('warn', `[MAIN WORLD] Cache hit cleanup: ${cacheHitUninstallStats.failures} hooks failed to uninstall`);
      }

      sendLog('log', '[MAIN WORLD] All monitoring disabled successfully (cache hit)');
    }

    // Stop window property polling after detection completes (late results won't update anything)
    if (data && data.type === 'STOP_WINDOW_POLLING') {
      const tracker = window.__WindowPropertyTracker;
      if (tracker && tracker.isPolling) {
        tracker.stop();
        sendLog('log', '[MAIN WORLD] Window property polling stopped (detection finalized)');
      }
    }

    // Handle JS API events from ISOLATED world - dispatch CustomEvent to page
    // This bridges the ISOLATED/MAIN world gap so page scripts can receive events
    if (data && data.type === 'SCRAPFLY_JS_API_EVENT') {
      try {
        const eventName = data.eventName;
        const eventDetail = data.detail;
        const fullEventName = `scrapfly:${eventName}`;

        // Log to PAGE DevTools console (MAIN world) so users can see events when JS API is enabled.
        // This handler only fires when JS API is enabled (checked in settings-runtime.js).
        try {
          if (typeof console !== 'undefined' && console) {
            const label = `[Scrapfly JS API] ${fullEventName}`;
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
        window.__scrapflyLastDetection = eventDetail;

        // Method 1: Dispatch CustomEvent to page window (MAIN world)
        const event = new CustomEvent(fullEventName, {
          detail: eventDetail,
          bubbles: true,
          cancelable: false
        });
        window.dispatchEvent(event);
        sendLog('log', `[MAIN WORLD] Dispatched JS API event: ${fullEventName}`);

        // Method 2: Call callback function if defined (for early setup)
        // Page can do: window.onDetection = (data) => console.log(data);
        // eventName is already like 'onDetection', so use it directly
        if (typeof window[eventName] === 'function') {
          try {
            window[eventName](eventDetail);
            sendLog('log', `[MAIN WORLD] Called callback: window.${eventName}()`);
          } catch (callbackError) {
            sendLog('error', `[MAIN WORLD] Callback error: ${callbackError.message}`);
          }
        }
      } catch (e) {
        sendLog('error', '[MAIN WORLD] Failed to dispatch JS API event:', e.message);
      }
      return;
    }
  });

  // Wait for hook configuration from ISOLATED world
  window.addEventListener('scrapfly-install-hooks', (event) => {
    // Check if cache hit - skip hook installation entirely
    if (shouldSkipDueToCacheHit()) {
      return;
    }

    // CRITICAL TIMING: Record when event is received
    // Avoid performance.now(): Performance.prototype.now is a JS_HOOKS target.
    const eventReceivedTime = Date.now();

    // Reset module state for SPA navigation (prevents memory leaks)
    resetModuleState();

    // Set debugMode first, before any logging
    debugMode = event.detail?.debugMode || false; // Receive debug mode from ISOLATED world
    logCollectorEnabled = event.detail?.logCollectorEnabled || false;

    // Use in-code hooks config (settings UI removed)
    activeHooksConfig = buildHooksConfig({});

    // Handle fingerprintEnabled flag from event
    // This is the authoritative value from ISOLATED world (updated from storage)
    const fingerprintEnabled = event.detail?.fingerprintEnabled !== false;

    sendLog('log', '[MAIN WORLD] scrapfly-install-hooks event received!', {
      hasDetail: !!event.detail,
      hookDefinitionsCount: event.detail?.hookDefinitions?.length,
      windowPropertiesCount: event.detail?.windowProperties?.length,
      debugMode: debugMode,
      fingerprintEnabled: fingerprintEnabled,
      hooksConfig: activeHooksConfig
    });

    const hookDefinitions = event.detail?.hookDefinitions || [];
    const windowProperties = event.detail?.windowProperties || [];

    sendLog('log', `[Hooks MAIN] Received ${hookDefinitions.length} detectors and ${windowProperties.length} window property checks`);

    const resilienceManager = window.__HookResilienceManager;
    if (resilienceManager) {
      resilienceManager.setExpectedTargets(hookDefinitions);
      sendLog('log', `[HookResilienceManager] Set ${resilienceManager.expectedTargets.size} expected targets from detector definitions`);
    }
    sendLog('log', '[MAIN WORLD] Window properties to check:', windowProperties.map(p => p.path));

    // Check window properties with WindowPropertyTracker
    if (windowProperties.length > 0) {
      sendLog('log', `[Window Props] Starting WindowPropertyTracker for ${windowProperties.length} properties...`);

      const startWindowChecksWithTracker = () => {
        // Check cache flag before starting
        if (shouldSkipDueToCacheHit()) {
          sendLog('log', '[Window Props] Cache hit - skipping window property checks');
          window.postMessage({
            type: 'WINDOW_PROPS_COMPLETE',
            url: window.location.href,
            timestamp: Date.now(),
            detectedCount: 0,
            reason: 'cache_hit'
          }, '*');
          return;
        }

        // Check if WindowPropertyTracker is available
        const tracker = window.__WindowPropertyTracker;
        if (tracker) {
          // Initialize tracker with property definitions
          tracker.initialize(windowProperties, {
            debugMode: debugMode,
            onDetection: (detections) => {
              // Forward detections to content script
              window.postMessage({
                type: 'WINDOW_DETECTIONS',
                detections: detections,
                timestamp: Date.now()
              }, '*');
            },
            onComplete: (result) => {
              sendLog('log', `[Window Props] WindowPropertyTracker complete: ${result.detectedCount}/${result.totalChecked} in ${result.elapsedMs}ms (${result.reason})`);
              // WINDOW_PROPS_COMPLETE is sent by the tracker itself
            }
          });

          // Start adaptive polling (4 phases: EARLY 100ms → NORMAL 200ms → LATE 500ms → FINAL 1000ms)
          tracker.startPolling();
          sendLog('log', '[Window Props] WindowPropertyTracker started with adaptive 60s polling');
        } else {
          // Fallback to legacy polling if tracker not available
          sendLog('warn', '[Window Props] WindowPropertyTracker not available, using legacy polling');
          legacyWindowPropertyPolling(windowProperties);
        }
      };

      // Legacy polling fallback (simplified version of old code)
      const legacyWindowPropertyPolling = (properties) => {
        let detectedCount = 0;
        const detectedPaths = new Set();
        const startTime = Date.now();
        const MAX_WINDOW_MS = activeHooksConfig.DEFAULT_MAX_WINDOW_MS;
        let pollCount = 0;
        let checksWithoutNew = 0;

        const poll = () => {
          pollCount++;
          const elapsed = Date.now() - startTime;

          if (elapsed >= MAX_WINDOW_MS || checksWithoutNew >= activeHooksConfig.SETTLED_CHECKS) {
            window.postMessage({
              type: 'WINDOW_PROPS_COMPLETE',
              url: window.location.href,
              timestamp: Date.now(),
              detectedCount: detectedCount,
              totalChecked: properties.length,
              elapsedMs: elapsed,
              reason: elapsed >= MAX_WINDOW_MS ? 'max_window_reached' : 'settled'
            }, '*');
            return;
          }

          let newThisPoll = 0;
          checkWindowPropertiesCore(properties, (detections) => {
            detections.forEach(d => {
              if (!detectedPaths.has(d.property?.path)) {
                detectedPaths.add(d.property?.path);
                detectedCount++;
                newThisPoll++;
              }
            });
          });

          checksWithoutNew = newThisPoll > 0 ? 0 : checksWithoutNew + 1;
          setTimeout(poll, activeHooksConfig.POLL_INTERVAL_MS);
        };

        poll();
      };

      if (document.readyState === 'complete' || pageReadySignalReceived) {
        startWindowChecksWithTracker();
      } else {
        pageReadyCallbacks.push(startWindowChecksWithTracker);
      }
    } else {
      // No window properties to check - send completion immediately
      sendLog('log', '[Window Props] No window properties to check - sending completion immediately');
      window.postMessage({
        type: 'WINDOW_PROPS_COMPLETE',
        url: window.location.href,
        timestamp: Date.now(),
        detectedCount: 0
      }, '*');
    }

    // Initialize/reset hooks state for this page load
    const triggeredHooks = new Set();
    let hooksStartTime = Date.now();
    let minMonitorMs = Math.min(
      activeHooksConfig.MAX_DETECTION_MS,
      Math.max(4000, activeHooksConfig.ACTIVITY_TIMEOUT_MS * 2)
    );
    // REMOVED: bufferedDetections array - no longer needed with always-on monitoring

    // Unified completion system with single entry point
    // Prevents race conditions between activity timeout (2s) and max timeout (3s)
    let maxTimeoutId = null;
    let completionSignalSent = false;

    /**
     * Complete hook detection with cleanup
     * @param {string} reason - 'activity_timeout' | 'max_timeout' | 'no_hooks' | 'cache_hit'
     */
    const completeDetection = (reason) => {
      if (completionSignalSent) return;
      completionSignalSent = true;

      const elapsed = Date.now() - hooksStartTime;
      sendLog('log', `[Hooks MAIN] Detection complete (${reason}) - ${triggeredHooks.size} hooks in ${elapsed}ms`);

      // Cleanup: uninstall any remaining hooks (only needed for timeout completions)
      if (reason !== 'no_hooks' && reason !== 'cache_hit') {
        // Show summary
        sendLog('log', `[Hooks MAIN] DETECTION SUMMARY:`);
        sendLog('log', `[Hooks MAIN]    Hooks that FIRED: ${triggeredHooks.size}/${originalHooksCount || 0}`);

        if (triggeredHooks.size > 0) {
          const firedHooksList = Array.from(triggeredHooks).map(key => key.split(':')[1]).sort();
          sendLog('log', `[Hooks MAIN]    Fired hooks:`, firedHooksList);
        }

        // Uninstall remaining unfired hooks
        if (installedHooks.size > 0) {
          // Log unfired hooks BEFORE uninstalling (for debugging)
          const unfiredHooks = Array.from(installedHooks.keys()).sort();
          sendLog('log', `[Hooks MAIN]    Hooks that NEVER FIRED: ${installedHooks.size}`);
          sendLog('log', `[Hooks MAIN]    Unfired hooks:`, unfiredHooks);
          sendLog('log', `[Hooks MAIN] Uninstalling ${installedHooks.size} remaining unfired hooks...`);
          const bulkUninstallStats = uninstallAllRemainingHooks();
          uninstallStats.attempts += bulkUninstallStats.total;
          uninstallStats.successes += bulkUninstallStats.successes;
          uninstallStats.failures += bulkUninstallStats.failures;
          uninstallStats.failedTargets.push(...bulkUninstallStats.failedTargets);
        }

        // Log final stats
        if (uninstallStats.attempts > 0) {
          sendLog('log', `[Hooks MAIN] Final: ${uninstallStats.successes}/${uninstallStats.attempts} uninstalled (${uninstallStats.failures} failed)`);
        }
      }

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
      window.postMessage({
        type: 'JS_HOOKS_COMPLETE',
        url: window.location.href,
        timestamp: Date.now(),
        totalDetections: triggeredHooks.size,
        uniqueHooks: triggeredHooks.size,
        completionReason: reason,
        completionTime: elapsed,
        uninstallStats: {
          attempts: uninstallStats.attempts,
          successes: uninstallStats.successes,
          failures: uninstallStats.failures,
          failedTargets: uninstallStats.failedTargets.slice()
        }
      }, '*');
    };

    // Reset uninstall failure tracking for this page load
    uninstallStats.attempts = 0;
    uninstallStats.successes = 0;
    uninstallStats.failures = 0;
    uninstallStats.failedTargets.length = 0;

    let totalHooksCount = 0;
    for (const detector of hookDefinitions) {
      totalHooksCount += detector.hooks.length;
    }
    sendLog('log', `[Hooks MAIN] Total hooks to install: ${totalHooksCount}`);

    /**
     * Uninstall a hook by restoring its original property descriptor
     * @param {string} hookTarget - Hook target (e.g., "Performance.prototype.now")
     * @returns {boolean} - True if uninstalled successfully, false if failed
     */
    function uninstallHook(hookTarget) {
      const hookData = installedHooks.get(hookTarget);
      if (!hookData) {
        sendLog('warn', `[Hooks MAIN] Cannot uninstall ${hookTarget} - not found in installedHooks`);
        return false; // Already uninstalled or never installed
      }

      const { obj, propertyName, originalDescriptor } = hookData;
      try {
        Object.defineProperty(obj, propertyName, originalDescriptor);
        installedHooks.delete(hookTarget);
        sendLog('log', `[Hooks MAIN] Uninstalled: ${hookTarget}`);
        return true;
      } catch (e) {
        // Uninstall failed - likely property is non-configurable
        sendLog('error', `[Hooks MAIN] Failed to uninstall ${hookTarget}: ${e.message}`);
        sendLog('error', `[Hooks MAIN]    Reason: Property "${propertyName}" is likely non-configurable`);
        sendLog('error', `[Hooks MAIN]    Hook will remain active until page unload`);
        // Don't delete from installedHooks - keeps metadata for debugging
        return false;
      }
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
          sendLog('log', `[Hooks MAIN] Minimum monitor window not reached (${elapsed}ms/${minMonitorMs}ms) - extending by ${remaining}ms`);
          completionTimeout = setTimeout(() => {
            completeDetection('activity_timeout');
          }, remaining);
          return;
        }

        completeDetection('activity_timeout');
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
        const detectionKey = `${detectorId}:${hookTarget}`;
        if (triggeredHooks.has(detectionKey)) continue;

        triggeredHooks.add(detectionKey);
        newDetections++;

        const detectorName = info?.detectorName || detectorId;
        const category = info?.category;
        const hook = info?.hook || { target: hookTarget };

        sendLog('log', `[Hooks MAIN] Hook detected: ${hookTarget} (${detectorName})`);

        window.postMessage({
          type: 'JS_HOOK_DETECTION',
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
        }, '*');
      }

      if (newDetections > 0) {
        // DEBUG: log once per target fire (prevents log spam when multiple detectors share a hook target)
        sendLog('log', `[Hooks DEBUG] HOOK FIRED +${newDetections}: ${hookTarget} (${detectorCount} detector(s)) - at ${timeElapsed}ms`);
      } else {
        // DUPLICATE detection - log but still reset timer
        sendLog('log', `[Hooks MAIN] Duplicate hook detected: ${hookTarget} (resetting completion timer)`);
      }

      // CRITICAL: Always reset completion timer - OLD SYSTEM behavior
      // Even if this is a duplicate detection, reset the timer
      // This ensures: "No activity for 2 seconds = detection complete"
      scheduleCompletion();

      // IMMEDIATE UNINSTALL: Uninstall hook as soon as it fires (reduces overhead)
      // Each hook target only needs to fire once to be detected for all associated detectors
      if (newDetections > 0) {
        const uninstalled = uninstallHook(hookTarget);
        if (uninstalled) {
          uninstallStats.successes++;
          sendLog('log', `[Hooks MAIN] Immediately uninstalled: ${hookTarget} (${installedHooks.size} remaining)`);
        } else {
          uninstallStats.failures++;
          uninstallStats.failedTargets.push(hookTarget);
          sendLog('warn', `[Hooks MAIN] Failed to uninstall: ${hookTarget}`);
        }
      }
    }

    const stealthDescriptors = {
      name: { writable: false, enumerable: false, configurable: true },
      length: { writable: false, enumerable: false, configurable: true },
      toString: { writable: true, enumerable: false, configurable: true }
    };

    // Wrapper factory for faster hook creation
    // Creates lightweight wrappers without repeated property definitions
    // FIXED: Preserves proper 'this' context to avoid "Illegal invocation" errors
    function resolveContextFromTarget(target) {
      if (!target || typeof target !== 'string') return null;
      if (target.startsWith('Navigator.prototype.')) return window.navigator || null;
      if (target.startsWith('NavigatorUAData.prototype.')) return window.navigator?.userAgentData || null;
      if (target.startsWith('MediaDevices.prototype.')) return window.navigator?.mediaDevices || null;
      if (target.startsWith('Performance.prototype.')) return window.performance || null;
      if (target.startsWith('Screen.prototype.')) return window.screen || null;
      if (target.startsWith('History.prototype.')) return window.history || null;
      if (target.startsWith('Location.prototype.')) return window.location || null;
      if (target.startsWith('Document.prototype.') || target.startsWith('HTMLDocument.prototype.')) return window.document || null;
      if (target.startsWith('Storage.prototype.')) return window.localStorage || window.sessionStorage || null;
      return null;
    }

    function createStealthWrapper(original, callback, explicitContext, target, isGetter = false) {
      const wrapper = function(...args) {
        // Don't report detections for extension-driven internal reads.
        if (!isHookReportingSuppressed()) {
          try {
            callback();
          } catch (e) {
            // Silently fail - detection error shouldn't break page API
          }
        }
        // FIX: Use natural 'this' binding for prototype methods
        // For methods like getBattery(), enumerateDevices(), etc., 'this' must be the actual instance
        // explicitContext (object instance) is used as a fallback when 'this' is missing
        // (e.g., destructured calls: const { getBattery } = navigator; getBattery())
        const dynamicContext = (explicitContext && typeof explicitContext !== 'function')
          ? explicitContext
          : resolveContextFromTarget(target);

        try {
          const context = (this === undefined || this === null || (this === window && dynamicContext))
            ? (dynamicContext || this)
            : this;
          const result = Reflect.apply(original, context, args);
          if (dynamicContext && result && typeof result.then === 'function' && typeof result.catch === 'function') {
            return result.catch((err) => {
              if (isIllegalInvocationError(err)) {
                return Reflect.apply(original, dynamicContext, args);
              }
              throw err;
            });
          }
          return result;
        } catch (e) {
          // Retry with explicit/dynamic context when available (prevents "Illegal invocation")
          if (dynamicContext) {
            try {
              return Reflect.apply(original, dynamicContext, args);
            } catch (fallbackError) {
              // Re-throw original error if fallback also fails
              throw e;
            }
          }
          throw e;
        }
      };

      // Apply stealth properties in one batch
      try {
        Object.defineProperties(wrapper, {
          'name': { ...stealthDescriptors.name, value: original.name },
          'length': { ...stealthDescriptors.length, value: original.length },
          'toString': {
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
      // Enhanced with HookResilienceManager integration
      try {
        // Step 1: Verify hook target is valid using HookResilienceManager
        const resilienceManager = window.__HookResilienceManager;
        if (resilienceManager) {
          const verification = resilienceManager.verifyHookTarget(hook.target);
          if (!verification.canInstall) {
            // Report verification failure
            resilienceManager.registerHookFailure(hook.target, verification.reason);
            sendLog('warn', `[Hooks MAIN] Verification failed for ${hook.target}: ${verification.reason}`);
            return false;
          }
        }

        const parts = hook.target.split('.');
        if (parts.length < 2) {
          if (resilienceManager) {
            resilienceManager.registerHookFailure(hook.target, 'INVALID_PATH');
          }
          return false;
        }

        let obj = window;
        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]];
          if (!obj) {
            if (resilienceManager) {
              resilienceManager.registerHookFailure(hook.target, 'PATH_NOT_FOUND');
            }
            return false;
          }
        }

        const propertyName = parts[parts.length - 1];
        const originalDescriptor = Reflect.getOwnPropertyDescriptor(obj, propertyName);
        if (!originalDescriptor) {
          if (resilienceManager) {
            resilienceManager.registerHookFailure(hook.target, 'PROPERTY_NOT_FOUND');
          }
          return false;
        }

        const existingHook = installedHooks.get(hook.target);
        if (existingHook) {
          // Hook already installed - just add this detector to its list
          existingHook.detectors.set(detectorId, { detectorName, category, hook });
          return existingHook;
        }

        // Resolve windowPath if provided in JSON (e.g., "navigator" for Navigator.prototype.getBattery)
        let explicitContext = null;
        if (hook.windowPath) {
          const pathParts = hook.windowPath.split('.');
          explicitContext = pathParts.reduce((parent, part) => parent?.[part], window);
          if (!explicitContext) {
            sendLog('warn', `[Hooks] Failed to resolve windowPath "${hook.windowPath}" for ${hook.target}`);
            explicitContext = null;
          } else if (typeof explicitContext === 'function') {
            // windowPath points to a constructor (e.g., BatteryManager); not a usable instance
            explicitContext = null;
          }
        }
        if (!explicitContext) {
          explicitContext = resolveContextFromTarget(hook.target);
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
          const stealthGetter = createStealthWrapper(originalDescriptor.get, reportCallback, explicitContext, hook.target, true);

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
          const wrapper = createStealthWrapper(originalDescriptor.value, reportCallback, explicitContext, hook.target, false);

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
        if (resilienceManager && wrapperDescriptor) {
          resilienceManager.registerHookInstall(hook.target, originalDescriptor, wrapperDescriptor);
        }

        return hookMetadata;
      } catch (error) {
        sendLog('error', `[Hooks MAIN] Failed to install ${hook.target}:`, error);
        // Report failure to HookResilienceManager
        const resilienceManager = window.__HookResilienceManager;
        if (resilienceManager) {
          resilienceManager.registerHookFailure(hook.target, error.message);
        }
        return false;
      }
    }

    // DEBUG #1: Track installation success/failure with DETAILED logging
    let successCount = 0;
    let failCount = 0;
    const failed = [];
    const expectedFailed = []; // Expected failures (APIs not available in all contexts)
    const installed = new Map(); // target -> { detectors: Set, fallbackContext }
    const failureReasons = {}; // target -> reason array

    // APIs that are not always available (browser-specific, requires HTTPS, needs permissions, etc.)
    const EXPECTED_UNAVAILABLE = ['USB.getDevices', 'USB.requestDevice', 'DeviceOrientationEvent', 'DeviceMotionEvent', 'BatteryManager'];

    for (const detector of hookDefinitions) {
      for (const hook of detector.hooks) {
        try {
          const installResult = installHook(detector.id, detector.name, detector.category, hook);

          if (installResult !== false) {
            const alreadyInstalled = installed.has(hook.target);
            if (!alreadyInstalled) {
              successCount++;
              sendLog('log', `[Hooks DEBUG] INSTALLED: ${hook.target} (${detector.name})`);
            } else {
              sendLog('log', `[Hooks DEBUG] Reused existing hook for ${hook.target} (already installed)`);
            }

            const entry = installed.get(hook.target) || { detectors: new Set() };
            entry.detectors.add(detector.name);
            installed.set(hook.target, entry);
          } else {
            failCount++;
            const isExpectedFailure = EXPECTED_UNAVAILABLE.some(ef => hook.target.includes(ef));

            if (isExpectedFailure) {
              expectedFailed.push(hook.target);
              sendLog('log', `[Hooks DEBUG] EXPECTED: ${hook.target} not available (${detector.name}) - API not present in this context`);
            } else {
              failed.push(hook.target);
              sendLog('warn', `[Hooks DEBUG] FAILED: ${hook.target} (${detector.name}) - returned false`);
            }

            failureReasons[hook.target] = (failureReasons[hook.target] || []).concat('installHook returned false');
          }
        } catch (e) {
          failCount++;
          failed.push(hook.target);
          failureReasons[hook.target] = (failureReasons[hook.target] || []).concat(e.message);
          sendLog('error', `[Hooks DEBUG] EXCEPTION: ${hook.target} (${detector.name}) - ${e.message}`);
        }
      }
    }

    // CRITICAL TIMING: Record when hook installation completes
    // Avoid performance.now(): Performance.prototype.now is a JS_HOOKS target.
    const hooksInstalledTime = Date.now();

    sendLog('log', `[Hooks MAIN] Installation complete: ${successCount} hooks installed, ${failCount} failures (${expectedFailed.length} expected), ${installed.size} total hook targets`);
    if (installed.size) {
      sendLog('log', `[Hooks DEBUG] Active hooks: ${Array.from(installed.entries()).map(([target, meta]) => `${target} (detectors: ${Array.from(meta.detectors).join(', ')})`).join('; ')}`);
    }

    // Report unexpected failures as warnings, expected failures as info
    if (failed.length > 0) {
      sendLog('warn', `[Hooks MAIN] Unexpected failures (${failed.length}): ${failed.join(', ')}`);
      sendLog('warn', `[Hooks DEBUG] Failure details:`, failureReasons);
    }

    if (expectedFailed.length > 0) {
      sendLog('log', `[Hooks MAIN] Expected unavailable APIs (${expectedFailed.length}): ${expectedFailed.join(', ')}`);
      sendLog('log', `[Hooks MAIN] These APIs are browser/context-specific (WebUSB requires HTTPS + Chrome, Battery API deprecated, sensors require permission)`);
    }

    if (failCount === 0) {
      sendLog('log', `[Hooks MAIN] All hooks installed successfully!`);
    }
    const plannedMinMonitorMs = Math.min(
      activeHooksConfig.MAX_DETECTION_MS,
      Math.max(4000, activeHooksConfig.ACTIVITY_TIMEOUT_MS * 2)
    );
    sendLog('log', `[Hooks MAIN] Waiting for page to trigger fingerprinting APIs (max ${activeHooksConfig.MAX_DETECTION_MS}ms, activity ${activeHooksConfig.ACTIVITY_TIMEOUT_MS}ms, min ${plannedMinMonitorMs}ms)...`);

    // IMMEDIATE UNINSTALL FIX: Save original hooks list for accurate completion statistics
    // Since hooks are uninstalled immediately when they fire, installedHooks.size decreases over time
    // We need the original list to calculate which hooks never fired
    const originallyInstalledHooks = Array.from(installedHooks.keys());
    const originalHooksCount = originallyInstalledHooks.length;

    const startHookMonitoring = () => {
      sendLog('log', '[Hooks MAIN] Hook monitoring active - scheduling completion');

      sendLog('log', `[Hooks MAIN] Config: activity=${activeHooksConfig.ACTIVITY_TIMEOUT_MS}ms, minMonitor=${minMonitorMs}ms, max=${activeHooksConfig.MAX_DETECTION_MS}ms`);

      // Maximum timeout for guaranteed completion (even if hooks keep firing)
      maxTimeoutId = setTimeout(() => {
        completeDetection('max_timeout');
      }, activeHooksConfig.MAX_DETECTION_MS);

      // Activity timeout (2s of inactivity)
      scheduleCompletion();
    };

    if (pageReadySignalReceived || document.readyState === 'complete') {
      startHookMonitoring();
    } else {
      pageReadyCallbacks.push(startHookMonitoring);
    }

    // Send completion if no hooks installed
    if (hookDefinitions.length === 0 || hookDefinitions.every(d => d.hooks.length === 0)) {
      completeDetection('no_hooks');
    }
  }, { once: true });
})();
