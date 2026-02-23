/**
 * HTTP header, cookie, payload, and network URL capture via webRequest API.
 * Stores captured data in TTLMap stores for use by the detection engine.
 */

function setupHeaderCapture() {
    // Listen for response headers
    chrome.webRequest.onHeadersReceived.addListener(
        async (details) => {
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
        },
        { urls: ["<all_urls>"] },
        ["responseHeaders"]
    );

    // Listen for request headers
    chrome.webRequest.onBeforeSendHeaders.addListener(
        async (details) => {
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
        },
        { urls: ["<all_urls>"] },
        ["requestHeaders"]
    );

    // Listen for request payloads (POST/PUT/PATCH/DELETE bodies)
    chrome.webRequest.onBeforeRequest.addListener(
        async (details) => {
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
        },
        { urls: ["<all_urls>"] },
        ["requestBody"]
    );

    // Capture all network URLs for pattern detection (anti-bot scripts load asynchronously)
    chrome.webRequest.onBeforeRequest.addListener(
        async (details) => {
            // Skip if extension is disabled
            if (!await isExtensionEnabled()) {
                return;
            }

            if (tabsUsingCache.has(details.tabId)) return;

            if (details.tabId < 0) return;

            let networkUrls = networkUrlsStore.get(details.tabId) || [];

            networkUrls.push({
                url: details.url,
                type: details.type,        // 'main_frame', 'sub_frame', 'script', 'xhr', 'fetch', etc.
                method: details.method,     // 'GET', 'POST', etc.
                timestamp: Date.now()
            });

            if (networkUrls.length > Constants.MAX_NETWORK_URLS_PER_TAB) {
                networkUrls.shift();
            }

            networkUrlsStore.set(details.tabId, networkUrls);
        },
        { urls: ["<all_urls>"] }
    );
}
