/**
 * GeetestAdvanced - Geetest CAPTCHA Advanced Tools Module
 * Version: 1.0.0 - 2024-10-22
 * Extends BaseAdvancedModule for Geetest V3/V4 detection and parameter extraction
 */

// IMMEDIATE DEBUG - This should appear in console if file loads
Logger.network('%c[GEETEST DEBUG] Script file is loading NOW!', 'color: #ff00ff; font-weight: bold; font-size: 14px;');
Logger.network('[GEETEST DEBUG] BaseAdvancedModule available?', typeof BaseAdvancedModule);

class GeetestAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'geetest');
    }

    /**
     * Override: Show capture start notification with Scrapfly branding
     */
    async afterCaptureStart(response) {
        if (response && (response.status === 'started' || response.status === 'already_capturing')) {
            await AdvancedUtils.showCaptureStartNotification('Geetest');
        }
    }

    /**
     * Render Geetest-specific tools (simplified - 2 buttons only, standardized icons)
     */
    renderTools() {
        return `
            <div class="geetest-tools-grid">
                <button class="geetest-tool-btn" id="geetestVersion">
                    <div class="tool-icon-container tool-icon-purple">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M5.5,7A1.5,1.5 0 0,1 4,5.5A1.5,1.5 0 0,1 5.5,4A1.5,1.5 0 0,1 7,5.5A1.5,1.5 0 0,1 5.5,7M21.41,11.58L12.41,2.58C12.05,2.22 11.55,2 11,2H4C2.89,2 2,2.89 2,4V11C2,11.55 2.22,12.05 2.59,12.41L11.58,21.41C11.95,21.77 12.45,22 13,22C13.55,22 14.05,21.77 14.41,21.41L21.41,14.41C21.77,14.05 22,13.55 22,13C22,12.45 21.77,11.95 21.41,11.58Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Check Version</div>
                </button>

                <button class="geetest-tool-btn" id="geetestAnalyze">
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
     * Setup tool-specific event listeners (2 buttons only)
     */
    setupToolListeners() {
        const actions = [
            { id: 'geetestVersion', method: () => this.checkVersion() },
            { id: 'geetestAnalyze', method: () => this.analyzeScripts() }
        ];

        actions.forEach(({ id, method }) => {
            const btn = document.querySelector(`#${id}`);
            if (btn) {
                btn.addEventListener('click', method);
            }
        });
    }

    /**
     * Check Geetest version (V3 or V4) - simplified, notification only
     */
    async checkVersion() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const response = await this.sendMessage({
                type: 'GEETEST_CHECK_VERSION',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && response.error) {
                NotificationHelper.error('Error: ' + response.error);
                return;
            }

            if (response && response.version) {
                const versionName = response.version === 'v4' ? 'V4' : 'V3';
                NotificationHelper.success(`Detected: Geetest ${versionName}`);
            } else {
                NotificationHelper.warning('No Geetest version detected');
            }
        } catch (error) {
            NotificationHelper.error('Failed to check version: ' + error.message);
        }
    }

    /**
     * Analyze scripts containing Geetest code
     */
    async analyzeScripts() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            NotificationHelper.info(AdvancedUtils.notifications.analyzeScripts.start('Geetest'));

            const response = await this.sendMessage({
                type: 'GEETEST_ANALYZE_SCRIPTS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && response.error) {
                NotificationHelper.error('Error: ' + response.error);
                return;
            }

            if (response && response.scripts && response.scripts.length > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.analyzeScripts.success(response.scripts.length));
                this.displayScriptsModal(response.scripts);
            } else {
                NotificationHelper.warning(AdvancedUtils.notifications.analyzeScripts.none('Geetest'));
            }
        } catch (error) {
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    }

    /**
     * Display analyzed scripts with parsed captchaId, detection source, and Export Code button
     */
    displayScriptsModal(scripts) {
        // Build script items with parsed data
        const scriptItems = scripts.map((script, idx) => {
            const isV4 = script.type === 'v4';
            const mainValue = isV4 ? script.captchaId : script.gt;
            const versionBadge = isV4 ? '<span style="background: var(--success); color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">V4</span>' : '<span style="background: var(--accent); color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">V3</span>';

            // Format source label
            const sourceLabels = {
                'inline-script': 'Inline Script',
                'dom-attribute': 'DOM Attribute',
                'script-url': 'Script URL',
                'json-config': 'JSON Config'
            };
            const sourceLabel = sourceLabels[script.source] || script.source;
            const sourceColor = {
                'inline-script': '#3b82f6',
                'dom-attribute': '#10b981',
                'script-url': '#f59e0b',
                'json-config': '#8b5cf6'
            }[script.source] || '#667eea';

            return `
                <div style="background: var(--bg-tertiary); border-radius: 8px; padding: 16px; margin-bottom: 12px; border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="color: var(--text-secondary); font-size: 12px; font-weight: 600;">Script ${idx + 1}</div>
                        ${versionBadge}
                    </div>

                    <div style="margin-bottom: 12px; padding: 8px; background: var(--bg-primary); border-radius: 4px; border-left: 3px solid ${sourceColor};">
                        <span style="color: var(--text-secondary); font-size: 11px; font-weight: 500;">Source: </span>
                        <span style="color: ${sourceColor}; font-size: 11px; font-weight: 600;">${sourceLabel}</span>
                        ${script.element ? ` <span style="color: var(--text-secondary); font-size: 10px;">(&lt;${script.element}&gt;)</span>` : ''}
                        ${script.url ? `<div style="margin-top: 4px; font-size: 10px; color: var(--text-secondary); word-break: break-all;">${AdvancedUtils.escapeHtml(script.url)}</div>` : ''}
                    </div>

                    ${isV4 ? `
                        <div style="margin-bottom: 12px;">
                            <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 6px; font-weight: 600; text-transform: uppercase;">Extracted captchaId</div>
                            <div class="clickable-copy-value" data-copy="${script.captchaId}" style="background: var(--bg-primary); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 12px; color: var(--success); cursor: pointer; word-break: break-all; border: 1px solid var(--border); transition: all 0.2s;" title="Click to copy captchaId">
                                ${script.captchaId}
                            </div>
                            ${script.product ? `<div style="margin-top: 8px; color: var(--text-secondary); font-size: 11px;">Product: <span style="color: var(--text-primary); font-weight: 500;">${script.product}</span></div>` : ''}
                        </div>
                    ` : `
                        <div style="margin-bottom: 12px;">
                            ${script.gt ? `
                                <div style="margin-bottom: 8px;">
                                    <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px; font-weight: 600;">gt</div>
                                    <div class="clickable-copy-value" data-copy="${script.gt}" style="background: var(--bg-primary); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 11px; color: var(--accent); cursor: pointer; word-break: break-all;" title="Click to copy">
                                        ${script.gt}
                                    </div>
                                </div>
                            ` : ''}
                            ${script.challenge ? `
                                <div>
                                    <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 4px; font-weight: 600;">challenge</div>
                                    <div class="clickable-copy-value" data-copy="${script.challenge}" style="background: var(--bg-primary); padding: 8px; border-radius: 4px; font-family: monospace; font-size: 11px; color: var(--accent); cursor: pointer; word-break: break-all;" title="Click to copy">
                                        ${script.challenge}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `}

                    <div style="margin-top: 12px;">
                        <div style="color: var(--text-secondary); font-size: 11px; margin-bottom: 6px; font-weight: 600;">Script Snippet</div>
                        <div style="background: var(--bg-primary); border-radius: 4px; padding: 10px; font-family: monospace; font-size: 10px; color: var(--text-primary); max-height: 120px; overflow-y: auto; word-break: break-all; white-space: pre-wrap; border: 1px solid var(--border);">
${AdvancedUtils.escapeHtml(script.snippet)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const modal = document.createElement('div');
        modal.className = 'advanced-modal-overlay';
        modal.innerHTML = `
            <div class="advanced-modal-container" style="max-width: 600px;">
                <div style="flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">🟣 Geetest Scripts (${scripts.length})</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>
                <div style="flex: 1; overflow-y: auto; padding-right: 8px;">
                    ${scriptItems}

                    <button class="export-code-btn" style="width: 100%; padding: 12px; background: var(--accent); color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M10,19L12,15H9V10H15V15L13,19H10Z"/>
                        </svg>
                        Export Parsing Code
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);

        // Close handlers
        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 200);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.body.contains(modal)) {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 200);
            }
        });

        // Click-to-copy functionality
        modal.querySelectorAll('.clickable-copy-value').forEach(el => {
            el.addEventListener('click', () => {
                const text = el.getAttribute('data-copy');
                AdvancedUtils.copyToClipboard(text);
                const originalBg = el.style.background;
                const originalColor = el.style.color;
                el.style.background = 'var(--success)';
                el.style.color = 'white';
                setTimeout(() => {
                    el.style.background = originalBg;
                    el.style.color = originalColor;
                }, 1500);
            });

            // Hover effect
            el.addEventListener('mouseenter', () => {
                el.style.background = 'rgba(255, 255, 255, 0.08)';
                el.style.borderColor = 'var(--accent)';
            });
            el.addEventListener('mouseleave', () => {
                el.style.background = 'var(--bg-primary)';
                el.style.borderColor = 'var(--border)';
            });
        });

        // Export Code button
        const exportBtn = modal.querySelector('.export-code-btn');
        exportBtn.addEventListener('click', () => {
            this.exportParsingCode(scripts);
        });

        // Hover effect for export button
        exportBtn.addEventListener('mouseenter', () => {
            exportBtn.style.background = 'var(--accent-hover)';
            exportBtn.style.transform = 'translateY(-2px)';
        });
        exportBtn.addEventListener('mouseleave', () => {
            exportBtn.style.background = 'var(--accent)';
            exportBtn.style.transform = 'translateY(0)';
        });
    }

    /**
     * Export parsing code for captchaId extraction
     */
    exportParsingCode(scripts) {
        const isV4 = scripts.some(s => s.type === 'v4');

        const parsingCode = isV4 ? `// Geetest V4 - Extract captchaId from script
// Search for initGeetest4 call and extract captchaId parameter

const scriptContent = document.documentElement.outerHTML; // or fetch script content

// Match initGeetest4 config object
const initGeetest4Regex = /initGeetest4\\s*\\(\\s*(\\{[\\s\\S]*?\\})\\s*,/;
const match = scriptContent.match(initGeetest4Regex);

if (match) {
    const configText = match[1];

    // Extract captchaId
    const captchaIdMatch = configText.match(/captchaId\\s*:\\s*["']([^"']+)["']/);
    const captchaId = captchaIdMatch ? captchaIdMatch[1] : null;

    // Extract product (optional)
    const productMatch = configText.match(/product\\s*:\\s*["']([^"']+)["']/);
    const product = productMatch ? productMatch[1] : null;

    Logger.network('Geetest V4 captchaId:', captchaId);
    Logger.network('Product:', product);
} else {
    Logger.network('No Geetest V4 found');
}` : `// Geetest V3 - Extract gt and challenge from script
// Search for initGeetest call and extract parameters

const scriptContent = document.documentElement.outerHTML; // or fetch script content

// Match initGeetest config object
const initGeetestRegex = /initGeetest\\s*\\(\\s*(\\{[\\s\\S]*?\\})\\s*,/;
const match = scriptContent.match(initGeetestRegex);

if (match) {
    const configText = match[1];

    // Extract gt
    const gtMatch = configText.match(/gt\\s*:\\s*["']([^"']+)["']/);
    const gt = gtMatch ? gtMatch[1] : null;

    // Extract challenge
    const challengeMatch = configText.match(/challenge\\s*:\\s*["']([^"']+)["']/);
    const challenge = challengeMatch ? challengeMatch[1] : null;

    Logger.network('Geetest V3 gt:', gt);
    Logger.network('Geetest V3 challenge:', challenge);
} else {
    Logger.network('No Geetest V3 found');
}`;

        // Copy to clipboard
        AdvancedUtils.copyToClipboard(parsingCode);
        NotificationHelper.success('Parsing code copied to clipboard!');
    }
}

// Export to window object (required for advanced.js to find the class)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GeetestAdvanced;
} else if (typeof window !== 'undefined') {
    window.GeetestAdvanced = GeetestAdvanced;
    Logger.network('[GeetestAdvanced] ✓ Loaded and exported to window.GeetestAdvanced');
}
