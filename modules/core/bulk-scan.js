/**
 * Bulk scan: a list of pages scanned one at a time in a background tab (sections/bulk/, background/bulk-scan-runner.js).
 * Pure (no browser APIs), so the page, the service worker and the tests share it.
 *
 *   linesOf()        the addresses in a pasted list or an uploaded .txt/.csv (one per line; the first cell of a CSV row
 *                    that looks like an address)
 *   normalize()      one address as it is scanned: https:// added to a bare host, the #fragment dropped; or why not
 *   prepare()        the run's pages: de-duplicated, http/https only, the "Sites to scan" setting applied, at most
 *                    the cap; what is left out is listed as skipped with the reason (duplicates and the pages over the
 *                    cap are only counted)
 *   isSitemap(), parseSitemap()   a sitemap address, and the <loc> entries of a sitemap or a sitemap index
 *   createRun(), begin(), finish(), fail(), skip(), pause(), resume(), stop(), complete(), recover()
 *                    the run's states: running → paused → running, then done or stopped; recover() is what a service
 *                    worker that starts again does with a run it finds in session storage (nobody is scanning it any
 *                    more: it is stopped, never left "running")
 *   summarize()      the protections of a finished page, as the table and the exports show them
 *   build(), fileName()   the CSV and JSON exports
 */
(function(root) {
  'use strict';

  const Categories = root.Categories || (typeof require === 'function' ? require('./categories.js') : undefined);

  const MAX_URLS = 200;            // pages per run, at most
  const TIMEOUT_S = Object.freeze({ min: 10, max: 120, default: 45 });
  const MAX_SKIPPED_LISTED = 200;  // skipped lines listed in the table; the rest are counted
  const ITEM_STATUSES = Object.freeze(['waiting', 'scanning', 'done', 'failed', 'skipped']);
  const RUN_STATUSES = Object.freeze(['running', 'paused', 'stopped', 'done']);
  /** Why a page was not scanned (skipped) or has no result (failed); the page shows each in words. */
  const REASONS = Object.freeze(['invalid', 'scheme', 'scope', 'sitemap', 'timeout', 'load', 'error', 'off']);
  const FORMATS = Object.freeze(['csv', 'json']);
  const TYPES = Object.freeze({ csv: 'text/csv', json: 'application/json' });

  const clampInt = (value, min, max, fallback) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const capOf = (value) => clampInt(value, 1, MAX_URLS, MAX_URLS);
  const timeoutOf = (value) => clampInt(value, TIMEOUT_S.min, TIMEOUT_S.max, TIMEOUT_S.default);

  /* ---------- Input ---------- */

  const unquote = (cell) => String(cell || '').trim().replace(/^["']+|["']+$/g, '').trim();
  const looksLikeAddress = (cell) => /^[a-z][a-z0-9+.-]*:/i.test(cell) || /^[^\s/:?#]+\.[^\s/:?#]+(:\d+)?([/?#]|$)/.test(cell);

  /**
   * The addresses of a pasted list or a .txt/.csv file: one per line, blank lines and # comments ignored; in a row with
   * commas, semicolons or tabs, the first cell that looks like an address (a header row like "url" gives none).
   * @param {string} text
   * @returns {string[]}
   */
  function linesOf(text) {
    const out = [];
    for (const raw of String(text || '').replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      if (/[,;\t]/.test(line)) {
        const cell = line.split(/[,;\t]/).map(unquote).find(looksLikeAddress);
        if (cell) out.push(cell);
        continue;
      }
      out.push(unquote(line));
    }
    return out.filter(Boolean);
  }

  /**
   * One address as it is scanned.
   * @param {string} raw
   * @returns {{url: string}|{error: 'invalid'|'scheme'}}
   */
  function normalize(raw) {
    let text = String(raw || '').trim();
    if (!text) return { error: 'invalid' };
    // A bare host or host/path is a web address
    // (host:port/path has a colon too: only scheme:// or a host-less scheme: such as mailto: names a scheme)
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && /^[^\s/:?#]+\.[^\s/:?#]+(:\d+)?([/?#]|$)/.test(text)) text = `https://${text}`;
    let parsed;
    try { parsed = new URL(text); } catch (_) { return { error: 'invalid' }; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { error: 'scheme' };
    if (!parsed.hostname) return { error: 'invalid' };
    parsed.hash = '';
    return { url: parsed.href };
  }

  const isSitemap = (url) => {
    try { return /\.xml$/i.test(new URL(url).pathname); } catch (_) { return false; }
  };

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const decode = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, name.toLowerCase()) ? ENTITIES[name.toLowerCase()] : match;
  });

  /**
   * The <loc> entries of a sitemap (pages) or of a sitemap index (more sitemaps).
   * @param {string} xml
   * @returns {{kind: 'urlset'|'sitemapindex'|null, locs: string[]}}
   */
  function parseSitemap(xml) {
    const text = String(xml || '');
    const kind = /<(?:[\w-]+:)?sitemapindex[\s>]/i.test(text) ? 'sitemapindex' : (/<(?:[\w-]+:)?urlset[\s>]/i.test(text) ? 'urlset' : null);
    const locs = [];
    for (const match of text.matchAll(/<(?:[\w-]+:)?loc\s*>([\s\S]*?)<\/(?:[\w-]+:)?loc\s*>/gi)) {
      const value = decode(match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim());
      if (value) locs.push(value);
    }
    return { kind, locs };
  }

  /**
   * The pages of a run.
   * @param {Array<string|{url: string, reason: string}>} entries  addresses, or lines already skipped (a sitemap that
   *   could not be read) with their reason
   * @param {{cap?: number, isExcluded?: (url: string) => boolean}} [options]  isExcluded: the "Sites to scan" setting
   * @returns {{items: Array<{url: string, status: string, reason?: string}>, duplicates: number, overCap: number, skippedOver: number}}
   */
  function prepare(entries, options = {}) {
    const cap = capOf(options.cap);
    const isExcluded = typeof options.isExcluded === 'function' ? options.isExcluded : () => false;
    const seen = new Set();
    const items = [];
    let scannable = 0;
    let duplicates = 0;
    let overCap = 0;
    let skippedListed = 0;
    let skippedOver = 0;
    const skip = (url, reason) => {
      if (skippedListed >= MAX_SKIPPED_LISTED) { skippedOver++; return; }
      skippedListed++;
      items.push({ url: String(url || '').slice(0, 2048), status: 'skipped', reason });
    };
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry && typeof entry === 'object') {
        skip(entry.url, REASONS.includes(entry.reason) ? entry.reason : 'invalid');
        continue;
      }
      const normal = normalize(entry);
      const key = normal.url || String(entry).trim();
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      if (normal.error) { skip(entry, normal.error); continue; }
      if (isExcluded(normal.url)) { skip(normal.url, 'scope'); continue; }
      if (scannable >= cap) { overCap++; continue; }
      scannable++;
      items.push({ url: normal.url, status: 'waiting' });
    }
    return { items, duplicates, overCap, skippedOver };
  }

  /* ---------- The run ---------- */

  /**
   * @param {{items: Array, duplicates?: number, overCap?: number, skippedOver?: number}} prepared
   * @param {{timeoutSec?: number, cap?: number, now?: number, id?: string}} [options]
   */
  function createRun(prepared, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    return {
      id: options.id || `bulk_${now}`,
      status: 'running',
      reason: null,
      startedAt: now,
      finishedAt: null,
      timeoutSec: timeoutOf(options.timeoutSec),
      cap: capOf(options.cap),
      duplicates: prepared.duplicates || 0,
      overCap: prepared.overCap || 0,
      skippedOver: prepared.skippedOver || 0,
      items: (prepared.items || []).map(item => ({ ...item }))
    };
  }

  const isActive = (run) => !!run && (run.status === 'running' || run.status === 'paused');
  const nextWaiting = (run) => (run && Array.isArray(run.items) ? run.items.findIndex(item => item.status === 'waiting') : -1);

  function counts(run) {
    const out = { total: 0, waiting: 0, scanning: 0, done: 0, failed: 0, skipped: 0, found: 0 };
    for (const item of (run && run.items) || []) {
      out.total++;
      if (out[item.status] !== undefined) out[item.status]++;
      if (item.status === 'done' && Array.isArray(item.detections) && item.detections.length) out.found++;
    }
    return out;
  }

  const itemAt = (run, index) => (run && run.items && run.items[index]) || null;

  function begin(run, index, now = Date.now()) {
    const item = itemAt(run, index);
    if (!item || run.status !== 'running' || item.status !== 'waiting') return false;
    item.status = 'scanning';
    item.startedAt = now;
    return true;
  }

  function finish(run, index, outcome = {}, now = Date.now()) {
    const item = itemAt(run, index);
    if (!item || item.status !== 'scanning') return false;
    item.status = 'done';
    item.finishedAt = now;
    item.detections = Array.isArray(outcome.detections) ? outcome.detections : [];
    item.difficulty = outcome.difficulty || '';
    if (outcome.finalUrl && outcome.finalUrl !== item.url) item.finalUrl = outcome.finalUrl;
    return true;
  }

  function fail(run, index, reason = 'error', now = Date.now()) {
    const item = itemAt(run, index);
    if (!item || item.status !== 'scanning') return false;
    item.status = 'failed';
    item.reason = REASONS.includes(reason) ? reason : 'error';
    item.finishedAt = now;
    return true;
  }

  function skip(run, index, reason, now = Date.now()) {
    const item = itemAt(run, index);
    if (!item || (item.status !== 'scanning' && item.status !== 'waiting')) return false;
    item.status = 'skipped';
    item.reason = REASONS.includes(reason) ? reason : 'invalid';
    item.finishedAt = now;
    return true;
  }

  function pause(run) {
    if (!run || run.status !== 'running') return false;
    run.status = 'paused';
    return true;
  }

  function resume(run) {
    if (!run || run.status !== 'paused') return false;
    run.status = 'running';
    return true;
  }

  /**
   * Stop a run: the page being scanned goes back to waiting (it has no result), the others keep theirs.
   * @param {string} [reason] 'user' | 'restart' | 'no_window' | 'off'
   */
  function stop(run, reason = 'user', now = Date.now()) {
    if (!isActive(run)) return false;
    for (const item of run.items) {
      if (item.status === 'scanning') { item.status = 'waiting'; delete item.startedAt; }
    }
    run.status = 'stopped';
    run.reason = reason;
    run.finishedAt = now;
    return true;
  }

  /** Every page has its outcome: the run is done. */
  function complete(run, now = Date.now()) {
    if (!isActive(run) || nextWaiting(run) !== -1 || run.items.some(item => item.status === 'scanning')) return false;
    run.status = 'done';
    run.finishedAt = now;
    return true;
  }

  /** A run found by a service worker that has just started: whatever it says, nothing scans it any more. */
  function recover(run, now = Date.now()) {
    if (!run || typeof run !== 'object' || !Array.isArray(run.items)) return null;
    if (isActive(run)) stop(run, 'restart', now);
    return run;
  }

  /* ---------- Results ---------- */

  const detectionName = (d) => String((d && ((d.detector && typeof d.detector === 'object' && d.detector.name) || d.name || (typeof d.detector === 'string' && d.detector))) || '').trim();

  /**
   * The protections of a finished page, strongest first.
   * @param {Array<object>} results  the scan's detections
   * @param {(results: Array) => string} [difficultyOf]  the page difficulty the popup shows (DetectionUtils.getDifficultyLevel)
   * @returns {{detections: Array<{name: string, category: string, confidence: number|null}>, difficulty: string}}
   */
  function summarize(results, difficultyOf) {
    const list = (Array.isArray(results) ? results : []).filter(d => d && typeof d === 'object');
    const detections = list.map(d => ({
      name: detectionName(d) || '?',
      category: Categories ? Categories.keyOf(d) : String(d.category || ''),
      confidence: Number.isFinite(Number(d.confidence)) ? Math.round(Number(d.confidence)) : null
    })).sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || a.name.localeCompare(b.name));
    let difficulty = '';
    if (list.length && typeof difficultyOf === 'function') {
      try { difficulty = String(difficultyOf(list) || ''); } catch (_) { difficulty = ''; }
    }
    return { detections, difficulty };
  }

  /* ---------- Exports ---------- */

  /** A spreadsheet runs text that starts with = + - @ as a formula: the apostrophe keeps it text. */
  const csvCell = (value) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const iso = (ts) => (Number.isFinite(ts) ? new Date(ts).toISOString() : '');

  function buildCsv(run) {
    const header = ['url', 'status', 'reason', 'final_url', 'difficulty', 'protection', 'category', 'confidence', 'scanned_at'];
    const lines = [header.join(',')];
    for (const item of (run && run.items) || []) {
      const detections = Array.isArray(item.detections) && item.detections.length ? item.detections : [null];
      for (const d of detections) {
        lines.push([item.url, item.status, item.reason || '', item.finalUrl || '', item.difficulty || '',
          d ? d.name : '', d ? d.category : '', d && Number.isFinite(d.confidence) ? d.confidence : '',
          item.status === 'done' ? iso(item.finishedAt) : ''].map(csvCell).join(','));
      }
    }
    return `${lines.join('\r\n')}\r\n`;
  }

  function buildJson(run, now) {
    const items = (run && run.items) || [];
    return JSON.stringify({
      version: '1.0',
      type: 'bulk-scan',
      exportedAt: new Date(now).toISOString(),
      run: run ? {
        status: run.status, reason: run.reason || null, startedAt: iso(run.startedAt) || null, finishedAt: iso(run.finishedAt) || null,
        timeoutSec: run.timeoutSec, duplicates: run.duplicates || 0, overCap: run.overCap || 0, counts: counts(run)
      } : null,
      pages: items.map(item => ({
        url: item.url,
        status: item.status,
        reason: item.reason || null,
        finalUrl: item.finalUrl || null,
        difficulty: item.difficulty || null,
        scannedAt: item.status === 'done' ? iso(item.finishedAt) || null : null,
        detections: Array.isArray(item.detections) ? item.detections : []
      }))
    }, null, 2);
  }

  /**
   * @param {object} run
   * @param {{format?: 'csv'|'json', now?: number}} [options]
   * @returns {{text: string, type: string, extension: string}}
   */
  function build(run, options = {}) {
    const format = FORMATS.includes(options.format) ? options.format : 'json';
    const text = format === 'csv' ? buildCsv(run) : buildJson(run, Number.isFinite(options.now) ? options.now : Date.now());
    return { text, type: TYPES[format], extension: format };
  }

  /** scrapfly-bulk-scan-2026-10-26.csv (the day is the person's own: FormatUtils.localDay). */
  function fileName(format, day) {
    const ext = FORMATS.includes(format) ? format : 'json';
    const safeDay = /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) ? day : 'export';
    return `scrapfly-bulk-scan-${safeDay}.${ext}`;
  }

  const api = {
    MAX_URLS, TIMEOUT_S, MAX_SKIPPED_LISTED, ITEM_STATUSES, RUN_STATUSES, REASONS, FORMATS,
    capOf, timeoutOf, linesOf, normalize, isSitemap, parseSitemap, prepare,
    createRun, isActive, nextWaiting, counts, begin, finish, fail, skip, pause, resume, stop, complete, recover,
    summarize, build, fileName
  };
  root.BulkScan = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.BulkScan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
