/**
 * ShapeSecurityInterceptor
 * Handles Shape Security request interception and data extraction in service worker context
 */

Logger.network('[ShapeSecurityInterceptor] Loading...');

// Shape Security capture state
var shapesecurityCaptureState = shapesecurityCaptureState || new Map();

// Extraction mode state
var shapeSecurityExtractionState = shapeSecurityExtractionState || new Map();

// Destructure helpers from BaseInterceptorHelpers
var showNotification = self.BaseInterceptorHelpers?.showNotification;

/**
 * Centralized message handler for all Shape Security-related messages
 * @param {object} request - Message request object
 * @param {function} sendResponse - Response callback
 * @returns {boolean} True if async response
 */
function shapeSecurityHandleMessage(request, sendResponse) {
    switch (request.type) {
        case 'SHAPESECURITY_START_CAPTURE':
            handleShapeSecurityStartCapture(request, null, sendResponse);
            return true;

        case 'SHAPESECURITY_STOP_CAPTURE':
            handleShapeSecurityStopCapture(request, null, sendResponse);
            return true;

        case 'SHAPESECURITY_GET_CAPTURE_STATE':
            handleShapeSecurityGetCaptureState(request, null, sendResponse);
            return false; // Sync response

        case 'SHAPESECURITY_CHECK_HEADERS':
            handleShapeSecurityCheckHeaders(request, null, sendResponse);
            return true;

        case 'SHAPESECURITY_CHECK_COOKIES':
            handleShapeSecurityCheckCookies(request, null, sendResponse);
            return true;

        case 'SHAPESECURITY_ANALYZE_SCRIPTS':
            handleShapeSecurityAnalyzeScripts(request, null, sendResponse);
            return true;

        case 'SHAPESECURITY_START_EXTRACTION':
            handleShapeSecurityStartExtraction(request, null, sendResponse);
            return false; // Sync response

        case 'SHAPESECURITY_SHOW_ANALYZING_NOTIFICATION':
            // Show analyzing notification (called right before page reload)
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        Logger.network('[ShapeSecurity] Showing analyzing notification before reload...');
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: 'Extracting Shape Security Scripts',
                            message: 'Please wait while we collect script URLs...',
                            duration: 15000 // Longer duration to persist through reload
                        });
                        Logger.network('[ShapeSecurity] Pre-reload notification shown successfully');
                    } else {
                        Logger.network('[ShapeSecurity] showNotification function not available');
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    Logger.error('NETWORK', '[ShapeSecurity] Error showing notification:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response

        case 'SHAPESECURITY_EXTRACTION_COMPLETED':
            handleShapeSecurityExtractionCompleted(request, null, sendResponse);
            return true;

        case 'SHAPESECURITY_CHECK_VERSION':
            handleShapeSecurityCheckVersion(request, null, sendResponse);
            return true;

        default:
            return false; // Not handled by this module
    }
}

/**
 * Start capturing Shape Security requests
 * Captures: Cookies (8-char with max-age 1577847600) and dynamic headers (x-[8chars]-[letter])
 */
async function handleShapeSecurityStartCapture(message, sender, sendResponse) {
    const tabId = message.tabId;
    Logger.network('[ShapeSecurity] Start capture requested for tab:', tabId);

    if (shapesecurityCaptureState.has(tabId)) {
        Logger.network('[ShapeSecurity] Already capturing for this tab');
        sendResponse({ status: 'already_capturing' });
        return;
    }

    // Initialize capture state WITHOUT version detection yet
    // Version will be detected AFTER page reload when Shape Security scripts have loaded
    shapesecurityCaptureState.set(tabId, {
        active: true,
        startTime: Date.now(),
        headers: [],
        cookie: null, // Will store {name, value} of Shape Security cookie
        version: 'unknown' // Will be detected after page reload
    });

    // Set up Set-Cookie header listener to capture cookies
    const setCookieListener = (details) => {
        if (details.tabId === tabId && details.responseHeaders) {
            for (const header of details.responseHeaders) {
                if (header.name.toLowerCase() === 'set-cookie') {
                    const cookieHeader = header.value;

                    // Parse cookie name (8-character pattern)
                    const nameMatch = cookieHeader.match(/^([^=]+)=/);
                    if (nameMatch) {
                        const cookieName = nameMatch[1];
                        const cookiePattern = /^[a-zA-Z0-9]{8}$/;

                        if (cookiePattern.test(cookieName)) {
                            // Check max-age
                            const maxAgeMatch = cookieHeader.match(/Max-Age=(\d+)/i);
                            if (maxAgeMatch && maxAgeMatch[1] === '1577847600') {
                                // Extract value
                                const valueMatch = cookieHeader.match(/^[^=]+=([^;]+)/);
                                const captureState = shapesecurityCaptureState.get(tabId);
                                if (captureState) {
                                    captureState.cookie = {
                                        name: cookieName,
                                        value: valueMatch ? valueMatch[1] : ''
                                    };
                                    Logger.network('[ShapeSecurity] Captured cookie:', cookieName);

                                    // Auto-stop based on version:
                                    // V1: Only needs cookie (no headers)
                                    // V2: Needs both cookie AND headers
                                    // unknown: Version detection still running, don't auto-stop yet
                                    if (captureState.version === 'v1') {
                                        Logger.network('[ShapeSecurity] V1 detected - cookie captured, auto-stopping...');
                                        autoStopCapture(tabId, 'complete');
                                    } else if (captureState.version === 'v2' && captureState.headers.length > 0) {
                                        Logger.network('[ShapeSecurity] V2 detected - both cookie and headers captured! Auto-stopping...');
                                        autoStopCapture(tabId, 'complete');
                                    } else if (captureState.version === 'unknown') {
                                        Logger.network('[ShapeSecurity] Cookie captured, but version still being detected...');
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    };

    // Version detection will happen after page reload by checking window.__xr_bmobdb directly

    // Set up request header listener to capture dynamic headers
    const requestHeaderListener = (details) => {
        if (details.tabId === tabId && details.requestHeaders) {
            const captureState = shapesecurityCaptureState.get(tabId);
            if (captureState) {
                // Pattern: x-[8 random chars]-[single letter]
                const headerPattern = /^x-[a-z0-9]{8}-[a-z]$/i;

                for (const header of details.requestHeaders) {
                    if (headerPattern.test(header.name.toLowerCase())) {
                        // Check if not already captured
                        if (!captureState.headers.some(h => h.name === header.name)) {
                            captureState.headers.push({
                                name: header.name,
                                value: header.value,
                                timestamp: Date.now()
                            });
                            Logger.network('[ShapeSecurity] Captured header:', header.name);

                            // Auto-stop based on version (only V2 needs headers):
                            // V1: Headers not required, won't auto-stop here
                            // V2: Needs both cookie AND headers
                            if (captureState.version === 'v2' && captureState.cookie && captureState.headers.length > 0) {
                                Logger.network('[ShapeSecurity] V2 - both cookie and headers captured! Auto-stopping...');
                                autoStopCapture(tabId, 'complete');
                            } else if (captureState.version === 'v1') {
                                Logger.network('[ShapeSecurity] V1 - headers captured but not required for V1');
                            }
                        }
                    }
                }
            }
        }
    };

    // Add listeners
    chrome.webRequest.onResponseStarted.addListener(
        setCookieListener,
        { urls: ['<all_urls>'], tabId: tabId },
        ['responseHeaders', 'extraHeaders']
    );

    chrome.webRequest.onBeforeSendHeaders.addListener(
        requestHeaderListener,
        { urls: ['<all_urls>'], tabId: tabId },
        ['requestHeaders', 'extraHeaders']
    );

    Logger.network('[ShapeSecurity] Capture started for tab:', tabId);

    // Show in-page notification
    if (showNotification) {
        await showNotification(tabId, {
            type: 'capture',
            title: 'Shape Security Capture Active',
            message: 'Please reload the page to start monitoring',
            duration: 60000
        }).catch(err => {
            Logger.error('NETWORK', '[ShapeSecurity] Failed to show notification:', err);
        });
    }

    // Set up listener for page reload to show loading warning first
    const navigationListener = (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            Logger.network('[ShapeSecurity] Page navigation started, showing loading warning...');

            // Show loading warning immediately
            if (showNotification) {
                showNotification(tabId, {
                    type: 'warning',
                    title: 'Page Loading',
                    message: 'Please wait for the page to fully load before performing actions...',
                    duration: 5000
                }).catch(err => {
                    Logger.error('NETWORK', '[ShapeSecurity] Failed to show loading warning:', err);
                });
            }
        }
    };

    // Set up listener for when page is fully loaded
    const loadCompleteListener = (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            Logger.network('[ShapeSecurity] Page fully loaded, detecting version...');

            // Check window.__xr_bmobdb directly in page context
            setTimeout(async () => {
                const captureState = shapesecurityCaptureState.get(tabId);
                if (captureState && captureState.version === 'unknown') {
                    try {
                        // Inject script to check window.__xr_bmobdb in page context
                        const [result] = await chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            world: 'MAIN', // Execute in page context
                            func: () => {
                                return typeof window.__xr_bmobdb !== 'undefined';
                            }
                        });

                        const exists = result && result.result;
                        const version = exists ? 'v1' : 'v2';

                        Logger.network('[ShapeSecurity] window.__xr_bmobdb exists:', exists);
                        Logger.network('[ShapeSecurity] Detected version:', version);

                        captureState.version = version;
                        shapesecurityCaptureState.set(tabId, captureState);

                        // Auto-stop based on version
                        if (version === 'v1' && captureState.cookie) {
                            Logger.network('[ShapeSecurity] V1 + cookie captured! Auto-stopping...');
                            autoStopCapture(tabId, 'complete');
                            return;
                        } else if (version === 'v2' && captureState.cookie && captureState.headers.length > 0) {
                            Logger.network('[ShapeSecurity] V2 + both captured! Auto-stopping...');
                            autoStopCapture(tabId, 'complete');
                            return;
                        }
                    } catch (error) {
                        Logger.error('NETWORK', '[ShapeSecurity] Error detecting version:', error);
                        captureState.version = 'v2'; // Default to V2 on error
                        shapesecurityCaptureState.set(tabId, captureState);
                    }
                }

                // Show notification
                const currentState = shapesecurityCaptureState.get(tabId);
                const version = currentState?.version || 'v2';

                if (showNotification) {
                    Logger.network(`[ShapeSecurity] Showing notification for version: ${version}`);

                    // Show notification with timer using chrome.scripting
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            args: [version], // Pass version as argument
                            func: (version) => {
                                // Cleanup old notifications
                                const allNotifs = document.querySelectorAll('[id^="scrapfly-capture-notification"]');
                                allNotifs.forEach(n => n.remove());
                                const oldStyles = document.querySelectorAll('style[data-scrapfly-notification]');
                                oldStyles.forEach(s => s.remove());
                                if (window.scrapflyTimerInterval) {
                                    clearInterval(window.scrapflyTimerInterval);
                                    window.scrapflyTimerInterval = null;
                                }

                                requestAnimationFrame(() => {
                                    setTimeout(() => {
                                        const notif = document.createElement('div');
                                        notif.id = `scrapfly-capture-notification-${Date.now()}`;
                                        notif.style.cssText = `
                                            position: fixed !important;
                                            top: 20px !important;
                                            right: 20px !important;
                                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                                            color: white !important;
                                            padding: 20px 24px !important;
                                            border-radius: 12px !important;
                                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
                                            z-index: 2147483647 !important;
                                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                                            font-size: 14px !important;
                                            min-width: 320px !important;
                                        `;

                                        const styleTag = document.createElement('style');
                                        styleTag.setAttribute('data-scrapfly-notification', 'true');
                                        styleTag.textContent = `
                                            @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                                        `;
                                        document.head.appendChild(styleTag);

                                        // Version-specific notification message
                                        const message = version === 'v1'
                                            ? 'Perform actions to trigger cookie'
                                            : 'Perform actions to trigger headers + cookie';

                                        notif.innerHTML = `
                                            <div style="font-weight: 600; font-size: 16px; margin-bottom: 6px;">
                                                Monitoring Active (${version.toUpperCase()}) <span id="scrapfly-timer">60s</span>
                                            </div>
                                            <div style="opacity: 0.9;">
                                                ${message}
                                            </div>
                                        `;
                                        notif.style.animation = 'slideIn 0.3s ease-out';
                                        document.body.appendChild(notif);

                                        // Start countdown timer from 60 to 0
                                        let seconds = 60;
                                        window.scrapflyTimerInterval = setInterval(() => {
                                            seconds--;
                                            const timerEl = document.getElementById('scrapfly-timer');
                                            if (timerEl) {
                                                timerEl.textContent = `${seconds}s`;
                                            }
                                            // Stop at 0
                                            if (seconds <= 0 && window.scrapflyTimerInterval) {
                                                clearInterval(window.scrapflyTimerInterval);
                                                window.scrapflyTimerInterval = null;
                                            }
                                        }, 1000);
                                    }, 100);
                                });
                            }
                        });
                    } catch (err) {
                        Logger.error('NETWORK', '[ShapeSecurity] Failed to show monitoring notification with timer:', err);
                    }
                }
            }, 5000); // Wait 5 seconds for version detection

            // Remove both listeners after monitoring notification shown
            chrome.webNavigation.onCommitted.removeListener(navigationListener);
            chrome.webNavigation.onCompleted.removeListener(loadCompleteListener);
        }
    };

    // Add both listeners
    chrome.webNavigation.onCommitted.addListener(navigationListener);
    chrome.webNavigation.onCompleted.addListener(loadCompleteListener);

    // Set 60-second timeout for auto-stop
    const captureTimeout = setTimeout(async () => {
        await autoStopCapture(tabId, 'timeout');
    }, 60000);

    // Store listeners and timeout in capture state for cleanup
    const captureState = shapesecurityCaptureState.get(tabId);
    if (captureState) {
        captureState.setCookieListener = setCookieListener;
        captureState.requestHeaderListener = requestHeaderListener;
        captureState.navigationListener = navigationListener;
        captureState.loadCompleteListener = loadCompleteListener;
        captureState.captureTimeout = captureTimeout;
    }

    sendResponse({ status: 'started' });
}

/**
 * Auto-stop capture when both cookie and headers are captured
 * @param {number} tabId - Tab ID
 * @param {string} reason - Reason for auto-stop ('complete' or 'timeout')
 */
async function autoStopCapture(tabId, reason = 'complete') {
    Logger.network(`[ShapeSecurity] Auto-stopping capture for tab ${tabId}, reason: ${reason}`);

    const captureState = shapesecurityCaptureState.get(tabId);
    if (!captureState) {
        Logger.network('[ShapeSecurity] No active capture state found');
        return;
    }

    // Clear timeout if exists
    if (captureState.captureTimeout) {
        clearTimeout(captureState.captureTimeout);
    }

    // Remove webRequest listeners
    if (captureState.setCookieListener) {
        chrome.webRequest.onResponseStarted.removeListener(captureState.setCookieListener);
    }
    if (captureState.requestHeaderListener) {
        chrome.webRequest.onBeforeSendHeaders.removeListener(captureState.requestHeaderListener);
    }

    // Remove navigation listeners
    if (captureState.navigationListener) {
        chrome.webNavigation.onCommitted.removeListener(captureState.navigationListener);
    }
    if (captureState.loadCompleteListener) {
        chrome.webNavigation.onCompleted.removeListener(captureState.loadCompleteListener);
    }

    // Clear timer in page
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                if (window.scrapflyTimerInterval) {
                    clearInterval(window.scrapflyTimerInterval);
                    window.scrapflyTimerInterval = null;
                }
                // Remove notification
                const allNotifs = document.querySelectorAll('[id^="scrapfly-capture-notification"]');
                allNotifs.forEach(n => n.remove());
            }
        });
    } catch (err) {
        Logger.error('NETWORK', '[ShapeSecurity] Failed to clear timer:', err);
    }

    // Save captured data to history
    const capturedData = {
        headers: captureState.headers,
        cookie: captureState.cookie,
        version: captureState.version || 'v2', // Include detected version (default v2)
        duration: Date.now() - captureState.startTime
    };

    Logger.network('[ShapeSecurity] Captured data:', capturedData);

    try {
        await BaseInterceptorHelpers.saveToHistory(tabId, capturedData, { type: 'shapesecurity', expiryMinutes: 30 });
        Logger.network('[ShapeSecurity] Capture data saved to history');

        // Delete capture state
        shapesecurityCaptureState.delete(tabId);

        // Show completion notification
        if (showNotification) {
            const cookieCount = capturedData.cookie ? 1 : 0;
            const headerCount = capturedData.headers.length;
            const version = capturedData.version || 'v2';

            let message;
            if (reason === 'timeout') {
                message = `Timeout: ${cookieCount} cookie, ${headerCount} headers captured (${version.toUpperCase()})`;
            } else {
                // Version-specific success message
                if (version === 'v1') {
                    message = `${version.toUpperCase()} - Cookie: ${capturedData.cookie ? capturedData.cookie.name : 'None'}`;
                } else {
                    message = `${version.toUpperCase()} - Cookie: ${capturedData.cookie ? capturedData.cookie.name : 'None'} | Headers: ${headerCount}`;
                }
            }

            await showNotification(tabId, {
                type: 'success',
                title: 'Capture Completed',
                message: message,
                duration: 5000
            }).catch(err => {
                Logger.error('NETWORK', '[ShapeSecurity] Failed to show completion notification:', err);
            });
        }
    } catch (error) {
        Logger.error('NETWORK', '[ShapeSecurity] Failed to save capture data:', error);
    }
}

/**
 * Stop capturing and save results
 */
function handleShapeSecurityStopCapture(message, sender, sendResponse) {
    const tabId = message.tabId;
    Logger.network('[ShapeSecurity] Stop capture requested for tab:', tabId);

    const captureState = shapesecurityCaptureState.get(tabId);
    if (!captureState) {
        Logger.network('[ShapeSecurity] No active capture for this tab');
        sendResponse({ status: 'not_capturing' });
        return;
    }

    // Remove listeners
    if (captureState.setCookieListener) {
        chrome.webRequest.onResponseStarted.removeListener(captureState.setCookieListener);
    }
    if (captureState.requestHeaderListener) {
        chrome.webRequest.onBeforeSendHeaders.removeListener(captureState.requestHeaderListener);
    }

    // Save captured data to history
    const capturedData = {
        headers: captureState.headers,
        cookie: captureState.cookie,
        version: captureState.version || 'v2', // Include detected version (default v2)
        duration: Date.now() - captureState.startTime
    };

    Logger.network('[ShapeSecurity] Captured data:', capturedData);

    BaseInterceptorHelpers.saveToHistory(tabId, capturedData, { type: 'shapesecurity', expiryMinutes: 30 })
        .then(async () => {
            Logger.network('[ShapeSecurity] Capture data saved to history');
            shapesecurityCaptureState.delete(tabId);

            // Show completion notification
            if (showNotification) {
                const cookieCount = capturedData.cookie ? 1 : 0;
                const headerCount = capturedData.headers.length;

                await showNotification(tabId, {
                    type: 'success',
                    title: 'Capture Completed',
                    message: `Captured: ${cookieCount} cookie, ${headerCount} headers`,
                    duration: 5000
                }).catch(err => {
                    Logger.error('NETWORK', '[ShapeSecurity] Failed to show completion notification:', err);
                });
            }

            sendResponse({ status: 'stopped', data: capturedData });
        })
        .catch(error => {
            Logger.error('NETWORK', '[ShapeSecurity] Failed to save capture data:', error);
            sendResponse({ status: 'error', error: error.message });
        });

    return true;
}

/**
 * Get current capture state
 */
function handleShapeSecurityGetCaptureState(message, sender, sendResponse) {
    const tabId = message.tabId;
    const captureState = shapesecurityCaptureState.get(tabId);

    sendResponse({
        isCapturing: !!captureState,
        state: captureState || null
    });
}

/**
 * Check Shape Security headers from page
 */
async function handleShapeSecurityCheckHeaders(message, sender, sendResponse) {
    const tabId = message.tabId;
    Logger.network('[ShapeSecurity] Check headers requested for tab:', tabId);

    try {
        // Inject script to get response headers
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                // Get headers from performance API
                const resources = performance.getEntriesByType('resource');
                const headers = {};

                resources.forEach(resource => {
                    // Check if resource has Shape Security indicators
                    if (resource.name.includes('seed=') || resource.name.includes('X-')) {
                        // Note: We can't actually get response headers from performance API
                        // This is a limitation of the browser
                        Logger.network('Shape Security resource found:', resource.name);
                    }
                });

                // Return headers from current page (if available)
                return {
                    message: 'Headers can only be captured during active request interception',
                    foundResources: resources.filter(r =>
                        r.name.includes('seed=') || r.name.includes('X-')
                    ).length
                };
            }
        });

        sendResponse({
            status: 'checked',
            headers: result.result || {},
            note: 'Enable "Start Capturing" to capture live headers'
        });

    } catch (error) {
        Logger.error('NETWORK', '[ShapeSecurity] Check headers error:', error);
        sendResponse({ status: 'error', error: error.message });
    }

    return true;
}

/**
 * Check Shape Security cookies
 * Intercepts Set-Cookie headers to find 8-char cookies with max-age 1577847600
 */
async function handleShapeSecurityCheckCookies(message, sender, sendResponse) {
    const tabId = message.tabId;
    const url = message.url;
    Logger.network('[ShapeSecurity] Check cookies requested for tab:', tabId);

    try {
        // Get domain from URL
        const urlObj = new URL(url);
        const domain = urlObj.hostname;

        // Get all cookies for this domain and delete Shape Security ones
        const allCookies = await chrome.cookies.getAll({ domain: domain });
        Logger.network('[ShapeSecurity] Found existing cookies:', allCookies);

        const cookiePattern = /^[a-zA-Z0-9]{8}$/;
        const deletedCookies = [];

        for (const cookie of allCookies) {
            if (cookiePattern.test(cookie.name)) {
                const cookieUrl = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
                await chrome.cookies.remove({
                    url: cookieUrl,
                    name: cookie.name
                });
                deletedCookies.push(cookie.name);
                Logger.network('[ShapeSecurity] Deleted cookie:', cookie.name);
            }
        }

        Logger.network('[ShapeSecurity] Deleted cookies:', deletedCookies);

        // Set up header listener to intercept Set-Cookie headers
        let foundCookie = null;
        const headerListener = (details) => {
            if (details.tabId === tabId && details.responseHeaders) {
                Logger.network('[ShapeSecurity] Checking response headers for URL:', details.url);

                // Look for Set-Cookie headers
                for (const header of details.responseHeaders) {
                    if (header.name.toLowerCase() === 'set-cookie') {
                        const cookieHeader = header.value;
                        Logger.network('[ShapeSecurity] Found Set-Cookie:', cookieHeader);

                        // Parse cookie name
                        const nameMatch = cookieHeader.match(/^([^=]+)=/);
                        if (nameMatch) {
                            const cookieName = nameMatch[1];

                            // Check if 8-character pattern
                            if (cookiePattern.test(cookieName)) {
                                // Check if max-age is 1577847600
                                const maxAgeMatch = cookieHeader.match(/Max-Age=(\d+)/i);
                                if (maxAgeMatch && maxAgeMatch[1] === '1577847600') {
                                    // Extract cookie value
                                    const valueMatch = cookieHeader.match(/^[^=]+=([^;]+)/);
                                    foundCookie = {
                                        name: cookieName,
                                        value: valueMatch ? valueMatch[1] : '',
                                        setCookie: cookieHeader
                                    };
                                    Logger.network('[ShapeSecurity] Found Shape Security cookie:', foundCookie);
                                }
                            }
                        }
                    }
                }
            }
        };

        // Add header listener
        chrome.webRequest.onResponseStarted.addListener(
            headerListener,
            { urls: ['<all_urls>'], tabId: tabId },
            ['responseHeaders', 'extraHeaders']
        );

        // Track captured cookie across page loads
        let capturedCookie = null;

        // Set up navigation completion listener with immediate + delayed checks
        const navigationListener = (details) => {
            if (details.tabId === tabId && details.frameId === 0) {
                Logger.network('[ShapeSecurity] Page navigation completed');

                // Immediate check (catch challenge page before redirect)
                if (foundCookie && !capturedCookie) {
                    Logger.network('[ShapeSecurity] Cookie found immediately, saving...');
                    capturedCookie = foundCookie;
                }

                // Check again after 3 seconds (catch cookies set later)
                setTimeout(() => {
                    if (foundCookie && !capturedCookie) {
                        Logger.network('[ShapeSecurity] Cookie found after 3 seconds, saving...');
                        capturedCookie = foundCookie;
                    }
                }, 3000);

                // Finalize after 5 seconds
                setTimeout(() => {
                    Logger.network('[ShapeSecurity] Finalizing cookie check...');

                    // Remove header listener
                    chrome.webRequest.onResponseStarted.removeListener(headerListener);

                    // Use best result (prioritize captured cookie)
                    const finalCookie = capturedCookie || foundCookie;

                    // Send result to popup
                    chrome.runtime.sendMessage({
                        type: 'SHAPESECURITY_COOKIE_RESULT',
                        cookie: finalCookie
                    });

                    // Clean up navigation listener
                    chrome.webNavigation.onCompleted.removeListener(navigationListener);

                    Logger.network('[ShapeSecurity] Cookie check completed, result:', finalCookie);
                }, 5000);
            }
        };

        // Add navigation listener
        chrome.webNavigation.onCompleted.addListener(navigationListener);

        // Reload the tab
        await chrome.tabs.reload(tabId);

        sendResponse({ success: true, deletedCookies: deletedCookies });

    } catch (error) {
        Logger.error('NETWORK', '[ShapeSecurity] Check cookies error:', error);
        sendResponse({ success: false, error: error.message });
    }

    return true;
}

/**
 * Analyze Shape Security scripts on page
 */
async function handleShapeSecurityAnalyzeScripts(message, sender, sendResponse) {
    const tabId = message.tabId;
    Logger.network('[ShapeSecurity] Analyze scripts requested for tab:', tabId);

    try {
        // Inject script to find Shape Security scripts
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                const scripts = [];
                const scriptElements = document.querySelectorAll('script[src]');

                scriptElements.forEach(script => {
                    const src = script.src;
                    // Check for Shape Security patterns: seed=, shape, init.js, vendor2.js, or ?async
                    if (src.includes('seed=') || src.includes('shape') || src.includes('/init.js') || src.includes('vendor2.js') || src.includes('?async')) {
                        const seedMatch = src.match(/seed=([A-Za-z0-9_\-]+)/);
                        const isInitJs = src.includes('/init.js') || src.includes('?async');
                        scripts.push({
                            url: src,
                            hasSeed: !!seedMatch,
                            seed: seedMatch ? seedMatch[1] : null,
                            isInitJs: isInitJs
                        });
                    }
                });

                // Also check performance entries
                const resources = performance.getEntriesByType('resource');
                resources.forEach(resource => {
                    if ((resource.name.includes('seed=') || resource.name.includes('shape') || resource.name.includes('/init.js') || resource.name.includes('vendor2.js') || resource.name.includes('?async')) &&
                        !scripts.some(s => s.url === resource.name)) {
                        const seedMatch = resource.name.match(/seed=([A-Za-z0-9_\-]+)/);
                        const isInitJs = resource.name.includes('/init.js') || resource.name.includes('?async');
                        scripts.push({
                            url: resource.name,
                            hasSeed: !!seedMatch,
                            seed: seedMatch ? seedMatch[1] : null,
                            isInitJs: isInitJs
                        });
                    }
                });

                return scripts;
            }
        });

        sendResponse({
            status: 'analyzed',
            scripts: result.result || []
        });

    } catch (error) {
        Logger.error('NETWORK', '[ShapeSecurity] Analyze scripts error:', error);
        sendResponse({ status: 'error', error: error.message });
    }

    return true;
}

/**
 * Check Shape Security version (V1 or V2)
 * V1: window.__xr_bmobdb exists (object) → Cookie only
 * V2: window.__xr_bmobdb undefined → Cookie + Headers
 *
 * Strategy: Check window.__xr_bmobdb directly on current page (no reload needed)
 */
async function handleShapeSecurityCheckVersion(message, sender, sendResponse) {
    const tabId = message.tabId;
    Logger.network('[ShapeSecurity] Check version requested for tab:', tabId);

    try {
        // Check window.__xr_bmobdb directly in page context (no reload needed)
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN', // Execute in page context to access window.__xr_bmobdb
            func: () => {
                const exists = typeof window.__xr_bmobdb !== 'undefined';
                const type = exists ? typeof window.__xr_bmobdb : null;
                return { exists, type };
            }
        });

        Logger.network('[ShapeSecurity] Check result:', result);

        if (result && result.result) {
            const checkResult = result.result;
            const version = checkResult.exists ? 'v1' : 'v2';

            Logger.network('[ShapeSecurity] Detected version:', version);

            // Return result directly
            sendResponse({ version: version, exists: checkResult.exists, type: checkResult.type });
        } else {
            // Default to V2 if check failed
            Logger.network('[ShapeSecurity] Check failed, defaulting to V2');
            sendResponse({ version: 'v2', exists: false });
        }
    } catch (error) {
        Logger.error('NETWORK', '[ShapeSecurity] Error checking version:', error);
        sendResponse({ error: error.message });
    }

    return true;
}

/**
 * Intercept requests to capture Shape Security headers and scripts
 * This would be called from webRequest listener in background.js
 */
function interceptShapeSecurityRequest(details) {
    // Find if any tab is capturing
    for (const [tabId, state] of shapesecurityCaptureState.entries()) {
        if (state.active && details.tabId === tabId) {
            const url = details.url;

            // Check for seed parameter
            if (url.includes('seed=')) {
                const seedMatch = url.match(/seed=([A-Za-z0-9_\-]+)/);
                if (seedMatch) {
                    state.seedParams.push({
                        url: url,
                        seed: seedMatch[1],
                        timestamp: Date.now()
                    });
                    Logger.network('[ShapeSecurity] Captured seed parameter:', seedMatch[1]);
                }
            }

            // Capture dynamic headers (would need onHeadersReceived listener)
            if (details.responseHeaders) {
                details.responseHeaders.forEach(header => {
                    const headerName = header.name.toLowerCase();
                    if (headerName.startsWith('x-') && headerName.match(/x-[a-z0-9]{8}-[a-z]/)) {
                        state.headers.push({
                            name: header.name,
                            value: header.value,
                            timestamp: Date.now()
                        });
                        Logger.network('[ShapeSecurity] Captured dynamic header:', header.name);
                    }
                });
            }

            // Track scripts
            if (url.includes('.js')) {
                state.scripts.push({
                    url: url,
                    timestamp: Date.now()
                });
            }
        }
    }
}

/**
 * Start extraction mode - reload page and capture all script URLs
 * Uses immediate injection + accumulation to catch intermediate challenge pages
 */
function handleShapeSecurityStartExtraction(message, sender, sendResponse) {
    const tabId = message.tabId;
    Logger.network('[ShapeSecurity-EXTRACT] Start extraction requested for tab:', tabId);

    // Enable extraction mode
    shapeSecurityExtractionState.set(tabId, {
        active: true,
        startTime: Date.now(),
        initJsUrls: [],
        vendor2Urls: [],
        allScripts: []
    });

    // Track captured results across page loads
    let capturedScripts = null;

    // Set up webNavigation listener to inject script after page reload
    const navigationListener = async (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            Logger.network('[ShapeSecurity-EXTRACT] Page loaded, injecting script immediately...');

            // Note: Notification is shown before page reload via SHAPESECURITY_SHOW_ANALYZING_NOTIFICATION
            // No need to show it again here

            // Function to collect scripts
            const collectScripts = async () => {
                try {
                    const [result] = await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: () => {
                            const scripts = [];
                            const scriptElements = document.querySelectorAll('script[src]');

                            scriptElements.forEach(script => {
                                const src = script.src;
                                if (src.includes('seed=') || src.includes('shape') || src.includes('/init.js') || src.includes('vendor2.js') || src.includes('?async')) {
                                    scripts.push({ url: src });
                                }
                            });

                            // Also check performance entries
                            const resources = performance.getEntriesByType('resource');
                            resources.forEach(resource => {
                                if ((resource.name.includes('seed=') || resource.name.includes('shape') || resource.name.includes('/init.js') || resource.name.includes('vendor2.js') || resource.name.includes('?async')) &&
                                    !scripts.some(s => s.url === resource.name)) {
                                    scripts.push({ url: resource.name });
                                }
                            });

                            return scripts;
                        }
                    });

                    const scripts = result.result || [];
                    Logger.network('[ShapeSecurity-EXTRACT] Collected', scripts.length, 'scripts');

                    // Accumulate scripts (keep best result)
                    if (scripts.length > 0) {
                        Logger.network('[ShapeSecurity-EXTRACT] Found scripts! Saving to capturedScripts...');
                        capturedScripts = scripts;
                    }

                    return scripts;

                } catch (error) {
                    Logger.error('NETWORK', '[ShapeSecurity-EXTRACT] Failed to inject script:', error);
                    return [];
                }
            };

            // Inject immediately (catch challenge page before redirect)
            collectScripts();

            // Also inject after 3 seconds (catch late-loading scripts)
            setTimeout(() => {
                Logger.network('[ShapeSecurity-EXTRACT] Secondary check after 3 seconds...');
                collectScripts();
            }, 3000);

            // After 5 seconds, finalize results
            setTimeout(async () => {
                Logger.network('[ShapeSecurity-EXTRACT] Finalizing results...');

                const finalScripts = capturedScripts || [];
                Logger.network('[ShapeSecurity-EXTRACT] Final collected scripts:', finalScripts);

                // Send extraction completed message
                await handleShapeSecurityExtractionCompleted({
                    tabId: tabId,
                    scripts: finalScripts
                }, null, () => {});

                // Remove listener
                chrome.webNavigation.onCompleted.removeListener(navigationListener);
                Logger.network('[ShapeSecurity-EXTRACT] Extraction complete, listener removed');
            }, 5000);
        }
    };

    chrome.webNavigation.onCompleted.addListener(navigationListener);
    Logger.network('[ShapeSecurity-EXTRACT] Navigation listener added');

    Logger.network('[ShapeSecurity-EXTRACT] Extraction mode enabled for tab:', tabId);
    sendResponse({ status: 'success' });
}

/**
 * Handle extraction completion - called from content script after page load
 */
async function handleShapeSecurityExtractionCompleted(message, sender, sendResponse) {
    const tabId = message.tabId;
    Logger.network('[ShapeSecurity-EXTRACT] Extraction completed for tab:', tabId);

    const state = shapeSecurityExtractionState.get(tabId);
    if (!state) {
        Logger.network('[ShapeSecurity-EXTRACT] No extraction state found');
        sendResponse({ status: 'error', error: 'No extraction state' });
        return;
    }

    // Analyze the captured scripts from message
    const scripts = message.scripts || [];
    Logger.network('[ShapeSecurity-EXTRACT] Analyzing', scripts.length, 'scripts');

    const initJsUrls = [];
    const seedUrls = [];
    const allScripts = [];

    // First pass: collect all URLs and identify seed scripts
    scripts.forEach(script => {
        const url = script.url;
        allScripts.push(url);

        // Seed scripts are those with seed= parameter
        if (url.includes('seed=')) {
            seedUrls.push(url);
        }
    });

    // Second pass: find init scripts
    // For each seed script, the init script is the same URL without ?seed=xxx
    seedUrls.forEach(seedUrl => {
        // Remove everything from ?seed onwards to get the init URL
        const initUrl = seedUrl.split('?seed')[0];

        // Check if this init URL exists in allScripts
        if (allScripts.includes(initUrl) && !initJsUrls.includes(initUrl)) {
            initJsUrls.push(initUrl);
        }
    });

    // Also include scripts with ?async as init scripts
    allScripts.forEach(url => {
        if (url.includes('?async') && !initJsUrls.includes(url)) {
            initJsUrls.push(url);
        }
    });

    const extractedData = {
        initJsUrls,
        seedUrls,
        allScripts,
        timestamp: Date.now()
    };

    Logger.network('[ShapeSecurity-EXTRACT] Extracted data:', extractedData);

    // Send result to popup
    try {
        await chrome.runtime.sendMessage({
            type: 'SHAPESECURITY_EXTRACTION_RESULT',
            extractedData: extractedData
        });
        Logger.network('[ShapeSecurity-EXTRACT] Result sent to popup');
    } catch (error) {
        Logger.network('[ShapeSecurity-EXTRACT] Popup not available:', error.message);
    }

    // Clean up extraction state
    shapeSecurityExtractionState.delete(tabId);
    Logger.network('[ShapeSecurity-EXTRACT] Extraction state cleaned up');

    sendResponse({ status: 'success' });
}

Logger.network('[ShapeSecurityInterceptor] Loaded');
