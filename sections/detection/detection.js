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
    this.lastNotificationTime = 0;
    this.notificationDebounceTime = 2000; // 2 seconds debounce
    this.analysisSteps = this.createAnalysisSteps();
    this.analysisStepIndex = 0;
    this.analysisProgressInterval = null;
    this.loadingTimeout = null;
    this.loadingTimeoutDuration = 10000; // 10 seconds timeout
    this.modalElements = null;
    this.activeModalIndex = null;
    this.handleModalKeyDown = null;
    this.wasInterrupted = false; // Track if detection was interrupted to prevent confusing state flow
    this.debugMode = false; // Debug logging flag, loaded from settings
    this.isRequestingDetection = false; // FIX: Track if we're already requesting detection
    this.isShowingAnalyzing = false; // FIX: Track if analyzing state is already showing
    this.isShowingResults = false; // FIX: Track if displaying results to prevent message listeners from overriding
    this.isExtensionEnabled = true;
    this.cacheCleared = false; // FIX: Track if cache was cleared while tab was hidden - refresh when tab becomes visible
    this.advancedSection = null; // Reference to Advanced section for cross-component notifications
    this.uiStates = (typeof DetectionUIStates !== 'undefined')
      ? DetectionUIStates
      : {
        EMPTY: 'empty',
        LOADING: 'loading',
        ANALYZING: 'analyzing',
        RESULTS: 'results',
        DISABLED: 'disabled',
        INTERRUPTED: 'interrupted'
      };
    this.uiStateMachine = (typeof DetectionUIStateMachine !== 'undefined')
      ? new DetectionUIStateMachine(this.uiStates.EMPTY)
      : null;

    // Setup message listeners immediately (before initialization) so they work even if tab not accessed yet
    this.setupMessageListeners();

    chrome.storage.local.get(['scrapfly_enabled'])
      .then((result) => {
        this.setExtensionEnabled(result.scrapfly_enabled !== false);
      })
      .catch(() => {
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
    // FIX: Listen for tab URL changes while popup is open
    // When user navigates, transition to analyzing state to show live progress
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'loading' && changeInfo.url) {
        if (this.debugMode) Logger.ui('[Detection] Tab navigated to:', changeInfo.url);
        // Check if detection is starting (badge will show %)
        chrome.action.getBadgeText({ tabId }, (badgeText) => {
          if (badgeText && badgeText.endsWith('%')) {
            // Detection started - transition to analyzing state
            if (this.debugMode) Logger.ui('[Detection] Navigation detected, badge shows progress, transitioning to analyzing state');
            // FIX: Don't override if already showing results
            if (!this.wasInterrupted && !this.isShowingResults && this.isExtensionEnabled !== false) {
              this.showAnalyzingState();
            }
          }
        });
      }
    });

    // FIX: Listen for real-time detection progress from background
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
        if (this.debugMode) Logger.ui('[Detection] Received progress update:', message.progress);

        // CRITICAL: If popup is not in analyzing state, transition to it
        // This handles case where popup is open showing old results when new detection starts
        // FIX: Don't override if already showing results (cached detection)
        const loadingState = document.querySelector('#loadingState');
        if (!loadingState || loadingState.style.display === 'none') {
          if (this.debugMode) Logger.ui('[Detection] Progress received but not in analyzing state - transitioning now');
          if (!this.wasInterrupted && !this.isShowingResults) {
            this.showAnalyzingState();
          }
        }

        this.updateRealProgress(message.progress);
      }

      // FIX: Listen for detection completion from background
      if (message.type === 'NEW_DETECTION_DATA') {
        if (!this.isExtensionEnabled) {
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
                  this.showEmptyState();
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
                  if (this.debugMode) Logger.warn('UI', '[Detection] No data in completion response');
                  this.showEmptyState();
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
            if (this.debugMode) Logger.warn('UI', '[Detection] Error checking for cached data:', error);
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
  showDisabledState(...args) {
    return DetectionUI.showDisabledState.apply(this, args);
  }
  showInterruptedState(...args) {
    return DetectionUI.showInterruptedState.apply(this, args);
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
  async clearCache(...args) {
    return await DetectionActions.clearCache.apply(this, args);
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
        const result = await chrome.storage.local.get(['scrapfly_settings']);
        const settings = result.scrapfly_settings || {};
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
        this.renderAnalysisSteps();
        const loadingState = document.querySelector('#loadingState');
        if (loadingState && loadingState.style.display !== 'none') {
          // FIX: Don't call startAnalysisProgress() - it runs old animation
          // Instead, initialize UI for real progress updates only
          this.stopAnalysisProgress();
          this.clearLoadingTimeout();
          this.analysisStepIndex = 0;
          this.updateAnalysisStepStates();
          this.updateAnalysisPercent(0);
          this.loadingTimeout = setTimeout(() => {
            this.handleLoadingTimeout();
          }, this.loadingTimeoutDuration);

          // FIX: Read current badge percentage and sync popup with it
          // This ensures popup shows same % as badge (in case popup opened after progress updates)
          chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
              try {
                const badgeText = await chrome.action.getBadgeText({ tabId: tabs[0].id });
                // Badge percentage sync removed - no longer showing percentages in badge
              } catch (error) {
                if (this.debugMode) Logger.warn('UI', '[Detection] Could not read badge text:', error);
              }
            }
          });
        }
      } else {
        this.htmlLoaded = false;
      }
    } catch (error) {
      this.htmlLoaded = false;
      if (this.debugMode) Logger.error('UI', 'Failed to load detection HTML:', error);
    }
  }

  /**
   * Setup event listeners after HTML is loaded
   */
  setupEventListeners() {
    // Reset modal elements to ensure they are properly initialized
    this.modalElements = null;

    // Setup search functionality
    const searchInput = document.querySelector('#detectionSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
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
          if (this.debugMode) Logger.error('UI', 'Failed to remove from blacklist:', error);
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
  static requestFreshDetection(...args) {
    return DetectionRequests.requestFreshDetection.apply(this, args);
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

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Detection;
} else if (typeof window !== 'undefined') {
  window.Detection = Detection;
}
