/**
 * Statistics → Site: one site over time, from the History entries of that site. Pure (no browser APIs), loaded by the
 * Statistics page after categories.js, http-status.js and history-filter.js, and shared with the tests.
 *
 *   siteOf()       the site of a host name or an address: lower case, without a trailing dot or a leading "www." (www.shop.example
 *                  and shop.example are one site, as Bulk scan and History count them; www.com stays www.com); '' when there is none
 *   entriesOf()    the History entries of a site, newest first (an entry whose date is not known last)
 *   build()        the report, as plain data:
 *                    site, hosts (the spellings seen, the site first), pages (paths on the site: no query, no fragment, www or not), scans,
 *                    first and last (dates of the oldest and newest scan; null when no date is known)
 *                    protections  every protection found on any of the site's entries: first and last seen, pages, scans and the
 *                                 confidence range; anti-bot first, then CAPTCHA, fingerprint and other, the most scanned first
 *                    timeline     protection × scan, oldest scan first, for the latest `limit` dated scans: total, shown, capped,
 *                                 scans [{ id, timestamp, path, httpStatus }], rows [{ name, category, cells [{ found, confidence }] }]
 *                    statuses     the HTTP statuses the site answered with ({ code, scans, last }), unknownStatus: scans without one
 *                                 (entries saved before 3.1.9, or a status the browser did not report)
 *                    changes      the scans History marked Changed, newest first: { id, timestamp, host, path, added, removed }
 *   toJSON()       the report as a JSON text for a file: names, categories, counts, dates, paths and statuses, never a cookie or
 *                  header value, a matched signal, a query string or a note
 *   toMarkdown()   the same as a Markdown report
 *   filename()     scrapfly-site-report-<site>-<local day>.<md|json>
 *
 * Detections are matched by name, ignoring case (Categories.protectionKey), like History's Compare scans. A detection without a
 * score counts as found with no confidence; a score is a number from 0 to 100, anything else is no score.
 */
(function(root) {
  'use strict';

  // Loaded before this file on the page; under Node they sit next to it
  const load = (name, file) => root[name] || (typeof require === 'function' ? require(file) : undefined);
  const Categories = load('Categories', './categories.js');
  const HttpStatus = load('HttpStatus', './http-status.js');
  const HistoryFilter = load('HistoryFilter', './history-filter.js');

  /** Scans the timeline shows by default: the latest ones. */
  const TIMELINE_LIMIT = 30;
  // A date before 2000 is not a saved scan (0, seconds instead of milliseconds): unknown, as the Statistics page reads it
  const MIN_TIMESTAMP = Date.UTC(2000, 0, 1);
  const CATEGORY_ORDER = Categories.KEYS_AND_OTHER;
  const MINUS = '−';

  const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const oneLine = (value) => String(value == null ? '' : value).replace(/[\r\n\u0085\u2028\u2029]+/g, ' ').trim();

  /** The time of an entry, or null when it is not known. */
  function timeOf(item) {
    const value = item && item.timestamp;
    let ts = null;
    if (typeof value === 'number') ts = value;
    else if (typeof value === 'string' && value.trim()) {
      ts = Number(value);
      if (!Number.isFinite(ts)) ts = Date.parse(value);
    }
    return Number.isFinite(ts) && Number.isFinite(new Date(ts).getTime()) && ts >= MIN_TIMESTAMP ? ts : null;
  }

  /** The host of an address or a host name, in lower case, without a trailing dot ('' when there is none). */
  function hostOf(value) {
    const text = oneLine(value).toLowerCase();
    if (!text) return '';
    let host = '';
    try {
      host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `http://${text}`).hostname;
    } catch (_) { host = ''; }
    if (!host) return '';
    return host.replace(/\.$/, '');
  }

  /** The host name an entry was saved under: its hostname, else its address's. */
  function entryHost(item) {
    if (!isRecord(item)) return '';
    const named = typeof item.hostname === 'string' && item.hostname.trim() && item.hostname.trim().toLowerCase() !== 'unknown' ? hostOf(item.hostname) : '';
    return named || (typeof item.url === 'string' ? hostOf(item.url) : '');
  }

  /** The site of a host name or an address: "www." and the host under it are one site. */
  function siteOf(value) {
    const host = hostOf(value);
    // "www." is the same site as the host under it, but only when something is under it (www.com is a host)
    return host.startsWith('www.') && host.indexOf('.', 4) !== -1 ? host.slice(4) : host;
  }

  const siteOfEntry = (item) => siteOf(entryHost(item));

  /** The entries of a site, newest first; those without a known date come last, in their stored order. */
  function entriesOf(items, site) {
    const key = siteOf(site);
    if (!key || !Array.isArray(items)) return [];
    return items
      .map((item, index) => ({ item, index, ts: isRecord(item) ? timeOf(item) : null }))
      .filter(row => isRecord(row.item) && siteOfEntry(row.item) === key)
      .sort((a, b) => (a.ts === null) - (b.ts === null) || (b.ts || 0) - (a.ts || 0) || a.index - b.index)
      .map(row => row.item);
  }

  const nameOf = (d) => {
    if (!isRecord(d)) return '';
    const nested = isRecord(d.detector) ? d.detector : {};
    for (const value of [d.name, nested.name, typeof d.detector === 'string' ? d.detector : null]) {
      if (typeof value === 'string' && value.trim()) return oneLine(value);
    }
    return '';
  };
  const categoryOf = (d) => {
    const nested = isRecord(d && d.detector) ? d.detector : {};
    return Categories.keyOf(d.category || nested.category || d.type || nested.type || d);
  };
  const confidenceOf = (d) => {
    const raw = d && d.confidence;
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? Math.round(raw) : null;
  };
  const rankOf = (category) => {
    const at = CATEGORY_ORDER.indexOf(category);
    return at === -1 ? CATEGORY_ORDER.length : at;
  };

  /** An entry's page path: no origin, no query, no fragment ('/' when only the host is known). */
  function pathOf(item) {
    try {
      return new URL(String(item && item.url || '').trim()).pathname || '/';
    } catch (_) {
      return '/';
    }
  }

  /** One entry's protections, once each by name: the best score wins. */
  function protectionsOf(item) {
    const map = new Map();
    for (const d of Array.isArray(item && item.detections) ? item.detections : []) {
      const name = nameOf(d);
      if (!name) continue;
      const key = Categories.protectionKey(name);
      const row = { key, name, category: categoryOf(d), confidence: confidenceOf(d) };
      const have = map.get(key);
      if (!have || (row.confidence === null ? -1 : row.confidence) > (have.confidence === null ? -1 : have.confidence)) map.set(key, row);
    }
    return map;
  }

  const limitOf = (value) => (Number.isInteger(value) && value > 0 ? value : TIMELINE_LIMIT);

  /**
   * @param {object[]} items - History entries
   * @param {string} site - a host name or an address of the site
   * @param {{limit?: number}} [options] - limit: the latest scans the timeline shows (30 by default)
   */
  function build(items, site, options = {}) {
    const key = siteOf(site);
    const entries = entriesOf(items, key);
    const hosts = new Set(), pages = new Set();
    const protections = new Map(), statuses = new Map();
    let first = null, last = null, unknownStatus = 0;
    const changes = [];
    for (const item of entries) {
      const ts = timeOf(item);
      if (ts !== null) {
        if (first === null || ts < first) first = ts;
        if (last === null || ts > last) last = ts;
      }
      const host = entryHost(item);
      if (host) hosts.add(host);
      // A page is its path on the site: www.shop.example/a and shop.example/a are one page, as they are one site
      const page = `${key}${pathOf(item)}`;
      pages.add(page);
      const code = HttpStatus.of(item.httpStatus);
      if (code === null) unknownStatus++;
      else {
        const row = statuses.get(code) || { code, scans: 0, last: null };
        row.scans++;
        if (ts !== null && (row.last === null || ts > row.last)) row.last = ts;
        statuses.set(code, row);
      }
      for (const found of protectionsOf(item).values()) {
        const row = protections.get(found.key) || { name: found.name, category: found.category, firstSeen: null, lastSeen: null, pages: new Set(), scans: 0, min: null, max: null };
        row.scans++;
        row.pages.add(page);
        if (ts !== null) {
          if (row.firstSeen === null || ts < row.firstSeen) row.firstSeen = ts;
          if (row.lastSeen === null || ts > row.lastSeen) { row.lastSeen = ts; row.name = found.name; }
        }
        if (found.confidence !== null) {
          row.min = row.min === null ? found.confidence : Math.min(row.min, found.confidence);
          row.max = row.max === null ? found.confidence : Math.max(row.max, found.confidence);
        }
        protections.set(found.key, row);
      }
      if (HistoryFilter.isChanged(item)) {
        const names = (list) => HistoryFilter.changeNames(list).map(oneLine).filter(Boolean);
        changes.push({ id: item.id === undefined ? null : item.id, timestamp: ts, host, path: pathOf(item), added: names(item.changed.added), removed: names(item.changed.removed) });
      }
    }

    const protectionRows = [...protections.entries()].map(([id, row]) => ({
      key: id, name: row.name, category: row.category, firstSeen: row.firstSeen, lastSeen: row.lastSeen,
      pages: row.pages.size, scans: row.scans, confidence: { min: row.min, max: row.max }
    })).sort((a, b) => rankOf(a.category) - rankOf(b.category) || b.scans - a.scans || a.name.localeCompare(b.name));

    // The timeline: the latest dated scans, oldest first, and the protections they found in the order of the table above
    const dated = entries.filter(item => timeOf(item) !== null).reverse();
    const limit = limitOf(options.limit);
    const shown = dated.slice(-limit);
    const found = shown.map(protectionsOf);
    const keys = new Set(found.flatMap(map => [...map.keys()]));
    const timeline = {
      total: dated.length, shown: shown.length, capped: dated.length > shown.length, limit,
      scans: shown.map(item => ({ id: item.id === undefined ? null : item.id, timestamp: timeOf(item), path: pathOf(item), httpStatus: HttpStatus.of(item.httpStatus) })),
      rows: protectionRows.filter(row => keys.has(row.key)).map(row => ({
        name: row.name, category: row.category,
        cells: found.map(map => {
          const hit = map.get(row.key);
          return hit ? { found: true, confidence: hit.confidence } : { found: false, confidence: null };
        })
      }))
    };

    const siteHosts = [...hosts].sort((a, b) => (a === key ? -1 : b === key ? 1 : a.localeCompare(b)));
    return {
      site: key, hosts: siteHosts, pages: pages.size, scans: entries.length, first, last,
      protections: protectionRows, timeline,
      statuses: [...statuses.values()].sort((a, b) => a.code - b.code), unknownStatus,
      changes: changes.sort((a, b) => (a.timestamp === null) - (b.timestamp === null) || (b.timestamp || 0) - (a.timestamp || 0))
    };
  }

  // ---- Exports ------------------------------------------------------------------------------------------------------------

  const iso = (ts) => (typeof ts === 'number' && Number.isFinite(ts) ? new Date(ts).toISOString() : null);

  /** The report as a JSON text: nothing but names, categories, counts, dates, page paths and statuses. */
  function toJSON(report, options = {}) {
    const r = report || build([], '');
    const data = {
      generator: 'Scrapfly Antibot Detector',
      kind: 'site-report',
      generatedAt: iso(typeof options.now === 'number' ? options.now : Date.now()),
      site: r.site,
      hosts: r.hosts.slice(),
      pages: r.pages,
      scans: r.scans,
      firstScan: iso(r.first),
      lastScan: iso(r.last),
      protections: r.protections.map(row => ({
        name: row.name, category: row.category, firstSeen: iso(row.firstSeen), lastSeen: iso(row.lastSeen),
        pages: row.pages, scans: row.scans, confidence: { min: row.confidence.min, max: row.confidence.max }
      })),
      timeline: {
        totalScans: r.timeline.total, shownScans: r.timeline.shown, capped: r.timeline.capped,
        scans: r.timeline.scans.map(scan => ({ timestamp: iso(scan.timestamp), path: scan.path, httpStatus: scan.httpStatus })),
        protections: r.timeline.rows.map(row => ({ name: row.name, category: row.category, confidence: row.cells.map(cell => (cell.found ? cell.confidence : false)) }))
      },
      httpStatuses: r.statuses.map(row => ({ code: row.code, scans: row.scans, lastSeen: iso(row.last) })),
      scansWithoutStatus: r.unknownStatus,
      changes: r.changes.map(row => ({ timestamp: iso(row.timestamp), host: row.host, path: row.path, added: row.added.slice(), removed: row.removed.slice() }))
    };
    return JSON.stringify(data, null, 2);
  }

  const plain = (key, fallback, ...args) => String(fallback).replace(/\{(\d)\}/g, (_, i) => args[Number(i)]);
  // Markdown and HTML characters are escaped: a name must not become an image, a link, HTML or a new table cell
  const md = (value) => oneLine(value).replace(/[\\`*_[\]<>|~#]/g, (c) => `\\${c}`);
  const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

  /** "70–95%", "95%", or '' when no score is known. */
  function confidenceText(range) {
    if (!range || range.min === null || range.max === null) return '';
    return range.min === range.max ? `${range.max}%` : `${range.min}–${range.max}%`;
  }

  /**
   * @param {object} report - build()
   * @param {{t?: Function, categoryLabel?: Function, dateText?: Function, number?: Function}} [options]
   *   t(key, fallback, ...args) translates; categoryLabel(key) names a category; dateText(ms) writes a date
   */
  function toMarkdown(report, options = {}) {
    const r = report;
    const t = options.t || plain;
    const categoryLabel = options.categoryLabel || ((key) => key);
    const dateText = options.dateText || isoDay;
    const number = options.number || ((n) => String(n));
    const when = (ts) => (ts === null ? '–' : dateText(ts));
    const lines = [`# ${md(t('statsSiteReportForFmt', 'Site report: {0}', r.site || '?'))}`, ''];
    const range = r.first === null ? '–' : r.first === r.last || dateText(r.first) === dateText(r.last) ? dateText(r.last) : `${dateText(r.first)} – ${dateText(r.last)}`;
    lines.push(md(t('statsSiteSummaryFmt', 'Pages: {0} · Scans: {1} · {2}', number(r.pages), number(r.scans), range)), '');
    const others = r.hosts.filter(host => host !== r.site);
    if (others.length) lines.push(md(t('statsSiteAlsoFmt', 'Also saved as: {0}', others.join(', '))), '');

    lines.push(`## ${md(t('statsSiteProtections', 'Protections on this site'))}`, '');
    if (!r.protections.length) lines.push(md(t('statsSiteNoProtections', 'No protection found in this site\'s saved scans.')), '');
    else {
      const head = [t('statsProtectionColumn', 'Protection'), t('statsCategoryColumn', 'Category'), t('statsFirstSeenColumn', 'First seen'),
        t('statsLastSeenColumn', 'Last seen'), t('statsPagesColumn', 'Pages'), t('statsScansColumn', 'Scans'), t('statConfidence', 'Confidence')];
      lines.push(`| ${head.map(md).join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`);
      for (const row of r.protections) {
        lines.push(`| ${[row.name, categoryLabel(row.category), when(row.firstSeen), when(row.lastSeen), number(row.pages), number(row.scans), confidenceText(row.confidence) || '–'].map(md).join(' | ')} |`);
      }
      lines.push('');
    }

    lines.push(`## ${md(t('statsSiteTimeline', 'Timeline'))}`, '');
    if (r.timeline.capped) lines.push(md(t('statsSiteTimelineLimitFmt', 'Showing the latest {0} of {1} scans.', number(r.timeline.shown), number(r.timeline.total))), '');
    if (!r.timeline.scans.length) lines.push('–', '');
    else {
      // Newest first, as a list: one line a scan, with what it found
      for (let i = r.timeline.scans.length - 1; i >= 0; i--) {
        const scan = r.timeline.scans[i];
        const names = r.timeline.rows.filter(row => row.cells[i].found)
          .map(row => (row.cells[i].confidence === null ? row.name : `${row.name} ${row.cells[i].confidence}%`));
        const head = [dateText(scan.timestamp), scan.path, scan.httpStatus ? String(scan.httpStatus) : ''].filter(Boolean).join(' · ');
        lines.push(`- ${md(head)}: ${names.length ? names.map(md).join(', ') : '–'}`);
      }
      lines.push('');
    }

    lines.push(`## ${md(t('statsSiteStatuses', 'HTTP statuses'))}`, '');
    if (r.statuses.length) {
      const head = [t('statsHttpStatusColumn', 'HTTP status'), t('statsScansColumn', 'Scans'), t('statsLastSeenColumn', 'Last seen')];
      lines.push(`| ${head.map(md).join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`);
      for (const row of r.statuses) lines.push(`| ${[String(row.code), number(row.scans), when(row.last)].map(md).join(' | ')} |`);
      lines.push('');
    }
    if (r.unknownStatus) lines.push(md(t('statsSiteStatusUnknownFmt', 'Scans without a known status: {0}', number(r.unknownStatus))), '');
    if (!r.statuses.length && !r.unknownStatus) lines.push('–', '');

    lines.push(`## ${md(t('statsSiteChanges', 'Pages whose protections changed'))}`, '');
    if (!r.changes.length) lines.push(md(t('statsSiteNoChanges', 'No saved scan of this site changed its protections.')), '');
    else {
      for (const row of r.changes) {
        const parts = [...row.added.map(name => `+${md(name)}`), ...row.removed.map(name => `${MINUS}${md(name)}`)];
        lines.push(`- ${md(when(row.timestamp))} · ${md(row.host + row.path)}: ${parts.join(', ')}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  /** The local calendar day of a time, as YYYY-MM-DD. */
  const localDay = (ms) => {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  /** scrapfly-site-report-shop.example-2026-11-13.md: only letters, digits, dots and hyphens of the site are kept. */
  function filename(site, format, now = Date.now()) {
    const ext = format === 'json' ? 'json' : 'md';
    const safe = String(siteOf(site) || 'site').replace(/[^a-z0-9.-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 80) || 'site';
    return `scrapfly-site-report-${safe}-${localDay(now)}.${ext}`;
  }

  const api = { TIMELINE_LIMIT, siteOf, hostOf, entryHost, entriesOf, timeOf, pathOf, build, confidenceText, toJSON, toMarkdown, filename };
  root.SiteReport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
