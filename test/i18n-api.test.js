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
