/**
 * UpdateManager - Handles auto-updating detector definitions from remote server
 *
 * Fetches detector JSONs from GitHub and merges with local storage.
 * Compliant with Chrome Web Store policies (JSON = data, not code).
 */
class UpdateManager {
    // Remote repository URL for detector files
    static REMOTE_BASE_URL = 'https://raw.githubusercontent.com/scrapfly/Antibot-Detector/main/detectors';

    // Fetch timeout in milliseconds
    static FETCH_TIMEOUT = 15000;

    // Storage keys
    static STORAGE_KEYS = {
        PENDING_UPDATES: 'scrapfly_pending_updates',
        LAST_CHECK: 'scrapfly_last_update_check',
        UPDATE_ERRORS: 'scrapfly_update_errors',
        INCOMPATIBLE_UPDATES: 'scrapfly_incompatible_updates'
    };

    /**
     * Get extension version from manifest
     * @returns {string} Extension version string (e.g., "2.5.1")
     */
    static getExtensionVersion() {
        return chrome.runtime.getManifest().version;
    }

    /**
     * Check if a detector is compatible with the current extension version
     * @param {Object} detector - Detector object with optional minExtensionVersion
     * @returns {boolean} True if compatible (minExtensionVersion <= currentVersion)
     */
    static isCompatibleWithExtension(detector) {
        const minRequired = detector.minExtensionVersion || '1.0';
        const current = this.getExtensionVersion();
        // Compatible if minRequired is NOT newer than current
        // (i.e., current >= minRequired)
        return !this.isNewerVersion(minRequired, current);
    }

    /**
     * Get incompatible updates from storage
     * @returns {Promise<Array>} List of incompatible detector updates
     */
    static async getIncompatibleUpdates() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEYS.INCOMPATIBLE_UPDATES);
            return result[this.STORAGE_KEYS.INCOMPATIBLE_UPDATES] || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Get incompatible updates count
     * @returns {Promise<number>}
     */
    static async getIncompatibleUpdatesCount() {
        try {
            const updates = await this.getIncompatibleUpdates();
            return updates.length;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Clear incompatible updates from storage
     * @returns {Promise<void>}
     */
    static async clearIncompatibleUpdates() {
        await chrome.storage.local.remove(this.STORAGE_KEYS.INCOMPATIBLE_UPDATES);
    }

    /**
     * Check for detector updates from remote server
     * @param {boolean} force - Force check regardless of interval
     * @returns {Promise<{available: boolean, updates: Array, incompatibleCount: number, error: string|null}>}
     */
    static async checkForUpdates(force = false) {
        try {
            Logger.storage('UpdateManager: Checking for updates...');

            // Check if auto-update is enabled (unless forced)
            if (!force) {
                const settings = await Utils.getSettings();
                if (!settings.updates?.autoUpdate) {
                    Logger.storage('UpdateManager: Auto-update disabled, skipping');
                    return { available: false, updates: [], incompatibleCount: 0, error: null };
                }

                // Check interval
                const lastCheck = settings.updates?.lastCheckTimestamp || 0;
                const intervalMs = (settings.updates?.checkIntervalHours || 12) * 3600000;
                const now = Date.now();

                if (now - lastCheck < intervalMs) {
                    Logger.storage('UpdateManager: Too soon to check again');
                    return { available: false, updates: [], incompatibleCount: 0, error: null };
                }
            }

            // Fetch remote index
            const remoteIndex = await this.fetchRemoteIndex();
            if (!remoteIndex) {
                // Clear any stale pending updates since we can't reach the server
                await chrome.storage.local.remove(this.STORAGE_KEYS.PENDING_UPDATES);
                Logger.storage('UpdateManager: Cleared pending updates due to fetch failure');
                return { available: false, updates: [], incompatibleCount: 0, error: 'Failed to fetch remote index' };
            }

            // Compare with local detectors (returns { updates, incompatibleUpdates })
            // Add 30-second timeout to prevent hanging on slow networks
            const comparePromise = this.compareVersions(remoteIndex);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Update check timed out')), 30000)
            );
            const { updates, incompatibleUpdates } = await Promise.race([comparePromise, timeoutPromise]);

            // Update last check timestamp
            await this.updateLastCheckTimestamp();

            // Store pending updates for later application (only compatible ones)
            if (updates.length > 0) {
                await chrome.storage.local.set({
                    [this.STORAGE_KEYS.PENDING_UPDATES]: updates
                });
            }

            Logger.storage(`UpdateManager: Found ${updates.length} compatible updates, ${incompatibleUpdates.length} incompatible`);
            return {
                available: updates.length > 0,
                updates,
                incompatibleCount: incompatibleUpdates.length,
                error: null
            };

        } catch (error) {
            Logger.error('STORAGE', 'UpdateManager: Error checking for updates', error);
            return { available: false, updates: [], incompatibleCount: 0, error: error.message };
        }
    }

    /**
     * Fetch remote index.json from GitHub
     * @returns {Promise<Object|null>}
     */
    static async fetchRemoteIndex() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT);

            const response = await fetch(`${this.REMOTE_BASE_URL}/index.json`, {
                signal: controller.signal,
                cache: 'no-store'
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            Logger.storage('UpdateManager: Fetched remote index successfully');
            return data;

        } catch (error) {
            if (error.name === 'AbortError') {
                Logger.error('STORAGE', 'UpdateManager: Fetch timeout');
            } else {
                Logger.error('STORAGE', 'UpdateManager: Failed to fetch remote index', error);
            }
            return null;
        }
    }

    /**
     * Compare local detector versions with remote
     * @param {Object} remoteIndex - Remote index.json content
     * @returns {Promise<{updates: Array, incompatibleUpdates: Array}>} Compatible and incompatible updates
     */
    static async compareVersions(remoteIndex) {
        const updates = [];
        const incompatibleUpdates = [];

        try {
            // Get local detectors from storage
            // Storage format (stringified JSON): { detectors: { antibot: {...}, captcha: {...} }, totalCount: N }
            const result = await chrome.storage.local.get('scrapfly_detectors');
            const storageData = await StorageManager.normalizeStoredValue('scrapfly_detectors', result.scrapfly_detectors) || {};
            const localDetectors = storageData.detectors || {};

            // Collect all detector fetch promises for parallel execution
            const fetchPromises = [];

            // Iterate through remote categories to build fetch list
            for (const [category, categoryData] of Object.entries(remoteIndex)) {
                // Skip non-detector entries
                if (!categoryData.detectors || !Array.isArray(categoryData.detectors)) {
                    continue;
                }

                for (const detectorId of categoryData.detectors) {
                    fetchPromises.push(
                        this.fetchRemoteDetector(category, detectorId)
                            .then(remoteDetector => ({ category, detectorId, remoteDetector }))
                    );
                }
            }

            // Fetch all detectors in parallel (much faster than sequential)
            const fetchResults = await Promise.all(fetchPromises);

            // Process results
            for (const { category, detectorId, remoteDetector } of fetchResults) {
                if (!remoteDetector) continue;

                const remoteVersion = remoteDetector.version || '0.0';

                // Get local version
                const localDetector = localDetectors[category]?.[detectorId];
                const localVersion = localDetector?.version || '0.0';

                // Compare versions
                if (this.isNewerVersion(remoteVersion, localVersion)) {
                    const updateInfo = {
                        id: detectorId,
                        category: category,
                        name: remoteDetector.name || detectorId,
                        localVersion,
                        remoteVersion,
                        minExtensionVersion: remoteDetector.minExtensionVersion || '1.0',
                        isNew: !localDetector
                    };

                    // Check extension compatibility
                    if (this.isCompatibleWithExtension(remoteDetector)) {
                        updates.push(updateInfo);
                        Logger.storage(`UpdateManager: Update available for ${detectorId}: ${localVersion} -> ${remoteVersion}`);
                    } else {
                        incompatibleUpdates.push(updateInfo);
                        Logger.warn('STORAGE', `UpdateManager: ${detectorId} v${remoteVersion} requires extension v${remoteDetector.minExtensionVersion}, current: v${this.getExtensionVersion()}`);
                    }
                }
            }

            // Store incompatible updates for UI display
            if (incompatibleUpdates.length > 0) {
                await chrome.storage.local.set({
                    [this.STORAGE_KEYS.INCOMPATIBLE_UPDATES]: incompatibleUpdates
                });
            } else {
                // Clear any stale incompatible updates
                await chrome.storage.local.remove(this.STORAGE_KEYS.INCOMPATIBLE_UPDATES);
            }

        } catch (error) {
            Logger.error('STORAGE', 'UpdateManager: Error comparing versions', error);
        }

        return { updates, incompatibleUpdates };
    }

    /**
     * Fetch a specific detector JSON from remote
     * @param {string} category - Detector category (antibot, captcha, fingerprint)
     * @param {string} detectorId - Detector ID (e.g., detect-akamai)
     * @returns {Promise<Object|null>}
     */
    static async fetchRemoteDetector(category, detectorId) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT);

            const url = `${this.REMOTE_BASE_URL}/${category}/${detectorId}.json`;
            const response = await fetch(url, {
                signal: controller.signal,
                cache: 'no-store'
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();

        } catch (error) {
            Logger.debug('STORAGE', `UpdateManager: Could not fetch ${detectorId}`, error.message);
            return null;
        }
    }

    /**
     * Apply pending updates - download and merge detectors
     * @returns {Promise<{success: boolean, count: number, error: string|null}>}
     */
    static async applyUpdates() {
        try {
            Logger.storage('UpdateManager: Applying pending updates...');

            // Get pending updates
            const result = await chrome.storage.local.get(this.STORAGE_KEYS.PENDING_UPDATES);
            const pendingUpdates = result[this.STORAGE_KEYS.PENDING_UPDATES] || [];

            if (pendingUpdates.length === 0) {
                return { success: true, count: 0, error: null };
            }

            // Get current detectors
            // Storage format (stringified JSON): { detectors: { antibot: {...}, captcha: {...} }, totalCount: N }
            const detectorResult = await chrome.storage.local.get('scrapfly_detectors');
            const storageData = await StorageManager.normalizeStoredValue('scrapfly_detectors', detectorResult.scrapfly_detectors) || {};
            const detectors = storageData.detectors || {};

            let updatedCount = 0;
            let failedCount = 0;

            for (const update of pendingUpdates) {
                try {
                    // Fetch the full detector data
                    const remoteDetector = await this.fetchRemoteDetector(update.category, update.id);
                    if (!remoteDetector) {
                        failedCount++;
                        Logger.warn('STORAGE', `UpdateManager: Failed to fetch ${update.category}/${update.id}`);
                        continue;
                    }

                    // Preserve user settings (enabled/disabled state)
                    const localDetector = detectors[update.category]?.[update.id];
                    if (localDetector && typeof localDetector.enabled === 'boolean') {
                        remoteDetector.enabled = localDetector.enabled;
                    }

                    // Ensure category exists
                    if (!detectors[update.category]) {
                        detectors[update.category] = {};
                    }

                    // Update detector
                    detectors[update.category][update.id] = remoteDetector;
                    updatedCount++;

                    Logger.storage(`UpdateManager: Updated ${update.id} to v${update.remoteVersion}`);

                } catch (error) {
                    Logger.error('STORAGE', `UpdateManager: Failed to update ${update.id}`, error);
                }
            }

            // Save updated detectors (preserve storage structure, stringify for consistency)
            // Recalculate totalCount
            let totalCount = 0;
            for (const category of Object.values(detectors)) {
                totalCount += Object.keys(category).length;
            }

            await StorageManager.saveToStorage('scrapfly_detectors', {
                detectors,
                totalCount
            }, { wrapMetadata: true });

            // Clear pending updates
            await chrome.storage.local.remove(this.STORAGE_KEYS.PENDING_UPDATES);

            Logger.storage(`UpdateManager: Applied ${updatedCount} updates, ${failedCount} failed`);
            return { success: true, count: updatedCount, failed: failedCount, error: null };

        } catch (error) {
            Logger.error('STORAGE', 'UpdateManager: Error applying updates', error);
            return { success: false, count: 0, error: error.message };
        }
    }

    /**
     * Get pending updates count
     * @returns {Promise<number>}
     */
    static async getPendingUpdatesCount() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEYS.PENDING_UPDATES);
            const pendingUpdates = result[this.STORAGE_KEYS.PENDING_UPDATES] || [];
            return pendingUpdates.length;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Get pending updates details
     * @returns {Promise<Array>}
     */
    static async getPendingUpdates() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEYS.PENDING_UPDATES);
            return result[this.STORAGE_KEYS.PENDING_UPDATES] || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Clear pending updates
     * @returns {Promise<void>}
     */
    static async clearPendingUpdates() {
        await chrome.storage.local.remove(this.STORAGE_KEYS.PENDING_UPDATES);
    }

    /**
     * Update last check timestamp
     * @returns {Promise<void>}
     */
    static async updateLastCheckTimestamp() {
        try {
            const settings = await Utils.getSettings();
            if (!settings.updates) {
                settings.updates = {};
            }
            settings.updates.lastCheckTimestamp = Date.now();
            await chrome.storage.local.set({
                'scrapfly_settings': JSON.stringify(settings, null, 2)
            });
            Utils.invalidateSettingsCache();
        } catch (error) {
            Logger.error('STORAGE', 'UpdateManager: Failed to update timestamp', error);
        }
    }

    /**
     * Compare version strings (semver-like)
     * @param {string} remote - Remote version (e.g., "1.2.0")
     * @param {string} local - Local version (e.g., "1.1.0")
     * @returns {boolean} True if remote is newer
     */
    static isNewerVersion(remote, local) {
        const parseVersion = (v) => {
            return String(v).split('.').map(n => parseInt(n, 10) || 0);
        };

        const remoteParts = parseVersion(remote);
        const localParts = parseVersion(local);

        // Pad arrays to same length
        const maxLen = Math.max(remoteParts.length, localParts.length);
        while (remoteParts.length < maxLen) remoteParts.push(0);
        while (localParts.length < maxLen) localParts.push(0);

        // Compare each part
        for (let i = 0; i < maxLen; i++) {
            if (remoteParts[i] > localParts[i]) return true;
            if (remoteParts[i] < localParts[i]) return false;
        }

        return false; // Equal versions
    }

    /**
     * Get last check timestamp
     * @returns {Promise<number>}
     */
    static async getLastCheckTimestamp() {
        try {
            const settings = await Utils.getSettings();
            return settings.updates?.lastCheckTimestamp || 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Format timestamp to human-readable string
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {string}
     */
    static formatLastCheck(timestamp) {
        if (!timestamp) return 'Never';

        const now = Date.now();
        const diff = now - timestamp;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
}

// Expose globally for extension runtime compatibility across popup/content/background contexts.
if (typeof globalThis !== 'undefined') {
    globalThis.UpdateManager = UpdateManager;
}
if (typeof window !== 'undefined') {
    window.UpdateManager = UpdateManager;
}
if (typeof self !== 'undefined') {
    self.UpdateManager = UpdateManager;
}

// CommonJS export for compatibility with Node-based tooling.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UpdateManager;
}
