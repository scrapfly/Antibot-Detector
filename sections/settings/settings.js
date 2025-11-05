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

      // Badge Colors
      badgeColors: {
        low: '#4CAF50',    // Green
        medium: '#FFA500', // Orange
        high: '#FF4444'    // Red
      },

      // Category Colors
      categoryColors: {
        antibot: '#FF5733',
        captcha: '#33C3FF',
        fingerprint: '#8D33FF'
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
        cacheScope: 'path',
        blacklistedDomains: []
      },

      // JS API Settings
      jsApi: {
        enableJsApi: false
      },

      // Webhook Settings
      webhook: {
        enableWebhook: false,
        webhookOnCache: false,
        webhookMethod: 'POST',
        webhookUrl: '',
        webhookContentType: 'application/json',
        webhookPayload: ''
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
      }
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
        const loadedSettings = savedSettings.settings || savedSettings;

        // Properly merge nested settings structure
        if (typeof loadedSettings === 'object' && loadedSettings !== null) {
          // Deep merge: preserve nested structure for detection, history, etc.
          this.settings = this.deepMerge(this.settings, loadedSettings);
        }
      }

      this.updateSettingsUI();
      console.log('Settings loaded:', this.settings);

    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Deep merge two objects, preserving nested structure
   * @param {object} target - Target object to merge into
   * @param {object} source - Source object to merge from
   * @returns {object} Merged object
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          // Recursively merge nested objects
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          // Copy primitive values and arrays
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Save settings to Chrome storage
   */
  async saveSettings() {
    try {
      // Get old cache scope before saving (to detect changes)
      let oldCacheScope = null;
      try {
        const result = await chrome.storage.local.get(['scrapfly_settings']);
        if (result.scrapfly_settings) {
          const savedSettings = JSON.parse(result.scrapfly_settings);
          const loadedSettings = savedSettings.settings || savedSettings;
          oldCacheScope = loadedSettings.cacheScope || loadedSettings.detection?.cacheScope || 'path';
        }
      } catch (error) {
        console.warn('Could not read old cache scope:', error);
      }

      const settingsData = {
        timestamp: new Date().toISOString(),
        settings: this.settings
      };

      await chrome.storage.local.set({
        'scrapfly_settings': JSON.stringify(settingsData, null, 2)
      });

      console.log('Settings saved:', this.settings);

      // Check if cache scope changed
      const newCacheScope = this.settings.cacheScope || this.settings.detection?.cacheScope || 'path';
      const cacheScopeChanged = oldCacheScope && oldCacheScope !== newCacheScope;

      if (cacheScopeChanged) {
        console.log(`[Settings] Cache scope changed from "${oldCacheScope}" to "${newCacheScope}" - clearing detection cache`);

        // Clear detection cache from storage
        await Utils.clearDetectionCache();

        // Clear in-memory URL hash cache in popup context
        Utils.clearUrlHashCache();

        // Notify background worker to clear its cache
        chrome.runtime.sendMessage({ type: 'CACHE_SCOPE_CHANGED' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to notify background of cache scope change:', chrome.runtime.lastError.message);
          }
        });

        // Notify Detection tab to clear results
        chrome.runtime.sendMessage({ type: 'DETECTION_CLEAR_CACHE' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to notify Detection tab:', chrome.runtime.lastError.message);
          }
        });

        NotificationHelper.success('Settings saved! Cache cleared due to scope change.');
      } else {
        NotificationHelper.success('Settings saved successfully!');
      }

      // Notify background script to sync category colors
      chrome.runtime.sendMessage({ type: 'SYNC_CATEGORY_COLORS' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Failed to sync category colors:', chrome.runtime.lastError.message);
        } else {
          console.log('Category colors synced:', response);
        }
      });

    } catch (error) {
      console.error('Failed to save settings:', error);
      NotificationHelper.error('Failed to save settings: ' + error.message);
    }
  }

  /**
   * Update settings UI with current values
   */
  updateSettingsUI() {
    // ========== GENERAL TAB ==========
    // Basic toggles
    const notificationsToggle = document.querySelector('#notificationsEnabled');
    if (notificationsToggle) {
      notificationsToggle.checked = this.settings.notificationsEnabled ?? true;
    }

    const debugModeToggle = document.querySelector('#debugModeGeneral');
    if (debugModeToggle) {
      debugModeToggle.checked = this.settings.debugMode ?? false;
    }

    // Log Collector (only visible if debug mode is enabled)
    const logCollectorSection = document.querySelector('#logCollectorSection');
    if (logCollectorSection) {
      logCollectorSection.style.display = (this.settings.debugMode ?? false) ? 'block' : 'none';
    }

    const logCollectorToggle = document.querySelector('#logCollectorEnabled');
    if (logCollectorToggle) {
      logCollectorToggle.checked = this.settings.logCollectorEnabled ?? false;
    }

    // Show log collector controls if enabled
    const logCollectorControls = document.querySelector('#logCollectorControls');
    if (logCollectorControls) {
      logCollectorControls.style.display = (this.settings.logCollectorEnabled ?? false) ? 'block' : 'none';
    }

    // Load max logs setting
    const logCollectorMaxLogsInput = document.querySelector('#logCollectorMaxLogs');
    if (logCollectorMaxLogsInput) {
      logCollectorMaxLogsInput.value = this.settings.logCollectorMaxLogs ?? 5000;
    }

    // Update the max logs display
    const logCountMax = document.querySelector('#logCountMax');
    if (logCountMax) {
      logCountMax.textContent = this.settings.logCollectorMaxLogs ?? 5000;
    }

    // If Log Collector is already enabled, start updating the log count immediately
    if (this.settings.logCollectorEnabled ?? false) {
      this.startLogCountUpdate();
    }

    // Badge Colors
    if (this.settings.badgeColors) {
      const colorBadgeLow = document.querySelector('#colorBadgeLow');
      if (colorBadgeLow) colorBadgeLow.value = this.settings.badgeColors.low || '#4CAF50';

      const colorBadgeMedium = document.querySelector('#colorBadgeMedium');
      if (colorBadgeMedium) colorBadgeMedium.value = this.settings.badgeColors.medium || '#FFA500';

      const colorBadgeHigh = document.querySelector('#colorBadgeHigh');
      if (colorBadgeHigh) colorBadgeHigh.value = this.settings.badgeColors.high || '#FF4444';
    }

    // Category Colors
    if (this.settings.categoryColors) {
      const colorAntibot = document.querySelector('#colorAntibot');
      if (colorAntibot) colorAntibot.value = this.settings.categoryColors.antibot || '#FF5733';

      const colorCaptcha = document.querySelector('#colorCaptcha');
      if (colorCaptcha) colorCaptcha.value = this.settings.categoryColors.captcha || '#33C3FF';

      const colorFingerprint = document.querySelector('#colorFingerprint');
      if (colorFingerprint) colorFingerprint.value = this.settings.categoryColors.fingerprint || '#8D33FF';
    }

    // Tag Colors
    if (this.settings.tagColors) {
      const colorTagDOM = document.querySelector('#colorTagDOM');
      if (colorTagDOM) colorTagDOM.value = this.settings.tagColors.dom || '#8D33FF';

      const colorTagHeaders = document.querySelector('#colorTagHeaders');
      if (colorTagHeaders) colorTagHeaders.value = this.settings.tagColors.headers || '#FF33A8';

      const colorTagCookies = document.querySelector('#colorTagCookies');
      if (colorTagCookies) colorTagCookies.value = this.settings.tagColors.cookies || '#FFC133';

      const colorTagContent = document.querySelector('#colorTagContent');
      if (colorTagContent) colorTagContent.value = this.settings.tagColors.content || '#33FFF3';

      const colorTagURLs = document.querySelector('#colorTagURLs');
      if (colorTagURLs) colorTagURLs.value = this.settings.tagColors.urls || '#00BCD4';

      const colorTagJSHooks = document.querySelector('#colorTagJSHooks');
      if (colorTagJSHooks) colorTagJSHooks.value = this.settings.tagColors.js_hooks || '#00E5FF';

      const colorTagWindow = document.querySelector('#colorTagWindow');
      if (colorTagWindow) colorTagWindow.value = this.settings.tagColors.window || '#4CAF50';

      const colorTagPayload = document.querySelector('#colorTagPayload');
      if (colorTagPayload) colorTagPayload.value = this.settings.tagColors.payload || '#9C27B0';
    }

    // ========== DETECTION TAB ==========
    if (this.settings.detection) {
      const cacheScopeSelect = document.querySelector('#cacheScope');
      if (cacheScopeSelect) {
        cacheScopeSelect.value = this.settings.detection.cacheScope || 'full';
        console.log('Cache scope loaded:', this.settings.detection.cacheScope);
      }

      const cacheDurationInput = document.querySelector('#cacheDuration');
      if (cacheDurationInput) {
        cacheDurationInput.value = this.settings.detection.cacheDuration || 12;
      }

      const cacheUnitSelect = document.querySelector('#cacheUnit');
      if (cacheUnitSelect) {
        cacheUnitSelect.value = this.settings.detection.cacheUnit || 'hours';
      }
    }

    // JS API Settings
    if (this.settings.jsApi) {
      const enableJsApi = document.querySelector('#enableJsApi');
      if (enableJsApi) {
        enableJsApi.checked = this.settings.jsApi.enableJsApi ?? false;
      }
    }

    // Webhook Settings
    if (this.settings.webhook) {
      const enableWebhook = document.querySelector('#enableWebhook');
      if (enableWebhook) enableWebhook.checked = this.settings.webhook.enableWebhook ?? false;

      const webhookOnCache = document.querySelector('#webhookOnCache');
      if (webhookOnCache) webhookOnCache.checked = this.settings.webhook.webhookOnCache ?? false;

      const webhookMethod = document.querySelector('#webhookMethod');
      if (webhookMethod) webhookMethod.value = this.settings.webhook.webhookMethod || 'POST';

      const webhookUrl = document.querySelector('#webhookUrl');
      if (webhookUrl) webhookUrl.value = this.settings.webhook.webhookUrl || '';

      const webhookContentType = document.querySelector('#webhookContentType');
      if (webhookContentType) webhookContentType.value = this.settings.webhook.webhookContentType || 'application/json';

      const webhookPayload = document.querySelector('#webhookPayload');
      if (webhookPayload) webhookPayload.value = this.settings.webhook.webhookPayload || '';
    }

    // ========== HISTORY TAB ==========
    if (this.settings.history) {
      const historyLimitInput = document.querySelector('#historyLimit');
      if (historyLimitInput) historyLimitInput.value = this.settings.history.historyLimit ?? 0;

      const autoClearDays = document.querySelector('#autoClearDays');
      if (autoClearDays) autoClearDays.value = this.settings.history.autoClearDays ?? 30;

      const exportFormat = document.querySelector('#exportFormat');
      if (exportFormat) exportFormat.value = this.settings.history.exportFormat || 'json';

      const includeTimestamps = document.querySelector('#includeTimestamps');
      if (includeTimestamps) includeTimestamps.checked = this.settings.history.includeTimestamps ?? true;

      const historyBypassCache = document.querySelector('#historyBypassCache');
      if (historyBypassCache) historyBypassCache.checked = this.settings.history.historyBypassCache ?? false;
    }

    // Duplicate Prevention Settings
    if (this.settings.duplicatePrevention) {
      const preventDuplicates = document.querySelector('#preventDuplicates');
      if (preventDuplicates) preventDuplicates.checked = this.settings.duplicatePrevention.preventDuplicates ?? false;

      const duplicateScope = document.querySelector('#duplicateScope');
      if (duplicateScope) duplicateScope.value = this.settings.duplicatePrevention.duplicateScope || 'full_url';

      const duplicateDuration = document.querySelector('#duplicateDuration');
      if (duplicateDuration) duplicateDuration.value = this.settings.duplicatePrevention.duplicateDuration ?? 1;

      const duplicateUnit = document.querySelector('#duplicateUnit');
      if (duplicateUnit) duplicateUnit.value = this.settings.duplicatePrevention.duplicateUnit || 'hours';
    }

    // Legacy fields that might still be around
    const autoDetectionToggle = document.querySelector('#autoDetectionEnabled');
    if (autoDetectionToggle) {
      autoDetectionToggle.checked = this.settings.autoDetectionEnabled ?? true;
    }

    const confidenceSlider = document.querySelector('#confidenceThreshold');
    const confidenceValue = document.querySelector('#confidenceValue');
    if (confidenceSlider) {
      confidenceSlider.value = this.settings.confidenceThreshold ?? 70;
    }
    if (confidenceValue) {
      confidenceValue.textContent = `${this.settings.confidenceThreshold ?? 70}%`;
    }
  }

  /**
   * Get current settings from UI inputs
   */
  getSettingsFromUI() {
    const settings = {};

    // ========== GENERAL TAB ==========
    // Basic toggles
    const notificationsToggle = document.querySelector('#notificationsEnabled');
    const debugModeToggle = document.querySelector('#debugModeGeneral');
    const logCollectorToggle = document.querySelector('#logCollectorEnabled');
    const logCollectorMaxLogsInput = document.querySelector('#logCollectorMaxLogs');
    settings.notificationsEnabled = notificationsToggle?.checked ?? this.settings.notificationsEnabled ?? true;
    settings.debugMode = debugModeToggle?.checked ?? this.settings.debugMode ?? false;
    settings.logCollectorEnabled = logCollectorToggle?.checked ?? this.settings.logCollectorEnabled ?? false;
    settings.logCollectorMaxLogs = parseInt(logCollectorMaxLogsInput?.value ?? this.settings.logCollectorMaxLogs ?? 5000);

    // Badge Colors
    settings.badgeColors = {
      low: document.querySelector('#colorBadgeLow')?.value ?? this.settings.badgeColors?.low ?? '#4CAF50',
      medium: document.querySelector('#colorBadgeMedium')?.value ?? this.settings.badgeColors?.medium ?? '#FFA500',
      high: document.querySelector('#colorBadgeHigh')?.value ?? this.settings.badgeColors?.high ?? '#FF4444'
    };

    // Category Colors
    settings.categoryColors = {
      antibot: document.querySelector('#colorAntibot')?.value ?? this.settings.categoryColors?.antibot ?? '#FF5733',
      captcha: document.querySelector('#colorCaptcha')?.value ?? this.settings.categoryColors?.captcha ?? '#33C3FF',
      fingerprint: document.querySelector('#colorFingerprint')?.value ?? this.settings.categoryColors?.fingerprint ?? '#8D33FF'
    };

    // Tag Colors
    settings.tagColors = {
      dom: document.querySelector('#colorTagDOM')?.value ?? this.settings.tagColors?.dom ?? '#8D33FF',
      headers: document.querySelector('#colorTagHeaders')?.value ?? this.settings.tagColors?.headers ?? '#FF33A8',
      cookies: document.querySelector('#colorTagCookies')?.value ?? this.settings.tagColors?.cookies ?? '#FFC133',
      content: document.querySelector('#colorTagContent')?.value ?? this.settings.tagColors?.content ?? '#33FFF3',
      urls: document.querySelector('#colorTagURLs')?.value ?? this.settings.tagColors?.urls ?? '#00BCD4',
      js_hooks: document.querySelector('#colorTagJSHooks')?.value ?? this.settings.tagColors?.js_hooks ?? '#00E5FF',
      window: document.querySelector('#colorTagWindow')?.value ?? this.settings.tagColors?.window ?? '#4CAF50',
      payload: document.querySelector('#colorTagPayload')?.value ?? this.settings.tagColors?.payload ?? '#9C27B0'
    };

    // ========== DETECTION TAB ==========
    settings.detection = {
      cacheDuration: parseInt(document.querySelector('#cacheDuration')?.value ?? this.settings.detection?.cacheDuration ?? 12),
      cacheUnit: document.querySelector('#cacheUnit')?.value ?? this.settings.detection?.cacheUnit ?? 'hours',
      cacheScope: document.querySelector('#cacheScope')?.value ?? this.settings.detection?.cacheScope ?? 'full',
      blacklistedDomains: this.settings.detection?.blacklistedDomains || [] // This is managed separately by the blacklist UI
    };

    // JS API Settings
    settings.jsApi = {
      enableJsApi: document.querySelector('#enableJsApi')?.checked ?? this.settings.jsApi?.enableJsApi ?? false
    };

    // Webhook Settings
    settings.webhook = {
      enableWebhook: document.querySelector('#enableWebhook')?.checked ?? this.settings.webhook?.enableWebhook ?? false,
      webhookOnCache: document.querySelector('#webhookOnCache')?.checked ?? this.settings.webhook?.webhookOnCache ?? false,
      webhookMethod: document.querySelector('#webhookMethod')?.value ?? this.settings.webhook?.webhookMethod ?? 'POST',
      webhookUrl: document.querySelector('#webhookUrl')?.value ?? this.settings.webhook?.webhookUrl ?? '',
      webhookContentType: document.querySelector('#webhookContentType')?.value ?? this.settings.webhook?.webhookContentType ?? 'application/json',
      webhookPayload: document.querySelector('#webhookPayload')?.value ?? this.settings.webhook?.webhookPayload ?? ''
    };

    // ========== HISTORY TAB ==========
    settings.history = {
      historyLimit: parseInt(document.querySelector('#historyLimit')?.value ?? this.settings.history?.historyLimit ?? 0),
      autoClearDays: parseInt(document.querySelector('#autoClearDays')?.value ?? this.settings.history?.autoClearDays ?? 30),
      exportFormat: document.querySelector('#exportFormat')?.value ?? this.settings.history?.exportFormat ?? 'json',
      includeTimestamps: document.querySelector('#includeTimestamps')?.checked ?? this.settings.history?.includeTimestamps ?? true,
      historyBypassCache: document.querySelector('#historyBypassCache')?.checked ?? this.settings.history?.historyBypassCache ?? false
    };

    // Duplicate Prevention Settings
    settings.duplicatePrevention = {
      preventDuplicates: document.querySelector('#preventDuplicates')?.checked ?? this.settings.duplicatePrevention?.preventDuplicates ?? false,
      duplicateScope: document.querySelector('#duplicateScope')?.value ?? this.settings.duplicatePrevention?.duplicateScope ?? 'full_url',
      duplicateDuration: parseInt(document.querySelector('#duplicateDuration')?.value ?? this.settings.duplicatePrevention?.duplicateDuration ?? 1),
      duplicateUnit: document.querySelector('#duplicateUnit')?.value ?? this.settings.duplicatePrevention?.duplicateUnit ?? 'hours'
    };

    // Keep any other existing settings that might not be in the form
    // (autoDetectionEnabled, confidenceThreshold are not in the current form)
    settings.autoDetectionEnabled = this.settings.autoDetectionEnabled ?? true;
    settings.confidenceThreshold = this.settings.confidenceThreshold ?? 70;

    return settings;
  }

  /**
   * Validate settings values
   * @param {object} settings - Settings object to validate
   * @returns {object} Validation result with isValid and errors
   */
  validateSettings(settings) {
    const errors = [];

    // Validate history limit (can be 0 for unlimited)
    if (settings.history && settings.history.historyLimit !== undefined) {
      if (settings.history.historyLimit < 0 || settings.history.historyLimit > 10000) {
        errors.push('History limit must be between 0 (unlimited) and 10000');
      }
    }

    // Validate confidence threshold
    if (settings.confidenceThreshold !== undefined) {
      if (settings.confidenceThreshold < 0 || settings.confidenceThreshold > 100) {
        errors.push('Confidence threshold must be between 0 and 100');
      }
    }

    // Validate cache duration
    if (settings.detection && settings.detection.cacheDuration !== undefined) {
      if (settings.detection.cacheDuration < 1 || settings.detection.cacheDuration > 9999) {
        errors.push('Cache duration must be between 1 and 9999');
      }
    }

    // Validate auto clear days
    if (settings.history && settings.history.autoClearDays !== undefined) {
      if (settings.history.autoClearDays < 0 || settings.history.autoClearDays > 365) {
        errors.push('Auto clear days must be between 0 and 365');
      }
    }

    // Validate duplicate duration
    if (settings.duplicatePrevention && settings.duplicatePrevention.duplicateDuration !== undefined) {
      if (settings.duplicatePrevention.duplicateDuration < 1 || settings.duplicatePrevention.duplicateDuration > 999) {
        errors.push('Duplicate duration must be between 1 and 999');
      }
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

    // Debug Mode toggle - show/hide Log Collector section
    const debugModeToggle = document.querySelector('#debugModeGeneral');
    if (debugModeToggle) {
      debugModeToggle.addEventListener('change', (e) => {
        const logCollectorSection = document.querySelector('#logCollectorSection');
        if (logCollectorSection) {
          logCollectorSection.style.display = e.target.checked ? 'block' : 'none';
        }
      });
    }

    // Log Collector toggle - show/hide controls and enable/disable collection
    const logCollectorToggle = document.querySelector('#logCollectorEnabled');
    if (logCollectorToggle) {
      logCollectorToggle.addEventListener('change', (e) => {
        const logCollectorControls = document.querySelector('#logCollectorControls');
        if (logCollectorControls) {
          logCollectorControls.style.display = e.target.checked ? 'block' : 'none';
        }

        // Send message to background to enable/disable log collection
        if (e.target.checked) {
          chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_ENABLE' }).catch(() => {
            console.log('Failed to enable log collection');
          });
          // Start updating log count
          this.startLogCountUpdate();
        } else {
          chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_DISABLE' }).catch(() => {
            console.log('Failed to disable log collection');
          });
          // Stop updating log count
          this.stopLogCountUpdate();
        }
      });
    }

    // Log Collector action buttons
    const exportLogsJsonBtn = document.querySelector('#exportLogsJsonBtn');
    if (exportLogsJsonBtn) {
      exportLogsJsonBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_EXPORT_JSON' }).catch(() => {
          NotificationHelper.error('Failed to export logs');
        });
      });
    }

    const exportLogsTextBtn = document.querySelector('#exportLogsTextBtn');
    if (exportLogsTextBtn) {
      exportLogsTextBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_EXPORT_TEXT' }).catch(() => {
          NotificationHelper.error('Failed to export logs');
        });
      });
    }

    const clearLogsBtn = document.querySelector('#clearLogsBtn');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', async () => {
        const confirmed = await NotificationHelper.confirm({
          title: 'Clear Logs',
          message: 'Are you sure you want to clear all collected logs? This action cannot be undone.',
          type: 'warning',
          confirmText: 'Clear',
          cancelText: 'Cancel'
        });

        if (confirmed) {
          chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_CLEAR' }).then(() => {
            // Update log count to 0
            const logCountValue = document.querySelector('#logCountValue');
            if (logCountValue) {
              logCountValue.textContent = '0';
            }
            NotificationHelper.success('Logs cleared successfully');
          }).catch(() => {
            NotificationHelper.error('Failed to clear logs');
          });
        }
      });
    }

    // Max Logs input listener - send to background when changed
    const logCollectorMaxLogsInput = document.querySelector('#logCollectorMaxLogs');
    if (logCollectorMaxLogsInput) {
      logCollectorMaxLogsInput.addEventListener('change', (e) => {
        const maxLogs = parseInt(e.target.value || 5000);
        // Update the display
        const logCountMax = document.querySelector('#logCountMax');
        if (logCountMax) {
          logCountMax.textContent = maxLogs;
        }
        // Send to background to update LogCollector
        chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_SET_MAX_LOGS', maxLogs: maxLogs }).catch(() => {
          console.log('Failed to set max logs');
        });
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

    // Setup color pagination controls
    this.setupColorPagination();
  }

  /**
   * Start updating log count every 2 seconds
   */
  startLogCountUpdate() {
    if (this.logCountUpdateInterval) {
      clearInterval(this.logCountUpdateInterval);
    }

    // Update immediately
    this.updateLogCount();

    // Then update every 2 seconds
    this.logCountUpdateInterval = setInterval(() => {
      this.updateLogCount();
    }, 2000);
  }

  /**
   * Stop updating log count
   */
  stopLogCountUpdate() {
    if (this.logCountUpdateInterval) {
      clearInterval(this.logCountUpdateInterval);
      this.logCountUpdateInterval = null;
    }
  }

  /**
   * Get current log count and update UI
   */
  updateLogCount() {
    chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_GET_COUNT' }).then((response) => {
      if (response && typeof response.count === 'number') {
        const logCountValue = document.querySelector('#logCountValue');
        if (logCountValue) {
          logCountValue.textContent = response.count;
        }
      }
    }).catch(() => {
      // Silently ignore errors
    });
  }

  /**
   * Setup color pagination controls
   */
  setupColorPagination() {
    const prevBtn = document.querySelector('#colorPrevBtn');
    const nextBtn = document.querySelector('#colorNextBtn');
    const pageNum = document.querySelector('#colorPageNum');
    const totalPages = document.querySelector('#colorTotalPages');
    const pages = document.querySelectorAll('.color-page');

    if (!prevBtn || !nextBtn || !pageNum || !totalPages || pages.length === 0) {
      return;
    }

    let currentPage = 1;
    const total = pages.length;

    const updatePagination = () => {
      // Update page display
      pageNum.textContent = currentPage;

      // Show/hide pages
      pages.forEach((page, index) => {
        page.style.display = (index + 1) === currentPage ? 'block' : 'none';
      });

      // Enable/disable buttons
      prevBtn.disabled = currentPage === 1;
      nextBtn.disabled = currentPage === total;
    };

    // Previous button
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        updatePagination();
      }
    });

    // Next button
    nextBtn.addEventListener('click', () => {
      if (currentPage < total) {
        currentPage++;
        updatePagination();
      }
    });

    // Initialize
    updatePagination();
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

      // Merge new settings with existing settings to preserve nested structure
      this.settings = this.deepMerge(this.settings, newSettings);
      console.log('Settings merged:', this.settings);

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
   * @param {object} context - Optional context with DetectionEngineManager, CategoryManager, categoryManager
   */
  static async handleEnableToggle(enabled, context = null) {
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
          // When enabling, check for cached detection data
          if (context && context.DetectionEngineManager && context.CategoryManager && context.categoryManager) {
            const storedData = await context.DetectionEngineManager.getStoredDetection(tab.url);
            if (storedData && storedData.detectionCount > 0) {
              // Restore badge from cached data
              const badgeColors = await context.CategoryManager.getBadgeColors(context.categoryManager);
              const count = storedData.detectionCount.toString();
              const color = storedData.detectionCount >= 5 ? badgeColors.high :
                           storedData.detectionCount >= 3 ? badgeColors.medium :
                           badgeColors.low;

              chrome.action.setBadgeText({ text: count, tabId: tab.id }).catch((error) => {
                console.log(`[Settings] Failed to set badge for tab ${tab.id}:`, error.message);
              });
              chrome.action.setBadgeBackgroundColor({ color: color, tabId: tab.id }).catch((error) => {
                console.log(`[Settings] Failed to set badge color for tab ${tab.id}:`, error.message);
              });
            } else {
              // No cached detections, clear badge
              chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch((error) => {
                console.log(`[Settings] Failed to clear badge for tab ${tab.id}:`, error.message);
              });
            }
          } else {
            // Fallback: just clear badge if dependencies not provided
            chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch((error) => {
              console.log(`[Settings] Failed to clear badge for tab ${tab.id}:`, error.message);
            });
          }
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
