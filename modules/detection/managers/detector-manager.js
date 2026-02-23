class DetectorManager {
    static DETECTOR_ID_PREFIX = 'detect-';
    constructor(categoryManager) {
        this.categoryManager = categoryManager || new CategoryManager();
        this.detectors = {};
        this.initialized = false;
    }

    // Remove prefix, join with spaces, capitalize
    static humanizeDetectorName(detectorId) {
        if (!detectorId || typeof detectorId !== 'string') return 'Unknown';
        const cleaned = detectorId.replace(/^detect-/, '').replace(/[-_]+/g, ' ').trim();
        return cleaned.split(' ').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // Ensure canonical prefix format
    static canonicalizeDetectorId(detectorId) {
        if (!detectorId || typeof detectorId !== 'string') return '';
        if (detectorId.startsWith(DetectorManager.DETECTOR_ID_PREFIX)) {
            return detectorId;
        }
        return `${DetectorManager.DETECTOR_ID_PREFIX}${detectorId}`;
    }

    // Convert category name to display format
    static categoryDisplayName(categoryName) {
        const normalized = (categoryName || '').toLowerCase();
        const map = {
            antibot: 'Anti-Bot',
            captcha: 'CAPTCHA',
            fingerprint: 'Fingerprint'
        };
        return map[normalized] || categoryName || 'Unknown';
    }

    /**
     * Apply small, targeted fixups to known detectors to prevent common false-positives.
     * This runs for detectors loaded from disk, storage, or remote updates.
     * @param {object} detectorData
     * @param {object} context
     * @param {string} context.source
     */
    static applyDetectorFixups(detectorData, { source = 'unknown' } = {}) {
        try {
            if (!detectorData || typeof detectorData !== 'object') return detectorData;
            const detection = detectorData.detection;
            if (!detection || typeof detection !== 'object') return detectorData;

            // DataDome: cookie/header names must be exact to avoid matching GitHub's ref-selector:* cookies
            // (e.g., "ref-selector:...datadome..." would previously match "datadome" via substring).
            if (detectorData.id === 'detect-datadome') {
                const escapeRegExp = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const ensureExactNameRule = (rule, expectedName) => {
                    if (!rule || typeof rule !== 'object') return false;
                    if (typeof rule.name !== 'string') return false;
                    const normalized = rule.name.trim();
                    if (!normalized) return false;

                    const anchored = `^${escapeRegExp(expectedName)}$`;
                    const expectedLower = expectedName.toLowerCase();
                    const normalizedLower = normalized.toLowerCase();

                    // Be conservative: DataDome is known to use an exact cookie/header name.
                    // Any pattern containing "datadome" but not anchored is treated as too broad
                    // and can match GitHub storage keys like "ref-selector:*datadome*".
                    const looksLikeDatadome = normalizedLower.includes(expectedLower);
                    const isAlreadyExact = normalized === anchored;

                    let changed = false;
                    if (looksLikeDatadome && !isAlreadyExact) {
                        rule.name = anchored;
                        changed = true;
                    } else if (normalized === expectedName && !isAlreadyExact) {
                        rule.name = anchored;
                        changed = true;
                    }

                    if (looksLikeDatadome && rule.nameRegex !== true) {
                        rule.nameRegex = true;
                        changed = true;
                    }

                    // Never let DataDome match storage keys (localStorage/sessionStorage entries).
                    // Only real cookies/headers should be used.
                    if (rule.nameScope === 'storage' || rule.nameScope === 'all_with_storage') {
                        rule.nameScope = 'all';
                        changed = true;
                    }
                    if (rule.valueScope === 'storage' || rule.valueScope === 'all_with_storage') {
                        rule.valueScope = 'all';
                        changed = true;
                    }

                    return changed;
                };

                let changed = false;
                if (Array.isArray(detection.cookie)) {
                    for (const rule of detection.cookie) {
                        changed = ensureExactNameRule(rule, 'datadome') || changed;
                    }
                }
                if (Array.isArray(detection.header)) {
                    for (const rule of detection.header) {
                        changed = ensureExactNameRule(rule, 'x-datadome-cid') || changed;
                    }
                }

                if (changed) {
                    Logger.debug('DETECTOR', `[normalizeDetectorSchema] Applied DataDome fixups (${source})`);
                }
            }
        } catch (e) {
        }

        return detectorData;
    }

    // Validate and normalize detector schema; ensures canonical IDs and safe defaults
    static normalizeDetectorSchema(detectorData, { categoryName, detectorName, source = 'unknown' } = {}) {
        if (!detectorData || typeof detectorData !== 'object') {
            Logger.error('DETECTOR', `[normalizeDetectorSchema] Invalid detector data (${source})`, { categoryName, detectorName });
            return null;
        }

        const canonicalId = DetectorManager.canonicalizeDetectorId(detectorName || detectorData.id || '');
        if (!canonicalId) {
            Logger.error('DETECTOR', `[normalizeDetectorSchema] Missing detector ID (${source})`, { categoryName, detectorName });
            return null;
        }

        if (!detectorData.id || detectorData.id !== canonicalId) {
            Logger.debug('DETECTOR', `[normalizeDetectorSchema] Canonicalizing ID (${source})`, {
                from: detectorData.id,
                to: canonicalId
            });
            detectorData.id = canonicalId;
        }

        if (!detectorData.name || typeof detectorData.name !== 'string') {
            detectorData.name = DetectorManager.humanizeDetectorName(canonicalId);
            Logger.debug('DETECTOR', `[normalizeDetectorSchema] Missing name, using fallback (${source})`, {
                id: canonicalId,
                name: detectorData.name
            });
        }

        if (!detectorData.category || typeof detectorData.category !== 'string') {
            detectorData.category = DetectorManager.categoryDisplayName(categoryName);
        }

        if (detectorData.enabled === undefined) {
            detectorData.enabled = true;
        }

        if (!detectorData.version || typeof detectorData.version !== 'string') {
            detectorData.version = '0.0';
        }

        const normalizedDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.normalizeDifficulty === 'function')
            ? DetectionUtils.normalizeDifficulty(detectorData.difficulty)
            : null;
        const defaultDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.defaultDifficultyForCategory === 'function')
            ? DetectionUtils.defaultDifficultyForCategory(categoryName || detectorData.category)
            : 'Medium';
        detectorData.difficulty = normalizedDifficulty || defaultDifficulty;

        if (!detectorData.detection || typeof detectorData.detection !== 'object') {
            Logger.warn('DETECTOR', `[normalizeDetectorSchema] Missing detection object (${source})`, {
                id: canonicalId
            });
            detectorData.detection = {};
        }

        const detection = detectorData.detection;

        const knownKeys = ['cookie', 'header', 'content', 'dom', 'url', 'window', 'js_hooks', 'payload'];
        for (const key of knownKeys) {
            if (detection[key] !== undefined && !Array.isArray(detection[key])) {
                Logger.warn('DETECTOR', `[normalizeDetectorSchema] Invalid detection key type (${source})`, {
                    id: canonicalId,
                    key,
                    type: typeof detection[key]
                });
                detection[key] = [];
            }
        }

        // Disallow storage scopes for cookie/header matching
        const normalizeCookieHeaderScope = (scope, fallback) => {
            const normalized = typeof scope === 'string' ? scope.trim().toLowerCase() : '';
            if (normalized === 'all_with_storage') return 'all';
            if (normalized === 'storage') return fallback;
            if (normalized === 'request' || normalized === 'response' || normalized === 'all') return normalized;
            return fallback;
        };

        if (Array.isArray(detection.cookie)) {
            for (const rule of detection.cookie) {
                if (!rule || typeof rule !== 'object') continue;
                if (rule.nameScope != null) rule.nameScope = normalizeCookieHeaderScope(rule.nameScope, 'request');
                if (rule.valueScope != null) rule.valueScope = normalizeCookieHeaderScope(rule.valueScope, 'request');
            }
        }

        if (Array.isArray(detection.header)) {
            for (const rule of detection.header) {
                if (!rule || typeof rule !== 'object') continue;
                if (rule.nameScope != null) rule.nameScope = normalizeCookieHeaderScope(rule.nameScope, 'response');
                if (rule.valueScope != null) rule.valueScope = normalizeCookieHeaderScope(rule.valueScope, 'response');
            }
        }

        DetectorManager.applyDetectorFixups(detectorData, { source });

        return detectorData;
    }

    /**
     * Initialize the DetectorManager by loading categories and detectors from files
     * and saving them to Chrome storage
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            if (!this.categoryManager.initialized) {
                await this.categoryManager.initialize();
            }

            const storageLoaded = await this.loadFromStorage();

            if (!storageLoaded || this.getDetectorCount() === 0) {
                await this.loadDetectorsFromIndex();
                await this.saveDetectorsToStorage();
            }

            this.initialized = true;
        } catch (error) {
            Logger.error('DETECTOR', 'DetectorManager failed to initialize', error);
            throw error;
        }
    }


    /**
     * Load all detector files based on categories
     * Reads each detector file from detectors/{category}/{detector}.json
     */
    async loadDetectorsFromIndex() {
        const loadPromises = [];
        const categories = this.categoryManager.getAllCategories();

        let totalDetectorsToLoad = 0;

        for (const [categoryName, categoryData] of Object.entries(categories)) {
            if (categoryData.detectors && Array.isArray(categoryData.detectors)) {
                totalDetectorsToLoad += categoryData.detectors.length;
            }
        }

        for (const [categoryName, categoryData] of Object.entries(categories)) {
            if (!categoryData.detectors || !Array.isArray(categoryData.detectors)) {
                continue;
            }

            if (!this.detectors[categoryName]) {
                this.detectors[categoryName] = {};
            }

            for (const detectorName of categoryData.detectors) {
                const promise = this.loadDetectorFile(categoryName, detectorName);
                loadPromises.push(promise);
            }
        }

        await Promise.allSettled(loadPromises);

        // Validation: Ensure at least some detectors loaded
        const finalCount = this.getDetectorCount();
        if (finalCount === 0) {
            Logger.error('DETECTOR', 'No detectors loaded - JSON files may be missing or corrupt', {
                detectors: this.detectors
            });
            throw new Error('No detectors were loaded - all JSON files may be missing or corrupt');
        }
    }

    /**
     * Pre-compile patterns for a detector to optimize runtime performance
     * Compiles all regex patterns during load, avoiding runtime compilation
     * @param {object} detectorData - Detector configuration
     */
    precompileDetectorPatterns(detectorData) {
        if (!detectorData.detection) return;

        const detection = detectorData.detection;

        // Pre-compile content patterns
        if (detection.content && Array.isArray(detection.content)) {
            detection.content.forEach(pattern => {
                if (pattern.textRegex || pattern.regex) {
                    try {
                        const flags = pattern.textCaseSensitive || pattern.caseSensitive ? 'g' : 'gi';
                        pattern._compiledRegex = new RegExp(pattern.text, flags);
                    } catch (e) {
                        Logger.warn('DETECTOR', 'Failed to precompile content pattern', { pattern: pattern.text, error: e.message });
                    }
                } else if (pattern.textWholeWord || pattern.wholeWord) {
                    try {
                        const escapedPattern = pattern.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const flags = pattern.textCaseSensitive || pattern.caseSensitive ? 'g' : 'gi';
                        pattern._compiledRegex = new RegExp(`\\b${escapedPattern}\\b`, flags);
                    } catch (e) {
                        Logger.warn('DETECTOR', 'Failed to precompile word boundary pattern', { pattern: pattern.text, error: e.message });
                    }
                }
            });
        }

        // Pre-compile URL patterns
        if (detection.urls && Array.isArray(detection.urls)) {
            detection.urls.forEach(pattern => {
                if (pattern.textRegex || pattern.regex) {
                    try {
                        const flags = pattern.textCaseSensitive || pattern.caseSensitive ? 'g' : 'gi';
                        pattern._compiledRegex = new RegExp(pattern.text, flags);
                    } catch (e) {
                        Logger.warn('DETECTOR', 'Failed to precompile URL pattern', { pattern: pattern.text, error: e.message });
                    }
                }
            });
        }

        // Pre-compile cookie name patterns
        if (detection.cookies && Array.isArray(detection.cookies)) {
            detection.cookies.forEach(pattern => {
                if (pattern.nameRegex) {
                    try {
                        const flags = pattern.nameCaseSensitive ? 'g' : 'gi';
                        pattern._compiledNameRegex = new RegExp(pattern.name, flags);
                    } catch (e) {
                        Logger.warn('DETECTOR', 'Failed to precompile cookie name pattern', { pattern: pattern.name, error: e.message });
                    }
                }
                if (pattern.valueRegex) {
                    try {
                        const flags = pattern.valueCaseSensitive ? 'g' : 'gi';
                        pattern._compiledValueRegex = new RegExp(pattern.value, flags);
                    } catch (e) {
                        Logger.warn('DETECTOR', 'Failed to precompile cookie value pattern', { pattern: pattern.value, error: e.message });
                    }
                }
            });
        }

        // Pre-compile header patterns
        if (detection.headers && Array.isArray(detection.headers)) {
            detection.headers.forEach(pattern => {
                if (pattern.nameRegex) {
                    try {
                        const flags = pattern.nameCaseSensitive ? 'g' : 'gi';
                        pattern._compiledNameRegex = new RegExp(pattern.name, flags);
                    } catch (e) {
                        Logger.warn('DETECTOR', 'Failed to precompile header name pattern', { pattern: pattern.name, error: e.message });
                    }
                }
                if (pattern.valueRegex) {
                    try {
                        const flags = pattern.valueCaseSensitive ? 'g' : 'gi';
                        pattern._compiledValueRegex = new RegExp(pattern.value, flags);
                    } catch (e) {
                        Logger.warn('DETECTOR', 'Failed to precompile header value pattern', { pattern: pattern.value, error: e.message });
                    }
                }
            });
        }
    }

    /**
     * Clean pre-compiled patterns from a detector
     * Prevents memory leaks when reloading detectors
     * @param {object} detectorData - Detector configuration
     */
    cleanPrecompiledPatterns(detectorData) {
        if (!detectorData.detection) return;

        const detection = detectorData.detection;

        // Remove _compiledRegex properties
        if (detection.content && Array.isArray(detection.content)) {
            detection.content.forEach(pattern => {
                delete pattern._compiledRegex;
            });
        }

        if (detection.urls && Array.isArray(detection.urls)) {
            detection.urls.forEach(pattern => {
                delete pattern._compiledRegex;
            });
        }

        if (detection.cookies && Array.isArray(detection.cookies)) {
            detection.cookies.forEach(pattern => {
                delete pattern._compiledNameRegex;
                delete pattern._compiledValueRegex;
            });
        }

        if (detection.headers && Array.isArray(detection.headers)) {
            detection.headers.forEach(pattern => {
                delete pattern._compiledNameRegex;
                delete pattern._compiledValueRegex;
            });
        }
    }

    /**
     * Load a single detector file with timeout
     * @param {string} categoryName - Category name (antibot, captcha, fingerprint)
     * @param {string} detectorName - Detector name (cloudflare, hcaptcha, etc.)
     */
    async loadDetectorFile(categoryName, detectorName) {
        const FETCH_TIMEOUT = Constants.FETCH_TIMEOUT;

        try {
            const detectorPath = `detectors/${categoryName}/${detectorName}.json`;

            // Create fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            try {
                const response = await fetch(chrome.runtime.getURL(detectorPath), {
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    Logger.warn('DETECTOR', 'Detector file not found', { path: detectorPath, status: response.status });
                    return;
                }

                const detectorData = await response.json();

                // Validate detector data structure
                const normalized = DetectorManager.normalizeDetectorSchema(detectorData, {
                    categoryName,
                    detectorName,
                    source: 'file'
                });
                if (!normalized) {
                    Logger.error('DETECTOR', 'Invalid detector data after normalization', { path: detectorPath });
                    return;
                }

                // Default enabled to true if not specified
                if (normalized.enabled === undefined) {
                    normalized.enabled = true;
                }

                // Update lastUpdated to include time if it doesn't already
                if (normalized.lastUpdated && !normalized.lastUpdated.includes(':')) {
                    // Old format (YYYY-MM-DD), add default time
                    normalized.lastUpdated = `${normalized.lastUpdated} 00:00:00`;
                }

                // Clean old patterns (reload)
                if (this.detectors[categoryName]?.[detectorName]) {
                    this.cleanPrecompiledPatterns(this.detectors[categoryName][detectorName]);
                }

                // Pre-compile all regex patterns for this detector
                this.precompileDetectorPatterns(normalized);

                this.detectors[categoryName][detectorName] = normalized;

            } catch (fetchError) {
                clearTimeout(timeoutId);

                if (fetchError.name === 'AbortError') {
                    Logger.error('DETECTOR', 'Timeout loading detector', { path: detectorPath, timeout: FETCH_TIMEOUT });
                } else {
                    throw fetchError;
                }
            }

        } catch (error) {
            Logger.error('DETECTOR', 'Failed to load detector', { category: categoryName, detector: detectorName, error: error.message });
            throw error; // Re-throw to be caught by Promise.allSettled
        }
    }


    /**
     * Save all detector data to Chrome storage as 'scrapfly_detectors'
     * Uses StorageManager for consistent save patterns
     */
    async saveDetectorsToStorage() {
        try {
            // Deep clone detectors to avoid mutating the original
            const cleanDetectors = JSON.parse(JSON.stringify(this.detectors));

            // Strip temporary _searchStrings property from all detectors before saving
            for (const category of Object.values(cleanDetectors)) {
                for (const detector of Object.values(category)) {
                    if (detector && detector._searchStrings) {
                        delete detector._searchStrings;
                    }
                }
            }

            // Use StorageManager for consistent save with metadata
            const success = await StorageManager.saveToStorage('scrapfly_detectors', {
                detectors: cleanDetectors,
                totalCount: this.getDetectorCount()
            }, {
                wrapMetadata: true,
                countProperty: null // totalCount already included in data
            });

            if (!success) {
                throw new Error('StorageManager.saveToStorage returned false');
            }
        } catch (error) {
            Logger.error('DETECTOR', 'Failed to save detectors to storage', error);
            throw error;
        }
    }


    // Load from Chrome storage; returns true if data was loaded

    async loadFromStorage() {
        try {
            const loadedData = await StorageManager.batchLoadStorage([
                {
                    primary: 'scrapfly_categories',
                    legacy: 'scrapfly_categories.json',
                    dataProperty: null
                },
                {
                    primary: 'scrapfly_detectors',
                    legacy: 'scrapfly_detectors.json',
                    dataProperty: null
                }
            ]);

            const categoriesData = loadedData['scrapfly_categories'];
            if (categoriesData) {
                const categoryCount = Object.keys(categoriesData.categories || {}).length;
                this.categoryManager.categories = categoriesData.categories;
                this.categoryManager.initialized = categoryCount > 0;
            }

            const detectorsData = loadedData['scrapfly_detectors'];

            if (detectorsData) {
                if (!detectorsData.detectors || typeof detectorsData.detectors !== 'object') {
                    Logger.error('DETECTOR', 'Invalid storage format - detectors property missing or wrong type', { detectorsData });
                    return false;
                }

                const normalizedDetectors = {};
                const seenIds = new Set();
                let needsResave = false;
                let hasCorruption = false;

                for (const [category, categoryDetectors] of Object.entries(detectorsData.detectors || {})) {
                    if (!normalizedDetectors[category]) {
                        normalizedDetectors[category] = {};
                    }

                    if (!categoryDetectors || typeof categoryDetectors !== 'object') {
                        Logger.warn('DETECTOR', '[loadFromStorage] Invalid category detector map, skipping', { category });
                        needsResave = true;
                        continue;
                    }

                    for (const [detectorKey, detector] of Object.entries(categoryDetectors)) {
                        const originalDifficulty = detector?.difficulty;
                        if (detector?.detection) {
                            for (const methodData of Object.values(detector.detection)) {
                                if (typeof methodData === 'string') {
                                    hasCorruption = true;
                                    break;
                                }
                            }
                        }
                        if (hasCorruption) break;

                        const preferredId = (typeof detectorKey === 'string' && detectorKey.startsWith(DetectorManager.DETECTOR_ID_PREFIX))
                            ? detectorKey
                            : (detector?.id || detectorKey);
                        const normalized = DetectorManager.normalizeDetectorSchema(detector, {
                            categoryName: category,
                            detectorName: preferredId,
                            source: 'storage'
                        });

                        if (!normalized) {
                            needsResave = true;
                            continue;
                        }

                        if (normalized.id !== detectorKey) {
                            needsResave = true;
                        }
                        if (normalized.difficulty !== originalDifficulty) {
                            needsResave = true;
                        }

                        if (seenIds.has(normalized.id)) {
                            Logger.debug('DETECTOR', '[loadFromStorage] Duplicate detector ID, skipping', {
                                id: normalized.id,
                                category
                            });
                            needsResave = true;
                            continue;
                        }

                        seenIds.add(normalized.id);
                        normalizedDetectors[category][normalized.id] = normalized;
                    }

                    if (hasCorruption) break;
                }

                if (hasCorruption) {
                    await this.loadDetectorsFromIndex();
                    await this.saveDetectorsToStorage();
                    return true;
                }

                this.detectors = normalizedDetectors;

                const detectorCount = this.getDetectorCount();
                if (detectorCount === 0) {
                    return false; // Force reload from JSON
                }

                if (needsResave) {
                    await this.saveDetectorsToStorage();
                }

                return true;
            }

            return false;

        } catch (error) {
            Logger.error('DETECTOR', 'Failed to load from storage', error);
            return false;
        }
    }

    /**
     * Get category information including color and detector list
     * @param {string} categoryName - Category name
     * @returns {object} Category data with colour and detectors array
     */
    getCategoryInfo(categoryName) {
        return this.categoryManager.getCategoryInfo(categoryName);
    }

    /**
     * Get a specific detector's full configuration
     * @param {string} categoryName - Category name
     * @param {string} detectorName - Detector name (ID)
     * @returns {object} Detector configuration object
     */
    getDetector(categoryName, detectorName) {
        return this.detectors[categoryName]?.[detectorName];
    }

    /**
     * Normalize category name to internal key format
     * @param {string} category - Category display name (e.g., "Anti-Bot", "CAPTCHA")
     * @returns {string} Normalized category key (e.g., "antibot", "captcha")
     */
    normalizeCategoryName(category) {
        if (!category) return '';

        const normalized = category.toLowerCase()
            .replace(/[^a-z]/g, ''); // Remove spaces, hyphens, etc.

        // Map known variations
        const categoryMap = {
            'antibot': 'antibot',
            'captcha': 'captcha',
            'fingerprint': 'fingerprint'
        };

        return categoryMap[normalized] || normalized;
    }

    /**
     * Get a detector by its display name within a category
     * @param {string} categoryName - Category name (display name or internal key)
     * @param {string} displayName - Detector display name
     * @returns {object|null} Detector configuration object or null if not found
     */
    getDetectorByName(categoryName, displayName) {
        // Normalize category name to internal key
        const normalizedCategory = this.normalizeCategoryName(categoryName);
        const categoryDetectors = this.detectors[normalizedCategory];
        if (!categoryDetectors) return null;

        for (const [id, detector] of Object.entries(categoryDetectors)) {
            if (detector.name === displayName) {
                return detector;
            }
        }
        return null;
    }

    /**
     * Find a detector by ID across all categories
     * Fallback method when category is unknown or incorrect
     * @param {string} detectorId - Detector ID to find
     * @returns {object|null} Detector configuration object or null if not found
     */
    findDetectorById(detectorId) {
        // Search all categories for the detector
        for (const [categoryName, categoryDetectors] of Object.entries(this.detectors)) {
            // Check if detector exists with this exact ID as key
            if (categoryDetectors[detectorId]) {
                return categoryDetectors[detectorId];
            }

            // Also check if any detector has this as its 'id' property
            for (const [key, detector] of Object.entries(categoryDetectors)) {
                if (detector.id === detectorId) {
                    return detector;
                }
            }
        }

        return null;
    }

    /**
     * Get all detectors organized by category
     * @returns {object} All detectors organized by category
     */
    getAllDetectors() {
        return this.detectors;
    }

    /**
     * Get total number of loaded detectors
     * @returns {number} Total count of detectors
     */
    getDetectorCount() {
        let count = 0;
        for (const category of Object.values(this.detectors)) {
            count += Object.keys(category).length;
        }
        return count;
    }

    /**
     * Add a new detector
     * @param {string} category - Detector category
     * @param {string} name - Detector name
     * @param {Object} detector - Detector configuration
     * @returns {Promise<boolean>} Success status
     */
    async addDetector(category, name, detector) {
        try {
            if (!this.detectors[category]) {
                this.detectors[category] = {};
            }

            const normalizedDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.normalizeDifficulty === 'function')
                ? DetectionUtils.normalizeDifficulty(detector?.difficulty)
                : null;
            const defaultDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.defaultDifficultyForCategory === 'function')
                ? DetectionUtils.defaultDifficultyForCategory(category || detector?.category)
                : 'Medium';
            detector.difficulty = normalizedDifficulty || defaultDifficulty;

            // Add timestamp in local time: YYYY-MM-DD HH:MM:SS
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            detector.lastUpdated = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

            this.detectors[category][name] = detector;
            await this.saveDetectorsToStorage();
            return true;
        } catch (error) {
            Logger.error('DETECTOR', 'Failed to add detector', error);
            return false;
        }
    }

    /**
     * Get the CategoryManager instance
     * @returns {CategoryManager} The category manager instance
     */
    getCategoryManager() {
        return this.categoryManager;
    }
}

if (typeof window !== 'undefined') {
  window.DetectorManager = DetectorManager;
}
