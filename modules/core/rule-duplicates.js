/**
 * Rules editor: a pattern that more than one rule holds. Pure (no browser APIs), so the editor and the tests share it.
 *
 *   keyOf()         what makes two patterns of one kind the same: what they match. Not the id, the confidence, the standalone and
 *                   optional flags, the description and its translations, or the on/off switch (NOT_MATCHING)
 *   countWithin()   how many patterns of one rule repeat another of the same kind (the editor's "same pattern more than once")
 *   findInOthers()  the other rules that hold at least one pattern of a rule, most shared first, then in list order
 *   summarize()     the names of up to MAX_NAMED of those rules, and how many more there are
 *
 * A rule is { category, detectorName, detector }, as the Rules tab lists them. Patterns of different kinds (cookie, url ...) are
 * never the same, and a pattern switched off (enabled: false) matches nothing, so both checks skip it. This only finds: the editor
 * warns and never blocks, since a host two rules share on purpose is not a mistake.
 */
(function(root) {
  'use strict';

  const MAX_NAMED = 2;

  const isRecord = (value) => !!value && typeof value === 'object';
  const isEntry = (entry) => isRecord(entry) && isRecord(entry.detector);
  // Fields that do not change what a pattern matches: how it scores, its texts, its switch
  const NOT_MATCHING = new Set(['id', 'confidence', 'standalone', 'optional', 'description', 'descriptionI18n', 'enabled']);

  /** The key of one pattern; null when it is not an object. */
  function keyOf(pattern) {
    if (!isRecord(pattern) || Array.isArray(pattern)) return null;
    return JSON.stringify(Object.keys(pattern).filter(name => !NOT_MATCHING.has(name)).sort().map(name => [name, pattern[name]]));
  }

  /** The key of a pattern that takes part in matching; null for one switched off or not an object. */
  const activeKeyOf = (pattern) => (isRecord(pattern) && pattern.enabled === false ? null : keyOf(pattern));

  /** The distinct patterns of a detection, as "kind + key" texts. */
  function keysOfDetection(detection) {
    const keys = new Set();
    if (!isRecord(detection)) return keys;
    for (const [kind, patterns] of Object.entries(detection)) {
      if (!Array.isArray(patterns)) continue;
      for (const pattern of patterns) {
        const key = activeKeyOf(pattern);
        if (key !== null) keys.add(`${kind}\u0000${key}`);
      }
    }
    return keys;
  }

  /** How many patterns of a rule's detection repeat another of the same kind. */
  function countWithin(detection) {
    let duplicates = 0;
    for (const patterns of Object.values(isRecord(detection) ? detection : {})) {
      if (!Array.isArray(patterns)) continue;
      const seen = new Set();
      for (const pattern of patterns) {
        const key = activeKeyOf(pattern);
        if (key === null) continue;
        if (seen.has(key)) duplicates++;
        else seen.add(key);
      }
    }
    return duplicates;
  }

  const nameOf = (entry) => String(entry.detector.displayName || '').trim() || String(entry.detector.name || '').trim() || String(entry.detectorName || '');

  /**
   * @param {object} detection  the detection of the rule being saved
   * @param {object[]} entries  the rules the tab lists
   * @param {{category?: string, detectorName?: string}} [self]  the rule being saved, which is not "another rule"
   * @returns {Array<{category: string, detectorName: string, name: string, shared: number}>}
   */
  function findInOthers(detection, entries, self) {
    const mine = keysOfDetection(detection);
    if (!mine.size || !Array.isArray(entries)) return [];
    const found = [];
    entries.forEach((entry, index) => {
      if (!isEntry(entry)) return;
      if (isRecord(self) && entry.detectorName === self.detectorName && (self.category === undefined || entry.category === self.category)) return;
      let shared = 0;
      for (const key of keysOfDetection(entry.detector.detection)) if (mine.has(key)) shared++;
      if (shared > 0) found.push({ category: entry.category, detectorName: entry.detectorName, name: nameOf(entry), shared, index });
    });
    return found.sort((a, b) => b.shared - a.shared || a.index - b.index).map(({ index, ...rest }) => rest);
  }

  /** @returns {{names: string[], more: number}} */
  function summarize(found, limit = MAX_NAMED) {
    const list = Array.isArray(found) ? found : [];
    return { names: list.slice(0, limit).map(item => item.name), more: Math.max(0, list.length - limit) };
  }

  const api = { MAX_NAMED, keyOf, countWithin, findInOthers, summarize };
  root.RuleDuplicates = api;
  // The popup's other scripts name it as a plain global: a page has one (self is globalThis), a test sandbox may not
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.RuleDuplicates = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
