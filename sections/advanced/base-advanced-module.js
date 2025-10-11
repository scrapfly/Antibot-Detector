/**
 * BaseAdvancedModule
 * Base class for Advanced Section detector modules
 *
 * Provides common functionality for:
 * - Capture history management
 * - Event listeners
 * - Message handling
 * - UI rendering
 *
 * Child classes should override:
 * - renderTools() - Render module-specific tools UI
 * - setupToolListeners() - Setup tool event listeners
 * - renderCaptureHistoryItems() - Optional: custom history item rendering
 */

console.log('[BaseAdvancedModule] Loading...');

class BaseAdvancedModule {
    /**
     * Constructor
     * @param {object} detection - Detection result for current page
     * @param {object} tabInfo - Tab information
     * @param {string} moduleName - Module name (e.g., 'akamai', 'recaptcha')
     */
    constructor(detection, tabInfo, moduleName) {
        if (!moduleName) {
            throw new Error('BaseAdvancedModule requires moduleName parameter');
        }

        this.detection = detection;
        this.tabInfo = tabInfo;
        this.moduleName = moduleName;
        this.captureHistoryPagination = null;
        this.currentCaptureHistory = [];
        this.isCapturing = false;
    }

    // ========================================================================
    // ABSTRACT METHODS (Must override in child class)
    // ========================================================================

    /**
     * Render module-specific tools UI
     * @returns {string} HTML for tools section
     */
    renderTools() {
        throw new Error(`${this.moduleName}: renderTools() must be implemented`);
    }

    /**
     * Setup module-specific tool event listeners
     * Called after tools are rendered
     */
    setupToolListeners() {
        throw new Error(`${this.moduleName}: setupToolListeners() must be implemented`);
    }

    // ========================================================================
    // MESSAGING
    // ========================================================================

    /**
     * Send message to background script
     * Delegates to AdvancedUtils.sendMessage()
     * @param {object} message - Message object
     * @returns {Promise<object>} Response from background
     */
    async sendMessage(message) {
        return AdvancedUtils.sendMessage(message);
    }

    // ========================================================================
    // CAPTURE STATE MANAGEMENT
    // ========================================================================

    /**
     * Check current capture state
     * @returns {Promise<object>} Capture state
     */
    async checkCaptureState() {
        try {
            const messageType = `${this.moduleName.toUpperCase()}_GET_CAPTURE_STATE`;
            const response = await this.sendMessage({
                type: messageType,
                tabId: this.tabInfo.id
            });

            if (response && response.isCapturing) {
                this.isCapturing = true;
                this.updateCaptureButtonState(true);
            }

            return response;
        } catch (error) {
            console.error(`[${this.moduleName}] Error checking capture state:`, error);
            return { isCapturing: false };
        }
    }

    // ========================================================================
    // CAPTURE HOOKS (Override in child classes for custom behavior)
    // ========================================================================

    /**
     * Hook: Called before starting capture
     * Override to add validation, cookie management, etc.
     * @returns {Promise<boolean>} Return false to cancel capture start
     */
    async beforeCapture() {
        // Default: no pre-capture logic, always proceed
        return true;
    }

    /**
     * Hook: Get notification configuration for capture start
     * Override to customize the notification shown when capture starts
     * @returns {object|null} Notification config { type, message } or null for custom handling
     */
    getStartNotification() {
        // Default: simple notification
        return {
            type: 'info',
            message: `${this.moduleName} capture started. Reload the page to trigger capture.`
        };
    }

    /**
     * Hook: Called after capture successfully started
     * Override to show custom notifications, UI updates, etc.
     * @param {object} response - Response from START_CAPTURE message
     * @returns {Promise<void>}
     */
    async afterCaptureStart(response) {
        // Default: show notification if config provided
        const notifConfig = this.getStartNotification();
        if (notifConfig) {
            NotificationHelper.info(notifConfig.message);
        }
    }

    /**
     * Start capturing (toggles between start/stop)
     * Uses hooks for customization: beforeCapture(), getStartNotification(), afterCaptureStart()
     */
    async startCapturing() {
        // If already capturing, stop instead
        if (this.isCapturing) {
            console.log(`[${this.moduleName}] Already capturing, calling stopCapturing()`);
            await this.stopCapturing();
            return;
        }

        try {
            // Hook: beforeCapture - allows validation and preparation
            const shouldProceed = await this.beforeCapture();
            if (shouldProceed === false) {
                console.log(`[${this.moduleName}] Capture cancelled by beforeCapture hook`);
                return;
            }

            // Send START_CAPTURE message to background
            const messageType = `${this.moduleName.toUpperCase()}_START_CAPTURE`;
            const response = await this.sendMessage({
                type: messageType,
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && (response.status === 'started' || response.status === 'already_capturing')) {
                this.isCapturing = true;
                this.updateCaptureButtonState(true);

                // Hook: afterCaptureStart - allows custom notifications and UI updates
                await this.afterCaptureStart(response);
            } else if (response && response.status === 'error') {
                NotificationHelper.error(`Failed to start capture: ${response.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error(`[${this.moduleName}] Failed to start capturing:`, error);
            NotificationHelper.error('Failed to start capture: ' + error.message);
        }
    }

    /**
     * Stop capturing
     */
    async stopCapturing() {
        try {
            const messageType = `${this.moduleName.toUpperCase()}_STOP_CAPTURE`;
            const response = await this.sendMessage({
                type: messageType,
                tabId: this.tabInfo.id
            });

            this.isCapturing = false;
            this.updateCaptureButtonState(false);

            // Reload capture history after stopping
            await this.renderCapturedDataSection();

        } catch (error) {
            console.error(`[${this.moduleName}] Failed to stop capturing:`, error);
            NotificationHelper.error('Failed to stop capture: ' + error.message);
        }
    }

    /**
     * Update capture button state
     * @param {boolean} isCapturing - Whether currently capturing
     */
    updateCaptureButtonState(isCapturing) {
        const btn = document.querySelector(`#${this.moduleName}StartCapture`);
        if (!btn) return;

        const label = btn.querySelector('.tool-btn-label');
        if (isCapturing) {
            btn.classList.add('capturing');
            if (label) label.textContent = 'Stop Capturing';
        } else {
            btn.classList.remove('capturing');
            if (label) label.textContent = 'Start Capturing';
        }
    }

    // ========================================================================
    // CAPTURE HISTORY
    // ========================================================================

    /**
     * Load capture history from storage
     * Delegates to AdvancedUtils.loadCaptureHistory()
     * @param {string} hostname - Optional hostname filter
     * @returns {Promise<Array>} Array of capture history items
     */
    async loadCaptureHistory(hostname = null) {
        const filterHostname = hostname || (this.tabInfo ? new URL(this.tabInfo.url).hostname : null);
        return AdvancedUtils.loadCaptureHistory(this.moduleName, filterHostname);
    }

    /**
     * Render capture history HTML
     * @returns {Promise<string>} HTML for capture history section
     */
    async renderCaptureHistoryHTML() {
        if (!this.tabInfo || !this.tabInfo.url) {
            return '';
        }

        const currentHostname = new URL(this.tabInfo.url).hostname;
        const history = await this.loadCaptureHistory(currentHostname);

        console.log(`[${this.moduleName}] renderCaptureHistoryHTML - Total items: ${history.length}`);

        // Store filtered history for pagination
        this.currentCaptureHistory = history;

        let historyItems;
        if (history.length === 0) {
            historyItems = this.renderEmptyCaptureState();
        } else {
            // Show first 3 items (pagination will handle the rest)
            const itemsToRender = history.slice(0, 3);
            console.log(`[${this.moduleName}] Rendering first ${itemsToRender.length} items of ${history.length} total`);
            historyItems = this.renderCaptureHistoryItems(itemsToRender);
        }

        return `
            <div class="capture-history-section">
                <div class="section-header">
                    <div class="header-left">
                        <span class="header-icon">📜</span>
                        <h3>Captured Data</h3>
                    </div>
                    <div class="header-right">
                        <span class="history-count">${history.length} capture${history.length !== 1 ? 's' : ''}</span>
                        ${history.length > 0 ? `
                            <button class="clear-history-btn" id="clear${this.moduleName.charAt(0).toUpperCase() + this.moduleName.slice(1)}History" title="Clear all captured data">
                                <span>🗑️</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="history-list" id="${this.moduleName}HistoryList">
                    ${historyItems}
                </div>
                ${history.length > 3 ? `
                    <div id="${this.moduleName}HistoryPagination" class="pagination">
                        <div class="pagination-info">Showing 1-3 of ${history.length}</div>
                        <div class="pagination-controls">
                            <button class="pagination-btn pagination-btn-prev" disabled>
                                <svg width="16" height="16" viewBox="0 0 24 24">
                                    <path d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12Z" fill="currentColor"/>
                                </svg>
                            </button>
                            <div class="page-numbers"></div>
                            <button class="pagination-btn pagination-btn-next">
                                <svg width="16" height="16" viewBox="0 0 24 24">
                                    <path d="M10 6L8.59 7.41L13.17 12L8.59 16.59L10 18L16 12Z" fill="currentColor"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render empty capture state
     * Can be overridden by child classes for custom empty states
     * @returns {string} HTML for empty state
     */
    renderEmptyCaptureState() {
        return `
            <div class="empty-capture-state" style="padding: 32px 16px; text-align: center; opacity: 0.7;">
                <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
                <div style="font-size: 14px; font-weight: 500; margin-bottom: 8px;">No captures yet</div>
                <div style="font-size: 12px; opacity: 0.8;">Click "Start Capturing" above to capture ${this.moduleName} data</div>
            </div>
        `;
    }

    /**
     * Render capture history items
     * Should be overridden by child classes for module-specific rendering
     * @param {Array} items - Array of capture history items to render
     * @returns {string} HTML for history items
     */
    renderCaptureHistoryItems(items) {
        // Default simple rendering - override in child classes
        return items.map((item) => {
            const { hostname, timestamp, id } = item;
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}`;

            return `
                <div class="capture-card" data-capture-id="${id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${hostname}" data-hide-on-error="true">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${hostname}</span>
                                <span class="capture-time">${timeAgo}</span>
                            </div>
                        </div>
                        <button class="capture-expand" data-capture-id="${id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Setup capture history event listeners
     */
    setupCaptureHistoryListeners() {
        console.log(`[${this.moduleName}] setupCaptureHistoryListeners - Items: ${this.currentCaptureHistory?.length || 0}`);

        // Clear history button
        const clearBtnId = `clear${this.moduleName.charAt(0).toUpperCase() + this.moduleName.slice(1)}History`;
        const clearBtn = document.querySelector(`#${clearBtnId}`);
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearCaptureHistory());
        }

        // Setup pagination if we have history items
        if (this.currentCaptureHistory && this.currentCaptureHistory.length > 3) {
            console.log(`[${this.moduleName}] Setting up pagination for ${this.currentCaptureHistory.length} items`);
            this.setupCaptureHistoryPagination();
            return; // Pagination will handle expand listeners
        }

        // Otherwise setup expand listeners directly
        console.log(`[${this.moduleName}] No pagination needed, setting up expand listeners directly`);
        this.setupExpandListeners();
    }

    /**
     * Setup expand button listeners for capture cards
     */
    setupExpandListeners() {
        // Add error handlers for favicons (CSP-compliant)
        document.querySelectorAll('.capture-favicon[data-hide-on-error]').forEach(img => {
            img.addEventListener('error', function() {
                this.style.display = 'none';
            });
        });

        const expandBtns = document.querySelectorAll('.capture-expand');
        expandBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const captureId = btn.getAttribute('data-capture-id');
                this.toggleCaptureDetails(captureId);
            });
        });

        const captureCards = document.querySelectorAll('.capture-card');
        captureCards.forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.capture-expand')) {
                    const captureId = card.getAttribute('data-capture-id');
                    this.toggleCaptureDetails(captureId);
                }
            });
        });
    }

    /**
     * Setup pagination for capture history
     */
    setupCaptureHistoryPagination() {
        if (!this.currentCaptureHistory || this.currentCaptureHistory.length === 0) {
            console.warn(`[${this.moduleName}] Cannot setup pagination - no history items`);
            return;
        }

        const paginationId = `${this.moduleName}HistoryPagination`;
        const paginationDiv = document.querySelector(`#${paginationId}`);

        if (!paginationDiv) {
            console.error(`[${this.moduleName}] Pagination div #${paginationId} not found in DOM!`);
            return;
        }

        console.log(`[${this.moduleName}] Creating PaginationManager for #${paginationId} with ${this.currentCaptureHistory.length} items`);

        this.captureHistoryPagination = new PaginationManager(paginationId, {
            itemsPerPage: 3,
            onPageChange: (page, items) => {
                console.log(`[${this.moduleName}] Page changed to ${page}, showing ${items.length} items`);
                this.renderCaptureHistoryPage(items);
            }
        });

        this.captureHistoryPagination.setItems(this.currentCaptureHistory);
        console.log(`[${this.moduleName}] Pagination setup complete`);
    }

    /**
     * Render a page of capture history items
     * @param {Array} items - Items for current page
     */
    renderCaptureHistoryPage(items) {
        const listContainer = document.querySelector(`#${this.moduleName}HistoryList`);
        if (!listContainer) {
            console.warn(`[${this.moduleName}] History list container not found`);
            return;
        }

        listContainer.innerHTML = this.renderCaptureHistoryItems(items);

        // Re-setup event listeners for the new page
        this.setupExpandListeners();
    }

    /**
     * Toggle capture details display
     * Can be overridden for module-specific detail rendering
     * @param {string} captureId - Capture ID
     */
    async toggleCaptureDetails(captureId) {
        const captureCard = document.querySelector(`.capture-card[data-capture-id="${captureId}"]`);
        if (!captureCard) return;

        const existingDetails = captureCard.querySelector('.history-item-details');
        if (existingDetails) {
            existingDetails.remove();
            captureCard.classList.remove('expanded');
            return;
        }

        // Load full capture data
        const history = await this.loadCaptureHistory();
        const capture = history.find(item => (item.id || item.timestamp.toString()) === captureId);
        if (!capture) return;

        // Default detail rendering - override for module-specific details
        const detailsHtml = `
            <div class="history-item-details">
                <div class="details-grid">
                    <div class="detail-row">
                        <span class="detail-label">URL:</span>
                        <span class="detail-value">${capture.url}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Captured:</span>
                        <span class="detail-value">${new Date(capture.timestamp).toLocaleString()}</span>
                    </div>
                </div>
                <div class="details-actions">
                    <button class="detail-action-btn copy-all-btn" data-capture-id="${captureId}">
                        📄 Copy All Data
                    </button>
                </div>
            </div>
        `;

        captureCard.insertAdjacentHTML('beforeend', detailsHtml);
        captureCard.classList.add('expanded');

        // Setup copy button
        const copyAllBtn = captureCard.querySelector('.copy-all-btn');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(JSON.stringify(capture.captureData, null, 2));
                    copyAllBtn.textContent = '✅ Copied!';
                    setTimeout(() => {
                        copyAllBtn.textContent = '📄 Copy All Data';
                    }, 2000);
                } catch (error) {
                    console.error('Failed to copy:', error);
                }
            });
        }
    }

    /**
     * Show confirmation modal
     * Delegates to AdvancedUtils.showConfirmationModal()
     * @returns {Promise<boolean>} True if confirmed, false if cancelled
     */
    showConfirmationModal(title, message, confirmText = 'Delete', cancelText = 'Cancel') {
        return AdvancedUtils.showConfirmationModal({
            title,
            message,
            confirmText,
            cancelText,
            confirmClass: 'danger'
        });
    }

    /**
     * Clear all capture history
     */
    async clearCaptureHistory() {
        const confirmed = await this.showConfirmationModal(
            'Clear All Captured Data?',
            'This will permanently delete all captured data for this module. This action cannot be undone.',
            'Clear Data',
            'Cancel'
        );

        if (!confirmed) {
            return;
        }

        try {
            const result = await chrome.storage.local.get(['scrapfly_advanced_history']);
            let history = result.scrapfly_advanced_history || { items: [] };

            // Handle legacy string format
            if (typeof history === 'string') {
                history = JSON.parse(history);
            }

            // Remove only this module's captures
            const items = (history.items || []).filter(item => item.type !== this.moduleName);
            await chrome.storage.local.set({
                scrapfly_advanced_history: { items: items, lastUpdated: Date.now() }
            });

            await this.renderCapturedDataSection();
            NotificationHelper.success(`${this.moduleName} capture history cleared`);
        } catch (error) {
            console.error(`[${this.moduleName}] Failed to clear history:`, error);
            NotificationHelper.error('Failed to clear history');
        }
    }

    /**
     * Re-render just the capture history section
     */
    async renderCapturedDataSection() {
        const advancedContent = document.querySelector('#detectionToolsPanel');
        if (!advancedContent) {
            console.warn(`[${this.moduleName}] #detectionToolsPanel not found`);
            return;
        }

        const existingHistory = advancedContent.querySelector('.capture-history-section');
        const captureHistoryHtml = await this.renderCaptureHistoryHTML();

        if (existingHistory) {
            if (captureHistoryHtml) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = captureHistoryHtml;
                const newSection = tempDiv.firstElementChild;
                existingHistory.replaceWith(newSection);
                this.setupCaptureHistoryListeners();
            } else {
                existingHistory.remove();
            }
        } else {
            if (captureHistoryHtml) {
                advancedContent.insertAdjacentHTML('beforeend', captureHistoryHtml);
                this.setupCaptureHistoryListeners();
            }
        }
    }

    // ========================================================================
    // EVENT LISTENERS
    // ========================================================================

    /**
     * Setup all event listeners
     * Calls setupToolListeners() which should be overridden by child class
     */
    setupEventListeners() {
        // Check capture state on init
        this.checkCaptureState();

        // Setup module-specific tool listeners
        this.setupToolListeners();

        // Setup capture history listeners
        this.setupCaptureHistoryListeners();
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Get relative time string
     * Delegates to AdvancedUtils.getTimeAgo()
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {string} Relative time string (e.g., "5m ago")
     */
    getTimeAgo(timestamp) {
        return AdvancedUtils.getTimeAgo(timestamp);
    }

    /**
     * Get time until expiration
     * Delegates to AdvancedUtils.getTimeUntil()
     * @param {number} expiresAt - Expiration timestamp in milliseconds
     * @returns {string} Time until expiration (e.g., "5m")
     */
    getTimeUntil(expiresAt) {
        return AdvancedUtils.getTimeUntil(expiresAt);
    }
}

// Export for use in popup
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BaseAdvancedModule;
} else if (typeof window !== 'undefined') {
    window.BaseAdvancedModule = BaseAdvancedModule;
    console.log('[BaseAdvancedModule] ✓ Loaded and exported to window.BaseAdvancedModule');
}
