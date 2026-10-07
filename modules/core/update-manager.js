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
    static FETCH_TIMEOUT = Constants.UPDATE_FETCH_TIMEOUT;

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
            Logger.warn('STORAGE', '[UpdateManager] Failed to read incompatible updates:', error);
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
            Logger.warn('STORAGE', '[UpdateManager] Failed to count incompatible updates:', error);
            return 0;
        }
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
                const intervalMs = (settings.updates?.checkIntervalHours || Constants.DEFAULT_CACHE_EXPIRY_HOURS) * 3600000;
                const now = Date.now();

                if (now - lastCheck < intervalMs) {
                    Logger.storage('UpdateManager: Too soon to check again');
                    return { available: false, updates: [], incompatibleCount: 0, error: null };
                }
            }

            // Fetch remote index
            const remoteIndex = await this.fetchRemoteIndex();
            if (!remoteIndex) {
                // Clear stale GitHub updates since we can't reach the server;
                // bundled ones do not depend on it
                await this.setPendingUpdates((await this.getPendingUpdates()).filter(u => u.source === 'bundled'));
                Logger.storage('UpdateManager: Cleared pending updates due to fetch failure');
                return { available: false, updates: [], incompatibleCount: 0, error: 'Failed to fetch remote index' };
            }

            // Compare with local detectors (returns { updates, incompatibleUpdates })
            // Add 30-second timeout to prevent hanging on slow networks
            const comparePromise = this.compareVersions(remoteIndex);
            let timeoutId;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Update check timed out')), Constants.UPDATE_CHECK_TIMEOUT);
            });
            let compared;
            try {
                compared = await Promise.race([comparePromise, timeoutPromise]);
            } finally {
                clearTimeout(timeoutId);
            }
            const { updates, incompatibleUpdates } = compared;

            // Update last check timestamp
            await this.updateLastCheckTimestamp();

            // The pending list is exactly this check's result: an empty check
            // must not leave the badge showing updates from an older one.
            // Bundled updates (queued on extension update) are not on GitHub,
            // so they stay until applied or dismissed.
            const bundledPending = (await this.getPendingUpdates()).filter(u => u.source === 'bundled');
            await this.setPendingUpdates(this.mergeUpdateLists(bundledPending, updates));

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

        // Errors propagate: a check that could not compare is a failed check,
        // never "all detectors are up to date"
        const localDetectors = await this.loadStoredDetectors();
        const deletedOfficial = await this.getDeletedOfficialIds();

        // Collect all detector fetch promises for parallel execution
        const fetchPromises = [];

        // Iterate through remote categories to build fetch list
        for (const [category, categoryData] of Object.entries(remoteIndex)) {
            // Skip non-detector entries
            if (!categoryData.detectors || !Array.isArray(categoryData.detectors)) {
                continue;
            }

            for (const detectorId of categoryData.detectors) {
                // Official detectors the user deleted stay deleted: never offered as "new"
                if (deletedOfficial.has(detectorId) && !localDetectors[category]?.[detectorId]) continue;
                fetchPromises.push(
                    this.fetchRemoteDetector(category, detectorId)
                        .then(remoteDetector => ({ category, detectorId, remoteDetector }))
                );
            }
        }

        // Fetch all detectors in parallel (much faster than sequential)
        const fetchResults = await Promise.all(fetchPromises);
        if (fetchResults.length > 0 && fetchResults.every(r => !r.remoteDetector)) {
            throw new Error('Could not fetch any detector from the update server');
        }

        for (const { category, detectorId, remoteDetector } of fetchResults) {
            if (!remoteDetector) continue;

            const localDetector = localDetectors[category]?.[detectorId];
            const updateInfo = this.describeUpdate(category, detectorId, remoteDetector, localDetector);
            if (!updateInfo) continue;

            // Check extension compatibility
            if (this.isCompatibleWithExtension(remoteDetector)) {
                updates.push(updateInfo);
                Logger.storage(`UpdateManager: Update available for ${detectorId}: ${updateInfo.localVersion} -> ${updateInfo.remoteVersion}`);
            } else {
                incompatibleUpdates.push(updateInfo);
                Logger.warn('STORAGE', `UpdateManager: ${detectorId} v${updateInfo.remoteVersion} requires extension v${remoteDetector.minExtensionVersion}, current: v${this.getExtensionVersion()}`);
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

        return { updates, incompatibleUpdates };
    }

    /**
     * The version an update is compared against. An edited official detector
     * keeps the official version it was edited from.
     * @param {object|undefined} localDetector
     * @returns {string}
     */
    static localVersionOf(localDetector) {
        if (!localDetector) return '0.0';
        if (localDetector.userModified && localDetector.officialSnapshot?.version) {
            return localDetector.officialSnapshot.version;
        }
        return localDetector.version || '0.0';
    }

    /**
     * Pending-update entry for an incoming detector, or null when it is not an
     * update: not newer than the local copy, or a version the user already
     * declined for their edited copy ("Keep my edits").
     */
    static describeUpdate(category, detectorId, incoming, localDetector, source = 'remote') {
        const remoteVersion = incoming.version || '0.0';
        const localVersion = this.localVersionOf(localDetector);
        if (!this.isNewerVersion(remoteVersion, localVersion)) return null;
        if (localDetector?.userModified && localDetector.dismissedVersion
            && !this.isNewerVersion(remoteVersion, localDetector.dismissedVersion)) {
            return null;
        }
        const entry = {
            id: detectorId,
            category,
            name: incoming.name || detectorId,
            localVersion,
            remoteVersion,
            minExtensionVersion: incoming.minExtensionVersion || '1.0',
            isNew: !localDetector,
            userModified: !!localDetector?.userModified
        };
        if (source !== 'remote') entry.source = source;
        return entry;
    }

    /** Stored detectors as { category: { id: detector } } */
    static async loadStoredDetectors() {
        // Storage format (stringified JSON): { detectors: { antibot: {...}, captcha: {...} }, totalCount: N }
        const result = await chrome.storage.local.get('scrapfly_detectors');
        const storageData = await StorageManager.normalizeStoredValue('scrapfly_detectors', result.scrapfly_detectors) || {};
        return storageData.detectors || {};
    }

    static async saveStoredDetectors(detectors) {
        let totalCount = 0;
        for (const category of Object.values(detectors)) {
            totalCount += Object.keys(category || {}).length;
        }
        await StorageManager.saveToStorage('scrapfly_detectors', {
            detectors,
            totalCount
        }, { wrapMetadata: true });
    }

    static async getDeletedOfficialIds() {
        const deletedRes = await chrome.storage.local.get('scrapfly_deleted_official_detectors');
        return new Set(Array.isArray(deletedRes.scrapfly_deleted_official_detectors) ? deletedRes.scrapfly_deleted_official_detectors : []);
    }

    static async getPendingUpdates() {
        const result = await chrome.storage.local.get(this.STORAGE_KEYS.PENDING_UPDATES);
        const pending = result[this.STORAGE_KEYS.PENDING_UPDATES];
        return Array.isArray(pending) ? pending : [];
    }

    static async setPendingUpdates(updates) {
        if (updates.length > 0) {
            await chrome.storage.local.set({ [this.STORAGE_KEYS.PENDING_UPDATES]: updates });
        } else {
            await chrome.storage.local.remove(this.STORAGE_KEYS.PENDING_UPDATES);
        }
    }

    /** Union of two pending lists by detector; the newer incoming version wins */
    static mergeUpdateLists(base, extra) {
        const byKey = new Map();
        for (const update of [...base, ...extra]) {
            const key = `${update.category}/${update.id}`;
            const existing = byKey.get(key);
            if (!existing || this.isNewerVersion(update.remoteVersion, existing.remoteVersion)) {
                byKey.set(key, update);
            }
        }
        return [...byKey.values()];
    }

    /**
     * Put one incoming official detector in place of the local copy, keeping
     * the user's on/off and difficulty choices.
     */
    static installDetector(detectors, category, detectorId, incoming) {
        const localDetector = detectors[category]?.[detectorId];
        if (localDetector && typeof localDetector.enabled === 'boolean') {
            incoming.enabled = localDetector.enabled;
        }
        // A difficulty the user picked stays; otherwise the update's rating
        // applies, so a detector Scrapfly re-rates changes for everyone
        if (localDetector?.difficultyChosen && localDetector.difficulty !== undefined) {
            incoming.difficulty = localDetector.difficulty;
            incoming.difficultyChosen = true;
        }
        if (!detectors[category]) {
            detectors[category] = {};
        }
        detectors[category][detectorId] = incoming;
    }

    /** Remember official detectors installed by an update, so they count as official */
    static async rememberOfficialIds(ids) {
        if (ids.length === 0) return;
        const key = 'scrapfly_remote_official_ids';
        const stored = await chrome.storage.local.get(key);
        const known = new Set(Array.isArray(stored[key]) ? stored[key] : []);
        for (const id of ids) known.add(id);
        await chrome.storage.local.set({ [key]: [...known] });
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
     * A detector file shipped inside this extension build.
     * @returns {Promise<Object|null>}
     */
    static async fetchBundledDetector(category, detectorId) {
        try {
            const response = await fetch(chrome.runtime.getURL(`detectors/${category}/${detectorId}.json`));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            Logger.debug('STORAGE', `UpdateManager: Could not read bundled ${detectorId}`, error.message);
            return null;
        }
    }

    static fetchUpdateSource(update) {
        return update.source === 'bundled'
            ? this.fetchBundledDetector(update.category, update.id)
            : this.fetchRemoteDetector(update.category, update.id);
    }

    /**
     * Apply pending updates - download and merge detectors.
     *
     * A detector the user edited is never replaced silently: it stays pending
     * and is returned in `needsDecision`, unless the user chose "Use new
     * version" for it (`overwriteModified` with its id in `ids`).
     *
     * @param {Object} [options]
     * @param {string[]} [options.ids] - Apply only these detector IDs
     * @param {boolean} [options.overwriteModified=false] - Replace edited detectors too
     * @returns {Promise<{success: boolean, count: number, failed: number, needsDecision: Array, error: string|null}>}
     */
    static async applyUpdates({ ids = null, overwriteModified = false } = {}) {
        try {
            Logger.storage('UpdateManager: Applying pending updates...');

            const pendingUpdates = await this.getPendingUpdates();
            const selected = ids ? pendingUpdates.filter(u => ids.includes(u.id)) : pendingUpdates;
            const untouched = ids ? pendingUpdates.filter(u => !ids.includes(u.id)) : [];

            if (selected.length === 0) {
                return { success: true, count: 0, failed: 0, needsDecision: untouched.filter(u => u.userModified), error: null };
            }

            // Re-read the local copies now: the user may have edited, deleted
            // or updated a detector since the check that queued these entries
            const detectors = await this.loadStoredDetectors();
            const deletedOfficial = await this.getDeletedOfficialIds();

            let updatedCount = 0;
            let failedCount = 0;
            const keepPending = [];
            const installedNew = [];

            for (const update of selected) {
                if (deletedOfficial.has(update.id) && !detectors[update.category]?.[update.id]) continue;
                try {
                    const incoming = await this.fetchUpdateSource(update);
                    if (!incoming) {
                        failedCount++;
                        keepPending.push(update);
                        Logger.warn('STORAGE', `UpdateManager: Failed to fetch ${update.category}/${update.id}`);
                        continue;
                    }

                    const localDetector = detectors[update.category]?.[update.id];
                    const current = this.describeUpdate(update.category, update.id, incoming, localDetector, update.source);
                    if (!current) continue; // no longer an update: drop it

                    if (current.userModified && !overwriteModified) {
                        keepPending.push(current);
                        continue;
                    }

                    this.installDetector(detectors, update.category, update.id, incoming);
                    if (current.isNew) installedNew.push(update.id);
                    updatedCount++;
                    Logger.storage(`UpdateManager: Updated ${update.id} to v${current.remoteVersion}`);

                } catch (error) {
                    keepPending.push(update);
                    Logger.error('STORAGE', `UpdateManager: Failed to update ${update.id}`, error);
                }
            }

            if (updatedCount > 0) {
                await this.saveStoredDetectors(detectors);
                await this.rememberOfficialIds(installedNew);
            }

            const remaining = [...untouched, ...keepPending];
            await this.setPendingUpdates(remaining);

            if (updatedCount > 0) {
                await this.notifyDetectorsChanged();
            }

            Logger.storage(`UpdateManager: Applied ${updatedCount} updates, ${failedCount} failed, ${remaining.length} pending`);
            return {
                success: true,
                count: updatedCount,
                failed: failedCount,
                needsDecision: remaining.filter(u => u.userModified),
                error: null
            };

        } catch (error) {
            Logger.error('STORAGE', 'UpdateManager: Error applying updates', error);
            return { success: false, count: 0, failed: 0, needsDecision: [], error: error.message };
        }
    }

    /**
     * "Keep my edits": stop offering these pending versions for the user's
     * edited detectors. A later, newer official version is offered again.
     * @param {string[]} ids
     * @returns {Promise<number>} Number of detectors kept
     */
    static async keepUserEdits(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return 0;
        const pendingUpdates = await this.getPendingUpdates();
        const detectors = await this.loadStoredDetectors();
        let kept = 0;
        for (const update of pendingUpdates) {
            if (!ids.includes(update.id)) continue;
            const localDetector = detectors[update.category]?.[update.id];
            if (!localDetector) continue;
            localDetector.dismissedVersion = update.remoteVersion;
            kept++;
        }
        if (kept > 0) await this.saveStoredDetectors(detectors);
        await this.setPendingUpdates(pendingUpdates.filter(u => !ids.includes(u.id)));
        return kept;
    }

    /**
     * Make the running detection use what is now in storage. In the service
     * worker this reloads its DetectorManager directly (a worker cannot
     * message itself); elsewhere it asks the worker to reload.
     */
    static async notifyDetectorsChanged() {
        try {
            const inWorker = typeof window === 'undefined';
            // eslint-disable-next-line no-undef
            if (inWorker && typeof detectorManager !== 'undefined' && detectorManager) {
                if (typeof DetectionEngineManager !== 'undefined' && DetectionEngineManager.patternCache) {
                    DetectionEngineManager.patternCache.clear();
                }
                // eslint-disable-next-line no-undef
                detectorManager.initialized = false;
                // eslint-disable-next-line no-undef
                await detectorManager.initialize();
                return;
            }
            if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
                chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => {
                    void chrome.runtime.lastError;
                });
            }
        } catch (error) {
            Logger.warn('STORAGE', 'UpdateManager: Could not reload detectors after update', error);
        }
    }

    /**
     * Automatic update: check, then install everything the user did not edit.
     * Edited detectors stay pending for the Rules tab to ask about.
     */
    static async runAutoUpdate() {
        const result = await this.checkForUpdates(false);
        if (result.available) {
            const applied = await this.applyUpdates();
            Logger.background(`Auto-update: installed ${applied.count}, ${applied.needsDecision.length} edited rules waiting for a decision`);
        }
        return result;
    }

    /**
     * Difficulty of each detector Scrapfly re-rated in 2.8.2, as shipped
     * before it. Builds before 2.8.2 kept every stored difficulty through
     * updates and did not record which ones the user picked; a stored copy
     * still on this rating is Scrapfly's old one, not the user's.
     */
    static DIFFICULTY_BEFORE_2_8_2 = {
        'detect-aliexpress': 'High',
        'detect-aliyun': 'Medium',
        'detect-aliyunwaf': 'Medium',
        'detect-canvas-fingerprint': 'Low',
        'detect-captchaeu': 'High',
        'detect-capy': 'Medium',
        'detect-dingxiang': 'Medium',
        'detect-fingerprintjs': 'Medium',
        'detect-friendlycaptcha': 'High',
        'detect-geetest': 'High',
        'detect-jiasule': 'Medium',
        'detect-mtcaptcha': 'Medium',
        'detect-ocule': 'Medium',
        'detect-qcloud': 'High',
        'detect-radware': 'High',
        'detect-reblaze': 'Medium',
        'detect-recaptcha': 'High',
        'detect-ruishu': 'High',
        'detect-shumei': 'High',
        'detect-sucuri': 'Medium',
        'detect-turnstile': 'High',
        'detect-yidun': 'High',
        'detect-yundun': 'Medium'
    };

    /**
     * Record a difficulty the user picked in a build that did not record it:
     * any rating Scrapfly never shipped for this detector (the bundled one,
     * the one before 2.8.2, the official one an edit started from).
     * @returns {boolean} true when the flag was set
     */
    static markChosenDifficulty(localDetector, official, detectorId) {
        if (!localDetector || localDetector.difficultyChosen || localDetector.difficulty === undefined) return false;
        const shipped = [official?.difficulty, UpdateManager.DIFFICULTY_BEFORE_2_8_2[detectorId], localDetector.officialSnapshot?.difficulty];
        if (shipped.includes(localDetector.difficulty)) return false;
        localDetector.difficultyChosen = true;
        return true;
    }

    /**
     * After the extension itself is installed or updated: bring the detectors
     * bundled with this build into storage. Storage is only seeded from the
     * bundle on first install, so without this an extension update never
     * delivers new or improved shipped detectors.
     *
     * Missing detectors are added (unless the user deleted them), newer ones
     * replace unedited copies, and newer versions of edited copies are queued
     * as pending updates so the user decides. An unedited copy at the bundled
     * version that still has Scrapfly's previous difficulty takes the new one
     * (it may have come from GitHub through an older build that kept every
     * difficulty); a difficulty the user picked is kept.
     * @returns {Promise<{installed: number, pending: number, rerated: number}>}
     */
    static async mergeBundledDetectors() {
        let index;
        try {
            const response = await fetch(chrome.runtime.getURL('detectors/index.json'));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            index = await response.json();
        } catch (error) {
            Logger.warn('STORAGE', 'UpdateManager: Could not read the bundled detector index', error);
            return { installed: 0, pending: 0, rerated: 0 };
        }

        const detectors = await this.loadStoredDetectors();
        if (Object.keys(detectors).length === 0) return { installed: 0, pending: 0, rerated: 0 }; // first install seeds itself
        const deletedOfficial = await this.getDeletedOfficialIds();
        const queued = [];
        let installed = 0;
        let rerated = 0;
        let changed = false;

        for (const [category, categoryData] of Object.entries(index)) {
            if (!categoryData || !Array.isArray(categoryData.detectors)) continue;
            for (const detectorId of categoryData.detectors) {
                const localDetector = detectors[category]?.[detectorId];
                if (deletedOfficial.has(detectorId) && !localDetector) continue;
                const bundled = await this.fetchBundledDetector(category, detectorId);
                if (!bundled) continue;
                if (this.markChosenDifficulty(localDetector, bundled, detectorId)) changed = true;
                const update = this.describeUpdate(category, detectorId, bundled, localDetector, 'bundled');
                if (!update) {
                    if (localDetector && !localDetector.userModified && !localDetector.difficultyChosen
                        && bundled.difficulty !== undefined && localDetector.difficulty !== bundled.difficulty
                        && !this.isNewerVersion(bundled.version || '0.0', this.localVersionOf(localDetector))
                        && !this.isNewerVersion(this.localVersionOf(localDetector), bundled.version || '0.0')) {
                        localDetector.difficulty = bundled.difficulty;
                        rerated++;
                    }
                    continue;
                }
                if (update.userModified) {
                    queued.push(update);
                    continue;
                }
                this.installDetector(detectors, category, detectorId, bundled);
                installed++;
            }
        }

        if (installed > 0 || rerated > 0 || changed) await this.saveStoredDetectors(detectors);
        if (queued.length > 0) {
            await this.setPendingUpdates(this.mergeUpdateLists(await this.getPendingUpdates(), queued));
        }
        Logger.storage(`UpdateManager: Bundled detectors merged: ${installed} installed, ${rerated} re-rated, ${queued.length} edited rules pending`);
        return { installed, pending: queued.length, rerated };
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
            await StorageManager.saveSettings(settings);
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

    // Alarm name for periodic update checks
    static ALARM_NAME = 'scrapfly-update-check';

    /**
     * Schedule an initial update check + set up periodic alarm
     */
    static async scheduleCheck() {
        try {
            const settings = await Utils.getSettings();
            if (settings.updates?.autoUpdate) {
                Logger.background('Auto-update enabled, checking for detector updates...');
                setTimeout(async () => {
                    try {
                        await this.runAutoUpdate();
                        Logger.background('Update check completed');
                    } catch (error) {
                        Logger.warn('BACKGROUND', 'Failed to check for updates:', error);
                    }
                }, Constants.UPDATE_CHECK_DELAY);

                this.setupAlarm(settings.updates.checkIntervalHours || 12);
            } else {
                Logger.background('Auto-update disabled, skipping update check');
                chrome.alarms.clear(this.ALARM_NAME);
                // Edited rules waiting for a decision after an extension update stay
                await this.setPendingUpdates((await this.getPendingUpdates()).filter(u => u.source === 'bundled'));
            }
        } catch (error) {
            Logger.warn('BACKGROUND', 'Failed to schedule update check:', error);
        }
    }

    /**
     * Create a periodic alarm for update checks
     */
    static setupAlarm(intervalHours) {
        chrome.alarms.create(this.ALARM_NAME, {
            periodInMinutes: intervalHours * 60
        });
        Logger.background(`Update alarm set: every ${intervalHours} hours`);
    }

    /**
     * Register the chrome.alarms listener for periodic checks.
     * Call once during background initialization.
     */
    static setupAlarmListener() {
        chrome.alarms.onAlarm.addListener(async (alarm) => {
            if (alarm.name === this.ALARM_NAME) {
                Logger.background('Periodic update check triggered by alarm');
                try {
                    const settings = await Utils.getSettings();
                    if (settings.updates?.autoUpdate) {
                        await this.runAutoUpdate();
                        Logger.background('Periodic update check completed');
                    }
                } catch (error) {
                    Logger.warn('BACKGROUND', 'Periodic update check failed:', error);
                }
            }
        });
    }

    /**
     * Format timestamp to human-readable string
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {string}
     */
    static formatLastCheck(timestamp) {
        const _i18n = (typeof I18n !== 'undefined') ? I18n : null;
        const _get = (k, fb) => (_i18n && _i18n.get(k)) || fb;
        const _fmt = (k, fb, n) => (_i18n && _i18n.format(k, n)) || fb;

        if (!timestamp) return _get('settingsCheckIntervalNever', 'Never');

        const now = Date.now();
        const diff = now - timestamp;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return _get('timeJustNow', 'Just now');
        if (minutes < 60) {
            return minutes === 1
                ? _get('timeOneMinuteAgo', '1 minute ago')
                : _fmt('timeMinutesAgoLongFmt', `${minutes} minutes ago`, minutes);
        }
        if (hours < 24) {
            return hours === 1
                ? _get('timeOneHourAgo', '1 hour ago')
                : _fmt('timeHoursAgoLongFmt', `${hours} hours ago`, hours);
        }
        return days === 1
            ? _get('timeOneDayAgo', '1 day ago')
            : _fmt('timeDaysAgoLongFmt', `${days} days ago`, days);
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

