/**
 * FunCaptchaAdvanced - FunCaptcha Module (simplified version)
 */

console.log('[FunCaptchaAdvanced] Loading...');

class FunCaptchaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'funcaptcha');
    }

    async afterCaptureStart(response) {
        if (response && (response.status === 'started' || response.status === 'already_capturing')) {
            await AdvancedUtils.showCaptureStartNotification('FunCaptcha');
        }
    }

    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="funcaptchaAnalyzeScripts">
                    <div class="tool-icon-container tool-icon-blue">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Analyze Scripts</div>
                </button>

                <button class="recaptcha-tool-btn" id="funcaptchaStartCapture">
                    <div class="tool-icon-container tool-icon-red">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <circle cx="12" cy="12" r="8"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Start Capturing</div>
                </button>
            </div>
        `;
    }

    setupToolListeners() {
        const analyzeScriptsBtn = document.querySelector('#funcaptchaAnalyzeScripts');
        const captureBtn = document.querySelector('#funcaptchaStartCapture');

        if (analyzeScriptsBtn) analyzeScriptsBtn.addEventListener('click', () => this.analyzeScripts());
        if (captureBtn) captureBtn.addEventListener('click', () => this.startCapturing());
    }

    async analyzeScripts() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) throw new Error('Tab information not available');

            const analysisListener = (message) => {
                if (message.type === 'FUNCAPTCHA_ANALYSIS_RESULT') {
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            const response = await AdvancedUtils.sendMessage({
                type: 'FUNCAPTCHA_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            if (response && response.status === 'started') {
                NotificationHelper.info('Analyzing FunCaptcha... Page will reload');

                setTimeout(async () => {
                    await AdvancedUtils.sendMessage({
                        type: 'FUNCAPTCHA_SHOW_ANALYZING_NOTIFICATION',
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
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

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

    renderCaptureDetailsContent(capture) {
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

        return `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                    <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 6px;">PUBLIC KEY</div>
                    <div class="copy-value" data-copy="${publicKey}" style="font-family: monospace; font-size: 11px; color: var(--text-primary); word-break: break-all; cursor: pointer; padding: 6px; background: var(--bg-primary); border-radius: 3px; transition: background 0.2s;" title="Click to copy">${publicKey.substring(0, 30)}${publicKey.length > 30 ? '...' : ''}</div>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                    <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 6px;">API DOMAIN</div>
                    <div class="copy-value" data-copy="${apiDomain}" style="font-family: monospace; font-size: 11px; color: var(--text-primary); cursor: pointer; padding: 6px; background: var(--bg-primary); border-radius: 3px; transition: background 0.2s;" title="Click to copy">${apiDomain}</div>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; grid-column: 1 / -1;">
                    <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 6px;">WEBSITE URL</div>
                    <div class="copy-value" data-copy="${websiteUrl}" style="font-family: monospace; font-size: 11px; color: var(--text-primary); word-break: break-all; cursor: pointer; padding: 6px; background: var(--bg-primary); border-radius: 3px; transition: background 0.2s;" title="Click to copy">${websiteUrl}</div>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; grid-column: 1 / -1;">
                    <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 6px;">USER AGENT</div>
                    <div class="copy-value" data-copy="${userAgent}" style="font-family: monospace; font-size: 11px; color: var(--text-primary); word-break: break-all; cursor: pointer; padding: 6px; background: var(--bg-primary); border-radius: 3px; transition: background 0.2s;" title="Click to copy">${userAgent.substring(0, 80)}${userAgent.length > 80 ? '...' : ''}</div>
                </div>

                ${bda ? `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; grid-column: 1 / -1;">
                        <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 6px;">BDA (Browser Data Array)</div>
                        <div class="copy-value" data-copy="${bda}" style="font-family: monospace; font-size: 11px; color: var(--text-primary); word-break: break-all; cursor: pointer; padding: 6px; background: var(--bg-primary); border-radius: 3px; transition: background 0.2s;" title="Click to copy">${bda.substring(0, 100)}${bda.length > 100 ? '...' : ''}</div>
                    </div>
                ` : ''}

                ${isBlobRequired ? `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; grid-column: 1 / -1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                            <span style="color: var(--text-secondary); font-size: 12px;">BLOB DATA</span>
                            <span style="background: linear-gradient(135deg, #F97316 0%, #FB923C 100%); color: white; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 500;">REQUIRED</span>
                        </div>
                        ${blob ? `
                            <div class="copy-value" data-copy="${blob}" style="font-family: monospace; font-size: 11px; color: var(--text-primary); word-break: break-all; cursor: pointer; padding: 6px; background: var(--bg-primary); border-radius: 3px; transition: background 0.2s;" title="Click to copy">${blob.substring(0, 100)}${blob.length > 100 ? '...' : ''}</div>
                        ` : `
                            <div style="color: var(--text-secondary); font-size: 11px; padding: 6px; background: var(--bg-primary); border-radius: 3px;">Not captured</div>
                        `}
                    </div>
                ` : ''}
            </div>
        `;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FunCaptchaAdvanced;
} else if (typeof window !== 'undefined') {
    window.FunCaptchaAdvanced = FunCaptchaAdvanced;
}

console.log('[FunCaptchaAdvanced] Loaded');
