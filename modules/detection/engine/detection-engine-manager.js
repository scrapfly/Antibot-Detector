// PatternCache and simpleHash are loaded from utils/pattern-cache.js

/**
 * DetectionEngineManager - Core module for collecting page data for security detection
 * Collects cookies, DOM elements, scripts, and URLs for analysis
 *
 * Storage Configuration:
 * - Detection results are cached using scrapfly_history (consolidated storage)
 * - Cache expires after 12 hours to ensure fresh detection
 */
class DetectionEngineManager {
    // Detection storage configuration constants
    static HISTORY_KEY = 'scrapfly_history';
    static DEFAULT_EXPIRY_HOURS = 12; // Default cache expiry if setting not found

    // Shared pattern cache for all instances
    static patternCache = new PatternCache(500);

    constructor() {
        this.detectionData = null;
        this.lastDetectionTime = null;
        // Only create ConfidenceManager if it's available (not in content script)
        this.confidenceManager = typeof ConfidenceManager !== 'undefined' ? new ConfidenceManager() : null;
        this.cleanupInterval = null;
        this.precomputedPriorities = null;
        // Cache analyzeUsedMethods results
        // Invalidate cache when detectors change (setDetectors)
        this.analyzedMethodsCache = null;
        this.analyzedMethodsCacheTime = 0;
        this.ANALYSIS_CACHE_TTL = 300000; // Cache for 5 minutes (detectors rarely change)
    }

    /**
     * Build detector info object
     * @param {object} detector - Detector object
     * @param {string} fallbackName - Fallback name if detector.name is not available
     * @param {string} fallbackId - Fallback ID if detector.id is not available
     * @returns {object} Detector info object
     */
    static buildDetectorInfo(detector, fallbackName, fallbackId) {
        const result = {
            name: detector.name || fallbackName,
            icon: detector.icon,
            // Note: color is not stored here - it's looked up from CategoryManager based on category
            id: detector.id || fallbackId,
            description: detector.description
        };

        // DEBUG: Log if ID is missing
        if (!result.id) {
            Logger.warn('DETECTOR', '[buildDetectorInfo] MISSING ID:', {
                detectorName: result.name,
                detectorId: detector.id,
                fallbackId,
                detectorKeys: Object.keys(detector).slice(0, 5)
            });
        }

        return result;
    }

    /**
     * Get cache expiry time in milliseconds from settings
     * @returns {Promise<number>} Expiry time in milliseconds
     */
    static async getExpiryMs() {
        try {
            const result = await chrome.storage.local.get(['scrapfly_settings']);
            if (result.scrapfly_settings) {
                const settings = typeof result.scrapfly_settings === 'string'
                    ? JSON.parse(result.scrapfly_settings)
                    : result.scrapfly_settings;
                const actualSettings = settings.settings || settings;

                Logger.cache('[CACHE] Raw settings object:', {
                    cacheDuration: actualSettings.cacheDuration,
                    cacheUnit: actualSettings.cacheUnit,
                    cacheHours: actualSettings.cacheHours,
                    detectionCacheDuration: actualSettings.detection?.cacheDuration,
                    detectionCacheUnit: actualSettings.detection?.cacheUnit
                });

                // Support both old (cacheHours) and new (cacheDuration + cacheUnit) formats
                let expiryMs;
                // Prefer nested detection settings (current), fall back to legacy flat keys
                const duration = actualSettings.detection?.cacheDuration ?? actualSettings.cacheDuration;
                const unit = actualSettings.detection?.cacheUnit ?? actualSettings.cacheUnit;
                if (duration !== undefined && unit) {

                    // Convert to milliseconds based on unit
                    const conversions = {
                        minutes: duration * 60 * 1000,
                        hours: duration * 60 * 60 * 1000,
                        days: duration * 24 * 60 * 60 * 1000
                    };

                    expiryMs = conversions[unit] || (duration * 60 * 60 * 1000); // Default to hours
                    Logger.detection(`[CACHE] Using cache duration: ${duration} ${unit} (${expiryMs}ms)`);
                } else {
                    // Fallback to old cacheHours format
                    const cacheHours = actualSettings.cacheHours || DetectionEngineManager.DEFAULT_EXPIRY_HOURS;
                    expiryMs = cacheHours * 60 * 60 * 1000;
                    Logger.detection(`[CACHE] Using legacy cache duration: ${cacheHours} hours (${expiryMs}ms)`);
                }

                return expiryMs;
            }
            const defaultMs = DetectionEngineManager.DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000;
            Logger.detection(`[CACHE] No settings found, using default: ${DetectionEngineManager.DEFAULT_EXPIRY_HOURS} hours`);
            return defaultMs;
        } catch (error) {
            Logger.error('CACHE', '[CACHE] Error reading cache duration from settings:', error);
            return DetectionEngineManager.DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000;
        }
    }

    /**
     * Analyze which detection methods are actually used by loaded detectors
     * Scans all detectors to determine which data types need to be collected
     * @returns {Object} Map of detection methods that are actually used
     */
    analyzeUsedMethods() {
        return demAnalyzeUsedMethods.apply(this, arguments);
    }
    needsExternalContent() {
        return demNeedsExternalContent.apply(this, arguments);
    }
    extractCookies() {
        return demExtractCookies.apply(this, arguments);
    }
    extractScriptElements() {
        return demExtractScriptElements.apply(this, arguments);
    }
    extractDOM() {
        return demExtractDOM.apply(this, arguments);
    }
    getElementAttributes(element) {
        return demGetElementAttributes.apply(this, arguments);
    }
    shouldRunDetection(minInterval = 1000) {
        if (!this.lastDetectionTime) return true;
        return (Date.now() - this.lastDetectionTime) > minInterval;
    }

    /**
     * Clear stored detection data
     */
    clearDetectionData() {
        this.detectionData = null;
        this.lastDetectionTime = null;
    }

    /**
     * Set detectors for detection analysis
     * Pre-computes priorities for faster detection
     * @param {object} detectors - Detector configurations organized by category
     */
    setDetectors(detectors) {
        this.detectors = detectors;
        // Clear analysis cache when detectors change (force re-analysis on next call)
        this.analyzedMethodsCache = null;
        this.analyzedMethodsCacheTime = 0;
        // Pre-compute detector priorities immediately
        this._precomputePriorities();
    }

    /**
     * Pre-compute detector priorities for faster detection
     * Calculate once instead of per-detection (saves 50-100ms per detection)
     * @private
     */
    _precomputePriorities() {
        return demPrecomputePriorities.apply(this, arguments);
    }
    static generateHookCode(detectors) {
        return demGenerateHookCode.apply(this, arguments);
    }
    runDetector(detector, pageData) {
        const { url, content, dom, cookies = [], headers = {}, pageHTML = '', externalContent = [], allCookies = [], responseCookies = [] } = pageData;
        const matches = [];

        // ENHANCEMENT: Use allCookies (from chrome.cookies API) if available, includes HttpOnly cookies
        const cookiesToMatch = allCookies.length > 0 ? allCookies : cookies;

        if (detector.detection?.url) {
            // Use Set for O(1) duplicate checking instead of O(n) .some()
            const addedUrlPatterns = new Set();

            for (const urlPattern of detector.detection.url) {
                const matchOptions = {
                    regex: urlPattern.textRegex === true,
                    wholeWord: urlPattern.textWholeWord === true,
                    caseSensitive: urlPattern.textCaseSensitive === true
                };

                // Get textScope (default to 'all')
                const textScope = urlPattern.textScope || 'all';

                // Check main page URL (always checked unless scope is explicitly scripts-only)
                // Match against full URL including query parameters for "contains" matching
                Logger.detection(`[URL Detection] ${detector.name}: Testing pattern "${urlPattern.text}" against URL "${url}"`);
                const urlMatch = this.matchPatternWithCapture(url, urlPattern.text, matchOptions);
                if (urlMatch) {
                    Logger.detection(`[URL Detection] ${detector.name}: MATCHED! Value: "${urlMatch}"`);
                    addedUrlPatterns.add(urlPattern.text);
                    matches.push({
                        type: 'url',
                        pattern: urlPattern.text,
                        value: urlMatch,
                        fullUrl: url,
                        confidence: urlPattern.confidence,
                        description: urlPattern.description
                    });
                } else {
                    Logger.detection(`[URL Detection] ${detector.name}: No match`);
                }

                // Check script src URLs if scope is 'page_and_scripts' or 'all'
                if ((textScope === 'page_and_scripts' || textScope === 'all') && content && content.length > 0) {
                    for (const script of content) {
                        const scriptSrc = script.src || '';
                        if (scriptSrc && !addedUrlPatterns.has(urlPattern.text)) {
                            const scriptMatch = this.matchPatternWithCapture(scriptSrc, urlPattern.text, matchOptions);
                            if (scriptMatch) {
                                addedUrlPatterns.add(urlPattern.text);
                                matches.push({
                                    type: 'url',
                                    pattern: urlPattern.text,
                                    value: scriptMatch,
                                    fullUrl: scriptSrc,
                                    confidence: urlPattern.confidence,
                                    description: urlPattern.description
                                });
                            }
                        }
                    }
                }

                // Check all external resource URLs if scope is 'all'
                if (textScope === 'all' && externalContent && externalContent.length > 0) {
                    for (const resource of externalContent) {
                        const resourceUrl = resource.url || '';
                        if (resourceUrl && !addedUrlPatterns.has(urlPattern.text)) {
                            const resourceMatch = this.matchPatternWithCapture(resourceUrl, urlPattern.text, matchOptions);
                            if (resourceMatch) {
                                addedUrlPatterns.add(urlPattern.text);
                                matches.push({
                                    type: 'url',
                                    pattern: urlPattern.text,
                                    value: resourceMatch,
                                    fullUrl: resourceUrl,
                                    confidence: urlPattern.confidence,
                                    description: urlPattern.description
                                });
                            }
                        }
                    }
                }

                // Check ALL network request URLs if scope is 'all' (NEW: captures XHR, fetch, etc.)
                if (textScope === 'all' && pageData.networkUrls && pageData.networkUrls.length > 0) {
                    Logger.detection(`[URL Detection] ${detector.name}: Checking ${pageData.networkUrls.length} network request URLs`);
                    for (const networkUrl of pageData.networkUrls) {
                        if (addedUrlPatterns.has(urlPattern.text)) break; // Already found, skip remaining URLs
                        const networkMatch = this.matchPatternWithCapture(networkUrl.url, urlPattern.text, matchOptions);
                        if (networkMatch) {
                            addedUrlPatterns.add(urlPattern.text);
                            Logger.detection(`[URL Detection] ${detector.name}: Network URL MATCHED! URL: ${networkUrl.url}, Type: ${networkUrl.type}, Method: ${networkUrl.method}`);
                            matches.push({
                                type: 'url',
                                pattern: urlPattern.text,
                                value: networkMatch,
                                fullUrl: networkUrl.url,
                                resourceType: networkUrl.type,
                                method: networkUrl.method,
                                confidence: urlPattern.confidence,
                                description: urlPattern.description
                            });
                        }
                    }
                }
            }
        }

        // Check content patterns
        const contentPatterns = detector.detection?.content;
        Logger.detection(`[Content Detection] ${detector.name}: contentPatterns=${!!contentPatterns}, count=${contentPatterns?.length || 0}, hasPageHTML=${!!pageHTML}, pageHTMLLength=${pageHTML?.length || 0}`);

        if (contentPatterns && pageHTML) {
            Logger.detection(`[Content Detection] ${detector.name}: Starting check of ${contentPatterns.length} patterns`);
            for (const contentPattern of contentPatterns) {
                const patternText = contentPattern.text || '';
                Logger.detection(`[Content Detection] ${detector.name}: Pattern="${patternText}", regex=${contentPattern.textRegex}, wholeWord=${contentPattern.textWholeWord}, caseSensitive=${contentPattern.textCaseSensitive}`);

                const matchOptions = {
                    regex: contentPattern.textRegex === true,
                    wholeWord: contentPattern.textWholeWord === true,
                    caseSensitive: contentPattern.textCaseSensitive === true
                };

                // Determine where to search based on settings
                // If checkScripts is explicitly set to true, restrict search to scripts only
                // If false or undefined, search entire page (default)
                const checkScripts = contentPattern.checkScripts === true;

                Logger.detection(`[Content Detection] ${detector.name}: checkScripts=${checkScripts}`);

                let found = false;
                let foundIn = '';

                if (!checkScripts) {
                    // No restrictions = check entire page HTML + external content (default behavior)
                    Logger.detection(`[Content Detection] ${detector.name}: Searching entire page HTML for "${patternText}"`);
                    if (this.matchPattern(pageHTML, patternText, matchOptions)) {
                        found = true;
                        foundIn = 'page content';
                        Logger.detection(`[Content Detection] ${detector.name}: MATCH FOUND in page content!`);
                    }

                    // Also search external fetched content
                    if (!found && pageData.externalContent && pageData.externalContent.length > 0) {
                        Logger.detection(`[Content Detection] ${detector.name}: Searching ${pageData.externalContent.length} external resources`);
                        for (const resource of pageData.externalContent) {
                            if (this.matchPattern(resource.content, patternText, matchOptions)) {
                                found = true;
                                foundIn = resource.url;
                                Logger.detection(`[Content Detection] ${detector.name}: MATCH FOUND in external resource: ${resource.url}`);
                                break;
                            }
                        }
                    }

                    if (!found) {
                        Logger.detection(`[Content Detection] ${detector.name}: No match in page content or external resources`);
                    }
                } else {
                    // Check only scripts
                    if (content.length > 0) {
                        for (const script of content) {
                            const scriptContent = script.content || script.src || '';
                            if (this.matchPattern(scriptContent, patternText, matchOptions)) {
                                found = true;
                                foundIn = script.src || 'inline script';
                                break;
                            }
                        }
                    }
                }

                if (found) {
                    Logger.detection(`[Content Detection] ${detector.name}: Adding match! confidence=${contentPattern.confidence}, foundIn=${foundIn}`);
                    matches.push({
                        type: 'content',
                        pattern: patternText,
                        value: patternText, // Show the matched pattern itself
                        confidence: contentPattern.confidence,
                        description: contentPattern.description
                    });
                } else {
                    Logger.detection(`[Content Detection] ${detector.name}: Pattern not found: "${patternText}"`);
                }
            }
        } else {
            if (!contentPatterns) {
                Logger.detection(`[Content Detection] ${detector.name}: No content patterns defined`);
            }
            if (!pageHTML) {
                Logger.detection(`[Content Detection] ${detector.name}: No pageHTML provided!`);
            }
        }

        // Check cookies patterns
        if (detector.detection?.cookie && (cookiesToMatch.length > 0 || (responseCookies && responseCookies.length > 0))) {
            // Log cookies being matched for this detector
            if (typeof Logger !== 'undefined') {
                const sourceLabel = allCookies.length > 0 ? '(via chrome.cookies)' : '(document.cookie)';
                Logger.cache(`Matching ${detector.id} against ${cookiesToMatch.length} cookies ${sourceLabel}`, {
                    cookies: cookiesToMatch.map(c => c.name),
                    patterns: detector.detection.cookie.map(p => p.name)
                });
            }

            // Track matched cookies and filter before searching
            const matchedCookieNames = new Set();

        // Pre-build cookie arrays and Maps by scope (O(1) lookup vs O(n) filter)
        const requestCookies = allCookies.length > 0 ? allCookies : cookies;
        // "all" should mean cookie sources (request + response), not storage keys
        const allScopeCookies = allCookies.length > 0
            ? [...allCookies, ...(responseCookies || [])]
            : [...cookies, ...(responseCookies || [])];
        // IMPORTANT: We do not treat localStorage/sessionStorage entries as cookies.

            // Pre-build Maps for O(1) value lookup by name
            const buildCookieMap = (cookieArray) => {
                const map = new Map();
                for (const c of cookieArray) {
                    if (!map.has(c.name)) map.set(c.name, c);
                }
                return map;
            };

        const cookieMapByScope = {
            request: buildCookieMap(requestCookies),
            response: buildCookieMap(responseCookies || []),
            all: buildCookieMap(allScopeCookies)
        };

        const cookieArrayByScope = {
            request: requestCookies,
            response: responseCookies || [],
            all: allScopeCookies
        };

            const normalizeCookieScope = (scope, fallback) => {
                const normalized = typeof scope === 'string' ? scope.trim().toLowerCase() : '';
                if (normalized === 'all_with_storage') return 'all';
                if (normalized === 'storage') return fallback;
                if (normalized === 'request' || normalized === 'response' || normalized === 'all') return normalized;
                return fallback;
            };

            for (const cookiePattern of detector.detection.cookie) {
                const nameMatchOptions = {
                    regex: cookiePattern.nameRegex === true,
                    wholeWord: cookiePattern.nameWholeWord === true,
                    caseSensitive: cookiePattern.nameCaseSensitive === true
                };

                const valueMatchOptions = {
                    regex: cookiePattern.valueRegex === true,
                    wholeWord: cookiePattern.valueWholeWord === true,
                    caseSensitive: cookiePattern.valueCaseSensitive === true
                };

                // Get scope settings (default to 'request' for backward compatibility)
                const nameScope = normalizeCookieScope(cookiePattern.nameScope, 'request');
                const valueScope = normalizeCookieScope(cookiePattern.valueScope, 'request');

                const cookiesForName = cookieArrayByScope[nameScope] || requestCookies;
                const valueMap = cookieMapByScope[valueScope] || cookieMapByScope.request;

                // Filter out already-matched cookies
                const unmatchedCookies = cookiesForName.filter(c => !matchedCookieNames.has(c.name));

                // Find matching cookies
                const matchingCookies = unmatchedCookies.filter(cookie => {
                    if (cookiePattern.name && cookie.name) {
                        const matched = this.matchCookieName(cookie.name, cookiePattern.name, nameMatchOptions);

                        if (matched) {
                            // If value pattern specified, use Map for O(1) lookup
                            if (cookiePattern.value) {
                                const cookieInValueScope = valueMap.get(cookie.name);
                                if (cookieInValueScope) {
                                    return this.matchPattern(cookieInValueScope.value || '', cookiePattern.value, valueMatchOptions);
                                }
                                return false;
                            }
                            return true;
                        }
                    }
                    return false;
                });

                // Add all matching cookies to results
                for (const matchingCookie of matchingCookies) {
                    // FIX: Skip if we already added a match for this cookie name
                    // This prevents duplicates from different sources (document.cookie, chrome.cookies, response headers)
                    if (matchedCookieNames.has(matchingCookie.name)) {
                        continue;
                    }
                    matchedCookieNames.add(matchingCookie.name); // Mark as matched

                    // Log successful match
                    if (typeof Logger !== 'undefined') {
                        Logger.cache(`${detector.id}: Pattern '${cookiePattern.name}' matched cookie '${matchingCookie.name}'`);
                    }

                    matches.push({
                        type: 'cookie',
                        name: matchingCookie.name,
                        value: `${matchingCookie.name}=${matchingCookie.value || ''}`,
                        confidence: cookiePattern.confidence || 80,
                        description: cookiePattern.description
                    });
                }
            }
        }

        // Check headers patterns
        if (detector.detection?.header && (Object.keys(headers).length > 0 || (pageData.requestHeaders && Object.keys(pageData.requestHeaders).length > 0))) {
            for (const headerPattern of detector.detection.header) {
                const nameMatchOptions = {
                    regex: headerPattern.nameRegex === true,
                    wholeWord: headerPattern.nameWholeWord === true,
                    caseSensitive: headerPattern.nameCaseSensitive === true
                };

                const valueMatchOptions = {
                    regex: headerPattern.valueRegex === true,
                    wholeWord: headerPattern.valueWholeWord === true,
                    caseSensitive: headerPattern.valueCaseSensitive === true
                };

                // Get scope settings (default to 'response' for backward compatibility)
                const nameScope = headerPattern.nameScope || 'response';
                const valueScope = headerPattern.valueScope || 'response';

                // Build headers object based on scope
                const getHeadersByScope = (scope) => {
                    if (scope === 'request') {
                        return pageData.requestHeaders || {};
                    } else if (scope === 'response') {
                        return headers; // responseHeaders
                    } else if (scope === 'all') {
                        return { ...(pageData.requestHeaders || {}), ...headers };
                    } else {
                        // Default fallback (shouldn't happen)
                        return headers;
                    }
                };

                const headersForName = getHeadersByScope(nameScope);
                const headersForValue = getHeadersByScope(valueScope);

                // FIX: Loop through ALL headers and match all of them (removed break statements)
                for (const [headerName, headerValue] of Object.entries(headersForName)) {
                    if (headerPattern.name && this.matchPattern(headerName, headerPattern.name, nameMatchOptions)) {
                        // If value pattern specified, check it in valueScope headers
                        if (headerPattern.value) {
                            // Check if this header also exists in value scope
                            const valueToCheck = headersForValue[headerName];
                            if (valueToCheck && this.matchPattern(valueToCheck, headerPattern.value, valueMatchOptions)) {
                                matches.push({
                                    type: 'header',
                                    name: headerPattern.name,
                                    value: `${headerName}: ${valueToCheck}`,
                                    confidence: headerPattern.confidence || 80,
                                    description: headerPattern.description
                                });
                                // Continue checking for more matching headers
                            }
                        } else {
                            // Just check for header name match
                            matches.push({
                                type: 'header',
                                name: headerPattern.name,
                                value: `${headerName}: ${headerValue}`,
                                confidence: headerPattern.confidence || 80,
                                description: headerPattern.description
                            });
                            // Continue checking for more matching headers
                        }
                    }
                }
            }
        }

        // Check payload patterns - handle both single payload and multiple payloads array
        // First check if we have multiple payloads (new format)
        if (detector.detection?.payload && pageData.payloads && Array.isArray(pageData.payloads)) {
            // Track which patterns have already matched to prevent duplicates
            const matchedPatterns = new Set();

            // Check each payload in the array
            for (const payloadItem of pageData.payloads) {
                for (const payloadPattern of detector.detection.payload) {
                    // Skip if this exact pattern already matched in a previous payload
                    // Use description as key (unique per pattern) instead of text (can be duplicated)
                    const patternKey = payloadPattern.description || payloadPattern.text;
                    if (matchedPatterns.has(patternKey)) {
                        continue;
                    }
                    // Match options for pattern matching
                    const matchOptions = {
                        regex: payloadPattern.textRegex === true,
                        wholeWord: payloadPattern.textWholeWord === true,
                        caseSensitive: payloadPattern.textCaseSensitive === true
                    };

                    // NEW: Check HTTP method constraint
                    if (payloadPattern.methods && Array.isArray(payloadPattern.methods) && payloadPattern.methods.length > 0) {
                        const methodAllowed = payloadPattern.methods.some(m =>
                            m.toUpperCase() === payloadItem.method.toUpperCase()
                        );
                        if (!methodAllowed) {
                            continue; // Skip this pattern
                        }
                    }

                    // NEW: Check URL pattern constraint (match against full URL including query parameters)
                    if (payloadPattern.urlPattern && payloadPattern.urlPattern.trim() !== '') {
                        const urlMatchOptions = {
                            regex: payloadPattern.urlRegex === true,
                            wholeWord: payloadPattern.urlWholeWord === true,
                            caseSensitive: payloadPattern.urlCaseSensitive === true
                        };

                        // Match against full URL (includes query parameters for "contains" matching)
                        const urlMatched = this.matchPattern(payloadItem.url, payloadPattern.urlPattern, urlMatchOptions);
                        if (!urlMatched) {
                            continue; // Skip this pattern
                        }
                    }

                    let payloadData = payloadItem.data;

                    // Convert payload to searchable string based on type
                    if (payloadItem.type === 'formData' && typeof payloadData === 'object') {
                        // Convert FormData object to URL-encoded string format for proper pattern matching
                        // Chrome's webRequest API returns FormData as {key: [value, value2, ...]}
                        const params = Object.entries(payloadData).map(([key, values]) => {
                            // Values are arrays, take first value (or all values if multiple)
                            const value = Array.isArray(values) ? values.join(',') : values;
                            return `${key}=${value}`;
                        }).join('&');
                        payloadData = params;
                    } else if (typeof payloadData === 'object') {
                        // Convert any other object to JSON string
                        try {
                            payloadData = JSON.stringify(payloadData);
                        } catch (e) {
                            payloadData = String(payloadData);
                        }
                    }

                    // Check if pattern matches in payload data
                    const matchResult = this.matchPattern(payloadData, payloadPattern.text, matchOptions);

                    if (matchResult) {
                        // Extract the matched portion from the payload
                        let matchedValue = '';
                        const searchStr = payloadData.toString();
                        const patternStr = payloadPattern.text.toLowerCase();
                        const searchLower = searchStr.toLowerCase();

                        // Find the pattern and extract surrounding context
                        const matchIndex = searchLower.indexOf(patternStr);
                        if (matchIndex !== -1) {
                            // Extract up to 100 chars around the match for context
                            const start = Math.max(0, matchIndex - 20);
                            const end = Math.min(searchStr.length, matchIndex + patternStr.length + 60);
                            matchedValue = searchStr.substring(start, end);

                            // Clean up and truncate if too long
                            if (matchedValue.length > 80) {
                                matchedValue = matchedValue.substring(0, 80) + '...';
                            }

                            // If it starts mid-string, add ellipsis
                            if (start > 0) {
                                matchedValue = '...' + matchedValue;
                            }
                        } else {
                            // Fallback to showing just the pattern found
                            matchedValue = `${payloadPattern.text} found`;
                        }

                        matches.push({
                            type: 'payload',
                            pattern: payloadPattern.text,
                            value: matchedValue,
                            confidence: payloadPattern.confidence || 80,
                            description: payloadPattern.description || 'Payload pattern detected'
                        });

                        // Mark this pattern as matched to prevent duplicates
                        // Use same key as check above (description or text)
                        matchedPatterns.add(patternKey);

                        break; // Found match, no need to check this pattern again
                    }
                }
            }
        }
        // Fallback to single payload for backward compatibility
        else if (detector.detection?.payload && pageData.payload) {
            for (const payloadPattern of detector.detection.payload) {
                // Match options for pattern matching
                const matchOptions = {
                    regex: payloadPattern.textRegex === true,
                    wholeWord: payloadPattern.textWholeWord === true,
                    caseSensitive: payloadPattern.textCaseSensitive === true
                };

                // NEW: Check HTTP method constraint
                if (payloadPattern.methods && Array.isArray(payloadPattern.methods) && payloadPattern.methods.length > 0) {
                    const methodAllowed = payloadPattern.methods.some(m =>
                        m.toUpperCase() === pageData.payload.method.toUpperCase()
                    );
                    if (!methodAllowed) {
                        continue; // Skip this pattern
                    }
                }

                // NEW: Check URL pattern constraint (match against full URL including query parameters)
                if (payloadPattern.urlPattern && payloadPattern.urlPattern.trim() !== '') {
                    const urlMatchOptions = {
                        regex: payloadPattern.urlRegex === true,
                        wholeWord: payloadPattern.urlWholeWord === true,
                        caseSensitive: payloadPattern.urlCaseSensitive === true
                    };

                    // Match against full URL (includes query parameters for "contains" matching)
                    const urlMatched = this.matchPattern(pageData.payload.url, payloadPattern.urlPattern, urlMatchOptions);
                    if (!urlMatched) {
                        continue; // Skip this pattern
                    }
                }

                let payloadData = pageData.payload.data;

                // Convert payload to searchable string based on type
                if (pageData.payload.type === 'formData' && typeof payloadData === 'object') {
                    // Convert FormData object to URL-encoded string format for proper pattern matching
                    const params = Object.entries(payloadData).map(([key, values]) => {
                        const value = Array.isArray(values) ? values.join(',') : values;
                        return `${key}=${value}`;
                    }).join('&');
                    payloadData = params;
                } else if (typeof payloadData === 'object') {
                    // Convert any other object to JSON string
                    try {
                        payloadData = JSON.stringify(payloadData);
                    } catch (e) {
                        payloadData = String(payloadData);
                    }
                }

                // Check if pattern matches in payload data
                if (this.matchPattern(payloadData, payloadPattern.text, matchOptions)) {
                    // Extract the matched portion from the payload
                    let matchedValue = '';
                    const searchStr = payloadData.toString();
                    const patternStr = payloadPattern.text.toLowerCase();
                    const searchLower = searchStr.toLowerCase();

                    // Find the pattern and extract surrounding context
                    const matchIndex = searchLower.indexOf(patternStr);
                    if (matchIndex !== -1) {
                        // Extract up to 100 chars around the match for context
                        const start = Math.max(0, matchIndex - 20);
                        const end = Math.min(searchStr.length, matchIndex + patternStr.length + 60);
                        matchedValue = searchStr.substring(start, end);

                        // Clean up and truncate if too long
                        if (matchedValue.length > 80) {
                            matchedValue = matchedValue.substring(0, 80) + '...';
                        }

                        // If it starts mid-string, add ellipsis
                        if (start > 0) {
                            matchedValue = '...' + matchedValue;
                        }
                    } else {
                        // Fallback to showing just the pattern found
                        matchedValue = `${payloadPattern.text} found`;
                    }

                    matches.push({
                        type: 'payload',
                        pattern: payloadPattern.text,
                        value: matchedValue,
                        confidence: payloadPattern.confidence || 80,
                        description: payloadPattern.description || 'Payload pattern detected'
                    });
                }
            }
        }

        // Check DOM patterns
        if (detector.detection?.dom && dom.length > 0) {
            for (const domPattern of detector.detection.dom) {
                // FIX: Use .filter() to get ALL matching DOM elements, not just the first one
                const matchingElements = dom.filter(element => {
                    // The DOM data from content script contains various properties
                    // We need to match the selector pattern against the element data

                    // Handle different selector types
                    const selectorPattern = domPattern.selector;

                    // Class selector (e.g., .g-recaptcha)
                    if (selectorPattern.startsWith('.')) {
                        const className = selectorPattern.substring(1);
                        const elementClass = element.class || element.attributes?.class || '';
                        return elementClass.includes(className);
                    }

                    // ID selector (e.g., #cf-wrapper)
                    if (selectorPattern.startsWith('#')) {
                        const idPattern = selectorPattern.substring(1);
                        const elementId = element.id || element.attributes?.id || '';
                        return elementId === idPattern;
                    }

                    // Attribute selector (e.g., [data-sitekey])
                    if (selectorPattern.startsWith('[') && selectorPattern.endsWith(']')) {
                        const attrMatch = selectorPattern.match(/\[([^=\]]+)(?:=['"]*.([^'"\]]+)['"]*.)?(?:\*=["']?([^'"\]]+)["']?)?\]/);
                        if (attrMatch) {
                            const [, attrName, exactValue, containsValue] = attrMatch;

                            // Check if element has the attribute
                            if (element.attributes && element.attributes[attrName]) {
                                if (exactValue) {
                                    return element.attributes[attrName] === exactValue;
                                } else if (containsValue) {
                                    return element.attributes[attrName].includes(containsValue);
                                } else {
                                    return true; // Just checking for attribute existence
                                }
                            }

                            // Also check top-level properties
                            if (element[attrName]) {
                                if (exactValue) {
                                    return element[attrName] === exactValue;
                                } else if (containsValue) {
                                    return element[attrName].includes(containsValue);
                                } else {
                                    return true;
                                }
                            }
                        }
                    }

                    // Complex selector with src/href contains (e.g., iframe[src*='recaptcha'])
                    if (selectorPattern.includes('[') && selectorPattern.includes('*=')) {
                        const match = selectorPattern.match(/^(\w+)\[(\w+)\*=['"]*([^'"\]]+)['"]*\]/);
                        if (match) {
                            const [, tagName, attrName, containsValue] = match;

                            // Check if tag matches (if specified)
                            if (tagName && element.selector !== tagName && element.tagName !== tagName) {
                                return false;
                            }

                            // Check attribute contains value
                            const attrValue = element[attrName] || element.attributes?.[attrName] || '';
                            return attrValue.includes(containsValue);
                        }
                    }

                    // Simple tag selector (e.g., canvas)
                    if (selectorPattern.match(/^[a-z]+$/)) {
                        return element.selector === selectorPattern || element.tagName === selectorPattern;
                    }

                    // Direct selector match (for elements that store their original selector)
                    if (element.selector === selectorPattern) {
                        return true;
                    }

                    return false;
                });

                // Add all matching DOM elements to results
                for (const matchingElement of matchingElements) {
                    const elementText = matchingElement.text || matchingElement.textContent || matchingElement.innerText || '';
                    const truncatedText = elementText.length > 50 ? elementText.substring(0, 50) + '...' : elementText;
                    matches.push({
                        type: 'dom',
                        selector: domPattern.selector,
                        value: `${domPattern.selector}=${truncatedText}`,
                        confidence: domPattern.confidence || 85,
                        description: domPattern.description
                    });
                }
            }
        }

        // JavaScript Hooks are detected via MAIN world injection script
        // This detection engine doesn't auto-detect them - they're reported via postMessage
        // See: fingerprint-hooks.js (MAIN world script)

        // Calculate confidence if ConfidenceManager is available, otherwise use max confidence
        const overallConfidence = this.confidenceManager
            ? this.confidenceManager.calculateConfidence(matches)
            : Math.max(...matches.map(m => m.confidence || 0), 0);

        // Extract unique detection method types from matches
        const detectionMethods = [...new Set(matches.map(m => m.type))];

        return {
            detected: overallConfidence > 0,
            confidence: overallConfidence,
            matches,
            detectionMethods,
            detector: {
                id: detector.id,
                name: detector.name,
                category: detector.category,
                // Note: color is not stored here - it's looked up from CategoryManager based on category
                icon: detector.icon,
                description: detector.description
            }
        };
    }

    /**
     * Match cookie names with stricter defaults (exact match unless regex/wholeWord)
     * @param {string} name - Cookie name
     * @param {string} pattern - Pattern to match
     * @param {object} options - Matching options
     * @returns {boolean}
     */
    matchCookieName(name, pattern, options = {}) {
        return demMatchCookieName.apply(this, arguments);
    }
    matchPattern(text, pattern, options = {}) {
        return demMatchPattern.apply(this, arguments);
    }
    matchPatternWithCapture(text, pattern, options = {}) {
        return demMatchPatternWithCapture.apply(this, arguments);
    }
    escapeRegExp(string) {
        return demEscapeRegExp.apply(this, arguments);
    }
    static createHookBatcher(chrome) {
        return demCreateHookBatcher.apply(this, arguments);
    }
    static handleHookMessage(event, chrome, hookBatcher) {
        return demHandleHookMessage.apply(this, arguments);
    }
}
