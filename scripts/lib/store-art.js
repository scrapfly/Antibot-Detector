// Building blocks shared by the README hero (scripts/generate-readme-hero.js) and the
// Chrome Web Store screenshots (scripts/generate-store-screenshots.js): the fonts, the
// detector rows and the category chips, all read from the repository and inlined, so a
// render needs no network and gives the same image on every run.
//
// A store screenshot is laid out at 640x400 CSS px and rendered at 2x (1280x800): Chrome
// shows every screenshot at about 640x400, so every size below is the size a visitor
// sees. Headlines are at least 26px, subtitles 12.5px and chips 11px, which stay readable.

const fs = require('fs');
const path = require('path');
const FormatUtils = require('../../utils/format-utils.js');

const repoRoot = path.resolve(__dirname, '..', '..');

const escapeHtml = (text) => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const dataUri = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const fontSrc = (file) => `url("${dataUri(path.join(repoRoot, 'assets', 'fonts', file), 'font/woff2')}") format("woff2")`;

// IBM Plex Sans (Latin, Cyrillic) and the mono face the chips use
function latinFontFaces() {
    return `
    @font-face { font-family: "IBM Plex Sans"; font-weight: 400; src: ${fontSrc('IBMPlexSans-Regular.woff2')}; }
    @font-face { font-family: "IBM Plex Sans"; font-weight: 500; src: ${fontSrc('IBMPlexSans-Medium.woff2')}; }
    @font-face { font-family: "IBM Plex Sans"; font-weight: 600; src: ${fontSrc('IBMPlexSans-SemiBold.woff2')}; }
    @font-face { font-family: "IBM Plex Sans"; font-weight: 700; src: ${fontSrc('IBMPlexSans-Bold.woff2')}; }
    @font-face { font-family: "IBM Plex Mono"; font-weight: 500; src: ${fontSrc('IBMPlexMono-Medium.woff2')}; }`;
}

// The popup draws fingerprint icons in --accent-light, with no white plate
// (.fingerprint-icon in modules/styles/common.css). Read the dark theme's value,
// the theme this artwork uses.
function fingerprintIconColor() {
    const css = fs.readFileSync(path.join(repoRoot, 'modules', 'styles', 'common.css'), 'utf8');
    const darkTheme = /^:root\s*\{([^}]*)\}/m.exec(css);
    const accent = darkTheme && /--accent-light:\s*([^;]+);/.exec(darkTheme[1]);
    if (!accent) throw new Error('No --accent-light in the :root block of modules/styles/common.css');
    return accent[1].trim();
}

// How the popup's Detection cards, History and Rules show a detector's logo:
// a built-in fingerprint detector is the line icon from FormatUtils.FINGERPRINT_ICONS,
// any other fingerprint picture is tinted to the same colour, and everything
// else is the logo itself on a white tile.
function loadDetection({ file, confidence }) {
    const detector = JSON.parse(fs.readFileSync(path.join(repoRoot, 'detectors', file), 'utf8'));
    const category = FormatUtils.categoryKey(detector.category);
    const row = { name: detector.name, category, confidence };
    const svg = FormatUtils.FINGERPRINT_ICONS[String(detector.icon).toLowerCase()];
    if (svg) return { ...row, svg };
    const iconFile = path.join(repoRoot, 'detectors', 'icons', detector.icon);
    if (!fs.existsSync(iconFile)) throw new Error(`${file}: icon ${detector.icon} not found`);
    return { ...row, icon: dataUri(iconFile, 'image/png'), tinted: category === 'fingerprint' };
}

function tileHtml(row) {
    if (row.svg) return `<div class="tile tile-line">${row.svg}</div>`;
    if (row.tinted) {
        return `<div class="tile tile-line"><span class="glyph" style="-webkit-mask-image: url('${row.icon}'); mask-image: url('${row.icon}')"></span></div>`;
    }
    return `<div class="tile"><img src="${row.icon}" alt=""></div>`;
}

function categoryIcon(key) {
    const svg = FormatUtils.categoryIconSvg(key);
    if (!svg) throw new Error(`No category icon for "${key}"`);
    return svg;
}

// ---------------------------------------------------------------------------
// Chrome Web Store screenshots
// ---------------------------------------------------------------------------

const STORE_ART = Object.freeze({ width: 640, height: 400, scale: 2 });

// The popup images show the popup at this width, starting this far from the top and cut off by the
// bottom edge of the image
const POPUP_STAGE = Object.freeze({ top: 24, width: 318 });

// How much of a popup captured `popupWidth` CSS px wide (from its top) is visible in a store image
const visiblePopupHeight = (popupWidth) => (STORE_ART.height - POPUP_STAGE.top) * popupWidth / POPUP_STAGE.width;

// The page and its fonts are served by the renderer under this made-up origin (serveStoreArt)
const ART_ORIGIN = 'https://store-art.test';

// The detections the first image shows, like the README hero: name, logo and category
// come from the detector files, the confidence is a plausible demo value.
const HERO_DETECTIONS = Object.freeze([
    { file: 'antibot/detect-cloudflare.json', confidence: 98 },
    { file: 'antibot/detect-akamai.json', confidence: 95 },
    { file: 'captcha/detect-recaptcha.json', confidence: 100 },
    { file: 'fingerprint/detect-canvas-fingerprint.json', confidence: 87 }
]);

const CATEGORY_CHIPS = Object.freeze(['antibot', 'captcha', 'fingerprint']);

// What differs per language in the artwork. Everything else is the same for all of them.
//   rtl      the copy column is mirrored (the drawn card and the popup keep their own direction)
//   join     what joins the parts of a headline (HTML): a space, or a line break for Japanese and Chinese, which
//            are written without spaces and would be cut in the middle of a word wherever the line ends
//   tracking the headline's negative letter-spacing: only for scripts whose letters do not join or stack
//   keepAll  Korean breaks lines between words, not between syllables
//   phrases  Japanese breaks lines between phrases (word-break: auto-phrase), not inside a word
//   leading  line height of the headline and of the subtitle: Arabic, Devanagari and Thai
//            carry marks above and below the line
const ART_LANGUAGES = Object.freeze({
    ar: { rtl: true, tracking: false, leading: [1.35, 1.75] },
    hi: { tracking: false, leading: [1.4, 1.75] },
    th: { tracking: false, leading: [1.4, 1.75] },
    ja: { join: '<br>', phrases: true, tracking: false, leading: [1.3, 1.65] },
    ko: { keepAll: true, tracking: false, leading: [1.25, 1.6] },
    zh_CN: { join: '<br>', tracking: false, leading: [1.3, 1.65] },
    zh_TW: { join: '<br>', tracking: false, leading: [1.3, 1.65] }
});
const ART_DEFAULTS = Object.freeze({ rtl: false, join: ' ', tracking: true, keepAll: false, phrases: false, leading: [1.12, 1.5] });
const artLanguage = (lang) => ({ ...ART_DEFAULTS, ...ART_LANGUAGES[lang] });

// The value of <html lang>: the font stack of each language is chosen by it (:lang(zh), :lang(zh-TW))
const htmlLang = (lang) => lang.replace('_', '-');

// A Traditional Chinese text must be drawn with a Traditional font (the bundled Han fonts are Simplified
// and Japanese forms); the extension's own stack lists these system families first
// (a system lists a family under its own language's name too: 微軟正黑體 is Microsoft JhengHei)
const TRADITIONAL_SYSTEM_FONTS = Object.freeze([
    'PingFang TC', '蘋方-繁', 'Microsoft JhengHei', 'Microsoft JhengHei UI', '微軟正黑體', 'Noto Sans TC', 'Noto Sans CJK TC'
]);

// The fonts and the font stack of every language are the extension's own (modules/styles/common.css):
// a language is drawn with the typeface the popup uses for it. Their files are served under /fonts/
// and loaded through unicode-range, so only the faces a text needs are fetched.
function extensionFontCss() {
    const css = fs.readFileSync(path.join(repoRoot, 'modules', 'styles', 'common.css'), 'utf8');
    const faces = css.match(/@font-face\s*\{[^}]*\}/g) || [];
    const root = /^:root\s*\{([^}]*)\}/m.exec(css);
    const tokens = (root && root[1].match(/--font-(?:sans|mono)[\w-]*:[^;]+;/g)) || [];
    const langRules = css.match(/^:root:(?:lang|is)\([^{]*\{[^}]*\}/gm) || [];
    if (faces.length < 20 || tokens.length < 8 || langRules.length !== 2) {
        throw new Error('modules/styles/common.css no longer has the font faces, tokens and :lang rules scripts/lib/store-art.js reads');
    }
    return `${faces.join('\n').replace(/\.\.\/\.\.\/assets\/fonts\//g, '/fonts/')}
    :root { ${tokens.join(' ')} }
    ${langRules.join('\n')}`;
}

function artStyles({ cardWidth, lang }) {
    const { width, height } = STORE_ART;
    const language = artLanguage(lang);
    const [headingLeading, textLeading] = language.leading;
    return `
    ${extensionFontCss()}
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
    body {
      font-family: var(--font-sans);
      color: #f8fafc;
      -webkit-font-smoothing: antialiased;
      background:
        radial-gradient(300px 220px at 14% 26%, rgba(59, 130, 246, 0.16), transparent 70%),
        radial-gradient(340px 280px at 80% 60%, rgba(34, 211, 238, 0.09), transparent 70%),
        linear-gradient(160deg, #111a2e 0%, #0b1222 50%, #070b15 100%);
    }
    .art {
      height: 100%;
      display: grid;
      grid-template-columns: 1fr ${cardWidth}px;
      align-items: center;
      gap: 22px;
      padding-inline: 28px 22px;
    }
    /* The hero's three category chips, with their icons, stay on one row like the README's */
    .art-hero { padding-inline: 24px 20px; gap: 16px; }
    .art-hero .chip { padding: 5px 8px 5px 7px; gap: 5px; }
    .art-hero .chip-icon svg { width: 13px; height: 13px; }
    .copy { min-width: 0; }
    .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
    .brand img { width: 26px; height: 26px; }
    .brand span { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
    h1 { margin: 0; font-size: 27px; line-height: ${headingLeading}; font-weight: 700; letter-spacing: ${language.tracking ? '-0.02em' : '0'}; text-wrap: balance; }
    h1 .highlight {
      background: linear-gradient(90deg, #60a5fa 0%, #38bdf8 55%, #22d3ee 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    p { margin: 10px 0 16px; color: #94a3b8; font-size: 12.5px; line-height: ${textLeading}; text-wrap: pretty; }
    ${language.keepAll ? 'h1, p { word-break: keep-all; }' : ''}
    ${language.phrases ? 'h1, p { word-break: auto-phrase; }' : ''}

    .chips { display: flex; flex-wrap: wrap; gap: 7px; }
    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 9px; border-radius: 7px;
      font-family: var(--font-mono);
      font-size: 11px; font-weight: 500; color: #e2e8f0; white-space: nowrap;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(148, 163, 184, 0.22);
    }
    .chip-icon { display: inline-flex; color: var(--cat); }
    .chip-icon svg { width: 14px; height: 14px; }

    /* The drawn card of the first image (the README hero's card, smaller) */
    .card {
      direction: ltr;
      border-radius: 13px; overflow: hidden;
      background: linear-gradient(180deg, #172036 0%, #111a2c 100%);
      border: 1px solid rgba(148, 163, 184, 0.2);
      box-shadow: 0 22px 54px rgba(0, 0, 0, 0.55), 0 0 0 5px rgba(30, 41, 59, 0.35);
    }
    .card-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-bottom: 1px solid rgba(148, 163, 184, 0.14); }
    .card-head img { width: 22px; height: 22px; }
    .card-head .title { font-size: 13px; font-weight: 600; }
    .count {
      margin-left: auto; padding: 2px 8px; border-radius: 999px;
      font-size: 10.5px; font-weight: 600; color: #bfdbfe; white-space: nowrap;
      background: rgba(59, 130, 246, 0.18); border: 1px solid rgba(96, 165, 250, 0.4);
    }
    .rows { display: grid; gap: 6px; padding: 9px; }
    .row {
      position: relative; overflow: hidden;
      display: flex; align-items: center; gap: 9px;
      padding: 7px 11px 8px 7px; border-radius: 9px;
      background: rgba(30, 41, 59, 0.62);
      border: 1px solid rgba(148, 163, 184, 0.12);
    }
    .tile {
      flex-shrink: 0; width: 36px; height: 36px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      background: #fff; padding: 3px;
    }
    .tile img { width: 100%; height: 100%; object-fit: contain; border-radius: 5px; }
    .tile-line { background: none; color: ${fingerprintIconColor()}; }
    .tile-line svg { width: 22px; height: 22px; }
    .tile .glyph {
      width: 22px; height: 22px; background-color: currentColor;
      -webkit-mask-size: contain; mask-size: contain;
      -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
      -webkit-mask-position: center; mask-position: center;
    }
    .info { flex: 1; min-width: 0; }
    .name { font-size: 12px; font-weight: 600; line-height: 16px; color: #f1f5f9; white-space: nowrap; }
    .meta { display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 10.5px; line-height: 13px; color: #94a3b8; }
    .meta-icon { display: inline-flex; color: var(--cat); }
    .meta-icon svg { width: 11px; height: 11px; }
    .conf {
      flex-shrink: 0;
      font-family: var(--font-mono);
      font-size: 12px; font-weight: 500; color: #e2e8f0;
    }
    .bar { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--cat); opacity: 0.9; }

    /* The real popup, captured at 2x, cut off by the bottom edge of the image */
    .stage { direction: ltr; align-self: start; margin-top: ${POPUP_STAGE.top}px; height: ${height - POPUP_STAGE.top}px; overflow: hidden; }
    .popup {
      width: ${cardWidth}px;
      border-radius: 12px 12px 0 0; overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.25); border-bottom: 0;
      box-shadow: 0 22px 54px rgba(0, 0, 0, 0.55), 0 0 0 5px rgba(30, 41, 59, 0.35);
    }
    .popup img { display: block; width: 100%; height: auto; }`;
}

function chipsHtml(copy, categoryLabels) {
    const colors = FormatUtils.DEFAULT_CATEGORY_COLORS;
    if (copy.chips === 'categories') {
        return CATEGORY_CHIPS.map((category) => `
        <span class="chip" style="--cat: ${colors[category]}">
          <span class="chip-icon">${categoryIcon(category)}</span>${escapeHtml(categoryLabels[category])}
        </span>`).join('');
    }
    return (copy.chips || []).map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join('');
}

/**
 * One store image as HTML (laid out at STORE_ART.width x STORE_ART.height). Its fonts are
 * linked under /fonts/ of ART_ORIGIN: open it with openStoreArt().
 * @param {object} options
 * @param {string} [options.lang]  the language code, as the _locales folder (default en)
 * @param {'hero'|'popup'} options.kind  hero = the drawn card, popup = the real popup capture
 * @param {{before?: string, highlight: string, after?: string, subtitle: string, chips: string[]|'categories'}} options.copy
 * @param {string} [options.captureFile]  the popup capture (PNG, taken at 2x), for kind 'popup'
 * @param {{antibot: string, captcha: string, fingerprint: string}} options.categoryLabels
 * @param {string} options.detectedLabel  the count pill of the drawn card, with {0} for the number
 */
function storeArtHtml({ lang = 'en', kind, copy, captureFile, categoryLabels, detectedLabel }) {
    const colors = FormatUtils.DEFAULT_CATEGORY_COLORS;
    const language = artLanguage(lang);
    const brandIcon = dataUri(path.join(repoRoot, 'icons', 'icon128.png'), 'image/png');
    const parts = [copy.before, `<span class="highlight">${escapeHtml(copy.highlight)}</span>`, copy.after];
    // The hero keeps one part per line, like the README; the other headlines flow
    const headline = parts
        .map((part, index) => (index === 1 ? part : escapeHtml(part || '')))
        .filter(Boolean)
        .join(kind === 'hero' ? '<br>' : language.join);

    let stage;
    if (kind === 'hero') {
        const rows = HERO_DETECTIONS.map(loadDetection);
        const rowHtml = rows.map((row) => `
        <div class="row" style="--cat: ${colors[row.category]}">
          ${tileHtml(row)}
          <div class="info">
            <div class="name">${escapeHtml(row.name)}</div>
            <div class="meta"><span class="meta-icon">${categoryIcon(row.category)}</span>${escapeHtml(categoryLabels[row.category])}</div>
          </div>
          <div class="conf">${row.confidence}%</div>
          <div class="bar" style="width: ${row.confidence}%"></div>
        </div>`).join('');
        stage = `<div class="card">
      <div class="card-head">
        <img src="${brandIcon}" alt="">
        <span class="title">Scrapfly</span>
        <span class="count">${escapeHtml(detectedLabel.replace('{0}', String(rows.length)))}</span>
      </div>
      <div class="rows">${rowHtml}</div>
    </div>`;
    } else {
        stage = `<div class="stage"><div class="popup"><img src="${dataUri(captureFile, 'image/png')}" alt=""></div></div>`;
    }

    const cardWidth = kind === 'hero' ? 276 : POPUP_STAGE.width;
    return `<!doctype html>
<html lang="${htmlLang(lang)}" dir="${language.rtl ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8">
  <style>${artStyles({ cardWidth, lang })}
  </style>
</head>
<body>
  <section class="art art-${kind}">
    <div class="copy">
      <div class="brand"><img src="${brandIcon}" alt=""><span>Scrapfly</span></div>
      <h1>${headline}</h1>
      <p>${escapeHtml(copy.subtitle)}</p>
      <div class="chips">${chipsHtml(copy, categoryLabels)}</div>
    </div>
    ${stage}
  </section>
</body>
</html>`;
}

/**
 * Opens a storeArtHtml() document in a new page of `context` and waits until its fonts and
 * pictures are ready. The page and /fonts/<file> (assets/fonts) are answered by the renderer.
 * The review sheet of scripts/build-store-preview.js opens its own page the same way, in a larger viewport.
 */
async function openStoreArt(context, html, { width = STORE_ART.width, height = STORE_ART.height } = {}) {
    const page = await context.newPage();
    await page.route(`${ART_ORIGIN}/**`, (route) => {
        const { pathname } = new URL(route.request().url());
        if (pathname === '/art.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
        const font = /^\/fonts\/([\w.-]+\.woff2)$/.exec(pathname);
        const file = font && path.join(repoRoot, 'assets', 'fonts', font[1]);
        if (file && fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(file) });
        return route.abort();
    });
    await page.setViewportSize({ width, height });
    await page.goto(`${ART_ORIGIN}/art.html`, { waitUntil: 'load' });
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => img.decode()));
    });
    return page;
}

// Fails the run instead of shipping an image with clipped or overflowing text.
async function checkStoreArtLayout(page, label) {
    const problems = await page.evaluate(() => {
        const issues = [];
        const bounds = document.body.getBoundingClientRect();
        const lines = (el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
        for (const el of document.querySelectorAll('.brand, h1, p, .chip, .card, .name, .meta, .conf, .count')) {
            const box = el.getBoundingClientRect();
            if (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom) {
                issues.push(`${el.className || el.tagName} is outside the image`);
            }
            if (el.scrollWidth > el.clientWidth + 1) issues.push(`${el.className || el.tagName} overflows: "${el.textContent.trim()}"`);
        }
        const popup = document.querySelector('.popup');
        if (popup) {
            const box = popup.getBoundingClientRect();
            if (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top) issues.push('the popup is outside the image');
        }
        const h1 = document.querySelector('h1');
        if (h1 && lines(h1) > 3) issues.push(`the headline takes ${lines(h1)} lines (3 at most)`);
        const p = document.querySelector('p');
        if (p && lines(p) > 6) issues.push(`the subtitle takes ${lines(p)} lines (6 at most)`);
        const chips = [...document.querySelectorAll('.chip')];
        if (new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size > 2) {
            issues.push('the chips take more than two rows');
        }
        const copy = document.querySelector('.copy');
        if (copy && copy.getBoundingClientRect().height > bounds.height - 40) issues.push('the text column leaves less than 20px above and below');
        return issues;
    });
    if (problems.length) throw new Error(`${label}: layout problems:\n- ${problems.join('\n- ')}`);
}

/**
 * Fails the run when a text was drawn with a font the extension does not bundle. A missing
 * glyph silently falls back to whatever the machine has (a Simplified font for Traditional
 * Chinese, a box for a rare letter), and that image would look right at a glance.
 * Traditional Chinese is the exception that needs a system font (TRADITIONAL_SYSTEM_FONTS): the
 * bundled Han fonts only draw Simplified and Japanese forms.
 */
async function checkStoreArtFonts(page, label, lang) {
    const devtools = await page.context().newCDPSession(page);
    const used = new Map();
    try {
        await devtools.send('DOM.enable');
        await devtools.send('CSS.enable');
        const { root } = await devtools.send('DOM.getDocument', { depth: 0 });
        for (const selector of ['.brand span', 'h1', 'h1 .highlight', 'p', '.chip', '.name', '.meta', '.count', '.conf']) {
            const { nodeIds } = await devtools.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
            for (const nodeId of nodeIds) {
                const { fonts } = await devtools.send('CSS.getPlatformFontsForNode', { nodeId });
                for (const font of fonts) {
                    const key = `${font.familyName}|${font.isCustomFont ? 'bundled' : 'system'}`;
                    used.set(key, (used.get(key) || 0) + font.glyphCount);
                }
            }
        }
    } finally {
        await devtools.detach();
    }

    const problems = [];
    const traditional = lang === 'zh_TW';
    for (const key of used.keys()) {
        const [family, origin] = key.split('|');
        if (origin === 'system' && !(traditional && TRADITIONAL_SYSTEM_FONTS.includes(family))) {
            problems.push(`drawn with the system font "${family}", which the extension does not bundle (a glyph is missing from IBM Plex)`);
        }
        if (traditional && origin === 'bundled' && /^IBM Plex Sans (SC|JP|KR)$/.test(family)) {
            problems.push(`Traditional Chinese drawn with "${family}" (Simplified or Japanese forms): give the renderer one of ${TRADITIONAL_SYSTEM_FONTS.join(', ')} (see --fontconfig)`);
        }
    }
    if (problems.length) throw new Error(`${label}: font problems:\n- ${problems.join('\n- ')}`);
    return [...used.keys()].map((key) => key.split('|')[0]);
}

module.exports = {
    repoRoot, escapeHtml, dataUri, fontSrc, latinFontFaces, fingerprintIconColor,
    loadDetection, tileHtml, categoryIcon,
    STORE_ART, POPUP_STAGE, visiblePopupHeight, ART_ORIGIN, ART_LANGUAGES, HERO_DETECTIONS, CATEGORY_CHIPS, TRADITIONAL_SYSTEM_FONTS,
    extensionFontCss, htmlLang, storeArtHtml, openStoreArt, checkStoreArtLayout, checkStoreArtFonts
};
