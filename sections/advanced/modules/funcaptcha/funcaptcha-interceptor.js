/**
 * FunCaptcha/Arkose Script Interceptor
 */

if (typeof funcaptchaInterceptionListener !== 'undefined') {
  console.log('[FunCaptcha] Interceptor already loaded');
} else {

var showNotification = self.BaseInterceptorHelpers?.showNotification;

function handleFunCaptchaMessage(request, sender, sendResponse) {
    const { type } = request;
    switch (type) {
        case 'FUNCAPTCHA_START_ANALYSIS':
            sendResponse(funcaptchaStartAnalysis(request.tabId, request.url));
            return false;
        case 'FUNCAPTCHA_SHOW_ANALYZING_NOTIFICATION':
            (async () => {
                try {
                    if (typeof showNotification === 'function') {
                        await showNotification(request.tabId, {
                            type: 'loading',
                            title: '🔍 Analyzing FunCaptcha Scripts',
                            message: 'Please wait while we collect script URLs...',
                            duration: 15000
                        });
                    }
                    sendResponse({ status: 'success' });
                } catch (error) {
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true;
        default:
            return false;
    }
}

function funcaptchaStartAnalysis(tabId, url) {
    const capturedUrls = new Set();

    const requestListener = (details) => {
        if (details.tabId !== tabId) return;
        if (details.url.includes('arkoselabs.com') || details.url.includes('funcaptcha.com')) {
            capturedUrls.add(JSON.stringify({ url: details.url, type: 'arkose' }));
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
                        type: 'FUNCAPTCHA_ANALYSIS_RESULT',
                        data: { scripts: finalResults, scriptCount: finalResults.length }
                    });
                } catch (error) {}
            }, 5000);
        }
    };

    chrome.webRequest.onBeforeRequest.addListener(requestListener, { urls: ['<all_urls>'], tabId: tabId }, []);
    chrome.webNavigation.onCompleted.addListener(navigationListener);

    return { status: 'started' };
}

console.log('[FunCaptcha] Interceptor loaded');
}
