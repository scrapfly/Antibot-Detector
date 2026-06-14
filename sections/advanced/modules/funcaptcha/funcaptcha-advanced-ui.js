FunCaptchaAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'funcaptchaAnalyzeScripts',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnAnalyzeScripts')) || 'Analyze Scripts'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                    </svg>
                `
            },
            {
                id: 'funcaptchaStartCapture',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnStartCapturing')) || 'Start Capturing'),
                kind: 'capture',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="8"/>
                    </svg>
                `
            }
        ]);
    };


FunCaptchaAdvanced.prototype.setupToolListeners = function() {
        this.bindToolActions([
            { id: 'funcaptchaAnalyzeScripts', handler: () => this.analyzeScripts() },
            { id: 'funcaptchaStartCapture', handler: () => this.startCapturing() }
        ]);
    };


FunCaptchaAdvanced.prototype.displayAnalysisModal = function(data) {
        const scripts = data?.scripts || [];

        const modal = this.createToolModal();

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">FunCaptcha Scripts (${scripts.length})</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${scripts.map((script, idx) => `
                        <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <span style="font-weight: 500;">Script ${idx + 1}</span>
                                <span style="background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%); color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px;">FunCaptcha</span>
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


FunCaptchaAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        const data = capture.captureData || {};
        const {
            websiteUrl = 'N/A',
            publicKey = 'N/A',
            bda = null,
            userAgent = 'N/A',
            blob = null,
            isBlobRequired = false,
            apiDomain = 'N/A'
        } = data;
        const timestamp = new Date(capture.timestamp).toLocaleString();

        return `
            <!-- Public Key Section -->
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Public Key</label>
                <div class="advanced-modal-code-block" data-copy="${publicKey}" style="word-break: break-all;">${publicKey}</div>
            </div>

            <!-- API Domain Section -->
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">API Domain</label>
                <div class="advanced-modal-code-block" data-copy="${apiDomain}">${FormatUtils.escapeHtml(apiDomain)}</div>
            </div>

            <!-- Website URL Section -->
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Website URL</label>
                <div class="advanced-modal-code-block" data-copy="${websiteUrl}" style="word-break: break-all;">${FormatUtils.escapeHtml(websiteUrl)}</div>
            </div>

            <!-- User Agent Section -->
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">User Agent</label>
                <div class="advanced-modal-code-block" data-copy="${userAgent}" style="word-break: break-all;">${userAgent}</div>
            </div>

            ${bda ? `
            <!-- BDA Section -->
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">BDA (Browser Data Array)</label>
                <div class="advanced-modal-code-block" data-copy="${bda}" style="word-break: break-all;">${bda}</div>
            </div>
            ` : ''}

            ${isBlobRequired ? `
            <!-- Blob Data Section -->
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Blob Data${blob ? '' : ' (Not Captured)'}</label>
                ${blob ? `
                    <div class="advanced-modal-code-block" data-copy="${blob}" style="word-break: break-all;">${blob}</div>
                ` : `
                    <div class="advanced-modal-info-row">
                        <span class="advanced-modal-info-label">Status</span>
                        <span class="advanced-modal-info-value">Not captured</span>
                    </div>
                `}
            </div>
            ` : ''}

            <!-- Timestamp Section -->
            <div class="advanced-modal-section" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Captured</span>
                    <span class="advanced-modal-info-value">${timestamp}</span>
                </div>
            </div>
        `;
    };
