/** Normalize only URL details that do not identify a different document. */
function normalizeDetectionMessageUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.origin + parsed.pathname + parsed.search;
    } catch (_) { return String(url || ''); }
}

/** Validate the sending document before any state-creating helper can replace a scan. */
async function resolveDetectionMessageDocument(sender, url) {
    const tabId = sender.tab?.id;
    if (!tabId || (sender.frameId !== undefined && sender.frameId !== 0) || !url) return null;
    const normalized = normalizeDetectionMessageUrl(url);
    if (sender.url && normalizeDetectionMessageUrl(sender.url) !== normalized) return null;
    const previousState = detectionStates.get(tabId);
    let verified = false;
    if (sender.documentId && typeof chrome.webNavigation?.getFrame === 'function') {
        try {
            const frame = await chrome.webNavigation.getFrame({ tabId, frameId: 0 });
            if (!frame || (frame.documentId && frame.documentId !== sender.documentId) ||
                (frame.url && normalizeDetectionMessageUrl(frame.url) !== normalized)) return null;
            verified = frame.documentId === sender.documentId;
        } catch (_) { return null; } // closed/unavailable frames cannot own a scan
    }
    if (!verified && sender.tab.url && normalizeDetectionMessageUrl(sender.tab.url) !== normalized) return null;
    const state = detectionStates.get(tabId);
    if (state !== previousState && (!state || normalizeDetectionMessageUrl(state.url) !== normalized ||
        (sender.documentId && state.documentId && state.documentId !== sender.documentId))) return null;
    if (!verified && state && (normalizeDetectionMessageUrl(state.url) !== normalized ||
        (sender.documentId && state.documentId && state.documentId !== sender.documentId))) return null;
    return { tabId, url, documentId: sender.documentId || null, verified };
}

function detectionStateForDocument(document) {
    const { tabId, url, documentId, verified } = document;
    let current = detectionStates.get(tabId);
    if (current && verified && documentId && current.documentId && current.documentId !== documentId) {
        DetectionSessionStore.cancel(tabId, 'document_changed', current);
        current = null;
    }
    if (current && verified && documentId && current.documentId === documentId && current.url !== url &&
        normalizeDetectionMessageUrl(current.url) !== normalizeDetectionMessageUrl(url)) {
        // The page changed its own address (history.pushState/replaceState): the same document, so the same
        // scan, now under the address the tab shows
        (current.previousUrls ||= []).push(current.url);
        current.url = url;
        if (current.activeDetection) current.activeDetection.url = url;
    }
    const sameUrl = current && normalizeDetectionMessageUrl(current.url) === normalizeDetectionMessageUrl(url);
    const state = getOrCreateDetectionState(tabId, sameUrl ? current.url : url);
    if (documentId) state.documentId = documentId;
    return state;
}

/**
 * A page served from the cache reports its hooks and window checks as skipped, and a slow page can report them
 * after its scan already finished. With no scan running for the tab such a report has nothing to complete, and
 * must not start a scan that would never finish (the popup would show "Searching", the worker would be held
 * awake and the page's later requests would no longer be checked).
 */
function skippedForCachedPage(document, reason) {
    const reasons = globalThis.ScrapflyBridgeProtocol.COMPLETION_REASONS;
    const cacheHit = reason === reasons.HOOKS.CACHE_HIT || reason === reasons.WINDOW.CACHE_HIT;
    if (detectionStates.has(document.tabId)) return false;
    // A completion that arrives after this document's scan already finished (the scan ended on its timeout first)
    // has nothing left to complete: a new state would never finish, show "Searching" and hold the worker awake
    const finished = typeof finishedPages !== 'undefined' ? finishedPages.get(document.tabId) : null;
    const sameDocument = !!finished && !!document.documentId && finished.documentId === document.documentId;
    return cacheHit || sameDocument;
}

/**
 * registerDetectionHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerDetectionHandlers(registry, context) {
    const BRIDGE_TYPES = globalThis.ScrapflyBridgeProtocol.MESSAGE_TYPES;
    void context;

    const handle_page_load_notification = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            try {
                const document = await resolveDetectionMessageDocument(sender, request.url);
                if (!document) { sendResponse({ status: 'url_changed' }); return; }
                const existing = detectionStates.get(document.tabId);
                if (existing) detectionStateForDocument(document);
                interruptedDetections.delete(document.tabId);
                await ensureDetectorManagerInitialized();
                if (!await resolveDetectionMessageDocument(sender, request.url)) { sendResponse({ status: 'url_changed' }); return; }

                const result = await DetectionEngineManager.handlePageLoadNotification(request, sender, {
                    chrome,
                    Settings,
                    CategoryManager,
                    HistoryRecorder,
                    isCurrentDocument: async () => !!(await resolveDetectionMessageDocument(sender, request.url)),
                    Utils,
                    categoryManager,
                    recentDetectionRequests
                });

                sendResponse(result || { status: 'ok' });
            } catch (error) {
                Logger.error('BACKGROUND', '[Background] Error handling PAGE_LOAD_NOTIFICATION:', error);
                sendResponse({ status: 'error', error: error.message });
            }
        })();
        return true; // Keep SW alive until badge/cache work completes
    };
    registry[WorkerMessages.PAGE_LOAD_NOTIFICATION] = handle_page_load_notification;

    const handle_detection_data = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            Logger.debug('SCAN', `Page data from tab ${sender.tab?.id}`);
            try {
                const document = await resolveDetectionMessageDocument(sender, request?.data?.url || sender.tab?.url);
                if (!document) { sendResponse({ status: 'url_changed' }); return; }
                detectionStateForDocument(document);
                const processing = processDetectionData(request, sender);
                // processDetectionData begins its session synchronously before
                // awaiting collection; preserve its document identity on retries.
                const state = detectionStates.get(document.tabId);
                if (state && document.documentId) state.documentId = document.documentId;
                await processing;
                sendResponse({ status: 'received', tabId: sender.tab?.id });
            } catch (error) {
                Logger.error('BACKGROUND', '[DetectionData] ERROR in processDetectionData:', error);
                // Notify content script for JS API error event (scrapfly:onError)
                try {
                    const tabId = sender.tab?.id;
                    if (tabId) {
                        chrome.tabs.sendMessage(tabId, {
                            type: WorkerMessages.DETECTION_ERROR,
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
    registry[WorkerMessages.DETECTION_DATA] = handle_detection_data;

    // Rules editor → Test on this page: the unsaved rule against the active tab, nothing stored (background/rule-test.js)
    registry[WorkerMessages.RULE_TEST] = function({ request, sender, sendResponse }) {
        if (!MessageSender.isExtensionPage(sender)) { sendResponse({ status: 'error' }); return false; }
        RuleTestRuntime.run(request).then(
            (result) => sendResponse(result),
            (error) => { Logger.warn('BACKGROUND', '[RuleTest] failed:', error && error.message); sendResponse({ status: 'error' }); }
        );
        return true;
    };

    // Rules → From this page: what the page in the tab is made of, for a new rule (background/rule-suggest.js)
    registry[WorkerMessages.RULE_SUGGEST_PAGE] = function({ request, sender, sendResponse }) {
        if (!MessageSender.isExtensionPage(sender)) { sendResponse({ status: 'error' }); return false; }
        RuleSuggestRuntime.collect(request).then(
            (result) => sendResponse(result),
            (error) => { Logger.warn('BACKGROUND', '[RuleSuggest] failed:', error && error.message); sendResponse({ status: 'error' }); }
        );
        return true;
    };

    const handle_content_script_ready = function({ request, sender, sendResponse, context }) {
        void context;

        Logger.debug('SCAN', `Content script ready: ${request.url}`);
        sendResponse({ status: 'acknowledged' });
    };
    registry[WorkerMessages.CONTENT_SCRIPT_READY] = handle_content_script_ready;

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
                        Logger.debug('BACKGROUND', `[GET_DETECTION_DATA] Clearing interrupted state for current tab ${targetTabId} (user viewing popup)`);
                        interruptedDetections.delete(targetTabId);
                    }

                    data = request.tabId
                        ? await DetectionEngineManager.getDetectionData(targetTabId)
                        : await getCurrentTabDetectionData();

                    // A failed rescan must not be presented as a successful older cache.
                    if (detectionStates.get(targetTabId)?.failed) data = null;

                    // Completed data wins over stale interrupted markers
                    if (data && interruptedDetections.has(targetTabId)) {
                        Logger.debug('BACKGROUND', `[GET_DETECTION_DATA] Clearing interrupted state for tab ${targetTabId} (has cached completed data)`);
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
                        const hasActiveState = !!(detectionState && !detectionState.finalized && !detectionState.failed);
                        let activeDetection = activeDetections.get(targetTabId);
                        if (activeDetection?.pendingRequest &&
                            Date.now() - activeDetection.startTime > Constants.REQUEST_DETECTION_PENDING_TIMEOUT) {
                            Logger.debug('BACKGROUND', `[GET_DETECTION_DATA] Clearing stale pending request for tab ${targetTabId}`);
                            activeDetections.delete(targetTabId);
                            activeDetection = null;
                        }
                        const hasActiveDetection = !!activeDetection;
                        const isRecentlyCleared = recentlyClearedTabs.has(targetTabId);
                        const isInterrupted = interruptedDetections.has(targetTabId);

                        if (detectionState?.failed) {
                            status = 'error';
                        } else if (isRecentlyCleared) {
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
                                Logger.debug('BACKGROUND', `[GET_DETECTION_DATA] Failed to read badge text for tab ${targetTabId}:`, badgeError.message);
                            }
                            const trimmed = badgeText ? badgeText.trim() : '';
                            const isLoadingBadge = isLoadingBadgeText(trimmed);

                            // Clear stale loading badge for idle tab
                            if (isLoadingBadge) {
                                Logger.debug('BACKGROUND', `[GET_DETECTION_DATA] Clearing stale loading badge for idle tab ${targetTabId}`);
                                try {
                                    await chrome.action.setBadgeText({ text: BADGE.TEXT.EMPTY, tabId: targetTabId });
                                } catch (badgeClearError) {
                                    Logger.debug('BACKGROUND', `[GET_DETECTION_DATA] Failed to clear stale loading badge for tab ${targetTabId}:`, badgeClearError.message);
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
                                    Logger.debug('BACKGROUND', `[GET_DETECTION_DATA] Clearing stale numeric badge '${trimmed}' for idle tab ${targetTabId}`);
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
    registry[WorkerMessages.GET_DETECTION_DATA] = handle_get_detection_data;

    const handle_request_detection = function({ request, sender, sendResponse, context }) {
        void context;

        // Initialize progress update before delegation
        if (request.tabId) {
            sendProgressUpdate(request.tabId, 'main', new Set(), 7);
        }

        (async () => {
            try {
                await ensureDetectorManagerInitialized();

                return await DetectionEngineManager.handleRequestDetection(request, sendResponse, {
                    chrome,
                    Utils,
                    recentDetectionRequests,
                    activeDetections
                });
            } catch (error) {
                // Without this, a throw before handleRequestDetection calls
                // sendResponse leaves the message channel open forever and the
                // popup hangs with no diagnostic.
                Logger.error('BACKGROUND', '[REQUEST_DETECTION] Unhandled error:', error);
                try { sendResponse({ status: 'error', error: error && error.message }); } catch (_) { /* channel already closed */ }
            }
        })();
        return true; // Will respond asynchronously
    };
    registry[WorkerMessages.REQUEST_DETECTION] = handle_request_detection;

    const handle_js_hook_detection_batch = function({ request, sender, sendResponse, context }) {
        void context;

            // Process batched JS hook detections
            (async () => {
                let tabId;
                let state;
                let ownsBatch = false;
                try {
                    if (!sender.tab || !sender.tab.id) {
                        Logger.warn('BACKGROUND', '[hookBatch] No tab info in sender');
                        return;
                    }

                    tabId = sender.tab.id;

                    const detections = request.detections || [];

                    if (detections.length === 0) return;

                    // Extract URL for cache check
                    const url = detections[0]?.url;
                    if (!url) return;

                    const document = await resolveDetectionMessageDocument(sender, url);
                    if (!document || detections.some(item => normalizeDetectionMessageUrl(item.url) !== normalizeDetectionMessageUrl(url))) return;
                    state = detectionStateForDocument(document);
                    // Own the batch across every async lookup so finalization
                    // cannot overtake already-admitted hook evidence.
                    state.pendingHookBatches = (state.pendingHookBatches || 0) + 1;
                    ownsBatch = true;
                    state.lastHookBatchTime = Date.now();
                    batchProcessingFlags.set(tabId, true);

                    // CACHE CHECK: If cache exists for this URL, skip processing hooks entirely
                    const cachedData = DetectionEngineManager.scansFresh(tabId) ? null
                        : await DetectionEngineManager.getStoredDetection(url, { privateWindow: sender.tab?.incognito === true });
                    if (!await resolveDetectionMessageDocument(sender, url) || !DetectionSessionStore.isCurrent(tabId, state)) return;
                    if (cachedData) {
                        // Mark this detection as using cache to suppress misleading warning logs
                        state.usedCache = true;

                        return; // Don't process hooks - we have cached results
                    }

                    Logger.debug('HOOKS', `Tab ${tabId}: ${detections.length} hook hits`,
                        detections.map(h => `${h.detection?.detectorName}: ${h.detection?.hook?.target}`));
                    await ensureDetectorManagerInitialized();
                    if (!await resolveDetectionMessageDocument(sender, url) || !DetectionSessionStore.isCurrent(tabId, state)) return;

                    // Record batch arrival time for deterministic finalization
                    state.lastHookBatchTime = Date.now();

                    if (normalizeDetectionMessageUrl(state.url) !== normalizeDetectionMessageUrl(url)) {
                        Logger.debug('HOOKS', `Tab ${tabId} navigated; hook hits dropped`);
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
                                    author: fullDetector.author,
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
                            // A hook that declares no confidence gets the default, like every other rule (0 stays 0)
                            confidence: Number.isFinite(detection.hook.confidence) ? detection.hook.confidence : Constants.DEFAULT_MATCH_CONFIDENCE,
                            description: detection.hook.description,
                            ...(detection.hook.id ? { patternId: detection.hook.id } : {})
                        };

                        const isDuplicate = detector.matches.some(m => m.pattern === newMatch.pattern);
                        if (!isDuplicate) {
                            detector.matches.push(newMatch);
                        }

                        detector.confidence = Math.max(...detector.matches.map(m => m.confidence || 0));
                    }


                } catch (error) {
                    Logger.error('BACKGROUND', '[Background] ERROR handling JS hook batch:', error);
                } finally {
                    if (ownsBatch) state.pendingHookBatches = Math.max(0, (state.pendingHookBatches || 1) - 1);
                    if (state && DetectionSessionStore.isCurrent(tabId, state)) {
                        batchProcessingFlags.set(tabId, (state.pendingHookBatches || 0) > 0);
                        if (!state.pendingHookBatches) checkAndFinalizeDetection(tabId);
                    }
                }
            })();
            return false; // No response needed for batches

    };
    registry[BRIDGE_TYPES.JS_HOOK_DETECTION_BATCH] = handle_js_hook_detection_batch;

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

                const url = sender.url || sender.tab.url;
                const { detections, executionTime } = request;

                if (!Array.isArray(detections)) {
                    Logger.warn('BACKGROUND', '[WINDOW_DETECTIONS] Invalid detections format:', typeof detections);
                    return;
                }

                const document = await resolveDetectionMessageDocument(sender, url);
                if (!document) return;
                const state = detectionStateForDocument(document);

                // Skip if cached results exist for this URL
                const cachedData = DetectionEngineManager.scansFresh(tabId) ? null
                    : await DetectionEngineManager.getStoredDetection(url, { privateWindow: sender.tab?.incognito === true });
                if (!await resolveDetectionMessageDocument(sender, url) || !DetectionSessionStore.isCurrent(tabId, state)) return;
                if (cachedData) {
                    state.usedCache = true;
                    return;
                }

                if (detections.length > 0) {
                    Logger.debug('SCAN', `Tab ${tabId}: ${detections.length} window properties`,
                        detections.map(det => `${det.detectorName}: window.${det.property?.path}`));
                }

                // Validate state
                if (!state) {
                    Logger.error('BACKGROUND', '[Background] Failed to get/create detection state for tab', tabId);
                    return;
                }

                if (normalizeDetectionMessageUrl(state.url) !== normalizeDetectionMessageUrl(url)) {
                    Logger.debug('SCAN', `Tab ${tabId} navigated; window properties dropped`);
                    return;
                }

                if (!Array.isArray(state.mainData)) {
                    state.mainData = [];
                }

                for (const detection of detections) {
                    if (!detection || !detection.detectorId) {
                        Logger.warn('BACKGROUND', '[WINDOW_DETECTIONS] Skipping invalid detection:', detection);
                        continue;
                    }

                    let detectionObj = state.mainData.find(d => d && (d.detector?.id === detection.detectorId || d.id === detection.detectorId));
                    if (!detectionObj) {
                        const categoryKey = Categories.normalize(detection.category);
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
                                author: fullDetector?.author,
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
                    }

                    detectionObj.confidence = Math.max(...detectionObj.matches.map(m => m.confidence || 0));
                }

            } catch (error) {
                Logger.error('BACKGROUND', '[Background] ERROR handling window property detections:', error);
            }
        })();
        return false; // No response needed
    };
    registry[BRIDGE_TYPES.WINDOW_DETECTIONS] = handle_window_detections;

    // A response body the page read for a body: "response" payload rule
    // (content.js forwards it from the MAIN world). Top frame only; the page
    // origin comes from Chrome's sender, not from the message.
    const handle_response_body = function({ request, sender, sendResponse, context }) {
        void context; void sendResponse;
        try {
            const tabId = sender?.tab?.id;
            if (!tabId || (sender.frameId !== undefined && sender.frameId !== 0)) return false;
            if (typeof request?.url !== 'string' || request.url.length > 4096 || typeof request.body !== 'string' || !request.body) return false;
            let pageOrigin = '';
            try { pageOrigin = new URL(sender.url || sender.tab.url).origin; } catch (_) { return false; }
            recordCapturedResponse(tabId, {
                url: request.url,
                method: typeof request.method === 'string' ? request.method.slice(0, 16).toUpperCase() : 'GET',
                status: Number.isFinite(request.status) ? request.status : 0,
                data: request.body.slice(0, Constants.MAX_RESPONSE_BODY_CHARS),
                type: 'response',
                pageOrigin,
                timestamp: Date.now()
            });
        } catch (error) {
            Logger.error('BACKGROUND', '[RESPONSE_BODY] Failed to record a response:', error);
        }
        return false; // No response needed
    };
    registry[BRIDGE_TYPES.RESPONSE_BODY] = handle_response_body;

    const handle_window_props_complete = function({ request, sender, sendResponse, context }) {
        void context;

        // Mark window properties complete and check finalization
        (async () => {
            try {
                if (!sender.tab || !sender.tab.id) {
                    Logger.warn('BACKGROUND', '[WINDOW_PROPS_COMPLETE] No tab info in sender');
                    sendResponse({ status: 'url_changed' });
                    return;
                }

                const tabId = sender.tab.id;

                const url = request.url;

                const document = await resolveDetectionMessageDocument(sender, url);
                if (!document) { sendResponse({ status: 'url_changed' }); return; }
                if (skippedForCachedPage(document, request.reason)) { sendResponse({ status: 'success' }); return; }
                const state = detectionStateForDocument(document);

                state.windowPropertiesComplete = true;
                state.windowStats = {
                    detected: request.detectedCount, checked: request.totalChecked,
                    elapsedMs: request.elapsedMs, reason: request.reason
                };

                // Skip progress updates after finalization (onDetection already fired)
                if (!state.finalized) {
                    markMethodComplete(tabId, 'windowProperties');
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
    registry[BRIDGE_TYPES.WINDOW_PROPS_COMPLETE] = handle_window_props_complete;

    const handle_js_hooks_complete = function({ request, sender, sendResponse, context }) {
        void context;

            // Mark hooks complete and check finalization
            (async () => {
                try {
                    if (!sender.tab || !sender.tab.id) {
                        Logger.warn('BACKGROUND', '[JS_HOOKS_COMPLETE] No tab info in sender');
                        sendResponse({ status: 'url_changed' });
                        return;
                    }

                    const tabId = sender.tab.id;
                    const url = request.url;

                    const document = await resolveDetectionMessageDocument(sender, url);
                    if (!document) { sendResponse({ status: 'url_changed' }); return; }
                    if (skippedForCachedPage(document, request.completionReason)) { sendResponse({ status: 'success' }); return; }
                    const state = detectionStateForDocument(document);

                    state.hooksComplete = true;
                    state.hooksTimedOut = false;
                    state.hooksCompletionReason = request.completionReason || state.hooksCompletionReason || null;
                    state.hooksCompletionTime = request.completionTime || state.hooksCompletionTime || null;
                    state.hooksUninstallStats = request.uninstallStats || state.hooksUninstallStats || null;
                    state.hooksFired = typeof request.totalDetections === 'number' ? request.totalDetections : state.hooksFired;

                    if (!state.finalized) {
                        markMethodComplete(tabId, 'jsHooks');

                        Logger.debug('SCAN', `Tab ${tabId}: hooks done, ${state.completedMethods.size}/7 methods`);

                        checkAndFinalizeDetection(tabId);
                    }

                    // The retry belongs to this document's scan, not whichever
                    // scan happens to occupy the tab a second later.
                    DetectionSessionStore.schedule(tabId, state, 'hooks-retry', () => {
                        if (!state.finalized && state.completedMethods.has('jsHooks')) checkAndFinalizeDetection(tabId);
                    }, 1000);

                    sendResponse({ status: 'success' });
                } catch (error) {
                    Logger.error('BACKGROUND', '[Background] ERROR handling JS hooks complete:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            })();
            return true; // Async response
    };
    registry[BRIDGE_TYPES.JS_HOOKS_COMPLETE] = handle_js_hooks_complete;

    const handle_get_detectors = function({ request, sender, sendResponse, context }) {
        void context;

        // Load detectors with retry for slow service worker startup
        (async () => {
            try {
                const startTime = Date.now();
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
                        Logger.debug('DETECTOR', `Sent ${detectorCount} detectors to a page (${elapsed}ms, ${attempts} attempts)`);

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
                        Logger.debug('DETECTOR', `Waiting for detector files: ${progress}%`);
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
    registry[WorkerMessages.GET_DETECTORS] = handle_get_detectors;

}
