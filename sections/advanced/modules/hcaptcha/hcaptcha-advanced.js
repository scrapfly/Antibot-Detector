/**
 * HCaptchaAdvanced - hCaptcha Module (simplified version)
 */

Logger.network('[HCaptchaAdvanced] Loading...');

class HCaptchaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'hcaptcha');
    }

    async afterCaptureStart(response) {
        if (response && (response.status === 'started' || response.status === 'already_capturing')) {
            // Show brief notification in popup
            await AdvancedUtils.showCaptureStartNotification('hCaptcha');

            // Close popup after brief delay so user can see the page
            // The in-page notification will guide them to reload
            setTimeout(() => {
                window.close();
            }, 800); // 800ms delay so user sees the popup notification first
        }
    }

    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="hcaptchaCheckVersion">
                    <div class="tool-icon-container tool-icon-blue">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12.5,7H11V13L16.25,16.15L17.02,14.92L12.5,11.58V7Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Check Version</div>
                </button>

                <button class="recaptcha-tool-btn" id="hcaptchaStartCapture">
                    <div class="tool-icon-container tool-icon-green">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M9.5,9.5A1.5,1.5 0 0,1 11,11A1.5,1.5 0 0,1 9.5,12.5A1.5,1.5 0 0,1 8,11A1.5,1.5 0 0,1 9.5,9.5M15,11A1.5,1.5 0 0,0 13.5,9.5A1.5,1.5 0 0,0 12,11A1.5,1.5 0 0,0 13.5,12.5A1.5,1.5 0 0,0 15,11M11,15H13V17H11V15M9,15H10V17H9V15M14,15H15V17H14V15Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Start Capturing</div>
                </button>

                <button class="recaptcha-tool-btn" id="hcaptchaAnalyzeScripts">
                    <div class="tool-icon-container tool-icon-blue">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Analyze Scripts</div>
                </button>
            </div>
        `;
    }

    setupToolListeners() {
        const checkVersionBtn = document.querySelector('#hcaptchaCheckVersion');
        const captureBtn = document.querySelector('#hcaptchaStartCapture');
        const analyzeScriptsBtn = document.querySelector('#hcaptchaAnalyzeScripts');

        if (checkVersionBtn) checkVersionBtn.addEventListener('click', () => this.checkVersion());
        if (captureBtn) captureBtn.addEventListener('click', () => this.startCapturing());
        if (analyzeScriptsBtn) analyzeScriptsBtn.addEventListener('click', () => this.analyzeScripts());
    }

    async checkVersion() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) throw new Error('Tab information not available');

            // Set up listener for version detection results BEFORE reloading
            const versionListener = (message) => {
                if (message.type === 'HCAPTCHA_VERSION_RESULT') {
                    Logger.network('[hCaptcha] Version result received:', message.data);
                    this.displayVersionModal(message.data);
                    chrome.runtime.onMessage.removeListener(versionListener);
                }
            };

            chrome.runtime.onMessage.addListener(versionListener);

            // Start version check monitoring
            const response = await AdvancedUtils.sendMessage({
                type: 'HCAPTCHA_CHECK_VERSION',
                tabId: this.tabInfo.id
            });

            Logger.network('[hCaptcha] Check version initiated:', response);

            if (response && response.status === 'started') {
                NotificationHelper.info('Checking hCaptcha version... Page will reload');

                // Send page notification before reload
                await AdvancedUtils.sendMessage({
                    type: 'HCAPTCHA_SHOW_VERSION_NOTIFICATION',
                    tabId: this.tabInfo.id
                });

                // Wait briefly then reload the page to trigger hCaptcha loading
                await chrome.tabs.reload(this.tabInfo.id);

                // Timeout after 15 seconds
                setTimeout(() => {
                    chrome.runtime.onMessage.removeListener(versionListener);
                    NotificationHelper.error('hCaptcha version detection timeout');
                }, 15000);
            } else {
                NotificationHelper.error('Failed to start version check');
                chrome.runtime.onMessage.removeListener(versionListener);
            }
        } catch (error) {
            Logger.error('NETWORK', '[hCaptcha] Failed to check version:', error);
            NotificationHelper.error('Failed to check version: ' + error.message);
        }
    }

    displayVersionModal(data) {
        const { version, isEnterprise, message } = data;

        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

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

        document.body.appendChild(modal);

        modal.querySelectorAll('.copy-value').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                AdvancedUtils.copyToClipboard(el.getAttribute('data-copy'), el, { notificationMessage: 'Copied' });
            });
        });

        modal.querySelector('.advanced-modal-close-btn')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    /**
     * Override: Render hCaptcha capture history items
     * Shows: Timestamp, Version, Enterprise, Site Key, Website URL
     */
    renderCaptureHistoryItems(historyItems) {
        if (!historyItems || historyItems.length === 0) {
            return '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No capture history yet</div>';
        }

        return historyItems.map(item => {
            const timestamp = item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Unknown';
            const version = item.version || 'N/A';
            const isEnterprise = item.isEnterprise ? 'Yes' : 'No';
            const siteKey = item.websiteKey || 'N/A';
            const websiteUrl = item.websiteURL || 'N/A';

            return `
                <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; margin-bottom: 12px;">
                    <div style="display: grid; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                            <span style="color: var(--text-secondary); font-size: 12px;">📅 ${timestamp}</span>
                            <span style="color: var(--text-secondary); font-size: 12px;">${item.type || 'hCaptcha'}</span>
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
    }

    /**
     * Override: Render hCaptcha capture details for modal
     * Shows all hCaptcha-specific information when user clicks on a capture
     */
    renderCaptureDetailsContent(capture) {
        const data = capture.captureData || capture.data || {};
        const timestamp = new Date(capture.timestamp).toLocaleString();
        const url = (capture.url || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
    }

    async analyzeScripts() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) throw new Error('Tab information not available');

            const analysisListener = (message) => {
                if (message.type === 'HCAPTCHA_ANALYSIS_RESULT') {
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            const response = await AdvancedUtils.sendMessage({
                type: 'HCAPTCHA_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && response.status === 'started') {
                NotificationHelper.info('Analyzing hCaptcha... Page will reload');

                setTimeout(async () => {
                    await AdvancedUtils.sendMessage({
                        type: 'HCAPTCHA_SHOW_ANALYZING_NOTIFICATION',
                        tabId: this.tabInfo.id
                    });

                    await chrome.tabs.reload(this.tabInfo.id);
                }, 500);
            }
        } catch (error) {
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    }

    displayAnalysisModal(data) {
        const scripts = data?.scripts || [];

        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

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

        document.body.appendChild(modal);

        modal.querySelectorAll('.copy-value').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                AdvancedUtils.copyToClipboard(el.getAttribute('data-copy'), el, { notificationMessage: 'URL copied' });
            });
        });

        modal.querySelector('.advanced-modal-close-btn')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        setTimeout(() => modal.style.opacity = '1', 10);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = HCaptchaAdvanced;
} else if (typeof window !== 'undefined') {
    window.HCaptchaAdvanced = HCaptchaAdvanced;
}

Logger.network('[HCaptchaAdvanced] Loaded');
