#!/usr/bin/env node
/**
 * Lightweight structural guards for the (no-build) extension. Run before commit:
 *
 *   node scripts/check-structure.js
 *
 * Checks:
 *   1. HTML tag balance — every <div>/<button> in popup.html and the section
 *      templates has a matching close tag (catches the unclosed-tag mistakes
 *      that silently break modal/card layout).
 *   2. JSON validity — every messages.json under _locales and every detector
 *      JSON parses (a stray comma there breaks detection or i18n at runtime).
 *   3. Modal-header anti-pattern — no close-button rule may be
 *      position:absolute. Absolute close buttons let longer translated / RTL
 *      header text slide underneath and clip the X (the v2.7 settings-modal
 *      bug). The canonical pattern is a flex sibling; see common.css.
 *
 * Exit 0 when everything passes; exit 1 with a report otherwise.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const problems = [];

// ---- 1. HTML tag balance ------------------------------------------------
function htmlFiles() {
    const files = [path.join(repoRoot, 'popup.html')];
    const sectionsDir = path.join(repoRoot, 'sections');
    if (fs.existsSync(sectionsDir)) {
        for (const section of fs.readdirSync(sectionsDir)) {
            const dir = path.join(sectionsDir, section);
            if (!fs.statSync(dir).isDirectory()) continue;
            for (const f of fs.readdirSync(dir)) {
                if (f.endsWith('.html')) files.push(path.join(dir, f));
            }
        }
    }
    return files.filter((f) => fs.existsSync(f));
}

function checkTagBalance(file, tag) {
    const html = fs.readFileSync(file, 'utf8');
    // Self-closing <tag .../> and void elements don't apply to div/button.
    const open = (html.match(new RegExp(`<${tag}(\\s|>)`, 'g')) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (open !== close) {
        problems.push(`${path.relative(repoRoot, file)}: <${tag}> ${open} vs </${tag}> ${close} (unbalanced)`);
    }
}

for (const file of htmlFiles()) {
    for (const tag of ['div', 'button']) checkTagBalance(file, tag);
}

// ---- 2. JSON validity ---------------------------------------------------
function jsonFiles() {
    const out = [];
    const walk = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(p);
            else if (entry.name.endsWith('.json')) out.push(p);
        }
    };
    walk(path.join(repoRoot, '_locales'));
    walk(path.join(repoRoot, 'detectors'));
    return out;
}

for (const file of jsonFiles()) {
    try {
        JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        problems.push(`${path.relative(repoRoot, file)}: invalid JSON — ${e.message}`);
    }
}

// ---- 3. Modal-header anti-pattern --------------------------------------
function cssFiles() {
    const dir = path.join(repoRoot, 'modules', 'styles');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => path.join(dir, f));
}

for (const file of cssFiles()) {
    const css = fs.readFileSync(file, 'utf8');
    // Split into rule blocks on '}', inspect each selector+body pair.
    for (const block of css.split('}')) {
        const braceIdx = block.indexOf('{');
        if (braceIdx === -1) continue;
        const selector = block.slice(0, braceIdx);
        const body = block.slice(braceIdx);
        const isCloseButton = /close-btn|modal-close/.test(selector);
        const isAbsolute = /position\s*:\s*absolute/.test(body);
        if (isCloseButton && isAbsolute) {
            problems.push(`${path.relative(repoRoot, file)}: "${selector.trim()}" is position:absolute — modal close buttons must be flex siblings (see common.css canonical pattern).`);
        }
    }
}

// ---- Report -------------------------------------------------------------
if (problems.length) {
    console.error(`Structure check FAILED (${problems.length} problem(s)):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
}

console.log('Structure check passed: HTML tag balance, JSON validity, and modal-header pattern all OK.');
