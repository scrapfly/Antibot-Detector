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
    this.advanced = new Advanced(this.detectorManager, this.detection);
    this.settings = new Settings(this.categoryManager);
  }

  async initialize() {
    try {
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
        console.log('Popup: DetectorManager initialized');
      } else {
        console.log('Popup: DetectorManager already initialized');
      }

      // Then initialize all sections (lazy loading enabled)
      await this.initializeSections();

      // OPTIMIZATION Phase A.3: Don't pre-render hidden tabs
      // They'll be loaded on-demand when user switches to them

      // Load and show default tab from settings (will lazy-load that specific tab)
      await this.loadAndApplyDefaultTab();

    } catch (error) {
      console.error('Failed to initialize popup:', error);
    }
  }

  /**
   * Initialize all sections
   * OPTIMIZATION: Lazy loading - only initialize visible tab on startup
   */
  async initializeSections() {
    try {
      // OPTIMIZATION Phase A.3: Only initialize Settings (always needed for toggle)
      // Other sections will be lazy-loaded on first access
      await this.settings.initialize();
      console.log('Settings section initialized (eager)');

      // Mark other sections as NOT initialized - they'll load on-demand
      this.detection.initialized = false;
      this.history.initialized = false;
      this.rules.initialized = false;
      this.advanced.initialized = false;

      console.log('Section initialization complete (lazy loading enabled)');
    } catch (error) {
      console.error('Failed to initialize sections:', error);
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
      console.log('Popup: Enable toggle element found:', enableToggle);
      // Load saved state or default to enabled
      this.loadToggleState();

      // Handle toggle changes
      enableToggle.addEventListener('change', (e) => {
        console.log('Popup: Toggle changed to:', e.target.checked);
        this.handleEnableToggle(e.target.checked);
      });
      console.log('Popup: Toggle event listener attached');
    } else {
      console.error('Popup: Enable toggle element NOT found (#enableToggle)');
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
  }

  /**
   * Handle enable toggle change
   * Delegates to Settings.handleEnableToggle()
   */
  async handleEnableToggle(enabled) {
    try {
      console.log(`Popup: Handling toggle change to ${enabled ? 'ENABLED' : 'DISABLED'}`);
      await Settings.handleEnableToggle(enabled);
      console.log('Popup: Toggle change handled successfully');

      // Immediately update Detection tab if it's currently visible
      if (this.currentTab === 'detection') {
        if (enabled) {
          // Extension enabled - try to load from cache first
          console.log('Popup: Extension enabled - checking for cached data');
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              chrome.runtime.sendMessage(
                { type: 'GET_DETECTION_DATA', tabId: tabs[0].id },
                async (response) => {
                  if (chrome.runtime.lastError) {
                    console.error('Popup: Error getting cached data:', chrome.runtime.lastError);
                    this.detection.showInterruptedState();
                    return;
                  }

                  if (response && response.data) {
                    // Cache exists, display it
                    console.log('Popup: Found cached data, displaying');
                    await this.processDetectionData(response.data);
                  } else {
                    // No cache, show interrupted state (tells user to reload)
                    console.log('Popup: No cached data, showing interrupted state');
                    this.detection.showInterruptedState();
                  }
                }
              );
            }
          });
        } else {
          // Extension disabled - show disabled state immediately
          console.log('Popup: Extension disabled - showing disabled state');
          this.detection.showDisabledState();
        }
      }
    } catch (error) {
      console.error('Popup: Error handling toggle change:', error);
      // Show error to user
      if (typeof NotificationHelper !== 'undefined') {
        NotificationHelper.error(`Failed to ${enabled ? 'enable' : 'disable'} extension: ${error.message}`);
      }
    }
  }

  /**
   * Request detection data for the current tab
   * Delegates to Detection.requestCurrentTabDetection()
   */
  async requestCurrentTabDetection() {
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
      console.log('Popup: Received message:', request.type);

      switch (request.type) {
        case 'NEW_DETECTION_DATA':
          // New detection data available
          console.log('Popup: New detection data available for tab:', request.tabId);
          // If we're on the detection tab, refresh the data
          if (this.currentTab === 'detection') {
            this.requestCurrentTabDetection();
          }
          // Always refresh history when new detection data is available
          if (this.history && typeof this.history.displayHistory === 'function') {
            this.history.displayHistory();
          }
          break;

        case 'CATEGORY_COLORS_UPDATED':
          // Category colors were updated in settings
          console.log('Popup: Category colors updated, refreshing Rules section');
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

        case 'EXTENSION_TOGGLE_CHANGED':
          // Extension was enabled or disabled
          console.log('Popup: Extension toggle changed - enabled:', request.enabled);
          if (this.currentTab === 'detection') {
            if (request.enabled) {
              // Extension enabled - try to load from cache first
              console.log('Popup: Extension enabled - checking for cached data');
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                  chrome.runtime.sendMessage(
                    { type: 'GET_DETECTION_DATA', tabId: tabs[0].id },
                    async (response) => {
                      if (chrome.runtime.lastError) {
                        console.error('Popup: Error getting cached data:', chrome.runtime.lastError);
                        this.detection.showInterruptedState();
                        return;
                      }

                      if (response && response.data) {
                        // Cache exists, display it
                        console.log('Popup: Found cached data, displaying');
                        await this.processDetectionData(response.data);
                      } else {
                        // No cache, show interrupted state (tells user to reload)
                        console.log('Popup: No cached data, showing interrupted state');
                        this.detection.showInterruptedState();
                      }
                    }
                  );
                }
              });
            } else {
              // Extension disabled - show disabled state immediately
              console.log('Popup: Extension disabled - showing disabled state');
              this.detection.showDisabledState();
            }
          }
          break;

        default:
          console.log('Popup: Unknown message type:', request.type);
      }

      sendResponse({ status: 'received' });
      return false;
    });
  }

  switchTab(tabName) {
    console.log('=== SWITCHING TO TAB:', tabName, '===');

    // Cleanup previous section's event listeners before switching
    if (this.currentTab && this.currentTab !== tabName) {
      console.log('Cleaning up previous tab:', this.currentTab);

      // Call cleanup on the previous section if it has the method
      const sectionMap = {
        'detection': this.detection,
        'history': this.history,
        'rules': this.rules,
        'advanced': this.advanced,
        'settings': this.settings
      };

      const previousSection = sectionMap[this.currentTab];
      if (previousSection && typeof previousSection.cleanup === 'function') {
        try {
          previousSection.cleanup();
          console.log(`Cleaned up ${this.currentTab} section`);
        } catch (error) {
          console.error(`Error cleaning up ${this.currentTab} section:`, error);
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
      console.log('Active button updated:', activeBtn);
    }

    // Show/hide tab contents - be VERY explicit
    const allTabs = document.querySelectorAll('.tab-content');
    console.log('Found tabs:', Array.from(allTabs).map(t => ({ id: t.id, display: t.style.display, class: t.className })));

    allTabs.forEach(content => {
      content.style.display = 'none';
      content.style.visibility = 'hidden';
      content.classList.remove('active');
      console.log('HIDING tab:', content.id);
    });

    const targetId = `${tabName}Tab`;
    const activeContent = document.querySelector(`#${targetId}`);
    console.log('Looking for tab content with id:', targetId);
    console.log('Found active content element:', activeContent);

    if (activeContent) {
      activeContent.style.display = 'block';
      activeContent.style.visibility = 'visible';
      activeContent.style.opacity = '1';
      activeContent.style.height = 'auto';
      activeContent.style.overflow = 'visible';
      activeContent.classList.add('active');
      console.log('SHOWING tab content:', activeContent.id);
    } else {
      console.error('Could not find tab content for:', tabName);
      console.log('Available tabs:', Array.from(allTabs).map(t => t.id));
    }

    // OPTIMIZATION Phase A.3: Lazy-load sections on first access
    // Handle section-specific logic when tabs are clicked
    switch (tabName) {
      case 'detection':
        console.log('Loading detection tab...');
        // Lazy initialize if needed
        if (!this.detection.initialized) {
          console.log('Detection: First access - initializing...');
          this.detection.initialize().then(async () => {
            // Check if extension is enabled before loading detection
            const result = await chrome.storage.local.get(['scrapfly_enabled']);
            if (result.scrapfly_enabled === false) {
              console.log('Detection: Extension is disabled, showing disabled state');
              this.detection.showDisabledState();
            } else {
              this.requestCurrentTabDetection();
            }
          });
        } else {
          // Check if extension is enabled before loading detection
          chrome.storage.local.get(['scrapfly_enabled'], (result) => {
            if (result.scrapfly_enabled === false) {
              console.log('Detection: Extension is disabled, showing disabled state');
              this.detection.showDisabledState();
            } else {
              this.requestCurrentTabDetection();
            }
          });
        }
        break;
      case 'history':
        console.log('Loading history tab...');
        // Lazy initialize if needed
        if (!this.history.initialized) {
          console.log('History: First access - initializing...');
          this.history.initialize().then(() => {
            this.history.displayHistory();
          });
        } else {
          // Re-attach event listeners after cleanup (search, clear button, etc.)
          console.log('History: Re-attaching event listeners...');
          this.history.setupEventListeners();
          this.history.displayHistory();
        }
        break;
      case 'rules':
        console.log('Loading rules tab...');
        // Lazy initialize if needed
        if (!this.rules.initialized) {
          console.log('Rules: First access - initializing...');
          this.rules.initialize().then(() => {
            this.rules.displayRules();
          });
        } else {
          // Re-attach event listeners after cleanup (search, buttons, etc.)
          console.log('Rules: Re-attaching event listeners...');
          this.rules.setupEventListeners();
          this.rules.displayRules();
        }
        break;
      case 'advanced':
        console.log('Loading advanced tab...');
        // Lazy initialize if needed
        if (!this.advanced.initialized) {
          console.log('Advanced: First access - initializing...');
          this.advanced.initialize().then(() => {
            this.advanced.displayAdvancedTools();
          });
        } else {
          this.advanced.displayAdvancedTools();
        }
        break;
      default:
        console.log('Unknown tab:', tabName);
    }

    console.log('=== TAB SWITCH COMPLETE ===');
  }

}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const popup = new ScrapflyPopup();
  popup.initialize();
});