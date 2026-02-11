// Fingerprint SVG icons mapping for history modal
const FINGERPRINT_ICONS = {
  'audio_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M8 6v12M4 9v6M16 6v12M20 9v6"/></svg>',
  'battery_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 11v2M10 11v2M14 11v2"/></svg>',
  'canvas_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h4l2-3 2 6 2-3h2"/></svg>',
  'clipboard_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
  'crypto_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>',
  'css_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 3h16l-1.5 15L12 21l-6.5-3L4 3z"/><path d="M8 8h8M7 12h6"/></svg>',
  'font_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
  'gamepads_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="4"/><circle cx="8" cy="12" r="2"/><path d="M15 10v4M13 12h4"/></svg>',
  'geolocation_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  'hardware_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>',
  'indexeddb_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>',
  'media_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><polygon points="10,8 16,11 10,14" fill="currentColor"/></svg>',
  'navigator_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="none"/></svg>',
  'orientation_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/><path d="M9 6h6"/></svg>',
  'performance_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2"/></svg>',
  'screen_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  'storage_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3M4 20v-3h16v3M4 7v10h16V7"/><path d="M4 11h16M4 15h16"/><circle cx="7" cy="9" r="1" fill="currentColor"/></svg>',
  'timezone_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/></svg>',
  'usb_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v10M7 7l5 5 5-5"/><circle cx="12" cy="16" r="2"/><path d="M6 12v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"/></svg>',
  'webgl_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
  'webrtc_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 10l5-5M20 10V5h-5"/><path d="M9 14l-5 5M4 14v5h5"/><circle cx="12" cy="12" r="3"/></svg>'
};

class History {
  constructor(detectorManager) {
    this.detectorManager = detectorManager;
    this.historyItems = [];
    this.searchQuery = '';
    this.initialized = false;
    this.listenersAttached = false;
    this.paginationManager = null;
    this.historyLimit = 0; // 0 = unlimited (matches settings default)
  }

  /**
   * Display history items from storage
   */
  async displayHistory() {
    Logger.ui('History.displayHistory called');

    // Ensure HTML is loaded
    if (!this.initialized) {
      await this.initialize();
    }

    await this.refreshHistoryLimit();

    try {
      await this.loadHistoryFromStorage();
      this.renderHistory();
    } catch (error) {
      Logger.error('UI', 'Failed to display history:', error);
      this.showEmptyState();
    }
  }

  /**
   * Load history from Chrome storage
   */
  async loadHistoryFromStorage() {
    try {
      const result = await chrome.storage.local.get(['scrapfly_history']);

      if (result.scrapfly_history) {
        const historyData = JSON.parse(result.scrapfly_history);
        this.historyItems = historyData.items || [];
        if (this.historyLimit > 0 && this.historyItems.length > this.historyLimit) {
          this.historyItems = this.historyItems.slice(0, this.historyLimit);
        }
        Logger.ui('Loaded history items:', this.historyItems.length);
      } else {
        this.historyItems = [];
      }
    } catch (error) {
      Logger.error('UI', 'Failed to load history from storage:', error);
      this.historyItems = [];
    }
  }

  /**
   * Save history to Chrome storage
   */
  async saveHistoryToStorage() {
    try {
      const historyData = {
        timestamp: new Date().toISOString(),
        items: this.historyItems
      };

      await chrome.storage.local.set({
        'scrapfly_history': JSON.stringify(historyData, null, 2)
      });

      Logger.ui('History saved to storage');
    } catch (error) {
      Logger.error('UI', 'Failed to save history to storage:', error);
    }
  }

  /**
   * Add a new detection result to history
   * @param {object} detection - Detection result object
   * @param {string} url - URL where detection occurred
   * @param {string} title - Page title
   * @param {string} favicon - Page favicon URL
   */
  async addHistoryItem(detection, url, title = '', favicon = '') {
    const historyItem = {
      id: Date.now().toString(),
      url,
      title: title || url,
      favicon,
      timestamp: new Date().toISOString(),
      detections: Array.isArray(detection) ? detection : [detection],
      totalDetections: Array.isArray(detection) ? detection.length : 1
    };

    // Add to beginning of array (newest first)
    this.historyItems.unshift(historyItem);

    // Apply configured history limit (0 = unlimited)
    if (this.historyLimit > 0 && this.historyItems.length > this.historyLimit) {
      this.historyItems = this.historyItems.slice(0, this.historyLimit);
    }

    await this.saveHistoryToStorage();
    Logger.ui('Added history item:', historyItem);
  }

  /**
   * Render history items in the UI
   */
  renderHistory() {
    if (this.historyItems.length === 0) {
      this.showEmptyState();
      return;
    }

    // Hide empty state
    const historyEmpty = document.querySelector('#historyEmpty');
    if (historyEmpty) historyEmpty.style.display = 'none';

    // Filter items if search query exists
    const itemsToShow = this.searchQuery
      ? this.getFilteredItems()
      : this.historyItems;

    // Use pagination to display items
    if (this.paginationManager) {
      this.paginationManager.setItems(itemsToShow);
    }

    // Ensure pagination is visible
    const historyPagination = document.querySelector('#historyPagination');
    if (historyPagination && itemsToShow.length > 0) {
      historyPagination.style.display = 'flex';
    }
  }

  /**
   * Render history page items (called by pagination manager)
   * @param {Array} items - History items for current page
   */
  renderHistoryPage(items) {
    const historyList = document.querySelector('#historyList');
    if (!historyList) {
      Logger.error('UI', 'History list element not found');
      return;
    }

    historyList.style.display = 'block';

    const buildHistoryItemHtml = (item) => {
      const timeAgo = this.getTimeAgo(new Date(item.timestamp));
      const domain = this.getDomainFromUrl(item.url);

      // Use Scrapfly icon as default for favicon
      const faviconSrc = item.favicon || chrome.runtime.getURL('icons/icon16.png');

      return `
        <div class="history-item" data-history-id="${item.id}">
          <div class="history-item-top">
            <div class="history-item-content">
              <div class="history-header-info">
                <img src="${faviconSrc}" alt="Favicon" class="history-favicon" data-fallback="${chrome.runtime.getURL('icons/icon16.png')}">
                <div class="history-url" title="${item.url || ''}">${domain}</div>
              </div>
              <div class="history-title" title="${item.title || 'Untitled'}">${item.title || 'Untitled'}</div>
            </div>
            <div class="history-item-right">
              <div class="history-item-actions">
                <button class="history-item-action-btn history-copy-btn" data-action="copy" title="Copy data">
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" fill="currentColor"/>
                  </svg>
                </button>
                <button class="history-item-action-btn history-export-btn" data-action="export" title="Export item">
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" fill="currentColor"/>
                  </svg>
                </button>
                <button class="history-item-action-btn history-delete-btn" data-action="delete" title="Delete item">
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          ${this.renderHistoryStats(item)}
          <div class="history-item-bottom">
            <div class="history-detections">
              ${this.renderHistoryDetections(item.detections || [], item.id)}
            </div>
            <div class="history-timestamp">${timeAgo}</div>
          </div>
        </div>
      `;
    };

    const finalizeRender = () => {
      if (renderToken !== this._historyRenderToken) {
        return;
      }

      // CSP-compliant image error fallback
      historyList.querySelectorAll('img[data-fallback]').forEach(img => {
        img.addEventListener('error', function() {
          this.src = this.dataset.fallback;
        }, { once: true });
      });

      // Add click handlers for history items
      this.setupHistoryItemHandlers();
      this.setupOverflowBadgeHandlers();
    };

    this._historyRenderToken = (this._historyRenderToken || 0) + 1;
    const renderToken = this._historyRenderToken;
    const shouldBatchRender = items.length > 40;

    if (!shouldBatchRender) {
      let historyHtml = '';
      items.forEach(item => {
        historyHtml += buildHistoryItemHtml(item);
      });
      historyList.innerHTML = historyHtml;
      finalizeRender();
      return;
    }

    historyList.innerHTML = '';
    const batchSize = 10;
    let offset = 0;

    const renderBatch = () => {
      if (renderToken !== this._historyRenderToken) {
        return;
      }

      const slice = items.slice(offset, offset + batchSize);
      let batchHtml = '';
      slice.forEach(item => {
        batchHtml += buildHistoryItemHtml(item);
      });
      historyList.insertAdjacentHTML('beforeend', batchHtml);
      offset += batchSize;

      if (offset < items.length) {
        requestAnimationFrame(renderBatch);
      } else {
        finalizeRender();
      }
    };

    renderBatch();
  }

  /**
   * Render detection tags for a history item
   * @param {Array} detections - Array of detections
   * @returns {string} HTML string for detection tags
   */
  renderHistoryDetections(detections, itemId) {
    if (!detections || detections.length === 0) {
      return '<span class="history-detection-tag">No detections</span>';
    }

    let tagsHtml = '';
    const maxTags = 6; // Show 6 icons + "+N" badge to fit in one row

    // Sort detections by priority: Anti-Bot > CAPTCHA > Fingerprinting
    const categoryPriority = {
      'Anti-Bot': 1,
      'antibot': 1,
      'anti-bot': 1,
      'CAPTCHA': 2,
      'captcha': 2,
      'Fingerprint': 3,
      'fingerprint': 3,
      'Fingerprinting': 3
    };

    const sortedDetections = [...detections].sort((a, b) => {
      const catA = a.category || '';
      const catB = b.category || '';
      const priorityA = categoryPriority[catA] || 999;
      const priorityB = categoryPriority[catB] || 999;
      return priorityA - priorityB;
    });

    // Helper function to get category color
    const getCategoryColor = (category) => {
      const cat = category?.toLowerCase() || '';
      if (cat.includes('antibot') || cat.includes('anti-bot')) return '#FF5733';
      if (cat.includes('captcha')) return '#33C3FF';
      if (cat.includes('fingerprint')) return '#3b82f6';
      return '#666666';
    };

    sortedDetections.slice(0, maxTags).forEach(detection => {
      const name = detection.detector?.name || detection.detector || 'Unknown';
      const category = detection.category || '';
      const categoryColor = getCategoryColor(category);
      const tooltipText = `${name}${category ? ' (' + category + ')' : ''}`;

      // Get detector object to retrieve icon
      let detectorObj = null;
      let iconHtml = '';

      if (this.detectorManager && category && name !== 'Unknown') {
        detectorObj = this.detectorManager.getDetectorByName(category, name);

        if (!detectorObj) {
          // Try with normalized category names
          const categoryMappings = {
            'Anti-Bot': 'antibot',
            'antibot': 'antibot',
            'CAPTCHA': 'captcha',
            'captcha': 'captcha',
            'Fingerprint': 'fingerprint',
            'fingerprint': 'fingerprint'
          };
          const normalizedCategory = categoryMappings[category] || category.toLowerCase().replace(/[^a-z]/g, '');
          detectorObj = this.detectorManager.getDetectorByName(normalizedCategory, name);
        }
      }

      // Generate icon HTML
      let isFingerprint = false;
      if (detectorObj && detectorObj.icon) {
        const iconName = detectorObj.icon.toLowerCase();
        // Check if it's a fingerprint SVG icon
        if (FINGERPRINT_ICONS[iconName]) {
          iconHtml = `<div class="detection-icon-svg fingerprint-icon">${FINGERPRINT_ICONS[iconName]}</div>`;
          isFingerprint = true;
        } else {
          const iconUrl = chrome.runtime.getURL(`detectors/icons/${detectorObj.icon}`);
          iconHtml = `<img src="${iconUrl}" alt="${name}" class="detection-icon">`;
        }
      } else {
        // Fallback: Use Scrapfly icon for all detectors without official icons
        const scrapflyIconUrl = chrome.runtime.getURL('icons/icon32.png');
        iconHtml = `<img src="${scrapflyIconUrl}" alt="${name}" class="detection-icon">`;
      }

      const badgeClass = isFingerprint ? 'history-detection-tag icon-badge fingerprint-badge' : 'history-detection-tag icon-badge';
      tagsHtml += `<span class="${badgeClass}" title="${tooltipText}" style="border-color: ${categoryColor};">${iconHtml}</span>`;
    });

    if (sortedDetections.length > maxTags) {
      const hiddenDetections = sortedDetections.slice(maxTags);
      const hiddenSummary = hiddenDetections
        .map(d => d.detector?.name || d.detector || 'Unknown')
        .join(', ');
      const tooltipAttr = hiddenSummary ? ` title="${hiddenSummary}"` : '';

      tagsHtml += `<span class="history-detection-tag more-detections" data-history-item-id="${itemId}"${tooltipAttr}>+${hiddenDetections.length}</span>`;
    }

    return tagsHtml;
  }

  /**
   * Calculate stats for a history item
   * @param {Array} detections - Array of detections
   * @returns {object} Stats object with totalDetections, avgConfidence, difficulty, difficultyColor
   */
  calculateHistoryStats(detections) {
    const totalDetections = detections?.length || 0;

    // Calculate average confidence
    let avgConfidence = 0;
    if (totalDetections > 0) {
      const totalConfidence = detections.reduce((sum, d) => sum + (d.confidence || 0), 0);
      avgConfidence = Math.round(totalConfidence / totalDetections);
    }

    const difficultyInfo = this.getDifficultyInfo(detections || [], avgConfidence);
    return { totalDetections, avgConfidence, difficulty: difficultyInfo.difficulty, difficultyColor: difficultyInfo.difficultyColor };
  }

  /**
   * Compute difficulty for a set of detections.
   * Escalates difficulty when multiple Anti-Bot/CAPTCHA detections appear,
   * or when high-tier providers are present (Shape Security, hCaptcha, Arkose Labs).
   * @param {Array} detections
   * @param {number} avgConfidence
   * @returns {{difficulty: string, difficultyColor: string}}
   */
  getDifficultyInfo(detections = [], avgConfidence = 0) {
    return DetectionUtils.getDifficultyInfo(detections, avgConfidence);
  }

  /**
   * Render stats row for a history item
   * @param {Object} item - History item with detections and cacheScope
   * @returns {string} HTML string for stats row
   */
  renderHistoryStats(item) {
    const detections = item.detections || [];
    const stats = this.calculateHistoryStats(detections);

    // Cache scope display names
    const scopeDisplayNames = {
      'domain': 'Domain',
      'path': 'Path',
      'url': 'Full URL'
    };
    const cacheScope = item.cacheScope || 'domain';
    const cacheScopeDisplay = scopeDisplayNames[cacheScope] || 'Domain';

    return `
      <div class="history-stats-line">
        <div class="history-stat-inline history-stat-detections">
          <div class="history-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div class="history-stat-content">
            <div class="history-stat-label">Detections</div>
            <div class="history-stat-value">${stats.totalDetections}</div>
          </div>
        </div>
        <div class="history-stat-inline history-stat-confidence">
          <div class="history-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div class="history-stat-content">
            <div class="history-stat-label">Confidence</div>
            <div class="history-stat-value">${stats.avgConfidence}%</div>
          </div>
        </div>
        <div class="history-stat-inline history-stat-difficulty">
          <div class="history-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div class="history-stat-content">
            <div class="history-stat-label">Difficulty</div>
            <div class="history-stat-value" style="color: ${stats.difficultyColor}">${stats.difficulty}</div>
          </div>
        </div>
        <div class="history-stat-inline history-stat-cache-scope">
          <div class="history-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20"/>
              <path d="M12 2a15 15 0 0 1 0 20" opacity="0.7"/>
              <path d="M12 2a15 15 0 0 0 0 20" opacity="0.7"/>
            </svg>
          </div>
          <div class="history-stat-content">
            <div class="history-stat-label">Scope</div>
            <div class="history-stat-value">${cacheScopeDisplay}</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Calculate category breakdown from detections
   * @param {Array} detections - Array of detections
   * @returns {object} Breakdown by category
   */
  calculateCategoryBreakdown(detections) {
    const breakdown = {
      antibot: 0,
      captcha: 0,
      fingerprint: 0
    };

    if (!detections || detections.length === 0) return breakdown;

    detections.forEach(d => {
      const cat = (d.category || '').toLowerCase();
      if (cat.includes('antibot') || cat.includes('anti-bot')) {
        breakdown.antibot++;
      } else if (cat.includes('captcha')) {
        breakdown.captcha++;
      } else if (cat.includes('fingerprint')) {
        breakdown.fingerprint++;
      }
    });

    return breakdown;
  }

  /**
   * Render category breakdown HTML for modal
   * @param {Array} detections - Array of detections
   * @returns {string} HTML string
   */
  renderCategoryBreakdown(detections) {
    const breakdown = this.calculateCategoryBreakdown(detections);
    let html = '<div class="history-modal-category-breakdown">';

    // SVG icons for each category
    const antibotIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
    const captchaIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><circle cx="12" cy="5" r="3"/><path d="M12 8v3"/></svg>';
    const fingerprintIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/><path d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2"/></svg>';

    if (breakdown.antibot > 0) {
      html += `<div class="history-modal-category-badge antibot">${antibotIcon}${breakdown.antibot} Anti-Bot${breakdown.antibot > 1 ? 's' : ''}</div>`;
    }
    if (breakdown.captcha > 0) {
      html += `<div class="history-modal-category-badge captcha">${captchaIcon}${breakdown.captcha} Captcha${breakdown.captcha > 1 ? 's' : ''}</div>`;
    }
    if (breakdown.fingerprint > 0) {
      html += `<div class="history-modal-category-badge fingerprint">${fingerprintIcon}${breakdown.fingerprint} Fingerprint${breakdown.fingerprint > 1 ? 's' : ''}</div>`;
    }

    // If no categories found, show total
    if (breakdown.antibot === 0 && breakdown.captcha === 0 && breakdown.fingerprint === 0) {
      const total = detections?.length || 0;
      html += `<div class="history-modal-category-badge">${total} Detection${total !== 1 ? 's' : ''}</div>`;
    }

    html += '</div>';
    return html;
  }

  /**
   * Setup click handlers for overflow badges
   */
  setupOverflowBadgeHandlers() {
    const badges = document.querySelectorAll('.more-detections');
    badges.forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent history item card click
        const historyItemId = badge.dataset.historyItemId;
        const item = this.historyItems.find(h => h.id === historyItemId);
        if (item) {
          this.showHistoryItemDetails(item);  // Open same modal as card click
        }
      });
    });
  }

  /**
   * Attach click handlers to detection cards in detail modal
   */
  attachDetailModalClickHandlers() {
    const cards = document.querySelectorAll('#historyModalContent .history-modal-detection-card.has-methods');

    cards.forEach(card => {
      const header = card.querySelector('.history-modal-detection-header');
      const methods = card.querySelector('.history-modal-detection-methods');

      if (header && methods) {
        // Toggle expand/collapse on header click
        header.style.cursor = 'pointer';
        header.addEventListener('click', () => {
          const isExpanded = card.classList.contains('expanded');

          if (isExpanded) {
            card.classList.remove('expanded');
            methods.style.display = 'none';
          } else {
            card.classList.add('expanded');
            methods.style.display = 'flex';
          }
        });

        // Initially hide methods
        methods.style.display = 'none';
      }
    });
  }

  /**
   * Show empty state when no history items exist
   */
  showEmptyState() {
    const historyList = document.querySelector('#historyList');
    const historyEmpty = document.querySelector('#historyEmpty');
    const historyPagination = document.querySelector('#historyPagination');

    if (historyList) historyList.style.display = 'none';
    if (historyEmpty) historyEmpty.style.display = 'flex';
    if (historyPagination) historyPagination.style.display = 'none';
  }

  /**
   * Clear all history items
   */
  async clearHistory() {
    try {
      this.historyItems = [];
      await chrome.storage.local.remove(['scrapfly_history']);
      this.showEmptyState();
      Logger.ui('History cleared');
      NotificationHelper.success('History cleared');
    } catch (error) {
      Logger.error('UI', 'Failed to clear history:', error);
      NotificationHelper.error('Failed to clear history: ' + error.message);
    }
  }

  /**
   * Handle search functionality
   * @param {string} query - Search query
   */
  handleSearch(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.renderHistory();
  }

  /**
   * Get filtered history items based on search query
   * @returns {Array} Filtered history items
   */
  getFilteredItems() {
    if (!this.searchQuery) return this.historyItems;

    return this.historyItems.filter(item => {
      const url = (item.url || '').toLowerCase();
      const title = (item.title || '').toLowerCase();
      const detectionNames = (item.detections || [])
        .map(d => (d.detector?.name || d.detector || '').toLowerCase())
        .join(' ');

      return url.includes(this.searchQuery) ||
             title.includes(this.searchQuery) ||
             detectionNames.includes(this.searchQuery);
    });
  }

  /**
   * Setup click handlers for history items
   */
  setupHistoryItemHandlers() {
    // Handle action button clicks (copy/export)
    document.querySelectorAll('.history-item-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = e.currentTarget.dataset.action;
        const historyItem = e.currentTarget.closest('.history-item');
        const historyId = historyItem.dataset.historyId;
        const item = this.historyItems.find(h => h.id === historyId);

        if (!item) return;

        if (action === 'copy') {
          this.copyHistoryItem(item);
        } else if (action === 'export') {
          this.exportHistoryItem(item);
        } else if (action === 'delete') {
          this.deleteHistoryItem(item);
        }
      });
    });

    // Handle history item click (open modal)
    document.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const historyId = e.currentTarget.dataset.historyId;
        const historyItem = this.historyItems.find(h => h.id === historyId);

        if (historyItem) {
          this.showHistoryItemDetails(historyItem);
        }
      });
    });
  }

  /**
   * Show detailed view of a history item
   * @param {object} historyItem - History item object
   */
  showHistoryItemDetails(historyItem) {
    Logger.ui('Showing details for history item:', historyItem);

    const modal = document.querySelector('#historyDetailModal');
    if (!modal) {
      Logger.error('UI', 'History detail modal not found');
      return;
    }

    // Populate modal header
    const favicon = document.querySelector('#historyModalFavicon');
    const title = document.querySelector('#historyModalTitle');
    const url = document.querySelector('#historyModalUrl');
    const timestamp = document.querySelector('#historyModalTimestamp');
    const detectionCount = document.querySelector('#historyModalDetectionCount');
    const content = document.querySelector('#historyModalContent');

    if (favicon) {
      const faviconUrl = historyItem.favicon || chrome.runtime.getURL('icons/icon16.png');
      favicon.src = faviconUrl;
      favicon.onerror = () => {
        favicon.src = chrome.runtime.getURL('icons/icon16.png');
      };
    }
    if (title) title.textContent = historyItem.title || 'Untitled';
    if (url) {
      url.textContent = historyItem.url;
      url.href = historyItem.url;
    }
    if (timestamp) {
      const timeAgo = this.getTimeAgo(new Date(historyItem.timestamp));
      const fullDate = new Date(historyItem.timestamp).toLocaleString();
      timestamp.innerHTML = `<span class="time-ago">${timeAgo}</span><span class="time-full">(${fullDate})</span>`;
    }
    if (detectionCount) {
      // Replace simple count with category breakdown
      detectionCount.innerHTML = this.renderCategoryBreakdown(historyItem.detections || []);
    }

    // Render detections in modal
    if (content) {
      content.innerHTML = this.renderDetectionDetails(historyItem.detections || []);
    }

    // FIX: Attach click handlers to expand/collapse detection cards
    this.attachDetailModalClickHandlers();

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Setup close handlers
    this.setupModalCloseHandlers();

    // Setup copy and export handlers
    this.setupModalActionHandlers(historyItem);

    // Setup copy handlers for individual method items
    this.setupMethodCopyHandlers();
  }

  /**
   * Setup copy and export handlers for modal
   * @param {object} historyItem - Current history item
   */
  setupModalActionHandlers(historyItem) {
    const copyBtn = document.querySelector('#historyModalCopy');
    const exportBtn = document.querySelector('#historyModalExport');

    if (copyBtn) {
      copyBtn.onclick = () => this.copyHistoryItem(historyItem);
    }

    if (exportBtn) {
      exportBtn.onclick = () => this.exportHistoryItem(historyItem);
    }
  }

  /**
   * Copy history item data to clipboard
   * @param {object} historyItem - History item to copy
   */
  async copyHistoryItem(historyItem) {
    try {
      const detailsText = this.formatHistoryItemText(historyItem);
      await navigator.clipboard.writeText(detailsText);
      NotificationHelper.micro('Copied');
    } catch (error) {
      Logger.error('UI', 'Failed to copy:', error);
      NotificationHelper.error('Failed to copy to clipboard');
    }
  }

  /**
   * Format history item as text
   * @param {object} historyItem - History item
   * @returns {string} Formatted text
   */
  formatHistoryItemText(historyItem) {
    let text = `URL: ${historyItem.url}\n`;
    text += `Title: ${historyItem.title || 'Untitled'}\n`;
    text += `Timestamp: ${new Date(historyItem.timestamp).toLocaleString()}\n`;
    text += `\nDetections (${historyItem.detections?.length || 0}):\n`;
    text += '─'.repeat(50) + '\n\n';

    (historyItem.detections || []).forEach((detection, index) => {
      const name = detection.detector?.name || detection.detector || 'Unknown';
      const category = detection.category || '';
      const confidence = detection.confidence || 0;

      text += `${index + 1}. ${name}\n`;
      text += `   Category: ${category}\n`;
      text += `   Confidence: ${confidence}%\n`;

      if (detection.matches && detection.matches.length > 0) {
        text += `   Detection Methods:\n`;
        detection.matches.forEach(match => {
          const methodType = (match.type || 'unknown').replace(/_/g, ' ').toUpperCase();
          const value = match.fullUrl || match.value || match.name || match.selector || match.pattern || 'unknown';
          text += `     - ${methodType}: ${value} (${match.confidence || 0}%)\n`;
        });
      }
      text += '\n';
    });

    return text;
  }

  /**
   * Export single history item to JSON file
   * @param {object} historyItem - History item to export
   */
  exportHistoryItem(historyItem) {
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      item: historyItem
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const domain = this.getDomainFromUrl(historyItem.url);
    const timestamp = new Date(historyItem.timestamp).toISOString().split('T')[0];
    a.href = url;
    a.download = `scrapfly-history-${domain}-${timestamp}.json`;
    a.click();

    URL.revokeObjectURL(url);
    NotificationHelper.success('History item exported');
  }

  /**
   * Delete a single history item
   * @param {Object} historyItem - History item to delete
   */
  async deleteHistoryItem(historyItem) {
    try {
      // Show confirmation dialog
      const confirmed = await NotificationHelper.confirm({
        title: 'Delete History Item',
        message: `Are you sure you want to delete this detection from ${this.getDomainFromUrl(historyItem.url)}?`,
        type: 'warning',
        confirmText: 'Delete',
        cancelText: 'Cancel'
      });

      if (!confirmed) return;

      // Remove from array
      const index = this.historyItems.findIndex(h => h.id === historyItem.id);
      if (index > -1) {
        this.historyItems.splice(index, 1);

        // Save updated history to storage
        const historyData = {
          items: this.historyItems,
          lastUpdated: Date.now()
        };
        await chrome.storage.local.set({
          'scrapfly_history': JSON.stringify(historyData)
        });

        // Re-render the history
        this.renderHistory();

        NotificationHelper.success('History item deleted');
        Logger.ui('History: Item deleted successfully');
      }
    } catch (error) {
      Logger.error('UI', 'Failed to delete history item:', error);
      NotificationHelper.error('Failed to delete history item');
    }
  }

  /**
   * Render detection details for modal
   * @param {Array} detections - Array of detection objects
   * @returns {string} HTML string
   */
  renderDetectionDetails(detections) {
    if (!detections || detections.length === 0) {
      return '<div class="history-modal-empty">No detections found</div>';
    }

    return detections.map((detection, index) => {
      const name = detection.detector?.name || detection.detector || 'Unknown';
      const category = detection.category || '';
      const confidence = detection.confidence || 0;
      const hasMethods = detection.matches && detection.matches.length > 0;

      // Get detector object and color from storage
      let detectorObj = null;
      let detectorColor = '#666666';
      if (this.detectorManager && category && name !== 'Unknown') {
        detectorObj = this.detectorManager.getDetectorByName(category, name);
        if (detectorObj && detectorObj.color) {
          detectorColor = detectorObj.color;
        }
      }

      // Get category color from CategoryManager
      let categoryColor = '#666666';
      if (this.detectorManager?.categoryManager && category) {
        const normalizedCategory = this.detectorManager.normalizeCategoryName(category);
        categoryColor = this.detectorManager.categoryManager.getCategoryColor(normalizedCategory) || categoryColor;
      }
      const categoryRgb = this.hexToRgb(categoryColor);
      const categoryStyle = categoryRgb
        ? `background: rgba(${categoryRgb.r}, ${categoryRgb.g}, ${categoryRgb.b}, 0.2); color: ${categoryColor}; border: 1px solid rgba(${categoryRgb.r}, ${categoryRgb.g}, ${categoryRgb.b}, 0.35);`
        : `background: ${categoryColor}; color: white;`;

      // Generate detector icon HTML
      let detectorIconHtml = '';
      if (detectorObj && detectorObj.icon) {
        const iconName = detectorObj.icon.toLowerCase();
        // Check if it's a fingerprint SVG icon
        if (FINGERPRINT_ICONS[iconName]) {
          detectorIconHtml = `<div class="modal-detector-icon-svg fingerprint-icon">${FINGERPRINT_ICONS[iconName]}</div>`;
        } else {
          const iconUrl = chrome.runtime.getURL(`detectors/icons/${detectorObj.icon}`);
          detectorIconHtml = `<img src="${iconUrl}" alt="${name}" class="modal-detector-icon">`;
        }
      } else {
        // Fallback: Use Scrapfly icon for all detectors without official icons
        const scrapflyIconUrl = chrome.runtime.getURL('icons/icon32.png');
        detectorIconHtml = `<img src="${scrapflyIconUrl}" alt="${name}" class="modal-detector-icon">`;
      }

      // Confidence class
      let confidenceClass = 'confidence-low';
      if (confidence >= 90) confidenceClass = 'confidence-high';
      else if (confidence >= 70) confidenceClass = 'confidence-medium';

      // Render detection methods
      const methodsHtml = this.renderDetectionMethods(detection.matches || []);

      // Get match count and method type badges for expanded view
      const matchCount = detection.matches?.length || 0;
      const methodTypeBadges = this.renderMethodTypeBadges(detection.matches || []);

      return `
        <div class="history-modal-detection-card ${hasMethods ? 'has-methods' : ''}" data-detection-index="${index}">
          <div class="history-modal-detection-header">
            ${detectorIconHtml}
            <div class="history-modal-detection-content">
              <div class="history-modal-detection-name">${name}</div>
            </div>
            <div class="history-modal-detection-right">
              <span class="history-modal-confidence ${confidenceClass}">${confidence}%</span>
              ${hasMethods ? '<span class="history-modal-expand-icon">▼</span>' : ''}
            </div>
          </div>
          ${hasMethods ? `
            <div class="history-modal-detection-details">
              <div class="history-modal-detection-meta">
                <span class="history-modal-badge" style="${categoryStyle}">${category}</span>
                <span class="history-modal-meta-separator">•</span>
                <span class="history-modal-match-count">${matchCount} match${matchCount !== 1 ? 'es' : ''}</span>
                ${methodTypeBadges ? `<span class="history-modal-meta-separator">•</span><span class="history-modal-method-types">${methodTypeBadges}</span>` : ''}
              </div>
              <div class="history-modal-detection-methods">
                ${methodsHtml}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Get unique method types from matches
   * @param {Array} matches - Array of match objects
   * @returns {Array} Array of unique method type keys (lowercase)
   */
  getUniqueMethodTypes(matches) {
    if (!matches || matches.length === 0) return [];
    const types = [];
    const seen = new Set();
    matches.forEach((match) => {
      const typeKey = (match.type || 'unknown').toLowerCase();
      if (!seen.has(typeKey)) {
        seen.add(typeKey);
        types.push(typeKey);
      }
    });
    return types;
  }

  /**
   * Render method type badges for modal meta row
   * @param {Array} matches - Array of match objects
   * @returns {string} HTML string
   */
  renderMethodTypeBadges(matches) {
    const typeKeys = this.getUniqueMethodTypes(matches);
    if (!typeKeys.length) return '';

    const visibleTypes = typeKeys.slice(0, 4);
    const overflowCount = typeKeys.length - visibleTypes.length;

    const badgesHtml = visibleTypes.map(typeKey => {
      const label = typeKey.replace(/_/g, ' ').toUpperCase();

      // Get tag color (use original key for lookup)
      let tagColor = '#666666';
      if (this.detectorManager?.categoryManager) {
        tagColor = this.detectorManager.categoryManager.getTagColor(typeKey) || '#666666';
      }
      const tagRgb = this.hexToRgb(tagColor);
      const badgeStyle = tagRgb
        ? `background: rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.18); color: ${tagColor}; border: 1px solid rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.35);`
        : `background: ${tagColor}; color: white;`;

      return `<span class="history-modal-method-type-badge" style="${badgeStyle}">${label}</span>`;
    }).join('');

    const overflowHtml = overflowCount > 0
      ? `<span class="history-modal-method-type-badge history-modal-method-type-overflow">+${overflowCount}</span>`
      : '';

    return badgesHtml + overflowHtml;
  }

  /**
   * Render detection methods for modal
   * @param {Array} matches - Array of match objects
   * @returns {string} HTML string
   */
  renderDetectionMethods(matches) {
    if (!matches || matches.length === 0) {
      return '<div class="history-modal-no-methods">No detection methods</div>';
    }

    return matches.map(match => {
      const originalType = match.type || 'unknown';
      const methodType = originalType.replace(/_/g, ' ').toUpperCase();
      const confidence = match.confidence || 0;

      // Determine display value based on method type
      let displayValue = '';
      switch (match.type?.toLowerCase()) {
        case 'cookie':
        case 'cookies':
          displayValue = match.value || match.name || 'unknown';
          break;
        case 'header':
        case 'headers':
          displayValue = match.value || match.name || 'unknown';
          break;
        case 'content':
        case 'script':
          displayValue = match.content || match.value || match.pattern || 'unknown';
          break;
        case 'url':
        case 'urls':
          displayValue = match.fullUrl || match.value || match.pattern || 'unknown';
          break;
        case 'dom':
          displayValue = match.value || match.selector || match.pattern || 'unknown';
          break;
        default:
          displayValue = match.value || match.name || match.selector || match.pattern || 'unknown';
      }

      // Get tag color (use originalType to preserve underscores for lookup)
      let tagColor = '#666666';
      if (this.detectorManager?.categoryManager) {
        tagColor = this.detectorManager.categoryManager.getTagColor(originalType.toLowerCase()) || '#666666';
      }
      const tagRgb = this.hexToRgb(tagColor);
      const badgeStyle = tagRgb
        ? `background: rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.15); color: ${tagColor}; border: 1px solid rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.3);`
        : `background: ${tagColor}; color: white;`;

      // Confidence class
      let confidenceClass = 'confidence-low';
      if (confidence >= 90) confidenceClass = 'confidence-high';
      else if (confidence >= 70) confidenceClass = 'confidence-medium';

      const copyPayload = JSON.stringify({
        rawValue: displayValue,
        methodType,
        confidence
      });

      const safeDisplayValue = FormatUtils.escapeHtml(displayValue);

      return `
        <div class="history-modal-method-item" data-copy-payload="${encodeURIComponent(copyPayload)}" title="Click to copy">
          <span class="history-modal-method-badge" style="${badgeStyle}">${methodType}</span>
          <span class="history-modal-method-value">${safeDisplayValue}</span>
          <span class="history-modal-method-confidence ${confidenceClass}">${confidence}%</span>
        </div>
      `;
    }).join('');
  }

  /**
   * Setup modal close handlers
   */
  setupModalCloseHandlers() {
    const modal = document.querySelector('#historyDetailModal');
    const closeBtn = document.querySelector('#historyModalClose');
    const overlay = modal?.querySelector('.history-modal-overlay');

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    };

    if (closeBtn) {
      closeBtn.onclick = closeModal;
    }

    if (overlay) {
      overlay.onclick = (e) => {
        e.stopPropagation();  // Prevent event bubbling to parent elements
        closeModal();
      };
    }

    // ESC key to close - cleanup previous handler to prevent memory leak
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
    }
    this.escHandler = (e) => {
      if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
        closeModal();
      }
    };
    document.addEventListener('keydown', this.escHandler);
    // Note: expand/collapse handlers are set up in attachDetailModalClickHandlers()
  }

  /**
   * Setup per-method copy handlers inside modal
   */
  setupMethodCopyHandlers() {
    const methodItems = document.querySelectorAll('.history-modal-method-item[data-copy-payload]');
    if (!methodItems.length) {
      return;
    }

    methodItems.forEach((item) => {
      const payloadEncoded = item.getAttribute('data-copy-payload');
      if (!payloadEncoded) {
        return;
      }

      let payload = null;
      try {
        payload = JSON.parse(decodeURIComponent(payloadEncoded));
      } catch (error) {
        Logger.warn('UI', 'History: Failed to parse method copy payload', error);
      }

      const handleCopy = (event) => {
        event.stopPropagation();
        const value = payload?.rawValue || '';
        if (!value) {
          return;
        }

        const textToCopy = `[${payload.methodType || 'METHOD'}] ${value}`;
        FormatUtils.copyToClipboard(textToCopy, {
          element: item,
          notificationMessage: 'Copied',
          inlineMessage: '✓ Copied!'
        });

        item.classList.add('copy-feedback');
        setTimeout(() => item.classList.remove('copy-feedback'), 800);
      };

      item.addEventListener('click', handleCopy);
      const valueNode = item.querySelector('.history-modal-method-value');
      if (valueNode) {
        valueNode.addEventListener('click', handleCopy);
      }
    });
  }

  /**
   * Get domain from URL
   * @param {string} url - Full URL
   * @returns {string} Domain name
   */
  getDomainFromUrl(url) {
    if (!url) return 'Unknown';
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  /**
   * Get human-readable time ago string
   * @param {Date} date - Date object
   * @returns {string} Time ago string
   */
  getTimeAgo(date) {
    return FormatUtils.getTimeAgo(date.getTime ? date.getTime() : date);
  }

  /**
   * Export history to JSON file
   */
  exportHistory() {
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      itemsCount: this.historyItems.length,
      items: this.historyItems
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `scrapfly-history-${timestamp}.json`;
    a.click();

    URL.revokeObjectURL(url);
    NotificationHelper.success(`Exported ${this.historyItems.length} history items`);
  }

  /**
   * Handle import of history from file
   * @param {Event} event - File change event
   */
  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate the imported data
      if (!data.items || !Array.isArray(data.items)) {
        throw new Error('Invalid history file format');
      }

      // Ask if user wants to merge or replace
      const shouldMerge = await NotificationHelper.confirm({
        title: 'Import History',
        message: `Import ${data.items.length} history items? Current history has ${this.historyItems.length} items.`,
        type: 'info',
        confirmText: 'Merge',
        cancelText: 'Replace'
      });

      if (shouldMerge) {
        // Merge with existing history
        const existingIds = new Set(this.historyItems.map(item => item.id));
        const newItems = data.items.filter(item => !existingIds.has(item.id));
        this.historyItems = [...newItems, ...this.historyItems];

        // Sort by timestamp (newest first)
        this.historyItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (this.historyLimit > 0 && this.historyItems.length > this.historyLimit) {
          this.historyItems = this.historyItems.slice(0, this.historyLimit);
        }

        NotificationHelper.success(`Merged ${newItems.length} new history items`);
      } else {
        // Replace existing history
        this.historyItems = this.historyLimit > 0
          ? data.items.slice(0, this.historyLimit)
          : data.items;
        NotificationHelper.success(`Replaced history with ${this.historyItems.length} items`);
      }

      await this.saveHistoryToStorage();
      this.renderHistory();
    } catch (error) {
      NotificationHelper.error('Failed to import history: ' + error.message);
    }

    // Reset the file input
    event.target.value = '';
  }

  /**
   * Initialize history section with event listeners
   */
  async initialize() {
    if (!this.initialized) {
      try {
        await this.refreshHistoryLimit();
      } catch (error) {
        Logger.error('UI', 'History: Failed to read history limit from settings, defaulting to 0 (unlimited)', error);
        this.historyLimit = 0; // 0 = unlimited
      }

      await this.loadHTML();
      this.setupPagination();
      this.setupEventListeners();
      this.registerSettingsListener();
      this.initialized = true;
    }
  }

  async refreshHistoryLimit() {
    try {
      const settings = await Utils.getHistorySettings();
      const parsedLimit = parseInt(settings.historyLimit, 10);
      const newLimit = Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : 0; // 0 = unlimited

      if (newLimit !== this.historyLimit) {
        Logger.ui(`History: Updating history limit from ${this.historyLimit} to ${newLimit}`);
        this.historyLimit = newLimit;
      }
    } catch (error) {
      Logger.error('UI', 'History: Failed to refresh history limit, keeping current value', error);
    }
  }

  registerSettingsListener() {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== 'SETTINGS_UPDATED') {
        return;
      }

      this.refreshHistoryLimit()
        .then(() => this.loadHistoryFromStorage())
        .then(() => this.renderHistory())
        .catch(error => {
          Logger.error('UI', 'History: Failed to refresh after settings update', error);
        });
    });
  }

  /**
   * Setup pagination manager
   */
  setupPagination() {
    this.paginationManager = new PaginationManager('historyPagination', {
      itemsPerPage: 20,
      onPageChange: (page, items) => {
        this.renderHistoryPage(items);
      }
    });
  }

  /**
   * Load HTML template into history tab
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('sections/history/history.html'));
      const html = await response.text();

      const historyTab = document.querySelector('#historyTab');
      if (historyTab) {
        historyTab.innerHTML = html;
      }
    } catch (error) {
      Logger.error('UI', 'Failed to load history HTML:', error);
    }
  }

  /**
   * Setup event listeners after HTML is loaded
   */
  setupEventListeners() {
    // Guard against duplicate listener attachment
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    // Setup search functionality
    const searchInput = document.querySelector('#historySearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Setup clear history button
    const clearBtn = document.querySelector('#clearHistoryBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        const confirmed = await NotificationHelper.confirm({
          title: 'Clear History',
          message: 'Are you sure you want to clear all history? This action cannot be undone.',
          type: 'danger',
          confirmText: 'Clear All',
          cancelText: 'Cancel'
        });

        if (confirmed) {
          this.clearHistory();
        }
      });
    }

    // Setup export button
    const exportBtn = document.querySelector('#exportHistoryBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportHistory());
    }

    // Setup import button and file input
    const importBtn = document.querySelector('#importHistoryBtn');
    const importFile = document.querySelector('#importHistoryFile');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => this.handleImport(e));
    }
  }

  /**
   * Save reCAPTCHA capture data to advanced history (called from background.js)
   * @param {number} tabId - Tab ID
   * @param {Array} captureResults - Array of capture results
   * @param {Object} chrome - Chrome API object
   * @returns {Promise<boolean>} Success status
   */
  static async saveCaptureToHistory(tabId, captureResults, chrome) {
    try {
      if (!captureResults || captureResults.length === 0) {
        Logger.ui('History: No capture results to save to history');
        return false;
      }

      // Get tab information (handle closed tabs gracefully)
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab || !tab.url) {
        Logger.warn('UI', 'History: Cannot save capture - tab closed or no URL');
        return false;
      }

      // Get existing advanced history
      const result = await chrome.storage.local.get(['scrapfly_advanced_history']);
      let history = [];

      if (result.scrapfly_advanced_history) {
        if (typeof result.scrapfly_advanced_history === 'string') {
          try {
            const parsed = JSON.parse(result.scrapfly_advanced_history);
            history = parsed.items || [];
            Logger.ui('History: Parsed advanced history from JSON string format');
          } catch (parseError) {
            Logger.error('UI', 'History: Error parsing advanced history JSON:', parseError);
            history = [];
          }
        } else if (Array.isArray(result.scrapfly_advanced_history)) {
          history = result.scrapfly_advanced_history;
        } else if (result.scrapfly_advanced_history.items) {
          history = result.scrapfly_advanced_history.items || [];
        }
      }

      if (!Array.isArray(history)) {
        Logger.warn('UI', 'History: Advanced history is not an array, resetting');
        history = [];
      }

      // Create URL hash (simple hash for storage key)
      const urlHash = btoa(tab.url).substring(0, 32);

      // Create history entries (one per capture result)
      const now = Date.now();
      const expirationTime = 30 * 60 * 1000; // 30 minutes in milliseconds

      captureResults.forEach((captureData, index) => {
        const expiresAt = now + expirationTime;
        const expiresAtDate = new Date(expiresAt);
        Logger.ui(`[Capture History] Saving capture ${index + 1} - will expire at: ${expiresAtDate.toLocaleTimeString()}`);
        Logger.ui(`[Capture History] Session Mode: ${captureData.hasSession ? 'Enabled' : 'Disabled'}, Required Cookie: ${captureData.requiredCookie || 'None'}`);

        const historyEntry = {
          id: `capture_${now}_${tabId}_${index}`,
          url: tab.url,
          urlHash: urlHash,
          hostname: new URL(tab.url).hostname,
          title: tab.title || 'Untitled',
          timestamp: now,
          expiresAt: expiresAt, // 30 minutes from now
          captureData: {
            siteKey: captureData.siteKey,
            siteUrl: captureData.siteUrl,
            version: captureData.version,
            type: captureData.type,
            action: captureData.action || '',
            isEnterprise: captureData.isEnterprise,
            isInvisible: captureData.isInvisible,
            isSRequired: captureData.isSRequired,
            apiDomain: captureData.apiDomain || '',
            hasSession: captureData.hasSession || false,
            requiredCookie: captureData.requiredCookie || null
          }
        };

        history.unshift(historyEntry);
      });

      const settings = await Utils.getHistorySettings();
      const historyLimit = Number.isFinite(parseInt(settings.historyLimit, 10))
        ? parseInt(settings.historyLimit, 10)
        : 0; // 0 = unlimited

      if (historyLimit > 0 && history.length > historyLimit) {
        history = history.slice(0, historyLimit);
      }

      // Save back to storage
      const historyData = {
        items: history,
        lastUpdated: Date.now()
      };

      await chrome.storage.local.set({
        scrapfly_advanced_history: JSON.stringify(historyData, null, 2)
      });

      Logger.ui(`History: Saved ${captureResults.length} capture(s) to advanced history for ${tab.url}`);
      return true;
    } catch (error) {
      Logger.error('UI', 'History: Error saving capture to history:', error);
      Logger.error('UI', 'History: Error stack:', error.stack);
      return false;
    }
  }

  /**
   * Check if detection should be saved to history based on duplicate prevention settings
   * @param {string} url - URL to check
   * @param {Object} settings - History settings from Utils.getHistorySettings()
   * @param {Object} chrome - Chrome API object
   * @returns {Promise<boolean>} True if should save, false if duplicate
   */
  static async shouldSaveToHistory(url, settings, chrome) {
    try {
      // If duplicate prevention is disabled, always save
      if (!settings.preventDuplicates) {
        return true;
      }

      // Get existing history
      const result = await chrome.storage.local.get(['scrapfly_history']);
      let history = [];

      if (result.scrapfly_history) {
        if (typeof result.scrapfly_history === 'string') {
          try {
            const parsed = JSON.parse(result.scrapfly_history);
            history = parsed.items || [];
          } catch (parseError) {
            Logger.error('UI', 'History: Error parsing history JSON for duplicate check:', parseError);
            return true; // On error, allow save
          }
        } else if (Array.isArray(result.scrapfly_history)) {
          history = result.scrapfly_history;
        } else if (result.scrapfly_history.items) {
          history = result.scrapfly_history.items || [];
        }
      }

      if (!Array.isArray(history) || history.length === 0) {
        return true; // No history, always save
      }

      // Parse duplicate duration
      const durationMs = FormatUtils.convertToMilliseconds(
        settings.duplicateDuration || 1,
        settings.duplicateUnit || 'hours'
      );

      const now = Date.now();
      const cutoffTime = now - durationMs;

      // Normalize URL based on scope
      let normalizedUrl = url;
      try {
        const urlObj = new URL(url);
        switch (settings.duplicateScope) {
          case 'domain':
            // Domain only: https://example.com
            normalizedUrl = urlObj.hostname;
            break;
          case 'path':
            // Domain + path: https://example.com/path
            normalizedUrl = urlObj.origin + urlObj.pathname;
            break;
          case 'full_url':
          default:
            // Full URL with query params: https://example.com/path?foo=bar
            normalizedUrl = url;
        }
      } catch (error) {
        Logger.warn('UI', 'History: Failed to parse URL for duplicate check:', error);
        return true; // On error, allow save
      }

      // Check for duplicates within time window
      const isDuplicate = history.some(item => {
        // Check if entry is within time window
        const itemTimestamp = typeof item.timestamp === 'string'
          ? new Date(item.timestamp).getTime()
          : item.timestamp;

        if (itemTimestamp < cutoffTime) {
          return false; // Too old, not a duplicate
        }

        // Normalize historical URL based on scope
        let itemNormalizedUrl = item.url;
        try {
          const itemUrlObj = new URL(item.url);
          switch (settings.duplicateScope) {
            case 'domain':
              itemNormalizedUrl = itemUrlObj.hostname;
              break;
            case 'path':
              itemNormalizedUrl = itemUrlObj.origin + itemUrlObj.pathname;
              break;
            case 'full_url':
            default:
              itemNormalizedUrl = item.url;
          }
        } catch (error) {
          // If URL parsing fails, fall back to exact match
          itemNormalizedUrl = item.url;
        }

        return itemNormalizedUrl === normalizedUrl;
      });

      if (isDuplicate) {
        Logger.ui(`History: Skipping duplicate URL within ${settings.duplicateDuration} ${settings.duplicateUnit} (scope: ${settings.duplicateScope}): ${normalizedUrl}`);
        return false;
      }

      return true;
    } catch (error) {
      Logger.error('UI', 'History: Error checking for duplicates:', error);
      return true; // On error, allow save
    }
  }

  /**
   * Save detection results to history (called from background.js)
   * @param {number} tabId - Tab ID
   * @param {Object} pageData - Page data
   * @param {Array} detectionResults - Detection results
   * @param {Object} chrome - Chrome API object
   * @returns {Promise<boolean>} Success status
   */
  static async saveDetectionToHistory(tabId, pageData, detectionResults, chrome) {
    try {
      // Get existing history
      const result = await chrome.storage.local.get(['scrapfly_history']);
      let history = [];

      // Handle different storage formats for backward compatibility
      if (result.scrapfly_history) {
        if (typeof result.scrapfly_history === 'string') {
          // History.js stores as JSON string with { items: [], lastUpdated: ... }
          try {
            const parsed = JSON.parse(result.scrapfly_history);
            history = parsed.items || [];
            Logger.ui('History: Parsed history from JSON string format');
          } catch (parseError) {
            Logger.error('UI', 'History: Error parsing history JSON:', parseError);
            history = [];
          }
        } else if (Array.isArray(result.scrapfly_history)) {
          // Direct array format
          history = result.scrapfly_history;
        } else if (result.scrapfly_history.items) {
          // Object with items array
          history = result.scrapfly_history.items || [];
        } else {
          Logger.warn('UI', 'History: Unknown history format, starting fresh');
          history = [];
        }
      }

      // Ensure history is an array
      if (!Array.isArray(history)) {
        Logger.warn('UI', 'History: History is not an array, resetting');
        history = [];
      }

      const settings = await Utils.getHistorySettings();
      const historyLimit = Number.isFinite(parseInt(settings.historyLimit, 10))
        ? parseInt(settings.historyLimit, 10)
        : 0; // 0 = unlimited
      // Get current cache scope setting
      const cacheScope = await Utils.getCacheScope();

      // Create history entry
      const historyEntry = {
        id: `detection_${Date.now()}_${tabId}`,
        url: pageData.url,
        hostname: pageData.hostname,
        title: pageData.tabTitle || pageData.title || 'Untitled',
        favicon: pageData.favicon,
        timestamp: Date.now(),
        detections: detectionResults,
        detectionCount: detectionResults.length,
        categories: [...new Set(detectionResults.map(d => d.category))],
        cacheScope: cacheScope
      };

      // Add to history (newest first)
      history.unshift(historyEntry);

      // Apply rolling window limit (remove oldest items)
      if (historyLimit > 0 && history.length > historyLimit) {
        history = history.slice(0, historyLimit);
      }

      // Save back to storage in the format History.js expects
      const historyData = {
        items: history,
        lastUpdated: Date.now()
      };

      await chrome.storage.local.set({
        scrapfly_history: JSON.stringify(historyData, null, 2)
      });

      Logger.ui(`History: Saved detection to history for ${pageData.url}`);
      return true;
    } catch (error) {
      Logger.error('UI', 'History: Error saving to history:', error);
      Logger.error('UI', 'History: Error stack:', error.stack);
      return false;
    }
  }

  /**
   * Convert hex color to RGB object
   * @param {string} hex - Hex color value (e.g., "#FF5733" or "FF5733")
   * @returns {Object|null} RGB object {r, g, b} or null if invalid
   */
  hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') {
      return null;
    }
    const result = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = History;
} else if (typeof window !== 'undefined') {
  window.History = History;
}
