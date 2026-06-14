// Data management UI methods for SettingsUI — extracted from settings-ui.js.
// Requires settings-ui.js to load first (defines const SettingsUI).

SettingsUI.resetToDefaults = async function() {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const confirmed = await NotificationHelper.confirm({
      title: _tr('settingsResetTitle', 'Reset Settings'),
      message: _tr('settingsResetMessage', 'Are you sure you want to reset all settings to their default values? This action cannot be undone.'),
      type: 'warning',
      confirmText: _tr('btnReset', 'Reset'),
      cancelText: _tr('btnCancel', 'Cancel')
    });

    if (confirmed) {
      await this.loadDefaults();
      this.updateSettingsUI();
      await this.saveSettings();
      NotificationHelper.success(_tr('settingsResetToast', 'Settings reset'));
    }
};

SettingsUI.clearAllData = async function() {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    const confirmed = await NotificationHelper.confirm({
      title: _tr('clearAllDataTitle', 'Clear All Data'),
      message: _tr('clearAllDataMessage', 'Are you sure you want to clear ALL extension data? This will remove:<br><br>• All detection history<br>• All detector rules<br>• All settings<br><br>This action cannot be undone!'),
      type: 'danger',
      confirmText: _tr('clearEverythingBtn', 'Clear Everything'),
      cancelText: _tr('btnCancel', 'Cancel')
    });

    if (confirmed) {
      try {
        await chrome.storage.local.clear();
        NotificationHelper.success(_tr('dataClearedReloadNotice', 'All data cleared successfully! The extension will reload.'));

        setTimeout(() => {
          chrome.runtime.reload();
        }, 2000);

      } catch (error) {
        Logger.error('UI', 'Failed to clear data:', error);
        NotificationHelper.error(_fmt('failedClearDataFmt', 'Failed to clear data: ' + error.message, error.message));
      }
    }
};

SettingsUI._setupDataListeners = function() {
    const resetSettingsBtn = document.querySelector('#resetSettingsBtn');
    if (resetSettingsBtn) {
      resetSettingsBtn.addEventListener('click', () => this.resetToDefaults());
    }

    const clearAllDataBtn = document.querySelector('#clearAllDataBtn');
    if (clearAllDataBtn) {
      clearAllDataBtn.addEventListener('click', () => this.clearAllData());
    }
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
