// reCAPTCHA Network Request Interceptor
// Captures and decodes reCAPTCHA anchor and reload/userverify requests

// Guard against re-initialization (use var for service worker reload compatibility)
var recaptchaInterceptionListener = recaptchaInterceptionListener || null;
var reCaptchaCaptureStateRef = reCaptchaCaptureStateRef || null;

// Destructure helpers from BaseInterceptorHelpers (use var to avoid redeclaration errors)
var checkCookies = self.BaseInterceptorHelpers?.checkCookies;
var saveToHistory = self.BaseInterceptorHelpers?.saveToHistory;
var showNotification = self.BaseInterceptorHelpers?.showNotification;

function reCaptchaInitializeInterceptor(captureState) {
    if (reCaptchaCaptureStateRef) {
        Logger.network('[reCAPTCHA] Interceptor already initialized, skipping');
        return;
    }
    reCaptchaCaptureStateRef = captureState;
    Logger.network('[reCAPTCHA] Interceptor initialized with captureState');
}

/**
 * Start capturing reCAPTCHA requests for a specific tab
 * @param {number} tabId - The tab ID to capture for
 * @returns {Promise<{status: string}>} - Capture start status
 */
async function reCaptchaStartCapture(tabId) {
    try {
        Logger.network('[reCAPTCHA] RECAPTCHA_START_CAPTURE received for tab:', tabId);

        // Check if actively capturing (not just if state exists)
        const existingState = reCaptchaCaptureStateRef.get(tabId);
        if (existingState && existingState.isCapturing) {
            Logger.network('[reCAPTCHA] Already actively capturing for this tab');
            return { status: 'already_capturing' };
        }

        // Clean up old state if exists but not capturing
        if (existingState) {
            Logger.network('[reCAPTCHA] Cleaning up stale state from previous capture');
            reCaptchaCaptureStateRef.delete(tabId);
        }

        // Get tab URL to track navigation changes and check cookies
        let hasV2Cookie = false;
        try {
            const tab = await chrome.tabs.get(tabId);

            // Use checkCookies helper
            const cookies = await checkCookies(tab.url, [
                { name: { pattern: 'recaptcha-ca-e' }, returnValue: false },
                { name: { pattern: 'recaptcha-ca-t' }, returnValue: false }
            ]);

            hasV2Cookie = cookies.length > 0;
            Logger.network(`[reCAPTCHA] v2 cookie detection: ${hasV2Cookie ? 'FOUND' : 'NOT FOUND'}`);

            reCaptchaCaptureStateRef.set(tabId, {
                step: 1,
                startTime: Date.now(),
                captureInterval: null,
                captureTimeout: null,
                isCapturing: true,
                anchorData: {},
                reloadData: [],
                hasV2Cookie,
                captureUrl: tab.url
            });
        } catch (err) {
            Logger.error('NETWORK', 'Failed to get tab info or cookies:', err);
            reCaptchaCaptureStateRef.set(tabId, {
                step: 1,
                startTime: Date.now(),
                captureInterval: null,
                captureTimeout: null,
                isCapturing: true,
                anchorData: {},
                reloadData: [],
                hasV2Cookie: false
            });
        }

        startRecaptchaInterception();

        // Show in-page notification using helper
        if (showNotification) {
            await showNotification(tabId, {
                type: 'capture',
                title: 'reCAPTCHA Capture Active',
                message: 'Reload the page and solve any reCAPTCHA to capture its data',
                duration: 60000
            }).catch(err => {
                Logger.error('NETWORK', '[reCAPTCHA] Failed to show notification:', err);
            });
        }

        // Set up navigation listeners to show loading warning and then ready notification
        const navigationListener = (details) => {
            if (details.tabId === tabId && details.frameId === 0) {
                Logger.network('[reCAPTCHA] Page navigation started, showing loading warning...');
                if (showNotification) {
                    showNotification(tabId, {
                        type: 'warning',
                        title: 'Page Loading',
                        message: 'Please wait for the page to fully load...',
                        duration: 5000
                    }).catch(err => {
                        Logger.error('NETWORK', '[reCAPTCHA] Failed to show loading warning:', err);
                    });
                }
            }
        };

        const loadCompleteListener = (details) => {
            if (details.tabId === tabId && details.frameId === 0) {
                Logger.network('[reCAPTCHA] Page fully loaded');

                // Check if capture is still active and not already completed
                const currentState = reCaptchaCaptureStateRef.get(tabId);

                setTimeout(() => {
                    // Only show "Page Loaded" if still capturing and no data captured yet
                    if (currentState && currentState.isCapturing &&
                        (!currentState.anchorData || Object.keys(currentState.anchorData).length === 0) &&
                        (!currentState.reloadData || currentState.reloadData.length === 0)) {

                        if (showNotification) {
                            showNotification(tabId, {
                                type: 'success',
                                title: 'Page Ready',
                                message: 'Now solve the reCAPTCHA challenge to capture data',
                                duration: 5000
                            }).catch(err => {
                                Logger.error('NETWORK', '[reCAPTCHA] Failed to show ready notification:', err);
                            });
                        }
                    } else {
                        Logger.network('[reCAPTCHA] Skipping "Page Loaded" notification - capture already has data or is not active');
                    }
                }, 1000);

                // Remove listeners after showing notification
                chrome.webNavigation.onCommitted.removeListener(navigationListener);
                chrome.webNavigation.onCompleted.removeListener(loadCompleteListener);
            }
        };

        chrome.webNavigation.onCommitted.addListener(navigationListener);
        chrome.webNavigation.onCompleted.addListener(loadCompleteListener);

        // Auto-stop after 60 seconds
        const captureTimeout = setTimeout(async () => {
            const captureState = reCaptchaCaptureStateRef.get(tabId);
            if (captureState && captureState.isCapturing) {
                if (captureState.captureInterval) {
                    clearInterval(captureState.captureInterval);
                }

                const capturedResults = await processCaptureData(captureState);
                Logger.network('[reCAPTCHA] Auto-stop - Captured results:', capturedResults);

                captureState.results = capturedResults;
                captureState.isCapturing = false;

                // Remove navigation listeners before deleting state
                if (captureState.navigationListener) {
                    chrome.webNavigation.onCommitted.removeListener(captureState.navigationListener);
                }
                if (captureState.loadCompleteListener) {
                    chrome.webNavigation.onCompleted.removeListener(captureState.loadCompleteListener);
                }

                // Delete state completely to prevent blocking next capture
                reCaptchaCaptureStateRef.delete(tabId);
                Logger.network('[reCAPTCHA] Deleted capture state after 60s timeout');

                stopRecaptchaInterception();

                // Notify popup to clear UI
                chrome.runtime.sendMessage({ type: 'CAPTURE_COMPLETED' }).catch(() => {});

                // Show completion notification
                if (showNotification) {
                    showNotification(tabId, {
                        type: 'success',
                        title: 'Capture Completed',
                        message: `${capturedResults.length} request${capturedResults.length !== 1 ? 's' : ''} captured and decoded`,
                        duration: 5000
                    }).catch(err => Logger.error('NETWORK', '[reCAPTCHA] Failed to show completion notification:', err));
                }
            }
        }, 60000);

        // Store navigation listeners and timeout in capture state for cleanup
        const state = reCaptchaCaptureStateRef.get(tabId);
        if (state) {
            state.navigationListener = navigationListener;
            state.loadCompleteListener = loadCompleteListener;
            state.captureTimeout = captureTimeout;
            reCaptchaCaptureStateRef.set(tabId, state);
        }

        return { status: 'started' };
    } catch (error) {
        Logger.error('NETWORK', '[reCAPTCHA] Error in startCapture:', error);
        return { status: 'error', error: error.message };
    }
}

function handleRecaptchaRequest(details) {
    const captureState = reCaptchaCaptureStateRef;
    Logger.network('[reCAPTCHA] Request intercepted:', {
        url: details.url,
        tabId: details.tabId,
        method: details.method,
        type: details.type
    });

    const state = captureState.get(details.tabId);
    if (!state || !state.isCapturing) {
        return;
    }

    const url = new URL(details.url);

    // Test regex patterns
    const isAnchor = /\/recaptcha\/(api2|enterprise)\/anchor/.test(details.url);
    const isReload = /\/recaptcha\/(api2|enterprise)\/(reload|userverify)/.test(details.url);

    if (isAnchor) {
        Logger.network('[reCAPTCHA] ANCHOR request detected');

        const siteKey = url.searchParams.get('k');
        const size = url.searchParams.get('size');
        const s = url.searchParams.get('s');
        const co = url.searchParams.get('co');
        const sa = url.searchParams.get('sa');

        if (!state.anchorData) {
            state.anchorData = {};
        }

        state.anchorData[siteKey] = {
            site_url: co ? atob(co.replaceAll('.', '=')).replace(':443', '') : '',
            is_enterprise: details.url.includes('enterprise'),
            size_param: size || null,
            is_s_required: s != null,
            pageAction: sa || null,
            apiDomain: url.host.includes('recaptcha.net') ? 'www.recaptcha.net' : '',
            timestamp: Date.now()
        };

        captureState.set(details.tabId, state);
        Logger.network('[reCAPTCHA] Anchor data stored');

        // Update notification to Step 2
        chrome.tabs.sendMessage(details.tabId, {
            type: 'UPDATE_CAPTURE_STEP',
            step: 2,
            message: 'Now trigger or click the reCAPTCHA'
        }).catch(() => {});

    } else if (isReload) {
        Logger.network('[reCAPTCHA] RELOAD/USERVERIFY request detected');

        const siteKeyFromUrl = url.searchParams.get('k');

        if (details.requestBody && details.requestBody.raw) {
            const rawBytes = details.requestBody.raw[0].bytes;

            if (!state.reloadData) {
                state.reloadData = [];
            }

            state.reloadData.push({
                url: details.url,
                postData: rawBytes,
                siteKey: siteKeyFromUrl,
                timestamp: Date.now()
            });

            captureState.set(details.tabId, state);
            Logger.network('[reCAPTCHA] Reload data captured, total:', state.reloadData.length);

            const hasAnchor = Object.keys(state.anchorData || {}).length > 0;
            const hasReload = state.reloadData.length > 0;

            // Auto-stop when both anchor and reload are captured
            if (hasAnchor && hasReload) {
                Logger.network('[reCAPTCHA] Both anchor and reload captured - triggering auto-stop');

                setTimeout(async () => {
                    const finalState = captureState.get(details.tabId);
                    if (!finalState || !finalState.isCapturing) {
                        return;
                    }

                    // Clear timeouts
                    if (finalState.captureTimeout) {
                        clearTimeout(finalState.captureTimeout);
                    }

                    // Process captured data
                    const results = await processCaptureData(finalState);
                    Logger.network('[reCAPTCHA] Processing complete. Results:', results.length);

                    // Update state
                    finalState.isCapturing = false;
                    finalState.results = results;

                    // Delete state completely to prevent blocking next capture
                    captureState.delete(details.tabId);

                    // Stop interception
                    stopRecaptchaInterception();

                    // Save to history using helper
                    if (results.length > 0 && saveToHistory) {
                        try {
                            const tab = await chrome.tabs.get(details.tabId);

                            // Create capture data for each result
                            for (const result of results) {
                                const captureData = {
                                    type: 'recaptcha',
                                    version: result.isReCaptchaV3 ? 'v3' : 'v2',
                                    siteKey: result.siteKey,
                                    action: result.action,
                                    isEnterprise: result.isEnterprise,
                                    isInvisible: result.isInvisible,
                                    isSRequired: result.isSRequired,
                                    apiDomain: result.apiDomain,
                                    hasSession: result.hasSession,
                                    requiredCookie: result.requiredCookie,
                                    protobufFields: result.protobufFields,
                                    siteUrl: result.siteUrl,
                                    timestamp: result.timestamp
                                };

                                await saveToHistory(details.tabId, captureData, {
                                    type: 'recaptcha',
                                    expiryMinutes: 30
                                });
                            }

                            Logger.network('[reCAPTCHA] Saved to history using helper');
                        } catch (err) {
                            Logger.error('NETWORK', '[reCAPTCHA] Failed to save to history:', err);
                        }
                    }

                    // Notify popup
                    chrome.runtime.sendMessage({ type: 'CAPTURE_COMPLETED' }).catch(() => {});

                    // Show success notification
                    if (showNotification) {
                        showNotification(details.tabId, {
                            type: 'success',
                            title: 'Capture Completed',
                            message: `${results.length} reCAPTCHA request${results.length !== 1 ? 's' : ''} captured and decoded`,
                            duration: 3000
                        }).catch(err => Logger.error('NETWORK', '[reCAPTCHA] Failed to show notification:', err));
                    }
                }, 100);
            }
        }
    }
}

function startRecaptchaInterception() {
    if (recaptchaInterceptionListener) {
        Logger.network('[reCAPTCHA] Interception already active');
        return;
    }

    Logger.network('[reCAPTCHA] Starting request interception...');

    recaptchaInterceptionListener = (details) => handleRecaptchaRequest(details);

    chrome.webRequest.onBeforeRequest.addListener(
        recaptchaInterceptionListener,
        { urls: ["*://*.google.com/recaptcha/*", "*://*.recaptcha.net/recaptcha/*"] },
        ["requestBody"]
    );

    Logger.network('[reCAPTCHA] Interception active');
}

function stopRecaptchaInterception() {
    if (recaptchaInterceptionListener) {
        Logger.network('[reCAPTCHA] Stopping request interception...');
        chrome.webRequest.onBeforeRequest.removeListener(recaptchaInterceptionListener);
        recaptchaInterceptionListener = null;
        Logger.network('[reCAPTCHA] Interception stopped');
    }
}

async function processCaptureData(state) {
    Logger.network('[reCAPTCHA] Processing capture data...');

    const results = [];

    if (!state.reloadData || state.reloadData.length === 0) {
        Logger.warn('NETWORK', '[reCAPTCHA] No reload data captured');
        return results;
    }

    Logger.network(`[reCAPTCHA] Processing ${state.reloadData.length} reload requests...`);

    for (let index = 0; index < state.reloadData.length; index++) {
        const reloadItem = state.reloadData[index];
        try {
            const array = new Uint8Array(reloadItem.postData);
            const pbf = new Pbf(array);
            const message = Message.read(pbf);

            Logger.network('[reCAPTCHA] Decoded protobuf message');

            // Get siteKey from URL
            const siteKey = reloadItem.siteKey;

            // Extract action and invisible flag from protobuf
            const action = message.field_08 || '';
            const invisible = message.field_06 || '';
            const field17 = message.field_17 || '';

            const isInvisibleFromMessage = invisible.includes('fi');
            const hasSession = field17 && field17.toLowerCase() === 'session';

            // Determine required cookie based on session mode
            let requiredCookie = null;
            if (hasSession) {
                requiredCookie = 'recaptcha-ca-t';
                Logger.network('[reCAPTCHA] Cookie required: recaptcha-ca-t (v3 session mode)');
            }

            if (siteKey && state.anchorData[siteKey]) {
                const anchorInfo = state.anchorData[siteKey];

                let isReCaptchaV3 = true;
                let pageAction = action;
                let isInvisible = false;

                if (anchorInfo.pageAction) {
                    isReCaptchaV3 = false;
                    pageAction = anchorInfo.pageAction;
                } else if (state.hasV2Cookie) {
                    isReCaptchaV3 = false;
                } else if (action.length === 0) {
                    isReCaptchaV3 = false;
                }

                if (!isReCaptchaV3) {
                    const sizeParam = anchorInfo.size_param || '';
                    const field06HasFi = invisible.includes('fi');

                    if (sizeParam.includes('normal')) {
                        isInvisible = false;
                    } else if (sizeParam.includes('invisible') && field06HasFi) {
                        isInvisible = true;
                    } else if (sizeParam.includes('invisible')) {
                        isInvisible = true;
                    } else if (field06HasFi) {
                        isInvisible = true;
                    }
                }

                const result = {
                    siteKey,
                    siteUrl: anchorInfo.site_url,
                    action: pageAction,
                    isReCaptchaV3,
                    isInvisible,
                    isEnterprise: anchorInfo.is_enterprise,
                    isSRequired: anchorInfo.is_s_required,
                    apiDomain: anchorInfo.apiDomain,
                    hasSession: hasSession,
                    requiredCookie: requiredCookie,
                    version: isReCaptchaV3 ? 'reCAPTCHA v3' : 'reCAPTCHA v2',
                    type: isReCaptchaV3 ? 'Score-based' : (isInvisible ? 'Invisible' : 'Checkbox'),
                    protobufFields: message,
                    timestamp: reloadItem.timestamp
                };

                results.push(result);
                Logger.network(`[reCAPTCHA] Result #${index + 1} processed`);
            }
        } catch (error) {
            Logger.error('NETWORK', `[reCAPTCHA] Error decoding request #${index + 1}:`, error);
        }
    }

    Logger.network(`[reCAPTCHA] Processing complete. Total results: ${results.length}`);
    return results;
}

/**
 * Stop capturing reCAPTCHA requests for a specific tab
 * @param {number} tabId - The tab ID to stop capturing for
 * @returns {Promise<{status: string, results: Array, resultsCount: number}>} - Stop status and results
 */
async function reCaptchaStopCapture(tabId) {
    try {
        Logger.network('[reCAPTCHA] RECAPTCHA_STOP_CAPTURE received for tab:', tabId);

        const stateStop = reCaptchaCaptureStateRef.get(tabId);
        if (!stateStop) {
            Logger.network('[reCAPTCHA] No capture state found for tab:', tabId);
            return { status: 'not_capturing', results: [], resultsCount: 0 };
        }

        // Clear intervals and timeouts
        if (stateStop.captureInterval) {
            clearInterval(stateStop.captureInterval);
        }
        if (stateStop.captureTimeout) {
            Logger.network('[reCAPTCHA] Clearing 60s timeout (manual stop)');
            clearTimeout(stateStop.captureTimeout);
        }

        // Process captured data
        const capturedResults = await processCaptureData(stateStop);
        Logger.network('[reCAPTCHA] Manual stop - Captured results:', capturedResults);

        stateStop.results = capturedResults;
        stateStop.isCapturing = false;
        reCaptchaCaptureStateRef.set(tabId, stateStop);

        stopRecaptchaInterception();

        // Save to advanced history using helper
        if (capturedResults.length > 0 && saveToHistory) {
            try {
                const tab = await chrome.tabs.get(tabId);

                // Create capture data for each result
                for (const result of capturedResults) {
                    const captureData = {
                        type: 'recaptcha',
                        version: result.isReCaptchaV3 ? 'v3' : 'v2',
                        siteKey: result.siteKey,
                        action: result.action,
                        isEnterprise: result.isEnterprise,
                        isInvisible: result.isInvisible,
                        isSRequired: result.isSRequired,
                        apiDomain: result.apiDomain,
                        hasSession: result.hasSession,
                        requiredCookie: result.requiredCookie,
                        protobufFields: result.protobufFields,
                        siteUrl: result.siteUrl,
                        timestamp: result.timestamp
                    };

                    await saveToHistory(tabId, captureData, {
                        type: 'recaptcha',
                        expiryMinutes: 30
                    });
                }

                Logger.network('[reCAPTCHA] Saved to history using helper');
            } catch (err) {
                Logger.error('NETWORK', '[reCAPTCHA] Failed to save to history:', err);
            }
        }

        // Notify popup to clear UI
        chrome.runtime.sendMessage({ type: 'CAPTURE_COMPLETED' }).catch(() => {
            // Popup might not be open, ignore error
        });

        // Show success notification using helper
        if (showNotification) {
            await showNotification(tabId, {
                type: 'success',
                title: 'Capture Completed',
                message: capturedResults.length > 0
                    ? `${capturedResults.length} request${capturedResults.length !== 1 ? 's' : ''} captured and decoded`
                    : 'No reCAPTCHA requests captured',
                duration: 5000
            }).catch(err => {
                Logger.error('NETWORK', '[reCAPTCHA] Failed to show stop notification:', err);
                Logger.error('NETWORK', '[reCAPTCHA] Error details:', err.message, err.stack);
            });
        }

        // Delete capture state completely to prevent stale data
        reCaptchaCaptureStateRef.delete(tabId);

        return { status: 'stopped', results: capturedResults, resultsCount: capturedResults.length };
    } catch (error) {
        Logger.error('NETWORK', '[reCAPTCHA] Error in stopCapture:', error);
        return { status: 'error', error: error.message, results: [], resultsCount: 0 };
    }
}

/**
 * Handle tab updates during active reCAPTCHA capture
 */
function reCaptchaHandleCaptureTabUpdate(tabId, changeInfo, tab, chrome) {
    if (!reCaptchaCaptureStateRef) return;

    const state = reCaptchaCaptureStateRef.get(tabId);
    if (!state) return;

    // If URL changed (user navigated away), clear capture state
    if (changeInfo.url && state.captureUrl && changeInfo.url !== state.captureUrl) {
        Logger.network('[reCAPTCHA] URL changed, clearing capture state for tab:', tabId);
        if (state.captureInterval) {
            clearInterval(state.captureInterval);
        }
        reCaptchaCaptureStateRef.delete(tabId);
        stopRecaptchaInterception();
        return;
    }

    // Transition from step 1 to step 2 when page finishes loading
    if (changeInfo.status === 'complete' && state.step === 1) {
        state.step = 2;
        reCaptchaCaptureStateRef.set(tabId, state);

        // Show step 2 notification
        if (showNotification) {
            showNotification(tabId, {
                type: 'warning',
                title: 'reCAPTCHA Capture - Step 2',
                message: 'Now trigger or click the reCAPTCHA',
                duration: 60000 - (Date.now() - state.startTime)
            }).catch(err => Logger.error('NETWORK', '[reCAPTCHA] Failed to show Step 2 notification:', err));
        }
    }
}

/**
 * Centralized message handler for all reCAPTCHA-related messages
 * @param {object} request - Message request object
 * @param {function} sendResponse - Response callback
 * @param {Map} captureState - Capture state Map from background.js
 * @returns {boolean} True if async response
 */
function reCaptchaHandleMessage(request, sendResponse, captureState) {
    switch (request.type) {
        case 'RECAPTCHA_START_CAPTURE':
            // Handle async operation without making the whole function async
            reCaptchaInitializeInterceptor(captureState);
            reCaptchaStartCapture(request.tabId)
                .then(result => sendResponse(result))
                .catch(error => {
                    Logger.error('NETWORK', '[reCAPTCHA] Error in START_CAPTURE:', error);
                    sendResponse({ status: 'error', error: error.message });
                });
            return true; // Async response

        case 'RECAPTCHA_STOP_CAPTURE':
            // Handle async operation without making the whole function async
            reCaptchaInitializeInterceptor(captureState);
            reCaptchaStopCapture(request.tabId)
                .then(result => sendResponse(result))
                .catch(error => {
                    Logger.error('NETWORK', '[reCAPTCHA] Error in STOP_CAPTURE:', error);
                    sendResponse({ status: 'error', error: error.message });
                });
            return true; // Async response

        case 'RECAPTCHA_GET_CAPTURE_STATE':
            const tabIdGet = request.tabId;
            const stateGet = reCaptchaCaptureStateRef?.get(tabIdGet);
            sendResponse({
                isCapturing: stateGet?.isCapturing || false,
                step: stateGet?.step || 0
            });
            return false; // Sync response

        case 'RECAPTCHA_GET_CAPTURE_RESULTS':
            const tabIdResults = request.tabId;
            const stateResults = reCaptchaCaptureStateRef?.get(tabIdResults);
            if (stateResults && stateResults.results) {
                sendResponse({
                    success: true,
                    results: stateResults.results,
                    timestamp: stateResults.startTime
                });
            } else {
                sendResponse({
                    success: false,
                    results: [],
                    message: 'No capture results available'
                });
            }
            return false; // Sync response

        default:
            return false; // Not handled by this module
    }
}
