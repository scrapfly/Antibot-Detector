/**
 * registerCacheHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerCacheHandlers(registry, context) {
    void context;

    const handle_check_cache_early = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            try {
                const { url } = request;
                Logger.background('[Background] [Early Cache] Checking cache for:', url);
                const cachedData = await DetectionEngineManager.getStoredDetection(url);

                if (cachedData) {
                    Logger.background('[Background] [Early Cache] HIT - returning cached data');
                    if (sender.tab?.id) {
                        tabsUsingCache.add(sender.tab.id);
                        Logger.background(`[Background] [Early Cache] Marked tab ${sender.tab.id} as using cache`);
                    }
                    sendResponse({
                        cacheHit: true,
                        detectionData: cachedData
                    });
                } else {
                    Logger.background('[Background] [Early Cache] MISS - detection needed');
                    if (sender.tab?.id) {
                        tabsUsingCache.delete(sender.tab.id);
                    }
                    sendResponse({
                        cacheHit: false
                    });
                }
            } catch (error) {
                Logger.error('BACKGROUND', '[Background] [Early Cache] Error checking cache:', error);
                sendResponse({
                    cacheHit: false,
                    error: error.message
                });
            }
        })();
        return true; // Will respond asynchronously
    };
    registry['CHECK_CACHE_EARLY'] = handle_check_cache_early;

    const handle_cache_hit_early_exit = function({ request, sender, sendResponse, context }) {
        void context;

        // Update badge from cached detection data
        (async () => {
            try {
                const { url, detectionData } = request;
                const tabId = sender.tab?.id;

                Logger.background('[Background] [Early Cache] Content script exited early due to cache hit for:', url);

                if (detectionData && tabId) {
                    const detectionCount = detectionData.detectionCount || 0;
                    const detections = Array.isArray(detectionData.detectionResults) ? detectionData.detectionResults : [];

                    if (detectionCount > 0) {
                        const badgeColors = await CategoryManager.getBadgeColors(categoryManager);
                        const count = detectionCount.toString();
                        let color;
                        if (detections.length > 0) {
                            const avgConfidence = DetectionUtils.computeAverageConfidence(detections);
                            const difficulty = DetectionUtils.getDifficultyLevel(detections, avgConfidence);
                            color = difficulty === 'High' ? badgeColors.high :
                                   difficulty === 'Medium' ? badgeColors.medium :
                                   badgeColors.low;
                        } else {
                            // Fallback for older cache payloads without detectionResults
                            color = detectionCount >= BADGE.THRESHOLDS.MEDIUM ? badgeColors.medium : badgeColors.low;
                        }

                        await chrome.action.setBadgeText({
                            text: count,
                            tabId: tabId
                        });
                        await chrome.action.setBadgeBackgroundColor({
                            color: color,
                            tabId: tabId
                        });
                        Logger.background(`[Background] [Early Cache] Badge updated: ${detectionCount} detections from cache`);
                    } else {
                        await chrome.action.setBadgeText({
                            text: BADGE.TEXT.CLEAN,
                            tabId: tabId
                        });
                        await chrome.action.setBadgeBackgroundColor({
                            color: BADGE.COLORS.CLEAN,
                            tabId: tabId
                        });
                        Logger.background('[Background] [Early Cache] Badge: clean page (no detections)');
                    }
                }

                sendResponse({ status: 'acknowledged' });
            } catch (error) {
                // Expected: tab may have closed
                if (error.message && error.message.includes('No tab with id')) {
                    Logger.background('[Background] [Early Cache] Tab closed, skipping badge update');
                    sendResponse({ status: 'acknowledged' }); // Still acknowledge
                } else {
                    Logger.error('BACKGROUND', '[Background] [Early Cache] Error updating badge:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            }
        })();
        return true; // Will respond asynchronously
    };
    registry['CACHE_HIT_EARLY_EXIT'] = handle_cache_hit_early_exit;

    const handle_clear_detection_cache = function({ request, sender, sendResponse, context }) {
        void context;

        // Clear both storage and in-memory caches
        (async () => {
            await DetectionEngineManager.handleClearDetectionCache(request, sendResponse, manuallyClearedCaches);

            if (request.tabId) {
                if (detectionStates.has(request.tabId)) {
                    detectionStates.delete(request.tabId);
                    Logger.background(`[Background] Cleared detectionStates for tab ${request.tabId}`);
                }

                if (activeDetections.has(request.tabId)) {
                    activeDetections.delete(request.tabId);
                    Logger.background(`[Background] Cleared activeDetections for tab ${request.tabId}`);
                }

                headersStore.delete(request.tabId);
                requestHeadersStore.delete(request.tabId);
                responseCookiesStore.delete(request.tabId);
                payloadStore.delete(request.tabId);
                networkUrlsStore.delete(request.tabId);
                tabsUsingCache.delete(request.tabId);

                recentlyClearedTabs.add(request.tabId);
                setTimeout(() => {
                    recentlyClearedTabs.delete(request.tabId);
                    Logger.background(`[Background] Tab ${request.tabId} removed from recently cleared list`);
                }, Constants.RECENTLY_CLEARED_TAB_TIMEOUT);

                try {
                    await chrome.action.setBadgeText({ text: BADGE.TEXT.CLEARED, tabId: request.tabId });
                    await chrome.action.setBadgeBackgroundColor({
                        color: BADGE.COLORS.CLEARED,
                        tabId: request.tabId
                    });
                    Logger.background(`[Background] Badge set to CLR for tab ${request.tabId}`);
                } catch (badgeError) {
                    Logger.warn('BACKGROUND', `[Background] Could not update badge for tab ${request.tabId}:`, badgeError);
                }

                Logger.background(`[Background] Complete cache clear for tab ${request.tabId} - all memory and storage cleared`);
            }
        })();
        return true; // Async response
    };
    registry['DETECTION_CLEAR_CACHE'] = handle_clear_detection_cache;
    registry['HISTORY_CLEAR_CACHE'] = handle_clear_detection_cache;

}
