/**
 * Settings UI/modal methods for popup context.
 * Dependencies: `Settings` class compatibility wrappers call this registry.
 */
const SettingsUI = (typeof self !== 'undefined' && self.SettingsUI) ? self.SettingsUI : {};

// Card heads that are a title (not a switch): the card folds under them
SettingsUI.CARD_HEAD_SELECTOR = ':scope > .settings-card-head, :scope > .settings-row--head, :scope > .settings-stats-head, :scope > .data-card-head';

/**
 * Cards topped by a title start folded, showing only that title; clicking it
 * (or Enter / Space) opens the card. Cards topped by a switch are left as
 * they are: the switch already shows or hides what is under it.
 */
SettingsUI.setupCollapsibleCards = function(root) {
    if (!root) return;
    const chevron = '<svg class="settings-card-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    root.querySelectorAll('.settings-card').forEach((card) => {
      if (card.classList.contains('is-collapsible')) return;
      const head = card.querySelector(SettingsUI.CARD_HEAD_SELECTOR);
      if (!head || head.querySelector('input, select, textarea, button')) return;
      card.classList.add('is-collapsible', 'is-collapsed');
      head.setAttribute('role', 'button');
      head.tabIndex = 0;
      head.setAttribute('aria-expanded', 'false');
      head.insertAdjacentHTML('beforeend', chevron);
      const toggle = () => {
        const open = card.classList.toggle('is-collapsed') === false;
        head.setAttribute('aria-expanded', String(open));
      };
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
      });
    });
};

/** Every folding card closed again (each time Settings opens) */
SettingsUI.collapseCards = function(root) {
    if (!root) return;
    SettingsUI.setupCollapsibleCards(root);
    root.querySelectorAll('.settings-card.is-collapsible').forEach((card) => {
      card.classList.add('is-collapsed');
      card.querySelector(SettingsUI.CARD_HEAD_SELECTOR)?.setAttribute('aria-expanded', 'false');
    });
};

SettingsUI.showSettings = function() {
    const settingsModal = document.querySelector('#settingsModal');
    if (settingsModal) {
      SettingsUI.collapseCards(settingsModal);
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
    if (this.settingsBaseline) this.settings = JSON.parse(JSON.stringify(this.settingsBaseline));
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
    // The storage meter and last backup are read when the tab is opened
    if (tabName === 'history') SettingsUI.refreshHistoryStorage.call(this);
    if (tabName === 'history') SettingsUI.refreshHistoryWatch.call(this);
    if (tabName === 'data') SettingsUI.refreshStorageOverview();
};

SettingsUI.loadSettings = async function() {
    try {
      // Read both before changing the draft or the language picker.
      const settings = await StorageManager.readSettingsStrict();
      const language = await chrome.storage.local.get(['scrapfly_language_override']);
      const loaded = this.deepMerge(this.defaultSettings || {}, settings);
      const detection = loaded.detection || (loaded.detection = {});
      for (const key of ['cacheDuration', 'cacheUnit', 'cacheScope', 'blacklistedDomains', 'hooksConfig']) {
        if (settings[key] !== undefined && settings.detection?.[key] === undefined) detection[key] = settings[key];
      }
      if (settings.cacheHours !== undefined && settings.detection?.cacheDuration === undefined && settings.cacheDuration === undefined) {
        detection.cacheDuration = settings.cacheHours;
        detection.cacheUnit = 'hours';
      }
      for (const key of ['hooksConfig', 'reliabilityConfig', 'cacheDuration', 'cacheUnit', 'cacheScope', 'cacheHours', 'blacklistedDomains']) delete loaded[key];
      this.settings = loaded;
      this.settingsBaseline = JSON.parse(JSON.stringify(loaded));
      if (typeof Utils !== 'undefined' && typeof Utils.applyDebugMode === 'function') Utils.applyDebugMode(loaded);
      const themeChoice = document.querySelector('#themeChoice');
      if (themeChoice && typeof ScrapflyTheme !== 'undefined') themeChoice.value = ScrapflyTheme.get();
      if (typeof SettingsUI.setLanguagePickerValue === 'function') SettingsUI.setLanguagePickerValue(language.scrapfly_language_override || 'auto');
      this.updateSettingsUI();
      return true;
    } catch (error) {
      Logger.error('UI', 'Failed to load settings');
      NotificationHelper.error(((typeof I18n !== 'undefined') && I18n.get('settingsReadFailedToast')) || 'Could not load settings. Your current values have been kept.');
      return false;
    }
};

SettingsUI.deepMerge = function(target, source) {
    const result = JSON.parse(JSON.stringify(target || {}));

    const typeOf = (v) => {
      if (Array.isArray(v)) return 'array';
      if (v === null) return 'null';
      return typeof v;
    };

    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key) || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      const srcVal = source[key];
      const tgtVal = result[key];

      // New key (not in defaults) — allow as-is; can't validate without schema.
      if (tgtVal === undefined) {
        result[key] = srcVal === undefined ? undefined : JSON.parse(JSON.stringify(srcVal));
        continue;
      }

      // Drop stored values whose type doesn't match defaults — protects against
      // a corrupted/malicious storage entry poisoning the merged settings shape.
      if (typeOf(srcVal) !== typeOf(tgtVal)) continue;

      if (typeOf(srcVal) === 'object') {
        result[key] = this.deepMerge(tgtVal, srcVal);
      } else {
        result[key] = srcVal === undefined ? undefined : JSON.parse(JSON.stringify(srcVal));
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
      if (!this.settingsBaseline) throw new Error('Load settings before saving');
      const committed = options.reset
        ? await StorageManager.resetSettings(options.reset.defaults, options.reset.keep)
        : await StorageManager.commitSettings({
          baseline: this.settingsBaseline,
          candidate: options.candidate || this.settings,
          languageOverride: options.languageOverride
        });
      // Do not advance the form/baseline until persistence succeeds.
      this.settings = committed.settings;
      this.settingsBaseline = JSON.parse(JSON.stringify(committed.settings));
      if (typeof Utils !== 'undefined' && typeof Utils.applyDebugMode === 'function') Utils.applyDebugMode(this.settings);
      Logger.debug('UI', 'Settings saved', SettingsTransfer.diagnostics(this.settings));
      const oldScope = committed.previous.detection?.cacheScope || committed.previous.cacheScope || 'domain';
      const newScope = this.settings.detection?.cacheScope || 'domain';
      const notifyWorker = type => {
        try { chrome.runtime.sendMessage({ type }).catch(() => {}); } catch (_) { /* Save already succeeded. */ }
      };
      if (oldScope !== newScope) {
        UrlUtils.clearUrlHashCache();
        notifyWorker(WorkerMessages.CACHE_SCOPE_CHANGED);
        notifyWorker(WorkerMessages.DETECTION_CLEAR_CACHE);
      }
      notifyWorker(WorkerMessages.SETTINGS_UPDATED);
      notifyWorker(WorkerMessages.SYNC_CATEGORY_COLORS);
      if (options.notify !== false) NotificationHelper.success(((typeof I18n !== 'undefined') && I18n.get('settingsSavedToast')) || 'Settings saved');
      return true;
    } catch (error) {
      Logger.error('UI', 'Failed to save settings');
      if (options.notifyError !== false) NotificationHelper.error(((typeof I18n !== 'undefined') && I18n.get('settingsWriteFailedToast')) || 'Could not save settings. Your changes have been kept; try again.');
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

    // Badge, category and tag colours, each starting from the shared default
    for (const { group, inputs, defaults } of SettingsUI.colorGroups()) {
      const saved = this.settings[group];
      if (!saved) continue;
      for (const [key, selector] of Object.entries(inputs)) {
        const input = document.querySelector(selector);
        if (input) input.value = saved[key] || defaults[key];
      }
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

      SettingsUI.populateCategoryOrder(this.settings.detection, this.settings.categoryColors);

      const minToolConfidence = document.querySelector('#advancedToolsMinConfidence');
      if (minToolConfidence) {
        minToolConfidence.value = this.settings.detection.advancedToolsMinConfidence ?? 50;
      }

      const hooksOffBox = document.querySelector('#hooksOffDomains');
      if (hooksOffBox) {
        hooksOffBox.value = (Array.isArray(this.settings.detection.hooksOffDomains) ? this.settings.detection.hooksOffDomains : []).join('\n');
      }

      const retentionDuration = document.querySelector('#captureRetentionDuration');
      const retentionUnit = document.querySelector('#captureRetentionUnit');
      if (retentionDuration && retentionUnit) {
        const mins = CaptureRetention.minutesOf(this.settings.detection.captureRetentionMinutes);
        let duration = mins, unit = 'minutes';
        if (mins % 1440 === 0) { duration = mins / 1440; unit = 'days'; }
        else if (mins % 60 === 0) { duration = mins / 60; unit = 'hours'; }
        retentionUnit.value = unit;
        retentionDuration.max = String(CaptureRetention.MAX_MINUTES / SettingsUI.retentionUnitMinutes(unit));
        retentionDuration.value = String(duration);
      }

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

      SettingsUI.syncScanModeUI.call(this);
      this.renderBlacklistUI();
      this.setupBlacklistEventListeners();
    }

    // JS API Settings
    const enableJsApi = document.querySelector('#enableJsApi');
    const jsApiSettingsContainer = document.querySelector('#jsApiSettings');
    const jsApiEnabled = this.settings.jsApi?.enableJsApi ?? false;
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

    SettingsUI.populateWebhookFilter.call(this, webhookSettings);
    SettingsUI.refreshWebhookLog.call(this);

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
    SettingsUI.populateWebhookSecret.call(this, webhookSettings);

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

      // What History saves, when it clears, alerts and backups
      const h = this.settings.history;
      const check = (id, value) => { const el = document.querySelector(`#${id}`); if (el) el.checked = value; };
      const choose = (id, value) => { const el = document.querySelector(`#${id}`); if (el) el.value = value; };
      check('historyEnabled', h.historyEnabled !== false);
      check('historySkipIncognito', h.historySkipIncognito !== false);
      check('historySkipFingerprintOnly', h.historySkipFingerprintOnly === true);
      check('historyClearOnClose', h.historyClearOnClose === true);
      choose('historyMinConfidence', h.historyMinConfidence ?? 0);
      choose('historyFingerprintDays', h.historyFingerprintDays ?? 0);
      choose('historyWatch', HistoryPolicy.watchModeOf(h));
      SettingsUI.populateHistorySize.call(this, h.historyMaxMB);
      check('historyAutoPinHard', h.historyAutoPinHard === true);
      choose('historyAutoPinVendors', (Array.isArray(h.historyAutoPinVendors) ? h.historyAutoPinVendors : []).join('\n'));
      choose('historyAutoPinMinConfidence', h.historyAutoPinMinConfidence ?? HistoryPolicy.AUTO_PIN_MIN_CONFIDENCE);
      const pinNote = document.querySelector('#historyAutoPinNote');
      if (pinNote) {
        pinNote.setAttribute('data-i18n-args', String(HistoryPolicy.MAX_AUTO_PINS));
        pinNote.textContent = FormatUtils.t('settingsHistoryAutoPinNote', 'Up to {0} pages are pinned this way. Unpin one and it is never pinned again by itself.', HistoryPolicy.MAX_AUTO_PINS);
      }
      choose('historyChangeAlerts', ['pinned', 'all'].includes(h.historyChangeAlerts) ? h.historyChangeAlerts : 'off');
      choose('historyBackup', ['daily', 'weekly', 'monthly'].includes(h.historyBackup) ? h.historyBackup : 'off');
      choose('historyExcludedDomains', (Array.isArray(h.historyExcludedDomains) ? h.historyExcludedDomains : []).join('\n'));
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

      const duplicateAction = document.querySelector('#duplicateAction');
      if (duplicateAction) duplicateAction.value = this.settings.duplicatePrevention.duplicateAction === 'update' ? 'update' : 'skip';

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
      checkIntervalSelect.value = this.settings.updates?.checkIntervalHours ?? Constants.DEFAULT_UPDATE_CHECK_INTERVAL_HOURS;
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

    if (typeof SettingsUI.populateShareUI === 'function') {
      SettingsUI.populateShareUI.call(this);
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

    // Badge, category and tag colours
    for (const { group, inputs, defaults } of SettingsUI.colorGroups()) {
      settings[group] = Object.fromEntries(Object.entries(inputs).map(([key, selector]) =>
        [key, document.querySelector(selector)?.value ?? this.settings[group]?.[key] ?? defaults[key]]));
    }

    // ========== DETECTION TAB ==========
    settings.detection = {
      cacheDuration: parseInt(document.querySelector('#cacheDuration')?.value ?? this.settings.detection?.cacheDuration ?? FormatUtils.DEFAULT_CACHE.duration),
      cacheUnit: document.querySelector('#cacheUnit')?.value ?? this.settings.detection?.cacheUnit ?? FormatUtils.DEFAULT_CACHE.unit,
      cacheScope: document.querySelector('#cacheScope')?.value ?? this.settings.detection?.cacheScope ?? 'domain',
      // "Show first": a category order, or the highest confidence (the
      // category order is kept for ties and for switching back)
      ...SettingsUI.readDetectionSort(document.querySelector('#categoryOrder')?.value,
        document.querySelector('#sortByConfidence')?.checked, this.settings.detection),
      advancedToolsMinConfidence: parseInt(document.querySelector('#advancedToolsMinConfidence')?.value
        ?? this.settings.detection?.advancedToolsMinConfidence ?? 50),
      captureRetentionMinutes: SettingsUI.readCaptureRetentionMinutes(this.settings.detection?.captureRetentionMinutes),
      // Which sites are scanned: the mode is staged in the form, the two lists are managed by the list UI
      scanMode: document.querySelector('#scanMode')?.value ?? this.settings.detection?.scanMode ?? 'blocklist',
      blacklistedDomains: this.settings.detection?.blacklistedDomains || [],
      allowedDomains: this.settings.detection?.allowedDomains || [],
      hooksOffDomains: SettingsUI.readSiteList('#hooksOffDomains', this.settings.detection?.hooksOffDomains),
      hooksConfig: this.settings.detection?.hooksConfig || {}
    };

    // JS API Settings
    const jsApiEnabled = document.querySelector('#enableJsApi')?.checked ?? this.settings.jsApi?.enableJsApi ?? false;
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
      webhookHeaders: this.settings.webhook?.webhookHeaders || [],
      webhookSecret: SettingsUI.readWebhookSecret.call(this),
      ...SettingsUI.readWebhookFilter.call(this)
    };

    // Share uploads (Detection → Upload detections)
    if (typeof SettingsUI.readShareFromUI === 'function') {
      settings.share = SettingsUI.readShareFromUI.call(this);
    }

    // ========== HISTORY TAB ==========
    settings.history = {
      historyLimit: parseInt(document.querySelector('#historyLimit')?.value ?? this.settings.history?.historyLimit ?? 0),
      historyAutoDelete: document.querySelector('#historyAutoDelete')?.checked ?? this.settings.history?.historyAutoDelete ?? false,
      historyAutoDeleteDays: parseInt(document.querySelector('#historyAutoDeleteDays')?.value ?? this.settings.history?.historyAutoDeleteDays ?? 30),
      exportFormat: document.querySelector('#exportFormat')?.value ?? this.settings.history?.exportFormat ?? 'json',
      includeTimestamps: document.querySelector('#includeTimestamps')?.checked ?? this.settings.history?.includeTimestamps ?? true,
      historyBypassCache: document.querySelector('#historyBypassCache')?.checked ?? this.settings.history?.historyBypassCache ?? false,
      historyEnabled: document.querySelector('#historyEnabled')?.checked ?? this.settings.history?.historyEnabled ?? true,
      historySkipIncognito: document.querySelector('#historySkipIncognito')?.checked ?? this.settings.history?.historySkipIncognito ?? true,
      historyMinConfidence: parseInt(document.querySelector('#historyMinConfidence')?.value ?? this.settings.history?.historyMinConfidence ?? 0, 10),
      historyFingerprintDays: parseInt(document.querySelector('#historyFingerprintDays')?.value ?? this.settings.history?.historyFingerprintDays ?? 0, 10),
      historyWatch: document.querySelector('#historyWatch')?.value ?? this.settings.history?.historyWatch ?? 'off',
      historyMaxMB: parseInt(document.querySelector('#historyMaxMB')?.value ?? this.settings.history?.historyMaxMB ?? HistoryStore.SIZES_MB[0], 10),
      historyAutoPinHard: document.querySelector('#historyAutoPinHard')?.checked ?? this.settings.history?.historyAutoPinHard ?? false,
      historyAutoPinVendors: SettingsUI.readNameList('#historyAutoPinVendors', this.settings.history?.historyAutoPinVendors),
      historyAutoPinMinConfidence: parseInt(document.querySelector('#historyAutoPinMinConfidence')?.value ?? this.settings.history?.historyAutoPinMinConfidence ?? HistoryPolicy.AUTO_PIN_MIN_CONFIDENCE, 10),
      historySkipFingerprintOnly: document.querySelector('#historySkipFingerprintOnly')?.checked ?? this.settings.history?.historySkipFingerprintOnly ?? false,
      historyExcludedDomains: SettingsUI.readSiteList('#historyExcludedDomains', this.settings.history?.historyExcludedDomains),
      historyChangeAlerts: document.querySelector('#historyChangeAlerts')?.value ?? this.settings.history?.historyChangeAlerts ?? 'off',
      historyBackup: document.querySelector('#historyBackup')?.value ?? this.settings.history?.historyBackup ?? 'off',
      historyClearOnClose: document.querySelector('#historyClearOnClose')?.checked ?? this.settings.history?.historyClearOnClose ?? false
    };

    // Duplicate Prevention Settings
    settings.duplicatePrevention = {
      preventDuplicates: document.querySelector('#preventDuplicates')?.checked ?? this.settings.duplicatePrevention?.preventDuplicates ?? false,
      duplicateScope: document.querySelector('#duplicateScope')?.value ?? this.settings.duplicatePrevention?.duplicateScope ?? 'full_url',
      duplicateDuration: parseInt(document.querySelector('#duplicateDuration')?.value ?? this.settings.duplicatePrevention?.duplicateDuration ?? 1),
      duplicateUnit: document.querySelector('#duplicateUnit')?.value ?? this.settings.duplicatePrevention?.duplicateUnit ?? 'hours',
      duplicateAction: document.querySelector('#duplicateAction')?.value ?? this.settings.duplicatePrevention?.duplicateAction ?? 'skip'
    };

    // Update Settings
    settings.updates = {
      autoUpdate: document.querySelector('#autoUpdate')?.checked ?? this.settings.updates?.autoUpdate ?? false,
      checkIntervalHours: parseInt(document.querySelector('#checkIntervalHours')?.value ?? this.settings.updates?.checkIntervalHours ?? Constants.DEFAULT_UPDATE_CHECK_INTERVAL_HOURS),
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

    if (settings.history && settings.history.historyMinConfidence !== undefined) {
      const confidence = settings.history.historyMinConfidence;
      if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
        errors.push(text('settingsUiErrMinConfidence', 'Minimum confidence must be between 0 and 100'));
      }
    }

    if (settings.history && settings.history.historyAutoPinMinConfidence !== undefined) {
      const confidence = settings.history.historyAutoPinMinConfidence;
      if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
        errors.push(text('settingsUiErrAutoPinConfidence', 'Pin confidence must be between 0 and 100'));
      }
    }

    if (settings.history && settings.history.historyMaxMB !== undefined && !HistoryStore.SIZES_MB.includes(settings.history.historyMaxMB)) {
      errors.push(text('settingsUiErrHistorySizeFmt', 'History size must be one of {0} MB', HistoryStore.SIZES_MB.join(', ')));
    }

    if (settings.history && settings.history.historyWatch !== undefined && !HistoryPolicy.WATCH_MODES.includes(settings.history.historyWatch)) {
      errors.push(text('settingsUiErrHistoryWatch', 'The watchlist must be off, daily or weekly'));
    }

    if (settings.history && settings.history.historyFingerprintDays !== undefined) {
      const days = settings.history.historyFingerprintDays;
      if (!Number.isInteger(days) || days < 0 || days > 3650) {
        errors.push(text('settingsUiErrFingerprintDays', 'Fingerprinting-only pages must be kept between 0 and 3650 days'));
      }
    }

    if (settings.history && settings.history.historyAutoDeleteDays !== undefined) {
      const days = settings.history.historyAutoDeleteDays;
      if (!Number.isFinite(days) || days < 1 || days > 3650) {
        errors.push(text('settingsUiErrAutoDeleteDays', 'Auto-delete days must be between 1 and 3650'));
      }
    }

    if (settings.detection && settings.detection.advancedToolsMinConfidence !== undefined) {
      const value = settings.detection.advancedToolsMinConfidence;
      if (!Number.isInteger(value) || value < 0 || value > 99) {
        errors.push(text('settingsUiErrAdvancedToolsMinConfidence', 'Advanced tools confidence must be between 0 and 99'));
      }
    }

    if (typeof SettingsUI.validateShareSettings === 'function') {
      errors.push(...SettingsUI.validateShareSettings(settings.share, text));
    }

    // A signing secret no server could check (accents, emoji, invisible characters, over 512): the message never repeats it
    if (settings.webhook && settings.webhook.webhookSecret !== undefined && typeof WebhookBody !== 'undefined'
      && !WebhookBody.isValidSecret(settings.webhook.webhookSecret)) {
      errors.push(text('webhookSecretInvalid', 'Signing secret: use up to 512 ASCII characters (no accents or emoji)'));
    }

    if (settings.detection && settings.detection.scanMode !== undefined && !ScanScope.MODES.includes(settings.detection.scanMode)) {
      errors.push(text('settingsUiErrScanMode', 'Sites to scan must be every site except the skipped ones, or only the chosen sites'));
    }
    for (const key of ScanScope.SITE_LIST_KEYS) {
      const list = settings.detection && settings.detection[key];
      if (list !== undefined && !(Array.isArray(list) && list.every(site => typeof site === 'string'))) {
        errors.push(text('settingsUiErrSiteList', 'A list of sites must hold site names only'));
        break;
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
    // Debug Mode → Open console: this extension's card in chrome://extensions,
    // where "service worker" opens the console the logs go to
    document.addEventListener('click', (event) => {
      if (!event.target.closest || !event.target.closest('#openDebugConsoleBtn')) return;
      const url = `chrome://extensions/?id=${chrome.runtime.id}`;
      chrome.tabs.create({ url }).catch(() => {
        if (typeof NotificationHelper !== 'undefined') NotificationHelper.info(url);
      });
    });
    // Theme applies at once, like the language (its own key, not the Save button)
    document.addEventListener('change', (event) => {
      if (event.target && event.target.id === 'themeChoice' && typeof ScrapflyTheme !== 'undefined') {
        ScrapflyTheme.set(event.target.value);
      }
      // Capture retention: the number's range follows the unit (1 min … 7 days overall)
      if (event.target && (event.target.id === 'captureRetentionUnit' || event.target.id === 'captureRetentionDuration')) {
        const dur = document.querySelector('#captureRetentionDuration');
        const unit = document.querySelector('#captureRetentionUnit');
        if (dur && unit) {
          const max = CaptureRetention.MAX_MINUTES / SettingsUI.retentionUnitMinutes(unit.value);
          dur.max = String(max);
          const v = parseInt(dur.value, 10);
          if (!Number.isFinite(v) || v < 1) dur.value = '1';
          else if (v > max) dur.value = String(max);
        }
      }
    });
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

    // Which sites are scanned: staged like any other setting, saved with the form
    const scanModeSelect = document.querySelector('#scanMode');
    if (scanModeSelect && !scanModeSelect.dataset.scopeBound) {
      scanModeSelect.dataset.scopeBound = '1';
      scanModeSelect.addEventListener('change', () => {
        if (!this.settings.detection) this.settings.detection = {};
        this.settings.detection.scanMode = ScanScope.MODES.includes(scanModeSelect.value) ? scanModeSelect.value : 'blocklist';
        this.blacklistPage = 1;
        this.blacklistSearch = '';
        const search = document.querySelector('#blacklistSearchInput');
        if (search) search.value = '';
        SettingsUI.syncScanModeUI.call(this);
        this.renderBlacklistUI();
        NotificationHelper.info(FormatUtils.t('settingsDraftPendingToast', 'Change staged. Save settings to apply it.'));
      });
    }

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
            this.settings.detection = { blacklistedDomains: [], allowedDomains: [] };
          }
          // The skipped sites, or the chosen sites: whichever list is on screen
          const listKey = SettingsUI.scanListKey.call(this);
          if (!Array.isArray(this.settings.detection[listKey])) {
            this.settings.detection[listKey] = [];
          }

          if (this.settings.detection[listKey].includes(domain)) {
            NotificationHelper.info(listKey === 'allowedDomains'
              ? _fmt2('domainAlreadyAllowedFmt', `${domain} is already on the list`, domain)
              : _fmt2('domainAlreadyBlacklistedFmt', `${domain} is already blacklisted`, domain));
            return;
          }

          this.settings.detection[listKey].push(domain);
          this.renderBlacklistUI();
          NotificationHelper.info(_tr2('settingsDraftPendingToast', 'Change staged. Save settings to apply it.'));
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

    const historyMaxMB = document.querySelector('#historyMaxMB');
    if (historyMaxMB) historyMaxMB.addEventListener('change', () => SettingsUI.chooseHistorySize.call(this));

    const historyWatchNowBtn = document.querySelector('#historyWatchNowBtn');
    if (historyWatchNowBtn) historyWatchNowBtn.addEventListener('click', () => SettingsUI.checkWatchNow.call(this, historyWatchNowBtn));

    const historyBackupNowBtn = document.querySelector('#historyBackupNowBtn');
    if (historyBackupNowBtn) {
      historyBackupNowBtn.addEventListener('click', () => SettingsUI.backUpHistoryNow.call(this, historyBackupNowBtn));
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
      });
    }

    const checkIntervalSelect = document.querySelector('#checkIntervalHours');
    if (checkIntervalSelect) {
      checkIntervalSelect.addEventListener('change', (e) => {
        if (!this.settings.updates) this.settings.updates = {};
        this.settings.updates.checkIntervalHours = parseInt(e.target.value, 10);
      });
    }

    const checkUpdatesNowBtn = document.querySelector('#checkUpdatesNowBtn');
    if (checkUpdatesNowBtn) {
      checkUpdatesNowBtn.addEventListener('click', () => this.handleCheckUpdatesNow());
    }

    if (typeof SettingsUI._setupDataListeners === 'function') {
      SettingsUI._setupDataListeners.call(this);
    }
    if (typeof SettingsUI._setupStorageListeners === 'function') {
      SettingsUI._setupStorageListeners.call(this);
    }
    if (typeof SettingsUI._setupDiagnosticsListeners === 'function') {
      SettingsUI._setupDiagnosticsListeners.call(this);
    }
    if (typeof SettingsUI._setupPresetListeners === 'function') {
      SettingsUI._setupPresetListeners.call(this);
    }
    if (typeof SettingsUI._setupBackupListeners === 'function') {
      SettingsUI._setupBackupListeners.call(this);
    }
    if (typeof SettingsUI._setupLogListeners === 'function') {
      SettingsUI._setupLogListeners.call(this);
    }
    if (typeof SettingsUI._setupWebhookListeners === 'function') {
      SettingsUI._setupWebhookListeners.call(this);
    }
    if (typeof SettingsUI._setupWebhookLogListeners === 'function') {
      SettingsUI._setupWebhookLogListeners.call(this);
    }
    if (typeof SettingsUI._setupShareListeners === 'function') {
      SettingsUI._setupShareListeners.call(this);
    }
    if (typeof SettingsUI._setupShortcutListeners === 'function') {
      SettingsUI._setupShortcutListeners.call(this);
    }

    this.setupColorPagination();
    if (typeof SettingsUI._setupColorListeners === 'function') {
      SettingsUI._setupColorListeners();
    }
};

// ========== CACHE DURATION UNITS ==========
// Ranges and conversions live in FormatUtils so the detection engine reads the
// stored value exactly as this UI shows it.
/** Settings → Badge, Category and Tag colors: the colour input of each saved key, and the shared default it starts from. */
SettingsUI.colorGroups = function() {
  return [
    { group: 'badgeColors', defaults: { low: BADGE.COLORS.LOW, medium: BADGE.COLORS.MEDIUM, high: BADGE.COLORS.HIGH },
      inputs: { low: '#colorBadgeLow', medium: '#colorBadgeMedium', high: '#colorBadgeHigh' } },
    { group: 'categoryColors', defaults: FormatUtils.DEFAULT_CATEGORY_COLORS,
      inputs: { antibot: '#colorAntibot', captcha: '#colorCaptcha', fingerprint: '#colorFingerprint' } },
    { group: 'tagColors', defaults: FormatUtils.DEFAULT_TAG_COLORS,
      inputs: { dom: '#colorTagDOM', headers: '#colorTagHeaders', cookies: '#colorTagCookies', content: '#colorTagContent',
        urls: '#colorTagURLs', js_hooks: '#colorTagJSHooks', window: '#colorTagWindow', payload: '#colorTagPayload' } }
  ];
};

SettingsUI.getCacheDurationDisplay = function(detection = {}) {
    return FormatUtils.normalizeCacheDuration(detection.cacheDuration ?? FormatUtils.DEFAULT_CACHE.duration, detection.cacheUnit || FormatUtils.DEFAULT_CACHE.unit);
};

/** The capture retention from the number + unit controls, in minutes, clamped to 1 min … 7 days. */
/** Minutes in one unit of the capture retention input (minutes, hours or days). */
SettingsUI.retentionUnitMinutes = function(unit) {
    return unit === 'days' ? 1440 : unit === 'hours' ? 60 : 1;
};

SettingsUI.readCaptureRetentionMinutes = function(fallback) {
    const base = CaptureRetention.minutesOf(fallback);
    const durEl = document.querySelector('#captureRetentionDuration');
    const unitEl = document.querySelector('#captureRetentionUnit');
    if (!durEl || !unitEl) return base;
    const duration = parseInt(durEl.value, 10);
    if (!Number.isFinite(duration) || duration < 1) return base;
    return CaptureRetention.minutesOf(duration * SettingsUI.retentionUnitMinutes(unitEl.value));
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
 * Settings → Detection order: the "Highest confidence first" switch and one
 * card per category, in the saved order. Cards move by dragging or with
 * their arrow buttons; the order is kept in #categoryOrder until Save.
 * @param {object} [detectionSettings] - settings.detection
 * @param {object} [colors] - settings.categoryColors, for the icon on each card
 */
SettingsUI.populateCategoryOrder = function(detectionSettings, colors = {}) {
  const list = document.querySelector('#categoryOrderList');
  const hidden = document.querySelector('#categoryOrder');
  const toggle = document.querySelector('#sortByConfidence');
  if (!list || !hidden) return;
  const _t = (typeof I18n !== 'undefined') ? I18n : null;
  const tr = (key, fallback) => (_t && _t.get(key)) || fallback;
  const label = {
    antibot: tr('categoryAntibot', 'Anti-bot'),
    captcha: tr('categoryCaptcha', 'Captcha'),
    fingerprint: tr('categoryFingerprint', 'Fingerprint')
  };
  const dot = {
    antibot: colors?.antibot || FormatUtils.DEFAULT_CATEGORY_COLORS.antibot,
    captcha: colors?.captcha || FormatUtils.DEFAULT_CATEGORY_COLORS.captcha,
    fingerprint: colors?.fingerprint || FormatUtils.DEFAULT_CATEGORY_COLORS.fingerprint
  };
  const sort = DetectionUtils.detectionSortOf(detectionSettings);
  if (toggle) toggle.checked = sort.sortBy === DetectionUtils.SORT_BY_CONFIDENCE;

  // Icon tile per category, tinted with its colour
  const icon = Object.fromEntries(Categories.KEYS.map(key => [key, FormatUtils.categoryIconSvg(key)]));
  const handle = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  const arrow = (d) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

  const sync = () => {
    const items = [...list.querySelectorAll('.category-order-item')];
    hidden.value = items.map(item => item.dataset.category).join(',');
    items.forEach((item, i) => {
      item.querySelector('.category-order-rank').textContent = String(i + 1);
      item.querySelector('[data-move="-1"]').disabled = i === 0;
      item.querySelector('[data-move="1"]').disabled = i === items.length - 1;
    });
  };

  list.replaceChildren(...sort.categoryOrder.map((category) => {
    const item = document.createElement('li');
    item.className = 'category-order-item';
    item.dataset.category = category;
    item.draggable = true;
    item.innerHTML = `
      <span class="category-order-handle" aria-hidden="true">${handle}</span>
      <span class="category-order-rank"></span>
      <span class="category-order-icon" aria-hidden="true">${icon[category]}</span>
      <span class="category-order-name"></span>
      <button type="button" class="category-order-move" data-move="-1">${arrow('M6 15l6-6 6 6')}</button>
      <button type="button" class="category-order-move" data-move="1">${arrow('M6 9l6 6 6-6')}</button>`;
    item.querySelector('.category-order-icon').style.color = dot[category];
    item.querySelector('.category-order-name').textContent = label[category];
    const up = item.querySelector('[data-move="-1"]');
    const down = item.querySelector('[data-move="1"]');
    up.setAttribute('aria-label', _t ? (_t.format('settingsMoveUpFmt', label[category]) || `Move ${label[category]} up`) : `Move ${label[category]} up`);
    down.setAttribute('aria-label', _t ? (_t.format('settingsMoveDownFmt', label[category]) || `Move ${label[category]} down`) : `Move ${label[category]} down`);
    up.title = up.getAttribute('aria-label');
    down.title = down.getAttribute('aria-label');
    return item;
  }));
  sync();

  // Bound once: the list element stays, its cards are replaced on every load
  if (list.dataset.orderReady) return;
  list.dataset.orderReady = '1';
  list.addEventListener('click', (event) => {
    const button = event.target.closest('.category-order-move');
    if (!button || button.disabled) return;
    const item = button.closest('.category-order-item');
    if (button.dataset.move === '-1' && item.previousElementSibling) item.parentNode.insertBefore(item, item.previousElementSibling);
    if (button.dataset.move === '1' && item.nextElementSibling) item.parentNode.insertBefore(item.nextElementSibling, item);
    sync();
    // Keep the keyboard on the card that moved
    const again = item.querySelector(`[data-move="${button.dataset.move}"]`);
    (again && !again.disabled ? again : item.querySelector('.category-order-move:not(:disabled)'))?.focus();
  });
  let dragged = null;
  list.addEventListener('dragstart', (event) => {
    dragged = event.target.closest('.category-order-item');
    if (!dragged) return;
    dragged.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', dragged.dataset.category); } catch (_) { /* some browsers need data to start */ }
  });
  list.addEventListener('dragover', (event) => {
    if (!dragged) return;
    event.preventDefault();
    const after = [...list.querySelectorAll('.category-order-item:not(.is-dragging)')]
      .find(item => event.clientY < item.getBoundingClientRect().top + item.offsetHeight / 2);
    if (after) list.insertBefore(dragged, after); else list.appendChild(dragged);
    sync();
  });
  list.addEventListener('drop', (event) => event.preventDefault());
  list.addEventListener('dragend', () => {
    if (dragged) dragged.classList.remove('is-dragging');
    dragged = null;
    sync();
  });
};

/**
 * The Detection order choice as settings.detection fields.
 * @param {string|undefined} orderValue - #categoryOrder ("antibot,captcha,fingerprint"); undefined keeps the saved order
 * @param {boolean|undefined} byConfidence - the switch; undefined keeps the saved choice
 * @param {object} [previous] - the saved settings.detection
 * @returns {{sortBy: string, categoryOrder: string[]}}
 */
SettingsUI.readDetectionSort = function(orderValue, byConfidence, previous) {
  const saved = DetectionUtils.detectionSortOf(previous);
  const categoryOrder = orderValue ? DetectionUtils.normalizeCategoryOrder(orderValue) : saved.categoryOrder;
  const sortBy = typeof byConfidence === 'boolean'
    ? (byConfidence ? DetectionUtils.SORT_BY_CONFIDENCE : 'category')
    : saved.sortBy;
  return { sortBy, categoryOrder };
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}

/** A box with one site per line as a clean list of hosts (what is already saved when the box is not on the page). */
SettingsUI.readSiteList = function(selector, fallback) {
  const box = document.querySelector(selector);
  if (!box) return Array.isArray(fallback) ? fallback : [];
  return DomainList.normalize(box.value);
};

/** How much History may take now: the saved size (6 MB if the extension has no unlimited storage). */
SettingsUI.historyBudget = function() {
  const saved = this && this.settings && this.settings.history && this.settings.history.historyMaxMB;
  return HistoryStore.budgetFor(saved, HistoryStore.hasUnlimitedStorage());
};

/** The History size box: one choice per size, the saved one selected. Choosing a size is handled by chooseHistorySize. */
SettingsUI.populateHistorySize = function(saved) {
  const select = document.querySelector('#historyMaxMB');
  if (!select) return;
  select.replaceChildren(...HistoryStore.SIZES_MB.map((mb) => {
    const option = document.createElement('option');
    option.value = String(mb);
    option.textContent = `${mb} MB`;
    return option;
  }));
  const mb = HistoryStore.SIZES_MB.includes(Number(saved)) ? Number(saved) : HistoryStore.SIZES_MB[0];
  select.value = String(mb);
  select.dataset.applied = String(mb);
};

/**
 * A size was chosen. Below what History already uses, the oldest unpinned pages go when it is saved, so that is
 * confirmed first; declined, the box goes back to the size that applied.
 */
SettingsUI.chooseHistorySize = async function() {
  const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
  const select = document.querySelector('#historyMaxMB');
  if (!select) return;
  const wanted = parseInt(select.value, 10);
  const back = () => { select.value = select.dataset.applied || String(HistoryStore.SIZES_MB[0]); };
  try {
    const limit = HistoryStore.budgetFor(wanted, HistoryStore.hasUnlimitedStorage());
    const usage = await HistoryStore.usage(chrome.storage.local, limit);
    if (usage.bytes > limit) {
      const size = (bytes) => SettingsUI.formatStorageSize(bytes);
      const confirmed = await NotificationHelper.confirm({
        title: text('settingsHistorySizeLowerTitle', 'Lower the History size'),
        message: text('settingsHistorySizeLowerMessage', 'History uses {0} and the new limit is {1}. The oldest pages that are not pinned will be removed to fit.', size(usage.bytes), size(limit)),
        type: 'warning', tone: 'danger',
        confirmText: text('settingsHistorySizeLowerConfirm', 'Lower the size'), cancelText: text('btnCancel', 'Cancel')
      });
      if (!confirmed) { back(); return; }
    }
    select.dataset.applied = String(wanted);
  } catch (error) {
    Logger.warn('UI', 'Could not change the History size', error);
    back();
  }
};

/**
 * Settings that arrive in a file (an import, a backup) may lower the History size below what History uses, or its
 * entry limit below the pages it holds, and the worker then removes the oldest unpinned pages at once. So the same
 * question the size box asks is asked first (and its twin for the limit); declined (or unanswerable), the candidate
 * keeps the value that applies now and everything else in the file still lands.
 */
SettingsUI.confirmHistorySizeFor = async function(candidate) {
  if (typeof HistoryStore === 'undefined' || !candidate || !candidate.history) return candidate;
  const mine = (this.settings && this.settings.history) || {};
  const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
  const ask = (options) => NotificationHelper.confirm({ type: 'warning', tone: 'danger', cancelText: text('btnCancel', 'Cancel'), ...options });
  // The size in MB
  const wanted = Number(candidate.history.historyMaxMB);
  const current = Number(mine.historyMaxMB) || HistoryStore.SIZES_MB[0];
  if (Number.isFinite(wanted) && wanted < current) {
    try {
      const limit = HistoryStore.budgetFor(wanted, HistoryStore.hasUnlimitedStorage());
      const usage = await HistoryStore.usage(chrome.storage.local, limit);
      if (usage.bytes > limit) {
        const size = (bytes) => SettingsUI.formatStorageSize(bytes);
        const confirmed = await ask({
          title: text('settingsHistorySizeLowerTitle', 'Lower the History size'),
          message: text('settingsHistorySizeLowerMessage', 'History uses {0} and the new limit is {1}. The oldest pages that are not pinned will be removed to fit.', size(usage.bytes), size(limit)),
          confirmText: text('settingsHistorySizeLowerConfirm', 'Lower the size')
        });
        if (!confirmed) candidate.history.historyMaxMB = current;
      }
    } catch (error) {
      Logger.warn('UI', 'Could not check the History size the file asks for', error);
      candidate.history.historyMaxMB = current;
    }
  }
  // The number of entries (0 means no limit of its own: the worker then keeps 1000 unpinned pages)
  const SAFETY = 1000;
  const wantedLimit = parseInt(candidate.history.historyLimit, 10);
  const currentLimit = parseInt(mine.historyLimit, 10);
  const effectiveNow = currentLimit > 0 ? currentLimit : SAFETY;
  if (Number.isFinite(wantedLimit) && wantedLimit > 0 && wantedLimit < effectiveNow) {
    try {
      const usage = await HistoryStore.usage(chrome.storage.local);
      const unpinned = Math.max(0, (usage.entries || 0) - (usage.pinned || 0));
      if (unpinned > wantedLimit) {
        const confirmed = await ask({
          title: text('settingsHistoryLimitLowerTitle', 'Lower the History limit'),
          message: text('settingsHistoryLimitLowerMessage', 'History holds {0} pages and the new limit is {1}. The oldest pages that are not pinned will be removed to fit.', String(unpinned), String(wantedLimit)),
          confirmText: text('settingsHistoryLimitLowerConfirm', 'Lower the limit')
        });
        if (!confirmed) candidate.history.historyLimit = Number.isFinite(currentLimit) ? currentLimit : 0;
      }
    } catch (error) {
      Logger.warn('UI', 'Could not check the History limit the file asks for', error);
      candidate.history.historyLimit = Number.isFinite(currentLimit) ? currentLimit : 0;
    }
  }
  return candidate;
};

/** A box with one name per line (a protection's name) as a clean list (what is already saved when the box is not on the page). */
SettingsUI.readNameList = function(selector, fallback) {
  const box = document.querySelector(selector);
  if (!box) return Array.isArray(fallback) ? fallback : [];
  const seen = new Set();
  return box.value.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(name => name && !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase())).slice(0, 100);
};

/** Bytes as MB with one decimal ("2.1 MB"), KB below that. */
SettingsUI.formatStorageSize = function(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/** Does the background worker run the code this page was loaded with (it answers the History ping)? */
SettingsUI.workerIsCurrent = async function() {
  try {
    const pong = await chrome.runtime.sendMessage({ type: HistoryStore.Messages.PING });
    return !!pong && pong.status === 'ok';
  } catch (_) {
    return false;
  }
};

/**
 * The History storage meter and the last backup, read from storage when the History tab opens:
 * "2.1 MB of 6 MB used", an amber bar from 90% (the oldest entries go next), and what was removed so far.
 */
SettingsUI.refreshHistoryStorage = async function() {
  const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
  const meter = document.querySelector('#historyMeter');
  const label = document.querySelector('#historyMeterText');
  if (!meter || !label) return;
  try {
    const usage = await HistoryStore.usage(chrome.storage.local, SettingsUI.historyBudget.call(this));
    const ratio = usage.budget > 0 ? Math.min(usage.bytes / usage.budget, 1) : 0;
    const percent = Math.round(ratio * 100);
    meter.setAttribute('aria-valuenow', String(percent));
    meter.classList.toggle('is-warn', ratio >= 0.9 && ratio < 0.97);
    meter.classList.toggle('is-full', ratio >= 0.97);
    document.querySelector('#historyMeterFill').style.width = `${percent}%`;
    const pinned = usage.pinned ? ` · ${text('settingsHistoryStoragePinnedFmt', '{0} pinned', usage.pinned)}` : '';
    label.textContent = usage.entries
      ? `${text('settingsHistoryStorageUsedFmt', '{0} of {1} used · {2} entries', SettingsUI.formatStorageSize(usage.bytes), SettingsUI.formatStorageSize(usage.budget), usage.entries)}${pinned}`
      : text('settingsHistoryStorageEmpty', 'History is empty.');
    const note = document.querySelector('#historyMeterNote');
    const lines = [];
    // A worker that was not reloaded after an update cannot apply the new History settings: say so here
    if (!(await SettingsUI.workerIsCurrent())) lines.push(text('workerOutdatedHint', "The extension's background part is out of date. Reload the extension on the extensions page and try again."));
    if (ratio >= 0.9) lines.push(text('settingsHistoryStorageNearlyFull', 'Almost full: the oldest entries will be removed to make room. Export or pin what you want to keep.'));
    if (usage.trimmed && usage.trimmed.count) lines.push(text('settingsHistoryStorageTrimmedFmt', '{0} oldest entries were removed to stay within the limit, the last time on {1}.', usage.trimmed.total || usage.trimmed.count, FormatUtils.formatDateTime(usage.trimmed.at)));
    if (note) { note.textContent = lines.join(' '); note.hidden = lines.length === 0; }
  } catch (error) {
    label.textContent = '';
  }
  // The last backup
  const last = document.querySelector('#historyBackupLast');
  if (last) {
    try {
      const state = (await chrome.storage.local.get('scrapfly_history_backup')).scrapfly_history_backup;
      if (!state) last.textContent = text('settingsHistoryBackupNever', 'No backup yet.');
      else if (state.ok === false) last.textContent = text('settingsHistoryBackupFailed', 'History backup failed');
      else last.textContent = text('settingsHistoryBackupLastFmt', 'Last backup: {0} ({1} entries)', FormatUtils.formatDateTime(state.at), state.entries);
    } catch (_) {
      last.textContent = '';
    }
  }
};

/** The watchlist's last check and how many pages are watched, read when the History tab opens and after "Check now". */
SettingsUI.refreshHistoryWatch = async function() {
  const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
  const last = document.querySelector('#historyWatchLast');
  if (!last) return;
  try {
    const stored = await chrome.storage.local.get(['scrapfly_history_watch', 'scrapfly_history']);
    const watched = HistoryStore.parse(stored.scrapfly_history).items.filter(item => item && item.watch === true && item.pinned === true).length;
    const state = stored.scrapfly_history_watch;
    const count = text('settingsHistoryWatchCountFmt', '{0} of {1} pages watched', watched, HistoryPolicy.MAX_WATCHED);
    let outcome;
    if (!state) outcome = text('settingsHistoryWatchNever', 'No check yet.');
    else if (state.error === 'no_window') outcome = text('settingsHistoryWatchNoWindow', 'The last check found no browser window to open pages in.');
    else if (state.error === 'off') outcome = text('settingsHistoryWatchOff', 'The extension is switched off, so nothing is checked.');
    else if (state.ok === false) outcome = text('settingsHistoryWatchFailed', 'The last check failed.');
    else outcome = text('settingsHistoryWatchLastFmt', 'Last check: {0} · {1} checked, {2} changed', FormatUtils.formatDateTime(state.at), state.checked || 0, state.changed || 0);
    last.textContent = `${count} · ${outcome}`;
  } catch (_) {
    last.textContent = '';
  }
};

/** "Check now": the worker scans the watched pages in background tabs; the result is shown beside the button. */
SettingsUI.checkWatchNow = async function(button) {
  const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
  if (button) button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: HistoryStore.Messages.WATCH_NOW });
    if (result && result.status === 'unknown') {
      NotificationHelper.error(text('workerOutdatedHint', "The extension's background part is out of date. Reload the extension on the extensions page and try again."));
    } else if (result && result.error === 'no_window') {
      NotificationHelper.error(text('settingsHistoryWatchNoWindow', 'The last check found no browser window to open pages in.'));
    } else if (result && result.error === 'paused') {
      NotificationHelper.error(text('settingsHistoryWatchPaused', 'History is paused, so nothing is checked.'));
    } else if (result && result.error === 'off') {
      NotificationHelper.error(text('settingsHistoryWatchOff', 'The extension is switched off, so nothing is checked.'));
    } else if (result && result.status === 'ok') {
      NotificationHelper.success(result.checked + result.skipped + result.failed === 0
        ? text('settingsHistoryWatchNothing', 'No page is watched yet: pin a page in History and choose Watch for changes.')
        : text('settingsHistoryWatchDoneFmt', 'Checked {0} pages, {1} changed', result.checked, result.changed));
    } else {
      NotificationHelper.error(text('settingsHistoryWatchFailed', 'The last check failed.'));
    }
  } catch (error) {
    NotificationHelper.error(text('settingsHistoryWatchFailed', 'The last check failed.'));
  } finally {
    if (button) button.disabled = false;
    SettingsUI.refreshHistoryWatch.call(this);
  }
};

/** "Back up now": the worker writes History to Downloads; the result is shown beside the button. */
SettingsUI.backUpHistoryNow = async function(button) {
  const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
  if (button) button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'HISTORY_BACKUP_NOW' });
    if (result && result.status === 'ok') {
      NotificationHelper.success(result.entries
        ? text('settingsHistoryBackupDoneFmt', 'Backed up {0} entries', result.entries)
        : text('settingsHistoryBackupEmpty', 'Nothing to back up yet'));
    } else if (result && result.status === 'unknown') {
      // The worker does not know this request: it still runs the code from before the update
      NotificationHelper.error(text('workerOutdatedHint', "The extension's background part is out of date. Reload the extension on the extensions page and try again."));
    } else {
      // The worker's own reason (for example the browser refusing the download) follows the message
      const reason = result && result.error ? `: ${String(result.error).slice(0, 160)}` : '';
      NotificationHelper.error(`${text('settingsHistoryBackupFailed', 'History backup failed')}${reason}`);
    }
  } catch (error) {
    const reason = error && error.message ? `: ${String(error.message).slice(0, 160)}` : '';
    NotificationHelper.error(`${text('settingsHistoryBackupFailed', 'History backup failed')}${reason}`);
  } finally {
    if (button) button.disabled = false;
    SettingsUI.refreshHistoryStorage.call(this);
  }
};
