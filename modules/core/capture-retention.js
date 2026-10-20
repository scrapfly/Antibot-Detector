/**
 * How long Advanced keeps a capture (Settings → Detection → Keep tool captures for): the default, the limits,
 * the one reader of the saved value and the words that describe it. Pure (no browser APIs), so the popup, the
 * service worker, the stats page and the tests share it. The worker, the Advanced footer and Settings each had
 * their own reader, and they disagreed about a value outside the limits.
 *
 *   DEFAULT_MINUTES, MIN_MINUTES, MAX_MINUTES   30 minutes, 1 minute, one week
 *   minutesOf()   the saved value as whole minutes: anything that is not a usable number (or is below one
 *                 minute) is the default, a value above a week is a week
 *   label()       "15 minutes", "1 hour", "3 days" as Settings words it, translated through tr(key, fallback)
 */
(function(root) {
  'use strict';

  const DEFAULT_MINUTES = 30;
  const MIN_MINUTES = 1;
  const MAX_MINUTES = 10080;

  // The common choices have their own wording (Settings → Keep tool captures for); any other value is "<n> <unit>"
  const KNOWN = Object.freeze({
    15: ['settingsCaptureRetention15m', '15 minutes'], 30: ['settingsCaptureRetention30m', '30 minutes'],
    60: ['settingsCaptureRetention1h', '1 hour'], 180: ['settingsCaptureRetention3h', '3 hours'],
    720: ['settingsCaptureRetention12h', '12 hours'], 1440: ['settingsCaptureRetention24h', '24 hours']
  });

  function minutesOf(value) {
    const minutes = Math.round(Number(value));
    if (!Number.isFinite(minutes) || minutes < MIN_MINUTES) return DEFAULT_MINUTES;
    return Math.min(MAX_MINUTES, minutes);
  }

  function label(minutes, tr) {
    const known = KNOWN[minutes];
    if (known) return tr(known[0], known[1]);
    if (minutes % 1440 === 0) return `${minutes / 1440} ${tr('timeUnitDays', 'Days').toLowerCase()}`;
    if (minutes % 60 === 0) return `${minutes / 60} ${tr('timeUnitHours', 'Hours').toLowerCase()}`;
    return `${minutes} ${tr('timeUnitMinutes', 'Minutes').toLowerCase()}`;
  }

  const api = { DEFAULT_MINUTES, MIN_MINUTES, MAX_MINUTES, minutesOf, label };
  root.CaptureRetention = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.CaptureRetention = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
