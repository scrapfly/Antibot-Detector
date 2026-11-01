#!/usr/bin/env node
/**
 * Portable JS syntax sweep: runs `node --check` on every .js file in the repo
 * (excluding node_modules/.git). Replaces the bash find|xargs one-liner so it
 * works cross-platform via `npm run check:syntax`. It also fails on a raw byte-order mark in a source file (see lib/raw-bom.js).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { findRawBom } = require('./lib/raw-bom.js');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

let failed = 0;
for (const file of walk('.')) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`Syntax error in ${file}\n${(err.stderr || err).toString()}`);
  }
  // Invisible in an editor and in a diff, so it is looked for: an escape sequence shows what it is
  for (const { line, column } of findRawBom(fs.readFileSync(file, 'utf8'))) {
    failed++;
    console.error(`Raw byte-order mark (U+FEFF) in ${file}:${line}:${column}: write it as an escape sequence, or build it with String.fromCharCode(0xFEFF)`);
  }
}

if (failed > 0) {
  console.error(`Syntax check FAILED: ${failed} file(s) with errors.`);
  process.exit(1);
}
console.log('Syntax OK (all .js files parse).');
