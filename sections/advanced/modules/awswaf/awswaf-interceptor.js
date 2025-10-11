/**
 * AWS WAF Captcha Interceptor
 * Captures AWS WAF parameters from network requests and page context
 */

// Guard to prevent redeclaration during extension reloads
if (typeof awsWafInterceptionListener !== 'undefined') {
  console.log('[AwsWaf] Interceptor already loaded, skipping redeclaration');
} else {

// Destructure helpers from BaseInterceptorHelpers (use var to avoid redeclaration errors)
var showNotification = self.BaseInterceptorHelpers?.showNotification;

// ============================================================================
// State Management
// ============================================================================

var awsWafInterceptionListener = null;
var awsWafStatusListener = null;
var awsWafCaptureStateRef = {
  isCapturing: false,
  tabId: null,
  url: null,
  capturedData: {
    websiteURL: null,
    awsKey: null,
    awsIv: null,
    awsContext: null,
    awsChallengeJS: null,
    awsApiJs: null,
    awsProblemUrl: null,
    awsApiKey: null,
    awsExistingToken: null
  },
  detectionFlags: {
    hasGokuProps: false,
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
    awsKey: null,
    awsIv: null,
    awsContext: null,
    awsChallengeJS: null,
    awsApiJs: null,
    awsProblemUrl: null,
    awsApiKey: null,
    awsExistingToken: null
  };
  awsWafCaptureStateRef.detectionFlags = {
    hasGokuProps: false,
    hasStatus405: false,
    hasChallengeEndpoint: false,
    hasProblemEndpoint: false
  };

  // Setup interceptor
  setupAwsWafInterceptor(tabId);

  // Show standardized in-page notification
  if (showNotification) {
    showNotification(tabId, {
      type: 'info',
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
 * Extract AWS WAF data from page context
 * Uses world: 'MAIN' to access window variables
 * @param {number} tabId - Tab ID to extract from
 * @returns {Promise<Object>} Extracted data
 */
async function awsWafExtractPageData(tabId) {
  console.log('[AwsWaf] Extracting page data from tab:', tabId);

  try {
    // Execute script in MAIN world to access page variables
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: () => {
        const data = {
          awsKey: null,
          awsIv: null,
          awsContext: null,
          hasGokuProps: false
        };

        // Check for window.gokuProps
        if (typeof window.gokuProps !== 'undefined') {
          console.log('[AwsWaf] Found window.gokuProps');
          data.hasGokuProps = true;
        }

        // Extract awsWafCaptchaKey
        if (typeof window.awsWafCaptchaKey !== 'undefined') {
          data.awsKey = window.awsWafCaptchaKey;
          console.log('[AwsWaf] Found awsWafCaptchaKey:', data.awsKey);
        }

        // Extract awsWafCaptchaIv
        if (typeof window.awsWafCaptchaIv !== 'undefined') {
          data.awsIv = window.awsWafCaptchaIv;
          console.log('[AwsWaf] Found awsWafCaptchaIv:', data.awsIv);
        }

        // Extract awsWafCaptchaContext
        if (typeof window.awsWafCaptchaContext !== 'undefined') {
          data.awsContext = window.awsWafCaptchaContext;
          console.log('[AwsWaf] Found awsWafCaptchaContext:', data.awsContext);
        }

        return data;
      }
    });

    if (results && results[0] && results[0].result) {
      const pageData = results[0].result;
      console.log('[AwsWaf] Page data extracted:', pageData);
      return pageData;
    }

    console.log('[AwsWaf] No page data found');
    return null;

  } catch (error) {
    console.error('[AwsWaf] Error extracting page data:', error);
    return null;
  }
}

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
// Tab Update Handler
// ============================================================================

/**
 * Handle tab updates during AWS WAF capture
 * Called when tab completes loading
 * @param {number} tabId - Tab ID
 * @param {Object} changeInfo - Change info
 * @param {Object} tab - Tab object
 */
async function awsWafHandleCaptureTabUpdate(tabId, changeInfo, tab) {
  // Only process when capture is active and page is complete
  if (!awsWafCaptureStateRef.isCapturing) return;
  if (awsWafCaptureStateRef.tabId !== tabId) return;
  if (changeInfo.status !== 'complete') return;

  console.log('[AwsWaf] Tab completed loading, extracting data...');

  // Wait a bit for page to fully initialize
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Extract page data
  const pageData = await awsWafExtractPageData(tabId);

  if (pageData) {
    // Update captured data with page variables
    awsWafCaptureStateRef.capturedData.awsKey = pageData.awsKey;
    awsWafCaptureStateRef.capturedData.awsIv = pageData.awsIv;
    awsWafCaptureStateRef.capturedData.awsContext = pageData.awsContext;
    awsWafCaptureStateRef.detectionFlags.hasGokuProps = pageData.hasGokuProps;
  }

  // Read cookie
  const cookieValue = await awsWafReadCookie(tab.url);
  if (cookieValue) {
    awsWafCaptureStateRef.capturedData.awsExistingToken = cookieValue;
  }

  // Complete capture
  await handleAwsWafCaptureCompleted(tabId);
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
      return false;

    default:
      return false;
  }
}

// ============================================================================
// Analysis Mode
// ============================================================================

var awsWafAnalysisListener = null;
var awsWafAnalysisState = {
  isAnalyzing: false,
  tabId: null,
  url: null,
  capturedScripts: {
    challengeScripts: [],
    apiScripts: [],
    problemUrls: [],
    allScripts: []
  }
};

/**
 * Start analysis mode - captures AWS WAF related scripts and URLs
 * @param {number} tabId - Tab ID
 * @param {string} url - URL of the tab
 */
function awsWafStartAnalysis(tabId, url) {
  console.log('[AwsWaf-Analysis] Starting analysis for tab:', tabId);

  // Stop any existing analysis
  awsWafStopAnalysis();

  // Reset state
  awsWafAnalysisState.isAnalyzing = true;
  awsWafAnalysisState.tabId = tabId;
  awsWafAnalysisState.url = url;
  awsWafAnalysisState.capturedScripts = {
    challengeScripts: [],
    apiScripts: [],
    problemUrls: [],
    allScripts: []
  };

  // Setup network listener
  awsWafAnalysisListener = (details) => {
    if (details.tabId !== tabId) return;
    if (!awsWafAnalysisState.isAnalyzing) return;

    const requestUrl = details.url;

    // Check for challenge.js
    if (requestUrl.includes('challenge.js')) {
      console.log('[AwsWaf-Analysis] Found challenge.js:', requestUrl);
      awsWafAnalysisState.capturedScripts.challengeScripts.push({
        url: requestUrl,
        type: 'challenge'
      });
      awsWafAnalysisState.capturedScripts.allScripts.push({
        url: requestUrl,
        type: 'challenge'
      });
    }

    // Check for jsapi.js
    if (requestUrl.includes('jsapi.js')) {
      console.log('[AwsWaf-Analysis] Found jsapi.js:', requestUrl);
      awsWafAnalysisState.capturedScripts.apiScripts.push({
        url: requestUrl,
        type: 'api'
      });
      awsWafAnalysisState.capturedScripts.allScripts.push({
        url: requestUrl,
        type: 'api'
      });
    }

    // Check for /problem endpoint
    if (requestUrl.includes('/problem')) {
      console.log('[AwsWaf-Analysis] Found problem endpoint:', requestUrl);
      awsWafAnalysisState.capturedScripts.problemUrls.push({
        url: requestUrl,
        type: 'problem'
      });
      awsWafAnalysisState.capturedScripts.allScripts.push({
        url: requestUrl,
        type: 'problem'
      });
    }
  };

  // Register listener
  chrome.webRequest.onBeforeRequest.addListener(
    awsWafAnalysisListener,
    { urls: ['<all_urls>'], tabId: tabId },
    []
  );

  console.log('[AwsWaf-Analysis] Analysis started');

  return {
    status: 'started',
    message: 'AWS WAF analysis started. Page will reload to capture scripts.',
    tabId: tabId
  };
}

/**
 * Stop analysis mode
 */
function awsWafStopAnalysis() {
  console.log('[AwsWaf-Analysis] Stopping analysis');

  if (awsWafAnalysisListener) {
    try {
      chrome.webRequest.onBeforeRequest.removeListener(awsWafAnalysisListener);
    } catch (e) {
      console.log('[AwsWaf-Analysis] Error removing listener:', e);
    }
  }

  awsWafAnalysisListener = null;
  awsWafAnalysisState.isAnalyzing = false;
}

/**
 * Handle tab update during analysis - send results when page loads
 */
async function awsWafHandleAnalysisTabUpdate(tabId, changeInfo, tab) {
  if (!awsWafAnalysisState.isAnalyzing) return;
  if (awsWafAnalysisState.tabId !== tabId) return;
  if (changeInfo.status !== 'complete') return;

  console.log('[AwsWaf-Analysis] Tab completed loading, sending results...');

  // Wait a bit for all scripts to load
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Prepare result data
  const resultData = {
    scripts: awsWafAnalysisState.capturedScripts.allScripts,
    scriptCount: awsWafAnalysisState.capturedScripts.allScripts.length,
    challengeScripts: awsWafAnalysisState.capturedScripts.challengeScripts,
    apiScripts: awsWafAnalysisState.capturedScripts.apiScripts,
    problemUrls: awsWafAnalysisState.capturedScripts.problemUrls
  };

  console.log('[AwsWaf-Analysis] Analysis results:', resultData);

  // Store results in storage for popup to retrieve
  try {
    await chrome.storage.local.set({
      'scrapfly_awswaf_analysis_pending': {
        data: resultData,
        timestamp: Date.now(),
        tabId: tabId
      }
    });
    console.log('[AwsWaf-Analysis] Results stored in chrome.storage');
  } catch (error) {
    console.error('[AwsWaf-Analysis] Failed to store results:', error);
  }

  // Try to send message to popup if it's open
  try {
    chrome.runtime.sendMessage({
      type: 'AWSWAF_ANALYSIS_RESULT',
      data: resultData
    });
  } catch (error) {
    console.log('[AwsWaf-Analysis] Popup not open, results stored for later');
  }

  // Stop analysis
  awsWafStopAnalysis();
}

// ============================================================================
// Exports
// ============================================================================

console.log('[AwsWaf] Interceptor loaded successfully');

} // End of guard
