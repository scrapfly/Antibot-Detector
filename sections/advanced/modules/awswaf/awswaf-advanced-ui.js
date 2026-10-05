    /**
     * Render AWS WAF-specific tools
     */
AwsWafAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'awswafCheckCookies',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnCheckCookies')) || 'Check Cookies'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                    </svg>
                `
            },
            {
                id: 'awswafAnalyzeScripts',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnAnalyzeScripts')) || 'Analyze Scripts'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                    </svg>
                `
            }
        ]);
    };


    /**
     * Setup tool-specific event listeners
     */
AwsWafAdvanced.prototype.setupToolListeners = function() {
        Logger.network('[AwsWaf] Setting up tool listeners...');
        this.bindToolActions([
            { id: 'awswafCheckCookies', handler: () => this.checkCookies() },
            { id: 'awswafAnalyzeScripts', handler: () => this.analyzeScripts() }
        ]);
        Logger.network('[AwsWaf] Added listener to Check Cookies button');
        Logger.network('[AwsWaf] Added listener to Analyze Scripts button');
    };


    /**
     * Display cookies in a modal (Akamai-style)
     */
AwsWafAdvanced.prototype.displayCookiesModal = function(awsWafToken) {
        const modal = this.createToolModal();

        const cookieFound = awsWafToken ? 1 : 0;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">${this._txt('advCommonCookiesTitleFmt', '{0} Cookies', 'AWS WAF')}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                ${this.buildCookieStatusSummary(cookieFound, 1)}

                ${awsWafToken ? `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="copy-value" data-copy="aws-waf-token" style="font-weight: 500; color: var(--text-primary); font-family: var(--font-mono); cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="${this._txt('advCommonClickToCopy', 'Click to copy')}">aws-waf-token</div>
                            <div style="display: flex; gap: 6px;">
                                ${awsWafToken.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                ${awsWafToken.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                            </div>
                        </div>
                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(awsWafToken.value)}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: var(--font-mono); background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="${this._txt('advCommonClickToCopyFull', 'Click to copy full value')}">${awsWafToken.value.substring(0, 60)}${awsWafToken.value.length > 60 ? '...' : ''}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${this._txt('advCommonDomainLabel', 'Domain:')} ${awsWafToken.domain}</div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 14px;">${this._txt('advCommonNoCookiesFmt', 'No {0} cookies found', 'AWS WAF')}</div>
                    </div>
                `}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: this._txt('advValueCopied', 'Value copied') });
        modal.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });
        });
        this.bindModalClose(modal);
        this.showToolModal(modal);
    };


    /**
     * Display script analysis results in modal (simplified - only challenge.js and captcha.js)
     */
AwsWafAdvanced.prototype.displayAnalysisModal = function(data) {
        Logger.network('[AwsWaf] Displaying analysis modal with data:', data);

        const modal = this.createToolModal();

        // Simplified - just a flat array of scripts
        const scripts = data?.scripts || [];

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">${this._txt('advCommonScriptsTitleFmt', '{0} Scripts ({1})', 'AWS WAF', scripts.length)}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                ${scripts.length === 0 ? `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 14px; color: var(--text-secondary);">${this._txt('advAwswafNoScripts', 'No AWS WAF scripts found')}</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">${this._txt('advAwswafDeleteCookieHint', 'Delete aws-waf-token cookie and reload to trigger challenge')}</div>
                    </div>
                ` : `
                    <!-- Scripts List -->
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${scripts.map((script, idx) => {
                            // Type label and color
                            let typeLabel, typeColor;
                            if (script.type === 'challenge') {
                                typeLabel = this._txt('advAwswafTypeChallenge', 'Challenge');
                                typeColor = '#ef4444';
                            } else if (script.type === 'captcha') {
                                typeLabel = this._txt('categoryCaptcha', 'Captcha');
                                typeColor = '#8b5cf6';
                            } else if (script.type === 'awswaf') {
                                typeLabel = 'AWS WAF';
                                typeColor = '#f59e0b';
                            } else {
                                typeLabel = script.type;
                                typeColor = '#667eea';
                            }

                            return `
                            <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 8px; border: 1px solid var(--border);">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 600;">${this._txt('advCommonScript', 'Script')} ${idx + 1}</span>
                                        <span style="background: ${typeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">${typeLabel}</span>
                                    </div>
                                </div>

                                <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 6px; font-weight: 600;">${this._txt('advCommonUrl', 'URL')}</div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url)}" style="font-size: 11px; color: var(--text-primary); word-break: break-all; font-family: var(--font-mono); background: var(--bg-primary); padding: 10px; border-radius: 4px; cursor: pointer; transition: all 0.2s; border: 1px solid var(--border);" title="${this._txt('advAwswafClickToCopyUrl', 'Click to copy URL')}">${AdvancedUtils.escapeHtml(script.url)}</div>
                            </div>
                            `;
                        }).join('')}
                    </div>

                    <!-- Export Code Button -->
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                        <button class="modal-export-code-btn" style="width: 100%; background: var(--accent); color: white; border: none; border-radius: 6px; padding: 12px; font-size: 13px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s;">
                            ${this._txt('advCommonExportCode', 'Export Code')}
                        </button>
                    </div>
                `}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: this._txt('advValueCopied', 'Value copied') });
        modal.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });
        });

        this.bindModalClose(modal);

        // Export Code button handler
        const exportBtn = modal.querySelector('.modal-export-code-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.displayExportCodeModal(scripts);
            });
        }

        this.showToolModal(modal);
    };


    /**
     * Display export code modal with multi-language code generation
     * @param {Array} scripts - Array of script objects with url and type
     */
AwsWafAdvanced.prototype.displayExportCodeModal = function(scripts) {
        const descriptions = {
            javascript: this._txt('advCodeDescBrowserFetchFmt', 'Browser console code for fetching {0} scripts', 'AWS WAF'),
            python: this._txt('advCodeDescPython', 'Python script with requests library'),
            nodejs: this._txt('advCodeDescNode', 'Node.js script with axios'),
            php: this._txt('advCodeDescPhp', 'PHP script with cURL'),
            csharp: this._txt('advCodeDescCsharp', 'C# with HttpClient'),
            go: this._txt('advCodeDescGo', 'Go with net/http')
        };
        return AdvancedCodeDialog.open(this, {
            title: this._txt('advAwswafFetchCodeTitle', 'AWS WAF Script Fetching Code'),
            getCodes: () => this.generateAwsWafParsingCode(scripts),
            description: (type, language) => descriptions[language]
        });
    };


    /**
     * Render capture details content for modal
     * @param {object} capture - Capture history item
     * @returns {string} HTML content for modal
     */
AwsWafAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        if (!capture || !capture.captureData) {
            return '<div class="advanced-modal-section"><span class="advanced-modal-error">' + this._txt('advCommonNoCaptureData', 'No capture data available') + '</span></div>';
        }

        // Handle nested data structure from AWS WAF interceptor
        const captureData = capture.captureData;
        const data = captureData.data || captureData;
        const flags = captureData.flags || {};
        const url = AdvancedUtils.escapeHtml(data.websiteURL || capture.url || 'N/A');
        const timestamp = new Date(captureData.timestamp || capture.timestamp).toLocaleString();

        return `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${this._txt('advCommonWebsiteUrl', 'Website URL')}</label>
                <div class="advanced-modal-code-block" style="word-break: break-all;">${url}</div>
            </div>

            ${data.awsChallengeJS || data.awsApiJs || data.awsProblemUrl ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${this._txt('advAwswafScriptsLabel', 'AWS WAF Scripts')}</label>
                ${data.awsChallengeJS ? `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">${this._txt('advAwswafChallengeScript', 'Challenge Script')}</div>
                    <div class="advanced-modal-code-block copy-value" data-copy="${AdvancedUtils.escapeHtml(data.awsChallengeJS)}" data-copy-message="${this._txt('advCommonUrlCopied', 'URL copied')}" style="word-break: break-all;" title="${this._txt('advCommonClickToCopy', 'Click to copy')}">${AdvancedUtils.escapeHtml(data.awsChallengeJS)}</div>
                </div>
                ` : ''}
                ${data.awsApiJs ? `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">${this._txt('advAwswafApiScript', 'API Script (jsapi.js)')}</div>
                    <div class="advanced-modal-code-block copy-value" data-copy="${AdvancedUtils.escapeHtml(data.awsApiJs)}" data-copy-message="${this._txt('advCommonUrlCopied', 'URL copied')}" style="word-break: break-all;" title="${this._txt('advCommonClickToCopy', 'Click to copy')}">${AdvancedUtils.escapeHtml(data.awsApiJs)}</div>
                </div>
                ` : ''}
                ${data.awsProblemUrl ? `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">${this._txt('advAwswafProblemEndpoint', 'Problem Endpoint')}</div>
                    <div class="advanced-modal-code-block copy-value" data-copy="${AdvancedUtils.escapeHtml(data.awsProblemUrl)}" data-copy-message="${this._txt('advCommonUrlCopied', 'URL copied')}" style="word-break: break-all;" title="${this._txt('advCommonClickToCopy', 'Click to copy')}">${AdvancedUtils.escapeHtml(data.awsProblemUrl)}</div>
                </div>
                ` : ''}
            </div>
            ` : ''}

            ${data.awsApiKey ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${this._txt('advAwswafApiKey', 'API Key')}</label>
                <div class="advanced-modal-code-block copy-value" data-copy="${AdvancedUtils.escapeHtml(data.awsApiKey)}" data-copy-message="${this._txt('advAwswafApiKeyCopied', 'API Key copied')}" title="${this._txt('advCommonClickToCopy', 'Click to copy')}">${AdvancedUtils.escapeHtml(data.awsApiKey)}</div>
            </div>
            ` : ''}

            ${data.awsExistingToken ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${this._txt('advAwswafToken', 'AWS WAF Token')}</label>
                <div class="advanced-modal-code-block copy-value" data-copy="${AdvancedUtils.escapeHtml(data.awsExistingToken)}" data-copy-message="${this._txt('advAwswafTokenCopied', 'Token copied')}" style="word-break: break-all;" title="${this._txt('advCommonClickToCopy', 'Click to copy')}">${data.awsExistingToken.substring(0, 60)}${data.awsExistingToken.length > 60 ? '...' : ''}</div>
            </div>
            ` : ''}

            ${flags.hasStatus405 || flags.hasChallengeEndpoint || flags.hasProblemEndpoint ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${this._txt('advAwswafDetectionIndicators', 'Detection Indicators')}</label>
                ${flags.hasStatus405 ? `<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">${this._txt('advAwswafStatus405', 'Status 405')}</span><span class="advanced-modal-info-value">${this._txt('advAwswafDetected', 'Detected')}</span></div>` : ''}
                ${flags.hasChallengeEndpoint ? `<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">${this._txt('advAwswafChallengeEndpoint', 'Challenge Endpoint')}</span><span class="advanced-modal-info-value">${this._txt('advCommonFound', 'Found')}</span></div>` : ''}
                ${flags.hasProblemEndpoint ? `<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">${this._txt('advAwswafProblemEndpoint', 'Problem Endpoint')}</span><span class="advanced-modal-info-value">${this._txt('advCommonFound', 'Found')}</span></div>` : ''}
            </div>
            ` : ''}

            <div class="advanced-modal-section">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">${this._txt('advCommonCaptured', 'Captured')}</span>
                    <span class="advanced-modal-info-value">${timestamp}</span>
                </div>
            </div>
        `;
    };
