  /**
   * i18n helpers for the unified capture list (English fallback kept inline).
   */
function _advHistoryTr(key, fallback) {
    return (typeof I18n !== 'undefined' && I18n.get(key)) || fallback;
  }

/** A capture's site: its address's host name, or 'unknown' without one or with one that is not an address
 *  (one bad stored capture used to throw and leave Advanced → History empty). */
function _advCaptureSite(url) {
    if (!url) return 'unknown';
    try {
      return new URL(url).hostname || 'unknown';
    } catch (_) {
      return 'unknown';
    }
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
                site: _advCaptureSite(capture.url)
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
   * Keep the History badge in step with what is saved. A tool result
   * (Extract SiteKey, Obtain Selector…) is written straight to the store, so
   * the count used to change only when the History tab was opened. Any change
   * to the stored capture history (a tool result, a background capture, a
   * delete, an expiry) now refreshes it. Bound once.
   */
Advanced.prototype.setupCaptureHistoryWatcher = function() {
    if (this._captureHistoryWatcher || typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    const key = (typeof AdvancedHistoryStore !== 'undefined' && AdvancedHistoryStore.STORAGE_KEY) || 'scrapfly_advanced_history';
    // Captures of a private window are kept in memory (session storage), under a key of their own
    const privateKey = (typeof AdvancedHistoryStore !== 'undefined' && AdvancedHistoryStore.PRIVATE_KEY) || 'session_advanced_private';
    let timer = null;
    this._captureHistoryWatcher = (changes, area) => {
      if (!changes || !((area === 'local' && changes[key]) || (area === 'session' && changes[privateKey]))) return;
      // One refresh for a burst of writes; the refresh's own expiry clean-up
      // only writes when something expired, so it cannot loop
      clearTimeout(timer);
      timer = setTimeout(() => { void this.updateCaptureCountBadge(); }, 150);
    };
    chrome.storage.onChanged.addListener(this._captureHistoryWatcher);
  };


  /**
   * Clean expired captures from history (30 minute expiry)
   * Automatically removes captures that have passed their expiration time
   */
Advanced.prototype.cleanExpiredCaptureData = async function() {
    try {
      await AdvancedHistoryStore.pruneExpired();
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
        tool: 'all',
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
              site: _advCaptureSite(capture.url)
            });
          });
        }
      });

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
      this.updateCaptureScope(currentSite);
      // The chips offer the vendors and tools of the chosen sites only
      this.renderCaptureChips(this.applyFilters(allCaptures, currentSite, { siteOnly: true }));
      this.setupCaptureHistoryListeners();

      // After the chips: a chip whose vendor or tool left the chosen sites goes back to everything
      const filteredCaptures = this.applyFilters(allCaptures, currentSite);
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
Advanced.prototype.applyFilters = function(captures, currentSite, { siteOnly = false } = {}) {
    let filtered = [...captures];

    // Site filter
    if (this.captureFilters.site === 'current' && currentSite) {
      filtered = filtered.filter(c => c.site === currentSite);
    } else if (this.captureFilters.site !== 'all' && this.captureFilters.site !== 'current') {
      filtered = filtered.filter(c => c.site === this.captureFilters.site);
    }
    if (siteOnly) return filtered;

    // Module filter
    if (this.captureFilters.module !== 'all') {
      filtered = filtered.filter(c => c.moduleId === this.captureFilters.module);
    }

    // Tool filter: captures, or one kind of tool result
    if (this.captureFilters.tool && this.captureFilters.tool !== 'all') {
      filtered = filtered.filter(c => Advanced.captureKind(c) === this.captureFilters.tool);
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
// Cards that already have their listeners: a re-render never binds one twice
Advanced._boundCaptureCards = Advanced._boundCaptureCards || new WeakSet();

/**
 * Bind the cards of the Captures panel's own grid only: the vendor tools'
 * Captured Data list uses the same class and has its own handlers.
 * @param {ParentNode} grid - the #captureGrid the cards were rendered into
 */
Advanced.prototype.setupCaptureCardListeners = function(grid) {
    if (!grid || typeof grid.querySelectorAll !== 'function') return;
    const cards = grid.querySelectorAll('.capture-card');

    cards.forEach(card => {
      if (Advanced._boundCaptureCards.has(card)) return;
      Advanced._boundCaptureCards.add(card);
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
      const registryId = AdvancedVendorRegistry.registryKey(identity);
      const registry = Advanced.AVAILABLE_MODULES || {};
      if (!Object.hasOwn(registry, registryId)) {
        NotificationHelper.info(_trAH('captureDetailsUnavailable', 'Details view not available for this module'));
        return;
      }
      const storageIdentity = AdvancedVendorRegistry.canonical(registryId);
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

      const savedData = captureData.data !== undefined ? captureData.data : captureData.captureData;
      if (savedData && savedData.kind === 'cookies' && typeof moduleInstance.showSavedCookieResults === 'function') {
        // A "Check cookies" result: the same dialog the tool showed, with full values
        moduleInstance.showSavedCookieResults(captureData);
      } else if (savedData && savedData.tool && (savedData.schemaVersion === 1 || Array.isArray(savedData.lines)) && typeof moduleInstance.renderToolResultContent === 'function') {
        // Structured tool results and legacy text results share their history renderer.
        moduleInstance.displayCaptureDetailsModal(captureData.id, moduleInstance.renderToolResultContent(captureData));
      } else if (typeof moduleInstance.renderCaptureDetailsContent === 'function' && typeof moduleInstance.displayCaptureDetailsModal === 'function') {
        // Transform capture data to match module expectations
        // Storage format: { id, timestamp, url, data, expiresAt }
        // Module expects: { timestamp, url, captureData, ... }
        const transformedCaptureData = {
          ...captureData,
          captureData: captureData.data !== undefined ? captureData.data : (captureData.captureData || {})
        };

        const detailsContent = moduleInstance.renderCaptureDetailsContent(transformedCaptureData);
        moduleInstance.displayCaptureDetailsModal(captureData.id, detailsContent, { copyData: transformedCaptureData.captureData });
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
              site: _advCaptureSite(capture.url)
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
   * Ask before a destructive action, in the popup's shared dialog
   * (NotificationHelper.confirm): red action, focus starts on Cancel
   * @param {string} message - Confirmation message
   * @param {string} [title] - Dialog title
   * @param {string} [confirmText] - Label of the destructive button
   * @returns {Promise<boolean>} True if confirmed, false if cancelled
   */
Advanced.prototype.showWarningConfirmation = function(message, title, confirmText) {
    return NotificationHelper.confirm({
      title: title || _advHistoryTr('notifConfirmTitleDefault', 'Confirm'),
      message,
      confirmText: confirmText || _advHistoryTr('advPanelBtnOk', 'OK'),
      cancelText: _advHistoryTr('btnCancel', 'Cancel'),
      type: 'danger'
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
        _trCA('clearAllCapturesConfirm', 'Are you sure you want to delete all captures? This cannot be undone.'),
        _trCA('advConfirmClearAllTitle', 'Clear All Captured Data?'),
        _trCA('btnClearData', 'Clear Data')
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
      tool: 'all',
      search: ''
    };

    const searchInput = document.querySelector('#captureSearchInput');
    if (searchInput) searchInput.value = '';

    // Re-render
    await this.renderUnifiedCaptureHistory();
  };


  /**
   * Setup capture history event listeners
   */
Advanced.prototype.setupCaptureHistoryListeners = function() {
    // Bound once: the panel's controls stay in the DOM across renders
    const panel = document.querySelector('#capturesPanel');
    if (!panel || panel.dataset.controlsBound === 'true') {
      this.bindCaptureSearch();
      return;
    }
    panel.dataset.controlsBound = 'true';

    // "…" menu: Export captures, Clear all captures
    const menuBtn = document.querySelector('#captureMenuBtn');
    const menu = document.querySelector('#captureMenu');
    if (menuBtn && menu) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu.hidden) this.openCaptureMenu(menu, menuBtn); else this.closeCaptureMenu();
      });
      menu.addEventListener('keydown', (e) => {
        const items = [...menu.querySelectorAll('.history-menu-item')];
        const at = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        } else if (e.key === 'Escape' || e.key === 'Tab') {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
          this.closeCaptureMenu(e.key === 'Escape');
        }
      });
      document.addEventListener('click', (e) => {
        if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) this.closeCaptureMenu();
      });
    }
    document.querySelector('#exportCapturesBtn')?.addEventListener('click', () => { this.closeCaptureMenu(); this.exportCaptures(); });
    document.querySelector('#clearAllCapturesBtn')?.addEventListener('click', () => { this.closeCaptureMenu(); this.clearAllCaptures(); });

    // Current site / All sites
    document.querySelectorAll('.cap-scope-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const site = button.dataset.site === 'all' ? 'all' : 'current';
        if (this.captureFilters.site === site) return;
        this.captureFilters.site = site;
        this.renderUnifiedCaptureHistory();
      });
    });

    // Vendor and tool chips: one of each group at a time; the pressed one again shows everything
    document.querySelector('#captureChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.cap-chip');
      if (!chip) return;
      const group = chip.dataset.filterGroup;
      if (group !== 'module' && group !== 'tool') return;
      const value = chip.dataset.filterValue;
      this.captureFilters[group] = this.captureFilters[group] === value ? 'all' : value;
      this.renderUnifiedCaptureHistory();
    });

    this.bindCaptureSearch();
  };

/** Open the "…" menu under its button (fixed, so the list never clips it), focus its first item. */
Advanced.prototype.openCaptureMenu = function(menu, anchor) {
    menu.hidden = false;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    let top = anchorRect.bottom + 4;
    if (top + menuRect.height > viewportHeight - 4) top = Math.max(4, anchorRect.top - 4 - menuRect.height);
    menu.style.top = `${top}px`;
    menu.style.left = `${Math.min(Math.max(4, anchorRect.right - menuRect.width), viewportWidth - menuRect.width - 4)}px`;
    anchor.setAttribute('aria-expanded', 'true');
    anchor.classList.add('active');
    menu.querySelector('.history-menu-item')?.focus();
  };

Advanced.prototype.closeCaptureMenu = function(returnFocus = false) {
    const menu = document.querySelector('#captureMenu');
    const anchor = document.querySelector('#captureMenuBtn');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    anchor?.setAttribute('aria-expanded', 'false');
    anchor?.classList.remove('active');
    if (returnFocus) anchor?.focus();
  };

Advanced.prototype.bindCaptureSearch = function() {
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
