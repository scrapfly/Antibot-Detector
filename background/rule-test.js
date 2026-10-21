/**
 * Rule editor → "Test on this page" (worker only; the rules of what a page can answer are in modules/core/rule-test.js).
 *
 * The popup sends the rule as the form has it (unsaved edits included). The worker asks the content script of the tab for
 * the page as it is right now (the collector a scan uses, handed back instead of scanned), adds the cookies Chrome holds
 * for it and the requests the worker still knows of, and runs the engine on that: once per testable pattern on its own,
 * and once for the whole rule. Nothing is stored and no scan result, History entry or webhook comes of it; the reply
 * names patterns and counts, never a matched value.
 */
const RuleTestRuntime = {
    COLLECT_TIMEOUT_MS: 25000,
    MAX_RULE_BYTES: 400000,

    /** The rule as the engine reads it, or null when the request is not a rule. Nothing but data survives. */
    cleanRule(raw) {
        if (!raw || typeof raw !== 'object' || !raw.detection || typeof raw.detection !== 'object' || Array.isArray(raw.detection)) return null;
        let copy;
        try {
            const text = JSON.stringify({
                id: raw.id, name: raw.name, category: raw.category, difficulty: raw.difficulty,
                detection: raw.detection, combinations: Array.isArray(raw.combinations) ? raw.combinations : undefined
            });
            if (text.length > this.MAX_RULE_BYTES) return null;
            copy = JSON.parse(text);
        } catch (_) {
            return null;
        }
        copy.id = String(copy.id || 'rule-test');
        copy.name = String(copy.name || 'Rule test');
        copy.category = String(copy.category || 'antibot');
        copy.enabled = true;
        return copy;
    },

    async resolveTab(request) {
        try {
            const wanted = request && Number.isInteger(request.tabId) ? request.tabId : null;
            if (wanted !== null) return await chrome.tabs.get(wanted);
            const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            return active || null;
        } catch (_) {
            return null; // a tab that is gone, or an id Chrome refuses
        }
    },

    /**
     * The page as the content script collects it for a scan, with the rule added to what it collects for (the DOM
     * elements and the kinds of data it gathers depend on the rules loaded); rejects when the tab has no content script
     * or is too slow.
     */
    async collect(tabId, rule) {
        let timer;
        const slow = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), this.COLLECT_TIMEOUT_MS); });
        try {
            const reply = await Promise.race([chrome.tabs.sendMessage(tabId, { type: WorkerMessages.RULE_TEST_COLLECT, detector: rule }), slow]);
            if (!reply || reply.status !== 'ok' || !reply.data || typeof reply.data !== 'object') throw new Error('unavailable');
            return reply.data;
        } finally {
            clearTimeout(timer);
        }
    },

    /** What the engine's runDetector() reads: the collected page plus what only the worker knows (cookies, requests). */
    async assemble(tab, data) {
        const list = (value) => (Array.isArray(value) ? value : []);
        let allCookies = [];
        try {
            const cookies = await PageCookies.getAll({ url: tab.url }, tab.id);
            allCookies = cookies.map((cookie) => ({
                name: cookie.name, value: String(cookie.value || '').substring(0, Constants.COOKIE_VALUE_MAX_LENGTH),
                domain: cookie.domain, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite
            }));
        } catch (_) { /* the cookies the page itself can read are still in data.cookies */ }
        const requests = typeof networkUrlsStore !== 'undefined' && networkUrlsStore.has(tab.id) ? networkUrlsStore.get(tab.id) : [];
        return {
            url: data.url || tab.url, content: list(data.content), dom: list(data.dom), cookies: list(data.cookies), allCookies,
            pageHTML: typeof data.pageHTML === 'string' ? data.pageHTML : '', externalContent: list(data.externalContent),
            networkUrls: list(requests).slice(), headers: {}, requestHeaders: {}, responseCookies: [], payloads: [], responses: []
        };
    },

    /**
     * @param {{detector: object, tabId?: number}} request
     * @returns {Promise<object>} { status: 'ok', host, rows, untested, verdict, page } or { status: 'unsupported' | 'unreachable' | 'error' }
     */
    async run(request) {
        const rule = this.cleanRule(request && request.detector);
        if (!rule) return { status: 'error' };
        const tab = await this.resolveTab(request);
        if (!tab || !Utils.isValidContentScriptTab(tab)) return { status: 'unsupported' };
        let data;
        try {
            data = await this.collect(tab.id, rule);
        } catch (_) {
            return { status: 'unreachable' };
        }
        const pageData = await this.assemble(tab, data);
        const engine = new DetectionEngineManager();
        const counts = RuleTest.probes(rule).map(({ method, index, probe }) => ({ method, index, count: engine.runDetector(probe, pageData).matches.length }));
        const whole = engine.runDetector(rule, pageData);
        const answer = RuleTest.answer(rule, counts, { confidence: whole.confidence, partial: whole.partial, combinations: whole.combinations });
        let host = '';
        try { host = new URL(tab.url).hostname; } catch (_) { /* leave empty */ }
        return {
            status: 'ok', host, ...answer,
            page: { scripts: pageData.content.length, elements: pageData.dom.length, cookies: (pageData.allCookies.length || pageData.cookies.length), requests: pageData.networkUrls.length }
        };
    }
};

if (typeof self !== 'undefined') self.RuleTestRuntime = RuleTestRuntime;
if (typeof module !== 'undefined' && module.exports) module.exports = RuleTestRuntime;
