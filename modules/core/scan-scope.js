/**
 * Which pages the extension scans (Settings → Detection → Sites), and where it watches the page's API calls. Two modes:
 *
 *   blocklist  every site except the skipped ones (the default): a skipped site is an exact host
 *   allowlist  only the chosen sites: a site and its subdomains
 *
 * Pure (no browser APIs), so the popup, the service worker, the content script and the tests share it. A page that is
 * not a web page (the browser's own pages, this extension's pages) is neither skipped nor chosen: it is never scanned
 * for a reason that has nothing to do with these lists.
 *
 *   MODES, modeOf()   the two modes, and the one a detection-settings object is in
 *   listKeyOf()       the setting that holds the list the person edits in that mode
 *   isExcluded()      true when the page is not scanned because of the mode and its list
 *   SITE_LIST_KEYS    every list of sites in the detection settings: skipped, chosen, and the sites without JS hooks
 *   hooksOff()        true when JS hooks are off on a site (a scanned site where the page's API calls are not watched)
 */
(function(root) {
  'use strict';

  const MODES = Object.freeze(['blocklist', 'allowlist']);
  const LIST_KEYS = Object.freeze({ blocklist: 'blacklistedDomains', allowlist: 'allowedDomains' });
  const SITE_LIST_KEYS = Object.freeze([LIST_KEYS.blocklist, LIST_KEYS.allowlist, 'hooksOffDomains']);

  const modeOf = (detection) => (detection && detection.scanMode === 'allowlist' ? 'allowlist' : 'blocklist');
  const listKeyOf = (detection) => LIST_KEYS[modeOf(detection)];

  /** @param {string} url  @param {object} [detection]  the detection settings: { scanMode, blacklistedDomains, allowedDomains } */
  function isExcluded(url, detection) {
    if (!url) return false;
    let parsed;
    try { parsed = new URL(url); } catch (_) { return false; }
    const d = detection || {};
    if (modeOf(d) === 'allowlist') {
      if (!/^https?:$/.test(parsed.protocol)) return false;
      return !root.DomainList.matches(parsed.hostname, d.allowedDomains);
    }
    const blocked = Array.isArray(d.blacklistedDomains) ? d.blacklistedDomains : [];
    return blocked.includes(parsed.hostname);
  }

  /** Is `hostname` a site (or a subdomain of one) where JS hooks are off? @param {object} [detection] the detection settings */
  function hooksOff(detection, hostname) {
    return root.DomainList.matches(hostname, detection && detection.hooksOffDomains);
  }

  const api = { MODES, LIST_KEYS, SITE_LIST_KEYS, modeOf, listKeyOf, isExcluded, hooksOff };
  root.ScanScope = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.ScanScope = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
