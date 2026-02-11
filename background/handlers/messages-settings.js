/**
 * registerSettingsHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerSettingsHandlers(registry, context) {
    void context;

    const handle_extension_toggle_changed = function({ request, sender, sendResponse, context }) {
        void context;

        // Handle extension enable/disable toggle with cached detection badge restoration
        (async () => {
            try {
                const enabled = request.enabled;
                Logger.background(`[Background] Extension toggle changed to: ${enabled ? 'ENABLED' : 'DISABLED'}`);

                // Call Settings.handleEnableToggle with dependencies for badge restoration
                await Settings.handleEnableToggle(enabled, {
                    DetectionEngineManager,
                    CategoryManager,
                    categoryManager
                });

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

        // Sync category colors from Settings to CategoryManager
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

    const handle_category_colors_updated = function({ request, sender, sendResponse, context }) {
        void context;

        // Reload CategoryManager when colors are updated
        (async () => {
            try {
                Logger.background('Scrapfly Background: Category colors updated, reloading CategoryManager...');
                if (categoryManager) {
                    await categoryManager.loadFromStorage();
                    Logger.background('Scrapfly Background: CategoryManager reloaded with new colors');
                }
                sendResponse({ status: 'reloaded' });
            } catch (error) {
                Logger.error('BACKGROUND', 'Scrapfly Background: Error reloading CategoryManager:', error);
                sendResponse({ status: 'error', error: error.message });
            }
        })();
        return true; // Will respond asynchronously
    };
    registry['CATEGORY_COLORS_UPDATED'] = handle_category_colors_updated;

    const handle_settings_updated = function({ request, sender, sendResponse, context }) {
        void context;

        // Delegate to Settings handler
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

        // Clear in-memory URL hash cache when cache scope changes
        Logger.background('[Background] Cache scope changed - clearing URL hash cache');
        UrlUtils.clearUrlHashCache();

        // Update badge for current tab based on cached data with new scope
        (async () => {
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs && tabs[0]) {
                    const tab = tabs[0];

                    // Check for cached data with new scope
                    const storedData = await DetectionEngineManager.getStoredDetection(tab.url);

                    // Add to recentlyClearedTabs to prevent auto-detection on popup reopen
                    // (Treat cache scope change like explicit cache clear for protection)
                    recentlyClearedTabs.add(tab.id);

                    // FIX: Clear stale activeDetections state to prevent false "pending" status
                    // This ensures GET_DETECTION_DATA doesn't return status='pending' for old detections
                    activeDetections.delete(tab.id);
                    Logger.background(`[Background] Cleared activeDetections for tab ${tab.id} (cache scope changed)`);

                    setTimeout(() => recentlyClearedTabs.delete(tab.id), 10000);
                    Logger.background(`[Background] Added tab ${tab.id} to recentlyClearedTabs for 10 seconds`);

                    if (storedData && storedData.detectionCount > 0) {
                        // Update badge with cached count and color
                        const badgeColors = await CategoryManager.getBadgeColors(categoryManager);
                        const count = storedData.detectionCount.toString();
                        const detections = Array.isArray(storedData.detectionResults) ? storedData.detectionResults : [];
                        let color;
                        if (detections.length > 0) {
                            const avgConfidence = DetectionUtils.computeAverageConfidence(detections);
                            const difficulty = DetectionUtils.getDifficultyLevel(detections, avgConfidence);
                            color = difficulty === 'High' ? badgeColors.high :
                                   difficulty === 'Medium' ? badgeColors.medium :
                                   badgeColors.low;
                        } else {
                            // Fallback for older stored payloads without detectionResults
                            // Prefer matching difficulty semantics: don't treat "many detections" as automatically "High".
                            color = storedData.detectionCount >= BADGE.THRESHOLDS.MEDIUM ? badgeColors.medium : badgeColors.low;
                        }

                        await chrome.action.setBadgeText({ text: count, tabId: tab.id });
                        await chrome.action.setBadgeBackgroundColor({ color: color, tabId: tab.id });
                        Logger.background(`[Background] Badge updated with cached data: ${count} detections (scope change)`);
                    } else {
                        // No cached data with new scope - show reload needed badge
                        await chrome.action.setBadgeText({ text: BADGE.TEXT.INTERRUPTED, tabId: tab.id });
                        await chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.INTERRUPTED, tabId: tab.id });
                        Logger.background('[Background] Badge: reload needed - no cached data with new scope');
                    }
                }

                if (sendResponse) {
                    sendResponse({ success: true });
                }
            } catch (error) {
                // Silently ignore "No tab with id" errors - expected when tab closes
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

        // Reload detectors from storage (after adding/updating/deleting)
        (async () => {
            try {
                Logger.background('Scrapfly Background: Reloading detectors from storage...');

                // CRITICAL: Clear all optimization caches when rules change
                // This ensures pattern changes are immediately reflected
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
