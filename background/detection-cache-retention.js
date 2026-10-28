/**
 * Detection cache retention (service worker).
 *
 * `scrapfly_detection_storage` holds one entry per cached page (keyed by the
 * domain/path/URL hash), each with an absolute `expiry`. Lookups only drop the
 * expired entries they happen to scan, so pages that are never looked up again
 * used to stay in storage for good. This module:
 *   1. removes every expired entry, and
 *   2. caps the cache at MAX_ENTRIES, evicting the oldest entries first, and
 *   3. removes the pages scanned in a private window once no private window is
 *      open (when the last one closes, and at the next start if the browser was
 *      killed), so they last no longer than the private session.
 * A non-expired entry of a normal window is only ever removed by the cap.
 *
 * Runs on service-worker start, every PERIOD_MINUTES through chrome.alarms,
 * and inside DetectionEngineManager.storeDetection() on every write (same
 * read-modify-write, under the detection storage lock).
 */
const DetectionCacheRetention = {
    ALARM_NAME: 'scrapfly-detection-cache-retention',
    PERIOD_MINUTES: 60,
    // ~11 KB per entry measured on github.com. History keeps its own byte
    // budget; if both together still reach chrome.storage.local's 10 MB
    // quota, the cache gives way first (DetectionEngineManager.shedStoredDetections).
    MAX_ENTRIES: 500,

    _initialized: false,

    /**
     * Expired entries out, then the oldest (by `timestamp`) until at most
     * `maxEntries` remain; with `dropPrivate`, private-window pages too. Pure: returns a new object.
     * @param {object} storage - Stored cache map {key: entry}
     * @param {{now?: number, maxEntries?: number, dropPrivate?: boolean}} [options]
     * @returns {{storage: object, expired: number, evicted: number, privateRemoved: number}}
     */
    prune(storage, { now = Date.now(), maxEntries = this.MAX_ENTRIES, dropPrivate = false } = {}) {
        const source = storage && typeof storage === 'object' && !Array.isArray(storage) ? storage : {};
        const live = [];
        let expired = 0;
        let privateRemoved = 0;
        for (const [key, entry] of Object.entries(source)) {
            // Unreadable entries (null, non-objects) can never be a cache hit
            if (!entry || typeof entry !== 'object') { expired++; continue; }
            if (dropPrivate && entry.privateWindow === true) { privateRemoved++; continue; }
            if (Number.isFinite(entry.expiry) && now >= entry.expiry) { expired++; continue; }
            live.push([key, entry]);
        }

        let evicted = 0;
        const cap = Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : this.MAX_ENTRIES;
        if (live.length > cap) {
            const age = (entry) => (Number.isFinite(entry.timestamp) ? entry.timestamp : -Infinity);
            // Newest first; stable sort keeps insertion order among equal timestamps
            live.sort((a, b) => age(b[1]) - age(a[1]));
            evicted = live.length - cap;
            live.length = cap;
        }

        return { storage: Object.fromEntries(live), expired, evicted, privateRemoved };
    },

    /**
     * Prune the stored cache now.
     * @param {string} reason - Trigger name, for logging
     * @returns {Promise<{expired: number, evicted: number}>}
     */
    async run(reason = 'manual') {
        if (typeof DetectionEngineManager === 'undefined' || !DetectionEngineManager.pruneStoredDetections) {
            return { expired: 0, evicted: 0 };
        }
        // The Advanced tools' captures follow their own retention (Settings → Detection), checked on the same tick
        if (typeof AdvancedHistoryStore !== 'undefined' && typeof AdvancedHistoryStore.pruneExpired === 'function') {
            await AdvancedHistoryStore.pruneExpired().catch((error) => this._warn('[DetectionCacheRetention] Advanced captures not pruned:', error));
        }
        const dropPrivate = !(await this.privateWindowOpen());
        const result = await DetectionEngineManager.pruneStoredDetections({ dropPrivate });
        if (result.expired || result.evicted || result.privateRemoved) {
            this._log(`[DetectionCacheRetention] Removed ${result.expired} expired, ${result.evicted} over-cap and ${result.privateRemoved || 0} private-window cache entries (${reason})`);
        }
        return result;
    },

    /** Whether a private window is open now (unknown counts as open: nothing private is removed early) */
    async privateWindowOpen() {
        if (typeof chrome === 'undefined' || !chrome.windows || typeof chrome.windows.getAll !== 'function') return true;
        try {
            const windows = await chrome.windows.getAll();
            return (windows || []).some(win => win && win.incognito === true);
        } catch (_) {
            return true;
        }
    },

    /** Register the alarm (synchronously, for MV3 cold starts) and run once. */
    init() {
        if (this._initialized || typeof chrome === 'undefined' || !chrome.storage) return;
        this._initialized = true;

        if (chrome.alarms && chrome.alarms.onAlarm) {
            chrome.alarms.onAlarm.addListener((alarm) => {
                if (alarm && alarm.name === this.ALARM_NAME) {
                    this.run('alarm').catch((error) => this._warn('[DetectionCacheRetention] Run failed:', error));
                }
            });
            chrome.alarms.get(this.ALARM_NAME).then((existing) => {
                if (!existing) chrome.alarms.create(this.ALARM_NAME, { periodInMinutes: this.PERIOD_MINUTES });
            }).catch((error) => this._warn('[DetectionCacheRetention] Alarm setup failed:', error));
        }
        // The last private window closing ends its pages' cache entries
        if (chrome.windows && chrome.windows.onRemoved) {
            chrome.windows.onRemoved.addListener(() => {
                this.run('window closed').catch((error) => this._warn('[DetectionCacheRetention] Run failed:', error));
            });
        }

        this.run('startup').catch((error) => this._warn('[DetectionCacheRetention] Run failed:', error));
    },

    _log(message) {
        if (typeof Logger !== 'undefined' && Logger.background) Logger.background(message);
    },

    _warn(message, error) {
        if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn('BACKGROUND', message, error);
    }
};

if (typeof self !== 'undefined') {
    self.DetectionCacheRetention = DetectionCacheRetention;
}

// Node test export (no-op in the service worker, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) { module.exports = DetectionCacheRetention; }
