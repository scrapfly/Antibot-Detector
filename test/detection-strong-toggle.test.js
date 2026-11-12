const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Detection search: a "Strong (>=80%)" toggle inside the search box keeps only the results with strong evidence. It is not a
// fifth chip: the chip row stays the three categories and Combinations, and the toggle combines with both and with the search.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const F = () => require('../modules/core/detection-filter.js');

const det = (name, category, confidence, extra = {}) => ({ detector: { name }, category, confidence, ...extra });
const results = [
  det('Cloudflare', 'Anti-Bot', 100),
  det('DataDome', 'Anti-Bot', 79),
  det('reCAPTCHA', 'CAPTCHA', 80, { combinations: [{ id: 'c' }] }),
  det('Canvas Fingerprint', 'Fingerprint', 95),
  det('Navigator Fingerprint', 'Fingerprint', 30),
  det('Odd', 'Anti-Bot', 'junk')
];
const names = (list) => list.map(entry => entry.detector.name);

test('strong evidence is 80% or more, the same tier as the Statistics page', () => {
  const HistoryStats = require('../sections/stats/history-stats.js');
  assert.equal(F().STRONG_MIN, (HistoryStats.HistoryStats || HistoryStats).STRONG_MIN);
  assert.equal(F().isStrong({ confidence: 80 }), true);
  assert.equal(F().isStrong({ confidence: '80' }), true);
  assert.equal(F().isStrong({ confidence: 79.9 }), false);
  for (const junk of [null, undefined, {}, { confidence: 'x' }, 'text']) assert.equal(F().isStrong(junk), false, String(junk));
});

test('the toggle keeps the strong results, in their order, and ANDs with the search and the chips', () => {
  assert.deepEqual(names(F().filter(results, { strong: true })), ['Cloudflare', 'reCAPTCHA', 'Canvas Fingerprint']);
  assert.deepEqual(names(F().filter(results, { strong: true, chips: { categories: ['antibot'] } })), ['Cloudflare']);
  assert.deepEqual(names(F().filter(results, { strong: true, chips: { combinations: true } })), ['reCAPTCHA']);
  assert.deepEqual(names(F().filter(results, { strong: true, query: 'fingerprint' })), ['Canvas Fingerprint']);
  assert.deepEqual(names(F().filter(results, { strong: false })), names(results), 'off: nothing left out');
  assert.deepEqual(names(F().filter(results, { strong: 'yes' })), names(results), 'only true turns it on');
  assert.deepEqual(F().normalizeChips({ categories: ['captcha'] }), { combinations: false, categories: ['captcha'] }, 'the chips keep their shape');
  assert.deepEqual([...F().FLAGS], ['combinations'], 'not a chip');
});

test('the toggle sits inside the search box, outside the chip row, and says whether it is on', () => {
  const html = read('sections/detection/detection.html');
  const box = html.slice(html.indexOf('<div class="search-container detection-search">'), html.indexOf('id="detectionFilters"'));
  const button = box.match(/<button\b[^>]*id="detectionStrongToggle"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(button, 'in the search box, before the chips');
  assert.match(button[0], /type="button"/);
  assert.match(button[0], /aria-pressed="false"/);
  assert.match(button[0], /data-i18n="detectionStrongToggle"/);
  const row = html.slice(html.indexOf('id="detectionFilters"'), html.indexOf('</div>', html.indexOf('id="detectionFilters"')));
  assert.equal((row.match(/history-filter-chip/g) || []).length, 4, 'still four chips');
  assert.match(read('sections/detection/detection.js'), /#detectionStrongToggle/);
});

function loadUi() {
  const context = vm.createContext({ console, self: {} });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'modules/core/history-filter.js', 'modules/core/detection-filter.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'sections/detection/detection-ui.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context.DetectionUI;
}

test('the tab filters with the toggle, counts it as filtering, and Clear filters turns it off', () => {
  const ui = loadUi();
  let shown;
  const toggle = { attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } };
  const context = {
    currentResults: results,
    activeChips: { combinations: false, categories: [] },
    getFilteredResults: ui.getFilteredResults,
    sortDetectionsByCategory: (list) => list,
    paginationManager: { setItems(items) { shown = items; } }
  };
  // No document in the sandbox: the state alone
  ui.toggleStrongFilter.call(context);
  assert.equal(context.strongOnly, true);
  assert.equal(ui.isFiltering.call(context), true);
  assert.deepEqual(names(shown), ['Cloudflare', 'reCAPTCHA', 'Canvas Fingerprint']);
  ui.toggleStrongFilter.call(context);
  assert.equal(context.strongOnly, false);
  assert.equal(ui.isFiltering.call(context), false);
  assert.equal(shown.length, results.length);
  ui.toggleStrongFilter.call(context);
  ui.clearFilters.call(context);
  assert.equal(context.strongOnly, false, 'Clear filters turns it off');
  assert.equal(shown.length, results.length);
  assert.equal(typeof toggle.setAttribute, 'function');
});

test('every language has the toggle\'s label, translated', () => {
  const en = JSON.parse(read('_locales/en/messages.json'));
  assert.ok(en.detectionStrongToggle && en.detectionStrongToggle.description);
  assert.match(en.detectionStrongToggle.message, /80/);
  for (const locale of fs.readdirSync(path.join(root, '_locales')).filter(name => name !== 'en')) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    assert.ok(messages.detectionStrongToggle && /80/.test(messages.detectionStrongToggle.message), locale);
    assert.notEqual(messages.detectionStrongToggle.message, en.detectionStrongToggle.message, `${locale} is translated`);
  }
});
