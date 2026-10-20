#!/usr/bin/env node
/**
 * Chrome Web Store listing auditor.
 *
 *   node scripts/check-store-listing.js                  every language of _locales
 *   node scripts/check-store-listing.js --lang es,fr     only these languages
 *   node scripts/check-store-listing.js --listing-dir D --captions-dir D --lang es
 *                                                        check drafts kept elsewhere (translators)
 *
 * Every _locales folder needs store/listing/<code>.txt (the detailed description, pasted in the
 * dashboard) and store/captions/<code>.json (the copy printed on the five images); the rules are
 * in scripts/lib/store-text.js. English is the reference the other languages are compared to,
 * and is always read from this repository.
 *
 * Exit 0 when everything passes; exit 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const { checkListing, checkCaptions } = require('./lib/store-text.js');

const repoRoot = path.resolve(__dirname, '..');
const localesDir = path.join(repoRoot, '_locales');

function parseArgs(argv) {
    const options = {
        langs: null,
        listingDir: path.join(repoRoot, 'store', 'listing'),
        captionsDir: path.join(repoRoot, 'store', 'captions')
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--lang') options.langs = String(argv[++i] || '').split(',').filter(Boolean);
        else if (arg === '--listing-dir') options.listingDir = path.resolve(argv[++i]);
        else if (arg === '--captions-dir') options.captionsDir = path.resolve(argv[++i]);
        else throw new Error(`Unknown option ${arg}`);
    }
    return options;
}

const readMessages = (code) => JSON.parse(fs.readFileSync(path.join(localesDir, code, 'messages.json'), 'utf8'));

function main() {
    const options = parseArgs(process.argv.slice(2));
    const all = fs.readdirSync(localesDir).filter((name) => fs.statSync(path.join(localesDir, name)).isDirectory()).sort();
    const langs = options.langs || all;
    const unknown = langs.filter((code) => !all.includes(code));
    if (unknown.length) throw new Error(`No _locales folder for: ${unknown.join(', ')}`);

    const english = {
        text: fs.readFileSync(path.join(repoRoot, 'store', 'listing', 'en.txt'), 'utf8'),
        captions: JSON.parse(fs.readFileSync(path.join(repoRoot, 'store', 'captions', 'en.json'), 'utf8'))
    };

    let failed = false;
    const report = (code, problems, summary) => {
        if (problems.length) {
            failed = true;
            console.log(`  ${code}: FAIL`);
            problems.forEach((problem) => console.log(`    - ${problem}`));
        } else {
            console.log(`  ${code}: OK (${summary})`);
        }
    };

    console.log(`Store listing: ${langs.length} language(s)`);
    for (const code of langs) {
        const listingFile = path.join(options.listingDir, `${code}.txt`);
        const captionsFile = path.join(options.captionsDir, `${code}.json`);
        const problems = [];
        let summary = '';

        if (!fs.existsSync(listingFile)) {
            problems.push(`${path.relative(repoRoot, listingFile)} is missing`);
        } else {
            const text = fs.readFileSync(listingFile, 'utf8');
            problems.push(...checkListing(code, text, { english: english.text, messages: readMessages(code) }));
            summary = `${[...text].length} characters`;
        }

        if (!fs.existsSync(captionsFile)) {
            problems.push(`${path.relative(repoRoot, captionsFile)} is missing`);
        } else {
            let captions;
            try {
                captions = JSON.parse(fs.readFileSync(captionsFile, 'utf8'));
            } catch (error) {
                problems.push(`${code} captions: invalid JSON (${error.message})`);
            }
            if (captions) problems.push(...checkCaptions(code, captions, { english: english.captions }));
        }
        report(code, problems, summary);
    }

    // A file nobody asked for is a language that was dropped or misnamed
    if (!options.langs) {
        for (const [dir, extension] of [[options.listingDir, '.txt'], [options.captionsDir, '.json']]) {
            if (!fs.existsSync(dir)) continue;
            for (const name of fs.readdirSync(dir)) {
                if (name.endsWith(extension) && !all.includes(path.basename(name, extension))) {
                    failed = true;
                    console.log(`  ${path.relative(repoRoot, path.join(dir, name))}: no _locales folder of that name`);
                }
            }
        }
    }

    if (failed) {
        console.error('\nStore listing check failed.');
        process.exit(1);
    }
    console.log('\nStore listing check passed.');
}

main();
