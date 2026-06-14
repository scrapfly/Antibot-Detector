// Hook management and batching for DetectionEngineManager

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
                type: 'JS_HOOK_DETECTION_BATCH',
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

    // Forward logs from MAIN world to service worker via debug system
    if (data && data.type === 'MAIN_WORLD_LOG') {
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({
                type: 'DEBUG_LOG',
                context: 'MAIN_WORLD',
                level: data.level,
                args: data.args,
                timestamp: data.timestamp
            }).catch((error) => {
                // Expected: Background may not be ready
                Logger.hooks('[MAIN_WORLD] Failed to forward log to background:', error.message);
            });
        }
        return true;
    }

    if (data && data.type === 'JS_HOOK_DETECTION') {
        // Defensive check
        if (window.__scrapflyCacheHitEarlyExit) {
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

    if (data && data.type === 'WINDOW_DETECTIONS') {
        // Defensive check
        if (window.__scrapflyCacheHitEarlyExit) {
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
            type: 'WINDOW_DETECTIONS',
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

    if (data && data.type === 'WINDOW_PROPS_COMPLETE') {
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
                            type: 'WINDOW_PROPS_COMPLETE',
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

    if (data && data.type === 'JS_HOOKS_COMPLETE') {
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
                            type: 'JS_HOOKS_COMPLETE',
                            url: data.url,
                            timestamp: data.timestamp,
                            totalDetections: data.totalDetections,
                            uniqueHooks: data.uniqueHooks,
                            completionReason: data.completionReason,
                            completionTime: data.completionTime,
                            uninstallStats: data.uninstallStats
                        });
                        Logger.detection(`[Content Script] Completion signal sent successfully on attempt ${attempt}`);
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
