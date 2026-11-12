/**
 * registerSettingsHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerSettingsHandlers(registry, context) {
    void context;
    SettingsStore.registerHandlers(registry);

    const handle_extension_toggle_changed = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            try {
                const enabled = request.enabled;
                Logger.background(`[Background] Extension toggle changed to: ${enabled ? 'ENABLED' : 'DISABLED'}`);
                if (enabled === false) {
                    // A scan under way must not finish into an extension that is off: it would paint its result over the OFF
                    // badge, save the page in History and send it to the webhook. Cancelled before the badges are written
                    const scanning = new Set([...detectionStates.keys(), ...activeDetections.keys()]);
                    for (const tabId of scanning) {
                        DetectionSessionStore.cancel(tabId, 'disabled');
                        if (typeof stopBadgeSpinner === 'function') stopBadgeSpinner(tabId);
                    }
                    // Nor does background work go on. No page is scanned while the extension is off, so a background tab would only
                    // wait out its time limit: the watchlist's check stops now and a Bulk scan pauses (its page waits again), each
                    // closing its tab, and neither opens another page
                    if (typeof HistoryWatch !== 'undefined') HistoryWatch.stop('off');
                    if (typeof BulkScanRunner !== 'undefined') {
                        await BulkScanRunner.hold('off').catch((error) => Logger.warn('BACKGROUND', '[Background] Could not pause the Bulk scan:', error));
                    }
                }
                await Settings.handleEnableToggle(enabled, {
                    DetectionEngineManager,
                    CategoryManager,
                    categoryManager
                });
                // A held webhook delivery whose retry alarm went off while the extension was off is retried by nothing else:
                // arm the next alarm now that it can send again
                if (enabled !== false && typeof SettingsRuntime !== 'undefined') await SettingsRuntime._scheduleWebhookRetries();
                // A Bulk scan paused when the extension went off no longer says so: it waits for the person's Resume
                if (enabled !== false && typeof BulkScanRunner !== 'undefined') {
                    await BulkScanRunner.release('off').catch((error) => Logger.warn('BACKGROUND', '[Background] Could not update the Bulk scan:', error));
                }

                sendResponse({ status: 'success' });
            } catch (error) {
                Logger.error('BACKGROUND', '[Background] Error handling toggle change:', error);
                sendResponse({ status: 'error', error: error.message });
            }
        })();
        return true; // Async response
    };
    registry[WorkerMessages.EXTENSION_TOGGLE_CHANGED] = MessageSender.extensionPagesOnly(handle_extension_toggle_changed);

    const handle_sync_category_colors = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            try {
                const synced = await detectorManager.categoryManager.syncColorsFromSettings();
                Logger.background('Category colours synced from Settings', { ok: synced });
                sendResponse({ status: 'synced', success: synced });
            } catch (error) {
                Logger.error('BACKGROUND', 'Scrapfly Background: Error syncing category colors:', error);
                sendResponse({ status: 'error', error: error.message });
            }
        })();
        return true; // Will respond asynchronously
    };
    registry[WorkerMessages.SYNC_CATEGORY_COLORS] = MessageSender.extensionPagesOnly(handle_sync_category_colors);

    // The record of recent webhook deliveries is written here only: the Settings page asks for the Test line and for Clear
    registry[WorkerMessages.WEBHOOK_LOG_ENTRY] = function({ request, sender, sendResponse }) {
        if (!MessageSender.isExtensionPage(sender)) { sendResponse({ status: 'error' }); return false; }
        SettingsRuntime.recordWebhookDelivery(request.entry).then(() => sendResponse({ status: 'ok' }));
        return true;
    };
    registry[WorkerMessages.WEBHOOK_LOG_CLEAR] = function({ sender, sendResponse }) {
        if (!MessageSender.isExtensionPage(sender)) { sendResponse({ status: 'error' }); return false; }
        SettingsRuntime.clearWebhookLog().then(() => sendResponse({ status: 'ok' }));
        return true;
    };

    // Recent deliveries → Retry: a failed delivery the worker still holds is sent again now, from the current webhook settings
    registry[WorkerMessages.WEBHOOK_RETRY] = function({ request, sender, sendResponse }) {
        if (!MessageSender.isExtensionPage(sender)) { sendResponse({ status: 'error' }); return false; }
        const id = request && typeof request.id === 'string' ? request.id : '';
        if (!/^[a-z0-9]{1,24}$/.test(id)) { sendResponse({ status: 'error' }); return false; }
        SettingsRuntime.retryWebhook(id, { manual: true }).then(
            (result) => sendResponse({ status: 'ok', outcome: result.status }),
            () => sendResponse({ status: 'error' })
        );
        return true;
    };

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
    registry[WorkerMessages.SETTINGS_UPDATED] = MessageSender.extensionPagesOnly(handle_settings_updated);

    const handle_cache_scope_changed = function({ request, sender, sendResponse, context }) {
        void context;

        // Clear URL hash cache and update badge for new cache scope
        UrlUtils.clearUrlHashCache();
        (async () => {
            try {
                // The results saved under the old scope go: under "Domain", one saved for a single page would answer the whole site
                try {
                    await DetectionEngineManager.dropOtherScopes(await Utils.getCacheScope());
                } catch (error) {
                    Logger.warn('BACKGROUND', '[Background] Could not drop the results saved under the old cache scope', error);
                }
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs && tabs[0]) {
                    const tab = tabs[0];

                    const storedData = await DetectionEngineManager.getStoredDetection(tab.url, { privateWindow: tab.incognito === true });

                    // Treat cache scope change like explicit cache clear
                    recentlyClearedTabs.add(tab.id);

                    // Clear stale activeDetections to prevent false "pending" status
                    activeDetections.delete(tab.id);
                    Logger.background(`[Background] Cleared activeDetections for tab ${tab.id} (cache scope changed)`);

                    setTimeout(() => recentlyClearedTabs.delete(tab.id), Constants.RECENTLY_CLEARED_TAB_TIMEOUT);
                    Logger.background(`[Background] Added tab ${tab.id} to recentlyClearedTabs`);

                    if (storedData) {
                        // A saved scan that found nothing (a count of 0) is a finished scan too: it gets the clean state, as on any
                        // cache hit, never the gray cleared mark, which the popup reads as "no scan yet"
                        const detections = Array.isArray(storedData.detectionResults) ? storedData.detectionResults : [];
                        await setBadgeForDetections(tab.id, tab.url, detections);
                        Logger.background(`[Background] Badge updated with cached data: ${detections.length} detections (scope change)`);
                    } else {
                        await chrome.action.setBadgeText({ text: BADGE.TEXT.CLEARED, tabId: tab.id });
                        await setBadgeTextColor(tab.id, false, BADGE.COLORS.CLEARED);
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
    registry[WorkerMessages.CACHE_SCOPE_CHANGED] = MessageSender.extensionPagesOnly(handle_cache_scope_changed);

    const handle_reload_detectors = function({ request, sender, sendResponse, context }) {
        void context;

        (async () => {
            // Every saved scan result was found with the rules that just changed. The change is stamped once the detectors
            // are reloaded (a scan that begins after it runs on the new rules; one that began earlier is not kept) and
            // before the answer, so the caller's next scan never meets an old result. Never throws.
            const stampRuleChange = async () => {
                if (typeof DetectionEngineManager !== 'undefined' && typeof DetectionEngineManager.bumpRulesRevision === 'function') {
                    await DetectionEngineManager.bumpRulesRevision();
                }
            };
            try {

                // Clear pattern cache so rule changes take effect immediately
                if (typeof DetectionEngineManager !== 'undefined' && DetectionEngineManager.patternCache) {
                    Logger.background('Scrapfly Background: Clearing PatternCache (rules changed)');
                    DetectionEngineManager.patternCache.clear();
                }

                detectorManager.initialized = false;
                await detectorManager.initialize();
                Logger.background('Detectors reloaded from storage');
                await stampRuleChange();
                sendResponse({ status: 'reloaded', detectorCount: detectorManager.getDetectorCount() });
            } catch (error) {
                Logger.error('BACKGROUND', 'Scrapfly Background: Error reloading detectors:', error);
                await stampRuleChange();
                sendResponse({ status: 'error', error: error.message });
            }
        })();
        return true; // Will respond asynchronously
    };
    registry[WorkerMessages.RELOAD_DETECTORS] = MessageSender.extensionPagesOnly(handle_reload_detectors);

}
