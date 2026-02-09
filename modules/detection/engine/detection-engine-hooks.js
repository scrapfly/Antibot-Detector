/**
 * detection-engine-hooks.js - extracted helpers for DetectionEngineManager.
 * Loaded before detection-engine-manager.js in classic script mode.
 */

function demGenerateHookCode(detectors) {
    const hookDefinitions = [];

    // Extract JS hooks from fingerprint detectors
    if (detectors && detectors.fingerprint) {
        for (const [detectorId, detector] of Object.entries(detectors.fingerprint)) {
            if (detector.detection?.js_hooks && detector.detection.js_hooks.length > 0) {
                hookDefinitions.push({
                    id: detector.id || detectorId,
                    name: detector.name,
                    category: 'fingerprint',
                    hooks: detector.detection.js_hooks.filter(h => h.enabled !== false)
                });
            }
        }
    }

    // Generate hook installation code
    return `
(function() {
  'use strict';

  const hookDefinitions = ${JSON.stringify(hookDefinitions)};
  const triggeredHooks = new Set();
  let completionTimeout = null;
  let hooksEnabled = true;
  const COMPLETION_DELAY_MS = 2000;

  function scheduleCompletion() {
if (completionTimeout) clearTimeout(completionTimeout);
completionTimeout = setTimeout(() => {
  hooksEnabled = false;
  window.postMessage({
    type: 'JS_HOOKS_COMPLETE',
    url: window.location.href,
    timestamp: Date.now()
  }, '*');
  completionTimeout = null;
}, COMPLETION_DELAY_MS);
  }

  function reportHookDetection(detectorId, detectorName, category, hook) {
if (!hooksEnabled) return;
const detectionKey = \`\${detectorId}:\${hook.hook}\`;
if (triggeredHooks.has(detectionKey)) return;
triggeredHooks.add(detectionKey);

window.postMessage({
  type: 'JS_HOOK_DETECTION',
  detection: {
    detectorId: detectorId,
    detectorName: detectorName,
    category: category,
    hook: {
      target: hook.hook,
      confidence: hook.confidence,
      description: hook.description
    },
    timestamp: Date.now()
  },
  url: window.location.href
}, '*');

scheduleCompletion();
  }

  function installHook(detectorId, detectorName, category, hook) {
try {
  const parts = hook.hook.split('.');
  if (parts.length < 2) return;

  let obj = window;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj[parts[i]];
    if (!obj) return;
  }

  const propertyName = parts[parts.length - 1];
  const descriptor = Object.getOwnPropertyDescriptor(obj, propertyName);
  if (!descriptor) return;

  // Handle getter properties
  if (descriptor.get && !descriptor.value) {
    const originalGetter = descriptor.get;
    const stealthGetter = new Proxy(originalGetter, {
      apply: function(target, thisArg, argumentsList) {
        reportHookDetection(detectorId, detectorName, category, hook);
        return Reflect.apply(target, thisArg, argumentsList);
      },
      get: (target, prop) => prop === 'toString' ? originalGetter.toString.bind(originalGetter) : Reflect.get(target, prop),
      has: (target, prop) => Reflect.has(target, prop),
      getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(target, prop),
      ownKeys: (target) => Reflect.ownKeys(target)
    });

    try {
      Object.defineProperty(stealthGetter, 'name', {value: originalGetter.name, writable: false, enumerable: false, configurable: true});
      Object.defineProperty(stealthGetter, 'length', {value: originalGetter.length, writable: false, enumerable: false, configurable: true});
      Object.defineProperty(stealthGetter, 'toString', {value: function toString() {return originalGetter.toString.call(originalGetter);}, writable: true, enumerable: false, configurable: true});
    } catch (e) {
      // Expected: Some properties may not be configurable
      Logger.hooks('[Hook] Failed to define stealth getter properties:', e.message);
    }

    Object.defineProperty(obj, propertyName, {
      get: stealthGetter,
      set: descriptor.set,
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable
    });
  }
  // Handle regular methods
  else if (typeof descriptor.value === 'function') {
    const original = descriptor.value;
    const wrapper = new Proxy(original, {
      apply: function(target, thisArg, argumentsList) {
        reportHookDetection(detectorId, detectorName, category, hook);
        return Reflect.apply(target, thisArg, argumentsList);
      },
      has: (target, prop) => Reflect.has(target, prop),
      get: (target, prop) => prop === 'toString' ? original.toString.bind(original) : Reflect.get(target, prop),
      getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(target, prop),
      ownKeys: (target) => Reflect.ownKeys(target)
    });

    try {
      Object.defineProperty(wrapper, 'name', {value: original.name, writable: false, enumerable: false, configurable: true});
      Object.defineProperty(wrapper, 'length', {value: original.length, writable: false, enumerable: false, configurable: true});
      Object.defineProperty(wrapper, 'toString', {value: function toString() {return original.toString.call(original);}, writable: true, enumerable: false, configurable: true});
      if (original.prototype) Object.setPrototypeOf(wrapper, Object.getPrototypeOf(original));
    } catch (e) {
      // Expected: Some properties may not be configurable
      Logger.hooks('[Hook] Failed to define wrapper properties:', e.message);
    }

    Object.defineProperty(obj, propertyName, {
      value: wrapper,
      writable: descriptor.writable,
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable
    });
  }
} catch (error) {
  Logger.error('DETECTION', \`[Fingerprint Hook] Failed to install \${hook.hook}:\`, error);
}
  }

  // Install all hooks
  for (const detector of hookDefinitions) {
for (const hook of detector.hooks) {
  installHook(detector.id, detector.name, detector.category, hook);
}
  }

  // Send completion if no hooks installed
  if (hookDefinitions.length === 0 || hookDefinitions.every(d => d.hooks.length === 0)) {
window.postMessage({t: M.HC, u: window.location.href, ts: Date.now()}, '*');
  }
})();
`;
}


function demCreateHookBatcher(chrome) {
    // Adaptive batching for hook detections
    // Dynamically adjusts batch window based on detection frequency
    let hookBatch = [];
    let hookBatchTimeout = null;
    let lastBatchSize = 0;
    let lastBatchTime = Date.now();
    const HOOK_BATCH_DELAY_MIN = 10;  // 10ms when many hooks firing (busy)
    const HOOK_BATCH_DELAY_MAX = 50;  // 50ms when few hooks (idle)
    const HOOK_BATCH_MAX_SIZE = 20;   // Force flush at 20 hooks
    const HOOK_BATCH_EMERGENCY_SIZE = 50; // Drop oldest if exceeds 50 (safety guard)

    function getAdaptiveBatchDelay() {
        const timeSinceLastBatch = Date.now() - lastBatchTime;

        // If hooks firing rapidly (< 100ms between batches), use shorter delay
        if (timeSinceLastBatch < 100 && lastBatchSize > 5) {
            return HOOK_BATCH_DELAY_MIN;
        }

        // If hooks firing slowly, use longer delay to batch more
        if (timeSinceLastBatch > 500) {
            return HOOK_BATCH_DELAY_MAX;
        }

        // Interpolate between min and max based on batch size
        const sizeRatio = Math.min(lastBatchSize / 10, 1);
        return HOOK_BATCH_DELAY_MIN + (HOOK_BATCH_DELAY_MAX - HOOK_BATCH_DELAY_MIN) * (1 - sizeRatio);
    }

    function flushHookBatch() {
        if (hookBatch.length === 0) return;

        // Immediate flush on overflow to prevent memory leak
        if (hookBatch.length > HOOK_BATCH_EMERGENCY_SIZE) {
            Logger.warn('HOOKS', `Hook batch overflow (${hookBatch.length} hooks), forcing immediate flush`);
            // Clear existing timeout to prevent double flush
            if (hookBatchTimeout) {
                clearTimeout(hookBatchTimeout);
                hookBatchTimeout = null;
            }
        }

        if (!chrome.runtime?.id) {
            Logger.error('CONTENT', '[Content Script] Extension context invalidated, cannot forward hooks');
            hookBatch = [];
            return;
        }

        // Deduplicate hooks before sending (prevents duplicate detector entries)
        // Count occurrences by detector:hook combination (actual dedup key)
        const dedupeKeyCounts = new Map(); // "detectorId:hook" -> count
        for (const hookData of hookBatch) {
            const key = `${hookData.detection.detectorId}:${hookData.detection.hook.target}`;
            dedupeKeyCounts.set(key, (dedupeKeyCounts.get(key) || 0) + 1);
        }

        // Deduplicate: keep only first occurrence of each detector:hook combination
        const uniqueHooks = new Map();
        for (const hookData of hookBatch) {
            const key = `${hookData.detection.detectorId}:${hookData.detection.hook.target}`;
            if (!uniqueHooks.has(key)) {
                uniqueHooks.set(key, hookData);
            }
        }

        const deduplicatedHooks = Array.from(uniqueHooks.values());

        // Send batched detections (wrapped in try-catch for synchronous context invalidation errors)
        try {
            chrome.runtime.sendMessage({
                type: 'JS_HOOK_DETECTION_BATCH',
                detections: deduplicatedHooks,
                timestamp: Date.now()
            }).catch((error) => {
                const errorMsg = error?.message || '';

                // Service worker not available - don't log as error (expected on reload)
                if (errorMsg.includes('Could not establish connection') ||
                    errorMsg.includes('Receiving end does not exist')) {
                    // Silently ignore - expected on extension reload
                }
                // Context invalidation - this is expected when extension reloads
                else if (errorMsg.includes('Extension context invalidated')) {
                    // Silently ignore - expected on extension reload
                }
                // Other errors - log as warning
                else {
                    Logger.warn('CONTENT', '[Content Script] Failed to send hook batch:', error);
                }
            });
        } catch (e) {
            // Extension context invalidated synchronously - silently ignore
        }

        // Update batch stats for adaptive delay
        lastBatchSize = hookBatch.length;
        lastBatchTime = Date.now();

        hookBatch = [];
        hookBatchTimeout = null;
    }

    return {
        addHook: function(hookData) {
            // Add to batch
            hookBatch.push(hookData);

            // Force flush if batch is too large (prevents memory buildup)
            if (hookBatch.length >= HOOK_BATCH_MAX_SIZE) {
                if (hookBatchTimeout) {
                    clearTimeout(hookBatchTimeout);
                    hookBatchTimeout = null;
                }
                flushHookBatch();
            }
            // Schedule flush with adaptive delay if not already scheduled
            else if (!hookBatchTimeout) {
                const delay = getAdaptiveBatchDelay();
                hookBatchTimeout = setTimeout(flushHookBatch, delay);
            }
        },
        flush: flushHookBatch,
        getTimeout: function() {
            return hookBatchTimeout;
        },
        clearTimeout: function() {
            if (hookBatchTimeout) {
                clearTimeout(hookBatchTimeout);
                hookBatchTimeout = null;
            }
        }
    };
}


function demHandleHookMessage(event, chrome, hookBatcher) {
    // Only accept messages from same origin
    if (event.source !== window) return false;

    const data = event.data;

    // Forward logs from MAIN world to service worker via debug system
    if (data && data.type === 'MAIN_WORLD_LOG') {
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({
                type: 'DEBUG_LOG',
                context: 'MAIN_WORLD',
                level: data.level,
                args: data.args,
                timestamp: data.timestamp
            }).catch((error) => {
                // Expected: Background may not be ready
                Logger.hooks('[MAIN_WORLD] Failed to forward log to background:', error.message);
            });
        }
        return true;
    }

    // OPTIMIZED: Adaptive batch hook detections
    if (data && data.type === 'JS_HOOK_DETECTION') {
        // Defensive check - shouldn't happen if MAIN world is working correctly
        if (window.__scrapflyCacheHitEarlyExit) {
            Logger.warn('CONTENT', '[Content] Received hook detection despite cache hit flag - ignoring');
            return true;
        }

        // Debug log removed - already logged in service worker via message
        hookBatcher.addHook({
            detection: data.detection,
            url: data.url,
            timestamp: data.detection?.timestamp || Date.now()
        });
        return true;
    }

    // Check if this is window property detections from MAIN world
    if (data && data.type === 'WINDOW_DETECTIONS') {
        // Defensive check - shouldn't happen if MAIN world polling check is working correctly
        if (window.__scrapflyCacheHitEarlyExit) {
            Logger.warn('CONTENT', '[Content] Received window detections despite cache hit flag - ignoring');
            return true;
        }

        const detections = data.detections || [];
        Logger.detection(`[Content Script] Window detections received: ${detections.length} properties detected in ${data.elapsedMs || 0}ms`);

        // Check if extension context is still valid
        if (!chrome.runtime?.id) {
            Logger.error('CONTENT', '[Content Script] Extension context invalidated, cannot send window detections');
            return true;
        }

        // Forward window detections to background
        chrome.runtime.sendMessage({
            type: 'WINDOW_DETECTIONS',
            detections: detections,
            timestamp: data.timestamp,
            executionTime: data.elapsedMs
        }).then(() => {
            Logger.detection(`[Content Script] Window detections forwarded to background`);
        }).catch((error) => {
            Logger.error('CONTENT', '[Content Script] Failed to send window detections:', error);
        });
        return true;
    }

    // Check if this is window properties completion signal
    if (data && data.type === 'WINDOW_PROPS_COMPLETE') {
        // Debug logs removed - already logged in service worker via message

        // Use async function with retry logic (same as JS hooks)
        (async () => {
            const sendCompletion = async () => {
                const MAX_ATTEMPTS = 3;
                for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                    if (!chrome.runtime?.id) {
                        Logger.error('DETECTION', `[Content Script] Extension context invalidated (attempt ${attempt}) - window props completion not sent`);
                        await new Promise(resolve => setTimeout(resolve, attempt * 100));
                        continue;
                    }

                    try {
                        await chrome.runtime.sendMessage({
                            type: 'WINDOW_PROPS_COMPLETE',
                            url: data.url,
                            timestamp: data.timestamp,
                            detectedCount: data.detectedCount
                        });
                        Logger.detection(`[Content Script] Window properties completion signal sent successfully on attempt ${attempt}`);
                        return;
                    } catch (error) {
                        Logger.error('DETECTION', `[Content Script] Failed to send window props completion signal (attempt ${attempt}):`, error);
                        await new Promise(resolve => setTimeout(resolve, attempt * 100));
                    }
                }

                Logger.error('CONTENT', '[Content Script] Giving up on window props completion signal after repeated failures');
            };

            await sendCompletion();
        })();
        return true;
    }

    // Check if this is a JS hooks completion signal
    if (data && data.type === 'JS_HOOKS_COMPLETE') {
        // Debug logs removed - already logged in service worker via message

        // Wait for flush to complete before sending completion
        // This prevents race condition where background receives completion before all hook data
        (async () => {
            // Flush any pending batched hooks and wait
            if (hookBatcher.getTimeout()) {
                hookBatcher.clearTimeout();
                hookBatcher.flush();
                // Wait 50ms for flush message to be sent and processed
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Check if extension context is still valid
            const sendCompletion = async () => {
                const MAX_ATTEMPTS = 3;
                for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                    if (!chrome.runtime?.id) {
                        Logger.error('DETECTION', `[Content Script] Extension context invalidated (attempt ${attempt}) - completion not sent`);
                        await new Promise(resolve => setTimeout(resolve, attempt * 100));
                        continue;
                    }

                    try {
                        await chrome.runtime.sendMessage({
                            type: 'JS_HOOKS_COMPLETE',
                            url: data.url,
                            timestamp: data.timestamp,
                            totalDetections: data.totalDetections,
                            uniqueHooks: data.uniqueHooks,
                            completionReason: data.completionReason,
                            completionTime: data.completionTime,
                            uninstallStats: data.uninstallStats
                        });
                        Logger.detection(`[Content Script] Completion signal sent successfully on attempt ${attempt}`);
                        return;
                    } catch (error) {
                        Logger.error('DETECTION', `[Content Script] Failed to send completion signal (attempt ${attempt}):`, error);
                        await new Promise(resolve => setTimeout(resolve, attempt * 100));
                    }
                }

                Logger.error('CONTENT', '[Content Script] Giving up on completion signal after repeated failures');
            };

            await sendCompletion();
        })();
        return true;
    }

    return false;
}
