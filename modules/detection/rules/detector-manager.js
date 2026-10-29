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
        // Tags this instance's own saves, so a change from another context
        // (Rules → Update in the worker, another popup) can be told apart
        this.writerId = `dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        this.onExternalChange = null;
        this.changeListeners = [];
        this.watchStorage();
    }

    /** Called after the rules change, here (a save) or elsewhere (a reload). */
    addChangeListener(fn) {
        if (typeof fn === 'function') this.changeListeners.push(fn);
    }

    notifyChange() {
        for (const fn of this.changeListeners) {
            try { fn(); } catch (error) { Logger.warn('DETECTOR', 'Rules change listener failed', error); }
        }
    }

    /**
     * Reload when another context saves scrapfly_detectors, so this copy's next
     * save cannot revert that change. `onExternalChange` lets a view re-render.
     */
    watchStorage() {
        if (typeof chrome === 'undefined' || !chrome.storage?.onChanged?.addListener) return;
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.scrapfly_detectors || !this.initialized) return;
            const value = typeof StorageManager !== 'undefined'
                ? StorageManager.parseStoredValue(changes.scrapfly_detectors.newValue, 'scrapfly_detectors')
                : changes.scrapfly_detectors.newValue;
            if (value && value.writer === this.writerId) return;
            this.loadFromStorage()
                .then(() => {
                    this.notifyChange();
                    if (typeof this.onExternalChange === 'function') this.onExternalChange();
                })
                .catch(error => Logger.warn('DETECTOR', 'Could not reload detectors after an outside change', error));
        });
    }

    static humanizeDetectorName(id) { return DetectorManager.schema.humanizeDetectorName(id); }
    static canonicalizeDetectorId(id) { return DetectorManager.schema.canonicalizeDetectorId(id); }

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
     * difficulty choices and their translations. Null when there is nothing to restore.
     * @param {object} detector
     * @returns {object|null}
     */
    static officialVersionOf(detector) {
        if (!detector?.userModified || !detector.officialSnapshot) return null;
        const restored = DetectorManager.cleanDetectorCopy(detector.officialSnapshot);
        if (typeof detector.enabled === 'boolean') restored.enabled = detector.enabled;
        if (detector.difficulty !== undefined) restored.difficulty = detector.difficulty;
        if (detector.difficultyChosen) restored.difficultyChosen = true;
        return DetectorManager.carryTranslations(restored, detector);
    }

    /**
     * A deep copy without the rule texts' translations (descriptionI18n,
     * nameI18n at any depth): what a rule detects and how it is named in English.
     * @param {*} value
     * @returns {*}
     */
    static withoutTranslations(value) {
        if (Array.isArray(value)) return value.map(item => DetectorManager.withoutTranslations(item));
        if (!value || typeof value !== 'object') return value;
        const copy = {};
        for (const [key, item] of Object.entries(value)) {
            if (!/I18n$/.test(key)) copy[key] = DetectorManager.withoutTranslations(item);
        }
        return copy;
    }

    // Fields that change without the rule's content changing: on/off, the save time and the version it keeps
    static CONTENT_IGNORED_FIELDS = ['enabled', 'lastUpdated', 'version'];
    // Pattern flags whose default is on: false is a choice there, and true is the same as leaving it out (the editor
    // never writes it, shipped rules often do). Any other flag left out reads as false, and the editor leaves out the
    // ones that are off
    static FLAGS_ON_BY_DEFAULT = new Set(['standalone', 'caseSensitive', 'insensitive', 'enabled']);

    /**
     * What a rule detects and how it reads in English, as comparable text: key order, flags that are off, and the
     * category's spelling ("Anti-Bot" as shipped, "antibot" once saved) do not matter
     */
    static ruleContent(detector) {
        const copy = DetectorManager.withoutTranslations(DetectorManager.cleanDetectorCopy(detector));
        for (const field of DetectorManager.CONTENT_IGNORED_FIELDS) delete copy[field];
        if (typeof copy.category === 'string') copy.category = copy.category.toLowerCase().replace(/[^a-z]/g, '');
        const canonical = (value) => {
            if (Array.isArray(value)) return value.map(canonical);
            if (!value || typeof value !== 'object') return value;
            return Object.fromEntries(Object.keys(value).sort()
                .filter(key => (DetectorManager.FLAGS_ON_BY_DEFAULT.has(key) ? value[key] !== true : value[key] !== false))
                .map(key => [key, canonical(value[key])]));
        };
        return JSON.stringify(canonical(copy));
    }

    /**
     * An official rule marked as edited whose only change is translations:
     * translating is not editing, so updates replace it (keeping the
     * translations) and it is not shown as edited.
     * @param {object} detector
     * @returns {boolean}
     */
    static isTranslationOnlyEdit(detector) {
        if (!detector?.userModified || !detector.officialSnapshot) return false;
        return DetectorManager.ruleContent(detector) === DetectorManager.ruleContent(detector.officialSnapshot);
    }

    /**
     * An official rule the user really changed (patterns, name, icon, difficulty, ...), not only translated
     * @param {object} detector
     * @returns {boolean}
     */
    static isUserEdited(detector) {
        return !!(detector?.userModified && detector.officialSnapshot) && !DetectorManager.isTranslationOnlyEdit(detector);
    }

    /** Unmark a rule as edited (its translations stay) */
    static clearUserEdit(detector) {
        if (!detector) return detector;
        delete detector.userModified;
        delete detector.officialSnapshot;
        delete detector.dismissedVersion;
        return detector;
    }

    /**
     * The person's own translations in a rule, keyed by the English text they
     * translate, per field: { description: { "<English>": { "<locale>": "<translation>" } }, name: {...} }.
     * Covers the description, pattern descriptions and combination names.
     * @param {object} detector
     * @returns {Object<string, Object<string, string>>}
     */
    static userTranslations(detector) {
        // Keyed by text a rule file chose ("__proto__" included): no prototype to write through
        const found = { description: Object.create(null), name: Object.create(null) };
        const walk = (value) => {
            if (Array.isArray(value)) { value.forEach(walk); return; }
            if (!value || typeof value !== 'object') return;
            for (const [field, map] of [['description', value.descriptionI18n], ['name', value.nameI18n]]) {
                const text = value[field];
                if (typeof text !== 'string' || !text.trim() || !map || typeof map !== 'object' || Array.isArray(map)) continue;
                for (const [locale, translation] of Object.entries(map)) {
                    if (typeof translation !== 'string' || !translation.trim()) continue;
                    (found[field][text] ||= Object.create(null))[locale] = translation;
                }
            }
            for (const [key, item] of Object.entries(value)) {
                if (!/I18n$/.test(key) && key !== 'officialSnapshot') walk(item);
            }
        };
        walk(detector);
        return found;
    }

    /**
     * Put the person's translations from `source` on `target` (a new official
     * version, or the official copy restored): a text that is still the same in
     * English keeps its translations; one Scrapfly reworded starts over.
     * @param {object} target - Changed in place
     * @param {object} source
     * @returns {object} target
     */
    static carryTranslations(target, source) {
        const translations = DetectorManager.userTranslations(source);
        if (!target || !Object.keys(translations.description).length && !Object.keys(translations.name).length) return target;
        const walk = (value) => {
            if (Array.isArray(value)) { value.forEach(walk); return; }
            if (!value || typeof value !== 'object') return;
            for (const [field, mapField] of [['description', 'descriptionI18n'], ['name', 'nameI18n']]) {
                const own = typeof value[field] === 'string' && Object.hasOwn(translations[field], value[field]) ? translations[field][value[field]] : null;
                if (!own) continue;
                const current = value[mapField] && typeof value[mapField] === 'object' && !Array.isArray(value[mapField]) ? value[mapField] : {};
                value[mapField] = { ...current, ...own };
            }
            for (const [key, item] of Object.entries(value)) {
                if (!/I18n$/.test(key) && key !== 'officialSnapshot') walk(item);
            }
        };
        walk(target);
        return target;
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

    static categoryDisplayName(category) { return DetectorManager.schema.categoryDisplayName(category); }

    static applyDetectorFixups(detectorData, context = {}) {
        return DetectorManager.migrations.apply(detectorData, context);
    }

    static normalizeDetectorSchema(detectorData, context = {}) {
        const normalized = DetectorManager.schema.normalize(detectorData, context);
        return normalized && DetectorManager.applyDetectorFixups(normalized, context);
    }

    // Browser loaders supply the globals; Node tests resolve the same modules.
    static schema = typeof DetectorSchema !== 'undefined' ? DetectorSchema : require('./detector-schema.js');
    static migrations = typeof DetectorMigrations !== 'undefined' ? DetectorMigrations : require('./historical-migrations.js');

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
    async saveDetectorsToStorage(detectors = this.detectors) {
        try {
            // Deep clone detectors to avoid mutating the original
            const cleanDetectors = JSON.parse(JSON.stringify(detectors));

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
                totalCount: Object.values(cleanDetectors).reduce((count, records) => count + Object.keys(records || {}).length, 0),
                writer: this.writerId
            }, {
                wrapMetadata: true,
                countProperty: null // totalCount already included in data
            });

            if (!success) {
                throw new Error('StorageManager.saveToStorage returned false');
            }
            this.detectors = detectors;
            this.notifyChange();
            return true;
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
                            // A known method saved as text is the old damage this repairs; text under any other key
                            // (a comment in an imported file) is dropped by normalize, never a reason to reload everything
                            for (const [method, methodData] of Object.entries(detector.detection)) {
                                if (typeof methodData === 'string' && DetectorManager.schema.METHODS.includes(method)) {
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
        // Letters only, so "Anti-Bot" is antibot; a custom category keeps its own key
        return Categories.normalize(category);
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
            const candidate = JSON.parse(JSON.stringify(this.detectors));
            if (!candidate[category]) candidate[category] = {};
            detector = JSON.parse(JSON.stringify(detector));

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

            candidate[category][name] = detector;
            await this.saveDetectorsToStorage(candidate);
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
     * The packaged index ({category: {detectors: [ids]}}): the official
     * detectors this build ships. Read from the extension, not from the stored
     * categories, which Update and older builds may have changed.
     * @returns {Promise<object>}
     */
    async getPackagedCategories() {
        try {
            const response = await fetch(chrome.runtime.getURL('detectors/index.json'));
            if (response.ok) return await response.json();
        } catch (_) { /* fall back to the loaded categories */ }
        return this.categoryManager?.getAllCategories?.() || {};
    }

    /** Display name of a packaged detector, or one made from its ID. */
    static async packagedDetectorName(category, id) {
        try {
            const response = await fetch(chrome.runtime.getURL(`detectors/${category}/${id}.json`));
            if (response.ok) {
                const data = await response.json();
                if (data && typeof data.name === 'string' && data.name.trim()) return data.name.trim();
            }
        } catch (_) { /* name from the ID */ }
        return DetectorManager.humanizeDetectorName(id);
    }

    /**
     * Official detectors that are not installed.
     * `missing`: each one to bring back - every packaged detector that is not
     * installed (deleted now, or by a build before 2.8, which did not record
     * deletions) and every deleted one the release on GitHub has. `inRelease`
     * / `packaged` say where it can come from.
     * `updateOnly`: deleted ones in neither place (no release read), so only
     * Rules → Update can install them again.
     * @param {{tag: string, index: object}|null} [release] - Latest release and its index.json
     * @returns {Promise<{missing: Array<{category: string, id: string, name: string, packaged: boolean,
     *   inRelease: boolean}>, updateOnly: string[]}>}
     */
    async getMissingOfficialDetectors(release = null) {
        const deleted = await DetectorManager.getDeletedOfficialIds();
        const idsOf = (index) => {
            const map = new Map();
            for (const [category, data] of Object.entries(index || {})) {
                const ids = Array.isArray(data?.detectors) ? data.detectors : [];
                for (const id of ids) if (typeof id === 'string' && !map.has(id)) map.set(id, category);
            }
            return map;
        };
        const packaged = idsOf(await this.getPackagedCategories());
        const released = idsOf(release?.index);
        const missing = [];
        for (const [id, category] of new Map([...released, ...packaged])) {
            if (this.findDetectorById(id)) continue;
            // A detector only the release has and the user never had is an
            // update, not something to restore
            if (!packaged.has(id) && !deleted.includes(id)) continue;
            const name = packaged.has(id)
                ? await DetectorManager.packagedDetectorName(packaged.get(id), id)
                : DetectorManager.humanizeDetectorName(id);
            missing.push({ category: released.get(id) || category, id, name, packaged: packaged.has(id), inRelease: released.has(id) });
        }
        const updateOnly = deleted.filter(id => !packaged.has(id) && !released.has(id) && !this.findDetectorById(id));
        return { missing, updateOnly };
    }

    /**
     * Install again the missing official detectors and forget the deletions.
     * Each one comes from the release when `fetchReleased` returns it (the
     * caller leaves out copies that need a newer extension), otherwise from
     * the packaged file. Deleted detectors that only Update provides are
     * un-deleted so the next Rules → Update installs them.
     * @param {{missing: Array, updateOnly: string[]}} [found] - From getMissingOfficialDetectors()
     * @param {{fetchReleased?: function(string, string): Promise<object|null>}} [options]
     * @returns {Promise<{restored: Array<{id: string, name: string, source: ('release'|'package')}>,
     *   failed: string[], updateOnly: string[]}>}
     */
    async restoreOfficialDetectors(found, { fetchReleased = null } = {}) {
        const { missing, updateOnly } = found || await this.getMissingOfficialDetectors();
        const restored = [];
        const failed = [];
        const fromReleaseOnly = [];
        for (const { category, id, name, packaged, inRelease } of missing) {
            if (this.findDetectorById(id)) continue;
            if (!this.detectors[category]) this.detectors[category] = {};
            let source = null;
            if (inRelease && typeof fetchReleased === 'function') {
                try {
                    const data = await fetchReleased(category, id);
                    const normalized = data && DetectorManager.normalizeDetectorSchema(data, { categoryName: category, detectorName: id, source: 'remote' });
                    if (normalized) {
                        if (normalized.enabled === undefined) normalized.enabled = true;
                        this.detectors[category][id] = normalized;
                        source = 'release';
                        if (!packaged) fromReleaseOnly.push(id);
                    }
                } catch (error) {
                    Logger.warn('DETECTOR', 'Could not restore official detector from the release', { id, error: error?.message });
                }
            }
            // One unreadable file must not stop the others
            if (!source && packaged) {
                try {
                    await this.loadDetectorFile(category, id);
                    if (this.detectors[category][id]) source = 'package';
                } catch (error) {
                    Logger.warn('DETECTOR', 'Could not restore official detector', { id, error: error?.message });
                }
            }
            if (source) restored.push({ id, name: this.detectors[category][id].name || name, source });
            else failed.push(id);
        }
        // Deletions that did not come back stay recorded, so a later restore
        // retries them and Update does not offer them meanwhile
        const deleted = await DetectorManager.getDeletedOfficialIds();
        await chrome.storage.local.set({ [DetectorManager.DELETED_OFFICIAL_KEY]: failed.filter(id => deleted.includes(id)) });
        if (fromReleaseOnly.length > 0) {
            // Not packaged: official only through the list Update keeps
            const stored = await chrome.storage.local.get(DetectorManager.REMOTE_OFFICIAL_KEY);
            const known = new Set(Array.isArray(stored[DetectorManager.REMOTE_OFFICIAL_KEY]) ? stored[DetectorManager.REMOTE_OFFICIAL_KEY] : []);
            for (const id of fromReleaseOnly) known.add(id);
            await chrome.storage.local.set({ [DetectorManager.REMOTE_OFFICIAL_KEY]: [...known] });
            await this.loadOfficialDetectorIds();
        }
        if (restored.length > 0) await this.saveDetectorsToStorage();
        return { restored, failed, updateOnly };
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
     * Export one detector, in the same file format as exportDetectors so
     * Rules → Import (or a card's Import) reads it back.
     * @param {string} category
     * @param {string} detectorId
     * @returns {{version: string, exportedAt: string, detectors: object}|null}
     */
    exportDetector(category, detectorId) {
        const detector = this.detectors?.[category]?.[detectorId];
        if (!detector) return null;
        const copy = JSON.parse(JSON.stringify(detector));
        delete copy._searchStrings;
        return { version: '1.0', exportedAt: new Date().toISOString(), detectors: { [category]: { [detectorId]: copy } } };
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
        const extensionVersion = typeof chrome !== 'undefined' ? chrome.runtime?.getManifest?.().version : null;
        const incoming = DetectorManager.schema.admitImport(data, extensionVersion, { partial: merge });
        // The rules of the file left out (not valid here), for the message that names them
        this.lastImportSkipped = incoming && Array.isArray(incoming.skipped) ? incoming.skipped.slice() : [];
        if (!incoming) return false;

        // Construct a candidate without touching live rules. An invalid record
        // anywhere in the file or a rejected write leaves the original intact.
        const candidate = JSON.parse(JSON.stringify(this.detectors));
        if (!merge) {
            for (const records of Object.values(candidate)) {
                for (const [key, detector] of Object.entries(records || {})) {
                    if (!DetectionUtils.isOfficialDetector(detector)) delete records[key];
                }
            }
        }
        for (const { category, detector, enabledProvided } of incoming) {
            const existing = Object.values(candidate).flatMap(records => Object.values(records || {}))
                .find(record => record.id === detector.id);
            if (existing && DetectionUtils.isOfficialDetector(existing)) {
                if (enabledProvided) existing.enabled = detector.enabled;
                continue;
            }
            for (const records of Object.values(candidate)) delete records[detector.id];
            if (!candidate[category]) candidate[category] = {};
            // A file cannot say how this browser's rules relate to Scrapfly's: an edit mark or an "official copy" in it
            // would make Update skip the rule and Reset restore whatever the file holds
            const imported = JSON.parse(JSON.stringify(detector));
            for (const field of ['userModified', 'officialSnapshot', 'dismissedVersion']) delete imported[field];
            // Only Rules → Update installs an official rule: a file's copy under an official id is the person's own
            // rule (Update offers the real one beside it), never one shown as Scrapfly's
            const author = typeof imported.author === 'string' ? imported.author.trim().toLowerCase() : '';
            if (author === 'scrapfly' && DetectionUtils._officialDetectorIds && DetectionUtils._officialDetectorIds.has(imported.id)) delete imported.author;
            candidate[category][detector.id] = DetectorManager.applyDetectorFixups(imported);
        }
        await this.saveDetectorsToStorage(candidate);
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
