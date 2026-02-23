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

async function setBadgeForDetections(tabId, url, detectionResults) {
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
 * Uses DetectionEngineManager's manual request path so tabs that were loaded
 * while extension was disabled can be recovered without opening popup.
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
        const hasInFlightDetection = activeDetections.has(tabId) || (detectionState && !detectionState.finalized);
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
                recentDetectionRequests
            }
        );

        if (immediateResponse?.status === 'error' || immediateResponse?.status === 'skipped') {
            return false;
        }

        Logger.background(`[AutoDetect] Requested detection for tab ${tabId} (source: ${source})`);
        return true;
    } catch (error) {
        Logger.background(`[AutoDetect] Failed to request detection for tab ${tabId}: ${error.message}`);
        return false;
    }
}

function initializeServices() {
    Logger.background('Scrapfly Background: Initializing services...');

    setupHeaderCapture();
    setupMessageListeners();
    setupTabListeners();

    Logger.background('Scrapfly Background: Services initialization complete');
}
