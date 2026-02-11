/**
 * Background initialization and scheduled update checks.
 * Extracted from background.js to keep startup flow isolated.
 */

async function initialize(reason = 'startup', previousVersion = null) {
    // RACE CONDITION FIX: Prevent concurrent initializations
    // During extension updates, both onInstalled and IIFE can fire simultaneously
    if (initializationInProgress && initializationPromise) {
        const result = await initializationPromise;
        return result;
    }

    // Set guard flag and create promise for this initialization
    initializationInProgress = true;

    // Create the initialization promise
    initializationPromise = (async () => {
        try {

        // Create CategoryManager and DetectorManager instances
        categoryManager = new CategoryManager();
        detectorManager = new DetectorManager(categoryManager);

        // Initialize the detector manager (loads from storage or JSON files)
        const initStartTime = Date.now();
        await detectorManager.initialize();
        const initDuration = Date.now() - initStartTime;

        // Storage health check - verify detectors were loaded correctly
        let detectorCount = detectorManager.getDetectorCount();
        let hasDetectors = detectorCount > 0;

        // BUGFIX: Add retry logic if detectors haven't loaded yet (timing issue)
        // This handles cases where service worker starts before JSON files are fully loaded
        if (!hasDetectors) {
            const maxRetries = 10; // 10 retries * 500ms = 5 seconds max wait
            let retries = maxRetries;

            while (retries > 0 && !hasDetectors) {
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
                detectorCount = detectorManager.getDetectorCount();
                hasDetectors = detectorCount > 0;

                if (hasDetectors) {
                    break;
                }

                retries--;
            }
        }

        if (!hasDetectors) {
            Logger.error('BACKGROUND', 'CRITICAL: Detector system initialized but no detectors were loaded!');
            Logger.error('BACKGROUND', 'This will cause content scripts to fail. Possible causes:');
            Logger.error('BACKGROUND', '   1. Storage is empty or corrupted');
            Logger.error('BACKGROUND', '   2. JSON files are missing or have errors');
            Logger.error('BACKGROUND', '   3. File paths changed but extension not reloaded');
            Logger.error('BACKGROUND', 'RECOMMENDATION: Remove and re-add the extension, then refresh all tabs');
        }

        // Initialize "never fail" managers
        workerKeepaliveManager = new WorkerKeepaliveManager();
        Logger.background('[WorkerKeepaliveManager] Initialized');

        // Check if extension is enabled/disabled and set badges accordingly
        const isEnabled = await isExtensionEnabled();
        const tabs = await chrome.tabs.query({});

        if (!isEnabled) {
            // Extension is disabled - set OFF badge with gray color for all tabs
            for (const tab of tabs) {
                chrome.action.setBadgeText({ text: BADGE.TEXT.DISABLED, tabId: tab.id }).catch(() => {});
                chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.DISABLED, tabId: tab.id }).catch(() => {});
            }
        } else {
            // Extension is enabled - clear any leftover badges
            for (const tab of tabs) {
                chrome.action.setBadgeText({ text: BADGE.TEXT.EMPTY, tabId: tab.id }).catch(() => {});
            }
        }

        // Initialize all services (listeners, interceptors, etc.)
        initializeServices();

        // Clear guard flag on success
        initializationInProgress = false;
        return true;
        } catch (error) {
            Logger.error('BACKGROUND', 'Background: Failed to initialize detector system:', error);
            Logger.error('BACKGROUND', 'Background: Error stack:', error.stack);

            // Clear guard flag on error
            initializationInProgress = false;
            return false;
        } finally {
            // Clear promise reference when done (success or failure)
            initializationPromise = null;
        }
    })();

    // Await and return the result
    return await initializationPromise;
}

// Listen for extension installation or update
chrome.runtime.onInstalled.addListener(async (details) => {
    // Clear all detection states on extension reload/update to prevent stale data
    detectionStates.clear();

    if (details.reason === 'install' || details.reason === 'update') {
        await initialize(details.reason, details.previousVersion);
        // Check for detector updates after installation/update
        scheduleUpdateCheck();
    }

});

// Schedule update check after initialization completes
// This runs on install, update, and startup
async function scheduleUpdateCheck() {
    try {
        const settings = await Utils.getSettings();
        if (settings.updates?.autoUpdate) {
            Logger.background('Auto-update enabled, checking for detector updates...');
            // Delay slightly to let the extension fully initialize first
            setTimeout(async () => {
                try {
                    await UpdateManager.checkForUpdates(false); // Non-forced check respects interval
                    Logger.background('Update check completed');
                } catch (error) {
                    Logger.error('BACKGROUND', 'Failed to check for updates:', error);
                }
            }, 5000); // 5 second delay after startup

            // Setup periodic alarm for update checks
            // This ensures updates are checked even if the browser stays open
            setupUpdateAlarm(settings.updates.checkIntervalHours || 12);
        } else {
            Logger.background('Auto-update disabled, skipping update check');
            // Clear any existing alarm if auto-update is disabled
            chrome.alarms.clear('scrapfly-update-check');
            // Clear any stale pending updates
            await UpdateManager.clearPendingUpdates();
        }
    } catch (error) {
        Logger.error('BACKGROUND', 'Failed to schedule update check:', error);
    }
}

// Setup periodic alarm for update checks
function setupUpdateAlarm(intervalHours) {
    const periodInMinutes = intervalHours * 60;
    chrome.alarms.create('scrapfly-update-check', {
        periodInMinutes: periodInMinutes
    });
    Logger.background(`Update alarm set: every ${intervalHours} hours`);
}

// Handle alarm events
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'scrapfly-update-check') {
        Logger.background('Periodic update check triggered by alarm');
        try {
            const settings = await Utils.getSettings();
            if (settings.updates?.autoUpdate) {
                await UpdateManager.checkForUpdates(false);
                Logger.background('Periodic update check completed');
            }
        } catch (error) {
            Logger.error('BACKGROUND', 'Periodic update check failed:', error);
        }
    }
});


// Initialize on browser startup (when browser starts with extension already installed)
chrome.runtime.onStartup.addListener(async () => {
    await initialize('startup');
    // Check for detector updates on browser startup
    scheduleUpdateCheck();
});

// Also initialize immediately when service worker starts/restarts
// This handles the case where the service worker is awakened from idle
(async () => {
    // Check if we need to initialize (service worker may have been restarted)
    if (!detectorManager || !detectorManager.initialized) {
        await initialize('startup');
    }
})();

