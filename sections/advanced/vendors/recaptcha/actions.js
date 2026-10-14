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
                        // Google's frame is cross-origin: its checkbox cannot be reached from the page
                        if (element && element.tagName !== 'IFRAME') {
                            element.click();
                            return { success: true, method: 'direct-click', selector };
                        }
                    }

                    if (typeof grecaptcha !== 'undefined' && grecaptcha.execute) {
                        try {
                            grecaptcha.execute();
                            return { success: true, method: 'grecaptcha-execute' };
                        } catch (e) {
                            return { success: false, errorKey: 'executeFailed', errorDetail: e.message, error: 'grecaptcha.execute() failed: ' + e.message };
                        }
                    }

                    return { success: false, errorKey: 'noElements', error: 'No reCAPTCHA elements found' };
                }
            });

            Logger.network('[ReCAPTCHA] Script execution results:', results);
            // Nothing came back (the page could not be read): say so instead of doing nothing
            this.displaySelectorModal((results && results[0] && results[0].result) || { success: false, errorKey: 'noElements' });
        } catch (error) {
            Logger.error('NETWORK', '[ReCAPTCHA] Failed to click reCAPTCHA:', error);
            NotificationHelper.error(recaptchaText('advRecaptchaFailedClickFmt', 'Failed to click: {0}', error.message));
        }
    };


    /**
     * Extract sitekey from page
     */
ReCaptchaAdvanced.prototype.extractSiteKey = function() {
        // Only reCAPTCHA-shaped keys (6L…), from every frame: widgets, the v3 render= script,
        // the anchor/challenge frames and inline render/execute calls
        return AdvancedSiteKeyView.extractFor(this, AdvancedCaptchaVendors.siteKeyOnly.recaptcha);
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
                        NotificationHelper.info(recaptchaText('advRecaptchaNoCallbacksFound', 'No reCAPTCHA callbacks found on this page. Make sure reCAPTCHA is loaded.'));
                    }
                }
            }
        } catch (error) {
            Logger.error('NETWORK', '[ReCAPTCHA] Failed to capture callback:', error);
            NotificationHelper.error(recaptchaText('advRecaptchaFailedCaptureCallbackFmt', 'Failed to capture callback: {0}', error.message));
        }
    };