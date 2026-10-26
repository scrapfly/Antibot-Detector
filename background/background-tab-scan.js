/**
 * Background-tab scans (service worker): a page opened in an inactive tab of a normal window, scanned like any page,
 * and closed. Shared by the History watchlist (background/history-watch.js) and Bulk scan (background/bulk-scan-runner.js).
 *
 * Why a real tab: the scan needs a page that runs (its scripts, hooks and requests), and an offscreen document cannot
 * give one. So a scan is a visit with the person's cookies, and it never touches the tab the person is using.
 *
 *   scan(url, options)     open, wait for the extension's scan of the page (or the time limit, a load error, a cancel),
 *                          close; the cached result of the page is set aside meanwhile (DetectionEngineManager.bypassCache),
 *                          or the cache would answer and nothing would be scanned
 *   isScanTab(), ownerOf(), isQuiet()
 *                          what the scan pipeline asks of a tab: a quiet scan (the watchlist) leaves nothing of its own
 *                          (no History entry, no webhook); the others (Bulk scan) are recorded like any page
 *   scanFinished(tabId, url, results, extra)
 *                          the scan pipeline hands the finished results over (extra.excluded: the page ended on a site the
 *                          "Sites to scan" setting skips, so nothing was kept)
 *   cancel(token)          give up a scan now (Bulk scan → Stop): its tab is closed at once
 *   closeLeftoverTabs()    the tabs a stopped worker left open (listed in session storage), closed when it starts again
 */
const BackgroundTabScan = {
    OPEN_TABS_KEY: 'session_background_scan_tabs',
    LEGACY_TABS_KEYS: ['session_history_watch_tabs'],
    DEFAULT_TIMEOUT_MS: 45000,

    _tabs: new Map(),     // tabId -> { url, owner, quiet }
    _waiters: new Map(),  // tabId -> { resolve, token }
    _initialized: false,

    isScanTab(tabId) {
        return this._tabs.has(tabId);
    },

    ownerOf(tabId) {
        const entry = this._tabs.get(tabId);
        return entry ? entry.owner : null;
    },

    isQuiet(tabId) {
        const entry = this._tabs.get(tabId);
        return !!(entry && entry.quiet);
    },

    /** Called by the scan pipeline when the page of a scan tab is finished. */
    scanFinished(tabId, url, results, extra = {}) {
        const waiter = this._waiters.get(tabId);
        if (waiter) waiter.resolve({ ok: true, url, results: Array.isArray(results) ? results : [], ...(extra && extra.excluded ? { excluded: true } : {}) });
    },

    /** Give up the scan that carries this token (its tab closes right away). */
    cancel(token) {
        if (!token) return;
        token.cancelled = true;
        for (const waiter of this._waiters.values()) {
            if (waiter.token === token) waiter.resolve({ ok: false, error: 'cancelled' });
        }
    },

    /** A normal (not private) window to open a scan tab in, or null when the browser has none open. */
    async normalWindowId() {
        if (typeof chrome === 'undefined' || !chrome.windows || !chrome.windows.getAll) return null;
        const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
        const window = windows.find(w => w && w.incognito !== true);
        return window ? window.id : null;
    },

    /**
     * Open the address in a background tab and wait for the extension's scan of it.
     * @param {string} url
     * @param {{windowId: number, timeoutMs?: number, owner?: string, quiet?: boolean, token?: {cancelled?: boolean}}} options
     * @returns {Promise<{ok: boolean, url?: string, results?: Array, excluded?: boolean, error?: 'timeout'|'load'|'cancelled'|string}>}
     */
    async scan(url, options = {}) {
        const { windowId, owner = 'scan', quiet = false, token = null } = options;
        const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : this.DEFAULT_TIMEOUT_MS;
        if (token && token.cancelled) return { ok: false, error: 'cancelled' };
        DetectionEngineManager.bypassCache(url);
        let tab = null;
        let timer = null;
        try {
            tab = await chrome.tabs.create({ url, active: false, windowId });
            this._tabs.set(tab.id, { url, owner, quiet: !!quiet });
            const finished = new Promise(resolve => this._waiters.set(tab.id, { resolve, token }));
            if (token && token.cancelled) return { ok: false, error: 'cancelled' };
            await this.rememberTab(tab.id, true);
            const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), timeoutMs); });
            return await Promise.race([finished, timeout]);
        } catch (error) {
            return { ok: false, error: String((error && error.message) || error) };
        } finally {
            clearTimeout(timer);
            DetectionEngineManager.restoreCache(url);
            if (tab) {
                this._tabs.delete(tab.id);
                this._waiters.delete(tab.id);
                await chrome.tabs.remove(tab.id).catch(() => {});
                await this.rememberTab(tab.id, false);
            }
        }
    },

    /** A page that could not load (no such host, refused, offline) fails now instead of at the time limit. */
    loadFailed(details) {
        if (!details || details.frameId !== 0 || !this._waiters.has(details.tabId)) return;
        // A navigation replaced by another one (a redirect made by the page's script) is not a failure
        if (/ERR_ABORTED/.test(String(details.error || ''))) return;
        this._waiters.get(details.tabId).resolve({ ok: false, error: 'load' });
    },

    /**
     * The scan tabs that are open, kept in session storage (memory, gone with the browser): a worker stopped in the
     * middle of a scan comes back without its timers, and closes the tab it left (init)
     */
    async rememberTab(tabId, open) {
        const area = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session;
        if (!area) return;
        try {
            const stored = (await area.get(this.OPEN_TABS_KEY))[this.OPEN_TABS_KEY];
            const ids = new Set(Array.isArray(stored) ? stored : []);
            if (open) ids.add(tabId); else ids.delete(tabId);
            await area.set({ [this.OPEN_TABS_KEY]: [...ids] });
        } catch (_) { /* a convenience: the scan itself does not depend on it */ }
    },

    async closeLeftoverTabs() {
        const area = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session;
        if (!area || this._tabs.size > 0) return;
        try {
            for (const key of [this.OPEN_TABS_KEY, ...this.LEGACY_TABS_KEYS]) {
                const stored = (await area.get(key))[key];
                for (const id of Array.isArray(stored) ? stored : []) await chrome.tabs.remove(id).catch(() => {});
                await area.remove(key);
            }
        } catch (_) { /* nothing to close */ }
    },

    /** Register listeners synchronously (MV3 cold starts) and close what a stopped worker left open. */
    init() {
        if (this._initialized || typeof chrome === 'undefined') return;
        this._initialized = true;
        if (chrome.webNavigation && chrome.webNavigation.onErrorOccurred) {
            chrome.webNavigation.onErrorOccurred.addListener((details) => this.loadFailed(details));
        }
        this.closeLeftoverTabs().catch(() => {});
    }
};

if (typeof self !== 'undefined') {
    self.BackgroundTabScan = BackgroundTabScan;
}
if (typeof module !== 'undefined' && module.exports) { module.exports = BackgroundTabScan; }
