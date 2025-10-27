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
                <button class="recaptcha-tool-btn" id="funcaptchaCheckCookies">
                    <div class="tool-icon-container tool-icon-green">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Check Cookies</div>
                </button>

                <button class="recaptcha-tool-btn" id="funcaptchaAnalyzeScripts">
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
        const checkCookiesBtn = document.querySelector('#funcaptchaCheckCookies');
        const analyzeScriptsBtn = document.querySelector('#funcaptchaAnalyzeScripts');

        if (checkCookiesBtn) checkCookiesBtn.addEventListener('click', () => this.checkCookies());
        if (analyzeScriptsBtn) analyzeScriptsBtn.addEventListener('click', () => this.analyzeScripts());
    }

    async checkCookies() {
        try {
            if (!this.tabInfo || !this.tabInfo.url) throw new Error('Tab information not available');

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            const funcaptchaCookies = cookies.filter(c => c.name.includes('arkose') || c.name.startsWith('_arkose'));

            if (funcaptchaCookies.length > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(funcaptchaCookies.length, funcaptchaCookies.length));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('FunCaptcha'));
            }

            this.displayCookiesModal(funcaptchaCookies);
        } catch (error) {
            console.error('[FunCaptcha] Failed to check cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    }

    displayCookiesModal(cookies) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">FunCaptcha Cookies</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Cookies Found:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${cookies.length}</span>
                    </div>
                </div>

                ${cookies.length > 0 ? cookies.map(cookie => `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="copy-value" data-copy="${cookie.name}" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer;">${cookie.name}</div>
                        </div>
                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cookie.value)}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; cursor: pointer;">${cookie.value.substring(0, 60)}${cookie.value.length > 60 ? '...' : ''}</div>
                    </div>
                `).join('') : `<div style="text-align: center; padding: 32px 16px; opacity: 0.7;"><div style="font-size: 48px; margin-bottom: 12px;">🔍</div><div>No FunCaptcha cookies found</div></div>`}
            </div>
        `;

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
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FunCaptchaAdvanced;
} else if (typeof window !== 'undefined') {
    window.FunCaptchaAdvanced = FunCaptchaAdvanced;
}

console.log('[FunCaptchaAdvanced] Loaded');
