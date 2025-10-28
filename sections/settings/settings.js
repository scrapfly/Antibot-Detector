class Settings {
  constructor() {
    this.settings = {
      notificationsEnabled: true,
      debugMode: false,
      autoDetectionEnabled: true,
      historyLimit: 100,
      confidenceThreshold: 70
    };
    this.isModalVisible = false;
  }

  /**
   * Show settings modal
   */
  showSettings() {
    const settingsModal = document.querySelector('#settingsModal');
    if (settingsModal) {
      settingsModal.style.display = 'flex';
      this.isModalVisible = true;
      this.loadSettings();
    }
  }

  /**
   * Hide settings modal
   */
  hideSettings() {
    const settingsModal = document.querySelector('#settingsModal');
    if (settingsModal) {
      settingsModal.style.display = 'none';
      this.isModalVisible = false;
    }
  }

  /**
   * Switch between settings tabs
   * @param {string} tabName - Name of tab to switch to (general, detection, history, data)
   */
  switchTab(tabName) {
    // Update tab buttons
    const allTabButtons = document.querySelectorAll('.settings-tab-btn');
    allTabButtons.forEach(btn => {
      if (btn.getAttribute('data-settings-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update tab content
    const allTabContents = document.querySelectorAll('.settings-tab-content');
    allTabContents.forEach(content => {
      if (content.getAttribute('data-tab-content') === tabName) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }

  /**
   * Load settings from Chrome storage and update UI
   */
  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['scrapfly_settings']);

      if (result.scrapfly_settings) {
        const savedSettings = JSON.parse(result.scrapfly_settings);
        // Extract the nested "settings" property from the saved data
        // Fallback to savedSettings for legacy data without nested structure
        this.settings = { ...this.settings, ...(savedSettings.settings || savedSettings) };
      }

      this.updateSettingsUI();
      console.log('Settings loaded:', this.settings);

    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Save settings to Chrome storage
   */
  async saveSettings() {
    try {
      const settingsData = {
        timestamp: new Date().toISOString(),
        settings: this.settings
      };

      await chrome.storage.local.set({
        'scrapfly_settings': JSON.stringify(settingsData, null, 2)
      });

      console.log('Settings saved:', this.settings);
      NotificationHelper.success('Settings saved successfully!');

    } catch (error) {
      console.error('Failed to save settings:', error);
      NotificationHelper.error('Failed to save settings: ' + error.message);
    }
  }

  /**
   * Update settings UI with current values
   */
  updateSettingsUI() {
    const notificationsToggle = document.querySelector('#notificationsEnabled');
    const debugModeToggle = document.querySelector('#debugModeGeneral');
    const autoDetectionToggle = document.querySelector('#autoDetectionEnabled');
    const historyLimitInput = document.querySelector('#historyLimit');
    const confidenceSlider = document.querySelector('#confidenceThreshold');
    const confidenceValue = document.querySelector('#confidenceValue');

    if (notificationsToggle) {
      notificationsToggle.checked = this.settings.notificationsEnabled;
    }

    if (debugModeToggle) {
      debugModeToggle.checked = this.settings.debugMode;
    }

    if (autoDetectionToggle) {
      autoDetectionToggle.checked = this.settings.autoDetectionEnabled;
    }

    if (historyLimitInput) {
      historyLimitInput.value = this.settings.historyLimit;
    }

    if (confidenceSlider) {
      confidenceSlider.value = this.settings.confidenceThreshold;
    }

    if (confidenceValue) {
      confidenceValue.textContent = `${this.settings.confidenceThreshold}%`;
    }
  }

  /**
   * Get current settings from UI inputs
   */
  getSettingsFromUI() {
    const notificationsToggle = document.querySelector('#notificationsEnabled');
    const debugModeToggle = document.querySelector('#debugModeGeneral');
    const autoDetectionToggle = document.querySelector('#autoDetectionEnabled');
    const historyLimitInput = document.querySelector('#historyLimit');
    const confidenceSlider = document.querySelector('#confidenceThreshold');

    return {
      notificationsEnabled: notificationsToggle?.checked ?? this.settings.notificationsEnabled,
      debugMode: debugModeToggle?.checked ?? this.settings.debugMode,
      autoDetectionEnabled: autoDetectionToggle?.checked ?? this.settings.autoDetectionEnabled,
      historyLimit: parseInt(historyLimitInput?.value ?? this.settings.historyLimit),
      confidenceThreshold: parseInt(confidenceSlider?.value ?? this.settings.confidenceThreshold)
    };
  }

  /**
   * Validate settings values
   * @param {object} settings - Settings object to validate
   * @returns {object} Validation result with isValid and errors
   */
  validateSettings(settings) {
    const errors = [];

    if (settings.historyLimit < 10 || settings.historyLimit > 1000) {
      errors.push('History limit must be between 10 and 1000');
    }

    if (settings.confidenceThreshold < 0 || settings.confidenceThreshold > 100) {
      errors.push('Confidence threshold must be between 0 and 100');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Reset settings to default values
   */
  async resetToDefaults() {
    const confirmed = await NotificationHelper.confirm({
      title: 'Reset Settings',
      message: 'Are you sure you want to reset all settings to their default values? This action cannot be undone.',
      type: 'warning',
      confirmText: 'Reset',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      this.settings = {
        notificationsEnabled: true,
        autoDetectionEnabled: true,
        historyLimit: 100,
        confidenceThreshold: 70
      };

      this.updateSettingsUI();
      await this.saveSettings();
      NotificationHelper.success('Settings reset to defaults!');
    }
  }

  /**
   * Clear all extension data
   */
  async clearAllData() {
    const confirmed = await NotificationHelper.confirm({
      title: 'Clear All Data',
      message: 'Are you sure you want to clear ALL extension data? This will remove:<br><br>• All detection history<br>• All detector rules<br>• All settings<br><br>This action cannot be undone!',
      type: 'danger',
      confirmText: 'Clear Everything',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      try {
        await chrome.storage.local.clear();
        NotificationHelper.success('All data cleared successfully! The extension will reload.');

        // Reload the extension after a short delay
        setTimeout(() => {
          chrome.runtime.reload();
        }, 2000);

      } catch (error) {
        console.error('Failed to clear data:', error);
        NotificationHelper.error('Failed to clear data: ' + error.message);
      }
    }
  }

  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccessMessage(message) {
    this.showNotification(message, 'success');
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showErrorMessage(message) {
    this.showNotification(message, 'error');
  }

  /**
   * Show notification message
   * @param {string} message - Message text
   * @param {string} type - Message type (success, error, info)
   */
  showNotification(message, type = 'info') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.settings-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `settings-notification settings-notification-${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">${this.getNotificationIcon(type)}</span>
        <span class="notification-text">${message}</span>
        <button class="notification-close">×</button>
      </div>
    `;

    // Add to modal
    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
      modalContent.insertBefore(notification, modalContent.firstChild);
    }

    // Setup close button
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => notification.remove());
    }

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }

  /**
   * Get notification icon for message type
   * @param {string} type - Message type
   * @returns {string} Icon emoji
   */
  getNotificationIcon(type) {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  }

  /**
   * Setup event listeners for settings
   */
  setupEventListeners() {
    // Settings button in header
    const settingsBtn = document.querySelector('#settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.showSettings());
    }

    // Close modal button
    const closeSettingsBtn = document.querySelector('#closeSettingsModal');
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => this.hideSettings());
    }

    // Save settings button
    const saveSettingsBtn = document.querySelector('#saveSettingsBtn');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => this.handleSaveSettings());
    }

    // Cancel settings button
    const cancelSettingsBtn = document.querySelector('#cancelSettingsBtn');
    if (cancelSettingsBtn) {
      cancelSettingsBtn.addEventListener('click', () => this.hideSettings());
    }

    // Reset settings button
    const resetSettingsBtn = document.querySelector('#resetSettingsBtn');
    if (resetSettingsBtn) {
      resetSettingsBtn.addEventListener('click', () => this.resetToDefaults());
    }

    // Clear all data button
    const clearAllDataBtn = document.querySelector('#clearAllDataBtn');
    if (clearAllDataBtn) {
      clearAllDataBtn.addEventListener('click', () => this.clearAllData());
    }

    // Confidence threshold slider
    const confidenceSlider = document.querySelector('#confidenceThreshold');
    const confidenceValue = document.querySelector('#confidenceValue');
    if (confidenceSlider && confidenceValue) {
      confidenceSlider.addEventListener('input', (e) => {
        confidenceValue.textContent = `${e.target.value}%`;
      });
    }

    // Tab navigation
    const tabButtons = document.querySelectorAll('.settings-tab-btn');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-settings-tab');
        this.switchTab(tabName);
      });
    });

    // Close modal when clicking outside
    const settingsModal = document.querySelector('#settingsModal');
    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
          this.hideSettings();
        }
      });
    }

    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isModalVisible) {
        this.hideSettings();
      }
    });
  }

  /**
   * Handle save settings button click
   */
  async handleSaveSettings() {
    try {
      const newSettings = this.getSettingsFromUI();
      const validation = this.validateSettings(newSettings);

      if (!validation.isValid) {
        NotificationHelper.error('Invalid settings: ' + validation.errors.join(', '));
        return;
      }

      this.settings = newSettings;
      await this.saveSettings();

      // Close modal after successful save
      this.hideSettings();

    } catch (error) {
      console.error('Failed to handle save settings:', error);
      NotificationHelper.error('Failed to save settings: ' + error.message);
    }
  }

  /**
   * Get current settings
   * @returns {object} Current settings object
   */
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
    console.log('Settings section initializing...');
    await this.loadHTML();
    this.setupEventListeners();
    await this.loadSettings();
    console.log('Settings section initialized');
  }

  /**
   * Load HTML template into settings modal
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('sections/settings/settings.html'));
      const html = await response.text();

      const settingsModal = document.querySelector('#settingsModal');
      if (settingsModal) {
        settingsModal.innerHTML = html;
      }
    } catch (error) {
      console.error('Failed to load settings HTML:', error);
    }
  }

  // ============================================================================
  // Static Methods (Background & Popup Context)
  // ============================================================================

  /**
   * Load toggle state from storage and apply to toggle element
   * @param {HTMLElement} toggle - Toggle element
   */
  static async loadToggleState(toggle) {
    if (!toggle) return;

    try {
      const result = await chrome.storage.local.get(['scrapfly_enabled']);
      const isEnabled = result.scrapfly_enabled !== false; // Default to true
      toggle.checked = isEnabled;
      console.log('Toggle state loaded:', isEnabled);
    } catch (error) {
      console.error('Failed to load toggle state:', error);
      toggle.checked = true; // Default to enabled on error
    }
  }

  /**
   * Load and apply default tab from settings
   * @param {Function} switchTabCallback - Callback to switch tab
   */
  static async loadAndApplyDefaultTab(switchTabCallback) {
    try {
      const settings = await Utils.getSettings();
      const defaultTab = settings.defaultTab || 'detection';
      switchTabCallback(defaultTab);
    } catch (error) {
      console.error('Failed to load default tab:', error);
      switchTabCallback('detection'); // Fallback to detection tab
    }
  }

  /**
   * Handle enable/disable toggle change
   * @param {boolean} enabled - New enabled state
   */
  static async handleEnableToggle(enabled) {
    try {
      await chrome.storage.local.set({ scrapfly_enabled: enabled });
      console.log('Extension enabled state updated:', enabled);

      // Broadcast to all contexts
      chrome.runtime.sendMessage({
        type: 'EXTENSION_TOGGLE_CHANGED',
        enabled: enabled
      }).catch(() => {
        // Ignore if popup not open
      });

      // Update all tab badges
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (enabled) {
          chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch((error) => {
            // Expected: Tab might be closed
            console.log(`[Settings] Failed to clear badge for tab ${tab.id}:`, error.message);
          });
        } else {
          chrome.action.setBadgeText({ text: '✕', tabId: tab.id }).catch((error) => {
            // Expected: Tab might be closed
            console.log(`[Settings] Failed to set disabled badge for tab ${tab.id}:`, error.message);
          });
          chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId: tab.id }).catch((error) => {
            // Expected: Tab might be closed
            console.log(`[Settings] Failed to set badge color for tab ${tab.id}:`, error.message);
          });
        }
      }
    } catch (error) {
      console.error('Failed to handle toggle:', error);
      throw error;
    }
  }

  /**
   * Handle settings updated message from popup
   * @param {object} context - Context with chrome, CategoryManager, categoryManager
   * @param {Function} sendResponse - Response callback
   */
  static async handleSettingsUpdated(context, sendResponse) {
    try {
      const { chrome, CategoryManager, categoryManager } = context;

      // Invalidate settings cache
      Utils.invalidateSettingsCache();

      // Reload category manager if colors changed
      if (categoryManager) {
        await categoryManager.loadFromStorage();
      }

      sendResponse({ status: 'success' });
    } catch (error) {
      console.error('Failed to handle settings update:', error);
      sendResponse({ status: 'error', error: error.message });
    }
  }

  /**
   * Send webhook notification if enabled in settings
   * @param {object} pageData - Page data
   * @param {Array} detectionResults - Detection results
   */
  static async sendWebhookIfEnabled(pageData, detectionResults) {
    try {
      const settings = await Utils.getSettings();
      if (!settings.webhookEnabled || !settings.webhookUrl) {
        return;
      }

      // Send webhook
      await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: pageData.url,
          hostname: pageData.hostname,
          detections: detectionResults,
          timestamp: Date.now()
        })
      });

      console.log('Webhook sent successfully');
    } catch (error) {
      console.error('Failed to send webhook:', error);
    }
  }

  /**
   * Check if URL is blacklisted (wrapper for Utils method)
   * @param {string} url - URL to check
   * @returns {Promise<boolean>} True if blacklisted
   */
  static async isUrlBlacklisted(url) {
    return Utils.isUrlBlacklisted(url);
  }

  /**
   * Dispatch JS API event to page window
   * @param {string} eventName - Event name (e.g., 'onScrapflyDetection', 'ready')
   * @param {object} data - Event data payload
   * @returns {Promise<boolean>} True if event was dispatched
   */
  static async dispatchJsApiEvent(eventName, data = {}) {
    try {
      // Check if JS API is enabled in settings
      const settings = await Utils.getSettings();
      if (!settings.jsApiEnabled) {
        console.log(`Scrapfly JS API: Disabled in settings, skipping ${eventName} event`);
        return false;
      }

      // Dispatch CustomEvent to page window
      const event = new CustomEvent(`scrapfly:${eventName}`, {
        detail: {
          ...data,
          timestamp: data.timestamp || new Date().toISOString(),
          version: '1.0.0'
        },
        bubbles: true,
        cancelable: false
      });

      window.dispatchEvent(event);
      console.log(`Scrapfly JS API: Dispatched ${eventName} event`, data);
      return true;

    } catch (error) {
      console.error(`Scrapfly JS API: Failed to dispatch ${eventName} event:`, error);
      return false;
    }
  }

  /**
   * Dispatch ready event to notify page that Scrapfly extension is loaded
   * @returns {Promise<boolean>} True if event was dispatched
   */
  static async dispatchReadyEvent() {
    try {
      const settings = await Utils.getSettings();

      return Settings.dispatchJsApiEvent('ready', {
        enabled: settings.autoDetectionEnabled !== false,
        confidenceThreshold: settings.confidenceThreshold || 70,
        version: chrome.runtime.getManifest().version
      });

    } catch (error) {
      console.error('Scrapfly JS API: Failed to dispatch ready event:', error);
      return false;
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Settings;
} else if (typeof window !== 'undefined') {
  window.Settings = Settings;
}
