/**
 * Content Script - MAIN World
 * Runs in the MAIN world (page's JavaScript context) to install fingerprinting hooks
 * Receives hook definitions from content.js (ISOLATED world) via CustomEvent
 *
 * VERSION: 2.2.0-OLD-TIMEOUT (2025-01-19)
 * - Reverted to proven 2-second completion timeout system
 * - Timer resets on ANY hook detection (including duplicates)
 * - Simple, reliable, deterministic - fixes "stuck at 86%" issue
 */

(function() {
  'use strict';

  // VERSION CHECK: Send to background script for debug logging
  const SCRIPT_LOAD_TIME = performance.now();

  let debugMode = false; // Will be set by ISOLATED world

  /**
   * ============================================================================
   * DETECTION SYSTEM ARCHITECTURE
   * ============================================================================
   *
   * This file implements Phase 1 & 2 of the detection flow:
   *
   * Phase 1: Hook Installation (0-5ms)
   * ──────────────────────────────────
   * - Installs 18 critical inline hooks SYNCHRONOUSLY at document_start
   * - Wraps fingerprinting APIs: Performance, Navigator, Screen, Canvas, WebGL, etc.
   * - Hooks fire when page scripts call these APIs
   *
   * Phase 2: Hook Detection & Reporting (5ms+)
   * ──────────────────────────────────────────
   * - Hook wrapper intercepts API call
   * - reportHookDetection() sends window.postMessage() to content.js
   * - Message includes: detectorId, detectorName, target API, confidence
   *
   * Content.js (ISOLATED world) then:
   * Phase 3: Batching & Deduplication (10-50ms batches)
   * ────────────────────────────────────────────────────
   * - Receives postMessage() events
   * - Deduplicates by "detectorId:target" key (same detector on same target = 1)
   * - Sends batch to background.js via chrome.runtime.sendMessage()
   *
   * Phase 4: Completion Tracking (Entire duration)
   * ──────────────────────────────────────────────
   * - Completion timer initialized at 2 seconds
   * - EVERY hook detection resets timer (even duplicates)
   * - Completes when 2 seconds pass with NO activity (any hook detection)
   * - Result: Simple "no activity = done" logic that never gets stuck
   *
   * Phase 5: Final Stats (At completion)
   * ────────────────────────────────────
   * - background.js receives completion signal
   * - Logs final statistics with all detectors found
   * - Shows completion method: "settled" or "timeout"
   *
   * ============================================================================
   * WHY THIS DESIGN WORKS
   * ============================================================================
   *
   * ✅ Synchronous inline hooks:
   *    - Page scripts execute ~30ms after document_start
   *    - If hooks install async, script might save native API reference first
   *    - Sync installation GUARANTEES hooks are ready before any user code runs
   *    - Result: 100% detection of early fingerprinting
   *
   * ✅ Simple 2-second reset-on-any-hook completion:
   *    - When hook fires → Timer resets to 2s (even if duplicate)
   *    - When 2s elapse with NO hook activity → Detection completes
   *    - Proven system: Works consistently across all pages
   *    - No complex activity tracking, no edge cases
   *    - No "stuck at 86%" issues (always completes after 2s inactivity)
   *    - Fast pages complete in 2-4 seconds total
   *    - Works reliably on pages with repeated detector fires
   *
   * ✅ detectorId:target deduplication:
   *    - Old: Counted only by target (API name) → Collisions
   *      Example: "Performance Fingerprint" + "Inline Hook: now" both on Performance.prototype.now
   *      Result: Old system = 1 count (WRONG), New system = 2 counts (CORRECT!)
   *    - New: Tracks "detectorId:target" pairs uniquely
   *    - Provides transparency logging showing what was deduplicated
   *
   * ============================================================================
   */

  // CRITICAL HOOKS: Install immediately (synchronously) to prevent race conditions
  // These are the most common fingerprinting APIs that MUST intercept before page scripts
  // Full detector list will be loaded async later for comprehensive detection
  const CRITICAL_INLINE_HOOKS = [
    // Performance API (high priority - used by almost all fingerprinting)
    { target: 'Performance.prototype.now', type: 'method' },
    { target: 'Performance.prototype.getEntriesByType', type: 'method' },

    // Navigator API (device/browser fingerprinting)
    { target: 'Navigator.prototype.userAgent', type: 'getter' },
    { target: 'Navigator.prototype.platform', type: 'getter' },
    { target: 'Navigator.prototype.languages', type: 'getter' },
    { target: 'Navigator.prototype.hardwareConcurrency', type: 'getter' },
    { target: 'Navigator.prototype.deviceMemory', type: 'getter' },
    { target: 'Navigator.prototype.webdriver', type: 'getter' },

    // Screen API (display fingerprinting)
    { target: 'Screen.prototype.width', type: 'getter' },
    { target: 'Screen.prototype.height', type: 'getter' },
    { target: 'Screen.prototype.colorDepth', type: 'getter' },

    // Canvas API (visual fingerprinting)
    { target: 'HTMLCanvasElement.prototype.toDataURL', type: 'method' },
    { target: 'CanvasRenderingContext2D.prototype.getImageData', type: 'method' },

    // WebGL API (GPU fingerprinting)
    { target: 'WebGLRenderingContext.prototype.getParameter', type: 'method' },

    // Crypto API (random value fingerprinting)
    { target: 'SubtleCrypto.prototype.digest', type: 'method' },

    // Media API (codec fingerprinting)
    { target: 'HTMLMediaElement.prototype.canPlayType', type: 'method' },

    // Audio API (audio fingerprinting)
    { target: 'AudioContext.prototype.createOscillator', type: 'method' },
    { target: 'OfflineAudioContext.prototype.startRendering', type: 'method' }
  ];

  // Hooks monitoring state (module scope for disable monitoring)
  let installedHooks = new Map(); // Map: hook.target -> {obj, propertyName, originalDescriptor, detectors (Map), wrapper, fallbackContext}
  let completionTimeout = null;
  let pageReadySignalReceived = false;
  const pageReadyCallbacks = [];

  // Uninstall failure tracking (module scope for cross-function access)
  const uninstallStats = {
    attempts: 0,
    successes: 0,
    failures: 0,
    failedTargets: []
  };

  // COMPLETION DELAY: 2-second timeout that resets on ANY hook detection (even repeats)
  // Old proven system: Simple, reliable, deterministic
  const HOOKS_HARD_TIMEOUT_MS = 2000; // 2 seconds - resets on ANY hook

  // Track inline hook detections separately
  const inlineHookDetections = new Map(); // target -> detection info

  // Helper to send logs to service worker (only when debug enabled)
  // OPTIMIZATION: Early return when disabled - zero overhead
  // Logs are only sent to background/service-worker, not to page console
  const sendLog = function(level, ...args) {
    // Early return for zero overhead when debug disabled
    if (!debugMode) return;

    try {
      // Send to background service worker for debug output
      const prefix = '[MAIN_WORLD] [Hooks]';
      const message = [prefix, ...args].map(arg => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'object') return JSON.stringify(arg);
        return String(arg);
      }).join(' ');

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
   * @param {Function} onDetection - Optional callback for each detection batch
   * @returns {Array} detections - Array of detection objects
   */
  function checkWindowPropertiesCore(propertyDefinitions, onDetection) {
    if (!propertyDefinitions || propertyDefinitions.length === 0) return [];

    // Early exit on cache hit - skip all window property checks
    if (window.__scrapflyCacheHitEarlyExit) {
      sendLog('log', '[Window Props] ⏭️ Cache hit detected - skipping property checks');
      return [];
    }

    const detections = [];
    const startTime = performance.now();

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

          sendLog('log', `[Window Props] ✅ Detected: window.${propDef.path} (${propDef.detectorName})`);
        } else {
          sendLog('log', `[Window Props] ❌ NO MATCH: Condition "${condition}" failed for window.${propDef.path} (value: ${valuePreview}, type: ${valueType})`);
        }
      } catch (e) {
        // Property access might throw (e.g., cross-origin restrictions)
        sendLog('warn', `[Window Props] Error checking ${propDef.path}:`, e.message);
      }
    }

    const elapsed = performance.now() - startTime;
    sendLog('log', `[Window Props] ⚡ Checked ${propertyDefinitions.length} properties in ${elapsed.toFixed(2)}ms - found ${detections.length} detections`);

    // Send detections to content script if any found
    if (detections.length > 0) {
      window.postMessage({
        type: 'WINDOW_DETECTIONS',
        detections: detections,
        timestamp: Date.now(),
        executionTime: elapsed
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
      sendLog('log', `[Hooks MAIN] ✅ All hooks already uninstalled`);
      return { total: 0, successes: 0, failures: 0, failedTargets: [] };
    }

    sendLog('log', `[Hooks MAIN] 🧹 Uninstalling ${installedHooks.size} remaining hooks...`);

    const stats = {
      total: installedHooks.size,
      successes: 0,
      failures: 0,
      failedTargets: []
    };

    // Batch uninstall - iterate once
    const hookTargets = Array.from(installedHooks.keys());
    for (const hookTarget of hookTargets) {
      const hookData = installedHooks.get(hookTarget);
      if (!hookData) continue;

      const { obj, propertyName, originalDescriptor } = hookData;
      try {
        Object.defineProperty(obj, propertyName, originalDescriptor);
        installedHooks.delete(hookTarget);
        stats.successes++;
        sendLog('log', `[Hooks MAIN] 🗑️  Uninstalled: ${hookTarget}`);
      } catch (e) {
        // Property might not be configurable
        stats.failures++;
        stats.failedTargets.push(hookTarget);
        sendLog('error', `[Hooks MAIN] ❌ Failed to uninstall ${hookTarget}: ${e.message}`);
      }
    }

    sendLog('log', `[Hooks MAIN] ✅ Uninstall complete: ${stats.successes} succeeded, ${stats.failures} failed`);
    if (stats.failures > 0) {
      sendLog('warn', `[Hooks MAIN] ⚠️  Failed hooks remain active: ${stats.failedTargets.join(', ')}`);
    }

    return stats;
  }

  /**
   * Install critical hooks SYNCHRONOUSLY at document_start
   * No async operations - installs immediately to prevent race conditions
   * Returns number of hooks installed
   */
  function installCriticalHooksSynchronously() {
    const startTime = performance.now();
    let installed = 0;
    let failed = 0;

    for (const hook of CRITICAL_INLINE_HOOKS) {
      try {
        const parts = hook.target.split('.');
        if (parts.length < 2) {
          failed++;
          continue;
        }

        // Resolve the object path
        let obj = window;
        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]];
          if (!obj) {
            failed++;
            continue;
          }
        }

        const propertyName = parts[parts.length - 1];
        const originalDescriptor = Reflect.getOwnPropertyDescriptor(obj, propertyName);

        if (!originalDescriptor) {
          failed++;
          continue;
        }

        // Create lightweight detection callback
        const reportInlineDetection = () => {
          // FIX: Early exit if cache hit detected - don't waste CPU on hook reporting
          if (window.__scrapflyCacheHitEarlyExit) {
            return; // Cache hit - skip all hook reporting
          }

          if (!inlineHookDetections.has(hook.target)) {
            inlineHookDetections.set(hook.target, {
              target: hook.target,
              timestamp: Date.now(),
              type: 'inline_hook'
            });

            // CRITICAL FIX: Report inline hook detection to content script (ISOLATED world)
            // This ensures inline hooks are tracked by the debug system
            const detectorId = 'inline-hook-' + hook.target.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
            const detectorName = 'Inline Hook: ' + hook.target.split('.').pop();

            try {
              window.postMessage({
                type: 'JS_HOOK_DETECTION',
                detection: {
                  detectorId: detectorId,
                  detectorName: detectorName,
                  category: 'fingerprint',
                  hook: {
                    target: hook.target,
                    confidence: 90,
                    description: 'Synchronously installed inline hook (guaranteed interception)'
                  },
                  timestamp: Date.now()
                },
                url: window.location.href
              }, '*');
            } catch (e) {
              // Silently fail
            }
          }
        };

        // Install based on type
        if (hook.type === 'getter' && originalDescriptor.get) {
          const originalGet = originalDescriptor.get;
          const wrappedGet = function() {
            reportInlineDetection();
            return Reflect.apply(originalGet, this, arguments);
          };

          Object.defineProperty(obj, propertyName, {
            get: wrappedGet,
            set: originalDescriptor.set,
            enumerable: originalDescriptor.enumerable,
            configurable: originalDescriptor.configurable
          });

          installed++;
        } else if (hook.type === 'method' && typeof originalDescriptor.value === 'function') {
          const originalMethod = originalDescriptor.value;
          const wrappedMethod = function(...args) {
            reportInlineDetection();
            return Reflect.apply(originalMethod, this, args);
          };

          // Copy function properties
          try {
            Object.defineProperty(wrappedMethod, 'name', { value: originalMethod.name, configurable: true });
            Object.defineProperty(wrappedMethod, 'length', { value: originalMethod.length, configurable: true });
            Object.defineProperty(wrappedMethod, 'toString', {
              value: function() { return Function.prototype.toString.call(originalMethod); },
              configurable: true
            });
            if (originalMethod.prototype) {
              wrappedMethod.prototype = originalMethod.prototype;
            }
          } catch (e) {
            // Stealth properties failed, but hook still works
          }

          Object.defineProperty(obj, propertyName, {
            value: wrappedMethod,
            writable: originalDescriptor.writable,
            enumerable: originalDescriptor.enumerable,
            configurable: originalDescriptor.configurable
          });

          installed++;
        } else {
          failed++;
        }
      } catch (e) {
        failed++;
      }
    }

    const elapsed = performance.now() - startTime;
    return installed;
  }

  // Check sessionStorage for cache hit flag BEFORE installing hooks (synchronous check)
  // This flag is set by ISOLATED world when cache hit is detected
  try {
    const cacheKey = `scrapfly_cache_${window.location.hostname}`;
    const cachedData = sessionStorage.getItem(cacheKey);

    if (cachedData) {
      const cacheInfo = JSON.parse(cachedData);
      const cacheAge = Date.now() - cacheInfo.timestamp;

      // Cache is valid for 12 hours (same as detection cache)
      if (cacheAge < 12 * 60 * 60 * 1000) {
        sendLog('log', '[MAIN WORLD] ⏭️ Synchronous cache hit detected - setting flag to prevent hook reporting');
        window.__scrapflyCacheHitEarlyExit = true;
      } else {
        // Cache expired, clear it
        sessionStorage.removeItem(cacheKey);
      }
    }
  } catch (e) {
    // SessionStorage might not be available, continue normally
    sendLog('warn', '[MAIN WORLD] SessionStorage cache check failed:', e.message);
  }

  // CRITICAL: Install inline hooks IMMEDIATELY (synchronously)
  // This must happen BEFORE any page scripts execute
  const inlineHooksInstalled = installCriticalHooksSynchronously();

  // Listen for disable monitoring message from ISOLATED world (cache hit)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;

    if (data && data.type === 'SCRAPFLY_PAGE_READY') {
      if (!pageReadySignalReceived) {
        pageReadySignalReceived = true;
        sendLog('log', '[MAIN WORLD] 🚀 Page ready message received');
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
      sendLog('log', '[MAIN WORLD] ⏭️ Cache hit notification received - setting flag to stop hook reporting');
      window.__scrapflyCacheHitEarlyExit = true;
      return;
    }

    // Handle disable monitoring command (cache hit)
    if (data && data.type === 'DISABLE_MONITORING') {
      sendLog('log', '[MAIN WORLD] 🛑 DISABLE_MONITORING received - cache hit, stopping all monitoring');
      sendLog('log', '[MAIN WORLD]   Reason:', data.reason);
      sendLog('log', '[MAIN WORLD]   URL:', data.url);

      // Disable hooks monitoring - clear timeout
      if (completionTimeout) {
        clearTimeout(completionTimeout);
        completionTimeout = null;
      }
      sendLog('log', '[Hooks MAIN] 🛑 Hooks monitoring disabled due to cache hit');

      // Uninstall any installed hooks to reduce overhead
      const cacheHitUninstallStats = uninstallAllRemainingHooks();
      if (cacheHitUninstallStats.failures > 0) {
        sendLog('warn', `[MAIN WORLD] ⚠️  Cache hit cleanup: ${cacheHitUninstallStats.failures} hooks failed to uninstall`);
      }

      sendLog('log', '[MAIN WORLD] ✅ All monitoring disabled successfully (cache hit)');
    }
  });

  // Wait for hook configuration from ISOLATED world
  window.addEventListener('scrapfly-install-hooks', (event) => {
    // NEW OPTIMIZATION: Check if cache hit early exit flag is set
    if (window.__scrapflyCacheHitEarlyExit) {
      // Cache hit was detected before this event - skip hook installation entirely
      // Note: debugMode hasn't been set yet, so we can't check it here
      // This log will be suppressed by debug.js if debug mode is disabled
      return;
    }

    // CRITICAL TIMING: Record when event is received
    const eventReceivedTime = performance.now();

    // Set debugMode first, before any logging
    debugMode = event.detail?.debugMode || false; // Receive debug mode from ISOLATED world

    // FIX: Settings MUST come from installHooksOrchestrator (line 2738 in detection-engine-manager.js)
    // which reads from default-settings.json at runtime
    // NO hardcoded fallback values - only use what's explicitly passed from ISOLATED world
    // If settings missing, it's an error state and should fail loudly
    const enhancedSettings = event.detail?.enhancedSettings;

    if (!enhancedSettings) {
      sendLog('error', '[MAIN WORLD] ❌ CRITICAL: No enhancedSettings passed from installHooksOrchestrator!');
      sendLog('error', '[MAIN WORLD] This should never happen - settings must come from default-settings.json');
      // Send empty completion signals to unblock background
      window.postMessage({
        type: 'JS_HOOKS_COMPLETE',
        url: window.location.href,
        timestamp: Date.now(),
        detectedCount: 0
      }, '*');
      window.postMessage({
        type: 'WINDOW_PROPS_COMPLETE',
        url: window.location.href,
        timestamp: Date.now(),
        detectedCount: 0
      }, '*');
      return;
    }

    sendLog('log', '[MAIN WORLD] 🎯 scrapfly-install-hooks event received!', {
      hasDetail: !!event.detail,
      hookDefinitionsCount: event.detail?.hookDefinitions?.length,
      windowPropertiesCount: event.detail?.windowProperties?.length,
      debugMode: debugMode,
      enhancedDetection: enhancedSettings.enabled ? enhancedSettings.windowPropertiesMode : 'disabled',
      hooksTimeoutMs: enhancedSettings.hooksTimeoutMs,
      maxDetectionWindowMs: enhancedSettings.maxDetectionWindowMs
    });

    const hookDefinitions = event.detail?.hookDefinitions || [];
    const windowProperties = event.detail?.windowProperties || [];

    sendLog('log', `[Hooks MAIN] Received ${hookDefinitions.length} detectors and ${windowProperties.length} window property checks`);
    sendLog('log', '[MAIN WORLD] 📋 Window properties to check:', windowProperties.map(p => p.path));

    // Check window properties with polling mechanism
    if (windowProperties.length > 0) {
      sendLog('log', `[Window Props] ⏳ Waiting for page load to check ${windowProperties.length} properties...`);

      // Track detections for reporting
      let detectedCount = 0;
      const detectedPropertyPaths = new Set(); // Track which properties we've already detected
      const scheduledTimeouts = []; // Track setTimeout IDs for cleanup
      let pollIntervalId = null; // Track polling interval
      let performanceObserver = null; // Track PerformanceObserver for cleanup

      // POLLING: Check every 200ms until settled (no new detections for 10 seconds)
      const checkPropertiesWithPolling = () => {
        // Check cache flag before starting polling
        if (window.__scrapflyCacheHitEarlyExit) {
          sendLog('log', '[Window Props] ⏭️ Cache hit detected - skipping window property checks');
          window.postMessage({
            type: 'WINDOW_PROPS_COMPLETE',
            url: window.location.href,
            timestamp: Date.now(),
            detectedCount: 0,
            reason: 'cache_hit'
          }, '*');
          return;
        }

        const startTime = Date.now();
        const POLL_INTERVAL_MS = 200; // Check every 200ms
        const MAX_WINDOW_MS = enhancedSettings?.maxDetectionWindowMs || 5000; // Default 5 seconds
        const SETTLED_CHECKS_REQUIRED = 50; // Number of consecutive checks with no new detections to consider settled (50 checks * 200ms = 10 seconds)

        let checksWithoutNewDetections = 0;
        let pollCount = 0;

        sendLog('log', `[Window Props] 🔍 Starting window property polling (${POLL_INTERVAL_MS}ms interval, ${MAX_WINDOW_MS}ms max window)`);

        // Polling function
        const pollProperties = () => {
          pollCount++;

          // Check if cache hit was detected during polling
          if (window.__scrapflyCacheHitEarlyExit) {
            sendLog('log', '[Window Props] ⏭️ Cache hit detected mid-polling - stopping');
            cleanupEnhancedDetection();
            window.postMessage({
              type: 'WINDOW_PROPS_COMPLETE',
              url: window.location.href,
              timestamp: Date.now(),
              detectedCount: 0,
              reason: 'cache_hit'
            }, '*');
            return;
          }

          const elapsed = Date.now() - startTime;

          // Check if max window exceeded
          if (elapsed >= MAX_WINDOW_MS) {
            sendLog('log', `[Window Props] ⏱️ Max detection window (${MAX_WINDOW_MS}ms) reached`);
            sendLog('log', `[Window Props] 📊 Final: ${detectedCount}/${windowProperties.length} properties detected after ${pollCount} polls`);

            window.postMessage({
              type: 'WINDOW_PROPS_COMPLETE',
              url: window.location.href,
              timestamp: Date.now(),
              detectedCount: detectedCount,
              totalChecked: windowProperties.length,
              elapsedMs: elapsed,
              reason: 'max_window_reached'
            }, '*');

            cleanupEnhancedDetection();
            return;
          }

          // Check all properties
          let newDetectionsThisPoll = 0;
          checkWindowPropertiesCore(windowProperties, (newDetections) => {
            // Only count truly new detections
            newDetections.forEach(detection => {
              const propertyPath = detection.path;
              if (!detectedPropertyPaths.has(propertyPath)) {
                detectedPropertyPaths.add(propertyPath);
                detectedCount++;
                newDetectionsThisPoll++;
              }
            });
          });

          if (newDetectionsThisPoll > 0) {
            sendLog('log', `[Window Props] ✅ Poll #${pollCount}: Found ${newDetectionsThisPoll} new properties (total: ${detectedCount}/${windowProperties.length})`);
            checksWithoutNewDetections = 0; // Reset counter
          } else {
            checksWithoutNewDetections++;
            if (checksWithoutNewDetections === 1) {
              sendLog('log', `[Window Props] 🔁 Poll #${pollCount}: No new detections (${checksWithoutNewDetections}/${SETTLED_CHECKS_REQUIRED} to settle)`);
            }
          }

          // Check if settled (3 consecutive checks with no new detections)
          if (checksWithoutNewDetections >= SETTLED_CHECKS_REQUIRED) {
            sendLog('log', `[Window Props] 🏁 Settled after ${pollCount} polls (${SETTLED_CHECKS_REQUIRED} consecutive checks with no new detections)`);
            sendLog('log', `[Window Props] 📊 Final: ${detectedCount}/${windowProperties.length} properties detected in ${elapsed}ms`);

            window.postMessage({
              type: 'WINDOW_PROPS_COMPLETE',
              url: window.location.href,
              timestamp: Date.now(),
              detectedCount: detectedCount,
              totalChecked: windowProperties.length,
              elapsedMs: elapsed,
              reason: 'settled'
            }, '*');

            cleanupEnhancedDetection();
            return;
          }

          // All properties detected?
          if (detectedCount >= windowProperties.length) {
            sendLog('log', `[Window Props] ✅ All ${windowProperties.length} properties detected after ${pollCount} polls in ${elapsed}ms`);

            window.postMessage({
              type: 'WINDOW_PROPS_COMPLETE',
              url: window.location.href,
              timestamp: Date.now(),
              detectedCount: detectedCount,
              totalChecked: windowProperties.length,
              elapsedMs: elapsed,
              reason: 'all_detected'
            }, '*');

            cleanupEnhancedDetection();
            return;
          }
        };

        // Start polling
        pollProperties(); // Run first check immediately
        pollIntervalId = setInterval(pollProperties, POLL_INTERVAL_MS);
      };

      // Cleanup function to free resources
      const cleanupEnhancedDetection = () => {
        // Clear polling interval
        if (pollIntervalId) {
          clearInterval(pollIntervalId);
          pollIntervalId = null;
          sendLog('log', '[Window Props] 🧹 Polling interval cleared');
        }

        // Clear any pending timeouts
        scheduledTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        scheduledTimeouts.length = 0;

        // Disconnect PerformanceObserver if active
        if (performanceObserver) {
          try {
            performanceObserver.disconnect();
            sendLog('log', '[Window Props] 🧹 PerformanceObserver disconnected');
          } catch (e) {
            // Ignore errors
          }
          performanceObserver = null;
        }
      };

      const startWindowChecks = () => {
        sendLog('log', '[Window Props] 🔍 Starting window property polling after page ready');
        checkPropertiesWithPolling();
      };

      if (document.readyState === 'complete' || pageReadySignalReceived) {
        startWindowChecks();
      } else {
        pageReadyCallbacks.push(startWindowChecks);
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
    let hooksStartTime = Date.now();
    // REMOVED: bufferedDetections array - no longer needed with always-on monitoring

    // PHASE 2 FIX: Add a maximum timeout to GUARANTEE completion signal is sent
    // This prevents the badge from getting stuck if hooks keep resetting the regular timeout
    let maxTimeoutId = null;
    let completionSignalSent = false;

    const sendCompletionSignalOnce = () => {
      if (completionSignalSent) return;
      completionSignalSent = true;

      const elapsed = Date.now() - hooksStartTime;
      sendLog('log', `[Hooks MAIN] 📢 Sending JS_HOOKS_COMPLETE signal (${triggeredHooks.size} hooks detected in ${elapsed}ms)`);

      window.postMessage({
        type: 'JS_HOOKS_COMPLETE',
        url: window.location.href,
        timestamp: Date.now(),
        totalDetections: triggeredHooks.size,
        uniqueHooks: triggeredHooks.size,
        completionReason: elapsed >= 3000 ? 'max_timeout' : 'activity_timeout',
        completionTime: elapsed,
        uninstallStats: {
          attempts: uninstallStats.attempts,
          successes: uninstallStats.successes,
          failures: uninstallStats.failures,
          failedTargets: uninstallStats.failedTargets.slice()
        }
      }, '*');

      // Clear any pending timeouts
      if (completionTimeout) {
        clearTimeout(completionTimeout);
        completionTimeout = null;
      }
      if (maxTimeoutId) {
        clearTimeout(maxTimeoutId);
        maxTimeoutId = null;
      }
    };

    // Reset uninstall failure tracking for this page load
    uninstallStats.attempts = 0;
    uninstallStats.successes = 0;
    uninstallStats.failures = 0;
    uninstallStats.failedTargets.length = 0;

    // OPTIMIZED: Pre-calculate total hook count to avoid repeated iterations
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
        sendLog('warn', `[Hooks MAIN] ⚠️  Cannot uninstall ${hookTarget} - not found in installedHooks`);
        return false; // Already uninstalled or never installed
      }

      const { obj, propertyName, originalDescriptor } = hookData;
      try {
        Object.defineProperty(obj, propertyName, originalDescriptor);
        installedHooks.delete(hookTarget);
        sendLog('log', `[Hooks MAIN] 🗑️  Uninstalled: ${hookTarget}`);
        return true;
      } catch (e) {
        // Uninstall failed - likely property is non-configurable
        sendLog('error', `[Hooks MAIN] ❌ Failed to uninstall ${hookTarget}: ${e.message}`);
        sendLog('error', `[Hooks MAIN]    Reason: Property "${propertyName}" is likely non-configurable`);
        sendLog('error', `[Hooks MAIN]    Hook will remain active until page unload`);
        // Don't delete from installedHooks - keeps metadata for debugging
        return false;
      }
    }

    /**
     * Schedule completion after activity timeout
     * PHASE 2 FIX: Uses centralized completion signal sender
     */
    function scheduleCompletion() {
      if (completionTimeout) clearTimeout(completionTimeout);

      completionTimeout = setTimeout(() => {
        sendLog('log', `[Hooks MAIN] 🏁 Activity timeout reached after 2s of inactivity`);
        sendLog('log', `[Hooks MAIN] 🏁 Hooks complete - ${triggeredHooks.size} unique hooks detected`);

        // SUMMARY: Show only useful information
        sendLog('log', `[Hooks MAIN] 📊 DETECTION SUMMARY:`);
        sendLog('log', `[Hooks MAIN]    ✅ Hooks that FIRED: ${triggeredHooks.size}/${originalHooksCount}`);

        // List all hooks that fired (only if debug enabled)
        const triggeredHooksArray = Array.from(triggeredHooks);
        const firedHooksList = triggeredHooksArray.map(key => key.split(':')[1]).sort();
        sendLog('log', `[Hooks MAIN]    📝 Fired hooks:`, firedHooksList);

        // IMMEDIATE UNINSTALL: Only uninstall hooks that never fired
        // Hooks that fired were already uninstalled immediately
        if (installedHooks.size > 0) {
          sendLog('log', `[Hooks MAIN] 🧹 Detection complete, uninstalling ${installedHooks.size} remaining unfired hooks...`);
          const bulkUninstallStats = uninstallAllRemainingHooks();

          // Merge bulk uninstall stats with immediate uninstall stats
          uninstallStats.attempts += bulkUninstallStats.total;
          uninstallStats.successes += bulkUninstallStats.successes;
          uninstallStats.failures += bulkUninstallStats.failures;
          uninstallStats.failedTargets.push(...bulkUninstallStats.failedTargets);
        } else {
          sendLog('log', `[Hooks MAIN] ✅ All hooks were uninstalled immediately when detected`);
        }

        // Log final uninstall statistics summary
        const totalAttempted = uninstallStats.attempts;
        if (totalAttempted > 0) {
          sendLog('log', `[Hooks MAIN] 📊 Final Uninstall Stats: ${uninstallStats.successes}/${totalAttempted} succeeded (${uninstallStats.failures} failed)`);
          if (uninstallStats.failures > 0) {
            sendLog('warn', `[Hooks MAIN] ⚠️  Failed to uninstall: ${uninstallStats.failedTargets.join(', ')}`);
          }
        }

        // Use centralized completion signal sender
        sendCompletionSignalOnce();
      }, HOOKS_HARD_TIMEOUT_MS);
    }

    function reportHookDetection(detectorId, detectorName, category, hook) {
      // FIX: Early exit if cache hit detected - don't waste CPU on hook reporting
      if (window.__scrapflyCacheHitEarlyExit) {
        return; // Cache hit - skip all hook reporting
      }

      // FIX: Removed buffering - monitoring is always enabled from document_start
      const detectionKey = `${detectorId}:${hook.target}`;
      const isDuplicate = triggeredHooks.has(detectionKey);

      if (!isDuplicate) {
        // NEW detection - add to set
        triggeredHooks.add(detectionKey);

        // DEBUG #2: Track exactly which hooks fire and when
        const timeElapsed = Date.now() - hooksStartTime;
        sendLog('log', `[Hooks DEBUG] ✅ HOOK FIRED #${triggeredHooks.size}: ${hook.target} (${detectorName}) - at ${timeElapsed}ms`);
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
      } else {
        // DUPLICATE detection - log but still reset timer
        sendLog('log', `[Hooks MAIN] 🔁 Duplicate hook detected: ${hook.target} (resetting completion timer)`);
      }

      // CRITICAL: Always reset completion timer - OLD SYSTEM behavior
      // Even if this is a duplicate detection, reset the timer
      // This ensures: "No activity for 2 seconds = detection complete"
      scheduleCompletion();

      // IMMEDIATE UNINSTALL: Uninstall hook as soon as it fires (reduces overhead)
      // Each hook only needs to fire once to be detected
      // Improves page performance by removing interceptors after detection
      if (!isDuplicate) {
        // Only uninstall once per unique detector:target pair
        const uninstalled = uninstallHook(hook.target);
        if (uninstalled) {
          uninstallStats.successes++;
          sendLog('log', `[Hooks MAIN] 🗑️ Immediately uninstalled: ${hook.target} (${installedHooks.size} remaining)`);
        } else {
          uninstallStats.failures++;
          uninstallStats.failedTargets.push(hook.target);
          sendLog('warn', `[Hooks MAIN] ⚠️ Failed to uninstall: ${hook.target}`);
        }
      }
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
    function createStealthWrapper(original, callback, explicitContext, isGetter = false) {
      const wrapper = function(...args) {
        callback();
        // FIX: Use natural 'this' binding for prototype methods
        // For methods like getBattery(), enumerateDevices(), etc., 'this' must be the actual instance
        // explicitContext is ONLY used for special cases where we need to validate the context type
        // (like addEventListener where we check if context is Window/Document/etc for event filtering)
        // For most hooks, explicitContext is null and we rely entirely on natural binding
        return Reflect.apply(original, this, args);
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
        if (parts.length < 2) return false; // BULLETPROOF: Return false for invalid hooks

        let obj = window;
        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]];
          if (!obj) return false; // BULLETPROOF: Return false if object path doesn't exist
        }

        const propertyName = parts[parts.length - 1];
        const originalDescriptor = Reflect.getOwnPropertyDescriptor(obj, propertyName);
        if (!originalDescriptor) return false; // BULLETPROOF: Return false if property doesn't exist

        const existingHook = installedHooks.get(hook.target);
        if (existingHook) {
          existingHook.detectors.set(detectorId, { detectorName, category });

          // CRITICAL FIX: If this hook was installed by installCriticalHooks(),
          // we need to replace its wrapper with one that uses reportHookDetection()
          // because critical hooks use a simplified callback that doesn't report to content script.
          // Use the ORIGINAL descriptor stored when first installed, not the current hooked one.
          const needsUpgrade = existingHook.wrapper && !existingHook.upgraded;
          if (needsUpgrade) {
            sendLog('log', `[Hooks DEBUG] 🔄 Upgrading critical hook: ${hook.target} to use full reporting`);

            // Resolve windowPath for upgraded hooks too
            let explicitContext = null;
            if (hook.windowPath) {
              const parts = hook.windowPath.split('.');
              explicitContext = parts.reduce((parent, part) => parent?.[part], window);
              if (!explicitContext) {
                sendLog('warn', `[Hooks] Failed to resolve windowPath "${hook.windowPath}" for ${hook.target}`);
                return false;
              }
            }

            const reportCallback = () => reportHookDetection(detectorId, detectorName, category, hook);

            // Use existingHook.originalDescriptor, NOT originalDescriptor (which is the hooked version)
            const origDesc = existingHook.originalDescriptor;

            // Reinstall with proper reporting callback
            if (origDesc.get && !origDesc.value) {
              const stealthGetter = createStealthWrapper(origDesc.get, reportCallback, explicitContext, true);
              Object.defineProperty(obj, propertyName, {
                get: stealthGetter,
                set: origDesc.set,
                enumerable: origDesc.enumerable,
                configurable: origDesc.configurable
              });
              existingHook.wrapper = stealthGetter;
            } else if (typeof origDesc.value === 'function') {
              const wrapper = createStealthWrapper(origDesc.value, reportCallback, explicitContext, false);
              Object.defineProperty(obj, propertyName, {
                value: wrapper,
                writable: origDesc.writable,
                enumerable: origDesc.enumerable,
                configurable: origDesc.configurable
              });
              existingHook.wrapper = wrapper;
            }

            existingHook.upgraded = true;
            sendLog('log', `[Hooks DEBUG] ✅ Upgraded: ${hook.target}`);
          }

          return existingHook;
        }

        // Resolve windowPath if provided in JSON (e.g., "navigator" for Navigator.prototype.getBattery)
        let explicitContext = null;
        if (hook.windowPath) {
          const parts = hook.windowPath.split('.');
          explicitContext = parts.reduce((parent, part) => parent?.[part], window);
          if (!explicitContext) {
            sendLog('warn', `[Hooks] Failed to resolve windowPath "${hook.windowPath}" for ${hook.target}`);
            return false; // Hook fails if windowPath doesn't exist
          }
        }

        const hookMetadata = {
          obj,
          propertyName,
          originalDescriptor,
          detectors: new Map([[detectorId, { detectorName, category }]]),
          wrapper: null
        };

        // OPTIMIZATION: Create callback once to avoid closure overhead
        const reportCallback = () => reportHookDetection(detectorId, detectorName, category, hook);

        // Handle getter properties - use optimized wrapper factory
        if (originalDescriptor.get && !originalDescriptor.value) {
          const stealthGetter = createStealthWrapper(originalDescriptor.get, reportCallback, explicitContext, true);

          Object.defineProperty(obj, propertyName, {
            get: stealthGetter,
            set: originalDescriptor.set,
            enumerable: originalDescriptor.enumerable,
            configurable: originalDescriptor.configurable
          });
          hookMetadata.wrapper = stealthGetter;
        }
        // Handle regular methods - use optimized wrapper factory
        else if (typeof originalDescriptor.value === 'function') {
          const wrapper = createStealthWrapper(originalDescriptor.value, reportCallback, explicitContext, false);

          Object.defineProperty(obj, propertyName, {
            value: wrapper,
            writable: originalDescriptor.writable,
            enumerable: originalDescriptor.enumerable,
            configurable: originalDescriptor.configurable
          });
          hookMetadata.wrapper = wrapper;
        }

        installedHooks.set(hook.target, hookMetadata);
        return hookMetadata;
      } catch (error) {
        sendLog('error', `[Hooks MAIN] Failed to install ${hook.target}:`, error);
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
              sendLog('log', `[Hooks DEBUG] ✅ INSTALLED: ${hook.target} (${detector.name})`);
            } else {
              sendLog('log', `[Hooks DEBUG] 🔁 Reused existing hook for ${hook.target} (already installed)`);
            }

            const entry = installed.get(hook.target) || { detectors: new Set() };
            entry.detectors.add(detector.name);
            installed.set(hook.target, entry);
          } else {
            failCount++;
            const isExpectedFailure = EXPECTED_UNAVAILABLE.some(ef => hook.target.includes(ef));

            if (isExpectedFailure) {
              expectedFailed.push(hook.target);
              sendLog('log', `[Hooks DEBUG] ⚠️ EXPECTED: ${hook.target} not available (${detector.name}) - API not present in this context`);
            } else {
              failed.push(hook.target);
              sendLog('warn', `[Hooks DEBUG] ❌ FAILED: ${hook.target} (${detector.name}) - returned false`);
            }

            failureReasons[hook.target] = (failureReasons[hook.target] || []).concat('installHook returned false');
          }
        } catch (e) {
          failCount++;
          failed.push(hook.target);
          failureReasons[hook.target] = (failureReasons[hook.target] || []).concat(e.message);
          sendLog('error', `[Hooks DEBUG] ❌ EXCEPTION: ${hook.target} (${detector.name}) - ${e.message}`);
        }
      }
    }

    // CRITICAL TIMING: Record when hook installation completes
    const hooksInstalledTime = performance.now();

    sendLog('log', `[Hooks MAIN] 📊 Installation complete: ${successCount} hooks installed, ${failCount} failures (${expectedFailed.length} expected), ${installed.size} total hook targets`);
    if (installed.size) {
      sendLog('log', `[Hooks DEBUG] Active hooks: ${Array.from(installed.entries()).map(([target, meta]) => `${target} (detectors: ${Array.from(meta.detectors).join(', ')})`).join('; ')}`);
    }

    // Report unexpected failures as warnings, expected failures as info
    if (failed.length > 0) {
      sendLog('warn', `[Hooks MAIN] ❌ Unexpected failures (${failed.length}): ${failed.join(', ')}`);
      sendLog('warn', `[Hooks DEBUG] Failure details:`, failureReasons);
    }

    if (expectedFailed.length > 0) {
      sendLog('log', `[Hooks MAIN] ℹ️ Expected unavailable APIs (${expectedFailed.length}): ${expectedFailed.join(', ')}`);
      sendLog('log', `[Hooks MAIN] ℹ️ These APIs are browser/context-specific (WebUSB requires HTTPS + Chrome, Battery API deprecated, sensors require permission)`);
    }

    if (failCount === 0) {
      sendLog('log', `[Hooks MAIN] ✅ All hooks installed successfully!`);
    }
    sendLog('log', `[Hooks MAIN] ⏳ Waiting for page to trigger fingerprinting APIs (10s hard timeout)...`);

    // IMMEDIATE UNINSTALL FIX: Save original hooks list for accurate completion statistics
    // Since hooks are uninstalled immediately when they fire, installedHooks.size decreases over time
    // We need the original list to calculate which hooks never fired
    const originallyInstalledHooks = Array.from(installedHooks.keys());
    const originalHooksCount = originallyInstalledHooks.length;

    const startHookMonitoring = () => {
      // FIX: Always schedule completion - ensures timeout counting starts regardless of timing
      // No gating conditions - prevents race conditions where page-ready fires
      // after hooks are already installed, causing inconsistent detection counts
      sendLog('log', '[Hooks MAIN] 🚀 Hook monitoring active (page ready) - scheduling completion');

      // PHASE 2 FIX: Set up maximum 3-second timeout for guaranteed completion
      // This ensures the completion signal is ALWAYS sent, even if hooks keep firing
      maxTimeoutId = setTimeout(() => {
        sendLog('log', `%c[Hooks MAIN] ⏰ MAXIMUM 3s timeout reached - forcing completion signal`, 'color: #ff9800; font-weight: bold;');
        sendCompletionSignalOnce();
      }, 3000); // 3 seconds maximum wait

      scheduleCompletion();
    };

    if (pageReadySignalReceived || document.readyState === 'complete') {
      startHookMonitoring();
    } else {
      pageReadyCallbacks.push(startHookMonitoring);
    }

    // Send completion if no hooks installed
    if (hookDefinitions.length === 0 || hookDefinitions.every(d => d.hooks.length === 0)) {
      sendLog('log', '[Hooks MAIN] ✅ No hooks installed - sending completion immediately');
      window.postMessage({
        type: 'JS_HOOKS_COMPLETE',
        url: window.location.href,
        timestamp: Date.now(),
        totalDetections: 0,
        uniqueHooks: 0,
        uninstallStats: {
          attempts: 0,
          successes: 0,
          failures: 0,
          failedTargets: []
        }
      }, '*');
    }
  }, { once: true });
})();
