/**
 * Debug Mode Utility
 * Controls console logging based on debug mode setting
 */

// Store original console methods immediately before they can be modified
// IMPORTANT: Also store in global object for LogCollector to access
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

// Export original console methods to global for LogCollector
if (typeof window !== 'undefined') {
  window.__scrapflyOriginalConsole = originalConsole;
} else if (typeof self !== 'undefined') {
  self.__scrapflyOriginalConsole = originalConsole;
}

// Create debug state manager
const DebugState = {
  enabled: false,
  logCollectionEnabled: false,
  initialized: false
};

// Load debug setting from storage if available
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get(['scrapfly_settings'], (result) => {
    if (result.scrapfly_settings) {
      try {
        const settings = typeof result.scrapfly_settings === 'string'
          ? JSON.parse(result.scrapfly_settings)
          : result.scrapfly_settings;
        const settingsData = settings.settings || settings;
        DebugState.enabled = settingsData.debugMode === true;
        DebugState.logCollectionEnabled = settingsData.logCollectionEnabled === true;
        DebugState.initialized = true;

        if (DebugState.enabled) {
          originalConsole.log('[DebugMode] Debug mode is ENABLED');
        }
        if (DebugState.logCollectionEnabled) {
          originalConsole.log('[DebugMode] Log collection is ENABLED');
        }
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
          const newLogCollectionEnabled = settingsData.logCollectionEnabled === true;

          if (newDebugMode !== DebugState.enabled) {
            DebugState.enabled = newDebugMode;

            if (DebugState.enabled) {
              originalConsole.log('[DebugMode] Debug mode is now ENABLED');
            } else {
              originalConsole.log('[DebugMode] Debug mode is now DISABLED');
            }
          }

          if (newLogCollectionEnabled !== DebugState.logCollectionEnabled) {
            DebugState.logCollectionEnabled = newLogCollectionEnabled;

            if (DebugState.logCollectionEnabled) {
              originalConsole.log('[DebugMode] Log collection is now ENABLED');
            } else {
              originalConsole.log('[DebugMode] Log collection is now DISABLED');
            }
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
  if (CONTEXT === 'SERVICE_WORKER') {
    return; // Don't forward from service worker (it's already in the service worker)
  }

  // Forward logs if EITHER debugMode OR logCollectionEnabled is true
  if (!DebugState.enabled && !DebugState.logCollectionEnabled) {
    return; // Don't forward if neither debug nor log collection is enabled
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
// Allow logs through if EITHER debugMode OR logCollectionEnabled is true
// This ensures LogCollector can capture logs even when debugMode is off
console.log = function(...args) {
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    originalConsole.log(...args);
    // Forward if EITHER debugMode OR logCollectionEnabled is true
    if (DebugState.enabled || DebugState.logCollectionEnabled) {
      forwardLogToServiceWorker('log', args);
    }
  }
};

console.info = function(...args) {
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    originalConsole.info(...args);
    // Forward if EITHER debugMode OR logCollectionEnabled is true
    if (DebugState.enabled || DebugState.logCollectionEnabled) {
      forwardLogToServiceWorker('info', args);
    }
  }
};

console.debug = function(...args) {
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    originalConsole.debug(...args);
    // Forward if EITHER debugMode OR logCollectionEnabled is true
    if (DebugState.enabled || DebugState.logCollectionEnabled) {
      forwardLogToServiceWorker('debug', args);
    }
  }
};

console.trace = function(...args) {
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    originalConsole.trace(...args);
    // Forward if EITHER debugMode OR logCollectionEnabled is true
    if (DebugState.enabled || DebugState.logCollectionEnabled) {
      forwardLogToServiceWorker('trace', args);
    }
  }
};

console.group = function(...args) {
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    originalConsole.group(...args);
    // Forward if EITHER debugMode OR logCollectionEnabled is true
    if (DebugState.enabled || DebugState.logCollectionEnabled) {
      forwardLogToServiceWorker('group', args);
    }
  }
};

console.groupEnd = function(...args) {
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    originalConsole.groupEnd(...args);
    // Forward if EITHER debugMode OR logCollectionEnabled is true
    if (DebugState.enabled || DebugState.logCollectionEnabled) {
      forwardLogToServiceWorker('groupEnd', args);
    }
  }
};

console.groupCollapsed = function(...args) {
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    originalConsole.groupCollapsed(...args);
    // Forward if EITHER debugMode OR logCollectionEnabled is true
    if (DebugState.enabled || DebugState.logCollectionEnabled) {
      forwardLogToServiceWorker('groupCollapsed', args);
    }
  }
};

console.table = function(...args) {
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    originalConsole.table(...args);
    // Forward if EITHER debugMode OR logCollectionEnabled is true
    if (DebugState.enabled || DebugState.logCollectionEnabled) {
      forwardLogToServiceWorker('table', args);
    }
  }
};

console.time = function(...args) {
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    originalConsole.time(...args);
    // Forward if EITHER debugMode OR logCollectionEnabled is true
    if (DebugState.enabled || DebugState.logCollectionEnabled) {
      forwardLogToServiceWorker('time', args);
    }
  }
};

console.timeEnd = function(...args) {
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    originalConsole.timeEnd(...args);
    // Forward if EITHER debugMode OR logCollectionEnabled is true
    if (DebugState.enabled || DebugState.logCollectionEnabled) {
      forwardLogToServiceWorker('timeEnd', args);
    }
  }
};

// Always allow warnings and errors (and forward them when logCollectionEnabled)
console.warn = function(...args) {
  originalConsole.warn(...args);
  // Forward if EITHER debugMode OR logCollectionEnabled is true
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    forwardLogToServiceWorker('warn', args);
  }
};

console.error = function(...args) {
  originalConsole.error(...args);
  // Forward if EITHER debugMode OR logCollectionEnabled is true
  if (DebugState.enabled || DebugState.logCollectionEnabled) {
    forwardLogToServiceWorker('error', args);
  }
};

// Public API for manual control
var DebugMode = {
  enable: function() {
    DebugState.enabled = true;
    originalConsole.log('[DebugMode] Debug mode manually ENABLED');
  },

  disable: function() {
    originalConsole.log('[DebugMode] Debug mode manually DISABLED');
    DebugState.enabled = false;
  },

  isEnabled: function() {
    return DebugState.enabled;
  },

  // Log collection control (for LogCollector to call directly)
  enableLogCollection: function() {
    DebugState.logCollectionEnabled = true;
    originalConsole.log('[DebugMode] Log collection manually ENABLED');
  },

  disableLogCollection: function() {
    originalConsole.log('[DebugMode] Log collection manually DISABLED');
    DebugState.logCollectionEnabled = false;
  },

  isLogCollectionEnabled: function() {
    return DebugState.logCollectionEnabled;
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

// Also export to global scope for LogCollector to access
if (typeof window !== 'undefined') {
  window.DebugMode = DebugMode;
} else if (typeof self !== 'undefined') {
  self.DebugMode = DebugMode;
}