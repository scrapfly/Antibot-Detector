/**
 * Background utility functions for initialization and detection data retrieval.
 */

async function ensureDetectorManagerInitialized() {
    if (!detectorManager || !detectorManager.initialized) {
        if (!categoryManager) {
            categoryManager = new CategoryManager();
        }
        if (!detectorManager) {
            detectorManager = new DetectorManager(categoryManager);
        }
        if (!detectorManager.initialized) {
            await detectorManager.initialize();
        }
    }
    return detectorManager;
}

async function getCurrentTabDetectionData() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            return await DetectionEngineManager.getDetectionData(tab.id);
        }
    } catch (error) {
        Logger.error('BACKGROUND', 'Scrapfly Background: Error getting current tab:', error);
    }
    return null;
}

// ─── Animated loading badge (braille spinner) ───────────────────────────────
// Per-tab interval that cycles the toolbar badge through BADGE.SPINNER_FRAMES
// while a detection runs. It is SELF-TERMINATING: each tick checks whether the
// tab still has an in-flight detection and stops otherwise, so it can never
// override a finished/cleared badge or outlive the detection (even if a caller
// forgets to stop it). stopBadgeSpinner() also stops it immediately.
const badgeSpinnerTimers = new Map();

function startBadgeSpinner(tabId) {
    stopBadgeSpinner(tabId);
    const frames = BADGE.SPINNER_FRAMES;
    let i = 0;
    chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.LOADING, tabId }).catch(() => {});
    chrome.action.setBadgeText({ text: frames[0], tabId }).catch(() => {});
    const timer = setInterval(() => {
        // Self-terminate once the tab no longer has an active detection.
        const state = (typeof detectionStates !== 'undefined') ? detectionStates.get(tabId) : null;
        const active = (typeof activeDetections !== 'undefined') ? activeDetections.has(tabId) : false;
        const stillLoading = active || (state && !state.finalized);
        if (!stillLoading) { stopBadgeSpinner(tabId); return; }
        i = (i + 1) % frames.length;
        chrome.action.setBadgeText({ text: frames[i], tabId }).catch(() => stopBadgeSpinner(tabId));
    }, 120); // 120ms/frame; runs only during active detection (worker kept alive by keepalive)
    badgeSpinnerTimers.set(tabId, timer);
}

function stopBadgeSpinner(tabId) {
    const timer = badgeSpinnerTimers.get(tabId);
    if (timer !== undefined) {
        clearInterval(timer);
        badgeSpinnerTimers.delete(tabId);
    }
}

async function setBadgeForDetections(tabId, url, detectionResults) {
    stopBadgeSpinner(tabId); // detection finished — stop the loading spinner before showing the result
    // Never paint a detection count while the extension is disabled. A detection
    // that was in-flight when the user toggled off — or a cached-result restore —
    // can reach this after disable; without this guard it overwrites the OFF badge
    // and the toolbar icon shows a detection count for a disabled extension.
    if (!(await isExtensionEnabled())) {
        await Promise.all([
            chrome.action.setBadgeText({ text: BADGE.TEXT.DISABLED, tabId }),
            chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.DISABLED, tabId })
        ]).catch(() => {});
        return;
    }
    try {
        const detectionCount = detectionResults.length;
        if (detectionCount > 0) {
            const isBlacklisted = url ? await Utils.isUrlBlacklisted(url) : false;
            if (!isBlacklisted) {
                const badgeColors = await CategoryManager.getBadgeColors(categoryManager);
                const avgConfidence = DetectionUtils.computeAverageConfidence(detectionResults);
                const difficulty = DetectionUtils.getDifficultyLevel(detectionResults, avgConfidence);
                const color = difficulty === 'High' ? badgeColors.high :
                             difficulty === 'Medium' ? badgeColors.medium :
                             badgeColors.low;
                await Promise.all([
                    chrome.action.setBadgeText({ text: detectionCount.toString(), tabId }),
                    chrome.action.setBadgeBackgroundColor({ color, tabId })
                ]);
            } else {
                await Promise.all([
                    chrome.action.setBadgeText({ text: BADGE.TEXT.BLACKLISTED, tabId }),
                    chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.BLACKLISTED, tabId })
                ]);
            }
        } else {
            await Promise.all([
                chrome.action.setBadgeText({ text: BADGE.TEXT.CLEAN, tabId }),
                chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.CLEAN, tabId })
            ]);
        }
    } catch (error) {
        Logger.background(`[Badge] Failed to set badge for tab ${tabId}: ${error.message}`);
    }
}

/**
 * Request detection for a specific tab from background lifecycle flows.
 * Uses DetectionEngineManager's manual request path for tabs that already have
 * the manifest content script active. Pre-existing tabs without the content
 * script need a page reload so hooks can run at document_start.
 */
async function requestDetectionForTab(tabId, options = {}) {
    const source = options.source || 'background';
    const silent = options.silent === true;

    try {
        const tab = await chrome.tabs.get(tabId);
        if (!Utils.isValidContentScriptTab(tab)) {
            return false;
        }

        const detectionState = detectionStates.get(tabId);
        let activeDetection = activeDetections.get(tabId);
        if (activeDetection?.pendingRequest &&
            Date.now() - activeDetection.startTime > Constants.REQUEST_DETECTION_PENDING_TIMEOUT) {
            activeDetections.delete(tabId);
            activeDetection = null;
        }
        const hasInFlightDetection = !!activeDetection || (detectionState && !detectionState.finalized);
        if (hasInFlightDetection) {
            return false;
        }

        let immediateResponse = null;
        await DetectionEngineManager.handleRequestDetection(
            { tabId, silent, source },
            (response) => {
                immediateResponse = response;
            },
            {
                chrome,
                Utils,
                recentDetectionRequests,
                activeDetections
            }
        );

        if (immediateResponse?.status === 'error' ||
            immediateResponse?.status === 'skipped' ||
            immediateResponse?.status === 'needs_reload') {
            return false;
        }

        Logger.background(`[AutoDetect] Requested detection for tab ${tabId} (source: ${source})`);
        return true;
    } catch (error) {
        Logger.background(`[AutoDetect] Failed to request detection for tab ${tabId}: ${error.message}`);
        return false;
    }
}

var servicesInitialized = false;
function initializeServices() {
    if (servicesInitialized) return;
    servicesInitialized = true;
    Logger.background('Scrapfly Background: Initializing services...');

    setupHeaderCapture();
    setupMessageListeners();
    setupTabListeners();

    Logger.background('Scrapfly Background: Services initialization complete');
}
