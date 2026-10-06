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

function setupHeaderCapture() {
    // Listen for response headers
    chrome.webRequest.onHeadersReceived.addListener(
        safeWebRequestListener(async (details) => {
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
                    let payloadData = null;
                    let payloadType = 'unknown';

                    if (details.requestBody.formData) {
                        payloadData = details.requestBody.formData;
                        payloadType = 'formData';
                    }
                    else if (details.requestBody.raw && details.requestBody.raw.length > 0) {
                        const rawData = details.requestBody.raw.map(item => {
                            if (item.bytes) {
                                try {
                                    const decoder = new TextDecoder('utf-8');
                                    return decoder.decode(item.bytes);
                                } catch (e) {
                                    return btoa(String.fromCharCode(...new Uint8Array(item.bytes)));
                                }
                            }
                            return '';
                        }).join('');

                        payloadData = rawData;
                        payloadType = 'raw';
                    }

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
            // Skip if extension is disabled
            if (!await isExtensionEnabled()) {
                return;
            }

            if (tabsUsingCache.has(details.tabId)) return;

            if (details.tabId < 0) return;

            // Skip heavy static-asset request types that anti-bot / fingerprint URL
            // patterns never meaningfully match, to bound per-tab memory and the
            // amount of URL data scanned on asset-heavy pages. Keep script/xhr/fetch/
            // websocket/image/ping/main_frame/sub_frame (beacons can be images/pings).
            if (details.type === 'font' || details.type === 'media' || details.type === 'stylesheet') return;

            const networkUrls = networkUrlsStore.get(details.tabId) || [];
            recordNetworkUrl(networkUrls, {
                url: details.url,
                type: details.type,        // 'main_frame', 'sub_frame', 'script', 'xhr', 'fetch', etc.
                method: details.method,     // 'GET', 'POST', etc.
                timestamp: Date.now()
            }, Constants.MAX_NETWORK_URLS_PER_TAB);
            networkUrlsStore.set(details.tabId, networkUrls);
        }),
        { urls: ["<all_urls>"] }
    );
}
