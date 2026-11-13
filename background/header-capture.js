/**
 * HTTP header, cookie, payload, and network URL capture via webRequest API.
 * Stores captured data in TTLMap stores for use by the detection engine.
 */

// Wrap a webRequest listener so an unexpected throw is logged instead of
// becoming an unhandled service-worker rejection (which Chrome drops silently
// and which can destabilize the worker).
function safeWebRequestListener(fn) {
    return async (details) => {
        try {
            return await fn(details);
        } catch (error) {
            Logger.error('NETWORK', '[headerCapture] webRequest listener failed:', error);
        }
    };
}

// Request types that carry vendor SDKs and challenge/API calls. When a tab's
// list is full, other entries (images, pings, frames…) are dropped first.
const NETWORK_URL_KEEP_TYPES = new Set(['main_frame', 'script', 'xmlhttprequest', 'fetch', 'websocket']);

/**
 * Add one request to a tab's URL list. Repeats of the same URL and method are
 * stored once (trackers fire the same beacon dozens of times), and at the cap
 * the oldest low-value entry goes first: security SDKs load early, so a plain
 * first-in-first-out cap evicted exactly the scripts URL rules look for.
 * @returns {Array} the same list
 */
function recordNetworkUrl(list, entry, cap) {
    if (list.some(item => item.url === entry.url && item.method === entry.method)) return list;
    list.push(entry);
    if (list.length > cap) {
        const dropAt = list.findIndex(item => !NETWORK_URL_KEEP_TYPES.has(item.type));
        list.splice(dropAt === -1 ? 0 : dropAt, 1);
    }
    return list;
}

/**
 * The tab a service-worker request belongs to. A site's own service worker
 * (PWAs, offline caches) can make the page's requests itself, and Chrome
 * reports those with tabId -1: such a request is given to the tab being
 * scanned on the same origin, when exactly one is.
 * @returns {number} the tab id, or -1
 */
function tabOfWorkerRequest(details) {
    const origin = details && details.initiator;
    if (!origin || typeof detectionStates === 'undefined') return -1;
    let found = -1;
    for (const [tabId, state] of detectionStates.entries()) {
        let stateOrigin = '';
        try { stateOrigin = new URL(state && state.url).origin; } catch (_) { continue; }
        if (stateOrigin !== origin) continue;
        if (found !== -1) return -1; // two scans on this origin: not ours to guess
        found = tabId;
    }
    return found;
}

// ─── Which pages capture anything ───────────────────────────────────────────────────────────────────────────

/**
 * What the capture below may keep of each tab's page. A page the scan is refused for (a skipped site, or a site left out of "only
 * these sites") leaves nothing in the stores either: its response headers and Set-Cookie, its request headers (Cookie and
 * Authorization among them), its POST bodies and the addresses of its requests were read for every page and held for five
 * minutes, scan or no scan. The question is the one that refuses the scan (Utils.isUrlBlacklisted, which reads ScanScope), asked
 * with failClosed: settings that cannot be read are not "no site is skipped", so such a page captures nothing.
 *
 * The answer is settled when the page starts loading, from its main-frame request (each hop of a redirect: the last one is the
 * page), and shared by everything the page makes, because the address of a request is not the page's. Per tab: { url, open }, where
 * `open` is the promise of the answer. A change made while the page is open applies from the next page load.
 */
const tabCaptureScopes = new Map();

/** May the page at this address capture? false when the scan is refused for it, or the settings cannot be read. Never rejects. */
function captureOpenFor(url) {
    try {
        return Promise.resolve(Utils.isUrlBlacklisted(url, { failClosed: true })).then((refused) => refused !== true, () => false);
    } catch (_) {
        return Promise.resolve(false);
    }
}

/**
 * Sets what the tab's page is judged by, unless the extension is off: nothing is captured then, and nothing is read to find out
 * which page would. Switched on again while the page stays, its requests are judged by the tab's own address (captureScopeOfTab).
 */
function setCaptureScope(tabId, url) {
    if (typeof cachedEnabledState !== 'undefined' && cachedEnabledState.value === false) {
        tabCaptureScopes.delete(tabId);
        return;
    }
    tabCaptureScopes.set(tabId, { url, open: captureOpenFor(url) });
}

/** A top-level page starts loading in the tab (each hop of a redirect): from now on its requests are judged by this address. */
function noteCaptureScope(details) {
    if (!details || typeof details.tabId !== 'number' || details.tabId < 0 || typeof details.url !== 'string') return;
    setCaptureScope(details.tabId, details.url);
}

/** The page committed. One that sent no main-frame request (restored from the back/forward cache) is judged by the address that committed. */
function noteCommittedScope(details) {
    if (!details || typeof details.tabId !== 'number' || typeof details.url !== 'string' || !details.url) return;
    const scope = tabCaptureScopes.get(details.tabId);
    // The address that commits may carry a fragment its request did not
    if (scope && scope.url.split('#')[0] === details.url.split('#')[0]) return;
    setCaptureScope(details.tabId, details.url);
}

/**
 * The page a tab shows when this worker saw no page start in it (the worker restarted while the page stayed, or the tab was open
 * before the extension): judged once, by the tab's own address. A tab that cannot be read is not remembered as skipped: the next
 * request asks again.
 */
function captureScopeOfTab(tabId) {
    const known = tabCaptureScopes.get(tabId);
    if (known) return known;
    const scope = { url: '', open: null };
    scope.open = Promise.resolve()
        .then(() => chrome.tabs.get(tabId))
        .then((tab) => (tab && typeof tab.url === 'string' ? tab.url : ''), () => '')
        .then((url) => {
            if (!url) {
                if (tabCaptureScopes.get(tabId) === scope) tabCaptureScopes.delete(tabId);
                return false;
            }
            scope.url = url;
            return captureOpenFor(url);
        });
    tabCaptureScopes.set(tabId, scope);
    return scope;
}

/**
 * May this request be recorded? The page's own request (main frame) is judged by its own address: the tab's page may already be
 * the next hop of a redirect. Everything else the tab makes is judged by the page. A request that belongs to no tab has no page.
 * @returns {boolean|Promise<boolean>}
 */
function captureOpen(details, tabId = details.tabId) {
    if (typeof tabId !== 'number' || tabId < 0) return true;
    if (details.type === 'main_frame') {
        const scope = tabCaptureScopes.get(tabId);
        return scope && scope.url === details.url ? scope.open : captureOpenFor(details.url);
    }
    return captureScopeOfTab(tabId).open;
}

// The top-level request each tab is loading: its redirects reuse the request id and keep what was recorded
const tabPageRequests = new Map();

/**
 * A request made for a page Chrome is prerendering (speculation rules) is not the visible page's: recorded
 * under the tab's id, it replaced the shown page's headers and cleared its captured data. Pages the person
 * has not opened are left alone; once activated, the content script asks for their result.
 */
function isPrerenderRequest(details) {
    return !!details && details.documentLifecycle === 'prerender';
}

// The page each tab shows (its main frame's document), and the one it is leaving once a new page starts loading
const tabDocuments = new Map();
const leavingDocuments = new Map();

/**
 * A request that belongs to the page the tab is leaving: its unload beacons and last analytics are sent after the new
 * page's own request started (and after its stores were cleared), and were credited to the new page. Chrome marks an
 * unloading document 'pending_deletion'; before the new page commits, the old one is still 'active', so it is known
 * by its id (and its frames by their parent's).
 */
function isLeavingPageRequest(details) {
    if (!details) return false;
    if (details.documentLifecycle === 'pending_deletion') return true;
    const left = leavingDocuments.get(details.tabId);
    return !!left && (details.documentId === left || details.parentDocumentId === left);
}

/** Requests that are not the shown page's: a prerendered page's, or the page being left's. */
function isOtherPageRequest(details) {
    if (isPrerenderRequest(details) || isLeavingPageRequest(details)) return true;
    // The main frame's document as its own requests name it
    if (details && details.frameId === 0 && details.documentId && details.documentLifecycle === 'active' && details.type !== 'main_frame') {
        tabDocuments.set(details.tabId, details.documentId);
    }
    return false;
}

/**
 * A new page starts loading in the tab: from now on the document it showed is the one being left. `shownDocumentId` is
 * the page that is being shown when the caller already knows it (a prerendered page just activated): the tab may
 * already name it after a request of its own, and it is not the page being left.
 */
function noteTabLeaving(tabId, shownDocumentId) {
    const shown = tabDocuments.get(tabId);
    if (shown && shown === shownDocumentId) return;
    if (shown) leavingDocuments.set(tabId, shown);
    tabDocuments.delete(tabId);
}

// Main-frame navigations started and not yet over, per tab: a second navigation supersedes the first, whose
// "cancelled" event must not end the mark that protects the second
const pendingNavigations = new Map();

// The document each tab shows and the main-frame request that loaded it ({ documentId, requestId, url }): what ties a page
// to its own HTTP status (pageHttpStatus)
const committedPages = new Map();

/**
 * The HTTP status of the page a document shows: the status code of the main-frame response that loaded that very document
 * (the last hop of its redirects, the one recorded last), or null. The tab's last response is not always the document's: a
 * page its service worker answered, or one restored from the back/forward cache, made no request of its own (Chrome reports
 * none), a prerendered page's request is not recorded, and a load that failed, was cancelled or answered 204 committed no
 * document. Those show no status rather than another page's.
 */
function pageHttpStatus(tabId, documentId) {
    const committed = committedPages.get(tabId);
    if (!committed || !documentId || committed.documentId !== documentId) return null;
    const response = headersStore.get(tabId);
    if (!response || response.requestId === undefined || response.requestId !== committed.requestId) return null;
    const withoutFragment = (url) => String(url || '').split('#')[0];
    if (withoutFragment(response.url) !== withoutFragment(committed.url)) return null;
    return HttpStatus.of(response.statusCode);
}

/** A main-frame navigation starts (not a redirect of one). */
function navigationStarted(tabId) {
    noteTabLeaving(tabId);
    shownPrerenders.delete(tabId);
    pendingNavigations.set(tabId, (pendingNavigations.get(tabId) || 0) + 1);
}

/**
 * A main-frame navigation ended without showing a new page (a download, a 204, a cancelled, superseded or failed load):
 * once none is left pending, the page that was being left is the shown page again. Kept as "the page being left", it
 * dropped every later request of a page that stayed, and a later real navigation did not know which page it left.
 */
function navigationFailed(tabId) {
    if (typeof tabId !== 'number') return;
    const left = (pendingNavigations.get(tabId) || 0) - 1;
    if (left > 0) { pendingNavigations.set(tabId, left); return; }
    pendingNavigations.delete(tabId);
    // The page being left is the shown page again, whatever the failed request was: the tab's own address says what it is
    tabCaptureScopes.delete(tabId);
    const gone = leavingDocuments.get(tabId);
    leavingDocuments.delete(tabId);
    if (gone && !tabDocuments.has(tabId)) tabDocuments.set(tabId, gone);
}

/**
 * The new page committed: the old document is unloading and Chrome marks it itself, so the mark ends, and the tab shows
 * the committed document (also a page restored from the back/forward cache). A commit of the left document itself
 * (a same-document change while another navigation is pending) or of a prerendered page is not the new page.
 */
function navigationCommitted(details) {
    if (!details || typeof details.tabId !== 'number' || details.documentLifecycle === 'prerender') return;
    const left = leavingDocuments.get(details.tabId);
    if (left && details.documentId === left) return;
    // A load was pending: its main-frame request made this document. With none (a page the site's service worker answered,
    // one restored from the back/forward cache) the document has no response of its own here
    if (pendingNavigations.has(details.tabId)) committedPages.set(details.tabId, { documentId: details.documentId, requestId: tabPageRequests.get(details.tabId), url: details.url });
    else committedPages.delete(details.tabId);
    pendingNavigations.delete(details.tabId);
    leavingDocuments.delete(details.tabId);
    if (details.documentId) tabDocuments.set(details.tabId, details.documentId);
    noteCommittedScope(details);
    // A page shown with its capture refused is remembered by its document: a scan of it without a reload would be incomplete
    // (background/uncaptured-pages.js). With the extension off there is no verdict, and no content script to scan the page either
    const scope = tabCaptureScopes.get(details.tabId);
    if (scope && typeof UncapturedPages !== 'undefined') UncapturedPages.noteCommit(details.tabId, details.documentId, scope.open);
}

/**
 * A tab starting a new page forgets what the page before sent and received: its requests and request
 * bodies (what it fetched after its scan, late analytics or a challenge it solved, belongs to it, not to the
 * next page), its response headers and cookies, and its captured responses. Kept until then, a scan of the
 * same page without a reload (the popup asking again once the cached result expired) still has them.
 */
function forgetTabRequests(tabId, requestId) {
    if (typeof tabId !== 'number' || tabId < 0) return;
    if (requestId !== undefined && tabPageRequests.get(tabId) === requestId) return; // a redirect of the same load
    if (requestId === undefined) {
        tabPageRequests.delete(tabId);
        // A page that no request of this tab loaded (a prerendered page just activated): the tab's own address says what it is
        tabCaptureScopes.delete(tabId);
    } else {
        tabPageRequests.set(tabId, requestId);
    }
    // "This tab shows a cached result" belonged to the page before: the new page's own response headers and
    // Set-Cookie arrive before it commits (and before its content script asks the cache), so a flag left over
    // until the address changed dropped them. A cache hit on the new page sets it again.
    if (typeof tabsUsingCache !== 'undefined') tabsUsingCache.delete(tabId);
    for (const store of [payloadStore, networkUrlsStore, headersStore, requestHeadersStore, responseCookiesStore]) store.delete(tabId);
    if (typeof responseStore !== 'undefined') responseStore.delete(tabId);
    // The finished scan of the page before takes no more late requests (detection-lifecycle.js)
    if (typeof forgetFinishedPage === 'function') forgetFinishedPage(tabId);
}

/**
 * A request body as payload rules read it, at most `limit` characters (the same limit as a captured response):
 * an upload of several megabytes was decoded whole and held per tab, then matched by every payload rule.
 * @returns {{payloadData: (string|Object|null), payloadType: string}}
 */
function readRequestBody(requestBody, limit) {
    if (!requestBody) return { payloadData: null, payloadType: 'unknown' };
    if (requestBody.formData) {
        const formData = {};
        let left = limit;
        for (const [name, values] of Object.entries(requestBody.formData)) {
            if (left <= 0) break;
            formData[name] = (Array.isArray(values) ? values : [values]).map(value => {
                const text = String(value).slice(0, Math.max(0, left));
                left -= text.length;
                return text;
            });
        }
        return { payloadData: formData, payloadType: 'formData' };
    }
    if (Array.isArray(requestBody.raw) && requestBody.raw.length > 0) {
        const decoder = new TextDecoder('utf-8');
        let text = '';
        for (const item of requestBody.raw) {
            if (text.length >= limit) break;
            if (!item || !item.bytes) continue;
            // UTF-8 never takes more than four bytes per character, so this many bytes always fill the limit
            const bytes = new Uint8Array(item.bytes, 0, Math.min(item.bytes.byteLength, (limit - text.length) * 4));
            text += decoder.decode(bytes);
        }
        return { payloadData: text.slice(0, limit), payloadType: 'raw' };
    }
    return { payloadData: null, payloadType: 'unknown' };
}

/** A main-frame response's headers by lower-case name, and the cookies its Set-Cookie headers set ({ name, value }). */
function readResponseHeaders(responseHeaders) {
    const headers = {};
    const cookies = [];
    for (const header of responseHeaders || []) {
        const headerName = header.name.toLowerCase();
        headers[headerName] = header.value;
        if (headerName === 'set-cookie') {
            const cookieParts = String(header.value).split(';')[0].split('=');
            if (cookieParts.length >= 2) {
                cookies.push({ name: cookieParts[0].trim(), value: cookieParts.slice(1).join('=').trim() });
            }
        }
    }
    return { headers, cookies };
}

// ─── Pages Chrome prerenders ────────────────────────────────────────────────────────────────────────────────

/**
 * A page Chrome prerenders (speculation rules, the address bar guessing the next page) loads under the tab's id before it is
 * the tab's page: its main-frame request is not the shown page's (isPrerenderRequest), and once the page was shown it had no
 * request of its own in the tab, so its scan read no response headers, no Set-Cookie, no request headers and no HTTP status.
 * Its main-frame request and response are kept aside here, per tab, until the page is shown (activatePrerenderedPage) or
 * given up: at most PRERENDER_PAGES_PER_TAB pages per tab, each for PRERENDER_PAGE_TTL_MS, forgotten with the tab. A page the
 * scan is refused for (a skipped site, or settings that cannot be read) keeps nothing, as when it loads in the tab, and with
 * the extension off nothing is kept.
 *
 * Per tab, a list of { requestId, frameId, documentId, response, request, cookies, timestamp }: the request id ties the hops
 * of a redirect together (the last one recorded is the page), the frame id ties the request to the document Chrome commits
 * for it (notePrerenderCommit), and the document is how the page that is shown names itself.
 */
const PRERENDER_PAGES_PER_TAB = 4;
const PRERENDER_PAGE_TTL_MS = 5 * 60 * 1000;
const prerenderPages = new Map();
// The prerendered document each tab has shown since its last page load: its load notice finds the tab already set up for it
const shownPrerenders = new Map();

/** The kept entry of a prerendered page's main-frame request (a new one for a new request), with the tab's stale ones gone. */
function prerenderPageEntry(details) {
    const now = Date.now();
    const list = (prerenderPages.get(details.tabId) || []).filter(entry => now - entry.timestamp < PRERENDER_PAGE_TTL_MS);
    let entry = list.find(item => item.requestId === details.requestId);
    if (!entry) {
        entry = { requestId: details.requestId, frameId: details.frameId, documentId: null };
        list.push(entry);
        while (list.length > PRERENDER_PAGES_PER_TAB) list.shift();
    }
    entry.timestamp = now;
    prerenderPages.set(details.tabId, list);
    return entry;
}

/**
 * Keep a prerendered page's main-frame response headers (onHeadersReceived) or request headers (onBeforeSendHeaders) aside,
 * judged like the page's own load: the extension on, and the page's address one the scan is not refused for.
 * @returns {Promise<boolean>} whether anything was kept
 */
async function keepPrerenderMainFrame(details) {
    if (!isPrerenderRequest(details) || details.type !== 'main_frame' || typeof details.tabId !== 'number' || details.tabId < 0) return false;
    if (!details.responseHeaders && !details.requestHeaders) return false;
    if (!await isExtensionEnabled()) return false;
    if (!await captureOpenFor(details.url)) return false;
    const entry = prerenderPageEntry(details);
    const timestamp = Date.now();
    if (details.responseHeaders) {
        const { headers, cookies } = readResponseHeaders(details.responseHeaders);
        entry.response = { url: details.url, headers, statusCode: details.statusCode, requestId: details.requestId, timestamp };
        // Each hop answers for itself: a redirect's Set-Cookie is not the page's
        entry.cookies = cookies.length ? { url: details.url, cookies, timestamp } : null;
    }
    if (details.requestHeaders) {
        const headers = {};
        for (const header of details.requestHeaders) headers[header.name.toLowerCase()] = header.value;
        entry.request = { url: details.url, headers, timestamp };
    }
    return true;
}

/** Chrome committed the prerendered document of a kept request (onCommitted in its own frame): the page is known by it now. */
function notePrerenderCommit(details) {
    if (!details || details.documentLifecycle !== 'prerender' || !details.documentId) return;
    const list = prerenderPages.get(details.tabId);
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].frameId === details.frameId && !list[i].documentId) { list[i].documentId = details.documentId; return; }
    }
}

/** The tab is gone: what it kept of pages it prerendered goes with it. */
function forgetPrerenderPages(tabId) {
    prerenderPages.delete(tabId);
    shownPrerenders.delete(tabId);
}

/**
 * A page Chrome prerendered is now the tab's page (the content script says so as soon as it is shown: PRERENDER_SHOWN). What
 * the tab captured is still the page before's, maybe another site, and goes; the page is no longer the one being left; and
 * what was kept of its own load becomes the tab's, as if it had loaded here: response headers with its HTTP status, Set-Cookie
 * and request headers. The page is found by its document, or, when Chrome did not report the commit, by its address (without
 * the fragment). The tab's other prerendered pages were not shown and are dropped.
 * @returns {boolean} whether the page's own load was found
 */
function activatePrerenderedPage(tabId, url, documentId) {
    if (typeof tabId !== 'number' || tabId < 0) return false;
    noteTabLeaving(tabId, documentId);
    forgetTabRequests(tabId);
    if (documentId) {
        shownPrerenders.set(tabId, documentId);
        tabDocuments.set(tabId, documentId);
    }
    // The shown page is judged by its own address from now on, and, as a page that commits in the tab (navigationCommitted,
    // which leaves prerendered documents out), remembered when its capture was refused: nothing of its load was kept
    // (keepPrerenderMainFrame), so a scan of it in place once its site is scanned again would be incomplete. With the
    // extension off there is no verdict (setCaptureScope)
    setCaptureScope(tabId, url);
    const scope = tabCaptureScopes.get(tabId);
    if (scope && documentId && typeof UncapturedPages !== 'undefined') UncapturedPages.noteCommit(tabId, documentId, scope.open);
    const now = Date.now();
    const list = (prerenderPages.get(tabId) || []).filter(entry => now - entry.timestamp < PRERENDER_PAGE_TTL_MS);
    prerenderPages.delete(tabId);
    const withoutFragment = (value) => String(value || '').split('#')[0];
    const addressOf = (entry) => (entry.response || entry.request || {}).url;
    const entry = (documentId && list.find(item => item.documentId === documentId)) ||
        list.slice().reverse().find(item => !item.documentId && withoutFragment(addressOf(item)) === withoutFragment(url));
    committedPages.delete(tabId);
    if (!entry) return false;
    if (entry.response) {
        headersStore.set(tabId, { ...entry.response });
        if (documentId) committedPages.set(tabId, { documentId, requestId: entry.requestId, url: entry.response.url });
    }
    if (entry.cookies) responseCookiesStore.set(tabId, { ...entry.cookies });
    if (entry.request) requestHeadersStore.set(tabId, { ...entry.request });
    return true;
}

/** Was this document's activation already handled (activatePrerenderedPage)? Its load notice then clears nothing again. */
function prerenderShownHandled(tabId, documentId) {
    return !!documentId && shownPrerenders.get(tabId) === documentId;
}

function setupHeaderCapture() {
    // Synchronous and registered first, so the new page's own request is recorded after the clear
    chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
            if (isPrerenderRequest(details)) return;
            if (tabPageRequests.get(details.tabId) !== details.requestId) navigationStarted(details.tabId); // not a redirect
            forgetTabRequests(details.tabId, details.requestId);
            // Whether this page captures anything starts here, before any request of it; the listeners below wait for the answer
            noteCaptureScope(details);
        },
        { urls: ['<all_urls>'], types: ['main_frame'] }
    );

    if (chrome.webNavigation) {
        // Frame 0 is the tab's page; a prerendered page commits in a frame of its own
        if (chrome.webNavigation.onCommitted) chrome.webNavigation.onCommitted.addListener((details) => { if (details && details.frameId === 0) navigationCommitted(details); else if (details && details.documentLifecycle === 'prerender') notePrerenderCommit(details); });
        if (chrome.webNavigation.onErrorOccurred) chrome.webNavigation.onErrorOccurred.addListener((details) => { if (details && details.frameId === 0) navigationFailed(details.tabId); });
    }
    if (chrome.tabs && chrome.tabs.onRemoved) chrome.tabs.onRemoved.addListener((tabId) => { tabCaptureScopes.delete(tabId); forgetPrerenderPages(tabId); });

    // Listen for response headers
    chrome.webRequest.onHeadersReceived.addListener(
        safeWebRequestListener(async (details) => {
            // A prerendered page's own response is kept aside until the page is shown
            if (isPrerenderRequest(details)) { await keepPrerenderMainFrame(details); return; }
            if (isOtherPageRequest(details)) return;
            // Skip if extension is disabled
            if (!await isExtensionEnabled()) {
                return;
            }

            // Skip header capture if tab has cache hit
            if (tabsUsingCache.has(details.tabId)) {
                return;
            }

            // Only capture headers for main frame requests
            if (details.type === 'main_frame' && details.responseHeaders) {
                // A page the scan is refused for (or whose settings cannot be read) keeps nothing
                if (!await captureOpen(details)) return;
                // Headers by name, and the cookies of its Set-Cookie headers
                const { headers, cookies: responseCookies } = readResponseHeaders(details.responseHeaders);

                headersStore.set(details.tabId, {
                    url: details.url,
                    headers: headers,
                    statusCode: details.statusCode, requestId: details.requestId, // the page's HTTP status: pageHttpStatus
                    timestamp: Date.now()
                });

                if (responseCookies.length > 0) {
                    responseCookiesStore.set(details.tabId, {
                        url: details.url,
                        cookies: responseCookies,
                        timestamp: Date.now()
                    });
                }
            }
        }),
        { urls: ["<all_urls>"] },
        // Chrome hides Set-Cookie from webRequest unless extraHeaders is
        // requested: without it the Set-Cookie parsing above never ran and
        // response-scope cookie rules could not match
        ["responseHeaders", "extraHeaders"]
    );

    // Listen for request headers
    chrome.webRequest.onBeforeSendHeaders.addListener(
        safeWebRequestListener(async (details) => {
            // A prerendered page's own request is kept aside until the page is shown
            if (isPrerenderRequest(details)) { await keepPrerenderMainFrame(details); return; }
            if (isOtherPageRequest(details)) return;
            // Skip if extension is disabled
            if (!await isExtensionEnabled()) {
                return;
            }

            // Skip header capture if tab has cache hit
            if (tabsUsingCache.has(details.tabId)) {
                return;
            }

            // Only capture headers for main frame requests
            if (details.type === 'main_frame' && details.requestHeaders) {
                if (!await captureOpen(details)) return;
                const headers = {};

                details.requestHeaders.forEach(header => {
                    headers[header.name.toLowerCase()] = header.value;
                });

                requestHeadersStore.set(details.tabId, {
                    url: details.url,
                    headers: headers,
                    timestamp: Date.now()
                });
            }
        }),
        { urls: ["<all_urls>"] },
        // extraHeaders exposes the Cookie request header as well
        ["requestHeaders", "extraHeaders"]
    );

    // Listen for request payloads (POST/PUT/PATCH/DELETE bodies)
    chrome.webRequest.onBeforeRequest.addListener(
        safeWebRequestListener(async (details) => {
            if (isOtherPageRequest(details)) return;
            // Skip if extension is disabled
            if (!await isExtensionEnabled()) {
                return;
            }

            // Skip payload capture if tab has cache hit
            if (tabsUsingCache.has(details.tabId)) {
                return;
            }

            if (details.requestBody) {
                const method = details.method || 'GET';

                // Only store payloads for methods that typically have bodies
                if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
                    // Asked before the body is read: a page the scan is refused for has none of it decoded
                    if (!await captureOpen(details)) return;
                    const { payloadData, payloadType } = readRequestBody(details.requestBody, Constants.MAX_RESPONSE_BODY_CHARS);

                    // Store all payloads in an array per tab
                    if (payloadData) {
                        let payloads = payloadStore.get(details.tabId) || [];

                        payloads.push({
                            url: details.url,
                            method: method,
                            payload: payloadData,
                            type: payloadType,
                            timestamp: Date.now()
                        });

                        if (payloads.length > Constants.MAX_PAYLOADS_PER_TAB) {
                            payloads.shift();
                        }

                        payloadStore.set(details.tabId, payloads);
                    }
                }
            }
        }),
        { urls: ["<all_urls>"] },
        ["requestBody"]
    );

    // Capture all network URLs for pattern detection (anti-bot scripts load asynchronously)
    chrome.webRequest.onBeforeRequest.addListener(
        safeWebRequestListener(async (details) => {
            if (isOtherPageRequest(details)) return;
            // Skip if extension is disabled
            if (!await isExtensionEnabled()) {
                return;
            }

            const tabId = details.tabId >= 0 ? details.tabId : tabOfWorkerRequest(details);
            if (tabId < 0 || tabsUsingCache.has(tabId)) return;

            // Skip heavy static-asset request types that anti-bot / fingerprint URL
            // patterns never meaningfully match, to bound per-tab memory and the
            // amount of URL data scanned on asset-heavy pages. Keep script/xhr/fetch/
            // websocket/image/ping/main_frame/sub_frame (beacons can be images/pings).
            if (details.type === 'font' || details.type === 'media' || details.type === 'stylesheet') return;
            if (!await captureOpen(details, tabId)) return;

            const networkUrls = networkUrlsStore.get(tabId) || [];
            const entry = {
                url: details.url,
                type: details.type,        // 'main_frame', 'sub_frame', 'script', 'xhr', 'fetch', etc.
                method: details.method,     // 'GET', 'POST', etc.
                timestamp: Date.now()
            };
            recordNetworkUrl(networkUrls, entry, Constants.MAX_NETWORK_URLS_PER_TAB);
            networkUrlsStore.set(tabId, networkUrls);
            // After the tab's scan finished, its URL rules still see this request (applyLateNetworkUrls)
            if (typeof noteLateNetworkUrl === 'function') noteLateNetworkUrl(tabId, entry);
        }),
        { urls: ["<all_urls>"] }
    );
}
