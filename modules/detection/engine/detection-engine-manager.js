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
    static STORAGE_KEY = 'scrapfly_detection_storage';

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
     * Orchestrate JS hook installation by loading detectors and dispatching
     * hook definitions to the MAIN world via CustomEvent.
     * Called from content.js (ISOLATED world) at document_start.
     * @param {Window} window - The window object
     * @param {object} chrome - The chrome API object
     */
    static async installHooksOrchestrator(window, chrome) {
        try {
            const result = await chrome.storage.local.get(['scrapfly_detectors', 'scrapfly_settings', 'scrapfly_enabled']);

            // Extension disabled - skip hook installation entirely
            // Dispatch empty event so MAIN world sends completion signals and doesn't hang
            if (result.scrapfly_enabled === false) {
                window.dispatchEvent(new CustomEvent('scrapfly-install-hooks', {
                    detail: {
                        hookDefinitions: [],
                        windowProperties: [],
                        debugMode: false,
                        logCollectorEnabled: false,
                        enableJsApi: false,
                        fingerprintEnabled: false
                    }
                }));
                return;
            }

            // Parse settings
            const settingsRaw = result.scrapfly_settings;
            const parsedSettings = typeof settingsRaw === 'string' ? JSON.parse(settingsRaw) : settingsRaw;
            const actualSettings = parsedSettings?.settings || parsedSettings || {};
            const debugMode = actualSettings.debugMode || false;
            const logCollectorEnabled = actualSettings.logCollectorEnabled || false;
            const enableJsApi = actualSettings.jsApi?.enableJsApi ?? true;

            const detectorsData = result.scrapfly_detectors;

            // No detectors loaded yet - dispatch empty event so MAIN world sends completion signals
            if (!detectorsData?.detectors) {
                window.dispatchEvent(new CustomEvent('scrapfly-install-hooks', {
                    detail: {
                        hookDefinitions: [],
                        windowProperties: [],
                        debugMode,
                        logCollectorEnabled,
                        enableJsApi,
                        fingerprintEnabled: true
                    }
                }));
                return;
            }

            // Extract hookDefinitions from fingerprint detectors with js_hooks
            const hookDefinitions = [];
            const fingerprintDetectors = detectorsData.detectors.fingerprint || {};
            for (const [detectorKey, detector] of Object.entries(fingerprintDetectors)) {
                if (detector.enabled === false) continue;
                if (!detector.detection?.js_hooks || detector.detection.js_hooks.length === 0) continue;

                hookDefinitions.push({
                    id: detector.id || detectorKey,
                    name: detector.name,
                    category: 'fingerprint',
                    hooks: detector.detection.js_hooks.filter(h => h.enabled !== false)
                });
            }

            // Extract windowProperties from ALL detectors (any category)
            const windowProperties = [];
            for (const [category, categoryDetectors] of Object.entries(detectorsData.detectors)) {
                for (const [detectorKey, detector] of Object.entries(categoryDetectors || {})) {
                    if (detector.enabled === false) continue;
                    if (!detector.detection?.window || detector.detection.window.length === 0) continue;

                    for (const prop of detector.detection.window) {
                        windowProperties.push({
                            ...prop,
                            detectorId: detector.id || detectorKey,
                            detectorName: detector.name,
                            category: category
                        });
                    }
                }
            }

            // Dispatch to MAIN world via CustomEvent
            window.dispatchEvent(new CustomEvent('scrapfly-install-hooks', {
                detail: {
                    hookDefinitions,
                    windowProperties,
                    debugMode,
                    logCollectorEnabled,
                    enableJsApi,
                    fingerprintEnabled: true
                }
            }));

        } catch (error) {
            if (typeof Logger !== 'undefined') {
                Logger.error('DETECTION', '[installHooksOrchestrator] Failed:', error);
            }
            // Still dispatch empty event so MAIN world doesn't hang
            window.dispatchEvent(new CustomEvent('scrapfly-install-hooks', {
                detail: {
                    hookDefinitions: [],
                    windowProperties: [],
                    debugMode: false,
                    logCollectorEnabled: false,
                    enableJsApi: true,
                    fingerprintEnabled: true
                }
            }));
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
     * Collect page data for detection analysis
     * Uses lazy getters (Object.defineProperty) to only extract data when accessed
     * @returns {Promise<object>} Page data object with lazy getters
     */
    async collectPageData() {
        Logger.detection('DetectionEngineManager: Collecting page data...');
        const startTime = Date.now();

        // OPTIMIZATION Phase C.1: Analyze which detection methods are used
        const usedMethods = this.analyzeUsedMethods();

        // OPTIMIZATION 8E: Check which data types are actually needed by detectors
        const needsExternal = this.needsExternalContent();

        let externalContent = [];
        if (needsExternal) {
            Logger.detection('[8E: Incremental] External content needed, fetching...');
            try {
                externalContent = await this.extractExternalContent();
            } catch (error) {
                Logger.error('DETECTION', 'DetectionEngineManager: Error fetching external content:', error);
                externalContent = [];
            }
        } else {
            Logger.detection('[8E: Incremental] Skipping external content fetch (not needed by any detector)');
        }

        // Extract favicon with multiple fallback strategies
        let favicon = '';
        const faviconSelectors = [
            'link[rel="icon"]',
            'link[rel="shortcut icon"]',
            'link[rel="apple-touch-icon"]',
            'link[rel="apple-touch-icon-precomposed"]',
            'link[type="image/x-icon"]',
            'link[type="image/png"]',
            'link[rel*="icon"]'
        ];

        for (const selector of faviconSelectors) {
            const link = document.querySelector(selector);
            if (link && link.href) {
                favicon = link.href;
                break;
            }
        }

        // Get JS Hook detections from storage
        let jsHooks = [];
        try {
            const hookData = await new Promise((resolve) => {
                chrome.storage.local.get(['scrapfly_js_hook_detections'], (result) => {
                    resolve(result.scrapfly_js_hook_detections || {});
                });
            });

            const currentHooks = hookData[window.location.href];
            if (currentHooks && currentHooks.hooks) {
                jsHooks = currentHooks.hooks;
                Logger.detection(`[JS Hooks] Found ${jsHooks.length} hook detections for this page`);
            }
        } catch (error) {
            Logger.error('HOOKS', '[JS Hooks] Error loading hook detections:', error);
        }

        // OPTIMIZATION 8A + 8E + C.1: Smart lazy data collection
        let cachedPageHTML = null;
        let cachedCookies = null;
        let cachedContent = null;
        let cachedDOM = null;
        let cachedStorageCookies = null;

        const pageData = {
            url: window.location.href,
            hostname: window.location.hostname,
            title: document.title || 'Untitled',
            favicon: favicon,
            timestamp: new Date().toISOString(),

            externalContent: externalContent,
            jsHooks: jsHooks,
            headers: [],

            _extractCookies: () => this.extractCookies(),
            _extractStorageCookies: () => this.extractStorageCookies(),
            _extractScriptElements: () => this.extractScriptElements(),
            _extractDOM: () => this.extractDOM()
        };

        if (usedMethods.cookie) {
            Object.defineProperty(pageData, 'cookies', {
                get() {
                    if (cachedCookies === null) {
                        const start = Date.now();
                        cachedCookies = this._extractCookies();
                        Logger.detection(`[C.1: Lazy Cookies] Extracted ${cachedCookies.length} cookies in ${Date.now() - start}ms`);
                    }
                    return cachedCookies;
                },
                set(value) { cachedCookies = value; },
                enumerable: true
            });

            Object.defineProperty(pageData, 'storageCookies', {
                get() {
                    if (cachedStorageCookies === null) {
                        const start = Date.now();
                        cachedStorageCookies = this._extractStorageCookies();
                        Logger.detection(`[C.1: Lazy Storage] Extracted ${cachedStorageCookies.length} storage items in ${Date.now() - start}ms`);
                    }
                    return cachedStorageCookies;
                },
                set(value) { cachedStorageCookies = value; },
                enumerable: true
            });
        } else {
            Logger.detection('[C.1] Skipped cookies getter - no detector uses cookie detection');
        }

        if (usedMethods.content) {
            Object.defineProperty(pageData, 'content', {
                get() {
                    if (cachedContent === null) {
                        const start = Date.now();
                        cachedContent = this._extractScriptElements();
                        Logger.detection(`[C.1: Lazy Content] Extracted ${cachedContent.length} scripts in ${Date.now() - start}ms`);
                    }
                    return cachedContent;
                },
                set(value) { cachedContent = value; },
                enumerable: true
            });
        } else {
            Logger.detection('[C.1] Skipped content getter - no detector uses content detection');
        }

        if (usedMethods.dom) {
            Object.defineProperty(pageData, 'dom', {
                get() {
                    if (cachedDOM === null) {
                        const start = Date.now();
                        cachedDOM = this._extractDOM();
                        Logger.detection(`[C.1: Lazy DOM] Extracted ${cachedDOM.length} elements in ${Date.now() - start}ms`);
                    }
                    return cachedDOM;
                },
                set(value) { cachedDOM = value; },
                enumerable: true
            });
        } else {
            Logger.detection('[C.1] Skipped DOM getter - no detector uses DOM detection');
        }

        if (usedMethods.content) {
            Object.defineProperty(pageData, 'pageHTML', {
                get() {
                    if (cachedPageHTML === null) {
                        cachedPageHTML = document.body ? document.body.innerHTML : '';
                        Logger.detection(`[C.1: Lazy HTML] Extracted pageHTML on first access (${cachedPageHTML.length} bytes)`);
                    }
                    return cachedPageHTML;
                },
                set(value) { cachedPageHTML = value; },
                enumerable: true
            });
        } else {
            Logger.detection('[C.1] Skipped pageHTML getter - content detection not used');
        }

        this.detectionData = pageData;
        this.lastDetectionTime = Date.now();

        const collectionTime = Date.now() - startTime;
        const skippedMethods = Object.entries(usedMethods).filter(([k, v]) => !v).map(([k]) => k);
        Logger.detection(`[C.1: Smart Collection] Data collected in ${collectionTime}ms`);
        if (skippedMethods.length > 0) {
            Logger.detection(`[C.1: Smart Collection] Skipped ${skippedMethods.length} unused methods: ${skippedMethods.join(', ')}`);
        }

        return pageData;
    }

    /**
     * Extract storage cookies from localStorage and sessionStorage
     * @returns {array} Array of storage cookie objects
     */
    extractStorageCookies() {
        const storageCookies = [];

        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                if (key && value) {
                    storageCookies.push({
                        name: key,
                        value: value.substring(0, 100),
                        domain: window.location.hostname,
                        source: 'localStorage'
                    });
                }
            }
        } catch (error) {
            Logger.warn('STORAGE', '[Storage Cookies] Cannot access localStorage:', error.message);
        }

        try {
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                const value = sessionStorage.getItem(key);
                if (key && value) {
                    storageCookies.push({
                        name: key,
                        value: value.substring(0, 100),
                        domain: window.location.hostname,
                        source: 'sessionStorage'
                    });
                }
            }
        } catch (error) {
            Logger.warn('STORAGE', '[Storage Cookies] Cannot access sessionStorage:', error.message);
        }

        if (typeof Logger !== 'undefined') {
            Logger.cache(`Collected ${storageCookies.length} storage items from page`, {
                localStorage: storageCookies.filter(c => c.source === 'localStorage').map(c => c.name),
                sessionStorage: storageCookies.filter(c => c.source === 'sessionStorage').map(c => c.name)
            });
        }

        return storageCookies;
    }

    /**
     * Fetch external resource content (JS, CSS files) via HTTP
     * @returns {Promise<array>} Array of fetched resource content
     */
    async extractExternalContent() {
        const scriptElements = document.querySelectorAll('script[src]');
        const scriptUrls = Array.from(scriptElements).map(s => s.src).filter(Boolean);
        Logger.detection(`extractExternalContent: Found ${scriptUrls.length} external scripts`);

        const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
        const cssUrls = Array.from(linkElements).map(l => l.href).filter(Boolean);
        Logger.detection(`extractExternalContent: Found ${cssUrls.length} CSS files`);

        const allUrls = [...scriptUrls, ...cssUrls];
        Logger.detection(`extractExternalContent: Total ${allUrls.length} external resources to fetch`);

        const CONCURRENCY_LIMIT = 6;
        const MAX_CONTENT_SIZE = 5 * 1024 * 1024;
        const FETCH_TIMEOUT = 5000;

        const startTime = Date.now();
        const results = [];

        for (let i = 0; i < allUrls.length; i += CONCURRENCY_LIMIT) {
            const batch = allUrls.slice(i, i + CONCURRENCY_LIMIT);
            const batchPromises = batch.map(url =>
                fetch(url, {
                    method: 'GET',
                    cache: 'default',
                    credentials: 'omit',
                    signal: AbortSignal.timeout(FETCH_TIMEOUT)
                })
                .then(async response => {
                    if (response.ok) {
                        const contentLength = parseInt(response.headers.get('content-length'), 10);
                        if (contentLength && contentLength > MAX_CONTENT_SIZE) {
                            Logger.detection(`Skipping large file: ${url} (${(contentLength / 1024 / 1024).toFixed(2)} MB)`);
                            return null;
                        }

                        const content = await response.text();

                        if (content.length > MAX_CONTENT_SIZE) {
                            return {
                                url: url,
                                type: url.endsWith('.css') ? 'css' : 'javascript',
                                content: content.substring(0, MAX_CONTENT_SIZE),
                                size: content.length,
                                truncated: true
                            };
                        }

                        return {
                            url: url,
                            type: url.endsWith('.css') ? 'css' : 'javascript',
                            content: content,
                            size: content.length
                        };
                    }
                    return null;
                })
                .catch(error => {
                    Logger.detection(`Error fetching: ${url} (${error.message})`);
                    return null;
                })
            );

            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults);
        }

        const resources = results
            .filter(result => result.status === 'fulfilled' && result.value !== null)
            .map(result => result.value);

        const fetchTime = Date.now() - startTime;
        Logger.detection(`extractExternalContent: Successfully fetched ${resources.length}/${allUrls.length} resources in ${fetchTime}ms`);

        return resources;
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
     * Run detection on all loaded detectors against collected page data
     * Uses pre-computed priorities for faster detection
     * @param {object} pageData - Page data from collectPageData()
     * @returns {Promise<array>} Array of detection results
     */
    async detectOnPage(pageData = {}) {
        Logger.detection('DetectionEngineManager.detectOnPage called');

        if (!this.detectors) {
            Logger.error('DETECTION', 'Detectors not set!');
            throw new Error('Detectors not set. Call setDetectors() first.');
        }

        const detections = [];
        const { url = '', content = [], dom = [], cookies = [], headers = {}, pageHTML = '', externalContent = [], jsHooks = [], payload, payloads, networkUrls = [], allCookies = [], responseCookies = [], storageCookies = [] } = pageData;

        const cookiesToMatch = allCookies.length > 0 ? allCookies : cookies;

        const startTime = Date.now();

        Logger.detection('Page Data Summary:', {
            url: url,
            contentCount: content.length,
            domCount: dom.length,
            documentCookies: cookies.length,
            allCookies: allCookies.length,
            cookiesForMatching: cookiesToMatch.length,
            headersCount: Object.keys(headers).length,
            pageHTMLLength: pageHTML.length,
            externalContentCount: externalContent.length
        });

        const categoriesCount = Object.keys(this.detectors).length;
        Logger.detection(`Processing ${categoriesCount} categories...`);

        // Use pre-computed priorities (saves 50-100ms per detection)
        let detectorPriorities = this.precomputedPriorities || [];

        if (detectorPriorities.length === 0) {
            Logger.warn('PERF', '[Phase 1 Optimization] Pre-computed priorities missing - falling back to runtime calculation');
            this._precomputePriorities();
            detectorPriorities = this.precomputedPriorities || [];
        }

        Logger.detection(`Running ${detectorPriorities.length} detectors (using pre-computed priorities)`);

        let highConfidenceCount = 0;
        const HIGH_CONFIDENCE_THRESHOLD = 95;
        const EARLY_EXIT_COUNT = 3;

        for (const { category, detectorName, detector } of detectorPriorities) {
            const detection = this.runDetector(detector, { url, content, dom, cookies, headers, pageHTML, externalContent, payload, payloads, networkUrls, allCookies, responseCookies, storageCookies });
            if (detection.detected) {
                Logger.detection(`DETECTED: ${detectorName} (confidence: ${detection.confidence}%)`);
                const detectionObj = {
                    ...detection,
                    category,
                    detector: DetectionEngineManager.buildDetectorInfo(detector, detectorName, detectorName)
                };

                if (!detectionObj.detector?.id) {
                    Logger.error('DETECTION', `[detectOnPage] CRITICAL: Detection created without detector.id for ${detectorName}:`, {
                        hasDetector: !!detectionObj.detector,
                        detectorId: detectionObj.detector?.id,
                        detectorName: detectionObj.detector?.name
                    });
                }

                detections.push(detectionObj);

                if (detection.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
                    highConfidenceCount++;
                }

                if (highConfidenceCount >= EARLY_EXIT_COUNT) {
                    Logger.detection(`Early exit: Found ${highConfidenceCount} high-confidence detections`);
                    break;
                }
            }
        }

        // Process JS Hook detections from MAIN world
        if (jsHooks && jsHooks.length > 0) {
            Logger.detection(`[JS Hooks] Processing ${jsHooks.length} hook detections`);

            // Build detector lookup table once (O(1) lookup instead of nested loop)
            const detectorLookup = new Map();
            for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
                for (const [detectorId, detector] of Object.entries(categoryDetectors)) {
                    detectorLookup.set(detector.id || detectorId, { category, detector });
                }
            }

            for (const hookData of jsHooks) {
                const found = detectorLookup.get(hookData.detectorId);

                if (found) {
                    const { category, detector } = found;
                    const existingDetection = detections.find(d => d.detector.id === hookData.detectorId);

                    if (existingDetection) {
                        existingDetection.matches.push({
                            type: 'js_hooks',
                            target: hookData.target,
                            value: hookData.target,
                            confidence: hookData.confidence || 80,
                            description: hookData.description || 'JavaScript API hook'
                        });

                        if (!existingDetection.detectionMethods) {
                            existingDetection.detectionMethods = [];
                        }
                        if (!existingDetection.detectionMethods.includes('js_hooks')) {
                            existingDetection.detectionMethods.push('js_hooks');
                        }

                        existingDetection.confidence = this.confidenceManager
                            ? this.confidenceManager.calculateConfidence(existingDetection.matches)
                            : Math.max(...existingDetection.matches.map(m => m.confidence || 0), 0);

                        Logger.detection(`[JS Hooks] Added hook to existing detection: ${detector.name}`);
                    } else {
                        detections.push({
                            detected: true,
                            confidence: hookData.confidence || 80,
                            matches: [{
                                type: 'js_hooks',
                                target: hookData.target,
                                value: hookData.target,
                                confidence: hookData.confidence || 80,
                                description: hookData.description || 'JavaScript API hook'
                            }],
                            detectionMethods: ['js_hooks'],
                            category,
                            detector: DetectionEngineManager.buildDetectorInfo(detector, hookData.detectorName, hookData.detectorId)
                        });

                        Logger.detection(`[JS Hooks] Created new detection: ${detector.name}`);
                    }
                }
            }
        }

        const detectionTime = Date.now() - startTime;
        Logger.detection(`Total detections found: ${detections.length} in ${detectionTime}ms`);
        if (detections.length > 0) {
            Logger.detection('Detections:', detections.map(d => d.detector.name));
        }

        return detections;
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

    // ========== Cache & Detection Data Methods ==========
    // Restored from pre-cleanup version (lost in commit d430159)

    /**
     * Look up cached detection data by URL hash
     * @param {string} url - Page URL
     * @returns {Promise<object|null>} Cached detection data or null
     */
    static async getStoredDetection(url) {
        try {
            const cacheScope = await Utils.getCacheScope();
            const result = await chrome.storage.local.get([DetectionEngineManager.STORAGE_KEY]);
            const storage = result[DetectionEngineManager.STORAGE_KEY] || {};
            const urlHash = UrlUtils.hashUrl(url, cacheScope);

            const stored = storage[urlHash];

            if (stored) {
                // Validate cache scope matches current settings
                if (stored.cacheScope && stored.cacheScope !== cacheScope) {
                    Logger.detection(`[getStoredDetection] Cache scope mismatch: stored with '${stored.cacheScope}', current is '${cacheScope}' - treating as cache miss`);
                    return null;
                }

                // Check if stored detection is expired
                if (Date.now() < stored.expiry) {
                    Logger.detection(`[getStoredDetection] Cache hit for ${url} (expires in ${Math.round((stored.expiry - Date.now()) / 1000 / 60)} minutes)`);
                    return stored;
                } else {
                    Logger.detection(`[getStoredDetection] Cache expired for ${url}`);
                    delete storage[urlHash];
                    await chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: storage });
                }
            }
        } catch (error) {
            Logger.error('DETECTION', 'getStoredDetection: Error reading stored detections:', error);
        }
        return null;
    }

    /**
     * Get detection data for a specific tab
     * @param {number} tabId - Tab ID
     * @returns {Promise<object|null>} Detection data or null
     */
    static async getDetectionData(tabId) {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (!tab || !tab.url) {
                return null;
            }

            const storedData = await DetectionEngineManager.getStoredDetection(tab.url);
            if (storedData) {
                return {
                    data: storedData,
                    detectionResults: storedData.detectionResults || [],
                    timestamp: storedData.timestamp,
                    expiry: storedData.expiry,
                    storageExpiry: storedData.expiry,
                    fromStorage: true,
                    processed: true,
                    url: storedData.url,
                    cacheScope: storedData.cacheScope
                };
            }
        } catch (error) {
            Logger.error('DETECTION', 'getDetectionData: Error:', error);
        }

        return null;
    }

    /**
     * Store detection results for a URL
     * @param {string} url - Page URL
     * @param {object} pageData - Page data (url, hostname, favicon)
     * @param {array} detectionResults - Detection results
     * @returns {Promise<object|null>} Stored data object or null
     */
    static async storeDetection(url, pageData, detectionResults) {
        try {
            const cacheScope = await Utils.getCacheScope();
            const result = await chrome.storage.local.get([DetectionEngineManager.STORAGE_KEY]);
            const storage = result[DetectionEngineManager.STORAGE_KEY] || {};
            const urlHash = UrlUtils.hashUrl(url, cacheScope);

            // Compress detectionResults to essential fields only
            const compressedResults = detectionResults.map((detection) => {
                return {
                    id: detection.id,
                    detector: {
                        id: detection.detector?.id,
                        name: detection.detector?.name || detection.name || 'Unknown',
                        icon: detection.detector?.icon || 'custom.png',
                        color: detection.detector?.color,
                        description: detection.detector?.description
                    },
                    category: detection.category,
                    confidence: detection.confidence,
                    matches: detection.matches?.map(m => ({
                        type: m.type,
                        pattern: m.pattern,
                        value: m.value || m.pattern || m.name || m.selector,
                        confidence: m.confidence,
                        description: m.description,
                        fullUrl: m.fullUrl
                    })) || []
                };
            });

            // Calculate overall confidence
            const overallConfidence = detectionResults.length > 0
                ? Math.round(detectionResults.reduce((sum, d) => sum + d.confidence, 0) / detectionResults.length)
                : 0;

            const expiryMs = await DetectionEngineManager.getExpiryMs();

            const storedData = {
                url: url,
                hostname: pageData.hostname,
                favicon: pageData.favicon || '',
                detectionResults: compressedResults,
                timestamp: Date.now(),
                expiry: Date.now() + expiryMs,
                confidence: overallConfidence,
                detectionCount: detectionResults.length,
                fromStorage: false,
                cacheScope: cacheScope
            };

            storage[urlHash] = storedData;
            await chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: storage });

            Logger.detection(`[storeDetection] Stored ${detectionResults.length} detections for ${url}`);
            return storedData;
        } catch (error) {
            Logger.error('STORAGE', '[storeDetection] Error storing detection:', error);
            return null;
        }
    }

    /**
     * Handle PAGE_LOAD_NOTIFICATION message
     * @param {object} request - Message request object
     * @param {object} sender - Message sender
     * @param {object} dependencies - Required dependencies
     */
    static async handlePageLoadNotification(request, sender, dependencies) {
        const { chrome, CategoryManager, History, Utils, categoryManager, recentDetectionRequests } = dependencies;

        const pageUrl = request.url;
        const tabId = sender.tab?.id;
        const triggerSource = request.triggerSource || 'unknown';

        if (!tabId) {
            Logger.error('DETECTION', 'No tab ID in PAGE_LOAD_NOTIFICATION');
            return;
        }

        Logger.detection(`[handlePageLoadNotification] Detection trigger: ${triggerSource} for tab ${tabId}`);

        // Check if extension is enabled
        try {
            const result = await chrome.storage.local.get(['scrapfly_enabled']);
            if (result.scrapfly_enabled === false) {
                Logger.detection('Extension is disabled, skipping page load detection');
                chrome.action.setBadgeText({ text: BADGE.TEXT.DISABLED, tabId: tabId }).catch(() => {});
                chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.DISABLED, tabId: tabId }).catch(() => {});
                return;
            }
        } catch (error) {
            Logger.error('DETECTION', 'Failed to check enabled state:', error);
        }

        // Check if URL is blacklisted
        const isBlacklisted = await Utils.isUrlBlacklisted(pageUrl);
        if (isBlacklisted) {
            Logger.detection(`[handlePageLoadNotification] URL is blacklisted: ${pageUrl}`);
            chrome.action.setBadgeText({ text: BADGE.TEXT.BLACKLISTED, tabId: tabId }).catch(() => {});
            chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.BLACKLISTED, tabId: tabId }).catch(() => {});
            return;
        }

        // Check cache first
        const storedData = await DetectionEngineManager.getStoredDetection(pageUrl);

        if (storedData) {
            Logger.detection(`[handlePageLoadNotification] Cache hit for ${pageUrl} (${storedData.detectionCount} detectors)`);

            // Update badge with cached detection count
            if (storedData.detectionCount > 0) {
                const badgeColors = await CategoryManager.getBadgeColors(categoryManager);
                const count = storedData.detectionCount.toString();
                const color = storedData.detectionCount >= 5 ? badgeColors.high :
                             storedData.detectionCount >= 3 ? badgeColors.medium :
                             badgeColors.low;
                chrome.action.setBadgeText({ text: count, tabId: tabId }).catch(() => {});
                chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId }).catch(() => {});
            } else {
                chrome.action.setBadgeText({ text: BADGE.TEXT.CLEAN, tabId: tabId }).catch(() => {});
                chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.CLEAN, tabId: tabId }).catch(() => {});
            }

            // Notify popup if open
            chrome.runtime.sendMessage({
                type: 'NEW_DETECTION_DATA',
                tabId: tabId,
                url: pageUrl,
                detectionResults: storedData.detectionResults,
                fromStorage: true
            }).catch(() => {});

            // Notify content script to disable monitoring (cache hit)
            chrome.tabs.sendMessage(tabId, {
                type: 'CACHE_HIT_DISABLE_MONITORING',
                url: pageUrl
            }).catch(() => {});

            // Check if we should save to history on cache hit
            const historySettings = await Utils.getHistorySettings();
            if (historySettings.historyBypassCache === true && storedData.detectionResults && storedData.detectionResults.length > 0) {
                const shouldSave = await History.shouldSaveToHistory(pageUrl, historySettings, chrome);
                if (shouldSave) {
                    const tab = await chrome.tabs.get(tabId).catch(() => null);
                    if (tab) {
                        const pageData = {
                            url: pageUrl,
                            hostname: UrlUtils.getHostnameFromUrl(pageUrl),
                            title: tab.title || 'Untitled',
                            favicon: tab.favIconUrl || UrlUtils.getFaviconUrl(pageUrl)
                        };
                        await History.saveDetectionToHistory(tabId, pageData, storedData.detectionResults, chrome);
                    }
                }
            }

            return;
        }

        // Cache miss - skip if recent detection exists
        if (Utils.shouldSkipDetection(tabId, 1500, recentDetectionRequests)) {
            Logger.detection(`Skipping duplicate detection request for tab ${tabId}`);
            return;
        }

        // Show loading indicator
        try {
            chrome.action.setBadgeText({ text: BADGE.TEXT.LOADING, tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.LOADING, tabId: tabId });
        } catch (error) {
            Logger.error('DETECTION', 'Failed to set loading badge:', error);
        }

        // Request data collection from content script with retry
        let retryCount = 0;
        const maxRetries = 5;
        const retryDelay = 200;

        const sendDataRequest = () => {
            chrome.tabs.sendMessage(tabId, { type: 'REQUEST_PAGE_DATA' }, (response) => {
                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError?.message || '';
                    if ((errorMsg.includes('Could not establish connection') ||
                         errorMsg.includes('Receiving end does not exist') ||
                         errorMsg.includes('No receiving end')) && retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(sendDataRequest, retryDelay);
                    } else {
                        Logger.warn('DETECTION', `Failed to send data collection request after ${retryCount} retries: ${errorMsg}`);
                    }
                }
            });
        };

        sendDataRequest();
    }

    /**
     * Handle CLEAR_DETECTION_CACHE message
     * @param {object} request - Message request object
     * @param {function} sendResponse - Response callback
     * @param {Set} manuallyClearedCaches - Set to track manually cleared URLs
     * @returns {boolean} True (async response)
     */
    static async handleClearDetectionCache(request, sendResponse, manuallyClearedCaches = null) {
        try {
            const cacheScope = await Utils.getCacheScope();
            const result = await chrome.storage.local.get([DetectionEngineManager.STORAGE_KEY]);
            const storage = result[DetectionEngineManager.STORAGE_KEY] || {};
            const urlHash = UrlUtils.hashUrl(request.url, cacheScope);

            if (storage[urlHash]) {
                delete storage[urlHash];
                await chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: storage });

                if (manuallyClearedCaches) {
                    manuallyClearedCaches.add(urlHash);
                }

                // Notify content script to clear sessionStorage cache flag
                if (request.tabId) {
                    try {
                        await chrome.tabs.sendMessage(request.tabId, {
                            type: 'CLEAR_SESSION_CACHE'
                        });
                    } catch (e) {
                        // Content script might not be loaded
                    }
                }

                sendResponse({ status: 'cleared', urlHash });
            } else {
                sendResponse({ status: 'not_found' });
            }
        } catch (error) {
            Logger.error('DETECTION', 'Error clearing cache:', error);
            sendResponse({ status: 'error', error: error.message });
        }

        return true;
    }

    /**
     * Handle REQUEST_DETECTION message - manually triggered detection
     * @param {object} request - Message request object
     * @param {function} sendResponse - Response callback
     * @param {object} dependencies - Required dependencies
     * @returns {boolean} True (async response)
     */
    static async handleRequestDetection(request, sendResponse, dependencies) {
        const { chrome, Utils, recentDetectionRequests } = dependencies;
        const tabId = request.tabId;

        if (!tabId) {
            sendResponse({ status: 'error', error: 'No tab ID provided' });
            return false;
        }

        // Check if extension is enabled
        try {
            const result = await chrome.storage.local.get(['scrapfly_enabled']);
            if (result.scrapfly_enabled === false) {
                sendResponse({ status: 'error', error: 'Extension is disabled' });
                return true;
            }
        } catch (error) {
            Logger.error('DETECTION', 'Failed to check enabled state:', error);
        }

        try {
            const tab = await chrome.tabs.get(tabId);

            if (!Utils.isValidContentScriptTab(tab)) {
                sendResponse({ status: 'error', error: 'Invalid URL for detection' });
                return true;
            }

            if (Utils.shouldSkipDetection(tabId, 2000, recentDetectionRequests)) {
                sendResponse({ status: 'skipped', reason: 'Recent detection exists' });
                return true;
            }

            const isSilent = request.silent === true;

            if (!isSilent) {
                try {
                    chrome.action.setBadgeText({ text: BADGE.TEXT.LOADING, tabId: tabId });
                    chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.LOADING, tabId: tabId });
                } catch (error) {
                    Logger.error('DETECTION', 'Failed to set loading badge:', error);
                }
            }

            // Try to ping the content script first
            let scriptExists = false;
            try {
                await new Promise((resolve) => {
                    chrome.tabs.sendMessage(tabId, { type: 'GET_DETECTION_STATUS' }, (response) => {
                        if (!chrome.runtime.lastError && response && response.status === 'active') {
                            scriptExists = true;
                        }
                        resolve();
                    });
                });
            } catch (e) {
                // Content script may not be ready
            }

            // If script doesn't exist, inject it
            if (!scriptExists) {
                try {
                    const [checkResult] = await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: () => typeof window.DetectionEngineManager !== 'undefined'
                    });

                    if (!checkResult.result) {
                        const scriptsToInject = [
                            'modules/core/logger.js',
                            'utils/utils.js',
                            'utils/pattern-cache.js',
                            'modules/core/storage-manager.js',
                            'modules/detection/managers/confidence-manager.js',
                            'modules/detection/engine/detection-engine-analysis.js',
                            'modules/detection/engine/detection-engine-extractors.js',
                            'modules/detection/engine/detection-engine-matching.js',
                            'modules/detection/engine/detection-engine-hooks.js',
                            'modules/detection/engine/detection-engine-manager.js',
                            'sections/settings/settings-runtime.js'
                        ];

                        for (const file of scriptsToInject) {
                            await chrome.scripting.executeScript({
                                target: { tabId: tabId },
                                files: [file]
                            });
                        }
                    }

                    await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content.js']
                    });

                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (injectionError) {
                    Logger.error('DETECTION', 'Failed to inject scripts:', injectionError);
                    sendResponse({ status: 'error', error: `Script injection failed: ${injectionError.message}` });
                    return true;
                }
            }

            // Send the detection request
            chrome.tabs.sendMessage(tabId, {
                type: 'RUN_DETECTION',
                silent: isSilent
            }, (response) => {
                if (chrome.runtime.lastError) {
                    Logger.error('DETECTION', 'Failed to trigger detection:', chrome.runtime.lastError.message);
                    sendResponse({ status: 'error', error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ status: 'requested', response: response });
                }
            });
        } catch (error) {
            Logger.error('DETECTION', 'Error in REQUEST_DETECTION:', error);
            sendResponse({ status: 'error', error: error.message });
        }

        return true;
    }
}
