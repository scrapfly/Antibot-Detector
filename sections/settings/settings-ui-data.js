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
        // Share-service keys and tokens stay in this browser
        settings: SettingsUI.withoutShareSecrets(this.settings),
        languageOverride: langResult.scrapfly_language_override || 'auto'
      };
      const date = new Date().toISOString().split('T')[0];
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
      // deepMerge drops values whose type does not match the current shape.
      this.settings = this.deepMerge(this.settings, imported);
      this.updateSettingsUI();
      await this.saveSettings({ notify: false });
      const knownLanguage = Array.isArray(SettingsUI.LANGUAGE_OPTIONS)
        && SettingsUI.LANGUAGE_OPTIONS.some((opt) => opt.value === data.languageOverride);
      if (knownLanguage && typeof SettingsUI._applyLanguageChoice === 'function') {
        await SettingsUI._applyLanguageChoice.call(this, data.languageOverride);
      }
      NotificationHelper.success(_tr('settingsImportedToast', 'Settings imported'));
    } catch (error) {
      Logger.error('UI', 'Failed to import settings:', error);
      NotificationHelper.error(_tr('settingsImportFailedToast', 'Failed to import settings: invalid file'));
    }
    input.value = '';
};

SettingsUI._csvCell = function(value) {
    const text = value === null || value === undefined ? '' : String(value);
    // Neutralise spreadsheet formulas and quote every cell.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
};

SettingsUI.exportHistoryCsv = async function() {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    try {
      const items = await SettingsUI._readStoredHistoryItems();
      const header = ['timestamp', 'url', 'hostname', 'title', 'detectionCount', 'categories', 'detections'];
      const rows = items.map((item) => {
        const detections = Array.isArray(item.detections) ? item.detections : [];
        const names = detections.map((d) => d && (d.name || d.detector || d.id)).filter(Boolean);
        const categories = Array.isArray(item.categories) ? item.categories : [];
        return [
          item.timestamp ? new Date(item.timestamp).toISOString() : '',
          item.url || '',
          item.hostname || '',
          item.title || '',
          item.detectionCount ?? detections.length,
          categories.join('; '),
          names.join('; ')
        ].map(SettingsUI._csvCell).join(',');
      });
      const csv = [header.join(','), ...rows].join('\r\n');
      const date = new Date().toISOString().split('T')[0];
      SettingsUI._downloadFile(csv, `scrapfly-history-${date}.csv`, 'text/csv');
      NotificationHelper.success(_fmt('notificationHistoryExportedFmt', `Exported ${items.length} history items`, items.length));
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
