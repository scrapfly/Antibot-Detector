/**
 * Background initialization and scheduled update checks.
 * Extracted from background.js to keep startup flow isolated.
 */

async function initialize(reason = 'startup', previousVersion = null) {
    // Reuse existing initialization promise if already in progress
    if (initializationInProgress && initializationPromise) {
        return await initializationPromise;
    }

    initializationInProgress = true;
    initializationPromise = (async () => {
        try {

        // Create CategoryManager and DetectorManager instances
        categoryManager = new CategoryManager();
        detectorManager = new DetectorManager(categoryManager);

        // Initialize the detector manager (loads from storage or JSON files)
        const initStartTime = Date.now();
        await detectorManager.initialize();
        const initDuration = Date.now() - initStartTime;

        let detectorCount = detectorManager.getDetectorCount();
        let hasDetectors = detectorCount > 0;

        // Retry detector loading with exponential backoff
        if (!hasDetectors) {
            const maxRetries = Constants.DETECTOR_LOAD_MAX_RETRIES;
            let retries = maxRetries;

            while (retries > 0 && !hasDetectors) {
                await new Promise(resolve => setTimeout(resolve, Constants.DETECTOR_LOAD_RETRY_DELAY));
                detectorCount = detectorManager.getDetectorCount();
                hasDetectors = detectorCount > 0;

                if (hasDetectors) {
                    break;
                }

                retries--;
            }
        }

        if (!hasDetectors) {
            Logger.error('BACKGROUND', 'CRITICAL: No detectors loaded - extension will not work. Remove and re-add the extension, then refresh all tabs.');
        }

        // Initialize keepalive manager
        workerKeepaliveManager = new WorkerKeepaliveManager();
        Logger.background('[WorkerKeepaliveManager] Initialized');

        // Set disabled badge if extension is disabled
        const isEnabled = await isExtensionEnabled();
        const tabs = await chrome.tabs.query({});

        if (!isEnabled) {
            for (const tab of tabs) {
                chrome.action.setBadgeText({ text: BADGE.TEXT.DISABLED, tabId: tab.id }).catch(() => {});
                setBadgeTextColor(tab.id, false, BADGE.COLORS.DISABLED);
                chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.DISABLED, tabId: tab.id }).catch(() => {});
            }
        } else {
            for (const tab of tabs) {
                chrome.action.setBadgeText({ text: BADGE.TEXT.EMPTY, tabId: tab.id }).catch(() => {});
            }
        }

        // NOTE: listeners (webRequest/onMessage/tabs) are now registered
        // synchronously at the end of background.js so MV3 cold-start events are
        // not dropped. initialize() only loads detectors / sets badges.
        initializationInProgress = false;
        return true;
        } catch (error) {
            Logger.error('BACKGROUND', 'Failed to initialize detector system:', error);

            initializationInProgress = false;
            return false;
        } finally {
            initializationPromise = null;
        }
    })();

    return await initializationPromise;
}

chrome.runtime.onInstalled.addListener(async (details) => {
    detectionStates.clear();

    if (details.reason === 'install' || details.reason === 'update') {
        await initialize(details.reason, details.previousVersion);
        // Storage is only seeded from the bundled detectors on first install:
        // bring this build's new and updated detectors to existing installs
        try {
            const merged = await UpdateManager.mergeBundledDetectors();
            if (merged.installed > 0 || merged.rerated > 0) await UpdateManager.notifyDetectorsChanged();
        } catch (error) {
            Logger.warn('BACKGROUND', '[init] Could not merge bundled detectors:', error);
        }
        // Check for detector updates after installation/update
        UpdateManager.scheduleCheck();
    }

});

// Register periodic update alarm listener once during init
UpdateManager.setupAlarmListener();

// History retention (auto-delete + 1,000-entry safety cap). Registers its
// storage/alarm listeners in the worker's first turn and prunes once on every
// service-worker start.
HistoryRetention.init();

// When a history write hits the 10 MB storage quota, the detection cache
// (rebuilt on the next visit) gives up space before any history entry does.
HistoryStore.setQuotaRelief(() => DetectionEngineManager.shedStoredDetections());

// In-page notices are drawn by the worker: load the chosen UI language (and
// follow changes) so their text matches the popup.
I18n.syncOverrideFromStorage();

// Detection cache retention: expired entries out, 500-entry cap. Prunes on
// every service-worker start and hourly through chrome.alarms.
DetectionCacheRetention.init();


chrome.runtime.onStartup.addListener(async () => {
    await initialize('startup');
    UpdateManager.scheduleCheck();
});

// Initialize when service worker starts/restarts from idle
(async () => {
    if (!detectorManager || !detectorManager.initialized) {
        await initialize('startup');
    }
})().catch((error) => {
    // Last-resort guard: a throw here would be an invisible unhandled SW
    // rejection that leaves detectors uninitialized. Logger may not be ready.
    try { Logger.error('BACKGROUND', '[init] Startup initialization failed:', error); } catch (_) {
        console.error('[Scrapfly] Fatal startup error:', error);
    }
});

