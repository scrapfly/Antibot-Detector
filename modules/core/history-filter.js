/**
 * History tab: which entries the search box and the filter chips leave on the list.
 * Pure (no browser APIs), so the popup and the tests share it.
 *
 *   isChanged()   an entry whose protections differ from its earlier scan (what the Changed badge shows)
 *   isActive()    whether any chip is on
 *   matches()     one entry against the search text and the chips
 *   filter()      the entries that match, in their order
 *
 * The search looks in the address, the title, the note and the names of the protections. The chips
 * combine with AND: Pinned, Changed and the categories must all hold, and several categories
 * together mean "any of them" (Anti-bot and CAPTCHA keep the pages that have either).
 */
(function(root) {
  'use strict';

  // Loaded before this file in the popup and the worker; under Node it sits next to it
  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);

  const CATEGORIES = Categories.KEYS;

  const detectionName = (d) => String((d && ((d.detector && d.detector.name) || d.name)) || '').trim();
  const categoryKey = (d) => Categories.keyOf(d);

  const isChanged = (item) => {
    const change = item && item.changed;
    return !!change && ((change.added || []).length > 0 || (change.removed || []).length > 0);
  };

  /** The chips as the popup keeps them, whatever was passed: booleans and known categories only. */
  function normalizeChips(chips) {
    const value = chips || {};
    return {
      pinned: value.pinned === true,
      changed: value.changed === true,
      categories: [...new Set((Array.isArray(value.categories) ? value.categories : []).filter(key => CATEGORIES.includes(key)))]
    };
  }

  const isActive = (chips) => {
    const value = normalizeChips(chips);
    return value.pinned || value.changed || value.categories.length > 0;
  };

  /**
   * @param {object} item  a History entry
   * @param {{query?: string, chips?: {pinned?: boolean, changed?: boolean, categories?: string[]},
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
    if (chips.categories.length && !detections.some(d => chips.categories.includes(categoryOf(d)))) return false;

    const query = String(options.query || '').toLowerCase().trim();
    if (!query) return true;
    const haystack = [
      item.url,
      item.title,
      item.note,
      ...detections.map(d => nameOf(d))
    ];
    return haystack.some(part => String(part || '').toLowerCase().includes(query));
  }

  function filter(items, options = {}) {
    const list = Array.isArray(items) ? items : [];
    if (!String(options.query || '').trim() && !isActive(options.chips)) return list.filter(Boolean);
    return list.filter(item => matches(item, options));
  }

  const api = { CATEGORIES, isChanged, isActive, normalizeChips, matches, filter };
  root.HistoryFilter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
