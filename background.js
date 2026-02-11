/**
 * Background service worker bootstrap.
 * Loads all scripts in dependency order via importScripts().
 */

// ─── Manager References ─────────────────────────────────────────────────────
// IMPORTANT: Declare BEFORE importScripts() because init.js contains an IIFE
// that calls initialize() which sets these variables. If declared after
// importScripts(), the `= null` assignment runs AFTER the IIFE has already
// set valid instances, overwriting them and causing null reference errors.

var detectorManager = null;
var categoryManager = null;
var detectionEngine = null;
var workerKeepaliveManager = null;
var initializationInProgress = false;
var initializationPromise = null;

importScripts(
    // Core utilities
    './modules/core/logger.js',
    './modules/core/badge-constants.js',
    './modules/core/log-collector.js',
    './modules/core/ttl-map.js',
    './utils/format-utils.js',
    './utils/url-utils.js',
    './utils/detection-utils.js',
    './utils/utils.js',
    './utils/pattern-cache.js',
    './modules/core/storage-manager.js',
    // Detection engine
    './modules/detection/managers/category-manager.js',
    './modules/detection/managers/detector-manager.js',
    './modules/detection/managers/confidence-manager.js',
    './modules/detection/engine/detection-engine-analysis.js',
    './modules/detection/engine/detection-engine-extractors.js',
    './modules/detection/engine/detection-engine-matching.js',
    './modules/detection/engine/detection-engine-hooks.js',
    './modules/detection/engine/detection-engine-manager.js',
    // UI and settings
    './modules/ui/notification-manager.js',
    './modules/core/update-manager.js',
    './modules/detection/hooks/worker-keepalive-manager.js',
    './sections/history/history.js',
    './sections/settings/settings-runtime.js',
    // Interceptors
    './sections/advanced/base-interceptor-helpers.js',
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
    // Background runtime modules
    './background/header-capture.js',
    './background/utilities.js',
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
);

Logger.background('Logger initialized in BACKGROUND context');

// ─── Network Data Stores (5 min TTL) ────────────────────────────────────────

const headersStore = new TTLMap(300000);
const requestHeadersStore = new TTLMap(300000);
const responseCookiesStore = new TTLMap(300000);
const payloadStore = new TTLMap(300000);
const networkUrlsStore = new TTLMap(300000);

// ─── Advanced Capture States (30 min TTL, max 100) ──────────────────────────

const reCaptchaCaptureState = new TTLMap(1800000, 100);
const akamaiCaptureState = new TTLMap(1800000, 100);
const impervaCaptureState = new TTLMap(1800000, 100);
const funcaptchaCaptureState = new TTLMap(1800000, 100);

// ─── Detection Tracking ─────────────────────────────────────────────────────

const recentDetectionRequests = new TTLMap(300000, 200);
const activeDetections = new TTLMap(600000, 50);
const interruptedDetections = new TTLMap(300000, 50);
const detectionStates = new TTLMap(300000, 50);

// ─── Finalization Control ────────────────────────────────────────────────────

const finalizationDebounce = new Map();
const batchProcessingFlags = new Map();

// ─── Tab Tracking ────────────────────────────────────────────────────────────

let currentActiveTab = null;
const tabFocusTimestamps = new Map();
const TAB_SWITCH_DEBOUNCE_MS = 500;

// ─── Cache Tracking ─────────────────────────────────────────────────────────

const tabsUsingCache = new Set();
const recentlyClearedTabs = new Set();
const manuallyClearedCaches = new Set();

// ─── Manager References ─────────────────────────────────────────────────────
// Declared before importScripts() above. See comment there for explanation.

// ─── Extension Enabled State Cache ──────────────────────────────────────────

let cachedEnabledState = { value: true, timestamp: 0 };
const ENABLED_CACHE_TTL = 5000;

async function isExtensionEnabled() {
    const now = Date.now();
    if (now - cachedEnabledState.timestamp < ENABLED_CACHE_TTL) {
        return cachedEnabledState.value;
    }
    const result = await chrome.storage.local.get(['scrapfly_enabled']);
    cachedEnabledState = {
        value: result.scrapfly_enabled !== false,
        timestamp: now
    };
    return cachedEnabledState.value;
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.scrapfly_enabled) {
        cachedEnabledState = {
            value: changes.scrapfly_enabled.newValue !== false,
            timestamp: Date.now()
        };
    }
});

// ─── Detection State Constants & Helpers ────────────────────────────────────

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

function generateMatchKey(match) {
    const matchType = (match.type || '').toLowerCase();

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

    if (existingState && existingState.url !== url) {
        if (activeDetections.has(tabId)) {
            const activeInfo = activeDetections.get(tabId);
            if (activeInfo.abortController) {
                activeInfo.abortController.abort();
            }
            activeDetections.delete(tabId);
        }

        if (workerKeepaliveManager) {
            workerKeepaliveManager.endOperationsForTab(tabId);
        }

        existingState.interrupted = true;
        existingState.error = 'url_changed';

        if (finalizationDebounce.has(tabId)) {
            clearTimeout(finalizationDebounce.get(tabId));
            finalizationDebounce.delete(tabId);
        }

        detectionStates.delete(tabId);
    }

    if (!detectionStates.has(tabId)) {
        const startTime = Date.now();
        const newState = {
            url: url,
            tabTitle: null,
            hooksData: new Map(),
            mainData: [],
            completedMethods: new Set(),
            methodOrder: ['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload'],
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

        if (workerKeepaliveManager) {
            workerKeepaliveManager.startOperation(`detection-${tabId}`, {
                tabId,
                reason: 'page_detection'
            });
        }
    }
    return detectionStates.get(tabId);
}

function sendProgressUpdate(tabId, methodName, completedMethods) {
    try {
        const state = detectionStates.get(tabId);
        if (!state || state.finalized) {
            return;
        }

        const progressMessage = {
            type: 'DETECTION_PROGRESS',
            tabId: tabId,
            progress: {
                method: methodName,
                completedMethods: Array.from(completedMethods),
                message: `Checked ${methodName}`
            }
        };

        chrome.runtime.sendMessage(progressMessage).catch(() => {});
        chrome.tabs.sendMessage(tabId, progressMessage).catch(() => {});
    } catch (e) {
        Logger.error('DETECTION', '[Progress] Error sending update:', e);
    }
}
