/**
 * Detection user action methods (cache/blacklist/refresh).
 * Dependencies: `Detection` class must be loaded first.
 */
const DetectionActions = (typeof self !== 'undefined' && self.DetectionActions) ? self.DetectionActions : {};

const detectionActionsTr = (key, fallback) => (
  typeof I18n !== 'undefined' ? I18n.tr(key, fallback) : fallback
);

const detectionActionsFormat = (key, fallback, ...args) => {
  if (typeof I18n !== 'undefined' && typeof I18n.format === 'function') {
    const formatted = I18n.format(key, ...args);
    if (formatted !== null) return formatted;
  }
  let msg = fallback;
  for (let i = 0; i < args.length; i++) {
    msg = msg.split('{' + i + '}').join(String(args[i]));
  }
  return msg;
};

DetectionActions.clearCache = async function() {
    const clearCacheBtn = document.querySelector('#clearCacheBtn');

    try {
      const confirmed = await NotificationHelper.confirm({
        title: detectionActionsTr('clearCacheConfirmTitle', 'Clear Cache'),
        message: detectionActionsTr('clearCacheConfirmMsg', 'This will remove cached detection data for this domain and trigger a fresh analysis.'),
        confirmText: detectionActionsTr('clearCacheConfirmBtn', 'Clear Cache'),
        cancelText: detectionActionsTr('btnCancel', 'Cancel'),
        type: 'warning',
        tone: 'danger',
        emphasizeAction: true
      });

      if (!confirmed) return;

      if (clearCacheBtn) clearCacheBtn.disabled = true;

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        NotificationHelper.error(detectionActionsTr('unableGetCurrentPage', 'Unable to get current page'));
        return;
      }

      const url = tabs[0].url;

      const answer = await chrome.runtime.sendMessage({
        type: WorkerMessages.DETECTION_CLEAR_CACHE,
        url: url,
        tabId: tabs[0].id
      });

      // What the worker says decides what the person is told: 'cleared' removed the saved result, 'not_found' found none (the
      // worker still drops the tab's scan and marks it cleared, so the page ends the same way); anything else changed nothing
      const status = answer && answer.status;
      if (status !== 'cleared' && status !== 'not_found') {
        NotificationHelper.error(status === 'unknown'
          ? detectionActionsTr('workerOutdatedHint', "The extension's background part is out of date. Reload the extension on the extensions page and try again.")
          : detectionActionsTr('failedToClearCacheToast', 'Failed to clear cache'));
        return;
      }
      if (status === 'cleared') {
        NotificationHelper.success(detectionActionsTr('cacheClearedToast', 'Cache cleared'));
      } else {
        NotificationHelper.info(detectionActionsTr('notificationCacheAlreadyCleared', 'Cache already cleared'));
      }

      try {
        await setBadgeTextColor(tabs[0].id, false, BADGE.COLORS.CLEARED);
        await chrome.action.setBadgeText({ text: BADGE.TEXT.CLEARED, tabId: tabs[0].id });
        await chrome.action.setBadgeBackgroundColor({
          color: BADGE.COLORS.CLEARED,
          tabId: tabs[0].id
        });
      } catch (error) {
        if (this.debugMode) Logger.debug('UI', 'Could not set badge:', error);
      }

      this.currentResults = [];
      this.showEmptyState({ outcome: 'unscanned' });
    } catch (error) {
      Logger.error('UI', 'Failed to clear cache:', error);
      NotificationHelper.error(detectionActionsTr('failedToClearCacheToast', 'Failed to clear cache'));
    } finally {
      // However it ended: the card (when it was cleared) hides the button, and a failure leaves it usable
      DetectionActions.resetClearCacheButton.call(this);
    }
};

DetectionActions.resetClearCacheButton = function() {
    const clearCacheBtn = document.querySelector('#clearCacheBtn');
    if (clearCacheBtn) clearCacheBtn.disabled = false;
};

/**
 * What the popup says when a Scan again could not start, by the worker's outcome (background/commands.js rescan()): existing
 * wording, [message key, English text]. An error toast, which is shown even with notifications off: the person asked for a
 * scan and must be told why none began. 'reloaded' is not here: the page is on its way and the scanning screen says so.
 */
DetectionActions.RESCAN_NOTICES = Object.freeze({
    unsupported: ['detectionUnsupportedTitle', 'This page cannot be scanned'],
    skipped: ['toolbarTitleSkipped', 'This site is not scanned'],
    off: ['toolbarTitleOff', 'Detection is switched off'],
    no_tab: ['unableGetCurrentPage', 'Unable to get current page'],
    failed: ['detectionFailedTitle', 'Scan failed'],
    // The worker does not know the message: it still runs the code from before the update (the popup's files are read fresh on
    // every open, the worker only when the extension is reloaded). The wording History and Settings use for the same case
    outdated: ['workerOutdatedHint', "The extension's background part is out of date. Reload the extension on the extensions page and try again."]
});

/** Both Scan again buttons off while the worker answers (the toolbar one and the one on the dead-end card). */
DetectionActions.setRescanBusy = function(busy) {
    document.querySelectorAll('#rescanBtn, #emptyRescanBtn').forEach((button) => { button.disabled = busy; });
};

/** The page is reloading to be scanned from the start: no result of the old scan stays, and the scanning screen shows until the new one arrives. */
DetectionActions.showRescanning = function(tab) {
    this.viewedTabId = tab.id;
    this.viewedTabUrl = tab.url || '';
    this.currentResults = [];
    this.cacheMetadata = null;
    this.isShowingResults = false;
    this.wasInterrupted = false;
    this.loadingRepolls = 0;
    this.loadingIdleAsks = 0;
    if (typeof this.closeDetectionModal === 'function') this.closeDetectionModal();
    if (typeof this.tellAdvancedResultsGone === 'function') this.tellAdvancedResultsGone();
    this.showAnalyzingState();
};

/**
 * Scan again (the button next to Clear cache, and the one on the states that say the page has no completed scan): the worker
 * clears the page's saved result and reloads the tab, as the Alt+Shift+S shortcut does. Only the active tab of this popup's
 * own window is asked for. On 'reloaded' the scanning screen shows until the new result arrives (the popup's own listeners
 * and timeouts settle it, as after any scan); any other outcome is a toast that says why nothing happened.
 */
DetectionActions.rescan = async function() {
    // A second click while the first is on its way would reload the page twice
    if (this.isRescanning) return;
    this.isRescanning = true;
    DetectionActions.setRescanBusy(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      let outcome = 'no_tab';
      if (tab && typeof tab.id === 'number') {
        const answer = await chrome.runtime.sendMessage({ type: WorkerMessages.RESCAN_TAB, tabId: tab.id });
        if (answer && answer.status === 'unknown') outcome = 'outdated';
        else outcome = answer && answer.status === 'ok' && typeof answer.outcome === 'string' ? answer.outcome : 'failed';
      }
      if (outcome === 'reloaded') {
        DetectionActions.showRescanning.call(this, tab);
        return;
      }
      const [key, fallback] = DetectionActions.RESCAN_NOTICES[outcome] || DetectionActions.RESCAN_NOTICES.failed;
      NotificationHelper.error(detectionActionsTr(key, fallback));
    } catch (error) {
      Logger.error('UI', 'Failed to scan again:', error);
      NotificationHelper.error(detectionActionsTr('detectionFailedTitle', 'Scan failed'));
    } finally {
      this.isRescanning = false;
      DetectionActions.setRescanBusy(false);
    }
};

DetectionActions.addToBlacklist = async function() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        NotificationHelper.error(detectionActionsTr('unableGetCurrentPage', 'Unable to get current page'));
        return;
      }

      const url = new URL(tabs[0].url);
      const domain = url.hostname;

      if (!domain) {
        NotificationHelper.error(detectionActionsTr('invalidDomain', 'Invalid domain'));
        return;
      }

      const confirmed = await NotificationHelper.confirm({
        title: detectionActionsTr('addBlacklistTitle', 'Add to Blacklist'),
        message: detectionActionsFormat(
          'addBlacklistMsgFmt',
          'Domain "{0}" will be excluded from all future detections. You can remove it later in Settings.',
          domain
        ),
        confirmText: detectionActionsTr('addBlacklistBtn', 'Add to Blacklist'),
        cancelText: detectionActionsTr('btnCancel', 'Cancel'),
        type: 'danger',
        emphasizeAction: true
      });

      if (!confirmed) return;

      const settings = await Utils.getSettings();

      if (!settings.detection) {
        settings.detection = {};
      }

      if (!Array.isArray(settings.detection.blacklistedDomains)) {
        settings.detection.blacklistedDomains = [];
      }

      if (settings.detection.blacklistedDomains.includes(domain)) {
        NotificationHelper.info(detectionActionsFormat(
          'alreadyBlacklistedFmt',
          'Domain "{0}" is already blacklisted',
          domain
        ));
        return;
      }

      // Written from a fresh read, so a Settings save in between is not undone
      const saved = typeof StorageManager !== 'undefined' && typeof StorageManager.setDomainExcluded === 'function'
        ? await StorageManager.setDomainExcluded(domain, true)
        : false;
      if (!saved) {
        throw new Error(detectionActionsTr('failedReadSettings', 'Could not save settings'));
      }

      NotificationHelper.success(detectionActionsFormat(
        'addedToBlacklistFmt',
        'Added "{0}" to blacklist',
        domain
      ));

      this.showBlacklistState(domain);
    } catch (error) {
      Logger.error('UI', 'Failed to add to blacklist:', error);
      NotificationHelper.error(detectionActionsFormat(
        'failedAddBlacklistFmt',
        'Failed to add to blacklist: {0}',
        error.message
      ));
    }
};

/** The mode of Settings → Detection → Sites to scan: the card of a paused site and the block button say the right thing. */
DetectionActions.applyScanMode = function(detection) {
    const mode = ScanScope.modeOf(detection);
    this.scanMode = mode;
    for (const element of document.querySelectorAll('#blacklistWarning [data-scan-mode-show]')) element.hidden = element.dataset.scanModeShow !== mode;
    // "Block this domain" edits the skipped list, which only means something in the mode that reads it
    const block = document.querySelector('#addToBlacklistBtn');
    if (block) block.hidden = mode === 'allowlist';
};

DetectionActions.showBlacklistState = function(domain) {
    this.blacklistedDomain = domain;
    if (!this.isExtensionEnabled) {
      this.showDisabledState(true);
      return;
    }
    this.isShowingResults = false;
    this.wasInterrupted = false;
    this.currentResults = [];
    this.cacheMetadata = null;
    this.displayOptions = {};
    this.hideLoadingState();
    this.closeDetectionModal();
    if (typeof DetectionUI !== 'undefined') DetectionUI.announce('');
    if (this.uiStateMachine) {
      this.uiStateMachine.setState(this.uiStates.DISABLED, { isBlacklisted: true, domain });
    }

    const blacklistWarning = document.querySelector('#blacklistWarning');
    const blacklistDomain = document.querySelector('#blacklistDomain');
    const emptyState = document.querySelector('#emptyState');
    const detectionResults = document.querySelector('#detectionResults');
    const disabledState = document.querySelector('#disabledState');
    const interruptedState = document.querySelector('#interruptedState');
    const detectionPagination = document.querySelector('#detectionPagination');

    if (blacklistDomain) {
      blacklistDomain.textContent = domain;
    }

    if (blacklistWarning) blacklistWarning.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (detectionResults) detectionResults.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';
    if (interruptedState) interruptedState.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && this.isExtensionEnabled && this.blacklistedDomain === domain) {
        setPausedIcon(tabs[0].id, true);
        setBadgeTextColor(tabs[0].id, true);
        chrome.action.setBadgeText({ text: BADGE.TEXT.BLACKLISTED, tabId: tabs[0].id }).catch((error) => {
          if (this.debugMode) Logger.debug('UI', 'Failed to set blacklist badge:', error.message);
        });
        chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.BLACKLISTED, tabId: tabs[0].id }).catch((error) => {
          if (this.debugMode) Logger.debug('UI', 'Failed to set badge color:', error.message);
        });
      }
    });
};

DetectionActions.removeFromBlacklist = async function(domain) {
    try {
      const settings = await Utils.getSettings();
      // In the mode with a list of the only sites to scan, "resume" means the site joins that list
      const allow = ScanScope.modeOf(settings.detection) === 'allowlist';

      if (allow || settings.detection?.blacklistedDomains) {
        const saved = typeof StorageManager !== 'undefined'
          ? await (allow ? StorageManager.setDomainAllowed(domain, true) : StorageManager.setDomainExcluded(domain, false))
          : false;
        if (!saved) {
          throw new Error(detectionActionsTr('failedReadSettings', 'Could not save settings'));
        }

        this.blacklistedDomain = null;
        NotificationHelper.success(allow
          ? detectionActionsFormat('siteAllowedFmt', 'Added "{0}" to the sites to scan', domain)
          : detectionActionsFormat('removedFromBlacklistFmt', 'Removed "{0}" from blacklist', domain));

        const blacklistWarning = document.querySelector('#blacklistWarning');
        if (blacklistWarning) blacklistWarning.style.display = 'none';

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          setPausedIcon(tab.id, false);
          // Switched off, nothing is scanned: the page is left as it is, and the card of the switched-off extension stays
          if (!this.isExtensionEnabled) {
            this.showDisabledState(false);
            return;
          }
          // The page on screen loaded while its site was paused: none of its headers, cookies, request bodies or requests were
          // kept, and its JS hooks never ran. A scan of it as it is would miss all of that and still be saved, recorded and sent
          // as if complete, so it loads again, as Scan again does (a result saved for the site before it was paused can still
          // answer), and the scanning screen shows until the new result arrives
          DetectionActions.showRescanning.call(this, tab);
          try {
            await chrome.tabs.reload(tab.id);
          } catch (error) {
            // The tab went away or cannot be reloaded: the page is not scanned, and the card says how to scan it
            Logger.warn('UI', 'Detection: could not reload the page after resuming its site:', error && error.message);
            this.showEmptyState({ outcome: 'unscanned' });
          }
        }
      }
    } catch (error) {
      Logger.error('UI', 'Failed to remove from blacklist:', error);
      NotificationHelper.error(detectionActionsFormat(
        'failedRemoveBlacklistFmt',
        'Failed to remove from blacklist: {0}',
        error.message
      ));
    }
};

DetectionActions.refreshAnalysis = async function() {
    if (this.debugMode) Logger.debug('UI', 'Refreshing detection analysis');

    try {
      this.showAnalyzingState();

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      chrome.runtime.sendMessage(
        { type: WorkerMessages.REQUEST_DETECTION, tabId: tab.id },
        (response) => {
          if (chrome.runtime.lastError) {
            Logger.error('UI', 'Detection: Error requesting fresh detection:', chrome.runtime.lastError);
            this.hideLoadingState();
            this.showEmptyState({ outcome: 'failed' });
            return;
          }

          if (!response || response.status === 'error') {
            this.showEmptyState({ outcome: 'failed' });
            return;
          }
          // The page has to load again to be scanned (it loaded while its site was paused, or before the extension could watch
          // it): no scan starts, so the card says so at once and offers Scan again, instead of a wait that ends in "Scan failed"
          if (response.status === 'needs_reload') {
            this.hideLoadingState();
            this.showEmptyState({ outcome: 'unscanned' });
            return;
          }
          if (this.debugMode) Logger.debug('UI', 'Detection: Fresh detection requested:', response);

          setTimeout(() => {
            chrome.runtime.sendMessage(
              { type: WorkerMessages.GET_DETECTION_DATA, tabId: tab.id },
              async (dataResponse) => {
                if (chrome.runtime.lastError) {
                  Logger.error('UI', 'Detection: Error getting detection data:', chrome.runtime.lastError);
                  this.hideLoadingState();
                  this.showEmptyState({ outcome: 'failed' });
                  return;
                }

                if (dataResponse?.status === 'pending' && !dataResponse.data) {
                  return; // Keep the existing analyzing state and its timeout.
                }
                if (dataResponse && dataResponse.data) {
                  await Detection.processDetectionData({
                    detection: this,
                    detectionEngine: this.detectionEngine,
                    detectorManager: this.detectorManager
                  }, dataResponse.data);
                  if (this.debugMode) Logger.debug('UI', `Detection: Found ${this.currentResults.length} detections after refresh`);
                } else {
                  if (this.debugMode) Logger.debug('UI', 'Detection: No data received after refresh');
                  this.hideLoadingState();
                  this.showEmptyState({ outcome: 'failed' });
                }
              }
            );
          }, 2000);
        }
      );

    } catch (error) {
      Logger.error('UI', 'Failed to refresh analysis:', error);
      this.hideLoadingState();
      this.showEmptyState({ outcome: 'failed' });
    }
};

DetectionActions.PASTE_BANNER = [
  '============================================',
  'Made by Scrapfly.io',
  '============================================'
].join('\n');

/**
 * Strip query string + fragment from a URL — those can carry OAuth codes,
 * reset tokens, session ids, etc. that must not leave the browser.
 * @returns {string|null} origin + pathname, or null if unparseable
 */
DetectionActions._sanitizeUrlForPaste = function(raw) {
    if (!raw) return null;
    try {
      const u = new URL(raw);
      // A path can carry a secret too (a password-reset, invite or magic-link token): a segment that looks like one
      // is replaced, the readable ones (/reset, /invite) stay
      // A path parameter (;jsessionid=…) is dropped, and a segment that holds an address (an email in /u/jane@x.example)
      // is replaced
      const path = u.pathname.split('/').map(raw => {
        const segment = raw.split(';')[0];
        const text = (() => { try { return decodeURIComponent(segment); } catch (_) { return segment; } })();
        if (text.includes('@')) return ':email';
        return DetectionActions._looksLikeSecret(segment) ? ':token' : segment;
      }).join('/');
      return `${u.origin}${path}`;
    } catch {
      return null;
    }
};

/** A path segment that reads as a token rather than a word: a UUID, long hex, or a long mix of letters and digits. */
DetectionActions._looksLikeSecret = function(segment) {
    const text = (() => { try { return decodeURIComponent(segment); } catch (_) { return segment; } })();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
    if (/^[0-9a-f]{16,}$/i.test(text)) return true;
    return text.length >= 16 && /^[A-Za-z0-9._~+=-]+$/.test(text) && /\d/.test(text) && /[A-Za-z]/.test(text);
};

/**
 * The detections the list shows: what the search and the chips leave, or every result when neither narrows it. Copies,
 * uploads and the replay kit take this, so an export holds what the person sees.
 */
DetectionActions.shownResults = function() {
    const all = Array.isArray(this.currentResults) ? this.currentResults : [];
    if (typeof DetectionUI !== 'undefined' && typeof DetectionUI.isFiltering === 'function'
      && typeof this.getFilteredResults === 'function' && DetectionUI.isFiltering.call(this)) {
      const shown = this.getFilteredResults();
      return Array.isArray(shown) ? shown : all;
    }
    return all;
};

/**
 * Build the paste body: the Scrapfly banner, a blank line, then the
 * detections serialized as pretty JSON. Emits only non-sensitive metadata —
 * never raw cookie/header values (those live in match.value).
 * @param {string} [pageUrl] the page the user is on (DetectionActions.currentPageUrl)
 * @returns {{ content: string, count: number }}
 */
DetectionActions.buildDetectionsPasteContent = function(pageUrl) {
    const detections = DetectionActions.shownResults.call(this);

    // The page the user is on, not the cached entry's URL: under the Domain
    // cache scope every page of a site shares the first scanned page's entry
    const siteUrlNode = document.querySelector('#siteUrl');
    const rawUrl = (pageUrl || this.cacheMetadata?.url || siteUrlNode?.title || '').trim();
    const safeUrl = DetectionActions._sanitizeUrlForPaste(rawUrl);
    let host = (siteUrlNode?.textContent || '').trim();
    try {
      if (safeUrl) host = new URL(safeUrl).hostname;
    } catch (e) {
      // keep the displayed host
    }

    const avgConfidence = DetectionUtils.computeAverageConfidence(detections);
    const { difficulty } = this.getDifficultyInfo(detections, avgConfidence);

    // Per detection, emit method counts (cookie/header/url/...) — NOT the
    // matched values, which carry live secrets like __cf_bm / datadome tokens.
    const cleanedDetections = this.sortDetectionsByCategory(detections).map((d) => {
      const methodCounts = {};
      const matches = Array.isArray(d?.matches) ? d.matches : [];
      for (const m of matches) {
        const type = m?.type ? String(m.type) : 'unknown';
        methodCounts[type] = (methodCounts[type] || 0) + 1;
      }
      return {
        name: d?.detector?.name || d?.detector || d?.name || 'Unknown',
        category: d?.category || d?.detector?.category || null,
        confidence: typeof d?.confidence === 'number' ? d.confidence : null,
        methods: methodCounts
      };
    });

    // The page's HTTP status, as the tile beside Cache shows it (the one saved with the result), when it is known
    const httpStatus = typeof HttpStatus !== 'undefined' ? HttpStatus.of(this.cacheMetadata?.httpStatus) : null;
    const payload = {
      source: 'Scrapfly.io',
      url: safeUrl || host || null,
      host: host || null,
      generatedAt: new Date().toISOString(),
      summary: {
        detections: detections.length,
        confidence: avgConfidence,
        difficulty,
        ...(httpStatus ? { httpStatus } : {})
      },
      detections: cleanedDetections
    };

    const content = `${DetectionActions.PASTE_BANNER}\n\n${JSON.stringify(payload, null, 2)}\n`;
    return { content, count: detections.length, payload };
};

/**
 * The same summary as a Markdown block for a ticket, a pull request or a chat:
 * a heading, one summary line and a table. Built from the paste payload, so it
 * carries the same things (no cookie or header values, no query string).
 * @param {object} payload - buildDetectionsPasteContent().payload
 * @param {Function} [format] - (key, fallback, ...args) => text
 * @returns {string}
 */
DetectionActions.buildDetectionsMarkdown = function(payload, format = detectionActionsFormat) {
    // Markdown and HTML characters are escaped, so no name or address turns into a link, an image or a new row
    const cell = (value) => String(value == null ? '' : value).replace(/[\\`*_[\]<>|~]/g, (c) => `\\${c}`).replace(/[\r\n]+/g, ' ').trim();
    const p = payload && typeof payload === 'object' ? payload : {};
    const list = Array.isArray(p.detections) ? p.detections : [];
    const summary = p.summary || {};
    const lines = [];
    lines.push(`## ${cell(format('detectionMdHeadingFmt', 'Protections on {0}', p.host || p.url || '?'))}`);
    lines.push('');
    if (p.url) lines.push(cell(p.url));
    const counts = format('detectionMdSummaryFmt', 'Detections: {0} · Confidence: {1}% · Difficulty: {2}',
      Number(summary.detections) || list.length, Math.round(Number(summary.confidence) || 0), summary.difficulty || '-');
    // The page's HTTP status ends the line, when the summary has one
    const status = Number.isInteger(summary.httpStatus) ? format('detectionHttpStatusFmt', 'HTTP status: {0}', summary.httpStatus) : '';
    lines.push(cell(status ? `${counts} · ${status}` : counts));
    lines.push('');
    if (list.length) {
      lines.push(`| ${[
        format('detectionMdColProtection', 'Protection'),
        format('detectionMdColCategory', 'Category'),
        format('detectionMdColConfidence', 'Confidence'),
        format('detectionMdColMethods', 'Found by')
      ].map(cell).join(' | ')} |`);
      lines.push('| --- | --- | ---: | --- |');
      for (const d of list) {
        const methods = Object.entries(d && d.methods && typeof d.methods === 'object' ? d.methods : {})
          .map(([type, n]) => (n > 1 ? `${type} ×${n}` : type)).join(', ');
        const confidence = typeof d?.confidence === 'number' ? `${Math.round(d.confidence)}%` : '-';
        lines.push(`| ${[d?.name || '?', d?.category || '-', confidence, methods || '-'].map(cell).join(' | ')} |`);
      }
      lines.push('');
    }
    const when = p.generatedAt ? String(p.generatedAt).slice(0, 10) : '';
    lines.push(`_${cell(format('detectionMdFooterFmt', 'Scanned with Scrapfly Antibot Detector on {0}', when))}_`);
    return lines.join('\n') + '\n';
};

/**
 * Replay kit input: the page, this browser's own headers (the popup runs in
 * the same browser) and every cookie the page sends, HttpOnly ones included.
 */
DetectionActions.replayInput = async function(pageUrl) {
    let cookies = [];
    try {
      if (!ReplayKit.pageUrl(pageUrl)) throw new Error('not a web page');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      cookies = await PageCookies.getAll({ url: ReplayKit.pageUrl(pageUrl) }, tab?.id);
    } catch (e) {
      // No cookies readable: the snippet still replays the headers
    }
    return {
      url: pageUrl,
      cookies,
      headers: ReplayKit.browserHeaders(typeof navigator !== 'undefined' ? navigator : {}),
      detections: DetectionActions.shownResults.call(this)
    };
};

/**
 * Copy menu (Detection tab): 'overview' (what Upload shares), 'markdown', 'oneline', 'json', or the replay kit's 'curl', 'python'
 * and 'node'. A summary of a list that the search and the chips leave empty is not copied (Upload refuses it too): the person is
 * told so, instead of getting an empty summary under the usual "Copied". The code kinds replay this browser's headers and the
 * page's cookies, not the list, so they stay allowed.
 */
DetectionActions.copyDetectionsAs = async function(kind, pageUrl) {
    if (kind === 'curl' || kind === 'python' || kind === 'node') {
      const input = await DetectionActions.replayInput.call(this, pageUrl);
      const code = ReplayKit[kind](input);
      if (!code) {
        NotificationHelper.warning(detectionActionsTr('detectionReplayNoPage', 'Open a web page to copy it as code'));
        return '';
      }
      await FormatUtils.copyToClipboard(code);
      return code;
    }
    if (DetectionActions.shownResults.call(this).length === 0) {
      NotificationHelper.warning(detectionActionsTr('historyNoResults', 'No entries match your search or filters.'));
      return '';
    }
    const { content, payload } = DetectionActions.buildDetectionsPasteContent.call(this, pageUrl);
    const text = kind === 'markdown'
      ? DetectionActions.buildDetectionsMarkdown(payload)
      : kind === 'oneline'
        ? DetectionSummary.oneLine(payload)
        : kind === 'json'
        ? `${JSON.stringify(payload, null, 2)}\n`
        : content;
    await FormatUtils.copyToClipboard(text.trim());
    return text;
};

/**
 * Upload the current detections to a keyless, unlisted paste and hand the
 * user a shareable link (copied to clipboard + opened in a new tab). Asks for
 * confirmation first, since the paste is publicly readable.
 */
// URL of the tab the popup reports on; '' when it cannot be read
DetectionActions.currentPageUrl = async function() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return (tab?.url || '').trim();
    } catch (e) {
      return '';
    }
};

// How long the chosen service keeps the upload, in the UI language
DetectionActions.describeShareExpiry = function(expiry) {
    const tr = detectionActionsTr;
    const fmt = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    const PASTEBIN = { '10M': ['shareExpire10M', '10 minutes'], '1H': ['shareExpire1H', '1 hour'], '1D': ['shareExpire1D', '1 day'],
      '1W': ['shareExpire1W', '1 week'], '2W': ['shareExpire2W', '2 weeks'], '1M': ['shareExpire1M', '1 month'],
      '6M': ['shareExpire6M', '6 months'], '1Y': ['shareExpire1Y', '1 year'] };
    const SECONDS = { 3600: ['shareExpire1H', '1 hour'], 86400: ['shareExpire1D', '1 day'],
      604800: ['shareExpire1W', '1 week'], 2592000: ['shareExpire30D', '30 days'] };
    switch (expiry?.kind) {
      case 'days': return fmt('shareExpiryDaysFmt', `deleted after ${expiry.days} days`, expiry.days);
      case 'seconds': {
        const [key, fallback] = SECONDS[expiry.seconds] || ['shareExpire30D', '30 days'];
        return fmt('shareExpiryAfterFmt', `deleted after ${fallback}`, tr(key, fallback));
      }
      case 'pastebin': {
        const [key, fallback] = PASTEBIN[expiry.code] || ['shareExpire1M', '1 month'];
        return fmt('shareExpiryAfterFmt', `deleted after ${fallback}`, tr(key, fallback));
      }
      case 'onetime': return tr('shareExpiryOnetime', 'deleted after the first view');
      case 'service': return tr('shareExpiryService', 'kept until the service removes it');
      default: return tr('shareExpiryNever', 'does not expire');
    }
};

/**
 * Upload the current detections with the service chosen in Settings →
 * Detection → Share uploads and hand the user a shareable link (copied to
 * clipboard + opened in a new tab). Asks for confirmation first, since anyone
 * with the link can read it.
 */
DetectionActions.uploadDetectionsToPaste = async function() {
    const btn = document.querySelector('#uploadPasteBtn');

    if (DetectionActions.shownResults.call(this).length === 0) {
      NotificationHelper.warning(detectionActionsTr('pasteNoDetectionsToast', 'No detections to upload'));
      return;
    }

    let shareSettings = {};
    try {
      shareSettings = (await Utils.getSettings())?.share || {};
    } catch (e) {
      shareSettings = {};
    }
    const target = ShareProviders.describe(shareSettings, (key, fallback) => FormatUtils.t(key, fallback));
    if (target.missing) {
      NotificationHelper.warning(FormatUtils.t('pasteNeedsSetupFmt',
        `Set up ${target.name} in Settings → Detection → Share uploads first`, target.name));
      return;
    }

    const confirmed = await NotificationHelper.confirm({
      title: detectionActionsTr('pasteConfirmTitle', 'Upload detections?'),
      message: FormatUtils.t('pasteConfirmMsgFmt',
        `This uploads a summary of this page’s detections to ${target.name} (${DetectionActions.describeShareExpiry(target.expiry)}). Anyone with the link can view it. The URL query string and cookie/header values are not included.`,
        target.name, DetectionActions.describeShareExpiry(target.expiry)),
      confirmText: detectionActionsTr('pasteConfirmBtn', 'Upload'),
      cancelText: detectionActionsTr('btnCancel', 'Cancel'),
      type: 'warning',
      tone: 'warning',
      emphasizeAction: true
    });
    if (!confirmed) return;

    if (btn) btn.disabled = true;

    try {
      const pageUrl = await DetectionActions.currentPageUrl();
      const { content } = DetectionActions.buildDetectionsPasteContent.call(this, pageUrl);
      // The link is checked against the service before it is copied or opened
      const pasteUrl = await ShareProviders.upload(content, shareSettings, {
        fetch: (...args) => fetch(...args),
        isUrlSafe: typeof SettingsRuntime !== 'undefined' ? SettingsRuntime._isWebhookUrlSafe : null
      });

      const copied = await FormatUtils.copyToClipboard(pasteUrl, {
        notify: false,
        useMicroToast: false
      });
      // The upload worked either way and its tab opens below; only the copy can have failed
      if (copied) {
        NotificationHelper.success(detectionActionsTr('pasteUploadSuccessToast', 'Link copied to clipboard'));
      } else {
        NotificationHelper.error(detectionActionsTr('clipboardCopyFailed', 'Failed to copy to clipboard'));
      }

      try {
        await chrome.tabs.create({ url: pasteUrl });
      } catch (openErr) {
        Logger.debug('UI', 'Could not open paste tab:', openErr);
      }
    } catch (error) {
      // Never log the request: it can carry the user's key or token
      Logger.error('UI', `Upload to ${target.name} failed: ${error?.code || 'network'} ${error?.code === 'provider' ? error.message : ''}`.trim());
      const detail = error?.code === 'auth'
        ? FormatUtils.t('pasteAuthFailedFmt', `${target.name} rejected the key or token (wrong or expired)`, target.name)
        : error?.code === 'permission'
          ? detectionActionsTr('pasteGistPermission', 'the GitHub token needs the Gists permission (Read and write)')
          : error?.code === 'unsafe-url'
        ? detectionActionsTr('pasteUnsafeUrl', 'The custom server must be an HTTPS address on a public host')
        : error?.code === 'bad-link'
          ? detectionActionsTr('pasteBadLink', 'the service did not return a valid HTTPS link')
          : (error?.code === 'provider' || error?.code === 'http') ? error.message : '';
      NotificationHelper.error(detail
        ? FormatUtils.t('pasteUploadFailedFmt', `Upload failed: ${detail}`, detail)
        : detectionActionsTr('pasteUploadFailedToast', 'Upload failed'));
    } finally {
      if (btn) btn.disabled = false;
    }
};

if (typeof self !== 'undefined') {
    self.DetectionActions = DetectionActions;
}
