/**
 * StorageManager - Shared storage utilities for Chrome extension
 * Provides consistent patterns for loading, saving, and migrating storage data
 *
 * Used by: DetectorManager, CategoryManager, and other managers
 */
class StorageManager {
    /**
     * Parse a stored value that may be a JSON string or an object.
     * Centralizes parsing logic to avoid duplicated try/catch blocks.
     * @param {any} rawData - Raw value from chrome.storage
     * @param {string|null} key - Optional storage key for logging context
     * @returns {Object|null} Parsed object or null on failure
     */
    static parseStoredValue(rawData, key = null) {
        if (rawData === null || rawData === undefined) {
            return null;
        }

        if (typeof rawData === 'string') {
            try {
                return JSON.parse(rawData);
            } catch (error) {
                const keyLabel = key ? ` (${key})` : '';
                Logger.error('STORAGE', `Failed to parse stored JSON${keyLabel}`, error);
                return null;
            }
        }

        if (typeof rawData === 'object') {
            return rawData;
        }

        return null;
    }

    /**
     * Normalize a storage value to object format if it was stored as JSON string.
     * @param {string} key - Storage key
     * @param {any} rawData - Raw value from chrome.storage
     * @returns {Promise<Object|null>} Parsed object or null
     */
    static async normalizeStoredValue(key, rawData) {
        const parsed = StorageManager.parseStoredValue(rawData, key);
        if (parsed && typeof rawData === 'string') {
            try {
                await chrome.storage.local.set({ [key]: parsed });
            } catch (error) {
                Logger.error('STORAGE', `Failed to normalize storage value (${key})`, error);
            }
        }
        return parsed;
    }

    /**
     * Load data from Chrome storage with backward compatibility support
     * Automatically handles:
     * - Legacy key migration (old key → new key)
     * - JSON parsing
     * - Error handling
     *
     * @param {string} primaryKey - Primary storage key to try first
     * @param {string} legacyKey - Optional legacy key for backward compatibility
     * @param {string} dataProperty - Optional property to extract from parsed data (e.g., 'categories', 'detectors')
     * @returns {Promise<Object|null>} Parsed data object or null if not found
     *
     * @example
     * // Load categories with backward compatibility
     * const data = await StorageManager.loadFromStorage('scrapfly_categories', 'scrapfly_categories.json', 'categories');
     */
    static async loadFromStorage(primaryKey, legacyKey = null, dataProperty = null) {
        try {
            const keysToLoad = [primaryKey];
            if (legacyKey) {
                keysToLoad.push(legacyKey);
            }

            const result = await chrome.storage.local.get(keysToLoad);

            let rawData = null;
            let needsMigration = false;

            // Try primary key first
            if (result[primaryKey]) {
                rawData = result[primaryKey];
            }
            // Fallback to legacy key
            else if (legacyKey && result[legacyKey]) {
                rawData = result[legacyKey];
                needsMigration = true;
            }

            // No data found
            if (!rawData) {
                return null;
            }

            // Parse JSON if it's a string
            const parsedData = StorageManager.parseStoredValue(rawData, primaryKey);
            if (!parsedData) {
                return null;
            }

            // Normalize storage to object format + perform legacy key migration if needed
            const shouldNormalize = typeof rawData === 'string';
            if (needsMigration || shouldNormalize) {
                Logger.storage('Migrating storage key', { from: legacyKey, to: primaryKey, normalize: shouldNormalize });
                await chrome.storage.local.set({ [primaryKey]: parsedData });
                if (needsMigration && legacyKey) {
                    await chrome.storage.local.remove([legacyKey]);
                }
            }

            // Extract specific property if requested
            if (dataProperty && parsedData[dataProperty] !== undefined) {
                return parsedData[dataProperty];
            }

            return parsedData;

        } catch (error) {
            Logger.error('STORAGE', `Failed to load from storage (${primaryKey})`, error);
            return null;
        }
    }

    /**
     * Batch load multiple storage keys in a single Chrome storage call
     * Faster than sequential loads by using a single Chrome storage call
     *
     * @param {Array<Object>} keyConfigs - Array of key configurations
     * @param {string} keyConfigs[].primary - Primary storage key
     * @param {string} keyConfigs[].legacy - Optional legacy key for backward compatibility
     * @param {string} keyConfigs[].dataProperty - Optional property to extract from parsed data
     * @returns {Promise<Object>} Object with loaded data keyed by primary key name
     *
     * @example
     * // Load categories and detectors in one call
     * const data = await StorageManager.batchLoadStorage([
     *   { primary: 'scrapfly_categories', legacy: 'scrapfly_categories.json', dataProperty: 'categories' },
     *   { primary: 'scrapfly_detectors', legacy: 'scrapfly_detectors.json', dataProperty: 'detectors' }
     * ]);
     * // Returns: { scrapfly_categories: {...}, scrapfly_detectors: {...} }
     */
    static async batchLoadStorage(keyConfigs) {
        try {
            // Collect all keys to load (primary + legacy)
            const allKeys = [];
            const keyMap = {}; // Maps legacy keys back to their primary keys

            for (const config of keyConfigs) {
                allKeys.push(config.primary);
                keyMap[config.primary] = config;

                if (config.legacy) {
                    allKeys.push(config.legacy);
                    keyMap[config.legacy] = config;
                }
            }

            // Single Chrome storage call for all keys
            const result = await chrome.storage.local.get(allKeys);

            // Process each key config
            const loadedData = {};
            const migrationsNeeded = [];

            for (const config of keyConfigs) {
                let rawData = null;
                let needsMigration = false;

                // Try primary key first
                if (result[config.primary]) {
                    rawData = result[config.primary];
                }
                // Fallback to legacy key
                else if (config.legacy && result[config.legacy]) {
                    rawData = result[config.legacy];
                    needsMigration = true;
                }

                if (rawData) {
                    // Parse JSON if it's a string (centralized)
                    const parsedData = StorageManager.parseStoredValue(rawData, config.primary);
                    if (!parsedData) {
                        loadedData[config.primary] = null;
                        continue;
                    }

                    // Extract specific property if requested
                    if (config.dataProperty && parsedData[config.dataProperty] !== undefined) {
                        loadedData[config.primary] = parsedData[config.dataProperty];
                    } else {
                        loadedData[config.primary] = parsedData;
                    }

                    // Track migrations needed
                    if (needsMigration || typeof rawData === 'string') {
                        migrationsNeeded.push({
                            from: config.legacy,
                            to: config.primary,
                            data: parsedData,
                            normalize: typeof rawData === 'string'
                        });
                    }
                } else {
                    loadedData[config.primary] = null;
                }
            }

            // Perform all migrations in one batch operation
            if (migrationsNeeded.length > 0) {
                const updates = {};
                const removals = [];

                for (const migration of migrationsNeeded) {
                    Logger.storage('Migrating storage key', { from: migration.from, to: migration.to, normalize: migration.normalize });
                    updates[migration.to] = migration.data;
                    if (migration.from) {
                        removals.push(migration.from);
                    }
                }

                await chrome.storage.local.set(updates);
                await chrome.storage.local.remove(removals);
            }

            Logger.storage('Batch loaded storage keys', { count: keyConfigs.length });
            return loadedData;

        } catch (error) {
            Logger.error('STORAGE', 'Failed to batch load from storage', error);
            return {};
        }
    }

    /**
     * Save data to Chrome storage with automatic timestamping and formatting
     * Wraps data with metadata (timestamp, count) for better tracking
     *
     * @param {string} key - Storage key to save under
     * @param {Object} data - Data to save
     * @param {Object} options - Save options
     * @param {boolean} options.wrapMetadata - Whether to wrap data with timestamp/count (default: true)
     * @param {string} options.countProperty - Property name for count metadata (default: null)
     * @param {number} options.jsonIndent - JSON.stringify indentation (default: 2)
     * @param {boolean} options.stringify - Whether to store as JSON string (default: false)
     * @returns {Promise<boolean>} Success status
     *
     * @example
     * // Save with metadata wrapper
     * await StorageManager.saveToStorage('scrapfly_categories', categoriesData, {
     *   countProperty: 'totalCategories'
     * });
     * // Saves: { timestamp: "2025-01-08...", categories: {...}, totalCategories: 5 }
     *
     * @example
     * // Save raw data without wrapper
     * await StorageManager.saveToStorage('scrapfly_settings', settingsData, { wrapMetadata: false });
     */
    static async saveToStorage(key, data, options = {}) {
        try {
            const {
                wrapMetadata = true,
                countProperty = null,
                jsonIndent = 2,
                stringify = false
            } = options;

            let dataToSave = data;

            // Wrap with metadata if requested
            if (wrapMetadata) {
                const wrapper = {
                    timestamp: new Date().toISOString(),
                    ...data
                };

                // Add count metadata if property name provided
                if (countProperty && typeof data === 'object') {
                    const count = Object.keys(data).length;
                    wrapper[countProperty] = count;
                }

                dataToSave = wrapper;
            }

            // Store as object by default; optionally stringify for legacy compatibility
            const valueToSave = stringify ? JSON.stringify(dataToSave, null, jsonIndent) : dataToSave;

            await chrome.storage.local.set({ [key]: valueToSave });

            Logger.storage('Saved to storage', { key });
            return true;

        } catch (error) {
            Logger.error('STORAGE', `Failed to save to storage (${key})`, error);
            return false;
        }
    }

    /**
     * Clear one or more keys from Chrome storage
     *
     * @param {string|Array<string>} keys - Storage key(s) to clear
     * @returns {Promise<boolean>} Success status
     *
     * @example
     * await StorageManager.clearStorage('scrapfly_detectors');
     * await StorageManager.clearStorage(['scrapfly_detectors', 'scrapfly_detectors.json']);
     */
    static async clearStorage(keys) {
        try {
            const keyArray = Array.isArray(keys) ? keys : [keys];
            await chrome.storage.local.remove(keyArray);
            Logger.storage('Cleared storage keys', { keys: keyArray });
            return true;
        } catch (error) {
            Logger.error('STORAGE', 'Failed to clear storage', error);
            return false;
        }
    }

}

// Expose globally for extension runtime compatibility across popup/content/background contexts.
if (typeof globalThis !== 'undefined') {
    globalThis.StorageManager = StorageManager;
}
if (typeof window !== 'undefined') {
    window.StorageManager = StorageManager;
}
if (typeof self !== 'undefined') {
    self.StorageManager = StorageManager;
}

// CommonJS export for compatibility with Node-based tooling.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}
