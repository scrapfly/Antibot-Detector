/**
 * Cloudflare Script Interceptor & Capture System
 * Captures both Turnstile and Cloudflare Challenge data
 */

var showNotification = self.BaseInterceptorHelpers?.showNotification;
var saveToHistory = self.BaseInterceptorHelpers?.saveToHistory;

function handleCloudflareMessage(request, sender, sendResponse) {
    const { type } = request;

    switch (type) {
        case 'CLOUDFLARE_START_ANALYSIS':
            const analysisResult = cloudflareStartAnalysis(request.tabId, request.url, request.requestId);
            sendResponse(analysisResult);
            return false;

        default:
            return false;
    }
}

function cloudflareStartAnalysis(tabId, url, requestId) {
    return AdvancedScriptAnalysis.start({ tabId, url, requestId, vendorId: 'cloudflare', classify(requestUrl) {
        const patterns = [
            [/challenges\.cloudflare\.com\/turnstile/i, 'Turnstile'], [/turnstile\/v\d+\/api\.js/i, 'Turnstile'],
            [/cdn-cgi\/challenge-platform/i, 'Challenge'], [/challenges\.cloudflare\.com\/cdn-cgi/i, 'Challenge'],
            [/cdn-cgi\/scripts/i, 'CDN'], [/cloudflareinsights\.com/i, 'Analytics'],
            [/cdn-cgi\/bm\/cv/i, 'Bot Management'], [/cloudflare\.com/i, 'Cloudflare']
        ];
        return patterns.find(([pattern]) => pattern.test(requestUrl))?.[1];
    } });
}

Logger.network('[Cloudflare] Interceptor loaded successfully');
