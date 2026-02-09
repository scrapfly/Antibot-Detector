/**
 * ReCaptchaAdvanced - Using BaseAdvancedModule Template System
 *
 * Extends base class for reCAPTCHA-specific capture and analysis tools.
 * Includes tools for clicking reCAPTCHA, extracting sitekeys, checking versions, and capturing callbacks.
 */
class ReCaptchaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'recaptcha');
    }

    /**
     * Override: Show capture start notification with Scrapfly branding
     */
    async afterCaptureStart(response) {
        if (response && (response.status === 'started' || response.status === 'already_capturing')) {
            await AdvancedUtils.showCaptureStartNotification('reCAPTCHA');
        }
    }

    /**
     * Render reCAPTCHA-specific tools
     */
    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="recaptchaClick">
                    <div class="tool-icon-container tool-icon-blue">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Obtain selector</div>
                </button>

                <button class="recaptcha-tool-btn" id="recaptchaExtract">
                    <div class="tool-icon-container tool-icon-green">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Extract SiteKey</div>
                </button>

                <button class="recaptcha-tool-btn" id="recaptchaCallback">
                    <div class="tool-icon-container tool-icon-purple">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M17.45,15.18L22,7.31V19L17.45,15.18M1,3.24L3.77,6L5.55,7.78L16.78,19C16.84,19 16.89,19.05 16.95,19.06L19,21.07L20.59,19.48L2.59,1.48L1,3.24M8,8.97L8.02,5H17.64L15.27,9.45L8,8.97M12.65,12.74L18.13,18.23L15.76,22H8L10.14,17.94L12.65,12.74Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">reCAPTCHA callback</div>
                </button>

                <button class="recaptcha-tool-btn" id="recaptchaStartCapture">
                    <div class="tool-icon-container tool-icon-red">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22A9,9 0 0,0 21,13A9,9 0 0,0 12,4M12,8A5,5 0 0,0 7,13A5,5 0 0,0 12,18A5,5 0 0,0 17,13A5,5 0 0,0 12,8M12,10.5A2.5,2.5 0 0,1 14.5,13A2.5,2.5 0 0,1 12,15.5A2.5,2.5 0 0,1 9.5,13A2.5,2.5 0 0,1 12,10.5Z"/>
                        </svg>
                    </div>
                    <div class="tool-btn-label">Start Capturing</div>
                </button>
            </div>
        `;
    }

    /**
     * Setup tool-specific event listeners
     */
    setupToolListeners() {
        Logger.network('[ReCAPTCHA] Setting up tool listeners...');
        Logger.network('[ReCAPTCHA] this.clickRecaptcha exists:', typeof this.clickRecaptcha);
        Logger.network('[ReCAPTCHA] this.extractSiteKey exists:', typeof this.extractSiteKey);
        Logger.network('[ReCAPTCHA] this.captureCallback exists:', typeof this.captureCallback);
        Logger.network('[ReCAPTCHA] this.startCapturing exists:', typeof this.startCapturing);

        const actions = [
            { id: 'recaptchaClick', method: () => {
                Logger.network('[ReCAPTCHA] Click button pressed!');
                try {
                    this.clickRecaptcha();
                } catch (e) {
                    Logger.error('NETWORK', '[ReCAPTCHA] Error in clickRecaptcha:', e);
                }
            }},
            { id: 'recaptchaExtract', method: () => {
                Logger.network('[ReCAPTCHA] Extract button pressed!');
                try {
                    this.extractSiteKey();
                } catch (e) {
                    Logger.error('NETWORK', '[ReCAPTCHA] Error in extractSiteKey:', e);
                }
            }},
            { id: 'recaptchaCallback', method: () => {
                Logger.network('[ReCAPTCHA] Callback button pressed!');
                try {
                    this.captureCallback();
                } catch (e) {
                    Logger.error('NETWORK', '[ReCAPTCHA] Error in captureCallback:', e);
                }
            }},
            { id: 'recaptchaStartCapture', method: () => this.startCapturing() }
        ];

        actions.forEach(({ id, method }) => {
            const btn = document.querySelector(`#${id}`);
            Logger.network(`[ReCAPTCHA] Button #${id}:`, btn ? 'FOUND' : 'NOT FOUND');
            if (btn) {
                btn.addEventListener('click', method);
                Logger.network(`[ReCAPTCHA] Added listener to #${id}`);
            }
        });
    }

    /**
     * Click reCAPTCHA and obtain selector
     */
    async clickRecaptcha() {
        Logger.network('[ReCAPTCHA] clickRecaptcha() called');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                world: 'MAIN', // Execute in page context to access grecaptcha global
                func: () => {
                    const selectors = [
                        '.g-recaptcha',
                        'iframe[src*="recaptcha"]',
                        '[data-sitekey]',
                        '.recaptcha-checkbox',
                        '#recaptcha-anchor'
                    ];

                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            if (element.tagName === 'IFRAME') {
                                const iframeDoc = element.contentDocument || element.contentWindow.document;
                                const checkbox = iframeDoc.querySelector('.recaptcha-checkbox') ||
                                               iframeDoc.querySelector('#recaptcha-anchor');
                                if (checkbox) {
                                    checkbox.click();
                                    return { success: true, method: 'iframe-checkbox', selector };
                                }
                            } else {
                                element.click();
                                return { success: true, method: 'direct-click', selector };
                            }
                        }
                    }

                    if (typeof grecaptcha !== 'undefined' && grecaptcha.execute) {
                        try {
                            grecaptcha.execute();
                            return { success: true, method: 'grecaptcha-execute' };
                        } catch (e) {
                            return { success: false, error: 'grecaptcha.execute() failed: ' + e.message };
                        }
                    }

                    return { success: false, error: 'No reCAPTCHA elements found' };
                }
            });

            Logger.network('[ReCAPTCHA] Script execution results:', results);
            if (results && results[0] && results[0].result) {
                Logger.network('[ReCAPTCHA] Calling displaySelectorModal with:', results[0].result);
                this.displaySelectorModal(results[0].result);
            } else {
                Logger.network('[ReCAPTCHA] No results from script execution');
            }
        } catch (error) {
            Logger.error('NETWORK', '[ReCAPTCHA] Failed to click reCAPTCHA:', error);
            NotificationHelper.error('Failed to click: ' + error.message);
        }
    }

    /**
     * Extract sitekey from page
     */
    async extractSiteKey() {
        Logger.network('[ReCAPTCHA] extractSiteKey() called');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                world: 'MAIN', // Execute in page context for consistency
                func: () => {
                    const extractors = [
                        () => document.querySelector('[data-sitekey]')?.getAttribute('data-sitekey'),
                        () => document.querySelector('.g-recaptcha')?.getAttribute('data-sitekey'),
                        () => {
                            const iframe = document.querySelector('iframe[src*="recaptcha"]');
                            if (iframe) {
                                const match = iframe.src.match(/[?&]k=([^&]+)/);
                                return match ? match[1] : null;
                            }
                            return null;
                        },
                        () => {
                            const scripts = Array.from(document.querySelectorAll('script'));
                            for (const script of scripts) {
                                const content = script.textContent;
                                const match = content.match(/sitekey['":\s]+['"]?([a-zA-Z0-9_-]{40})['"]?/);
                                if (match) return match[1];
                            }
                            return null;
                        }
                    ];

                    for (const extractor of extractors) {
                        const key = extractor();
                        if (key) {
                            return { success: true, sitekey: key };
                        }
                    }

                    return { success: false, error: 'No sitekey found' };
                }
            });

            Logger.network('[ReCAPTCHA] Extract script results:', results);
            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                Logger.network('[ReCAPTCHA] Extract result:', result);
                if (result.success) {
                    Logger.network('[ReCAPTCHA] Calling displaySiteKeyModal with:', result.sitekey);
                    this.displaySiteKeyModal(result.sitekey);
                } else {
                    Logger.network('[ReCAPTCHA] No sitekey found:', result.error);
                    NotificationHelper.error(result.error);
                }
            } else {
                Logger.network('[ReCAPTCHA] No results from extract script');
            }
        } catch (error) {
            Logger.error('NETWORK', '[ReCAPTCHA] Failed to extract sitekey:', error);
            NotificationHelper.error('Failed to extract: ' + error.message);
        }
    }

    /**
     * Check reCAPTCHA version on page
     */
    async checkVersion() {
        Logger.network('[ReCAPTCHA] checkVersion() called');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                world: 'MAIN', // Execute in page context to access grecaptcha global
                func: () => {
                    const checks = {
                        hasV2Checkbox: !!document.querySelector('.g-recaptcha'),
                        hasV2Iframe: !!document.querySelector('iframe[src*="recaptcha/api2"]'),
                        hasV3Script: Array.from(document.querySelectorAll('script')).some(s =>
                            s.textContent.includes('grecaptcha.execute')
                        ),
                        hasInvisible: !!document.querySelector('[data-size="invisible"]'),
                        grecaptchaExists: typeof grecaptcha !== 'undefined',
                        grecaptchaVersion: typeof grecaptcha !== 'undefined' && grecaptcha.enterprise ? 'Enterprise' : 'Standard'
                    };

                    let version = 'Unknown';
                    let type = 'Unknown';

                    if (checks.hasV3Script && !checks.hasV2Checkbox) {
                        version = 'v3';
                        type = 'Invisible (Score-based)';
                    } else if (checks.hasInvisible) {
                        version = 'v2';
                        type = 'Invisible';
                    } else if (checks.hasV2Checkbox || checks.hasV2Iframe) {
                        version = 'v2';
                        type = 'Checkbox';
                    }

                    return {
                        success: true,
                        version,
                        type,
                        checks,
                        enterprise: checks.grecaptchaVersion === 'Enterprise'
                    };
                }
            });

            Logger.network('[ReCAPTCHA] Version check results:', results);
            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                Logger.network('[ReCAPTCHA] Version result:', result);
                if (result.success) {
                    Logger.network('[ReCAPTCHA] Calling displayVersionModal with:', result);
                    this.displayVersionModal(result);
                } else {
                    Logger.network('[ReCAPTCHA] Version check failed');
                }
            } else {
                Logger.network('[ReCAPTCHA] No results from version check script');
            }
        } catch (error) {
            Logger.error('NETWORK', '[ReCAPTCHA] Failed to check version:', error);
            NotificationHelper.error('Failed to check: ' + error.message);
        }
    }

    /**
     * Capture callback function names
     */
    async captureCallback() {
        Logger.network('[ReCAPTCHA] captureCallback() called');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                world: 'MAIN', // Execute in page context to access ___grecaptcha_cfg
                func: () => {
                    // Method 4: Comprehensive automated search function
                    function findRecaptchaClients() {
                        // eslint-disable-next-line camelcase
                        if (typeof (___grecaptcha_cfg) !== 'undefined') {
                            // eslint-disable-next-line camelcase, no-undef
                            return Object.entries(___grecaptcha_cfg.clients).map(([cid, client]) => {
                                const data = { id: cid, version: cid >= 10000 ? 'V3' : 'V2' };
                                const objects = Object.entries(client).filter(([_, value]) => value && typeof value === 'object');

                                objects.forEach(([toplevelKey, toplevel]) => {
                                    const found = Object.entries(toplevel).find(([_, value]) => (
                                        value && typeof value === 'object' && 'sitekey' in value && 'size' in value
                                    ));

                                    if (typeof toplevel === 'object' && toplevel instanceof HTMLElement && toplevel['tagName'] === 'DIV') {
                                        data.pageurl = toplevel.baseURI;
                                    }

                                    if (found) {
                                        const [sublevelKey, sublevel] = found;

                                        data.sitekey = sublevel.sitekey;
                                        const callbackKey = data.version === 'V2' ? 'callback' : 'promise-callback';
                                        const callback = sublevel[callbackKey];
                                        if (!callback) {
                                            data.callback = null;
                                            data.function = null;
                                        } else {
                                            data.function = typeof callback === 'function' ? callback.name || 'anonymous' : String(callback);
                                            const keys = [cid, toplevelKey, sublevelKey, callbackKey].map((key) => `['${key}']`).join('');
                                            data.callbackPath = `___grecaptcha_cfg.clients${keys}`;
                                            data.callback = typeof callback === 'function' ? (callback.name || 'anonymous') : String(callback);
                                        }
                                    }
                                });
                                return data;
                            });
                        }
                        return [];
                    }

                    // Method 1: Search DOM for data-callback attributes
                    const domCallbacks = [];
                    document.querySelectorAll('[data-callback]').forEach(el => {
                        const callback = el.getAttribute('data-callback');
                        if (callback && !domCallbacks.includes(callback)) {
                            domCallbacks.push(callback);
                        }
                    });

                    // Method 2: Search scripts for grecaptcha.render and callback patterns
                    const scriptCallbacks = [];
                    const scripts = Array.from(document.querySelectorAll('script'));
                    scripts.forEach(script => {
                        const content = script.textContent;

                        // Search for grecaptcha.render calls with callback
                        const renderMatches = content.match(/grecaptcha\.render\([^)]*callback['"]?\s*:\s*['"]?([\w.]+)/g);
                        if (renderMatches) {
                            renderMatches.forEach(m => {
                                const func = m.match(/callback['"]?\s*:\s*['"]?([\w.]+)/)?.[1];
                                if (func && !scriptCallbacks.includes(func)) {
                                    scriptCallbacks.push(func);
                                }
                            });
                        }

                        // Search for generic callback: patterns
                        const callbackMatches = content.match(/['"]?callback['"]?\s*:\s*['"]?([\w.]+)['"]?/g);
                        if (callbackMatches) {
                            callbackMatches.forEach(m => {
                                const func = m.match(/['"]?callback['"]?\s*:\s*['"]?([\w.]+)['"]?/)?.[1];
                                if (func && !scriptCallbacks.includes(func) && !['then', 'catch', 'finally'].includes(func)) {
                                    scriptCallbacks.push(func);
                                }
                            });
                        }
                    });

                    // Method 3 & 4: Get clients from ___grecaptcha_cfg
                    const clients = findRecaptchaClients();

                    return {
                        success: true,
                        clients: clients,
                        domCallbacks: domCallbacks,
                        scriptCallbacks: scriptCallbacks
                    };
                }
            });

            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                if (result.success) {
                    const hasClients = result.clients && result.clients.length > 0;
                    const hasDomCallbacks = result.domCallbacks && result.domCallbacks.length > 0;
                    const hasScriptCallbacks = result.scriptCallbacks && result.scriptCallbacks.length > 0;

                    if (hasClients || hasDomCallbacks || hasScriptCallbacks) {
                        this.displayCallbackModal(result);
                    } else {
                        NotificationHelper.info('No reCAPTCHA callbacks found on this page. Make sure reCAPTCHA is loaded.');
                    }
                }
            }
        } catch (error) {
            Logger.error('NETWORK', '[ReCAPTCHA] Failed to capture callback:', error);
            NotificationHelper.error('Failed to capture callback: ' + error.message);
        }
    }

    /**
     * Display selector click result modal
     */
    displaySelectorModal(result) {
        Logger.network('[ReCAPTCHA] displaySelectorModal called with:', result);
        const modal = document.createElement('div');
        modal.className = 'advanced-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(2px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.2s;
        `;

        modal.innerHTML = `
            <div class="advanced-modal-container" style="background: var(--bg-secondary, #2a2a2a); border-radius: 8px; padding: 24px; max-width: 600px; width: 95%;">
                <div class="advanced-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h3 style="margin: 0; color: var(--text-primary, #fff); font-size: 16px; font-weight: 600;">Selector Detection</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>
                <div class="advanced-modal-body">
                    ${result.success ? `
                        <div class="advanced-modal-section" style="margin-bottom: 20px;">
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Method</div>
                            <div style="color: var(--text-primary, #fff); font-size: 13px; padding: 10px; background: var(--bg-tertiary, #1a1a1a); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1);">${result.method}</div>
                        </div>
                        ${result.selector ? `
                            <div class="advanced-modal-section">
                                <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Selector</div>
                                <code class="clickable-copy-value" data-copy="${result.selector}" style="display: block; background: var(--bg-tertiary, #1a1a1a); padding: 14px; border-radius: 6px; color: var(--success, #4ade80); font-family: monospace; word-break: break-all; font-size: 13px; line-height: 1.5; cursor: pointer; transition: all 0.2s; user-select: text; border: 1px solid rgba(255, 255, 255, 0.1);">${result.selector}</code>
                            </div>
                        ` : ''}
                    ` : `
                        <div class="advanced-modal-section">
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Error</div>
                            <div style="color: var(--error, #ef4444); font-size: 13px; padding: 10px; background: var(--bg-tertiary, #1a1a1a); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1);">${result.error}</div>
                        </div>
                    `}
                </div>
            </div>
        `;

        Logger.network('[ReCAPTCHA] Appending modal to body');
        document.body.appendChild(modal);

        // Add click-to-copy for selector value
        modal.querySelectorAll('.clickable-copy-value').forEach(element => {
            element.addEventListener('click', () => {
                const text = element.dataset.copy;
                if (!text) {
                    return;
                }
                AdvancedUtils.copyToClipboard(text, element, {
                    notificationMessage: 'Selector copied to clipboard!'
                });
            });

            // Add hover effect
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.08)';
            });
            element.addEventListener('mouseleave', () => {
                element.style.background = 'var(--bg-tertiary)';
            });
        });

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                Logger.network('[ReCAPTCHA] Close button clicked');
                modal.remove();
            });
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                Logger.network('[ReCAPTCHA] Modal overlay clicked');
                modal.remove();
            }
        });

        setTimeout(() => {
            modal.style.opacity = '1';
            Logger.network('[ReCAPTCHA] Modal opacity set to 1');
        }, 10);
    }

    /**
     * Display extracted sitekey modal
     */
    displaySiteKeyModal(sitekey) {
        Logger.network('[ReCAPTCHA] displaySiteKeyModal called with:', sitekey);
        const modal = document.createElement('div');
        modal.className = 'recaptcha-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(2px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.2s;
        `;

        modal.innerHTML = `
            <div class="recaptcha-modal" style="background: var(--bg-secondary, #2a2a2a); border-radius: 8px; padding: 24px; max-width: 600px; width: 95%;">
                <div class="recaptcha-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: var(--text-primary, #fff); font-size: 16px;">Extracted SiteKey</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>
                <div class="recaptcha-modal-content">
                    <div class="sitekey-display" style="display: flex; flex-direction: column; gap: 14px;">
                        <code class="sitekey-code clickable-copy-value" data-copy="${sitekey}" style="display: block; background: var(--bg-tertiary, #1a1a1a); padding: 14px; border-radius: 6px; color: var(--success, #4ade80); font-family: monospace; word-break: break-all; font-size: 13px; line-height: 1.5; cursor: pointer; transition: all 0.2s; user-select: text;">${sitekey}</code>
                    </div>
                </div>
            </div>
        `;

        Logger.network('[ReCAPTCHA] Appending sitekey modal to body');
        document.body.appendChild(modal);

        // Add click-to-copy for sitekey value
        modal.querySelectorAll('.clickable-copy-value').forEach(element => {
            element.addEventListener('click', () => {
                const text = element.dataset.copy;
                if (!text) {
                    return;
                }
                AdvancedUtils.copyToClipboard(text, element, {
                    notificationMessage: 'SiteKey copied to clipboard!'
                });
            });

            // Add hover effect
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.08)';
            });
            element.addEventListener('mouseleave', () => {
                element.style.background = 'var(--bg-tertiary)';
            });
        });

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => {
            modal.style.opacity = '1';
            Logger.network('[ReCAPTCHA] Sitekey modal visible');
        }, 10);
    }

    /**
     * Display version check results modal
     */
    displayVersionModal(versionData) {
        Logger.network('[ReCAPTCHA] displayVersionModal called with:', versionData);
        const modal = document.createElement('div');
        modal.className = 'recaptcha-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(2px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.2s;
        `;

        modal.innerHTML = `
            <div class="recaptcha-modal" style="background: var(--bg-secondary, #2a2a2a); border-radius: 8px; padding: 20px; max-width: 500px; width: 90%;">
                <div class="recaptcha-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; color: var(--text-primary, #fff);">Version Detection</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>
                <div class="recaptcha-modal-content">
                    <div class="version-info" style="margin-bottom: 16px;">
                        <div class="version-main" style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; margin-bottom: 8px;">
                            <span class="version-label" style="color: var(--text-secondary, #aaa);">Version:</span>
                            <span class="version-value" style="color: var(--text-primary, #fff); font-weight: 600;">${versionData.version}</span>
                        </div>
                        <div class="version-type" style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px;">
                            <span class="version-label" style="color: var(--text-secondary, #aaa);">Type:</span>
                            <span class="version-value" style="color: var(--text-primary, #fff); font-weight: 600;">${versionData.type}</span>
                        </div>
                        ${versionData.enterprise ? '<div class="enterprise-badge" style="margin-top: 8px; padding: 8px; background: var(--warning, #fbbf24); color: #000; border-radius: 4px; text-align: center; font-weight: 600;">⭐ Enterprise</div>' : ''}
                    </div>
                    <div class="version-checks" style="display: flex; flex-direction: column; gap: 8px;">
                        <div class="check-item" style="padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; color: ${versionData.checks.hasV2Checkbox ? 'var(--success, #4ade80)' : 'var(--text-secondary, #aaa)'};">
                            ${versionData.checks.hasV2Checkbox ? 'Yes' : 'No'} V2 Checkbox
                        </div>
                        <div class="check-item" style="padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; color: ${versionData.checks.hasV2Iframe ? 'var(--success, #4ade80)' : 'var(--text-secondary, #aaa)'};">
                            ${versionData.checks.hasV2Iframe ? 'Yes' : 'No'} V2 Iframe
                        </div>
                        <div class="check-item" style="padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; color: ${versionData.checks.hasV3Script ? 'var(--success, #4ade80)' : 'var(--text-secondary, #aaa)'};">
                            ${versionData.checks.hasV3Script ? 'Yes' : 'No'} V3 Script
                        </div>
                        <div class="check-item" style="padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; color: ${versionData.checks.hasInvisible ? 'var(--success, #4ade80)' : 'var(--text-secondary, #aaa)'};">
                            ${versionData.checks.hasInvisible ? 'Yes' : 'No'} Invisible
                        </div>
                    </div>
                </div>
            </div>
        `;

        Logger.network('[ReCAPTCHA] Appending version modal to body');
        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => {
            modal.style.opacity = '1';
            Logger.network('[ReCAPTCHA] Version modal visible');
        }, 10);
    }

    /**
     * Display callback functions modal
     */
    displayCallbackModal(data) {
        Logger.network('[ReCAPTCHA] displayCallbackModal called with:', data);
        const modal = document.createElement('div');
        modal.className = 'recaptcha-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(2px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.2s;
        `;

        const { clients = [], domCallbacks = [], scriptCallbacks = [] } = data;
        const hasClients = clients.length > 0;
        const hasDomCallbacks = domCallbacks.length > 0;
        const hasScriptCallbacks = scriptCallbacks.length > 0;

        modal.innerHTML = `
            <div class="recaptcha-modal" style="background: var(--bg-secondary, #2a2a2a); border-radius: 8px; padding: 24px; max-width: 650px; width: 95%; max-height: 85vh; overflow-y: auto;">
                <div class="recaptcha-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h3 style="margin: 0; color: var(--text-primary, #fff); font-size: 16px; font-weight: 600;">reCAPTCHA Callbacks</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>
                <div class="recaptcha-modal-content" style="display: flex; flex-direction: column; gap: 24px;">

                    ${hasClients ? `
                    <!-- reCAPTCHA Clients Section -->
                    <div class="clients-section">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary, #fff); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent);">reCAPTCHA Clients</h4>
                        <div style="display: flex; flex-direction: column; gap: 14px;">
                            ${clients.map(client => `
                                <div class="client-card" style="background: var(--bg-tertiary, #1a1a1a); border-radius: 6px; padding: 16px; border: 1px solid rgba(255, 255, 255, 0.1);">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                                        <div style="display: flex; align-items: center; gap: 10px;">
                                            <span style="background: ${client.version === 'V3' ? '#8b5cf6' : '#3b82f6'}; color: white; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700;">
                                                ${client.version}
                                            </span>
                                            <span style="color: var(--text-secondary); font-size: 12px;">Client ID: ${client.id}</span>
                                        </div>
                                    </div>

                                    ${client.sitekey ? `
                                    <div style="margin-bottom: 12px;">
                                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">SiteKey</div>
                                        <code class="callback-value-clickable" data-copy="${client.sitekey}" style="color: var(--success, #4ade80); font-size: 12px; font-family: monospace; background: var(--bg-primary); padding: 8px 10px; border-radius: 4px; display: block; overflow-x: auto; border: 1px solid rgba(255, 255, 255, 0.05); cursor: pointer; transition: all 0.2s; user-select: text;">${client.sitekey}</code>
                                    </div>
                                    ` : ''}

                                    ${client.callback ? `
                                    <div style="margin-bottom: 12px;">
                                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Callback Function</div>
                                        <code class="callback-value-clickable" data-copy="${client.callback}" style="color: var(--success, #4ade80); font-size: 12px; font-family: monospace; background: var(--bg-primary); padding: 8px 10px; border-radius: 4px; display: block; border: 1px solid rgba(255, 255, 255, 0.05); cursor: pointer; transition: all 0.2s; user-select: text;">${client.callback}</code>
                                    </div>

                                    <div style="margin-bottom: 12px;">
                                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Callback Path</div>
                                        <code class="callback-value-clickable" data-copy="${client.callbackPath}" style="color: var(--text-secondary); font-size: 11px; font-family: monospace; background: var(--bg-primary); padding: 8px 10px; border-radius: 4px; display: block; overflow-x: auto; white-space: nowrap; border: 1px solid rgba(255, 255, 255, 0.05); cursor: pointer; transition: all 0.2s; user-select: text;">${client.callbackPath}</code>
                                    </div>
                                    ` : `
                                    <div style="padding: 10px; background: var(--bg-secondary); border-radius: 4px; font-size: 12px; color: var(--text-secondary);">
                                        No callback defined
                                    </div>
                                    `}

                                    ${client.pageurl ? `
                                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px; color: var(--text-secondary);">
                                        ${client.pageurl}
                                    </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${hasDomCallbacks ? `
                    <!-- DOM Callbacks Section -->
                    <div class="dom-callbacks-section">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary, #fff); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent);">DOM Callbacks</h4>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${domCallbacks.map(cb => `
                                <code class="callback-value-clickable" data-copy="${cb}" style="color: var(--success, #4ade80); font-family: monospace; font-size: 12px; padding: 12px; background: var(--bg-tertiary, #1a1a1a); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1); display: block; overflow-x: auto; cursor: pointer; transition: all 0.2s; user-select: text;">${cb}</code>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${hasScriptCallbacks ? `
                    <!-- Script Callbacks Section -->
                    <div class="script-callbacks-section">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary, #fff); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent);">Script Callbacks</h4>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${scriptCallbacks.map(cb => `
                                <code class="callback-value-clickable" data-copy="${cb}" style="color: var(--success, #4ade80); font-family: monospace; font-size: 12px; padding: 12px; background: var(--bg-tertiary, #1a1a1a); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1); display: block; overflow-x: auto; cursor: pointer; transition: all 0.2s; user-select: text;">${cb}</code>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${hasDomCallbacks ? `
                    <!-- DOM Callbacks Usage Examples -->
                    <div class="usage-examples-section" style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 24px;">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary, #fff); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent);">Callback Usage Examples</h4>
                        ${domCallbacks.map(cb => `
                        <div style="margin-bottom: 16px;">
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">Using callback: <code style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 3px; color: var(--success)">${cb}</code></div>
                            <code style="color: var(--success, #4ade80); font-family: monospace; font-size: 11px; padding: 12px; background: var(--bg-primary); border-radius: 4px; display: block; overflow-x: auto; border: 1px solid rgba(255, 255, 255, 0.05); line-height: 1.6; white-space: pre-wrap; word-break: break-word;">// When reCAPTCHA loads, this callback is called
function ${cb}(token) {
  Logger.network('reCAPTCHA token:', token);

  // NOTE: Endpoint and method may vary - change to match your backend
  fetch('/verify-captcha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      Logger.network('Verification successful!');
    }
  });
}</code>
                        </div>
                        `).join('')}
                    </div>
                    ` : ''}

                    ${hasScriptCallbacks && !hasDomCallbacks ? `
                    <!-- Script Callbacks Usage Examples -->
                    <div class="usage-examples-section" style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 24px;">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary, #fff); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent);">Callback Usage Examples</h4>
                        ${scriptCallbacks.map(cb => `
                        <div style="margin-bottom: 16px;">
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">Using callback: <code style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 3px; color: var(--success)">${cb}</code></div>
                            <code style="color: var(--success, #4ade80); font-family: monospace; font-size: 11px; padding: 12px; background: var(--bg-primary); border-radius: 4px; display: block; overflow-x: auto; border: 1px solid rgba(255, 255, 255, 0.05); line-height: 1.6; white-space: pre-wrap; word-break: break-word;">// When reCAPTCHA completes, this callback is invoked
function ${cb}(token) {
  Logger.network('reCAPTCHA token:', token);

  // NOTE: Endpoint and method may vary - change to match your backend
  fetch('/verify-captcha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      Logger.network('Verification successful!');
    }
  });
}</code>
                        </div>
                        `).join('')}
                    </div>
                    ` : ''}

                </div>
            </div>
        `;

        Logger.network('[ReCAPTCHA] Appending callback modal to body');
        document.body.appendChild(modal);

        // Add click-to-copy for all callback values
        modal.querySelectorAll('.callback-value-clickable').forEach(element => {
            element.addEventListener('click', () => {
                const text = element.dataset.copy;
                if (!text) {
                    return;
                }
                AdvancedUtils.copyToClipboard(text, element, {
                    notificationMessage: 'Copied to clipboard!'
                });
            });

            // Add hover effect
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.08)';
            });
            element.addEventListener('mouseleave', () => {
                element.style.background = 'var(--bg-primary)';
            });
        });

        const closeBtn = modal.querySelector('.advanced-modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => {
            modal.style.opacity = '1';
            Logger.network('[ReCAPTCHA] Callback modal visible');
        }, 10);
    }

    /**
     * Render capture history items (reCAPTCHA-specific format)
     */
    renderCaptureHistoryItems(items) {
        return items.map((item) => {
            const { url, hostname, captureData, timestamp } = item;
            const { version, siteKey, isEnterprise, isInvisible } = captureData;

            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}`;

            let versionDisplay = version;
            if (isEnterprise) {
                versionDisplay += ' Enterprise';
            }
            if (version === 'v2' && isInvisible) {
                versionDisplay += ' Invisible';
            }

            return `
                <div class="capture-card" data-capture-id="${item.id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${hostname}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${hostname}</span>
                                <span class="capture-time">${timeAgo}</span>
                            </div>
                            <div class="capture-type-row">
                                <span class="capture-type-label">Version</span>
                                <span class="capture-type-value">${versionDisplay}</span>
                            </div>
                        </div>
                        <button class="capture-expand" data-capture-id="${item.id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                    <div class="capture-sitekey-container">
                        <code class="capture-sitekey-code">${siteKey}</code>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Override renderCaptureDetailsContent to show reCAPTCHA-specific fields in modal
     * @param {object} capture - Capture data object
     * @returns {string} HTML for modal body content
     */
    renderCaptureDetailsContent(capture) {
        if (!capture || !capture.captureData) {
            return '<div class="advanced-modal-section"><span class="advanced-modal-error">No capture data available</span></div>';
        }

        const data = capture.captureData;
        const siteUrl = (data.siteUrl || capture.url || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const timestamp = new Date(capture.timestamp).toLocaleString();

        // Transform version display: v2 -> reCAPTCHA v2, v3 -> reCAPTCHA v3
        const versionDisplay = data.version ? `reCAPTCHA ${data.version}` : null;

        // Build features list (only show true/yes features)
        let features = [];
        if (data.isEnterprise) features.push('Enterprise');
        if (data.isInvisible) features.push('Invisible');
        if (data.isSRequired) features.push('S Parameter Required');
        if (data.hasSession) features.push('Has Session');

        return `
            <div style="display: flex; flex-direction: column; gap: 14px;">
                <!-- Primary Info Card -->
                <div style="background: var(--bg-tertiary); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                    ${versionDisplay ? `
                    <div>
                        <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Version</div>
                        <div class="copy-value" style="color: #4ade80; font-family: monospace; font-size: 12px; font-weight: 600;" data-copy="${AdvancedUtils.escapeHtml(data.version)}" data-copy-message="Version copied" title="Click to copy">${AdvancedUtils.escapeHtml(versionDisplay)}</div>
                    </div>
                    ` : ''}
                    ${data.action ? `
                    <div>
                        <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Action</div>
                        <div class="copy-value" style="color: #4ade80; font-family: monospace; font-size: 12px; word-break: break-all;" data-copy="${AdvancedUtils.escapeHtml(data.action)}" data-copy-message="Action copied" title="Click to copy">${AdvancedUtils.escapeHtml(data.action)}</div>
                    </div>
                    ` : ''}
                </div>

                <!-- Site Key Card -->
                ${data.siteKey ? `
                <div style="background: var(--bg-tertiary); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px;">
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Site Key</div>
                    <div class="copy-value" style="color: #4ade80; font-family: monospace; font-size: 12px; word-break: break-all; padding: 8px;" data-copy="${AdvancedUtils.escapeHtml(data.siteKey)}" data-copy-message="Site Key copied" title="Click to copy">${AdvancedUtils.escapeHtml(data.siteKey)}</div>
                </div>
                ` : ''}

                <!-- API Domain & Cookie Card -->
                ${data.apiDomain || data.requiredCookie ? `
                <div style="background: var(--bg-tertiary); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px; display: grid; grid-template-columns: ${data.apiDomain && data.requiredCookie ? '1fr 1fr' : '1fr'}; gap: 14px;">
                    ${data.apiDomain ? `
                    <div>
                        <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">API Domain</div>
                        <div class="copy-value" style="color: #4ade80; font-family: monospace; font-size: 12px; word-break: break-all;" data-copy="${AdvancedUtils.escapeHtml(data.apiDomain)}" data-copy-message="API Domain copied" title="Click to copy">${AdvancedUtils.escapeHtml(data.apiDomain)}</div>
                    </div>
                    ` : ''}
                    ${data.requiredCookie ? `
                    <div>
                        <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Required Cookie</div>
                        <div class="copy-value" style="color: #4ade80; font-family: monospace; font-size: 12px; word-break: break-all;" data-copy="${AdvancedUtils.escapeHtml(data.requiredCookie)}" data-copy-message="Cookie copied" title="Click to copy">${AdvancedUtils.escapeHtml(data.requiredCookie)}</div>
                    </div>
                    ` : ''}
                </div>
                ` : ''}

                <!-- Features Card (only if features exist) -->
                ${features.length > 0 ? `
                <div style="background: var(--bg-tertiary); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px;">
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 10px;">Features Detected</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${features.map(f => `<span style="background: rgba(74, 222, 128, 0.15); color: #4ade80; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;">${f}</span>`).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Site URL Card -->
                <div style="background: var(--bg-tertiary); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px;">
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Site URL</div>
                    <div class="copy-value" style="color: #60a5fa; font-size: 12px; word-break: break-all; padding: 8px;" data-copy="${siteUrl}" data-copy-message="URL copied" title="Click to copy">${siteUrl}</div>
                </div>

                <!-- Metadata Card -->
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 14px;">
                    <div style="font-size: 10px; color: var(--text-secondary);">Captured: <span style="color: var(--text-primary); font-weight: 600;">${timestamp}</span></div>
                </div>
            </div>
        `;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReCaptchaAdvanced;
} else if (typeof window !== 'undefined') {
    window.ReCaptchaAdvanced = ReCaptchaAdvanced;
}
