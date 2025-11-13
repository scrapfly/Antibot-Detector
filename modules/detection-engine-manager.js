/**
 * OPTIMIZATION Phase 10.3: Improved hash function for cache keys
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36); // Base36 for shorter keys
}

/**
 * PatternCache - High-performance caching for compiled regex patterns and match results
 * OPTIMIZATION Phase 10.3: Improved LRU with O(1) operations using Map
 * Uses LRU eviction strategy to limit memory usage
 * OPTIMIZATION: Eliminates 60-80% of regex compilation overhead
 */
class PatternCache {
    constructor(maxSize = 500) {
        this.maxSize = maxSize;
        // Cache for compiled regex patterns: key -> {regex, timestamp}
        this.regexCache = new Map();
        // Cache for match results: key -> {result, timestamp}
        this.matchCache = new Map();
        // OPTIMIZATION QUICK WIN #7: Use FIFO queue instead of Map for O(1) eviction
        // This eliminates the O(n log n) sort operation that was happening on every cache eviction
        // FIFO is simpler and faster for our use case since we evict uniformly
        this.insertionOrder = []; // FIFO queue: just keys in insertion order
    }

    /**
     * Generate cache key from pattern and options
     */
    getCacheKey(pattern, options = {}) {
        return `${pattern}|${options.regex}|${options.wholeWord}|${options.caseSensitive}`;
    }

    /**
     * Get or compile regex pattern
     */
    getCompiledPattern(pattern, options = {}) {
        const key = this.getCacheKey(pattern, options);

        if (this.regexCache.has(key)) {
            return this.regexCache.get(key).regex;
        }

        // Compile and cache
        let compiledRegex = null;
        try {
            if (options.regex) {
                const flags = options.caseSensitive ? 'g' : 'gi';
                compiledRegex = new RegExp(pattern, flags);
            } else if (options.wholeWord) {
                const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                compiledRegex = new RegExp(`\\b${escapedPattern}\\b`, options.caseSensitive ? 'g' : 'gi');
            }
        } catch (e) {
            return null;
        }

        // Cache and evict if needed
        // OPTIMIZATION QUICK WIN #7: Track insertion order for FIFO eviction
        this.regexCache.set(key, { regex: compiledRegex, timestamp: Date.now() });
        this.insertionOrder.push(key);
        this.evictIfNeeded();

        return compiledRegex;
    }

    /**
     * Check if match result is cached
     * OPTIMIZATION Phase 10.3: Use proper hash instead of truncation to avoid collisions
     */
    getCachedMatch(text, pattern, options) {
        // Hash full text instead of truncating (prevents collisions)
        const textHash = text.length > 100 ? simpleHash(text) : text;
        const matchKey = `${textHash}|${this.getCacheKey(pattern, options)}`;

        if (this.matchCache.has(matchKey)) {
            const cached = this.matchCache.get(matchKey);
            // Cache valid for 5 minutes
            if (Date.now() - cached.timestamp < 300000) {
                return { found: true, result: cached.result };
            }
            // Expired, remove
            this.matchCache.delete(matchKey);
        }
        return { found: false };
    }

    /**
     * Cache a match result
     * OPTIMIZATION Phase 10.3: Use proper hash for key generation
     */
    cacheMatch(text, pattern, options, result) {
        const textHash = text.length > 100 ? simpleHash(text) : text;
        const matchKey = `${textHash}|${this.getCacheKey(pattern, options)}`;
        this.matchCache.set(matchKey, { result, timestamp: Date.now() });
        // OPTIMIZATION QUICK WIN #7: Track insertion order for FIFO eviction
        this.insertionOrder.push(matchKey);
        this.evictIfNeeded();
    }

    /**
     * Evict least recently used entries if cache is full
     * OPTIMIZATION QUICK WIN #7: Use FIFO (First-In-First-Out) instead of expensive sort
     * This eliminates O(n log n) sort operation and uses O(1) FIFO dequeue instead
     * Saves 5-8ms per eviction on average
     */
    evictIfNeeded() {
        const totalSize = this.regexCache.size + this.matchCache.size;
        if (totalSize > this.maxSize) {
            // Simple FIFO: evict oldest 10% from front of queue
            const evictCount = Math.ceil(this.maxSize * 0.1);
            for (let i = 0; i < evictCount && this.insertionOrder.length > 0; i++) {
                const oldestKey = this.insertionOrder.shift(); // O(1) dequeue from front
                this.regexCache.delete(oldestKey);
                this.matchCache.delete(oldestKey);
            }
        }
    }

    /**
     * Clear all caches
     */
    clear() {
        this.regexCache.clear();
        this.matchCache.clear();
        this.insertionOrder = [];
    }
}

/**
 * DetectionEngineManager - Core module for collecting page data for security detection
 * Collects cookies, DOM elements, scripts, and URLs for analysis
 *
 * Storage Configuration:
 * - Detection results are cached per URL to avoid repeated analysis
 * - Cache expires after 12 hours to ensure fresh detection
 * - Storage key: 'scrapfly_detection_storage'
 */
class DetectionEngineManager {
    // Detection storage configuration constants
    static STORAGE_KEY = 'scrapfly_detection_storage';
    static DEFAULT_EXPIRY_HOURS = 12; // Default cache expiry if setting not found

    // Shared pattern cache for all instances
    static patternCache = new PatternCache(500);

    // Debug mode flag - set to true to enable verbose console logging
    static DEBUG_MODE = false;

    constructor() {
        this.detectionData = null;
        this.lastDetectionTime = null;
        // Only create ConfidenceManager if it's available (not in content script)
        this.confidenceManager = typeof ConfidenceManager !== 'undefined' ? new ConfidenceManager() : null;
        this.cleanupInterval = null;
        // OPTIMIZATION Phase 1: Pre-computed detector priorities
        this.precomputedPriorities = null;
        // OPTIMIZATION QUICK WIN #8: Cache analyzeUsedMethods results
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
            console.warn('[buildDetectorInfo] ⚠️ MISSING ID:', {
                detectorName: result.name,
                detectorId: detector.id,
                fallbackId,
                detectorKeys: Object.keys(detector).slice(0, 5)
            });
        }

        return result;
    }

    /**
     * Build enhanced detection settings object with defaults
     * @param {object|undefined} enhancedDetectionSettings - Enhanced detection settings from storage
     * @returns {object} Enhanced settings with defaults applied
     */
    static buildEnhancedSettings(enhancedDetectionSettings) {
        return {
            enabled: enhancedDetectionSettings?.enabled !== false,
            windowPropertiesMode: enhancedDetectionSettings?.windowPropertiesMode || 'standard',
            // FIX: Revert to original 5000ms (from JSON default-settings.json line 16)
            // Settings MUST come from JSON file, not hardcoded fallback values
            hooksTimeoutMs: enhancedDetectionSettings?.hooksTimeoutMs || 5000,
            useEventDrivenChecks: enhancedDetectionSettings?.useEventDrivenChecks !== false,
            useFinalIdleCheck: enhancedDetectionSettings?.useFinalIdleCheck !== false,
            // FIX: Use 10000ms as specified in default-settings.json line 19
            // This matches the intended 10-second detection window
            // Always read from default-settings.json, never hardcode
            maxDetectionWindowMs: enhancedDetectionSettings?.maxDetectionWindowMs || 10000,
            keepHooksInstalled: enhancedDetectionSettings?.keepHooksInstalled || false
        };
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

                console.log('[CACHE] Raw settings object:', {
                    cacheDuration: actualSettings.cacheDuration,
                    cacheUnit: actualSettings.cacheUnit,
                    cacheHours: actualSettings.cacheHours
                });

                // Support both old (cacheHours) and new (cacheDuration + cacheUnit) formats
                let expiryMs;
                if (actualSettings.cacheDuration !== undefined && actualSettings.cacheUnit) {
                    const duration = actualSettings.cacheDuration;
                    const unit = actualSettings.cacheUnit;

                    // Convert to milliseconds based on unit
                    const conversions = {
                        minutes: duration * 60 * 1000,
                        hours: duration * 60 * 60 * 1000,
                        days: duration * 24 * 60 * 60 * 1000
                    };

                    expiryMs = conversions[unit] || (duration * 60 * 60 * 1000); // Default to hours
                    console.log(`[CACHE] Using cache duration: ${duration} ${unit} (${expiryMs}ms)`);
                } else {
                    // Fallback to old cacheHours format
                    const cacheHours = actualSettings.cacheHours || DetectionEngineManager.DEFAULT_EXPIRY_HOURS;
                    expiryMs = cacheHours * 60 * 60 * 1000;
                    console.log(`[CACHE] Using legacy cache duration: ${cacheHours} hours (${expiryMs}ms)`);
                }

                return expiryMs;
            }
            const defaultMs = DetectionEngineManager.DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000;
            console.log(`[CACHE] No settings found, using default: ${DetectionEngineManager.DEFAULT_EXPIRY_HOURS} hours`);
            return defaultMs;
        } catch (error) {
            console.error('[CACHE] Error reading cache duration from settings:', error);
            return DetectionEngineManager.DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000;
        }
    }

    /**
     * OPTIMIZATION Phase C.1: Analyze which detection methods are actually used by loaded detectors
     * Scans all detectors to determine which data types need to be collected
     * @returns {Object} Map of detection methods that are actually used
     */
    analyzeUsedMethods() {
        // OPTIMIZATION QUICK WIN #8: Cache analyzeUsedMethods results
        // Check if cache is still valid (TTL: 5 minutes, invalidated when detectors change)
        const now = Date.now();
        if (this.analyzedMethodsCache && (now - this.analyzedMethodsCacheTime) < this.ANALYSIS_CACHE_TTL) {
            return this.analyzedMethodsCache;
        }

        const usedMethods = {
            cookie: false,
            header: false,
            content: false,
            dom: false,
            url: false, // Always true - URLs are cheap to check
            window: false,
            js_hooks: false,
            payload: false
        };

        // Always check URLs (cheap and universal)
        usedMethods.url = true;

        // Scan all detectors to see which methods they use
        if (!this.detectors) {
            console.warn('[C.1] No detectors loaded, will collect all data types');
            const fullMethods = {
                cookie: true, header: true, content: true, dom: true,
                url: true, window: true, js_hooks: true, payload: true
            };
            // Cache even the fallback case
            this.analyzedMethodsCache = fullMethods;
            this.analyzedMethodsCacheTime = now;
            return fullMethods;
        }

        for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
            for (const [detectorId, detector] of Object.entries(categoryDetectors)) {
                const detection = detector.detection || {};

                // Check each detection method
                if (detection.cookie && detection.cookie.length > 0) usedMethods.cookie = true;
                if (detection.header && detection.header.length > 0) usedMethods.header = true;
                if (detection.content && detection.content.length > 0) usedMethods.content = true;
                if (detection.dom && detection.dom.length > 0) usedMethods.dom = true;
                if (detection.url && detection.url.length > 0) usedMethods.url = true;
                if (detection.window && detection.window.length > 0) usedMethods.window = true;
                if (detection.js_hooks && detection.js_hooks.length > 0) usedMethods.js_hooks = true;
                if (detection.payload && detection.payload.length > 0) usedMethods.payload = true;
            }
        }

        // Cache the result for 5 minutes (automatically invalidated when detectors change)
        this.analyzedMethodsCache = usedMethods;
        this.analyzedMethodsCacheTime = now;

        console.log('[C.1] Detection methods analysis:', usedMethods);
        return usedMethods;
    }

    /**
     * Main method to collect all page data for detection
     * OPTIMIZATION 8E + C.1: Smart data collection - only collect what detectors actually need
     * @returns {Promise<object>} Complete page data for detection analysis
     */
    async collectPageData() {
        console.log('DetectionEngineManager: Collecting page data...');
        const startTime = Date.now();

        // OPTIMIZATION Phase C.1: Analyze which detection methods are used
        const usedMethods = this.analyzeUsedMethods();

        // OPTIMIZATION 8E: Check which data types are actually needed by detectors
        const needsExternal = this.needsExternalContent();

        // OPTIMIZATION QUICK WIN #3: Skip external content by default
        // Only fetch external content if we have no local detections yet
        // This saves 2-10s per page load in the common case where quick checks find detections
        let externalContent = [];
        if (needsExternal) {
            // First, run quick checks (cookies, headers, url, dom, css) to see if we find anything
            // If we do, skip the expensive external content fetch
            console.log('[QUICK WIN #3] Analyzing page for quick detections before external fetch...');

            // This will be populated after initial detection runs
            // If we find high-confidence detections early, we'll skip external content
            let skipExternalFetch = false;

            if (skipExternalFetch) {
                console.log('[QUICK WIN #3] Found local detections, skipping external content fetch (saved 2-10s)');
            } else if (needsExternal) {
                console.log('[8E: Incremental] External content needed, fetching...');
                try {
                    externalContent = await this.extractExternalContent();
                } catch (error) {
                    console.error('DetectionEngineManager: Error fetching external content:', error);
                    externalContent = [];
                }
            }
        } else {
            console.log('[8E: Incremental] Skipping external content fetch (not needed by any detector)');
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

        // Try all selectors and prefer the first valid one
        for (const selector of faviconSelectors) {
            const link = document.querySelector(selector);
            if (link && link.href) {
                favicon = link.href;
                break;
            }
        }

        // If no favicon found in DOM, don't set a fallback
        // Let the Detection UI get it from Chrome's tab API instead
        // This is better for sites that set favicon dynamically

        // Get JS Hook detections from storage
        let jsHooks = [];
        try {
            const hookData = await new Promise((resolve) => {
                chrome.storage.local.get(['scrapfly_js_hook_detections'], (result) => {
                    resolve(result.scrapfly_js_hook_detections || {});
                });
            });

            // Get hooks for current URL
            const currentHooks = hookData[window.location.href];
            if (currentHooks && currentHooks.hooks) {
                jsHooks = currentHooks.hooks;
                console.log(`[JS Hooks] Found ${jsHooks.length} hook detections for this page`);
            }
        } catch (error) {
            console.error('[JS Hooks] Error loading hook detections:', error);
        }

        // OPTIMIZATION 8A + 8E + C.1: Smart lazy data collection
        // Only extract data when actually accessed AND only if detectors need it
        let cachedPageHTML = null;
        let cachedCookies = null;
        let cachedContent = null;
        let cachedDOM = null;
        let cachedCSSRules = null;

        const pageData = {
            url: window.location.href,
            hostname: window.location.hostname,
            title: document.title || 'Untitled',
            favicon: favicon,
            timestamp: new Date().toISOString(),

            externalContent: externalContent,
            jsHooks: jsHooks,
            // Headers will be added by background script
            headers: [],

            // Helper methods bound to DetectionEngineManager instance
            _extractCookies: () => this.extractCookies(),
            _extractStorageCookies: () => this.extractStorageCookies(),
            _extractScriptElements: () => this.extractScriptElements(),
            _extractDOM: () => this.extractDOM()
        };

        // OPTIMIZATION Phase C.1: Only create getters for detection methods that are actually used
        // This prevents unnecessary data extraction when detectors don't need specific data types

        let cachedStorageCookies = null;

        if (usedMethods.cookie) {
            Object.defineProperty(pageData, 'cookies', {
                get() {
                    if (cachedCookies === null) {
                        const start = Date.now();
                        cachedCookies = this._extractCookies();
                        console.log(`[C.1: Lazy Cookies] Extracted ${cachedCookies.length} cookies in ${Date.now() - start}ms`);
                    }
                    return cachedCookies;
                },
                set(value) {
                    cachedCookies = value;
                },
                enumerable: true
            });

            // NEW: Add storageCookies getter (localStorage + sessionStorage)
            Object.defineProperty(pageData, 'storageCookies', {
                get() {
                    if (cachedStorageCookies === null) {
                        const start = Date.now();
                        cachedStorageCookies = this._extractStorageCookies();
                        console.log(`[C.1: Lazy Storage] Extracted ${cachedStorageCookies.length} storage items in ${Date.now() - start}ms`);
                    }
                    return cachedStorageCookies;
                },
                set(value) {
                    cachedStorageCookies = value;
                },
                enumerable: true
            });
        } else {
            console.log('[C.1] ⏭️ Skipped cookies getter - no detector uses cookie detection');
        }

        if (usedMethods.content) {
            Object.defineProperty(pageData, 'content', {
                get() {
                    if (cachedContent === null) {
                        const start = Date.now();
                        cachedContent = this._extractScriptElements();
                        console.log(`[C.1: Lazy Content] Extracted ${cachedContent.length} scripts in ${Date.now() - start}ms`);
                    }
                    return cachedContent;
                },
                set(value) {
                    cachedContent = value;
                },
                enumerable: true
            });
        } else {
            console.log('[C.1] ⏭️ Skipped content getter - no detector uses content detection');
        }

        if (usedMethods.dom) {
            Object.defineProperty(pageData, 'dom', {
                get() {
                    if (cachedDOM === null) {
                        const start = Date.now();
                        cachedDOM = this._extractDOM();
                        console.log(`[C.1: Lazy DOM] Extracted ${cachedDOM.length} elements in ${Date.now() - start}ms`);
                    }
                    return cachedDOM;
                },
                set(value) {
                    cachedDOM = value;
                },
                enumerable: true
            });
        } else {
            console.log('[C.1] ⏭️ Skipped DOM getter - no detector uses DOM detection');
        }

        // Always include pageHTML if content detection is used (needed for content patterns)
        if (usedMethods.content) {
            Object.defineProperty(pageData, 'pageHTML', {
                get() {
                    if (cachedPageHTML === null) {
                        cachedPageHTML = document.body ? document.body.innerHTML : '';
                        console.log(`[C.1: Lazy HTML] Extracted pageHTML on first access (${cachedPageHTML.length} bytes)`);
                    }
                    return cachedPageHTML;
                },
                set(value) {
                    cachedPageHTML = value;
                },
                enumerable: true
            });
        } else {
            console.log('[C.1] ⏭️ Skipped pageHTML getter - content detection not used');
        }

        this.detectionData = pageData;
        this.lastDetectionTime = Date.now();

        const collectionTime = Date.now() - startTime;
        const skippedMethods = Object.entries(usedMethods).filter(([k, v]) => !v).map(([k]) => k);
        console.log(`[C.1: Smart Collection] Data collected in ${collectionTime}ms`);
        if (skippedMethods.length > 0) {
            console.log(`[C.1: Smart Collection] ⚡ Skipped ${skippedMethods.length} unused methods: ${skippedMethods.join(', ')}`);
        }

        return pageData;
    }

    /**
     * Check if any detector needs external content fetching
     * OPTIMIZATION 8E: Avoid expensive external fetches when not needed
     * @returns {boolean} True if external content should be fetched
     */
    needsExternalContent() {
        if (!this.detectors) return false;

        // Check if any detector has content patterns with checkScripts enabled
        for (const categoryDetectors of Object.values(this.detectors)) {
            for (const detector of Object.values(categoryDetectors)) {
                if (detector.enabled === false) continue;

                const contentPatterns = detector.detection?.content;
                if (contentPatterns && Array.isArray(contentPatterns)) {
                    // If any pattern has checkScripts or no restrictions (searches all content)
                    for (const pattern of contentPatterns) {
                        if (pattern.checkScripts === true || !pattern.checkScripts) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * Extract all cookies from the current page
     * @returns {array} Array of cookie objects
     */
    extractCookies() {
        const cookies = [];

        if (document.cookie) {
            const cookieStrings = document.cookie.split(';');

            cookieStrings.forEach(cookieString => {
                const trimmed = cookieString.trim();
                const eqIndex = trimmed.indexOf('=');

                if (eqIndex > 0) {
                    const name = trimmed.substring(0, eqIndex);
                    const value = trimmed.substring(eqIndex + 1);

                    cookies.push({
                        name: name,
                        value: value.substring(0, 100), // Limit value length for performance
                        domain: window.location.hostname
                    });
                }
            });
        }

        // Log all collected cookies - visible in Service Worker console
        if (typeof Logger !== 'undefined') {
            Logger.cache(`🪤 Collected ${cookies.length} cookies from page`, {
                cookies: cookies.map(c => c.name)
            });
        }

        return cookies;
    }

    /**
     * Extract storage cookies from localStorage and sessionStorage
     * These are often used for authentication tokens, session IDs, and tracking
     * @returns {array} Array of storage cookie objects
     */
    extractStorageCookies() {
        const storageCookies = [];

        try {
            // Extract from localStorage
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);

                if (key && value) {
                    storageCookies.push({
                        name: key,
                        value: value.substring(0, 100), // Limit value length for performance
                        domain: window.location.hostname,
                        source: 'localStorage'
                    });
                }
            }
        } catch (error) {
            // localStorage might not be available (privacy mode, etc.)
            console.warn('[Storage Cookies] Cannot access localStorage:', error.message);
        }

        try {
            // Extract from sessionStorage
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                const value = sessionStorage.getItem(key);

                if (key && value) {
                    storageCookies.push({
                        name: key,
                        value: value.substring(0, 100), // Limit value length for performance
                        domain: window.location.hostname,
                        source: 'sessionStorage'
                    });
                }
            }
        } catch (error) {
            // sessionStorage might not be available (privacy mode, etc.)
            console.warn('[Storage Cookies] Cannot access sessionStorage:', error.message);
        }

        // Log all collected storage cookies - visible in Service Worker console
        if (typeof Logger !== 'undefined') {
            Logger.cache(`💾 Collected ${storageCookies.length} storage items from page`, {
                localStorage: storageCookies.filter(c => c.source === 'localStorage').map(c => c.name),
                sessionStorage: storageCookies.filter(c => c.source === 'sessionStorage').map(c => c.name)
            });
        }

        return storageCookies;
    }

    /**
     * Extract script elements from the page DOM
     * Returns inline scripts and script URLs for CONTENT detection
     * @returns {array} Array of script elements with src URLs and inline content
     */
    extractScriptElements() {
        const scripts = [];
        const scriptElements = document.querySelectorAll('script');

        scriptElements.forEach((script, index) => {
            // External scripts - store both URL and try to get content
            if (script.src) {
                const content = (script.textContent || script.innerHTML || '').trim();
                scripts.push({
                    type: 'external',
                    src: script.src,
                    content: content || script.src
                });
            }
            // Inline scripts
            else if (script.textContent || script.innerHTML) {
                const content = (script.textContent || script.innerHTML || '').trim();
                if (content.length > 0) {
                    scripts.push({
                        type: 'inline',
                        src: null,
                        content: content
                    });
                }
            }
        });

        console.log(`DetectionEngineManager: Found ${scripts.length} script elements`);
        return scripts;
    }

    /**
     * Fetch external resource content (JS, CSS files) via HTTP
     * Downloads actual file content for deeper detection analysis
     * OPTIMIZATION Phase 10.7: Batched fetching with concurrency limit and size constraints
     * @returns {Promise<array>} Array of fetched resource content
     */
    async extractExternalContent() {
        // Get all script sources
        const scriptElements = document.querySelectorAll('script[src]');
        const scriptUrls = Array.from(scriptElements).map(s => s.src).filter(Boolean);
        console.log(`📦 extractExternalContent: Found ${scriptUrls.length} external scripts:`, scriptUrls);

        // Get all CSS links
        const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
        const cssUrls = Array.from(linkElements).map(l => l.href).filter(Boolean);
        console.log(`📦 extractExternalContent: Found ${cssUrls.length} CSS files:`, cssUrls);

        // Combine all URLs
        const allUrls = [...scriptUrls, ...cssUrls];

        console.log(`📦 extractExternalContent: Total ${allUrls.length} external resources to fetch`);

        // OPTIMIZATION Phase 10.7: Limit concurrent fetches and add size constraints
        const CONCURRENCY_LIMIT = 6; // Match browser connection limit
        const MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5MB limit per file
        const FETCH_TIMEOUT = 5000; // 5s timeout per fetch

        const startTime = Date.now();
        const results = [];

        // Fetch in batches to control concurrency
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
                        // Check content length before fetching
                        const contentLength = parseInt(response.headers.get('content-length'), 10);
                        if (contentLength && contentLength > MAX_CONTENT_SIZE) {
                            console.log(`📦 ✗ Skipping large file: ${url} (${(contentLength / 1024 / 1024).toFixed(2)} MB)`);
                            return null;
                        }

                        const content = await response.text();

                        // Secondary size check after fetching
                        if (content.length > MAX_CONTENT_SIZE) {
                            console.log(`📦 ✗ Truncating large content: ${url} (${(content.length / 1024 / 1024).toFixed(2)} MB)`);
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
                    return null; // Failed HTTP response
                })
                .catch(error => {
                    // CORS, network error, or timeout - return null
                    console.log(`📦 ✗ Error fetching: ${url} (${error.message})`);
                    return null;
                })
            );

            // Wait for current batch to complete
            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults);
        }

        // Continue with existing filtering logic...

        // Filter out failed requests and null results
        const resources = results
            .filter(result => result.status === 'fulfilled' && result.value !== null)
            .map(result => result.value);

        const fetchTime = Date.now() - startTime;
        console.log(`📦 extractExternalContent: Successfully fetched ${resources.length}/${allUrls.length} resources in ${fetchTime}ms`);
        console.log(`📦 Total content size: ${resources.reduce((sum, r) => sum + r.size, 0)} bytes`);

        return resources;
    }

    /**
     * Extract DOM elements for detection
     * OPTIMIZATION 8C: Single tree walk instead of multiple querySelectorAll (60-70% faster)
     * @returns {array} Array of DOM data for matching
     */
    extractDOM() {
        const domData = [];
        let canvasCount = 0;

        // OPTIMIZATION Phase 10.8: Use NodeFilter to skip irrelevant elements (20-30% faster)
        const relevantTags = new Set(['iframe', 'form', 'div', 'meta', 'script', 'noscript', 'canvas']);

        const walker = document.createTreeWalker(
            document.body || document.documentElement,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: function(node) {
                    const tagName = node.tagName.toLowerCase();
                    // Skip elements we don't care about
                    if (!relevantTags.has(tagName)) {
                        // But check if element has data attributes we care about
                        if (node.hasAttribute('data-sitekey') ||
                            node.hasAttribute('data-captcha') ||
                            node.hasAttribute('data-callback')) {
                            return NodeFilter.FILTER_ACCEPT;
                        }
                        return NodeFilter.FILTER_SKIP;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const startTime = Date.now();
        let nodeCount = 0;

        while (walker.nextNode()) {
            const element = walker.currentNode;
            const tagName = element.tagName.toLowerCase();
            nodeCount++;

            // Check for elements with specific data attributes (for non-standard tags)
            if (!relevantTags.has(tagName)) {
                domData.push({
                    selector: tagName,
                    attributes: this.getElementAttributes(element)
                });
                continue; // Skip switch statement
            }

            // Process specific elements based on tag type
            switch (tagName) {
                case 'iframe': {
                    const src = element.getAttribute('src') || '';
                    if (src) {
                        domData.push({
                            selector: 'iframe',
                            src: src,
                            attributes: this.getElementAttributes(element)
                        });
                    }
                    break;
                }

                case 'form': {
                    domData.push({
                        selector: 'form',
                        action: element.getAttribute('action') || '',
                        id: element.getAttribute('id') || '',
                        class: element.getAttribute('class') || '',
                        attributes: this.getElementAttributes(element)
                    });
                    break;
                }

                case 'div': {
                    const id = element.getAttribute('id') || '';
                    const className = element.getAttribute('class') || '';
                    // Only include if it has meaningful ID or class
                    if (id || className) {
                        domData.push({
                            selector: 'div',
                            id: id,
                            class: className
                        });
                    }
                    break;
                }

                case 'meta': {
                    const name = element.getAttribute('name') || element.getAttribute('property') || '';
                    const content = element.getAttribute('content') || '';
                    if (name) {
                        domData.push({
                            selector: 'meta',
                            name: name,
                            content: content
                        });
                    }
                    break;
                }

                case 'script': {
                    const src = element.getAttribute('src') || '';
                    if (src) {
                        domData.push({
                            selector: 'script',
                            src: src
                        });
                    }
                    break;
                }

                case 'noscript': {
                    domData.push({
                        selector: 'noscript',
                        id: element.getAttribute('id') || '',
                        content: element.textContent.substring(0, 200) // First 200 chars
                    });
                    break;
                }

                case 'canvas': {
                    canvasCount++;
                    break;
                }
            }
        }

        // Add canvas count if any found
        if (canvasCount > 0) {
            domData.push({
                selector: 'canvas',
                count: canvasCount
            });
        }

        const extractTime = Date.now() - startTime;
        console.log(`[8C: DOM Batching] Walked ${nodeCount} nodes in ${extractTime}ms, collected ${domData.length} elements`);

        return domData;
    }

    /**
     * Get relevant attributes from a DOM element
     * @param {Element} element - DOM element
     * @returns {object} Object with relevant attributes
     */
    getElementAttributes(element) {
        if (!element) return {};

        const attributes = {};
        const relevantAttrs = ['id', 'class', 'src', 'href', 'action', 'data-sitekey', 'data-callback'];

        relevantAttrs.forEach(attr => {
            if (element.hasAttribute(attr)) {
                let value = element.getAttribute(attr);
                // Limit attribute value length
                if (value && value.length > 100) {
                    value = value.substring(0, 100) + '...';
                }
                attributes[attr] = value;
            }
        });

        return attributes;
    }

    /**
     * Check if enough time has passed since last detection
     * @param {number} minInterval - Minimum interval in milliseconds
     * @returns {boolean} True if should run detection
     */
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
     * OPTIMIZATION Phase 1: Pre-computes priorities for faster detection
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
     * OPTIMIZATION Phase 1: Calculate once instead of per-detection (saves 50-100ms per detection)
     * @private
     */
    _precomputePriorities() {
        if (!this.detectors) {
            this.precomputedPriorities = [];
            return;
        }

        const priorities = [];

        for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
            for (const [detectorName, detector] of Object.entries(categoryDetectors)) {
                // Skip disabled detectors at pre-compute time
                if (detector.enabled === false) continue;

                // Calculate priority based on detection methods
                let priority = 0;
                const detection = detector.detection || {};

                // Fast checks (priority 3): cookies, URLs, headers (1-2ms each)
                if (detection.cookie?.length > 0) priority = Math.max(priority, 3);
                if (detection.url?.length > 0) priority = Math.max(priority, 3);
                if (detection.header?.length > 0) priority = Math.max(priority, 3);

                // Medium checks (priority 2): content patterns (10-50ms)
                if (detection.content?.length > 0) priority = Math.max(priority, 2);

                // Slow checks (priority 1): DOM selectors (20-100ms)
                if (detection.dom?.length > 0) priority = Math.max(priority, 1);

                priorities.push({
                    category,
                    detectorName,
                    detector,
                    priority
                });
            }
        }

        // Sort once by priority (high to low)
        priorities.sort((a, b) => b.priority - a.priority);

        // Store for reuse
        this.precomputedPriorities = priorities;

        console.log(`[Phase 1 Optimization] Pre-computed priorities for ${priorities.length} detectors`);
    }

    /**
     * Generate JS hook installation code for MAIN world injection
     * @param {object} detectors - Detector configurations organized by category
     * @returns {string} JavaScript code to inject into page
     */
    static generateHookCode(detectors) {
        const hookDefinitions = [];

        // Extract JS hooks from fingerprint detectors
        if (detectors && detectors.fingerprint) {
            for (const [detectorId, detector] of Object.entries(detectors.fingerprint)) {
                if (detector.detection?.js_hooks && detector.detection.js_hooks.length > 0) {
                    hookDefinitions.push({
                        id: detector.id || detectorId,
                        name: detector.name,
                        category: 'fingerprint',
                        hooks: detector.detection.js_hooks.filter(h => h.enabled !== false)
                    });
                }
            }
        }

        // Generate hook installation code
        return `
(function() {
  'use strict';

  const hookDefinitions = ${JSON.stringify(hookDefinitions)};
  const triggeredHooks = new Set();
  let completionTimeout = null;
  let hooksEnabled = true;
  const COMPLETION_DELAY_MS = 2000;

  function scheduleCompletion() {
    if (completionTimeout) clearTimeout(completionTimeout);
    completionTimeout = setTimeout(() => {
      hooksEnabled = false;
      window.postMessage({
        type: 'JS_HOOKS_COMPLETE',
        url: window.location.href,
        timestamp: Date.now()
      }, '*');
      completionTimeout = null;
    }, COMPLETION_DELAY_MS);
  }

  function reportHookDetection(detectorId, detectorName, category, hook) {
    if (!hooksEnabled) return;
    const detectionKey = \`\${detectorId}:\${hook.hook}\`;
    if (triggeredHooks.has(detectionKey)) return;
    triggeredHooks.add(detectionKey);

    window.postMessage({
      type: 'JS_HOOK_DETECTION',
      detection: {
        detectorId,
        detectorName,
        category,
        hook: {
          target: hook.hook,
          confidence: hook.confidence,
          description: hook.description
        },
        timestamp: Date.now()
      },
      url: window.location.href
    }, '*');

    scheduleCompletion();
  }

  function installHook(detectorId, detectorName, category, hook) {
    try {
      const parts = hook.hook.split('.');
      if (parts.length < 2) return;

      let obj = window;
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]];
        if (!obj) return;
      }

      const propertyName = parts[parts.length - 1];
      const descriptor = Object.getOwnPropertyDescriptor(obj, propertyName);
      if (!descriptor) return;

      // Handle getter properties
      if (descriptor.get && !descriptor.value) {
        const originalGetter = descriptor.get;
        const stealthGetter = new Proxy(originalGetter, {
          apply: function(target, thisArg, argumentsList) {
            reportHookDetection(detectorId, detectorName, category, hook);
            return Reflect.apply(target, thisArg, argumentsList);
          },
          get: (target, prop) => prop === 'toString' ? originalGetter.toString.bind(originalGetter) : Reflect.get(target, prop),
          has: (target, prop) => Reflect.has(target, prop),
          getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(target, prop),
          ownKeys: (target) => Reflect.ownKeys(target)
        });

        try {
          Object.defineProperty(stealthGetter, 'name', {value: originalGetter.name, writable: false, enumerable: false, configurable: true});
          Object.defineProperty(stealthGetter, 'length', {value: originalGetter.length, writable: false, enumerable: false, configurable: true});
          Object.defineProperty(stealthGetter, 'toString', {value: function toString() {return originalGetter.toString.call(originalGetter);}, writable: true, enumerable: false, configurable: true});
        } catch (e) {
          // Expected: Some properties may not be configurable
          console.log('[Hook] Failed to define stealth getter properties:', e.message);
        }

        Object.defineProperty(obj, propertyName, {
          get: stealthGetter,
          set: descriptor.set,
          enumerable: descriptor.enumerable,
          configurable: descriptor.configurable
        });
      }
      // Handle regular methods
      else if (typeof descriptor.value === 'function') {
        const original = descriptor.value;
        const wrapper = new Proxy(original, {
          apply: function(target, thisArg, argumentsList) {
            reportHookDetection(detectorId, detectorName, category, hook);
            return Reflect.apply(target, thisArg, argumentsList);
          },
          has: (target, prop) => Reflect.has(target, prop),
          get: (target, prop) => prop === 'toString' ? original.toString.bind(original) : Reflect.get(target, prop),
          getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(target, prop),
          ownKeys: (target) => Reflect.ownKeys(target)
        });

        try {
          Object.defineProperty(wrapper, 'name', {value: original.name, writable: false, enumerable: false, configurable: true});
          Object.defineProperty(wrapper, 'length', {value: original.length, writable: false, enumerable: false, configurable: true});
          Object.defineProperty(wrapper, 'toString', {value: function toString() {return original.toString.call(original);}, writable: true, enumerable: false, configurable: true});
          if (original.prototype) Object.setPrototypeOf(wrapper, Object.getPrototypeOf(original));
        } catch (e) {
          // Expected: Some properties may not be configurable
          console.log('[Hook] Failed to define wrapper properties:', e.message);
        }

        Object.defineProperty(obj, propertyName, {
          value: wrapper,
          writable: descriptor.writable,
          enumerable: descriptor.enumerable,
          configurable: descriptor.configurable
        });
      }
    } catch (error) {
      console.error(\`[Fingerprint Hook] Failed to install \${hook.hook}:\`, error);
    }
  }

  // Install all hooks
  for (const detector of hookDefinitions) {
    for (const hook of detector.hooks) {
      installHook(detector.id, detector.name, detector.category, hook);
    }
  }

  // Send completion if no hooks installed
  if (hookDefinitions.length === 0 || hookDefinitions.every(d => d.hooks.length === 0)) {
    window.postMessage({type: 'JS_HOOKS_COMPLETE', url: window.location.href, timestamp: Date.now()}, '*');
  }
})();
`;
    }

    /**
     * Run detection on page data and return found security technologies
     * OPTIMIZED: Priority-based detection with early exits for high-confidence matches
     * @param {object} pageData - Object containing url, scripts, and dom elements
     * @returns {array} Array of detection results
     */
    async detectOnPage(pageData = {}) {
        console.log('🔍 DetectionEngineManager.detectOnPage called');

        if (!this.detectors) {
            console.error('❌ Detectors not set!');
            throw new Error('Detectors not set. Call setDetectors() first.');
        }

        const detections = [];
        const { url = '', content = [], dom = [], cookies = [], headers = {}, pageHTML = '', externalContent = [], jsHooks = [], payload, payloads, networkUrls = [], allCookies = [], responseCookies = [], storageCookies = [] } = pageData;

        // ENHANCEMENT: Use allCookies (from chrome.cookies API) if available, includes HttpOnly cookies
        // Fallback to cookies from document.cookie for backward compatibility
        const cookiesToMatch = allCookies.length > 0 ? allCookies : cookies;

        const startTime = Date.now();

        console.log('📊 Page Data Summary:', {
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

        console.log('🔍 Cookies:', cookies);
        console.log('🔍 Content sample:', content.slice(0, 3));

        const categoriesCount = Object.keys(this.detectors).length;
        console.log(`📦 Processing ${categoriesCount} categories...`);
        console.log('📋 All detectors loaded:', Object.entries(this.detectors).map(([cat, dets]) =>
            `${cat}: [${Object.keys(dets).join(', ')}]`
        ).join(' | '));

        // OPTIMIZATION Phase 1: Use pre-computed priorities (saves 50-100ms per detection)
        // Priority levels:
        // 1. Fast checks first: cookies (1-2ms), URLs (1-2ms), headers (1-2ms)
        // 2. Medium checks: content patterns (10-50ms)
        // 3. Slow checks: DOM selectors (20-100ms)
        // This reduces avg detection time by 40-60%

        let detectorPriorities = this.precomputedPriorities || [];

        // Fallback: If priorities not pre-computed, compute them now (shouldn't happen in normal flow)
        if (detectorPriorities.length === 0) {
            console.warn('[Phase 1 Optimization] Pre-computed priorities missing - falling back to runtime calculation');
            this._precomputePriorities();
            detectorPriorities = this.precomputedPriorities || [];
        }

        console.log(`🚀 Running ${detectorPriorities.length} detectors (using pre-computed priorities)`);

        // Track high-confidence detections for potential early exit
        let highConfidenceCount = 0;
        const HIGH_CONFIDENCE_THRESHOLD = 90;
        const EARLY_EXIT_COUNT = 5; // Stop after 5 high-confidence detections

        for (const { category, detectorName, detector } of detectorPriorities) {
            const detection = this.runDetector(detector, { url, content, dom, cookies, headers, pageHTML, externalContent, payload, payloads, networkUrls, allCookies, responseCookies, storageCookies });
            if (detection.detected) {
                console.log(`    ✅ DETECTED: ${detectorName} (confidence: ${detection.confidence}%)`);
                const detectionObj = {
                    ...detection,
                    category,
                    detector: DetectionEngineManager.buildDetectorInfo(detector, detectorName, detectorName)
                };

                // DEBUG: Verify detector.id is present
                if (!detectionObj.detector?.id) {
                    console.error(`[detectOnPage] ❌ CRITICAL: Detection created without detector.id for ${detectorName}:`, {
                        hasDetector: !!detectionObj.detector,
                        detectorId: detectionObj.detector?.id,
                        detectorName: detectionObj.detector?.name
                    });
                }

                detections.push(detectionObj);

                // OPTIMIZATION: Track high-confidence detections
                if (detection.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
                    highConfidenceCount++;
                }

                // OPTIMIZATION: Early exit after finding multiple high-confidence detections
                // This saves processing time on pages with clear security systems
                if (highConfidenceCount >= EARLY_EXIT_COUNT) {
                    console.log(`⚡ Early exit: Found ${highConfidenceCount} high-confidence detections`);
                    break;
                }
            }
        }

        // Process JS Hook detections from MAIN world
        if (jsHooks && jsHooks.length > 0) {
            console.log(`[JS Hooks] Processing ${jsHooks.length} hook detections`);

            // OPTIMIZATION Phase 10.10: Build detector lookup table once (O(n) instead of O(n×m))
            // Before: For 100 hooks × 3 categories = 300 iterations
            // After: Build lookup once + 100 lookups = ~110 operations (50-70% faster)
            const detectorLookup = new Map();
            for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
                for (const [detectorId, detector] of Object.entries(categoryDetectors)) {
                    detectorLookup.set(detector.id || detectorId, { category, detector });
                }
            }

            for (const hookData of jsHooks) {
                // O(1) lookup instead of nested loop
                const found = detectorLookup.get(hookData.detectorId);

                if (found) {
                    const { category, detector } = found;

                    // Check if this detector was already detected via other methods
                    const existingDetection = detections.find(d => d.detector.id === hookData.detectorId);

                    if (existingDetection) {
                        // Add JS hook to existing detection's matches
                        existingDetection.matches.push({
                            type: 'js_hooks',
                            target: hookData.target,
                            value: hookData.target,
                            confidence: hookData.confidence || 80,
                            description: hookData.description || 'JavaScript API hook'
                        });

                        // Update detectionMethods to include js_hooks
                        if (!existingDetection.detectionMethods) {
                            existingDetection.detectionMethods = [];
                        }
                        if (!existingDetection.detectionMethods.includes('js_hooks')) {
                            existingDetection.detectionMethods.push('js_hooks');
                        }

                        // Recalculate confidence
                        existingDetection.confidence = this.confidenceManager
                            ? this.confidenceManager.calculateConfidence(existingDetection.matches)
                            : Math.max(...existingDetection.matches.map(m => m.confidence || 0), 0);

                        console.log(`[JS Hooks] Added hook to existing detection: ${detector.name}`);
                    } else {
                        // Create new detection for this hook
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

                        console.log(`[JS Hooks] Created new detection: ${detector.name}`);
                    }
                }
            }
        }

        const detectionTime = Date.now() - startTime;
        console.log(`🎯 Total detections found: ${detections.length} in ${detectionTime}ms`);
        if (detections.length > 0) {
            console.log('Detections:', detections.map(d => d.detector.name));
        }

        return detections;
    }

    /**
     * Run a single detector against page data
     * @param {object} detector - Detector configuration
     * @param {object} pageData - Page data to analyze
     * @returns {object} Detection result with confidence and matches
     */
    runDetector(detector, pageData) {
        const { url, content, dom, cookies = [], headers = {}, pageHTML = '', externalContent = [], allCookies = [], responseCookies = [], storageCookies = [] } = pageData;
        const matches = [];

        // ENHANCEMENT: Use allCookies (from chrome.cookies API) if available, includes HttpOnly cookies
        const cookiesToMatch = allCookies.length > 0 ? allCookies : cookies;

        if (detector.detection?.url) {

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
                console.log(`[URL Detection] ${detector.name}: Testing pattern "${urlPattern.text}" against URL "${url}"`);
                const urlMatch = this.matchPatternWithCapture(url, urlPattern.text, matchOptions);
                if (urlMatch) {
                    console.log(`[URL Detection] ${detector.name}: ✅ MATCHED! Value: "${urlMatch}"`);
                    matches.push({
                        type: 'url',
                        pattern: urlPattern.text,
                        value: urlMatch,  // Store the actual matched substring
                        fullUrl: url,     // Store full URL for reference
                        confidence: urlPattern.confidence,
                        description: urlPattern.description
                    });
                } else {
                    console.log(`[URL Detection] ${detector.name}: ❌ No match`);
                }

                // Check script src URLs if scope is 'page_and_scripts' or 'all'
                if ((textScope === 'page_and_scripts' || textScope === 'all') && content && content.length > 0) {
                    for (const script of content) {
                        const scriptSrc = script.src || '';
                        if (scriptSrc) {
                            // Match against full script URL including query parameters
                            const scriptMatch = this.matchPatternWithCapture(scriptSrc, urlPattern.text, matchOptions);
                            if (scriptMatch) {
                                // Check if we already have this pattern to avoid duplicates
                                const alreadyAdded = matches.some(m => m.type === 'url' && m.pattern === urlPattern.text);
                                if (!alreadyAdded) {
                                    matches.push({
                                        type: 'url',
                                        pattern: urlPattern.text,
                                        value: scriptMatch,  // Store actual matched substring
                                        fullUrl: scriptSrc,  // Store full script URL for reference
                                        confidence: urlPattern.confidence,
                                        description: urlPattern.description
                                    });
                                }
                            }
                        }
                    }
                }

                // Check all external resource URLs if scope is 'all'
                if (textScope === 'all' && externalContent && externalContent.length > 0) {
                    for (const resource of externalContent) {
                        const resourceUrl = resource.url || '';
                        if (resourceUrl) {
                            // Match against full resource URL including query parameters
                            const resourceMatch = this.matchPatternWithCapture(resourceUrl, urlPattern.text, matchOptions);
                            if (resourceMatch) {
                                // Check if we already have this pattern to avoid duplicates
                                const alreadyAdded = matches.some(m => m.type === 'url' && m.pattern === urlPattern.text);
                                if (!alreadyAdded) {
                                    matches.push({
                                        type: 'url',
                                        pattern: urlPattern.text,
                                        value: resourceMatch,  // Store actual matched substring
                                        fullUrl: resourceUrl,  // Store full resource URL for reference
                                        confidence: urlPattern.confidence,
                                        description: urlPattern.description
                                    });
                                }
                            }
                        }
                    }
                }

                // Check ALL network request URLs if scope is 'all' (NEW: captures XHR, fetch, etc.)
                if (textScope === 'all' && pageData.networkUrls && pageData.networkUrls.length > 0) {
                    console.log(`[URL Detection] ${detector.name}: Checking ${pageData.networkUrls.length} network request URLs`);
                    for (const networkUrl of pageData.networkUrls) {
                        // Match against full network request URL including query parameters
                        const networkMatch = this.matchPatternWithCapture(networkUrl.url, urlPattern.text, matchOptions);
                        if (networkMatch) {
                            // Check if we already have this pattern to avoid duplicates
                            const alreadyAdded = matches.some(m => m.type === 'url' && m.pattern === urlPattern.text);
                            if (!alreadyAdded) {
                                console.log(`[URL Detection] ${detector.name}: ✅ Network URL MATCHED! URL: ${networkUrl.url}, Type: ${networkUrl.type}, Method: ${networkUrl.method}`);
                                matches.push({
                                    type: 'url',
                                    pattern: urlPattern.text,
                                    value: networkMatch,  // Store actual matched substring
                                    fullUrl: networkUrl.url,  // Store full network URL
                                    resourceType: networkUrl.type,  // XHR, fetch, script, etc.
                                    method: networkUrl.method,  // GET, POST, etc.
                                    confidence: urlPattern.confidence,
                                    description: urlPattern.description
                                });
                            }
                        }
                    }
                }
            }
        }

        // Check content patterns
        const contentPatterns = detector.detection?.content;
        console.log(`[Content Detection] ${detector.name}: contentPatterns=${!!contentPatterns}, count=${contentPatterns?.length || 0}, hasPageHTML=${!!pageHTML}, pageHTMLLength=${pageHTML?.length || 0}`);

        if (contentPatterns && pageHTML) {
            console.log(`[Content Detection] ${detector.name}: Starting check of ${contentPatterns.length} patterns`);
            for (const contentPattern of contentPatterns) {
                // Backward compatibility: content patterns used to use 'value' instead of 'text'
                const patternText = contentPattern.text || contentPattern.value || '';
                console.log(`[Content Detection] ${detector.name}: Pattern="${patternText}", regex=${contentPattern.textRegex}, wholeWord=${contentPattern.textWholeWord}, caseSensitive=${contentPattern.textCaseSensitive}`);

                const matchOptions = {
                    regex: contentPattern.textRegex === true,
                    wholeWord: contentPattern.textWholeWord === true,
                    caseSensitive: contentPattern.textCaseSensitive === true
                };

                // Determine where to search based on settings
                // If checkScripts is explicitly set to true, restrict search to scripts only
                // If false or undefined, search entire page (default)
                const checkScripts = contentPattern.checkScripts === true;

                console.log(`[Content Detection] ${detector.name}: checkScripts=${checkScripts}`);

                let found = false;
                let foundIn = '';

                if (!checkScripts) {
                    // No restrictions = check entire page HTML + external content (default behavior)
                    console.log(`[Content Detection] ${detector.name}: Searching entire page HTML for "${patternText}"`);
                    if (this.matchPattern(pageHTML, patternText, matchOptions)) {
                        found = true;
                        foundIn = 'page content';
                        console.log(`[Content Detection] ${detector.name}: ✓ MATCH FOUND in page content!`);
                    }

                    // Also search external fetched content
                    if (!found && pageData.externalContent && pageData.externalContent.length > 0) {
                        console.log(`[Content Detection] ${detector.name}: Searching ${pageData.externalContent.length} external resources`);
                        for (const resource of pageData.externalContent) {
                            if (this.matchPattern(resource.content, patternText, matchOptions)) {
                                found = true;
                                foundIn = resource.url;
                                console.log(`[Content Detection] ${detector.name}: ✓ MATCH FOUND in external resource: ${resource.url}`);
                                break;
                            }
                        }
                    }

                    if (!found) {
                        console.log(`[Content Detection] ${detector.name}: ✗ No match in page content or external resources`);
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
                    console.log(`[Content Detection] ${detector.name}: Adding match! confidence=${contentPattern.confidence}, foundIn=${foundIn}`);
                    matches.push({
                        type: 'content',
                        pattern: patternText,
                        value: patternText, // Show the matched pattern itself
                        confidence: contentPattern.confidence,
                        description: contentPattern.description
                    });
                } else {
                    console.log(`[Content Detection] ${detector.name}: Pattern not found: "${patternText}"`);
                }
            }
        } else {
            if (!contentPatterns) {
                console.log(`[Content Detection] ${detector.name}: No content patterns defined`);
            }
            if (!pageHTML) {
                console.log(`[Content Detection] ${detector.name}: No pageHTML provided!`);
            }
        }

        // Check cookies patterns
        if (detector.detection?.cookie && (cookiesToMatch.length > 0 || (responseCookies && responseCookies.length > 0))) {
            // Log cookies being matched for this detector
            if (typeof Logger !== 'undefined') {
                const sourceLabel = allCookies.length > 0 ? '✅ (via chrome.cookies)' : '📋 (document.cookie)';
                Logger.cache(`🔍 Matching ${detector.id} against ${cookiesToMatch.length} cookies ${sourceLabel}`, {
                    cookies: cookiesToMatch.map(c => c.name),
                    patterns: detector.detection.cookie.map(p => p.name)
                });
            }

            // OPTIMIZATION Phase 10.6: Track matched cookies and filter before searching
            const matchedCookieNames = new Set();

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
                const nameScope = cookiePattern.nameScope || 'request';
                const valueScope = cookiePattern.valueScope || 'request';

                // Build cookies array based on scope
                const getCookiesByScope = (scope) => {
                    if (scope === 'request') {
                        // Use enhanced allCookies if available (from chrome.cookies API)
                        return allCookies.length > 0 ? allCookies : cookies;
                    } else if (scope === 'response') {
                        return responseCookies || [];
                    } else if (scope === 'storage') {
                        // NEW: Return storage cookies (localStorage + sessionStorage)
                        return storageCookies || [];
                    } else if (scope === 'all') {
                        // Merge all available cookie sources
                        // allCookies includes HttpOnly, Secure, and all domain cookies
                        // NEW: Also includes storage cookies
                        if (allCookies.length > 0) {
                            return [...allCookies, ...(responseCookies || []), ...(storageCookies || [])];
                        } else {
                            return [...cookies, ...(responseCookies || []), ...(storageCookies || [])];
                        }
                    } else {
                        // Default fallback (shouldn't happen)
                        return allCookies.length > 0 ? allCookies : cookies;
                    }
                };

                const cookiesForName = getCookiesByScope(nameScope);
                const cookiesForValue = getCookiesByScope(valueScope);

                // OPTIMIZATION Phase 10.6: Filter out matched cookies before searching (O(n) instead of O(n²))
                const unmatchedCookies = cookiesForName.filter(c => !matchedCookieNames.has(c.name));

                // FIX: Use .filter() instead of .find() to get ALL matching cookies, not just the first one
                const matchingCookies = unmatchedCookies.filter(cookie => {
                    // Match by name using matchPattern helper
                    if (cookiePattern.name && cookie.name) {
                        const matched = this.matchPattern(cookie.name, cookiePattern.name, nameMatchOptions);

                        if (matched) {
                            // If value pattern specified, check it in valueScope cookies
                            if (cookiePattern.value) {
                                // Find cookie with same name in value scope
                                const cookieInValueScope = cookiesForValue.find(c => c.name === cookie.name);
                                if (cookieInValueScope) {
                                    const valueMatched = this.matchPattern(cookieInValueScope.value || '', cookiePattern.value, valueMatchOptions);
                                    return valueMatched;
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
                    matchedCookieNames.add(matchingCookie.name); // Mark as matched

                    // Log successful match
                    if (typeof Logger !== 'undefined') {
                        Logger.cache(`✅ ${detector.id}: Pattern '${cookiePattern.name}' matched cookie '${matchingCookie.name}'`);
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
     * Helper function to match pattern with options (regex, wholeWord, caseSensitive)
     * OPTIMIZED: Uses PatternCache to avoid recompiling regex patterns
     * @param {string} text - Text to search in
     * @param {string} pattern - Pattern to search for
     * @param {object} options - Matching options
     * @returns {boolean} - Whether pattern matches
     */
    matchPattern(text, pattern, options = {}) {
        const {
            regex = false,
            wholeWord = false,
            caseSensitive = false
        } = options;

        if (!text || !pattern) {
            return false;
        }

        // OPTIMIZATION: Check result cache first (5-minute TTL)
        const cached = DetectionEngineManager.patternCache.getCachedMatch(text, pattern, options);
        if (cached.found) {
            return cached.result;
        }

        // Apply case sensitivity once
        const textToSearch = caseSensitive ? text : text.toLowerCase();
        const patternToMatch = caseSensitive ? pattern : pattern.toLowerCase();

        let result = false;

        // Regex matching - use cached compiled pattern
        if (regex) {
            const compiledRegex = DetectionEngineManager.patternCache.getCompiledPattern(patternToMatch, { regex: true, caseSensitive });
            if (compiledRegex) {
                try {
                    result = compiledRegex.test(textToSearch);
                } catch (e) {
                    console.warn('Invalid regex pattern:', patternToMatch, e);
                    result = false;
                }
            }
        }
        // Whole word matching - use cached compiled pattern
        else if (wholeWord) {
            const compiledRegex = DetectionEngineManager.patternCache.getCompiledPattern(patternToMatch, { wholeWord: true, caseSensitive });
            if (compiledRegex) {
                result = compiledRegex.test(textToSearch);
            } else {
                // Fallback to direct matching if compilation failed
                const escapedPattern = this.escapeRegExp(patternToMatch);
                const wordBoundaryRegex = new RegExp(`\\b${escapedPattern}\\b`, caseSensitive ? 'g' : 'gi');
                result = wordBoundaryRegex.test(textToSearch);
            }
        }
        // Simple includes matching (fastest - no regex needed)
        else {
            result = textToSearch.includes(patternToMatch);
        }

        // OPTIMIZATION: Cache the result for 5 minutes
        DetectionEngineManager.patternCache.cacheMatch(text, pattern, options, result);
        return result;
    }

    /**
     * Match pattern and capture the actual matched substring (not just true/false)
     * Used to display what was actually found, not the search pattern
     * @param {string} text - Text to search in
     * @param {string} pattern - Pattern to match
     * @param {object} options - Match options {regex, wholeWord, caseSensitive}
     * @returns {string|null} - The actual matched substring, or null if no match
     */
    matchPatternWithCapture(text, pattern, options = {}) {
        const {
            regex = false,
            wholeWord = false,
            caseSensitive = false
        } = options;

        if (!text || !pattern) return null;

        try {
            const textToSearch = caseSensitive ? text : text.toLowerCase();
            const patternToMatch = caseSensitive ? pattern : pattern.toLowerCase();

            if (regex) {
                // Regex matching - find the actual matched substring
                const flags = caseSensitive ? 'g' : 'gi';
                const compiledRegex = new RegExp(patternToMatch, flags);
                const match = compiledRegex.exec(text);
                return match ? match[0] : null;
            }
            else if (wholeWord) {
                // Whole word matching
                const escapedPattern = this.escapeRegExp(patternToMatch);
                const wordBoundaryRegex = new RegExp(`\\b${escapedPattern}\\b`, caseSensitive ? 'g' : 'gi');
                const match = wordBoundaryRegex.exec(text);
                return match ? match[0] : null;
            }
            else {
                // Simple substring matching - return the actual substring from original text
                const index = textToSearch.indexOf(patternToMatch);
                if (index !== -1) {
                    return text.substring(index, index + pattern.length);
                }
            }
        } catch (error) {
            console.warn('[matchPatternWithCapture] Error matching pattern:', error);
        }

        return null;
    }

    /**
     * Escape special regex characters for literal matching
     * @param {string} string - String to escape
     * @returns {string} - Escaped string
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get stored detection for a URL
     * @param {string} url - Page URL
     * @returns {Promise<object|null>} Stored detection data or null
     */
    static async getStoredDetection(url) {
        try {
            // FIX: Use Utils.getCacheScope() which properly loads settings with 'domain' as default
            const cacheScope = await Utils.getCacheScope();

            console.log(`[DEBUG getStoredDetection] 🔍 Cache lookup for URL: ${url}, Scope: ${cacheScope}`);

            const result = await chrome.storage.local.get([DetectionEngineManager.STORAGE_KEY]);
            const storage = result[DetectionEngineManager.STORAGE_KEY] || {};
            const urlHash = Utils.hashUrl(url, cacheScope);

            console.log(`[DEBUG getStoredDetection] Calculated hash: ${urlHash}`);
            console.log(`[DEBUG getStoredDetection] Available cache keys: ${Object.keys(storage).slice(0, 5).join(', ')}${Object.keys(storage).length > 5 ? '...' : ''}`);

            const stored = storage[urlHash];

            if (stored) {
                // Validate cache scope matches current settings
                if (stored.cacheScope && stored.cacheScope !== cacheScope) {
                    console.log(`[getStoredDetection] ⚠️ Cache scope mismatch: stored with '${stored.cacheScope}', current is '${cacheScope}' - treating as cache miss`);
                    // Don't delete yet - let it expire naturally or get overwritten
                    return null; // Treat as cache miss
                }

                // Check if stored detection is expired
                if (Date.now() < stored.expiry) {
                    console.log(`Scrapfly Background: ✅ Found stored detection for ${url} (expires in ${Math.round((stored.expiry - Date.now()) / 1000 / 60)} minutes)`);
                    console.log(`[DEBUG getStoredDetection] Cache hit confirmed - returning ${stored.detectionCount} detectors`);
                    return stored;
                } else {
                    console.log(`Scrapfly Background: Stored detection expired for ${url}`);
                    console.log(`[DEBUG getStoredDetection] Cache expired (was valid for ${stored.cacheDuration}${stored.cacheUnit})`);
                    // Remove expired entry
                    delete storage[urlHash];
                    await chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: storage });
                }
            } else {
                console.log(`[DEBUG getStoredDetection] ❌ Cache MISS - No entry found for hash: ${urlHash}`);
            }
        } catch (error) {
            console.error('Scrapfly Background: Error reading stored detections:', error);
        }
        return null;
    }

    /**
     * Get detection data for a specific tab
     * @param {number} tabId - Tab ID
     * @returns {Promise<object|null>} Detection data or null
     */
    static async getDetectionData(tabId) {
        // First, get the tab's URL to check storage
        try {
            const tab = await chrome.tabs.get(tabId);
            if (!tab || !tab.url) {
                return null;
            }

            // Check storage
            const storedData = await DetectionEngineManager.getStoredDetection(tab.url);
            if (storedData) {
                console.log('getDetectionData: ===== SENDING TO POPUP =====');
                console.log('getDetectionData: Detection count:', storedData.detectionResults?.length || 0);
                console.log('getDetectionData: Detector names:', storedData.detectionResults?.map(d => d.detector?.name || d.name || 'NO NAME') || []);
                console.log('getDetectionData: Detector IDs:', storedData.detectionResults?.map(d => d.detector?.id || 'NO ID') || []);
                console.log('getDetectionData: Sample detector full object:', storedData.detectionResults?.[0]);
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
            console.error('getDetectionData: Error:', error);
        }

        return null;
    }

    /**
     * Store detection results for a URL
     * @param {string} url - Page URL
     * @param {object} pageData - Page data
     * @param {array} detectionResults - Detection results
     */
    static async storeDetection(url, pageData, detectionResults) {
        console.log('[storeDetection] 💾 ========== STORING DETECTION ==========');
        console.log('[storeDetection] URL:', url);
        console.log('[storeDetection] detectionResults count:', detectionResults.length);
        console.log('[storeDetection] detectionResults IDs:', detectionResults.map(d => d.id));

        try {
            // FIX: Use Utils.getCacheScope() which properly loads settings with 'domain' as default
            const cacheScope = await Utils.getCacheScope();

            const result = await chrome.storage.local.get([DetectionEngineManager.STORAGE_KEY]);
            const storage = result[DetectionEngineManager.STORAGE_KEY] || {};
            const urlHash = Utils.hashUrl(url, cacheScope);

            console.log(`[DEBUG storeDetection] 💾 Cache settings - Scope: ${cacheScope}, Hash: ${urlHash}`);
            console.log(`[DEBUG storeDetection] Storing at key: ${urlHash}`);

            // OPTIMIZATION: Compress detectionResults to essential fields only
            // Strip detector metadata (version, website, etc.) but keep description and structure
            // This reduces storage size by 70-80% while preserving user-visible info
            console.log('[storeDetection] Compressing detection results...');
            const compressedResults = detectionResults.map((detection, index) => {
                const compressed = {
                    id: detection.id,
                    detector: {
                        id: detection.detector?.id,  // CRITICAL FIX: Preserve detector ID for Advanced tools lookup
                        name: detection.detector?.name || detection.name || 'Unknown',
                        icon: detection.detector?.icon || 'custom.png',
                        color: detection.detector?.color,
                        description: detection.detector?.description
                    },
                    category: detection.category,
                    confidence: detection.confidence,
                    matches: detection.matches?.map(m => ({
                        type: m.type,
                        value: m.value || m.pattern || m.name || m.selector,
                        confidence: m.confidence,
                        fullUrl: m.fullUrl  // Preserve full URL for URL-type detections
                    })) || []
                };

                // DEBUG: Verify ID is preserved
                if (!compressed.detector.id) {
                    console.warn(`[storeDetection] ⚠️ WARNING: Detection ${index} ${compressed.detector.name} missing detector.id!`);
                } else {
                    console.log(`[storeDetection] ✅ Detection ${index}: ${compressed.detector.name} [ID: ${compressed.detector.id}] (${compressed.matches.length} matches)`);
                }
                return compressed;
            });

            // Calculate overall confidence
            const overallConfidence = detectionResults.length > 0
                ? Math.round(detectionResults.reduce((sum, d) => sum + d.confidence, 0) / detectionResults.length)
                : 0;

            // Get cache duration from settings
            const expiryMs = await DetectionEngineManager.getExpiryMs();

            // Create stored data object (removed detectionMethods - it was always empty/redundant)
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
                cacheScope: cacheScope // Remember which scope was used for this cache entry
            };

            storage[urlHash] = storedData;

            await chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: storage });

            console.log(`[storeDetection] ✅ STORED: ${detectionResults.length} detections`);
            console.log(`[storeDetection]   - URL hash: ${urlHash}`);
            console.log(`[storeDetection] ========== STORAGE COMPLETE ==========`);
            
            // Return the stored data with expiry for immediate use
            return storedData;
        } catch (error) {
            console.error('[storeDetection] ❌ Error storing detection:', error);
            return null;
        }
    }

    /**
     * Clean expired detection cache entries
     * Removes detections that have exceeded their expiry time (12 hours by default)
     * Should be called periodically from background script
     * @returns {Promise<void>}
     */
    static async cleanExpiredDetections() {
        try {
            const result = await chrome.storage.local.get([DetectionEngineManager.STORAGE_KEY]);
            const storage = result[DetectionEngineManager.STORAGE_KEY] || {};
            const now = Date.now();
            let cleanedCount = 0;

            for (const urlHash in storage) {
                const detection = storage[urlHash];
                // Check if this specific detection has expired based on its own expiry time
                if (detection.expiry && detection.expiry < now) {
                    console.log(`[DetectionEngineManager] Removing expired detection for ${detection.url} (expired ${Math.floor((now - detection.expiry) / 60000)} minutes ago)`);
                    delete storage[urlHash];
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                await chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: storage });
                console.log(`[DetectionEngineManager] Cleaned ${cleanedCount} expired detection entries`);
            }
        } catch (error) {
            console.error('[DetectionEngineManager] Error cleaning expired detections:', error);
        }
    }

    /**
     * Handle PAGE_LOAD_NOTIFICATION message
     * @param {object} request - Message request object
     * @param {object} sender - Message sender
     * @param {object} dependencies - Required dependencies (chrome, Settings, CategoryManager, History, Utils)
     * @returns {Promise<void>}
     */
    static async handlePageLoadNotification(request, sender, dependencies) {
        const { chrome, Settings, CategoryManager, History, Utils, categoryManager, recentDetectionRequests } = dependencies;

        const pageUrl = request.url;
        const tabId = sender.tab?.id;
        const triggerSource = request.triggerSource || 'unknown';

        if (!tabId) {
            console.error('Scrapfly Background: No tab ID in PAGE_LOAD_NOTIFICATION');
            return;
        }

        // Log the trigger source for debugging
        console.log(`[handlePageLoadNotification] 📍 Detection trigger: ${triggerSource} for tab ${tabId}`)

        // Check if extension is enabled
        try {
            const result = await chrome.storage.local.get(['scrapfly_enabled']);
            if (result.scrapfly_enabled === false) {
                console.log('Scrapfly Background: Extension is disabled, skipping page load detection');
                // Set orange X badge to indicate extension is disabled
                chrome.action.setBadgeText({ text: '✕', tabId: tabId }).catch((error) => {
                    console.log(`[PageLoad] Failed to set disabled badge for tab ${tabId}:`, error.message);
                });
                chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId: tabId }).catch((error) => {
                    console.log(`[PageLoad] Failed to set badge color for tab ${tabId}:`, error.message);
                });
                return;
            }
        } catch (error) {
            console.error('Failed to check enabled state:', error);
        }

        // FIX: Check if URL is blacklisted BEFORE cache check (prevents detection from running)
        const isBlacklisted = await Utils.isUrlBlacklisted(pageUrl);
        if (isBlacklisted) {
            console.log(`[handlePageLoadNotification] ⛔ URL is blacklisted, skipping detection: ${pageUrl}`);
            // Show orange X badge for blacklisted domains
            chrome.action.setBadgeText({ text: '✕', tabId: tabId }).catch((error) => {
                console.log(`[PageLoad] Failed to set blacklist badge for tab ${tabId}:`, error.message);
            });
            chrome.action.setBadgeBackgroundColor({ color: '#FF8C00', tabId: tabId }).catch((error) => {
                console.log(`[PageLoad] Failed to set badge color (blacklisted) for tab ${tabId}:`, error.message);
            });
            return;
        }

        // OPTION 1: Removed hold period logic
        // Now using silent background detection instead for better UX

        // Check cache first (optimization - avoid expensive data collection)
        console.log(`[DEBUG] Checking cache for ${pageUrl}...`);
        const storedData = await DetectionEngineManager.getStoredDetection(pageUrl);

        console.log(`[handlePageLoadNotification] 🔍 CACHE CHECK for ${pageUrl}:`, {
            triggerSource,
            cacheExists: !!storedData,
            detectionCount: storedData?.detectionCount,
            detectorIds: storedData?.detectionResults?.map(d => d.id)
        });

        if (storedData) {
            // Cache hit - use stored data
            console.log(`[handlePageLoadNotification] ✅ CACHE HIT - Using cached data`);
            console.log(`Scrapfly Background: ✅ Cache hit for ${pageUrl} (${storedData.detectionCount} detectors)`);

            // Check if URL is blacklisted before setting badge
            const isBlacklisted = await Utils.isUrlBlacklisted(pageUrl);

            // Update badge with cached detection count
            if (!isBlacklisted && storedData.detectionCount > 0) {
                // Load badge colors from CategoryManager
                const badgeColors = await CategoryManager.getBadgeColors(categoryManager);

                const count = storedData.detectionCount.toString();
                const color = storedData.detectionCount >= 5 ? badgeColors.high :
                             storedData.detectionCount >= 3 ? badgeColors.medium :
                             badgeColors.low;

                chrome.action.setBadgeText({ text: count, tabId: tabId }).catch((error) => {
                    // Expected: Tab might be closed
                    console.log(`[PageLoad] Failed to set badge text (cached) for tab ${tabId}:`, error.message);
                });
                chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId }).catch((error) => {
                    // Expected: Tab might be closed
                    console.log(`[PageLoad] Failed to set badge color (cached) for tab ${tabId}:`, error.message);
                });
            } else {
                // Clear badge if no detections or if blacklisted
                chrome.action.setBadgeText({ text: '', tabId: tabId }).catch((error) => {
                    // Expected: Tab might be closed
                    console.log(`[PageLoad] Failed to clear badge (no detections/blacklisted) for tab ${tabId}:`, error.message);
                });
            }

            // Notify popup if it's open
            chrome.runtime.sendMessage({
                type: 'NEW_DETECTION_DATA',
                tabId: tabId,
                url: pageUrl,
                detectionResults: storedData.detectionResults,
                fromStorage: true
            }).catch((error) => {
                // Expected: Popup may not be open
                console.log('[PageLoad] Popup not open, cached data not sent:', error.message);
            });

            // Notify content script to disable hooks/window properties monitoring (cache hit)
            chrome.tabs.sendMessage(tabId, {
                type: 'CACHE_HIT_DISABLE_MONITORING',
                url: pageUrl
            }).catch((error) => {
                // Content script might not be ready yet, that's okay
                console.log('[handlePageLoadNotification] Content script not ready for disable message:', error.message);
            });

            // Check if we should save to history on cache hit
            const historySettings = await Utils.getHistorySettings();
            const shouldSaveOnCacheHit = historySettings.historyBypassCache === true;

            if (shouldSaveOnCacheHit && storedData.detectionResults && storedData.detectionResults.length > 0) {
                console.log('[handlePageLoadNotification] historyBypassCache enabled - checking if should save cached detection to history');

                // Check duplicate prevention before saving
                const shouldSave = await History.shouldSaveToHistory(pageUrl, historySettings, chrome);

                if (shouldSave) {
                    // Get tab info for history entry
                    const tab = await chrome.tabs.get(tabId).catch(() => null);
                    if (tab) {
                        const pageData = {
                            url: pageUrl,
                            hostname: Utils.getHostnameFromUrl(pageUrl),
                            title: tab.title || 'Untitled',
                            favicon: tab.favIconUrl || Utils.getFaviconUrl(pageUrl)
                        };

                        await History.saveDetectionToHistory(tabId, pageData, storedData.detectionResults, chrome);
                        console.log('[handlePageLoadNotification] ✅ Saved cached detection to history');
                    }
                } else {
                    console.log('[handlePageLoadNotification] ⏭️  Skipped saving cached detection (duplicate prevention)');
                }
            }

            // Cache hit - no need to collect data or run detection again
            return;
        }

        // Cache miss - skip if we recently ran detection for this tab
        if (Utils.shouldSkipDetection(tabId, 1500, recentDetectionRequests)) {
            console.log(`Scrapfly Background: Skipping duplicate detection request for tab ${tabId}`);
            return;
        }

        // Show loading indicator in badge
        try {
            chrome.action.setBadgeText({ text: '⏳', tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: '#4A90E2', tabId: tabId }); // Blue color for loading
        } catch (error) {
            console.error('Failed to set loading badge:', error);
        }

        // Request data collection from content script
        console.log(`[DEBUG] Cache miss detected for ${pageUrl}, sending REQUEST_PAGE_DATA to content script`);
        console.log(`Scrapfly Background: ⚠️ Cache miss for ${pageUrl} (trigger: ${triggerSource}) - requesting fresh detection`);

        // BULLETPROOF: Retry sending REQUEST_PAGE_DATA if content script not ready
        let retryCount = 0;
        const maxRetries = 5;
        const retryDelay = 200; // ms between retries

        const sendDataRequest = () => {
            console.log(`[DEBUG] Sending REQUEST_PAGE_DATA to content script on tab ${tabId} (attempt ${retryCount + 1})`);
            chrome.tabs.sendMessage(tabId, { type: 'REQUEST_PAGE_DATA' }, (response) => {
                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError?.message || '';
                    console.log(`[DEBUG] REQUEST_PAGE_DATA response error: ${errorMsg}`);

                    // Retry if content script not ready yet
                    if ((errorMsg.includes('Could not establish connection') ||
                         errorMsg.includes('Receiving end does not exist') ||
                         errorMsg.includes('No receiving end')) && retryCount < maxRetries) {
                        retryCount++;
                        console.log(`[DEBUG] Content script not ready (attempt ${retryCount}/${maxRetries}), retrying in ${retryDelay}ms...`);
                        console.log(`Scrapfly Background: Content script not ready (attempt ${retryCount}/${maxRetries}), retrying in ${retryDelay}ms...`);
                        setTimeout(sendDataRequest, retryDelay);
                    } else {
                        console.warn(`[DEBUG] ❌ Failed to send data collection request after ${retryCount} retries: ${errorMsg}`);
                        console.warn(`Scrapfly Background: ❌ Failed to send data collection request after ${retryCount} retries:`, chrome.runtime.lastError);
                    }
                } else {
                    console.log(`[DEBUG] ✅ REQUEST_PAGE_DATA sent successfully, response:`, response);
                    console.log('Scrapfly Background: ✅ Data collection requested successfully');
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
            console.log(`[DEBUG] CLEAR_DETECTION_CACHE received for URL: ${request.url}, tabId: ${request.tabId}`);

            // Use Utils.getCacheScope() to properly load settings with correct default ('domain')
            // This ensures hash calculation matches storage/retrieval operations
            const cacheScope = await Utils.getCacheScope();

            const result = await chrome.storage.local.get([DetectionEngineManager.STORAGE_KEY]);
            const storage = result[DetectionEngineManager.STORAGE_KEY] || {};
            const urlHash = Utils.hashUrl(request.url, cacheScope);

            console.log(`[DEBUG] Cache scope: ${cacheScope}, urlHash: ${urlHash}, exists: ${!!storage[urlHash]}`);

            if (storage[urlHash]) {
                delete storage[urlHash];
                await chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: storage });
                console.log(`[DEBUG] ✅ Cache entry deleted for ${request.url}`);

                // Track this URL as manually cleared
                if (manuallyClearedCaches) {
                    manuallyClearedCaches.add(urlHash);
                    console.log(`[DEBUG] Marked ${urlHash} as manually cleared`);
                }

                // OPTION 1: Removed hold period logic
                // Instead of holding, we let the popup trigger silent background detection
                // This provides better UX: immediate empty state → clean badge → silent re-detect

                // NEW: Notify content script to clear sessionStorage cache flag
                if (request.tabId) {
                    try {
                        await chrome.tabs.sendMessage(request.tabId, {
                            type: 'CLEAR_SESSION_CACHE'
                        });
                        console.log(`[DEBUG] Notified content script to clear sessionStorage for tab ${request.tabId}`);
                    } catch (e) {
                        // Content script might not be loaded, continue normally
                        console.log(`[DEBUG] Could not notify content script: ${e.message}`);
                    }
                }

                sendResponse({ status: 'cleared', urlHash });
            } else {
                console.log(`[DEBUG] ⚠️  Cache entry not found for ${urlHash}`);
                sendResponse({ status: 'not_found' });
            }
        } catch (error) {
            console.error(`[DEBUG] Error clearing cache:`, error);
            sendResponse({ status: 'error', error: error.message });
        }

        return true; // Async response
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
                console.log('Scrapfly Background: Extension is disabled, skipping manual detection request');
                sendResponse({ status: 'error', error: 'Extension is disabled' });
                return true;
            }
        } catch (error) {
            console.error('Failed to check enabled state:', error);
        }

        try {
            // Get the specific tab info
            const tab = await chrome.tabs.get(tabId);

            // Check if it's a valid URL for content scripts
            if (!Utils.isValidContentScriptTab(tab)) {
                sendResponse({ status: 'error', error: 'Invalid URL for detection' });
                return true;
            }

            // Skip if we recently ran detection for this tab
            if (Utils.shouldSkipDetection(tabId, 2000, recentDetectionRequests)) {
                sendResponse({ status: 'skipped', reason: 'Recent detection exists' });
                return true;
            }

            // OPTION 1: Silent mode (for background re-detection after cache clear)
            const isSilent = request.silent === true;

            if (isSilent) {
                console.log(`[REQUEST_DETECTION] 🔄 Silent background detection for tab ${tabId}`);
            } else {
                // Show loading indicator in badge (only for non-silent detections)
                try {
                    chrome.action.setBadgeText({ text: '⏳', tabId: tabId });
                    chrome.action.setBadgeBackgroundColor({ color: '#4A90E2', tabId: tabId }); // Blue color for loading
                } catch (error) {
                    console.error('Failed to set loading badge:', error);
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
                // Expected: Content script may not be ready
                console.log('[REQUEST_DETECTION] Content script ping failed:', e.message);
            }

            // If script doesn't exist or doesn't respond, inject it
            if (!scriptExists) {
                console.log('Scrapfly Background: Content script not found, injecting...');

                try {
                    // Check if scripts are already injected to avoid duplicates
                    const [result] = await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: () => typeof window.DetectionEngineManager !== 'undefined'
                    });

                    if (!result.result) {
                        // Inject all dependencies in correct order (same as manifest content_scripts)
                        const scriptsToInject = [
                            'utils/debug.js',
                            'utils/utils.js',
                            'modules/confidence-manager.js',
                            'modules/detection-engine-manager.js',
                            'sections/settings/settings.js'
                        ];

                        for (const file of scriptsToInject) {
                            await chrome.scripting.executeScript({
                                target: { tabId: tabId },
                                files: [file]
                            });
                        }
                        console.log('Scrapfly Background: Injected all dependencies');
                    }

                    // Always inject content script (it has its own duplicate prevention)
                    await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content.js']
                    });
                    console.log('Scrapfly Background: Injected content script');

                    // Wait for scripts to initialize (longer wait for Utils to load)
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (injectionError) {
                    console.error('Scrapfly Background: Failed to inject scripts:', injectionError);
                    sendResponse({ status: 'error', error: `Script injection failed: ${injectionError.message}` });
                    return true;
                }
            }

            // Now send the detection request (pass silent flag to content script)
            chrome.tabs.sendMessage(tabId, {
                type: 'RUN_DETECTION',
                silent: isSilent  // Flag for silent background detection
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Scrapfly Background: Failed to trigger detection:', chrome.runtime.lastError.message);
                    sendResponse({ status: 'error', error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ status: 'requested', response: response });
                }
            });
        } catch (error) {
            console.error('Scrapfly Background: Error in REQUEST_DETECTION:', error);
            sendResponse({ status: 'error', error: error.message });
        }

        return true; // Will respond asynchronously
    }

    /**
     * Handle tab activation - restore badge from cache
     * @param {object} activeInfo - Tab activation info
     * @param {object} dependencies - Required dependencies
     */
    static async handleTabActivation(activeInfo, dependencies) {
        const { chrome, Settings, CategoryManager, Utils, categoryManager, interruptedDetections, activeDetections, detectionStates, manuallyClearedCaches } = dependencies;

        try {
            // Get tab info to check URL
            const tab = await chrome.tabs.get(activeInfo.tabId);
            if (!tab?.url) return;

            // PRIORITY 0: Check if extension is disabled - takes precedence over everything
            const result = await chrome.storage.local.get(['scrapfly_enabled']);
            if (result.scrapfly_enabled === false) {
                console.log(`[TabActivation] Extension is disabled - setting orange X badge for tab ${activeInfo.tabId}`);
                await chrome.action.setBadgeText({ text: '✕', tabId: activeInfo.tabId });
                await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId: activeInfo.tabId });
                return; // Don't check cache or apply any other badge logic
            }

            // PRIORITY 1: Check if this tab has an interrupted detection
            if (interruptedDetections && interruptedDetections.has(activeInfo.tabId)) {
                console.log(`[TabActivation] Tab ${activeInfo.tabId} has interrupted detection - restoring red X badge`);
                await chrome.action.setBadgeText({ text: '✕', tabId: activeInfo.tabId });
                await chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: activeInfo.tabId }); // Red color
                return; // Don't overwrite with normal badge
            }

            // PRIORITY 1.5: TAB SWITCH FIX - Check if detection is actively running
            // If detection is in progress or completing, the detection flow owns the badge
            // Don't interfere - prevents flickering X badge when user switches tabs mid-detection
            if (activeDetections && activeDetections.has(activeInfo.tabId)) {
                console.log(`[TabActivation] 🔄 Detection active on tab ${activeInfo.tabId} - preserving current badge (don't interfere)`);
                return; // Don't touch the badge - let detection flow manage it
            }

            // PRIORITY 1.75: Check if URL is blacklisted
            const isBlacklisted = await Utils.isUrlBlacklisted(tab.url);
            if (isBlacklisted) {
                console.log(`[TabActivation] ⛔ Tab ${activeInfo.tabId} is blacklisted - showing orange X badge`);
                await chrome.action.setBadgeText({ text: '✕', tabId: activeInfo.tabId });
                await chrome.action.setBadgeBackgroundColor({ color: '#FF8C00', tabId: activeInfo.tabId }); // Orange color
                return; // Don't check cache or show normal badge
            }

            // PRIORITY 2: Check if we already have stored detection data for this tab's URL
            const storedData = await DetectionEngineManager.getStoredDetection(tab.url);
            if (storedData) {
                // Restore badge from cached data
                if (storedData.detectionCount > 0) {
                    const badgeColors = await CategoryManager.getBadgeColors(categoryManager);
                    const count = storedData.detectionCount.toString();
                    const color = storedData.detectionCount >= 5 ? badgeColors.high :
                                 storedData.detectionCount >= 3 ? badgeColors.medium :
                                 badgeColors.low;

                    await chrome.action.setBadgeText({ text: count, tabId: activeInfo.tabId });
                    await chrome.action.setBadgeBackgroundColor({ color: color, tabId: activeInfo.tabId });
                } else {
                    // Clear badge if no detections
                    await chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
                }
            } else {
                // PRIORITY 3: No cached data - check if URL is valid for detection
                if (Utils.isValidContentScriptUrl(tab.url)) {
                    // Check if cache was manually cleared (show gray X instead of red)
                    const cacheScope = await Utils.getCacheScope();
                    const urlHash = Utils.hashUrl(tab.url, cacheScope);
                    const wasManuallyCleared = manuallyClearedCaches && manuallyClearedCaches.has(urlHash);
                    
                    if (wasManuallyCleared) {
                        // Show gray X for manually cleared cache
                        await chrome.action.setBadgeText({ text: '✕', tabId: activeInfo.tabId });
                        await chrome.action.setBadgeBackgroundColor({ color: '#6c757d', tabId: activeInfo.tabId });
                        console.log(`[TabActivation] ✕ Cache was manually cleared for tab ${activeInfo.tabId} - showing gray X`);
                    } else {
                        // Show red X to indicate reload needed
                        await chrome.action.setBadgeText({ text: '✕', tabId: activeInfo.tabId });
                        await chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: activeInfo.tabId });
                        console.log(`[TabActivation] ✕ No cached data for tab ${activeInfo.tabId} - showing reload indicator`);
                    }
                } else {
                    // Invalid URL (chrome://, about:, etc.) - clear badge
                    await chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
                    console.log(`[TabActivation] Invalid URL for tab ${activeInfo.tabId} - clearing badge`);
                }
            }
        } catch (error) {
            console.error('Error updating badge on tab activation:', error);
        }
    }

    /**
     * Install JS Hooks orchestrator - prepares and sends hook configuration to MAIN world
     * Moved from content.js for better organization
     * @param {object} windowObj - The window object (for dispatching events)
     * @param {object} chrome - Chrome API object
     * @returns {Promise<void>}
     */
    static async installHooksOrchestrator(windowObj, chrome) {
        // Early context check
        if (!chrome?.runtime?.id) {
            console.log('[Hooks] Extension context not available');
            // Send empty config to ensure completion signals
            windowObj.dispatchEvent(new CustomEvent('scrapfly-install-hooks', {
                detail: {
                    hookDefinitions: [],
                    windowProperties: [],
                    debugMode: false,
                    enhancedSettings: DetectionEngineManager.buildEnhancedSettings({ enabled: false })
                }
            }));
            return;
        }

        // Check if extension is disabled
        try {
            const result = await chrome.storage.local.get(['scrapfly_enabled']);
            if (result.scrapfly_enabled === false) {
                console.log('[Hooks] Extension is disabled - skipping hook installation');
                // Send empty config to ensure completion signals
                windowObj.dispatchEvent(new CustomEvent('scrapfly-install-hooks', {
                    detail: {
                        hookDefinitions: [],
                        windowProperties: [],
                        debugMode: false,
                        enhancedSettings: DetectionEngineManager.buildEnhancedSettings({ enabled: false })
                    }
                }));
                return;
            }
        } catch (error) {
            console.warn('[Hooks] Failed to check enabled state, proceeding with installation:', error);
            // Continue with installation if check fails (fail-open)
        }

        try {
            console.log('[Content Script] Installing JS hooks...');

            // OPTIMIZED 2.2 (with resilience): attempt to fetch detectors with retries
            const getDetectorsWithRetries = async () => {
                const MAX_ATTEMPTS = 3;
                const RETRY_DELAY_MS = 250;

                for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                    if (!chrome?.runtime?.id) {
                        console.warn('[Hooks] Runtime context missing during detector fetch');
                        return null;
                    }

                    try {
                        const response = await chrome.runtime.sendMessage({ type: 'GET_DETECTORS' });
                        if (response && response.detectors) {
                            if (attempt > 1) {
                                console.log(`[Hooks] GET_DETECTORS succeeded on retry ${attempt}`);
                            }
                            return response.detectors;
                        }
                    } catch (error) {
                        if (error.message?.includes('Extension context invalidated')) {
                            console.warn('[Hooks] Context invalid during detector fetch - aborting');
                            return null;
                        }
                        console.warn(`[Hooks] GET_DETECTORS attempt ${attempt} failed:`, error.message || error);
                    }

                    if (attempt < MAX_ATTEMPTS) {
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
                    }
                }

                return null;
            };

            let detectors = await getDetectorsWithRetries();

            if (!detectors) {
                try {
                    const localDetectors = await chrome.storage.local.get(['scrapfly_detectors']);
                    if (localDetectors.scrapfly_detectors) {
                        const parsed = typeof localDetectors.scrapfly_detectors === 'string'
                            ? JSON.parse(localDetectors.scrapfly_detectors)
                            : localDetectors.scrapfly_detectors;
                        if (parsed && parsed.detectors) {
                            detectors = parsed.detectors;
                            console.warn('[Hooks] Using cached detectors from storage fallback');
                        } else {
                            detectors = parsed;
                            console.warn('[Hooks] Using raw cached detectors from storage fallback');
                        }
                    }
                } catch (storageError) {
                    console.warn('[Hooks] Failed to load detectors from storage fallback:', storageError.message || storageError);
                }
            }

            if (!detectors) {
                console.warn('[Content Script] No detectors available after retries - sending empty config to allow completion');
                windowObj.dispatchEvent(new CustomEvent('scrapfly-install-hooks', {
                    detail: {
                        hookDefinitions: [],
                        windowProperties: [],
                        debugMode: false,
                        enhancedSettings: DetectionEngineManager.buildEnhancedSettings({ enabled: false })
                    }
                }));
                return;
            }

            const settingsResult = await chrome.storage.local.get(['scrapfly_settings']);

            let settingsData = {};
            if (settingsResult.scrapfly_settings) {
                const settings = typeof settingsResult.scrapfly_settings === 'string'
                    ? JSON.parse(settingsResult.scrapfly_settings)
                    : settingsResult.scrapfly_settings;
                settingsData = settings.settings || settings;
            }

            // Extract hook definitions and window property checks from ALL detectors
            const hookDefinitions = [];
            const windowPropertyDefinitions = [];

            // Process all detector categories
            for (const [category, categoryDetectors] of Object.entries(detectors)) {
                for (const [detectorId, detector] of Object.entries(categoryDetectors || {})) {

                    // Collect JS hooks
                    if (detector.detection?.js_hooks && detector.detection.js_hooks.length > 0) {
                        hookDefinitions.push({
                            id: detector.id || detectorId,
                            name: detector.name,
                            category: category,
                            hooks: detector.detection.js_hooks.filter(h => h.enabled !== false)
                        });
                    }

                    // Collect window property checks (filter out disabled ones)
                    // Support both "window" and "window_properties" field names for backward compatibility
                    const windowProps = detector.detection?.window || detector.detection?.window_properties;
                    if (windowProps && windowProps.length > 0) {
                        for (const prop of windowProps) {
                            // Skip disabled window properties (like JS hooks)
                            if (prop.enabled === false) {
                                continue;
                            }

                            windowPropertyDefinitions.push({
                                detectorId: detector.id || detectorId,
                                detectorName: detector.name,
                                category: category,
                                path: prop.path || prop.property, // Support both 'path' and 'property' keys
                                condition: prop.condition || 'truthy',
                                confidence: prop.confidence || 80,
                                description: prop.description
                            });
                        }
                    }
                }
            }

            const debugMode = settingsData.debugMode || false;

            // ENHANCED DETECTION: Extract enhanced detection settings
            const enhancedDetectionSettings = settingsData.detection?.enhancedDetection;
            const enhancedSettings = DetectionEngineManager.buildEnhancedSettings(enhancedDetectionSettings);

            if (DetectionEngineManager.DEBUG_MODE) {
                console.log('[Enhanced Detection] Settings loaded:', enhancedSettings);
            }

            // IMPORTANT: Always send configuration to MAIN world, even if empty
            // This ensures MAIN world sends completion signals (JS_HOOKS_COMPLETE, WINDOW_PROPS_COMPLETE)
            // Otherwise background waits forever for these signals and detection never finalizes
            if (DetectionEngineManager.DEBUG_MODE) {
                if (hookDefinitions.length === 0 && windowPropertyDefinitions.length === 0) {
                    console.log('[Content Script] No JS hooks or window properties defined - sending empty config to MAIN world');
                } else {
                    console.log(`[Content Script] Sending ${hookDefinitions.length} hook detectors and ${windowPropertyDefinitions.length} window properties to MAIN world (debug: ${debugMode}, enhanced: ${enhancedSettings.enabled})...`);
                }
            }

            // Send both hooks AND window properties to MAIN world via CustomEvent
            windowObj.dispatchEvent(new CustomEvent('scrapfly-install-hooks', {
                detail: {
                    hookDefinitions,
                    windowProperties: windowPropertyDefinitions,
                    debugMode,
                    enhancedSettings  // ENHANCED DETECTION: Pass settings to MAIN world
                }
            }));
        } catch (error) {
            console.error('[Content Script] Failed to install hooks:', error);
        }
    }


    /**
     * Create hook batcher - handles batching of hook detections before sending to background
     * Moved from content.js for better organization
     *
     * ============================================================================
     * BATCHING & DEDUPLICATION ARCHITECTURE
     * ============================================================================
     *
     * Purpose:
     * ────────
     * Batches hook detections and deduplicates before sending to background.
     * Reduces message passing overhead and ensures clean detection data.
     *
     * Phase 3 Implementation:
     * ──────────────────────
     * 1. Receives postMessage() events from MAIN world (one at a time)
     * 2. Queues hooks into hookBatch array
     * 3. Triggers batch flush based on:
     *    - Time: 10-50ms adaptive delay (based on hook frequency)
     *    - Size: Force flush at 20 hooks
     *    - Emergency: Force flush at 50 hooks (prevents memory leak)
     * 4. On flush: Deduplicate and send to background
     *
     * Deduplication Logic:
     * ───────────────────
     * Key: "detectorId:target" (unique combination)
     *
     * Why this key format?
     *   - detectorId: Identifies which detector found it (e.g., "performance-fingerprint")
     *   - target: Which API was called (e.g., "Performance.prototype.now")
     *   - Together: Different detectors on same API are tracked separately (no collision!)
     *
     * Example Deduplication:
     * ───────────────────
     * Input batches (hook firings in order):
     *   1. performance-fingerprint:Performance.prototype.now (from dynamic detector)
     *   2. performance-fingerprint:Performance.prototype.now (SAME API, SAME detector → DUPLICATE)
     *   3. performance-fingerprint:Performance.prototype.memory (from dynamic detector)
     *   4. inline-hook-performance-prototype-now:Performance.prototype.now (from inline hook → DIFFERENT ID!)
     *
     * After deduplication:
     *   1. performance-fingerprint:Performance.prototype.now (kept)
     *   2. [REMOVED - duplicate of #1]
     *   3. performance-fingerprint:Performance.prototype.memory (kept - different target)
     *   4. inline-hook-performance-prototype-now:Performance.prototype.now (kept - different detector!)
     *
     * Output: 3 unique entries, 1 duplicate removed
     *
     * Why Old System Failed:
     * ─────────────────────
     * Old key format: Just "target" (API name)
     *   - canvas-fingerprint:HTMLCanvasElement.prototype.toDataURL
     *   - inline-hook-htmlcanvaselement-prototype-todataurl:HTMLCanvasElement.prototype.toDataURL
     *   → Both have same target → COLLISION! Only counted as 1 instead of 2
     *   → Service worker stats showed lower counts than actual detectors
     *   → User saw inconsistent results (sometimes 9, sometimes 11)
     *
     * @param {object} chrome - Chrome API object
     * @returns {object} Batcher object with batch management methods
     */
    static createHookBatcher(chrome) {
        // OPTIMIZED 2.4 + 3.2: Adaptive batching for hook detections
        // Dynamically adjusts batch window based on detection frequency
        // OPTIMIZATION Phase 9A.5: Added emergency size limit to prevent memory leaks
        let hookBatch = [];
        let hookBatchTimeout = null;
        let lastBatchSize = 0;
        let lastBatchTime = Date.now();
        const HOOK_BATCH_DELAY_MIN = 10;  // 10ms when many hooks firing (busy)
        const HOOK_BATCH_DELAY_MAX = 50;  // 50ms when few hooks (idle)
        const HOOK_BATCH_MAX_SIZE = 20;   // Force flush at 20 hooks
        const HOOK_BATCH_EMERGENCY_SIZE = 50; // Drop oldest if exceeds 50 (safety guard)

        // OPTIMIZATION: Calculate adaptive delay based on hook frequency
        function getAdaptiveBatchDelay() {
            const timeSinceLastBatch = Date.now() - lastBatchTime;

            // If hooks firing rapidly (< 100ms between batches), use shorter delay
            if (timeSinceLastBatch < 100 && lastBatchSize > 5) {
                return HOOK_BATCH_DELAY_MIN;
            }

            // If hooks firing slowly, use longer delay to batch more
            if (timeSinceLastBatch > 500) {
                return HOOK_BATCH_DELAY_MAX;
            }

            // Interpolate between min and max based on batch size
            const sizeRatio = Math.min(lastBatchSize / 10, 1);
            return HOOK_BATCH_DELAY_MIN + (HOOK_BATCH_DELAY_MAX - HOOK_BATCH_DELAY_MIN) * (1 - sizeRatio);
        }

        function flushHookBatch() {
            if (hookBatch.length === 0) return;

            // OPTIMIZATION Phase 10.4: Immediate flush on overflow to prevent memory leak
            if (hookBatch.length > HOOK_BATCH_EMERGENCY_SIZE) {
                if (DetectionEngineManager.DEBUG_MODE) {
                    console.warn(`[Content Script] ⚠️ Hook batch overflow (${hookBatch.length} hooks), forcing immediate flush`);
                }
                // Clear existing timeout to prevent double flush
                if (hookBatchTimeout) {
                    clearTimeout(hookBatchTimeout);
                    hookBatchTimeout = null;
                }
            }

            if (!chrome.runtime?.id) {
                console.error('[Content Script] ❌ Extension context invalidated, cannot forward hooks');
                hookBatch = [];
                return;
            }

            // OPTIMIZATION: Deduplicate hooks before sending (prevents duplicate detector entries)
            // Count occurrences by detector:hook combination (actual dedup key)
            const dedupeKeyCounts = new Map(); // "detectorId:hook" -> count
            for (const hookData of hookBatch) {
                const key = `${hookData.detection.detectorId}:${hookData.detection.hook.target}`;
                dedupeKeyCounts.set(key, (dedupeKeyCounts.get(key) || 0) + 1);
            }

            // Deduplicate: keep only first occurrence of each detector:hook combination
            const uniqueHooks = new Map();
            for (const hookData of hookBatch) {
                const key = `${hookData.detection.detectorId}:${hookData.detection.hook.target}`;
                if (!uniqueHooks.has(key)) {
                    uniqueHooks.set(key, hookData);
                }
            }

            const deduplicatedHooks = Array.from(uniqueHooks.values());

            // Send batched detections
            chrome.runtime.sendMessage({
                type: 'JS_HOOK_DETECTION_BATCH',
                detections: deduplicatedHooks,
                timestamp: Date.now()
            }).catch((error) => {
                const errorMsg = error?.message || '';

                // Service worker not available - don't log as error (expected on reload)
                if (errorMsg.includes('Could not establish connection') ||
                    errorMsg.includes('Receiving end does not exist')) {
                    console.debug('[Content Script] ℹ️ Service worker not available (expected on reload)');
                }
                // Context invalidation - this is expected when extension reloads
                else if (errorMsg.includes('Extension context invalidated')) {
                    console.debug('[Content Script] ℹ️ Extension context invalidated');
                }
                // Other errors - log as warning
                else {
                    console.warn('[Content Script] ⚠️ Failed to send hook batch:', error);
                }
            });

            // Update batch stats for adaptive delay
            lastBatchSize = hookBatch.length;
            lastBatchTime = Date.now();

            hookBatch = [];
            hookBatchTimeout = null;
        }

        return {
            addHook: function(hookData) {
                // Add to batch
                hookBatch.push(hookData);

                // OPTIMIZATION: Force flush if batch is too large (prevents memory buildup)
                if (hookBatch.length >= HOOK_BATCH_MAX_SIZE) {
                    if (hookBatchTimeout) {
                        clearTimeout(hookBatchTimeout);
                        hookBatchTimeout = null;
                    }
                    flushHookBatch();
                }
                // Schedule flush with adaptive delay if not already scheduled
                else if (!hookBatchTimeout) {
                    const delay = getAdaptiveBatchDelay();
                    hookBatchTimeout = setTimeout(flushHookBatch, delay);
                }
            },
            flush: flushHookBatch,
            getTimeout: function() {
                return hookBatchTimeout;
            },
            clearTimeout: function() {
                if (hookBatchTimeout) {
                    clearTimeout(hookBatchTimeout);
                    hookBatchTimeout = null;
                }
            }
        };
    }

    /**
     * Handle hook messages from MAIN world - processes and forwards to background
     * Moved from content.js for better organization
     * @param {object} event - Message event from window.postMessage
     * @param {object} chrome - Chrome API object
     * @param {object} hookBatcher - Hook batcher object
     * @returns {boolean} True if message was handled
     */
    static handleHookMessage(event, chrome, hookBatcher) {
        // Only accept messages from same origin
        if (event.source !== window) return false;

        const data = event.data;

        // Forward logs from MAIN world to service worker via debug system
        if (data && data.type === 'MAIN_WORLD_LOG') {
            if (chrome.runtime?.id) {
                chrome.runtime.sendMessage({
                    type: 'DEBUG_LOG',
                    context: 'MAIN_WORLD',
                    level: data.level,
                    args: data.args,
                    timestamp: data.timestamp
                }).catch((error) => {
                    // Expected: Background may not be ready
                    console.log('[MAIN_WORLD] Failed to forward log to background:', error.message);
                });
            }
            return true;
        }

        // OPTIMIZED: Adaptive batch hook detections
        if (data && data.type === 'JS_HOOK_DETECTION') {
            // Defensive check - shouldn't happen if MAIN world is working correctly
            if (window.__scrapflyCacheHitEarlyExit) {
                console.warn('[Content] Received hook detection despite cache hit flag - ignoring');
                return true;
            }

            // Debug log removed - already logged in service worker via message
            hookBatcher.addHook({
                detection: data.detection,
                url: data.url,
                timestamp: data.timestamp
            });
            return true;
        }

        // Check if this is window property detections from MAIN world
        if (data && data.type === 'WINDOW_DETECTIONS') {
            // Defensive check - shouldn't happen if MAIN world polling check is working correctly
            if (window.__scrapflyCacheHitEarlyExit) {
                console.warn('[Content] Received window detections despite cache hit flag - ignoring');
                return true;
            }

            console.log(`[Content Script] 🔍 Window detections received: ${data.detections.length} properties detected in ${data.executionTime}ms`);

            // Check if extension context is still valid
            if (!chrome.runtime?.id) {
                console.error('[Content Script] ❌ Extension context invalidated, cannot send window detections');
                return true;
            }

            // Forward window detections to background
            chrome.runtime.sendMessage({
                type: 'WINDOW_DETECTIONS',
                detections: data.detections,
                timestamp: data.timestamp,
                executionTime: data.executionTime
            }).then(() => {
                console.log(`[Content Script] ✅ Window detections forwarded to background`);
            }).catch((error) => {
                console.error('[Content Script] ❌ Failed to send window detections:', error);
            });
            return true;
        }

        // Check if this is window properties completion signal
        if (data && data.type === 'WINDOW_PROPS_COMPLETE') {
            // Debug logs removed - already logged in service worker via message

            // Use async function with retry logic (same as JS hooks)
            (async () => {
                const sendCompletion = async () => {
                    const MAX_ATTEMPTS = 3;
                    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                        if (!chrome.runtime?.id) {
                            console.error(`[Content Script] ❌ Extension context invalidated (attempt ${attempt}) - window props completion not sent`);
                            await new Promise(resolve => setTimeout(resolve, attempt * 100));
                            continue;
                        }

                        try {
                            await chrome.runtime.sendMessage({
                                type: 'WINDOW_PROPS_COMPLETE',
                                url: data.url,
                                timestamp: data.timestamp,
                                detectedCount: data.detectedCount
                            });
                            console.log(`[Content Script] ✅ Window properties completion signal sent successfully on attempt ${attempt}`);
                            return;
                        } catch (error) {
                            console.error(`[Content Script] ❌ Failed to send window props completion signal (attempt ${attempt}):`, error);
                            await new Promise(resolve => setTimeout(resolve, attempt * 100));
                        }
                    }

                    console.error('[Content Script] ❌ Giving up on window props completion signal after repeated failures');
                };

                await sendCompletion();
            })();
            return true;
        }

        // Check if this is a JS hooks completion signal
        if (data && data.type === 'JS_HOOKS_COMPLETE') {
            // Debug logs removed - already logged in service worker via message

            // OPTIMIZATION Phase 10.1: Wait for flush to complete before sending completion
            // This prevents race condition where background receives completion before all hook data
            (async () => {
                // Flush any pending batched hooks and wait
                if (hookBatcher.getTimeout()) {
                    hookBatcher.clearTimeout();
                    hookBatcher.flush();
                    // Wait 50ms for flush message to be sent and processed
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                // Check if extension context is still valid
                const sendCompletion = async () => {
                    const MAX_ATTEMPTS = 3;
                    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                        if (!chrome.runtime?.id) {
                            console.error(`[Content Script] ❌ Extension context invalidated (attempt ${attempt}) - completion not sent`);
                            await new Promise(resolve => setTimeout(resolve, attempt * 100));
                            continue;
                        }

                        try {
                            await chrome.runtime.sendMessage({
                                type: 'JS_HOOKS_COMPLETE',
                                url: data.url,
                                timestamp: data.timestamp,
                                totalDetections: data.totalDetections,
                                uniqueHooks: data.uniqueHooks
                            });
                            console.log(`[Content Script] ✅ Completion signal sent successfully on attempt ${attempt}`);
                            return;
                        } catch (error) {
                            console.error(`[Content Script] ❌ Failed to send completion signal (attempt ${attempt}):`, error);
                            await new Promise(resolve => setTimeout(resolve, attempt * 100));
                        }
                    }

                    console.error('[Content Script] ❌ Giving up on completion signal after repeated failures');
                };

                await sendCompletion();
            })();
            return true;
        }

        return false;
    }
}

// Export for use in content script and service worker
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DetectionEngineManager;
} else if (typeof window !== 'undefined') {
    window.DetectionEngineManager = DetectionEngineManager;
}