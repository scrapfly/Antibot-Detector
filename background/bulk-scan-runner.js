/**
 * Bulk scan (service worker): the pages of a list, scanned one at a time in a background tab (BackgroundTabScan, the
 * watchlist's machinery), never in the tab the person is using. The page (sections/bulk/bulk.html) only starts and
 * steers a run: the run lives here, so closing the popup or the page does not stop it, and its state is kept in
 * chrome.storage.session (STATE_KEY) where the page reads it again when it is reopened.
 *
 * Each finished page goes through the scan pipeline like any visited page: the cache, History (with the person's
 * History settings: paused, ignored sites, duplicates) and the webhook. Nothing here writes History.
 *
 * A worker that stops in the middle of a run (Chrome restarts it, the extension is updated) loses the loop: when it
 * starts again, the run it finds in session storage is marked stopped (BulkScan.recover), never left "running", and
 * the scan tab it left open is closed (BackgroundTabScan.closeLeftoverTabs).
 */
const BulkScanRunner = {
    STATE_KEY: 'session_bulk_scan',
    OWNER: 'bulk',
    GAP_MS: 600,              // between two pages
    KEEPALIVE_ID: 'bulk-scan',

    _run: null,
    _loop: null,
    _token: null,             // the scan in progress (cancel on Stop)
    _wake: null,              // resolves a paused loop
    _initialized: false,
    _ready: null,             // the stored run, recovered once per worker start

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    area() {
        return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session ? chrome.storage.session : null;
    },

    async save() {
        const area = this.area();
        if (!area) return;
        try {
            if (this._run) await area.set({ [this.STATE_KEY]: this._run });
            else await area.remove(this.STATE_KEY);
        } catch (error) {
            if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn('BACKGROUND', '[BulkScan] State not saved:', error);
        }
    },

    /** The run this worker knows: on its first call after a start, the stored one, stopped if it was running. */
    ready() {
        if (!this._ready) {
            this._ready = (async () => {
                const area = this.area();
                if (!area || this._run) return;
                try {
                    const stored = (await area.get(this.STATE_KEY))[this.STATE_KEY];
                    const wasActive = BulkScan.isActive(stored);
                    const run = BulkScan.recover(stored);
                    if (!run || this._run) return;
                    this._run = run;
                    if (wasActive) await this.save();
                } catch (_) { /* no stored run */ }
            })();
        }
        return this._ready;
    },

    async state() {
        await this.ready();
        return this._run;
    },

    /** The "Sites to scan" setting, as a test of one address. */
    async scopeTest() {
        const settings = await Utils.getSettings();
        const legacy = settings && settings.blacklistedDomains ? { blacklistedDomains: settings.blacklistedDomains } : {};
        const detection = { ...legacy, ...((settings && settings.detection) || {}) };
        return (url) => ScanScope.isExcluded(url, detection);
    },

    async extensionOn() {
        const flags = await chrome.storage.local.get(['scrapfly_enabled']);
        return flags.scrapfly_enabled !== false;
    },

    /**
     * A new run. With `continueRun`, a run that was stopped goes on: its waiting pages are scanned and the pages it
     * already finished stay in the list with their results (the run's own state is the source, not the page's copy).
     * @param {{entries: Array<string|{url: string, reason: string}>, timeoutSec?: number, cap?: number, continueRun?: boolean}} request
     * @returns {Promise<{ok: boolean, run?: object, error?: 'busy'|'off'|'empty'|'no_window'}>}
     */
    start(request = {}) {
        // One start at a time: two pages starting together would both see no run and the second would replace the first
        const next = (this._starting || Promise.resolve()).then(() => this._start(request));
        this._starting = next.catch(() => {});
        return next;
    },

    async _start(request) {
        await this.ready();
        if (BulkScan.isActive(this._run)) return { ok: false, error: 'busy' };
        if (!await this.extensionOn()) return { ok: false, error: 'off' };
        const resumed = request.continueRun === true ? BulkScan.continuation(this._run) : null;
        const entries = resumed ? resumed.entries : (Array.isArray(request.entries) ? request.entries.slice(0, 5000) : []);
        const prepared = BulkScan.prepare(entries, { cap: request.cap, isExcluded: await this.scopeTest() });
        const run = BulkScan.createRun(prepared, { timeoutSec: request.timeoutSec, cap: request.cap });
        if (resumed) BulkScan.carryOver(run, resumed);
        if (BulkScan.nextWaiting(run) === -1) {
            // Nothing to scan: the list is shown with its reasons, and the run is over before it began
            BulkScan.complete(run);
            this._run = run;
            await this.save();
            return { ok: true, run, error: 'empty' };
        }
        if (await BackgroundTabScan.normalWindowId() === null) return { ok: false, error: 'no_window' };
        this._run = run;
        await this.save();
        this._startLoop();
        return { ok: true, run };
    },

    _startLoop() {
        if (this._loop) return;
        const keepalive = typeof workerKeepaliveManager !== 'undefined' && workerKeepaliveManager ? workerKeepaliveManager : null;
        // A run takes minutes: Chrome stops an idle worker after about 30 s, which would end the run and leave its tab
        if (keepalive) keepalive.startOperation(this.KEEPALIVE_ID, { reason: 'bulk_scan' });
        const looped = this._run;
        this._loop = this._runLoop().catch((error) => {
            if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn('BACKGROUND', '[BulkScan] Run failed:', error);
            if (BulkScan.stop(this._run, 'error')) return this.save();
            return undefined;
        }).finally(() => {
            this._loop = null;
            this._token = null;
            if (keepalive) keepalive.endOperation(this.KEEPALIVE_ID);
            // A run started while this loop was still winding down (Stop, then Scan the waiting pages) gets its own loop
            if (this._run !== looped && BulkScan.isActive(this._run)) this._startLoop();
        });
    },

    async _runLoop() {
        const run = this._run;
        let first = true;
        while (this._run === run) {
            if (run.status === 'paused') {
                await new Promise(resolve => { this._wake = resolve; });
                this._wake = null;
                continue;
            }
            if (run.status !== 'running') break;
            const index = BulkScan.nextWaiting(run);
            if (index === -1) {
                BulkScan.complete(run);
                await this.save();
                break;
            }
            if (!first) await this.sleep(this.GAP_MS);
            first = false;
            if (run.status !== 'running') continue;
            await this._scanOne(run, index);
        }
    },

    /** One page: checks that still hold now (the person may have changed a setting meanwhile), the visit, its outcome. */
    async _scanOne(run, index) {
        const item = run.items[index];
        // Stop may come during any of the awaits below: the token tells the scan not to open (or to close) its tab
        const token = { cancelled: false };
        this._token = token;
        if (!await this.extensionOn()) {
            BulkScan.stop(run, 'off');
            await this.save();
            return;
        }
        if ((await this.scopeTest())(item.url)) {
            BulkScan.skip(run, index, 'scope');
            await this.save();
            return;
        }
        const windowId = await BackgroundTabScan.normalWindowId();
        if (windowId === null) {
            BulkScan.stop(run, 'no_window');
            await this.save();
            return;
        }
        if (!BulkScan.begin(run, index)) return; // paused or stopped meanwhile: the loop decides what comes next
        await this.save();
        const outcome = await BackgroundTabScan.scan(item.url, { windowId, timeoutMs: run.timeoutSec * 1000, owner: this.OWNER, token });
        this._token = null;
        // Stopped meanwhile: the page went back to waiting with the rest
        if (run.status === 'stopped' || this._run !== run || item.status !== 'scanning') return;
        if (outcome.ok && outcome.excluded) {
            BulkScan.skip(run, index, 'scope');
        } else if (outcome.ok) {
            const summary = BulkScan.summarize(outcome.results, (results) => DetectionUtils.getDifficultyLevel(results));
            BulkScan.finish(run, index, { ...summary, finalUrl: outcome.url });
        } else {
            BulkScan.fail(run, index, outcome.error === 'timeout' || outcome.error === 'load' ? outcome.error : 'error');
        }
        await this.save();
    },

    async pause() {
        await this.ready();
        const changed = BulkScan.pause(this._run);
        if (changed) await this.save();
        return changed;
    },

    async resume() {
        await this.ready();
        if (!BulkScan.resume(this._run)) return false;
        await this.save();
        if (this._wake) this._wake();
        else this._startLoop(); // paused by a worker that is gone: nothing waits, so a new loop takes it on
        return true;
    },

    async stop(reason = 'user') {
        await this.ready();
        if (!BulkScan.stop(this._run, reason)) return false;
        await this.save();
        if (this._token) BackgroundTabScan.cancel(this._token);
        if (this._wake) this._wake();
        return true;
    },

    /** Forget a run that is over (New list). */
    async clear() {
        await this.ready();
        if (BulkScan.isActive(this._run)) return false;
        this._run = null;
        await this.save();
        return true;
    },

    /** Worker-side handlers: extension pages only, never a web page's content script. */
    registerHandlers(registry) {
        const guarded = (work) => ({ request, sender, sendResponse }) => {
            if (!MessageSender.isExtensionPage(sender)) {
                sendResponse({ status: 'error', error: 'Bulk scan can only be used from extension pages' });
                return false;
            }
            Promise.resolve(work(request || {}))
                .then(result => sendResponse({ status: result && result.ok === false ? 'error' : 'ok', ...result }))
                .catch(error => sendResponse({ status: 'error', error: String((error && error.message) || error) }));
            return true;
        };
        registry[WorkerMessages.BULK_SCAN_START] = guarded(request => this.start(request));
        registry[WorkerMessages.BULK_SCAN_PAUSE] = guarded(async () => ({ ok: await this.pause(), run: this._run }));
        registry[WorkerMessages.BULK_SCAN_RESUME] = guarded(async () => ({ ok: await this.resume(), run: this._run }));
        registry[WorkerMessages.BULK_SCAN_STOP] = guarded(async () => ({ ok: await this.stop('user'), run: this._run }));
        registry[WorkerMessages.BULK_SCAN_STATE] = guarded(async () => ({ ok: true, run: await this.state() }));
        registry[WorkerMessages.BULK_SCAN_CLEAR] = guarded(async () => ({ ok: await this.clear(), run: this._run }));
    },

    /** At every worker start: a run left by the worker before this one is marked stopped. */
    init() {
        if (this._initialized || typeof chrome === 'undefined' || !chrome.storage) return;
        this._initialized = true;
        this.ready().catch(() => {});
    }
};

if (typeof self !== 'undefined') {
    self.BulkScanRunner = BulkScanRunner;
}
if (typeof module !== 'undefined' && module.exports) { module.exports = BulkScanRunner; }
