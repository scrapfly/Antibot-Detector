const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The rule editor once had an "add a detection method section" button: its handler asked for the method type with the browser's own
// prompt(). No element has carried that button's class since, so the handler, the 150-line function behind it, its two copies of the
// style and its text in 22 languages were dead code. They are gone; this keeps them from coming back by accident.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function walk(dir, extensions, found = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(relative, extensions, found);
    else if (extensions.includes(path.extname(entry.name))) found.push(relative);
  }
  return found;
}
const sources = [...['sections', 'modules', 'utils', 'background'].flatMap(dir => walk(dir, ['.js', '.html', '.css'])), 'popup.html', 'popup.js', 'background.js', 'content.js'];

test('nothing in the extension names the removed button, its function or its prompt text', () => {
  const offenders = [];
  for (const file of sources) {
    const text = read(file);
    for (const needle of ['addNewMethodSection', 'add-section-btn', 'rulesUiEnterMethodTypePrompt']) if (text.includes(needle)) offenders.push(`${file}: ${needle}`);
  }
  assert.deepEqual(offenders, []);
});

test('no language file keeps the text of the removed prompt', () => {
  const offenders = fs.readdirSync(path.join(root, '_locales')).filter(code => 'rulesUiEnterMethodTypePrompt' in JSON.parse(read(`_locales/${code}/messages.json`)));
  assert.deepEqual(offenders, []);
});

test('the extension asks nothing with the browser\'s own prompt()', () => {
  const offenders = sources.filter(file => file.endsWith('.js') && /(^|[^.\w$])prompt\s*\(/m.test(read(file)));
  assert.deepEqual(offenders, []);
});

test('the Add pattern button keeps its look: only the removed button\'s selectors left the shared rule', () => {
  const css = read('sections/rules/styles/editor.css');
  const base = css.match(/\n\.add-method-btn\s*\{([^}]*)\}/);
  assert.ok(base, 'the rule of the Add pattern button');
  for (const declaration of [/display:\s*flex/, /width:\s*100%/, /padding:\s*8px 12px/, /background:\s*var\(--accent\)/, /border:\s*1px solid var\(--accent\)/, /color:\s*white/]) assert.match(base[1], declaration);
  assert.match(css, /\n\.add-method-btn:hover\s*\{[^}]*background:\s*var\(--accent-hover\)/);
});
