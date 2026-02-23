HCaptchaAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'hcaptchaCheckVersion',
                label: 'Check Version',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12.5,7H11V13L16.25,16.15L17.02,14.92L12.5,11.58V7Z"/>
                    </svg>
                `
            },
            {
                id: 'hcaptchaStartCapture',
                label: 'Start Capturing',
                kind: 'capture',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M9.5,9.5A1.5,1.5 0 0,1 11,11A1.5,1.5 0 0,1 9.5,12.5A1.5,1.5 0 0,1 8,11A1.5,1.5 0 0,1 9.5,9.5M15,11A1.5,1.5 0 0,0 13.5,9.5A1.5,1.5 0 0,0 12,11A1.5,1.5 0 0,0 13.5,12.5A1.5,1.5 0 0,0 15,11M11,15H13V17H11V15M9,15H10V17H9V15M14,15H15V17H14V15Z"/>
                    </svg>
                `
            },
            {
                id: 'hcaptchaAnalyzeScripts',
                label: 'Analyze Scripts',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                    </svg>
                `
            }
        ]);
    };


HCaptchaAdvanced.prototype.setupToolListeners = function() {
        this.bindToolActions([
            { id: 'hcaptchaCheckVersion', handler: () => this.checkVersion() },
            { id: 'hcaptchaStartCapture', handler: () => this.startCapturing() },
            { id: 'hcaptchaAnalyzeScripts', handler: () => this.analyzeScripts() }
        ]);
    };


HCaptchaAdvanced.prototype.displayVersionModal = function(data) {
        const { version, isEnterprise, message } = data;

        const modal = this.createToolModal();

        if (message || !version) {
            modal.innerHTML = `
                <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 24px; max-width: 500px; width: 90%; text-align: center;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">hCaptcha Detection</h3>
                        <button class="advanced-modal-close-btn">×</button>
                    </div>
                    <div style="padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 48px; margin-bottom: 12px;"></div>
                        <div style="color: var(--text-secondary);">${message || 'hCaptcha not detected. Please reload the page with hCaptcha loaded.'}</div>
                    </div>
                </div>
            `;
        } else {
            modal.innerHTML = `
                <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 500px; width: 90%;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">hCaptcha Version</h3>
                        <button class="advanced-modal-close-btn">×</button>
                    </div>

                    <div style="display: grid; gap: 12px;">
                        <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px;">
                            <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 6px;">Version</div>
                            <div class="copy-value" data-copy="${version}" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; background: var(--bg-primary); padding: 8px; border-radius: 4px;">${version}</div>
                        </div>

                        <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: var(--text-secondary); font-size: 12px;">Enterprise Mode</span>
                                <span style="font-weight: 600; font-size: 18px;">${isEnterprise ? 'Yes' : 'No'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        this.bindCopyValueHandlers(modal, { defaultMessage: 'Copied' });
        this.bindModalClose(modal);
        this.showToolModal(modal);
    };


    /**
     * Override: Render hCaptcha capture history items
     * Shows: Timestamp, Version, Enterprise, Site Key, Website URL
     */
HCaptchaAdvanced.prototype.renderCaptureHistoryItems = function(historyItems) {
        if (!historyItems || historyItems.length === 0) {
            return '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No capture history yet</div>';
        }

        return historyItems.map(item => {
            const timestamp = item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Unknown';
            const hostname = item.hostname || (item.websiteURL ? new URL(item.websiteURL).hostname : '');
            const faviconUrl = UrlUtils.resolveDisplayFavicon(item.favicon, item.url || hostname);
            const version = item.version || 'N/A';
            const isEnterprise = item.isEnterprise ? 'Yes' : 'No';
            const siteKey = item.websiteKey || 'N/A';
            const websiteUrl = item.websiteURL || 'N/A';

            return `
                <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; margin-bottom: 12px;">
                    <div style="display: grid; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                            <img src="${faviconUrl}" alt="${hostname}" style="width: 16px; height: 16px; border-radius: 3px;" data-fallback="${UrlUtils.getDefaultFaviconUrl()}">
                            <span style="color: var(--text-primary); font-size: 13px; font-weight: 500;">${hostname || 'Unknown'}</span>
                            <span style="color: var(--text-secondary); font-size: 12px; margin-left: auto;">${timestamp}</span>
                        </div>

                        <div>
                            <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">Version</div>
                            <div class="copy-value" data-copy="${version}" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; background: var(--bg-primary); padding: 6px; border-radius: 4px; word-break: break-all;">${version}</div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div style="background: var(--bg-primary); padding: 8px; border-radius: 4px; border-left: 3px solid ${item.isEnterprise ? '#ef4444' : '#22c55e'};">
                                <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">Enterprise</div>
                                <div style="font-weight: 500; color: var(--text-primary);">${isEnterprise}</div>
                            </div>
                        </div>

                        <div>
                            <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">Site Key</div>
                            <div class="copy-value" data-copy="${siteKey}" style="font-size: 11px; color: var(--text-primary); font-family: monospace; cursor: pointer; background: var(--bg-primary); padding: 6px; border-radius: 4px; word-break: break-all;">${siteKey}</div>
                        </div>

                        <div>
                            <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px;">Website URL</div>
                            <div class="copy-value" data-copy="${websiteUrl}" style="font-size: 11px; color: var(--text-primary); font-family: monospace; cursor: pointer; background: var(--bg-primary); padding: 6px; border-radius: 4px; word-break: break-all;">${websiteUrl}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };


    /**
     * Override: Render hCaptcha capture details for modal
     * Shows all hCaptcha-specific information when user clicks on a capture
     */
HCaptchaAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        const data = capture.captureData || capture.data || {};
        const timestamp = new Date(capture.timestamp).toLocaleString();
        const url = AdvancedUtils.escapeHtml(capture.url || 'N/A');

        const version = data.version || 'N/A';
        const siteKey = data.websiteKey || 'N/A';
        const websiteUrl = data.websiteURL || 'N/A';
        const isEnterprise = data.isEnterprise ? 'Yes' : 'No';

        return `
            <!-- URL Section -->
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">URL</label>
                <div class="advanced-modal-code-block" data-copy="${url}">${url}</div>
            </div>

            <!-- Version Section -->
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Version</label>
                <div class="advanced-modal-code-block" data-copy="${version}">${version}</div>
            </div>

            <!-- Site Key Section -->
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Site Key</label>
                <div class="advanced-modal-code-block" data-copy="${siteKey}" style="word-break: break-all;">${siteKey}</div>
            </div>

            <!-- Website URL Section -->
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Website URL</label>
                <div class="advanced-modal-code-block" data-copy="${websiteUrl}" style="word-break: break-all;">${websiteUrl}</div>
            </div>

            <!-- Enterprise Mode Section -->
            <div class="advanced-modal-section">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Enterprise Mode</span>
                    <span class="advanced-modal-info-value">${isEnterprise}</span>
                </div>
            </div>

            <!-- Timestamp Section (at bottom) -->
            <div class="advanced-modal-section" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Captured</span>
                    <span class="advanced-modal-info-value">${timestamp}</span>
                </div>
            </div>
        `;
    };


HCaptchaAdvanced.prototype.displayAnalysisModal = function(data) {
        const scripts = data?.scripts || [];

        const modal = this.createToolModal();

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">hCaptcha Scripts (${scripts.length})</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${scripts.map((script, idx) => `
                        <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <span style="font-weight: 500;">Script ${idx + 1}</span>
                                <span style="background: linear-gradient(135deg, #0074BF 0%, #0061B3 100%); color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px;">hCaptcha</span>
                            </div>
                            <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url)}" style="font-size: 12px; color: var(--text-primary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; cursor: pointer;">${script.url}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: 'URL copied' });
        this.bindModalClose(modal);
        this.showToolModal(modal);
    };
