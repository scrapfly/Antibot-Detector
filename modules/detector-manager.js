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
            console.log('[DetectorManager] Already initialized, skipping');
            return;
        }

        console.log('[DetectorManager] 🚀 Starting initialization...');
        const initStartTime = Date.now();

        try {
            // Initialize CategoryManager if not already done
            console.log('[DetectorManager] Step 1: Initializing CategoryManager...');
            if (!this.categoryManager.initialized) {
                await this.categoryManager.initialize();
                console.log(`[DetectorManager] ✅ CategoryManager initialized with ${Object.keys(this.categoryManager.categories || {}).length} categories`);
            } else {
                console.log(`[DetectorManager] ✅ CategoryManager already initialized`);
            }

            // First, try to load from storage
            console.log('[DetectorManager] Step 2: Attempting to load from storage...');
            const storageLoadStart = Date.now();
            const storageLoaded = await this.loadFromStorage();
            const storageLoadTime = Date.now() - storageLoadStart;

            console.log(`[DetectorManager] Storage load result: ${storageLoaded} (took ${storageLoadTime}ms)`);
            console.log(`[DetectorManager] Current detector count: ${this.getDetectorCount()}`);

            // Only load from JSON files if storage is empty
            // BUGFIX: Check actual detector count, not category count
            if (!storageLoaded || this.getDetectorCount() === 0) {
                console.warn('[DetectorManager] ⚠️ No detectors in storage, loading from JSON files...');
                console.log('[DetectorManager] Step 3: Loading detectors from JSON index...');

                const jsonLoadStart = Date.now();
                await this.loadDetectorsFromIndex();
                const jsonLoadTime = Date.now() - jsonLoadStart;

                console.log(`[DetectorManager] ✅ JSON load complete (took ${jsonLoadTime}ms)`);
                console.log(`[DetectorManager] Loaded ${this.getDetectorCount()} detectors total`);

                console.log('[DetectorManager] Step 4: Saving to storage...');
                const saveStart = Date.now();
                await this.saveDetectorsToStorage();
                const saveTime = Date.now() - saveStart;
                console.log(`[DetectorManager] ✅ Save complete (took ${saveTime}ms)`);
            } else {
                console.log('[DetectorManager] ✅ Loaded detectors from storage, preserving custom settings');
                console.log(`[DetectorManager] 📊 Categories: ${Object.keys(this.detectors).join(', ')}`);
                console.log(`[DetectorManager] 📊 Detectors per category:`,
                    Object.entries(this.detectors).map(([cat, dets]) =>
                        `${cat}=${Object.keys(dets).length}`
                    ).join(', ')
                );
            }

            this.initialized = true;
            const totalTime = Date.now() - initStartTime;
            console.log(`[DetectorManager] ✅✅✅ Initialization COMPLETE in ${totalTime}ms with ${this.getDetectorCount()} detectors`);
        } catch (error) {
            const totalTime = Date.now() - initStartTime;
            console.error(`[DetectorManager] ❌❌❌ Failed to initialize after ${totalTime}ms:`, error);
            console.error('[DetectorManager] ❌ Error stack:', error.stack);
            console.error('[DetectorManager] ❌ Current state:', {
                initialized: this.initialized,
                detectorCount: this.getDetectorCount(),
                categories: Object.keys(this.detectors)
            });
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

        // DIAGNOSTIC: Check what categories were loaded
        console.log('[DetectorManager] ========== LOAD DETECTORS FROM INDEX ==========');
        console.log('[DetectorManager] 🔍 Categories object:', JSON.stringify(Object.keys(categories)));
        console.log('[DetectorManager] 🔍 Total categories:', Object.keys(categories).length);

        let totalDetectorsToLoad = 0;
        let loadedDetectorsCount = 0;

        // Count total detectors to load for progress tracking
        for (const [categoryName, categoryData] of Object.entries(categories)) {
            console.log(`[DetectorManager] 🔍 Examining category "${categoryName}":`, typeof categoryData);

            if (categoryData.detectors && Array.isArray(categoryData.detectors)) {
                console.log(`[DetectorManager] 🔍   - Has ${categoryData.detectors.length} detectors: [${categoryData.detectors.join(', ')}]`);
                totalDetectorsToLoad += categoryData.detectors.length;
            } else {
                console.log(`[DetectorManager] 🔍   - No detectors array (type: ${typeof categoryData}, keys: ${Object.keys(categoryData).join(', ')})`);
            }
        }

        console.log(`[DetectorManager] Starting to load ${totalDetectorsToLoad} detector files...`);

        for (const [categoryName, categoryData] of Object.entries(categories)) {
            console.log(`[DetectorManager] Category: ${categoryName}`);

            // Skip entries that don't have a detectors array (like "tags")
            if (!categoryData.detectors || !Array.isArray(categoryData.detectors)) {
                console.log(`[DetectorManager] Skipping ${categoryName} - not a detector category`);
                continue;
            }

            if (!this.detectors[categoryName]) {
                this.detectors[categoryName] = {};
            }

            for (const detectorName of categoryData.detectors) {
                const promise = this.loadDetectorFile(categoryName, detectorName)
                    .then(() => {
                        loadedDetectorsCount++;
                        // Show progress every 5 detectors
                        if (loadedDetectorsCount % 5 === 0 || loadedDetectorsCount === totalDetectorsToLoad) {
                            const progress = Math.round((loadedDetectorsCount / totalDetectorsToLoad) * 100);
                            console.log(`[DetectorManager] ⏳ Progress: ${progress}% (${loadedDetectorsCount}/${totalDetectorsToLoad} files loaded)`);
                        }
                    })
                    .catch((error) => {
                        console.error(`[DetectorManager] ❌ Failed to load ${categoryName}/${detectorName}:`, error.message);
                    });
                loadPromises.push(promise);
            }
        }

        console.log(`[DetectorManager] Waiting for ${loadPromises.length} detector files to load...`);
        const results = await Promise.allSettled(loadPromises);

        // DIAGNOSTIC: Check load results
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        console.log(`[DetectorManager] 🔍 Load results: ${successful} successful, ${failed} failed`);

        if (failed > 0) {
            const failedResults = results.filter(r => r.status === 'rejected');
            failedResults.forEach((result, idx) => {
                console.error(`[DetectorManager] ❌ Failed detector ${idx + 1}:`, result.reason);
            });
        }

        const finalCount = this.getDetectorCount();
        console.log(`[DetectorManager] ✅ Finished loading: ${finalCount}/${totalDetectorsToLoad} detectors loaded`);
        console.log('[DetectorManager] 📊 Detectors by category:',
            Object.keys(this.detectors).map(cat => `${cat}: ${Object.keys(this.detectors[cat]).length}`).join(', ')
        );

        // DIAGNOSTIC: Show what's actually in this.detectors
        console.log('[DetectorManager] 🔍 Final state - detector keys:', Object.keys(this.detectors));
        for (const [cat, dets] of Object.entries(this.detectors)) {
            console.log(`[DetectorManager] 🔍   - ${cat}: ${Object.keys(dets).length} detectors (${Object.keys(dets).join(', ')})`);
        }

        // Validation: Ensure at least some detectors loaded
        if (finalCount === 0) {
            console.error('[DetectorManager] ❌ CRITICAL: finalCount is 0 after loading!');
            console.error('[DetectorManager] ❌ this.detectors:', JSON.stringify(this.detectors, null, 2));
            throw new Error('No detectors were loaded - all JSON files may be missing or corrupt');
        }

        if (finalCount < totalDetectorsToLoad * 0.5) {
            console.warn(`[DetectorManager] ⚠️ Only ${finalCount}/${totalDetectorsToLoad} detectors loaded - some files may be missing`);
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
                    console.warn(`[DetectorManager] Detector file not found: ${detectorPath} (${response.status})`);
                    return;
                }

                const detectorData = await response.json();

                // Validate detector data structure
                if (!detectorData.id || !detectorData.name) {
                    console.error(`[DetectorManager] Invalid detector data in ${detectorPath}: missing id or name`);
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

                // Log JS Hooks if present (reduced verbosity)
                if (detectorData.detection?.javascript_hooks) {
                    const hookCount = detectorData.detection.javascript_hooks.length;
                    console.log(`[DetectorManager] ✅ ${categoryName}/${detectorName} loaded with ${hookCount} JS hooks`);
                }

            } catch (fetchError) {
                clearTimeout(timeoutId);

                if (fetchError.name === 'AbortError') {
                    console.error(`[DetectorManager] ⏱️ Timeout loading ${detectorPath} (exceeded ${FETCH_TIMEOUT}ms)`);
                } else {
                    throw fetchError;
                }
            }

        } catch (error) {
            console.error(`[DetectorManager] ❌ Failed to load detector ${categoryName}/${detectorName}:`, error.message);
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
            console.log('[DetectorManager] 🔍 DIAGNOSTIC: Starting loadFromStorage()...');

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

            console.log('[DetectorManager] 🔍 DIAGNOSTIC: Loaded data keys:', Object.keys(loadedData));

            // Process categories first (DetectorManager needs CategoryManager initialized)
            const categoriesData = loadedData['scrapfly_categories'];
            if (categoriesData) {
                const categoryCount = Object.keys(categoriesData.categories || {}).length;
                console.log('[DetectorManager] 🔍 DIAGNOSTIC: Categories data structure:', {
                    hasCategories: !!categoriesData.categories,
                    categoryCount: categoryCount,
                    categoryNames: Object.keys(categoriesData.categories || {})
                });
                this.categoryManager.categories = categoriesData.categories;
                this.categoryManager.initialized = categoryCount > 0;
                console.log('[StorageManager] Categories loaded from batched data');
            } else {
                console.warn('[DetectorManager] ⚠️ DIAGNOSTIC: No categories data found in storage');
            }

            // Process detectors
            const detectorsData = loadedData['scrapfly_detectors'];
            console.log('[DetectorManager] 🔍 DIAGNOSTIC: Detectors data exists:', !!detectorsData);

            if (detectorsData) {
                // Log the raw storage data structure
                console.log('[DetectorManager] 🔍 DIAGNOSTIC: Raw detectorsData structure:', {
                    hasDetectorsProperty: !!detectorsData.detectors,
                    detectorsDataType: typeof detectorsData.detectors,
                    detectorsDataKeys: detectorsData.detectors ? Object.keys(detectorsData.detectors) : [],
                    hasTimestamp: !!detectorsData.timestamp,
                    timestamp: detectorsData.timestamp
                });

                // Validate storage data structure
                if (!detectorsData.detectors || typeof detectorsData.detectors !== 'object') {
                    console.error('[DetectorManager] ❌ DIAGNOSTIC: Invalid storage format - detectors property is missing or wrong type');
                    console.error('[DetectorManager] ❌ DIAGNOSTIC: detectorsData:', detectorsData);
                    return false;
                }

                this.detectors = detectorsData.detectors || {};

                // Log what was assigned
                console.log('[DetectorManager] 🔍 DIAGNOSTIC: After assignment, this.detectors:', {
                    type: typeof this.detectors,
                    categories: Object.keys(this.detectors),
                    isObject: this.detectors && typeof this.detectors === 'object'
                });

                // Log detector count per category
                for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
                    const detectorNames = Object.keys(categoryDetectors || {});
                    console.log(`[DetectorManager] 🔍 DIAGNOSTIC: Category "${category}": ${detectorNames.length} detectors [${detectorNames.slice(0, 3).join(', ')}${detectorNames.length > 3 ? '...' : ''}]`);
                }

                // BUGFIX: Validate that detectors actually loaded (not just empty object)
                const detectorCount = this.getDetectorCount();
                console.log('[DetectorManager] 🔍 DIAGNOSTIC: Total detector count via getDetectorCount():', detectorCount);

                if (detectorCount === 0) {
                    console.warn('[DetectorManager] ⚠️ DIAGNOSTIC: Storage has scrapfly_detectors but detector count is 0 - treating as empty');
                    console.warn('[DetectorManager] ⚠️ DIAGNOSTIC: this.detectors contents:', JSON.stringify(this.detectors, null, 2));
                    return false; // Force reload from JSON
                }

                // Check for corrupted data
                console.log('[DetectorManager] 🔍 DIAGNOSTIC: Checking for data corruption...');
                let hasCorruption = false;
                let corruptedDetectors = [];

                for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
                    for (const [detectorName, detector] of Object.entries(categoryDetectors)) {
                        if (detector.detection) {
                            // Check if any detection method is a string (corrupted)
                            for (const [methodType, methodData] of Object.entries(detector.detection)) {
                                if (typeof methodData === 'string') {
                                    hasCorruption = true;
                                    corruptedDetectors.push(`${detectorName}.${methodType}`);
                                    console.warn(`[DetectorManager] ⚠️ DIAGNOSTIC: Corrupted detection data found for ${detectorName}.${methodType}`);
                                    break;
                                }
                            }
                        }
                    }
                }

                console.log('[DetectorManager] 🔍 DIAGNOSTIC: Corruption check complete:', {
                    hasCorruption,
                    corruptedCount: corruptedDetectors.length,
                    corruptedDetectors: corruptedDetectors.slice(0, 5) // Show first 5
                });

                // If corrupted, reload from JSON files
                if (hasCorruption) {
                    console.log('[DetectorManager] ⚠️ DIAGNOSTIC: Corrupted detection data found, reloading from JSON files...');
                    await this.loadDetectorsFromIndex();
                    await this.saveDetectorsToStorage();
                    console.log('[DetectorManager] ✅ DIAGNOSTIC: Reloaded from JSON and saved to storage');
                    return true;
                }

                console.log(`[DetectorManager] ✅ DIAGNOSTIC: Successfully loaded ${detectorCount} detectors from storage with custom settings`);
                return true;
            }

            console.warn('[DetectorManager] ⚠️ DIAGNOSTIC: No detectors data found in storage');
            return false;

        } catch (error) {
            console.error('[DetectorManager] ❌ DIAGNOSTIC: Failed to load from storage:', error);
            console.error('[DetectorManager] ❌ DIAGNOSTIC: Error stack:', error.stack);
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