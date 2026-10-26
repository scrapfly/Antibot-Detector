const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Detection tab cards: grouped under category headers, the difficulty as the
// one coloured tag, "NN% sure" and the evidence on one neutral line.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const context = vm.createContext({ console, self: {}, encodeURIComponent, decodeURIComponent });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'sections/detection/detection-ui.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const ui = context.DetectionUI;
  const colours = { antibot: { colour: '#FF5733' }, captcha: { colour: '#33C3FF' }, fingerprint: { colour: '#3b82f6' } };
  const state = {
    detectorManager: { getCategoryInfo: key => colours[key] },
    getGlobalDetectionIndex: (detection, index) => index,
    getDetectorIcon: () => '<img src="x.png" alt="">',
    getCategoryBadges: () => { throw new Error('list cards no longer render category chips'); }
  };
  const card = (detection, extra = {}) => ui.buildDetectionCardHtml.call({ ...state, ...extra }, detection, 0);
  return { ui, state, card };
}

const cloudflare = {
  detector: { name: 'Cloudflare Bot Management' }, category: 'Anti-Bot', confidence: 95, difficulty: 'Medium',
  matches: [{ type: 'url' }, { type: 'cookie' }, { type: 'header' }, { type: 'url' }, { type: 'header' }, { type: 'content' }]
};

test('evidence lists the methods with most matches first, counts above one and "+N" past three', () => {
  const { ui } = load();
  assert.equal(ui.evidenceSummary(cloudflare.matches), 'Headers 2, Url 2, Cookies +1');
  assert.equal(ui.evidenceSummary([{ type: 'cookies' }, { type: 'cookie' }]), 'Cookies 2', 'plural types count as one method');
  assert.equal(ui.evidenceSummary([{ type: 'dom' }], true), 'Combination · Dom');
  assert.equal(ui.evidenceSummary([], true), 'Combination');
  assert.equal(ui.evidenceSummary([]), '');
});

test('a card shows name, difficulty pill, "NN% sure", evidence and a confidence bar, without category chips', () => {
  const { card } = load();
  const html = card(cloudflare);
  assert.match(html, /class="detector-name"[^>]*>Cloudflare Bot Management</);
  assert.match(html, /diff-metric[^"]*card-difficulty/);
  assert.match(html, /class="card-sure"[^>]*>95% sure</);
  // Every method as its icon and count, most first; the words stay for screen readers
  assert.match(html, /class="card-evidence"[^>]*><span class="visually-hidden">Headers 2, Url 2, Cookies, Content<\/span>/);
  const items = [...html.matchAll(/<span class="card-evidence-item" style="--method-color:(#[0-9a-fA-F]{6})" aria-hidden="true"><svg[^]*?<\/svg><span class="card-evidence-count">(\d+)<\/span>/g)].map(m => `${m[1]} ${m[2]}`);
  // Each in its Settings → Tag Colors default: headers, URLs, cookies, content
  assert.deepEqual(items, ['#FF33A8 2', '#00BCD4 2', '#FFC133 1', '#33FFF3 1']);
  const recoloured = card(cloudflare, { tagColors: { headers: '#123456', urls: 'red' } });
  assert.match(recoloured, /--method-color:#123456/, 'a saved colour is used');
  assert.match(recoloured, /--method-color:#00BCD4/, 'an invalid saved colour falls back to the default');
  assert.ok(!html.includes('is-combination'), 'no combination decided it: no combination mark');
  const rows = JSON.parse(html.match(/class="card-evidence"[^>]*data-tip-rows="([^"]*)"/)[1].replace(/&quot;/g, '"'));
  assert.deepEqual(rows.map(row => `${row.label} ${row.value}`), ['Headers 2', 'Url 2', 'Cookies 1', 'Content 1']);
  assert.match(html, /class="card-evidence" data-tip="6 matches"/);
  assert.match(html, /--conf:95%;--cat-color:#FF5733/);
  assert.ok(!/class="badge/.test(html), 'no rainbow chips');
  assert.ok(!html.includes('card-meta-category'), 'grouped list: the header names the category');
});

test('with the highest confidence first the category moves into the card line', () => {
  const { card } = load();
  const html = card(cloudflare, { sortBy: 'confidence' });
  assert.match(html, /card-meta-category"><span class="category-icon" style="color:#FF5733"[^>]*><svg[^]*?<\/svg><\/span>Anti-bot</);
});

test('a page opens each category with a header counting all listed protections of it', () => {
  const { ui, state } = load();
  const items = [{ category: 'antibot' }, { category: 'antibot' }, { category: 'captcha' }];
  const self = { ...state, paginationManager: { filteredItems: [...items, { category: 'captcha' }] } };
  const html = ui.buildPageItemsHtml.call(self, items, (d, i) => `<div class="detection-card" data-i="${i}"></div>`);
  const heads = [...html.matchAll(/detection-group-head[^>]*>.*?<\/svg><\/span>([^<]*)</g)].map(m => m[1]);
  assert.match(html, /class="category-icon" style="color:#FF5733"[^>]*><svg/, 'the header shows the category icon in its colour, not a dot');
  assert.deepEqual(heads, ['Anti-bot · 2', 'Captcha · 2'], 'counts come from every filtered item, not just this page');
  assert.equal((html.match(/class="detection-item"/g) || []).length, 3);
  const continued = ui.buildPageItemsHtml.call(self, items.slice(1), () => '<div></div>');
  assert.match(continued, /^<div class="detection-item"><div class="detection-group-head"/, 'a page starting inside a group repeats its header');
  const batch = ui.buildPageItemsHtml.call(self, items.slice(1, 2), () => '<div></div>', false);
  assert.ok(!batch.includes('detection-group-head'), 'a later batch of the same page does not repeat it');
  assert.ok(!ui.buildPageItemsHtml.call({ ...self, sortBy: 'confidence' }, items, () => '').includes('detection-group-head'));
});

test('a detector with only an id never reaches string methods: search and cards use its id', () => {
  const { ui, card } = load();
  const context = { searchQuery: 'detect-x', currentResults: [{ detector: { id: 'detect-x' }, category: 'antibot', confidence: 50 }, { detector: 'Plain', category: 'captcha' }] };
  context.sortDetectionsByCategory = items => items;
  const found = ui.getFilteredResults.call(context);
  assert.equal(found.length, 1, 'search matches by id instead of throwing');
  assert.match(card({ detector: { id: 'detect-x' }, category: 'antibot', confidence: 50 }), />detect-x</);
  assert.ok(!card({ detector: { id: 'detect-x' }, category: 'antibot' }).includes('[object Object]'));
});

test('clearing the search shows the results in category order again, anti-bot first', () => {
  const { ui, state } = load();
  const shown = [];
  const view = {
    ...state, searchQuery: '',
    currentResults: [
      { detector: { name: 'Navigator Fingerprint' }, category: 'Fingerprint', confidence: 10 },
      { detector: { name: 'Akamai Bot Manager' }, category: 'Anti-Bot', confidence: 95 },
      { detector: { name: 'reCAPTCHA' }, category: 'CAPTCHA', confidence: 80 }
    ],
    paginationManager: { setItems: items => shown.push(items.map(d => d.detector.name)) },
    sortDetectionsByCategory(list) { return ui.sortDetectionsByCategory.call(this, list); },
    getFilteredResults() { return ui.getFilteredResults.call(this); }
  };
  ui.handleSearch.call(view, 'akamai');
  ui.handleSearch.call(view, '');
  assert.deepEqual(shown[0], ['Akamai Bot Manager']);
  assert.deepEqual(shown[1], ['Akamai Bot Manager', 'reCAPTCHA', 'Navigator Fingerprint']);
});

test('the evidence icons: one per method, a combination mark when one decided, a name when a method has no icon', () => {
  const { ui } = load();
  const html = ui.evidenceIconsHtml([{ type: 'cookies' }, { type: 'cookie' }, { type: 'url' }, { type: 'mystery_method' }], true);
  assert.match(html, /^<span class="card-evidence-item is-combination" aria-hidden="true"><svg/);
  assert.equal((html.match(/card-evidence-count/g) || []).length, 3, 'cookies and cookie count as one method');
  assert.match(html, /<span class="card-evidence-name">Mystery method<\/span><span class="card-evidence-count">1<\/span>/);
  assert.deepEqual(ui.evidenceCounts([{ type: 'url' }, { type: 'header' }, { type: 'header' }]).map(r => `${r.type} ${r.count}`), ['header 2', 'url 1']);
  const context = vm.createContext({ console, self: {} }); context.self = context;
  vm.runInContext(read('modules/core/categories.js'), context);
  vm.runInContext(read('utils/format-utils.js'), context);
  for (const method of ['cookie', 'header', 'url', 'content', 'dom', 'window', 'js_hooks', 'payload']) {
    assert.match(context.FormatUtils.methodIconSvg(method), /^<svg [^>]*aria-hidden="true">/, method);
  }
});

test('the details dialog\'s evidence values are copy buttons holding the whole value, escaped', () => {
  const { ui } = load();
  const html = ui.getMethodBadges.call({ detectorManager: { categoryManager: { getTagColor: () => '#00BCD4' } } }, [
    { type: 'url', fullUrl: 'https://www.google.com/js/bg/ekPP3ntX4.js?a=1&b="2"', confidence: 100 },
    { type: 'header', name: '', value: '', confidence: 50 }
  ]);
  assert.match(html, /<button type="button" class="method-value-btn copyable-value"[^>]*data-copy-value="https:\/\/www\.google\.com\/js\/bg\/ekPP3ntX4\.js\?a=1&amp;b=&quot;2&quot;"/);
  assert.match(html, /data-copy-label="value"/);
  assert.match(html, /<span class="method-value-btn" dir="ltr">unknown<\/span>/, 'a row with nothing to copy stays plain text');
});
