/**
 * AWS WAF: Analyze Scripts (the worker watches the reloaded tab and lists
 * challenge.js, captcha.js and jsapi.js from *.awswaf.com).
 */

/**
 * Handle AWS WAF related messages
 * @param {Object} message - Message object
 * @param {Object} sender - Sender info
 * @param {Function} sendResponse - Response callback
 * @returns {boolean} True if async response
 */
function handleAwsWafMessage(message, sender, sendResponse) {
  Logger.network('[AwsWaf] Received message:', message.type);

  switch (message.type) {
    case 'AWSWAF_START_ANALYSIS':
      const analysisResult = awsWafStartAnalysis(message.tabId, message.url, message.requestId);
      sendResponse(analysisResult);
      return false; // sync response

    default:
      return false;
  }
}

// ============================================================================
// Analysis Mode - Page Reload + Script Injection (Shape Security Style)
// ============================================================================

/**
 * Start analysis mode - intercept network requests during page reload
 * @param {number} tabId - Tab ID
 * @param {string} url - URL of the tab
 * @returns {Object} Status response
 */
function awsWafStartAnalysis(tabId, url, requestId) {
    return AdvancedScriptAnalysis.start({ tabId, url, requestId, vendorId: 'awswaf', classify: awsWafClassifyUrl });
}

/**
 * Which AWS WAF request a URL is, or null: challenge.js, captcha.js and
 * jsapi.js, and anything else served from an *.awswaf.com host.
 */
function awsWafClassifyUrl(requestUrl) {
    let parsed;
    try { parsed = new URL(requestUrl); } catch (_) { return null; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;
    if (host !== 'awswaf.com' && !host.endsWith('.awswaf.com')) return null;
    if (path.endsWith('/challenge.js')) return 'challenge';
    if (path.endsWith('/captcha.js')) return 'captcha';
    if (path.endsWith('/jsapi.js')) return 'jsapi';
    return 'awswaf';
}

// ============================================================================
// Exports
// ============================================================================

Logger.network('[AwsWaf] Interceptor loaded successfully');
