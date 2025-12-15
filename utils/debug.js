/**
 * Debug Mode Utility
 * Controls console logging based on debug mode setting
 */

// Store original console methods immediately before they can be modified
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
  trace: console.trace.bind(console),
  group: console.group.bind(console),
  groupEnd: console.groupEnd.bind(console),
  groupCollapsed: console.groupCollapsed.bind(console),
  table: console.table.bind(console),
  time: console.time.bind(console),
  timeEnd: console.timeEnd.bind(console)
};

// Expose original console on global object for LogCollector to access
if (typeof self !== 'undefined') {
  self.__scrapflyOriginalConsole = originalConsole;
} else if (typeof window !== 'undefined') {
  window.__scrapflyOriginalConsole = originalConsole;
}

// Create debug state manager
const DebugState = {
  enabled: false,
  initialized: false
};

// Load debug setting from chrome.storage
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get(['scrapfly_settings'], (result) => {
    if (result.scrapfly_settings) {
      try {
        const settings = typeof result.scrapfly_settings === 'string'
          ? JSON.parse(result.scrapfly_settings)
          : result.scrapfly_settings;
        const settingsData = settings.settings || settings;
        DebugState.enabled = settingsData.debugMode === true;
        DebugState.initialized = true;
      } catch (e) {
        originalConsole.error('[DebugMode] Failed to parse settings:', e);
      }
    } else {
      DebugState.initialized = true;
    }
  });

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.scrapfly_settings) {
      const newSettings = changes.scrapfly_settings.newValue;
      if (newSettings) {
        try {
          const settings = typeof newSettings === 'string'
            ? JSON.parse(newSettings)
            : newSettings;
          const settingsData = settings.settings || settings;
          const newDebugMode = settingsData.debugMode === true;

          if (newDebugMode !== DebugState.enabled) {
            DebugState.enabled = newDebugMode;
          }
        } catch (e) {
          originalConsole.error('[DebugMode] Failed to parse settings change:', e);
        }
      }
    }
  });
}

// Detect context
const CONTEXT = (() => {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
    try {
      // Check if we're in service worker
      if (typeof importScripts === 'function') {
        return 'SERVICE_WORKER';
      }
      // Check if we're in content script
      if (typeof chrome.tabs === 'undefined' || !chrome.tabs.query) {
        // Content script has limited chrome API access
        if (window.location.protocol.startsWith('http')) {
          return 'CONTENT_SCRIPT';
        }
        return 'POPUP';
      }
    } catch (e) {
      // Content scripts throw errors on some chrome APIs
      return 'CONTENT_SCRIPT';
    }
  }
  return 'UNKNOWN';
})();

// Forward logs to service worker (only from content scripts and popup)
function forwardLogToServiceWorker(level, args) {
  if (CONTEXT === 'SERVICE_WORKER' || !DebugState.enabled) {
    return; // Don't forward from service worker or if debug disabled
  }

  try {
    // Convert args to serializable format
    const serializedArgs = args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    });

    chrome.runtime.sendMessage({
      type: 'DEBUG_LOG',
      context: CONTEXT,
      level: level,
      args: serializedArgs,
      timestamp: Date.now()
    }).catch(() => {
      // Ignore errors if background is not ready
    });
  } catch (e) {
    // Silently fail - don't break execution
  }
}

// Override console methods to check debug state
// By default, suppress logs until we know debug mode is enabled
console.log = function(...args) {
  if (DebugState.enabled) {
    originalConsole.log(...args);
    forwardLogToServiceWorker('log', args);
  }
};

console.info = function(...args) {
  if (DebugState.enabled) {
    originalConsole.info(...args);
    forwardLogToServiceWorker('info', args);
  }
};

console.debug = function(...args) {
  if (DebugState.enabled) {
    originalConsole.debug(...args);
    forwardLogToServiceWorker('debug', args);
  }
};

console.trace = function(...args) {
  if (DebugState.enabled) {
    originalConsole.trace(...args);
    forwardLogToServiceWorker('trace', args);
  }
};

console.group = function(...args) {
  if (DebugState.enabled) {
    originalConsole.group(...args);
    forwardLogToServiceWorker('group', args);
  }
};

console.groupEnd = function(...args) {
  if (DebugState.enabled) {
    originalConsole.groupEnd(...args);
    forwardLogToServiceWorker('groupEnd', args);
  }
};

console.groupCollapsed = function(...args) {
  if (DebugState.enabled) {
    originalConsole.groupCollapsed(...args);
    forwardLogToServiceWorker('groupCollapsed', args);
  }
};

console.table = function(...args) {
  if (DebugState.enabled) {
    originalConsole.table(...args);
    forwardLogToServiceWorker('table', args);
  }
};

console.time = function(...args) {
  if (DebugState.enabled) {
    originalConsole.time(...args);
    forwardLogToServiceWorker('time', args);
  }
};

console.timeEnd = function(...args) {
  if (DebugState.enabled) {
    originalConsole.timeEnd(...args);
    forwardLogToServiceWorker('timeEnd', args);
  }
};

// Always allow warnings and errors (but forward them too)
console.warn = function(...args) {
  originalConsole.warn(...args);
  if (DebugState.enabled) {
    forwardLogToServiceWorker('warn', args);
  }
};

console.error = function(...args) {
  originalConsole.error(...args);
  if (DebugState.enabled) {
    forwardLogToServiceWorker('error', args);
  }
};

// Public API for manual control
var DebugMode = {
  enable: function() {
    DebugState.enabled = true;
  },

  disable: function() {
    DebugState.enabled = false;
  },

  isEnabled: function() {
    return DebugState.enabled;
  },

  forceLog: function(...args) {
    originalConsole.log(...args);
  },

  forceError: function(...args) {
    originalConsole.error(...args);
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DebugMode;
}