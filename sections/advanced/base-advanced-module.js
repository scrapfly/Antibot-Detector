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

Logger.ui('[BaseAdvancedModule] Loading...');

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
            Logger.error('UI', `[${this.moduleName}] Error checking capture state:`, error);
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
            Logger.ui(`[${this.moduleName}] Already capturing, calling stopCapturing()`);
            await this.stopCapturing();
            return;
        }

        try {
            // Hook: beforeCapture - allows validation and preparation
            const shouldProceed = await this.beforeCapture();
            if (shouldProceed === false) {
                Logger.ui(`[${this.moduleName}] Capture cancelled by beforeCapture hook`);
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
            Logger.error('UI', `[${this.moduleName}] Failed to start capturing:`, error);
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
            Logger.error('UI', `[${this.moduleName}] Failed to stop capturing:`, error);
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

        Logger.ui(`[${this.moduleName}] renderCaptureHistoryHTML - Total items: ${history.length}`);

        // Store filtered history for pagination
        this.currentCaptureHistory = history;

        let historyItems;
        if (history.length === 0) {
            historyItems = this.renderEmptyCaptureState();
        } else {
            // Show first 3 items (pagination will handle the rest)
            const itemsToRender = history.slice(0, 3);
            Logger.ui(`[${this.moduleName}] Rendering first ${itemsToRender.length} items of ${history.length} total`);
            historyItems = this.renderCaptureHistoryItems(itemsToRender);
        }

        return `
            <div class="capture-history-section">
                <div class="section-header">
                    <div class="header-left">
                        <div class="tool-icon-container tool-icon-purple" style="width: 32px; height: 32px; border-radius: 8px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                                <path d="M19,3H14.82C14.4,1.84 13.3,1 12,1C10.7,1 9.6,1.84 9.18,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M12,3A1,1 0 0,1 13,4A1,1 0 0,1 12,5A1,1 0 0,1 11,4A1,1 0 0,1 12,3Z"/>
                            </svg>
                        </div>
                        <h3>Captured Data</h3>
                    </div>
                    <div class="header-right">
                        <span class="history-count">${history.length} capture${history.length !== 1 ? 's' : ''}</span>
                        ${history.length > 0 ? `
                            <button class="clear-history-btn" id="clear${this.moduleName.charAt(0).toUpperCase() + this.moduleName.slice(1)}History" title="Clear all captured data">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                                </svg>
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
            <div class="empty-capture-state">
                <div class="empty-capture-card">
                    <div class="empty-capture-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                            <path d="M20 6H4C2.89 6 2 6.89 2 8V16C2 17.11 2.89 18 4 18H9V20H7V22H17V20H15V18H20C21.11 18 22 17.11 22 16V8C22 6.89 21.11 6 20 6M20 16H4V8H20V16Z"
                                  stroke="url(#emptyGradient)" stroke-width="1.5" fill="rgba(59,130,246,0.15)"/>
                            <defs>
                                <linearGradient id="emptyGradient" x1="4" y1="6" x2="20" y2="18" gradientUnits="userSpaceOnUse">
                                    <stop offset="0" stop-color="#3b82f6"/>
                                    <stop offset="1" stop-color="#60a5fa"/>
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                    <h4 class="empty-capture-title">No captures yet</h4>
                    <p class="empty-capture-text">Click "Start Capturing" above to begin capturing ${this.moduleName} data</p>
                </div>
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
        Logger.ui(`[${this.moduleName}] setupCaptureHistoryListeners - Items: ${this.currentCaptureHistory?.length || 0}`);

        // Clear history button
        const clearBtnId = `clear${this.moduleName.charAt(0).toUpperCase() + this.moduleName.slice(1)}History`;
        const clearBtn = document.querySelector(`#${clearBtnId}`);
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearCaptureHistory());
        }

        // Setup pagination if we have history items
        if (this.currentCaptureHistory && this.currentCaptureHistory.length > 3) {
            Logger.ui(`[${this.moduleName}] Setting up pagination for ${this.currentCaptureHistory.length} items`);
            this.setupCaptureHistoryPagination();
            return; // Pagination will handle expand listeners
        }

        // Otherwise setup expand listeners directly
        Logger.ui(`[${this.moduleName}] No pagination needed, setting up expand listeners directly`);
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
            Logger.warn('UI', `[${this.moduleName}] Cannot setup pagination - no history items`);
            return;
        }

        const paginationId = `${this.moduleName}HistoryPagination`;
        const paginationDiv = document.querySelector(`#${paginationId}`);

        if (!paginationDiv) {
            Logger.error('UI', `[${this.moduleName}] Pagination div #${paginationId} not found in DOM!`);
            return;
        }

        Logger.ui(`[${this.moduleName}] Creating PaginationManager for #${paginationId} with ${this.currentCaptureHistory.length} items`);

        this.captureHistoryPagination = new PaginationManager(paginationId, {
            itemsPerPage: 3,
            onPageChange: (page, items) => {
                Logger.ui(`[${this.moduleName}] Page changed to ${page}, showing ${items.length} items`);
                this.renderCaptureHistoryPage(items);
            }
        });

        this.captureHistoryPagination.setItems(this.currentCaptureHistory);
        Logger.ui(`[${this.moduleName}] Pagination setup complete`);
    }

    /**
     * Render a page of capture history items
     * @param {Array} items - Items for current page
     */
    renderCaptureHistoryPage(items) {
        const listContainer = document.querySelector(`#${this.moduleName}HistoryList`);
        if (!listContainer) {
            Logger.warn('UI', `[${this.moduleName}] History list container not found`);
            return;
        }

        listContainer.innerHTML = this.renderCaptureHistoryItems(items);

        // Re-setup event listeners for the new page
        this.setupExpandListeners();
    }

    /**
     * Render capture details content for modal
     * Override in child classes for module-specific content
     * IMPORTANT: Child classes must properly escape user data to prevent XSS
     * @param {object} capture - Capture data object
     * @returns {string} HTML for modal body content
     */
    renderCaptureDetailsContent(capture) {
        // Default implementation - shows basic capture info
        const url = (capture.url || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const timestamp = new Date(capture.timestamp).toLocaleString();

        return `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">URL</label>
                <div class="advanced-modal-code-block">${url}</div>
            </div>
            <div class="advanced-modal-section">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Captured</span>
                    <span class="advanced-modal-info-value">${timestamp}</span>
                </div>
            </div>
        `;
    }

    /**
     * Display capture details in a modal
     * @param {string} captureId - Capture ID
     * @param {string} detailsContent - HTML content for modal body (must be pre-sanitized)
     */
    displayCaptureDetailsModal(captureId, detailsContent) {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'advanced-modal-overlay';
        overlay.style.opacity = '0';

        // Create container
        const container = document.createElement('div');
        container.className = 'advanced-modal-container';

        // Create header
        const header = document.createElement('div');
        header.className = 'advanced-modal-header';

        const title = document.createElement('h3');
        title.className = 'advanced-modal-title';
        title.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19,3H14.82C14.4,1.84 13.3,1 12,1C10.7,1 9.6,1.84 9.18,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M12,3A1,1 0 0,1 13,4A1,1 0 0,1 12,5A1,1 0 0,1 11,4A1,1 0 0,1 12,3Z"/>
            </svg>
            Capture Details
        `;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'advanced-modal-close-btn';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => overlay.remove();

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Create body
        const body = document.createElement('div');
        body.className = 'advanced-modal-body';
        body.innerHTML = detailsContent; // Pre-sanitized by renderCaptureDetailsContent()

        // Assemble modal
        container.appendChild(header);
        container.appendChild(body);
        overlay.appendChild(container);

        // Handle click-to-copy for code blocks and stop propagation for container clicks
        container.addEventListener('click', (e) => {
            // Handle click-to-copy for code blocks
            const codeBlock = e.target.closest('.advanced-modal-code-block');
            if (codeBlock && codeBlock.dataset.copy) {
                e.stopPropagation();
                const valueToCopy = codeBlock.dataset.copy;
                AdvancedUtils.copyToClipboard(valueToCopy, codeBlock, {
                    notificationMessage: 'Value copied'
                });
                return;
            }

            // Stop propagation for all container clicks (prevents overlay background close)
            e.stopPropagation();
        });

        // Close modal when clicking overlay background
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        // Add to document
        document.body.appendChild(overlay);

        // Trigger fade-in animation
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        });
    }

    /**
     * Toggle capture details display - now shows modal instead of inline expansion
     * @param {string} captureId - Capture ID
     */
    async toggleCaptureDetails(captureId) {
        // Load full capture data
        const history = await this.loadCaptureHistory();
        const capture = history.find(item => (item.id || item.timestamp.toString()) === captureId);
        if (!capture) return;

        // Render modal content (child classes can override renderCaptureDetailsContent)
        let modalContent = this.renderCaptureDetailsContent(capture);

        // Add "Copy All Data" button
        modalContent += `
            <div class="advanced-modal-section" style="margin-top: 16px;">
                <button class="advanced-modal-btn-primary" id="copyAllCaptureData" style="width: 100%;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
                    </svg>
                    Copy All Data
                </button>
            </div>
        `;

        // Display modal
        this.displayCaptureDetailsModal(captureId, modalContent);

        // Setup copy button listener
        setTimeout(() => {
            const copyBtn = document.querySelector('#copyAllCaptureData');
            if (copyBtn) {
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const payload = JSON.stringify(capture.captureData, null, 2);
                    AdvancedUtils.copyToClipboard(payload, copyBtn, {
                        notificationMessage: 'Capture data copied'
                    });
                });
            }
        }, 100);
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
            let history = result.scrapfly_advanced_history || {};

            // Handle legacy string format
            if (typeof history === 'string') {
                history = JSON.parse(history);
            }

            // MIGRATION: Convert old { items: [] } format if needed
            if (history.items && Array.isArray(history.items)) {
                Logger.ui(`[${this.moduleName}] Migrating old storage format during clear`);
                const migratedHistory = {};

                // Group items by type, excluding current module
                for (const item of history.items) {
                    if (!item.type || item.type === this.moduleName) continue;

                    const moduleId = item.type;
                    if (!migratedHistory[moduleId]) {
                        migratedHistory[moduleId] = [];
                    }

                    migratedHistory[moduleId].push({
                        id: item.id || `${moduleId}_${item.timestamp}`,
                        timestamp: item.timestamp,
                        url: item.url,
                        data: item.captureData || item.data,
                        expiresAt: item.expiresAt
                    });
                }

                history = migratedHistory;
            } else {
                // NEW format: just delete this module's array
                delete history[this.moduleName];
            }

            await chrome.storage.local.set({
                scrapfly_advanced_history: history
            });

            await this.renderCapturedDataSection();
            NotificationHelper.success(`${this.moduleName} capture history cleared`);
        } catch (error) {
            Logger.error('UI', `[${this.moduleName}] Failed to clear history:`, error);
            NotificationHelper.error('Failed to clear history');
        }
    }

    /**
     * Re-render just the capture history section
     */
    async renderCapturedDataSection() {
        const advancedContent = document.querySelector('#detectionToolsPanel');
        if (!advancedContent) {
            Logger.warn('UI', `[${this.moduleName}] #detectionToolsPanel not found`);
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
    Logger.ui('[BaseAdvancedModule] ✓ Loaded and exported to window.BaseAdvancedModule');
}
