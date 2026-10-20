const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkListing, checkCaptions, numbersIn, signatureOf, BUDGETS, BUDGET_OF } = require('../scripts/lib/store-text');
const { checkStoreImages, readPngHeader, STORE_IMAGES, MIN_BYTES } = require('../scripts/lib/store-images');

// What the Chrome Web Store listing of every language (store/listing/<code>.txt, store/captions/<code>.json
// and the five images) must satisfy, and the checks that hold them to it. English is the reference.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const messages = (code) => JSON.parse(read(`_locales/${code}/messages.json`));
const english = read('store/listing/en.txt');
const englishCaptions = JSON.parse(read('store/captions/en.json'));
const folders = fs.readdirSync(path.join(root, '_locales')).filter((name) => fs.statSync(path.join(root, '_locales', name)).isDirectory()).sort();
const run = (script, ...args) => spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { encoding: 'utf8' });
const has = (problems, part) => problems.some((problem) => problem.includes(part));

const listing = (mutate, code = 'en') => checkListing(code, mutate(english), { english, messages: messages(code) });
const captions = (mutate, code = 'en') => {
    const copy = JSON.parse(JSON.stringify(englishCaptions));
    copy.language = code;
    mutate(copy);
    return checkCaptions(code, copy, { english: englishCaptions });
};

test('the English listing and captions pass their own rules', () => {
    assert.deepStrictEqual(listing((text) => text), []);
    assert.deepStrictEqual(captions(() => {}), []);
});

test('the English listing has the structure every language copies: one intro, two bullet sections, four short ones', () => {
    assert.strictEqual(signatureOf(english), '1:0 4:3 7:6 2:0 2:0 2:0 2:0');
});

test('a listing is plain UTF-8 text with LF endings: no BOM, tabs, Markdown, capitals or stray blank lines', () => {
    assert.ok(has(listing((text) => `﻿${text}`), 'byte order mark'));
    assert.ok(has(listing((text) => text.replace(/\n/g, '\r\n')), 'Windows line endings'));
    assert.ok(has(listing((text) => text.replace('What you see', 'What\tyou see')), 'tab'));
    assert.ok(has(listing((text) => text.replace('Free to use.', 'Free to use. ')), 'spaces at the end of a line'));
    assert.ok(has(listing((text) => text.replace('\n\nWhat you see', '\n\n\nWhat you see')), 'more than one blank line'));
    assert.ok(has(listing((text) => text.trimEnd()), 'exactly one newline'));
    assert.ok(has(listing((text) => `${text}\n`), 'exactly one newline'));
    assert.ok(has(listing((text) => text.replace('What you see', '## What you see')), 'Markdown'));
    assert.ok(has(listing((text) => text.replace('Free to use.', '**Free** to use.')), 'Markdown'));
    assert.ok(has(listing((text) => text.replace('• A number', '- A number')), 'bullets must be'));
    assert.ok(has(listing((text) => text.replace('What you see', 'WHAT YOU SEE')), 'capital letters'));
});

test('a listing has no web address, emoji, HTML or placeholder: the store treats them as spam or shows them raw', () => {
    assert.ok(has(listing((text) => text.replace('Free to use.', 'Free to use. https://example.com')), 'web address'));
    assert.ok(has(listing((text) => text.replace('Free to use.', 'Free to use. www.example.com')), 'web address'));
    assert.ok(has(listing((text) => text.replace('Free to use.', 'Free to use. 🚀')), 'emoji'));
    assert.ok(has(listing((text) => text.replace('Free to use.', 'Free <b>to</b> use.')), 'HTML'));
    assert.ok(has(listing((text) => text.replace('Free to use.', 'Free to use. {0} TODO')), 'placeholder'));
});

test('a listing keeps the English length bounds, sections, bullets and numbers', () => {
    assert.ok(has(listing(() => 'Short text.\n'), 'far shorter'));
    assert.ok(has(listing((text) => text.replace('add a detector there.', `add a detector there.${' x'.repeat(2600)}`)), 'far longer'));
    assert.ok(has(listing((text) => text.replace('add a detector there.', `add a detector there.${' x'.repeat(8000)}`)), 'at most'));
    assert.ok(has(listing((text) => text.replace(/• One card per protection[^\n]*\n/, '')), 'has the blocks'));
    assert.ok(has(listing((text) => text.replace('Privacy\n', 'Privacy\nSecond line.\n')), 'has the blocks'));
    assert.ok(has(listing((text) => text.replace('70 detectors', '71 detectors')), 'numbers are'));
    assert.ok(has(listing((text) => text.replace('22 interface languages', 'many interface languages')), 'numbers are'));
});

test('the intro paragraph fits what the store shows first and ends like a sentence (Thai has no full stop)', () => {
    assert.ok(has(listing((text) => text.replace('Free to use.', `Free to use. ${'More words here. '.repeat(20)}`)), 'the first paragraph has'));
    assert.ok(has(listing((text) => text.replace('Free to use.\n', 'Free to use\n')), 'sentence punctuation'));
    const thai = checkListing('th', english.replace('Free to use.\n', 'Free to use\n'), { english, messages: messages('th') });
    assert.ok(!has(thai, 'sentence punctuation'), 'Thai is exempt');
});

test('a listing uses the extension\'s own words for its tabs and pages, and does not repeat a key term more than 5 times', () => {
    assert.ok(has(listing((text) => text.replace('History statistics (', 'Stats (')), 'own word "History statistics"'));
    assert.ok(has(listing((text) => text.replace('• Advanced:', '• Expert:')), 'own word "Advanced"'));
    assert.ok(has(listing((text) => text.replace('Free to use.', 'Free to use. anti-bot anti-bot anti-bot anti-bot anti-bot anti-bot.')), '"anti-bot" appears'));
    assert.ok(has(listing((text) => text.replace('Free to use.', 'Free to use. Scrapfly Scrapfly Scrapfly Scrapfly Scrapfly.')), '"Scrapfly" appears'));
    // the labels come from each language's own _locales, so a Spanish text needs the Spanish words
    assert.ok(has(checkListing('es', english, { english, messages: messages('es') }), 'own word "Detección"'));
});

test('a text must be in its language\'s script, and Traditional and Simplified Chinese are not mixed', () => {
    assert.ok(has(checkListing('ja', english, { english, messages: messages('ja') }), "language's script"));
    assert.ok(has(checkListing('zh_TW', `${english} 设置`, { english, messages: messages('zh_TW') }), 'wrong variant'));
    assert.ok(has(checkListing('zh_CN', `${english} 設置`, { english, messages: messages('zh_CN') }), 'wrong variant'));
    assert.ok(has(checkListing('uk', `${english} ы`, { english, messages: messages('uk') }), 'wrong variant'));
});

test('numbers are compared as numbers, whatever digits a language writes them with', () => {
    assert.deepStrictEqual(numbersIn('٧٠ و ٣٠ و 19 و ๒๑ و २२ و ۱۲'), ['12', '19', '21', '22', '30', '70']);
    assert.deepStrictEqual(numbersIn('no digits'), []);
});

test('the image copy keeps its schema, and each script has its own length budget', () => {
    assert.ok(has(captions((copy) => { copy.language = 'xx'; }), '"language"'));
    assert.ok(has(captions((copy) => { delete copy.screens.rules; }), 'screens.rules is missing'));
    assert.ok(has(captions((copy) => { copy.screens.history.highlight = 'x'.repeat(60); }), 'headline has'));
    assert.ok(has(captions((copy) => { copy.screens.rules.subtitle = 'x'.repeat(200); }), 'subtitle has'));
    assert.ok(has(captions((copy) => { copy.screens.history.chips = ['a', 'b']; }), 'list of 3'));
    assert.ok(has(captions((copy) => { copy.screens.history.chips[0] = 'x'.repeat(30); }), 'chip'));
    assert.ok(has(captions((copy) => { copy.screens.history.chips = ['x'.repeat(18), 'x'.repeat(18), 'x'.repeat(18)]; }), 'two rows'), 'three chips that cannot fit two rows');
    // chips wrap in order: the two shortest are not neighbours here, so the second chip ends up alone on a row between the others
    assert.ok(has(captions((copy) => { copy.screens.history.chips = ['x'.repeat(12), 'x'.repeat(22), 'x'.repeat(12)]; }), 'two rows'), 'neighbours count, not the shortest pair');
    assert.deepStrictEqual(captions((copy) => { copy.screens.history.chips = ['x'.repeat(10), 'x'.repeat(20), 'x'.repeat(22)]; }), [], 'the first two share a row');
    assert.deepStrictEqual(captions((copy) => { copy.screens.history.chips = ['x'.repeat(22), 'x'.repeat(20), 'x'.repeat(10)]; }), [], 'the last two share a row');
    assert.ok(has(captions((copy) => { copy.screens.history.chips = ['x'.repeat(11), 'x'.repeat(20), 'x'.repeat(11)]; }), 'two rows'), 'one letter over');
    assert.ok(has(captions((copy) => { copy.screens.detection.chips = ['a']; }), '"categories"'));
    assert.ok(has(captions((copy) => { copy.demo.detected = 'detected'; }), 'must contain {0}'));
    assert.ok(has(captions((copy) => { copy.demo.note = 'x'.repeat(40); }), 'demo.note has'));
    // Japanese and Chinese headlines are far shorter than English ones, Korean too
    assert.ok(has(captions((copy) => { copy.screens.history.before = 'あ'.repeat(25); }, 'ja'), 'headline has'));
    assert.deepStrictEqual(BUDGETS[BUDGET_OF.ja], BUDGETS[BUDGET_OF.zh_TW]);
    assert.ok(BUDGETS[BUDGET_OF.ko][0] < BUDGETS.latin[0]);
});

function pngHeader({ width = 1280, height = 800, bitDepth = 8, colorType = 2, interlace = 0 } = {}) {
    const head = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(head, 0);
    head.writeUInt32BE(13, 8);
    head.write('IHDR', 12, 'latin1');
    head.writeUInt32BE(width, 16);
    head.writeUInt32BE(height, 20);
    head[24] = bitDepth;
    head[25] = colorType;
    head[28] = interlace;
    return head;
}

function imageSet(overrides = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-images-'));
    for (const { filename } of STORE_IMAGES) {
        const header = overrides[filename];
        if (header === null) continue;
        const body = header && header.raw ? header.raw : Buffer.concat([pngHeader(header), Buffer.alloc(MIN_BYTES + 1024)]);
        fs.writeFileSync(path.join(dir, filename), body);
    }
    return dir;
}

test('the store images of a language are five 1280x800 24-bit PNGs without transparency', () => {
    const [first, second] = STORE_IMAGES.map((image) => image.filename);
    assert.deepStrictEqual(STORE_IMAGES.map((image) => image.filename.slice(0, 2)), ['01', '02', '03', '04', '05']);

    const good = imageSet();
    assert.deepStrictEqual(checkStoreImages(good, 'xx'), []);
    assert.deepStrictEqual(readPngHeader(path.join(good, first)), { width: 1280, height: 800, bitDepth: 8, colorType: 2, interlace: 0 });

    assert.ok(has(checkStoreImages(path.join(good, 'nope'), 'xx'), 'is missing'));
    assert.ok(has(checkStoreImages(imageSet({ [first]: null }), 'xx'), `${first} is missing`));
    assert.ok(has(checkStoreImages(imageSet({ [first]: { width: 1279 } }), 'xx'), 'expected 1280x800'));
    assert.ok(has(checkStoreImages(imageSet({ [first]: { colorType: 6 } }), 'xx'), 'without transparency'));
    assert.ok(has(checkStoreImages(imageSet({ [first]: { interlace: 1 } }), 'xx'), 'interlaced'));
    assert.ok(has(checkStoreImages(imageSet({ [first]: { raw: pngHeader() } }), 'xx'), 'bytes, expected between'));
    assert.ok(has(checkStoreImages(imageSet({ [second]: { raw: Buffer.from('not a picture'.repeat(5000)) } }), 'xx'), 'not a PNG'));

    const extra = imageSet();
    fs.writeFileSync(path.join(extra, 'extra.png'), 'x');
    assert.ok(has(checkStoreImages(extra, 'xx'), 'unexpected file extra.png'));
});

test('the checkers run from the command line and fail with exit code 1', () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'store-listing-'));
    fs.mkdirSync(path.join(scratch, 'listing'));
    fs.mkdirSync(path.join(scratch, 'captions'));
    const args = ['--listing-dir', path.join(scratch, 'listing'), '--captions-dir', path.join(scratch, 'captions'), '--lang', 'en'];

    const missing = run('check-store-listing.js', ...args);
    assert.strictEqual(missing.status, 1);
    assert.match(missing.stdout, /en\.txt is missing/);

    fs.writeFileSync(path.join(scratch, 'listing', 'en.txt'), english);
    fs.writeFileSync(path.join(scratch, 'captions', 'en.json'), JSON.stringify(englishCaptions));
    const passing = run('check-store-listing.js', ...args);
    assert.strictEqual(passing.status, 0, passing.stdout + passing.stderr);

    fs.writeFileSync(path.join(scratch, 'listing', 'en.txt'), english.replace('70 detectors', '71 detectors'));
    const failing = run('check-store-listing.js', ...args);
    assert.strictEqual(failing.status, 1);
    assert.match(failing.stdout, /numbers are/);

    assert.strictEqual(run('check-store-listing.js', '--lang', 'xx').status, 1, 'a language without a _locales folder');
    assert.strictEqual(run('check-store-images.js', '--dir', scratch, '--lang', 'en').status, 1, 'no images there');
});

test('every _locales language has its listing, its image copy and its five images, and they pass', () => {
    const listingFiles = fs.readdirSync(path.join(root, 'store', 'listing')).filter((name) => name.endsWith('.txt')).map((name) => path.basename(name, '.txt')).sort();
    const captionFiles = fs.readdirSync(path.join(root, 'store', 'captions')).filter((name) => name.endsWith('.json')).map((name) => path.basename(name, '.json')).sort();
    const imageFolders = fs.readdirSync(path.join(root, 'assets', 'store-screenshots')).sort();
    assert.deepStrictEqual(listingFiles, folders, 'store/listing/<code>.txt for exactly the _locales folders');
    assert.deepStrictEqual(captionFiles, folders, 'store/captions/<code>.json for exactly the _locales folders');
    assert.deepStrictEqual(imageFolders, folders, 'assets/store-screenshots/<code>/ for exactly the _locales folders');

    for (const code of folders) {
        const text = read(`store/listing/${code}.txt`);
        assert.deepStrictEqual(checkListing(code, text, { english, messages: messages(code) }), [], `${code} listing`);
        const copy = JSON.parse(read(`store/captions/${code}.json`));
        assert.deepStrictEqual(checkCaptions(code, copy, { english: englishCaptions }), [], `${code} captions`);
        assert.deepStrictEqual(checkStoreImages(path.join(root, 'assets', 'store-screenshots', code), code), [], `${code} images`);
    }
});
