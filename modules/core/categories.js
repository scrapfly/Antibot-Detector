/**
 * The detection categories, written once: their keys, names, default colours, default difficulty, and
 * the one function that turns any spelling of a category into its key. Pure (no browser APIs), so the
 * popup, the service worker and the tests share it.
 *
 *   KEYS                 ['antibot', 'captcha', 'fingerprint'], in the default display order
 *   KEYS_AND_OTHER       the same plus 'other', every group a detection can fall into (charts, counters)
 *   NAMES                the names the detector files use ('Anti-Bot', 'CAPTCHA', 'Fingerprint')
 *   DEFAULT_COLORS       the colours Settings → Category colours starts from
 *   LABELS               [i18n key, English text] of each key, 'other' included
 *   normalize()          a category written any way ("Anti-Bot", "ANTIBOT") as its lower-case letters
 *   keyOf()              'antibot' | 'captcha' | 'fingerprint' | 'other' for a category name, a detector
 *                        or a detection: how detections are grouped
 *   builtIn()            the built-in category a value names exactly ('Anti-Bot', 'anti-bot',
 *                        'fingerprinting'), or '' for a custom one
 *   labelOf()            [i18n key, English text] of a built-in category, null for a custom one: a
 *                        custom category is shown with the text its author wrote
 *   defaultDifficulty()  the difficulty a detector of that category has when it names none
 *   badgeClass()         the CSS class of a category's badge ('primary' for anything else)
 *
 * Anything with "bot" or "waf" in it counts as anti-bot, so a custom "WAF" detector is listed with them.
 */
(function(root) {
  'use strict';

  const KEYS = Object.freeze(['antibot', 'captcha', 'fingerprint']);
  const KEYS_AND_OTHER = Object.freeze([...KEYS, 'other']);
  const NAMES = Object.freeze({ antibot: 'Anti-Bot', captcha: 'CAPTCHA', fingerprint: 'Fingerprint' });
  const DEFAULT_COLORS = Object.freeze({ antibot: '#FF5733', captcha: '#33C3FF', fingerprint: '#3b82f6' });
  const LABELS = Object.freeze({
    antibot: Object.freeze(['categoryAntibot', 'Anti-bot']),
    captcha: Object.freeze(['categoryCaptcha', 'Captcha']),
    fingerprint: Object.freeze(['categoryFingerprint', 'Fingerprint']),
    other: Object.freeze(['statsCategoryOther', 'Other'])
  });
  const ALIASES = Object.freeze({ fingerprinting: 'fingerprint' });
  const DEFAULT_DIFFICULTY = Object.freeze({ antibot: 'Medium', captcha: 'High', fingerprint: 'Low' });

  // A detection keeps its category on itself or under `detector`; a plain string is the category
  const rawOf = (value) => (value && typeof value === 'object' ? (value.category || (value.detector && value.detector.category)) : value);

  function normalize(value) {
    return String(rawOf(value) || '').toLowerCase().replace(/[^a-z]/g, '');
  }

  function keyOf(value) {
    const letters = normalize(value);
    if (letters.includes('captcha')) return 'captcha';
    if (letters.includes('fingerprint')) return 'fingerprint';
    if (letters.includes('antibot') || letters.includes('bot') || letters.includes('waf')) return 'antibot';
    return 'other';
  }

  function builtIn(value) {
    const letters = normalize(value);
    const key = ALIASES[letters] || letters;
    return KEYS.includes(key) ? key : '';
  }

  const labelOf = (value) => LABELS[builtIn(value)] || null;
  const defaultDifficulty = (value) => DEFAULT_DIFFICULTY[keyOf(value)] || 'Medium';
  const badgeClass = (value) => { const key = keyOf(value); return KEYS.includes(key) ? key : 'primary'; };

  // One protection under the names it has had: History, the watchlist, Compare and Statistics match saved entries
  // by name, so a renamed detector must not read as one protection gone and another found
  const PROTECTION_ALIASES = Object.freeze({ 'human (perimeterx)': 'perimeterx', 'human security': 'perimeterx', 'human': 'perimeterx' });
  /** The key two names of the same protection share (case-insensitive, renames included). */
  const protectionKey = (name) => {
    const key = String(name || '').trim().toLowerCase();
    return PROTECTION_ALIASES[key] || key;
  };

  const api = { KEYS, KEYS_AND_OTHER, NAMES, DEFAULT_COLORS, LABELS, normalize, keyOf, builtIn, labelOf, defaultDifficulty, badgeClass, protectionKey };
  root.Categories = api;
  // The other modules name it as a plain global: a page or a worker has one (self is globalThis), a test sandbox may not
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.Categories = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
