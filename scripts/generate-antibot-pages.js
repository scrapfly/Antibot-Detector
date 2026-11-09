#!/usr/bin/env node
/**
 * Writes docs/antibots/<slug>.md (English) and docs/antibots/<code>/<slug>.md for the other README languages, for every detector in
 * detectors/antibot, plus each language's README.md index, from the detector JSON, the string tables in
 * scripts/lib/antibot-pages-i18n/<code>.json and the hand-written blurbs in scripts/lib/antibot-blurbs/<code>.json. Run it after changing an anti-bot detector:
 *   node scripts/generate-antibot-pages.js          write the pages
 *   node scripts/generate-antibot-pages.js --check  write nothing, exit 1 if a page is missing, stale or orphaned
 * test/antibot-pages.test.js runs the same comparison.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildPage, buildIndex, slugOf, LANGS } = require('./lib/antibot-pages');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'antibots');
const LIB = path.join(__dirname, 'lib');

/** Every expected file, keyed by path under docs/antibots: 'slug.md', 'README.md', 'es/slug.md', 'es/README.md', ... */
function generate(root = ROOT) {
  const dir = path.join(root, 'detectors', 'antibot');
  const detectors = fs.readdirSync(dir).filter(f => /^detect-.+\.json$/.test(f)).sort()
    .map(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8').replace(/^\uFEFF/, '')));
  const entries = detectors.map(d => ({ id: d.id, name: d.name, difficulty: d.difficulty }));
  const files = {};
  for (const { code } of LANGS) {
    const strings = JSON.parse(fs.readFileSync(path.join(LIB, 'antibot-pages-i18n', `${code}.json`), 'utf8'));
    const blurbs = JSON.parse(fs.readFileSync(path.join(LIB, 'antibot-blurbs', `${code}.json`), 'utf8'));
    const prefix = code === 'en' ? '' : `${code}/`;
    for (const detector of detectors) {
      files[`${prefix}${slugOf(detector.id)}.md`] = buildPage(detector, blurbs[slugOf(detector.id)] || '', strings, code);
    }
    files[`${prefix}README.md`] = buildIndex(entries, strings, code);
  }
  return files;
}

/** Every .md under dir, as paths relative to it with forward slashes. */
function listMarkdown(dir, base = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...listMarkdown(path.join(dir, entry.name), `${base}${entry.name}/`));
    else if (entry.name.endsWith('.md')) out.push(`${base}${entry.name}`);
  }
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  const files = generate();
  const existing = listMarkdown(OUT);
  const problems = [];
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(OUT, name);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === text) continue;
    problems.push(name);
    if (!check) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text, 'utf8');
    }
  }
  for (const name of existing) {
    if (files[name]) continue;
    problems.push(`${name} (no detector)`);
    if (!check) fs.unlinkSync(path.join(OUT, name));
  }
  if (check && problems.length) {
    console.error(`docs/antibots is out of date: ${problems.join(', ')}. Run node scripts/generate-antibot-pages.js`);
    process.exit(1);
  }
  console.log(`${check ? 'checked' : 'wrote'} ${Object.keys(files).length} pages${problems.length && !check ? ` (${problems.length} changed)` : ''}`);
}

if (require.main === module) main();

module.exports = { generate, listMarkdown };
