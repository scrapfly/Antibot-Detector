/**
 * Advanced Section Utilities
 * Shared utilities for Advanced UI modules
 *
 * This file provides common functionality for Advanced section modules
 * that run in the popup context (not service worker).
 *
 * NOTE: Many utility functions delegate to Utils.js to avoid duplication.
 */

Logger.ui('[AdvancedUtils] Loading...');

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
     * Get time until expiration - delegates to Utils
     * @param {number} expiresAt - Expiration timestamp in milliseconds
     * @returns {string} Time until expiration (e.g., "5m")
     */
    getTimeUntil(expiresAt) {
        return FormatUtils.getTimeUntil(expiresAt);
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
            const result = await chrome.storage.local.get(['scrapfly_advanced_history']);
            let history = result.scrapfly_advanced_history || { items: [] };

            // Handle legacy string format
            if (typeof history === 'string') {
                history = JSON.parse(history);
            }
            if (!history.items) {
                return [];
            }

            // Filter by type and expiry
            const now = Date.now();
            let items = history.items.filter(item => {
                const typeMatch = item.type === type;
                const notExpired = !item.expiresAt || item.expiresAt > now;
                const hostnameMatch = !hostname || item.hostname === hostname;
                return typeMatch && notExpired && hostnameMatch;
            });

            return items;

        } catch (error) {
            Logger.error('UI', `[AdvancedUtils] Failed to load capture history for ${type}:`, error);
            return [];
        }
    },

    /**
     * Clean expired items from capture history
     * @param {string} type - Optional module type to clean (if not provided, cleans all)
     * @returns {Promise<number>} Number of items removed
     */
    async cleanExpiredHistory(type = null) {
        try {
            const result = await chrome.storage.local.get(['scrapfly_advanced_history']);
            let history = result.scrapfly_advanced_history || { items: [] };

            // Handle legacy string format
            if (typeof history === 'string') {
                history = JSON.parse(history);
            }

            const originalCount = history.items?.length || 0;
            const now = Date.now();

            // Filter out expired items
            history.items = (history.items || []).filter(item => {
                const notExpired = !item.expiresAt || item.expiresAt > now;
                const typeMatch = !type || item.type === type;
                return notExpired || !typeMatch;
            });

            const removedCount = originalCount - history.items.length;

            if (removedCount > 0) {
                history.lastUpdated = Date.now();
                await chrome.storage.local.set({
                    scrapfly_advanced_history: history
                });
                Logger.ui(`[AdvancedUtils] Removed ${removedCount} expired items`);
            }

            return removedCount;

        } catch (error) {
            Logger.error('UI', '[AdvancedUtils] Failed to clean expired history:', error);
            return 0;
        }
    },

    /**
     * Show confirmation modal
     * @param {object} options - Modal options
     * @returns {Promise<boolean>} True if confirmed, false if cancelled
     */
    showConfirmationModal(options = {}) {
        const {
            title = 'Confirm Action',
            message = 'Are you sure?',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            confirmClass = 'danger' // 'danger', 'primary', 'success'
        } = options;

        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'tool-modal confirmation-modal';
            modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10002; opacity: 0; transition: opacity 0.2s;';

            const gradients = {
                danger: 'linear-gradient(135deg, #EF5350 0%, #E53935 100%)',
                primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                success: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
            };

            const icons = {
                danger: '',
                primary: '',
                success: '✓'
            };

            const gradient = gradients[confirmClass] || gradients.primary;
            const icon = icons[confirmClass] || icons.primary;

            modal.innerHTML = `
                <div class="modal-content" style="background: var(--bg-secondary); border-radius: 12px; padding: 0; max-width: 440px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.5); overflow: hidden; border: 1px solid var(--border);">
                    <div style="padding: 28px 28px 24px 28px;">
                        <div style="display: flex; align-items: flex-start; gap: 18px; margin-bottom: 24px;">
                            <div style="width: 52px; height: 52px; border-radius: 50%; background: ${gradient}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 16px rgba(0,0,0,0.2);">
                                <span style="font-size: 26px; line-height: 1;">${icon}</span>
                            </div>
                            <div style="flex: 1; padding-top: 2px;">
                                <h3 style="margin: 0 0 10px 0; font-size: 19px; color: var(--text-primary); font-weight: 600; letter-spacing: -0.3px;">${title}</h3>
                                <p style="margin: 0; font-size: 14px; color: var(--text-secondary); line-height: 1.6;">${message}</p>
                            </div>
                        </div>
                    </div>

                    <div style="background: var(--bg-primary); padding: 20px; display: flex; flex-direction: row; gap: 12px; border-top: 1px solid var(--border);">
                        <button class="modal-cancel" style="padding: 12px 24px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; flex: 1;">
                            ${cancelText}
                        </button>
                        <button class="modal-confirm modal-confirm-${confirmClass}" style="padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; flex: 1;">
                            ${confirmText}
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Fade in
            setTimeout(() => modal.style.opacity = '1', 10);

            // Event handlers
            const confirmBtn = modal.querySelector('.modal-confirm');
            const cancelBtn = modal.querySelector('.modal-cancel');

            // Set confirm button background and text colors based on type
            const confirmBgColors = {
                danger: 'rgba(239, 68, 68, 0.2)',    // Transparent red matching .clear-btn
                primary: '#2563EB',                   // Blue matching "Import" button
                success: '#10B981'                    // Green for success actions
            };
            const confirmBgColorHover = {
                danger: 'rgba(239, 68, 68, 0.32)',    // More opaque red on hover
                primary: '#1D4ED8',                   // Darker blue on hover
                success: '#059669'                    // Darker green on hover
            };
            const confirmTextColors = {
                danger: '#fca5a5',     // Light red text for danger
                primary: '#ffffff',    // White text for primary
                success: '#ffffff'     // White text for success
            };
            const confirmTextColorHover = {
                danger: '#fecaca',     // Lighter red text on hover
                primary: '#ffffff',    // White text for primary
                success: '#ffffff'     // White text for success
            };

            // Apply initial styles
            confirmBtn.style.background = confirmBgColors[confirmClass] || confirmBgColors.primary;
            confirmBtn.style.color = confirmTextColors[confirmClass] || confirmTextColors.primary;

            // Hover effects
            confirmBtn.addEventListener('mouseenter', () => {
                confirmBtn.style.background = confirmBgColorHover[confirmClass] || confirmBgColorHover.primary;
                confirmBtn.style.color = confirmTextColorHover[confirmClass] || confirmTextColorHover.primary;
                confirmBtn.style.transform = 'translateY(-1px)';
            });
            confirmBtn.addEventListener('mouseleave', () => {
                confirmBtn.style.background = confirmBgColors[confirmClass] || confirmBgColors.primary;
                confirmBtn.style.color = confirmTextColors[confirmClass] || confirmTextColors.primary;
                confirmBtn.style.transform = 'translateY(0)';
            });

            cancelBtn.addEventListener('mouseenter', () => {
                cancelBtn.style.background = 'var(--bg-primary)';
            });
            cancelBtn.addEventListener('mouseleave', () => {
                cancelBtn.style.background = 'var(--bg-tertiary)';
            });

            // Click handlers
            const cleanup = (result) => {
                modal.style.opacity = '0';
                setTimeout(() => modal.remove(), 200);
                resolve(result);
            };

            confirmBtn.addEventListener('click', () => cleanup(true));
            cancelBtn.addEventListener('click', () => cleanup(false));
            modal.addEventListener('click', (e) => {
                if (e.target === modal) cleanup(false);
            });

            // Keyboard support
            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    cleanup(false);
                    document.removeEventListener('keydown', handleKeydown);
                } else if (e.key === 'Enter') {
                    cleanup(true);
                    document.removeEventListener('keydown', handleKeydown);
                }
            };
            document.addEventListener('keydown', handleKeydown);
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
            notificationMessage: options.notificationMessage || 'Copied to clipboard',
            inlineMessage: options.inlineMessage || '✓ Copied!',
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
     * Show capture start notification with Scrapfly logo
     * @param {string} moduleName - Name of the module (e.g., 'reCAPTCHA', 'Akamai')
     * @returns {Promise<void>}
     */
    async showCaptureStartNotification(moduleName) {
        const logoUrl = chrome.runtime.getURL('icons/icon128.png');
        const message = `${moduleName} capture started. Reload the page to trigger capture.`;

        // Show notification with logo
        NotificationHelper.info(message);

        // Optionally show in-page notification with logo for better UX
        // This creates a branded notification experience
    },

    /**
     * Get favicon URL for a hostname - delegates to Utils
     * @param {string} hostname - Hostname
     * @returns {string} Favicon URL
     */
    getFaviconUrl(hostname) {
        return UrlUtils.getFaviconUrl(hostname);
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
     * Format timestamp to locale string - delegates to Utils
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @param {object} options - Intl.DateTimeFormat options
     * @returns {string} Formatted date string
     */
    formatTimestamp(timestamp, options = {}) {
        return FormatUtils.formatTimestamp(timestamp, options);
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
        moduleLoaded: (moduleName) => `✓ Loaded ${moduleName} tools`,

        /**
         * Check cookies operation notifications
         */
        checkCookies: {
            start: (moduleName) => `Checking ${moduleName} cookies...`,
            success: (count, total) => `✓ Found ${count}/${total} cookies`,
            none: (moduleName) => `No ${moduleName} cookies found`
        },

        /**
         * Analyze/Extract scripts operation notifications
         */
        analyzeScripts: {
            start: (moduleName) => `Analyzing ${moduleName} scripts... Page will reload`,
            success: (count) => `✓ Found ${count} script${count !== 1 ? 's' : ''}`,
            none: (moduleName) => `No ${moduleName} scripts found`
        },

        /**
         * Start/Stop capturing operation notifications
         */
        capturing: {
            start: (moduleName) => `Started capturing ${moduleName} data`,
            stop: (moduleName) => `Stopped capturing ${moduleName} data`,
            alreadyActive: () => `Capturing already active`
        },

        /**
         * Check version operation notifications
         */
        checkVersion: {
            success: (moduleName, version) => `✓ Detected ${moduleName} version: ${version}`,
            none: (moduleName) => `No ${moduleName} version detected`
        }
    }
};

// Export to window
if (typeof window !== 'undefined') {
    window.AdvancedUtils = AdvancedUtils;
    Logger.ui('[AdvancedUtils] Loaded and exported to window.AdvancedUtils');

    // CSP-compliant global event delegation for copy-value elements
    document.addEventListener('click', (e) => {
        const copyEl = e.target.closest('.copy-value[data-copy]');
        if (copyEl) {
            e.stopPropagation();
            const value = copyEl.dataset.copy;
            const message = copyEl.dataset.copyMessage || 'Copied';
            AdvancedUtils.copyToClipboard(value, copyEl, { notificationMessage: message });
        }
    });
}
