/**
 * Detection UI rendering/state methods.
 * Dependencies: `Detection` class must be loaded first.
 */
const DetectionUI = (typeof self !== 'undefined' && self.DetectionUI) ? self.DetectionUI : {};

// Late cache responses and progress events must preserve a disabled view.
DetectionUI.showUnavailableState = function() {
    if (!this.isExtensionEnabled) {
      this.showDisabledState();
      return true;
    }
    if (this.blacklistedDomain) {
      this.showBlacklistState(this.blacklistedDomain);
      return true;
    }
    return false;
};

/** Category icons on the scanning screen ("Anti-bot · Captcha · Fingerprint"), in each category's colour. */
DetectionUI.paintScanIcons = function() {
    if (typeof document === 'undefined' || typeof FormatUtils === 'undefined') return;
    document.querySelectorAll('[data-scan-icon]').forEach((el) => {
      const key = el.dataset.scanIcon;
      if (!el.firstChild) el.innerHTML = FormatUtils.categoryIconSvg(key);
      el.style.color = DetectionUI.categoryColor.call(this, key);
    });
};

DetectionUI.showLoadingState = function(message = 'Analyzing page…') {
    if (DetectionUI.showUnavailableState.call(this)) return;
    DetectionUI.paintScanIcons.call(this);
    this.isShowingResults = false;
    if (this.uiStateMachine) {
      if (this.uiStateMachine.getState() !== this.uiStates.ANALYZING) {
        this.uiStateMachine.setState(this.uiStates.LOADING, { message });
      }
    }
    const loadingState = document.querySelector('#loadingState');
    const emptyState = document.querySelector('#emptyState');
    const detectionResults = document.querySelector('#detectionResults');
    const disabledState = document.querySelector('#disabledState');
    const blacklistWarning = document.querySelector('#blacklistWarning');
    const interruptedState = document.querySelector('#interruptedState');
    const detectionPagination = document.querySelector('#detectionPagination');

    if (loadingState) {
      loadingState.style.display = 'flex';
    }
    if (emptyState) emptyState.style.display = 'none';
    if (detectionResults) detectionResults.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';
    if (blacklistWarning) blacklistWarning.style.display = 'none';
    if (interruptedState) interruptedState.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';
};

// Arm the stuck-detection timeout for the analyzing state
DetectionUI.startAnalysisProgress = function() {
    this.clearLoadingTimeout();
    this.loadingTimeout = setTimeout(() => {
      this.handleLoadingTimeout();
    }, this.loadingTimeoutDuration);
};

DetectionUI.handleLoadingTimeout = function() {
    if (this.debugMode) Logger.debug('UI', '[Detection] Loading timeout reached - checking if detection completed');

    if (this.isShowingResults && this.currentResults?.length > 0) {
      this.loadingTimeout = null;
      return;
    }

    // Clear the timeout itself
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }

    // Check if we're still in loading state
    const loadingState = document.querySelector('#loadingState');
    if (loadingState && loadingState.style.display !== 'none') {
      // Check if detection completed before showing interrupted state
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          if (this.viewedTabId !== null && tabs[0].id !== this.viewedTabId) {
            return;
          }

          chrome.runtime.sendMessage(
            { type: 'GET_DETECTION_DATA', tabId: tabs[0].id },
            async (response) => {
              if (chrome.runtime.lastError) {
                if (this.debugMode) Logger.debug('UI', '[Detection] Error checking for results:', chrome.runtime.lastError);
                if (!this.isShowingResults || this.currentResults.length === 0) {
                  this.showEmptyState({ outcome: 'interrupted' });
                }
                return;
              }

              if (Array.isArray(response?.data?.detectionResults)) {
                // Detection completed! Show results instead of interrupted state
                if (this.debugMode) Logger.debug('UI', '[Detection] Timeout but results exist - showing results instead of interrupted state');
                // The tab's own engine and detectors, as every other caller
                // passes (there are no window.detectionEngine / detectorManager)
                await Detection.processDetectionData(
                  {
                    detection: this,
                    detectionEngine: this.detectionEngine,
                    detectorManager: this.detectorManager,
                    history: this.history
                  },
                  response.data
                );
              } else if (response?.status === 'pending') {
                if (!this.wasInterrupted && !this.isShowingResults) {
                  this.showAnalyzingState();
                }
              } else {
                // Check badge before showing interrupted - numeric means detection is complete
                const badgeStatus = await Detection.getBadgeStatus(tabs[0].id);
                const isNumericBadge = /^\d+\+?$/.test(badgeStatus.trimmed);

                if (isNumericBadge) {
                  // Badge shows completion but no data yet - retry instead of showing interrupted
                  if (this.debugMode) Logger.debug('UI', '[Detection] Timeout but badge shows completion - retrying fetch');
                  await this.refreshAnalysis();
                } else {
                  // Truly stuck/no data - normalize to empty state
                  if (this.debugMode) Logger.debug('UI', '[Detection] Timeout with no results - showing empty state');
                  if (!this.isShowingResults || this.currentResults.length === 0) {
                    this.showEmptyState({ outcome: 'interrupted' });
                  }
                }
              }
            }
          );
        } else {
          // No tab found - normalize to empty state
          if (!this.isShowingResults || this.currentResults.length === 0) {
            this.showEmptyState({ outcome: 'interrupted' });
          }
        }
      });
    }
};

DetectionUI.clearLoadingTimeout = function() {
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
};

DetectionUI.hideLoadingState = function() {
    this.clearLoadingTimeout(); // Clear timeout when loading completes
    this.isShowingAnalyzing = false; // Reset flag when hiding analyzing state
    const loadingState = document.querySelector('#loadingState');
    if (loadingState) loadingState.style.display = 'none';
};

DetectionUI.showAnalyzingState = function(message = 'Analyzing page…') {
    if (!this.isExtensionEnabled || this.blacklistedDomain) {
      return;
    }

    // Prevent re-render flicker only when the scan card is really on screen.
    // The flag alone can be stale: progress can arrive before detection.html
    // is injected, and loadHTML() replaces the DOM with every state hidden.
    const loadingState = document.querySelector('#loadingState');
    const loadingVisible = !!loadingState && loadingState.style.display !== 'none';
    if (this.isShowingAnalyzing && loadingVisible) {
      if (this.debugMode) Logger.debug('UI', 'Detection: Already showing analyzing state, skipping re-render');
      return;
    }

    if (this.uiStateMachine) {
      this.uiStateMachine.setState(this.uiStates.ANALYZING, { message });
    }
    this.wasInterrupted = false; // Reset flag when starting new analysis
    this.isShowingAnalyzing = !!loadingState; // Only true once the scan card exists
    this.showLoadingState(message);
    this.startAnalysisProgress();
};

DetectionUI.applyEmptyStateCopy = function(options = {}) {
    const tr = (key, fallback) => (
      typeof I18n !== 'undefined' ? I18n.tr(key, fallback) : fallback
    );

    const emptyStateTitle = document.querySelector('#emptyState .state-card-title');
    const emptyStateText = document.querySelector('#emptyState .state-card-description');

    if (emptyStateTitle) {
      if (options.title) {
        emptyStateTitle.textContent = options.title;
        emptyStateTitle.removeAttribute('data-i18n');
      } else {
        const titleKey = options.outcome === 'failed' ? 'detectionFailedTitle'
          : options.outcome === 'interrupted' ? 'detectionInterruptedTitle'
          : options.noCache ? 'detectionUnscannedTitle' : 'detectionEmptyTitle';
        const titleFallback = options.outcome === 'failed' ? 'Scan failed'
          : options.outcome === 'interrupted' ? 'Scan interrupted'
          : options.noCache ? 'No completed scan' : 'Nothing Detected';
        emptyStateTitle.setAttribute('data-i18n', titleKey);
        emptyStateTitle.textContent = tr(titleKey, titleFallback);
      }
    }

    if (emptyStateText) {
      if (options.description) {
        emptyStateText.textContent = options.description;
        emptyStateText.removeAttribute('data-i18n');
      } else {
        const descKey = options.outcome === 'failed' || options.outcome === 'interrupted'
          ? 'detectionRetryScanDesc' : options.noCache ? 'detectionNoCachedDataDesc' : 'detectionNoDetectionsDesc';
        const descFallback = options.outcome === 'failed' || options.outcome === 'interrupted'
          ? 'The scan did not finish. Reload the page to try again.' : options.noCache
          ? 'No cached detection data is available for this page. Reload the page to run a fresh scan.'
          : 'No matching antibot, CAPTCHA, or fingerprinting signals were found on this page.';
        emptyStateText.setAttribute('data-i18n', descKey);
        emptyStateText.textContent = tr(descKey, descFallback);
      }
    }
};

DetectionUI.applyDisabledStateCopy = function() {
    const tr = (key, fallback) => (
      typeof I18n !== 'undefined' ? I18n.tr(key, fallback) : fallback
    );
    const root = document.querySelector('#disabledState');
    if (!root) return;

    const title = root.querySelector('.state-card-title');
    const desc = root.querySelector('.state-card-description');
    const action = root.querySelector('.state-card-action');
    const blacklistBtn = root.querySelector('#disabledBlacklistBtn');

    if (title) {
      title.setAttribute('data-i18n', 'detectionDisabledTitle');
      title.textContent = tr('detectionDisabledTitle', 'Detection Disabled');
    }
    if (desc) {
      desc.setAttribute('data-i18n', 'detectionDisabledDesc');
      desc.textContent = tr('detectionDisabledDesc', 'Security detection is currently turned off.');
    }
    if (action) {
      action.setAttribute('data-i18n', 'detectionDisabledAction');
      action.textContent = tr('detectionDisabledAction', 'Toggle the switch at the top to enable detection.');
    }
    if (blacklistBtn) {
      blacklistBtn.setAttribute('data-i18n-title', 'detectionDomainBlacklistedTitle');
      const titleText = tr('detectionDomainBlacklistedTitle', 'This domain is blacklisted');
      blacklistBtn.setAttribute('title', titleText);
    }
};

DetectionUI.showEmptyState = function(options = {}) {
    if (DetectionUI.showUnavailableState.call(this)) return;

    if (options.outcome) options = { ...options, noCache: true, showBadges: false };
    this.scanOutcome = options.outcome || (options.noCache ? 'unscanned' : 'complete');
    if (this.uiStateMachine) {
      this.uiStateMachine.setState(this.uiStates.EMPTY);
    }
    this.wasInterrupted = options.outcome === 'interrupted';
    this.isShowingResults = false;
    this.hideLoadingState();
    this.clearLoadingTimeout(); // Clear timeout when showing empty state

    // Clear stale state to prevent re-rendering old data on tab switch
    this.currentResults = [];
    this.cacheMetadata = null;

    // Reset clear cache button to default state
    this.resetClearCacheButton();

    if (!options.noCache) this.clearBadgeForEmptyState();

    const emptyState = document.querySelector('#emptyState');
    const emptyStateIcon = emptyState?.querySelector('.state-card-logo');
    const emptyStateFooter = emptyState?.querySelector('.state-card-badges');
    const detectionResults = document.querySelector('#detectionResults');
    const disabledState = document.querySelector('#disabledState');
    const blacklistWarning = document.querySelector('#blacklistWarning');
    const detectionPagination = document.querySelector('#detectionPagination');
    const interruptedState = document.querySelector('#interruptedState');

    if (emptyStateIcon) {
      emptyStateIcon.src = chrome.runtime.getURL('icons/icon128.png');
      emptyStateIcon.alt = 'Scrapfly';
    }

    DetectionUI.applyEmptyStateCopy.call(this, options);

    if (emptyStateFooter) {
      emptyStateFooter.style.display = options.showBadges === false ? 'none' : 'flex';
    }

    // No cached scan: neutral (blue, no check badge) instead of the green all-clear
    emptyState?.querySelector('.state-card')?.classList.toggle('state-card--pending', !!options.noCache);

    if (emptyState) emptyState.style.display = 'flex';
    if (detectionResults) detectionResults.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';
    if (blacklistWarning) blacklistWarning.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';
    if (interruptedState) interruptedState.style.display = 'none';
};

DetectionUI.showDisabledState = function(isBlacklisted = !!this.blacklistedDomain) {
    this.setExtensionEnabled(false);

    if (this.uiStateMachine) {
      this.uiStateMachine.setState(this.uiStates.DISABLED, { isBlacklisted });
    }
    this.wasInterrupted = false; // Reset flag when showing disabled state
    this.isShowingResults = false;
    this.currentResults = [];
    this.cacheMetadata = null;
    this.displayOptions = {};
    this.closeDetectionModal();
    this.hideLoadingState();
    this.clearLoadingTimeout(); // Clear timeout when showing disabled state
    const disabledState = document.querySelector('#disabledState');
    const blacklistWarning = document.querySelector('#blacklistWarning');
    const emptyState = document.querySelector('#emptyState');
    const detectionResults = document.querySelector('#detectionResults');
    const detectionPagination = document.querySelector('#detectionPagination');
    const interruptedState = document.querySelector('#interruptedState');
    const disabledBlacklistBtn = document.querySelector('#disabledBlacklistBtn');

    if (disabledState) disabledState.style.display = 'flex';
    if (blacklistWarning) blacklistWarning.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (detectionResults) detectionResults.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';
    if (interruptedState) interruptedState.style.display = 'none';

    if (disabledBlacklistBtn) {
      disabledBlacklistBtn.classList.toggle('visible', isBlacklisted);
      disabledBlacklistBtn.hidden = !isBlacklisted;
      disabledBlacklistBtn.setAttribute('aria-hidden', isBlacklisted ? 'false' : 'true');
    }

    DetectionUI.applyDisabledStateCopy.call(this);
};

DetectionUI.displayResults = async function(detections = [], options = {}) {
    if (DetectionUI.showUnavailableState.call(this)) return;

    if (this.debugMode) Logger.debug('UI', 'Detection.displayResults called with:', detections, options);
    // Ensure HTML is loaded
    if (!this.initialized) {
      await this.initialize();
    }

    if (DetectionUI.showUnavailableState.call(this)) return;
    if (this.uiStateMachine) {
      this.uiStateMachine.setState(this.uiStates.RESULTS, { count: detections?.length || 0 });
    }

    this.wasInterrupted = false; // Reset flag when successfully displaying results
    this.isShowingResults = true; // Prevent message listeners from overriding displayed results
    this.currentResults = detections;
    this.displayOptions = options;
    this.cacheMetadata = options.cacheMetadata || null;
    if (this.debugMode) {
      Logger.debug('UI', '[DEBUG Detection] currentResults stored:', this.currentResults.length, 'detections');
    }

    // Notify Advanced section that detection data is ready (fixes timing race condition)
    if (this.advancedSection && typeof this.advancedSection.onDetectionDataReady === 'function') {
      Logger.debug('UI', '[Detection] Notifying Advanced section of detection data');
      this.advancedSection.onDetectionDataReady(detections);
    }

    this.clearLoadingTimeout();

    this.hideLoadingState();
    this.closeDetectionModal();

    // Reset clear cache button to default state
    this.resetClearCacheButton();

    const detectionResults = document.querySelector('#detectionResults');
    const emptyState = document.querySelector('#emptyState');
    const disabledState = document.querySelector('#disabledState');
    const blacklistWarning = document.querySelector('#blacklistWarning');
    const interruptedState = document.querySelector('#interruptedState');

    // Check if cache is expired - don't show stale data
    if (options.fromStorage && options.cacheMetadata?.expiry) {
      const isExpired = Date.now() > options.cacheMetadata.expiry;
      if (isExpired) {
        Logger.debug('UI', '[Detection] Cache expired, showing empty state instead of stale data');
        this.showEmptyState({ outcome: 'unscanned' });
        return;
      }
    }

    if (detections.length === 0) {
      this.showEmptyState();
      // Badge is managed by background script now
      return;
    }

    // Show results container
    if (detectionResults) detectionResults.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';
    if (blacklistWarning) blacklistWarning.style.display = 'none';
    if (interruptedState) interruptedState.style.display = 'none';

    // Update URL display
    this.updateUrlDisplay(options);

    // Update stats
    this.updateStats(detections);

    // Filter items if search query exists
    let itemsToShow = this.searchQuery
      ? this.getFilteredResults()
      : detections;

    // Sort items by category priority before displaying
    itemsToShow = this.sortDetectionsByCategory(itemsToShow);

    // Use pagination to display results
    // PaginationManager will handle showing/hiding pagination based on whether it's needed
    if (this.paginationManager) {
      this.paginationManager.setItems(itemsToShow);
    }

    // Show overview if there are detections
    const detectionOverview = document.querySelector('#detectionOverview');
    if (detectionOverview && detections.length > 0) {
      detectionOverview.style.display = 'block';
    }

    // Update cache info
    this.updateCacheInfo();

    // Update badge for cached results (background only updates during active detection)
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        const detectionCount = detections.length;

        // Get badge colors from CategoryManager
        const badgeColors = await CategoryManager.getBadgeColors();
        if (!this.isShowingResults || !this.isExtensionEnabled || this.blacklistedDomain) return;

        // Badge color should match the UI difficulty (not raw detection count)
        const count = detectionCount.toString();
        const color = DetectionUtils.getBadgeColor(detections, badgeColors);

        // Update badge text and color
        await setBadgeTextColor(tabs[0].id, false, color);
        await chrome.action.setBadgeText({ text: count, tabId: tabs[0].id });
        await chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabs[0].id });

        if (this.debugMode) {
          Logger.debug('UI', `[Detection] Badge updated to ${count} with color ${color}`);
        }
      }
    } catch (error) {
      if (this.debugMode) {
        Logger.debug('UI', '[Detection] Could not update badge:', error);
      }
    }
};

DetectionUI.updateStats = function(detections) {
    const detectionsCount = document.querySelector('#detectionsCount');
    const overallConfidence = document.querySelector('#overallConfidence');
    const difficultyLevel = document.querySelector('#difficultyLevel');

    const totalDetections = detections.length;
    const avgConfidence = totalDetections > 0
      ? Math.round(detections.reduce((sum, d) => sum + (d.confidence || 0), 0) / totalDetections)
      : 0;

    // Determine difficulty level based on detections mix + confidence
    const { difficulty } = this.getDifficultyInfo(detections, avgConfidence);

    // Update UI elements
    // Difficulty is computed as Low/Medium/High; show it in the UI language
    const difficultyKeyByValue = { Low: 'difficultyLow', Medium: 'difficultyMedium', High: 'difficultyHigh' };
    const difficultyText = (typeof I18n !== 'undefined' && difficultyKeyByValue[difficulty])
      ? I18n.tr(difficultyKeyByValue[difficulty], difficulty)
      : difficulty;

    if (detectionsCount) detectionsCount.textContent = totalDetections;
    const confidenceTone = FormatUtils.confidenceTone(avgConfidence);
    const toneClasses = ['tone-green', 'tone-amber', 'tone-red'];
    if (overallConfidence) {
      overallConfidence.textContent = `${avgConfidence}%`;
      overallConfidence.classList.remove(...toneClasses);
      if (totalDetections > 0) overallConfidence.classList.add(`tone-${confidenceTone}`);
    }
    const confidenceIcon = document.querySelector('.overall-confidence .stat-icon-inline');
    if (confidenceIcon) {
      confidenceIcon.classList.remove(...toneClasses);
      if (totalDetections > 0) confidenceIcon.classList.add(`tone-${confidenceTone}`);
    }
    // Difficulty uses the History tones too: High red, Medium amber, Low green
    const difficultyTone = { High: 'red', Medium: 'amber', Low: 'green' }[difficulty] || 'green';
    if (difficultyLevel) {
      difficultyLevel.textContent = difficultyText;
      difficultyLevel.style.color = '';
      difficultyLevel.classList.remove(...toneClasses);
      difficultyLevel.classList.add(`tone-${difficultyTone}`);
    }
    const difficultyIcon = document.querySelector('#difficultyIcon');
    if (difficultyIcon) {
      difficultyIcon.classList.remove(...toneClasses);
      difficultyIcon.classList.add(`tone-${difficultyTone}`);
    }

    // Hover breakdowns on the three tiles, the same ones History shows
    const tile = (element) => element && element.closest('.stat-inline');
    if (totalDetections > 0) {
      const t = (key, fallback) => (typeof I18n !== 'undefined' ? I18n.tr(key, fallback) : fallback);
      const detectionsTip = FormatUtils.detectionsTip(detections, t('statDetections', 'Detections'));
      const confidenceTip = FormatUtils.confidenceTip(detections, `${t('statConfidence', 'Confidence')}: ${avgConfidence}%`);
      const difficultyTip = FormatUtils.difficultyTip(detections, difficulty, `${t('statDifficulty', 'Difficulty')}: ${difficultyText}`);
      FormatUtils.setTip(tile(detectionsCount), detectionsTip.title, detectionsTip.detail, detectionsTip.rows);
      FormatUtils.setTip(tile(overallConfidence), confidenceTip.title, confidenceTip.detail, confidenceTip.rows);
      FormatUtils.setTip(tile(difficultyLevel), difficultyTip.title, difficultyTip.detail, difficultyTip.rows);
    } else {
      // No detections: the tiles keep their one-line explanations
      const t = (key, fallback) => (typeof I18n !== 'undefined' ? I18n.tr(key, fallback) : fallback);
      FormatUtils.setTip(tile(detectionsCount), t('detectionTipDetections', 'Number of protections detected on this page.'));
      FormatUtils.setTip(tile(overallConfidence), t('detectionTipConfidence', 'Average confidence across detected protections.'));
      FormatUtils.setTip(tile(difficultyLevel), t('detectionTipDifficulty', 'Estimated difficulty of bypassing the detected protections.'));
    }

};

DetectionUI.updateUrlDisplay = function(options = {}) {
    const siteFavicon = document.querySelector('#siteFavicon');
    const siteUrl = document.querySelector('#siteUrl');

    if (!siteFavicon || !siteUrl) {
      return;
    }

    // An icon that fails to load shows the extension logo instead
    siteFavicon.onerror = () => {
      siteFavicon.onerror = null;
      siteFavicon.src = UrlUtils.getDefaultFaviconUrl();
    };

    // Try to get URL from various sources
    let url = '';
    let favicon = '';

    if (options.cacheMetadata) {
      url = options.cacheMetadata.url || '';
      favicon = options.cacheMetadata.favicon || '';
    }

    // If no URL yet, try to get from current tab
    if (!url) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          url = tabs[0].url || '';
          favicon = tabs[0].favIconUrl || '';

          // Update display
          if (url) {
            try {
              const urlObj = new URL(url);
              siteUrl.textContent = urlObj.hostname;
              siteUrl.title = url;
              this.setCopyableValue(siteUrl, url, 'URL');
            } catch (e) {
              siteUrl.textContent = url;
              siteUrl.title = url;
              this.setCopyableValue(siteUrl, url, 'URL');
            }
          }

          if (favicon) {
            siteFavicon.src = favicon;
          }
        }
      });
    } else {
      // We have URL from cache metadata
      try {
        const urlObj = new URL(url);
        siteUrl.textContent = urlObj.hostname;
        siteUrl.title = url;
        this.setCopyableValue(siteUrl, url, 'URL');
      } catch (e) {
        siteUrl.textContent = url;
        siteUrl.title = url;
        this.setCopyableValue(siteUrl, url, 'URL');
      }

      // Set favicon if available
      if (favicon) {
        siteFavicon.src = favicon;
      } else {
        // Try to get favicon from Chrome tab API as fallback
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].favIconUrl) {
            siteFavicon.src = tabs[0].favIconUrl;
          } else {
            // Try to use default favicon.ico from the domain
            try {
              const urlObj = new URL(url);
              siteFavicon.src = `${urlObj.origin}/favicon.ico`;
            } catch (e) {
              // Use default icon
              siteFavicon.src = UrlUtils.getDefaultFaviconUrl();
            }
          }
        });
      }
    }
};

DetectionUI.updateCacheInfo = function() {
    const cacheExpiry = document.querySelector('#cacheExpiry');
    const cacheScopeDisplay = document.querySelector('#cacheScopeDisplay');

    if (!cacheExpiry) {
      return;
    }

    // One "Cache" tile: which pages reuse the results, and for how long
    const tile = cacheExpiry.closest('.stat-inline');
    const tr = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    const meta = this.cacheMetadata || null;
    if (meta && meta.expiry) {
      const diff = new Date(meta.expiry) - new Date();
      cacheExpiry.textContent = diff > 0 ? this.formatExpiryRemaining(diff) : tr('cacheExpiredLabel', 'Expired');
    } else {
      cacheExpiry.textContent = '-';
    }

    const scopeNames = {
      domain: tr('scopeDomain', 'Domain'),
      path: tr('scopePath', 'Path'),
      full: tr('scopeFullUrl', 'Full URL')
    };
    const scopeHints = {
      domain: tr('tipScopeDomain', 'Results are reused for every page on this domain.'),
      path: tr('tipScopePath', 'Results are reused for this exact path, whatever the query.'),
      full: tr('tipScopeFullUrl', 'Results are reused only for this exact URL, including the query.')
    };
    // The tip carries fixed dates, so it never shows a stale countdown
    const showScope = (scope) => {
      const key = scopeNames[scope] ? scope : 'path';
      if (cacheScopeDisplay) cacheScopeDisplay.textContent = scopeNames[key];
      const rows = [];
      if (meta && meta.timestamp) rows.push({ label: tr('tipCachedAt', 'Saved'), value: FormatUtils.formatDateTime(meta.timestamp) });
      if (meta && meta.expiry) rows.push({ label: tr('tipCacheExpires', 'Expires'), value: FormatUtils.formatDateTime(meta.expiry) });
      FormatUtils.setTip(tile, `${tr('statCacheScope', 'Cache Scope')}: ${scopeNames[key]}`, scopeHints[key], rows);
    };
    if (meta && meta.cacheScope) {
      showScope(meta.cacheScope);
    } else {
      showScope('path');
      // Fallback: read current setting from storage
      Utils.getSettings().then((settings) => {
        showScope(settings.cacheScope || settings.detection?.cacheScope || 'path');
      }).catch(() => {});
    }
};

DetectionUI.formatExpiryRemaining = function(msRemaining) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const ms = Number(msRemaining);
    if (!Number.isFinite(ms) || ms <= 0) return (t && t.get('cacheExpiredLabel')) || 'Expired';

    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const MONTH = 30 * DAY; // Approximation is fine for TTL display
    const YEAR = 365 * DAY;

    // Compact unit suffixes come from the locale ("3h 5m", "3 h 5 min",
    // "3時間5分"). Keys rather than Intl: narrow Intl units write months and
    // minutes the same way ("2m") in several languages.
    const UNIT_FORMATS = {
      y: ['detectionUiDurYearsFmt', '{0}y'],
      mo: ['detectionUiDurMonthsFmt', '{0}mo'],
      d: ['detectionUiDurDaysFmt', '{0}d'],
      h: ['detectionUiDurHoursFmt', '{0}h'],
      m: ['detectionUiDurMinutesFmt', '{0}m']
    };
    const unit = (value, label) => {
      const [key, fallback] = UNIT_FORMATS[label];
      return (t && t.format(key, value)) || fallback.replace('{0}', String(value));
    };
    const joinParts = (parts) => {
      if (parts.length < 2) return parts[0];
      return (t && t.format('detectionUiDurPairFmt', parts[0], parts[1])) || `${parts[0]} ${parts[1]}`;
    };

    // Prefer large units when applicable:
    // - >= 1 year: y + mo
    // - >= 1 month: mo + d
    // - >= 1 day: d + h
    // - >= 1 hour: h + m
    // - otherwise: m (or <1m)
    let remaining = ms;

    const parts = [];
    const push = (value, label) => {
      if (value > 0) parts.push(unit(value, label));
    };
    const done = () => (parts.length ? joinParts(parts.slice(0, 2)) : unit(0, 'm'));

    if (remaining >= YEAR) {
      const years = Math.floor(remaining / YEAR);
      remaining -= years * YEAR;
      push(years, 'y');

      const months = Math.floor(remaining / MONTH);
      push(months, 'mo');
      return done();
    }

    if (remaining >= MONTH) {
      const months = Math.floor(remaining / MONTH);
      remaining -= months * MONTH;
      push(months, 'mo');

      const days = Math.floor(remaining / DAY);
      push(days, 'd');
      return done();
    }

    if (remaining >= DAY) {
      const days = Math.floor(remaining / DAY);
      remaining -= days * DAY;
      push(days, 'd');

      const hours = Math.floor(remaining / HOUR);
      push(hours, 'h');
      return done();
    }

    if (remaining >= HOUR) {
      const hours = Math.floor(remaining / HOUR);
      remaining -= hours * HOUR;
      push(hours, 'h');

      const minutes = Math.floor(remaining / MINUTE);
      push(minutes, 'm');
      return done();
    }

    if (remaining < MINUTE) return (t && t.get('detectionUiDurUnderMinute')) || '<1m';
    const minutes = Math.floor(remaining / MINUTE);
    return unit(minutes, 'm');
};

DetectionUI.setCopyableValue = function(element, value, label = 'value') {
    if (!element) {
      return;
    }

    const copyValue = String(value ?? '').trim();
    if (!copyValue || copyValue === '-') {
      element.classList.remove('copyable-value');
      element.removeAttribute('data-copy-value');
      element.removeAttribute('data-copy-label');
      element.removeAttribute('role');
      element.removeAttribute('tabindex');
      element.removeAttribute('aria-label');
      return;
    }

    element.classList.add('copyable-value');
    element.dataset.copyValue = copyValue;
    element.dataset.copyLabel = label;
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    const copyText = DetectionUI.copyLabelText(label, copyValue);
    element.setAttribute('aria-label', copyText.action);
    element.title = element.id === 'siteUrl' ? copyValue : copyText.withValue;
};

// Localised "Copy URL" / "Copy URL: …" texts for a copyable value. `label`
// is the internal kind ('URL', 'category', 'method', 'value').
DetectionUI.COPY_LABEL_KEYS = {
    url: ['detectionUiCopyUrl', 'Copy URL', 'detectionUiCopyUrlFmt', 'Copy URL: {0}'],
    category: ['detectionUiCopyCategory', 'Copy category', 'detectionUiCopyCategoryFmt', 'Copy category: {0}'],
    method: ['detectionUiCopyMethod', 'Copy method', 'detectionUiCopyMethodFmt', 'Copy method: {0}'],
    value: ['detectionUiCopyValue', 'Copy value', 'detectionUiCopyValueFmt', 'Copy value: {0}']
};

DetectionUI.copyLabelText = function(label, value) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const entry = DetectionUI.COPY_LABEL_KEYS[String(label || 'value').toLowerCase()] || DetectionUI.COPY_LABEL_KEYS.value;
    const [actionKey, actionFallback, valueKey, valueFallback] = entry;
    return {
      action: (t && t.get(actionKey)) || actionFallback,
      withValue: (t && t.format(valueKey, value)) || valueFallback.replace('{0}', String(value))
    };
};

DetectionUI.copyCopyableValue = async function(element) {
    const value = element?.dataset?.copyValue;
    if (!value) {
      return;
    }

    const copied = await FormatUtils.copyToClipboard(value, {
      notify: true,
      notificationMessage: (typeof I18n !== 'undefined' && I18n.get('copiedNotification')) || 'Copied',
      element: null
    });

    if (!copied) {
      return;
    }

    element.classList.add('copy-feedback-active');
    if (element._copyFeedbackTimer) {
      clearTimeout(element._copyFeedbackTimer);
    }
    element._copyFeedbackTimer = setTimeout(() => {
      element.classList.remove('copy-feedback-active');
      element._copyFeedbackTimer = null;
    }, 900);
};

DetectionUI.handleCopyableValueClick = function(event) {
    const eventTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
    const target = eventTarget?.closest('[data-copy-value]');
    const container = document.querySelector('#detectionResults');
    if (!target || !container || !container.contains(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.copyCopyableValue(target);
};

DetectionUI.handleCopyableValueKeyDown = function(event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const eventTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
    const target = eventTarget?.closest('[data-copy-value]');
    const container = document.querySelector('#detectionResults');
    if (!target || !container || !container.contains(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.copyCopyableValue(target);
};

/**
 * Build the HTML of one detection card
 * @param {Object} detection - Detection to render
 * @param {number} index - Index within the rendered page (fallback for the global index)
 * @param {boolean} isSingleResult - Whether the page shows a single card
 * @returns {string} Card HTML
 */
DetectionUI.buildDetectionCardHtml = function(detection, index, isSingleResult = false) {
    const confidence = detection.confidence || 0;

    const detectorIcon = this.getDetectorIcon(detection);
    const detectorName = FormatUtils.detectorName(detection)
      || ((typeof I18n !== 'undefined' && I18n.get('timeUnknown')) || 'Unknown');
    const safeDetectorName = FormatUtils.escapeHtml(detectorName);

    const globalIndex = this.getGlobalDetectionIndex(detection, index);

    // Difficulty under the confidence, coloured like the History cards (High red, Medium amber, Low green)
    const difficulty = DetectionUtils.normalizeDifficulty(detection.difficulty || detection.detector?.difficulty)
      || DetectionUtils.defaultDifficultyForCategory(detection.category || detection.detector?.category);
    const difficultyText = (typeof I18n !== 'undefined')
      ? I18n.tr(`difficulty${difficulty}`, difficulty)
      : difficulty;

    // Hover: how the score was reached (matched combinations or the strongest
    // single signal) and where the difficulty comes from
    const matchList = Array.isArray(detection.matches) ? detection.matches : [];
    const combos = Array.isArray(detection.combinations) ? detection.combinations : [];
    const confidenceRows = combos.length
      ? combos.map((combo, index) => ({ combo, index }))
        .sort((a, b) => ((Number(b.combo.confidence) || 0) - (Number(a.combo.confidence) || 0)) || (a.index - b.index))
        .slice(0, 3).map(({ combo, index }) => ({
          label: FormatUtils.ruleText(combo.name) || FormatUtils.t('combinationDefaultNameFmt', 'Combination {0}', index + 1),
          value: `${Math.round(Number(combo.confidence) || 0)}%`, tone: FormatUtils.confidenceTone(combo.confidence)
        }))
      : matchList.slice().sort((a, b) => (Number(b.baseConfidence ?? b.confidence) || 0) - (Number(a.baseConfidence ?? a.confidence) || 0))
        .slice(0, 3).map(match => ({
          label: DetectionUI.getMethodLabel(String(match.type || 'unknown').toLowerCase()),
          value: `${Math.round(Number(match.baseConfidence ?? match.confidence) || 0)}%`,
          tone: FormatUtils.confidenceTone(match.baseConfidence ?? match.confidence)
        }));
    const confidenceTip = {
      title: `${FormatUtils.t('statConfidence', 'Confidence')}: ${Math.round(confidence)}%`,
      detail: combos.length
        ? FormatUtils.t('tipConfidenceFromCombinations', 'From the matched combinations')
        : (matchList.length === 1
          ? FormatUtils.t('historyOneMatch', '1 match')
          : FormatUtils.t('historyMatchCountFmt', '{0} matches', matchList.length)),
      rows: confidenceRows
    };
    const ownDifficulty = DetectionUtils.normalizeDifficulty(detection.difficulty || detection.detector?.difficulty);
    const difficultyTip = {
      title: `${FormatUtils.t('statDifficulty', 'Difficulty')}: ${difficultyText}`,
      detail: ownDifficulty
        ? FormatUtils.t('tipDifficultyFromRule', 'Set by this detector')
        : FormatUtils.t('tipDifficultyFromCategoryFmt', 'Default for {0}', FormatUtils.categoryLabel(FormatUtils.categoryKey(detection)))
    };

    // One line under the name: how sure (neutral, the confidence tip on hover)
    // and what was found; the category moves here when the list is not grouped
    const t = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    const categoryKey = DetectionUI.categoryKeyOf(detection);
    const categoryColor = DetectionUI.categoryColor.call(this, categoryKey);
    const inlineCategory = DetectionUI.showsGroups.call(this) ? ''
      : `<span class="card-meta-category"><span class="category-icon" style="color:${categoryColor}" aria-hidden="true">${FormatUtils.categoryIconSvg(categoryKey)}</span>${FormatUtils.escapeHtml(DetectionUI.categoryLabel(detection.category || categoryKey))}</span><span class="card-meta-sep" aria-hidden="true">·</span>`;
    const sure = Math.max(0, Math.min(100, Math.round(Number(confidence) || 0)));
    // Every method as its icon and count (the words go to screen readers); the tip names each
    const evidence = DetectionUI.evidenceSummary(matchList, combos.length > 0, DetectionUI.METHOD_ORDER.length);
    const evidenceTip = DetectionUI.evidenceRows(matchList);
    const evidenceIcons = DetectionUI.evidenceIconsHtml.call(this, matchList, combos.length > 0);

    return `
      <div class="detection-card ${isSingleResult ? 'single-result' : ''}" data-detection-index="${globalIndex}" style="--conf:${sure}%;--cat-color:${categoryColor}">
        <div class="card-header">
          <div class="card-icon-section">
            ${detectorIcon}
          </div>
          <div class="card-info">
            <div class="card-row-main">
              <h3 class="detector-name" title="${FormatUtils.escapeAttr(detectorName)}">${safeDetectorName}</h3>
              ${FormatUtils.difficultyHtml(difficulty, difficultyText, 'card-difficulty', difficultyTip)}
            </div>
            <p class="card-row-meta">${inlineCategory}<span class="card-sure" ${FormatUtils.tipAttrs(confidenceTip.title, confidenceTip.detail, confidenceTip.rows)}>${FormatUtils.escapeHtml(t('detectionCardSureFmt', '{0}% sure', sure))}</span>${evidence ? `<span class="card-meta-sep" aria-hidden="true">·</span><span class="card-evidence" ${FormatUtils.tipAttrs(matchList.length === 1 ? t('historyOneMatch', '1 match') : t('historyMatchCountFmt', '{0} matches', matchList.length), combos.length > 0 ? t('detectionCardCombination', 'Combination') : '', evidenceTip)}><span class="visually-hidden">${FormatUtils.escapeHtml(evidence)}</span>${evidenceIcons}</span>` : ''}</p>
          </div>
        </div>
        <div class="card-conf-bar" aria-hidden="true"></div>
      </div>
    `;
};

/** Methods in the order the rule editor lists them (ties in the evidence line). */
DetectionUI.METHOD_ORDER = ['cookie', 'header', 'url', 'content', 'dom', 'window', 'js_hooks', 'payload'];

/**
 * The evidence line of a card: matched methods, most matches first, with a
 * count above one ("Cookies, Headers 2, URL 2 +1"), led by "Combination"
 * when a combination decided the detection.
 */
DetectionUI.evidenceSummary = function(matches, combined = false, max = 3) {
    const aliases = { cookies: 'cookie', headers: 'header', urls: 'url' };
    const counts = new Map();
    (Array.isArray(matches) ? matches : []).forEach(match => {
      const raw = String(match?.type || '').toLowerCase();
      if (!raw) return;
      const type = aliases[raw] || raw;
      counts.set(type, (counts.get(type) || 0) + 1);
    });
    const rank = type => { const i = DetectionUI.METHOD_ORDER.indexOf(type); return i === -1 ? 99 : i; };
    const ordered = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (rank(a[0]) - rank(b[0])));
    const shown = ordered.slice(0, max).map(([type, count]) => {
      const label = DetectionUI.getMethodLabel(type);
      return count > 1 ? `${label} ${count}` : label;
    });
    const rest = ordered.length - shown.length;
    let text = shown.join(', ');
    if (rest > 0) text += ' ' + FormatUtils.t('detectionCardMoreFmt', '+{0}', rest);
    if (combined) {
      const word = FormatUtils.t('detectionCardCombination', 'Combination');
      text = text ? `${word} · ${text}` : word;
    }
    return text;
};

/**
 * The evidence line as icons: a combination mark when a combination decided
 * the detection, then each matched method's icon with its count, most
 * matches first. Methods without an icon show their name instead.
 */
DetectionUI.evidenceIconsHtml = function(matches, combined = false) {
    const parts = combined ? [`<span class="card-evidence-item is-combination" aria-hidden="true">${FormatUtils.METHOD_ICONS.combination}</span>`] : [];
    for (const row of DetectionUI.evidenceCounts(matches)) {
      const icon = FormatUtils.methodIconSvg(row.type);
      // Each method in its colour from Settings → Tag Colors
      const color = icon ? FormatUtils.methodColor(row.type, this?.tagColors) : '';
      const style = color ? ` style="--method-color:${color}"` : '';
      parts.push(`<span class="card-evidence-item"${style} aria-hidden="true">${icon || `<span class="card-evidence-name">${FormatUtils.escapeHtml(DetectionUI.getMethodLabel(row.type))}</span>`}<span class="card-evidence-count">${row.count}</span></span>`);
    }
    return parts.join('');
};

/** Each matched method and its number of matches, most first (ties in the editor's order). */
DetectionUI.evidenceCounts = function(matches) {
    const aliases = { cookies: 'cookie', headers: 'header', urls: 'url' };
    const counts = new Map();
    (Array.isArray(matches) ? matches : []).forEach(match => {
      const raw = String(match?.type || '').toLowerCase();
      if (raw) counts.set(aliases[raw] || raw, (counts.get(aliases[raw] || raw) || 0) + 1);
    });
    const rank = type => { const i = DetectionUI.METHOD_ORDER.indexOf(type); return i === -1 ? 99 : i; };
    return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (rank(a[0]) - rank(b[0]))).map(([type, count]) => ({ type, count }));
};

/** Tooltip rows of the evidence line: each matched method and how many matches it has. */
DetectionUI.evidenceRows = function(matches) {
    const aliases = { cookies: 'cookie', headers: 'header', urls: 'url' };
    const counts = new Map();
    (Array.isArray(matches) ? matches : []).forEach(match => {
      const raw = String(match?.type || '').toLowerCase();
      if (raw) counts.set(aliases[raw] || raw, (counts.get(aliases[raw] || raw) || 0) + 1);
    });
    const rank = type => { const i = DetectionUI.METHOD_ORDER.indexOf(type); return i === -1 ? 99 : i; };
    return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (rank(a[0]) - rank(b[0])))
      .map(([type, count]) => ({ label: DetectionUI.getMethodLabel(type), value: String(count) }));
};

/** Grouped under category headers unless Settings → Detection order puts the highest confidence first. */
DetectionUI.showsGroups = function() {
    const byConfidence = typeof DetectionUtils !== 'undefined' ? DetectionUtils.SORT_BY_CONFIDENCE : 'confidence';
    return this?.sortBy !== byConfidence;
};

/** antibot / captcha / fingerprint (or the raw lowercase name) of a detection. */
DetectionUI.categoryKeyOf = function(detection) {
    const raw = detection?.category || detection?.detector?.category || '';
    if (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.categoryKey === 'function') return DetectionUtils.categoryKey(raw);
    return String(raw).toLowerCase().replace(/[^a-z]/g, '');
};

DetectionUI.categoryColor = function(categoryKey) {
    const info = this?.detectorManager?.getCategoryInfo?.(categoryKey);
    const color = info?.colour;
    if (typeof color === 'string' && /^#[0-9a-f]{3,8}$/i.test(color)) return color;
    return (typeof FormatUtils !== 'undefined' && FormatUtils.DEFAULT_CATEGORY_COLORS[categoryKey]) || '#6b7280';
};

/** A category header: category icon in its colour, translated name and how many of the listed protections it has. */
DetectionUI.groupHeaderHtml = function(categoryKey, count) {
    const label = DetectionUI.categoryLabel(categoryKey);
    const color = DetectionUI.categoryColor.call(this, categoryKey);
    const text = FormatUtils.t('detectionGroupCountFmt', '{0} · {1}', label, count);
    return `<div class="detection-group-head" role="heading" aria-level="3"><span class="category-icon" style="color:${color}" aria-hidden="true">${FormatUtils.categoryIconSvg(categoryKey)}</span>${FormatUtils.escapeHtml(text)}</div>`;
};

/**
 * Cards of one page, each wrapped with the header of its category when it
 * starts a group on this page (and on the first card of every page).
 */
DetectionUI.buildPageItemsHtml = function(detections, buildCard, pageStartHeaders = true) {
    const groups = DetectionUI.showsGroups.call(this);
    const all = this.paginationManager?.filteredItems || detections;
    const totals = new Map();
    if (groups) all.forEach(item => { const key = DetectionUI.categoryKeyOf(item); totals.set(key, (totals.get(key) || 0) + 1); });
    let previous = null;
    return detections.map((detection, index) => {
      const key = groups ? DetectionUI.categoryKeyOf(detection) : null;
      const head = groups && ((index === 0 && pageStartHeaders) || (index > 0 && key !== previous))
        ? DetectionUI.groupHeaderHtml.call(this, key, totals.get(key) || 0) : '';
      previous = key;
      return `<div class="detection-item">${head}${buildCard(detection, index)}</div>`;
    }).join('');
};

DetectionUI.renderDetectionsPage = function(detections) {
    Logger.debug('UI', `[renderDetectionsPage] Called with ${detections?.length || 0} detections`);
    const resultsList = document.querySelector('#resultsList');
    if (!resultsList) {
      Logger.error('UI', '[renderDetectionsPage] resultsList not found!');
      return;
    }

    const totalItems = this.paginationManager?.filteredItems?.length ?? detections.length;
    const shouldUseExpandedLayout = totalItems === 2;
    resultsList.classList.toggle('expanded-results', shouldUseExpandedLayout);

    // Check if we're displaying only 1 detection result for enhanced styling
    const isSingleResult = detections.length === 1;

    const buildCardHtml = (detection, index) => DetectionUI.buildDetectionCardHtml.call(this, detection, index, isSingleResult);

    const finalizeRender = () => {
      if (renderToken !== this._detectionsRenderToken) {
        return;
      }

      // Add click handlers for expandable cards
      const cards = document.querySelectorAll('.detection-card');
      Logger.debug('UI', `[renderDetectionsPage] Found ${cards.length} detection cards`);

      cards.forEach(card => {
        card.addEventListener('click', (e) => {
          Logger.debug('UI', '[renderDetectionsPage] Card clicked');

          const indexAttr = card.getAttribute('data-detection-index');
          const parsedIndex = parseInt(indexAttr, 10);
          Logger.debug('UI', '[renderDetectionsPage] Opening modal for index', parsedIndex);
          if (!Number.isNaN(parsedIndex)) {
            this.openDetectionModal(parsedIndex);
          }
        });
      });
    };

    this._detectionsRenderToken = (this._detectionsRenderToken || 0) + 1;
    const renderToken = this._detectionsRenderToken;
    const shouldBatchRender = detections.length > 20;
    // A page change starts the shared content scrollport at its summary and first card.
    const main = document.querySelector('#app > .main');
    if (main) main.scrollTop = 0;
    resultsList.scrollTop = 0;

    if (!shouldBatchRender) {
      resultsList.innerHTML = DetectionUI.buildPageItemsHtml.call(this, detections, buildCardHtml);
      finalizeRender();
      return;
    }

    resultsList.innerHTML = '';
    const batchSize = 8;
    let offset = 0;

    const renderBatch = () => {
      if (renderToken !== this._detectionsRenderToken) {
        return;
      }

      // Batches continue one page: a header only where the category changes
      const slice = detections.slice(offset, offset + batchSize);
      const lastKey = offset > 0 ? DetectionUI.categoryKeyOf(detections[offset - 1]) : null;
      const html = DetectionUI.buildPageItemsHtml.call(this, slice, (detection, index) => buildCardHtml(detection, offset + index),
        offset === 0 || DetectionUI.categoryKeyOf(slice[0]) !== lastKey);
      resultsList.insertAdjacentHTML('beforeend', html);
      offset += batchSize;

      if (offset < detections.length) {
        requestAnimationFrame(renderBatch);
      } else {
        finalizeRender();
      }
    };

    renderBatch();
};

/**
 * Page sizer for the detection list: lays every card out once at the list's
 * real width and packs cards against the shared main viewport height. The
 * summary, search and cards scroll together, so content height must never be
 * used as the page budget (min 1 card per page).
 * @param {Array} items - Filtered, sorted detections
 * @returns {Array<number>|null} Page start indexes, or null while the list is
 *   not laid out (hidden tab) so pagination falls back to fixed-size pages
 */
DetectionUI.measurePageStarts = function(items) {
    const resultsList = document.querySelector('#resultsList');
    const main = document.querySelector('#app > .main');
    if (!resultsList || !main || !items.length || !(resultsList.getBoundingClientRect().width > 0)) {
      return null;
    }

    // Same rule renderDetectionsPage applies, so the padding measured here matches
    resultsList.classList.toggle('expanded-results', items.length === 2);
    const listStyle = getComputedStyle(resultsList);
    const available = main.clientHeight
      - parseFloat(listStyle.paddingTop) - parseFloat(listStyle.paddingBottom);
    if (!(available > 0)) {
      return null;
    }
    const gap = parseFloat(listStyle.rowGap) || 0;

    // Cards share the main scrollbar gutter and measure at their final list width.
    // Measured as rendered: each item carries the header of a category change
    resultsList.innerHTML = DetectionUI.buildPageItemsHtml.call(this, items,
      (detection, index) => DetectionUI.buildDetectionCardHtml.call(this, detection, index));
    const heights = Array.from(resultsList.children, card => card.getBoundingClientRect().height);
    // A page that starts inside a group repeats that group's header
    const headerEl = typeof resultsList.querySelector === 'function' ? resultsList.querySelector('.detection-group-head') : null;
    const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;
    const startsGroup = items.map((item, index) => index === 0
      || DetectionUI.categoryKeyOf(item) !== DetectionUI.categoryKeyOf(items[index - 1]));
    this._detectionListHeight = available;

    // Include the card crossing the viewport budget, then start the next page.
    // The shared scrollport reveals the summary and every card on this page.
    const starts = [0];
    let used = 0;
    heights.forEach((height, index) => {
      const pageStartHeight = height + (startsGroup[index] ? 0 : headerHeight);
      if (index === starts[starts.length - 1]) {
        used = pageStartHeight;
      } else if (used + gap >= available) {
        starts.push(index);
        used = pageStartHeight;
      } else {
        used += gap + height;
      }
    });
    return starts;
};

/**
 * Re-pack detection pages when the shared viewport changes, never when a
 * rendered page changes the list's natural content height.
 */
DetectionUI.observeResultsListSize = function() {
    const resultsList = document.querySelector('#resultsList');
    const main = document.querySelector('#app > .main');
    if (this._resultsListObserver) {
      this._resultsListObserver.disconnect();
    }
    if (!resultsList || !main || typeof ResizeObserver === 'undefined') {
      return;
    }

    this._resultsListObserver = new ResizeObserver(() => {
      if (this._resultsListRefitFrame) {
        return;
      }
      this._resultsListRefitFrame = requestAnimationFrame(() => {
        this._resultsListRefitFrame = null;
        const pagination = this.paginationManager;
        if (!pagination || !pagination.filteredItems.length || !resultsList.isConnected
          || !(resultsList.getBoundingClientRect().width > 0)) {
          return;
        }
        const listStyle = getComputedStyle(resultsList);
        const available = main.clientHeight
          - parseFloat(listStyle.paddingTop) - parseFloat(listStyle.paddingBottom);
        if (available > 0 && Math.abs(available - (this._detectionListHeight || 0)) > 0.5) {
          pagination.refit();
        }
      });
    });
    this._resultsListObserver.observe(main);
};

// Localized category names, shared by the detection cards, History and Rules
DetectionUI.CATEGORY_LABELS = {
    antibot: ['categoryAntibot', 'Anti-bot'],
    'anti-bot': ['categoryAntibot', 'Anti-bot'],
    captcha: ['categoryCaptcha', 'Captcha'],
    fingerprint: ['categoryFingerprint', 'Fingerprint'],
    fingerprinting: ['categoryFingerprint', 'Fingerprint']
};

DetectionUI.categoryLabel = function(category) {
    const raw = String(category || '');
    const entry = DetectionUI.CATEGORY_LABELS[raw.toLowerCase()];
    if (!entry) return raw.charAt(0).toUpperCase() + raw.slice(1);
    return typeof I18n !== 'undefined' ? I18n.tr(entry[0], entry[1]) : entry[1];
};

// Human-readable, localized names for the detection method chips (shared map: FormatUtils.METHOD_LABELS)
DetectionUI.getMethodLabel = function(typeName) {
    return FormatUtils.methodLabel(typeName);
};

DetectionUI.getCategoryBadges = function(detection, { copyable = true } = {}) {
    const badges = [];
    // Copy-on-click attributes; the list cards pass copyable: false and render plain chips
    const copyClass = copyable ? ' copyable-value' : '';
    // value arrives attribute-escaped; the title is built from the raw text and escaped once
    const copyAttrs = (value, label, rawValue) => (copyable
      ? ` data-copy-value="${value}" data-copy-label="${label}" role="button" tabindex="0" title="${FormatUtils.escapeAttr(DetectionUI.copyLabelText(label, rawValue).withValue)}"`
      : '');

    // Main category badge with dynamic color from storage (muted style)
    if (detection.category) {
      const categoryInfo = this.detectorManager.getCategoryInfo(detection.category.toLowerCase());
      const categoryColor = categoryInfo?.colour || '#666666';
      const categoryName = DetectionUI.categoryLabel(detection.category);
      const safeCategoryName = FormatUtils.escapeHtml(categoryName);
      const copyCategoryName = FormatUtils.escapeAttr(categoryName);
      const rgb = FormatUtils.hexToRgb(categoryColor);
      // In the rgb branch categoryColor passed hexToRgb so it is a valid hex.
      // In the fallback branch use a constant — never interpolate an
      // unvalidated color into the style attribute.
      const bgStyle = rgb
        ? `background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2); color: ${categoryColor}; border: 1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35);`
        : `background: #666666; color: white;`;
      badges.push(`<span class="badge${copyClass}" style="${bgStyle}"${copyAttrs(copyCategoryName, 'category', categoryName)}>${safeCategoryName}</span>`);
    }

    // Add detection method badges based on actual matches (with counts)
    if (detection.matches && detection.matches.length > 0) {
      // Count matches per type instead of just collecting unique types
      const methodCounts = new Map();
      detection.matches.forEach(match => {
        if (match.type) {
          methodCounts.set(match.type, (methodCounts.get(match.type) || 0) + 1);
        }
      });

      // Convert method types to badges with counts and dynamic colors from CategoryManager
      methodCounts.forEach((count, type) => {
        const typeName = type.toLowerCase();
        const methodName = DetectionUI.getMethodLabel(typeName);
        const displayText = count > 1 ? `${methodName} (${count})` : methodName;
        const tagColor = this.detectorManager.categoryManager.getTagColor(typeName);

        if (tagColor && tagColor !== '#666666') {
          // Use muted/transparent background with colored text
          const rgb = FormatUtils.hexToRgb(tagColor);
          const bgStyle = rgb
            ? `background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15); color: ${tagColor}; border: 1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3);`
            : `background: ${tagColor}; color: white;`;
          const safeDisplayText = FormatUtils.escapeHtml(displayText);
          const copyDisplayText = FormatUtils.escapeAttr(displayText);
          badges.push(`<span class="badge badge-method${copyClass}" style="${bgStyle}"${copyAttrs(copyDisplayText, 'method', displayText)}>${safeDisplayText}</span>`);
        } else {
          // Fallback to CSS class (use typeName for CSS class)
          const methodClass = `badge-${typeName}`;
          const safeDisplayText = FormatUtils.escapeHtml(displayText);
          const copyDisplayText = FormatUtils.escapeAttr(displayText);
          badges.push(`<span class="badge badge-method ${methodClass}${copyClass}"${copyAttrs(copyDisplayText, 'method', displayText)}>${safeDisplayText}</span>`);
        }
      });
    }

    return badges.join('');
};

DetectionUI.getMethodBadges = function(matches) {
    if (!matches || matches.length === 0) {
      const unknownMethod = (typeof I18n !== 'undefined' && I18n.get('detectionUiUnknownMethod')) || 'Unknown method';
      return `<div class="method-item-card">${FormatUtils.escapeHtml(unknownMethod)}</div>`;
    }

    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const clickToCopy = (t && t.get('advCommonClickToCopy')) || 'Click to copy';
    const unknownValue = (t && t.get('detectionUiUnknownValue')) || 'unknown';

    // Show all methods as individual cards
    const badges = matches.map((match, index) => {
      let methodType = (match.type || 'unknown').toLowerCase();
      methodType = methodType.replace(/_/g, ' ').toUpperCase();
      const confidence = match.confidence || 0;

      // Format the display value based on type
      let displayValue = '';
      let copyValue = '';

      const matchType = (match.type || '').toLowerCase();

      switch (matchType) {
        case 'cookie':
        case 'cookies':
          // Show: name=value format if available, otherwise just name
          displayValue = match.value || match.name || unknownValue;
          copyValue = displayValue;
          break;

        case 'header':
        case 'headers':
          // Show: name: value format if available, otherwise just name
          displayValue = match.value || match.name || unknownValue;
          copyValue = displayValue;
          break;

        case 'content':
        case 'script':
          // Show: pattern first (e.g., "recaptcha"), then value (location)
          displayValue = match.pattern || match.content || match.value || unknownValue;
          copyValue = displayValue;
          break;

        case 'url':
        case 'urls':
          // Show: full URL inline (like cookie format)
          displayValue = match.fullUrl || match.value || match.pattern || unknownValue;
          copyValue = displayValue;
          break;

        case 'dom':
          // Show: selector=text format if available, otherwise just selector
          displayValue = match.value || match.selector || match.pattern || unknownValue;
          copyValue = displayValue;
          break;

        default:
          displayValue = match.pattern || match.name || match.value || match.selector || unknownValue;
          copyValue = displayValue;
      }

      // Get tag color from CategoryManager using original matchType (preserves underscores)
      const tagColor = this.detectorManager.categoryManager.getTagColor(matchType);

      // Use muted/transparent background with colored text
      const effectiveColor = (tagColor && tagColor !== '#666666') ? tagColor : '#666666';
      const rgb = FormatUtils.hexToRgb(effectiveColor);
      const badgeStyle = rgb
        ? `style="background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15); color: ${effectiveColor}; border: 1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3);"`
        : `style="background: ${effectiveColor}; color: white; border: none;"`;

      // Normalize method type for CSS class using original matchType (preserves underscores/hyphens)
      // Replace underscores with hyphens for CSS compatibility, then handle plural to singular
      const methodClass = matchType.replace(/_/g, '-').replace(/s$/, ''); // js_hooks -> js-hooks, cookies -> cookie

      const encodedValue = encodeURIComponent(copyValue);
      const safeDisplayValue = FormatUtils.escapeHtml(displayValue);
      const safeFullValue = FormatUtils.escapeHtml(copyValue);

      return `
        <div class="method-item-card method-${methodClass}" data-copy-value="${encodedValue}" data-method-type="${methodType}" title="${FormatUtils.escapeAttr(clickToCopy)}">
          <span class="method-type-badge" ${badgeStyle}>${FormatUtils.escapeHtml(DetectionUI.getMethodLabel(matchType || 'unknown'))}</span>
          <button type="button" class="method-value-btn" data-copy-target="value" title="${safeFullValue}">${safeDisplayValue}</button>
          ${FormatUtils.confidenceHtml(confidence, 'method-confidence')}
        </div>
      `;
    });

    return badges.join('');
};

DetectionUI.getFilteredResults = function() {
    if (!this.searchQuery) return this.currentResults;

    const filtered = this.currentResults.filter(detection => {
      const name = FormatUtils.detectorName(detection).toLowerCase();
      const category = (detection.category || '').toLowerCase();
      // Search finds the description in English and in the UI language
      const english = detection.detector?.description || '';
      const description = `${english} ${FormatUtils.ruleText(english)}`.toLowerCase();

      return name.includes(this.searchQuery) ||
             category.includes(this.searchQuery) ||
             description.includes(this.searchQuery);
    });

    // Sort filtered results by category priority
    return this.sortDetectionsByCategory(filtered);
};

DetectionUI.sortDetectionsByCategory = function(detections) {
    // Settings → Detection → Show first: a category order (default anti-bot,
    // captcha, fingerprint, then confidence) or the highest confidence
    return DetectionUtils.sortDetections(detections, {
      sortBy: this?.sortBy,
      categoryOrder: Array.isArray(this?.categoryOrder) ? this.categoryOrder : undefined
    });
};

DetectionUI.handleSearch = function(query) {
    this.searchQuery = query.toLowerCase().trim();

    // Filtered, or the whole list again when the search is cleared: both in
    // the Settings order (clearing showed the results unsorted, fingerprints first)
    const itemsToShow = this.searchQuery
      ? this.getFilteredResults()
      : this.sortDetectionsByCategory(this.currentResults || []);

    // Update pagination with filtered results
    if (this.paginationManager) {
      this.paginationManager.setItems(itemsToShow);
    }
};

DetectionUI.getDetectorIcon = function(detection) {
    const iconAlt = (typeof I18n !== 'undefined' && I18n.get('ruleFieldIcon')) || 'Icon';
    const escapeAlt = (text) => FormatUtils.escapeAttr(text || iconAlt);
    const normalizedCategory = String(detection?.category || detection?.detector?.category || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    const isFingerprintCategory = normalizedCategory === 'fingerprint' || normalizedCategory.includes('fingerprint');

    const fingerprintIcons = FormatUtils.FINGERPRINT_ICONS;

    const wrapFingerprintImage = (src, alt, sourceType) => (
      `<div class="detector-icon detector-icon-svg fingerprint-icon fingerprint-icon-shell"><img src="${FormatUtils.escapeAttr(src)}" alt="${alt}" class="detector-icon fingerprint-icon-image fingerprint-icon-image--${sourceType}" /></div>`
    );

    // Check for custom uploaded icon first
    if (detection.detector?.customIcon) {
      if (isFingerprintCategory) {
        return wrapFingerprintImage(detection.detector.customIcon, escapeAlt(detection.detector.name), 'custom');
      }
      return `<img src="${FormatUtils.escapeAttr(detection.detector.customIcon)}" alt="${escapeAlt(detection.detector.name)}" class="detector-icon" />`;
    }

    // Try to get real icon from detector data
    if (detection.detector?.icon) {
      if (typeof detection.detector.icon === 'string') {
        const lowerIcon = detection.detector.icon.toLowerCase();
        if (lowerIcon === 'default') {
          const scrapflyIcon = chrome.runtime.getURL('icons/icon128.png');
          if (isFingerprintCategory) {
            return wrapFingerprintImage(scrapflyIcon, escapeAlt(detection.detector.name), 'default');
          }
          return `<img src="${scrapflyIcon}" alt="${escapeAlt(detection.detector.name)}" class="detector-icon" />`;
        }
        if (lowerIcon === 'custom' || lowerIcon === 'custom.png') {
          const scrapflyIcon = chrome.runtime.getURL('icons/icon128.png');
          if (isFingerprintCategory) {
            return wrapFingerprintImage(scrapflyIcon, escapeAlt(detection.detector.name), 'default');
          }
          return `<img src="${scrapflyIcon}" alt="${escapeAlt(detection.detector.name)}" class="detector-icon" />`;
        }

        // Check for fingerprint SVG icons
        if (fingerprintIcons[lowerIcon]) {
          return `<div class="detector-icon detector-icon-svg fingerprint-icon fingerprint-icon-shell">${fingerprintIcons[lowerIcon]}</div>`;
        }
      }
      // Check if it's an emoji (not a file name)
      if (!detection.detector.icon.includes('.png') &&
          !detection.detector.icon.includes('.jpg') &&
          !detection.detector.icon.includes('.svg') &&
          !detection.detector.icon.includes('http')) {
        // It's an emoji or text — escape before it lands in innerHTML.
        return FormatUtils.escapeHtml(detection.detector.icon);
      }

      // It's a file, build path to icon in detectors/icons folder
      const iconPath = chrome.runtime.getURL(`detectors/icons/${detection.detector.icon}`);
      if (isFingerprintCategory) {
        return wrapFingerprintImage(iconPath, escapeAlt(detection.detector.name), 'builtin');
      }
      return `<img src="${iconPath}" alt="${escapeAlt(detection.detector.name)}" class="detector-icon" />`;
    }

    // No icon specified, use default custom.png
    const scrapflyIcon = chrome.runtime.getURL('icons/icon128.png');
    if (isFingerprintCategory) {
      return wrapFingerprintImage(scrapflyIcon, escapeAlt(detection.detector?.name), 'default');
    }
    return `<img src="${scrapflyIcon}" alt="${escapeAlt(detection.detector?.name)}" class="detector-icon" />`;
};

DetectionUI.clearBadgeForEmptyState = async function() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        // A late empty result must not erase the blocked or globally disabled badge.
        const { scrapfly_enabled: enabled } = await chrome.storage.local.get('scrapfly_enabled');
        if (enabled === false || await Utils.isUrlBlacklisted(tabs[0].url)) return;
        await chrome.action.setBadgeText({ text: '', tabId: tabs[0].id });
      }
    } catch (error) {
      // Silently fail if tab no longer exists
    }
};

DetectionUI.getDifficultyInfo = function(detections = [], avgConfidence = 0) {
    return DetectionUtils.getDifficultyInfo(detections, avgConfidence);
};

if (typeof self !== 'undefined') {
    self.DetectionUI = DetectionUI;
}

// The popup opens on the scanning screen: paint its icons before any detection state arrives
if (typeof document !== 'undefined' && document.addEventListener) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => DetectionUI.paintScanIcons());
  else DetectionUI.paintScanIcons();
}
