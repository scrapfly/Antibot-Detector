/**
 * Cloudflare Script Interceptor & Capture System
 * Captures both Turnstile and Cloudflare Challenge data
 */

if (typeof cloudflareInterceptionListener !== 'undefined') {
  console.log('[Cloudflare] Interceptor already loaded, skipping redeclaration');
} else {

var showNotification = self.BaseInterceptorHelpers?.showNotification;
var saveToHistory = self.BaseInterceptorHelpers?.saveToHistory;

var cloudflareInterceptionListener = null;
var cloudflareStatusListener = null;

// Capture state management
var cloudflareCaptureState = new Map();

function handleCloudflareMessage(request, sender, sendResponse) {
    const { type } = request;

    switch (type) {
        case 'CLOUDFLARE_START_ANALYSIS':
            const analysisResult = cloudflareStartAnalysis(request.tabId, request.url);
            sendResponse(analysisResult);
            return false;

        case 'CLOUDFLARE_SHOW_ANALYZING_NOTIFICATION':
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        console.log('[Cloudflare] Showing analyzing notification before reload...');
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: '🔍 Analyzing Cloudflare Scripts',
                            message: 'Please wait while we collect script URLs...',
                            duration: 15000
                        });
                        console.log('[Cloudflare] Pre-reload notification shown successfully');
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    console.error('[Cloudflare] Error showing notification:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true;

        case 'CLOUDFLARE_CHECK_VERSION':
            cloudflareCheckVersion(request.tabId);
            sendResponse({ status: 'started' });
            return false;

        case 'CLOUDFLARE_START_CAPTURE':
            sendResponse(cloudflareStartCapture(request.tabId, request.url));
            return false;

        case 'CLOUDFLARE_STOP_CAPTURE':
            cloudflareStopCapture(request.tabId);
            sendResponse({ status: 'stopped' });
            return false;

        case 'CLOUDFLARE_GET_CAPTURE_STATE':
            const state = cloudflareCaptureState.get(request.tabId);
            sendResponse({ state: state ? state : null });
            return false;

        default:
            return false;
    }
}

function cloudflareCheckVersion(tabId) {
    console.log('[Cloudflare-CheckVersion] Starting version check for tab:', tabId);

    const versionState = {
        hasTurnstile: false,
        hasChallenge: false,
        detectionMethods: []
    };

    const requestListener = (details) => {
        if (details.tabId !== tabId) return;
        const url = details.url;

        // Check for Turnstile (cdata/cAction parameters)
        if (/turnstile|cdata|cAction/i.test(url)) {
            if (url.includes('cdata') || url.includes('cAction')) {
                versionState.hasTurnstile = true;
                if (!versionState.detectionMethods.includes('cdata-caction-param')) {
                    versionState.detectionMethods.push('cdata-caction-param');
                }
            }
        }

        // Check for Cloudflare Challenge
        if (/cdn-cgi\/challenge-platform|challenges\.cloudflare\.com/.test(url)) {
            versionState.hasChallenge = true;
            if (!versionState.detectionMethods.includes('challenge-url')) {
                versionState.detectionMethods.push('challenge-url');
            }
        }
    };

    const navigationListener = async (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            setTimeout(async () => {
                chrome.webRequest.onBeforeRequest.removeListener(requestListener);
                chrome.webNavigation.onCompleted.removeListener(navigationListener);

                let type = 'Unknown';
                if (versionState.hasTurnstile && versionState.hasChallenge) {
                    type = 'Turnstile + Challenge';
                } else if (versionState.hasTurnstile) {
                    type = 'Turnstile';
                } else if (versionState.hasChallenge) {
                    type = 'Challenge';
                }

                try {
                    await chrome.runtime.sendMessage({
                        type: 'CLOUDFLARE_VERSION_DETECTION_RESULT',
                        data: {
                            type: type,
                            hasTurnstile: versionState.hasTurnstile,
                            hasChallenge: versionState.hasChallenge,
                            detectionMethods: versionState.detectionMethods
                        }
                    });
                } catch (error) {
                    console.log('[Cloudflare-CheckVersion] Popup not available');
                }
            }, 5000);
        }
    };

    chrome.webRequest.onBeforeRequest.addListener(
        requestListener,
        { urls: ['<all_urls>'], tabId: tabId },
        []
    );

    chrome.webNavigation.onCompleted.addListener(navigationListener);

    return { status: 'started' };
}

async function checkCfClearanceCookie(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) return false;

        const cookies = await chrome.cookies.getAll({ url: tab.url });
        return cookies.some(c => c.name === 'cf_clearance');
    } catch (error) {
        console.error('[Cloudflare-Capture] Error checking cookie:', error);
        return false;
    }
}

/**
 * Retry sitekey extraction with exponential backoff
 * Uses longer delays because content script may still be initializing
 */
async function scheduleCloudflareRetry(tabId, state) {
    // Try again after 800ms - content script should be initialized by then
    setTimeout(async () => {
        if (state.sitekey) return; // Already got it

        try {
            console.log('[Cloudflare-Capture] 🔄 Retrying sitekey extraction (attempt 1 after 800ms)...');
            const retryResult = await chrome.tabs.sendMessage(tabId, {
                type: 'CLOUDFLARE_EXTRACT_SITEKEY_FROM_DOM'
            });

            if (retryResult?.sitekey) {
                console.log('[Cloudflare-Capture] ✅ Sitekey extracted on 1st retry:', retryResult.sitekey);
                state.sitekey = retryResult.sitekey;
                state.hasTurnstile = true;
            } else {
                console.log('[Cloudflare-Capture] ⚠️ Still no sitekey on 1st retry, trying again in 1s...');
                // Try one more time after longer delay
                setTimeout(async () => {
                    if (state.sitekey) return;
                    try {
                        console.log('[Cloudflare-Capture] 🔄 Retrying sitekey extraction (attempt 2 after 1800ms total)...');
                        const secondRetry = await chrome.tabs.sendMessage(tabId, {
                            type: 'CLOUDFLARE_EXTRACT_SITEKEY_FROM_DOM'
                        });
                        if (secondRetry?.sitekey) {
                            console.log('[Cloudflare-Capture] ✅ Sitekey extracted on 2nd retry:', secondRetry.sitekey);
                            state.sitekey = secondRetry.sitekey;
                            state.hasTurnstile = true;
                        } else {
                            console.log('[Cloudflare-Capture] ⚠️ Still no sitekey on 2nd retry - will wait for manual trigger');
                        }
                    } catch (e) {
                        console.log('[Cloudflare-Capture] 2nd retry failed:', e.message);
                    }
                }, 1000);
            }
        } catch (error) {
            console.log('[Cloudflare-Capture] 1st retry failed:', error.message);
        }
    }, 800);
}

function setupCloudflareInterceptor() {
    console.log('[Cloudflare-Capture] Setting up global request interceptor');

    cloudflareInterceptionListener = async (details) => {
        // Check if this tab is being captured
        const state = cloudflareCaptureState.get(details.tabId);
        if (!state) return;

        // Log all network requests for debugging
        console.log('[Cloudflare-Capture] 🌐 Network request:', details.url.substring(0, 100));

        const url = details.url;

        // Check for Turnstile parameters (cdata/cAction) OR Turnstile API detection
        if (/turnstile|cdata|cAction/i.test(url)) {
            console.log('[Cloudflare-Capture] ✓ Turnstile URL matched!');

            // PROACTIVE: If we haven't extracted sitekey yet and this is a Turnstile request, try extracting from DOM
            if (!state.sitekey && /turnstile/i.test(url)) {
                console.log('[Cloudflare-Capture] 🔑 Proactively extracting sitekey from DOM (Turnstile detected)');

                // Use a flag to prevent multiple simultaneous extraction attempts
                if (!state.extractionAttempted) {
                    state.extractionAttempted = true;

                    // Try immediate extraction
                    try {
                        const sitekeysResult = await chrome.tabs.sendMessage(details.tabId, {
                            type: 'CLOUDFLARE_EXTRACT_SITEKEY_FROM_DOM'
                        });
                        console.log('[Cloudflare-Capture] 📥 Response received:', sitekeysResult);

                        if (sitekeysResult?.sitekey) {
                            state.sitekey = sitekeysResult.sitekey;
                            state.hasTurnstile = true;
                            console.log('[Cloudflare-Capture] ✅ Sitekey extracted proactively from DOM:', state.sitekey);
                        } else {
                            console.log('[Cloudflare-Capture] ⚠️ No sitekey found on first attempt, will retry...');
                            // Schedule retry - DOM might not be ready yet
                            scheduleCloudflareRetry(details.tabId, state);
                        }
                    } catch (error) {
                        console.log('[Cloudflare-Capture] ⚠️ First extraction failed, will retry:', error.message);
                        // Schedule retry - content script might not be ready yet
                        scheduleCloudflareRetry(details.tabId, state);
                    }
                }
            }

            const urlObj = new URL(url);
            const cdata = urlObj.searchParams.get('cdata');
            const cAction = urlObj.searchParams.get('cAction');

            console.log('[Cloudflare-Capture] cdata found:', cdata ? 'YES' : 'NO');
            console.log('[Cloudflare-Capture] cAction found:', cAction ? 'YES' : 'NO');

            if (cdata) {
                console.log('[Cloudflare-Capture] ➤ Processing cdata...');
                state.cdata = cdata;
                state.hasTurnstile = true;
                if (!state.detectionMethods.includes('cdata')) {
                    state.detectionMethods.push('cdata');
                }

                // Extract sitekey from DOM when cdata detected
                if (!state.sitekey) {
                    console.log('[Cloudflare-Capture] 📤 Sending DOM extraction message...');
                    try {
                        const sitekeysResult = await chrome.tabs.sendMessage(details.tabId, {
                            type: 'CLOUDFLARE_EXTRACT_SITEKEY_FROM_DOM'
                        });
                        console.log('[Cloudflare-Capture] 📥 Response received:', sitekeysResult);

                        if (sitekeysResult?.sitekey) {
                            state.sitekey = sitekeysResult.sitekey;
                            console.log('[Cloudflare-Capture] ✅ Sitekey extracted from DOM:', state.sitekey);
                        } else {
                            console.log('[Cloudflare-Capture] ⚠️ Response had no sitekey:', sitekeysResult);
                        }
                    } catch (error) {
                        console.log('[Cloudflare-Capture] ❌ Could not extract sitekey from DOM:', error.message);
                    }
                }
            }

            if (cAction) {
                console.log('[Cloudflare-Capture] ➤ Processing cAction...');
                state.cAction = cAction;
                state.hasTurnstile = true;
                if (!state.detectionMethods.includes('cAction')) {
                    state.detectionMethods.push('cAction');
                }

                // Extract sitekey from DOM when cAction detected
                if (!state.sitekey) {
                    console.log('[Cloudflare-Capture] 📤 Sending DOM extraction message...');
                    try {
                        const sitekeysResult = await chrome.tabs.sendMessage(details.tabId, {
                            type: 'CLOUDFLARE_EXTRACT_SITEKEY_FROM_DOM'
                        });
                        console.log('[Cloudflare-Capture] 📥 Response received:', sitekeysResult);

                        if (sitekeysResult?.sitekey) {
                            state.sitekey = sitekeysResult.sitekey;
                            console.log('[Cloudflare-Capture] ✅ Sitekey extracted from DOM:', state.sitekey);
                        } else {
                            console.log('[Cloudflare-Capture] ⚠️ Response had no sitekey:', sitekeysResult);
                        }
                    } catch (error) {
                        console.log('[Cloudflare-Capture] ❌ Could not extract sitekey from DOM:', error.message);
                    }
                }
            }

            // When sitekey is captured, check cookie ONCE and auto-stop immediately
            console.log('[Cloudflare-Capture] Checking auto-stop condition - sitekey present:', !!state.sitekey);

            if (state.sitekey) {
                console.log('[Cloudflare-Capture] 🛑 ✓ Sitekey captured - AUTO-STOP TRIGGERED! Checking cookies...');

                // Single cookie check
                try {
                    const cookies = await chrome.cookies.getAll({ url: state.siteURL });
                    const hasCfClearance = cookies.some(c => c.name === 'cf_clearance');

                    console.log('[Cloudflare-Capture] 🍪 cf_clearance cookie present:', hasCfClearance);

                    // Set type based on cookie presence
                    if (hasCfClearance) {
                        // Challenge completed AND Turnstile exists (we have sitekey)
                        state.type = 'Challenge + Turnstile';
                        state.detectionMethods.push('cf_clearance-cookie');
                        console.log('[Cloudflare-Capture] 🏷️ Type set to: Challenge + Turnstile');
                    } else {
                        // Pure Turnstile (no challenge)
                        state.type = 'Turnstile';
                        console.log('[Cloudflare-Capture] 🏷️ Type set to: Turnstile');
                    }

                    console.log('[Cloudflare-Capture] Type determined:', state.type);
                } catch (error) {
                    console.error('[Cloudflare-Capture] ❌ Error checking cookies:', error);
                    state.type = 'Turnstile'; // Default to Turnstile if cookie check fails
                }

                // Clean up and auto-stop immediately
                console.log('[Cloudflare-Capture] 🧹 Cleaning up - removing listener and timeout');
                if (state.timeout) clearTimeout(state.timeout);
                chrome.webRequest.onBeforeRequest.removeListener(cloudflareInterceptionListener);

                console.log('[Cloudflare-Capture] 💾 Saving capture data:', {
                    sitekey: state.sitekey,
                    cdata: state.cdata ? 'present' : 'null',
                    cAction: state.cAction ? 'present' : 'null',
                    type: state.type
                });

                handleCloudflareCaptureCompleted(details.tabId, {
                    cdata: state.cdata,
                    cAction: state.cAction,
                    sitekey: state.sitekey,
                    siteURL: state.siteURL,
                    type: state.type,
                    detectionMethods: state.detectionMethods,
                    timestamp: state.timestamp
                });
                return;
            } else {
                console.log('[Cloudflare-Capture] ⏳ Waiting for sitekey... (cdata/cAction detected but no sitekey yet)');
            }
        }

        // Check for Cloudflare Challenge URLs
        if (/cdn-cgi\/challenge-platform|challenges\.cloudflare\.com/.test(url)) {
            console.log('[Cloudflare-Capture] Challenge URL detected (for reference)');
            state.hasChallenge = true;
            if (!state.detectionMethods.includes('challenge-url')) {
                state.detectionMethods.push('challenge-url');
            }
        }
    };

    // Add the listener once
    chrome.webRequest.onBeforeRequest.addListener(
        cloudflareInterceptionListener,
        { urls: ['<all_urls>'] },
        []
    );
    console.log('[Cloudflare-Capture] Global interceptor listener added');
}

function cloudflareStartCapture(tabId, captureUrl) {
    console.log('[Cloudflare-Capture] Starting capture for tab:', tabId);

    // Setup global interceptor if not already done
    if (!cloudflareInterceptionListener) {
        setupCloudflareInterceptor();
    }

    // Initialize capture state
    cloudflareCaptureState.set(tabId, {
        active: true,
        timestamp: Date.now(),
        cdata: null,
        cAction: null,
        sitekey: null,
        siteURL: captureUrl,
        type: null,
        hasTurnstile: false,
        hasChallenge: false,
        hasCfClearanceCookie: false,
        detectionMethods: []
    });

    // Auto-stop after 60 seconds - check if data was captured
    const state = cloudflareCaptureState.get(tabId);
    const timeout = setTimeout(() => {
        const currentState = cloudflareCaptureState.get(tabId);
        if (currentState) {
            // Check if we captured anything meaningful
            const hasData = currentState.hasTurnstile || currentState.hasCfClearanceCookie || currentState.hasChallenge;

            if (hasData) {
                // Save whatever was captured
                console.log('[Cloudflare-Capture] Timeout - saving captured data');
                handleCloudflareCaptureCompleted(tabId, {
                    cdata: currentState.cdata,
                    cAction: currentState.cAction,
                    sitekey: currentState.sitekey,
                    siteURL: currentState.siteURL,
                    type: currentState.type || 'Unknown',
                    detectionMethods: currentState.detectionMethods,
                    timestamp: currentState.timestamp
                });
            } else {
                // No data captured - just clean up silently
                cloudflareCaptureState.delete(tabId);
                console.log('[Cloudflare-Capture] Timeout - no data captured, stopping silently');
            }
        }
    }, 60000);

    // Store timeout for reference
    if (state) {
        state.timeout = timeout;
    }

    // Show in-page notification
    if (showNotification) {
        showNotification(tabId, {
            type: 'capture',
            title: '🔍 Cloudflare Capture Active',
            message: '🔄 Please reload the page to start monitoring',
            duration: 60000
        }).catch(err => {
            console.error('[Cloudflare-Capture] Failed to show notification:', err);
        });
    }

    return { status: 'started' };
}

function cloudflareStopCapture(tabId) {
    const state = cloudflareCaptureState.get(tabId);
    if (state && state.timeout) {
        clearTimeout(state.timeout);
    }
    cloudflareCaptureState.delete(tabId);
    console.log('[Cloudflare-Capture] Stopped capture for tab:', tabId);
}

async function handleCloudflareCaptureCompleted(tabId, captureData) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            console.error('[Cloudflare-Capture] ❌ Tab not found or no URL');
            return;
        }

        // Save to history with 30-minute expiry
        if (saveToHistory) {
            const historyData = {
                cdata: captureData.cdata,
                cAction: captureData.cAction,
                sitekey: captureData.sitekey,
                siteURL: captureData.siteURL,
                type: captureData.type,
                detectionMethods: captureData.detectionMethods
            };

            await saveToHistory(tabId, historyData, { type: 'cloudflare', expiryMinutes: 30 });
            console.log('[Cloudflare-Capture] ✅ Data saved to history');
        }

        // Clean up capture state
        cloudflareCaptureState.delete(tabId);

        // Notify popup to update UI (if open)
        chrome.runtime.sendMessage({
            type: 'CLOUDFLARE_CAPTURE_COMPLETED',
            captureData: {
                type: 'cloudflare',
                captureData: captureData,
                timestamp: Date.now()
            }
        }).catch((err) => {
            console.log('[Cloudflare-Capture] ℹ️ Popup not open, message not sent (this is normal)');
        });

        // Show success notification in page
        if (showNotification) {
            await showNotification(tabId, {
                type: 'success',
                title: '✅ Capture Completed',
                message: 'Cloudflare data captured successfully',
                duration: 5000
            }).catch(err => {
                console.error('[Cloudflare-Capture] Failed to show notification:', err);
            });
        }
    } catch (error) {
        console.error('[Cloudflare-Capture] ❌ Error handling capture completion:', error);
    }
}

function cloudflareStartAnalysis(tabId, url) {
    console.log('[Cloudflare-Analysis] Starting analysis mode for tab:', tabId);

    const capturedUrls = new Set();

    const requestListener = (details) => {
        if (details.tabId !== tabId) return;

        const requestUrl = details.url;

        // Define script patterns with types
        const patterns = [
            { regex: /challenges\.cloudflare\.com\/turnstile/i, type: 'Turnstile' },
            { regex: /turnstile\/v\d+\/api\.js/i, type: 'Turnstile' },
            { regex: /cdn-cgi\/challenge-platform/i, type: 'Challenge' },
            { regex: /challenges\.cloudflare\.com\/cdn-cgi/i, type: 'Challenge' },
            { regex: /cdn-cgi\/scripts/i, type: 'CDN' },
            { regex: /cloudflareinsights\.com/i, type: 'Analytics' },
            { regex: /cdn-cgi\/bm\/cv/i, type: 'Bot Management' },
            { regex: /cloudflare\.com/i, type: 'Cloudflare' }
        ];

        // Check against all patterns
        for (const pattern of patterns) {
            if (pattern.regex.test(requestUrl)) {
                console.log('[Cloudflare-Analysis] Network - Found', pattern.type, 'URL:', requestUrl);
                capturedUrls.add(JSON.stringify({ url: requestUrl, type: pattern.type }));
                break; // Match only once to avoid duplicate adding
            }
        }
    };

    const navigationListener = async (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            console.log('[Cloudflare-Analysis] Page loaded, waiting for all requests to complete...');

            setTimeout(async () => {
                console.log('[Cloudflare-Analysis] ========== FINALIZING RESULTS ==========');

                const finalResults = Array.from(capturedUrls).map(jsonStr => {
                    const obj = JSON.parse(jsonStr);
                    return { ...obj, source: 'network' };
                });

                console.log('[Cloudflare-Analysis] Final captured URLs:', finalResults);

                const analysisData = {
                    scripts: finalResults,
                    scriptCount: finalResults.length
                };

                chrome.webRequest.onBeforeRequest.removeListener(requestListener);
                chrome.webNavigation.onCompleted.removeListener(navigationListener);
                console.log('[Cloudflare-Analysis] Listeners removed');

                try {
                    await chrome.runtime.sendMessage({
                        type: 'CLOUDFLARE_ANALYSIS_RESULT',
                        data: analysisData
                    });
                    console.log('[Cloudflare-Analysis] ✓ Results sent to popup');
                } catch (error) {
                    console.log('[Cloudflare-Analysis] Popup not available - results discarded');
                }
            }, 5000);
        }
    };

    chrome.webRequest.onBeforeRequest.addListener(
        requestListener,
        { urls: ['<all_urls>'], tabId: tabId },
        []
    );

    chrome.webNavigation.onCompleted.addListener(navigationListener);

    console.log('[Cloudflare-Analysis] Network listener added, ready for page reload');

    return { status: 'started' };
}

console.log('[Cloudflare] Interceptor loaded successfully');

}
