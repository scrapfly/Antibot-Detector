  /**
   * i18n helpers for the unified capture list (English fallback kept inline).
   */
function _advHistoryTr(key, fallback) {
    return (typeof I18n !== 'undefined' && I18n.get(key)) || fallback;
  }

function _advHistoryFmt(key, fallback, ...args) {
    return (typeof I18n !== 'undefined' && I18n.format(key, ...args)) || fallback;
  }


  /**
   * Update the capture count badge on the Capture History tab
   */
Advanced.prototype.updateCaptureCountBadge = async function() {
    try {
      const badge = document.querySelector('#captureCountBadge');
      if (!badge) return;

      // Clean expired captures first (keeps badge count in sync with displayed content)
      await this.cleanExpiredCaptureData();

      // Get all captures from all modules
      const allHistory = await AdvancedHistoryStore.load();

      // Always filter by current site by default
      const currentSite = await this.getCurrentSite();

      // Collect all captures with module info
      const allCaptures = [];
      Object.entries(allHistory).forEach(([moduleId, moduleHistory]) => {
        if (Array.isArray(moduleHistory)) {
          moduleHistory.forEach(capture => {
            // Only count valid captures
            if (capture && typeof capture === 'object' && capture.id && capture.timestamp) {
              allCaptures.push({
                ...capture,
                moduleId: moduleId,
                moduleName: this.getModuleName(moduleId),
                site: capture.url ? new URL(capture.url).hostname : 'unknown'
              });
            }
          });
        }
      });

      // Filter by current site only
      const currentSiteCaptures = allCaptures.filter(c => c.site === currentSite);
      const countToShow = currentSiteCaptures.length;

      if (countToShow > 0) {
        badge.textContent = countToShow;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    } catch (error) {
      Logger.error('UI', '[Advanced] Error updating capture count:', error);
    }
  };


  /**
   * Clean expired captures from history (30 minute expiry)
   * Automatically removes captures that have passed their expiration time
   */
Advanced.prototype.cleanExpiredCaptureData = async function() {
    try {
      let allHistory = await AdvancedHistoryStore.load();

      if (!allHistory || Object.keys(allHistory).length === 0) {
        return; // No data to clean
      }

      const now = Date.now();
      let hadExpiredData = false;

      // Clean each module's history
      Object.entries(allHistory).forEach(([moduleId, moduleHistory]) => {
        if (Array.isArray(moduleHistory)) {
          const originalLength = moduleHistory.length;

          // Filter out expired items
          allHistory[moduleId] = moduleHistory.filter(capture => {
            // Keep items without expiry or that haven't expired yet
            if (!capture.expiresAt) {
              return true; // Keep items without expiry
            }
            const isExpired = capture.expiresAt <= now;
            if (isExpired) {
              hadExpiredData = true;
            }
            return !isExpired;
          });

          // Log cleanup if items were removed
          if (allHistory[moduleId].length < originalLength) {
            const removedCount = originalLength - allHistory[moduleId].length;
            Logger.debug('UI', `[Advanced] Cleaned ${removedCount} expired captures from ${moduleId}`);
          }
        }
      });

      // Save cleaned history if any items were removed
      if (hadExpiredData) {
        await AdvancedHistoryStore.save(allHistory);
        Logger.debug('UI', '[Advanced] ✓ Expired capture data cleaned and saved');
      }
    } catch (error) {
      Logger.error('UI', '[Advanced] Error cleaning expired captures:', error);
    }
  };


  /**
   * Render unified capture history from all modules with filters and search
   */
Advanced.prototype.renderUnifiedCaptureHistory = async function() {
    Logger.debug('UI', '[Advanced] Rendering unified capture history');
    const capturesPanel = document.querySelector('#capturesPanel');
    if (!capturesPanel) return;

    // Initialize filter state if not exists
    if (!this.captureFilters) {
      this.captureFilters = {
        site: 'current',
        module: 'all',
        search: ''
      };
    }

    try {
      // Clean expired captures before rendering
      await this.cleanExpiredCaptureData();

      // Get current site
      const currentSite = await this.getCurrentSite();

      // Get all captures from storage (auto-migrated by store)
      const allHistory = await AdvancedHistoryStore.load();

      // Collect all captures with module info
      const allCaptures = [];
      Object.entries(allHistory).forEach(([moduleId, moduleHistory]) => {
        if (Array.isArray(moduleHistory)) {
          moduleHistory.forEach(capture => {
            allCaptures.push({
              ...capture,
              moduleId: moduleId,
              moduleName: this.getModuleName(moduleId),
              site: capture.url ? new URL(capture.url).hostname : 'unknown'
            });
          });
        }
      });

      // Apply filters
      let filteredCaptures = this.applyFilters(allCaptures, currentSite);

      // Render empty state if no captures
      if (allCaptures.length === 0) {
        this.renderEmptyState(capturesPanel);
        return;
      }

      // Keep the template and its controls across empty/populated transitions.
      capturesPanel.classList.toggle('is-empty', false);
      document.querySelector('#advancedContent')?.classList.toggle('is-capture-history-empty', false);
      const shell = capturesPanel.querySelector('.history-v2-shell');
      const emptyState = capturesPanel.querySelector('#captureEmptyState');
      if (shell) shell.style.display = 'flex';
      if (emptyState) emptyState.style.display = 'none';
      this.updateSiteFilterOptions(allCaptures, currentSite);
      this.setupCaptureHistoryListeners();

      // Filters must work even when this is the first history view.
      if (filteredCaptures.length === 0) {
        this.renderNoResults(capturesPanel);
      } else {
        this.renderCaptureCards(filteredCaptures, capturesPanel);
      }

    } catch (error) {
      document.querySelector('#advancedContent')?.classList.toggle('is-capture-history-empty', false);
      Logger.error('UI', '[Advanced] Error rendering unified capture history:', error);
      capturesPanel.innerHTML = `
        <div class="error-state">
          <p>${FormatUtils.escapeHtml(_advHistoryFmt('advPanelErrorLoadingCapturesFmt', `Error loading captures: ${error.message}`, error.message))}</p>
        </div>
      `;
    }
  };


  /**
   * Get current site hostname
   * @returns {string|null} Current site hostname
   */
Advanced.prototype.getCurrentSite = async function() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        return new URL(tab.url).hostname;
      }
    } catch (error) {
      Logger.error('UI', '[Advanced] Error getting current site:', error);
    }
    return null;
  };


  /**
   * Apply all active filters to captures
   * @param {Array} captures - Array of capture objects
   * @param {string} currentSite - Current site hostname
   * @returns {Array} Filtered captures
   */
Advanced.prototype.applyFilters = function(captures, currentSite) {
    let filtered = [...captures];

    // Site filter
    if (this.captureFilters.site === 'current' && currentSite) {
      filtered = filtered.filter(c => c.site === currentSite);
    } else if (this.captureFilters.site !== 'all' && this.captureFilters.site !== 'current') {
      filtered = filtered.filter(c => c.site === this.captureFilters.site);
    }

    // Module filter
    if (this.captureFilters.module !== 'all') {
      filtered = filtered.filter(c => c.moduleId === this.captureFilters.module);
    }

    // Search filter
    if (this.captureFilters.search) {
      const query = this.captureFilters.search.toLowerCase();
      filtered = filtered.filter(c => {
        const searchableText = [
          c.url || '',
          c.site || '',
          c.moduleName || '',
          c.moduleId || '',
          JSON.stringify(c.data || {})
        ].join(' ').toLowerCase();
        return searchableText.includes(query);
      });
    }

    // Newest first
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return filtered;
  };


  /**
   * Update site filter dropdown options
   * @param {Array} captures - All captures
   * @param {string} currentSite - Current site hostname
   */
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
            <span class="capture-size">${size}</span>
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
Advanced.prototype.setupCaptureCardListeners = function() {
    const cards = document.querySelectorAll('.capture-card');

    cards.forEach(card => {
      const viewBtn = card.querySelector('[data-action="view"]');
      const copyBtn = card.querySelector('[data-action="copy"]');
      const deleteBtn = card.querySelector('[data-action="delete"]');

      const moduleId = card.getAttribute('data-module-id');
      const captureId = card.getAttribute('data-capture-id');

      // Main card click - opens modal when clicking anywhere on the card
      card.addEventListener('click', (e) => {
        // Don't trigger if clicking on action buttons
        if (!e.target.closest('.capture-action-btn')) {
          this.viewCaptureDetails(moduleId, captureId);
        }
      });
      card.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === card) {
          e.preventDefault();
          this.viewCaptureDetails(moduleId, captureId);
        }
      });

      if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.viewCaptureDetails(moduleId, captureId);
        });
      }

      if (copyBtn) {
        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.copyCaptureData(moduleId, captureId);
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.deleteSingleCapture(moduleId, captureId);
        });
      }
    });
  };


  /**
   * View capture details in modal
   * @param {string} moduleId - Module ID
   * @param {string} captureId - Capture ID
   */
Advanced.prototype.viewCaptureDetails = async function(moduleId, captureId) {
    const _trAH = (key, fallback) => _advHistoryTr(key, fallback);
    try {
      // Get capture data (auto-migrated by store)
      const allHistory = await AdvancedHistoryStore.load();

      const moduleHistory = allHistory && Object.hasOwn(allHistory, moduleId) ? allHistory[moduleId] : [];
      const captureData = Array.isArray(moduleHistory)
        ? moduleHistory.find(c => c && typeof c === 'object' && c.id === captureId)
        : null;

      if (!captureData || !captureId) {
        NotificationHelper.error(_trAH('captureNotFound', 'Capture not found'));
        return;
      }

      // Storage buckets, module registry keys and detector IDs are distinct.
      // Read the exact bucket above to avoid collisions between saved aliases.
      const identity = typeof moduleId === 'string' ? moduleId.replace(/^detect-/, '') : '';
      const registryId = identity === 'imperva' ? 'incapsula' : identity === 'awswaf' ? 'aws-waf' : identity;
      const registry = Advanced.AVAILABLE_MODULES || {};
      if (!Object.hasOwn(registry, registryId)) {
        NotificationHelper.info(_trAH('captureDetailsUnavailable', 'Details view not available for this module'));
        return;
      }
      const storageIdentity = registryId === 'incapsula' ? 'imperva' : registryId === 'aws-waf' ? 'awswaf' : registryId;
      const loaded = this.loadedModules || {};
      let moduleInstance = [registryId, storageIdentity, moduleId]
        .filter(id => Object.hasOwn(loaded, id))
        .map(id => loaded[id]).find(instance => instance);
      if (!moduleInstance) {
        const manager = this.detectorManager;
        let detector = null;
        if (manager && typeof manager.findDetectorById === 'function') {
          for (const id of new Set([`detect-${registryId}`, `detect-${storageIdentity}`])) {
            detector = manager.findDetectorById(id);
            if (detector) break;
          }
        }
        // Viewing saved data does not require a currently installed detector.
        const detection = {
          detector: detector || { id: `detect-${registryId}`, name: registry[registryId].productName },
          confidence: 0,
          methods: []
        };
        moduleInstance = await this.loadDetectionModule(registryId, detection);
        if (!moduleInstance && typeof BaseAdvancedModule !== 'undefined') {
          // Reuse the existing generic details and native modal implementation.
          moduleInstance = new BaseAdvancedModule(detection, this.currentTab, storageIdentity);
        }
      }
      if (!moduleInstance) {
        NotificationHelper.error(_trAH('captureModuleClassNotFound', 'Module class not found. Please ensure the module is properly loaded.'));
        return;
      }

      if (typeof moduleInstance.renderCaptureDetailsContent === 'function' && typeof moduleInstance.displayCaptureDetailsModal === 'function') {
        // Transform capture data to match module expectations
        // Storage format: { id, timestamp, url, data, expiresAt }
        // Module expects: { timestamp, url, captureData, ... }
        const transformedCaptureData = {
          ...captureData,
          captureData: captureData.data !== undefined ? captureData.data : (captureData.captureData || {})
        };

        const detailsContent = moduleInstance.renderCaptureDetailsContent(transformedCaptureData);
        moduleInstance.displayCaptureDetailsModal(captureData.id, detailsContent);
      } else {
        NotificationHelper.info(_trAH('captureDetailsUnavailable', 'Details view not available for this module'));
      }
    } catch (error) {
      Logger.error('UI', '[Advanced] Error viewing capture details:', error);
      NotificationHelper.error(_trAH('failedViewCaptureDetails', 'Failed to view capture details'));
    }
  };


  /**
   * Copy capture data to clipboard
   * @param {string} moduleId - Module ID
   * @param {string} captureId - Capture ID
   */
Advanced.prototype.copyCaptureData = async function(moduleId, captureId) {
    const _tCC = (typeof I18n !== 'undefined') ? I18n : null;
    const _trCC = (key, fallback) => (_tCC && _tCC.get(key)) || fallback;
    try {
      const moduleHistory = await AdvancedHistoryStore.getModule(moduleId, { includeExpired: true });
      const captureData = moduleHistory.find(c => c.id === captureId);

      if (!captureData) {
        NotificationHelper.error(_trCC('captureNotFound', 'Capture not found'));
        return;
      }

      await AdvancedUtils.copyToClipboard(JSON.stringify(captureData, null, 2));
      NotificationHelper.success(_trCC('captureDataCopied', 'Capture data copied to clipboard'));
    } catch (error) {
      Logger.error('UI', '[Advanced] Error copying capture:', error);
      NotificationHelper.error(_trCC('failedCopyCaptureData', 'Failed to copy capture data'));
    }
  };


  /**
   * Delete single capture
   * @param {string} moduleId - Module ID
   * @param {string} captureId - Capture ID
   */
Advanced.prototype.deleteSingleCapture = async function(moduleId, captureId) {
    const _tDC = (typeof I18n !== 'undefined') ? I18n : null;
    const _trDC = (key, fallback) => (_tDC && _tDC.get(key)) || fallback;
    try {
      await AdvancedHistoryStore.deleteCapture(moduleId, captureId);

      NotificationHelper.success(_trDC('captureDeleted', 'Capture deleted'));

      await this.renderUnifiedCaptureHistory();
      await this.updateCaptureCountBadge();
    } catch (error) {
      Logger.error('UI', '[Advanced] Error deleting capture:', error);
      NotificationHelper.error(_trDC('failedDeleteCapture', 'Failed to delete capture'));
    }
  };


  /**
   * Export all filtered captures
   */
Advanced.prototype.exportCaptures = async function() {
    try {
      const currentSite = await this.getCurrentSite();
      const allHistory = await AdvancedHistoryStore.load();

      // Collect all captures
      const allCaptures = [];
      Object.entries(allHistory).forEach(([moduleId, moduleHistory]) => {
        if (Array.isArray(moduleHistory)) {
          moduleHistory.forEach(capture => {
            allCaptures.push({
              ...capture,
              moduleId,
              moduleName: this.getModuleName(moduleId),
              site: capture.url ? new URL(capture.url).hostname : 'unknown'
            });
          });
        }
      });

      // Apply current filters
      const filteredCaptures = this.applyFilters(allCaptures, currentSite);

      const _tEX = (typeof I18n !== 'undefined') ? I18n : null;
      const _trEX = (key, fallback) => (_tEX && _tEX.get(key)) || fallback;
      if (filteredCaptures.length === 0) {
        NotificationHelper.warning(_trEX('noCapturesToExport', 'No captures to export'));
        return;
      }

      // Export as JSON
      const exportData = {
        exported: new Date().toISOString(),
        count: filteredCaptures.length,
        filters: this.captureFilters,
        captures: filteredCaptures
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scrapfly-captures-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const _tFmt = (typeof I18n !== 'undefined') ? I18n : null;
      NotificationHelper.success((_tFmt && _tFmt.format('capturesExportedFmt', filteredCaptures.length)) || `Exported ${filteredCaptures.length} captures`);
    } catch (error) {
      Logger.error('UI', '[Advanced] Error exporting captures:', error);
      NotificationHelper.error(((typeof I18n !== 'undefined') && I18n.get('captureExportFailed')) || 'Failed to export captures');
    }
  };


  /**
   * Show warning confirmation modal
   * @param {string} message - Confirmation message
   * @param {string} title - Modal title
   * @returns {Promise<boolean>} True if confirmed, false if cancelled
   */
Advanced.prototype.showWarningConfirmation = function(message, title) {
    const modalTitle = title || _advHistoryTr('notifConfirmTitleDefault', 'Confirm');
    const acceptLabel = _advHistoryTr('advPanelBtnOk', 'OK');
    const cancelLabel = _advHistoryTr('btnCancel', 'Cancel');
    return new Promise((resolve) => {
      // Create modal HTML
      const modalHtml = `
        <div class="confirmation-modal-overlay" id="confirmationModalOverlay">
          <div class="confirmation-modal">
            <div class="confirmation-modal-header">
              <div class="confirmation-modal-icon"></div>
              <h3 class="confirmation-modal-title">${modalTitle}</h3>
            </div>
            <div class="confirmation-modal-content">
              <p class="confirmation-modal-message">${message}</p>
            </div>
            <div class="confirmation-modal-footer">
              <button class="confirmation-modal-btn confirmation-modal-btn-danger" id="confirmAcceptBtn">
                ${acceptLabel}
              </button>
              <button class="confirmation-modal-btn confirmation-modal-btn-cancel" id="confirmCancelBtn">
                ${cancelLabel}
              </button>
            </div>
          </div>
        </div>
      `;

      // Add modal to document
      document.body.insertAdjacentHTML('beforeend', modalHtml);

      const overlay = document.getElementById('confirmationModalOverlay');
      const cancelBtn = document.getElementById('confirmCancelBtn');
      const acceptBtn = document.getElementById('confirmAcceptBtn');

      // Handle cancel
      const handleCancel = () => {
        overlay.remove();
        resolve(false);
      };

      // Handle accept
      const handleAccept = () => {
        overlay.remove();
        resolve(true);
      };

      // Click handlers
      cancelBtn.addEventListener('click', handleCancel);
      acceptBtn.addEventListener('click', handleAccept);

      // Click on overlay background to cancel
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      });

      // ESC key to cancel
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handleEscape);
          handleCancel();
        }
      };
      document.addEventListener('keydown', handleEscape);

      // Focus accept button
      setTimeout(() => acceptBtn.focus(), 0);
    });
  };


  /**
   * Clear all captures
   */
Advanced.prototype.clearAllCaptures = async function() {
    const _tCA = (typeof I18n !== 'undefined') ? I18n : null;
    const _trCA = (key, fallback) => (_tCA && _tCA.get(key)) || fallback;
    try {
      const confirmed = await this.showWarningConfirmation(
        _trCA('clearAllCapturesConfirm', 'Are you sure you want to delete all captures? This cannot be undone.')
      );
      if (!confirmed) return;

      await AdvancedHistoryStore.clear();

      NotificationHelper.success(_trCA('allCapturesCleared', 'All captures cleared'));

      await this.renderUnifiedCaptureHistory();
      await this.updateCaptureCountBadge();
    } catch (error) {
      Logger.error('UI', '[Advanced] Error clearing captures:', error);
      NotificationHelper.error(_trCA('failedClearCaptures', 'Failed to clear captures'));
    }
  };


  /**
   * Reset all filters
   */
Advanced.prototype.resetAllFilters = async function() {
    this.captureFilters = {
      site: 'current',
      module: 'all',
      search: ''
    };

    // Update UI
    const siteFilter = document.querySelector('#captureSiteFilter');
    const moduleFilter = document.querySelector('#captureModuleFilter');
    const searchInput = document.querySelector('#captureSearchInput');

    if (siteFilter) siteFilter.value = 'current';
    if (moduleFilter) moduleFilter.value = 'all';
    if (searchInput) searchInput.value = '';

    // Re-render
    await this.renderUnifiedCaptureHistory();
  };


  /**
   * Setup capture history event listeners
   */
Advanced.prototype.setupCaptureHistoryListeners = function() {
    // Export button
    const exportBtn = document.querySelector('#exportCapturesBtn');
    if (exportBtn) {
      exportBtn.removeEventListener('click', this._exportHandler);
      this._exportHandler = () => this.exportCaptures();
      exportBtn.addEventListener('click', this._exportHandler);
    }

    // Clear all button
    const clearBtn = document.querySelector('#clearAllCapturesBtn');
    if (clearBtn) {
      clearBtn.removeEventListener('click', this._clearAllHandler);
      this._clearAllHandler = () => this.clearAllCaptures();
      clearBtn.addEventListener('click', this._clearAllHandler);
    }

    // Site filter
    const siteFilter = document.querySelector('#captureSiteFilter');
    if (siteFilter) {
      siteFilter.removeEventListener('change', this._siteFilterHandler);
      this._siteFilterHandler = (e) => {
        this.captureFilters.site = e.target.value;
        this.renderUnifiedCaptureHistory();
      };
      siteFilter.addEventListener('change', this._siteFilterHandler);
    }

    // Module filter
    const moduleFilter = document.querySelector('#captureModuleFilter');
    if (moduleFilter) {
      moduleFilter.removeEventListener('change', this._moduleFilterHandler);
      this._moduleFilterHandler = (e) => {
        this.captureFilters.module = e.target.value;
        this.renderUnifiedCaptureHistory();
      };
      moduleFilter.addEventListener('change', this._moduleFilterHandler);
    }

    // Search input (with debounce)
    const searchInput = document.querySelector('#captureSearchInput');
    if (searchInput) {
      searchInput.removeEventListener('input', this._searchHandler);
      let searchTimeout;
      this._searchHandler = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.captureFilters.search = e.target.value;
          this.renderUnifiedCaptureHistory();
        }, 300);
      };
      searchInput.addEventListener('input', this._searchHandler);
    }

  };


  /**
   * Get module display name from module ID
   * @param {string} moduleId - Module ID
   * @returns {string} Module display name
   */
Advanced.prototype.getModuleName = function(moduleId) {
    const moduleInfo = Advanced.AVAILABLE_MODULES[moduleId];
    return moduleInfo ? moduleInfo.productName : moduleId;
  };
