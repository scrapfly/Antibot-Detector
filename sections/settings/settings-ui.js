/**
 * Settings UI/modal methods for popup context.
 * Dependencies: `Settings` class compatibility wrappers call this registry.
 */
const SettingsUI = (typeof self !== 'undefined' && self.SettingsUI) ? self.SettingsUI : {};

SettingsUI.showSettings = function() {
    const settingsModal = document.querySelector('#settingsModal');
    if (settingsModal) {
      settingsModal.classList.add('is-open');
      this.isModalVisible = true;
      this.loadSettings();
    }
};

SettingsUI.hideSettings = function() {
    const settingsModal = document.querySelector('#settingsModal');
    if (settingsModal) {
      settingsModal.classList.remove('is-open');
      this.isModalVisible = false;
    }
};

SettingsUI.switchTab = function(tabName) {
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
};

SettingsUI.loadSettings = async function() {
    try {
      const result = await chrome.storage.local.get(['scrapfly_settings']);

      if (result.scrapfly_settings) {
        // Handle both string (from JSON.stringify) and object formats
        // This prevents errors if storage returns an object directly
        const savedSettings = typeof result.scrapfly_settings === 'string'
          ? JSON.parse(result.scrapfly_settings)
          : result.scrapfly_settings;

        // Extract the nested "settings" property from the saved data
        // Fallback to savedSettings for legacy data without nested structure
        const loadedSettings = savedSettings.settings || savedSettings;

        Logger.ui('Loading settings - raw:', result.scrapfly_settings);
        Logger.ui('Loading settings - parsed:', savedSettings);
        Logger.ui('Loading settings - extracted:', loadedSettings);

        // Properly merge nested settings structure
        if (typeof loadedSettings === 'object' && loadedSettings !== null) {
          // Deep merge: preserve nested structure for detection, history, etc.
          this.settings = this.deepMerge(this.settings, loadedSettings);
          delete this.settings.hooksConfig;
          delete this.settings.reliabilityConfig;
          // Legacy cleanup: cache settings used to be stored flat; keep only detection.* to avoid conflicts
          if (this.settings.detection) {
            if (this.settings.detection.cacheDuration === undefined && this.settings.cacheDuration !== undefined) {
              this.settings.detection.cacheDuration = this.settings.cacheDuration;
            }
            if (this.settings.detection.cacheUnit === undefined && this.settings.cacheUnit !== undefined) {
              this.settings.detection.cacheUnit = this.settings.cacheUnit;
            }
            if (this.settings.detection.cacheScope === undefined && this.settings.cacheScope !== undefined) {
              this.settings.detection.cacheScope = this.settings.cacheScope;
            }
            if ((this.settings.detection.blacklistedDomains == null || this.settings.detection.blacklistedDomains.length === 0) &&
                Array.isArray(this.settings.blacklistedDomains) && this.settings.blacklistedDomains.length > 0) {
              this.settings.detection.blacklistedDomains = this.settings.blacklistedDomains;
            }
            // cacheHours was a legacy field (hours only)
            if (this.settings.detection.cacheDuration === undefined && this.settings.cacheHours !== undefined) {
              this.settings.detection.cacheDuration = this.settings.cacheHours;
              this.settings.detection.cacheUnit = this.settings.detection.cacheUnit || 'hours';
            }
          }
          delete this.settings.cacheDuration;
          delete this.settings.cacheUnit;
          delete this.settings.cacheScope;
          delete this.settings.cacheHours;
          delete this.settings.blacklistedDomains;
        }
      } else {
        Logger.ui('No saved settings found, using defaults');
      }

      if (typeof Utils !== 'undefined' && typeof Utils.applyDebugMode === 'function') {
        Utils.applyDebugMode(this.settings);
      }

      this.updateSettingsUI();
      Logger.ui('Settings loaded and UI updated:', this.settings);

    } catch (error) {
      Logger.error('UI', 'Failed to load settings:', error);
      NotificationHelper.error('Failed to load settings. Using defaults.');
    }
};

SettingsUI.deepMerge = function(target, source) {
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
};

SettingsUI.saveSettings = async function() {
    try {
      // Get old cache scope before saving (to detect changes)
      let oldCacheScope = null;
      try {
        const result = await chrome.storage.local.get(['scrapfly_settings']);
        if (result.scrapfly_settings) {
          // Handle both string and object formats
          const savedSettings = typeof result.scrapfly_settings === 'string'
            ? JSON.parse(result.scrapfly_settings)
            : result.scrapfly_settings;
          const loadedSettings = savedSettings.settings || savedSettings;
          oldCacheScope = loadedSettings.cacheScope || loadedSettings.detection?.cacheScope || 'domain';
        }
      } catch (error) {
        Logger.warn('UI', 'Could not read old cache scope:', error);
      }

      delete this.settings.hooksConfig;
      delete this.settings.reliabilityConfig;
      // Legacy cleanup: cache settings used to be stored flat; keep only detection.* to avoid conflicts
      delete this.settings.cacheDuration;
      delete this.settings.cacheUnit;
      delete this.settings.cacheScope;
      delete this.settings.cacheHours;
      delete this.settings.blacklistedDomains;

      const settingsData = {
        timestamp: new Date().toISOString(),
        settings: this.settings
      };

      await chrome.storage.local.set({
        'scrapfly_settings': JSON.stringify(settingsData, null, 2)
      });

      if (typeof Utils !== 'undefined' && typeof Utils.applyDebugMode === 'function') {
        Utils.applyDebugMode(this.settings);
      }

      Logger.ui('Settings saved:', this.settings);

      // Check if cache scope changed
      const newCacheScope = this.settings.cacheScope || this.settings.detection?.cacheScope || 'domain';
      const cacheScopeChanged = oldCacheScope && oldCacheScope !== newCacheScope;

      if (cacheScopeChanged) {
        Logger.ui(`[Settings] Cache scope changed from "${oldCacheScope}" to "${newCacheScope}" - preserving cache data, invalidating current view`);

        // Clear in-memory URL hash cache in popup context
        UrlUtils.clearUrlHashCache();

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

        NotificationHelper.success('Settings saved');
      } else {
        NotificationHelper.success('Settings saved');
      }

      // Notify background script to invalidate settings cache
      // This is critical for webhook and other background features to use updated settings
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' }, (response) => {
        if (chrome.runtime.lastError) {
          Logger.warn('UI', 'Failed to notify background of settings update:', chrome.runtime.lastError.message);
        } else {
          Logger.ui('Background notified of settings update:', response);
        }
      });

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
};

SettingsUI.updateSettingsUI = function() {
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
      const safeMax = Math.min(Math.max(this.settings.logCollectorMaxLogs ?? 5000, 100), 5000);
      logCollectorMaxLogsInput.value = safeMax;
    }

    // Update the max logs display
    const logCountMax = document.querySelector('#logCountMax');
    if (logCountMax) {
      const safeMax = Math.min(Math.max(this.settings.logCollectorMaxLogs ?? 5000, 100), 5000);
      logCountMax.textContent = safeMax;
    }

    // If Log Collector is already enabled, start updating the log count immediately
    if (this.settings.logCollectorEnabled ?? false) {
      this.startLogCountUpdate();
    }

    // Badge Colors (using BADGE constants as defaults)
    if (this.settings.badgeColors) {
      const colorBadgeLow = document.querySelector('#colorBadgeLow');
      if (colorBadgeLow) colorBadgeLow.value = this.settings.badgeColors.low || BADGE.COLORS.LOW;

      const colorBadgeMedium = document.querySelector('#colorBadgeMedium');
      if (colorBadgeMedium) colorBadgeMedium.value = this.settings.badgeColors.medium || BADGE.COLORS.MEDIUM;

      const colorBadgeHigh = document.querySelector('#colorBadgeHigh');
      if (colorBadgeHigh) colorBadgeHigh.value = this.settings.badgeColors.high || BADGE.COLORS.HIGH;
    }

    // Category Colors
    if (this.settings.categoryColors) {
      const colorAntibot = document.querySelector('#colorAntibot');
      if (colorAntibot) colorAntibot.value = this.settings.categoryColors.antibot || '#FF5733';

      const colorCaptcha = document.querySelector('#colorCaptcha');
      if (colorCaptcha) colorCaptcha.value = this.settings.categoryColors.captcha || '#33C3FF';

      const colorFingerprint = document.querySelector('#colorFingerprint');
      if (colorFingerprint) colorFingerprint.value = this.settings.categoryColors.fingerprint || '#3b82f6';
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
      this.setupBlacklistEventListeners();
    }

    // JS API Settings
    if (this.settings.jsApi) {
      const enableJsApi = document.querySelector('#enableJsApi');
      if (enableJsApi) {
        enableJsApi.checked = this.settings.jsApi.enableJsApi ?? true;
      }
    }

    // Webhook Settings
    if (this.settings.webhook) {
      const enableWebhook = document.querySelector('#enableWebhook');
      const isWebhookEnabled = this.settings.webhook.enableWebhook ?? false;
      if (enableWebhook) enableWebhook.checked = isWebhookEnabled;

      // Set visibility of webhook settings based on enable state
      const webhookSettingsContainer = document.querySelector('#webhookSettings');
      const webhookOnCacheGroup = document.querySelector('#webhookOnCacheGroup');
      if (webhookSettingsContainer) {
        webhookSettingsContainer.style.display = isWebhookEnabled ? 'block' : 'none';
      }
      if (webhookOnCacheGroup) {
        webhookOnCacheGroup.style.display = isWebhookEnabled ? 'flex' : 'none';
      }

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
      const defaultPayload = '{"url": "<SITEURL>", "hostname": "<HOSTNAME>", "title": "<TITLE>", "favicon": "<FAVICON>", "detections": <DETECTIONS>, "timestamp": "<TIMESTAMP>", "count": <DETECTION_COUNT>, "categories": "<CATEGORIES>"}';
      if (webhookPayload) webhookPayload.value = this.settings.webhook.webhookPayload || defaultPayload;

      // Render webhook headers
      this.renderWebhookHeadersUI();
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

      // Show/hide duplicate settings container based on toggle state
      const duplicateSettingsContainer = document.querySelector('#duplicateSettingsContainer');
      if (duplicateSettingsContainer) {
        duplicateSettingsContainer.style.display = (this.settings.duplicatePrevention.preventDuplicates ?? false) ? 'flex' : 'none';
      }
    }

    // ========== UPDATE SETTINGS ==========
    // Auto-update toggle
    const autoUpdateToggle = document.querySelector('#autoUpdate');
    if (autoUpdateToggle) {
      autoUpdateToggle.checked = this.settings.updates?.autoUpdate ?? false;
    }

    // Check interval selector
    const checkIntervalSelect = document.querySelector('#checkIntervalHours');
    if (checkIntervalSelect) {
      checkIntervalSelect.value = this.settings.updates?.checkIntervalHours ?? 12;
    }

    // Show/hide update interval group based on auto-update state
    const updateIntervalGroup = document.querySelector('#updateIntervalGroup');
    if (updateIntervalGroup) {
      updateIntervalGroup.style.display = (this.settings.updates?.autoUpdate ?? false) ? 'flex' : 'none';
    }

    // Last check time display
    const lastCheckSpan = document.querySelector('#lastUpdateCheckTime');
    if (lastCheckSpan) {
      const lastCheck = this.settings.updates?.lastCheckTimestamp || 0;
      if (lastCheck > 0 && typeof UpdateManager !== 'undefined') {
        lastCheckSpan.textContent = UpdateManager.formatLastCheck(lastCheck);
      } else {
        lastCheckSpan.textContent = 'Never';
      }
    }

    // Update incompatible updates warning display
    this.updateIncompatibleUpdatesDisplay();

};

SettingsUI.getSettingsFromUI = function() {
    const settings = {};
    const readNumber = (selector, fallback) => {
      const raw = document.querySelector(selector)?.value;
      if (raw === undefined || raw === null || raw === '') {
        return fallback;
      }
      const value = Number(raw);
      return Number.isFinite(value) ? value : fallback;
    };

    // ========== GENERAL TAB ==========
    // Basic toggles
    const notificationsToggle = document.querySelector('#notificationsEnabled');
    const debugModeToggle = document.querySelector('#debugModeGeneral');
    const logCollectorToggle = document.querySelector('#logCollectorEnabled');
    const logCollectorMaxLogsInput = document.querySelector('#logCollectorMaxLogs');
    settings.notificationsEnabled = notificationsToggle?.checked ?? this.settings.notificationsEnabled ?? true;
    settings.debugMode = debugModeToggle?.checked ?? this.settings.debugMode ?? false;
    settings.logCollectorEnabled = logCollectorToggle?.checked ?? this.settings.logCollectorEnabled ?? false;
    const rawMaxLogs = parseInt(logCollectorMaxLogsInput?.value ?? this.settings.logCollectorMaxLogs ?? 5000);
    settings.logCollectorMaxLogs = Math.min(Math.max(rawMaxLogs, 100), 5000);

    // Badge Colors (using BADGE constants as defaults)
    settings.badgeColors = {
      low: document.querySelector('#colorBadgeLow')?.value ?? this.settings.badgeColors?.low ?? BADGE.COLORS.LOW,
      medium: document.querySelector('#colorBadgeMedium')?.value ?? this.settings.badgeColors?.medium ?? BADGE.COLORS.MEDIUM,
      high: document.querySelector('#colorBadgeHigh')?.value ?? this.settings.badgeColors?.high ?? BADGE.COLORS.HIGH
    };

    // Category Colors
    settings.categoryColors = {
      antibot: document.querySelector('#colorAntibot')?.value ?? this.settings.categoryColors?.antibot ?? '#FF5733',
      captcha: document.querySelector('#colorCaptcha')?.value ?? this.settings.categoryColors?.captcha ?? '#33C3FF',
      fingerprint: document.querySelector('#colorFingerprint')?.value ?? this.settings.categoryColors?.fingerprint ?? '#3b82f6'
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
      cacheScope: document.querySelector('#cacheScope')?.value ?? this.settings.detection?.cacheScope ?? 'domain',
      blacklistedDomains: this.settings.detection?.blacklistedDomains || [] // This is managed separately by the blacklist UI
    };

    // JS API Settings
    const jsApiEnabled = document.querySelector('#enableJsApi')?.checked ?? this.settings.jsApi?.enableJsApi ?? true;
    settings.jsApi = {
      enableJsApi: jsApiEnabled
    };

    // Webhook Settings
    settings.webhook = {
      enableWebhook: document.querySelector('#enableWebhook')?.checked ?? this.settings.webhook?.enableWebhook ?? false,
      webhookOnCache: document.querySelector('#webhookOnCache')?.checked ?? this.settings.webhook?.webhookOnCache ?? false,
      webhookMethod: document.querySelector('#webhookMethod')?.value ?? this.settings.webhook?.webhookMethod ?? 'POST',
      webhookUrl: document.querySelector('#webhookUrl')?.value ?? this.settings.webhook?.webhookUrl ?? '',
      webhookContentType: document.querySelector('#webhookContentType')?.value ?? this.settings.webhook?.webhookContentType ?? 'application/json',
      webhookPayload: document.querySelector('#webhookPayload')?.value ?? this.settings.webhook?.webhookPayload ?? '',
      webhookHeaders: this.settings.webhook?.webhookHeaders || []
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
      autoUpdate: document.querySelector('#autoUpdate')?.checked ?? this.settings.updates?.autoUpdate ?? false,
      checkIntervalHours: parseInt(document.querySelector('#checkIntervalHours')?.value ?? this.settings.updates?.checkIntervalHours ?? 12),
      lastCheckTimestamp: this.settings.updates?.lastCheckTimestamp ?? 0 // Preserve timestamp, don't reset on save
    };

    return settings;
};

SettingsUI.validateSettings = function(settings) {
    const errors = [];

    // Validate history limit (can be 0 for unlimited)
    if (settings.history && settings.history.historyLimit !== undefined) {
      if (settings.history.historyLimit < 0 || settings.history.historyLimit > 10000) {
        errors.push('History limit must be between 0 (unlimited) and 10000');
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
};

SettingsUI.resetToDefaults = async function() {
    const confirmed = await NotificationHelper.confirm({
      title: 'Reset Settings',
      message: 'Are you sure you want to reset all settings to their default values? This action cannot be undone.',
      type: 'warning',
      confirmText: 'Reset',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      await this.loadDefaults();
      this.updateSettingsUI();
      await this.saveSettings();
      NotificationHelper.success('Settings reset');
    }
};

SettingsUI.clearAllData = async function() {
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
};

SettingsUI.showSuccessMessage = function(message) {
    this.showNotification(message, 'success');
};

SettingsUI.showErrorMessage = function(message) {
    this.showNotification(message, 'error');
};

SettingsUI.showNotification = function(message, type = 'info') {
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
};

SettingsUI.getNotificationIcon = function(type) {
    switch (type) {
      case 'success':
        return '';
      case 'error':
        return '';
      case 'warning':
        return '';
      default:
        return '';
    }
};

SettingsUI.setupEventListeners = function() {
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
            NotificationHelper.success('Logs cleared');
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
        // Clamp value between 100 and 5000
        if (maxLogs < 100) maxLogs = 100;
        if (maxLogs > 5000) maxLogs = 5000;
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

    // Close modal when clicking on backdrop
    const settingsModal = document.querySelector('#settingsModal');
    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        // Close if clicking on the modal container itself or the backdrop
        if (e.target === settingsModal || e.target.classList.contains('base-modal-backdrop')) {
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

    // Add Webhook Header button
    const addWebhookHeaderBtn = document.querySelector('#addWebhookHeaderBtn');
    if (addWebhookHeaderBtn) {
      addWebhookHeaderBtn.addEventListener('click', () => {
        if (!this.settings.webhook) {
          this.settings.webhook = { webhookHeaders: [] };
        }
        if (!this.settings.webhook.webhookHeaders) {
          this.settings.webhook.webhookHeaders = [];
        }
        this.settings.webhook.webhookHeaders.push({ name: '', value: '' });
        this.renderWebhookHeadersUI();
      });
    }

    // JS API usage example - click to copy
    const jsApiCodeBlock = document.querySelector('#jsApiUsageCode');
    if (jsApiCodeBlock) {
      jsApiCodeBlock.addEventListener('click', () => {
        FormatUtils.copyToClipboard(jsApiCodeBlock.textContent, { notificationMessage: 'Code copied' });
      });
    }

    // JS API event names - click to copy
    document.querySelectorAll('.api-event-item code').forEach(codeEl => {
      codeEl.style.cursor = 'pointer';
      codeEl.title = 'Click to copy';
      codeEl.addEventListener('click', () => {
        FormatUtils.copyToClipboard(codeEl.textContent, { notificationMessage: 'Copied' });
      });
    });

    // Webhook Enable toggle - show/hide webhook settings
    const enableWebhookToggle = document.querySelector('#enableWebhook');
    const webhookSettingsContainer = document.querySelector('#webhookSettings');
    const webhookOnCacheGroup = document.querySelector('#webhookOnCacheGroup');
    if (enableWebhookToggle) {
      enableWebhookToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        if (webhookSettingsContainer) {
          webhookSettingsContainer.style.display = isEnabled ? 'block' : 'none';
        }
        if (webhookOnCacheGroup) {
          webhookOnCacheGroup.style.display = isEnabled ? 'flex' : 'none';
        }
      });
      // Set initial state
      const isEnabled = enableWebhookToggle.checked;
      if (webhookSettingsContainer) {
        webhookSettingsContainer.style.display = isEnabled ? 'block' : 'none';
      }
      if (webhookOnCacheGroup) {
        webhookOnCacheGroup.style.display = isEnabled ? 'flex' : 'none';
      }
    }

    // Duplicate Prevention toggle - show/hide duplicate settings
    const preventDuplicatesToggle = document.querySelector('#preventDuplicates');
    const duplicateSettingsContainer = document.querySelector('#duplicateSettingsContainer');
    if (preventDuplicatesToggle) {
      preventDuplicatesToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        if (duplicateSettingsContainer) {
          duplicateSettingsContainer.style.display = isEnabled ? 'flex' : 'none';
        }
      });
      // Set initial state
      const isEnabled = preventDuplicatesToggle.checked;
      if (duplicateSettingsContainer) {
        duplicateSettingsContainer.style.display = isEnabled ? 'flex' : 'none';
      }
    }

    // Test Webhook button
    const testWebhookBtn = document.querySelector('#testWebhookBtn');
    if (testWebhookBtn) {
      testWebhookBtn.addEventListener('click', () => this.handleTestWebhook());
    }

    // ========== UPDATE SETTINGS ==========

    // Auto-update toggle
    const autoUpdateToggle = document.querySelector('#autoUpdate');
    const updateIntervalGroup = document.querySelector('#updateIntervalGroup');
    if (autoUpdateToggle) {
      autoUpdateToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        if (!this.settings.updates) this.settings.updates = {};
        this.settings.updates.autoUpdate = isEnabled;
        // Show/hide interval selector based on auto-update state
        if (updateIntervalGroup) {
          updateIntervalGroup.style.display = isEnabled ? 'flex' : 'none';
        }
        this.saveSettings();
      });
    }

    // Check interval selector
    const checkIntervalSelect = document.querySelector('#checkIntervalHours');
    if (checkIntervalSelect) {
      checkIntervalSelect.addEventListener('change', (e) => {
        if (!this.settings.updates) this.settings.updates = {};
        this.settings.updates.checkIntervalHours = parseInt(e.target.value, 10);
        this.saveSettings();
      });
    }

    // Check Updates Now button
    const checkUpdatesNowBtn = document.querySelector('#checkUpdatesNowBtn');
    if (checkUpdatesNowBtn) {
      checkUpdatesNowBtn.addEventListener('click', () => this.handleCheckUpdatesNow());
    }

    // Setup color pagination controls
    this.setupColorPagination();
};

SettingsUI.startLogCountUpdate = function() {
    if (this.logCountUpdateInterval) {
      clearInterval(this.logCountUpdateInterval);
    }

    // Update immediately
    this.updateLogCount();

    // Then update every 2 seconds
    this.logCountUpdateInterval = setInterval(() => {
      this.updateLogCount();
    }, 2000);
};

SettingsUI.stopLogCountUpdate = function() {
    if (this.logCountUpdateInterval) {
      clearInterval(this.logCountUpdateInterval);
      this.logCountUpdateInterval = null;
    }
};

SettingsUI.updateLogCount = function() {
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
};

SettingsUI.setupColorPagination = function() {
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
};

SettingsUI.renderBlacklistUI = function() {
    const container = document.querySelector('#blacklistContainer');
    const paginationContainer = document.querySelector('#blacklistPagination');
    const pageNumEl = document.querySelector('#blacklistPageNum');
    const totalPagesEl = document.querySelector('#blacklistTotalPages');
    const prevBtn = document.querySelector('#blacklistPrevBtn');
    const nextBtn = document.querySelector('#blacklistNextBtn');
    const searchInput = document.querySelector('#blacklistSearchInput');

    if (!container) return;

    const allDomains = this.settings.detection?.blacklistedDomains || [];
    const itemsPerPage = 3;

    // Initialize state if not exists
    if (typeof this.blacklistPage === 'undefined') {
      this.blacklistPage = 1;
    }
    if (typeof this.blacklistSearch === 'undefined') {
      this.blacklistSearch = '';
    }

    // Filter domains by search
    const searchTerm = this.blacklistSearch.toLowerCase().trim();
    const filteredDomains = searchTerm
      ? allDomains.filter(d => d.toLowerCase().includes(searchTerm))
      : allDomains;

    const totalPages = Math.ceil(filteredDomains.length / itemsPerPage) || 1;

    // Ensure current page is valid
    if (this.blacklistPage > totalPages) this.blacklistPage = totalPages;
    if (this.blacklistPage < 1) this.blacklistPage = 1;

    // Show/hide pagination
    if (paginationContainer) {
      paginationContainer.style.display = filteredDomains.length > itemsPerPage ? 'flex' : 'none';
    }

    // Update pagination info
    if (pageNumEl) pageNumEl.textContent = this.blacklistPage;
    if (totalPagesEl) totalPagesEl.textContent = totalPages;

    // Update pagination buttons
    if (prevBtn) prevBtn.disabled = this.blacklistPage <= 1;
    if (nextBtn) nextBtn.disabled = this.blacklistPage >= totalPages;

    if (filteredDomains.length === 0) {
      container.innerHTML = searchTerm
        ? '<div style="color: var(--text-muted); font-size: 12px; padding: 8px; text-align: center;">No domains match your search</div>'
        : '<div style="color: var(--text-muted); font-size: 12px; padding: 8px; text-align: center;">No domains blacklisted</div>';
      return;
    }

    // Get current page items
    const startIndex = (this.blacklistPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentDomains = filteredDomains.slice(startIndex, endIndex);

    const html = currentDomains.map(domain => `
      <div class="blacklist-item" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--bg-tertiary); border-radius: 4px; margin-bottom: 4px;">
        <span style="font-size: 12px; line-height: 14px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${domain}</span>
        <button class="remove-blacklist-btn" data-domain="${domain}" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; transition: color 0.2s; flex-shrink: 0; margin-left: 8px;">
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    `).join('');

    container.innerHTML = html;

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
};

SettingsUI.setupBlacklistEventListeners = function() {
    const searchInput = document.querySelector('#blacklistSearchInput');
    const prevBtn = document.querySelector('#blacklistPrevBtn');
    const nextBtn = document.querySelector('#blacklistNextBtn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.blacklistSearch = e.target.value;
        this.blacklistPage = 1; // Reset to first page on search
        this.renderBlacklistUI();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.blacklistPage > 1) {
          this.blacklistPage--;
          this.renderBlacklistUI();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const allDomains = this.settings.detection?.blacklistedDomains || [];
        const searchTerm = (this.blacklistSearch || '').toLowerCase().trim();
        const filteredDomains = searchTerm
          ? allDomains.filter(d => d.toLowerCase().includes(searchTerm))
          : allDomains;
        const totalPages = Math.ceil(filteredDomains.length / 3) || 1;

        if (this.blacklistPage < totalPages) {
          this.blacklistPage++;
          this.renderBlacklistUI();
        }
      });
    }
};

SettingsUI.renderWebhookHeadersUI = function() {
    const container = document.querySelector('#webhookHeadersContainer');
    if (!container) return;

    const headers = this.settings.webhook?.webhookHeaders || [];

    if (headers.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 8px; text-align: center;">No custom headers configured</div>';
      return;
    }

    container.innerHTML = headers.map((header, index) => `
      <div class="webhook-header-item" data-index="${index}" style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
        <input type="text" class="webhook-header-name input-field" placeholder="Header name" value="${this.escapeHtml(header.name || '')}" style="flex: 1; font-size: 13px; padding: 8px;">
        <input type="text" class="webhook-header-value input-field" placeholder="Header value" value="${this.escapeHtml(header.value || '')}" style="flex: 2; font-size: 13px; padding: 8px;">
        <button type="button" class="remove-webhook-header-btn" data-index="${index}" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 6px; display: flex; align-items: center;">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Add click handlers for remove buttons
    container.querySelectorAll('.remove-webhook-header-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.getAttribute('data-index'));
        this.settings.webhook.webhookHeaders.splice(index, 1);
        this.renderWebhookHeadersUI();
      });
    });

    // Add input change handlers to update settings in real-time
    container.querySelectorAll('.webhook-header-item').forEach(item => {
      const index = parseInt(item.getAttribute('data-index'));
      const nameInput = item.querySelector('.webhook-header-name');
      const valueInput = item.querySelector('.webhook-header-value');

      nameInput.addEventListener('input', () => {
        this.settings.webhook.webhookHeaders[index].name = nameInput.value;
      });

      valueInput.addEventListener('input', () => {
        this.settings.webhook.webhookHeaders[index].value = valueInput.value;
      });
    });
};

SettingsUI.handleSaveSettings = async function() {
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
};

SettingsUI.updateHttpMethodColor = function(selectElement) {
    if (!selectElement) return;

    // Remove all method classes
    selectElement.classList.remove('method-get', 'method-post', 'method-put', 'method-patch', 'method-delete');

    // Add appropriate class based on selected value
    const value = selectElement.value.toLowerCase();
    if (value) {
      selectElement.classList.add(`method-${value}`);
    }
};

SettingsUI.setupWebhookMethodRadios = function() {
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
};

SettingsUI.setupCustomHttpMethodDropdown = function(dropdown, hiddenInput) {
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
};

SettingsUI.updateCustomHttpMethodDropdown = function(dropdown, value) {
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
};

SettingsUI.handleTestWebhook = async function() {
    const btn = document.querySelector('#testWebhookBtn');
    if (!btn) return;

    // Disable button and show loading state
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" class="spin">
        <path d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" fill="currentColor"/>
      </svg>
      Sending...
    `;

    try {
      // Get current webhook settings from UI
      const webhookUrl = document.querySelector('#webhookUrl')?.value || '';
      const webhookMethod = document.querySelector('#webhookMethod')?.value || 'POST';
      const webhookContentType = document.querySelector('#webhookContentType')?.value || 'application/json';
      const webhookPayload = document.querySelector('#webhookPayload')?.value || '';

      if (!webhookUrl) {
        NotificationHelper.error('Please enter a webhook URL');
        return;
      }

      // Get custom headers from current settings
      const customHeaders = this.settings.webhook?.webhookHeaders || [];

      // Create test data
      const testUrl = 'https://example.com/test-page';
      const testHostname = 'example.com';
      const testTitle = 'Test Page - Webhook Test';
      const testFavicon = 'https://www.google.com/s2/favicons?domain=example.com&sz=64';
      const testTimestamp = new Date().toISOString();
      const testDetections = [
        {
          id: 'test-detector',
          name: 'Test Detector',
          category: 'Anti-Bot',
          confidence: 95,
          color: '#F48120',
          methods: ['dom', 'cookie']
        }
      ];
      const testCount = 1;
      const testCategories = 'Anti-Bot';

      // Build headers object
      const headers = {};
      if (webhookMethod.toUpperCase() !== 'GET') {
        headers['Content-Type'] = webhookContentType;
      }

      // Add custom headers
      for (const header of customHeaders) {
        if (header.name && header.name.trim()) {
          let headerValue = header.value || '';
          headerValue = headerValue
            .replace(/<SITEURL>/g, testUrl)
            .replace(/<HOSTNAME>/g, testHostname)
            .replace(/<TITLE>/g, testTitle)
            .replace(/<FAVICON>/g, testFavicon)
            .replace(/<TIMESTAMP>/g, testTimestamp)
            .replace(/<DETECTION_COUNT>/g, String(testCount))
            .replace(/<CATEGORIES>/g, testCategories);
          headers[header.name.trim()] = headerValue;
        }
      }

      // Process webhook URL with variable substitution
      let processedUrl = webhookUrl
        .replace(/<SITEURL>/g, encodeURIComponent(testUrl))
        .replace(/<HOSTNAME>/g, encodeURIComponent(testHostname))
        .replace(/<TITLE>/g, encodeURIComponent(testTitle))
        .replace(/<FAVICON>/g, encodeURIComponent(testFavicon))
        .replace(/<TIMESTAMP>/g, encodeURIComponent(testTimestamp))
        .replace(/<DETECTION_COUNT>/g, String(testCount))
        .replace(/<CATEGORIES>/g, encodeURIComponent(testCategories));

      // Build fetch options
      const fetchOptions = {
        method: webhookMethod.toUpperCase(),
        headers: headers
      };

      // Add body for non-GET requests
      if (webhookMethod.toUpperCase() !== 'GET') {
        let payload = webhookPayload;

        // If payload template is empty, use default JSON payload
        if (!payload.trim()) {
          payload = JSON.stringify({
            url: testUrl,
            hostname: testHostname,
            title: testTitle,
            favicon: testFavicon,
            detections: testDetections,
            timestamp: testTimestamp,
            count: testCount
          });
        } else {
          // Process payload template with variable substitution
          payload = payload
            .replace(/<SITEURL>/g, testUrl)
            .replace(/<HOSTNAME>/g, testHostname)
            .replace(/<TITLE>/g, testTitle)
            .replace(/<FAVICON>/g, testFavicon)
            .replace(/<TIMESTAMP>/g, testTimestamp)
            .replace(/<DETECTION_COUNT>/g, String(testCount))
            .replace(/<CATEGORIES>/g, testCategories)
            .replace(/<DETECTIONS>/g, JSON.stringify(testDetections));
        }

        fetchOptions.body = payload;
      }

      Logger.network('Test webhook:', { url: processedUrl, options: fetchOptions });

      // Send test webhook
      const response = await fetch(processedUrl, fetchOptions);

      if (response.ok) {
        NotificationHelper.success(`Webhook test successful! Status: ${response.status}`);
        Logger.network('Test webhook success:', { status: response.status });
      } else {
        NotificationHelper.error(`Webhook returned status: ${response.status}`);
        Logger.warn('NETWORK', 'Test webhook failed:', { status: response.status });
      }
    } catch (error) {
      Logger.error('NETWORK', 'Test webhook error:', error);
      NotificationHelper.error('Webhook test failed: ' + error.message);
    } finally {
      // Re-enable button
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
};

SettingsUI.updateIncompatibleUpdatesDisplay = async function() {
    const warning = document.querySelector('#incompatibleUpdatesWarning');
    if (!warning || typeof UpdateManager === 'undefined') return;

    try {
      const updates = await UpdateManager.getIncompatibleUpdates();

      if (updates.length === 0) {
        warning.style.display = 'none';
        return;
      }

      // Show warning
      warning.style.display = 'flex';

      // Update count
      const countSpan = document.querySelector('#incompatibleCount');
      if (countSpan) {
        countSpan.textContent = updates.length;
      }

      // Build details list using safe DOM methods (CSP compliant - no innerHTML)
      const list = document.querySelector('#incompatibleDetailsList');
      if (list) {
        list.replaceChildren(); // Clear existing items

        for (const update of updates) {
          const item = document.createElement('div');
          item.className = 'incompatible-item';

          const nameSpan = document.createElement('span');
          nameSpan.className = 'incompatible-item-name';
          nameSpan.textContent = update.name;

          const versionSpan = document.createElement('span');
          versionSpan.className = 'incompatible-item-version';
          versionSpan.textContent = `v${update.remoteVersion} (needs ext v${update.minExtensionVersion})`;

          item.appendChild(nameSpan);
          item.appendChild(versionSpan);
          list.appendChild(item);
        }
      }
    } catch (error) {
      Logger.error('UI', 'Failed to update incompatible updates display:', error);
      warning.style.display = 'none';
    }
};

SettingsUI.handleCheckUpdatesNow = async function() {
    const btn = document.querySelector('#checkUpdatesNowBtn');
    const lastCheckSpan = document.querySelector('#lastUpdateCheckTime');
    if (!btn) return;

    // Disable button and show loading state
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" class="spin">
        <path d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" fill="currentColor"/>
      </svg>
      Checking...
    `;

    try {
      // Check if UpdateManager is available
      if (typeof UpdateManager === 'undefined') {
        throw new Error('UpdateManager not loaded');
      }

      // Force check for updates
      const result = await UpdateManager.checkForUpdates(true);

      // Update last check time display
      if (lastCheckSpan) {
        const settings = await Utils.getSettings();
        const lastCheck = settings.updates?.lastCheckTimestamp || 0;
        lastCheckSpan.textContent = lastCheck > 0 ? UpdateManager.formatLastCheck(lastCheck) : 'Just now';
      }

      // Get pending updates count
      const pendingCount = await UpdateManager.getPendingUpdatesCount();

      if (pendingCount > 0) {
        NotificationHelper.success(`Found ${pendingCount} detector update${pendingCount > 1 ? 's' : ''} available!`);
      } else {
        NotificationHelper.info('All detectors are up to date.');
      }

      // Check for incompatible updates and notify user
      const incompatibleCount = await UpdateManager.getIncompatibleUpdatesCount();
      if (incompatibleCount > 0) {
        NotificationHelper.warning(
          `${incompatibleCount} detector update${incompatibleCount > 1 ? 's' : ''} require a newer extension version.`,
          { duration: 8000 }
        );
      }

      // Update the incompatible updates display
      await this.updateIncompatibleUpdatesDisplay();

      Logger.ui('Update check completed:', { pendingCount, incompatibleCount, result });

    } catch (error) {
      Logger.error('UI', 'Failed to check for updates:', error);
      NotificationHelper.error('Failed to check for updates: ' + error.message);
    } finally {
      // Re-enable button
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
