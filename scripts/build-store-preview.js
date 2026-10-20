// A local review sheet of a language's Chrome Web Store listing, to look at before pasting it
// in the dashboard: the five images at the size the store shows them (640x400, the size every
// screenshot is scaled to) and the description exactly as it will be pasted (plain text, line
// breaks kept, with its length). Written to store/preview/<code>.png, which is git-ignored.
//
//   NODE_PATH=/tmp/pw/node_modules node scripts/build-store-preview.js [--lang en]
//
// Playwright is not a project dependency: see scripts/generate-store-screenshots.js.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { escapeHtml, dataUri } = require('./lib/store-art.js');

const repoRoot = path.resolve(__dirname, '..');
const lang = (process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'en');

async function main() {
    const imageDir = path.join(repoRoot, 'assets', 'store-screenshots', lang);
    const listingFile = path.join(repoRoot, 'store', 'listing', `${lang}.txt`);
    if (!fs.existsSync(imageDir)) throw new Error(`No images in assets/store-screenshots/${lang}`);
    if (!fs.existsSync(listingFile)) throw new Error(`store/listing/${lang}.txt is missing`);
    const images = fs.readdirSync(imageDir).filter((name) => /^\d\d-.*\.png$/.test(name)).sort();
    const text = fs.readFileSync(listingFile, 'utf8');

    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
      body { margin: 0; padding: 28px; width: 1356px; background: #f3f4f6; color: #111827;
             font-family: system-ui, "Segoe UI", Roboto, sans-serif; }
      h1 { margin: 0 0 4px; font-size: 20px; }
      .note { margin: 0 0 18px; color: #4b5563; font-size: 13px; }
      .grid { display: grid; grid-template-columns: repeat(2, 640px); gap: 18px 20px; margin-bottom: 26px; }
      figure { margin: 0; }
      figure img { display: block; width: 640px; height: 400px; border: 1px solid #d1d5db; }
      figcaption { margin-top: 5px; color: #6b7280; font-size: 12px; }
      .text { background: #fff; border: 1px solid #d1d5db; border-radius: 10px; padding: 20px 24px; width: 700px; }
      .text h2 { margin: 0 0 4px; font-size: 14px; }
      .text .meta { margin: 0 0 12px; color: #6b7280; font-size: 12px; }
      pre { margin: 0; white-space: pre-wrap; word-break: break-word; font: 14px/1.5 system-ui, "Segoe UI", Roboto, sans-serif; }
    </style></head><body>
      <h1>Store listing preview: ${escapeHtml(lang)}</h1>
      <p class="note">Images at 640×400, the size the store scales every screenshot to. Text exactly as it will be pasted (plain text).</p>
      <div class="grid">${images.map((name, index) => `<figure><img src="${dataUri(path.join(imageDir, name), 'image/png')}" alt=""><figcaption>${index + 1}. ${escapeHtml(name)}</figcaption></figure>`).join('')}</div>
      <div class="text"><h2>Detailed description</h2><p class="meta">${[...text].length.toLocaleString('en-US')} characters</p><pre>${escapeHtml(text)}</pre></div>
    </body></html>`;

    const browser = await chromium.launch({ channel: 'chromium', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1412, height: 900 }, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
        const outDir = path.join(repoRoot, 'store', 'preview');
        fs.mkdirSync(outDir, { recursive: true });
        const out = path.join(outDir, `${lang}.png`);
        await page.screenshot({ path: out, fullPage: true });
        console.log(`Wrote ${path.relative(repoRoot, out)}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
