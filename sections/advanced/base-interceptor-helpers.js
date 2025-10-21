/**
 * Base Interceptor Helpers
 * Reusable utilities for Advanced Module interceptors
 *
 * Provides pattern matching, checking, and extraction utilities
 * to eliminate code duplication across detector modules
 */

// ============================================================================
// PATTERN MATCHING UTILITIES
// ============================================================================

/**
 * Match a value against a pattern with various options
 * @param {string} value - Value to match
 * @param {string} pattern - Pattern to match against
 * @param {object} options - Matching options
 * @param {boolean} options.regex - Use regex matching
 * @param {boolean} options.caseSensitive - Case sensitive matching
 * @param {boolean} options.wholeWord - Match whole word only
 * @returns {boolean} True if match found
 */
function matchPattern(value, pattern, options = {}) {
    if (!value || !pattern) return false;

    const {
        regex = false,
        caseSensitive = true,
        wholeWord = false
    } = options;

    let testValue = value;
    let testPattern = pattern;

    // Apply case sensitivity
    if (!caseSensitive) {
        testValue = testValue.toLowerCase();
        testPattern = testPattern.toLowerCase();
    }

    // Regex matching
    if (regex) {
        try {
            const flags = caseSensitive ? '' : 'i';
            const re = new RegExp(testPattern, flags);
            return re.test(testValue);
        } catch (error) {
            console.error('[BaseInterceptor] Invalid regex pattern:', pattern, error);
            return false;
        }
    }

    // Whole word matching
    if (wholeWord) {
        const wordBoundaryPattern = `\\b${testPattern}\\b`;
        const flags = caseSensitive ? '' : 'i';
        try {
            const re = new RegExp(wordBoundaryPattern, flags);
            return re.test(testValue);
        } catch (error) {
            console.error('[BaseInterceptor] Invalid whole word pattern:', pattern, error);
            return false;
        }
    }

    // Simple substring matching
    return testValue.includes(testPattern);
}

// ============================================================================
// COOKIE CHECKING
// ============================================================================

/**
 * Check cookies against configuration
 * @param {string} tabUrl - Tab URL to get cookies for
 * @param {Array|object} config - Cookie configuration(s)
 *   Single: { name: {pattern, regex, caseSensitive}, value: {...}, returnValue: true }
 *   Array: [{ name: {...}, value: {...} }, ...]
 * @returns {Promise<Array>} Array of matched cookies with metadata
 */
async function checkCookies(tabUrl, config) {
    if (!tabUrl) {
        console.warn('[BaseInterceptor] checkCookies: No URL provided');
        return [];
    }

    const configs = Array.isArray(config) ? config : [config];
    const cookies = await chrome.cookies.getAll({ url: tabUrl });
    const matches = [];

    for (const cookieConfig of configs) {
        const { name: nameConfig, value: valueConfig, returnValue = true } = cookieConfig;

        for (const cookie of cookies) {
            let nameMatch = true;
            let valueMatch = true;

            // Check name if config provided
            if (nameConfig && nameConfig.pattern) {
                nameMatch = matchPattern(cookie.name, nameConfig.pattern, {
                    regex: nameConfig.regex || false,
                    caseSensitive: nameConfig.caseSensitive !== false,
                    wholeWord: nameConfig.wholeWord || false
                });
            }

            // Check value if config provided
            if (valueConfig && valueConfig.pattern && nameMatch) {
                valueMatch = matchPattern(cookie.value, valueConfig.pattern, {
                    regex: valueConfig.regex || false,
                    caseSensitive: valueConfig.caseSensitive !== false,
                    wholeWord: valueConfig.wholeWord || false
                });
            }

            // If both match, add to results
            if (nameMatch && valueMatch) {
                const result = {
                    name: cookie.name,
                    domain: cookie.domain,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    path: cookie.path
                };

                // Optionally include value
                if (returnValue) {
                    result.value = cookie.value;
                }

                matches.push(result);
            }
        }
    }

    return matches;
}

// ============================================================================
// HEADER CHECKING
// ============================================================================

/**
 * Check headers against configuration
 * @param {object} details - webRequest details object
 * @param {Array|object} config - Header configuration(s)
 *   Single: { name: {pattern, regex, caseSensitive}, value: {...}, returnValue: true }
 *   Array: [{ name: {...}, value: {...} }, ...]
 * @returns {Array} Array of matched headers
 */
function checkHeaders(details, config) {
    if (!details || !details.responseHeaders) {
        console.warn('[BaseInterceptor] checkHeaders: No headers in details');
        return [];
    }

    const configs = Array.isArray(config) ? config : [config];
    const matches = [];

    for (const headerConfig of configs) {
        const { name: nameConfig, value: valueConfig, returnValue = true } = headerConfig;

        for (const header of details.responseHeaders) {
            let nameMatch = true;
            let valueMatch = true;

            // Check name if config provided
            if (nameConfig && nameConfig.pattern) {
                nameMatch = matchPattern(header.name, nameConfig.pattern, {
                    regex: nameConfig.regex || false,
                    caseSensitive: nameConfig.caseSensitive !== false,
                    wholeWord: nameConfig.wholeWord || false
                });
            }

            // Check value if config provided
            if (valueConfig && valueConfig.pattern && nameMatch && header.value) {
                valueMatch = matchPattern(header.value, valueConfig.pattern, {
                    regex: valueConfig.regex || false,
                    caseSensitive: valueConfig.caseSensitive !== false,
                    wholeWord: valueConfig.wholeWord || false
                });
            }

            // If both match, add to results
            if (nameMatch && valueMatch) {
                const result = {
                    name: header.name
                };

                // Optionally include value
                if (returnValue && header.value) {
                    result.value = header.value;
                }

                matches.push(result);
            }
        }
    }

    return matches;
}

// ============================================================================
// URL CHECKING
// ============================================================================

/**
 * Check URLs against patterns
 * @param {string|Array} urls - URL(s) to check
 * @param {object} config - URL configuration
 *   {
 *     patterns: ['pattern1', 'pattern2'],  // URL patterns to match
 *     regex: boolean,  // Use regex matching
 *     caseSensitive: boolean,  // Case sensitive matching
 *     returnMatches: boolean,  // Return matched URLs
 *     extractParams: boolean,  // Extract query parameters from matched URLs
 *     extractPath: boolean,  // Extract path from matched URLs
 *     paramNames: ['param1', 'param2']  // Specific params to extract (if extractParams: true)
 *   }
 * @returns {object} { found: boolean, matches: [], params: {}, paths: [] }
 */
function checkUrls(urls, config = {}) {
    const {
        patterns = [],
        regex = false,
        caseSensitive = false,
        returnMatches = true,
        extractParams = false,
        extractPath = false,
        paramNames = []
    } = config;

    const result = {
        found: false,
        matches: [],
        params: {},
        paths: []
    };

    if (!urls || !patterns.length) {
        return result;
    }

    // Normalize to array
    const urlArray = Array.isArray(urls) ? urls : [urls];

    try {
        for (const url of urlArray) {
            if (!url) continue;

            for (const pattern of patterns) {
                const matched = matchPattern(url, pattern, { regex, caseSensitive });

                if (matched) {
                    result.found = true;

                    // Return matched URL
                    if (returnMatches) {
                        result.matches.push(url);
                    }

                    // Extract query parameters
                    if (extractParams) {
                        try {
                            const urlObj = new URL(url);
                            const params = {};

                            if (paramNames.length > 0) {
                                // Extract specific parameters
                                for (const paramName of paramNames) {
                                    const value = urlObj.searchParams.get(paramName);
                                    if (value !== null) {
                                        params[paramName] = value;
                                    }
                                }
                            } else {
                                // Extract all parameters
                                for (const [key, value] of urlObj.searchParams.entries()) {
                                    params[key] = value;
                                }
                            }

                            // Merge params (last match wins for duplicate keys)
                            Object.assign(result.params, params);
                        } catch (e) {
                            console.warn('[BaseInterceptor] Failed to parse URL for params:', url, e);
                        }
                    }

                    // Extract path
                    if (extractPath) {
                        try {
                            const urlObj = new URL(url);
                            const fullPath = urlObj.pathname + urlObj.search + urlObj.hash;
                            result.paths.push(fullPath);
                        } catch (e) {
                            console.warn('[BaseInterceptor] Failed to parse URL for path:', url, e);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('[BaseInterceptor] Error checking URLs:', error);
    }

    return result;
}

// ============================================================================
// PAYLOAD CHECKING (REQUEST BODY)
// ============================================================================

/**
 * Extract and check request payload/body
 * @param {object} requestBody - webRequest requestBody object
 * @param {object} config - Payload configuration
 *   {
 *     patterns: ['field1', 'field2'],  // Fields or patterns to look for
 *     extractFormat: 'json'|'urlencoded'|'raw'|'auto',  // Body format
 *     regex: boolean,  // Use regex for pattern matching
 *     returnMatches: boolean,  // Return matched values
 *     returnAll: boolean  // Return entire parsed body
 *   }
 * @returns {object} { found: boolean, matches: {}, raw: string }
 */
function checkPayload(requestBody, config = {}) {
    const {
        patterns = [],
        extractFormat = 'auto',
        regex = false,
        returnMatches = true,
        returnAll = false
    } = config;

    const result = {
        found: false,
        matches: {},
        raw: null,
        parsed: null
    };

    if (!requestBody) {
        return result;
    }

    let rawBody = null;
    let parsedBody = null;

    try {
        // Extract raw body
        if (requestBody.raw && requestBody.raw[0]) {
            const decoder = new TextDecoder('utf-8');
            rawBody = decoder.decode(requestBody.raw[0].bytes);
            result.raw = rawBody;
        } else if (requestBody.formData) {
            rawBody = JSON.stringify(requestBody.formData);
            parsedBody = requestBody.formData;
        }

        if (!rawBody) {
            return result;
        }

        // Parse body based on format
        if (extractFormat === 'json' || (extractFormat === 'auto' && rawBody.trim().startsWith('{'))) {
            try {
                parsedBody = JSON.parse(rawBody);
            } catch (e) {
                console.warn('[BaseInterceptor] Failed to parse JSON body');
            }
        } else if (extractFormat === 'urlencoded' || (extractFormat === 'auto' && rawBody.includes('='))) {
            try {
                parsedBody = {};
                const params = new URLSearchParams(rawBody);
                for (const [key, value] of params.entries()) {
                    parsedBody[key] = value;
                }
            } catch (e) {
                console.warn('[BaseInterceptor] Failed to parse URL-encoded body');
            }
        }

        result.parsed = parsedBody;

        // Return all if requested
        if (returnAll && parsedBody) {
            result.found = true;
            result.matches = parsedBody;
            return result;
        }

        // Check patterns
        for (const pattern of patterns) {
            let found = false;
            let matchedValue = null;

            // Check in parsed body (if available)
            if (parsedBody && typeof parsedBody === 'object') {
                for (const [key, value] of Object.entries(parsedBody)) {
                    const keyMatch = matchPattern(key, pattern, { regex, caseSensitive: true });
                    if (keyMatch) {
                        found = true;
                        matchedValue = value;
                        if (returnMatches) {
                            result.matches[key] = value;
                        }
                        break;
                    }
                }
            }

            // Fallback to raw body search
            if (!found) {
                const rawMatch = matchPattern(rawBody, pattern, { regex, caseSensitive: true });
                if (rawMatch) {
                    found = true;
                    result.found = true;

                    // Try to extract value using regex if pattern is a field name
                    if (!regex && returnMatches) {
                        const extractRegex = new RegExp(`${pattern}[=:]\\s*["']?([^"'&\\s]+)["']?`, 'i');
                        const match = rawBody.match(extractRegex);
                        if (match && match[1]) {
                            result.matches[pattern] = match[1];
                        }
                    }
                }
            }

            if (found) {
                result.found = true;
            }
        }

    } catch (error) {
        console.error('[BaseInterceptor] Error checking payload:', error);
    }

    return result;
}

// ============================================================================
// CONTENT CHECKING (RESPONSE BODY / HTML)
// ============================================================================

/**
 * Check response content/HTML against patterns
 * NOTE: This requires webRequest.onBeforeRequest + filterResponseData
 * @param {string} content - Response text/HTML content
 * @param {object} config - Content configuration
 *   {
 *     patterns: ['pattern1', 'pattern2'],  // Patterns to search for
 *     regex: boolean,  // Use regex matching
 *     returnUrls: boolean,  // Extract and return URLs from matches
 *     returnMatches: boolean,  // Return matched strings
 *     caseSensitive: boolean  // Case sensitive matching
 *   }
 * @returns {object} { found: boolean, matches: [], urls: [] }
 */
function checkContent(content, config = {}) {
    const {
        patterns = [],
        regex = false,
        returnUrls = false,
        returnMatches = true,
        caseSensitive = false
    } = config;

    const result = {
        found: false,
        matches: [],
        urls: []
    };

    if (!content || !patterns.length) {
        return result;
    }

    try {
        for (const pattern of patterns) {
            const found = matchPattern(content, pattern, { regex, caseSensitive });

            if (found) {
                result.found = true;

                // Return matched strings if using regex with capture groups
                if (returnMatches && regex) {
                    try {
                        const flags = caseSensitive ? 'g' : 'gi';
                        const re = new RegExp(pattern, flags);
                        const matches = [...content.matchAll(re)];
                        result.matches.push(...matches.map(m => m[0]));
                    } catch (e) {
                        console.warn('[BaseInterceptor] Regex matchAll failed:', e);
                    }
                } else if (returnMatches) {
                    result.matches.push(pattern);
                }
            }
        }

        // Extract URLs if requested
        if (returnUrls) {
            const urlRegex = /(https?:\/\/[^\s"'<>]+)/gi;
            const urls = [...content.matchAll(urlRegex)].map(m => m[0]);
            result.urls = [...new Set(urls)]; // Deduplicate
        }

    } catch (error) {
        console.error('[BaseInterceptor] Error checking content:', error);
    }

    return result;
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

/**
 * Save capture data to history
 * @param {number} tabId - Tab ID
 * @param {object} captureData - Data to save
 * @param {object} options - Save options
 *   {
 *     type: string,  // Module type (e.g., 'akamai', 'recaptcha')
 *     expiryMinutes: number,  // How long to keep (default: 30)
 *     hostname: string  // Override hostname (auto-detected if not provided)
 *   }
 * @returns {Promise<object>} Saved capture item
 */
async function saveToHistory(tabId, captureData, options = {}) {
    const {
        type,
        expiryMinutes = 30,
        hostname = null
    } = options;

    try {
        // Get tab info
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            throw new Error('Tab not found or no URL');
        }

        const captureHostname = hostname || new URL(tab.url).hostname;

        // Load existing history
        const result = await chrome.storage.local.get(['scrapfly_advanced_history']);
        let history = result.scrapfly_advanced_history || {};

        // MIGRATION: Convert old { items: [] } format to new { moduleId: [] } format
        if (history.items && Array.isArray(history.items)) {
            console.log('[BaseInterceptor] Migrating old storage format to new format');
            const migratedHistory = {};

            // Group items by type (moduleId)
            for (const item of history.items) {
                if (!item.type) continue;

                const moduleId = item.type;
                if (!migratedHistory[moduleId]) {
                    migratedHistory[moduleId] = [];
                }

                // Convert to new format
                migratedHistory[moduleId].push({
                    id: item.id || `${moduleId}_${item.timestamp}`,
                    timestamp: item.timestamp,
                    url: item.url,
                    data: item.captureData || item.data,
                    expiresAt: item.expiresAt
                });
            }

            history = migratedHistory;
            console.log('[BaseInterceptor] Migration complete:', Object.keys(history));
        }

        // Handle legacy string format
        if (typeof history === 'string') {
            history = JSON.parse(history);
        }

        // Ensure moduleId array exists
        if (!history[type]) {
            history[type] = [];
        }

        // Create new capture (NEW format)
        const newCapture = {
            id: `${type}_${Date.now()}`,
            timestamp: Date.now(),
            url: tab.url,
            data: captureData,
            expiresAt: Date.now() + (expiryMinutes * 60 * 1000)
        };

        // Remove expired items from this module
        const now = Date.now();
        history[type] = history[type].filter(item => {
            return !item.expiresAt || item.expiresAt > now;
        });

        // Add new capture to beginning
        history[type].unshift(newCapture);

        // Save to storage
        await chrome.storage.local.set({
            scrapfly_advanced_history: history
        });

        console.log(`[BaseInterceptor] Saved ${type} capture to history:`, newCapture.id);
        return newCapture;

    } catch (error) {
        console.error('[BaseInterceptor] Error saving to history:', error);
        throw error;
    }
}

/**
 * Load capture history for a specific module type
 * @param {string} type - Module type (e.g., 'akamai', 'recaptcha')
 * @param {string} hostname - Optional hostname filter
 * @returns {Promise<Array>} Array of capture history items
 */
async function loadHistory(type, hostname = null) {
    try {
        const result = await chrome.storage.local.get(['scrapfly_advanced_history']);
        let history = result.scrapfly_advanced_history || { items: [] };

        // Handle legacy string format
        if (typeof history === 'string') {
            history = JSON.parse(history);
        }
        if (!history.items) {
            return [];
        }

        // Filter by type and expiry
        const now = Date.now();
        let items = history.items.filter(item => {
            const typeMatch = item.type === type;
            const notExpired = !item.expiresAt || item.expiresAt > now;
            const hostnameMatch = !hostname || item.hostname === hostname;
            return typeMatch && notExpired && hostnameMatch;
        });

        return items;

    } catch (error) {
        console.error('[BaseInterceptor] Error loading history:', error);
        return [];
    }
}

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

/**
 * Show in-page notification
 * @param {number} tabId - Tab ID
 * @param {object} options - Notification options
 *   {
 *     type: 'info'|'success'|'error'|'warning',
 *     title: string,
 *     message: string,
 *     duration: number (milliseconds, default: 5000),
 *     gradient: string (CSS gradient, auto if not provided)
 *   }
 */
async function showNotification(tabId, options = {}) {
    const {
        type = 'info',
        title,
        message,
        duration = 5000,
        gradient = null
    } = options;

    // Gradient colors based on type
    const gradients = {
        info: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        success: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
        error: 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)',
        warning: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        capture: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
    };

    const notifGradient = gradient || gradients[type] || gradients.info;

    // Create SVG logo as data URL (Scrapfly network logo) - simplified for reliability
    const svgString = '<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><circle cx="128" cy="32" r="12" fill="white"/><circle cx="192" cy="64" r="12" fill="white"/><circle cx="224" cy="128" r="12" fill="white"/><circle cx="192" cy="192" r="12" fill="white"/><circle cx="128" cy="224" r="12" fill="white"/><circle cx="64" cy="192" r="12" fill="white"/><circle cx="32" cy="128" r="12" fill="white"/><circle cx="64" cy="64" r="12" fill="white"/><circle cx="128" cy="128" r="16" fill="white"/><line x1="128" y1="44" x2="128" y2="112" stroke="white" stroke-width="6"/><line x1="128" y1="144" x2="128" y2="212" stroke="white" stroke-width="6"/><line x1="204" y1="128" x2="144" y2="128" stroke="white" stroke-width="6"/><line x1="112" y1="128" x2="52" y2="128" stroke="white" stroke-width="6"/><line x1="188" y1="76" x2="140" y2="116" stroke="white" stroke-width="6"/><line x1="116" y1="140" x2="68" y2="180" stroke="white" stroke-width="6"/><line x1="68" y1="76" x2="116" y2="116" stroke="white" stroke-width="6"/><line x1="140" y1="140" x2="188" y2="180" stroke="white" stroke-width="6"/></svg>';
    const logoSvg = `data:image/svg+xml;base64,${btoa(svgString)}`;

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (title, message, gradient, duration, logoSvg) => {
                // Cleanup old notifications
                const allNotifs = document.querySelectorAll('[id^="scrapfly-capture-notification"]');
                allNotifs.forEach(n => n.remove());
                const oldStyles = document.querySelectorAll('style[data-scrapfly-notification]');
                oldStyles.forEach(s => s.remove());
                if (window.scrapflyTimerInterval) {
                    clearInterval(window.scrapflyTimerInterval);
                    window.scrapflyTimerInterval = null;
                }

                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const notif = document.createElement('div');
                        notif.id = `scrapfly-capture-notification-${Date.now()}`;
                        notif.style.cssText = `
                            position: fixed !important;
                            top: 20px !important;
                            right: 20px !important;
                            background: ${gradient} !important;
                            color: white !important;
                            padding: 12px 16px !important;
                            border-radius: 8px !important;
                            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
                            z-index: 2147483647 !important;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                            font-size: 13px !important;
                            min-width: 260px !important;
                            cursor: pointer !important;
                            transition: transform 0.2s, opacity 0.2s !important;
                        `;

                        const styleTag = document.createElement('style');
                        styleTag.setAttribute('data-scrapfly-notification', 'true');
                        styleTag.textContent = `
                            @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                            @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
                        `;
                        document.head.appendChild(styleTag);

                        notif.innerHTML = `
                            <div style="display: flex; align-items: flex-start; gap: 10px;">
                                <div style="flex-shrink: 0; width: 20px; height: 20px; margin-top: 2px; flex-shrink: 0;">
                                    <img src="${logoSvg}" alt="Scrapfly" style="width: 100%; height: 100%; object-fit: contain;" />
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; line-height: 1.2;">
                                        ${title}
                                    </div>
                                    <div style="opacity: 0.95; font-size: 12px; line-height: 1.4;">
                                        ${message}
                                    </div>
                                </div>
                            </div>
                        `;
                        notif.style.animation = 'slideIn 0.3s ease-out';
                        document.body.appendChild(notif);

                        // Add hover effect
                        notif.addEventListener('mouseenter', () => {
                            notif.style.transform = 'scale(1.02)';
                        });
                        notif.addEventListener('mouseleave', () => {
                            notif.style.transform = 'scale(1)';
                        });

                        // Manual dismiss on click
                        const dismissNotif = () => {
                            notif.style.animation = 'slideOut 0.3s ease-in';
                            setTimeout(() => notif.remove(), 300);
                            if (autoRemoveTimer) clearTimeout(autoRemoveTimer);
                        };
                        notif.addEventListener('click', dismissNotif);

                        // Auto-dismiss after duration
                        const autoRemoveTimer = setTimeout(() => {
                            notif.style.animation = 'slideOut 0.3s ease-in';
                            setTimeout(() => notif.remove(), 300);
                        }, duration);
                    }, 100);
                });
            },
            args: [title, message, notifGradient, duration, logoSvg]
        });
    } catch (err) {
        console.error('[BaseInterceptor] Failed to show notification:', err);
        // Fallback to system notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: title,
            message: message,
            priority: 2
        });
    }
}

// ============================================================================
// VERSION DETECTION
// ============================================================================

/**
 * Detect version from data using pattern
 * @param {string} data - Data to extract version from
 * @param {string|RegExp} pattern - Version pattern (e.g., "^(\\d+);" for Akamai)
 * @param {string} prefix - Optional prefix (e.g., "Akamai V")
 * @returns {string|null} Detected version or null
 */
function detectVersion(data, pattern, prefix = '') {
    if (!data || !pattern) return null;

    try {
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        const match = data.match(regex);
        if (match && match[1]) {
            return prefix ? `${prefix}${match[1]}` : match[1];
        }
    } catch (error) {
        console.error('[BaseInterceptor] Error detecting version:', error);
    }

    return null;
}

// ============================================================================
// EXPORTS (for both popup and service worker contexts)
// ============================================================================

// Service workers use global scope (self), popups use window
// Functions are automatically available in global scope when imported via importScripts()

const globalContext = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);

if (globalContext) {
    globalContext.BaseInterceptorHelpers = {
        matchPattern,
        checkCookies,
        checkHeaders,
        checkUrls,
        checkPayload,
        checkContent,
        saveToHistory,
        loadHistory,
        showNotification,
        detectVersion
    };

    console.log('[BaseInterceptorHelpers] ✓ Loaded in context:', typeof window !== 'undefined' ? 'popup' : 'service-worker');
}
