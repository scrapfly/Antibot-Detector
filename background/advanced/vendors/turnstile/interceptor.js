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
    return AdvancedScriptAnalysis.start({ tabId, url, requestId, vendorId: 'turnstile', classify: turnstileClassifyUrl });
}

const TURNSTILE_HOSTS = ['challenges.cloudflare.com', 'challenges.cloudflare-cn.com', 'challenges.fed.cloudflare.com'];

/** Which Turnstile request a URL is, or null: its api.js and its challenge frame. */
function turnstileClassifyUrl(requestUrl) {
    let parsed;
    try { parsed = new URL(requestUrl); } catch (_) { return null; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;
    if (!TURNSTILE_HOSTS.includes(host)) return null;
    if (/^\/turnstile\/v0\/(?:b\/[0-9a-f]+\/)?api\.js$/.test(path)) return 'api';
    if (path.includes('/turnstile/')) return 'frame';
    return null;
}

Logger.network('[Turnstile] Interceptor loaded');
