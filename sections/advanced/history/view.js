/** Unified capture history filters and card presentation. */
Advanced.prototype.updateSiteFilterOptions = function(captures, currentSite) {
    const siteFilter = document.querySelector('#captureSiteFilter');
    if (!siteFilter) return;

    // Build options HTML - only show "All Sites" and "Current Site"
    const esc = FormatUtils.escapeHtml;
    const currentLabel = currentSite
      ? _advHistoryFmt('advPanelCurrentSiteFmt', `Current Site (${currentSite})`, currentSite)
      : _advHistoryTr('advancedFilterCurrentSite', 'Current Site');
    let optionsHtml = `
      <option value="all">${esc(_advHistoryTr('advancedFilterAllSites', 'All Sites'))}</option>
      <option value="current" ${this.captureFilters.site === 'current' ? 'selected' : ''} data-site="${esc(currentSite || '')}">
        ${esc(currentLabel)}
      </option>
    `;

    siteFilter.innerHTML = optionsHtml;
  };


  /**
   * What an entry is: a capture, or the result of one kind of tool button
   * (same kinds as the tool cards: cookies, sitekey, selector, scripts…)
   */
Advanced.TOOL_KINDS = {
    capture: ['advFilterKindCapture', 'Captures'],
    cookies: ['btnCheckCookies', 'Check Cookies'],
    sitekey: ['btnExtractSiteKey', 'Extract Site Key'],
    selector: ['btnObtainSelector', 'Obtain selector'],
    callback: ['advRecaptchaCallbackTool', 'reCAPTCHA callback'],
    scripts: ['btnAnalyzeScripts', 'Analyze Scripts'],
    version: ['btnCheckVersion', 'Check Version'],
    sensor: ['advAkamaiExtractSensorBtn', 'Extract Sensor Information'],
    inspect: ['advFilterKindOther', 'Other tools']
  };

Advanced.captureKind = function(capture) {
    const tool = capture?.data?.tool;
    if (!tool) return 'capture';
    return BaseAdvancedModule.prototype.resolveToolAction({ id: String(tool) });
  };


Advanced.prototype.updateToolFilterOptions = function(captures) {
    const toolFilter = document.querySelector('#captureToolFilter');
    if (!toolFilter) return;
    const esc = FormatUtils.escapeHtml;
    const present = new Set(captures.map(capture => Advanced.captureKind(capture)));
    if (this.captureFilters.tool !== 'all' && !present.has(this.captureFilters.tool)) {
      this.captureFilters.tool = 'all';
    }
    const options = Object.keys(Advanced.TOOL_KINDS).filter(kind => present.has(kind));
    toolFilter.innerHTML = `<option value="all">${esc(_advHistoryTr('advancedFilterAllTools', 'All tools'))}</option>`
      + options.map(kind => `<option value="${kind}">${esc(_advHistoryTr(...Advanced.TOOL_KINDS[kind]))}</option>`).join('');
    toolFilter.value = this.captureFilters.tool;
  };


  /**
   * Module filter: one option per vendor that has saved history, by the same
   * ids the captures are stored under; keeps the current choice when present
   * @param {Array} captures - All captures
   */

Advanced.prototype.updateModuleFilterOptions = function(captures) {
    const moduleFilter = document.querySelector('#captureModuleFilter');
    if (!moduleFilter) return;
    const esc = FormatUtils.escapeHtml;
    const modules = new Map();
    for (const capture of captures) {
      if (capture.moduleId && !modules.has(capture.moduleId)) modules.set(capture.moduleId, capture.moduleName || capture.moduleId);
    }
    if (this.captureFilters.module !== 'all' && !modules.has(this.captureFilters.module)) {
      this.captureFilters.module = 'all';
    }
    const options = [...modules.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    moduleFilter.innerHTML = `<option value="all">${esc(_advHistoryTr('advancedFilterAllModules', 'All Modules'))}</option>`
      + options.map(([id, name]) => `<option value="${FormatUtils.escapeAttr(id)}">${esc(name)}</option>`).join('');
    moduleFilter.value = this.captureFilters.module;
  };


  /**
   * Render empty state
   * @param {HTMLElement} container - Container element
   */

Advanced.prototype.renderEmptyState = function(container) {
    container.classList.toggle('is-empty', true);
    document.querySelector('#advancedContent')?.classList.toggle('is-capture-history-empty', true);
    const shell = container.querySelector('.history-v2-shell');
    const grid = container.querySelector('#captureGrid');
    const emptyState = container.querySelector('#captureEmptyState');
    const pagination = container.querySelector('#capturePagination');
    if (shell) shell.style.display = 'none';
    if (grid) grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    if (pagination) pagination.style.display = 'none';

    const openTools = container.querySelector('#captureOpenToolsBtn');
    if (openTools && openTools.dataset.bound !== 'true') {
      openTools.dataset.bound = 'true';
      openTools.addEventListener('click', async () => {
        await this.switchAdvancedTab('tools');
        document.querySelector('#toolsPanel')?.focus();
      });
    }
  };


  /**
   * Render no results state
   * @param {HTMLElement} container - Container element
   */

Advanced.prototype.renderNoResults = function(container) {
    const grid = container.querySelector('#captureGrid');
    if (!grid) return;

    grid.innerHTML = `
      <div id="captureNoResults" class="capture-no-results">
        <div class="no-results-icon"></div>
        <h3 class="no-results-title">${_advHistoryTr('advancedNoResultsTitle', 'No captures found')}</h3>
        <p class="no-results-text">${_advHistoryTr('advPanelNoResultsText', 'Try adjusting your filters or search query to find captures.')}</p>
        <button id="resetAllFiltersBtn" class="reset-filters-btn">${_advHistoryTr('advancedBtnResetFilters', 'Reset All Filters')}</button>
      </div>
    `;

    // Add reset listener
    const resetBtn = document.querySelector('#resetAllFiltersBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetAllFilters());
    }
  };


  /**
   * Render capture cards
   * @param {Array} captures - Filtered captures
   * @param {HTMLElement} container - Container element
   */

Advanced.prototype.renderCaptureCards = function(captures, container) {
    const grid = container.querySelector('#captureGrid');
    if (!grid) return;

    const unknownLabel = _advHistoryTr('timeUnknown', 'Unknown');
    const noUrlLabel = _advHistoryTr('advPanelNoUrl', 'No URL');
    const viewLabel = _advHistoryTr('advPanelView', 'View');
    const copyLabel = _advHistoryTr('advCommonCopy', 'Copy');
    const deleteLabel = _advHistoryTr('btnDelete', 'Delete');
    const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;

    const capturesHtml = captures.map(capture => {
      const moduleName = capture.moduleName || capture.moduleId || unknownLabel;
      const moduleClass = capture.moduleId || 'unknown';
      const timestamp = AdvancedUtils.getTimeAgo(capture.timestamp);
      let absoluteTime = '';
      if (capture.timestamp) {
        try {
          absoluteTime = new Date(capture.timestamp).toLocaleString(uiLocale);
        } catch (_) {
          absoluteTime = new Date(capture.timestamp).toLocaleString();
        }
      }
      const url = capture.url || noUrlLabel;
      // 'unknown' is the internal site value used for filtering; show it localised
      const site = (capture.site && capture.site !== 'unknown') ? capture.site : unknownLabel;
      const size = AdvancedUtils.formatBytes(JSON.stringify(capture.data || {}).length);
      const favicon = UrlUtils.resolveDisplayFavicon(capture.favicon, url || capture.hostname);

      // Same anatomy as the History tab cards: favicon tile, title + "host • time",
      // module chip and size below, icon actions on the right
      const hostLabel = (capture.site && capture.site !== 'unknown') ? capture.site : (capture.url ? UrlUtils.getHostnameFromUrl(capture.url) : site);
      return `
        <div class="capture-card capture-card--v28" data-module-id="${capture.moduleId}" data-capture-id="${capture.id}" tabindex="0" role="button" aria-label="${FormatUtils.escapeAttr(`${viewLabel}: ${moduleName} · ${hostLabel}`)}">
          <div class="capture-card-row">
            <span class="capture-favicon-tile">
              <img src="${favicon}" class="capture-url-favicon" alt="" data-fallback="${UrlUtils.getDefaultFaviconUrl()}">
            </span>
            <div class="capture-card-main">
              <div class="capture-card-title" title="${AdvancedUtils.escapeHtml(url)}">${AdvancedUtils.escapeHtml(url)}</div>
              <div class="capture-card-sub">
                <span class="capture-card-host">${FormatUtils.escapeHtml(hostLabel || site)}</span>
                <span class="capture-card-dot" aria-hidden="true">•</span>
                <span class="capture-timestamp"${absoluteTime ? ` title="${FormatUtils.escapeHtml(absoluteTime)}"` : ''}>${timestamp}</span>
                <span class="capture-card-dot" aria-hidden="true">•</span>
                <span class="capture-size">${size}</span>
              </div>
            </div>
            <div class="capture-card-actions">
              <button class="capture-action-btn copy-btn" data-action="copy" title="${FormatUtils.escapeAttr(copyLabel)}" aria-label="${FormatUtils.escapeAttr(copyLabel)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
              </button>
              <button class="capture-action-btn delete-btn" data-action="delete" title="${FormatUtils.escapeAttr(deleteLabel)}" aria-label="${FormatUtils.escapeAttr(deleteLabel)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          </div>
          <div class="capture-card-foot">
            <span class="capture-module-badge ${moduleClass}">${moduleName}</span>
            ${capture.data && capture.data.tool && capture.data.label ? `<span class="capture-tool-label" title="${FormatUtils.escapeAttr(capture.data.label)}">${FormatUtils.escapeHtml(capture.data.label)}</span>` : ''}
            <span class="capture-card-open">${FormatUtils.escapeHtml(viewLabel)}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
            </span>
          </div>
        </div>
      `;
    }).join('');

    grid.innerHTML = capturesHtml;

    // CSP-compliant image error fallback
    grid.querySelectorAll('img[data-fallback]').forEach(img => {
      img.addEventListener('error', function() {
        this.src = this.dataset.fallback;
      }, { once: true });
    });

    // Add click listeners
    this.setupCaptureCardListeners();
  };


  /**
   * Setup capture card action listeners
   */

Advanced.prototype.getModuleName = function(moduleId) {
    // History buckets use imperva / awswaf; the module registry incapsula / aws-waf
    const registryId = moduleId === 'imperva' ? 'incapsula' : moduleId === 'awswaf' ? 'aws-waf' : moduleId;
    const moduleInfo = Advanced.AVAILABLE_MODULES[registryId];
    return moduleInfo ? moduleInfo.productName : moduleId;
  };
