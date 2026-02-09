/**
 * Detection user action methods (cache/blacklist/refresh).
 * Dependencies: `Detection` class must be loaded first.
 */
const DetectionActions = (typeof self !== 'undefined' && self.DetectionActions) ? self.DetectionActions : {};

DetectionActions.clearCache = async function() {
    const clearCacheBtn = document.querySelector('#clearCacheBtn');
    let originalText = '';

    try {
      // Show confirmation modal
      const confirmed = await NotificationHelper.confirm({
        title: 'Clear Cache',
        message: 'This will remove cached detection data for this domain and trigger a fresh analysis.',
        confirmText: 'Clear Cache',
        cancelText: 'Cancel',
        type: 'warning'
      });

      if (!confirmed) return;

      // Save original button text and update to "Clearing..."
      if (clearCacheBtn) {
        const textSpan = clearCacheBtn.querySelector('span');
        if (textSpan) {
          originalText = textSpan.textContent;
          textSpan.textContent = 'Clearing...';
        }
        clearCacheBtn.disabled = true;
      }

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        // Restore button on error
        if (clearCacheBtn && originalText) {
          const textSpan = clearCacheBtn.querySelector('span');
          if (textSpan) {
            textSpan.textContent = originalText;
          }
          clearCacheBtn.disabled = false;
        }
        return;
      }

      const url = tabs[0].url;

      // OPTION 1: Clean cache clear with automatic silent re-detection
      // Send message to background to clear cache (NO hold period)
      await chrome.runtime.sendMessage({
        type: 'DETECTION_CLEAR_CACHE',
        url: url,
        tabId: tabs[0].id
        // Removed: holdDetectionForMs (we'll trigger background detection instead)
      });

      // Update button to show success
      if (clearCacheBtn) {
        const textSpan = clearCacheBtn.querySelector('span');
        if (textSpan) {
          textSpan.textContent = '✓ Cleared!';
        }
      }

      NotificationHelper.success('Cache cleared');

      // Set badge to "CLR" with slate background to indicate cleared
      try {
        await chrome.action.setBadgeText({ text: BADGE.TEXT.CLEARED, tabId: tabs[0].id });
        await chrome.action.setBadgeBackgroundColor({
          color: BADGE.COLORS.CLEARED,
          tabId: tabs[0].id
        });
      } catch (error) {
        if (this.debugMode) Logger.warn('UI', 'Could not set badge:', error);
      }

      // Clear current results immediately
      this.currentResults = [];

      // Set flag to prevent auto-refresh from NEW_DETECTION_DATA
      this.justClearedCache = true;

      // Show "Nothing Detected" page immediately after cache clear
      this.showEmptyState();
    } catch (error) {
      if (this.debugMode) Logger.error('UI', 'Failed to clear cache:', error);
      NotificationHelper.error('Failed to clear cache');

      // Restore button on error
      if (clearCacheBtn && originalText) {
        const textSpan = clearCacheBtn.querySelector('span');
        if (textSpan) {
          textSpan.textContent = originalText;
        }
        clearCacheBtn.disabled = false;
      }
    }
};

DetectionActions.resetClearCacheButton = function() {
    const clearCacheBtn = document.querySelector('#clearCacheBtn');
    if (clearCacheBtn) {
      const textSpan = clearCacheBtn.querySelector('span');
      if (textSpan) {
        textSpan.textContent = 'Clear Cache';
      }
      clearCacheBtn.disabled = false;
    }
};

DetectionActions.addToBlacklist = async function() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        NotificationHelper.error('Unable to get current page');
        return;
      }

      const url = new URL(tabs[0].url);
      const domain = url.hostname;

      if (!domain) {
        NotificationHelper.error('Invalid domain');
        return;
      }

      // Show confirmation modal
      const confirmed = await NotificationHelper.confirm({
        title: 'Add to Blacklist',
        message: `Domain "${domain}" will be excluded from all future detections. You can remove it later in Settings.`,
        confirmText: 'Add to Blacklist',
        cancelText: 'Cancel',
        type: 'danger'
      });

      if (!confirmed) return;

      // Get current settings
      const result = await chrome.storage.local.get('scrapfly_settings');
      let settings = result.scrapfly_settings || {};

      // Parse settings if it's a string
      if (typeof settings === 'string') {
        try {
          settings = JSON.parse(settings);
        } catch (e) {
          if (this.debugMode) Logger.error('UI', 'Failed to parse settings JSON:', e);
          settings = {};
        }
      }

      // Handle nested settings structure (settings.settings)
      if (settings.settings && typeof settings.settings === 'object') {
        settings = settings.settings;
      }

      // Initialize detection object if needed
      if (!settings.detection) {
        settings.detection = {};
      }

      // Initialize blacklistedDomains array if needed
      if (!settings.detection.blacklistedDomains) {
        settings.detection.blacklistedDomains = [];
      }

      // Check if already blacklisted
      if (settings.detection.blacklistedDomains.includes(domain)) {
        NotificationHelper.info(`Domain "${domain}" is already blacklisted`);
        return;
      }

      // Add to blacklist
      settings.detection.blacklistedDomains.push(domain);

      // Save settings (maintaining the correct structure)
      await chrome.storage.local.set({ scrapfly_settings: settings });

      // Invalidate settings cache
      if (typeof Utils !== 'undefined' && typeof Utils.invalidateSettingsCache === 'function') {
        Utils.invalidateSettingsCache();
      }

      NotificationHelper.success(`Added "${domain}" to blacklist`);

      // Show blacklist warning state
      this.showBlacklistState(domain);
    } catch (error) {
      if (this.debugMode) Logger.error('UI', 'Failed to add to blacklist:', error);
      NotificationHelper.error('Failed to add to blacklist: ' + error.message);
    }
};

DetectionActions.showBlacklistState = function(domain) {
    this.setExtensionEnabled(true);
    this.hideLoadingState();

    const blacklistWarning = document.querySelector('#blacklistWarning');
    const blacklistDomain = document.querySelector('#blacklistDomain');
    const emptyState = document.querySelector('#emptyState');
    const detectionResults = document.querySelector('#detectionResults');
    const disabledState = document.querySelector('#disabledState');
    const interruptedState = document.querySelector('#interruptedState');
    const detectionPagination = document.querySelector('#detectionPagination');

    // Update domain display
    if (blacklistDomain) {
      blacklistDomain.textContent = domain;
    }

    // Show blacklist warning, hide everything else
    if (blacklistWarning) blacklistWarning.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (detectionResults) detectionResults.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';
    if (interruptedState) interruptedState.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';

    // Update badge to show BLK for blacklisted domain
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.action.setBadgeText({ text: BADGE.TEXT.BLACKLISTED, tabId: tabs[0].id }).catch((error) => {
          if (this.debugMode) Logger.ui('Failed to set blacklist badge:', error.message);
        });
        chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.BLACKLISTED, tabId: tabs[0].id }).catch((error) => {
          if (this.debugMode) Logger.ui('Failed to set badge color:', error.message);
        });
      }
    });
};

DetectionActions.removeFromBlacklist = async function(domain) {
    try {
      // Get current settings
      const result = await chrome.storage.local.get('scrapfly_settings');
      let settings = result.scrapfly_settings || {};

      // Parse settings if it's a string
      if (typeof settings === 'string') {
        try {
          settings = JSON.parse(settings);
        } catch (e) {
          if (this.debugMode) Logger.error('UI', 'Failed to parse settings JSON:', e);
          settings = {};
        }
      }

      // Handle nested settings structure
      if (settings.settings && typeof settings.settings === 'object') {
        settings = settings.settings;
      }

      // Remove from blacklist
      if (settings.detection?.blacklistedDomains) {
        settings.detection.blacklistedDomains = settings.detection.blacklistedDomains.filter(d => d !== domain);

        // Save updated settings
        await chrome.storage.local.set({ scrapfly_settings: settings });

        // Invalidate settings cache
        if (typeof Utils !== 'undefined' && typeof Utils.invalidateSettingsCache === 'function') {
          Utils.invalidateSettingsCache();
        }

        NotificationHelper.success(`Removed "${domain}" from blacklist`);

        // Hide blacklist warning UI before refreshing
        const blacklistWarning = document.querySelector('#blacklistWarning');
        if (blacklistWarning) blacklistWarning.style.display = 'none';

        // Get current tab and check for cached data first
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          // Show analyzing state
          this.showAnalyzingState();

          // Try to get cached data first (doesn't trigger fresh detection)
          chrome.runtime.sendMessage(
            { type: 'GET_DETECTION_DATA', tabId: tab.id },
            async (response) => {
              if (chrome.runtime.lastError) {
                if (this.debugMode) Logger.error('UI', 'Detection: Error getting cached data:', chrome.runtime.lastError);
                // Fall back to fresh detection
                this.refreshAnalysis();
                return;
              }

              if (response && response.data) {
                // We have cached data - use it immediately (badge will show count, not %)
                if (this.debugMode) Logger.ui('Detection: Using cached data after blacklist removal');
                this.detectionEngine.setDetectors(this.detectorManager.getAllDetectors());
                const detections = this.detectionEngine.detectOnPage(response.data);
                this.displayResults(detections);

                // Update badge to show detection count immediately (not percentage)
                if (detections.length > 0) {
                  chrome.action.setBadgeText({ text: detections.length.toString(), tabId: tab.id }).catch((error) => {
                    if (this.debugMode) Logger.ui('Failed to update badge after blacklist removal:', error.message);
                  });
                  // Set appropriate color based on count using BADGE constants
                  const color = getBadgeColorForCount(detections.length);
                  chrome.action.setBadgeBackgroundColor({ color: color, tabId: tab.id }).catch((error) => {
                    if (this.debugMode) Logger.ui('Failed to set badge color:', error.message);
                  });
                }
              } else {
                // No cached data available - request fresh detection
                if (this.debugMode) Logger.ui('Detection: No cached data, requesting fresh detection');
                this.refreshAnalysis();
              }
            }
          );
        }
      }
    } catch (error) {
      if (this.debugMode) Logger.error('UI', 'Failed to remove from blacklist:', error);
      NotificationHelper.error('Failed to remove from blacklist: ' + error.message);
    }
};

DetectionActions.refreshAnalysis = async function() {
    if (this.debugMode) Logger.ui('Refreshing detection analysis...');

    try {
      this.showAnalyzingState();

      // Get current tab information
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Request fresh detection from background script
      chrome.runtime.sendMessage(
        { type: 'REQUEST_DETECTION', tabId: tab.id },
        (response) => {
          if (chrome.runtime.lastError) {
            if (this.debugMode) Logger.error('UI', 'Detection: Error requesting fresh detection:', chrome.runtime.lastError);
            this.hideLoadingState();
            this.showEmptyState();
            return;
          }

          if (this.debugMode) Logger.ui('Detection: Fresh detection requested:', response);

          // Wait a moment for detection to complete, then request the data
          setTimeout(() => {
            chrome.runtime.sendMessage(
              { type: 'GET_DETECTION_DATA', tabId: tab.id },
              async (dataResponse) => {
                if (chrome.runtime.lastError) {
                  if (this.debugMode) Logger.error('UI', 'Detection: Error getting detection data:', chrome.runtime.lastError);
                  this.hideLoadingState();
                  this.showEmptyState();
                  return;
                }

                if (dataResponse && dataResponse.data) {
                  // Run detection using DetectionEngineManager on real data
                  this.detectionEngine.setDetectors(this.detectorManager.getAllDetectors());
                  const detections = this.detectionEngine.detectOnPage(dataResponse.data);
                  if (this.debugMode) Logger.ui(`Detection: Found ${detections.length} detections after refresh`);

                  // Display results
                  this.displayResults(detections);
                } else {
                  if (this.debugMode) Logger.ui('Detection: No data received after refresh');
                  this.hideLoadingState();
                  this.showEmptyState();
                }
              }
            );
          }, 2000); // Wait 2 seconds for detection to complete
        }
      );

    } catch (error) {
      if (this.debugMode) Logger.error('UI', 'Failed to refresh analysis:', error);
      this.hideLoadingState();
      this.showEmptyState();
    }
};

if (typeof self !== 'undefined') {
    self.DetectionActions = DetectionActions;
}
