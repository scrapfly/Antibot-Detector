#!/usr/bin/env node
/**
 * Chrome Web Store screenshot auditor.
 *
 *   node scripts/check-store-images.js                every language of _locales
 *   node scripts/check-store-images.js --lang es,fr   only these languages
 *   node scripts/check-store-images.js --dir D        images kept elsewhere (default assets/store-screenshots)
 *
 * Every _locales folder needs assets/store-screenshots/<code>/ with the five images of
 * scripts/lib/store-images.js: 1280x800, 24-bit RGB PNG (the store refuses transparency),
 * not interlaced, a sane size. Whether the text in them fits is checked while they are
 * generated (scripts/lib/store-art.js), not here.
 *
 * Exit 0 when everything passes; exit 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const { checkStoreImages } = require('./lib/store-images.js');

const repoRoot = path.resolve(__dirname, '..');
const localesDir = path.join(repoRoot, '_locales');

function parseArgs(argv) {
    const options = { langs: null, dir: path.join(repoRoot, 'assets', 'store-screenshots') };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--lang') options.langs = String(argv[++i] || '').split(',').filter(Boolean);
        else if (arg === '--dir') options.dir = path.resolve(argv[++i]);
        else throw new Error(`Unknown option ${arg}`);
    }
    return options;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const all = fs.readdirSync(localesDir).filter((name) => fs.statSync(path.join(localesDir, name)).isDirectory()).sort();
    const langs = options.langs || all;
    const unknown = langs.filter((code) => !all.includes(code));
    if (unknown.length) throw new Error(`No _locales folder for: ${unknown.join(', ')}`);

    let failed = false;
    console.log(`Store images: ${langs.length} language(s)`);
    for (const code of langs) {
        const problems = checkStoreImages(path.join(options.dir, code), code);
        if (problems.length) {
            failed = true;
            console.log(`  ${code}: FAIL`);
            problems.forEach((problem) => console.log(`    - ${problem}`));
        } else {
            console.log(`  ${code}: OK`);
        }
    }

    if (!options.langs && fs.existsSync(options.dir)) {
        for (const name of fs.readdirSync(options.dir)) {
            const isFolder = fs.statSync(path.join(options.dir, name)).isDirectory();
            if (!isFolder || !all.includes(name)) {
                failed = true;
                console.log(`  ${name}: not a language of _locales`);
            }
        }
    }

    if (failed) {
        console.error('\nStore images check failed.');
        process.exit(1);
    }
    console.log('\nStore images check passed.');
}

main();
