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
        this.recordStructuredResult('displayAnalysisModal', data);
        const scripts = data?.scripts || [];

        const modal = this.createToolModal();

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">${this._txt('advCommonScriptsTitleFmt', '{0} Scripts ({1})', 'FunCaptcha', scripts.length)}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${scripts.length ? '' : BaseAdvancedModule.kitNote(BaseAdvancedModule._fmt('advPanelNoScriptsFmt', 'No FunCaptcha scripts found', 'FunCaptcha'))}
                    ${scripts.map((script, idx) => `
                        <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <span style="font-weight: 500;">${this._txt('advCommonScript', 'Script')} ${idx + 1}</span>
                                <span style="background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%); color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px;">FunCaptcha</span>
                            </div>
                            <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url)}" style="font-size: 12px; color: var(--text-primary); word-break: break-all; font-family: var(--font-mono); background: var(--bg-primary); padding: 8px; border-radius: 4px; cursor: pointer;">${AdvancedUtils.escapeHtml(script.url)}</div>
                        </div>
                    `).join('')}
                </div>

                ${scripts.length > 0 ? `
                    <button type="button" class="modal-export-code-btn" style="margin-top: 16px; width: 100%; padding: 10px; background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                        ${this._txt('advCommonExportCode', 'Export Code')}
                    </button>
                ` : ''}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: this._txt('advCommonUrlCopied', 'URL copied') });
        this.bindModalClose(modal);
        // Export Code: the script URLs as download code in six languages
        modal.querySelector('.modal-export-code-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            AdvancedCodeDialog.openScriptUrls(this, 'FunCaptcha', scripts);
        });
        this.showToolModal(modal);
    };


FunCaptchaAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        const K = BaseAdvancedModule;
        const data = capture.captureData || {};
        const facts = K.kitFacts([
            data.isBlobRequired && !data.blob ? { label: this._txt('advFuncaptchaBlobData', 'Blob Data'), html: true,
                value: K.kitChip(this._txt('advFuncaptchaNotCaptured', 'Not captured'), 'neutral') } : null,
            { label: this._txt('advCommonCaptured', 'Captured'), value: K.kitDateTime(capture.timestamp) }
        ]);
        const fields = K.kitField(this._txt('advFuncaptchaPublicKey', 'Public Key'), data.publicKey, { wrap: true })
            + K.kitField(this._txt('advCommonApiDomain', 'API Domain'), data.apiDomain)
            + K.kitField(this._txt('advCommonWebsiteUrl', 'Website URL'), data.websiteUrl, { mono: false, wrap: true })
            + K.kitField(this._txt('advFuncaptchaUserAgent', 'User Agent'), data.userAgent, { mono: false, wrap: true })
            + K.kitField(this._txt('advFuncaptchaBdaLabel', 'BDA (Browser Data Array)'), data.bda, { clamp: true })
            + (data.isBlobRequired ? K.kitField(this._txt('advFuncaptchaBlobData', 'Blob Data'), data.blob, { clamp: true }) : '');
        return facts + (fields ? K.kitCard(fields) : '');
    };
