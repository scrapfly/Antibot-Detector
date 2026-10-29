/**
 * One page's saved result and everything the worker holds for its tab: what
 * Detection → Clear Cache, History's Clear cache and the rescan shortcut
 * (background/commands.js) share. `sendResponse` answers the message, if any.
 */
async function clearTabDetectionCache(request, sendResponse = () => {}) {
    await DetectionEngineManager.handleClearDetectionCache(request, sendResponse);

    if (request.tabId) {
        DetectionSessionStore.cancel(request.tabId, 'cache_cleared');

        // Only the saved result goes: the page's response headers, cookies and requests stay with its tab (a new
        // page clears them, header-capture.js), so a scan of the same page without a reload still has them
        tabsUsingCache.delete(request.tabId);

        recentlyClearedTabs.add(request.tabId);
        setTimeout(() => {
            recentlyClearedTabs.delete(request.tabId);
            Logger.debug('BACKGROUND', `[Background] Tab ${request.tabId} removed from recently cleared list`);
        }, Constants.RECENTLY_CLEARED_TAB_TIMEOUT);

        try {
            await setBadgeTextColor(request.tabId, false, BADGE.COLORS.CLEARED);
            await chrome.action.setBadgeText({ text: BADGE.TEXT.CLEARED, tabId: request.tabId });
            await chrome.action.setBadgeBackgroundColor({
                color: BADGE.COLORS.CLEARED,
                tabId: request.tabId
            });
            Logger.debug('BACKGROUND', `[Background] Badge set to CLR for tab ${request.tabId}`);
        } catch (badgeError) {
            Logger.warn('BACKGROUND', `[Background] Could not update badge for tab ${request.tabId}:`, badgeError);
        }

        Logger.debug('BACKGROUND', `[Background] Cache cleared for tab ${request.tabId}: saved result removed, network capture kept`);
    }
}

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
                Logger.debug('CACHE', `Early check: ${url}`);
                // A result saved before the site was skipped (or left out of the chosen sites) is not served to it
                if (await Utils.isUrlBlacklisted(url)) {
                    if (sender.tab?.id) tabsUsingCache.delete(sender.tab.id);
                    sendResponse({ cacheHit: false });
                    return;
                }
                const cachedData = DetectionEngineManager.scansFresh(sender.tab?.id)
                    ? null
                    : await DetectionEngineManager.getStoredDetection(url, { privateWindow: sender.tab?.incognito === true });

                if (cachedData) {
                    Logger.detection(`${Logger.hostOf(url)}: cached result reused`);
                    if (sender.tab?.id) {
                        tabsUsingCache.add(sender.tab.id);
                        Logger.debug('BACKGROUND', `[Background] [Early Cache] Marked tab ${sender.tab.id} as using cache`);
                    }
                    sendResponse({
                        cacheHit: true,
                        detectionData: cachedData
                    });
                } else {
                    Logger.debug('CACHE', `Early check miss: ${url}`);
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
    registry[WorkerMessages.CHECK_CACHE_EARLY] = handle_check_cache_early;

    const handle_cache_hit_early_exit = function({ request, sender, sendResponse, context }) {
        void context;

        // Update badge from cached detection data
        (async () => {
            try {
                const { url, detectionData } = request;
                const tabId = sender.tab?.id;

                Logger.debug('BACKGROUND', '[Background] [Early Cache] Content script exited early due to cache hit for:', url);

                if (detectionData && tabId) {
                    const detectionCount = detectionData.detectionCount || 0;
                    const detections = Array.isArray(detectionData.detectionResults) ? detectionData.detectionResults : [];

                    if (detectionCount > 0) {
                        const badgeColors = await CategoryManager.getBadgeColors();
                        const count = detectionCount.toString();
                        const color = DetectionUtils.getBadgeColor(detections, badgeColors);

                        await setBadgeTextColor(tabId, false, color);
                        await chrome.action.setBadgeText({
                            text: count,
                            tabId: tabId
                        });
                        await chrome.action.setBadgeBackgroundColor({
                            color: color,
                            tabId: tabId
                        });
                        Logger.debug('BACKGROUND', `[Background] [Early Cache] Badge updated: ${detectionCount} detections from cache`);
                        if (typeof ToolbarTitle !== 'undefined') ToolbarTitle.apply(chrome, tabId, 'found', detections);
                    } else {
                        await setBadgeTextColor(tabId);
                        await chrome.action.setBadgeText({
                            text: BADGE.TEXT.CLEAN,
                            tabId: tabId
                        });
                        await chrome.action.setBadgeBackgroundColor({
                            color: BADGE.COLORS.CLEAN,
                            tabId: tabId
                        });
                        Logger.debug('BACKGROUND', '[Background] [Early Cache] Badge: clean page (no detections)');
                        if (typeof ToolbarTitle !== 'undefined') ToolbarTitle.apply(chrome, tabId, 'clean');
                    }
                }

                sendResponse({ status: 'acknowledged' });
            } catch (error) {
                // Expected: tab may have closed
                if (error.message && error.message.includes('No tab with id')) {
                    Logger.debug('BACKGROUND', '[Background] [Early Cache] Tab closed, skipping badge update');
                    sendResponse({ status: 'acknowledged' }); // Still acknowledge
                } else {
                    Logger.error('BACKGROUND', '[Background] [Early Cache] Error updating badge:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
            }
        })();
        return true; // Will respond asynchronously
    };
    registry[WorkerMessages.CACHE_HIT_EARLY_EXIT] = handle_cache_hit_early_exit;

    const handle_clear_detection_cache = function({ request, sender, sendResponse, context }) {
        void context;

        // Clear both storage and in-memory caches
        clearTabDetectionCache(request, sendResponse);
        return true; // Async response
    };
    registry[WorkerMessages.DETECTION_CLEAR_CACHE] = handle_clear_detection_cache;
    registry[WorkerMessages.HISTORY_CLEAR_CACHE] = handle_clear_detection_cache;

    // Settings → Data → Storage → Clear: every saved result; tabs that showed a cached one scan again next time
    const handle_clear_all_detection_cache = function({ sendResponse }) {
        (async () => {
            await DetectionEngineManager.handleClearAllDetectionCache(sendResponse);
            tabsUsingCache.clear();
        })();
        return true; // Async response
    };
    registry[WorkerMessages.DETECTION_CLEAR_ALL_CACHE] = handle_clear_all_detection_cache;

}
