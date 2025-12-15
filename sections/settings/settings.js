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
        cacheScope: 'domain',
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
      },

      // Update Settings
      updates: {
        autoUpdate: true,
        checkIntervalHours: 12,
        lastCheckTimestamp: 0
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
      Logger.ui('Settings loaded:', this.settings);

    } catch (error) {
      Logger.error('UI', 'Failed to load settings:', error);
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
          oldCacheScope = loadedSettings.cacheScope || loadedSettings.detection?.cacheScope || 'domain';
        }
      } catch (error) {
        Logger.warn('UI', 'Could not read old cache scope:', error);
      }

      const settingsData = {
        timestamp: new Date().toISOString(),
        settings: this.settings
      };

      await chrome.storage.local.set({
        'scrapfly_settings': JSON.stringify(settingsData, null, 2)
      });

      Logger.ui('Settings saved:', this.settings);

      // Check if cache scope changed
      const newCacheScope = this.settings.cacheScope || this.settings.detection?.cacheScope || 'domain';
      const cacheScopeChanged = oldCacheScope && oldCacheScope !== newCacheScope;

      if (cacheScopeChanged) {
        Logger.ui(`[Settings] Cache scope changed from "${oldCacheScope}" to "${newCacheScope}" - preserving cache data, invalidating current view`);

        // Clear in-memory URL hash cache in popup context
        Utils.clearUrlHashCache();

        // Notify background worker to clear its in-memory cache
        chrome.runtime.sendMessage({ type: 'CACHE_SCOPE_CHANGED' }, (response) => {
          if (chrome.runtime.lastError) {
            Logger.warn('UI', 'Failed to notify background of cache scope change:', chrome.runtime.lastError.message);
          }
        });

        // Notify Detection tab to clear current results display
        chrome.runtime.sendMessage({ type: 'DETECTION_CLEAR_CACHE' }, (response) => {
          if (chrome.runtime.lastError) {
            Logger.warn('UI', 'Failed to notify Detection tab:', chrome.runtime.lastError.message);
          }
        });

        NotificationHelper.success('Settings saved! Cache scope changed.');
      } else {
        NotificationHelper.success('Settings saved successfully!');
      }

      // Notify background script to sync category colors
      chrome.runtime.sendMessage({ type: 'SYNC_CATEGORY_COLORS' }, (response) => {
        if (chrome.runtime.lastError) {
          Logger.warn('UI', 'Failed to sync category colors:', chrome.runtime.lastError.message);
        } else {
          Logger.ui('Category colors synced:', response);
        }
      });

    } catch (error) {
      Logger.error('UI', 'Failed to save settings:', error);
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
        cacheScopeSelect.value = this.settings.detection.cacheScope || 'domain';
        Logger.ui('Cache scope loaded:', this.settings.detection.cacheScope);
      }

      const cacheDurationInput = document.querySelector('#cacheDuration');
      if (cacheDurationInput) {
        cacheDurationInput.value = this.settings.detection.cacheDuration || 12;
      }

      const cacheUnitSelect = document.querySelector('#cacheUnit');
      if (cacheUnitSelect) {
        cacheUnitSelect.value = this.settings.detection.cacheUnit || 'hours';
      }

      // Render blacklisted domains
      this.renderBlacklistUI();
    }

    // JS API Settings
    if (this.settings.jsApi) {
      const enableJsApi = document.querySelector('#enableJsApi');
      if (enableJsApi) {
        enableJsApi.checked = this.settings.jsApi.enableJsApi ?? false;
      }
    }

    // Update Settings - ensure updates object exists
    if (!this.settings.updates) {
      this.settings.updates = {
        autoUpdate: true,
        checkIntervalHours: 12,
        lastCheckTimestamp: 0
      };
    }

    const autoUpdateRules = document.querySelector('#autoUpdateRules');
    if (autoUpdateRules) {
      autoUpdateRules.checked = this.settings.updates.autoUpdate ?? true;
      autoUpdateRules.addEventListener('change', () => {
        const intervalGroup = document.querySelector('#updateIntervalGroup');
        if (intervalGroup) {
          intervalGroup.style.opacity = autoUpdateRules.checked ? '1' : '0.5';
        }
      });
      // Set initial opacity
      const intervalGroup = document.querySelector('#updateIntervalGroup');
      if (intervalGroup) {
        intervalGroup.style.opacity = autoUpdateRules.checked ? '1' : '0.5';
      }
    }

    const updateCheckInterval = document.querySelector('#updateCheckInterval');
    if (updateCheckInterval) {
      updateCheckInterval.value = this.settings.updates.checkIntervalHours || 12;
    }

    // Update last check text
    this.updateLastCheckDisplay();

    // Setup check updates button - simple direct handler
    const checkUpdatesBtn = document.querySelector('#checkUpdatesBtn');
    if (checkUpdatesBtn) {
      console.log('[Settings] Found checkUpdatesBtn, attaching handler');
      const self = this;
      checkUpdatesBtn.onclick = function() {
        console.log('[Settings] Button clicked!');
        self.handleCheckUpdates();
      };
    } else {
      console.error('[Settings] checkUpdatesBtn NOT FOUND!');
    }

    // Webhook Settings
    if (this.settings.webhook) {
      const enableWebhook = document.querySelector('#enableWebhook');
      if (enableWebhook) enableWebhook.checked = this.settings.webhook.enableWebhook ?? false;

      const webhookOnCache = document.querySelector('#webhookOnCache');
      if (webhookOnCache) webhookOnCache.checked = this.settings.webhook.webhookOnCache ?? false;

      // Setup webhook HTTP Method badges (radio buttons)
      const webhookMethodInput = document.querySelector('#webhookMethod');
      const customContainer = document.querySelector('#webhookCustomMethodContainer');
      const customMethodInput = document.querySelector('#webhookCustomMethod');
      const value = this.settings.webhook.webhookMethod || 'POST';
      const standardMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      const isCustom = !standardMethods.includes(value.toUpperCase());

      if (webhookMethodInput) {
        webhookMethodInput.value = value;
      }

      // Clear all checked states first
      document.querySelectorAll('input[name="webhookMethodRadio"]').forEach(radio => {
        radio.checked = false;
        const badge = radio.closest('.http-method-badge');
        if (badge) badge.classList.remove('checked');
      });

      if (isCustom && customContainer && customMethodInput) {
        // Custom method
        const customRadio = document.querySelector('input[name="webhookMethodRadio"][value="CUSTOM"]');
        if (customRadio) {
          customRadio.checked = true;
          const badge = customRadio.closest('.http-method-badge');
          if (badge) badge.classList.add('checked');
        }
        customContainer.style.display = 'block';
        customMethodInput.value = value;
      } else {
        // Standard method
        const radio = document.querySelector(`input[name="webhookMethodRadio"][value="${value.toUpperCase()}"]`);
        if (radio) {
          radio.checked = true;
          const badge = radio.closest('.http-method-badge');
          if (badge) badge.classList.add('checked');
        }
        if (customContainer) customContainer.style.display = 'none';
      }

      // Setup radio button event listeners
      this.setupWebhookMethodRadios();

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
      cacheScope: document.querySelector('#cacheScope')?.value ?? this.settings.detection?.cacheScope ?? 'path',
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

    // Update Settings
    settings.updates = {
      autoUpdate: document.querySelector('#autoUpdateRules')?.checked ?? this.settings.updates?.autoUpdate ?? true,
      checkIntervalHours: parseInt(document.querySelector('#updateCheckInterval')?.value ?? this.settings.updates?.checkIntervalHours ?? 12),
      lastCheckTimestamp: this.settings.updates?.lastCheckTimestamp ?? 0
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
        Logger.error('UI', 'Failed to clear data:', error);
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
      Logger.ui('Save settings button found, attaching event listener');
      saveSettingsBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        Logger.ui('Save settings button clicked');
        await this.handleSaveSettings();
      });
    } else {
      Logger.error('UI', 'Save settings button NOT found - event listener not attached');
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
            Logger.ui('Failed to enable log collection');
          });
          // Start updating log count
          this.startLogCountUpdate();
        } else {
          chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_DISABLE' }).catch(() => {
            Logger.ui('Failed to disable log collection');
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
        let maxLogs = parseInt(e.target.value || 5000);
        // Clamp value between 100 and 100000
        if (maxLogs < 100) maxLogs = 100;
        if (maxLogs > 100000) maxLogs = 100000;
        // Update the input field with clamped value
        e.target.value = maxLogs;
        // Update the display
        const logCountMax = document.querySelector('#logCountMax');
        if (logCountMax) {
          logCountMax.textContent = maxLogs;
        }
        // Send to background to update LogCollector
        chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_SET_MAX_LOGS', maxLogs: maxLogs }).catch(() => {
          Logger.ui('Failed to set max logs');
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

    // Add Current Page to blacklist button
    const addCurrentDomainBtn = document.querySelector('#addCurrentDomainBtn');
    if (addCurrentDomainBtn) {
      addCurrentDomainBtn.addEventListener('click', async () => {
        try {
          // Get the current tab's URL
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || !tab.url) {
            NotificationHelper.error('Could not get current page URL');
            return;
          }

          // Extract domain from URL
          const url = new URL(tab.url);
          const domain = url.hostname;

          // Check if already blacklisted
          if (!this.settings.detection) {
            this.settings.detection = { blacklistedDomains: [] };
          }
          if (!this.settings.detection.blacklistedDomains) {
            this.settings.detection.blacklistedDomains = [];
          }

          if (this.settings.detection.blacklistedDomains.includes(domain)) {
            NotificationHelper.info(`${domain} is already blacklisted`);
            return;
          }

          // Add to blacklist
          this.settings.detection.blacklistedDomains.push(domain);

          // Update UI
          this.renderBlacklistUI();

          // Save settings
          await this.saveSettings();

          NotificationHelper.success(`Added ${domain} to blacklist`);
        } catch (error) {
          Logger.error('UI', 'Failed to add domain to blacklist', error);
          NotificationHelper.error('Failed to add domain: ' + error.message);
        }
      });
    }

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
   * Render the blacklist UI showing all blacklisted domains
   */
  renderBlacklistUI() {
    const container = document.querySelector('#blacklistContainer');
    if (!container) return;

    const domains = this.settings.detection?.blacklistedDomains || [];

    if (domains.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 10px;">No domains blacklisted</div>';
      return;
    }

    container.innerHTML = domains.map(domain => `
      <div class="blacklist-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-tertiary); border-radius: 6px; margin-bottom: 6px;">
        <span style="font-size: 13px; color: var(--text-primary);">${domain}</span>
        <button class="remove-blacklist-btn" data-domain="${domain}" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; display: flex; align-items: center;">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Add click handlers for remove buttons
    container.querySelectorAll('.remove-blacklist-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const domain = btn.getAttribute('data-domain');
        this.settings.detection.blacklistedDomains = this.settings.detection.blacklistedDomains.filter(d => d !== domain);
        this.renderBlacklistUI();
        await this.saveSettings();
        NotificationHelper.success(`Removed ${domain} from blacklist`);
      });
    });
  }

  /**
   * Handle save settings button click
   */
  async handleSaveSettings() {
    Logger.ui('handleSaveSettings() called');
    try {
      Logger.ui('Getting settings from UI...');
      const newSettings = this.getSettingsFromUI();
      Logger.ui('Settings from UI:', newSettings);

      Logger.ui('Validating settings...');
      const validation = this.validateSettings(newSettings);
      Logger.ui('Validation result:', validation);

      if (!validation.isValid) {
        Logger.warn('UI', 'Settings validation failed:', validation.errors);
        NotificationHelper.error('Invalid settings: ' + validation.errors.join(', '));
        return;
      }

      // Merge new settings with existing settings to preserve nested structure
      Logger.ui('Merging settings...');
      this.settings = this.deepMerge(this.settings, newSettings);
      Logger.ui('Settings merged:', this.settings);

      Logger.ui('Saving settings to storage...');
      await this.saveSettings();
      Logger.ui('Settings saved successfully');

      // Close modal after successful save
      Logger.ui('Closing modal...');
      this.hideSettings();
      Logger.ui('Modal closed');

    } catch (error) {
      Logger.error('UI', 'Failed to handle save settings:', error);
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
  static async loadToggleState(toggle) {
    if (!toggle) return;

    try {
      const result = await chrome.storage.local.get(['scrapfly_enabled']);
      const isEnabled = result.scrapfly_enabled !== false; // Default to true
      toggle.checked = isEnabled;
      Logger.ui('Toggle state loaded:', isEnabled);
    } catch (error) {
      Logger.error('UI', 'Failed to load toggle state:', error);
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
      Logger.error('UI', 'Failed to load default tab:', error);
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
      Logger.ui('Extension enabled state updated:', enabled);

      // Broadcast to all contexts
      chrome.runtime.sendMessage({
        type: 'EXTENSION_TOGGLE_CHANGED',
        enabled: enabled
      }).catch(() => {
        // Ignore if popup not open
      });

      // Update badges efficiently
      if (enabled) {
        // When enabling, only update the currently active tab from cache
        // Other tabs will update naturally when user navigates to them
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && context && context.DetectionEngineManager && context.CategoryManager && context.categoryManager) {
          const storedData = await context.DetectionEngineManager.getStoredDetection(activeTab.url);
          if (storedData && storedData.detectionCount > 0) {
            // Restore badge from cached data for active tab only
            const badgeColors = await context.CategoryManager.getBadgeColors(context.categoryManager);
            const count = storedData.detectionCount.toString();
            const color = storedData.detectionCount >= 5 ? badgeColors.high :
                         storedData.detectionCount >= 3 ? badgeColors.medium :
                         badgeColors.low;

            chrome.action.setBadgeText({ text: count, tabId: activeTab.id }).catch((error) => {
              Logger.ui(`[Settings] Failed to set badge for active tab ${activeTab.id}:`, error.message);
            });
            chrome.action.setBadgeBackgroundColor({ color: color, tabId: activeTab.id }).catch((error) => {
              Logger.ui(`[Settings] Failed to set badge color for active tab ${activeTab.id}:`, error.message);
            });
          } else {
            // No cached detections, clear badge
            chrome.action.setBadgeText({ text: '', tabId: activeTab.id }).catch((error) => {
              Logger.ui(`[Settings] Failed to clear badge for active tab ${activeTab.id}:`, error.message);
            });
          }
        }
      } else {
        // When disabling, set X badge for all tabs
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          chrome.action.setBadgeText({ text: '✕', tabId: tab.id }).catch((error) => {
            // Expected: Tab might be closed
            Logger.ui(`[Settings] Failed to set disabled badge for tab ${tab.id}:`, error.message);
          });
          chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId: tab.id }).catch((error) => {
            // Expected: Tab might be closed
            Logger.ui(`[Settings] Failed to set badge color for tab ${tab.id}:`, error.message);
          });
        }
      }
    } catch (error) {
      Logger.error('UI', 'Failed to handle toggle:', error);
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
      Logger.error('UI', 'Failed to handle settings update:', error);
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

      Logger.ui('Webhook sent successfully');
    } catch (error) {
      Logger.error('UI', 'Failed to send webhook:', error);
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
        Logger.ui(`Scrapfly JS API: Disabled in settings, skipping ${eventName} event`);
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
      Logger.ui(`Scrapfly JS API: Dispatched ${eventName} event`, data);
      return true;

    } catch (error) {
      Logger.error('UI', `Scrapfly JS API: Failed to dispatch ${eventName} event:`, error);
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
      Logger.error('UI', 'Scrapfly JS API: Failed to dispatch ready event:', error);
      return false;
    }
  }

  /**
   * Update HTTP Method select dropdown color based on selected value (legacy)
   * @param {HTMLSelectElement} selectElement - The select element to update
   */
  updateHttpMethodColor(selectElement) {
    if (!selectElement) return;

    // Remove all method classes
    selectElement.classList.remove('method-get', 'method-post', 'method-put', 'method-patch', 'method-delete');

    // Add appropriate class based on selected value
    const value = selectElement.value.toLowerCase();
    if (value) {
      selectElement.classList.add(`method-${value}`);
    }
  }

  /**
   * Setup webhook HTTP Method radio button event listeners
   */
  setupWebhookMethodRadios() {
    const radios = document.querySelectorAll('input[name="webhookMethodRadio"]');
    const webhookMethodInput = document.querySelector('#webhookMethod');
    const customContainer = document.querySelector('#webhookCustomMethodContainer');
    const customInput = document.querySelector('#webhookCustomMethod');

    radios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        // Remove .checked from all badges
        radios.forEach(r => {
          const badge = r.closest('.http-method-badge');
          if (badge) badge.classList.remove('checked');
        });

        // Add .checked to selected badge
        const badge = e.target.closest('.http-method-badge');
        if (badge) badge.classList.add('checked');

        // Handle custom method
        if (e.target.value === 'CUSTOM') {
          if (customContainer) customContainer.style.display = 'block';
          if (customInput) customInput.focus();
        } else {
          if (customContainer) customContainer.style.display = 'none';
          if (webhookMethodInput) webhookMethodInput.value = e.target.value;
        }
      });
    });

    // Handle custom input changes
    if (customInput) {
      customInput.addEventListener('input', () => {
        const customValue = customInput.value.trim().toUpperCase();
        if (customValue && webhookMethodInput) {
          webhookMethodInput.value = customValue;
        }
      });
    }
  }

  /**
   * Setup custom HTTP Method dropdown event listeners (legacy)
   * @param {HTMLElement} dropdown - The dropdown container element
   * @param {HTMLInputElement} hiddenInput - The hidden input to store the value
   */
  setupCustomHttpMethodDropdown(dropdown, hiddenInput) {
    if (!dropdown || !hiddenInput) return;

    const selected = dropdown.querySelector('.http-method-dropdown-selected');
    const options = dropdown.querySelectorAll('.http-method-dropdown-option');
    const customContainer = document.querySelector('#webhookCustomMethodContainer');
    const customInput = document.querySelector('#webhookCustomMethod');

    // Toggle dropdown on click
    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    // Handle option selection
    options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = option.dataset.value;

        if (value === 'CUSTOM') {
          // Show custom input
          if (customContainer) customContainer.style.display = 'block';
          if (customInput) customInput.focus();
          this.updateCustomHttpMethodDropdown(dropdown, 'Custom');
        } else {
          // Hide custom input
          if (customContainer) customContainer.style.display = 'none';
          hiddenInput.value = value;
          this.updateCustomHttpMethodDropdown(dropdown, value);
        }
        dropdown.classList.remove('open');
      });
    });

    // Handle custom method input changes
    if (customInput) {
      customInput.addEventListener('input', () => {
        const customValue = customInput.value.trim().toUpperCase();
        if (customValue) {
          hiddenInput.value = customValue;
        }
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  }

  /**
   * Update custom HTTP Method dropdown display
   * @param {HTMLElement} dropdown - The dropdown container element
   * @param {string} value - The selected value (GET, POST, PUT, etc.)
   */
  updateCustomHttpMethodDropdown(dropdown, value) {
    if (!dropdown || !value) return;

    const valueDisplay = dropdown.querySelector('.http-method-dropdown-value');
    const options = dropdown.querySelectorAll('.http-method-dropdown-option');

    // Update displayed value and its color class
    if (valueDisplay) {
      valueDisplay.textContent = value;
      valueDisplay.className = `http-method-dropdown-value http-method-${value.toLowerCase()}`;
    }

    // Update selected state on options
    options.forEach(option => {
      if (option.dataset.value === value) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });
  }

  /**
   * Update the last check display text
   */
  updateLastCheckDisplay() {
    const lastCheckEl = document.querySelector('#lastUpdateCheck');
    if (!lastCheckEl) return;

    const lastCheck = this.settings.updates?.lastCheckTimestamp || 0;
    if (lastCheck === 0) {
      lastCheckEl.textContent = 'Last checked: Never';
      return;
    }

    const now = Date.now();
    const diffMs = now - lastCheck;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let timeText;
    if (diffDays > 0) {
      timeText = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      timeText = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMins > 0) {
      timeText = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else {
      timeText = 'Just now';
    }

    lastCheckEl.textContent = `Last checked: ${timeText}`;
  }

  /**
   * Handle the Check for Updates button click
   */
  async handleCheckUpdates() {
    Logger.ui('handleCheckUpdates called');
    const btn = document.querySelector('#checkUpdatesBtn');
    const btnText = document.querySelector('#checkUpdatesBtnText');
    const btnIcon = document.querySelector('#checkUpdatesBtnIcon');
    const progressBar = document.querySelector('#updateProgressBar');
    const statusText = document.querySelector('#updateStatusText');

    if (!btn || !btnText) {
      Logger.warn('UI', 'Check updates button elements not found', { btn: !!btn, btnText: !!btnText });
      return;
    }

    // Disable button and show loading state
    btn.disabled = true;
    const originalText = btnText.textContent;
    btnText.textContent = 'Connecting...';

    // Add spinning animation to icon
    if (btnIcon) {
      btnIcon.style.animation = 'spin 1s linear infinite';
    }

    // Show progress bar
    if (progressBar) {
      progressBar.style.display = 'block';
      progressBar.style.width = '10%';
    }

    // Show status text
    if (statusText) {
      statusText.style.display = 'block';
      statusText.textContent = 'Connecting to GitHub...';
    }

    Logger.ui('Sending CHECK_FOR_UPDATES message to background');

    // Simulate progress updates
    const progressSteps = [
      { width: '20%', text: 'Fetching index...', delay: 500 },
      { width: '40%', text: 'Checking detectors...', delay: 1500 },
      { width: '60%', text: 'Comparing versions...', delay: 2500 },
      { width: '80%', text: 'Applying updates...', delay: 3500 }
    ];

    const progressTimers = progressSteps.map(step =>
      setTimeout(() => {
        if (progressBar) progressBar.style.width = step.width;
        if (statusText) statusText.textContent = step.text;
      }, step.delay)
    );

    // Helper to finish the progress animation
    const finishProgress = (success, message) => {
      // Clear all pending timers
      progressTimers.forEach(timer => clearTimeout(timer));

      // Stop spinning
      if (btnIcon) {
        btnIcon.style.animation = '';
      }

      // Complete progress bar
      if (progressBar) {
        progressBar.style.width = '100%';
        progressBar.style.background = success
          ? 'linear-gradient(90deg, #4CAF50, #8BC34A)'
          : 'linear-gradient(90deg, #f44336, #ff5722)';
      }

      // Update status
      if (statusText) {
        statusText.textContent = message;
        statusText.style.color = success ? '#4CAF50' : '#f44336';
      }
    };

    try {
      // Send message to background to check for updates
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_FOR_UPDATES',
        force: true
      });

      if (response && response.success) {
        const result = response.result;
        if (result.newDetectors > 0 || result.updatedDetectors > 0) {
          btnText.textContent = `✓ ${result.newDetectors} new, ${result.updatedDetectors} updated`;
          finishProgress(true, `Updated ${result.newDetectors} new and ${result.updatedDetectors} updated detectors`);
        } else if (result.checked === false) {
          btnText.textContent = '✗ Check failed';
          finishProgress(false, result.reason || 'Update check failed');
        } else {
          btnText.textContent = '✓ All up to date!';
          finishProgress(true, 'All detection rules are up to date');
        }

        // Update last check timestamp in settings
        this.settings.updates.lastCheckTimestamp = Date.now();
        this.updateLastCheckDisplay();
      } else {
        btnText.textContent = '✗ ' + (response?.error || 'Update check failed');
        finishProgress(false, response?.error || 'Update check failed');
      }
    } catch (error) {
      Logger.error('UI', 'Failed to check for updates', error);
      btnText.textContent = '✗ Error checking';
      finishProgress(false, 'Error: ' + error.message);
    }

    // Re-enable button and hide progress after a delay
    setTimeout(() => {
      btn.disabled = false;
      btnText.textContent = originalText;
      if (progressBar) {
        progressBar.style.display = 'none';
        progressBar.style.width = '0%';
      }
      if (statusText) {
        statusText.style.display = 'none';
        statusText.style.color = 'var(--text-muted)';
      }
    }, 5000);
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Settings;
} else if (typeof window !== 'undefined') {
  window.Settings = Settings;
}
