/**
 * Content Script (ISOLATED World)
 * Detection system phases 3-4: Batching & completion.
 * Batches hook detections from MAIN world, deduplicates by "detectorId:target",
 * and completes after 2s of inactivity (resets on any hook activity).
 */

// Global variables - use var to allow redeclaration during extension reloads
var detectionEngine = detectionEngine || null;
var hasCleanedUp = hasCleanedUp || false;
var contextCheckInterval = contextCheckInterval || null; // Interval for context validity checks
var spaObserver = spaObserver || null; // SPA URL-change observer (module-scoped so cleanup can disconnect it)
var spaUrlChangeTimeout = spaUrlChangeTimeout || null;
var detectionFinalized = detectionFinalized || false; // Flag to suppress late events after onDetection
var hooksMonitoringComplete = hooksMonitoringComplete || false;

// Bridge protocol: modules/core/bridge-protocol.js (loaded first in this content script)
const SCRAPFLY_PROTOCOL = globalThis.ScrapflyBridgeProtocol;
const BRIDGE_TYPES = SCRAPFLY_PROTOCOL.MESSAGE_TYPES;
const CACHE_HIT_FLAG = SCRAPFLY_PROTOCOL.GLOBALS.CACHE_HIT_EARLY_EXIT; // this world's own flag, same name as MAIN's
const SCRAPFLY_BRIDGE_TOKEN_FIELD = SCRAPFLY_PROTOCOL.FIELDS.TOKEN;
const SCRAPFLY_BRIDGE_INIT_EVENT = SCRAPFLY_PROTOCOL.EVENTS.BRIDGE_INIT;
const SCRAPFLY_ISOLATED_TO_MAIN_EVENT = SCRAPFLY_PROTOCOL.EVENTS.ISOLATED_TO_MAIN;
const SCRAPFLY_MAIN_TO_ISOLATED_EVENT = SCRAPFLY_PROTOCOL.EVENTS.MAIN_TO_ISOLATED;
const SCRAPFLY_ALLOWED_MAIN_MESSAGE_TYPES = new Set(SCRAPFLY_PROTOCOL.TO_ISOLATED_TYPES);

var scrapflyBridgeToken = scrapflyBridgeToken || createScrapflyBridgeToken();

function createScrapflyBridgeToken() {
    try {
        const bytes = new Uint32Array(4);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, value => value.toString(16).padStart(8, '0')).join('');
    } catch (error) {
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    }
}

function sendToMainWorld(message) {
    if (!message || typeof message !== 'object') {
        return false;
    }

    try {
        window.dispatchEvent(new CustomEvent(SCRAPFLY_ISOLATED_TO_MAIN_EVENT, {
            detail: {
                ...message,
                [SCRAPFLY_BRIDGE_TOKEN_FIELD]: scrapflyBridgeToken
            }
        }));
        return true;
    } catch (error) {
        Logger.debug('CONTENT', '[bridge] Failed to send MAIN world message', error);
        return false;
    }
}

function initializeMainWorldBridge() {
    try {
        // The MAIN world knows nothing but this event's name: it adopts the whole
        // bridge protocol, the token and its early bind shims from this detail
        // (fired before any page script runs).
        window.dispatchEvent(new CustomEvent(SCRAPFLY_BRIDGE_INIT_EVENT, {
            detail: demMainWorldBootstrapDetail(scrapflyBridgeToken)
        }));
    } catch (error) {
        Logger.debug('CONTENT', '[bridge] Failed to initialize MAIN world bridge', error);
    }
}

function getTrustedMainWorldMessageData(event) {
    const data = event?.detail;
    if (!data || typeof data !== 'object') {
        return null;
    }

    if (data[SCRAPFLY_BRIDGE_TOKEN_FIELD] !== scrapflyBridgeToken) {
        return null;
    }

    if (!SCRAPFLY_ALLOWED_MAIN_MESSAGE_TYPES.has(data.type)) {
        return null;
    }

    return data;
}

window.ScrapflyBridge = {
    getToken: () => scrapflyBridgeToken,
    sendToMainWorld
};

/**
 * Install JS Hooks early (at document_start)
 * Delegates to DetectionEngineManager.installHooksOrchestrator()
 */
async function installJSHooks() {
    return DetectionEngineManager.installHooksOrchestrator(window, chrome);
}

async function rearmHooksForNewDetectionIfNeeded() {
    if (!detectionFinalized && !hooksMonitoringComplete && window[CACHE_HIT_FLAG] !== true) {
        return;
    }

    detectionFinalized = false;
    hooksMonitoringComplete = false;
    window[CACHE_HIT_FLAG] = false;
    initializeMainWorldBridge();
    try {
        await installJSHooks();
    } catch (error) {
        Logger.warn('CONTENT', '[hooks] Failed to re-arm hooks for new detection', error);
    }
}

/**
 * Check if extension context is still valid
 * Delegates to Utils.isExtensionContextValid()
 */
function isExtensionContextValid() {
    if (typeof Utils === 'undefined') {
        if (typeof Logger !== 'undefined') {
            Logger.debug('CONTENT', '[isExtensionContextValid] Utils not loaded yet');
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
            Logger.debug('CONTENT', '[cleanupOrphanedScript] Utils not loaded, skipping');
        }
        return;
    }
    const cleaned = Utils.cleanupOrphanedScript({
        hasCleanedUp: hasCleanedUp,
        contextCheckInterval: contextCheckInterval,
        notifyPageLoad: notifyPageLoad,
        detectionEngine: detectionEngine
    });
    if (cleaned) {
        // The boolean was passed by value, so Utils flipped only its own copy.
        // Write the latch back to the module flag here, then disconnect the SPA
        // observer (otherwise it keeps firing for the orphaned page's lifetime).
        hasCleanedUp = true;
        stopSpaObserver();
    }
    return cleaned;
}

function stopSpaObserver() {
    if (spaObserver) {
        try { spaObserver.disconnect(); } catch (e) {}
        spaObserver = null;
    }
    if (spaUrlChangeTimeout) {
        clearTimeout(spaUrlChangeTimeout);
        spaUrlChangeTimeout = null;
    }
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
            Logger.debug('CONTENT', '[notifyPageLoad] Utils not loaded, skipping');
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
    if (typeof Utils === 'undefined') {
        if (typeof Logger !== 'undefined') {
            Logger.debug('CONTENT', '[collectAndSendData] Utils not loaded, skipping');
        }
        return;
    }
    await rearmHooksForNewDetectionIfNeeded();
    return Utils.collectAndSendData({
        detectionEngine: detectionEngine,
        isExtensionContextValid: isExtensionContextValid,
        cleanupOrphanedScript: cleanupOrphanedScript
    });
}

// Some pages never fire load: a request that never finishes (scanned this long
// after DOMContentLoaded), or a script that blocks the parser, as on samr.gov.cn
// (scanned with what has loaded this long after the page started)
const PAGE_LOAD_FALLBACK_MS = 10000;
const PAGE_PARSE_FALLBACK_MS = 20000;

/**
 * Run callback once the page has loaded: on the load event,
 * PAGE_LOAD_FALLBACK_MS after DOMContentLoaded when load has not come by then,
 * or PAGE_PARSE_FALLBACK_MS from now when the page is still being parsed.
 * @param {Function} callback - Called exactly once
 */
function onPageLoaded(callback) {
    if (document.readyState === 'complete') {
        callback();
        return;
    }
    let done = false;
    const timers = [];
    const run = () => {
        if (done) return;
        done = true;
        timers.forEach(timer => clearTimeout(timer));
        window.removeEventListener('load', run);
        document.removeEventListener('DOMContentLoaded', armAfterParse);
        callback();
    };
    const armAfterParse = () => {
        if (!done) timers.push(setTimeout(run, PAGE_LOAD_FALLBACK_MS));
    };
    window.addEventListener('load', run, { once: true });
    if (document.readyState === 'interactive') {
        armAfterParse();
    } else {
        document.addEventListener('DOMContentLoaded', armAfterParse, { once: true });
        timers.push(setTimeout(() => {
            if (document.readyState === 'loading') run();
        }, PAGE_PARSE_FALLBACK_MS));
    }
}

/**
 * Setup detection triggers
 * OPTIMIZED 2.3: Consolidated event listeners with debouncing
 */
function setupDetectionTriggers() {
    Logger.debug('CONTENT', 'Setting up detection triggers');

    // Notify page load AFTER all resources load (background checks cache first)
    // Use 'load' event instead of 'DOMContentLoaded' to ensure async scripts (like reCAPTCHA) are loaded
    if (document.readyState === 'complete') {
        // Page already fully loaded, notify immediately
        setTimeout(notifyPageLoad, 100);
    } else {
        // Wait for all external resources to load (or the fallback, see onPageLoaded);
        // add small delay to ensure scripts have executed
        onPageLoaded(() => setTimeout(notifyPageLoad, 200));
    }

    // Debounced SPA URL change detection
    let lastUrl = location.href;
    spaObserver = new MutationObserver(() => {
        if (hasCleanedUp) return;

        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;

            // Debounce URL changes (utils.js has 2000ms debounce)
            if (spaUrlChangeTimeout) clearTimeout(spaUrlChangeTimeout);
            spaUrlChangeTimeout = setTimeout(() => {
                Logger.debug('CONTENT', 'URL changed, rescanning');
                notifyPageLoad('url_change');
                spaUrlChangeTimeout = null;
            }, 100);
        }
    });

    // Start observing URL changes (wait for body to exist since we run at document_start)
    if (document.body) {
        spaObserver.observe(document.body, {
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
                spaObserver.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            } else if (checkCount >= maxChecks) {
                clearInterval(checkBody);
                Logger.warn('CONTENT', '[init] Timeout waiting for document.body');
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

            // Progress messages are covered by the JS API event lines
            if (request.type !== 'DETECTION_PROGRESS') Logger.debug('CONTENT', `Message: ${request.type}`);

            if (request.type === 'REQUEST_PAGE_DATA') {
                // Background requests data collection (cache miss)

                // JS API: Notify page that detection is starting (cache miss)
                dispatchJsApiEvent('onStart', {
                    url: window.location.href,
                    trigger: 'cache_miss',
                    timestamp: new Date().toISOString()
                }).catch(() => {});

                // Ensure Utils is loaded before collecting data
                if (typeof Utils === 'undefined') {
                    Logger.debug('CONTENT', '[init] Utils not loaded, retrying in 500ms');
                    // Retry after Utils loads
                    setTimeout(() => {
                        if (typeof Utils !== 'undefined') {
                            Logger.debug('CONTENT', '[init] Utils loaded on retry, collecting data');
                            collectAndSendData();
                        } else {
                            Logger.warn('CONTENT', '[init] Utils still not loaded after retry');
                        }
                    }, 500);
                } else {
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

                // Ensure Utils is loaded before collecting data
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
                hooksMonitoringComplete = true;
                Logger.debug('CONTENT', 'Scan complete', {
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
                }).catch(e => Logger.error('CONTENT', 'Failed to dispatch detection event', e));

                // Stop window property polling - detection is finalized, late results won't update anything
                sendToMainWorld({ type: BRIDGE_TYPES.STOP_WINDOW_POLLING, reason: SCRAPFLY_PROTOCOL.CONTROL_REASONS.DETECTION_COMPLETE });

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
            } else if (request.type === BRIDGE_TYPES.CACHE_HIT_DISABLE_MONITORING) {
                // Cache hit - disable hooks and window properties monitoring
                sendToMainWorld({
                    type: BRIDGE_TYPES.DISABLE_MONITORING,
                    reason: SCRAPFLY_PROTOCOL.CONTROL_REASONS.CACHE_HIT,
                    url: request.url
                });
                sendResponse({ status: 'disabled' });
            }

            // Return true to indicate async response
            return true;
        });
    }

}

/**
 * Initialize content script
 */
async function initialize() {
    Logger.debug('CONTENT', `Init: ${window.location.href}`);

    // Check context before any operations
    if (!isExtensionContextValid()) {
        Logger.content('Extension context not valid, cleaning up');
        cleanupOrphanedScript();
        return; // Exit early
    }

    // Don't run on extension pages or chrome:// URLs
    if (!Utils.isValidContentScriptUrl(window.location.href)) {
        Logger.debug('CONTENT', 'Browser page, not scanned');
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
        // Verify context before each retry attempt
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
                    Logger.debug('CONTENT', `${detectorCount} detectors loaded`);

                    // Set detectors in detection engine to enable smart data collection
                    detectionEngine.setDetectors(detectorsResponse.detectors);

                    detectorsLoaded = true;
                } else {
                    retryCount++;

                    if (retryCount < maxRetries) {
                        // Silent retry with exponential backoff
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        // Exponential backoff: 500ms → 1000ms
                        retryDelay = Math.min(retryDelay * 2, 1000);
                    }
                }
            } else {
                retryCount++;

                if (retryCount < maxRetries) {
                    // Silent retry with exponential backoff
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
                    // Silent retry with exponential backoff
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
        Logger.warn('CONTENT', '[init] Detector load failed after retries, collecting all data types as fallback');
    }

    // Note: JS hooks are installed by install-hooks.js at document_start (before this script runs)

    // Early cache check - skip all detection work if cached
    try {
        const cacheCheckResponse = await chrome.runtime.sendMessage({
            type: 'CHECK_CACHE_EARLY',
            url: window.location.href
        });

        if (cacheCheckResponse?.cacheHit) {
            Logger.content(`Cached result for ${Logger.hostOf(window.location.href)}: no scan needed`);

            // Set flag to prevent hook installation (ISOLATED world)
            window[CACHE_HIT_FLAG] = true;

            // Notify MAIN world about cache hit so hooks stop firing
            sendToMainWorld({
                type: BRIDGE_TYPES.CACHE_HIT,
                timestamp: Date.now()
            });

            // JS API: Still dispatch "ready" so page scripts can reliably initialize listeners
            // even when we exit early due to cache hit.
            await dispatchReadyEvent();

            // JS API: Dispatch detection event immediately with cached data
            const cachedData = cacheCheckResponse.detectionData;
            if (cachedData) {
                dispatchJsApiEvent('onDetection', {
                    url: window.location.href,
                    detections: cachedData.detectionResults || [],
                    detectionCount: cachedData.detectionCount || 0,
                    timestamp: cachedData.timestamp || new Date().toISOString(),
                    fromCache: true
                }).catch(e => Logger.error('CONTENT', 'Failed to dispatch cached detection event', e));
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

            // Keep lightweight page/message triggers active so a same-document
            // cache hit can still be re-scanned later if the user requests it.
            setupDetectionTriggers();

            // Exit initialization - don't run detection work
            return;
        } else {
            Logger.debug('CACHE', 'No cached result, scanning');
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
                        Logger.debug('CONTENT', '[init] Extension reloaded before initialization completed');
                        // Don't cleanup immediately, might be temporary
                    } else {
                        Logger.error('CONTENT', '[init] Failed to notify background', chrome.runtime.lastError);
                    }
                } else {
                }
            });
        } catch (error) {
            if (error.message && error.message.includes('Extension context invalidated')) {
                Logger.debug('CONTENT', '[init] Extension context invalidated during initialization');
                // Don't cleanup immediately, might be temporary
            } else {
                Logger.error('CONTENT', '[init] Error notifying background', error);
            }
        }
    } else {
        Logger.debug('CONTENT', '[init] Extension context not available');
    }
}

/**
 * Wait for Utils to load before initializing
 */
function waitForUtilsAndInitialize() {
    if (typeof Utils !== 'undefined') {
        if (typeof Logger !== 'undefined') {
            Logger.debug('CONTENT', 'Utils loaded, initializing');
        }
        initialize();
    } else {
        // Utils not yet loaded, wait and retry
        setTimeout(waitForUtilsAndInitialize, 50);
    }
}

// Don't clear cache here -- PAGE_LOAD_NOTIFICATION handles it

// Create hook batcher using DetectionEngineManager
const hookBatcher = DetectionEngineManager.createHookBatcher(chrome);

// Listen for JS Hook detections from MAIN world script
// Delegate to DetectionEngineManager.handleHookMessage()
// Relay cap for MAIN-world debug logs: the same LOG_* keys the MAIN world
// throttles with, from the config last sent to it (modules/core/hooks-config.js).
let debugLogWindowStart = Date.now();
let debugLogCount = 0;

function shouldForwardDebugLog() {
    const config = DetectionEngineManager.lastHooksConfig || HooksConfig.defaults;
    const now = Date.now();
    if (now - debugLogWindowStart >= config.LOG_RATE_WINDOW_MS) {
        debugLogWindowStart = now;
        debugLogCount = 0;
    }
    debugLogCount += 1;
    return debugLogCount <= config.LOG_MAX_PER_WINDOW;
}

window.addEventListener(SCRAPFLY_MAIN_TO_ISOLATED_EVENT, (event) => {
    event.stopImmediatePropagation?.();

    const data = getTrustedMainWorldMessageData(event);
    if (!data) return;

    // Stop propagation for hook detections to prevent page scripts from seeing them
    if (data.type === BRIDGE_TYPES.JS_HOOK_DETECTION) {
        event.stopImmediatePropagation?.();
    }

    // Forward hook failure reports from HookResilienceManager
    if (data.type === BRIDGE_TYPES.HOOK_FAILURE_REPORT) {
        try {
            chrome.runtime.sendMessage({
                type: BRIDGE_TYPES.HOOK_FAILURE_REPORT,
                target: data.target,
                failureType: data.failureType,
                message: data.message,
                timestamp: data.timestamp
            }).catch(() => {});
        } catch (e) {
            // Extension context invalidated - silently ignore
        }
        return;
    }

    // Forward window property detections from WindowPropertyTracker
    if (data.type === BRIDGE_TYPES.WINDOW_DETECTIONS) {
        try {
            chrome.runtime.sendMessage({
                type: BRIDGE_TYPES.WINDOW_DETECTIONS,
                detections: data.detections,
                timestamp: data.timestamp
            }).catch(() => {});
        } catch (e) {
            // Extension context invalidated - silently ignore
        }
        return;
    }

    // Forward debug logs from MAIN world to background service worker
    if (data.type === BRIDGE_TYPES.DEBUG_LOG) {
        if (!shouldForwardDebugLog()) {
            return;
        }
        try {
            chrome.runtime.sendMessage({
                type: BRIDGE_TYPES.DEBUG_LOG,
                level: data.level,
                message: data.message,
                source: data.source,
                timestamp: data.timestamp
            }).catch(() => {});
        } catch (e) {
            // Extension context invalidated - silently ignore
        }
        return;
    }

    // Dispatch JS API events for completion signals (before handleHookMessage sends to background with retry)
    if (data.type === BRIDGE_TYPES.JS_HOOKS_COMPLETE) {
        hooksMonitoringComplete = true;
        if (!detectionFinalized) {
            const hooksTs = (typeof data.timestamp === 'number')
                ? new Date(data.timestamp).toISOString()
                : (data.timestamp || new Date().toISOString());

            dispatchJsApiEvent('onHooksComplete', {
                url: data.url || window.location.href,
                timestamp: hooksTs,
                totalDetections: data.totalDetections,
                uniqueHooks: data.uniqueHooks,
                completionReason: data.completionReason,
                completionTime: data.completionTime,
                uninstallStats: data.uninstallStats
            }).catch(() => {});
        }
    }

    if (data.type === BRIDGE_TYPES.WINDOW_PROPS_COMPLETE) {
        if (!detectionFinalized) {
            const windowTs = (typeof data.timestamp === 'number')
                ? new Date(data.timestamp).toISOString()
                : (data.timestamp || new Date().toISOString());

            dispatchJsApiEvent('onWindowPropsComplete', {
                url: data.url || window.location.href,
                timestamp: windowTs,
                detectedCount: data.detectedCount,
                totalChecked: data.totalChecked,
                elapsedMs: data.elapsedMs,
                reason: data.reason
            }).catch(() => {});
        }
    }

    // handleHookMessage manages completion with retry
    DetectionEngineManager.handleHookMessage({ source: window, data }, chrome, hookBatcher);
}, true);

// Install hooks at document_start before page scripts; no async operations before installJSHooks()
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
    window[CACHE_HIT_FLAG] = false;
    initializeMainWorldBridge();

    // Install hooks immediately without async storage checks (cache/enabled checked after)
    window.__scrapflyHooksInstalled = true;
    installJSHooks();

    // Test Logger (with safety check)
    if (typeof Logger !== 'undefined') {
    }

    // Use flag to prevent duplicate triggers
    let hookStartTriggered = false;
    const triggerHookStart = () => {
        if (hookStartTriggered) return;
        hookStartTriggered = true;
        sendToMainWorld({
            type: BRIDGE_TYPES.PAGE_READY
        });
    };

    // Load event - most reliable for ensuring page is ready (with the fallback for
    // pages whose load never fires)
    onPageLoaded(triggerHookStart);
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
