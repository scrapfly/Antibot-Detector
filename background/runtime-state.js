var detectorManager = null;
var categoryManager = null;
var detectionEngine = null;
var workerKeepaliveManager = null;
var initializationInProgress = false;
var initializationPromise = null;
/** Worker-owned state and runtime configuration. Load before listeners and startup. */
var detectorInitializationPromise = null;

// ─── Network Data Stores ────────────────────────────────────────────────────

const headersStore = new TTLMap(Constants.NETWORK_DATA_TTL);
const requestHeadersStore = new TTLMap(Constants.NETWORK_DATA_TTL);
const responseCookiesStore = new TTLMap(Constants.NETWORK_DATA_TTL);
const payloadStore = new TTLMap(Constants.NETWORK_DATA_TTL);
const networkUrlsStore = new TTLMap(Constants.NETWORK_DATA_TTL);
// Response bodies payload rules marked body: "response" read, captured in the page
const responseStore = new TTLMap(Constants.NETWORK_DATA_TTL);

// ─── Advanced Capture States ────────────────────────────────────────────────

const reCaptchaCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const akamaiCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const impervaCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const funcaptchaCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const hcaptchaCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const shapesecurityCaptureState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);
const shapeSecurityExtractionState = new TTLMap(Constants.CAPTURE_STATE_TTL, Constants.CAPTURE_STATE_MAX_SIZE);

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
        // Turning auto-update on/off or changing its interval takes effect now,
        // not at the next browser start. Other settings writes (including the
        // update check's own timestamp) must not reset the alarm.
        if (updateScheduleOf(changes.scrapfly_settings.oldValue) !== updateScheduleOf(changes.scrapfly_settings.newValue)) {
            UpdateManager.scheduleCheck();
        }
    }
});

// "autoUpdate|interval" from a stored scrapfly_settings value ({ settings } as JSON)
function updateScheduleOf(stored) {
    try {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        const updates = (parsed && (parsed.settings || parsed).updates) || {};
        return `${updates.autoUpdate === true}|${updates.checkIntervalHours || ''}`;
    } catch (_) {
        return '';
    }
}

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

function sendProgressUpdate(tabId, methodName, completedMethods) {
    try {
        const state = detectionStates.get(tabId);
        if (!state || state.finalized || state.failed || state.interrupted) {
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
        chrome.tabs.sendMessage(tabId, progressMessage, state.documentId ? { documentId: state.documentId } : {}).catch(() => {});
    } catch (e) {
        Logger.error('DETECTION', '[Progress] Error sending update:', e);
    }
}
