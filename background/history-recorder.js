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
      // If duplicate prevention is disabled, always save. When a duplicate updates the earlier entry
      // instead of being skipped, the save step finds it, so nothing is blocked here.
      if (!settings.preventDuplicates || settings.duplicateAction === 'update') {
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

  /**
   * Was this scan of a private-window tab? A tab that closed before its scan finished cannot be asked:
   * it counts as private while any private window is open, because it may have been one of its tabs.
   */
  static async isIncognitoTab(tabId, chrome) {
    if (!Number.isInteger(tabId) || tabId < 0) return false;
    const tab = chrome?.tabs?.get ? await chrome.tabs.get(tabId).catch(() => null) : null;
    if (tab) return tab.incognito === true;
    const windows = chrome?.windows?.getAll ? await chrome.windows.getAll().catch(() => []) : [];
    return (windows || []).some(win => win && win.incognito === true);
  }

  /**
   * The newest entry within the duplicate window for the same page, or -1.
   * @param {Array} history newest first
   */
  static findDuplicateIndex(history, key, cutoffTime, scope) {
    return history.findIndex((item) => {
      if (!item) return false;
      const raw = typeof item.timestamp === 'string' ? new Date(item.timestamp).getTime() : Number(item.timestamp);
      if ((Number.isFinite(raw) ? raw : 0) < cutoffTime) return false;
      return this.normalizeDuplicateKey(item.url, item.hostname, scope) === key;
    });
  }

  static async _doSaveDetectionToHistory(tabId, pageData, detectionResults, chrome, options = {}) {
    const {
      historySettings = null,
      source = 'unknown'
    } = options || {};

    try {
      // Slow lookups first, outside the write queue
      const settings = historySettings || await Utils.getHistorySettings();

      // What History records at all: paused, incognito, ignored sites, fingerprint-only, minimum confidence
      const hostnameForPolicy = pageData.hostname || UrlUtils.getHostnameFromUrl(pageData.url || '');
      const incognito = settings.historySkipIncognito !== false && await this.isIncognitoTab(tabId, chrome);
      const verdict = typeof HistoryPolicy !== 'undefined'
        ? HistoryPolicy.evaluate({ detections: detectionResults, hostname: hostnameForPolicy, incognito }, settings)
        : { save: true };
      if (!verdict.save) {
        Logger.debug('UI', `[History] Not saved (${verdict.reason}, source: ${source}): ${hostnameForPolicy}`);
        return false;
      }

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
        ? this.normalizeDuplicateKey(entryUrl, pageData.hostname, duplicateScope)
        : null;
      if (settings.preventDuplicates && !duplicateKey) {
        Logger.debug('UI', `[History] Duplicate save-check could not normalize key (scope: ${duplicateScope}, source: ${source}), allowing save`);
      }
      // "The same page" for change detection ignores the query string
      const pageKey = this.normalizeDuplicateKey(entryUrl, entryHostname, 'path');

      // One serialized read-modify-write through the shared store
      const { changed, bytes, dropped, budget, result } = await HistoryStore.mutate((history) => {
        const now = Date.now();
        let duplicateAt = -1;
        if (duplicateKey) {
          const cutoffTime = now - FormatUtils.convertToMilliseconds(duplicateDuration, duplicateUnit);
          duplicateAt = this.findDuplicateIndex(history, duplicateKey, cutoffTime, duplicateScope);
          if (duplicateAt !== -1 && settings.duplicateAction !== 'update') {
            Logger.debug('UI', `History: Skipping duplicate history save within ${duplicateDuration} ${duplicateUnit} (scope: ${duplicateScope}, source: ${source}): ${duplicateKey}`);
            return undefined;
          }
        }

        // The earlier scan of this page: the duplicate being updated, else the newest entry for the same page
        const earlier = duplicateAt !== -1
          ? history[duplicateAt]
          : (pageKey ? history.find(item => item && this.normalizeDuplicateKey(item.url, item.hostname, 'path') === pageKey) : null);
        const diff = earlier && typeof HistoryPolicy !== 'undefined'
          ? HistoryPolicy.diffProtections(earlier.detections, detectionResults)
          : { added: [], removed: [], changed: false };

        // Pages that pin themselves (Settings → History): a new entry, or an update of one the person never unpinned,
        // while there is room (the pinned entries are exempt from the limit and from retention). An address the person
        // unpinned is never pinned by itself again: the mark sits on its newest entry (the exact address, query included:
        // one product page unpinned says nothing about its siblings), and a new entry of it carries the mark on
        const addressKey = this.normalizeDuplicateKey(entryUrl, entryHostname, 'full_url');
        const sameAddress = duplicateAt !== -1
          ? history[duplicateAt]
          : history.find(item => item && this.normalizeDuplicateKey(item.url, item.hostname, 'full_url') === addressKey);
        const neverAgain = !!(sameAddress && sameAddress.unpinned === true);
        const pinsItself = typeof HistoryPolicy !== 'undefined'
          && !neverAgain
          && HistoryPolicy.shouldAutoPin(detectionResults, settings)
          && HistoryPolicy.countAutoPins(history) < HistoryPolicy.MAX_AUTO_PINS;

        const fresh = {
          url: entryUrl,
          hostname: entryHostname,
          title: entryTitle,
          favicon: normalizedFavicon,
          timestamp: now,
          detections: detectionResults,
          detectionCount: detectionResults.length,
          categories: [...new Set(detectionResults.map(d => d.category))],
          cacheScope: cacheScope
        };
        // A change since the earlier scan is marked on the entry (the badge in History)
        if (diff.changed) fresh.changed = { at: now, added: diff.added, removed: diff.removed };
        const alert = diff.changed && earlier
          && (settings.historyChangeAlerts === 'all' || (settings.historyChangeAlerts === 'pinned' && earlier.pinned === true))
          ? { hostname: entryHostname, url: fresh.url, added: diff.added, removed: diff.removed }
          : null;

        let next;
        if (duplicateAt !== -1) {
          // Update in place: same entry, new scan, moved to the top; the first-seen date, pin and note stay
          const kept = history[duplicateAt];
          const updated = Object.assign({}, kept, fresh, { id: kept.id, firstSeen: kept.firstSeen || kept.timestamp });
          if (!diff.changed) delete updated.changed;
          if (pinsItself && kept.pinned !== true && kept.unpinned !== true) { updated.pinned = true; updated.autoPinned = true; }
          next = [updated, ...history.filter((_, i) => i !== duplicateAt)];
        } else {
          next = [Object.assign({ id: `detection_${now}_${tabId}` }, fresh, pinsItself ? { pinned: true, autoPinned: true } : {}, neverAgain ? { unpinned: true } : {}), ...history];
        }

        // Newest first, then the rolling window limit (pinned entries never count against it)
        return { items: HistoryStore.applyLimit(next, historyLimit), result: { alert } };
      }, chrome.storage.local);

      if (changed) {
        Logger.ui(`History: Saved detection to history for ${pageData.url}`);
        // Both run after the write and never fail the save
        await this.notifyChange(result && result.alert, chrome).catch(() => {});
        await this.checkStorage(bytes, dropped, chrome, budget).catch(() => {});
      }
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
   * The result of a watchlist check, applied to the page that was watched: never a new entry.
   * Unchanged: only the time of the check is kept. Changed: the entry takes the new scan (same id; its pin, note and
   * watch stay), moves to the top, carries the Changed mark, and a notification says what changed (as for any page
   * whose protections change, when Settings → History alerts for pinned pages or for all).
   * @param {string} entryId
   * @param {Array} detectionResults  the finished results of the check
   * @returns {Promise<{found: boolean, changed: boolean, added?: string[], removed?: string[]}>}
   */
  static async applyWatchResult(entryId, detectionResults, chrome, now = Date.now()) {
    const settings = await Utils.getHistorySettings();
    const { result } = await HistoryStore.mutate((history) => {
      const index = history.findIndex(item => item && item.id === entryId && item.pinned === true && item.watch === true);
      if (index === -1) return { result: { found: false, changed: false } };
      const entry = history[index];
      const diff = HistoryPolicy.diffProtections(entry.detections, detectionResults);
      if (!diff.changed) {
        const next = history.slice();
        next[index] = Object.assign({}, entry, { watchedAt: now });
        return { items: next, result: { found: true, changed: false } };
      }
      const updated = Object.assign({}, entry, {
        timestamp: now,
        watchedAt: now,
        detections: detectionResults,
        detectionCount: detectionResults.length,
        categories: [...new Set(detectionResults.map(d => d.category))],
        changed: { at: now, added: diff.added, removed: diff.removed }
      });
      const alert = settings.historyChangeAlerts === 'all' || settings.historyChangeAlerts === 'pinned'
        ? { hostname: entry.hostname, url: updated.url || entry.url, added: diff.added, removed: diff.removed }
        : null;
      return { items: [updated, ...history.filter((_, i) => i !== index)], result: { found: true, changed: true, added: diff.added, removed: diff.removed, alert } };
    }, chrome.storage.local);
    await this.notifyChange(result && result.alert, chrome).catch(() => {});
    return { found: !!(result && result.found), changed: !!(result && result.changed), added: result && result.added, removed: result && result.removed };
  }

  /** A notification when a page you scanned before gained or lost a protection (Settings → History). */
  static async notifyChange(alert, chrome) {
    if (!alert || !chrome?.notifications?.create) return;
    const settings = await Utils.getSettings();
    if (settings.notificationsEnabled === false) return;
    if (typeof I18n !== 'undefined' && I18n.ready) await I18n.ready();
    const text = (key, fallback, ...args) => (typeof I18n !== 'undefined' && I18n.format(key, ...args)) || fallback.replace(/\{(\d)\}/g, (_, i) => args[Number(i)]);
    const parts = [];
    if (alert.added.length) parts.push(text('historyChangeAlertAddedFmt', 'Added: {0}', alert.added.join(', ')));
    if (alert.removed.length) parts.push(text('historyChangeAlertRemovedFmt', 'Removed: {0}', alert.removed.join(', ')));
    const id = `scrapfly-history-change-${Date.now()}`;
    // A click opens the page (background/notification-clicks.js)
    if (typeof NotificationClicks !== 'undefined') await NotificationClicks.remember(id, alert.url, chrome).catch(() => {});
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: text('historyChangeAlertTitleFmt', 'Protections changed on {0}', alert.hostname),
      message: parts.join('. '),
      priority: 1
    });
  }

  /**
   * History's size limit takes the oldest entries without asking: warn once when the share of storage
   * it may use is nearly full (or has just removed entries), and again only after it has been emptied below 70%.
   * @param {number} bytes size of the stored history after this save
   * @param {number} dropped entries the size limit removed in this save
   * @param {number} [budget] the size limit this save was written under (6 MB when not given)
   */
  static async checkStorage(bytes, dropped, chrome, budget) {
    if (!Number.isFinite(bytes) || typeof HistoryStore === 'undefined') return;
    const key = 'scrapfly_history_storage_notice';
    const ratio = bytes / (budget > 0 ? budget : HistoryStore.MAX_BYTES);
    const state = (await chrome.storage.local.get(key))[key] || {};
    if (ratio < 0.7 && !dropped) {
      if (state.warned) await chrome.storage.local.set({ [key]: { warned: false } });
      return;
    }
    if ((ratio >= 0.9 || dropped > 0) && !state.warned) {
      await chrome.storage.local.set({ [key]: { warned: true, at: Date.now() } });
      const settings = await Utils.getSettings();
      if (settings.notificationsEnabled === false || !chrome.notifications?.create) return;
      if (typeof I18n !== 'undefined' && I18n.ready) await I18n.ready();
      const text = (k, fallback) => (typeof I18n !== 'undefined' && I18n.get(k)) || fallback;
      chrome.notifications.create('scrapfly-history-storage', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: text('historyStorageWarnTitle', 'History is almost full'),
        message: text('historyStorageWarnMessage', 'The oldest entries will be removed to make room. Export or pin what you want to keep.'),
        priority: 1
      });
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
