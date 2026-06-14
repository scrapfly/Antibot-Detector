class Detection {
  constructor(detectorManager, detectionEngine) {
    this.detectorManager = detectorManager;
    this.detectionEngine = detectionEngine;
    this.currentResults = [];
    this.searchQuery = '';
    this.initialized = false;
    this.initializingPromise = null;
    this.htmlLoaded = false;
    this.paginationManager = null;
    this.analysisSteps = this.createAnalysisSteps();
    this.analysisStepIndex = 0;
    this.analysisProgressInterval = null;
    this.loadingTimeout = null;
    this.loadingTimeoutDuration = 10000; // 10 seconds timeout
    this.modalElements = null;
    this.activeModalIndex = null;
    this.handleModalKeyDown = null;
    this.debugMode = false;
    this.isRequestingDetection = false; // Prevents duplicate requests
    this.isShowingAnalyzing = false; // Prevents UI flicker
    this.isShowingResults = false; // Prevents message listeners from overriding results
    this.isExtensionEnabled = true;
    this.viewedTabId = null;
    this.viewedTabUrl = null;
    this.cacheCleared = false; // Refresh when tab becomes visible
    this.advancedSection = null; // Reference to Advanced section for cross-component notifications
    this.uiStates = (typeof DetectionUIStates !== 'undefined')
      ? DetectionUIStates
      : {
        EMPTY: 'empty',
        LOADING: 'loading',
        ANALYZING: 'analyzing',
        RESULTS: 'results',
        DISABLED: 'disabled'
      };
    this.uiStateMachine = (typeof DetectionUIStateMachine !== 'undefined')
      ? new DetectionUIStateMachine(this.uiStates.EMPTY)
      : null;

    // Setup listeners before init to catch early messages
    this.setupMessageListeners();

    chrome.storage.local.get(['scrapfly_enabled'])
      .then((result) => {
        this.setExtensionEnabled(result.scrapfly_enabled !== false);
      })
      .catch((error) => {
        Logger.error('UI', 'Failed to read enabled state from storage; defaulting to enabled:', error);
        this.setExtensionEnabled(true);
      });
  }

  setExtensionEnabled(enabled) {
    this.isExtensionEnabled = enabled !== false;
  }

  /**
   * Setup message listeners for background script communication
   * Called from constructor to ensure listeners are active even before tab initialization
   */
  setupMessageListeners() {
    if (this._messageListenersAttached) return;
    this._messageListenersAttached = true;
    // Listen for tab navigation; show analyzing state
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (this.viewedTabId !== null && tabId !== this.viewedTabId) {
        return;
      }
      if (changeInfo.status === 'loading' && changeInfo.url) {
        if (this.debugMode) Logger.ui('[Detection] Tab navigated to:', changeInfo.url);
        chrome.action.getBadgeText({ tabId }, (badgeText) => {
          if (badgeText && badgeText.endsWith('%')) {
            if (this.debugMode) Logger.ui('[Detection] Navigation detected, badge shows progress, transitioning to analyzing state');
            if (!this.wasInterrupted && !this.isShowingResults && this.isExtensionEnabled !== false) {
              this.showAnalyzingState();
            }
          }
        });
      }
    });

    // Listen for real-time detection progress
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'EXTENSION_TOGGLE_CHANGED') {
        this.setExtensionEnabled(message.enabled !== false);
        if (!this.isExtensionEnabled) {
          this.showDisabledState();
        }
        return false;
      }

      if (message.type === 'DETECTION_PROGRESS') {
        if (!this.isExtensionEnabled) {
          return false;
        }
        if (this.viewedTabId !== null && message.tabId !== this.viewedTabId) {
          return false;
        }
        if (this.debugMode) Logger.ui('[Detection] Received progress update:', message.progress);

        // Transition to analyzing if not already showing results
        const loadingState = document.querySelector('#loadingState');
        if (!loadingState || loadingState.style.display === 'none') {
          if (this.debugMode) Logger.ui('[Detection] Progress received but not in analyzing state - transitioning now');
          if (!this.wasInterrupted && !this.isShowingResults) {
            this.showAnalyzingState();
          }
        }

        this.updateRealProgress(message.progress);
      }

      // Listen for detection completion
      if (message.type === 'NEW_DETECTION_DATA') {
        if (!this.isExtensionEnabled) {
          return false;
        }
        if (this.viewedTabId !== null && message.tabId !== this.viewedTabId) {
          return false;
        }
        if (window.popupInstance) {
          return false;
        }
        if (this.debugMode) Logger.ui('[Detection] Received detection completion for tab:', message.tabId);

        // Guard: Don't auto-refresh if we just cleared cache and are showing empty state
        if (this.justClearedCache) {
          Logger.ui('[Detection] Ignoring NEW_DETECTION_DATA - showing empty state after cache clear');
          // Reset the flag after 5.5 seconds to allow future updates (after re-detection starts)
          if (!this.clearCacheResetTimer) {
            this.clearCacheResetTimer = setTimeout(() => {
              this.justClearedCache = false;
              this.clearCacheResetTimer = null;
            }, 5500);
          }
          return;
        }

        // Clear loading timeout and stop progress animation
        this.clearLoadingTimeout();
        this.stopAnalysisProgress({ markComplete: true });

        // Request the completed detection data and display it
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs[0] && tabs[0].id === message.tabId) {
            if (this.debugMode) Logger.ui('[Detection] Fetching completed detection data...');

            chrome.runtime.sendMessage(
              { type: 'GET_DETECTION_DATA', tabId: message.tabId },
              async (response) => {
                if (chrome.runtime.lastError) {
                  Logger.error('UI', '[Detection] Error fetching completed data:', chrome.runtime.lastError);
                  if (!this.isShowingResults || this.currentResults.length === 0) {
                    this.showEmptyState();
                  }
                  return;
                }

                if (response && response.data) {
                  // Process and display the completed detection
                  await Detection.processDetectionData(
                    {
                      detection: this,
                      detectionEngine: this.detectionEngine,
                      detectorManager: this.detectorManager,
                      history: this.history
                    },
                    response.data
                  );
                } else {
                  if (this.debugMode) Logger.debug('UI', '[Detection] No data in completion response');
                  if (!this.isShowingResults || this.currentResults.length === 0) {
                    this.showEmptyState();
                  }
                }
              }
            );
          }
        });
      }

      // Listen for cache scope changes from Settings
      if (message.type === 'DETECTION_CLEAR_CACHE') {
        (async () => {
          Logger.ui('[Detection] Cache scope changed - checking for cached data with new scope');

          // Clear current results display
          this.currentResults = [];

          // Clear pagination
          if (this.paginationManager) {
            this.paginationManager.setItems([]);
          }

          // Clear result cards from DOM
          const detectionResults = document.querySelector('#detectionResults');
          if (detectionResults) {
            detectionResults.innerHTML = '';
          }

          // Set flags to prevent auto-detection
          this.justClearedCache = true;
          this.cacheCleared = true;

          // Update cache info display to reflect new cache scope from settings
          this.updateCacheInfo();

          // Check if there's cached detection data for the new scope
          try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0]) return;

            // Request detection data with new cache scope
            chrome.runtime.sendMessage(
              { type: 'GET_DETECTION_DATA', tabId: tabs[0].id },
              async (response) => {
                if (chrome.runtime.lastError) {
                  Logger.ui('[Detection] No cached data for new scope - showing empty state');
                  this.showEmptyState();
                  // Set badge to CLR (cleared)
                  try {
                    await chrome.action.setBadgeText({ text: BADGE.TEXT.CLEARED, tabId: tabs[0].id });
                    await chrome.action.setBadgeBackgroundColor({
                      color: BADGE.COLORS.CLEARED,
                      tabId: tabs[0].id
                    });
                  } catch (e) { /* Tab may be closed */ }
                  return;
                }

                if (response && response.data) {
                  // Found cached data for new scope - display it
                  Logger.ui('[Detection] Found cached data for new scope - displaying');

                  // Use ScrapflyPopup's processDetectionData to display results
                  if (window.popupInstance) {
                    await window.popupInstance.processDetectionData(response.data);
                  } else {
                    // Fallback: display directly
                    await this.displayResults(response.data.detections);
                  }
                } else {
                  // No cached data for new scope - show empty state
                  Logger.ui('[Detection] No cached data for new scope - showing empty state');
                  this.showEmptyState();
                  // Set badge to CLR (cleared)
                  try {
                    await chrome.action.setBadgeText({ text: BADGE.TEXT.CLEARED, tabId: tabs[0].id });
                    await chrome.action.setBadgeBackgroundColor({
                      color: BADGE.COLORS.CLEARED,
                      tabId: tabs[0].id
                    });
                  } catch (e) { /* Tab may be closed */ }
                }
              }
            );
          } catch (error) {
            if (this.debugMode) Logger.debug('UI', '[Detection] Error checking for cached data:', error);
            this.showEmptyState();
          }

          if (sendResponse) {
            sendResponse({ success: true });
          }
        })();

        return true; // Keep message channel open for async response
      }
    });
  }

  /**
   * Extract badge status helper
   * Consolidates 6+ duplicate badge checking logic blocks into single helper
   * Returns object with status and additional metadata for easier state management
   * FIX: Now distinguishes between cleared cache (gray ✕) and interrupted detection (other ✕)
   */
  static async getBadgeStatus(...args) {
    return await DetectionRequests.getBadgeStatus.apply(this, args);
  }
  createAnalysisSteps(...args) {
    return DetectionUI.createAnalysisSteps.apply(this, args);
  }
  showLoadingState(...args) {
    return DetectionUI.showLoadingState.apply(this, args);
  }
  renderAnalysisSteps(...args) {
    return DetectionUI.renderAnalysisSteps.apply(this, args);
  }
  startAnalysisProgress(...args) {
    return DetectionUI.startAnalysisProgress.apply(this, args);
  }
  updateAnalysisStepStates(...args) {
    return DetectionUI.updateAnalysisStepStates.apply(this, args);
  }
  updateAnalysisPercent(...args) {
    return DetectionUI.updateAnalysisPercent.apply(this, args);
  }
  stopAnalysisProgress(...args) {
    return DetectionUI.stopAnalysisProgress.apply(this, args);
  }
  updateRealProgress(...args) {
    return DetectionUI.updateRealProgress.apply(this, args);
  }
  updateMethodStatus(...args) {
    return DetectionUI.updateMethodStatus.apply(this, args);
  }
  handleLoadingTimeout(...args) {
    return DetectionUI.handleLoadingTimeout.apply(this, args);
  }
  clearLoadingTimeout(...args) {
    return DetectionUI.clearLoadingTimeout.apply(this, args);
  }
  hideLoadingState(...args) {
    return DetectionUI.hideLoadingState.apply(this, args);
  }
  showAnalyzingState(...args) {
    return DetectionUI.showAnalyzingState.apply(this, args);
  }
  showEmptyState(...args) {
    return DetectionUI.showEmptyState.apply(this, args);
  }
  refreshEmptyStateI18n(...args) {
    return DetectionUI.refreshEmptyStateI18n.apply(this, args);
  }
  refreshDetectionStateI18n(...args) {
    return DetectionUI.refreshDetectionStateI18n.apply(this, args);
  }
  showDisabledState(...args) {
    return DetectionUI.showDisabledState.apply(this, args);
  }
  async displayResults(...args) {
    return await DetectionUI.displayResults.apply(this, args);
  }
  updateStats(...args) {
    return DetectionUI.updateStats.apply(this, args);
  }
  updateUrlDisplay(...args) {
    return DetectionUI.updateUrlDisplay.apply(this, args);
  }
  updateCacheInfo(...args) {
    return DetectionUI.updateCacheInfo.apply(this, args);
  }
  formatExpiryRemaining(...args) {
    return DetectionUI.formatExpiryRemaining.apply(this, args);
  }
  setCopyableValue(...args) {
    return DetectionUI.setCopyableValue.apply(this, args);
  }
  async copyCopyableValue(...args) {
    return await DetectionUI.copyCopyableValue.apply(this, args);
  }
  async clearCache(...args) {
    return await DetectionActions.clearCache.apply(this, args);
  }
  async uploadDetectionsToPaste(...args) {
    return await DetectionActions.uploadDetectionsToPaste.apply(this, args);
  }
  resetClearCacheButton(...args) {
    return DetectionActions.resetClearCacheButton.apply(this, args);
  }
  async addToBlacklist(...args) {
    return await DetectionActions.addToBlacklist.apply(this, args);
  }
  showBlacklistState(...args) {
    return DetectionActions.showBlacklistState.apply(this, args);
  }
  async removeFromBlacklist(...args) {
    return await DetectionActions.removeFromBlacklist.apply(this, args);
  }
  renderDetectionsPage(...args) {
    return DetectionUI.renderDetectionsPage.apply(this, args);
  }
  getCategoryBadges(...args) {
    return DetectionUI.getCategoryBadges.apply(this, args);
  }
  getMethodBadges(...args) {
    return DetectionUI.getMethodBadges.apply(this, args);
  }
  copyDetection(...args) {
    return DetectionModals.copyDetection.apply(this, args);
  }
  async copyDetectionOverview(...args) {
    return await DetectionModals.copyDetectionOverview.apply(this, args);
  }
  copyMethodValue(...args) {
    return DetectionModals.copyMethodValue.apply(this, args);
  }
  getDetectionByIndex(...args) {
    return DetectionModals.getDetectionByIndex.apply(this, args);
  }
  getGlobalDetectionIndex(...args) {
    return DetectionModals.getGlobalDetectionIndex.apply(this, args);
  }
  initializeModalElements(...args) {
    return DetectionModals.initializeModalElements.apply(this, args);
  }
  openDetectionModal(...args) {
    return DetectionModals.openDetectionModal.apply(this, args);
  }
  closeDetectionModal(...args) {
    return DetectionModals.closeDetectionModal.apply(this, args);
  }
  renderDetectionModalContent(...args) {
    return DetectionModals.renderDetectionModalContent.apply(this, args);
  }
  attachModalMethodHandlers(...args) {
    return DetectionModals.attachModalMethodHandlers.apply(this, args);
  }
  getFilteredResults(...args) {
    return DetectionUI.getFilteredResults.apply(this, args);
  }
  sortDetectionsByCategory(...args) {
    return DetectionUI.sortDetectionsByCategory.apply(this, args);
  }
  handleSearch(...args) {
    return DetectionUI.handleSearch.apply(this, args);
  }
  async refreshAnalysis(...args) {
    return await DetectionActions.refreshAnalysis.apply(this, args);
  }
  getDetectorIcon(...args) {
    return DetectionUI.getDetectorIcon.apply(this, args);
  }
  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this.initializingPromise) {
      await this.initializingPromise;
      return;
    }

    this.initializingPromise = (async () => {
      await this.loadHTML();
      this.setupPagination();
      this.setupEventListeners();
      this.initialized = true;

      // Load debug mode from settings
      try {
        const settings = await Utils.getSettings();
        this.debugMode = settings.debugMode || false;
      } catch (e) {
        this.debugMode = false;
      }

      // Expose copy function globally for onclick handlers
      window.scrapflyDetection = this;
    })();

    try {
      await this.initializingPromise;
    } finally {
      this.initializingPromise = null;
    }
  }

  /**
   * Setup pagination manager
   */
  setupPagination() {
    this.paginationManager = new PaginationManager('detectionPagination', {
      itemsPerPage: 2,
      onPageChange: (page, items) => {
        this.renderDetectionsPage(items);
      }
    });
  }

  /**
   * Load HTML template into detection tab
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('sections/detection/detection.html'));
      const html = await response.text();

      const detectionTab = document.querySelector('#detectionTab');
      if (detectionTab) {
        detectionTab.innerHTML = html;
        this.htmlLoaded = true;
        if (typeof I18n !== 'undefined') {
          I18n.apply(detectionTab);
        }
        this.renderAnalysisSteps();
        const loadingState = document.querySelector('#loadingState');
        if (loadingState && loadingState.style.display !== 'none') {
          // Initialize UI for real progress updates (not old step-animation)
          this.stopAnalysisProgress();
          this.clearLoadingTimeout();
          this.analysisStepIndex = 0;
          this.updateAnalysisStepStates();
          this.updateAnalysisPercent(0);
          this.loadingTimeout = setTimeout(() => {
            this.handleLoadingTimeout();
          }, this.loadingTimeoutDuration);

          // Sync popup progress with current badge percentage
          chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
              try {
                const badgeText = await chrome.action.getBadgeText({ tabId: tabs[0].id });
                // Badge percentage sync removed - no longer showing percentages in badge
              } catch (error) {
                if (this.debugMode) Logger.debug('UI', '[Detection] Could not read badge text:', error);
              }
            }
          });
        }
      } else {
        this.htmlLoaded = false;
      }
    } catch (error) {
      this.htmlLoaded = false;
      Logger.error('UI', 'Failed to load detection HTML:', error);
    }
  }

  /**
   * Setup event listeners after HTML is loaded
   */
  setupEventListeners() {
    // NOTE: no `listenersAttached` short-circuit here — loadHTML() rebuilds the
    // detection tab's innerHTML (destroying old element listeners), and the
    // re-show path re-calls this to re-bind. Per-target dataset guards (e.g.
    // copyValueHandlerBound) prevent any genuine double-binding instead.
    // Reset modal elements to ensure they are properly initialized
    this.modalElements = null;

    // Setup search functionality
    const searchInput = document.querySelector('#detectionSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    const detectionResults = document.querySelector('#detectionResults');
    if (detectionResults && detectionResults.dataset.copyValueHandlerBound !== 'true') {
      detectionResults.dataset.copyValueHandlerBound = 'true';
      detectionResults.addEventListener('click', (e) => {
        DetectionUI.handleCopyableValueClick.call(this, e);
      }, true);
      detectionResults.addEventListener('keydown', (e) => {
        DetectionUI.handleCopyableValueKeyDown.call(this, e);
      }, true);
    }

    // Setup upload-to-paste button
    const uploadPasteBtn = document.querySelector('#uploadPasteBtn');
    if (uploadPasteBtn) {
      uploadPasteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.uploadDetectionsToPaste();
      });
    }

    // Setup clear cache button
    const clearCacheBtn = document.querySelector('#clearCacheBtn');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', () => {
        this.clearCache();
      });
    }

    // Setup copy overview button
    const copyOverviewBtn = document.querySelector('#copyOverviewBtn');
    if (copyOverviewBtn) {
      copyOverviewBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.copyDetectionOverview();
      });
    }

    // Setup add to blacklist button
    const addToBlacklistBtn = document.querySelector('#addToBlacklistBtn');
    if (addToBlacklistBtn) {
      addToBlacklistBtn.addEventListener('click', () => {
        this.addToBlacklist();
      });
    }

    // Reload button removed - users should manually reload the page

    // Setup remove from blacklist button
    const removeFromBlacklistBtn = document.querySelector('#removeFromBlacklistBtn');
    if (removeFromBlacklistBtn) {
      removeFromBlacklistBtn.addEventListener('click', async () => {
        const blacklistDomain = document.querySelector('#blacklistDomain');
        const domain = blacklistDomain ? blacklistDomain.textContent : '';
        if (domain) {
          await this.removeFromBlacklist(domain);
        }
      });
    }

    // Setup disabled state blacklist button - removes current domain from blacklist
    const disabledBlacklistBtn = document.querySelector('#disabledBlacklistBtn');
    if (disabledBlacklistBtn) {
      disabledBlacklistBtn.addEventListener('click', async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.url) {
            const url = new URL(tab.url);
            await this.removeFromBlacklist(url.hostname);
            // Hide the button after removing
            disabledBlacklistBtn.classList.remove('visible');
          }
        } catch (error) {
          Logger.error('UI', 'Failed to remove from blacklist:', error);
          const removeErrMsg = (typeof I18n !== 'undefined') ? I18n.tr('failedRemoveBlacklist', 'Failed to remove from blacklist') : 'Failed to remove from blacklist';
          NotificationHelper.error(removeErrMsg);
        }
      });
    }

    // NOTE: Message listeners are now set up in setupMessageListeners() called from constructor
    // This ensures they're active even before tab initialization

    this.initializeModalElements();
  }

  // ============================================================================
  // Static Methods (Background & Popup Context)
  // ============================================================================

  /**
   * Request detection data for current tab
   * @param {object} context - {detection, Utils, processDetectionDataCallback}
   */
  static async requestCurrentTabDetection(...args) {
    return await DetectionRequests.requestCurrentTabDetection.apply(this, args);
  }
  static async processDetectionData(...args) {
    return await DetectionRequests.processDetectionData.apply(this, args);
  }
  static async getBadgeText(...args) {
    return await DetectionRequests.getBadgeText.apply(this, args);
  }
  static async getBadgeBackgroundColor(...args) {
    return await DetectionRequests.getBadgeBackgroundColor.apply(this, args);
  }
  async clearBadgeForEmptyState(...args) {
    return await DetectionUI.clearBadgeForEmptyState.apply(this, args);
  }
  hexToRgb(...args) {
    return DetectionUI.hexToRgb.apply(this, args);
  }
  getDifficultyInfo(...args) {
    return DetectionUI.getDifficultyInfo.apply(this, args);
  }
}

if (typeof window !== 'undefined') {
  window.Detection = Detection;
}
