/**
 * Background utility functions for initialization and detection data retrieval.
 */

async function ensureDetectorManagerInitialized() {
    if (detectorInitializationPromise) return detectorInitializationPromise;
    if (detectorManager?.initialized) return detectorManager;
    if (!categoryManager) categoryManager = new CategoryManager();
    if (!detectorManager) detectorManager = new DetectorManager(categoryManager);
    const manager = detectorManager;
    const pending = Promise.resolve().then(async () => {
        await manager.initialize();
        return manager;
    });
    detectorInitializationPromise = pending;
    try {
        return await pending;
    } finally {
        if (detectorInitializationPromise === pending) detectorInitializationPromise = null;
    }
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

// One spinner frame. Text, background and text colour are always written
// together: Chrome drops a tab's badge colours when it navigates, so a frame
// that only updates the text falls back to the default colours mid-scan.
// Text colour is best-effort (Chrome 110+); only text/background failures,
// such as a closed tab, reject and stop the spinner.
function paintSpinnerFrame(tabId, text) {
    if (typeof chrome.action.setBadgeTextColor === 'function') {
        try {
            Promise.resolve(chrome.action.setBadgeTextColor({ color: BADGE.TEXT_COLORS.LOADING, tabId })).catch(() => {});
        } catch (_) {
            // Unsupported in this browser; the frame still paints.
        }
    }
    return Promise.all([
        chrome.action.setBadgeText({ text, tabId }),
        chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.LOADING, tabId })
    ]);
}

// A page load starts the spinner before its scan is registered (the page's
// data arrives a moment later). Without this grace the first tick found no
// scan, stopped, and left the first frame frozen until the scan restarted it.
const BADGE_SPINNER_START_GRACE_MS = 8000;

function startBadgeSpinner(tabId) {
    // Already turning for this tab (the page load started it and the scan
    // asks again): keep it going instead of jumping back to the first frame
    if (badgeSpinnerTimers.has(tabId)) return;
    const frames = BADGE.SPINNER_FRAMES;
    let i = 0;
    const startedAt = Date.now();
    let registered = false;
    setPausedIcon(tabId, false);
    paintSpinnerFrame(tabId, frames[0]).catch(() => {});
    const timer = setInterval(() => {
        // Self-terminate once the tab no longer has an active detection (after
        // the start grace, while the scan has not registered yet).
        const state = (typeof detectionStates !== 'undefined') ? detectionStates.get(tabId) : null;
        const active = (typeof activeDetections !== 'undefined') ? activeDetections.has(tabId) : false;
        const running = active || (state && !state.finalized && !state.failed);
        if (running) registered = true;
        const stillLoading = running || (!registered && Date.now() - startedAt < BADGE_SPINNER_START_GRACE_MS);
        if (badgeSpinnerTimers.get(tabId) !== timer) return;
        if (!stillLoading) { stopBadgeSpinner(tabId, timer); return; }
        i = (i + 1) % frames.length;
        paintSpinnerFrame(tabId, frames[i]).catch(() => stopBadgeSpinner(tabId, timer));
    }, 120); // 120ms/frame; runs only during active detection (worker kept alive by keepalive)
    badgeSpinnerTimers.set(tabId, timer);
}

function stopBadgeSpinner(tabId, expectedTimer = badgeSpinnerTimers.get(tabId)) {
    const timer = badgeSpinnerTimers.get(tabId);
    if (timer !== undefined && timer === expectedTimer) {
        clearInterval(timer);
        badgeSpinnerTimers.delete(tabId);
    }
}

async function setBadgeForDetections(tabId, url, detectionResults, ownsSession = null) {
    const expectedState = detectionStates.get(tabId);
    const expectedActive = activeDetections.get(tabId);
    const isCurrent = ownsSession || (() => detectionStates.get(tabId) === expectedState && activeDetections.get(tabId) === expectedActive);
    if (!isCurrent()) return false;
    // Never paint a detection count while the extension is disabled. A detection
    // that was in-flight when the user toggled off — or a cached-result restore —
    // can reach this after disable; without this guard it overwrites the OFF badge
    // and the toolbar icon shows a detection count for a disabled extension.
    const enabled = await isExtensionEnabled();
    if (!isCurrent()) return false;
    if (!enabled) {
        stopBadgeSpinner(tabId);
        await Promise.all([
            setPausedIcon(tabId, false),
            setBadgeTextColor(tabId, false, BADGE.COLORS.DISABLED),
            chrome.action.setBadgeText({ text: BADGE.TEXT.DISABLED, tabId }),
            chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.DISABLED, tabId })
        ]).catch(() => {});
        return;
    }
    try {
        const detectionCount = detectionResults.length;
        const isBlacklisted = url ? await Utils.isUrlBlacklisted(url) : false;
        if (!isCurrent()) return false;
        await setPausedIcon(tabId, isBlacklisted);
        if (!isCurrent()) return false;
        if (isBlacklisted) {
            stopBadgeSpinner(tabId);
            await Promise.all([
                setBadgeTextColor(tabId, true),
                chrome.action.setBadgeText({ text: BADGE.TEXT.BLACKLISTED, tabId }),
                chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.BLACKLISTED, tabId })
            ]);
        } else if (detectionCount > 0) {
            const badgeColors = await CategoryManager.getBadgeColors();
            if (!isCurrent()) return false;
            stopBadgeSpinner(tabId);
            const color = DetectionUtils.getBadgeColor(detectionResults, badgeColors);
            await Promise.all([
                setBadgeTextColor(tabId, false, color),
                chrome.action.setBadgeText({ text: detectionCount.toString(), tabId }),
                chrome.action.setBadgeBackgroundColor({ color, tabId })
            ]);
        } else {
            stopBadgeSpinner(tabId);
            await Promise.all([
                setBadgeTextColor(tabId),
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
        const hasInFlightDetection = !!activeDetection || (detectionState && !detectionState.finalized && !detectionState.failed);
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

    setupHeaderCapture();
    setupMessageListeners();
    setupTabListeners();

    Logger.background('Services initialized');
}
