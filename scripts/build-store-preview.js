// A local review sheet of a language's Chrome Web Store listing, to look at before pasting it
// in the dashboard: the five images at the size the store shows them (640x400, the size every
// screenshot is scaled to) and the description exactly as it will be pasted (plain text, line
// breaks kept, with its length). Written to store/preview/<code>.png, which is git-ignored.
//
//   NODE_PATH=/tmp/pw/node_modules node scripts/build-store-preview.js [--lang en,es]
//
// Options:
//   --lang en,es      languages to build (default en; "all" = every folder of _locales)
//   --listing-dir D   read the description from D/<code>.txt (default store/listing)
//   --images-dir D    read the images from D/<code>/ (default assets/store-screenshots)
//   --out D           write the sheets to D/<code>.png (default store/preview)
//   --images-only     leave the description out (a quicker look at many languages)
//   --fontconfig F    a fontconfig file for the browser (Traditional Chinese needs a system font, see store/README.md)
//
// The description is drawn with the extension's own fonts, so every script is legible; the store shows it
// in the visitor's system fonts.
//
// Playwright is not a project dependency: see scripts/generate-store-screenshots.js.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { escapeHtml, dataUri, extensionFontCss, htmlLang, openStoreArt } = require('./lib/store-art.js');

const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
    const options = {
        langs: ['en'],
        listingDir: path.join(repoRoot, 'store', 'listing'),
        imagesDir: path.join(repoRoot, 'assets', 'store-screenshots'),
        out: path.join(repoRoot, 'store', 'preview'),
        imagesOnly: false,
        fontconfig: null
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--lang') options.langs = String(argv[++i] || '').split(',').filter(Boolean);
        else if (arg === '--listing-dir') options.listingDir = path.resolve(argv[++i]);
        else if (arg === '--images-dir') options.imagesDir = path.resolve(argv[++i]);
        else if (arg === '--out') options.out = path.resolve(argv[++i]);
        else if (arg === '--images-only') options.imagesOnly = true;
        else if (arg === '--fontconfig') options.fontconfig = path.resolve(argv[++i]);
        else throw new Error(`Unknown option ${arg}`);
    }
    if (options.langs.length === 1 && options.langs[0] === 'all') {
        const localesDir = path.join(repoRoot, '_locales');
        options.langs = fs.readdirSync(localesDir).filter((name) => fs.statSync(path.join(localesDir, name)).isDirectory()).sort();
    }
    return options;
}

const RTL_LANGUAGES = new Set(['ar']);

async function buildSheet(context, lang, options) {
    const imageDir = path.join(options.imagesDir, lang);
    const listingFile = path.join(options.listingDir, `${lang}.txt`);
    if (!fs.existsSync(imageDir)) throw new Error(`No images in ${imageDir}`);
    if (!options.imagesOnly && !fs.existsSync(listingFile)) throw new Error(`${listingFile} is missing`);
    const images = fs.readdirSync(imageDir).filter((name) => /^\d\d-.*\.png$/.test(name)).sort();
    const text = options.imagesOnly ? '' : fs.readFileSync(listingFile, 'utf8');

    const html = `<!doctype html><html lang="${htmlLang(lang)}"><head><meta charset="utf-8"><style>
      ${extensionFontCss()}
      body { margin: 0; padding: 28px; width: 1356px; background: #f3f4f6; color: #111827;
             font-family: var(--font-sans); }
      h1 { margin: 0 0 4px; font-size: 20px; }
      .note { margin: 0 0 18px; color: #4b5563; font-size: 13px; }
      .grid { display: grid; grid-template-columns: repeat(2, 640px); gap: 18px 20px; margin-bottom: 26px; }
      figure { margin: 0; }
      figure img { display: block; width: 640px; height: 400px; border: 1px solid #d1d5db; }
      figcaption { margin-top: 5px; color: #6b7280; font-size: 12px; }
      .text { background: #fff; border: 1px solid #d1d5db; border-radius: 10px; padding: 20px 24px; width: 700px; }
      .text h2 { margin: 0 0 4px; font-size: 14px; }
      .text .meta { margin: 0 0 12px; color: #6b7280; font-size: 12px; }
      pre { margin: 0; white-space: pre-wrap; word-break: break-word; font: 14px/1.5 var(--font-sans); }
    </style></head><body>
      <h1>Store listing preview: ${escapeHtml(lang)}</h1>
      <p class="note">Images at 640×400, the size the store scales every screenshot to. Text exactly as it will be pasted (plain text).</p>
      <div class="grid">${images.map((name, index) => `<figure><img src="${dataUri(path.join(imageDir, name), 'image/png')}" alt=""><figcaption>${index + 1}. ${escapeHtml(name)}</figcaption></figure>`).join('')}</div>
      ${options.imagesOnly ? '' : `<div class="text"><h2>Detailed description</h2><p class="meta">${[...text].length.toLocaleString('en-US')} characters</p><pre dir="${RTL_LANGUAGES.has(lang) ? 'rtl' : 'ltr'}">${escapeHtml(text)}</pre></div>`}
    </body></html>`;

    const page = await openStoreArt(context, html, { width: 1412, height: 900 });
    try {
        fs.mkdirSync(options.out, { recursive: true });
        const out = path.join(options.out, `${lang}.png`);
        await page.screenshot({ path: out, fullPage: true });
        console.log(`Wrote ${path.relative(repoRoot, out)}`);
    } finally {
        await page.close();
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const env = { ...process.env, ...(options.fontconfig ? { FONTCONFIG_FILE: options.fontconfig } : {}) };
    const browser = await chromium.launch({ channel: 'chromium', headless: true, env });
    try {
        const context = await browser.newContext({ viewport: { width: 1412, height: 900 }, deviceScaleFactor: 1 });
        for (const lang of options.langs) await buildSheet(context, lang, options);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
