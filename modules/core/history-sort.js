/**
 * History tab: the order the list is shown in. Pure (no browser APIs), so the popup and the tests share it.
 *
 *   KEYS     'recent' (the order History keeps, newest first), 'oldest', 'detections' (most protections first), 'host' (A to Z)
 *   isKey()  whether a value is one of them
 *   sort()   a new list in that order; the list passed is never changed and equal entries keep their order
 */
(function(root) {
  'use strict';

  const KEYS = ['recent', 'oldest', 'detections', 'host'];
  const isKey = (key) => KEYS.includes(key);

  const timeOf = (item) => {
    const value = Number(item && item.timestamp);
    return Number.isFinite(value) ? value : 0;
  };
  const countOf = (item) => (item && Array.isArray(item.detections) ? item.detections.filter(d => d && typeof d === 'object').length : 0);
  const hostOf = (item) => {
    const url = String((item && item.url) || '').trim();
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) { return url.toLowerCase(); }
  };

  /**
   * @param {Array<object>} items  History entries
   * @param {string} [key]  one of KEYS; anything else keeps the stored order
   * @returns {Array<object>}
   */
  function sort(items, key) {
    const list = (Array.isArray(items) ? items : []).filter(Boolean);
    const compare = {
      oldest: (a, b) => timeOf(a) - timeOf(b),
      detections: (a, b) => countOf(b) - countOf(a) || timeOf(b) - timeOf(a),
      host: (a, b) => {
        const x = hostOf(a);
        const y = hostOf(b);
        return x < y ? -1 : x > y ? 1 : timeOf(b) - timeOf(a);
      }
    }[key];
    if (!compare) return list;
    return list.map((item, index) => ({ item, index }))
      .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
      .map(entry => entry.item);
  }

  const api = { KEYS, isKey, sort };
  root.HistorySort = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
