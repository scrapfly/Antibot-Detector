/**
 * History retention (service worker).
 *
 * Applies two rules to `scrapfly_history`:
 *   1. Auto-delete: when settings.history.historyAutoDelete is on, entries older
 *      than historyAutoDeleteDays (1–3650) are removed.
 *   2. Safety cap: a history limit of 0 keeps at most SAFETY_LIMIT entries
 *      (the newest), as the History settings note promises.
 * Every write also stays under HistoryStore.MAX_BYTES (HistoryStore.write),
 * and on start a history saved by an older build is compacted once.
 *
 * Runs on service-worker start, whenever settings or history are written, and
 * every PERIOD_MINUTES through chrome.alarms (manifest has the `alarms`
 * permission; without it the other triggers still apply). Writes go through
 * HistoryStore.mutate so they never interleave with a detection save or a
 * popup delete / import / clear.
 */
const HistoryRetention = {
    ALARM_NAME: 'scrapfly-history-retention',
    PERIOD_MINUTES: 360,
    SAFETY_LIMIT: 1000,
    DEFAULT_DAYS: 30,
    MIN_DAYS: 1,
    MAX_DAYS: 3650,
    DAY_MS: 24 * 60 * 60 * 1000,
    DEBOUNCE_MS: 1500,

    _timer: null,
    _initialized: false,

    /**
     * Clamp the configured day count to the allowed range.
     * @param {*} value
     * @returns {number}
     */
    normalizeDays(value) {
        const days = parseInt(value, 10);
        if (!Number.isFinite(days)) return this.DEFAULT_DAYS;
        return Math.min(Math.max(days, this.MIN_DAYS), this.MAX_DAYS);
    },

    /**
     * Retention config from the stored settings object.
     * @param {object} settings - Parsed settings (settings.history.*)
     * @returns {{autoDelete: boolean, days: number, limit: number}}
     */
    getConfig(settings) {
        const history = (settings && settings.history) || {};
        const rawLimit = parseInt(history.historyLimit, 10);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : this.SAFETY_LIMIT;
        return {
            autoDelete: history.historyAutoDelete === true,
            days: this.normalizeDays(history.historyAutoDeleteDays),
            limit
        };
    },

    /**
     * Entry timestamp in ms, or null when it cannot be read (such entries are kept).
     * @param {object} item
     * @returns {number|null}
     */
    getTimestamp(item) {
        const ts = item && item.timestamp;
        if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
        if (typeof ts === 'string' && ts.trim() !== '') {
            const numeric = Number(ts);
            if (Number.isFinite(numeric)) return numeric;
            const parsed = Date.parse(ts);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    },

    /**
     * Apply auto-delete and the entry cap. Pure: returns a new array.
     * Items are stored newest first, so the cap keeps the head of the list.
     * @param {Array<object>} items
     * @param {{autoDelete: boolean, days: number, limit: number}} config
     * @param {number} [now]
     * @returns {{items: Array<object>, removed: number}}
     */
    prune(items, config, now = Date.now()) {
        const list = Array.isArray(items) ? items : [];
        let kept = list;

        if (config && config.autoDelete) {
            const cutoff = now - this.normalizeDays(config.days) * this.DAY_MS;
            kept = kept.filter((item) => {
                const ts = this.getTimestamp(item);
                return ts === null || ts >= cutoff;
            });
        }

        const limit = config && Number.isFinite(config.limit) && config.limit > 0 ? config.limit : this.SAFETY_LIMIT;
        if (kept.length > limit) {
            kept = kept.slice(0, limit);
        }

        return { items: kept, removed: list.length - kept.length };
    },

    /**
     * Parse the stored history value, keeping the container shape.
     * @param {*} raw
     * @returns {{items: Array<object>, container: object|null}}
     */
    parseStored(raw) {
        if (typeof HistoryStore !== 'undefined') return HistoryStore.parse(raw);
        return require('../modules/core/history-store.js').parse(raw);
    },

    parseSettings(raw) {
        let value = raw;
        if (typeof value === 'string') {
            try {
                value = JSON.parse(value);
            } catch (_) {
                return {};
            }
        }
        if (value && value.settings && typeof value.settings === 'object') return value.settings;
        return value && typeof value === 'object' ? value : {};
    },

    /**
     * Read settings + history, prune, and write back only when something changed.
     * @param {string} reason - Trigger name, for logging
     * @returns {Promise<number>} Number of removed entries
     */
    async run(reason = 'manual') {
        const stored = await chrome.storage.local.get(['scrapfly_settings']);
        const config = this.getConfig(this.parseSettings(stored.scrapfly_settings));

        // Same serialized writer as detection saves and popup actions (HistoryStore)
        const { result: removed } = await HistoryStore.mutate((items) => {
            const { items: kept, removed: count } = this.prune(items, config);
            return count > 0 ? { items: kept, result: count } : { result: 0 };
        }, chrome.storage.local);

        if (removed > 0) this._log(`[HistoryRetention] Removed ${removed} history entries (${reason})`);
        await this.syncAlarm(config);
        return removed;
    },

    /** Debounced run for bursts of storage writes. */
    schedule(reason) {
        if (this._timer) clearTimeout(this._timer);
        this._timer = setTimeout(() => {
            this._timer = null;
            this.run(reason).catch((error) => this._warn('[HistoryRetention] Run failed:', error));
        }, this.DEBOUNCE_MS);
    },

    /** Keep the periodic alarm in step with the auto-delete toggle. */
    async syncAlarm(config) {
        if (typeof chrome === 'undefined' || !chrome.alarms) return;
        try {
            if (config.autoDelete) {
                const existing = await chrome.alarms.get(this.ALARM_NAME);
                if (!existing) {
                    chrome.alarms.create(this.ALARM_NAME, { periodInMinutes: this.PERIOD_MINUTES });
                }
            } else {
                await chrome.alarms.clear(this.ALARM_NAME);
            }
        } catch (error) {
            this._warn('[HistoryRetention] Alarm update failed:', error);
        }
    },

    /** Register listeners (synchronously, for MV3 cold starts) and run once. */
    init() {
        if (this._initialized || typeof chrome === 'undefined' || !chrome.storage) return;
        this._initialized = true;

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'local') return;
            if (changes.scrapfly_settings) this.schedule('settings_saved');
            else if (changes.scrapfly_history && changes.scrapfly_history.newValue !== undefined) this.schedule('history_write');
        });

        if (chrome.alarms && chrome.alarms.onAlarm) {
            chrome.alarms.onAlarm.addListener((alarm) => {
                if (alarm && alarm.name === this.ALARM_NAME) {
                    this.run('alarm').catch((error) => this._warn('[HistoryRetention] Run failed:', error));
                }
            });
        }

        // History saved by older builds (pretty-printed, full detection data)
        // can fill the 10 MB storage quota on its own; shrink it first
        this.compactStored()
            .catch((error) => this._warn('[HistoryRetention] Compaction failed:', error))
            .then(() => this.run('startup'))
            .catch((error) => this._warn('[HistoryRetention] Run failed:', error));
    },

    /** Rewrite stored history compactly when it is not already. */
    async compactStored() {
        if (typeof HistoryStore === 'undefined' || !HistoryStore.compact) return null;
        const result = await HistoryStore.compact(chrome.storage.local);
        if (result.changed) {
            const mb = (bytes) => (bytes / 1048576).toFixed(1);
            this._log(`[HistoryRetention] Compacted history ${mb(result.before)} MB -> ${mb(result.after)} MB`
                + (result.dropped ? `, ${result.dropped} oldest entries over the size limit removed` : ''));
        }
        return result;
    },

    _log(message) {
        if (typeof Logger !== 'undefined' && Logger.background) Logger.background(message);
    },

    _warn(message, error) {
        if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn('BACKGROUND', message, error);
    }
};

if (typeof self !== 'undefined') {
    self.HistoryRetention = HistoryRetention;
}

// Node test export (no-op in the service worker, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) { module.exports = HistoryRetention; }
