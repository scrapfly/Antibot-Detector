/** Worker-owned in-page notice presentation. */
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
