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
 * download() answers once a download has started, and its file can still fail after that (a full disk, a folder that cannot be
 * written, a download blocked or cancelled, the browser closed): a backup waits, WRITE_WAIT_MS at most and with the worker kept
 * awake, until the browser says every file of it is written. One that is interrupted or not written in time fails the backup
 * (Settings says so, and the failure notification), and that backup deletes nothing.
 *
 * Settings → History → Backups to keep (KEEP_CHOICES) deletes the files of the older backups after a new one is written; All, the
 * default, deletes nothing. A backup is all the files one run wrote. They are found by the ids the browser gave their downloads,
 * kept in RUNS_KEY and written before anything is deleted, and never by a name in Downloads. Only a run whose files were all
 * written counts among the backups kept; the files of one that failed are on record too, so they go with the older backups.
 *
 * An id is not for ever: when the browser starts, it numbers new downloads on from the highest id left in its list, so once that
 * list is cleared an old backup's id goes to a new download (a later backup as much as any other file). So the record also keeps
 * when each file's download started and where it was written, and a download is deleted only while it is still that one, was
 * started by this extension and is a file in the Scrapfly folder named like a backup; an id that belongs to a backup being kept is
 * never deleted for an older one. The runs 3.1.7 recorded hold only ids: for those, the download must have started within
 * MATCH_WINDOW_MS of the run. Backups made before 3.1.7 were never recorded, so they stay until the person deletes them.
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
    // What the backups saved, as { at, ids, files } with the ids the browser gave the downloads and, for each, { id, start, name }: when
    // its download started and the file it wrote. Oldest first (STATE_KEY holds only the last outcome); partial: true marks a run that
    // is no backup to keep (it failed, its files are not written yet, or some could not be deleted yet). 3.1.7 wrote { at, ids } only
    RUNS_KEY: 'scrapfly_history_backup_runs',
    // The numbers Backups to keep offers (anything else is "all")
    KEEP_CHOICES: Object.freeze([3, 7, 14, 30]),
    // Backups remembered at most: far above the largest choice, so it only bounds the record of a person who keeps them all
    MAX_TRACKED_RUNS: 200,
    // How long a backup waits for the browser to write its files; one not written by then fails the backup
    WRITE_WAIT_MS: 60000,
    // A run on record without files (3.1.7 wrote none): a download is that run's only if it started within this long of the run
    MATCH_WINDOW_MS: 600000,
    // The worker keepalive's name for a backup that waits for its files
    KEEPALIVE_ID: 'history-backup',
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
            // A backup waits for its files to be written: Chrome stops an idle worker after about 30 s, which would end the wait with
            // nothing said of how it went, so the worker is kept awake as for a scan or a watch check
            this._keepAwake(true);
            this._running = this._run(reason).finally(() => {
                this._running = null;
                this._keepAwake(false);
            });
        }
        return this._running;
    },

    /** Start (or renew: the keepalive drops an operation after two minutes) or end keeping the worker awake for this backup. */
    _keepAwake(on) {
        const keepalive = typeof workerKeepaliveManager !== 'undefined' && workerKeepaliveManager ? workerKeepaliveManager : null;
        if (!keepalive) return;
        if (on) keepalive.startOperation(this.KEEPALIVE_ID, { reason: 'history_backup' });
        else keepalive.endOperation(this.KEEPALIVE_ID);
    },

    async _run(reason) {
        const now = Date.now();
        const ids = [];
        // How the run is on record: '' not yet, 'started' as files these backups made, 'written' as a backup to keep
        let recorded = '';
        // Listening starts before the first download does: what becomes of one is heard even before download() answers with its id
        const heard = this.follow();
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
            // A run that wrote no file is no backup: it is not on record, so a string of them cannot push real ones out
            let removed = 0;
            if (ids.length) {
                // On record at once, but not yet as a backup to keep: a worker stopped while it waits loses track of no file, and files
                // that may never be written cannot push written ones out
                await this.remember({ at: now, ids, partial: true });
                recorded = 'started';
                this._keepAwake(true);
                const failure = await this.written(ids, heard);
                if (failure) throw new Error(failure);
                // Every file is written: now it is a backup to keep, on record (with what tells its files from later downloads that get
                // their ids) before anything older is deleted, so a worker that stops in between loses track of no file
                const record = await this.remember({ at: now, ids, files: await this.identify(ids) }, true);
                recorded = 'written';
                if (record) removed = await this.prune(record, this.keepOf(settings.historyBackupKeep));
            }
            const state = { at: now, ok: true, entries: items.length, files, format: HistoryExport.FORMATS.includes(options.format) ? options.format : 'json', trigger: reason, ...(removed ? { removed } : {}) };
            await chrome.storage.local.set({ [this.STATE_KEY]: state });
            return { ok: true, entries: items.length, files };
        } catch (error) {
            // Files started before the failure are files these backups made: on record, though not as a backup to keep
            if (ids.length && recorded !== 'written') await this.remember({ at: now, ids, files: await this.identify(ids), partial: true }, recorded === 'started');
            const message = String((error && error.message) || error);
            await chrome.storage.local.set({ [this.STATE_KEY]: { at: now, ok: false, error: message, trigger: reason } }).catch(() => {});
            await this.notifyFailure().catch(() => {});
            this._warn('Backup failed:', error);
            return { ok: false, entries: 0, files: 0, error: message };
        } finally {
            heard.stop();
        }
    },

    /**
     * Listen to what becomes of the browser's downloads from now on, so a download written (or interrupted) before download() has
     * answered with its id is not missed. Never throws; stop() ends it.
     * @returns {{states: Map<number, {state: string, error: string}>, wake: Function|null, stop: Function}}
     */
    follow() {
        const heard = { states: new Map(), wake: null, stop() {} };
        const changed = typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.onChanged;
        if (!changed || typeof changed.addListener !== 'function') return heard;
        const listener = (delta) => {
            if (!delta || !Number.isSafeInteger(delta.id) || !(delta.state || delta.error)) return;
            const known = heard.states.get(delta.id) || { state: 'in_progress', error: '' };
            heard.states.set(delta.id, {
                state: delta.state && typeof delta.state.current === 'string' ? delta.state.current : known.state,
                error: delta.error && typeof delta.error.current === 'string' ? delta.error.current : known.error
            });
            if (heard.wake) heard.wake();
        };
        try {
            changed.addListener(listener);
        } catch (error) {
            return heard;
        }
        heard.stop = () => {
            try { changed.removeListener(listener); } catch (error) { /* the worker is going */ }
        };
        return heard;
    },

    /** Ask the browser how far each download not yet heard to have ended has got. Never throws: what it cannot answer, the events still tell. */
    async askBrowser(ids, heard) {
        for (const id of ids) {
            const before = heard.states.get(id);
            if (before && before.state !== 'in_progress') continue;
            try {
                const [item] = await chrome.downloads.search({ id });
                // What was heard while the browser answered is newer than its answer
                const now = heard.states.get(id);
                if (item && typeof item.state === 'string' && (!now || now.state === 'in_progress')) heard.states.set(id, { state: item.state, error: typeof item.error === 'string' ? item.error : '' });
            } catch (error) { /* the events still tell */ }
        }
    },

    /**
     * Wait until the browser has written every file of a run: each download 'complete'. Never rejects.
     * @param {number[]} ids
     * @param {object} heard  from follow(), started before the first download
     * @returns {Promise<string>} '' when every file is written; otherwise why the backup is not whole: a download interrupted (with
     *   the browser's reason), or one still not written after WRITE_WAIT_MS
     */
    written(ids, heard) {
        return new Promise((resolve) => {
            let over = false;
            let timer = null;
            const end = (outcome) => {
                if (over) return;
                over = true;
                clearTimeout(timer);
                heard.wake = null;
                resolve(outcome);
            };
            const check = () => {
                let waiting = false;
                for (const id of ids) {
                    const known = heard.states.get(id);
                    if (known && known.state === 'interrupted') {
                        end(`Download interrupted${known.error ? ` (${known.error})` : ''}`);
                        return;
                    }
                    if (!known || known.state !== 'complete') waiting = true;
                }
                if (!waiting) end('');
            };
            heard.wake = check;
            // At the time limit the browser is asked once more, so a file written without a word heard of it still counts
            timer = setTimeout(() => this.askBrowser(ids, heard).then(() => {
                check();
                end(`Download did not finish within ${Math.ceil(this.WRITE_WAIT_MS / 1000)} s`);
            }), this.WRITE_WAIT_MS);
            // A download that ended before it could be heard of (or whose news never comes) is found by asking the browser
            this.askBrowser(ids, heard).then(check);
        });
    },

    /**
     * What tells each download from a later one that gets its id, as the browser says now: when it started and the file it wrote.
     * Never throws: a download it cannot say this of is left out, and the run's own time stands in for it.
     * @returns {Promise<Array<{id: number, start: number, name: string}>>}
     */
    async identify(ids) {
        const files = [];
        for (const id of ids) {
            try {
                const [item] = await chrome.downloads.search({ id });
                const start = Date.parse(item && item.startTime);
                if (Number.isFinite(start)) files.push({ id, start, name: typeof item.filename === 'string' ? item.filename : '' });
            } catch (error) { /* not known: the run's time stands in for it */ }
        }
        return files;
    },

    /** A run as the record keeps it: files only for its own ids and only when there are some, partial only when it is one. */
    entry({ at, ids, files, partial }) {
        const known = (Array.isArray(files) ? files : []).filter(file => ids.includes(file.id));
        return { at, ids, ...(known.length ? { files: known } : {}), ...(partial ? { partial: true } : {}) };
    },

    /** The record of what backups saved ({ at, ids, files }, oldest first). Whatever in it is not a run of whole-number ids is left out. */
    async record() {
        const stored = await chrome.storage.local.get(this.RUNS_KEY);
        const list = stored[this.RUNS_KEY];
        const runs = [];
        for (const run of Array.isArray(list) ? list : []) {
            if (!run || typeof run !== 'object' || !Number.isFinite(run.at) || !Array.isArray(run.ids)) continue;
            const ids = run.ids.filter(id => Number.isSafeInteger(id) && id >= 0);
            if (!ids.length) continue;
            // A file whose description is damaged is left out: for it the run's time stands in, as for a run 3.1.7 recorded
            const files = (Array.isArray(run.files) ? run.files : [])
                .filter(file => file && typeof file === 'object' && Number.isSafeInteger(file.id) && Number.isFinite(file.start) && typeof file.name === 'string')
                .map(file => ({ id: file.id, start: file.start, name: file.name }));
            runs.push(this.entry({ at: run.at, ids, files, partial: run.partial === true }));
        }
        return runs;
    },

    /**
     * Put a run on the record. Never throws.
     * @param {{at: number, ids: number[], files?: Array, partial?: boolean}} run  files: from identify(); partial: files of a backup that
     *   failed, that are not written yet, or that could not be deleted yet
     * @param {boolean} [replace]  in place of the same run (same time, same ids) already on record
     * @returns {Promise<Array|null>} the record, or null when it could not be read or written (then nothing is deleted)
     */
    async remember(run, replace = false) {
        try {
            const same = (other) => other.at === run.at && other.ids.length === run.ids.length && other.ids.every((id, i) => id === run.ids[i]);
            const runs = (await this.record()).filter(other => !(replace && same(other)));
            runs.push(this.entry(run));
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
     * that failed, or whose files could not be deleted yet) never counts among those kept and is tried again. An id that belongs to
     * a backup being kept is that backup's file, whatever older run had it before: it is never deleted for that run. Never throws.
     * @param {Array} record  what remember() answered, the backup just made last
     * @param {number} keep   from keepOf; 0 is all, which deletes nothing
     * @returns {Promise<number>} how many files were deleted
     */
    async prune(record, keep) {
        if (!keep) return 0;
        try {
            const newest = new Set(record.filter(run => !run.partial).slice(-keep));
            if (newest.size === record.length) return 0;
            const kept = new Set([...newest].flatMap(run => run.ids));
            let removed = 0;
            const rest = [];
            for (const run of record) {
                if (newest.has(run)) { rest.push(run); continue; }
                const left = [];
                for (const id of run.ids) {
                    if (kept.has(id)) continue;
                    const outcome = await this.discard(id, run);
                    if (outcome === 'removed') removed++;
                    else if (outcome === 'retry') left.push(id);
                }
                if (left.length) rest.push(this.entry({ at: run.at, ids: left, files: run.files, partial: true }));
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
     * Is the browser's download under this id still the file the run recorded? It must have the start and the file name on record
     * for it (a name the browser had not given yet when it was recorded is not compared); for a run recorded without them (3.1.7),
     * it must have started within MATCH_WINDOW_MS of the run. A download that does not say when it started is never taken for one.
     */
    sameDownload(item, run, id) {
        const start = Date.parse(item && item.startTime);
        if (!Number.isFinite(start)) return false;
        const file = (run.files || []).find(known => known.id === id);
        if (file) return start === file.start && (!file.name || item.filename === file.name);
        return Math.abs(start - run.at) <= this.MATCH_WINDOW_MS;
    },

    /**
     * Delete one file of a run by the id the browser gave its download, and take its entry out of the browser's list. Never throws.
     * @returns {Promise<'removed'|'gone'|'retry'>} removed: the file was deleted; gone: nothing is left to delete by this id (the file
     *   was already deleted, the browser forgot the download, or the id now belongs to another download, one that is not ours or not
     *   this run's file); retry: it may still be there
     */
    async discard(id, run) {
        try {
            const [item] = await chrome.downloads.search({ id });
            if (!item || !this.madeHere(item) || !this.sameDownload(item, run, id)) return 'gone';
            if (item.state === 'in_progress') return 'retry';
            let outcome = 'gone';
            if (item.state === 'complete' && item.exists !== false) {
                try {
                    await chrome.downloads.removeFile(id);
                    outcome = 'removed';
                } catch (error) {
                    // Deleted already (or not in the list any more: Chrome says "Invalid downloadId") is done; any other reason may pass
                    if (!/already deleted|invalid download ?id/i.test(String((error && error.message) || error))) return 'retry';
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
