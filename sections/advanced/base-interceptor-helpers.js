/**
 * Base Interceptor Helpers
 * Reusable utilities for Advanced Module interceptors
 *
 * Provides pattern matching, checking, and extraction utilities
 * to eliminate code duplication across detector modules
 */

// ============================================================================
// PATTERN MATCHING UTILITIES
// ============================================================================

/**
 * Match a value against a pattern with various options
 * @param {string} value - Value to match
 * @param {string} pattern - Pattern to match against
 * @param {object} options - Matching options
 * @param {boolean} options.regex - Use regex matching
 * @param {boolean} options.caseSensitive - Case sensitive matching
 * @param {boolean} options.wholeWord - Match whole word only
 * @returns {boolean} True if match found
 */
function matchPattern(value, pattern, options = {}) {
    if (!value || !pattern) return false;

    const {
        regex = false,
        caseSensitive = true,
        wholeWord = false
    } = options;

    let testValue = value;
    let testPattern = pattern;

    // Apply case sensitivity
    if (!caseSensitive) {
        testValue = testValue.toLowerCase();
        testPattern = testPattern.toLowerCase();
    }

    // Regex matching
    if (regex) {
        try {
            const flags = caseSensitive ? '' : 'i';
            const re = new RegExp(testPattern, flags);
            return re.test(testValue);
        } catch (error) {
            Logger.error('UI', '[BaseInterceptor] Invalid regex pattern:', pattern, error);
            return false;
        }
    }

    // Whole word matching
    if (wholeWord) {
        const wordBoundaryPattern = `\\b${testPattern}\\b`;
        const flags = caseSensitive ? '' : 'i';
        try {
            const re = new RegExp(wordBoundaryPattern, flags);
            return re.test(testValue);
        } catch (error) {
            Logger.error('UI', '[BaseInterceptor] Invalid whole word pattern:', pattern, error);
            return false;
        }
    }

    // Simple substring matching
    return testValue.includes(testPattern);
}

// ============================================================================
// COOKIE CHECKING
// ============================================================================

/**
 * Check cookies against configuration
 * @param {string} tabUrl - Tab URL to get cookies for
 * @param {Array|object} config - Cookie configuration(s)
 *   Single: { name: {pattern, regex, caseSensitive}, value: {...}, returnValue: true }
 *   Array: [{ name: {...}, value: {...} }, ...]
 * @returns {Promise<Array>} Array of matched cookies with metadata
 */
async function checkCookies(tabUrl, config) {
    if (!tabUrl) {
        Logger.warn('UI', '[BaseInterceptor] checkCookies: No URL provided');
        return [];
    }

    const configs = Array.isArray(config) ? config : [config];
    const cookies = await chrome.cookies.getAll({ url: tabUrl });
    const matches = [];

    for (const cookieConfig of configs) {
        const { name: nameConfig, value: valueConfig, returnValue = true } = cookieConfig;

        for (const cookie of cookies) {
            let nameMatch = true;
            let valueMatch = true;

            // Check name if config provided
            if (nameConfig && nameConfig.pattern) {
                nameMatch = matchPattern(cookie.name, nameConfig.pattern, {
                    regex: nameConfig.regex || false,
                    caseSensitive: nameConfig.caseSensitive !== false,
                    wholeWord: nameConfig.wholeWord || false
                });
            }

            // Check value if config provided
            if (valueConfig && valueConfig.pattern && nameMatch) {
                valueMatch = matchPattern(cookie.value, valueConfig.pattern, {
                    regex: valueConfig.regex || false,
                    caseSensitive: valueConfig.caseSensitive !== false,
                    wholeWord: valueConfig.wholeWord || false
                });
            }

            // If both match, add to results
            if (nameMatch && valueMatch) {
                const result = {
                    name: cookie.name,
                    domain: cookie.domain,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    path: cookie.path,
                    expirationDate: cookie.expirationDate,
                    sameSite: cookie.sameSite
                };

                // Optionally include value
                if (returnValue) {
                    result.value = cookie.value;
                }

                matches.push(result);
            }
        }
    }

    return matches;
}

// ============================================================================
// URL CHECKING
// ============================================================================

/**
 * Check URLs against patterns
 * @param {string|Array} urls - URL(s) to check
 * @param {object} config - URL configuration
 *   {
 *     patterns: ['pattern1', 'pattern2'],  // URL patterns to match
 *     regex: boolean,  // Use regex matching
 *     caseSensitive: boolean,  // Case sensitive matching
 *     returnMatches: boolean,  // Return matched URLs
 *     extractParams: boolean,  // Extract query parameters from matched URLs
 *     extractPath: boolean,  // Extract path from matched URLs
 *     paramNames: ['param1', 'param2']  // Specific params to extract (if extractParams: true)
 *   }
 * @returns {object} { found: boolean, matches: [], params: {}, paths: [] }
 */
function checkUrls(urls, config = {}) {
    const {
        patterns = [],
        regex = false,
        caseSensitive = false,
        returnMatches = true,
        extractParams = false,
        extractPath = false,
        paramNames = []
    } = config;

    const result = {
        found: false,
        matches: [],
        params: {},
        paths: []
    };

    if (!urls || !patterns.length) {
        return result;
    }

    // Normalize to array
    const urlArray = Array.isArray(urls) ? urls : [urls];

    try {
        for (const url of urlArray) {
            if (!url) continue;

            for (const pattern of patterns) {
                const matched = matchPattern(url, pattern, { regex, caseSensitive });

                if (matched) {
                    result.found = true;

                    // Return matched URL
                    if (returnMatches) {
                        result.matches.push(url);
                    }

                    // Extract query parameters
                    if (extractParams) {
                        try {
                            const urlObj = new URL(url);
                            const params = {};

                            if (paramNames.length > 0) {
                                // Extract specific parameters
                                for (const paramName of paramNames) {
                                    const value = urlObj.searchParams.get(paramName);
                                    if (value !== null) {
                                        params[paramName] = value;
                                    }
                                }
                            } else {
                                // Extract all parameters
                                for (const [key, value] of urlObj.searchParams.entries()) {
                                    params[key] = value;
                                }
                            }

                            // Merge params (last match wins for duplicate keys)
                            Object.assign(result.params, params);
                        } catch (e) {
                            Logger.debug('UI', '[BaseInterceptor] Failed to parse URL for params:', url, e);
                        }
                    }

                    // Extract path
                    if (extractPath) {
                        try {
                            const urlObj = new URL(url);
                            const fullPath = urlObj.pathname + urlObj.search + urlObj.hash;
                            result.paths.push(fullPath);
                        } catch (e) {
                            Logger.debug('UI', '[BaseInterceptor] Failed to parse URL for path:', url, e);
                        }
                    }
                }
            }
        }
    } catch (error) {
        Logger.error('UI', '[BaseInterceptor] Error checking URLs:', error);
    }

    return result;
}

// ============================================================================
// PAYLOAD CHECKING (REQUEST BODY)
// ============================================================================

/**
 * Extract and check request payload/body
 * @param {object} requestBody - webRequest requestBody object
 * @param {object} config - Payload configuration
 *   {
 *     patterns: ['field1', 'field2'],  // Fields or patterns to look for
 *     extractFormat: 'json'|'urlencoded'|'raw'|'auto',  // Body format
 *     regex: boolean,  // Use regex for pattern matching
 *     returnMatches: boolean,  // Return matched values
 *     returnAll: boolean  // Return entire parsed body
 *   }
 * @returns {object} { found: boolean, matches: {}, raw: string }
 */
// ============================================================================
// STORAGE HELPERS
// ============================================================================

/**
 * Save capture data to history
 * @param {number} tabId - Tab ID
 * @param {object} captureData - Data to save
 * @param {object} options - Save options
 *   {
 *     type: string,  // Module type (e.g., 'akamai', 'recaptcha')
 *     expiryMinutes: number,  // How long to keep (default: 30)
 *     hostname: string  // Override hostname (auto-detected if not provided)
 *   }
 * @returns {Promise<object>} Saved capture item
 */
async function saveToHistory(tabId, captureData, options = {}) {
    const {
        type,
        expiryMinutes = 30,
        hostname = null
    } = options;

    try {
        // Get tab info
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            throw new Error('Tab not found or no URL');
        }

        const captureHostname = hostname || new URL(tab.url).hostname;
        const normalizedFavicon = UrlUtils.normalizeFaviconForStorage(tab.favIconUrl, tab.url || captureHostname);
        const newCapture = await AdvancedHistoryStore.appendCapture(type, {
            id: `${type}_${Date.now()}`,
            timestamp: Date.now(),
            url: tab.url,
            hostname: captureHostname,
            favicon: normalizedFavicon,
            data: captureData,
            captureData
        }, {
            expiryMinutes
        });

        Logger.debug('UI', `[BaseInterceptor] Saved ${type} capture to history:`, newCapture.id);
        return newCapture;

    } catch (error) {
        Logger.error('UI', '[BaseInterceptor] Error saving to history:', error);
        throw error;
    }
}

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

// In-page notifications are drawn inside the web page, where the extension's
// @font-face rules (common.css) do not exist. The bundled IBM Plex Sans faces
// are handed to the page as FontFace objects built from the woff2 bytes, under
// a family name no site uses. This needs no web_accessible_resources (so no
// probe-able extension URL) and no font-src allowance in the page's CSP. If the
// fonts cannot be installed, the stack falls back to the system UI font.
const PAGE_NOTIFICATION_FONT_FAMILY = 'Scrapfly IBM Plex Sans';
const PAGE_NOTIFICATION_FONT_STACK = `'${PAGE_NOTIFICATION_FONT_FAMILY}', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
const PAGE_NOTIFICATION_FONT_FILES = [
    ['assets/fonts/IBMPlexSans-Regular.woff2', '400'],
    ['assets/fonts/IBMPlexSans-SemiBold.woff2', '600']
];
let pageNotificationFontsPromise = null;

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

let pageNoticeLogoPromise = null;

/**
 * The Scrapfly logo as a data: URI (pages cannot load chrome-extension:// URLs;
 * the extension exposes no web_accessible_resources). Read once per context.
 */
function getPageNoticeLogo() {
    if (!pageNoticeLogoPromise) {
        pageNoticeLogoPromise = fetch(chrome.runtime.getURL('icons/icon32.png'))
            .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(buf => `data:image/png;base64,${arrayBufferToBase64(buf)}`)
            .catch((error) => {
                pageNoticeLogoPromise = null;
                Logger.warn('UI', '[BaseInterceptor] Notice logo unavailable:', error.message);
                return '';
            });
    }
    return pageNoticeLogoPromise;
}

/** The Plex faces as {weight, data: base64}, read once per context. */
function getPageNotificationFonts() {
    if (!pageNotificationFontsPromise) {
        pageNotificationFontsPromise = Promise.all(PAGE_NOTIFICATION_FONT_FILES.map(async ([file, weight]) => {
            const response = await fetch(chrome.runtime.getURL(file));
            if (!response.ok) throw new Error(`HTTP ${response.status} for ${file}`);
            return { weight, data: arrayBufferToBase64(await response.arrayBuffer()) };
        })).catch((error) => {
            pageNotificationFontsPromise = null;
            Logger.warn('UI', '[BaseInterceptor] Page notification fonts unavailable:', error.message);
            return [];
        });
    }
    return pageNotificationFontsPromise;
}

/**
 * Make IBM Plex Sans available to the page under PAGE_NOTIFICATION_FONT_FAMILY
 * (once per page). Never throws: the notification still shows without it.
 * @param {number} tabId
 */
async function injectPageNotificationFonts(tabId) {
    try {
        const fonts = await getPageNotificationFonts();
        if (!fonts.length) return;
        await chrome.scripting.executeScript({
            target: { tabId },
            args: [PAGE_NOTIFICATION_FONT_FAMILY, fonts],
            func: (family, faces) => {
                if (window.__scrapflyPageFontsInstalled || !document.fonts || typeof FontFace === 'undefined') return;
                window.__scrapflyPageFontsInstalled = true;
                for (const face of faces) {
                    const bytes = Uint8Array.from(atob(face.data), c => c.charCodeAt(0));
                    const fontFace = new FontFace(family, bytes.buffer, { weight: face.weight, style: 'normal', display: 'block' });
                    document.fonts.add(fontFace);
                    fontFace.load().catch(() => {});
                }
            }
        });
    } catch (error) {
        Logger.warn('UI', '[BaseInterceptor] Could not install page notification fonts:', error.message);
    }
}

/**
 * Text for an in-page notice, translated when the notice is drawn: callers in
 * the service worker may run before the chosen UI language has loaded, so
 * showNotification() waits for I18n.ready() and then resolves it.
 * @param {string} key - Message key
 * @param {string} fallback - English text, with {0}, {1}... placeholders
 * @param {...*} args - Placeholder values
 * @returns {{i18nKey: string, fallback: string, args: Array}}
 */
function pageText(key, fallback, ...args) {
    return { i18nKey: key, fallback, args };
}

/**
 * Plain string for a pageText() value; other values pass through unchanged.
 * @param {*} value
 * @returns {*}
 */
function resolvePageText(value) {
    if (!value || typeof value !== 'object' || typeof value.i18nKey !== 'string') return value;
    const args = Array.isArray(value.args) ? value.args.map(resolvePageText) : [];
    const I18nRef = (typeof I18n !== 'undefined') ? I18n : null;
    const translated = I18nRef ? (args.length ? I18nRef.format(value.i18nKey, ...args) : I18nRef.get(value.i18nKey)) : null;
    if (translated) return translated;
    return args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), String(value.fallback ?? ''));
}

/**
 * Translate now, after the UI language has loaded (for notices drawn
 * without showNotification()).
 * @returns {Promise<string>}
 */
async function pageTextNow(key, fallback, ...args) {
    if (typeof I18n !== 'undefined' && typeof I18n.ready === 'function') await I18n.ready();
    return resolvePageText(pageText(key, fallback, ...args));
}

/**
 * Show the Scrapfly in-page notice (one shared design for every module).
 *
 * A dark card in the top-right corner, drawn inside a Shadow DOM so the page's
 * CSS cannot restyle it: brand row, the module name, a short title, one line saying what to do
 * next, optional numbered steps, an optional countdown with a progress bar,
 * and a close button. Calling it again replaces the current notice in place.
 *
 * @param {number} tabId - Tab ID
 * @param {object} options
 *   type: 'capture'|'info'|'success'|'error'|'warning'|'loading'
 *   title, message: string or pageText()
 *   module: string (e.g. 'reCAPTCHA'), shown above the title
 *   steps: Array<string|pageText()>, numbered "do this" list
 *   activeStep: number (1-based) to highlight in steps
 *   countdown: seconds to count down (shows "Ends in Ns" and a bar)
 *   duration: ms before it closes on its own (0 = stays until closed)
 */
async function showNotification(tabId, options = {}) {
    const { type = 'info' } = options;
    if (typeof I18n !== 'undefined' && typeof I18n.ready === 'function') await I18n.ready();
    const texts = {
        title: resolvePageText(options.title) || '',
        message: resolvePageText(options.message) || '',
        module: resolvePageText(options.module) || '',
        steps: (Array.isArray(options.steps) ? options.steps : []).map(resolvePageText).filter(Boolean),
        close: resolvePageText(pageText('btnClose', 'Close')),
        endsIn: resolvePageText(pageText('pageNoticeEndsInFmt', 'Ends in {0}s', '{0}')),
        dir: (typeof I18n !== 'undefined' && typeof I18n.dir === 'function') ? I18n.dir() : 'ltr'
    };
    // "Monitoring started" notices without their own countdown show the capture window
    const captureSeconds = Math.round(Number(options.duration) / 1000);
    const countdown = options.countdown !== undefined
        ? options.countdown
        : (type === 'capture' && captureSeconds >= 15 ? captureSeconds : 0);
    const config = {
        type,
        activeStep: Number(options.activeStep) || 0,
        countdown: Math.max(0, Math.round(Number(countdown) || 0)),
        duration: options.duration === 0 ? 0 : (Number(options.duration) || 6000),
        fontStack: PAGE_NOTIFICATION_FONT_STACK,
        logo: await getPageNoticeLogo()
    };

    try {
        await injectPageNotificationFonts(tabId);
        await chrome.scripting.executeScript({
            target: { tabId },
            func: renderPageNotice,
            args: [texts, config]
        });
    } catch (err) {
        Logger.error('UI', '[BaseInterceptor] Failed to show notification:', err);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: texts.title,
            message: texts.message,
            priority: 2
        });
    }
}

/**
 * Drawn in the page by chrome.scripting (no closure access: everything it needs
 * comes in through its arguments). Kept as a named function so other modules
 * and content scripts can reuse the exact same look.
 */
function renderPageNotice(texts, config) {
    const HOST_ID = 'scrapfly-page-notice';
    const fontStack = config.fontStack;
    const TONES = {
        capture: '#3b82f6', info: '#3b82f6', success: '#22c55e',
        error: '#ef4444', warning: '#f59e0b', loading: '#f59e0b'
    };
    const tone = TONES[config.type] || TONES.info;

    // Legacy notices from older builds
    document.querySelectorAll('[id^="scrapfly-capture-notification"], style[data-scrapfly-notification]').forEach(n => n.remove());
    if (window.scrapflyTimerInterval) { clearInterval(window.scrapflyTimerInterval); window.scrapflyTimerInterval = null; }
    if (window.__scrapflyNoticeTimer) { clearTimeout(window.__scrapflyNoticeTimer); window.__scrapflyNoticeTimer = null; }

    let host = document.getElementById(HOST_ID);
    const fresh = !host;
    if (fresh) {
        host = document.createElement('div');
        host.id = HOST_ID;
        host.style.cssText = 'all: initial; position: fixed; top: 16px; right: 16px; z-index: 2147483647;';
        host.attachShadow({ mode: 'open' });
        (document.body || document.documentElement).appendChild(host);
    }
    if (texts.dir === 'rtl') { host.style.right = 'auto'; host.style.left = '16px'; }
    const root = host.shadowRoot;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const steps = (texts.steps || []).map((s, i) => {
        const n = i + 1;
        const state = config.activeStep ? (n < config.activeStep ? 'done' : (n === config.activeStep ? 'active' : '')) : '';
        return `<li class="step ${state}"><span class="num">${state === 'done' ? '✓' : n}</span><span>${esc(s)}</span></li>`;
    }).join('');

    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: ${fontStack} !important; }
        .card { width: 320px; max-width: calc(100vw - 32px); background: #1f1f1f; color: #e8e8e8;
          border: 1px solid #3a3a3a; border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.2);
          overflow: hidden; direction: ${texts.dir === 'rtl' ? 'rtl' : 'ltr'};
          animation: in .22s cubic-bezier(.2,.8,.2,1) both; }
        .card.out { animation: out .18s ease-in both; }
        @keyframes in { from { opacity: 0; transform: translateY(-8px) scale(.98); } to { opacity: 1; transform: none; } }
        @keyframes out { to { opacity: 0; transform: translateY(-6px) scale(.98); } }
        .body { padding: 12px 12px 12px 14px; }
        .top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .logo { width: 18px; height: 18px; border-radius: 4px; }
        .brand { font-size: 11.5px; font-weight: 600; color: #b3b3b3; }
        .close { margin-inline-start: auto; width: 24px; height: 24px; border-radius: 6px; border: 1px solid transparent;
          background: transparent; color: #9a9a9a; cursor: pointer; display: grid; place-items: center; padding: 0; }
        .close:hover { background: #2e2e2e; border-color: #444; color: #fff; }
        .module { font-size: 10.5px; font-weight: 600; letter-spacing: .4px; text-transform: uppercase; color: #8f8f8f; margin-bottom: 2px; }
        .title { font-size: 14px; font-weight: 600; color: #fff; line-height: 1.3; }
        .msg { margin-top: 4px; font-size: 12.5px; line-height: 1.45; color: #c9c9c9; }
        ol { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
        .step { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 1.4; color: #b3b3b3; }
        .num { flex: none; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
          font-size: 10.5px; font-weight: 600; background: #2c2c2c; border: 1px solid #444; color: #c9c9c9; }
        .step.active { color: #fff; }
        .step.active .num { background: ${tone}; border-color: ${tone}; color: #fff; }
        .step.done { color: #8f8f8f; }
        .step.done .num { background: #22c55e22; border-color: #22c55e66; color: #22c55e; }
        .foot { margin-top: 10px; display: flex; align-items: center; gap: 8px; font-size: 11px; color: #9a9a9a; }
        .bar { flex: 1; height: 3px; border-radius: 2px; background: #333; overflow: hidden; }
        .bar > i { display: block; height: 100%; background: ${tone}; width: 100%; transition: width 1s linear; }
      </style>
      <div class="card ${esc(config.type)}" role="status" aria-live="polite">
        <div class="body">
          <div class="top">
            ${config.logo ? `<img class="logo" src="${esc(config.logo)}" alt="">` : ''}
            <span class="brand">Scrapfly</span>
            <button class="close" type="button" aria-label="${esc(texts.close)}" title="${esc(texts.close)}">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </button>
          </div>
          ${texts.module ? `<div class="module">${esc(texts.module)}</div>` : ''}
          <div class="title">${esc(texts.title)}</div>
          ${texts.message ? `<div class="msg">${esc(texts.message)}</div>` : ''}
          ${steps ? `<ol>${steps}</ol>` : ''}
          ${config.countdown ? `<div class="foot"><span class="left"></span><span class="bar"><i></i></span></div>` : ''}
        </div>
      </div>`;

    const card = root.querySelector('.card');
    const dismiss = () => {
        if (window.__scrapflyNoticeTick) { clearInterval(window.__scrapflyNoticeTick); window.__scrapflyNoticeTick = null; }
        if (window.__scrapflyNoticeTimer) { clearTimeout(window.__scrapflyNoticeTimer); window.__scrapflyNoticeTimer = null; }
        card.classList.add('out');
        setTimeout(() => host.remove(), 180);
    };
    root.querySelector('.close').addEventListener('click', dismiss);

    if (window.__scrapflyNoticeTick) { clearInterval(window.__scrapflyNoticeTick); window.__scrapflyNoticeTick = null; }
    if (config.countdown) {
        const total = config.countdown;
        const endAt = Date.now() + total * 1000;
        const left = root.querySelector('.left');
        const bar = root.querySelector('.bar > i');
        const tick = () => {
            const s = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
            left.textContent = String(texts.endsIn || '{0}s').split('{0}').join(String(s));
            bar.style.width = `${(s / total) * 100}%`;
            if (s <= 0) { clearInterval(window.__scrapflyNoticeTick); window.__scrapflyNoticeTick = null; }
        };
        tick();
        window.__scrapflyNoticeTick = setInterval(tick, 1000);
    }
    if (config.duration > 0) window.__scrapflyNoticeTimer = setTimeout(dismiss, config.duration);
}

// ============================================================================
// CAPTURE LIFECYCLE HELPERS
// ============================================================================

/**
 * Check whether capture state map is ready.
 * @param {Map} captureStateRef
 * @returns {boolean}
 */
function isCaptureStateReady(captureStateRef) {
    return !!(captureStateRef && typeof captureStateRef.get === 'function' && typeof captureStateRef.set === 'function');
}

/**
 * Get capture state for a tab.
 * @param {Map} captureStateRef
 * @param {number} tabId
 * @returns {object|null}
 */
function getCaptureState(captureStateRef, tabId) {
    if (!isCaptureStateReady(captureStateRef)) {
        return null;
    }
    return captureStateRef.get(tabId) || null;
}

/**
 * Set/update timeout for a capture state entry.
 * @param {Map} captureStateRef
 * @param {number} tabId
 * @param {number} ms
 * @param {Function} onTimeout
 * @returns {boolean}
 */
function setCaptureTimeout(captureStateRef, tabId, ms, onTimeout) {
    const state = getCaptureState(captureStateRef, tabId);
    if (!state) {
        return false;
    }

    if (state.timeout) {
        clearTimeout(state.timeout);
    }

    state.timeout = setTimeout(() => {
        if (typeof onTimeout === 'function') {
            onTimeout();
        }
    }, ms);

    captureStateRef.set(tabId, state);
    return true;
}

/**
 * Clear timeout on state object if present.
 * @param {object} state
 */
function clearCaptureTimeout(state) {
    if (!state) {
        return;
    }

    if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
    }

    if (state.captureTimeout) {
        clearTimeout(state.captureTimeout);
        state.captureTimeout = null;
    }
}

/**
 * Remove capture state for a tab and clear timeout if present.
 * @param {Map} captureStateRef
 * @param {number} tabId
 * @returns {object|null}
 */
function removeCaptureState(captureStateRef, tabId) {
    const state = getCaptureState(captureStateRef, tabId);
    if (!state) {
        return null;
    }
    clearCaptureTimeout(state);
    captureStateRef.delete(tabId);
    return state;
}

/**
 * Remove a webRequest listener if no captures remain.
 * @param {object} options
 * @param {Map} options.captureStateRef
 * @param {Function} options.listenerRef
 * @param {Function} options.removeFn
 * @returns {boolean}
 */
function removeListenerIfIdle(options = {}) {
    const { captureStateRef, listenerRef, removeFn } = options;
    if (!isCaptureStateReady(captureStateRef)) {
        return false;
    }
    if (captureStateRef.size !== 0) {
        return false;
    }
    if (typeof listenerRef !== 'function' || typeof removeFn !== 'function') {
        return false;
    }

    try {
        removeFn(listenerRef);
        return true;
    } catch (error) {
        Logger.error('NETWORK', '[BaseInterceptor] Failed to remove listener:', error);
        return false;
    }
}

// ============================================================================
// MANAGED LISTENER LIFECYCLE
// ============================================================================

// tabId -> Map(kind -> { listener, removeFn })
const managedListenersByTab = new Map();

/**
 * Register a listener for lifecycle cleanup.
 * If an entry exists for the same {tabId, kind}, it is removed first.
 * @param {number|string} tabId
 * @param {string} kind
 * @param {Function} listener
 * @param {Function} removeFn
 * @returns {boolean}
 */
function registerManagedListener(tabId, kind, listener, removeFn) {
    if (tabId === undefined || tabId === null || !kind || typeof listener !== 'function' || typeof removeFn !== 'function') {
        return false;
    }

    const tabKey = String(tabId);
    if (!managedListenersByTab.has(tabKey)) {
        managedListenersByTab.set(tabKey, new Map());
    }

    const tabListeners = managedListenersByTab.get(tabKey);
    const existing = tabListeners.get(kind);
    if (existing && typeof existing.removeFn === 'function' && typeof existing.listener === 'function') {
        try {
            existing.removeFn(existing.listener);
        } catch (error) {
            Logger.error('NETWORK', '[BaseInterceptor] Failed to remove existing managed listener:', error);
        }
    }

    tabListeners.set(kind, { listener, removeFn });
    return true;
}

/**
 * Remove a specific managed listener.
 * @param {number|string} tabId
 * @param {string} kind
 * @returns {boolean}
 */
function removeManagedListener(tabId, kind) {
    const tabKey = String(tabId);
    const tabListeners = managedListenersByTab.get(tabKey);
    if (!tabListeners) {
        return false;
    }

    const existing = tabListeners.get(kind);
    if (!existing) {
        return false;
    }

    try {
        existing.removeFn(existing.listener);
    } catch (error) {
        Logger.error('NETWORK', '[BaseInterceptor] Failed to remove managed listener:', error);
        return false;
    } finally {
        tabListeners.delete(kind);
        if (tabListeners.size === 0) {
            managedListenersByTab.delete(tabKey);
        }
    }

    return true;
}

/**
 * Cleanup all managed listeners for a tab.
 * @param {number|string} tabId
 * @returns {number} Number of listeners removed
 */
function cleanupManagedListeners(tabId) {
    const tabKey = String(tabId);
    const tabListeners = managedListenersByTab.get(tabKey);
    if (!tabListeners) {
        return 0;
    }

    let removedCount = 0;
    Array.from(tabListeners.keys()).forEach((kind) => {
        if (removeManagedListener(tabKey, kind)) {
            removedCount += 1;
        }
    });

    return removedCount;
}

/**
 * Handle tab URL change abort for active capture.
 * @param {object} options
 * @returns {boolean}
 */
function handleUrlChangeAbort(options = {}) {
    const {
        tabId,
        changeInfo,
        state,
        captureStateRef,
        listenerRef,
        removeFn,
        loggerPrefix = 'Capture'
    } = options;

    if (!changeInfo || !changeInfo.url || !state || !state.captureUrl || changeInfo.url === state.captureUrl) {
        return false;
    }

    Logger.network(`[${loggerPrefix}] URL changed, clearing capture state for tab:`, tabId);
    removeCaptureState(captureStateRef, tabId);
    removeListenerIfIdle({ captureStateRef, listenerRef, removeFn });
    return true;
}

/**
 * Show standardized "capture started" notification.
 * @param {number} tabId
 * @param {object} options
 * @returns {Promise<void>}
 */
async function showCaptureStarted(tabId, options = {}) {
    const {
        title = pageText('pageNoticeCaptureActive', 'Capture Active'),
        message = pageText('pageNoticeReloadToCapture', 'Reload the page to trigger capture.'),
        duration = 60000,
        ...rest
    } = options;

    // module / steps / activeStep / countdown pass straight through. A capture
    // notice stays up for the whole capture window and counts it down.
    const seconds = Math.round(Number(duration) / 1000);
    return showNotification(tabId, {
        countdown: seconds > 0 ? seconds : 0,
        ...rest,
        type: 'capture',
        title,
        message,
        duration
    });
}

// ============================================================================
// VERSION DETECTION
// ============================================================================

// ============================================================================
// EXPORTS (for both popup and service worker contexts)
// ============================================================================

// Service workers use global scope (self), popups use window
// Functions are automatically available in global scope when imported via importScripts()

const globalContext = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);

    if (globalContext) {
    globalContext.BaseInterceptorHelpers = {
        matchPattern,
        checkCookies,
        checkUrls,
        saveToHistory,
        showNotification,
        isCaptureStateReady,
        getCaptureState,
        setCaptureTimeout,
        clearCaptureTimeout,
        removeCaptureState,
        removeListenerIfIdle,
        registerManagedListener,
        removeManagedListener,
        cleanupManagedListeners,
        handleUrlChangeAbort,
        showCaptureStarted
    };

    Logger.debug('UI', '[BaseInterceptorHelpers] Loaded in context:', typeof window !== 'undefined' ? 'popup' : 'service-worker');
}
