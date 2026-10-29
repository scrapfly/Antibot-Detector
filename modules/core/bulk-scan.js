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
 *   continuation(), carryOver()   "Scan the pages still waiting": what a stopped run leaves to scan, and the pages that
 *                    already have their outcome, which stay in the list of the run that scans the rest
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
   * Reads one line the way a CSV does: commas, semicolons and tabs separate cells, except inside double quotes (a CSV
   * quotes a cell that holds a comma, and Bulk scan's own export does). `open` says a quoted cell is still open at the
   * end of the line (it goes on in the next one).
   * @param {string} line
   * @returns {{cells: string[], open: boolean}}
   */
  function scanLine(line) {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch !== '"') cell += ch;
        else if (line[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
        continue;
      }
      if (ch === '"' && !cell.trim()) { quoted = true; continue; }
      if (ch === ',' || ch === ';' || ch === '\t') { cells.push(cell); cell = ''; continue; }
      cell += ch;
    }
    cells.push(cell);
    return { cells: cells.map(unquote), open: quoted };
  }
  const cellsOf = (line) => scanLine(line).cells;

  // A quoted cell may hold a line break (a spreadsheet name or note): its lines are one row. A quote that is never
  // closed within a few lines is not a quoted cell, so a stray quote cannot swallow the list below it
  const MAX_QUOTED_LINES = 4;
  function logicalLines(text) {
    const raw = String(text || '').replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      let joined = raw[i];
      let last = i;
      while (scanLine(joined).open && last + 1 < raw.length && last - i < MAX_QUOTED_LINES - 1) joined += ` ${raw[++last]}`;
      if (last > i && !scanLine(joined).open) { out.push(joined); i = last; } else out.push(raw[i]);
    }
    return out;
  }

  /**
   * The parts of a line that is not a table row: one address, or several (a.com, b.com), or an address and a name. A
   * comma or semicolon ends an address when what came before is only a host (a host has none), or follows a "/" (no
   * path segment starts with one), or what follows is another address, or what follows has a space (an address has
   * none: it is a name or a note). Any other one belongs to the address: ?ids=1,2,3, ;jsessionid=…, Portland,_Oregon.
   * @param {string} line
   * @returns {string[]}
   */
  function partsOf(line) {
    const parts = [];
    let start = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== ',' && line[i] !== ';') continue;
      const before = line.slice(start, i);
      const after = line.slice(i + 1);
      const token = after.split(/[,;]/)[0];
      const ends = !/[/?#]/.test(before.replace(/^\s*[a-z][a-z0-9+.-]*:\/\//i, ''))
        || /\/$/.test(before)
        || /^\s*[a-z][a-z0-9+.-]*:\/\//i.test(after)
        || (/^\s/.test(token) && looksLikeAddress(token.trim()))
        || /\s/.test(token.trim());
      if (ends) { parts.push(before); start = i + 1; }
    }
    parts.push(line.slice(start));
    return parts.map(unquote);
  }

  /**
   * The addresses of a pasted list or a .txt/.csv file: one per line, blank lines and # comments ignored. The text is a
   * table when it has tabs or a header row (a row with no address, like "url,name"): every row's first address is its
   * page and the other columns are data. Otherwise a line holds an address, or several, or an address and a name (see
   * partsOf), and a row that starts with a quote is read as a quoted CSV row.
   * @param {string} text
   * @returns {string[]}
   */
  function linesOf(text) {
    const lines = logicalLines(text).map(raw => raw.trim()).filter(line => line && !line.startsWith('#'));
    const table = lines.some(line => line.includes('\t'))
      || lines.some(line => { const cells = cellsOf(line); return cells.length > 1 && !cells.some(looksLikeAddress); });
    const out = [];
    for (const line of lines) {
      const parts = table || /^"/.test(line) ? cellsOf(line) : partsOf(line);
      if (parts.length < 2) { out.push(unquote(line)); continue; }
      const addresses = parts.filter(looksLikeAddress);
      out.push(...(table ? addresses.slice(0, 1) : addresses));
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

  /**
   * What "Scan the pages still waiting" takes from a run that is over: the addresses still waiting, and the pages that
   * already have their outcome (done, failed or skipped), which stay in the list with their results.
   * @returns {{entries: string[], kept: object[], duplicates: number, overCap: number, skippedOver: number}|null} null when
   *   the run is still going or nothing waits
   */
  function continuation(run) {
    if (!run || typeof run !== 'object' || !Array.isArray(run.items) || isActive(run)) return null;
    const entries = run.items.filter(item => item.status === 'waiting').map(item => item.url);
    if (!entries.length) return null;
    return {
      entries,
      kept: run.items.filter(item => item.status !== 'waiting' && item.status !== 'scanning').map(item => ({ ...item })),
      duplicates: run.duplicates || 0, overCap: run.overCap || 0, skippedOver: run.skippedOver || 0
    };
  }

  /** Put the kept pages before the ones a new run scans, with the counts of what the first paste left out. */
  function carryOver(run, resumed) {
    if (!run || !resumed) return run;
    run.items = [...resumed.kept, ...run.items];
    run.duplicates = resumed.duplicates;
    run.overCap = (resumed.overCap || 0) + (run.overCap || 0);
    run.skippedOver = (resumed.skippedOver || 0) + (run.skippedOver || 0);
    return run;
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
    createRun, isActive, nextWaiting, counts, begin, finish, fail, skip, pause, resume, stop, complete, recover, continuation, carryOver,
    summarize, build, fileName
  };
  root.BulkScan = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.BulkScan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
