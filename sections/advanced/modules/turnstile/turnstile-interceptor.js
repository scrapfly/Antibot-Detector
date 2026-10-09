/**
 * Turnstile Script Interceptor
 */

var showNotification = self.BaseInterceptorHelpers?.showNotification;

function handleTurnstileMessage(request, sender, sendResponse) {
    const { type } = request;
    switch (type) {
        case 'TURNSTILE_START_ANALYSIS':
            sendResponse(turnstileStartAnalysis(request.tabId, request.url));
            return false;
        default:
            return false;
    }
}

function turnstileStartAnalysis(tabId, url) {
    const capturedUrls = new Set();

    const requestListener = (details) => {
        if (details.tabId !== tabId) return;
        if (details.url.includes('/turnstile/')) {
            capturedUrls.add(JSON.stringify({ url: details.url, type: 'turnstile' }));
        }
    };

    const navigationListener = async (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
            setTimeout(async () => {
                const finalResults = Array.from(capturedUrls).map(jsonStr => {
                    const obj = JSON.parse(jsonStr);
                    return { ...obj, source: 'network' };
                });

                chrome.webRequest.onBeforeRequest.removeListener(requestListener);
                chrome.webNavigation.onCompleted.removeListener(navigationListener);

                try {
                    await chrome.runtime.sendMessage({
                        type: 'TURNSTILE_ANALYSIS_RESULT',
                        data: { scripts: finalResults, scriptCount: finalResults.length }
                    });
                } catch (error) {
                    Logger.network('[Turnstile-Analysis] Popup not available');
                }
            }, 5000);
        }
    };

    chrome.webRequest.onBeforeRequest.addListener(requestListener, { urls: ['<all_urls>'], tabId: tabId }, []);
    chrome.webNavigation.onCompleted.addListener(navigationListener);

    return { status: 'started' };
}

Logger.network('[Turnstile] Interceptor loaded');
