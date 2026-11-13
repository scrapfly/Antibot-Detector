/**
 * Pages that loaded while their capture was refused (worker only): when the page started loading, its site was skipped, left out
 * of "only these sites", or the settings could not be read.
 *
 * Nothing of such a page was kept: its response headers and Set-Cookie, request headers, POST bodies and the addresses of its
 * requests were never read (background/header-capture.js), and its JS hooks and response capture were never installed
 * (DetectionEngineManager.installHooksOrchestrator). Once its site is scanned again, a scan of the page as it is (without a
 * reload) would miss all of that and still be saved, recorded in History and sent by the webhook as if it were complete. Such a
 * page is scanned when it loads again: the paused card's Resume reloads it, a scan asked of it in place is answered "reload"
 * (DetectionEngineManager.handleRequestDetection and handlePageLoadNotification), and a scan that gets past those keeps nothing
 * (finalizeDetection).
 *
 * A page is known by its document (the id Chrome gives each one, never its address): a page brought back from the back/forward
 * cache is still the page that loaded uncaptured, and the same address loaded again is another page. The list is also kept in
 * chrome.storage.session (memory, gone when the browser closes): Chrome stops an idle worker after half a minute, and a person who
 * turns the site back on in Settings and returns to its tab wakes a new one.
 */
const UncapturedPages = {
    STORAGE_KEY: 'session_uncaptured_pages',
    MAX: 200,

    _documents: new Map(),   // documentId -> tabId, oldest first
    _pending: new Map(),     // documentId -> { tabId, refused }: a commit whose verdict is still being read
    _restored: null,         // the promise of what a worker stopped before this one stored, read once
    _writes: Promise.resolve(),

    _area() {
        return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session ? chrome.storage.session : null;
    },

    /** What a worker stopped before this one stored, read once before anything is noted or forgotten. Never rejects. */
    _restore() {
        if (!this._restored) {
            const area = this._area();
            this._restored = Promise.resolve()
                .then(() => (area ? area.get(this.STORAGE_KEY) : {}))
                .then((stored) => {
                    const saved = stored && Array.isArray(stored[this.STORAGE_KEY]) ? stored[this.STORAGE_KEY] : [];
                    for (const entry of saved) {
                        if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[0] && Number.isInteger(entry[1])) this._set(entry[0], entry[1]);
                    }
                })
                .catch(() => { /* nothing stored, or storage that does not answer: this worker's own notes still count */ });
        }
        return this._restored;
    },

    _set(documentId, tabId) {
        this._documents.delete(documentId);
        this._documents.set(documentId, tabId);
        while (this._documents.size > this.MAX) this._documents.delete(this._documents.keys().next().value);
    },

    /** The list as it is now, for the next worker; one write at a time. A write that fails costs only that. */
    _save() {
        const area = this._area();
        if (!area) return Promise.resolve();
        const run = this._writes.then(() => area.set({ [this.STORAGE_KEY]: [...this._documents] })).catch(() => {});
        this._writes = run;
        return run;
    },

    /**
     * A page committed in the tab, or a prerendered page was shown in it (header-capture.js, navigationCommitted and
     * activatePrerenderedPage). `open` is the promise of whether it may capture
     * (captureOpenFor): false, and its document is remembered. A verdict that cannot be read counts as refused, as the capture
     * itself does then.
     * @returns {Promise<void>}
     */
    noteCommit(tabId, documentId, open) {
        if (!Number.isInteger(tabId) || tabId < 0 || typeof documentId !== 'string' || !documentId) return Promise.resolve();
        const refused = Promise.resolve(open).then((value) => value === false, () => true);
        const pending = { tabId, refused };
        this._pending.set(documentId, pending);
        return refused.then(async (isRefused) => {
            await this._restore();
            if (isRefused) {
                this._set(documentId, tabId);
                await this._save();
            }
        }).finally(() => {
            if (this._pending.get(documentId) === pending) this._pending.delete(documentId);
        });
    },

    /**
     * Did the page the tab shows as this document load with its capture refused? A document that is not known (none given, or one
     * this worker and the ones before it never saw commit) is not.
     * @returns {Promise<boolean>}
     */
    async has(tabId, documentId) {
        if (typeof documentId !== 'string' || !documentId) return false;
        const pending = this._pending.get(documentId);
        if (pending && pending.tabId === tabId && await pending.refused) return true;
        await this._restore();
        return this._documents.get(documentId) === tabId;
    },

    /** The tab was closed: its pages are gone. */
    forgetTab(tabId) {
        return this._restore().then(() => {
            let changed = false;
            for (const [documentId, owner] of this._documents) {
                if (owner !== tabId) continue;
                this._documents.delete(documentId);
                changed = true;
            }
            return changed ? this._save() : undefined;
        });
    }
};

if (typeof self !== 'undefined') self.UncapturedPages = UncapturedPages;
if (typeof module !== 'undefined' && module.exports) module.exports = UncapturedPages;
