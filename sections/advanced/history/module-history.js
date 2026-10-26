/** Shared Advanced ModuleHistory capability. */
(function () {
class AdvancedModuleHistory {
    async loadCaptureHistory(hostname = null) {
        const filterHostname = hostname || (this.tabInfo ? new URL(this.tabInfo.url).hostname : null);
        return AdvancedUtils.loadCaptureHistory(this.moduleName, filterHostname);
    }

    async renderCaptureHistoryHTML() {
        if (!this.tabInfo || !this.tabInfo.url) {
            return '';
        }

        const currentHostname = new URL(this.tabInfo.url).hostname;
        const history = await this.loadCaptureHistory(currentHostname);

        Logger.debug('UI', `[${this.moduleName}] renderCaptureHistoryHTML - Total items: ${history.length}`);

        // Store filtered history for pagination
        this.currentCaptureHistory = history;

        let historyItems;
        if (history.length === 0) {
            historyItems = this.renderEmptyCaptureState();
        } else {
            // Show first 3 items (pagination will handle the rest)
            const itemsToRender = history.slice(0, 3);
            Logger.debug('UI', `[${this.moduleName}] Rendering first ${itemsToRender.length} items of ${history.length} total`);
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
                        <h3>${((typeof I18n !== 'undefined' && I18n.get('advCapturedDataSection')) || 'Captured Data')}</h3>
                    </div>
                    <div class="header-right">
                        <span class="history-count">${BaseAdvancedModule._fmt('advPanelCaptureCountFmt', `Captures: ${history.length}`, history.length)}</span>
                        ${history.length > 0 ? `
                            <button class="clear-history-btn" id="clear${this.moduleName.charAt(0).toUpperCase() + this.moduleName.slice(1)}History" title="${FormatUtils.escapeAttr(BaseAdvancedModule._tr('advPanelClearCapturedDataTitle', 'Clear all captured data'))}" aria-label="${FormatUtils.escapeAttr(BaseAdvancedModule._tr('advPanelClearCapturedDataTitle', 'Clear all captured data'))}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="history-list" id="${this.moduleName}HistoryList">
                    ${historyItems}
                </div>
                ${history.length > 3 ? `
                    <div id="${this.moduleName}HistoryPagination" class="pagination">
                        <div class="pagination-info">${BaseAdvancedModule._fmt('paginationShowingFmt', `Showing 1-3 of ${history.length}`, 1, 3, history.length)}</div>
                        <div class="pagination-controls">
                            <button type="button" class="pagination-btn pagination-btn-prev" aria-label="${FormatUtils.escapeAttr(BaseAdvancedModule._tr('paginationPrev', 'Previous page'))}" disabled>
                                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12Z" fill="currentColor"/>
                                </svg>
                            </button>
                            <div class="page-numbers"></div>
                            <button type="button" class="pagination-btn pagination-btn-next" aria-label="${FormatUtils.escapeAttr(BaseAdvancedModule._tr('paginationNext', 'Next page'))}">
                                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M10 6L8.59 7.41L13.17 12L8.59 16.59L10 18L16 12Z" fill="currentColor"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

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
                    <h4 class="empty-capture-title">${((typeof I18n !== 'undefined' && I18n.get('advNoCapturesYet')) || 'No captures yet')}</h4>
                    <p class="empty-capture-text">${((typeof I18n !== 'undefined' && I18n.format('advNoCapturesHintFmt', this.displayName)) || `Click "Start Capturing" above to begin capturing ${this.displayName} data`)}</p>
                </div>
            </div>
        `;
    }

    renderCaptureHistoryItems(items) {
        // Default simple rendering - override in child classes
        return items.map((item) => {
            const { timestamp } = item;
            const esc = FormatUtils.escapeHtml, attr = FormatUtils.escapeAttr;
            const hostname = String(item.hostname || '');
            const id = attr(String(item.id || timestamp || ''));
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = attr(UrlUtils.resolveDisplayFavicon(item.favicon, item.url || hostname));

            return `
                <div class="capture-card" data-capture-id="${id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${attr(hostname)}" data-fallback="${attr(UrlUtils.getDefaultFaviconUrl())}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${esc(hostname)}</span>
                                <span class="capture-time">${esc(timeAgo)}</span>
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

    setupCaptureHistoryListeners() {
        Logger.debug('UI', `[${this.moduleName}] setupCaptureHistoryListeners - Items: ${this.currentCaptureHistory?.length || 0}`);

        // Clear history button
        const clearBtnId = `clear${this.moduleName.charAt(0).toUpperCase() + this.moduleName.slice(1)}History`;
        const clearBtn = document.querySelector(`#${clearBtnId}`);
        if (clearBtn && !AdvancedModuleHistory.boundElements.has(clearBtn)) {
            AdvancedModuleHistory.boundElements.add(clearBtn);
            clearBtn.addEventListener('click', () => this.clearCaptureHistory());
        }

        // Setup pagination if we have history items
        if (this.currentCaptureHistory && this.currentCaptureHistory.length > 3) {
            Logger.debug('UI', `[${this.moduleName}] Setting up pagination for ${this.currentCaptureHistory.length} items`);
            this.setupCaptureHistoryPagination();
            return; // Pagination will handle expand listeners
        }

        // Otherwise setup expand listeners directly
        Logger.debug('UI', `[${this.moduleName}] No pagination needed, setting up expand listeners directly`);
        this.setupExpandListeners();
    }

    setupExpandListeners() {
        // This vendor's own Captured Data list only: the Captures panel uses the same
        // card class with its own handlers, and a re-render must not bind twice
        const list = document.querySelector(`#${this.moduleName}HistoryList`);
        if (!list) return;
        const bound = AdvancedModuleHistory.boundElements;
        const once = el => {
            if (bound.has(el)) return false;
            bound.add(el);
            return true;
        };

        // CSP-compliant image error fallback
        list.querySelectorAll('img[data-fallback]').forEach(img => {
            if (!once(img)) return;
            img.addEventListener('error', function() {
                this.src = this.dataset.fallback;
            }, { once: true });
        });

        const expandBtns = list.querySelectorAll('.capture-expand');
        expandBtns.forEach(btn => {
            if (!once(btn)) return;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const captureId = btn.getAttribute('data-capture-id');
                this.toggleCaptureDetails(captureId);
            });
        });

        const captureCards = list.querySelectorAll('.capture-card');
        captureCards.forEach(card => {
            if (!once(card)) return;
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.capture-expand')) {
                    const captureId = card.getAttribute('data-capture-id');
                    this.toggleCaptureDetails(captureId);
                }
            });
        });
    }

    setupCaptureHistoryPagination() {
        if (!this.currentCaptureHistory || this.currentCaptureHistory.length === 0) {
            Logger.debug('UI', `[${this.moduleName}] Cannot setup pagination - no history items`);
            return;
        }

        const paginationId = `${this.moduleName}HistoryPagination`;
        const paginationDiv = document.querySelector(`#${paginationId}`);

        if (!paginationDiv) {
            Logger.error('UI', `[${this.moduleName}] Pagination div #${paginationId} not found in DOM!`);
            return;
        }

        Logger.debug('UI', `[${this.moduleName}] Creating PaginationManager for #${paginationId} with ${this.currentCaptureHistory.length} items`);

        this.captureHistoryPagination = new PaginationManager(paginationId, {
            itemsPerPage: 3,
            onPageChange: (page, items) => {
                Logger.debug('UI', `[${this.moduleName}] Page changed to ${page}, showing ${items.length} items`);
                this.renderCaptureHistoryPage(items);
            }
        });

        this.captureHistoryPagination.setItems(this.currentCaptureHistory);
        Logger.debug('UI', `[${this.moduleName}] Pagination setup complete`);
    }

    renderCaptureHistoryPage(items) {
        const listContainer = document.querySelector(`#${this.moduleName}HistoryList`);
        if (!listContainer) {
            Logger.debug('UI', `[${this.moduleName}] History list container not found`);
            return;
        }

        listContainer.innerHTML = this.renderCaptureHistoryItems(items);

        // Re-setup event listeners for the new page
        this.setupExpandListeners();
    }

    recordStructuredResult(operation, result) {
        const tool = this._lastTool;
        if (tool?.action === 'capture') return;
        // Worker-owned analysis jobs already persist their result once.
        if (result?._advancedPersisted) return;
        const data = AdvancedResultModel.create({ vendorId: this.moduleName,
            operation: tool?.id || operation, label: tool?.label || operation, data: result });
        void this.saveToolResult(data);
    }

    renderToolResultContent(capture) {
        const data = capture?.data || capture?.captureData || {};
        const K = BaseAdvancedModule;
        // The saved result as copyable text, then when and where it was taken
        const label = [data.label || data.tool || '', data.title && data.title !== data.label ? data.title : ''].filter(Boolean).join(' · ');
        return K.kitCode(label, AdvancedResultModel.text(data)) + BaseAdvancedModule.prototype.renderCaptureDetailsContent.call(this, capture);
    }

    async saveToolResult(data) {
        try {
            const url = this.tabInfo?.url || '';
            const hostname = url ? new URL(url).hostname : '';
            const favicon = UrlUtils.normalizeFaviconForStorage(this.tabInfo?.favIconUrl, url || hostname);
            const timestamp = Date.now();
            return await AdvancedHistoryStore.appendCapture(this.moduleName, {
                id: data.requestId || AdvancedResultModel.requestId(),
                timestamp,
                url,
                hostname,
                favicon,
                data,
                captureData: data
            }, { expiryMinutes: 30 });
        } catch (error) {
            Logger.error('UI', `[${this.moduleName}] Could not save the tool result to history:`, error);
            return null;
        }
    }

    renderCaptureDetailsContent(capture) {
        // Default implementation - shows basic capture info
        const K = BaseAdvancedModule;
        return K.kitFacts([{ label: K._tr('advCommonCaptured', 'Captured'), value: K.kitDateTime(capture.timestamp) }])
            + K.kitCard(K.kitField(K._tr('advCommonUrl', 'URL'), capture.url || K._tr('advPanelNotAvailable', 'N/A'), { mono: false, wrap: true }));
    }

    displayCaptureDetailsModal(captureId, detailsContent, { copyData } = {}) {
        const _tCD = (typeof I18n !== 'undefined') ? I18n : null;
        // "Copy All Data" sits in the window's footer, like the other Advanced windows
        const actions = copyData === undefined ? [] : [{
            label: (_tCD && _tCD.get('btnCopyAllData')) || 'Copy All Data',
            primary: true,
            iconSvg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
            onClick: () => AdvancedUtils.copyToClipboard(JSON.stringify(copyData, null, 2), null, {
                notificationMessage: (_tCD && _tCD.get('captureDataCopied')) || 'Capture data copied'
            })
        }];
        // detailsContent is pre-sanitized by renderCaptureDetailsContent(); its
        // data-copy values copy on click (kit binding)
        return this.openKitModal({
            title: (_tCD && _tCD.get('advCaptureDetails')) || 'Capture Details',
            iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19,3H14.82C14.4,1.84 13.3,1 12,1C10.7,1 9.6,1.84 9.18,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M12,3A1,1 0 0,1 13,4A1,1 0 0,1 12,5A1,1 0 0,1 11,4A1,1 0 0,1 12,3Z"/></svg>',
            body: detailsContent,
            actions,
            copiedMessage: (_tCD && _tCD.get('advValueCopied')) || 'Value copied',
            record: false
        });
    }

    async toggleCaptureDetails(captureId) {
        // Load full capture data
        const history = await this.loadCaptureHistory();
        const capture = history.find(item => (item.id || item.timestamp.toString()) === captureId);
        if (!capture) return;

        // Render modal content (child classes can override renderCaptureDetailsContent)
        const savedData = capture.data !== undefined ? capture.data : capture.captureData;
        const isToolResult = savedData?.tool && (savedData.schemaVersion === 1 || Array.isArray(savedData.lines));
        const modalContent = isToolResult ? this.renderToolResultContent(capture) : this.renderCaptureDetailsContent(capture);
        this.displayCaptureDetailsModal(captureId, modalContent, { copyData: capture.captureData });
    }

    showConfirmationModal(title, message, confirmText, cancelText) {
        const _tSC = (typeof I18n !== 'undefined') ? I18n : null;
        return AdvancedUtils.showConfirmationModal({
            title,
            message,
            confirmText: confirmText || ((_tSC && _tSC.get('btnDelete')) || 'Delete'),
            cancelText: cancelText || ((_tSC && _tSC.get('btnCancel')) || 'Cancel'),
            confirmClass: 'danger'
        });
    }

    async clearCaptureHistory() {
        const _tCH = (typeof I18n !== 'undefined') ? I18n : null;
        const confirmed = await this.showConfirmationModal(
            (_tCH && _tCH.get('advConfirmClearAllTitle')) || 'Clear All Captured Data?',
            (_tCH && _tCH.get('advConfirmClearAllMsg')) || 'This will permanently delete all captured data for this module. This action cannot be undone.',
            (_tCH && _tCH.get('btnClearData')) || 'Clear Data',
            (_tCH && _tCH.get('btnCancel')) || 'Cancel'
        );

        if (!confirmed) {
            return;
        }

        try {
            await AdvancedHistoryStore.clear(this.moduleName);

            await this.renderCapturedDataSection();
            NotificationHelper.success(BaseAdvancedModule._fmt('advPanelHistoryClearedFmt', `${this.displayName} capture history cleared`, this.displayName));
        } catch (error) {
            Logger.error('UI', `[${this.moduleName}] Failed to clear history:`, error);
            NotificationHelper.error(BaseAdvancedModule._tr('advPanelFailedClearHistory', 'Failed to clear history'));
        }
    }

    async renderCapturedDataSection() {
        const advancedContent = document.querySelector('#detectionToolsPanel');
        if (!advancedContent) {
            Logger.debug('UI', `[${this.moduleName}] #detectionToolsPanel not found`);
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

    getTimeAgo(timestamp) {
        return AdvancedUtils.getTimeAgo(timestamp);
    }
}
// History elements that already have their listeners
AdvancedModuleHistory.boundElements = new WeakSet();
for (const name of ['loadCaptureHistory', 'renderCaptureHistoryHTML', 'renderEmptyCaptureState', 'renderCaptureHistoryItems', 'setupCaptureHistoryListeners', 'setupExpandListeners', 'setupCaptureHistoryPagination', 'renderCaptureHistoryPage', 'recordStructuredResult', 'renderToolResultContent', 'saveToolResult', 'renderCaptureDetailsContent', 'displayCaptureDetailsModal', 'toggleCaptureDetails', 'showConfirmationModal', 'clearCaptureHistory', 'renderCapturedDataSection', 'getTimeAgo']) {
    Object.defineProperty(BaseAdvancedModule.prototype, name, Object.getOwnPropertyDescriptor(AdvancedModuleHistory.prototype, name));
}
})();
