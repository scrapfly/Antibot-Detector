    /**
     * Click reCAPTCHA and obtain selector
     */
ReCaptchaAdvanced.prototype.clickRecaptcha = async function() {
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
    };


    /**
     * Extract sitekey from page
     */
ReCaptchaAdvanced.prototype.extractSiteKey = async function() {
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
    };


    /**
     * Capture callback function names
     */
ReCaptchaAdvanced.prototype.captureCallback = async function() {
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
    };