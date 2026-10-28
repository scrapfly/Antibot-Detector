// Data management UI methods for SettingsUI — extracted from settings-ui.js.
// Requires settings-ui.js to load first (defines const SettingsUI).

// ========== EXPORT / IMPORT ==========

SettingsUI._downloadFile = function(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

SettingsUI._readStoredHistoryItems = async function() {
    return HistoryStore.read(chrome.storage.local);
};

SettingsUI.exportSettingsFile = async function() {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    try {
      const langResult = await chrome.storage.local.get(['scrapfly_language_override']);
      const exportData = {
        version: chrome.runtime.getManifest().version,
        timestamp: new Date().toISOString(),
        // Integration connection details stay in this browser
        settings: SettingsTransfer.portable(this.settingsBaseline || this.settings),
        languageOverride: langResult.scrapfly_language_override || 'auto'
      };
      const date = FormatUtils.localDay(Date.now());
      SettingsUI._downloadFile(JSON.stringify(exportData, null, 2), `scrapfly-settings-${date}.json`, 'application/json');
      NotificationHelper.success(_tr('settingsExportedToast', 'Settings exported'));
    } catch (error) {
      Logger.error('UI', 'Failed to export settings:', error);
      NotificationHelper.error(_tr('settingsExportFailedToast', 'Failed to export settings'));
    }
};

SettingsUI.importSettingsFile = async function(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    try {
      const data = JSON.parse(await file.text());
      const imported = data && typeof data.settings === 'object' && data.settings !== null ? data.settings : data;
      if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
        throw new Error('Invalid settings file');
      }
      // A portable file changes preferences only. Connections already stored in
      // this browser survive even when an older export includes credentials.
      // Over the saved settings: a change staged in the form but not saved is not written with the import
      const candidate = this.deepMerge(this.settingsBaseline || this.settings, SettingsTransfer.portable(imported));
      const validation = this.validateSettings(candidate);
      if (!validation.isValid) throw new Error('Invalid settings file');
      // A smaller History size than History uses is asked about first (declined, the current size stays)
      await SettingsUI.confirmHistorySizeFor.call(this, candidate);
      const knownLanguage = Array.isArray(SettingsUI.LANGUAGE_OPTIONS)
        && SettingsUI.LANGUAGE_OPTIONS.some((opt) => opt.value === data.languageOverride);
      // Showing a language reloads the popup and wipes this import's message: only when it is another one
      const languageBefore = typeof SettingsUI.languageInForce === 'function' ? await SettingsUI.languageInForce() : null;
      const saved = await this.saveSettings({
        notify: false, notifyError: false, candidate,
        languageOverride: knownLanguage ? data.languageOverride : undefined
      });
      if (!saved) {
        NotificationHelper.error(_tr('settingsImportSaveFailedToast', 'Could not save imported settings. Your settings and language have been kept.'));
        return;
      }
      this.updateSettingsUI();
      if (knownLanguage && data.languageOverride !== languageBefore && typeof SettingsUI._applyLanguageChoice === 'function') {
        await SettingsUI._applyLanguageChoice.call(this, data.languageOverride, { persist: false });
      }
      NotificationHelper.success(_tr('settingsImportedToast', 'Settings imported'));
    } catch (error) {
      Logger.error('UI', 'Failed to import settings');
      NotificationHelper.error(_tr('settingsImportReadFailedToast', 'Could not read a valid settings file. Nothing was changed.'));
    } finally {
      input.value = '';
    }
};

SettingsUI.exportHistoryCsv = async function() {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    try {
      const items = await SettingsUI._readStoredHistoryItems();
      // The same file as History → Export → CSV: one row per protection, with its confidence, pin and note
      const saved = await Utils.getHistorySettings();
      const built = HistoryExport.build(items, { format: 'csv', includeTimestamps: saved.includeTimestamps !== false });
      SettingsUI._downloadFile(built.text, HistoryExport.fileName(built.format), built.type);
      NotificationHelper.success(items.length === 1
        ? ((t && t.get('notificationHistoryExportedOne')) || 'Exported 1 history item')
        : _fmt('notificationHistoryExportedFmt', `Exported ${items.length} history items`, items.length));
    } catch (error) {
      Logger.error('UI', 'Failed to export history:', error);
      NotificationHelper.error(_fmt('notificationImportHistoryFailedFmt', 'Failed to export history: ' + error.message, error.message));
    }
};

SettingsUI.importHistoryFile = async function(event) {
    // Reuse the History section's importer (merge/replace prompt, limits).
    const history = (typeof window !== 'undefined' && window.popupInstance) ? window.popupInstance.history : null;
    if (!history || typeof history.handleImport !== 'function') {
      event.target.value = '';
      return;
    }
    if (typeof history.loadHistoryFromStorage === 'function') {
      await history.loadHistoryFromStorage();
    }
    await history.handleImport(event);
};

SettingsUI._setupDataListeners = function() {
    const exportSettingsBtn = document.querySelector('#exportSettingsBtn');
    const importSettingsBtn = document.querySelector('#importSettingsBtn');
    const importFile = document.querySelector('#importFile');
    if (exportSettingsBtn) {
      exportSettingsBtn.addEventListener('click', () => SettingsUI.exportSettingsFile.call(this));
    }
    if (importSettingsBtn && importFile) {
      importSettingsBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => SettingsUI.importSettingsFile.call(this, e));
    }

    const exportHistoryBtn = document.querySelector('#settingsExportHistoryBtn');
    const importHistoryBtn = document.querySelector('#settingsImportHistoryBtn');
    const importHistoryFile = document.querySelector('#settingsImportHistoryFile');
    if (exportHistoryBtn) {
      exportHistoryBtn.addEventListener('click', () => SettingsUI.exportHistoryCsv.call(this));
    }
    if (importHistoryBtn && importHistoryFile) {
      importHistoryBtn.addEventListener('click', () => importHistoryFile.click());
      importHistoryFile.addEventListener('change', (e) => SettingsUI.importHistoryFile.call(this, e));
    }
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
