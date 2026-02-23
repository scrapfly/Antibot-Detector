/**
 * registerDetectionHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerDetectionHandlers(registry, context) {
    void context;

    const handle_page_load_notification = function({ request, sender, sendResponse, context }) {
        void context;

        // Clear interrupted marker on new page load
        if (sender.tab?.id) {
            if (interruptedDetections.has(sender.tab.id)) {
                Logger.background(`[Background] Clearing interrupted state for tab ${sender.tab.id} (new page load)`);
                interruptedDetections.delete(sender.tab.id);
            }
        }

        (async () => {
            try {
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

                sendResponse({ status: 'ok' });
            } catch (error) {
                Logger.error('BACKGROUND', '[Background] Error handling PAGE_LOAD_NOTIFICATION:', error);
                sendResponse({ status: 'error', error: error.message });
            }
        })();
        return true; // Keep SW alive until badge/cache work completes
    };
    registry['PAGE_LOAD_NOTIFICATION'] = handle_page_load_notification;

    const handle_detection_data = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            const debugState = {};
            const debugMode = await ensureDebugMode(debugState);
            if (debugMode) {
                Logger.debug('BACKGROUND', '[DETECTION_DATA] Received', { tabId: sender.tab?.id, keys: Object.keys(request) });
            }
            const pageData = request.data;
            if (debugMode) {
                Logger.debug('BACKGROUND', '[DETECTION_DATA] Page data', {
                    cookies: pageData?.cookies?.length || 0,
                    headers: pageData?.headers ? Object.keys(pageData.headers).length : 0,
                    scripts: pageData?.scripts?.length || 0,
                    dom: pageData?.dom?.length || 0,
                    url: pageData?.url
                });
            }
            try {
                if (debugMode) {
                    Logger.debug('BACKGROUND', '[DETECTION_DATA] Processing...');
                }
                await processDetectionData(request, sender);
                if (debugMode) {
                    Logger.debug('BACKGROUND', '[DETECTION_DATA] Processing complete');
                }
                sendResponse({ status: 'received', tabId: sender.tab?.id });
            } catch (error) {
                Logger.error('BACKGROUND', '[DetectionData] ERROR in processDetectionData:', error);
                // Notify content script for JS API error event (scrapfly:onError)
                try {
                    const tabId = sender.tab?.id;
                    if (tabId) {
                        chrome.tabs.sendMessage(tabId, {
                            type: 'DETECTION_ERROR',
                            url: request?.data?.url || sender.tab?.url,
                            error: error?.message || String(error),
                            stage: 'processDetectionData',
                            timestamp: new Date().toISOString()
                        }).catch(() => {
                            // Content script may not be ready; ignore
                        });
                    }
                } catch (e) {
                    // Never let error reporting break message flow
                }
                sendResponse({ status: 'error', error: error.message });
            }
        })();
        return true; // Async response
    };
    registry['DETECTION_DATA'] = handle_detection_data;

    const handle_content_script_ready = function({ request, sender, sendResponse, context }) {
        void context;

        Logger.background(`Scrapfly Background: Content script ready on ${request.url}`);
        sendResponse({ status: 'acknowledged' });
    };
    registry['CONTENT_SCRIPT_READY'] = handle_content_script_ready;

    const handle_get_detection_data = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            try {
                let data = null;
                let status = 'ok';
                let targetTabId = request.tabId || null;

                if (!targetTabId) {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    targetTabId = activeTab?.id || null;
                }

                if (targetTabId) {
                    if (targetTabId === currentActiveTab && interruptedDetections.has(targetTabId)) {
                        Logger.background(`[GET_DETECTION_DATA] Clearing interrupted state for current tab ${targetTabId} (user viewing popup)`);
                        interruptedDetections.delete(targetTabId);
                    }

                    data = request.tabId
                        ? await DetectionEngineManager.getDetectionData(targetTabId)
                        : await getCurrentTabDetectionData();

                    // Completed data wins over stale interrupted markers
                    if (data && interruptedDetections.has(targetTabId)) {
                        Logger.background(`[GET_DETECTION_DATA] Clearing interrupted state for tab ${targetTabId} (has cached completed data)`);
                        interruptedDetections.delete(targetTabId);
                    }

                    // Sync badge when returning cached data (ensures popup open always fixes stale badges)
                    if (data) {
                        try {
                            const tab = await chrome.tabs.get(targetTabId);
                            if (tab && tab.url) {
                                setBadgeForDetections(targetTabId, tab.url, data.detectionResults || []);
                            }
                        } catch (e) { /* tab may have closed */ }
                    }

                    if (!data) {
                        const detectionState = detectionStates.get(targetTabId);
                        const hasActiveState = !!(detectionState && !detectionState.finalized);
                        const hasActiveDetection = activeDetections.has(targetTabId);
                        const isRecentlyCleared = recentlyClearedTabs.has(targetTabId);
                        const isInterrupted = interruptedDetections.has(targetTabId);

                        if (isRecentlyCleared) {
                            status = 'ok';
                        } else if (isInterrupted && !hasActiveState && !hasActiveDetection) {
                            status = 'interrupted';
                        } else if (hasActiveState || hasActiveDetection) {
                            status = 'pending';
                        } else {
                            let badgeText = '';
                            try {
                                badgeText = await chrome.action.getBadgeText({ tabId: targetTabId });
                            } catch (badgeError) {
                                Logger.background(`[GET_DETECTION_DATA] Failed to read badge text for tab ${targetTabId}:`, badgeError.message);
                            }
                            const trimmed = badgeText ? badgeText.trim() : '';
                            const isLoadingBadge = trimmed === BADGE.TEXT.LOADING;

                            // Clear stale loading badge for idle tab
                            if (isLoadingBadge) {
                                Logger.background(`[GET_DETECTION_DATA] Clearing stale loading badge for idle tab ${targetTabId}`);
                                try {
                                    await chrome.action.setBadgeText({ text: BADGE.TEXT.EMPTY, tabId: targetTabId });
                                } catch (badgeClearError) {
                                    Logger.background(`[GET_DETECTION_DATA] Failed to clear stale loading badge for tab ${targetTabId}:`, badgeClearError.message);
                                }
                            }

                            status = 'ok';
                        }

                        // Clear stale numeric badge if tab is truly idle
                        if (status === 'ok' && !hasActiveState && !hasActiveDetection) {
                            try {
                                const badgeText = await chrome.action.getBadgeText({ tabId: targetTabId });
                                const trimmed = badgeText ? badgeText.trim() : '';
                                const isNumericBadge = /^\d+\+?$/.test(trimmed);
                                if (isNumericBadge) {
                                    Logger.background(`[GET_DETECTION_DATA] Clearing stale numeric badge '${trimmed}' for idle tab ${targetTabId}`);
                                    await chrome.action.setBadgeText({ text: '', tabId: targetTabId });
                                }
                            } catch (e) {
                                // Silently fail
                            }
                        }
                    }
                }

                // Include progress state for popup step indicators
                const state = targetTabId ? detectionStates.get(targetTabId) : null;
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
                Logger.error('BACKGROUND', 'Scrapfly Background: Error in GET_DETECTION_DATA:', error);
                sendResponse({ data: null, status: 'error', error: error.message });
            }
        })();
        return true; // Will respond asynchronously
    };
    registry['GET_DETECTION_DATA'] = handle_get_detection_data;

    const handle_request_detection = function({ request, sender, sendResponse, context }) {
        void context;

        // Initialize progress update before delegation
        if (request.tabId) {
            sendProgressUpdate(request.tabId, 'main', new Set(), 7);
        }

        (async () => {
            await ensureDetectorManagerInitialized();

            return await DetectionEngineManager.handleRequestDetection(request, sendResponse, {
                chrome,
                Utils,
                recentDetectionRequests
            });
        })();
        return true; // Will respond asynchronously
    };
    registry['REQUEST_DETECTION'] = handle_request_detection;

    const handle_js_hook_detection_batch = function({ request, sender, sendResponse, context }) {
        void context;

            // Process batched JS hook detections
            (async () => {
                let tabId;
                try {
                    if (!sender.tab || !sender.tab.id) {
                        Logger.warn('BACKGROUND', '[hookBatch] No tab info in sender');
                        return;
                    }

                    tabId = sender.tab.id;

                    // Early exit if tab is using cache
                    if (tabsUsingCache.has(tabId)) {
                        Logger.background(`[Background] JS Hooks - Tab ${tabId} using cache - discarding hooks immediately`);
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
                        Logger.background(`[Batch Flag] SET to FALSE (cache hit) for tab ${tabId}`);
                        return; // Don't process hooks - we have cached results
                    }

                    // Mark batch processing as active to prevent finalization race
                    const previousFlag = batchProcessingFlags.get(tabId);
                    batchProcessingFlags.set(tabId, true);
                    Logger.background(`[hookBatch] Batch processing started for tab ${tabId}`);

                    Logger.background(`[Background] JS Hook batch from tab ${tabId}: ${detections.length} hooks`);

                    Logger.background(`[Background] JS Hooks details:`);
                    detections.forEach(hookData => {
                        const det = hookData.detection;
                        const isInlineHook = det.detectorId && det.detectorId.startsWith('inline-hook-');
                        Logger.background(`[Background]   - ${det.detectorName} (ID: ${det.detectorId}) [${isInlineHook ? 'INLINE' : 'DYNAMIC'}]: ${det.hook.target}`);
                    });
                    await ensureDetectorManagerInitialized();

                    // Record batch arrival time for deterministic finalization
                    state.lastHookBatchTime = Date.now();

                    if (state.url !== url) {
                        Logger.background(`[Background] URL changed during JS hooks for tab ${tabId}: ${url} → ${state.url} - skipping hooks`);
                        return;
                    }
                    for (const hookData of detections) {
                        const detection = hookData.detection;
                        const detectorId = detection.detectorId;
                        const normalizedCategory = detection.category ? detection.category.toLowerCase() : 'fingerprint';

                        let fullDetector = detectorManager.getDetector(normalizedCategory, detectorId);
                        if (!fullDetector) {
                            fullDetector = detectorManager.findDetectorById(detectorId);
                        }
                        if (!fullDetector) {
                            Logger.warn('BACKGROUND', `[hookBatch] Detector ${detectorId} not found, skipping`);
                            continue;
                        }

                        if (!state.hooksData.has(detectorId)) {
                            const normalizedDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.normalizeDifficulty === 'function')
                                ? DetectionUtils.normalizeDifficulty(fullDetector?.difficulty)
                                : null;
                            const defaultDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.defaultDifficultyForCategory === 'function')
                                ? DetectionUtils.defaultDifficultyForCategory(normalizedCategory || fullDetector?.category)
                                : 'Medium';
                            const difficulty = normalizedDifficulty || defaultDifficulty;

                            state.hooksData.set(detectorId, {
                                detector: {
                                    id: fullDetector.id || detectorId,
                                    name: fullDetector.name || detection.detectorName || 'Unknown',
                                    icon: fullDetector.icon,
                                    color: fullDetector.color,
                                    description: fullDetector.description,
                                    difficulty: difficulty
                                },
                                category: normalizedCategory,
                                difficulty: difficulty,
                                confidence: 0,
                                detectionMethods: ['js_hooks'],
                                matches: []
                            });
                        }

                        const detector = state.hooksData.get(detectorId);
                        const newMatch = {
                            type: 'js_hooks',
                            pattern: detection.hook.target,
                            value: detection.hook.target.split('.').pop(),
                            confidence: detection.hook.confidence,
                            description: detection.hook.description
                        };

                        const isDuplicate = detector.matches.some(m => m.pattern === newMatch.pattern);
                        if (!isDuplicate) {
                            detector.matches.push(newMatch);
                        }

                        detector.confidence = Math.max(...detector.matches.map(m => m.confidence || 0));
                    }

                    Logger.background(`[Background] Processed ${detections.length} hooks in batch for tab ${tabId}`);

                } catch (error) {
                    Logger.error('BACKGROUND', '[Background] ERROR handling JS hook batch:', error);
                } finally {
                    if (tabId) {
                        batchProcessingFlags.set(tabId, false);
                        Logger.background(`[hookBatch] Batch complete for tab ${tabId}, allowing finalization`);
                        checkAndFinalizeDetection(tabId);
                    }
                }
            })();
            return false; // No response needed for batches

    };
    registry['JS_HOOK_DETECTION_BATCH'] = handle_js_hook_detection_batch;

    const handle_window_detections = function({ request, sender, sendResponse, context }) {
        void context;

        // Process window property detections from MAIN world
        (async () => {
            try {
                if (!sender.tab || !sender.tab.id) {
                    Logger.warn('BACKGROUND', '[WINDOW_DETECTIONS] No tab info in sender');
                    return;
                }

                const tabId = sender.tab.id;

                if (tabsUsingCache.has(tabId)) {
                    Logger.background(`[Background] Window Detections - Tab ${tabId} using cache - discarding properties immediately`);
                    return;
                }

                const url = sender.tab.url;
                const { detections, executionTime } = request;

                if (!Array.isArray(detections)) {
                    Logger.warn('BACKGROUND', '[WINDOW_DETECTIONS] Invalid detections format:', typeof detections);
                    return;
                }

                const state = getOrCreateDetectionState(tabId, url);

                // Skip if cached results exist for this URL
                const cachedData = await DetectionEngineManager.getStoredDetection(url);
                if (cachedData) {
                    state.usedCache = true;
                    return;
                }

                Logger.background(`[Background] Window property detections from tab ${tabId}: ${detections.length} properties in ${executionTime}ms`);

                if (detections.length > 0) {
                    Logger.background(`[Background] Window property details:`);
                    detections.forEach(det => {
                        Logger.background(`[Background]   - ${det.detectorName} (${det.detectorId}): window.${det.property.path}`);
                    });
                } else {
                    Logger.background(`[Background] No window properties detected (none matched conditions)`);
                }

                // Validate state
                if (!state) {
                    Logger.error('BACKGROUND', '[Background] Failed to get/create detection state for tab', tabId);
                    return;
                }

                if (state.url !== url) {
                    Logger.background(`[Background] URL changed during window props for tab ${tabId}: ${url} → ${state.url} - skipping window props`);
                    return;
                }

                if (!Array.isArray(state.mainData)) {
                    Logger.background('[Background] Initializing mainData array for tab', tabId);
                    state.mainData = [];
                }

                for (const detection of detections) {
                    if (!detection || !detection.detectorId) {
                        Logger.warn('BACKGROUND', '[WINDOW_DETECTIONS] Skipping invalid detection:', detection);
                        continue;
                    }

                    let detectionObj = state.mainData.find(d => d && (d.detector?.id === detection.detectorId || d.id === detection.detectorId));
                    if (!detectionObj) {
                        const categoryKey = detection.category.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const fullDetector = detectorManager.getDetector(categoryKey, detection.detectorId);
                        const normalizedDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.normalizeDifficulty === 'function')
                            ? DetectionUtils.normalizeDifficulty(fullDetector?.difficulty)
                            : null;
                        const defaultDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.defaultDifficultyForCategory === 'function')
                            ? DetectionUtils.defaultDifficultyForCategory(detection.category || fullDetector?.category)
                            : 'Medium';
                        const difficulty = normalizedDifficulty || defaultDifficulty;

                        detectionObj = {
                            detected: true,
                            confidence: detection.property.confidence,
                            difficulty: difficulty,
                            matches: [],
                            detectionMethods: [],
                            category: detection.category,
                            detector: {
                                id: detection.detectorId,
                                name: detection.detectorName,
                                icon: fullDetector?.icon,
                                color: fullDetector?.color,
                                description: fullDetector?.description,
                                difficulty: difficulty
                            }
                        };
                        state.mainData.push(detectionObj);
                    }

                    const newMatch = {
                        type: 'window',
                        pattern: detection.property.path,
                        confidence: detection.property.confidence,
                        description: detection.property.description,
                        actualType: detection.property.actualType,
                        condition: detection.property.condition
                    };

                    const isDuplicate = detectionObj.matches.some(m =>
                        m.type === 'window' && m.pattern === newMatch.pattern
                    );

                    if (!isDuplicate) {
                        detectionObj.matches.push(newMatch);
                        if (!detectionObj.detectionMethods) {
                            detectionObj.detectionMethods = [];
                        }
                        if (!detectionObj.detectionMethods.includes('window')) {
                            detectionObj.detectionMethods.push('window');
                        }
                        Logger.background(`[Background] Added window property: ${detection.property.path} for ${detection.detectorName}`);
                    }

                    detectionObj.confidence = Math.max(...detectionObj.matches.map(m => m.confidence || 0));
                }

                Logger.background(`[Background] Processed ${detections.length} window properties for tab ${tabId}`);

            } catch (error) {
                Logger.error('BACKGROUND', '[Background] ERROR handling window property detections:', error);
            }
        })();
        return false; // No response needed
    };
    registry['WINDOW_DETECTIONS'] = handle_window_detections;

    const handle_window_props_complete = function({ request, sender, sendResponse, context }) {
        void context;

        // Mark window properties complete and check finalization
        (async () => {
            try {
                if (!sender.tab || !sender.tab.id) {
                    Logger.warn('BACKGROUND', '[WINDOW_PROPS_COMPLETE] No tab info in sender');
                    return;
                }

                const tabId = sender.tab.id;

                if (tabsUsingCache.has(tabId)) {
                    Logger.background(`[Background] Window Props - Tab ${tabId} using cache - discarding signal`);
                    sendResponse({ status: 'cached', message: 'Tab using cached detection' });
                    return;
                }

                const url = request.url;

                Logger.background(`[WINDOW_PROPS_COMPLETE] Signal received for tab ${tabId}`, {
                    detected: request.detectedCount,
                    checked: request.totalChecked,
                    elapsed: request.elapsedMs,
                    reason: request.reason
                });

                const state = getOrCreateDetectionState(tabId, url);

                // URL validation with normalization (trailing slashes, hash)
                const normalizeUrl = (u) => {
                    try {
                        const parsed = new URL(u);
                        return parsed.origin + parsed.pathname.replace(/\/$/, '') + parsed.search;
                    } catch (e) {
                        return u;
                    }
                };

                const normalizedStateUrl = normalizeUrl(state.url);
                const normalizedRequestUrl = normalizeUrl(url);

                if (normalizedStateUrl !== normalizedRequestUrl) {
                    Logger.debug('BACKGROUND', `[WINDOW_PROPS_COMPLETE] URL mismatch, ignoring signal for tab ${tabId}`, {
                        stateUrl: state.url,
                        requestUrl: url
                    });
                    sendResponse({ status: 'url_changed' });
                    return;
                }

                state.windowPropertiesComplete = true;

                // Skip progress updates after finalization (onDetection already fired)
                if (!state.finalized) {
                    markMethodComplete(tabId, 'windowProperties');
                        Logger.background(`[WINDOW_PROPS_COMPLETE] Marked complete, checking finalization`);
                    checkAndFinalizeDetection(tabId);
                }

                sendResponse({ status: 'success' });
            } catch (error) {
                Logger.error('BACKGROUND', '[WINDOW_PROPS_COMPLETE] ERROR handling window props complete:', error);
                sendResponse({ status: 'error', error: error.message });
            }
        })();
        return true; // Async response
    };
    registry['WINDOW_PROPS_COMPLETE'] = handle_window_props_complete;

    const handle_js_hooks_complete = function({ request, sender, sendResponse, context }) {
        void context;

            // Mark hooks complete and check finalization
            (async () => {
                try {
                    if (!sender.tab || !sender.tab.id) {
                        Logger.warn('BACKGROUND', '[JS_HOOKS_COMPLETE] No tab info in sender');
                        return;
                    }

                    const tabId = sender.tab.id;
                    const url = request.url;

                    Logger.background(`[JS_HOOKS_COMPLETE] Signal received for tab ${tabId}`, {
                        totalDetections: request.totalDetections,
                        uniqueHooks: request.uniqueHooks,
                        elapsed: request.completionTime,
                        reason: request.completionReason
                    });

                    const state = getOrCreateDetectionState(tabId, url);

                    const normalizeUrl = (u) => {
                        try {
                            const parsed = new URL(u);
                            return parsed.origin + parsed.pathname.replace(/\/$/, '') + parsed.search;
                        } catch (e) {
                            return u;
                        }
                    };

                    const normalizedStateUrl = normalizeUrl(state.url);
                    const normalizedRequestUrl = normalizeUrl(url);

                    if (normalizedStateUrl !== normalizedRequestUrl) {
                        Logger.debug('BACKGROUND', `[JS_HOOKS_COMPLETE] URL mismatch, ignoring signal for tab ${tabId}`, {
                            stateUrl: state.url,
                            requestUrl: url
                        });
                        sendResponse({ status: 'url_changed' });
                        return;
                    }

                    state.hooksComplete = true;
                    state.hooksTimedOut = false;
                    state.hooksCompletionReason = request.completionReason || state.hooksCompletionReason || null;
                    state.hooksCompletionTime = request.completionTime || state.hooksCompletionTime || null;
                    state.hooksUninstallStats = request.uninstallStats || state.hooksUninstallStats || null;

                    const debugMode = await ensureDebugMode(state);
                    if (debugMode && request.uninstallStats) {
                        Logger.background(`[Background] Hook uninstall stats:`, request.uninstallStats);
                    }

                    if (!state.finalized) {
                        markMethodComplete(tabId, 'jsHooks');

                        Logger.background(`[Background] Hooks marked complete`);
                        Logger.background(`[Background] Current completion status: ${state.completedMethods.size}/7 methods`);
                        Logger.background(`[Background] Completed methods: ${Array.from(state.completedMethods).join(', ')}`);

                        checkAndFinalizeDetection(tabId);
                    }

                    // 1s safety retry in case debounce missed the completion
                    setTimeout(() => {
                        const currentState = detectionStates.get(tabId);
                        if (currentState && !currentState.finalized && currentState.completedMethods.has('jsHooks')) {
                            Logger.debug('BACKGROUND', `[JS_HOOKS_COMPLETE] Retry: not finalized after 1s, forcing check`);
                            checkAndFinalizeDetection(tabId);
                        }
                    }, 1000);

                    sendResponse({ status: 'success' });
                } catch (error) {
                    Logger.error('BACKGROUND', '[Background] ERROR handling JS hooks complete:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response
    };
    registry['JS_HOOKS_COMPLETE'] = handle_js_hooks_complete;

    const handle_get_detectors = function({ request, sender, sendResponse, context }) {
        void context;

        // Load detectors with retry for slow service worker startup
        (async () => {
            try {
                const startTime = Date.now();
                Logger.background('[Background] GET_DETECTORS request received');
                let retries = Constants.DETECTOR_LOAD_MAX_RETRIES;
                const maxRetries = retries;

                while (retries > 0) {
                    await ensureDetectorManagerInitialized();

                    const allDetectors = detectorManager.getAllDetectors();
                    const hasDetectors = allDetectors && Object.keys(allDetectors).length > 0;

                    if (hasDetectors) {
                        const elapsed = Date.now() - startTime;
                        const detectorCount = Object.values(allDetectors).reduce((sum, cat) =>
                            sum + Object.keys(cat).length, 0
                        );
                        const attempts = maxRetries - retries + 1;
                        Logger.background(`[Background] Detectors loaded successfully in ${elapsed}ms (${attempts} attempts)`);
                        Logger.background(`[Background] Sending ${detectorCount} detectors across ${Object.keys(allDetectors).length} categories`);

                        sendResponse({
                            detectors: allDetectors
                        });
                        return;
                    }

                    const attemptsLeft = retries - 1;
                    const elapsedSoFar = Date.now() - startTime;
                    Logger.debug('BACKGROUND', `[GET_DETECTORS] Waiting for detectors (${elapsedSoFar}ms elapsed, ${attemptsLeft} retries left)`);

                    // Diagnostic logging on first attempt
                    if (retries === maxRetries) {
                        Logger.background('[Background] Initial diagnostic: DetectorManager state:', {
                            exists: !!detectorManager,
                            initialized: detectorManager?.initialized,
                            detectorCount: detectorManager ? Object.keys(detectorManager.detectors || {}).length : 0,
                            categoryManagerExists: !!categoryManager
                        });

                        chrome.storage.local.get(['scrapfly_detectors', 'scrapfly_categories'], (rawStorage) => {
                            Logger.background('[Background] DIAGNOSTIC: Raw chrome.storage.local contents:', {
                                hasDetectorsKey: !!rawStorage.scrapfly_detectors,
                                hasCategoriesKey: !!rawStorage.scrapfly_categories,
                                detectorsTimestamp: rawStorage.scrapfly_detectors?.timestamp,
                                detectorsDataKeys: rawStorage.scrapfly_detectors?.detectors ? Object.keys(rawStorage.scrapfly_detectors.detectors) : [],
                                categoriesDataKeys: rawStorage.scrapfly_categories?.categories ? Object.keys(rawStorage.scrapfly_categories.categories) : []
                            });

                            if (rawStorage.scrapfly_detectors?.detectors) {
                                const detectorCategories = Object.keys(rawStorage.scrapfly_detectors.detectors);
                                Logger.background('[Background] DIAGNOSTIC: Storage detector categories:', detectorCategories);

                                for (const cat of detectorCategories) {
                                    const detectorNames = Object.keys(rawStorage.scrapfly_detectors.detectors[cat] || {});
                                    Logger.background(`[Background] DIAGNOSTIC: Storage category "${cat}": ${detectorNames.length} detectors`);
                                }
                            }

                            if (detectorManager?.detectors) {
                                const managerCategories = Object.keys(detectorManager.detectors);
                                Logger.background('[Background] DIAGNOSTIC: DetectorManager.detectors categories:', managerCategories);

                                if (managerCategories.length === 0 && rawStorage.scrapfly_detectors?.detectors) {
                                    Logger.error('BACKGROUND', '[GET_DETECTORS] MISMATCH: storage has detectors but detectorManager.detectors is empty (loadFromStorage failed)');
                                }
                            }
                        });
                    }

                    if ((maxRetries - retries) % 5 === 0 && retries < maxRetries) {
                        const progress = Math.round(((maxRetries - retries) / maxRetries) * 100);
                        Logger.background(`[Background] Progress: ${progress}% (waiting for JSON files to load...)`);
                    }

                    retries--;
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, Constants.DETECTOR_LOAD_RETRY_DELAY));
                    }
                }

                const elapsed = Date.now() - startTime;
                Logger.error('BACKGROUND', `[GET_DETECTORS] Failed to load detectors after ${elapsed}ms (${maxRetries} retries)`, {
                    detectorManagerExists: !!detectorManager,
                    initialized: detectorManager?.initialized,
                    categoriesCount: detectorManager ? Object.keys(detectorManager.detectors || {}).length : 0,
                    categoryManagerExists: !!categoryManager,
                    categoryManagerInitialized: categoryManager?.initialized,
                    categoriesLoaded: categoryManager?.initialized && categoryManager.categories
                        ? Object.keys(categoryManager.categories)
                        : null
                });

                sendResponse({ detectors: {} });
            } catch (error) {
                Logger.error('BACKGROUND', '[GET_DETECTORS] Error getting detectors:', error);
                sendResponse({ detectors: {} });
            }
        })();
        return true; // Will respond asynchronously
    };
    registry['GET_DETECTORS'] = handle_get_detectors;

}
