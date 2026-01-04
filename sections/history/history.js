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
    let historyHtml = '';

    items.forEach(item => {
      const timeAgo = this.getTimeAgo(new Date(item.timestamp));
      const domain = this.getDomainFromUrl(item.url);

      // Use Scrapfly icon as default for favicon
      const faviconSrc = item.favicon || chrome.runtime.getURL('icons/icon16.png');

      historyHtml += `
        <div class="history-item" data-history-id="${item.id}">
          <div class="history-item-content">
            <div class="history-header-info">
              <img src="${faviconSrc}" alt="Favicon" class="history-favicon" data-fallback="${chrome.runtime.getURL('icons/icon16.png')}">
              <div class="history-url" title="${item.url || ''}">${domain}</div>
            </div>
            <div class="history-title" title="${item.title || 'Untitled'}">${item.title || 'Untitled'}</div>
            <div class="history-detections">
              ${this.renderHistoryDetections(item.detections || [], item.id)}
            </div>
          </div>
          <div class="history-item-right">
            <div class="history-item-actions">
              <button class="history-item-action-btn history-copy-btn" data-action="copy" title="Copy data">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" fill="currentColor"/>
                </svg>
              </button>
              <button class="history-item-action-btn history-export-btn" data-action="export" title="Export item">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" fill="currentColor"/>
                </svg>
              </button>
              <button class="history-item-action-btn history-delete-btn" data-action="delete" title="Delete item">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                </svg>
              </button>
            </div>
            <div class="history-timestamp">${timeAgo}</div>
          </div>
        </div>
      `;
    });

    historyList.innerHTML = historyHtml;

    // CSP-compliant image error fallback
    historyList.querySelectorAll('img[data-fallback]').forEach(img => {
      img.addEventListener('error', function() {
        this.src = this.dataset.fallback;
      }, { once: true });
    });

    // Add click handlers for history items
    this.setupHistoryItemHandlers();
    this.setupOverflowBadgeHandlers();
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
    const maxTags = 5; // Reduced from 6 to prevent clipping with "+N More" badge

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
      if (cat.includes('fingerprint')) return '#2196F3';
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
      if (detectorObj && detectorObj.icon) {
        const iconUrl = chrome.runtime.getURL(`detectors/icons/${detectorObj.icon}`);
        iconHtml = `<img src="${iconUrl}" alt="${name}" class="detection-icon">`;
      } else {
        // Fallback: Use Scrapfly icon for all detectors without official icons
        const scrapflyIconUrl = chrome.runtime.getURL('icons/icon32.png');
        iconHtml = `<img src="${scrapflyIconUrl}" alt="${name}" class="detection-icon">`;
      }

      tagsHtml += `<span class="history-detection-tag icon-badge" title="${tooltipText}" style="border-color: ${categoryColor};">${iconHtml}</span>`;
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
          this.showOverflowDetectionsModal(item);
        }
      });
    });
  }

  /**
   * Show overflow detections modal with hidden detection details
   * @param {object} historyItem - History item object
   */
  showOverflowDetectionsModal(historyItem) {
    const modal = document.querySelector('#overflowDetectionsModal');
    const title = document.querySelector('#overflowModalTitle');
    const content = document.querySelector('#overflowModalContent');

    if (!modal || !title || !content) return;

    const maxTags = 2;
    const hiddenDetections = historyItem.detections.slice(maxTags);

    // Update title
    const count = hiddenDetections.length;
    title.textContent = `${count} Hidden Detection${count > 1 ? 's' : ''}`;

    // Render detection cards
    content.innerHTML = this.renderDetectionDetails(hiddenDetections);

    // FIX: Attach click handlers to expand/collapse detection cards
    this.attachOverflowModalClickHandlers();

    // Enable click-to-copy for method badges
    this.setupMethodCopyHandlers();

    // Show modal
    modal.style.display = 'flex';

    // Setup close handlers
    this.setupOverflowModalCloseHandlers();
  }

  /**
   * Attach click handlers to detection cards in overflow modal
   */
  attachOverflowModalClickHandlers() {
    const cards = document.querySelectorAll('#overflowModalContent .history-modal-detection-card.has-methods');

    cards.forEach(card => {
      const header = card.querySelector('.history-modal-detection-header');
      const methods = card.querySelector('.history-modal-detection-methods');
      const expandIcon = card.querySelector('.history-modal-expand-icon');

      if (header && methods) {
        // Toggle expand/collapse on header click
        header.style.cursor = 'pointer';
        header.addEventListener('click', () => {
          const isExpanded = card.classList.contains('expanded');

          if (isExpanded) {
            card.classList.remove('expanded');
            methods.style.display = 'none';
            if (expandIcon) expandIcon.textContent = '▼';
          } else {
            card.classList.add('expanded');
            methods.style.display = 'flex';
            if (expandIcon) expandIcon.textContent = '▲';
          }
        });

        // Initially hide methods
        methods.style.display = 'none';
      }
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
      const expandIcon = card.querySelector('.history-modal-expand-icon');

      if (header && methods) {
        // Toggle expand/collapse on header click
        header.style.cursor = 'pointer';
        header.addEventListener('click', () => {
          const isExpanded = card.classList.contains('expanded');

          if (isExpanded) {
            card.classList.remove('expanded');
            methods.style.display = 'none';
            if (expandIcon) expandIcon.textContent = '▼';
          } else {
            card.classList.add('expanded');
            methods.style.display = 'flex';
            if (expandIcon) expandIcon.textContent = '▲';
          }
        });

        // Initially hide methods
        methods.style.display = 'none';
      }
    });
  }

  /**
   * Setup close handlers for overflow modal
   */
  setupOverflowModalCloseHandlers() {
    const modal = document.querySelector('#overflowDetectionsModal');
    const closeBtn = document.querySelector('#overflowModalClose');
    const overlay = modal?.querySelector('.history-modal-overlay');

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
    };

    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeModal();
      };
    }

    if (overlay) {
      overlay.onclick = (e) => {
        e.stopPropagation();  // Prevent event bubbling to parent elements
        closeModal();
      };
    }

    // ESC key handler - cleanup previous handler to prevent memory leak
    if (this.overflowEscHandler) {
      document.removeEventListener('keydown', this.overflowEscHandler);
    }
    this.overflowEscHandler = (e) => {
      if (e.key === 'Escape' && modal?.style.display === 'flex') {
        closeModal();
      }
    };
    document.addEventListener('keydown', this.overflowEscHandler);
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
      NotificationHelper.success('History cleared successfully');
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
      timestamp.textContent = `🕐 ${this.getTimeAgo(new Date(historyItem.timestamp))} (${new Date(historyItem.timestamp).toLocaleString()})`;
    }
    if (detectionCount) {
      const count = historyItem.detections?.length || 0;
      detectionCount.textContent = `🔍 ${count} detection${count !== 1 ? 's' : ''}`;
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
      NotificationHelper.success('History item copied to clipboard');
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
          const value = match.pattern || match.value || match.name || match.selector || 'unknown';
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

      // Generate detector icon HTML
      let detectorIconHtml = '';
      if (detectorObj && detectorObj.icon) {
        const iconUrl = chrome.runtime.getURL(`detectors/icons/${detectorObj.icon}`);
        detectorIconHtml = `<img src="${iconUrl}" alt="${name}" class="modal-detector-icon">`;
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

      return `
        <div class="history-modal-detection-card ${hasMethods ? 'has-methods' : ''}" data-detection-index="${index}">
          <div class="history-modal-detection-header">
            ${detectorIconHtml}
            <div class="history-modal-detection-content">
              <div class="history-modal-detection-name">${name}</div>
              <div class="history-modal-detection-badges">
                <span class="history-modal-badge" style="background: ${categoryColor}; color: white;">${category}</span>
                <span class="history-modal-confidence ${confidenceClass}">${confidence}%</span>
                ${hasMethods ? '<span class="history-modal-expand-icon">▼</span>' : ''}
              </div>
            </div>
          </div>
          ${hasMethods ? `
            <div class="history-modal-detection-methods">
              ${methodsHtml}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
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
        case 'scripts':
          displayValue = match.pattern || match.content || match.value || 'unknown';
          break;
        case 'url':
        case 'urls':
          displayValue = match.pattern || 'unknown';
          break;
        case 'dom':
          displayValue = match.value || match.selector || match.pattern || 'unknown';
          break;
        default:
          displayValue = match.pattern || match.name || match.value || match.selector || 'unknown';
      }

      // Get tag color (use originalType to preserve underscores for lookup)
      let tagColor = '#666666';
      if (this.detectorManager?.categoryManager) {
        tagColor = this.detectorManager.categoryManager.getTagColor(originalType.toLowerCase()) || '#666666';
      }

      // Confidence class
      let confidenceClass = 'confidence-low';
      if (confidence >= 90) confidenceClass = 'confidence-high';
      else if (confidence >= 70) confidenceClass = 'confidence-medium';

      const copyPayload = JSON.stringify({
        rawValue: displayValue,
        methodType,
        confidence
      });

      return `
        <div class="history-modal-method-item" data-copy-payload="${encodeURIComponent(copyPayload)}" title="Click to copy">
          <span class="history-modal-method-badge" style="background: ${tagColor}; color: white;">${methodType}</span>
          <span class="history-modal-method-value">${displayValue}</span>
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
        Utils.copyToClipboard(textToCopy, {
          element: item,
          notificationMessage: 'Method value copied',
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
    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;

    return date.toLocaleDateString();
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

      // Get tab information
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url) {
        Logger.warn('UI', 'History: Cannot save capture - no tab URL');
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
      const durationMs = Utils.convertToMilliseconds(
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
      const historyBehavior = settings.historyBehavior || 'rolling';

      // Check if we should stop at limit
      if (historyBehavior === 'stop_at_limit' && historyLimit > 0 && history.length >= historyLimit) {
        Logger.ui(`History: Limit reached (${historyLimit}), not saving new detection (behavior: stop_at_limit)`);
        return false;
      }

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
        categories: [...new Set(detectionResults.map(d => d.category))]
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
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = History;
} else if (typeof window !== 'undefined') {
  window.History = History;
}