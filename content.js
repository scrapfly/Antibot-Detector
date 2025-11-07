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
var contextCheckInterval = contextCheckInterval || null;
var jsApiReady = jsApiReady || false;
var contextCheckFailures = contextCheckFailures || 0;
var monitoringDisabled = monitoringDisabled || false; // Track if monitoring has been disabled after cache hit

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
        console.warn('Scrapfly Content Script: Utils not loaded yet');
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
        console.warn('Scrapfly Content Script: Utils not loaded, skipping cleanup');
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
        Utils.debugLog('Context invalid, skipping message:', message.type);
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
    const dispatched = await Settings.dispatchReadyEvent();
    if (dispatched) {
        jsApiReady = true;
    }
}

/**
 * Notify background about page load (cache check first)
 * Delegates to Utils.notifyPageLoad()
 * @param {string} triggerSource - What triggered this notification (page_load, visibility_change, url_change, manual)
 */
async function notifyPageLoad(triggerSource = 'page_load') {
    if (typeof Utils === 'undefined') {
        console.warn('Scrapfly Content Script: Utils not loaded, skipping page load notification');
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
    Utils.debugLog('[DEBUG] collectAndSendData() called');
    if (typeof Utils === 'undefined') {
        console.warn('[DEBUG] Utils not loaded, skipping data collection');
        return;
    }
    Utils.debugLog('[DEBUG] Calling Utils.collectAndSendData()...');
    return Utils.collectAndSendData({
        detectionEngine: detectionEngine,
        isExtensionContextValid: isExtensionContextValid,
        cleanupOrphanedScript: cleanupOrphanedScript
    });
}

/**
 * Visibility/focus handler - stored globally so it can be removed after cache hit
 */
var visibilityTimeout = visibilityTimeout || null;
var handleVisibilityChange = handleVisibilityChange || null;
var popupOpenTime = popupOpenTime || 0; // Track when popup was opened

/**
 * Setup detection triggers
 * OPTIMIZED 2.3: Consolidated event listeners with debouncing
 */
function setupDetectionTriggers() {
    Utils.debugLog('Scrapfly Content Script: Setting up detection triggers...');

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

            // Debounce URL changes (prevent rapid notifications)
            if (urlChangeTimeout) clearTimeout(urlChangeTimeout);
            urlChangeTimeout = setTimeout(() => {
                Utils.debugLog('Scrapfly Content Script: URL changed, notifying with url_change trigger...');
                notifyPageLoad('url_change');
                urlChangeTimeout = null;
            }, 500);
        }
    });

    // Start observing URL changes (wait for body to exist since we run at document_start)
    if (document.body) {
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    } else {
        // Wait for body to be available
        const checkBody = setInterval(() => {
            if (document.body) {
                clearInterval(checkBody);
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }
        }, 10);
    }

    // Listen for messages from background script
    if (isExtensionContextValid()) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            // Check if context is still valid
            if (!isExtensionContextValid()) {
                Utils.debugLog('Scrapfly Content Script: Extension context invalidated, cannot respond to message');
                return false;
            }

            Utils.debugLog('Scrapfly Content Script: Received message:', request);

            if (request.type === 'REQUEST_PAGE_DATA') {
                // Background requests data collection (cache miss)
                Utils.debugLog('[DEBUG] REQUEST_PAGE_DATA message received - starting collection');
                Utils.debugLog('Scrapfly Content Script: ✅ REQUEST_PAGE_DATA received - starting collection');

                // Clear sessionStorage cache flag since background detected a cache miss
                try {
                    const cacheKey = `scrapfly_cache_${window.location.hostname}`;
                    sessionStorage.removeItem(cacheKey);
                    Utils.debugLog('[Cache Invalidation] Cleared sessionStorage cache flag due to REQUEST_PAGE_DATA (cache miss)');
                } catch (e) {
                    // SessionStorage might not be available, continue normally
                }

                // BULLETPROOF: Ensure Utils is loaded before calling collectAndSendData
                if (typeof Utils === 'undefined') {
                    Utils.debugLog('[DEBUG] Utils not loaded yet, will retry in 500ms');
                    console.error('Scrapfly Content Script: ❌ Utils not loaded yet, waiting and retrying...');
                    // Retry after Utils loads
                    setTimeout(() => {
                        if (typeof Utils !== 'undefined') {
                            Utils.debugLog('[DEBUG] Utils now loaded, calling collectAndSendData()');
                            Utils.debugLog('Scrapfly Content Script: Utils now loaded, collecting data...');
                            collectAndSendData();
                        } else {
                            console.error('[DEBUG] Utils still not loaded after retry, collection failed');
                            console.error('Scrapfly Content Script: ❌ Utils still not loaded, collection failed');
                        }
                    }, 500);
                } else {
                    Utils.debugLog('[DEBUG] Utils already loaded, calling collectAndSendData() immediately');
                    collectAndSendData();
                }

                sendResponse({ status: 'collecting_data' });
            } else if (request.type === 'RUN_DETECTION') {
                // Manual detection request from popup (force bypass cache)
                Utils.debugLog('Scrapfly Content Script: ✅ RUN_DETECTION received - starting manual detection');

                // Clear sessionStorage cache flag since this is manual detection (bypasses cache)
                try {
                    const cacheKey = `scrapfly_cache_${window.location.hostname}`;
                    sessionStorage.removeItem(cacheKey);
                    Utils.debugLog('[Cache Invalidation] Cleared sessionStorage cache flag for manual detection');
                } catch (e) {
                    // SessionStorage might not be available, continue normally
                }

                // BULLETPROOF: Ensure Utils is loaded before calling collectAndSendData
                if (typeof Utils === 'undefined') {
                    console.error('Scrapfly Content Script: ❌ Utils not loaded yet, waiting and retrying...');
                    // Retry after Utils loads
                    setTimeout(() => {
                        if (typeof Utils !== 'undefined') {
                            Utils.debugLog('Scrapfly Content Script: Utils now loaded, collecting data...');
                            collectAndSendData();
                        } else {
                            console.error('Scrapfly Content Script: ❌ Utils still not loaded, detection failed');
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
                (async () => {
                    await dispatchJsApiEvent('onScrapflyDetection', {
                        url: request.url || window.location.href,
                        detections: request.detections || [],
                        detectionCount: request.detectionCount || 0,
                        timestamp: request.timestamp || new Date().toISOString()
                    });
                })();
                sendResponse({ status: 'event_dispatched' });
            } else if (request.type === 'DETECTION_ERROR') {
                // Detection error - dispatch JS API error event
                (async () => {
                    await dispatchJsApiEvent('onScrapflyError', {
                        url: request.url || window.location.href,
                        error: request.error || 'Unknown error',
                        timestamp: request.timestamp || new Date().toISOString()
                    });
                })();
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
                            🎬 reCAPTCHA Capture - Step ${request.step}
                        </div>
                        <div style="opacity: 0.9;">
                            ${request.message}
                        </div>
                        <div id="scrapfly-timer" style="margin-top: 12px; font-size: 12px; opacity: 0.8; font-weight: 600;">
                            ⏱️ Capturing...
                        </div>
                    `;
                }
                sendResponse({ status: 'updated' });
            } else if (request.type === 'POPUP_OPENED') {
                // Popup was opened - record timestamp to prevent visibility-triggered detections
                popupOpenTime = Date.now();
                Utils.debugLog('Scrapfly Content Script: Popup opened, disabling visibility detection for 3 seconds');
                sendResponse({ status: 'acknowledged' });
            } else if (request.type === 'CACHE_HIT_DISABLE_MONITORING') {
                // Cache hit - disable hooks and window properties monitoring
                monitoringDisabled = true;

                // Remove visibility/focus listeners to prevent repeated triggering
                if (handleVisibilityChange) {
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                    window.removeEventListener('focus', handleVisibilityChange);
                    handleVisibilityChange = null;
                }

                // Clear any pending timeout
                if (visibilityTimeout) {
                    clearTimeout(visibilityTimeout);
                    visibilityTimeout = null;
                }

                // Notify MAIN world to disable monitoring
                window.postMessage({
                    type: 'DISABLE_MONITORING',
                    reason: 'cache_hit',
                    url: request.url
                }, '*');
                sendResponse({ status: 'disabled' });
            } else if (request.type === 'CLEAR_SESSION_CACHE') {
                // Clear sessionStorage cache flag when cache is manually cleared
                try {
                    const cacheKey = `scrapfly_cache_${window.location.hostname}`;
                    sessionStorage.removeItem(cacheKey);
                    Utils.debugLog('[Cache Invalidation] Cleared sessionStorage cache flag due to manual cache clear');
                    sendResponse({ status: 'cleared' });
                } catch (e) {
                    Utils.debugLog('[Cache Invalidation] Could not clear sessionStorage:', e.message);
                    sendResponse({ status: 'error', error: e.message });
                }
            } else if (request.type === 'CLOUDFLARE_EXTRACT_SITEKEY_FROM_DOM') {
                // Extract sitekey from cf-turnstile element
                Utils.debugLog('[Content] 📥 CLOUDFLARE_EXTRACT_SITEKEY_FROM_DOM message received');

                try {
                    // First, log what elements exist
                    const allDataElements = document.querySelectorAll('[data-sitekey]');
                    Utils.debugLog('[Content] 🔍 Found', allDataElements.length, 'elements with [data-sitekey]');

                    // Find the element
                    const element = document.querySelector('[data-sitekey]');
                    Utils.debugLog('[Content] Element found:', !!element);

                    if (element) {
                        Utils.debugLog('[Content] Element tag:', element.tagName);
                        Utils.debugLog('[Content] Element classes:', element.className);
                    }

                    const sitekey = element?.getAttribute('data-sitekey') || null;

                    Utils.debugLog('[Content] ✅ Extracted sitekey from DOM:', sitekey ? sitekey.substring(0, 20) + '...' : 'null');

                    sendResponse({
                        sitekey: sitekey
                    });
                } catch (error) {
                    console.error('[Content] ❌ Error extracting sitekey:', error);
                    sendResponse({
                        sitekey: null,
                        error: error.message
                    });
                }
            }

            // Return true to indicate async response
            return true;
        });
    }

    Utils.debugLog('Scrapfly Content Script: Detection triggers setup complete');
}

/**
 * Perform context validation
 * Delegates to Utils.performContextCheck()
 */
function performContextCheck() {
    if (typeof Utils === 'undefined') {
        console.warn('Scrapfly Content Script: Utils not loaded, skipping context check');
        return;
    }
    return Utils.performContextCheck(
        {
            hasCleanedUp: hasCleanedUp,
            contextCheckInterval: contextCheckInterval,
            contextCheckFailures: contextCheckFailures
        },
        cleanupOrphanedScript
    );
}

/**
 * Initialize content script
 */
async function initialize() {
    Utils.debugLog('Scrapfly Content Script: Initializing on', window.location.href);

    // CHECK CONTEXT FIRST - before any operations
    if (!isExtensionContextValid()) {
        Utils.debugLog('Scrapfly Content Script: Extension context not valid, cleaning up');
        cleanupOrphanedScript();
        return; // Exit early
    }

    // Don't run on extension pages or chrome:// URLs
    if (!Utils.isValidContentScriptUrl(window.location.href)) {
        Utils.debugLog('Scrapfly Content Script: Skipping initialization on browser page');
        return;
    }

    // Check if extension is enabled
    try {
        const result = await chrome.storage.local.get(['scrapfly_enabled']);
        if (result.scrapfly_enabled === false) {
            Utils.debugLog('Scrapfly Content Script: Extension is disabled, skipping initialization');
            return;
        }
    } catch (error) {
        console.error('Scrapfly Content Script: Failed to check enabled state:', error);
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
    // OPTIMIZATION QUICK WIN #4: Reduce detector loading retries from 5 to 3 with exponential backoff
    // This saves 1-3s on cold start while still allowing reasonable retry window
    const maxRetries = 3;
    let retryDelay = 500; // Start with 500ms, exponential backoff to 1s

    while (!detectorsLoaded && retryCount < maxRetries) {
        // CHECK CONTEXT BEFORE EACH ATTEMPT
        if (!isExtensionContextValid()) {
            Utils.debugLog('Extension context lost during detector loading');
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
                    Utils.debugLog(`[C.1] ✅ Detectors loaded - smart data collection enabled (${detectorCount} detectors)`);

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
        console.warn('[C.1] ⚠️ Failed to load detectors after all retries, will collect all data types as fallback');
    }

    // Note: JS hooks are installed by install-hooks.js at document_start (before this script runs)

    // OPTIMIZED 2.5: Removed periodic context check interval
    // Context validity is now checked on-demand during actual operations (message sending, etc.)
    // This eliminates constant CPU wake-ups every 60 seconds

    // NEW OPTIMIZATION: Early cache check - skip all detection work if cached
    Utils.debugLog('[Cache Early Check] Checking cache before starting detection work...');
    try {
        const cacheCheckResponse = await chrome.runtime.sendMessage({
            type: 'CHECK_CACHE_EARLY',
            url: window.location.href
        });

        if (cacheCheckResponse?.cacheHit) {
            Utils.debugLog('[Cache Early Check] ✅ CACHE HIT - skipping all detection work');
            Utils.debugLog('[Cache Early Check] Returning cached detections immediately');

            // Set flag to prevent hook installation (ISOLATED world)
            window.__scrapflyCacheHitEarlyExit = true;

            // CRITICAL: Notify MAIN world about cache hit so hooks stop firing
            // MAIN world has separate window object, needs its own flag
            window.postMessage({
                type: 'SCRAPFLY_CACHE_HIT',
                timestamp: Date.now()
            }, '*');

            // NEW OPTIMIZATION: Store cache status in sessionStorage for synchronous check on next page load
            try {
                const cacheKey = `scrapfly_cache_${window.location.hostname}`;
                const cacheData = {
                    timestamp: Date.now(),
                    detectionCount: cacheCheckResponse.detectionData?.detectionCount || 0,
                    url: window.location.href
                };
                sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
                Utils.debugLog('[Cache Early Check] ✅ Saved cache status to sessionStorage for future synchronous checks');
            } catch (e) {
                // SessionStorage might not be available, continue normally
                Utils.debugLog('[Cache Early Check] Could not save to sessionStorage:', e.message);
            }

            // Notify background about early cache exit AND send cached detection data
            // This ensures the badge is updated with detection count immediately
            chrome.runtime.sendMessage({
                type: 'CACHE_HIT_EARLY_EXIT',
                url: window.location.href,
                detectionData: cacheCheckResponse.detectionData  // Include cached data for badge update
            }).catch(err => {
                Utils.debugLog('[Cache Early Check] Note: Background message failed (popup may not be open)');
            });

            // Exit initialization - don't setup triggers, don't install anything
            Utils.debugLog('[Cache Early Check] Content script initialization complete (cache hit path)');
            return;
        } else {
            Utils.debugLog('[Cache Early Check] ❌ CACHE MISS - proceeding with full detection');

            // Clear any stale sessionStorage cache flag since we have a cache miss
            try {
                const cacheKey = `scrapfly_cache_${window.location.hostname}`;
                sessionStorage.removeItem(cacheKey);
                Utils.debugLog('[Cache Early Check] Cleared sessionStorage cache flag due to cache miss');
            } catch (e) {
                // SessionStorage might not be available, continue normally
            }
        }
    } catch (error) {
        console.error('[Cache Early Check] Error during cache check, proceeding with detection:', error.message);
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
                        console.warn('Scrapfly Content Script: Extension was reloaded before initialization completed');
                        // Don't cleanup immediately, might be temporary
                    } else {
                        console.error('Scrapfly Content Script: Failed to notify background:', chrome.runtime.lastError);
                    }
                } else {
                    Utils.debugLog('Scrapfly Content Script: Successfully notified background of readiness');
                }
            });
        } catch (error) {
            if (error.message && error.message.includes('Extension context invalidated')) {
                console.warn('Scrapfly Content Script: Extension context invalidated during initialization');
                // Don't cleanup immediately, might be temporary
            } else {
                console.error('Scrapfly Content Script: Error notifying background:', error);
            }
        }
    } else {
        console.warn('Scrapfly Content Script: Extension context not available at initialization');
    }
}

/**
 * Wait for Utils to load before initializing
 */
function waitForUtilsAndInitialize() {
    if (typeof Utils !== 'undefined') {
        Utils.debugLog('Scrapfly Content Script: Utils loaded, initializing...');
        initialize();
    } else {
        // Can't use Utils.debugLog yet because Utils isn't loaded
        // This will be handled by debug.js which is loaded before this script
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
window.addEventListener('message', (event) => {
    if (event.data?.type === 'JS_HOOK_DETECTION') {
        event.stopImmediatePropagation?.();
    }

    // FIX: Forward debug logs from MAIN world to background service worker
    if (event.data?.type === 'SCRAPFLY_DEBUG_LOG') {
        chrome.runtime.sendMessage({
            type: 'SCRAPFLY_DEBUG_LOG',
            level: event.data.level,
            message: event.data.message,
            source: event.data.source,
            timestamp: event.data.timestamp
        }).catch(() => {
            // Silently fail if background isn't available
        });
        return;
    }

    // Forward centralized logs from MAIN world Logger to background
    if (event.data?.type === 'SCRAPFLY_LOG') {
        chrome.runtime.sendMessage({
            type: 'LOG',
            log: event.data.log
        }).catch(() => {
            // Silently fail if background isn't available
        });
        return;
    }

    // FIX: Listen for JS hooks completion signal from MAIN world
    if (event.data?.type === 'JS_HOOKS_COMPLETE') {
        chrome.runtime.sendMessage({
            type: 'JS_HOOKS_COMPLETE',
            url: event.data.url,
            timestamp: event.data.timestamp,
            totalDetections: event.data.totalDetections,
            uniqueHooks: event.data.uniqueHooks,
            completionReason: event.data.completionReason,
            completionTime: event.data.completionTime,
            uninstallStats: event.data.uninstallStats
        }).catch(() => {
            // Silently fail if background isn't available
        });
    }

    // FIX: Listen for window properties completion signal from MAIN world
    if (event.data?.type === 'WINDOW_PROPS_COMPLETE') {
        chrome.runtime.sendMessage({
            type: 'WINDOW_PROPS_COMPLETE',
            url: event.data.url,
            timestamp: event.data.timestamp,
            detectedCount: event.data.detectedCount,
            totalChecked: event.data.totalChecked,
            elapsedMs: event.data.elapsedMs,
            reason: event.data.reason
        }).catch(() => {
            // Silently fail if background isn't available
        });
    }

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

    // NEW OPTIMIZATION: Check sessionStorage for cache hit flag (synchronous)
    // This flag is set when a cache hit is detected in a previous page load
    try {
        const cacheKey = `scrapfly_cache_${window.location.hostname}`;
        const cachedData = sessionStorage.getItem(cacheKey);

        if (cachedData) {
            // Cache hit detected from previous check - skip hook installation entirely
            const cacheInfo = JSON.parse(cachedData);
            const cacheAge = Date.now() - cacheInfo.timestamp;

            // Cache is valid for 12 hours (same as detection cache)
            if (cacheAge < 12 * 60 * 60 * 1000) {
                Utils.debugLog('[CACHE OPTIMIZATION] ✅ Synchronous cache hit - SKIPPING hook installation');
                Utils.debugLog(`[CACHE OPTIMIZATION] Cache age: ${Math.round(cacheAge / 60000)} minutes`);
                window.__scrapflyHooksInstalled = true; // Prevent future attempts
                window.__scrapflyCacheHitEarlyExit = true; // Set flag for other checks

                // Still trigger page ready for window property checks to exit early
                const triggerHookStart = () => {
                    window.postMessage({
                        type: 'SCRAPFLY_PAGE_READY'
                    }, '*');
                };

                if (document.readyState === 'complete') {
                    triggerHookStart();
                } else {
                    window.addEventListener('load', triggerHookStart, { once: true });
                }

                return; // EXIT - no hooks installed!
            } else {
                // Cache expired, clear it
                Utils.debugLog('[CACHE OPTIMIZATION] Cache expired, removing sessionStorage entry');
                sessionStorage.removeItem(cacheKey);
            }
        }
    } catch (e) {
        // SessionStorage might not be available or accessible, continue normally
        Utils.debugLog('[CACHE OPTIMIZATION] SessionStorage check failed:', e.message);
    }

    // CRITICAL FIX: Install hooks IMMEDIATELY without any async storage checks
    // The cache check and enabled state check will happen AFTER hooks are installed
    // This guarantees hooks install before any page scripts execute
    window.__scrapflyHooksInstalled = true;
    installJSHooks();
    Logger.content('✅ Logger initialized in CONTENT (ISOLATED) context');

    const triggerHookStart = () => {
        window.postMessage({
            type: 'SCRAPFLY_PAGE_READY'
        }, '*');
    };

    if (document.readyState === 'complete') {
        triggerHookStart();
    } else {
        window.addEventListener('load', triggerHookStart, { once: true });
        if (document.readyState === 'interactive') {
            window.addEventListener('DOMContentLoaded', triggerHookStart, { once: true });
        } else {
            const readyStateInterval = setInterval(() => {
                if (document.readyState === 'complete') {
                    clearInterval(readyStateInterval);
                    triggerHookStart();
                }
            }, 100);
        }
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