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
      Logger.warn('UI', '[History] Failed to display history', error);
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
      Logger.warn('UI', '[History] Storage load failed', error);
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
      Logger.warn('UI', '[History] Storage save failed', error);
    }
  }

  /**
   * Render history items in the UI
   */
  renderHistory() {
    if (this.historyItems.length === 0) {
      this.showEmptyState();
      return;
    }

    const historyEmpty = document.querySelector('#historyEmpty');
    if (historyEmpty) historyEmpty.style.display = 'none';

    const itemsToShow = this.searchQuery
      ? this.getFilteredItems()
      : this.historyItems;

    if (this.paginationManager) {
      this.paginationManager.setItems(itemsToShow);
    }

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
      Logger.warn('UI', '[History] List element not found');
      return;
    }

    historyList.style.display = 'block';

    const buildHistoryItemHtml = (item) => {
      const timeAgo = this.getTimeAgo(new Date(item.timestamp));
      const domain = this.getDomainFromUrl(item.url);
      const safeTitle = FormatUtils.escapeHtml(item.title || 'Untitled');
      const safeUrl = FormatUtils.escapeHtml(item.url || '');
      const safeDomain = FormatUtils.escapeHtml(domain);

      const faviconSrc = UrlUtils.resolveDisplayFavicon(item.favicon, item.url || item.hostname);

      return `
        <div class="history-item" data-history-id="${item.id}">
          <div class="history-item-top">
            <div class="history-item-content">
              <div class="history-header-info">
                <img src="${faviconSrc}" alt="Favicon" class="history-favicon" data-fallback="${chrome.runtime.getURL('icons/icon16.png')}">
                <div class="history-url" title="${safeUrl}">${safeDomain}</div>
              </div>
              <div class="history-title" title="${safeTitle}">${safeTitle}</div>
            </div>
            <div class="history-item-right">
              <div class="history-item-actions">
                <button class="history-item-action-btn history-clear-cache-btn" data-action="clear-cache" title="Clear cache" aria-label="Clear cache for this entry">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                  </svg>
                </button>
                <button class="history-item-action-btn history-copy-btn" data-action="copy" title="Copy data" aria-label="Copy detection data for this entry">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" fill="currentColor"/>
                  </svg>
                </button>
                <button class="history-item-action-btn history-export-btn" data-action="export" title="Export item" aria-label="Export this history entry as JSON">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,19L8,15H10.5V12H13.5V15H16L12,19Z" fill="currentColor"/>
                  </svg>
                </button>
                <button class="history-item-action-btn history-blacklist-btn" data-action="blacklist" title="Add to blacklist" aria-label="Add this domain to the blacklist">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M4.93 4.93l14.14 14.14"/>
                  </svg>
                </button>
                <button class="history-item-action-btn history-delete-btn" data-action="delete" title="Delete item" aria-label="Delete this history entry">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
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
      const tooltipText = FormatUtils.escapeHtml(`${name}${category ? ' (' + category + ')' : ''}`);
      const safeName = FormatUtils.escapeHtml(name);

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

      const normalizedCategoryName = String(category || detectorObj?.category || '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
      const isFingerprintCategory = normalizedCategoryName === 'fingerprint' || normalizedCategoryName.includes('fingerprint');

      // Generate icon HTML
      let isFingerprint = false;
      if (detectorObj && detectorObj.icon) {
        const iconName = detectorObj.icon.toLowerCase();
        // Check if it's a fingerprint SVG icon
        if (FINGERPRINT_ICONS[iconName]) {
          iconHtml = `<div class="detection-icon-svg fingerprint-icon fingerprint-icon-shell">${FINGERPRINT_ICONS[iconName]}</div>`;
          isFingerprint = true;
        } else {
          const iconUrl = chrome.runtime.getURL(`detectors/icons/${detectorObj.icon}`);
          if (isFingerprintCategory) {
            iconHtml = `<div class="detection-icon-svg fingerprint-icon fingerprint-icon-shell"><img src="${iconUrl}" alt="${safeName}" class="fingerprint-icon-image fingerprint-icon-image--builtin history-fingerprint-image"></div>`;
            isFingerprint = true;
          } else {
            iconHtml = `<img src="${iconUrl}" alt="${safeName}" class="detection-icon">`;
          }
        }
      } else {
        // Fallback: Use Scrapfly icon for all detectors without official icons
        const scrapflyIconUrl = chrome.runtime.getURL('icons/icon32.png');
        if (isFingerprintCategory) {
          iconHtml = `<div class="detection-icon-svg fingerprint-icon fingerprint-icon-shell"><img src="${scrapflyIconUrl}" alt="${safeName}" class="fingerprint-icon-image fingerprint-icon-image--default history-fingerprint-image"></div>`;
          isFingerprint = true;
        } else {
          iconHtml = `<img src="${scrapflyIconUrl}" alt="${safeName}" class="detection-icon">`;
        }
      }

      const badgeClass = isFingerprint ? 'history-detection-tag icon-badge fingerprint-badge' : 'history-detection-tag icon-badge';
      tagsHtml += `<span class="${badgeClass}" title="${tooltipText}" style="border-color: ${categoryColor};">${iconHtml}</span>`;
    });

    if (sortedDetections.length > maxTags) {
      const hiddenDetections = sortedDetections.slice(maxTags);
      const hiddenSummary = FormatUtils.escapeHtml(hiddenDetections
        .map(d => d.detector?.name || d.detector || 'Unknown')
        .join(', '));
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

    // Cache scope display names — resolve via i18n so they match the user's locale.
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const scopeKeyByValue = {
      'domain': 'scopeDomain',
      'path': 'scopePath',
      'url': 'scopeFullUrl',
      'full': 'scopeFullUrl',
      'full_url': 'scopeFullUrl'
    };
    const scopeFallback = { 'domain': 'Domain', 'path': 'Path', 'url': 'Full URL', 'full': 'Full URL', 'full_url': 'Full URL' };
    const cacheScope = String(item.cacheScope || 'domain').toLowerCase();
    const scopeKey = scopeKeyByValue[cacheScope] || 'scopeDomain';
    const cacheScopeDisplay = _tr(scopeKey, scopeFallback[cacheScope] || 'Domain');

    // Translated stat labels (CSS renders them uppercase via text-transform).
    const lblDetections = _tr('statDetections', 'Detections');
    const lblConfidence = _tr('statConfidence', 'Confidence');
    const lblDifficulty = _tr('statDifficulty', 'Difficulty');
    const lblScope = _tr('statCacheScope', 'Scope');

    // Translated difficulty value (Low/Medium/High → localized).
    const difficultyKeyByValue = { 'Low': 'difficultyLow', 'Medium': 'difficultyMedium', 'High': 'difficultyHigh' };
    const difficultyKey = difficultyKeyByValue[stats.difficulty];
    const difficultyDisplay = difficultyKey ? _tr(difficultyKey, stats.difficulty || '') : (stats.difficulty || '');

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
            <div class="history-stat-label">${lblDetections}</div>
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
            <div class="history-stat-label">${lblConfidence}</div>
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
            <div class="history-stat-label">${lblDifficulty}</div>
            <div class="history-stat-value" style="color: ${stats.difficultyColor}">${difficultyDisplay}</div>
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
            <div class="history-stat-label">${lblScope}</div>
            <div class="history-stat-value">${cacheScopeDisplay}</div>
          </div>
        </div>
      </div>
    `;
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
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    try {
      this.historyItems = [];
      await chrome.storage.local.remove(['scrapfly_history']);
      this.showEmptyState();
      Logger.ui('History cleared');
      NotificationHelper.success(_tr('notificationHistoryCleared', 'History cleared'));
    } catch (error) {
      Logger.warn('UI', '[History] Clear failed', error);
      NotificationHelper.error(_fmt('notificationClearHistoryFailedFmt', 'Failed to clear history: ' + error.message, error.message));
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
    // Handle action button clicks (clear cache/copy/export/blacklist/delete)
    document.querySelectorAll('.history-item-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = e.currentTarget.dataset.action;
        const historyItem = e.currentTarget.closest('.history-item');
        const historyId = historyItem.dataset.historyId;
        const item = this.historyItems.find(h => h.id === historyId);

        if (!item) return;

        if (action === 'clear-cache') {
          this.clearHistoryItemCache(item);
        } else if (action === 'copy') {
          this.copyHistoryItem(item);
        } else if (action === 'export') {
          this.exportHistoryItem(item);
        } else if (action === 'blacklist') {
          this.addHistoryItemToBlacklist(item);
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
      Logger.warn('UI', '[History] Detail modal not found');
      return;
    }

    // Populate modal header
    const favicon = document.querySelector('#historyModalFavicon');
    const title = document.querySelector('#historyModalTitle');
    const url = document.querySelector('#historyModalUrl');
    const timestamp = document.querySelector('#historyModalTimestamp');
    const modalStats = document.querySelector('#historyModalStats');
    const content = document.querySelector('#historyModalContent');

    if (favicon) {
      const faviconUrl = UrlUtils.resolveDisplayFavicon(historyItem.favicon, historyItem.url || historyItem.hostname);
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
      timestamp.innerHTML = `<span class="time-ago">${FormatUtils.escapeHtml(timeAgo)}</span><span class="time-full">(${FormatUtils.escapeHtml(fullDate)})</span>`;
    }
    if (modalStats) {
      modalStats.innerHTML = this.renderHistoryStats(historyItem);
    }

    // Render detections in modal
    if (content) {
      content.innerHTML = this.renderDetectionDetails(historyItem.detections || []);
    }

    this.attachDetailModalClickHandlers();

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Setup close handlers
    this.setupModalCloseHandlers();

    // Setup copy handlers for individual method items
    this.setupMethodCopyHandlers();
  }

  /**
   * Copy history item data to clipboard
   * @param {object} historyItem - History item to copy
   */
  async copyHistoryItem(historyItem) {
    const detailsText = this.formatHistoryItemText(historyItem);
    await FormatUtils.copyToClipboard(detailsText);
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
    const _t1 = (typeof I18n !== 'undefined') ? I18n : null;
    NotificationHelper.success((_t1 && _t1.get('notificationHistoryItemExported')) || 'History item exported');
  }

  /**
   * Clear cached detection data for a history item URL while keeping the entry.
   * @param {Object} historyItem - History item whose cache should be cleared
   */
  async clearHistoryItemCache(historyItem) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    try {
      const domain = this.getDomainFromUrl(historyItem.url);
      const confirmed = await NotificationHelper.confirm({
        title: _tr('dialogClearCacheTitle', 'Clear Cache'),
        message: _fmt('dialogClearCacheMessageFmt', `Clear cached detection data for ${domain}? The history entry will be kept.`, domain),
        type: 'warning',
        confirmText: _tr('buttonClearCache', 'Clear Cache'),
        cancelText: _tr('btnCancel', 'Cancel'),
        emphasizeAction: true
      });

      if (!confirmed) return;

      const rawScope = String(historyItem.cacheScope || 'domain').toLowerCase();
      const mappedScope = rawScope === 'url' ? 'full' : rawScope;
      const cacheScope = ['domain', 'path', 'full'].includes(mappedScope) ? mappedScope : 'domain';

      const request = {
        type: 'HISTORY_CLEAR_CACHE',
        url: historyItem.url,
        cacheScope
      };

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (activeTab && typeof activeTab.id === 'number' && activeTab.url) {
        const activeHash = UrlUtils.hashUrl(activeTab.url, cacheScope);
        const targetHash = UrlUtils.hashUrl(historyItem.url, cacheScope);
        if (activeHash === targetHash) {
          request.tabId = activeTab.id;
        }
      }

      const response = await chrome.runtime.sendMessage(request);

      if (response?.status === 'cleared') {
        NotificationHelper.success(_tr('notificationCacheCleared', 'Cache cleared'));
      } else if (response?.status === 'not_found') {
        NotificationHelper.info(_tr('notificationCacheAlreadyCleared', 'Cache already cleared'));
      } else {
        NotificationHelper.error(_tr('notificationClearCacheFailed', 'Failed to clear cache'));
      }
    } catch (error) {
      Logger.warn('UI', '[History] Cache clear failed', error);
      NotificationHelper.error(_tr('notificationClearCacheFailed', 'Failed to clear cache'));
    }
  }

  /**
   * Add the history item's domain to blacklist.
   * @param {Object} historyItem - History item whose domain should be blacklisted
   */
  async addHistoryItemToBlacklist(historyItem) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    try {
      if (!historyItem?.url) {
        NotificationHelper.error(_tr('invalidUrl', 'Invalid URL'));
        return;
      }

      const domain = this.getDomainFromUrl(historyItem.url);
      if (!domain || domain === 'Unknown') {
        NotificationHelper.error(_tr('invalidDomain', 'Invalid domain'));
        return;
      }

      const confirmed = await NotificationHelper.confirm({
        title: _tr('addBlacklistTitle', 'Add to Blacklist'),
        message: _fmt('addBlacklistMsgFmt', `Domain "${domain}" will be excluded from all future detections. You can remove it later in Settings.`, domain),
        confirmText: _tr('addBlacklistBtn', 'Add to Blacklist'),
        cancelText: _tr('btnCancel', 'Cancel'),
        type: 'danger',
        emphasizeAction: true
      });

      if (!confirmed) return;

      const settings = await Utils.getSettings();

      if (!settings.detection) {
        settings.detection = {};
      }
      if (!Array.isArray(settings.detection.blacklistedDomains)) {
        settings.detection.blacklistedDomains = [];
      }

      if (settings.detection.blacklistedDomains.includes(domain)) {
        NotificationHelper.info(_fmt('alreadyBlacklistedFmt', `Domain "${domain}" is already blacklisted`, domain));
        return;
      }

      settings.detection.blacklistedDomains.push(domain);
      const saved = typeof StorageManager !== 'undefined' && typeof StorageManager.saveSettings === 'function'
        ? await StorageManager.saveSettings(settings)
        : false;
      if (!saved) {
        throw new Error('Failed to save settings');
      }

      NotificationHelper.success(_fmt('notificationDomainBlacklistedFmt', `Added "${domain}" to blacklist`, domain));
    } catch (error) {
      Logger.warn('UI', '[History] Blacklist add failed', error);
      NotificationHelper.error(_tr('notificationBlacklistFailed', 'Failed to add to blacklist'));
    }
  }

  /**
   * Delete a single history item
   * @param {Object} historyItem - History item to delete
   */
  async deleteHistoryItem(historyItem) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    try {
      const domain = this.getDomainFromUrl(historyItem.url);
      const confirmed = await NotificationHelper.confirm({
        title: _tr('dialogDeleteHistoryTitle', 'Delete History Item'),
        message: _fmt('dialogDeleteHistoryMessageFmt', `Are you sure you want to delete this detection from ${domain}?`, domain),
        type: 'danger',
        confirmText: _tr('btnDelete', 'Delete'),
        cancelText: _tr('btnCancel', 'Cancel'),
        emphasizeAction: true
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

        NotificationHelper.success(_tr('notificationHistoryItemDeleted', 'History item deleted'));
        Logger.ui('History: Item deleted successfully');
      }
    } catch (error) {
      Logger.warn('UI', '[History] Delete failed', error);
      NotificationHelper.error(_tr('notificationDeleteHistoryItemFailed', 'Failed to delete history item'));
    }
  }

  /**
   * Render detection details for modal
   * @param {Array} detections - Array of detection objects
   * @returns {string} HTML string
   */
  renderDetectionDetails(detections) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    if (!detections || detections.length === 0) {
      return `<div class="history-modal-empty">${_tr('historyNoDetectionsFound', 'No detections found')}</div>`;
    }

    const categoryKeyByValue = {
      'anti-bot': 'categoryAntibot', 'antibot': 'categoryAntibot',
      'captcha': 'categoryCaptcha',
      'fingerprint': 'categoryFingerprint', 'fingerprinting': 'categoryFingerprint'
    };

    return detections.map((detection, index) => {
      const name = detection.detector?.name || detection.detector || _tr('unknownDetection', 'Unknown');
      const safeName = FormatUtils.escapeHtml(name);
      const category = detection.category || '';
      const categoryKey = categoryKeyByValue[String(category).toLowerCase()] || null;
      const translatedCategory = categoryKey ? _tr(categoryKey, category) : category;
      const safeCategory = FormatUtils.escapeHtml(translatedCategory);
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

      const normalizedDetectionCategory = String(category || detectorObj?.category || '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
      const isFingerprintCategory = normalizedDetectionCategory === 'fingerprint' || normalizedDetectionCategory.includes('fingerprint');

      // Generate detector icon HTML
      let detectorIconHtml = '';
      if (detectorObj && detectorObj.icon) {
        const iconName = detectorObj.icon.toLowerCase();
        // Check if it's a fingerprint SVG icon
        if (FINGERPRINT_ICONS[iconName]) {
          detectorIconHtml = `<div class="modal-detector-icon-svg fingerprint-icon fingerprint-icon-shell">${FINGERPRINT_ICONS[iconName]}</div>`;
        } else {
          const iconUrl = chrome.runtime.getURL(`detectors/icons/${detectorObj.icon}`);
          if (isFingerprintCategory) {
            detectorIconHtml = `<div class="modal-detector-icon-svg fingerprint-icon fingerprint-icon-shell"><img src="${iconUrl}" alt="${safeName}" class="fingerprint-icon-image fingerprint-icon-image--builtin history-modal-fingerprint-image"></div>`;
          } else {
            detectorIconHtml = `<img src="${iconUrl}" alt="${safeName}" class="modal-detector-icon">`;
          }
        }
      } else {
        // Fallback: Use Scrapfly icon for all detectors without official icons
        const scrapflyIconUrl = chrome.runtime.getURL('icons/icon32.png');
        if (isFingerprintCategory) {
          detectorIconHtml = `<div class="modal-detector-icon-svg fingerprint-icon fingerprint-icon-shell"><img src="${scrapflyIconUrl}" alt="${safeName}" class="fingerprint-icon-image fingerprint-icon-image--default history-modal-fingerprint-image"></div>`;
        } else {
          detectorIconHtml = `<img src="${scrapflyIconUrl}" alt="${safeName}" class="modal-detector-icon">`;
        }
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
              <div class="history-modal-detection-name">${safeName}</div>
            </div>
            <div class="history-modal-detection-right">
              <span class="history-modal-confidence ${confidenceClass}">${confidence}%</span>
              ${hasMethods ? '<span class="history-modal-expand-icon">▼</span>' : ''}
            </div>
          </div>
          ${hasMethods ? `
            <div class="history-modal-detection-details">
              <div class="history-modal-detection-meta">
                <span class="history-modal-badge" style="${categoryStyle}">${safeCategory}</span>
                ${methodTypeBadges ? `<span class="history-modal-meta-separator">•</span><span class="history-modal-method-types">${methodTypeBadges}</span>` : ''}
                <span class="history-modal-meta-separator">•</span>
                <span class="history-modal-match-count">${matchCount === 1 ? _tr('historyOneMatch', '1 match') : _fmt('historyMatchCountFmt', `${matchCount} matches`, matchCount)}</span>
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

    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const methodLabelKey = {
      url: 'methodLabelUrl', header: 'methodLabelHeader', cookie: 'methodLabelCookie',
      content: 'methodLabelContent', dom: 'methodLabelDom', js_hooks: 'methodLabelJsHooks',
      window: 'methodLabelWindow', payload: 'methodLabelPayload'
    };

    const visibleTypes = typeKeys.slice(0, 4);
    const overflowCount = typeKeys.length - visibleTypes.length;

    const badgesHtml = visibleTypes.map(typeKey => {
      const fallbackLabel = typeKey.replace(/_/g, ' ').toUpperCase();
      const label = methodLabelKey[typeKey] ? _tr(methodLabelKey[typeKey], fallbackLabel) : fallbackLabel;

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
    const _t2 = (typeof I18n !== 'undefined') ? I18n : null;
    NotificationHelper.success((_t2 && _t2.format('notificationHistoryExportedFmt', this.historyItems.length)) || `Exported ${this.historyItems.length} history items`);
  }

  /**
   * Handle import of history from file
   * @param {Event} event - File change event
   */
  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.items || !Array.isArray(data.items)) {
        throw new Error('Invalid history file format');
      }

      const shouldMerge = await NotificationHelper.confirm({
        title: _tr('importHistoryTitle', 'Import History'),
        message: _fmt('importHistoryMessageFmt', `Import ${data.items.length} history items? Current history has ${this.historyItems.length} items.`, data.items.length, this.historyItems.length),
        type: 'info',
        confirmText: _tr('mergeOption', 'Merge'),
        cancelText: _tr('replaceOption', 'Replace')
      });

      if (shouldMerge) {
        const existingIds = new Set(this.historyItems.map(item => item.id));
        const newItems = data.items.filter(item => !existingIds.has(item.id));
        this.historyItems = [...newItems, ...this.historyItems];

        this.historyItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (this.historyLimit > 0 && this.historyItems.length > this.historyLimit) {
          this.historyItems = this.historyItems.slice(0, this.historyLimit);
        }

        NotificationHelper.success(_fmt('notificationHistoryMergedFmt', `Merged ${newItems.length} new history items`, newItems.length));
      } else {
        this.historyItems = this.historyLimit > 0
          ? data.items.slice(0, this.historyLimit)
          : data.items;
        NotificationHelper.success(_fmt('notificationHistoryReplacedFmt', `Replaced history with ${this.historyItems.length} items`, this.historyItems.length));
      }

      await this.saveHistoryToStorage();
      this.renderHistory();
    } catch (error) {
      NotificationHelper.error(_fmt('notificationImportHistoryFailedFmt', 'Failed to import history: ' + error.message, error.message));
    }

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
        Logger.warn('UI', '[History] History limit read failed, defaulting to unlimited', error);
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
      Logger.warn('UI', '[History] Limit refresh failed, keeping current value', error);
    }
  }

  registerSettingsListener() {
    if (this._settingsListenerAttached) return;
    this._settingsListenerAttached = true;
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== 'SETTINGS_UPDATED') {
        return;
      }

      this.refreshHistoryLimit()
        .then(() => this.loadHistoryFromStorage())
        .then(() => this.renderHistory())
        .catch(error => {
          Logger.warn('UI', '[History] Refresh after settings update failed', error);
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
      Logger.error('UI', '[History] HTML load failed', error);
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
        const t = (typeof I18n !== 'undefined') ? I18n : null;
        const _tr = (key, fallback) => (t && t.get(key)) || fallback;
        const confirmed = await NotificationHelper.confirm({
          title: _tr('dialogClearHistoryTitle', 'Clear History'),
          message: _tr('dialogClearHistoryMessage', 'Are you sure you want to clear all history? This action cannot be undone.'),
          type: 'danger',
          confirmText: _tr('buttonClearAll', 'Clear All'),
          cancelText: _tr('btnCancel', 'Cancel'),
          emphasizeAction: true
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
   * Normalize URL/hostname into duplicate-comparison key.
   * @param {string} url - URL candidate
   * @param {string} hostname - Hostname fallback
   * @param {string} scope - Duplicate scope: domain|path|full_url
   * @returns {string|null} Normalized key or null if unavailable
   */
  static normalizeDuplicateKey(url, hostname, scope = 'full_url') {
    const duplicateScope = ['domain', 'path', 'full_url'].includes(scope) ? scope : 'full_url';
    const rawUrl = typeof url === 'string' ? url.trim() : '';
    const rawHostname = typeof hostname === 'string' ? hostname.trim() : '';

    const normalizeHostname = (hostValue) => {
      if (!hostValue || typeof hostValue !== 'string') {
        return '';
      }
      const normalized = hostValue.trim().toLowerCase();
      return (normalized && normalized !== 'unknown') ? normalized : '';
    };

    let parsedUrl = null;
    if (rawUrl) {
      try {
        parsedUrl = new URL(rawUrl);
      } catch (error) {
        Logger.debug('UI', `[History] normalizeDuplicateKey parse failed for scope "${duplicateScope}", using hostname fallback`);
      }
    }

    const fallbackHostname = normalizeHostname(rawHostname)
      || normalizeHostname(rawUrl ? UrlUtils.getHostnameFromUrl(rawUrl) : '');

    if (duplicateScope === 'domain') {
      const hostnameKey = parsedUrl ? normalizeHostname(parsedUrl.hostname) : fallbackHostname;
      return hostnameKey || null;
    }

    if (duplicateScope === 'path') {
      if (parsedUrl) {
        return `${parsedUrl.origin}${parsedUrl.pathname}`;
      }
      return fallbackHostname || null;
    }

    if (parsedUrl) {
      return parsedUrl.href;
    }

    return fallbackHostname || null;
  }

  /**
   * Check whether a history array already contains a duplicate key in the time window.
   * @param {Array} history - History items
   * @param {string} normalizedKey - Candidate duplicate key
   * @param {number} cutoffTime - Minimum timestamp (ms) to consider
   * @param {string} scope - Duplicate scope: domain|path|full_url
   * @returns {boolean} True if duplicate exists
   */
  static isDuplicateHistoryEntry(history, normalizedKey, cutoffTime, scope = 'full_url') {
    if (!Array.isArray(history) || !normalizedKey) {
      return false;
    }

    return history.some((item) => {
      if (!item) {
        return false;
      }

      const rawTimestamp = typeof item.timestamp === 'string'
        ? new Date(item.timestamp).getTime()
        : Number(item.timestamp);
      const itemTimestamp = Number.isFinite(rawTimestamp) ? rawTimestamp : 0;

      if (itemTimestamp < cutoffTime) {
        return false;
      }

      const itemKey = this.normalizeDuplicateKey(item.url, item.hostname, scope);
      return !!itemKey && itemKey === normalizedKey;
    });
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
            Logger.warn('UI', '[History] JSON parse failed in duplicate check', parseError);
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

      const duplicateScope = settings.duplicateScope || 'full_url';
      const duplicateDuration = Number.isFinite(parseInt(settings.duplicateDuration, 10))
        ? parseInt(settings.duplicateDuration, 10)
        : 1;
      const duplicateUnit = settings.duplicateUnit || 'hours';

      const durationMs = FormatUtils.convertToMilliseconds(
        duplicateDuration,
        duplicateUnit
      );

      const now = Date.now();
      const cutoffTime = now - durationMs;
      const normalizedKey = this.normalizeDuplicateKey(url, null, duplicateScope);
      if (!normalizedKey) {
        Logger.debug('UI', `[History] Duplicate pre-check could not normalize key (scope: ${duplicateScope}), allowing save`);
        return true;
      }

      const isDuplicate = this.isDuplicateHistoryEntry(history, normalizedKey, cutoffTime, duplicateScope);

      if (isDuplicate) {
        Logger.ui(`History: Skipping duplicate URL within ${duplicateDuration} ${duplicateUnit} (scope: ${duplicateScope}, source: precheck): ${normalizedKey}`);
        return false;
      }

      return true;
    } catch (error) {
      Logger.warn('UI', '[History] Duplicate check failed', error);
      return true; // On error, allow save
    }
  }

  /**
   * Save detection results to history (called from background.js)
   * @param {number} tabId - Tab ID
   * @param {Object} pageData - Page data
   * @param {Array} detectionResults - Detection results
   * @param {Object} chrome - Chrome API object
   * @param {Object} options - Save options
   * @param {Object} options.historySettings - Optional preloaded history settings
   * @param {string} options.source - Save source context (e.g., finalize, cache_hit)
   * @returns {Promise<boolean>} Success status
   */
  static saveDetectionToHistory(tabId, pageData, detectionResults, chrome, options = {}) {
    // Serialize all writes: each call awaits the previous, eliminating the
    // get-modify-set race that could lose history entries when two detections
    // finish back-to-back.
    if (!History._saveQueue) History._saveQueue = Promise.resolve();
    const work = History._saveQueue
      .catch(() => undefined)
      .then(() => History._doSaveDetectionToHistory(tabId, pageData, detectionResults, chrome, options));
    History._saveQueue = work.catch(() => undefined);
    return work;
  }

  static async _doSaveDetectionToHistory(tabId, pageData, detectionResults, chrome, options = {}) {
    const {
      historySettings = null,
      source = 'unknown'
    } = options || {};

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
            Logger.warn('UI', '[History] JSON parse failed', parseError);
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

      const settings = historySettings || await Utils.getHistorySettings();
      const duplicateScope = settings.duplicateScope || 'full_url';
      const duplicateDuration = Number.isFinite(parseInt(settings.duplicateDuration, 10))
        ? parseInt(settings.duplicateDuration, 10)
        : 1;
      const duplicateUnit = settings.duplicateUnit || 'hours';

      if (settings.preventDuplicates) {
        const durationMs = FormatUtils.convertToMilliseconds(duplicateDuration, duplicateUnit);
        const cutoffTime = Date.now() - durationMs;
        const normalizedKey = this.normalizeDuplicateKey(pageData.url, pageData.hostname, duplicateScope);

        if (!normalizedKey) {
          Logger.debug('UI', `[History] Duplicate save-check could not normalize key (scope: ${duplicateScope}, source: ${source}), allowing save`);
        } else if (this.isDuplicateHistoryEntry(history, normalizedKey, cutoffTime, duplicateScope)) {
          Logger.ui(`History: Skipping duplicate history save within ${duplicateDuration} ${duplicateUnit} (scope: ${duplicateScope}, source: ${source}): ${normalizedKey}`);
          return false;
        }
      }

      const historyLimit = Number.isFinite(parseInt(settings.historyLimit, 10))
        ? parseInt(settings.historyLimit, 10)
        : 0; // 0 = unlimited
      // Get current cache scope setting
      const cacheScope = await Utils.getCacheScope();
      const normalizedFavicon = UrlUtils.normalizeFaviconForStorage(
        pageData.favicon,
        pageData.url || pageData.hostname
      );

      // Create history entry
      const entryUrl = pageData.url || '';
      const entryHostname = pageData.hostname || UrlUtils.getHostnameFromUrl(entryUrl);
      const historyEntry = {
        id: `detection_${Date.now()}_${tabId}`,
        url: entryUrl,
        hostname: entryHostname,
        title: pageData.tabTitle || pageData.title || 'Untitled',
        favicon: normalizedFavicon,
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
      Logger.error('UI', '[History] Detection save failed', error);
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

if (typeof window !== 'undefined') {
  window.History = History;
}
