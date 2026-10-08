/**
 * HistoryStore - the one place that reads, parses and writes `scrapfly_history`.
 *
 * Ownership: the service worker is the only writer. Every write goes through
 * HistoryStore.mutate(), which chains read-modify-write steps on one in-memory
 * queue so a detection save, a retention prune and a popup action never
 * interleave and lose each other's changes. The popup asks the worker to
 * change history with the HISTORY_* messages below instead of writing storage
 * itself (it only holds a copy for display, so writing it back would undo any
 * entry the worker saved since the popup opened).
 *
 * Stored shape: a JSON string of { items: [...newest first], lastUpdated }.
 * Older builds also stored a bare array or an object; parse() accepts all three.
 *
 * Size: chrome.storage.local holds 10 MB for the whole extension, so every
 * write is compact JSON of slim entries (slimEntry keeps only what History,
 * Statistics and exports show) and stays under MAX_BYTES by dropping the
 * oldest entries. A write that still hits the quota first lets the worker
 * free detection-cache space (setQuotaRelief), then drops more and retries.
 */
(function initHistoryStore(root) {
  'use strict';

  const STORAGE_KEY = 'scrapfly_history';

  // History's share of the 10 MB quota (the stored JSON string is escaped
  // again by the browser, about 15% more); the detection cache, detectors and
  // settings use the rest. About 1,000 typical slim entries fit.
  const MAX_BYTES = 6 * 1024 * 1024;
  const MAX_VALUE_LENGTH = 300;
  // Found rows kept per detection for the combination checklist (ids are ~22 characters)
  const MAX_COMBO_FOUND = 32;
  const MAX_ID_LENGTH = 80;

  // The combination engine (loaded in the worker and the popup; required in Node tests)
  const combinationsEngine = () => root.DetectionCombinations
    || (typeof module !== 'undefined' && typeof require === 'function' ? require('../detection/detection-combinations.js') : null);

  // Optional async function the worker registers to free space elsewhere
  // (the detection cache, which rebuilds itself) before history entries go.
  // It must never wait on this store's queue.
  let quotaRelief = null;
  function setQuotaRelief(fn) {
    quotaRelief = typeof fn === 'function' ? fn : null;
  }

  const Messages = Object.freeze({
    DELETE_ITEMS: 'HISTORY_DELETE_ITEMS',   // { ids: [...] }
    REPLACE_ITEMS: 'HISTORY_REPLACE_ITEMS', // { items: [...], mode: 'merge' | 'replace', limit }
    CLEAR: 'HISTORY_CLEAR'
  });

  /**
   * Parse the stored value, keeping the container so extra fields survive a write.
   * @param {*} raw
   * @returns {{items: Array<object>, container: object|null}}
   */
  function parse(raw) {
    let value = raw;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch (_) {
        return { items: [], container: null };
      }
    }
    if (Array.isArray(value)) return { items: value, container: null };
    if (value && Array.isArray(value.items)) return { items: value.items, container: value };
    return { items: [], container: null };
  }

  /**
   * Stored value for a list of items: compact JSON.
   * @param {Array<object>} items
   * @param {object|null} [container]
   * @returns {string}
   */
  function serialize(items, container = null) {
    const data = Object.assign({}, container || {}, { items: Array.isArray(items) ? items : [], lastUpdated: Date.now() });
    return JSON.stringify(data);
  }

  const clip = (value) => {
    const text = String(value);
    return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
  };

  /** One match as History shows it: method, the matched value, its score. */
  function slimMatch(match) {
    if (!match || typeof match !== 'object') return null;
    const out = {};
    if (match.type) out.type = String(match.type);
    // History's renderers and the text export show the first of these that
    // is set, so only that one is kept (under its own key)
    const key = ['fullUrl', 'value', 'name', 'selector', 'pattern']
      .find(name => match[name] !== undefined && match[name] !== null && match[name] !== '');
    if (key) out[key] = clip(match[key]);
    if (Number.isFinite(match.confidence)) out.confidence = match.confidence;
    return out;
  }

  /** One detection as History, Statistics and exports read it. */
  function slimDetection(detection) {
    if (!detection || typeof detection !== 'object') return detection;
    const detector = detection.detector && typeof detection.detector === 'object' ? detection.detector : null;
    const out = {};
    if (detector) {
      out.detector = {};
      for (const key of ['id', 'name']) if (detector[key]) out.detector[key] = detector[key];
      // Only when the detection itself does not carry them
      if (detector.category && !detection.category) out.detector.category = detector.category;
      if (detector.difficulty && !detection.difficulty) out.detector.difficulty = detector.difficulty;
    } else if (detection.detector !== undefined) {
      out.detector = detection.detector;
    }
    for (const key of ['name', 'category', 'difficulty', 'confidence']) {
      if (detection[key] !== undefined && detection[key] !== null) out[key] = detection[key];
    }
    if (Array.isArray(detection.combinations) && detection.combinations.length) {
      // History shows each combination as a checklist read from the rule as it
      // is now: per combination its id, score and a key of its rule (h), and
      // per detection the found rows the rule alone does not imply. The name
      // comes from the rule; it is kept only when the rule cannot be found by id.
      const engine = combinationsEngine();
      const extra = new Set((Array.isArray(detection.comboFound) ? detection.comboFound : []).filter(item => typeof item === 'string'));
      out.combinations = detection.combinations.map(combo => {
        if (!combo || typeof combo !== 'object') return {};
        const fromScan = engine && combo.id && combo.when && typeof combo.when === 'object';
        const kept = {};
        if (combo.id) kept.id = combo.id;
        if (combo.name && !fromScan) kept.name = combo.name;
        if (Number.isFinite(combo.confidence)) kept.confidence = combo.confidence;
        if (fromScan) {
          kept.h = engine.treeKey(combo.when);
          const implied = new Set(engine.mustHaveFound(combo.when));
          for (const item of (Array.isArray(combo.found) ? combo.found : [])) {
            if (typeof item === 'string' && !implied.has(item)) extra.add(item);
          }
        } else if (typeof combo.h === 'string') {
          kept.h = combo.h;
        }
        return kept;
      });
      if (extra.size) out.comboFound = [...extra].slice(0, MAX_COMBO_FOUND).map(item => item.slice(0, MAX_ID_LENGTH));
    }
    if (Array.isArray(detection.matches)) out.matches = detection.matches.map(slimMatch).filter(Boolean);
    return out;
  }

  /** A history entry without rule descriptions, icons and engine bookkeeping. */
  function slimEntry(entry) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.detections)) return entry;
    return { ...entry, detections: entry.detections.map(slimDetection) };
  }

  /**
   * Stored value from already serialized items (one JSON.stringify per item).
   * @param {Array<string>} parts
   * @param {object|null} container
   * @returns {string}
   */
  function joinParts(parts, container) {
    const meta = Object.assign({}, container || {});
    delete meta.items;
    meta.lastUpdated = Date.now();
    const rest = JSON.stringify(meta).slice(1, -1);
    return `{"items":[${parts.join(',')}]${rest ? `,${rest}` : ''}}`;
  }

  /**
   * Newest entries that fit in `maxBytes` once serialized, as JSON parts.
   * @returns {{parts: Array<string>, items: Array<object>, dropped: number}}
   */
  function budgetParts(items, maxBytes = MAX_BYTES, container = null) {
    const list = Array.isArray(items) ? items : [];
    let used = joinParts([], container).length;
    const parts = [];
    for (const item of list) {
      const json = JSON.stringify(item);
      // Always keep the newest entry, even when it alone is over budget
      if (parts.length > 0 && used + json.length + 1 > maxBytes) break;
      used += json.length + 1;
      parts.push(json);
    }
    return { parts, items: list.slice(0, parts.length), dropped: list.length - parts.length };
  }

  /**
   * Newest entries that fit in `maxBytes` once serialized.
   * @returns {{items: Array<object>, dropped: number}}
   */
  function fitToBudget(items, maxBytes = MAX_BYTES, container = null) {
    const { items: kept, dropped } = budgetParts(items, maxBytes, container);
    return { items: kept, dropped };
  }

  const isQuotaError = (error) => /quota/i.test(String(error && (error.message || error)));

  /**
   * Write items within the budget. If the browser still reports the quota
   * (the rest of storage grew), let the registered relief free space once,
   * then keep the newest half and try again.
   * @returns {Promise<{items: Array<object>, dropped: number, bytes: number}>}
   */
  async function write(storage, items, container = null) {
    let { parts, items: kept, dropped } = budgetParts(items.map(slimEntry), MAX_BYTES, container);
    let relieved = false;
    for (;;) {
      const value = joinParts(parts, container);
      try {
        await storage.set({ [STORAGE_KEY]: value });
        return { items: kept, dropped, bytes: value.length };
      } catch (error) {
        if (!isQuotaError(error)) throw error;
        if (!relieved && quotaRelief) {
          relieved = true;
          try { await quotaRelief(); } catch (_) { /* fall through to trimming */ }
          continue;
        }
        if (kept.length <= 1) throw error;
        const half = Math.ceil(kept.length / 2);
        dropped += kept.length - half;
        kept = kept.slice(0, half);
        parts = parts.slice(0, half);
      }
    }
  }

  /** Read the stored items. */
  async function read(storage) {
    const result = await storage.get([STORAGE_KEY]);
    return parse(result[STORAGE_KEY]).items;
  }

  let queue = Promise.resolve();

  /**
   * Serialized read-modify-write. `fn(items)` returns the new item array, or
   * undefined / the same array to leave storage untouched. Resolves with
   * whatever `fn` produced as { items, changed, result }.
   * @param {(items: Array<object>) => (Array<object>|{items: Array<object>, result: *}|undefined|Promise)} fn
   * @param {object} [storage] - chrome.storage.local (injectable for tests)
   */
  function mutate(fn, storage = root.chrome && root.chrome.storage && root.chrome.storage.local) {
    const work = queue.catch(() => undefined).then(async () => {
      const stored = await storage.get([STORAGE_KEY]);
      const { items, container } = parse(stored[STORAGE_KEY]);
      const out = await fn(items.slice());
      const next = out && !Array.isArray(out) && Array.isArray(out.items) ? out.items : out;
      const result = out && !Array.isArray(out) ? out.result : undefined;
      if (!Array.isArray(next)) return { items, changed: false, result };
      const written = await write(storage, next, container);
      return { items: written.items, changed: true, result, dropped: written.dropped };
    });
    queue = work.catch(() => undefined);
    return work;
  }

  /**
   * Merge or replace with imported items; newest first, cut to `limit` (0 = none).
   * Pure, so the popup preview and the worker write agree.
   */
  function applyImport(current, imported, mode, limit) {
    let items;
    if (mode === 'merge') {
      const existing = new Set(current.map(item => item.id));
      items = [...imported.filter(item => !existing.has(item.id)), ...current];
      items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } else {
      items = imported.slice();
    }
    const max = parseInt(limit, 10);
    return Number.isFinite(max) && max > 0 ? items.slice(0, max) : items;
  }

  /**
   * Register the worker-side handlers on a message registry
   * ({ [type]: ({ request, sendResponse }) => boolean }).
   */
  function registerHandlers(registry, storage) {
    const respond = (sendResponse, promise) => {
      promise
        .then(({ items, result }) => sendResponse({ status: 'ok', count: items.length, ...(result || {}) }))
        .catch(error => sendResponse({ status: 'error', error: error && error.message }));
      return true;
    };
    const store = () => storage || (root.chrome && root.chrome.storage && root.chrome.storage.local);
    // Only extension pages (popup, settings, stats) may change history, never a
    // content script inside a web page. Decide by the sender's URL: an extension
    // page opened in a tab also carries sender.tab, so that alone is not enough.
    const isExtensionPage = (sender) => {
      if (!sender) return true; // direct in-worker call
      const runtime = root.chrome && root.chrome.runtime;
      const base = runtime && typeof runtime.getURL === 'function' ? runtime.getURL('') : '';
      const url = String(sender.url || sender.origin || '');
      if (base && url.startsWith(base)) return true;
      return !sender.tab && !url; // no tab and no URL: another extension context
    };
    const guard = (handler) => (args) => {
      if (!isExtensionPage(args.sender)) {
        args.sendResponse({ status: 'error', error: 'History changes are only accepted from extension pages' });
        return false;
      }
      return handler(args);
    };

    registry[Messages.DELETE_ITEMS] = guard(({ request, sendResponse }) => {
      const ids = new Set(Array.isArray(request.ids) ? request.ids : []);
      return respond(sendResponse, mutate(items => {
        const kept = items.filter(item => !ids.has(item.id));
        return { items: kept, result: { removed: items.length - kept.length } };
      }, store()));
    });

    registry[Messages.REPLACE_ITEMS] = guard(({ request, sendResponse }) => {
      if (!Array.isArray(request.items)) {
        sendResponse({ status: 'error', error: 'items must be an array' });
        return true;
      }
      return respond(sendResponse, mutate(items => {
        const next = applyImport(items, request.items, request.mode, request.limit);
        return { items: next, result: { added: next.length - (request.mode === 'merge' ? items.length : 0) } };
      }, store()));
    });

    registry[Messages.CLEAR] = guard(({ sendResponse }) => respond(sendResponse, mutate(() => [], store())));
  }

  /**
   * Rewrite stored history compact and slim when it is not already, e.g. a
   * pretty-printed list saved by an older build. Writes nothing otherwise.
   * @returns {Promise<{changed: boolean, before: number, after: number, dropped: number}>}
   */
  function compact(storage = root.chrome && root.chrome.storage && root.chrome.storage.local) {
    const work = queue.catch(() => undefined).then(async () => {
      const stored = await storage.get([STORAGE_KEY]);
      const raw = stored[STORAGE_KEY];
      if (raw === undefined) return { changed: false, before: 0, after: 0, dropped: 0 };
      const before = typeof raw === 'string' ? raw.length : JSON.stringify(raw).length;
      const { items, container } = parse(raw);
      const { parts, dropped } = budgetParts(items.map(slimEntry), MAX_BYTES, container);
      // Already slim and compact: only lastUpdated would change
      if (typeof raw === 'string' && dropped === 0 && joinParts(parts, container).length >= before - 64) {
        return { changed: false, before, after: before, dropped: 0 };
      }
      const written = await write(storage, items, container);
      return { changed: true, before, after: written.bytes, dropped: written.dropped };
    });
    queue = work.catch(() => undefined);
    return work;
  }

  const HistoryStore = {
    STORAGE_KEY, MAX_BYTES, Messages, parse, serialize, read, mutate, applyImport, registerHandlers,
    slimEntry, fitToBudget, isQuotaError, compact, setQuotaRelief
  };

  root.HistoryStore = HistoryStore;
  if (typeof module !== 'undefined' && module.exports) module.exports = HistoryStore;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
