// Imperva/Incapsula Network Request Interceptor
// Captures Imperva cookies and script endpoints

// Guard against re-initialization (use var for service worker reload compatibility)
var impervaInterceptionListener = impervaInterceptionListener || null;
var impervaCaptureStateRef = impervaCaptureStateRef || null;

// Destructure helpers from BaseInterceptorHelpers (use var to avoid redeclaration errors)
var checkCookies = self.BaseInterceptorHelpers?.checkCookies;
var checkUrls = self.BaseInterceptorHelpers?.checkUrls;
var saveToHistory = self.BaseInterceptorHelpers?.saveToHistory;
var showNotification = self.BaseInterceptorHelpers?.showNotification;

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
    const state = impervaCaptureStateRef.get(tabId);
    state.timeout = setTimeout(() => {
        Logger.network(`[IMPERVA-CAPTURE] Auto-stopping capture for tab ${tabId} (60s timeout reached)`);
        impervaStopCapture(tabId);
    }, 60000);

    // Show in-page notification
    if (showNotification) {
        showNotification(tabId, {
            type: 'capture',
            title: 'Imperva Capture Active',
            message: 'Please reload the page to start monitoring',
            duration: 60000 // Show for 60 seconds (until auto-stop)
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

    // Auto-stop after 60 seconds
    const state = impervaCaptureStateRef.get(tabId);
    state.timeout = setTimeout(() => {
        Logger.network(`[IMPERVA-EXTRACT] Auto-stopping extraction for tab ${tabId} (60s timeout reached)`);
        impervaStopCapture(tabId);
    }, 60000);

    return { status: 'started' };
}

/**
 * Stop capturing for a specific tab
 * @param {number} tabId - Tab ID to stop capture for
 * @returns {object} Status and results
 */
function impervaStopCapture(tabId) {
    Logger.network('[IMPERVA-CAPTURE] ========== STOP CAPTURE ==========');
    Logger.network('[IMPERVA-CAPTURE] Tab ID:', tabId);

    const state = impervaCaptureStateRef.get(tabId);
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
                type: 'success',
                title: 'Capture Completed',
                message: `Imperva data captured (${capturedItems} items)`,
                duration: 5000
            }).catch(err => {
                Logger.error('NETWORK', '[IMPERVA-CAPTURE] Failed to show notification:', err);
            });
        }

        if (state.timeout) {
            clearTimeout(state.timeout);
        }
        impervaCaptureStateRef.delete(tabId);
    } else {
        Logger.network('[IMPERVA-CAPTURE] No capture state found for tab');
    }

    // If no more active captures, remove listener
    if (impervaCaptureStateRef.size === 0 && impervaInterceptionListener) {
        chrome.webRequest.onBeforeRequest.removeListener(impervaInterceptionListener);
        impervaInterceptionListener = null;
        Logger.network('[IMPERVA-CAPTURE] Removed request interceptor (no active captures)');
    }

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

    const state = impervaCaptureStateRef.get(tabId);
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

    const state = impervaCaptureStateRef.get(tabId);
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
                if (state.timeout) {
                    clearTimeout(state.timeout);
                }
                impervaCaptureStateRef.delete(tabId);

                if (impervaCaptureStateRef.size === 0 && impervaInterceptionListener) {
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
        const state = impervaCaptureStateRef.get(tabId);
        if (!state) return;

        // Use checkCookies helper instead of manual chrome.cookies.getAll
        const cookies = await checkCookies(url, [
            { name: { pattern: 'reese84' }, returnValue: false },
            { name: { pattern: 'utmvc' }, returnValue: false },
            { name: { pattern: 'incap_ses_\\d+_\\d+', regex: true }, returnValue: false },
            { name: { pattern: 'nlbi_\\d+', regex: true }, returnValue: false },
            { name: { pattern: 'visid_incap_\\d+', regex: true }, returnValue: false }
        ]);

        // Check for reese84
        const hasReese84 = cookies.some(c => c.name === 'reese84');
        if (hasReese84) {
            Logger.network('[IMPERVA-CAPTURE] Found reese84 cookie');
            state.foundCookies.reese84 = true;
        }

        // Check for utmvc
        const hasUtmvc = cookies.some(c => c.name === 'utmvc');
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
    const state = impervaCaptureStateRef.get(tabId);
    if (!state || state.waitingForReload) return;

    // Check if we have any meaningful data
    const hasCookies = state.foundCookies.reese84 || state.foundCookies.utmvc || state.foundCookies.incapSes.length > 0;
    const hasUrls = state.incapResourceUrls.length > 0 || state.interrogationUrls.length > 0;

    if (hasCookies || hasUrls) {
        // We have data - complete after a short delay to collect more
        setTimeout(() => {
            const currentState = impervaCaptureStateRef.get(tabId);
            if (currentState && !currentState.completed) {
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
    Logger.network('[IMPERVA-CAPTURE] ========== HANDLING CAPTURE COMPLETION ==========');

    try {
        // Get tab info
        Logger.network('[IMPERVA-CAPTURE] Step 1: Getting tab info...');
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
        ]);
        Logger.network('[IMPERVA-CAPTURE] Total Imperva cookies found:', cookies.length);

        const hasReese84 = cookies.some(c => c.name === 'reese84');
        const hasUtmvc = cookies.some(c => c.name === 'utmvc');
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
        Logger.network('[IMPERVA-CAPTURE] Step 3: Creating capture data object...');
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
        Logger.network('[IMPERVA-CAPTURE] Step 4: Saving to history using helper...');
        const newCapture = await saveToHistory(tabId, captureData, {
            type: 'incapsula',
            expiryMinutes: 30
        });
        Logger.network('[IMPERVA-CAPTURE] Successfully saved capture to history:', newCapture.id);

        // Show success notification
        if (typeof showNotification === 'function') {
            try {
                await showNotification(tabId, {
                    type: 'success',
                    title: 'Imperva Capture Complete',
                    message: 'Sensor data captured successfully',
                    duration: 3000
                });
            } catch (error) {
                Logger.network('[IMPERVA-CAPTURE] Notification error:', error.message);
            }
        }

        // Clean up capture state
        Logger.network('[IMPERVA-CAPTURE] Step 7: Cleaning up capture state for tab:', tabId);
        if (impervaCaptureStateRef && impervaCaptureStateRef.has(tabId)) {
            const state = impervaCaptureStateRef.get(tabId);
            if (state && state.timeout) {
                clearTimeout(state.timeout);
            }
            impervaCaptureStateRef.delete(tabId);
            Logger.network('[IMPERVA-CAPTURE] Capture state cleared');
        }

        // If no more active captures, remove listener
        if (impervaCaptureStateRef && impervaCaptureStateRef.size === 0 && impervaInterceptionListener) {
            chrome.webRequest.onBeforeRequest.removeListener(impervaInterceptionListener);
            impervaInterceptionListener = null;
            Logger.network('[IMPERVA-CAPTURE] All captures stopped - listener removed');
        }

        // Notify popup (if open)
        Logger.network('[IMPERVA-CAPTURE] Step 8: Notifying popup (if open)...');
        chrome.runtime.sendMessage({
            type: 'IMPERVA_CAPTURE_COMPLETED',
            captureData: newCapture
        }).catch(() => {
            Logger.network('[IMPERVA-CAPTURE] Popup not open, message not sent (this is normal)');
        });

        Logger.network('[IMPERVA-CAPTURE] ========== CAPTURE COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        Logger.error('NETWORK', '[IMPERVA-CAPTURE] Error handling capture completion:', error);
        Logger.error('NETWORK', '[IMPERVA-CAPTURE] Error stack:', error.stack);

        // Clean up on error
        if (impervaCaptureStateRef && impervaCaptureStateRef.has(tabId)) {
            impervaCaptureStateRef.delete(tabId);
        }
    }
}

/**
 * Handle Imperva extraction completion
 * @param {number} tabId - Tab ID
 * @param {object} extractionState - Extraction state with captured data
 */
async function handleImpervaExtractionCompleted(tabId, extractionState) {
    Logger.network('[IMPERVA-EXTRACT] ========== EXTRACTION COMPLETED ==========');
    Logger.network('[IMPERVA-EXTRACT] Tab ID:', tabId);

    try {
        // Get tab info
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            Logger.error('NETWORK', '[IMPERVA-EXTRACT] Tab not found or no URL');
            return;
        }

        // Get all Imperva cookies
        const cookies = await checkCookies(tab.url, [
            { name: { pattern: 'reese84' }, returnValue: true },
            { name: { pattern: 'utmvc' }, returnValue: true },
            { name: { pattern: 'incap_ses_\\d+_\\d+', regex: true }, returnValue: true },
            { name: { pattern: 'nlbi_\\d+', regex: true }, returnValue: true },
            { name: { pattern: 'visid_incap_\\d+', regex: true }, returnValue: true }
        ]);

        // Organize cookies by type
        const cookieData = {
            reese84: cookies.find(c => c.name === 'reese84'),
            utmvc: cookies.find(c => c.name === 'utmvc'),
            incap_ses: cookies.filter(c => /^incap_ses_/.test(c.name)),
            nlbi: cookies.filter(c => /^nlbi_/.test(c.name)),
            visid: cookies.filter(c => /^visid_incap_/.test(c.name))
        };

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
            extractedData: extractedData
        }).catch(err => {
            Logger.network('[IMPERVA-EXTRACT] Popup not open (this is normal):', err.message);
        });

        // Clean up extraction state
        if (extractionState.timeout) {
            clearTimeout(extractionState.timeout);
        }
        impervaCaptureStateRef.delete(tabId);

        Logger.network('[IMPERVA-EXTRACT] ========== EXTRACTION COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        Logger.error('NETWORK', '[IMPERVA-EXTRACT] Error handling extraction completion:', error);
        Logger.error('NETWORK', '[IMPERVA-EXTRACT] Error stack:', error.stack);

        // Clean up on error
        if (impervaCaptureStateRef && impervaCaptureStateRef.has(tabId)) {
            impervaCaptureStateRef.delete(tabId);
        }
    }
}

/**
 * Setup network request interceptor for Imperva endpoints
 */
function setupImpervaInterceptor() {
    Logger.network('[IMPERVA-CAPTURE] Setting up request interceptor');

    impervaInterceptionListener = (details) => {
        const state = impervaCaptureStateRef.get(details.tabId);
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
                        Logger.network('[IMPERVA-EXTRACT] Challenge data captured, completing extraction...');
                        setTimeout(() => {
                            const currentState = impervaCaptureStateRef.get(details.tabId);
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

// ========== ANALYSIS MODE (DISABLED - Requires webRequestBlocking) ==========
// Note: Analysis mode with response filtering is not supported in Manifest V3
// Regular capture mode above still works without blocking webRequest
/*
// Track analysis mode state (separate from capture mode)
const impervaAnalysisState = new Map();

function getImpervaAnalysisState(tabId) {
    return impervaAnalysisState.get(tabId) || null;
}

function impervaStartAnalysis(tabId, url) {
    Logger.network('[IMPERVA-ANALYZE] Starting analysis for tab:', tabId, 'URL:', url);

    impervaAnalysisState.set(tabId, {
        tabId,
        url,
        startedAt: Date.now(),
        detectedUrls: [],
        requests: new Map()
    });

    Logger.network('[IMPERVA-ANALYZE] Analysis mode enabled for tab:', tabId);
    return { status: 'success' };
}

function impervaStopAnalysis(tabId) {
    Logger.network('[IMPERVA-ANALYZE] Stopping analysis for tab:', tabId);
    const state = impervaAnalysisState.get(tabId) || null;
    if (state) {
        state.stoppedAt = Date.now();
        impervaAnalysisState.delete(tabId);
    }
    return state || { tabId, stoppedAt: Date.now(), detectedUrls: [] };
}

function notifyImpervaAnalysisUpdate(tabId) {
    const state = impervaAnalysisState.get(tabId);
    if (!state) return;

    try {
        chrome.runtime.sendMessage({
            type: 'IMPERVA_ANALYSIS_RESULT',
            tabId,
            detectedUrls: state.detectedUrls
        }).catch(() => {});
    } catch (error) {
        Logger.error('NETWORK', '[IMPERVA-ANALYZE] Failed to send analysis update:', error);
    }
}

function upsertImpervaAnalysisRecord(tabId, requestId, updates) {
    const state = impervaAnalysisState.get(tabId);
    if (!state) return;

    const existing = state.requests.get(requestId) || {
        requestId,
        url: updates.url,
        method: updates.method,
        matchesReese84: updates.matchesReese84 || /reese84/i.test(updates.url || ''),
        timestamp: Date.now()
    };

    const merged = {
        ...existing,
        ...updates
    };

    state.requests.set(requestId, merged);

    const idx = state.detectedUrls.findIndex(item => item.requestId === requestId);
    if (idx >= 0) {
        state.detectedUrls[idx] = { ...state.detectedUrls[idx], ...merged };
    } else {
        state.detectedUrls.push({ ...merged });
    }

    impervaAnalysisState.set(tabId, state);
    notifyImpervaAnalysisUpdate(tabId);
}

function isImpervaRelevantUrl(url) {
    if (!url) return false;
    const lowered = url.toLowerCase();
    return lowered.includes('reese84') || lowered.includes('_incapsula_resource');
}

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        try {
            const state = impervaAnalysisState.get(details.tabId);
            if (!state) return;
            if (details.method !== 'POST') return;
            if (!isImpervaRelevantUrl(details.url)) return;

            Logger.network('[IMPERVA-ANALYZE] Intercepting POST for analysis:', details.url);

            // Record start
            upsertImpervaAnalysisRecord(details.tabId, details.requestId, {
                url: details.url,
                method: details.method,
                startedAt: Date.now(),
                matchesReese84: /reese84/i.test(details.url)
            });

            // Reconstruct POST body from requestBody
            let bodyData = null;
            if (details.requestBody && details.requestBody.raw) {
                try {
                    const chunks = details.requestBody.raw.map(chunk => {
                        return new Uint8Array(chunk.bytes);
                    });

                    // Concatenate all chunks
                    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
                    const combined = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of chunks) {
                        combined.set(chunk, offset);
                        offset += chunk.length;
                    }
                    bodyData = combined;
                } catch (error) {
                    Logger.error('NETWORK', '[IMPERVA-ANALYZE] Error reconstructing POST body:', error);
                }
            }

            // Simple fetch to read response
            const fetchOptions = {
                method: 'POST',
                mode: 'cors',
                credentials: 'include'
            };

            if (bodyData) {
                fetchOptions.body = bodyData;
            }

            fetch(details.url, fetchOptions)
                .then(response => response.text())
                .then(responseText => {
                    Logger.network('[IMPERVA-ANALYZE] Received response, length:', responseText.length);

                    const truncated = responseText.length > 20000;
                    const collected = truncated ? responseText.slice(0, 20000) : responseText;
                    const lowered = collected.toLowerCase();
                    const containsToken = lowered.includes('"token"') || lowered.includes('token');

                    upsertImpervaAnalysisRecord(details.tabId, details.requestId, {
                        url: details.url,
                        method: details.method,
                        containsToken,
                        responsePreview: collected.slice(0, 3500),
                        responseTruncated: truncated,
                        matchesReese84: /reese84/i.test(details.url),
                        completedAt: Date.now()
                    });
                })
                .catch(error => {
                    Logger.error('NETWORK', '[IMPERVA-ANALYZE] Fetch error:', error);
                    upsertImpervaAnalysisRecord(details.tabId, details.requestId, {
                        url: details.url,
                        method: details.method,
                        error: 'fetch_failed: ' + error.message
                    });
                });
        } catch (error) {
            Logger.error('NETWORK', '[IMPERVA-ANALYZE] Error in onBeforeRequest:', error);
        }
    },
    { urls: ["<all_urls>"], types: ["xmlhttprequest", "other", "script"] },
    ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
    (details) => {
        try {
            const state = impervaAnalysisState.get(details.tabId);
            if (!state) return;
            if (details.method !== 'POST') return;
            if (!isImpervaRelevantUrl(details.url)) return;

            upsertImpervaAnalysisRecord(details.tabId, details.requestId, {
                url: details.url,
                method: details.method,
                statusCode: details.statusCode,
                ip: details.ip,
                fromCache: details.fromCache,
                completedAt: Date.now()
            });
        } catch (error) {
            Logger.error('NETWORK', '[IMPERVA-ANALYZE] Error in onCompleted:', error);
        }
    },
    { urls: ["<all_urls>"] }
);

chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
        try {
            const state = impervaAnalysisState.get(details.tabId);
            if (!state) return;
            if (details.method !== 'POST') return;
            if (!isImpervaRelevantUrl(details.url)) return;

            upsertImpervaAnalysisRecord(details.tabId, details.requestId, {
                url: details.url,
                method: details.method,
                error: details.error,
                completedAt: Date.now()
            });
        } catch (error) {
            Logger.error('NETWORK', '[IMPERVA-ANALYZE] Error in onErrorOccurred:', error);
        }
    },
    { urls: ["<all_urls>"] }
);
*/

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
                    // Get current tab URL
                    const tab = await chrome.tabs.get(request.tabId);
                    if (!tab || !tab.url) {
                        throw new Error('Unable to get tab URL');
                    }

                    impervaStartExtraction(request.tabId, tab.url);
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

        case 'IMPERVA_SHOW_ANALYZING_NOTIFICATION':
            // Show analyzing notification for script extraction
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        Logger.network('[IMPERVA] Showing analyzing notification...');
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: 'Extracting Imperva Scripts',
                            message: 'Monitoring for challenge and solution data...',
                            duration: 10000
                        });
                        Logger.network('[IMPERVA] Notification shown successfully');
                    } else {
                        Logger.network('[IMPERVA] showNotification function not available');
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    Logger.error('NETWORK', '[IMPERVA] Error showing notification:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        default:
            return false; // Not handled by this module
    }
}
