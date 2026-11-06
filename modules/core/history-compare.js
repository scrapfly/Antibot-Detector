/**
 * History → … → Compare with…: what changed between two saved scans of the same page.
 * Pure (no browser APIs), loaded by the popup before history.js and shared with the tests.
 *
 *   pageKey()      the page an entry belongs to: its address without the query and the fragment
 *                  (the same "page" the recorder uses to mark a change)
 *   others()       the other entries of that page, newest first; pickDefault() the one to compare with first
 *   compare()      the protections added, removed, changed (confidence or evidence) and unchanged
 *                  between two entries, the earlier scan first whatever order they were given in
 *   changeText()   one changed protection as a line: "70% → 95% (+25) · New evidence: Cookies"
 *   toMarkdown()   the result as a Markdown report for a ticket or a chat
 *   view()         what the dialog draws, as plain data: four counts, and the groups of rows with the text of each
 *   shortDateTime(), rangeDates(), whereText()   the dialog's dates (no seconds) and the other scan's page path
 *
 * Detections are matched by name (case-insensitive), like HistoryPolicy.diffProtections; unlike it,
 * fingerprinting is included, since this is a look at everything the two scans found.
 */
(function(root) {
  'use strict';

  // Loaded before this file in the popup; under Node it sits next to it
  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);

  const CATEGORY_ORDER = Categories.KEYS.slice();
  const METHOD_ALIASES = { headers: 'header', cookies: 'cookie', urls: 'url' };

  const timeOf = (item) => {
    const ts = item && item.timestamp;
    const n = typeof ts === 'number' ? ts : Date.parse(ts);
    return Number.isFinite(n) ? n : 0;
  };
  const nameOf = (d) => String((d && ((d.detector && d.detector.name) || d.name)) || '').trim();
  const confidenceOf = (d) => {
    const raw = d && d.confidence;
    if (raw === null || raw === undefined || raw === '') return null; // no score is not a score of 0
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const rankOf = (category) => {
    const at = CATEGORY_ORDER.indexOf(category);
    return at === -1 ? CATEGORY_ORDER.length : at;
  };
  const bySpot = (a, b) => rankOf(a.category) - rankOf(b.category) || a.name.localeCompare(b.name);

  /** The kinds of evidence a detection was found by (cookie, header, url…), sorted, without repeats. */
  function methodsOf(detection) {
    const matches = Array.isArray(detection && detection.matches) ? detection.matches : [];
    const types = matches.map((m) => String((m && m.type) || '').toLowerCase()).filter(Boolean)
      .map((type) => METHOD_ALIASES[type] || type);
    return [...new Set(types)].sort();
  }

  /** The page an entry belongs to: origin and path, no query or fragment; the host name when the address cannot be read. */
  function pageKey(item) {
    const url = typeof (item && item.url) === 'string' ? item.url.trim() : '';
    if (url) {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch (_) { /* fall back to the host name */ }
    }
    const host = String((item && item.hostname) || '').trim().toLowerCase();
    return host && host !== 'unknown' ? host : '';
  }

  /** The other entries of the same page, newest first. */
  function others(items, entry) {
    const key = pageKey(entry);
    if (!key || !Array.isArray(items)) return [];
    return items
      // A scan served from the cache may hold another page's result (the recorder never compares them): it is no scan of this page
      .filter((item) => item && item !== entry && item.id !== (entry && entry.id) && item.fromCache !== true && pageKey(item) === key)
      .sort((a, b) => timeOf(b) - timeOf(a));
  }

  /**
   * The scan to compare with first: the one just before this entry, else the first after it.
   * @param {object[]} candidates - others()
   * @param {object} entry
   */
  function pickDefault(candidates, entry) {
    const list = Array.isArray(candidates) ? candidates : [];
    const at = timeOf(entry);
    const before = list.filter((item) => timeOf(item) <= at).sort((a, b) => timeOf(b) - timeOf(a))[0];
    if (before) return before;
    return list.slice().sort((a, b) => timeOf(a) - timeOf(b))[0] || null;
  }

  function index(detections) {
    const map = new Map();
    for (const d of Array.isArray(detections) ? detections : []) {
      const name = nameOf(d);
      if (!name) continue;
      const row = { name, category: Categories.keyOf(d), confidence: confidenceOf(d), methods: methodsOf(d) };
      const have = map.get(Categories.protectionKey(name));
      if (!have || (row.confidence === null ? -1 : row.confidence) > (have.confidence === null ? -1 : have.confidence)) map.set(Categories.protectionKey(name), row);
    }
    return map;
  }

  /**
   * @param {object} a - a History entry
   * @param {object} b - another History entry
   * @returns {{earlier: object, later: object, added: object[], removed: object[], changed: object[], same: object[], identical: boolean}}
   *   added: in the later scan only; removed: in the earlier scan only;
   *   changed: in both with another confidence or other kinds of evidence ({name, category, from, to, delta, methodsAdded, methodsRemoved});
   *   same: in both, the same.
   */
  function compare(a, b) {
    const [earlier, later] = timeOf(a) <= timeOf(b) ? [a, b] : [b, a];
    const was = index(earlier && earlier.detections);
    const is = index(later && later.detections);
    const added = [], removed = [], changed = [], same = [];
    for (const [key, row] of is) {
      const before = was.get(key);
      if (!before) { added.push(row); continue; }
      const delta = row.confidence === null || before.confidence === null ? null : row.confidence - before.confidence;
      const methodsAdded = row.methods.filter((m) => !before.methods.includes(m));
      const methodsRemoved = before.methods.filter((m) => !row.methods.includes(m));
      if ((delta !== null && delta !== 0) || methodsAdded.length || methodsRemoved.length) {
        changed.push({ name: row.name, category: row.category, from: before.confidence, to: row.confidence, delta, methodsAdded, methodsRemoved });
      } else {
        same.push(row);
      }
    }
    for (const [key, row] of was) if (!is.has(key)) removed.push(row);
    [added, removed, changed, same].forEach((list) => list.sort(bySpot));
    const brief = (item) => ({ id: item && item.id, timestamp: timeOf(item), url: (item && item.url) || '' });
    return { earlier: brief(earlier), later: brief(later), added, removed, changed, same, identical: !added.length && !removed.length && !changed.length };
  }

  const plain = (key, fallback, ...args) => String(fallback).replace(/\{(\d)\}/g, (_, i) => args[Number(i)]);

  /** A difference of confidence with its sign: +25, −30 (a real minus sign). */
  const signed = (delta) => `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;

  /** What changed in the evidence of one changed protection, a line for each side. */
  function evidenceLines(row, t, label) {
    const lines = [];
    if (row.methodsAdded.length) lines.push(t('historyCompareEvidenceAddedFmt', 'New evidence: {0}', row.methodsAdded.map(label).join(', ')));
    if (row.methodsRemoved.length) lines.push(t('historyCompareEvidenceRemovedFmt', 'Evidence gone: {0}', row.methodsRemoved.map(label).join(', ')));
    return lines;
  }

  /**
   * One changed protection as a line.
   * @param {object} row - an item of compare().changed
   * @param {{t?: Function, methodLabel?: Function}} [options] - t(key, fallback, ...args) translates; methodLabel(type) names a kind of evidence
   */
  function changeText(row, options = {}) {
    const t = options.t || plain;
    const label = options.methodLabel || ((type) => type);
    const parts = [];
    if (row.delta !== null && row.delta !== 0) parts.push(t('historyCompareChangeFmt', '{0}% → {1}% ({2})', row.from, row.to, signed(row.delta)));
    parts.push(...evidenceLines(row, t, label));
    return parts.join(' · ');
  }

  // Markdown and HTML characters are escaped: a name must not become an image, a link, HTML or a new table row
  const md = (value) => String(value == null ? '' : value).replace(/[\\`*_[\]<>|~]/g, (c) => `\\${c}`).replace(/[\r\n]+/g, ' ').trim();

  /**
   * @param {object} result - compare()
   * @param {{host?: string, address?: string, t?: Function, methodLabel?: Function, categoryLabel?: Function, dateText?: Function}} [options]
   * @returns {string}
   */
  function toMarkdown(result, options = {}) {
    const t = options.t || plain;
    const categoryLabel = options.categoryLabel || ((key) => key);
    const dateText = options.dateText || ((ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' '));
    const line = (row) => `- ${md(row.name)} (${md(categoryLabel(row.category))}${row.confidence === null ? '' : `, ${row.confidence}%`})`;
    const lines = [`## ${md(t('historyCompareMdHeadingFmt', 'Compare scans: {0}', options.host || options.address || '?'))}`, ''];
    if (options.address) lines.push(md(options.address), '');
    lines.push(md(t('historyCompareRangeFmt', 'From {0} to {1}', dateText(result.earlier.timestamp), dateText(result.later.timestamp))), '');
    const section = (key, fallback, rows, render) => {
      if (!rows.length) return;
      lines.push(`### ${md(t(key, fallback))}`, ...rows.map(render), '');
    };
    if (result.identical) lines.push(md(t('historyCompareIdentical', 'These two scans found the same protections, with the same confidence and evidence.')), '');
    section('historyCompareAdded', 'Added', result.added, line);
    section('historyCompareRemoved', 'Removed', result.removed, line);
    section('historyCompareChanged', 'Changed', result.changed, (row) => `- ${md(row.name)} (${md(categoryLabel(row.category))}): ${md(changeText(row, options))}`);
    section('historyCompareUnchanged', 'Unchanged', result.same, line);
    return lines.join('\n');
  }

  // ---- The dialog: what it shows, as plain data -----------------------------------------------------------------------

  /** Unchanged folds when it holds more protections than this (and the two scans are not identical). */
  const COLLAPSE_AFTER = 3;
  const KINDS = [['added', 'historyCompareAdded', 'Added'], ['removed', 'historyCompareRemoved', 'Removed'], ['changed', 'historyCompareChanged', 'Changed'], ['same', 'historyCompareUnchanged', 'Unchanged']];

  /**
   * The date and time of a scan without its seconds ("Oct 15, 2026, 4:28 PM"), for the dialog's list and range line.
   * @param {number|string|Date} value
   * @param {string|null} [locale] - a BCP 47 tag; none or one Intl does not know: the browser's own
   * @param {string} [timeZone] - for the tests; the person's own by default
   */
  function shortDateTime(value, locale, timeZone) {
    const date = value instanceof Date ? value : new Date(value);
    const options = { dateStyle: 'medium', timeStyle: 'short' };
    if (timeZone) options.timeZone = timeZone;
    try {
      return new Intl.DateTimeFormat(locale || undefined, options).format(date);
    } catch (_) { /* a language tag Intl does not know, or no date: the browser's own language next */ }
    try {
      return new Intl.DateTimeFormat(undefined, options).format(date);
    } catch (_) {
      return date.toLocaleString();
    }
  }

  /**
   * The two dates of the range line: without seconds, unless that would show the same text twice (two scans in one minute).
   * @param {{earlier: {timestamp: number}, later: {timestamp: number}}} result - compare()
   * @param {{short: Function, long: Function}} format - short(ms) and long(ms) write a date
   * @returns {string[]} [earlier, later]
   */
  function rangeDates(result, format) {
    const first = result.earlier.timestamp, second = result.later.timestamp;
    const a = format.short(first), b = format.short(second);
    return a === b ? [format.long(first), format.long(second)] : [a, b];
  }

  /** The address of a scan without its origin: path, query and fragment ("/cart?ref=mail"); '' when it cannot be read. */
  function pagePath(url) {
    try {
      const parsed = new URL(String(url || '').trim());
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (_) {
      return '';
    }
  }

  /**
   * What the dialog says about the scan picked to compare with: its page path, but only when its address is not the entry's own.
   * (Every scan listed is of the same page, so what can differ is the query and the fragment.)
   */
  function whereText(entry, other) {
    const there = pagePath(other && other.url);
    return there && there !== pagePath(entry && entry.url) ? there : '';
  }

  /**
   * Everything the dialog draws for a comparison, as plain data (the dialog only turns it into elements).
   *   chips    one per kind, in the order added, removed, changed, unchanged: { kind, label, count } (a count of 0 is kept: it is dimmed)
   *   groups   the kinds that have rows: { kind, label, count, title: "Changed (1)", open, collapsible, rows }
   *            open: Unchanged is folded when it is long (COLLAPSE_AFTER), unless the two scans are identical; the others are always open
   *   row      { name, category, confidence, from, to, delta, deltaText, tone, notes }
   *            confidence: the score shown (a changed protection's later one), null when it has none
   *            from, to, delta, deltaText ("+25", "−30"), tone ("up" | "down"): only when a changed protection's score moved, else null / '' / ''
   *            notes: "New evidence: Cookies · Evidence gone: Headers" for a changed protection, else ''
   * @param {object} result - compare()
   * @param {{t?: Function, methodLabel?: Function}} [options] - as for changeText()
   */
  function view(result, options = {}) {
    const t = options.t || plain;
    const label = options.methodLabel || ((type) => type);
    const plainRow = (row) => ({ name: row.name, category: row.category, confidence: row.confidence, from: null, to: null, delta: null, deltaText: '', tone: '', notes: '' });
    const changedRow = (row) => {
      const moved = row.delta !== null && row.delta !== 0;
      return {
        name: row.name, category: row.category, confidence: row.to,
        from: moved ? row.from : null, to: moved ? row.to : null, delta: moved ? row.delta : null,
        deltaText: moved ? signed(row.delta) : '', tone: moved ? (row.delta > 0 ? 'up' : 'down') : '',
        notes: evidenceLines(row, t, label).join(' · ')
      };
    };
    const lists = { added: result.added, removed: result.removed, changed: result.changed, same: result.same };
    const chips = KINDS.map(([kind, key, fallback]) => ({ kind, label: t(key, fallback), count: lists[kind].length }));
    const groups = KINDS.filter(([kind]) => lists[kind].length).map(([kind, key, fallback]) => {
      const text = t(key, fallback);
      const rows = lists[kind].map(kind === 'changed' ? changedRow : plainRow);
      return {
        kind, label: text, count: rows.length, title: `${text} (${rows.length})`,
        open: kind !== 'same' || result.identical || rows.length <= COLLAPSE_AFTER, collapsible: kind === 'same', rows
      };
    });
    return { identical: result.identical, chips, groups };
  }

  const api = { CATEGORY_ORDER, COLLAPSE_AFTER, pageKey, others, pickDefault, compare, changeText, toMarkdown, methodsOf, timeOf, shortDateTime, rangeDates, pagePath, whereText, view };
  root.HistoryCompare = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
