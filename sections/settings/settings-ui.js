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
      requestAnimationFrame(() => {
        const activeBtn = document.querySelector('.settings-tab-btn.active');
        if (activeBtn) {
          activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      });
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
    const allTabButtons = document.querySelectorAll('.settings-tab-btn');
    let activeBtn = null;
    allTabButtons.forEach(btn => {
      if (btn.getAttribute('data-settings-tab') === tabName) {
        btn.classList.add('active');
        activeBtn = btn;
      } else {
        btn.classList.remove('active');
      }
    });

    if (activeBtn) {
      activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

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
        // Handle both string and object storage formats
        const savedSettings = typeof StorageManager !== 'undefined' && typeof StorageManager.parseStoredValue === 'function'
          ? StorageManager.parseStoredValue(result.scrapfly_settings, 'scrapfly_settings')
          : (typeof result.scrapfly_settings === 'string'
              ? JSON.parse(result.scrapfly_settings)
              : result.scrapfly_settings);
        const loadedSettings = typeof StorageManager !== 'undefined' && typeof StorageManager.normalizeSettings === 'function'
          ? StorageManager.normalizeSettings(result.scrapfly_settings)
          : (savedSettings.settings || savedSettings);

        Logger.debug('UI', 'Settings read', { keys: Object.keys(loadedSettings || {}).length });

        if (typeof loadedSettings === 'object' && loadedSettings !== null) {
          this.settings = this.deepMerge(this.settings, loadedSettings);
          const legacyHooksConfig = this.settings.hooksConfig;
          delete this.settings.hooksConfig;
          delete this.settings.reliabilityConfig;
          // Legacy compatibility: migrate flat cache settings to nested structure
          if (this.settings.detection) {
            if (this.settings.detection.hooksConfig === undefined &&
                legacyHooksConfig && typeof legacyHooksConfig === 'object') {
              this.settings.detection.hooksConfig = legacyHooksConfig;
            }
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
        Logger.debug('UI', 'No saved settings found, using defaults');
      }

      if (typeof Utils !== 'undefined' && typeof Utils.applyDebugMode === 'function') {
        Utils.applyDebugMode(this.settings);
      }

      // Apply current language override (stored separately from main settings
      // so it can be loaded at popup boot before settings UI initializes).
      try {
        const langResult = await chrome.storage.local.get(['scrapfly_language_override']);
        const langValue = langResult.scrapfly_language_override || 'auto';
        if (typeof SettingsUI.setLanguagePickerValue === 'function') {
          SettingsUI.setLanguagePickerValue(langValue);
        } else {
          const langInput = document.querySelector('#languageOverride');
          if (langInput) langInput.value = langValue;
        }
      } catch (_) {
        // chrome.storage unavailable (rare; e.g., extension reloading mid-popup).
        // Dropdown stays at its default 'auto' option — matches the runtime
        // behavior in popup.js, which also falls back to the browser locale
        // when storage is unreadable. No user-visible regression.
      }

      this.updateSettingsUI();
      Logger.debug('UI', 'Settings loaded');

    } catch (error) {
      Logger.error('UI', 'Failed to load settings:', error);
      NotificationHelper.error(((typeof I18n !== 'undefined') && I18n.get('failedLoadSettingsDefault')) || 'Failed to load settings. Using defaults.');
    }
};

SettingsUI.deepMerge = function(target, source) {
    const result = { ...target };

    const typeOf = (v) => {
      if (Array.isArray(v)) return 'array';
      if (v === null) return 'null';
      return typeof v;
    };

    for (const key in source) {
      if (!source.hasOwnProperty(key)) continue;
      const srcVal = source[key];
      const tgtVal = result[key];

      // New key (not in defaults) — allow as-is; can't validate without schema.
      if (tgtVal === undefined) {
        result[key] = srcVal;
        continue;
      }

      // Drop stored values whose type doesn't match defaults — protects against
      // a corrupted/malicious storage entry poisoning the merged settings shape.
      if (typeOf(srcVal) !== typeOf(tgtVal)) continue;

      if (typeOf(srcVal) === 'object') {
        result[key] = this.deepMerge(tgtVal, srcVal);
      } else {
        result[key] = srcVal;
      }
    }

    return result;
};

SettingsUI.setToggleControlledVisibility = function(toggleEl, targets = []) {
    if (!Array.isArray(targets) || targets.length === 0) {
      return;
    }

    const isEnabled = !!(toggleEl && toggleEl.checked);

    targets.forEach((target) => {
      if (!target || !target.element) {
        return;
      }

      target.element.style.display = isEnabled
        ? (target.onDisplay || 'block')
        : 'none';
    });
};

SettingsUI.saveSettings = async function(options = {}) {
    try {
      const shouldNotify = options.notify !== false;
      let oldCacheScope = null;
      try {
        const result = await chrome.storage.local.get(['scrapfly_settings']);
        if (result.scrapfly_settings) {
          const loadedSettings = typeof StorageManager !== 'undefined' && typeof StorageManager.normalizeSettings === 'function'
            ? StorageManager.normalizeSettings(result.scrapfly_settings)
            : {};
          oldCacheScope = loadedSettings.cacheScope || loadedSettings.detection?.cacheScope || 'domain';
        }
      } catch (error) {
        Logger.debug('UI', 'Could not read old cache scope:', error);
      }

      delete this.settings.hooksConfig;
      delete this.settings.reliabilityConfig;
      // Legacy compatibility: remove flat cache settings migrated to detection.*
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

      Logger.debug('UI', 'Settings saved:', this.settings);

      const newCacheScope = this.settings.cacheScope || this.settings.detection?.cacheScope || 'domain';
      const cacheScopeChanged = oldCacheScope && oldCacheScope !== newCacheScope;

      if (cacheScopeChanged) {
        Logger.debug('UI', `[Settings] Cache scope changed from "${oldCacheScope}" to "${newCacheScope}" - preserving cache data, invalidating current view`);

        UrlUtils.clearUrlHashCache();

        chrome.runtime.sendMessage({ type: 'CACHE_SCOPE_CHANGED' }, (response) => {
          if (chrome.runtime.lastError) {
            Logger.debug('UI', 'Failed to notify background of cache scope change:', chrome.runtime.lastError.message);
          }
        });

        chrome.runtime.sendMessage({ type: 'DETECTION_CLEAR_CACHE' }, (response) => {
          if (chrome.runtime.lastError) {
            Logger.debug('UI', 'Failed to notify Detection tab:', chrome.runtime.lastError.message);
          }
        });
      }

      if (shouldNotify) {
        NotificationHelper.success(((typeof I18n !== 'undefined') && I18n.get('settingsSavedToast')) || 'Settings saved');
      }

      // Invalidate background settings cache so webhook/background features use updated values
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' }, (response) => {
        if (chrome.runtime.lastError) {
          Logger.debug('UI', 'Failed to notify background of settings update:', chrome.runtime.lastError.message);
        } else {
          Logger.debug('UI', 'Background notified of settings update:', response);
        }
      });

      chrome.runtime.sendMessage({ type: 'SYNC_CATEGORY_COLORS' }, (response) => {
        if (chrome.runtime.lastError) {
          Logger.debug('UI', 'Failed to sync category colors:', chrome.runtime.lastError.message);
        } else {
          Logger.debug('UI', 'Category colors synced:', response);
        }
      });

      return true;

    } catch (error) {
      Logger.error('UI', 'Failed to save settings:', error);
      const _tFS = (typeof I18n !== 'undefined') ? I18n : null;
      NotificationHelper.error((_tFS && _tFS.format('failedSaveSettingsFmt', error.message)) || ('Failed to save settings: ' + error.message));
      return false;
    }
};

SettingsUI.updateSettingsUI = function() {
    // ========== GENERAL TAB ==========
    const notificationsToggle = document.querySelector('#notificationsEnabled');
    if (notificationsToggle) {
      notificationsToggle.checked = this.settings.notificationsEnabled ?? true;
    }

    const debugModeToggle = document.querySelector('#debugModeGeneral');
    if (debugModeToggle) {
      debugModeToggle.checked = this.settings.debugMode ?? false;
    }

    const logCollectorSection = document.querySelector('#logCollectorSection');
    if (logCollectorSection) {
      logCollectorSection.style.display = (this.settings.debugMode ?? false) ? 'block' : 'none';
    }

    const debugVerboseToggle = document.querySelector('#debugVerbose');
    if (debugVerboseToggle) {
      debugVerboseToggle.checked = this.settings.debugVerbose ?? false;
    }

    const logCollectorToggle = document.querySelector('#logCollectorEnabled');
    if (logCollectorToggle) {
      logCollectorToggle.checked = this.settings.logCollectorEnabled ?? false;
    }

    const logCollectorControls = document.querySelector('#logCollectorControls');
    if (logCollectorControls) {
      logCollectorControls.style.display = (this.settings.logCollectorEnabled ?? false) ? 'block' : 'none';
    }

    const logCollectorMaxLogsInput = document.querySelector('#logCollectorMaxLogs');
    if (logCollectorMaxLogsInput) {
      const safeMax = Math.min(Math.max(this.settings.logCollectorMaxLogs ?? 5000, 100), 5000);
      logCollectorMaxLogsInput.value = safeMax;
    }

    const logCountMax = document.querySelector('#logCountMax');
    if (logCountMax) {
      const safeMax = Math.min(Math.max(this.settings.logCollectorMaxLogs ?? 5000, 100), 5000);
      logCountMax.textContent = safeMax;
    }

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

    if (typeof SettingsUI.syncColorRowBadges === 'function') {
      SettingsUI.syncColorRowBadges();
    }

    // ========== DETECTION TAB ==========
    if (this.settings.detection) {
      const cacheScopeSelect = document.querySelector('#cacheScope');
      if (cacheScopeSelect) {
        cacheScopeSelect.value = this.settings.detection.cacheScope || 'domain';
        Logger.debug('UI', 'Cache scope loaded:', this.settings.detection.cacheScope);
      }

      SettingsUI.populateCategoryOrder(this.settings.detection.categoryOrder);

      // Values saved before the per-unit ranges existed (e.g. 48 hours) are
      // shown and kept in their equivalent in-range form (2 days), so saving
      // never fails on a pre-existing setting.
      const cacheDisplay = SettingsUI.getCacheDurationDisplay(this.settings.detection);
      this.settings.detection.cacheDuration = cacheDisplay.duration;
      this.settings.detection.cacheUnit = cacheDisplay.unit;
      const cacheDurationInput = document.querySelector('#cacheDuration');
      if (cacheDurationInput) {
        cacheDurationInput.value = cacheDisplay.duration;
      }

      const cacheUnitSelect = document.querySelector('#cacheUnit');
      if (cacheUnitSelect) {
        cacheUnitSelect.value = cacheDisplay.unit;
      }
      SettingsUI.updateCacheDurationHint();

        this.renderBlacklistUI();
      this.setupBlacklistEventListeners();
    }

    // JS API Settings
    const enableJsApi = document.querySelector('#enableJsApi');
    const jsApiSettingsContainer = document.querySelector('#jsApiSettings');
    const jsApiEnabled = this.settings.jsApi?.enableJsApi ?? true;
    if (enableJsApi) {
      enableJsApi.checked = jsApiEnabled;
    }
    SettingsUI.setToggleControlledVisibility(enableJsApi, [
      { element: jsApiSettingsContainer, onDisplay: 'flex' }
    ]);

    // Webhook Settings
    const webhookSettings = this.settings.webhook || {};
    const enableWebhook = document.querySelector('#enableWebhook');
    const isWebhookEnabled = webhookSettings.enableWebhook ?? false;
    if (enableWebhook) enableWebhook.checked = isWebhookEnabled;

    const webhookSettingsContainer = document.querySelector('#webhookSettings');
    const webhookOnCacheGroup = document.querySelector('#webhookOnCacheGroup');
    SettingsUI.setToggleControlledVisibility(enableWebhook, [
      { element: webhookSettingsContainer, onDisplay: 'block' },
      { element: webhookOnCacheGroup, onDisplay: 'flex' }
    ]);

    const webhookOnCache = document.querySelector('#webhookOnCache');
    if (webhookOnCache) webhookOnCache.checked = webhookSettings.webhookOnCache ?? false;

    const webhookMethodInput = document.querySelector('#webhookMethod');
    const customContainer = document.querySelector('#webhookCustomMethodContainer');
    const customMethodInput = document.querySelector('#webhookCustomMethod');
    const value = webhookSettings.webhookMethod || 'POST';
    const standardMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    const isCustom = !standardMethods.includes(value.toUpperCase());

    if (webhookMethodInput) {
      webhookMethodInput.value = value;
    }

    document.querySelectorAll('input[name="webhookMethodRadio"]').forEach(radio => {
      radio.checked = false;
      const badge = radio.closest('.http-method-badge');
      if (badge) badge.classList.remove('checked');
    });

    if (isCustom && customContainer && customMethodInput) {
      const customRadio = document.querySelector('input[name="webhookMethodRadio"][value="CUSTOM"]');
      if (customRadio) {
        customRadio.checked = true;
        const badge = customRadio.closest('.http-method-badge');
        if (badge) badge.classList.add('checked');
      }
      customContainer.style.display = 'block';
      customMethodInput.value = value;
    } else {
      const radio = document.querySelector(`input[name="webhookMethodRadio"][value="${value.toUpperCase()}"]`);
      if (radio) {
        radio.checked = true;
        const badge = radio.closest('.http-method-badge');
        if (badge) badge.classList.add('checked');
      }
      if (customContainer) customContainer.style.display = 'none';
    }

    this.setupWebhookMethodRadios();

    const webhookUrl = document.querySelector('#webhookUrl');
    if (webhookUrl) webhookUrl.value = webhookSettings.webhookUrl || '';

    this.setupWebhookContentType(webhookSettings.webhookContentType || 'application/json');

    const webhookPayload = document.querySelector('#webhookPayload');
    if (webhookPayload) webhookPayload.value = webhookSettings.webhookPayload || WebhookBody.DEFAULT_TEMPLATE;
    SettingsUI.setupWebhookPayloadUI.call(this);

    this.renderWebhookHeadersUI();

    // ========== HISTORY TAB ==========
    if (this.settings.history) {
      const historyLimitInput = document.querySelector('#historyLimit');
      if (historyLimitInput) historyLimitInput.value = this.settings.history.historyLimit ?? 0;

      const historyAutoDelete = document.querySelector('#historyAutoDelete');
      if (historyAutoDelete) historyAutoDelete.checked = this.settings.history.historyAutoDelete ?? false;

      const historyAutoDeleteDays = document.querySelector('#historyAutoDeleteDays');
      if (historyAutoDeleteDays) historyAutoDeleteDays.value = this.settings.history.historyAutoDeleteDays ?? 30;
      SettingsUI.syncHistoryAutoDeleteRow();

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

        const duplicateSettingsContainer = document.querySelector('#duplicateSettingsContainer');
      if (duplicateSettingsContainer) {
        duplicateSettingsContainer.style.display = (this.settings.duplicatePrevention.preventDuplicates ?? false) ? 'flex' : 'none';
      }
    }

    // ========== UPDATE SETTINGS ==========
    const autoUpdateToggle = document.querySelector('#autoUpdate');
    if (autoUpdateToggle) {
      autoUpdateToggle.checked = this.settings.updates?.autoUpdate ?? false;
    }

    const checkIntervalSelect = document.querySelector('#checkIntervalHours');
    if (checkIntervalSelect) {
      checkIntervalSelect.value = this.settings.updates?.checkIntervalHours ?? 12;
    }

    const updateIntervalGroup = document.querySelector('#updateIntervalGroup');
    if (updateIntervalGroup) {
      updateIntervalGroup.style.display = (this.settings.updates?.autoUpdate ?? false) ? 'flex' : 'none';
    }

    const lastCheckSpan = document.querySelector('#lastUpdateCheckTime');
    if (lastCheckSpan) {
      const lastCheck = this.settings.updates?.lastCheckTimestamp || 0;
      if (lastCheck > 0 && typeof UpdateManager !== 'undefined') {
        lastCheckSpan.textContent = UpdateManager.formatLastCheck(lastCheck);
      } else {
        lastCheckSpan.textContent = ((typeof I18n !== 'undefined') && I18n.get('settingsCheckIntervalNever')) || 'Never';
      }
    }

    if (typeof SettingsUI.updateIncompatibleUpdatesDisplay === 'function') {
      void SettingsUI.updateIncompatibleUpdatesDisplay.call(this);
    }

};

SettingsUI.getSettingsFromUI = function() {
    const settings = {};

    // ========== GENERAL TAB ==========
    const notificationsToggle = document.querySelector('#notificationsEnabled');
    const debugModeToggle = document.querySelector('#debugModeGeneral');
    const logCollectorToggle = document.querySelector('#logCollectorEnabled');
    const logCollectorMaxLogsInput = document.querySelector('#logCollectorMaxLogs');
    settings.notificationsEnabled = notificationsToggle?.checked ?? this.settings.notificationsEnabled ?? true;
    settings.debugMode = debugModeToggle?.checked ?? this.settings.debugMode ?? false;
    settings.debugVerbose = document.querySelector('#debugVerbose')?.checked ?? this.settings.debugVerbose ?? false;
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
      categoryOrder: DetectionUtils.normalizeCategoryOrder(document.querySelector('#categoryOrder')?.value
        ?? this.settings.detection?.categoryOrder),
      blacklistedDomains: this.settings.detection?.blacklistedDomains || [], // This is managed separately by the blacklist UI
      hooksConfig: this.settings.detection?.hooksConfig || {}
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
      webhookContentType: this.getWebhookContentTypeValue() ?? this.settings.webhook?.webhookContentType ?? 'application/json',
      webhookPayload: document.querySelector('#webhookPayload')?.value ?? this.settings.webhook?.webhookPayload ?? '',
      webhookHeaders: this.settings.webhook?.webhookHeaders || []
    };

    // ========== HISTORY TAB ==========
    settings.history = {
      historyLimit: parseInt(document.querySelector('#historyLimit')?.value ?? this.settings.history?.historyLimit ?? 0),
      historyAutoDelete: document.querySelector('#historyAutoDelete')?.checked ?? this.settings.history?.historyAutoDelete ?? false,
      historyAutoDeleteDays: parseInt(document.querySelector('#historyAutoDeleteDays')?.value ?? this.settings.history?.historyAutoDeleteDays ?? 30),
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
    // Messages surface in the "Invalid settings: …" toast, so they follow the UI language
    const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    const UNIT_LABEL_KEYS = {
      minutes: ['timeUnitMinutes', 'Minutes'],
      hours: ['timeUnitHours', 'Hours'],
      days: ['timeUnitDays', 'Days'],
      months: ['timeUnitMonths', 'Months'],
      years: ['timeUnitYears', 'Years']
    };

    if (settings.history && settings.history.historyLimit !== undefined) {
      if (settings.history.historyLimit < 0 || settings.history.historyLimit > 10000) {
        errors.push(text('settingsUiErrHistoryLimit', 'History limit must be between 0 (unlimited) and 10000'));
      }
    }

    if (settings.detection && settings.detection.cacheDuration !== undefined) {
      const { cacheDuration, cacheUnit } = settings.detection;
      const max = FormatUtils.CACHE_UNIT_MAX[cacheUnit] || 24;
      if (!Number.isInteger(cacheDuration) || cacheDuration < 1 || cacheDuration > max) {
        const unitEntry = UNIT_LABEL_KEYS[cacheUnit];
        const unitLabel = unitEntry ? text(unitEntry[0], unitEntry[1]) : String(cacheUnit);
        errors.push(text('settingsUiErrCacheDurationFmt', 'Cache duration must be between 1 and {0} {1}', max, unitLabel));
      }
    }

    if (settings.history && settings.history.historyAutoDeleteDays !== undefined) {
      const days = settings.history.historyAutoDeleteDays;
      if (!Number.isFinite(days) || days < 1 || days > 3650) {
        errors.push(text('settingsUiErrAutoDeleteDays', 'Auto-delete days must be between 1 and 3650'));
      }
    }

    if (settings.duplicatePrevention && settings.duplicatePrevention.duplicateDuration !== undefined) {
      if (settings.duplicatePrevention.duplicateDuration < 1 || settings.duplicatePrevention.duplicateDuration > 999) {
        errors.push(text('settingsUiErrDuplicateDuration', 'Duplicate duration must be between 1 and 999'));
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
};

SettingsUI.setupEventListeners = function() {
    if (this.listenersAttached) return;
    this.listenersAttached = true;
    const settingsBtn = document.querySelector('#settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.showSettings());
    }

    const closeSettingsBtn = document.querySelector('#closeSettingsModal');
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => this.hideSettings());
    }

    const saveSettingsBtn = document.querySelector('#saveSettingsBtn');
    if (saveSettingsBtn) {
      Logger.debug('UI', 'Save settings button found, attaching event listener');
      saveSettingsBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        Logger.ui('Save settings button clicked');
        await this.handleSaveSettings();
      });
    } else {
      Logger.error('UI', 'Save settings button NOT found - event listener not attached');
    }

    const cancelSettingsBtn = document.querySelector('#cancelSettingsBtn');
    if (cancelSettingsBtn) {
      cancelSettingsBtn.addEventListener('click', () => this.hideSettings());
    }

    if (typeof SettingsUI.initLanguagePicker === 'function') {
      SettingsUI.initLanguagePicker();
    }

    const tabButtons = document.querySelectorAll('.settings-tab-btn');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-settings-tab');
        this.switchTab(tabName);
      });
    });

    const settingsModal = document.querySelector('#settingsModal');
    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal || e.target.classList.contains('base-modal-backdrop')) {
          this.hideSettings();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isModalVisible) {
        this.hideSettings();
      }
    });

    const addCurrentDomainBtn = document.querySelector('#addCurrentDomainBtn');
    if (addCurrentDomainBtn) {
      addCurrentDomainBtn.addEventListener('click', async () => {
        const t2 = (typeof I18n !== 'undefined') ? I18n : null;
        const _tr2 = (key, fallback) => (t2 && t2.get(key)) || fallback;
        const _fmt2 = (key, fallback, ...args) => (t2 && t2.format(key, ...args)) || fallback;
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || !tab.url) {
            NotificationHelper.error(_tr2('couldNotGetPageUrl', 'Could not get current page URL'));
            return;
          }

          const url = new URL(tab.url);
          const domain = url.hostname;

          if (!this.settings.detection) {
            this.settings.detection = { blacklistedDomains: [] };
          }
          if (!this.settings.detection.blacklistedDomains) {
            this.settings.detection.blacklistedDomains = [];
          }

          if (this.settings.detection.blacklistedDomains.includes(domain)) {
            NotificationHelper.info(_fmt2('domainAlreadyBlacklistedFmt', `${domain} is already blacklisted`, domain));
            return;
          }

          this.settings.detection.blacklistedDomains.push(domain);
          this.renderBlacklistUI();
          const saved = await this.saveSettings({ notify: false });
          if (!saved) {
            return;
          }

          NotificationHelper.success(_fmt2('addedDomainToBlacklistFmt', `Added ${domain} to blacklist`, domain));
        } catch (error) {
          Logger.error('UI', 'Failed to add domain to blacklist', error);
          NotificationHelper.error(_fmt2('failedAddDomainFmt', 'Failed to add domain: ' + error.message, error.message));
        }
      });
    }

    // JS API card: "Available Events" / "Usage Example" are collapsed by default
    document.querySelectorAll('#settingsModal .api-collapsible-header').forEach((header) => {
      if (header.dataset.collapsibleReady) return;
      header.dataset.collapsibleReady = '1';
      const body = document.getElementById(header.getAttribute('aria-controls'));
      header.addEventListener('click', () => {
        const expanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        if (body) body.hidden = expanded;
      });
    });

    const apiTr = (key, fallback) => (typeof I18n !== 'undefined' ? I18n.tr(key, fallback) : fallback);

    const jsApiEventsCount = document.querySelector('#jsApiEventsCount');
    if (jsApiEventsCount) {
      jsApiEventsCount.textContent = String(document.querySelectorAll('#jsApiEventsList .api-event-item').length);
    }

    const jsApiCodeBlock = document.querySelector('#jsApiUsageCode');
    const jsApiCopyCodeBtn = document.querySelector('#jsApiCopyCodeBtn');
    if (jsApiCodeBlock && jsApiCopyCodeBtn) {
      jsApiCopyCodeBtn.addEventListener('click', () => {
        FormatUtils.copyToClipboard(jsApiCodeBlock.textContent, { notificationMessage: apiTr('settingsApiCodeCopied', 'Code copied') });
      });
    }

    document.querySelectorAll('.api-event-item code').forEach(codeEl => {
      codeEl.title = apiTr('settingsApiEventCopyTitle', 'Copy event name');
      codeEl.addEventListener('click', () => {
        FormatUtils.copyToClipboard(codeEl.textContent, { notificationMessage: apiTr('copiedNotification', 'Copied') });
      });
    });

    const enableJsApiToggle = document.querySelector('#enableJsApi');
    const jsApiSettingsContainer = document.querySelector('#jsApiSettings');
    if (enableJsApiToggle) {
      enableJsApiToggle.addEventListener('change', () => {
        SettingsUI.setToggleControlledVisibility(enableJsApiToggle, [
          { element: jsApiSettingsContainer, onDisplay: 'flex' }
        ]);
      });
      SettingsUI.setToggleControlledVisibility(enableJsApiToggle, [
        { element: jsApiSettingsContainer, onDisplay: 'flex' }
      ]);
    }

    const cacheUnitSelect = document.querySelector('#cacheUnit');
    if (cacheUnitSelect) {
      cacheUnitSelect.addEventListener('change', () => SettingsUI.updateCacheDurationHint());
    }

    const historyAutoDeleteToggle = document.querySelector('#historyAutoDelete');
    if (historyAutoDeleteToggle) {
      historyAutoDeleteToggle.addEventListener('change', () => SettingsUI.syncHistoryAutoDeleteRow());
    }

    const openHistoryStatsBtn = document.querySelector('#openHistoryStatsBtn');
    if (openHistoryStatsBtn) {
      openHistoryStatsBtn.addEventListener('click', () => SettingsUI.openHistoryStats());
    }

    const preventDuplicatesToggle = document.querySelector('#preventDuplicates');
    const duplicateSettingsContainer = document.querySelector('#duplicateSettingsContainer');
    if (preventDuplicatesToggle) {
      preventDuplicatesToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        if (duplicateSettingsContainer) {
          duplicateSettingsContainer.style.display = isEnabled ? 'flex' : 'none';
        }
      });
      const isEnabled = preventDuplicatesToggle.checked;
      if (duplicateSettingsContainer) {
        duplicateSettingsContainer.style.display = isEnabled ? 'flex' : 'none';
      }
    }

    // ========== UPDATE SETTINGS ==========
    const autoUpdateToggle = document.querySelector('#autoUpdate');
    const updateIntervalGroup = document.querySelector('#updateIntervalGroup');
    if (autoUpdateToggle) {
      autoUpdateToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        if (!this.settings.updates) this.settings.updates = {};
        this.settings.updates.autoUpdate = isEnabled;
        if (updateIntervalGroup) {
          updateIntervalGroup.style.display = isEnabled ? 'flex' : 'none';
        }
        this.saveSettings();
      });
    }

    const checkIntervalSelect = document.querySelector('#checkIntervalHours');
    if (checkIntervalSelect) {
      checkIntervalSelect.addEventListener('change', (e) => {
        if (!this.settings.updates) this.settings.updates = {};
        this.settings.updates.checkIntervalHours = parseInt(e.target.value, 10);
        this.saveSettings();
      });
    }

    const checkUpdatesNowBtn = document.querySelector('#checkUpdatesNowBtn');
    if (checkUpdatesNowBtn) {
      checkUpdatesNowBtn.addEventListener('click', () => this.handleCheckUpdatesNow());
    }

    if (typeof SettingsUI._setupDataListeners === 'function') {
      SettingsUI._setupDataListeners.call(this);
    }
    if (typeof SettingsUI._setupLogListeners === 'function') {
      SettingsUI._setupLogListeners.call(this);
    }
    if (typeof SettingsUI._setupWebhookListeners === 'function') {
      SettingsUI._setupWebhookListeners.call(this);
    }

    this.setupColorPagination();
    if (typeof SettingsUI._setupColorListeners === 'function') {
      SettingsUI._setupColorListeners();
    }
};

// ========== CACHE DURATION UNITS ==========
// Ranges and conversions live in FormatUtils so the detection engine reads the
// stored value exactly as this UI shows it.
SettingsUI.getCacheDurationDisplay = function(detection = {}) {
    return FormatUtils.normalizeCacheDuration(detection.cacheDuration ?? 12, detection.cacheUnit || 'hours');
};

SettingsUI.updateCacheDurationHint = function() {
    const unitSelect = document.querySelector('#cacheUnit');
    const hint = document.querySelector('#cacheDurationRangeHint');
    const input = document.querySelector('#cacheDuration');
    if (!unitSelect || !hint) return;

    const unit = unitSelect.value;
    const max = FormatUtils.CACHE_UNIT_MAX[unit] || 24;
    const unitLabel = unitSelect.options[unitSelect.selectedIndex]?.textContent?.trim() || unit;
    if (input) input.max = String(max);

    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const isLargestUnit = unit === 'years';
    const key = isLargestUnit ? 'settingsCacheDurationRangeMaxFmt' : 'settingsCacheDurationRangeFmt';
    const fallback = isLargestUnit
      ? `Allowed range: 1–${max} ${unitLabel}.`
      : `Allowed range: 1–${max} ${unitLabel}. Choose a larger unit for longer periods.`;
    hint.textContent = (t && t.format(key, max, unitLabel)) || fallback;
};

// ========== HISTORY AUTO-DELETE ==========
SettingsUI.syncHistoryAutoDeleteRow = function() {
    const toggle = document.querySelector('#historyAutoDelete');
    const row = document.querySelector('#historyAutoDeleteDaysRow');
    const input = document.querySelector('#historyAutoDeleteDays');
    const enabled = !!(toggle && toggle.checked);
    if (row) row.classList.toggle('is-disabled', !enabled);
    if (input) input.disabled = !enabled;
};

// ========== HISTORY STATISTICS ==========
SettingsUI.openHistoryStats = function() {
    const url = chrome.runtime.getURL('sections/stats/stats.html');
    try {
      chrome.tabs.create({ url });
    } catch (error) {
      Logger.error('UI', 'Failed to open history statistics:', error);
      window.open(url, '_blank', 'noopener');
    }
};

/**
 * Fill Settings → Detection → Category order with every order of the three
 * categories ("Anti-bot → Captcha → Fingerprint", …) and select the saved one.
 * @param {Array<string>} savedOrder
 */
SettingsUI.populateCategoryOrder = function(savedOrder) {
  const select = document.querySelector('#categoryOrder');
  if (!select) return;
  const _t = (typeof I18n !== 'undefined') ? I18n : null;
  const label = {
    antibot: (_t && _t.get('categoryAntibot')) || 'Anti-bot',
    captcha: (_t && _t.get('categoryCaptcha')) || 'Captcha',
    fingerprint: (_t && _t.get('categoryFingerprint')) || 'Fingerprint'
  };
  const permutations = (list) => (list.length <= 1 ? [list]
    : list.flatMap((first, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map(rest => [first, ...rest])));

  select.replaceChildren(...permutations(DetectionUtils.DEFAULT_CATEGORY_ORDER).map(order => {
    const option = document.createElement('option');
    option.value = order.join(',');
    option.textContent = order.map(category => label[category]).join(' → ');
    return option;
  }));
  select.value = DetectionUtils.normalizeCategoryOrder(savedOrder).join(',');
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
