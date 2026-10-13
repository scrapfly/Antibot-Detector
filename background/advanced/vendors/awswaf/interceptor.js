/**
 * AWS WAF Captcha Interceptor
 * Captures AWS WAF parameters from network requests and page context
 */

// Guard against re-initialization (use var for service worker reload compatibility)
var awsWafInterceptionListener = awsWafInterceptionListener || null;
var awsWafStatusListener = awsWafStatusListener || null;

// Destructure helpers from BaseInterceptorHelpers (use var to avoid redeclaration errors)
var showNotification = self.BaseInterceptorHelpers?.showNotification;
var showCaptureStarted = self.BaseInterceptorHelpers?.showCaptureStarted;
var getCaptureState = self.BaseInterceptorHelpers?.getCaptureState;
var removeCaptureState = self.BaseInterceptorHelpers?.removeCaptureState;
var registerManagedListener = self.BaseInterceptorHelpers?.registerManagedListener;
var cleanupManagedListeners = self.BaseInterceptorHelpers?.cleanupManagedListeners;

// ============================================================================
// State Management (initialized via awsWafInitializeInterceptor)
// ============================================================================
var awsWafCaptureStateRef = awsWafCaptureStateRef || null;

/**
 * Initialize AWS WAF interceptor with capture state from background.js
 * @param {TTLMap} captureState - TTLMap instance from background.js
 */
function awsWafInitializeInterceptor(captureState) {
  if (awsWafCaptureStateRef) {
    Logger.network('[AwsWaf] Interceptor already initialized, skipping');
    return;
  }
  awsWafCaptureStateRef = captureState;

  // Cleanup any existing listeners
  if (awsWafInterceptionListener) {
    try {
      chrome.webRequest.onBeforeRequest.removeListener(awsWafInterceptionListener);
    } catch (e) {
      Logger.network('[AwsWaf] No existing request listener to remove');
    }
  }

  if (awsWafStatusListener) {
    try {
      chrome.webRequest.onCompleted.removeListener(awsWafStatusListener);
    } catch (e) {
      Logger.network('[AwsWaf] No existing status listener to remove');
    }
  }

  awsWafInterceptionListener = null;
  awsWafStatusListener = null;

  Logger.network('[AwsWaf] Interceptor initialized');
}

// ============================================================================
// Capture Control
// ============================================================================

/**
 * Stop capturing AWS WAF data
 * @param {number} tabId - Tab ID to stop capturing for
 */
function awsWafStopCapture(tabId) {
  Logger.network('[AwsWaf] Stopping capture for tab:', tabId);

  if (typeof cleanupManagedListeners === 'function' && tabId != null) {
    cleanupManagedListeners(tabId, 'awswaf');
  }

  // Remove listeners
  if (awsWafInterceptionListener) {
    try {
      chrome.webRequest.onBeforeRequest.removeListener(awsWafInterceptionListener);
    } catch (e) {
      Logger.network('[AwsWaf] Error removing request listener:', e);
    }
  }

  if (awsWafStatusListener) {
    try {
      chrome.webRequest.onCompleted.removeListener(awsWafStatusListener);
    } catch (e) {
      Logger.network('[AwsWaf] Error removing status listener:', e);
    }
  }

  awsWafInterceptionListener = null;
  awsWafStatusListener = null;

  // Remove state from map
  if (awsWafCaptureStateRef && tabId != null) {
    if (typeof removeCaptureState === 'function') {
      removeCaptureState(awsWafCaptureStateRef, tabId);
    } else {
      awsWafCaptureStateRef.delete(tabId);
    }
  }

  Logger.network('[AwsWaf] Capture stopped');
}

// ============================================================================
// Network Interception
// ============================================================================

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Handle AWS WAF related messages
 * @param {Object} message - Message object
 * @param {Object} sender - Sender info
 * @param {Function} sendResponse - Response callback
 * @param {TTLMap} captureState - TTLMap from background.js
 * @returns {boolean} True if async response
 */
function handleAwsWafMessage(message, sender, sendResponse, captureState) {
  // Initialize interceptor with TTLMap from background.js on first message
  if (captureState) {
    awsWafInitializeInterceptor(captureState);
  }

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
    return AdvancedScriptAnalysis.start({ tabId, url, requestId, vendorId: 'awswaf', classify(requestUrl) {
        return requestUrl.includes('/challenge.js') ? 'challenge' : requestUrl.includes('/captcha.js') ? 'captcha' : requestUrl.includes('awswaf.com') ? 'awswaf' : null;
    } });
}

// ============================================================================
// Exports
// ============================================================================

Logger.network('[AwsWaf] Interceptor loaded successfully');
