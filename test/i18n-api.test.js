const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The scripts call I18n by name from the popup, the worker and the stats page. A call to a method it does not have is
// a TypeError that the surrounding code usually swallows: the page notice asked I18n.dir() for years, got nothing, and
// never mirrored its layout in Arabic.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const load = (language) => {
  const context = vm.createContext({ chrome: { i18n: { getUILanguage: () => language, getMessage: () => '' } }, console });
  vm.runInContext(read('modules/core/i18n.js') + '\nthis.I18n = I18n;', context);
  return context.I18n;
};

test('dir() is rtl for the right-to-left languages, whatever the region, and ltr for every other language', () => {
  for (const tag of ['ar', 'ar-EG', 'ar_SA', 'he', 'fa-IR', 'ur']) assert.strictEqual(load(tag).dir(), 'rtl', tag);
  for (const tag of ['en', 'es', 'zh-TW', 'zh_CN', 'th', 'hi', 'pt_BR', 'arn']) assert.strictEqual(load(tag).dir(), 'ltr', tag);
  const override = load('en');
  override._overrideLocale = 'ar';
  assert.strictEqual(override.dir(), 'rtl', 'the language chosen in Settings wins over the browser language');
});

test('applyDocumentLang tags the page with the language and its reading direction (the popup reads right to left in Arabic)', () => {
  for (const [language, dir] of [['ar', 'rtl'], ['es', 'ltr']]) {
    const I18n = load(language);
    const attributes = {};
    const doc = { documentElement: { getAttribute: (name) => attributes[name] ?? null, setAttribute: (name, value) => { attributes[name] = value; } } };
    I18n.applyDocumentLang(doc);
    assert.strictEqual(attributes.dir, dir, language);
    assert.strictEqual(attributes.lang, language);
  }
});

test('apply() translates the element it is given as well as its descendants (a section is added one top-level element at a time)', () => {
  const context = vm.createContext({ chrome: { i18n: { getUILanguage: () => 'de', getMessage: (key) => `[${key}]` } }, document: {}, console });
  vm.runInContext(read('modules/core/i18n.js') + '\nthis.I18n = I18n;', context);
  // The smallest stand-in for an element: attributes, a text, descendants and the one selector shape apply() uses
  const element = (attributes, children = []) => {
    const el = {
      nodeType: 1, attributes: { ...attributes }, children, textContent: '',
      getAttribute: (name) => (name in el.attributes ? el.attributes[name] : null),
      setAttribute: (name, value) => { el.attributes[name] = value; },
      matches: (selector) => selector.slice(1, -1) in el.attributes,
      querySelectorAll: (selector) => children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)])
    };
    return el;
  };
  const inner = element({ 'data-i18n-title': 'btnClose', title: 'Close' });
  const row = element({ 'data-i18n-aria-label': 'historyFiltersLabel', 'aria-label': 'Filter history' }, [inner]);
  context.I18n.apply(row);
  assert.strictEqual(row.attributes['aria-label'], '[historyFiltersLabel]', 'the element itself');
  assert.strictEqual(inner.attributes.title, '[btnClose]', 'and what is inside it');
  const heading = element({ 'data-i18n': 'settingsStorageTitle' });
  context.I18n.apply(heading);
  assert.strictEqual(heading.textContent, '[settingsStorageTitle]');
});

function extensionScripts() {
  const out = [];
  const skip = new Set(['node_modules', 'test', 'scripts', '.git', '.claude', 'detectors', '_locales', 'assets', 'icons', 'store']);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!skip.has(entry.name)) walk(path.join(dir, entry.name)); continue; }
      if (entry.name.endsWith('.js')) out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out;
}

test('every I18n method or field the extension scripts use exists', () => {
  const I18n = load('en');
  const used = new Map();
  for (const file of extensionScripts()) {
    for (const [, name] of read(file).matchAll(/\bI18n\??\.([A-Za-z_]\w*)/g)) {
      if (!used.has(name)) used.set(name, new Set());
      used.get(name).add(file);
    }
  }
  assert.ok(used.size >= 8, 'the guard finds the calls');
  // Names with a leading underscore are state I18n creates while it runs (_observer), not API
  const missing = [...used].filter(([name]) => !name.startsWith('_') && !(name in I18n)).map(([name, files]) => `I18n.${name} (${[...files].join(', ')})`);
  assert.deepStrictEqual(missing, []);
});
