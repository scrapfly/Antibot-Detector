const { test } = require('node:test');
const assert = require('node:assert');

const F = require('../modules/core/history-filter.js');

const det = (name, category, confidence = 80) => ({ detector: { name }, category, confidence });
const item = (id, url, detections, extra = {}) => ({ id, url, title: `Page ${id}`, timestamp: 1, detections, ...extra });

const items = [
  item('a', 'https://shop.example.com/cart', [det('Cloudflare', 'Anti-Bot'), det('reCAPTCHA', 'CAPTCHA')], { pinned: true, note: 'Needs a residential proxy', changed: { at: 5, added: ['reCAPTCHA'], removed: [] } }),
  item('b', 'https://news.example.org/', [det('DataDome', 'Anti-Bot')], { changed: { at: 5, added: [], removed: ['Akamai'] } }),
  item('c', 'https://blog.example.net/post', [det('Canvas Fingerprint', 'Fingerprint', 40)], { pinned: true }),
  item('d', 'https://empty.example.io/', [], { note: 'checked by hand' }),
  item('e', 'https://quiet.example.dev/', [det('hCaptcha', 'CAPTCHA')], { changed: { at: 5, added: [], removed: [] } })
];
const ids = (list) => list.map(entry => entry.id);

test('no search and no chips keeps every entry, and drops empty ones', () => {
  assert.deepStrictEqual(ids(F.filter(items)), ['a', 'b', 'c', 'd', 'e']);
  assert.deepStrictEqual(ids(F.filter([null, ...items, undefined], { query: '  ', chips: {} })), ['a', 'b', 'c', 'd', 'e']);
  assert.deepStrictEqual(F.filter(undefined, { query: 'x' }), []);
});

test('the search looks in the address, the title, the note and the protections, ignoring case', () => {
  assert.deepStrictEqual(ids(F.filter(items, { query: 'SHOP.example' })), ['a'], 'address');
  assert.deepStrictEqual(ids(F.filter(items, { query: 'page c' })), ['c'], 'title');
  assert.deepStrictEqual(ids(F.filter(items, { query: 'residential' })), ['a'], 'note');
  assert.deepStrictEqual(ids(F.filter(items, { query: 'by hand' })), ['d'], 'note of an entry without protections');
  assert.deepStrictEqual(ids(F.filter(items, { query: 'datadome' })), ['b'], 'protection name');
  assert.deepStrictEqual(ids(F.filter(items, { query: 'nothing matches this' })), []);
});

test('Pinned and Changed each keep only their entries; a change with nothing added or removed is not a change', () => {
  assert.deepStrictEqual(ids(F.filter(items, { chips: { pinned: true } })), ['a', 'c']);
  assert.deepStrictEqual(ids(F.filter(items, { chips: { changed: true } })), ['a', 'b']);
  assert.strictEqual(F.isChanged(items[4]), false);
  assert.strictEqual(F.isChanged(items[0]), true);
  assert.strictEqual(F.isChanged({}), false);
  assert.strictEqual(F.isChanged(null), false);
});

test('category chips mean "any of these", and every kind of chip must hold at once', () => {
  assert.deepStrictEqual(ids(F.filter(items, { chips: { categories: ['antibot'] } })), ['a', 'b']);
  assert.deepStrictEqual(ids(F.filter(items, { chips: { categories: ['captcha'] } })), ['a', 'e']);
  assert.deepStrictEqual(ids(F.filter(items, { chips: { categories: ['antibot', 'captcha'] } })), ['a', 'b', 'e'], 'either');
  assert.deepStrictEqual(ids(F.filter(items, { chips: { pinned: true, categories: ['antibot', 'captcha'] } })), ['a']);
  assert.deepStrictEqual(ids(F.filter(items, { chips: { pinned: true, changed: true } })), ['a']);
  assert.deepStrictEqual(ids(F.filter(items, { chips: { changed: true, categories: ['antibot'] } })), ['a', 'b']);
  assert.deepStrictEqual(ids(F.filter(items, { chips: { pinned: true, categories: ['captcha'], changed: true } })), ['a']);
  assert.deepStrictEqual(ids(F.filter(items, { chips: { pinned: true, changed: true, categories: ['fingerprint'] } })), []);
});

test('the search and the chips combine with AND', () => {
  assert.deepStrictEqual(ids(F.filter(items, { query: 'example', chips: { pinned: true } })), ['a', 'c']);
  assert.deepStrictEqual(ids(F.filter(items, { query: 'residential', chips: { pinned: true } })), ['a']);
  assert.deepStrictEqual(ids(F.filter(items, { query: 'residential', chips: { changed: true, categories: ['fingerprint'] } })), []);
});

test('a name and a category reader can be passed in (the popup uses its own)', () => {
  const renamed = F.filter(items, { query: 'friendly', nameOf: () => 'Friendly name' });
  assert.deepStrictEqual(ids(renamed), ['a', 'b', 'c', 'e'], 'every entry with a protection');
  const recategorised = F.filter(items, { chips: { categories: ['antibot'] }, categoryOf: () => 'antibot' });
  assert.deepStrictEqual(ids(recategorised), ['a', 'b', 'c', 'e']);
});

test('chips are normalised: unknown categories and non-booleans are ignored, duplicates collapse', () => {
  assert.deepStrictEqual(F.normalizeChips(undefined), { pinned: false, changed: false, categories: [] });
  assert.deepStrictEqual(F.normalizeChips({ pinned: 'yes', changed: 1, categories: ['captcha', 'captcha', 'other', 7] }), { pinned: false, changed: false, categories: ['captcha'] });
  assert.strictEqual(F.isActive({}), false);
  assert.strictEqual(F.isActive({ categories: ['other'] }), false);
  assert.strictEqual(F.isActive({ categories: ['captcha'] }), true);
  assert.strictEqual(F.isActive({ pinned: true }), true);
});

test('detections saved in either shape are read: a name and category on the detection or under detector', () => {
  const flat = item('f', 'https://flat.example/', [{ name: 'Flat', category: 'CAPTCHA' }]);
  assert.deepStrictEqual(ids(F.filter([flat], { query: 'flat' })), ['f']);
  assert.deepStrictEqual(ids(F.filter([flat], { chips: { categories: ['captcha'] } })), ['f']);
  const nested = item('n', 'https://nested.example/', [{ detector: { name: 'Nested', category: 'Anti-Bot' } }]);
  assert.deepStrictEqual(ids(F.filter([nested], { chips: { categories: ['antibot'] } })), ['n']);
});

test('the chip row of the History tab has one chip for Pinned, one for Changed and one for every category, in the category order', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const Categories = require('../modules/core/categories.js');
  const html = fs.readFileSync(path.join(__dirname, '../sections/history/history.html'), 'utf8');
  const row = html.slice(html.indexOf('id="historyFilters"'), html.indexOf('<!-- Toolbar'));
  const chips = [...row.matchAll(/<button[^>]*class="history-filter-chip[^"]*"[^>]*data-filter="([a-z]+)"([^>]*)>([\s\S]*?)<\/button>/g)]
    .map(match => ({ filter: match[1], category: (match[2].match(/data-category="([a-z]+)"/) || [])[1], label: (match[3].match(/data-i18n="([A-Za-z]+)"/) || [])[1] }));
  assert.deepStrictEqual(chips.map(chip => chip.filter), ['pinned', 'changed', ...Categories.KEYS]);
  for (const key of Categories.KEYS) {
    const chip = chips.find(entry => entry.filter === key);
    assert.strictEqual(chip.category, key, `${key} carries its category for the icon and the colour`);
    assert.strictEqual(chip.label, Categories.LABELS[key][0], `${key} is named as the rest of the extension names it`);
  }
  assert.ok(F.CATEGORIES.every(key => chips.some(chip => chip.filter === key)), 'every category the filter knows has a chip');
});
