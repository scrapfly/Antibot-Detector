/**
 * History policy: the pure rules that decide what History records and keeps.
 * No storage and no browser APIs, so the service worker, the settings page and
 * the tests all read the same answers.
 *
 *   evaluate()          should this page be recorded at all? (paused, incognito,
 *                       excluded domain, fingerprint-only, minimum confidence)
 *   diffProtections()   which protections a page gained or lost since its last scan
 *   shouldAutoPin()     does this page pin itself? (a hard protection, or one the person named)
 *   countAutoPins()     how many entries were pinned automatically (they are capped by MAX_AUTO_PINS)
 *   watchModeOf()       the watchlist setting (off, daily or weekly); watchedOf() the entries it checks (at most MAX_WATCHED)
 *   normalizeDomains()  the "don't record these sites" list, from text or an array
 */
(function(root) {
  'use strict';

  // Loaded before this file in the popup and the worker; under Node it sits next to it
  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);
  const DomainList = root.DomainList || (typeof require === 'function' ? require('./domain-list.js') : undefined);
  const normalizeDomains = DomainList.normalize;
  const matchesDomain = DomainList.matches;

  const CHANGE_ALERT_MODES = ['off', 'pinned', 'all'];
  const BACKUP_FREQUENCIES = ['off', 'daily', 'weekly', 'monthly'];
  // Pinned entries are exempt from the limit, from retention and from the size budget, so the pages that pin
  // themselves are capped: past it a page is recorded unpinned
  const MAX_AUTO_PINS = 50;
  // A detection weaker than this does not pin a page (the engine's own default match confidence)
  const AUTO_PIN_MIN_CONFIDENCE = 80;
  // The watchlist re-scans pinned pages in the background: how often, and how many pages at most
  const WATCH_MODES = Object.freeze(['off', 'daily', 'weekly']);
  const MAX_WATCHED = 10;

  const clampInt = (value, min, max, fallback) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
  };

  const isFingerprint = (detection) => Categories.keyOf(detection) === 'fingerprint';
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

  /**
   * Does this page pin itself (Settings → History → Pin pages automatically)? Yes when a detection that reaches the
   * minimum confidence is
   *   - a hard protection (difficulty High; anti-bot or CAPTCHA, never fingerprinting), with historyAutoPinHard on, or
   *   - one of the protections the person named (historyAutoPinVendors, by name, any category).
   * @param {Array} detections  what was found on the page
   * @param {object} settings   the history settings
   */
  function shouldAutoPin(detections, settings) {
    const s = settings || {};
    const hard = s.historyAutoPinHard === true;
    const named = new Set((Array.isArray(s.historyAutoPinVendors) ? s.historyAutoPinVendors : [])
      .map(name => String(name).trim().toLowerCase()).filter(Boolean));
    if (!hard && named.size === 0) return false;
    const minimum = clampInt(s.historyAutoPinMinConfidence, 0, 100, AUTO_PIN_MIN_CONFIDENCE);
    return (Array.isArray(detections) ? detections : []).some((d) => {
      if (!(Number(d && d.confidence) >= minimum)) return false; // a detection with no score never pins
      const difficulty = String((d && (d.difficulty || (d.detector && d.detector.difficulty))) || '').toLowerCase();
      return (hard && !isFingerprint(d) && difficulty === 'high') || named.has(nameOf(d).toLowerCase());
    });
  }

  /** How many entries pinned themselves (a pin the person chose is not counted). */
  function countAutoPins(items) {
    return (Array.isArray(items) ? items : []).filter(item => item && item.pinned === true && item.autoPinned === true).length;
  }

  /** The watchlist setting: 'daily' or 'weekly', anything else is off. */
  function watchModeOf(settings) {
    const mode = settings && settings.historyWatch;
    return WATCH_MODES.includes(mode) ? mode : 'off';
  }

  /** The entries the watchlist checks: pinned and marked to watch, the one checked longest ago first, at most MAX_WATCHED. */
  function watchedOf(items) {
    return (Array.isArray(items) ? items : [])
      .filter(item => item && item.pinned === true && item.watch === true && typeof item.url === 'string' && item.url)
      .sort((a, b) => (Number(a.watchedAt) || 0) - (Number(b.watchedAt) || 0))
      .slice(0, MAX_WATCHED);
  }

  const api = {
    CHANGE_ALERT_MODES, BACKUP_FREQUENCIES, MAX_AUTO_PINS, AUTO_PIN_MIN_CONFIDENCE, WATCH_MODES, MAX_WATCHED, watchModeOf, watchedOf,
    clampInt, normalizeDomains, matchesDomain, strongest, isFingerprintOnly, evaluate,
    diffProtections, shouldAutoPin, countAutoPins
  };
  root.HistoryPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
