/**
 * Detection tab: which results the search box and the category chips leave on the list.
 * Pure (no browser APIs), so the popup and the tests share it.
 *
 *   CATEGORIES        the chips, one per category ('antibot', 'captcha', 'fingerprint'), in the category order
 *   FLAGS             the on/off chip ('combinations'): keeps the results where a combination fired
 *   STRONG_MIN        strong evidence: 80% or more, the Statistics page's strong tier (the search box's Strong toggle)
 *   isStrong()        whether a result has strong evidence
 *   normalizeChips()  the chips as the popup keeps them, whatever was passed (nothing gives every chip off)
 *   isActive()        whether any chip is on
 *   toggle()          the chips with one category turned on or off
 *   matches()         one result against the search text and the chips
 *   filter()          the results that match, in their order
 *
 * The search looks in the protection's name, its category and its description. Several categories together mean "any of
 * them" (Anti-bot and Captcha keep the results of either), and the chips combine with the search with AND. Combinations
 * keeps the results where at least one combination fired, read with HistoryFilter.firedCombinations (the list History's chip and
 * its card count use), and combines with the categories with AND, as in History. A result whose
 * category is one of the person's own (not one of the three) stays while no chip is on and goes once one is. The Strong toggle
 * inside the search box (option `strong`) is not a chip: it keeps the results at STRONG_MIN or more and ANDs with the rest.
 */
(function(root) {
  'use strict';

  // Loaded before this file in the popup; under Node it sits next to it
  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);

  const CATEGORIES = Categories.KEYS;
  const FLAGS = ['combinations'];
  const STRONG_MIN = 80;

  /** Whether a result has strong evidence (confidence of STRONG_MIN or more). */
  const isStrong = (detection) => !!detection && typeof detection === 'object' && Number(detection.confidence) >= STRONG_MIN;

  // The one list of fired combinations lives in HistoryFilter (loaded later in the popup, so it is read when needed)
  const historyFilter = () => root.HistoryFilter || (typeof require === 'function' ? require('./history-filter.js') : undefined);
  /** Whether a combination fired on this result: the same reading as History's chip, so the two cannot disagree. */
  function hasCombinations(detection, firedOf) {
    const fired = firedOf || ((d) => { const h = historyFilter(); return h ? h.firedCombinations([d]) : []; });
    return !!detection && fired(detection).length > 0;
  }

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
    return {
      combinations: value.combinations === true,
      categories: [...new Set((Array.isArray(value.categories) ? value.categories : []).filter(key => CATEGORIES.includes(key)))]
    };
  }

  const isActive = (chips) => { const value = normalizeChips(chips); return value.combinations || value.categories.length > 0; };

  /** The chips with a category turned on when it was off and off when it was on; the chips given are left as they are. */
  function toggle(chips, key) {
    const value = normalizeChips(chips);
    if (FLAGS.includes(key)) return { ...value, [key]: !value[key] };
    if (!CATEGORIES.includes(key)) return value;
    return { ...value, categories: value.categories.includes(key) ? value.categories.filter(k => k !== key) : [...value.categories, key] };
  }

  /**
   * @param {object} detection  one result of a scan
   * @param {{query?: string, chips?: {categories?: string[], combinations?: boolean}, strong?: boolean,
   *          nameOf?: function, categoryOf?: function, textsOf?: function, firedOf?: function}} [options]
   *   strong (true only) keeps the results with strong evidence
   *   nameOf reads a result's name and categoryOf its category key (the popup passes its own); textsOf returns every text the
   *   search looks in (the popup adds the description in the interface language), by default the name, the category and the description
   */
  function matches(detection, options = {}) {
    if (!detection || typeof detection !== 'object') return false;
    const chips = normalizeChips(options.chips);
    const categoryOf = options.categoryOf || categoryKey;
    if (chips.categories.length && !chips.categories.includes(categoryOf(detection))) return false;

    if (chips.combinations && !hasCombinations(detection, options.firedOf)) return false;
    if (options.strong === true && !isStrong(detection)) return false;

    const query = String(options.query || '').toLowerCase().trim();
    if (!query) return true;
    const nameOf = options.nameOf || detectionName;
    const texts = options.textsOf ? options.textsOf(detection) : [nameOf(detection), detection.category || (detection.detector && detection.detector.category), description(detection)];
    return (Array.isArray(texts) ? texts : [texts]).some(part => String(part || '').toLowerCase().includes(query));
  }

  function filter(detections, options = {}) {
    const list = Array.isArray(detections) ? detections : [];
    if (!String(options.query || '').trim() && !isActive(options.chips) && options.strong !== true) return list.filter(item => item && typeof item === 'object');
    return list.filter(item => matches(item, options));
  }

  const api = { CATEGORIES, FLAGS, STRONG_MIN, isStrong, hasCombinations, normalizeChips, isActive, toggle, matches, filter };
  root.DetectionFilter = api;
  // The popup's other scripts name it as a plain global: a page has one (self is globalThis), a test sandbox may not
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.DetectionFilter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
