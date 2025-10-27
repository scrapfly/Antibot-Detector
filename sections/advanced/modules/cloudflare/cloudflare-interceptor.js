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
 * Extract sitekey from DOM and return it
 * @param {number} tabId - Tab ID
 * @returns {Promise<string|null>} - Sitekey or null
 */
async function extractSitekeyFromDOM(tabId) {
    try {
        console.log('[Cloudflare-Capture] 🔑 Attempting to extract sitekey from DOM...');
        const result = await chrome.tabs.sendMessage(tabId, {
            type: 'CLOUDFLARE_EXTRACT_SITEKEY_FROM_DOM'
        });

        if (result?.sitekey) {
            console.log('[Cloudflare-Capture] ✅ Sitekey extracted:', result.sitekey.substring(0, 20) + '...');
            return result.sitekey;
        } else {
            console.log('[Cloudflare-Capture] ⚠️ No sitekey found in DOM');
            return null;
        }
    } catch (error) {
        console.log('[Cloudflare-Capture] ℹ️ Sitekey extraction failed:', error.message);
        return null;
    }
}

function cloudflareStartCapture(tabId, captureUrl) {
    console.log('[Cloudflare-Capture] Starting capture for tab:', tabId);

    // Initialize capture state
    cloudflareCaptureState.set(tabId, {
        active: true,
        timestamp: Date.now(),
        sitekey: null,
        siteURL: captureUrl,
        type: null,
        detectionMethods: []
    });

    // Set up navigation listeners for page load notifications
    const navigationStartListener = (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            console.log('[Cloudflare-Capture] Page navigation started, showing loading notification...');
            if (showNotification) {
                showNotification(tabId, {
                    type: 'warning',
                    title: '⚠️ Page Loading',
                    message: 'Please wait for the page to fully load...',
                    duration: 5000
                }).catch(err => {
                    console.error('[Cloudflare-Capture] Failed to show loading notification:', err);
                });
            }
        }
    };

    const pageLoadCompleteListener = async (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            console.log('[Cloudflare-Capture] Page fully loaded, extracting data...');

            // Clean up listeners
            chrome.webNavigation.onCommitted.removeListener(navigationStartListener);
            chrome.webNavigation.onCompleted.removeListener(pageLoadCompleteListener);

            // Get capture state
            const state = cloudflareCaptureState.get(tabId);
            if (!state) {
                console.log('[Cloudflare-Capture] ⚠️ Capture state lost, skipping extraction');
                return;
            }

            // Stop the timeout if it exists
            if (state.timeout) {
                clearTimeout(state.timeout);
            }

            // Extract sitekey from DOM
            const sitekey = await extractSitekeyFromDOM(tabId);
            if (sitekey) {
                state.sitekey = sitekey;
                state.detectionMethods.push('sitekey');
            }

            // Check cf_clearance cookie
            try {
                const cookies = await chrome.cookies.getAll({ url: state.siteURL });
                const hasCfClearance = cookies.some(c => c.name === 'cf_clearance');

                console.log('[Cloudflare-Capture] 🍪 cf_clearance cookie present:', hasCfClearance);

                if (hasCfClearance) {
                    state.type = 'Challenge + Turnstile';
                    state.detectionMethods.push('cf_clearance-cookie');
                    console.log('[Cloudflare-Capture] 🏷️ Type: Challenge + Turnstile');
                } else {
                    state.type = 'Turnstile';
                    console.log('[Cloudflare-Capture] 🏷️ Type: Turnstile');
                }
            } catch (error) {
                console.error('[Cloudflare-Capture] ❌ Error checking cookies:', error);
                state.type = 'Turnstile'; // Default to Turnstile if cookie check fails
            }

            // Save capture data
            console.log('[Cloudflare-Capture] 💾 Saving capture data');
            await handleCloudflareCaptureCompleted(tabId, {
                sitekey: state.sitekey || null,
                siteURL: state.siteURL,
                type: state.type,
                detectionMethods: state.detectionMethods,
                timestamp: state.timestamp
            });
        }
    };

    // Add navigation listeners
    chrome.webNavigation.onCommitted.addListener(navigationStartListener);
    chrome.webNavigation.onCompleted.addListener(pageLoadCompleteListener);

    // Auto-stop after 60 seconds - stop listening if page doesn't load
    const state = cloudflareCaptureState.get(tabId);
    const timeout = setTimeout(() => {
        const currentState = cloudflareCaptureState.get(tabId);
        if (currentState) {
            console.log('[Cloudflare-Capture] Timeout - page didn\'t load within 60 seconds, stopping');
            chrome.webNavigation.onCommitted.removeListener(navigationStartListener);
            chrome.webNavigation.onCompleted.removeListener(pageLoadCompleteListener);
            cloudflareCaptureState.delete(tabId);
        }
    }, 60000);

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
