/**
 * AwsWafAdvanced - AWS WAF Module
 *
 * Extends BaseAdvancedModule for AWS WAF detection and analysis.
 * Includes tools for checking cookies and capturing AWS WAF parameters.
 */

Logger.network('[AwsWafAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    AdvancedUtils: typeof AdvancedUtils
});

class AwsWafAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'awswaf');
        // Analysis results are received via message only (no storage fallback)
    }

    /**
     * Override: Show capture start notification with Scrapfly branding
     */
    async afterCaptureStart(response) {
        if (response && (response.status === 'started' || response.status === 'already_capturing')) {
            await AdvancedUtils.showCaptureStartNotification('AWS WAF');
        }
    }

    /**
     * Render AWS WAF-specific tools
     */
    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="awswafCheckCookies">
                    <div class="tool-icon-container tool-icon-green">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Check Cookies</div>
                </button>

                <button class="recaptcha-tool-btn" id="awswafAnalyzeScripts">
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

    /**
     * Setup tool-specific event listeners
     */
    setupToolListeners() {
        Logger.network('[AwsWaf] Setting up tool listeners...');

        const checkCookiesBtn = document.querySelector('#awswafCheckCookies');
        const analyzeScriptsBtn = document.querySelector('#awswafAnalyzeScripts');

        if (checkCookiesBtn) {
            checkCookiesBtn.addEventListener('click', () => this.checkCookies());
            Logger.network('[AwsWaf] Added listener to Check Cookies button');
        }

        if (analyzeScriptsBtn) {
            analyzeScriptsBtn.addEventListener('click', () => this.analyzeScripts());
            Logger.network('[AwsWaf] Added listener to Analyze Scripts button');
        }
    }

    /**
     * Check AWS WAF cookies without reload
     */
    async checkCookies() {
        Logger.network('[AwsWaf] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            Logger.network('[AwsWaf] Total cookies found:', cookies.length);

            const awsWafToken = cookies.find(c => c.name === 'aws-waf-token');
            Logger.network('[AwsWaf] aws-waf-token found:', !!awsWafToken);

            // Show notification
            if (awsWafToken) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(1, 1));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('AWS WAF'));
            }

            // Display modal with cookie details
            this.displayCookiesModal(awsWafToken);
        } catch (error) {
            Logger.error('NETWORK', '[AwsWaf] Failed to check cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    }

    /**
     * Display cookies in a modal (Akamai-style)
     */
    displayCookiesModal(awsWafToken) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const cookieFound = awsWafToken ? 1 : 0;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">AWS WAF Cookies</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Cookies Found:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${cookieFound}/1</span>
                    </div>
                </div>

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

        document.body.appendChild(modal);

        // Add click-to-copy functionality
        modal.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });

            element.addEventListener('click', (e) => {
                e.stopPropagation();
                const textToCopy = element.getAttribute('data-copy');
                if (!textToCopy) {
                    return;
                }
                AdvancedUtils.copyToClipboard(textToCopy, element, {
                    notificationMessage: 'Value copied'
                });
            });
        });

        modal.querySelectorAll('.advanced-modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    /**
     * Analyze AWS WAF scripts on the page (Shape Security + Akamai pattern)
     * Deletes aws-waf-token cookie, reloads page, then analyzes scripts
     */
    async analyzeScripts() {
        Logger.network('[AwsWaf] ========== ANALYZE SCRIPTS ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            // Setup listener for analysis results (like Shape Security)
            const analysisListener = (message) => {
                if (message.type === 'AWSWAF_ANALYSIS_RESULT') {
                    Logger.network('[AwsWaf] Analysis result received:', message.data);
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            // Send message to background to start analysis mode (sets up webNavigation listener)
            const response = await AdvancedUtils.sendMessage({
                type: 'AWSWAF_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            Logger.network('[AwsWaf] Analysis mode response:', response);

            if (response && response.status === 'started') {
                // Show notification about cookie deletion and reload
                NotificationHelper.info('Deleting aws-waf-token cookie... Page will reload');

                // Delete aws-waf-token cookie before reload to trigger challenge/captcha scripts (like Akamai)
                setTimeout(async () => {
                    try {
                        // Get all aws-waf-token cookies for this URL
                        const cookies = await chrome.cookies.getAll({
                            url: this.tabInfo.url,
                            name: 'aws-waf-token'
                        });

                        Logger.network('[AwsWaf] Found aws-waf-token cookies to delete:', cookies.length);

                        // Delete each cookie (may have multiple for different domains/paths)
                        for (const cookie of cookies) {
                            await chrome.cookies.remove({
                                url: this.tabInfo.url,
                                name: cookie.name
                            });
                            Logger.network('[AwsWaf] Deleted cookie:', cookie.name, 'domain:', cookie.domain);
                        }

                        Logger.network('[AwsWaf] Cookie deletion complete, reloading page...');

                        // Send message to show analyzing notification right before reload
                        await AdvancedUtils.sendMessage({
                            type: 'AWSWAF_SHOW_ANALYZING_NOTIFICATION',
                            tabId: this.tabInfo.id
                        });

                    } catch (cookieError) {
                        Logger.error('NETWORK', '[AwsWaf] Failed to delete cookies:', cookieError);
                    }

                    // Reload page to trigger challenge.js or captcha.js
                    // Background's webNavigation listener will capture scripts after reload
                    await chrome.tabs.reload(this.tabInfo.id);
                }, 500);
            } else {
                chrome.runtime.onMessage.removeListener(analysisListener);
                NotificationHelper.error('Failed to start analysis');
            }
        } catch (error) {
            Logger.error('NETWORK', '[AwsWaf] Failed to analyze scripts:', error);
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    }

    /**
     * Display script analysis results in modal (simplified - only challenge.js and captcha.js)
     */
    displayAnalysisModal(data) {
        Logger.network('[AwsWaf] Displaying analysis modal with data:', data);

        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

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

        document.body.appendChild(modal);

        // Add click-to-copy functionality
        modal.querySelectorAll('.copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.1)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });

            element.addEventListener('click', (e) => {
                e.stopPropagation();
                const textToCopy = element.getAttribute('data-copy');
                if (!textToCopy) {
                    return;
                }
                AdvancedUtils.copyToClipboard(textToCopy, element, {
                    notificationMessage: 'Value copied'
                });
            });
        });

        // Event handlers
        modal.querySelectorAll('.advanced-modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Export Code button handler
        const exportBtn = modal.querySelector('.modal-export-code-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.displayExportCodeModal(scripts);
            });
        }

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    /**
     * Display export code modal with multi-language code generation
     * @param {Array} scripts - Array of script objects with url and type
     */
    displayExportCodeModal(scripts) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10001; opacity: 0; transition: opacity 0.2s;';

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

        document.body.appendChild(modal);

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

        // Close handlers
        modal.querySelector('.advanced-modal-close-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    /**
     * Generate AWS WAF script fetching code for multiple languages
     * @param {Array} scripts - Array of script objects with url and type
     * @returns {Object} Code snippets for each language
     */
    generateAwsWafParsingCode(scripts) {
        // Organize scripts by type
        const challengeScripts = scripts.filter(s => s.type === 'challenge').map(s => s.url);
        const captchaScripts = scripts.filter(s => s.type === 'captcha').map(s => s.url);
        const awswafScripts = scripts.filter(s => s.type === 'awswaf').map(s => s.url);

        const allUrls = scripts.map(s => s.url);

        return {
            javascript: `// AWS WAF Script Fetcher - JavaScript
// Fetch all AWS WAF scripts: ${scripts.length} total

async function fetchAwsWafScripts() {
    const urls = ${JSON.stringify(allUrls, null, 4)};

    const results = [];

    for (const url of urls) {
        try {
            const response = await fetch(url);
            const content = await response.text();

            results.push({
                url: url,
                success: true,
                content: content,
                size: content.length
            });

            Logger.network(\`✓ Fetched: \${url}\`);
        } catch (error) {
            results.push({
                url: url,
                success: false,
                error: error.message
            });

            Logger.error('NETWORK', \`✗ Failed: \${url}\`, error);
        }
    }

    return results;
}

// Execute and display results
fetchAwsWafScripts().then(results => {
    Logger.network('=== AWS WAF Scripts Fetched ===');
    Logger.network(\`Total: \${results.length}\`);
    Logger.network(\`Success: \${results.filter(r => r.success).length}\`);
    Logger.network(\`Failed: \${results.filter(r => !r.success).length}\`);
    Logger.network('Results:', results);
});`,

            python: `# AWS WAF Script Fetcher - Python
# Fetch all AWS WAF scripts: ${scripts.length} total

import requests

def fetch_awswaf_scripts():
    urls = ${JSON.stringify(allUrls, null, 4)}

    results = []

    for url in urls:
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()

            results.append({
                'url': url,
                'success': True,
                'content': response.text,
                'size': len(response.text),
                'status_code': response.status_code
            })

            print(f"✓ Fetched: {url}")
        except Exception as error:
            results.append({
                'url': url,
                'success': False,
                'error': str(error)
            })

            print(f"✗ Failed: {url} - {error}")

    return results

if __name__ == '__main__':
    results = fetch_awswaf_scripts()

    print('\\n=== AWS WAF Scripts Fetched ===')
    print(f'Total: {len(results)}')
    print(f'Success: {len([r for r in results if r["success"]])}')
    print(f'Failed: {len([r for r in results if not r["success"]])}')`,

            nodejs: `// AWS WAF Script Fetcher - Node.js
// Fetch all AWS WAF scripts: ${scripts.length} total

const axios = require('axios');

async function fetchAwsWafScripts() {
    const urls = ${JSON.stringify(allUrls, null, 4)};

    const results = [];

    for (const url of urls) {
        try {
            const response = await axios.get(url, { timeout: 10000 });

            results.push({
                url: url,
                success: true,
                content: response.data,
                size: response.data.length,
                statusCode: response.status
            });

            Logger.network(\`✓ Fetched: \${url}\`);
        } catch (error) {
            results.push({
                url: url,
                success: false,
                error: error.message
            });

            Logger.error('NETWORK', \`✗ Failed: \${url}\`, error.message);
        }
    }

    return results;
}

// Execute and display results
fetchAwsWafScripts().then(results => {
    Logger.network('\\n=== AWS WAF Scripts Fetched ===');
    Logger.network(\`Total: \${results.length}\`);
    Logger.network(\`Success: \${results.filter(r => r.success).length}\`);
    Logger.network(\`Failed: \${results.filter(r => !r.success).length}\`);
}).catch(console.error);`,

            php: `<?php
// AWS WAF Script Fetcher - PHP
// Fetch all AWS WAF scripts: ${scripts.length} total

function fetch_awswaf_scripts() {
    $urls = ${JSON.stringify(allUrls, null, 4)};

    $results = [];

    foreach ($urls as $url) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

        $content = curl_exec($ch);
        $error = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        curl_close($ch);

        if ($content !== false && $httpCode === 200) {
            $results[] = [
                'url' => $url,
                'success' => true,
                'content' => $content,
                'size' => strlen($content),
                'status_code' => $httpCode
            ];

            echo "✓ Fetched: $url\\n";
        } else {
            $results[] = [
                'url' => $url,
                'success' => false,
                'error' => $error ?: "HTTP $httpCode"
            ];

            echo "✗ Failed: $url - " . ($error ?: "HTTP $httpCode") . "\\n";
        }
    }

    return $results;
}

$results = fetch_awswaf_scripts();

echo "\\n=== AWS WAF Scripts Fetched ===\\n";
echo "Total: " . count($results) . "\\n";
echo "Success: " . count(array_filter($results, fn($r) => $r['success'])) . "\\n";
echo "Failed: " . count(array_filter($results, fn($r) => !$r['success'])) . "\\n";
?>`,

            csharp: `// AWS WAF Script Fetcher - C#
// Fetch all AWS WAF scripts: ${scripts.length} total

using System;
using System.Net.Http;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;

class AwsWafScriptFetcher
{
    private static readonly HttpClient client = new HttpClient();

    static async Task Main(string[] args)
    {
        var urls = new List<string> ${JSON.stringify(allUrls, null, 12).replace(/"/g, '"')};

        var results = await FetchAwsWafScripts(urls);

        Console.WriteLine("\\n=== AWS WAF Scripts Fetched ===");
        Console.WriteLine($"Total: {results.Count}");
        Console.WriteLine($"Success: {results.Count(r => r.Success)}");
        Console.WriteLine($"Failed: {results.Count(r => !r.Success)}");
    }

    static async Task<List<ScriptResult>> FetchAwsWafScripts(List<string> urls)
    {
        var results = new List<ScriptResult>();

        foreach (var url in urls)
        {
            try
            {
                var response = await client.GetAsync(url);
                var content = await response.Content.ReadAsStringAsync();

                results.Add(new ScriptResult
                {
                    Url = url,
                    Success = true,
                    Content = content,
                    Size = content.Length,
                    StatusCode = (int)response.StatusCode
                });

                Console.WriteLine($"✓ Fetched: {url}");
            }
            catch (Exception ex)
            {
                results.Add(new ScriptResult
                {
                    Url = url,
                    Success = false,
                    Error = ex.Message
                });

                Console.WriteLine($"✗ Failed: {url} - {ex.Message}");
            }
        }

        return results;
    }
}

class ScriptResult
{
    public string Url { get; set; }
    public bool Success { get; set; }
    public string Content { get; set; }
    public int Size { get; set; }
    public int StatusCode { get; set; }
    public string Error { get; set; }
}`,

            go: `// AWS WAF Script Fetcher - Go
// Fetch all AWS WAF scripts: ${scripts.length} total

package main

import (
    "fmt"
    "io/ioutil"
    "net/http"
    "time"
)

type ScriptResult struct {
    URL        string
    Success    bool
    Content    string
    Size       int
    StatusCode int
    Error      string
}

func fetchAwsWafScripts() []ScriptResult {
    urls := []string${JSON.stringify(allUrls, null, 8)}

    client := &http.Client{
        Timeout: 10 * time.Second,
    }

    var results []ScriptResult

    for _, url := range urls {
        resp, err := client.Get(url)

        if err != nil {
            results = append(results, ScriptResult{
                URL:     url,
                Success: false,
                Error:   err.Error(),
            })
            fmt.Printf("✗ Failed: %s - %s\\n", url, err.Error())
            continue
        }

        defer resp.Body.Close()
        body, err := ioutil.ReadAll(resp.Body)

        if err != nil {
            results = append(results, ScriptResult{
                URL:     url,
                Success: false,
                Error:   err.Error(),
            })
            fmt.Printf("✗ Failed: %s - %s\\n", url, err.Error())
            continue
        }

        results = append(results, ScriptResult{
            URL:        url,
            Success:    true,
            Content:    string(body),
            Size:       len(body),
            StatusCode: resp.StatusCode,
        })

        fmt.Printf("✓ Fetched: %s\\n", url)
    }

    return results
}

func main() {
    results := fetchAwsWafScripts()

    successCount := 0
    for _, r := range results {
        if r.Success {
            successCount++
        }
    }

    fmt.Println("\\n=== AWS WAF Scripts Fetched ===")
    fmt.Printf("Total: %d\\n", len(results))
    fmt.Printf("Success: %d\\n", successCount)
    fmt.Printf("Failed: %d\\n", len(results)-successCount)
}`
        };
    }

    /**
     * Render capture details content for modal
     * @param {object} capture - Capture history item
     * @returns {string} HTML content for modal
     */
    renderCaptureDetailsContent(capture) {
        if (!capture || !capture.captureData) {
            return '<div class="advanced-modal-section"><span class="advanced-modal-error">No capture data available</span></div>';
        }

        // Handle nested data structure from AWS WAF interceptor
        const captureData = capture.captureData;
        const data = captureData.data || captureData;
        const flags = captureData.flags || {};
        const url = (data.websiteURL || capture.url || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    }
}

// Explicitly add to window to ensure it's available
window.AwsWafAdvanced = AwsWafAdvanced;

Logger.network('[AwsWaf] Module loaded, class type:', typeof AwsWafAdvanced);
Logger.network('[AwsWaf] Window.AwsWafAdvanced:', typeof window.AwsWafAdvanced);
