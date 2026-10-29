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

/** A tab's captured request bodies, as the engine reads them */
function payloadsForEngine(tabId) {
    const stored = typeof payloadStore !== 'undefined' ? payloadStore.get(tabId) : null;
    return Array.isArray(stored)
        ? stored.map(item => ({ method: item.method, url: item.url, data: item.payload, type: item.type }))
        : [];
}

/**
 * A tab's captured response bodies that belong to this page's origin: a tab
 * that moved to another site never reads the previous site's responses.
 */
function responsesForPage(tabId, pageUrl) {
    const stored = typeof responseStore !== 'undefined' ? responseStore.get(tabId) : null;
    if (!Array.isArray(stored) || stored.length === 0) return [];
    let origin = '';
    try { origin = new URL(pageUrl).origin; } catch (_) { return []; }
    return stored.filter(item => item && item.pageOrigin === origin);
}

/**
 * URL, payload and response rules against what the page sent and received
 * after the snapshot: the scan reads the page right after load, but captcha
 * and anti-bot SDKs often call their servers a second or more later (a
 * challenge request, a verify call), and those requests are only in the tab's
 * lists by the time the scan finishes.
 */
async function matchLateRequests(tabId, state, mergedDetections) {
    if (typeof detectionEngine === 'undefined' || !detectionEngine || typeof networkUrlsStore === 'undefined') return;
    const storedUrls = networkUrlsStore.get(tabId);
    const networkUrls = Array.isArray(storedUrls) ? storedUrls.slice() : [];
    state.lateCheckedUrls = networkUrls.map(entry => entry && entry.url);
    const payloads = payloadsForEngine(tabId);
    const responses = responsesForPage(tabId, state.url);
    if (networkUrls.length === 0 && payloads.length === 0 && responses.length === 0) return;
    const stats = detectionEngine.lastStats; // the scan report describes the page snapshot
    try {
        const late = await detectionEngine.detectOnPage({ url: state.url, networkUrls, payloads, responses }, { includePartial: true });
        if (!DetectionSessionStore.isCurrent(tabId, state)) return;
        for (const detection of Array.isArray(late) ? late : []) mergeDetection(mergedDetections, detection);
    } catch (error) {
        Logger.error('SCAN', 'Late request check failed', error);
    } finally {
        if (DetectionSessionStore.isCurrent(tabId, state)) detectionEngine.lastStats = stats;
    }
}

const lateResponseTimers = new Map();

/**
 * Keep a response body the page captured for a body: "response" rule. A scan
 * in progress reads it (snapshot or late-request check); after the scan, when
 * such a response usually comes (a challenge when a message is sent), the
 * detectors that read responses are matched again and the page's result is
 * updated (see applyLateResponses).
 * @param {number} tabId
 * @param {{url: string, method: string, status: number, data: string, pageOrigin: string, timestamp: number}} response
 */
function recordCapturedResponse(tabId, response) {
    const list = responseStore.get(tabId) || [];
    list.push(response);
    if (list.length > Constants.MAX_RESPONSES_PER_TAB) list.shift();
    responseStore.set(tabId, list);
    if (detectionStates.has(tabId)) return; // the running scan reads it
    clearTimeout(lateResponseTimers.get(tabId));
    lateResponseTimers.set(tabId, setTimeout(() => {
        lateResponseTimers.delete(tabId);
        applyLateResponses(tabId).catch(error => Logger.error('SCAN', 'Late response check failed', error));
    }, 300));
}

/** Rows that matched a response body (the engine marks them) */
function hasResponseMatch(detection) {
    return Array.isArray(detection?.matches) && detection.matches.some(match => match && match.body === 'response');
}

/**
 * After the scan: the detectors whose response rules match now (with the
 * requests the tab made since) are added to the page's stored result, and the
 * badge and an open popup are updated. Nothing else in the result changes.
 */
async function applyLateResponses(tabId) {
    if (typeof detectionEngine === 'undefined' || !detectionEngine || detectionStates.has(tabId)) return;
    if (!await isExtensionEnabled()) return;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const pageUrl = tab && tab.url;
    if (!pageUrl || detectionStates.has(tabId)) return;
    // A skipped site, or one left out in "only these sites" mode, keeps nothing from its responses either: no cache
    // entry, no badge count, no popup update (the page-load check refused its scan for the same reason)
    if (await Utils.isUrlBlacklisted(pageUrl)) return;
    if (detectionStates.has(tabId)) return;
    const responses = responsesForPage(tabId, pageUrl);
    if (responses.length === 0) return;
    const storedUrls = networkUrlsStore.get(tabId);
    const late = await detectionEngine.detectOnPage({
        url: pageUrl,
        networkUrls: Array.isArray(storedUrls) ? storedUrls.slice() : [],
        payloads: payloadsForEngine(tabId),
        responses
    }, { includePartial: true });
    const evidence = (Array.isArray(late) ? late : []).filter(hasResponseMatch);
    if (evidence.length === 0 || detectionStates.has(tabId)) return;

    await addLateEvidence(tabId, pageUrl, tab.favIconUrl, evidence, () => !detectionStates.has(tabId), 'responses');
}

/**
 * Add detections found after the scan to the page's stored result (merged with
 * what it holds, combinations scored again), then update the badge and an open
 * popup. History and the webhook keep what the scan gave them.
 * @param {Array} [fallback] the scan's own results, used when the cache has no entry
 * @returns {Promise<Array|null>} the page's new results, or null when nothing changed
 */
function addLateEvidence(...args) {
    // One at a time: each reads the stored result, adds its evidence and writes it back, so two running together (late
    // responses and the one-second request batch) would each write without the other's evidence
    const run = lateEvidenceQueue.then(() => addLateEvidenceNow(...args));
    lateEvidenceQueue = run.catch(() => {});
    return run;
}
let lateEvidenceQueue = Promise.resolve();

async function addLateEvidenceNow(tabId, pageUrl, tabFavicon, evidence, stillValid, source, fallback) {
    // The entry keeps its private-window mark when it is written again, so it still goes when the private session ends
    const privateWindow = typeof HistoryRecorder !== 'undefined' && typeof HistoryRecorder.isIncognitoTab === 'function'
        && await HistoryRecorder.isIncognitoTab(tabId, chrome).catch(() => false);
    if (!stillValid()) return null;
    const stored = await DetectionEngineManager.getStoredDetection(pageUrl, { privateWindow });
    if (!stillValid()) return null;
    const byId = new Map();
    const base = Array.isArray(stored?.detectionResults) ? stored.detectionResults : (Array.isArray(fallback) ? fallback : []);
    for (const detection of base) {
        const id = detection?.detector?.id || detection?.id;
        if (id) byId.set(id, detection);
    }
    const signature = () => Array.from(byId.values()).map(d => `${d.detector?.id || d.id}:${(d.matches || []).length}`).sort().join(',');
    const before = signature();
    for (const detection of evidence) mergeDetection(byId, detection);
    if (signature() === before) return null; // already known

    const finalResults = Array.from(byId.values()).filter(rescoreCombinations);
    const storedData = await DetectionEngineManager.storeDetection(pageUrl, {
        url: pageUrl,
        hostname: UrlUtils.getHostnameFromUrl(pageUrl),
        favicon: stored?.favicon || tabFavicon,
        ...(privateWindow || stored?.privateWindow === true ? { privateWindow: true } : {})
    }, finalResults);
    if (!stillValid()) return null;
    await setBadgeForDetections(tabId, pageUrl, finalResults);
    Logger.detection(`${Logger.hostOf(pageUrl)}: added from ${source} after the scan: ${evidence.map(d => d.detector?.name || d.name).join(', ')}`);
    chrome.runtime.sendMessage({
        type: WorkerMessages.NEW_DETECTION_DATA,
        tabId,
        url: pageUrl,
        detectionResults: finalResults,
        expiry: storedData?.expiry,
        timestamp: storedData?.timestamp,
        cacheScope: storedData?.cacheScope,
        favicon: storedData?.favicon
    }).catch(() => {
        // Expected: Popup may not be open
    });
    return finalResults;
}

// Pages whose scan finished, by tab. Requests they make afterwards (CHEQ's beacons, a challenge call seconds after
// load) are matched against URL rules and their evidence is added to the page's result (applyLateNetworkUrls).
// A new page in the tab (forgetTabRequests), a new scan, a cache hit, another address or document ends it.
const finishedPages = new Map();
const LATE_NETWORK_DELAY_MS = 1000;   // requests are checked in batches, at most once a second per tab
const LATE_NETWORK_BATCH = 300;       // URLs one check reads; the rest wait for the next second
const LATE_NETWORK_MAX_SEEN = 5000;   // distinct URLs one page is checked for
const LATE_NETWORK_MAX_MATCHES = 20;  // late URLs that may add evidence to one page

function urlWithoutHash(url) {
    return typeof url === 'string' ? url.split('#')[0] : '';
}

/** The scan of this tab's page finished: requests from now on are its late requests. */
function rememberFinishedPage(tabId, state, results) {
    forgetFinishedPage(tabId);
    const page = {
        state, url: state.url, documentId: state.documentId || null, results: Array.isArray(results) ? results : [],
        seen: new Set(state.lateCheckedUrls || []), pending: [], timer: null, added: 0
    };
    finishedPages.set(tabId, page);
    // Requests recorded after the late-request check read the tab's list are late too
    const stored = typeof networkUrlsStore !== 'undefined' ? networkUrlsStore.get(tabId) : null;
    for (const entry of Array.isArray(stored) ? stored.slice() : []) noteLateNetworkUrl(tabId, entry);
}

function forgetFinishedPage(tabId) {
    const page = finishedPages.get(tabId);
    if (!page) return;
    clearTimeout(page.timer);
    finishedPages.delete(tabId);
}

/**
 * A request the tab made (header-capture.js records it first). After the tab's scan finished it is queued for one
 * check of URL rules a second later, with the other requests of that second; during a scan the scan reads it.
 */
function noteLateNetworkUrl(tabId, entry) {
    const page = finishedPages.get(tabId);
    if (!page || !entry || typeof entry.url !== 'string' || !entry.url || entry.type === 'main_frame') return;
    if (page.added >= LATE_NETWORK_MAX_MATCHES || page.seen.has(entry.url) || page.seen.size >= LATE_NETWORK_MAX_SEEN) return;
    page.seen.add(entry.url);
    page.pending.push(entry);
    scheduleLateNetworkCheck(tabId, page);
}

function scheduleLateNetworkCheck(tabId, page) {
    if (page.timer !== null || page.pending.length === 0) return;
    page.timer = setTimeout(() => {
        page.timer = null;
        applyLateNetworkUrls(tabId, page)
            .catch(error => Logger.error('SCAN', 'Late network check failed', error))
            .finally(() => { if (finishedPages.get(tabId) === page) scheduleLateNetworkCheck(tabId, page); });
    }, LATE_NETWORK_DELAY_MS);
}

/**
 * After the scan: URL rules (scope "all") of the enabled detectors against the requests the page made since, with the
 * engine's own matching. Detectors they add evidence to are merged into the page's stored result as late responses are
 * (applyLateResponses): same cache entry, combinations scored again, badge and popup updated, History left alone.
 */
async function applyLateNetworkUrls(tabId, page) {
    const entries = page.pending.splice(0, LATE_NETWORK_BATCH);
    // The finished scan's own state stays in detectionStates: only another scan (a rescan, a new page) ends it
    const ours = () => {
        const current = detectionStates.get(tabId);
        return finishedPages.get(tabId) === page && (!current || current === page.state) &&
            !(typeof tabsUsingCache !== 'undefined' && tabsUsingCache.has(tabId));
    };
    if (entries.length === 0 || finishedPages.get(tabId) !== page) return;
    if (!ours()) { forgetFinishedPage(tabId); return; } // a new scan reads the tab's requests itself; a cached page has none
    if (typeof detectionEngine === 'undefined' || !detectionEngine || !await isExtensionEnabled()) return;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (finishedPages.get(tabId) !== page) return;
    if (!tab || urlWithoutHash(tab.url) !== urlWithoutHash(page.url)) { forgetFinishedPage(tabId); return; }
    if (page.documentId && typeof chrome.webNavigation?.getFrame === 'function') {
        const frame = await chrome.webNavigation.getFrame({ tabId, frameId: 0 }).catch(() => null);
        if (finishedPages.get(tabId) !== page) return;
        if (!frame || (frame.documentId && frame.documentId !== page.documentId)) { forgetFinishedPage(tabId); return; }
    }
    if (await Utils.isUrlBlacklisted(page.url)) return;
    if (!ours()) return;

    // Only the late requests go in, so only URL rules can match (the page address and the rest were matched by the scan)
    const statsBefore = detectionEngine.lastStats; // the scan report keeps describing the page snapshot
    const run = detectionEngine.detectOnPage({ networkUrls: entries }, { includePartial: true });
    const statsOfRun = detectionEngine.lastStats;
    let late;
    try { late = await run; } finally { if (detectionEngine.lastStats === statsOfRun) detectionEngine.lastStats = statsBefore; }
    const urls = new Set(entries.map(entry => entry.url));
    const evidence = [];
    const matchedUrls = new Set();
    for (const detection of Array.isArray(late) ? late : []) {
        const matches = (detection.matches || []).filter(match => match && match.type === 'url' && urls.has(match.fullUrl));
        if (matches.length === 0) continue;
        matches.forEach(match => matchedUrls.add(match.fullUrl));
        evidence.push({ ...detection, matches, detectionMethods: ['url'] });
    }
    if (evidence.length === 0 || !ours()) return;
    page.added += matchedUrls.size;
    if (page.added >= LATE_NETWORK_MAX_MATCHES) page.pending.length = 0;

    const results = await addLateEvidence(tabId, page.url, tab.favIconUrl, evidence, ours, 'requests', page.results);
    if (results) page.results = results;
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

    // Page evidence joins the hooks' entry with its matches, methods and (when
    // higher) its confidence; combination detectors are rescored below
    for (const detector of state.mainData) {
        if (!detector.detectionMethods) {
            detector.detectionMethods = [];
        }
        mergeDetection(mergedDetections, detector);
    }

    await matchLateRequests(tabId, state, mergedDetections);
    if (!DetectionSessionStore.isCurrent(tabId, state)) return;

    let finalResults = Array.from(mergedDetections.values()).filter(rescoreCombinations);

    // A site that is skipped, or left out in "only these sites" mode, keeps nothing from a scan (one that began
    // before it was excluded, or a request that got past the checks): no cache entry, History, webhook or page
    // event, and its badge says it is paused. A watchlist check only opens pages that pass the same test; a Bulk scan
    // page that ended on such a site is told so (it is listed as skipped).
    const scanTab = typeof BackgroundTabScan !== 'undefined' && BackgroundTabScan.isScanTab(tabId);
    const quietTab = scanTab && BackgroundTabScan.isQuiet(tabId);
    // A watch check that ended on such a site keeps nothing either (the check is told: it counts as skipped)
    if (await Utils.isUrlBlacklisted(state.url)) {
        if (!DetectionSessionStore.isCurrent(tabId, state)) return;
        Logger.detection(`${Logger.hostOf(state.url)}: excluded domain, scan results not kept`);
        if (scanTab) BackgroundTabScan.scanFinished(tabId, state.url, [], { excluded: true });
        await setBadgeForDetections(tabId, state.url, [], () => DetectionSessionStore.isCurrent(tabId, state));
        if (DetectionSessionStore.isCurrent(tabId, state)) DetectionSessionStore.finish(tabId, state);
        return;
    }
    const normalizedFavicon = UrlUtils.normalizeFaviconForStorage(state.favicon, state.url);

    // Store to cache (a private-window page only until the last private window closes)
    const privateWindow = typeof HistoryRecorder !== 'undefined' && typeof HistoryRecorder.isIncognitoTab === 'function'
        && await HistoryRecorder.isIncognitoTab(tabId, chrome).catch(() => false);
    if (!DetectionSessionStore.isCurrent(tabId, state)) return;
    const pageData = {
        url: state.url,
        hostname: UrlUtils.getHostnameFromUrl(state.url),
        favicon: normalizedFavicon,
        ...(privateWindow ? { privateWindow: true } : {}),
        // A Bulk scan reports what the page shows now: a clean scan never takes an older result's place
        ...(scanTab && !quietTab ? { fresh: true } : {})
    };

    const storedDataWithExpiry = await DetectionEngineManager.storeDetection(state.url, pageData, finalResults);
    if (!DetectionSessionStore.isCurrent(tabId, state)) return;
    const preservedExistingCache = storedDataWithExpiry?.preservedExisting === true;

    if (preservedExistingCache && storedDataWithExpiry.detectionResults?.length > 0) {
        finalResults = storedDataWithExpiry.detectionResults;
        Logger.detection(`${Logger.hostOf(state.url)}: rescan found nothing, kept the cached detections`);
    }

    // A watchlist check is waiting for this scan: it gets the finished results, and the scan leaves no History entry
    // of its own (the check updates the page it watches) and sends nothing to the webhook
    const watching = quietTab;
    if (watching) BackgroundTabScan.scanFinished(tabId, state.url, finalResults);

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
        type: WorkerMessages.NEW_DETECTION_DATA,
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
            type: WorkerMessages.DETECTION_COMPLETE,
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

    // Save complete detections (includes hooks/fingerprints) to history. A scan that found nothing is recorded only when
    // the page had a protection before (onlyIfChanged): that is a change
    if (!preservedExistingCache && !watching) {
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
                    source: 'finalize',
                    ...(finalResults.length === 0 ? { onlyIfChanged: true } : {})
                });
            }
        } catch (error) {
            Logger.error('DETECTION', '[Finalize] Error saving to history:', error);
        }
    }

    // The webhook gets the finished results (hooks, fingerprints and late requests included) of a page scanned just now
    // (whatever happens to the webhook never fails the scan, and a slow server never holds it: the delivery runs on its own)
    // A private-window page is never sent anywhere (History leaves it out too)
    if (finalResults.length > 0 && !preservedExistingCache && !watching && DetectionSessionStore.isCurrent(tabId, state)) {
        try {
            if (!privateWindow && DetectionSessionStore.isCurrent(tabId, state)) Promise.resolve(Settings.sendWebhookIfEnabled({
                url: state.url,
                hostname: UrlUtils.getHostnameFromUrl(state.url),
                title: state.tabTitle,
                favicon: UrlUtils.normalizeFaviconForStorage(state.favicon, state.url)
            }, finalResults, { trigger: 'scan' })).catch((error) => {
                Logger.warn('NETWORK', 'The webhook step failed', error);
            });
        } catch (error) {
            Logger.warn('NETWORK', 'The webhook step failed', error);
        }
    }

    // A Bulk scan is waiting for this page: it gets the results once History has them (its tab closes right after)
    if (scanTab && !watching) BackgroundTabScan.scanFinished(tabId, state.url, finalResults);

    // Requests the page makes from now on still add URL evidence to this result (applyLateNetworkUrls)
    if (!watching && DetectionSessionStore.isCurrent(tabId, state)) rememberFinishedPage(tabId, state, finalResults);
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

/**
 * Whether what webRequest captured for the tab (headers, Set-Cookie) came from the page's own host. A substring
 * test also took a capture from evil.example/?u=shop.example, or from sub.shop.example, for shop.example.
 */
function capturedForHost(captured, hostname) {
    if (!captured || typeof captured.url !== 'string' || !hostname) return false;
    try {
        return new URL(captured.url).hostname.toLowerCase() === String(hostname).toLowerCase();
    } catch (_) {
        return false;
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
        if (capturedForHost(headerData, pageData.hostname)) {
            pageData.headers = headerData.headers; // Response headers (backward compatibility)
            pageData.responseHeaders = headerData.headers; // Also store explicitly as responseHeaders
        }
    }

    // Add request headers if available
    if (requestHeadersStore.has(tabId)) {
        const requestHeaderData = requestHeadersStore.get(tabId);

        if (capturedForHost(requestHeaderData, pageData.hostname)) {
            pageData.requestHeaders = requestHeaderData.headers;
        }
    }

    // Add response cookies if available (from Set-Cookie headers)
    if (responseCookiesStore.has(tabId)) {
        const responseCookieData = responseCookiesStore.get(tabId);

        if (capturedForHost(responseCookieData, pageData.hostname)) {
            pageData.responseCookies = responseCookieData.cookies;
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
        }
    }

    // Response bodies the page captured for body: "response" payload rules
    const responses = responsesForPage(tabId, pageData.url);
    if (responses.length > 0) {
        pageData.responses = responses;
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
        // Partitioned cookies too (Cloudflare's cf_clearance is one)
        const allCookies = await PageCookies.getAll({ url: pageData.url }, tabId);

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
        if (state.url !== pageData.url && !(state.previousUrls || []).includes(pageData.url)) {
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
            const privateTab = typeof HistoryRecorder !== 'undefined' && typeof HistoryRecorder.isIncognitoTab === 'function'
                && await HistoryRecorder.isIncognitoTab(tabId, chrome).catch(() => false);
            const storedData = await DetectionEngineManager.getStoredDetection(currentState.url, { privateWindow: privateTab });
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

    // The popup and the webhook are told at finalization, with the complete results
}
