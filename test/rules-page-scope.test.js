const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 3.1.9: the rule editor keeps a content rule's scope "page" (Settings → Content Search Scope → "Only block and challenge pages"),
// drops it when the option is turned off, and never stores it beside "Only check scripts".

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const ctx = { Rules: function() {}, JSON, console, Logger: new Proxy({}, { get: () => () => {} }), FormatUtils: require('../utils/format-utils.js') };
vm.createContext(ctx);
vm.runInContext(read('modules/core/rule-duplicates.js'), ctx);
vm.runInContext(read('sections/rules/rules-editor.js'), ctx);
const merge = (original, fromForm) => JSON.parse(JSON.stringify(vm.runInContext('mergeRuleWithForm', ctx)(original, fromForm, 'content', true)));

const STORED = { id: 'sucuri-block-title', text: 'Access Denied', scope: 'page', confidence: 30, standalone: false, description: 'Title' };

test('a "page" rule saved with the option on keeps its scope', () => {
  const saved = merge(STORED, { id: STORED.id, text: STORED.text, confidence: 30, standalone: false, description: 'Title', scope: 'page' });
  assert.equal(saved.scope, 'page');
  assert.equal(saved.checkScripts, undefined);
});

test('turned off, the scope goes and the rule reads the whole page', () => {
  const saved = merge(STORED, { id: STORED.id, text: STORED.text, confidence: 30, standalone: false, description: 'Title' });
  assert.equal(saved.scope, undefined);
});

test('"Only check scripts" turned on replaces it', () => {
  const saved = merge(STORED, { id: STORED.id, text: STORED.text, confidence: 30, checkScripts: true });
  assert.equal(saved.scope, undefined);
  assert.equal(saved.checkScripts, true);
});

test('a rule limited to scripts can be moved to small pages', () => {
  const saved = merge({ ...STORED, scope: 'scripts', checkScripts: true }, { id: STORED.id, text: STORED.text, confidence: 30, scope: 'page' });
  assert.equal(saved.scope, 'page');
  assert.equal(saved.checkScripts, undefined);
});

test('the form reads and writes the option: the row carries it, the dialog has its toggle with a name, and both are exclusive', () => {
  const editor = read('sections/rules/rules-editor.js');
  assert.match(editor, /data-page-scope="\$\{pageScope\}"/);
  assert.match(editor, /const pageScope = methodType === 'content' && !checkScripts && method\.scope === 'page';/);
  assert.match(editor, /item\.dataset\.pageScope === 'true'\) \{\s*methodData\.scope = 'page';/);
  const html = read('sections/rules/rules.html');
  assert.match(html, /<input type="checkbox" id="checkPageSource" class="toggle-input" aria-labelledby="checkPageSourceLabel">/);
  assert.match(html, /id="checkPageSourceLabel"[^>]*data-i18n="rulesOnlyBlockPages"/);
  const settings = read('sections/rules/rules-method-settings.js');
  assert.match(settings, /onlyScripts\.addEventListener\('change', \(\) => \{ if \(onlyScripts\.checked\) onlyPages\.checked = false; \}\)/);
  assert.match(settings, /onlyPages\.addEventListener\('change', \(\) => \{ if \(onlyPages\.checked\) onlyScripts\.checked = false; \}\)/);
  assert.match(settings, /this\.currentMethodItem\.dataset\.pageScope = pageScope;/);
});
