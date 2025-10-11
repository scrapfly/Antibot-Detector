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
     * Render reCAPTCHA-specific tools
     */
    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="recaptchaClick">
                    <div class="tool-btn-icon">👆</div>
                    <div class="tool-btn-label">Obtain selector</div>
                </button>

                <button class="recaptcha-tool-btn" id="recaptchaExtract">
                    <div class="tool-btn-icon">🔑</div>
                    <div class="tool-btn-label">Extract SiteKey</div>
                </button>

                <button class="recaptcha-tool-btn" id="recaptchaCallback">
                    <div class="tool-btn-icon">📡</div>
                    <div class="tool-btn-label">reCAPTCHA callback</div>
                </button>

                <button class="recaptcha-tool-btn" id="recaptchaStartCapture">
                    <div class="tool-btn-icon">🎬</div>
                    <div class="tool-btn-label">Start Capturing</div>
                </button>
            </div>
        `;
    }

    /**
     * Setup tool-specific event listeners
     */
    setupToolListeners() {
        console.log('[ReCAPTCHA] Setting up tool listeners...');
        console.log('[ReCAPTCHA] this.clickRecaptcha exists:', typeof this.clickRecaptcha);
        console.log('[ReCAPTCHA] this.extractSiteKey exists:', typeof this.extractSiteKey);
        console.log('[ReCAPTCHA] this.captureCallback exists:', typeof this.captureCallback);
        console.log('[ReCAPTCHA] this.startCapturing exists:', typeof this.startCapturing);

        const actions = [
            { id: 'recaptchaClick', method: () => {
                console.log('[ReCAPTCHA] Click button pressed!');
                try {
                    this.clickRecaptcha();
                } catch (e) {
                    console.error('[ReCAPTCHA] Error in clickRecaptcha:', e);
                }
            }},
            { id: 'recaptchaExtract', method: () => {
                console.log('[ReCAPTCHA] Extract button pressed!');
                try {
                    this.extractSiteKey();
                } catch (e) {
                    console.error('[ReCAPTCHA] Error in extractSiteKey:', e);
                }
            }},
            { id: 'recaptchaCallback', method: () => {
                console.log('[ReCAPTCHA] Callback button pressed!');
                try {
                    this.captureCallback();
                } catch (e) {
                    console.error('[ReCAPTCHA] Error in captureCallback:', e);
                }
            }},
            { id: 'recaptchaStartCapture', method: () => this.startCapturing() }
        ];

        actions.forEach(({ id, method }) => {
            const btn = document.querySelector(`#${id}`);
            console.log(`[ReCAPTCHA] Button #${id}:`, btn ? 'FOUND' : 'NOT FOUND');
            if (btn) {
                btn.addEventListener('click', method);
                console.log(`[ReCAPTCHA] Added listener to #${id}`);
            }
        });
    }

    /**
     * Click reCAPTCHA and obtain selector
     */
    async clickRecaptcha() {
        console.log('[ReCAPTCHA] clickRecaptcha() called');
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

            console.log('[ReCAPTCHA] Script execution results:', results);
            if (results && results[0] && results[0].result) {
                console.log('[ReCAPTCHA] Calling displaySelectorModal with:', results[0].result);
                this.displaySelectorModal(results[0].result);
            } else {
                console.log('[ReCAPTCHA] No results from script execution');
            }
        } catch (error) {
            console.error('[ReCAPTCHA] Failed to click reCAPTCHA:', error);
            NotificationHelper.error('Failed to click: ' + error.message);
        }
    }

    /**
     * Extract sitekey from page
     */
    async extractSiteKey() {
        console.log('[ReCAPTCHA] extractSiteKey() called');
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

            console.log('[ReCAPTCHA] Extract script results:', results);
            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                console.log('[ReCAPTCHA] Extract result:', result);
                if (result.success) {
                    console.log('[ReCAPTCHA] Calling displaySiteKeyModal with:', result.sitekey);
                    this.displaySiteKeyModal(result.sitekey);
                } else {
                    console.log('[ReCAPTCHA] No sitekey found:', result.error);
                    NotificationHelper.error(result.error);
                }
            } else {
                console.log('[ReCAPTCHA] No results from extract script');
            }
        } catch (error) {
            console.error('[ReCAPTCHA] Failed to extract sitekey:', error);
            NotificationHelper.error('Failed to extract: ' + error.message);
        }
    }

    /**
     * Check reCAPTCHA version on page
     */
    async checkVersion() {
        console.log('[ReCAPTCHA] checkVersion() called');
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

            console.log('[ReCAPTCHA] Version check results:', results);
            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                console.log('[ReCAPTCHA] Version result:', result);
                if (result.success) {
                    console.log('[ReCAPTCHA] Calling displayVersionModal with:', result);
                    this.displayVersionModal(result);
                } else {
                    console.log('[ReCAPTCHA] Version check failed');
                }
            } else {
                console.log('[ReCAPTCHA] No results from version check script');
            }
        } catch (error) {
            console.error('[ReCAPTCHA] Failed to check version:', error);
            NotificationHelper.error('Failed to check: ' + error.message);
        }
    }

    /**
     * Capture callback function names
     */
    async captureCallback() {
        console.log('[ReCAPTCHA] captureCallback() called');
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
            console.error('[ReCAPTCHA] Failed to capture callback:', error);
            NotificationHelper.error('Failed to capture callback: ' + error.message);
        }
    }

    /**
     * Display selector click result modal
     */
    displaySelectorModal(result) {
        console.log('[ReCAPTCHA] displaySelectorModal called with:', result);
        const modal = document.createElement('div');
        modal.className = 'recaptcha-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
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
                    <h3 style="margin: 0; color: var(--text-primary, #fff);">🎯 Selector Detection</h3>
                    <button class="recaptcha-modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary, #aaa);">×</button>
                </div>
                <div class="recaptcha-modal-content">
                    ${result.success ? `
                        <div class="result-success" style="margin-bottom: 12px;">
                            <div class="result-label" style="font-weight: 600; margin-bottom: 4px; color: var(--text-primary, #fff);">✅ Method:</div>
                            <div class="result-value" style="color: var(--text-secondary, #aaa);">${result.method}</div>
                        </div>
                        ${result.selector ? `
                            <div class="result-success">
                                <div class="result-label" style="font-weight: 600; margin-bottom: 4px; color: var(--text-primary, #fff);">🎯 Selector:</div>
                                <code class="result-code" style="display: block; background: var(--bg-tertiary, #1a1a1a); padding: 8px; border-radius: 4px; color: var(--success, #4ade80); font-family: monospace;">${result.selector}</code>
                            </div>
                        ` : ''}
                    ` : `
                        <div class="result-error">
                            <div class="result-label" style="font-weight: 600; margin-bottom: 4px; color: var(--text-primary, #fff);">❌ Error:</div>
                            <div class="result-value" style="color: var(--danger, #f87171);">${result.error}</div>
                        </div>
                    `}
                </div>
            </div>
        `;

        console.log('[ReCAPTCHA] Appending modal to body');
        document.body.appendChild(modal);
        console.log('[ReCAPTCHA] Modal appended, setting up close handlers');

        const closeBtn = modal.querySelector('.recaptcha-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('[ReCAPTCHA] Close button clicked');
                modal.remove();
            });
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                console.log('[ReCAPTCHA] Modal overlay clicked');
                modal.remove();
            }
        });

        setTimeout(() => {
            modal.style.opacity = '1';
            console.log('[ReCAPTCHA] Modal opacity set to 1');
        }, 10);
    }

    /**
     * Display extracted sitekey modal
     */
    displaySiteKeyModal(sitekey) {
        console.log('[ReCAPTCHA] displaySiteKeyModal called with:', sitekey);
        const modal = document.createElement('div');
        modal.className = 'recaptcha-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
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
                    <h3 style="margin: 0; color: var(--text-primary, #fff);">🔑 Extracted SiteKey</h3>
                    <button class="recaptcha-modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary, #aaa);">×</button>
                </div>
                <div class="recaptcha-modal-content">
                    <div class="sitekey-display" style="display: flex; flex-direction: column; gap: 12px;">
                        <code class="sitekey-code" style="display: block; background: var(--bg-tertiary, #1a1a1a); padding: 12px; border-radius: 4px; color: var(--success, #4ade80); font-family: monospace; word-break: break-all;">${sitekey}</code>
                        <button class="copy-btn" data-copy="${sitekey}" style="padding: 8px 16px; background: var(--primary, #667eea); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">📋 Copy</button>
                    </div>
                </div>
            </div>
        `;

        console.log('[ReCAPTCHA] Appending sitekey modal to body');
        document.body.appendChild(modal);

        const copyBtn = modal.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', (e) => {
                navigator.clipboard.writeText(e.target.dataset.copy);
                NotificationHelper.success('SiteKey copied!');
            });
        }

        const closeBtn = modal.querySelector('.recaptcha-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => {
            modal.style.opacity = '1';
            console.log('[ReCAPTCHA] Sitekey modal visible');
        }, 10);
    }

    /**
     * Display version check results modal
     */
    displayVersionModal(versionData) {
        console.log('[ReCAPTCHA] displayVersionModal called with:', versionData);
        const modal = document.createElement('div');
        modal.className = 'recaptcha-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
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
                    <h3 style="margin: 0; color: var(--text-primary, #fff);">📋 Version Detection</h3>
                    <button class="recaptcha-modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary, #aaa);">×</button>
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
                            ${versionData.checks.hasV2Checkbox ? '✅' : '❌'} V2 Checkbox
                        </div>
                        <div class="check-item" style="padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; color: ${versionData.checks.hasV2Iframe ? 'var(--success, #4ade80)' : 'var(--text-secondary, #aaa)'};">
                            ${versionData.checks.hasV2Iframe ? '✅' : '❌'} V2 Iframe
                        </div>
                        <div class="check-item" style="padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; color: ${versionData.checks.hasV3Script ? 'var(--success, #4ade80)' : 'var(--text-secondary, #aaa)'};">
                            ${versionData.checks.hasV3Script ? '✅' : '❌'} V3 Script
                        </div>
                        <div class="check-item" style="padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; color: ${versionData.checks.hasInvisible ? 'var(--success, #4ade80)' : 'var(--text-secondary, #aaa)'};">
                            ${versionData.checks.hasInvisible ? '✅' : '❌'} Invisible
                        </div>
                    </div>
                </div>
            </div>
        `;

        console.log('[ReCAPTCHA] Appending version modal to body');
        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('.recaptcha-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => {
            modal.style.opacity = '1';
            console.log('[ReCAPTCHA] Version modal visible');
        }, 10);
    }

    /**
     * Display callback functions modal
     */
    displayCallbackModal(data) {
        console.log('[ReCAPTCHA] displayCallbackModal called with:', data);
        const modal = document.createElement('div');
        modal.className = 'recaptcha-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
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
            <div class="recaptcha-modal" style="background: var(--bg-secondary, #2a2a2a); border-radius: 8px; padding: 20px; max-width: 600px; width: 90%; max-height: 85vh; overflow-y: auto;">
                <div class="recaptcha-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; color: var(--text-primary, #fff); display: flex; align-items: center; gap: 8px;">
                        <span>📡</span> reCAPTCHA Callbacks
                    </h3>
                    <button class="recaptcha-modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary, #aaa);">×</button>
                </div>
                <div class="recaptcha-modal-content" style="display: flex; flex-direction: column; gap: 20px;">

                    ${hasClients ? `
                    <!-- reCAPTCHA Clients Section -->
                    <div class="clients-section">
                        <h4 style="margin: 0 0 12px 0; color: var(--text-primary, #fff); font-size: 14px; display: flex; align-items: center; gap: 6px;">
                            <span>🎯</span> reCAPTCHA Clients (from ___grecaptcha_cfg)
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            ${clients.map(client => `
                                <div class="client-card" style="background: var(--bg-tertiary, #1a1a1a); border-radius: 6px; padding: 14px; border-left: 3px solid ${client.version === 'V3' ? '#8b5cf6' : '#3b82f6'};">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span style="background: ${client.version === 'V3' ? '#8b5cf6' : '#3b82f6'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                                                ${client.version}
                                            </span>
                                            <span style="color: var(--text-secondary, #aaa); font-size: 12px;">Client ID: ${client.id}</span>
                                        </div>
                                    </div>

                                    ${client.sitekey ? `
                                    <div style="margin-bottom: 8px;">
                                        <div style="font-size: 11px; color: var(--text-secondary, #aaa); margin-bottom: 4px;">SiteKey:</div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <code style="color: var(--text-primary, #fff); font-size: 11px; font-family: monospace; flex: 1; overflow-x: auto;">${client.sitekey}</code>
                                            <button class="copy-btn" data-copy="${client.sitekey}" style="padding: 4px 10px; background: var(--primary, #667eea); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; flex-shrink: 0;">📋</button>
                                        </div>
                                    </div>
                                    ` : ''}

                                    ${client.callback ? `
                                    <div style="margin-bottom: 8px;">
                                        <div style="font-size: 11px; color: var(--text-secondary, #aaa); margin-bottom: 4px;">Callback Function:</div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <code style="color: var(--success, #4ade80); font-size: 12px; font-family: monospace; font-weight: 600; flex: 1;">${client.callback}</code>
                                            <button class="copy-btn" data-copy="${client.callback}" style="padding: 4px 10px; background: var(--primary, #667eea); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; flex-shrink: 0;">📋</button>
                                        </div>
                                    </div>

                                    <div style="margin-bottom: 8px;">
                                        <div style="font-size: 11px; color: var(--text-secondary, #aaa); margin-bottom: 4px;">Callback Path (for programmatic access):</div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <code style="color: var(--text-muted, #666); font-size: 10px; font-family: monospace; flex: 1; overflow-x: auto; white-space: nowrap;">${client.callbackPath}</code>
                                            <button class="copy-btn" data-copy="${client.callbackPath}" style="padding: 4px 10px; background: var(--primary, #667eea); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; flex-shrink: 0;">📋</button>
                                        </div>
                                    </div>
                                    ` : `
                                    <div style="padding: 8px; background: var(--bg-secondary, #2a2a2a); border-radius: 4px; font-size: 12px; color: var(--text-secondary, #aaa);">
                                        ⚠️ No callback defined for this client
                                    </div>
                                    `}

                                    ${client.pageurl ? `
                                    <div style="margin-top: 8px; font-size: 10px; color: var(--text-muted, #666);">
                                        📄 ${client.pageurl}
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
                        <h4 style="margin: 0 0 12px 0; color: var(--text-primary, #fff); font-size: 14px; display: flex; align-items: center; gap: 6px;">
                            <span>🏷️</span> DOM Callbacks (from data-callback attributes)
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            ${domCallbacks.map(cb => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px;">
                                    <code style="color: var(--success, #4ade80); font-family: monospace; font-size: 13px; flex: 1;">${cb}</code>
                                    <button class="copy-btn" data-copy="${cb}" style="margin-left: 12px; padding: 4px 10px; background: var(--primary, #667eea); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">📋</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${hasScriptCallbacks ? `
                    <!-- Script Callbacks Section -->
                    <div class="script-callbacks-section">
                        <h4 style="margin: 0 0 12px 0; color: var(--text-primary, #fff); font-size: 14px; display: flex; align-items: center; gap: 6px;">
                            <span>📜</span> Script Callbacks (from grecaptcha.render calls)
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            ${scriptCallbacks.map(cb => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px;">
                                    <code style="color: var(--success, #4ade80); font-family: monospace; font-size: 13px; flex: 1;">${cb}</code>
                                    <button class="copy-btn" data-copy="${cb}" style="margin-left: 12px; padding: 4px 10px; background: var(--primary, #667eea); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">📋</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                </div>
            </div>
        `;

        console.log('[ReCAPTCHA] Appending callback modal to body');
        document.body.appendChild(modal);

        modal.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const text = e.target.dataset.copy;
                navigator.clipboard.writeText(text).then(() => {
                    NotificationHelper.success('Copied to clipboard!');
                }).catch(() => {
                    NotificationHelper.error('Failed to copy');
                });
            });
        });

        const closeBtn = modal.querySelector('.recaptcha-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => {
            modal.style.opacity = '1';
            console.log('[ReCAPTCHA] Callback modal visible');
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
     * Override toggleCaptureDetails to show reCAPTCHA-specific fields
     * @param {string} captureId - The capture ID to toggle
     */
    async toggleCaptureDetails(captureId) {
        const captureCard = document.querySelector(`.capture-card[data-capture-id="${captureId}"]`);
        if (!captureCard) return;

        const existingDetails = captureCard.querySelector('.history-item-details');
        if (existingDetails) {
            existingDetails.remove();
            captureCard.classList.remove('expanded');
            return;
        }

        // Load full capture data
        const history = await this.loadCaptureHistory();
        const capture = history.find(item => (item.id || item.timestamp.toString()) === captureId);
        if (!capture || !capture.captureData) return;

        const data = capture.captureData;

        // Build details HTML with only non-empty reCAPTCHA fields
        const detailsHtml = `
            <div class="history-item-details">
                <div class="details-grid">
                    ${data.version ? `
                    <div class="detail-row">
                        <span class="detail-label">Version:</span>
                        <span class="detail-value copy-value" data-copy="${AdvancedUtils.escapeHtml(data.version)}" style="cursor: pointer; padding: 2px 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${data.version}</span>
                    </div>
                    ` : ''}
                    ${data.siteKey ? `
                    <div class="detail-row">
                        <span class="detail-label">Site Key:</span>
                        <span class="detail-value copy-value" data-copy="${AdvancedUtils.escapeHtml(data.siteKey)}" style="cursor: pointer; padding: 2px 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${data.siteKey}</span>
                    </div>
                    ` : ''}
                    ${data.action ? `
                    <div class="detail-row">
                        <span class="detail-label">Action:</span>
                        <span class="detail-value copy-value" data-copy="${AdvancedUtils.escapeHtml(data.action)}" style="cursor: pointer; padding: 2px 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${data.action}</span>
                    </div>
                    ` : ''}
                    ${data.isEnterprise ? `
                    <div class="detail-row">
                        <span class="detail-label">Enterprise:</span>
                        <span class="detail-value">Yes</span>
                    </div>
                    ` : ''}
                    ${data.isInvisible ? `
                    <div class="detail-row">
                        <span class="detail-label">Invisible:</span>
                        <span class="detail-value">Yes</span>
                    </div>
                    ` : ''}
                    ${data.isSRequired ? `
                    <div class="detail-row">
                        <span class="detail-label">S Parameter:</span>
                        <span class="detail-value">Required</span>
                    </div>
                    ` : ''}
                    ${data.apiDomain ? `
                    <div class="detail-row">
                        <span class="detail-label">API Domain:</span>
                        <span class="detail-value copy-value" data-copy="${AdvancedUtils.escapeHtml(data.apiDomain)}" style="cursor: pointer; padding: 2px 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${data.apiDomain}</span>
                    </div>
                    ` : ''}
                    ${data.hasSession ? `
                    <div class="detail-row">
                        <span class="detail-label">Has Session:</span>
                        <span class="detail-value">Yes</span>
                    </div>
                    ` : ''}
                    ${data.requiredCookie ? `
                    <div class="detail-row">
                        <span class="detail-label">Required Cookie:</span>
                        <span class="detail-value copy-value" data-copy="${AdvancedUtils.escapeHtml(data.requiredCookie)}" style="cursor: pointer; padding: 2px 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${data.requiredCookie}</span>
                    </div>
                    ` : ''}
                    <div class="detail-row">
                        <span class="detail-label">Site URL:</span>
                        <span class="detail-value copy-value" data-copy="${AdvancedUtils.escapeHtml(data.siteUrl || capture.url)}" style="cursor: pointer; padding: 2px 4px; border-radius: 3px; transition: background 0.2s;" title="Click to copy">${data.siteUrl || capture.url}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Captured:</span>
                        <span class="detail-value">${new Date(capture.timestamp).toLocaleString()}</span>
                    </div>
                </div>
                <div class="details-actions">
                    <button class="detail-action-btn copy-all-btn" data-capture-id="${captureId}">
                        📄 Copy All Data
                    </button>
                </div>
            </div>
        `;

        captureCard.insertAdjacentHTML('beforeend', detailsHtml);
        captureCard.classList.add('expanded');

        // Add click-to-copy functionality
        captureCard.querySelectorAll('.copy-value').forEach(element => {
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
                    console.error('[ReCaptcha] Copy failed:', error);
                }
            });
        });

        // Setup copy button
        const copyAllBtn = captureCard.querySelector('.copy-all-btn');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(JSON.stringify(capture.captureData, null, 2));
                    copyAllBtn.textContent = '✅ Copied!';
                    setTimeout(() => {
                        copyAllBtn.textContent = '📄 Copy All Data';
                    }, 2000);
                } catch (error) {
                    console.error('Failed to copy:', error);
                }
            });
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReCaptchaAdvanced;
} else if (typeof window !== 'undefined') {
    window.ReCaptchaAdvanced = ReCaptchaAdvanced;
}
