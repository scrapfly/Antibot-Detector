const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// node scripts/check-locale-keys.js --unused lists the keys nothing names. It used to match each key as a substring of the
// whole corpus, so advCodeDescPython looked used because advCodeDescPythonBs is (fourteen dead keys hid behind longer names).
// A key now counts as used only as a whole token.

const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts', 'check-locale-keys.js');
const unused = (base) => spawnSync(process.execPath, [path.join(base, 'scripts', 'check-locale-keys.js'), '--unused'], { encoding: 'utf8' });

test('a key that only sits inside a longer name is reported; the longer name and a key in a table are not', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'locale-keys-'));
  try {
    fs.mkdirSync(path.join(base, 'scripts'));
    fs.copyFileSync(script, path.join(base, 'scripts', 'check-locale-keys.js'));
    const messages = Object.fromEntries(['usedInTable', 'shortKey', 'shortKeyLong', 'neverNamed'].map(key => [key, { message: key }]));
    for (const locale of ['en', 'es']) {
      fs.mkdirSync(path.join(base, '_locales', locale), { recursive: true });
      fs.writeFileSync(path.join(base, '_locales', locale, 'messages.json'), JSON.stringify(messages, null, 2) + '\n');
    }
    fs.mkdirSync(path.join(base, 'src'));
    fs.writeFileSync(path.join(base, 'src', 'app.js'), "const LABELS = { first: 'usedInTable' };\nI18n.get('shortKeyLong');\n");
    const run = unused(base);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const listed = /unused key\(s\): ([^\n]*)/.exec(run.stderr);
    assert.ok(listed, run.stderr);
    assert.deepEqual(listed[1].split(', ').sort(), ['neverNamed', 'shortKey']);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('every key of the extension is named somewhere: no dead locale key comes back', () => {
  const run = unused(root);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /No unused keys\./);
});
