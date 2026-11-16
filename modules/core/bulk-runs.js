/**
 * Bulk scan: the finished runs kept to compare a new run of the same list with, and to show again after the browser restarts
 * (the run itself lives in chrome.storage.session, which a restart empties). Pure (no browser APIs): the service worker
 * writes the store (background/bulk-scan-runner.js, the only writer besides Settings → Data → Clear), the Bulk page reads it,
 * and the tests share it.
 *
 *   KEY            the chrome.storage.local key: { version, lists: [{ key, latest, previous? }] }, the list run last first
 *   listKey()      a list: the set of its pages (the addresses that were scanned, or would be), whatever their order
 *   slim()         what is kept of a finished run: addresses, outcomes, protection names and confidences, HTTP status, times.
 *                  Never cookie or header values, evidence, or the person's own CSV columns
 *   remember()     the store with a finished run added: its list goes first, the run before it of the same list is kept as
 *                  `previous`, at most MAX_LISTS lists and about MAX_BYTES in all
 *   previousFor()  the earlier run of a run's list (the one to compare with), or null
 *   latest()       the run finished last, of any list (the Bulk page shows it when no run is in session storage)
 *   fromExport()   a Bulk scan JSON export read back as a run to compare with, checked and capped, or why not
 *   normalizeStore()   what is stored, checked (anything else is an empty store)
 */
(function(root) {
  'use strict';

  const BulkScan = root.BulkScan || (typeof require === 'function' ? require('./bulk-scan.js') : undefined);

  const KEY = 'scrapfly_bulk_runs';
  const VERSION = 1;
  const MAX_LISTS = 5;
  const MAX_BYTES = 1500000;          // the whole store, about (chrome.storage.local holds History too)
  const MAX_ITEMS = 1000;             // pages of one kept run (a run has at most 200 scanned and 200 skipped listed)
  const MAX_DETECTIONS = 64;          // protections kept per page: more than a page finds, or the next run reads the rest as new
  const MAX_NAME = 100;
  const MAX_URL = (BulkScan && BulkScan.KEPT_URL) || 2048;   // a longer address is kept shortened (BulkScan.diff finds it so)
  const MAX_IMPORT_CHARS = 8 * 1024 * 1024;  // an export file read back, at most
  const STATUSES = Object.freeze(['waiting', 'scanning', 'done', 'failed', 'skipped']);
  const RUN_STATUSES = Object.freeze(['running', 'paused', 'stopped', 'done']);

  const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
  const time = (value) => {
    if (Number.isFinite(value)) return value;
    const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  };
  const int = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Math.round(Number(value)) : null);

  /** Two 32-bit hashes of a text, as one hex key: a list's identity without keeping its addresses twice. */
  function hash(value) {
    let a = 0x811c9dc5;
    let b = 5381;
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193) >>> 0;
      b = (Math.imul(b, 33) + c) >>> 0;
    }
    return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
  }

  /**
   * A list's key: the set of its pages, as they are scanned (BulkScan.normalize), in any order and without repeats. A page
   * skipped (not an address, a sitemap that could not be read, refused by Sites to scan) is not part of it: Run again leaves
   * those out. '' for a run with no page to scan.
   */
  function listKey(run) {
    const pages = new Set();
    for (const item of (run && Array.isArray(run.items) ? run.items : [])) {
      if (!item || item.status === 'skipped' || typeof item.url !== 'string') continue;
      // As a kept run holds it (an address over KEPT_URL shortened): a run and its kept copy are one list
      const key = BulkScan.keptKeyOf(item.url);
      if (key) pages.add(key);
    }
    if (!pages.size) return '';
    const sorted = [...pages].sort();
    return `${sorted.length}:${hash(sorted.join('\n'))}`;
  }

  function slimDetection(d) {
    if (!isObject(d)) return null;
    const name = text(d.name, MAX_NAME).trim() || text(d.detector && d.detector.name, MAX_NAME).trim();
    if (!name) return null;
    const confidence = int(d.confidence);
    return { name, category: text(d.category, 40), confidence: confidence === null ? null : Math.max(0, Math.min(100, confidence)) };
  }

  function slimItem(item) {
    if (!isObject(item) || typeof item.url !== 'string' || !item.url) return null;
    const status = STATUSES.includes(item.status) ? item.status : 'waiting';
    const out = { url: item.url.slice(0, MAX_URL), status };
    if (typeof item.reason === 'string' && BulkScan.REASONS.includes(item.reason)) out.reason = item.reason;
    if (typeof item.finalUrl === 'string' && item.finalUrl && item.finalUrl !== item.url) out.finalUrl = item.finalUrl.slice(0, MAX_URL);
    const code = int(item.httpStatus);
    if (status === 'done' && code && code >= 100 && code <= 599) out.httpStatus = code;
    if (status === 'done' && typeof item.difficulty === 'string' && /^(Low|Medium|High)$/.test(item.difficulty)) out.difficulty = item.difficulty;
    const finishedAt = time(item.finishedAt !== undefined ? item.finishedAt : item.scannedAt);
    if (finishedAt) out.finishedAt = finishedAt;
    if (status === 'done') out.detections = (Array.isArray(item.detections) ? item.detections : []).map(slimDetection).filter(Boolean).slice(0, MAX_DETECTIONS);
    return out;
  }

  /** What is kept of a run. */
  function slim(run) {
    if (!isObject(run) || !Array.isArray(run.items)) return null;
    return {
      id: text(run.id, 80) || `bulk_${time(run.startedAt) || 0}`,
      status: RUN_STATUSES.includes(run.status) ? run.status : 'done',
      startedAt: time(run.startedAt),
      finishedAt: time(run.finishedAt),
      timeoutSec: BulkScan.timeoutOf(run.timeoutSec),
      delaySec: BulkScan.delayOf(run.delaySec),
      cap: BulkScan.capOf(run.cap),
      items: run.items.slice(0, MAX_ITEMS).map(slimItem).filter(Boolean)
    };
  }

  const sizeOf = (value) => {
    const json = JSON.stringify(value);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(json).length;
    return json.length;
  };

  /** What is stored, checked: a store with at most MAX_LISTS lists, each with its latest run. */
  function normalizeStore(raw) {
    const lists = [];
    if (isObject(raw) && raw.version === VERSION && Array.isArray(raw.lists)) {
      for (const entry of raw.lists) {
        if (lists.length >= MAX_LISTS) break;
        if (!isObject(entry) || typeof entry.key !== 'string' || !entry.key || lists.some(l => l.key === entry.key)) continue;
        const latest = slim(entry.latest);
        if (!latest) continue;
        const previous = slim(entry.previous);
        lists.push(previous ? { key: entry.key, latest, previous } : { key: entry.key, latest });
      }
    }
    return { version: VERSION, lists };
  }

  /** Within MAX_BYTES: the lists run longest ago go first, then the earlier run of the one that is left. */
  function bound(store, maxBytes = MAX_BYTES) {
    while (store.lists.length > 1 && sizeOf(store) > maxBytes) store.lists.pop();
    if (store.lists.length && sizeOf(store) > maxBytes) delete store.lists[0].previous;
    if (store.lists.length && sizeOf(store) > maxBytes) store.lists = [];
    return store;
  }

  /**
   * The store with a finished run added. Only a run that is done, with at least one page scanned or tried, is kept: a stopped
   * run is not the list's result, and its pages still waiting would read as changes.
   * @returns {object} the new store (the one given is not changed)
   */
  function remember(raw, run, options = {}) {
    const store = normalizeStore(raw);
    if (!isObject(run) || run.status !== 'done') return store;
    const key = listKey(run);
    if (!key) return store;
    const kept = slim(run);
    const at = store.lists.findIndex(entry => entry.key === key);
    const entry = at === -1 ? null : store.lists.splice(at, 1)[0];
    let next = { key, latest: kept };
    if (entry) {
      // The same run recorded again (a worker that finished it twice) keeps the run before it
      const previous = entry.latest.id === kept.id ? entry.previous : entry.latest;
      if (previous) next = { key, latest: kept, previous };
    }
    store.lists.unshift(next);
    store.lists = store.lists.slice(0, MAX_LISTS);
    return bound(store, Number.isFinite(options.maxBytes) ? options.maxBytes : MAX_BYTES);
  }

  /** The earlier run of a run's list: the list's last run, or the one before it when the last one is this run. */
  function previousFor(raw, run) {
    const key = listKey(run);
    if (!key) return null;
    const entry = normalizeStore(raw).lists.find(item => item.key === key);
    if (!entry) return null;
    if (run && entry.latest.id === run.id) return entry.previous || null;
    return entry.latest;
  }

  /** The run finished last, of any list. */
  function latest(raw) {
    const store = normalizeStore(raw);
    return store.lists.length ? store.lists[0].latest : null;
  }

  /**
   * A Bulk scan JSON export (BulkScan.build's) read back, to compare a run with.
   * @param {string} fileText
   * @returns {{ok: true, run: object}|{ok: false, error: 'large'|'invalid'|'empty'}}
   */
  function fromExport(fileText) {
    if (typeof fileText !== 'string') return { ok: false, error: 'invalid' };
    if (fileText.length > MAX_IMPORT_CHARS) return { ok: false, error: 'large' };
    let data;
    try { data = JSON.parse(fileText.replace(/^\uFEFF/, '')); } catch (_) { return { ok: false, error: 'invalid' }; }
    if (!isObject(data) || data.type !== 'bulk-scan' || !Array.isArray(data.pages)) return { ok: false, error: 'invalid' };
    const info = isObject(data.run) ? data.run : {};
    const run = slim({
      id: 'import',
      status: 'done',
      startedAt: info.startedAt,
      finishedAt: info.finishedAt || data.exportedAt,
      timeoutSec: info.timeoutSec,
      delaySec: info.delaySec,
      items: data.pages.slice(0, MAX_ITEMS).map(page => (isObject(page) ? { ...page, finishedAt: page.scannedAt } : null))
    });
    if (!run || !run.items.length) return { ok: false, error: 'empty' };
    return { ok: true, run };
  }

  const api = { KEY, VERSION, MAX_LISTS, MAX_BYTES, MAX_ITEMS, MAX_DETECTIONS, MAX_IMPORT_CHARS, listKey, slim, normalizeStore, remember, previousFor, latest, fromExport, sizeOf };
  root.BulkRuns = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.BulkRuns = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
