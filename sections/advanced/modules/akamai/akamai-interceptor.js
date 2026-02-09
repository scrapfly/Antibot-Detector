// Akamai Network Request Interceptor
// Captures sensor_data from POST requests to Akamai endpoints

// Guard against re-initialization (use var for service worker reload compatibility)
var akamaiInterceptionListener = akamaiInterceptionListener || null;
var akamaiCaptureStateRef = akamaiCaptureStateRef || null;

// Destructure helpers from BaseInterceptorHelpers (use var to avoid redeclaration errors)
var checkCookies = self.BaseInterceptorHelpers?.checkCookies;
var saveToHistory = self.BaseInterceptorHelpers?.saveToHistory;
var showNotification = self.BaseInterceptorHelpers?.showNotification;

/**
 * Initialize Akamai interceptor with capture state reference
 * @param {Map} captureState - Map to store capture state per tab
 */
function akamaiInitializeInterceptor(captureState) {
    if (akamaiCaptureStateRef) {
        Logger.network('[AKAMAI-CAPTURE] Interceptor already initialized, skipping');
        return;
    }
    akamaiCaptureStateRef = captureState;
    Logger.network('[AKAMAI-CAPTURE] Interceptor initialized with captureState');
}

/**
 * Start capturing Akamai sensor data for a specific tab
 * @param {number} tabId - Tab ID to capture for
 * @param {string} captureUrl - Current URL of the tab
 * @returns {object} Status object
 */
function akamaiStartCapture(tabId, captureUrl) {
    Logger.network('[AKAMAI-CAPTURE] ========== START CAPTURE ==========');
    Logger.network('[AKAMAI-CAPTURE] Tab ID:', tabId);
    Logger.network('[AKAMAI-CAPTURE] Capture URL:', captureUrl);
    Logger.network('[AKAMAI-CAPTURE] Started at:', new Date().toISOString());
    Logger.network('[AKAMAI-CAPTURE] Auto-stop in: 60 seconds');
    Logger.network('[AKAMAI-CAPTURE] Listening for: POST requests to Akamai endpoints');
    Logger.network('[AKAMAI-CAPTURE] Waiting for page reload before capturing');
    Logger.network('[AKAMAI-CAPTURE] ========================================');

    if (!akamaiInterceptionListener) {
        setupAkamaiInterceptor();
    }

    akamaiCaptureStateRef.set(tabId, {
        tabId: tabId,
        sensorData: null,
        endpoint: null,
        timestamp: Date.now(),
        timeout: null,
        waitingForReload: true,  // Flag to indicate we're waiting for a reload
        captureUrl: captureUrl,  // Store the URL to detect navigation
        startTime: Date.now(),  // Track when capture started
        // URL monitoring for SBSD and SEC_CPT
        urlsMonitored: [],
        sbsdUrls: [],
        secCptUrls: [],
        requiresSbsd: false,
        requiresSecCpt: false
    });

    // Auto-stop after 60 seconds
    const state = akamaiCaptureStateRef.get(tabId);
    state.timeout = setTimeout(() => {
        Logger.network(`[Akamai Debug] Auto-stopping capture for tab ${tabId} (60s timeout reached)`);
        akamaiStopCapture(tabId);
    }, 60000);

    // Show standardized in-page notification
    if (showNotification) {
        showNotification(tabId, {
            type: 'capture',
            title: 'Akamai Capture Active',
            message: 'Reload the page to capture sensor data and request details',
            duration: 60000
        }).catch(err => {
            Logger.error('NETWORK', '[AKAMAI-CAPTURE] Failed to show notification:', err);
        });
    }

    return { status: 'started' };
}

/**
 * Stop capturing for a specific tab
 * @param {number} tabId - Tab ID to stop capture for
 * @returns {object} Status and results
 */
function akamaiStopCapture(tabId) {
    Logger.network('[AKAMAI-CAPTURE] ========== STOP CAPTURE ==========');
    Logger.network('[AKAMAI-CAPTURE] Tab ID:', tabId);

    const state = akamaiCaptureStateRef.get(tabId);
    if (state) {
        Logger.network('[AKAMAI-CAPTURE] Capture Results:');
        Logger.network('[AKAMAI-CAPTURE]   sensor_data captured:', !!state.sensorData);
        Logger.network('[AKAMAI-CAPTURE]   endpoint:', state.endpoint || 'NONE');
        Logger.network('[AKAMAI-CAPTURE]   duration:', ((Date.now() - state.timestamp) / 1000).toFixed(2) + 's');

        if (state.timeout) {
            clearTimeout(state.timeout);
        }
        akamaiCaptureStateRef.delete(tabId);
    } else {
        Logger.network('[AKAMAI-CAPTURE] No capture state found for tab');
    }

    // If no more active captures, remove listener
    if (akamaiCaptureStateRef.size === 0 && akamaiInterceptionListener) {
        chrome.webRequest.onBeforeRequest.removeListener(akamaiInterceptionListener);
        akamaiInterceptionListener = null;
        Logger.network('[AKAMAI-CAPTURE] Removed request interceptor (no active captures)');
    }

    Logger.network('[AKAMAI-CAPTURE] ========================================');

    return { status: 'stopped', results: state };
}

/**
 * Get capture state for a tab
 * @param {number} tabId - Tab ID
 * @returns {object} Capture state
 */
function akamaiGetCaptureState(tabId) {
    // Check if interceptor is initialized
    if (!akamaiCaptureStateRef) {
        Logger.network('[AKAMAI-CAPTURE] CaptureStateRef is null, returning default state');
        return {
            isCapturing: false,
            state: null
        };
    }

    // Check if it's a valid Map
    if (typeof akamaiCaptureStateRef.get !== 'function') {
        Logger.error('NETWORK', '[Akamai] CaptureStateRef is not a Map:', typeof akamaiCaptureStateRef);
        return {
            isCapturing: false,
            state: null
        };
    }

    const state = akamaiCaptureStateRef.get(tabId);
    return {
        isCapturing: !!state,
        state: state || null
    };
}


/**
 * Handle tab updates during active Akamai capture
 * Monitors URL changes and page reload completion
 * @param {number} tabId - Tab ID
 * @param {object} changeInfo - Change information from chrome.tabs.onUpdated
 * @param {object} tab - Tab information
 */
function akamaiHandleCaptureTabUpdate(tabId, changeInfo, tab) {
    // Check if captureStateRef is initialized first
    if (!akamaiCaptureStateRef) return;

    const state = akamaiCaptureStateRef.get(tabId);
    if (!state) return;

    // If URL changed (user navigated away), clear capture state
    if (changeInfo.url && state.captureUrl && changeInfo.url !== state.captureUrl) {
        Logger.network('[AKAMAI-CAPTURE] URL changed, clearing capture state for tab:', tabId);
        if (state.timeout) {
            clearTimeout(state.timeout);
        }
        akamaiCaptureStateRef.delete(tabId);

        // If no more active captures, remove listener
        if (akamaiCaptureStateRef.size === 0 && akamaiInterceptionListener) {
            chrome.webRequest.onBeforeRequest.removeListener(akamaiInterceptionListener);
            akamaiInterceptionListener = null;
            Logger.network('[AKAMAI-CAPTURE] Removed request interceptor (no active captures');
        }
        return;
    }

    // When page finishes loading after reload, mark as ready to capture
    if (changeInfo.status === 'complete' && state.waitingForReload) {
        Logger.network('[AKAMAI-CAPTURE] Page reload detected! Ready to capture sensor_data');
        state.waitingForReload = false;
        state.reloadDetectedAt = Date.now();
        akamaiCaptureStateRef.set(tabId, state);
    }
}

/**
 * Handle Akamai capture completion
 * This function is called directly instead of sending a message
 * because the interceptor runs in the background script context
 */
async function handleAkamaiCaptureCompleted(tabId, interceptorData) {
    Logger.network('[AKAMAI-CAPTURE] ========== HANDLING CAPTURE COMPLETION ==========');

    try {
        // The actual processing will be done by the code below that we'll extract from background.js
        // For now, we'll directly execute the same logic that was in the AKAMAI_CAPTURE_COMPLETED handler

        // Get tab info
        Logger.network('[AKAMAI-CAPTURE] Step 1: Getting tab info...');
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            Logger.error('NETWORK', '[AKAMAI-CAPTURE] Tab not found or no URL');
            return;
        }
        Logger.network('[AKAMAI-CAPTURE] Tab info retrieved:', { url: tab.url, title: tab.title });

        // Get cookies using helper
        Logger.network('[AKAMAI-CAPTURE] Step 2: Getting cookies for URL:', tab.url);
        const cookies = await checkCookies(tab.url, [
            { name: { pattern: '_abck' }, returnValue: true },
            { name: { pattern: 'sbsd' }, returnValue: true },
            { name: { pattern: 'sbsd_o' }, returnValue: true }
        ]);
        Logger.network('[AKAMAI-CAPTURE] Total cookies found:', cookies.length);

        const abckCookie = cookies.find(c => c.name === '_abck');
        const sbsdCookie = cookies.find(c => c.name === 'sbsd');
        const sbsdOCookie = cookies.find(c => c.name === 'sbsd_o');

        Logger.network('[AKAMAI-CAPTURE] Cookie status:', {
            hasAbck: !!abckCookie,
            abckLength: abckCookie?.value?.length || 0,
            hasSbsd: !!sbsdCookie,
            hasSbsdO: !!sbsdOCookie
        });

        // Create capture data with URL monitoring results
        Logger.network('[AKAMAI-CAPTURE] Step 3: Creating capture data object...');
        const captureData = {
            type: 'akamai',
            // ABCK info - just true/false and level, NO cookie values
            abckCookie: !!abckCookie,
            abckCookieLevel: abckCookie ? (abckCookie.value.includes('~0~') ? 'easy' : 'standard') : null,
            // Akamai version if detected
            akamaiVersion: interceptorData.akamaiVersion || null,
            // Challenge requirements from URL monitoring
            requiresSbsd: interceptorData.requiresSbsd || !!(sbsdCookie || sbsdOCookie),
            requiresSecCpt: interceptorData.requiresSecCpt || false,
            // Basic site info
            siteUrl: tab.url,
            // Store timestamp for "captured X ago" display
            timestamp: Date.now()
            // NO sensor_data, NO cookie values, NO URLs stored
        };
        Logger.network('[AKAMAI-CAPTURE] Capture data created successfully');
        Logger.network('[AKAMAI-CAPTURE] URL Monitoring Results:', {
            requiresSbsd: captureData.requiresSbsd,
            requiresSecCpt: captureData.requiresSecCpt
        });

        // Save to history using helper
        Logger.network('[AKAMAI-CAPTURE] Step 4-6: Saving to history...');
        await saveToHistory(tabId, captureData, { type: 'akamai' });
        Logger.network('[AKAMAI-CAPTURE] Successfully saved capture to history');

        // Clean up capture state
        Logger.network('[AKAMAI-CAPTURE] Step 7: Cleaning up capture state for tab:', tabId);
        if (akamaiCaptureStateRef && akamaiCaptureStateRef.has(tabId)) {
            const state = akamaiCaptureStateRef.get(tabId);
            if (state && state.timeout) {
                clearTimeout(state.timeout);
            }
            akamaiCaptureStateRef.delete(tabId);
            Logger.network('[AKAMAI-CAPTURE] Capture state cleared');
        }

        // If no more active captures, remove listener
        if (akamaiCaptureStateRef && akamaiCaptureStateRef.size === 0 && akamaiInterceptionListener) {
            chrome.webRequest.onBeforeRequest.removeListener(akamaiInterceptionListener);
            akamaiInterceptionListener = null;
            Logger.network('[AKAMAI-CAPTURE] All captures stopped - listener removed');
        }

        // Notify popup to update UI with captured data (if open)
        Logger.network('[AKAMAI-CAPTURE] Step 8: Notifying popup (if open)...');
        chrome.runtime.sendMessage({
            type: 'AKAMAI_CAPTURE_COMPLETED',
            captureData: {
                type: 'akamai',
                captureData: captureData,
                timestamp: Date.now()
            }
        }).catch((err) => {
            Logger.network('[AKAMAI-CAPTURE] Popup not open, message not sent (this is normal)');
        });

        // Show success notification using helper
        Logger.network('[AKAMAI-CAPTURE] Step 10: Showing success notification in page...');
        if (showNotification) {
            await showNotification(tabId, {
                type: 'success',
                title: 'Capture Completed',
                message: 'Akamai sensor_data captured successfully',
                duration: 5000
            }).catch(err => {
                Logger.error('NETWORK', '[AKAMAI-CAPTURE] Failed to show notification:', err);
            });
        }

        Logger.network('[AKAMAI-CAPTURE] ========== CAPTURE COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        Logger.error('NETWORK', '[AKAMAI-CAPTURE] Error handling capture completion:', error);
        Logger.error('NETWORK', '[AKAMAI-CAPTURE] Error stack:', error.stack);

        // Clean up on error
        if (akamaiCaptureStateRef && akamaiCaptureStateRef.has(tabId)) {
            akamaiCaptureStateRef.delete(tabId);
        }
    }
}

/**
 * Start extraction mode for capturing full sensor data
 * @param {number} tabId - Tab ID to extract for
 * @returns {Promise<object>} Status object
 */
async function akamaiStartExtraction(tabId) {
    Logger.network('[AKAMAI-EXTRACT] ========== EXTRACT SENSOR START ==========');
    try {
        Logger.network('[AKAMAI-EXTRACT] Tab ID:', tabId);

        // Get current tab URL
        Logger.network('[AKAMAI-EXTRACT] Step 1: Getting tab info...');
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            Logger.error('NETWORK', '[AKAMAI-EXTRACT] Unable to get tab URL');
            throw new Error('Unable to get tab URL');
        }
        Logger.network('[AKAMAI-EXTRACT] Tab info:', { id: tab.id, url: tab.url });

        // Delete _abck cookies for the current site
        Logger.network('[AKAMAI-EXTRACT] Step 2: Getting cookies for:', tab.url);
        const cookies = await chrome.cookies.getAll({ url: tab.url, name: '_abck' });
        Logger.network('[AKAMAI-EXTRACT] Found', cookies.length, '_abck cookies');

        for (const cookie of cookies) {
            await chrome.cookies.remove({
                url: tab.url,
                name: cookie.name
            });
            Logger.network('[AKAMAI-EXTRACT] Deleted cookie:', cookie.name);
        }
        Logger.network('[AKAMAI-EXTRACT] All _abck cookies deleted');

        // Enable extraction mode in interceptor
        Logger.network('[AKAMAI-EXTRACT] Step 3: Enabling extraction mode...');

        // First, ensure the interceptor is set up
        if (!akamaiInterceptionListener) {
            Logger.network('[AKAMAI-EXTRACT] Setting up Akamai interceptor...');
            setupAkamaiInterceptor();
        }

        // Set up extraction mode in the capture state
        if (!akamaiCaptureStateRef) {
            Logger.error('NETWORK', '[AKAMAI-EXTRACT] akamaiCaptureStateRef is not available!');
            throw new Error('Capture state not initialized');
        }

        Logger.network('[AKAMAI-EXTRACT] Setting extraction mode in capture state...');
        akamaiCaptureStateRef.set(tabId, {
            active: true,
            extractMode: true,
            startTime: Date.now(),
            tabUrl: tab.url,
            results: null,
            waitingForReload: false,  // Don't wait for reload in extraction mode
            extractedData: null,
            timeout: setTimeout(() => {
                // Auto-stop after 30 seconds
                const state = akamaiCaptureStateRef.get(tabId);
                if (state && state.extractMode) {
                    akamaiCaptureStateRef.delete(tabId);
                    Logger.network('[AKAMAI-EXTRACT] Auto-stopped after 30s timeout');
                }
            }, 30000)
        });
        Logger.network('[AKAMAI-EXTRACT] Extraction mode enabled for tab:', tabId);

        // Reload the page
        Logger.network('[AKAMAI-EXTRACT] Step 4: Reloading page...');
        await chrome.tabs.reload(tabId);
        Logger.network('[AKAMAI-EXTRACT] Page reload initiated');

        // Show analyzing notification while waiting for sensor data
        try {
            if (typeof showNotification === 'function') {
                Logger.network('[AKAMAI-EXTRACT] Showing analyzing notification...');
                await showNotification(tabId, {
                    type: 'loading',
                    title: 'Extracting Akamai Sensor Data',
                    message: 'Waiting for sensor information to be captured...',
                    duration: 30000 // Longer duration since extraction can take time
                });
                Logger.network('[AKAMAI-EXTRACT] Notification shown successfully');
            } else {
                Logger.network('[AKAMAI-EXTRACT] showNotification function not available');
            }
        } catch (error) {
            Logger.error('NETWORK', '[AKAMAI-EXTRACT] Error showing notification:', error);
        }

        Logger.network('[AKAMAI-EXTRACT] ========== WAITING FOR SENSOR DATA ==========');

        return { status: 'started' };
    } catch (error) {
        Logger.error('NETWORK', '[AKAMAI-EXTRACT] Error:', error);
        Logger.error('NETWORK', '[AKAMAI-EXTRACT] Stack:', error.stack);
        throw error;
    }
}

/**
 * Handle extraction completion
 * @param {number} tabId - Tab ID
 * @param {object} extractedData - Extracted sensor data
 */
async function akamaiHandleExtractionCompleted(tabId, extractedData) {
    Logger.network('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETED ==========');
    try {
        Logger.network('[AKAMAI-EXTRACT] Tab ID:', tabId);
        Logger.network('[AKAMAI-EXTRACT] Extracted data:', {
            hasSensorData: !!extractedData?.sensorData,
            hasSbsdData: !!extractedData?.sbsdData,
            hasSecData: !!extractedData?.secData,
            scriptUrl: extractedData?.scriptUrl,
            endpointsCount: extractedData?.endpoints?.length || 0
        });

        // Stop capture
        Logger.network('[AKAMAI-EXTRACT] Step 1: Stopping capture state...');
        if (akamaiCaptureStateRef) {
            const state = akamaiCaptureStateRef.get(tabId);
            Logger.network('[AKAMAI-EXTRACT] Current state:', state);
            if (state && state.timeout) {
                clearTimeout(state.timeout);
                Logger.network('[AKAMAI-EXTRACT] Timeout cleared');
            }
            akamaiCaptureStateRef.delete(tabId);
            Logger.network('[AKAMAI-EXTRACT] State deleted for tab:', tabId);
        }

        // Send data to popup
        Logger.network('[AKAMAI-EXTRACT] Step 2: Sending data to popup...');
        try {
            await chrome.runtime.sendMessage({
                type: 'AKAMAI_EXTRACTION_READY',
                tabId: tabId,
                extractedData: extractedData
            });
            Logger.network('[AKAMAI-EXTRACT] Data sent to popup');
        } catch (err) {
            Logger.network('[AKAMAI-EXTRACT] Popup not open (this is normal):', err.message);
        }

        Logger.network('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        Logger.error('NETWORK', '[AKAMAI-EXTRACT] Error handling extraction completion:', error);
        Logger.error('NETWORK', '[AKAMAI-EXTRACT] Error stack:', error.stack);

        // Clean up on error
        if (akamaiCaptureStateRef && akamaiCaptureStateRef.has(tabId)) {
            akamaiCaptureStateRef.delete(tabId);
        }
    }
}

/**
 * Setup network request interceptor for Akamai endpoints
 */
function setupAkamaiInterceptor() {
    Logger.network('[AKAMAI-CAPTURE] Setting up request interceptor');

    akamaiInterceptionListener = (details) => {
        // Check if this tab is being captured
        const state = akamaiCaptureStateRef.get(details.tabId);
        if (!state) return;

        // Log all requests in extraction mode for debugging
        if (state.extractMode) {
            Logger.network('[AKAMAI-INTERCEPT-EXTRACT] Request in extraction mode:', {
                tabId: details.tabId,
                method: details.method,
                type: details.type,
                url: details.url.substring(0, 100),
                hasBody: !!details.requestBody
            });
        }

        // If we're waiting for reload in normal mode, don't monitor yet
        if (!state.extractMode && state.waitingForReload) {
            Logger.network('[AKAMAI-INTERCEPT] Ignoring request - waiting for page reload');
            return;
        }

        const url = details.url.toLowerCase();
        const originalUrl = details.url; // Keep original for storage

        // In extraction mode, process immediately without URL monitoring
        if (state.extractMode) {
            Logger.network('[AKAMAI-INTERCEPT-EXTRACT] Processing in extraction mode...');

            // Initialize extraction data if not exists
            if (!state.extractedData) {
                state.extractedData = {
                    sensorData: null,
                    sbsdData: null,
                    secData: null,
                    sensorScriptUrl: null,
                    sbsdScriptUrl: null,
                    endpoints: new Set() // Use Set to avoid duplicates
                };
            }

            // Track unique endpoints
            state.extractedData.endpoints.add(originalUrl);

            // Check for SBSD endpoint
            if (url.includes('.well-known/sbsd')) {
                Logger.network('[AKAMAI-INTERCEPT-EXTRACT] SBSD endpoint detected');
                state.extractedData.sbsdScriptUrl = originalUrl;
                // We'll capture the SBSD data below
            }

            // Only process POST requests with body
            if (details.method !== 'POST') {
                Logger.network('[AKAMAI-INTERCEPT-EXTRACT] Skipping non-POST request');
                return;
            }

            if (!details.requestBody) {
                Logger.network('[AKAMAI-INTERCEPT-EXTRACT] POST request but no body:', url);
                return;
            }

            // Continue to process the POST request body below
            Logger.network('[AKAMAI-INTERCEPT-EXTRACT] Processing POST request with body');

        } else {
            // Normal capture mode - monitor URLs
            state.urlsMonitored.push(originalUrl);

            // Check for SBSD patterns
            if (url.includes('.well-known/sbsd') || url.includes('/sbsd')) {
                Logger.network('[AKAMAI-CAPTURE] SBSD URL detected:', originalUrl);
                state.requiresSbsd = true;
                state.sbsdUrls.push(originalUrl);
                // Don't stop capture - we need to keep monitoring for sensor_data
            }

            // Check for SEC_CPT patterns
            if (url.includes('/sec_cpt/') || url.includes('cp_challenge') || url.includes('/sec-cpt/')) {
                Logger.network('[AKAMAI-CAPTURE] SEC_CPT URL detected:', originalUrl);
                state.requiresSecCpt = true;
                state.secCptUrls.push(originalUrl);
            }

            // Check if we already have sensor data
            if (state.sensorData) return;

            // Only process POST requests with body
            if (details.method !== 'POST' || !details.requestBody) {
                return;
            }
        }

        Logger.network('[AKAMAI-CAPTURE] Intercepted POST request with body:', url);
        Logger.network('[AKAMAI-CAPTURE] Request details:', {
            method: details.method,
            hasBody: !!details.requestBody,
            bodyType: details.requestBody ? Object.keys(details.requestBody) : null
        });

        try {
            let sensorData = null;
            let rawBody = null;

            Logger.network('[AKAMAI-CAPTURE] Extracting request body...');
            Logger.network('[AKAMAI-CAPTURE] RequestBody structure:', details.requestBody);
            Logger.network('[AKAMAI-CAPTURE] RequestBody keys:', Object.keys(details.requestBody));

            // Check what type of body we have
            if (!details.requestBody) {
                Logger.network('[AKAMAI-CAPTURE] No request body found!');
            } else if (details.requestBody.error) {
                Logger.network('[AKAMAI-CAPTURE] Error in request body:', details.requestBody.error);
            } else if (details.requestBody.raw) {
                Logger.network('[AKAMAI-CAPTURE] Has raw data, length:', details.requestBody.raw?.length);
            } else if (details.requestBody.formData) {
                Logger.network('[AKAMAI-CAPTURE] Has formData');
            }

            // Extract request body
            if (details.requestBody.raw && details.requestBody.raw[0]) {
                // Binary data
                Logger.network('[AKAMAI-CAPTURE] Processing raw body data...');
                Logger.network('[AKAMAI-CAPTURE] Raw bytes available:', details.requestBody.raw[0].bytes?.length || 0);
                const decoder = new TextDecoder('utf-8');
                rawBody = decoder.decode(details.requestBody.raw[0].bytes);
                Logger.network('[AKAMAI-CAPTURE] Decoded raw body length:', rawBody.length);
                Logger.network('[AKAMAI-CAPTURE] Raw body (first 500 chars):', rawBody.substring(0, 500));
                Logger.network('[AKAMAI-CAPTURE] Raw body (last 100 chars):', rawBody.substring(rawBody.length - 100));

                // Check if this raw body is sensor_data directly (starts with pattern like "3;0;1;0;")
                if (/^\d+;\d+;\d+;\d+;\d+/.test(rawBody)) {
                    Logger.network('[AKAMAI-CAPTURE] Raw body appears to be sensor_data directly!');
                    sensorData = rawBody;
                }
            } else if (details.requestBody.formData) {
                // Form data
                Logger.network('[AKAMAI-CAPTURE] Processing form data...');
                const formData = details.requestBody.formData;
                Logger.network('[AKAMAI-CAPTURE] Form data keys:', Object.keys(formData));
                if (formData.sensor_data) {
                    Logger.network('[AKAMAI-CAPTURE] Found sensor_data in form data!');
                    sensorData = formData.sensor_data[0];
                }
                rawBody = JSON.stringify(formData);
            } else {
                Logger.network('[AKAMAI-CAPTURE] Unknown request body format');
            }

            // Try to parse sensor_data from raw body
            if (!sensorData && rawBody) {
                // Try JSON
                try {
                    const json = JSON.parse(rawBody);
                    if (json.sensor_data) {
                        sensorData = json.sensor_data;
                    }
                } catch (e) {
                    // Not JSON, try URL encoded
                    const urlParams = new URLSearchParams(rawBody);
                    if (urlParams.has('sensor_data')) {
                        sensorData = urlParams.get('sensor_data');
                    } else {
                        // Try regex match for sensor_data
                        // Akamai sensor_data typically starts with numbers and semicolons like "3;0;1;0;..."
                        const match = rawBody.match(/sensor_data[=:]\s*"?([0-9];[^"]*)"?/);
                        if (match && match[1]) {
                            sensorData = match[1];
                        } else {
                            // Also check if the body itself looks like sensor_data (starts with digit;digit;)
                            if (/^\d+;\d+;\d+;/.test(rawBody)) {
                                Logger.network('[AKAMAI-CAPTURE] Body looks like sensor_data format');
                                sensorData = rawBody;
                            }
                        }
                    }
                }
            }

            // Handle extraction mode for any captured data
            if (state.extractMode && (sensorData || rawBody)) {
                Logger.network('[AKAMAI-EXTRACT] Processing extracted data...');

                // Check if this is SBSD data
                if (url.includes('.well-known/sbsd')) {
                    Logger.network('[AKAMAI-EXTRACT] SBSD data captured!');
                    state.extractedData.sbsdData = rawBody;
                }
                // Check if this is sensor_data
                else if (sensorData) {
                    Logger.network('[AKAMAI-EXTRACT] Sensor data captured!');
                    state.extractedData.sensorData = sensorData;
                    state.extractedData.sensorScriptUrl = originalUrl;

                    // Extract Akamai version from sensor data (first number before semicolon)
                    const versionMatch = sensorData.match(/^(\d+);/);
                    if (versionMatch) {
                        state.extractedData.akamaiVersion = `Akamai V${versionMatch[1]}`;
                        Logger.network('[AKAMAI-EXTRACT] Version detected:', state.extractedData.akamaiVersion);
                    }
                }
                // Check for other Akamai endpoints with data
                else if (rawBody && url.includes('/akam/')) {
                    Logger.network('[AKAMAI-EXTRACT] Other Akamai data captured from:', originalUrl);
                    // Store as sensor data if we don't have it yet
                    if (!state.extractedData.sensorData && rawBody.includes('sensor_data')) {
                        // Try to extract sensor_data from the body
                        const match = rawBody.match(/"sensor_data":"([^"]+)"/);
                        if (match) {
                            state.extractedData.sensorData = match[1];
                            state.extractedData.sensorScriptUrl = originalUrl;
                            Logger.network('[AKAMAI-EXTRACT] Extracted sensor_data from JSON!');

                            // Extract Akamai version
                            const versionMatch = match[1].match(/^(\d+);/);
                            if (versionMatch) {
                                state.extractedData.akamaiVersion = `Akamai V${versionMatch[1]}`;
                                Logger.network('[AKAMAI-EXTRACT] Version detected:', state.extractedData.akamaiVersion);
                            }
                        }
                    }
                }

                // Update state
                akamaiCaptureStateRef.set(details.tabId, state);

                // Check if we have enough data to complete extraction
                if (state.extractedData.sensorData) {
                    Logger.network('[AKAMAI-EXTRACT] Have sensor_data, completing extraction...');

                    // Since we're in background context, handle the extraction directly
                    Logger.network('[AKAMAI-EXTRACT] Handling extraction completion directly...');

                    // Convert Set to Array for endpoints
                    const extractedDataToSend = {
                        ...state.extractedData,
                        endpoints: Array.from(state.extractedData.endpoints || [])
                    };

                    // Send data to popup via runtime message from background context
                    chrome.runtime.sendMessage({
                        type: 'AKAMAI_EXTRACTION_RESULT',
                        extractedData: extractedDataToSend
                    }).then(() => {
                        Logger.network('[AKAMAI-EXTRACT] ✓ Extraction data sent to popup successfully');
                    }).catch((err) => {
                        Logger.network('[AKAMAI-EXTRACT] Popup not open (this is normal):', err.message);
                    });

                    // Clear the capture state
                    akamaiCaptureStateRef.delete(details.tabId);
                    Logger.network('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETE ==========');
                }
                return;
            }

            // Normal capture mode handling
            if (sensorData && !state.extractMode) {
                Logger.network('[AKAMAI-CAPTURE] ========== SENSOR DATA CAPTURED ==========');
                Logger.network('[AKAMAI-CAPTURE] Tab ID:', details.tabId);
                Logger.network('[AKAMAI-CAPTURE] Endpoint:', url);
                Logger.network('[AKAMAI-CAPTURE] sensor_data:', sensorData.substring(0, 100) + '...');
                Logger.network('[AKAMAI-CAPTURE] sensor_data length:', sensorData.length);
                Logger.network('[AKAMAI-CAPTURE] Timestamp:', new Date().toISOString());
                Logger.network('[AKAMAI-CAPTURE] ========================================');

                state.sensorData = sensorData;
                state.endpoint = url;
                state.timestamp = Date.now();

                // Extract Akamai version from sensor data (first number before semicolon)
                let akamaiVersion = null;
                const versionMatch = sensorData.match(/^(\d+);/);
                if (versionMatch) {
                    akamaiVersion = `Akamai V${versionMatch[1]}`;
                    Logger.network('[AKAMAI-CAPTURE] Version detected:', akamaiVersion);
                }
                state.akamaiVersion = akamaiVersion;

                // Auto-stop capture after getting sensor data
                Logger.network('[AKAMAI-CAPTURE] Auto-stopping capture (data captured)');
                if (state.timeout) {
                    clearTimeout(state.timeout);
                }

                // Normal capture mode - process as usual
                Logger.network('[AKAMAI-CAPTURE] Processing capture completion directly...');

                // Call the handler directly
                handleAkamaiCaptureCompleted(details.tabId, {
                    sensorData: sensorData,
                    endpoint: url,
                    timestamp: state.timestamp,
                    akamaiVersion: state.akamaiVersion || null,
                    // Include URL monitoring results
                    requiresSbsd: state.requiresSbsd || false,
                    requiresSecCpt: state.requiresSecCpt || false,
                    sbsdUrls: state.sbsdUrls || [],
                    secCptUrls: state.secCptUrls || [],
                    urlsMonitored: state.urlsMonitored || []
                });
            } else if (rawBody) {
                Logger.network('[AKAMAI-CAPTURE] POST request intercepted but no sensor_data found');
                Logger.network('[AKAMAI-CAPTURE] Endpoint:', url);
                Logger.network('[AKAMAI-CAPTURE] Body preview:', rawBody.substring(0, 200));
            }
        } catch (error) {
            Logger.error('NETWORK', '[AKAMAI-CAPTURE] Error processing request:', error);
            Logger.error('NETWORK', '[AKAMAI-CAPTURE] Error stack:', error.stack);
            Logger.error('NETWORK', '[AKAMAI-CAPTURE] Error details:', {
                message: error.message,
                url: details.url,
                method: details.method,
                hasBody: !!details.requestBody
            });
        }
    };

    // Register listener for POST requests to Akamai endpoints
    chrome.webRequest.onBeforeRequest.addListener(
        akamaiInterceptionListener,
        {
            urls: ["<all_urls>"],
            types: ["xmlhttprequest", "other"]
        },
        ["requestBody"]
    );

    Logger.network('[AKAMAI-CAPTURE] Request interceptor ready');
}

/**
 * Centralized message handler for all Akamai-related messages
 * @param {object} request - Message request object
 * @param {function} sendResponse - Response callback
 * @returns {boolean} True if async response
 */
function akamaiHandleMessage(request, sendResponse) {
    switch (request.type) {
        case 'AKAMAI_START_CAPTURE':
            // Handle async operation without making the whole function async
            (async () => {
                try {
                    // Ensure interceptor is initialized (lazy initialization)
                    if (typeof akamaiInitializeInterceptor === 'function' && akamaiCaptureState) {
                        akamaiInitializeInterceptor(akamaiCaptureState);
                    }

                    if (!akamaiCaptureState) {
                        throw new Error('Akamai capture state not initialized');
                    }

                    // Get current tab URL
                    const tab = await chrome.tabs.get(request.tabId);
                    if (!tab || !tab.url) {
                        throw new Error('Unable to get tab URL');
                    }

                    const result = akamaiStartCapture(request.tabId, tab.url);
                    sendResponse(result);
                } catch (error) {
                    Logger.error('NETWORK', '[Akamai] Error starting capture:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'AKAMAI_STOP_CAPTURE':
            try {
                const result = akamaiStopCapture(request.tabId);
                sendResponse(result);
            } catch (error) {
                Logger.error('NETWORK', '[Akamai] Error stopping capture:', error);
                sendResponse({ status: 'error', error: error.message });
            }
            return false; // Sync response (no async needed)

        case 'AKAMAI_GET_CAPTURE_STATE':
            try {
                // Ensure interceptor is initialized
                if (typeof akamaiInitializeInterceptor === 'function' && akamaiCaptureState) {
                    akamaiInitializeInterceptor(akamaiCaptureState);
                }

                const state = akamaiGetCaptureState(request.tabId);
                sendResponse(state);
            } catch (error) {
                Logger.error('NETWORK', '[Akamai] Error getting capture state:', error);
                sendResponse({ status: 'error', error: error.message });
            }
            return false; // Sync response

        case 'AKAMAI_CAPTURE_COMPLETED':
            // NOTE: Capture processing is now handled directly in AkamaiInterceptor.js
            // This message is only for notifying the popup UI to refresh
            // The actual data processing and storage happens in handleAkamaiCaptureCompleted()
            Logger.network('[AKAMAI-CAPTURE] Capture completed message received (UI notification only)');
            return false; // Sync response

        case 'AKAMAI_EXTRACT_SENSOR':
            // Handle async operation without making the whole function async
            akamaiStartExtraction(request.tabId)
                .then(() => {
                    sendResponse({
                        status: 'success',
                        message: 'Extraction mode enabled. Page will reload.'
                    });
                })
                .catch(error => {
                    Logger.error('NETWORK', '[AKAMAI-EXTRACT] Error starting extraction:', error);
                    sendResponse({ status: 'error', error: error.message });
                });
            return true; // Async response

        case 'AKAMAI_EXTRACTION_COMPLETED':
            // Handle async operation without making the whole function async
            (async () => {
                try {
                    const { tabId, extractedData } = request;
                    await akamaiHandleExtractionCompleted(tabId, extractedData);
                    sendResponse({ status: 'success' });
                } catch (error) {
                    Logger.error('NETWORK', '[AKAMAI-EXTRACT] Error handling extraction completion', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'AKAMAI_SHOW_ANALYZING_NOTIFICATION':
            // Show analyzing notification for content analysis
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        Logger.network('[AKAMAI] Showing analyzing notification...');
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: 'Analyzing Akamai Content',
                            message: 'Scanning page for scripts and patterns...',
                            duration: 10000
                        });
                        Logger.network('[AKAMAI] Notification shown successfully');
                    } else {
                        Logger.network('[AKAMAI] showNotification function not available');
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    Logger.error('NETWORK', '[AKAMAI] Error showing notification:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'AKAMAI_SHOW_EXTRACTING_NOTIFICATION':
            // Show extracting notification for sensor extraction
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        Logger.network('[AKAMAI] Showing extracting sensor notification...');
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: 'Extracting Sensor Data',
                            message: 'Capturing Akamai sensor information...',
                            duration: 15000 // Longer duration to persist through reload
                        });
                        Logger.network('[AKAMAI] Notification shown successfully');
                    } else {
                        Logger.network('[AKAMAI] showNotification function not available');
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    Logger.error('NETWORK', '[AKAMAI] Error showing notification:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        default:
            return false; // Not handled by this module
    }
}