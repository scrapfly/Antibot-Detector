#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const MODULE_ORDER = [
    'recaptcha',
    'akamai',
    'imperva',
    'shapesecurity',
    'awswaf',
    'geetest',
    'datadome',
    'cloudflare',
    'turnstile',
    'hcaptcha',
    'funcaptcha'
];

const BASE_ADVANCED_SCRIPTS = [
    'sections/advanced/base-interceptor-helpers.js',
    'sections/advanced/advanced-history-store.js',
    'sections/advanced/advanced-utils.js',
    'sections/advanced/base-advanced-module.js'
];

const PROVIDER_LIBS = [
    'sections/advanced/modules/recaptcha/libs/pbf.js',
    'sections/advanced/modules/recaptcha/libs/message.browser.js'
];

const SECTION_ADVANCED_SCRIPTS = [
    'sections/advanced/advanced.js',
    'sections/advanced/advanced-runtime.js',
    'sections/advanced/advanced-tools.js',
    'sections/advanced/advanced-history.js',
    'sections/advanced/advanced-modals.js',
    'sections/advanced/advanced-analysis.js'
];

const START_MARKER = '<!-- ADVANCED_SCRIPTS_START -->';
const END_MARKER = '<!-- ADVANCED_SCRIPTS_END -->';
const LEGACY_BLOCK_START = '<!-- Base template system for Advanced modules -->';
const LEGACY_BLOCK_END = '<!-- Settings core + extensions -->';

function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}

function detectEol(text) {
    return text.includes('\r\n') ? '\r\n' : '\n';
}

function hasArg(flag) {
    return process.argv.includes(flag);
}

function normalizePathForHtml(filePath) {
    return filePath.replace(/\\/g, '/');
}

function scriptTag(src) {
    return `  <script src="${src}"></script>`;
}

function assertFilesExist(repoRoot, files, label) {
    const missing = files.filter((relativePath) => {
        const absolutePath = path.join(repoRoot, relativePath);
        return !fs.existsSync(absolutePath);
    });

    if (missing.length > 0) {
        fail(`Missing ${label}: ${missing.join(', ')}`);
    }
}

function collectModuleScriptFiles(repoRoot) {
    const entries = [];

    for (const moduleId of MODULE_ORDER) {
        const moduleDir = path.join(repoRoot, 'sections', 'advanced', 'modules', moduleId);
        if (!fs.existsSync(moduleDir) || !fs.statSync(moduleDir).isDirectory()) {
            fail(`Missing advanced module directory: sections/advanced/modules/${moduleId}`);
        }

        const coreFile = `${moduleId}-advanced.js`;
        const lifecycleFile = `${moduleId}-advanced-lifecycle.js`;
        const uiFile = `${moduleId}-advanced-ui.js`;
        const actionsFile = `${moduleId}-advanced-actions.js`;

        const corePath = path.join(moduleDir, coreFile);
        if (!fs.existsSync(corePath)) {
            fail(`Missing required core file: sections/advanced/modules/${moduleId}/${coreFile}`);
        }

        const moduleFiles = fs.readdirSync(moduleDir)
            .filter((name) => name.endsWith('.js'))
            .filter((name) => name.startsWith(`${moduleId}-advanced`));

        const allowed = new Set([coreFile, lifecycleFile, uiFile, actionsFile]);
        const extras = moduleFiles.filter((name) => !allowed.has(name));
        if (extras.length > 0) {
            fail(
                `Unexpected advanced split files for module "${moduleId}": ${extras.join(', ')}`
            );
        }

        entries.push(`sections/advanced/modules/${moduleId}/${coreFile}`);
        for (const optional of [lifecycleFile, uiFile, actionsFile]) {
            const optionalPath = path.join(moduleDir, optional);
            if (fs.existsSync(optionalPath)) {
                entries.push(`sections/advanced/modules/${moduleId}/${optional}`);
            }
        }
    }

    return entries;
}

function buildGeneratedBlock(repoRoot) {
    assertFilesExist(repoRoot, BASE_ADVANCED_SCRIPTS, 'base Advanced scripts');
    assertFilesExist(repoRoot, PROVIDER_LIBS, 'provider library scripts');
    assertFilesExist(repoRoot, SECTION_ADVANCED_SCRIPTS, 'section Advanced scripts');

    const moduleScripts = collectModuleScriptFiles(repoRoot);
    const lines = [];

    lines.push(`  ${START_MARKER}`);
    lines.push('  <!-- Base template system for Advanced modules -->');
    BASE_ADVANCED_SCRIPTS.forEach((src) => lines.push(scriptTag(src)));
    lines.push('  <!-- Advanced module implementations -->');
    PROVIDER_LIBS.forEach((src) => lines.push(scriptTag(src)));
    moduleScripts.forEach((src) => lines.push(scriptTag(src)));
    SECTION_ADVANCED_SCRIPTS.forEach((src) => lines.push(scriptTag(src)));
    lines.push(`  ${END_MARKER}`);

    return lines;
}

function findLineIndex(lines, token) {
    return lines.findIndex((line) => line.includes(token));
}

function extractCurrentBlock(lines) {
    const markerStart = findLineIndex(lines, START_MARKER);
    const markerEnd = findLineIndex(lines, END_MARKER);

    if (markerStart >= 0 || markerEnd >= 0) {
        if (markerStart < 0 || markerEnd < 0 || markerEnd < markerStart) {
            fail('Invalid ADVANCED_SCRIPTS markers in popup.html');
        }
        return { start: markerStart, end: markerEnd };
    }

    const legacyStart = findLineIndex(lines, LEGACY_BLOCK_START);
    const legacyEnd = findLineIndex(lines, LEGACY_BLOCK_END);
    if (legacyStart < 0 || legacyEnd < 0 || legacyEnd <= legacyStart) {
        fail('Could not locate Advanced scripts block in popup.html');
    }

    return { start: legacyStart, end: legacyEnd - 1 };
}

function replaceBlock(lines, blockStart, blockEnd, replacementLines) {
    return [
        ...lines.slice(0, blockStart),
        ...replacementLines,
        ...lines.slice(blockEnd + 1)
    ];
}

function printableLine(line) {
    return line === undefined ? '<missing>' : line;
}

function buildMismatchPreview(currentLines, expectedLines) {
    const maxLines = Math.max(currentLines.length, expectedLines.length);
    for (let i = 0; i < maxLines; i++) {
        if (currentLines[i] !== expectedLines[i]) {
            const start = Math.max(0, i - 2);
            const end = Math.min(maxLines - 1, i + 2);
            const preview = [];

            for (let lineIndex = start; lineIndex <= end; lineIndex++) {
                const lineNo = String(lineIndex + 1).padStart(3, ' ');
                const marker = lineIndex === i ? '>' : ' ';
                preview.push(`${marker} ${lineNo} popup   : ${printableLine(currentLines[lineIndex])}`);
                preview.push(`${marker} ${lineNo} expected: ${printableLine(expectedLines[lineIndex])}`);
            }

            return {
                line: i + 1,
                preview: preview.join('\n')
            };
        }
    }

    return null;
}

function main() {
    const writeMode = hasArg('--write');
    const checkMode = hasArg('--check');

    if ((writeMode && checkMode) || (!writeMode && !checkMode)) {
        fail('Usage: node scripts/generate-advanced-popup-scripts.js --write|--check');
    }

    const repoRoot = process.cwd();
    const popupPath = path.join(repoRoot, 'popup.html');
    if (!fs.existsSync(popupPath)) {
        fail('popup.html not found in current working directory');
    }

    const popupRaw = fs.readFileSync(popupPath, 'utf8');
    const eol = detectEol(popupRaw);
    const popupLines = popupRaw.split(/\r?\n/);

    const generatedBlockLines = buildGeneratedBlock(repoRoot);
    const { start, end } = extractCurrentBlock(popupLines);
    const currentBlockLines = popupLines.slice(start, end + 1);
    const generatedText = generatedBlockLines.join(eol);
    const currentText = currentBlockLines.join(eol);

    if (checkMode) {
        if (currentText !== generatedText) {
            const mismatch = buildMismatchPreview(currentBlockLines, generatedBlockLines);
            const mismatchDetails = mismatch
                ? `First mismatch at Advanced block line ${mismatch.line}:\n${mismatch.preview}\n`
                : '';
            fail(
                `${mismatchDetails}Advanced popup script block is out of date. Run: node scripts/generate-advanced-popup-scripts.js --write`
            );
        }
        process.stdout.write('Advanced popup script block is up to date.\n');
        return;
    }

    const rewritten = replaceBlock(popupLines, start, end, generatedBlockLines).join(eol);
    fs.writeFileSync(popupPath, rewritten, 'utf8');
    process.stdout.write('Updated Advanced popup script block in popup.html\n');
}

main();
