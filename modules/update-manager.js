/**
 * Update Manager
 * Handles auto-updating detection rules from GitHub repository.
 *
 * Usage:
 *   const updateManager = new UpdateManager();
 *   await updateManager.checkForUpdates();
 */

class UpdateManager {
  constructor() {
    if (UpdateManager.instance) {
      return UpdateManager.instance;
    }

    this.initialized = false;
    this.baseUrl = 'https://raw.githubusercontent.com/scrapfly/Antibot-Detector/main/detectors';
    UpdateManager.instance = this;
  }

  /**
   * Initialize the update manager
   */
  async initialize() {
    if (this.initialized) return;

    // Load settings
    await this.loadSettings();
    this.initialized = true;

    Logger.detector('UpdateManager initialized');
  }

  /**
   * Load update settings from storage
   */
  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['scrapfly_settings']);
      this.settings = result.scrapfly_settings?.updates || {
        autoUpdate: true,
        checkIntervalHours: 12,
        lastCheckTimestamp: 0
      };
    } catch (error) {
      Logger.error('DETECTOR', 'Failed to load update settings', error);
      this.settings = {
        autoUpdate: true,
        checkIntervalHours: 12,
        lastCheckTimestamp: 0
      };
    }
  }

  /**
   * Save update settings to storage
   */
  async saveSettings() {
    try {
      const result = await chrome.storage.local.get(['scrapfly_settings']);
      const settings = result.scrapfly_settings || {};
      settings.updates = this.settings;
      await chrome.storage.local.set({ scrapfly_settings: settings });
    } catch (error) {
      Logger.error('DETECTOR', 'Failed to save update settings', error);
    }
  }

  /**
   * Check if enough time has passed for an auto-update check
   * @returns {boolean}
   */
  shouldCheckForUpdates() {
    if (!this.settings.autoUpdate) return false;

    const now = Date.now();
    const lastCheck = this.settings.lastCheckTimestamp || 0;
    const intervalMs = (this.settings.checkIntervalHours || 12) * 60 * 60 * 1000;

    return (now - lastCheck) >= intervalMs;
  }

  /**
   * Fetch the remote index.json from GitHub
   * @returns {Promise<Object|null>}
   */
  async fetchRemoteIndex() {
    try {
      const url = `${this.baseUrl}/index.json`;
      Logger.detector(`Fetching remote index from ${url}`);

      // Add timeout to prevent hanging forever
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      Logger.detector(`Remote index response status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      Logger.detector('Remote index fetched successfully', { categories: Object.keys(data) });
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        Logger.error('DETECTOR', 'Fetch timed out after 15 seconds');
      } else {
        Logger.error('DETECTOR', 'Failed to fetch remote index', error);
      }
      return null;
    }
  }

  /**
   * Fetch a specific detector JSON from GitHub
   * @param {string} category - Category folder name (antibot, captcha, fingerprint)
   * @param {string} detectorId - Detector ID
   * @returns {Promise<Object|null>}
   */
  async fetchRemoteDetector(category, detectorId) {
    try {
      const url = `${this.baseUrl}/${category}/${detectorId}.json`;
      Logger.detector(`Fetching remote detector from ${url}`);

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        Logger.error('DETECTOR', `Fetch timed out for ${category}/${detectorId}`);
      } else {
        Logger.error('DETECTOR', `Failed to fetch detector ${category}/${detectorId}`, error);
      }
      return null;
    }
  }

  /**
   * Get local detectors from storage
   * @returns {Promise<Object>}
   */
  async getLocalDetectors() {
    try {
      const result = await chrome.storage.local.get(['scrapfly_detectors']);
      let detectors = result.scrapfly_detectors || {};

      // Handle case where detectors is stored as JSON string
      if (typeof detectors === 'string') {
        try {
          detectors = JSON.parse(detectors);
        } catch (parseError) {
          Logger.error('DETECTOR', 'Failed to parse detectors JSON string', parseError);
          return {};
        }
      }

      // Ensure we have the right structure (detectors might be nested under 'detectors' key)
      if (detectors.detectors && typeof detectors.detectors === 'object') {
        detectors = detectors.detectors;
      }

      return detectors;
    } catch (error) {
      Logger.error('DETECTOR', 'Failed to get local detectors', error);
      return {};
    }
  }

  /**
   * Compare versions using semver-like comparison
   * @param {string} local - Local version string
   * @param {string} remote - Remote version string
   * @returns {boolean} True if remote is newer
   */
  isNewerVersion(local, remote) {
    if (!local || !remote) return true;

    const localParts = local.split('.').map(Number);
    const remoteParts = remote.split('.').map(Number);

    for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
      const localPart = localParts[i] || 0;
      const remotePart = remoteParts[i] || 0;

      if (remotePart > localPart) return true;
      if (remotePart < localPart) return false;
    }

    return false; // Equal versions
  }

  /**
   * Check for updates and apply them silently
   * @param {boolean} force - Force check regardless of interval
   * @returns {Promise<Object>} Update result with counts
   */
  async checkForUpdates(force = false) {
    if (!force && !this.shouldCheckForUpdates()) {
      Logger.detector('Skipping update check - not enough time has passed');
      return { checked: false, reason: 'interval_not_reached' };
    }

    Logger.detector('Checking for detector updates...');

    const result = {
      checked: true,
      newDetectors: 0,
      updatedDetectors: 0,
      errors: 0,
      detectorNames: []
    };

    try {
      // Fetch remote index
      const remoteIndex = await this.fetchRemoteIndex();
      if (!remoteIndex) {
        result.checked = false;
        result.reason = 'fetch_failed';
        return result;
      }

      // Get local detectors
      const localDetectors = await this.getLocalDetectors();

      // Process each category
      const categories = ['antibot', 'captcha', 'fingerprint'];

      for (const category of categories) {
        const categoryData = remoteIndex[category];
        if (!categoryData || !categoryData.detectors) continue;

        for (const detectorId of categoryData.detectors) {
          try {
            // Fetch remote detector
            const remoteDetector = await this.fetchRemoteDetector(category, detectorId);
            if (!remoteDetector) {
              result.errors++;
              continue;
            }

            // Check if local detector exists
            const localDetector = localDetectors[category]?.[detectorId];

            if (!localDetector) {
              // New detector - add it
              if (!localDetectors[category]) {
                localDetectors[category] = {};
              }
              localDetectors[category][detectorId] = {
                ...remoteDetector,
                enabled: true // New detectors enabled by default
              };
              result.newDetectors++;
              result.detectorNames.push(remoteDetector.name || detectorId);
              Logger.detector(`Added new detector: ${detectorId}`);
            } else if (this.isNewerVersion(localDetector.version, remoteDetector.version)) {
              // Update existing detector - preserve user's enabled state
              const userEnabled = localDetector.enabled;
              localDetectors[category][detectorId] = {
                ...remoteDetector,
                enabled: userEnabled // Preserve user's choice
              };
              result.updatedDetectors++;
              result.detectorNames.push(remoteDetector.name || detectorId);
              Logger.detector(`Updated detector: ${detectorId} (${localDetector.version} -> ${remoteDetector.version})`);
            }
          } catch (error) {
            Logger.error('DETECTOR', `Error processing detector ${detectorId}`, error);
            result.errors++;
          }
        }
      }

      // Save updated detectors to storage (matching DetectorManager format)
      if (result.newDetectors > 0 || result.updatedDetectors > 0) {
        // Count total detectors
        let totalCount = 0;
        for (const category of Object.values(localDetectors)) {
          totalCount += Object.keys(category).length;
        }

        // Save with proper wrapper structure
        await chrome.storage.local.set({
          scrapfly_detectors: {
            timestamp: new Date().toISOString(),
            detectors: localDetectors,
            totalCount: totalCount
          }
        });
        Logger.detector(`Saved ${result.newDetectors} new and ${result.updatedDetectors} updated detectors`);
      }

      // Update last check timestamp
      this.settings.lastCheckTimestamp = Date.now();
      await this.saveSettings();

      Logger.detector(`Update check complete: ${result.newDetectors} new, ${result.updatedDetectors} updated, ${result.errors} errors`);

    } catch (error) {
      Logger.error('DETECTOR', 'Update check failed', error);
      result.checked = false;
      result.reason = 'error';
      result.error = error.message;
    }

    return result;
  }

  /**
   * Get the time since the last update check
   * @returns {string} Human-readable time since last check
   */
  getTimeSinceLastCheck() {
    const lastCheck = this.settings?.lastCheckTimestamp || 0;
    if (lastCheck === 0) return 'Never';

    const now = Date.now();
    const diffMs = now - lastCheck;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    return 'Just now';
  }

  /**
   * Set the auto-update enabled state
   * @param {boolean} enabled
   */
  async setAutoUpdate(enabled) {
    this.settings.autoUpdate = enabled;
    await this.saveSettings();
  }

  /**
   * Set the update check interval
   * @param {number} hours
   */
  async setCheckInterval(hours) {
    this.settings.checkIntervalHours = hours;
    await this.saveSettings();
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UpdateManager;
} else if (typeof window !== 'undefined') {
  window.UpdateManager = UpdateManager;
}
