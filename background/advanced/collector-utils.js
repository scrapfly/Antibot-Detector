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
            Logger.error('UI', '[BaseInterceptor] Invalid regex pattern:', pattern, error);
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
            Logger.error('UI', '[BaseInterceptor] Invalid whole word pattern:', pattern, error);
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
 * @param {number} [tabId] - the tab, so its partitioned cookies count too
 * @returns {Promise<Array>} Array of matched cookies with metadata
 */
async function checkCookies(tabUrl, config, tabId) {
    if (!tabUrl) {
        Logger.warn('UI', '[BaseInterceptor] checkCookies: No URL provided');
        return [];
    }

    const configs = Array.isArray(config) ? config : [config];
    const cookies = await PageCookies.getAll({ url: tabUrl }, tabId);
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
                    path: cookie.path,
                    expirationDate: cookie.expirationDate,
                    sameSite: cookie.sameSite
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
                            Logger.debug('UI', '[BaseInterceptor] Failed to parse URL for params:', url, e);
                        }
                    }

                    // Extract path
                    if (extractPath) {
                        try {
                            const urlObj = new URL(url);
                            const fullPath = urlObj.pathname + urlObj.search + urlObj.hash;
                            result.paths.push(fullPath);
                        } catch (e) {
                            Logger.debug('UI', '[BaseInterceptor] Failed to parse URL for path:', url, e);
                        }
                    }
                }
            }
        }
    } catch (error) {
        Logger.error('UI', '[BaseInterceptor] Error checking URLs:', error);
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
        // A private window's capture (cookie values, headers, the address) is never written to storage.local, which would
        // outlast the private session: it is kept in memory only, listed with the others until the browser closes
        const privateTab = tab.incognito === true;
        if (privateTab && !AdvancedHistoryStore.canKeepPrivate()) {
            Logger.debug('UI', `[BaseInterceptor] ${type} capture in a private window: not saved to history`);
            return { id: options.id || AdvancedResultModel.requestId(), timestamp: Date.now(), url: tab.url, hostname: captureHostname, data: captureData, captureData, notSaved: true };
        }
        const normalizedFavicon = UrlUtils.normalizeFaviconForStorage(tab.favIconUrl, tab.url || captureHostname);
        const newCapture = await AdvancedHistoryStore.appendCapture(type, {
            id: options.id || AdvancedResultModel.requestId(),
            timestamp: Date.now(),
            url: tab.url,
            hostname: captureHostname,
            favicon: normalizedFavicon,
            data: captureData,
            captureData
        }, {
            expiryMinutes,
            privateSession: privateTab
        });

        Logger.debug('UI', `[BaseInterceptor] Saved ${type} capture to history:`, newCapture.id);
        return newCapture;

    } catch (error) {
        Logger.error('UI', '[BaseInterceptor] Error saving to history:', error);
        throw error;
    }
}

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

// CAPTURE LIFECYCLE HELPERS
// ============================================================================

/**
 * Check whether capture state map is ready.
 * @param {Map} captureStateRef
 * @returns {boolean}
 */
function isCaptureStateReady(captureStateRef) {
    return !!(captureStateRef && typeof captureStateRef.get === 'function' && typeof captureStateRef.set === 'function');
}

/**
 * Get capture state for a tab.
 * @param {Map} captureStateRef
 * @param {number} tabId
 * @returns {object|null}
 */
function getCaptureState(captureStateRef, tabId) {
    if (!isCaptureStateReady(captureStateRef)) {
        return null;
    }
    return captureStateRef.get(tabId) || null;
}

/**
 * Set/update timeout for a capture state entry.
 * @param {Map} captureStateRef
 * @param {number} tabId
 * @param {number} ms
 * @param {Function} onTimeout
 * @returns {boolean}
 */
function setCaptureTimeout(captureStateRef, tabId, ms, onTimeout) {
    const state = getCaptureState(captureStateRef, tabId);
    if (!state) {
        return false;
    }

    if (state.timeout) {
        clearTimeout(state.timeout);
    }

    state.timeout = setTimeout(() => {
        if (typeof onTimeout === 'function') {
            onTimeout();
        }
    }, ms);

    captureStateRef.set(tabId, state);
    return true;
}

/**
 * Clear timeout on state object if present.
 * @param {object} state
 */
function clearCaptureTimeout(state) {
    if (!state) {
        return;
    }

    if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
    }

    if (state.captureTimeout) {
        clearTimeout(state.captureTimeout);
        state.captureTimeout = null;
    }
}

/**
 * Remove capture state for a tab and clear timeout if present.
 * @param {Map} captureStateRef
 * @param {number} tabId
 * @returns {object|null}
 */
function removeCaptureState(captureStateRef, tabId) {
    const state = getCaptureState(captureStateRef, tabId);
    if (!state) {
        return null;
    }
    clearCaptureTimeout(state);
    captureStateRef.delete(tabId);
    if (state.captureInterval) clearInterval(state.captureInterval);
    const ownedListeners = [
        ['requestListener', chrome.webRequest?.onBeforeRequest],
        ['setCookieListener', chrome.webRequest?.onResponseStarted],
        ['requestHeaderListener', chrome.webRequest?.onBeforeSendHeaders],
        ['navigationListener', chrome.webNavigation?.onCommitted],
        ['loadCompleteListener', chrome.webNavigation?.onCompleted]
    ];
    for (const [field, event] of ownedListeners) if (state[field] && event) event.removeListener(state[field]);
    if (typeof AdvancedJobManager !== 'undefined') AdvancedJobManager.finishCaptureState(state);
    return state;
}

/**
 * Remove a webRequest listener if no captures remain.
 * @param {object} options
 * @param {Map} options.captureStateRef
 * @param {Function} options.listenerRef
 * @param {Function} options.removeFn
 * @returns {boolean}
 */
function removeListenerIfIdle(options = {}) {
    const { captureStateRef, listenerRef, removeFn } = options;
    if (!isCaptureStateReady(captureStateRef)) {
        return false;
    }
    if (captureStateRef.size !== 0) {
        return false;
    }
    if (typeof listenerRef !== 'function' || typeof removeFn !== 'function') {
        return false;
    }

    try {
        removeFn(listenerRef);
        return true;
    } catch (error) {
        Logger.error('NETWORK', '[BaseInterceptor] Failed to remove listener:', error);
        return false;
    }
}

// ============================================================================
// MANAGED LISTENER LIFECYCLE
// ============================================================================

// tabId -> Map(kind -> { listener, removeFn })
const managedListenersByTab = new Map();

/**
 * Register a listener for lifecycle cleanup.
 * If an entry exists for the same {tabId, kind}, it is removed first.
 * @param {number|string} tabId
 * @param {string} kind
 * @param {Function} listener
 * @param {Function} removeFn
 * @returns {boolean}
 */
function registerManagedListener(tabId, kind, listener, removeFn) {
    if (tabId === undefined || tabId === null || !kind || typeof listener !== 'function' || typeof removeFn !== 'function') {
        return false;
    }

    const tabKey = String(tabId);
    if (!managedListenersByTab.has(tabKey)) {
        managedListenersByTab.set(tabKey, new Map());
    }

    const tabListeners = managedListenersByTab.get(tabKey);
    const existing = tabListeners.get(kind);
    if (existing && typeof existing.removeFn === 'function' && typeof existing.listener === 'function') {
        try {
            existing.removeFn(existing.listener);
        } catch (error) {
            Logger.error('NETWORK', '[BaseInterceptor] Failed to remove existing managed listener:', error);
        }
    }

    tabListeners.set(kind, { listener, removeFn });
    return true;
}

/**
 * Remove a specific managed listener.
 * @param {number|string} tabId
 * @param {string} kind
 * @returns {boolean}
 */
function removeManagedListener(tabId, kind) {
    const tabKey = String(tabId);
    const tabListeners = managedListenersByTab.get(tabKey);
    if (!tabListeners) {
        return false;
    }

    const existing = tabListeners.get(kind);
    if (!existing) {
        return false;
    }

    try {
        existing.removeFn(existing.listener);
    } catch (error) {
        Logger.error('NETWORK', '[BaseInterceptor] Failed to remove managed listener:', error);
        return false;
    } finally {
        tabListeners.delete(kind);
        if (tabListeners.size === 0) {
            managedListenersByTab.delete(tabKey);
        }
    }

    return true;
}

/**
 * Cleanup all managed listeners for a tab.
 * @param {number|string} tabId
 * @returns {number} Number of listeners removed
 */
function cleanupManagedListeners(tabId, vendorId = null) {
    const tabKey = String(tabId);
    const tabListeners = managedListenersByTab.get(tabKey);
    if (!tabListeners) {
        return 0;
    }

    let removedCount = 0;
    Array.from(tabListeners.keys()).forEach((kind) => {
        if (vendorId && !kind.toLowerCase().startsWith(vendorId.toLowerCase() + ':') && !kind.toLowerCase().startsWith(vendorId.toLowerCase() + '_') && !kind.toLowerCase().startsWith(vendorId.toLowerCase() + '-')) return;
        if (removeManagedListener(tabKey, kind)) {
            removedCount += 1;
        }
    });

    return removedCount;
}

/**
 * Handle tab URL change abort for active capture.
 * @param {object} options
 * @returns {boolean}
 */
/**
 * The page an address is (origin and path): a site that rewrites its query or #fragment (a consent banner, a
 * router) is still the page a capture watches. Anything that is not a URL compares as itself.
 */
function capturePageOf(url) {
    try { const u = new URL(url); return `${u.origin}${u.pathname}`; } catch (_) { return String(url || ''); }
}

function handleUrlChangeAbort(options = {}) {
    const {
        tabId,
        changeInfo,
        state,
        captureStateRef,
        listenerRef,
        removeFn,
        loggerPrefix = 'Capture'
    } = options;

    if (!changeInfo || !changeInfo.url || !state || !state.captureUrl || capturePageOf(changeInfo.url) === capturePageOf(state.captureUrl)) {
        return false;
    }

    Logger.network(`[${loggerPrefix}] URL changed, clearing capture state for tab:`, tabId);
    removeCaptureState(captureStateRef, tabId);
    removeListenerIfIdle({ captureStateRef, listenerRef, removeFn });
    return true;
}

/**
 * Show standardized "capture started" notification.
 * @param {number} tabId
 * @param {object} options
 * @returns {Promise<void>}
 */
async function showCaptureStarted(tabId, options = {}) {
    const {
        title = pageText('pageNoticeCaptureActive', 'Capture Active'),
        message = pageText('pageNoticeReloadToCapture', 'Reload the page to trigger capture.'),
        duration = 60000,
        ...rest
    } = options;

    // module / steps / activeStep / countdown pass straight through. A capture
    // notice stays up for the whole capture window and counts it down.
    const seconds = Math.round(Number(duration) / 1000);
    return showNotification(tabId, {
        countdown: seconds > 0 ? seconds : 0,
        ...rest,
        type: 'capture',
        title,
        message,
        duration
    });
}

/**
 * Reload a tab and wait until its main frame has loaded (webNavigation.onCompleted,
 * frameId 0), instead of a fixed sleep. Resolves false when the load did not
 * complete within the time limit (the caller then goes on with what the page has).
 * @param {number} tabId
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<boolean>} true when the load completed
 */
function reloadTabAndWait(tabId, { timeoutMs = 15000 } = {}) {
    return new Promise(resolve => {
        let done = false;
        let timer = null;
        const listener = details => {
            if (details && details.tabId === tabId && details.frameId === 0) finish(true);
        };
        const finish = loaded => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { chrome.webNavigation?.onCompleted?.removeListener(listener); } catch (_) { /* gone */ }
            resolve(loaded);
        };
        try { chrome.webNavigation?.onCompleted?.addListener(listener); } catch (_) { /* fallback: timer */ }
        timer = setTimeout(() => finish(false), timeoutMs);
        Promise.resolve().then(() => chrome.tabs.reload(tabId)).catch(() => finish(false));
    });
}

// ============================================================================
// VERSION DETECTION
// ============================================================================

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
        checkUrls,
        saveToHistory,
        showNotification,
        isCaptureStateReady,
        getCaptureState,
        setCaptureTimeout,
        clearCaptureTimeout,
        removeCaptureState,
        removeListenerIfIdle,
        registerManagedListener,
        removeManagedListener,
        cleanupManagedListeners,
        handleUrlChangeAbort,
        showCaptureStarted,
        reloadTabAndWait
    };

    Logger.debug('UI', '[BaseInterceptorHelpers] Loaded in context:', typeof window !== 'undefined' ? 'popup' : 'service-worker');
}
