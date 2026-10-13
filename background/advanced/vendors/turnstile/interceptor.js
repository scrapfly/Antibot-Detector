/**
 * Turnstile Script Interceptor
 */

var showNotification = self.BaseInterceptorHelpers?.showNotification;

function handleTurnstileMessage(request, sender, sendResponse) {
    const { type } = request;
    switch (type) {
        case 'TURNSTILE_START_ANALYSIS':
            sendResponse(turnstileStartAnalysis(request.tabId, request.url, request.requestId));
            return false;
        default:
            return false;
    }
}

function turnstileStartAnalysis(tabId, url, requestId) {
    return AdvancedScriptAnalysis.start({ tabId, url, requestId, vendorId: 'turnstile', classify(requestUrl) {
        return requestUrl.includes('/turnstile/') ? 'turnstile' : null;
    } });
}

Logger.network('[Turnstile] Interceptor loaded');
