const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('sections/detection/detection.html');
const css = read('modules/styles/detection.css');
const input = html.match(/<input\b[^>]*\bid="detectionSearch"[^>]*>/)[0];
const block = selector => {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `Missing selector: ${selector}`);
  return css.slice(start, css.indexOf('}', start) + 1);
};

test('detection search retains its input identity and localized accessible name', () => {
  assert.equal((html.match(/id="detectionSearch"/g) || []).length, 1);
  assert.match(input, /type="text"/);
  assert.match(input, /class="search-input"/);
  assert.match(input, /data-i18n-placeholder="detectionSearchPlaceholder"/);
  assert.match(input, /aria-label="Search detections\.\.\."/);
  assert.match(input, /data-i18n-aria-label="detectionSearchPlaceholder"/);
  for (const locale of fs.readdirSync(path.join(root, '_locales'))) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    assert.ok(messages.detectionSearchPlaceholder.message, locale);
  }
});

test('search is a plain field like Rules and History (no icon)', () => {
  assert.match(html, /<div class="search-container detection-search">\s*<input[^>]*id="detectionSearch"/);
  assert.match(html, /id="detectionSearch"[^>]*>\s*<\/div>\s*<div id="resultsList"/);
  assert.doesNotMatch(html, /detection-search-icon/);
});

test('search field uses the same look as the Rules and History search', () => {
  const field = block('#detectionResults .detection-search .search-input');
  const rules = read('modules/styles/rules.css');
  const rulesField = rules.slice(rules.indexOf('.rules-header .search-input {'), rules.indexOf('}', rules.indexOf('.rules-header .search-input {')));
  for (const rule of [/height:\s*34px/, /padding:\s*0 11px/, /font-size:\s*11\.5px/, /border:\s*1px solid #4b4b4b/,
    /border-radius:\s*8px/, /background:\s*var\(--bg-secondary\)/]) {
    assert.match(field, rule);
    assert.match(rulesField, rule);
  }
  assert.match(field, /box-sizing:\s*border-box/);
  assert.match(field, /width:\s*100%/);
  assert.match(block('#detectionResults .detection-search'), /flex-shrink:\s*0/);
});

test('focus gets one calm blue ring without a stacked outline', () => {
  const focus = block('#detectionResults .detection-search .search-input:focus');
  assert.match(focus, /border-color:\s*var\(--accent\)/);
  assert.match(focus, /outline:\s*none/);
  assert.match(focus, /box-shadow:\s*0 0 0 2px rgba\(59, 130, 246, 0\.12\)/);
});

test('existing input handler still filters and clearing restores all results', () => {
  const source = read('sections/detection/detection.js');
  assert.match(source, /querySelector\('#detectionSearch'\)/);
  assert.match(source, /searchInput\.addEventListener\('input', \(e\) => \{\s*this\.handleSearch\(e\.target\.value\)/);
  const sandbox = vm.createContext({ self: {} });
  vm.runInContext(read('utils/detection-utils.js'), sandbox);
  vm.runInContext(read('sections/detection/detection-ui.js'), sandbox);
  const ui = sandbox.self.DetectionUI;
  const results = [{ detector: { name: 'Cloudflare' }, category: 'antibot' }, { detector: { name: 'DataDome' }, category: 'antibot' }];
  let shown;
  const context = {
    currentResults: results,
    getFilteredResults: ui.getFilteredResults,
    sortDetectionsByCategory: ui.sortDetectionsByCategory,
    paginationManager: { setItems(items) { shown = items; } }
  };
  ui.handleSearch.call(context, ' CLOUDflare ');
  assert.equal(context.searchQuery, 'cloudflare');
  assert.equal(shown.length, 1);
  assert.equal(shown[0], results[0]);
  ui.handleSearch.call(context, 'no-match');
  assert.equal(shown.length, 0);
  ui.handleSearch.call(context, '');
  assert.equal(shown, results);
});
