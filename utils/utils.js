/**
 * Utils - Settings, caching, extension lifecycle, and page data collection
 *
 * Focused utility class for Chrome extension operations.
 * Pure formatting → FormatUtils, URL operations → UrlUtils, Detection analysis → DetectionUtils
 */

class Utils {
  /**
   * Apply debug mode flag globally for Logger.
   * @param {object} settings
   */
  static applyDebugMode(settings) {
    const flags = {
      debugMode: !!settings?.debugMode,
      // Verbose logs only apply while Debug mode is on
      debugVerbose: !!settings?.debugMode && !!settings?.debugVerbose,
      logCollectorEnabled: !!settings?.logCollectorEnabled
    };
    for (const root of [
      typeof globalThis !== 'undefined' ? globalThis : null,
      typeof window !== 'undefined' ? window : null,
      typeof self !== 'undefined' ? self : null
    ]) {
      if (root) Object.assign(root, flags);
    }
  }

  // ============================================================================
  // Detection Request Throttling
  // ============================================================================

  /**
   * Check if we should skip detection due to recent request
   * @param {string|number} tabId - Request identity (tab plus document for page scans)
   * @param {number} threshold - Minimum milliseconds between requests (default 2000ms)
   * @param {Map} recentRequests - Map to track recent requests (passed from caller)
   * @returns {boolean} true if should skip, false otherwise
   */
  static shouldSkipDetection(tabId, threshold = Constants.DETECTION_SKIP_THRESHOLD, recentRequests) {
    const lastRequest = recentRequests.get(tabId);
    const now = Date.now();

    if (lastRequest && (now - lastRequest) < threshold) {
      return true;
    }

    recentRequests.set(tabId, now);
    setTimeout(() => {
      if (recentRequests.get(tabId) === now) {
        recentRequests.delete(tabId);
      }
    }, 10000);

    return false;
  }

  // ============================================================================
  // Content Script URL Validation
  // ============================================================================

  /**
   * Check if a URL is valid for content script injection
   * @param {string} url - URL to check
   * @returns {boolean} true if valid, false if restricted
   */
  static isValidContentScriptUrl(url) {
    if (!url) {
      return false;
    }

    const restrictedPrefixes = [
      'chrome://',
      'chrome-extension://',
      'edge://',
      'about:',
      'chrome-devtools://',
      'devtools://',
      'view-source:',
      'data:',
      'blob:',
      'file://'
    ];

    return !restrictedPrefixes.some(prefix => url.startsWith(prefix));
  }

  /**
   * Check if a tab is valid for content script operations
   * @param {object} tab - Chrome tab object
   * @returns {boolean} true if valid, false if invalid
   */
  static isValidContentScriptTab(tab) {
    return tab && tab.url && this.isValidContentScriptUrl(tab.url);
  }

  // ============================================================================
  // Extension Context Lifecycle
  // ============================================================================

  /**
   * Check if extension context is still valid
   * @returns {boolean} true if context is valid, false otherwise
   */
  static isExtensionContextValid() {
    try {
      if (chrome && chrome.runtime && chrome.runtime.id) {
        const url = chrome.runtime.getURL('');
        if (url && url.startsWith('chrome-extension://')) {
          return true;
        }
      }
      return false;
    } catch (error) {
      if (!(error instanceof TypeError && /Cannot read|undefined|invalid/.test(error.message))) {
        Logger.error('UTIL', 'Extension context check error:', error.message);
      }
      return false;
    }
  }

  /**
   * Clean up orphaned content script when extension context is invalidated
   * @param {object} cleanup - Cleanup configuration
   * @returns {boolean} true if cleanup was performed, false if already cleaned up
   */
  static cleanupOrphanedScript(cleanup) {
    if (cleanup.hasCleanedUp) return false;
    cleanup.hasCleanedUp = true;

    if (cleanup.contextCheckInterval) {
      clearInterval(cleanup.contextCheckInterval);
      cleanup.contextCheckInterval = null;
    }

    if (cleanup.notifyPageLoad) {
      document.removeEventListener('DOMContentLoaded', cleanup.notifyPageLoad);
      document.removeEventListener('visibilitychange', cleanup.notifyPageLoad);
      window.removeEventListener('focus', cleanup.notifyPageLoad);
      window.removeEventListener('beforeunload', cleanup.notifyPageLoad);
      window.removeEventListener('hashchange', cleanup.notifyPageLoad);
      window.removeEventListener('popstate', cleanup.notifyPageLoad);
    }

    if (cleanup.hookMessageHandler) {
      window.removeEventListener('message', cleanup.hookMessageHandler);
    }

    if (cleanup.detectionEngine) {
      cleanup.detectionEngine.clearDetectionData();
      cleanup.detectionEngine = null;
    }

    if (typeof window !== 'undefined') {
      window.__scrapflyContentScriptInitialized = false;
      window.__scrapflyHooksInstalled = false;
    }

    return true;
  }

  // ============================================================================
  // Page Data Collection & Messaging
  // ============================================================================

  /**
   * Notify background about page load (cache check first)
   * @param {Object} context - Context object with detectionEngine, isExtensionContextValid, cleanupOrphanedScript, triggerSource
   */
  static async notifyPageLoad(context) {
    const { detectionEngine, isExtensionContextValid, cleanupOrphanedScript, triggerSource = 'page_load' } = context;

    if (!isExtensionContextValid()) {
      cleanupOrphanedScript();
      return;
    }

    const debounceTime = triggerSource === 'visibility_change' ? 10000 :
                        triggerSource === 'url_change' ? 1000 :
                        2000;

    if (!detectionEngine.shouldRunDetection(debounceTime)) {
      return;
    }

    try {
      chrome.runtime.sendMessage({
        type: WorkerMessages.PAGE_LOAD_NOTIFICATION,
        url: window.location.href,
        timestamp: Date.now(),
        triggerSource: triggerSource
      }, (response) => {
        if (chrome.runtime.lastError) {
          if (chrome.runtime.lastError.message &&
            chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            Logger.debug('UTIL', 'Extension context invalidated (extension reloaded)');
            cleanupOrphanedScript();
          }
        }
      });
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        cleanupOrphanedScript();
      }
    }
  }

  /**
   * The collected page as plain data (its lazy getters read), what a scan sends to the worker and what
   * Rules → Test on this page asks for.
   * @param {Object} pageData - DetectionEngineManager.collectPageData()
   */
  static toPlainPageData(pageData) {
    return {
      url: pageData.url,
      title: pageData.title,
      favicon: pageData.favicon,
      cookies: pageData.cookies,
      content: pageData.content,
      dom: pageData.dom,
      headers: pageData.headers,
      jsHooks: pageData.jsHooks,
      payload: pageData.payload,
      payloads: pageData.payloads,
      networkUrls: pageData.networkUrls,
      externalContent: pageData.externalContent,
      responseCookies: pageData.responseCookies,
      requestHeaders: pageData.requestHeaders,
      pageHTML: pageData.pageHTML,
      collectMs: pageData.collectMs
    };
  }

  /**
   * Collect page data and send to background (called when cache miss)
   * @param {Object} context - Context object with detectionEngine, isExtensionContextValid, cleanupOrphanedScript
   */
  static async collectAndSendData(context) {
    const { detectionEngine, isExtensionContextValid, cleanupOrphanedScript } = context;

    if (!isExtensionContextValid()) {
      cleanupOrphanedScript();
      return;
    }

    try {
      const pageData = await detectionEngine.collectPageData();

      const plainPageData = Utils.toPlainPageData(pageData);

      if (!isExtensionContextValid()) {
        cleanupOrphanedScript();
        return;
      }

      try {
        chrome.runtime.sendMessage({
          type: WorkerMessages.DETECTION_DATA,
          data: plainPageData,
          tabId: null,
          timestamp: Date.now()
        }, (response) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || '';

            if (errorMsg.includes('Extension context invalidated')) {
              cleanupOrphanedScript();
            }
            else if (errorMsg.includes('Could not establish connection') ||
                     errorMsg.includes('Receiving end does not exist')) {
              // Silent - expected during reload
            }
            else {
              Logger.warn('UTIL', 'Scrapfly Content Script: Error sending detection data:', chrome.runtime.lastError);
            }
          }
        });
      } catch (sendError) {
        const errorMsg = sendError.message || '';

        if (errorMsg.includes('Extension context invalidated')) {
          cleanupOrphanedScript();
        }
        else if (errorMsg.includes('Could not establish connection') ||
                 errorMsg.includes('Receiving end does not exist')) {
          // Silent - expected during reload
        }
        else {
          Logger.warn('UTIL', 'Scrapfly Content Script: Failed to send message:', sendError);
        }
      }
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        cleanupOrphanedScript();
      } else {
        Logger.error('UTIL', 'Scrapfly Content Script: Error during detection:', error);
      }
    }
  }

  // ============================================================================
  // Storage Helper Functions
  // ============================================================================

  /**
   * Get settings from storage with proper format handling
   * @returns {Promise<object>} Settings object (never null, returns {} on error)
   */
  static async getSettings() {
    try {
      if (typeof StorageManager !== 'undefined' && typeof StorageManager.getSettings === 'function') {
        const settings = await StorageManager.getSettings();
        Utils.applyDebugMode(settings);
        return settings;
      }

      const result = await chrome.storage.local.get(['scrapfly_settings']);
      const parsed = typeof result.scrapfly_settings === 'string'
        ? JSON.parse(result.scrapfly_settings)
        : result.scrapfly_settings;
      const settings = parsed?.settings && typeof parsed.settings === 'object'
        ? parsed.settings
        : (parsed || {});
      Utils.applyDebugMode(settings);
      return settings;
    } catch (error) {
      Logger.error('UTIL', 'Failed to load settings:', error);
    }

    Utils.applyDebugMode({ debugMode: false });
    return {};
  }

  /**
   * Get history-specific settings with defaults
   * @returns {Promise<object>} History settings with defaults applied
   */
  static async getHistorySettings() {
    const settings = await this.getSettings();
    const historySettings = settings.history || {};
    const duplicatePrevention = settings.duplicatePrevention || {};

    const rawDuplicateScope = duplicatePrevention.duplicateScope ?? settings.duplicateScope ?? 'full_url';
    const normalizedDuplicateScope = (() => {
      const normalizedScope = String(rawDuplicateScope || '').toLowerCase();

      if (normalizedScope === 'url' || normalizedScope === 'full') {
        return 'full_url';
      }

      if (normalizedScope === 'domain' || normalizedScope === 'path' || normalizedScope === 'full_url') {
        return normalizedScope;
      }

      return 'full_url';
    })();

    const parsedDuplicateDuration = parseInt(
      duplicatePrevention.duplicateDuration ?? settings.duplicateDuration ?? 1,
      10
    );

    return {
      historyLimit: historySettings.historyLimit ?? settings.historyLimit ?? 0,
      exportFormat: historySettings.exportFormat || settings.exportFormat || 'json',
      includeTimestamps: historySettings.includeTimestamps ?? settings.includeTimestamps ?? true,
      historyBypassCache: historySettings.historyBypassCache ?? settings.historyBypassCache ?? false,
      preventDuplicates: duplicatePrevention.preventDuplicates ?? settings.preventDuplicates ?? false,
      duplicateScope: normalizedDuplicateScope,
      duplicateDuration: Number.isFinite(parsedDuplicateDuration) && parsedDuplicateDuration > 0
        ? parsedDuplicateDuration
        : 1,
      duplicateUnit: duplicatePrevention.duplicateUnit || settings.duplicateUnit || 'hours',
      // Update the earlier entry instead of skipping the new scan
      duplicateAction: duplicatePrevention.duplicateAction === 'update' ? 'update' : 'skip',
      // What History records (defaults keep the behaviour of earlier versions; incognito pages are not recorded)
      historyEnabled: historySettings.historyEnabled !== false,
      historySkipIncognito: historySettings.historySkipIncognito !== false,
      historyMinConfidence: Math.min(Math.max(parseInt(historySettings.historyMinConfidence, 10) || 0, 0), 100),
      historySkipFingerprintOnly: historySettings.historySkipFingerprintOnly === true,
      historyExcludedDomains: Array.isArray(historySettings.historyExcludedDomains) ? historySettings.historyExcludedDomains.filter(d => typeof d === 'string') : [],
      historyChangeAlerts: ['pinned', 'all'].includes(historySettings.historyChangeAlerts) ? historySettings.historyChangeAlerts : 'off',
      historyBackup: ['daily', 'weekly', 'monthly'].includes(historySettings.historyBackup) ? historySettings.historyBackup : 'off',
      historyClearOnClose: historySettings.historyClearOnClose === true,
      // Pages that pin themselves (HistoryPolicy.shouldAutoPin reads and clamps these)
      historyAutoPinHard: historySettings.historyAutoPinHard === true,
      historyAutoPinVendors: Array.isArray(historySettings.historyAutoPinVendors) ? historySettings.historyAutoPinVendors.filter(name => typeof name === 'string') : [],
      historyAutoPinMinConfidence: historySettings.historyAutoPinMinConfidence,
      // The size History may take (HistoryStore.budgetFor reads it; larger than 6 MB needs the unlimitedStorage permission)
      historyMaxMB: historySettings.historyMaxMB,
      // The watchlist (HistoryPolicy.watchModeOf reads it: off, daily or weekly)
      historyWatch: historySettings.historyWatch
    };
  }

  /**
   * Is this page left unscanned because of Settings → Detection → Sites? (The name is from when the only mode was a
   * list of skipped sites; the other mode is a list of the only sites to scan: see ScanScope.)
   * @param {string} url - URL to check
   * @returns {Promise<boolean>} True if the page is skipped
   */
  static async isUrlBlacklisted(url) {
    if (!url) return false;

    try {
      const settings = await this.getSettings();
      const legacy = settings.blacklistedDomains ? { blacklistedDomains: settings.blacklistedDomains } : {};
      return ScanScope.isExcluded(url, { ...legacy, ...settings.detection });
    } catch (error) {
      Logger.error('UTIL', 'Error checking blacklist:', error);
      return false;
    }
  }

  /**
   * Get cache scope from settings
   * @returns {Promise<string>} Cache scope: 'domain', 'path', or 'full'
   */
  static async getCacheScope() {
    try {
      const settings = await this.getSettings();
      const scope = settings.detection?.cacheScope || settings.cacheScope || 'domain';
      if (!['domain', 'path', 'full'].includes(scope)) {
        Logger.warn('UTIL', `[getCacheScope] Invalid cache scope: ${scope}, defaulting to 'domain'`);
        return 'domain';
      }
      return scope;
    } catch (error) {
      Logger.error('UTIL', '[getCacheScope] Error getting cache scope:', error);
      return 'domain';
    }
  }

}

if (typeof window !== 'undefined') {
  window.Utils = Utils;
} else if (typeof self !== 'undefined') {
  self.Utils = Utils;
}
