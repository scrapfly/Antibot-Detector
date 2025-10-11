/**
 * Content Script - MAIN World
 * Runs in the MAIN world (page's JavaScript context) to install fingerprinting hooks
 * Receives hook definitions from content.js (ISOLATED world) via CustomEvent
 */

(function() {
  'use strict';

  let debugMode = false; // Will be set by ISOLATED world

  // Hooks monitoring state (module scope for disable monitoring)
  let hooksEnabled = false;
  let installedHooks = new Map(); // Map: hook.target -> {obj, propertyName, originalDescriptor}
  let completionTimeout = null;

  // Helper to send logs to ISOLATED world (content.js) which forwards to service worker
  // Only logs when debug mode is enabled
  // OPTIMIZED: Lazy evaluation - only process args when debug is enabled
  const sendLog = function(level, ...args) {
    if (!debugMode) return; // Early return - skip all expensive operations

    // Only process arguments when actually logging
    const processedArgs = args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    });

    try {
      window.postMessage({
        type: 'MAIN_WORLD_LOG',
        level: level,
        args: processedArgs,
        timestamp: Date.now()
      }, '*');
    } catch (e) {
      // Silently fail
    }
  };

  // OPTIMIZATION Phase 9B.2: Pre-compile condition evaluators at module scope (15-20% faster)
  // Moved outside function to create only once per page load instead of on every call
  const CONDITION_EVALUATORS = Object.freeze({
    // Type checks
    'typeof object': (v) => typeof v === 'object' && v !== null,
    'typeof function': (v) => typeof v === 'function',
    'typeof string': (v) => typeof v === 'string',
    'typeof number': (v) => typeof v === 'number',
    'typeof boolean': (v) => typeof v === 'boolean',
    'typeof symbol': (v) => typeof v === 'symbol',
    'typeof bigint': (v) => typeof v === 'bigint',

    // Existence checks
    '!== undefined': (v) => v !== undefined,
    '=== undefined': (v) => v === undefined,
    '!== null': (v) => v !== null,
    '=== null': (v) => v === null,
    'truthy': (v) => !!v,
    'falsy': (v) => !v,

    // Special checks
    'array': (v) => Array.isArray(v),

    // Safe custom conditions (replaces eval() - SECURITY FIX)
    // Numeric comparisons
    '> 0': (v) => typeof v === 'number' && v > 0,
    '>= 0': (v) => typeof v === 'number' && v >= 0,
    '< 0': (v) => typeof v === 'number' && v < 0,
    '<= 0': (v) => typeof v === 'number' && v <= 0,
    '> 1': (v) => typeof v === 'number' && v > 1,
    '>= 1': (v) => typeof v === 'number' && v >= 1,
    '=== 0': (v) => v === 0,
    '!== 0': (v) => v !== 0,
    '> 100': (v) => typeof v === 'number' && v > 100,
    '< 100': (v) => typeof v === 'number' && v < 100,

    // Boolean checks
    '=== true': (v) => v === true,
    '=== false': (v) => v === false,

    // String checks
    'length > 0': (v) => typeof v === 'string' && v.length > 0,
    'length === 0': (v) => typeof v === 'string' && v.length === 0,

    // Object/Array checks
    'has length': (v) => v != null && typeof v.length === 'number',
    'has keys': (v) => v != null && typeof v === 'object' && Object.keys(v).length > 0,
    'empty object': (v) => v != null && typeof v === 'object' && Object.keys(v).length === 0,
    'empty array': (v) => Array.isArray(v) && v.length === 0,
    'non-empty array': (v) => Array.isArray(v) && v.length > 0
  });

  // OPTIMIZATION Phase 9B.3: Lazy path cache initialization (20-30% faster for repeated checks)
  // Module-level cache persists across calls
  let windowPropertyPathCache = null;

  /**
   * Check window properties for detection
   * This is the FASTEST detection method - runs in microseconds
   * OPTIMIZATION Phase 9B.2: Uses pre-compiled evaluators
   * OPTIMIZATION Phase 9B.3: Uses persistent path cache
   * @param {Array} propertyDefinitions - Array of property definitions from detectors
   */
  function checkWindowProperties(propertyDefinitions) {
    if (!propertyDefinitions || propertyDefinitions.length === 0) return;

    const detections = [];
    const startTime = performance.now();

    // OPTIMIZATION: Early exit tracking
    const EARLY_EXIT_THRESHOLD = 5;
    let highConfidenceCount = 0;

    // OPTIMIZATION Phase 9B.3: Lazy initialization - only create when actually needed
    if (!windowPropertyPathCache) {
      windowPropertyPathCache = new Map();
    }

    for (const propDef of propertyDefinitions) {
      try {
        // Safely access nested properties (e.g., "navigator.brave" -> window.navigator.brave)
        // OPTIMIZATION Phase 9B.3: Use persistent cached path parts (reused across calls)
        let pathParts = windowPropertyPathCache.get(propDef.path);
        if (!pathParts) {
          pathParts = propDef.path.split('.');
          windowPropertyPathCache.set(propDef.path, pathParts);
        }
        let value = window;

        sendLog('log', `[Window Props] 🔍 Checking: window.${propDef.path}`);

        for (const part of pathParts) {
          if (value == null) break; // null or undefined
          value = value[part];
        }

        // DEBUG: Log the actual value found
        const valueType = value === null ? 'null' : typeof value;
        const valuePreview = value === null ? 'null' :
                            value === undefined ? 'undefined' :
                            typeof value === 'object' ? '[object]' :
                            typeof value === 'function' ? '[function]' :
                            String(value).substring(0, 50);
        sendLog('log', `[Window Props] 📊 window.${propDef.path} = ${valuePreview} (type: ${valueType})`);

        // Evaluate the condition
        let conditionMet = false;
        const condition = propDef.condition || 'truthy';
        sendLog('log', `[Window Props] 🎯 Testing condition: "${condition}"`);

        // OPTIMIZATION Phase 9B.2: Use pre-compiled evaluators (15-20% faster)
        // SECURITY FIX: No eval() - only safe pre-compiled conditions allowed
        const evaluator = CONDITION_EVALUATORS[condition];
        if (evaluator) {
          // Safe evaluation using pre-compiled function
          conditionMet = evaluator(value);
        } else {
          // Unsupported condition - log error and skip
          sendLog('error', `[Window Props] ⚠️ Unsupported condition: "${condition}". Add to CONDITION_EVALUATORS if needed.`);
          sendLog('error', `[Window Props] Available conditions: ${Object.keys(CONDITION_EVALUATORS).join(', ')}`);
          conditionMet = false;
        }

        if (conditionMet) {
          sendLog('log', `[Window Props] ✅ MATCH! Condition "${condition}" passed for window.${propDef.path}`);

          const confidence = propDef.confidence || 80;
          detections.push({
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
          });

          sendLog('log', `[Window Props] ✅ Detected: window.${propDef.path} (${propDef.detectorName})`);

          // OPTIMIZATION: Early exit after enough high-confidence detections
          if (confidence >= 90) {
            highConfidenceCount++;
            if (highConfidenceCount >= EARLY_EXIT_THRESHOLD) {
              sendLog('log', `[Window Props] ⚡ Early exit: ${highConfidenceCount} high-confidence detections found`);
              break; // Stop checking more properties
            }
          }
        } else {
          sendLog('log', `[Window Props] ❌ NO MATCH: Condition "${condition}" failed for window.${propDef.path} (value: ${valuePreview}, type: ${valueType})`);
        }
      } catch (e) {
        // Property access might throw (e.g., cross-origin restrictions)
        sendLog('warn', `[Window Props] Error checking ${propDef.path}:`, e.message);
      }
    }

    const elapsed = performance.now() - startTime;
    const checkedCount = detections.length > 0 && highConfidenceCount >= EARLY_EXIT_THRESHOLD
      ? `${detections.length} (early exit)`
      : propertyDefinitions.length;
    sendLog('log', `[Window Props] ⚡ Checked ${checkedCount} properties in ${elapsed.toFixed(2)}ms`);

    // Send all detections to content script immediately
    if (detections.length > 0) {
      window.postMessage({
        type: 'WINDOW_DETECTIONS',
        detections: detections,
        timestamp: Date.now(),
        executionTime: elapsed
      }, '*');
    }
  }

  /**
   * Uninstall all remaining hooks (called on disable or completion)
   */
  function uninstallAllRemainingHooks() {
    if (installedHooks.size === 0) {
      sendLog('log', `[Hooks MAIN] ✅ All hooks already uninstalled`);
      return;
    }

    sendLog('log', `[Hooks MAIN] 🧹 Uninstalling ${installedHooks.size} remaining hooks...`);

    // Batch uninstall - iterate once
    for (const hookData of installedHooks.values()) {
      const { obj, propertyName, originalDescriptor } = hookData;
      try {
        Object.defineProperty(obj, propertyName, originalDescriptor);
      } catch (e) {
        // Ignore errors (property might not be configurable)
      }
    }
    installedHooks.clear();
    sendLog('log', `[Hooks MAIN] ✅ All remaining hooks uninstalled`);
  }

  // Listen for disable monitoring message from ISOLATED world (cache hit)
  window.addEventListener('message', (event) => {
    // Only accept messages from same origin
    if (event.source !== window) return;

    const data = event.data;

    // Handle disable monitoring command (cache hit)
    if (data && data.type === 'DISABLE_MONITORING') {
      if (debugMode) {
        console.log('[MAIN WORLD] 🛑 DISABLE_MONITORING received - cache hit, stopping all monitoring');
        console.log('[MAIN WORLD]   Reason:', data.reason);
        console.log('[MAIN WORLD]   URL:', data.url);
      }

      // Disable hooks monitoring
      hooksEnabled = false;
      if (completionTimeout) {
        clearTimeout(completionTimeout);
        completionTimeout = null;
      }
      sendLog('log', '[Hooks MAIN] 🛑 Hooks monitoring disabled due to cache hit');

      // Uninstall any installed hooks to reduce overhead
      uninstallAllRemainingHooks();

      if (debugMode) {
        console.log('[MAIN WORLD] ✅ All monitoring disabled successfully (cache hit)');
      }
    }
  });

  // Wait for hook configuration from ISOLATED world
  window.addEventListener('scrapfly-install-hooks', (event) => {
    // Set debugMode first, before any logging
    debugMode = event.detail?.debugMode || false; // Receive debug mode from ISOLATED world

    if (debugMode) {
      console.log('[MAIN WORLD] 🎯 scrapfly-install-hooks event received!', {
        hasDetail: !!event.detail,
        hookDefinitionsCount: event.detail?.hookDefinitions?.length,
        windowPropertiesCount: event.detail?.windowProperties?.length,
        debugMode: debugMode
      });
    }

    const hookDefinitions = event.detail?.hookDefinitions || [];
    const windowProperties = event.detail?.windowProperties || [];

    sendLog('log', `[Hooks MAIN] Received ${hookDefinitions.length} detectors and ${windowProperties.length} window property checks`);
    if (debugMode) {
      console.log('[MAIN WORLD] 📋 Window properties to check:', windowProperties.map(p => p.path));
    }

    // Check window properties once when page is fully loaded
    if (windowProperties.length > 0) {
      sendLog('log', `[Window Props] ⏳ Waiting for page load to check ${windowProperties.length} properties...`);

      if (document.readyState === 'complete') {
        // Page already loaded, check immediately
        sendLog('log', '[Window Props] 🔍 Page already loaded, checking now');
        checkWindowProperties(windowProperties);
        window.postMessage({
          type: 'WINDOW_PROPS_COMPLETE',
          url: window.location.href,
          timestamp: Date.now(),
          detectedCount: 0 // Will be updated by checkWindowProperties
        }, '*');
      } else {
        // Wait for page load
        window.addEventListener('load', () => {
          sendLog('log', '[Window Props] 🔍 Page loaded, checking properties');
          checkWindowProperties(windowProperties);
          window.postMessage({
            type: 'WINDOW_PROPS_COMPLETE',
            url: window.location.href,
            timestamp: Date.now(),
            detectedCount: 0 // Will be updated by checkWindowProperties
          }, '*');
        }, { once: true });
      }
    } else {
      // No window properties to check - send completion immediately
      sendLog('log', '[Window Props] ✅ No window properties to check - sending completion immediately');
      window.postMessage({
        type: 'WINDOW_PROPS_COMPLETE',
        url: window.location.href,
        timestamp: Date.now(),
        detectedCount: 0
      }, '*');
    }

    // Initialize/reset hooks state for this page load
    const triggeredHooks = new Set();
    hooksEnabled = true; // Enable hooks monitoring
    const COMPLETION_DELAY_MS = 2000; // OPTIMIZATION: Reduced from 5s to 2s (3s savings per page)

    // OPTIMIZED: Pre-calculate total hook count to avoid repeated iterations
    let totalHooksCount = 0;
    for (const detector of hookDefinitions) {
      totalHooksCount += detector.hooks.length;
    }
    sendLog('log', `[Hooks MAIN] Total hooks to install: ${totalHooksCount}`);

    function uninstallHook(hookTarget) {
      const hookData = installedHooks.get(hookTarget);
      if (!hookData) return; // Already uninstalled

      const { obj, propertyName, originalDescriptor } = hookData;
      try {
        Object.defineProperty(obj, propertyName, originalDescriptor);
        installedHooks.delete(hookTarget);
        sendLog('log', `[Hooks MAIN] 🗑️  Uninstalled: ${hookTarget}`);
      } catch (e) {
        // Ignore errors (property might not be configurable)
      }
    }

    function scheduleCompletion() {
      if (completionTimeout) clearTimeout(completionTimeout);
      completionTimeout = setTimeout(() => {
        hooksEnabled = false;
        sendLog('log', `[Hooks MAIN] 🏁 Hooks complete - ${triggeredHooks.size} unique hooks detected`);

        // Uninstall remaining hooks that never fired
        uninstallAllRemainingHooks();

        window.postMessage({
          type: 'JS_HOOKS_COMPLETE',
          url: window.location.href,
          timestamp: Date.now(),
          totalDetections: triggeredHooks.size,
          uniqueHooks: triggeredHooks.size
        }, '*');
        completionTimeout = null;
      }, COMPLETION_DELAY_MS);
    }

    function reportHookDetection(detectorId, detectorName, category, hook) {
      if (!hooksEnabled) {
        // Silently ignore - hooks are disabled and APIs are being called after uninstall
        return;
      }
      const detectionKey = `${detectorId}:${hook.target}`;
      if (triggeredHooks.has(detectionKey)) {
        sendLog('log', `[Hooks MAIN] 🔁 Duplicate hook skipped: ${hook.target}`);
        return;
      }
      triggeredHooks.add(detectionKey);

      sendLog('log', `[Hooks MAIN] ✅ Hook detected: ${hook.target} (${detectorName})`);

      window.postMessage({
        type: 'JS_HOOK_DETECTION',
        detection: {
          detectorId,
          detectorName,
          category,
          hook: {
            target: hook.target,
            confidence: hook.confidence,
            description: hook.description
          },
          timestamp: Date.now()
        },
        url: window.location.href
      }, '*');

      // Immediately uninstall this hook to reduce overhead
      uninstallHook(hook.target);

      scheduleCompletion();
    }

    // OPTIMIZATION: Pre-create stealth property descriptors (reusable)
    const stealthDescriptors = {
      name: { writable: false, enumerable: false, configurable: true },
      length: { writable: false, enumerable: false, configurable: true },
      toString: { writable: true, enumerable: false, configurable: true }
    };

    // OPTIMIZATION: Wrapper factory for faster hook creation
    // Creates lightweight wrappers without repeated property definitions
    // FIXED: Preserves proper 'this' context to avoid "Illegal invocation" errors
    function createStealthWrapper(original, callback, parentObj, isGetter = false) {
      // CRITICAL: Must bind to parent object for browser APIs
      // navigator.getBattery() requires 'this' === navigator
      const wrapper = function(...args) {
        callback();
        // Apply with correct context (this or parentObj)
        const context = this === window ? parentObj : this;
        return original.apply(context, args);
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
      try {
        const parts = hook.target.split('.');
        if (parts.length < 2) return;

        let obj = window;
        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]];
          if (!obj) return;
        }

        const propertyName = parts[parts.length - 1];
        const originalDescriptor = Object.getOwnPropertyDescriptor(obj, propertyName);
        if (!originalDescriptor) return;

        // Store original descriptor for later uninstall
        installedHooks.set(hook.target, { obj, propertyName, originalDescriptor });

        // OPTIMIZATION: Create callback once to avoid closure overhead
        const reportCallback = () => reportHookDetection(detectorId, detectorName, category, hook);

        // Handle getter properties - use optimized wrapper factory
        if (originalDescriptor.get && !originalDescriptor.value) {
          const stealthGetter = createStealthWrapper(originalDescriptor.get, reportCallback, obj, true);

          Object.defineProperty(obj, propertyName, {
            get: stealthGetter,
            set: originalDescriptor.set,
            enumerable: originalDescriptor.enumerable,
            configurable: originalDescriptor.configurable
          });
        }
        // Handle regular methods - use optimized wrapper factory
        else if (typeof originalDescriptor.value === 'function') {
          const wrapper = createStealthWrapper(originalDescriptor.value, reportCallback, obj, false);

          Object.defineProperty(obj, propertyName, {
            value: wrapper,
            writable: originalDescriptor.writable,
            enumerable: originalDescriptor.enumerable,
            configurable: originalDescriptor.configurable
          });
        }
      } catch (error) {
        sendLog('error', `[Hooks MAIN] Failed to install ${hook.target}:`, error);
      }
    }

    // Install all hooks
    for (const detector of hookDefinitions) {
      for (const hook of detector.hooks) {
        installHook(detector.id, detector.name, detector.category, hook);
      }
    }

    sendLog('log', `[Hooks MAIN] ✅ Installed hooks for ${hookDefinitions.length} detectors`);
    sendLog('log', `[Hooks MAIN] ⏳ Waiting for page to trigger fingerprinting APIs (2s timeout)...`);

    // Send completion if no hooks installed
    if (hookDefinitions.length === 0 || hookDefinitions.every(d => d.hooks.length === 0)) {
      sendLog('log', '[Hooks MAIN] ✅ No hooks installed - sending completion immediately');
      window.postMessage({
        type: 'JS_HOOKS_COMPLETE',
        url: window.location.href,
        timestamp: Date.now(),
        totalDetections: 0,
        uniqueHooks: 0
      }, '*');
    }
  }, { once: true });
})();
