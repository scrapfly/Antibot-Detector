/**
 * Logger: one readable line per event, from every extension context.
 *
 * Levels and when they print:
 *   error / warn          always (they also reach chrome://extensions Errors)
 *   info (category helpers: Logger.background(), .detection(), .ui() ...)
 *                         Settings → Debug mode
 *   debug / verbose       Debug mode + "Verbose logs": per-rule, per-hook and
 *                         per-message traces
 *
 * Line format, in the service worker console:
 *   [13:22:45.856] bg/scan  walmart.com: 7 detections in 4.6 s · cookies=15 dom=488
 * Origin is bg (service worker), page (content script, relayed), main (page
 * MAIN world, relayed) or popup (extension pages print to their own console).
 * Data objects render as key=value, errors as "TypeError: message (file.js:12)".
 *
 * Every per-scan detail goes into one collapsible scan report per page
 * (Logger.report, built by background/scan-report.js), not one line per rule.
 *
 * Bursts are capped (RATE_LIMIT_* per second) and repeats collapsed; both
 * leave a notice ("37 lines skipped", "repeated 12 more times") instead of
 * dropping lines silently.
 */
class Logger {
  static CATEGORIES = {
    DETECTION: 'DETECTION',
    CACHE: 'CACHE',
    HOOKS: 'HOOKS',
    NETWORK: 'NETWORK',
    STORAGE: 'STORAGE',
    DETECTOR: 'DETECTOR',
    POPUP: 'POPUP',
    CONTENT: 'CONTENT',
    BACKGROUND: 'BACKGROUND',
    ERROR: 'ERROR',
    PERF: 'PERF',
    UI: 'UI',
    TAB: 'TAB',
    BADGE: 'BADGE',
    SCAN: 'SCAN'
  };

  static LEVELS = {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR'
  };

  // Short origin labels per context
  static ORIGINS = { background: 'bg', content: 'page', main: 'main', popup: 'popup' };

  // Per-second ceilings; the overflow is counted and reported once
  static RATE_WINDOW_MS = 1000;
  static RATE_LIMIT = { DEBUG: 60, INFO: 40, WARN: 20, ERROR: 10 };

  // The same line more than MAX_REPEATS times within REPEAT_WINDOW_MS is collapsed
  static REPEAT_WINDOW_MS = 2000;
  static MAX_REPEATS = 3;
  static MAX_REPEAT_KEYS = 200;

  // Size caps for one line
  static MAX_MESSAGE_LENGTH = 300;
  static MAX_VALUE_LENGTH = 160;
  static MAX_KEYS = 12;
  static MAX_ITEMS = 6;
  static MAX_STACK_FRAMES = 4;

  // Content-script lines are sent to the worker in batches (one message per BATCH_MS)
  static BATCH_MS = 250;
  static MAX_BATCH = 50;

  static _rateWindowStart = 0;
  static _rateCounts = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 };
  static _skipped = 0;
  static _repeats = new Map();
  static _batch = [];
  static _batchTimer = null;

  /** 'background' | 'popup' | 'content' | 'main' */
  static get context() {
    if (typeof ServiceWorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' &&
        self instanceof ServiceWorkerGlobalScope) {
      return 'background';
    }
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Popup, Statistics and other extension pages
      if (typeof location !== 'undefined' && location.protocol === 'chrome-extension:') return 'popup';
      return 'content';
    }
    return 'main';
  }

  static _flag(name) {
    if (typeof globalThis !== 'undefined' && typeof globalThis[name] !== 'undefined') return globalThis[name] === true;
    if (typeof self !== 'undefined' && typeof self[name] !== 'undefined') return self[name] === true;
    return false;
  }

  /** Settings → Debug mode */
  static get debugMode() {
    return Logger._flag('debugMode');
  }

  /** Settings → Debug mode + Verbose logs */
  static get verboseMode() {
    return Logger._flag('debugMode') && Logger._flag('debugVerbose');
  }

  static get logCollectorEnabled() {
    return Logger._flag('logCollectorEnabled');
  }

  // ==========================================================================
  // Formatting
  // ==========================================================================

  static _cut(text, max) {
    const s = String(text);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }

  /** "file.js:12" for the first frame of a stack, or '' */
  static _frame(stack, index = 0) {
    const frames = String(stack || '').split('\n')
      .map(line => line.match(/\(?((?:chrome-extension|https?|file):\/\/[^)\s]+?):(\d+):\d+\)?\s*$/))
      .filter(Boolean)
      .map(m => `${m[1].replace(/^chrome-extension:\/\/[^/]+\//, '').replace(/^[a-z]+:\/\/[^/]+\//, '')}:${m[2]}`);
    return frames[index] || '';
  }

  /** "TypeError: message (file.js:12)"; verbose adds the next frames */
  static formatError(error) {
    if (!error) return '';
    const name = error.name || 'Error';
    const message = Logger._cut(error.message || String(error), Logger.MAX_VALUE_LENGTH);
    const where = Logger._frame(error.stack);
    let text = `${name}: ${message}${where ? ` (${where})` : ''}`;
    if (Logger.verboseMode && error.stack) {
      const more = [];
      for (let i = 1; i < Logger.MAX_STACK_FRAMES; i++) {
        const frame = Logger._frame(error.stack, i);
        if (frame) more.push(frame);
      }
      if (more.length) text += ` ← ${more.join(' ← ')}`;
    }
    return text;
  }

  static _isError(value) {
    return value instanceof Error ||
      (value && typeof value === 'object' && typeof value.message === 'string' && typeof value.stack === 'string');
  }

  /** One value, short: strings cut, arrays previewed, objects as {k=v} */
  static formatValue(value, depth = 0) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    const t = typeof value;
    if (t === 'string') {
      const s = Logger._cut(value.replace(/\s+/g, ' '), Logger.MAX_VALUE_LENGTH);
      return depth > 0 && (s === '' || /[\s=]/.test(s)) ? JSON.stringify(s) : s;
    }
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value);
    if (t === 'function') return `[fn ${value.name || 'anonymous'}]`;
    if (t === 'symbol') return String(value);
    if (Logger._isError(value)) return Logger.formatError(value);
    try {
      if (typeof Node !== 'undefined' && value instanceof Node) return `<${String(value.nodeName || 'node').toLowerCase()}>`;
      if (typeof Event !== 'undefined' && value instanceof Event) return `[event ${value.type}]`;
    } catch (e) { /* cross-realm objects */ }
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Map) return `Map(${value.size})`;
    if (value instanceof Set) return Logger.formatValue(Array.from(value), depth);
    if (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) {
      return `[${value.constructor?.name || 'buffer'} ${value.byteLength} bytes]`;
    }
    if (Array.isArray(value)) {
      if (depth >= 2) return `[${value.length}]`;
      const items = value.slice(0, Logger.MAX_ITEMS).map(v => Logger.formatValue(v, depth + 1));
      if (value.length > Logger.MAX_ITEMS) items.push(`+${value.length - Logger.MAX_ITEMS}`);
      return `[${items.join(', ')}]`;
    }
    if (t === 'object') {
      if (depth >= 2) return '{…}';
      const pairs = Logger.formatPairs(value, depth + 1);
      return depth === 0 ? pairs : `{${pairs}}`;
    }
    return String(value);
  }

  /** "a=1 b=two c=[x, y]" for a plain object */
  static formatPairs(object, depth = 1) {
    let keys;
    try { keys = Object.keys(object); } catch (e) { return '{unreadable}'; }
    const parts = [];
    for (const key of keys.slice(0, Logger.MAX_KEYS)) {
      let value;
      try { value = object[key]; } catch (e) { value = '?'; }
      if (value === undefined) continue;
      parts.push(`${key}=${Logger.formatValue(value, depth)}`);
    }
    if (keys.length > Logger.MAX_KEYS) parts.push(`+${keys.length - Logger.MAX_KEYS} more`);
    return parts.join(' ');
  }

  /** Message and data as one line */
  static formatLine(message, data) {
    let text = Logger._cut(String(message ?? ''), Logger.MAX_MESSAGE_LENGTH);
    if (data === null || data === undefined || data === '') return text;
    const rendered = Logger.formatValue(data, 0);
    if (!rendered) return text;
    if (!text) return rendered;
    return /[:=]$/.test(text) ? `${text} ${rendered}` : `${text} · ${rendered}`;
  }

  /** "walmart.com" for a URL (www. dropped), or the input cut short */
  static hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return Logger._cut(String(url || ''), 60);
    }
  }

  static _time(timestamp) {
    const d = new Date(timestamp);
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }

  /** Back-compat: callers that want a cheap, cloneable copy of a value */
  static sanitize(value) {
    return Logger.formatValue(value, 0);
  }

  // ==========================================================================
  // Flow control
  // ==========================================================================

  /** false when the per-second ceiling is hit (the line is counted as skipped) */
  static _admit(level, now) {
    const notices = [];
    if (now - Logger._rateWindowStart >= Logger.RATE_WINDOW_MS) {
      if (Logger._skipped > 0) notices.push(`${Logger._skipped} log lines skipped (more than ${Logger.RATE_LIMIT.INFO}/s)`);
      Logger._rateWindowStart = now;
      Logger._rateCounts = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 };
      Logger._skipped = 0;
    }
    for (const notice of notices) Logger._emit({ timestamp: now, context: Logger.context, category: 'LOG', level: Logger.LEVELS.WARN, message: notice });
    Logger._rateCounts[level] = (Logger._rateCounts[level] || 0) + 1;
    if (Logger._rateCounts[level] > (Logger.RATE_LIMIT[level] || Logger.RATE_LIMIT.INFO)) {
      Logger._skipped += 1;
      return false;
    }
    return true;
  }

  /** false while the same line repeats; reports the count once the burst ends */
  static _admitRepeat(key, now) {
    const entry = Logger._repeats.get(key);
    if (entry && now - entry.start < Logger.REPEAT_WINDOW_MS) {
      entry.count += 1;
      if (entry.count > Logger.MAX_REPEATS) {
        entry.hidden += 1;
        return false;
      }
      return true;
    }
    if (entry && entry.hidden > 0) {
      Logger._emit({ ...entry.log, timestamp: now, message: `${entry.log.message} (repeated ${entry.hidden} more times)` });
    }
    if (Logger._repeats.size >= Logger.MAX_REPEAT_KEYS) Logger._repeats.clear();
    Logger._repeats.set(key, { start: now, count: 1, hidden: 0, log: null });
    return true;
  }

  // ==========================================================================
  // Core
  // ==========================================================================

  static _shouldPrint(level) {
    if (level === Logger.LEVELS.ERROR || level === Logger.LEVELS.WARN) return true;
    if (level === Logger.LEVELS.INFO) return Logger.debugMode;
    return Logger.verboseMode;
  }

  static _log(category, level, message, data = null) {
    // Free when the level is off: no formatting, no clock read
    if (!Logger._shouldPrint(level)) return;

    const now = Date.now();
    const text = Logger.formatLine(message, data);
    const log = { timestamp: now, context: Logger.context, category, level, message: text };

    const key = `${category}|${level}|${text}`;
    if (!Logger._admitRepeat(key, now)) return;
    const entry = Logger._repeats.get(key);
    if (entry && !entry.log) entry.log = log;
    if (!Logger._admit(level, now)) return;

    Logger._route(log);
  }

  static _route(log) {
    if (log.context === 'content') Logger._sendToBackground(log);
    else if (log.context === 'main') Logger._sendToContent(log);
    else Logger._emit(log);
  }

  static _emit(log) {
    if (log.context === 'content') return Logger._sendToBackground(log);
    if (log.context === 'main') return Logger._sendToContent(log);
    Logger._outputToConsole(log);
  }

  /** The printed line for a log record (also used for relayed records) */
  static formatRecord(log) {
    const origin = Logger.ORIGINS[log.context] || log.context || '?';
    const area = String(log.category || '').toLowerCase();
    return `[${Logger._time(log.timestamp || Date.now())}] ${origin}/${area}  ${log.message ?? ''}`;
  }

  static _outputToConsole(log) {
    if (!log) return;
    const line = Logger.formatRecord(log);
    const body = Array.isArray(log.lines) && log.lines.length ? log.lines.map(l => `  ${l}`).join('\n') : '';

    // With the Log Collector on, info/debug lines go to the collector only:
    // high-volume console output is what used to slow Chrome down.
    const collector = typeof globalThis !== 'undefined' && globalThis.logCollector &&
      typeof globalThis.logCollector.addLog === 'function' && globalThis.logCollector.enabled
      ? globalThis.logCollector : null;
    const loud = log.level === Logger.LEVELS.WARN || log.level === Logger.LEVELS.ERROR;
    if (collector && !loud) {
      try { collector.addLog(log.level === Logger.LEVELS.DEBUG ? 'debug' : 'info', [body ? `${line}\n${body}` : line]); } catch (e) { /* ignore */ }
      return;
    }

    if (body && typeof console.groupCollapsed === 'function' && !loud) {
      console.groupCollapsed(line);
      console.log(body);
      console.groupEnd();
      return;
    }
    const text = body ? `${line}\n${body}` : line;
    if (log.level === Logger.LEVELS.ERROR) console.error(text);
    else if (log.level === Logger.LEVELS.WARN) console.warn(text);
    else if (log.level === Logger.LEVELS.DEBUG) (console.debug || console.log)(text);
    else console.log(text);
  }

  /** Content script: queue the line, send the queue to the worker once per BATCH_MS */
  static _sendToBackground(log) {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;
    Logger._batch.push(log);
    if (Logger._batch.length > Logger.MAX_BATCH) Logger._batch.shift();
    if (Logger._batchTimer) return;
    Logger._batchTimer = setTimeout(Logger.flush, Logger.BATCH_MS);
  }

  /** Send queued content-script lines now */
  static flush() {
    Logger._batchTimer = null;
    const logs = Logger._batch.splice(0);
    if (!logs.length || typeof chrome === 'undefined' || !chrome.runtime) return;
    try {
      if (!chrome.runtime.id) return; // extension reloaded: this page's script is orphaned
      const sent = chrome.runtime.sendMessage({ type: 'LOG', logs });
      if (sent && typeof sent.catch === 'function') sent.catch(() => {});
    } catch (e) {
      // Worker unavailable or context invalidated
    }
  }

  /** MAIN world: only the authenticated bridge, never window.postMessage */
  static _sendToContent(log) {
    if (typeof window !== 'undefined' && typeof window.__scrapflySendLogToContent === 'function') {
      window.__scrapflySendLogToContent(log);
    }
  }

  /**
   * One collapsible block: the title line plus indented detail lines
   * (Debug mode). Used for the per-page scan report.
   * @param {string} category
   * @param {string} title
   * @param {string[]} lines
   */
  static report(category, title, lines = []) {
    if (!Logger.debugMode) return;
    const log = {
      timestamp: Date.now(), context: Logger.context, category, level: Logger.LEVELS.INFO,
      message: Logger._cut(String(title), Logger.MAX_MESSAGE_LENGTH),
      lines: (Array.isArray(lines) ? lines : []).map(l => Logger._cut(String(l), Logger.MAX_MESSAGE_LENGTH))
    };
    Logger._route(log);
  }

  // ==========================================================================
  // Category helpers (info level: Debug mode)
  // ==========================================================================

  static cache(message, data = null) { Logger._log(Logger.CATEGORIES.CACHE, Logger.LEVELS.INFO, message, data); }
  static detection(message, data = null) { Logger._log(Logger.CATEGORIES.DETECTION, Logger.LEVELS.INFO, message, data); }
  static hooks(message, data = null) { Logger._log(Logger.CATEGORIES.HOOKS, Logger.LEVELS.INFO, message, data); }
  static network(message, data = null) { Logger._log(Logger.CATEGORIES.NETWORK, Logger.LEVELS.INFO, message, data); }
  static storage(message, data = null) { Logger._log(Logger.CATEGORIES.STORAGE, Logger.LEVELS.INFO, message, data); }
  static popup(message, data = null) { Logger._log(Logger.CATEGORIES.POPUP, Logger.LEVELS.INFO, message, data); }
  static content(message, data = null) { Logger._log(Logger.CATEGORIES.CONTENT, Logger.LEVELS.INFO, message, data); }
  static background(message, data = null) { Logger._log(Logger.CATEGORIES.BACKGROUND, Logger.LEVELS.INFO, message, data); }
  static ui(message, data = null) { Logger._log(Logger.CATEGORIES.UI, Logger.LEVELS.INFO, message, data); }

  // ==========================================================================
  // Level helpers
  // ==========================================================================

  static warn(category, message, data = null) { Logger._log(category, Logger.LEVELS.WARN, message, data); }
  static error(category, message, data = null) { Logger._log(category, Logger.LEVELS.ERROR, message, data); }
  /** Verbose tier: Debug mode + Verbose logs */
  static debug(category, message, data = null) { Logger._log(category, Logger.LEVELS.DEBUG, message, data); }
  static verbose(category, message, data = null) { Logger._log(category, Logger.LEVELS.DEBUG, message, data); }
}

if (typeof globalThis !== 'undefined') globalThis.Logger = Logger;
if (typeof window !== 'undefined') window.Logger = Logger;
if (typeof self !== 'undefined') self.Logger = Logger;

// Node test export (no-op in the extension, where `module` is undefined)
if (typeof module !== 'undefined' && module.exports) { module.exports = Logger; }
