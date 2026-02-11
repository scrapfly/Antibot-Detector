/**
 * Content Script (ISOLATED World)
 * Collects page data and sends it for analysis
 *
 * ============================================================================
 * DETECTION SYSTEM - PHASE 3 & 4: BATCHING & COMPLETION
 * ============================================================================
 *
 * This file implements Phase 3 & 4 of the detection flow:
 *
 * Phase 3: Batching & Deduplication (10-50ms batches)
 * ────────────────────────────────────────────────────
 * 1. Listens for postMessage() events from MAIN world (content-main-world.js)
 * 2. Each event contains a hook detection: detectorId, detectorName, target API
 * 3. Adds to hookBatcher queue
 * 4. Deduplicates by "detectorId:target" key:
 *    - Same detector firing on same API multiple times = 1 entry
 *    - Different detector on same API = separate entries (no collision!)
 * 5. Sends batches to background.js via chrome.runtime.sendMessage()
 *
 * Example deduplication:
 * ───────────────────
 * Input (from MAIN world):
 *   1. performance-fingerprint:Performance.prototype.now
 *   2. performance-fingerprint:Performance.prototype.now (REPEAT - ignored)
 *   3. performance-fingerprint:Performance.prototype.memory
 *   4. inline-hook-performance-prototype-now:Performance.prototype.now (NEW ID)
 *
 * After dedup:
 *   - performance-fingerprint:Performance.prototype.now (kept 1st, ignored 2nd repeat)
 *   - performance-fingerprint:Performance.prototype.memory (kept - different target)
 *   - inline-hook-performance-prototype-now:Performance.prototype.now (kept - different ID!)
 *
 * Result: 3 entries sent, 1 duplicate removed
 *
 * Phase 4: Completion Tracking (Entire duration)
 * ──────────────────────────────────────────────
 * 1. Content-main-world.js schedules 2-second completion timeout
 * 2. On each hook detection (new or duplicate), timeout resets to 2 seconds
 * 3. Completes when 2 seconds pass with NO hook activity (any type)
 * 4. Sends JS_HOOKS_COMPLETE signal to background.js with timing data
 *
 * Why this works:
 * ───────────────
 * - Simple, proven system: "No activity for 2 seconds = detection complete"
 * - Resets on ANY hook detection (even duplicates) - ensures completion
 * - Never gets stuck (always completes after 2s of silence)
 * - Deduplication still happens (at MAIN world and batching layer)
 *
 * ============================================================================
 * CRITICAL TIMING CONSTRAINTS
 * ============================================================================
 *
 * document_start (0ms)
 *   ↓
 *   ├─ content-main-world.js loads (MAIN world)
 *   ├─ content.js loads (ISOLATED world)
 *   └─ 18 inline hooks install synchronously
 *
 * ~30ms: First page script executes
 *   ├─ Hooks already installed ✓
 *   └─ Can't save native API references (they're hooked!)
 *
 * ~5-500ms: Hook detections flow in
 *   ├─ Batched every 10-50ms (adaptive)
 *   ├─ Each batch deduplicated
 *   └─ Sent to background
 *
 * ~500-8000ms: Lazy-loaded scripts execute
 *   ├─ More hook detections possible
 *   ├─ Completion tracker monitoring
 *   └─ Settles when no new detectors for 1.5s
 *
 * <8000ms: Detection complete
 *   └─ background.js logs final stats
 *
 * ============================================================================
 */

// Global variables - use var to allow redeclaration during extension reloads
var detectionEngine = detectionEngine || null;
var hasCleanedUp = hasCleanedUp || false;
var contextCheckFailures = contextCheckFailures || 0;
var contextCheckInterval = contextCheckInterval || null; // Interval for context validity checks
var detectionFinalized = detectionFinalized || false; // Flag to suppress late events after onDetection


/**
 * Get the cache key for the current hostname
 * @returns {string} Cache key in format "scrapfly_cache_{hostname}"
 */
function getCacheKey() {
    return `scrapfly_cache_${window.location.hostname}`;
}

/**
 * Install JS Hooks early (at document_start)
 * Delegates to DetectionEngineManager.installHooksOrchestrator()
 */
async function installJSHooks() {
    return DetectionEngineManager.installHooksOrchestrator(window, chrome);
}

/**
 * Check if extension context is still valid
 * Delegates to Utils.isExtensionContextValid()
 */
function isExtensionContextValid() {
    if (typeof Utils === 'undefined') {
        if (typeof Logger !== 'undefined') {
            Logger.warn('CONTENT', 'Utils not loaded yet');
        }
        return false;
    }
    return Utils.isExtensionContextValid();
}

/**
 * Clean up when extension context is invalidated
 * Delegates to Utils.cleanupOrphanedScript()
 */
function cleanupOrphanedScript() {
    if (typeof Utils === 'undefined') {
        if (typeof Logger !== 'undefined') {
            Logger.warn('CONTENT', 'Utils not loaded, skipping cleanup');
        }
        return;
    }
    return Utils.cleanupOrphanedScript({
        hasCleanedUp: hasCleanedUp,
        contextCheckInterval: contextCheckInterval,
        notifyPageLoad: notifyPageLoad,
        detectionEngine: detectionEngine
    });
}

/**
 * Safely send message to background with context check
 * @param {Object} message - Message to send
 * @returns {Promise} Response or null if context invalid
 */
async function safeSendMessage(message) {
    if (!isExtensionContextValid()) {
        Logger.content('Context invalid, skipping message', { type: message.type });
        return null;
    }
    
    try {
        return await chrome.runtime.sendMessage(message);
    } catch (error) {
        if (error.message?.includes('Extension context invalidated')) {
            cleanupOrphanedScript();
            return null;
        }
        throw error;
    }
}

/**
 * Dispatch JS API event to page window
 * Delegates to Settings.dispatchJsApiEvent()
 */
async function dispatchJsApiEvent(eventName, data = {}) {
    return Settings.dispatchJsApiEvent(eventName, data);
}

/**
 * Dispatch ready event
 * Delegates to Settings.dispatchReadyEvent()
 */
async function dispatchReadyEvent() {
    await Settings.dispatchReadyEvent();
}

/**
 * Notify background about page load (cache check first)
 * Delegates to Utils.notifyPageLoad()
 * @param {string} triggerSource - What triggered this notification (page_load, visibility_change, url_change, manual)
 */
async function notifyPageLoad(triggerSource = 'page_load') {
    if (typeof Utils === 'undefined') {
        if (typeof Logger !== 'undefined') {
            Logger.warn('CONTENT', 'Utils not loaded, skipping page load notification');
        }
        return;
    }
    return Utils.notifyPageLoad({
        detectionEngine: detectionEngine,
        isExtensionContextValid: isExtensionContextValid,
        cleanupOrphanedScript: cleanupOrphanedScript,
        triggerSource: triggerSource
    });
}

/**
 * Collect page data and send to background (called when cache miss)
 * Delegates to Utils.collectAndSendData()
 */
async function collectAndSendData() {
    Logger.debug('CONTENT', 'collectAndSendData() called');
    if (typeof Utils === 'undefined') {
        if (typeof Logger !== 'undefined') {
            Logger.debug('CONTENT', 'Utils not loaded, skipping data collection');
        }
        return;
    }
    Logger.debug('CONTENT', 'Calling Utils.collectAndSendData()...');
    return Utils.collectAndSendData({
        detectionEngine: detectionEngine,
        isExtensionContextValid: isExtensionContextValid,
        cleanupOrphanedScript: cleanupOrphanedScript
    });
}

/**
 * Setup detection triggers
 * OPTIMIZED 2.3: Consolidated event listeners with debouncing
 */
function setupDetectionTriggers() {
    Logger.content('Setting up detection triggers...');

    // Notify page load AFTER all resources load (background checks cache first)
    // Use 'load' event instead of 'DOMContentLoaded' to ensure async scripts (like reCAPTCHA) are loaded
    if (document.readyState === 'complete') {
        // Page already fully loaded, notify immediately
        setTimeout(notifyPageLoad, 100);
    } else {
        // Wait for all external resources to load
        window.addEventListener('load', () => {
            // Add small delay to ensure scripts have executed
            setTimeout(notifyPageLoad, 200);
        }, { once: true });
    }

    // FIX: Removed visibility/focus event listeners that triggered data collection on popup open/tab switch
    // Detection should ONLY run on page load, not when popup opens or tabs switch

    // OPTIMIZED: Debounced URL change detection for SPAs
    let lastUrl = location.href;
    let urlChangeTimeout = null;
    const observer = new MutationObserver(() => {
        if (hasCleanedUp) return;

        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;

            // Debounce URL changes (prevent rapid notifications from SPA frameworks)
            // Reduced from 500ms to 100ms for faster SPA detection (utils.js has 2000ms debounce)
            if (urlChangeTimeout) clearTimeout(urlChangeTimeout);
            urlChangeTimeout = setTimeout(() => {
                Logger.content('URL changed, notifying with url_change trigger...');
                notifyPageLoad('url_change');
                urlChangeTimeout = null;
            }, 100);
        }
    });

    // Start observing URL changes (wait for body to exist since we run at document_start)
    if (document.body) {
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    } else {
        // Wait for body to be available (with safety timeout)
        let checkCount = 0;
        const maxChecks = 500; // 5 seconds max (500 * 10ms)
        const checkBody = setInterval(() => {
            checkCount++;
            if (document.body) {
                clearInterval(checkBody);
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            } else if (checkCount >= maxChecks) {
                clearInterval(checkBody);
                Logger.warn('CONTENT', 'Timeout waiting for document.body');
            }
        }, 10);
    }

    // Listen for messages from background script
    if (isExtensionContextValid()) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            // Check if context is still valid
            if (!isExtensionContextValid()) {
                Logger.content('Extension context invalidated, cannot respond to message');
                return false;
            }

            Logger.content('Received message', { type: request.type });

            if (request.type === 'REQUEST_PAGE_DATA') {
                // Background requests data collection (cache miss)
                Logger.content('REQUEST_PAGE_DATA received - starting collection');

                // JS API: Notify page that detection is starting (cache miss)
                dispatchJsApiEvent('onStart', {
                    url: window.location.href,
                    trigger: 'cache_miss',
                    timestamp: new Date().toISOString()
                }).catch(() => {});

                // Clear sessionStorage cache flag since background detected a cache miss
                try {
                    sessionStorage.removeItem(getCacheKey());
                    Logger.cache('Cleared sessionStorage cache flag due to REQUEST_PAGE_DATA (cache miss)');
                } catch (e) {
                    // SessionStorage might not be available, continue normally
                }

                // BULLETPROOF: Ensure Utils is loaded before calling collectAndSendData
                if (typeof Utils === 'undefined') {
                    Logger.debug('CONTENT', 'Utils not loaded yet, will retry in 500ms');
                    Logger.error('CONTENT', 'Utils not loaded yet, waiting and retrying...');
                    // Retry after Utils loads
                    setTimeout(() => {
                        if (typeof Utils !== 'undefined') {
                            Logger.content('Utils now loaded, collecting data...');
                            collectAndSendData();
                        } else {
                            Logger.debug('CONTENT', 'Utils still not loaded after retry, collection failed');
                            Logger.error('CONTENT', 'Utils still not loaded, collection failed');
                        }
                    }, 500);
                } else {
                    Logger.debug('CONTENT', 'Utils already loaded, calling collectAndSendData() immediately');
                    collectAndSendData();
                }

                sendResponse({ status: 'collecting_data' });
            } else if (request.type === 'RUN_DETECTION') {
                // Manual detection request from popup (force bypass cache)
                Logger.content('RUN_DETECTION received - starting manual detection');

                // JS API: Notify page that detection is starting (manual trigger)
                dispatchJsApiEvent('onStart', {
                    url: window.location.href,
                    trigger: 'manual',
                    timestamp: new Date().toISOString()
                }).catch(() => {});

                // Clear sessionStorage cache flag since this is manual detection (bypasses cache)
                try {
                    sessionStorage.removeItem(getCacheKey());
                    Logger.cache('Cleared sessionStorage cache flag for manual detection');
                } catch (e) {
                    // SessionStorage might not be available, continue normally
                }

                // BULLETPROOF: Ensure Utils is loaded before calling collectAndSendData
                if (typeof Utils === 'undefined') {
                    Logger.error('CONTENT', 'Utils not loaded yet, waiting and retrying...');
                    // Retry after Utils loads
                    setTimeout(() => {
                        if (typeof Utils !== 'undefined') {
                            Logger.content('Utils now loaded, collecting data...');
                            collectAndSendData();
                        } else {
                            Logger.error('CONTENT', 'Utils still not loaded, detection failed');
                        }
                    }, 500);
                } else {
                    collectAndSendData();
                }

                sendResponse({ status: 'detection_started' });
            } else if (request.type === 'GET_DETECTION_STATUS') {
                // Return current detection status
                sendResponse({
                    status: 'active',
                    lastDetection: detectionEngine ? detectionEngine.lastDetectionTime : null,
                    hasData: detectionEngine ? detectionEngine.detectionData !== null : false
                });
            } else if (request.type === 'DETECTION_COMPLETE') {
                // Detection completed - dispatch JS API event
                detectionFinalized = true;
                Logger.content('[Content] Received DETECTION_COMPLETE from background', {
                    url: request.url,
                    detectionCount: request.detectionCount
                });
                dispatchJsApiEvent('onDetection', {
                    url: request.url || window.location.href,
                    detections: request.detections || [],
                    detectionCount: request.detectionCount || 0,
                    timestamp: request.timestamp || new Date().toISOString(),
                    fromCache: request.fromCache === true,
                    cacheScope: request.cacheScope
                }).then(() => {
                    Logger.content('[Content] dispatchJsApiEvent completed successfully');
                }).catch(e => Logger.error('CONTENT', 'Failed to dispatch detection event', e));

                // Stop window property polling - detection is finalized, late results won't update anything
                window.postMessage({ type: 'STOP_WINDOW_POLLING', reason: 'detection_complete' }, '*');

                // FIX: Save to sessionStorage so NEXT visit skips hooks immediately
                // Previously sessionStorage was only saved on cache HIT (visit 2), not after detection (visit 1)
                // This caused visit 2 to re-run hooks before async cache check returned
                try {
                    const cacheData = {
                        timestamp: Date.now(),
                        detectionCount: request.detectionCount || 0,
                        url: window.location.href
                    };
                    sessionStorage.setItem(getCacheKey(), JSON.stringify(cacheData));
                    Logger.cache('Saved sessionStorage after detection complete (for next visit)');
                } catch (e) {
                    // sessionStorage not available
                }

                sendResponse({ status: 'event_dispatched' });
            } else if (request.type === 'DETECTION_PROGRESS') {
                // Detection progress updates (method-level)
                const progress = request.progress || {};
                dispatchJsApiEvent('onProgress', {
                    url: window.location.href,
                    method: progress.method,
                    completedMethods: Array.isArray(progress.completedMethods) ? progress.completedMethods : [],
                    message: progress.message,
                    timestamp: new Date().toISOString()
                }).catch(() => {});

                sendResponse({ status: 'progress_event_dispatched' });
            } else if (request.type === 'DETECTION_ERROR') {
                // Detection error - dispatch JS API error event
                dispatchJsApiEvent('onError', {
                    url: request.url || window.location.href,
                    error: request.error || 'Unknown error',
                    timestamp: request.timestamp || new Date().toISOString()
                }).catch(e => Logger.error('CONTENT', 'Failed to dispatch error event', e));
                sendResponse({ status: 'error_event_dispatched' });
            } else if (request.type === 'UPDATE_CAPTURE_STEP') {
                const notif = document.getElementById('scrapfly-capture-notification');
                if (notif) {
                    notif.innerHTML = `
                        <style>
                            @keyframes slideIn {
                                from { transform: translateX(400px); opacity: 0; }
                                to { transform: translateX(0); opacity: 1; }
                            }
                        </style>
                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                            reCAPTCHA Capture - Step ${request.step}
                        </div>
                        <div style="opacity: 0.9;">
                            ${request.message}
                        </div>
                        <div id="scrapfly-timer" style="margin-top: 12px; font-size: 12px; opacity: 0.8; font-weight: 600;">
                            Capturing...
                        </div>
                    `;
                }
                sendResponse({ status: 'updated' });
            } else if (request.type === 'CACHE_HIT_DISABLE_MONITORING') {
                // Cache hit - disable hooks and window properties monitoring
                window.postMessage({
                    type: 'DISABLE_MONITORING',
                    reason: 'cache_hit',
                    url: request.url
                }, '*');
                sendResponse({ status: 'disabled' });
            } else if (request.type === 'CLEAR_SESSION_CACHE') {
                // Clear sessionStorage cache flag when cache is manually cleared
                try {
                    sessionStorage.removeItem(getCacheKey());
                    Logger.cache('Cleared sessionStorage cache flag due to manual cache clear');
                    sendResponse({ status: 'cleared' });
                } catch (e) {
                    Logger.error('CACHE', 'Could not clear sessionStorage', e);
                    sendResponse({ status: 'error', error: e.message });
                }
            }

            // Return true to indicate async response
            return true;
        });
    }

    Logger.content('Detection triggers setup complete');
}

/**
 * Initialize content script
 */
async function initialize() {
    Logger.content('Initializing on', { url: window.location.href });

    // CHECK CONTEXT FIRST - before any operations
    if (!isExtensionContextValid()) {
        Logger.content('Extension context not valid, cleaning up');
        cleanupOrphanedScript();
        return; // Exit early
    }

    // Don't run on extension pages or chrome:// URLs
    if (!Utils.isValidContentScriptUrl(window.location.href)) {
        Logger.content('Skipping initialization on browser page');
        return;
    }

    // Check if extension is enabled
    try {
        const result = await chrome.storage.local.get(['scrapfly_enabled']);
        if (result.scrapfly_enabled === false) {
            Logger.content('Extension is disabled, skipping initialization');
            return;
        }
    } catch (error) {
        Logger.error('CONTENT', 'Failed to check enabled state', error);
        // Continue with initialization on error (fail-safe)
    }

    // Initialize the detection engine
    if (!detectionEngine) {
        detectionEngine = new DetectionEngineManager();
    }

    // Load detectors from background for smart data collection (Phase C.1 optimization)
    // Add retry logic to handle cases where background script isn't ready yet
    let detectorsLoaded = false;
    let retryCount = 0;
    const maxRetries = 3;
    let retryDelay = 500; // Start with 500ms, exponential backoff to 1s

    while (!detectorsLoaded && retryCount < maxRetries) {
        // CHECK CONTEXT BEFORE EACH ATTEMPT
        if (!isExtensionContextValid()) {
            Logger.content('Extension context lost during detector loading');
            cleanupOrphanedScript();
            return; // Exit initialization
        }

        try {
            const detectorsResponse = await safeSendMessage({ type: 'GET_DETECTORS' });

            if (!detectorsResponse) {
                // Context invalid, already handled by safeSendMessage
                return;
            }

            if (detectorsResponse && detectorsResponse.detectors) {
                // Count total detectors received
                const detectorCount = Object.values(detectorsResponse.detectors)
                    .reduce((sum, category) => sum + Object.keys(category).length, 0);

                if (detectorCount > 0) {
                    // FIX: Only log success, not every attempt
                    Logger.content(`Detectors loaded - smart data collection enabled (${detectorCount} detectors)`);

                    // Set detectors in detection engine to enable smart data collection
                    detectionEngine.setDetectors(detectorsResponse.detectors);

                    detectorsLoaded = true;
                } else {
                    retryCount++;

                    if (retryCount < maxRetries) {
                        // FIX: Silent retry - only log if final failure
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        // Exponential backoff: 500ms → 1000ms
                        retryDelay = Math.min(retryDelay * 2, 1000);
                    }
                }
            } else {
                retryCount++;

                if (retryCount < maxRetries) {
                    // FIX: Silent retry - only log if final failure
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    // Exponential backoff: 500ms → 1000ms
                    retryDelay = Math.min(retryDelay * 2, 1000);
                }
            }
        } catch (error) {
            // Only log non-context errors
            if (!error.message?.includes('Extension context invalidated')) {
                retryCount++;

                if (retryCount < maxRetries) {
                    // FIX: Silent retry - only log if final failure
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    // Exponential backoff: 500ms → 1000ms
                    retryDelay = Math.min(retryDelay * 2, 1000);
                }
            } else {
                return; // Context invalid, stop trying
            }
        }
    }

    if (!detectorsLoaded) {
        Logger.warn('CONTENT', 'Failed to load detectors after all retries, will collect all data types as fallback');
    }

    // Note: JS hooks are installed by install-hooks.js at document_start (before this script runs)

    // Early cache check - skip all detection work if cached
    Logger.cache('Checking cache before starting detection work...');
    try {
        const cacheCheckResponse = await chrome.runtime.sendMessage({
            type: 'CHECK_CACHE_EARLY',
            url: window.location.href
        });

        if (cacheCheckResponse?.cacheHit) {
            Logger.cache('CACHE HIT - skipping all detection work, returning cached detections immediately');

            // Set flag to prevent hook installation (ISOLATED world)
            window.__scrapflyCacheHitEarlyExit = true;

            // CRITICAL: Notify MAIN world about cache hit so hooks stop firing
            window.postMessage({
                type: 'SCRAPFLY_CACHE_HIT',
                timestamp: Date.now()
            }, '*');

            // JS API: Still dispatch "ready" so page scripts can reliably initialize listeners
            // even when we exit early due to cache hit.
            await dispatchReadyEvent();

            // JS API: Dispatch detection event immediately with cached data
            const cachedData = cacheCheckResponse.detectionData;
            if (cachedData) {
                Logger.cache('Dispatching JS API event with cached detection data');
                dispatchJsApiEvent('onDetection', {
                    url: window.location.href,
                    detections: cachedData.detectionResults || [],
                    detectionCount: cachedData.detectionCount || 0,
                    timestamp: cachedData.timestamp || new Date().toISOString(),
                    fromCache: true
                }).catch(e => Logger.error('CONTENT', 'Failed to dispatch cached detection event', e));
            }

            // Store cache status in sessionStorage for synchronous check on next page load
            try {
                const cacheData = {
                    timestamp: Date.now(),
                    detectionCount: cacheCheckResponse.detectionData?.detectionCount || 0,
                    url: window.location.href
                };
                sessionStorage.setItem(getCacheKey(), JSON.stringify(cacheData));
                Logger.cache('Saved cache status to sessionStorage for future synchronous checks');
            } catch (e) {
                // SessionStorage might not be available, continue normally
                Logger.cache('Could not save to sessionStorage', { error: e.message });
            }

            // Notify background about early cache exit AND send cached detection data
            // This ensures the badge is updated with detection count immediately
            try {
                chrome.runtime.sendMessage({
                    type: 'CACHE_HIT_EARLY_EXIT',
                    url: window.location.href,
                    detectionData: cacheCheckResponse.detectionData  // Include cached data for badge update
                }).catch(() => {});
            } catch (e) {
                // Extension context invalidated - silently ignore
            }

            // Exit initialization - don't setup triggers, don't install anything
            Logger.cache('Content script initialization complete (cache hit path)');
            return;
        } else {
            Logger.cache('CACHE MISS - proceeding with full detection');

            // Clear any stale sessionStorage cache flag since we have a cache miss
            try {
                sessionStorage.removeItem(getCacheKey());
                Logger.cache('Cleared sessionStorage cache flag due to cache miss');
            } catch (e) {
                // SessionStorage might not be available, continue normally
            }
        }
    } catch (error) {
        Logger.error('CACHE', 'Error during cache check, proceeding with detection', error);
        // If cache check fails, proceed with normal detection (safe fallback)
    }

    // Setup all detection triggers
    setupDetectionTriggers();

    // Dispatch JS API ready event
    dispatchReadyEvent();

    // Notify background that content script is ready (only if context is valid)
    if (isExtensionContextValid()) {
        try {
            chrome.runtime.sendMessage({
                type: 'CONTENT_SCRIPT_READY',
                url: window.location.href
            }, (response) => {
                if (chrome.runtime.lastError) {
                    if (chrome.runtime.lastError.message &&
                        chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                        Logger.warn('CONTENT', 'Extension was reloaded before initialization completed');
                        // Don't cleanup immediately, might be temporary
                    } else {
                        Logger.error('CONTENT', 'Failed to notify background', chrome.runtime.lastError);
                    }
                } else {
                    Logger.content('Successfully notified background of readiness');
                }
            });
        } catch (error) {
            if (error.message && error.message.includes('Extension context invalidated')) {
                Logger.warn('CONTENT', 'Extension context invalidated during initialization');
                // Don't cleanup immediately, might be temporary
            } else {
                Logger.error('CONTENT', 'Error notifying background', error);
            }
        }
    } else {
        Logger.warn('CONTENT', 'Extension context not available at initialization');
    }
}

/**
 * Wait for Utils to load before initializing
 */
function waitForUtilsAndInitialize() {
    if (typeof Utils !== 'undefined') {
        if (typeof Logger !== 'undefined') {
            Logger.content('Utils loaded, initializing...');
        }
        initialize();
    } else {
        // Utils not yet loaded, wait and retry
        setTimeout(waitForUtilsAndInitialize, 50);
    }
}

// Don't clear cache here - let PAGE_LOAD_NOTIFICATION handle it
// Clearing cache immediately causes race conditions where JS hooks
// fire before regular detection runs, creating incomplete entries

// Create hook batcher using DetectionEngineManager
const hookBatcher = DetectionEngineManager.createHookBatcher(chrome);

// Listen for JS Hook detections from MAIN world script
// Delegate to DetectionEngineManager.handleHookMessage()
const DEBUG_LOG_RATE_WINDOW_MS = 1000;
const DEBUG_LOG_MAX_PER_WINDOW = 20;
let debugLogWindowStart = Date.now();
let debugLogCount = 0;

function shouldForwardDebugLog() {
    const now = Date.now();
    if (now - debugLogWindowStart >= DEBUG_LOG_RATE_WINDOW_MS) {
        debugLogWindowStart = now;
        debugLogCount = 0;
    }
    debugLogCount += 1;
    return debugLogCount <= DEBUG_LOG_MAX_PER_WINDOW;
}

window.addEventListener('message', (event) => {
    // Stop propagation for hook detections to prevent page scripts from seeing them
    if (event.data?.type === 'JS_HOOK_DETECTION') {
        event.stopImmediatePropagation?.();
    }

    // Forward hook failure reports from HookResilienceManager
    if (event.data?.type === 'HOOK_FAILURE_REPORT') {
        try {
            chrome.runtime.sendMessage({
                type: 'HOOK_FAILURE_REPORT',
                target: event.data.target,
                failureType: event.data.failureType,
                message: event.data.message,
                timestamp: event.data.timestamp
            }).catch(() => {});
        } catch (e) {
            // Extension context invalidated - silently ignore
        }
        return;
    }

    // Forward hook tampering detection
    if (event.data?.type === 'HOOK_TAMPERING_DETECTED') {
        try {
            chrome.runtime.sendMessage({
                type: 'HOOK_TAMPERING_DETECTED',
                target: event.data.target,
                timestamp: event.data.timestamp
            }).catch(() => {});
        } catch (e) {
            // Extension context invalidated - silently ignore
        }
        return;
    }

    // Forward hook recovery results
    if (event.data?.type === 'HOOK_RECOVERY_RESULT') {
        try {
            chrome.runtime.sendMessage({
                type: 'HOOK_RECOVERY_RESULT',
                target: event.data.target,
                success: event.data.success,
                error: event.data.error,
                timestamp: event.data.timestamp
            }).catch(() => {});
        } catch (e) {
            // Extension context invalidated - silently ignore
        }
        return;
    }

    // Forward window property detections from WindowPropertyTracker
    if (event.data?.type === 'WINDOW_DETECTIONS') {
        try {
            chrome.runtime.sendMessage({
                type: 'WINDOW_DETECTIONS',
                detections: event.data.detections,
                timestamp: event.data.timestamp
            }).catch(() => {});
        } catch (e) {
            // Extension context invalidated - silently ignore
        }
        return;
    }

    // FIX: Forward debug logs from MAIN world to background service worker
    if (event.data?.type === 'SCRAPFLY_DEBUG_LOG') {
        if (!shouldForwardDebugLog()) {
            return;
        }
        try {
            chrome.runtime.sendMessage({
                type: 'SCRAPFLY_DEBUG_LOG',
                level: event.data.level,
                message: event.data.message,
                source: event.data.source,
                timestamp: event.data.timestamp
            }).catch(() => {});
        } catch (e) {
            // Extension context invalidated - silently ignore
        }
        return;
    }

    // Forward centralized logs from MAIN world Logger to background
    if (event.data?.type === 'SCRAPFLY_LOG') {
        try {
            chrome.runtime.sendMessage({
                type: 'LOG',
                log: event.data.log
            }).catch(() => {});
        } catch (e) {
            // Extension context invalidated - silently ignore
        }
        return;
    }

    // Dispatch JS API events for completion signals (before handleHookMessage sends to background with retry)
    if (event.data?.type === 'JS_HOOKS_COMPLETE') {
        if (!detectionFinalized) {
            const hooksTs = (typeof event.data.timestamp === 'number')
                ? new Date(event.data.timestamp).toISOString()
                : (event.data.timestamp || new Date().toISOString());

            dispatchJsApiEvent('onHooksComplete', {
                url: event.data.url || window.location.href,
                timestamp: hooksTs,
                totalDetections: event.data.totalDetections,
                uniqueHooks: event.data.uniqueHooks,
                completionReason: event.data.completionReason,
                completionTime: event.data.completionTime,
                uninstallStats: event.data.uninstallStats
            }).catch(() => {});
        }
    }

    if (event.data?.type === 'WINDOW_PROPS_COMPLETE') {
        if (!detectionFinalized) {
            const windowTs = (typeof event.data.timestamp === 'number')
                ? new Date(event.data.timestamp).toISOString()
                : (event.data.timestamp || new Date().toISOString());

            dispatchJsApiEvent('onWindowPropsComplete', {
                url: event.data.url || window.location.href,
                timestamp: windowTs,
                detectedCount: event.data.detectedCount,
                totalChecked: event.data.totalChecked,
                elapsedMs: event.data.elapsedMs,
                reason: event.data.reason
            }).catch(() => {});
        }
    }

    // handleHookMessage sends completion signals to background with 3-attempt retry logic
    DetectionEngineManager.handleHookMessage(event, chrome, hookBatcher);
});

// Install hooks IMMEDIATELY (document_start) - don't wait for Utils
// This must run before page scripts to intercept API calls
// CRITICAL: NO ASYNC OPERATIONS BEFORE installJSHooks() to prevent race conditions
// Page scripts can execute during async delays and save native API references, bypassing hooks
(function() {
    if (window.__scrapflyHooksInstalled) {
        return; // Already installed
    }

    // CHECK CONTEXT BEFORE INSTALLING HOOKS (synchronous check)
    if (!chrome?.runtime?.id) {
        return;
    }

    // IMPORTANT: Always install hooks at document_start for correctness.
    // Cache hits are handled asynchronously (background discards batches + disables monitoring),
    // and relying on sessionStorage can go stale (manual cache clear, settings changes).
    window.__scrapflyCacheHitEarlyExit = false;

    // CRITICAL FIX: Install hooks IMMEDIATELY without any async storage checks
    // The cache check and enabled state check will happen AFTER hooks are installed
    // This guarantees hooks install before any page scripts execute
    window.__scrapflyHooksInstalled = true;
    installJSHooks();

    // Test Logger (with safety check)
    if (typeof Logger !== 'undefined') {
        Logger.content('Logger initialized in CONTENT (ISOLATED) context');
    }

    // Use flag to prevent duplicate triggers
    let hookStartTriggered = false;
    const triggerHookStart = () => {
        if (hookStartTriggered) return;
        hookStartTriggered = true;
        window.postMessage({
            type: 'SCRAPFLY_PAGE_READY'
        }, '*');
    };

    if (document.readyState === 'complete') {
        triggerHookStart();
    } else {
        // Use load event - most reliable for ensuring page is ready
        window.addEventListener('load', triggerHookStart, { once: true });
    }
})();

// Check if script is already initialized to prevent duplicates
// Only the initialization call is wrapped, not the function definitions
if (window.__scrapflyContentScriptInitialized) {
    // Already initialized, silently skip
} else {
    window.__scrapflyContentScriptInitialized = true;
    // Wait for Utils to load before initializing
    waitForUtilsAndInitialize();
}
