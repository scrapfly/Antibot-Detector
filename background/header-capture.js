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

/** A main-frame navigation starts (not a redirect of one). */
function navigationStarted(tabId) {
    noteTabLeaving(tabId);
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
        if (chrome.webNavigation.onCommitted) chrome.webNavigation.onCommitted.addListener((details) => { if (details && details.frameId === 0) navigationCommitted(details); });
        if (chrome.webNavigation.onErrorOccurred) chrome.webNavigation.onErrorOccurred.addListener((details) => { if (details && details.frameId === 0) navigationFailed(details.tabId); });
    }
    if (chrome.tabs && chrome.tabs.onRemoved) chrome.tabs.onRemoved.addListener((tabId) => { tabCaptureScopes.delete(tabId); });

    // Listen for response headers
    chrome.webRequest.onHeadersReceived.addListener(
        safeWebRequestListener(async (details) => {
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
                const headers = {};
                const responseCookies = [];

                // Convert headers to object and extract Set-Cookie values
                details.responseHeaders.forEach(header => {
                    const headerName = header.name.toLowerCase();
                    headers[headerName] = header.value;

                    if (headerName === 'set-cookie') {
                        const cookieParts = header.value.split(';')[0].split('=');
                        if (cookieParts.length >= 2) {
                            responseCookies.push({
                                name: cookieParts[0].trim(),
                                value: cookieParts.slice(1).join('=').trim()
                            });
                        }
                    }
                });

                headersStore.set(details.tabId, {
                    url: details.url,
                    headers: headers,
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
