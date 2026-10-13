/**
 * DataDome Script Interceptor
 * Captures DataDome script URLs from network requests
 */

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
            const analysisResult = datadomeStartAnalysis(request.tabId, request.url, request.requestId);
            sendResponse(analysisResult);
            return false; // sync response

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
function datadomeStartAnalysis(tabId, url, requestId) {
    return AdvancedScriptAnalysis.start({ tabId, url, requestId, vendorId: 'datadome', classify(requestUrl) {
        return requestUrl.includes('/tags.js') ? 'tags' : null;
    } });
}

// ============================================================================
// Exports
// ============================================================================

Logger.network('[DataDome] Interceptor loaded successfully');
