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
    Logger.debug('UI', 'History.displayHistory called');

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
      this.historyItems = await HistoryStore.read(chrome.storage.local);
      if (this.historyLimit > 0 && this.historyItems.length > this.historyLimit) {
        this.historyItems = this.historyItems.slice(0, this.historyLimit);
      }
      Logger.debug('UI', 'Loaded history items:', this.historyItems.length);
    } catch (error) {
      Logger.warn('UI', '[History] Storage load failed', error);
      this.historyItems = [];
    }
  }

  /**
   * Ask the service worker to change the stored history. The popup never
   * writes `scrapfly_history` itself: its copy is only for display, and writing
   * it back would drop entries the worker saved since the popup opened.
   * @param {object} message - One of the HistoryStore.Messages requests
   * @returns {Promise<object>} Worker response ({ status: 'ok', ... })
   */
  async sendHistoryChange(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response || response.status !== 'ok') {
      throw new Error((response && response.error) || 'History update failed');
    }
    return response;
  }

  /**
   * Import: let the worker merge / replace against the stored list, then reload.
   * @param {Array<object>} items - Imported items
   * @param {'merge'|'replace'} mode
   */
  async saveHistoryToStorage(items = this.historyItems, mode = 'replace') {
    await this.sendHistoryChange({
      type: HistoryStore.Messages.REPLACE_ITEMS,
      items,
      mode,
      limit: this.historyLimit
    });
    await this.loadHistoryFromStorage();
    Logger.debug('UI', 'History saved to storage');
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

    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const moreLabel = FormatUtils.escapeHtml(_tr('historyMoreActions', 'More actions'));
    const scrapflyLabel = FormatUtils.escapeHtml(_tr('scrapflyExportTitle', 'Scrape with Scrapfly'));
    const scrapflyLogo = (typeof ScrapflyExport !== 'undefined') ? ScrapflyExport.logoHtml('history-scrapfly-logo') : '';
    const untitledLabel = _tr('historyUiUntitled', 'Untitled');
    const unknownLabel = _tr('timeUnknown', 'Unknown');

    const buildHistoryItemHtml = (item) => {
      const timeAgo = this.getTimeAgo(new Date(item.timestamp));
      // getDomainFromUrl answers 'Unknown' (English, also used in filenames) without a URL
      const domain = item.url ? this.getDomainFromUrl(item.url) : unknownLabel;
      // Page title on top, domain underneath; entries saved without a real title fall back to the domain
      // ('Untitled' is the value stored for pages without a title)
      const rawTitle = (item.title && item.title !== 'Untitled') ? item.title : (domain || untitledLabel);
      const safeTitle = FormatUtils.escapeHtml(rawTitle);
      const safeUrl = FormatUtils.escapeHtml(item.url || '');
      const safeDomain = FormatUtils.escapeHtml(domain);

      const faviconSrc = UrlUtils.resolveDisplayFavicon(item.favicon, item.url || item.hostname);
      const summary = this.getHistorySummary(item);
      const cardDetections = item.detections || [];
      const hasCardDetections = summary.totalDetections > 0;
      // Breakdown tips, the same ones the detail modal shows
      const detectionsTip = hasCardDetections ? FormatUtils.detectionsTip(cardDetections, summary.labels.detections) : null;
      const confidenceTip = hasCardDetections ? FormatUtils.confidenceTip(cardDetections, `${summary.labels.confidence}: ${summary.avgConfidence}%`) : null;
      const difficultyTip = hasCardDetections ? FormatUtils.difficultyTip(cardDetections, summary.difficulty, `${summary.labels.difficulty}: ${summary.difficultyDisplay}`) : null;

      return `
        <div class="history-item" data-history-id="${item.id}">
          <div class="history-item-top">
            <span class="history-favicon-tile">
              <img src="${faviconSrc}" alt="" class="history-favicon" data-fallback="${UrlUtils.getDefaultFaviconUrl()}">
            </span>
            <div class="history-item-content">
              <div class="history-title" title="${safeTitle}">${safeTitle}</div>
              <div class="history-subline">
                <span class="history-url" title="${safeUrl}">${safeDomain}</span>
                <span class="history-subline-dot" aria-hidden="true">•</span>
                <span class="history-metrics">
                  <span class="history-metric" ${detectionsTip
                    ? FormatUtils.tipAttrs(detectionsTip.title, detectionsTip.detail, detectionsTip.rows)
                    : `data-tip="${FormatUtils.escapeAttr(summary.labels.detections)}"`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/></svg>
                    <span class="history-metric-value">${summary.totalDetections}</span>
                  </span>
                  ${FormatUtils.confidenceHtml(summary.avgConfidence, 'history-metric', confidenceTip)}
                  ${FormatUtils.difficultyHtml(summary.difficulty, summary.difficultyDisplay, 'history-difficulty-pill', difficultyTip)}
                </span>
              </div>
            </div>
            ${scrapflyLogo && ScrapflyExport.targetUrl(item.url) ? `<button class="history-item-action-btn history-scrapfly-btn" data-action="scrapfly" title="${scrapflyLabel}" aria-label="${scrapflyLabel}">${scrapflyLogo}</button>` : ''}
            <button class="history-item-action-btn history-more-btn" data-action="menu" title="${moreLabel}" aria-label="${moreLabel}" aria-haspopup="menu" aria-expanded="false">
              <svg width="14" height="4" viewBox="0 0 14 4" aria-hidden="true">
                <circle cx="1.8" cy="2" r="1.2" fill="currentColor"/>
                <circle cx="7" cy="2" r="1.2" fill="currentColor"/>
                <circle cx="12.2" cy="2" r="1.2" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div class="history-item-bottom">
            <div class="history-detections">
              ${this.renderHistoryDetections(item.detections || [], item.id)}
            </div>
            <span class="history-timestamp" data-tip="${FormatUtils.escapeAttr(FormatUtils.formatDateTime(item.timestamp))}">${FormatUtils.escapeHtml(timeAgo)}</span>
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
      const noDetections = FormatUtils.t('historyNoDetections', 'No detections');
      return `<span class="history-detection-tag">${FormatUtils.escapeHtml(noDetections)}</span>`;
    }
    const unknownName = FormatUtils.t('timeUnknown', 'Unknown');

    let tagsHtml = '';
    const maxTags = 4; // 4 icons + "+N" leave room for the detections / confidence metrics

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
      const rawName = detection.detector?.name || detection.detector || '';
      const name = rawName || unknownName;
      const category = detection.category || '';
      const categoryColor = getCategoryColor(category);
      const categoryKey = FormatUtils.categoryKey(detection);
      const confidenceValue = Math.round(Number(detection.confidence) || 0);
      // Same hover card as elsewhere: name with its category dot, category and confidence
      const tooltipAttrs = FormatUtils.tipAttrs(name,
        `${FormatUtils.categoryLabel(categoryKey)} · ${FormatUtils.t('clipboardConfidenceFmt', 'Confidence: {0}%', confidenceValue)}`,
        [], `cat-${categoryKey}`);
      const safeName = FormatUtils.escapeHtml(name);

      // Get detector object to retrieve icon
      let detectorObj = null;
      let iconHtml = '';

      if (this.detectorManager && category && rawName) {
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
        const scrapflyIconUrl = chrome.runtime.getURL('icons/icon128.png');
        if (isFingerprintCategory) {
          iconHtml = `<div class="detection-icon-svg fingerprint-icon fingerprint-icon-shell"><img src="${scrapflyIconUrl}" alt="${safeName}" class="fingerprint-icon-image fingerprint-icon-image--default history-fingerprint-image"></div>`;
          isFingerprint = true;
        } else {
          // No vendor logo: the Scrapfly mark sits bare on the chip (no white plate)
          iconHtml = `<img src="${chrome.runtime.getURL('icons/icon128.png')}" alt="${safeName}" class="detection-icon detection-icon--default">`;
        }
      }

      const badgeClass = isFingerprint ? 'history-detection-tag icon-badge fingerprint-badge' : 'history-detection-tag icon-badge';
      tagsHtml += `<span class="${badgeClass}" ${tooltipAttrs} style="border-color: ${categoryColor};">${iconHtml}</span>`;
    });

    if (sortedDetections.length > maxTags) {
      const hiddenDetections = sortedDetections.slice(maxTags);
      // The hidden ones, each with its category dot and confidence
      const rows = hiddenDetections.slice(0, 8).map(d => {
        const key = FormatUtils.categoryKey(d);
        const value = Math.round(Number(d.confidence) || 0);
        return { label: d.detector?.name || d.detector || unknownName, dot: `cat-${key}`, value: `${value}%`, tone: FormatUtils.confidenceTone(value) };
      });
      if (hiddenDetections.length > 8) rows.push({ label: FormatUtils.t('tipMoreFmt', '+{0} more', hiddenDetections.length - 8) });
      const tooltipAttr = ` ${FormatUtils.tipAttrs(FormatUtils.t('tipMoreFmt', '+{0} more', hiddenDetections.length), '', rows)}`;

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
   * Display-ready summary of a history entry, shared by the card and the detail modal
   * @param {Object} item - History item with detections and cacheScope
   * @returns {Object} counts, tones and localized labels
   */
  getHistorySummary(item) {
    const detections = item.detections || [];
    const stats = this.calculateHistoryStats(detections);
    const _tr = (key, fallback) => FormatUtils.t(key, fallback);

    const scopeKeyByValue = { domain: 'scopeDomain', path: 'scopePath', url: 'scopeFullUrl', full: 'scopeFullUrl', full_url: 'scopeFullUrl' };
    const scopeFallback = { domain: 'Domain', path: 'Path', url: 'Full URL', full: 'Full URL', full_url: 'Full URL' };
    const cacheScope = String(item.cacheScope || 'domain').toLowerCase();
    const scopeDisplay = _tr(scopeKeyByValue[cacheScope] || 'scopeDomain', scopeFallback[cacheScope] || 'Domain');

    const difficultyKeyByValue = { Low: 'difficultyLow', Medium: 'difficultyMedium', High: 'difficultyHigh' };
    const difficultyKey = difficultyKeyByValue[stats.difficulty];
    const difficultyDisplay = difficultyKey ? _tr(difficultyKey, stats.difficulty || '') : (stats.difficulty || '');

    const confidenceTone = FormatUtils.confidenceTone(stats.avgConfidence);
    const difficultyTone = { High: 'red', Medium: 'amber', Low: 'green' }[stats.difficulty] || 'green';

    // Per-category counts for the modal breakdown (Anti-bot, Captcha, Fingerprint, other)
    const categoryCounts = { antibot: 0, captcha: 0, fingerprint: 0, other: 0 };
    detections.forEach(d => {
      const cat = String(d.category || '').toLowerCase().replace(/[^a-z]/g, '');
      if (cat.includes('antibot')) categoryCounts.antibot++;
      else if (cat.includes('captcha')) categoryCounts.captcha++;
      else if (cat.includes('fingerprint')) categoryCounts.fingerprint++;
      else categoryCounts.other++;
    });

    return {
      ...stats,
      difficultyDisplay,
      difficultyTone,
      confidenceTone,
      scopeDisplay,
      categoryCounts,
      labels: {
        detections: _tr('statDetections', 'Detections'),
        confidence: _tr('statConfidence', 'Confidence'),
        difficulty: _tr('statDifficulty', 'Difficulty'),
        scope: _tr('statCacheScope', 'Cache Scope')
      }
    };
  }

  /**
   * Summary block of the detail modal: three metric tiles, then a category bar
   * @param {Object} item - History item
   * @returns {string} HTML
   */
  renderHistoryModalSummary(item) {
    const s = this.getHistorySummary(item);
    const esc = FormatUtils.escapeHtml;
    const detections = item.detections || [];
    // Same hover card as the category bar: a title, what the number means and a breakdown
    const tipFor = (tip) => (tip ? ` tabindex="0" ${FormatUtils.tipAttrs(tip.title, tip.detail, tip.rows)}` : '');
    const tile = (cls, label, value, tone = '', tip = null) => `
      <div class="hm-metric ${cls}"${tipFor(tip)}>
        <div class="hm-metric-label">${esc(label)}</div>
        <div class="hm-metric-value${tone ? ` tone-${tone}` : ''}">${esc(String(value))}</div>
      </div>`;
    const hasDetections = s.totalDetections > 0;
    const detectionsTip = hasDetections ? FormatUtils.detectionsTip(detections, s.labels.detections) : null;
    const confidenceTip = hasDetections ? FormatUtils.confidenceTip(detections, `${s.labels.confidence}: ${s.avgConfidence}%`) : null;
    const difficultyTip = hasDetections ? FormatUtils.difficultyTip(detections, s.difficulty, `${s.labels.difficulty}: ${s.difficultyDisplay}`) : null;

    const segments = [
      { key: 'antibot', label: FormatUtils.t('categoryAntibot', 'Anti-bot') },
      { key: 'captcha', label: FormatUtils.t('categoryCaptcha', 'Captcha') },
      { key: 'fingerprint', label: FormatUtils.t('categoryFingerprint', 'Fingerprint') },
      { key: 'other', label: FormatUtils.t('statsCategoryOther', 'Other') }
    ].filter(seg => s.categoryCounts[seg.key] > 0);

    const bar = s.totalDetections > 0 ? `
      <div class="hm-breakdown">
        <div class="hm-bar">
          ${segments.map(seg => {
            const count = s.categoryCounts[seg.key];
            const pct = Math.round((count / s.totalDetections) * 100);
            const detail = FormatUtils.t('historyCategoryShareFmt', '{0} of {1} detections · {2}%', count, s.totalDetections, pct);
            return `<span class="hm-bar-seg cat-${seg.key}" style="flex: ${count}" role="img" aria-label="${FormatUtils.escapeAttr(`${seg.label}: ${detail}`)}" data-tip="${FormatUtils.escapeAttr(seg.label)}" data-tip-detail="${FormatUtils.escapeAttr(detail)}" data-tip-dot="cat-${seg.key}"></span>`;
          }).join('')}
        </div>
        <div class="hm-legend">
          ${segments.map(seg => {
            const count = s.categoryCounts[seg.key];
            const pct = Math.round((count / s.totalDetections) * 100);
            const detail = FormatUtils.t('historyCategoryShareFmt', '{0} of {1} detections · {2}%', count, s.totalDetections, pct);
            return `<span class="hm-legend-item" ${FormatUtils.tipAttrs(seg.label, detail, [], `cat-${seg.key}`)}><i class="hm-dot cat-${seg.key}"></i>${esc(seg.label)}<b>${count}</b></span>`;
          }).join('')}
          <span class="hm-legend-scope" ${FormatUtils.tipAttrs(`${s.labels.scope}: ${s.scopeDisplay}`, this.getScopeHint(item.cacheScope))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a13 13 0 0 0 0 18a13 13 0 0 0 0-18M3 12h18"/></svg>${esc(s.scopeDisplay)}
          </span>
        </div>
      </div>` : '';

    return `
      <div class="hm-metrics">
        ${tile('hm-metric-detections', s.labels.detections, s.totalDetections, '', detectionsTip)}
        ${tile('hm-metric-confidence', s.labels.confidence, `${s.avgConfidence}%`, s.confidenceTone, confidenceTip)}
        ${tile('hm-metric-difficulty', s.labels.difficulty, s.difficultyDisplay, s.difficultyTone, difficultyTip)}
      </div>
      ${bar}
    `;
  }

  /**
   * What a cache scope means, for its hover tip.
   * @param {string} scope - domain | path | full
   * @returns {string}
   */
  getScopeHint(scope) {
    const value = String(scope || 'domain').toLowerCase();
    if (value === 'path') return FormatUtils.t('tipScopePath', 'Results are reused for this exact path, whatever the query.');
    if (value === 'full' || value === 'url' || value === 'full_url') return FormatUtils.t('tipScopeFullUrl', 'Results are reused only for this exact URL, including the query.');
    return FormatUtils.t('tipScopeDomain', 'Results are reused for every page on this domain.');
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
        // Toggle expand/collapse on header click or Enter / Space
        const toggle = () => {
          const isExpanded = card.classList.toggle('expanded');
          methods.style.display = isExpanded ? 'flex' : 'none';
          header.setAttribute('aria-expanded', String(isExpanded));
        };
        header.addEventListener('click', toggle);
        header.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
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
      await this.sendHistoryChange({ type: HistoryStore.Messages.CLEAR });
      this.historyItems = [];
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
   * History keeps detections without icons: take them from the installed
   * detectors (by id, else by category and name, as the cards do)
   * @param {Array<object>} detections
   * @returns {Array<object>}
   */
  withDetectorIcons(detections) {
    const dm = this.detectorManager;
    if (!dm) return detections;
    const categories = { 'anti-bot': 'antibot', antibot: 'antibot', captcha: 'captcha', fingerprint: 'fingerprint' };
    return detections.map(detection => {
      const name = detection?.detector?.name || detection?.name;
      const rawCategory = String(detection?.category || detection?.detector?.category || '');
      const category = categories[rawCategory.toLowerCase()] || rawCategory.toLowerCase().replace(/[^a-z]/g, '');
      const found = (detection?.detector?.id && dm.findDetectorById?.(detection.detector.id))
        || (name && category && dm.getDetectorByName?.(category, name));
      if (!found) return detection;
      return { ...detection, detector: { ...(detection.detector || {}), name, icon: found.icon, customIcon: found.customIcon } };
    });
  }

  /**
   * Setup click handlers for history items
   */
  setupHistoryItemHandlers() {
    // Card buttons: copy and Scrapfly act directly, "…" opens the shared per-entry menu
    document.querySelectorAll('#historyList .history-item-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = e.currentTarget.dataset.action;
        const historyItem = e.currentTarget.closest('.history-item');
        const historyId = historyItem.dataset.historyId;
        const item = this.historyItems.find(h => h.id === historyId);

        if (!item) return;

        if (action === 'copy') {
          this.copyHistoryItem(item);
        } else if (action === 'scrapfly') {
          this.closeMenus();
          ScrapflyExport.open({ url: item.url, detections: this.withDetectorIcons(item.detections || []) });
        } else if (action === 'menu') {
          const menu = document.querySelector('#historyItemMenu');
          if (this._openMenu && this._openMenu.anchor === e.currentTarget) {
            this.closeMenus();
          } else if (menu) {
            this.openMenu(menu, e.currentTarget);
            this._menuItemId = historyId;
          }
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
    Logger.debug('UI', 'Showing details for history item:', historyItem);

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
        favicon.src = UrlUtils.getDefaultFaviconUrl();
      };
    }
    if (title) {
      title.textContent = (historyItem.title && historyItem.title !== 'Untitled')
        ? historyItem.title
        : FormatUtils.t('historyUiUntitled', 'Untitled');
    }
    if (url) {
      url.textContent = this.getDomainFromUrl(historyItem.url || '') || historyItem.url;
      url.href = historyItem.url;
      url.title = historyItem.url || '';
    }
    if (timestamp) {
      const timeAgo = this.getTimeAgo(new Date(historyItem.timestamp));
      const fullDate = FormatUtils.formatDateTime(historyItem.timestamp);
      timestamp.textContent = timeAgo;
      timestamp.title = fullDate;
    }
    if (modalStats) {
      modalStats.innerHTML = this.renderHistoryModalSummary(historyItem);
    }
    this._modalItemId = historyItem.id;

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
    const L = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    const title = (historyItem.title && historyItem.title !== 'Untitled')
      ? historyItem.title
      : L('historyUiUntitled', 'Untitled');
    let text = L('clipboardUrlFmt', 'URL: {0}', historyItem.url) + '\n';
    text += L('clipboardTitleFmt', 'Title: {0}', title) + '\n';
    text += L('clipboardTimestampFmt', 'Timestamp: {0}', FormatUtils.formatDateTime(historyItem.timestamp)) + '\n';
    text += '\n' + L('clipboardDetectionsListFmt', 'Detections ({0}):', historyItem.detections?.length || 0) + '\n';
    text += '─'.repeat(50) + '\n\n';

    const unknownValue = L('detectionUiUnknownValue', 'unknown');
    (historyItem.detections || []).forEach((detection, index) => {
      const name = detection.detector?.name || detection.detector || L('timeUnknown', 'Unknown');
      const category = detection.category || '';
      const confidence = detection.confidence || 0;

      text += `${index + 1}. ${name}\n`;
      text += '   ' + L('clipboardCategoryFmt', 'Category: {0}', category) + '\n';
      text += '   ' + L('clipboardConfidenceFmt', 'Confidence: {0}%', confidence) + '\n';

      if (detection.matches && detection.matches.length > 0) {
        text += '   ' + L('clipboardDetectionMethodsHeading', 'Detection Methods:') + '\n';
        detection.matches.forEach(match => {
          const methodType = (match.type || 'unknown').replace(/_/g, ' ').toUpperCase();
          const value = match.fullUrl || match.value || match.name || match.selector || match.pattern || unknownValue;
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
        tone: 'danger',
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

      // The worker removes it from the stored list; then reload so entries it
      // saved since the popup opened show up instead of being overwritten.
      await this.sendHistoryChange({ type: HistoryStore.Messages.DELETE_ITEMS, ids: [historyItem.id] });
      await this.loadHistoryFromStorage();
      this.renderHistory();

      NotificationHelper.success(_tr('notificationHistoryItemDeleted', 'History item deleted'));
      Logger.debug('UI', 'History: Item deleted successfully');
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
    const categoryClass = (category) => {
      const cat = String(category || '').toLowerCase().replace(/[^a-z]/g, '');
      if (cat.includes('antibot')) return 'antibot';
      if (cat.includes('captcha')) return 'captcha';
      if (cat.includes('fingerprint')) return 'fingerprint';
      return 'other';
    };
    const categoryOrder = { antibot: 0, captcha: 1, fingerprint: 2, other: 3 };

    // Anti-bot first, then captcha, then fingerprint; strongest confidence first in each group.
    // The original index is kept so data-detection-index still points into the stored array.
    const ordered = detections
      .map((detection, index) => ({ detection, index }))
      .sort((a, b) => (categoryOrder[categoryClass(a.detection.category)] - categoryOrder[categoryClass(b.detection.category)])
        || ((b.detection.confidence || 0) - (a.detection.confidence || 0)));

    return ordered.map(({ detection, index }) => {
      const rawName = detection.detector?.name || detection.detector || '';
      const name = rawName || _tr('unknownDetection', 'Unknown Detection');
      const safeName = FormatUtils.escapeHtml(name);
      const category = detection.category || '';
      const categoryKey = categoryKeyByValue[String(category).toLowerCase()] || null;
      const translatedCategory = categoryKey ? _tr(categoryKey, category) : category;
      const safeCategory = FormatUtils.escapeHtml(translatedCategory);
      const catClass = categoryClass(category);
      const confidence = Math.round(Number(detection.confidence) || 0);
      const hasMethods = detection.matches && detection.matches.length > 0;

      // The rule as loaded now: by id first (names can change), then by name
      let detectorObj = null;
      if (this.detectorManager) {
        const id = detection.detector && typeof detection.detector === 'object' ? detection.detector.id : '';
        detectorObj = (id && this.detectorManager.findDetectorById?.(id))
          || (category && rawName ? this.detectorManager.getDetectorByName(category, name) : null);
      }
      const isFingerprintCategory = catClass === 'fingerprint';

      // Detector icon: vendor logo on a white plate, fingerprint glyphs tinted blue
      let detectorIconHtml = '';
      if (detectorObj && detectorObj.icon) {
        const iconName = detectorObj.icon.toLowerCase();
        if (FINGERPRINT_ICONS[iconName]) {
          detectorIconHtml = `<div class="modal-detector-icon-svg fingerprint-icon fingerprint-icon-shell">${FINGERPRINT_ICONS[iconName]}</div>`;
        } else {
          const iconUrl = chrome.runtime.getURL(`detectors/icons/${detectorObj.icon}`);
          detectorIconHtml = isFingerprintCategory
            ? `<div class="modal-detector-icon-svg fingerprint-icon fingerprint-icon-shell"><img src="${iconUrl}" alt="${safeName}" class="fingerprint-icon-image fingerprint-icon-image--builtin history-modal-fingerprint-image"></div>`
            : `<img src="${iconUrl}" alt="${safeName}" class="modal-detector-icon">`;
        }
      } else {
        const scrapflyIconUrl = chrome.runtime.getURL('icons/icon128.png');
        detectorIconHtml = isFingerprintCategory
          ? `<div class="modal-detector-icon-svg fingerprint-icon fingerprint-icon-shell"><img src="${scrapflyIconUrl}" alt="${safeName}" class="fingerprint-icon-image fingerprint-icon-image--default history-modal-fingerprint-image"></div>`
          : `<img src="${scrapflyIconUrl}" alt="${safeName}" class="modal-detector-icon modal-detector-icon--default">`;
      }

      const methodsHtml = this.renderDetectionMethods(detection.matches || []);
      const combinationsHtml = this.renderHistoryCombinations(detection, detectorObj, index);
      const matchCount = detection.matches?.length || 0;
      const methodTypeBadges = this.renderMethodTypeBadges(detection.matches || []);
      const expandLabel = FormatUtils.escapeAttr(_tr('detectionModalDetectionMethods', 'Detection methods'));

      return `
        <div class="history-modal-detection-card cat-${catClass} ${hasMethods ? 'has-methods' : ''}" data-detection-index="${index}">
          <div class="history-modal-detection-header"${hasMethods ? ` role="button" tabindex="0" aria-expanded="false" aria-label="${expandLabel}"` : ''}>
            <div class="history-modal-detection-icon icon-${catClass}">${detectorIconHtml}</div>
            <div class="history-modal-detection-content">
              <div class="history-modal-detection-title">
                <span class="history-modal-detection-name" title="${FormatUtils.escapeAttr(name)}">${safeName}</span>
                ${safeCategory ? `<span class="history-modal-badge cat-${catClass}">${safeCategory}</span>` : ''}
              </div>
              <div class="history-modal-detection-chips">${methodTypeBadges}</div>
            </div>
            <div class="history-modal-detection-right">
              ${FormatUtils.confidenceHtml(confidence, 'history-modal-score')}
              ${hasMethods ? `
                <span class="history-modal-expand-btn" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                </span>
              ` : ''}
            </div>
          </div>
          ${hasMethods ? `
            <div class="history-modal-detection-details">
              ${combinationsHtml}
              <div class="history-modal-match-count">${FormatUtils.escapeHtml(_tr('historyMatchedDetections', 'Matched detections'))}</div>
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
   * Matched combinations of one detection as checklists (CombinationChecklist),
   * rebuilt from the rule as it is now. Popup only: the worker never renders History.
   */
  renderHistoryCombinations(detection, definition, index) {
    const combos = Array.isArray(detection.combinations) ? detection.combinations : [];
    if (!combos.length || typeof CombinationChecklist === 'undefined') return '';
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const title = (t && t.get('detectionModalCombinations')) || 'Matched combinations';
    const cards = CombinationChecklist.build({
      combinations: combos,
      definition,
      found: detection.comboFound,
      matches: Array.isArray(detection.matches) ? detection.matches : [],
      detectionConfidence: detection.confidence,
      // Slim entries keep a rule key instead of the rule; a full detection carries its own
      fromHistory: !combos.some(combo => combo && combo.when)
    });
    // Entries saved before checklists: say it once, not on every card
    const notSaved = cards.some(card => card.unavailable === 'notSaved')
      ? `<p class="match-combo-hint">${FormatUtils.escapeHtml((t && t.get('combinationDetailsNotSavedAll')) || 'This scan was saved before conditions were kept, so only names and scores are shown.')}</p>`
      : '';
    return `<div class="history-modal-combos">
      <div class="history-modal-combos-title">${FormatUtils.escapeHtml(title)}</div>
      ${notSaved}
      <div class="match-combo-list">${CombinationChecklist.renderHtml(cards, this.historyChecklistOptions(`hist-combo-${index}`))}</div>
    </div>`;
  }

  historyChecklistOptions(idPrefix) {
    return {
      idPrefix,
      methodLabel: (m) => this.getMethodLabel(m),
      confidenceHtml: (value, cls, tip) => FormatUtils.confidenceHtml(value, cls, tip)
    };
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
   * Readable, localized method name ("JavaScript hooks"), shared with the Detection cards
   * @param {string} typeKey - Lowercase method type
   * @returns {string} Label
   */
  getMethodLabel(typeKey) {
    if (typeof DetectionUI !== 'undefined' && typeof DetectionUI.getMethodLabel === 'function') {
      return DetectionUI.getMethodLabel(typeKey);
    }
    return typeKey.replace(/_/g, ' ').toUpperCase();
  }

  /**
   * Render method type badges for modal meta row
   * @param {Array} matches - Array of match objects
   * @returns {string} HTML string
   */
  renderMethodTypeBadges(matches) {
    const typeKeys = this.getUniqueMethodTypes(matches);
    if (!typeKeys.length) return '';

    const typeCounts = new Map();
    matches.forEach((match) => {
      const typeKey = (match.type || 'unknown').toLowerCase();
      typeCounts.set(typeKey, (typeCounts.get(typeKey) || 0) + 1);
    });

    const visibleTypes = typeKeys.slice(0, 4);
    const overflowCount = typeKeys.length - visibleTypes.length;

    const badgesHtml = visibleTypes.map(typeKey => {
      const count = typeCounts.get(typeKey) || 0;
      const label = FormatUtils.escapeHtml(this.getMethodLabel(typeKey) + (count > 1 ? ` (${count})` : ''));

      // Get tag color (use original key for lookup)
      let tagColor = '#666666';
      if (this.detectorManager?.categoryManager) {
        tagColor = this.detectorManager.categoryManager.getTagColor(typeKey) || '#666666';
      }
      const tagRgb = FormatUtils.hexToRgb(tagColor);
      const badgeStyle = tagRgb
        ? `background: rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.18); color: ${tagColor}; border: 1px solid rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.35);`
        : `background: ${tagColor}; color: white;`;

      // Hover: the method, what it checks and the values it matched
      const values = matches
        .filter(match => (match.type || 'unknown').toLowerCase() === typeKey)
        .map(match => ({
          label: String(match.fullUrl || match.value || match.name || match.selector || match.pattern || ''),
          value: `${Math.round(Number(match.confidence) || 0)}%`,
          tone: FormatUtils.confidenceTone(match.confidence)
        }))
        .filter(row => row.label);
      const rows = values.slice(0, 4).map(row => ({ ...row, label: row.label.length > 48 ? `${row.label.slice(0, 47)}…` : row.label }));
      if (values.length > 4) rows.push({ label: FormatUtils.t('tipMoreFmt', '+{0} more', values.length - 4) });
      const title = count === 1 ? FormatUtils.t('historyOneMatch', '1 match') : FormatUtils.t('historyMatchCountFmt', '{0} matches', count);
      const tip = FormatUtils.tipAttrs(`${this.getMethodLabel(typeKey)} · ${title}`, FormatUtils.methodHint(typeKey), rows);

      return `<span class="history-modal-method-type-badge" style="${badgeStyle}" ${tip}>${label}</span>`;
    }).join('');

    const hiddenTypes = typeKeys.slice(visibleTypes.length);
    const overflowHtml = overflowCount > 0
      ? `<span class="history-modal-method-type-badge history-modal-method-type-overflow" ${FormatUtils.tipAttrs(
        FormatUtils.t('tipMoreFmt', '+{0} more', overflowCount),
        '',
        hiddenTypes.map(typeKey => ({ label: this.getMethodLabel(typeKey), value: String(typeCounts.get(typeKey) || 0) })))}>+${overflowCount}</span>`
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
      const noMethods = FormatUtils.t('historyUiNoDetectionMethods', 'No detection methods');
      return `<div class="history-modal-no-methods">${FormatUtils.escapeHtml(noMethods)}</div>`;
    }
    const unknownValue = FormatUtils.t('detectionUiUnknownValue', 'unknown');
    const clickToCopy = FormatUtils.escapeAttr(FormatUtils.t('advCommonClickToCopy', 'Click to copy'));

    return matches.map(match => {
      const originalType = match.type || 'unknown';
      const methodType = originalType.replace(/_/g, ' ').toUpperCase();
      const methodLabel = FormatUtils.escapeHtml(this.getMethodLabel(originalType.toLowerCase()));
      const confidence = match.confidence || 0;

      // Determine display value based on method type
      let displayValue = '';
      switch (match.type?.toLowerCase()) {
        case 'cookie':
        case 'cookies':
          displayValue = match.value || match.name || unknownValue;
          break;
        case 'header':
        case 'headers':
          displayValue = match.value || match.name || unknownValue;
          break;
        case 'content':
        case 'script':
          displayValue = match.content || match.value || match.pattern || unknownValue;
          break;
        case 'url':
        case 'urls':
          displayValue = match.fullUrl || match.value || match.pattern || unknownValue;
          break;
        case 'dom':
          displayValue = match.value || match.selector || match.pattern || unknownValue;
          break;
        default:
          displayValue = match.value || match.name || match.selector || match.pattern || unknownValue;
      }

      // Get tag color (use originalType to preserve underscores for lookup)
      let tagColor = '#666666';
      if (this.detectorManager?.categoryManager) {
        tagColor = this.detectorManager.categoryManager.getTagColor(originalType.toLowerCase()) || '#666666';
      }
      const tagRgb = FormatUtils.hexToRgb(tagColor);
      const badgeStyle = tagRgb
        ? `background: rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.15); color: ${tagColor}; border: 1px solid rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.3);`
        : `background: ${tagColor}; color: white;`;

      const copyPayload = JSON.stringify({
        rawValue: displayValue,
        methodType,
        confidence
      });

      const safeDisplayValue = FormatUtils.escapeHtml(displayValue);

      return `
        <div class="history-modal-method-item" data-copy-payload="${encodeURIComponent(copyPayload)}" title="${clickToCopy}">
          <span class="history-modal-method-badge" style="${badgeStyle}">${methodLabel}</span>
          <span class="history-modal-method-value">${safeDisplayValue}</span>
          ${FormatUtils.confidenceHtml(confidence, 'history-modal-method-confidence')}
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

    const copyBtn = document.querySelector('#historyModalCopy');
    if (copyBtn) {
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        const item = this.historyItems.find(h => h.id === this._modalItemId);
        if (item) this.copyHistoryItem(item);
      };
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
        // Default toast / inline texts of copyToClipboard are already localised
        // Feedback goes on the value field only, so the row keeps its size
        FormatUtils.copyToClipboard(textToCopy, {
          element: item.querySelector('.history-modal-method-value') || item
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
        throw new Error(FormatUtils.t('historyUiInvalidFileFormat', 'Invalid history file format'));
      }

      const mode = await NotificationHelper.chooseImportMode({
        title: _tr('importHistoryTitle', 'Import History'),
        message: _fmt('importHistoryModeMessageFmt', `Import ${data.items.length} history items? Your current history has ${this.historyItems.length}.<br>Merge adds the new items to it. Replace deletes it first.`, data.items.length, this.historyItems.length),
        replaceText: _tr('replaceOption', 'Replace')
      });

      // Cancel, ✕, Escape and the backdrop: leave the stored history alone
      if (mode === 'cancel') {
        event.target.value = '';
        return;
      }

      // Preview locally (same rule the worker applies), then let the worker
      // apply it to the stored list so entries saved meanwhile are kept.
      const before = this.historyItems.length;
      this.historyItems = HistoryStore.applyImport(this.historyItems, data.items, mode, this.historyLimit);
      const added = Math.max(0, this.historyItems.length - before);
      await this.saveHistoryToStorage(data.items, mode);

      if (mode === 'merge') {
        NotificationHelper.success(_fmt('notificationHistoryMergedFmt', `Merged ${added} new history items`, added));
      } else {
        NotificationHelper.success(_fmt('notificationHistoryReplacedFmt', `Replaced history with ${this.historyItems.length} items`, this.historyItems.length));
      }
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
        Logger.debug('UI', `History: Updating history limit from ${this.historyLimit} to ${newLimit}`);
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

    // Toolbar "…" menu (import / export / clear)
    const menuBtn = document.querySelector('#historyMenuBtn');
    const toolbarMenu = document.querySelector('#historyMenu');
    if (menuBtn && toolbarMenu) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._openMenu && this._openMenu.menu === toolbarMenu) {
          this.closeMenus();
        } else {
          this.openMenu(toolbarMenu, menuBtn);
        }
      });
      // Each toolbar action closes the menu before running its own handler below
      toolbarMenu.addEventListener('click', () => this.closeMenus());
    }

    // Per-entry "…" menu: dispatch to the entry it was opened from
    const itemMenu = document.querySelector('#historyItemMenu');
    if (itemMenu) {
      itemMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('.history-menu-item');
        if (!btn) return;
        const item = this.historyItems.find(h => h.id === this._menuItemId);
        const action = btn.dataset.action;
        this.closeMenus();
        if (!item) return;

        if (action === 'copy') {
          this.copyHistoryItem(item);
        } else if (action === 'clear-cache') {
          this.clearHistoryItemCache(item);
        } else if (action === 'export') {
          this.exportHistoryItem(item);
        } else if (action === 'blacklist') {
          this.addHistoryItemToBlacklist(item);
        } else if (action === 'delete') {
          this.deleteHistoryItem(item);
        }
      });
    }

    // Close an open menu on outside click, Escape, or list scroll
    document.addEventListener('click', (e) => {
      if (this._openMenu && !this._openMenu.menu.contains(e.target)) this.closeMenus();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeMenus();
    });
    const historyList = document.querySelector('#historyList');
    if (historyList) {
      historyList.addEventListener('scroll', () => this.closeMenus(), { passive: true });
    }

    // Setup clear history button
    const clearBtn = document.querySelector('#historyTab #clearHistoryBtn');
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
    const exportBtn = document.querySelector('#historyTab #exportHistoryBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportHistory());
    }

    // Setup import button and file input
    const importBtn = document.querySelector('#historyTab #importHistoryBtn');
    const importFile = document.querySelector('#historyTab #importHistoryFile');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => this.handleImport(e));
    }
  }

  /**
   * Open a "…" dropdown under its anchor button. Menus are fixed-positioned so the
   * scrolling list never clips them, and flip above the anchor near the popup bottom.
   * @param {HTMLElement} menu - .history-menu element
   * @param {HTMLElement} anchor - Button that opened it
   */
  openMenu(menu, anchor) {
    this.closeMenus();
    menu.hidden = false;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    let top = anchorRect.bottom + 4;
    if (top + menuRect.height > viewportHeight - 4) {
      top = Math.max(4, anchorRect.top - 4 - menuRect.height);
    }
    const left = Math.min(Math.max(4, anchorRect.right - menuRect.width), viewportWidth - menuRect.width - 4);

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    anchor.setAttribute('aria-expanded', 'true');
    anchor.classList.add('active');
    this._openMenu = { menu, anchor };
  }

  /**
   * Close whichever "…" menu is open
   */
  closeMenus() {
    if (!this._openMenu) return;
    const { menu, anchor } = this._openMenu;
    menu.hidden = true;
    anchor.setAttribute('aria-expanded', 'false');
    anchor.classList.remove('active');
    this._openMenu = null;
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
      const history = await HistoryStore.read(chrome.storage.local);

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
        Logger.debug('UI', `History: Skipping duplicate URL within ${duplicateDuration} ${duplicateUnit} (scope: ${duplicateScope}, source: precheck): ${normalizedKey}`);
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
    return History._doSaveDetectionToHistory(tabId, pageData, detectionResults, chrome, options);
  }

  static async _doSaveDetectionToHistory(tabId, pageData, detectionResults, chrome, options = {}) {
    const {
      historySettings = null,
      source = 'unknown'
    } = options || {};

    try {
      // Slow lookups first, outside the write queue
      const settings = historySettings || await Utils.getHistorySettings();
      const duplicateScope = settings.duplicateScope || 'full_url';
      const duplicateDuration = Number.isFinite(parseInt(settings.duplicateDuration, 10))
        ? parseInt(settings.duplicateDuration, 10)
        : 1;
      const duplicateUnit = settings.duplicateUnit || 'hours';
      const historyLimit = Number.isFinite(parseInt(settings.historyLimit, 10))
        ? parseInt(settings.historyLimit, 10)
        : 0; // 0 = unlimited
      const cacheScope = await Utils.getCacheScope();
      const normalizedFavicon = UrlUtils.normalizeFaviconForStorage(
        pageData.favicon,
        pageData.url || pageData.hostname
      );
      const entryUrl = pageData.url || '';
      const entryHostname = pageData.hostname || UrlUtils.getHostnameFromUrl(entryUrl);
      const entryTitle = await History.resolveEntryTitle(tabId, pageData, entryHostname, chrome);
      const duplicateKey = settings.preventDuplicates
        ? this.normalizeDuplicateKey(pageData.url, pageData.hostname, duplicateScope)
        : null;
      if (settings.preventDuplicates && !duplicateKey) {
        Logger.debug('UI', `[History] Duplicate save-check could not normalize key (scope: ${duplicateScope}, source: ${source}), allowing save`);
      }

      // One serialized read-modify-write through the shared store
      const { changed } = await HistoryStore.mutate((history) => {
        if (duplicateKey) {
          const cutoffTime = Date.now() - FormatUtils.convertToMilliseconds(duplicateDuration, duplicateUnit);
          if (this.isDuplicateHistoryEntry(history, duplicateKey, cutoffTime, duplicateScope)) {
            Logger.debug('UI', `History: Skipping duplicate history save within ${duplicateDuration} ${duplicateUnit} (scope: ${duplicateScope}, source: ${source}): ${duplicateKey}`);
            return undefined;
          }
        }

        const historyEntry = {
          id: `detection_${Date.now()}_${tabId}`,
          url: entryUrl,
          hostname: entryHostname,
          title: entryTitle,
          favicon: normalizedFavicon,
          timestamp: Date.now(),
          detections: detectionResults,
          detectionCount: detectionResults.length,
          categories: [...new Set(detectionResults.map(d => d.category))],
          cacheScope: cacheScope
        };

        // Newest first, then the rolling window limit
        const next = [historyEntry, ...history];
        return historyLimit > 0 && next.length > historyLimit ? next.slice(0, historyLimit) : next;
      }, chrome.storage.local);

      if (changed) Logger.ui(`History: Saved detection to history for ${pageData.url}`);
      return changed;
    } catch (error) {
      if (typeof HistoryStore !== 'undefined' && HistoryStore.isQuotaError && HistoryStore.isQuotaError(error)) {
        Logger.warn('UI', '[History] Storage is full; this page was not added to History');
      } else {
        Logger.error('UI', '[History] Detection save failed', error);
      }
      return false;
    }
  }

  /**
   * Pick the page title for a history entry. The title captured with the first detection
   * message is often still the URL (the tab is loading), so prefer the tab's live title
   * when the tab still shows the same host and has a real title by now.
   * @param {number} tabId - Tab ID
   * @param {Object} pageData - Page data (tabTitle / title)
   * @param {string} hostname - Entry hostname
   * @param {Object} chrome - Chrome API object
   * @returns {Promise<string>} Title to store
   */
  static async resolveEntryTitle(tabId, pageData, hostname, chrome) {
    const stored = pageData.tabTitle || pageData.title || '';
    const looksLikeUrl = (value) => !value || value === hostname || /^[a-z]+:\/\//i.test(value) || value.startsWith(`${hostname}/`);

    if (Number.isInteger(tabId) && tabId >= 0 && chrome?.tabs?.get) {
      try {
        const tab = await chrome.tabs.get(tabId);
        const sameHost = tab && tab.url && UrlUtils.getHostnameFromUrl(tab.url) === hostname;
        if (sameHost && tab.title && !looksLikeUrl(tab.title)) {
          return tab.title;
        }
      } catch (error) {
        // Tab already closed: keep the title captured during detection
      }
    }
    return stored || 'Untitled';
  }

}

if (typeof window !== 'undefined') {
  window.History = History;
}
