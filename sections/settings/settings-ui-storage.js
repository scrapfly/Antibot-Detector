// Settings → Data → Storage: how much space each part of the extension uses, and the Clear buttons.
// Requires settings-ui.js to load first (defines const SettingsUI) and modules/settings/storage-overview.js.

/** The sizes of the parts, from the browser's own count of what each group of keys takes. */
SettingsUI.readStorageSizes = async function() {
    const local = chrome.storage.local;
    const sizes = Object.fromEntries(await Promise.all(StorageOverview.GROUPS.map(async group => [group.id, await local.getBytesInUse(group.keys)])));
    return StorageOverview.summarize(sizes, await local.getBytesInUse(null), local.QUOTA_BYTES, HistoryStore.hasUnlimitedStorage());
};

SettingsUI.refreshStorageOverview = async function() {
    const list = document.querySelector('#storageRows');
    if (!list) return;
    const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    let summary;
    try {
        summary = await SettingsUI.readStorageSizes();
    } catch (error) {
        Logger.warn('UI', 'Could not read the storage sizes', error);
        return;
    }
    const size = (bytes) => (bytes > 0 ? SettingsUI.formatStorageSize(bytes) : '0 KB');
    const rows = [...summary.rows, { id: 'other', labelKey: 'storageOther', label: 'Other', bytes: summary.other, clear: null, empty: false }];
    list.textContent = '';
    for (const row of rows) {
        const item = document.createElement('li');
        item.className = 'storage-row';
        item.dataset.storage = row.id;
        const name = document.createElement('span');
        name.className = 'storage-row-label';
        name.textContent = text(row.labelKey, row.label);
        const value = document.createElement('span');
        value.className = 'storage-row-size';
        value.textContent = size(row.bytes);
        item.append(name, value);
        if (row.clear) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `data-btn storage-clear-btn${row.clear === 'history' ? ' storage-clear-btn--danger' : ''}`;
            button.dataset.clear = row.clear;
            button.textContent = text('btnClear', 'Clear');
            const label = text('storageClearRowFmt', 'Clear {0}', name.textContent);
            button.title = label;
            button.setAttribute('aria-label', label);
            button.disabled = row.empty;
            item.append(button);
        } else {
            const filler = document.createElement('span');
            filler.className = 'storage-row-filler';
            item.append(filler);
        }
        list.append(item);
    }
    const percent = Math.round(summary.ratio * 100);
    const meter = document.querySelector('#storageMeter');
    if (meter) {
        meter.setAttribute('aria-valuenow', String(percent));
        meter.classList.toggle('is-warn', summary.ratio >= 0.8 && summary.ratio < 0.95);
        meter.classList.toggle('is-full', summary.ratio >= 0.95);
    }
    const fill = document.querySelector('#storageMeterFill');
    if (fill) fill.style.width = `${percent}%`;
    const total = document.querySelector('#storageTotalText');
    if (total) {
        total.textContent = summary.unlimited
            ? text('storageTotalUnlimitedFmt', '{0} used, no limit', size(summary.total))
            : text('storageTotalFmt', '{0} of {1} used', size(summary.total), size(summary.quota));
    }
    if (meter) meter.hidden = summary.unlimited;
};

/** What each Clear button does, after a confirmation. The cache, the captures and the logs go through the worker; History through its own tab. */
SettingsUI.clearStoragePart = async function(part) {
    const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    const confirm = (title, message, confirmText = text('btnClear', 'Clear')) => NotificationHelper.confirm({
        title, message, type: 'warning', tone: 'danger', confirmText, cancelText: text('btnCancel', 'Cancel')
    });
    const ask = (message) => new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => resolve(!chrome.runtime.lastError && response && response.status !== 'error'));
    });
    try {
        if (part === 'cache') {
            if (!await confirm(text('storageClearCacheTitle', 'Clear the detection cache'), text('storageClearCacheMessage', 'Pages are scanned again the next time you open them. History, rules and settings are not touched.'))) return;
            if (!await ask({ type: WorkerMessages.DETECTION_CLEAR_ALL_CACHE })) throw new Error('The worker did not clear the cache');
            // The Detection tab behind Settings must not keep showing the cleared result
            window.popupInstance?.detection?.refreshAfterCacheChange?.();
            NotificationHelper.success(text('storageCacheCleared', 'Detection cache cleared'));
        } else if (part === 'captures') {
            if (!await confirm(text('storageClearCapturesTitle', 'Delete tool captures'), text('storageClearCapturesMessage', 'Everything the Advanced tools saved is deleted. History, rules and settings are not touched.'))) return;
            await AdvancedHistoryStore.clear();
            NotificationHelper.success(text('storageCapturesCleared', 'Tool captures deleted'));
        } else if (part === 'updates') {
            if (!await confirm(text('storageClearUpdatesTitle', 'Clear the pending rule updates'), text('storageClearUpdatesMessage', 'Rule updates that are waiting for a newer extension, and ones that failed, are forgotten; the next Rules → Update finds them again. Rules and settings are not touched.'))) return;
            await chrome.storage.local.remove([...StorageOverview.GROUPS.find(group => group.id === 'updates').keys]);
            NotificationHelper.success(text('storageUpdatesCleared', 'Pending rule updates cleared'));
        } else if (part === 'logs') {
            if (!await confirm(text('clearLogsTitle', 'Clear Logs'), text('clearLogsMessage', 'Are you sure you want to clear all collected logs? This action cannot be undone.'))) return;
            if (!await ask({ type: WorkerMessages.LOG_COLLECTOR_CLEAR })) throw new Error('The worker did not clear the logs');
            NotificationHelper.success(text('logsCleared', 'Logs cleared'));
        } else if (part === 'history') {
            // The History tab's own question and answer: the same words, and clearHistory() for the rest
            if (!await confirm(text('dialogClearHistoryTitle', 'Clear History'), text('dialogClearHistoryMessage', 'Are you sure you want to clear all history? This action cannot be undone.'), text('buttonClearAll', 'Clear All'))) return;
            const history = window.popupInstance && window.popupInstance.history;
            if (!history || typeof history.clearHistory !== 'function') throw new Error('History is not loaded');
            await history.clearHistory();
        }
    } catch (error) {
        Logger.warn('UI', `Could not clear ${part}`, error);
        NotificationHelper.error(text('storageClearFailed', 'Could not clear it. Try again.'));
    }
    await SettingsUI.refreshStorageOverview();
};

SettingsUI._setupStorageListeners = function() {
    const list = document.querySelector('#storageRows');
    if (!list) return;
    list.addEventListener('click', (event) => {
        const button = event.target.closest('[data-clear]');
        if (button && !button.disabled) SettingsUI.clearStoragePart(button.dataset.clear);
    });
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
