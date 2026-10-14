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
    return AdvancedScriptAnalysis.start({ tabId, url, requestId, vendorId: 'cloudflare', classify: cloudflareClassifyUrl });
}

const CLOUDFLARE_CHALLENGE_HOSTS = ['challenges.cloudflare.com', 'challenges.cloudflare-cn.com', 'challenges.fed.cloudflare.com'];

/**
 * Which Cloudflare request a URL is, or null. Labels stay the stored English
 * values (CloudflareAdvanced.cloudflareTypeLabel translates them).
 */
function cloudflareClassifyUrl(requestUrl) {
    let parsed;
    try { parsed = new URL(requestUrl); } catch (_) { return null; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;
    if (CLOUDFLARE_CHALLENGE_HOSTS.includes(host)) return path.includes('/turnstile/') ? 'Turnstile' : 'Challenge';
    if (host === 'cloudflareinsights.com' || host.endsWith('.cloudflareinsights.com')) return 'Analytics';
    // The site's own /cdn-cgi/ paths
    if (path.startsWith('/cdn-cgi/challenge-platform/scripts/jsd/')) return 'Bot Management';
    if (path.startsWith('/cdn-cgi/challenge-platform/')) return path.includes('/turnstile/') ? 'Turnstile' : 'Challenge';
    if (path.startsWith('/cdn-cgi/bm/cv')) return 'Bot Management';
    if (path.startsWith('/cdn-cgi/scripts/')) return 'CDN';
    return null;
}

Logger.network('[Cloudflare] Interceptor loaded successfully');
