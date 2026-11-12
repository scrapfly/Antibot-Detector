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

  // A rules file is a few hundred KB (the packaged rules are 400 KB). One far larger is not a rules file, and it is read whole
  if (typeof DetectorSchema !== 'undefined' && file.size > DetectorSchema.IMPORT_LIMITS.fileBytes) {
    NotificationHelper.error(_tr('failedImportDetectors', 'Failed to import detectors. Check the file format.'));
    event.target.value = '';
    return;
  }

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
      chrome.runtime.sendMessage({ type: WorkerMessages.RELOAD_DETECTORS }, (response) => {
        Logger.ui('Detectors reloaded in background after import:', response);
      });
      const skipped = this.detectorManager.lastImportSkipped || [];
      if (skipped.length) {
        // The rules left out, by name: the first ten (a file can hold a thousand)
        const names = skipped.length > 10 ? `${skipped.slice(0, 10).join(', ')}, …` : skipped.join(', ');
        NotificationHelper.warning(_fmt('detectorsImportedSkippedFmt', `Detectors imported, except: ${names} (not valid in this version, or a pattern could freeze scanning)`, names));
      } else {
        NotificationHelper.success(_tr('detectorsImported', 'Detectors imported'));
      }
      // Official rules are not replaced by a file: the ones whose content differs are named, so an edit is not lost unseen
      const kept = this.detectorManager.lastImportKept || [];
      if (kept.length) {
        NotificationHelper.warning(_fmt('detectorsImportedKeptFmt', `Official rules already installed were not replaced: ${kept.join(', ')}`, kept.join(', ')));
      }
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
 * Download a rules file (the format Rules → Import reads) and say how many rules went into it, or that it could not be made.
 * @param {() => {detectors: object}} build - makes the file's data; called inside the try, so a failure there is reported too
 * @param {string} fileName
 */
Rules.prototype.downloadRulesFile = function(build, fileName) {
  try {
    const data = build();
    const count = Object.values((data && data.detectors) || {})
      .reduce((total, records) => total + Object.keys(records || {}).length, 0);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    NotificationHelper.success(FormatUtils.t('rulesExportedFmt', 'Rules exported: {0}', count));
    return true;
  } catch (error) {
    Logger.error('UI', 'Failed to export rules:', error);
    NotificationHelper.error(FormatUtils.t('statsExportFailed', 'Could not export the data. Please try again.'));
    return false;
  }
};

/**
 * Handle export of detector rules
 */
Rules.prototype.handleExport = function() {
  return this.downloadRulesFile(() => this.detectorManager.exportDetectors(),
    `scrapfly-detectors-${FormatUtils.localDay(Date.now())}.json`);
};

/**
 * The copy a card's "Duplicate" starts from: the same patterns, combinations,
 * icon and texts as a new custom rule with an id of its own, named
 * "<name> (copy)". Nothing of the original's official or edited state comes
 * along, and the Scrapfly author stays with the original.
 * @param {object} detector - the rule to copy
 * @param {object} [options] - { now: Date, name: (base) => text }
 * @returns {object}
 */
Rules.duplicateOf = function(detector, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const copy = typeof DetectorManager !== 'undefined' && DetectorManager.cleanDetectorCopy
    ? DetectorManager.cleanDetectorCopy(detector)
    : JSON.parse(JSON.stringify(detector || {}));
  for (const field of ['userModified', 'officialSnapshot', 'dismissedVersion', 'minExtensionVersion', 'source', 'official']) delete copy[field];
  const base = String((detector && (detector.name || detector.displayName || detector.id)) || '').trim();
  copy.id = `custom-${now.getTime()}`;
  copy.name = typeof options.name === 'function' ? options.name(base) : `${base} (copy)`;
  copy.displayName = copy.name;
  copy.author = DetectionUtils.isReservedAuthor(copy.author) ? '' : (copy.author || '');
  copy.version = '1.0';
  copy.enabled = true;
  copy.detection = copy.detection && typeof copy.detection === 'object' ? copy.detection : {};
  copy.lastUpdated = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return copy;
};

/**
 * A card's "Duplicate": opens the editor on a copy (see Rules.duplicateOf).
 * Nothing is saved until Save; Cancel leaves the rules as they were.
 */
Rules.prototype.handleDuplicateDetector = function(category, detectorName) {
  const original = this.detectorManager.getDetector(category, detectorName);
  if (!original) return null;
  const t = (typeof I18n !== 'undefined') ? I18n : null;
  const copy = Rules.duplicateOf(original, {
    name: (base) => (t && t.format('rulesDuplicateNameFmt', base)) || `${base} (copy)`
  });
  this.openEditModal(copy, category, copy.id, true);
  return copy;
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
  a.download = `scrapfly-detector-${String(detectorName).replace(/[^\w.-]+/g, '-')}-${FormatUtils.localDay(Date.now())}.json`;
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
    this.renderExtensionNotice(await UpdateManager.getIncompatibleUpdates());
  } catch (error) {
    Logger.error('UI', 'Error checking pending updates', error);
    this.updateUpdatesBadge(0);
  }
};

/**
 * Handle Update button click: one click checks the latest release, installs
 * every update to a rule the user did not edit, says what happened, then asks
 * about the edited ones. Rules that need a newer extension are not updates
 * yet: they are named, and wait in the notice under the toolbar.
 */
Rules.prototype.handleCheckUpdates = async function() {
  const btn = document.querySelector('#checkUpdatesBtn');

  if (!btn) {
    Logger.debug('UI', 'Update button not found');
    return;
  }
  if (btn.classList.contains('checking')) return;

  if (typeof UpdateManager === 'undefined') {
    Logger.warn('UI', '[Rules] UpdateManager not available');
    if (typeof NotificationHelper !== 'undefined') {
      NotificationHelper.error(FormatUtils.t('updateServiceNotAvailable', 'Update service not available'));
    }
    return;
  }

  btn.classList.add('checking');
  try {
    const result = await UpdateManager.checkAndInstall();
    if (result.installed.length > 0) {
      await this.reloadDetectorsFromStorage();
    }
    for (const message of UpdateManager.resultMessages(result, { t: FormatUtils.t, list: FormatUtils.formatList })) {
      NotificationHelper[message.type](message.text, message.type === 'success' ? {} : { duration: 8000 });
    }

    // Rules the user edited are never replaced without asking
    if (result.needsDecision.length > 0) {
      await this.resolveEditedRuleUpdates(result.needsDecision);
    }
    this.updateUpdatesBadge(await UpdateManager.getPendingUpdatesCount());
    this.renderExtensionNotice(await UpdateManager.getIncompatibleUpdates());
  } catch (error) {
    Logger.error('UI', 'Error updating rules', error);
    NotificationHelper.error(FormatUtils.t('errorCheckingForUpdates', 'Error checking for updates'));
  } finally {
    btn.classList.remove('checking');
  }
};

/**
 * Show or hide the notice for rule updates that need a newer extension
 * @param {Array<{id: string, name: string, minExtensionVersion: string}>} updates
 */
Rules.prototype.renderExtensionNotice = function(updates) {
  const notice = document.querySelector('#rulesExtensionNotice');
  if (!notice) return;
  const list = Array.isArray(updates) ? updates : [];
  if (list.length === 0) {
    notice.hidden = true;
    return;
  }
  const [message] = UpdateManager.resultMessages(
    { error: null, release: null, installed: [], needsDecision: [], failed: [], incompatible: list },
    { t: FormatUtils.t, list: FormatUtils.formatList });
  notice.querySelector('.rules-ext-notice-text').textContent = message.text;
  notice.hidden = false;
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
      NotificationHelper.success(_fmt('detectorsUpdatedFmt', `Detectors updated: ${result.count}`, result.count));
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
    chrome.runtime.sendMessage({ type: WorkerMessages.RELOAD_DETECTORS }, () => { void chrome.runtime.lastError; });
    NotificationHelper.success(_tr('ruleResetToOfficial', 'Rule restored to the official version'));
    // The same page of the list, and the focus goes back to the rule: the menu item that was pressed went with the old card
    const place = this.listPlaceOf(category, detectorName);
    await this.displayRules({ keepPage: true });
    this.restoreListFocus(place);
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
      chrome.runtime.sendMessage({ type: WorkerMessages.RELOAD_DETECTORS }, (response) => {
        Logger.ui('Detectors reloaded in background after clear:', response);
      });
      NotificationHelper.success(_fmt('customDetectorsClearedFmt', `Custom detectors removed: ${removed}`, removed));
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
  const failMessage = (error) => {
    const reason = error && error.message ? error.message : String(error);
    return `${_tr('failedRestoreOfficialDetectors', 'Failed to restore official detectors')}: ${reason}`;
  };
  // The latest release on GitHub, as Rules → Update uses; without it the
  // copies included in the extension are used
  let release = null;
  let releaseError = null;
  let found;
  const releaseCopies = new Map();
  const loader = NotificationHelper.loading(_tr('restoreOfficialChecking', 'Checking the latest release on GitHub...'));
  try {
    try {
      const { tag } = await UpdateManager.fetchLatestRelease();
      const index = await UpdateManager.fetchRemoteIndex(tag);
      if (!index) throw Object.assign(new Error('The release index could not be read'), { code: 'unreachable' });
      release = { tag, index };
    } catch (error) {
      releaseError = error;
      Logger.warn('UI', 'Restore: latest release not available, using the packaged detectors', error?.message);
    }
    found = await this.detectorManager.getMissingOfficialDetectors(release);
    // Download the release copies now, so the dialog says where each one
    // really comes from; one that needs a newer extension is left out
    if (release) {
      await Promise.all(found.missing.filter(d => d.inRelease).map(async (d) => {
        const data = await UpdateManager.fetchRemoteDetector(d.category, d.id, release.tag);
        if (data && UpdateManager.isCompatibleWithExtension(data)) {
          releaseCopies.set(d.id, data);
          if (typeof data.name === 'string' && data.name.trim()) d.name = data.name.trim();
        }
      }));
    }
  } catch (error) {
    loader.close();
    Logger.error('UI', 'Failed to list missing official detectors:', error);
    NotificationHelper.error(failMessage(error));
    return;
  }
  loader.close();
  // Nothing to bring back: say so instead of asking
  if (found.missing.length === 0 && found.updateOnly.length === 0) {
    NotificationHelper.info(_tr('allOfficialDetectorsInstalled', 'All official detectors are installed. There is nothing to restore.'));
    return;
  }
  // Name what comes back and from where, before the user confirms
  const shortList = (names) => {
    const max = 8;
    if (names.length <= max) return FormatUtils.formatList(names);
    const more = _fmt('restoreOfficialMoreFmt', `${names.length - max} more`, names.length - max);
    return FormatUtils.formatList([...names.slice(0, max), more]);
  };
  // Only in a release copy this extension cannot run: left to Rules → Update,
  // which offers it once the extension is updated
  for (const d of found.missing.filter(m => !m.packaged && !releaseCopies.has(m.id))) found.updateOnly.push(d.id);
  found.missing = found.missing.filter(m => m.packaged || releaseCopies.has(m.id));
  const fromRelease = found.missing.filter(d => releaseCopies.has(d.id));
  const fromPackage = found.missing.filter(d => !releaseCopies.has(d.id));
  const lines = [];
  if (fromRelease.length > 0) {
    const names = shortList(fromRelease.map(d => d.name));
    lines.push(_fmt('restoreOfficialFromReleaseFmt', `Installed again from release ${release.tag} on GitHub: ${names}.`, release.tag, names));
  }
  if (fromPackage.length > 0) {
    const names = shortList(fromPackage.map(d => d.name));
    lines.push(_fmt('restoreOfficialListFmt', `Installed again from the version included in the extension: ${names}.`, names));
  }
  if (found.updateOnly.length > 0) {
    const names = shortList(found.updateOnly.map(id => DetectorManager.humanizeDetectorName(id)));
    lines.push(_fmt('restoreOfficialUpdateOnlyFmt', `Rules → Update installs these again: ${names}.`, names));
  }
  if (releaseError) {
    lines.push(releaseError.code === 'rate_limited'
      ? _tr('restoreOfficialRateLimited', 'GitHub is limiting requests right now, so the version included in the extension is used.')
      : _tr('restoreOfficialOffline', 'GitHub could not be reached, so the version included in the extension is used.'));
  }
  lines.push(_tr('restoreOfficialUnchanged', 'Your own detectors and your edits to other rules are not changed.'));
  const confirmed = await NotificationHelper.confirm({
    title: _tr('restoreOfficialDetectorsConfirmTitle', 'Restore official detectors?'),
    message: lines.join('<br><br>'),
    confirmText: _tr('restoreOfficialDetectorsConfirmBtn', 'Restore'),
    cancelText: _tr('btnCancel', 'Cancel'),
    type: 'warning',
    tone: 'warning'
  });
  if (!confirmed) return;
  const fetchReleased = async (category, id) => releaseCopies.get(id) || null;
  try {
    const { restored, failed, updateOnly } = await this.detectorManager.restoreOfficialDetectors(found, { fetchReleased });
    if (restored.length > 0) {
      chrome.runtime.sendMessage({ type: WorkerMessages.RELOAD_DETECTORS }, () => {});
      this.displayRules();
    }
    if (failed.length > 0) {
      NotificationHelper.error(_fmt('restoreOfficialFailedFmt', `Could not restore: ${failed.join(', ')}`,
        FormatUtils.formatList(failed.map(id => DetectorManager.humanizeDetectorName(id)))));
    }
    if (restored.length === 1) {
      NotificationHelper.success(_fmt('officialDetectorRestoredFmt', `${restored[0].name} restored`, restored[0].name));
    } else if (restored.length > 1) {
      NotificationHelper.success(_fmt('officialDetectorsRestoredFmt', `${restored.length} official detectors restored`, restored.length));
    }
    if (updateOnly.length > 0) {
      NotificationHelper.info(_tr('restoreOfficialRunUpdate', 'Run Rules → Update to install the rest.'));
    }
  } catch (error) {
    Logger.error('UI', 'Failed to restore official detectors:', error);
    // Say why, so a failure can be reported and fixed
    NotificationHelper.error(failMessage(error));
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
      ? `${baseMessage}<br>${_tr('deleteOfficialDetectorNote', 'This is an official Scrapfly detector. Updates will not bring it back; use "Restore official detectors" in the … menu to get it again.')}`
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
      chrome.runtime.sendMessage({ type: WorkerMessages.RELOAD_DETECTORS }, (response) => {
        Logger.ui('Detectors reloaded in background after delete:', response);
      });

      NotificationHelper.success(_fmt('detectorDeletedFmt', `Deleted "${displayName}"`, displayName));

      // The same page of the list, and the focus goes to the card that took its place: the Delete button went with the old card
      const place = this.listPlaceOf(category, detectorName);
      await this.displayRules({ keepPage: true });
      this.restoreListFocus(place);
    } else {
      NotificationHelper.error(_tr('detectorNotFound', 'Detector not found'));
    }
  } catch (error) {
    Logger.error('UI', 'Failed to delete detector:', error);
    NotificationHelper.error(_tr('failedDeleteDetector', 'Failed to delete detector'));
  }
};

/**
 * A new, empty detector: no name yet, Anti-Bot, today's local time as its date.
 */
Rules.prototype.newDetectorTemplate = function() {
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
    detection: {}
  };
  return newDetector;
};

/**
 * Handle adding a new detector
 */
Rules.prototype.handleAddDetector = function() {
  const newDetector = this.newDetectorTemplate();
  // Open edit modal with the new detector - pass isNew as true
  this.openEditModal(newDetector, 'antibot', newDetector.id, true);
};

// ============================================
// Search Functionality
// ============================================

/**
 * Handle search functionality: the search text and the filter chips together (RulesFilter). The search looks in the name,
 * the category, the description and the method types only, not in the patterns (false positives), and puts the rule whose
 * name is the search first: "Cap" also matches every CAPTCHA by its category and would put Cap on a later page.
 * @param {string} query - Search query
 * @param {{keepPage?: boolean}} [options] - keepPage: the list drawn again after a delete or a reset stays on its page; a new search starts on page 1
 */
Rules.prototype.handleSearch = function(query, { keepPage = false } = {}) {
  this.filteredDetectors = RulesFilter.filter(this.allDetectors, {
    query,
    chips: this.activeChips,
    // The same readers the card uses for its tip and its Edited tag
    isOfficial: ({ detectorName, detector }) => this.isOfficialRule(detectorName, detector),
    isEdited: ({ detector }) => this.isEditedRule(detector),
    // The category as the card shows it ("Anti-Bot" or its translation), as well as the key
    categoryLabelOf: ({ category }) => (typeof this.getCategoryLabel === 'function' ? this.getCategoryLabel(category) : '')
  });

  // Update pagination with filtered results
  if (this.paginationManager) {
    this.paginationManager.setItems(this.filteredDetectors, { keepPage });
  }
  if (typeof this.syncFilterUi === 'function') this.syncFilterUi();
};

/**
 * Turn a chip on or off (a category, Custom, Edited or Disabled) and show what it leaves, with the search typed in the box.
 * @param {string} key - 'antibot', 'captcha', 'fingerprint', 'custom', 'edited' or 'disabled'
 */
Rules.prototype.toggleFilterChip = function(key) {
  if (!RulesFilter.isChip(key)) return;
  this.activeChips = RulesFilter.toggle(this.activeChips, key);
  this.handleSearch(document.querySelector('#rulesSearch')?.value || '');
};

/** Back to every rule: every chip off and the search emptied. */
Rules.prototype.clearFilters = function() {
  this.activeChips = RulesFilter.normalizeChips();
  const input = document.querySelector('#rulesSearch');
  if (input) input.value = '';
  this.handleSearch('');
};

// ============================================
// Acting on the rules shown (a search or a chip is on)
// ============================================

/** Whether the search box or a chip narrows the list. */
Rules.prototype.isFiltered = function() {
  const query = document.querySelector('#rulesSearch')?.value || '';
  return !!query.trim() || RulesFilter.isActive(this.activeChips);
};

/**
 * Export, Turn on and Turn off for the rules shown: each item appears only while a search or a chip is on and it would act on at
 * least one rule (Turn on needs a rule that is off). Written when the menu opens, so it follows the switches turned meanwhile.
 */
Rules.prototype.syncShownMenu = function() {
  const counts = RulesBulk.counts(this.filteredDetectors, this.isFiltered());
  const items = [['#exportShownRulesBtn', counts.export], ['#enableShownRulesBtn', counts.on], ['#disableShownRulesBtn', counts.off]];
  for (const [selector, count] of items) {
    const button = document.querySelector(selector);
    if (!button) continue;
    button.hidden = count === 0;
    const label = button.querySelector('.rules-shown-label');
    if (label && count > 0) label.textContent = I18n.format(label.dataset.key, count);
  }
};

/** Export only the rules shown, in the file Import reads. */
Rules.prototype.handleExportShown = function() {
  const entries = (this.filteredDetectors || []).map(entry => ({
    category: entry.category,
    detectorName: entry.detectorName,
    detector: this.detectorManager.getDetector(entry.category, entry.detectorName) || entry.detector
  }));
  return this.downloadRulesFile(() => RulesBulk.exportOf(entries),
    `scrapfly-detectors-shown-${FormatUtils.localDay(Date.now())}.json`);
};

/**
 * Switch every rule shown on or off with one save and one reload of the worker's rules. A save that fails puts every rule back.
 * @param {boolean} enable
 */
Rules.prototype.handleToggleShown = async function(enable) {
  const targets = RulesBulk.toChange(this.filteredDetectors, enable);
  if (!targets.length) return;
  const stored = targets.map(entry => this.detectorManager.getDetector(entry.category, entry.detectorName)).filter(Boolean);
  try {
    for (const detector of stored) detector.enabled = enable;
    await this.detectorManager.saveDetectorsToStorage();
    chrome.runtime.sendMessage({ type: WorkerMessages.RELOAD_DETECTORS }, () => void chrome.runtime.lastError);
    for (const entry of targets) this.syncListedEnabled(entry.category, entry.detectorName, enable);
    NotificationHelper.success(I18n.format(enable ? 'rulesShownOnDoneFmt' : 'rulesShownOffDoneFmt', targets.length));
  } catch (error) {
    Logger.error('UI', 'Failed to switch the rules shown:', error);
    for (const detector of stored) detector.enabled = !enable;
    NotificationHelper.error(I18n.get('rulesToggleSaveFailed') || 'Could not save the change. Try again.');
  }
  // Drawn again on the same page: the cards show the new switches
  this.displayRules({ keepPage: true });
};
