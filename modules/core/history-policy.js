/**
 * History policy: the pure rules that decide what History records and keeps.
 * No storage and no browser APIs, so the service worker, the settings page and
 * the tests all read the same answers.
 *
 *   evaluate()          should this page be recorded at all? (paused, incognito,
 *                       excluded domain, fingerprint-only, minimum confidence)
 *   diffProtections()   which protections a page gained or lost since its last scan
 *   normalizeDomains()  the "don't record these sites" list, from text or an array
 */
(function(root) {
  'use strict';

  const CHANGE_ALERT_MODES = ['off', 'pinned', 'all'];
  const BACKUP_FREQUENCIES = ['off', 'daily', 'weekly', 'monthly'];

  const clampInt = (value, min, max, fallback) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
  };

  /**
   * The "don't record these sites" list: text (one per line, or separated by commas or spaces) or an array.
   * Each entry becomes a bare lowercase host: protocol, credentials, port, path and a leading "*." are dropped.
   * @returns {string[]} unique hosts, in the order written
   */
  function normalizeDomains(input) {
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
  function matchesDomain(hostname, list) {
    const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
    if (!host) return false;
    return normalizeDomains(list).some(entry => host === entry || host.endsWith(`.${entry}`));
  }

  const categoryOf = (detection) => String((detection && (detection.category || (detection.detector && detection.detector.category))) || '').toLowerCase();
  const isFingerprint = (detection) => categoryOf(detection).includes('fingerprint');
  const nameOf = (detection) => String((detection && ((detection.detector && detection.detector.name) || detection.name)) || '').trim();

  /** The highest confidence among a page's detections (0 when none is scored). */
  function strongest(detections) {
    return (Array.isArray(detections) ? detections : []).reduce((max, d) => {
      const c = Number(d && d.confidence);
      return Number.isFinite(c) && c > max ? c : max;
    }, 0);
  }

  /** True when every detection is a fingerprinting technique. */
  function isFingerprintOnly(detections) {
    const list = Array.isArray(detections) ? detections : [];
    return list.length > 0 && list.every(isFingerprint);
  }

  /**
   * Should this page be recorded?
   * @param {{detections: Array, hostname: string, incognito: boolean}} page
   * @param {object} settings  the history settings (Utils.getHistorySettings)
   * @returns {{save: boolean, reason?: string}}
   */
  function evaluate(page, settings) {
    const s = settings || {};
    if (s.historyEnabled === false) return { save: false, reason: 'paused' };
    if (s.historySkipIncognito !== false && page && page.incognito === true) return { save: false, reason: 'incognito' };
    if (page && matchesDomain(page.hostname, s.historyExcludedDomains)) return { save: false, reason: 'excluded' };
    const detections = (page && page.detections) || [];
    if (s.historySkipFingerprintOnly === true && isFingerprintOnly(detections)) return { save: false, reason: 'fingerprint-only' };
    const min = clampInt(s.historyMinConfidence, 0, 100, 0);
    if (min > 0 && strongest(detections) < min) return { save: false, reason: 'low-confidence' };
    return { save: true };
  }

  /**
   * The protections (anti-bot and CAPTCHA, never fingerprinting) a page gained or lost between two scans.
   * Names compare case-insensitively; the result keeps the names as written.
   * @returns {{added: string[], removed: string[], changed: boolean}}
   */
  function diffProtections(before, after) {
    const index = (detections) => {
      const map = new Map();
      for (const d of (Array.isArray(detections) ? detections : [])) {
        const name = nameOf(d);
        if (name && !isFingerprint(d) && !map.has(name.toLowerCase())) map.set(name.toLowerCase(), name);
      }
      return map;
    };
    const was = index(before), is = index(after);
    const added = [...is].filter(([key]) => !was.has(key)).map(([, name]) => name);
    const removed = [...was].filter(([key]) => !is.has(key)).map(([, name]) => name);
    return { added, removed, changed: added.length > 0 || removed.length > 0 };
  }

  const api = {
    CHANGE_ALERT_MODES, BACKUP_FREQUENCIES,
    clampInt, normalizeDomains, matchesDomain, strongest, isFingerprintOnly, evaluate,
    diffProtections
  };
  root.HistoryPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
