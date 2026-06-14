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
    this.setExtensionEnabled(true);
    this.hideLoadingState();

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
      const settings = await Utils.getSettings();

      if (settings.detection?.blacklistedDomains) {
        settings.detection.blacklistedDomains = settings.detection.blacklistedDomains.filter(d => d !== domain);

        const saved = typeof StorageManager !== 'undefined' && typeof StorageManager.saveSettings === 'function'
          ? await StorageManager.saveSettings(settings)
          : false;
        if (!saved) {
          throw new Error(detectionActionsTr('failedReadSettings', 'Could not save settings'));
        }

        NotificationHelper.success(detectionActionsFormat(
          'removedFromBlacklistFmt',
          'Removed "{0}" from blacklist',
          domain
        ));

        const blacklistWarning = document.querySelector('#blacklistWarning');
        if (blacklistWarning) blacklistWarning.style.display = 'none';

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
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
                if (this.debugMode) Logger.ui('Detection: Using cached data after blacklist removal');
                this.detectionEngine.setDetectors(this.detectorManager.getAllDetectors());
                const detections = this.detectionEngine.detectOnPage(response.data);
                this.displayResults(detections);

                if (detections.length > 0) {
                  chrome.action.setBadgeText({ text: detections.length.toString(), tabId: tab.id }).catch((error) => {
                    if (this.debugMode) Logger.ui('Failed to update badge after blacklist removal:', error.message);
                  });
                  const color = getBadgeColorForCount(detections.length);
                  chrome.action.setBadgeBackgroundColor({ color: color, tabId: tab.id }).catch((error) => {
                    if (this.debugMode) Logger.ui('Failed to set badge color:', error.message);
                  });
                }
              } else {
                if (this.debugMode) Logger.ui('Detection: No cached data, requesting fresh detection');
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
    if (this.debugMode) Logger.ui('Refreshing detection analysis...');

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

          if (this.debugMode) Logger.ui('Detection: Fresh detection requested:', response);

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
                  this.detectionEngine.setDetectors(this.detectorManager.getAllDetectors());
                  const detections = this.detectionEngine.detectOnPage(dataResponse.data);
                  if (this.debugMode) Logger.ui(`Detection: Found ${detections.length} detections after refresh`);

                  this.displayResults(detections);
                } else {
                  if (this.debugMode) Logger.ui('Detection: No data received after refresh');
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

// Keyless, unlisted paste endpoint — no API key, link-only (anyone with the URL).
DetectionActions.PASTE_ENDPOINT = 'https://dpaste.com/api/v2/';
DetectionActions.PASTE_BANNER = [
  '============================================',
  'Made by Scrapfly.io',
  '============================================'
].join('\n');

// Host the paste URL must belong to before we ever hand it to the browser.
DetectionActions.PASTE_URL_PREFIX = 'https://dpaste.com/';

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
 * @returns {{ content: string, count: number }}
 */
DetectionActions.buildDetectionsPasteContent = function() {
    const detections = Array.isArray(this.currentResults) ? this.currentResults : [];

    const siteUrlNode = document.querySelector('#siteUrl');
    const rawUrl = (this.cacheMetadata?.url || siteUrlNode?.title || '').trim();
    const host = (siteUrlNode?.textContent || '').trim();
    const safeUrl = DetectionActions._sanitizeUrlForPaste(rawUrl);

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
DetectionActions.uploadDetectionsToPaste = async function() {
    const btn = document.querySelector('#uploadPasteBtn');

    if (!Array.isArray(this.currentResults) || this.currentResults.length === 0) {
      NotificationHelper.warning(detectionActionsTr('pasteNoDetectionsToast', 'No detections to upload'));
      return;
    }

    const confirmed = await NotificationHelper.confirm({
      title: detectionActionsTr('pasteConfirmTitle', 'Upload detections?'),
      message: detectionActionsTr('pasteConfirmMsg', 'This uploads a summary of this page’s detections to a public paste (dpaste.com, unlisted, expires in 30 days). Anyone with the link can view it. The URL query string and cookie/header values are not included.'),
      confirmText: detectionActionsTr('pasteConfirmBtn', 'Upload'),
      cancelText: detectionActionsTr('btnCancel', 'Cancel'),
      type: 'warning',
      emphasizeAction: true
    });
    if (!confirmed) return;

    if (btn) btn.disabled = true;

    try {
      const { content } = DetectionActions.buildDetectionsPasteContent.call(this);

      const body = new URLSearchParams();
      body.set('content', content);
      body.set('syntax', 'json');
      body.set('title', 'Scrapfly detections');
      body.set('expiry_days', '30');

      const resp = await fetch(DetectionActions.PASTE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer'
      });

      if (!resp.ok) {
        throw new Error(`Paste service responded ${resp.status}`);
      }

      // dpaste returns the snippet URL in the body (sometimes quoted); the
      // Location header is the fallback.
      const raw = (await resp.text()).trim().replace(/^["']|["']$/g, '');
      const fromBody = /^https?:\/\//i.test(raw) ? raw : '';
      const pasteUrl = fromBody || (resp.headers.get('Location') || '');

      // Pin to the known paste host before opening — never hand an arbitrary
      // network-returned URL to chrome.tabs.create.
      if (pasteUrl.slice(0, DetectionActions.PASTE_URL_PREFIX.length).toLowerCase() !== DetectionActions.PASTE_URL_PREFIX) {
        throw new Error('Paste service returned an unexpected URL');
      }

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
      Logger.error('UI', 'Failed to upload detections to paste:', error);
      NotificationHelper.error(detectionActionsTr('pasteUploadFailedToast', 'Upload failed'));
    } finally {
      if (btn) btn.disabled = false;
    }
};

if (typeof self !== 'undefined') {
    self.DetectionActions = DetectionActions;
}
