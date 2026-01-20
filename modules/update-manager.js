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
        UPDATE_ERRORS: 'scrapfly_update_errors'
    };

    /**
     * Check for detector updates from remote server
     * @param {boolean} force - Force check regardless of interval
     * @returns {Promise<{available: boolean, updates: Array, error: string|null}>}
     */
    static async checkForUpdates(force = false) {
        try {
            Logger.storage('UpdateManager: Checking for updates...');

            // Check if auto-update is enabled (unless forced)
            if (!force) {
                const settings = await Utils.getSettings();
                if (!settings.updates?.autoUpdate) {
                    Logger.storage('UpdateManager: Auto-update disabled, skipping');
                    return { available: false, updates: [], error: null };
                }

                // Check interval
                const lastCheck = settings.updates?.lastCheckTimestamp || 0;
                const intervalMs = (settings.updates?.checkIntervalHours || 12) * 3600000;
                const now = Date.now();

                if (now - lastCheck < intervalMs) {
                    Logger.storage('UpdateManager: Too soon to check again');
                    return { available: false, updates: [], error: null };
                }
            }

            // Fetch remote index
            const remoteIndex = await this.fetchRemoteIndex();
            if (!remoteIndex) {
                // Clear any stale pending updates since we can't reach the server
                await chrome.storage.local.remove(this.STORAGE_KEYS.PENDING_UPDATES);
                Logger.storage('UpdateManager: Cleared pending updates due to fetch failure');
                return { available: false, updates: [], error: 'Failed to fetch remote index' };
            }

            // Compare with local detectors
            const updates = await this.compareVersions(remoteIndex);

            // Update last check timestamp
            await this.updateLastCheckTimestamp();

            // Store pending updates for later application
            if (updates.length > 0) {
                await chrome.storage.local.set({
                    [this.STORAGE_KEYS.PENDING_UPDATES]: updates
                });
            }

            Logger.storage(`UpdateManager: Found ${updates.length} updates available`);
            return { available: updates.length > 0, updates, error: null };

        } catch (error) {
            Logger.error('STORAGE', 'UpdateManager: Error checking for updates', error);
            return { available: false, updates: [], error: error.message };
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
     * @returns {Promise<Array>} List of detectors that need updating
     */
    static async compareVersions(remoteIndex) {
        const updates = [];

        try {
            // Get local detectors from storage
            // Storage format (stringified JSON): { detectors: { antibot: {...}, captcha: {...} }, totalCount: N }
            const result = await chrome.storage.local.get('scrapfly_detectors');
            const rawData = result.scrapfly_detectors;
            const storageData = rawData ? (typeof rawData === 'string' ? JSON.parse(rawData) : rawData) : {};
            const localDetectors = storageData.detectors || {};

            // Iterate through remote categories
            for (const [category, categoryData] of Object.entries(remoteIndex)) {
                // Skip non-detector entries
                if (!categoryData.detectors || !Array.isArray(categoryData.detectors)) {
                    continue;
                }

                for (const detectorId of categoryData.detectors) {
                    // Fetch remote detector to get version
                    const remoteDetector = await this.fetchRemoteDetector(category, detectorId);
                    if (!remoteDetector) continue;

                    const remoteVersion = remoteDetector.version || '0.0';

                    // Get local version
                    const localDetector = localDetectors[category]?.[detectorId];
                    const localVersion = localDetector?.version || '0.0';

                    // Compare versions
                    if (this.isNewerVersion(remoteVersion, localVersion)) {
                        updates.push({
                            id: detectorId,
                            category: category,
                            name: remoteDetector.name || detectorId,
                            localVersion,
                            remoteVersion,
                            isNew: !localDetector
                        });
                        Logger.storage(`UpdateManager: Update available for ${detectorId}: ${localVersion} -> ${remoteVersion}`);
                    }
                }
            }
        } catch (error) {
            Logger.error('STORAGE', 'UpdateManager: Error comparing versions', error);
        }

        return updates;
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
            const rawData = detectorResult.scrapfly_detectors;
            const storageData = rawData ? (typeof rawData === 'string' ? JSON.parse(rawData) : rawData) : {};
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
            storageData.detectors = detectors;
            storageData.timestamp = new Date().toISOString();
            // Recalculate totalCount
            let totalCount = 0;
            for (const category of Object.values(detectors)) {
                totalCount += Object.keys(category).length;
            }
            storageData.totalCount = totalCount;
            await chrome.storage.local.set({ scrapfly_detectors: JSON.stringify(storageData, null, 2) });

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
            await Utils.saveSettings(settings);
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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UpdateManager;
}
