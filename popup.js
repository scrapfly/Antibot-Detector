// Popup script for Scrapfly Security Detection Extension

class ScrapflyPopup {
  constructor() {
    this.categoryManager = new CategoryManager();
    this.detectorManager = new DetectorManager(this.categoryManager);
    this.detectionEngine = new DetectionEngineManager();
    this.currentTab = 'detection';
    this.detection = new Detection(this.detectorManager, this.detectionEngine);
    this.history = new History(this.detectorManager);
    this.rules = new Rules(this.detectorManager);
    // Lazy initialize Advanced to avoid race condition on fast systems
    this.advanced = typeof Advanced !== 'undefined' ? new Advanced(this.detectorManager, this.detection) : null;
    // Link Advanced to Detection for cross-component notifications (fixes timing race condition)
    if (this.advanced && this.detection) {
      this.detection.advancedSection = this.advanced;
    }
    this.settings = new Settings(this.categoryManager);
    this.detectionViewRequestId = 0;
  }

  async initialize() {
    try {
      // Test Logger in popup context (with safety check)
      if (typeof Logger !== 'undefined') {
        Logger.popup('Logger initialized in POPUP context');
      }

      // Initialize notification manager using helper
      NotificationHelper.initialize();
      // Clear badge when popup is opened
      NotificationHelper.clearBadge();

      // Set version from manifest
      const manifest = chrome.runtime.getManifest();
      const versionElement = document.querySelector('#appVersion');
      if (versionElement && manifest.version) {
        versionElement.textContent = `v${manifest.version}`;
      }

      this.setupEventListeners();
      this.setupMessageHandlers();

      // Initialize detector manager FIRST (will load from storage if available)
      // Check if already initialized to avoid duplicate initialization
      if (!this.detectorManager.initialized) {
        await this.detectorManager.initialize();
      }

      // Then initialize all sections (lazy loading enabled)
      await this.initializeSections();

      // Don't pre-render hidden tabs
      // They'll be loaded on-demand when user switches to them

      // Load and show default tab from settings (will lazy-load that specific tab)
      await this.loadAndApplyDefaultTab();

    } catch (error) {
      Logger.error('UI', 'Failed to initialize popup:', error);
    }
  }

  /**
   * Initialize all sections
   * Lazy loading - only initialize visible tab on startup
   */
  async initializeSections() {
    try {
      // Only initialize Settings (always needed for toggle)
      // Other sections will be lazy-loaded on first access
      await this.settings.initialize();

      // Mark other sections as NOT initialized - they'll load on-demand
      this.detection.initialized = false;
      this.history.initialized = false;
      this.rules.initialized = false;
      if (this.advanced) {
        this.advanced.initialized = false;
      }
    } catch (error) {
      Logger.error('UI', 'Failed to initialize sections:', error);
    }
  }

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Main enable/disable toggle
    const enableToggle = document.querySelector('#enableToggle');
    if (enableToggle) {
      // Load saved state or default to enabled
      this.loadToggleState();

      // Handle toggle changes
      enableToggle.addEventListener('change', (e) => {
        this.handleEnableToggle(e.target.checked);
      });
    } else {
      Logger.error('UI', 'Popup: Enable toggle element NOT found (#enableToggle)');
    }
  }

  /**
   * Load and apply default tab from settings
   * Delegates to Settings.loadAndApplyDefaultTab()
   */
  async loadAndApplyDefaultTab() {
    await Settings.loadAndApplyDefaultTab((tab) => this.switchTab(tab));
  }

  /**
   * Load toggle state from storage
   * Delegates to Settings.loadToggleState()
   */
  async loadToggleState() {
    const toggle = document.querySelector('#enableToggle');
    await Settings.loadToggleState(toggle);
    if (toggle) {
      this.detection.setExtensionEnabled(toggle.checked);
    }
  }

  /**
   * Handle enable toggle change
   * Delegates to Settings.handleEnableToggle()
   */
  async handleEnableToggle(enabled) {
    try {
      await Settings.handleEnableToggle(enabled);
      this.detection.setExtensionEnabled(enabled !== false);
      const requestId = this.beginDetectionViewRequest();

      // Immediately update Detection tab if it's currently visible
      if (this.currentTab === 'detection') {
        if (enabled) {
          // Extension enabled - try to load from cache first
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && this.isDetectionViewRequestCurrent(requestId)) {
              chrome.runtime.sendMessage(
                { type: 'GET_DETECTION_DATA', tabId: tabs[0].id },
                async (response) => {
                  if (!this.isDetectionViewRequestCurrent(requestId)) {
                    return;
                  }
                  if (chrome.runtime.lastError) {
                    Logger.error('UI', 'Popup: Error getting cached data:', chrome.runtime.lastError);
                    this.detection.showInterruptedState();
                    return;
                  }
                  await this.handleDetectionResponseAndUpdateUI(tabs[0].id, response, requestId);
                }
              );
            }
          });
        } else {
          // Extension disabled - show disabled state immediately
          this.detection.showDisabledState();
        }
      }
    } catch (error) {
      Logger.error('UI', 'Popup: Error handling toggle change:', error);
      // Show error to user
      if (typeof NotificationHelper !== 'undefined') {
        NotificationHelper.error(`Failed to ${enabled ? 'enable' : 'disable'} extension: ${error.message}`);
      }
    }
  }

  beginDetectionViewRequest() {
    this.detectionViewRequestId += 1;
    return this.detectionViewRequestId;
  }

  isDetectionViewRequestCurrent(requestId) {
    return requestId === this.detectionViewRequestId && this.currentTab === 'detection';
  }

  /**
   * Check detection status before requesting
   * Prevents interference with active detections
   */
  async checkAndRequestDetection() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // First, check if detection is already in progress
      chrome.runtime.sendMessage(
        { type: 'GET_DETECTION_DATA', tabId: tab.id },
        async (response) => {
          if (chrome.runtime.lastError) {
            Logger.error('UI', 'Popup: Error checking detection status:', chrome.runtime.lastError);
            this.requestCurrentTabDetection();
            return;
          }

          // Always call requestCurrentTabDetection, it now has safeguards
          // to prevent duplicate requests
          this.requestCurrentTabDetection();
        }
      );
    } catch (error) {
      Logger.error('UI', 'Popup: Error in checkAndRequestDetection:', error);
      this.requestCurrentTabDetection();
    }
  }

  /**
   * Check and display existing detection data without triggering fresh detection
   * FIX: Fetches completed/cached data only, never sends REQUEST_DETECTION
   */
  async checkAndDisplayExistingDetection(requestId = this.beginDetectionViewRequest()) {
    try {
      if (!this.isDetectionViewRequestCurrent(requestId)) {
        return;
      }

      // DEBOUNCE: Prevent spam from multiple rapid calls
      const now = Date.now();
      if (this.lastCheckTime && (now - this.lastCheckTime) < 1000) {
        return;
      }
      this.lastCheckTime = now;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !this.isDetectionViewRequestCurrent(requestId)) return;

      // Check if extension is enabled
      const result = await chrome.storage.local.get(['scrapfly_enabled']);
      const isEnabled = result.scrapfly_enabled !== false;
      this.detection.setExtensionEnabled(isEnabled);
      if (!this.isDetectionViewRequestCurrent(requestId)) return;
      if (!isEnabled) {
        this.detection.showDisabledState();
        return;
      }

      // Check if URL is blacklisted
      if (await Utils.isUrlBlacklisted(tab.url)) {
        if (!this.isDetectionViewRequestCurrent(requestId)) return;
        const url = new URL(tab.url);
        this.detection.showBlacklistState(url.hostname);
        return;
      }

      // Get existing detection data (cache or completed detection)
      chrome.runtime.sendMessage(
        { type: 'GET_DETECTION_DATA', tabId: tab.id },
        async (response) => {
          if (!this.isDetectionViewRequestCurrent(requestId)) {
            return;
          }

          if (chrome.runtime.lastError) {
            this.detection.showEmptyState();
            return;
          }

          const latestState = await chrome.storage.local.get(['scrapfly_enabled']);
          if (!this.isDetectionViewRequestCurrent(requestId)) {
            return;
          }
          if (latestState.scrapfly_enabled === false) {
            this.detection.setExtensionEnabled(false);
            this.detection.showDisabledState();
            return;
          }

          // Check for pending status BEFORE checking for data
          if (response && response.status === 'pending') {
            this.detection.showAnalyzingState();
          } else if (response && response.data) {
            // Check if cache has expired - show empty state instead of stale data
            if (response.data.expiry && Date.now() > response.data.expiry) {
              Logger.ui('[Popup] Cache expired on tab switch, showing empty state');
              this.detection.showEmptyState();
              return;
            }
            // Display existing detection data
            await this.processDetectionData(response.data);
          } else {
            // No data available (includes recently cleared cache)
            this.detection.showEmptyState();
          }
        }
      );
    } catch (error) {
      Logger.error('UI', 'Popup: Error in checkAndDisplayExistingDetection:', error);
      if (this.isDetectionViewRequestCurrent(requestId)) {
        this.detection.showEmptyState();
      }
    }
  }

  /**
   * Handle detection response and update UI state accordingly
   * Consolidates duplicate badge checking logic
   * @param {number} tabId - The tab ID
   * @param {object} response - The detection response from background
   * @returns {Promise<boolean>} - True if data was processed, false if showing a state
   */
  async handleDetectionResponseAndUpdateUI(tabId, response, requestId = this.detectionViewRequestId) {
    if (!this.isDetectionViewRequestCurrent(requestId)) {
      return false;
    }

    if (!response) {
      this.detection.showInterruptedState();
      return false;
    }

    if (response.status === 'pending') {
      this.detection.showAnalyzingState();
      return false;
    }

    if (response.status === 'interrupted') {
      this.detection.showInterruptedState();
      return false;
    }

    if (response.status === 'error') {
      Logger.error('UI', 'Popup: Error retrieving detection data:', response.error);
      this.detection.showInterruptedState();
      return false;
    }

    // Check badge state
    const badgeText = await Detection.getBadgeText(tabId);
    if (!this.isDetectionViewRequestCurrent(requestId)) {
      return false;
    }
    const badgeTrimmed = badgeText ? badgeText.trim() : '';

    if (badgeTrimmed === '\u23F3') {
      this.detection.showAnalyzingState();
      return false;
    }

    // Check if badge is gray ✕ (cache cleared) vs other ✕ (interrupted)
    if (badgeTrimmed === '✕') {
      const badgeColor = await Detection.getBadgeBackgroundColor(tabId);
      if (!this.isDetectionViewRequestCurrent(requestId)) {
        return false;
      }
      if (badgeColor === '#6B7280' || badgeColor === '#6b7280') {
        this.detection.showEmptyState();
        return false;
      }
    }

    if (badgeTrimmed === '?' || badgeTrimmed === '✕') {
      this.detection.showInterruptedState();
      return false;
    }

    if (response.data) {
      if (!this.isDetectionViewRequestCurrent(requestId)) {
        return false;
      }
      await this.processDetectionData(response.data);
      return true;
    } else {
      // FIX 6.10: Check if badge shows numeric count (detection completed but cache not ready)
      // This handles race condition where badge updates before cache write completes
      const isNumericBadge = /^\d+\+?$/.test(badgeTrimmed);
      if (isNumericBadge) {
        // Detection completed (badge is numeric) but cache write still pending
        Logger.debug('UI', 'Badge shows count but no data yet, retrying...', { badge: badgeTrimmed });
        await new Promise(resolve => setTimeout(resolve, 200));
        if (!this.isDetectionViewRequestCurrent(requestId)) {
          return false;
        }
        // Retry getting data
        const retryResponse = await chrome.runtime.sendMessage({
          type: 'GET_DETECTION_DATA',
          tabId: tabId
        });
        if (!this.isDetectionViewRequestCurrent(requestId)) {
          return false;
        }
        if (retryResponse && retryResponse.data) {
          await this.processDetectionData(retryResponse.data);
          return true;
        }
      }
      if (!this.isDetectionViewRequestCurrent(requestId)) {
        return false;
      }
      this.detection.showInterruptedState();
      return false;
    }
  }

  /**
   * Request detection data for the current tab
   * Delegates to Detection.requestCurrentTabDetection()
   */
  async requestCurrentTabDetection() {
    // Notify content script that popup is open (to prevent visibility-triggered detections)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'POPUP_OPENED',
          timestamp: Date.now()
        }).catch((error) => {
          // Content script might not be ready, that's okay
          if (typeof Logger !== 'undefined') {
            Logger.debug('POPUP', 'Could not notify content script of popup open', { error: error.message });
          }
        });
      }
    } catch (error) {
      // Ignore errors - not critical
    }

    await Detection.requestCurrentTabDetection({
      detection: this.detection,
      Utils: Utils,
      processDetectionDataCallback: (data) => this.processDetectionData(data)
    });
  }

  /**
   * Request a fresh detection for a specific tab
   * Delegates to Detection.requestFreshDetection()
   */
  requestFreshDetection(tabId) {
    Detection.requestFreshDetection({
      detection: this.detection,
      tabId: tabId,
      requestCurrentTabDetectionCallback: () => this.requestCurrentTabDetection()
    });
  }

  /**
   * Process detection data received from background
   * Delegates to Detection.processDetectionData()
   */
  async processDetectionData(detectionData) {
    await Detection.processDetectionData({
      detection: this.detection,
      detectionEngine: this.detectionEngine,
      detectorManager: this.detectorManager,
      history: this.history
    }, detectionData);
  }

  /**
   * Setup message handlers for communication with background script
   */
  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Internal hook diagnostics are broadcasted from content scripts; ignore them in the popup.
      // (We still handle a few explicitly below, but this guard prevents noisy "Unknown message type" logs.)
      if (request && typeof request.type === 'string' && request.type.startsWith('HOOK_')) {
        return false;
      }

      switch (request.type) {
        case 'NEW_DETECTION_DATA':
          // New detection data available
          // Check if message is for current active tab
          chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs[0] || tabs[0].id !== request.tabId) {
              return;
            }

            // If we're on detection tab, process results directly from message
            if (this.currentTab === 'detection') {
              // Use detection results from message directly (avoids race condition with reload button)
              if (request.detectionResults && Array.isArray(request.detectionResults)) {
                // Process the results that came with the message
                await this.processDetectionData({
                  detectionResults: request.detectionResults,
                  detectionCount: request.detectionResults.length,
                  url: request.url,
                  fromStorage: false, // Fresh detection
                  cacheMetadata: {
                    url: request.url,
                    timestamp: Date.now()
                  }
                });
              } else {
                // Fallback: No results in message, fetch from storage
                this.requestCurrentTabDetection();
              }
            }
          });
          
          // Always refresh history when new detection data is available
          if (this.history && typeof this.history.displayHistory === 'function') {
            this.history.displayHistory();
          }
          break;

        case 'CATEGORY_COLORS_UPDATED':
          // Category colors were updated in settings
          // Reload categories from storage
          this.categoryManager.loadFromStorage().then(() => {
            // Refresh Rules section display
            if (this.rules && typeof this.rules.displayRules === 'function') {
              this.rules.displayRules();
            }
            // Refresh Detection section display with new colors (without re-fetching)
            if (this.detection && this.detection.currentResults?.length > 0) {
              this.detection.refreshDisplay();
            }
          });
          break;

        case 'EXTENSION_TOGGLE_CHANGED': {
          this.detection.setExtensionEnabled(request.enabled !== false);
          const requestId = this.beginDetectionViewRequest();
          // Extension was enabled or disabled
          if (this.currentTab === 'detection') {
            if (request.enabled) {
              // Extension enabled - try to load from cache first
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && this.isDetectionViewRequestCurrent(requestId)) {
                  chrome.runtime.sendMessage(
                    { type: 'GET_DETECTION_DATA', tabId: tabs[0].id },
                    async (response) => {
                      if (!this.isDetectionViewRequestCurrent(requestId)) {
                        return;
                      }
                      if (chrome.runtime.lastError) {
                        Logger.error('UI', 'Popup: Error getting cached data:', chrome.runtime.lastError);
                        this.detection.showInterruptedState();
                        return;
                      }
                      await this.handleDetectionResponseAndUpdateUI(tabs[0].id, response, requestId);
                    }
                  );
                }
              });
            } else {
              // Extension disabled - show disabled state immediately
              this.detection.showDisabledState();
            }
          }
          break;
        }

        // Internal messages between content scripts and background (silently ignore)
        case 'WINDOW_DETECTIONS':
        case 'WINDOW_PROPS_COMPLETE':
        case 'SCRAPFLY_DEBUG_LOG':
        case 'DEBUG_LOG':
        case 'LOG':
        case 'JS_HOOK_DETECTION_BATCH':
        case 'JS_HOOKS_COMPLETE':
        case 'HOOK_FAILURE_REPORT':
        case 'HOOK_TAMPERING_DETECTED':
        case 'HOOK_RECOVERY_RESULT':
        case 'GET_DETECTORS':
        case 'CHECK_CACHE_EARLY':
        case 'CONTENT_SCRIPT_READY':
        case 'PAGE_LOAD_NOTIFICATION':
        case 'DETECTION_DATA':
        case 'GET_DETECTION_DATA':
        case 'RELOAD_DETECTORS':
        case 'CACHE_HIT_EARLY_EXIT':
          // These are internal messages not meant for popup - ignore silently
          return false;

        case 'DETECTION_PROGRESS':
          // Progress updates are handled by sections/detection/detection.js directly
          return false;

        default:
          Logger.warn('UI', 'Popup: Unknown message type:', request.type);
      }

      sendResponse({ status: 'received' });
      return false;
    });
  }

  async switchTab(tabName) {
    const sectionMap = {
      'detection': this.detection,
      'history': this.history,
      'rules': this.rules,
      'advanced': this.advanced,
      'settings': this.settings
    };

    if (this.currentTab === tabName) {
      const currentSection = sectionMap[tabName];
      if (tabName === 'detection' && this.detection.initializingPromise) {
        return;
      }
      if (currentSection && currentSection.initialized) {
        const shouldSkipRefresh = tabName !== 'detection'
          || (this.detection.htmlLoaded && !this.detection.cacheCleared);
        if (shouldSkipRefresh) {
          return;
        }
      }
    }

    // Cleanup previous section's event listeners before switching
    if (this.currentTab && this.currentTab !== tabName) {
      const previousSection = sectionMap[this.currentTab];
      if (previousSection && typeof previousSection.cleanup === 'function') {
        try {
          previousSection.cleanup();
        } catch (error) {
          Logger.error('UI', `Error cleaning up ${this.currentTab} section:`, error);
        }
      }
    }

    // Update current tab
    this.currentTab = tabName;

    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }

    // Show/hide tab contents
    const allTabs = document.querySelectorAll('.tab-content');

    allTabs.forEach(content => {
      content.style.display = 'none';
      content.style.visibility = 'hidden';
      content.classList.remove('active');
    });

    const targetId = `${tabName}Tab`;
    const activeContent = document.querySelector(`#${targetId}`);

    if (activeContent) {
      activeContent.style.display = 'block';
      activeContent.style.visibility = 'visible';
      activeContent.style.opacity = '1';
      activeContent.style.height = 'auto';
      activeContent.style.overflow = 'visible';
      activeContent.classList.add('active');
    } else {
      Logger.error('UI', 'Could not find tab content for:', tabName);
    }

    // Lazy-load sections on first access
    // Handle section-specific logic when tabs are clicked
    switch (tabName) {
      case 'detection': {
        const requestId = this.beginDetectionViewRequest();

        // Lazy initialize if needed
        if (!this.detection.initialized) {
          this.detection.initialize().then(async () => {
            if (!this.isDetectionViewRequestCurrent(requestId)) {
              return;
            }
            // FIX: Display existing detection data (cache or completed) without triggering fresh detection
            await this.checkAndDisplayExistingDetection(requestId);
          });
        } else {
          // FIX: Even if initialized, ensure HTML is loaded before displaying data
          // This prevents click handlers from being attached to non-existent DOM elements
          if (!this.detection.htmlLoaded) {
            await this.detection.loadHTML();
            this.detection.setupEventListeners();
          }

          // FIX: Check if cache was cleared while tab was hidden
          if (this.detection.cacheCleared) {
            this.detection.cacheCleared = false;
            this.detection.currentResults = [];
            this.detection.showEmptyState();
          } else {
            // FIX: Check cache FIRST before re-rendering potentially stale currentResults
            // checkAndDisplayExistingDetection will show empty state if cache expired,
            // or display valid cached results and update currentResults
            await this.checkAndDisplayExistingDetection(requestId);

            if (!this.isDetectionViewRequestCurrent(requestId)) {
              break;
            }

            // Re-attach click handlers for valid results (if any remain after cache check)
            // This is needed because DOM elements may have been recreated
            if (this.detection.currentResults && this.detection.currentResults.length > 0) {
              if (this.detection.paginationManager) {
                this.detection.paginationManager.setItems(this.detection.currentResults);
              }
            }
          }
        }
        break;
      }
      case 'history':
        // Lazy initialize if needed
        if (!this.history.initialized) {
          this.history.initialize().then(() => {
            this.history.displayHistory();
          });
        } else {
          // Re-attach event listeners after cleanup (search, clear button, etc.)
          this.history.setupEventListeners();
          this.history.displayHistory();
        }
        break;
      case 'rules':
        // Lazy initialize if needed
        if (!this.rules.initialized) {
          this.rules.initialize().then(() => {
            this.rules.displayRules();
          });
        } else {
          // Re-attach event listeners after cleanup (search, buttons, etc.)
          this.rules.setupEventListeners();
          this.rules.displayRules();
        }
        break;
      case 'advanced':
        // Create Advanced instance if it wasn't available during constructor (race condition fix)
        if (!this.advanced && typeof Advanced !== 'undefined') {
          this.advanced = new Advanced(this.detectorManager, this.detection);
          this.advanced.initialized = false;
          // Link Advanced to Detection for cross-component notifications
          if (this.detection) {
            this.detection.advancedSection = this.advanced;
          }
        }
        // Lazy initialize if needed
        if (this.advanced && !this.advanced.initialized) {
          this.advanced.initialize().then(() => {
            this.advanced.displayAdvancedTools();
          });
        } else if (this.advanced) {
          this.advanced.displayAdvancedTools();
        } else {
          Logger.error('UI', 'Advanced: Class not loaded yet');
        }
        break;
    }
  }

}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const popup = new ScrapflyPopup();
  popup.initialize();

  // Expose popup instance and categoryManager globally
  window.popupInstance = popup;
  window.categoryManager = popup.categoryManager;
});
