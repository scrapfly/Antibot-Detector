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
 * @returns {Promise<Array>} Array of matched cookies with metadata
 */
async function checkCookies(tabUrl, config) {
    if (!tabUrl) {
        Logger.warn('UI', '[BaseInterceptor] checkCookies: No URL provided');
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
        const normalizedFavicon = UrlUtils.normalizeFaviconForStorage(tab.favIconUrl, tab.url || captureHostname);
        const newCapture = await AdvancedHistoryStore.appendCapture(type, {
            id: `${type}_${Date.now()}`,
            timestamp: Date.now(),
            url: tab.url,
            hostname: captureHostname,
            favicon: normalizedFavicon,
            data: captureData,
            captureData
        }, {
            expiryMinutes
        });

        Logger.ui(`[BaseInterceptor] Saved ${type} capture to history:`, newCapture.id);
        return newCapture;

    } catch (error) {
        Logger.error('UI', '[BaseInterceptor] Error saving to history:', error);
        throw error;
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
        capture: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        loading: 'linear-gradient(135deg, #f59e0b 0%, #fb923c 100%)' // Orange gradient for analyzing/loading states
    };

    const notifGradient = gradient || gradients[type] || gradients.info;

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (title, message, gradient, duration, type) => {
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
                            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                            .scrapfly-notif-icon { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; }
                            .scrapfly-notif-icon::before { content: '●'; color: white; font-size: 10px; }
                            .scrapfly-notif-loading .scrapfly-notif-icon::before { content: '\\2699'; animation: spin 1s linear infinite; }
                        `;
                        document.head.appendChild(styleTag);

                        // Add loading class if type is loading
                        const iconClass = type === 'loading' ? 'scrapfly-notif-icon scrapfly-notif-loading' : 'scrapfly-notif-icon';

                        notif.innerHTML = `
                            <div style="display: flex; align-items: flex-start; gap: 10px;">
                                <div class="${iconClass}"></div>
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
            args: [title, message, notifGradient, duration, type]
        });
    } catch (err) {
        Logger.error('UI', '[BaseInterceptor] Failed to show notification:', err);
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
function cleanupManagedListeners(tabId) {
    const tabKey = String(tabId);
    const tabListeners = managedListenersByTab.get(tabKey);
    if (!tabListeners) {
        return 0;
    }

    let removedCount = 0;
    Array.from(tabListeners.keys()).forEach((kind) => {
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

    if (!changeInfo || !changeInfo.url || !state || !state.captureUrl || changeInfo.url === state.captureUrl) {
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
        title = 'Capture Active',
        message = 'Reload the page to trigger capture.',
        duration = 60000
    } = options;

    return showNotification(tabId, {
        type: 'capture',
        title,
        message,
        duration
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
        showCaptureStarted
    };

    Logger.ui('[BaseInterceptorHelpers] Loaded in context:', typeof window !== 'undefined' ? 'popup' : 'service-worker');
}
