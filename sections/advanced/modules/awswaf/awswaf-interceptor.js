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
 * Start capturing AWS WAF data
 * @param {number} tabId - Tab ID to capture from
 * @param {string} url - URL of the tab
 */
function awsWafStartCapture(tabId, url) {
  Logger.network('[AwsWaf] Starting capture for tab:', tabId, 'url:', url);

  // Stop any existing capture for this tab
  if (awsWafCaptureStateRef && awsWafCaptureStateRef.has(tabId)) {
    awsWafStopCapture(tabId);
  }

  // Set state on map
  awsWafCaptureStateRef.set(tabId, {
    url: url,
    capturedData: {
      websiteURL: url,
      awsChallengeJS: null,
      awsApiJs: null,
      awsProblemUrl: null,
      awsApiKey: null,
      awsExistingToken: null
    },
    detectionFlags: {
      hasStatus405: false,
      hasChallengeEndpoint: false,
      hasProblemEndpoint: false
    }
  });

  // Setup interceptor
  setupAwsWafInterceptor(tabId);

  // Show standardized in-page notification
  if (typeof showCaptureStarted === 'function') {
    showCaptureStarted(tabId, {
      title: 'AWS WAF Monitoring Started',
      message: 'Reload the page to begin monitoring AWS WAF requests',
      duration: Constants.CAPTURE_AUTO_STOP_TIMEOUT
    }).catch(err => {
      Logger.error('NETWORK', '[AwsWaf] Failed to show notification:', err);
    });
  } else if (showNotification) {
    showNotification(tabId, {
      type: 'capture',
      title: 'AWS WAF Monitoring Started',
      message: 'Reload the page to begin monitoring AWS WAF requests',
      duration: Constants.CAPTURE_AUTO_STOP_TIMEOUT
    }).catch(err => {
      Logger.error('NETWORK', '[AwsWaf] Failed to show notification:', err);
    });
  }

  Logger.network('[AwsWaf] Capture started');

  return {
    status: 'started',
    message: 'AWS WAF monitoring started. Reload the page to begin capture.',
    tabId: tabId
  };
}

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

/**
 * Setup network interceptor for AWS WAF requests
 * @param {number} tabId - Tab ID to monitor
 */
function setupAwsWafInterceptor(tabId) {
  Logger.network('[AwsWaf] Setting up interceptor for tab:', tabId);

  // Request listener - Monitor URLs
  awsWafInterceptionListener = (details) => {
    if (details.tabId !== tabId) return;
    const state = awsWafCaptureStateRef ? awsWafCaptureStateRef.get(tabId) : null;
    if (!state) return;

    const url = details.url;
    Logger.network('[AwsWaf] Intercepted request:', url);

    // Check for jsapi.js
    if (url.includes('jsapi.js')) {
      Logger.network('[AwsWaf] Found jsapi.js:', url);
      state.capturedData.awsApiJs = url;
    }

    // Check for challenge.js
    if (url.includes('challenge.js')) {
      Logger.network('[AwsWaf] Found challenge.js:', url);
      state.capturedData.awsChallengeJS = url;
    }

    // Check for /problem endpoint
    if (url.includes('/problem')) {
      Logger.network('[AwsWaf] Found problem endpoint:', url);
      state.capturedData.awsProblemUrl = url;
      state.detectionFlags.hasProblemEndpoint = true;

      // Extract api_key from query parameters
      try {
        const urlObj = new URL(url);
        const apiKey = urlObj.searchParams.get('api_key');
        if (apiKey) {
          Logger.network('[AwsWaf] Extracted api_key:', apiKey);
          state.capturedData.awsApiKey = apiKey;
        }
      } catch (e) {
        Logger.error('NETWORK', '[AwsWaf] Error parsing problem URL:', e);
      }
    }
  };

  // Status listener - Monitor status codes
  awsWafStatusListener = (details) => {
    if (details.tabId !== tabId) return;
    const state = awsWafCaptureStateRef ? awsWafCaptureStateRef.get(tabId) : null;
    if (!state) return;

    const url = details.url;
    const statusCode = details.statusCode;

    Logger.network('[AwsWaf] Response status:', statusCode, 'for URL:', url);

    // Check for status 405 - AWS Captcha indicator
    if (statusCode === 405) {
      Logger.network('[AwsWaf] Detected status 405 - AWS Captcha');
      state.detectionFlags.hasStatus405 = true;
    }

    // Check for status 202 with /challenge endpoint
    if (statusCode === 202 && url.includes('/challenge')) {
      Logger.network('[AwsWaf] Detected status 202 with /challenge - Challenge endpoint');
      state.detectionFlags.hasChallengeEndpoint = true;
    }
  };

  // Register listeners
  chrome.webRequest.onBeforeRequest.addListener(
    awsWafInterceptionListener,
    { urls: ['<all_urls>'], tabId: tabId },
    []
  );

  chrome.webRequest.onCompleted.addListener(
    awsWafStatusListener,
    { urls: ['<all_urls>'], tabId: tabId },
    []
  );

  if (typeof registerManagedListener === 'function') {
    registerManagedListener(
      tabId,
      'awswaf-before-request',
      awsWafInterceptionListener,
      chrome.webRequest.onBeforeRequest.removeListener.bind(chrome.webRequest.onBeforeRequest)
    );
    registerManagedListener(
      tabId,
      'awswaf-completed',
      awsWafStatusListener,
      chrome.webRequest.onCompleted.removeListener.bind(chrome.webRequest.onCompleted)
    );
  }

  Logger.network('[AwsWaf] Interceptor setup complete');
}

// ============================================================================
// Page Data Extraction
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
    case 'AWSWAF_START_CAPTURE':
      const startResult = awsWafStartCapture(message.tabId, message.url);
      sendResponse(startResult);
      return false;

    case 'AWSWAF_STOP_CAPTURE':
      awsWafStopCapture(message.tabId);
      sendResponse({ status: 'stopped' });
      return false;

    case 'AWSWAF_GET_STATE': {
      const state = awsWafCaptureStateRef ? awsWafCaptureStateRef.get(message.tabId) : null;
      sendResponse({
        isCapturing: !!state,
        tabId: message.tabId,
        capturedData: state ? state.capturedData : {}
      });
      return false;
    }

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
