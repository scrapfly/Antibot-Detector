// Log collector UI methods for SettingsUI — extracted from settings-ui.js.
// Requires settings-ui.js to load first (defines const SettingsUI).

SettingsUI.startLogCountUpdate = function() {
    if (this.logCountUpdateInterval) {
      clearInterval(this.logCountUpdateInterval);
    }

    // Update immediately
    this.updateLogCount();

    // Then update every 2 seconds
    this.logCountUpdateInterval = setInterval(() => {
      this.updateLogCount();
    }, 2000);
};

SettingsUI.stopLogCountUpdate = function() {
    if (this.logCountUpdateInterval) {
      clearInterval(this.logCountUpdateInterval);
      this.logCountUpdateInterval = null;
    }
};

SettingsUI.updateLogCount = function() {
    chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_GET_COUNT' }).then((response) => {
      if (response && typeof response.count === 'number') {
        const logCountValue = document.querySelector('#logCountValue');
        if (logCountValue) {
          logCountValue.textContent = response.count;
        }
      }
    }).catch(() => {
      // Silently ignore errors
    });
};

SettingsUI._setupLogListeners = function() {
    const debugModeToggle = document.querySelector('#debugModeGeneral');
    if (debugModeToggle) {
      debugModeToggle.addEventListener('change', (e) => {
        const logCollectorSection = document.querySelector('#logCollectorSection');
        if (logCollectorSection) {
          logCollectorSection.style.display = e.target.checked ? 'block' : 'none';
        }
      });
    }

    const logCollectorToggle = document.querySelector('#logCollectorEnabled');
    if (logCollectorToggle) {
      logCollectorToggle.addEventListener('change', (e) => {
        const logCollectorControls = document.querySelector('#logCollectorControls');
        if (logCollectorControls) {
          logCollectorControls.style.display = e.target.checked ? 'block' : 'none';
        }

        if (e.target.checked) {
          chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_ENABLE' }).catch(() => {
            Logger.ui('Failed to enable log collection');
          });
          this.startLogCountUpdate();
        } else {
          chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_DISABLE' }).catch(() => {
            Logger.ui('Failed to disable log collection');
          });
          this.stopLogCountUpdate();
        }
      });
    }

    const _tLog = (typeof I18n !== 'undefined') ? I18n : null;
    const _trLog = (key, fallback) => (_tLog && _tLog.get(key)) || fallback;

    const exportLogsJsonBtn = document.querySelector('#exportLogsJsonBtn');
    if (exportLogsJsonBtn) {
      exportLogsJsonBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_EXPORT_JSON' }).catch(() => {
          NotificationHelper.error(_trLog('failedExportLogs', 'Failed to export logs'));
        });
      });
    }

    const exportLogsTextBtn = document.querySelector('#exportLogsTextBtn');
    if (exportLogsTextBtn) {
      exportLogsTextBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_EXPORT_TEXT' }).catch(() => {
          NotificationHelper.error(_trLog('failedExportLogs', 'Failed to export logs'));
        });
      });
    }

    const clearLogsBtn = document.querySelector('#clearLogsBtn');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', async () => {
        const confirmed = await NotificationHelper.confirm({
          title: _trLog('clearLogsTitle', 'Clear Logs'),
          message: _trLog('clearLogsMessage', 'Are you sure you want to clear all collected logs? This action cannot be undone.'),
          type: 'warning',
          confirmText: _trLog('btnClear', 'Clear'),
          cancelText: _trLog('btnCancel', 'Cancel')
        });

        if (confirmed) {
          chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_CLEAR' }).then(() => {
            const logCountValue = document.querySelector('#logCountValue');
            if (logCountValue) {
              logCountValue.textContent = '0';
            }
            NotificationHelper.success(_trLog('logsCleared', 'Logs cleared'));
          }).catch(() => {
            NotificationHelper.error(_trLog('failedClearLogs', 'Failed to clear logs'));
          });
        }
      });
    }

    const logCollectorMaxLogsInput = document.querySelector('#logCollectorMaxLogs');
    if (logCollectorMaxLogsInput) {
      logCollectorMaxLogsInput.addEventListener('change', (e) => {
        let maxLogs = parseInt(e.target.value || 5000);
        if (maxLogs < 100) maxLogs = 100;
        if (maxLogs > 5000) maxLogs = 5000;
        e.target.value = maxLogs;
        const logCountMax = document.querySelector('#logCountMax');
        if (logCountMax) {
          logCountMax.textContent = maxLogs;
        }
        chrome.runtime.sendMessage({ type: 'LOG_COLLECTOR_SET_MAX_LOGS', maxLogs: maxLogs }).catch(() => {
          Logger.ui('Failed to set max logs');
        });
      });
    }
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
