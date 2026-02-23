/**
 * Background detection lifecycle helpers.
 * Extracted from background.js to keep the service worker entry thin.
 */

function markMethodComplete(tabId, methodName) {
    const state = detectionStates.get(tabId);
    if (!state) {
        Logger.debug('BACKGROUND', `[markMethodComplete] No state for tab ${tabId}, cannot mark ${methodName} complete`);
        return;
    }

    // VALIDATION: Only allow valid method names from the official methodOrder
    const validMethods = state.methodOrder || ['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload'];
    if (!validMethods.includes(methodName)) {
        Logger.warn('BACKGROUND', `[markMethodComplete] Invalid method name: "${methodName}"`);
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
        Logger.debug('BACKGROUND', `[checkAndFinalize] No state for tab ${tabId}, aborting`);
        return;
    }

    // Prevent premature finalization on newly created state
    if (state.startTime && (Date.now() - state.startTime < Constants.MIN_DETECTION_TIME)) {
        return;
    }

    // Skip finalization if batch processing is active
    const batchActive = batchProcessingFlags.get(tabId) === true;
    if (batchActive) {
        return;
    }

    // Debounce finalization checks (400ms = 2 window property polling cycles)
    if (finalizationDebounce.has(tabId)) {
        clearTimeout(finalizationDebounce.get(tabId));
    }

    const timeout = setTimeout(async () => {
        // Re-check state in case it was deleted during debounce
        const currentState = detectionStates.get(tabId);
        if (!currentState) {
            Logger.debug('BACKGROUND', `[checkAndFinalize] No state for tab ${tabId} after debounce, aborting`);
            finalizationDebounce.delete(tabId);
            return;
        }

        const completedMethods = Array.from(currentState.completedMethods || []);
        const completedCount = completedMethods.length;
        const totalMethods = 7;
        const methodOrder = ['cookies', 'headers', 'url', 'dom', 'jsHooks', 'windowProperties', 'payload'];
        const missingMethods = methodOrder.filter(m => !currentState.completedMethods.has(m));

        if (batchProcessingFlags.get(tabId) === true) {
            finalizationDebounce.delete(tabId);
            return;
        }

        // Wait for batch settle time after last batch arrival
        const timeSinceLastBatch = Date.now() - (currentState.lastHookBatchTime || 0);
        if (currentState.lastHookBatchTime > 0 && timeSinceLastBatch < Constants.BATCH_SETTLE_TIME) {
            const remainingMs = Constants.BATCH_SETTLE_TIME - timeSinceLastBatch;
            // Reschedule check - don't clear, just set new one
            const newTimeout = setTimeout(() => checkAndFinalizeDetection(tabId), remainingMs);
            finalizationDebounce.set(tabId, newTimeout);
            return;
        }

        // Ensure minimum 500ms passed since detection started
        const timeSinceStart = Date.now() - (currentState.startTime || 0);
        if (currentState.startTime && timeSinceStart < Constants.MIN_DETECTION_TIME && !currentState.hooksComplete) {
            const remainingMs = Constants.MIN_DETECTION_TIME - timeSinceStart;
            Logger.background(`[Finalize] Waiting ${remainingMs}ms for minimum detection time (hooks not complete yet)`);
            const newTimeout = setTimeout(() => checkAndFinalizeDetection(tabId), remainingMs);
            finalizationDebounce.set(tabId, newTimeout);
            return;
        }

        // Lenient finalization: 5 main methods instead of all 7
        const REQUIRED_METHODS = 5;
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
                    Logger.debug('BACKGROUND', `[checkAndFinalize] Deferring for hooks: ${remaining}ms until deadline`);
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
                    Logger.debug('BACKGROUND', `[checkAndFinalize] Hooks deadline reached, marking jsHooks complete`);
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

            // Debug-only: log incomplete methods
            const percent = Math.round((completedCount / totalMethods) * 100);
            Logger.debug('BACKGROUND', `[checkAndFinalize] ${completedCount}/${totalMethods} methods (${percent}%)`, {
                completed: completedMethods,
                missing: missingMethods,
                waiting: {
                    windowProperties: !currentState.windowPropertiesComplete,
                    mainComplete: !currentState.mainComplete,
                    hooks: !currentState.hooksComplete
                }
            });
        }

        finalizationDebounce.delete(tabId);
    }, Constants.FINALIZATION_CHECK_DELAY); // 2 window property polling cycles (200ms each)

    finalizationDebounce.set(tabId, timeout);
}

async function finalizeDetection(tabId, state) {
    // Prevent progress updates from overriding the final badge
    state.finalized = true;

    // End keepalive for this detection
    if (workerKeepaliveManager) {
        workerKeepaliveManager.endOperation(`detection-${tabId}`);
    }

    // Skip finalization if detection was interrupted; clean up to prevent zombie state
    if (state.interrupted || interruptedDetections.has(tabId)) {
        detectionStates.delete(tabId);
        activeDetections.delete(tabId);
        Logger.background(`[Finalize] Detection interrupted for tab ${tabId}, cleaned up state`);
        return;
    }

    // Allow finalization if methods completed, even with empty results
    const hasHooksData = state.hooksData && state.hooksData.size > 0;
    const hasMainData = state.mainData && state.mainData.length > 0;
    const hasCompletedMethods = state.completedMethods && state.completedMethods.size > 0;

    if (!hasHooksData && !hasMainData && !hasCompletedMethods) {
        return; // Don't finalize with empty data AND no completed methods
    }

    // Merge hooks and main detection by detectorId
    const mergedDetections = new Map();

    for (const [detectorId, detector] of state.hooksData.entries()) {
        mergedDetections.set(detectorId, detector);
    }

    for (const detector of state.mainData) {
        const detectorId = detector.detector?.id || detector.id;
        if (mergedDetections.has(detectorId)) {
            const existing = mergedDetections.get(detectorId);
            existing.matches = [...existing.matches, ...(detector.matches || [])];

            const existingMethods = existing.detectionMethods || [];
            const newMethods = detector.detectionMethods || [];
            existing.detectionMethods = [...new Set([...existingMethods, ...newMethods])];
        } else {
            if (!detector.detectionMethods) {
                detector.detectionMethods = [];
            }
            mergedDetections.set(detectorId, detector);
        }
    }

    const finalResults = Array.from(mergedDetections.values());
    const normalizedFavicon = UrlUtils.normalizeFaviconForStorage(state.favicon, state.url);

    // Store to cache
    const pageData = {
        url: state.url,
        hostname: UrlUtils.getHostnameFromUrl(state.url),
        favicon: normalizedFavicon
    };

    const storedDataWithExpiry = await DetectionEngineManager.storeDetection(state.url, pageData, finalResults);

    // Update state with expiry info for immediate popup queries
    if (storedDataWithExpiry) {
        state.expiry = storedDataWithExpiry.expiry;
        state.timestamp = storedDataWithExpiry.timestamp;
        state.favicon = storedDataWithExpiry.favicon;
    }

    // Update badge with appropriate color
    await setBadgeForDetections(tabId, state.url, finalResults);

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

    // Save complete detections (includes hooks/fingerprints) to history
    if (finalResults.length > 0) {
        try {
            const pageData = {
                url: state.url,
                hostname: UrlUtils.getHostnameFromUrl(state.url),
                tabTitle: state.tabTitle,
                favicon: UrlUtils.normalizeFaviconForStorage(state.favicon, state.url)
            };

            const historySettings = await Utils.getHistorySettings();
            const shouldSave = await History.shouldSaveToHistory(state.url, historySettings, chrome);

            if (shouldSave) {
                await History.saveDetectionToHistory(tabId, pageData, finalResults, chrome, {
                    historySettings,
                    source: 'finalize'
                });
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

    // Eagerly delete state (TTL would clean up eventually)
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

    // Cache flag persists across F5 to prevent race conditions; cleared on URL change only
}

function enrichPageDataWithTabInfo(pageData, tab) {
    const pageUrl = tab.url || pageData.url || pageData.hostname;
    const favicon = UrlUtils.normalizeFaviconForStorage(tab.favIconUrl || pageData.favicon, pageUrl);

    return {
        ...pageData,
        tabId: tab.id,
        tabUrl: tab.url,
        tabTitle: tab.title,
        favicon: favicon
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
        Promise.all([
            chrome.action.setBadgeText({ text: BADGE.TEXT.LOADING, tabId: tabId }),
            chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.LOADING, tabId: tabId })
        ]).catch(() => {});

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

    // Attach response headers (backward-compatible as pageData.headers)
    if (headersStore.has(tabId)) {
        const headerData = headersStore.get(tabId);

        // Only use headers if they're from the same URL (or close enough)
        if (headerData.url.includes(pageData.hostname)) {
            pageData.headers = headerData.headers; // Response headers (backward compatibility)
            pageData.responseHeaders = headerData.headers; // Also store explicitly as responseHeaders

            // Eager delete after use
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

    // Attach request payloads (array of POST/PUT/PATCH bodies per tab)
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

    // Collect all cookies via chrome.cookies API (includes HttpOnly, Secure, domain-specific)
    try {
        const allCookies = await chrome.cookies.getAll({ url: pageData.url });

        // Convert to same format as extractCookies() from content script
        pageData.allCookies = allCookies.map(cookie => ({
            name: cookie.name,
            value: cookie.value.substring(0, Constants.COOKIE_VALUE_MAX_LENGTH),
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
                setTimeout(() => reject(new Error('Detection timeout')), Constants.DETECTION_TIMEOUT)
            );
            detectionResults = await Promise.race([detectionPromise, timeoutPromise]);

            const elapsed = Date.now() - startTime;
            Logger.background(`[processDetectionData] Main detection completed in ${elapsed}ms: ${detectionResults.length} detectors found`);

            // Mark each main detection method complete
            const mainMethods = ['cookies', 'headers', 'url', 'dom', 'payload'];
            for (const method of mainMethods) {
                markMethodComplete(tabId, method);
            }
            Logger.background(`[processDetectionData] Main methods marked complete for tab ${tabId}`);

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
        Logger.background(`[processDetectionData] Getting/creating state for tab ${tabId}`);
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

        // Merge with existing mainData by detectorId (window properties may already exist)
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

                // O(1) deduplication via Set
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

        // Final badge is set in finalizeDetection() after cache write

        // 5s safety timeout to force finalization if signals are stuck
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
                Logger.debug('BACKGROUND', `[5s safety] Main detection incomplete`, {
                    completed: Array.from(currentState.completedMethods)
                });
                return;
            }

            // Only force hook/window methods if main detection is done
            let forcedMethods = [];

            if (!currentState.windowPropertiesComplete) {
                Logger.debug('BACKGROUND', `[5s safety] Forcing windowProperties completion`);
                markMethodComplete(tabId, 'windowProperties');
                currentState.windowPropertiesComplete = true;
                forcedMethods.push('windowProperties');
            }

            if (!currentState.hooksComplete) {
                const hooksDeadline = await ensureHooksDeadline(currentState);
                const now = Date.now();
                if (now < hooksDeadline) {
                    Logger.debug('BACKGROUND', `[5s safety] Deferring jsHooks force; ${hooksDeadline - now}ms until deadline`);
                } else {
                    Logger.debug('BACKGROUND', `[5s safety] Forcing jsHooks completion`);
                    markMethodComplete(tabId, 'jsHooks');
                    currentState.hooksComplete = true;
                    currentState.hooksTimedOut = true;
                    forcedMethods.push('jsHooks');
                }
            }

            // Check if detection data is already stored
            const storedData = await DetectionEngineManager.getStoredDetection(currentState.url);
            if (storedData) {
                Logger.background(`[5s safety] Detection already stored for tab ${tabId}, finalizing`);
                await finalizeDetection(tabId, currentState);
                return;
            }

            // If we forced any methods, trigger finalization
            if (forcedMethods.length > 0) {
                Logger.debug('BACKGROUND', `[5s safety] Forced: ${forcedMethods.join(', ')}`, {
                    completedMethods: Array.from(currentState.completedMethods)
                });
                checkAndFinalizeDetection(tabId);
            }
        }, Constants.SAFETY_TIMEOUT); // Give main detection time to complete

        // Check if all methods are done
        checkAndFinalizeDetection(tabId);

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

    // Defer popup notification until finalization with complete results

    // Send webhook if enabled
    if (detectionResults.length > 0) {
        await Settings.sendWebhookIfEnabled(pageData, detectionResults);
    }
}

