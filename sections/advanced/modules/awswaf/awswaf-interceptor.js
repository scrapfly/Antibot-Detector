/**
 * AWS WAF Captcha Interceptor
 * Captures AWS WAF parameters from network requests and page context
 */

// Guard against re-initialization (use var for service worker reload compatibility)
var awsWafInterceptionListener = awsWafInterceptionListener || null;
var awsWafStatusListener = awsWafStatusListener || null;

// Destructure helpers from BaseInterceptorHelpers (use var to avoid redeclaration errors)
var showNotification = self.BaseInterceptorHelpers?.showNotification;

// ============================================================================
// State Management
// ============================================================================
var awsWafCaptureStateRef = {
  isCapturing: false,
  tabId: null,
  url: null,
  capturedData: {
    websiteURL: null,
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
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize AWS WAF interceptor on extension load
 */
function awsWafInitializeInterceptor() {
  console.log('[AwsWaf] Initializing interceptor');

  // Cleanup any existing listeners
  if (awsWafInterceptionListener) {
    try {
      chrome.webRequest.onBeforeRequest.removeListener(awsWafInterceptionListener);
    } catch (e) {
      console.log('[AwsWaf] No existing request listener to remove');
    }
  }

  if (awsWafStatusListener) {
    try {
      chrome.webRequest.onCompleted.removeListener(awsWafStatusListener);
    } catch (e) {
      console.log('[AwsWaf] No existing status listener to remove');
    }
  }

  awsWafInterceptionListener = null;
  awsWafStatusListener = null;

  console.log('[AwsWaf] Interceptor initialized');
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
  console.log('[AwsWaf] Starting capture for tab:', tabId, 'url:', url);

  // Stop any existing capture
  awsWafStopCapture();

  // Reset state
  awsWafCaptureStateRef.isCapturing = true;
  awsWafCaptureStateRef.tabId = tabId;
  awsWafCaptureStateRef.url = url;
  awsWafCaptureStateRef.capturedData = {
    websiteURL: url,
    awsChallengeJS: null,
    awsApiJs: null,
    awsProblemUrl: null,
    awsApiKey: null,
    awsExistingToken: null
  };
  awsWafCaptureStateRef.detectionFlags = {
    hasStatus405: false,
    hasChallengeEndpoint: false,
    hasProblemEndpoint: false
  };

  // Setup interceptor
  setupAwsWafInterceptor(tabId);

  // Show standardized in-page notification
  if (showNotification) {
    showNotification(tabId, {
      type: 'capture',
      title: '🎯 AWS WAF Capture Active',
      message: '🔄 Please reload the page to start monitoring',
      duration: 60000
    }).catch(err => {
      console.error('[AwsWaf] Failed to show notification:', err);
    });
  }

  console.log('[AwsWaf] Capture started');

  return {
    status: 'started',
    message: 'AWS WAF capture started. Page will reload to capture data.',
    tabId: tabId
  };
}

/**
 * Stop capturing AWS WAF data
 */
function awsWafStopCapture() {
  console.log('[AwsWaf] Stopping capture');

  // Remove listeners
  if (awsWafInterceptionListener) {
    try {
      chrome.webRequest.onBeforeRequest.removeListener(awsWafInterceptionListener);
    } catch (e) {
      console.log('[AwsWaf] Error removing request listener:', e);
    }
  }

  if (awsWafStatusListener) {
    try {
      chrome.webRequest.onCompleted.removeListener(awsWafStatusListener);
    } catch (e) {
      console.log('[AwsWaf] Error removing status listener:', e);
    }
  }

  awsWafInterceptionListener = null;
  awsWafStatusListener = null;

  // Reset state
  awsWafCaptureStateRef.isCapturing = false;
  awsWafCaptureStateRef.tabId = null;
  awsWafCaptureStateRef.url = null;

  console.log('[AwsWaf] Capture stopped');
}

// ============================================================================
// Network Interception
// ============================================================================

/**
 * Setup network interceptor for AWS WAF requests
 * @param {number} tabId - Tab ID to monitor
 */
function setupAwsWafInterceptor(tabId) {
  console.log('[AwsWaf] Setting up interceptor for tab:', tabId);

  // Request listener - Monitor URLs
  awsWafInterceptionListener = (details) => {
    if (details.tabId !== tabId) return;
    if (!awsWafCaptureStateRef.isCapturing) return;

    const url = details.url;
    console.log('[AwsWaf] Intercepted request:', url);

    // Check for jsapi.js
    if (url.includes('jsapi.js')) {
      console.log('[AwsWaf] Found jsapi.js:', url);
      awsWafCaptureStateRef.capturedData.awsApiJs = url;
    }

    // Check for challenge.js
    if (url.includes('challenge.js')) {
      console.log('[AwsWaf] Found challenge.js:', url);
      awsWafCaptureStateRef.capturedData.awsChallengeJS = url;
    }

    // Check for /problem endpoint
    if (url.includes('/problem')) {
      console.log('[AwsWaf] Found problem endpoint:', url);
      awsWafCaptureStateRef.capturedData.awsProblemUrl = url;
      awsWafCaptureStateRef.detectionFlags.hasProblemEndpoint = true;

      // Extract api_key from query parameters
      try {
        const urlObj = new URL(url);
        const apiKey = urlObj.searchParams.get('api_key');
        if (apiKey) {
          console.log('[AwsWaf] Extracted api_key:', apiKey);
          awsWafCaptureStateRef.capturedData.awsApiKey = apiKey;
        }
      } catch (e) {
        console.error('[AwsWaf] Error parsing problem URL:', e);
      }
    }
  };

  // Status listener - Monitor status codes
  awsWafStatusListener = (details) => {
    if (details.tabId !== tabId) return;
    if (!awsWafCaptureStateRef.isCapturing) return;

    const url = details.url;
    const statusCode = details.statusCode;

    console.log('[AwsWaf] Response status:', statusCode, 'for URL:', url);

    // Check for status 405 - AWS Captcha indicator
    if (statusCode === 405) {
      console.log('[AwsWaf] Detected status 405 - AWS Captcha');
      awsWafCaptureStateRef.detectionFlags.hasStatus405 = true;
    }

    // Check for status 202 with /challenge endpoint
    if (statusCode === 202 && url.includes('/challenge')) {
      console.log('[AwsWaf] Detected status 202 with /challenge - Challenge endpoint');
      awsWafCaptureStateRef.detectionFlags.hasChallengeEndpoint = true;
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

  console.log('[AwsWaf] Interceptor setup complete');
}

// ============================================================================
// Page Data Extraction
// ============================================================================

/**
 * Read AWS WAF token cookie
 * @param {string} url - URL to get cookies for
 * @returns {Promise<string|null>} Cookie value or null
 */
async function awsWafReadCookie(url) {
  console.log('[AwsWaf] Reading aws-waf-token cookie for:', url);

  try {
    const cookies = await chrome.cookies.getAll({ url: url });
    const awsWafToken = cookies.find(c => c.name === 'aws-waf-token');

    if (awsWafToken) {
      console.log('[AwsWaf] Found aws-waf-token cookie:', awsWafToken.value);
      return awsWafToken.value;
    }

    console.log('[AwsWaf] No aws-waf-token cookie found');
    return null;

  } catch (error) {
    console.error('[AwsWaf] Error reading cookie:', error);
    return null;
  }
}

// ============================================================================
// Capture Completion
// ============================================================================

/**
 * Handle capture completion
 * Saves data to history and notifies popup
 * @param {number} tabId - Tab ID
 */
async function handleAwsWafCaptureCompleted(tabId) {
  console.log('[AwsWaf] ========== CAPTURE COMPLETED ==========');
  console.log('[AwsWaf] Captured data:', awsWafCaptureStateRef.capturedData);
  console.log('[AwsWaf] Detection flags:', awsWafCaptureStateRef.detectionFlags);

  // Prepare history entry
  const historyEntry = {
    timestamp: Date.now(),
    url: awsWafCaptureStateRef.url,
    data: { ...awsWafCaptureStateRef.capturedData },
    flags: { ...awsWafCaptureStateRef.detectionFlags }
  };

  // Save to history
  try {
    await saveToHistory('awswaf', historyEntry);
    console.log('[AwsWaf] Saved to history');
  } catch (error) {
    console.error('[AwsWaf] Error saving to history:', error);
  }

  // Show standardized success notification
  if (showNotification) {
    const capturedCount = Object.values(awsWafCaptureStateRef.capturedData).filter(v => v !== null).length - 1; // -1 for websiteURL
    showNotification(tabId, {
      type: 'success',
      title: '✅ Capture Completed',
      message: `AWS WAF data captured (${capturedCount} items)`,
      duration: 5000
    }).catch(err => {
      console.error('[AwsWaf] Failed to show notification:', err);
    });
  }

  // Stop capture
  awsWafStopCapture();

  // Send message to popup if it's open
  try {
    chrome.runtime.sendMessage({
      type: 'AWSWAF_CAPTURE_COMPLETED',
      tabId: tabId,
      data: historyEntry
    });
  } catch (error) {
    console.log('[AwsWaf] Popup not open, capture completed silently');
  }
}

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Handle AWS WAF related messages
 * @param {Object} message - Message object
 * @param {Object} sender - Sender info
 * @param {Function} sendResponse - Response callback
 * @returns {boolean} True if async response
 */
function handleAwsWafMessage(message, sender, sendResponse) {
  console.log('[AwsWaf] Received message:', message.type);

  switch (message.type) {
    case 'AWSWAF_START_CAPTURE':
      const startResult = awsWafStartCapture(message.tabId, message.url);
      sendResponse(startResult);
      return false;

    case 'AWSWAF_STOP_CAPTURE':
      awsWafStopCapture();
      sendResponse({ status: 'stopped' });
      return false;

    case 'AWSWAF_GET_STATE':
      sendResponse({
        isCapturing: awsWafCaptureStateRef.isCapturing,
        tabId: awsWafCaptureStateRef.tabId,
        capturedData: awsWafCaptureStateRef.capturedData
      });
      return false;

    case 'AWSWAF_START_ANALYSIS':
      const analysisResult = awsWafStartAnalysis(message.tabId, message.url);
      sendResponse(analysisResult);
      return false; // sync response

    case 'AWSWAF_SHOW_ANALYZING_NOTIFICATION':
      // Show analyzing notification (called right before page reload)
      (async () => {
        try {
          if (typeof showNotification === 'function') {
            console.log('[AwsWaf] Showing analyzing notification before reload...');
            await showNotification(message.tabId, {
              type: 'loading',
              title: '🔍 Analyzing AWS WAF Scripts',
              message: 'Please wait while we collect script URLs...',
              duration: 15000 // Longer duration to persist through reload
            });
            console.log('[AwsWaf] Pre-reload notification shown successfully');
          } else {
            console.log('[AwsWaf] showNotification function not available');
          }
          sendResponse({ status: 'success' });
        } catch (error) {
          console.error('[AwsWaf] Error showing notification:', error);
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
  console.log('[AwsWaf-Analysis] Starting analysis mode for tab:', tabId);

  // Track captured URLs from network requests
  const capturedUrls = new Set();

  // Setup network request listener to capture all URLs during reload
  const requestListener = (details) => {
    if (details.tabId !== tabId) return;

    const requestUrl = details.url;

    // Check if URL contains what we're looking for
    if (requestUrl.includes('/challenge.js')) {
      console.log('[AwsWaf-Analysis] Network - Found challenge.js:', requestUrl);
      capturedUrls.add(JSON.stringify({ url: requestUrl, type: 'challenge' }));
    } else if (requestUrl.includes('/captcha.js')) {
      console.log('[AwsWaf-Analysis] Network - Found captcha.js:', requestUrl);
      capturedUrls.add(JSON.stringify({ url: requestUrl, type: 'captcha' }));
    } else if (requestUrl.includes('awswaf.com')) {
      console.log('[AwsWaf-Analysis] Network - Found awswaf.com URL:', requestUrl);
      capturedUrls.add(JSON.stringify({ url: requestUrl, type: 'awswaf' }));
    }
  };

  // Setup navigation listener to finalize results after page loads
  const navigationListener = async (details) => {
    if (details.tabId === tabId && details.frameId === 0) {
      console.log('[AwsWaf-Analysis] Page loaded, waiting for all requests to complete...');

      // Note: Notification is shown before page reload via AWSWAF_SHOW_ANALYZING_NOTIFICATION
      // No need to show it again here

      // Wait 5 seconds after page load to ensure all network requests are captured
      setTimeout(async () => {
        console.log('[AwsWaf-Analysis] ========== FINALIZING RESULTS ==========');

        // Convert Set to array of objects
        const finalResults = Array.from(capturedUrls).map(jsonStr => {
          const obj = JSON.parse(jsonStr);
          return { ...obj, source: 'network' };
        });

        console.log('[AwsWaf-Analysis] Final captured URLs:', finalResults);

        // Prepare analysis data
        const analysisData = {
          scripts: finalResults,
          scriptCount: finalResults.length
        };

        console.log('[AwsWaf-Analysis] Prepared analysis data:', analysisData);

        // Remove listeners
        chrome.webRequest.onBeforeRequest.removeListener(requestListener);
        chrome.webNavigation.onCompleted.removeListener(navigationListener);
        console.log('[AwsWaf-Analysis] Listeners removed');

        // Send message to popup if it's open
        try {
          await chrome.runtime.sendMessage({
            type: 'AWSWAF_ANALYSIS_RESULT',
            data: analysisData
          });
          console.log('[AwsWaf-Analysis] ✓ Results sent to popup');
        } catch (error) {
          console.log('[AwsWaf-Analysis] Popup not available - results discarded');
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

  console.log('[AwsWaf-Analysis] Network listener added, ready for page reload');

  return { status: 'started' };
}

// ============================================================================
// Exports
// ============================================================================

console.log('[AwsWaf] Interceptor loaded successfully');
