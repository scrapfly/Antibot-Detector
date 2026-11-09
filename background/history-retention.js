/**
 * History retention (service worker).
 *
 * Applies these rules to `scrapfly_history`:
 *   1. Auto-delete: when settings.history.historyAutoDelete is on, entries older
 *      than historyAutoDeleteDays (1–3650) are removed.
 *   2. Safety cap: a history limit of 0 keeps at most SAFETY_LIMIT entries
 *      (the newest), as the History settings note promises.
 *   3. Clear on close: with settings.history.historyClearOnClose, every entry
 *      goes when the last browser window closes, or at the next start if the
 *      browser was closed too abruptly to run code.
 *   4. Fingerprinting-only pages: with settings.history.historyFingerprintDays
 *      above 0, an entry whose detections are all fingerprinting techniques goes
 *      after that many days, whatever auto-delete says about the others.
 * Pinned entries are exempt from all four (and from the size limit in
 * HistoryStore): the user chose to keep them.
 * Every write also stays under the size History may take (HistoryStore.write: 6 MB, or the size the person chose),
 * and on start a history saved by an older build is compacted: once per browser session and per version (every write
 * keeps it compact, and the compaction reads, parses and writes all of it), not at every service-worker start.
 * The webhook's record of recent deliveries names pages, so it goes where History's own record goes: with Clear on close,
 * and when History is emptied (forgetDeliveries).
 * Settings that cannot be read (the storage does not answer, or what is stored is not JSON or not an object) are not
 * "no settings": the rules above do nothing until they read again (readConfig), and the size is the largest anyone can have
 * chosen (HistoryStore.currentBudget), where the defaults would take entries the person asked to keep.
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
    MAX_FINGERPRINT_DAYS: 3650,
    DAY_MS: 24 * 60 * 60 * 1000,
    DEBOUNCE_MS: 1500,
    // In memory only (chrome.storage.session): "this version compacted the stored History in this browser session"
    COMPACTED_KEY: 'session_history_compacted',

    _timer: null,
    _reason: null,
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
     * How long fingerprinting-only pages are kept: a whole number of days, or 0 for "like every other page".
     * @param {*} value
     * @returns {number}
     */
    normalizeFingerprintDays(value) {
        const days = parseInt(value, 10);
        if (!Number.isFinite(days) || days <= 0) return 0;
        return Math.min(days, this.MAX_FINGERPRINT_DAYS);
    },

    /**
     * Retention config from the stored settings object.
     * @param {object} settings - Parsed settings (settings.history.*)
     * @returns {{autoDelete: boolean, days: number, fingerprintDays: number, limit: number, clearOnClose: boolean}}
     */
    getConfig(settings) {
        const history = (settings && settings.history) || {};
        const rawLimit = parseInt(history.historyLimit, 10);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : this.SAFETY_LIMIT;
        return {
            autoDelete: history.historyAutoDelete === true,
            days: this.normalizeDays(history.historyAutoDeleteDays),
            fingerprintDays: this.normalizeFingerprintDays(history.historyFingerprintDays),
            limit,
            clearOnClose: history.historyClearOnClose === true
        };
    },

    /**
     * Entry timestamp in ms, or null when it cannot be read (such entries are kept).
     * @param {object} item
     * @returns {number|null}
     */
    getTimestamp(item) {
        const ts = item && item.timestamp;
        // No date (0, what an import writes for an unreadable one) is not a very old date: the entry is kept
        if (typeof ts === 'number' && Number.isFinite(ts)) return ts > 0 ? ts : null;
        if (typeof ts === 'string' && ts.trim() !== '') {
            const numeric = Number(ts);
            if (Number.isFinite(numeric)) return numeric > 0 ? numeric : null;
            const parsed = Date.parse(ts);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    },

    /**
     * Apply auto-delete, the fingerprinting-only rule and the entry cap. Pure: returns a new array.
     * Items are stored newest first, so the cap keeps the head of the list.
     * @param {Array<object>} items
     * @param {{autoDelete: boolean, days: number, fingerprintDays?: number, limit: number}} config
     * @param {number} [now]
     * @returns {{items: Array<object>, removed: number}}
     */
    prune(items, config, now = Date.now()) {
        const list = Array.isArray(items) ? items : [];
        let kept = list;

        if (config && config.autoDelete) {
            const cutoff = now - this.normalizeDays(config.days) * this.DAY_MS;
            kept = kept.filter((item) => {
                if (item && item.pinned === true) return true;
                const ts = this.getTimestamp(item);
                return ts === null || ts >= cutoff;
            });
        }

        // Fingerprinting-only pages have a clock of their own, whether or not auto-delete is on
        const fingerprintDays = this.normalizeFingerprintDays(config && config.fingerprintDays);
        if (fingerprintDays > 0) {
            const cutoff = now - fingerprintDays * this.DAY_MS;
            kept = kept.filter((item) => {
                if (item && item.pinned === true) return true;
                if (!this.policy().isFingerprintOnly(item && item.detections)) return true;
                const ts = this.getTimestamp(item);
                return ts === null || ts >= cutoff;
            });
        }

        const limit = config && Number.isFinite(config.limit) && config.limit > 0 ? config.limit : this.SAFETY_LIMIT;
        kept = this.store().applyLimit(kept, limit);

        return { items: kept, removed: list.length - kept.length };
    },

    /** The History policy (a global in the worker, required under Node tests). */
    policy() {
        return typeof HistoryPolicy !== 'undefined' ? HistoryPolicy : require('../modules/core/history-policy.js');
    },

    /** The HistoryStore (a global in the worker, required under Node tests). */
    store() {
        return typeof HistoryStore !== 'undefined' ? HistoryStore : require('../modules/core/history-store.js');
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

    /** StorageManager (a global in the worker, required under Node tests): its strict reader throws where getSettings answers {}. */
    storageManager() {
        if (typeof StorageManager === 'undefined') require('../modules/core/storage-manager.js');
        return StorageManager;
    },

    /**
     * The retention config from the stored settings, or null when the settings cannot be read (the storage did not answer,
     * or what is stored is not JSON or not an object). That is not "no settings": the defaults (the 1,000-entry cap,
     * auto-delete and clear on close off) are not what the person chose, and trimming with them would take entries they
     * asked to keep. Every caller skips on null; the next run tries again. Settings that were never saved read as {}: the
     * defaults are right then.
     * @returns {Promise<{autoDelete: boolean, days: number, fingerprintDays: number, limit: number, clearOnClose: boolean}|null>}
     */
    async readConfig() {
        // Outside the try: a StorageManager that is not there is a bug the run must show, not settings that cannot be read
        const manager = this.storageManager();
        let settings;
        try {
            settings = await manager.readSettingsStrict();
        } catch (error) {
            // Only the kind of failure: the message of a JSON error quotes the stored text
            this._warn('[HistoryRetention] The settings could not be read, so nothing is trimmed:', error && error.name);
            return null;
        }
        return this.getConfig(settings);
    },

    /**
     * Remove every entry that is not pinned (clear on close).
     * @returns {Promise<number>} entries removed
     */
    async clearUnpinned(reason = 'manual') {
        const { result: removed } = await HistoryStore.mutate((items) => {
            const kept = items.filter(item => item && item.pinned === true);
            return kept.length === items.length ? { result: 0 } : { items: kept, result: items.length - kept.length };
        }, chrome.storage.local);
        // The record of webhook deliveries names pages too: it goes with History's, even when History had nothing left to clear
        await this.forgetDeliveries();
        if (removed > 0) this._log(`[HistoryRetention] Cleared ${removed} history entries (${reason})`);
        return removed;
    },

    /** The last normal window closed: clear History if Settings says so. */
    async onWindowRemoved() {
        const config = await this.readConfig();
        if (!config || !config.clearOnClose || !chrome.windows || !chrome.windows.getAll) return 0;
        const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
        // A private window left open is not a window the person is browsing History in: it does not hold the clear back
        return windows.filter((win) => !(win && win.incognito === true)).length === 0 ? this.clearUnpinned('last window closed') : 0;
    },

    /**
     * Read settings + history, prune, and write back only when something changed. Nothing happens while the settings
     * cannot be read (see readConfig).
     * @param {string} reason - Trigger name, for logging
     * @returns {Promise<number>} Number of removed entries
     */
    async run(reason = 'manual') {
        const config = await this.readConfig();
        if (!config) return 0;
        // A saved History size may be below what is stored: fit it now, not at the next save
        if (reason === 'settings_saved') await this.compactStored();

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
        // Settings saved inside the pause stays the reason: a scan's write right after must not drop the compaction it asked for
        this._reason = this._reason === 'settings_saved' ? 'settings_saved' : reason;
        this._timer = setTimeout(() => {
            this._timer = null;
            const why = this._reason;
            this._reason = null;
            this.run(why).catch((error) => this._warn('[HistoryRetention] Run failed:', error));
        }, this.DEBOUNCE_MS);
    },

    /** Keep the periodic alarm in step with the rules that depend on time (auto-delete, fingerprinting-only pages). */
    async syncAlarm(config) {
        if (typeof chrome === 'undefined' || !chrome.alarms) return;
        try {
            if (config.autoDelete || config.fingerprintDays > 0) {
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
            if (changes.scrapfly_history && this.isEmptied(changes.scrapfly_history.newValue)) this.forgetDeliveries();
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

        // Clear on close: when the last window closes, and at the next start in case the browser was killed
        if (chrome.windows && chrome.windows.onRemoved) {
            chrome.windows.onRemoved.addListener(() => {
                this.onWindowRemoved().catch((error) => this._warn('[HistoryRetention] Clear on close failed:', error));
            });
        }
        if (chrome.runtime && chrome.runtime.onStartup) {
            chrome.runtime.onStartup.addListener(() => {
                this.readConfig()
                    .then((config) => (config && config.clearOnClose ? this.clearUnpinned('browser start') : 0))
                    .catch((error) => this._warn('[HistoryRetention] Clear on start failed:', error));
            });
        }

        // History saved by older builds (pretty-printed, full detection data)
        // can fill the 10 MB storage quota on its own; shrink it first
        this.compactOnStart()
            .catch((error) => this._warn('[HistoryRetention] Compaction failed:', error))
            .then(() => this.run('startup'))
            .catch((error) => this._warn('[HistoryRetention] Run failed:', error));
    },

    /** Rewrite stored history compactly when it is not already, and note that this version did it in this browser session. */
    async compactStored() {
        if (typeof HistoryStore === 'undefined' || !HistoryStore.compact) return null;
        const result = await HistoryStore.compact(chrome.storage.local);
        if (result.changed) {
            const mb = (bytes) => (bytes / 1048576).toFixed(1);
            this._log(`[HistoryRetention] Compacted history ${mb(result.before)} MB -> ${mb(result.after)} MB`
                + (result.dropped ? `, ${result.dropped} oldest entries over the size limit removed` : ''));
        }
        await this.markCompacted();
        return result;
    },

    /**
     * The compaction of a service-worker start. A worker starts many times a day, and the compaction reads, parses and
     * re-serializes the whole History; every write (HistoryStore.write: slim entries, compact JSON, cut to the size limit)
     * already leaves it compact, so it has work only for a History an older build wrote: once per version, and once per
     * browser session (the mark is in memory). Saving the settings compacts anyway (run('settings_saved')): the size limit
     * may have been lowered. Without session storage, or with an unreadable mark, it runs as it always did.
     */
    async compactOnStart() {
        if (await this.compactedAlready()) return null;
        return this.compactStored();
    },

    _version() {
        try { return String(chrome.runtime.getManifest().version || ''); } catch (_) { return ''; }
    },

    _memory() {
        return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session ? chrome.storage.session : null;
    },

    async compactedAlready() {
        const area = this._memory();
        const version = this._version();
        if (!area || !version) return false;
        try {
            const mark = (await area.get(this.COMPACTED_KEY))[this.COMPACTED_KEY];
            return !!mark && mark.version === version;
        } catch (_) {
            return false;
        }
    },

    async markCompacted() {
        const area = this._memory();
        const version = this._version();
        if (!area || !version) return;
        try { await area.set({ [this.COMPACTED_KEY]: { version } }); } catch (_) { /* a mark that cannot be kept only means the next start compacts */ }
    },

    /**
     * The webhook's record of recent deliveries (storage.local, where it outlives the browser) names pages, so it goes where
     * History's own record goes. Never fails: History is cleared whether or not the record can be.
     */
    forgetDeliveries() {
        if (typeof SettingsRuntime === 'undefined' || typeof SettingsRuntime.clearWebhookLog !== 'function') return Promise.resolve();
        try { return Promise.resolve(SettingsRuntime.clearWebhookLog()).catch(() => {}); } catch (_) { return Promise.resolve(); }
    },

    /** Was History written with no entry in it, or removed? A History with entries is bigger than 200 characters and is not parsed. */
    isEmptied(value) {
        if (value === undefined) return true;
        let stored = value;
        if (typeof stored === 'string') {
            if (stored.length >= 200) return false;
            try { stored = JSON.parse(stored); } catch (_) { return false; }
        }
        const items = Array.isArray(stored) ? stored : (stored && stored.items);
        return Array.isArray(items) && items.length === 0;
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
