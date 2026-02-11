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

                // Convert headers array to object for easier access
                // Also extract Set-Cookie headers for response cookie detection
                details.responseHeaders.forEach(header => {
                    const headerName = header.name.toLowerCase();
                    headers[headerName] = header.value;

                    // Parse Set-Cookie headers for response cookies
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

                // Store response cookies if any were found
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

                // Convert headers array to object for easier access
                details.requestHeaders.forEach(header => {
                    headers[header.name.toLowerCase()] = header.value;
                });

                // Store request headers
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

            // Capture ALL requests with bodies (not just main_frame)
            if (details.requestBody) {
                const method = details.method || 'GET';

                // Only store payloads for methods that typically have bodies
                if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
                    let payloadData = null;
                    let payloadType = 'unknown';

                    // Check if we have form data
                    if (details.requestBody.formData) {
                        payloadData = details.requestBody.formData;
                        payloadType = 'formData';
                    }
                    // Check if we have raw data
                    else if (details.requestBody.raw && details.requestBody.raw.length > 0) {
                        // Combine all raw chunks
                        const rawData = details.requestBody.raw.map(item => {
                            if (item.bytes) {
                                // Convert ArrayBuffer to string
                                try {
                                    const decoder = new TextDecoder('utf-8');
                                    return decoder.decode(item.bytes);
                                } catch (e) {
                                    // If decoding fails, store as base64
                                    return btoa(String.fromCharCode(...new Uint8Array(item.bytes)));
                                }
                            }
                            return '';
                        }).join('');

                        payloadData = rawData;
                        payloadType = 'raw';
                    }

                    // Store payload if we found data - store ALL payloads in an array
                    if (payloadData) {
                        // Get existing payloads array or create new one
                        let payloads = payloadStore.get(details.tabId) || [];

                        // Add new payload to array
                        payloads.push({
                            url: details.url,
                            method: method,
                            payload: payloadData,
                            type: payloadType,
                            timestamp: Date.now()
                        });

                        // Keep max 50 payloads to prevent memory issues
                        if (payloads.length > 50) {
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

    // Capture ALL network request URLs for URL pattern detection
    // This allows detecting anti-bot systems that use specific URL patterns (e.g., Akamai /akam/, /sbsd/)
    // URLs are captured during the ENTIRE page lifecycle (not just during active detection)
    // because many anti-bot scripts load asynchronously 1-5+ seconds after initial page load
    chrome.webRequest.onBeforeRequest.addListener(
        async (details) => {
            // Skip if extension is disabled
            if (!await isExtensionEnabled()) {
                return;
            }

            // Skip if cache hit
            if (tabsUsingCache.has(details.tabId)) return;

            // Skip invalid tab IDs
            if (details.tabId < 0) return;

            // Capture ALL request URLs (GET, POST, XHR, script, etc.)
            let networkUrls = networkUrlsStore.get(details.tabId) || [];

            networkUrls.push({
                url: details.url,
                type: details.type,        // 'main_frame', 'sub_frame', 'script', 'xhr', 'fetch', etc.
                method: details.method,     // 'GET', 'POST', etc.
                timestamp: Date.now()
            });

            // Keep max 200 URLs per tab to prevent memory issues
            if (networkUrls.length > 200) {
                networkUrls.shift();
            }

            networkUrlsStore.set(details.tabId, networkUrls);
        },
        { urls: ["<all_urls>"] }
    );
}
