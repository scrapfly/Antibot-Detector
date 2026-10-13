/** Worker-only policy for recording detections through HistoryStore. */
class HistoryRecorder {
  /**
   * Normalize URL/hostname into duplicate-comparison key.
   * @param {string} url - URL candidate
   * @param {string} hostname - Hostname fallback
   * @param {string} scope - Duplicate scope: domain|path|full_url
   * @returns {string|null} Normalized key or null if unavailable
   */
  static normalizeDuplicateKey(url, hostname, scope = 'full_url') {
    const duplicateScope = ['domain', 'path', 'full_url'].includes(scope) ? scope : 'full_url';
    const rawUrl = typeof url === 'string' ? url.trim() : '';
    const rawHostname = typeof hostname === 'string' ? hostname.trim() : '';

    const normalizeHostname = (hostValue) => {
      if (!hostValue || typeof hostValue !== 'string') {
        return '';
      }
      const normalized = hostValue.trim().toLowerCase();
      return (normalized && normalized !== 'unknown') ? normalized : '';
    };

    let parsedUrl = null;
    if (rawUrl) {
      try {
        parsedUrl = new URL(rawUrl);
      } catch (error) {
        Logger.debug('UI', `[History] normalizeDuplicateKey parse failed for scope "${duplicateScope}", using hostname fallback`);
      }
    }

    const fallbackHostname = normalizeHostname(rawHostname)
      || normalizeHostname(rawUrl ? UrlUtils.getHostnameFromUrl(rawUrl) : '');

    if (duplicateScope === 'domain') {
      const hostnameKey = parsedUrl ? normalizeHostname(parsedUrl.hostname) : fallbackHostname;
      return hostnameKey || null;
    }

    if (duplicateScope === 'path') {
      if (parsedUrl) {
        return `${parsedUrl.origin}${parsedUrl.pathname}`;
      }
      return fallbackHostname || null;
    }

    if (parsedUrl) {
      return parsedUrl.href;
    }

    return fallbackHostname || null;
  }

  /**
   * Check whether a history array already contains a duplicate key in the time window.
   * @param {Array} history - History items
   * @param {string} normalizedKey - Candidate duplicate key
   * @param {number} cutoffTime - Minimum timestamp (ms) to consider
   * @param {string} scope - Duplicate scope: domain|path|full_url
   * @returns {boolean} True if duplicate exists
   */
  static isDuplicateHistoryEntry(history, normalizedKey, cutoffTime, scope = 'full_url') {
    if (!Array.isArray(history) || !normalizedKey) {
      return false;
    }

    return history.some((item) => {
      if (!item) {
        return false;
      }

      const rawTimestamp = typeof item.timestamp === 'string'
        ? new Date(item.timestamp).getTime()
        : Number(item.timestamp);
      const itemTimestamp = Number.isFinite(rawTimestamp) ? rawTimestamp : 0;

      if (itemTimestamp < cutoffTime) {
        return false;
      }

      const itemKey = this.normalizeDuplicateKey(item.url, item.hostname, scope);
      return !!itemKey && itemKey === normalizedKey;
    });
  }

  /**
   * Check if detection should be saved to history based on duplicate prevention settings
   * @param {string} url - URL to check
   * @param {Object} settings - History settings from Utils.getHistorySettings()
   * @param {Object} chrome - Chrome API object
   * @returns {Promise<boolean>} True if should save, false if duplicate
   */
  static async shouldSaveToHistory(url, settings, chrome) {
    try {
      // If duplicate prevention is disabled, always save
      if (!settings.preventDuplicates) {
        return true;
      }

      // Get existing history
      const history = await HistoryStore.read(chrome.storage.local);

      if (!Array.isArray(history) || history.length === 0) {
        return true; // No history, always save
      }

      const duplicateScope = settings.duplicateScope || 'full_url';
      const duplicateDuration = Number.isFinite(parseInt(settings.duplicateDuration, 10))
        ? parseInt(settings.duplicateDuration, 10)
        : 1;
      const duplicateUnit = settings.duplicateUnit || 'hours';

      const durationMs = FormatUtils.convertToMilliseconds(
        duplicateDuration,
        duplicateUnit
      );

      const now = Date.now();
      const cutoffTime = now - durationMs;
      const normalizedKey = this.normalizeDuplicateKey(url, null, duplicateScope);
      if (!normalizedKey) {
        Logger.debug('UI', `[History] Duplicate pre-check could not normalize key (scope: ${duplicateScope}), allowing save`);
        return true;
      }

      const isDuplicate = this.isDuplicateHistoryEntry(history, normalizedKey, cutoffTime, duplicateScope);

      if (isDuplicate) {
        Logger.debug('UI', `History: Skipping duplicate URL within ${duplicateDuration} ${duplicateUnit} (scope: ${duplicateScope}, source: precheck): ${normalizedKey}`);
        return false;
      }

      return true;
    } catch (error) {
      Logger.warn('UI', '[History] Duplicate check failed', error);
      return true; // On error, allow save
    }
  }

  /**
   * Save detection results to history (called from background.js)
   * @param {number} tabId - Tab ID
   * @param {Object} pageData - Page data
   * @param {Array} detectionResults - Detection results
   * @param {Object} chrome - Chrome API object
   * @param {Object} options - Save options
   * @param {Object} options.historySettings - Optional preloaded history settings
   * @param {string} options.source - Save source context (e.g., finalize, cache_hit)
   * @returns {Promise<boolean>} Success status
   */
  static saveDetectionToHistory(tabId, pageData, detectionResults, chrome, options = {}) {
    return HistoryRecorder._doSaveDetectionToHistory(tabId, pageData, detectionResults, chrome, options);
  }

  static async _doSaveDetectionToHistory(tabId, pageData, detectionResults, chrome, options = {}) {
    const {
      historySettings = null,
      source = 'unknown'
    } = options || {};

    try {
      // Slow lookups first, outside the write queue
      const settings = historySettings || await Utils.getHistorySettings();
      const duplicateScope = settings.duplicateScope || 'full_url';
      const duplicateDuration = Number.isFinite(parseInt(settings.duplicateDuration, 10))
        ? parseInt(settings.duplicateDuration, 10)
        : 1;
      const duplicateUnit = settings.duplicateUnit || 'hours';
      const historyLimit = Number.isFinite(parseInt(settings.historyLimit, 10))
        ? parseInt(settings.historyLimit, 10)
        : 0; // 0 = unlimited
      const cacheScope = await Utils.getCacheScope();
      const normalizedFavicon = UrlUtils.normalizeFaviconForStorage(
        pageData.favicon,
        pageData.url || pageData.hostname
      );
      const entryUrl = pageData.url || '';
      const entryHostname = pageData.hostname || UrlUtils.getHostnameFromUrl(entryUrl);
      const entryTitle = await HistoryRecorder.resolveEntryTitle(tabId, pageData, entryHostname, chrome);
      const duplicateKey = settings.preventDuplicates
        ? this.normalizeDuplicateKey(pageData.url, pageData.hostname, duplicateScope)
        : null;
      if (settings.preventDuplicates && !duplicateKey) {
        Logger.debug('UI', `[History] Duplicate save-check could not normalize key (scope: ${duplicateScope}, source: ${source}), allowing save`);
      }

      // One serialized read-modify-write through the shared store
      const { changed } = await HistoryStore.mutate((history) => {
        if (duplicateKey) {
          const cutoffTime = Date.now() - FormatUtils.convertToMilliseconds(duplicateDuration, duplicateUnit);
          if (this.isDuplicateHistoryEntry(history, duplicateKey, cutoffTime, duplicateScope)) {
            Logger.debug('UI', `History: Skipping duplicate history save within ${duplicateDuration} ${duplicateUnit} (scope: ${duplicateScope}, source: ${source}): ${duplicateKey}`);
            return undefined;
          }
        }

        const historyEntry = {
          id: `detection_${Date.now()}_${tabId}`,
          url: entryUrl,
          hostname: entryHostname,
          title: entryTitle,
          favicon: normalizedFavicon,
          timestamp: Date.now(),
          detections: detectionResults,
          detectionCount: detectionResults.length,
          categories: [...new Set(detectionResults.map(d => d.category))],
          cacheScope: cacheScope
        };

        // Newest first, then the rolling window limit
        const next = [historyEntry, ...history];
        return historyLimit > 0 && next.length > historyLimit ? next.slice(0, historyLimit) : next;
      }, chrome.storage.local);

      if (changed) Logger.ui(`History: Saved detection to history for ${pageData.url}`);
      return changed;
    } catch (error) {
      if (typeof HistoryStore !== 'undefined' && HistoryStore.isQuotaError && HistoryStore.isQuotaError(error)) {
        Logger.warn('UI', '[History] Storage is full; this page was not added to History');
      } else {
        Logger.error('UI', '[History] Detection save failed', error);
      }
      return false;
    }
  }

  /**
   * Pick the page title for a history entry. The title captured with the first detection
   * message is often still the URL (the tab is loading), so prefer the tab's live title
   * when the tab still shows the same host and has a real title by now.
   * @param {number} tabId - Tab ID
   * @param {Object} pageData - Page data (tabTitle / title)
   * @param {string} hostname - Entry hostname
   * @param {Object} chrome - Chrome API object
   * @returns {Promise<string>} Title to store
   */
  static async resolveEntryTitle(tabId, pageData, hostname, chrome) {
    const stored = pageData.tabTitle || pageData.title || '';
    const looksLikeUrl = (value) => !value || value === hostname || /^[a-z]+:\/\//i.test(value) || value.startsWith(`${hostname}/`);

    if (Number.isInteger(tabId) && tabId >= 0 && chrome?.tabs?.get) {
      try {
        const tab = await chrome.tabs.get(tabId);
        const sameHost = tab && tab.url && UrlUtils.getHostnameFromUrl(tab.url) === hostname;
        if (sameHost && tab.title && !looksLikeUrl(tab.title)) {
          return tab.title;
        }
      } catch (error) {
        // Tab already closed: keep the title captured during detection
      }
    }
    return stored || 'Untitled';
  }

}
