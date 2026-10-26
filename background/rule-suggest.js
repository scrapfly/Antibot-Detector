/**
 * Rules → "From this page" (worker only; what becomes a candidate and a rule is decided in modules/core/rule-suggest.js).
 *
 * Answers the popup with what the page in the tab is made of, read from what the extension already holds: the cookies
 * Chrome keeps for it (and the ones its response set), the scripts it loaded (AdvancedScriptAnalysis.loadedUrls, the
 * list Analyze Scripts reads) and the response headers of its document, when the worker captured them for this host
 * (a page served from the scan cache has none until it is reloaded). Nothing is stored, and nothing is reloaded.
 */
const RuleSuggestRuntime = {
    MAX_COOKIES: 200,
    MAX_SCRIPTS: 300,
    MAX_HEADERS: 100,
    HEADER_VALUE_MAX_LENGTH: 300,

    cut(value, max) {
        return String(value == null ? '' : value).substring(0, max);
    },

    async cookiesOf(tab, host) {
        const seen = new Map();
        try {
            for (const cookie of await PageCookies.getAll({ url: tab.url }, tab.id)) {
                if (cookie && cookie.name && !seen.has(cookie.name)) seen.set(cookie.name, this.cut(cookie.value, Constants.COOKIE_VALUE_MAX_LENGTH));
            }
        } catch (_) { /* no cookie access for this page: the cookies its response set are still listed */ }
        const set = typeof responseCookiesStore !== 'undefined' ? responseCookiesStore.get(tab.id) : null;
        if (set && capturedForHost(set, host)) {
            for (const cookie of Array.isArray(set.cookies) ? set.cookies : []) {
                if (cookie && cookie.name && !seen.has(cookie.name)) seen.set(cookie.name, this.cut(cookie.value, Constants.COOKIE_VALUE_MAX_LENGTH));
            }
        }
        return Array.from(seen, ([name, value]) => ({ name, value })).slice(0, this.MAX_COOKIES);
    },

    async scriptsOf(tab) {
        try {
            const loaded = await AdvancedScriptAnalysis.loadedUrls(tab.id);
            return Array.from(loaded).filter(([, type]) => type === 'script').map(([url]) => url).slice(0, this.MAX_SCRIPTS);
        } catch (_) {
            return [];
        }
    },

    headersOf(tab, host) {
        const captured = typeof headersStore !== 'undefined' ? headersStore.get(tab.id) : null;
        if (!captured || !capturedForHost(captured, host) || !captured.headers || typeof captured.headers !== 'object') return {};
        const headers = {};
        for (const [name, value] of Object.entries(captured.headers).slice(0, this.MAX_HEADERS)) {
            headers[name] = this.cut(value, this.HEADER_VALUE_MAX_LENGTH);
        }
        return headers;
    },

    /**
     * @param {{tabId?: number}} request
     * @returns {Promise<object>} { status: 'ok', url, host, cookies, scripts, headers } or { status: 'unsupported' }
     */
    async collect(request) {
        const tab = await RuleTestRuntime.resolveTab(request);
        if (!tab || !Utils.isValidContentScriptTab(tab) || !/^https?:\/\//i.test(tab.url)) return { status: 'unsupported' };
        let host = '';
        try { host = new URL(tab.url).hostname; } catch (_) { return { status: 'unsupported' }; }
        const [cookies, scripts] = await Promise.all([this.cookiesOf(tab, host), this.scriptsOf(tab)]);
        return { status: 'ok', url: tab.url, host, cookies, scripts, headers: this.headersOf(tab, host) };
    }
};

if (typeof self !== 'undefined') self.RuleSuggestRuntime = RuleSuggestRuntime;
if (typeof module !== 'undefined' && module.exports) module.exports = RuleSuggestRuntime;
