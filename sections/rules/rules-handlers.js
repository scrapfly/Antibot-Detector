/**
 * Rules Handlers Module
 *
 * Contains event handler methods for the Rules class:
 * - Import/Export handlers
 * - Update management handlers
 * - CRUD operation handlers
 * - Search functionality
 *
 * These methods are added to the Rules prototype and use `this` to access
 * the Rules instance properties (detectorManager, paginationManager, etc.)
 */

// ============================================
// Import/Export Handlers
// ============================================

/**
 * Handle import of detector rules
 * @param {Event} event - File input change event
 */
Rules.prototype.handleImport = async function(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Ask user if they want to merge or replace
    // Use NotificationHelper for safe access
    const merge = await NotificationHelper.confirm({
          title: 'Import Detectors',
          message: 'Do you want to merge with existing detectors?',
          confirmText: 'Merge',
          cancelText: 'Replace All',
          type: 'info'
        });

    const success = await this.detectorManager.importDetectors(data, merge);
    if (success) {
      NotificationHelper.success('Detectors imported');
      this.displayRules();
    } else {
      NotificationHelper.error('Failed to import detectors. Check the file format.');
    }
  } catch (error) {
    NotificationHelper.error('Error reading file: ' + error.message);
  }

  // Reset file input
  event.target.value = '';
};

/**
 * Handle export of detector rules
 */
Rules.prototype.handleExport = function() {
  const data = this.detectorManager.exportDetectors();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `scrapfly-detectors-${timestamp}.json`;
  a.click();

  URL.revokeObjectURL(url);
};

// ============================================
// Update Management Handlers
// ============================================

/**
 * Check for pending updates and update badge
 */
Rules.prototype.checkPendingUpdates = async function() {
  try {
    if (typeof UpdateManager === 'undefined') {
      Logger.debug('UI', 'UpdateManager not available');
      return;
    }

    // Get stored pending updates count and show badge
    const count = await UpdateManager.getPendingUpdatesCount();
    this.updateUpdatesBadge(count);
  } catch (error) {
    Logger.error('UI', 'Error checking pending updates', error);
    this.updateUpdatesBadge(0);
  }
};

/**
 * Handle Update button click
 * If updates are pending, apply them. Otherwise check for new updates.
 */
Rules.prototype.handleCheckUpdates = async function() {
  const btn = document.querySelector('#checkUpdatesBtn');
  const btnText = document.querySelector('#checkUpdatesBtnText');

  if (!btn) {
    Logger.warn('UI', 'Update button not found');
    return;
  }

  if (typeof UpdateManager === 'undefined') {
    Logger.warn('UI', 'UpdateManager not available');
    if (typeof NotificationHelper !== 'undefined') {
      NotificationHelper.error('Update service not available');
    }
    return;
  }

  // Check if there are pending updates to apply
  const pendingCount = await UpdateManager.getPendingUpdatesCount();

  if (pendingCount > 0) {
    // Apply pending updates directly
    btn.classList.add('checking');

    try {
      const result = await UpdateManager.applyUpdates();

      if (result.success && result.count > 0) {
        this.updateUpdatesBadge(0);
        if (typeof NotificationHelper !== 'undefined') {
          NotificationHelper.success(`${result.count} detector${result.count > 1 ? 's' : ''} updated`);
        }
        await this.displayRules();
      } else if (result.failed > 0 && result.count === 0) {
        this.updateUpdatesBadge(0);
        if (typeof NotificationHelper !== 'undefined') {
          NotificationHelper.warning('Could not fetch updates from server');
        }
      } else {
        this.updateUpdatesBadge(0);
      }
    } catch (error) {
      Logger.error('UI', 'Error applying updates', error);
      if (typeof NotificationHelper !== 'undefined') {
        NotificationHelper.error('Error applying updates');
      }
    } finally {
      btn.classList.remove('checking');
    }
  } else {
    // Check for new updates
    btn.classList.add('checking');

    try {
      const result = await UpdateManager.checkForUpdates(true);

      if (result.error) {
        if (typeof NotificationHelper !== 'undefined') {
          NotificationHelper.error('Failed to check for updates');
        }
      } else if (result.available && result.updates.length > 0) {
        this.updateUpdatesBadge(result.updates.length);
        if (typeof NotificationHelper !== 'undefined') {
          NotificationHelper.info(`${result.updates.length} update${result.updates.length > 1 ? 's' : ''} available - click again to apply`);
        }
      } else {
        this.updateUpdatesBadge(0);
        if (typeof NotificationHelper !== 'undefined') {
          NotificationHelper.success('All detectors are up to date');
        }
      }
    } catch (error) {
      Logger.error('UI', 'Error checking for updates', error);
      if (typeof NotificationHelper !== 'undefined') {
        NotificationHelper.error('Error checking for updates');
      }
    } finally {
      btn.classList.remove('checking');
    }
  }
};

/**
 * Update the updates badge count
 * @param {number} count - Number of pending updates
 */
Rules.prototype.updateUpdatesBadge = function(count) {
  const badge = document.querySelector('#updatesBadge');
  const btn = document.querySelector('#checkUpdatesBtn');

  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
      if (btn) btn.classList.add('has-updates');
    } else {
      badge.style.display = 'none';
      if (btn) btn.classList.remove('has-updates');
    }
  }
};

// ============================================
// CRUD Operation Handlers
// ============================================

/**
 * Handle clearing all detectors
 */
Rules.prototype.handleClear = async function() {
  const confirmed = await NotificationHelper.confirm({
        title: 'Clear All Detectors',
        message: 'This will remove ALL detectors. Are you sure?',
        confirmText: 'Clear All',
        cancelText: 'Cancel',
        type: 'danger'
      });

  if (!confirmed) {
    return;
  }

  const loader = NotificationHelper.loading('Clearing all detectors...');
  const success = await this.detectorManager.clearAllDetectors();
  loader.close();

  if (success) {
    NotificationHelper.success('All detectors cleared');
    this.displayRules();
  } else {
    NotificationHelper.error('Failed to clear detectors');
  }
};

/**
 * Handle deleting a detector
 * @param {string} category - Category name
 * @param {string} detectorName - Detector name
 * @param {string} displayName - Display name for confirmation
 */
Rules.prototype.handleDeleteDetector = async function(category, detectorName, displayName) {
  const confirmed = await NotificationHelper.confirm({
    title: 'Delete Detector',
    message: `Are you sure you want to delete "${displayName}"?`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    type: 'danger'
  });

  if (!confirmed) {
    return;
  }

  try {
    // Remove detector from detectorManager
    if (this.detectorManager.detectors[category] && this.detectorManager.detectors[category][detectorName]) {
      delete this.detectorManager.detectors[category][detectorName];

      // Save to storage
      await this.detectorManager.saveDetectorsToStorage();

      // Reload detectors in background script
      chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
        Logger.ui('Detectors reloaded in background after delete:', response);
      });

      NotificationHelper.success(`Deleted "${displayName}"`);

      // Refresh the display
      this.displayRules();
    } else {
      NotificationHelper.error('Detector not found');
    }
  } catch (error) {
    Logger.error('UI', 'Failed to delete detector:', error);
    NotificationHelper.error('Failed to delete detector');
  }
};

/**
 * Handle adding a new detector
 */
Rules.prototype.handleAddDetector = function() {
  // Get current timestamp in local time
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  // Create a new empty detector
  const newDetector = {
    id: `custom-${Date.now()}`,
    name: 'New Detector',
    displayName: 'New Detector',
    category: 'antibot',
    icon: 'default',
    color: '#3b82f6',
    description: 'Custom detector',
    lastUpdated: timestamp,
    detection: {
      urls: [],
      headers: [],
      cookies: [],
      content: [],
      dom: []
    }
  };

  // Open edit modal with the new detector - pass isNew as true
  this.openEditModal(newDetector, 'antibot', newDetector.id, true);
};

// ============================================
// Search Functionality
// ============================================

/**
 * Handle search functionality
 * @param {string} query - Search query
 */
Rules.prototype.handleSearch = function(query) {
  if (!query.trim()) {
    this.filteredDetectors = [...this.allDetectors];
  } else {
    // Simple search focused on name, category, and description only
    // Avoid searching detection pattern content to prevent false positives
    const searchTerm = query.toLowerCase().trim();
    this.filteredDetectors = this.allDetectors.filter(({ detector, category }) => {
      // Search in detector name, category, description only
      const searchableText = [
        detector.displayName,
        detector.name,
        category,
        detector.description
      ].filter(Boolean).join(' ').toLowerCase();

      // Check for basic text match first
      if (searchableText.includes(searchTerm)) {
        return true;
      }

      // Also allow searching by detection method TYPE names (COOKIE, HEADER, DOM, etc.)
      if (detector.detection) {
        const methodTypes = Object.keys(detector.detection)
          .filter(key => Array.isArray(detector.detection[key]) && detector.detection[key].length > 0)
          .map(key => key.toUpperCase().replace(/_/g, ' '))
          .join(' ')
          .toLowerCase();

        if (methodTypes.includes(searchTerm)) {
          return true;
        }
      }

      return false;
    });
  }

  // Update pagination with filtered results
  if (this.paginationManager) {
    this.paginationManager.setItems(this.filteredDetectors);
  }
};
