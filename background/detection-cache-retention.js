/**
 * Detection cache retention (service worker).
 *
 * `scrapfly_detection_storage` holds one entry per cached page (keyed by the
 * domain/path/URL hash), each with an absolute `expiry`. Lookups only drop the
 * expired entries they happen to scan, so pages that are never looked up again
 * used to stay in storage for good. This module:
 *   1. removes every expired entry, and
 *   2. caps the cache at MAX_ENTRIES, evicting the oldest entries first.
 * A non-expired entry is only ever removed by the cap.
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
     * `maxEntries` remain. Pure: returns a new object.
     * @param {object} storage - Stored cache map {key: entry}
     * @param {{now?: number, maxEntries?: number}} [options]
     * @returns {{storage: object, expired: number, evicted: number}}
     */
    prune(storage, { now = Date.now(), maxEntries = this.MAX_ENTRIES } = {}) {
        const source = storage && typeof storage === 'object' && !Array.isArray(storage) ? storage : {};
        const live = [];
        let expired = 0;
        for (const [key, entry] of Object.entries(source)) {
            // Unreadable entries (null, non-objects) can never be a cache hit
            if (!entry || typeof entry !== 'object') { expired++; continue; }
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

        return { storage: Object.fromEntries(live), expired, evicted };
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
        const result = await DetectionEngineManager.pruneStoredDetections();
        if (result.expired || result.evicted) {
            this._log(`[DetectionCacheRetention] Removed ${result.expired} expired and ${result.evicted} over-cap cache entries (${reason})`);
        }
        return result;
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
