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
    const enabled = !!settings?.debugMode;
    const logCollectorEnabled = !!settings?.logCollectorEnabled;
    if (typeof globalThis !== 'undefined') {
      globalThis.debugMode = enabled;
      globalThis.logCollectorEnabled = logCollectorEnabled;
    }
    if (typeof window !== 'undefined') {
      window.debugMode = enabled;
      window.logCollectorEnabled = logCollectorEnabled;
    }
    if (typeof self !== 'undefined') {
      self.debugMode = enabled;
      self.logCollectorEnabled = logCollectorEnabled;
    }
  }

  /**
   * Invalidate settings cache (call when settings are updated)
   */
  static invalidateSettingsCache() {
    // No-op: legacy cache removed, but callers still invoke this on settings change
  }

  // ============================================================================
  // Detection Request Throttling
  // ============================================================================

  /**
   * Check if we should skip detection due to recent request
   * @param {number} tabId - Tab ID
   * @param {number} threshold - Minimum milliseconds between requests (default 2000ms)
   * @param {Map} recentRequests - Map to track recent requests (passed from caller)
   * @returns {boolean} true if should skip, false otherwise
   */
  static shouldSkipDetection(tabId, threshold = 2000, recentRequests) {
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
      if (!error.message.includes('Cannot read properties of undefined')) {
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

  /**
   * Perform context validation check
   * @param {Object} state - State object with hasCleanedUp, contextCheckInterval, contextCheckFailures
   * @param {Function} cleanupOrphanedScript - Cleanup function to call on failure
   */
  static performContextCheck(state, cleanupOrphanedScript) {
    if (state.hasCleanedUp) {
      if (state.contextCheckInterval) {
        clearInterval(state.contextCheckInterval);
        state.contextCheckInterval = null;
      }
      return;
    }

    if (!Utils.isExtensionContextValid()) {
      state.contextCheckFailures = (state.contextCheckFailures || 0) + 1;

      if (state.contextCheckFailures >= 2) {
        Logger.warn('UTIL', 'Scrapfly Content Script: Extension context lost after multiple checks');
        cleanupOrphanedScript();

        if (state.contextCheckInterval) {
          clearInterval(state.contextCheckInterval);
          state.contextCheckInterval = null;
        }
      }
    } else {
      state.contextCheckFailures = 0;
    }
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
        type: 'PAGE_LOAD_NOTIFICATION',
        url: window.location.href,
        timestamp: Date.now(),
        triggerSource: triggerSource
      }, (response) => {
        if (chrome.runtime.lastError) {
          if (chrome.runtime.lastError.message &&
            chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            Logger.warn('UTIL', 'Scrapfly Content Script: Extension was reloaded');
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

      const plainPageData = {
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
        pageHTML: pageData.pageHTML
      };

      if (!isExtensionContextValid()) {
        cleanupOrphanedScript();
        return;
      }

      try {
        chrome.runtime.sendMessage({
          type: 'DETECTION_DATA',
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
          } else {
            try {
              const cacheKey = `scrapfly_cache_${window.location.hostname}`;
              const cacheData = {
                timestamp: Date.now(),
                detectionCount: response?.detectionCount || 0,
                url: window.location.href
              };
              sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
              Logger.cache('Saved sessionStorage after detection send (for next visit)');
            } catch (e) {
              // sessionStorage not available - continue silently
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
      const result = await chrome.storage.local.get(['scrapfly_settings']);
      if (result.scrapfly_settings) {
        const parsed = typeof result.scrapfly_settings === 'string'
          ? JSON.parse(result.scrapfly_settings)
          : result.scrapfly_settings;

        if (parsed && parsed.settings) {
          Utils.applyDebugMode(parsed.settings);
          return parsed.settings;
        }

        Utils.applyDebugMode(parsed || {});
        return parsed || {};
      }
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
    return {
      historyLimit: settings.historyLimit ?? 0,
      autoClearDays: settings.autoClearDays ?? 30,
      exportFormat: settings.exportFormat || 'json',
      includeTimestamps: settings.includeTimestamps !== false,
      historyBypassCache: settings.historyBypassCache ?? false,
      preventDuplicates: settings.preventDuplicates ?? false,
      duplicateScope: settings.duplicateScope || 'full_url',
      duplicateDuration: settings.duplicateDuration ?? 1,
      duplicateUnit: settings.duplicateUnit || 'hours'
    };
  }

  /**
   * Check if a URL is blacklisted
   * @param {string} url - URL to check
   * @returns {Promise<boolean>} True if URL's domain is blacklisted
   */
  static async isUrlBlacklisted(url) {
    if (!url) return false;

    try {
      const settings = await this.getSettings();
      const blacklist = settings.detection?.blacklistedDomains || settings.blacklistedDomains || [];
      const hostname = UrlUtils.getHostnameFromUrl(url);
      return blacklist.includes(hostname);
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

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
} else if (typeof window !== 'undefined') {
  window.Utils = Utils;
} else if (typeof self !== 'undefined') {
  self.Utils = Utils;
}
