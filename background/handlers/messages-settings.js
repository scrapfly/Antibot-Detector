/**
 * registerSettingsHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerSettingsHandlers(registry, context) {
    void context;

    const handle_extension_toggle_changed = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            try {
                const enabled = request.enabled;
                Logger.background(`[Background] Extension toggle changed to: ${enabled ? 'ENABLED' : 'DISABLED'}`);
                await Settings.handleEnableToggle(enabled, {
                    DetectionEngineManager,
                    CategoryManager,
                    categoryManager
                });

                if (enabled) {
                    const activeTabs = await chrome.tabs.query({ active: true });
                    for (const tab of activeTabs) {
                        if (!tab?.id || !Utils.isValidContentScriptTab(tab)) {
                            continue;
                        }

                        const cachedData = await DetectionEngineManager.getStoredDetection(tab.url);
                        if (cachedData) {
                            continue;
                        }

                        if (recentlyClearedTabs.has(tab.id)) {
                            continue;
                        }

                        const detectionState = detectionStates.get(tab.id);
                        const hasInFlightDetection = activeDetections.has(tab.id) || (detectionState && !detectionState.finalized);
                        if (hasInFlightDetection) {
                            continue;
                        }

                        await requestDetectionForTab(tab.id, {
                            source: 'toggle_enabled',
                            silent: false
                        });
                    }
                }

                sendResponse({ status: 'success' });
            } catch (error) {
                Logger.error('BACKGROUND', '[Background] Error handling toggle change:', error);
                sendResponse({ status: 'error', error: error.message });
            }
        })();
        return true; // Async response
    };
    registry['EXTENSION_TOGGLE_CHANGED'] = handle_extension_toggle_changed;

    const handle_sync_category_colors = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            try {
                Logger.background('Scrapfly Background: Syncing category colors from Settings...');
                const synced = await detectorManager.categoryManager.syncColorsFromSettings();
                Logger.background('Scrapfly Background: Category colors synced:', synced);
                sendResponse({ status: 'synced', success: synced });
            } catch (error) {
                Logger.error('BACKGROUND', 'Scrapfly Background: Error syncing category colors:', error);
                sendResponse({ status: 'error', error: error.message });
            }
        })();
        return true; // Will respond asynchronously
    };
    registry['SYNC_CATEGORY_COLORS'] = handle_sync_category_colors;

    const handle_settings_updated = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            await Settings.handleSettingsUpdated({
                chrome,
                CategoryManager,
                categoryManager
            }, sendResponse);
        })();
        return true; // Will respond asynchronously
    };
    registry['SETTINGS_UPDATED'] = handle_settings_updated;

    const handle_cache_scope_changed = function({ request, sender, sendResponse, context }) {
        void context;

        // Clear URL hash cache and update badge for new cache scope
        UrlUtils.clearUrlHashCache();
        (async () => {
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs && tabs[0]) {
                    const tab = tabs[0];

                    const storedData = await DetectionEngineManager.getStoredDetection(tab.url);

                    // Treat cache scope change like explicit cache clear
                    recentlyClearedTabs.add(tab.id);

                    // Clear stale activeDetections to prevent false "pending" status
                    activeDetections.delete(tab.id);
                    Logger.background(`[Background] Cleared activeDetections for tab ${tab.id} (cache scope changed)`);

                    setTimeout(() => recentlyClearedTabs.delete(tab.id), Constants.RECENTLY_CLEARED_TAB_TIMEOUT);
                    Logger.background(`[Background] Added tab ${tab.id} to recentlyClearedTabs`);

                    if (storedData && storedData.detectionCount > 0) {
                        const detections = Array.isArray(storedData.detectionResults) ? storedData.detectionResults : [];
                        await setBadgeForDetections(tab.id, tab.url, detections);
                        Logger.background(`[Background] Badge updated with cached data: ${storedData.detectionCount} detections (scope change)`);
                    } else {
                        await chrome.action.setBadgeText({ text: BADGE.TEXT.CLEARED, tabId: tab.id });
                        await chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.CLEARED, tabId: tab.id });
                        Logger.background('[Background] Badge: cleared state - no cached data with new scope');
                    }
                }

                if (sendResponse) {
                    sendResponse({ success: true });
                }
            } catch (error) {
                // Expected: tab may have closed
                if (error.message && error.message.includes('No tab with id')) {
                    Logger.background('[Background] Tab closed during cache scope change, skipping');
                    if (sendResponse) sendResponse({ success: true });
                } else {
                    Logger.error('BACKGROUND', '[Background] Error updating badge on cache scope change:', error);
                    if (sendResponse) {
                        sendResponse({ success: false, error: error.message });
                    }
                }
            }
        })();

        return true; // Async response
    };
    registry['CACHE_SCOPE_CHANGED'] = handle_cache_scope_changed;

    const handle_reload_detectors = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            try {
                Logger.background('Scrapfly Background: Reloading detectors from storage...');

                // Clear pattern cache so rule changes take effect immediately
                if (typeof DetectionEngineManager !== 'undefined' && DetectionEngineManager.patternCache) {
                    Logger.background('Scrapfly Background: Clearing PatternCache (rules changed)');
                    DetectionEngineManager.patternCache.clear();
                }

                detectorManager.initialized = false;
                await detectorManager.initialize();
                Logger.background('Scrapfly Background: Detectors reloaded successfully');
                sendResponse({ status: 'reloaded', detectorCount: detectorManager.getDetectorCount() });
            } catch (error) {
                Logger.error('BACKGROUND', 'Scrapfly Background: Error reloading detectors:', error);
                sendResponse({ status: 'error', error: error.message });
            }
        })();
        return true; // Will respond asynchronously
    };
    registry['RELOAD_DETECTORS'] = handle_reload_detectors;

}
