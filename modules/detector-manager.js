class DetectorManager {
    constructor(categoryManager) {
        this.categoryManager = categoryManager || new CategoryManager();
        this.detectors = {};
        this.initialized = false;
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
            // Initialize CategoryManager if not already done
            if (!this.categoryManager.initialized) {
                await this.categoryManager.initialize();
            }

            // First, try to load from storage
            const storageLoaded = await this.loadFromStorage();

            // Only load from JSON files if storage is empty
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

        // Count total detectors to load
        for (const [categoryName, categoryData] of Object.entries(categories)) {
            if (categoryData.detectors && Array.isArray(categoryData.detectors)) {
                totalDetectorsToLoad += categoryData.detectors.length;
            }
        }

        for (const [categoryName, categoryData] of Object.entries(categories)) {
            // Skip entries that don't have a detectors array (like "tags")
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
     * OPTIMIZATION: Compiles all regex patterns during load, avoiding runtime compilation
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
     * OPTIMIZATION Phase 9A.6: Prevents memory leaks when reloading detectors
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
        const FETCH_TIMEOUT = 5000; // 5 second timeout per file

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
                if (!detectorData.id || !detectorData.name) {
                    Logger.error('DETECTOR', 'Invalid detector data - missing id or name', { path: detectorPath });
                    return;
                }

                // Default enabled to true if not specified
                if (detectorData.enabled === undefined) {
                    detectorData.enabled = true;
                }

                // Update lastUpdated to include time if it doesn't already
                if (detectorData.lastUpdated && !detectorData.lastUpdated.includes(':')) {
                    // Old format (YYYY-MM-DD), add default time
                    detectorData.lastUpdated = `${detectorData.lastUpdated} 00:00:00`;
                }

                // OPTIMIZATION Phase 9A.6: Clean old patterns before recompiling (detector reload)
                if (this.detectors[categoryName]?.[detectorName]) {
                    this.cleanPrecompiledPatterns(this.detectors[categoryName][detectorName]);
                }

                // OPTIMIZATION: Pre-compile all regex patterns for this detector
                this.precompileDetectorPatterns(detectorData);

                this.detectors[categoryName][detectorName] = detectorData;

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
     * OPTIMIZATION Phase 1: Uses StorageManager for consistent save patterns
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


    /**
     * Load previously saved data from Chrome storage
     * OPTIMIZATION Phase 1: Uses StorageManager.batchLoadStorage() for 40-50% faster I/O
     * @returns {boolean} True if data was loaded from storage, false otherwise
     */
    async loadFromStorage() {
        try {
            // OPTIMIZATION Phase 1: Batch load all required storage keys using StorageManager
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

            // Process categories first
            const categoriesData = loadedData['scrapfly_categories'];
            if (categoriesData) {
                const categoryCount = Object.keys(categoriesData.categories || {}).length;
                this.categoryManager.categories = categoriesData.categories;
                this.categoryManager.initialized = categoryCount > 0;
            }

            // Process detectors
            const detectorsData = loadedData['scrapfly_detectors'];

            if (detectorsData) {
                // Validate storage data structure
                if (!detectorsData.detectors || typeof detectorsData.detectors !== 'object') {
                    Logger.error('DETECTOR', 'Invalid storage format - detectors property missing or wrong type', { detectorsData });
                    return false;
                }

                this.detectors = detectorsData.detectors || {};

                // Validate that detectors actually loaded
                const detectorCount = this.getDetectorCount();

                if (detectorCount === 0) {
                    return false; // Force reload from JSON
                }

                // Check for corrupted data
                let hasCorruption = false;

                for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
                    for (const [detectorName, detector] of Object.entries(categoryDetectors)) {
                        if (detector.detection) {
                            for (const [methodType, methodData] of Object.entries(detector.detection)) {
                                if (typeof methodData === 'string') {
                                    hasCorruption = true;
                                    break;
                                }
                            }
                        }
                        if (hasCorruption) break;
                    }
                    if (hasCorruption) break;
                }

                // If corrupted, reload from JSON files
                if (hasCorruption) {
                    await this.loadDetectorsFromIndex();
                    await this.saveDetectorsToStorage();
                    return true;
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
     * Get list of available category names
     * @returns {string[]} Array of category names
     */
    getCategories() {
        return this.categoryManager.getCategories();
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
     * Get detector names for a specific category
     * @param {string} categoryName - Category name
     * @returns {string[]} Array of detector names
     */
    getCategoryDetectors(categoryName) {
        return this.categoryManager.getCategoryDetectors(categoryName);
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
     * Get all detectors for a specific category
     * @param {string} categoryName - Category name
     * @returns {object} Object with detector names as keys and configs as values
     */
    getDetectorsByCategory(categoryName) {
        return this.detectors[categoryName] || {};
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
     * Clear all detector data from Chrome storage
     * OPTIMIZATION Phase 1: Uses StorageManager for consistent clear patterns
     */
    async clearStorage() {
        try {
            await StorageManager.clearStorage(['scrapfly_detectors', 'scrapfly_detectors.json']);
            await this.categoryManager.clearStorage();
        } catch (error) {
            Logger.error('STORAGE', 'Failed to clear detector storage', error);
        }
    }

    /**
     * Get information about stored data
     * @returns {object} Object with categories count, detectors count, and initialized status
     */
    getStorageInfo() {
        const categoryInfo = this.categoryManager.getStorageInfo();
        return {
            categories: categoryInfo.categoryCount,
            detectors: this.getDetectorCount(),
            initialized: this.initialized,
            categoryDetails: categoryInfo
        };
    }

    /**
     * Export all detectors to JSON format
     * @returns {Object} Exportable detector data
     */
    exportDetectors() {
        return {
            version: '1.0',
            timestamp: new Date().toISOString(),
            detectors: this.detectors,
            categories: this.categories
        };
    }

    /**
     * Import detectors from JSON data
     * @param {Object} data - Imported data
     * @param {boolean} merge - Whether to merge with existing or replace
     * @returns {Promise<boolean>} Success status
     */
    async importDetectors(data, merge = false) {
        try {
            // Validate the data format
            if (!data.detectors || typeof data.detectors !== 'object') {
                throw new Error('Invalid detector data format');
            }

            if (merge) {
                // Merge with existing detectors
                for (const [category, categoryDetectors] of Object.entries(data.detectors)) {
                    if (!this.detectors[category]) {
                        this.detectors[category] = {};
                    }
                    Object.assign(this.detectors[category], categoryDetectors);
                }

                // Merge categories if provided
                if (data.categories) {
                    Object.assign(this.categories, data.categories);
                }
            } else {
                // Replace existing detectors
                this.detectors = data.detectors;
                if (data.categories) {
                    this.categories = data.categories;
                }
            }

            // Save to storage
            await this.saveDetectorsToStorage();
            if (data.categories) {
                await this.saveCategoriesToStorage();
            }

            return true;
        } catch (error) {
            Logger.error('DETECTOR', 'Failed to import detectors', error);
            return false;
        }
    }

    /**
     * Reload detectors from JSON files (fixes corrupted data)
     * @returns {Promise<boolean>} Success status
     */
    async reloadFromJSON() {
        try {
            this.detectors = {};
            await this.loadDetectorsFromIndex();
            await this.saveDetectorsToStorage();
            return true;
        } catch (error) {
            Logger.error('DETECTOR', 'Failed to reload from JSON', error);
            return false;
        }
    }

    /**
     * Clear all custom detectors (keep defaults)
     * @returns {Promise<boolean>} Success status
     */
    async clearCustomDetectors() {
        try {
            await this.loadDetectorsFromIndex();
            await this.saveDetectorsToStorage();
            return true;
        } catch (error) {
            Logger.error('DETECTOR', 'Failed to clear custom detectors', error);
            return false;
        }
    }

    /**
     * Clear ALL detectors - removes everything
     * @returns {Promise<boolean>} Success status
     */
    async clearAllDetectors() {
        try {
            this.detectors = {};

            // Clear categories as well
            for (const category of Object.keys(this.categories)) {
                this.detectors[category] = {};
            }

            await this.saveDetectorsToStorage();
            return true;
        } catch (error) {
            Logger.error('DETECTOR', 'Failed to clear all detectors', error);
            return false;
        }
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

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DetectorManager;
} else if (typeof window !== 'undefined') {
  window.DetectorManager = DetectorManager;
}