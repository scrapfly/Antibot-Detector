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
    cleanupManagedListeners(tabId);
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
      const analysisResult = awsWafStartAnalysis(message.tabId, message.url);
      sendResponse(analysisResult);
      return false; // sync response

    case 'AWSWAF_SHOW_ANALYZING_NOTIFICATION':
      // Show analyzing notification (called right before page reload)
      (async () => {
        try {
          if (typeof showNotification === 'function') {
            Logger.network('[AwsWaf] Showing analyzing notification before reload...');
            await showNotification(message.tabId, {
              type: 'loading',
              title: 'Analyzing AWS WAF Scripts',
              message: 'Please wait while we collect script URLs...',
              duration: 15000 // Longer duration to persist through reload
            });
            Logger.network('[AwsWaf] Pre-reload notification shown successfully');
          } else {
            Logger.network('[AwsWaf] showNotification function not available');
          }
          sendResponse({ status: 'success' });
        } catch (error) {
          Logger.error('NETWORK', '[AwsWaf] Error showing notification:', error);
          sendResponse({ status: 'error', error: error.message });
        }
      })();
      return true; // Async response

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
function awsWafStartAnalysis(tabId, url) {
  Logger.network('[AwsWaf-Analysis] Starting analysis mode for tab:', tabId);

  // Track captured URLs from network requests
  const capturedUrls = new Set();

  // Setup network request listener to capture all URLs during reload
  const requestListener = (details) => {
    if (details.tabId !== tabId) return;

    const requestUrl = details.url;

    // Check if URL contains what we're looking for
    if (requestUrl.includes('/challenge.js')) {
      Logger.network('[AwsWaf-Analysis] Network - Found challenge.js:', requestUrl);
      capturedUrls.add(JSON.stringify({ url: requestUrl, type: 'challenge' }));
    } else if (requestUrl.includes('/captcha.js')) {
      Logger.network('[AwsWaf-Analysis] Network - Found captcha.js:', requestUrl);
      capturedUrls.add(JSON.stringify({ url: requestUrl, type: 'captcha' }));
    } else if (requestUrl.includes('awswaf.com')) {
      Logger.network('[AwsWaf-Analysis] Network - Found awswaf.com URL:', requestUrl);
      capturedUrls.add(JSON.stringify({ url: requestUrl, type: 'awswaf' }));
    }
  };

  // Setup navigation listener to finalize results after page loads
  const navigationListener = async (details) => {
    if (details.tabId === tabId && details.frameId === 0) {
      Logger.network('[AwsWaf-Analysis] Page loaded, waiting for all requests to complete...');

      // Note: Notification is shown before page reload via AWSWAF_SHOW_ANALYZING_NOTIFICATION
      // No need to show it again here

      // Wait 5 seconds after page load to ensure all network requests are captured
      setTimeout(async () => {
        Logger.network('[AwsWaf-Analysis] ========== FINALIZING RESULTS ==========');

        // Convert Set to array of objects
        const finalResults = Array.from(capturedUrls).map(jsonStr => {
          const obj = JSON.parse(jsonStr);
          return { ...obj, source: 'network' };
        });

        Logger.network('[AwsWaf-Analysis] Final captured URLs:', finalResults);

        // Prepare analysis data
        const analysisData = {
          scripts: finalResults,
          scriptCount: finalResults.length
        };

        Logger.network('[AwsWaf-Analysis] Prepared analysis data:', analysisData);

        // Remove listeners
        chrome.webRequest.onBeforeRequest.removeListener(requestListener);
        chrome.webNavigation.onCompleted.removeListener(navigationListener);
        Logger.network('[AwsWaf-Analysis] Listeners removed');

        // Send message to popup if it's open
        try {
          await chrome.runtime.sendMessage({
            type: 'AWSWAF_ANALYSIS_RESULT',
            data: analysisData
          });
          Logger.network('[AwsWaf-Analysis] Results sent to popup');
        } catch (error) {
          Logger.network('[AwsWaf-Analysis] Popup not available - results discarded');
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

  Logger.network('[AwsWaf-Analysis] Network listener added, ready for page reload');

  return { status: 'started' };
}

// ============================================================================
// Exports
// ============================================================================

Logger.network('[AwsWaf] Interceptor loaded successfully');
