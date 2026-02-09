/**
 * DataDome Script Interceptor
 * Captures DataDome script URLs from network requests
 */

// Guard against re-initialization (use var for service worker reload compatibility)
var datadomeInterceptionListener = datadomeInterceptionListener || null;
var datadomeStatusListener = datadomeStatusListener || null;

// Destructure helpers from BaseInterceptorHelpers (use var to avoid redeclaration errors)
var showNotification = self.BaseInterceptorHelpers?.showNotification;

// ============================================================================
// State Management
// ============================================================================

// ============================================================================
// Message Handler
// ============================================================================

/**
 * Handle DataDome messages from popup
 */
function handleDataDomeMessage(request, sender, sendResponse) {
    const { type } = request;

    switch (type) {
        case 'DATADOME_START_ANALYSIS':
            const analysisResult = datadomeStartAnalysis(request.tabId, request.url);
            sendResponse(analysisResult);
            return false; // sync response

        case 'DATADOME_SHOW_ANALYZING_NOTIFICATION':
            // Show analyzing notification (called right before page reload)
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        Logger.network('[DataDome] Showing analyzing notification before reload...');
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: 'Analyzing DataDome Scripts',
                            message: 'Please wait while we collect script URLs...',
                            duration: 15000 // Longer duration to persist through reload
                        });
                        Logger.network('[DataDome] Pre-reload notification shown successfully');
                    } else {
                        Logger.network('[DataDome] showNotification function not available');
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    Logger.error('NETWORK', '[DataDome] Error showing notification:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        default:
            return false;
    }
}

// ============================================================================
// Analysis Mode - Page Reload + Script Injection
// ============================================================================

/**
 * Start analysis mode - intercept network requests during page reload
 * @param {number} tabId - Tab ID
 * @param {string} url - URL of the tab
 * @returns {Object} Status response
 */
function datadomeStartAnalysis(tabId, url) {
    Logger.network('[DataDome-Analysis] Starting analysis mode for tab:', tabId);

    // Track captured URLs from network requests
    const capturedUrls = new Set();

    // Setup network request listener to capture all URLs during reload
    const requestListener = (details) => {
        if (details.tabId !== tabId) return;

        const requestUrl = details.url;

        // Check if URL contains DataDome tags.js
        if (requestUrl.includes('/tags.js')) {
            Logger.network('[DataDome-Analysis] Network - Found tags.js:', requestUrl);
            capturedUrls.add(JSON.stringify({ url: requestUrl, type: 'tags' }));
        }
    };

    // Setup navigation listener to finalize results after page loads
    const navigationListener = async (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            Logger.network('[DataDome-Analysis] Page loaded, waiting for all requests to complete...');

            // Note: Notification is shown before page reload via DATADOME_SHOW_ANALYZING_NOTIFICATION
            // No need to show it again here

            // Wait 5 seconds after page load to ensure all network requests are captured
            setTimeout(async () => {
                Logger.network('[DataDome-Analysis] ========== FINALIZING RESULTS ==========');

                // Convert Set to array of objects
                const finalResults = Array.from(capturedUrls).map(jsonStr => {
                    const obj = JSON.parse(jsonStr);
                    return { ...obj, source: 'network' };
                });

                Logger.network('[DataDome-Analysis] Final captured URLs:', finalResults);

                // Prepare analysis data
                const analysisData = {
                    scripts: finalResults,
                    scriptCount: finalResults.length
                };

                Logger.network('[DataDome-Analysis] Prepared analysis data:', analysisData);

                // Remove listeners
                chrome.webRequest.onBeforeRequest.removeListener(requestListener);
                chrome.webNavigation.onCompleted.removeListener(navigationListener);
                Logger.network('[DataDome-Analysis] Listeners removed');

                // Send message to popup if it's open
                try {
                    await chrome.runtime.sendMessage({
                        type: 'DATADOME_ANALYSIS_RESULT',
                        data: analysisData
                    });
                    Logger.network('[DataDome-Analysis] Results sent to popup');
                } catch (error) {
                    Logger.network('[DataDome-Analysis] Popup not available - results discarded');
                }
            }, 5000);
        }
    };

    // Register network request listener (intercept all requests)
    chrome.webRequest.onBeforeRequest.addListener(
        requestListener,
        { urls: ['<all_urls>'], tabId: tabId },
        []
    );

    // Register navigation listener
    chrome.webNavigation.onCompleted.addListener(navigationListener);

    Logger.network('[DataDome-Analysis] Network listener added, ready for page reload');

    return { status: 'started' };
}

// ============================================================================
// Exports
// ============================================================================

Logger.network('[DataDome] Interceptor loaded successfully');
