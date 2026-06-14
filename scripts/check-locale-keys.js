#!/usr/bin/env node
/**
 * Locale message-key auditor.
 *
 *   node scripts/check-locale-keys.js            Parity check: every locale's
 *                                                key set must equal English.
 *   node scripts/check-locale-keys.js --unused   Also report canonical keys
 *                                                that are never referenced
 *                                                anywhere outside _locales/.
 *
 * Exit 0 when all requested checks pass; exit 1 otherwise.
 *
 * The --unused scan is intentionally conservative: it substring-matches each
 * key against the entire source corpus (js/html/json/css/md outside _locales),
 * so a key referenced from a literal map, an HTML data-i18n attribute, a JS
 * I18n.get/tr call, the CHANGELOG, or a tooling script all count as "used."
 * It under-reports rather than over-reports, so a flagged key is safe to drop.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const localesDir = path.join(repoRoot, '_locales');
const canonicalLocale = 'en';
const wantUnused = process.argv.includes('--unused');

function loadKeys(locale) {
    const filePath = path.join(localesDir, locale, 'messages.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return new Set(Object.keys(data));
}

const canonicalPath = path.join(localesDir, canonicalLocale, 'messages.json');
if (!fs.existsSync(canonicalPath)) {
    console.error(`Missing canonical locale: ${canonicalPath}`);
    process.exit(1);
}

const canonicalKeys = loadKeys(canonicalLocale);
const locales = fs.readdirSync(localesDir).filter((name) => {
    const stat = fs.statSync(path.join(localesDir, name));
    return stat.isDirectory();
});

let failed = false;

// ---- Parity check -------------------------------------------------------
console.log(`Canonical locale "${canonicalLocale}": ${canonicalKeys.size} keys`);

for (const locale of locales.sort()) {
    if (locale === canonicalLocale) continue;

    const keys = loadKeys(locale);
    const missing = [...canonicalKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !canonicalKeys.has(k));

    if (missing.length === 0 && extra.length === 0) {
        console.log(`  ${locale}: OK (${keys.size} keys)`);
        continue;
    }

    failed = true;
    console.error(`  ${locale}: MISMATCH (${keys.size} keys)`);
    if (missing.length) {
        console.error(`    missing (${missing.length}): ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '...' : ''}`);
    }
    if (extra.length) {
        console.error(`    extra (${extra.length}): ${extra.slice(0, 20).join(', ')}${extra.length > 20 ? '...' : ''}`);
    }
}

if (failed) {
    console.error('\nLocale key parity check failed.');
    process.exit(1);
}

console.log('\nAll locales match canonical key set.');

// ---- Unused-key scan (opt-in) ------------------------------------------
if (wantUnused) {
    const SCAN_EXTS = new Set(['.js', '.html', '.json', '.css', '.md']);
    const SKIP_DIRS = new Set(['_locales', 'node_modules', '.git']);

    function collectFiles(dir, acc) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name)) continue;
                collectFiles(path.join(dir, entry.name), acc);
            } else if (SCAN_EXTS.has(path.extname(entry.name))) {
                acc.push(path.join(dir, entry.name));
            }
        }
        return acc;
    }

    const corpus = collectFiles(repoRoot, [])
        .map((f) => fs.readFileSync(f, 'utf8'))
        .join('\n');

    const unused = [...canonicalKeys].filter((key) => !corpus.includes(key)).sort();

    console.log(`\nUnused-key scan: ${canonicalKeys.size - unused.length}/${canonicalKeys.size} keys referenced.`);
    if (unused.length) {
        console.error(`  ${unused.length} unused key(s): ${unused.join(', ')}`);
        console.error('  (Remove from every _locales/*/messages.json, or wire up the reference.)');
        process.exit(1);
    }
    console.log('  No unused keys.');
}
