/**
 * Centralized constants for the Scrapfly extension.
 * All timing values, size limits, and retry configurations in one place.
 */

const Constants = Object.freeze({
    // ─── TTL Values (milliseconds) ─────────────────────────────────────────────
    NETWORK_DATA_TTL: 300000,              // 5 min - headers, cookies, payloads, URLs
    CAPTURE_STATE_TTL: 1800000,            // 30 min - advanced capture states
    ACTIVE_DETECTION_TTL: 600000,          // 10 min - active detection tracking
    ANALYSIS_CACHE_TTL: 300000,            // 5 min - detection engine analysis cache
    MATCH_CACHE_TTL: 300000,               // 5 min - pattern match result cache
    ENABLED_CACHE_TTL: 5000,               // 5 sec - extension enabled state cache

    // ─── Map Size Limits ───────────────────────────────────────────────────────
    CAPTURE_STATE_MAX_SIZE: 100,           // capture state maps
    RECENT_REQUESTS_MAX_SIZE: 200,         // recent detection requests
    DETECTION_MAP_MAX_SIZE: 50,            // active/interrupted/state maps
    PATTERN_CACHE_MAX_SIZE: 500,           // compiled regex patterns
    URL_HASH_CACHE_MAX_SIZE: 1000,         // URL hash cache

    // ─── Detection Timing (milliseconds) ───────────────────────────────────────
    MIN_DETECTION_TIME: 500,               // minimum before finalization
    BATCH_SETTLE_TIME: 250,                // hook batch debounce window
    FINALIZATION_CHECK_DELAY: 400,         // finalization check timeout
    DETECTION_TIMEOUT: 10000,              // 10 sec - detection timeout
    REQUEST_DETECTION_PENDING_TIMEOUT: 15000, // max time to keep a pre-collection pending marker
    SAFETY_TIMEOUT: 5000,                  // 5 sec - safety fallback
    DETECTION_SKIP_THRESHOLD: 2000,        // skip detection for recent requests
    DEFAULT_HOOKS_MAX_DETECTION_MS: 8000,  // max time for JS hooks detection
    HOOKS_DEADLINE_BUFFER_MS: 200,         // buffer added to hooks deadline

    // ─── Retry Configuration ───────────────────────────────────────────────────
    DETECTOR_LOAD_MAX_RETRIES: 20,         // max retries for detector loading
    DETECTOR_LOAD_RETRY_DELAY: 300,        // ms between retries
    FETCH_TIMEOUT: 5000,                   // network fetch timeout

    // ─── Performance Limits ────────────────────────────────────────────────────
    COOKIE_VALUE_MAX_LENGTH: 100,          // cookie value substring limit
    MAX_PAYLOADS_PER_TAB: 50,              // payload capture limit
    MAX_NETWORK_URLS_PER_TAB: 200,         // network URL capture limit

    // ─── Tab Management ────────────────────────────────────────────────────────
    RECENTLY_CLEARED_TAB_TIMEOUT: 10000,   // 10 sec (standardized)

    // ─── Capture Auto-Stop ─────────────────────────────────────────────────────
    CAPTURE_AUTO_STOP_TIMEOUT: 60000,      // 60 sec - all providers

    // ─── Update Check ──────────────────────────────────────────────────────────
    UPDATE_CHECK_DELAY: 5000,              // initial delay after startup
    UPDATE_FETCH_TIMEOUT: 15000,           // remote fetch timeout
    UPDATE_CHECK_TIMEOUT: 30000,           // overall update check timeout
    DEFAULT_CACHE_EXPIRY_HOURS: 12,        // detection cache expiry

    // ─── Notification Timing ─────────────────────────────────────────────────
    NOTIFICATION_DURATION: 3000,           // default toast notification display
    NOTIFICATION_FADE_MS: 300,             // fade-out animation / removal delay

    // ─── Log Collector Limits ────────────────────────────────────────────────
    LOG_COLLECTOR_MAX_LOGS: 5000,          // max entries in memory buffer
    LOG_COLLECTOR_MAX_PERSISTED: 1000,     // max entries persisted to storage
    LOG_COLLECTOR_RATE_LIMIT: 40,          // max logs per second

    // ─── Worker Keepalive ────────────────────────────────────────────────────
    KEEPALIVE_PERIOD_MS: 20000,            // 20s keepalive ping interval
    STALE_OPERATION_MS: 120000,            // 2 min stale operation threshold
});

if (typeof globalThis !== 'undefined') {
    globalThis.Constants = Constants;
}
