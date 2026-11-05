/**
 * History tab: which entries the search box and the filter chips leave on the list.
 * Pure (no browser APIs), so the popup and the tests share it.
 *
 *   isChanged()          an entry whose protections differ from its earlier scan (what the Changed badge shows)
 *   firedCombinations()  the combinations that fired on a page (what the card counts after the fingerprint total)
 *   hasCombinations()    whether an entry has any
 *   isActive()           whether any chip is on
 *   matches()            one entry against the search text and the chips
 *   filter()             the entries that match, in their order
 *
 * The search looks in the address, the title, the note and the names of the protections, ignoring case and accents
 * ("cafe" finds "Café", "Café" finds "cafe"). The chips
 * combine with AND: Pinned, Changed, Combinations and the categories must all hold, and several
 * categories together mean "any of them" (Anti-bot and CAPTCHA keep the pages that have either).
 * Combinations keeps the pages where at least one combination fired.
 */
(function(root) {
  'use strict';

  // Loaded before this file in the popup and the worker; under Node it sits next to it
  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);

  const CATEGORIES = Categories.KEYS;
  // The on/off chips; the category chips are a list of their own
  const FLAGS = ['pinned', 'changed', 'combinations'];

  const detectionName = (d) => String((d && ((d.detector && d.detector.name) || d.name)) || '').trim();
  const categoryKey = (d) => Categories.keyOf(d);

  /** A Changed record's names as a list, whatever shape an old build or an import left (one name, nothing, junk). */
  const changeNames = (value) => (Array.isArray(value) ? value : (typeof value === 'string' && value.trim() ? [value] : []))
    .filter(name => typeof name === 'string' && name.trim());

  const isChanged = (item) => {
    const change = item && item.changed;
    return !!change && typeof change === 'object' && (changeNames(change.added).length > 0 || changeNames(change.removed).length > 0);
  };

  /**
   * The combinations that fired on a page, one { detection, combo } each: the objects in a detection's `combinations` list,
   * whatever else an old build or an import left there. The card's count and the Combinations chip both read this.
   */
  function firedCombinations(detections) {
    const fired = [];
    for (const detection of Array.isArray(detections) ? detections : []) {
      for (const combo of (detection && Array.isArray(detection.combinations) ? detection.combinations : [])) {
        if (combo && typeof combo === 'object') fired.push({ detection, combo });
      }
    }
    return fired;
  }

  const hasCombinations = (item) => !!item && firedCombinations(item.detections).length > 0;

  /** The chips as the popup keeps them, whatever was passed (nothing gives every chip off): booleans and known categories only. */
  function normalizeChips(chips) {
    const value = chips || {};
    return {
      pinned: value.pinned === true,
      changed: value.changed === true,
      combinations: value.combinations === true,
      categories: [...new Set((Array.isArray(value.categories) ? value.categories : []).filter(key => CATEGORIES.includes(key)))]
    };
  }

  /** A typed host with letters (bücher.de) as the browser stores it (xn--bcher-kva.de); '' when it has none or is not a host. */
  const asciiHost = (text) => {
    if (!/[^\x00-\x7f]/.test(text)) return '';
    try {
      const host = new URL(`http://${text}`).hostname;
      return host && host !== text ? host : '';
    } catch (_) { return ''; }
  };

  /**
   * Text as the search compares it: no accents and no capitals, so "cafe" finds "Café" and "Café" finds "cafe". NFD takes an
   * accented letter apart and \p{M} is what is left of the accent (a dotted İ is an I and a dot, so it meets i). The Turkish
   * dotless ı has no accent to take off: it is read as i, so a keyboard without it still finds "Diyarbakır". Plain ASCII
   * skips the work. toLowerCase and not toLocaleLowerCase: the browser's language must not turn I into ı.
   */
  const fold = (text) => {
    const value = String(text == null ? '' : text);
    return (/[^\x00-\x7f]/.test(value) ? value.normalize('NFD').replace(/\p{M}+/gu, '').replace(/\u0131/g, 'i') : value).toLowerCase();
  };

  const isActive = (chips) => {
    const value = normalizeChips(chips);
    return FLAGS.some(flag => value[flag]) || value.categories.length > 0;
  };

  /**
   * @param {object} item  a History entry
   * @param {{query?: string, chips?: {pinned?: boolean, changed?: boolean, combinations?: boolean, categories?: string[]},
   *          nameOf?: function, categoryOf?: function}} [options]
   *   nameOf and categoryOf read a detection's display name and category key (the popup passes its own)
   */
  function matches(item, options = {}) {
    if (!item) return false;
    const chips = normalizeChips(options.chips);
    const nameOf = options.nameOf || detectionName;
    const categoryOf = options.categoryOf || categoryKey;
    const detections = Array.isArray(item.detections) ? item.detections : [];

    if (chips.pinned && item.pinned !== true) return false;
    if (chips.changed && !isChanged(item)) return false;
    if (chips.combinations && !hasCombinations(item)) return false;
    if (chips.categories.length && !detections.some(d => chips.categories.includes(categoryOf(d)))) return false;

    const typed = String(options.query || '').trim();
    if (!typed) return true;
    const haystack = [
      item.url,
      item.title,
      item.note,
      ...detections.map(d => nameOf(d))
    ];
    // Stored addresses are ASCII (bücher.de is xn--bcher-kva.de): a search typed with letters finds them too, so the typed
    // host (not the folded text, which has lost its letters) is the second needle. A query that is only accents folds to
    // nothing: it matches nothing, where an empty needle would match every entry
    const needles = [fold(typed).trim(), asciiHost(typed.toLowerCase())].filter(Boolean);
    return haystack.some((part) => {
      const text = fold(part || '');
      return needles.some(needle => text.includes(needle));
    });
  }

  function filter(items, options = {}) {
    const list = Array.isArray(items) ? items : [];
    if (!String(options.query || '').trim() && !isActive(options.chips)) return list.filter(Boolean);
    return list.filter(item => matches(item, options));
  }

  const api = { CATEGORIES, FLAGS, changeNames, isChanged, firedCombinations, hasCombinations, isActive, normalizeChips, matches, filter };
  root.HistoryFilter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
