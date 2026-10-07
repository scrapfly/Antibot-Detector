class DetectorManager {
    static DETECTOR_ID_PREFIX = 'detect-';
    // Official detector IDs the user deleted; Update skips them until restored
    static DELETED_OFFICIAL_KEY = 'scrapfly_deleted_official_detectors';
    // Official detector IDs installed by Rules → Update that this build does not bundle
    static REMOTE_OFFICIAL_KEY = 'scrapfly_remote_official_ids';
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

    // Fields that describe the user's relationship to a detector rather than the
    // detector itself; never part of an official snapshot. `difficultyChosen`:
    // the user picked this difficulty, so updates keep it (UpdateManager)
    static USER_EDIT_FIELDS = ['userModified', 'officialSnapshot', 'dismissedVersion', 'difficultyChosen', 'displayName', '_searchStrings'];

    /**
     * Save a difficulty from the rule editor. One the user changes is theirs
     * and detector updates keep it; one left as it was keeps following
     * Scrapfly's rating.
     * @param {object} detector - The detector being saved
     * @param {object|null} original - The detector as the editor opened it (null for a new one)
     * @param {string} difficulty - The difficulty to save
     * @returns {object} detector
     */
    static applyDifficultyChoice(detector, original, difficulty) {
        if (!detector) return detector;
        if (original && original.difficulty !== undefined && difficulty !== original.difficulty) {
            detector.difficultyChosen = true;
        }
        detector.difficulty = difficulty;
        return detector;
    }

    /**
     * A clean deep copy of a detector, without editor/UI-only fields.
     * @param {object} detector
     * @returns {object}
     */
    static cleanDetectorCopy(detector) {
        const copy = JSON.parse(JSON.stringify(detector || {}));
        for (const field of DetectorManager.USER_EDIT_FIELDS) delete copy[field];
        return copy;
    }

    /**
     * Record that the user edited an official detector. The version stays the
     * official one (so updates keep comparing against what Scrapfly shipped)
     * and the first official copy is kept for "Reset to official".
     * @param {object} edited - The detector about to be saved
     * @param {object} original - The detector as it was before this edit
     */
    static markUserEdited(edited, original) {
        if (!edited || !original) return edited;
        edited.officialSnapshot = original.userModified && original.officialSnapshot
            ? original.officialSnapshot
            : DetectorManager.cleanDetectorCopy(original);
        edited.version = edited.officialSnapshot.version || original.version;
        edited.userModified = true;
        return edited;
    }

    /**
     * The official copy of an edited detector, keeping the user's on/off and
     * difficulty choices. Null when there is nothing to restore.
     * @param {object} detector
     * @returns {object|null}
     */
    static officialVersionOf(detector) {
        if (!detector?.userModified || !detector.officialSnapshot) return null;
        const restored = DetectorManager.cleanDetectorCopy(detector.officialSnapshot);
        if (typeof detector.enabled === 'boolean') restored.enabled = detector.enabled;
        if (detector.difficulty !== undefined) restored.difficulty = detector.difficulty;
        if (detector.difficultyChosen) restored.difficultyChosen = true;
        return restored;
    }

    /**
     * Next version of a custom detector after an edit: a semver patch bump
     * ("1.0" -> "1.0.1", "1.2.9" -> "1.2.10"). Never goes backwards.
     * @param {string} version
     * @returns {string}
     */
    static bumpVersion(version) {
        const parts = String(version || '1.0.0').split('.').map(n => parseInt(n, 10) || 0);
        while (parts.length < 3) parts.push(0);
        parts[parts.length - 1] += 1;
        return parts.join('.');
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

            // Shape Security: the dynamic header patterns shipped unanchored in
            // v2.1 (x-[a-z0-9]{8}-c …), so any header whose name merely
            // contained such a substring matched — x-datadome-cid matched
            // x-[a-z0-9]{8}-c and showed up as a Shape detection at 95%
            // (GitHub issue #4). Packaged files are anchored since v2.2, but
            // detectors persist in storage across updates, so stored copies
            // still carry the loose patterns. Anchor them.
            if (detectorData.id === 'detect-shapesecurity') {
                // The literal v2.1 pattern text: x-[a-z0-9]{8}-<one letter>
                const legacyDynamic = /^x-\[a-z0-9\]\{8\}-[a-z]$/;

                let changed = false;
                if (Array.isArray(detection.header)) {
                    for (const rule of detection.header) {
                        if (!rule || typeof rule.name !== 'string') continue;
                        const name = rule.name.trim();
                        if (legacyDynamic.test(name)) {
                            rule.name = `^${name}$`;
                            changed = true;
                        }
                    }
                }

                if (changed) {
                    Logger.debug('DETECTOR', `[normalizeDetectorSchema] Anchored legacy Shape header patterns (${source})`);
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

            await this.loadOfficialDetectorIds();

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
     * Register the IDs of the detectors bundled in detectors/index.json, which
     * DetectionUtils.isOfficialDetector() uses to tell shipped detectors from
     * custom or imported ones. Falls back to the packaged index copy.
     */
    async loadOfficialDetectorIds() {
        const collect = (index) => {
            const ids = [];
            for (const value of Object.values(index || {})) {
                if (value && Array.isArray(value.detectors)) {
                    ids.push(...value.detectors);
                }
            }
            return ids;
        };

        let ids = [];
        try {
            const response = await fetch(chrome.runtime.getURL('detectors/index.json'));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            ids = collect(await response.json());
        } catch (error) {
            Logger.warn('DETECTOR', 'Could not read detectors/index.json, using packaged index for official IDs', error);
        }
        if (ids.length === 0 && typeof CategoryManager !== 'undefined' && typeof CategoryManager.getPackagedFallbackIndex === 'function') {
            ids = collect(CategoryManager.getPackagedFallbackIndex());
        }
        // Official detectors that arrived through Rules → Update after this
        // build shipped are official too, not custom
        try {
            const stored = await chrome.storage.local.get(DetectorManager.REMOTE_OFFICIAL_KEY);
            const remoteIds = stored[DetectorManager.REMOTE_OFFICIAL_KEY];
            if (Array.isArray(remoteIds)) ids.push(...remoteIds.filter(id => typeof id === 'string'));
        } catch (_) { /* bundled IDs only */ }
        DetectionUtils.setOfficialDetectorIds(ids);
    }

    /**
     * Whether a stored detector is an official (shipped) one.
     * @param {object} detector
     * @returns {boolean}
     */
    isOfficialDetector(detector) {
        return DetectionUtils.isOfficialDetector(detector);
    }

    /**
     * Delete one detector. Deleting an official (shipped) detector also records
     * its ID in DELETED_OFFICIAL_KEY so "Update" does not bring it back; use
     * restoreOfficialDetectors() to get it again.
     * @param {string} category
     * @param {string} detectorName - Detector key (ID)
     * @returns {Promise<{deleted: boolean, official: boolean, reason: (null|'not_found')}>}
     */
    async deleteDetector(category, detectorName) {
        const detector = this.detectors[category]?.[detectorName];
        if (!detector) {
            return { deleted: false, official: false, reason: 'not_found' };
        }
        const official = DetectionUtils.isOfficialDetector(detector);
        delete this.detectors[category][detectorName];
        await this.saveDetectorsToStorage();
        if (official) {
            await DetectorManager.markOfficialDeleted(detector.id || detectorName, true);
        }
        return { deleted: true, official, reason: null };
    }

    /** IDs of official detectors the user deleted (kept out of updates). */
    static async getDeletedOfficialIds() {
        try {
            const stored = await chrome.storage.local.get(DetectorManager.DELETED_OFFICIAL_KEY);
            const list = stored[DetectorManager.DELETED_OFFICIAL_KEY];
            return Array.isArray(list) ? list.filter(id => typeof id === 'string') : [];
        } catch (_) {
            return [];
        }
    }

    static async markOfficialDeleted(id, deleted) {
        const ids = new Set(await DetectorManager.getDeletedOfficialIds());
        if (deleted) ids.add(id); else ids.delete(id);
        await chrome.storage.local.set({ [DetectorManager.DELETED_OFFICIAL_KEY]: [...ids] });
    }

    /**
     * Bring back every official detector the user deleted, from the packaged
     * files, and forget the deletions.
     * @returns {Promise<number>} Number of detectors restored
     */
    async restoreOfficialDetectors() {
        const deleted = await DetectorManager.getDeletedOfficialIds();
        if (deleted.length === 0) return 0;
        // The packaged list of official detectors, also when categories are not loaded
        let categories = this.categoryManager?.getAllCategories?.();
        if (!categories || Object.keys(categories).length === 0) {
            const response = await fetch(chrome.runtime.getURL('detectors/index.json'));
            categories = await response.json();
        }
        const failed = [];
        let restored = 0;
        for (const [categoryName, categoryData] of Object.entries(categories || {})) {
            const ids = Array.isArray(categoryData?.detectors) ? categoryData.detectors : [];
            for (const id of ids) {
                if (!deleted.includes(id) || this.detectors[categoryName]?.[id]) continue;
                if (!this.detectors[categoryName]) this.detectors[categoryName] = {};
                // One unreadable file must not stop the others
                try {
                    await this.loadDetectorFile(categoryName, id);
                } catch (error) {
                    Logger.warn('DETECTOR', 'Could not restore official detector', { id, error: error?.message });
                }
                if (this.detectors[categoryName][id]) restored++;
                else failed.push(id);
            }
        }
        // Keep the ones that did not come back, so a later restore retries them
        await chrome.storage.local.set({ [DetectorManager.DELETED_OFFICIAL_KEY]: failed });
        if (restored > 0) await this.saveDetectorsToStorage();
        return restored;
    }

    /**
     * Remove every custom (non-official) detector; official ones are kept.
     * @returns {Promise<number>} Number of detectors removed
     */
    async clearCustomDetectors() {
        let removed = 0;
        for (const categoryDetectors of Object.values(this.detectors)) {
            for (const [key, detector] of Object.entries(categoryDetectors || {})) {
                if (!DetectionUtils.isOfficialDetector(detector)) {
                    delete categoryDetectors[key];
                    removed++;
                }
            }
        }
        if (removed > 0) {
            await this.saveDetectorsToStorage();
        }
        return removed;
    }

    /**
     * Export all detectors as a JSON-serialisable object.
     * @returns {{version: string, exportedAt: string, detectors: object}}
     */
    exportDetectors() {
        const detectors = JSON.parse(JSON.stringify(this.detectors));
        for (const category of Object.values(detectors)) {
            for (const detector of Object.values(category || {})) {
                if (detector) delete detector._searchStrings;
            }
        }
        return { version: '1.0', exportedAt: new Date().toISOString(), detectors };
    }

    /**
     * Import detectors from an exported file ({detectors: {category: {id: detector}}}
     * or the bare category map). Official detectors are never removed or
     * overwritten by an import - only their enabled state is taken from the
     * file. "Replace all" (merge = false) removes the custom detectors only.
     * @param {object} data
     * @param {boolean} merge
     * @returns {Promise<boolean>} Success status
     */
    async importDetectors(data, merge = true) {
        const source = (data && typeof data.detectors === 'object' && data.detectors) ? data.detectors : data;
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            return false;
        }

        const incoming = [];
        for (const [category, categoryDetectors] of Object.entries(source)) {
            if (!categoryDetectors || typeof categoryDetectors !== 'object' || Array.isArray(categoryDetectors)) continue;
            for (const [key, detector] of Object.entries(categoryDetectors)) {
                const normalized = DetectorManager.normalizeDetectorSchema(
                    JSON.parse(JSON.stringify(detector || null)),
                    { categoryName: category, detectorName: detector?.id || key, source: 'import' }
                );
                if (normalized) incoming.push({ category, detector: normalized });
            }
        }
        if (incoming.length === 0) {
            return false;
        }

        if (!merge) {
            for (const categoryDetectors of Object.values(this.detectors)) {
                for (const [key, detector] of Object.entries(categoryDetectors || {})) {
                    if (!DetectionUtils.isOfficialDetector(detector)) delete categoryDetectors[key];
                }
            }
        }

        for (const { category, detector } of incoming) {
            const existing = this.findDetectorById(detector.id);
            if (existing && DetectionUtils.isOfficialDetector(existing)) {
                if (typeof detector.enabled === 'boolean') existing.enabled = detector.enabled;
                continue;
            }
            for (const categoryDetectors of Object.values(this.detectors)) {
                if (categoryDetectors && categoryDetectors[detector.id]) delete categoryDetectors[detector.id];
            }
            if (!this.detectors[category]) this.detectors[category] = {};
            this.detectors[category][detector.id] = detector;
        }

        await this.saveDetectorsToStorage();
        return true;
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

// Node test export (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) { module.exports = DetectorManager; }
