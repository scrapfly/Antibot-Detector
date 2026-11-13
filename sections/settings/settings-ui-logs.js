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
    chrome.runtime.sendMessage({ type: WorkerMessages.LOG_COLLECTOR_GET_COUNT }).then((response) => {
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

        // Collection preferences apply with Save, like the other form fields.
        if (e.target.checked) this.startLogCountUpdate();
        else this.stopLogCountUpdate();
      });
    }

    const _tLog = (typeof I18n !== 'undefined') ? I18n : null;
    const _trLog = (key, fallback) => (_tLog && _tLog.get(key)) || fallback;

    // Only the worker's own "success" is success. Its error answer, "unknown" from a worker that predates the message
    // (an unpacked extension edited without a reload), no answer and a closed port all mean the logs were not handled.
    const workerDid = async (type) => {
      try {
        const response = await chrome.runtime.sendMessage({ type });
        return Boolean(response) && response.status === 'success';
      } catch (_) {
        return false;
      }
    };
    // The worker builds the file; it is saved here from a Blob (a full log is over the size Chrome takes in a data: address, and a
    // worker cannot make a Blob address). True once the download has started: a refused one is a failure, said as one.
    const saveFile = async ({ filename, type, text }) => {
      if (!chrome.downloads || typeof chrome.downloads.download !== 'function' ||
          typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof Blob !== 'function') return false;
      const url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' }));
      try {
        return await new Promise((resolve) => {
          chrome.downloads.download({ url, filename, saveAs: false }, (id) => {
            resolve(!chrome.runtime.lastError && typeof id === 'number');
          });
        });
      } catch (_) {
        return false;
      } finally {
        // Chrome reads a Blob address after it hands out the download id: let it go a minute later
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    };
    const exportLogs = async (type) => {
      let response = null;
      try {
        response = await chrome.runtime.sendMessage({ type });
      } catch (_) {
        response = null;
      }
      let done = Boolean(response) && response.status === 'success';
      // A worker from before 3.1.8 started the download itself and sends no file
      if (done && typeof response.text === 'string') done = await saveFile(response);
      if (!done) NotificationHelper.error(_trLog('failedExportLogs', 'Failed to export logs'));
    };

    const exportLogsJsonBtn = document.querySelector('#exportLogsJsonBtn');
    if (exportLogsJsonBtn) {
      exportLogsJsonBtn.addEventListener('click', () => exportLogs(WorkerMessages.LOG_COLLECTOR_EXPORT_JSON));
    }

    const exportLogsTextBtn = document.querySelector('#exportLogsTextBtn');
    if (exportLogsTextBtn) {
      exportLogsTextBtn.addEventListener('click', () => exportLogs(WorkerMessages.LOG_COLLECTOR_EXPORT_TEXT));
    }

    const clearLogsBtn = document.querySelector('#clearLogsBtn');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', async () => {
        const confirmed = await NotificationHelper.confirm({
          title: _trLog('clearLogsTitle', 'Clear logs'),
          message: _trLog('clearLogsMessage', 'Are you sure you want to clear all collected logs? This action cannot be undone.'),
          type: 'warning',
          tone: 'danger',
          confirmText: _trLog('btnClear', 'Clear'),
          cancelText: _trLog('btnCancel', 'Cancel')
        });

        if (confirmed) {
          if (await workerDid(WorkerMessages.LOG_COLLECTOR_CLEAR)) {
            const logCountValue = document.querySelector('#logCountValue');
            if (logCountValue) {
              logCountValue.textContent = '0';
            }
            NotificationHelper.success(_trLog('logsCleared', 'Logs cleared'));
          } else {
            NotificationHelper.error(_trLog('failedClearLogs', 'Failed to clear logs'));
          }
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
      });
    }
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
