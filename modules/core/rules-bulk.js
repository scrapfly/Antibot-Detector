/**
 * Rules tab: acting on the rules the search and the chips leave (the ones the list shows) instead of on all of them.
 * Pure (no browser APIs), so the popup and the tests share it.
 *
 *   toChange()  the listed rules not yet in the wanted state (a rule with no flag is on, as the card's switch reads it)
 *   counts()    how many rules each toolbar menu item would act on; all zero when no search or chip is on
 *   exportOf()  the listed rules in the file format Rules → Import reads, without the search cache
 *
 * A rule is { category, detectorName, detector }, as the Rules tab lists them.
 */
(function(root) {
  'use strict';

  const isEntry = (entry) => !!entry && typeof entry === 'object' && !!entry.detector && typeof entry.detector === 'object';
  const listed = (entries) => (Array.isArray(entries) ? entries : []).filter(isEntry);

  /** The listed rules that are not already on (enable true) or off (enable false). */
  function toChange(entries, enable) {
    return listed(entries).filter(entry => (entry.detector.enabled !== false) !== (enable === true));
  }

  /**
   * @param {object[]} entries - the rules the list shows
   * @param {boolean} filtered - a search or a chip is on; without one the shown rules are all of them and the menu's own Export does it
   */
  function counts(entries, filtered) {
    if (!filtered) return { export: 0, on: 0, off: 0 };
    return { export: listed(entries).length, on: toChange(entries, true).length, off: toChange(entries, false).length };
  }

  /** The same shape as DetectorManager.exportDetectors, for the listed rules only; copies, so the list is not touched. */
  function exportOf(entries, now) {
    const detectors = {};
    for (const entry of listed(entries)) {
      const copy = JSON.parse(JSON.stringify(entry.detector));
      delete copy._searchStrings;
      (detectors[entry.category] = detectors[entry.category] || {})[entry.detectorName] = copy;
    }
    return { version: '1.0', exportedAt: (now instanceof Date ? now : new Date()).toISOString(), detectors };
  }

  const api = { toChange, counts, exportOf };
  root.RulesBulk = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.RulesBulk = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
