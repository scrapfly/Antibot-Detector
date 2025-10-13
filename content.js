/**
 * Content script for Scrapfly Security Detection Extension
 * Collects page data and sends it for analysis
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
 */
async function notifyPageLoad() {
    if (typeof Utils === 'undefined') {
        console.warn('Scrapfly Content Script: Utils not loaded, skipping page load notification');
        return;
    }
    return Utils.notifyPageLoad({
        detectionEngine: detectionEngine,
        isExtensionContextValid: isExtensionContextValid,
        cleanupOrphanedScript: cleanupOrphanedScript
    });
}

/**
 * Collect page data and send to background (called when cache miss)
 * Delegates to Utils.collectAndSendData()
 */
async function collectAndSendData() {
    if (typeof Utils === 'undefined') {
        console.warn('Scrapfly Content Script: Utils not loaded, skipping data collection');
        return;
    }
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

/**
 * Setup detection triggers
 * OPTIMIZED 2.3: Consolidated event listeners with debouncing
 */
function setupDetectionTriggers() {
    console.log('Scrapfly Content Script: Setting up detection triggers...');

    // Notify page load (background checks cache first)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', notifyPageLoad);
    } else {
        // DOM is already loaded, notify immediately
        setTimeout(notifyPageLoad, 100);
    }

    // OPTIMIZED: Single consolidated visibility handler (replaces separate visibility + focus listeners)
    // Only attach if not already disabled from cache hit
    if (!monitoringDisabled) {
        handleVisibilityChange = () => {
            if (!document.hidden && !hasCleanedUp && !monitoringDisabled) {
                // Debounce: clear existing timeout
                if (visibilityTimeout) clearTimeout(visibilityTimeout);
                visibilityTimeout = setTimeout(() => {
                    console.log('Scrapfly Content Script: Tab became visible/focused, notifying...');
                    notifyPageLoad();
                    visibilityTimeout = null;
                }, 100); // Small debounce to prevent rapid fire
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleVisibilityChange);
    }

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
                console.log('Scrapfly Content Script: URL changed, notifying...');
                notifyPageLoad();
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
                console.log('Scrapfly Content Script: Extension context invalidated, cannot respond to message');
                return false;
            }

            console.log('Scrapfly Content Script: Received message:', request);

            if (request.type === 'REQUEST_PAGE_DATA') {
                // Background requests data collection (cache miss)
                collectAndSendData();
                sendResponse({ status: 'collecting_data' });
            } else if (request.type === 'RUN_DETECTION') {
                // Manual detection request from popup (force bypass cache)
                collectAndSendData();
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
            }

            // Return true to indicate async response
            return true;
        });
    }

    console.log('Scrapfly Content Script: Detection triggers setup complete');
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
    console.log('Scrapfly Content Script: Initializing on', window.location.href);

    // Don't run on extension pages or chrome:// URLs
    if (!Utils.isValidContentScriptUrl(window.location.href)) {
        console.log('Scrapfly Content Script: Skipping initialization on browser page');
        return;
    }

    // Check if extension is enabled
    try {
        const result = await chrome.storage.local.get(['scrapfly_enabled']);
        if (result.scrapfly_enabled === false) {
            console.log('Scrapfly Content Script: Extension is disabled, skipping initialization');
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
    try {
        console.log('Scrapfly Content Script: Requesting detectors from background...');
        const detectorsResponse = await chrome.runtime.sendMessage({ type: 'GET_DETECTORS' });

        if (detectorsResponse && detectorsResponse.detectors) {
            // Count total detectors received
            const detectorCount = Object.values(detectorsResponse.detectors)
                .reduce((sum, category) => sum + Object.keys(category).length, 0);

            console.log(`Scrapfly Content Script: Received ${detectorCount} detectors from background`);

            // Set detectors in detection engine to enable smart data collection
            detectionEngine.setDetectors(detectorsResponse.detectors);

            console.log('[C.1] ✅ Detectors loaded - smart data collection enabled');
        } else {
            console.warn('[C.1] ⚠️ No detectors returned from background, will collect all data types');
        }
    } catch (error) {
        console.error('Scrapfly Content Script: Failed to load detectors:', error);
        console.warn('[C.1] ⚠️ Will collect all data types as fallback');
    }

    // Note: JS hooks are installed by install-hooks.js at document_start (before this script runs)

    // OPTIMIZED 2.5: Removed periodic context check interval
    // Context validity is now checked on-demand during actual operations (message sending, etc.)
    // This eliminates constant CPU wake-ups every 60 seconds

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
                    console.log('Scrapfly Content Script: Successfully notified background of readiness');
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
        console.log('Scrapfly Content Script: Utils loaded, initializing...');
        initialize();
    } else {
        console.log('Scrapfly Content Script: Waiting for Utils to load...');
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
    DetectionEngineManager.handleHookMessage(event, chrome, hookBatcher);
});

// Install hooks IMMEDIATELY (document_start) - don't wait for Utils
// This must run before page scripts to intercept API calls
// Wrapped in async IIFE to check enabled state first
(async function() {
    if (window.__scrapflyHooksInstalled) {
        return; // Already installed
    }

    // Check if extension is enabled before installing hooks
    try {
        const result = await chrome.storage.local.get(['scrapfly_enabled']);
        if (result.scrapfly_enabled === false) {
            console.log('Scrapfly Content Script: Extension is disabled, skipping hook installation');
            return;
        }
    } catch (error) {
        console.error('Scrapfly Content Script: Failed to check enabled state for hooks:', error);
        // Continue with hook installation on error (fail-safe)
    }

    window.__scrapflyHooksInstalled = true;
    installJSHooks();
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