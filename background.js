/**
 * Background script for Scrapfly Security Detection Extension
 * Handles message passing, header capture, and data storage
 */

// Import scripts for service worker
importScripts(
    './modules/logger.js',
    './utils/debug.js',
    './utils/log-collector.js',
    './utils/utils.js',
    './modules/storage-manager.js', // OPTIMIZATION Phase 1: Shared storage patterns
    './modules/category-manager.js',
    './modules/detector-manager.js',
    './modules/confidence-manager.js',
    './modules/detection-engine-manager.js',
    './modules/notification-manager.js',
    './sections/history/history.js',
    './sections/settings/settings.js',
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
    './sections/advanced/modules/funcaptcha/funcaptcha-interceptor.js'
    // Note: SessionManager and DetectionSession removed - using simple Map instead
);

Logger.background('✅ Logger initialized in BACKGROUND context');


// Comprehensive logging to diagnose inconsistent hook detection
const DEBUG_HOOK_DETECTION = {
    enabled: true, // Set to false to disable all debug logs
    runNumber: 0, // Increments on each detection
    currentRun: null, // Current detection run data
    previousRun: null, // Previous detection run for comparison

    startRun(tabId, url) {
        if (!this.enabled) return;

        this.runNumber++;
        this.previousRun = this.currentRun;
        this.currentRun = {
            runNumber: this.runNumber,
            tabId,
            url,
            startTime: Date.now(),
            hooksFired: new Map(), // "detectorId:target" -> {timestamp, detector, type, target} (same key format as content dedup)
            inlineHooksFired: new Set(),
            dynamicHooksFired: new Set(),
            timings: {
                contentScriptStart: null,
                orchestratorStart: null,
                detectorsLoaded: null,
                eventDispatched: null,
                inlineHooksReady: null,
                dynamicHooksReady: null,
                firstHookFired: null,
                lastHookFired: null,
                completionSignal: null
            },
            stats: {
                totalHooksInstalled: 0,
                inlineHooksInstalled: 0,
                dynamicHooksInstalled: 0,
                totalHooksFired: 0,
                missedHooks: []
            }
        };
    },

    logTiming(event, value = null) {
        if (!this.enabled || !this.currentRun) return;

        const elapsed = Date.now() - this.currentRun.startTime;
        this.currentRun.timings[event] = elapsed;
    },

    logHookFired(detectorId, target, detectorName, isInline) {
        if (!this.enabled || !this.currentRun) return;

        const elapsed = Date.now() - this.currentRun.startTime;
        // Use same key format as content script dedup: "detectorId:target"
        const key = `${detectorId}:${target}`;

        if (!this.currentRun.hooksFired.has(key)) {
            this.currentRun.hooksFired.set(key, {
                timestamp: elapsed,
                detector: detectorName,
                detectorId: detectorId,
                target: target,
                type: isInline ? 'inline' : 'dynamic'
            });

            if (isInline) {
                this.currentRun.inlineHooksFired.add(key);
            } else {
                this.currentRun.dynamicHooksFired.add(key);
            }

            if (!this.currentRun.timings.firstHookFired) {
                this.currentRun.timings.firstHookFired = elapsed;
            }
            this.currentRun.timings.lastHookFired = elapsed;
        }
    },

    logCompletion(totalInstalled, inlineCount, dynamicCount) {
        if (!this.enabled || !this.currentRun) return;

        const elapsed = Date.now() - this.currentRun.startTime;
        this.currentRun.timings.completionSignal = elapsed;
        this.currentRun.stats.totalHooksInstalled = totalInstalled;
        this.currentRun.stats.inlineHooksInstalled = inlineCount;
        this.currentRun.stats.dynamicHooksInstalled = dynamicCount;
        this.currentRun.stats.totalHooksFired = this.currentRun.hooksFired.size;
    }
};

// OPTIMIZATION 4.1: Batched storage writer to reduce I/O overhead
class BatchedStorageWriter {
    constructor(batchWindow = 100) {
        this.batchWindow = batchWindow; // milliseconds
        this.pendingWrites = new Map(); // key -> value
        this.writeTimeout = null;
    }

    /**
     * Schedule a write operation (batched)
     * @param {string} key - Storage key
     * @param {any} value - Value to write
     */
    write(key, value) {
        this.pendingWrites.set(key, value);

        // Schedule flush if not already scheduled
        if (!this.writeTimeout) {
            this.writeTimeout = setTimeout(() => this.flush(), this.batchWindow);
        }
    }

    /**
     * Flush all pending writes to storage
     */
    async flush() {
        if (this.pendingWrites.size === 0) return;

        // Get all pending writes
        const writes = Object.fromEntries(this.pendingWrites);
        this.pendingWrites.clear();
        this.writeTimeout = null;

        // Write to storage in one operation
        try {
            await chrome.storage.local.set(writes);
        } catch (error) {
            console.error('[BatchedStorage] Failed to flush writes:', error);
        }
    }

    /**
     * Force immediate flush (for critical writes)
     */
    async forceFlush() {
        if (this.writeTimeout) {
            clearTimeout(this.writeTimeout);
            this.writeTimeout = null;
        }
        await this.flush();
    }
}

// OPTIMIZED 3.3: Lazy Map with TTL cleanup
// OPTIMIZATION Phase 9A.1: Added maxSize limit with LRU eviction
class TTLMap extends Map {
    constructor(ttlMs = 300000, maxSize = 500) { // 5 min default, 500 entries max
        super();
        this.ttlMs = ttlMs;
        this.maxSize = maxSize;
        this.timers = new Map();
        this.accessOrder = []; // Track insertion order for LRU eviction
    }

    set(key, value) {
        // OPTIMIZATION Phase 9A.1 FIX: Check size AFTER removing old entry (prevents race condition)
        if (this.has(key)) {
            // Updating existing key - remove from accessOrder first
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
// OPTIMIZED 3.3: Use TTL-based auto-cleanup (5 min expiry)
const headersStore = new TTLMap(300000); // Response headers
const requestHeadersStore = new TTLMap(300000); // Request headers
const responseCookiesStore = new TTLMap(300000); // Response cookies (from Set-Cookie)
const payloadStore = new TTLMap(300000); // Request payloads (POST/PUT/PATCH bodies)
const networkUrlsStore = new TTLMap(300000); // All network request URLs (for URL pattern detection)

// OPTIMIZATION Phase B.3: Convert capture state maps to TTLMap to prevent memory leaks
// 30 min TTL matches Advanced history expiration, 100 max entries prevents unbounded growth
const reCaptchaCaptureState = new TTLMap(1800000, 100); // 30 min, max 100 captures
const akamaiCaptureState = new TTLMap(1800000, 100); // 30 min, max 100 captures
const impervaCaptureState = new TTLMap(1800000, 100); // 30 min, max 100 captures
const funcaptchaCaptureState = new TTLMap(1800000, 100); // 30 min, max 100 captures

// OPTIMIZED 3.1: Interceptors initialized lazily on first message (not here)

// OPTIMIZATION 4.1: Batched storage writer (100ms batch window)
const batchedStorage = new BatchedStorageWriter(100);

// Initialize managers on extension startup
let detectorManager = null;
let categoryManager = null;
let detectionEngine = null;

// Initialization guard to prevent concurrent initializations (race condition fix)
let initializationInProgress = false;
let initializationPromise = null;

// OPTIMIZATION Phase B.3: Convert tracking maps to TTLMap to prevent memory leaks
// Track recent detection requests to prevent duplicates (5 min TTL, max 200 entries)
const recentDetectionRequests = new TTLMap(300000, 200); // 5 min, prevents spam

// Track active detections (10 min TTL, max 50 entries - tabs currently running detection with ⏳ badge)
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

// OPTIMIZED 3.2: TTL-based detection state tracking (5 min auto-cleanup)
// OPTIMIZATION Phase 9A.8: Add max 50 concurrent detections limit
const detectionStates = new TTLMap(300000, 50); // tabId -> {url, hooksData: [], mainData: [], hooksComplete: false, mainComplete: false}

// Track tabs that have cache hits to skip unnecessary capture work (payload, headers, etc)
const tabsUsingCache = new Set();

// CRITICAL FIX: Track tabs where cache was recently cleared to prevent zombie data
const recentlyClearedTabs = new Set();

// OPTIMIZATION Phase 10.5: Debounce finalization checks to prevent redundant work
const finalizationDebounce = new Map(); // tabId -> timeout

// FIX: Track when batches are actively processing to prevent race conditions
// Prevents finalization from running while hooksData is being written
const batchProcessingFlags = new Map(); // tabId -> boolean

/**
 * Helper functions for detection state management
 */

/**
 * OPTIMIZATION Phase 10.2: Generate unique key for match deduplication
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

        // Mark old state as interrupted
        existingState.interrupted = true;
        existingState.error = 'url_changed';

        // Clear old state
        detectionStates.delete(tabId);
    }

    if (!detectionStates.has(tabId)) {
        detectionStates.set(tabId, {
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
            lastHookBatchTime: 0, // OPTIMIZATION: Track when last hook batch arrived for deterministic finalization
            startTime: Date.now()
        });
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
        //
        // const methodPercent = Math.round((1 / totalMethods) * 100);
        // const totalPercent = Math.round((completedMethods.size / totalMethods) * 100);
        // const badgeText = `${totalPercent}%`;
        // chrome.action.setBadgeText({ text: badgeText, tabId: tabId });

        const message = `Checked ${methodName}`;

        // DON'T update badge - only send progress to popup for UI purposes
        // Badge will be updated to final count in finalizeDetection()

        // Send granular progress message to popup (for step highlighting, not badge)
        chrome.runtime.sendMessage({
            type: 'DETECTION_PROGRESS',
            tabId: tabId,
            progress: {
                method: methodName,
                completedMethods: Array.from(completedMethods),
                message: message
            }
        }).catch(() => {
            // Silently fail - popup might not be open
        });
    } catch (e) {
        console.error('[Progress] Error sending update:', e);
    }
}

/**
 * Mark a detection method as complete and send progress update
 */
function markMethodComplete(tabId, methodName) {
    const state = detectionStates.get(tabId);
    if (!state) {
        console.warn(`[markMethodComplete] ❌ No detection state for tab ${tabId}, cannot mark ${methodName} complete`);
        return;
    }

    // VALIDATION: Only allow valid method names from the official methodOrder
    const validMethods = state.methodOrder || ['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload'];
    if (!validMethods.includes(methodName)) {
        console.warn(`[markMethodComplete] ⚠️ Rejecting invalid method name: "${methodName}" (valid methods: ${validMethods.join(', ')})`);
        return;
    }

    state.completedMethods.add(methodName);
    sendProgressUpdate(tabId, methodName, state.completedMethods);
}

function checkAndFinalizeDetection(tabId) {
    const state = detectionStates.get(tabId);
    if (!state) {
        console.warn(`[⏸️ Finalize Check] No state for tab ${tabId}, aborting`);
        return;
    }

    // SAFETY CHECK: Don't finalize if state was just created (within 500ms)
    // This prevents race conditions where navigation events trigger premature finalization
    if (state.startTime && (Date.now() - state.startTime < 500)) {
        return;
    }

    // FIX: Check if batches are actively processing - if so, defer finalization check
    const batchActive = batchProcessingFlags.get(tabId) === true;
    if (batchActive) {
        // Don't schedule anything, batch completion will trigger checkAndFinalizeDetection
        return;
    }

    // OPTIMIZATION MEDIUM-TERM #2: Debounce finalization checks (250ms window)
    // Prevents redundant work when multiple completion signals arrive rapidly
    // Increased from 10ms to 100ms to reduce timer spam and CPU overhead
    // FIX: Increased from 250ms to 600ms to allow window properties (200ms polling) and JS hooks more time
    // 600ms = 3 polling cycles for window properties, gives hooks time to fire on initial page scripts
    if (finalizationDebounce.has(tabId)) {
        clearTimeout(finalizationDebounce.get(tabId));
    }

    const timeout = setTimeout(() => {
        // Re-check state in case it was deleted during debounce
        const currentState = detectionStates.get(tabId);
        if (!currentState) {
            console.warn(`[🔍 Finalize Execute] No state found for tab ${tabId} after debounce, aborting`);
            finalizationDebounce.delete(tabId);
            return;
        }

        const completedMethods = Array.from(currentState.completedMethods || []);
        const completedCount = completedMethods.length;
        const totalMethods = 7;
        const methodOrder = ['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload'];
        const missingMethods = methodOrder.filter(m => !currentState.completedMethods.has(m));

        // FIX: Double-check batch processing isn't active
        if (batchProcessingFlags.get(tabId) === true) {
            finalizationDebounce.delete(tabId);
            return;
        }

        // OPTIMIZATION: Check if hook batches are still arriving
        // Wait 100ms after LAST batch arrival to ensure all batches process
        // Reduced from 2000ms - hooks batch every 10-50ms, so 100ms is sufficient
        const timeSinceLastBatch = Date.now() - (currentState.lastHookBatchTime || 0);
        const BATCH_SETTLE_TIME = 100; // FIX: Reduced from 2000ms to 100ms for faster finalization

        if (currentState.lastHookBatchTime > 0 && timeSinceLastBatch < BATCH_SETTLE_TIME) {
            const remainingMs = BATCH_SETTLE_TIME - timeSinceLastBatch;
            // Reschedule check - don't clear, just set new one
            const newTimeout = setTimeout(() => checkAndFinalizeDetection(tabId), remainingMs);
            finalizationDebounce.set(tabId, newTimeout);
            return;
        }

        // PHASE 1 FIX: More lenient finalization requirements
        // Instead of waiting for all 7 methods, finalize when we have the main methods (5)
        // This prevents getting stuck waiting for jsHooks and windowProperties signals
        const REQUIRED_METHODS = 5; // Reduced from 7 to exclude jsHooks and windowProperties
        const mainMethodsComplete = ['cookies', 'headers', 'url', 'dom', 'payload'].every(m => currentState.completedMethods.has(m));

        // Check if we should finalize
        const shouldFinalize =
            // Option 1: All 7 methods complete (ideal case)
            completedCount >= totalMethods ||
            // Option 2: Main 5 methods complete (fallback for signal issues)
            (mainMethodsComplete && completedCount >= REQUIRED_METHODS) ||
            // Option 3: We have detection data and main methods are done (quick finalization)
            (mainMethodsComplete && (currentState.mainData?.length > 0 || currentState.hooksData?.size > 0));

        if (shouldFinalize) {
            // Send final update - use actual completed count for accurate badge
            sendProgressUpdate(tabId, 'complete', currentState.completedMethods || new Set(), totalMethods);
            finalizeDetection(tabId, currentState);
        } else {
            // Check if this detection is using cached data
            if (currentState.usedCache) {
                // Mark as finalized to prevent retry logic from firing
                currentState.finalized = true;

                finalizationDebounce.delete(tabId);
                return;
            }

            // Only show warnings if debug mode is enabled
            (async () => {
                try {
                    const settings = await Utils.getSettings(chrome);
                    if (settings?.debugMode) {
                        const percent = Math.round((completedCount / totalMethods) * 100);
                        console.warn(`%c[⏳ NOT READY] Only ${completedCount}/${totalMethods} methods complete (${percent}%) - waiting for main methods`, 'color: #f44336; font-weight: bold;');
                        console.warn(`[⏳ NOT READY]   Completed: ${completedMethods.join(', ')}`);
                        console.warn(`[⏳ NOT READY]   Missing: ${missingMethods.join(', ')}`);
                        console.warn(`[⏳ NOT READY]   Main methods complete: ${mainMethodsComplete}`);

                        // Log which signals we're waiting for
                        if (!currentState.windowPropertiesComplete) {
                            console.warn(`%c[⏳ WAITING FOR] ⚠️ windowProperties signal (WINDOW_PROPS_COMPLETE) - will proceed without it`, 'color: #ff9800; font-weight: bold;');
                        }
                        if (!currentState.mainComplete) {
                            console.warn(`[⏳ WAITING FOR] ❌ mainComplete signal (processDetectionData finished) - REQUIRED`);
                        }
                        if (!currentState.hooksComplete) {
                            console.warn(`[⏳ WAITING FOR] ⚠️ hooksComplete signal (JS_HOOKS_COMPLETE) - will proceed without it`, 'color: #ff9800; font-weight: bold;');
                        }
                    }
                } catch (error) {
                    // Failed to get settings, skip logging
                }
            })();
        }

        finalizationDebounce.delete(tabId);
    }, 600); // FIX: Increased from 250ms to 600ms to allow window properties polling (200ms * 3 cycles) and JS hooks time to complete

    finalizationDebounce.set(tabId, timeout);
}

async function finalizeDetection(tabId, state) {
    // FIX: Mark this tab as finalized to prevent progress updates from overriding the final badge
    state.finalized = true;

    // Safety check: Don't finalize if detection was interrupted
    if (state.interrupted || interruptedDetections.has(tabId)) {
        return;
    }

    // SAFETY CHECK: Don't finalize if ALL data is empty AND no methods completed
    // This catches race conditions where finalization is triggered before any detection runs
    // FIX: Allow finalization even with empty results if methods actually completed
    const hasHooksData = state.hooksData && state.hooksData.size > 0;
    const hasMainData = state.mainData && state.mainData.length > 0;
    const hasCompletedMethods = state.completedMethods && state.completedMethods.size > 0;

    if (!hasHooksData && !hasMainData && !hasCompletedMethods) {
        return; // Don't finalize with empty data AND no completed methods
    }

    // Merge hooks and main detection
    const mergedDetections = new Map();

    // Add hooks data
    for (const [detectorId, detector] of state.hooksData.entries()) {
        mergedDetections.set(detectorId, detector);
    }

    // Add main detection data (merge if detector already exists from hooks)
    for (const detector of state.mainData) {
        const detectorId = detector.detector?.id || detector.id;
        if (mergedDetections.has(detectorId)) {
            // Merge: combine matches and detection methods
            const existing = mergedDetections.get(detectorId);
            existing.matches = [...existing.matches, ...(detector.matches || [])];

            // Safely merge detectionMethods arrays
            const existingMethods = existing.detectionMethods || [];
            const newMethods = detector.detectionMethods || [];
            existing.detectionMethods = [...new Set([...existingMethods, ...newMethods])];
        } else {
            // Ensure detector has detectionMethods array
            if (!detector.detectionMethods) {
                detector.detectionMethods = [];
            }
            mergedDetections.set(detectorId, detector);
        }
    }

    const finalResults = Array.from(mergedDetections.values());

    // Store to cache
    const pageData = {
        url: state.url,
        hostname: Utils.getHostnameFromUrl(state.url),
        favicon: Utils.getFaviconUrl(state.url)
    };

    const storedDataWithExpiry = await DetectionEngineManager.storeDetection(state.url, pageData, finalResults);

    // Update state with expiry info for immediate popup queries
    if (storedDataWithExpiry) {
        state.expiry = storedDataWithExpiry.expiry;
        state.timestamp = storedDataWithExpiry.timestamp;
        state.favicon = storedDataWithExpiry.favicon;
    }

    // Update badge with appropriate color
    const detectionCount = finalResults.length;
    if (detectionCount > 0) {
        // Check if URL is blacklisted before setting badge
        const isBlacklisted = await Utils.isUrlBlacklisted(state.url);

        if (!isBlacklisted) {
            // Load badge colors from CategoryManager
            const badgeColors = await CategoryManager.getBadgeColors(categoryManager);

            const count = detectionCount.toString();
            const color = detectionCount >= 5 ? badgeColors.high :
                         detectionCount >= 3 ? badgeColors.medium :
                         badgeColors.low;

            // CHANGED: Make badge update synchronous to ensure it completes before popup checks
            try {
                await chrome.action.setBadgeText({ text: count, tabId: tabId });
                await chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId });
            } catch (error) {
                // Expected: Tab might be closed
                console.error(`[Finalize] Failed to update badge for tab ${tabId}:`, error.message);
            }
        } else {
            // Clear badge if blacklisted
            try {
                await chrome.action.setBadgeText({ text: '', tabId: tabId });
            } catch (error) {
                console.error(`[Finalize] Failed to clear badge (blacklisted):`, error.message);
            }
        }
    } else {
        // Clear badge if no detections
        try {
            await chrome.action.setBadgeText({ text: '', tabId: tabId });
        } catch (error) {
            console.error(`[Finalize] Failed to clear badge (no detections):`, error.message);
        }
    }

    // Notify popup
    chrome.runtime.sendMessage({
        type: 'NEW_DETECTION_DATA',
        tabId: tabId,
        url: state.url,
        detectionResults: finalResults
    }).catch(() => {
        // Expected: Popup may not be open
    });

    // FIX: Save merged results to history (includes both main detections AND hooks/fingerprints)
    // This ensures fingerprints detected via JS hooks are also saved to history
    if (finalResults.length > 0) {
        try {
            const pageData = {
                url: state.url,
                hostname: Utils.getHostnameFromUrl(state.url),
                tabTitle: state.tabTitle,
                favicon: Utils.getFaviconUrl(state.url)
            };

            const historySettings = await Utils.getHistorySettings();
            const shouldSave = await History.shouldSaveToHistory(state.url, historySettings, chrome);

            if (shouldSave) {
                await History.saveDetectionToHistory(tabId, pageData, finalResults, chrome);
            }
        } catch (error) {
            console.error('[Finalize] Error saving to history:', error);
        }
    }

    // Remove from active detections (detection completed successfully)
    if (activeDetections.has(tabId)) {
        activeDetections.delete(tabId);
    }

    // Also remove from interrupted detections if it was marked (user came back to tab)
    if (interruptedDetections.has(tabId)) {
        interruptedDetections.delete(tabId);
    }

    // OPTIMIZED 3.2: State is auto-cleaned by TTL, but we can delete eagerly
    detectionStates.delete(tabId);

    // Clean up payloads after detection completes (they were stored for this detection)
    if (payloadStore.has(tabId)) {
        payloadStore.delete(tabId);
    }

    // Clean up network URLs after detection completes
    if (networkUrlsStore.has(tabId)) {
        networkUrlsStore.delete(tabId);
    }

    // Clean up headers after detection completes (free up memory like payloads)
    if (headersStore.has(tabId)) {
        headersStore.delete(tabId);
    }

    if (requestHeadersStore.has(tabId)) {
        requestHeadersStore.delete(tabId);
    }

    // Clean up cookies after detection completes
    if (responseCookiesStore.has(tabId)) {
        responseCookiesStore.delete(tabId);
    }

    // NOTE: We don't clear tabsUsingCache here anymore!
    // The flag persists across F5 refreshes to prevent race condition where
    // webRequest fires before CHECK_CACHE_EARLY completes.
    // The flag is only cleared when URL actually changes (see chrome.tabs.onUpdated handler)
}

/**
 * Unified initialization method
 * Called on extension install, update, and browser startup
 * @param {string} reason - Reason for initialization ('install', 'update', 'startup')
 * @param {string} previousVersion - Previous version if update
 */
async function initialize(reason = 'startup', previousVersion = null) {
    // RACE CONDITION FIX: Prevent concurrent initializations
    // During extension updates, both onInstalled and IIFE can fire simultaneously
    if (initializationInProgress && initializationPromise) {
        const result = await initializationPromise;
        return result;
    }

    // Set guard flag and create promise for this initialization
    initializationInProgress = true;

    // Create the initialization promise
    initializationPromise = (async () => {
        try {

        // Create CategoryManager and DetectorManager instances
        categoryManager = new CategoryManager();
        detectorManager = new DetectorManager(categoryManager);

        // Initialize the detector manager (loads from storage or JSON files)
        const initStartTime = Date.now();
        await detectorManager.initialize();
        const initDuration = Date.now() - initStartTime;

        // Storage health check - verify detectors were loaded correctly
        let detectorCount = detectorManager.getDetectorCount();
        let hasDetectors = detectorCount > 0;

        // BUGFIX: Add retry logic if detectors haven't loaded yet (timing issue)
        // This handles cases where service worker starts before JSON files are fully loaded
        if (!hasDetectors) {
            const maxRetries = 10; // 10 retries * 500ms = 5 seconds max wait
            let retries = maxRetries;

            while (retries > 0 && !hasDetectors) {
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
                detectorCount = detectorManager.getDetectorCount();
                hasDetectors = detectorCount > 0;

                if (hasDetectors) {
                    break;
                }

                retries--;
            }
        }

        if (!hasDetectors) {
            console.error('❌ CRITICAL: Detector system initialized but no detectors were loaded!');
            console.error('❌ This will cause content scripts to fail. Possible causes:');
            console.error('   1. Storage is empty or corrupted');
            console.error('   2. JSON files are missing or have errors');
            console.error('   3. File paths changed but extension not reloaded');
            console.error('❌ RECOMMENDATION: Remove and re-add the extension, then refresh all tabs');
        }

        // Check if extension is enabled/disabled and set badges accordingly
        const result = await chrome.storage.local.get(['scrapfly_enabled']);
        const isEnabled = result.scrapfly_enabled !== false; // Default to true
        const tabs = await chrome.tabs.query({});

        if (!isEnabled) {
            // Extension is disabled - set X badge with amber color for all tabs
            for (const tab of tabs) {
                chrome.action.setBadgeText({ text: '✕', tabId: tab.id }).catch(() => {});
                chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId: tab.id }).catch(() => {});
            }
        } else {
            // Extension is enabled - clear any leftover badges
            for (const tab of tabs) {
                chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch(() => {});
            }
        }

        // Initialize all services (listeners, interceptors, etc.)
        initializeServices();

        // Clear guard flag on success
        initializationInProgress = false;
        return true;
        } catch (error) {
            console.error('Background: Failed to initialize detector system:', error);
            console.error('Background: Error stack:', error.stack);

            // Clear guard flag on error
            initializationInProgress = false;
            return false;
        } finally {
            // Clear promise reference when done (success or failure)
            initializationPromise = null;
        }
    })();

    // Await and return the result
    return await initializationPromise;
}

// Listen for extension installation or update
chrome.runtime.onInstalled.addListener(async (details) => {
    // Clear all detection states on extension reload/update to prevent stale data
    detectionStates.clear();

    if (details.reason === 'install' || details.reason === 'update') {
        await initialize(details.reason, details.previousVersion);
    }
});

// Initialize on browser startup (when browser starts with extension already installed)
chrome.runtime.onStartup.addListener(async () => {
    await initialize('startup');
});

// Also initialize immediately when service worker starts/restarts
// This handles the case where the service worker is awakened from idle
(async () => {
    // Check if we need to initialize (service worker may have been restarted)
    if (!detectorManager || !detectorManager.initialized) {
        await initialize('startup');
    }
})();

/**
 * Ensure DetectorManager is initialized (lazy initialization)
 * Service workers can be terminated and restarted, losing in-memory state
 */
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
    console.error(`[waitForDetectorsLoaded] Timeout after ${Date.now() - startTime}ms`);
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
            const result = await chrome.storage.local.get(['scrapfly_enabled']);
            if (result.scrapfly_enabled === false) {
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
            const result = await chrome.storage.local.get(['scrapfly_enabled']);
            if (result.scrapfly_enabled === false) {
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
            const result = await chrome.storage.local.get(['scrapfly_enabled']);
            if (result.scrapfly_enabled === false) {
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
            const result = await chrome.storage.local.get(['scrapfly_enabled']);
            if (result.scrapfly_enabled === false) {
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

/**
 * Enrich page data with tab information
 * @param {object} pageData - Page data from content script
 * @param {object} tab - Tab object from sender
 * @returns {object} Enriched page data
 */
function enrichPageDataWithTabInfo(pageData, tab) {
    return {
        ...pageData,
        tabId: tab.id,
        tabUrl: tab.url,
        tabTitle: tab.title,
        favicon: tab.favIconUrl
    };
}

/**
 * Process detection data from content script
 * @param {object} message - Message from content script
 * @param {object} sender - Sender information
 */
async function processDetectionData(message, sender) {
    if (!sender.tab || !sender.tab.id) {
        console.error('Scrapfly Background: No tab information in sender');
        return;
    }

    // Check if extension is enabled
    try {
        const result = await chrome.storage.local.get(['scrapfly_enabled']);
        if (result.scrapfly_enabled === false) {
            return;
        }
    } catch (error) {
        console.error('Failed to check enabled state:', error);
    }

    const tabId = sender.tab.id;
    const pageData = enrichPageDataWithTabInfo(message.data, sender.tab);

    // Show progress indicator in badge and track as active detection
    try {
        chrome.action.setBadgeText({ text: '⏳', tabId: tabId }).catch(() => {});
        chrome.action.setBadgeBackgroundColor({ color: '#2196F3', tabId: tabId }).catch(() => {});

        // Create AbortController to allow cancellation if tab switch occurs
        const abortController = new AbortController();

        // Track this tab as having an active detection in progress
        activeDetections.set(tabId, {
            url: pageData.url,
            startTime: Date.now(),
            abortController: abortController
        });
    } catch (error) {
        console.error('Failed to set loading badge:', error);
    }

    // Add response headers if available (backward compatibility - keep as pageData.headers)
    if (headersStore.has(tabId)) {
        const headerData = headersStore.get(tabId);

        // Only use headers if they're from the same URL (or close enough)
        if (headerData.url.includes(pageData.hostname)) {
            pageData.headers = headerData.headers; // Response headers (backward compatibility)
            pageData.responseHeaders = headerData.headers; // Also store explicitly as responseHeaders

            // OPTIMIZED 3.3: Eager delete (TTL will clean up anyway, but we can help)
            headersStore.delete(tabId);
        }
    }

    // Add request headers if available
    if (requestHeadersStore.has(tabId)) {
        const requestHeaderData = requestHeadersStore.get(tabId);

        if (requestHeaderData.url.includes(pageData.hostname)) {
            pageData.requestHeaders = requestHeaderData.headers;

            requestHeadersStore.delete(tabId);
        }
    }

    // Add response cookies if available (from Set-Cookie headers)
    if (responseCookiesStore.has(tabId)) {
        const responseCookieData = responseCookiesStore.get(tabId);

        if (responseCookieData.url.includes(pageData.hostname)) {
            pageData.responseCookies = responseCookieData.cookies;

            responseCookiesStore.delete(tabId);
        }
    }

    // Add request payloads if available (POST/PUT/PATCH bodies)
    // Now handles ARRAY of payloads per tab
    if (payloadStore.has(tabId)) {
        const payloadsArray = payloadStore.get(tabId);

        // Pass all payloads to detection engine (no filtering)
        const relevantPayloads = [];

        for (const payloadData of payloadsArray) {
            try {
                relevantPayloads.push({
                    method: payloadData.method,
                    url: payloadData.url,
                    data: payloadData.payload,
                    type: payloadData.type
                });
            } catch (e) {
                console.error('Error processing payload:', e);
            }
        }

        // Pass all payloads for detection
        if (relevantPayloads.length > 0) {
            pageData.payloads = relevantPayloads;

            // Don't delete yet - will delete after detection completes
            // payloadStore.delete(tabId);
        }
    }

    // Add network request URLs if available (for URL pattern detection)
    if (networkUrlsStore.has(tabId)) {
        const networkUrlsArray = networkUrlsStore.get(tabId);

        // No filtering - pass all URLs to detection engine
        const relevantUrls = networkUrlsArray;

        if (relevantUrls.length > 0) {
            pageData.networkUrls = relevantUrls;
        }
    }

    // Note: Request cookies are already in pageData.cookies (from document.cookie in content script)

    // Run detection analysis immediately
    let detectionResults = [];
    try {
        // Ensure DetectorManager is initialized (handles service worker restarts)
        await ensureDetectorManagerInitialized();

        // Create detection engine if not exists
        if (!detectionEngine) {
            detectionEngine = new DetectionEngineManager();
        }
        // Set detectors from detector manager
        detectionEngine.setDetectors(detectorManager.getAllDetectors());

        // Run detection with timeout (increased to 30s to handle slower pages)
        try {
            const startTime = Date.now();

            // LOG: Show all network URLs being passed to detection
            if (pageData.networkUrls && pageData.networkUrls.length > 0) {
                console.log(`[Network URLs] ✅ Passing ${pageData.networkUrls.length} URLs to detection engine:`);
                pageData.networkUrls.forEach((urlObj, index) => {
                    console.log(`  ${index + 1}. ${urlObj.url} | Type: ${urlObj.type} | Method: ${urlObj.method}`);
                });
            } else {
                console.log(`[Network URLs] ⚠️ No network URLs available for detection!`);
            }

            const detectionPromise = Promise.resolve(detectionEngine.detectOnPage(pageData));
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Detection timeout after 30 seconds')), 30000)
            );
            detectionResults = await Promise.race([detectionPromise, timeoutPromise]);

            const elapsed = Date.now() - startTime;
            console.log(`[processDetectionData] ✅ Main detection completed in ${elapsed}ms: ${detectionResults.length} detectors found`);

            // GRANULAR PROGRESS: Send incremental updates for main detection methods
            // Mark each method complete as it finishes detection
            // FIX: Use markMethodComplete to properly track progress and trigger finalization
            console.log(`%c[processDetectionData] 📊 MARKING MAIN METHODS COMPLETE for tab ${tabId}`, 'color: #2196F3; font-weight: bold; font-size: 14px;');
            const mainMethods = ['cookies', 'headers', 'url', 'dom', 'payload'];
            for (const method of mainMethods) {
                console.log(`[processDetectionData] Marking ${method} complete...`);
                markMethodComplete(tabId, method);
            }
            console.log(`%c[processDetectionData] ✅ All main methods marked complete`, 'color: #4caf50; font-weight: bold;');

            // Log what was detected
            if (detectionResults.length > 0) {
                detectionResults.forEach(det => {
                    const methods = det.matches?.map(m => m.type).filter((v, i, a) => a.indexOf(v) === i) || [];
                    console.log(`[processDetectionData]   - ${det.detector?.name}: ${methods.join(', ')} (${det.matches?.length || 0} matches)`);
                });
            }
        } catch (error) {
            const errorType = error.message.includes('timeout') ? 'TIMEOUT' : 'ERROR';
            console.error(`[processDetectionData] ❌ Main detection ${errorType} for tab ${tabId}:`, error.message);
            console.error(`[processDetectionData] ❌ Stack:`, error.stack);
            console.error(`[processDetectionData] ⚠️ Continuing with empty results - only window props and hooks will be preserved`);
            detectionResults = []; // Continue with empty results - JS hooks and window props will still be preserved
        }

        console.log(`🎯 Scrapfly Background: Detected ${detectionResults.length} security systems via main detection`);

        // Check if detection was aborted (tab switch occurred)
        const detectionInfo = activeDetections.get(tabId);
        if (detectionInfo && detectionInfo.abortController.signal.aborted) {
            console.log(`[Detection] ⚠️ Detection for tab ${tabId} was aborted - skipping result storage`);
            return; // Don't store results or finalize
        }

        // Also check if tab is marked as interrupted
        if (interruptedDetections.has(tabId)) {
            console.log(`[Detection] ⚠️ Detection for tab ${tabId} is interrupted - skipping result storage`);
            return; // Don't store results or finalize
        }

        // Store main detection and check if ready to finalize
        console.log(`%c[processDetectionData] 🔄 Getting/Creating detection state for tab ${tabId}`, 'color: #ff9800; font-weight: bold;');
        const state = getOrCreateDetectionState(tabId, pageData.url);

        // Store tabTitle in state for use when saving to history
        if (!state.tabTitle && pageData.tabTitle) {
            state.tabTitle = pageData.tabTitle;
            console.log(`[processDetectionData] Stored tabTitle in state: "${state.tabTitle}"`);
        }

        console.log(`[processDetectionData] Current state before storing:`, {
            completedMethods: Array.from(state.completedMethods || []),
            completedCount: state.completedMethods?.size || 0,
            url: state.url,
            tabTitle: state.tabTitle
        });

        // URL validation: Ensure URL hasn't changed during detection
        if (state.url !== pageData.url) {
            console.log(`[Detection] ⚠️ URL changed during detection for tab ${tabId}: ${pageData.url} → ${state.url} - skipping result storage`);
            return; // Don't store results for the wrong URL
        }

        // Merge with existing mainData (window properties may have been added already)
        // Instead of replacing, merge detections by detectorId
        const existingDetections = new Map();
        for (const existing of state.mainData) {
            const id = existing.detector?.id || existing.id;
            if (id) existingDetections.set(id, existing);
        }

        // Add/merge main detection results
        for (const newDetection of detectionResults) {
            const id = newDetection.detector?.id || newDetection.id;
            if (id && existingDetections.has(id)) {
                // Merge: combine matches, but check for duplicates by category
                const existing = existingDetections.get(id);
                const existingMatches = existing.matches || [];
                const newMatches = newDetection.matches || [];

                // OPTIMIZATION Phase 10.2: Use Set for O(1) deduplication instead of O(n) Array.some()
                // Build lookup set from existing matches for fast duplicate detection
                const matchKeys = new Set();
                for (const match of existingMatches) {
                    matchKeys.add(generateMatchKey(match));
                }

                // Add new matches if not duplicate
                for (const newMatch of newMatches) {
                    const key = generateMatchKey(newMatch);
                    if (!matchKeys.has(key)) {
                        existingMatches.push(newMatch);
                        matchKeys.add(key);
                    }
                }

                existing.matches = existingMatches;

                // Update confidence to highest
                existing.confidence = Math.max(existing.confidence || 0, newDetection.confidence || 0);

                // Merge detectionMethods
                const existingMethods = existing.detectionMethods || [];
                const newMethods = newDetection.detectionMethods || [];
                existing.detectionMethods = [...new Set([...existingMethods, ...newMethods])];
            } else {
                // New detector, add it
                existingDetections.set(id, newDetection);
            }
        }

        // Update state.mainData with merged results
        state.mainData = Array.from(existingDetections.values());
        state.mainComplete = true;

        console.log(`[processDetectionData] ✅ Main detection complete: ${detectionResults.length} detectors`);

        // CRITICAL FIX: Update badge immediately when detection completes
        // This is the ONLY place badge should be updated to the final count
        // Fixes the "stuck at 29%" issue by setting badge to count ASAP, not via percentage
        (async () => {
            try {
                // Wait a tiny bit for hooks data to arrive (in case it's close behind)
                // But not too long - max 500ms
                let attempts = 0;
                while (state.hooksData.size === 0 && attempts < 5) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }

                // Merge hooks data + main data to get total detection count
                const mergedDetections = new Map();

                // Add hooks data
                for (const [detectorId, detector] of state.hooksData.entries()) {
                    mergedDetections.set(detectorId, detector);
                }

                // Add main detection data
                for (const detector of state.mainData) {
                    const detectorId = detector.detector?.id || detector.id;
                    if (!mergedDetections.has(detectorId)) {
                        mergedDetections.set(detectorId, detector);
                    }
                }

                const detectionCount = mergedDetections.size;

                // Get badge colors
                const badgeColors = await CategoryManager.getBadgeColors(categoryManager);

                if (detectionCount > 0) {
                    const count = detectionCount.toString();
                    const color = detectionCount >= 5 ? badgeColors.high :
                                 detectionCount >= 3 ? badgeColors.medium :
                                 badgeColors.low;

                    console.log(`%c[processDetectionData] 🔵 UPDATING BADGE TO FINAL COUNT: "${count}"`, 'color: #2196F3; font-weight: bold; font-size: 14px;');
                    console.log(`[processDetectionData] Detection count: ${detectionCount} (hooks: ${state.hooksData.size}, main: ${state.mainData.length})`);

                    await chrome.action.setBadgeText({ text: count, tabId: tabId });
                    await chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId });

                    console.log(`%c[processDetectionData] ✅ Badge set to FINAL COUNT "${count}" - NO MORE PERCENTAGE UPDATES!`, 'color: #4caf50; font-weight: bold; font-size: 14px;');
                } else {
                    console.log(`%c[processDetectionData] ℹ️ No detections found - badge will be cleared`, 'color: #ff9800; font-weight: bold;');
                    await chrome.action.setBadgeText({ text: '', tabId: tabId });
                }
            } catch (error) {
                console.error('[processDetectionData] Error updating badge:', error);
            }
        })();

        // PHASE 1 FIX: Safety timeout for completion signals
        // Wait longer (5 seconds) to give main detection time to complete
        // This prevents the badge from being stuck at percentage (e.g., 29%)
        setTimeout(async () => {
            const currentState = detectionStates.get(tabId);
            if (!currentState) {
                console.log(`[⏱️ 5s Safety Timeout] Tab ${tabId} state already cleaned up`);
                return;
            }

            if (currentState.finalized) {
                console.log(`[⏱️ 5s Safety Timeout] Tab ${tabId} already finalized, no action needed`);
                return;
            }

            // Check if main detection has completed
            const mainMethodsComplete = ['cookies', 'headers', 'url', 'dom'].every(m => currentState.completedMethods.has(m));

            if (!mainMethodsComplete) {
                console.warn(`%c[⏱️ 5s SAFETY] Main detection hasn't completed yet - waiting...`, 'color: #ff9800; font-weight: bold;');
                console.warn(`[⏱️ 5s SAFETY] Completed methods: [${Array.from(currentState.completedMethods)}]`);
                // Don't force methods if main detection is still running
                // Main detection will mark them complete when it finishes
                return;
            }

            // Only force hook/window methods if main detection is done
            let forcedMethods = [];

            if (!currentState.windowPropertiesComplete) {
                console.warn(`%c[⏱️ 5s SAFETY] Main complete, forcing windowProperties completion (signal lost)`, 'color: #ff9800; font-weight: bold;');
                markMethodComplete(tabId, 'windowProperties');
                currentState.windowPropertiesComplete = true;
                forcedMethods.push('windowProperties');
            }

            if (!currentState.hooksComplete) {
                console.warn(`%c[⏱️ 5s SAFETY] Main complete, forcing jsHooks completion (signal lost)`, 'color: #ff9800; font-weight: bold;');
                markMethodComplete(tabId, 'jsHooks');
                currentState.hooksComplete = true;
                forcedMethods.push('jsHooks');
            }

            // CRITICAL FIX: Check if detection data is ALREADY stored
            const storedData = await DetectionEngineManager.getStoredDetection(currentState.url);
            if (storedData) {
                console.log(`%c[⏱️ 5s SAFETY TIMEOUT] ✅ Detection data already stored for tab ${tabId}!`, 'color: #4caf50; font-weight: bold;');
                console.log(`[⏱️ 5s SAFETY] Found ${storedData.detectionResults?.length || 0} detectors - finalizing immediately`);

                // Finalize immediately
                await finalizeDetection(tabId, currentState);
                console.log(`%c[⏱️ 5s SAFETY] ✅ Finalization complete, badge updated to count`, 'color: #4caf50; font-weight: bold;');
                return;
            }

            // If we forced any methods, trigger finalization
            if (forcedMethods.length > 0) {
                console.warn(`%c[⏱️ 5s SAFETY TIMEOUT TRIGGERED]`, 'color: #ff9800; font-weight: bold; font-size: 14px;');
                console.warn(`[⏱️ 5s SAFETY] Forced completion of: ${forcedMethods.join(', ')}`);
                console.warn(`[⏱️ 5s SAFETY] Current state:`, {
                    windowPropertiesComplete: currentState.windowPropertiesComplete,
                    mainComplete: currentState.mainComplete,
                    hooksComplete: currentState.hooksComplete,
                    completedMethods: Array.from(currentState.completedMethods),
                    url: currentState.url
                });

                // Trigger finalization check
                checkAndFinalizeDetection(tabId);
                console.log(`%c[⏱️ 5s SAFETY] ✅ Forced finalization triggered`, 'color: #ff9800; font-weight: bold;');
            }
        }, 5000); // 5 seconds - give main detection time to complete

        // Check if all methods are done
        checkAndFinalizeDetection(tabId);

        // FIX: Removed early history save - history is now saved ONLY in finalizeDetection()
        // This prevents duplicate saves and ensures history contains complete data (including hooks)
        // Early save here would miss JS hooks which arrive later via batching
        console.log('[processDetectionData] ⏭️  Skipping early history save - will save complete data during finalization');
    } catch (error) {
        console.error('Scrapfly Background: Error running detection:', error);
    }

    console.log(`Scrapfly Background: Processed detection data for tab ${tabId}`, {
        url: pageData.url,
        cookies: pageData.cookies.length,
        content: pageData.content?.length || 0,
        externalContent: pageData.externalContent?.length || 0,
        dom: pageData.dom.length,
        headers: Object.keys(pageData.headers || {}).length,
        detections: detectionResults.length
    });

    // FIX: Don't notify popup here - wait for finalization when ALL methods complete
    // This prevents showing partial results before hooks/window properties are analyzed
    // Notification is sent in finalizeDetection() after 100% completion
    
    // Send webhook if enabled
    if (detectionResults.length > 0) {
        await Settings.sendWebhookIfEnabled(pageData, detectionResults);
    }
}



// getDetectionData has been moved to DetectionEngineManager.js as a static method
// Use DetectionEngineManager.getDetectionData(tabId) instead

/**
 * Get detection data for the current active tab
 * @returns {Promise<object|null>} Detection data or null
 */
async function getCurrentTabDetectionData() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            return await DetectionEngineManager.getDetectionData(tab.id);
        }
    } catch (error) {
        console.error('Scrapfly Background: Error getting current tab:', error);
    }
    return null;
}


/**
 * Setup message listeners
 * OPTIMIZED 3.4: Message handlers organized for better performance
 */
function setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // OPTIMIZED 3.4: Early validation to skip invalid messages quickly
        if (!request || !request.type) {
            sendResponse({ status: 'error', error: 'Invalid message' });
            return false;
        }

        // Reduced logging - comment out for less spam
        // console.log('Scrapfly Background: Received message:', request.type);

        switch (request.type) {
            case 'DEBUG_LOG':
                // Centralized logging - display all logs in service worker console
                if (request.context && request.level && request.args) {
                    const timestamp = new Date(request.timestamp).toISOString().split('T')[1].slice(0, -1);
                    const prefix = `[${timestamp}] [${request.context}]`;

                    // Parse JSON strings back to objects for better console display
                    const parsedArgs = request.args.map(arg => {
                        if (typeof arg === 'string' && (arg.startsWith('{') || arg.startsWith('['))) {
                            try {
                                return JSON.parse(arg);
                            } catch (e) {
                                return arg;
                            }
                        }
                        return arg;
                    });

                    // Use appropriate console method
                    switch (request.level) {
                        case 'log': console.log(prefix, ...parsedArgs); break;
                        case 'info': console.info(prefix, ...parsedArgs); break;
                        case 'debug': console.debug(prefix, ...parsedArgs); break;
                        case 'warn': console.warn(prefix, ...parsedArgs); break;
                        case 'error': console.error(prefix, ...parsedArgs); break;
                        case 'trace': console.trace(prefix, ...parsedArgs); break;
                        case 'group': console.group(prefix, ...parsedArgs); break;
                        case 'groupEnd': console.groupEnd(); break;
                        case 'groupCollapsed': console.groupCollapsed(prefix, ...parsedArgs); break;
                        case 'table': console.table(...parsedArgs); break;
                        case 'time': console.time(...parsedArgs); break;
                        case 'timeEnd': console.timeEnd(...parsedArgs); break;
                        default: console.log(prefix, ...parsedArgs);
                    }
                }
                break;

            case 'LOG':
                // Logger system - output logs from content scripts and main world
                if (request.log) {
                    Logger._outputToConsole(request.log);
                }
                break;

            case 'SCRAPFLY_DEBUG_LOG':
                // Debug logs from content scripts (only output when debug mode is enabled)
                (async () => {
                    try {
                        const settings = await Utils.getSettings(chrome);
                        if (settings?.debugMode) {
                            const timestamp = new Date(request.timestamp).toISOString().split('T')[1].slice(0, -1);
                            const prefix = `[${timestamp}] [${request.source || 'hooks'}]`;
                            switch (request.level) {
                                case 'log': console.log(prefix, request.message); break;
                                case 'warn': console.warn(prefix, request.message); break;
                                case 'error': console.error(prefix, request.message); break;
                                default: console.log(prefix, request.message);
                            }
                        }
                    } catch (e) {
                        // Silently fail if settings can't be read
                    }
                })();
                break;

            case 'PING':
                // Simple ping for connection test
                sendResponse({ status: 'pong', timestamp: Date.now() });
                break;

            case 'PAGE_LOAD_NOTIFICATION':
                // DEBUG TRACKER: Start new detection run
                if (sender.tab?.id && request.url) {
                    DEBUG_HOOK_DETECTION.startRun(sender.tab.id, request.url);
                }

                // FIX: Clear interrupted state on new page load (prevents false "interrupted" messages)
                if (sender.tab?.id) {
                    if (interruptedDetections.has(sender.tab.id)) {
                        console.log(`[Background] Clearing interrupted state for tab ${sender.tab.id} (new page load)`);
                        interruptedDetections.delete(sender.tab.id);
                    }
                }

                // Delegate to DetectionEngineManager handler
                (async () => {
                    // Ensure detector manager is initialized before processing
                    await ensureDetectorManagerInitialized();

                    await DetectionEngineManager.handlePageLoadNotification(request, sender, {
                        chrome,
                        Settings,
                        CategoryManager,
                        History,
                        Utils,
                        categoryManager,
                        recentDetectionRequests
                    });
                })();
                break;

            case 'EXTENSION_TOGGLE_CHANGED':
                // Handle extension enable/disable toggle with cached detection badge restoration
                (async () => {
                    try {
                        const enabled = request.enabled;
                        console.log(`[Background] Extension toggle changed to: ${enabled ? 'ENABLED' : 'DISABLED'}`);

                        // Call Settings.handleEnableToggle with dependencies for badge restoration
                        await Settings.handleEnableToggle(enabled, {
                            DetectionEngineManager,
                            CategoryManager,
                            categoryManager
                        });

                        sendResponse({ status: 'success' });
                    } catch (error) {
                        console.error('[Background] Error handling toggle change:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Async response
                break;

            case 'DETECTION_DATA':
                // Process detection data from content script
                console.log('[DEBUG] DETECTION_DATA message received!');
                console.log('[DEBUG] Sender tab ID:', sender.tab?.id);
                console.log('[DEBUG] Request keys:', Object.keys(request));
                const pageData = request.data;
                console.log('[DEBUG] Request data available:', {
                    hasData: !!pageData,
                    dataKeys: pageData ? Object.keys(pageData) : null,
                    hasCookies: pageData?.cookies ? pageData.cookies.length : 0,
                    hasHeaders: pageData?.headers ? Object.keys(pageData.headers).length : 0,
                    hasScripts: pageData?.scripts ? pageData.scripts.length : 0,
                    hasDom: pageData?.dom ? pageData.dom.length : 0,
                    url: pageData?.url
                });
                try {
                    console.log('[DEBUG] Calling processDetectionData...');
                    processDetectionData(request, sender);
                    console.log('[DEBUG] processDetectionData completed successfully');
                } catch (error) {
                    console.error('[DEBUG] ERROR in processDetectionData:', error);
                }
                sendResponse({ status: 'received', tabId: sender.tab?.id });
                break;

            case 'CONTENT_SCRIPT_READY':
                // Content script is ready
                console.log(`Scrapfly Background: Content script ready on ${request.url}`);
                sendResponse({ status: 'acknowledged' });
                break;

            case 'GET_DETECTION_DATA':
                // Request for detection data from popup
                (async () => {
                    try {
                        let data = null;
                        let status = 'ok';

                        const tabId = request.tabId;

                        // PRIORITY FIX: Get cached data FIRST, then check interrupted/pending status only if no cache
                        if (tabId) {
                            // FIX: Layer 2 - If popup is querying the current active tab and it's marked as interrupted,
                            // clear the interrupted state because user is viewing this tab right now
                            if (tabId === currentActiveTab && interruptedDetections.has(tabId)) {
                                console.log(`[GET_DETECTION_DATA] Clearing interrupted state for current tab ${tabId} (user viewing popup)`);
                                interruptedDetections.delete(tabId);
                                try {
                                    await chrome.action.setBadgeText({ text: '', tabId });
                                } catch (error) {
                                    // Silently fail
                                }
                            }

                            // Try to get cached data first
                            data = await DetectionEngineManager.getDetectionData(tabId);
                            
                            // FIX: If no cached data but detection state exists with expiry, construct response from state
                            // This handles the case where detection just completed and storage write is still pending
                            if (!data) {
                                // CRITICAL FIX: Don't return zombie data from detectionStates if cache was recently cleared
                                if (recentlyClearedTabs.has(tabId)) {
                                    console.log(`[GET_DETECTION_DATA] Tab ${tabId} recently cleared - blocking zombie data from detectionStates`);
                                    // Don't return stale data - let popup show empty state
                                } else {
                                    const state = detectionStates.get(tabId);
                                    if (state && state.expiry && state.mainData && state.mainData.length > 0) {
                                        console.log(`[GET_DETECTION_DATA] Using fresh detection state with expiry for tab ${tabId}`);
                                        data = {
                                            detectionResults: state.mainData,
                                            timestamp: state.timestamp,
                                            expiry: state.expiry,
                                            url: state.url,
                                            favicon: state.favicon,
                                            fromStorage: false,
                                            processed: true
                                        };
                                    }
                                }
                            }
                            
                            // Reduced logging - comment out for less spam
                            // console.log(`Scrapfly Background: Sending detection data for tab ${tabId}:`, data ? 'Data available' : 'No data');

                            // FIX: Layer 3 - If we have cached data and tab is marked as interrupted, clear it
                            // (Tab was interrupted but detection actually completed before interruption occurred)
                            if (data && interruptedDetections.has(tabId)) {
                                console.log(`[GET_DETECTION_DATA] Clearing interrupted state for tab ${tabId} (has cached completed data)`);
                                interruptedDetections.delete(tabId);
                            }

                            // Only check interrupted/pending status if NO cached data exists
                            if (!data) {
                                // CRITICAL FIX: If cache was recently cleared, don't show pending/analyzing state
                                if (recentlyClearedTabs.has(tabId)) {
                                    console.log(`[GET_DETECTION_DATA] Tab ${tabId} recently cleared - returning empty state, not pending`);
                                    status = 'ok';  // Return ok with no data to show empty state
                                } else if (activeDetections.has(tabId)) {
                                    // FIX: If tab is marked interrupted but still has active detection, treat as pending
                                    // This handles race conditions where popup opens during analysis
                                    status = 'pending';
                                } else if (interruptedDetections.has(tabId)) {
                                    status = 'interrupted';
                                } else {
                                    // Check badge as fallback ONLY for pending status (⏳)
                                    // Do NOT check for interrupted status (✕) as badge may be stale
                                    try {
                                        const badgeText = await chrome.action.getBadgeText({ tabId });
                                        const trimmed = badgeText ? badgeText.trim() : '';
                                        if (trimmed === '⏳') {
                                            status = 'pending';
                                        }
                                        // Removed '✕' and '?' checks - interrupted state is tracked in interruptedDetections map
                                    } catch (badgeError) {
                                        console.log(`[GET_DETECTION_DATA] Failed to read badge text for tab ${tabId}:`, badgeError.message);
                                    }
                                }
                            }
                            // If cached data exists, status stays 'ok' regardless of interrupted state
                        } else {
                            // No tabId provided, use active tab
                            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                            if (activeTab) {
                                // FIX: Layer 2 - If popup is querying the current active tab and it's marked as interrupted,
                                // clear the interrupted state because user is viewing this tab right now
                                if (interruptedDetections.has(activeTab.id)) {
                                    console.log(`[GET_DETECTION_DATA] Clearing interrupted state for current tab ${activeTab.id} (user viewing popup)`);
                                    interruptedDetections.delete(activeTab.id);
                                    try {
                                        await chrome.action.setBadgeText({ text: '', tabId: activeTab.id });
                                    } catch (error) {
                                        // Silently fail
                                    }
                                }

                                // Try to get cached data first
                                data = await getCurrentTabDetectionData();
                                // Reduced logging - comment out for less spam
                                // console.log('Scrapfly Background: Sending detection data for current tab:', data ? 'Data available' : 'No data');

                                // FIX: Layer 3 - If we have cached data and tab is marked as interrupted, clear it
                                // (Tab was interrupted but detection actually completed before interruption occurred)
                                if (data && interruptedDetections.has(activeTab.id)) {
                                    console.log(`[GET_DETECTION_DATA] Clearing interrupted state for active tab ${activeTab.id} (has cached completed data)`);
                                    interruptedDetections.delete(activeTab.id);
                                }

                                // Only check interrupted/pending status if NO cached data exists
                                if (!data) {
                                    // FIX: If tab is marked interrupted but still has active detection, treat as pending
                                    // This handles race conditions where popup opens during analysis
                                    if (activeDetections.has(activeTab.id)) {
                                        status = 'pending';
                                    } else if (interruptedDetections.has(activeTab.id)) {
                                        status = 'interrupted';
                                    } else {
                                        // Check badge as fallback ONLY for pending status (⏳)
                                        // Do NOT check for interrupted status (✕) as badge may be stale
                                        try {
                                            const badgeText = await chrome.action.getBadgeText({ tabId: activeTab.id });
                                            const trimmed = badgeText ? badgeText.trim() : '';
                                            if (trimmed === '⏳') {
                                                status = 'pending';
                                            }
                                            // Removed '✕' and '?' checks - interrupted state is tracked in interruptedDetections map
                                        } catch (badgeError) {
                                            console.log('[GET_DETECTION_DATA] Failed to read badge text for active tab:', badgeError.message);
                                        }
                                    }
                                }
                                // If cached data exists, status stays 'ok' regardless of interrupted state
                            }
                        }

                        // Include detection progress state so popup can update step colors
                        const state = detectionStates.get(tabId) || (tabId ? null : detectionStates.get(activeTab?.id));
                        const completedMethods = state ? Array.from(state.completedMethods || []) : [];
                        const totalPercent = state ? Math.round((state.completedMethods?.size || 0) / 7 * 100) : 0;

                        sendResponse({
                            data,
                            status,
                            progress: {
                                completedMethods,
                                totalPercent,
                                method: completedMethods[completedMethods.length - 1] || null // Last completed method
                            }
                        });
                    } catch (error) {
                        console.error('Scrapfly Background: Error in GET_DETECTION_DATA:', error);
                        sendResponse({ data: null, status: 'error', error: error.message });
                    }
                })();
                return true; // Will respond asynchronously
                break;

            case 'RELOAD_DETECTORS':
                // Reload detectors from storage (after adding/updating/deleting)
                (async () => {
                    try {
                        console.log('Scrapfly Background: Reloading detectors from storage...');

                        // CRITICAL: Clear all optimization caches when rules change
                        // This ensures pattern changes are immediately reflected
                        if (typeof DetectionEngineManager !== 'undefined' && DetectionEngineManager.patternCache) {
                            console.log('Scrapfly Background: Clearing PatternCache (rules changed)');
                            DetectionEngineManager.patternCache.clear();
                        }

                        detectorManager.initialized = false;
                        await detectorManager.initialize();
                        console.log('Scrapfly Background: Detectors reloaded successfully');
                        sendResponse({ status: 'reloaded', detectorCount: detectorManager.getDetectorCount() });
                    } catch (error) {
                        console.error('Scrapfly Background: Error reloading detectors:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Will respond asynchronously
                break;

            case 'SYNC_CATEGORY_COLORS':
                // Sync category colors from Settings to CategoryManager
                (async () => {
                    try {
                        console.log('Scrapfly Background: Syncing category colors from Settings...');
                        const synced = await detectorManager.categoryManager.syncColorsFromSettings();
                        console.log('Scrapfly Background: Category colors synced:', synced);
                        sendResponse({ status: 'synced', success: synced });
                    } catch (error) {
                        console.error('Scrapfly Background: Error syncing category colors:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Will respond asynchronously
                break;

            case 'GET_DETECTORS':
                // Content script requesting all detectors (for hook installation at document_start)
                (async () => {
                    try {
                        const startTime = Date.now();
                        console.log('[Background] GET_DETECTORS request received');

                        // Ensure DetectorManager is fully initialized with retry logic
                        // IMPROVED: Increased from 10→20 retries and 200ms→300ms delays (2s→6s total)
                        // This handles slower JSON file loading during service worker startup
                        let retries = 20;
                        const maxRetries = retries;

                        while (retries > 0) {
                            await ensureDetectorManagerInitialized();

                            // Check if detectors are actually loaded (not just initialized flag)
                            const allDetectors = detectorManager.getAllDetectors();
                            const hasDetectors = allDetectors && Object.keys(allDetectors).length > 0;

                            if (hasDetectors) {
                                const elapsed = Date.now() - startTime;
                                const detectorCount = Object.values(allDetectors).reduce((sum, cat) =>
                                    sum + Object.keys(cat).length, 0
                                );
                                const attempts = maxRetries - retries + 1;
                                console.log(`[Background] ✅ Detectors loaded successfully in ${elapsed}ms (${attempts} attempts)`);
                                console.log(`[Background] 📊 Sending ${detectorCount} detectors across ${Object.keys(allDetectors).length} categories`);

                                sendResponse({
                                    detectors: allDetectors
                                });
                                return;
                            }

                            // Detectors not loaded yet, wait and retry
                            const attemptsLeft = retries - 1;
                            const elapsedSoFar = Date.now() - startTime;
                            console.warn(`[Background] ⚠️ Detectors not loaded yet (${elapsedSoFar}ms elapsed), retrying... (${attemptsLeft} attempts left)`);

                            // Diagnostic info on why detectors might not be ready
                            if (retries === maxRetries) {
                                console.log('[Background] 🔍 Initial diagnostic: DetectorManager state:', {
                                    exists: !!detectorManager,
                                    initialized: detectorManager?.initialized,
                                    detectorCount: detectorManager ? Object.keys(detectorManager.detectors || {}).length : 0,
                                    categoryManagerExists: !!categoryManager
                                });

                                // Check raw storage to compare with detectorManager state
                                chrome.storage.local.get(['scrapfly_detectors', 'scrapfly_categories'], (rawStorage) => {
                                    console.log('[Background] 🔍 DIAGNOSTIC: Raw chrome.storage.local contents:', {
                                        hasDetectorsKey: !!rawStorage.scrapfly_detectors,
                                        hasCategoriesKey: !!rawStorage.scrapfly_categories,
                                        detectorsTimestamp: rawStorage.scrapfly_detectors?.timestamp,
                                        detectorsDataKeys: rawStorage.scrapfly_detectors?.detectors ? Object.keys(rawStorage.scrapfly_detectors.detectors) : [],
                                        categoriesDataKeys: rawStorage.scrapfly_categories?.categories ? Object.keys(rawStorage.scrapfly_categories.categories) : []
                                    });

                                    // Show sample of what's in storage
                                    if (rawStorage.scrapfly_detectors?.detectors) {
                                        const detectorCategories = Object.keys(rawStorage.scrapfly_detectors.detectors);
                                        console.log('[Background] 🔍 DIAGNOSTIC: Storage detector categories:', detectorCategories);

                                        // Show count per category from storage
                                        for (const cat of detectorCategories) {
                                            const detectorNames = Object.keys(rawStorage.scrapfly_detectors.detectors[cat] || {});
                                            console.log(`[Background] 🔍 DIAGNOSTIC: Storage category "${cat}": ${detectorNames.length} detectors`);
                                        }
                                    }

                                    // Compare with detectorManager state
                                    if (detectorManager?.detectors) {
                                        const managerCategories = Object.keys(detectorManager.detectors);
                                        console.log('[Background] 🔍 DIAGNOSTIC: DetectorManager.detectors categories:', managerCategories);

                                        if (managerCategories.length === 0 && rawStorage.scrapfly_detectors?.detectors) {
                                            console.error('[Background] ❌ DIAGNOSTIC: MISMATCH! Storage has detectors but detectorManager.detectors is empty');
                                            console.error('[Background] ❌ DIAGNOSTIC: This indicates loadFromStorage() failed to populate detectorManager.detectors');
                                        }
                                    }
                                });
                            }

                            // Show progress every 5 attempts
                            if ((maxRetries - retries) % 5 === 0 && retries < maxRetries) {
                                const progress = Math.round(((maxRetries - retries) / maxRetries) * 100);
                                console.log(`[Background] ⏳ Progress: ${progress}% (waiting for JSON files to load...)`);
                            }

                            retries--;
                            if (retries > 0) {
                                await new Promise(resolve => setTimeout(resolve, 300)); // Wait 300ms before retry
                            }
                        }

                        // Failed to load detectors after retries
                        const elapsed = Date.now() - startTime;
                        console.error(`[Background] ❌ Failed to load detectors after ${elapsed}ms (${maxRetries} retries)`);
                        console.error('[Background] ❌ Final diagnostic:', {
                            detectorManagerExists: !!detectorManager,
                            initialized: detectorManager?.initialized,
                            categoriesCount: detectorManager ? Object.keys(detectorManager.detectors || {}).length : 0,
                            categoryManagerExists: !!categoryManager,
                            categoryManagerInitialized: categoryManager?.initialized
                        });

                        // Check if categories were loaded but not detectors
                        if (categoryManager?.initialized && categoryManager.categories) {
                            console.error('[Background] ❌ Categories loaded but detectors empty - JSON loading issue');
                            console.error('[Background] ❌ Available categories:', Object.keys(categoryManager.categories));
                        } else {
                            console.error('[Background] ❌ CategoryManager not initialized - initialization issue');
                        }

                        console.error('[Background] ⚠️ Content script will receive empty config - extension may not work correctly');
                        console.error('[Background] 💡 Recommendation: Reload extension and refresh all tabs');

                        // ALWAYS send response even on failure
                        sendResponse({ detectors: {} });
                    } catch (error) {
                        console.error('[Background] ❌ Error getting detectors:', error);
                        console.error('[Background] ❌ Stack trace:', error.stack);

                        // ALWAYS send response even on error
                        sendResponse({ detectors: {} });
                    }
                })();
                return true; // Will respond asynchronously
                break;

            case 'CHECK_CACHE_EARLY':
                // NEW OPTIMIZATION: Check cache before content script does any detection work
                (async () => {
                    try {
                        const { url } = request;
                        console.log('[Background] [Early Cache] Checking cache for:', url);

                        // Use existing getStoredDetection function to check for cached data
                        const cachedData = await DetectionEngineManager.getStoredDetection(url);

                        if (cachedData) {
                            console.log('[Background] ✅ [Early Cache] HIT - returning cached data');
                            // Mark this tab as using cache to skip unnecessary capture work
                            if (sender.tab?.id) {
                                tabsUsingCache.add(sender.tab.id);
                                console.log(`[Background] [Early Cache] Marked tab ${sender.tab.id} as using cache`);
                            }
                            sendResponse({
                                cacheHit: true,
                                detectionData: cachedData
                            });
                        } else {
                            console.log('[Background] ❌ [Early Cache] MISS - detection needed');
                            // Clear cache status for this tab (if it was previously cached)
                            if (sender.tab?.id) {
                                tabsUsingCache.delete(sender.tab.id);
                            }
                            sendResponse({
                                cacheHit: false
                            });
                        }
                    } catch (error) {
                        console.error('[Background] [Early Cache] Error checking cache:', error);
                        sendResponse({
                            cacheHit: false,
                            error: error.message
                        });
                    }
                })();
                return true; // Will respond asynchronously
                break;

            case 'CACHE_HIT_EARLY_EXIT':
                // Notification that content script detected cache hit and exited early
                (async () => {
                    try {
                        const { url, detectionData } = request;
                        const tabId = sender.tab?.id;

                        console.log('[Background] [Early Cache] Content script exited early due to cache hit for:', url);

                        // Update badge with cached detection count immediately
                        if (detectionData && tabId) {
                            const detectionCount = detectionData.detectionCount || 0;

                            if (detectionCount > 0) {
                                // Use same color scheme as normal detection flow
                                const badgeColors = await CategoryManager.getBadgeColors(categoryManager);
                                const count = detectionCount.toString();
                                const color = detectionCount >= 5 ? badgeColors.high :
                                             detectionCount >= 3 ? badgeColors.medium :
                                             badgeColors.low;

                                chrome.action.setBadgeText({
                                    text: count,
                                    tabId: tabId
                                });
                                chrome.action.setBadgeBackgroundColor({
                                    color: color,
                                    tabId: tabId
                                });
                                console.log(`[Background] [Early Cache] ✅ Badge updated: ${detectionCount} detections from cache`);
                            } else {
                                // No detections - clear badge (consistent with normal flow)
                                chrome.action.setBadgeText({
                                    text: '',
                                    tabId: tabId
                                });
                                console.log('[Background] [Early Cache] Badge cleared: no detections');
                            }
                        }

                        sendResponse({ status: 'acknowledged' });
                    } catch (error) {
                        console.error('[Background] [Early Cache] Error updating badge:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Will respond asynchronously
                break;

            case 'CATEGORY_COLORS_UPDATED':
                // Reload CategoryManager when colors are updated
                (async () => {
                    try {
                        console.log('Scrapfly Background: Category colors updated, reloading CategoryManager...');
                        if (categoryManager) {
                            await categoryManager.loadFromStorage();
                            console.log('Scrapfly Background: CategoryManager reloaded with new colors');
                        }
                        sendResponse({ status: 'reloaded' });
                    } catch (error) {
                        console.error('Scrapfly Background: Error reloading CategoryManager:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Will respond asynchronously
                break;

            case 'SETTINGS_UPDATED':
                // Delegate to Settings handler
                (async () => {
                    await Settings.handleSettingsUpdated({
                        chrome,
                        CategoryManager,
                        categoryManager
                    }, sendResponse);
                })();
                return true; // Will respond asynchronously
                break;

            case 'CACHE_SCOPE_CHANGED':
                // Clear in-memory URL hash cache when cache scope changes
                console.log('[Background] Cache scope changed - clearing URL hash cache');
                Utils.clearUrlHashCache();

                // Update badge for current tab based on cached data with new scope
                (async () => {
                    try {
                        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (tabs && tabs[0]) {
                            const tab = tabs[0];

                            // Check for cached data with new scope
                            const storedData = await DetectionEngineManager.getStoredDetection(tab.url);

                            // Add to recentlyClearedTabs to prevent auto-detection on popup reopen
                            // (Treat cache scope change like explicit cache clear for protection)
                            recentlyClearedTabs.add(tab.id);

                            // FIX: Clear stale activeDetections state to prevent false "pending" status
                            // This ensures GET_DETECTION_DATA doesn't return status='pending' for old detections
                            activeDetections.delete(tab.id);
                            console.log(`[Background] Cleared activeDetections for tab ${tab.id} (cache scope changed)`);

                            setTimeout(() => recentlyClearedTabs.delete(tab.id), 10000);
                            console.log(`[Background] Added tab ${tab.id} to recentlyClearedTabs for 10 seconds`);

                            if (storedData && storedData.detectionCount > 0) {
                                // Update badge with cached count and color
                                const badgeColors = await CategoryManager.getBadgeColors(categoryManager);
                                const count = storedData.detectionCount.toString();
                                const color = storedData.detectionCount >= 5 ? badgeColors.high :
                                             storedData.detectionCount >= 3 ? badgeColors.medium :
                                             badgeColors.low;

                                await chrome.action.setBadgeText({ text: count, tabId: tab.id });
                                await chrome.action.setBadgeBackgroundColor({ color: color, tabId: tab.id });
                                console.log(`[Background] Badge updated with cached data: ${count} detections (scope change)`);
                            } else {
                                // No cached data with new scope - show gray X
                                await chrome.action.setBadgeText({ text: '✕', tabId: tab.id });
                                await chrome.action.setBadgeBackgroundColor({ color: '#6B7280', tabId: tab.id });
                                console.log('[Background] Badge updated to gray X - no cached data with new scope');
                            }
                        }

                        if (sendResponse) {
                            sendResponse({ success: true });
                        }
                    } catch (error) {
                        console.error('[Background] Error updating badge on cache scope change:', error);
                        if (sendResponse) {
                            sendResponse({ success: false, error: error.message });
                        }
                    }
                })();

                return true; // Async response
                break;

            case 'REQUEST_DETECTION':
                // FIX: Send initial progress update with correct parameters
                if (request.tabId) {
                    sendProgressUpdate(request.tabId, 'main', new Set(), 7);
                }

                // Delegate to DetectionEngineManager handler
                (async () => {
                    // Ensure detector manager is initialized before processing
                    await ensureDetectorManagerInitialized();

                    return await DetectionEngineManager.handleRequestDetection(request, sendResponse, {
                        chrome,
                        Utils,
                        recentDetectionRequests
                    });
                })();
                return true; // Will respond asynchronously
                break;

            case 'CLEAR_DETECTION_DATA':
                // Clear detection data for a tab
                if (request.tabId) {
                    headersStore.delete(request.tabId);
                    requestHeadersStore.delete(request.tabId);
                    responseCookiesStore.delete(request.tabId);
                    payloadStore.delete(request.tabId);
                    networkUrlsStore.delete(request.tabId);
                } else {
                    // Clear all
                    headersStore.clear();
                    requestHeadersStore.clear();
                    responseCookiesStore.clear();
                    payloadStore.clear();
                    networkUrlsStore.clear();
                }
                sendResponse({ status: 'cleared' });
                break;

            case 'CLEAR_DETECTION_CACHE':
                // Delegate to DetectionEngineManager handler
                (async () => {
                    // Clear chrome.storage cache
                    await DetectionEngineManager.handleClearDetectionCache(request, sendResponse, manuallyClearedCaches);

                    // CRITICAL FIX: Also clear in-memory caches to prevent zombie data
                    if (request.tabId) {
                        // Clear detection states (the main culprit of zombie data)
                        if (detectionStates.has(request.tabId)) {
                            detectionStates.delete(request.tabId);
                            console.log(`[Background] 🧹 Cleared detectionStates for tab ${request.tabId}`);
                        }

                        // Clear active detection tracking
                        if (activeDetections.has(request.tabId)) {
                            activeDetections.delete(request.tabId);
                            console.log(`[Background] 🧹 Cleared activeDetections for tab ${request.tabId}`);
                        }

                        // Clear other related stores
                        headersStore.delete(request.tabId);
                        requestHeadersStore.delete(request.tabId);
                        responseCookiesStore.delete(request.tabId);
                        payloadStore.delete(request.tabId);
                        networkUrlsStore.delete(request.tabId);
                        tabsUsingCache.delete(request.tabId);

                        // Track this tab as recently cleared (prevent data resurrection for 5 seconds)
                        recentlyClearedTabs.add(request.tabId);
                        setTimeout(() => {
                            recentlyClearedTabs.delete(request.tabId);
                            console.log(`[Background] 🔓 Tab ${request.tabId} removed from recently cleared list`);
                        }, 5000);

                        // CRITICAL FIX: Update badge to show no detection
                        try {
                            await chrome.action.setBadgeText({ text: '✕', tabId: request.tabId });
                            await chrome.action.setBadgeBackgroundColor({
                                color: '#6B7280', // gray-500
                                tabId: request.tabId
                            });
                            console.log(`[Background] 🔖 Badge set to ✕ for tab ${request.tabId}`);
                        } catch (badgeError) {
                            console.warn(`[Background] Could not update badge for tab ${request.tabId}:`, badgeError);
                        }

                        console.log(`[Background] ✅ Complete cache clear for tab ${request.tabId} - all memory and storage cleared`);
                    }
                })();
                return true; // Async response

            case 'JS_HOOK_DETECTION':
                // DEPRECATED: Individual hooks no longer used - batching is preferred
                // Keeping for backward compatibility during transition
                console.warn('[Background] Individual JS_HOOK_DETECTION received (should be batched)');
                return false;

            case 'JS_HOOK_DETECTION_BATCH':
                // OPTIMIZED 3.4: Handle batched JS hook detections (from content.js optimization 2.4)
                (async () => {
                    let tabId;  // FIX: Declare outside try block for finally access
                    try {
                        if (!sender.tab || !sender.tab.id) {
                            console.error('[Background] No tab info for JS hook batch');
                            return;
                        }

                        tabId = sender.tab.id;

                        // OPTIMIZATION: Early exit if tab is using cache
                        if (tabsUsingCache.has(tabId)) {
                            console.log(`[Background] ✅ JS Hooks - Tab ${tabId} using cache - discarding hooks immediately`);
                            return; // Skip all processing for cached tabs
                        }

                        const detections = request.detections || [];

                        if (detections.length === 0) return;

                        // Extract URL for cache check
                        const url = detections[0]?.url;
                        if (!url) return;

                        // Create state BEFORE cache check so we can set usedCache flag
                        const state = getOrCreateDetectionState(tabId, url);

                        // CACHE CHECK: If cache exists for this URL, skip processing hooks entirely
                        const cachedData = await DetectionEngineManager.getStoredDetection(url);
                        if (cachedData) {
                            // Mark this detection as using cache to suppress misleading warning logs
                            state.usedCache = true;

                            batchProcessingFlags.set(tabId, false);
                            console.log(`[🔒 Batch Flag] ✅ SET to FALSE (cache hit) for tab ${tabId}`);
                            return; // Don't process hooks - we have cached results
                        }

                        // FIX: Mark batch processing as active to prevent finalization race conditions
                        const previousFlag = batchProcessingFlags.get(tabId);
                        batchProcessingFlags.set(tabId, true);
                        console.log(`%c[🔒 Batch Flag] 🔴 SET to TRUE (batch start) for tab ${tabId}`, 'color: #f44336; font-weight: bold;');
                        console.log(`[🔒 Batch Flag] Previous value: ${previousFlag}, New value: true`);
                        console.log(`[🔒 Batch Flag] This BLOCKS finalization until set to FALSE`);

                        console.log(`[Background] 🎯 JS Hook batch from tab ${tabId}: ${detections.length} hooks`);

                        // DEBUG: Log each hook detection
                        console.log(`[Background] 📋 JS Hooks details:`);
                        detections.forEach(hookData => {
                            const det = hookData.detection;

                            // DEBUG TRACKER: Log hook firing
                            // Check if this is an inline hook (detector ID starts with 'inline-hook-')
                            const isInlineHook = det.detectorId && det.detectorId.startsWith('inline-hook-');

                            console.log(`[Background]   - ${det.detectorName} (ID: ${det.detectorId}) [${isInlineHook ? 'INLINE' : 'DYNAMIC'}]: ${det.hook.target}`);

                            DEBUG_HOOK_DETECTION.logHookFired(
                                det.detectorId,
                                det.hook.target,
                                det.detectorName,
                                isInlineHook
                            );
                        });

                        // Ensure DetectorManager is initialized once
                        await ensureDetectorManagerInitialized();

                        // State already created above for cache check (line 2315)

                        // OPTIMIZATION: Record batch arrival time for deterministic finalization
                        state.lastHookBatchTime = Date.now();

                        // URL validation: Ensure URL hasn't changed during detection
                        if (state.url !== url) {
                            console.log(`[Background] ⚠️ URL changed during JS hooks for tab ${tabId}: ${url} → ${state.url} - skipping hooks`);
                            return; // Don't store hooks for the wrong URL
                        }

                        // Process all detections in batch
                        for (const hookData of detections) {
                            const detection = hookData.detection;
                            const detectorId = detection.detectorId;
                            const normalizedCategory = detection.category ? detection.category.toLowerCase() : 'fingerprint';

                            // Look up full detector definition (cached by DetectorManager)
                            let fullDetector = detectorManager.getDetector(normalizedCategory, detectorId);
                            if (!fullDetector) {
                                fullDetector = detectorManager.findDetectorById(detectorId);
                            }
                            if (!fullDetector) {
                                console.warn(`[Background] Detector ${detectorId} not found, skipping`);
                                continue;
                            }

                            // Add or update detector in state
                            if (!state.hooksData.has(detectorId)) {
                                state.hooksData.set(detectorId, {
                                    detector: {
                                        id: fullDetector.id || detectorId,
                                        name: fullDetector.name || detection.detectorName || 'Unknown',
                                        icon: fullDetector.icon,
                                        color: fullDetector.color,
                                        description: fullDetector.description
                                    },
                                    category: normalizedCategory,
                                    confidence: 0,
                                    detectionMethods: ['js_hooks'],
                                    matches: []
                                });
                            }

                            // Add hook match (check for duplicates first)
                            const detector = state.hooksData.get(detectorId);
                            const newMatch = {
                                type: 'js_hooks',
                                pattern: detection.hook.target,
                                value: detection.hook.target.split('.').pop(),
                                confidence: detection.hook.confidence,
                                description: detection.hook.description
                            };

                            // Only add if this exact pattern doesn't already exist
                            const isDuplicate = detector.matches.some(m => m.pattern === newMatch.pattern);
                            if (!isDuplicate) {
                                detector.matches.push(newMatch);
                            }

                            // Update overall confidence (use highest confidence from all matches)
                            detector.confidence = Math.max(...detector.matches.map(m => m.confidence || 0));
                        }

                        console.log(`[Background] ✅ Processed ${detections.length} hooks in batch for tab ${tabId}`);

                    } catch (error) {
                        console.error('[Background] ❌ ERROR handling JS hook batch:', error);
                    } finally {
                        // FIX: Mark batch processing as complete (with safety guard)
                        if (tabId) {
                            const wasActive = batchProcessingFlags.get(tabId);
                            batchProcessingFlags.set(tabId, false);
                            console.log(`%c[🔒 Batch Flag] 🟢 SET to FALSE (batch complete) for tab ${tabId}`, 'color: #4caf50; font-weight: bold;');
                            console.log(`[🔒 Batch Flag] Was active: ${wasActive}, Now: false`);
                            console.log(`[🔒 Batch Flag] Batch processing complete - NOW allowing finalization`);
                            // Trigger finalization check in case it was deferred
                            // NOTE: During late arrival phase, this won't finalize until buffer expires
                            console.log(`[🔒 Batch Flag] Calling checkAndFinalizeDetection after batch complete...`);
                            checkAndFinalizeDetection(tabId);
                        }
                    }
                })();
                return false; // No response needed for batches

            // REMOVED: Old JS_HOOKS_COMPLETE handler - replaced with comprehensive handler below (line ~2225)

            case 'WINDOW_DETECTIONS':
                // Handle window detections from MAIN world
                (async () => {
                    try {
                        if (!sender.tab || !sender.tab.id) {
                            console.error('[Background] No tab info for window detections');
                            return;
                        }

                        const tabId = sender.tab.id;

                        // OPTIMIZATION: Early exit if tab is using cache
                        if (tabsUsingCache.has(tabId)) {
                            console.log(`[Background] ✅ Window Detections - Tab ${tabId} using cache - discarding properties immediately`);
                            return; // Skip all processing for cached tabs
                        }

                        const url = sender.tab.url;
                        const { detections, executionTime } = request;

                        // Validate detections array
                        if (!Array.isArray(detections)) {
                            console.error('[Background] ❌ Invalid detections format:', typeof detections);
                            return;
                        }

                        // Create state BEFORE cache check so we can set usedCache flag
                        const state = getOrCreateDetectionState(tabId, url);

                        // CACHE CHECK: If cache exists for this URL, skip processing window properties entirely
                        const cachedData = await DetectionEngineManager.getStoredDetection(url);
                        if (cachedData) {
                            // Mark this detection as using cache to suppress misleading warning logs
                            state.usedCache = true;

                            return; // Don't process window properties - we have cached results
                        }

                        console.log(`[Background] 🔍 Window property detections from tab ${tabId}: ${detections.length} properties in ${executionTime}ms`);

                        // DEBUG: Log each window property detection
                        if (detections.length > 0) {
                            console.log(`[Background] 📋 Window property details:`);
                            detections.forEach(det => {
                                console.log(`[Background]   - ${det.detectorName} (${det.detectorId}): window.${det.property.path}`);
                            });
                        } else {
                            console.log(`[Background] ⚠️ No window properties detected (none matched conditions)`);
                        }

                        // State already created above for cache check (line 2470)
                        // Validate state
                        if (!state) {
                            console.error('[Background] ❌ Failed to get/create detection state for tab', tabId);
                            return;
                        }

                        // URL validation: Ensure URL hasn't changed during detection
                        if (state.url !== url) {
                            console.log(`[Background] ⚠️ URL changed during window props for tab ${tabId}: ${url} → ${state.url} - skipping window props`);
                            return; // Don't store window props for the wrong URL
                        }

                        // Initialize mainData array if it doesn't exist
                        if (!Array.isArray(state.mainData)) {
                            console.log('[Background] Initializing mainData array for tab', tabId);
                            state.mainData = [];
                        }

                        // Process each window property detection
                        for (const detection of detections) {
                            if (!detection || !detection.detectorId) {
                                console.warn('[Background] ⚠️ Skipping invalid detection:', detection);
                                continue;
                            }

                            // Find or create the detector entry in mainData
                            let detectionObj = state.mainData.find(d => d && (d.detector?.id === detection.detectorId || d.id === detection.detectorId));
                            if (!detectionObj) {
                                // Get full detector metadata from DetectorManager
                                // Normalize category name (e.g., "Anti-Bot" -> "antibot")
                                const categoryKey = detection.category.toLowerCase().replace(/[^a-z0-9]/g, '');
                                const fullDetector = detectorManager.getDetector(categoryKey, detection.detectorId);

                                // Create detection object with nested structure matching detectOnPage() output
                                detectionObj = {
                                    detected: true,
                                    confidence: detection.property.confidence,
                                    matches: [],
                                    detectionMethods: [],
                                    category: detection.category,
                                    detector: {
                                        id: detection.detectorId,
                                        name: detection.detectorName,
                                        icon: fullDetector?.icon,
                                        color: fullDetector?.color,
                                        description: fullDetector?.description
                                    }
                                };
                                state.mainData.push(detectionObj);
                            }

                            // Add window property match
                            const newMatch = {
                                type: 'window',
                                pattern: detection.property.path,
                                confidence: detection.property.confidence,
                                description: detection.property.description,
                                actualType: detection.property.actualType,
                                condition: detection.property.condition
                            };

                            // Check for duplicates
                            const isDuplicate = detectionObj.matches.some(m =>
                                m.type === 'window' && m.pattern === newMatch.pattern
                            );

                            if (!isDuplicate) {
                                detectionObj.matches.push(newMatch);
                                // Update detectionMethods to include window
                                if (!detectionObj.detectionMethods) {
                                    detectionObj.detectionMethods = [];
                                }
                                if (!detectionObj.detectionMethods.includes('window')) {
                                    detectionObj.detectionMethods.push('window');
                                }
                                console.log(`[Background] ✅ Added window property: ${detection.property.path} for ${detection.detectorName}`);
                            }

                            // Update overall confidence
                            detectionObj.confidence = Math.max(...detectionObj.matches.map(m => m.confidence || 0));
                        }

                        console.log(`[Background] ✅ Processed ${detections.length} window properties for tab ${tabId}`);

                        // Note: windowPropertiesComplete will be marked by WINDOW_PROPS_COMPLETE signal
                        // This allows multiple checks to complete before finalization

                    } catch (error) {
                        console.error('[Background] ❌ ERROR handling window property detections:', error);
                    }
                })();
                return false; // No response needed

            case 'WINDOW_PROPS_COMPLETE':
                // Window properties collection complete - mark session and potentially finalize
                (async () => {
                    try {
                        if (!sender.tab || !sender.tab.id) {
                            console.error('[Background] No tab info for window props complete');
                            return;
                        }

                        const tabId = sender.tab.id;

                        // OPTIMIZATION: Early exit if tab is using cache
                        if (tabsUsingCache.has(tabId)) {
                            console.log(`[Background] ✅ Window Props - Tab ${tabId} using cache - discarding signal`);
                            sendResponse({ status: 'cached', message: 'Tab using cached detection' });
                            return; // Skip all processing for cached tabs
                        }

                        const url = request.url;

                        console.log(`%c[🎯 WINDOW_PROPS_COMPLETE] Signal RECEIVED from tab ${tabId}`, 'color: #00cc00; font-weight: bold; font-size: 14px;');
                        console.log(`[🎯 WINDOW_PROPS_COMPLETE] Window props stats:`, {
                            detectedCount: request.detectedCount,
                            totalChecked: request.totalChecked,
                            elapsedMs: request.elapsedMs,
                            reason: request.reason
                        });

                        // Mark window properties as complete
                        const state = getOrCreateDetectionState(tabId, url);

                        // URL validation with normalization to handle trailing slashes, etc.
                        const normalizeUrl = (u) => {
                            try {
                                const parsed = new URL(u);
                                // Remove trailing slash, hash, and normalize
                                return parsed.origin + parsed.pathname.replace(/\/$/, '') + parsed.search;
                            } catch (e) {
                                return u;
                            }
                        };

                        const normalizedStateUrl = normalizeUrl(state.url);
                        const normalizedRequestUrl = normalizeUrl(url);

                        if (normalizedStateUrl !== normalizedRequestUrl) {
                            console.warn(`%c[🎯 WINDOW_PROPS_COMPLETE] ❌ URL MISMATCH - IGNORING SIGNAL for tab ${tabId}`, 'color: #f44336; font-weight: bold;');
                            console.warn(`[🎯 WINDOW_PROPS_COMPLETE]   State URL: ${state.url}`);
                            console.warn(`[🎯 WINDOW_PROPS_COMPLETE]   Request URL: ${url}`);
                            console.warn(`[🎯 WINDOW_PROPS_COMPLETE]   Normalized state: ${normalizedStateUrl}`);
                            console.warn(`[🎯 WINDOW_PROPS_COMPLETE]   Normalized request: ${normalizedRequestUrl}`);
                            console.warn(`[🎯 WINDOW_PROPS_COMPLETE] ⚠️ This will cause 86% hang - signal will never be processed!`);
                            sendResponse({ status: 'url_changed' });
                            return;
                        }

                        // Check current state before marking complete
                        const beforeState = {
                            windowPropertiesComplete: state.windowPropertiesComplete,
                            completedMethods: Array.from(state.completedMethods),
                            finalized: state.finalized
                        };

                        state.windowPropertiesComplete = true;

                        console.log(`[🎯 WINDOW_PROPS_COMPLETE] State flags:`, {
                            before: beforeState,
                            after: {
                                windowPropertiesComplete: state.windowPropertiesComplete,
                                completedMethods: Array.from(state.completedMethods),
                                finalized: state.finalized
                            }
                        });

                        // GRANULAR PROGRESS: Mark window properties method complete
                        markMethodComplete(tabId, 'windowProperties');

                        console.log(`%c[🎯 WINDOW_PROPS_COMPLETE] ✅ Window properties marked complete - calling finalization check`, 'color: #4caf50; font-weight: bold;');

                        // Check if all methods are done
                        checkAndFinalizeDetection(tabId);

                        sendResponse({ status: 'success' });
                    } catch (error) {
                        console.error('[🎯 WINDOW_PROPS_COMPLETE] ❌ ERROR handling window props complete:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Async response

            case 'JS_HOOKS_COMPLETE':
                // JS hooks collection complete - mark session and potentially finalize
                (async () => {
                    try {
                        if (!sender.tab || !sender.tab.id) {
                            console.error('[Background] No tab info for JS hooks complete');
                            return;
                        }

                        const tabId = sender.tab.id;
                        const url = request.url;

                        console.log(`%c[Background] 🎯 JS_HOOKS_COMPLETE received from tab ${tabId}`, 'color: #00cc00; font-weight: bold;');
                        console.log(`[Background] Hook stats:`, {
                            totalDetections: request.totalDetections,
                            uniqueHooks: request.uniqueHooks,
                            completionTime: request.completionTime,
                            reason: request.completionReason
                        });

                        // Mark hooks as complete
                        const state = getOrCreateDetectionState(tabId, url);

                        // URL validation with normalization to handle trailing slashes, etc.
                        const normalizeUrl = (u) => {
                            try {
                                const parsed = new URL(u);
                                // Remove trailing slash, hash, and normalize
                                return parsed.origin + parsed.pathname.replace(/\/$/, '') + parsed.search;
                            } catch (e) {
                                return u;
                            }
                        };

                        const normalizedStateUrl = normalizeUrl(state.url);
                        const normalizedRequestUrl = normalizeUrl(url);

                        if (normalizedStateUrl !== normalizedRequestUrl) {
                            console.warn(`[Background] ⚠️ URL mismatch - ignoring JS hooks complete for tab ${tabId}`);
                            console.warn(`[Background]   State URL: ${state.url}`);
                            console.warn(`[Background]   Request URL: ${url}`);
                            console.warn(`[Background]   Normalized state: ${normalizedStateUrl}`);
                            console.warn(`[Background]   Normalized request: ${normalizedRequestUrl}`);
                            sendResponse({ status: 'url_changed' });
                            return;
                        }

                        state.hooksComplete = true;

                        // GRANULAR PROGRESS: Mark JS hooks method complete
                        markMethodComplete(tabId, 'jsHooks');

                        console.log(`[Background] ✅ Hooks marked complete`);
                        console.log(`[Background] Current completion status: ${state.completedMethods.size}/7 methods`);
                        console.log(`[Background] Completed methods: ${Array.from(state.completedMethods).join(', ')}`);

                        // DEBUG TRACKER: Log completion statistics
                        // Count hooks: inline (from inline hook system) + dynamic (from hooksData)
                        const inlineCount = request.totalDetections || 0; // Assuming inline hooks report total
                        const dynamicCount = state.hooksData.size;
                        const totalInstalled = inlineCount + dynamicCount;
                        DEBUG_HOOK_DETECTION.logCompletion(totalInstalled, inlineCount, dynamicCount);

                        // Check if all methods are done
                        checkAndFinalizeDetection(tabId);

                        // SAFETY: If still not finalized after 1 second, force another check
                        // This handles edge cases where the debounce logic might miss the completion
                        setTimeout(() => {
                            const currentState = detectionStates.get(tabId);
                            if (currentState && !currentState.finalized && currentState.completedMethods.has('jsHooks')) {
                                console.warn(`[Background] 🔄 Retry: JS hooks complete but detection not finalized, forcing check`);
                                checkAndFinalizeDetection(tabId);
                            }
                        }, 1000);

                        sendResponse({ status: 'success' });
                    } catch (error) {
                        console.error('[Background] ❌ ERROR handling JS hooks complete:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Async response

            // OPTIMIZED 3.1: Lazy interceptor initialization
            // reCAPTCHA messages - delegate to reCaptchaHandleMessage
            case 'RECAPTCHA_START_CAPTURE':
            case 'RECAPTCHA_STOP_CAPTURE':
            case 'RECAPTCHA_GET_CAPTURE_STATE':
            case 'RECAPTCHA_GET_CAPTURE_RESULTS':
                // OPTIMIZED 3.1: Interceptor already loaded via importScripts (not lazy)
                if (typeof reCaptchaHandleMessage === 'function') {
                    return reCaptchaHandleMessage(request, sendResponse, reCaptchaCaptureState);
                }
                break;

            // Akamai messages - delegate to akamaiHandleMessage
            case 'AKAMAI_START_CAPTURE':
            case 'AKAMAI_STOP_CAPTURE':
            case 'AKAMAI_GET_CAPTURE_STATE':
            case 'AKAMAI_CAPTURE_COMPLETED':
            case 'AKAMAI_EXTRACT_SENSOR':
            case 'AKAMAI_EXTRACTION_COMPLETED':
            case 'AKAMAI_SHOW_ANALYZING_NOTIFICATION':
            case 'AKAMAI_SHOW_EXTRACTING_NOTIFICATION':
                // OPTIMIZED 3.1: Interceptor already loaded via importScripts (not lazy)
                if (typeof akamaiHandleMessage === 'function') {
                    return akamaiHandleMessage(request, sendResponse);
                }
                break;

            // Imperva messages - delegate to impervaHandleMessage
            case 'IMPERVA_START_CAPTURE':
            case 'IMPERVA_STOP_CAPTURE':
            case 'IMPERVA_EXTRACT_SCRIPTS':
            case 'IMPERVA_GET_CAPTURE_STATE':
            case 'IMPERVA_CAPTURE_COMPLETED':
            case 'IMPERVA_SHOW_ANALYZING_NOTIFICATION':
                // OPTIMIZED 3.1: Interceptor already loaded via importScripts (not lazy)
                if (typeof impervaHandleMessage === 'function') {
                    return impervaHandleMessage(request, sendResponse);
                }
                break;

            // Shape Security messages - delegate to shapeSecurityHandleMessage
            case 'SHAPESECURITY_START_CAPTURE':
            case 'SHAPESECURITY_STOP_CAPTURE':
            case 'SHAPESECURITY_GET_CAPTURE_STATE':
            case 'SHAPESECURITY_CHECK_HEADERS':
            case 'SHAPESECURITY_CHECK_COOKIES':
            case 'SHAPESECURITY_CHECK_VERSION':
            case 'SHAPESECURITY_ANALYZE_SCRIPTS':
            case 'SHAPESECURITY_START_EXTRACTION':
            case 'SHAPESECURITY_SHOW_ANALYZING_NOTIFICATION':
            case 'SHAPESECURITY_EXTRACTION_COMPLETED':
                // OPTIMIZED 3.1: Interceptor already loaded via importScripts (not lazy)
                if (typeof shapeSecurityHandleMessage === 'function') {
                    return shapeSecurityHandleMessage(request, sendResponse);
                }
                break;

            // AWS WAF messages - delegate to handleAwsWafMessage
            case 'AWSWAF_START_CAPTURE':
            case 'AWSWAF_STOP_CAPTURE':
            case 'AWSWAF_GET_STATE':
            case 'AWSWAF_START_ANALYSIS':
            case 'AWSWAF_SHOW_ANALYZING_NOTIFICATION':
                // OPTIMIZED 3.1: Interceptor loaded via importScripts, no initialization needed
                if (typeof handleAwsWafMessage === 'function') {
                    return handleAwsWafMessage(request, sender, sendResponse);
                }
                break;

            // Geetest messages - delegate to geetestHandleMessage (simplified - no capture)
            case 'GEETEST_CHECK_VERSION':
            case 'GEETEST_ANALYZE_SCRIPTS':
            case 'GEETEST_SHOW_VERSION_NOTIFICATION':
            case 'GEETEST_SHOW_ANALYZING_NOTIFICATION':
                // OPTIMIZED 3.1: Interceptor already loaded via importScripts (not lazy)
                if (typeof geetestHandleMessage === 'function') {
                    return geetestHandleMessage(request, sender, sendResponse);
                }
                break;

            // DataDome messages - delegate to handleDataDomeMessage
            case 'DATADOME_START_ANALYSIS':
            case 'DATADOME_SHOW_ANALYZING_NOTIFICATION':
                // OPTIMIZED 3.1: Interceptor loaded via importScripts, no initialization needed
                if (typeof handleDataDomeMessage === 'function') {
                    return handleDataDomeMessage(request, sender, sendResponse);
                }
                break;

            // Cloudflare messages
            case 'CLOUDFLARE_START_ANALYSIS':
            case 'CLOUDFLARE_SHOW_ANALYZING_NOTIFICATION':
            case 'CLOUDFLARE_CHECK_VERSION':
                if (typeof handleCloudflareMessage === 'function') {
                    return handleCloudflareMessage(request, sender, sendResponse);
                }
                break;

            // Turnstile messages
            case 'TURNSTILE_START_ANALYSIS':
            case 'TURNSTILE_SHOW_ANALYZING_NOTIFICATION':
                if (typeof handleTurnstileMessage === 'function') {
                    return handleTurnstileMessage(request, sender, sendResponse);
                }
                break;

            // hCaptcha messages
            case 'HCAPTCHA_START_ANALYSIS':
            case 'HCAPTCHA_SHOW_ANALYZING_NOTIFICATION':
            case 'HCAPTCHA_SHOW_VERSION_NOTIFICATION':
            case 'HCAPTCHA_CHECK_VERSION':
            case 'HCAPTCHA_START_CAPTURE':
            case 'HCAPTCHA_STOP_CAPTURE':
            case 'HCAPTCHA_GET_CAPTURE_STATE':
            case 'HCAPTCHA_CAPTURE_COMPLETED':
                if (typeof handleHCaptchaMessage === 'function') {
                    return handleHCaptchaMessage(request, sender, sendResponse);
                }
                break;

            // FunCaptcha messages
            case 'FUNCAPTCHA_START_ANALYSIS':
            case 'FUNCAPTCHA_SHOW_ANALYZING_NOTIFICATION':
            case 'FUNCAPTCHA_START_CAPTURE':
            case 'FUNCAPTCHA_STOP_CAPTURE':
            case 'FUNCAPTCHA_GET_CAPTURE_STATE':
            case 'FUNCAPTCHA_CAPTURE_COMPLETED':
                if (typeof handleFunCaptchaMessage === 'function') {
                    return handleFunCaptchaMessage(request, sendResponse, funcaptchaCaptureState);
                }
                break;

            // Log Collector messages
            case 'LOG_COLLECTOR_ENABLE':
                if (typeof logCollector !== 'undefined') {
                    logCollector.enable();
                    console.log('[LogCollector] Log collection enabled via settings');
                }
                sendResponse({ status: 'success' });
                break;

            case 'LOG_COLLECTOR_DISABLE':
                if (typeof logCollector !== 'undefined') {
                    logCollector.disable();
                    console.log('[LogCollector] Log collection disabled via settings');
                }
                sendResponse({ status: 'success' });
                break;

            case 'LOG_COLLECTOR_CLEAR':
                if (typeof logCollector !== 'undefined') {
                    logCollector.clear();
                    console.log('[LogCollector] Logs cleared');
                    sendResponse({ status: 'success' });
                } else {
                    sendResponse({ status: 'error', message: 'LogCollector not available' });
                }
                return true; // Keep message channel open for response

            case 'LOG_COLLECTOR_EXPORT_JSON':
                if (typeof logCollector !== 'undefined') {
                    const jsonFilename = logCollector.exportAsJSON();
                    console.log('[LogCollector] Exported logs as JSON:', jsonFilename);
                    sendResponse({ status: 'success', filename: jsonFilename });
                } else {
                    sendResponse({ status: 'error', message: 'LogCollector not available' });
                }
                return true; // Keep message channel open for response

            case 'LOG_COLLECTOR_EXPORT_TEXT':
                if (typeof logCollector !== 'undefined') {
                    const textFilename = logCollector.exportAsText();
                    console.log('[LogCollector] Exported logs as text:', textFilename);
                    sendResponse({ status: 'success', filename: textFilename });
                } else {
                    sendResponse({ status: 'error', message: 'LogCollector not available' });
                }
                return true; // Keep message channel open for response

            case 'LOG_COLLECTOR_GET_COUNT':
                if (typeof logCollector !== 'undefined') {
                    // getLogCount is async, so handle it with Promise
                    logCollector.getLogCount().then((count) => {
                        sendResponse({ status: 'success', count: count });
                    }).catch((error) => {
                        console.error('[LogCollector] Error getting log count:', error);
                        sendResponse({ status: 'error', message: 'Failed to get log count', count: 0 });
                    });
                    return true; // Indicate async response
                } else {
                    sendResponse({ status: 'error', message: 'LogCollector not available', count: 0 });
                }
                break;

            case 'LOG_COLLECTOR_SET_MAX_LOGS':
                if (typeof logCollector !== 'undefined') {
                    const maxLogs = request.maxLogs;
                    logCollector.setMaxLogs(maxLogs);
                    console.log('[LogCollector] Max logs set to:', maxLogs);
                    sendResponse({ status: 'success', maxLogs: maxLogs });
                } else {
                    sendResponse({ status: 'error', message: 'LogCollector not available' });
                }
                break;

            default:
                console.log('Scrapfly Background: Unknown message type:', request.type);
                sendResponse({ status: 'unknown' });
        }

        return false; // Synchronous response unless specified otherwise
    });
}

/**
 * Setup tab event listeners
 */
function setupTabListeners() {
    // Clear data when tab is closed
    chrome.tabs.onRemoved.addListener((tabId) => {
        console.log(`Scrapfly Background: Tab ${tabId} closed, clearing headers, cookies, payloads, and network URLs`);
        headersStore.delete(tabId);
        requestHeadersStore.delete(tabId);
        responseCookiesStore.delete(tabId);
        payloadStore.delete(tabId);
        networkUrlsStore.delete(tabId);

        // Clear cache tracking for this tab
        if (tabsUsingCache.has(tabId)) {
            tabsUsingCache.delete(tabId);
            console.log(`[TabCleanup] Removed tab ${tabId} from cache tracking`);
        }

        // Clear detection state tracking
        detectionStates.delete(tabId);
        activeDetections.delete(tabId);
        interruptedDetections.delete(tabId);
        tabFocusTimestamps.delete(tabId);

        // Clear capture state if tab is closed during capture
        const captureStateForTab = reCaptchaCaptureState.get(tabId);
        if (captureStateForTab) {
            console.log(`Scrapfly Background: Tab ${tabId} closed during capture, cleaning up`);
            if (captureStateForTab.captureInterval) {
                clearInterval(captureStateForTab.captureInterval);
            }
            reCaptchaCaptureState.delete(tabId);
            stopRecaptchaInterception();
        }

        // Clear FunCaptcha capture state if tab is closed during capture
        if (funcaptchaCaptureState.has(tabId)) {
            console.log(`Scrapfly Background: Tab ${tabId} closed during FunCaptcha capture, cleaning up`);
            const funcState = funcaptchaCaptureState.get(tabId);
            if (funcState && funcState.timeout) {
                clearTimeout(funcState.timeout);
            }
            funcaptchaCaptureState.delete(tabId);
        }

        // Clear hCaptcha capture state if tab is closed during capture
        if (typeof hcaptchaCaptureState !== 'undefined' && hcaptchaCaptureState.has(tabId)) {
            console.log(`Scrapfly Background: Tab ${tabId} closed during hCaptcha capture, cleaning up`);
            const hcaptchaState = hcaptchaCaptureState.get(tabId);
            if (hcaptchaState && hcaptchaState.timeout) {
                clearTimeout(hcaptchaState.timeout);
            }
            hcaptchaCaptureState.delete(tabId);
        }

        // Clear Akamai capture state if tab is closed during capture
        if (akamaiCaptureState.has(tabId)) {
            console.log(`Scrapfly Background: Tab ${tabId} closed during Akamai capture, cleaning up`);
            const akamaiState = akamaiCaptureState.get(tabId);
            if (akamaiState && akamaiState.timeout) {
                clearTimeout(akamaiState.timeout);
            }
            akamaiCaptureState.delete(tabId);
        }

        // Clear Imperva capture state if tab is closed during capture
        if (impervaCaptureState.has(tabId)) {
            console.log(`Scrapfly Background: Tab ${tabId} closed during Imperva capture, cleaning up`);
            const impervaState = impervaCaptureState.get(tabId);
            if (impervaState && impervaState.timeout) {
                clearTimeout(impervaState.timeout);
            }
            impervaCaptureState.delete(tabId);
        }

        // Clear Shape Security capture state if tab is closed during capture
        if (typeof shapesecurityCaptureState !== 'undefined' && shapesecurityCaptureState.has(tabId)) {
            console.log(`Scrapfly Background: Tab ${tabId} closed during Shape Security capture, cleaning up`);
            const shapeState = shapesecurityCaptureState.get(tabId);
            if (shapeState && shapeState.timeout) {
                clearTimeout(shapeState.timeout);
            }
            shapesecurityCaptureState.delete(tabId);
        }

        // Clear AWS WAF capture state if tab is closed during capture
        if (typeof awsWafCaptureStateRef !== 'undefined' && awsWafCaptureStateRef.isCapturing && awsWafCaptureStateRef.tabId === tabId) {
            console.log(`Scrapfly Background: Tab ${tabId} closed during AWS WAF capture, cleaning up`);
            if (awsWafCaptureStateRef.timeout) {
                clearTimeout(awsWafCaptureStateRef.timeout);
            }
            // Reset AWS WAF state object
            awsWafCaptureStateRef.isCapturing = false;
            awsWafCaptureStateRef.tabId = null;
            awsWafCaptureStateRef.url = null;
            awsWafCaptureStateRef.capturedData = {};
        }

        // Clear the badge for this tab
        chrome.action.setBadgeText({
            text: '',
            tabId: tabId
        }).catch((error) => {
            // Expected: Tab might already be closed
            console.log(`[Cleanup] Failed to clear badge for removed tab ${tabId}:`, error.message);
        });
    });

    // Run detection when tab is updated
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        // Check if extension is disabled when page starts loading
        if (changeInfo.status === 'loading') {
            try {
                const result = await chrome.storage.local.get(['scrapfly_enabled']);
                if (result.scrapfly_enabled === false) {
                    console.log(`[TabUpdate] Extension is disabled - setting orange X badge for tab ${tabId}`);
                    chrome.action.setBadgeText({ text: '✕', tabId: tabId }).catch((error) => {
                        console.log(`[TabUpdate] Failed to set disabled badge for tab ${tabId}:`, error.message);
                    });
                    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId: tabId }).catch((error) => {
                        console.log(`[TabUpdate] Failed to set badge color for tab ${tabId}:`, error.message);
                    });
                }
            } catch (error) {
                console.error('[TabUpdate] Error checking enabled state:', error);
            }
        }

        // Detect URL changes within the same tab (same-tab navigation)
        if (changeInfo.url) {
            const newUrl = changeInfo.url;
            console.log(`[TabUpdate] URL change detected for tab ${tabId}: ${newUrl}`);

            // Clear cache tracking ONLY on URL change (not on F5 refresh)
            if (tabsUsingCache.has(tabId)) {
                tabsUsingCache.delete(tabId);
                console.log(`[TabUpdate] URL changed - cleared cache tracking for tab ${tabId}`);
            }

            // Check if there's an active detection for this tab
            if (activeDetections.has(tabId)) {
                const activeInfo = activeDetections.get(tabId);
                const oldUrl = activeInfo.url;

                console.log(`[TabUpdate] ⚠️ Tab ${tabId} had active detection for ${oldUrl} - ABORTING (navigated to ${newUrl})`);

                // Abort the detection process
                if (activeInfo.abortController) {
                    activeInfo.abortController.abort();
                    console.log(`[TabUpdate] 🛑 Aborted detection for tab ${tabId} (URL changed)`);
                }

                // Remove from active detections
                activeDetections.delete(tabId);

                // Mark detection state as interrupted (if it exists)
                const detectionState = detectionStates.get(tabId);
                if (detectionState && detectionState.url === oldUrl) {
                    detectionState.interrupted = true;
                    detectionState.error = 'url_changed';
                    console.log(`[TabUpdate] Marked detection state as interrupted for tab ${tabId}`);
                }

                // Clear badge (new page will set its own badge when detection completes)
                chrome.action.setBadgeText({ text: '', tabId: tabId }).catch((error) => {
                    console.log(`[TabUpdate] Failed to clear badge for tab ${tabId}:`, error.message);
                });
            }

            // Note: Detection state will be cleared by getOrCreateDetectionState when new detection starts
        }

        // Handle reCAPTCHA capture updates - only monitors active captures
        if (typeof reCaptchaHandleCaptureTabUpdate === 'function') {
            reCaptchaHandleCaptureTabUpdate(tabId, changeInfo, tab, chrome);
        }

        // Handle Akamai capture updates - only monitors active captures
        if (typeof akamaiHandleCaptureTabUpdate === 'function') {
            akamaiHandleCaptureTabUpdate(tabId, changeInfo, tab);
        }

        // Handle Imperva capture updates - only monitors active captures
        if (typeof impervaHandleCaptureTabUpdate === 'function') {
            impervaHandleCaptureTabUpdate(tabId, changeInfo, tab);
        }

        // Handle AWS WAF capture updates - only monitors active captures
        if (typeof awsWafHandleCaptureTabUpdate === 'function') {
            awsWafHandleCaptureTabUpdate(tabId, changeInfo, tab);
        }

        // Handle AWS WAF analysis updates
        if (typeof awsWafHandleAnalysisTabUpdate === 'function') {
            awsWafHandleAnalysisTabUpdate(tabId, changeInfo, tab);
        }
    });

    // Run detection when active tab changes - detect interruptions and delegate to DetectionEngineManager
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        const newTabId = activeInfo.tabId;
        const now = Date.now();
        
        console.log(`[TabSwitch] Tab activated: ${newTabId}, previous: ${currentActiveTab}`);

        // Check if user is returning to a previously interrupted tab - clear interrupted state
        if (interruptedDetections.has(newTabId)) {
            console.log(`[TabSwitch] ✅ User returned to tab ${newTabId} - clearing any stale interrupted state`);
            interruptedDetections.delete(newTabId);
            // Don't modify badge here - let popup query get fresh data and update badge appropriately
        }

        // Check if previous tab had an active detection that should be interrupted
        if (currentActiveTab !== null && activeDetections.has(currentActiveTab)) {
            const previousTabId = currentActiveTab;

            // FIX: Only interrupt if new tab is a valid content tab (not popup/devtools/etc)
            // This prevents false interruptions when popup opens on same webpage
            try {
                const newTab = await chrome.tabs.get(newTabId);
                // Skip interruption if new tab is not a valid content tab
                if (!newTab || !newTab.url || newTab.url.startsWith('chrome://') || newTab.url.startsWith('chrome-extension://')) {
                    console.log(`[TabSwitch] ℹ️ New tab ${newTabId} is not a valid content tab (url: ${newTab?.url || 'none'}) - skipping interruption`);
                    // Update current active tab and continue without interrupting
                    currentActiveTab = newTabId;
                    return;
                }
            } catch (error) {
                console.log(`[TabSwitch] Failed to validate new tab ${newTabId}:`, error.message);
                // On error, assume it's invalid and skip interruption
                currentActiveTab = newTabId;
                return;
            }

            const previousFocusTime = tabFocusTimestamps.get(previousTabId);
            const focusDuration = previousFocusTime ? now - previousFocusTime : 0;

            // FIX: Let detections complete in background when tab switches
            // Chrome tabs continue executing even when not focused
            // Detection will complete naturally and cache results
            if (focusDuration < TAB_SWITCH_DEBOUNCE_MS) {
                console.log(`[TabSwitch] ⚡ Tab ${previousTabId} was focused for only ${focusDuration}ms - rapid switch detected`);
            } else {
                console.log(`[TabSwitch] ℹ️ Tab ${previousTabId} detection will continue in background (user switched tabs)`);
                // Don't abort, don't interrupt - just let it complete naturally
                // Detection will cache results when finished
            }
        }

        // Record focus timestamp for the newly activated tab
        tabFocusTimestamps.set(newTabId, now);

        // Update current active tab
        currentActiveTab = newTabId;

        // Delegate to DetectionEngineManager for normal tab activation handling
        await DetectionEngineManager.handleTabActivation(activeInfo, {
            chrome,
            Settings,
            CategoryManager,
            Utils,                 // FIX: Pass Utils for blacklist checking
            categoryManager,
            interruptedDetections, // Pass interrupted detections map
            activeDetections,      // TAB SWITCH FIX: Pass active detection tracking
            detectionStates,       // TAB SWITCH FIX: Pass detection state tracking
            manuallyClearedCaches  // Pass manually cleared caches Set
        });
    });
}

/**
 * Initialize background script services
 * This is called after detector manager initialization
 */
function initializeServices() {
    console.log('Scrapfly Background: Initializing services...');

    // Setup all listeners and services
    setupHeaderCapture();
    setupMessageListeners();
    setupTabListeners();

    console.log('Scrapfly Background: Services initialization complete');
}
