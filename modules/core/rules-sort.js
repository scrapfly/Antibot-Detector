/**
 * Rules tab: the order the list is shown in. Pure (no browser APIs), so the popup and the tests share it.
 *
 *   KEYS     'default' (the order the tab builds and always had: switched-off rules last, the category order chosen in Settings, newest
 *            update, name), 'name' (A to Z, as the card names the rule), 'updated' (newest update first)
 *   isKey()  whether a value is one of them
 *   timeOf() when a rule was last updated, in milliseconds; 0 when it has no date or the date cannot be read
 *   sort()   a new list in that order; the list passed is never changed and rules that tie keep the order they were given in
 *
 * A rule is { category, detectorName, detector }, as the Rules tab lists them. The tab builds the Default order itself (it needs the
 * category order from Settings), so a key that is not 'name' or 'updated' ('default' included) keeps the order given, and the other
 * two re-order that list: where they tie (rules updated the same day, names that differ only in case) the Default order shows through.
 */
(function(root) {
  'use strict';

  const KEYS = ['default', 'name', 'updated'];
  const isKey = (key) => KEYS.includes(key);

  const isEntry = (entry) => !!entry && typeof entry === 'object' && !!entry.detector && typeof entry.detector === 'object';

  /**
   * When a rule was last updated, as the card reads it: a number is milliseconds already; a text is a day ("2026-11-05", read as the
   * start of that day in local time), a day and a time as the editor writes them ("2026-11-05 14:30:00", local time) or an ISO date.
   * @param {string|number} raw - a rule's lastUpdated
   * @returns {number} milliseconds, or 0 when there is no date or it cannot be read
   */
  function timeOf(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : 0;
    if (typeof raw !== 'string') return 0;
    let text = raw.trim();
    if (!text) return 0;
    // A bare day would be read as UTC, and a space where the time starts is not an ISO date
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T00:00:00';
    else if (text.includes(' ') && !text.includes('T')) text = text.replace(' ', 'T');
    const ms = new Date(text).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }

  // Case is ignored and accents are not, numbers are read as numbers ("Rule 2" before "Rule 10"), in the order of the browser's language
  const collator = (() => {
    try { return new Intl.Collator(undefined, { numeric: true, sensitivity: 'accent' }); } catch (_) { return null; }
  })();
  const compareText = (a, b) => {
    if (collator) return collator.compare(a, b);
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  };
  /** The name the card shows: the display name (in the interface language), else the name, else the id. */
  const nameOf = (entry) => String(entry.detector.displayName || entry.detector.name || entry.detectorName || '').trim();

  // What each order reads from a rule, and how two of those compare
  const SORTS = {
    name: { read: nameOf, compare: compareText },
    updated: { read: (entry) => timeOf(entry.detector.lastUpdated), compare: (a, b) => b - a }
  };

  /**
   * @param {Array<object>} items  rules, { category, detectorName, detector }, in the Default order
   * @param {string} [key]  one of KEYS; anything else keeps the order given
   * @returns {Array<object>}
   */
  function sort(items, key) {
    const list = (Array.isArray(items) ? items : []).filter(isEntry);
    const by = Object.hasOwn(SORTS, key) ? SORTS[key] : null;
    if (!by) return list;
    return list.map((entry, index) => ({ entry, index, value: by.read(entry) }))
      .sort((a, b) => by.compare(a.value, b.value) || a.index - b.index)
      .map(({ entry }) => entry);
  }

  const api = { KEYS, isKey, timeOf, sort };
  root.RulesSort = api;
  // The popup's other scripts name it as a plain global: a page has one (self is globalThis), a test sandbox may not
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.RulesSort = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
