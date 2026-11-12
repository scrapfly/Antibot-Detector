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

        // Keepalive is available before the first event can begin a scan.
        if (!workerKeepaliveManager) workerKeepaliveManager = new WorkerKeepaliveManager();

        // Startup and event handlers share the same initialization promise.
        await ensureDetectorManagerInitialized();

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

        // Set disabled badge if extension is disabled
        const isEnabled = await isExtensionEnabled();
        const tabs = await chrome.tabs.query({});

        if (!isEnabled) {
            for (const tab of tabs) {
                chrome.action.setBadgeText({ text: BADGE.TEXT.DISABLED, tabId: tab.id }).catch(() => {});
                setBadgeTextColor(tab.id, false, BADGE.COLORS.DISABLED);
                chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.DISABLED, tabId: tab.id }).catch(() => {});
                if (typeof ToolbarTitle !== 'undefined') ToolbarTitle.apply(chrome, tab.id, 'off');
            }
        } else {
            for (const tab of tabs) {
                if (activeDetections.has(tab.id) || detectionStates.has(tab.id)) continue;
                // A worker that restarts has empty maps while the toolbar still shows each page's result: only what cannot be
                // right any more (the OFF badge, a scan spinner) is cleared, never a result
                const shown = await chrome.action.getBadgeText({ tabId: tab.id }).catch(() => '');
                if (shown === BADGE.TEXT.DISABLED || isLoadingBadgeText(shown)) {
                    chrome.action.setBadgeText({ text: BADGE.TEXT.EMPTY, tabId: tab.id }).catch(() => {});
                    // With the OFF badge goes "Detection is switched off" on hover (a result named there stays)
                    if (typeof ToolbarTitle !== 'undefined') ToolbarTitle.resetIf(chrome, tab.id, 'off');
                }
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
    for (const tabId of detectionStates.keys()) DetectionSessionStore.cancel(tabId, 'extension_updated');

    if (details.reason === 'install' || details.reason === 'update') {
        await initialize(details.reason, details.previousVersion);
        // Storage is only seeded from the bundled detectors on first install:
        // bring this build's new and updated detectors to existing installs
        let rulesMoved = false;
        try {
            const merged = await UpdateManager.mergeBundledDetectors();
            if (merged.installed > 0 || merged.rerated > 0 || merged.unmarked > 0) {
                await UpdateManager.notifyDetectorsChanged();
                rulesMoved = true;
            }
        } catch (error) {
            Logger.warn('BACKGROUND', '[init] Could not merge bundled detectors:', error);
        }
        // A build can change what a scan finds (the engine, the extractors, the hooks) without any detector changing, and a saved
        // result is served for days: the results the previous build saved are not served by this one, so each page is scanned again
        // with the new code the next time it is opened. A detector change above has done that already
        if (details.reason === 'update' && !rulesMoved) {
            try { await DetectionEngineManager.bumpRulesRevision(); } catch (error) {
                Logger.warn('BACKGROUND', '[init] Could not clear the saved results after the update:', error);
            }
        }
        // What the previous version was waiting for may be in this one (Statistics reads the list as stored)
        try { await UpdateManager.pruneIncompatibleUpdates(); } catch (error) {
            Logger.warn('BACKGROUND', '[init] Could not clean the waiting-for-extension list:', error);
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

// Automatic History backup to the Downloads folder (alarm + "Back up now"); its listeners register in the first turn
HistoryBackup.init();
// Background-tab scans (the watchlist and Bulk scan): load errors, and the tabs a stopped worker left open
BackgroundTabScan.init();
HistoryWatch.init();
// Protection cookie timeline (Advanced → Check Cookies): its chrome.cookies.onChanged listener registers in the first turn
CookieTimelineRecorder.init();
// A Bulk scan run the previous worker left "running" is marked stopped
BulkScanRunner.init();
// Failed webhook deliveries are retried by an alarm (modules/settings/webhook-runtime.js)
SettingsRuntime.initWebhookRetries();
// A page the person leaves out after a line of the webhook's record named it stops being named there (same module). Guarded like
// the other optional registrations: the worker tests that load this file stub SettingsRuntime with the calls they need
if (typeof SettingsRuntime.initWebhookLogScope === 'function') SettingsRuntime.initWebhookLogScope();

// When a history write hits the 10 MB storage quota, the detection cache
// (rebuilt on the next visit) gives up space before any history entry does.
HistoryStore.setQuotaRelief(() => DetectionEngineManager.shedStoredDetections());

// How much History may take: the size the person chose in Settings (6 MB without the unlimitedStorage permission). The settings
// are read strictly: Utils.getHistorySettings answers the defaults when they cannot be read, and the default 6 MB would cut the
// older entries of a person who chose 12 or 25. Unreadable settings throw here, and a write then cuts only to the largest size
// anyone can have chosen (HistoryStore.currentBudget), and says so once.
HistoryStore.setBudget(async () => {
    const settings = await StorageManager.readSettingsStrict();
    const history = settings.history && typeof settings.history === 'object' ? settings.history : {};
    return HistoryStore.budgetFor(history.historyMaxMB, HistoryStore.hasUnlimitedStorage());
});

// In-page notices are drawn by the worker: load the chosen UI language (and
// follow changes) so their text matches the popup.
I18n.syncOverrideFromStorage();

// Detection cache retention: expired entries out, 500-entry cap. Prunes on
// every service-worker start and hourly through chrome.alarms.
DetectionCacheRetention.init();


chrome.runtime.onStartup.addListener(async () => {
    try {
        await initialize('startup');
        UpdateManager.scheduleCheck();
    } catch (error) {
        Logger.warn('BACKGROUND', '[init] Start-up failed:', error);
    }
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

