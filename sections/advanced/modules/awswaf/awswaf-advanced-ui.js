/**
 * awswaf-advanced-ui.js
 * Split from monolithic file; method bodies intentionally unchanged.
 */


    /**
     * Render AWS WAF-specific tools
     */
AwsWafAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'awswafCheckCookies',
                label: 'Check Cookies',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                    </svg>
                `
            },
            {
                id: 'awswafAnalyzeScripts',
                label: 'Analyze Scripts',
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
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">AWS WAF Cookies</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                ${this.buildCookieStatusSummary(cookieFound, 1)}

                ${awsWafToken ? `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="copy-value" data-copy="aws-waf-token" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">aws-waf-token</div>
                            <div style="display: flex; gap: 6px;">
                                ${awsWafToken.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                ${awsWafToken.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                            </div>
                        </div>
                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(awsWafToken.value)}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy full value">${awsWafToken.value.substring(0, 60)}${awsWafToken.value.length > 60 ? '...' : ''}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">Domain: ${awsWafToken.domain}</div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 14px;">No AWS WAF cookies found</div>
                    </div>
                `}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: 'Value copied' });
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
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">AWS WAF Scripts (${scripts.length})</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                ${scripts.length === 0 ? `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 14px; color: var(--text-secondary);">No AWS WAF scripts found</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Delete aws-waf-token cookie and reload to trigger challenge</div>
                    </div>
                ` : `
                    <!-- Scripts List -->
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${scripts.map((script, idx) => {
                            // Type label and color
                            let typeLabel, typeColor;
                            if (script.type === 'challenge') {
                                typeLabel = 'Challenge';
                                typeColor = '#ef4444';
                            } else if (script.type === 'captcha') {
                                typeLabel = 'Captcha';
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
                                        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 600;">Script ${idx + 1}</span>
                                        <span style="background: ${typeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">${typeLabel}</span>
                                    </div>
                                </div>

                                <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 6px; font-weight: 600;">URL</div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url)}" style="font-size: 11px; color: var(--text-primary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 10px; border-radius: 4px; cursor: pointer; transition: all 0.2s; border: 1px solid var(--border);" title="Click to copy URL">${AdvancedUtils.escapeHtml(script.url)}</div>
                            </div>
                            `;
                        }).join('')}
                    </div>

                    <!-- Export Code Button -->
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                        <button class="modal-export-code-btn" style="width: 100%; background: var(--accent); color: white; border: none; border-radius: 6px; padding: 12px; font-size: 13px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s;">
                            Export Code
                        </button>
                    </div>
                `}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: 'Value copied' });
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
        const modal = this.createToolModal({ zIndex: 10001 });

        const parsingCodes = this.generateAwsWafParsingCode(scripts);

        modal.innerHTML = `
            <div style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 900px; max-height: 90vh; overflow: hidden; width: 95%; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">AWS WAF Script Fetching Code</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <!-- Language Tabs -->
                <div style="display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; flex-shrink: 0; flex-wrap: wrap;">
                    <button class="lang-tab active" data-lang="javascript" style="padding: 6px 12px; border: none; background: var(--accent); color: white; border-radius: 4px; cursor: pointer; font-size: 11px;">JavaScript</button>
                    <button class="lang-tab" data-lang="python" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Python</button>
                    <button class="lang-tab" data-lang="nodejs" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Node.js</button>
                    <button class="lang-tab" data-lang="php" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">PHP</button>
                    <button class="lang-tab" data-lang="csharp" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">C#</button>
                    <button class="lang-tab" data-lang="go" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Go</button>
                </div>

                <!-- Code Areas -->
                <div style="position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column;">
                    <div class="code-container" data-lang="javascript" style="display: flex; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.javascript}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">Browser console code for fetching AWS WAF scripts</div>
                    </div>

                    <div class="code-container" data-lang="python" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.python}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">Python script with requests library</div>
                    </div>

                    <div class="code-container" data-lang="nodejs" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.nodejs}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">Node.js script with axios</div>
                    </div>

                    <div class="code-container" data-lang="php" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.php}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">PHP script with cURL</div>
                    </div>

                    <div class="code-container" data-lang="csharp" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.csharp}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">C# with HttpClient</div>
                    </div>

                    <div class="code-container" data-lang="go" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.go}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">Go with net/http</div>
                    </div>
                </div>

                <!-- Copy Button -->
                <div style="margin-top: 12px; flex-shrink: 0;">
                    <button class="copy-code-btn" style="width: 100%; background: var(--accent); color: white; border: none; border-radius: 6px; padding: 10px; font-size: 12px; cursor: pointer; font-weight: 500;">
                        Copy Code
                    </button>
                </div>
            </div>
        `;

        this.showToolModal(modal);

        // Language tab handlers
        const langTabs = modal.querySelectorAll('.lang-tab');
        const codeContainers = modal.querySelectorAll('.code-container');

        langTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetLang = tab.getAttribute('data-lang');

                // Update tab styles
                langTabs.forEach(t => {
                    t.style.background = 'var(--bg-secondary)';
                    t.style.color = 'var(--text-primary)';
                });
                tab.style.background = 'var(--accent)';
                tab.style.color = 'white';

                // Show/hide code containers
                codeContainers.forEach(container => {
                    const containerLang = container.getAttribute('data-lang');
                    container.style.display = containerLang === targetLang ? 'flex' : 'none';
                });
            });
        });

        // Copy code button handler
        const copyBtn = modal.querySelector('.copy-code-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const visibleContainer = modal.querySelector('.code-container:not([style*="display: none"])') || modal.querySelector('.code-container[data-lang="javascript"]');
                const textarea = visibleContainer?.querySelector('.parsing-code-area');

                if (textarea) {
                    textarea.select();
                    document.execCommand('copy');

                    // Show feedback
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✓ Copied!';
                    copyBtn.style.background = 'var(--success)';

                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.background = 'var(--accent)';
                    }, 2000);
                }
            });
        }

        this.bindModalClose(modal);
    };


    /**
     * Render capture details content for modal
     * @param {object} capture - Capture history item
     * @returns {string} HTML content for modal
     */
AwsWafAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        if (!capture || !capture.captureData) {
            return '<div class="advanced-modal-section"><span class="advanced-modal-error">No capture data available</span></div>';
        }

        // Handle nested data structure from AWS WAF interceptor
        const captureData = capture.captureData;
        const data = captureData.data || captureData;
        const flags = captureData.flags || {};
        const url = AdvancedUtils.escapeHtml(data.websiteURL || capture.url || 'N/A');
        const timestamp = new Date(captureData.timestamp || capture.timestamp).toLocaleString();

        return `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Website URL</label>
                <div class="advanced-modal-code-block" style="word-break: break-all;">${url}</div>
            </div>

            ${data.awsChallengeJS || data.awsApiJs || data.awsProblemUrl ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">AWS WAF Scripts</label>
                ${data.awsChallengeJS ? `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Challenge Script</div>
                    <div class="advanced-modal-code-block copy-value" data-copy="${AdvancedUtils.escapeHtml(data.awsChallengeJS)}" data-copy-message="URL copied" style="word-break: break-all;" title="Click to copy">${AdvancedUtils.escapeHtml(data.awsChallengeJS)}</div>
                </div>
                ` : ''}
                ${data.awsApiJs ? `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">API Script (jsapi.js)</div>
                    <div class="advanced-modal-code-block copy-value" data-copy="${AdvancedUtils.escapeHtml(data.awsApiJs)}" data-copy-message="URL copied" style="word-break: break-all;" title="Click to copy">${AdvancedUtils.escapeHtml(data.awsApiJs)}</div>
                </div>
                ` : ''}
                ${data.awsProblemUrl ? `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Problem Endpoint</div>
                    <div class="advanced-modal-code-block copy-value" data-copy="${AdvancedUtils.escapeHtml(data.awsProblemUrl)}" data-copy-message="URL copied" style="word-break: break-all;" title="Click to copy">${AdvancedUtils.escapeHtml(data.awsProblemUrl)}</div>
                </div>
                ` : ''}
            </div>
            ` : ''}

            ${data.awsApiKey ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">API Key</label>
                <div class="advanced-modal-code-block copy-value" data-copy="${AdvancedUtils.escapeHtml(data.awsApiKey)}" data-copy-message="API Key copied" title="Click to copy">${AdvancedUtils.escapeHtml(data.awsApiKey)}</div>
            </div>
            ` : ''}

            ${data.awsExistingToken ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">AWS WAF Token</label>
                <div class="advanced-modal-code-block copy-value" data-copy="${AdvancedUtils.escapeHtml(data.awsExistingToken)}" data-copy-message="Token copied" style="word-break: break-all;" title="Click to copy">${data.awsExistingToken.substring(0, 60)}${data.awsExistingToken.length > 60 ? '...' : ''}</div>
            </div>
            ` : ''}

            ${flags.hasStatus405 || flags.hasChallengeEndpoint || flags.hasProblemEndpoint ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Detection Indicators</label>
                ${flags.hasStatus405 ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">Status 405</span><span class="advanced-modal-info-value">Detected</span></div>' : ''}
                ${flags.hasChallengeEndpoint ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">Challenge Endpoint</span><span class="advanced-modal-info-value">Found</span></div>' : ''}
                ${flags.hasProblemEndpoint ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">Problem Endpoint</span><span class="advanced-modal-info-value">Found</span></div>' : ''}
            </div>
            ` : ''}

            <div class="advanced-modal-section">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Captured</span>
                    <span class="advanced-modal-info-value">${timestamp}</span>
                </div>
            </div>
        `;
    };
