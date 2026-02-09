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
        this.MAX_SAFE_LOGS = 5000;
        this.MAX_PERSISTED_LOGS = 1000;
        // Keep this conservative: capturing logs is cheap, but printing them (and DevTools retaining
        // rich objects) can easily crash the browser when debug is enabled.
        this.LOG_RATE_LIMIT_PER_SEC = 40;
        this.maxLogs = Math.min(Math.max(Number(maxLogs) || 5000, 100), this.MAX_SAFE_LOGS);
        // Ring buffer storage (O(1) append, no Array.shift())
        this.buffer = new Array(this.maxLogs);
        this.nextIndex = 0;
        this.size = 0;
        this.enabled = false;
        this.startTime = Date.now();
        this.originalConsole = null;
        this.storageKey = 'scrapfly_collected_logs';
        this.settingsKey = 'scrapfly_settings';
        // Legacy storage keys (pre v2.5) - settings are now stored inside scrapfly_settings
        this.legacyEnabledStateKey = 'scrapfly_log_collector_enabled';
        this.legacyMaxLogsKey = 'scrapfly_log_collector_max';
        this.storageWriteTimer = null;
        this.initialized = false;
        this.initPromise = null;
        this.rateWindowStart = Date.now();
        this.rateCount = 0;
        this.droppedLogs = 0;
        // Initialize and load from storage
        this.initPromise = this.initializeFromStorage();
    }

    _parseSettingsStorageValue(rawValue) {
        const result = {
            container: null,
            settings: null,
            wrapped: false,
            wasString: typeof rawValue === 'string'
        };

        if (rawValue === undefined || rawValue === null) {
            return result;
        }

        let parsed = rawValue;
        if (typeof rawValue === 'string') {
            try {
                parsed = JSON.parse(rawValue);
            } catch (e) {
                return result;
            }
        }

        if (!parsed || typeof parsed !== 'object') {
            return result;
        }

        // Stored as { timestamp, settings: {...} }
        if (parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)) {
            result.container = parsed;
            result.settings = parsed.settings;
            result.wrapped = true;
            return result;
        }

        // Stored as a flat settings object
        result.container = parsed;
        result.settings = parsed;
        return result;
    }

    _saveSettingsStorageValue(container, wasString) {
        try {
            const valueToSave = wasString ? JSON.stringify(container, null, 2) : container;
            chrome.storage.local.set({ [this.settingsKey]: valueToSave });
        } catch (e) {
            Logger.error('UTIL', '[LogCollector] Failed to persist settings:', e);
        }
    }

    _updateSettings(patch, { removeLegacyKeys = [] } = {}) {
        if (typeof chrome === 'undefined' || !chrome.storage) {
            return;
        }

        try {
            chrome.storage.local.get([this.settingsKey], (result) => {
                const parsed = this._parseSettingsStorageValue(result[this.settingsKey]);
                let container = parsed.container;
                let settings = parsed.settings;
                let wrapped = parsed.wrapped;
                let wasString = parsed.wasString;

                if (!settings || typeof settings !== 'object') {
                    // Create wrapper by default for consistency with settings UI
                    container = {
                        timestamp: new Date().toISOString(),
                        settings: {}
                    };
                    settings = container.settings;
                    wrapped = true;
                    wasString = true;
                }

                for (const [key, value] of Object.entries(patch || {})) {
                    settings[key] = value;
                }

                if (wrapped && container && typeof container === 'object') {
                    container.settings = settings;
                    container.timestamp = new Date().toISOString();
                    this._saveSettingsStorageValue(container, wasString);
                } else {
                    this._saveSettingsStorageValue(settings, wasString);
                }

                if (removeLegacyKeys.length > 0) {
                    try {
                        chrome.storage.local.remove(removeLegacyKeys);
                    } catch (e) {
                        // Ignore removal errors
                    }
                }

                // Keep Logger globals in sync if Utils is available
                if (typeof Utils !== 'undefined' && typeof Utils.applyDebugMode === 'function') {
                    Utils.applyDebugMode(settings);
                } else if (typeof globalThis !== 'undefined') {
                    globalThis.logCollectorEnabled = !!settings.logCollectorEnabled;
                }
            });
        } catch (e) {
            Logger.error('UTIL', '[LogCollector] Failed to update settings:', e);
        }
    }

    _writeEntry(entry) {
        this.buffer[this.nextIndex] = entry;
        this.nextIndex = (this.nextIndex + 1) % this.maxLogs;
        if (this.size < this.maxLogs) {
            this.size += 1;
        }
    }

    _getOrderedLogs() {
        if (this.size === 0) return [];
        const out = new Array(this.size);
        const start = (this.nextIndex - this.size + this.maxLogs) % this.maxLogs;
        for (let i = 0; i < this.size; i++) {
            out[i] = this.buffer[(start + i) % this.maxLogs];
        }
        return out.filter(Boolean);
    }

    _getLastNLogs(n) {
        const count = Math.min(this.size, Math.max(0, n | 0));
        if (count === 0) return [];
        const out = new Array(count);
        const start = (this.nextIndex - count + this.maxLogs) % this.maxLogs;
        for (let i = 0; i < count; i++) {
            out[i] = this.buffer[(start + i) % this.maxLogs];
        }
        return out.filter(Boolean);
    }

    _resetFromArray(logArray) {
        const logs = Array.isArray(logArray) ? logArray.slice(-this.maxLogs) : [];
        this.buffer = new Array(this.maxLogs);
        this.nextIndex = 0;
        this.size = 0;
        for (const entry of logs) {
            this._writeEntry(entry);
        }
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
                chrome.storage.local.get([this.storageKey, this.settingsKey, this.legacyEnabledStateKey, this.legacyMaxLogsKey], (result) => {
                    try {
                        const storedLogs = (result[this.storageKey] && Array.isArray(result[this.storageKey]))
                            ? result[this.storageKey]
                            : [];

                        const parsedSettings = this._parseSettingsStorageValue(result[this.settingsKey]);
                        const settings = parsedSettings.settings || {};
                        const hasLegacyEnabled = Object.prototype.hasOwnProperty.call(result, this.legacyEnabledStateKey);
                        const hasLegacyMax = Object.prototype.hasOwnProperty.call(result, this.legacyMaxLogsKey);

                        // Restore max logs setting (settings first, then legacy fallback)
                        let rawMax = settings.logCollectorMaxLogs;
                        if ((rawMax === undefined || rawMax === null) && hasLegacyMax) {
                            rawMax = result[this.legacyMaxLogsKey];
                        }
                        if (rawMax !== undefined && rawMax !== null) {
                            this.maxLogs = Math.min(Math.max(Number(rawMax) || 5000, 100), this.MAX_SAFE_LOGS);
                        }

                        // Restore logs after maxLogs is known so ring buffer indices stay consistent.
                        this._resetFromArray(storedLogs);

                        // Restore enabled state and auto-resume collection if needed
                        let wasEnabled = false;
                        if (typeof settings.logCollectorEnabled === 'boolean') {
                            wasEnabled = settings.logCollectorEnabled === true;
                        } else if (hasLegacyEnabled) {
                            wasEnabled = result[this.legacyEnabledStateKey] === true;
                        }
                        if (wasEnabled) {
                            this.enabled = true;
                            this.interceptConsoleMethods();
                            if (typeof globalThis !== 'undefined') {
                                globalThis.logCollectorEnabled = true;
                            }
                        }

                        // Migrate legacy keys into scrapfly_settings and remove old keys
                        const patch = {};
                        const removeLegacyKeys = [];

                        // Always keep defaults in settings when settings object exists
                        const shouldWriteDefaults = !!parsedSettings.container;

                        if (typeof settings.logCollectorEnabled !== 'boolean') {
                            if (hasLegacyEnabled) {
                                patch.logCollectorEnabled = result[this.legacyEnabledStateKey] === true;
                            } else if (shouldWriteDefaults) {
                                patch.logCollectorEnabled = false;
                            }
                        }

                        const currentMax = settings.logCollectorMaxLogs;
                        const resolvedMax = Math.min(Math.max(Number(rawMax) || 5000, 100), this.MAX_SAFE_LOGS);
                        if (currentMax === undefined || currentMax === null) {
                            if (rawMax !== undefined && rawMax !== null) {
                                patch.logCollectorMaxLogs = resolvedMax;
                            } else if (shouldWriteDefaults) {
                                patch.logCollectorMaxLogs = this.maxLogs;
                            }
                        } else if (Number(currentMax) !== resolvedMax) {
                            patch.logCollectorMaxLogs = resolvedMax;
                        }

                        if (hasLegacyEnabled) removeLegacyKeys.push(this.legacyEnabledStateKey);
                        if (hasLegacyMax) removeLegacyKeys.push(this.legacyMaxLogsKey);

                        if (Object.keys(patch).length > 0 || removeLegacyKeys.length > 0) {
                            this._updateSettings(patch, { removeLegacyKeys });
                        }
                    } catch (e) {
                        Logger.error('UTIL', '[LogCollector] Failed to restore from storage:', e);
                        this._resetFromArray([]);
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

        // Debounce storage writes to reduce pressure on chrome.storage
        if (this.storageWriteTimer) {
            clearTimeout(this.storageWriteTimer);
        }

        this.storageWriteTimer = setTimeout(() => {
            try {
                const persistedLogs = this._getLastNLogs(this.MAX_PERSISTED_LOGS);
                chrome.storage.local.set({ [this.storageKey]: persistedLogs });
            } catch (e) {
                Logger.error('UTIL', '[LogCollector] Failed to save logs to storage:', e);
            }
        }, 5000);
    }

    /**
     * Enable log collection
     */
    enable() {
        if (this.enabled) {
            return;
        }

        this.enabled = true;
        // Don't reset startTime or clear logs - preserve existing logs from storage
        this.interceptConsoleMethods();
        // Ring buffer already clamps to maxLogs

        if (typeof globalThis !== 'undefined') {
            globalThis.logCollectorEnabled = true;
        }

        // Persist enabled state to settings
        this._updateSettings({ logCollectorEnabled: true }, { removeLegacyKeys: [this.legacyEnabledStateKey] });
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

        if (typeof globalThis !== 'undefined') {
            globalThis.logCollectorEnabled = false;
        }

        // Persist disabled state to settings
        this._updateSettings({ logCollectorEnabled: false }, { removeLegacyKeys: [this.legacyEnabledStateKey] });

    }

    /**
     * Intercept console methods to capture logs
     */
    interceptConsoleMethods() {
        // Store original console methods before overriding
        const root = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : self);
        const original = root && root.__scrapflyOriginalConsole
            ? root.__scrapflyOriginalConsole
            : console;
        this.originalConsole = {
            log: original.log ? original.log.bind(original) : console.log,
            warn: original.warn ? original.warn.bind(original) : console.warn,
            error: original.error ? original.error.bind(original) : console.error,
            info: original.info ? original.info.bind(original) : console.info,
            debug: original.debug ? original.debug.bind(original) : (original.log ? original.log.bind(original) : console.log)
        };

        // Override console methods
        const that = this;

        console.log = function(...args) {
            that.addLog('log', args);
            if (that._shouldForwardToConsole('log') && that.originalConsole?.log) {
                that.originalConsole.log(...that._sanitizeConsoleArgs(args));
            }
        };

        console.warn = function(...args) {
            that.addLog('warn', args);
            if (that._shouldForwardToConsole('warn') && that.originalConsole?.warn) {
                that.originalConsole.warn(...that._sanitizeConsoleArgs(args));
            }
        };

        console.error = function(...args) {
            that.addLog('error', args);
            if (that._shouldForwardToConsole('error') && that.originalConsole?.error) {
                that.originalConsole.error(...that._sanitizeConsoleArgs(args, { keepErrors: true }));
            }
        };

        console.info = function(...args) {
            that.addLog('info', args);
            if (that._shouldForwardToConsole('info') && that.originalConsole?.info) {
                that.originalConsole.info(...that._sanitizeConsoleArgs(args));
            }
        };

        console.debug = function(...args) {
            that.addLog('debug', args);
            if (that._shouldForwardToConsole('debug') && that.originalConsole?.debug) {
                that.originalConsole.debug(...that._sanitizeConsoleArgs(args));
            }
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
            console.debug = this.originalConsole.debug;
            this.originalConsole = null;
        }
    }

    _shouldForwardToConsole(level) {
        // When collecting, avoid printing high-volume logs to console.
        // DevTools (and SW logs) can retain rich objects and crash Chrome under log storms.
        return level === 'warn' || level === 'error';
    }

    _sanitizeConsoleArgs(args, opts = {}) {
        const keepErrors = opts.keepErrors === true;
        const maxArgs = 5;
        return args.slice(0, maxArgs).map((arg) => this._sanitizeConsoleArg(arg, { keepErrors }));
    }

    _sanitizeConsoleArg(arg, opts = {}) {
        const keepErrors = opts.keepErrors === true;
        if (keepErrors && arg instanceof Error) return arg;
        if (arg === null || arg === undefined) return arg;

        const t = typeof arg;
        if (t === 'string') return this.truncateString(arg, 2000);
        if (t === 'number' || t === 'boolean' || t === 'bigint') return arg;
        if (t === 'function') return `[Function${arg.name ? ` ${arg.name}` : ''}]`;
        if (Array.isArray(arg)) return `[Array(${arg.length})]`;
        if (t === 'object') {
            try {
                if (arg instanceof Error) return `Error(${arg.message})`;
            } catch (e) {
                // ignore
            }

            // Typed arrays / ArrayBuffers can be enormous; never enumerate keys.
            try {
                if (typeof ArrayBuffer !== 'undefined' && arg instanceof ArrayBuffer) {
                    return `[ArrayBuffer(${arg.byteLength} bytes)]`;
                }
            } catch (e) {
                // ignore
            }
            try {
                if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' && ArrayBuffer.isView(arg)) {
                    const name = arg?.constructor?.name || 'TypedArray';
                    const len = typeof arg.length === 'number' ? arg.length : undefined;
                    const bytes = typeof arg.byteLength === 'number' ? arg.byteLength : undefined;
                    if (typeof len === 'number' && typeof bytes === 'number') return `[${name}(${len}) ${bytes} bytes]`;
                    if (typeof bytes === 'number') return `[${name} ${bytes} bytes]`;
                    if (typeof len === 'number') return `[${name}(${len})]`;
                    return `[${name}]`;
                }
            } catch (e) {
                // ignore
            }

            if (arg instanceof Map) return `[Map(${arg.size})]`;
            if (arg instanceof Set) return `[Set(${arg.size})]`;
            if (arg instanceof Date) return arg.toISOString();

            try {
                const keys = Object.keys(arg).slice(0, 10);
                return `{${keys.join(', ')}}`;
            } catch (e) {
                return '[Object]';
            }
        }
        return String(arg);
    }

    /**
     * Add log entry to buffer (circular buffer)
     */
    addLog(level, args) {
        if (!this.enabled) return;

        const now = Date.now();
        if (now - this.rateWindowStart >= 1000) {
            this.rateWindowStart = now;
            this.rateCount = 0;
        }
        this.rateCount += 1;
        if (this.rateCount > this.LOG_RATE_LIMIT_PER_SEC) {
            this.droppedLogs += 1;
            return;
        }

        const entry = {
            timestamp: now,
            relativeTime: now - this.startTime,
            level: level,
            message: this.truncateString(this.formatArgs(args), 2000),
            rawArgs: args.slice(0, 5).map(arg => this.truncateArg(this.serializeArg(arg)))
        };

        // Ring buffer - O(1) append, bounded memory
        this._writeEntry(entry);

        // Save to storage (debounced)
        this.saveLogsToStorage();
    }

    /**
     * Format arguments to string
     */
    formatArgs(args) {
        return args.map(arg => {
            if (typeof arg === 'object') {
                if (arg instanceof Error) {
                    return `Error(${arg.message})`;
                }
                if (Array.isArray(arg)) {
                    return `[Array(${arg.length})]`;
                }
                return '[Object]';
            }
            return String(arg);
        }).join(' ');
    }

    truncateString(value, maxLength) {
        if (typeof value !== 'string') return value;
        if (value.length <= maxLength) return value;
        return `${value.slice(0, maxLength)}...`;
    }

    truncateArg(arg) {
        if (typeof arg === 'string') {
            return this.truncateString(arg, 2000);
        }
        if (arg && typeof arg === 'object') {
            try {
                const serialized = JSON.stringify(arg);
                return this.truncateString(serialized, 2000);
            } catch (e) {
                return String(arg);
            }
        }
        return arg;
    }

    /**
     * Serialize argument for storage
     */
    serializeArg(arg) {
        if (arg === null) return null;
        if (arg === undefined) return undefined;

        if (typeof arg === 'object') {
            if (arg instanceof Error) {
                return { type: 'Error', message: arg.message };
            }
            if (Array.isArray(arg)) {
                return { type: 'Array', length: arg.length };
            }
            try {
                if (typeof ArrayBuffer !== 'undefined' && arg instanceof ArrayBuffer) {
                    return { type: 'ArrayBuffer', byteLength: arg.byteLength };
                }
            } catch (e) {
                // ignore
            }
            try {
                if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' && ArrayBuffer.isView(arg)) {
                    return {
                        type: 'TypedArray',
                        name: arg?.constructor?.name || 'TypedArray',
                        length: typeof arg.length === 'number' ? arg.length : undefined,
                        byteLength: typeof arg.byteLength === 'number' ? arg.byteLength : undefined
                    };
                }
            } catch (e) {
                // ignore
            }
            if (arg instanceof Map) return { type: 'Map', size: arg.size };
            if (arg instanceof Set) return { type: 'Set', size: arg.size };
            if (arg instanceof Date) return { type: 'Date', value: arg.toISOString() };
            try {
                const keys = Object.keys(arg).slice(0, 10);
                return { type: 'Object', keys };
            } catch (e) {
                return String(arg);
            }
        }

        return arg;
    }

    /**
     * Export logs as JSON
     */
    exportAsJSON() {
        const logs = this._getOrderedLogs();
        const data = {
            metadata: {
                exportTime: new Date().toISOString(),
                sessionStartTime: new Date(this.startTime).toISOString(),
                sessionDuration: `${Math.round((Date.now() - this.startTime) / 1000)}s`,
                totalLogs: logs.length,
                maxLogs: this.maxLogs,
                userAgent: navigator.userAgent,
                extensionVersion: chrome.runtime.getManifest().version
            },
            logs
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
        const logs = this._getOrderedLogs();
        const header = [
            '='.repeat(80),
            'Scrapfly Debug Logs',
            '='.repeat(80),
            `Export Time: ${new Date().toISOString()}`,
            `Session Start: ${new Date(this.startTime).toISOString()}`,
            `Session Duration: ${Math.round((Date.now() - this.startTime) / 1000)}s`,
            `Total Logs: ${logs.length}`,
            `Extension Version: ${chrome.runtime.getManifest().version}`,
            `User Agent: ${navigator.userAgent}`,
            '='.repeat(80),
            ''
        ].join('\n');

        const lines = logs.map(entry => {
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
            const logs = this._getOrderedLogs();
            // Format logs same as exportAsText()
            const header = [
                '='.repeat(80),
                'Scrapfly Debug Logs',
                '='.repeat(80),
                `Export Time: ${new Date().toISOString()}`,
                `Session Start: ${new Date(this.startTime).toISOString()}`,
                `Session Duration: ${Math.round((Date.now() - this.startTime) / 1000)}s`,
                `Total Logs: ${logs.length}`,
                `Extension Version: ${chrome.runtime.getManifest().version}`,
                `User Agent: ${navigator.userAgent}`,
                '='.repeat(80),
                ''
            ].join('\n');

            const lines = logs.map(entry => {
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
                message: `Copied ${logs.length} logs to clipboard`,
                count: logs.length
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
        this._resetFromArray([]);
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
        return this.size;
    }

    /**
     * Set maximum number of logs (dynamically update buffer size)
     * If current logs exceed new max, keeps the newest logs
     */
    setMaxLogs(newMax) {
        if (typeof newMax !== 'number') {
            Logger.error('UTIL', '[LogCollector] Invalid max logs value:', newMax);
            return;
        }

        const clamped = Math.min(Math.max(newMax, 100), this.MAX_SAFE_LOGS);
        if (clamped !== newMax) {
            Logger.error('UTIL', '[LogCollector] Invalid max logs value:', newMax);
        }

        const existing = this._getOrderedLogs();
        this.maxLogs = clamped;
        this._resetFromArray(existing);

        // Save updated max logs setting to settings
        this._updateSettings({ logCollectorMaxLogs: this.maxLogs }, { removeLegacyKeys: [this.legacyMaxLogsKey] });
    }

    /**
     * Get logs filtered by level
     */
    getLogsByLevel(level) {
        return this._getOrderedLogs().filter(entry => entry.level === level);
    }

    /**
     * Get log statistics
     */
    getStats() {
        const logs = this._getOrderedLogs();
        const stats = {
            total: logs.length,
            log: 0,
            warn: 0,
            error: 0,
            info: 0,
            debug: 0,
            dropped: this.droppedLogs
        };

        logs.forEach(entry => {
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
