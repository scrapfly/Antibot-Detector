#!/usr/bin/env node
/**
 * Portable JS syntax sweep: runs `node --check` on every .js file in the repo
 * (excluding node_modules/.git). Replaces the bash find|xargs one-liner so it
 * works cross-platform via `npm run check:syntax`.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
}

if (failed > 0) {
  console.error(`Syntax check FAILED: ${failed} file(s) with errors.`);
  process.exit(1);
}
console.log('Syntax OK (all .js files parse).');
