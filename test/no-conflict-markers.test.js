'use strict';
// A merge or rebase that leaves a conflict marker behind breaks a file quietly: a stray "=======" in a stylesheet turns
// the next rule's selector invalid and the browser drops it, and no other test notices (3.0.4 shipped one to review).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('no source file holds a leftover merge conflict marker', () => {
  const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n')
    .filter((file) => /\.(js|css|html|json|md|txt|yml|sh)$/.test(file));
  assert.ok(files.length > 300, 'the guard scans the repository');
  const found = [];
  for (const file of files) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    fs.readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (/^(<{7}|={7}|>{7})( |$)/.test(line)) found.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(found, []);
});
