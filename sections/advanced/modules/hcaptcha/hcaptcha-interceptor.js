/**
 * hCaptcha Script Interceptor
 * Handles hCaptcha request interception, version checking, and data capture
 */

// Guard against re-initialization (use var for service worker reload compatibility)
var hcaptchaInterceptionListener = hcaptchaInterceptionListener || null;

var showNotification = self.BaseInterceptorHelpers?.showNotification;
var saveToHistory = self.BaseInterceptorHelpers?.saveToHistory;

// hCaptcha capture state
var hcaptchaCaptureState = hcaptchaCaptureState || new Map();

// Store active version check requests
const activeVersionChecks = {};

/**
 * Start capturing hCaptcha data for a specific tab
 * Captures: Version, Enterprise mode, Site Key, Website URL
 * Stores results and auto-stops after 60 seconds
 */
function hcaptchaStartCapture(tabId, captureUrl) {
    Logger.network('[hCaptcha-Capture] ========== START CAPTURE ==========');
    Logger.network('[hCaptcha-Capture] Tab ID:', tabId);
    Logger.network('[hCaptcha-Capture] Capture URL:', captureUrl);
    Logger.network('[hCaptcha-Capture] Started at:', new Date().toISOString());
    Logger.network('[hCaptcha-Capture] Auto-stop in: 60 seconds');
    Logger.network('[hCaptcha-Capture] Waiting for page reload before capturing');

    if (hcaptchaCaptureState.has(tabId)) {
        Logger.network('[hCaptcha-Capture] Already capturing for this tab');
        return { status: 'already_capturing' };
    }

    // Initialize capture state
    hcaptchaCaptureState.set(tabId, {
        active: true,
        timestamp: Date.now(),
        captureUrl: captureUrl,
        version: null,
        websiteKey: null,
        websiteURL: null,
        isEnterprise: false,
        detectionMethods: []
    });

    // Set up network request listener
    const requestListener = (details) => {
        if (details.tabId !== tabId) return;
        const url = details.url;
        const state = hcaptchaCaptureState.get(tabId);
        if (!state) return;

        // checksiteconfig API - extract version, site key, website URL
        if (/checksiteconfig/gm.test(url)) {
            Logger.network('[hCaptcha-Capture] ========== CHECKSITECONFIG DETECTED ==========');
            Logger.network('[hCaptcha-Capture] Full URL:', url);
            Logger.network('[hCaptcha-Capture] Request ID:', details.requestId);
            Logger.network('[hCaptcha-Capture] Tab ID:', details.tabId);

            try {
                const urlObj = new URL(url);
                state.version = state.version || urlObj.searchParams.get('v') || null;
                state.websiteURL = state.websiteURL || urlObj.searchParams.get('host') || null;
                state.websiteKey = state.websiteKey || urlObj.searchParams.get('sitekey') || null;
                Logger.network('[hCaptcha-Capture] Extracted - Version:', state.version, 'SiteKey:', state.websiteKey);

                // Mark that we're waiting for checksiteconfig response
                state.waitingForChecksiteconfig = true;

                // Simple fetch to read response and check for Enterprise mode
                fetch(url)
                    .then(response => response.json())
                    .then(data => {
                        Logger.network('[hCaptcha-Capture] checksiteconfig response:', data);
                        if (data.features && Object.keys(data.features).length > 0) {
                            state.isEnterprise = true;
                            if (!state.detectionMethods.includes('checksiteconfig-features')) {
                                state.detectionMethods.push('checksiteconfig-features');
                            }
                            Logger.network('[hCaptcha-Capture] Enterprise detected via checksiteconfig features');
                        }

                        // Mark fetch as complete
                        state.waitingForChecksiteconfig = false;

                        // Check if we should complete capture now
                        if (state.version && state.websiteKey) {
                            Logger.network('[hCaptcha-Capture] All required data captured (after checksiteconfig fetch)!');
                            Logger.network('[hCaptcha-Capture] Auto-stopping capture (data complete)');

                            // Clear timeout since we got the data
                            if (state.timeout) {
                                clearTimeout(state.timeout);
                            }

                            // Remove listener to stop monitoring
                            chrome.webRequest.onBeforeRequest.removeListener(requestListener);

                            // Call completion handler
                            handleHCaptchaCaptureCompleted(tabId, {
                                version: state.version,
                                websiteKey: state.websiteKey,
                                websiteURL: state.websiteURL,
                                isEnterprise: state.isEnterprise,
                                detectionMethods: state.detectionMethods,
                                timestamp: state.timestamp
                            });
                        }
                    })
                    .catch(err => {
                        Logger.warn('NETWORK', '[hCaptcha-Capture] Fetch error:', err);
                        state.waitingForChecksiteconfig = false;
                    });
            } catch (e) {
                Logger.error('NETWORK', '[hCaptcha-Capture] URL parse error:', e);
            }
        }

        // api.js with enterprise parameters
        if (/\/1\/api\.js/gm.test(url)) {
            const enterpriseParams = ['custom_theme', 'sentry', 'custom', 'apiEndpoint', 'endpoint', 'reportapi', 'assethost', 'imghost', 'recaptchacompat'];
            for (let param of enterpriseParams) {
                if (url.includes(param)) {
                    state.isEnterprise = true;
                    if (!state.detectionMethods.includes('api-param-' + param)) {
                        state.detectionMethods.push('api-param-' + param);
                    }
                    Logger.network('[hCaptcha-Capture] Enterprise detected via api.js parameter:', param);
                    break;
                }
            }
        }

        // getcaptcha API - check for rqdata parameter
        if (/\/getcaptcha\//gm.test(url)) {
            if (details.requestBody?.raw?.[0]?.string?.includes('rqdata')) {
                state.isEnterprise = true;
                if (!state.detectionMethods.includes('rqdata')) {
                    state.detectionMethods.push('rqdata');
                }
                Logger.network('[hCaptcha-Capture] Enterprise detected via rqdata parameter');
            }
        }

        // Check if we have all required data to complete capture
        // Don't complete if we're still waiting for checksiteconfig response
        if (state.version && state.websiteKey && !state.waitingForChecksiteconfig) {
            Logger.network('[hCaptcha-Capture] All required data captured!');
            Logger.network('[hCaptcha-Capture] Auto-stopping capture (data complete)');

            // Clear timeout since we got the data
            if (state.timeout) {
                clearTimeout(state.timeout);
            }

            // Remove listener to stop monitoring
            chrome.webRequest.onBeforeRequest.removeListener(requestListener);

            // Call completion handler
            handleHCaptchaCaptureCompleted(tabId, {
                version: state.version,
                websiteKey: state.websiteKey,
                websiteURL: state.websiteURL,
                isEnterprise: state.isEnterprise,
                detectionMethods: state.detectionMethods,
                timestamp: state.timestamp
            });
        }
    };

    // Add network listener
    chrome.webRequest.onBeforeRequest.addListener(
        requestListener,
        { urls: ['<all_urls>'], tabId: tabId },
        ['requestBody']
    );

    // Store listener for cleanup
    const state = hcaptchaCaptureState.get(tabId);
    if (state) {
        state.requestListener = requestListener;
    }

    // Auto-stop after 60 seconds
    const timeout = setTimeout(() => {
        Logger.network(`[hCaptcha-Capture] Auto-stopping capture for tab ${tabId} (60s timeout reached)`);
        hcaptchaStopCapture(tabId);
    }, 60000);

    if (state) {
        state.timeout = timeout;
    }

    // Show in-page notification
    if (showNotification) {
        showNotification(tabId, {
            type: 'capture',
            title: 'hCaptcha Capture Active',
            message: 'Please reload the page to start monitoring',
            duration: 60000
        }).catch(err => {
            Logger.error('NETWORK', '[hCaptcha-Capture] Failed to show notification:', err);
        });
    }

    return { status: 'started' };
}

/**
 * Handle hCaptcha capture completion
 * Called when all required data is captured
 */
async function handleHCaptchaCaptureCompleted(tabId, captureData) {
    Logger.network('[hCaptcha-Capture] ========== HANDLING CAPTURE COMPLETION ==========');

    try {
        // Get tab info
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            Logger.error('NETWORK', '[hCaptcha-Capture] Tab not found or no URL');
            return;
        }

        Logger.network('[hCaptcha-Capture] Tab info retrieved:', { url: tab.url, title: tab.title });

        // Save to history with 30-minute expiry
        if (saveToHistory) {
            const historyData = {
                version: captureData.version,
                websiteKey: captureData.websiteKey,
                websiteURL: captureData.websiteURL,
                isEnterprise: captureData.isEnterprise,
                detectionMethods: captureData.detectionMethods
            };

            await saveToHistory(tabId, historyData, { type: 'hcaptcha', expiryMinutes: 30 });
            Logger.network('[hCaptcha-Capture] Data saved to history');
        }

        // Clean up capture state
        hcaptchaCaptureState.delete(tabId);

        // Notify popup to update UI (if open)
        Logger.network('[hCaptcha-Capture] Notifying popup (if open)...');
        chrome.runtime.sendMessage({
            type: 'HCAPTCHA_CAPTURE_COMPLETED',
            captureData: {
                type: 'hcaptcha',
                captureData: captureData,
                timestamp: Date.now()
            }
        }).catch((err) => {
            Logger.network('[hCaptcha-Capture] Popup not open, message not sent (this is normal)');
        });

        // Show success notification in page
        Logger.network('[hCaptcha-Capture] Showing success notification...');
        if (showNotification) {
            await showNotification(tabId, {
                type: 'success',
                title: 'Capture Completed',
                message: 'hCaptcha data captured successfully',
                duration: 5000
            }).catch(err => {
                Logger.error('NETWORK', '[hCaptcha-Capture] Failed to show notification:', err);
            });
        }

        Logger.network('[hCaptcha-Capture] ========== CAPTURE COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        Logger.error('NETWORK', '[hCaptcha-Capture] Error handling capture completion:', error);
    }
}

/**
 * Stop capturing for a specific tab and save results to history
 */
function hcaptchaStopCapture(tabId) {
    Logger.network('[hCaptcha-Capture] ========== STOP CAPTURE ==========');
    Logger.network('[hCaptcha-Capture] Tab ID:', tabId);

    const state = hcaptchaCaptureState.get(tabId);
    if (!state) {
        Logger.network('[hCaptcha-Capture] No capture state for this tab');
        return { status: 'not_capturing' };
    }

    // Clean up listeners
    if (state.requestListener) {
        chrome.webRequest.onBeforeRequest.removeListener(state.requestListener);
    }
    if (state.timeout) {
        clearTimeout(state.timeout);
    }

    // Log capture results
    Logger.network('[hCaptcha-Capture] Capture Results:');
    Logger.network('[hCaptcha-Capture] Version:', state.version);
    Logger.network('[hCaptcha-Capture] Enterprise:', state.isEnterprise);
    Logger.network('[hCaptcha-Capture] Site Key:', state.websiteKey);
    Logger.network('[hCaptcha-Capture] Website URL:', state.websiteURL);

    // Clean up state
    hcaptchaCaptureState.delete(tabId);
    Logger.network('[hCaptcha-Capture] ========================================');

    return { status: 'stopped' };
}

/**
 * Get current capture state for a tab
 */
function hcaptchaGetCaptureState(tabId) {
    const state = hcaptchaCaptureState.get(tabId);
    if (!state) {
        return { status: 'not_capturing', isCapturing: false };
    }
    return {
        status: 'capturing',
        isCapturing: true,
        data: {
            version: state.version,
            websiteKey: state.websiteKey,
            websiteURL: state.websiteURL,
            isEnterprise: state.isEnterprise
        }
    };
}

/**
 * Handle hCaptcha version check (quick check without full capture)
 */
function hcaptchaCheckVersion(tabId) {
    Logger.network('[hCaptcha] Starting version check for tabId:', tabId);

    return new Promise((resolve) => {
        const detectedData = {
            version: '',
            websiteURL: '',
            websiteKey: '',
            isEnterprise: false,
            detectionMethods: []
        };

        let resultsResolved = false;

        const requestListener = (details) => {
            if (details.tabId !== tabId) return;
            const url = details.url;

            // Log all hcaptcha-related URLs for debugging
            if (url.includes('hcaptcha')) {
                Logger.network('[hCaptcha] Detected hCaptcha URL:', url);
            }

            // checksiteconfig API - extract version and site key
            if (/checksiteconfig/gm.test(url)) {
                Logger.network('[hCaptcha] ========== CHECKSITECONFIG DETECTED ==========');
                Logger.network('[hCaptcha] Full URL:', url);
                Logger.network('[hCaptcha] Request ID:', details.requestId);
                Logger.network('[hCaptcha] Tab ID:', details.tabId);

                try {
                    const urlObj = new URL(url);
                    detectedData.version = urlObj.searchParams.get('v') || '';
                    detectedData.websiteURL = urlObj.searchParams.get('host') || '';
                    detectedData.websiteKey = urlObj.searchParams.get('sitekey') || '';
                    Logger.network('[hCaptcha] Extracted - Version:', detectedData.version, 'SiteKey:', detectedData.websiteKey);

                    // Simple fetch to read response and check for Enterprise mode
                    fetch(url)
                        .then(response => response.json())
                        .then(data => {
                            Logger.network('[hCaptcha] checksiteconfig response:', data);
                            if (data.features && Object.keys(data.features).length > 0) {
                                detectedData.isEnterprise = true;
                                if (!detectedData.detectionMethods.includes('checksiteconfig-features')) {
                                    detectedData.detectionMethods.push('checksiteconfig-features');
                                }
                                Logger.network('[hCaptcha] Enterprise detected via checksiteconfig features');
                            }
                        })
                        .catch(err => Logger.warn('NETWORK', '[hCaptcha] Fetch error:', err));
                } catch (e) {
                    Logger.error('NETWORK', '[hCaptcha] URL parse error:', e);
                }
            }

            // api.js with enterprise parameters
            if (/\/1\/api\.js/gm.test(url)) {
                const enterpriseParams = ['custom_theme', 'sentry', 'custom', 'apiEndpoint', 'endpoint', 'reportapi', 'assethost', 'imghost', 'recaptchacompat'];
                for (let param of enterpriseParams) {
                    if (url.includes(param)) {
                        detectedData.isEnterprise = true;
                        if (!detectedData.detectionMethods.includes('api-param-' + param)) {
                            detectedData.detectionMethods.push('api-param-' + param);
                        }
                        Logger.network('[hCaptcha] Enterprise detected via api.js parameter:', param);
                        break;
                    }
                }
            }

            // getcaptcha API - check for rqdata parameter
            if (/\/getcaptcha\//gm.test(url)) {
                if (details.requestBody?.raw?.[0]?.string?.includes('rqdata')) {
                    detectedData.isEnterprise = true;
                    if (!detectedData.detectionMethods.includes('rqdata')) {
                        detectedData.detectionMethods.push('rqdata');
                    }
                    Logger.network('[hCaptcha] Enterprise detected via rqdata parameter');
                }
            }
        };

        const navigationListener = (details) => {
            if (details.tabId === tabId && details.frameId === 0) {
                setTimeout(() => {
                    if (!resultsResolved) {
                        resultsResolved = true;
                        completeVersionCheck(tabId, requestListener, navigationListener, detectedData);
                    }
                }, 3000);
            }
        };

        chrome.webRequest.onBeforeRequest.addListener(
            requestListener,
            { urls: ['<all_urls>'], tabId: tabId },
            ['requestBody']
        );

        chrome.webNavigation.onCompleted.addListener(navigationListener);

        // Store listener references for cleanup
        activeVersionChecks[tabId] = { requestListener, navigationListener };

        // Timeout after 15 seconds (matches UI timeout)
        setTimeout(() => {
            if (!resultsResolved) {
                resultsResolved = true;
                completeVersionCheck(tabId, requestListener, navigationListener, detectedData);
            }
        }, 15000);

        resolve({ status: 'started' });
        Logger.network('[hCaptcha] Listeners added, waiting for network requests...');
    });
}

function completeVersionCheck(tabId, requestListener, navigationListener, detectedData) {
    Logger.network('[hCaptcha] Version check complete:', detectedData);

    // Clean up listeners
    chrome.webRequest.onBeforeRequest.removeListener(requestListener);
    chrome.webNavigation.onCompleted.removeListener(navigationListener);
    delete activeVersionChecks[tabId];

    // Add fallback message if no data detected
    if (!detectedData.version && !detectedData.websiteKey) {
        detectedData.message = 'hCaptcha not detected. Please reload the page with hCaptcha loaded.';
    }

    // Send result back to popup
    try {
        chrome.runtime.sendMessage({
            type: 'HCAPTCHA_VERSION_RESULT',
            data: detectedData
        }).catch(error => {
            Logger.error('NETWORK', '[hCaptcha] Error sending version result:', error);
        });
    } catch (error) {
        Logger.error('NETWORK', '[hCaptcha] Failed to send message:', error);
    }
}

/**
 * Centralized message handler for all hCaptcha-related messages
 */
function handleHCaptchaMessage(request, sender, sendResponse) {
    const { type } = request;
    Logger.network('[hCaptcha] Message received:', type);

    switch (type) {
        case 'HCAPTCHA_START_CAPTURE':
            (async () => {
                try {
                    const result = await Promise.resolve(hcaptchaStartCapture(request.tabId, request.url));
                    sendResponse(result);
                } catch (error) {
                    Logger.error('NETWORK', '[hCaptcha] Start capture error:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'HCAPTCHA_STOP_CAPTURE':
            try {
                const result = hcaptchaStopCapture(request.tabId);
                sendResponse(result);
            } catch (error) {
                Logger.error('NETWORK', '[hCaptcha] Stop capture error:', error);
                sendResponse({ status: 'error', error: error.message });
            }
            return false; // Sync response

        case 'HCAPTCHA_GET_CAPTURE_STATE':
            try {
                const state = hcaptchaGetCaptureState(request.tabId);
                sendResponse(state);
            } catch (error) {
                Logger.error('NETWORK', '[hCaptcha] Get capture state error:', error);
                sendResponse({ status: 'error', error: error.message });
            }
            return false; // Sync response

        case 'HCAPTCHA_CHECK_VERSION':
            (async () => {
                try {
                    Logger.network('[hCaptcha] Checking version for tabId:', request.tabId);
                    const result = await hcaptchaCheckVersion(request.tabId);
                    Logger.network('[hCaptcha] Sending version result:', result);
                    sendResponse(result);
                } catch (error) {
                    Logger.error('NETWORK', '[hCaptcha] Version check error:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'HCAPTCHA_START_ANALYSIS':
            sendResponse(hcaptchaStartAnalysis(request.tabId, request.url));
            return false;

        case 'HCAPTCHA_SHOW_ANALYZING_NOTIFICATION':
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: 'Analyzing hCaptcha Scripts',
                            message: 'Please wait while we collect script URLs...',
                            duration: 15000
                        });
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'HCAPTCHA_SHOW_VERSION_NOTIFICATION':
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: 'Checking hCaptcha Version',
                            message: 'Please wait while we analyze the page...',
                            duration: 15000
                        });
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'HCAPTCHA_CAPTURE_COMPLETED':
            // NOTE: Capture processing is now handled directly in hcaptcha-interceptor.js
            // This message is only for notifying the popup UI to refresh
            Logger.network('[hCaptcha-Capture] Capture completed message received (UI notification only)');
            return false; // Sync response

        default:
            return false; // Not handled by this module
    }
}

function hcaptchaStartAnalysis(tabId, url) {
    const capturedUrls = new Set();

    const requestListener = (details) => {
        if (details.tabId !== tabId) return;
        if (details.url.includes('hcaptcha.com')) {
            capturedUrls.add(JSON.stringify({ url: details.url, type: 'hcaptcha' }));
        }
    };

    const navigationListener = async (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            setTimeout(async () => {
                const finalResults = Array.from(capturedUrls).map(jsonStr => {
                    const obj = JSON.parse(jsonStr);
                    return { ...obj, source: 'network' };
                });

                chrome.webRequest.onBeforeRequest.removeListener(requestListener);
                chrome.webNavigation.onCompleted.removeListener(navigationListener);

                try {
                    await chrome.runtime.sendMessage({
                        type: 'HCAPTCHA_ANALYSIS_RESULT',
                        data: { scripts: finalResults, scriptCount: finalResults.length }
                    });
                } catch (error) {}
            }, 5000);
        }
    };

    chrome.webRequest.onBeforeRequest.addListener(requestListener, { urls: ['<all_urls>'], tabId: tabId }, []);
    chrome.webNavigation.onCompleted.addListener(navigationListener);

    return { status: 'started' };
}

Logger.network('[hCaptcha] Interceptor loaded');
