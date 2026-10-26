/** Unified capture history filters and card presentation. */
/** The "Current site / All sites" switch: which one is on, and the current site's name under it. */
Advanced.prototype.updateCaptureScope = function(currentSite) {
    const host = document.querySelector('#captureCurrentHost');
    if (host) host.textContent = currentSite || '';
    document.querySelectorAll('.cap-scope-btn').forEach((button) => {
      const on = (button.dataset.site === 'all') === (this.captureFilters.site === 'all');
      button.setAttribute('aria-pressed', String(on));
    });
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
    // Analyze Scripts results are saved by the worker as 'analysis'
    if (tool === 'analysis') return 'scripts';
    return BaseAdvancedModule.prototype.resolveToolAction({ id: String(tool) });
  };

  /** The tag on a history card: which tool made the entry, in the current language. */
Advanced.captureToolTag = function(capture) {
    const kind = Advanced.captureKind(capture);
    if (kind === 'capture') return _advHistoryTr('advHistoryCaptureTag', 'Capture');
    const label = capture?.data?.label || '';
    // "Other tools" is a filter group, not a name: keep the button's own label there
    const entry = kind === 'inspect' ? null : Advanced.TOOL_KINDS[kind];
    return entry ? _advHistoryTr(...entry) : (label || _advHistoryTr(...Advanced.TOOL_KINDS.inspect));
  };


/** A vendor's logo file (detectors/icons/), or '' when it has none. */
Advanced.captureLogo = function(moduleId) {
    const registry = typeof AdvancedVendorRegistry !== 'undefined' ? AdvancedVendorRegistry : null;
    const entry = registry ? registry.modules[registry.registryKey(moduleId)] : null;
    return entry && typeof entry.logo === 'string' ? entry.logo : '';
  };

/** Light and dark copies of a vendor logo, as the Rules cards show them. */
Advanced.captureLogoHtml = function(logo, size) {
    const attr = FormatUtils.escapeAttr;
    if (!logo) return '';
    return `<img class="cap-logo-dark" src="assets/logos-dark/${attr(logo)}" alt="" width="${size}" height="${size}" data-fallback="detectors/icons/${attr(logo)}">`
      + `<img class="cap-logo-light" src="detectors/icons/${attr(logo)}" alt="" width="${size}" height="${size}">`;
  };

/**
 * Chips for the vendors and the kinds of tool in the captures on screen, one group each and only when there is a
 * choice to make (two or more). A chip narrows the list to it; pressing it again shows everything.
 * @param {Array} captures - the captures of the chosen sites
 */
Advanced.prototype.renderCaptureChips = function(captures) {
    const row = document.querySelector('#captureChips');
    if (!row) return;
    const esc = FormatUtils.escapeHtml;
    const attr = FormatUtils.escapeAttr;
    const modules = new Map();
    const kinds = new Set();
    for (const capture of captures) {
      if (capture.moduleId && !modules.has(capture.moduleId)) modules.set(capture.moduleId, capture.moduleName || capture.moduleId);
      kinds.add(Advanced.captureKind(capture));
    }
    // A choice that no longer has captures goes back to everything
    if (this.captureFilters.module !== 'all' && !modules.has(this.captureFilters.module)) this.captureFilters.module = 'all';
    if (this.captureFilters.tool !== 'all' && !kinds.has(this.captureFilters.tool)) this.captureFilters.tool = 'all';

    const chip = (group, value, label, logo = '') => {
      const on = this.captureFilters[group] === value;
      return `<button type="button" class="history-filter-chip cap-chip" data-filter-group="${group}" data-filter-value="${attr(value)}" aria-pressed="${on}">`
        + (logo ? `<span class="cap-chip-logo" aria-hidden="true">${Advanced.captureLogoHtml(logo, 14)}</span>` : '')
        + `<span>${esc(label)}</span></button>`;
    };
    const vendorChips = modules.size > 1
      ? [...modules.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])))
        .map(([id, name]) => chip('module', id, name, Advanced.captureLogo(id)))
      : [];
    const toolChips = kinds.size > 1
      ? Object.keys(Advanced.TOOL_KINDS).filter(kind => kinds.has(kind)).map(kind => chip('tool', kind, _advHistoryTr(...Advanced.TOOL_KINDS[kind])))
      : [];
    // Vendors on one line, tools on the next
    const group = chips => (chips.length ? `<div class="cap-chips-group">${chips.join('')}</div>` : '');
    row.innerHTML = group(vendorChips) + group(toolChips);
    row.hidden = vendorChips.length + toolChips.length === 0;
    row.querySelectorAll('img[data-fallback]').forEach(img => img.addEventListener('error', function() { this.src = this.dataset.fallback; }, { once: true }));
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
    if (shell) shell.style.display = 'none';
    if (grid) grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';

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
    const esc = FormatUtils.escapeHtml;
    grid.innerHTML = `
      <div id="captureNoResults" class="capture-no-results cap-no-results">
        <p class="no-results-title">${esc(_advHistoryTr('advancedNoResultsTitle', 'No captures found'))}</p>
        <p class="no-results-text">${esc(_advHistoryTr('advPanelNoResultsText', 'Try adjusting your filters or search query to find captures.'))}</p>
        <button type="button" id="resetAllFiltersBtn" class="history-clear-filters">${esc(_advHistoryTr('advancedBtnResetFilters', 'Reset All Filters'))}</button>
      </div>
    `;
    grid.querySelector('#resetAllFiltersBtn')?.addEventListener('click', () => this.resetAllFilters());
  };


  /**
   * Render capture cards
   * @param {Array} captures - Filtered captures
   * @param {HTMLElement} container - Container element
   */

Advanced.prototype.renderCaptureCards = function(captures, container) {
    const grid = container.querySelector('#captureGrid');
    if (!grid) return;

    const esc = FormatUtils.escapeHtml;
    const attr = FormatUtils.escapeAttr;
    const unknownLabel = _advHistoryTr('timeUnknown', 'Unknown');
    const viewLabel = _advHistoryTr('advPanelView', 'View');
    const copyLabel = _advHistoryTr('advCommonCopy', 'Copy');
    const deleteLabel = _advHistoryTr('btnDelete', 'Delete');
    const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
    const allSites = this.captureFilters?.site === 'all';

    // One row per capture: the vendor's logo, what was done (the tool) and by which vendor, then where (the page:
    // its path on the current site, host and path across sites), when and how much; copy and delete on the right
    grid.innerHTML = captures.map(capture => {
      const moduleName = capture.moduleName || capture.moduleId || unknownLabel;
      const toolTag = Advanced.captureToolTag(capture);
      let absoluteTime = '';
      if (capture.timestamp) {
        try { absoluteTime = new Date(capture.timestamp).toLocaleString(uiLocale); } catch (_) { absoluteTime = new Date(capture.timestamp).toLocaleString(); }
      }
      const host = (capture.site && capture.site !== 'unknown') ? capture.site : (capture.url ? UrlUtils.getHostnameFromUrl(capture.url) : unknownLabel);
      let place = host;
      try {
        const parsed = new URL(capture.url);
        const path = parsed.pathname === '/' ? '' : parsed.pathname;
        place = allSites || !path ? `${parsed.hostname}${path}` : path;
      } catch (_) { /* no address: the host name */ }
      const size = AdvancedUtils.formatBytes(JSON.stringify(capture.data || {}).length);
      const logo = Advanced.captureLogo(capture.moduleId);
      const favicon = UrlUtils.resolveDisplayFavicon(capture.favicon, capture.url || capture.hostname);
      const mark = logo
        ? Advanced.captureLogoHtml(logo, 22)
        : `<img src="${attr(favicon)}" alt="" width="22" height="22" data-fallback="${attr(UrlUtils.getDefaultFaviconUrl())}">`;
      return `
        <div class="capture-card cap-row" data-module-id="${attr(capture.moduleId)}" data-capture-id="${attr(capture.id)}" tabindex="0" role="button" aria-label="${attr(`${viewLabel}: ${toolTag} · ${moduleName} · ${host}`)}">
          <span class="cap-row-mark" aria-hidden="true">${mark}</span>
          <span class="cap-row-main">
            <span class="cap-row-title"><span class="cap-row-tool">${esc(toolTag)}</span><span class="cap-row-vendor">${esc(moduleName)}</span></span>
            <span class="cap-row-sub">
              <span class="cap-row-place" title="${attr(capture.url || host)}">${esc(place)}</span>
              <span class="cap-row-dot" aria-hidden="true">·</span>
              <span class="cap-row-time"${absoluteTime ? ` title="${attr(absoluteTime)}"` : ''}>${esc(AdvancedUtils.getTimeAgo(capture.timestamp))}</span>
              <span class="cap-row-dot" aria-hidden="true">·</span>
              <span class="cap-row-size">${esc(size)}</span>
            </span>
          </span>
          <span class="cap-row-actions">
            <button type="button" class="capture-action-btn cap-row-btn" data-action="copy" title="${attr(copyLabel)}" aria-label="${attr(copyLabel)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
            </button>
            <button type="button" class="capture-action-btn cap-row-btn cap-row-btn--danger" data-action="delete" title="${attr(deleteLabel)}" aria-label="${attr(deleteLabel)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </span>
        </div>
      `;
    }).join('');

    // CSP-compliant image error fallback
    grid.querySelectorAll('img[data-fallback]').forEach(img => {
      img.addEventListener('error', function() {
        this.src = this.dataset.fallback;
      }, { once: true });
    });

    this.setupCaptureCardListeners(grid);
  };


  /**
   * Setup capture card action listeners
   */

Advanced.prototype.getModuleName = function(moduleId) {
    // History buckets use vendor ids (imperva, awswaf, binance); the module registry detector ids
    const registryId = AdvancedVendorRegistry.registryKey(moduleId);
    const moduleInfo = Advanced.AVAILABLE_MODULES[registryId];
    return moduleInfo ? moduleInfo.productName : moduleId;
  };
