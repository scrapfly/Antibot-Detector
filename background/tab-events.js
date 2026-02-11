/**
 * Background tab event listeners.
 * Extracted from background.js to keep tab lifecycle logic isolated.
 */

function setupTabListeners() {
    // Clear data when tab is closed
    chrome.tabs.onRemoved.addListener((tabId) => {
        Logger.background(`Scrapfly Background: Tab ${tabId} closed, clearing headers, cookies, payloads, and network URLs`);
        headersStore.delete(tabId);
        requestHeadersStore.delete(tabId);
        responseCookiesStore.delete(tabId);
        payloadStore.delete(tabId);
        networkUrlsStore.delete(tabId);

        // Clear cache tracking for this tab
        if (tabsUsingCache.has(tabId)) {
            tabsUsingCache.delete(tabId);
            Logger.background(`[TabCleanup] Removed tab ${tabId} from cache tracking`);
        }

        // End keepalive operations for this tab
        if (workerKeepaliveManager) {
            workerKeepaliveManager.endOperationsForTab(tabId);
        }

        // Clear detection state tracking
        detectionStates.delete(tabId);
        activeDetections.delete(tabId);
        interruptedDetections.delete(tabId);
        tabFocusTimestamps.delete(tabId);

        // Clear finalization debounce (cancel pending timeout)
        if (finalizationDebounce.has(tabId)) {
            clearTimeout(finalizationDebounce.get(tabId));
            finalizationDebounce.delete(tabId);
        }

        // Clear batch processing flag
        batchProcessingFlags.delete(tabId);

        // Clear capture state if tab is closed during capture
        const captureStateForTab = reCaptchaCaptureState.get(tabId);
        if (captureStateForTab) {
            Logger.background(`Scrapfly Background: Tab ${tabId} closed during capture, cleaning up`);
            if (captureStateForTab.captureInterval) {
                clearInterval(captureStateForTab.captureInterval);
            }
            reCaptchaCaptureState.delete(tabId);
            stopRecaptchaInterception();
        }

        // Clear FunCaptcha capture state if tab is closed during capture
        if (funcaptchaCaptureState.has(tabId)) {
            Logger.background(`Scrapfly Background: Tab ${tabId} closed during FunCaptcha capture, cleaning up`);
            const funcState = funcaptchaCaptureState.get(tabId);
            if (funcState && funcState.timeout) {
                clearTimeout(funcState.timeout);
            }
            funcaptchaCaptureState.delete(tabId);
        }

        // Clear hCaptcha capture state if tab is closed during capture
        if (typeof hcaptchaCaptureState !== 'undefined' && hcaptchaCaptureState.has(tabId)) {
            Logger.background(`Scrapfly Background: Tab ${tabId} closed during hCaptcha capture, cleaning up`);
            const hcaptchaState = hcaptchaCaptureState.get(tabId);
            if (hcaptchaState && hcaptchaState.timeout) {
                clearTimeout(hcaptchaState.timeout);
            }
            hcaptchaCaptureState.delete(tabId);
        }

        // Clear Akamai capture state if tab is closed during capture
        if (akamaiCaptureState.has(tabId)) {
            Logger.background(`Scrapfly Background: Tab ${tabId} closed during Akamai capture, cleaning up`);
            const akamaiState = akamaiCaptureState.get(tabId);
            if (akamaiState && akamaiState.timeout) {
                clearTimeout(akamaiState.timeout);
            }
            akamaiCaptureState.delete(tabId);
        }

        // Clear Imperva capture state if tab is closed during capture
        if (impervaCaptureState.has(tabId)) {
            Logger.background(`Scrapfly Background: Tab ${tabId} closed during Imperva capture, cleaning up`);
            const impervaState = impervaCaptureState.get(tabId);
            if (impervaState && impervaState.timeout) {
                clearTimeout(impervaState.timeout);
            }
            impervaCaptureState.delete(tabId);
        }

        // Clear Shape Security capture state if tab is closed during capture
        if (typeof shapesecurityCaptureState !== 'undefined' && shapesecurityCaptureState.has(tabId)) {
            Logger.background(`Scrapfly Background: Tab ${tabId} closed during Shape Security capture, cleaning up`);
            const shapeState = shapesecurityCaptureState.get(tabId);
            if (shapeState && shapeState.timeout) {
                clearTimeout(shapeState.timeout);
            }
            shapesecurityCaptureState.delete(tabId);
        }

        // Clear AWS WAF capture state if tab is closed during capture
        if (typeof awsWafCaptureStateRef !== 'undefined' && awsWafCaptureStateRef.isCapturing && awsWafCaptureStateRef.tabId === tabId) {
            Logger.background(`Scrapfly Background: Tab ${tabId} closed during AWS WAF capture, cleaning up`);
            if (awsWafCaptureStateRef.timeout) {
                clearTimeout(awsWafCaptureStateRef.timeout);
            }
            // Reset AWS WAF state object
            awsWafCaptureStateRef.isCapturing = false;
            awsWafCaptureStateRef.tabId = null;
            awsWafCaptureStateRef.url = null;
            awsWafCaptureStateRef.capturedData = {};
        }

        // Clear the badge for this tab
        chrome.action.setBadgeText({
            text: BADGE.TEXT.EMPTY,
            tabId: tabId
        }).catch((error) => {
            // Expected: Tab might already be closed
            Logger.background(`[Cleanup] Failed to clear badge for removed tab ${tabId}:`, error.message);
        });
    });

    // Run detection when tab is updated
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        // Check if extension is disabled when page starts loading
        if (changeInfo.status === 'loading' && !await isExtensionEnabled()) {
            Logger.background(`[TabUpdate] Extension is disabled - setting OFF badge for tab ${tabId}`);
            chrome.action.setBadgeText({ text: BADGE.TEXT.DISABLED, tabId: tabId }).catch((error) => {
                Logger.background(`[TabUpdate] Failed to set disabled badge for tab ${tabId}:`, error.message);
            });
            chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.DISABLED, tabId: tabId }).catch((error) => {
                Logger.background(`[TabUpdate] Failed to set badge color for tab ${tabId}:`, error.message);
            });
        }

        // Detect URL changes within the same tab (same-tab navigation)
        if (changeInfo.url) {
            const newUrl = changeInfo.url;
            Logger.background(`[TabUpdate] URL change detected for tab ${tabId}: ${newUrl}`);

            // Clear cache tracking ONLY on URL change (not on F5 refresh)
            if (tabsUsingCache.has(tabId)) {
                tabsUsingCache.delete(tabId);
                Logger.background(`[TabUpdate] URL changed - cleared cache tracking for tab ${tabId}`);
            }

            // Check if there's an active detection for this tab
            if (activeDetections.has(tabId)) {
                const activeInfo = activeDetections.get(tabId);
                const oldUrl = activeInfo.url;

                Logger.background(`[TabUpdate] Tab ${tabId} had active detection for ${oldUrl} - ABORTING (navigated to ${newUrl})`);

                // Abort the detection process
                if (activeInfo.abortController) {
                    activeInfo.abortController.abort();
                    Logger.background(`[TabUpdate] Aborted detection for tab ${tabId} (URL changed)`);
                }

                // Remove from active detections
                activeDetections.delete(tabId);

                // Mark detection state as interrupted (if it exists)
                const detectionState = detectionStates.get(tabId);
                if (detectionState && detectionState.url === oldUrl) {
                    detectionState.interrupted = true;
                    detectionState.error = 'url_changed';
                    Logger.background(`[TabUpdate] Marked detection state as interrupted for tab ${tabId}`);
                }

                // Clear badge (new page will set its own badge when detection completes)
                chrome.action.setBadgeText({ text: BADGE.TEXT.EMPTY, tabId: tabId }).catch((error) => {
                    Logger.background(`[TabUpdate] Failed to clear badge for tab ${tabId}:`, error.message);
                });
            }

            // Note: Detection state will be cleared by getOrCreateDetectionState when new detection starts
        }

        // Handle reCAPTCHA capture updates - only monitors active captures
        if (typeof reCaptchaHandleCaptureTabUpdate === 'function') {
            reCaptchaHandleCaptureTabUpdate(tabId, changeInfo, tab, chrome);
        }

        // Handle Akamai capture updates - only monitors active captures
        if (typeof akamaiHandleCaptureTabUpdate === 'function') {
            akamaiHandleCaptureTabUpdate(tabId, changeInfo, tab);
        }

        // Handle Imperva capture updates - only monitors active captures
        if (typeof impervaHandleCaptureTabUpdate === 'function') {
            impervaHandleCaptureTabUpdate(tabId, changeInfo, tab);
        }

        // Handle AWS WAF capture updates - only monitors active captures
        if (typeof awsWafHandleCaptureTabUpdate === 'function') {
            awsWafHandleCaptureTabUpdate(tabId, changeInfo, tab);
        }

        // Handle AWS WAF analysis updates
        if (typeof awsWafHandleAnalysisTabUpdate === 'function') {
            awsWafHandleAnalysisTabUpdate(tabId, changeInfo, tab);
        }
    });

    // Run detection when active tab changes - detect interruptions and delegate to DetectionEngineManager
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        const newTabId = activeInfo.tabId;
        const now = Date.now();
        
        Logger.background(`[TabSwitch] Tab activated: ${newTabId}, previous: ${currentActiveTab}`);

        // Check if user is returning to a previously interrupted tab - clear interrupted state
        if (interruptedDetections.has(newTabId)) {
            Logger.background(`[TabSwitch] User returned to tab ${newTabId} - clearing any stale interrupted state`);
            interruptedDetections.delete(newTabId);
            // Don't modify badge here - let popup query get fresh data and update badge appropriately
        }

        // Check if previous tab had an active detection that should be interrupted
        if (currentActiveTab !== null && activeDetections.has(currentActiveTab)) {
            const previousTabId = currentActiveTab;

            // FIX: Only interrupt if new tab is a valid content tab (not popup/devtools/etc)
            // This prevents false interruptions when popup opens on same webpage
            try {
                const newTab = await chrome.tabs.get(newTabId);
                // Skip interruption if new tab is not a valid content tab
                if (!newTab || !newTab.url || newTab.url.startsWith('chrome://') || newTab.url.startsWith('chrome-extension://')) {
                    Logger.background(`[TabSwitch] New tab ${newTabId} is not a valid content tab (url: ${newTab?.url || 'none'}) - skipping interruption`);
                    // Update current active tab and continue without interrupting
                    currentActiveTab = newTabId;
                    return;
                }
            } catch (error) {
                Logger.background(`[TabSwitch] Failed to validate new tab ${newTabId}:`, error.message);
                // On error, assume it's invalid and skip interruption
                currentActiveTab = newTabId;
                return;
            }

            const previousFocusTime = tabFocusTimestamps.get(previousTabId);
            const focusDuration = previousFocusTime ? now - previousFocusTime : 0;

            // FIX: Let detections complete in background when tab switches
            // Chrome tabs continue executing even when not focused
            // Detection will complete naturally and cache results
            if (focusDuration < TAB_SWITCH_DEBOUNCE_MS) {
                Logger.background(`[TabSwitch] Tab ${previousTabId} was focused for only ${focusDuration}ms - rapid switch detected`);
            } else {
                Logger.background(`[TabSwitch] Tab ${previousTabId} detection will continue in background (user switched tabs)`);
                // Don't abort, don't interrupt - just let it complete naturally
                // Detection will cache results when finished
            }
        }

        // Record focus timestamp for the newly activated tab
        tabFocusTimestamps.set(newTabId, now);

        // Update current active tab
        currentActiveTab = newTabId;

    });
}

