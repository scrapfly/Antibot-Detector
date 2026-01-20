/**
 * Content Script - MAIN World
 * Runs in the MAIN world (page's JavaScript context) to install fingerprinting hooks
 * Receives hook definitions from content.js (ISOLATED world) via CustomEvent
 *
 * VERSION: 2.3.0-NEVER-FAIL (2026-01-17)
 * - Integrated HookResilienceManager for robust hook installation
 * - Added try-catch around ALL hook installations with error reporting
 * - Integrated WindowPropertyTracker for adaptive 60s polling
 * - Multi-layer timeout system for guaranteed completion
 */

(function() {
  'use strict';

  let debugMode = false; // Will be set by ISOLATED world

  // Centralized configuration (7.7 - removes magic numbers)
  // VERSION 2.3.0: Extended timeouts for "never fail" reliability
  const HOOKS_CONFIG = Object.freeze({
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

  // Global error handler: Prevent hook errors from breaking page
  window.addEventListener('error', (event) => {
    if (event.filename && event.filename.includes('content-main-world')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

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

  // Use config for timeout values
  const HOOKS_HARD_TIMEOUT_MS = HOOKS_CONFIG.ACTIVITY_TIMEOUT_MS;

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
    // Clear installed hooks
    installedHooks.clear();

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
    'exists': (v) => v !== undefined,  // Used by UI - same as '!== undefined'
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
    if (shouldSkipDueToCacheHit()) {
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

  // Store fingerprint enabled state globally (will be updated when event arrives)
  window.__scrapflyFingerprintEnabled = true;

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

    // Handle JS API events from ISOLATED world - dispatch CustomEvent to page
    // This bridges the ISOLATED/MAIN world gap so page scripts can receive events
    if (data && data.type === 'SCRAPFLY_JS_API_EVENT') {
      try {
        const eventName = data.eventName;
        const eventDetail = data.detail;
        const fullEventName = `scrapfly:${eventName}`;

        // Store last detection data on window for pages that load after event
        // This allows: const data = window.__scrapflyLastDetection;
        if (eventName === 'onDetection') {
          window.__scrapflyLastDetection = eventDetail;
        }

        // Method 1: Dispatch CustomEvent to page window (MAIN world)
        const event = new CustomEvent(fullEventName, {
          detail: eventDetail,
          bubbles: true,
          cancelable: false
        });
        window.dispatchEvent(event);
        sendLog('log', `[MAIN WORLD] 📡 Dispatched JS API event: ${fullEventName}`);

        // Method 2: Call callback function if defined (for early setup)
        // Page can do: window.onDetection = (data) => console.log(data);
        // eventName is already like 'onDetection', so use it directly
        if (typeof window[eventName] === 'function') {
          try {
            window[eventName](eventDetail);
            sendLog('log', `[MAIN WORLD] 📡 Called callback: window.${eventName}()`);
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
    const eventReceivedTime = performance.now();

    // Reset module state for SPA navigation (prevents memory leaks)
    resetModuleState();

    // Set debugMode first, before any logging
    debugMode = event.detail?.debugMode || false; // Receive debug mode from ISOLATED world

    // Handle fingerprintEnabled flag from event
    // This is the authoritative value from ISOLATED world (updated from storage)
    const fingerprintEnabled = event.detail?.fingerprintEnabled !== false;

    // Update global flag with authoritative value
    window.__scrapflyFingerprintEnabled = fingerprintEnabled;

    sendLog('log', '[MAIN WORLD] 🎯 scrapfly-install-hooks event received!', {
      hasDetail: !!event.detail,
      hookDefinitionsCount: event.detail?.hookDefinitions?.length,
      windowPropertiesCount: event.detail?.windowProperties?.length,
      debugMode: debugMode,
      fingerprintEnabled: fingerprintEnabled
    });

    const hookDefinitions = event.detail?.hookDefinitions || [];
    const windowProperties = event.detail?.windowProperties || [];

    sendLog('log', `[Hooks MAIN] Received ${hookDefinitions.length} detectors and ${windowProperties.length} window property checks`);

    // VERSION 2.3.0: Set expected targets in HookResilienceManager
    const resilienceManager = window.__HookResilienceManager;
    if (resilienceManager) {
      resilienceManager.setExpectedTargets(hookDefinitions);
      sendLog('log', `[HookResilienceManager] Set ${resilienceManager.expectedTargets.size} expected targets from detector definitions`);
    }
    sendLog('log', '[MAIN WORLD] 📋 Window properties to check:', windowProperties.map(p => p.path));

    // Check window properties with WindowPropertyTracker (VERSION 2.3.0)
    if (windowProperties.length > 0) {
      sendLog('log', `[Window Props] ⏳ Starting WindowPropertyTracker for ${windowProperties.length} properties...`);

      // VERSION 2.3.0: Use WindowPropertyTracker for adaptive 60s polling
      const startWindowChecksWithTracker = () => {
        // Check cache flag before starting
        if (shouldSkipDueToCacheHit()) {
          sendLog('log', '[Window Props] ⏭️ Cache hit - skipping window property checks');
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
              sendLog('log', `[Window Props] 📊 WindowPropertyTracker complete: ${result.detectedCount}/${result.totalChecked} in ${result.elapsedMs}ms (${result.reason})`);
              // WINDOW_PROPS_COMPLETE is sent by the tracker itself
            }
          });

          // Start adaptive polling (4 phases: EARLY 100ms → NORMAL 200ms → LATE 500ms → FINAL 1000ms)
          tracker.startPolling();
          sendLog('log', '[Window Props] 🔍 WindowPropertyTracker started with adaptive 60s polling');
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
        const MAX_WINDOW_MS = HOOKS_CONFIG.DEFAULT_MAX_WINDOW_MS;
        let pollCount = 0;
        let checksWithoutNew = 0;

        const poll = () => {
          pollCount++;
          const elapsed = Date.now() - startTime;

          if (elapsed >= MAX_WINDOW_MS || checksWithoutNew >= HOOKS_CONFIG.SETTLED_CHECKS) {
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
          setTimeout(poll, HOOKS_CONFIG.POLL_INTERVAL_MS);
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
      sendLog('log', `[Hooks MAIN] 🏁 Detection complete (${reason}) - ${triggeredHooks.size} hooks in ${elapsed}ms`);

      // Cleanup: uninstall any remaining hooks (only needed for timeout completions)
      if (reason !== 'no_hooks' && reason !== 'cache_hit') {
        // Show summary
        sendLog('log', `[Hooks MAIN] 📊 DETECTION SUMMARY:`);
        sendLog('log', `[Hooks MAIN]    ✅ Hooks that FIRED: ${triggeredHooks.size}/${originalHooksCount || 0}`);

        if (triggeredHooks.size > 0) {
          const firedHooksList = Array.from(triggeredHooks).map(key => key.split(':')[1]).sort();
          sendLog('log', `[Hooks MAIN]    📝 Fired hooks:`, firedHooksList);
        }

        // Uninstall remaining unfired hooks
        if (installedHooks.size > 0) {
          // Log unfired hooks BEFORE uninstalling (for debugging)
          const unfiredHooks = Array.from(installedHooks.keys()).sort();
          sendLog('log', `[Hooks MAIN]    ⏳ Hooks that NEVER FIRED: ${installedHooks.size}`);
          sendLog('log', `[Hooks MAIN]    📝 Unfired hooks:`, unfiredHooks);
          sendLog('log', `[Hooks MAIN] 🧹 Uninstalling ${installedHooks.size} remaining unfired hooks...`);
          const bulkUninstallStats = uninstallAllRemainingHooks();
          uninstallStats.attempts += bulkUninstallStats.total;
          uninstallStats.successes += bulkUninstallStats.successes;
          uninstallStats.failures += bulkUninstallStats.failures;
          uninstallStats.failedTargets.push(...bulkUninstallStats.failedTargets);
        }

        // Log final stats
        if (uninstallStats.attempts > 0) {
          sendLog('log', `[Hooks MAIN] 📊 Final: ${uninstallStats.successes}/${uninstallStats.attempts} uninstalled (${uninstallStats.failures} failed)`);
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
     * Schedule completion after activity timeout (2s of inactivity)
     * Resets on each hook detection
     */
    function scheduleCompletion() {
      if (completionTimeout) clearTimeout(completionTimeout);
      completionTimeout = setTimeout(() => {
        completeDetection('activity_timeout');
      }, HOOKS_HARD_TIMEOUT_MS);
    }

    function reportHookDetection(detectorId, detectorName, category, hook) {
      // FIX: Check sessionStorage on EVERY hook call (not just at module load)
      // This catches cache hits that occur AFTER MAIN world module loads
      // sessionStorage is shared between ISOLATED and MAIN worlds
      try {
        const cacheKey = `scrapfly_cache_${window.location.hostname}`;
        const cachedData = sessionStorage.getItem(cacheKey);
        if (cachedData) {
          const cacheInfo = JSON.parse(cachedData);
          if (Date.now() - cacheInfo.timestamp < 12 * 60 * 60 * 1000) {
            sendLog('log', `[Hooks MAIN] ⏭️ Cache hit detected (sessionStorage) - skipping hook report`);
            return; // Cache hit - don't report this hook
          }
        }
      } catch (e) {
        // sessionStorage not available or parse error - continue normally
      }

      // Backup check: module-level flag (set at load time or via postMessage)
      if (shouldSkipDueToCacheHit()) {
        return;
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
        try {
          callback();
        } catch (e) {
          // Silently fail - detection error shouldn't break page API
        }
        // FIX: Use natural 'this' binding for prototype methods
        // For methods like getBattery(), enumerateDevices(), etc., 'this' must be the actual instance
        // explicitContext is ONLY used for special cases where we need to validate the context type
        // (like addEventListener where we check if context is Window/Document/etc for event filtering)
        // For most hooks, explicitContext is null and we rely entirely on natural binding
        try {
          return Reflect.apply(original, this, args);
        } catch (e) {
          // Re-throw with better context - "Illegal invocation" means 'this' context is wrong
          // This happens when page code destructures methods: const { getBattery } = navigator; getBattery()
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
      // VERSION 2.3.0: Enhanced with HookResilienceManager integration
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
          existingHook.detectors.set(detectorId, { detectorName, category });
          return existingHook;
        }

        // Resolve windowPath if provided in JSON (e.g., "navigator" for Navigator.prototype.getBattery)
        let explicitContext = null;
        if (hook.windowPath) {
          const pathParts = hook.windowPath.split('.');
          explicitContext = pathParts.reduce((parent, part) => parent?.[part], window);
          if (!explicitContext) {
            sendLog('warn', `[Hooks] Failed to resolve windowPath "${hook.windowPath}" for ${hook.target}`);
            if (resilienceManager) {
              resilienceManager.registerHookFailure(hook.target, 'WINDOW_PATH_NOT_FOUND');
            }
            return false;
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
        let wrapperDescriptor = null;
        if (originalDescriptor.get && !originalDescriptor.value) {
          const stealthGetter = createStealthWrapper(originalDescriptor.get, reportCallback, explicitContext, true);

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
          const wrapper = createStealthWrapper(originalDescriptor.value, reportCallback, explicitContext, false);

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

        // VERSION 2.3.0: Register successful installation with HookResilienceManager
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
    sendLog('log', `[Hooks MAIN] ⏳ Waiting for page to trigger fingerprinting APIs (8s max, 2s inactivity timeout)...`);

    // IMMEDIATE UNINSTALL FIX: Save original hooks list for accurate completion statistics
    // Since hooks are uninstalled immediately when they fire, installedHooks.size decreases over time
    // We need the original list to calculate which hooks never fired
    const originallyInstalledHooks = Array.from(installedHooks.keys());
    const originalHooksCount = originallyInstalledHooks.length;

    const startHookMonitoring = () => {
      sendLog('log', '[Hooks MAIN] 🚀 Hook monitoring active - scheduling completion');

      // Maximum timeout for guaranteed completion (even if hooks keep firing)
      maxTimeoutId = setTimeout(() => {
        completeDetection('max_timeout');
      }, HOOKS_CONFIG.MAX_DETECTION_MS);

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
