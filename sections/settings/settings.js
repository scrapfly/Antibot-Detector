class Settings {
  constructor() {
    this.settings = {
      // General
      notificationsEnabled: true,
      debugMode: false,
      autoDetectionEnabled: true,
      historyLimit: 100,
      confidenceThreshold: 70,

      // Badge Colors
      colorBadgeLow: '#4CAF50',
      colorBadgeMedium: '#FFA500',
      colorBadgeHigh: '#FF4444',

      // Category Colors
      colorAntibot: '#FF5733',
      colorCaptcha: '#33C3FF',
      colorFingerprint: '#2196F3',

      // Tag Colors
      colorTagDOM: '#2196F3',
      colorTagHeaders: '#FF33A8',
      colorTagCookies: '#FFC133',
      colorTagContent: '#33FFF3',
      colorTagURLs: '#00BCD4',
      colorTagJSHooks: '#00E5FF',
      colorTagWindow: '#4CAF50',
      colorTagCSS: '#E91E63',

      // Detection Settings
      cacheDuration: 12,
      cacheUnit: 'hours',
      cacheScope: 'domain',
      blacklist: [],
      enableJsApi: false,

      // Webhook Settings
      enableWebhook: false,
      webhookOnCache: false,
      webhookUrl: '',
      webhookMethod: 'POST',
      webhookContentType: 'application/json',
      webhookPayload: '{"url": "<SITEURL>", "detections": <DETECTIONS>, "timestamp": "<TIMESTAMP>", "count": <DETECTION_COUNT>}',

      // History Settings
      historyBehavior: 'rolling',
      autoClearDays: 30,
      exportFormat: 'json',
      includeTimestamps: true,
      historyBypassCache: false,
      preventDuplicates: false,
      duplicateScope: 'full_url',
      duplicateDuration: 1,
      duplicateUnit: 'hours'
    };
    this.isModalVisible = false;
    this.currentColorPage = 1;
    this.totalColorPages = 5;
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
        const savedData = typeof result.scrapfly_settings === 'string'
          ? JSON.parse(result.scrapfly_settings)
          : result.scrapfly_settings;

        // FIX: Properly extract settings from nested structure
        const loadedSettings = savedData.settings || savedData;

        // Merge loaded settings with defaults (preserves any missing fields)
        this.settings = { ...this.settings, ...loadedSettings };

        // FIX: Flatten nested detection settings to match constructor's flat structure
        if (this.settings.detection) {
          // Flatten cache settings from detection object
          if (this.settings.detection.cacheDuration !== undefined) {
            this.settings.cacheDuration = this.settings.detection.cacheDuration;
          }
          if (this.settings.detection.cacheUnit !== undefined) {
            this.settings.cacheUnit = this.settings.detection.cacheUnit;
          }
          if (this.settings.detection.cacheScope !== undefined) {
            this.settings.cacheScope = this.settings.detection.cacheScope;
          }

          // Flatten blacklistedDomains to blacklist for internal use
          if (this.settings.detection.blacklistedDomains) {
            this.settings.blacklist = this.settings.detection.blacklistedDomains;
          }
        }

        // Flatten JS API settings
        if (this.settings.jsApi && this.settings.jsApi.enableJsApi !== undefined) {
          this.settings.enableJsApi = this.settings.jsApi.enableJsApi;
        }

        console.log('[loadSettings] Loaded settings:', {
          flatCacheScope: this.settings.cacheScope, // Should have the value now
          hasDetection: !!this.settings.detection,
          detectionCacheScope: this.settings.detection?.cacheScope, // Original nested value
          fullSettings: this.settings
        });
      }

      this.updateSettingsUI();

    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Save settings to Chrome storage
   */
  async saveSettings() {
    try {
      // Create a copy of settings and restructure to nested format matching default-settings.json
      const settingsToSave = { ...this.settings };

      // Ensure detection object exists
      if (!settingsToSave.detection) {
        settingsToSave.detection = {};
      }

      // FIX: Move detection-related settings into detection object to match default-settings.json structure
      if (settingsToSave.cacheDuration !== undefined) {
        settingsToSave.detection.cacheDuration = settingsToSave.cacheDuration;
        delete settingsToSave.cacheDuration;
      }
      if (settingsToSave.cacheUnit !== undefined) {
        settingsToSave.detection.cacheUnit = settingsToSave.cacheUnit;
        delete settingsToSave.cacheUnit;
      }
      if (settingsToSave.cacheScope !== undefined) {
        settingsToSave.detection.cacheScope = settingsToSave.cacheScope;
        delete settingsToSave.cacheScope;
      }

      // Map flat blacklist to nested detection.blacklistedDomains
      if (settingsToSave.blacklist) {
        settingsToSave.detection.blacklistedDomains = settingsToSave.blacklist;
        delete settingsToSave.blacklist;
      }

      // Ensure jsApi object exists and move flag inside it
      if (!settingsToSave.jsApi) {
        settingsToSave.jsApi = {};
      }
      if (settingsToSave.enableJsApi !== undefined) {
        settingsToSave.jsApi.enableJsApi = settingsToSave.enableJsApi;
        delete settingsToSave.enableJsApi;
      }

      // FIX: Include version field for consistency with default-settings.json
      const settingsData = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        settings: settingsToSave
      };

      // FIX: Log what we're about to save (now properly nested)
      console.log('[saveSettings] About to save to storage:', {
        flatCacheScope: settingsToSave.cacheScope, // Should be undefined now
        hasDetection: !!settingsToSave.detection,
        detectionCacheScope: settingsToSave.detection?.cacheScope, // Should have the value
        detectionCacheDuration: settingsToSave.detection?.cacheDuration,
        detectionCacheUnit: settingsToSave.detection?.cacheUnit,
        fullSettingsData: settingsData
      });

      await chrome.storage.local.set({
        'scrapfly_settings': JSON.stringify(settingsData, null, 2)
      });

      // FIX: Verify what was actually saved (should be nested now)
      const verification = await chrome.storage.local.get(['scrapfly_settings']);
      const savedParsed = JSON.parse(verification.scrapfly_settings);
      console.log('[saveSettings] Verified saved data:', {
        flatCacheScope: savedParsed.settings?.cacheScope, // Should be undefined
        hasDetection: !!savedParsed.settings?.detection,
        detectionCacheScope: savedParsed.settings?.detection?.cacheScope // Should have the value
      });

      // FIX: Always invalidate cache when saving settings
      if (typeof Utils !== 'undefined' && typeof Utils.invalidateSettingsCache === 'function') {
        Utils.invalidateSettingsCache();
        console.log('[Settings] Cache invalidated after save');
      }

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
    // General Settings
    this.setInputValue('#notificationsEnabled', this.settings.notificationsEnabled, 'checkbox');
    this.setInputValue('#debugModeGeneral', this.settings.debugMode, 'checkbox');
    this.setInputValue('#autoDetectionEnabled', this.settings.autoDetectionEnabled, 'checkbox');
    this.setInputValue('#historyLimit', this.settings.historyLimit);
    this.setInputValue('#confidenceThreshold', this.settings.confidenceThreshold);

    const confidenceValue = document.querySelector('#confidenceValue');
    if (confidenceValue) {
      confidenceValue.textContent = `${this.settings.confidenceThreshold}%`;
    }

    // Badge Colors
    this.setColorInput('#colorBadgeLow', this.settings.colorBadgeLow);
    this.setColorInput('#colorBadgeMedium', this.settings.colorBadgeMedium);
    this.setColorInput('#colorBadgeHigh', this.settings.colorBadgeHigh);

    // Category Colors
    this.setColorInput('#colorAntibot', this.settings.colorAntibot);
    this.setColorInput('#colorCaptcha', this.settings.colorCaptcha);
    this.setColorInput('#colorFingerprint', this.settings.colorFingerprint);

    // Tag Colors
    this.setColorInput('#colorTagDOM', this.settings.colorTagDOM);
    this.setColorInput('#colorTagHeaders', this.settings.colorTagHeaders);
    this.setColorInput('#colorTagCookies', this.settings.colorTagCookies);
    this.setColorInput('#colorTagContent', this.settings.colorTagContent);
    this.setColorInput('#colorTagURLs', this.settings.colorTagURLs);
    this.setColorInput('#colorTagJSHooks', this.settings.colorTagJSHooks);
    this.setColorInput('#colorTagWindow', this.settings.colorTagWindow);
    this.setColorInput('#colorTagCSS', this.settings.colorTagCSS);

    // Detection Settings
    this.setInputValue('#cacheDuration', this.settings.cacheDuration);
    this.setInputValue('#cacheUnit', this.settings.cacheUnit);
    this.setInputValue('#cacheScope', this.settings.cacheScope);
    this.setInputValue('#enableJsApi', this.settings.enableJsApi, 'checkbox');

    // Webhook Settings
    this.setInputValue('#enableWebhook', this.settings.enableWebhook, 'checkbox');
    this.setInputValue('#webhookOnCache', this.settings.webhookOnCache, 'checkbox');
    this.setInputValue('#webhookUrl', this.settings.webhookUrl);
    this.setInputValue('#webhookMethod', this.settings.webhookMethod);
    this.setInputValue('#webhookContentType', this.settings.webhookContentType);
    this.setInputValue('#webhookPayload', this.settings.webhookPayload);

    // History Settings
    this.setInputValue('#historyBehavior', this.settings.historyBehavior);
    this.setInputValue('#autoClearDays', this.settings.autoClearDays);
    this.setInputValue('#exportFormat', this.settings.exportFormat);
    this.setInputValue('#includeTimestamps', this.settings.includeTimestamps, 'checkbox');
    this.setInputValue('#historyBypassCache', this.settings.historyBypassCache, 'checkbox');
    this.setInputValue('#preventDuplicates', this.settings.preventDuplicates, 'checkbox');
    this.setInputValue('#duplicateScope', this.settings.duplicateScope);
    this.setInputValue('#duplicateDuration', this.settings.duplicateDuration);
    this.setInputValue('#duplicateUnit', this.settings.duplicateUnit);

    // Update blacklist display
    this.updateBlacklistDisplay();

    // Update color pagination
    this.updateColorPagination();

    // Update duplicate prevention visibility
    this.toggleDuplicateSettings();
  }

  /**
   * Helper to set input value
   */
  setInputValue(selector, value, type = 'value') {
    // FIX: Check for multiple elements when setting cacheScope
    if (selector === '#cacheScope') {
      const allMatches = document.querySelectorAll(selector);
      console.log('[setInputValue] ======== SET CACHE SCOPE DEBUG ========');
      console.log('[setInputValue] Total elements matching selector:', allMatches.length);
      console.log('[setInputValue] All matching elements:', Array.from(allMatches).map(el => ({
        tagName: el.tagName,
        id: el.id,
        currentValue: el.value,
        hasOptions: !!el.options,
        className: el.className
      })));
      console.log('[setInputValue] Attempting to set value to:', value);
    }

    const input = document.querySelector(selector);
    if (!input) {
      // FIX: Suppress warnings for known optional settings that don't have UI elements
      const optionalSelectors = ['#autoDetectionEnabled', '#confidenceThreshold'];
      if (!optionalSelectors.includes(selector)) {
        console.warn(`[setInputValue] Element not found: ${selector}`);
      }
      return;
    }

    if (type === 'checkbox') {
      input.checked = value;
    } else {
      input.value = value;
    }

    // FIX: Verify what was actually set
    if (selector === '#cacheScope') {
      console.log('[setInputValue] After setting value:');
      console.log('[setInputValue] Element tagName:', input.tagName);
      console.log('[setInputValue] Element className:', input.className);
      console.log('[setInputValue] Requested value:', value);
      console.log('[setInputValue] Actual value:', input.value);
      console.log('[setInputValue] Has options:', !!input.options);
      if (input.options) {
        console.log('[setInputValue] Options:', Array.from(input.options).map(o => ({ value: o.value, text: o.text, selected: o.selected })));
      }
      console.log('[setInputValue] ====================================');
    }
  }

  /**
   * Helper to set color input and hex display
   */
  setColorInput(selector, color) {
    const input = document.querySelector(selector);
    if (input) {
      input.value = color;

      // Update hex display
      const hexDisplay = document.querySelector(selector.replace('color', 'hex'));
      if (hexDisplay) {
        hexDisplay.textContent = color.toUpperCase();
      }
    }
  }

  /**
   * Update blacklist display using safe DOM methods
   */
  updateBlacklistDisplay() {
    const container = document.querySelector('#blacklistContainer');
    if (!container) return;

    // Clear existing content
    container.textContent = '';

    if (!this.settings.blacklist || this.settings.blacklist.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.color = 'var(--text-muted)';
      emptyMsg.style.fontSize = '12px';
      emptyMsg.style.padding = '8px';
      emptyMsg.textContent = 'No blacklisted domains';
      container.appendChild(emptyMsg);
      return;
    }

    // Create blacklist items
    this.settings.blacklist.forEach(domain => {
      const item = document.createElement('div');
      item.className = 'blacklist-item';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.padding = '6px 8px';
      item.style.background = 'var(--bg-tertiary)';
      item.style.borderRadius = '4px';
      item.style.marginBottom = '4px';

      const domainSpan = document.createElement('span');
      domainSpan.style.fontSize = '12px';
      domainSpan.style.color = 'var(--text-primary)';
      domainSpan.style.fontFamily = 'monospace';
      domainSpan.textContent = domain;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-blacklist';
      removeBtn.style.background = 'transparent';
      removeBtn.style.border = 'none';
      removeBtn.style.color = 'var(--danger)';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.padding = '2px 4px';
      removeBtn.style.borderRadius = '3px';
      removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>';
      removeBtn.addEventListener('click', () => this.removeFromBlacklist(domain));

      item.appendChild(domainSpan);
      item.appendChild(removeBtn);
      container.appendChild(item);
    });
  }

  /**
   * Remove domain from blacklist
   */
  removeFromBlacklist(domain) {
    this.settings.blacklist = this.settings.blacklist.filter(d => d !== domain);
    this.updateBlacklistDisplay();
  }

  /**
   * Toggle duplicate settings container visibility
   */
  toggleDuplicateSettings() {
    const preventDuplicatesCheckbox = document.querySelector('#preventDuplicates');
    const container = document.querySelector('#duplicateSettingsContainer');

    if (!container || !preventDuplicatesCheckbox) return;

    if (preventDuplicatesCheckbox.checked) {
      container.style.display = 'block';
    } else {
      container.style.display = 'none';
    }
  }

  /**
   * Get current settings from UI inputs
   */
  getSettingsFromUI() {
    return {
      // General Settings
      notificationsEnabled: this.getInputValue('#notificationsEnabled', 'checkbox') ?? this.settings.notificationsEnabled,
      debugMode: this.getInputValue('#debugModeGeneral', 'checkbox') ?? this.settings.debugMode,
      autoDetectionEnabled: this.getInputValue('#autoDetectionEnabled', 'checkbox') ?? this.settings.autoDetectionEnabled,
      historyLimit: this.normalizeHistoryLimit(this.getInputValue('#historyLimit')),
      confidenceThreshold: parseInt(this.getInputValue('#confidenceThreshold') ?? this.settings.confidenceThreshold),

      // Badge Colors
      colorBadgeLow: this.getInputValue('#colorBadgeLow') ?? this.settings.colorBadgeLow,
      colorBadgeMedium: this.getInputValue('#colorBadgeMedium') ?? this.settings.colorBadgeMedium,
      colorBadgeHigh: this.getInputValue('#colorBadgeHigh') ?? this.settings.colorBadgeHigh,

      // Category Colors
      colorAntibot: this.getInputValue('#colorAntibot') ?? this.settings.colorAntibot,
      colorCaptcha: this.getInputValue('#colorCaptcha') ?? this.settings.colorCaptcha,
      colorFingerprint: this.getInputValue('#colorFingerprint') ?? this.settings.colorFingerprint,

      // Tag Colors
      colorTagDOM: this.getInputValue('#colorTagDOM') ?? this.settings.colorTagDOM,
      colorTagHeaders: this.getInputValue('#colorTagHeaders') ?? this.settings.colorTagHeaders,
      colorTagCookies: this.getInputValue('#colorTagCookies') ?? this.settings.colorTagCookies,
      colorTagContent: this.getInputValue('#colorTagContent') ?? this.settings.colorTagContent,
      colorTagURLs: this.getInputValue('#colorTagURLs') ?? this.settings.colorTagURLs,
      colorTagJSHooks: this.getInputValue('#colorTagJSHooks') ?? this.settings.colorTagJSHooks,
      colorTagWindow: this.getInputValue('#colorTagWindow') ?? this.settings.colorTagWindow,
      colorTagCSS: this.getInputValue('#colorTagCSS') ?? this.settings.colorTagCSS,

      // Detection Settings
      cacheDuration: parseInt(this.getInputValue('#cacheDuration') ?? this.settings.cacheDuration),
      cacheUnit: this.getInputValue('#cacheUnit') ?? this.settings.cacheUnit,
      cacheScope: this.getInputValue('#cacheScope') ?? this.settings.cacheScope,
      blacklist: this.settings.blacklist, // Managed separately
      enableJsApi: this.getInputValue('#enableJsApi', 'checkbox') ?? this.settings.enableJsApi,

      // Webhook Settings
      enableWebhook: this.getInputValue('#enableWebhook', 'checkbox') ?? this.settings.enableWebhook,
      webhookOnCache: this.getInputValue('#webhookOnCache', 'checkbox') ?? this.settings.webhookOnCache,
      webhookUrl: this.getInputValue('#webhookUrl') ?? this.settings.webhookUrl,
      webhookMethod: this.getInputValue('#webhookMethod') ?? this.settings.webhookMethod,
      webhookContentType: this.getInputValue('#webhookContentType') ?? this.settings.webhookContentType,
      webhookPayload: this.getInputValue('#webhookPayload') ?? this.settings.webhookPayload,

      // History Settings
      historyBehavior: this.getInputValue('#historyBehavior') ?? this.settings.historyBehavior,
      autoClearDays: parseInt(this.getInputValue('#autoClearDays') ?? this.settings.autoClearDays),
      exportFormat: this.getInputValue('#exportFormat') ?? this.settings.exportFormat,
      includeTimestamps: this.getInputValue('#includeTimestamps', 'checkbox') ?? this.settings.includeTimestamps,
      historyBypassCache: this.getInputValue('#historyBypassCache', 'checkbox') ?? this.settings.historyBypassCache,
      preventDuplicates: this.getInputValue('#preventDuplicates', 'checkbox') ?? this.settings.preventDuplicates,
      duplicateScope: this.getInputValue('#duplicateScope') ?? this.settings.duplicateScope,
      duplicateDuration: parseInt(this.getInputValue('#duplicateDuration') ?? this.settings.duplicateDuration),
      duplicateUnit: this.getInputValue('#duplicateUnit') ?? this.settings.duplicateUnit
    };
  }

  /**
   * Helper to get input value
   */
  getInputValue(selector, type = 'value') {
    // FIX: Check for multiple elements with same ID (this would be a DOM error)
    if (selector === '#cacheScope') {
      const allMatches = document.querySelectorAll(selector);
      console.log('[getInputValue] ======== CACHE SCOPE DEBUG ========');
      console.log('[getInputValue] Total elements matching selector:', allMatches.length);
      console.log('[getInputValue] All matching elements:', Array.from(allMatches).map(el => ({
        tagName: el.tagName,
        id: el.id,
        value: el.value,
        hasOptions: !!el.options,
        className: el.className
      })));
    }

    const input = document.querySelector(selector);
    if (!input) {
      console.warn(`[getInputValue] Element not found: ${selector}`);
      return null;
    }

    const value = type === 'checkbox' ? input.checked : input.value;

    // FIX: Enhanced debug logging for cacheScope specifically
    if (selector === '#cacheScope') {
      console.log('[getInputValue] Using FIRST matched element (querySelector):');
      console.log('[getInputValue] Element tagName:', input.tagName);
      console.log('[getInputValue] Element id:', input.id);
      console.log('[getInputValue] Element className:', input.className);
      console.log('[getInputValue] Element value property:', input.value);
      console.log('[getInputValue] Has options property:', !!input.options);
      if (input.options) {
        console.log('[getInputValue] Selected index:', input.selectedIndex);
        console.log('[getInputValue] Selected option:', input.options?.[input.selectedIndex]);
        console.log('[getInputValue] Selected option value:', input.options?.[input.selectedIndex]?.value);
        console.log('[getInputValue] All options:', Array.from(input.options).map(o => ({ value: o.value, text: o.text, selected: o.selected })));
      }
      console.log('[getInputValue] Final returned value:', value);
      console.log('[getInputValue] ====================================');
    }

    return value;
  }

  /**
   * Validate settings values
   * @param {object} settings - Settings object to validate
   * @returns {object} Validation result with isValid and errors
   */
  validateSettings(settings) {
    const errors = [];

    if (settings.historyLimit < 10 && settings.historyLimit !== 0) {
      errors.push('History limit must be 0 for unlimited or between 10 and 1000');
    } else if (settings.historyLimit > 1000) {
      errors.push('History limit must be 0 for unlimited or between 10 and 1000');
    }

    if (settings.confidenceThreshold < 0 || settings.confidenceThreshold > 100) {
      errors.push('Confidence threshold must be between 0 and 100');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  normalizeHistoryLimit(rawValue) {
    const parsed = parseInt(rawValue ?? this.settings.historyLimit, 10);
    if (Number.isFinite(parsed)) {
      if (parsed === 0) return 0;
      return Math.min(Math.max(parsed, 10), 1000);
    }
    return this.settings.historyLimit;
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
      // Reset to all default values from constructor
      this.settings = {
        // General
        notificationsEnabled: true,
        debugMode: false,
        autoDetectionEnabled: true,
        historyLimit: 100,
        confidenceThreshold: 70,

        // Badge Colors
        colorBadgeLow: '#4CAF50',
        colorBadgeMedium: '#FFA500',
        colorBadgeHigh: '#FF4444',

        // Category Colors
        colorAntibot: '#FF5733',
        colorCaptcha: '#33C3FF',
        colorFingerprint: '#2196F3',

        // Tag Colors
        colorTagDOM: '#2196F3',
        colorTagHeaders: '#FF33A8',
        colorTagCookies: '#FFC133',
        colorTagContent: '#33FFF3',
        colorTagURLs: '#00BCD4',
        colorTagJSHooks: '#00E5FF',
        colorTagWindow: '#4CAF50',
        colorTagCSS: '#E91E63',

        // Detection Settings
        cacheDuration: 12,
        cacheUnit: 'hours',
        cacheScope: 'domain',
        blacklist: [],
        enableJsApi: false,

        // Webhook Settings
        enableWebhook: false,
        webhookOnCache: false,
        webhookUrl: '',
        webhookMethod: 'POST',
        webhookContentType: 'application/json',
        webhookPayload: '{"url": "<SITEURL>", "detections": <DETECTIONS>, "timestamp": "<TIMESTAMP>", "count": <DETECTION_COUNT>}',

        // History Settings
        historyBehavior: 'rolling',
        autoClearDays: 30,
        exportFormat: 'json',
        includeTimestamps: true,
        historyBypassCache: false,
        preventDuplicates: false,
        duplicateScope: 'full_url',
        duplicateDuration: 1,
        duplicateUnit: 'hours'
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

    // Color input listeners (update hex displays)
    this.setupColorInputListeners();

    // Color pagination listeners
    this.setupColorPaginationListeners();

    // Add current domain button
    const addCurrentDomainBtn = document.querySelector('#addCurrentDomainBtn');
    if (addCurrentDomainBtn) {
      addCurrentDomainBtn.addEventListener('click', () => this.addCurrentDomainToBlacklist());
    }


    // Duplicate prevention toggle
    const preventDuplicatesCheckbox = document.querySelector('#preventDuplicates');
    if (preventDuplicatesCheckbox) {
      preventDuplicatesCheckbox.addEventListener('change', () => this.toggleDuplicateSettings());
    }
  }

  /**
   * Setup color input listeners to update hex displays
   */
  setupColorInputListeners() {
    const colorInputs = document.querySelectorAll('.color-field');
    colorInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const color = e.target.value;
        const hexDisplayId = e.target.id.replace('color', 'hex');
        const hexDisplay = document.querySelector(`#${hexDisplayId}`);
        if (hexDisplay) {
          hexDisplay.textContent = color.toUpperCase();
        }
      });
    });
  }

  /**
   * Setup color pagination listeners
   */
  setupColorPaginationListeners() {
    const prevBtn = document.querySelector('#colorPrevBtn');
    const nextBtn = document.querySelector('#colorNextBtn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.changeColorPage(-1));
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.changeColorPage(1));
    }
  }

  /**
   * Change color pagination page
   */
  changeColorPage(direction) {
    const newPage = this.currentColorPage + direction;

    if (newPage < 1 || newPage > this.totalColorPages) {
      return;
    }

    this.currentColorPage = newPage;
    this.updateColorPagination();
  }

  /**
   * Update color pagination display
   */
  updateColorPagination() {
    // Update page number display
    const pageNum = document.querySelector('#colorPageNum');
    if (pageNum) {
      pageNum.textContent = this.currentColorPage;
    }

    // Show/hide pages
    const allPages = document.querySelectorAll('.color-page');
    allPages.forEach(page => {
      const pageNumber = parseInt(page.getAttribute('data-page'));
      page.style.display = pageNumber === this.currentColorPage ? 'block' : 'none';
    });

    // Update button states
    const prevBtn = document.querySelector('#colorPrevBtn');
    const nextBtn = document.querySelector('#colorNextBtn');

    if (prevBtn) {
      prevBtn.disabled = this.currentColorPage === 1;
    }

    if (nextBtn) {
      nextBtn.disabled = this.currentColorPage === this.totalColorPages;
    }
  }

  /**
   * Add current domain to blacklist
   */
  async addCurrentDomainToBlacklist() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url) {
        NotificationHelper.error('Unable to get current page URL');
        return;
      }

      const url = new URL(tab.url);
      const domain = url.hostname;

      if (!domain) {
        NotificationHelper.error('Invalid domain');
        return;
      }

      if (this.settings.blacklist.includes(domain)) {
        NotificationHelper.info(`Domain "${domain}" is already blacklisted`);
        return;
      }

      this.settings.blacklist.push(domain);
      this.updateBlacklistDisplay();
      NotificationHelper.success(`Added "${domain}" to blacklist`);

    } catch (error) {
      console.error('Failed to add current domain:', error);
      NotificationHelper.error('Failed to add domain: ' + error.message);
    }
  }

  setCacheScopeFromCurrentPage() {}

  /**
   * Handle save settings button click
   */
  async handleSaveSettings() {
    try {
      const newSettings = this.getSettingsFromUI();

      // FIX: Add detailed logging to debug cacheScope persistence
      console.log('[handleSaveSettings] Gathered settings from UI:', {
        cacheScope: newSettings.cacheScope,
        cacheDuration: newSettings.cacheDuration,
        cacheUnit: newSettings.cacheUnit
      });

      const validation = this.validateSettings(newSettings);

      if (!validation.isValid) {
        NotificationHelper.error('Invalid settings: ' + validation.errors.join(', '));
        return;
      }

      this.settings = newSettings;

      console.log('[handleSaveSettings] Updated this.settings:', {
        cacheScope: this.settings.cacheScope,
        cacheDuration: this.settings.cacheDuration,
        cacheUnit: this.settings.cacheUnit
      });

      await this.saveSettings();

      console.log('[handleSaveSettings] Settings saved to storage');

      // Sync colors to CategoryManager
      await this.syncColorsToCategoryManager();

      // Notify background to reload CategoryManager
      chrome.runtime.sendMessage({
        type: 'SETTINGS_UPDATED'
      }).catch(() => {
        // Background might not be ready, that's ok
        console.log('Background not ready for SETTINGS_UPDATED message');
      });

      // Close modal after successful save
      this.hideSettings();

    } catch (error) {
      console.error('Failed to handle save settings:', error);
      NotificationHelper.error('Failed to save settings: ' + error.message);
    }
  }

  /**
   * Sync colors from settings to CategoryManager
   */
  async syncColorsToCategoryManager() {
    try {
      // Check if CategoryManager is available globally (popup context)
      if (typeof window.categoryManager === 'undefined' || !window.categoryManager) {
        console.warn('CategoryManager not available, cannot sync colors');
        return;
      }

      const categoryManager = window.categoryManager;

      // Update category colors (use lowercase names to match index.json)
      const categoryMap = {
        'antibot': 'colorAntibot',
        'captcha': 'colorCaptcha',
        'fingerprint': 'colorFingerprint'
      };

      for (const [categoryName, settingsKey] of Object.entries(categoryMap)) {
        const color = this.settings[settingsKey];
        if (color) {
          categoryManager.updateCategoryColor(categoryName, color);
          console.log(`Updated ${categoryName} color to ${color}`);
        }
      }

      // Update badge colors
      const badgeLevels = ['low', 'medium', 'high'];
      const badgeMap = {
        'low': 'colorBadgeLow',
        'medium': 'colorBadgeMedium',
        'high': 'colorBadgeHigh'
      };

      for (const [level, settingsKey] of Object.entries(badgeMap)) {
        const color = this.settings[settingsKey];
        if (color) {
          categoryManager.updateBadgeColor(level, color);
          console.log(`Updated badge ${level} color to ${color}`);
        }
      }

      // Update tag colors
      const tagMap = {
        'dom': 'colorTagDOM',
        'header': 'colorTagHeaders',
        'cookie': 'colorTagCookies',
        'content': 'colorTagContent',
        'url': 'colorTagURLs',
        'js_hooks': 'colorTagJSHooks',
        'window': 'colorTagWindow',
        'css': 'colorTagCSS'
      };

      const tags = categoryManager.categories.tags || {};
      for (const [tagName, settingsKey] of Object.entries(tagMap)) {
        const color = this.settings[settingsKey];
        if (color && tags[tagName]) {
          // Update tag color (tags[tagName] might be string or object)
          if (typeof tags[tagName] === 'object') {
            tags[tagName].colour = color;
          } else {
            tags[tagName] = { colour: color };
          }
          console.log(`Updated tag ${tagName} color to ${color}`);
        }
      }

      // Save updated CategoryManager to storage
      await categoryManager.saveToStorage();
      console.log('Synced colors to CategoryManager and saved to storage');

    } catch (error) {
      console.error('Failed to sync colors to CategoryManager:', error);
      // Don't throw - settings are still saved even if color sync fails
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
      const jsApiEnabled = settings.enableJsApi ?? settings.jsApi?.enableJsApi ?? false;
      if (!jsApiEnabled) {
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
      const jsApiEnabled = settings.enableJsApi ?? settings.jsApi?.enableJsApi ?? false;

      if (!jsApiEnabled) {
        console.log('Scrapfly JS API: Disabled in settings, skipping ready event');
        return false;
      }

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