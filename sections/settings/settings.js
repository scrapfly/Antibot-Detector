class Settings {
  constructor() {
    // Initialize with complete nested structure and defaults
    this.settings = {
      // Basic toggles
      notificationsEnabled: true,
      debugMode: false,
      autoDetectionEnabled: true,
      logCollectorEnabled: false,
      logCollectorMaxLogs: 5000,

      // Badge Colors (using BADGE constants as defaults)
      badgeColors: {
        low: '#22c55e',    // Green (BADGE.COLORS.LOW)
        medium: '#f59e0b', // Amber (BADGE.COLORS.MEDIUM)
        high: '#ef4444'    // Red (BADGE.COLORS.HIGH)
      },

      // Category Colors
      categoryColors: {
        antibot: '#FF5733',
        captcha: '#33C3FF',
        fingerprint: '#3b82f6'
      },

      // Tag Colors
      tagColors: {
        dom: '#8D33FF',
        headers: '#FF33A8',
        cookies: '#FFC133',
        content: '#33FFF3',
        urls: '#00BCD4',
        js_hooks: '#00E5FF',
        window: '#4CAF50',
        payload: '#9C27B0'
      },

      // Detection settings
      detection: {
        cacheDuration: 12,
        cacheUnit: 'hours',
        cacheScope: 'domain',
        blacklistedDomains: []
      },

      // JS API Settings
      jsApi: {
        enableJsApi: false,
        logToConsole: false
      },

      // Webhook Settings
      webhook: {
        enableWebhook: false,
        webhookOnCache: false,
        webhookMethod: 'POST',
        webhookUrl: '',
        webhookContentType: 'application/json',
        webhookPayload: '{"url": "<SITEURL>", "hostname": "<HOSTNAME>", "title": "<TITLE>", "favicon": "<FAVICON>", "detections": <DETECTIONS>, "timestamp": "<TIMESTAMP>", "count": <DETECTION_COUNT>, "categories": "<CATEGORIES>"}',
        webhookHeaders: []
      },

      // History Settings
      history: {
        historyLimit: 0,  // 0 = unlimited
        autoClearDays: 30,
        exportFormat: 'json',
        includeTimestamps: true,
        historyBypassCache: false
      },

      // Duplicate Prevention Settings
      duplicatePrevention: {
        preventDuplicates: false,
        duplicateScope: 'full_url',
        duplicateDuration: 1,
        duplicateUnit: 'hours'
      },

      // Update Settings
      updates: {
        autoUpdate: false,
        checkIntervalHours: 12,
        lastCheckTimestamp: 0
      }
    };

    this.isModalVisible = false;
  }

  /**
   * Show settings modal
   */
  showSettings(...args) {
    return SettingsUI.showSettings.apply(this, args);
  }
  hideSettings(...args) {
    return SettingsUI.hideSettings.apply(this, args);
  }
  switchTab(...args) {
    return SettingsUI.switchTab.apply(this, args);
  }
  async loadSettings(...args) {
    return await SettingsUI.loadSettings.apply(this, args);
  }
  deepMerge(...args) {
    return SettingsUI.deepMerge.apply(this, args);
  }
  async saveSettings(...args) {
    return await SettingsUI.saveSettings.apply(this, args);
  }
  updateSettingsUI(...args) {
    return SettingsUI.updateSettingsUI.apply(this, args);
  }
  getSettingsFromUI(...args) {
    return SettingsUI.getSettingsFromUI.apply(this, args);
  }
  validateSettings(...args) {
    return SettingsUI.validateSettings.apply(this, args);
  }
  async resetToDefaults(...args) {
    return await SettingsUI.resetToDefaults.apply(this, args);
  }
  async clearAllData(...args) {
    return await SettingsUI.clearAllData.apply(this, args);
  }
  showSuccessMessage(...args) {
    return SettingsUI.showSuccessMessage.apply(this, args);
  }
  showErrorMessage(...args) {
    return SettingsUI.showErrorMessage.apply(this, args);
  }
  showNotification(...args) {
    return SettingsUI.showNotification.apply(this, args);
  }
  getNotificationIcon(...args) {
    return SettingsUI.getNotificationIcon.apply(this, args);
  }
  setupEventListeners(...args) {
    return SettingsUI.setupEventListeners.apply(this, args);
  }
  startLogCountUpdate(...args) {
    return SettingsUI.startLogCountUpdate.apply(this, args);
  }
  stopLogCountUpdate(...args) {
    return SettingsUI.stopLogCountUpdate.apply(this, args);
  }
  updateLogCount(...args) {
    return SettingsUI.updateLogCount.apply(this, args);
  }
  setupColorPagination(...args) {
    return SettingsUI.setupColorPagination.apply(this, args);
  }
  renderBlacklistUI(...args) {
    return SettingsUI.renderBlacklistUI.apply(this, args);
  }
  setupBlacklistEventListeners(...args) {
    return SettingsUI.setupBlacklistEventListeners.apply(this, args);
  }
  renderWebhookHeadersUI(...args) {
    return SettingsUI.renderWebhookHeadersUI.apply(this, args);
  }
  escapeHtml(...args) {
    return Utils.escapeHtml(...args);
  }
  async handleSaveSettings(...args) {
    return await SettingsUI.handleSaveSettings.apply(this, args);
  }
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Update a specific setting
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  async updateSetting(key, value) {
    if (this.settings.hasOwnProperty(key)) {
      this.settings[key] = value;
      await this.saveSettings();
    }
  }

  /**
   * Initialize settings section
   */
  async initialize() {
    Logger.ui('Settings section initializing...');
    await this.loadHTML();
    Logger.ui('Settings HTML loaded, setting up event listeners...');
    this.setupEventListeners();
    Logger.ui('Event listeners set up, loading settings...');
    await this.loadSettings();
    Logger.ui('Settings section initialized');
  }

  /**
   * Load HTML template into settings modal
   */
  async loadHTML() {
    try {
      Logger.ui('Loading settings HTML from:', chrome.runtime.getURL('sections/settings/settings.html'));
      const response = await fetch(chrome.runtime.getURL('sections/settings/settings.html'));
      const html = await response.text();
      Logger.ui('Settings HTML fetched, length:', html.length);

      const settingsModal = document.querySelector('#settingsModal');
      if (settingsModal) {
        settingsModal.innerHTML = html;
        Logger.ui('Settings HTML inserted into modal');

        // Verify critical elements exist
        const saveBtn = document.querySelector('#saveSettingsBtn');
        const cancelBtn = document.querySelector('#cancelSettingsBtn');
        Logger.ui('Save button found:', !!saveBtn, 'Cancel button found:', !!cancelBtn);
      } else {
        Logger.error('UI', 'Settings modal container #settingsModal not found in DOM');
      }
    } catch (error) {
      Logger.error('UI', 'Failed to load settings HTML:', error);
    }
  }

  // ============================================================================
  // Static Methods (Background & Popup Context)
  // ============================================================================

  /**
   * Load toggle state from storage and apply to toggle element
   * @param {HTMLElement} toggle - Toggle element
   */
  static async loadToggleState(...args) {
    return await SettingsRuntime.loadToggleState.apply(this, args);
  }
  static async loadAndApplyDefaultTab(...args) {
    return await SettingsRuntime.loadAndApplyDefaultTab.apply(this, args);
  }
  static async handleEnableToggle(...args) {
    return await SettingsRuntime.handleEnableToggle.apply(this, args);
  }
  static async handleSettingsUpdated(...args) {
    return await SettingsRuntime.handleSettingsUpdated.apply(this, args);
  }
  static async sendWebhookIfEnabled(...args) {
    return await SettingsRuntime.sendWebhookIfEnabled.apply(this, args);
  }
  static async isUrlBlacklisted(...args) {
    return await SettingsRuntime.isUrlBlacklisted.apply(this, args);
  }
  static async dispatchJsApiEvent(...args) {
    return await SettingsRuntime.dispatchJsApiEvent.apply(this, args);
  }
  static async dispatchReadyEvent(...args) {
    return await SettingsRuntime.dispatchReadyEvent.apply(this, args);
  }
  updateHttpMethodColor(...args) {
    return SettingsUI.updateHttpMethodColor.apply(this, args);
  }
  setupWebhookMethodRadios(...args) {
    return SettingsUI.setupWebhookMethodRadios.apply(this, args);
  }
  setupCustomHttpMethodDropdown(...args) {
    return SettingsUI.setupCustomHttpMethodDropdown.apply(this, args);
  }
  updateCustomHttpMethodDropdown(...args) {
    return SettingsUI.updateCustomHttpMethodDropdown.apply(this, args);
  }
  async handleTestWebhook(...args) {
    return await SettingsUI.handleTestWebhook.apply(this, args);
  }
  async updateIncompatibleUpdatesDisplay(...args) {
    return await SettingsUI.updateIncompatibleUpdatesDisplay.apply(this, args);
  }
  async handleCheckUpdatesNow(...args) {
    return await SettingsUI.handleCheckUpdatesNow.apply(this, args);
  }

}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Settings;
} else if (typeof window !== 'undefined') {
  window.Settings = Settings;
}