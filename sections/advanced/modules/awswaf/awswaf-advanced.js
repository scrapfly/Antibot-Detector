/**
 * AwsWafAdvanced - AWS WAF Module
 *
 * Extends BaseAdvancedModule for AWS WAF detection and analysis.
 * Includes tools for checking cookies and capturing AWS WAF parameters.
 */

console.log('[AwsWafAdvanced] Loading... Dependencies check:', {
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
        console.log('[AwsWaf] Setting up tool listeners...');

        const checkCookiesBtn = document.querySelector('#awswafCheckCookies');
        const analyzeScriptsBtn = document.querySelector('#awswafAnalyzeScripts');

        if (checkCookiesBtn) {
            checkCookiesBtn.addEventListener('click', () => this.checkCookies());
            console.log('[AwsWaf] Added listener to Check Cookies button');
        }

        if (analyzeScriptsBtn) {
            analyzeScriptsBtn.addEventListener('click', () => this.analyzeScripts());
            console.log('[AwsWaf] Added listener to Analyze Scripts button');
        }
    }

    /**
     * Check AWS WAF cookies without reload
     */
    async checkCookies() {
        console.log('[AwsWaf] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            console.log('[AwsWaf] Total cookies found:', cookies.length);

            const awsWafToken = cookies.find(c => c.name === 'aws-waf-token');
            console.log('[AwsWaf] aws-waf-token found:', !!awsWafToken);

            // Show notification
            if (awsWafToken) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(1, 1));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('AWS WAF'));
            }

            // Display modal with cookie details
            this.displayCookiesModal(awsWafToken);
        } catch (error) {
            console.error('[AwsWaf] Failed to check cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    }

    /**
     * Display cookies in a modal (Akamai-style)
     */
    displayCookiesModal(awsWafToken) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const cookieFound = awsWafToken ? 1 : 0;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">🍪 AWS WAF Cookies</h3>
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
                        <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
                        <div style="font-size: 14px;">No AWS WAF cookies found</div>
                    </div>
                `}

                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <button class="modal-close" style="width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px;">Close</button>
                </div>
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
        console.log('[AwsWaf] ========== ANALYZE SCRIPTS ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            // Setup listener for analysis results (like Shape Security)
            const analysisListener = (message) => {
                if (message.type === 'AWSWAF_ANALYSIS_RESULT') {
                    console.log('[AwsWaf] Analysis result received:', message.data);
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

            console.log('[AwsWaf] Analysis mode response:', response);

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

                        console.log('[AwsWaf] Found aws-waf-token cookies to delete:', cookies.length);

                        // Delete each cookie (may have multiple for different domains/paths)
                        for (const cookie of cookies) {
                            await chrome.cookies.remove({
                                url: this.tabInfo.url,
                                name: cookie.name
                            });
                            console.log('[AwsWaf] Deleted cookie:', cookie.name, 'domain:', cookie.domain);
                        }

                        console.log('[AwsWaf] Cookie deletion complete, reloading page...');
                    } catch (cookieError) {
                        console.error('[AwsWaf] Failed to delete cookies:', cookieError);
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
            console.error('[AwsWaf] Failed to analyze scripts:', error);
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    }

    /**
     * Display script analysis results in modal
     */
    displayAnalysisModal(data) {
        console.log('[AwsWaf] Displaying analysis modal with data:', data);

        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        // Add safety checks for undefined data
        const scripts = data?.scripts || [];
        const challengeScripts = data?.challengeScripts || [];
        const captchaScripts = data?.captchaScripts || [];
        const apiScripts = data?.apiScripts || [];
        const problemUrls = data?.problemUrls || [];

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">🔍 AWS WAF Scripts Analysis</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <!-- Summary Stats -->
                <div style="background: var(--bg-tertiary); border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Total Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${scripts.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Challenge Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${challengeScripts.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Captcha Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${captchaScripts.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">API Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${apiScripts.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Problem URLs:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${problemUrls.length}</span>
                    </div>
                </div>

                ${scripts.length === 0 ? `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
                        <div style="font-size: 14px;">No AWS WAF scripts found</div>
                    </div>
                ` : `
                    <!-- Scripts List -->
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${scripts.map(script => `
                            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <span style="font-size: 12px; color: var(--text-secondary); text-transform: uppercase;">${script.type}</span>
                                </div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url)}" style="font-size: 11px; color: var(--text-primary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s;" title="Click to copy URL">${script.url}</div>
                            </div>
                        `).join('')}
                    </div>
                `}

                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <button class="modal-close" style="width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px;">Close</button>
                </div>
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

        setTimeout(() => modal.style.opacity = '1', 10);
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
                    <div class="advanced-modal-code-block" data-copy="${AdvancedUtils.escapeHtml(data.awsChallengeJS)}" style="cursor: pointer; word-break: break-all;" title="Click to copy" onclick="event.stopPropagation(); AdvancedUtils.copyToClipboard('${AdvancedUtils.escapeHtml(data.awsChallengeJS)}', this, {notificationMessage: 'URL copied'});">${AdvancedUtils.escapeHtml(data.awsChallengeJS)}</div>
                </div>
                ` : ''}
                ${data.awsApiJs ? `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">API Script (jsapi.js)</div>
                    <div class="advanced-modal-code-block" data-copy="${AdvancedUtils.escapeHtml(data.awsApiJs)}" style="cursor: pointer; word-break: break-all;" title="Click to copy" onclick="event.stopPropagation(); AdvancedUtils.copyToClipboard('${AdvancedUtils.escapeHtml(data.awsApiJs)}', this, {notificationMessage: 'URL copied'});">${AdvancedUtils.escapeHtml(data.awsApiJs)}</div>
                </div>
                ` : ''}
                ${data.awsProblemUrl ? `
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Problem Endpoint</div>
                    <div class="advanced-modal-code-block" data-copy="${AdvancedUtils.escapeHtml(data.awsProblemUrl)}" style="cursor: pointer; word-break: break-all;" title="Click to copy" onclick="event.stopPropagation(); AdvancedUtils.copyToClipboard('${AdvancedUtils.escapeHtml(data.awsProblemUrl)}', this, {notificationMessage: 'URL copied'});">${AdvancedUtils.escapeHtml(data.awsProblemUrl)}</div>
                </div>
                ` : ''}
            </div>
            ` : ''}

            ${data.awsApiKey ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">API Key</label>
                <div class="advanced-modal-code-block" data-copy="${AdvancedUtils.escapeHtml(data.awsApiKey)}" style="cursor: pointer;" title="Click to copy" onclick="event.stopPropagation(); AdvancedUtils.copyToClipboard('${AdvancedUtils.escapeHtml(data.awsApiKey)}', this, {notificationMessage: 'API Key copied'});">${AdvancedUtils.escapeHtml(data.awsApiKey)}</div>
            </div>
            ` : ''}

            ${data.awsExistingToken ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">AWS WAF Token</label>
                <div class="advanced-modal-code-block" data-copy="${AdvancedUtils.escapeHtml(data.awsExistingToken)}" style="cursor: pointer; word-break: break-all;" title="Click to copy" onclick="event.stopPropagation(); AdvancedUtils.copyToClipboard('${AdvancedUtils.escapeHtml(data.awsExistingToken)}', this, {notificationMessage: 'Token copied'});">${data.awsExistingToken.substring(0, 60)}${data.awsExistingToken.length > 60 ? '...' : ''}</div>
            </div>
            ` : ''}

            ${flags.hasStatus405 || flags.hasChallengeEndpoint || flags.hasProblemEndpoint ? `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Detection Indicators</label>
                ${flags.hasStatus405 ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">Status 405</span><span class="advanced-modal-info-value">⚠️ Detected</span></div>' : ''}
                ${flags.hasChallengeEndpoint ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">Challenge Endpoint</span><span class="advanced-modal-info-value">✅ Found</span></div>' : ''}
                ${flags.hasProblemEndpoint ? '<div class="advanced-modal-info-row"><span class="advanced-modal-info-label">Problem Endpoint</span><span class="advanced-modal-info-value">✅ Found</span></div>' : ''}
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

console.log('[AwsWaf] Module loaded, class type:', typeof AwsWafAdvanced);
console.log('[AwsWaf] Window.AwsWafAdvanced:', typeof window.AwsWafAdvanced);
