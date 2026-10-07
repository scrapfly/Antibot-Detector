/**
 * Advanced Section Utilities
 * Shared utilities for Advanced UI modules
 *
 * This file provides common functionality for Advanced section modules
 * that run in the popup context (not service worker).
 *
 * NOTE: Many utility functions delegate to Utils.js to avoid duplication.
 */

Logger.debug('UI', '[AdvancedUtils] Loading...');

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
     * This is a UI-friendly wrapper around BaseInterceptorHelpers.loadHistory
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
     * Format bytes to human-readable size - delegates to Utils
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
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    const runtimeError = chrome.runtime.lastError;
                    if (runtimeError) {
                        reject(new Error(runtimeError.message));
                        return;
                    }
                    resolve(response);
                });
            } catch (error) {
                reject(error);
            }
        });
    },

    /**
     * Truncate string with ellipsis - delegates to Utils
     * @param {string} str - String to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated string
     */
    truncate(str, maxLength = 50) {
        if (!str || typeof str !== 'string') return '';
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength - 3) + '...';
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
     * Standardized notification messages for advanced modules
     * Provides consistent messaging across all advanced modules
     */
    notifications: {
        /**
         * Module loaded notification
         * @param {string} moduleName - Name of the module (e.g., "Shape Security")
         * @returns {string} Notification message
         */
        moduleLoaded: (moduleName) => _advUtilsFmt('advPanelToolsLoadedFmt', `${moduleName} tools loaded`, moduleName),

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
        }
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
