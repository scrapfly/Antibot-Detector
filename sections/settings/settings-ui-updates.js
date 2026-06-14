// Settings update/save UI methods for SettingsUI — extracted from settings-ui.js
// after the file split. Requires settings-ui.js to load first.

SettingsUI.handleSaveSettings = async function() {
  Logger.ui('handleSaveSettings() called');
  const _t = (typeof I18n !== 'undefined') ? I18n : null;
  const _tr = (key, fallback) => (_t && _t.get(key)) || fallback;
  const _fmt = (key, fallback, ...args) => (_t && _t.format(key, ...args)) || fallback;

  try {
    Logger.ui('Getting settings from UI...');
    const newSettings = this.getSettingsFromUI();
    Logger.ui('Settings from UI:', newSettings);

    Logger.ui('Validating settings...');
    const validation = this.validateSettings(newSettings);
    Logger.ui('Validation result:', validation);

    if (!validation.isValid) {
      Logger.warn('UI', 'Settings validation failed:', validation.errors);
      NotificationHelper.error(
        _fmt('invalidSettingsFmt', 'Invalid settings: ' + validation.errors.join(', '), validation.errors.join(', '))
      );
      return;
    }

    Logger.ui('Merging settings...');
    this.settings = this.deepMerge(this.settings, newSettings);
    Logger.ui('Settings merged:', this.settings);

    Logger.ui('Saving settings to storage...');
    await this.saveSettings();
    Logger.ui('Settings saved successfully');

    Logger.ui('Closing modal...');
    this.hideSettings();
    Logger.ui('Modal closed');

  } catch (error) {
    Logger.error('UI', 'Failed to handle save settings:', error);
    NotificationHelper.error(
      _fmt('failedSaveSettingsFmt', 'Failed to save settings: ' + error.message, error.message)
    );
  }
};

SettingsUI.updateIncompatibleUpdatesDisplay = async function() {
  const warning = document.querySelector('#incompatibleUpdatesWarning');
  if (!warning || typeof UpdateManager === 'undefined') return;

  try {
    const updates = await UpdateManager.getIncompatibleUpdates();

    if (updates.length === 0) {
      warning.style.display = 'none';
      return;
    }

    warning.style.display = 'flex';

    const countSpan = document.querySelector('#incompatibleCount');
    if (countSpan) {
      countSpan.textContent = String(updates.length);
    }

    const list = document.querySelector('#incompatibleDetailsList');
    if (list) {
      list.replaceChildren();

      for (const update of updates) {
        const item = document.createElement('div');
        item.className = 'incompatible-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'incompatible-item-name';
        nameSpan.textContent = update.name || update.id;

        const versionSpan = document.createElement('span');
        versionSpan.className = 'incompatible-item-version';
        versionSpan.textContent = `v${update.remoteVersion} (needs ext v${update.minExtensionVersion})`;

        item.appendChild(nameSpan);
        item.appendChild(versionSpan);
        list.appendChild(item);
      }
    }
  } catch (error) {
    Logger.error('UI', 'Failed to update incompatible updates display:', error);
    warning.style.display = 'none';
  }
};

SettingsUI.handleCheckUpdatesNow = async function() {
  const btn = document.querySelector('#checkUpdatesNowBtn');
  const lastCheckSpan = document.querySelector('#lastUpdateCheckTime');
  if (!btn) return;

  const _t = (typeof I18n !== 'undefined') ? I18n : null;
  const _tr = (key, fallback) => (_t && _t.get(key)) || fallback;
  const _fmt = (key, fallback, ...args) => (_t && _t.format(key, ...args)) || fallback;

  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" class="spin">
      <path d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" fill="currentColor"/>
    </svg>
    Checking...
  `;

  try {
    if (typeof UpdateManager === 'undefined') {
      throw new Error(_tr('updateServiceNotAvailable', 'Update service not available'));
    }

    const result = await UpdateManager.checkForUpdates(true);

    if (lastCheckSpan) {
      const settings = await Utils.getSettings();
      const lastCheck = settings.updates?.lastCheckTimestamp || 0;
      lastCheckSpan.textContent = lastCheck > 0
        ? UpdateManager.formatLastCheck(lastCheck)
        : _tr('timeJustNow', 'Just now');
    }

    const pendingCount = await UpdateManager.getPendingUpdatesCount();

    if (result.error) {
      NotificationHelper.error(_tr('failedCheckForUpdates', 'Failed to check for updates'));
    } else if (pendingCount > 0) {
      NotificationHelper.success(
        _fmt('foundDetectorUpdatesAvailableFmt', `Found ${pendingCount} detector updates available!`, pendingCount)
      );
    } else {
      NotificationHelper.info(_tr('allDetectorsUpToDate', 'All detectors are up to date.'));
    }

    const incompatibleCount = await UpdateManager.getIncompatibleUpdatesCount();
    if (incompatibleCount > 0) {
      const msg = incompatibleCount === 1
        ? '1 detector update requires a newer extension version.'
        : `${incompatibleCount} detector updates require a newer extension version.`;
      NotificationHelper.warning(msg, { duration: 8000 });
    }

    await this.updateIncompatibleUpdatesDisplay();

    Logger.ui('Update check completed:', { pendingCount, incompatibleCount, result });

  } catch (error) {
    Logger.error('UI', 'Failed to check for updates:', error);
    NotificationHelper.error(
      _fmt('failedCheckForUpdatesFmt', 'Failed to check for updates: ' + error.message, error.message)
    );
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
};

if (typeof self !== 'undefined') {
  self.SettingsUI = SettingsUI;
}
