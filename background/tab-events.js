/**
 * Background tab event listeners.
 * Extracted from background.js to keep tab lifecycle logic isolated.
 */

function setupTabListeners() {
    // Clear all data stores and detection state for closed tab
    chrome.tabs.onRemoved.addListener((tabId) => {
        Logger.background(`Scrapfly Background: Tab ${tabId} closed, clearing headers, cookies, payloads, and network URLs`);
        headersStore.delete(tabId);
        requestHeadersStore.delete(tabId);
        responseCookiesStore.delete(tabId);
        payloadStore.delete(tabId);
        networkUrlsStore.delete(tabId);

        if (tabsUsingCache.has(tabId)) {
            tabsUsingCache.delete(tabId);
            Logger.background(`[TabCleanup] Removed tab ${tabId} from cache tracking`);
        }

        if (workerKeepaliveManager) {
            workerKeepaliveManager.endOperationsForTab(tabId);
        }

        detectionStates.delete(tabId);
        activeDetections.delete(tabId);
        interruptedDetections.delete(tabId);

        if (finalizationDebounce.has(tabId)) {
            clearTimeout(finalizationDebounce.get(tabId));
            finalizationDebounce.delete(tabId);
        }

        batchProcessingFlags.delete(tabId);

        // Clear capture states for all providers

        if (reCaptchaCaptureState.has(tabId)) {
            Logger.background(`[TabCleanup] Tab ${tabId} closed during reCAPTCHA capture, cleaning up`);
            const state = reCaptchaCaptureState.get(tabId);
            if (state && state.captureInterval) {
                clearInterval(state.captureInterval);
            }
            clearCaptureTimeout(state);
            reCaptchaCaptureState.delete(tabId);
            stopRecaptchaInterception();
        }

        if (funcaptchaCaptureState.has(tabId)) {
            Logger.background(`[TabCleanup] Tab ${tabId} closed during FunCaptcha capture, cleaning up`);
            clearCaptureTimeout(funcaptchaCaptureState.get(tabId));
            funcaptchaCaptureState.delete(tabId);
        }

        if (hcaptchaCaptureState.has(tabId)) {
            Logger.background(`[TabCleanup] Tab ${tabId} closed during hCaptcha capture, cleaning up`);
            clearCaptureTimeout(hcaptchaCaptureState.get(tabId));
            hcaptchaCaptureState.delete(tabId);
        }

        if (akamaiCaptureState.has(tabId)) {
            Logger.background(`[TabCleanup] Tab ${tabId} closed during Akamai capture, cleaning up`);
            clearCaptureTimeout(akamaiCaptureState.get(tabId));
            akamaiCaptureState.delete(tabId);
        }

        if (impervaCaptureState.has(tabId)) {
            Logger.background(`[TabCleanup] Tab ${tabId} closed during Imperva capture, cleaning up`);
            clearCaptureTimeout(impervaCaptureState.get(tabId));
            impervaCaptureState.delete(tabId);
        }

        if (shapesecurityCaptureState.has(tabId)) {
            Logger.background(`[TabCleanup] Tab ${tabId} closed during Shape Security capture, cleaning up`);
            clearCaptureTimeout(shapesecurityCaptureState.get(tabId));
            shapesecurityCaptureState.delete(tabId);
            shapeSecurityExtractionState.delete(tabId);
        }

        if (awsWafCaptureState.has(tabId)) {
            Logger.background(`[TabCleanup] Tab ${tabId} closed during AWS WAF capture, cleaning up`);
            clearCaptureTimeout(awsWafCaptureState.get(tabId));
            awsWafStopCapture(tabId);
        }

        chrome.action.setBadgeText({
            text: BADGE.TEXT.EMPTY,
            tabId: tabId
        }).catch((error) => {
            // Expected: Tab might already be closed
            Logger.background(`[Cleanup] Failed to clear badge for removed tab ${tabId}:`, error.message);
        });
    });

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'loading' && !await isExtensionEnabled()) {
            Logger.background(`[TabUpdate] Extension is disabled - setting OFF badge for tab ${tabId}`);
            chrome.action.setBadgeText({ text: BADGE.TEXT.DISABLED, tabId: tabId }).catch((error) => {
                Logger.background(`[TabUpdate] Failed to set disabled badge for tab ${tabId}:`, error.message);
            });
            chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.DISABLED, tabId: tabId }).catch((error) => {
                Logger.background(`[TabUpdate] Failed to set badge color for tab ${tabId}:`, error.message);
            });
        }

        // URL change: abort active detection, clear cache tracking
        if (changeInfo.url) {
            const newUrl = changeInfo.url;
            Logger.background(`[TabUpdate] URL change detected for tab ${tabId}: ${newUrl}`);

            // Only clear cache tracking on URL change, not F5 refresh
            if (tabsUsingCache.has(tabId)) {
                tabsUsingCache.delete(tabId);
                Logger.background(`[TabUpdate] URL changed - cleared cache tracking for tab ${tabId}`);
            }

            if (activeDetections.has(tabId)) {
                const activeInfo = activeDetections.get(tabId);
                const oldUrl = activeInfo.url;

                Logger.background(`[TabUpdate] Tab ${tabId} had active detection for ${oldUrl} - ABORTING (navigated to ${newUrl})`);

                if (activeInfo.abortController) {
                    activeInfo.abortController.abort();
                    Logger.background(`[TabUpdate] Aborted detection for tab ${tabId} (URL changed)`);
                }

                activeDetections.delete(tabId);
                const detectionState = detectionStates.get(tabId);
                if (detectionState && detectionState.url === oldUrl) {
                    detectionState.interrupted = true;
                    detectionState.error = 'url_changed';
                    Logger.background(`[TabUpdate] Marked detection state as interrupted for tab ${tabId}`);
                }

                chrome.action.setBadgeText({ text: BADGE.TEXT.EMPTY, tabId: tabId }).catch((error) => {
                    Logger.background(`[TabUpdate] Failed to clear badge for tab ${tabId}:`, error.message);
                });
            }

        }

        // Delegate capture tab updates to provider handlers
        if (typeof reCaptchaHandleCaptureTabUpdate === 'function') {
            reCaptchaHandleCaptureTabUpdate(tabId, changeInfo, tab, chrome);
        }
        if (typeof akamaiHandleCaptureTabUpdate === 'function') {
            akamaiHandleCaptureTabUpdate(tabId, changeInfo, tab);
        }
        if (typeof impervaHandleCaptureTabUpdate === 'function') {
            impervaHandleCaptureTabUpdate(tabId, changeInfo, tab);
        }
        if (typeof awsWafHandleCaptureTabUpdate === 'function') {
            awsWafHandleCaptureTabUpdate(tabId, changeInfo, tab);
        }
        if (typeof awsWafHandleAnalysisTabUpdate === 'function') {
            awsWafHandleAnalysisTabUpdate(tabId, changeInfo, tab);
        }
    });

    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        const newTabId = activeInfo.tabId;
        Logger.background(`[TabSwitch] Tab activated: ${newTabId}, previous: ${currentActiveTab}`);

        // Clear stale interrupted state when user returns to tab
        if (interruptedDetections.has(newTabId)) {
            Logger.background(`[TabSwitch] User returned to tab ${newTabId} - clearing any stale interrupted state`);
            interruptedDetections.delete(newTabId);
        }

        if (currentActiveTab !== null && activeDetections.has(currentActiveTab)) {
            const previousTabId = currentActiveTab;

            // Only interrupt if new tab is a content tab (skip popup/devtools/chrome://)
            try {
                const newTab = await chrome.tabs.get(newTabId);
                if (!newTab || !newTab.url || newTab.url.startsWith('chrome://') || newTab.url.startsWith('chrome-extension://')) {
                    Logger.background(`[TabSwitch] New tab ${newTabId} is not a valid content tab (url: ${newTab?.url || 'none'}) - skipping interruption`);
                    currentActiveTab = newTabId;
                    return;
                }
            } catch (error) {
                Logger.background(`[TabSwitch] Failed to validate new tab ${newTabId}:`, error.message);
                currentActiveTab = newTabId;
                return;
            }

            // Detections continue in background; Chrome tabs keep executing when unfocused
            Logger.background(`[TabSwitch] Tab ${previousTabId} detection will continue in background`);
        }
        // Restore badge from cache, or trigger detection for uncached activated tabs.
        try {
            const tab = await chrome.tabs.get(newTabId);
            if (!tab || !tab.url) {
                currentActiveTab = newTabId;
                return;
            }

            const url = tab.url;
            if (!Utils.isValidContentScriptUrl(url)) {
                currentActiveTab = newTabId;
                return;
            }

            if (!await isExtensionEnabled()) {
                currentActiveTab = newTabId;
                return;
            }

            const detectionState = detectionStates.get(newTabId);
            const hasInFlightDetection = activeDetections.has(newTabId) || (detectionState && !detectionState.finalized);

            const cachedData = await DetectionEngineManager.getDetectionData(newTabId);
            if (cachedData) {
                const detectionResults = cachedData.detectionResults || [];
                await setBadgeForDetections(newTabId, url, detectionResults);
                Logger.background(`[TabSwitch] Badge restored for tab ${newTabId}: ${detectionResults.length} detection(s)`);
            } else if (!hasInFlightDetection && !recentlyClearedTabs.has(newTabId)) {
                const requested = await requestDetectionForTab(newTabId, {
                    source: 'tab_activated',
                    silent: false
                });

                if (requested) {
                    Logger.background(`[TabSwitch] Triggered detection for uncached tab ${newTabId}`);
                } else {
                    const badgeText = await chrome.action.getBadgeText({ tabId: newTabId }).catch(() => '');
                    if (badgeText === BADGE.TEXT.DISABLED || badgeText === BADGE.TEXT.LOADING) {
                        await chrome.action.setBadgeText({ text: BADGE.TEXT.EMPTY, tabId: newTabId }).catch(() => {});
                    }
                }
            } else if (!hasInFlightDetection) {
                const badgeText = await chrome.action.getBadgeText({ tabId: newTabId }).catch(() => '');
                if (badgeText === BADGE.TEXT.DISABLED || badgeText === BADGE.TEXT.LOADING) {
                    await chrome.action.setBadgeText({ text: BADGE.TEXT.EMPTY, tabId: newTabId }).catch(() => {});
                }
            }
        } catch (error) {
            // Expected: tab may have closed during async operations
            Logger.background(`[TabSwitch] Badge sync skipped for tab ${newTabId}: ${error.message}`);
        }

        // Update current active tab
        currentActiveTab = newTabId;

    });
}


