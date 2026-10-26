// Imperva/Incapsula Network Request Interceptor
// Captures Imperva cookies and script endpoints

// Guard against re-initialization (use var for service worker reload compatibility)
var impervaInterceptionListener = impervaInterceptionListener || null;
var impervaCaptureStateRef = impervaCaptureStateRef || null;
// Analyze Scripts: how long after the reloaded page loads to wait for late challenge requests
var IMPERVA_EXTRACT_SETTLE_MS = 8000;

// Destructure helpers from BaseInterceptorHelpers (use var to avoid redeclaration errors)
var checkCookies = self.BaseInterceptorHelpers?.checkCookies;
var checkUrls = self.BaseInterceptorHelpers?.checkUrls;
var saveToHistory = self.BaseInterceptorHelpers?.saveToHistory;
var showNotification = self.BaseInterceptorHelpers?.showNotification;
var getCaptureState = self.BaseInterceptorHelpers?.getCaptureState;
var setCaptureTimeout = self.BaseInterceptorHelpers?.setCaptureTimeout;
var clearCaptureTimeout = self.BaseInterceptorHelpers?.clearCaptureTimeout;
var removeCaptureState = self.BaseInterceptorHelpers?.removeCaptureState;
var removeListenerIfIdle = self.BaseInterceptorHelpers?.removeListenerIfIdle;
var showCaptureStarted = self.BaseInterceptorHelpers?.showCaptureStarted;

/**
 * Initialize Imperva interceptor with capture state reference
 * @param {Map} captureState - Map to store capture state per tab
 */
function impervaInitializeInterceptor(captureState) {
    if (impervaCaptureStateRef) {
        Logger.network('[IMPERVA-CAPTURE] Interceptor already initialized, skipping');
        return;
    }
    impervaCaptureStateRef = captureState;
    Logger.network('[IMPERVA-CAPTURE] Interceptor initialized with captureState');
}

/**
 * Start capturing Imperva data for a specific tab
 * @param {number} tabId - Tab ID to capture for
 * @param {string} captureUrl - Current URL of the tab
 * @returns {object} Status object
 */
function impervaStartCapture(tabId, captureUrl) {
    Logger.network('[IMPERVA-CAPTURE] ========== START CAPTURE ==========');
    Logger.network('[IMPERVA-CAPTURE] Tab ID:', tabId);
    Logger.network('[IMPERVA-CAPTURE] Capture URL:', captureUrl);
    Logger.network('[IMPERVA-CAPTURE] Started at:', new Date().toISOString());
    Logger.network('[IMPERVA-CAPTURE] Auto-stop in: 60 seconds');
    Logger.network('[IMPERVA-CAPTURE] Listening for: Imperva cookies and endpoints');
    Logger.network('[IMPERVA-CAPTURE] Waiting for page reload before capturing');
    Logger.network('[IMPERVA-CAPTURE] ========================================');

    if (!impervaInterceptionListener) {
        setupImpervaInterceptor();
    }

    impervaCaptureStateRef.set(tabId, {
        tabId: tabId,
        timestamp: Date.now(),
        timeout: null,
        waitingForReload: true,
        captureUrl: captureUrl,
        startTime: Date.now(),
        // URL monitoring
        urlsMonitored: [],
        incapResourceUrls: [],
        interrogationUrls: [],
        // Cookie tracking
        foundCookies: {
            reese84: false,
            utmvc: false,
            incapSes: [],
            nlbi: [],
            visid: []
        }
    });

    // Auto-stop after 60 seconds
    const state = (typeof getCaptureState === 'function')
        ? getCaptureState(impervaCaptureStateRef, tabId)
        : impervaCaptureStateRef.get(tabId);
    if (typeof setCaptureTimeout === 'function') {
        setCaptureTimeout(impervaCaptureStateRef, tabId, Constants.CAPTURE_AUTO_STOP_TIMEOUT, () => {
            Logger.network(`[IMPERVA-CAPTURE] Auto-stopping capture for tab ${tabId} (60s timeout reached)`);
            impervaStopCapture(tabId);
        });
    } else if (state) {
        state.timeout = setTimeout(() => {
            Logger.network(`[IMPERVA-CAPTURE] Auto-stopping capture for tab ${tabId} (60s timeout reached)`);
            impervaStopCapture(tabId);
        }, Constants.CAPTURE_AUTO_STOP_TIMEOUT);
    }

    // Show in-page notification
    if (typeof showCaptureStarted === 'function') {
        showCaptureStarted(tabId, {
            module: 'Imperva',
            title: pageText('pageNoticeMonitoringStartedFmt', '{0} Monitoring Started', 'Imperva'),
            message: pageText('advImpervaNoticeReloadToMonitor', 'Reload the page to begin monitoring Imperva requests and cookies'),
            duration: Constants.CAPTURE_AUTO_STOP_TIMEOUT
        }).catch(err => {
            Logger.error('NETWORK', '[IMPERVA-CAPTURE] Failed to show notification:', err);
        });
    } else if (showNotification) {
        showNotification(tabId, {
            module: 'Imperva',
            type: 'capture',
            title: pageText('pageNoticeMonitoringStartedFmt', '{0} Monitoring Started', 'Imperva'),
            message: pageText('advImpervaNoticeReloadToMonitor', 'Reload the page to begin monitoring Imperva requests and cookies'),
            duration: Constants.CAPTURE_AUTO_STOP_TIMEOUT // Show for 60 seconds (until auto-stop)
        }).catch(err => {
            Logger.error('NETWORK', '[IMPERVA-CAPTURE] Failed to show notification:', err);
        });
    }

    return { status: 'started' };
}

/**
 * Start extraction mode for analyzing Imperva scripts
 * @param {number} tabId - Tab ID to extract for
 * @param {string} url - Current URL of the tab
 * @returns {object} Status object
 */
function impervaStartExtraction(tabId, url) {
    Logger.network('[IMPERVA-EXTRACT] ========== START EXTRACTION ==========');
    Logger.network('[IMPERVA-EXTRACT] Tab ID:', tabId);
    Logger.network('[IMPERVA-EXTRACT] URL:', url);
    Logger.network('[IMPERVA-EXTRACT] Started at:', new Date().toISOString());
    Logger.network('[IMPERVA-EXTRACT] Monitoring POST requests for: old_token, performance, solution');
    Logger.network('[IMPERVA-EXTRACT] ========================================');

    if (!impervaCaptureStateRef) {
        throw new Error('Imperva capture state not initialized');
    }
    // A capture on this tab owns its state (and its capture job): never overwrite it
    const existing = impervaCaptureStateRef.get(tabId);
    if (existing && !existing.extractMode) {
        Logger.network('[IMPERVA-EXTRACT] A capture is running on this tab; extraction refused');
        return { status: 'capture_running' };
    }
    // A previous extraction on this tab is replaced: drop its load listener
    if (existing && typeof existing.removeLoadListener === 'function') existing.removeLoadListener();

    if (!impervaInterceptionListener) {
        setupImpervaInterceptor();
    }

    // Set up extraction state (with all tracking arrays to avoid undefined errors)
    impervaCaptureStateRef.set(tabId, {
        tabId: tabId,
        timestamp: Date.now(),
        timeout: null,
        extractMode: true, // Extraction mode flag
        captureUrl: url,
        startTime: Date.now(),
        // URL monitoring (required by interceptor)
        urlsMonitored: [],
        incapResourceUrls: [],
        interrogationUrls: [],
        // Extraction data
        extractedData: {
            challengeUrls: [],    // URLs with old_token/performance/solution
            payloads: [],          // Captured POST payloads
            cookies: {},           // All Imperva cookies
            scriptUrls: []         // Reese84/_Incapsula_Resource URLs
        }
    });

    // No challenge POST on the page: finish a few seconds after the reloaded page loads,
    // like the other Analyze Scripts tools, instead of waiting for the 60 s stop
    const onLoaded = (details) => {
        if (details.tabId !== tabId || details.frameId !== 0) return;
        chrome.webNavigation.onCompleted.removeListener(onLoaded);
        setTimeout(() => {
            const current = impervaCaptureStateRef.get(tabId);
            if (current && current.extractMode) {
                handleImpervaExtractionCompleted(tabId, current).finally(() => impervaRemoveListenerIfIdle());
            }
        }, IMPERVA_EXTRACT_SETTLE_MS);
    };
    chrome.webNavigation.onCompleted.addListener(onLoaded);
    const extractionState = impervaCaptureStateRef.get(tabId);
    if (extractionState) extractionState.removeLoadListener = () => chrome.webNavigation.onCompleted.removeListener(onLoaded);

    // Auto-stop after 60 seconds
    const state = (typeof getCaptureState === 'function')
        ? getCaptureState(impervaCaptureStateRef, tabId)
        : impervaCaptureStateRef.get(tabId);
    if (typeof setCaptureTimeout === 'function') {
        setCaptureTimeout(impervaCaptureStateRef, tabId, Constants.CAPTURE_AUTO_STOP_TIMEOUT, () => {
            Logger.network(`[IMPERVA-EXTRACT] Auto-stopping extraction for tab ${tabId} (60s timeout reached)`);
            impervaStopCapture(tabId);
        });
    } else if (state) {
        state.timeout = setTimeout(() => {
            Logger.network(`[IMPERVA-EXTRACT] Auto-stopping extraction for tab ${tabId} (60s timeout reached)`);
            impervaStopCapture(tabId);
        }, Constants.CAPTURE_AUTO_STOP_TIMEOUT);
    }

    return { status: 'started' };
}

/** Remove the request interceptor when no capture or extraction is running. */
function impervaRemoveListenerIfIdle() {
    if (typeof removeListenerIfIdle === 'function') {
        const removed = removeListenerIfIdle({
            captureStateRef: impervaCaptureStateRef,
            listenerRef: impervaInterceptionListener,
            removeFn: chrome.webRequest.onBeforeRequest.removeListener.bind(chrome.webRequest.onBeforeRequest)
        });
        if (removed) {
            impervaInterceptionListener = null;
            Logger.network('[IMPERVA-CAPTURE] Removed request interceptor (no active captures)');
        }
    } else if (impervaCaptureStateRef.size === 0 && impervaInterceptionListener) {
        chrome.webRequest.onBeforeRequest.removeListener(impervaInterceptionListener);
        impervaInterceptionListener = null;
        Logger.network('[IMPERVA-CAPTURE] Removed request interceptor (no active captures)');
    }
}

/**
 * Stop capturing for a specific tab
 * @param {number} tabId - Tab ID to stop capture for
 * @returns {object} Status and results
 */
function impervaStopCapture(tabId) {
    Logger.network('[IMPERVA-CAPTURE] ========== STOP CAPTURE ==========');
    Logger.network('[IMPERVA-CAPTURE] Tab ID:', tabId);

    const state = (typeof getCaptureState === 'function')
        ? getCaptureState(impervaCaptureStateRef, tabId)
        : impervaCaptureStateRef.get(tabId);
    // Analyze Scripts (extraction mode) timed out: report what it saw, even if nothing
    if (state && state.extractMode) {
        handleImpervaExtractionCompleted(tabId, state).finally(() => impervaRemoveListenerIfIdle());
        return { status: 'stopped', results: state };
    }
    if (state) {
        Logger.network('[IMPERVA-CAPTURE] Capture Results:');
        Logger.network('[IMPERVA-CAPTURE]   reese84 found:', state.foundCookies.reese84);
        Logger.network('[IMPERVA-CAPTURE]   utmvc found:', state.foundCookies.utmvc);
        Logger.network('[IMPERVA-CAPTURE]   incap_ses found:', state.foundCookies.incapSes.length);
        Logger.network('[IMPERVA-CAPTURE]   nlbi found:', state.foundCookies.nlbi.length);
        Logger.network('[IMPERVA-CAPTURE]   visid_incap found:', state.foundCookies.visid.length);
        Logger.network('[IMPERVA-CAPTURE]   incapResource URLs:', state.incapResourceUrls.length);
        Logger.network('[IMPERVA-CAPTURE]   interrogation URLs:', state.interrogationUrls.length);
        Logger.network('[IMPERVA-CAPTURE]   duration:', ((Date.now() - state.timestamp) / 1000).toFixed(2) + 's');

        // Show standardized success notification
        if (showNotification && state) {
            const capturedItems = state.foundCookies.reese84 + state.foundCookies.utmvc +
                                  state.foundCookies.incapSes.length + state.foundCookies.nlbi.length +
                                  state.foundCookies.visid.length;
            showNotification(tabId, {
                module: 'Imperva',
                type: 'success',
                title: pageText('pageNoticeCaptureCompleted', 'Capture Completed'),
                message: pageText('advImpervaNoticeCapturedItemsFmt', 'Imperva data captured (items: {0})', capturedItems),
                duration: 5000
            }).catch(err => {
                Logger.error('NETWORK', '[IMPERVA-CAPTURE] Failed to show notification:', err);
            });
        }

        if (typeof clearCaptureTimeout === 'function') {
            clearCaptureTimeout(state);
        } else if (state.timeout) {
            clearTimeout(state.timeout);
        }
        if (typeof removeCaptureState === 'function') {
            removeCaptureState(impervaCaptureStateRef, tabId);
        } else {
            impervaCaptureStateRef.delete(tabId);
        }
    } else {
        Logger.network('[IMPERVA-CAPTURE] No capture state found for tab');
    }

    impervaRemoveListenerIfIdle();

    Logger.network('[IMPERVA-CAPTURE] ========================================');

    return { status: 'stopped', results: state };
}

/**
 * Get capture state for a tab
 * @param {number} tabId - Tab ID
 * @returns {object} Capture state
 */
function impervaGetCaptureState(tabId) {
    if (!impervaCaptureStateRef) {
        Logger.network('[IMPERVA-CAPTURE] CaptureStateRef is null, returning default state');
        return {
            isCapturing: false,
            state: null
        };
    }

    if (typeof impervaCaptureStateRef.get !== 'function') {
        Logger.error('NETWORK', '[IMPERVA-CAPTURE] CaptureStateRef is not a Map:', typeof impervaCaptureStateRef);
        return {
            isCapturing: false,
            state: null
        };
    }

    const state = (typeof getCaptureState === 'function')
        ? getCaptureState(impervaCaptureStateRef, tabId)
        : impervaCaptureStateRef.get(tabId);
    return {
        isCapturing: !!state,
        state: state || null
    };
}

/**
 * Handle tab updates during active Imperva capture
 * @param {number} tabId - Tab ID
 * @param {object} changeInfo - Change information
 * @param {object} tab - Tab information
 */
function impervaHandleCaptureTabUpdate(tabId, changeInfo, tab) {
    if (!impervaCaptureStateRef) return;

    const state = (typeof getCaptureState === 'function')
        ? getCaptureState(impervaCaptureStateRef, tabId)
        : impervaCaptureStateRef.get(tabId);
    if (!state) return;

    // If URL changed (user navigated to a different page), clear capture state
    // Compare base URLs to ignore hash/query param changes
    if (changeInfo.url && state.captureUrl) {
        try {
            const oldUrl = new URL(state.captureUrl);
            const newUrl = new URL(changeInfo.url);
            const oldBase = `${oldUrl.origin}${oldUrl.pathname}`;
            const newBase = `${newUrl.origin}${newUrl.pathname}`;

            if (oldBase !== newBase) {
                Logger.network('[IMPERVA-CAPTURE] URL changed (navigation detected), clearing capture state for tab:', tabId);
                Logger.network('[IMPERVA-CAPTURE] Old URL:', oldBase);
                Logger.network('[IMPERVA-CAPTURE] New URL:', newBase);
                if (typeof clearCaptureTimeout === 'function') {
                    clearCaptureTimeout(state);
                } else if (state.timeout) {
                    clearTimeout(state.timeout);
                }
                if (typeof removeCaptureState === 'function') {
                    removeCaptureState(impervaCaptureStateRef, tabId);
                } else {
                    impervaCaptureStateRef.delete(tabId);
                }

                if (typeof removeListenerIfIdle === 'function') {
                    const removed = removeListenerIfIdle({
                        captureStateRef: impervaCaptureStateRef,
                        listenerRef: impervaInterceptionListener,
                        removeFn: chrome.webRequest.onBeforeRequest.removeListener.bind(chrome.webRequest.onBeforeRequest)
                    });
                    if (removed) {
                        impervaInterceptionListener = null;
                        Logger.network('[IMPERVA-CAPTURE] Removed request interceptor (no active captures)');
                    }
                } else if (impervaCaptureStateRef.size === 0 && impervaInterceptionListener) {
                    chrome.webRequest.onBeforeRequest.removeListener(impervaInterceptionListener);
                    impervaInterceptionListener = null;
                    Logger.network('[IMPERVA-CAPTURE] Removed request interceptor (no active captures)');
                }
                return;
            }
        } catch (error) {
            Logger.error('NETWORK', '[IMPERVA-CAPTURE] Error comparing URLs:', error);
        }
    }

    // When page finishes loading after reload, mark as ready to capture
    if (changeInfo.status === 'complete' && state.waitingForReload) {
        Logger.network('[IMPERVA-CAPTURE] Page reload detected! Ready to capture data');
        state.waitingForReload = false;
        state.reloadDetectedAt = Date.now();
        impervaCaptureStateRef.set(tabId, state);

        // Check cookies immediately after reload
        checkImpervaCookies(tabId, tab.url);
    }
}

/**
 * Check for Imperva cookies after page reload (using BaseInterceptorHelpers)
 * @param {number} tabId - Tab ID
 * @param {string} url - Page URL
 */
async function checkImpervaCookies(tabId, url) {
    try {
        const state = (typeof getCaptureState === 'function')
            ? getCaptureState(impervaCaptureStateRef, tabId)
            : impervaCaptureStateRef.get(tabId);
        if (!state) return;

        // Use checkCookies helper instead of manual chrome.cookies.getAll
        const cookies = await checkCookies(url, [
            { name: { pattern: 'reese84' }, returnValue: false },
            { name: { pattern: 'utmvc' }, returnValue: false },
            { name: { pattern: 'incap_ses_\\d+_\\d+', regex: true }, returnValue: false },
            { name: { pattern: 'nlbi_\\d+', regex: true }, returnValue: false },
            { name: { pattern: 'visid_incap_\\d+', regex: true }, returnValue: false }
        ], tabId);

        if (impervaCaptureStateRef.get(tabId) !== state) return;

        // Check for reese84
        const hasReese84 = cookies.some(c => c.name === 'reese84');
        if (hasReese84) {
            Logger.network('[IMPERVA-CAPTURE] Found reese84 cookie');
            state.foundCookies.reese84 = true;
        }

        // Check for utmvc
        const hasUtmvc = cookies.some(c => /^_*utmvc$/.test(c.name));
        if (hasUtmvc) {
            Logger.network('[IMPERVA-CAPTURE] Found utmvc cookie');
            state.foundCookies.utmvc = true;
        }

        // Check for incap_ses_* cookies (dynamic numbers)
        const incapSesCookies = cookies.filter(c => /^incap_ses_\d+_\d+$/.test(c.name));
        if (incapSesCookies.length > 0) {
            Logger.network('[IMPERVA-CAPTURE] Found', incapSesCookies.length, 'incap_ses cookies');
            state.foundCookies.incapSes = incapSesCookies.map(c => c.name);
        }

        // Check for nlbi_* cookies
        const nlbiCookies = cookies.filter(c => /^nlbi_\d+/.test(c.name));
        if (nlbiCookies.length > 0) {
            Logger.network('[IMPERVA-CAPTURE] Found', nlbiCookies.length, 'nlbi cookies');
            state.foundCookies.nlbi = nlbiCookies.map(c => c.name);
        }

        // Check for visid_incap_* cookies
        const visidCookies = cookies.filter(c => /^visid_incap_\d+/.test(c.name));
        if (visidCookies.length > 0) {
            Logger.network('[IMPERVA-CAPTURE] Found', visidCookies.length, 'visid_incap cookies');
            state.foundCookies.visid = visidCookies.map(c => c.name);
        }

        impervaCaptureStateRef.set(tabId, state);

        // If we have data, check if we should auto-complete
        checkAndCompleteCapture(tabId);
    } catch (error) {
        Logger.error('NETWORK', '[IMPERVA-CAPTURE] Error checking cookies:', error);
    }
}

/**
 * Check if we have enough data to complete capture
 * @param {number} tabId - Tab ID
 */
function checkAndCompleteCapture(tabId) {
    const state = (typeof getCaptureState === 'function')
        ? getCaptureState(impervaCaptureStateRef, tabId)
        : impervaCaptureStateRef.get(tabId);
    if (!state || state.waitingForReload) return;

    // Check if we have any meaningful data
    const hasCookies = state.foundCookies.reese84 || state.foundCookies.utmvc || state.foundCookies.incapSes.length > 0;
    const hasUrls = state.incapResourceUrls.length > 0 || state.interrogationUrls.length > 0;

    if (hasCookies || hasUrls) {
        // We have data - complete after a short delay to collect more
        setTimeout(() => {
            const currentState = impervaCaptureStateRef.get(tabId);
            if (currentState === state && !currentState.completed) {
                Logger.network('[IMPERVA-CAPTURE] Auto-completing capture (data collected)');
                currentState.completed = true;
                handleImpervaCaptureCompleted(tabId, currentState);
            }
        }, 5000); // Wait 5 seconds to collect more data
    }
}

/**
 * Handle Imperva capture completion
 * @param {number} tabId - Tab ID
 * @param {object} interceptorData - Captured data
 */
async function handleImpervaCaptureCompleted(tabId, interceptorData) {
    const completionState = impervaCaptureStateRef?.get(tabId);
    const completionIdentity = AdvancedJobManager.captureIdentity(completionState, tabId, 'imperva');
    Logger.network('[IMPERVA-CAPTURE] ========== HANDLING CAPTURE COMPLETION ==========');

    try {
        // Get tab info
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            Logger.error('NETWORK', '[IMPERVA-CAPTURE] Tab not found or no URL');
            return;
        }
        Logger.network('[IMPERVA-CAPTURE] Tab info retrieved:', { url: tab.url, title: tab.title });

        // Get cookies one final time using helper
        Logger.network('[IMPERVA-CAPTURE] Step 2: Getting cookies for URL:', tab.url);
        // Use checkCookies helper
        const cookies = await checkCookies(tab.url, [
            { name: { pattern: 'reese84' }, returnValue: false },
            { name: { pattern: 'utmvc' }, returnValue: false },
            { name: { pattern: 'incap_ses_\\d+_\\d+', regex: true }, returnValue: false },
            { name: { pattern: 'nlbi_\\d+', regex: true }, returnValue: false },
            { name: { pattern: 'visid_incap_\\d+', regex: true }, returnValue: false }
        ], tab.id);
        Logger.network('[IMPERVA-CAPTURE] Total Imperva cookies found:', cookies.length);

        const hasReese84 = cookies.some(c => c.name === 'reese84');
        const hasUtmvc = cookies.some(c => /^_*utmvc$/.test(c.name));
        const incapSesCookies = cookies.filter(c => /^incap_ses_\d+_\d+$/.test(c.name));
        const nlbiCookies = cookies.filter(c => /^nlbi_\d+/.test(c.name));
        const visidCookies = cookies.filter(c => /^visid_incap_\d+/.test(c.name));

        Logger.network('[IMPERVA-CAPTURE] Cookie status:', {
            hasReese84: hasReese84,
            hasUtmvc: hasUtmvc,
            incapSesCookies: incapSesCookies.map(c => c.name),
            nlbiCookies: nlbiCookies.map(c => c.name),
            visidCookies: visidCookies.map(c => c.name)
        });

        // Create capture data
        const captureData = {
            type: 'imperva',
            // Cookie requirements
            requiresReese84: hasReese84,
            requiresUtmvc: hasUtmvc,
            incapSesCookies: incapSesCookies.map(c => c.name),
            nlbiCookies: nlbiCookies.map(c => c.name),
            visidCookies: visidCookies.map(c => c.name),
            // URL detections
            incapResourceUrls: interceptorData.incapResourceUrls || [],
            interrogationUrls: interceptorData.interrogationUrls || [],
            // Site info
            siteUrl: tab.url,
            timestamp: Date.now()
        };
        Logger.network('[IMPERVA-CAPTURE] Capture data created successfully');

        // Save to history using helper
        const newCapture = await saveToHistory(tabId, captureData, {
            type: 'incapsula',
            expiryMinutes: 30
        });
        Logger.network('[IMPERVA-CAPTURE] Successfully saved capture to history:', newCapture.id);

        // Show success notification
        if (typeof showNotification === 'function') {
            try {
                await showNotification(tabId, {
                    module: 'Imperva',
                    type: 'success',
                    title: pageText('advImpervaNoticeCaptureComplete', 'Imperva Capture Complete'),
                    message: pageText('advImpervaNoticeSensorCaptured', 'Sensor data captured successfully'),
                    duration: 3000
                });
            } catch (error) {
                Logger.network('[IMPERVA-CAPTURE] Notification error:', error.message);
            }
        }

        // Clean up capture state
        Logger.network('[IMPERVA-CAPTURE] Step 7: Cleaning up capture state for tab:', tabId);
        if (completionState && impervaCaptureStateRef?.get(tabId) === completionState) {
            const state = (typeof getCaptureState === 'function')
                ? getCaptureState(impervaCaptureStateRef, tabId)
                : impervaCaptureStateRef.get(tabId);
            if (typeof clearCaptureTimeout === 'function') {
                clearCaptureTimeout(state);
            } else if (state && state.timeout) {
                clearTimeout(state.timeout);
            }
            if (typeof removeCaptureState === 'function') {
                removeCaptureState(impervaCaptureStateRef, tabId);
            } else {
                impervaCaptureStateRef.delete(tabId);
            }
            Logger.network('[IMPERVA-CAPTURE] Capture state cleared');
        }

        // If no more active captures, remove listener
        if (impervaCaptureStateRef && typeof removeListenerIfIdle === 'function') {
            const removed = removeListenerIfIdle({
                captureStateRef: impervaCaptureStateRef,
                listenerRef: impervaInterceptionListener,
                removeFn: chrome.webRequest.onBeforeRequest.removeListener.bind(chrome.webRequest.onBeforeRequest)
            });
            if (removed) {
                impervaInterceptionListener = null;
                Logger.network('[IMPERVA-CAPTURE] All captures stopped - listener removed');
            }
        } else if (impervaCaptureStateRef && impervaCaptureStateRef.size === 0 && impervaInterceptionListener) {
            chrome.webRequest.onBeforeRequest.removeListener(impervaInterceptionListener);
            impervaInterceptionListener = null;
            Logger.network('[IMPERVA-CAPTURE] All captures stopped - listener removed');
        }

        // Notify popup (if open)
        Logger.debug('NETWORK', '[IMPERVA-CAPTURE] Step 8: Notifying popup (if open)');
        chrome.runtime.sendMessage(AdvancedJobManager.completionMessage(completionIdentity, {
            type: 'IMPERVA_CAPTURE_COMPLETED',
            captureData: newCapture
        })).catch(() => {
            Logger.network('[IMPERVA-CAPTURE] Popup not open, message not sent (this is normal)');
        });

        Logger.network('[IMPERVA-CAPTURE] ========== CAPTURE COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        Logger.error('NETWORK', '[IMPERVA-CAPTURE] Error handling capture completion:', error);
        Logger.error('NETWORK', '[IMPERVA-CAPTURE] Error stack:', error.stack);

        // Clean up on error
        if (completionState && impervaCaptureStateRef?.get(tabId) === completionState) {
            if (typeof removeCaptureState === 'function') {
                removeCaptureState(impervaCaptureStateRef, tabId);
            } else {
                impervaCaptureStateRef.delete(tabId);
            }
        }
    }
}

/**
 * Handle Imperva extraction completion
 * @param {number} tabId - Tab ID
 * @param {object} extractionState - Extraction state with captured data
 */
async function handleImpervaExtractionCompleted(tabId, extractionState) {
    if (extractionState && typeof extractionState.removeLoadListener === 'function') extractionState.removeLoadListener();
    Logger.network('[IMPERVA-EXTRACT] ========== EXTRACTION COMPLETED ==========');
    Logger.network('[IMPERVA-EXTRACT] Tab ID:', tabId);

    try {
        // Get tab info
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            Logger.error('NETWORK', '[IMPERVA-EXTRACT] Tab not found or no URL');
            return;
        }

        // Get all Imperva cookies, organized by type
        const cookieData = await impervaCookieData(tab);

        // Build extraction result
        const extractedData = {
            challengeUrls: extractionState.extractedData.challengeUrls || [],
            payloads: extractionState.extractedData.payloads || [],
            cookies: cookieData,
            scriptUrls: extractionState.extractedData.scriptUrls || [],
            timestamp: Date.now(),
            url: tab.url,
            hostname: new URL(tab.url).hostname
        };

        Logger.network('[IMPERVA-EXTRACT] Extraction results:', {
            challengeUrls: extractedData.challengeUrls.length,
            payloads: extractedData.payloads.length,
            scriptUrls: extractedData.scriptUrls.length,
            cookies: Object.keys(cookieData).filter(k => cookieData[k]).length
        });

        // Send extraction results to popup
        chrome.runtime.sendMessage({
            type: 'IMPERVA_EXTRACTION_COMPLETED',
            tabId,
            extractedData: extractedData
        }).catch(err => {
            Logger.network('[IMPERVA-EXTRACT] Popup not open (this is normal):', err.message);
        });

        // Clean up extraction state
        if (typeof clearCaptureTimeout === 'function') {
            clearCaptureTimeout(extractionState);
        } else if (extractionState.timeout) {
            clearTimeout(extractionState.timeout);
        }
        if (typeof removeCaptureState === 'function') {
            removeCaptureState(impervaCaptureStateRef, tabId);
        } else {
            impervaCaptureStateRef.delete(tabId);
        }

        Logger.network('[IMPERVA-EXTRACT] ========== EXTRACTION COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        Logger.error('NETWORK', '[IMPERVA-EXTRACT] Error handling extraction completion:', error);
        Logger.error('NETWORK', '[IMPERVA-EXTRACT] Error stack:', error.stack);

        // Clean up on error
        if (impervaCaptureStateRef && impervaCaptureStateRef.has(tabId)) {
            if (typeof removeCaptureState === 'function') {
                removeCaptureState(impervaCaptureStateRef, tabId);
            } else {
                impervaCaptureStateRef.delete(tabId);
            }
        }
    }
}

/**
 * The page's Imperva cookies, organized by type (the extraction result's cookies)
 * @param {chrome.tabs.Tab} tab
 */
async function impervaCookieData(tab) {
    const cookies = await checkCookies(tab.url, [
        { name: { pattern: 'reese84' }, returnValue: true },
        { name: { pattern: 'utmvc' }, returnValue: true },
        { name: { pattern: 'incap_ses_\\d+_\\d+', regex: true }, returnValue: true },
        { name: { pattern: 'nlbi_\\d+', regex: true }, returnValue: true },
        { name: { pattern: 'visid_incap_\\d+', regex: true }, returnValue: true }
    ], tab.id);
    return {
        reese84: cookies.find(c => c.name === 'reese84'),
        utmvc: cookies.find(c => /^_*utmvc$/.test(c.name)),
        incap_ses: cookies.filter(c => /^incap_ses_/.test(c.name)),
        nlbi: cookies.filter(c => /^nlbi_/.test(c.name)),
        visid: cookies.filter(c => /^visid_incap_/.test(c.name))
    };
}

// The script paths the result window reads (ImpervaAdvanced.parseScriptPaths): UTMVC's _Incapsula_Resource script,
// and Reese84's first-party /<path>/<number> script, here only as a whole path so a CDN's /v/2/app.js is not one
var IMPERVA_UTMVC_SCRIPT = /\/_Incapsula_Resource\?SWKMTFSR=1&e=/i;
var IMPERVA_REESE_SCRIPT = /^\/[^/]+\/\d+\/?$/;

/**
 * The scripts and requests the page lists now (runs in the page): script tags and Resource Timing entries.
 * Self-contained: chrome.scripting serializes it.
 * @returns {Array<[string, string]>} [url, kind]
 */
function impervaPageRequests() {
    return [
        ...Array.from(document.scripts, script => [script.src, 'script']),
        ...performance.getEntriesByType('resource').map(entry => [entry.name, entry.initiatorType])
    ];
}

/**
 * Analyze Scripts on the page as already loaded, with no cookie deleted and no reload, so the popup stays open:
 * the Reese84 / UTMVC script URLs among the page's script tags, its Resource Timing list and the requests the worker
 * recorded for the tab, plus the cookies, in the extraction result's shape. The challenge POSTs (payloads) are only
 * seen while a reload is watched, so they stay empty here. found is false when no Imperva script is listed.
 * @returns {Promise<{data: object, found: boolean}>}
 */
async function impervaFromLoadedPage(tabId) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) throw new Error('Unable to get tab URL');
    const page = new URL(tab.url);
    // Reese84 is served from the protected site itself: the same site, or any _Incapsula_Resource
    const site = page.hostname.split('.').slice(-2).join('.');
    const sameSite = host => host === site || host.endsWith('.' + site);
    const kinds = { script: 'script', xmlhttprequest: 'xhr', fetch: 'xhr', other: 'other' };
    const seen = new Map();
    const add = (url, kind) => {
        if (typeof url !== 'string' || !/^https?:/i.test(url) || seen.has(url) || !kinds[kind]) return;
        let parsed;
        try { parsed = new URL(url); } catch (_) { return; }
        const incapsula = /_incapsula_resource|\/interrogation/i.test(url);
        if (!incapsula && (kinds[kind] === 'other' || !sameSite(parsed.hostname))) return;
        seen.set(url, { url, kind: kinds[kind], path: parsed.pathname, query: parsed.search });
    };
    try {
        const frames = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: impervaPageRequests });
        for (const frame of frames || []) {
            for (const [url, kind] of Array.isArray(frame && frame.result) ? frame.result : []) add(url, kind);
        }
    } catch (_) { /* A page the extension cannot script: what the worker recorded */ }
    const recorded = typeof networkUrlsStore !== 'undefined' ? networkUrlsStore.get(tabId) : null;
    for (const entry of Array.isArray(recorded) ? recorded : []) add(entry && entry.url, entry && entry.type);
    const entries = Array.from(seen.values());
    const reese = entries.filter(entry => entry.kind === 'script' && IMPERVA_REESE_SCRIPT.test(entry.path));
    const utmvc = entries.filter(entry => IMPERVA_UTMVC_SCRIPT.test(entry.path + entry.query));
    // The result window takes the first URL that looks like each script: the real ones first
    const first = new Set([...reese, ...utmvc]);
    const scriptUrls = [...first, ...entries.filter(entry => !first.has(entry))].map(entry => entry.url);
    const data = {
        challengeUrls: [],
        payloads: [],
        cookies: await impervaCookieData(tab),
        scriptUrls,
        timestamp: Date.now(),
        url: tab.url,
        hostname: page.hostname,
        loadedPage: true
    };
    return { data, found: first.size > 0 };
}

/**
 * Setup network request interceptor for Imperva endpoints
 */
function setupImpervaInterceptor() {
    Logger.network('[IMPERVA-CAPTURE] Setting up request interceptor');

    impervaInterceptionListener = (details) => {
        const state = (typeof getCaptureState === 'function')
            ? getCaptureState(impervaCaptureStateRef, details.tabId)
            : impervaCaptureStateRef.get(details.tabId);
        if (!state) return;

        // If waiting for reload, don't monitor yet
        if (state.waitingForReload) {
            return;
        }

        const originalUrl = details.url;

        // Track all monitored URLs
        state.urlsMonitored.push(originalUrl);

        // Use checkUrls helper for pattern matching
        const urlCheck = checkUrls(originalUrl, {
            patterns: ['_Incapsula_Resource', '/interrogation'],
            caseSensitive: false,
            returnMatches: true
        });

        // Check for _Incapsula_Resource pattern
        if (urlCheck.found && urlCheck.matches.some(u => u.includes('_Incapsula_Resource') || u.includes('_incapsula_resource'))) {
            Logger.network('[IMPERVA-CAPTURE] Incapsula Resource URL detected:', originalUrl);
            state.incapResourceUrls.push(originalUrl);
            impervaCaptureStateRef.set(details.tabId, state);
        }

        // Check for interrogation URLs
        if (urlCheck.found && urlCheck.matches.some(u => u.includes('interrogation'))) {
            Logger.network('[IMPERVA-CAPTURE] Interrogation URL detected:', originalUrl);
            state.interrogationUrls.push(originalUrl);
            impervaCaptureStateRef.set(details.tabId, state);
        }

        // Check request body for "interrogation" keyword
        if (details.method === 'POST' && details.requestBody) {
            try {
                let rawBody = null;

                if (details.requestBody.raw && details.requestBody.raw[0]) {
                    const decoder = new TextDecoder('utf-8');
                    rawBody = decoder.decode(details.requestBody.raw[0].bytes);
                } else if (details.requestBody.formData) {
                    rawBody = JSON.stringify(details.requestBody.formData);
                }

                if (rawBody && rawBody.toLowerCase().includes('interrogation')) {
                    Logger.network('[IMPERVA-CAPTURE] Interrogation URL detected:', originalUrl);
                    state.interrogationUrls.push(originalUrl);
                    impervaCaptureStateRef.set(details.tabId, state);
                }

                // ========== EXTRACTION MODE ==========
                // Check for challenge/solution keywords in payload
                if (state.extractMode && rawBody) {
                    const rawBodyLower = rawBody.toLowerCase();
                    const keywords = ['old_token', 'performance', 'solution'];
                    const foundKeywords = keywords.filter(kw => rawBodyLower.includes(kw));

                    if (foundKeywords.length > 0) {
                        Logger.network('[IMPERVA-EXTRACT] Challenge/Solution data found!');
                        Logger.network('[IMPERVA-EXTRACT] Keywords found:', foundKeywords);
                        Logger.network('[IMPERVA-EXTRACT] URL:', originalUrl);
                        Logger.network('[IMPERVA-EXTRACT] Payload preview:', rawBody.substring(0, 200));

                        // Initialize extractedData if not exists
                        if (!state.extractedData) {
                            state.extractedData = {
                                challengeUrls: [],
                                payloads: [],
                                cookies: {},
                                scriptUrls: []
                            };
                        }

                        // Store the challenge URL and payload
                        state.extractedData.challengeUrls.push({
                            url: originalUrl,
                            keywords: foundKeywords,
                            timestamp: Date.now()
                        });

                        state.extractedData.payloads.push({
                            url: originalUrl,
                            payload: rawBody,
                            keywords: foundKeywords,
                            timestamp: Date.now()
                        });

                        impervaCaptureStateRef.set(details.tabId, state);

                        // Auto-complete extraction when we have challenge data
                        Logger.network('[IMPERVA-EXTRACT] Challenge data captured, completing extraction');
                        setTimeout(() => {
                            const currentState = (typeof getCaptureState === 'function')
                                ? getCaptureState(impervaCaptureStateRef, details.tabId)
                                : impervaCaptureStateRef.get(details.tabId);
                            if (currentState && currentState.extractMode) {
                                handleImpervaExtractionCompleted(details.tabId, currentState);
                            }
                        }, 2000); // Wait 2 seconds to collect more data
                    }
                }
            } catch (error) {
                Logger.error('NETWORK', '[IMPERVA-CAPTURE] Error processing request body:', error);
            }
        }

        // Track script URLs in extraction mode
        if (state.extractMode) {
            // Initialize extractedData if not exists
            if (!state.extractedData) {
                state.extractedData = {
                    challengeUrls: [],
                    payloads: [],
                    cookies: {},
                    scriptUrls: []
                };
            }

            // Track ALL scripts and XHR requests in extraction mode (not just pattern matches)
            // This includes Reese84 scripts (/abc123/456), UTMVC scripts, and interrogation endpoints
            if (details.type === 'script' || details.type === 'xmlhttprequest' || urlCheck.found) {
                // Avoid duplicates
                if (!state.extractedData.scriptUrls.includes(originalUrl)) {
                    Logger.network('[IMPERVA-EXTRACT] Tracking script URL:', originalUrl);
                    state.extractedData.scriptUrls.push(originalUrl);
                    impervaCaptureStateRef.set(details.tabId, state);
                }
            }
        }
    };

    // Register listener for all requests
    chrome.webRequest.onBeforeRequest.addListener(
        impervaInterceptionListener,
        {
            urls: ["<all_urls>"],
            types: ["xmlhttprequest", "other", "script"]
        },
        ["requestBody"]
    );

    Logger.network('[IMPERVA-CAPTURE] Request interceptor ready');
}


/**
 * Centralized message handler for all Imperva-related messages
 * @param {object} request - Message request object
 * @param {function} sendResponse - Response callback
 * @returns {boolean} True if async response
 */
function impervaHandleMessage(request, sendResponse) {
    switch (request.type) {
        case 'IMPERVA_START_CAPTURE':
            // Handle async operation without making the whole function async
            (async () => {
                try {
                    // Ensure interceptor is initialized (lazy initialization)
                    if (typeof impervaInitializeInterceptor === 'function' && impervaCaptureState) {
                        impervaInitializeInterceptor(impervaCaptureState);
                    }

                    if (!impervaCaptureState) {
                        throw new Error('Imperva capture state not initialized');
                    }

                    // Get current tab URL
                    const tab = await chrome.tabs.get(request.tabId);
                    if (!tab || !tab.url) {
                        throw new Error('Unable to get tab URL');
                    }

                    const result = impervaStartCapture(request.tabId, tab.url);
                    sendResponse(result);
                } catch (error) {
                    Logger.error('NETWORK', '[Imperva] Error starting capture:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'IMPERVA_STOP_CAPTURE':
            try {
                const result = impervaStopCapture(request.tabId);
                sendResponse(result);
            } catch (error) {
                Logger.error('NETWORK', '[Imperva] Error stopping capture:', error);
                sendResponse({ status: 'error', error: error.message });
            }
            return false; // Sync response (no async needed)

        case 'IMPERVA_EXTRACT_SCRIPTS':
            // Handle async operation without making the whole function async
            (async () => {
                try {
                    // After a worker restart only START/GET-state had set the ref
                    if (typeof impervaInitializeInterceptor === 'function' && typeof impervaCaptureState !== 'undefined' && impervaCaptureState) {
                        impervaInitializeInterceptor(impervaCaptureState);
                    }

                    // Get current tab URL
                    const tab = await chrome.tabs.get(request.tabId);
                    if (!tab || !tab.url) {
                        throw new Error('Unable to get tab URL');
                    }

                    const result = impervaStartExtraction(request.tabId, tab.url);
                    if (result && result.status === 'capture_running') {
                        sendResponse({ status: 'capture_running', error: 'Stop the running capture on this tab first' });
                        return;
                    }
                    sendResponse({ status: 'success', message: 'Extraction mode enabled' });
                } catch (error) {
                    Logger.error('NETWORK', '[IMPERVA-EXTRACT] Error starting extraction:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'IMPERVA_GET_CAPTURE_STATE':
            try {
                // Ensure interceptor is initialized
                if (typeof impervaInitializeInterceptor === 'function' && impervaCaptureState) {
                    impervaInitializeInterceptor(impervaCaptureState);
                }

                const state = impervaGetCaptureState(request.tabId);
                sendResponse(state);
            } catch (error) {
                Logger.error('NETWORK', '[Imperva] Error getting capture state:', error);
                sendResponse({ status: 'error', error: error.message });
            }
            return false; // Sync response

        case 'IMPERVA_CAPTURE_COMPLETED':
            // NOTE: Capture processing is now handled directly in ImpervaInterceptor.js
            // This message is only for notifying the popup UI to refresh
            // The actual data processing and storage happens in handleImpervaCaptureCompleted()
            Logger.network('[IMPERVA-CAPTURE] Capture completed message received (UI notification only)');
            return false; // Sync response

        default:
            return false; // Not handled by this module
    }
}
