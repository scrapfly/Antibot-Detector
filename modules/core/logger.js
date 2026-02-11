/**
 * Centralized Logging System
 * Routes logs from all extension contexts (background, content, main world)
 * to the Service Worker console for unified debugging.
 *
 * Usage:
 *   Logger.cache('Cache hit detected', { url, expires });
 *   Logger.detection('Found 21 detectors');
 *   Logger.error('CACHE', 'Failed to read cache', error);
 */

class Logger {
  // Log categories
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
    BADGE: 'BADGE'
  };

  // Log levels
  static LEVELS = {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR'
  };

  // Safety: avoid overwhelming the browser/extension with log storms.
  // Note: This is especially important when debug mode is enabled, as logging
  // can quickly become the #1 source of CPU/memory pressure and crash the tab.
  static RATE_LIMIT_WINDOW_MS = 1000;
  static MAX_LOGS_PER_WINDOW = 30; // default per-level ceiling (see _getMaxLogsPerWindow)
  static _rateWindowStart = 0;
  static _rateCounts = {
    DEBUG: 0,
    INFO: 0,
    WARN: 0,
    ERROR: 0
  };
  static _rateDropped = {
    DEBUG: 0,
    INFO: 0,
    WARN: 0,
    ERROR: 0
  };

  // Payload safety limits (keep console/message passing cheap)
  static MAX_MESSAGE_LENGTH = 800;
  static MAX_STRING_LENGTH = 2000;
  static MAX_OBJECT_KEYS = 20;
  static MAX_ARRAY_LENGTH = 20;
  static MAX_DEPTH = 2;

  // Dedupe repeated WARN/ERROR spam
  static DEDUPE_WINDOW_MS = 2000;
  static MAX_DUPES_PER_WINDOW = 5;
  static _dedupe = new Map();

  // Visual icons for categories
  static ICONS = {
    DETECTION: '',
    CACHE: '',
    HOOKS: '',
    NETWORK: '',
    STORAGE: '',
    DETECTOR: '',
    POPUP: '',
    CONTENT: '',
    BACKGROUND: '',
    ERROR: '',
    PERF: '',
    UI: '',
    TAB: '',
    BADGE: ''
  };

  /**
   * Detect the current execution context
   * @returns {string} 'background', 'content', or 'main'
   */
  static get context() {
    // Service Worker / Background Script
    if (typeof ServiceWorkerGlobalScope !== 'undefined' &&
        self instanceof ServiceWorkerGlobalScope) {
      return 'background';
    }

    // Check if we have chrome.runtime (extension context)
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Background context has chrome.tabs
      if (chrome.tabs) {
        return 'background';
      }
      // Content script (ISOLATED world) has chrome.runtime but not chrome.tabs
      return 'content';
    }

    // Main world (no chrome APIs)
    return 'main';
  }

  /**
   * Get debug mode from storage (with fallback)
   * @returns {boolean}
   */
  static get debugMode() {
    // Try to get from global debugMode variable
    if (typeof globalThis.debugMode !== 'undefined') {
      return globalThis.debugMode;
    }
    if (typeof window !== 'undefined' && typeof window.debugMode !== 'undefined') {
      return window.debugMode;
    }
    if (typeof self !== 'undefined' && typeof self.debugMode !== 'undefined') {
      return self.debugMode;
    }
    // Default to false
    return false;
  }

  /**
   * Get log collector enabled flag from globals (if available)
   * @returns {boolean}
   */
  static get logCollectorEnabled() {
    if (typeof globalThis.logCollectorEnabled !== 'undefined') {
      return globalThis.logCollectorEnabled;
    }
    if (typeof window !== 'undefined' && typeof window.logCollectorEnabled !== 'undefined') {
      return window.logCollectorEnabled;
    }
    if (typeof self !== 'undefined' && typeof self.logCollectorEnabled !== 'undefined') {
      return self.logCollectorEnabled;
    }
    return false;
  }

  static _truncateString(value, maxLength) {
    if (typeof value !== 'string') return value;
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
  }

  static _safeToString(value) {
    try {
      return String(value);
    } catch (e) {
      return '[Unstringifiable]';
    }
  }

  // Public helper: safe, size-limited representation for console + transport.
  // Returns a value that is cheap to clone and unlikely to retain huge object graphs.
  static sanitize(value) {
    return Logger._sanitizeValue(value, 0);
  }

  static _sanitizeValue(value, depth) {
    if (value === null || value === undefined) return value;

    const t = typeof value;
    if (t === 'string') return Logger._truncateString(value, Logger.MAX_STRING_LENGTH);
    if (t === 'number' || t === 'boolean' || t === 'bigint') return value;
    if (t === 'symbol') return Logger._safeToString(value);
    if (t === 'function') {
      const name = value.name ? ` ${value.name}` : '';
      return `[Function${name}]`;
    }

    // Errors: keep message + stack (trimmed) without extra attached data.
    if (value instanceof Error) {
      return {
        type: 'Error',
        name: value.name,
        message: Logger._truncateString(value.message || '', Logger.MAX_STRING_LENGTH),
        stack: Logger._truncateString(value.stack || '', Logger.MAX_STRING_LENGTH)
      };
    }

    // Guard: avoid deep/recursive structures.
    if (depth >= Logger.MAX_DEPTH) {
      if (Array.isArray(value)) return `[Array(${value.length})]`;
      const ctorName = value?.constructor?.name;
      return `[${ctorName || 'Object'}]`;
    }

    if (Array.isArray(value)) {
      const preview = value.slice(0, Logger.MAX_ARRAY_LENGTH).map((v) => Logger._sanitizeValue(v, depth + 1));
      if (value.length > Logger.MAX_ARRAY_LENGTH) {
        return {
          type: 'Array',
          length: value.length,
          preview,
          truncated: true
        };
      }
      return preview;
    }

    if (t === 'object') {
      // Handle DOM-like objects defensively without retaining them.
      try {
        if (typeof Node !== 'undefined' && value instanceof Node) {
          return `[Node ${value.nodeName || 'unknown'}]`;
        }
      } catch (e) {
        // ignore
      }
      try {
        if (typeof Event !== 'undefined' && value instanceof Event) {
          return `[Event ${value.type || 'unknown'}]`;
        }
      } catch (e) {
        // ignore
      }

      // Typed arrays / ArrayBuffers can be enormous; never enumerate keys.
      try {
        if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
          return `[ArrayBuffer(${value.byteLength} bytes)]`;
        }
      } catch (e) {
        // ignore
      }
      try {
        if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' && ArrayBuffer.isView(value)) {
          const name = value?.constructor?.name || 'TypedArray';
          const len = typeof value.length === 'number' ? value.length : undefined;
          const bytes = typeof value.byteLength === 'number' ? value.byteLength : undefined;
          if (typeof len === 'number' && typeof bytes === 'number') return `[${name}(${len}) ${bytes} bytes]`;
          if (typeof bytes === 'number') return `[${name} ${bytes} bytes]`;
          if (typeof len === 'number') return `[${name}(${len})]`;
          return `[${name}]`;
        }
      } catch (e) {
        // ignore
      }

      if (value instanceof Map) return `[Map(${value.size})]`;
      if (value instanceof Set) return `[Set(${value.size})]`;
      if (value instanceof Date) return value.toISOString();

      let keys = [];
      try {
        keys = Object.keys(value);
      } catch (e) {
        return '[Object]';
      }

      const out = {};
      const limited = keys.slice(0, Logger.MAX_OBJECT_KEYS);
      for (const k of limited) {
        try {
          out[k] = Logger._sanitizeValue(value[k], depth + 1);
        } catch (e) {
          out[k] = '[Unavailable]';
        }
      }
      if (keys.length > Logger.MAX_OBJECT_KEYS) {
        out.__truncated__ = `${keys.length - Logger.MAX_OBJECT_KEYS} more keys`;
      }
      const ctorName = value?.constructor?.name;
      if (ctorName && ctorName !== 'Object') {
        out.__type__ = ctorName;
      }
      return out;
    }

    return Logger._safeToString(value);
  }

  static _getMaxLogsPerWindow(level) {
    const base = Logger.MAX_LOGS_PER_WINDOW;
    // Default per-level ceilings tuned for stability.
    let max = base;
    if (level === Logger.LEVELS.DEBUG || level === Logger.LEVELS.INFO) max = base;
    if (level === Logger.LEVELS.WARN) max = Math.max(10, Math.floor(base * 0.7));
    if (level === Logger.LEVELS.ERROR) max = Math.max(5, Math.floor(base * 0.4));

    // When log collector is enabled, be extra conservative.
    if (Logger.logCollectorEnabled) {
      if (level === Logger.LEVELS.DEBUG || level === Logger.LEVELS.INFO) max = Math.min(max, 15);
      if (level === Logger.LEVELS.WARN) max = Math.min(max, 12);
      if (level === Logger.LEVELS.ERROR) max = Math.min(max, 8);
    }

    return Math.max(1, max);
  }

  static _shouldDedupe(category, level, message) {
    if (level !== Logger.LEVELS.WARN && level !== Logger.LEVELS.ERROR) return false;

    const key = `${category}|${level}|${message}`;
    const now = Date.now();
    const entry = Logger._dedupe.get(key);
    if (!entry || now - entry.windowStart >= Logger.DEDUPE_WINDOW_MS) {
      Logger._dedupe.set(key, { windowStart: now, count: 1 });
      return false;
    }

    entry.count += 1;
    if (entry.count > Logger.MAX_DUPES_PER_WINDOW) {
      return true;
    }

    return false;
  }

  static _checkRateLimit(level) {
    const now = Date.now();
    if (now - Logger._rateWindowStart >= Logger.RATE_LIMIT_WINDOW_MS) {
      Logger._rateWindowStart = now;
      Logger._rateCounts = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 };
      Logger._rateDropped = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 };
    }

    const maxPerWindow = Logger._getMaxLogsPerWindow(level);
    Logger._rateCounts[level] = (Logger._rateCounts[level] || 0) + 1;
    if (Logger._rateCounts[level] > maxPerWindow) {
      Logger._rateDropped[level] = (Logger._rateDropped[level] || 0) + 1;
      return false;
    }
    return true;
  }

  /**
   * Core logging method
   * @param {string} category - Log category (DETECTION, CACHE, etc.)
   * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
   * @param {string} message - Log message
   * @param {*} data - Optional data to log
   */
  static _log(category, level, message, data = null) {
    // Skip noisy logs when not in debug mode
    if (!Logger.debugMode && (level === Logger.LEVELS.DEBUG || level === Logger.LEVELS.INFO)) {
      return;
    }

    const safeMessage = Logger._truncateString(Logger._safeToString(message), Logger.MAX_MESSAGE_LENGTH);
    const safeData = (data === null || data === undefined) ? null : Logger._sanitizeValue(data, 0);

    // Rate limit ALL levels (WARN/ERROR included) to avoid crashing the browser on log storms.
    if (!Logger._checkRateLimit(level)) {
      return;
    }

    // Dedupe repeated WARN/ERROR spam (common failure mode when a hook triggers repeatedly).
    if (Logger._shouldDedupe(category, level, safeMessage)) {
      return;
    }

    const log = {
      timestamp: new Date().toISOString(),
      context: Logger.context,
      category: category,
      level: level,
      message: safeMessage,
      data: safeData
    };

    // Route based on context
    if (Logger.context === 'background') {
      // Direct output to console in background
      Logger._outputToConsole(log);
    } else if (Logger.context === 'content') {
      // Send to background via chrome.runtime.sendMessage
      Logger._sendToBackground(log);
    } else if (Logger.context === 'main') {
      // Send to content script via postMessage
      Logger._sendToContent(log);
    }
  }

  /**
   * Output log to console with formatting
   * @param {Object} log - Log object
   */
  static _outputToConsole(log) {
    const icon = Logger.ICONS[log.category] || '';
    const time = new Date(log.timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });

    const prefix = `[${time}] [${log.context.toUpperCase()}] [${log.category}] [${log.level}]`;
    const fullMessage = `${prefix} ${icon} ${log.message}`;

    // Stringify data into message so it's readable on extension error pages
    // (which show [object Object] for separate console arguments)
    let dataStr = '';
    if (log.data !== null && log.data !== undefined) {
      try {
        dataStr = typeof log.data === 'string' ? ` ${log.data}` : ` ${JSON.stringify(log.data)}`;
      } catch (e) {
        dataStr = ' [Unstringifiable data]';
      }
    }
    const messageWithData = fullMessage + dataStr;

    // If LogCollector is enabled in the service worker, prefer storing over printing:
    // printing high-volume logs to the SW console can retain object graphs and crash Chrome.
    const collector = (typeof globalThis !== 'undefined' && globalThis.logCollector && typeof globalThis.logCollector.addLog === 'function')
      ? globalThis.logCollector
      : null;
    const collectorActive = !!(collector && collector.enabled);
    if (collectorActive && log.level !== Logger.LEVELS.WARN && log.level !== Logger.LEVELS.ERROR) {
      try {
        // Keep INFO/DEBUG inside the collector and avoid console spam.
        collector.addLog(log.level === Logger.LEVELS.DEBUG ? 'debug' : 'info', [messageWithData]);
      } catch (e) {
        // ignore
      }
      return;
    }

    // Choose console method based on level
    if (log.level === Logger.LEVELS.ERROR) {
      console.error(messageWithData);
    } else if (log.level === Logger.LEVELS.WARN) {
      console.warn(messageWithData);
    } else {
      console.log(messageWithData);
    }
  }

  /**
   * Send log to background script from content script
   * @param {Object} log - Log object
   */
  static _sendToBackground(log) {
    // Early exit if chrome APIs not available
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return;
    }

    try {
      // More robust context validation - getURL throws if context is invalid
      try {
        if (!chrome.runtime.id) {
          return;
        }
        // This call will throw synchronously if context is invalidated
        chrome.runtime.getURL('');
      } catch (contextError) {
        // Context invalidated, silently exit
        return;
      }

      // Now safe to attempt message - wrap in another try-catch for safety
      try {
        const sendPromise = chrome.runtime.sendMessage({
          type: 'LOG',
          log: log
        });

        // Handle promise rejection if sendMessage returned a promise
        if (sendPromise && typeof sendPromise.catch === 'function') {
          sendPromise.catch(() => {
            // Silently fail if background isn't available
          });
        }
      } catch (sendError) {
        // Silently fail - sendMessage threw synchronously
      }
    } catch (e) {
      // Silently fail - extension context invalidated
    }
  }

  /**
   * Send log to content script from main world
   * @param {Object} log - Log object
   */
  static _sendToContent(log) {
    if (typeof window !== 'undefined' && window.postMessage) {
      window.postMessage({
        type: 'SCRAPFLY_LOG',
        log: log
      }, '*');
    }
  }

  // ============================================================================
  // Convenience Methods (Category-Specific)
  // ============================================================================

  static cache(message, data = null) {
    Logger._log(Logger.CATEGORIES.CACHE, Logger.LEVELS.INFO, message, data);
  }

  static detection(message, data = null) {
    Logger._log(Logger.CATEGORIES.DETECTION, Logger.LEVELS.INFO, message, data);
  }

  static hooks(message, data = null) {
    Logger._log(Logger.CATEGORIES.HOOKS, Logger.LEVELS.INFO, message, data);
  }

  static network(message, data = null) {
    Logger._log(Logger.CATEGORIES.NETWORK, Logger.LEVELS.INFO, message, data);
  }

  static storage(message, data = null) {
    Logger._log(Logger.CATEGORIES.STORAGE, Logger.LEVELS.INFO, message, data);
  }

  static detector(message, data = null) {
    Logger._log(Logger.CATEGORIES.DETECTOR, Logger.LEVELS.INFO, message, data);
  }

  static popup(message, data = null) {
    Logger._log(Logger.CATEGORIES.POPUP, Logger.LEVELS.INFO, message, data);
  }

  static content(message, data = null) {
    Logger._log(Logger.CATEGORIES.CONTENT, Logger.LEVELS.INFO, message, data);
  }

  static background(message, data = null) {
    Logger._log(Logger.CATEGORIES.BACKGROUND, Logger.LEVELS.INFO, message, data);
  }

  static perf(message, data = null) {
    Logger._log(Logger.CATEGORIES.PERF, Logger.LEVELS.INFO, message, data);
  }

  static ui(message, data = null) {
    Logger._log(Logger.CATEGORIES.UI, Logger.LEVELS.INFO, message, data);
  }

  static tab(message, data = null) {
    Logger._log(Logger.CATEGORIES.TAB, Logger.LEVELS.INFO, message, data);
  }

  static badge(message, data = null) {
    Logger._log(Logger.CATEGORIES.BADGE, Logger.LEVELS.INFO, message, data);
  }

  // ============================================================================
  // Generic Methods (Level-Specific)
  // ============================================================================

  static warn(category, message, data = null) {
    Logger._log(category, Logger.LEVELS.WARN, message, data);
  }

  static error(category, message, data = null) {
    Logger._log(category, Logger.LEVELS.ERROR, message, data);
  }

  static debug(category, message, data = null) {
    Logger._log(category, Logger.LEVELS.DEBUG, message, data);
  }
}

// Make Logger globally available in all contexts
// This ensures Logger is accessible regardless of module system or environment
if (typeof globalThis !== 'undefined') {
  globalThis.Logger = Logger;
}
if (typeof window !== 'undefined') {
  window.Logger = Logger;
}
if (typeof self !== 'undefined') {
  self.Logger = Logger;
}
// CommonJS export for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Logger;
}
