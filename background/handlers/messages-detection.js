/**
 * registerDetectionHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerDetectionHandlers(registry, context) {
    void context;

    const handle_page_load_notification = function({ request, sender, sendResponse, context }) {
        void context;

        // FIX: Clear interrupted state on new page load (prevents false "interrupted" messages)
        if (sender.tab?.id) {
            if (interruptedDetections.has(sender.tab.id)) {
                Logger.background(`[Background] Clearing interrupted state for tab ${sender.tab.id} (new page load)`);
                interruptedDetections.delete(sender.tab.id);
            }
        }

        // Delegate to DetectionEngineManager handler
        (async () => {
            try {
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

        // Process detection data from content script
        (async () => {
            Logger.debug('BACKGROUND', '[DEBUG] DETECTION_DATA message received!');
            Logger.debug('BACKGROUND', '[DEBUG] Sender tab ID:', sender.tab?.id);
            Logger.debug('BACKGROUND', '[DEBUG] Request keys:', Object.keys(request));
            const pageData = request.data;
            Logger.debug('BACKGROUND', '[DEBUG] Request data available:', {
                hasData: !!pageData,
                dataKeys: pageData ? Object.keys(pageData) : null,
                hasCookies: pageData?.cookies ? pageData.cookies.length : 0,
                hasHeaders: pageData?.headers ? Object.keys(pageData.headers).length : 0,
                hasScripts: pageData?.scripts ? pageData.scripts.length : 0,
                hasDom: pageData?.dom ? pageData.dom.length : 0,
                url: pageData?.url
            });
            try {
                Logger.debug('BACKGROUND', '[DEBUG] Calling processDetectionData...');
                await processDetectionData(request, sender);
                Logger.debug('BACKGROUND', '[DEBUG] processDetectionData completed successfully');
                sendResponse({ status: 'received', tabId: sender.tab?.id });
            } catch (error) {
                Logger.error('BACKGROUND', '[DEBUG] ERROR in processDetectionData:', error);
                // JS API support: notify content script so it can emit `scrapfly:onError`
                // (content.js listens for DETECTION_ERROR and bridges to MAIN world).
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

        // Content script is ready
        Logger.background(`Scrapfly Background: Content script ready on ${request.url}`);
        sendResponse({ status: 'acknowledged' });
    };
    registry['CONTENT_SCRIPT_READY'] = handle_content_script_ready;

    const handle_get_detection_data = function({ request, sender, sendResponse, context }) {
        void context;

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
                        Logger.background(`[GET_DETECTION_DATA] Clearing interrupted state for current tab ${tabId} (user viewing popup)`);
                        interruptedDetections.delete(tabId);
                        try {
                            await chrome.action.setBadgeText({ text: '', tabId });
                        } catch (error) {
                            // Silently fail
                        }
                    }

                    // Try to get cached data first
                    data = await DetectionEngineManager.getDetectionData(tabId);
                    
                    // FIX: If no cached data but detection state exists, construct response from state
                    // This handles the case where detection just completed and storage write is still pending
                    if (!data) {
                        // CRITICAL FIX: Don't return zombie data from detectionStates if cache was recently cleared
                        if (recentlyClearedTabs.has(tabId)) {
                            Logger.background(`[GET_DETECTION_DATA] Tab ${tabId} recently cleared - blocking zombie data from detectionStates`);
                            // Don't return stale data - let popup show empty state
                        } else {
                            // PHASE 9 FIX: Check badge FIRST to determine if detection completed
                            // Badge updates EARLY (in processDetectionData async IIFE)
                            // state.expiry is set LATE (in finalizeDetection after storage write)
                            // So we need to check badge to know if mainData is valid
                            let badgeText = '';
                            try {
                                badgeText = await chrome.action.getBadgeText({ tabId });
                            } catch (e) {
                                // Silently fail
                            }
                            const trimmed = badgeText ? badgeText.trim() : '';
                            const isNumericBadge = /^\d+\+?$/.test(trimmed);

                            const state = detectionStates.get(tabId);

                            // If badge shows numeric count, use mainData even WITHOUT expiry
                            // This fixes the race where badge updates before finalizeDetection runs
                            if (isNumericBadge && state && state.mainData && state.mainData.length > 0) {
                                Logger.background(`[GET_DETECTION_DATA] Badge='${trimmed}', using mainData without expiry for tab ${tabId}`);
                                const expiryMs = await DetectionEngineManager.getExpiryMs();
                                const cacheScope = await Utils.getCacheScope();
                                const now = Date.now();
                                data = {
                                    detectionResults: state.mainData,
                                    timestamp: state.timestamp || now,
                                    url: state.url,
                                    favicon: state.favicon,
                                    fromStorage: false,
                                    processed: true,
                                    expiry: now + expiryMs,
                                    cacheScope: cacheScope
                                };
                            }
                            // Fallback: If state has expiry (finalizeDetection ran), use it
                            else if (state && state.expiry && state.mainData && state.mainData.length > 0) {
                                Logger.background(`[GET_DETECTION_DATA] Using fresh detection state with expiry for tab ${tabId}`);
                                const cacheScope = await Utils.getCacheScope();
                                data = {
                                    detectionResults: state.mainData,
                                    timestamp: state.timestamp,
                                    expiry: state.expiry,
                                    url: state.url,
                                    favicon: state.favicon,
                                    fromStorage: false,
                                    processed: true,
                                    cacheScope: cacheScope
                                };
                            }
                        }
                    }
                    
                    // Reduced logging - comment out for less spam
                    // Logger.background(`Scrapfly Background: Sending detection data for tab ${tabId}:`, data ? 'Data available' : 'No data');

                    // FIX: Layer 3 - If we have cached data and tab is marked as interrupted, clear it
                    // (Tab was interrupted but detection actually completed before interruption occurred)
                    if (data && interruptedDetections.has(tabId)) {
                        Logger.background(`[GET_DETECTION_DATA] Clearing interrupted state for tab ${tabId} (has cached completed data)`);
                        interruptedDetections.delete(tabId);
                    }

                    // Only check interrupted/pending status if NO cached data exists
                    if (!data) {
                        // CRITICAL FIX: If cache was recently cleared, don't show pending/analyzing state
                        if (recentlyClearedTabs.has(tabId)) {
                            Logger.background(`[GET_DETECTION_DATA] Tab ${tabId} recently cleared - returning empty state, not pending`);
                            status = 'ok';  // Return ok with no data to show empty state
                        } else {
                            // FIX: Check badge FIRST - if it shows numeric count, detection completed
                            // even if activeDetections flag wasn't cleared yet (race condition)
                            let badgeText = '';
                            try {
                                badgeText = await chrome.action.getBadgeText({ tabId });
                            } catch (badgeError) {
                                Logger.background(`[GET_DETECTION_DATA] Failed to read badge text for tab ${tabId}:`, badgeError.message);
                            }
                            const trimmed = badgeText ? badgeText.trim() : '';
                            const isNumericBadge = /^\d+\+?$/.test(trimmed);

                            if (isNumericBadge) {
                                // Badge shows count - detection completed but data not in cache yet
                                // Clear stale activeDetections flag and wait for cache write to complete
                                Logger.background(`[GET_DETECTION_DATA] Badge shows '${trimmed}' but no data - waiting for cache write...`);
                                activeDetections.delete(tabId);

                                // FIX: Wait for cache write to complete (400ms)
                                await new Promise(resolve => setTimeout(resolve, 400));

                                // Retry getting cached data
                                data = await DetectionEngineManager.getDetectionData(tabId);

                                // If still no cache, try using state.mainData directly
                                if (!data) {
                                    const retryState = detectionStates.get(tabId);
                                    if (retryState && retryState.mainData && retryState.mainData.length > 0) {
                                        Logger.background(`[GET_DETECTION_DATA] Using state.mainData directly for tab ${tabId}`);
                                        // Get expiry and cacheScope for proper display in popup
                                        const expiryMs = await DetectionEngineManager.getExpiryMs();
                                        const cacheScope = await Utils.getCacheScope();
                                        const now = Date.now();
                                        data = {
                                            detectionResults: retryState.mainData,
                                            timestamp: retryState.timestamp || now,
                                            url: retryState.url,
                                            favicon: retryState.favicon,
                                            fromStorage: false,
                                            processed: true,
                                            expiry: now + expiryMs,
                                            cacheScope: cacheScope
                                        };
                                    }
                                }

                                // CRITICAL: Badge is numeric = detection complete, return 'ok' not 'pending'
                                status = 'ok';
                            } else if (trimmed === BADGE.TEXT.LOADING) {
                                // Truly still analyzing
                                status = 'pending';
                            } else if (activeDetections.has(tabId)) {
                                // FIX: If tab is marked interrupted but still has active detection, treat as pending
                                // This handles race conditions where popup opens during analysis
                                status = 'pending';
                            } else if (interruptedDetections.has(tabId)) {
                                status = 'interrupted';
                            }
                            // If badge is empty or other value, status stays 'ok' (shows empty state)
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
                            Logger.background(`[GET_DETECTION_DATA] Clearing interrupted state for current tab ${activeTab.id} (user viewing popup)`);
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
                        // Logger.background('Scrapfly Background: Sending detection data for current tab:', data ? 'Data available' : 'No data');

                        // FIX: Layer 3 - If we have cached data and tab is marked as interrupted, clear it
                        // (Tab was interrupted but detection actually completed before interruption occurred)
                        if (data && interruptedDetections.has(activeTab.id)) {
                            Logger.background(`[GET_DETECTION_DATA] Clearing interrupted state for active tab ${activeTab.id} (has cached completed data)`);
                            interruptedDetections.delete(activeTab.id);
                        }

                        // Only check interrupted/pending status if NO cached data exists
                        if (!data) {
                            // FIX: Check badge first - if numeric, detection completed but cache not ready
                            let badgeText = '';
                            try {
                                badgeText = await chrome.action.getBadgeText({ tabId: activeTab.id });
                            } catch (badgeError) {
                                Logger.detection('[GET_DETECTION_DATA] Failed to read badge text for active tab:', badgeError.message);
                            }
                            const trimmed = badgeText ? badgeText.trim() : '';
                            const isNumericBadge = /^\d+\+?$/.test(trimmed);

                            if (isNumericBadge) {
                                // Badge shows count - detection completed but data not in cache yet
                                Logger.background(`[GET_DETECTION_DATA] Active tab badge shows '${trimmed}' but no data - waiting for cache write...`);
                                activeDetections.delete(activeTab.id);

                                // FIX: Wait for cache write to complete (400ms)
                                await new Promise(resolve => setTimeout(resolve, 400));

                                // Retry getting cached data
                                data = await getCurrentTabDetectionData();

                                // If still no cache, try using state.mainData directly
                                if (!data) {
                                    const retryState = detectionStates.get(activeTab.id);
                                    if (retryState && retryState.mainData && retryState.mainData.length > 0) {
                                        Logger.background(`[GET_DETECTION_DATA] Using state.mainData directly for active tab ${activeTab.id}`);
                                        // Get expiry and cacheScope for proper display in popup
                                        const expiryMs = await DetectionEngineManager.getExpiryMs();
                                        const cacheScope = await Utils.getCacheScope();
                                        const now = Date.now();
                                        data = {
                                            detectionResults: retryState.mainData,
                                            timestamp: retryState.timestamp || now,
                                            url: retryState.url,
                                            favicon: retryState.favicon,
                                            fromStorage: false,
                                            processed: true,
                                            expiry: now + expiryMs,
                                            cacheScope: cacheScope
                                        };
                                    }
                                }

                                // CRITICAL: Badge is numeric = detection complete, return 'ok' not 'pending'
                                status = 'ok';
                            } else if (trimmed === BADGE.TEXT.LOADING) {
                                // Truly still analyzing
                                status = 'pending';
                            } else if (activeDetections.has(activeTab.id)) {
                                // FIX: If tab is marked interrupted but still has active detection, treat as pending
                                // This handles race conditions where popup opens during analysis
                                status = 'pending';
                            } else if (interruptedDetections.has(activeTab.id)) {
                                status = 'interrupted';
                            }
                            // If badge is empty or other value, status stays 'ok' (shows empty state)
                        }
                        // If cached data exists, status stays 'ok' regardless of interrupted state
                    }
                }

                // FIX: Clear stale badge when cache has expired
                // If data is null and status is 'ok', the cache has expired or no detections exist
                // Clear the badge if it still shows an old numeric count
                if (!data && status === 'ok') {
                    const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
                    if (targetTabId) {
                        try {
                            const badgeText = await chrome.action.getBadgeText({ tabId: targetTabId });
                            const trimmed = badgeText ? badgeText.trim() : '';
                            const isNumericBadge = /^\d+\+?$/.test(trimmed);

                            if (isNumericBadge) {
                                Logger.background(`[GET_DETECTION_DATA] Cache expired, clearing stale badge '${trimmed}' for tab ${targetTabId}`);
                                await chrome.action.setBadgeText({ text: '', tabId: targetTabId });
                            }
                        } catch (e) {
                            // Silently fail
                        }
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
                Logger.error('BACKGROUND', 'Scrapfly Background: Error in GET_DETECTION_DATA:', error);
                sendResponse({ data: null, status: 'error', error: error.message });
            }
        })();
        return true; // Will respond asynchronously
    };
    registry['GET_DETECTION_DATA'] = handle_get_detection_data;

    const handle_request_detection = function({ request, sender, sendResponse, context }) {
        void context;

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
    };
    registry['REQUEST_DETECTION'] = handle_request_detection;

    const handle_clear_detection_data = function({ request, sender, sendResponse, context }) {
        void context;

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
    };
    registry['CLEAR_DETECTION_DATA'] = handle_clear_detection_data;

    const handle_js_hook_detection_batch = function({ request, sender, sendResponse, context }) {
        void context;

            // OPTIMIZED 3.4: Handle batched JS hook detections (from content.js optimization 2.4)
            (async () => {
                let tabId;  // FIX: Declare outside try block for finally access
                try {
                    if (!sender.tab || !sender.tab.id) {
                        Logger.error('BACKGROUND', '[Background] No tab info for JS hook batch');
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

                    // FIX: Mark batch processing as active to prevent finalization race conditions
                    const previousFlag = batchProcessingFlags.get(tabId);
                    batchProcessingFlags.set(tabId, true);
                    Logger.background(`%c[Batch Flag] SET to TRUE (batch start) for tab ${tabId}`, 'color: #f44336; font-weight: bold;');
                    Logger.background(`[Batch Flag] Previous value: ${previousFlag}, New value: true`);
                    Logger.background(`[Batch Flag] This BLOCKS finalization until set to FALSE`);

                    Logger.background(`[Background] JS Hook batch from tab ${tabId}: ${detections.length} hooks`);

                    // DEBUG: Log each hook detection
                    Logger.background(`[Background] JS Hooks details:`);
                    detections.forEach(hookData => {
                        const det = hookData.detection;

                        // Check if this is an inline hook (detector ID starts with 'inline-hook-')
                        const isInlineHook = det.detectorId && det.detectorId.startsWith('inline-hook-');

                        Logger.background(`[Background]   - ${det.detectorName} (ID: ${det.detectorId}) [${isInlineHook ? 'INLINE' : 'DYNAMIC'}]: ${det.hook.target}`);
                    });

                    // Ensure DetectorManager is initialized once
                    await ensureDetectorManagerInitialized();

                    // State already created above for cache check (line 2315)

                    // Record batch arrival time for deterministic finalization
                    state.lastHookBatchTime = Date.now();

                    // URL validation: Ensure URL hasn't changed during detection
                    if (state.url !== url) {
                        Logger.background(`[Background] URL changed during JS hooks for tab ${tabId}: ${url} → ${state.url} - skipping hooks`);
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
                            Logger.warn('BACKGROUND', `[Background] Detector ${detectorId} not found, skipping`);
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

                    Logger.background(`[Background] Processed ${detections.length} hooks in batch for tab ${tabId}`);

                } catch (error) {
                    Logger.error('BACKGROUND', '[Background] ERROR handling JS hook batch:', error);
                } finally {
                    // FIX: Mark batch processing as complete (with safety guard)
                    if (tabId) {
                        const wasActive = batchProcessingFlags.get(tabId);
                        batchProcessingFlags.set(tabId, false);
                        Logger.background(`%c[Batch Flag] SET to FALSE (batch complete) for tab ${tabId}`, 'color: #4caf50; font-weight: bold;');
                        Logger.background(`[Batch Flag] Was active: ${wasActive}, Now: false`);
                        Logger.background(`[Batch Flag] Batch processing complete - NOW allowing finalization`);
                        // Trigger finalization check in case it was deferred
                        // NOTE: During late arrival phase, this won't finalize until buffer expires
                        Logger.background(`[Batch Flag] Calling checkAndFinalizeDetection after batch complete...`);
                        checkAndFinalizeDetection(tabId);
                    }
                }
            })();
            return false; // No response needed for batches

        // REMOVED: Old JS_HOOKS_COMPLETE handler - replaced with comprehensive handler below (line ~2225)
    };
    registry['JS_HOOK_DETECTION_BATCH'] = handle_js_hook_detection_batch;

    const handle_window_detections = function({ request, sender, sendResponse, context }) {
        void context;

        // Handle window detections from MAIN world
        (async () => {
            try {
                if (!sender.tab || !sender.tab.id) {
                    Logger.error('BACKGROUND', '[Background] No tab info for window detections');
                    return;
                }

                const tabId = sender.tab.id;

                // Early exit if tab is using cache
                if (tabsUsingCache.has(tabId)) {
                    Logger.background(`[Background] Window Detections - Tab ${tabId} using cache - discarding properties immediately`);
                    return; // Skip all processing for cached tabs
                }

                const url = sender.tab.url;
                const { detections, executionTime } = request;

                // Validate detections array
                if (!Array.isArray(detections)) {
                    Logger.error('BACKGROUND', '[Background] Invalid detections format:', typeof detections);
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

                Logger.background(`[Background] Window property detections from tab ${tabId}: ${detections.length} properties in ${executionTime}ms`);

                // DEBUG: Log each window property detection
                if (detections.length > 0) {
                    Logger.background(`[Background] Window property details:`);
                    detections.forEach(det => {
                        Logger.background(`[Background]   - ${det.detectorName} (${det.detectorId}): window.${det.property.path}`);
                    });
                } else {
                    Logger.background(`[Background] No window properties detected (none matched conditions)`);
                }

                // State already created above for cache check (line 2470)
                // Validate state
                if (!state) {
                    Logger.error('BACKGROUND', '[Background] Failed to get/create detection state for tab', tabId);
                    return;
                }

                // URL validation: Ensure URL hasn't changed during detection
                if (state.url !== url) {
                    Logger.background(`[Background] URL changed during window props for tab ${tabId}: ${url} → ${state.url} - skipping window props`);
                    return; // Don't store window props for the wrong URL
                }

                // Initialize mainData array if it doesn't exist
                if (!Array.isArray(state.mainData)) {
                    Logger.background('[Background] Initializing mainData array for tab', tabId);
                    state.mainData = [];
                }

                // Process each window property detection
                for (const detection of detections) {
                    if (!detection || !detection.detectorId) {
                        Logger.warn('BACKGROUND', '[Background] Skipping invalid detection:', detection);
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
                        Logger.background(`[Background] Added window property: ${detection.property.path} for ${detection.detectorName}`);
                    }

                    // Update overall confidence
                    detectionObj.confidence = Math.max(...detectionObj.matches.map(m => m.confidence || 0));
                }

                Logger.background(`[Background] Processed ${detections.length} window properties for tab ${tabId}`);

                // Note: windowPropertiesComplete will be marked by WINDOW_PROPS_COMPLETE signal
                // This allows multiple checks to complete before finalization

            } catch (error) {
                Logger.error('BACKGROUND', '[Background] ERROR handling window property detections:', error);
            }
        })();
        return false; // No response needed
    };
    registry['WINDOW_DETECTIONS'] = handle_window_detections;

    const handle_window_props_complete = function({ request, sender, sendResponse, context }) {
        void context;

        // Window properties collection complete - mark session and potentially finalize
        (async () => {
            try {
                if (!sender.tab || !sender.tab.id) {
                    Logger.error('BACKGROUND', '[Background] No tab info for window props complete');
                    return;
                }

                const tabId = sender.tab.id;

                // Early exit if tab is using cache
                if (tabsUsingCache.has(tabId)) {
                    Logger.background(`[Background] Window Props - Tab ${tabId} using cache - discarding signal`);
                    sendResponse({ status: 'cached', message: 'Tab using cached detection' });
                    return; // Skip all processing for cached tabs
                }

                const url = request.url;

                Logger.background(`%c[WINDOW_PROPS_COMPLETE] Signal RECEIVED from tab ${tabId}`, 'color: #00cc00; font-weight: bold; font-size: 14px;');
                Logger.background(`[WINDOW_PROPS_COMPLETE] Window props stats:`, {
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
                    Logger.warn('BACKGROUND', `%c[WINDOW_PROPS_COMPLETE] URL MISMATCH - IGNORING SIGNAL for tab ${tabId}`, 'color: #f44336; font-weight: bold;');
                    Logger.warn('BACKGROUND', `[WINDOW_PROPS_COMPLETE]   State URL: ${state.url}`);
                    Logger.warn('BACKGROUND', `[WINDOW_PROPS_COMPLETE]   Request URL: ${url}`);
                    Logger.warn('BACKGROUND', `[WINDOW_PROPS_COMPLETE]   Normalized state: ${normalizedStateUrl}`);
                    Logger.warn('BACKGROUND', `[WINDOW_PROPS_COMPLETE]   Normalized request: ${normalizedRequestUrl}`);
                    Logger.warn('BACKGROUND', `[WINDOW_PROPS_COMPLETE] This will cause 86% hang - signal will never be processed!`);
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

                Logger.background(`[WINDOW_PROPS_COMPLETE] State flags:`, {
                    before: beforeState,
                    after: {
                        windowPropertiesComplete: state.windowPropertiesComplete,
                        completedMethods: Array.from(state.completedMethods),
                        finalized: state.finalized
                    }
                });

                // Only send progress update and re-check finalization if detection isn't already done
                // When finalized, onDetection has already fired — late progress events would be confusing
                if (!state.finalized) {
                    markMethodComplete(tabId, 'windowProperties');
                    Logger.background(`%c[WINDOW_PROPS_COMPLETE] Window properties marked complete - calling finalization check`, 'color: #4caf50; font-weight: bold;');
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

            // JS hooks collection complete - mark session and potentially finalize
            (async () => {
                try {
                    if (!sender.tab || !sender.tab.id) {
                        Logger.error('BACKGROUND', '[Background] No tab info for JS hooks complete');
                        return;
                    }

                    const tabId = sender.tab.id;
                    const url = request.url;

                    Logger.background(`%c[Background] JS_HOOKS_COMPLETE received from tab ${tabId}`, 'color: #00cc00; font-weight: bold;');
                    Logger.background(`[Background] Hook stats:`, {
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
                        Logger.warn('BACKGROUND', `[Background] URL mismatch - ignoring JS hooks complete for tab ${tabId}`);
                        Logger.warn('BACKGROUND', `[Background]   State URL: ${state.url}`);
                        Logger.warn('BACKGROUND', `[Background]   Request URL: ${url}`);
                        Logger.warn('BACKGROUND', `[Background]   Normalized state: ${normalizedStateUrl}`);
                        Logger.warn('BACKGROUND', `[Background]   Normalized request: ${normalizedRequestUrl}`);
                        sendResponse({ status: 'url_changed' });
                        return;
                    }

                    state.hooksComplete = true;
                    state.hooksTimedOut = false;
                    state.hooksCompletionReason = request.completionReason || state.hooksCompletionReason || null;
                    state.hooksCompletionTime = request.completionTime || state.hooksCompletionTime || null;
                    state.hooksUninstallStats = request.uninstallStats || state.hooksUninstallStats || null;

                    // Debug-only: log uninstall stats if provided
                    const debugMode = await ensureDebugMode(state);
                    if (debugMode && request.uninstallStats) {
                        Logger.background(`[Background] Hook uninstall stats:`, request.uninstallStats);
                    }

                    // Only send progress update and re-check finalization if detection isn't already done
                    if (!state.finalized) {
                        markMethodComplete(tabId, 'jsHooks');

                        Logger.background(`[Background] Hooks marked complete`);
                        Logger.background(`[Background] Current completion status: ${state.completedMethods.size}/7 methods`);
                        Logger.background(`[Background] Completed methods: ${Array.from(state.completedMethods).join(', ')}`);

                        checkAndFinalizeDetection(tabId);
                    }

                    // SAFETY: If still not finalized after 1 second, force another check
                    // This handles edge cases where the debounce logic might miss the completion
                    setTimeout(() => {
                        const currentState = detectionStates.get(tabId);
                        if (currentState && !currentState.finalized && currentState.completedMethods.has('jsHooks')) {
                            Logger.warn('BACKGROUND', `[Background] Retry: JS hooks complete but detection not finalized, forcing check`);
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

        // OPTIMIZED 3.1: Lazy interceptor initialization
        // reCAPTCHA messages - delegate to reCaptchaHandleMessage
    };
    registry['JS_HOOKS_COMPLETE'] = handle_js_hooks_complete;

    const handle_get_detectors = function({ request, sender, sendResponse, context }) {
        void context;

        // Content script requesting all detectors (for hook installation at document_start)
        (async () => {
            try {
                const startTime = Date.now();
                Logger.background('[Background] GET_DETECTORS request received');

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
                        Logger.background(`[Background] Detectors loaded successfully in ${elapsed}ms (${attempts} attempts)`);
                        Logger.background(`[Background] Sending ${detectorCount} detectors across ${Object.keys(allDetectors).length} categories`);

                        sendResponse({
                            detectors: allDetectors
                        });
                        return;
                    }

                    // Detectors not loaded yet, wait and retry
                    const attemptsLeft = retries - 1;
                    const elapsedSoFar = Date.now() - startTime;
                    Logger.warn('BACKGROUND', `[Background] Detectors not loaded yet (${elapsedSoFar}ms elapsed), retrying... (${attemptsLeft} attempts left)`);

                    // Diagnostic info on why detectors might not be ready
                    if (retries === maxRetries) {
                        Logger.background('[Background] Initial diagnostic: DetectorManager state:', {
                            exists: !!detectorManager,
                            initialized: detectorManager?.initialized,
                            detectorCount: detectorManager ? Object.keys(detectorManager.detectors || {}).length : 0,
                            categoryManagerExists: !!categoryManager
                        });

                        // Check raw storage to compare with detectorManager state
                        chrome.storage.local.get(['scrapfly_detectors', 'scrapfly_categories'], (rawStorage) => {
                            Logger.background('[Background] DIAGNOSTIC: Raw chrome.storage.local contents:', {
                                hasDetectorsKey: !!rawStorage.scrapfly_detectors,
                                hasCategoriesKey: !!rawStorage.scrapfly_categories,
                                detectorsTimestamp: rawStorage.scrapfly_detectors?.timestamp,
                                detectorsDataKeys: rawStorage.scrapfly_detectors?.detectors ? Object.keys(rawStorage.scrapfly_detectors.detectors) : [],
                                categoriesDataKeys: rawStorage.scrapfly_categories?.categories ? Object.keys(rawStorage.scrapfly_categories.categories) : []
                            });

                            // Show sample of what's in storage
                            if (rawStorage.scrapfly_detectors?.detectors) {
                                const detectorCategories = Object.keys(rawStorage.scrapfly_detectors.detectors);
                                Logger.background('[Background] DIAGNOSTIC: Storage detector categories:', detectorCategories);

                                // Show count per category from storage
                                for (const cat of detectorCategories) {
                                    const detectorNames = Object.keys(rawStorage.scrapfly_detectors.detectors[cat] || {});
                                    Logger.background(`[Background] DIAGNOSTIC: Storage category "${cat}": ${detectorNames.length} detectors`);
                                }
                            }

                            // Compare with detectorManager state
                            if (detectorManager?.detectors) {
                                const managerCategories = Object.keys(detectorManager.detectors);
                                Logger.background('[Background] DIAGNOSTIC: DetectorManager.detectors categories:', managerCategories);

                                if (managerCategories.length === 0 && rawStorage.scrapfly_detectors?.detectors) {
                                    Logger.error('BACKGROUND', '[Background] DIAGNOSTIC: MISMATCH! Storage has detectors but detectorManager.detectors is empty');
                                    Logger.error('BACKGROUND', '[Background] DIAGNOSTIC: This indicates loadFromStorage() failed to populate detectorManager.detectors');
                                }
                            }
                        });
                    }

                    // Show progress every 5 attempts
                    if ((maxRetries - retries) % 5 === 0 && retries < maxRetries) {
                        const progress = Math.round(((maxRetries - retries) / maxRetries) * 100);
                        Logger.background(`[Background] Progress: ${progress}% (waiting for JSON files to load...)`);
                    }

                    retries--;
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, 300)); // Wait 300ms before retry
                    }
                }

                // Failed to load detectors after retries
                const elapsed = Date.now() - startTime;
                Logger.error('BACKGROUND', `[Background] Failed to load detectors after ${elapsed}ms (${maxRetries} retries)`);
                Logger.error('BACKGROUND', '[Background] Final diagnostic:', {
                    detectorManagerExists: !!detectorManager,
                    initialized: detectorManager?.initialized,
                    categoriesCount: detectorManager ? Object.keys(detectorManager.detectors || {}).length : 0,
                    categoryManagerExists: !!categoryManager,
                    categoryManagerInitialized: categoryManager?.initialized
                });

                // Check if categories were loaded but not detectors
                if (categoryManager?.initialized && categoryManager.categories) {
                    Logger.error('BACKGROUND', '[Background] Categories loaded but detectors empty - JSON loading issue');
                    Logger.error('BACKGROUND', '[Background] Available categories:', Object.keys(categoryManager.categories));
                } else {
                    Logger.error('BACKGROUND', '[Background] CategoryManager not initialized - initialization issue');
                }

                Logger.error('BACKGROUND', '[Background] Content script will receive empty config - extension may not work correctly');
                Logger.error('BACKGROUND', '[Background] Recommendation: Reload extension and refresh all tabs');

                // ALWAYS send response even on failure
                sendResponse({ detectors: {} });
            } catch (error) {
                Logger.error('BACKGROUND', '[Background] Error getting detectors:', error);
                Logger.error('BACKGROUND', '[Background] Stack trace:', error.stack);

                // ALWAYS send response even on error
                sendResponse({ detectors: {} });
            }
        })();
        return true; // Will respond asynchronously
    };
    registry['GET_DETECTORS'] = handle_get_detectors;

}
