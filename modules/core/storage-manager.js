/**
 * StorageManager - Shared storage utilities for Chrome extension
 * Provides consistent patterns for loading, saving, and migrating storage data
 *
 * Used by: DetectorManager, CategoryManager, and other managers
 */
class StorageManager {
    /** Read raw values without normalization or writes, including single-writer history. */
    static async readRaw(keys) {
        return (await chrome.storage.local.get(keys)) || {};
    }

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
     * Normalize the Scrapfly settings container to the actual settings object.
     * Supports current raw settings, legacy JSON strings, and old { settings } wrappers.
     * @param {any} rawData - Raw scrapfly_settings value
     * @returns {Object} Settings object
     */
    static normalizeSettings(rawData) {
        const parsed = StorageManager.parseStoredValue(rawData, 'scrapfly_settings');
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }

        if (parsed.settings && typeof parsed.settings === 'object') {
            return parsed.settings;
        }

        return parsed;
    }

    /**
     * Load normalized extension settings.
     * @returns {Promise<Object>} Settings object
     */
    static async getSettings() {
        try {
            const result = await chrome.storage.local.get(['scrapfly_settings']) || {};
            return StorageManager.normalizeSettings(result.scrapfly_settings);
        } catch (error) {
            Logger.error('STORAGE', 'Failed to load settings', error);
            return {};
        }
    }

    /** A failed read must never become an empty settings replacement. */
    static async readSettingsStrict() {
        const result = await chrome.storage.local.get(['scrapfly_settings']);
        const raw = result && result.scrapfly_settings;
        if (raw == null) return {};
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const settings = parsed && Object.prototype.hasOwnProperty.call(parsed, 'settings') ? parsed.settings : parsed;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            throw new Error('Stored settings are invalid');
        }
        return settings;
    }

    /** The worker is the only writer; clients send serializable mutations. */
    static async mutateSettings(mutation) {
        if (StorageManager.settingsWriter) return StorageManager.settingsWriter(mutation);
        const type = globalThis.ScrapflyBridgeProtocol.MESSAGE_TYPES.SETTINGS_MUTATE;
        const response = await chrome.runtime.sendMessage({ type, mutation });
        if (!response || response.success !== true) {
            throw new Error(response?.error || 'Settings could not be saved');
        }
        return response;
    }

    static async commitSettings({ baseline, candidate, languageOverride }) {
        return StorageManager.mutateSettings({ operation: 'merge', baseline, candidate, languageOverride });
    }

    /** Compatibility adapter. Returns false on failed reads or writes. */
    static async saveSettings(settings, baseline) {
        try {
            const base = baseline || await StorageManager.readSettingsStrict();
            await StorageManager.commitSettings({ baseline: base, candidate: settings || {} });
            return true;
        } catch (error) {
            Logger.error('STORAGE', 'Failed to save settings');
            return false;
        }
    }

    /** Compatibility for local mutators; the worker still merges atomically. */
    static async updateSettings(mutator) {
        try {
            const baseline = await StorageManager.readSettingsStrict();
            const candidate = JSON.parse(JSON.stringify(baseline));
            if (mutator(candidate) === false) return true;
            await StorageManager.commitSettings({ baseline, candidate });
            return true;
        } catch (error) {
            Logger.error('STORAGE', 'Failed to update settings');
            return false;
        }
    }

    static async patchSettings(patch) {
        try {
            await StorageManager.mutateSettings({ operation: 'patch', patch });
            return true;
        } catch (error) {
            Logger.error('STORAGE', 'Failed to update settings');
            return false;
        }
    }

    static async setDomainExcluded(domain, excluded) {
        try {
            await StorageManager.mutateSettings({ operation: 'domain', domain, excluded });
            return true;
        } catch (error) {
            Logger.error('STORAGE', 'Failed to update domain exclusion');
            return false;
        }
    }

    /**
     * Three-way merge for a settings form saving a copy it loaded earlier:
     * a value the form changed since `base` wins; anything it did not change
     * keeps what is stored now (`stored`), so writes from other tabs survive.
     * Arrays are single values except domain exclusions, which merge additions
     * and removals. Keys absent from `stored` keep the form's value.
     */
    static mergeSettingsChanges(base, mine, stored, path = []) {
        const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        if (!isObj(mine)) return mine;
        const out = {};
        const keys = new Set([...Object.keys(mine), ...(isObj(stored) ? Object.keys(stored) : [])]);
        for (const key of keys) {
            const m = mine[key];
            const b = isObj(base) ? base[key] : undefined;
            const s = isObj(stored) ? stored[key] : undefined;
            const hasMine = Object.prototype.hasOwnProperty.call(mine, key);
            const hasStored = isObj(stored) && Object.prototype.hasOwnProperty.call(stored, key);
            if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
            if (path.length === 1 && path[0] === 'detection' && key === 'blacklistedDomains'
                && Array.isArray(m) && Array.isArray(b) && Array.isArray(s)) {
                const removed = new Set(b.filter(domain => !m.includes(domain)));
                out[key] = [...new Set([...s.filter(domain => !removed.has(domain)), ...m.filter(domain => !b.includes(domain))])];
            } else if (isObj(m) && (isObj(s) || !hasStored)) {
                out[key] = StorageManager.mergeSettingsChanges(b, m, s, [...path, key]);
            } else if (hasMine && !same(m, b)) {
                out[key] = m;                    // changed in the form
            } else if (hasStored) {
                out[key] = s;                    // untouched here: keep the stored value
            } else if (hasMine) {
                out[key] = m;
            }
        }
        return out;
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

            const result = await chrome.storage.local.get(keysToLoad) || {};

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
            const result = await chrome.storage.local.get(allKeys) || {};

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

            Logger.debug('STORAGE', `Batch read ${keyConfigs.length} keys`);
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

            Logger.debug('STORAGE', 'Saved to storage', { key });
            return true;

        } catch (error) {
            Logger.error('STORAGE', `Failed to save to storage (${key})`, error);
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

