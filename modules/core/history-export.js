/**
 * History export: the files the History tab's Export and the automatic backup write.
 * Pure (no browser APIs), so the popup, the service worker and the tests share it.
 *
 *   filter()    the entries an export dialog's choices select
 *   build()     one file's text for a list of entries, in JSON, CSV or plain text
 *   oneLines()  a list of entries as one line each ("address: Cloudflare 95%, reCAPTCHA 70%"), for a chat or a ticket
 *   chunk()     the entries cut into parts that each stay under a size (a download of
 *               a data: URL cannot be larger than about 2 MB)
 *   fileName()  scrapfly-history-2026-10-19[-part-2].csv
 *
 * JSON is the format History imports again, so it always keeps every field and timestamp;
 * "Include timestamps" applies to the CSV and plain-text files. The page's HTTP status (3.1.9) is the CSV's last column
 * (http_status, so the columns a sheet already reads keep their places), a line of the text file and the Markdown table's last
 * column; an entry with no known status leaves it empty.
 */
(function(root) {
  'use strict';

  // The person's own calendar day (an export made after midnight is named for that day, not for UTC's)
  const localDay = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // Loaded before this file in the popup and the worker; under Node it sits next to it
  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);
  const HttpStatus = root.HttpStatus || (typeof require === 'function' ? require('./http-status.js') : undefined);
  /** An entry's HTTP status, or '' when it is not known. */
  const statusOf = (item) => (HttpStatus && item ? HttpStatus.of(item.httpStatus) : null) || '';

  const FORMATS = ['json', 'csv', 'txt', 'md'];
  const TYPES = { json: 'application/json', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown' };
  const DAY_MS = 24 * 60 * 60 * 1000;

  const detectionName = (d) => String((d && ((d.detector && d.detector.name) || d.name)) || '').trim();
  const detectionCategory = (d) => String((d && (d.category || (d.detector && d.detector.category))) || '').trim();
  const categoryKey = (d) => Categories.keyOf(d);
  // An entry's detections as a list of objects, whatever an old build or an imported file left there
  const detectionsOf = (item) => (item && Array.isArray(item.detections) ? item.detections.filter(d => d && typeof d === 'object') : []);
  /** Marked Changed, as the History chip counts it: a change record that names at least one protection. */
  const isChangedEntry = (item) => {
    const change = item && item.changed;
    const names = (value) => (Array.isArray(value) ? value : (typeof value === 'string' && value.trim() ? [value] : [])).filter(n => typeof n === 'string' && n.trim());
    return !!change && typeof change === 'object' && (names(change.added).length > 0 || names(change.removed).length > 0);
  };
  /** A typed host with letters (bücher.de) as the browser stores it (xn--bcher-kva.de); '' when it has none or is not a host. */
  const asciiHost = (text) => {
    if (!/[^\x00-\x7f]/.test(text)) return '';
    try {
      const host = new URL(`http://${text}`).hostname;
      return host && host !== text ? host : '';
    } catch (_) { return ''; }
  };

  const timeOf = (item) => {
    const ts = item && item.timestamp;
    const n = typeof ts === 'number' ? ts : Date.parse(ts);
    return Number.isFinite(n) ? n : 0;
  };

  /**
   * @param {Array<object>} items
   * @param {{category?: string, days?: number, domain?: string, pinnedOnly?: boolean, changedOnly?: boolean}} [filters]
   *   category: 'all' | 'antibot' | 'captcha' | 'fingerprint'; days: 0 = all time; domain: part of the host or address
   */
  function filter(items, filters = {}, now = Date.now()) {
    const list = Array.isArray(items) ? items : [];
    const category = filters.category && filters.category !== 'all' ? String(filters.category) : '';
    const days = parseInt(filters.days, 10);
    const cutoff = days > 0 ? now - days * DAY_MS : null;
    const domain = String(filters.domain || '').trim().toLowerCase();
    // History stores addresses as the browser writes them (bücher.de is xn--bcher-kva.de): the box finds both spellings
    const domainNeedles = domain ? [domain, asciiHost(domain)].filter(Boolean) : [];
    return list.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      if (filters.pinnedOnly === true && item.pinned !== true) return false;
      if (filters.changedOnly === true && !isChangedEntry(item)) return false; // marked Changed by its latest scan
      if (cutoff !== null && timeOf(item) < cutoff) return false;
      if (domain && !domainNeedles.some(needle => `${item.hostname || ''} ${item.url || ''}`.toLowerCase().includes(needle))) return false;
      if (category && !detectionsOf(item).some(d => categoryKey(d) === category)) return false;
      return true;
    });
  }

  /** A spreadsheet runs text that starts with = + - @ as a formula: the apostrophe keeps it text. */
  const guardCell = (value) => (/^(?:\s*[=+\-@]|[\t\r])/.test(value) ? `'${value}` : value);
  const csvCell = (value) => {
    const text = guardCell(String(value == null ? '' : value));
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const isoOf = (item) => {
    const t = timeOf(item);
    const date = t ? new Date(t) : null;
    // A date outside what a Date holds (a hand-edited file) is left empty: one such entry must not stop the whole export
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
  };

  function buildCsv(items, includeTimestamps) {
    const header = ['url', 'hostname', 'title', ...(includeTimestamps ? ['timestamp'] : []), 'protection', 'category', 'confidence', 'difficulty', 'pinned', 'note', 'http_status'];
    const lines = [header.join(',')];
    for (const item of items.filter(i => i && typeof i === 'object')) {
      const detections = detectionsOf(item).length ? detectionsOf(item) : [null];
      for (const d of detections) {
        lines.push([
          item.url, item.hostname, item.title, ...(includeTimestamps ? [isoOf(item)] : []),
          d ? detectionName(d) : '', d ? detectionCategory(d) : '', d && Number.isFinite(Number(d.confidence)) ? Math.round(Number(d.confidence)) : '',
          d ? (d.difficulty || (d.detector && d.detector.difficulty) || '') : '', item.pinned === true ? 'yes' : '', item.note || '', statusOf(item)
        ].map(csvCell).join(','));
      }
    }
    return `${lines.join('\r\n')}\r\n`;
  }

  function buildText(items, includeTimestamps) {
    return items.filter(i => i && typeof i === 'object').map((item) => {
      const lines = [item.title || item.hostname || item.url || '', item.url || ''];
      if (includeTimestamps && timeOf(item)) lines.push(`Date: ${isoOf(item)}`);
      if (statusOf(item)) lines.push(`HTTP status: ${statusOf(item)}`);
      const found = detectionsOf(item).map(d => `${detectionName(d)} (${detectionCategory(d)}${Number.isFinite(Number(d.confidence)) ? `, ${Math.round(Number(d.confidence))}%` : ''})`);
      lines.push(`Protections: ${found.length ? found.join('; ') : '-'}`);
      if (item.pinned === true) lines.push('Pinned');
      if (item.note) lines.push(`Note: ${item.note}`);
      return lines.join('\n');
    }).join('\n\n---\n\n').concat(items.length ? '\n' : '');
  }

  /** A Markdown table, one row per page; a pipe or line break in a cell cannot break it. */
  // Markdown and HTML characters are escaped: a page title must not become an image, a link or a new row when pasted
  const mdCell = (value) => String(value == null ? '' : value).replace(/[\\`*_[\]<>|~]/g, (c) => `\\${c}`).replace(/[\r\n]+/g, ' ').trim();
  /** The page's address without its query and fragment, as every other copy for tickets and chats gives it (tokens live there). */
  function addressOf(url) {
    const text = String(url || '');
    try { const u = new URL(text); return `${u.origin}${u.pathname}`; } catch (_) { return text.split('#')[0].split('?')[0]; }
  }

  /**
   * The address cell, as an autolink: an underscore or a tilde in a path needs no backslash, and an escaped one ends the link where
   * the backslash is (or shows it, in a chat that does not render Markdown). Anything that is not a plain http(s) address is
   * escaped like any other text.
   */
  function mdAddress(url) {
    const address = addressOf(url);
    return /^https?:\/\/[^\s<>]+$/i.test(address) ? `<${address.replace(/\|/g, '\\|')}>` : mdCell(address);
  }

  function buildMarkdown(items, includeTimestamps) {
    const header = ['Page', 'Address', ...(includeTimestamps ? ['Date'] : []), 'Protections', 'Pinned', 'Note', 'HTTP status'];
    const lines = ['# Scrapfly Antibot Detector: History', '', `| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`];
    for (const item of items.filter(i => i && typeof i === 'object')) {
      const found = detectionsOf(item).map(d => `${detectionName(d)} (${detectionCategory(d)}${Number.isFinite(Number(d.confidence)) ? `, ${Math.round(Number(d.confidence))}%` : ''})`);
      lines.push(`| ${[mdCell(item.title || item.hostname || ''), mdAddress(item.url), ...(includeTimestamps ? [mdCell(isoOf(item))] : []),
        mdCell(found.length ? found.join('; ') : '-'), mdCell(item.pinned === true ? 'yes' : ''), mdCell(item.note || ''), mdCell(statusOf(item))].join(' | ')} |`);
    }
    return `${lines.join('\n')}\n`;
  }

  /**
   * @param {Array<object>} items
   * @param {{format?: string, includeTimestamps?: boolean, now?: number}} [options]
   * @returns {{text: string, fileText: string, type: string, extension: string, format: string}}
   *   fileText is what goes in a file: text, with the byte-order mark a CSV needs for a spreadsheet to read UTF-8
   */
  function build(items, options = {}) {
    const list = Array.isArray(items) ? items : [];
    const format = FORMATS.includes(options.format) ? options.format : 'json';
    const includeTimestamps = options.includeTimestamps !== false;
    let text;
    if (format === 'csv') text = buildCsv(list, includeTimestamps);
    else if (format === 'txt') text = buildText(list, includeTimestamps);
    else if (format === 'md') text = buildMarkdown(list, includeTimestamps);
    else text = JSON.stringify({ version: '1.0', timestamp: new Date(options.now || Date.now()).toISOString(), itemsCount: list.length, items: list }, null, 2);
    // Excel on Windows reads a CSV without the mark as ANSI: a title like "Café – 東京" arrives as garbage
    return { text, fileText: format === 'csv' ? `\uFEFF${text}` : text, type: TYPES[format], extension: format, format };
  }

  // ---- One line per entry (the Select bar's "Copy as lines") -----------------------------------------------------------------

  // A line is one line: whatever would break a text in two (a name from a custom rule, an address from an imported file) is a space
  const oneLine = (value) => String(value == null ? '' : value).replace(/[\r\n\u0085\u2028\u2029]+/g, ' ').trim();
  /** An entry's score as a whole number; null when it has none (no score is not a score of 0). */
  const scoreOf = (d) => {
    const raw = d && d.confidence;
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  /**
   * The address a line gives: origin and path, never the query, the fragment or a login (tokens live there). One that cannot be read
   * (or has no origin of its own, like a file) is its text cut before the first ? or #; an entry with no address gives its host name.
   */
  function lineAddress(item) {
    const text = String((item && item.url) || '').trim();
    if (!text) return String((item && item.hostname) || '').trim();
    try {
      const parsed = new URL(text);
      if (parsed.origin !== 'null') return `${parsed.origin}${parsed.pathname}`;
    } catch (_) { /* not an address: its text, cut below */ }
    return text.split('#')[0].split('?')[0];
  }

  /**
   * One line per entry, newline-separated: "https://shop.example/cart: Cloudflare 95%, reCAPTCHA 70%", or "address: -" when nothing
   * was found. Names and scores only: no cookie or header value, no query string. Written as Bulk scan's "Copy as lines" writes its
   * pages and as the Detection tab's one-line copy writes its protections.
   * @param {Array<object>} items - History entries, in the order the lines should come
   * @returns {string} '' when there is no entry
   */
  function oneLines(items) {
    return (Array.isArray(items) ? items : []).filter(item => item && typeof item === 'object').map((item) => {
      const found = detectionsOf(item).map((d) => {
        const score = scoreOf(d);
        return `${oneLine(detectionName(d)) || '?'}${score === null ? '' : ` ${score}%`}`;
      });
      return `${oneLine(lineAddress(item)) || '?'}: ${found.length ? found.join(', ') : '-'}`;
    }).join('\n');
  }

  const byteLength = (text) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length);

  /** The entries in parts whose files each stay under about `maxBytes` of UTF-8 (an entry bigger than that gets its own). */
  function chunk(items, options = {}, maxBytes = 1000000) {
    const list = Array.isArray(items) ? items : [];
    const parts = [];
    let current = [];
    let size = 0;
    for (const item of list) {
      const cost = byteLength(build([item], options).text);
      if (current.length && size + cost > maxBytes) { parts.push(current); current = []; size = 0; }
      current.push(item);
      size += cost;
    }
    if (current.length) parts.push(current);
    return parts;
  }

  /** scrapfly-history-2026-10-19.csv, or ...-part-2.csv when the export is in several files. */
  function fileName(format, now = Date.now(), part = 0) {
    const ext = FORMATS.includes(format) ? format : 'json';
    return `scrapfly-history-${localDay(now)}${part > 0 ? `-part-${part}` : ''}.${ext}`;
  }

  const api = { FORMATS, filter, build, oneLines, chunk, fileName };
  root.HistoryExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
