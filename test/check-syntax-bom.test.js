const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// A raw byte-order mark inside a source file is invisible in an editor and in a diff: check-syntax.js fails on one, naming the place,
// so it is written as an escape sequence where it is needed (two test files already held a raw one, and two more were written by accident).

const root = path.join(__dirname, '..');
const { MARK, findRawBom } = require('../scripts/lib/raw-bom.js');

test('the mark is U+FEFF, and a text without one has no place', () => {
  assert.equal(MARK.codePointAt(0), 0xFEFF);
  assert.equal(MARK.length, 1);
  assert.deepEqual(findRawBom(''), []);
  assert.deepEqual(findRawBom('const a = "\\uFEFF";\n'), [], 'the written escape is text, not the mark');
});

test('every mark is found with its line and column, at the start of a file too, whatever the line endings', () => {
  assert.deepEqual(findRawBom(`${MARK}const a = 1;\n`), [{ line: 1, column: 1 }]);
  assert.deepEqual(findRawBom(`one\r\ntwo ${MARK}x\r\nthree\n`), [{ line: 2, column: 5 }]);
  assert.deepEqual(findRawBom(`a${MARK}b${MARK}\n\n${MARK}`), [{ line: 1, column: 2 }, { line: 1, column: 4 }, { line: 3, column: 1 }]);
});

function sweep(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antibot-bom-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), content);
    }
    return spawnSync(process.execPath, [path.join(root, 'scripts', 'check-syntax.js')], { cwd: dir, encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('check:syntax names a raw mark and fails, and still passes a clean folder', () => {
  const clean = sweep({ 'a.js': 'const a = 1;\n', 'deep/b.js': "const b = '\\uFEFF';\n" });
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /Syntax OK/);

  const marked = sweep({ 'ok.js': 'const a = 1;\n', 'tests/marked.js': `const s = 'x${MARK}y';\n` });
  assert.equal(marked.status, 1);
  assert.match(marked.stderr, /Raw byte-order mark \(U\+FEFF\) in tests[\\/]marked\.js:1:13/);
  assert.match(marked.stderr, /Syntax check FAILED: 1 file/);

  const atStart = sweep({ 'start.js': `${MARK}const a = 1;\n` });
  assert.equal(atStart.status, 1, 'JavaScript allows it at the start, so only this check sees it');
  assert.match(atStart.stderr, /start\.js:1:1/);
});

test('a genuine syntax error is still reported, next to a mark in another file', () => {
  const run = sweep({ 'bad.js': 'const = ;\n', 'marked.js': `const s = '${MARK}';\n` });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Syntax error in bad\.js/);
  assert.match(run.stderr, /Raw byte-order mark \(U\+FEFF\) in marked\.js:1:12/);
  assert.match(run.stderr, /Syntax check FAILED: 2 file/);
});

test('this repository has none', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.git', '.claude'].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (entry.name.endsWith('.js') ? [full] : []);
  });
  const marked = walk(root).flatMap(file => findRawBom(fs.readFileSync(file, 'utf8')).map(({ line }) => `${path.relative(root, file)}:${line}`));
  assert.deepEqual(marked, []);
});
