/**
 * History backup (service worker).
 *
 * With Settings → History → Automatic backup on, a copy of History is saved to
 * the Downloads folder (inside "Scrapfly") every day, week or month, in the
 * export format chosen in Settings. It also runs on request ("Back up now").
 *
 * A service worker cannot make Blob URLs, so each file is downloaded from a
 * data: URL, which Chrome limits to about 2 MB: History is cut into parts that
 * each stay under MAX_PART_BYTES (scrapfly-history-2026-10-19-part-2.json ...;
 * every JSON part can be imported on its own).
 *
 * Settings → History → Backups to keep (KEEP_CHOICES) deletes the files of the older backups after a new one is made; All, the
 * default, deletes nothing. A backup is all the files one run wrote. They are found by the ids the browser gave their downloads,
 * kept in RUNS_KEY and written before anything is deleted, and never by a name in Downloads. An id is not for ever (clearing the
 * browser's downloads list can hand an old one to some other file), so each download is checked before it is deleted: started by
 * this extension and a file in the Scrapfly folder named like a backup.
 *
 * The schedule is a chrome.alarms alarm. Alarms may be cleared when the browser
 * restarts, so on every start the alarm is recreated and a backup that came due
 * while the browser was closed runs once.
 */
const HistoryBackup = {
    ALARM_NAME: 'scrapfly-history-backup',
    PERIOD_MINUTES: { daily: 1440, weekly: 10080, monthly: 43200 },
    MAX_PART_BYTES: 900000,
    FOLDER: 'Scrapfly',
    RETRY_AFTER_FAILURE_MS: 3600000,
    STATE_KEY: 'scrapfly_history_backup',
    // What the backups saved, as { at, ids } with the ids the browser gave the downloads, oldest first (STATE_KEY holds only the last outcome)
    RUNS_KEY: 'scrapfly_history_backup_runs',
    // The numbers Backups to keep offers (anything else is "all")
    KEEP_CHOICES: Object.freeze([3, 7, 14, 30]),
    // Backups remembered at most: far above the largest choice, so it only bounds the record of a person who keeps them all
    MAX_TRACKED_RUNS: 200,
    Messages: Object.freeze({ BACKUP_NOW: 'HISTORY_BACKUP_NOW' }),

    _initialized: false,
    _running: null,

    /** Minutes between backups for a frequency, or 0 when it is off or unknown. */
    periodOf(frequency) {
        return this.PERIOD_MINUTES[frequency] || 0;
    },

    /** How many backups to keep: one of KEEP_CHOICES, or 0 for all. Anything else is "all", so a value nobody chose can never delete a file. */
    keepOf(value) {
        return this.KEEP_CHOICES.includes(value) ? value : 0;
    },

    _warn(message, error) {
        if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn('BACKGROUND', `[HistoryBackup] ${message}`, error);
    },

    /** data: URL of a text, UTF-8 encoded (btoa alone fails on anything outside Latin-1). */
    toDataUrl(text, type) {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return `data:${type};charset=utf-8;base64,${btoa(binary)}`;
    },

    /** The last backup's outcome, as Settings shows it. */
    async lastState() {
        const stored = await chrome.storage.local.get(this.STATE_KEY);
        return stored[this.STATE_KEY] || null;
    },

    /**
     * Write History to Downloads now.
     * @param {string} reason 'alarm' | 'startup' | 'manual'
     * @returns {Promise<{ok: boolean, entries: number, files: number, error?: string}>}
     */
    run(reason = 'manual') {
        // One at a time: an alarm that fires while a manual backup runs joins it
        if (!this._running) {
            this._running = this._run(reason).finally(() => { this._running = null; });
        }
        return this._running;
    },

    async _run(reason) {
        const now = Date.now();
        const ids = [];
        let remembered = false;
        try {
            const settings = await Utils.getHistorySettings();
            const items = await HistoryStore.read(chrome.storage.local);
            const options = { format: settings.exportFormat, includeTimestamps: settings.includeTimestamps, now };
            const parts = HistoryExport.chunk(items, options, this.MAX_PART_BYTES);
            let files = 0;
            for (let i = 0; i < parts.length; i++) {
                const built = HistoryExport.build(parts[i], options);
                const id = await chrome.downloads.download({
                    url: this.toDataUrl(built.fileText, built.type),
                    filename: `${this.FOLDER}/${HistoryExport.fileName(built.format, now, parts.length > 1 ? i + 1 : 0)}`,
                    saveAs: false,
                    conflictAction: 'uniquify'
                });
                files++;
                if (Number.isInteger(id)) ids.push(id);
            }
            // A run that wrote no file is no backup: it is not on record, so a string of them cannot push real ones out. This one
            // is on record before anything older is deleted, so a worker that stops in between loses track of no file
            let removed = 0;
            if (ids.length) {
                remembered = true;
                const record = await this.remember({ at: now, ids });
                if (record) removed = await this.prune(record, this.keepOf(settings.historyBackupKeep));
            }
            const state = { at: now, ok: true, entries: items.length, files, format: HistoryExport.FORMATS.includes(options.format) ? options.format : 'json', trigger: reason, ...(removed ? { removed } : {}) };
            await chrome.storage.local.set({ [this.STATE_KEY]: state });
            return { ok: true, entries: items.length, files };
        } catch (error) {
            // Parts written before the failure are files these backups made: on record, though not as a backup to keep
            if (ids.length && !remembered) await this.remember({ at: now, ids, partial: true });
            const message = String((error && error.message) || error);
            await chrome.storage.local.set({ [this.STATE_KEY]: { at: now, ok: false, error: message, trigger: reason } }).catch(() => {});
            await this.notifyFailure().catch(() => {});
            this._warn('Backup failed:', error);
            return { ok: false, entries: 0, files: 0, error: message };
        }
    },

    /** The record of what backups saved ({ at, ids }, oldest first). Whatever in it is not a run of whole-number ids is left out. */
    async record() {
        const stored = await chrome.storage.local.get(this.RUNS_KEY);
        const list = stored[this.RUNS_KEY];
        const runs = [];
        for (const run of Array.isArray(list) ? list : []) {
            if (!run || typeof run !== 'object' || !Number.isFinite(run.at) || !Array.isArray(run.ids)) continue;
            const ids = run.ids.filter(id => Number.isSafeInteger(id) && id >= 0);
            if (ids.length) runs.push(run.partial === true ? { at: run.at, ids, partial: true } : { at: run.at, ids });
        }
        return runs;
    },

    /**
     * Put a run on the record. Never throws.
     * @param {{at: number, ids: number[], partial?: boolean}} run  partial: files of a backup that failed, or that could not be deleted yet
     * @returns {Promise<Array|null>} the record, or null when it could not be read or written (then nothing is deleted)
     */
    async remember(run) {
        try {
            const runs = await this.record();
            runs.push(run);
            const kept = runs.slice(-this.MAX_TRACKED_RUNS);
            await chrome.storage.local.set({ [this.RUNS_KEY]: kept });
            return kept;
        } catch (error) {
            this._warn('The backup files could not be put on record:', error);
            return null;
        }
    },

    /**
     * Delete the files of every backup but the newest `keep`, and take them off the record. A run that is not a whole backup (one
     * that failed, or whose files could not be deleted yet) never counts among those kept and is tried again. Never throws.
     * @param {Array} record  what remember() answered, the backup just made last
     * @param {number} keep   from keepOf; 0 is all, which deletes nothing
     * @returns {Promise<number>} how many files were deleted
     */
    async prune(record, keep) {
        if (!keep) return 0;
        try {
            const newest = new Set(record.filter(run => !run.partial).slice(-keep));
            if (newest.size === record.length) return 0;
            let removed = 0;
            const rest = [];
            for (const run of record) {
                if (newest.has(run)) { rest.push(run); continue; }
                const left = [];
                for (const id of run.ids) {
                    const outcome = await this.discard(id);
                    if (outcome === 'removed') removed++;
                    else if (outcome === 'retry') left.push(id);
                }
                if (left.length) rest.push({ at: run.at, ids: left, partial: true });
            }
            await chrome.storage.local.set({ [this.RUNS_KEY]: rest });
            return removed;
        } catch (error) {
            this._warn('Old backups could not be deleted:', error);
            return 0;
        }
    },

    /** Is this download one of ours: started by this extension, and a file in the Scrapfly folder named like a backup? */
    madeHere(item) {
        const own = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
        if (!own || !item || item.byExtensionId !== own) return false;
        // The path is the browser's, with the separators of the system; a taken name has " (1)" added before the extension
        const folder = this.FOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`[\\\\/]${folder}[\\\\/]scrapfly-history-[^\\\\/]*$`).test(String(item.filename || ''));
    },

    /**
     * Delete one download by the id the browser gave it, and take its entry out of the browser's list. Never throws.
     * @returns {Promise<'removed'|'gone'|'retry'>} removed: the file was deleted; gone: nothing is left to delete by this id (the file
     *   was already deleted, the browser forgot the download, or the id now belongs to something that is not one of ours); retry: it may still be there
     */
    async discard(id) {
        try {
            const [item] = await chrome.downloads.search({ id });
            if (!item || !this.madeHere(item)) return 'gone';
            if (item.state === 'in_progress') return 'retry';
            let outcome = 'gone';
            if (item.state === 'complete' && item.exists !== false) {
                try {
                    await chrome.downloads.removeFile(id);
                    outcome = 'removed';
                } catch (error) {
                    // Deleted already (or not in the list any more) is done; any other reason may pass
                    if (!/already deleted|invalid download id/i.test(String((error && error.message) || error))) return 'retry';
                }
            }
            await chrome.downloads.erase({ id });
            return outcome;
        } catch (error) {
            return 'retry';
        }
    },

    async notifyFailure() {
        const settings = await Utils.getSettings();
        if (settings.notificationsEnabled === false || settings.settingsUnreadable === true || !chrome.notifications || !chrome.notifications.create) return;
        if (typeof I18n !== 'undefined' && I18n.ready) await I18n.ready();
        chrome.notifications.create('scrapfly-history-backup-failed', {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: (typeof I18n !== 'undefined' && I18n.get('settingsHistoryBackupFailed')) || 'History backup failed',
            message: (typeof I18n !== 'undefined' && I18n.get('settingsHistoryBackupFailedHint')) || 'Check that downloads are allowed, then try Back up now in Settings → History.',
            priority: 1
        });
    },

    /** Keep the alarm in step with the chosen frequency (created, re-timed or cleared). */
    async syncAlarm(frequency) {
        if (typeof chrome === 'undefined' || !chrome.alarms) return;
        const period = this.periodOf(frequency);
        try {
            const existing = await chrome.alarms.get(this.ALARM_NAME);
            if (!period) {
                if (existing) await chrome.alarms.clear(this.ALARM_NAME);
            } else if (!existing || existing.periodInMinutes !== period) {
                chrome.alarms.create(this.ALARM_NAME, { delayInMinutes: period, periodInMinutes: period });
            }
        } catch (error) {
            if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn('BACKGROUND', '[HistoryBackup] Alarm update failed:', error);
        }
    },

    /** The frequency now in Settings, applied to the alarm; a backup that came due while the browser was closed runs once. */
    async sync(catchUp = false) {
        const settings = await Utils.getHistorySettings();
        // Settings that cannot be read are not "backups off": the alarm stays as it is (clearing it would last until the next worker
        // start or settings change), and no catch-up runs from a default
        if (settings.settingsUnreadable === true) return;
        const { historyBackup } = settings;
        await this.syncAlarm(historyBackup);
        const period = this.periodOf(historyBackup);
        if (catchUp && period) {
            const last = await this.lastState();
            // A backup that failed (downloads blocked) is tried again once, an hour later at the earliest: counting it as done
            // would leave the whole period without one. A failed retry (trigger "startup") waits for the next period
            const retry = !!last && last.ok === false && last.trigger !== 'startup' && Date.now() - last.at >= this.RETRY_AFTER_FAILURE_MS;
            if (!last || !Number.isFinite(last.at) || Date.now() - last.at >= period * 60000 || retry) await this.run('startup');
        }
    },

    /** Worker-side handler for "Back up now" (extension pages only, never a web page's content script). */
    registerHandlers(registry) {
        registry[this.Messages.BACKUP_NOW] = ({ sender, sendResponse }) => {
            if (!MessageSender.isExtensionPage(sender)) {
                sendResponse({ status: 'error', error: 'Backups can only be requested from extension pages' });
                return false;
            }
            this.run('manual').then((result) => sendResponse({ status: result.ok ? 'ok' : 'error', ...result }));
            return true;
        };
    },

    /** Register listeners synchronously (MV3 cold starts) and apply the stored setting. */
    init() {
        if (this._initialized || typeof chrome === 'undefined' || !chrome.storage) return;
        this._initialized = true;
        if (chrome.alarms && chrome.alarms.onAlarm) {
            chrome.alarms.onAlarm.addListener((alarm) => {
                if (alarm && alarm.name === this.ALARM_NAME) this.run('alarm').catch(() => {});
            });
        }
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.scrapfly_settings) this.sync(false).catch(() => {});
        });
        this.sync(true).catch(() => {});
    }
};

if (typeof self !== 'undefined') {
    self.HistoryBackup = HistoryBackup;
}
if (typeof module !== 'undefined' && module.exports) { module.exports = HistoryBackup; }
