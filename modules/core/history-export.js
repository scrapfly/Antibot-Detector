/**
 * History export: the files the History tab's Export and the automatic backup write.
 * Pure (no browser APIs), so the popup, the service worker and the tests share it.
 *
 *   filter()    the entries an export dialog's choices select
 *   build()     one file's text for a list of entries, in JSON, CSV or plain text
 *   chunk()     the entries cut into parts that each stay under a size (a download of
 *               a data: URL cannot be larger than about 2 MB)
 *   fileName()  scrapfly-history-2026-10-19[-part-2].csv
 *
 * JSON is the format History imports again, so it always keeps every field and timestamp;
 * "Include timestamps" applies to the CSV and plain-text files.
 */
(function(root) {
  'use strict';

  // Loaded before this file in the popup and the worker; under Node it sits next to it
  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);

  const FORMATS = ['json', 'csv', 'txt'];
  const TYPES = { json: 'application/json', csv: 'text/csv', txt: 'text/plain' };
  const DAY_MS = 24 * 60 * 60 * 1000;

  const detectionName = (d) => String((d && ((d.detector && d.detector.name) || d.name)) || '').trim();
  const detectionCategory = (d) => String((d && (d.category || (d.detector && d.detector.category))) || '').trim();
  const categoryKey = (d) => Categories.keyOf(d);
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
    return list.filter((item) => {
      if (!item) return false;
      if (filters.pinnedOnly === true && item.pinned !== true) return false;
      if (filters.changedOnly === true && !item.changed) return false; // marked Changed by its latest scan
      if (cutoff !== null && timeOf(item) < cutoff) return false;
      if (domain && !`${item.hostname || ''} ${item.url || ''}`.toLowerCase().includes(domain)) return false;
      if (category && !(item.detections || []).some(d => categoryKey(d) === category)) return false;
      return true;
    });
  }

  /** A spreadsheet runs text that starts with = + - @ as a formula: the apostrophe keeps it text. */
  const guardCell = (value) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
  const csvCell = (value) => {
    const text = guardCell(String(value == null ? '' : value));
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const isoOf = (item) => { const t = timeOf(item); return t ? new Date(t).toISOString() : ''; };

  function buildCsv(items, includeTimestamps) {
    const header = ['url', 'hostname', 'title', ...(includeTimestamps ? ['timestamp'] : []), 'protection', 'category', 'confidence', 'difficulty', 'pinned', 'note'];
    const lines = [header.join(',')];
    for (const item of items) {
      const detections = (item.detections || []).length ? item.detections : [null];
      for (const d of detections) {
        lines.push([
          item.url, item.hostname, item.title, ...(includeTimestamps ? [isoOf(item)] : []),
          d ? detectionName(d) : '', d ? detectionCategory(d) : '', d && Number.isFinite(Number(d.confidence)) ? Math.round(Number(d.confidence)) : '',
          d ? (d.difficulty || (d.detector && d.detector.difficulty) || '') : '', item.pinned === true ? 'yes' : '', item.note || ''
        ].map(csvCell).join(','));
      }
    }
    return `${lines.join('\r\n')}\r\n`;
  }

  function buildText(items, includeTimestamps) {
    return items.map((item) => {
      const lines = [item.title || item.hostname || item.url || '', item.url || ''];
      if (includeTimestamps && timeOf(item)) lines.push(`Date: ${isoOf(item)}`);
      const found = (item.detections || []).map(d => `${detectionName(d)} (${detectionCategory(d)}${Number.isFinite(Number(d.confidence)) ? `, ${Math.round(Number(d.confidence))}%` : ''})`);
      lines.push(`Protections: ${found.length ? found.join('; ') : '-'}`);
      if (item.pinned === true) lines.push('Pinned');
      if (item.note) lines.push(`Note: ${item.note}`);
      return lines.join('\n');
    }).join('\n\n---\n\n').concat(items.length ? '\n' : '');
  }

  /**
   * @param {Array<object>} items
   * @param {{format?: string, includeTimestamps?: boolean, now?: number}} [options]
   * @returns {{text: string, type: string, extension: string, format: string}}
   */
  function build(items, options = {}) {
    const list = Array.isArray(items) ? items : [];
    const format = FORMATS.includes(options.format) ? options.format : 'json';
    const includeTimestamps = options.includeTimestamps !== false;
    let text;
    if (format === 'csv') text = buildCsv(list, includeTimestamps);
    else if (format === 'txt') text = buildText(list, includeTimestamps);
    else text = JSON.stringify({ version: '1.0', timestamp: new Date(options.now || Date.now()).toISOString(), itemsCount: list.length, items: list }, null, 2);
    return { text, type: TYPES[format], extension: format, format };
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
    return `scrapfly-history-${new Date(now).toISOString().split('T')[0]}${part > 0 ? `-part-${part}` : ''}.${ext}`;
  }

  const api = { FORMATS, filter, build, chunk, fileName };
  root.HistoryExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
