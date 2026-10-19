  /**
   * Render advanced tools interface
   */
Advanced.prototype.renderAdvancedInterface = async function() {
    try {
      Logger.debug('UI', '[Advanced] renderAdvancedInterface called');
      const advancedContent = document.querySelector('#advancedContent');
      const noAdvancedState = document.querySelector('#noAdvancedState');

      if (!advancedContent) {
        Logger.error('UI', '[Advanced] #advancedContent not found in DOM!');
        return;
      }
      Logger.debug('UI', '[Advanced] ✓ Found #advancedContent');

      // Keep the initial loading state (or the previously rendered view)
      // until tools/empty content and its navigation visibility are ready.
      const detectionTools = await this.getDetectionModules();
      Logger.debug('UI', '[Advanced] Detection modules fetched:', detectionTools.length, 'tools available');
      this.availableDetectionTools = detectionTools;

      // Supported protections get direct tool cards; with none, a bare
      // 2.8 empty state (as Detection's "Nothing detected") replaces the card.
      Logger.debug('UI', '[Advanced] Found', detectionTools.length, 'available tools, rendering interface');

      // Get toolsPanel
      const toolsPanel = document.querySelector('#toolsPanel');
      if (!toolsPanel) {
        Logger.error('UI', '[Advanced] #toolsPanel not found in DOM!');
        return;
      }

      const _at = (typeof I18n !== 'undefined') ? I18n : null;
      const _atr = (key, fb) => (_at && _at.tr(key, fb)) || fb;

      const esc = FormatUtils.escapeHtml;
      const attr = FormatUtils.escapeAttr;
      const protectionCards = detectionTools.map(({ detection, module }) => {
        const detector = detection.detector || {};
        const name = detector.name || Advanced.toolsDisplayName(module);
        const icon = detector.icon
          ? `<img src="${attr(chrome.runtime.getURL(`detectors/icons/${detector.icon}`))}" alt="">`
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l8 3v6c0 4-3 7-8 9-5-2-8-5-8-9V6z"/></svg>';
        return `
          <button type="button" class="advanced-launch-card" data-detector-id="${attr(detector.id)}">
            <span class="advanced-launch-icon">${icon}</span>
            <span class="advanced-launch-copy">
              <span class="advanced-launch-name">${esc(name)}</span>
              <span class="advanced-launch-action">${esc(_atr('advancedToolsLoadTools', 'Open tools'))}</span>
            </span>
            <svg class="advanced-launch-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
          </button>`;
      }).join('');

      // The footer shows the retention set in Settings → Detection (default 30 minutes)
      let _retentionMinutes = 30;
      try {
        const _s = typeof Utils !== 'undefined' && Utils.getSettings ? await Utils.getSettings() : null;
        const _m = Number(_s && _s.detection && _s.detection.captureRetentionMinutes);
        if (Number.isFinite(_m) && _m > 0) _retentionMinutes = _m;
      } catch (_) { /* keep the default */ }
      // Common values read nicely; any other value falls back to "<n> <unit>"
      const _retLabels = { 15: ['settingsCaptureRetention15m', '15 minutes'], 30: ['settingsCaptureRetention30m', '30 minutes'],
        60: ['settingsCaptureRetention1h', '1 hour'], 180: ['settingsCaptureRetention3h', '3 hours'],
        720: ['settingsCaptureRetention12h', '12 hours'], 1440: ['settingsCaptureRetention24h', '24 hours'] };
      let _retLabel;
      if (_retLabels[_retentionMinutes]) {
        _retLabel = _atr(_retLabels[_retentionMinutes][0], _retLabels[_retentionMinutes][1]);
      } else if (_retentionMinutes % 1440 === 0) {
        _retLabel = `${_retentionMinutes / 1440} ${_atr('timeUnitDays', 'Days').toLowerCase()}`;
      } else if (_retentionMinutes % 60 === 0) {
        _retLabel = `${_retentionMinutes / 60} ${_atr('timeUnitHours', 'Hours').toLowerCase()}`;
      } else {
        _retLabel = `${_retentionMinutes} ${_atr('timeUnitMinutes', 'Minutes').toLowerCase()}`;
      }
      const _retentionHint = _atr('advancedFooterHintFmt', 'Captures are kept for {0}.').replace('{0}', _retLabel);

      const captchaToolsHtml = `
        <div class="captcha-tools-section">
          <div class="advanced-tools-heading">
            <div>
              <h3>${esc(_atr('advancedToolsHeading', 'Capture tools'))}</h3>
              <p>${esc(_atr('advancedToolsSubtitle', 'Choose a protection to open its tools.'))}</p>
            </div>
            <button type="button" class="advanced-help-btn" id="showAdvancedHelp" title="${attr(_atr('advancedToolsLearnMore', 'Learn about Advanced Tools'))}" aria-label="${attr(_atr('advancedToolsLearnMore', 'Learn about Advanced Tools'))}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/></svg>
            </button>
          </div>
          <div class="advanced-launch-list" id="advancedToolList">
            ${protectionCards}
          </div>
          <div class="compact-detection-bar" id="compactDetectionBar">
            <div class="compact-detection-info">
              <img class="compact-detection-icon" id="compactDetectionIcon" alt="">
              <span class="compact-detection-name" id="compactDetectionName"></span>
            </div>
            <button type="button" class="compact-change-btn" id="changeDetectionBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5-7 7 7 7M2 12h20"/></svg>
              <span>${esc(_atr('advancedToolsChange', 'Change'))}</span>
            </button>
          </div>
          <div id="detectionToolsPanel" class="detection-tools-panel-animated" style="display: none;"></div>
          <p class="advanced-retention-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            <span>${esc(_retentionHint)}</span>
          </p>
        </div>
      `;

      // No supported detection: only the empty state, centred in the tab; the
      // sub-tab switch returns when tools become available or History opens.
      const noTools = detectionTools.length === 0;
      advancedContent.classList.toggle('is-no-tools', noTools);

      // Inject into tools panel instead of entire content
      toolsPanel.innerHTML = noTools
        ? `<div class="captcha-tools-section captcha-tools-section--empty">${this.renderNoToolsState(_atr)}</div>`
        : captchaToolsHtml;
      Logger.debug('UI', '[Advanced] ✓ HTML injected successfully');

      // Setup sub-tab listeners
      Logger.debug('UI', '[Advanced] Setting up listeners');
      this.setupSubTabListeners();

      const loading = document.querySelector('#advancedLoadingState');
      if (loading) loading.style.display = 'none';
      if (noAdvancedState) noAdvancedState.style.display = 'none';
      advancedContent.style.display = 'flex';

      // Update capture count badge
      await this.updateCaptureCountBadge();

      if (noTools) {
        await this.setupNoToolsHistoryLink();
      } else {
        this.setupDetectionToolsListeners();
      }
      Logger.debug('UI', '[Advanced] renderAdvancedInterface complete!');

    } catch (error) {
      Logger.error('UI', '[Advanced] ERROR in renderAdvancedInterface:', error);
      Logger.error('UI', '[Advanced] Stack trace:', error.stack);

      // Show error state
      const loading = document.querySelector('#advancedLoadingState');
      if (loading) loading.style.display = 'none';
      const advancedContent = document.querySelector('#advancedContent');
      if (advancedContent) {
        advancedContent.style.display = 'none';
      }
      const noAdvancedState = document.querySelector('#noAdvancedState');
      if (noAdvancedState) {
        noAdvancedState.style.display = 'flex';
        const _etr = (key, fb) => (typeof I18n !== 'undefined' && I18n.get(key)) || fb;
        noAdvancedState.innerHTML = `<div style="padding: 20px; text-align: center; color: #ef4444;"><strong>${FormatUtils.escapeHtml(_etr('advPanelErrorLoadingTools', 'Error loading Advanced tools'))}</strong><br>${FormatUtils.escapeHtml(_etr('advPanelCheckConsole', 'Check console for details'))}</div>`;
      }
    }
  };



  /**
   * Supported protections by category, sorted by name, for the no-tools screen.
   * @returns {Array<{ key: string, items: Array<{ name: string, logo: string }> }>}
   */
Advanced.supportedProtectionGroups = function() {
    const groups = { antibot: [], captcha: [] };
    const seen = new Set();
    Object.values(Advanced.AVAILABLE_MODULES || {}).forEach(module => {
      const name = String(module.productName || '').trim();
      if (!name || seen.has(name)) return;
      seen.add(name);
      (groups[module.category] || groups.captcha).push({ name, logo: module.logo || 'custom.png' });
    });
    return Object.entries(groups)
      .filter(([, items]) => items.length)
      .map(([key, items]) => ({ key, items: items.sort((a, b) => a.name.localeCompare(b.name)) }));
  };


  /**
   * Bare 2.8 empty state shown instead of the selector card when the page has
   * no detection with Advanced tools: robot logo, blue title, description and
   * one compact row of chips naming the supported protections.
   * @param {function(string, string): string} tr - translate(key, fallback)
   * @returns {string} HTML
   */
Advanced.prototype.renderNoToolsState = function(tr) {
    const esc = (value) => (typeof FormatUtils !== 'undefined' && FormatUtils.escapeHtml)
      ? FormatUtils.escapeHtml(value)
      : String(value).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
    // Nothing detected, or a supported protection detected at or below the minimum confidence
    const fmt = (key, fallback, ...args) => (typeof I18n !== 'undefined' && typeof I18n.format === 'function' && I18n.format(key, ...args))
      || args.reduce((text, arg, i) => text.split(`{${i}}`).join(String(arg)), fallback);
    const minimum = [this.minToolConfidence, Advanced.MIN_TOOL_CONFIDENCE].find(Number.isInteger) ?? 50;
    const low = (this.toolsBelowThreshold || [])[0];
    const emptyTitle = low
      ? tr('advancedToolsLowConfidenceTitle', 'Protection detected with low confidence')
      : tr('advancedToolsEmptyTitle', 'No protection detected');
    const emptyText = low
      ? fmt('advancedToolsLowConfidenceDescFmt', '{0} was detected with {1}% confidence. Tools appear only above {2}%. You can lower this minimum in Settings → Detection.', low.name, Math.round(low.confidence), minimum)
      : fmt('advancedToolsEmptyDescFmt', 'No supported protection on this page is above {0}% confidence. You can change this minimum in Settings → Detection.', minimum);

    // One logo per protection (its name on hover), grouped by category like the info window
    const titles = { antibot: tr('categoryAntibot', 'Anti-bot'), captcha: tr('categoryCaptcha', 'Captcha') };
    // Each category's colour from Settings, as in the other views
    const categoryColour = key => {
      const manager = this.detectorManager || (typeof window !== 'undefined' && window.popupInstance?.detectorManager) || null;
      return manager?.getCategoryInfo?.(key)?.colour || (typeof FormatUtils !== 'undefined' && FormatUtils.DEFAULT_CATEGORY_COLORS?.[key]) || 'currentColor';
    };
    const groups = Advanced.supportedProtectionGroups().map(group => `
                <div class="advanced-supported-group">
                  <div class="advanced-supported-head">
                    <span class="category-icon" aria-hidden="true" style="color: ${esc(categoryColour(group.key))}">${typeof FormatUtils !== 'undefined' && FormatUtils.categoryIconSvg ? FormatUtils.categoryIconSvg(group.key) : ''}</span>
                    <span class="advanced-supported-title">${esc(titles[group.key] || group.key)}</span>
                    <span class="advanced-supported-count">${group.items.length}</span>
                  </div>
                  <ul class="advanced-supported-logos">
                    ${group.items.map(item => `<li class="advanced-supported-logo" title="${esc(item.name)}"><img class="advanced-supported-logo-dark" src="assets/logos-dark/${esc(item.logo)}" alt="${esc(item.name)}" width="20" height="20" loading="lazy"><img class="advanced-supported-logo-light" src="detectors/icons/${esc(item.logo)}" alt="" width="20" height="20" loading="lazy"></li>`).join('')}
                  </ul>
                </div>`).join('');

    return `
          <div class="advanced-no-tools" id="advancedNoTools">
            <div class="state-card state-card--bare advanced-no-tools-card">
              <div class="state-card-icon">
                <img src="icons/icon128.png" alt="" width="72" height="72" class="state-card-logo">
              </div>
              <h3 class="state-card-title">${esc(emptyTitle)}</h3>
              <p class="state-card-description">${esc(emptyText)}</p>
              <div class="advanced-supported" role="group" aria-label="${esc(tr('advancedToolsSupportedLabel', 'Supported protections'))}">
                ${groups}
              </div>
              <button type="button" class="advanced-no-tools-history" id="advancedNoToolsHistoryBtn" hidden></button>
            </div>
          </div>
    `;
  };


  /**
   * The empty state hides the Tools/History switch, so when captures exist
   * it offers one small link to them (all sites when the current one has none).
   */
Advanced.prototype.setupNoToolsHistoryLink = async function() {
    const button = document.querySelector('#advancedNoToolsHistoryBtn');
    if (!button) return;
    try {
      await this.cleanExpiredCaptureData();
      const allHistory = await AdvancedHistoryStore.load();
      const currentSite = await this.getCurrentSite();
      let total = 0;
      let onSite = 0;
      Object.values(allHistory || {}).forEach(moduleHistory => {
        if (!Array.isArray(moduleHistory)) return;
        moduleHistory.forEach(capture => {
          if (!capture || typeof capture !== 'object' || !capture.id || !capture.timestamp) return;
          total++;
          try {
            if (capture.url && new URL(capture.url).hostname === currentSite) onSite++;
          } catch { /* unparsable capture url */ }
        });
      });
      if (!total) {
        button.hidden = true;
        return;
      }
      const label = (typeof I18n !== 'undefined' && I18n.format('advancedToolsOpenHistoryFmt', total))
        || `View capture history (${total})`;
      button.textContent = label;
      button.hidden = false;
      button.onclick = () => {
        if (!onSite) {
          this.captureFilters = { ...(this.captureFilters || { module: 'all', search: '' }), site: 'all' };
        }
        this.switchAdvancedTab('captures');
      };
    } catch (error) {
      Logger.error('UI', '[Advanced] Could not count captures for the empty state:', error);
      button.hidden = true;
    }
  };


  /**
   * Setup sub-tab navigation listeners
   */
Advanced.prototype.setupSubTabListeners = function() {
    const toolsTab = document.querySelector('#advancedToolsTab');
    const captureTab = document.querySelector('#advancedCaptureTab');

    // The sub-tab strip lives in the template, not in the re-rendered tools panel,
    // so bind each template instance only once
    if (!toolsTab || toolsTab.dataset.bound === 'true') return;
    toolsTab.dataset.bound = 'true';

    if (toolsTab) {
      toolsTab.addEventListener('click', () => this.switchAdvancedTab('tools'));
    }

    if (captureTab) {
      captureTab.addEventListener('click', () => this.switchAdvancedTab('captures'));
    }
  };


  /**
   * Switch between Tools and Capture History tabs
   * @param {string} tabName - 'tools' or 'captures'
   */
Advanced.prototype.switchAdvancedTab = async function(tabName) {
    Logger.debug('UI', '[Advanced] Switching to tab:', tabName);

    // Update tab buttons
    const allTabs = document.querySelectorAll('.advanced-sub-tab');
    allTabs.forEach(tab => tab.classList.remove('active'));

    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }

    // Update tab panels
    const allPanels = document.querySelectorAll('.advanced-tab-panel');
    allPanels.forEach(panel => {
      panel.classList.remove('active');
      panel.style.display = 'none';
    });

    // The empty Tools state hides the switch; the History view shows it so
    // the user can come back
    const advancedContent = document.querySelector('#advancedContent');
    if (advancedContent) advancedContent.classList.toggle('is-captures-view', tabName === 'captures');

    const activePanel = document.querySelector(`#${tabName}Panel`);
    if (activePanel) {
      activePanel.classList.add('active');
      activePanel.style.display = 'flex';
    }

    // If switching to captures tab, render unified history
    if (tabName === 'captures') {
      await this.renderUnifiedCaptureHistory();
    }

    // Update capture count badge
    await this.updateCaptureCountBadge();
  };


/** Bind direct protection-card navigation and help. */
Advanced.prototype.setupDetectionToolsListeners = function() {
    document.querySelectorAll('.advanced-launch-card').forEach(button => {
      button.addEventListener('click', () => this.loadSelectedDetectionTools(button.dataset.detectorId));
    });
    document.querySelector('#changeDetectionBtn')?.addEventListener('click', () => this.clearDetectionToolsPanel());
    document.querySelector('#showAdvancedHelp')?.addEventListener('click', () => this.openAdvancedInfoModal());
  };

/** Open a protection's tools directly from its card. */
Advanced.prototype.loadSelectedDetectionTools = async function(detectorId) {
    if (this.isLoadingTool) return false;
    const panel = document.querySelector('#detectionToolsPanel');
    const selected = this.availableDetectionTools.find(({ detection }) => detection.detector?.id === detectorId);
    if (!panel || !selected) return false;

    const buttons = [...document.querySelectorAll('.advanced-launch-card')];
    const selectedButton = buttons.find(button => button.dataset.detectorId === detectorId);
    this.isLoadingTool = true;
    buttons.forEach(button => { button.disabled = true; });
    selectedButton?.setAttribute('aria-busy', 'true');

    try {
      await this.cleanExpiredCaptureData();
      const { detection } = selected;
      const moduleInstance = await this.loadDetectionModule(detectorId, detection);
      if (!moduleInstance || typeof moduleInstance.renderTools !== 'function') {
        throw new Error('Advanced module unavailable');
      }

      panel.innerHTML = moduleInstance.renderTools();
      panel.style.display = 'block';
      document.querySelector('.captcha-tools-section')?.classList.add('compact-mode');

      const compactIcon = document.querySelector('#compactDetectionIcon');
      const compactName = document.querySelector('#compactDetectionName');
      if (compactIcon) {
        compactIcon.style.display = detection.detector?.icon ? 'block' : 'none';
        if (detection.detector?.icon) compactIcon.src = chrome.runtime.getURL(`detectors/icons/${detection.detector.icon}`);
      }
      if (compactName) compactName.textContent = detection.detector?.name || detectorId;

      this.activeModule = moduleInstance;
      this.currentModuleInstance = moduleInstance;
      this.selectedDetection = detectorId;
      moduleInstance.setupEventListeners?.();
      document.querySelector('#changeDetectionBtn')?.focus({ preventScroll: true });
      return true;
    } catch (error) {
      Logger.error('UI', '[Advanced] Could not open tools:', error);
      this.clearDetectionToolsPanel();
      NotificationHelper.error(FormatUtils.t('advPanelErrorLoadingTools', 'Error loading Advanced tools'));
      return false;
    } finally {
      this.isLoadingTool = false;
      buttons.forEach(button => { button.disabled = false; });
      selectedButton?.removeAttribute('aria-busy');
      if (!this.activeModule) selectedButton?.focus({ preventScroll: true });
    }
  };

/** Return to the protection list without changing capture history. */
Advanced.prototype.clearDetectionToolsPanel = function() {
    const selectedId = this.selectedDetection;
    const panel = document.querySelector('#detectionToolsPanel');
    if (panel) {
      panel.innerHTML = '';
      panel.style.display = 'none';
    }
    document.querySelector('.captcha-tools-section')?.classList.remove('compact-mode');
    this.selectedDetection = null;
    this.activeModule = null;
    this.currentModuleInstance = null;
    // Modules may hold runtime listeners (Imperva's extraction result, pending analyses)
    Object.values(this.loadedModules || {}).forEach(module => {
      try { module?.dispose?.(); } catch (error) { Logger.error('UI', '[Advanced] Module dispose failed:', error); }
    });
    this.loadedModules = {};
    const selectedButton = [...document.querySelectorAll('.advanced-launch-card')]
      .find(button => button.dataset.detectorId === selectedId);
    selectedButton?.focus({ preventScroll: true });
  };
