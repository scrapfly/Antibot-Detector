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

  const t = (typeof I18n !== 'undefined') ? I18n : null;
  const _tr = (key, fallback) => (t && t.get(key)) || fallback;
  const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const mode = await NotificationHelper.chooseImportMode({
      title: _tr('importDetectorsTitle', 'Import Detectors'),
      message: _tr('importDetectorsModeMessage', 'Merge adds the imported detectors to yours.<br>Replace All deletes your custom detectors first; built-in detectors stay.'),
      replaceText: _tr('replaceAllOption', 'Replace All')
    });

    // Cancel, ✕, Escape and the backdrop: leave the stored detectors alone
    if (mode === 'cancel') {
      event.target.value = '';
      return;
    }

    const success = await this.detectorManager.importDetectors(data, mode === 'merge');
    if (success) {
      chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
        Logger.ui('Detectors reloaded in background after import:', response);
      });
      NotificationHelper.success(_tr('detectorsImported', 'Detectors imported'));
      this.displayRules();
    } else {
      NotificationHelper.error(_tr('failedImportDetectors', 'Failed to import detectors. Check the file format.'));
    }
  } catch (error) {
    NotificationHelper.error(_fmt('errorReadingFileFmt', 'Error reading file: ' + error.message, error.message));
  }

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

/**
 * A card's "Export": download only that detector
 * @param {string} category
 * @param {string} detectorName - detector id
 */
Rules.prototype.handleExportDetector = function(category, detectorName, displayName) {
  const data = this.detectorManager.exportDetector(category, detectorName);
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scrapfly-detector-${String(detectorName).replace(/[^\w.-]+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  NotificationHelper.success(FormatUtils.t('detectorExportedFmt', 'Exported {0}', displayName));
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
    Logger.debug('UI', 'Update button not found');
    return;
  }

  const t = (typeof I18n !== 'undefined') ? I18n : null;
  const _tr = (key, fallback) => (t && t.get(key)) || fallback;
  const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;

  if (typeof UpdateManager === 'undefined') {
    Logger.warn('UI', '[Rules] UpdateManager not available');
    if (typeof NotificationHelper !== 'undefined') {
      NotificationHelper.error(_tr('updateServiceNotAvailable', 'Update service not available'));
    }
    return;
  }

  const pendingCount = await UpdateManager.getPendingUpdatesCount();

  if (pendingCount > 0) {
    btn.classList.add('checking');

    try {
      const result = await UpdateManager.applyUpdates();

      if (!result.success) {
        if (typeof NotificationHelper !== 'undefined') {
          NotificationHelper.error(_tr('errorApplyingUpdates', 'Error applying updates'));
        }
      } else if (result.count > 0) {
        await this.reloadDetectorsFromStorage();
        if (typeof NotificationHelper !== 'undefined') {
          NotificationHelper.success(_fmt('detectorsUpdatedFmt', `${result.count} detectors updated`, result.count));
        }
      } else if (result.failed > 0) {
        if (typeof NotificationHelper !== 'undefined') {
          NotificationHelper.warning(_tr('couldNotFetchUpdates', 'Could not fetch updates from server'));
        }
      }

      // Rules the user edited are never replaced without asking
      if (result.success && result.needsDecision.length > 0) {
        await this.resolveEditedRuleUpdates(result.needsDecision);
      }
      this.updateUpdatesBadge(await UpdateManager.getPendingUpdatesCount());
    } catch (error) {
      Logger.error('UI', 'Error applying updates', error);
      if (typeof NotificationHelper !== 'undefined') {
        NotificationHelper.error(_tr('errorApplyingUpdates', 'Error applying updates'));
      }
    } finally {
      btn.classList.remove('checking');
    }
  } else {
    btn.classList.add('checking');

    try {
      const result = await UpdateManager.checkForUpdates(true);

      if (result.error) {
        if (typeof NotificationHelper !== 'undefined') {
          NotificationHelper.error(_tr('failedCheckForUpdates', 'Failed to check for updates'));
        }
      } else if (result.available && result.updates.length > 0) {
        this.updateUpdatesBadge(result.updates.length);
        if (typeof NotificationHelper !== 'undefined') {
          NotificationHelper.info(_fmt('updatesAvailableClickToApplyFmt', `${result.updates.length} updates available - click again to apply`, result.updates.length));
        }
      } else {
        this.updateUpdatesBadge(0);
        if (typeof NotificationHelper !== 'undefined') {
          NotificationHelper.success(_tr('allDetectorsUpToDate', 'All detectors are up to date'));
        }
      }
    } catch (error) {
      Logger.error('UI', 'Error checking for updates', error);
      if (typeof NotificationHelper !== 'undefined') {
        NotificationHelper.error(_tr('errorCheckingForUpdates', 'Error checking for updates'));
      }
    } finally {
      btn.classList.remove('checking');
    }
  }
};

/**
 * Re-read every detector from storage into this popup's manager and redraw.
 * Needed after anything else wrote storage (an update): the manager saves its
 * whole in-memory set, so a stale copy would undo that write on the next edit.
 */
Rules.prototype.reloadDetectorsFromStorage = async function() {
  if (this.detectorManager) {
    this.detectorManager.initialized = false;
    await this.detectorManager.initialize();
  }
  await this.displayRules();
};

/**
 * Ask, one rule at a time, what to do with an official update for a rule the
 * user edited: keep their edits (that version is not offered again), take the
 * new version (their edits are replaced), or decide later (stays pending).
 * @param {Array<{id: string, name: string, remoteVersion: string}>} updates
 */
Rules.prototype.resolveEditedRuleUpdates = async function(updates) {
  const t = (typeof I18n !== 'undefined') ? I18n : null;
  const _tr = (key, fallback) => (t && t.get(key)) || fallback;
  const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;

  const keep = [];
  const replace = [];
  for (const update of updates) {
    // Dialog text is set as textContent: plain strings, no escaping
    const name = update.name || update.id;
    const version = update.remoteVersion;
    const choice = await NotificationHelper.choose({
      title: _tr('editedRuleUpdateTitle', 'Update for a rule you edited'),
      message: _fmt('editedRuleUpdateMessageFmt',
        `"${name}" has a new official version (${version}). You edited this rule: the new version replaces your changes.`,
        name, version),
      cancelText: _tr('btnDecideLater', 'Decide later'),
      tone: 'warning',
      actions: [
        { value: 'keep', text: _tr('btnKeepMyEdits', 'Keep my edits') },
        { value: 'replace', text: _tr('btnUseNewVersion', 'Use new version'), tone: 'warning', primary: true }
      ],
      defaultValue: 'keep'
    });
    if (choice === 'keep') keep.push(update.id);
    else if (choice === 'replace') replace.push(update.id);
  }

  if (keep.length > 0) {
    await UpdateManager.keepUserEdits(keep);
  }
  if (replace.length > 0) {
    const result = await UpdateManager.applyUpdates({ ids: replace, overwriteModified: true });
    if (result.success && result.count > 0) {
      NotificationHelper.success(_fmt('detectorsUpdatedFmt', `${result.count} detectors updated`, result.count));
    } else if (!result.success || result.failed > 0) {
      NotificationHelper.warning(_tr('couldNotFetchUpdates', 'Could not fetch updates from server'));
    }
  }
  if (keep.length > 0 || replace.length > 0) {
    await this.reloadDetectorsFromStorage();
  }
};

/**
 * Discard the user's edits to an official rule and restore the official copy
 */
Rules.prototype.handleResetToOfficial = async function(category, detectorName, displayName) {
  const t = (typeof I18n !== 'undefined') ? I18n : null;
  const _tr = (key, fallback) => (t && t.get(key)) || fallback;
  const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;

  const current = this.detectorManager.getDetector(category, detectorName);
  const restored = DetectorManager.officialVersionOf(current);
  if (!restored) return;

  const name = displayName || detectorName;
  const confirmed = await NotificationHelper.confirm({
    title: _tr('resetToOfficialTitle', 'Reset to the official version'),
    message: _fmt('resetToOfficialMessageFmt', `Discard your edits to "${name}" and restore the official Scrapfly version?`, name),
    confirmText: _tr('resetToOfficial', 'Reset to official'),
    cancelText: _tr('btnCancel', 'Cancel'),
    tone: 'warning'
  });
  if (!confirmed) return;

  try {
    this.detectorManager.detectors[category][detectorName] = restored;
    await this.detectorManager.saveDetectorsToStorage();
    chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => { void chrome.runtime.lastError; });
    NotificationHelper.success(_tr('ruleResetToOfficial', 'Rule restored to the official version'));
    await this.displayRules();
  } catch (error) {
    Logger.error('UI', 'Failed to reset detector to official:', error);
    NotificationHelper.error(_tr('errorApplyingUpdates', 'Error applying updates'));
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
 * Handle clearing the custom detectors (official ones are kept)
 */
Rules.prototype.handleClear = async function() {
  const t = (typeof I18n !== 'undefined') ? I18n : null;
  const _tr = (key, fallback) => (t && t.get(key)) || fallback;
  const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
  const confirmed = await NotificationHelper.confirm({
    title: _tr('clearCustomDetectorsTitle', 'Clear custom detectors'),
    message: _tr('clearCustomDetectorsMessage', 'This will remove all your custom detectors. Official Scrapfly detectors are kept (you can disable them instead). Are you sure?'),
    confirmText: _tr('btnClear', 'Clear'),
    cancelText: _tr('btnCancel', 'Cancel'),
    type: 'danger'
  });

  if (!confirmed) {
    return;
  }

  const loader = NotificationHelper.loading(_tr('clearingCustomDetectors', 'Clearing custom detectors...'));
  try {
    const removed = await this.detectorManager.clearCustomDetectors();
    loader.close();
    if (removed > 0) {
      chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
        Logger.ui('Detectors reloaded in background after clear:', response);
      });
      NotificationHelper.success(_fmt('customDetectorsClearedFmt', `${removed} custom detectors removed`, removed));
    } else {
      NotificationHelper.info(_tr('noCustomDetectorsToClear', 'There are no custom detectors to clear'));
    }
    this.displayRules();
  } catch (error) {
    loader.close();
    Logger.error('UI', 'Failed to clear custom detectors:', error);
    NotificationHelper.error(_tr('failedClearDetectors', 'Failed to clear detectors'));
  }
};

/**
 * Bring back the official detectors the user deleted
 */
Rules.prototype.handleRestoreOfficial = async function() {
  const t = (typeof I18n !== 'undefined') ? I18n : null;
  const _tr = (key, fallback) => (t && t.get(key)) || fallback;
  const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
  const confirmed = await NotificationHelper.confirm({
    title: _tr('restoreOfficialDetectorsConfirmTitle', 'Restore official detectors?'),
    message: _tr('restoreOfficialDetectorsConfirmMsg', 'The official detectors you deleted are installed again from the version included in the extension. Your own detectors and your edits to other rules are not changed.'),
    confirmText: _tr('restoreOfficialDetectorsConfirmBtn', 'Restore'),
    cancelText: _tr('btnCancel', 'Cancel'),
    type: 'warning',
    tone: 'warning'
  });
  if (!confirmed) return;
  try {
    const restored = await this.detectorManager.restoreOfficialDetectors();
    if (restored > 0) {
      chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, () => {});
      NotificationHelper.success(_fmt('officialDetectorsRestoredFmt', `${restored} official detectors restored`, restored));
      this.displayRules();
    } else {
      NotificationHelper.info(_tr('noOfficialDetectorsToRestore', 'No official detectors were deleted'));
    }
  } catch (error) {
    Logger.error('UI', 'Failed to restore official detectors:', error);
    // Say why, so a failure can be reported and fixed
    const reason = error && error.message ? error.message : String(error);
    NotificationHelper.error(`${_tr('failedRestoreOfficialDetectors', 'Failed to restore official detectors')}: ${reason}`);
  }
};

/**
 * Handle deleting a detector
 * @param {string} category - Category name
 * @param {string} detectorName - Detector name
 * @param {string} displayName - Display name for confirmation
 */
Rules.prototype.handleDeleteDetector = async function(category, detectorName, displayName) {
  const t = (typeof I18n !== 'undefined') ? I18n : null;
  const _tr = (key, fallback) => (t && t.get(key)) || fallback;
  const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
  const isOfficial = DetectionUtils.isOfficialDetector(this.detectorManager.getDetector(category, detectorName));
  const baseMessage = _fmt('deleteDetectorMessageFmt', `Are you sure you want to delete "${displayName}"?`, displayName);
  const confirmed = await NotificationHelper.confirm({
    title: _tr('deleteDetectorTitle', 'Delete Detector'),
    message: isOfficial
      ? `${baseMessage}<br>${FormatUtils.escapeHtml(_tr('deleteOfficialDetectorNote', 'This is an official Scrapfly detector. Updates will not bring it back; use "Restore official detectors" in the … menu to get it again.'))}`
      : baseMessage,
    confirmText: _tr('btnDelete', 'Delete'),
    cancelText: _tr('btnCancel', 'Cancel'),
    type: 'danger'
  });

  if (!confirmed) {
    return;
  }

  try {
    const result = await this.detectorManager.deleteDetector(category, detectorName);
    if (result.deleted) {
      chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
        Logger.ui('Detectors reloaded in background after delete:', response);
      });

      NotificationHelper.success(_fmt('detectorDeletedFmt', `Deleted "${displayName}"`, displayName));

      this.displayRules();
    } else {
      NotificationHelper.error(_tr('detectorNotFound', 'Detector not found'));
    }
  } catch (error) {
    Logger.error('UI', 'Failed to delete detector:', error);
    NotificationHelper.error(_tr('failedDeleteDetector', 'Failed to delete detector'));
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

  // Create a new empty detector. It has no name yet: the editor shows the
  // default name in the UI language ("New detector", "Nuevo detector", ...) and
  // saveRule() stores whatever the name field holds, so the English default
  // is never stored.
  const newDetector = {
    id: `custom-${Date.now()}`,
    name: '',
    displayName: '',
    category: 'antibot',
    difficulty: 'Medium',
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
