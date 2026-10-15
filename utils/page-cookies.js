/**
 * The cookies a page sends. chrome.cookies.getAll({ url }) leaves out cookies
 * set with the Partitioned attribute (CHIPS), such as Cloudflare's
 * cf_clearance; given the tab, the page's own partition is read as well.
 * Partitions of other sites that embed this host are not this page's cookies,
 * so they stay out.
 */
(function (global) {
    /** The tab's top-frame partition key, or null where Chrome has no getPartitionKey (before 132). */
    async function partitionKey(tabId) {
        if (!Number.isInteger(tabId) || typeof chrome.cookies.getPartitionKey !== 'function') return null;
        try {
            const result = await chrome.cookies.getPartitionKey({ tabId, frameId: 0 });
            return (result && result.partitionKey) || null;
        } catch (_) {
            return null;
        }
    }

    /**
     * @param {{ url: string, name?: string }} details - as for chrome.cookies.getAll
     * @param {number} [tabId] - the page's tab, to include its partitioned cookies
     */
    async function getAll(details, tabId) {
        const cookies = await chrome.cookies.getAll(details);
        const key = await partitionKey(tabId);
        if (!key) return cookies;
        try {
            const partitioned = await chrome.cookies.getAll({ ...details, partitionKey: key });
            return cookies.concat(partitioned.filter(cookie => cookie.partitionKey));
        } catch (_) {
            return cookies;
        }
    }

    /** Deletes a cookie that getAll returned, from its own partition. */
    function remove(url, cookie) {
        return chrome.cookies.remove({ url, name: cookie.name, ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}) });
    }

    global.PageCookies = Object.freeze({ getAll, remove, partitionKey });
    if (typeof module !== 'undefined' && module.exports) module.exports = global.PageCookies;
})(globalThis);
