/** Common bounded network observation for vendor script analyzers. */
(function (global) {
    const SKIPPED_RESOURCE_TYPES = new Set(['image', 'imageset', 'stylesheet', 'font', 'media']);
    const ANALYSIS_LIMIT_MS = 30000;
    function start({ tabId, url, vendorId, requestId, classify }) {
        const captured = new Map();
        const { job, reused } = AdvancedJobManager.begin({ tabId, url, vendorId, requestId,
            operation: 'analysis',
            async onFinish(result) {
                const scripts = Array.from(captured.values());
                const data = { scripts, scriptCount: scripts.length };
                const message = { ...result, type: `${vendorId.toUpperCase()}_ANALYSIS_RESULT`, data };
                if (result.status === 'completed') {
                    try { await saveToHistory(tabId, AdvancedResultModel.create({ vendorId,
                        operation: 'analysis', data, id: result.requestId }), {
                        type: vendorId, id: result.requestId, expiryMinutes: 30
                    }); } catch (error) {
                        message.status = 'error';
                        message.error = error.message;
                    }
                }
                try { await chrome.runtime.sendMessage(message); } catch (_) { /* Reopening reads worker history. */ }
            }
        });
        if (reused) return { ...AdvancedJobManager.snapshot(job), status: 'started', reused: true };
        // A page that reloaded but never fires load (slow ads, long polling) still
        // reports what it loaded by the limit. No reload at all is a timeout.
        let reloaded = false;
        job.setTimer(() => job.finish(reloaded ? 'completed' : 'timeout'), ANALYSIS_LIMIT_MS);
        const requestListener = details => {
            if (job.finished || details.tabId !== tabId) return;
            if (details.type === 'main_frame') reloaded = true;
            // Images, fonts, CSS and media are never the scripts this lists, and the
            // page itself is not one of its scripts (on a vendor's own site it matches)
            if (SKIPPED_RESOURCE_TYPES.has(details.type) || details.type === 'main_frame') return;
            const type = classify(details.url, details);
            if (type) captured.set(details.url, { url: details.url, type, resourceType: details.type || '', source: 'network' });
        };
        let observationStarted = false;
        const navigationListener = details => {
            if (job.finished || observationStarted || details.tabId !== tabId || details.frameId !== 0) return;
            observationStarted = true;
            job.setTimer(() => job.finish('completed'), 5000);
        };
        try {
            chrome.webRequest.onBeforeRequest.addListener(requestListener, { urls: ['<all_urls>'], tabId }, []);
            job.addCleanup(() => chrome.webRequest.onBeforeRequest.removeListener(requestListener));
            chrome.webNavigation.onCompleted.addListener(navigationListener);
            job.addCleanup(() => chrome.webNavigation.onCompleted.removeListener(navigationListener));
        } catch (error) {
            job.finish('failed');
            return { ...AdvancedJobManager.snapshot(job), status: 'error', error: error.message };
        }
        return { ...AdvancedJobManager.snapshot(job), status: 'started' };
    }
    // Each vendor's own classifier (declared by its interceptor, loaded after this file); the data-described CAPTCHA
    // vendors classify through their scripts list
    const CLASSIFIERS = Object.freeze({ awswaf: 'awsWafClassifyUrl', cloudflare: 'cloudflareClassifyUrl', datadome: 'datadomeClassifyUrl',
        funcaptcha: 'funcaptchaClassifyUrl', hcaptcha: 'hcaptchaClassifyUrl', turnstile: 'turnstileClassifyUrl' });
    function classifierFor(vendorId) {
        const named = CLASSIFIERS[vendorId];
        if (named && typeof global[named] === 'function') return global[named];
        const captcha = global.AdvancedCaptchaVendors;
        const vendor = captcha && Array.isArray(captcha.list) ? captcha.list.find(entry => entry.vendorId === vendorId && Array.isArray(entry.scripts)) : null;
        return vendor ? (url => captcha.classify(vendor, url)) : null;
    }
    // Resource Timing names what loaded each request; the same kinds webRequest reports
    const INITIATOR_TYPES = Object.freeze({ script: 'script', xmlhttprequest: 'xmlhttprequest', fetch: 'fetch', iframe: 'sub_frame', beacon: 'ping', other: 'other' });

    /**
     * The vendor's scripts among what the page has already loaded: the requests the worker recorded for the tab
     * (none for a page served from the scan cache) and the page's own Resource Timing list and script tags, in every
     * frame. Nothing is reloaded, so the popup stays open; an empty answer means only a reload can tell.
     * @returns {Promise<Array<{url, type, resourceType, source}>|null>} null for a vendor without a classifier
     */
    async function fromLoadedPage({ tabId, vendorId }) {
        const classify = classifierFor(vendorId);
        if (!classify) return null;
        const seen = new Map();
        const add = (url, type) => {
            if (typeof url !== 'string' || !/^https?:/i.test(url) || seen.has(url)) return;
            if (SKIPPED_RESOURCE_TYPES.has(type) || type === 'main_frame') return;
            seen.set(url, type || '');
        };
        // The page's own list first: the worker also records the content script's fetches of script sources (as
        // xhr), which would name a script tag's file a request
        try {
            const frames = await chrome.scripting.executeScript({
                target: { tabId, allFrames: true },
                func: () => [
                    ...performance.getEntriesByType('resource').map(entry => [entry.name, entry.initiatorType]),
                    ...Array.from(document.scripts, script => [script.src, 'script'])
                ]
            });
            for (const frame of frames || []) {
                for (const [url, initiator] of Array.isArray(frame && frame.result) ? frame.result : []) {
                    if (INITIATOR_TYPES[initiator]) add(url, INITIATOR_TYPES[initiator]);
                }
            }
        } catch (_) { /* A page the extension cannot script (the Web Store, a PDF): what the worker recorded */ }
        const recorded = typeof networkUrlsStore !== 'undefined' ? networkUrlsStore.get(tabId) : null;
        for (const entry of Array.isArray(recorded) ? recorded : []) add(entry && entry.url, entry && entry.type);
        const scripts = [];
        for (const [url, resourceType] of seen) {
            let type = null;
            try { type = classify(url, { url, type: resourceType, tabId }); } catch (_) { type = null; }
            if (type) scripts.push({ url, type, resourceType, source: 'page' });
        }
        return scripts;
    }

    // Vendors whose Analyze Scripts result is their own shape (GeeTest's keys, Imperva's script paths and cookies, Shape's
    // init and seed scripts): each interceptor reads the loaded page itself and answers { data, found }
    const READERS = Object.freeze({ geetest: 'geetestFromLoadedPage', imperva: 'impervaFromLoadedPage',
        shapesecurity: 'shapeSecurityFromLoadedPage' });
    function readerFor(vendorId) {
        const name = READERS[vendorId];
        return name && typeof global[name] === 'function' ? global[name] : null;
    }

    global.AdvancedScriptAnalysis = Object.freeze({ start, fromLoadedPage, classifierFor, readerFor });
})(globalThis);
