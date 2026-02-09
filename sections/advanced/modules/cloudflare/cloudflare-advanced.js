/**
 * CloudflareAdvanced - Cloudflare Bot Management Module
 *
 * Extends BaseAdvancedModule for Cloudflare detection and analysis.
 * Includes tools for checking cookies and capturing Cloudflare challenge scripts.
 */

Logger.network('[CloudflareAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    AdvancedUtils: typeof AdvancedUtils
});

class CloudflareAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'cloudflare');
    }

    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="cloudflareCheckVersion">
                    <div class="tool-icon-container tool-icon-purple">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12.5,7H11V13L16.2,16.2L17.2,15.2L12.5,12.2V7Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Check Version</div>
                </button>

                <button class="recaptcha-tool-btn" id="cloudflareCheckCookies">
                    <div class="tool-icon-container tool-icon-green">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Check Cookies</div>
                </button>

                <button class="recaptcha-tool-btn" id="cloudflareExtractSiteKey">
                    <div class="tool-icon-container tool-icon-green">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3M12,17A2,2 0 0,0 10,19A2,2 0 0,0 12,21A2,2 0 0,0 14,19A2,2 0 0,0 12,17Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Extract Site Key</div>
                </button>

                <button class="recaptcha-tool-btn" id="cloudflareAnalyzeScripts">
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
        Logger.network('[Cloudflare] Setting up tool listeners...');

        const checkVersionBtn = document.querySelector('#cloudflareCheckVersion');
        const checkCookiesBtn = document.querySelector('#cloudflareCheckCookies');
        const extractSiteKeyBtn = document.querySelector('#cloudflareExtractSiteKey');
        const analyzeScriptsBtn = document.querySelector('#cloudflareAnalyzeScripts');

        if (checkVersionBtn) {
            checkVersionBtn.addEventListener('click', () => this.checkVersion());
            Logger.network('[Cloudflare] Added listener to Check Version button');
        }

        if (checkCookiesBtn) {
            checkCookiesBtn.addEventListener('click', () => this.checkCookies());
            Logger.network('[Cloudflare] Added listener to Check Cookies button');
        }

        if (extractSiteKeyBtn) {
            extractSiteKeyBtn.addEventListener('click', () => this.extractSiteKey());
            Logger.network('[Cloudflare] Added listener to Extract Site Key button');
        }

        if (analyzeScriptsBtn) {
            analyzeScriptsBtn.addEventListener('click', () => this.analyzeScripts());
            Logger.network('[Cloudflare] Added listener to Analyze Scripts button');
        }
    }

    async checkCookies() {
        Logger.network('[Cloudflare] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            const cfUnderscoreBmCookie = cookies.find(c => c.name === '__cf_bm');
            const cfBmCookie = cookies.find(c => c.name === 'cf_bm');
            const cfClearanceCookie = cookies.find(c => c.name === 'cf_clearance');
            const cfuvIdCookie = cookies.find(c => c.name === '_cfuvid');

            const foundCookies = [cfUnderscoreBmCookie, cfBmCookie, cfClearanceCookie, cfuvIdCookie].filter(Boolean).length;
            const totalCookies = 4;

            if (foundCookies > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(foundCookies, totalCookies));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Cloudflare'));
            }

            this.displayCookiesModal(cfUnderscoreBmCookie, cfBmCookie, cfClearanceCookie, cfuvIdCookie);
        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to check cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    }

    displayCookiesModal(cfUnderscoreBmCookie, cfBmCookie, cfClearanceCookie, cfuvIdCookie) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const foundCount = [cfUnderscoreBmCookie, cfBmCookie, cfClearanceCookie, cfuvIdCookie].filter(Boolean).length;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Cloudflare Cookies</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Cookies Found:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${foundCount}/4</span>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${cfUnderscoreBmCookie ? `
                        <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div class="copy-value" data-copy="__cf_bm" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">__cf_bm</div>
                                <div style="display: flex; gap: 6px;">
                                    ${cfUnderscoreBmCookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                    ${cfUnderscoreBmCookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                                </div>
                            </div>
                            <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cfUnderscoreBmCookie.value)}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy">${cfUnderscoreBmCookie.value.substring(0, 60)}${cfUnderscoreBmCookie.value.length > 60 ? '...' : ''}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">Domain: ${cfUnderscoreBmCookie.domain}</div>
                        </div>
                    ` : ''}

                    ${cfBmCookie ? `
                        <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div class="copy-value" data-copy="cf_bm" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">cf_bm</div>
                                <div style="display: flex; gap: 6px;">
                                    ${cfBmCookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                    ${cfBmCookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                                </div>
                            </div>
                            <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cfBmCookie.value)}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy">${cfBmCookie.value.substring(0, 60)}${cfBmCookie.value.length > 60 ? '...' : ''}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">Domain: ${cfBmCookie.domain}</div>
                        </div>
                    ` : ''}

                    ${cfClearanceCookie ? `
                        <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div class="copy-value" data-copy="cf_clearance" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">cf_clearance</div>
                                <div style="display: flex; gap: 6px;">
                                    ${cfClearanceCookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                    ${cfClearanceCookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                                </div>
                            </div>
                            <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cfClearanceCookie.value)}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy">${cfClearanceCookie.value.substring(0, 60)}${cfClearanceCookie.value.length > 60 ? '...' : ''}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">Domain: ${cfClearanceCookie.domain}</div>
                        </div>
                    ` : ''}

                    ${cfuvIdCookie ? `
                        <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div class="copy-value" data-copy="_cfuvid" style="font-weight: 500; color: var(--text-primary); font-family: monospace; cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">_cfuvid</div>
                                <div style="display: flex; gap: 6px;">
                                    ${cfuvIdCookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                    ${cfuvIdCookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                                </div>
                            </div>
                            <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(cfuvIdCookie.value)}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="Click to copy">${cfuvIdCookie.value.substring(0, 60)}${cfuvIdCookie.value.length > 60 ? '...' : ''}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">Domain: ${cfuvIdCookie.domain}</div>
                        </div>
                    ` : ''}

                    ${foundCount === 0 ? `
                        <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                            <div style="font-size: 48px; margin-bottom: 12px;"></div>
                            <div style="font-size: 14px;">No Cloudflare cookies found</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const copyValues = modal.querySelectorAll('.copy-value');
        copyValues.forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = el.getAttribute('data-copy');
                AdvancedUtils.copyToClipboard(text, el, { notificationMessage: 'Copied' });
            });
        });

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    async checkVersion() {
        Logger.network('[Cloudflare] ========== CHECK VERSION ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            // Show popup notification
            NotificationHelper.info('Checking Cloudflare version... Page will reload');

            // Send page notification before reload
            await AdvancedUtils.sendMessage({
                type: 'CLOUDFLARE_SHOW_ANALYZING_NOTIFICATION',
                tabId: this.tabInfo.id
            });

            // Reload page to trigger fresh Cloudflare analysis
            await chrome.tabs.reload(this.tabInfo.id);

        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to check version:', error);
            NotificationHelper.error('Failed to check version: ' + error.message);
        }
    }

    async extractSiteKey() {
        Logger.network('[Cloudflare] ========== EXTRACT SITE KEY ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                world: 'MAIN',
                func: () => {
                    const extractors = [
                        // Check window.turnstile for Turnstile sitekey
                        () => {
                            if (window.turnstile && typeof window.turnstile.render === 'function') {
                                // Try to get sitekey from data attributes
                                const elem = document.querySelector('[data-sitekey]');
                                if (elem) {
                                    return { sitekey: elem.getAttribute('data-sitekey'), type: 'Turnstile' };
                                }
                            }
                            return null;
                        },
                        // Check for data-sitekey attribute
                        () => {
                            const elem = document.querySelector('[data-sitekey]');
                            if (elem) {
                                const sitekey = elem.getAttribute('data-sitekey');
                                if (sitekey) {
                                    return { sitekey: sitekey, type: 'Turnstile' };
                                }
                            }
                            return null;
                        },
                        // Check iframe src for sitekey parameter
                        () => {
                            const iframe = document.querySelector('iframe[src*="turnstile"]');
                            if (iframe) {
                                const match = iframe.src.match(/[?&]sitekey=([^&]+)/);
                                if (match) {
                                    return { sitekey: match[1], type: 'Turnstile' };
                                }
                            }
                            return null;
                        },
                        // Check script content for sitekey pattern
                        () => {
                            const scripts = Array.from(document.querySelectorAll('script'));
                            for (const script of scripts) {
                                const content = script.textContent;
                                // Look for sitekey patterns in script content
                                const matches = [
                                    content.match(/sitekey[':"\s]+['"]?([a-zA-Z0-9_\-]{20,})['"]?/),
                                    content.match(/["']sitekey["']\s*:\s*["']([a-zA-Z0-9_\-]{20,})["']/),
                                    content.match(/data-sitekey=["']([a-zA-Z0-9_\-]{20,})["']/),
                                ];
                                for (const match of matches) {
                                    if (match && match[1]) {
                                        return { sitekey: match[1], type: 'Turnstile' };
                                    }
                                }
                            }
                            return null;
                        }
                    ];

                    for (const extractor of extractors) {
                        const result = extractor();
                        if (result) {
                            return { success: true, ...result };
                        }
                    }

                    return { success: false, error: 'No sitekey found on page' };
                }
            });

            Logger.network('[Cloudflare] Extract script results:', results);
            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                if (result.success) {
                    this.displaySiteKeyModal(result.sitekey, result.type);
                    NotificationHelper.success('Site Key extracted successfully');
                } else {
                    NotificationHelper.error(result.error);
                }
            } else {
                NotificationHelper.error('Failed to extract sitekey');
            }
        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to extract sitekey:', error);
            NotificationHelper.error('Failed to extract: ' + error.message);
        }
    }

    displaySiteKeyModal(sitekey, type = 'Unknown') {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const typeColor = type === 'Turnstile' ? '#0074BF' : '#6366F1';
        const siteKeyDisplay = sitekey || 'N/A';

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Extracted Site Key</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Type</div>
                    <div style="background: linear-gradient(135deg, ${typeColor} 0%, ${typeColor}dd 100%); color: white; padding: 8px 12px; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">${type}</div>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">Site Key (Click to copy)</div>
                    <div class="copy-value" data-copy="${siteKeyDisplay}" style="font-size: 12px; color: var(--text-primary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 12px; border-radius: 4px; cursor: pointer; transition: background 0.2s;" title="Click to copy">${siteKeyDisplay}</div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const copyValue = modal.querySelector('.copy-value');
        if (copyValue) {
            copyValue.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = copyValue.getAttribute('data-copy');
                AdvancedUtils.copyToClipboard(text, copyValue, { notificationMessage: 'Site Key copied' });
            });
        }

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    displayVersionModal(data) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const type = data?.type || 'Unknown';
        let typeColor = '#6366F1';
        if (type === 'Turnstile') {
            typeColor = '#0074BF';
        } else if (type === 'Challenge') {
            typeColor = '#F97316';
        } else if (type === 'Turnstile + Challenge') {
            typeColor = '#9333EA';
        }

        const sitekey = data?.sitekey || null;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 650px; max-height: 90vh; overflow-y: auto; width: 95%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 18px; color: var(--text-primary); font-weight: 600;">Cloudflare Detection</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <!-- Detected Type -->
                <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 10px;">Type</div>
                    <div style="background: linear-gradient(135deg, ${typeColor} 0%, ${typeColor}dd 100%); color: white; padding: 12px 16px; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">${type}</div>
                </div>

                <!-- Site Key -->
                ${sitekey ? `
                <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 8px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Site Key</div>
                    <div class="copy-sitekey" data-copy="${sitekey}" style="font-family: monospace; font-size: 12px; color: #4ade80; background: var(--bg-primary); padding: 12px; border-radius: 6px; word-break: break-all; cursor: pointer; transition: all 0.2s; user-select: text;" title="Click to copy">${sitekey}</div>
                </div>
                ` : ''}

                <!-- Detection Details Grid -->
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
                    <!-- cdata Parameter -->
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; border: 1px solid ${data?.hasCdata ? '#4ade80' : 'rgba(255,255,255,0.1)'};">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">cdata Parameter</div>
                        <div style="font-size: 14px; font-weight: 600; color: ${data?.hasCdata ? '#4ade80' : 'var(--text-secondary)'};">${data?.hasCdata ? '✓ Found' : '✗ Not Found'}</div>
                    </div>

                    <!-- cAction Parameter -->
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; border: 1px solid ${data?.hasCaction ? '#4ade80' : 'rgba(255,255,255,0.1)'};">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">cAction Parameter</div>
                        <div style="font-size: 14px; font-weight: 600; color: ${data?.hasCaction ? '#4ade80' : 'var(--text-secondary)'};">${data?.hasCaction ? '✓ Found' : '✗ Not Found'}</div>
                    </div>

                    ${(type === 'Challenge' || type === 'Challenge + Turnstile') ?
                        `<div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; border: 1px solid ${data?.hasCfClearance ? '#4ade80' : 'rgba(255,255,255,0.1)'};">
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">cf_clearance</div>
                            <div style="font-size: 14px; font-weight: 600; color: ${data?.hasCfClearance ? '#4ade80' : 'var(--text-secondary)'};">${data?.hasCfClearance ? '✓ Present' : '✗ Missing'}</div>
                        </div>`
                    : ''}

                    <!-- Callback Required -->
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; border: 1px solid ${data?.hasCallback ? '#4ade80' : 'rgba(255,255,255,0.1)'};">
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Callback Required</div>
                        <div style="font-size: 14px; font-weight: 600; color: ${data?.hasCallback ? '#4ade80' : 'var(--text-secondary)'};">${data?.hasCallback ? '✓ Yes' : '✗ No'}</div>
                    </div>
                </div>

                <!-- Challenge Detected -->
                ${data?.hasChallenge ? `
                <div style="background: rgba(249, 115, 22, 0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(249, 115, 22, 0.3); margin-bottom: 16px;">
                    <div style="font-size: 11px; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Alert</div>
                    <div style="font-size: 13px; color: #fca5a5;">Cloudflare Challenge Platform detected in network requests</div>
                </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        // Add copy-to-clipboard for sitekey
        const copyBtn = modal.querySelector('.copy-sitekey');
        if (copyBtn) {
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = copyBtn.getAttribute('data-copy');
                AdvancedUtils.copyToClipboard(text, copyBtn, { notificationMessage: 'Site Key copied' });
            });

            // Hover effect
            copyBtn.addEventListener('mouseenter', () => {
                copyBtn.style.background = 'rgba(74, 222, 128, 0.15)';
            });
            copyBtn.addEventListener('mouseleave', () => {
                copyBtn.style.background = 'var(--bg-primary)';
            });
        }

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }


    renderCaptureHistoryItems(historyItems) {
        const items = Array.isArray(historyItems) ? historyItems : [historyItems];
        return items.map((item, index) => {
            const data = item.captureData || item.data || {};
            const timestamp = new Date(item.timestamp).toLocaleString();
            const type = data.type || 'Unknown';

            let typeColor = '#6366F1';
            if (type === 'Turnstile') {
                typeColor = '#0074BF';
            } else if (type === 'Challenge') {
                typeColor = '#F97316';
            } else if (type === 'Turnstile + Challenge') {
                typeColor = '#9333EA';
            }

            return `
                <div class="history-item" data-id="capture-${index}" style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; cursor: pointer; transition: background 0.2s; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: linear-gradient(135deg, ${typeColor} 0%, ${typeColor}dd 100%); color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: 500;">${type}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${timestamp}</div>
                    </div>
                    ${data.sitekey ? `<div style="font-size: 12px; color: var(--text-secondary);">Sitekey: ${data.sitekey.substring(0, 30)}${data.sitekey.length > 30 ? '...' : ''}</div>` : ''}
                    ${data.siteURL ? `<div style="font-size: 12px; color: var(--text-secondary);">URL: ${data.siteURL.substring(0, 50)}${data.siteURL.length > 50 ? '...' : ''}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    renderCaptureDetailsContent(capture) {
        const data = capture.captureData || capture.data || {};
        const timestamp = new Date(capture.timestamp).toLocaleString();
        const url = (capture.url || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const type = data.type || 'Unknown';
        const cdata = data.cdata || 'N/A';
        const cAction = data.cAction || 'N/A';
        const sitekey = data.sitekey || 'N/A';
        const siteURL = data.siteURL || 'N/A';

        return `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">URL</label>
                <div class="advanced-modal-code-block" data-copy="${url}">${url}</div>
            </div>

            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Type</label>
                <div class="advanced-modal-code-block" data-copy="${type}">${type}</div>
            </div>

            ${type.includes('Turnstile') ? `
                <div class="advanced-modal-section">
                    <label class="advanced-modal-label">Site Key</label>
                    <div class="advanced-modal-code-block" data-copy="${sitekey}" style="word-break: break-all;">${sitekey}</div>
                </div>

                <div class="advanced-modal-section">
                    <label class="advanced-modal-label">cdata</label>
                    <div class="advanced-modal-code-block" data-copy="${cdata}" style="word-break: break-all; font-size: 11px;">${cdata === 'N/A' ? cdata : cdata.substring(0, 100) + (cdata.length > 100 ? '...' : '')}</div>
                </div>

                <div class="advanced-modal-section">
                    <label class="advanced-modal-label">cAction</label>
                    <div class="advanced-modal-code-block" data-copy="${cAction}" style="word-break: break-all;">${cAction}</div>
                </div>
            ` : ''}

            <div class="advanced-modal-section">
                <label class="advanced-modal-label">Site URL</label>
                <div class="advanced-modal-code-block" data-copy="${siteURL}" style="word-break: break-all;">${siteURL}</div>
            </div>

            <!-- Timestamp Section (at bottom) -->
            <div class="advanced-modal-section" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">Captured</span>
                    <span class="advanced-modal-info-value">${timestamp}</span>
                </div>
            </div>
        `;
    }

    async analyzeScripts() {
        Logger.network('[Cloudflare] ========== ANALYZE SCRIPTS ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const analysisListener = (message) => {
                if (message.type === 'CLOUDFLARE_ANALYSIS_RESULT') {
                    Logger.network('[Cloudflare] Analysis result received:', message.data);
                    this.displayAnalysisModal(message.data);
                    chrome.runtime.onMessage.removeListener(analysisListener);
                }
            };

            chrome.runtime.onMessage.addListener(analysisListener);

            const response = await AdvancedUtils.sendMessage({
                type: 'CLOUDFLARE_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            Logger.network('[Cloudflare] Analysis mode response:', response);

            if (response && response.status === 'started') {
                NotificationHelper.info('Analyzing Cloudflare scripts... Page will reload');

                setTimeout(async () => {
                    try {
                        await AdvancedUtils.sendMessage({
                            type: 'CLOUDFLARE_SHOW_ANALYZING_NOTIFICATION',
                            tabId: this.tabInfo.id
                        });
                    } catch (error) {
                        Logger.error('NETWORK', '[Cloudflare] Failed to show analyzing notification:', error);
                    }

                    await chrome.tabs.reload(this.tabInfo.id);
                }, 500);
            } else {
                chrome.runtime.onMessage.removeListener(analysisListener);
                NotificationHelper.error('Failed to start analysis');
            }
        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to analyze scripts:', error);
            NotificationHelper.error('Failed to analyze scripts: ' + error.message);
        }
    }

    displayAnalysisModal(data) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const scripts = data?.scripts || [];

        // Group scripts by type
        const typeColors = {
            'Turnstile': { gradient: 'linear-gradient(135deg, #0074BF 0%, #0061B3 100%)', bg: '#0074BF' },
            'Challenge': { gradient: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)', bg: '#F97316' },
            'CDN': { gradient: 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)', bg: '#6B7280' },
            'Analytics': { gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', bg: '#10B981' },
            'Bot Management': { gradient: 'linear-gradient(135deg, #9333EA 0%, #7E22CE 100%)', bg: '#9333EA' },
            'Cloudflare': { gradient: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)', bg: '#F97316' }
        };

        const groupedScripts = {};
        scripts.forEach(script => {
            const type = script.type || 'Cloudflare';
            if (!groupedScripts[type]) {
                groupedScripts[type] = [];
            }
            groupedScripts[type].push(script);
        });

        // Generate HTML for grouped scripts
        let scriptHTML = '';
        Object.keys(groupedScripts).forEach(type => {
            const typeScripts = groupedScripts[type];
            const colors = typeColors[type] || typeColors['Cloudflare'];
            scriptHTML += `
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="font-weight: 600; color: var(--text-primary);">${type} Scripts (${typeScripts.length})</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${typeScripts.map((script, idx) => `
                            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <span style="background: ${colors.gradient}; color: white; padding: 3px 8px; border-radius: 3px; font-size: 10px; font-weight: 500;">${type}</span>
                                    <span style="font-size: 12px; color: var(--text-secondary);">#${idx + 1}</span>
                                </div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url)}" style="font-size: 11px; color: var(--text-primary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s;" title="Click to copy">${script.url}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Cloudflare Scripts (${scripts.length})</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="display: flex; flex-direction: column;">
                    ${scriptHTML}
                </div>

                ${scripts.length > 0 ? `
                    <button class="modal-export-code-btn" style="margin-top: 16px; width: 100%; padding: 10px; background: linear-gradient(135deg, #F97316 0%, #EA580C 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span>Export Code</span>
                    </button>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        const copyValues = modal.querySelectorAll('.copy-value');
        copyValues.forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = el.getAttribute('data-copy');
                AdvancedUtils.copyToClipboard(text, el, { notificationMessage: 'URL copied' });
            });
        });

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        const exportBtn = modal.querySelector('.modal-export-code-btn');
        if (exportBtn && scripts.length > 0) {
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.displayExportCodeModal(scripts);
            });
        }

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    displayExportCodeModal(scripts) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 10001; opacity: 0; transition: opacity 0.2s;';

        const languages = ['JavaScript', 'Python', 'Node.js', 'PHP', 'C#', 'Go'];

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 700px; max-height: 80vh; overflow-y: auto; width: 95%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">Export Code</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>

                <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
                    ${languages.map(lang => `
                        <button class="lang-tab-btn" data-lang="${lang}" style="padding: 8px 12px; border: none; background: var(--bg-tertiary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s; ${lang === 'JavaScript' ? 'background: linear-gradient(135deg, #F97316 0%, #EA580C 100%); color: white;' : ''}">
                            ${lang}
                        </button>
                    `).join('')}
                </div>

                <div class="code-container" style="background: var(--bg-primary); border-radius: 6px; padding: 14px; overflow-x: auto; margin-bottom: 12px;">
                    <pre style="margin: 0; font-family: monospace; font-size: 12px; color: var(--text-primary); white-space: pre-wrap; word-wrap: break-word;"><code id="codeContent"></code></pre>
                </div>

                <button class="copy-code-btn" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #F97316 0%, #EA580C 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    Copy Code
                </button>
            </div>
        `;

        document.body.appendChild(modal);

        const tabs = modal.querySelectorAll('.lang-tab-btn');
        const codeContent = modal.querySelector('#codeContent');
        const urls = scripts.map(s => s.url);

        const updateCode = (language) => {
            const code = this.generateCloudflareParsingCode(urls, language);
            codeContent.textContent = code;

            tabs.forEach(tab => {
                if (tab.getAttribute('data-lang') === language) {
                    tab.style.background = 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)';
                    tab.style.color = 'white';
                } else {
                    tab.style.background = 'var(--bg-tertiary)';
                    tab.style.color = 'var(--text-primary)';
                }
            });
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                updateCode(tab.getAttribute('data-lang'));
            });
        });

        const copyBtn = modal.querySelector('.copy-code-btn');
        copyBtn.addEventListener('click', () => {
            const code = codeContent.textContent;
            AdvancedUtils.copyToClipboard(code, copyBtn, { notificationMessage: 'Code copied' });
        });

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        closeBtn.addEventListener('click', () => modal.remove());

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        updateCode('JavaScript');
        setTimeout(() => modal.style.opacity = '1', 10);
    }

    generateCloudflareParsingCode(urls, language) {
        const templates = {
            'JavaScript': () => `// Cloudflare Challenge Scripts
const cloudflareScripts = ${JSON.stringify(urls, null, 2)};

cloudflareScripts.forEach((url, index) => {
    Logger.network(\`Script \${index + 1}: \${url}\`);
});

// Fetch challenge scripts
async function fetchCloudflareScripts() {
    for (const url of cloudflareScripts) {
        try {
            const response = await fetch(url);
            const script = await response.text();
            Logger.network(\`Fetched: \${url}\`);
        } catch (error) {
            Logger.error('NETWORK', \`Failed to fetch: \${url}\`, error);
        }
    }
}

fetchCloudflareScripts();`,

            'Python': () => `import requests

# Cloudflare Challenge Scripts
cloudflare_scripts = ${JSON.stringify(urls, null, 2)}

for index, url in enumerate(cloudflare_scripts, 1):
    print(f'Script {index}: {url}')

def fetch_cloudflare_scripts():
    for url in cloudflare_scripts:
        try:
            response = requests.get(url)
            print(f'Fetched: {url}')
        except Exception as e:
            print(f'Failed to fetch: {url}', e)

fetch_cloudflare_scripts()`,

            'Node.js': () => `const axios = require('axios');

// Cloudflare Challenge Scripts
const cloudflareScripts = ${JSON.stringify(urls, null, 2)};

cloudflareScripts.forEach((url, index) => {
    Logger.network(\`Script \${index + 1}: \${url}\`);
});

async function fetchCloudflareScripts() {
    for (const url of cloudflareScripts) {
        try {
            const response = await axios.get(url);
            Logger.network(\`Fetched: \${url}\`);
        } catch (error) {
            Logger.error('NETWORK', \`Failed to fetch: \${url}\`, error.message);
        }
    }
}

fetchCloudflareScripts();`,

            'PHP': () => `<?php
// Cloudflare Challenge Scripts
$cloudflareScripts = ${JSON.stringify(urls, null, 2)};

foreach ($cloudflareScripts as $index => $url) {
    echo "Script " . ($index + 1) . ": " . $url . PHP_EOL;
}

function fetchCloudflareScripts() {
    global $cloudflareScripts;

    foreach ($cloudflareScripts as $url) {
        try {
            $response = file_get_contents($url);
            echo "Fetched: " . $url . PHP_EOL;
        } catch (Exception $e) {
            echo "Failed to fetch: " . $url . PHP_EOL;
        }
    }
}

fetchCloudflareScripts();
?>`,

            'C#': () => {
                const scriptLines = urls.map(u => `        "${u}"`).join(',\n');
                return `using System;
using System.Net.Http;
using System.Collections.Generic;
using System.Threading.Tasks;

class CloudflareScripts
{
    private static readonly string[] Scripts = new string[]
    {
${scriptLines}
    };

    static void Main()
    {
        FetchCloudflareScriptsAsync().Wait();
    }

    static async Task FetchCloudflareScriptsAsync()
    {
        using (HttpClient client = new HttpClient())
        {
            for (int i = 0; i < Scripts.Length; i++)
            {
                try
                {
                    HttpResponseMessage response = await client.GetAsync(Scripts[i]);
                    Console.WriteLine($"Fetched: {Scripts[i]}");
                }
                catch (Exception e)
                {
                    Console.WriteLine($"Failed to fetch: {Scripts[i]} - {e.Message}");
                }
            }
        }
    }
}`;
            },

            'Go': () => {
                const scriptLines = urls.map(u => `	"${u}"`).join(',\n');
                return `package main

import (
	"fmt"
	"io/ioutil"
	"net/http"
)

var cloudflareScripts = []string{
${scriptLines}
}

func main() {
	fetchCloudflareScripts()
}

func fetchCloudflareScripts() {
	client := &http.Client{}

	for _, url := range cloudflareScripts {
		resp, err := client.Get(url)
		if err != nil {
			fmt.Printf("Failed to fetch: %s - %v\\n", url, err)
			continue
		}

		body, _ := ioutil.ReadAll(resp.Body)
		resp.Body.Close()

		fmt.Printf("Fetched: %s\\n", url)
		_ = body
	}
}`;
            }
        };

        return templates[language] ? templates[language]() : 'Code generation not available';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CloudflareAdvanced;
} else if (typeof window !== 'undefined') {
    window.CloudflareAdvanced = CloudflareAdvanced;
}

Logger.network('[CloudflareAdvanced] Loaded successfully');
