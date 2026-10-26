/**
 * hCaptcha Script Interceptor
 * Handles hCaptcha request interception, version checking, and data capture
 */

// Guard against re-initialization (use var for service worker reload compatibility)
var hcaptchaInterceptionListener = hcaptchaInterceptionListener || null;

var showNotification = self.BaseInterceptorHelpers?.showNotification;
var saveToHistory = self.BaseInterceptorHelpers?.saveToHistory;
var getCaptureState = self.BaseInterceptorHelpers?.getCaptureState;
var setCaptureTimeout = self.BaseInterceptorHelpers?.setCaptureTimeout;
var clearCaptureTimeout = self.BaseInterceptorHelpers?.clearCaptureTimeout;
var removeCaptureState = self.BaseInterceptorHelpers?.removeCaptureState;
var showCaptureStarted = self.BaseInterceptorHelpers?.showCaptureStarted;
var registerManagedListener = self.BaseInterceptorHelpers?.registerManagedListener;
var cleanupManagedListeners = self.BaseInterceptorHelpers?.cleanupManagedListeners;

// hCaptcha capture state (initialized via hcaptchaInitializeInterceptor)
var hcaptchaCaptureStateRef = hcaptchaCaptureStateRef || null;

/**
 * Initialize hCaptcha interceptor with capture state from background.js
 * @param {TTLMap} captureState - TTLMap instance from background.js
 */
function hcaptchaInitializeInterceptor(captureState) {
    if (hcaptchaCaptureStateRef) {
        Logger.network('[hCaptcha] Interceptor already initialized, skipping');
        return;
    }
    hcaptchaCaptureStateRef = captureState;
}

// Store active version check requests
const activeVersionChecks = {};

// api.js parameters only Enterprise site keys can use. recaptchacompat is open to everyone.
const HCAPTCHA_ENTERPRISE_API_PARAMS = ['custom_theme', 'sentry', 'custom', 'apiEndpoint', 'endpoint', 'reportapi', 'assethost', 'imghost'];
// Endpoint parameters are Enterprise only when they point away from hCaptcha's own hosts
const HCAPTCHA_ENDPOINT_PARAMS = ['apiEndpoint', 'endpoint', 'reportapi', 'assethost', 'imghost'];

/** The first api.js parameter that shows an Enterprise site key, or undefined. */
function hcaptchaEnterpriseParam(searchParams) {
    return HCAPTCHA_ENTERPRISE_API_PARAMS.find(name => {
        const value = String(searchParams.get(name) || '').trim();
        // custom=False, sentry=false and the like switch the feature off
        if (!value || /^(?:false|0|off|no)$/i.test(value)) return false;
        if (!HCAPTCHA_ENDPOINT_PARAMS.includes(name)) return true;
        try {
            const host = new URL(value, 'https://hcaptcha.com').hostname.toLowerCase();
            return host !== 'hcaptcha.com' && !host.endsWith('.hcaptcha.com');
        } catch (_) {
            return true;
        }
    });
}

/** Records an Enterprise sign once. */
function hcaptchaMarkEnterprise(target, method) {
    target.isEnterprise = true;
    if (!target.detectionMethods.includes(method)) target.detectionMethods.push(method);
}

/** A request body as text: Chrome gives form posts as formData and others as raw bytes. */
function hcaptchaRequestBodyText(body) {
    if (!body) return '';
    if (body.formData) {
        return Object.entries(body.formData).map(([key, values]) => `${key}=${[].concat(values).join(',')}`).join('&');
    }
    if (Array.isArray(body.raw)) {
        return body.raw.map(part => (part && part.bytes ? new TextDecoder().decode(part.bytes) : '')).join('');
    }
    return '';
}

/**
 * Reads one request into target ({ version, websiteKey, websiteURL, isEnterprise, detectionMethods }).
 * Paths only, so Enterprise custom endpoints count too. Returns the checksiteconfig URL to
 * fetch for its Enterprise-only features, else null.
 */
function hcaptchaInspectRequest(details, target) {
    let parsed;
    try { parsed = new URL(details.url); } catch (_) { return null; }
    const path = parsed.pathname;
    if (path.includes('/checksiteconfig')) {
        target.version = target.version || parsed.searchParams.get('v') || '';
        target.websiteURL = target.websiteURL || parsed.searchParams.get('host') || '';
        target.websiteKey = target.websiteKey || parsed.searchParams.get('sitekey') || '';
        return details.url;
    }
    if (/\/1\/(?:secure-)?api\.js$/.test(path)) {
        const param = hcaptchaEnterpriseParam(parsed.searchParams);
        if (param) hcaptchaMarkEnterprise(target, 'api-param-' + param);
        return null;
    }
    if (path.includes('/getcaptcha/') && /(?:^|[&{",\s])"?rqdata"?\s*[=:]/.test(hcaptchaRequestBodyText(details.requestBody))) {
        hcaptchaMarkEnterprise(target, 'rqdata');
    }
    return null;
}

// checksiteconfig features that only Enterprise site keys get. Others, such as enc_get_req,
// come back even for an unregistered key, so "any feature" is not an Enterprise sign.
const HCAPTCHA_ENTERPRISE_FEATURES = ['custom_theme'];

/** Whether a checksiteconfig response lists an Enterprise-only feature. */
async function hcaptchaFetchFeatures(configUrl) {
    const response = await fetch(configUrl);
    const data = await response.json();
    return hcaptchaHasEnterpriseFeature(data);
}

function hcaptchaHasEnterpriseFeature(config) {
    const features = (config && config.features) || {};
    return HCAPTCHA_ENTERPRISE_FEATURES.some(name => features[name] === true);
}

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

    if (hcaptchaCaptureStateRef.has(tabId)) {
        Logger.network('[hCaptcha-Capture] Already capturing for this tab');
        return { status: 'already_capturing' };
    }

    // Initialize capture state
    hcaptchaCaptureStateRef.set(tabId, {
        active: true,
        timestamp: Date.now(),
        captureUrl: captureUrl,
        version: null,
        websiteKey: null,
        websiteURL: null,
        isEnterprise: false,
        detectionMethods: []
    });

    // Complete once: two checksiteconfig responses (or one plus the request path)
    // must not both save. The flag is set before the first await.
    const completeCapture = (state, why) => {
        if (state.completed || hcaptchaCaptureStateRef.get(tabId) !== state) return;
        state.completed = true;
        Logger.network(`[hCaptcha-Capture] All required data captured (${why})`);
        if (typeof clearCaptureTimeout === 'function') {
            clearCaptureTimeout(state);
        } else if (state.timeout) {
            clearTimeout(state.timeout);
        }
        chrome.webRequest.onBeforeRequest.removeListener(requestListener);
        handleHCaptchaCaptureCompleted(tabId, {
            version: state.version,
            websiteKey: state.websiteKey,
            websiteURL: state.websiteURL,
            isEnterprise: state.isEnterprise,
            detectionMethods: state.detectionMethods,
            timestamp: state.timestamp
        });
    };

    // Set up network request listener
    const requestListener = (details) => {
        if (details.tabId !== tabId) return;
        const state = (typeof getCaptureState === 'function')
            ? getCaptureState(hcaptchaCaptureStateRef, tabId)
            : hcaptchaCaptureStateRef.get(tabId);
        if (!state || state.completed) return;

        // checksiteconfig, api.js and getcaptcha: version, site key, website and Enterprise signs
        const configUrl = hcaptchaInspectRequest(details, state);
        if (configUrl) {
            // Wait for the checksiteconfig response(s) before completing
            state.pendingChecksiteconfig = (state.pendingChecksiteconfig || 0) + 1;
            state.waitingForChecksiteconfig = true;
            hcaptchaFetchFeatures(configUrl)
                .then(enterprise => {
                    if (hcaptchaCaptureStateRef.get(tabId) !== state || state.completed) return;
                    if (enterprise) hcaptchaMarkEnterprise(state, 'checksiteconfig-features');
                })
                .catch(err => {
                    Logger.warn('NETWORK', '[hCaptcha-Capture] Fetch error:', err);
                })
                .finally(() => {
                    state.pendingChecksiteconfig = Math.max(0, (state.pendingChecksiteconfig || 1) - 1);
                    state.waitingForChecksiteconfig = state.pendingChecksiteconfig > 0;
                    if (!state.waitingForChecksiteconfig && state.version && state.websiteKey) {
                        completeCapture(state, 'after checksiteconfig fetch');
                    }
                });
        }

        // Check if we have all required data to complete capture
        // Don't complete if we're still waiting for checksiteconfig response
        if (state.version && state.websiteKey && !state.waitingForChecksiteconfig) {
            completeCapture(state, 'request');
        }
    };

    // Add network listener
    chrome.webRequest.onBeforeRequest.addListener(
        requestListener,
        { urls: ['<all_urls>'], tabId: tabId },
        ['requestBody']
    );
    if (typeof registerManagedListener === 'function') {
        registerManagedListener(
            tabId,
            'hcaptcha-capture-webrequest',
            requestListener,
            chrome.webRequest.onBeforeRequest.removeListener.bind(chrome.webRequest.onBeforeRequest)
        );
    }

    // Store listener for cleanup
    const state = (typeof getCaptureState === 'function')
        ? getCaptureState(hcaptchaCaptureStateRef, tabId)
        : hcaptchaCaptureStateRef.get(tabId);
    if (state) {
        state.requestListener = requestListener;
    }

    // Auto-stop after 60 seconds
    if (typeof setCaptureTimeout === 'function') {
        setCaptureTimeout(hcaptchaCaptureStateRef, tabId, Constants.CAPTURE_AUTO_STOP_TIMEOUT, () => {
            Logger.network(`[hCaptcha-Capture] Auto-stopping capture for tab ${tabId} (60s timeout reached)`);
            hcaptchaStopCapture(tabId, 'timeout');
        });
    } else if (state) {
        state.timeout = setTimeout(() => {
            Logger.network(`[hCaptcha-Capture] Auto-stopping capture for tab ${tabId} (60s timeout reached)`);
            hcaptchaStopCapture(tabId, 'timeout');
        }, Constants.CAPTURE_AUTO_STOP_TIMEOUT);
    }

    // Show in-page notification
    if (typeof showCaptureStarted === 'function') {
        showCaptureStarted(tabId, {
            module: 'hCaptcha',
            title: pageText('pageNoticeMonitoringStartedFmt', '{0} Monitoring Started', 'hCaptcha'),
            message: pageText('advHcaptchaNoticeReloadToMonitor', 'Reload the page to begin monitoring hCaptcha requests'),
            duration: Constants.CAPTURE_AUTO_STOP_TIMEOUT
        }).catch(err => {
            Logger.error('NETWORK', '[hCaptcha-Capture] Failed to show notification:', err);
        });
    } else if (showNotification) {
        showNotification(tabId, {
            module: 'hCaptcha',
            type: 'capture',
            title: pageText('pageNoticeMonitoringStartedFmt', '{0} Monitoring Started', 'hCaptcha'),
            message: pageText('advHcaptchaNoticeReloadToMonitor', 'Reload the page to begin monitoring hCaptcha requests'),
            duration: Constants.CAPTURE_AUTO_STOP_TIMEOUT
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
    const completionState = hcaptchaCaptureStateRef?.get(tabId);
    const completionIdentity = AdvancedJobManager.captureIdentity(completionState, tabId, 'hcaptcha');
    Logger.network('[hCaptcha-Capture] ========== HANDLING CAPTURE COMPLETION ==========');
    // Its listener and timer are gone: a failure below must not leave the tab "capturing"
    const dropState = () => {
        if (completionState && hcaptchaCaptureStateRef?.get(tabId) === completionState) {
            if (typeof removeCaptureState === 'function') removeCaptureState(hcaptchaCaptureStateRef, tabId);
            else hcaptchaCaptureStateRef.delete(tabId);
        }
    };

    try {
        // Get tab info
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            Logger.error('NETWORK', '[hCaptcha-Capture] Tab not found or no URL');
            dropState();
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
        if (completionState && hcaptchaCaptureStateRef?.get(tabId) === completionState) {
            if (typeof removeCaptureState === 'function') {
                removeCaptureState(hcaptchaCaptureStateRef, tabId);
            } else {
                hcaptchaCaptureStateRef.delete(tabId);
            }
        }

        // Notify popup to update UI (if open)
        Logger.debug('NETWORK', '[hCaptcha-Capture] Notifying popup (if open)');
        chrome.runtime.sendMessage(AdvancedJobManager.completionMessage(completionIdentity, {
            type: 'HCAPTCHA_CAPTURE_COMPLETED',
            captureData: {
                type: 'hcaptcha',
                captureData: captureData,
                timestamp: Date.now()
            }
        })).catch((err) => {
            Logger.network('[hCaptcha-Capture] Popup not open, message not sent (this is normal)');
        });

        // Show success notification in page
        Logger.debug('NETWORK', '[hCaptcha-Capture] Showing success notification');
        if (showNotification) {
            await showNotification(tabId, {
                module: 'hCaptcha',
                type: 'success',
                title: pageText('pageNoticeCaptureCompleted', 'Capture Completed'),
                message: pageText('advHcaptchaNoticeCaptured', 'hCaptcha data captured successfully'),
                duration: 5000
            }).catch(err => {
                Logger.error('NETWORK', '[hCaptcha-Capture] Failed to show notification:', err);
            });
        }

        Logger.network('[hCaptcha-Capture] ========== CAPTURE COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        Logger.error('NETWORK', '[hCaptcha-Capture] Error handling capture completion:', error);
        dropState();
    }
}

/**
 * Stop capturing for a specific tab and save results to history
 */
function hcaptchaStopCapture(tabId, reason = 'manual') {
    Logger.network('[hCaptcha-Capture] ========== STOP CAPTURE ==========');
    Logger.network('[hCaptcha-Capture] Tab ID:', tabId);

    const state = (typeof getCaptureState === 'function')
        ? getCaptureState(hcaptchaCaptureStateRef, tabId)
        : hcaptchaCaptureStateRef.get(tabId);
    if (!state) {
        Logger.network('[hCaptcha-Capture] No capture state for this tab');
        return { status: 'not_capturing' };
    }
    // A completion already owns this capture (it removes the state once saved)
    if (state.completed) return { status: 'stopped' };
    state.completed = true;
    const completionIdentity = (typeof AdvancedJobManager !== 'undefined')
        ? AdvancedJobManager.captureIdentity(state, tabId, 'hcaptcha')
        : { tabId, vendorId: 'hcaptcha', operation: 'capture' };

    // Clean up listeners
    if (state.requestListener) {
        chrome.webRequest.onBeforeRequest.removeListener(state.requestListener);
    }
    if (typeof clearCaptureTimeout === 'function') {
        clearCaptureTimeout(state);
    } else if (state.timeout) {
        clearTimeout(state.timeout);
    }

    // Log capture results
    Logger.network('[hCaptcha-Capture] Capture Results:');
    Logger.network('[hCaptcha-Capture] Version:', state.version);
    Logger.network('[hCaptcha-Capture] Enterprise:', state.isEnterprise);
    Logger.network('[hCaptcha-Capture] Site Key:', state.websiteKey);
    Logger.network('[hCaptcha-Capture] Website URL:', state.websiteURL);

    // Clean up state
    if (typeof removeCaptureState === 'function') {
        removeCaptureState(hcaptchaCaptureStateRef, tabId);
    } else {
        hcaptchaCaptureStateRef.delete(tabId);
    }
    if (typeof cleanupManagedListeners === 'function') {
        cleanupManagedListeners(tabId, 'hcaptcha');
    }
    Logger.network('[hCaptcha-Capture] ========================================');

    // 60 s without the data: say so on the page and tell the popup, as FunCaptcha does
    if (reason === 'timeout') {
        if (typeof showNotification === 'function') {
            showNotification(tabId, {
                module: 'hCaptcha',
                type: 'warning',
                title: pageText('advFuncaptchaCaptureTimeout', 'Capture Timeout'),
                message: pageText('advHcaptchaNoDataTimeout', 'No hCaptcha data detected (60s timeout)'),
                duration: 5000
            }).catch(err => {
                Logger.error('NETWORK', '[hCaptcha-Capture] Failed to show timeout notification:', err);
            });
        }
        const timeoutMessage = { type: 'HCAPTCHA_CAPTURE_COMPLETED', captureData: null, reason: 'timeout' };
        Promise.resolve().then(() => chrome.runtime.sendMessage(typeof AdvancedJobManager !== 'undefined'
            ? AdvancedJobManager.completionMessage(completionIdentity, timeoutMessage)
            : { ...timeoutMessage, ...completionIdentity })).catch(() => { /* popup not open */ });
    }

    return { status: 'stopped' };
}

/**
 * Get current capture state for a tab
 */
function hcaptchaGetCaptureState(tabId) {
    const state = (typeof getCaptureState === 'function')
        ? getCaptureState(hcaptchaCaptureStateRef, tabId)
        : hcaptchaCaptureStateRef.get(tabId);
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
            const configUrl = hcaptchaInspectRequest(details, detectedData);
            if (configUrl) {
                hcaptchaFetchFeatures(configUrl)
                    .then(enterprise => { if (enterprise) hcaptchaMarkEnterprise(detectedData, 'checksiteconfig-features'); })
                    .catch(err => Logger.warn('NETWORK', '[hCaptcha] Fetch error:', err));
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
        Logger.network('[hCaptcha] Listeners added, waiting for network requests');
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
            tabId,
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
function handleHCaptchaMessage(request, sender, sendResponse, captureState) {
    // Initialize interceptor with TTLMap from background.js on first message
    if (captureState) {
        hcaptchaInitializeInterceptor(captureState);
    }

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
            sendResponse(hcaptchaStartAnalysis(request.tabId, request.url, request.requestId));
            return false;

        case 'HCAPTCHA_CAPTURE_COMPLETED':
            // NOTE: Capture processing is now handled directly in hcaptcha-interceptor.js
            // This message is only for notifying the popup UI to refresh
            Logger.network('[hCaptcha-Capture] Capture completed message received (UI notification only)');
            return false; // Sync response

        default:
            return false; // Not handled by this module
    }
}

function hcaptchaStartAnalysis(tabId, url, requestId) {
    return AdvancedScriptAnalysis.start({ tabId, url, requestId, vendorId: 'hcaptcha', classify: hcaptchaClassifyUrl });
}

/**
 * Which hCaptcha request a URL is, or null: api.js, checksiteconfig,
 * getcaptcha, the hsw.js proof-of-work script, the widget frame, and other
 * hcaptcha.com requests.
 */
function hcaptchaClassifyUrl(requestUrl) {
    let parsed;
    try { parsed = new URL(requestUrl); } catch (_) { return null; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;
    if (host !== 'hcaptcha.com' && !host.endsWith('.hcaptcha.com')) return null;
    if (/^\/1\/(?:secure-)?api\.js$/.test(path)) return 'api';
    if (path.startsWith('/checksiteconfig')) return 'config';
    if (path.startsWith('/getcaptcha')) return 'challenge';
    if (path.endsWith('/hsw.js')) return 'hsw';
    if (path.endsWith('.html')) return 'frame';
    return 'hcaptcha';
}

Logger.network('[hCaptcha] Interceptor loaded');
