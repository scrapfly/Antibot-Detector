#!/usr/bin/env node
/**
 * Writes docs/antibots/<slug>.md for every detector in detectors/antibot and docs/antibots/README.md (the index), from the
 * detector JSON plus the hand-written blurbs in scripts/lib/antibot-blurbs.json. Run it after changing an anti-bot detector:
 *   node scripts/generate-antibot-pages.js          write the pages
 *   node scripts/generate-antibot-pages.js --check  write nothing, exit 1 if a page is missing, stale or orphaned
 * test/antibot-pages.test.js runs the same comparison.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildPage, buildIndex, slugOf } = require('./lib/antibot-pages');

const ROOT = path.join(__dirname, '..');
const DETECTORS = path.join(ROOT, 'detectors', 'antibot');
const OUT = path.join(ROOT, 'docs', 'antibots');

/** Every expected file: { 'slug.md': text, 'README.md': text }. */
function generate(root = ROOT) {
  const dir = path.join(root, 'detectors', 'antibot');
  const blurbs = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'antibot-blurbs.json'), 'utf8'));
  const files = {};
  const entries = [];
  for (const file of fs.readdirSync(dir).filter(f => /^detect-.+\.json$/.test(f)).sort()) {
    const detector = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, ''));
    const slug = slugOf(detector.id);
    files[`${slug}.md`] = buildPage(detector, blurbs[slug] || '');
    entries.push({ id: detector.id, name: detector.name, difficulty: detector.difficulty });
  }
  files['README.md'] = buildIndex(entries);
  return files;
}

function main() {
  const check = process.argv.includes('--check');
  const files = generate();
  const existing = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter(f => f.endsWith('.md')) : [];
  const problems = [];
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(OUT, name);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === text) continue;
    problems.push(name);
    if (!check) {
      fs.mkdirSync(OUT, { recursive: true });
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

module.exports = { generate };
