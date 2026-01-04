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

  // Visual icons for categories
  static ICONS = {
    DETECTION: '🎯',
    CACHE: '💾',
    HOOKS: '🎣',
    NETWORK: '🌐',
    STORAGE: '💿',
    DETECTOR: '🔍',
    POPUP: '🪟',
    CONTENT: '📄',
    BACKGROUND: '⚙️',
    ERROR: '❌',
    PERF: '⚡',
    UI: '🖼️',
    TAB: '📑',
    BADGE: '🔔'
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
   * Core logging method
   * @param {string} category - Log category (DETECTION, CACHE, etc.)
   * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
   * @param {string} message - Log message
   * @param {*} data - Optional data to log
   */
  static _log(category, level, message, data = null) {
    // Skip DEBUG logs if not in debug mode
    if (level === Logger.LEVELS.DEBUG && !Logger.debugMode) {
      return;
    }

    const log = {
      timestamp: new Date().toISOString(),
      context: Logger.context,
      category: category,
      level: level,
      message: message,
      data: data
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

    // Choose console method based on level
    if (log.level === Logger.LEVELS.ERROR) {
      if (log.data) {
        console.error(fullMessage, log.data);
      } else {
        console.error(fullMessage);
      }
    } else if (log.level === Logger.LEVELS.WARN) {
      if (log.data) {
        console.warn(fullMessage, log.data);
      } else {
        console.warn(fullMessage);
      }
    } else {
      if (log.data) {
        console.log(fullMessage, log.data);
      } else {
        console.log(fullMessage);
      }
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
