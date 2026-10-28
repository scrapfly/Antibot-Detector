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

/** A new page starts loading in the tab: from now on the document it showed is the one being left. */
function noteTabLeaving(tabId) {
    const shown = tabDocuments.get(tabId);
    if (shown) leavingDocuments.set(tabId, shown);
    tabDocuments.delete(tabId);
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
    if (requestId === undefined) tabPageRequests.delete(tabId); else tabPageRequests.set(tabId, requestId);
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
            if (tabPageRequests.get(details.tabId) !== details.requestId) noteTabLeaving(details.tabId); // not a redirect
            forgetTabRequests(details.tabId, details.requestId);
        },
        { urls: ['<all_urls>'], types: ['main_frame'] }
    );

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
