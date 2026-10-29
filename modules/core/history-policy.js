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

  // A protection counts as there from SURE up, and as gone only below MAYBE: a 10% mention of a vendor's name, or a
  // score that moves around one line between visits, is not a change
  const CHANGE_SURE = 50;
  const CHANGE_MAYBE = 25;
  // A change undone by the scan that follows it is a blip (a script that loaded once, a challenge shown once) only when
  // that scan comes soon after: a page that kept the change for days and then lost it again changed twice
  const BLIP_WINDOW_MS = 24 * 60 * 60 * 1000;
  const scoreOf = (d) => {
    const c = Number(d && d.confidence);
    return Number.isFinite(c) ? c : 100; // entries saved without a score count as found
  };

  /**
   * The protections (anti-bot and CAPTCHA, never fingerprinting) a page gained or lost between two scans: added when it
   * is found now at CHANGE_SURE or more and was not found before (or below CHANGE_MAYBE); removed the other way round.
   * Names compare case-insensitively; the result keeps the names as written.
   * @returns {{added: string[], removed: string[], changed: boolean}}
   */
  function diffProtections(before, after) {
    const index = (detections, min) => {
      const map = new Map();
      for (const d of (Array.isArray(detections) ? detections : [])) {
        const name = nameOf(d);
        if (!name || isFingerprint(d) || scoreOf(d) < min) continue;
        const key = Categories.protectionKey(name);
        if (!map.has(key)) map.set(key, name);
      }
      return map;
    };
    const wasSure = index(before, CHANGE_SURE), wasSeen = index(before, CHANGE_MAYBE);
    const isSure = index(after, CHANGE_SURE), isSeen = index(after, CHANGE_MAYBE);
    const added = [...isSure].filter(([key]) => !wasSeen.has(key)).map(([, name]) => name);
    const removed = [...wasSure].filter(([key]) => !isSeen.has(key)).map(([, name]) => name);
    return { added, removed, changed: added.length > 0 || removed.length > 0 };
  }

  /** Protections found for sure (CHANGE_SURE or more): a scan without any cannot take one away from the page's record. */
  function hasSureProtection(detections) {
    return (Array.isArray(detections) ? detections : []).some(d => nameOf(d) && !isFingerprint(d) && scoreOf(d) >= CHANGE_SURE);
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
      .map(name => Categories.protectionKey(name)).filter(Boolean));
    if (!hard && named.size === 0) return false;
    const minimum = clampInt(s.historyAutoPinMinConfidence, 0, 100, AUTO_PIN_MIN_CONFIDENCE);
    return (Array.isArray(detections) ? detections : []).some((d) => {
      if (!(Number(d && d.confidence) >= minimum)) return false; // a detection with no score never pins
      const difficulty = String((d && (d.difficulty || (d.detector && d.detector.difficulty))) || '').toLowerCase();
      return (hard && !isFingerprint(d) && difficulty === 'high') || named.has(Categories.protectionKey(nameOf(d)));
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
  const lastTry = (item) => Math.max(Number(item.watchedAt) || 0, Number(item.watchAttemptAt) || 0);

  function watchedOf(items) {
    return (Array.isArray(items) ? items : [])
      // Only web pages are visited (an entry from an old build or an edited file may hold any address)
      .filter(item => item && item.pinned === true && item.watch === true && typeof item.url === 'string' && /^https?:\/\//i.test(item.url))
      // The least recently tried first: a page that keeps failing has its tries counted too, so it cannot keep the
      // others from ever being checked
      .sort((a, b) => lastTry(a) - lastTry(b))
      .slice(0, MAX_WATCHED);
  }

  const api = {
    CHANGE_ALERT_MODES, BACKUP_FREQUENCIES, MAX_AUTO_PINS, AUTO_PIN_MIN_CONFIDENCE, WATCH_MODES, MAX_WATCHED, watchModeOf, watchedOf,
    clampInt, normalizeDomains, matchesDomain, strongest, isFingerprintOnly, evaluate,
    diffProtections, hasSureProtection, CHANGE_SURE, CHANGE_MAYBE, BLIP_WINDOW_MS, shouldAutoPin, countAutoPins
  };
  root.HistoryPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
