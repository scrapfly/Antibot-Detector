/**
 * MAIN-world tuning (JS-hook timing, window-property polling, debug-log
 * throttling): the single source of truth.
 *
 * Each key is declared once with its default and its allowed range. The
 * ISOLATED content script resolves the user's overrides against this schema and
 * hands the MAIN world a complete, clamped config; the background worker uses
 * the same resolution for its hooks deadline, so both sides always agree.
 *
 * Overrides live in settings.detection.hooksConfig (legacy: settings.hooksConfig,
 * which still wins when present, as in 2.7). Unknown keys are ignored.
 */

const HooksConfig = (() => {
    const SCHEMA = Object.freeze({
        // Quiet period after the last hook fire before detection completes
        ACTIVITY_TIMEOUT_MS:   Object.freeze({ default: 2000,  min: 250,  max: 20000 }),
        // Hard cap on how long the MAIN world monitors hooks
        MAX_DETECTION_MS:      Object.freeze({ default: 8000,  min: 1000, max: 60000 }),
        // Floor for the monitoring window (effective min = clamp(max(this, 2 × activity), ≤ max detection))
        MIN_MONITOR_MS:        Object.freeze({ default: 4000,  min: 0,    max: 60000 }),
        // Ignore repeated install events closer together than this
        INSTALL_DEBOUNCE_MS:   Object.freeze({ default: 250,   min: 0,    max: 2000 }),

        // MAIN-world debug-log throttle (the ISOLATED relay applies the same cap)
        LOG_RATE_WINDOW_MS:                Object.freeze({ default: 1000, min: 100, max: 60000 }),
        LOG_MAX_PER_WINDOW:                Object.freeze({ default: 20,   min: 1,   max: 1000 }),
        // Stricter cap while the log collector is recording (it keeps every line)
        LOG_MAX_PER_WINDOW_WITH_COLLECTOR: Object.freeze({ default: 5,    min: 1,   max: 1000 }),
        // Longer MAIN-world debug-log messages are truncated
        LOG_MAX_MESSAGE_LENGTH:            Object.freeze({ default: 1000, min: 100, max: 20000 }),
        // An object argument of a MAIN-world debug log shows at most this many of its keys
        LOG_OBJECT_PREVIEW_KEYS:           Object.freeze({ default: 6,    min: 0,   max: 100 }),

        // Longest page value (as a string) copied into a window-property detection report
        REPORTED_VALUE_MAX_CHARS:          Object.freeze({ default: 100,  min: 10,  max: 10000 }),

        // Window-property tracker: adaptive polling phases, in order (duration, then poll interval)
        // EARLY: properties defined by inline/early scripts
        WINDOW_PHASE_EARLY_MS:            Object.freeze({ default: 2000,  min: 0,  max: 60000 }),
        WINDOW_PHASE_EARLY_INTERVAL_MS:   Object.freeze({ default: 100,   min: 20, max: 5000 }),
        // NORMAL: typical script loading
        WINDOW_PHASE_NORMAL_MS:           Object.freeze({ default: 8000,  min: 0,  max: 60000 }),
        WINDOW_PHASE_NORMAL_INTERVAL_MS:  Object.freeze({ default: 200,   min: 20, max: 5000 }),
        // LATE: lazy-loaded scripts
        WINDOW_PHASE_LATE_MS:             Object.freeze({ default: 20000, min: 0,  max: 120000 }),
        WINDOW_PHASE_LATE_INTERVAL_MS:    Object.freeze({ default: 500,   min: 20, max: 5000 }),
        // FINAL: very late properties; the four durations add up to the polling session (60 s by default)
        WINDOW_PHASE_FINAL_MS:            Object.freeze({ default: 30000, min: 0,  max: 120000 }),
        WINDOW_PHASE_FINAL_INTERVAL_MS:   Object.freeze({ default: 1000,  min: 20, max: 5000 }),

        // Window-property retries. Parent path missing (may appear as scripts load): linear backoff
        WINDOW_RETRY_PATH_MAX:            Object.freeze({ default: 100,  min: 0,  max: 1000 }),
        WINDOW_RETRY_PATH_BASE_MS:        Object.freeze({ default: 100,  min: 0,  max: 10000 }),
        WINDOW_RETRY_PATH_MAX_DELAY_MS:   Object.freeze({ default: 1000, min: 0,  max: 60000 }),
        // Getter threw (usually temporary): exponential backoff
        WINDOW_RETRY_GETTER_MAX:          Object.freeze({ default: 10,   min: 0,  max: 1000 }),
        WINDOW_RETRY_GETTER_BASE_MS:      Object.freeze({ default: 50,   min: 0,  max: 10000 }),
        WINDOW_RETRY_GETTER_MULTIPLIER:   Object.freeze({ default: 1.5,  min: 1,  max: 10 }),
        WINDOW_RETRY_GETTER_MAX_DELAY_MS: Object.freeze({ default: 2000, min: 0,  max: 60000 }),
        // Property absent or condition not met yet: linear backoff
        WINDOW_RETRY_ABSENT_MAX:          Object.freeze({ default: 50,   min: 0,  max: 1000 }),
        WINDOW_RETRY_ABSENT_BASE_MS:      Object.freeze({ default: 200,  min: 0,  max: 10000 }),
        WINDOW_RETRY_ABSENT_MAX_DELAY_MS: Object.freeze({ default: 2000, min: 0,  max: 60000 }),
        // Extra delay added per retry by the linear backoffs
        WINDOW_RETRY_STEP_MS:             Object.freeze({ default: 50,   min: 0,  max: 5000 })
    });

    const KEYS = Object.freeze(Object.keys(SCHEMA));

    function clamp(value, { default: fallback, min, max }) {
        if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.min(max, Math.max(min, num));
    }

    /** Complete, clamped, frozen config from a (possibly partial or garbage) override object. */
    function resolve(overrides) {
        const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
        const resolved = {};
        for (const key of KEYS) {
            resolved[key] = clamp(source[key], SCHEMA[key]);
        }
        return Object.freeze(resolved);
    }

    /** Resolve from a settings object, honouring the legacy top-level location first. */
    function fromSettings(settings) {
        return resolve(settings?.hooksConfig || settings?.detection?.hooksConfig);
    }

    /** Minimum time the MAIN world keeps monitoring before an activity timeout may complete it. */
    function minMonitorMs(config) {
        return Math.min(config.MAX_DETECTION_MS, Math.max(config.MIN_MONITOR_MS, config.ACTIVITY_TIMEOUT_MS * 2));
    }

    return Object.freeze({ SCHEMA, KEYS, resolve, fromSettings, minMonitorMs, defaults: resolve({}) });
})();

if (typeof globalThis !== 'undefined') {
    globalThis.HooksConfig = HooksConfig;
}
