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
 * The schedule is a chrome.alarms alarm. Alarms may be cleared when the browser
 * restarts, so on every start the alarm is recreated and a backup that came due
 * while the browser was closed runs once.
 */
const HistoryBackup = {
    ALARM_NAME: 'scrapfly-history-backup',
    PERIOD_MINUTES: { daily: 1440, weekly: 10080, monthly: 43200 },
    MAX_PART_BYTES: 900000,
    FOLDER: 'Scrapfly',
    STATE_KEY: 'scrapfly_history_backup',
    Messages: Object.freeze({ BACKUP_NOW: 'HISTORY_BACKUP_NOW' }),

    _initialized: false,
    _running: null,

    /** Minutes between backups for a frequency, or 0 when it is off or unknown. */
    periodOf(frequency) {
        return this.PERIOD_MINUTES[frequency] || 0;
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
        try {
            const settings = await Utils.getHistorySettings();
            const items = await HistoryStore.read(chrome.storage.local);
            const options = { format: settings.exportFormat, includeTimestamps: settings.includeTimestamps, now };
            const parts = HistoryExport.chunk(items, options, this.MAX_PART_BYTES);
            let files = 0;
            for (let i = 0; i < parts.length; i++) {
                const built = HistoryExport.build(parts[i], options);
                await chrome.downloads.download({
                    url: this.toDataUrl(built.text, built.type),
                    filename: `${this.FOLDER}/${HistoryExport.fileName(built.format, now, parts.length > 1 ? i + 1 : 0)}`,
                    saveAs: false,
                    conflictAction: 'uniquify'
                });
                files++;
            }
            const state = { at: now, ok: true, entries: items.length, files, format: HistoryExport.FORMATS.includes(options.format) ? options.format : 'json', trigger: reason };
            await chrome.storage.local.set({ [this.STATE_KEY]: state });
            return { ok: true, entries: items.length, files };
        } catch (error) {
            const message = String((error && error.message) || error);
            await chrome.storage.local.set({ [this.STATE_KEY]: { at: now, ok: false, error: message, trigger: reason } }).catch(() => {});
            await this.notifyFailure().catch(() => {});
            if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn('BACKGROUND', '[HistoryBackup] Backup failed:', error);
            return { ok: false, entries: 0, files: 0, error: message };
        }
    },

    async notifyFailure() {
        const settings = await Utils.getSettings();
        if (settings.notificationsEnabled === false || !chrome.notifications || !chrome.notifications.create) return;
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
        const { historyBackup } = await Utils.getHistorySettings();
        await this.syncAlarm(historyBackup);
        const period = this.periodOf(historyBackup);
        if (catchUp && period) {
            const last = await this.lastState();
            if (!last || !Number.isFinite(last.at) || Date.now() - last.at >= period * 60000) await this.run('startup');
        }
    },

    /** Worker-side handler for "Back up now" (extension pages only, never a web page's content script). */
    registerHandlers(registry) {
        registry[this.Messages.BACKUP_NOW] = ({ sender, sendResponse }) => {
            const base = chrome.runtime.getURL('');
            const url = String((sender && (sender.url || sender.origin)) || '');
            if (sender && !(base && url.startsWith(base)) && (sender.tab || url)) {
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
