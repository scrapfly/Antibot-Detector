// Geetest Script Analyzer
// Analyzes Geetest V3/V4 detection on pages (no network capture)

// Destructure helpers from BaseInterceptorHelpers
var showNotification = self.BaseInterceptorHelpers?.showNotification;

/**
 * Main message handler for Geetest messages (simplified - no capture functionality)
 */
function geetestHandleMessage(request, sender, sendResponse) {
    switch (request.type) {
        case 'GEETEST_CHECK_VERSION':
            handleGeetestCheckVersion(request, sender, sendResponse);
            return true;

        case 'GEETEST_ANALYZE_SCRIPTS':
            handleGeetestAnalyzeScripts(request, sender, sendResponse);
            return true;

        default:
            return false;
    }
}

/**
 * Check Geetest version (V3 or V4) by searching page for captchaId
 */
async function handleGeetestCheckVersion(message, sender, sendResponse) {
    const tabId = message.tabId;

    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab) {
            sendResponse({ error: 'Tab not found' });
            return;
        }

        // Show loading notification
        if (showNotification) {
            await showNotification(tabId, {
                type: 'loading',
                title: 'Detecting Geetest Version...',
                message: 'Reloading page to check version',
                duration: 5000
            }).catch(() => {});
        }

        // Reload page
        chrome.tabs.reload(tabId);

        // Wait for page to load, then check version with 4 different methods
        setTimeout(() => {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                world: 'MAIN',
                func: () => {
                    // METHOD 1: Search page HTML for "captchaId" string
                    const pageContent = document.documentElement.outerHTML;
                    const hasCaptchaIdString = pageContent.includes('captchaId');

                    // METHOD 2: Check for initGeetest4 function calls in page
                    const hasInitGeetest4 = pageContent.includes('initGeetest4');

                    // METHOD 3: Check window object for V4 initialization function
                    const hasV4WindowFunction = typeof window.initGeetest4 !== 'undefined';

                    // METHOD 4: Check for V4 script URLs
                    const hasV4ScriptUrl = Array.from(document.querySelectorAll('script[src]'))
                        .some(s => s.src.includes('geetest.com/v4/') || s.src.includes('gcaptcha4.geetest.com'));

                    // V4 if ANY of the 4 methods detects it, otherwise V3
                    if (hasCaptchaIdString || hasInitGeetest4 || hasV4WindowFunction || hasV4ScriptUrl) {
                        return 'v4';
                    } else {
                        return 'v3';
                    }
                }
            }).then(results => {
                const version = (results && results[0] && results[0].result) || 'v3';
                sendResponse({ version: version });
            }).catch(error => {
                sendResponse({ version: 'v3', error: error.message });
            });
        }, 3000);

        return;
    } catch (error) {
        sendResponse({ error: error.message });
    }
}

/**
 * Analyze scripts containing Geetest code
 */
async function handleGeetestAnalyzeScripts(message, sender, sendResponse) {
    const tabId = message.tabId;

    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab) {
            sendResponse({ error: 'Tab not found' });
            return;
        }

        // Show loading notification
        if (showNotification) {
            await showNotification(tabId, {
                type: 'loading',
                title: 'Analyzing Scripts...',
                message: 'Reloading page to extract scripts',
                duration: 5000
            }).catch(() => {});
        }

        // Reload page
        chrome.tabs.reload(tabId);

        // Wait for page to load, then inject enhanced analyzer with 4 detection methods
        setTimeout(() => {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                world: 'MAIN',
                func: () => {
                    const results = [];

                    // METHOD 1: Search inline script tags for initGeetest4/initGeetest
                    const scripts = Array.from(document.querySelectorAll('script'));
                    for (const script of scripts) {
                        const content = script.textContent;
                        if (!content) continue;

                        // V4 Detection: Multiple flexible patterns
                        // Pattern 1: initGeetest4({ captchaId: "..." })
                        const v4Pattern1 = /initGeetest4\s*\(\s*\{([^}]*captchaId[^}]*)\}/gi;
                        let v4Match;
                        while ((v4Match = v4Pattern1.exec(content)) !== null) {
                            const configText = v4Match[1];
                            const captchaIdMatch = configText.match(/captchaId\s*:\s*["']([a-f0-9]{32})["']/i);
                            const productMatch = configText.match(/product\s*:\s*["']([^"']+)["']/i);

                            if (captchaIdMatch) {
                                results.push({
                                    type: 'v4',
                                    source: 'inline-script',
                                    captchaId: captchaIdMatch[1],
                                    product: productMatch ? productMatch[1] : null,
                                    snippet: v4Match[0].substring(0, 300)
                                });
                            }
                        }

                        // Pattern 2: Just captchaId in any context (fallback)
                        if (results.length === 0) {
                            const captchaIdPattern = /["']?captchaId["']?\s*[:=]\s*["']([a-f0-9]{32})["']/gi;
                            let idMatch;
                            while ((idMatch = captchaIdPattern.exec(content)) !== null) {
                                // Get surrounding context (50 chars before and after)
                                const start = Math.max(0, idMatch.index - 50);
                                const end = Math.min(content.length, idMatch.index + idMatch[0].length + 50);
                                const snippet = content.substring(start, end);

                                results.push({
                                    type: 'v4',
                                    source: 'inline-script',
                                    captchaId: idMatch[1],
                                    product: null,
                                    snippet: '...' + snippet + '...'
                                });
                            }
                        }

                        // V3 Detection (only if no V4 found yet)
                        if (results.length === 0) {
                            const v3Pattern = /initGeetest\s*\(\s*\{([^}]*gt[^}]*)\}/gi;
                            let v3Match;
                            while ((v3Match = v3Pattern.exec(content)) !== null) {
                                const configText = v3Match[1];
                                const gtMatch = configText.match(/gt\s*:\s*["']([a-f0-9]{32})["']/i);
                                const challengeMatch = configText.match(/challenge\s*:\s*["']([a-f0-9]{32})["']/i);

                                if (gtMatch || challengeMatch) {
                                    results.push({
                                        type: 'v3',
                                        source: 'inline-script',
                                        gt: gtMatch ? gtMatch[1] : null,
                                        challenge: challengeMatch ? challengeMatch[1] : null,
                                        snippet: v3Match[0].substring(0, 300)
                                    });
                                }
                            }
                        }
                    }

                    // METHOD 2: Search DOM for data attributes
                    const domElements = document.querySelectorAll('[data-captcha-id], [data-gt], [data-challenge], [data-geetest-id]');
                    for (const el of domElements) {
                        if (el.dataset.captchaId || el.dataset.geetestId) {
                            const captchaId = el.dataset.captchaId || el.dataset.geetestId;
                            results.push({
                                type: 'v4',
                                source: 'dom-attribute',
                                captchaId: captchaId,
                                element: el.tagName.toLowerCase(),
                                snippet: `<${el.tagName.toLowerCase()} data-captcha-id="${captchaId}">`
                            });
                        }
                        if (el.dataset.gt) {
                            results.push({
                                type: 'v3',
                                source: 'dom-attribute',
                                gt: el.dataset.gt,
                                challenge: el.dataset.challenge || null,
                                element: el.tagName.toLowerCase(),
                                snippet: `<${el.tagName.toLowerCase()} data-gt="${el.dataset.gt}">`
                            });
                        }
                    }

                    // METHOD 3: Search script src URLs
                    const scriptTags = document.querySelectorAll('script[src]');
                    for (const tag of scriptTags) {
                        const src = tag.src;
                        if (src.includes('geetest.com/v4/') || src.includes('gcaptcha4.geetest.com')) {
                            results.push({
                                type: 'v4',
                                source: 'script-url',
                                url: src,
                                snippet: `<script src="${src}">`
                            });
                        } else if (src.includes('api.geetest.com') || src.includes('/gt.js')) {
                            results.push({
                                type: 'v3',
                                source: 'script-url',
                                url: src,
                                snippet: `<script src="${src}">`
                            });
                        }
                    }

                    // METHOD 4: Search JSON config blocks
                    const jsonScripts = document.querySelectorAll('script[type="application/json"]');
                    for (const json of jsonScripts) {
                        try {
                            const config = JSON.parse(json.textContent);
                            if (config.captchaId) {
                                results.push({
                                    type: 'v4',
                                    source: 'json-config',
                                    captchaId: config.captchaId,
                                    product: config.product || null,
                                    snippet: JSON.stringify(config, null, 2).substring(0, 300)
                                });
                            } else if (config.gt) {
                                results.push({
                                    type: 'v3',
                                    source: 'json-config',
                                    gt: config.gt,
                                    challenge: config.challenge || null,
                                    snippet: JSON.stringify(config, null, 2).substring(0, 300)
                                });
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }

                    return results.length > 0 ? results : null;
                }
            }).then(results => {
                if (results && results[0] && results[0].result) {
                    sendResponse({
                        scripts: results[0].result || [],
                        error: null
                    });
                } else {
                    sendResponse({
                        scripts: [],
                        error: 'No Geetest scripts found'
                    });
                }
            }).catch(error => {
                sendResponse({
                    scripts: [],
                    error: error.message
                });
            });
        }, 3000);

        return;
    } catch (error) {
        sendResponse({ error: error.message });
    }
}
