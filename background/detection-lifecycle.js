/**
 * Background detection lifecycle helpers.
 * Extracted from background.js to keep the service worker entry thin.
 */

function markMethodComplete(tabId, methodName) {
    const state = detectionStates.get(tabId);
    if (!state || state.failed || state.interrupted) {
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
    if (!DetectionSessionStore.isCurrent(tabId, state) || state.finalized || state.finalizing) return;
    if (batchProcessingFlags.get(tabId) === true) return;
    const elapsed = Date.now() - (state.startTime || 0);
    const delay = Math.max(Constants.FINALIZATION_CHECK_DELAY, Constants.MIN_DETECTION_TIME - elapsed);
    DetectionSessionStore.schedule(tabId, state, 'finalization', async () => {
        if (state.finalized || state.finalizing || batchProcessingFlags.get(tabId) === true) return;
        const timeSinceLastBatch = Date.now() - (state.lastHookBatchTime || 0);
        if (state.lastHookBatchTime > 0 && timeSinceLastBatch < Constants.BATCH_SETTLE_TIME) {
            DetectionSessionStore.schedule(tabId, state, 'finalization', () => checkAndFinalizeDetection(tabId),
                Constants.BATCH_SETTLE_TIME - timeSinceLastBatch);
            return;
        }
        const completedCount = state.completedMethods.size;
        const mainMethodsComplete = ['cookies', 'headers', 'url', 'dom', 'payload'].every(method => state.completedMethods.has(method));
        if (completedCount >= 7 || mainMethodsComplete) {
            const hooksDeadline = await ensureHooksDeadline(state);
            if (!DetectionSessionStore.isCurrent(tabId, state)) return;
            const now = Date.now();
            if (!state.hooksComplete && !state.usedCache && now < hooksDeadline) {
                DetectionSessionStore.schedule(tabId, state, 'finalization', () => checkAndFinalizeDetection(tabId), Math.min(hooksDeadline - now, 500));
                return;
            }
            if (!state.hooksComplete && now >= hooksDeadline) {
                state.hooksTimedOut = true;
                state.hooksComplete = true;
                state.hooksCompletionReason ||= 'deadline_timeout';
                state.hooksCompletionTime ||= now - (state.startTime || now);
                markMethodComplete(tabId, 'jsHooks');
            }
            sendProgressUpdate(tabId, 'complete', state.completedMethods, 7);
            await finalizeDetection(tabId, state);
        } else if (state.usedCache) {
            state.finalized = true;
            DetectionSessionStore.finish(tabId, state);
        }
    }, delay);
}

/**
 * Final say for detectors that use combinations: score the merged matches
 * (page, hooks, window properties) and drop the ones that do not hold.
 * Every other detection passes through unchanged.
 */
function rescoreCombinations(detection) {
    if (typeof DetectionCombinations === 'undefined') return !detection?.partial;
    const id = detection?.detector?.id || detection?.id;
    const definition = id && detectorManager?.findDetectorById ? detectorManager.findDetectorById(id) : null;
    if (!definition) return !detection?.partial;
    return DetectionCombinations.rescore(definition, detection);
}

/**
 * Add one detection to a map of detections by detector id: a detector already
 * there gains the matches it did not have (and the higher confidence), a new
 * one is added as is.
 */
function mergeDetection(byId, newDetection) {
    const id = newDetection.detector?.id || newDetection.id;
    if (!id) return;
    const existing = byId.get(id);
    if (!existing) {
        byId.set(id, newDetection);
        return;
    }
    const existingMatches = existing.matches || [];
    const matchKeys = new Set(existingMatches.map(generateMatchKey));
    for (const newMatch of newDetection.matches || []) {
        const key = generateMatchKey(newMatch);
        if (!matchKeys.has(key)) {
            existingMatches.push(newMatch);
            matchKeys.add(key);
        }
    }
    existing.matches = existingMatches;
    existing.confidence = Math.max(existing.confidence || 0, newDetection.confidence || 0);
    existing.detectionMethods = [...new Set([...(existing.detectionMethods || []), ...(newDetection.detectionMethods || [])])];
}

/**
 * URL rules against the requests made after the page snapshot: the scan reads
 * the page right after load, but captcha and anti-bot SDKs often call their
 * servers a second or more later (a challenge request, a verify call), and
 * those requests are only in the tab's list by the time the scan finishes.
 */
async function matchLateRequests(tabId, state, mergedDetections) {
    if (typeof detectionEngine === 'undefined' || !detectionEngine || typeof networkUrlsStore === 'undefined') return;
    const networkUrls = networkUrlsStore.get(tabId);
    if (!Array.isArray(networkUrls) || networkUrls.length === 0) return;
    const stats = detectionEngine.lastStats; // the scan report describes the page snapshot
    try {
        const late = await detectionEngine.detectOnPage({ url: state.url, networkUrls: networkUrls.slice() }, { includePartial: true });
        if (!DetectionSessionStore.isCurrent(tabId, state)) return;
        for (const detection of Array.isArray(late) ? late : []) mergeDetection(mergedDetections, detection);
    } catch (error) {
        Logger.error('SCAN', 'Late request check failed', error);
    } finally {
        if (DetectionSessionStore.isCurrent(tabId, state)) detectionEngine.lastStats = stats;
    }
}

async function finalizeDetection(tabId, state) {
    if (!DetectionSessionStore.isCurrent(tabId, state) || state.finalizing || state.finalized) return;
    if (interruptedDetections.has(tabId)) {
        DetectionSessionStore.cancel(tabId, 'interrupted', state);
        return;
    }
    // Allow finalization if methods completed, even with empty results
    const hasHooksData = state.hooksData && state.hooksData.size > 0;
    const hasMainData = state.mainData && state.mainData.length > 0;
    const hasCompletedMethods = state.completedMethods && state.completedMethods.size > 0;

    if (!hasHooksData && !hasMainData && !hasCompletedMethods) {
        return; // Don't finalize with empty data AND no completed methods
    }

    state.finalizing = true;
    state.finalized = true; // progress cannot replace the final badge
    try {
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

    await matchLateRequests(tabId, state, mergedDetections);
    if (!DetectionSessionStore.isCurrent(tabId, state)) return;

    let finalResults = Array.from(mergedDetections.values()).filter(rescoreCombinations);
    const normalizedFavicon = UrlUtils.normalizeFaviconForStorage(state.favicon, state.url);

    // Store to cache
    const pageData = {
        url: state.url,
        hostname: UrlUtils.getHostnameFromUrl(state.url),
        favicon: normalizedFavicon
    };

    const storedDataWithExpiry = await DetectionEngineManager.storeDetection(state.url, pageData, finalResults);
    if (!DetectionSessionStore.isCurrent(tabId, state)) return;
    const preservedExistingCache = storedDataWithExpiry?.preservedExisting === true;

    if (preservedExistingCache && storedDataWithExpiry.detectionResults?.length > 0) {
        finalResults = storedDataWithExpiry.detectionResults;
        Logger.detection(`${Logger.hostOf(state.url)}: rescan found nothing, kept the cached detections`);
    }

    // Update state with expiry info for immediate popup queries
    if (storedDataWithExpiry) {
        state.expiry = storedDataWithExpiry.expiry;
        state.timestamp = storedDataWithExpiry.timestamp;
        state.favicon = storedDataWithExpiry.favicon;
    }

    // One readable block per page in Debug mode (replaces the per-step lines)
    if (typeof ScanReport !== 'undefined') {
        ScanReport.log(state.url, finalResults, state);
    }

    // Update badge with appropriate color
    await setBadgeForDetections(tabId, state.url, finalResults, () => DetectionSessionStore.isCurrent(tabId, state));
    if (!DetectionSessionStore.isCurrent(tabId, state)) return;

    // Notify popup (with the cache fields it shows: expiry, scope, favicon)
    chrome.runtime.sendMessage({
        type: 'NEW_DETECTION_DATA',
        tabId: tabId,
        url: state.url,
        detectionResults: finalResults,
        expiry: storedDataWithExpiry?.expiry,
        timestamp: storedDataWithExpiry?.timestamp,
        cacheScope: storedDataWithExpiry?.cacheScope,
        favicon: storedDataWithExpiry?.favicon
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
        }, state.documentId ? { documentId: state.documentId } : {});
    } catch (error) {
        // Expected: Tab may have been closed or content script not ready
        Logger.debug('SCAN', `Tab ${tabId} closed before the JS API event: ${error.message}`);
    }

    if (!DetectionSessionStore.isCurrent(tabId, state)) return;

    // Save complete detections (includes hooks/fingerprints) to history
    if (finalResults.length > 0 && !preservedExistingCache) {
        try {
            const pageData = {
                url: state.url,
                hostname: UrlUtils.getHostnameFromUrl(state.url),
                tabTitle: state.tabTitle,
                favicon: UrlUtils.normalizeFaviconForStorage(state.favicon, state.url)
            };

            const historySettings = await Utils.getHistorySettings();
            if (!DetectionSessionStore.isCurrent(tabId, state)) return;
            const shouldSave = await HistoryRecorder.shouldSaveToHistory(state.url, historySettings, chrome);
            if (!DetectionSessionStore.isCurrent(tabId, state)) return;

            if (shouldSave) {
                await HistoryRecorder.saveDetectionToHistory(tabId, pageData, finalResults, chrome, {
                    historySettings,
                    source: 'finalize'
                });
            }
        } catch (error) {
            Logger.error('DETECTION', '[Finalize] Error saving to history:', error);
        }
    }

    DetectionSessionStore.finish(tabId, state);
    } catch (error) {
        // A retry starts a new session; a failed write never completes this scan.
        DetectionSessionStore.fail(tabId, state, error);
        throw error;
    } finally {
        state.finalizing = false;
        if (!state.failed && !DetectionSessionStore.isCurrent(tabId, state)) DetectionSessionStore.finish(tabId, state);
    }
}

function enrichPageDataWithTabInfo(pageData, tab) {
    const pageUrl = tab.url || pageData.url || pageData.hostname;
    const favicon = UrlUtils.normalizeFaviconForStorage(tab.favIconUrl || pageData.favicon, pageUrl);

    return {
        ...pageData,
        // The content script does not send a hostname, and processDetectionData
        // only attaches the stored response headers, request headers and
        // Set-Cookie data when their URL contains it: without this every
        // header and response-cookie rule silently never matched.
        hostname: pageData.hostname || UrlUtils.getHostnameFromUrl(tab.url || pageData.url),
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

    const tabId = sender.tab.id;
    const pageData = enrichPageDataWithTabInfo(message.data, sender.tab);
    const state = DetectionSessionStore.begin(tabId, pageData.url);
    if (!await isExtensionEnabled()) {
        DetectionSessionStore.cancel(tabId, 'disabled', state);
        return;
    }
    if (!DetectionSessionStore.isCurrent(tabId, state)) return;
    startBadgeSpinner(tabId);

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
            pageData.networkUrls = relevantUrls.slice();
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

    } catch (error) {
        if (typeof Logger !== 'undefined') {
            Logger.error('CACHE', 'Failed to get cookies via chrome.cookies API', error);
        }
    }

    if (!DetectionSessionStore.isCurrent(tabId, state)) return;

    // Run detection analysis immediately
    let detectionResults = [];
    try {
        // Ensure DetectorManager is initialized (handles service worker restarts)
        await ensureDetectorManagerInitialized();
        if (!DetectionSessionStore.isCurrent(tabId, state)) return;

        // Create detection engine if not exists
        if (!detectionEngine) {
            detectionEngine = new DetectionEngineManager();
        }
        // Set detectors from detector manager
        detectionEngine.setDetectors(detectorManager.getAllDetectors());

        // Run detection with timeout (reduced from 30s to 10s - still plenty for slow pages)
        try {
            const startTime = Date.now();

            // Partly matched combinations are kept; finalize decides them
            // once hooks and window properties have arrived
            const detectionPromise = Promise.resolve(detectionEngine.detectOnPage(pageData, { includePartial: true }));
            let matchingTimeout;
            const timeoutPromise = new Promise((_, reject) => {
                matchingTimeout = setTimeout(() => reject(new Error('Detection timeout')), Constants.DETECTION_TIMEOUT);
            });
            try { detectionResults = await Promise.race([detectionPromise, timeoutPromise]); }
            finally { clearTimeout(matchingTimeout); }
            if (!DetectionSessionStore.isCurrent(tabId, state)) return;

            const elapsed = Date.now() - startTime;
            Logger.debug('SCAN', `Matched in ${elapsed}ms: ${detectionResults.length} hits before hooks and window checks`);

        } catch (error) {
            const errorType = error.message.includes('timeout') ? 'TIMEOUT' : 'ERROR';
            Logger.error('SCAN', `Matching ${errorType === 'TIMEOUT' ? 'timed out' : 'failed'} on ${Logger.hostOf(pageData.url)}`, error);
            throw error;
        }

        if (!DetectionSessionStore.isCurrent(tabId, state)) return;
        // Check the operation captured for this scan, never a replacement.
        const detectionInfo = state.activeDetection;
        if (detectionInfo && detectionInfo.abortController.signal.aborted) {
            Logger.debug('SCAN', `Tab ${tabId}: scan aborted, results dropped`);
            return; // Don't store results or finalize
        }

        // Also check if tab is marked as interrupted
        if (interruptedDetections.has(tabId)) {
            Logger.debug('SCAN', `Tab ${tabId}: scan interrupted, results dropped`);
            return; // Don't store results or finalize
        }

        // Store main detection and check if ready to finalize
        // Counts and timing for the scan report (background/scan-report.js)
        state.stats = {
            ...(detectionEngine.lastStats || {}),
            cookies: (pageData.allCookies || pageData.cookies || []).length,
            headers: Object.keys(pageData.responseHeaders || pageData.headers || {}).length,
            collectMs: typeof pageData.collectMs === 'number' ? pageData.collectMs : undefined
        };

        // Store tabTitle in state for use when saving to history
        if (!state.tabTitle && pageData.tabTitle) {
            state.tabTitle = pageData.tabTitle;
        }

        // URL validation: Ensure URL hasn't changed during detection
        if (state.url !== pageData.url) {
            Logger.debug('SCAN', `Tab ${tabId} navigated during the scan (${pageData.url} → ${state.url}); results dropped`);
            return; // Don't store results for the wrong URL
        }

        // Merge with existing mainData by detectorId (window properties may already exist)
        const existingDetections = new Map();
        for (const existing of state.mainData) {
            const id = existing.detector?.id || existing.id;
            if (id) existingDetections.set(id, existing);
        }

        // Add/merge main detection results
        for (const newDetection of detectionResults) mergeDetection(existingDetections, newDetection);

        // Update state.mainData with merged results
        state.mainData = Array.from(existingDetections.values());
        state.mainComplete = true;

        // Mark the main methods complete only now that the state exists: when
        // the page data arrived before any hook report there was no state yet,
        // the marks were dropped, and the 5 s safety below (which needs them)
        // never finalized the page, so it showed no results at all
        for (const method of ['cookies', 'headers', 'url', 'dom', 'payload']) {
            markMethodComplete(tabId, method);
        }

        // Final badge is set in finalizeDetection() after cache write

        // 5s safety timeout to force finalization if signals are stuck
        DetectionSessionStore.schedule(tabId, state, 'safety', async () => {
            const currentState = state;
            if (currentState.finalized) {
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
                if (!DetectionSessionStore.isCurrent(tabId, state)) return;
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
            if (!DetectionSessionStore.isCurrent(tabId, state)) return;
            if (storedData) {
                Logger.debug('SCAN', `Safety timeout: finalizing tab ${tabId}`);
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

    } catch (error) {
        Logger.error('SCAN', `Scan failed on ${Logger.hostOf(pageData?.url)}`, error);
        if (DetectionSessionStore.fail(tabId, state, error)) throw error;
    }

    // Defer popup notification until finalization with complete results

    // Send webhook if enabled
    if (DetectionSessionStore.isCurrent(tabId, state) && detectionResults.length > 0) {
        await Settings.sendWebhookIfEnabled(pageData, detectionResults);
    }
}
