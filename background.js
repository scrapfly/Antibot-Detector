/**
 * Background script for Scrapfly Security Detection Extension
 * Handles message passing, header capture, and data storage
 */

// Import scripts for service worker
importScripts(
    './modules/core/logger.js',
    './modules/core/badge-constants.js',
    './modules/core/log-collector.js',
    './utils/utils.js',
    './utils/pattern-cache.js',
    './modules/core/storage-manager.js',
    './modules/detection/managers/category-manager.js',
    './modules/detection/managers/detector-manager.js',
    './modules/detection/managers/confidence-manager.js',
    './modules/detection/engine/detection-engine-analysis.js',
    './modules/detection/engine/detection-engine-extractors.js',
    './modules/detection/engine/detection-engine-matching.js',
    './modules/detection/engine/detection-engine-hooks.js',
    './modules/detection/engine/detection-engine-manager.js',
    './modules/ui/notification-manager.js',
    './modules/core/update-manager.js', // Auto-update detector definitions
    './modules/detection/managers/detection-state-manager.js',
    './modules/detection/hooks/worker-keepalive-manager.js',
    './sections/history/history.js',
    './sections/settings/settings-runtime.js',
    // Base helpers for interceptors (service worker context)
    './sections/advanced/base-interceptor-helpers.js',
    // Advanced module interceptors (service worker only - UI modules are in popup.html)
    './sections/advanced/modules/recaptcha/libs/pbf.js',
    './sections/advanced/modules/recaptcha/libs/message.browser.js',
    './sections/advanced/modules/recaptcha/recaptcha-interceptor.js',
    './sections/advanced/modules/akamai/akamai-interceptor.js',
    './sections/advanced/modules/imperva/imperva-interceptor.js',
    './sections/advanced/modules/shapesecurity/shapesecurity-interceptor.js',
    './sections/advanced/modules/awswaf/awswaf-interceptor.js',
    './sections/advanced/modules/geetest/geetest-interceptor.js',
    './sections/advanced/modules/datadome/datadome-interceptor.js',
    './sections/advanced/modules/cloudflare/cloudflare-interceptor.js',
    './sections/advanced/modules/turnstile/turnstile-interceptor.js',
    './sections/advanced/modules/hcaptcha/hcaptcha-interceptor.js',
    './sections/advanced/modules/funcaptcha/funcaptcha-interceptor.js',
    // Background runtime modules (phase-1 split)
    './background/detection-lifecycle.js',
    './background/handlers/router-utils.js',
    './background/handlers/messages-logging.js',
    './background/handlers/messages-detection.js',
    './background/handlers/messages-cache.js',
    './background/handlers/messages-settings.js',
    './background/handlers/messages-log-collector.js',
    './background/handlers/messages-advanced-capture.js',
    './background/handlers/router-registry.js',
    './background/handlers/message-router.js',
    './background/tab-events.js',
    './background/init.js'
    // Note: SessionManager and DetectionSession removed - using simple Map instead
);

Logger.background('Logger initialized in BACKGROUND context');

class TTLMap extends Map {
    constructor(ttlMs = 300000, maxSize = 500) { // 5 min default, 500 entries max
        super();
        this.ttlMs = ttlMs;
        this.maxSize = maxSize;
        this.timers = new Map();
        this.accessOrder = []; // Track insertion order for LRU eviction
    }

    set(key, value) {
        // Update existing key
        if (this.has(key)) {
            // Remove from accessOrder first
            const idx = this.accessOrder.indexOf(key);
            if (idx > -1) this.accessOrder.splice(idx, 1);
            clearTimeout(this.timers.get(key));
        } else if (this.size >= this.maxSize) {
            // Adding new key and at capacity - evict oldest
            this._evictOldest();
        }

        // Set new timer for auto-cleanup
        const timer = setTimeout(() => {
            super.delete(key);
            this.timers.delete(key);
            // Remove from access order
            const idx = this.accessOrder.indexOf(key);
            if (idx > -1) this.accessOrder.splice(idx, 1);
        }, this.ttlMs);

        this.timers.set(key, timer);
        this.accessOrder.push(key); // Track insertion order
        return super.set(key, value);
    }

    _evictOldest() {
        if (this.accessOrder.length === 0) return;
        const oldest = this.accessOrder.shift(); // Remove oldest
        if (this.timers.has(oldest)) {
            clearTimeout(this.timers.get(oldest));
            this.timers.delete(oldest);
        }
        super.delete(oldest);
    }

    delete(key) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
        // Remove from access order
        const idx = this.accessOrder.indexOf(key);
        if (idx > -1) this.accessOrder.splice(idx, 1);
        return super.delete(key);
    }

    clear() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        this.accessOrder = [];
        return super.clear();
    }
}

// Storage for headers per tab
const headersStore = new TTLMap(300000); // Response headers
const requestHeadersStore = new TTLMap(300000); // Request headers
const responseCookiesStore = new TTLMap(300000); // Response cookies (from Set-Cookie)
const payloadStore = new TTLMap(300000); // Request payloads (POST/PUT/PATCH bodies)
const networkUrlsStore = new TTLMap(300000); // All network request URLs (for URL pattern detection)

// Capture state maps (30 min TTL, max 100 entries)
const reCaptchaCaptureState = new TTLMap(1800000, 100); // 30 min, max 100 captures
const akamaiCaptureState = new TTLMap(1800000, 100); // 30 min, max 100 captures
const impervaCaptureState = new TTLMap(1800000, 100); // 30 min, max 100 captures
const funcaptchaCaptureState = new TTLMap(1800000, 100); // 30 min, max 100 captures

// Initialize managers on extension startup
let detectorManager = null;
let categoryManager = null;
let detectionEngine = null;

let detectionStateManager = null;
let workerKeepaliveManager = null;

// Initialization guard to prevent concurrent initializations (race condition fix)
let initializationInProgress = false;
let initializationPromise = null;

// Track recent detection requests to prevent duplicates (5 min TTL, max 200 entries)
const recentDetectionRequests = new TTLMap(300000, 200); // 5 min, prevents spam

// Track active detections (10 min TTL, max 50 entries - tabs currently running detection with loading badge)
const activeDetections = new TTLMap(600000, 50); // 10 min, max 50 concurrent

// Track interrupted detections (5 min TTL, max 50 entries - tabs where user switched away mid-detection)
const interruptedDetections = new TTLMap(300000, 50); // 5 min, auto-cleanup

// Track currently active tab to detect interruptions
let currentActiveTab = null; // tabId of currently active tab

// Track tab focus timing to debounce rapid switches (prevents false interruptions)
const tabFocusTimestamps = new Map(); // tabId -> timestamp when focused
const TAB_SWITCH_DEBOUNCE_MS = 500; // Ignore switches under 500ms (rapid tab switching)

// Track manually cleared caches to prevent showing red X on tab switch
const manuallyClearedCaches = new Set(); // Set of URL hashes that were manually cleared

let cachedEnabledState = { value: true, timestamp: 0 };
const ENABLED_CACHE_TTL = 5000; // 5 seconds

/**
 * Get cached enabled state (avoids repeated storage reads)
 * @returns {Promise<boolean>} - True if extension is enabled
 */
async function isExtensionEnabled() {
    const now = Date.now();
    if (now - cachedEnabledState.timestamp < ENABLED_CACHE_TTL) {
        return cachedEnabledState.value;
    }
    const result = await chrome.storage.local.get(['scrapfly_enabled']);
    cachedEnabledState = {
        value: result.scrapfly_enabled !== false, // Default to true
        timestamp: now
    };
    return cachedEnabledState.value;
}

// Invalidate cache when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.scrapfly_enabled) {
        cachedEnabledState = {
            value: changes.scrapfly_enabled.newValue !== false,
            timestamp: Date.now()
        };
    }
});

const detectionStates = new TTLMap(300000, 50); // tabId -> {url, hooksData: [], mainData: [], hooksComplete: false, mainComplete: false}

// Hooks timing defaults (used if settings unavailable)
const DEFAULT_HOOKS_MAX_DETECTION_MS = 8000;
const HOOKS_DEADLINE_BUFFER_MS = 200;

async function ensureHooksDeadline(state) {
    if (!state) return Date.now() + DEFAULT_HOOKS_MAX_DETECTION_MS + HOOKS_DEADLINE_BUFFER_MS;
    if (state.hooksDeadline) {
        return state.hooksDeadline;
    }

    const startTime = state.startTime || Date.now();
    state.hooksMaxMs = DEFAULT_HOOKS_MAX_DETECTION_MS;
    state.hooksDeadline = startTime + DEFAULT_HOOKS_MAX_DETECTION_MS + HOOKS_DEADLINE_BUFFER_MS;
    state.hooksDeadlineSource = 'default';
    return state.hooksDeadline;
}

async function ensureDebugMode(state) {
    if (!state) return false;
    if (typeof state.debugMode === 'boolean') return state.debugMode;
    try {
        const settings = await Utils.getSettings(chrome);
        state.debugMode = settings?.debugMode || false;
    } catch (error) {
        state.debugMode = false;
    }
    return state.debugMode;
}

// Track tabs that have cache hits to skip unnecessary capture work (payload, headers, etc)
const tabsUsingCache = new Set();

// CRITICAL FIX: Track tabs where cache was recently cleared to prevent zombie data
const recentlyClearedTabs = new Set();

const finalizationDebounce = new Map(); // tabId -> timeout

// FIX: Track when batches are actively processing to prevent race conditions
// Prevents finalization from running while hooksData is being written
const batchProcessingFlags = new Map(); // tabId -> boolean

/**
 * Helper functions for detection state management
 */

/**
 * Generate unique key for match deduplication
 * @param {Object} match - Match object with type and identifying fields
 * @returns {string} Unique key for the match
 */
function generateMatchKey(match) {
    const matchType = (match.type || '').toLowerCase();

    // Generate key based on match type and identifying fields
    switch (matchType) {
        case 'cookie':
            return `cookie:${match.name}:${match.value}`;

        case 'header':
            return `header:${match.name}:${match.value}`;

        case 'content':
        case 'script':
            return `${matchType}:${match.pattern || match.content}`;

        case 'url':
            return `url:${match.pattern || match.value}`;

        case 'dom':
            return `dom:${match.selector || match.pattern}`;

        case 'window':
            return `window:${match.pattern}`;

        case 'js_hooks':
            return `js_hooks:${match.pattern}`;

        default:
            return `${matchType}:${match.pattern || match.value || ''}`;
    }
}

function getOrCreateDetectionState(tabId, url) {
    const existingState = detectionStates.get(tabId);

    // If state exists but URL differs, abort old detection and create fresh state
    if (existingState && existingState.url !== url) {
        // Abort old detection if it's in progress
        if (activeDetections.has(tabId)) {
            const activeInfo = activeDetections.get(tabId);
            if (activeInfo.abortController) {
                activeInfo.abortController.abort();
            }
            activeDetections.delete(tabId);
        }

        if (detectionStateManager && detectionStateManager.isDetecting(tabId)) {
            detectionStateManager.abandonDetection(tabId, 'url_changed');
        }

        if (workerKeepaliveManager) {
            workerKeepaliveManager.endOperationsForTab(tabId);
        }

        // Mark old state as interrupted
        existingState.interrupted = true;
        existingState.error = 'url_changed';

        // Clear pending finalization timeout to prevent stale finalization
        if (finalizationDebounce.has(tabId)) {
            clearTimeout(finalizationDebounce.get(tabId));
            finalizationDebounce.delete(tabId);
        }

        // Clear old state
        detectionStates.delete(tabId);
    }

    if (!detectionStates.has(tabId)) {
        const startTime = Date.now();
        const newState = {
            url: url,
            tabTitle: null, // Will be set by processDetectionData
            hooksData: new Map(), // detectorId -> detector object
            mainData: [],
            // NEW: Granular method tracking (7 methods total)
            completedMethods: new Set(), // Track which methods have completed
            methodOrder: ['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload'],
            // Keep old flags for backward compatibility
            hooksComplete: false,
            mainComplete: false,
            windowPropertiesComplete: false,
            lastHookBatchTime: 0,
            startTime: startTime,
            hooksDeadline: startTime + DEFAULT_HOOKS_MAX_DETECTION_MS + HOOKS_DEADLINE_BUFFER_MS,
            hooksMaxMs: DEFAULT_HOOKS_MAX_DETECTION_MS,
            hooksDeadlineSource: 'default',
            hooksTimedOut: false,
            hooksCompletionReason: null,
            hooksCompletionTime: null,
            hooksUninstallStats: null
        };

        detectionStates.set(tabId, newState);

        if (detectionStateManager) {
            detectionStateManager.startDetection(tabId, url).catch(e => {
                Logger.error('BACKGROUND', '[DetectionStateManager] Failed to start detection:', e);
            });
        }

        if (workerKeepaliveManager) {
            workerKeepaliveManager.startOperation(`detection-${tabId}`, {
                tabId,
                reason: 'page_detection'
            });
        }
    }
    return detectionStates.get(tabId);
}

/**
 * GRANULAR PROGRESS: Send method-specific progress updates
 * Each method completion contributes ~12.5% (100% / 8 methods)
 */
function sendProgressUpdate(tabId, methodName, completedMethods, totalMethods = 8, options = {}) {
    try {
        // FIX: Don't override badge if detection is already finalized
        // Check if this tab is still in active detection state
        const state = detectionStates.get(tabId);
        if (!state || state.finalized) {
            return;
        }

        // FIX: DON'T UPDATE BADGE WITH PERCENTAGE!
        // This was causing the "stuck at 29%" issue.
        // The badge should only show the final count after detection completes.
        // Percentages are confusing and get stuck when methods complete out of order.

        const message = `Checked ${methodName}`;

        // DON'T update badge - only send progress to popup for UI purposes
        // Badge will be updated to final count in finalizeDetection()

        // Send granular progress message to popup (for step highlighting, not badge)
        const progressMessage = {
            type: 'DETECTION_PROGRESS',
            tabId: tabId,
            progress: {
                method: methodName,
                completedMethods: Array.from(completedMethods),
                message: message
            }
        };

        chrome.runtime.sendMessage(progressMessage).catch(() => {
            // Silently fail - popup might not be open
        });

        // Also forward to the content script so the JS API can emit scrapfly:onProgress
        chrome.tabs.sendMessage(tabId, progressMessage).catch(() => {
            // Content script might not be ready or might be on an unsupported URL
        });
    } catch (e) {
        Logger.error('DETECTION', '[Progress] Error sending update:', e);
    }
}

async function migrateLegacyStorageKeys() {
    try {
        const keys = [
            'scrapfly_detection_storage',
            'scrapfly_detection_state',
            'scrapfly_history',
            'scrapfly_log_collector_enabled',
            'scrapfly_log_collector_max'
        ];

        const result = await chrome.storage.local.get(keys);
        const hasLegacyDetectionStorage = Object.prototype.hasOwnProperty.call(result, 'scrapfly_detection_storage');

        const parseMaybeJson = (value) => {
            if (value === undefined || value === null) return null;
            if (typeof value === 'string') {
                try {
                    return JSON.parse(value);
                } catch (e) {
                    return null;
                }
            }
            return value;
        };

        const readHistoryItems = (raw) => {
            if (!raw) return [];
            if (typeof raw === 'string') {
                try {
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed?.items) ? parsed.items : [];
                } catch (e) {
                    return [];
                }
            }
            if (Array.isArray(raw)) return raw;
            if (raw && Array.isArray(raw.items)) return raw.items;
            return [];
        };

        // Migrate legacy detection cache into history (if present)
        if (hasLegacyDetectionStorage) {
            const legacyParsed = parseMaybeJson(result.scrapfly_detection_storage);

            if (legacyParsed && typeof legacyParsed === 'object') {
                let legacyEntries = [];
                if (Array.isArray(legacyParsed)) {
                    legacyEntries = legacyParsed;
                } else if (Array.isArray(legacyParsed.items)) {
                    legacyEntries = legacyParsed.items;
                } else {
                    legacyEntries = Object.values(legacyParsed);
                }

                const now = Date.now();
                const migrated = [];
                let migratableCount = 0;

                for (const entry of legacyEntries) {
                    if (!entry || typeof entry !== 'object') continue;
                    const url = entry.url;
                    if (!url || typeof url !== 'string') continue;
                    migratableCount += 1;

                    const expiry = Number(entry.expiry);
                    if (Number.isFinite(expiry) && expiry > 0 && expiry < now) {
                        continue; // Skip expired cache entries
                    }

                    let ts = entry.timestamp;
                    if (typeof ts === 'string') {
                        const parsedTs = Date.parse(ts);
                        ts = Number.isFinite(parsedTs) ? parsedTs : now;
                    }
                    if (typeof ts !== 'number' || !Number.isFinite(ts)) {
                        ts = now;
                    }

                    const detections = Array.isArray(entry.detectionResults)
                        ? entry.detectionResults
                        : (Array.isArray(entry.detections) ? entry.detections : []);

                    const detectionCount = Number.isFinite(Number(entry.detectionCount))
                        ? Number(entry.detectionCount)
                        : detections.length;

                    let hostname = entry.hostname;
                    if (!hostname) {
                        try {
                            hostname = new URL(url).hostname;
                        } catch (e) {
                            hostname = '';
                        }
                    }

                    const categories = Array.from(new Set(
                        (detections || [])
                            .map(d => d?.category || d?.detector?.category)
                            .filter(Boolean)
                    ));

                    migrated.push({
                        id: entry.id || `legacy_cache_${ts}_${hostname || 'unknown'}`,
                        url,
                        hostname,
                        title: entry.title || hostname || url,
                        favicon: entry.favicon || '',
                        timestamp: ts,
                        detections,
                        detectionCount,
                        categories,
                        cacheScope: entry.cacheScope || 'domain'
                    });
                }

                if (migratableCount === 0) {
                    Logger.warn('STORAGE', '[Migration] Found scrapfly_detection_storage but no entries had a usable URL - leaving as-is');
                } else {
                    let shouldRemoveLegacy = false;

                    // If every URL entry was expired, we can safely remove the legacy cache.
                    if (migrated.length === 0) {
                        shouldRemoveLegacy = true;
                    } else {
                        const historyItems = readHistoryItems(result.scrapfly_history);
                        const existing = new Set(historyItems.map((item) => `${item?.url || ''}|${item?.timestamp || ''}`));
                        const dedupedMigrated = migrated.filter((item) => {
                            const key = `${item.url}|${item.timestamp}`;
                            if (existing.has(key)) return false;
                            existing.add(key);
                            return true;
                        });

                        // If everything was already in history, we can remove the legacy cache without writing.
                        if (dedupedMigrated.length === 0) {
                            shouldRemoveLegacy = true;
                        } else {
                            try {
                                const merged = historyItems.concat(dedupedMigrated);
                                merged.sort((a, b) => (Number(b?.timestamp) || 0) - (Number(a?.timestamp) || 0));

                                await chrome.storage.local.set({
                                    scrapfly_history: JSON.stringify({
                                        items: merged,
                                        lastUpdated: Date.now()
                                    }, null, 2)
                                });

                                Logger.storage(`[Migration] Moved ${dedupedMigrated.length} legacy cache entries into scrapfly_history`);
                                shouldRemoveLegacy = true;
                            } catch (e) {
                                Logger.warn('STORAGE', '[Migration] Failed to write merged history - keeping scrapfly_detection_storage for safety');
                                shouldRemoveLegacy = false;
                            }
                        }
                    }

                    if (shouldRemoveLegacy) {
                        await chrome.storage.local.remove(['scrapfly_detection_storage']);
                    }
                }
            } else {
                Logger.warn('STORAGE', '[Migration] Found scrapfly_detection_storage but could not parse it - leaving as-is');
            }
        }

        // Remove unused legacy keys
        const removeKeys = [];
        if (Object.prototype.hasOwnProperty.call(result, 'scrapfly_detection_state')) {
            removeKeys.push('scrapfly_detection_state');
        }
        if (Object.prototype.hasOwnProperty.call(result, 'scrapfly_log_collector_enabled')) {
            removeKeys.push('scrapfly_log_collector_enabled');
        }
        if (Object.prototype.hasOwnProperty.call(result, 'scrapfly_log_collector_max')) {
            removeKeys.push('scrapfly_log_collector_max');
        }
        if (removeKeys.length > 0) {
            await chrome.storage.local.remove(removeKeys);
        }
    } catch (error) {
        Logger.warn('STORAGE', '[Migration] Failed to migrate legacy storage keys:', error);
    }
}

async function ensureDetectorManagerInitialized() {
    if (!detectorManager || !detectorManager.initialized) {
        if (!categoryManager) {
            categoryManager = new CategoryManager();
        }
        if (!detectorManager) {
            detectorManager = new DetectorManager(categoryManager);
        }
        if (!detectorManager.initialized) {
            await detectorManager.initialize();
        }
    }
    return detectorManager;
}

/**
 * Wait for detectors to be fully loaded with progress updates
 * @param {number} maxWaitMs - Maximum time to wait (default 10000ms)
 * @returns {Promise<boolean>} True if loaded, false if timeout
 */
async function waitForDetectorsLoaded(maxWaitMs = 10000) {
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms

    while (Date.now() - startTime < maxWaitMs) {
        // Check if detector manager is initialized AND has detectors
        if (detectorManager?.initialized) {
            const count = detectorManager.getDetectorCount();
            if (count > 0) {
                return true;
            }
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // Timeout reached
    Logger.error('BACKGROUND', `[waitForDetectorsLoaded] Timeout after ${Date.now() - startTime}ms`);
    return false;
}





/**
 * Capture HTTP headers for all requests
 * OPTIMIZED 3.3: TTL-based auto-cleanup (headers expire after 5 min)
 */
function setupHeaderCapture() {
    // Listen for response headers
    chrome.webRequest.onHeadersReceived.addListener(
        async (details) => {
            // Skip if extension is disabled
            if (!await isExtensionEnabled()) {
                return;
            }

            // Skip header capture if tab has cache hit
            if (tabsUsingCache.has(details.tabId)) {
                return; // Skip all header capture for cached tabs
            }

            // Only capture headers for main frame requests
            if (details.type === 'main_frame' && details.responseHeaders) {
                const headers = {};
                const responseCookies = [];

                // Convert headers array to object for easier access
                // Also extract Set-Cookie headers for response cookie detection
                details.responseHeaders.forEach(header => {
                    const headerName = header.name.toLowerCase();
                    headers[headerName] = header.value;

                    // Parse Set-Cookie headers for response cookies
                    if (headerName === 'set-cookie') {
                        const cookieParts = header.value.split(';')[0].split('=');
                        if (cookieParts.length >= 2) {
                            responseCookies.push({
                                name: cookieParts[0].trim(),
                                value: cookieParts.slice(1).join('=').trim()
                            });
                        }
                    }
                });

                // OPTIMIZED 3.3: TTL auto-cleanup - no manual cleanup needed
                headersStore.set(details.tabId, {
                    url: details.url,
                    headers: headers,
                    timestamp: Date.now()
                });

                // Store response cookies if any were found
                if (responseCookies.length > 0) {
                    responseCookiesStore.set(details.tabId, {
                        url: details.url,
                        cookies: responseCookies,
                        timestamp: Date.now()
                    });
                }
            }
        },
        { urls: ["<all_urls>"] },
        ["responseHeaders"]
    );

    // Listen for request headers
    chrome.webRequest.onBeforeSendHeaders.addListener(
        async (details) => {
            // Skip if extension is disabled
            if (!await isExtensionEnabled()) {
                return;
            }

            // Skip header capture if tab has cache hit
            if (tabsUsingCache.has(details.tabId)) {
                return; // Skip all header capture for cached tabs
            }

            // Only capture headers for main frame requests
            if (details.type === 'main_frame' && details.requestHeaders) {
                const headers = {};

                // Convert headers array to object for easier access
                details.requestHeaders.forEach(header => {
                    headers[header.name.toLowerCase()] = header.value;
                });

                // Store request headers
                requestHeadersStore.set(details.tabId, {
                    url: details.url,
                    headers: headers,
                    timestamp: Date.now()
                });
            }
        },
        { urls: ["<all_urls>"] },
        ["requestHeaders"]
    );

    // Listen for request payloads (POST/PUT/PATCH/DELETE bodies)
    chrome.webRequest.onBeforeRequest.addListener(
        async (details) => {
            // Skip if extension is disabled
            if (!await isExtensionEnabled()) {
                return;
            }

            // Skip payload capture if tab has cache hit
            if (tabsUsingCache.has(details.tabId)) {
                return; // Skip all payload capture for cached tabs
            }

            // Capture ALL payloads immediately, regardless of detection state
            // Detection will check payloadStore later when it runs

            // Capture ALL requests with bodies (not just main_frame)
            if (details.requestBody) {
                const method = details.method || 'GET';

                // Only store payloads for methods that typically have bodies
                if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
                    let payloadData = null;
                    let payloadType = 'unknown';

                    // Check if we have form data
                    if (details.requestBody.formData) {
                        payloadData = details.requestBody.formData;
                        payloadType = 'formData';
                    }
                    // Check if we have raw data
                    else if (details.requestBody.raw && details.requestBody.raw.length > 0) {
                        // Combine all raw chunks
                        const rawData = details.requestBody.raw.map(item => {
                            if (item.bytes) {
                                // Convert ArrayBuffer to string
                                try {
                                    const decoder = new TextDecoder('utf-8');
                                    return decoder.decode(item.bytes);
                                } catch (e) {
                                    // If decoding fails, store as base64
                                    return btoa(String.fromCharCode(...new Uint8Array(item.bytes)));
                                }
                            }
                            return '';
                        }).join('');

                        payloadData = rawData;
                        payloadType = 'raw';
                    }

                    // Store payload if we found data - store ALL payloads in an array
                    if (payloadData) {
                        // Get existing payloads array or create new one
                        let payloads = payloadStore.get(details.tabId) || [];

                        // Add new payload to array
                        payloads.push({
                            url: details.url,
                            method: method,
                            payload: payloadData,
                            type: payloadType,
                            timestamp: Date.now()
                        });

                        // Store the updated array (keep max 50 payloads to prevent memory issues)
                        if (payloads.length > 50) {
                            payloads.shift(); // Remove oldest if too many
                        }

                        payloadStore.set(details.tabId, payloads);
                    }
                }
            }
        },
        { urls: ["<all_urls>"] },
        ["requestBody"]
    );

    // Capture ALL network request URLs for URL pattern detection
    // This allows detecting anti-bot systems that use specific URL patterns (e.g., Akamai /akam/, /sbsd/)
    // URLs are captured during the ENTIRE page lifecycle (not just during active detection)
    // because many anti-bot scripts load asynchronously 1-5+ seconds after initial page load
    chrome.webRequest.onBeforeRequest.addListener(
        async (details) => {
            // Skip if extension is disabled
            if (!await isExtensionEnabled()) {
                return;
            }

            // Skip if cache hit
            if (tabsUsingCache.has(details.tabId)) return;

            // Skip invalid tab IDs
            if (details.tabId < 0) return;

            // Capture ALL request URLs (GET, POST, XHR, script, etc.)
            let networkUrls = networkUrlsStore.get(details.tabId) || [];

            networkUrls.push({
                url: details.url,
                type: details.type,        // 'main_frame', 'sub_frame', 'script', 'xhr', 'fetch', etc.
                method: details.method,     // 'GET', 'POST', etc.
                timestamp: Date.now()
            });

            // Keep max 200 URLs per tab to prevent memory issues
            if (networkUrls.length > 200) {
                networkUrls.shift(); // Remove oldest
            }

            networkUrlsStore.set(details.tabId, networkUrls);
        },
        { urls: ["<all_urls>"] }
        // No extraInfoSpec needed - we only need URL, type, method
    );
}

async function getCurrentTabDetectionData() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            return await DetectionEngineManager.getDetectionData(tab.id);
        }
    } catch (error) {
        Logger.error('BACKGROUND', 'Scrapfly Background: Error getting current tab:', error);
    }
    return null;
}


function initializeServices() {
    Logger.background('Scrapfly Background: Initializing services...');

    // Setup all listeners and services
    setupHeaderCapture();
    setupMessageListeners();
    setupTabListeners();

    Logger.background('Scrapfly Background: Services initialization complete');
}
