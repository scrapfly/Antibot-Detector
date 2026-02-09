/**
 * FunCaptcha Capture Interceptor
 *
 * Intercepts FunCaptcha API requests to extract public key, website URL,
 * BDA (Browser Data Array), and other challenge parameters.
 *

 */

// Guard against re-initialization (use var for service worker reload compatibility)
var funcaptchaInterceptionListener = funcaptchaInterceptionListener || null;
var funcaptchaCaptureStateRef = funcaptchaCaptureStateRef || null;
var funcaptchaNavigationListeners = funcaptchaNavigationListeners || new Map();

// Destructure helpers from BaseInterceptorHelpers (use var to avoid redeclaration errors)
var showNotification = self.BaseInterceptorHelpers?.showNotification;
var saveToHistory = self.BaseInterceptorHelpers?.saveToHistory;
var cleanupNotifications = self.BaseInterceptorHelpers?.cleanupNotifications;

/**
 * Initialize interceptor with reference to capture state Map
 */
function funcaptchaInitializeInterceptor(captureState) {
    if (funcaptchaCaptureStateRef) {
        Logger.network('[FunCaptcha] Interceptor already initialized, skipping');
        return;
    }
    funcaptchaCaptureStateRef = captureState;
    Logger.network('[FunCaptcha] Interceptor initialized with capture state');
}

/**
 * Start FunCaptcha capture
 */
async function funcaptchaStartCapture(tabId) {
    Logger.network('[FunCaptcha] Starting capture for tab:', tabId);

    // Check if already capturing
    const existingState = funcaptchaCaptureStateRef.get(tabId);
    if (existingState && existingState.isCapturing) {
        Logger.network('[FunCaptcha] Already capturing on this tab');
        return { status: 'already_capturing' };
    }

    // Initialize capture state
    const state = {
        step: 1,
        startTime: Date.now(),
        isCapturing: true,
        capturedData: [],
        captureUrl: null,
        timeout: null
    };

    funcaptchaCaptureStateRef.set(tabId, state);
    Logger.network('[FunCaptcha] Capture state initialized');

    // Start network interception
    startFuncaptchaInterception(tabId);

    // Show page notification
    if (typeof showNotification === 'function') {
        try {
            await showNotification(tabId, {
                type: 'loading',
                title: 'FunCaptcha Capture Active',
                message: 'Please reload the page to trigger FunCaptcha challenge (60s timeout)',
                duration: 60000
            });
        } catch (error) {
            Logger.network('[FunCaptcha] Notification error:', error.message);
        }
    }

    // Setup 60-second timeout
    state.timeout = setTimeout(() => {
        funcaptchaStopCapture(tabId, 'timeout');
    }, 60000);

    // Setup navigation listener for page load detection
    const navListener = (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            Logger.network('[FunCaptcha] Page navigation detected, updating notification');
            if (typeof showNotification === 'function') {
                showNotification(tabId, {
                    type: 'info',
                    title: 'Page Loading',
                    message: 'Page is loading, please wait...',
                    duration: 5000
                }).catch(() => {});
            }
        }
    };

    chrome.webNavigation.onCommitted.addListener(navListener);
    funcaptchaNavigationListeners.set(tabId, navListener);

    return { status: 'started' };
}

/**
 * Start network interception for FunCaptcha API calls
 */
function startFuncaptchaInterception(tabId) {
    funcaptchaInterceptionListener = (details) => {
        if (details.tabId !== tabId) return;
        handleFuncaptchaRequest(details, tabId);
    };

    try {
        chrome.webRequest.onBeforeRequest.addListener(
            funcaptchaInterceptionListener,
            { urls: ['*://*/fc/*/public_key/*'] },
            ['requestBody']
        );
        Logger.network('[FunCaptcha] Network interception started');
    } catch (error) {
        Logger.error('NETWORK', '[FunCaptcha] Failed to add network listener:', error.message);
    }
}

/**
 * Handle FunCaptcha API request - extract capture data
 */
function handleFuncaptchaRequest(details, tabId) {
    const state = funcaptchaCaptureStateRef.get(tabId);
    if (!state || !state.isCapturing) return;

    try {
        const url = details.url;
        Logger.network('[FunCaptcha] Intercepted request:', url);

        // Extract POST body
        if (!details.requestBody || !details.requestBody.raw) {
            Logger.network('[FunCaptcha] No request body found');
            return;
        }

        const rawBytes = details.requestBody.raw[0].bytes;
        const decoder = new TextDecoder('utf-8');
        const postText = decoder.decode(rawBytes);
        const params = new URLSearchParams(postText);

        // Extract data
        const captureData = {
            type: 'funcaptcha',
            timestamp: Date.now(),
            url: url,
            websiteUrl: params.get('site'),
            publicKey: params.get('public_key'),
            bda: params.get('bda'),
            userAgent: params.get('userbrowser'),
            blob: params.get('data[blob]'),
            isBlobRequired: params.has('data[blob]'),
            apiDomain: new URL(url).hostname
        };

        Logger.network('[FunCaptcha] Extracted capture data:', {
            publicKey: captureData.publicKey?.substring(0, 20) + '...',
            apiDomain: captureData.apiDomain,
            isBlobRequired: captureData.isBlobRequired
        });

        state.capturedData.push(captureData);
        state.captureUrl = details.url;

        // Auto-stop after capturing data
        setTimeout(() => {
            funcaptchaStopCapture(tabId, 'captured');
        }, 100);

    } catch (error) {
        Logger.error('NETWORK', '[FunCaptcha] Error handling request:', error.message);
    }
}

/**
 * Stop FunCaptcha capture
 */
async function funcaptchaStopCapture(tabId, reason = 'manual') {
    Logger.network('[FunCaptcha] Stopping capture for tab:', tabId, 'reason:', reason);

    const state = funcaptchaCaptureStateRef.get(tabId);
    if (!state) {
        Logger.network('[FunCaptcha] No capture state found');
        return { status: 'no_capture' };
    }

    // Clean up timeout
    if (state.timeout) {
        clearTimeout(state.timeout);
    }

    // Remove network interceptor
    if (funcaptchaInterceptionListener) {
        try {
            chrome.webRequest.onBeforeRequest.removeListener(funcaptchaInterceptionListener);
        } catch (error) {
            Logger.network('[FunCaptcha] Error removing network listener:', error.message);
        }
    }

    // Remove navigation listener
    const navListener = funcaptchaNavigationListeners.get(tabId);
    if (navListener) {
        try {
            chrome.webNavigation.onCommitted.removeListener(navListener);
            funcaptchaNavigationListeners.delete(tabId);
        } catch (error) {
            Logger.network('[FunCaptcha] Error removing navigation listener:', error.message);
        }
    }

    // Show completion notification
    if (typeof showNotification === 'function') {
        try {
            if (reason === 'captured' && state.capturedData.length > 0) {
                await showNotification(tabId, {
                    type: 'success',
                    title: 'FunCaptcha Captured Successfully',
                    message: `Captured ${state.capturedData.length} challenge(s)`,
                    duration: 5000
                });
            } else if (reason === 'timeout') {
                await showNotification(tabId, {
                    type: 'warning',
                    title: 'Capture Timeout',
                    message: 'No FunCaptcha challenge detected (60s timeout)',
                    duration: 5000
                });
            }
        } catch (error) {
            Logger.network('[FunCaptcha] Notification error:', error.message);
        }
    }

    // Save all captured data to history
    const results = [];
    if (typeof saveToHistory === 'function') {
        for (const captureData of state.capturedData) {
            try {
                await saveToHistory(tabId, captureData, {
                    type: 'funcaptcha',
                    expiryMinutes: 30
                });
                results.push(captureData);
            } catch (error) {
                Logger.error('NETWORK', '[FunCaptcha] Error saving to history:', error.message);
            }
        }
    }

    // Update state
    state.isCapturing = false;
    funcaptchaCaptureStateRef.set(tabId, state);

    // Send completion message to popup
    try {
        await chrome.runtime.sendMessage({
            type: 'FUNCAPTCHA_CAPTURE_COMPLETED',
            tabId: tabId,
            results: results,
            reason: reason
        });
    } catch (error) {
        Logger.network('[FunCaptcha] Error sending completion message:', error.message);
    }

    return { status: 'stopped', results: results };
}

/**
 * Get current capture state
 */
function funcaptchaGetCaptureState(tabId) {
    const state = funcaptchaCaptureStateRef.get(tabId);
    if (!state) {
        return { isCapturing: false, capturedCount: 0 };
    }
    return {
        isCapturing: state.isCapturing,
        capturedCount: state.capturedData.length,
        elapsedSeconds: Math.floor((Date.now() - state.startTime) / 1000)
    };
}

/**
 * Main message handler
 */
function handleFunCaptchaMessage(request, sendResponse, captureState) {
    const { type } = request;

    switch (type) {
        case 'FUNCAPTCHA_START_CAPTURE':
            funcaptchaInitializeInterceptor(captureState);
            funcaptchaStartCapture(request.tabId)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ status: 'error', error: error.message }));
            return true;

        case 'FUNCAPTCHA_STOP_CAPTURE':
            funcaptchaStopCapture(request.tabId, 'manual')
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ status: 'error', error: error.message }));
            return true;

        case 'FUNCAPTCHA_GET_CAPTURE_STATE':
            sendResponse(funcaptchaGetCaptureState(request.tabId));
            return false;

        case 'FUNCAPTCHA_START_ANALYSIS':
            sendResponse(funcaptchaStartAnalysis(request.tabId, request.url));
            return false;

        case 'FUNCAPTCHA_SHOW_ANALYZING_NOTIFICATION':
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: 'Analyzing FunCaptcha Scripts',
                            message: 'Please wait while we collect script URLs...',
                            duration: 15000
                        });
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true;

        default:
            return false;
    }
}

/**
 * Start analysis mode (script discovery)
 */
function funcaptchaStartAnalysis(tabId, url) {
    const capturedUrls = new Set();

    const requestListener = (details) => {
        if (details.tabId !== tabId) return;
        if (details.url.includes('arkoselabs.com') || details.url.includes('funcaptcha.com')) {
            capturedUrls.add(JSON.stringify({ url: details.url, type: 'arkose' }));
        }
    };

    const navigationListener = async (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            setTimeout(async () => {
                const finalResults = Array.from(capturedUrls).map(jsonStr => {
                    try {
                        const obj = JSON.parse(jsonStr);
                        return { ...obj, source: 'network' };
                    } catch (error) {
                        return null;
                    }
                }).filter(item => item !== null);

                try {
                    chrome.webRequest.onBeforeRequest.removeListener(requestListener);
                } catch (error) {
                    Logger.network('[FunCaptcha] Error removing request listener:', error.message);
                }

                try {
                    chrome.webNavigation.onCompleted.removeListener(navigationListener);
                } catch (error) {
                    Logger.network('[FunCaptcha] Error removing navigation listener:', error.message);
                }

                try {
                    await chrome.runtime.sendMessage({
                        type: 'FUNCAPTCHA_ANALYSIS_RESULT',
                        data: { scripts: finalResults, scriptCount: finalResults.length }
                    });
                } catch (error) {
                    Logger.network('[FunCaptcha] Analysis result send error:', error.message);
                }
            }, 5000);
        }
    };

    try {
        chrome.webRequest.onBeforeRequest.addListener(
            requestListener,
            { urls: ['<all_urls>'] },
            []
        );
        chrome.webNavigation.onCompleted.addListener(navigationListener);
    } catch (error) {
        Logger.error('NETWORK', '[FunCaptcha] Error setting up analysis listeners:', error.message);
    }

    return { status: 'started' };
}

Logger.network('[FunCaptcha] Interceptor loaded');
