// Hook management and batching for DetectionEngineManager

// Bridge protocol: modules/core/bridge-protocol.js (loaded before this file in every context)
const DEH_TYPES = globalThis.ScrapflyBridgeProtocol.MESSAGE_TYPES;
const DEH_CACHE_HIT_FLAG = globalThis.ScrapflyBridgeProtocol.GLOBALS.CACHE_HIT_EARLY_EXIT;

// Usual live instance of a Web API interface, used by the MAIN world as `this`
// when page code calls a hooked method or getter unbound
// (const { getBattery } = navigator). A detector hook's own windowPath wins;
// this table covers hooks without one (older stored detectors, user rules).
const DEH_HOOK_CONTEXT_PATHS = Object.freeze({
    Navigator: Object.freeze(['navigator']),
    NavigatorUAData: Object.freeze(['navigator.userAgentData']),
    MediaDevices: Object.freeze(['navigator.mediaDevices']),
    Performance: Object.freeze(['performance']),
    Screen: Object.freeze(['screen']),
    History: Object.freeze(['history']),
    Location: Object.freeze(['location']),
    Document: Object.freeze(['document']),
    HTMLDocument: Object.freeze(['document']),
    Storage: Object.freeze(['localStorage', 'sessionStorage'])
});

/**
 * Candidate `this` paths for a js_hooks entry, in the order the MAIN world tries
 * them: the detector's windowPath, then the target interface's instance.
 * @param {{target: string, windowPath?: string}} hook
 * @returns {string[]}
 */
function demHookContextPaths(hook) {
    const paths = [];
    if (typeof hook?.windowPath === 'string' && hook.windowPath) paths.push(hook.windowPath);
    const match = typeof hook?.target === 'string' ? /^([A-Za-z_$][\w$]*)\.prototype\./.exec(hook.target) : null;
    if (match && Object.prototype.hasOwnProperty.call(DEH_HOOK_CONTEXT_PATHS, match[1])) {
        paths.push(...DEH_HOOK_CONTEXT_PATHS[match[1]]);
    }
    return paths;
}

// Entry types Chromium only serves through PerformanceObserver. For these,
// performance.getEntriesByType() returns an empty list and logs "Deprecated API
// for given entry type." against the top JS frame. With the hook installed that
// frame is the MAIN-world wrapper, so the page's own warning lands on the
// extension's error page. The wrapper passes '' instead: Chromium returns the
// same empty list for an unknown type without a warning, and still runs its own
// receiver check, so calls on a non-Performance object throw exactly as before.
const DEH_OBSERVER_ONLY_ENTRY_TYPES = Object.freeze([
    'longtask', 'event', 'element', 'layout-shift', 'largest-contentful-paint',
    'interaction-contentful-paint', 'container', 'scroll'
]);

const DEH_HOOK_ARG_SUBSTITUTIONS = Object.freeze({
    'Performance.prototype.getEntriesByType': Object.freeze({
        index: 0, values: DEH_OBSERVER_ONLY_ENTRY_TYPES, replacement: ''
    })
});

/**
 * Argument the MAIN-world wrapper swaps before the native call:
 * { index, values, replacement } (string argument `index` found in `values`
 * becomes `replacement`), or null when the target has none.
 * @param {{target: string}} hook
 * @returns {{index: number, values: string[], replacement: string}|null}
 */
function demHookArgSubstitution(hook) {
    const target = typeof hook?.target === 'string' ? hook.target : '';
    if (!Object.prototype.hasOwnProperty.call(DEH_HOOK_ARG_SUBSTITUTIONS, target)) return null;
    const spec = DEH_HOOK_ARG_SUBSTITUTIONS[target];
    return { index: spec.index, values: [...spec.values], replacement: spec.replacement };
}

// Methods the MAIN world shims at document_start so page code can call them
// unbound (const { getBattery } = navigator; getBattery()) without the native
// illegal-invocation TypeError. Each falls back to its interface's usual
// instance (DEH_HOOK_CONTEXT_PATHS).
const DEH_EARLY_BIND_SHIM_TARGETS = Object.freeze([
    'Navigator.prototype.getBattery',
    'MediaDevices.prototype.enumerateDevices'
]);

/** Early bind shims as the MAIN world installs them: [{ target, contextPaths }] */
function demEarlyBindShims() {
    return DEH_EARLY_BIND_SHIM_TARGETS.map(target => ({ target, contextPaths: demHookContextPaths({ target }) }));
}

/**
 * Detail of the bridge bootstrap event (EVENTS.BRIDGE_INIT) content.js fires at
 * document_start: everything the MAIN world needs before its first install
 * event, adopted once and frozen there.
 * @param {string} token - this page's bridge token
 */
function demMainWorldBootstrapDetail(token) {
    const protocol = globalThis.ScrapflyBridgeProtocol;
    return {
        protocol,
        [protocol.FIELDS.TOKEN]: token,
        bindShims: demEarlyBindShims(),
        // modules/detection/window-condition-grammar.js, for the MAIN-world evaluator
        conditionGrammar: globalThis.ScrapflyWindowConditionGrammar
    };
}

function demCreateHookBatcher(chrome) {
    // Adaptive batching; adjusts window based on detection frequency
    let hookBatch = [];
    let hookBatchTimeout = null;
    let lastBatchSize = 0;
    let lastBatchTime = Date.now();
    const HOOK_BATCH_DELAY_MIN = 10;  // 10ms when many hooks firing (busy)
    const HOOK_BATCH_DELAY_MAX = 50;  // 50ms when few hooks (idle)
    const HOOK_BATCH_MAX_SIZE = 20;   // Force flush at 20 hooks
    const HOOK_BATCH_EMERGENCY_SIZE = 50; // Drop oldest if exceeds 50 (safety guard)

    function getAdaptiveBatchDelay() {
        const timeSinceLastBatch = Date.now() - lastBatchTime;

        // If hooks firing rapidly (< 100ms between batches), use shorter delay
        if (timeSinceLastBatch < 100 && lastBatchSize > 5) {
            return HOOK_BATCH_DELAY_MIN;
        }

        // If hooks firing slowly, use longer delay to batch more
        if (timeSinceLastBatch > 500) {
            return HOOK_BATCH_DELAY_MAX;
        }

        // Interpolate between min and max based on batch size
        const sizeRatio = Math.min(lastBatchSize / 10, 1);
        return HOOK_BATCH_DELAY_MIN + (HOOK_BATCH_DELAY_MAX - HOOK_BATCH_DELAY_MIN) * (1 - sizeRatio);
    }

    function flushHookBatch() {
        if (hookBatch.length === 0) return;

        // Flush on overflow to prevent memory leak
        if (hookBatch.length > HOOK_BATCH_EMERGENCY_SIZE) {
            Logger.warn('HOOKS', `Hook batch overflow (${hookBatch.length} hooks), forcing immediate flush`);
            // Prevents double flush
            if (hookBatchTimeout) {
                clearTimeout(hookBatchTimeout);
                hookBatchTimeout = null;
            }
        }

        if (!chrome.runtime?.id) {
            Logger.error('CONTENT', '[Content Script] Extension context invalidated, cannot forward hooks');
            hookBatch = [];
            return;
        }

        // Deduplicate by detector:hook combination (one detection per detectorId:target)
        const uniqueHooks = new Map();
        for (const hookData of hookBatch) {
            const key = `${hookData.detection.detectorId}:${hookData.detection.hook.target}`;
            if (!uniqueHooks.has(key)) {
                uniqueHooks.set(key, hookData);
            }
        }

        const deduplicatedHooks = Array.from(uniqueHooks.values());

        // Send batched detections (try-catch for context errors)
        try {
            chrome.runtime.sendMessage({
                type: DEH_TYPES.JS_HOOK_DETECTION_BATCH,
                detections: deduplicatedHooks,
                timestamp: Date.now()
            }).catch((error) => {
                const errorMsg = error?.message || '';

                // Expected on extension reload
                if (errorMsg.includes('Could not establish connection') ||
                    errorMsg.includes('Receiving end does not exist')) {
                }
                else if (errorMsg.includes('Extension context invalidated')) {
                }
                else {
                    Logger.debug('CONTENT', '[hookBatcher] Failed to send hook batch:', error);
                }
            });
        } catch (e) {
            // Expected: context invalidated
        }

        lastBatchSize = hookBatch.length;
        lastBatchTime = Date.now();

        hookBatch = [];
        hookBatchTimeout = null;
    }

    return {
        addHook: function(hookData) {
            hookBatch.push(hookData);

            // Force flush if oversized
            if (hookBatch.length >= HOOK_BATCH_MAX_SIZE) {
                if (hookBatchTimeout) {
                    clearTimeout(hookBatchTimeout);
                    hookBatchTimeout = null;
                }
                flushHookBatch();
            }
            // Schedule flush (adaptive delay)
            else if (!hookBatchTimeout) {
                const delay = getAdaptiveBatchDelay();
                hookBatchTimeout = setTimeout(flushHookBatch, delay);
            }
        },
        flush: flushHookBatch,
        getTimeout: function() {
            return hookBatchTimeout;
        },
        clearTimeout: function() {
            if (hookBatchTimeout) {
                clearTimeout(hookBatchTimeout);
                hookBatchTimeout = null;
            }
        }
    };
}


function demHandleHookMessage(event, chrome, hookBatcher) {
    // Only accept messages from same origin
    if (event.source !== window) return false;

    const data = event.data;

    if (data && data.type === DEH_TYPES.JS_HOOK_DETECTION) {
        // Defensive check
        if (window[DEH_CACHE_HIT_FLAG]) {
            Logger.debug('CONTENT', '[handleHookMessage] Hook detection received despite cache hit, ignoring');
            return true;
        }

        hookBatcher.addHook({
            detection: data.detection,
            url: data.url,
            timestamp: data.detection?.timestamp || Date.now()
        });
        return true;
    }

    if (data && data.type === DEH_TYPES.WINDOW_DETECTIONS) {
        // Defensive check
        if (window[DEH_CACHE_HIT_FLAG]) {
            Logger.debug('CONTENT', '[handleHookMessage] Window detections received despite cache hit, ignoring');
            return true;
        }

        const detections = data.detections || [];
        Logger.detection(`[Content Script] Window detections received: ${detections.length} properties detected in ${data.elapsedMs || 0}ms`);

        if (!chrome.runtime?.id) {
            Logger.error('CONTENT', '[Content Script] Extension context invalidated, cannot send window detections');
            return true;
        }

        chrome.runtime.sendMessage({
            type: DEH_TYPES.WINDOW_DETECTIONS,
            detections: detections,
            timestamp: data.timestamp,
            executionTime: data.elapsedMs
        }).then(() => {
            Logger.detection(`[Content Script] Window detections forwarded to background`);
        }).catch((error) => {
            Logger.error('CONTENT', '[Content Script] Failed to send window detections:', error);
        });
        return true;
    }

    if (data && data.type === DEH_TYPES.WINDOW_PROPS_COMPLETE) {
        (async () => {
            const sendCompletion = async () => {
                const MAX_ATTEMPTS = 3;
                for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                    if (!chrome.runtime?.id) {
                        Logger.error('DETECTION', `[Content Script] Extension context invalidated (attempt ${attempt}) - window props completion not sent`);
                        await new Promise(resolve => setTimeout(resolve, attempt * 100));
                        continue;
                    }

                    try {
                        await chrome.runtime.sendMessage({
                            type: DEH_TYPES.WINDOW_PROPS_COMPLETE,
                            url: data.url,
                            timestamp: data.timestamp,
                            detectedCount: data.detectedCount
                        });
                        Logger.detection(`[Content Script] Window properties completion signal sent successfully on attempt ${attempt}`);
                        return;
                    } catch (error) {
                        Logger.error('DETECTION', `[Content Script] Failed to send window props completion signal (attempt ${attempt}):`, error);
                        await new Promise(resolve => setTimeout(resolve, attempt * 100));
                    }
                }

                Logger.error('CONTENT', '[Content Script] Giving up on window props completion signal after repeated failures');
            };

            await sendCompletion();
        })();
        return true;
    }

    if (data && data.type === DEH_TYPES.JS_HOOKS_COMPLETE) {
        // Flush pending hooks before sending completion to prevent race condition
        (async () => {
            if (hookBatcher.getTimeout()) {
                hookBatcher.clearTimeout();
                hookBatcher.flush();
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            const sendCompletion = async () => {
                const MAX_ATTEMPTS = 3;
                for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                    if (!chrome.runtime?.id) {
                        Logger.error('DETECTION', `[Content Script] Extension context invalidated (attempt ${attempt}) - completion not sent`);
                        await new Promise(resolve => setTimeout(resolve, attempt * 100));
                        continue;
                    }

                    try {
                        await chrome.runtime.sendMessage({
                            type: DEH_TYPES.JS_HOOKS_COMPLETE,
                            url: data.url,
                            timestamp: data.timestamp,
                            totalDetections: data.totalDetections,
                            uniqueHooks: data.uniqueHooks,
                            completionReason: data.completionReason,
                            completionTime: data.completionTime,
                            uninstallStats: data.uninstallStats
                        });
                        Logger.debug('DETECTION', `Hooks completion sent (attempt ${attempt})`);
                        return;
                    } catch (error) {
                        Logger.error('DETECTION', `[Content Script] Failed to send completion signal (attempt ${attempt}):`, error);
                        await new Promise(resolve => setTimeout(resolve, attempt * 100));
                    }
                }

                Logger.error('CONTENT', '[Content Script] Giving up on completion signal after repeated failures');
            };

            await sendCompletion();
        })();
        return true;
    }

    return false;
}
