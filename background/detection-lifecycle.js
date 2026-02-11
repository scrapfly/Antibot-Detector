/**
 * Background detection lifecycle helpers.
 * Extracted from background.js to keep the service worker entry thin.
 */

function markMethodComplete(tabId, methodName) {
    const state = detectionStates.get(tabId);
    if (!state) {
        Logger.warn('BACKGROUND', `[markMethodComplete] No detection state for tab ${tabId}, cannot mark ${methodName} complete`);
        return;
    }

    // VALIDATION: Only allow valid method names from the official methodOrder
    const validMethods = state.methodOrder || ['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload'];
    if (!validMethods.includes(methodName)) {
        Logger.warn('BACKGROUND', `[markMethodComplete] Rejecting invalid method name: "${methodName}" (valid methods: ${validMethods.join(', ')})`);
        return;
    }

    if (state.completedMethods.has(methodName)) {
        return; // already marked complete; avoid duplicate progress events
    }

    state.completedMethods.add(methodName);
    sendProgressUpdate(tabId, methodName, state.completedMethods);
}

function checkAndFinalizeDetection(tabId) {
    const state = detectionStates.get(tabId);
    if (!state) {
        Logger.warn('BACKGROUND', `[Finalize Check] No state for tab ${tabId}, aborting`);
        return;
    }

    // SAFETY CHECK: Don't finalize if state was just created (within 500ms)
    // This prevents race conditions where navigation events trigger premature finalization
    if (state.startTime && (Date.now() - state.startTime < 500)) {
        return;
    }

    // FIX: Check if batches are actively processing - if so, defer finalization check
    const batchActive = batchProcessingFlags.get(tabId) === true;
    if (batchActive) {
        // Don't schedule anything, batch completion will trigger checkAndFinalizeDetection
        return;
    }

    // OPTIMIZATION MEDIUM-TERM #2: Debounce finalization checks (250ms window)
    // Prevents redundant work when multiple completion signals arrive rapidly
    // Increased from 10ms to 100ms to reduce timer spam and CPU overhead
    // Debounce: 400ms = 2 polling cycles for window properties (200ms each)
    if (finalizationDebounce.has(tabId)) {
        clearTimeout(finalizationDebounce.get(tabId));
    }

    const timeout = setTimeout(async () => {
        // Re-check state in case it was deleted during debounce
        const currentState = detectionStates.get(tabId);
        if (!currentState) {
            Logger.warn('BACKGROUND', `[Finalize Execute] No state found for tab ${tabId} after debounce, aborting`);
            finalizationDebounce.delete(tabId);
            return;
        }

        const completedMethods = Array.from(currentState.completedMethods || []);
        const completedCount = completedMethods.length;
        const totalMethods = 7;
        const methodOrder = ['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload'];
        const missingMethods = methodOrder.filter(m => !currentState.completedMethods.has(m));

        // FIX: Double-check batch processing isn't active
        if (batchProcessingFlags.get(tabId) === true) {
            finalizationDebounce.delete(tabId);
            return;
        }

        // Check if hook batches are still arriving
        // Wait 100ms after LAST batch arrival to ensure all batches process
        // Reduced from 2000ms - hooks batch every 10-50ms, so 100ms is sufficient
        const timeSinceLastBatch = Date.now() - (currentState.lastHookBatchTime || 0);
        const BATCH_SETTLE_TIME = 250; // More buffer to reduce late-batch misses

        if (currentState.lastHookBatchTime > 0 && timeSinceLastBatch < BATCH_SETTLE_TIME) {
            const remainingMs = BATCH_SETTLE_TIME - timeSinceLastBatch;
            // Reschedule check - don't clear, just set new one
            const newTimeout = setTimeout(() => checkAndFinalizeDetection(tabId), remainingMs);
            finalizationDebounce.set(tabId, newTimeout);
            return;
        }

        // FIX 6.9: Minimum detection time to prevent race between fast window props and hooks timeout
        // Ensures at least 500ms has passed since detection started, giving hooks time to fire
        const MIN_DETECTION_TIME = 500;
        const timeSinceStart = Date.now() - (currentState.startTime || 0);
        if (currentState.startTime && timeSinceStart < MIN_DETECTION_TIME && !currentState.hooksComplete) {
            const remainingMs = MIN_DETECTION_TIME - timeSinceStart;
            Logger.background(`[Finalize] Waiting ${remainingMs}ms for minimum detection time (hooks not complete yet)`);
            const newTimeout = setTimeout(() => checkAndFinalizeDetection(tabId), remainingMs);
            finalizationDebounce.set(tabId, newTimeout);
            return;
        }

        // PHASE 1 FIX: More lenient finalization requirements
        // Instead of waiting for all 7 methods, finalize when we have the main methods (5)
        // This prevents getting stuck waiting for jsHooks and windowProperties signals
        const REQUIRED_METHODS = 5; // Reduced from 7 to exclude jsHooks and windowProperties
        const mainMethodsComplete = ['cookies', 'headers', 'url', 'dom', 'payload'].every(m => currentState.completedMethods.has(m));

        // Check if we should finalize
        const shouldFinalize =
            // Option 1: All 7 methods complete (ideal case)
            completedCount >= totalMethods ||
            // Option 2: Main 5 methods complete (fallback for signal issues)
            (mainMethodsComplete && completedCount >= REQUIRED_METHODS) ||
            // Option 3: We have detection data and main methods are done (quick finalization)
            (mainMethodsComplete && (currentState.mainData?.length > 0 || currentState.hooksData?.size > 0));

        if (shouldFinalize) {
            const now = Date.now();
            const hooksDeadline = await ensureHooksDeadline(currentState);
            const debugMode = await ensureDebugMode(currentState);

            if (!currentState.hooksComplete && !currentState.usedCache && now < hooksDeadline) {
                if (debugMode) {
                    const remaining = hooksDeadline - now;
                    Logger.warn('BACKGROUND', `[Finalize] Deferring finalization for hooks: ${remaining}ms remaining until deadline`);
                }
                const remainingMs = hooksDeadline - now;
                const delay = Math.min(remainingMs, 500);
                const newTimeout = setTimeout(() => checkAndFinalizeDetection(tabId), delay);
                finalizationDebounce.set(tabId, newTimeout);
                return;
            }

            if (!currentState.hooksComplete && now >= hooksDeadline) {
                currentState.hooksTimedOut = true;
                currentState.hooksComplete = true;
                currentState.hooksCompletionReason = currentState.hooksCompletionReason || 'deadline_timeout';
                currentState.hooksCompletionTime = currentState.hooksCompletionTime || (now - (currentState.startTime || now));
                markMethodComplete(tabId, 'jsHooks');
                if (debugMode) {
                    Logger.warn('BACKGROUND', `[Finalize] Hooks deadline reached - marking jsHooks complete to finalize`);
                }
            }

            // Send final update - use actual completed count for accurate badge
            sendProgressUpdate(tabId, 'complete', currentState.completedMethods || new Set(), totalMethods);
            finalizeDetection(tabId, currentState);
        } else {
            // Check if this detection is using cached data
            if (currentState.usedCache) {
                // Mark as finalized to prevent retry logic from firing
                currentState.finalized = true;

                finalizationDebounce.delete(tabId);
                return;
            }

            // Only show warnings if debug mode is enabled
            (async () => {
                try {
                    const settings = await Utils.getSettings(chrome);
                    if (settings?.debugMode) {
                        const percent = Math.round((completedCount / totalMethods) * 100);
                        Logger.warn('BACKGROUND', `%c[NOT READY] Only ${completedCount}/${totalMethods} methods complete (${percent}%) - waiting for main methods`, 'color: #f44336; font-weight: bold;');
                        Logger.warn('BACKGROUND', `[NOT READY]   Completed: ${completedMethods.join(', ')}`);
                        Logger.warn('BACKGROUND', `[NOT READY]   Missing: ${missingMethods.join(', ')}`);
                        Logger.warn('BACKGROUND', `[NOT READY]   Main methods complete: ${mainMethodsComplete}`);

                        // Log which signals we're waiting for
                        if (!currentState.windowPropertiesComplete) {
                            Logger.warn('BACKGROUND', `%c[WAITING FOR] windowProperties signal (WINDOW_PROPS_COMPLETE) - will proceed without it`, 'color: #ff9800; font-weight: bold;');
                        }
                        if (!currentState.mainComplete) {
                            Logger.warn('BACKGROUND', `[WAITING FOR] mainComplete signal (processDetectionData finished) - REQUIRED`);
                        }
                        if (!currentState.hooksComplete) {
                            Logger.warn('BACKGROUND', `[WAITING FOR] hooksComplete signal (JS_HOOKS_COMPLETE) - will proceed without it`, 'color: #ff9800; font-weight: bold;');
                        }
                    }
                } catch (error) {
                    // Failed to get settings, skip logging
                }
            })();
        }

        finalizationDebounce.delete(tabId);
    }, 400); // 400ms = 2 window property polling cycles (200ms each)

    finalizationDebounce.set(tabId, timeout);
}

async function finalizeDetection(tabId, state) {
    // FIX: Mark this tab as finalized to prevent progress updates from overriding the final badge
    state.finalized = true;

    // End keepalive for this detection
    if (workerKeepaliveManager) {
        workerKeepaliveManager.endOperation(`detection-${tabId}`);
    }

    // Safety check: Don't finalize if detection was interrupted
    if (state.interrupted || interruptedDetections.has(tabId)) {
        // Still clean up state to prevent zombie entries (fixes badge stuck on "✕")
        detectionStates.delete(tabId);
        activeDetections.delete(tabId);
        // Note: Don't delete from interruptedDetections here - let PAGE_LOAD_NOTIFICATION handle it
        // This way the popup knows to show "interrupted" state until user navigates
        Logger.background(`[Finalize] Detection interrupted for tab ${tabId}, cleaned up state`);
        return;
    }

    // SAFETY CHECK: Don't finalize if ALL data is empty AND no methods completed
    // This catches race conditions where finalization is triggered before any detection runs
    // FIX: Allow finalization even with empty results if methods actually completed
    const hasHooksData = state.hooksData && state.hooksData.size > 0;
    const hasMainData = state.mainData && state.mainData.length > 0;
    const hasCompletedMethods = state.completedMethods && state.completedMethods.size > 0;

    if (!hasHooksData && !hasMainData && !hasCompletedMethods) {
        return; // Don't finalize with empty data AND no completed methods
    }

    // Merge hooks and main detection
    const mergedDetections = new Map();

    // Add hooks data
    for (const [detectorId, detector] of state.hooksData.entries()) {
        mergedDetections.set(detectorId, detector);
    }

    // Add main detection data (merge if detector already exists from hooks)
    for (const detector of state.mainData) {
        const detectorId = detector.detector?.id || detector.id;
        if (mergedDetections.has(detectorId)) {
            // Merge: combine matches and detection methods
            const existing = mergedDetections.get(detectorId);
            existing.matches = [...existing.matches, ...(detector.matches || [])];

            // Safely merge detectionMethods arrays
            const existingMethods = existing.detectionMethods || [];
            const newMethods = detector.detectionMethods || [];
            existing.detectionMethods = [...new Set([...existingMethods, ...newMethods])];
        } else {
            // Ensure detector has detectionMethods array
            if (!detector.detectionMethods) {
                detector.detectionMethods = [];
            }
            mergedDetections.set(detectorId, detector);
        }
    }

    const finalResults = Array.from(mergedDetections.values());

    // Store to cache
    const pageData = {
        url: state.url,
        hostname: UrlUtils.getHostnameFromUrl(state.url),
        favicon: UrlUtils.getFaviconUrl(state.url)
    };

    const storedDataWithExpiry = await DetectionEngineManager.storeDetection(state.url, pageData, finalResults);

    // Update state with expiry info for immediate popup queries
    if (storedDataWithExpiry) {
        state.expiry = storedDataWithExpiry.expiry;
        state.timestamp = storedDataWithExpiry.timestamp;
        state.favicon = storedDataWithExpiry.favicon;
    }

    // Update badge with appropriate color
    const detectionCount = finalResults.length;
    if (detectionCount > 0) {
        // Check if URL is blacklisted before setting badge
        const isBlacklisted = await Utils.isUrlBlacklisted(state.url);

        if (!isBlacklisted) {
            // Load badge colors from CategoryManager
            const badgeColors = await CategoryManager.getBadgeColors(categoryManager);

            const count = detectionCount.toString();
            const avgConfidence = DetectionUtils.computeAverageConfidence(finalResults);
            const difficulty = DetectionUtils.getDifficultyLevel(finalResults, avgConfidence);
            const color = difficulty === 'High' ? badgeColors.high :
                         difficulty === 'Medium' ? badgeColors.medium :
                         badgeColors.low;

            // CHANGED: Make badge update synchronous to ensure it completes before popup checks
            try {
                await chrome.action.setBadgeText({ text: count, tabId: tabId });
                await chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId });
            } catch (error) {
                // Expected: Tab might be closed - don't log as error
                Logger.background(`[Finalize] Tab ${tabId} closed, skipping badge update`);
            }
        } else {
            // Show blacklisted badge
            try {
                await chrome.action.setBadgeText({ text: BADGE.TEXT.BLACKLISTED, tabId: tabId });
                await chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.BLACKLISTED, tabId: tabId });
            } catch (error) {
                // Expected: Tab might be closed
                Logger.background(`[Finalize] Tab ${tabId} closed, skipping badge update`);
            }
        }
    } else {
        // Show clean page badge (no detections)
        try {
            await chrome.action.setBadgeText({ text: BADGE.TEXT.CLEAN, tabId: tabId });
            await chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.CLEAN, tabId: tabId });
        } catch (error) {
            // Expected: Tab might be closed
            Logger.background(`[Finalize] Tab ${tabId} closed, skipping badge update`);
        }
    }

    // Notify popup
    chrome.runtime.sendMessage({
        type: 'NEW_DETECTION_DATA',
        tabId: tabId,
        url: state.url,
        detectionResults: finalResults
    }).catch(() => {
        // Expected: Popup may not be open
    });

    // Notify content script for JS API event dispatch (onDetection)
    try {
        await chrome.tabs.sendMessage(tabId, {
            type: 'DETECTION_COMPLETE',
            url: state.url,
            detections: finalResults,
            detectionCount: finalResults.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        // Expected: Tab may have been closed or content script not ready
        Logger.background(`[Finalize] Could not notify content script for JS API: ${error.message}`);
    }

    // FIX: Save merged results to history (includes both main detections AND hooks/fingerprints)
    // This ensures fingerprints detected via JS hooks are also saved to history
    if (finalResults.length > 0) {
        try {
            const pageData = {
                url: state.url,
                hostname: UrlUtils.getHostnameFromUrl(state.url),
                tabTitle: state.tabTitle,
                favicon: UrlUtils.getFaviconUrl(state.url)
            };

            const historySettings = await Utils.getHistorySettings();
            const shouldSave = await History.shouldSaveToHistory(state.url, historySettings, chrome);

            if (shouldSave) {
                await History.saveDetectionToHistory(tabId, pageData, finalResults, chrome);
            }
        } catch (error) {
            Logger.error('DETECTION', '[Finalize] Error saving to history:', error);
        }
    }

    // Remove from active detections (detection completed successfully)
    if (activeDetections.has(tabId)) {
        activeDetections.delete(tabId);
    }

    // Also remove from interrupted detections if it was marked (user came back to tab)
    if (interruptedDetections.has(tabId)) {
        interruptedDetections.delete(tabId);
    }

    // OPTIMIZED 3.2: State is auto-cleaned by TTL, but we can delete eagerly
    detectionStates.delete(tabId);

    // Clean up payloads after detection completes (they were stored for this detection)
    if (payloadStore.has(tabId)) {
        payloadStore.delete(tabId);
    }

    // Clean up network URLs after detection completes
    if (networkUrlsStore.has(tabId)) {
        networkUrlsStore.delete(tabId);
    }

    // Clean up headers after detection completes (free up memory like payloads)
    if (headersStore.has(tabId)) {
        headersStore.delete(tabId);
    }

    if (requestHeadersStore.has(tabId)) {
        requestHeadersStore.delete(tabId);
    }

    // Clean up cookies after detection completes
    if (responseCookiesStore.has(tabId)) {
        responseCookiesStore.delete(tabId);
    }

    // NOTE: We don't clear tabsUsingCache here anymore!
    // The flag persists across F5 refreshes to prevent race condition where
    // webRequest fires before CHECK_CACHE_EARLY completes.
    // The flag is only cleared when URL actually changes (see chrome.tabs.onUpdated handler)
}

/**
 * Migrate legacy storage keys into current format.
 *
 * - Moves `scrapfly_detection_storage` into `scrapfly_history` (cache now lives in history)
 * - Removes unused legacy keys like `scrapfly_detection_state`
 * - Removes legacy log-collector keys (now stored inside `scrapfly_settings`)
 */

function enrichPageDataWithTabInfo(pageData, tab) {
    return {
        ...pageData,
        tabId: tab.id,
        tabUrl: tab.url,
        tabTitle: tab.title,
        favicon: tab.favIconUrl
    };
}

/**
 * Process detection data from content script
 * @param {object} message - Message from content script
 * @param {object} sender - Sender information
 */
async function processDetectionData(message, sender) {
    if (!sender.tab || !sender.tab.id) {
        Logger.error('BACKGROUND', 'Scrapfly Background: No tab information in sender');
        return;
    }

    // Check if extension is enabled
    if (!await isExtensionEnabled()) {
        return;
    }

    const tabId = sender.tab.id;
    const pageData = enrichPageDataWithTabInfo(message.data, sender.tab);

    // Show progress indicator in badge and track as active detection
    try {
        chrome.action.setBadgeText({ text: BADGE.TEXT.LOADING, tabId: tabId }).catch(() => {});
        chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.LOADING, tabId: tabId }).catch(() => {});

        // Create AbortController to allow cancellation if tab switch occurs
        const abortController = new AbortController();

        // Track this tab as having an active detection in progress
        activeDetections.set(tabId, {
            url: pageData.url,
            startTime: Date.now(),
            abortController: abortController
        });
    } catch (error) {
        Logger.error('BACKGROUND', 'Failed to set loading badge:', error);
    }

    // Add response headers if available (backward compatibility - keep as pageData.headers)
    if (headersStore.has(tabId)) {
        const headerData = headersStore.get(tabId);

        // Only use headers if they're from the same URL (or close enough)
        if (headerData.url.includes(pageData.hostname)) {
            pageData.headers = headerData.headers; // Response headers (backward compatibility)
            pageData.responseHeaders = headerData.headers; // Also store explicitly as responseHeaders

            // OPTIMIZED 3.3: Eager delete (TTL will clean up anyway, but we can help)
            headersStore.delete(tabId);
        }
    }

    // Add request headers if available
    if (requestHeadersStore.has(tabId)) {
        const requestHeaderData = requestHeadersStore.get(tabId);

        if (requestHeaderData.url.includes(pageData.hostname)) {
            pageData.requestHeaders = requestHeaderData.headers;

            requestHeadersStore.delete(tabId);
        }
    }

    // Add response cookies if available (from Set-Cookie headers)
    if (responseCookiesStore.has(tabId)) {
        const responseCookieData = responseCookiesStore.get(tabId);

        if (responseCookieData.url.includes(pageData.hostname)) {
            pageData.responseCookies = responseCookieData.cookies;

            responseCookiesStore.delete(tabId);
        }
    }

    // Add request payloads if available (POST/PUT/PATCH bodies)
    // Now handles ARRAY of payloads per tab
    if (payloadStore.has(tabId)) {
        const payloadsArray = payloadStore.get(tabId);

        // Pass all payloads to detection engine (no filtering)
        const relevantPayloads = [];

        for (const payloadData of payloadsArray) {
            try {
                relevantPayloads.push({
                    method: payloadData.method,
                    url: payloadData.url,
                    data: payloadData.payload,
                    type: payloadData.type
                });
            } catch (e) {
                Logger.error('BACKGROUND', 'Error processing payload:', e);
            }
        }

        // Pass all payloads for detection
        if (relevantPayloads.length > 0) {
            pageData.payloads = relevantPayloads;

            // Don't delete yet - will delete after detection completes
            // payloadStore.delete(tabId);
        }
    }

    // Add network request URLs if available (for URL pattern detection)
    if (networkUrlsStore.has(tabId)) {
        const networkUrlsArray = networkUrlsStore.get(tabId);

        // No filtering - pass all URLs to detection engine
        const relevantUrls = networkUrlsArray;

        if (relevantUrls.length > 0) {
            pageData.networkUrls = relevantUrls;
        }
    }

    // Note: Request cookies are already in pageData.cookies (from document.cookie in content script)

    // ENHANCEMENT: Collect ALL cookies via chrome.cookies API (includes HttpOnly cookies)
    // This supplements document.cookie which cannot access HttpOnly, Secure, or domain-specific cookies
    try {
        const allCookies = await chrome.cookies.getAll({ url: pageData.url });

        // Convert to same format as extractCookies() from content script
        pageData.allCookies = allCookies.map(cookie => ({
            name: cookie.name,
            value: cookie.value.substring(0, 100), // Match performance limit
            domain: cookie.domain,
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
            sameSite: cookie.sameSite
        }));

        // Log enhancement details
        if (typeof Logger !== 'undefined') {
            Logger.cache(`Enhanced cookie collection via chrome.cookies API`, {
                documentCookies: pageData.cookies?.length || 0,
                allCookies: pageData.allCookies.length,
                httpOnlyCount: pageData.allCookies.filter(c => c.httpOnly).length,
                secureCount: pageData.allCookies.filter(c => c.secure).length
            });
        }
    } catch (error) {
        if (typeof Logger !== 'undefined') {
            Logger.error('CACHE', 'Failed to get cookies via chrome.cookies API', error);
        }
    }

    // Run detection analysis immediately
    let detectionResults = [];
    try {
        // Ensure DetectorManager is initialized (handles service worker restarts)
        await ensureDetectorManagerInitialized();

        // Create detection engine if not exists
        if (!detectionEngine) {
            detectionEngine = new DetectionEngineManager();
        }
        // Set detectors from detector manager
        detectionEngine.setDetectors(detectorManager.getAllDetectors());

        // Run detection with timeout (reduced from 30s to 10s - still plenty for slow pages)
        try {
            const startTime = Date.now();

            // LOG: Show all network URLs being passed to detection
            if (pageData.networkUrls && pageData.networkUrls.length > 0) {
                Logger.background(`[Network URLs] Passing ${pageData.networkUrls.length} URLs to detection engine:`);
                pageData.networkUrls.forEach((urlObj, index) => {
                    Logger.background(`  ${index + 1}. ${urlObj.url} | Type: ${urlObj.type} | Method: ${urlObj.method}`);
                });
            } else {
                Logger.background(`[Network URLs] No network URLs available for detection!`);
            }

            const detectionPromise = Promise.resolve(detectionEngine.detectOnPage(pageData));
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Detection timeout after 10 seconds')), 10000)
            );
            detectionResults = await Promise.race([detectionPromise, timeoutPromise]);

            const elapsed = Date.now() - startTime;
            Logger.background(`[processDetectionData] Main detection completed in ${elapsed}ms: ${detectionResults.length} detectors found`);

            // GRANULAR PROGRESS: Send incremental updates for main detection methods
            // Mark each method complete as it finishes detection
            // FIX: Use markMethodComplete to properly track progress and trigger finalization
            Logger.background(`%c[processDetectionData] MARKING MAIN METHODS COMPLETE for tab ${tabId}`, 'color: #2196F3; font-weight: bold; font-size: 14px;');
            const mainMethods = ['cookies', 'headers', 'url', 'dom', 'payload'];
            for (const method of mainMethods) {
                Logger.background(`[processDetectionData] Marking ${method} complete...`);
                markMethodComplete(tabId, method);
            }
            Logger.background(`%c[processDetectionData] All main methods marked complete`, 'color: #4caf50; font-weight: bold;');

            // Log what was detected
            if (detectionResults.length > 0) {
                detectionResults.forEach(det => {
                    const methods = det.matches?.map(m => m.type).filter((v, i, a) => a.indexOf(v) === i) || [];
                    Logger.background(`[processDetectionData]   - ${det.detector?.name}: ${methods.join(', ')} (${det.matches?.length || 0} matches)`);
                });
            }
        } catch (error) {
            const errorType = error.message.includes('timeout') ? 'TIMEOUT' : 'ERROR';
            Logger.error('BACKGROUND', `[processDetectionData] Main detection ${errorType} for tab ${tabId}:`, error.message);
            Logger.error('BACKGROUND', `[processDetectionData] Stack:`, error.stack);
            Logger.error('BACKGROUND', `[processDetectionData] Continuing with empty results - only window props and hooks will be preserved`);
            detectionResults = []; // Continue with empty results - JS hooks and window props will still be preserved
        }

        Logger.background(`Scrapfly Background: Detected ${detectionResults.length} security systems via main detection`);

        // Check if detection was aborted (tab switch occurred)
        const detectionInfo = activeDetections.get(tabId);
        if (detectionInfo && detectionInfo.abortController.signal.aborted) {
            Logger.background(`[Detection] Detection for tab ${tabId} was aborted - skipping result storage`);
            return; // Don't store results or finalize
        }

        // Also check if tab is marked as interrupted
        if (interruptedDetections.has(tabId)) {
            Logger.background(`[Detection] Detection for tab ${tabId} is interrupted - skipping result storage`);
            return; // Don't store results or finalize
        }

        // Store main detection and check if ready to finalize
        Logger.background(`%c[processDetectionData] Getting/Creating detection state for tab ${tabId}`, 'color: #ff9800; font-weight: bold;');
        const state = getOrCreateDetectionState(tabId, pageData.url);

        // Store tabTitle in state for use when saving to history
        if (!state.tabTitle && pageData.tabTitle) {
            state.tabTitle = pageData.tabTitle;
            Logger.background(`[processDetectionData] Stored tabTitle in state: "${state.tabTitle}"`);
        }

        Logger.background(`[processDetectionData] Current state before storing:`, {
            completedMethods: Array.from(state.completedMethods || []),
            completedCount: state.completedMethods?.size || 0,
            url: state.url,
            tabTitle: state.tabTitle
        });

        // URL validation: Ensure URL hasn't changed during detection
        if (state.url !== pageData.url) {
            Logger.background(`[Detection] URL changed during detection for tab ${tabId}: ${pageData.url} → ${state.url} - skipping result storage`);
            return; // Don't store results for the wrong URL
        }

        // Merge with existing mainData (window properties may have been added already)
        // Instead of replacing, merge detections by detectorId
        const existingDetections = new Map();
        for (const existing of state.mainData) {
            const id = existing.detector?.id || existing.id;
            if (id) existingDetections.set(id, existing);
        }

        // Add/merge main detection results
        for (const newDetection of detectionResults) {
            const id = newDetection.detector?.id || newDetection.id;
            if (id && existingDetections.has(id)) {
                // Merge: combine matches, but check for duplicates by category
                const existing = existingDetections.get(id);
                const existingMatches = existing.matches || [];
                const newMatches = newDetection.matches || [];

                // Use Set for O(1) deduplication instead of O(n) Array.some()
                // Build lookup set from existing matches for fast duplicate detection
                const matchKeys = new Set();
                for (const match of existingMatches) {
                    matchKeys.add(generateMatchKey(match));
                }

                // Add new matches if not duplicate
                for (const newMatch of newMatches) {
                    const key = generateMatchKey(newMatch);
                    if (!matchKeys.has(key)) {
                        existingMatches.push(newMatch);
                        matchKeys.add(key);
                    }
                }

                existing.matches = existingMatches;

                // Update confidence to highest
                existing.confidence = Math.max(existing.confidence || 0, newDetection.confidence || 0);

                // Merge detectionMethods
                const existingMethods = existing.detectionMethods || [];
                const newMethods = newDetection.detectionMethods || [];
                existing.detectionMethods = [...new Set([...existingMethods, ...newMethods])];
            } else {
                // New detector, add it
                existingDetections.set(id, newDetection);
            }
        }

        // Update state.mainData with merged results
        state.mainData = Array.from(existingDetections.values());
        state.mainComplete = true;

        Logger.background(`[processDetectionData] Main detection complete: ${detectionResults.length} detectors`);

        // CRITICAL FIX: Update badge immediately when detection completes
        // This is the ONLY place badge should be updated to the final count
        // Fixes the "stuck at 29%" issue by setting badge to count ASAP, not via percentage
        await (async () => {
            try {
                // Wait a tiny bit for hooks data to arrive (in case it's close behind)
                // But not too long - max 500ms
                let attempts = 0;
                while (state.hooksData.size === 0 && attempts < 5) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }

                // Merge hooks data + main data to get total detection count
                const mergedDetections = new Map();

                // Add hooks data
                for (const [detectorId, detector] of state.hooksData.entries()) {
                    mergedDetections.set(detectorId, detector);
                }

                // Add main detection data
                for (const detector of state.mainData) {
                    const detectorId = detector.detector?.id || detector.id;
                    if (!mergedDetections.has(detectorId)) {
                        mergedDetections.set(detectorId, detector);
                    }
                }

                const detectionCount = mergedDetections.size;

                // Get badge colors
                const badgeColors = await CategoryManager.getBadgeColors(categoryManager);

                if (detectionCount > 0) {
                    const detections = Array.from(mergedDetections.values());
                    const count = detectionCount.toString();
                    const avgConfidence = DetectionUtils.computeAverageConfidence(detections);
                    const difficulty = DetectionUtils.getDifficultyLevel(detections, avgConfidence);
                    const color = difficulty === 'High' ? badgeColors.high :
                                 difficulty === 'Medium' ? badgeColors.medium :
                                 badgeColors.low;

                    Logger.background(`%c[processDetectionData] UPDATING BADGE TO FINAL COUNT: "${count}"`, 'color: #2196F3; font-weight: bold; font-size: 14px;');
                    Logger.background(`[processDetectionData] Detection count: ${detectionCount} (hooks: ${state.hooksData.size}, main: ${state.mainData.length})`);

                    await chrome.action.setBadgeText({ text: count, tabId: tabId });
                    await chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId });

                    Logger.background(`%c[processDetectionData] Badge set to FINAL COUNT "${count}" - NO MORE PERCENTAGE UPDATES!`, 'color: #4caf50; font-weight: bold; font-size: 14px;');
                } else {
                    Logger.background(`%c[processDetectionData] No detections found - showing clean badge`, 'color: #ff9800; font-weight: bold;');
                    await chrome.action.setBadgeText({ text: BADGE.TEXT.CLEAN, tabId: tabId });
                    await chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.CLEAN, tabId: tabId });
                }
            } catch (error) {
                // Silently ignore "No tab with id" errors - expected when tab closes during detection
                if (error.message && error.message.includes('No tab with id')) {
                    Logger.background(`[processDetectionData] Tab ${tabId} closed during detection, skipping badge update`);
                } else {
                    Logger.error('DETECTION', '[processDetectionData] Error updating badge:', error);
                }
            }
        })();

        // PHASE 1 FIX: Safety timeout for completion signals
        // Wait longer (5 seconds) to give main detection time to complete
        // This prevents the badge from being stuck at percentage (e.g., 29%)
        setTimeout(async () => {
            const currentState = detectionStates.get(tabId);
            if (!currentState) {
                Logger.background(`[5s Safety Timeout] Tab ${tabId} state already cleaned up`);
                return;
            }

            if (currentState.finalized) {
                Logger.background(`[5s Safety Timeout] Tab ${tabId} already finalized, no action needed`);
                return;
            }

            // Check if main detection has completed
            const mainMethodsComplete = ['cookies', 'headers', 'url', 'dom'].every(m => currentState.completedMethods.has(m));

            if (!mainMethodsComplete) {
                Logger.warn('BACKGROUND', `%c[5s SAFETY] Main detection hasn't completed yet - waiting...`, 'color: #ff9800; font-weight: bold;');
                Logger.warn('BACKGROUND', `[5s SAFETY] Completed methods: [${Array.from(currentState.completedMethods)}]`);
                // Don't force methods if main detection is still running
                // Main detection will mark them complete when it finishes
                return;
            }

            // Only force hook/window methods if main detection is done
            let forcedMethods = [];

            if (!currentState.windowPropertiesComplete) {
                Logger.warn('BACKGROUND', `%c[5s SAFETY] Main complete, forcing windowProperties completion (signal lost)`, 'color: #ff9800; font-weight: bold;');
                markMethodComplete(tabId, 'windowProperties');
                currentState.windowPropertiesComplete = true;
                forcedMethods.push('windowProperties');
            }

            if (!currentState.hooksComplete) {
                const hooksDeadline = await ensureHooksDeadline(currentState);
                const now = Date.now();
                if (now < hooksDeadline) {
                    const debugMode = await ensureDebugMode(currentState);
                    if (debugMode) {
                        Logger.warn('BACKGROUND', `[5s SAFETY] Deferring jsHooks force; ${hooksDeadline - now}ms until hooks deadline`);
                    }
                } else {
                    Logger.warn('BACKGROUND', `%c[5s SAFETY] Main complete, forcing jsHooks completion (signal lost)`, 'color: #ff9800; font-weight: bold;');
                    markMethodComplete(tabId, 'jsHooks');
                    currentState.hooksComplete = true;
                    currentState.hooksTimedOut = true;
                    forcedMethods.push('jsHooks');
                }
            }

            // CRITICAL FIX: Check if detection data is ALREADY stored
            const storedData = await DetectionEngineManager.getStoredDetection(currentState.url);
            if (storedData) {
                Logger.background(`%c[5s SAFETY TIMEOUT] Detection data already stored for tab ${tabId}!`, 'color: #4caf50; font-weight: bold;');
                Logger.background(`[5s SAFETY] Found ${storedData.detectionResults?.length || 0} detectors - finalizing immediately`);

                // Finalize immediately
                await finalizeDetection(tabId, currentState);
                Logger.background(`%c[5s SAFETY] Finalization complete, badge updated to count`, 'color: #4caf50; font-weight: bold;');
                return;
            }

            // If we forced any methods, trigger finalization
            if (forcedMethods.length > 0) {
                Logger.warn('BACKGROUND', `%c[5s SAFETY TIMEOUT TRIGGERED]`, 'color: #ff9800; font-weight: bold; font-size: 14px;');
                Logger.warn('BACKGROUND', `[5s SAFETY] Forced completion of: ${forcedMethods.join(', ')}`);
                Logger.warn('BACKGROUND', `[5s SAFETY] Current state:`, {
                    windowPropertiesComplete: currentState.windowPropertiesComplete,
                    mainComplete: currentState.mainComplete,
                    hooksComplete: currentState.hooksComplete,
                    completedMethods: Array.from(currentState.completedMethods),
                    url: currentState.url
                });

                // Trigger finalization check
                checkAndFinalizeDetection(tabId);
                Logger.background(`%c[5s SAFETY] Forced finalization triggered`, 'color: #ff9800; font-weight: bold;');
            }
        }, 5000); // 5 seconds - give main detection time to complete

        // Check if all methods are done
        checkAndFinalizeDetection(tabId);

        // FIX: Removed early history save - history is now saved ONLY in finalizeDetection()
        // This prevents duplicate saves and ensures history contains complete data (including hooks)
        // Early save here would miss JS hooks which arrive later via batching
        Logger.detection('[processDetectionData] Skipping early history save - will save complete data during finalization');
    } catch (error) {
        Logger.error('BACKGROUND', 'Scrapfly Background: Error running detection:', error);
    }

    Logger.background(`Scrapfly Background: Processed detection data for tab ${tabId}`, {
        url: pageData.url,
        cookies: pageData.cookies.length,
        content: pageData.content?.length || 0,
        externalContent: pageData.externalContent?.length || 0,
        dom: pageData.dom.length,
        headers: Object.keys(pageData.headers || {}).length,
        detections: detectionResults.length
    });

    // FIX: Don't notify popup here - wait for finalization when ALL methods complete
    // This prevents showing partial results before hooks/window properties are analyzed
    // Notification is sent in finalizeDetection() after 100% completion
    
    // Send webhook if enabled
    if (detectionResults.length > 0) {
        await Settings.sendWebhookIfEnabled(pageData, detectionResults);
    }
}

