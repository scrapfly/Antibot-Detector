// The Chrome Web Store screenshots of a language: which files, and what a PNG must be to be
// accepted by the dashboard (24-bit, no alpha, 1280x800). Pure file reading, no browser, so
// scripts/check-store-images.js, the generator and the tests share it.

const fs = require('fs');
const path = require('path');

const WIDTH = 1280;
const HEIGHT = 800;
const MIN_BYTES = 30 * 1024; // an empty or failed render is a few KB
const MAX_BYTES = 2 * 1024 * 1024; // images are about 0.4 MB; the store allows far more, the repository should not

// The five images, in the order the store shows them. `screen` is the key of
// store/captions/<code>.json; `capture` is the popup state a popup image shows.
const STORE_IMAGES = Object.freeze([
    { filename: '01-detection-1280x800.png', screen: 'detection', kind: 'hero' },
    { filename: '02-history-1280x800.png', screen: 'history', kind: 'popup', capture: 'history' },
    { filename: '03-rules-1280x800.png', screen: 'rules', kind: 'popup', capture: 'rules' },
    { filename: '04-advanced-tools-1280x800.png', screen: 'advanced', kind: 'popup', capture: 'advanced-tool' },
    { filename: '05-settings-1280x800.png', screen: 'settings', kind: 'popup', capture: 'settings-languages' }
]);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// The IHDR chunk is always the first one: 13 bytes after the signature, length and type
function readPngHeader(file) {
    const fd = fs.openSync(file, 'r');
    try {
        const head = Buffer.alloc(33);
        const read = fs.readSync(fd, head, 0, head.length, 0);
        if (read < head.length || !head.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
        if (head.toString('latin1', 12, 16) !== 'IHDR') return null;
        return {
            width: head.readUInt32BE(16),
            height: head.readUInt32BE(20),
            bitDepth: head[24],
            colorType: head[25], // 2 = truecolor (RGB), 6 = RGBA
            interlace: head[28]
        };
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * @param {string} dir  the folder of one language (assets/store-screenshots/<code>)
 * @returns {string[]} problems; empty when the five images are there and valid
 */
function checkStoreImages(dir, label = path.basename(dir)) {
    if (!fs.existsSync(dir)) return [`${label}: ${dir} is missing`];
    const problems = [];
    const expected = STORE_IMAGES.map((image) => image.filename);
    const found = fs.readdirSync(dir);
    for (const name of found.filter((entry) => !expected.includes(entry))) problems.push(`${label}: unexpected file ${name}`);

    for (const name of expected) {
        const file = path.join(dir, name);
        if (!fs.existsSync(file)) { problems.push(`${label}: ${name} is missing`); continue; }
        const header = readPngHeader(file);
        if (!header) { problems.push(`${label}/${name}: not a PNG`); continue; }
        if (header.width !== WIDTH || header.height !== HEIGHT) problems.push(`${label}/${name}: ${header.width}x${header.height}, expected ${WIDTH}x${HEIGHT}`);
        if (header.colorType !== 2 || header.bitDepth !== 8) problems.push(`${label}/${name}: must be 24-bit RGB without transparency (the store refuses alpha), found color type ${header.colorType} at ${header.bitDepth} bits`);
        if (header.interlace !== 0) problems.push(`${label}/${name}: is interlaced`);
        const bytes = fs.statSync(file).size;
        if (bytes < MIN_BYTES || bytes > MAX_BYTES) problems.push(`${label}/${name}: ${bytes} bytes, expected between ${MIN_BYTES} and ${MAX_BYTES}`);
    }
    return problems;
}

module.exports = { WIDTH, HEIGHT, MIN_BYTES, MAX_BYTES, STORE_IMAGES, readPngHeader, checkStoreImages };
