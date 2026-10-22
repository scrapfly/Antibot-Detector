// Chrome Web Store promotional images (store/promo/), drawn from the extension's own assets like the README hero:
//
//   small-tile-440x280.png    the small promo tile (shown in search results and category pages)
//   marquee-1400x560.png      the marquee promo tile (shown when the store features the extension)
//   store-icon-128.png        the store icon: 96x96 artwork with 16px of transparent padding, as Chrome's image
//                             guidelines ask, so it sits like the other icons on the store's light and dark pages
//
// The store cannot show these in other languages, so they are English only. The tiles must have no transparency
// (they are rendered on an opaque background); the icon keeps its transparent padding. Names, logos and the detector
// counts come from detectors/, so the images follow a new detector or a new logo. Fonts and logos are inlined, so the
// render needs no network. A run fails without writing anything if a text overflows or leaves its image.
//
// Playwright is not a project dependency. Install it anywhere and point at it:
//   npm i --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium
//   NODE_PATH=/tmp/pw/node_modules node scripts/generate-store-promo.js
// The images are uploaded by hand in the dashboard (Store listing → Graphic assets); see store/README.md.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const FormatUtils = require('../utils/format-utils.js');
const { escapeHtml, dataUri, fontSrc, fingerprintIconColor, loadDetection, tileHtml, categoryIcon } = require('./lib/store-art.js');

const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'store', 'promo');
const colors = FormatUtils.DEFAULT_CATEGORY_COLORS;
const brandIcon = dataUri(path.join(repoRoot, 'icons', 'icon128.png'), 'image/png');

// How many detectors ship, per category, and how many languages the interface speaks
const countOf = (category) => fs.readdirSync(path.join(repoRoot, 'detectors', category)).filter((f) => /^detect-.*\.json$/.test(f)).length;
const counts = { antibot: countOf('antibot'), captcha: countOf('captcha'), fingerprint: countOf('fingerprint') };
const detectorTotal = counts.antibot + counts.captcha + counts.fingerprint;
const languageTotal = fs.readdirSync(path.join(repoRoot, '_locales')).filter((d) => fs.existsSync(path.join(repoRoot, '_locales', d, 'messages.json'))).length;

// The vendors whose logos line the small tile
const LOGO_STRIP = ['antibot/detect-cloudflare.json', 'antibot/detect-akamai.json', 'antibot/detect-datadome.json',
    'antibot/detect-incapsula.json', 'captcha/detect-recaptcha.json', 'captcha/detect-hcaptcha.json'];
// The marquee card, as the README hero and the first store screenshot show it
const CARD = [
    { file: 'antibot/detect-cloudflare.json', confidence: 98 },
    { file: 'antibot/detect-datadome.json', confidence: 95 },
    { file: 'captcha/detect-recaptcha.json', confidence: 100 },
    { file: 'fingerprint/detect-canvas-fingerprint.json', confidence: 87 }
];

const fontFaces = `
    @font-face { font-family: "IBM Plex Sans"; font-weight: 400; src: ${fontSrc('IBMPlexSans-Regular.woff2')}; }
    @font-face { font-family: "IBM Plex Sans"; font-weight: 500; src: ${fontSrc('IBMPlexSans-Medium.woff2')}; }
    @font-face { font-family: "IBM Plex Sans"; font-weight: 600; src: ${fontSrc('IBMPlexSans-SemiBold.woff2')}; }
    @font-face { font-family: "IBM Plex Sans"; font-weight: 700; src: ${fontSrc('IBMPlexSans-Bold.woff2')}; }
    @font-face { font-family: "IBM Plex Mono"; font-weight: 500; src: ${fontSrc('IBMPlexMono-Medium.woff2')}; }`;

// The same night-blue ground as the hero and the screenshots
const ground = `
      radial-gradient(60% 75% at 14% 22%, rgba(59, 130, 246, 0.18), transparent 70%),
      radial-gradient(55% 80% at 82% 70%, rgba(34, 211, 238, 0.10), transparent 70%),
      linear-gradient(160deg, #111a2e 0%, #0b1222 50%, #070b15 100%)`;

const baseCss = (width, height) => `
    ${fontFaces}
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
    body { font-family: "IBM Plex Sans", system-ui, sans-serif; color: #f8fafc; -webkit-font-smoothing: antialiased; background: ${ground}; }
    .highlight { background: linear-gradient(90deg, #60a5fa 0%, #38bdf8 55%, #22d3ee 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; white-space: nowrap;
      font-family: "IBM Plex Mono", Consolas, monospace; font-weight: 500; color: #e2e8f0;
      background: rgba(30, 41, 59, 0.72); border: 1px solid rgba(148, 163, 184, 0.24); }
    .chip-icon { display: inline-flex; color: var(--cat); }
    .tile { flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #fff; }
    .tile img { width: 100%; height: 100%; object-fit: contain; }
    .tile-line { background: none; color: ${fingerprintIconColor()}; }
    .tile .glyph { background-color: currentColor; -webkit-mask-size: contain; mask-size: contain;
      -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center; }`;

const chipsHtml = () => ['antibot', 'captcha', 'fingerprint'].map((category) => `
      <span class="chip" style="--cat: ${colors[category]}"><span class="chip-icon">${categoryIcon(category)}</span>${escapeHtml(FormatUtils.categoryLabel(category))}</span>`).join('');

// ---- Small tile: 440x280, drawn at 1x (the store shows it at this size)
function smallTileHtml() {
    const logos = LOGO_STRIP.map((file) => loadDetection({ file, confidence: 0 }));
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    ${baseCss(440, 280)}
    .art { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 22px; }
    .brand { display: flex; align-items: center; gap: 9px; }
    .brand img { width: 40px; height: 40px; }
    .brand span { font-size: 27px; font-weight: 700; letter-spacing: -0.01em; }
    h1 { margin: 8px 0 0; font-size: 21px; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em; }
    .logos { display: flex; gap: 9px; margin: 16px 0 15px; }
    .logos .tile { width: 36px; height: 36px; border-radius: 9px; padding: 4px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); }
    .chips { display: flex; gap: 7px; }
    .chip { padding: 5px 9px 5px 7px; font-size: 11.5px; }
    .chip-icon svg { width: 14px; height: 14px; }
  </style></head><body><section class="art">
    <div class="brand"><img src="${brandIcon}" alt=""><span>Scrapfly</span></div>
    <h1>Detect <span class="highlight">anti-bots, CAPTCHAs</span><br>and fingerprinting</h1>
    <div class="logos">${logos.map(tileHtml).join('')}</div>
    <div class="chips">${chipsHtml()}</div>
  </section></body></html>`;
}

// ---- Marquee: 1400x560, laid out at 700x280 and drawn at 2x
function marqueeHtml() {
    const rows = CARD.map(loadDetection);
    const stats = [[detectorTotal, 'detectors'], [languageTotal, 'languages'], ['100%', 'on your device']];
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    ${baseCss(700, 280)}
    .art { height: 100%; display: grid; grid-template-columns: 1fr 292px; align-items: center; gap: 26px; padding: 0 28px 0 34px; }
    .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .brand img { width: 26px; height: 26px; }
    .brand span { font-size: 18px; font-weight: 700; }
    h1 { margin: 0; font-size: 30px; line-height: 1.1; font-weight: 700; letter-spacing: -0.02em; }
    p { margin: 9px 0 14px; color: #94a3b8; font-size: 11.5px; line-height: 1.45; }
    .stats { display: flex; gap: 20px; }
    .stat b { display: block; font-family: "IBM Plex Mono", Consolas, monospace; font-size: 19px; font-weight: 500; color: #f1f5f9; line-height: 1.1; }
    .stat span { font-size: 10px; color: #94a3b8; letter-spacing: 0.02em; }
    .card { border-radius: 12px; overflow: hidden; background: linear-gradient(180deg, #172036 0%, #111a2c 100%);
      border: 1px solid rgba(148, 163, 184, 0.2); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55), 0 0 0 4px rgba(30, 41, 59, 0.35); }
    .card-head { display: flex; align-items: center; gap: 7px; padding: 8px 11px; border-bottom: 1px solid rgba(148, 163, 184, 0.14); }
    .card-head img { width: 20px; height: 20px; }
    .card-head .title { font-size: 12px; font-weight: 600; }
    .count { margin-left: auto; padding: 2px 8px; border-radius: 999px; font-size: 9.5px; font-weight: 600; color: #bfdbfe;
      background: rgba(59, 130, 246, 0.18); border: 1px solid rgba(96, 165, 250, 0.4); }
    .rows { display: grid; gap: 5px; padding: 8px; }
    .row { position: relative; overflow: hidden; display: flex; align-items: center; gap: 9px; padding: 6px 10px 7px 7px; border-radius: 8px;
      background: rgba(30, 41, 59, 0.62); border: 1px solid rgba(148, 163, 184, 0.12); }
    .row .tile { width: 32px; height: 32px; border-radius: 7px; padding: 2px; }
    .row .tile img { border-radius: 5px; }
    .row .tile-line svg, .row .tile .glyph { width: 20px; height: 20px; }
    .info { flex: 1; min-width: 0; }
    .name { font-size: 11.5px; font-weight: 600; line-height: 15px; color: #f1f5f9; white-space: nowrap; }
    .meta { display: flex; align-items: center; gap: 4px; margin-top: 1px; font-size: 9.5px; line-height: 12px; color: #94a3b8; }
    .meta-icon { display: inline-flex; color: var(--cat); }
    .meta-icon svg { width: 10px; height: 10px; }
    .conf { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 11.5px; font-weight: 500; color: #e2e8f0; }
    .bar { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--cat); opacity: 0.9; }
  </style></head><body><section class="art">
    <div class="copy">
      <div class="brand"><img src="${brandIcon}" alt=""><span>Scrapfly</span></div>
      <h1>Detect<br><span class="highlight">Security Systems</span><br>in Real-Time</h1>
      <p>Anti-bot systems, CAPTCHAs and fingerprinting on any website, found in your browser as the page loads.</p>
      <div class="stats">${stats.map(([n, label]) => `<div class="stat"><b>${escapeHtml(n)}</b><span>${escapeHtml(label)}</span></div>`).join('')}</div>
    </div>
    <div class="card">
      <div class="card-head"><img src="${brandIcon}" alt=""><span class="title">Scrapfly</span><span class="count">${rows.length} detected</span></div>
      <div class="rows">${rows.map((row) => `
        <div class="row" style="--cat: ${colors[row.category]}">
          ${tileHtml(row)}
          <div class="info"><div class="name">${escapeHtml(row.name)}</div>
            <div class="meta"><span class="meta-icon">${categoryIcon(row.category)}</span>${escapeHtml(FormatUtils.categoryLabel(row.category))}</div></div>
          <div class="conf">${row.confidence}%</div>
          <div class="bar" style="width: ${row.confidence}%"></div>
        </div>`).join('')}</div>
    </div>
  </section></body></html>`;
}

// ---- Store icon: 128x128 with transparent padding (Chrome's image guidelines: 96x96 artwork, 16px around it). The
// artwork is the glyph of Scrapfly's official logo (store/promo/scrapfly-logo.svg, the logo of scrapfly.io), in its
// own blue: the wordmark beside it would be unreadable at this size.
const OFFICIAL_LOGO = path.join(repoRoot, 'store', 'promo', 'scrapfly-logo.svg');
const GLYPH_FILL = '#64b5f6'; // the logo's blue; the wordmark is a grey group beside it
function officialGlyphSvg() {
    const source = fs.readFileSync(OFFICIAL_LOGO, 'utf8');
    // Inkscape's svg: prefix is not HTML; keep the blue glyph's path, drop the grey wordmark and the editor's metadata
    const paths = [...source.matchAll(/<svg:path\b[^>]*\/>/g)].map((m) => m[0]);
    const glyph = paths.filter((tag) => tag.includes(`fill="${GLYPH_FILL}"`));
    if (!glyph.length || glyph.length === paths.length) throw new Error(`${path.relative(repoRoot, OFFICIAL_LOGO)}: the glyph and the wordmark could not be told apart`);
    return `<svg id="glyph" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45.294 10.556">${glyph.map((tag) => tag.replace(/<svg:path/, '<path')).join('')}</svg>`;
}
function storeIconHtml() {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 128px; height: 128px; overflow: hidden; background: transparent; }
    .badge { position: absolute; left: 16px; top: 16px; width: 96px; height: 96px; display: flex; align-items: center; justify-content: center; }
    #glyph { width: 96px; height: 96px; }
  </style></head><body><div class="badge">${officialGlyphSvg()}</div>
  <script>
    // Fit the view to the glyph alone, so it fills the 96px artwork square
    const svg = document.getElementById('glyph'); const box = svg.getBBox();
    svg.setAttribute('viewBox', [box.x, box.y, box.width, box.height].join(' '));
  </script></body></html>`;
}

async function checkLayout(page, label) {
    const problems = await page.evaluate(() => {
        const issues = [];
        const bounds = document.body.getBoundingClientRect();
        for (const el of document.querySelectorAll('.brand, h1, p, .chip, .card, .name, .meta, .conf, .count, .stat, .logos, .badge')) {
            const box = el.getBoundingClientRect();
            if (box.left < bounds.left - 0.5 || box.right > bounds.right + 0.5 || box.top < bounds.top - 0.5 || box.bottom > bounds.bottom + 0.5) issues.push(`${el.className || el.tagName} is outside the image`);
            if (el.scrollWidth > el.clientWidth + 1) issues.push(`${el.className || el.tagName} overflows: "${el.textContent.trim()}"`);
        }
        for (const group of ['.chips .chip', '.stats .stat', '.logos .tile']) {
            const items = [...document.querySelectorAll(group)];
            if (new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size > 1) issues.push(`${group} wraps onto a second line`);
        }
        return issues;
    });
    if (problems.length) throw new Error(`${label} layout problems:\n- ${problems.join('\n- ')}`);
}

const IMAGES = [
    { file: 'small-tile-440x280.png', html: smallTileHtml, viewport: { width: 440, height: 280 }, scale: 1, transparent: false },
    { file: 'marquee-1400x560.png', html: marqueeHtml, viewport: { width: 700, height: 280 }, scale: 2, transparent: false },
    { file: 'store-icon-128.png', html: storeIconHtml, viewport: { width: 128, height: 128 }, scale: 1, transparent: true }
];

async function main() {
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch({ channel: 'chromium', headless: true });
    try {
        const shots = [];
        for (const image of IMAGES) {
            const page = await browser.newPage({ viewport: image.viewport, deviceScaleFactor: image.scale });
            await page.setContent(image.html(), { waitUntil: 'load' });
            await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((img) => img.decode())); });
            await checkLayout(page, image.file);
            shots.push({ image, buffer: await page.screenshot({ omitBackground: image.transparent }) });
            await page.close();
        }
        // Written only once every image passed its checks
        for (const { image, buffer } of shots) {
            fs.writeFileSync(path.join(outDir, image.file), buffer);
            console.log(`Wrote store/promo/${image.file} (${image.viewport.width * image.scale}x${image.viewport.height * image.scale})`);
        }
        console.log(`Counts used: ${detectorTotal} detectors (${counts.antibot} anti-bot, ${counts.captcha} CAPTCHA, ${counts.fingerprint} fingerprinting), ${languageTotal} languages`);
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    main().catch((error) => { console.error(error); process.exit(1); });
}

module.exports = { smallTileHtml, marqueeHtml, storeIconHtml, IMAGES };
