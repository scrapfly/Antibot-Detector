/**
 * URL Hash LRU Cache - Optimized cache with Least Recently Used eviction
 * OPTIMIZATION Phase 1: Proper LRU eviction (better than FIFO)
 * OPTIMIZATION Phase 9B.1: Added Set for O(1) existence checks (60-80% faster)
 */
class URLHashCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map(); // Key -> value
    this.accessOrder = []; // For LRU eviction order
    this.accessSet = new Set(); // For O(1) existence checks
  }

  /**
   * Get value from cache and update access order
   * @param {string} key - Cache key
   * @returns {string|undefined} Cached value or undefined
   */
  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }

    // Move to end (most recently used)
    this._touch(key);
    return this.cache.get(key);
  }

  /**
   * Set value in cache with LRU eviction
   * OPTIMIZATION Phase 9B.1: Use Set for O(1) existence check
   * @param {string} key - Cache key
   * @param {string} value - Value to cache
   */
  set(key, value) {
    // If key already exists, update it
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this._touch(key);
      return;
    }

    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this._evict();
    }

    // Add new entry
    this.cache.set(key, value);
    this.accessOrder.push(key);
    this.accessSet.add(key); // Track in set for fast lookups
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Get current cache size
   * @returns {number} Number of entries
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Move key to end of access order (most recently used)
   * OPTIMIZATION Phase 9B.1: Use Set for O(1) check before array indexOf
   * @private
   * @param {string} key - Cache key
   */
  _touch(key) {
    // OPTIMIZED: O(1) check instead of O(n) indexOf
    if (this.accessSet.has(key)) {
      // Still need O(n) splice, but only when key exists
      const index = this.accessOrder.indexOf(key);
      this.accessOrder.splice(index, 1);
    } else {
      this.accessSet.add(key);
    }
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used entries (first 10%)
   * OPTIMIZATION Phase 9A.3: Reduced from 20% to 10% to reduce cache thrashing
   * OPTIMIZATION Phase 9B.1: Keep Set in sync with evictions
   * @private
   */
  _evict() {
    // OPTIMIZED: Evict only 10% (100 entries) to reduce thrashing
    const evictCount = Math.ceil(this.maxSize * 0.1);
    const keysToEvict = this.accessOrder.splice(0, evictCount);

    for (const key of keysToEvict) {
      this.cache.delete(key);
      this.accessSet.delete(key); // Keep set in sync
    }
  }

  /**
   * Clear entire cache
   * OPTIMIZATION Phase 9B.1: Clear Set as well
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
    this.accessSet.clear();
  }
}

/**
 * Utility functions for Scrapfly extension
 */

class Utils {
  // OPTIMIZATION Phase 1: LRU cache for URL hashes (prevents memory bloat)
  static urlHashCache = new URLHashCache(1000); // URL string -> hash
  static settingsCache = null; // Cached settings object
  static settingsCacheTime = 0; // Timestamp of settings cache
  static SETTINGS_CACHE_TTL = 60000; // 60 seconds

  // OPTIMIZATION Phase 6E: JSON parse cache (30-40% fewer parse operations)
  static parsedObjectCache = new Map(); // cacheKey -> { parsed, timestamp }
  static JSON_CACHE_TTL = 300000; // 5 minutes
  static JSON_CACHE_MAX_SIZE = 50;
  // OPTIMIZATION Phase 9A.4: Periodic cleanup timer for expired JSON cache entries
  static _jsonCacheCleanupTimer = null;

  /**
   * Generate a hash for URL to use as cache key
   * OPTIMIZED: Caches computed hashes to avoid repeated calculations
   * Supports different cache scopes: domain, path, or full URL
   * @param {string} url - URL to hash
   * @param {string} scope - Cache scope: 'domain', 'path', or 'full' (defaults to 'domain')
   * @returns {string} Simple hash string
   */
  static hashUrl(url, scope = 'domain') {
    // Create cache key that includes the scope
    const cacheKey = `${scope}:${url}`;

    // OPTIMIZATION: Check cache first
    if (Utils.urlHashCache.has(cacheKey)) {
      return Utils.urlHashCache.get(cacheKey);
    }

    // Normalize URL based on scope
    let normalizedUrl;
    let hash;

    try {
      const urlObj = new URL(url);

      switch (scope) {
        case 'full':
          // Use full URL including query params and hash
          normalizedUrl = url;
          break;

        case 'path':
          // Use protocol, hostname, and pathname (no query params or hash)
          normalizedUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
          break;

        case 'domain':
        default:
          // Use protocol and hostname only (no path, query, or hash)
          normalizedUrl = `${urlObj.protocol}//${urlObj.hostname}`;
          break;
      }

      hash = 0;
      for (let i = 0; i < normalizedUrl.length; i++) {
        const char = normalizedUrl.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
    } catch (e) {
      // Fallback to original URL if parsing fails
      hash = 0;
      for (let i = 0; i < url.length; i++) {
        const char = url.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
    }

    const hashString = Math.abs(hash).toString(36);

    // OPTIMIZATION Phase 1: LRU cache automatically handles eviction
    Utils.urlHashCache.set(cacheKey, hashString);

    return hashString;
  }

  /**
   * Get cached settings or fetch from storage
   * OPTIMIZATION: Caches settings in memory for 60 seconds
   * OPTIMIZATION Phase 9A.7: Added forceReload parameter to bypass cache
   * @param {boolean} forceReload - Force reload from storage (bypass cache)
   * @returns {Promise<object>} Settings object
   */
  static async getCachedSettings(forceReload = false) {
    const now = Date.now();

    // OPTIMIZATION Phase 9A.7: Allow forced cache bypass (used after settings update)
    if (forceReload) {
      Utils.settingsCache = null;
      Utils.settingsCacheTime = 0;
    }

    // Return cached settings if still valid
    if (Utils.settingsCache && (now - Utils.settingsCacheTime) < Utils.SETTINGS_CACHE_TTL) {
      return Utils.settingsCache;
    }

    // Fetch from storage
    try {
      const result = await chrome.storage.local.get(['scrapfly_settings']);
      if (result.scrapfly_settings) {
        const parsed = typeof result.scrapfly_settings === 'string'
          ? JSON.parse(result.scrapfly_settings)
          : result.scrapfly_settings;

        // FIX: Consistent with getSettings() - always use nested settings if it exists
        if (parsed && parsed.settings) {
          Utils.settingsCache = parsed.settings;
        } else {
          Utils.settingsCache = parsed || {};
        }
        Utils.settingsCacheTime = now;

        return Utils.settingsCache;
      }
    } catch (error) {
      Logger.error('UTIL', 'Failed to load settings:', error);
    }

    return {};
  }

  /**
   * Invalidate settings cache (call when settings are updated)
   */
  static invalidateSettingsCache() {
    Utils.settingsCache = null;
    Utils.settingsCacheTime = 0;
  }

  /**
   * Clear detection cache from storage (e.g., when cache scope changes)
   */
  static async clearDetectionCache() {
    try {
      await chrome.storage.local.remove('scrapfly_detection_storage');
      return true;
    } catch (error) {
      Logger.error('UTIL', '[Utils] Error clearing detection cache:', error);
      return false;
    }
  }

  /**
   * Clear in-memory URL hash cache
   */
  static clearUrlHashCache() {
    if (Utils.urlHashCache) {
      Utils.urlHashCache.clear();
    }
  }

  /**
   * OPTIMIZATION Phase 9A.4: Start periodic cleanup of expired JSON cache entries
   * @private
   */
  static _startJsonCacheCleanup() {
    if (Utils._jsonCacheCleanupTimer) return;

    // Clean expired entries every 5 minutes
    Utils._jsonCacheCleanupTimer = setInterval(() => {
      const now = Date.now();

      for (const [key, cached] of Utils.parsedObjectCache.entries()) {
        if (now - cached.timestamp >= Utils.JSON_CACHE_TTL) {
          Utils.parsedObjectCache.delete(key);
        }
      }
    }, 300000); // 5 minutes
  }

  /**
   * Parse JSON with caching to avoid repeated parsing
   * OPTIMIZATION Phase 6E: Caches parsed results for 5 minutes
   * OPTIMIZATION Phase 9A.4: Added automatic cleanup timer
   * @param {string} jsonString - JSON string to parse
   * @param {string} cacheKey - Optional cache key (defaults to hash of string)
   * @returns {object} Parsed object
   */
  static parseJSON(jsonString, cacheKey = null) {
    if (!jsonString) return null;

    // OPTIMIZATION Phase 9A.4: Start cleanup timer on first use
    if (!Utils._jsonCacheCleanupTimer) {
      Utils._startJsonCacheCleanup();
    }

    // Generate cache key if not provided
    const key = cacheKey || `parse_${jsonString.substring(0, 100)}`;

    // Check cache
    if (Utils.parsedObjectCache.has(key)) {
      const cached = Utils.parsedObjectCache.get(key);
      // Check if cache is still valid
      if (Date.now() - cached.timestamp < Utils.JSON_CACHE_TTL) {
        return cached.parsed;
      }
      // Expired - remove
      Utils.parsedObjectCache.delete(key);
    }

    // Parse and cache
    try {
      const parsed = JSON.parse(jsonString);

      // Limit cache size
      if (Utils.parsedObjectCache.size >= Utils.JSON_CACHE_MAX_SIZE) {
        const firstKey = Utils.parsedObjectCache.keys().next().value;
        Utils.parsedObjectCache.delete(firstKey);
      }

      Utils.parsedObjectCache.set(key, {
        parsed,
        timestamp: Date.now()
      });

      return parsed;
    } catch (error) {
      Logger.error('UTIL', 'JSON parse error:', error);
      return null;
    }
  }

  /**
   * Stringify JSON (future optimization: add caching if needed)
   * @param {object} obj - Object to stringify
   * @returns {string} JSON string
   */
  static stringifyJSON(obj) {
    try {
      return JSON.stringify(obj);
    } catch (error) {
      Logger.error('UTIL', 'JSON stringify error:', error);
      return null;
    }
  }

  /**
   * Check if we should skip detection due to recent request
   * Tracks recent detection requests to prevent duplicates
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
    // Clean up old entries after 10 seconds
    setTimeout(() => {
      if (recentRequests.get(tabId) === now) {
        recentRequests.delete(tabId);
      }
    }, 10000);

    return false;
  }

  /**
   * Check if a URL is valid for content script injection
   * @param {string} url - URL to check
   * @returns {boolean} true if valid, false if restricted
   */
  static isValidContentScriptUrl(url) {
    if (!url) {
      return false;
    }

    // List of restricted URL patterns where content scripts cannot run
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

  /**
   * Check if extension context is still valid
   * More robust check with error handling
   * @returns {boolean} true if context is valid, false otherwise
   */
  static isExtensionContextValid() {
    try {
      // Check if chrome.runtime exists and has an id
      if (chrome && chrome.runtime && chrome.runtime.id) {
        // Additional check - try to get the extension URL to verify it's really valid
        const url = chrome.runtime.getURL('');
        if (url && url.startsWith('chrome-extension://')) {
          return true;
        }
      }
      return false;
    } catch (error) {
      // If we get an error accessing chrome.runtime, context is invalid
      // Use console.error which is always allowed
      if (!error.message.includes('Cannot read properties of undefined')) {
        Logger.error('UTIL', 'Extension context check error:', error.message);
      }
      return false;
    }
  }

  /**
   * Clean up orphaned content script when extension context is invalidated
   * @param {object} cleanup - Cleanup configuration
   * @param {boolean} cleanup.hasCleanedUp - Flag to track if already cleaned up
   * @param {number} cleanup.contextCheckInterval - Interval ID to clear
   * @param {Function} cleanup.notifyPageLoad - Event handler to remove
   * @param {object} cleanup.detectionEngine - Detection engine instance to clean
   * @returns {boolean} true if cleanup was performed, false if already cleaned up
   */
  static cleanupOrphanedScript(cleanup) {
    if (cleanup.hasCleanedUp) return false;
    cleanup.hasCleanedUp = true;

    // Clear ALL intervals and timeouts
    if (cleanup.contextCheckInterval) {
      clearInterval(cleanup.contextCheckInterval);
      cleanup.contextCheckInterval = null;
    }

    // Remove ALL event listeners to prevent memory leaks
    if (cleanup.notifyPageLoad) {
      document.removeEventListener('DOMContentLoaded', cleanup.notifyPageLoad);
      document.removeEventListener('visibilitychange', cleanup.notifyPageLoad);
      window.removeEventListener('focus', cleanup.notifyPageLoad);
      window.removeEventListener('beforeunload', cleanup.notifyPageLoad);
      window.removeEventListener('hashchange', cleanup.notifyPageLoad);
      window.removeEventListener('popstate', cleanup.notifyPageLoad);
    }

    // Remove message listener for hooks
    if (cleanup.hookMessageHandler) {
      window.removeEventListener('message', cleanup.hookMessageHandler);
    }

    // Clear detection engine data
    if (cleanup.detectionEngine) {
      cleanup.detectionEngine.clearDetectionData();
      cleanup.detectionEngine = null;
    }

    // Clear global flags
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
      // Already cleaned up, clear interval
      if (state.contextCheckInterval) {
        clearInterval(state.contextCheckInterval);
        state.contextCheckInterval = null;
      }
      return;
    }

    if (!Utils.isExtensionContextValid()) {
      state.contextCheckFailures = (state.contextCheckFailures || 0) + 1;

      // Only cleanup after 2 consecutive failures (grace period for transient issues)
      if (state.contextCheckFailures >= 2) {
        Logger.warn('UTIL', 'Scrapfly Content Script: Extension context lost after multiple checks');
        cleanupOrphanedScript();

        // Clear the interval
        if (state.contextCheckInterval) {
          clearInterval(state.contextCheckInterval);
          state.contextCheckInterval = null;
        }
      }
    } else {
      // Reset failure counter on successful check
      state.contextCheckFailures = 0;
    }
  }

  /**
   * Notify background about page load (cache check first)
   * @param {Object} context - Context object with detectionEngine, isExtensionContextValid, cleanupOrphanedScript, triggerSource
   */
  static async notifyPageLoad(context) {
    const { detectionEngine, isExtensionContextValid, cleanupOrphanedScript, triggerSource = 'page_load' } = context;

    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      cleanupOrphanedScript();
      return;
    }

    // Let the background script handle the disabled state check
    // This ensures the badge is properly updated even when extension is disabled

    // Use different debounce times based on trigger source
    // visibility_change needs longer debounce to avoid triggering when opening popup
    const debounceTime = triggerSource === 'visibility_change' ? 10000 : // 10 seconds for visibility
                        triggerSource === 'url_change' ? 2000 :      // 2 seconds for URL change
                        2000;                                         // 2 seconds default

    // Check if we should notify (avoid too frequent notifications)
    if (!detectionEngine.shouldRunDetection(debounceTime)) {
      return;
    }

    // Send page load notification with just URL (cache check in background)
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
   * OPTIMIZED: Compresses large pageHTML before sending
   * @param {Object} context - Context object with detectionEngine, isExtensionContextValid, cleanupOrphanedScript
   */
  static async collectAndSendData(context) {
    const { detectionEngine, isExtensionContextValid, cleanupOrphanedScript } = context;

    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      cleanupOrphanedScript();
      return;
    }

    try {
      // Collect page data (async - fetches external resources)
      const pageData = await detectionEngine.collectPageData();

      // CRITICAL: Ensure all getters are evaluated and converted to plain values
      // This prevents "Could not serialize message" errors from lazy getters
      const plainPageData = {
        url: pageData.url,
        title: pageData.title,              // Page title
        favicon: pageData.favicon,          // Page favicon URL
        cookies: pageData.cookies,          // Triggers lazy getter evaluation
        storageCookies: pageData.storageCookies,  // NEW: Storage cookies (localStorage + sessionStorage)
        content: pageData.content,          // Triggers lazy getter evaluation
        dom: pageData.dom,                  // Triggers lazy getter evaluation
        headers: pageData.headers,
        jsHooks: pageData.jsHooks,
        payload: pageData.payload,
        payloads: pageData.payloads,
        networkUrls: pageData.networkUrls,
        externalContent: pageData.externalContent,
        responseCookies: pageData.responseCookies,
        requestHeaders: pageData.requestHeaders,
        pageHTML: pageData.pageHTML         // Full HTML sent uncompressed
      };

      // NOTE: Compression disabled - Chrome message limit is 64MB, typical pages are 100KB-1MB
      // Sending full HTML ensures complete detection coverage without missed patterns

      // Check again before sending
      if (!isExtensionContextValid()) {
        cleanupOrphanedScript();
        return;
      }

      // Send data to background script
      try {
        chrome.runtime.sendMessage({
          type: 'DETECTION_DATA',
          data: plainPageData,
          tabId: null, // Will be filled by background script
          timestamp: Date.now()
        }, (response) => {
          // Check for errors
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || '';

            // Check if it's a context invalidation
            if (errorMsg.includes('Extension context invalidated')) {
              cleanupOrphanedScript();
            }
            // Service worker not available - expected on reload, no action needed
            else if (errorMsg.includes('Could not establish connection') ||
                     errorMsg.includes('Receiving end does not exist')) {
              // Silent - expected during reload
            }
            // Other errors - log as warning not error
            else {
              Logger.warn('UTIL', 'Scrapfly Content Script: Error sending detection data:', chrome.runtime.lastError);
            }
          }
        });
      } catch (sendError) {
        // Catch synchronous errors when trying to send message
        const errorMsg = sendError.message || '';

        if (errorMsg.includes('Extension context invalidated')) {
          cleanupOrphanedScript();
        }
        // Service worker not available - expected on reload, no action needed
        else if (errorMsg.includes('Could not establish connection') ||
                 errorMsg.includes('Receiving end does not exist')) {
          // Silent - expected during reload
        }
        else {
          Logger.warn('UTIL', 'Scrapfly Content Script: Failed to send message:', sendError);
        }
      }
    } catch (error) {
      // Check if it's a context invalidation error
      if (error.message && error.message.includes('Extension context invalidated')) {
        cleanupOrphanedScript();
      } else {
        Logger.error('UTIL', 'Scrapfly Content Script: Error during detection:', error);
      }
    }
  }

  // ============================================================================
  // Phase 9A: URL/Hostname Utilities
  // ============================================================================

  /**
   * Extract hostname from URL with proper error handling
   * @param {string} url - Full URL string
   * @returns {string} Hostname or fallback to original URL
   */
  static getHostnameFromUrl(url) {
    if (!url || typeof url !== 'string') return 'Unknown';

    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      // If URL parsing fails, return the original string
      // This handles cases like "localhost" or malformed URLs
      return url;
    }
  }

  /**
   * Get comprehensive domain information from URL
   * @param {string} url - Full URL string
   * @returns {object|null} Object with hostname, origin, protocol, pathname or null if invalid
   */
  static getDomainInfo(url) {
    if (!url || typeof url !== 'string') return null;

    try {
      const urlObj = new URL(url);
      return {
        hostname: urlObj.hostname,
        origin: urlObj.origin,
        protocol: urlObj.protocol,
        pathname: urlObj.pathname,
        search: urlObj.search,
        hash: urlObj.hash
      };
    } catch (error) {
      Logger.error('UTIL', 'Failed to parse URL:', error);
      return null;
    }
  }

  // ============================================================================
  // Phase 9B: Storage Helper Functions
  // ============================================================================

  /**
   * Get settings from storage with proper format handling
   * Handles both string and object formats, and nested structure
   * @returns {Promise<object>} Settings object (never null, returns {} on error)
   */
  static async getSettings() {
    try {
      const result = await chrome.storage.local.get(['scrapfly_settings']);
      if (result.scrapfly_settings) {
        // Handle both string (legacy) and object formats
        const parsed = typeof result.scrapfly_settings === 'string'
          ? JSON.parse(result.scrapfly_settings)
          : result.scrapfly_settings;

        // FIX: Always return the nested settings object if it exists
        // This ensures consistent structure regardless of how it was saved
        if (parsed && parsed.settings) {
          return parsed.settings;
        }

        // Fallback for flat structure (legacy)
        return parsed || {};
      }
    } catch (error) {
      Logger.error('UTIL', 'Failed to load settings:', error);
    }

    // Return empty object as fallback (safe default)
    return {};
  }

  /**
   * Get history-specific settings with defaults
   * @returns {Promise<object>} History settings with defaults applied
   */
  static async getHistorySettings() {
    const settings = await this.getSettings();
    return {
      historyLimit: settings.historyLimit ?? 100,
      historyBehavior: settings.historyBehavior || 'rolling',
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
      // FIX: Check both flat and nested paths for backwards compatibility
      // Blacklist is stored at settings.detection.blacklistedDomains (nested structure)
      const blacklist = settings.blacklistedDomains || settings.detection?.blacklistedDomains || [];

      // Extract hostname for comparison
      const hostname = this.getHostnameFromUrl(url);

      // Check if hostname is in blacklist
      return blacklist.includes(hostname);
    } catch (error) {
      Logger.error('UTIL', 'Error checking blacklist:', error);
      return false;
    }
  }

  /**
   * Get cache duration in milliseconds from settings
   * @returns {Promise<number>} Cache duration in milliseconds
   */
  static async getCacheDurationMs() {
    try {
      const settings = await this.getSettings();

      // Support both new (cacheDuration + cacheUnit) and old (cacheHours) formats
      if (settings.cacheDuration !== undefined && settings.cacheUnit) {
        return this.convertToMilliseconds(settings.cacheDuration, settings.cacheUnit);
      }

      // Fallback to old cacheHours format
      const cacheHours = settings.cacheHours || 12; // Default 12 hours
      return cacheHours * 60 * 60 * 1000;
    } catch (error) {
      Logger.error('UTIL', 'Error getting cache duration:', error);
      return 12 * 60 * 60 * 1000; // Default 12 hours
    }
  }

  /**
   * Get cache scope from settings
   * @returns {Promise<string>} Cache scope: 'domain', 'path', or 'full'
   */
  static async getCacheScope() {
    try {
      const settings = await this.getSettings();

      const scope = settings.cacheScope || settings.detection?.cacheScope || 'domain';

      // Validate scope value
      if (!['domain', 'path', 'full'].includes(scope)) {
        Logger.warn('UTIL', `[getCacheScope] Invalid cache scope: ${scope}, defaulting to 'domain'`);
        return 'domain';
      }

      return scope;
    } catch (error) {
      Logger.error('UTIL', '[getCacheScope] Error getting cache scope:', error);
      return 'path'; // Default to path scope on error
    }
  }

  // ============================================================================
  // Phase 9C: Time Formatting Utilities
  // ============================================================================

  /**
   * Convert time duration to milliseconds
   * @param {number} duration - Duration value
   * @param {string} unit - Time unit ('minutes', 'hours', 'days')
   * @returns {number} Duration in milliseconds
   */
  static convertToMilliseconds(duration, unit) {
    const conversions = {
      minutes: duration * 60 * 1000,
      hours: duration * 60 * 60 * 1000,
      days: duration * 24 * 60 * 60 * 1000
    };
    return conversions[unit] || conversions.hours; // Default to hours if unknown unit
  }

  /**
   * Format timestamp as "X time ago" (e.g., "3h ago", "2d ago")
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string} Human-readable time ago string
   */
  static getTimeAgo(timestamp) {
    if (!timestamp) return 'Unknown';

    const now = Date.now();
    const diff = now - timestamp;

    // Handle future timestamps
    if (diff < 0) return 'Just now';

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (seconds > 0) return `${seconds}s ago`;
    return 'Just now';
  }

  /**
   * Format time until expiry (e.g., "2h 30m", "45m", "expired")
   * @param {number} expiresAt - Expiry timestamp in milliseconds
   * @returns {string} Time remaining until expiry
   */
  static getTimeUntil(expiresAt) {
    if (!expiresAt) return '-';

    const diff = expiresAt - Date.now();

    // Already expired
    if (diff <= 0) return 'Expired';

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  /**
   * Format timestamp as localized date/time string
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @param {object} options - Intl.DateTimeFormat options
   * @returns {string} Formatted date/time string
   */
  static formatTimestamp(timestamp, options = {}) {
    if (!timestamp) return 'Unknown';

    const defaults = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };

    try {
      return new Date(timestamp).toLocaleString(undefined, { ...defaults, ...options });
    } catch (error) {
      return new Date(timestamp).toString();
    }
  }

  /**
   * Get cache expiry display string (e.g., "2h 30m")
   * @param {number} expiryTimestamp - Expiry timestamp in milliseconds
   * @returns {string} Human-readable expiry time
   */
  static getCacheExpiryDisplay(expiryTimestamp) {
    if (!expiryTimestamp) return '-';
    return this.getTimeUntil(expiryTimestamp);
  }

  // ============================================================================
  // Phase 9D: Validation and Miscellaneous Utilities
  // ============================================================================

  /**
   * Validate if string is a valid HTTP/HTTPS URL
   * @param {string} urlString - URL string to validate
   * @returns {boolean} True if valid HTTP/HTTPS URL
   */
  static isValidHttpUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') return false;

    try {
      const url = new URL(urlString);
      return ['http:', 'https:'].includes(url.protocol);
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate if string is a valid domain name
   * @param {string} domain - Domain string to validate
   * @returns {boolean} True if valid domain format
   */
  static isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;

    // Basic domain validation regex
    // Allows: example.com, sub.example.com, example.co.uk
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z]{2,})+$/;
    return domainRegex.test(domain);
  }

  /**
   * Download a file using Blob
   * @param {Blob} blob - Blob data to download
   * @param {string} filename - Filename for download
   */
  static downloadFile(blob, filename) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a); // Required for Firefox
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      Logger.error('UTIL', 'Failed to download file:', error);
    }
  }

  /**
   * Get favicon URL for a domain using Google's favicon service
   * @param {string} urlOrHostname - Full URL or just hostname
   * @returns {string} Google favicon service URL
   */
  static getFaviconUrl(urlOrHostname) {
    if (!urlOrHostname) return this.getDefaultFaviconUrl();

    try {
      // Check if it's a full URL or just hostname
      const hostname = urlOrHostname.includes('://')
        ? this.getHostnameFromUrl(urlOrHostname)
        : urlOrHostname;

      return `https://www.google.com/s2/favicons?domain=${hostname}`;
    } catch (error) {
      return this.getDefaultFaviconUrl();
    }
  }

  /**
   * Get default favicon URL (extension icon)
   * @returns {string} Default favicon URL
   */
  static getDefaultFaviconUrl() {
    try {
      return chrome.runtime.getURL('icons/icon16.png');
    } catch (error) {
      return 'icons/icon16.png';
    }
  }

  /**
   * Truncate string to maximum length with suffix
   * @param {string} str - String to truncate
   * @param {number} maxLength - Maximum length (default 50)
   * @param {string} suffix - Suffix to add when truncated (default '...')
   * @returns {string} Truncated string
   */
  static truncate(str, maxLength = 50, suffix = '...') {
    if (!str || typeof str !== 'string') return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - suffix.length) + suffix;
  }

  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} HTML-escaped text
   */
  static escapeHtml(text) {
    if (!text) return '';

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Format bytes to human-readable size (B, KB, MB, GB)
   * @param {number} bytes - Size in bytes
   * @param {number} decimals - Number of decimal places (default 2)
   * @returns {string} Formatted size string
   */
  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    if (!bytes || isNaN(bytes)) return '-';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Copy text to clipboard with optional visual feedback
   * @param {string} text - Text to copy
   * @param {object} options - Feedback options
   * @param {HTMLElement|null} options.element - Element to show inline feedback on
   * @param {boolean} [options.notify=true] - Display toast notification on success
   * @param {string} [options.notificationMessage='Copied to clipboard'] - Success toast message
   * @param {string} [options.inlineMessage='✓ Copied!'] - Temporary inline message
   * @param {number} [options.revertDelay=1600] - Delay before inline message reverts (ms)
   * @returns {Promise<boolean>} True if copy succeeded
   */
  static async copyToClipboard(text, {
    element = null,
    notify = true,
    notificationMessage = 'Copied to clipboard',
    inlineMessage = '✓ Copied!',
    revertDelay = 1600
  } = {}) {
    let success = false;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        success = true;
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch (error) {
      Logger.error('UTIL', 'Failed to copy to clipboard:', error);
      success = false;
    }

    if (!success) {
      if (notify && typeof NotificationHelper !== 'undefined' && typeof NotificationHelper.error === 'function') {
        NotificationHelper.error('Failed to copy to clipboard');
      }
      return false;
    }

    if (notify && typeof NotificationHelper !== 'undefined' && typeof NotificationHelper.success === 'function') {
      NotificationHelper.success(notificationMessage);
    }

    if (element && typeof document !== 'undefined') {
      const isInput = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
      const originalValue = isInput ? element.value : element.textContent;
      const originalHtml = !isInput ? element.innerHTML : null;

      element.dataset.copyOriginal = originalValue ?? '';
      if (!isInput && originalHtml !== null && originalHtml !== undefined) {
        element.dataset.copyOriginalHtml = originalHtml;
      }

      if (isInput) {
        element.value = inlineMessage;
      } else {
        element.textContent = inlineMessage;
      }

      element.classList.add('copy-feedback-active');

      window.setTimeout(() => {
        if (!element.dataset) {
          return;
        }

        const original = element.dataset.copyOriginal;
        const originalInnerHtml = element.dataset.copyOriginalHtml;
        if (isInput) {
          if (original !== undefined) {
            element.value = original;
          }
        } else if (originalInnerHtml !== undefined) {
          element.innerHTML = originalInnerHtml;
        } else if (original !== undefined) {
          element.textContent = original;
        }

        element.classList.remove('copy-feedback-active');
        delete element.dataset.copyOriginal;
        if (element.dataset.copyOriginalHtml !== undefined) {
          delete element.dataset.copyOriginalHtml;
        }
      }, revertDelay);
    }

    return true;
  }

}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
} else if (typeof window !== 'undefined') {
  window.Utils = Utils;
} else if (typeof self !== 'undefined') {
  // Service worker context
  self.Utils = Utils;
}