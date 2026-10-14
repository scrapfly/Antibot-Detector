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
    return AdvancedScriptAnalysis.start({ tabId, url, requestId, vendorId: 'datadome', classify: datadomeClassifyUrl });
}

/**
 * Which DataDome request a URL is, or null: the JavaScript tag (js.datadome.co
 * or first-party tags.js), its collector (api-js or js.datadome.co/js/), and on
 * captcha-delivery.com the challenge scripts (c.js, i.js) and the CAPTCHA or
 * interstitial page loaded in the block iframe.
 */
function datadomeClassifyUrl(requestUrl) {
    let parsed;
    try { parsed = new URL(requestUrl); } catch (_) { return null; }
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;
    if (host === 'captcha-delivery.com' || host.endsWith('.captcha-delivery.com')) {
        if (path === '/c.js') return 'captchaScript';
        if (path === '/i.js') return 'interstitialScript';
        if (path.startsWith('/captcha/check')) return 'captchaCheck';
        // The pages themselves, not their images, fonts or templates
        if (path === '/captcha/' || path === '/captcha') return 'captcha';
        if (path === '/interstitial/' || path === '/interstitial') return 'interstitial';
        return path.endsWith('.js') ? 'challengeScript' : null;
    }
    if ((host === 'api-js.datadome.co' || host === 'js.datadome.co') && path.startsWith('/js/')) return 'collector';
    if (path.endsWith('/tags.js')) return 'tags';
    return null;
}

// ============================================================================
// Exports
// ============================================================================

Logger.network('[DataDome] Interceptor loaded successfully');
