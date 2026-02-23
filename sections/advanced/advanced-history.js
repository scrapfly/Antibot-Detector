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
            Logger.ui(`[Advanced] Cleaned ${removedCount} expired captures from ${moduleId}`);
          }
        }
      });

      // Save cleaned history if any items were removed
      if (hadExpiredData) {
        await AdvancedHistoryStore.save(allHistory);
        Logger.ui('[Advanced] ✓ Expired capture data cleaned and saved');
      }
    } catch (error) {
      Logger.error('UI', '[Advanced] Error cleaning expired captures:', error);
    }
  };


  /**
   * Render unified capture history from all modules with filters and search
   */
Advanced.prototype.renderUnifiedCaptureHistory = async function() {
    Logger.ui('[Advanced] Rendering unified capture history');
    const capturesPanel = document.querySelector('#capturesPanel');
    if (!capturesPanel) return;

    // Initialize filter state if not exists
    if (!this.captureFilters) {
      this.captureFilters = {
        site: 'current',
        module: 'all',
        date: 'all',
        sort: 'newest',
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

      // Render no results if filtered out everything
      if (filteredCaptures.length === 0 && allCaptures.length > 0) {
        this.renderNoResults(capturesPanel);
        return;
      }

      // Setup site filter options
      this.updateSiteFilterOptions(allCaptures, currentSite);

      // Update filter banner
      this.updateFilterBanner(currentSite);

      // Render filtered captures
      this.renderCaptureCards(filteredCaptures, capturesPanel);

      // Setup event listeners
      this.setupCaptureHistoryListeners();

    } catch (error) {
      Logger.error('UI', '[Advanced] Error rendering unified capture history:', error);
      capturesPanel.innerHTML = `
        <div class="error-state">
          <p>Error loading captures: ${error.message}</p>
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

    // Date filter
    if (this.captureFilters.date !== 'all') {
      const now = Date.now();
      const ranges = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };
      const range = ranges[this.captureFilters.date];
      if (range) {
        filtered = filtered.filter(c => (now - c.timestamp) <= range);
      }
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

    // Sort
    switch (this.captureFilters.sort) {
      case 'newest':
        filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        break;
      case 'oldest':
        filtered.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        break;
      case 'site':
        filtered.sort((a, b) => (a.site || '').localeCompare(b.site || ''));
        break;
      case 'module':
        filtered.sort((a, b) => (a.moduleName || '').localeCompare(b.moduleName || ''));
        break;
      case 'size':
        filtered.sort((a, b) => {
          const sizeA = JSON.stringify(a.data || {}).length;
          const sizeB = JSON.stringify(b.data || {}).length;
          return sizeB - sizeA;
        });
        break;
    }

    return filtered;
  };


  /**
   * Update filter info banner
   * @param {string} currentSite - Current site hostname
   */
Advanced.prototype.updateFilterBanner = function(currentSite) {
    const banner = document.querySelector('#captureFilterBanner');
    const bannerText = document.querySelector('#filterBannerText');

    if (!banner || !bannerText) return;

    if (this.captureFilters.site === 'current' && currentSite) {
      banner.style.display = 'flex';
      // Use safe DOM manipulation to avoid XSS
      bannerText.textContent = '';
      bannerText.appendChild(document.createTextNode('Showing captures from '));
      const strong = document.createElement('strong');
      strong.textContent = currentSite;
      bannerText.appendChild(strong);
    } else if (this.captureFilters.site !== 'all' && this.captureFilters.site !== 'current') {
      banner.style.display = 'flex';
      // Use safe DOM manipulation to avoid XSS
      bannerText.textContent = '';
      bannerText.appendChild(document.createTextNode('Showing captures from '));
      const strong = document.createElement('strong');
      strong.textContent = this.captureFilters.site;
      bannerText.appendChild(strong);
    } else {
      banner.style.display = 'none';
    }
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
    let optionsHtml = `
      <option value="all">All Sites</option>
      <option value="current" ${this.captureFilters.site === 'current' ? 'selected' : ''} data-site="${currentSite || ''}">
        Current Site ${currentSite ? `(${currentSite})` : ''}
      </option>
    `;

    siteFilter.innerHTML = optionsHtml;
  };


  /**
   * Render empty state
   * @param {HTMLElement} container - Container element
   */
Advanced.prototype.renderEmptyState = function(container) {
    container.innerHTML = `
      <div id="captureEmptyState" class="empty-state">
        <div class="empty-state-card">
          <div class="empty-state-icon">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <path d="M28 10L12 18V28C12 38 18 46 28 48C38 46 44 38 44 28V18L28 10Z" stroke="#3b82f6" stroke-width="2" fill="rgba(59,130,246,0.1)"/>
              <circle cx="28" cy="28" r="8" fill="#3b82f6"/>
            </svg>
          </div>
          <h3 class="empty-state-title">No captures yet</h3>
          <p class="empty-state-text">Use the Tools tab to capture data from detected anti-bot systems, CAPTCHAs, and fingerprinting technologies.</p>
          <div class="empty-state-footnote">Captures are stored for 30 minutes</div>
        </div>
      </div>
    `;
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
        <h3 class="no-results-title">No captures found</h3>
        <p class="no-results-text">Try adjusting your filters or search query to find captures.</p>
        <button id="resetAllFiltersBtn" class="reset-filters-btn">Reset All Filters</button>
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

    const capturesHtml = captures.map(capture => {
      const moduleName = capture.moduleName || capture.moduleId || 'Unknown';
      const moduleClass = capture.moduleId || 'unknown';
      const timestamp = AdvancedUtils.getTimeAgo(capture.timestamp);
      const url = capture.url || 'No URL';
      const site = capture.site || 'unknown';
      const size = AdvancedUtils.formatBytes(JSON.stringify(capture.data || {}).length);
      const favicon = UrlUtils.resolveDisplayFavicon(capture.favicon, url || capture.hostname);

      return `
        <div class="capture-card" data-module-id="${capture.moduleId}" data-capture-id="${capture.id}">
          <div class="capture-card-header">
            <div class="capture-card-badges">
              <span class="capture-module-badge ${moduleClass}">${moduleName}</span>
              <span class="capture-site-badge">${site}</span>
            </div>
          </div>
          <div class="capture-card-body">
            <div class="capture-url-row">
              <img src="${favicon}" class="capture-url-favicon" alt="Favicon" data-fallback="${UrlUtils.getDefaultFaviconUrl()}">
              <span class="capture-url-text" title="${AdvancedUtils.escapeHtml(url)}">${AdvancedUtils.truncate(url, 60)}</span>
            </div>
            <div class="capture-meta-row">
              <span class="capture-size">${size}</span>
              <span class="capture-timestamp">${timestamp}</span>
            </div>
          </div>
          <div class="capture-card-actions">
            <button class="capture-action-btn view-btn" data-action="view">
              <svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/></svg>
              View
            </button>
            <button class="capture-action-btn copy-btn" data-action="copy">
              <svg width="14" height="14" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/></svg>
              Copy
            </button>
            <button class="capture-action-btn delete-btn" data-action="delete">
              <svg width="14" height="14" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/></svg>
              Delete
            </button>
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
    try {
      // Get capture data (auto-migrated by store)
      const allHistory = await AdvancedHistoryStore.load();

      const moduleHistory = allHistory[moduleId] || [];
      const captureData = moduleHistory.find(c => c.id === captureId);

      if (!captureData) {
        NotificationHelper.error('Capture not found');
        return;
      }

      // Load the module instance if needed
      if (!this.loadedModules[moduleId]) {
        // Create a temporary detection object for viewing captures
        const detector = this.detectorManager.findDetectorById(moduleId);
        if (!detector) {
          NotificationHelper.error('Detector not found: ' + moduleId);
          return;
        }

        const tempDetection = {
          detector: detector,
          confidence: 100,
          methods: []
        };

        await this.loadDetectionModule(moduleId, tempDetection);
      }

      const moduleInstance = this.loadedModules[moduleId];
      if (!moduleInstance) {
        NotificationHelper.error('Module class not found. Please ensure the module is properly loaded.');
        return;
      }

      if (moduleInstance.renderCaptureDetailsContent && moduleInstance.displayCaptureDetailsModal) {
        // Transform capture data to match module expectations
        // Storage format: { id, timestamp, url, data, expiresAt }
        // Module expects: { timestamp, url, captureData, ... }
        const transformedCaptureData = {
          timestamp: captureData.timestamp,
          url: captureData.url,
          captureData: captureData.data || {},
          ...captureData  // Include all other properties for module-specific use
        };

        const detailsContent = moduleInstance.renderCaptureDetailsContent(transformedCaptureData);
        moduleInstance.displayCaptureDetailsModal(captureData.id, detailsContent);
      } else {
        NotificationHelper.info('Details view not available for this module');
      }
    } catch (error) {
      Logger.error('UI', '[Advanced] Error viewing capture details:', error);
      NotificationHelper.error('Failed to view capture details');
    }
  };


  /**
   * Copy capture data to clipboard
   * @param {string} moduleId - Module ID
   * @param {string} captureId - Capture ID
   */
Advanced.prototype.copyCaptureData = async function(moduleId, captureId) {
    try {
      const moduleHistory = await AdvancedHistoryStore.getModule(moduleId, { includeExpired: true });
      const captureData = moduleHistory.find(c => c.id === captureId);

      if (!captureData) {
        NotificationHelper.error('Capture not found');
        return;
      }

      await AdvancedUtils.copyToClipboard(JSON.stringify(captureData, null, 2));
      NotificationHelper.success('Capture data copied to clipboard');
    } catch (error) {
      Logger.error('UI', '[Advanced] Error copying capture:', error);
      NotificationHelper.error('Failed to copy capture data');
    }
  };


  /**
   * Delete single capture
   * @param {string} moduleId - Module ID
   * @param {string} captureId - Capture ID
   */
Advanced.prototype.deleteSingleCapture = async function(moduleId, captureId) {
    try {
      await AdvancedHistoryStore.deleteCapture(moduleId, captureId);

      NotificationHelper.success('Capture deleted');

      // Re-render
      await this.renderUnifiedCaptureHistory();
      await this.updateCaptureCountBadge();
    } catch (error) {
      Logger.error('UI', '[Advanced] Error deleting capture:', error);
      NotificationHelper.error('Failed to delete capture');
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

      if (filteredCaptures.length === 0) {
        NotificationHelper.warning('No captures to export');
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

      NotificationHelper.success(`Exported ${filteredCaptures.length} captures`);
    } catch (error) {
      Logger.error('UI', '[Advanced] Error exporting captures:', error);
      NotificationHelper.error('Failed to export captures');
    }
  };


  /**
   * Show warning confirmation modal
   * @param {string} message - Confirmation message
   * @param {string} title - Modal title
   * @returns {Promise<boolean>} True if confirmed, false if cancelled
   */
Advanced.prototype.showWarningConfirmation = function(message, title = 'Mensaje de la extensión Scrapfly') {
    return new Promise((resolve) => {
      // Create modal HTML
      const modalHtml = `
        <div class="confirmation-modal-overlay" id="confirmationModalOverlay">
          <div class="confirmation-modal">
            <div class="confirmation-modal-header">
              <div class="confirmation-modal-icon"></div>
              <h3 class="confirmation-modal-title">${title}</h3>
            </div>
            <div class="confirmation-modal-content">
              <p class="confirmation-modal-message">${message}</p>
            </div>
            <div class="confirmation-modal-footer">
              <button class="confirmation-modal-btn confirmation-modal-btn-cancel" id="confirmCancelBtn">
                Cancelar
              </button>
              <button class="confirmation-modal-btn confirmation-modal-btn-danger" id="confirmAcceptBtn">
                Aceptar
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
    try {
      // Show warning confirmation modal
      const confirmed = await this.showWarningConfirmation(
        'Are you sure you want to delete all captures? This cannot be undone.'
      );
      if (!confirmed) return;

      await AdvancedHistoryStore.clear();

      NotificationHelper.success('All captures cleared');

      // Re-render
      await this.renderUnifiedCaptureHistory();
      await this.updateCaptureCountBadge();
    } catch (error) {
      Logger.error('UI', '[Advanced] Error clearing captures:', error);
      NotificationHelper.error('Failed to clear captures');
    }
  };


  /**
   * Reset all filters
   */
Advanced.prototype.resetAllFilters = async function() {
    this.captureFilters = {
      site: 'current',
      module: 'all',
      date: 'all',
      sort: 'newest',
      search: ''
    };

    // Update UI
    const siteFilter = document.querySelector('#captureSiteFilter');
    const moduleFilter = document.querySelector('#captureModuleFilter');
    const sortFilter = document.querySelector('#captureSortFilter');
    const searchInput = document.querySelector('#captureSearchInput');

    if (siteFilter) siteFilter.value = 'current';
    if (moduleFilter) moduleFilter.value = 'all';
    if (sortFilter) sortFilter.value = 'newest';
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

    // Date filter removed from UI
    // const dateFilter = document.querySelector('#captureDateFilter');
    // if (dateFilter) {
    //   dateFilter.removeEventListener('change', this._dateFilterHandler);
    //   this._dateFilterHandler = (e) => {
    //     this.captureFilters.date = e.target.value;
    //     this.renderUnifiedCaptureHistory();
    //   };
    //   dateFilter.addEventListener('change', this._dateFilterHandler);
    // }

    // Sort filter
    const sortFilter = document.querySelector('#captureSortFilter');
    if (sortFilter) {
      sortFilter.removeEventListener('change', this._sortFilterHandler);
      this._sortFilterHandler = (e) => {
        this.captureFilters.sort = e.target.value;
        this.renderUnifiedCaptureHistory();
      };
      sortFilter.addEventListener('change', this._sortFilterHandler);
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

    // Show all sites button
    const showAllBtn = document.querySelector('#showAllSitesBtn');
    if (showAllBtn) {
      showAllBtn.removeEventListener('click', this._showAllHandler);
      this._showAllHandler = () => {
        this.captureFilters.site = 'all';
        const siteFilter = document.querySelector('#captureSiteFilter');
        if (siteFilter) siteFilter.value = 'all';
        this.renderUnifiedCaptureHistory();
      };
      showAllBtn.addEventListener('click', this._showAllHandler);
    }
  };


  /**
   * Get module display name from module ID
   * @param {string} moduleId - Module ID
   * @returns {string} Module display name
   */
Advanced.prototype.getModuleName = function(moduleId) {
    const moduleInfo = Advanced.AVAILABLE_MODULES[moduleId];
    return moduleInfo ? moduleInfo.displayName.replace(' Tools', '') : moduleId;
  };
