/**
 * Background service worker bootstrap.
 * Loads all scripts in dependency order via importScripts().
 */

// ─── Manager References ─────────────────────────────────────────────────────
// Manager references declared before importScripts() due to temporal dead zone

var detectorManager = null;
var categoryManager = null;
var detectionEngine = null;
var workerKeepaliveManager = null;
var initializationInProgress = false;
var initializationPromise = null;

importScripts(
    // Core utilities
    './modules/core/logger.js',
    './modules/core/i18n.js',
    './modules/core/constants.js',
    './modules/core/hooks-config.js',
    './modules/core/bridge-protocol.js',
    './modules/core/badge-constants.js',
    './modules/core/message-types.js',
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
    './modules/detection/detection-combinations.js',
    './modules/detection/engine/detection-engine-analysis.js',
    './modules/detection/engine/detection-engine-extractors.js',
    './modules/detection/engine/detection-engine-matching.js',
    './modules/detection/engine/detection-engine-hooks.js',
    './modules/detection/engine/detection-engine-manager.js',
    // UI and settings
    './modules/ui/notification-manager.js',
    './modules/core/update-manager.js',
    './modules/detection/hooks/worker-keepalive-manager.js',
    './modules/core/history-store.js',
    './sections/history/history.js',
    './modules/core/webhook-body.js',
    './sections/settings/settings-runtime.js',
    // Interceptors
    './sections/advanced/base-interceptor-helpers.js',
    './sections/advanced/advanced-history-store.js',
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
    './background/scan-report.js',
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
    './background/history-retention.js',
    './background/detection-cache-retention.js',
    './background/init.js'
);

Logger.background('Logger initialized in BACKGROUND context');

// ─── Network Data Stores ────────────────────────────────────────────────────

const headersStore = new TTLMap(Constants.NETWORK_DATA_TTL);
const requestHeadersStore = new TTLMap(Constants.NETWORK_DATA_TTL);
const responseCookiesStore = new TTLMap(Constants.NETWORK_DATA_TTL);
const payloadStore = new TTLMap(Constants.NETWORK_DATA_TTL);
const networkUrlsStore = new TTLMap(Constants.NETWORK_DATA_TTL);

// ─── Advanced Capture States ────────────────────────────────────────────────

const reCaptchaCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const akamaiCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const impervaCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const funcaptchaCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const hcaptchaCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const shapesecurityCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const shapeSecurityExtractionState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const awsWafCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);

// ─── Detection Tracking ─────────────────────────────────────────────────────

const recentDetectionRequests = new TTLMap(Constants.NETWORK_DATA_TTL, Constants.RECENT_REQUESTS_MAX_SIZE);
const activeDetections = new TTLMap(Constants.ACTIVE_DETECTION_TTL, Constants.DETECTION_MAP_MAX_SIZE);
const interruptedDetections = new TTLMap(Constants.NETWORK_DATA_TTL, Constants.DETECTION_MAP_MAX_SIZE);
const detectionStates = new TTLMap(Constants.NETWORK_DATA_TTL, Constants.DETECTION_MAP_MAX_SIZE);

// ─── Finalization Control ────────────────────────────────────────────────────

const finalizationDebounce = new Map();
const batchProcessingFlags = new Map();

// ─── Tab Tracking ────────────────────────────────────────────────────────────

let currentActiveTab = null;

// ─── Cache Tracking ─────────────────────────────────────────────────────────

const tabsUsingCache = new Set();
const recentlyClearedTabs = new Set();
const manuallyClearedCaches = new Set();


// ─── Extension Enabled State Cache ──────────────────────────────────────────

let cachedEnabledState = { value: true, timestamp: 0 };

async function isExtensionEnabled() {
    const now = Date.now();
    if (now - cachedEnabledState.timestamp < Constants.ENABLED_CACHE_TTL) {
        return cachedEnabledState.value;
    }
    const result = await chrome.storage.local.get(['scrapfly_enabled']);
    cachedEnabledState = {
        value: result.scrapfly_enabled !== false,
        timestamp: now
    };
    return cachedEnabledState.value;
}

// ─── JS Hooks Config Cache ───────────────────────────────────────────────────
// Same resolution the content script sends to the MAIN world, so the hooks
// deadline here always matches the page's MAX_DETECTION_MS (overrides included).

let cachedHooksConfig = HooksConfig.defaults;

// Utils.getSettings also refreshes the Logger flags (debug, verbose, collector),
// so every settings change reaches the worker's logging without a storage read per line
async function refreshHooksConfig() {
    try {
        cachedHooksConfig = HooksConfig.fromSettings(await Utils.getSettings(chrome));
    } catch (error) {
        cachedHooksConfig = HooksConfig.defaults;
    }
}
refreshHooksConfig();

function getHooksDeadline(startTime) {
    return startTime + cachedHooksConfig.MAX_DETECTION_MS + Constants.HOOKS_DEADLINE_BUFFER_MS;
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.scrapfly_enabled) {
        cachedEnabledState = {
            value: changes.scrapfly_enabled.newValue !== false,
            timestamp: Date.now()
        };
    }
    if (namespace === 'local' && changes.scrapfly_settings) {
        refreshHooksConfig();
    }
});

// ─── Detection State Constants & Helpers ────────────────────────────────────


async function ensureHooksDeadline(state) {
    if (!state) return getHooksDeadline(Date.now());
    if (state.hooksDeadline) {
        return state.hooksDeadline;
    }

    const startTime = state.startTime || Date.now();
    state.hooksMaxMs = cachedHooksConfig.MAX_DETECTION_MS;
    state.hooksDeadline = getHooksDeadline(startTime);
    state.hooksDeadlineSource = 'default';
    return state.hooksDeadline;
}

function generateMatchKey(match) {
    // Combination detectors: two rows can match the same cookie or header
    // and each is its own condition, so the row is part of the key
    const key = generateMatchKeyByValue(match);
    return match.patternId ? `${match.patternId}|${key}` : key;
}

function generateMatchKeyByValue(match) {
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
            hooksDeadline: getHooksDeadline(startTime),
            hooksMaxMs: cachedHooksConfig.MAX_DETECTION_MS,
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

// ─── Synchronous Listener Registration (MV3 cold-start safety) ───────────────
// Register webRequest / runtime.onMessage / tabs listeners synchronously during
// the first turn of the service worker, so an event that revives a terminated
// worker is never dropped. Heavy detector initialization stays lazy: it runs via
// onInstalled / onStartup / the startup IIFE in init.js, and message handlers
// call ensureDetectorManagerInitialized() before using managers. Guarded by
// `servicesInitialized` so it is safe even if invoked more than once.
initializeServices();
