/**
 * Bridge protocol between the MAIN world (content-main-world.js and its
 * helpers), the ISOLATED content script and the background worker: the single
 * place every event name, message type, completion reason and shared global key
 * is spelled.
 *
 * Loaded by the ISOLATED content script, the background (importScripts) and the
 * popup as the `ScrapflyBridgeProtocol` global. It is NOT loaded into the MAIN
 * world: that world shares its global object with the page (a new page-visible
 * global), and Chrome injects a file only once per frame across all
 * content_scripts entries, so it could not be listed for both worlds anyway.
 * Instead content.js hands the whole object to the MAIN world in the
 * EVENTS.BRIDGE_INIT event it fires at document_start, before any page script;
 * that event name is the only protocol string the MAIN world spells (pinned by
 * test/bridge-protocol-guard.test.js).
 *
 * Payload shapes (property names are plain, not part of this table):
 *   install event detail: { hookDefinitions, windowProperties, debugMode,
 *     logCollectorEnabled, enableJsApi, fingerprintEnabled, hooksConfig, [FIELDS.TOKEN] }
 *   WINDOW_DETECTIONS: { detections, timestamp, elapsedMs? }
 *   WINDOW_PROPS_COMPLETE: { url, timestamp, detectedCount, totalChecked?, elapsedMs?, reason? }
 *   JS_HOOK_DETECTION: { detection: { detectorId, detectorName, category, hook, timestamp }, url }
 *   JS_HOOKS_COMPLETE: { url, timestamp, totalDetections, uniqueHooks, completionReason, completionTime, uninstallStats }
 *   HOOK_FAILURE_REPORT: { target, failureType, message, timestamp }
 *   SCRAPFLY_DEBUG_LOG: { level, message, source, timestamp }
 *   SCRAPFLY_JS_API_EVENT: { eventName, detail }
 */

(function initBridgeProtocol(root) {
    'use strict';

    if (root.ScrapflyBridgeProtocol) return;

    const deepFreeze = (value) => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            for (const key of Object.keys(value)) deepFreeze(value[key]);
            Object.freeze(value);
        }
        return value;
    };

    // Every message `type` crossing the bridge or forwarded from it
    const MESSAGE_TYPES = {
        // ISOLATED -> MAIN
        PAGE_READY: 'SCRAPFLY_PAGE_READY',
        CACHE_HIT: 'SCRAPFLY_CACHE_HIT',
        DISABLE_MONITORING: 'DISABLE_MONITORING',
        STOP_WINDOW_POLLING: 'STOP_WINDOW_POLLING',
        JS_API_EVENT: 'SCRAPFLY_JS_API_EVENT',
        // MAIN -> ISOLATED (most are forwarded to the background under the same type)
        HOOK_FAILURE_REPORT: 'HOOK_FAILURE_REPORT',
        WINDOW_DETECTIONS: 'WINDOW_DETECTIONS',
        DEBUG_LOG: 'SCRAPFLY_DEBUG_LOG',
        JS_HOOK_DETECTION: 'JS_HOOK_DETECTION',
        JS_HOOKS_COMPLETE: 'JS_HOOKS_COMPLETE',
        WINDOW_PROPS_COMPLETE: 'WINDOW_PROPS_COMPLETE',
        // ISOLATED <-> background only
        JS_HOOK_DETECTION_BATCH: 'JS_HOOK_DETECTION_BATCH',
        CACHE_HIT_DISABLE_MONITORING: 'CACHE_HIT_DISABLE_MONITORING'
    };

    const T = MESSAGE_TYPES;

    const protocol = deepFreeze({
        EVENTS: {
            // ISOLATED -> MAIN bootstrap: hands over this protocol and the per-page token
            BRIDGE_INIT: 'scrapfly-bridge-init',
            // ISOLATED -> MAIN: control messages (TO_MAIN_TYPES)
            ISOLATED_TO_MAIN: 'scrapfly-isolated-bridge-message',
            // MAIN -> ISOLATED: reports (TO_ISOLATED_TYPES)
            MAIN_TO_ISOLATED: 'scrapfly-main-bridge-message',
            // ISOLATED -> MAIN: detector definitions + hooksConfig
            INSTALL_HOOKS: 'scrapfly-install-hooks',
            // Prefix of the page-facing JS API CustomEvents (scrapfly:onDetection, ...)
            JS_API_PREFIX: 'scrapfly:'
        },
        FIELDS: {
            // Carried on every bridge payload; payloads without the page's token are dropped
            TOKEN: '__scrapflyBridgeToken'
        },
        // What a well-formed bridge token looks like (content.js mints 32 hex
        // chars); the MAIN world adopts no bootstrap whose token is outside this
        BRIDGE_TOKEN: {
            MIN_LENGTH: 16,
            MAX_LENGTH: 128,
            PATTERN: '^[A-Za-z0-9_-]+$'
        },
        MESSAGE_TYPES,
        // Types the MAIN world accepts from the ISOLATED world
        TO_MAIN_TYPES: [T.PAGE_READY, T.CACHE_HIT, T.DISABLE_MONITORING, T.STOP_WINDOW_POLLING, T.JS_API_EVENT],
        // Types the ISOLATED world accepts from the MAIN world
        TO_ISOLATED_TYPES: [
            T.HOOK_FAILURE_REPORT, T.WINDOW_DETECTIONS, T.DEBUG_LOG,
            T.JS_HOOK_DETECTION, T.JS_HOOKS_COMPLETE, T.WINDOW_PROPS_COMPLETE
        ],
        COMPLETION_REASONS: {
            // JS_HOOKS_COMPLETE.completionReason
            HOOKS: {
                ACTIVITY_TIMEOUT: 'activity_timeout',
                MAX_TIMEOUT: 'max_timeout',
                NO_HOOKS: 'no_hooks',
                CACHE_HIT: 'cache_hit'
            },
            // WINDOW_PROPS_COMPLETE.reason
            WINDOW: {
                CACHE_HIT: 'cache_hit',
                MAX_DURATION: 'max_duration',
                ALL_TERMINAL: 'all_terminal',
                NO_CONFIG: 'no_config',
                // The window-property tracker did not load (manifest broken)
                TRACKER_UNAVAILABLE: 'tracker_unavailable'
            }
        },
        // .reason on ISOLATED -> MAIN control messages
        CONTROL_REASONS: {
            DETECTION_COMPLETE: 'detection_complete',
            CACHE_HIT: 'cache_hit'
        },
        // HOOK_FAILURE_REPORT.message for failures that have no reason code
        HOOK_FAILURE_MESSAGES: {
            // The wrapper was defined but is not what the property holds afterwards
            VERIFICATION_FAILED: 'Hook installed but verification failed',
            // Prefix of the exception text when resolving a target threw
            EXCEPTION_PREFIX: 'ERROR: '
        },
        // HOOK_FAILURE_REPORT.failureType
        HOOK_FAILURE_TYPES: {
            INSTALL_FAILED: 'INSTALL_FAILED',
            VERIFICATION_FAILED: 'VERIFICATION_FAILED'
        },
        // Why a hook target could (not) be installed (HOOK_FAILURE_REPORT.message)
        HOOK_FAILURE_REASONS: {
            INVALID_PATH: 'INVALID_PATH',
            PATH_NOT_FOUND: 'PATH_NOT_FOUND',
            PROPERTY_NOT_FOUND: 'PROPERTY_NOT_FOUND',
            NOT_CONFIGURABLE: 'NOT_CONFIGURABLE',
            NOT_WRITABLE: 'NOT_WRITABLE',
            NOT_HOOKABLE: 'NOT_HOOKABLE',
            CONSTRUCTOR_TARGET_NOT_HOOKABLE: 'CONSTRUCTOR_TARGET_NOT_HOOKABLE',
            OK_ACCESSOR: 'OK_ACCESSOR',
            OK_METHOD: 'OK_METHOD'
        },
        // Debug logging from the MAIN world (SCRAPFLY_DEBUG_LOG .level/.source and
        // the prefix of .message)
        LOG: {
            LEVELS: { LOG: 'log', WARN: 'warn', ERROR: 'error' },
            SOURCES: { MAIN_WORLD: 'content-main-world', WINDOW_TRACKER: 'window-property-tracker' },
            PREFIXES: { MAIN_WORLD: '[MAIN_WORLD] [Hooks]', WINDOW_TRACKER: '[WindowPropertyTracker]' }
        },
        // How a matched window property's value is reported (detection.property)
        REPORTED_VALUE: {
            // actualType of null (typeof says 'object')
            NULL_TYPE: 'null',
            // actualValue of any object: page objects are never copied into reports
            OBJECT: '[object]'
        },
        // MAIN-world identity and conventions
        MAIN_WORLD: {
            // The script that installs the hook wrappers, as error filenames and
            // stacks name it: only illegal-invocation noise from it is silenced
            HOOKS_SCRIPT: 'content-main-world.js',
            // Separator of dotted hook targets and window paths in detector data
            PATH_SEPARATOR: '.',
            // Page DevTools console label in front of each JS API event name
            JS_API_CONSOLE_LABEL: '[Scrapfly JS API] ',
            // Own property marking a function as our bind shim (never shimmed twice)
            BIND_SHIM_MARKER: '__scrapflyBindShim',
            // The engine's text for a member called on a foreign `this`, used only if
            // the MAIN world cannot read it from the browser itself
            ILLEGAL_INVOCATION_FALLBACK: 'Illegal invocation'
        },
        // Global state keys shared between scripts. In the MAIN world these are
        // page-visible, exactly as before this module existed (no new ones).
        GLOBALS: {
            // Re-entrancy counter: extension-driven property reads must not report hooks
            HOOK_SUPPRESSION_DEPTH: '__scrapflyHookSuppressionDepth',
            // Set on cache hit; the ISOLATED world keeps its own flag under the same name
            CACHE_HIT_EARLY_EXIT: '__scrapflyCacheHitEarlyExit',
            // Public JS API: last onDetection payload, for synchronous page reads
            LAST_DETECTION: '__scrapflyLastDetection'
        }
    });

    root.ScrapflyBridgeProtocol = protocol;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : window));
