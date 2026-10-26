/**
 * Advanced Section Utilities
 * Shared utilities for Advanced UI modules
 *
 * This file provides common functionality for Advanced section modules
 * that run in the popup context (not service worker).
 *
 * NOTE: Several helpers only hand over to FormatUtils, AdvancedToolClient or NotificationHelper.
 */


/** i18n lookups with an inline English fallback (I18n may be absent in tests). */
const _advUtilsTr = (key, fallback) => (typeof I18n !== 'undefined' && I18n.get(key)) || fallback;
const _advUtilsFmt = (key, fallback, ...args) => (typeof I18n !== 'undefined' && I18n.format(key, ...args)) || fallback;

const AdvancedUtils = {
    /**
     * Get relative time string - delegates to Utils
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {string} Relative time string (e.g., "5m ago")
     */
    getTimeAgo(timestamp) {
        return FormatUtils.getTimeAgo(timestamp);
    },

    /**
     * Load capture history from storage (popup context)
     * A UI-friendly wrapper around AdvancedHistoryStore (the popup's client of the worker's store)
     * @param {string} type - Module type (e.g., 'akamai', 'recaptcha')
     * @param {string} hostname - Optional hostname filter
     * @returns {Promise<Array>} Array of capture history items
     */
    async loadCaptureHistory(type, hostname = null) {
        try {
            if (!AdvancedHistoryStore) {
                return [];
            }

            const captures = await AdvancedHistoryStore.getModule(type, {
                includeExpired: false,
                hostname
            });

            return captures.map((item) => ({
                ...item,
                type: item.type || type,
                captureData: item.captureData !== undefined ? item.captureData : item.data
            }));

        } catch (error) {
            Logger.error('UI', `[AdvancedUtils] Failed to load capture history for ${type}:`, error);
            return [];
        }
    },

    /**
     * Show a confirmation dialog: the popup's shared dialog
     * (NotificationHelper.confirm), so Advanced asks the same way as every
     * other tab. A 'danger' dialog gets the red action and starts on Cancel.
     * @param {object} options - Modal options
     * @returns {Promise<boolean>} True if confirmed, false if cancelled
     */
    showConfirmationModal(options = {}) {
        const {
            title = _advUtilsTr('advPanelConfirmAction', 'Confirm Action'),
            message = _advUtilsTr('notifConfirmMessageDefault', 'Are you sure?'),
            confirmText = _advUtilsTr('advPanelBtnConfirm', 'Confirm'),
            cancelText = _advUtilsTr('btnCancel', 'Cancel'),
            confirmClass = 'danger' // 'danger', 'primary', 'success'
        } = options;

        return NotificationHelper.confirm({
            title,
            message,
            confirmText,
            cancelText,
            type: confirmClass === 'danger' ? 'danger' : 'info'
        });
    },

    /**
     * Format bytes to human-readable size
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size (e.g., "1.5 KB")
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        if (!bytes || isNaN(bytes)) return '-';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Copy text to clipboard with visual feedback
     * @param {string} text - Text to copy
     * @param {HTMLElement} button - Optional button element for feedback
     * @returns {Promise<boolean>} True if successful
     */
    async copyToClipboard(text, button = null, options = {}) {
        return FormatUtils.copyToClipboard(text, {
            element: button,
            notificationMessage: options.notificationMessage || _advUtilsTr('advPanelCopiedToClipboard', 'Copied to clipboard'),
            inlineMessage: options.inlineMessage || _advUtilsTr('copiedInlineMsg', '✓ Copied!'),
            revertDelay: options.revertDelay || 1600,
            notify: options.notify !== undefined ? options.notify : true
        });
    },

    /**
     * Send message to background script
     * @param {object} message - Message object
     * @returns {Promise<object>} Response from background
     */
    async sendMessage(message) {
        return AdvancedToolClient.send(message);
    },


    /**
     * Escape HTML to prevent XSS - delegates to Utils
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        return FormatUtils.escapeHtml(text);
    },

    /**
     * Reload a tab and wait until it has finished loading (tabs.onUpdated status
     * "complete" after the reload started), with a time limit instead of a fixed sleep.
     * @param {number} tabId
     * @param {{ timeoutMs?: number }} [options]
     * @returns {Promise<boolean>} true when the load completed in time
     */
    reloadTabAndWait(tabId, { timeoutMs = 15000 } = {}) {
        return new Promise(resolve => {
            let done = false;
            let loading = false;
            let timer = null;
            const listener = (id, changeInfo) => {
                if (id !== tabId || !changeInfo) return;
                if (changeInfo.status === 'loading') loading = true;
                else if (changeInfo.status === 'complete' && loading) finish(true);
            };
            const finish = loaded => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                try { chrome.tabs.onUpdated.removeListener(listener); } catch (_) { /* popup closing */ }
                resolve(loaded);
            };
            try { chrome.tabs.onUpdated.addListener(listener); } catch (_) { /* fallback: timer */ }
            timer = setTimeout(() => finish(false), timeoutMs);
            Promise.resolve().then(() => chrome.tabs.reload(tabId)).catch(() => finish(false));
        });
    },

    /**
     * Standardized notification messages for advanced modules
     * Provides consistent messaging across all advanced modules
     */
    notifications: {

        /**
         * Check cookies operation notifications
         */
        checkCookies: {
            success: (count, total) => _advUtilsFmt('advPanelCookiesFoundFmt', `Found ${count}/${total} cookies`, count, total),
            none: (moduleName) => _advUtilsFmt('advCommonNoCookiesFmt', `No ${moduleName} cookies found`, moduleName)
        },

        /**
         * Analyze/Extract scripts operation notifications
         */
        analyzeScripts: {
            start: (moduleName) => _advUtilsFmt('advCommonAnalyzingReloadFmt', `Analyzing ${moduleName} scripts... Page will reload`, moduleName),
            success: (count) => _advUtilsFmt('advPanelScriptsFoundFmt', `Scripts found: ${count}`, count),
            none: (moduleName) => _advUtilsFmt('advPanelNoScriptsFmt', `No ${moduleName} scripts found`, moduleName)
        },

        /**
         * Check version operation notifications
         */
        checkVersion: {
            success: (moduleName, version) => _advUtilsFmt('advPanelVersionDetectedFmt', `${moduleName} version detected: ${version}`, moduleName, version),
            none: (moduleName) => _advUtilsFmt('advPanelNoVersionFmt', `No ${moduleName} version detected`, moduleName)
        },

        /** An extract tool refused because Start Capturing is running on the tab */
        captureRunning: () => _advUtilsTr('advCommonStopCaptureFirst', 'A capture is running on this tab: stop it first, then try again')
    }
};

// Export to window
if (typeof window !== 'undefined') {
    window.AdvancedUtils = AdvancedUtils;
    Logger.debug('UI', '[AdvancedUtils] Loaded and exported to window.AdvancedUtils');

    // CSP-compliant global event delegation for copy-value elements
    document.addEventListener('click', (e) => {
        const copyEl = e.target.closest('.copy-value[data-copy]');
        if (copyEl) {
            e.stopPropagation();
            const value = copyEl.dataset.copy;
            const message = copyEl.dataset.copyMessage || _advUtilsTr('copiedNotification', 'Copied');
            AdvancedUtils.copyToClipboard(value, copyEl, { notificationMessage: message });
        }
    });
}
