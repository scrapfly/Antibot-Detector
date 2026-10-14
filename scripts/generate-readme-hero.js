// README hero image (assets/readme/hero.png), drawn from the extension's own assets.
//
// GitHub shows README images at most about 880px wide, so the artwork is laid
// out at exactly 880x440 CSS pixels and rendered at 2x (1760x880): every size
// in the stylesheet below is the size a reader sees on GitHub. The left side is
// the headline and the three detection categories, with the same category icons
// and colours the popup uses (utils/format-utils.js). The right side is a
// popup-like card with real detections: names and logos come from the detector
// files in detectors/, so the picture follows a renamed detector or a new logo.
//
// Everything (fonts, logos, icons) is read from the repository and inlined, so
// the render needs no network and gives the same image on every run. The run
// fails without writing the image if any text overflows or leaves the frame,
// or if the chips wrap onto a second line (for example after a longer name).
//
// Playwright is not a project dependency. Install it anywhere and point at it:
//   npm i --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium
//   NODE_PATH=/tmp/pw/node_modules node scripts/generate-readme-hero.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const FormatUtils = require('../utils/format-utils.js');

const repoRoot = path.resolve(__dirname, '..');
const outputFile = path.join(repoRoot, 'assets', 'readme', 'hero.png');
const viewport = { width: 880, height: 440 };
const scale = 2;

const headline = {
    before: 'Detect',
    highlight: 'Security Systems',
    after: 'in Real-Time'
};
const subtitle = 'Identify CAPTCHAs, anti-bot systems, and fingerprinting technologies on any website. '
    + 'Built for security researchers and developers.';
// One row of chips, labelled like the card rows beside them (and the popup):
// at a readable size, "<category> Detection" labels would need two rows.
const chips = ['antibot', 'captcha', 'fingerprint'];

// The card's detections. Name, logo and category come from the detector file;
// the confidence is a plausible demo value.
const detections = [
    { file: 'antibot/detect-cloudflare.json', confidence: 98 },
    { file: 'antibot/detect-akamai.json', confidence: 95 },
    { file: 'captcha/detect-recaptcha.json', confidence: 100 },
    { file: 'fingerprint/detect-canvas-fingerprint.json', confidence: 87 }
];

const escapeHtml = (text) => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const dataUri = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const fontSrc = (file) => `url("${dataUri(path.join(repoRoot, 'assets', 'fonts', file), 'font/woff2')}") format("woff2")`;

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

function heroHtml() {
    const colors = FormatUtils.DEFAULT_CATEGORY_COLORS;
    const brandIcon = dataUri(path.join(repoRoot, 'icons', 'icon128.png'), 'image/png');
    const rows = detections.map(loadDetection);

    const chipHtml = chips.map((category) => `
        <span class="chip" style="--cat: ${colors[category]}">
          <span class="chip-icon">${categoryIcon(category)}</span>${escapeHtml(FormatUtils.categoryLabel(category))}
        </span>`).join('');

    const rowHtml = rows.map((row) => `
        <div class="row" style="--cat: ${colors[row.category]}">
          ${tileHtml(row)}
          <div class="info">
            <div class="name">${escapeHtml(row.name)}</div>
            <div class="meta"><span class="meta-icon">${categoryIcon(row.category)}</span>${escapeHtml(FormatUtils.categoryLabel(row.category))}</div>
          </div>
          <div class="conf">${row.confidence}%</div>
          <div class="bar" style="width: ${row.confidence}%"></div>
        </div>`).join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    @font-face { font-family: "IBM Plex Sans"; font-weight: 400; src: ${fontSrc('IBMPlexSans-Regular.woff2')}; }
    @font-face { font-family: "IBM Plex Sans"; font-weight: 500; src: ${fontSrc('IBMPlexSans-Medium.woff2')}; }
    @font-face { font-family: "IBM Plex Sans"; font-weight: 600; src: ${fontSrc('IBMPlexSans-SemiBold.woff2')}; }
    @font-face { font-family: "IBM Plex Sans"; font-weight: 700; src: ${fontSrc('IBMPlexSans-Bold.woff2')}; }
    @font-face { font-family: "IBM Plex Mono"; font-weight: 500; src: ${fontSrc('IBMPlexMono-Medium.woff2')}; }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${viewport.width}px; height: ${viewport.height}px; overflow: hidden; }
    body {
      font-family: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #f8fafc;
      -webkit-font-smoothing: antialiased;
      background:
        radial-gradient(420px 300px at 13% 26%, rgba(59, 130, 246, 0.16), transparent 70%),
        radial-gradient(460px 380px at 78% 62%, rgba(34, 211, 238, 0.09), transparent 70%),
        linear-gradient(160deg, #111a2e 0%, #0b1222 50%, #070b15 100%);
    }
    .art {
      height: 100%;
      display: grid;
      grid-template-columns: 1fr 372px;
      align-items: center;
      gap: 30px;
      padding: 0 36px 0 40px;
    }

    .brand { display: flex; align-items: center; gap: 11px; margin-bottom: 20px; }
    .brand img { width: 38px; height: 38px; }
    .brand span { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; }
    h1 { margin: 0; font-size: 41px; line-height: 1.1; font-weight: 700; letter-spacing: -0.02em; }
    h1 .highlight {
      background: linear-gradient(90deg, #60a5fa 0%, #38bdf8 55%, #22d3ee 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    p { margin: 14px 0 20px; color: #94a3b8; font-size: 15px; line-height: 1.5; text-wrap: balance; }

    .chips { display: flex; flex-wrap: wrap; gap: 10px; }
    .chip {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 13px 8px 11px; border-radius: 9px;
      font-family: "IBM Plex Mono", "SF Mono", Consolas, "Liberation Mono", monospace;
      font-size: 13.5px; font-weight: 500; color: #e2e8f0;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(148, 163, 184, 0.22);
    }
    .chip-icon { display: inline-flex; color: var(--cat); }
    .chip-icon svg { width: 18px; height: 18px; }

    .card {
      border-radius: 16px; overflow: hidden;
      background: linear-gradient(180deg, #172036 0%, #111a2c 100%);
      border: 1px solid rgba(148, 163, 184, 0.2);
      box-shadow: 0 28px 70px rgba(0, 0, 0, 0.55), 0 0 0 6px rgba(30, 41, 59, 0.35);
    }
    .card-head {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.14);
    }
    .card-head img { width: 28px; height: 28px; }
    .card-head .title { font-size: 16px; font-weight: 600; }
    .count {
      margin-left: auto; padding: 3px 10px; border-radius: 999px;
      font-size: 12px; font-weight: 600; color: #bfdbfe; white-space: nowrap;
      background: rgba(59, 130, 246, 0.18); border: 1px solid rgba(96, 165, 250, 0.4);
    }
    .rows { display: grid; gap: 8px; padding: 12px; }
    .row {
      position: relative; overflow: hidden;
      display: flex; align-items: center; gap: 12px;
      padding: 9px 14px 10px 10px; border-radius: 10px;
      background: rgba(30, 41, 59, 0.62);
      border: 1px solid rgba(148, 163, 184, 0.12);
    }
    .tile {
      flex-shrink: 0; width: 46px; height: 46px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      background: #fff; padding: 3px;
    }
    .tile img { width: 100%; height: 100%; object-fit: contain; border-radius: 7px; }
    /* The popup's 22px icon in a 36px box, scaled to this 46px tile. */
    .tile-line { background: none; color: ${fingerprintIconColor()}; }
    .tile-line svg { width: 28px; height: 28px; }
    .tile .glyph {
      width: 28px; height: 28px; background-color: currentColor;
      -webkit-mask-size: contain; mask-size: contain;
      -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
      -webkit-mask-position: center; mask-position: center;
    }
    .info { flex: 1; min-width: 0; }
    .name { font-size: 15px; font-weight: 600; line-height: 20px; color: #f1f5f9; white-space: nowrap; }
    .meta { display: flex; align-items: center; gap: 5px; margin-top: 3px; font-size: 13px; line-height: 16px; color: #94a3b8; }
    .meta-icon { display: inline-flex; color: var(--cat); }
    .meta-icon svg { width: 14px; height: 14px; }
    .conf {
      flex-shrink: 0;
      font-family: "IBM Plex Mono", "SF Mono", Consolas, "Liberation Mono", monospace;
      font-size: 15px; font-weight: 500; color: #e2e8f0;
    }
    .bar { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--cat); opacity: 0.9; }
  </style>
</head>
<body>
  <section class="art">
    <div class="copy">
      <div class="brand"><img src="${brandIcon}" alt=""><span>Scrapfly</span></div>
      <h1>${escapeHtml(headline.before)}<br><span class="highlight">${escapeHtml(headline.highlight)}</span><br>${escapeHtml(headline.after)}</h1>
      <p>${escapeHtml(subtitle)}</p>
      <div class="chips">${chipHtml}</div>
    </div>
    <div class="card">
      <div class="card-head">
        <img src="${brandIcon}" alt="">
        <span class="title">Scrapfly</span>
        <span class="count">${rows.length} detected</span>
      </div>
      <div class="rows">${rowHtml}</div>
    </div>
  </section>
</body>
</html>`;
}

// Fails the run instead of shipping an image with clipped or overflowing text.
async function checkLayout(page) {
    const problems = await page.evaluate(() => {
        const issues = [];
        const bounds = document.body.getBoundingClientRect();
        for (const el of document.querySelectorAll('.brand, h1, p, .chip, .card, .name, .meta, .conf, .count')) {
            const box = el.getBoundingClientRect();
            if (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom) {
                issues.push(`${el.className || el.tagName} is outside the image`);
            }
            if (el.scrollWidth > el.clientWidth + 1) issues.push(`${el.className || el.tagName} overflows: "${el.textContent.trim()}"`);
        }
        const chips = [...document.querySelectorAll('.chip')];
        if (new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size > 1) {
            issues.push('the chips wrap onto a second line');
        }
        return issues;
    });
    if (problems.length) throw new Error(`Hero layout problems:\n- ${problems.join('\n- ')}`);
}

async function main() {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    const browser = await chromium.launch({ channel: 'chromium', headless: true });
    try {
        const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
        await page.setContent(heroHtml(), { waitUntil: 'load' });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map((img) => img.decode()));
        });
        await checkLayout(page);
        await page.screenshot({ path: outputFile });
        console.log(`Wrote ${path.relative(repoRoot, outputFile)} (${viewport.width * scale}x${viewport.height * scale})`);
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { heroHtml, viewport, scale };
