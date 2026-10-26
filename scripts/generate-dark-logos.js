// Dark-theme copies of the detector logos (detectors/icons/*_official.png and
// custom.png), written to assets/logos-dark/ and shown by the Rules cards and
// Advanced's supported-protections grid.
//
// Most *_official.png icons are a white rounded square with the brand mark
// inside; a list of them reads as a wall of white squares on the dark popup.
// Each copy drops that baked-in white square (near-white pixels connected to
// the image edge) and softens the light rim it leaves, so the mark sits on the
// popup's own tile. Logos without a white square are copied unchanged. A few
// marks need a hint, listed in OPTIONS. The light theme keeps the originals.
//
// Playwright is not a project dependency. Install it anywhere and point at it:
//   npm i --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium
//   NODE_PATH=/tmp/pw/node_modules node scripts/generate-dark-logos.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..');
const iconDir = path.join(repoRoot, 'detectors', 'icons');
const outputDir = path.join(repoRoot, 'assets', 'logos-dark');

const OPTIONS = {
    // The white "f5" touches the white square: keep the white inside the red circle
    'f5_official.png': { keepInsideEllipse: true },
    'shape_security_official.png': { keepInsideEllipse: true },
    // Black marks would vanish on a dark tile: draw them light, as on the vendors' dark sites
    'azurefrontdoor_official.png': { lightenBelow: 60 },
    'castle_official.png': { lightenBelow: 60 },
    'imperva_official.png': { lightenBelow: 60 },
    'kasada_official.png': { lightenBelow: 60 },
    'ocule_official.png': { lightenBelow: 60 },
    // Hunt has no known vendor or logo: this is a neutral target drawn for it, black on white
    'hunt_official.png': { lightenBelow: 60, clearAllWhite: true },
    'qcloud_official.png': { clearAllWhite: true },
    'captchaeu_official.png': { clearAllWhite: true },
    // A black mark on white: its darkness becomes opacity, drawn white (the gaps inside the knot clear too)
    'openai_official.png': { whiteMark: true },
    'prosopo_official.png': { lightenBelow: 90 },
    'radware_official.png': { lightenBelow: 60 }
};

/** Every brand logo, and the default the Advanced grid uses. Fingerprint icons
 *  (*_fingerprint.png) are drawn as SVG and need no copy. */
function logoFiles() {
    return fs.readdirSync(iconDir).filter(file => /_official\.png$/.test(file) || file === 'custom.png').sort();
}

/** Runs in the page: one PNG data URL in, the dark copy out. */
async function darkCopy({ src, options }) {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const image = ctx.getImageData(0, 0, w, h);
    const d = image.data;
    if (options.whiteMark) {
        for (let i = 0; i < d.length; i += 4) {
            const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            d[i + 3] = Math.round((255 - lum) * d[i + 3] / 255);
            d[i] = d[i + 1] = d[i + 2] = 255;
        }
        ctx.putImageData(image, 0, 0);
        return canvas.toDataURL('image/png');
    }
    const nearWhite = i => d[i + 3] > 0 && Math.min(d[i], d[i + 1], d[i + 2]) > 215;

    // The white square: transparent or near-white pixels reachable from the edge
    const background = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
        const k = stack.pop();
        if (background[k]) continue;
        const i = k * 4;
        if (!(d[i + 3] < 20 || nearWhite(i))) continue;
        background[k] = 1;
        const x = k % w, y = (k / w) | 0;
        if (x > 0) stack.push(k - 1);
        if (x < w - 1) stack.push(k + 1);
        if (y > 0) stack.push(k - w);
        if (y < h - 1) stack.push(k + w);
    }

    // A mark with no white of its own (a ribbon cloud, a pie): the white left
    // inside its loops belongs to the square too
    if (options.clearAllWhite) {
        for (let k = 0; k < w * h; k++) if (d[k * 4 + 3] < 20 || nearWhite(k * 4)) background[k] = 1;
    }

    if (options.keepInsideEllipse) {
        // Bounding box of the mark, then the ellipse inside it keeps its white
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let k = 0; k < w * h; k++) {
            if (background[k] || d[k * 4 + 3] < 20) continue;
            const x = k % w, y = (k / w) | 0;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + 0.5, ry = (y1 - y0) / 2 + 0.5;
        for (let k = 0; k < w * h; k++) {
            const x = k % w, y = (k / w) | 0;
            if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 0.92) background[k] = 0;
        }
    }

    for (let k = 0; k < w * h; k++) if (background[k]) d[k * 4 + 3] = 0;

    // The anti-aliased rim (2px) was blended with the white square: take the white
    // back out of each rim pixel (white becomes transparency, the colour stays)
    const rim = new Uint8Array(w * h);
    let frontier = [];
    for (let k = 0; k < w * h; k++) if (background[k]) frontier.push(k);
    for (let depth = 1; depth <= 2; depth++) {
        const next = [];
        for (const k of frontier) {
            const x = k % w, y = (k / w) | 0;
            for (const n of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
                if (n < 0 || background[n] || rim[n]) continue;
                rim[n] = depth;
                next.push(n);
            }
        }
        frontier = next;
    }
    // Each rim pixel takes the colour of the most solid mark pixel within 2px, and
    // keeps only as much opacity as it had of that colour (no dark edges on grey marks)
    const ink = i => Math.max(255 - d[i], 255 - d[i + 1], 255 - d[i + 2]);
    const source = new Uint8ClampedArray(d);
    for (let k = 0; k < w * h; k++) {
        if (!rim[k]) continue;
        const x = k % w, y = (k / w) | 0, i = k * 4;
        let best = -1, bestInk = 0;
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const n = ny * w + nx;
                if (background[n] || source[n * 4 + 3] < 200) continue;
                const value = Math.max(255 - source[n * 4], 255 - source[n * 4 + 1], 255 - source[n * 4 + 2]);
                if (value > bestInk) { bestInk = value; best = n; }
            }
        }
        if (best < 0 || bestInk < 10) continue;
        const alpha = Math.min(1, ink(i) / bestInk);
        for (let c = 0; c < 3; c++) d[i + c] = source[best * 4 + c];
        d[i + 3] = Math.round(d[i + 3] * alpha);
    }

    if (options.lightenBelow) {
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) continue;
            const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            // Black and dark grey only: a dark brand colour (Radware's red) stays
            const neutral = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) < 40;
            if (lum < options.lightenBelow && neutral) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
        }
    }

    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
}

(async () => {
    const logos = logoFiles();
    fs.mkdirSync(outputDir, { recursive: true });
    const browser = await chromium.launch({ channel: 'chromium', headless: true,
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const page = await browser.newPage();
    for (const logo of logos) {
        const src = 'data:image/png;base64,' + fs.readFileSync(path.join(iconDir, logo)).toString('base64');
        const url = await page.evaluate(darkCopy, { src, options: OPTIONS[logo] || {} });
        fs.writeFileSync(path.join(outputDir, logo), Buffer.from(url.split(',')[1], 'base64'));
        console.log(`assets/logos-dark/${logo}`);
    }
    // Copies of logos that left the grid go too
    for (const file of fs.readdirSync(outputDir)) {
        if (!logos.includes(file)) fs.unlinkSync(path.join(outputDir, file));
    }
    await browser.close();
})();
