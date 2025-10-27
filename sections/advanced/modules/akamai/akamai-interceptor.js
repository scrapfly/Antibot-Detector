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
        console.log('[AKAMAI-CAPTURE] Interceptor already initialized, skipping');
        return;
    }
    akamaiCaptureStateRef = captureState;
    console.log('[AKAMAI-CAPTURE] Interceptor initialized with captureState');
}

/**
 * Start capturing Akamai sensor data for a specific tab
 * @param {number} tabId - Tab ID to capture for
 * @param {string} captureUrl - Current URL of the tab
 * @returns {object} Status object
 */
function akamaiStartCapture(tabId, captureUrl) {
    console.log('[AKAMAI-CAPTURE] ========== START CAPTURE ==========');
    console.log('[AKAMAI-CAPTURE] 🎯 Tab ID:', tabId);
    console.log('[AKAMAI-CAPTURE] 📍 Capture URL:', captureUrl);
    console.log('[AKAMAI-CAPTURE] ⏱️ Started at:', new Date().toISOString());
    console.log('[AKAMAI-CAPTURE] ⏰ Auto-stop in: 60 seconds');
    console.log('[AKAMAI-CAPTURE] 🎧 Listening for: POST requests to Akamai endpoints');
    console.log('[AKAMAI-CAPTURE] ⚠️ Waiting for page reload before capturing');
    console.log('[AKAMAI-CAPTURE] ========================================');

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
        console.log(`[Akamai Debug] ⏰ Auto-stopping capture for tab ${tabId} (60s timeout reached)`);
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
            console.error('[AKAMAI-CAPTURE] Failed to show notification:', err);
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
    console.log('[AKAMAI-CAPTURE] ========== STOP CAPTURE ==========');
    console.log('[AKAMAI-CAPTURE] 🎯 Tab ID:', tabId);

    const state = akamaiCaptureStateRef.get(tabId);
    if (state) {
        console.log('[AKAMAI-CAPTURE] 📊 Capture Results:');
        console.log('[AKAMAI-CAPTURE]   sensor_data captured:', !!state.sensorData);
        console.log('[AKAMAI-CAPTURE]   endpoint:', state.endpoint || 'NONE');
        console.log('[AKAMAI-CAPTURE]   duration:', ((Date.now() - state.timestamp) / 1000).toFixed(2) + 's');

        if (state.timeout) {
            clearTimeout(state.timeout);
        }
        akamaiCaptureStateRef.delete(tabId);
    } else {
        console.log('[AKAMAI-CAPTURE] ⚠️ No capture state found for tab');
    }

    // If no more active captures, remove listener
    if (akamaiCaptureStateRef.size === 0 && akamaiInterceptionListener) {
        chrome.webRequest.onBeforeRequest.removeListener(akamaiInterceptionListener);
        akamaiInterceptionListener = null;
        console.log('[AKAMAI-CAPTURE] 🔌 Removed request interceptor (no active captures)');
    }

    console.log('[AKAMAI-CAPTURE] ========================================');

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
        console.log('[AKAMAI-CAPTURE] CaptureStateRef is null, returning default state');
        return {
            isCapturing: false,
            state: null
        };
    }

    // Check if it's a valid Map
    if (typeof akamaiCaptureStateRef.get !== 'function') {
        console.error('[Akamai] CaptureStateRef is not a Map:', typeof akamaiCaptureStateRef);
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
        console.log('[AKAMAI-CAPTURE] URL changed, clearing capture state for tab:', tabId);
        if (state.timeout) {
            clearTimeout(state.timeout);
        }
        akamaiCaptureStateRef.delete(tabId);

        // If no more active captures, remove listener
        if (akamaiCaptureStateRef.size === 0 && akamaiInterceptionListener) {
            chrome.webRequest.onBeforeRequest.removeListener(akamaiInterceptionListener);
            akamaiInterceptionListener = null;
            console.log('[AKAMAI-CAPTURE] Removed request interceptor (no active captures');
        }
        return;
    }

    // When page finishes loading after reload, mark as ready to capture
    if (changeInfo.status === 'complete' && state.waitingForReload) {
        console.log('[AKAMAI-CAPTURE] Page reload detected! Ready to capture sensor_data');
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
    console.log('[AKAMAI-CAPTURE] ========== HANDLING CAPTURE COMPLETION ==========');

    try {
        // The actual processing will be done by the code below that we'll extract from background.js
        // For now, we'll directly execute the same logic that was in the AKAMAI_CAPTURE_COMPLETED handler

        // Get tab info
        console.log('[AKAMAI-CAPTURE] Step 1: Getting tab info...');
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            console.error('[AKAMAI-CAPTURE] ❌ Tab not found or no URL');
            return;
        }
        console.log('[AKAMAI-CAPTURE] ✓ Tab info retrieved:', { url: tab.url, title: tab.title });

        // Get cookies using helper
        console.log('[AKAMAI-CAPTURE] Step 2: Getting cookies for URL:', tab.url);
        const cookies = await checkCookies(tab.url, [
            { name: { pattern: '_abck' }, returnValue: true },
            { name: { pattern: 'sbsd' }, returnValue: true },
            { name: { pattern: 'sbsd_o' }, returnValue: true }
        ]);
        console.log('[AKAMAI-CAPTURE] Total cookies found:', cookies.length);

        const abckCookie = cookies.find(c => c.name === '_abck');
        const sbsdCookie = cookies.find(c => c.name === 'sbsd');
        const sbsdOCookie = cookies.find(c => c.name === 'sbsd_o');

        console.log('[AKAMAI-CAPTURE] Cookie status:', {
            hasAbck: !!abckCookie,
            abckLength: abckCookie?.value?.length || 0,
            hasSbsd: !!sbsdCookie,
            hasSbsdO: !!sbsdOCookie
        });

        // Create capture data with URL monitoring results
        console.log('[AKAMAI-CAPTURE] Step 3: Creating capture data object...');
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
        console.log('[AKAMAI-CAPTURE] ✓ Capture data created successfully');
        console.log('[AKAMAI-CAPTURE] URL Monitoring Results:', {
            requiresSbsd: captureData.requiresSbsd,
            requiresSecCpt: captureData.requiresSecCpt
        });

        // Save to history using helper
        console.log('[AKAMAI-CAPTURE] Step 4-6: Saving to history...');
        await saveToHistory(tabId, captureData, { type: 'akamai' });
        console.log('[AKAMAI-CAPTURE] ✅ Successfully saved capture to history');

        // Clean up capture state
        console.log('[AKAMAI-CAPTURE] Step 7: Cleaning up capture state for tab:', tabId);
        if (akamaiCaptureStateRef && akamaiCaptureStateRef.has(tabId)) {
            const state = akamaiCaptureStateRef.get(tabId);
            if (state && state.timeout) {
                clearTimeout(state.timeout);
            }
            akamaiCaptureStateRef.delete(tabId);
            console.log('[AKAMAI-CAPTURE] ✓ Capture state cleared');
        }

        // If no more active captures, remove listener
        if (akamaiCaptureStateRef && akamaiCaptureStateRef.size === 0 && akamaiInterceptionListener) {
            chrome.webRequest.onBeforeRequest.removeListener(akamaiInterceptionListener);
            akamaiInterceptionListener = null;
            console.log('[AKAMAI-CAPTURE] All captures stopped - listener removed');
        }

        // Notify popup to update UI with captured data (if open)
        console.log('[AKAMAI-CAPTURE] Step 8: Notifying popup (if open)...');
        chrome.runtime.sendMessage({
            type: 'AKAMAI_CAPTURE_COMPLETED',
            captureData: {
                type: 'akamai',
                captureData: captureData,
                timestamp: Date.now()
            }
        }).catch((err) => {
            console.log('[AKAMAI-CAPTURE] ℹ️ Popup not open, message not sent (this is normal)');
        });

        // Show success notification using helper
        console.log('[AKAMAI-CAPTURE] Step 10: Showing success notification in page...');
        if (showNotification) {
            await showNotification(tabId, {
                type: 'success',
                title: '✅ Capture Completed',
                message: 'Akamai sensor_data captured successfully',
                duration: 5000
            }).catch(err => {
                console.error('[AKAMAI-CAPTURE] Failed to show notification:', err);
            });
        }

        console.log('[AKAMAI-CAPTURE] ========== CAPTURE COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        console.error('[AKAMAI-CAPTURE] ❌ Error handling capture completion:', error);
        console.error('[AKAMAI-CAPTURE] Error stack:', error.stack);

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
    console.log('[AKAMAI-EXTRACT] ========== EXTRACT SENSOR START ==========');
    try {
        console.log('[AKAMAI-EXTRACT] Tab ID:', tabId);

        // Get current tab URL
        console.log('[AKAMAI-EXTRACT] Step 1: Getting tab info...');
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            console.error('[AKAMAI-EXTRACT] ❌ Unable to get tab URL');
            throw new Error('Unable to get tab URL');
        }
        console.log('[AKAMAI-EXTRACT] ✓ Tab info:', { id: tab.id, url: tab.url });

        // Delete _abck cookies for the current site
        console.log('[AKAMAI-EXTRACT] Step 2: Getting cookies for:', tab.url);
        const cookies = await chrome.cookies.getAll({ url: tab.url, name: '_abck' });
        console.log('[AKAMAI-EXTRACT] Found', cookies.length, '_abck cookies');

        for (const cookie of cookies) {
            await chrome.cookies.remove({
                url: tab.url,
                name: cookie.name
            });
            console.log('[AKAMAI-EXTRACT] ✓ Deleted cookie:', cookie.name);
        }
        console.log('[AKAMAI-EXTRACT] ✓ All _abck cookies deleted');

        // Enable extraction mode in interceptor
        console.log('[AKAMAI-EXTRACT] Step 3: Enabling extraction mode...');

        // First, ensure the interceptor is set up
        if (!akamaiInterceptionListener) {
            console.log('[AKAMAI-EXTRACT] Setting up Akamai interceptor...');
            setupAkamaiInterceptor();
        }

        // Set up extraction mode in the capture state
        if (!akamaiCaptureStateRef) {
            console.error('[AKAMAI-EXTRACT] ❌ akamaiCaptureStateRef is not available!');
            throw new Error('Capture state not initialized');
        }

        console.log('[AKAMAI-EXTRACT] Setting extraction mode in capture state...');
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
                    console.log('[AKAMAI-EXTRACT] ⏱️ Auto-stopped after 30s timeout');
                }
            }, 30000)
        });
        console.log('[AKAMAI-EXTRACT] ✓ Extraction mode enabled for tab:', tabId);

        // Reload the page
        console.log('[AKAMAI-EXTRACT] Step 4: Reloading page...');
        await chrome.tabs.reload(tabId);
        console.log('[AKAMAI-EXTRACT] ✓ Page reload initiated');

        // Show analyzing notification while waiting for sensor data
        try {
            if (typeof showNotification === 'function') {
                console.log('[AKAMAI-EXTRACT] Showing analyzing notification...');
                await showNotification(tabId, {
                    type: 'loading',
                    title: '🔍 Extracting Akamai Sensor Data',
                    message: 'Waiting for sensor information to be captured...',
                    duration: 30000 // Longer duration since extraction can take time
                });
                console.log('[AKAMAI-EXTRACT] Notification shown successfully');
            } else {
                console.log('[AKAMAI-EXTRACT] showNotification function not available');
            }
        } catch (error) {
            console.error('[AKAMAI-EXTRACT] Error showing notification:', error);
        }

        console.log('[AKAMAI-EXTRACT] ========== WAITING FOR SENSOR DATA ==========');

        return { status: 'started' };
    } catch (error) {
        console.error('[AKAMAI-EXTRACT] ❌ Error:', error);
        console.error('[AKAMAI-EXTRACT] Stack:', error.stack);
        throw error;
    }
}

/**
 * Handle extraction completion
 * @param {number} tabId - Tab ID
 * @param {object} extractedData - Extracted sensor data
 */
async function akamaiHandleExtractionCompleted(tabId, extractedData) {
    console.log('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETED ==========');
    try {
        console.log('[AKAMAI-EXTRACT] Tab ID:', tabId);
        console.log('[AKAMAI-EXTRACT] Extracted data:', {
            hasSensorData: !!extractedData?.sensorData,
            hasSbsdData: !!extractedData?.sbsdData,
            hasSecData: !!extractedData?.secData,
            scriptUrl: extractedData?.scriptUrl,
            endpointsCount: extractedData?.endpoints?.length || 0
        });

        // Stop capture
        console.log('[AKAMAI-EXTRACT] Step 1: Stopping capture state...');
        if (akamaiCaptureStateRef) {
            const state = akamaiCaptureStateRef.get(tabId);
            console.log('[AKAMAI-EXTRACT] Current state:', state);
            if (state && state.timeout) {
                clearTimeout(state.timeout);
                console.log('[AKAMAI-EXTRACT] ✓ Timeout cleared');
            }
            akamaiCaptureStateRef.delete(tabId);
            console.log('[AKAMAI-EXTRACT] ✓ State deleted for tab:', tabId);
        }

        // Send data to popup
        console.log('[AKAMAI-EXTRACT] Step 2: Sending data to popup...');
        try {
            await chrome.runtime.sendMessage({
                type: 'AKAMAI_EXTRACTION_READY',
                tabId: tabId,
                extractedData: extractedData
            });
            console.log('[AKAMAI-EXTRACT] ✓ Data sent to popup');
        } catch (err) {
            console.log('[AKAMAI-EXTRACT] ℹ️ Popup not open (this is normal):', err.message);
        }

        console.log('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        console.error('[AKAMAI-EXTRACT] ❌ Error handling extraction completion:', error);
        console.error('[AKAMAI-EXTRACT] Error stack:', error.stack);

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
    console.log('[AKAMAI-CAPTURE] Setting up request interceptor');

    akamaiInterceptionListener = (details) => {
        // Check if this tab is being captured
        const state = akamaiCaptureStateRef.get(details.tabId);
        if (!state) return;

        // Log all requests in extraction mode for debugging
        if (state.extractMode) {
            console.log('[AKAMAI-INTERCEPT-EXTRACT] 📡 Request in extraction mode:', {
                tabId: details.tabId,
                method: details.method,
                type: details.type,
                url: details.url.substring(0, 100),
                hasBody: !!details.requestBody
            });
        }

        // If we're waiting for reload in normal mode, don't monitor yet
        if (!state.extractMode && state.waitingForReload) {
            console.log('[AKAMAI-INTERCEPT] ⏳ Ignoring request - waiting for page reload');
            return;
        }

        const url = details.url.toLowerCase();
        const originalUrl = details.url; // Keep original for storage

        // In extraction mode, process immediately without URL monitoring
        if (state.extractMode) {
            console.log('[AKAMAI-INTERCEPT-EXTRACT] Processing in extraction mode...');

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
                console.log('[AKAMAI-INTERCEPT-EXTRACT] SBSD endpoint detected');
                state.extractedData.sbsdScriptUrl = originalUrl;
                // We'll capture the SBSD data below
            }

            // Only process POST requests with body
            if (details.method !== 'POST') {
                console.log('[AKAMAI-INTERCEPT-EXTRACT] Skipping non-POST request');
                return;
            }

            if (!details.requestBody) {
                console.log('[AKAMAI-INTERCEPT-EXTRACT] ⚠️ POST request but no body:', url);
                return;
            }

            // Continue to process the POST request body below
            console.log('[AKAMAI-INTERCEPT-EXTRACT] ✅ Processing POST request with body');

        } else {
            // Normal capture mode - monitor URLs
            state.urlsMonitored.push(originalUrl);

            // Check for SBSD patterns
            if (url.includes('.well-known/sbsd') || url.includes('/sbsd')) {
                console.log('[AKAMAI-CAPTURE] 🔍 SBSD URL detected:', originalUrl);
                state.requiresSbsd = true;
                state.sbsdUrls.push(originalUrl);
                // Don't stop capture - we need to keep monitoring for sensor_data
            }

            // Check for SEC_CPT patterns
            if (url.includes('/sec_cpt/') || url.includes('cp_challenge') || url.includes('/sec-cpt/')) {
                console.log('[AKAMAI-CAPTURE] 🔍 SEC_CPT URL detected:', originalUrl);
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

        console.log('[AKAMAI-CAPTURE] 🎯 Intercepted POST request with body:', url);
        console.log('[AKAMAI-CAPTURE] Request details:', {
            method: details.method,
            hasBody: !!details.requestBody,
            bodyType: details.requestBody ? Object.keys(details.requestBody) : null
        });

        try {
            let sensorData = null;
            let rawBody = null;

            console.log('[AKAMAI-CAPTURE] Extracting request body...');
            console.log('[AKAMAI-CAPTURE] RequestBody structure:', details.requestBody);
            console.log('[AKAMAI-CAPTURE] RequestBody keys:', Object.keys(details.requestBody));

            // Check what type of body we have
            if (!details.requestBody) {
                console.log('[AKAMAI-CAPTURE] ❌ No request body found!');
            } else if (details.requestBody.error) {
                console.log('[AKAMAI-CAPTURE] ❌ Error in request body:', details.requestBody.error);
            } else if (details.requestBody.raw) {
                console.log('[AKAMAI-CAPTURE] Has raw data, length:', details.requestBody.raw?.length);
            } else if (details.requestBody.formData) {
                console.log('[AKAMAI-CAPTURE] Has formData');
            }

            // Extract request body
            if (details.requestBody.raw && details.requestBody.raw[0]) {
                // Binary data
                console.log('[AKAMAI-CAPTURE] Processing raw body data...');
                console.log('[AKAMAI-CAPTURE] Raw bytes available:', details.requestBody.raw[0].bytes?.length || 0);
                const decoder = new TextDecoder('utf-8');
                rawBody = decoder.decode(details.requestBody.raw[0].bytes);
                console.log('[AKAMAI-CAPTURE] Decoded raw body length:', rawBody.length);
                console.log('[AKAMAI-CAPTURE] Raw body (first 500 chars):', rawBody.substring(0, 500));
                console.log('[AKAMAI-CAPTURE] Raw body (last 100 chars):', rawBody.substring(rawBody.length - 100));

                // Check if this raw body is sensor_data directly (starts with pattern like "3;0;1;0;")
                if (/^\d+;\d+;\d+;\d+;\d+/.test(rawBody)) {
                    console.log('[AKAMAI-CAPTURE] ✅ Raw body appears to be sensor_data directly!');
                    sensorData = rawBody;
                }
            } else if (details.requestBody.formData) {
                // Form data
                console.log('[AKAMAI-CAPTURE] Processing form data...');
                const formData = details.requestBody.formData;
                console.log('[AKAMAI-CAPTURE] Form data keys:', Object.keys(formData));
                if (formData.sensor_data) {
                    console.log('[AKAMAI-CAPTURE] ✅ Found sensor_data in form data!');
                    sensorData = formData.sensor_data[0];
                }
                rawBody = JSON.stringify(formData);
            } else {
                console.log('[AKAMAI-CAPTURE] ⚠️ Unknown request body format');
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
                                console.log('[AKAMAI-CAPTURE] Body looks like sensor_data format');
                                sensorData = rawBody;
                            }
                        }
                    }
                }
            }

            // Handle extraction mode for any captured data
            if (state.extractMode && (sensorData || rawBody)) {
                console.log('[AKAMAI-EXTRACT] Processing extracted data...');

                // Check if this is SBSD data
                if (url.includes('.well-known/sbsd')) {
                    console.log('[AKAMAI-EXTRACT] 📦 SBSD data captured!');
                    state.extractedData.sbsdData = rawBody;
                }
                // Check if this is sensor_data
                else if (sensorData) {
                    console.log('[AKAMAI-EXTRACT] 📦 Sensor data captured!');
                    state.extractedData.sensorData = sensorData;
                    state.extractedData.sensorScriptUrl = originalUrl;

                    // Extract Akamai version from sensor data (first number before semicolon)
                    const versionMatch = sensorData.match(/^(\d+);/);
                    if (versionMatch) {
                        state.extractedData.akamaiVersion = `Akamai V${versionMatch[1]}`;
                        console.log('[AKAMAI-EXTRACT] Version detected:', state.extractedData.akamaiVersion);
                    }
                }
                // Check for other Akamai endpoints with data
                else if (rawBody && url.includes('/akam/')) {
                    console.log('[AKAMAI-EXTRACT] 📦 Other Akamai data captured from:', originalUrl);
                    // Store as sensor data if we don't have it yet
                    if (!state.extractedData.sensorData && rawBody.includes('sensor_data')) {
                        // Try to extract sensor_data from the body
                        const match = rawBody.match(/"sensor_data":"([^"]+)"/);
                        if (match) {
                            state.extractedData.sensorData = match[1];
                            state.extractedData.sensorScriptUrl = originalUrl;
                            console.log('[AKAMAI-EXTRACT] ✅ Extracted sensor_data from JSON!');

                            // Extract Akamai version
                            const versionMatch = match[1].match(/^(\d+);/);
                            if (versionMatch) {
                                state.extractedData.akamaiVersion = `Akamai V${versionMatch[1]}`;
                                console.log('[AKAMAI-EXTRACT] Version detected:', state.extractedData.akamaiVersion);
                            }
                        }
                    }
                }

                // Update state
                akamaiCaptureStateRef.set(details.tabId, state);

                // Check if we have enough data to complete extraction
                if (state.extractedData.sensorData) {
                    console.log('[AKAMAI-EXTRACT] ✅ Have sensor_data, completing extraction...');

                    // Since we're in background context, handle the extraction directly
                    console.log('[AKAMAI-EXTRACT] Handling extraction completion directly...');

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
                        console.log('[AKAMAI-EXTRACT] ✓ Extraction data sent to popup successfully');
                    }).catch((err) => {
                        console.log('[AKAMAI-EXTRACT] ℹ️ Popup not open (this is normal):', err.message);
                    });

                    // Clear the capture state
                    akamaiCaptureStateRef.delete(details.tabId);
                    console.log('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETE ==========');
                }
                return;
            }

            // Normal capture mode handling
            if (sensorData && !state.extractMode) {
                console.log('[AKAMAI-CAPTURE] ========== SENSOR DATA CAPTURED ==========');
                console.log('[AKAMAI-CAPTURE] 🎯 Tab ID:', details.tabId);
                console.log('[AKAMAI-CAPTURE] 📡 Endpoint:', url);
                console.log('[AKAMAI-CAPTURE] 📦 sensor_data:', sensorData.substring(0, 100) + '...');
                console.log('[AKAMAI-CAPTURE] 📏 sensor_data length:', sensorData.length);
                console.log('[AKAMAI-CAPTURE] ⏱️ Timestamp:', new Date().toISOString());
                console.log('[AKAMAI-CAPTURE] ========================================');

                state.sensorData = sensorData;
                state.endpoint = url;
                state.timestamp = Date.now();

                // Extract Akamai version from sensor data (first number before semicolon)
                let akamaiVersion = null;
                const versionMatch = sensorData.match(/^(\d+);/);
                if (versionMatch) {
                    akamaiVersion = `Akamai V${versionMatch[1]}`;
                    console.log('[AKAMAI-CAPTURE] Version detected:', akamaiVersion);
                }
                state.akamaiVersion = akamaiVersion;

                // Auto-stop capture after getting sensor data
                console.log('[AKAMAI-CAPTURE] Auto-stopping capture (data captured)');
                if (state.timeout) {
                    clearTimeout(state.timeout);
                }

                // Normal capture mode - process as usual
                console.log('[AKAMAI-CAPTURE] Processing capture completion directly...');

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
                console.log('[AKAMAI-CAPTURE] ⚠️ POST request intercepted but no sensor_data found');
                console.log('[AKAMAI-CAPTURE] Endpoint:', url);
                console.log('[AKAMAI-CAPTURE] Body preview:', rawBody.substring(0, 200));
            }
        } catch (error) {
            console.error('[AKAMAI-CAPTURE] ❌ Error processing request:', error);
            console.error('[AKAMAI-CAPTURE] Error stack:', error.stack);
            console.error('[AKAMAI-CAPTURE] Error details:', {
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

    console.log('[AKAMAI-CAPTURE] ✅ Request interceptor ready');
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
                    console.error('[Akamai] Error starting capture:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'AKAMAI_STOP_CAPTURE':
            try {
                const result = akamaiStopCapture(request.tabId);
                sendResponse(result);
            } catch (error) {
                console.error('[Akamai] Error stopping capture:', error);
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
                console.error('[Akamai] Error getting capture state:', error);
                sendResponse({ status: 'error', error: error.message });
            }
            return false; // Sync response

        case 'AKAMAI_CAPTURE_COMPLETED':
            // NOTE: Capture processing is now handled directly in AkamaiInterceptor.js
            // This message is only for notifying the popup UI to refresh
            // The actual data processing and storage happens in handleAkamaiCaptureCompleted()
            console.log('[AKAMAI-CAPTURE] Capture completed message received (UI notification only)');
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
                    console.error('[AKAMAI-EXTRACT] Error starting extraction:', error);
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
                    console.error('[AKAMAI-EXTRACT] Error handling extraction completion:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'AKAMAI_SHOW_ANALYZING_NOTIFICATION':
            // Show analyzing notification for content analysis
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        console.log('[AKAMAI] Showing analyzing notification...');
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: '🔍 Analyzing Akamai Content',
                            message: 'Scanning page for scripts and patterns...',
                            duration: 10000
                        });
                        console.log('[AKAMAI] Notification shown successfully');
                    } else {
                        console.log('[AKAMAI] showNotification function not available');
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    console.error('[AKAMAI] Error showing notification:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'AKAMAI_SHOW_EXTRACTING_NOTIFICATION':
            // Show extracting notification for sensor extraction
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        console.log('[AKAMAI] Showing extracting sensor notification...');
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: '🔍 Extracting Sensor Data',
                            message: 'Capturing Akamai sensor information...',
                            duration: 15000 // Longer duration to persist through reload
                        });
                        console.log('[AKAMAI] Notification shown successfully');
                    } else {
                        console.log('[AKAMAI] showNotification function not available');
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    console.error('[AKAMAI] Error showing notification:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        default:
            return false; // Not handled by this module
    }
}