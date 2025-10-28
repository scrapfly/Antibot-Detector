/**
 * Cloudflare Script Interceptor & Capture System
 * Captures both Turnstile and Cloudflare Challenge data
 */

// Guard against re-initialization (use var for service worker reload compatibility)
var cloudflareInterceptionListener = cloudflareInterceptionListener || null;
var cloudflareStatusListener = cloudflareStatusListener || null;

var showNotification = self.BaseInterceptorHelpers?.showNotification;
var saveToHistory = self.BaseInterceptorHelpers?.saveToHistory;

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
