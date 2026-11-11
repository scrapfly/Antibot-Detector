/**
 * Rules tab: which rules the search box and the filter chips leave on the list.
 * Pure (no browser APIs), so the popup and the tests share it.
 *
 *   FLAGS             the on/off chips: 'custom', 'edited', 'disabled', 'updated' (the row shows Recently updated after the categories)
 *   RECENT_DAYS       how far back "Recently updated" looks: 30 days
 *   CATEGORIES        the category chips, one per category, in the category order
 *   normalizeChips()  the chips as the popup keeps them, whatever was passed (nothing gives every chip off)
 *   isActive()        whether any chip is on
 *   isChip()          whether a name is one of the chips
 *   toggle()          the chips with one turned on or off
 *   matches()         one rule against the search text and the chips
 *   filter()          the rules that match; with a search, the rule named like it first
 *
 * A rule is { category, detectorName, detector }, as the Rules tab lists them. The chips:
 *   Custom     a rule that is not one of Scrapfly's (isOfficial: the popup passes DetectionUtils.isOfficialDetector)
 *   Edited     a shipped rule the person changed, not only translated (isEdited: the popup passes DetectorManager.isUserEdited)
 *   Disabled   a rule the person switched off
 *   Updated    a rule whose last update (lastUpdated: what the card shows, what saving a rule or Rules -> Update writes) is in the
 *              last RECENT_DAYS days; one with no readable date is not. options.now sets the moment it is measured from (the clock
 *              unless the caller says: the tests do)
 *   categories Anti-bot, Captcha, Fingerprint
 * Several categories together mean "any of them". Custom and Edited are two sources a rule can come from (never both), so
 * together they keep the rules of either: the ones the person made or changed. Every kind of chip narrows the others (Disabled and
 * Updated too), and all of them combine with the search with AND. The search looks in the name, the category (as the card shows it
 * too), the description and the detection method types, and puts the rule named like it first.
 */
(function(root) {
  'use strict';

  // Loaded before this file in the popup; under Node they sit next to it
  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);
  // The date the card shows and the Rules sort reads: one reading of lastUpdated for both
  const RulesSort = root.RulesSort || (typeof require === 'function' ? require('./rules-sort.js') : undefined);

  const CATEGORIES = Categories.KEYS;
  // The on/off chips; the category chips are a list of their own
  const FLAGS = Object.freeze(['custom', 'edited', 'disabled', 'updated']);
  // "Recently updated" keeps the rules whose last update is this many days old at most
  const RECENT_DAYS = 30;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const isEntry = (entry) => !!entry && typeof entry === 'object' && !!entry.detector && typeof entry.detector === 'object';
  /** A rule the person switched off: the same test as the card's switch. */
  const isDisabled = (entry) => entry.detector.enabled === false;
  /** What the card shows for an edited rule when the popup has no better reader. */
  const marked = (entry) => !!(entry.detector.userModified && entry.detector.officialSnapshot);
  const categoryKey = (entry) => Categories.keyOf(entry.category || entry.detector.category);
  /** The moment "recent" is measured from: the one the caller gave (milliseconds or a Date), else the clock. */
  const nowOf = (value) => {
    const ms = value instanceof Date ? value.getTime() : (typeof value === 'number' ? value : NaN);
    return Number.isFinite(ms) ? ms : Date.now();
  };
  /** A rule updated in the last RECENT_DAYS days (or later than `now`: a clock a little behind the author's); one with no readable date is not. */
  const isRecent = (entry, now) => {
    const time = RulesSort.timeOf(entry.detector.lastUpdated);
    return time > 0 && time >= now - RECENT_DAYS * DAY_MS;
  };

  /** The chips as the popup keeps them, whatever was passed: booleans and known categories only, each once. */
  function normalizeChips(chips) {
    const value = chips || {};
    return {
      custom: value.custom === true,
      edited: value.edited === true,
      disabled: value.disabled === true,
      updated: value.updated === true,
      categories: [...new Set((Array.isArray(value.categories) ? value.categories : []).filter(key => CATEGORIES.includes(key)))]
    };
  }

  const isActive = (chips) => {
    const value = normalizeChips(chips);
    return FLAGS.some(flag => value[flag]) || value.categories.length > 0;
  };

  const isChip = (key) => FLAGS.includes(key) || CATEGORIES.includes(key);

  /** The chips with one turned on when it was off and off when it was on; the chips given are left as they are. */
  function toggle(chips, key) {
    const value = normalizeChips(chips);
    if (FLAGS.includes(key)) return { ...value, [key]: !value[key] };
    if (CATEGORIES.includes(key)) {
      return { ...value, categories: value.categories.includes(key) ? value.categories.filter(k => k !== key) : [...value.categories, key] };
    }
    return value;
  }

  const queryOf = (query) => String(query || '').toLowerCase().trim();

  /** The search text of a rule: its names, category (the key and as shown), description; and the method types it has rules for. */
  function matchesQuery(entry, query, categoryLabel) {
    const { detector } = entry;
    const text = [detector.displayName, detector.name, entry.category, categoryLabel, detector.description].filter(Boolean).join(' ').toLowerCase();
    if (text.includes(query)) return true;
    // Also by the detection method TYPE (COOKIE, HEADER, DOM...); the patterns' own text is not searched, to avoid false positives
    const methods = detector.detection && typeof detector.detection === 'object' ? detector.detection : {};
    return Object.keys(methods)
      .filter(key => Array.isArray(methods[key]) && methods[key].length > 0)
      .map(key => key.toUpperCase().replace(/_/g, ' '))
      .join(' ')
      .toLowerCase()
      .includes(query);
  }

  /**
   * @param {object} entry  a rule, { category, detectorName, detector }
   * @param {{query?: string, chips?: object, now?: number|Date, isOfficial?: function, isEdited?: function, categoryOf?: function, categoryLabelOf?: function}} [options]
   *   isOfficial / isEdited read a rule's origin (the popup passes its own: they are what the card's tip and Edited tag use); without
   *   isOfficial no rule counts as custom, and without isEdited a rule counts as edited when it is marked and has its shipped version
   *   to go back to. categoryOf reads the category key, categoryLabelOf the category as the card shows it. now is the moment
   *   "Recently updated" is measured from (the clock when it is not given).
   */
  function matches(entry, options = {}) {
    if (!isEntry(entry)) return false;
    const chips = normalizeChips(options.chips);
    const categoryOf = options.categoryOf || categoryKey;
    if (chips.categories.length && !chips.categories.includes(categoryOf(entry))) return false;

    if (chips.custom || chips.edited) {
      const custom = chips.custom && !(options.isOfficial ? options.isOfficial(entry) : true);
      const edited = chips.edited && !!(options.isEdited ? options.isEdited(entry) : marked(entry));
      if (!custom && !edited) return false;
    }
    if (chips.disabled && !isDisabled(entry)) return false;
    if (chips.updated && !isRecent(entry, nowOf(options.now))) return false;

    const query = queryOf(options.query);
    return !query || matchesQuery(entry, query, options.categoryLabelOf ? options.categoryLabelOf(entry) : '');
  }

  /** How well a rule's name fits the search: 0 the name is the search, 1 it starts with it, 2 it contains it, 3 only the rest matched. */
  function rank(entry, query) {
    const names = [entry.detector.displayName, entry.detector.name].filter(Boolean).map(name => String(name).toLowerCase());
    if (names.some(name => name === query)) return 0;
    if (names.some(name => name.startsWith(query))) return 1;
    return names.some(name => name.includes(query)) ? 2 : 3;
  }

  /**
   * The rules that match, in their order; with a search, the rule whose name is the search first, then names that start with
   * it, then names that contain it ("Cap" also matches every CAPTCHA by its category and would put Cap on a later page).
   * A new list: the tab keeps both the whole one and this.
   */
  function filter(entries, options = {}) {
    const kept = (Array.isArray(entries) ? entries : []).filter(entry => matches(entry, options));
    const query = queryOf(options.query);
    if (!query) return kept;
    return kept.map((entry, index) => ({ entry, index, rank: rank(entry, query) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(({ entry }) => entry);
  }

  const api = { FLAGS, CATEGORIES, RECENT_DAYS, normalizeChips, isActive, isChip, toggle, matches, filter };
  root.RulesFilter = api;
  // The popup's other scripts name it as a plain global: a page has one (self is globalThis), a test sandbox may not
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.RulesFilter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
