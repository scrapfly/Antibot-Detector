/**
 * Bulk scan results filter. Pure (no browser APIs): the page and the tests share it.
 *
 *   FILTERS        'all', 'found', 'clear', 'problem'
 *   matches()      whether one page of a run belongs to a filter
 *   apply()        a copy of the run that holds only the pages of a filter, so the table and the exports show the same pages
 *   normalize()    a filter name, or 'all' for anything unknown
 */
(function(root) {
  'use strict';

  const FILTERS = Object.freeze(['all', 'found', 'clear', 'problem']);

  const hasDetections = (item) => !!item && Array.isArray(item.detections) && item.detections.length > 0;

  const normalize = (filter) => (FILTERS.includes(filter) ? filter : 'all');

  /**
   * 'found': scanned, with at least one protection. 'clear': scanned, none found. 'problem': failed or skipped.
   * A page still waiting or being scanned has no outcome yet, so only 'all' holds it.
   */
  function matches(item, filter) {
    if (!item || typeof item !== 'object') return false;
    switch (normalize(filter)) {
      case 'found': return item.status === 'done' && hasDetections(item);
      case 'clear': return item.status === 'done' && !hasDetections(item);
      case 'problem': return item.status === 'failed' || item.status === 'skipped';
      default: return true;
    }
  }

  function apply(run, filter) {
    if (!run || !Array.isArray(run.items) || normalize(filter) === 'all') return run;
    return { ...run, items: run.items.filter(item => matches(item, filter)) };
  }

  const api = { FILTERS, matches, apply, normalize };
  root.BulkFilter = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.BulkFilter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
