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
        if (this.initialized) return;

        try {
            // Initialize CategoryManager if not already done
            if (!this.categoryManager.initialized) {
                await this.categoryManager.initialize();
            }

            // First, try to load from storage
            const storageLoaded = await this.loadFromStorage();

            // Only load from JSON files if storage is empty
            if (!storageLoaded || Object.keys(this.detectors).length === 0) {
                console.log('No detectors in storage, loading from JSON files...');
                await this.loadDetectorsFromIndex();
                await this.saveDetectorsToStorage();
            } else {
                console.log('Loaded detectors from storage, preserving custom settings');
            }

            this.initialized = true;
            console.log('DetectorManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize DetectorManager:', error);
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

        for (const [categoryName, categoryData] of Object.entries(categories)) {
            console.log(`Loading detectors for category: ${categoryName}`);

            // Skip entries that don't have a detectors array (like "tags")
            if (!categoryData.detectors || !Array.isArray(categoryData.detectors)) {
                console.log(`Skipping ${categoryName} - not a detector category`);
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

        await Promise.all(loadPromises);
        console.log('Finished loading all detectors');
        console.log('Total detectors loaded:', this.getDetectorCount());
        console.log('Detectors by category:', Object.keys(this.detectors).map(cat => `${cat}: ${Object.keys(this.detectors[cat]).length}`));
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
                if (pattern.nameRegex || pattern.regex) {
                    try {
                        const flags = pattern.nameCaseSensitive || pattern.caseSensitive ? 'g' : 'gi';
                        pattern._compiledRegex = new RegExp(pattern.content, flags);
                    } catch (e) {
                        console.warn(`Failed to precompile content pattern: ${pattern.content}`, e);
                    }
                } else if (pattern.nameWholeWord || pattern.wholeWord) {
                    try {
                        const escapedPattern = pattern.content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const flags = pattern.nameCaseSensitive || pattern.caseSensitive ? 'g' : 'gi';
                        pattern._compiledRegex = new RegExp(`\\b${escapedPattern}\\b`, flags);
                    } catch (e) {
                        console.warn(`Failed to precompile word boundary pattern: ${pattern.content}`, e);
                    }
                }
            });
        }

        // Pre-compile URL patterns
        if (detection.urls && Array.isArray(detection.urls)) {
            detection.urls.forEach(pattern => {
                if (pattern.nameRegex || pattern.regex) {
                    try {
                        const flags = pattern.nameCaseSensitive || pattern.caseSensitive ? 'g' : 'gi';
                        pattern._compiledRegex = new RegExp(pattern.pattern, flags);
                    } catch (e) {
                        console.warn(`Failed to precompile URL pattern: ${pattern.pattern}`, e);
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
                        console.warn(`Failed to precompile cookie name pattern: ${pattern.name}`, e);
                    }
                }
                if (pattern.valueRegex) {
                    try {
                        const flags = pattern.valueCaseSensitive ? 'g' : 'gi';
                        pattern._compiledValueRegex = new RegExp(pattern.value, flags);
                    } catch (e) {
                        console.warn(`Failed to precompile cookie value pattern: ${pattern.value}`, e);
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
                        console.warn(`Failed to precompile header name pattern: ${pattern.name}`, e);
                    }
                }
                if (pattern.valueRegex) {
                    try {
                        const flags = pattern.valueCaseSensitive ? 'g' : 'gi';
                        pattern._compiledValueRegex = new RegExp(pattern.value, flags);
                    } catch (e) {
                        console.warn(`Failed to precompile header value pattern: ${pattern.value}`, e);
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
     * Load a single detector file
     * @param {string} categoryName - Category name (antibot, captcha, fingerprint)
     * @param {string} detectorName - Detector name (cloudflare, hcaptcha, etc.)
     */
    async loadDetectorFile(categoryName, detectorName) {
        try {
            const detectorPath = `detectors/${categoryName}/${detectorName}.json`;
            console.log(`Loading detector: ${detectorPath}`);

            const response = await fetch(chrome.runtime.getURL(detectorPath));

            if (!response.ok) {
                console.warn(`Detector file not found: ${detectorPath} (${response.status})`);
                return;
            }

            const detectorData = await response.json();
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

            // Log JS Hooks if present
            if (detectorData.detection?.javascript_hooks) {
                console.log(`✅ [JS HOOKS] ${categoryName}/${detectorName} has ${detectorData.detection.javascript_hooks.length} JS hooks:`,
                    detectorData.detection.javascript_hooks.map(h => `${h.target} (enabled: ${h.enabled})`));
            }

            console.log(`Successfully loaded detector: ${categoryName}/${detectorName}`);

        } catch (error) {
            console.error(`Failed to load detector ${categoryName}/${detectorName}:`, error);
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

            if (success) {
                console.log(`Saved ${this.getDetectorCount()} detectors to storage as scrapfly_detectors`);
            } else {
                throw new Error('StorageManager.saveToStorage returned false');
            }
        } catch (error) {
            console.error('Failed to save detectors to storage:', error);
            throw error;
        }
    }


    /**
     * Fix corrupted detection data that was saved as strings instead of arrays
     * @param {object} detection - Detection object to fix
     * @returns {object} Fixed detection object with proper array structure
     */
    fixCorruptedDetectionData(detection) {
        if (!detection) return {};

        const fixed = {};
        for (const [methodType, data] of Object.entries(detection)) {
            if (Array.isArray(data)) {
                // Data is already an array, keep it as is
                fixed[methodType] = data;
            } else if (typeof data === 'string' && data.trim()) {
                // Data is corrupted (string instead of array), need to reload from JSON
                console.warn(`Detection method ${methodType} is corrupted (string instead of array)`);
                fixed[methodType] = [];
            } else {
                // Empty or invalid data
                fixed[methodType] = [];
            }
        }

        return fixed;
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
                    dataProperty: null // Load full wrapper (timestamp + categories)
                },
                {
                    primary: 'scrapfly_detectors',
                    legacy: 'scrapfly_detectors.json',
                    dataProperty: null // Load full wrapper (timestamp + detectors)
                }
            ]);

            // Process categories first (DetectorManager needs CategoryManager initialized)
            const categoriesData = loadedData['scrapfly_categories'];
            if (categoriesData) {
                this.categoryManager.categories = categoriesData.categories;
                this.categoryManager.initialized = Object.keys(categoriesData.categories || {}).length > 0;
                console.log('[StorageManager] Categories loaded from batched data');
            }

            // Process detectors
            const detectorsData = loadedData['scrapfly_detectors'];
            if (detectorsData) {
                this.detectors = detectorsData.detectors || {};

                // Check for corrupted data
                let hasCorruption = false;
                for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
                    for (const [detectorName, detector] of Object.entries(categoryDetectors)) {
                        if (detector.detection) {
                            // Check if any detection method is a string (corrupted)
                            for (const [methodType, methodData] of Object.entries(detector.detection)) {
                                if (typeof methodData === 'string') {
                                    hasCorruption = true;
                                    console.warn(`Corrupted detection data found for ${detectorName}.${methodType}`);
                                    break;
                                }
                            }
                        }
                    }
                }

                // If corrupted, reload from JSON files
                if (hasCorruption) {
                    console.log('Corrupted detection data found, reloading from JSON files...');
                    await this.loadDetectorsFromIndex();
                    await this.saveDetectorsToStorage();
                    return true;
                }

                console.log('Loaded detectors from storage with custom settings');
                return true;
            }

            return false;

        } catch (error) {
            console.error('Failed to load from storage:', error);
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
        console.log(`[DetectorManager.getDetector] Looking for: category="${categoryName}", name="${detectorName}"`);
        const detector = this.detectors[categoryName]?.[detectorName];
        if (detector) {
            console.log(`[DetectorManager.getDetector] Found detector: ${detector.name}`);
        } else {
            console.log(`[DetectorManager.getDetector] Not found. Available in category "${categoryName}":`,
                this.detectors[categoryName] ? Object.keys(this.detectors[categoryName]) : 'Category not found');
        }
        return detector;
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
        console.log(`[DetectorManager] Searching for detector with ID: "${detectorId}"`);

        // Log what categories we're searching
        const categories = Object.keys(this.detectors);
        console.log(`[DetectorManager] Searching in categories:`, categories);

        // Search all categories for the detector
        for (const [categoryName, categoryDetectors] of Object.entries(this.detectors)) {
            // Log what detectors are in this category
            const detectorKeys = Object.keys(categoryDetectors);
            console.log(`[DetectorManager] Category "${categoryName}" has detectors:`, detectorKeys);

            // Check if detector exists with this exact ID as key
            if (categoryDetectors[detectorId]) {
                console.log(`[DetectorManager] Found detector by key match in category "${categoryName}"`);
                return categoryDetectors[detectorId];
            }

            // Also check if any detector has this as its 'id' property
            for (const [key, detector] of Object.entries(categoryDetectors)) {
                if (detector.id === detectorId) {
                    console.log(`[DetectorManager] Found detector by ID property match in category "${categoryName}" with key "${key}"`);
                    return detector;
                }
            }
        }

        console.warn(`[DetectorManager] Detector with ID '${detectorId}' not found in any category`);
        console.warn(`[DetectorManager] Available detectors by category:`,
            Object.entries(this.detectors).map(([cat, dets]) =>
                `${cat}: ${Object.keys(dets).join(', ')}`
            )
        );
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
            // Remove both old and new keys
            await StorageManager.clearStorage(['scrapfly_detectors', 'scrapfly_detectors.json']);
            await this.categoryManager.clearStorage();
            console.log('Cleared detector storage');
        } catch (error) {
            console.error('Failed to clear storage:', error);
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

            console.log('Detectors imported successfully');
            return true;
        } catch (error) {
            console.error('Failed to import detectors:', error);
            return false;
        }
    }

    /**
     * Reload detectors from JSON files (fixes corrupted data)
     * @returns {Promise<boolean>} Success status
     */
    async reloadFromJSON() {
        try {
            console.log('Reloading all detectors from JSON files...');
            this.detectors = {};
            await this.loadDetectorsFromIndex();
            await this.saveDetectorsToStorage();
            console.log('Detectors reloaded from JSON files successfully');
            return true;
        } catch (error) {
            console.error('Failed to reload from JSON:', error);
            return false;
        }
    }

    /**
     * Clear all custom detectors (keep defaults)
     * @returns {Promise<boolean>} Success status
     */
    async clearCustomDetectors() {
        try {
            // Reload default detectors from JSON files
            await this.loadDetectorsFromIndex();
            await this.saveDetectorsToStorage();

            console.log('Custom detectors cleared, defaults restored');
            return true;
        } catch (error) {
            console.error('Failed to clear custom detectors:', error);
            return false;
        }
    }

    /**
     * Clear ALL detectors - removes everything
     * @returns {Promise<boolean>} Success status
     */
    async clearAllDetectors() {
        try {
            // Clear all detector data
            this.detectors = {};

            // Clear categories as well
            for (const category of Object.keys(this.categories)) {
                this.detectors[category] = {};
            }

            // Save empty state to storage
            await this.saveDetectorsToStorage();

            console.log('All detectors cleared');
            return true;
        } catch (error) {
            console.error('Failed to clear all detectors:', error);
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

            console.log(`Detector ${name} added to ${category}`);
            return true;
        } catch (error) {
            console.error('Failed to add detector:', error);
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