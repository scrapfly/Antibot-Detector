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
    }

    /**
     * Render AWS WAF-specific tools
     */
    renderTools() {
        return `
            <div class="awswaf-tools-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                <button class="awswaf-tool-btn" id="awswafCheckCookies" style="display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                    <div class="tool-btn-icon" style="font-size: 32px;">🍪</div>
                    <div class="tool-btn-label" style="font-size: 13px; color: var(--text-primary); font-weight: 500;">Check Cookies</div>
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

        if (checkCookiesBtn) {
            checkCookiesBtn.addEventListener('click', () => this.checkCookies());
            console.log('[AwsWaf] Added listener to Check Cookies button');
        }
    }

    /**
     * Check if there are pending analysis results to display
     */
    async checkPendingAnalysisResults() {
        try {
            const result = await chrome.storage.local.get('scrapfly_awswaf_analysis_pending');
            if (result.scrapfly_awswaf_analysis_pending) {
                const pending = result.scrapfly_awswaf_analysis_pending;

                // Check if results are for current tab and not too old (5 minutes)
                const isCurrentTab = pending.tabId === this.tabInfo.id;
                const age = Date.now() - pending.timestamp;
                const isRecent = age < 5 * 60 * 1000; // 5 minutes

                if (isCurrentTab && isRecent) {
                    console.log('[AwsWaf] Found pending analysis results, displaying modal...');
                    this.displayAnalysisModal(pending.data);

                    // Clear the pending results
                    await chrome.storage.local.remove('scrapfly_awswaf_analysis_pending');
                }
            }
        } catch (error) {
            console.error('[AwsWaf] Error checking pending results:', error);
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
                    <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 0; width: 24px; height: 24px;">×</button>
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

            element.addEventListener('click', async (e) => {
                e.stopPropagation();
                const textToCopy = element.getAttribute('data-copy');
                const originalText = element.textContent;

                try {
                    await navigator.clipboard.writeText(textToCopy);
                    element.textContent = '✓ Copied!';
                    element.style.background = 'var(--success)';
                    element.style.color = 'white';

                    setTimeout(() => {
                        element.textContent = originalText;
                        element.style.background = '';
                        element.style.color = '';
                    }, 1500);
                } catch (error) {
                    console.error('[AwsWaf] Copy failed:', error);
                    NotificationHelper.error('Failed to copy to clipboard');
                }
            });
        });

        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    /**
     * Analyze AWS WAF scripts on the page (with reload to capture network requests)
     */
    async analyzeScripts() {
        console.log('[AwsWaf] ========== ANALYZE SCRIPTS ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            // Set up listener for analysis results
            const analysisListener = (message) => {
                if (message.type === 'AWSWAF_ANALYSIS_RESULT') {
                    console.log('[AwsWaf] Analysis result received:', message.data);
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            // Send message to background to start analysis
            const response = await AdvancedUtils.sendMessage({
                type: 'AWSWAF_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && response.status === 'started') {
                NotificationHelper.info('Starting AWS WAF analysis... Page will reload');

                // Reload page after a short delay
                setTimeout(async () => {
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
        const apiScripts = data?.apiScripts || [];
        const problemUrls = data?.problemUrls || [];

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">🔍 AWS WAF Scripts Analysis</h3>
                    <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 0; width: 24px; height: 24px;">×</button>
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

            element.addEventListener('click', async (e) => {
                e.stopPropagation();
                const textToCopy = element.getAttribute('data-copy');
                const originalText = element.textContent;

                try {
                    await navigator.clipboard.writeText(textToCopy);
                    element.textContent = '✓ Copied!';
                    element.style.background = 'var(--success)';
                    element.style.color = 'white';

                    setTimeout(() => {
                        element.textContent = originalText;
                        element.style.background = '';
                        element.style.color = '';
                    }, 1500);
                } catch (error) {
                    console.error('[AwsWaf] Copy failed:', error);
                    NotificationHelper.error('Failed to copy to clipboard');
                }
            });
        });

        // Event handlers
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }
}

// Explicitly add to window to ensure it's available
window.AwsWafAdvanced = AwsWafAdvanced;

console.log('[AwsWaf] Module loaded, class type:', typeof AwsWafAdvanced);
console.log('[AwsWaf] Window.AwsWafAdvanced:', typeof window.AwsWafAdvanced);
