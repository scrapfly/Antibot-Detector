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
        type: 'DETECTION_CLEAR_CACHE',
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
      this.showEmptyState();
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

      settings.detection.blacklistedDomains.push(domain);

      const saved = typeof StorageManager !== 'undefined' && typeof StorageManager.saveSettings === 'function'
        ? await StorageManager.saveSettings(settings)
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

      if (settings.detection?.blacklistedDomains) {
        settings.detection.blacklistedDomains = settings.detection.blacklistedDomains.filter(d => d !== domain);

        const saved = typeof StorageManager !== 'undefined' && typeof StorageManager.saveSettings === 'function'
          ? await StorageManager.saveSettings(settings)
          : false;
        if (!saved) {
          throw new Error(detectionActionsTr('failedReadSettings', 'Could not save settings'));
        }

        this.blacklistedDomain = null;
        NotificationHelper.success(detectionActionsFormat(
          'removedFromBlacklistFmt',
          'Removed "{0}" from blacklist',
          domain
        ));

        const blacklistWarning = document.querySelector('#blacklistWarning');
        if (blacklistWarning) blacklistWarning.style.display = 'none';

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          setPausedIcon(tab.id, false);
          this.showAnalyzingState();

          chrome.runtime.sendMessage(
            { type: 'GET_DETECTION_DATA', tabId: tab.id },
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
    if (this.debugMode) Logger.debug('UI', 'Refreshing detection analysis...');

    try {
      this.showAnalyzingState();

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      chrome.runtime.sendMessage(
        { type: 'REQUEST_DETECTION', tabId: tab.id },
        (response) => {
          if (chrome.runtime.lastError) {
            Logger.error('UI', 'Detection: Error requesting fresh detection:', chrome.runtime.lastError);
            this.hideLoadingState();
            this.showEmptyState();
            return;
          }

          if (this.debugMode) Logger.debug('UI', 'Detection: Fresh detection requested:', response);

          setTimeout(() => {
            chrome.runtime.sendMessage(
              { type: 'GET_DETECTION_DATA', tabId: tab.id },
              async (dataResponse) => {
                if (chrome.runtime.lastError) {
                  Logger.error('UI', 'Detection: Error getting detection data:', chrome.runtime.lastError);
                  this.hideLoadingState();
                  this.showEmptyState();
                  return;
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
                  this.showEmptyState();
                }
              }
            );
          }, 2000);
        }
      );

    } catch (error) {
      Logger.error('UI', 'Failed to refresh analysis:', error);
      this.hideLoadingState();
      this.showEmptyState();
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
      return `${u.origin}${u.pathname}`;
    } catch {
      return null;
    }
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
    return { content, count: detections.length };
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
