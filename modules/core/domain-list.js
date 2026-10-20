/**
 * A list of sites as people write it, and the test "is this host on it". Pure (no browser APIs), so the popup, the
 * service worker, the content script and the tests share it. History's "don't record these sites" and the "only scan
 * these sites" list of Settings → Detection use the same rules.
 *
 *   normalize()   text (one per line, or separated by commas, semicolons or spaces) or an array as bare lowercase hosts:
 *                 protocol, credentials, port, path and a leading "*." are dropped
 *   matches()     is a host one of the listed sites, or a subdomain of one? ("notexample.com" is not "example.com")
 */
(function(root) {
  'use strict';

  /** @returns {string[]} unique hosts, in the order written */
  function normalize(input) {
    const raw = Array.isArray(input) ? input.map(String) : String(input == null ? '' : input).split(/[\s,;]+/);
    const out = [];
    for (const entry of raw) {
      let host = entry.trim().toLowerCase();
      if (!host) continue;
      host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^[^@/]*@/, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^\*\./, '').replace(/^\.+/, '').replace(/\.+$/, '');
      if (host && /^[a-z0-9._-]+$/.test(host) && !out.includes(host)) out.push(host);
    }
    return out;
  }

  /** Does `hostname` belong to one of the listed sites (the site itself or any subdomain of it)? */
  function matches(hostname, list) {
    const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
    if (!host) return false;
    return normalize(list).some(entry => host === entry || host.endsWith(`.${entry}`));
  }

  const api = { normalize, matches };
  root.DomainList = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.DomainList = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
