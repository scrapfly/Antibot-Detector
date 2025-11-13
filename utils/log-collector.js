/**
 * LogCollector - Stores logs in memory and allows export
 * Uses circular buffer to prevent memory overflow
 *
 * Usage:
 *   window.LogCollector.enable()  // Start collecting logs
 *   window.LogCollector.exportAsJSON()  // Export as JSON file
 *   window.LogCollector.exportAsText()  // Export as text file
 *   window.LogCollector.disable()  // Stop collecting
 */
class LogCollector {
    constructor(maxLogs = 5000) {
        this.maxLogs = maxLogs;
        this.logs = [];
        this.enabled = false;
        this.startTime = Date.now();
        this.originalConsole = null;
        this.storageKey = 'scrapfly_collected_logs';
        this.enabledStateKey = 'scrapfly_log_collector_enabled';
        this.storageWriteTimer = null;
        this.initialized = false;
        this.initPromise = null;
        // Initialize and load from storage
        this.initPromise = this.initializeFromStorage();
    }

    /**
     * Initialize by loading logs and enabled state from chrome storage
     * Returns a Promise that resolves when initialization is complete
     * This restores logs and enabled state across service worker restarts
     */
    initializeFromStorage() {
        if (typeof chrome === 'undefined' || !chrome.storage) {
            this.initialized = true;
            return Promise.resolve(); // Not in extension context
        }

        return new Promise((resolve) => {
            try {
                chrome.storage.local.get([this.storageKey, this.enabledStateKey, 'scrapfly_log_collector_max', 'scrapfly_settings'], (result) => {
                    try {
                        // Restore logs
                        if (result[this.storageKey] && Array.isArray(result[this.storageKey])) {
                            this.logs = result[this.storageKey];
                        }

                        // Restore max logs setting
                        if (result['scrapfly_log_collector_max']) {
                            this.maxLogs = result['scrapfly_log_collector_max'];
                        } else if (result['scrapfly_settings']) {
                            // Fallback: try to get from settings object
                            try {
                                const settings = typeof result['scrapfly_settings'] === 'string'
                                    ? JSON.parse(result['scrapfly_settings'])
                                    : result['scrapfly_settings'];
                                if (settings.logCollectorMaxLogs) {
                                    this.maxLogs = settings.logCollectorMaxLogs;
                                }
                            } catch (e) {
                                // Ignore parse errors, use default
                            }
                        }

                        // Restore enabled state and auto-resume collection if needed
                        const wasEnabled = result[this.enabledStateKey] === true;
                        if (wasEnabled) {
                            this.enabled = true;
                            this.interceptConsoleMethods();
                        }
                    } catch (e) {
                        Logger.error('UTIL', '[LogCollector] Failed to restore from storage:', e);
                        this.logs = [];
                        this.enabled = false;
                    }

                    this.initialized = true;
                    resolve();
                });
            } catch (e) {
                // Storage API not available
                Logger.error('UTIL', '[LogCollector] Failed to initialize from storage:', e);
                this.initialized = true;
                resolve();
            }
        });
    }

    /**
     * Save logs to chrome storage (debounced to avoid excessive writes)
     */
    saveLogsToStorage() {
        if (typeof chrome === 'undefined' || !chrome.storage) {
            return; // Not in extension context
        }

        // Debounce storage writes to every 2 seconds to avoid performance issues
        if (this.storageWriteTimer) {
            clearTimeout(this.storageWriteTimer);
        }

        this.storageWriteTimer = setTimeout(() => {
            try {
                chrome.storage.local.set({ [this.storageKey]: this.logs });
            } catch (e) {
                Logger.error('UTIL', '[LogCollector] Failed to save logs to storage:', e);
            }
        }, 2000);
    }

    /**
     * Enable log collection
     */
    enable() {
        if (this.enabled) {
            return;
        }

        // CRITICAL: Tell debug.js to allow logs through BEFORE we start intercepting
        if (typeof DebugMode !== 'undefined' && typeof DebugMode.enableLogCollection === 'function') {
            DebugMode.enableLogCollection();
        } else if (typeof window !== 'undefined' && window.DebugMode && typeof window.DebugMode.enableLogCollection === 'function') {
            window.DebugMode.enableLogCollection();
        }

        this.enabled = true;
        // Don't reset startTime or clear logs - preserve existing logs from storage
        this.interceptConsoleMethods();

        // Persist enabled state to storage
        if (typeof chrome !== 'undefined' && chrome.storage) {
            try {
                chrome.storage.local.set({ [this.enabledStateKey]: true });
            } catch (e) {
                Logger.error('UTIL', '[LogCollector] Failed to persist enabled state:', e);
            }
        }
    }

    /**
     * Disable log collection
     */
    disable() {
        if (!this.enabled) {
            return;
        }

        this.enabled = false;
        this.restoreConsoleMethods();

        // Persist disabled state to storage
        if (typeof chrome !== 'undefined' && chrome.storage) {
            try {
                chrome.storage.local.set({ [this.enabledStateKey]: false });
            } catch (e) {
                Logger.error('UTIL', '[LogCollector] Failed to persist disabled state:', e);
            }
        }

        // CRITICAL: Tell debug.js to stop allowing logs through (if debugMode is also off)
        if (typeof DebugMode !== 'undefined' && typeof DebugMode.disableLogCollection === 'function') {
            DebugMode.disableLogCollection();
        } else if (typeof window !== 'undefined' && window.DebugMode && typeof window.DebugMode.disableLogCollection === 'function') {
            window.DebugMode.disableLogCollection();
        }
    }

    /**
     * Intercept console methods to capture logs
     * IMPORTANT: Uses truly original console methods from global object
     * to avoid wrapping the already-modified console from debug.js
     */
    interceptConsoleMethods() {
        // Get truly original console methods from global object set by debug.js
        // Fallback to current console if not available (shouldn't happen in normal flow)
        const globalOriginal = (typeof window !== 'undefined' && window.__scrapflyOriginalConsole) ||
                               (typeof self !== 'undefined' && self.__scrapflyOriginalConsole);

        if (globalOriginal) {
            // Use the truly original console methods
            this.originalConsole = {
                log: globalOriginal.log,
                warn: globalOriginal.warn,
                error: globalOriginal.error,
                info: globalOriginal.info
            };
        } else {
            // Fallback: Use current console (may already be wrapped by debug.js)
            this.originalConsole = {
                log: console.log,
                warn: console.warn,
                error: console.error,
                info: console.info
            };
        }

        // Override console methods
        const that = this;

        console.log = function(...args) {
            that.addLog('log', args);
            that.originalConsole.log.apply(console, args);
        };

        console.warn = function(...args) {
            that.addLog('warn', args);
            that.originalConsole.warn.apply(console, args);
        };

        console.error = function(...args) {
            that.addLog('error', args);
            that.originalConsole.error.apply(console, args);
        };

        console.info = function(...args) {
            that.addLog('info', args);
            that.originalConsole.info.apply(console, args);
        };
    }

    /**
     * Restore original console methods
     */
    restoreConsoleMethods() {
        if (this.originalConsole) {
            console.log = this.originalConsole.log;
            console.warn = this.originalConsole.warn;
            console.error = this.originalConsole.error;
            console.info = this.originalConsole.info;
            this.originalConsole = null;
        }
    }

    /**
     * Add log entry to buffer (circular buffer)
     */
    addLog(level, args) {
        if (!this.enabled) return;

        const entry = {
            timestamp: Date.now(),
            relativeTime: Date.now() - this.startTime,
            level: level,
            message: this.formatArgs(args),
            rawArgs: args.map(arg => this.serializeArg(arg))
        };

        // Circular buffer - remove oldest if at max
        if (this.logs.length >= this.maxLogs) {
            this.logs.shift();
        }

        this.logs.push(entry);

        // Save to storage (debounced)
        this.saveLogsToStorage();
    }

    /**
     * Format arguments to string
     */
    formatArgs(args) {
        return args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }

    /**
     * Serialize argument for storage
     */
    serializeArg(arg) {
        if (arg === null) return null;
        if (arg === undefined) return undefined;

        if (typeof arg === 'object') {
            try {
                // Try to serialize, but limit depth
                return JSON.parse(JSON.stringify(arg));
            } catch (e) {
                // Circular reference or non-serializable
                return String(arg);
            }
        }

        return arg;
    }

    /**
     * Export logs as JSON
     */
    exportAsJSON() {
        const data = {
            metadata: {
                exportTime: new Date().toISOString(),
                sessionStartTime: new Date(this.startTime).toISOString(),
                sessionDuration: `${Math.round((Date.now() - this.startTime) / 1000)}s`,
                totalLogs: this.logs.length,
                maxLogs: this.maxLogs,
                userAgent: navigator.userAgent,
                extensionVersion: chrome.runtime.getManifest().version
            },
            logs: this.logs
        };

        const jsonString = JSON.stringify(data, null, 2);
        const filename = `scrapfly-logs-${Date.now()}.json`;

        // Use chrome.downloads API (works in Service Worker context)
        // Convert to data URL for chrome.downloads
        const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);

        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: false  // Don't prompt, use default download location
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                Logger.error('UTIL', '[LogCollector] Download error:', chrome.runtime.lastError);
            }
        });

        return filename;
    }

    /**
     * Export logs as text
     */
    exportAsText() {
        const header = [
            '='.repeat(80),
            'Scrapfly Debug Logs',
            '='.repeat(80),
            `Export Time: ${new Date().toISOString()}`,
            `Session Start: ${new Date(this.startTime).toISOString()}`,
            `Session Duration: ${Math.round((Date.now() - this.startTime) / 1000)}s`,
            `Total Logs: ${this.logs.length}`,
            `Extension Version: ${chrome.runtime.getManifest().version}`,
            `User Agent: ${navigator.userAgent}`,
            '='.repeat(80),
            ''
        ].join('\n');

        const lines = this.logs.map(entry => {
            const time = new Date(entry.timestamp).toISOString();
            const relative = `+${(entry.relativeTime / 1000).toFixed(3)}s`;
            const level = entry.level.toUpperCase().padEnd(5);
            return `[${time}] [${relative.padStart(12)}] [${level}] ${entry.message}`;
        });

        const text = header + lines.join('\n');
        const filename = `scrapfly-logs-${Date.now()}.txt`;

        // Use chrome.downloads API (works in Service Worker context)
        // Convert to data URL for chrome.downloads
        const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);

        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: false  // Don't prompt, use default download location
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                Logger.error('UTIL', '[LogCollector] Download error:', chrome.runtime.lastError);
            }
        });

        return filename;
    }

    /**
     * Copy logs to clipboard as text
     * @returns {Promise<{success: boolean, message: string, count: number}>}
     */
    async copyToClipboard() {
        try {
            // Format logs same as exportAsText()
            const header = [
                '='.repeat(80),
                'Scrapfly Debug Logs',
                '='.repeat(80),
                `Export Time: ${new Date().toISOString()}`,
                `Session Start: ${new Date(this.startTime).toISOString()}`,
                `Session Duration: ${Math.round((Date.now() - this.startTime) / 1000)}s`,
                `Total Logs: ${this.logs.length}`,
                `Extension Version: ${chrome.runtime.getManifest().version}`,
                `User Agent: ${navigator.userAgent}`,
                '='.repeat(80),
                ''
            ].join('\n');

            const lines = this.logs.map(entry => {
                const time = new Date(entry.timestamp).toISOString();
                const relative = `+${(entry.relativeTime / 1000).toFixed(3)}s`;
                const level = entry.level.toUpperCase().padEnd(5);
                return `[${time}] [${relative.padStart(12)}] [${level}] ${entry.message}`;
            });

            const text = header + lines.join('\n');

            // Use Clipboard API
            await navigator.clipboard.writeText(text);

            return {
                success: true,
                message: `Copied ${this.logs.length} logs to clipboard`,
                count: this.logs.length
            };
        } catch (error) {
            Logger.error('UTIL', '[LogCollector] Failed to copy to clipboard:', error);
            return {
                success: false,
                message: `Failed to copy: ${error.message}`,
                count: 0
            };
        }
    }

    /**
     * Clear all collected logs
     */
    clear() {
        this.logs = [];
        this.startTime = Date.now();
        // Save empty state to storage
        if (typeof chrome !== 'undefined' && chrome.storage) {
            try {
                chrome.storage.local.set({ [this.storageKey]: [] });
            } catch (e) {
                Logger.error('UTIL', '[LogCollector] Failed to clear storage:', e);
            }
        }
    }

    /**
     * Get current log count (async to ensure initialization is complete)
     */
    async getLogCount() {
        // Wait for initialization to complete if still in progress
        if (this.initPromise && !this.initialized) {
            await this.initPromise;
        }
        return this.logs.length;
    }

    /**
     * Set maximum number of logs (dynamically update buffer size)
     * If current logs exceed new max, keeps the newest logs
     */
    setMaxLogs(newMax) {
        if (typeof newMax !== 'number' || newMax < 100 || newMax > 100000) {
            Logger.error('UTIL', '[LogCollector] Invalid max logs value:', newMax);
            return;
        }

        this.maxLogs = newMax;

        // If we have more logs than new max, trim to keep newest
        if (this.logs.length > newMax) {
            const removed = this.logs.length - newMax;
            this.logs = this.logs.slice(removed); // Keep newest logs
        }

        // Save updated max logs setting
        if (typeof chrome !== 'undefined' && chrome.storage) {
            try {
                chrome.storage.local.set({ scrapfly_log_collector_max: newMax });
            } catch (e) {
                Logger.error('UTIL', '[LogCollector] Failed to save max logs setting:', e);
            }
        }
    }

    /**
     * Get logs filtered by level
     */
    getLogsByLevel(level) {
        return this.logs.filter(entry => entry.level === level);
    }

    /**
     * Get log statistics
     */
    getStats() {
        const stats = {
            total: this.logs.length,
            log: 0,
            warn: 0,
            error: 0,
            info: 0
        };

        this.logs.forEach(entry => {
            stats[entry.level]++;
        });

        return stats;
    }
}

// Create singleton instance
const logCollector = new LogCollector(5000); // Store last 5000 logs

// Export for use in other scripts
if (typeof self !== 'undefined' && typeof importScripts === 'function') {
    // Service worker context
    self.logCollector = logCollector;
    Logger.debug('UTIL', '[LogCollector] Loaded and attached to self (service worker)');
} else if (typeof window !== 'undefined') {
    // Window context (popup, content script)
    window.LogCollector = logCollector;
    Logger.debug('UTIL', '[LogCollector] Loaded and attached to window');
}
