/**
 * History watchlist (service worker).
 *
 * With Settings → History → Watch pinned pages on, the pages the person pinned and marked "Watch for changes" are
 * opened again every day or week, one at a time, in a background tab of an existing window. The extension scans each
 * one like any page; the check then updates the History entry of the page it watches (never a new entry) and, when
 * the page gained or lost an anti-bot or CAPTCHA protection, marks it Changed and notifies as Settings → History
 * says for changes.
 *
 * Why a real tab: the scan needs a page that runs (its scripts, hooks and requests), and an offscreen document cannot
 * give one (its content-script access and frames are limited). So a check is a visit: the page is loaded with the
 * person's cookies, which Settings says. The tab itself is BackgroundTabScan's (background/background-tab-scan.js,
 * shared with Bulk scan): a watch scan is a quiet one, it leaves no History entry or webhook delivery of its own.
 *
 * What keeps a check honest:
 *   - the cached result of the page is set aside while it is scanned (DetectionEngineManager.bypassCache), or
 *     nothing would be scanned, and an empty rescan would be taken for "nothing new";
 *   - a page that ends on another address (a login, a block page) is not compared: it says nothing about the page;
 *   - a change is applied only when a second scan, straight after, shows the same change: a challenge page that
 *     appears now and then must not be reported as a protection that came and went;
 *   - at most MAX_WATCHED pages, a scan that takes longer than SCAN_TIMEOUT_MS is given up, the tab is always closed,
 *     and pages on skipped sites or on sites History ignores are not visited at all.
 *
 * The schedule is a chrome.alarms alarm, recreated at every start; a check that came due while the browser was closed
 * runs a couple of minutes after it opens, once its windows exist.
 */
const HistoryWatch = {
    ALARM_NAME: 'scrapfly-history-watch',
    SOON_ALARM_NAME: 'scrapfly-history-watch-soon',
    PERIOD_MINUTES: { daily: 1440, weekly: 10080 },
    SCAN_TIMEOUT_MS: 45000,
    JITTER_MS: [2000, 6000],
    STARTUP_DELAY_MINUTES: 2,
    MIN_GAP_MS: 6 * 60 * 60 * 1000, // a scheduled check never runs within 6 h of the last one ("Check now" always does)
    STATE_KEY: 'scrapfly_history_watch',
    Messages: Object.freeze({ CHECK_NOW: HistoryStore.Messages.WATCH_NOW }),

    _initialized: false,
    _running: null,
    OWNER: 'watch',

    /** The session key that lists the open scan tabs (BackgroundTabScan's, shared with Bulk scan). */
    get OPEN_TABS_KEY() {
        return BackgroundTabScan.OPEN_TABS_KEY;
    },

    /** Minutes between checks for a mode, or 0 when it is off. */
    periodOf(mode) {
        return this.PERIOD_MINUTES[mode] || 0;
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /** The last check's outcome, as Settings shows it. */
    async lastState() {
        const stored = await chrome.storage.local.get(this.STATE_KEY);
        return stored[this.STATE_KEY] || null;
    },

    isWatchTab(tabId) {
        return BackgroundTabScan.ownerOf(tabId) === this.OWNER;
    },

    /** Called by the scan pipeline when the page of a watch tab is finished: the check goes on with the results. */
    scanFinished(tabId, url, results) {
        if (this.isWatchTab(tabId)) BackgroundTabScan.scanFinished(tabId, url, results);
    },

    /** Do these two addresses name the same page (host and path; a redirect to another page does not)? */
    samePage(a, b) {
        return UrlUtils.hashUrl(a, 'path') === UrlUtils.hashUrl(b, 'path');
    },

    /** The same protections gained and lost, whatever their order. */
    sameChange(a, b) {
        const key = (names) => [...names].map(name => Categories.protectionKey(name)).sort().join('\n');
        return key(a.added) === key(b.added) && key(a.removed) === key(b.removed);
    },

    /**
     * Check the watched pages now.
     * @param {string} reason 'alarm' | 'startup' | 'manual'
     * @returns {Promise<{ok: boolean, checked: number, changed: number, skipped: number, failed: number, error?: string}>}
     *   error: 'off' (the extension is switched off), 'paused' (History is), 'no_window', 'recent' (a scheduled check too
     *   soon after the last one: skipped, nothing recorded)
     */
    run(reason = 'manual') {
        // One at a time: an alarm that fires during a manual check joins it
        if (!this._running) {
            // A check takes minutes (a tab per page, up to 45 s each): Chrome stops an idle worker after about 30 s, which
            // would leave a watch tab open for good, so the check keeps the worker awake like a scan does
            const keepalive = typeof workerKeepaliveManager !== 'undefined' && workerKeepaliveManager ? workerKeepaliveManager : null;
            if (keepalive) keepalive.startOperation('history-watch', { reason: 'history_watch' });
            this._running = this._run(reason).finally(() => {
                this._running = null;
                if (keepalive) keepalive.endOperation('history-watch');
            });
        }
        return this._running;
    },

    /** A normal (not private) window to open the check's tab in, or null when the browser has none open. */
    normalWindowId() {
        return BackgroundTabScan.normalWindowId();
    },

    async _run(reason) {
        const totals = { ok: true, checked: 0, changed: 0, skipped: 0, failed: 0 };
        const record = (extra = {}) => chrome.storage.local.set({ [this.STATE_KEY]: { at: Date.now(), trigger: reason, ...totals, ...extra } }).catch(() => {});
        try {
            // Chrome fires an overdue periodic alarm at start-up and the catch-up alarm follows it: the second one, and any
            // scheduled check that comes too soon after the last, is skipped without touching the record of the last one
            if (reason !== 'manual') {
                const last = await this.lastState();
                // A run that checked nothing (no window yet, the extension off) does not count: the catch-up after it must run
                if (last && !last.error && Number.isFinite(last.at) && Date.now() - last.at < this.MIN_GAP_MS) return { ...totals, error: 'recent' };
            }
            // The extension's own switch: off means no scanning at all, so no background tabs either (recorded, so the
            // Settings line says why nothing was checked)
            const flags = await chrome.storage.local.get(['scrapfly_enabled']);
            if (flags.scrapfly_enabled === false) {
                totals.ok = false;
                await record({ error: 'off' });
                return { ...totals, error: 'off' };
            }
            const settings = await Utils.getHistorySettings();
            if (settings.historyEnabled === false) return { ...totals, ok: false, error: 'paused' };
            const watched = HistoryPolicy.watchedOf(await HistoryStore.read(chrome.storage.local));
            if (!watched.length) {
                await record();
                return totals;
            }
            const windowId = await this.normalWindowId();
            if (windowId === null) {
                // No window to open a tab in (the browser runs in the background): try again at the next check
                totals.ok = false;
                await record({ error: 'no_window' });
                return { ...totals, error: 'no_window' };
            }
            for (let i = 0; i < watched.length; i++) {
                if (i > 0) await this.sleep(this.JITTER_MS[0] + Math.random() * (this.JITTER_MS[1] - this.JITTER_MS[0]));
                const outcome = await this._checkOne(watched[i], settings, windowId);
                if (outcome === 'changed') { totals.checked++; totals.changed++; }
                else if (outcome === 'unchanged') totals.checked++;
                else if (outcome === 'skipped') totals.skipped++;
                else totals.failed++;
            }
            await record();
            return totals;
        } catch (error) {
            const message = String((error && error.message) || error);
            totals.ok = false;
            await record({ error: message });
            if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn('BACKGROUND', '[HistoryWatch] Check failed:', error);
            return { ...totals, error: message };
        }
    },

    /**
     * One watched page: scan it, and if its protections differ from the entry's, scan it once more and apply the
     * change only if the second scan agrees.
     * @returns {Promise<'unchanged'|'changed'|'skipped'|'failed'|'redirected'|'unstable'>}
     */
    async _checkOne(entry, settings, windowId) {
        let host = '';
        try { host = new URL(entry.url).hostname; } catch (_) { return 'skipped'; }
        if (await Utils.isUrlBlacklisted(entry.url)) return 'skipped';
        if (HistoryPolicy.matchesDomain(host, settings.historyExcludedDomains)) return 'skipped';

        const first = await this.scan(entry.url, windowId);
        if (!first.ok) return 'failed';
        if (!this.samePage(first.url, entry.url)) return 'redirected';
        const diff = HistoryPolicy.diffProtections(entry.detections, first.results);
        if (diff.changed) {
            await this.sleep(this.JITTER_MS[0]);
            const second = await this.scan(entry.url, windowId);
            if (!second.ok || !this.samePage(second.url, entry.url)) return 'unstable';
            if (!this.sameChange(diff, HistoryPolicy.diffProtections(entry.detections, second.results))) return 'unstable';
        }
        const applied = await HistoryRecorder.applyWatchResult(entry.id, first.results, chrome);
        if (!applied.found) return 'skipped'; // unpinned or unwatched while it was being checked
        return applied.changed ? 'changed' : 'unchanged';
    },

    /**
     * Open the address in a background tab and wait for the extension's scan of it (a quiet scan: the check records it).
     * @returns {Promise<{ok: boolean, url?: string, results?: Array, error?: string}>}
     */
    scan(url, windowId) {
        return BackgroundTabScan.scan(url, { windowId, timeoutMs: this.SCAN_TIMEOUT_MS, owner: this.OWNER, quiet: true });
    },

    /** The scan tabs a stopped worker left open are closed when it starts again (BackgroundTabScan). */
    async closeLeftoverTabs() {
        if (this._running) return;
        await BackgroundTabScan.closeLeftoverTabs();
    },

    /** Keep the alarm in step with the chosen mode (created, re-timed or cleared). */
    async syncAlarm(mode) {
        if (typeof chrome === 'undefined' || !chrome.alarms) return;
        const period = this.periodOf(mode);
        try {
            const existing = await chrome.alarms.get(this.ALARM_NAME);
            if (!period) {
                if (existing) await chrome.alarms.clear(this.ALARM_NAME);
                await chrome.alarms.clear(this.SOON_ALARM_NAME);
            } else if (!existing || existing.periodInMinutes !== period) {
                chrome.alarms.create(this.ALARM_NAME, { delayInMinutes: period, periodInMinutes: period });
            }
        } catch (error) {
            if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn('BACKGROUND', '[HistoryWatch] Alarm update failed:', error);
        }
    },

    /** The mode now in Settings, applied to the alarm; a check that came due while the browser was closed is scheduled once. */
    async sync(catchUp = false) {
        const settings = await Utils.getHistorySettings();
        const mode = HistoryPolicy.watchModeOf(settings);
        await this.syncAlarm(mode);
        const period = this.periodOf(mode);
        if (catchUp && period && chrome.alarms) {
            const last = await this.lastState();
            if (!last || !Number.isFinite(last.at) || Date.now() - last.at >= period * 60000) {
                chrome.alarms.create(this.SOON_ALARM_NAME, { delayInMinutes: this.STARTUP_DELAY_MINUTES });
            }
        }
    },

    /** Worker-side handler for "Check now" (extension pages only, never a web page's content script). */
    registerHandlers(registry) {
        registry[this.Messages.CHECK_NOW] = ({ sender, sendResponse }) => {
            if (!MessageSender.isExtensionPage(sender)) {
                sendResponse({ status: 'error', error: 'The watchlist can only be checked from extension pages' });
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
                if (!alarm) return;
                if (alarm.name === this.ALARM_NAME) this.run('alarm').catch(() => {});
                else if (alarm.name === this.SOON_ALARM_NAME) this.run('startup').catch(() => {});
            });
        }
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.scrapfly_settings) this.sync(false).catch(() => {});
        });
        this.sync(true).catch(() => {});
        this.closeLeftoverTabs().catch(() => {});
    }
};

if (typeof self !== 'undefined') {
    self.HistoryWatch = HistoryWatch;
}
if (typeof module !== 'undefined' && module.exports) { module.exports = HistoryWatch; }
