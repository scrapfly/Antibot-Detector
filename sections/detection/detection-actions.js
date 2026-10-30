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
    let originalText = '';

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

      if (clearCacheBtn) {
        const textSpan = clearCacheBtn.querySelector('span');
        if (textSpan) {
          originalText = textSpan.textContent;
          textSpan.textContent = detectionActionsTr('clearingMsg', 'Clearing...');
        }
        clearCacheBtn.disabled = true;
      }

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
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

      await chrome.runtime.sendMessage({
        type: WorkerMessages.DETECTION_CLEAR_CACHE,
        url: url,
        tabId: tabs[0].id
      });

      if (clearCacheBtn) {
        const textSpan = clearCacheBtn.querySelector('span');
        if (textSpan) {
          textSpan.textContent = detectionActionsTr('clearedSuccessMsg', '✓ Cleared!');
        }
      }

      NotificationHelper.success(detectionActionsTr('cacheClearedToast', 'Cache cleared'));

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
      this.justClearedCache = true;
      this.showEmptyState({ outcome: 'unscanned' });
    } catch (error) {
      Logger.error('UI', 'Failed to clear cache:', error);
      NotificationHelper.error(detectionActionsTr('failedToClearCacheToast', 'Failed to clear cache'));

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
        textSpan.textContent = detectionActionsTr('detectionTitleClearCache', 'Clear Cache');
      }
      clearCacheBtn.disabled = false;
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
          this.showAnalyzingState();

          chrome.runtime.sendMessage(
            { type: WorkerMessages.GET_DETECTION_DATA, tabId: tab.id },
            async (response) => {
              if (chrome.runtime.lastError) {
                Logger.error('UI', 'Detection: Error getting cached data:', chrome.runtime.lastError);
                this.refreshAnalysis();
                return;
              }

              if (response && response.data) {
                if (this.debugMode) Logger.debug('UI', 'Detection: Using cached data after blacklist removal');
                await Detection.processDetectionData({
                  detection: this,
                  detectionEngine: this.detectionEngine,
                  detectorManager: this.detectorManager
                }, response.data);
                const detections = this.currentResults;

                if (detections.length > 0) {
                  chrome.action.setBadgeText({ text: detections.length.toString(), tabId: tab.id }).catch((error) => {
                    if (this.debugMode) Logger.debug('UI', 'Failed to update badge after blacklist removal:', error.message);
                  });
                  const badgeColors = await CategoryManager.getBadgeColors();
                  const color = DetectionUtils.getBadgeColor(detections, badgeColors);
                  await setBadgeTextColor(tab.id, false, color);
                  chrome.action.setBadgeBackgroundColor({ color: color, tabId: tab.id }).catch((error) => {
                    if (this.debugMode) Logger.debug('UI', 'Failed to set badge color:', error.message);
                  });
                }
              } else {
                if (this.debugMode) Logger.debug('UI', 'Detection: No cached data, requesting fresh detection');
                this.refreshAnalysis();
              }
            }
          );
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
 * Build the paste body: the Scrapfly banner, a blank line, then the
 * detections serialized as pretty JSON. Emits only non-sensitive metadata —
 * never raw cookie/header values (those live in match.value).
 * @param {string} [pageUrl] the page the user is on (DetectionActions.currentPageUrl)
 * @returns {{ content: string, count: number }}
 */
DetectionActions.buildDetectionsPasteContent = function(pageUrl) {
    const detections = Array.isArray(this.currentResults) ? this.currentResults : [];

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

    const payload = {
      source: 'Scrapfly.io',
      url: safeUrl || host || null,
      host: host || null,
      generatedAt: new Date().toISOString(),
      summary: {
        detections: detections.length,
        confidence: avgConfidence,
        difficulty
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
    lines.push(cell(format('detectionMdSummaryFmt', 'Detections: {0} · Confidence: {1}% · Difficulty: {2}',
      Number(summary.detections) || list.length, Math.round(Number(summary.confidence) || 0), summary.difficulty || '-')));
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
      detections: Array.isArray(this.currentResults) ? this.currentResults : []
    };
};

/** Copy menu (Detection tab): 'overview' (what Upload shares), 'markdown', 'json', or the replay kit's 'curl', 'python' and 'node'. */
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
    const { content, payload } = DetectionActions.buildDetectionsPasteContent.call(this, pageUrl);
    const text = kind === 'markdown'
      ? DetectionActions.buildDetectionsMarkdown(payload)
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

    if (!Array.isArray(this.currentResults) || this.currentResults.length === 0) {
      NotificationHelper.warning(detectionActionsTr('pasteNoDetectionsToast', 'No detections to upload'));
      return;
    }

    let shareSettings = {};
    try {
      shareSettings = (await Utils.getSettings())?.share || {};
    } catch (e) {
      shareSettings = {};
    }
    const target = ShareProviders.describe(shareSettings);
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

      await FormatUtils.copyToClipboard(pasteUrl, {
        notify: false,
        useMicroToast: false
      });
      NotificationHelper.success(detectionActionsTr('pasteUploadSuccessToast', 'Link copied to clipboard'));

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
