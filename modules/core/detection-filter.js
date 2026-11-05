/**
 * Detection tab: which results the search box and the category chips leave on the list.
 * Pure (no browser APIs), so the popup and the tests share it.
 *
 *   CATEGORIES        the chips, one per category ('antibot', 'captcha', 'fingerprint'), in the category order
 *   normalizeChips()  the chips as the popup keeps them, whatever was passed (nothing gives every chip off)
 *   isActive()        whether any chip is on
 *   toggle()          the chips with one category turned on or off
 *   matches()         one result against the search text and the chips
 *   filter()          the results that match, in their order
 *
 * The search looks in the protection's name, its category and its description. Several categories together mean "any of
 * them" (Anti-bot and Captcha keep the results of either), and the chips combine with the search with AND. A result whose
 * category is one of the person's own (not one of the three) stays while no chip is on and goes once one is.
 */
(function(root) {
  'use strict';

  // Loaded before this file in the popup; under Node it sits next to it
  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);

  const CATEGORIES = Categories.KEYS;

  /** A detection's protection name: detector.name, a plain detector string, the detection's own name, else the detector id. */
  const detectionName = (d) => {
    if (!d || typeof d !== 'object') return '';
    const nested = d.detector && typeof d.detector === 'object' ? d.detector : {};
    for (const value of [nested.name, typeof d.detector === 'string' ? d.detector : null, d.name, nested.id, d.id]) {
      if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) return String(value).trim();
    }
    return '';
  };
  const categoryKey = (d) => Categories.keyOf(d);
  const description = (d) => {
    const nested = d && d.detector && typeof d.detector === 'object' ? d.detector : {};
    return typeof nested.description === 'string' ? nested.description : (d && typeof d.description === 'string' ? d.description : '');
  };

  /** The chips as the popup keeps them, whatever was passed: known categories only, each once. */
  function normalizeChips(chips) {
    const value = chips || {};
    return { categories: [...new Set((Array.isArray(value.categories) ? value.categories : []).filter(key => CATEGORIES.includes(key)))] };
  }

  const isActive = (chips) => normalizeChips(chips).categories.length > 0;

  /** The chips with a category turned on when it was off and off when it was on; the chips given are left as they are. */
  function toggle(chips, key) {
    const value = normalizeChips(chips);
    if (!CATEGORIES.includes(key)) return value;
    return { categories: value.categories.includes(key) ? value.categories.filter(k => k !== key) : [...value.categories, key] };
  }

  /**
   * @param {object} detection  one result of a scan
   * @param {{query?: string, chips?: {categories?: string[]},
   *          nameOf?: function, categoryOf?: function, textsOf?: function}} [options]
   *   nameOf reads a result's name and categoryOf its category key (the popup passes its own); textsOf returns every text the
   *   search looks in (the popup adds the description in the interface language), by default the name, the category and the description
   */
  function matches(detection, options = {}) {
    if (!detection || typeof detection !== 'object') return false;
    const chips = normalizeChips(options.chips);
    const categoryOf = options.categoryOf || categoryKey;
    if (chips.categories.length && !chips.categories.includes(categoryOf(detection))) return false;

    const query = String(options.query || '').toLowerCase().trim();
    if (!query) return true;
    const nameOf = options.nameOf || detectionName;
    const texts = options.textsOf ? options.textsOf(detection) : [nameOf(detection), detection.category || (detection.detector && detection.detector.category), description(detection)];
    return (Array.isArray(texts) ? texts : [texts]).some(part => String(part || '').toLowerCase().includes(query));
  }

  function filter(detections, options = {}) {
    const list = Array.isArray(detections) ? detections : [];
    if (!String(options.query || '').trim() && !isActive(options.chips)) return list.filter(item => item && typeof item === 'object');
    return list.filter(item => matches(item, options));
  }

  const api = { CATEGORIES, normalizeChips, isActive, toggle, matches, filter };
  root.DetectionFilter = api;
  // The popup's other scripts name it as a plain global: a page has one (self is globalThis), a test sandbox may not
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.DetectionFilter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
