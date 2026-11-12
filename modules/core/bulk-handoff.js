/**
 * History → Select entries → Bulk scan: the addresses of the selected entries, handed to the Bulk scan page. Pure (no browser
 * APIs): the popup, the page and the tests share it.
 *
 * The popup writes the hand-over to chrome.storage.session under KEY (memory only, readable by the extension's own pages) and
 * opens the page the usual way; the page takes it once and removes it, when it opens or, if it was open already, when it
 * arrives. A hand-over older than MAX_AGE_MS is not used: one the page never took (it failed to open) must not fill a list
 * that is opened later from the "…" menu. The 200-page cap and "Sites to scan" are not applied here: the worker applies them
 * when the run starts, as it does to a list typed on the page.
 *
 *   KEY          the session storage key
 *   MAX_AGE_MS   how long a hand-over waits for the page
 *   create()     the hand-over for some History entries: their addresses, each once, in the order given, and when it was made
 *   read()       the addresses of a stored hand-over, or null when there is none, it is too old or it is not one
 */
(function(root) {
  'use strict';

  const KEY = 'session_bulk_from_history';
  const MAX_AGE_MS = 60 * 1000;
  // What the page hands the worker at most (sections/bulk/bulk.js, SITEMAP_MAX_URLS); the worker cuts a run to its own cap
  const MAX_URLS = 5000;

  /** Each address once, in order; anything that is not a non-empty text is left out. */
  function unique(values) {
    const seen = new Set();
    const urls = [];
    for (const value of Array.isArray(values) ? values : []) {
      const url = typeof value === 'string' ? value.trim() : '';
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      if (urls.length >= MAX_URLS) break;
    }
    return urls;
  }

  /**
   * @param {Array<{url?: string}>} items - History entries, in the order the list shows them
   * @param {number} [now]
   * @returns {{urls: string[], at: number}}
   */
  function create(items, now = Date.now()) {
    return { urls: unique((Array.isArray(items) ? items : []).map(item => (item && item.url))), at: now };
  }

  /**
   * @param {*} value - What session storage holds under KEY
   * @param {number} [now]
   * @returns {?string[]}
   */
  function read(value, now = Date.now()) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.urls)) return null;
    const at = Number(value.at);
    if (!Number.isFinite(at) || Math.abs(now - at) > MAX_AGE_MS) return null;
    const urls = unique(value.urls);
    return urls.length ? urls : null;
  }

  const api = Object.freeze({ KEY, MAX_AGE_MS, MAX_URLS, create, read });
  root.BulkHandoff = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.BulkHandoff = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
