/**
 * Bulk scan results filter. Pure (no browser APIs): the page and the tests share it.
 *
 *   FILTERS        'all', 'found', 'clear', 'problem', 'httpError'; and one per protection, written forProtection(name)
 *                  ('protection:Cloudflare'), which the page lists from the run's protection totals
 *   matches()      whether one page of a run belongs to a filter
 *   apply()        a copy of the run that holds only the pages of a filter, so the table and the exports show the same pages
 *   normalize()    a filter name, or 'all' for anything unknown
 *   forProtection(), protectionOf()   a protection's filter, and the protection a filter names ('' for the others)
 */
(function(root) {
  'use strict';

  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);
  const HttpStatus = root.HttpStatus || (typeof require === 'function' ? require('./http-status.js') : undefined);

  const FILTERS = Object.freeze(['all', 'found', 'clear', 'problem', 'httpError']);
  const PROTECTION = 'protection:';
  const MAX_NAME = 200;

  const hasDetections = (item) => !!item && Array.isArray(item.detections) && item.detections.length > 0;
  const detectionName = (d) => String((d && ((d.detector && typeof d.detector === 'object' && d.detector.name) || d.name)) || '').trim();
  // One protection under its two names or spellings is one filter, as the run's totals group them
  const keyOf = (name) => (Categories ? Categories.protectionKey(name) : String(name).trim().toLowerCase());

  /** The protection a filter names, or '' when it names none. */
  function protectionOf(filter) {
    if (typeof filter !== 'string' || !filter.startsWith(PROTECTION)) return '';
    const name = filter.slice(PROTECTION.length).trim();
    return name.length <= MAX_NAME ? name : '';
  }

  /** The filter that keeps the pages where a protection was found ('all' for no name). */
  const forProtection = (name) => {
    const text = String(name == null ? '' : name).trim();
    return text && text.length <= MAX_NAME ? `${PROTECTION}${text}` : 'all';
  };

  const normalize = (filter) => {
    if (FILTERS.includes(filter)) return filter;
    const name = protectionOf(filter);
    return name ? forProtection(name) : 'all';
  };

  /**
   * 'found': scanned, with at least one protection. 'clear': scanned, none found. 'problem': failed or skipped. 'httpError':
   * scanned, and the page answered 4xx or 5xx (a page whose status is not known is not one of them). A protection's filter:
   * scanned, and that protection was found on the page.
   * A page still waiting or being scanned has no outcome yet, so only 'all' holds it.
   */
  function matches(item, filter) {
    if (!item || typeof item !== 'object') return false;
    const chosen = normalize(filter);
    const protection = protectionOf(chosen);
    if (protection) {
      const key = keyOf(protection);
      return item.status === 'done' && hasDetections(item) && item.detections.some(d => detectionName(d) && keyOf(detectionName(d)) === key);
    }
    switch (chosen) {
      case 'found': return item.status === 'done' && hasDetections(item);
      case 'clear': return item.status === 'done' && !hasDetections(item);
      case 'problem': return item.status === 'failed' || item.status === 'skipped';
      case 'httpError': return item.status === 'done' && !!HttpStatus && HttpStatus.isError(item.httpStatus);
      default: return true;
    }
  }

  function apply(run, filter) {
    if (!run || !Array.isArray(run.items) || normalize(filter) === 'all') return run;
    return { ...run, items: run.items.filter(item => matches(item, filter)) };
  }

  const api = { FILTERS, matches, apply, normalize, forProtection, protectionOf };
  root.BulkFilter = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.BulkFilter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
