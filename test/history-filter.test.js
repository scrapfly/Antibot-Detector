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
  assert.deepStrictEqual(F.normalizeChips(undefined), { pinned: false, changed: false, combinations: false, httpError: false, categories: [] });
  assert.deepStrictEqual(F.normalizeChips({ pinned: 'yes', changed: 1, combinations: 'true', httpError: 'on', categories: ['captcha', 'captcha', 'other', 7] }), { pinned: false, changed: false, combinations: false, httpError: false, categories: ['captcha'] });
  assert.strictEqual(F.isActive({}), false);
  assert.strictEqual(F.isActive({ categories: ['other'] }), false);
  assert.strictEqual(F.isActive({ categories: ['captcha'] }), true);
  assert.strictEqual(F.isActive({ pinned: true }), true);
  assert.strictEqual(F.isActive({ combinations: true }), true);
  assert.strictEqual(F.isActive({ httpError: true }), true);
  assert.deepStrictEqual(F.FLAGS, ['pinned', 'changed', 'combinations', 'httpError'], 'the on/off chips, in the order of the row');
});

test('detections saved in either shape are read: a name and category on the detection or under detector', () => {
  const flat = item('f', 'https://flat.example/', [{ name: 'Flat', category: 'CAPTCHA' }]);
  assert.deepStrictEqual(ids(F.filter([flat], { query: 'flat' })), ['f']);
  assert.deepStrictEqual(ids(F.filter([flat], { chips: { categories: ['captcha'] } })), ['f']);
  const nested = item('n', 'https://nested.example/', [{ detector: { name: 'Nested', category: 'Anti-Bot' } }]);
  assert.deepStrictEqual(ids(F.filter([nested], { chips: { categories: ['antibot'] } })), ['n']);
});

test('the chip row of the History tab has one chip for Pinned, one for Changed, one for every category in the category order, Combinations, and Error status (shown only while on)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const Categories = require('../modules/core/categories.js');
  const html = fs.readFileSync(path.join(__dirname, '../sections/history/history.html'), 'utf8');
  const row = html.slice(html.indexOf('id="historyFilters"'), html.indexOf('<!-- Toolbar'));
  const chips = [...row.matchAll(/<button[^>]*class="history-filter-chip[^"]*"[^>]*data-filter="([A-Za-z]+)"([^>]*)>([\s\S]*?)<\/button>/g)]
    .map(match => ({ filter: match[1], category: (match[2].match(/data-category="([a-z]+)"/) || [])[1], label: (match[3].match(/data-i18n="([A-Za-z]+)"/) || [])[1] }));
  assert.deepStrictEqual(chips.map(chip => chip.filter), ['pinned', 'changed', ...Categories.KEYS, 'combinations', 'httpError']);
  for (const key of Categories.KEYS) {
    const chip = chips.find(entry => entry.filter === key);
    assert.strictEqual(chip.category, key, `${key} carries its category for the icon and the colour`);
    assert.strictEqual(chip.label, Categories.LABELS[key][0], `${key} is named as the rest of the extension names it`);
  }
  assert.ok(F.CATEGORIES.every(key => chips.some(chip => chip.filter === key)), 'every category the filter knows has a chip');
  assert.ok(F.FLAGS.every(flag => chips.some(chip => chip.filter === flag)), 'every on/off chip the filter knows has a button');
  const combinations = chips.find(chip => chip.filter === 'combinations');
  assert.strictEqual(combinations.category, undefined, 'not a category: it has no category colour');
  assert.strictEqual(combinations.label, 'historyFilterCombinations');
  assert.match(row, /data-filter="combinations"[\s\S]*?data-ui-icon="combination"/, 'with the icon the card uses for its combinations count');
});

// Pages for the Combinations chip: a combination is an object in a detection's `combinations` list
const combo = (id, confidence = 90) => ({ id, name: `Combo ${id}`, confidence });
const comboItems = [
  item('p', 'https://one.example/', [{ ...det('Cloudflare', 'Anti-Bot'), combinations: [combo('x')] }], { pinned: true }),
  item('q', 'https://two.example/', [det('DataDome', 'Anti-Bot'), { ...det('Canvas Fingerprint', 'Fingerprint', 40), combinations: [combo('y'), combo('z', 60)] }]),
  item('r', 'https://three.example/', [{ ...det('hCaptcha', 'CAPTCHA'), combinations: [] }]),
  item('s', 'https://four.example/', [
    { ...det('Akamai', 'Anti-Bot'), combinations: null },
    { ...det('Junk', 'Anti-Bot'), combinations: 'yes' },
    { ...det('More junk', 'Anti-Bot'), combinations: [null, 7, 'x', undefined] }
  ]),
  item('t', 'https://five.example/', [])
];

test('the Combinations chip keeps only the pages where a combination fired, and combines with the other chips and the search', () => {
  assert.deepStrictEqual(ids(F.filter(comboItems, { chips: { combinations: true } })), ['p', 'q']);
  assert.deepStrictEqual(ids(F.filter(comboItems, { chips: { combinations: false } })), ['p', 'q', 'r', 's', 't'], 'off keeps everything');
  assert.deepStrictEqual(ids(F.filter(comboItems, { chips: { combinations: true, pinned: true } })), ['p']);
  assert.deepStrictEqual(ids(F.filter(comboItems, { chips: { combinations: true, categories: ['fingerprint'] } })), ['q'], 'the category and the combination may sit on different detections of one page');
  assert.deepStrictEqual(ids(F.filter(comboItems, { chips: { combinations: true, categories: ['captcha'] } })), [], 'a page with a CAPTCHA but no combination is not kept');
  assert.deepStrictEqual(ids(F.filter(comboItems, { chips: { combinations: true, categories: ['antibot', 'fingerprint'] } })), ['p', 'q']);
  assert.deepStrictEqual(ids(F.filter(comboItems, { query: 'two.example', chips: { combinations: true } })), ['q']);
  assert.deepStrictEqual(ids(F.filter(comboItems, { query: 'three.example', chips: { combinations: true } })), [], 'the search still has to match');
  assert.deepStrictEqual(ids(F.filter(comboItems, { chips: { combinations: 'yes' } })), ['p', 'q', 'r', 's', 't'], 'only true turns it on');
});

test('a fired combination is an object in a detection\'s list: empty lists, null, text, numbers and a list of junk do not count', () => {
  const [one, two, empty, junk, none] = comboItems;
  assert.strictEqual(F.firedCombinations(two.detections).length, 2, 'counted across the detections of a page');
  assert.deepStrictEqual(F.firedCombinations(one.detections), [{ detection: one.detections[0], combo: one.detections[0].combinations[0] }]);
  for (const entry of [empty, junk, none, {}, null, undefined]) assert.strictEqual(F.hasCombinations(entry), false);
  for (const entry of [one, two]) assert.strictEqual(F.hasCombinations(entry), true);
  assert.deepStrictEqual(F.firedCombinations(undefined), []);
  assert.deepStrictEqual(F.firedCombinations([null, 'x', {}]), []);
});

test('a Changed record left in another shape (one name as text, junk) still counts and lists its names, never throws', () => {
  assert.strictEqual(F.isChanged({ changed: { added: 'DataDome', removed: [] } }), true);
  assert.deepStrictEqual(F.changeNames('DataDome'), ['DataDome']);
  assert.deepStrictEqual(F.changeNames(['A', 3, '', null, 'B']), ['A', 'B']);
  assert.strictEqual(F.isChanged({ changed: true }), false);
  assert.strictEqual(F.isChanged({ changed: { added: 5 } }), false);
  assert.strictEqual(F.isChanged({ changed: 'yes' }), false);
});

test('a search typed with letters finds the address the browser stores as ASCII (bücher.de is xn--bcher-kva.de)', () => {
  const stored = item('u', 'https://xn--bcher-kva.de/shop', [det('Cloudflare', 'Anti-Bot')]);
  assert.deepStrictEqual(ids(F.filter([stored, ...items], { query: 'bücher.de' })), ['u']);
  assert.deepStrictEqual(ids(F.filter([stored, ...items], { query: 'BÜCHER.de/shop' })), ['u'], 'case and path');
  assert.deepStrictEqual(ids(F.filter(items, { query: 'bücher.de' })), [], 'and nothing else matches it');
  assert.deepStrictEqual(ids(F.filter([item('t', 'https://a.example/', [], { title: 'Café menu' })], { query: 'café menu' })), ['t'], 'a phrase with spaces still matches as text');
});

// ---- The search ignores accents: "cafe" finds "Café", "Café" finds "cafe"

const accented = [
  item('t', 'https://a.example/', [], { title: 'Café menu' }),
  item('n', 'https://b.example/', [], { note: 'Señor Gómez, Göteborg' }),
  item('p', 'https://c.example/', [], { title: 'plain cafe and senor' }),
  item('d', 'https://d.example/', [det('Düsseldorf Shield', 'Anti-Bot')]),
  item('x', 'https://e.example/', [], { title: 'Nothing to see' })
];

test('the search ignores accents on either side: "cafe" finds "Café menu", "Café" finds "cafe", "senor" finds a note "Señor"', () => {
  assert.deepStrictEqual(ids(F.filter(accented, { query: 'cafe' })), ['t', 'p'], 'no accent finds the accent');
  assert.deepStrictEqual(ids(F.filter(accented, { query: 'café' })), ['t', 'p'], 'the accent finds no accent');
  assert.deepStrictEqual(ids(F.filter(accented, { query: 'CAFÉ' })), ['t', 'p'], 'case too');
  assert.deepStrictEqual(ids(F.filter(accented, { query: 'senor' })), ['n', 'p'], 'a note');
  assert.deepStrictEqual(ids(F.filter(accented, { query: 'señor gomez' })), ['n'], 'some letters with the accent and some without');
  assert.deepStrictEqual(ids(F.filter(accented, { query: 'goteborg' })), ['n']);
  assert.deepStrictEqual(ids(F.filter(accented, { query: 'dusseldorf' })), ['d'], 'the name of a protection');
  assert.deepStrictEqual(ids(F.filter(accented, { query: 'Düsseldorf Shield' })), ['d']);
  assert.deepStrictEqual(ids(F.filter(accented, { query: 'nothing' })), ['x'], 'a plain word still matches as before');
  assert.deepStrictEqual(ids(F.filter(accented, { query: 'cafe', chips: { pinned: true } })), [], 'and the chips still combine with it');
});

test('a letter typed or saved as a base letter plus its accent (decomposed) matches the composed one', () => {
  const decomposed = item('u', 'https://u.example/', [], { title: 'Café decomposed' });
  const composed = item('c', 'https://c.example/', [], { title: 'Café composed' });
  for (const query of ['cafe', 'café', 'café']) {
    assert.deepStrictEqual(ids(F.filter([decomposed, composed], { query })), ['u', 'c'], JSON.stringify(query));
  }
});

test('Turkish i does not break the search: no error, İ and i meet, and a dotless ı is read as i', () => {
  const pages = [
    item('a', 'https://a.example/', [], { title: 'İstanbul rehberi' }),
    item('b', 'https://b.example/', [], { title: 'Diyarbakır' }),
    item('c', 'https://c.example/', [], { title: 'ISPARTA' })
  ];
  for (const query of ['İSTANBUL', 'istanbul', 'İstanbul', 'Istanbul', 'ıstanbul', 'diyarbakır', 'DIYARBAKIR', 'diyarbakir', 'Isparta', 'ısparta']) {
    assert.doesNotThrow(() => F.filter(pages, { query }), query);
  }
  assert.deepStrictEqual(ids(F.filter(pages, { query: 'istanbul' })), ['a']);
  assert.deepStrictEqual(ids(F.filter(pages, { query: 'İstanbul' })), ['a']);
  assert.deepStrictEqual(ids(F.filter(pages, { query: 'İSTANBUL' })), ['a']);
  assert.deepStrictEqual(ids(F.filter(pages, { query: 'diyarbakir' })), ['b']);
  assert.deepStrictEqual(ids(F.filter(pages, { query: 'Diyarbakır' })), ['b']);
  assert.deepStrictEqual(ids(F.filter(pages, { query: 'isparta' })), ['c']);
  assert.deepStrictEqual(ids(F.filter(pages, { query: 'ısparta' })), ['c']);
});

test('a query of only combining marks (or marks and spaces) matches nothing: it is not an empty search that matches everything', () => {
  const marked = [...accented, item('m', 'https://m.example/', [], { title: 'Café' })];
  for (const query of ['́', '́̀', ' ́ ', '́ ́']) {
    assert.deepStrictEqual(ids(F.filter(marked, { query })), [], JSON.stringify(query));
    assert.strictEqual(F.matches(marked[0], { query }), false, JSON.stringify(query));
  }
  assert.deepStrictEqual(ids(F.filter(marked, { query: '   ' })), ['t', 'n', 'p', 'd', 'x', 'm'], 'an empty search still keeps everything');
});

test('letters that carry no accent, other scripts and symbols are searched as they are, and odd input never throws', () => {
  const pages = [
    item('j', 'https://j.example/', [], { title: '日本語のページ' }),
    item('r', 'https://r.example/', [], { title: 'Привіт, світе' }),
    item('e', 'https://e.example/', [], { title: 'Ålesund 🚀 straße' })
  ];
  assert.deepStrictEqual(ids(F.filter(pages, { query: '日本' })), ['j']);
  assert.deepStrictEqual(ids(F.filter(pages, { query: 'привіт' })), ['r']);
  assert.deepStrictEqual(ids(F.filter(pages, { query: 'alesund' })), ['e']);
  assert.deepStrictEqual(ids(F.filter(pages, { query: '🚀' })), ['e']);
  assert.deepStrictEqual(ids(F.filter(pages, { query: 'straße' })), ['e']);
  for (const junk of [null, undefined, 0, false, {}, [], '\ud800', 'a\u0000b']) assert.doesNotThrow(() => F.filter(pages, { query: junk }), String(junk));
  assert.doesNotThrow(() => F.matches({ url: null, title: 7, note: {}, detections: [null, { name: null }] }, { query: 'x' }));
});

test('an address typed with letters still finds the ASCII one, and an accent-free address matches its accented spelling', () => {
  const punycode = item('u', 'https://xn--bcher-kva.de/shop', [det('Cloudflare', 'Anti-Bot')]);
  const plain = item('v', 'https://bucher.de/', []);
  assert.deepStrictEqual(ids(F.filter([punycode, plain, ...items], { query: 'bücher.de' })), ['u', 'v'], 'the stored address, and the same letters without the umlaut');
  assert.deepStrictEqual(ids(F.filter([punycode, plain, ...items], { query: 'BÜCHER.DE/shop' })), ['u'], 'case and path: only the stored address has a /shop');
  assert.deepStrictEqual(ids(F.filter([punycode, plain], { query: 'bucher.de' })), ['v'], 'typed without the umlaut it cannot reach the punycode spelling');
  assert.deepStrictEqual(ids(F.filter([punycode, plain], { query: 'xn--bcher' })), ['u'], 'and the punycode itself is still searchable');
});

// ---- Accents are folded on Latin and Greek letters only: the marks of other scripts are part of the letter

// An address with no letters in it, so that only the title decides
const titled = (title) => item('t', '', [], { title });
const finds = (text, query) => F.matches(titled(text), { query });

// [text, query]: what the person types must NOT find this text, because the mark makes another letter or word
const KEPT_APART = [
  // Japanese: a voiced mark (dakuten) or a half-voiced one (handakuten) makes another kana
  ['かぎ', 'かき'], ['がき', 'かき'], ['ほん', 'ぼん'], ['ぼん', 'ほん'], ['ぽん', 'ほん'], ['てん', 'でん'], ['カタ', 'ガタ'], ['サ', 'ザ'],
  // Hindi: a vowel sign (matra) makes another syllable, or another word
  ['कंपनी का होम पेज', 'की'], ['की बोर्ड', 'का'], ['कोड', 'की'], ['सीमा', 'सम'], ['समय', 'सीमा'],
  // Thai: vowel and tone marks
  ['ท่า', 'ที่'], ['ทุก', 'ที่'], ['ปู', 'ปี'], ['ปี', 'ปู'],
  // Korean: NFD splits a syllable into its letters, so 가 would be found inside 각 and 하 inside 한
  ['한국어', '하'], ['각나다', '가'], ['간식', '가'], ['학교', '하'], ['함께', '하'],
  // Russian and Ukrainian: й is not и, ё is not е, ї is not і
  ['мой дом', 'мои'], ['мои дела', 'мой'], ['Ёлка', 'елка'], ['всё', 'все'], ['ї', 'і']
];

// [text, query]: found, as written, and the accents of Latin and Greek letters
const FOUND = [
  ['かき', 'かき'], ['がき', 'がき'], ['ガタ', 'ガタ'], ['ほん', 'ほ'], ['ぼん', 'ぼ'],
  ['सीमा', 'सीमा'], ['कंपनी का होम पेज', 'का'], ['कंपनी', 'कं'],
  ['ที่นี่', 'ที่'], ['ที่นี่', 'ท'], ['ปี', 'ปี'],
  ['한국어', '한'], ['한국어', '한국'], ['가나다', '가'], ['각오', '각'],
  ['мой дом', 'мой'], ['Ёлка', 'ёлка'], ['всё', 'всё'], ['ї', 'ї'],
  ['Café menu', 'cafe'], ['cafe', 'CAFÉ'], ['Señor', 'senor'], ['Göteborg', 'goteborg'], ['Düsseldorf', 'dusseldorf'], ['Ålesund', 'alesund'],
  ['Việt Nam', 'viet nam'], ['viet nam', 'VIỆT'], ['Diyarbakır', 'diyarbakir'], ['İstanbul', 'istanbul'], ['ISPARTA', 'ısparta'],
  ['οδός', 'οδος'], ['Ελλάδα', 'ελλαδα'], ['ἄνθρωπος', 'ανθρωπος'], ['ΐ', 'ι']
];

test('a mark that is part of a kana, a Hindi, Thai or Korean letter, or of й, ё and ї, makes another letter: it is not folded away', () => {
  for (const [text, query] of KEPT_APART) assert.strictEqual(finds(text, query), false, `${query} must not find ${text}`);
});

test('what is typed as written finds its text in those scripts, and Latin and Greek accents still fold, on both sides', () => {
  for (const [text, query] of FOUND) assert.strictEqual(finds(text, query), true, `${query} must find ${text}`);
});

test('one fold for the query and for the text: a spelling made of base letters and marks finds the composed one, and the other way round', () => {
  const spellings = ['Café', 'Việt', 'İstanbul', 'ΐ', 'かが', 'क़ी', 'ที่', '한국', 'мой', 'ё', 'ї', 'ǅ', 'Å'];
  for (const text of spellings) {
    for (const [a, b] of [[text, text], [text.normalize('NFD'), text], [text, text.normalize('NFD')], [text.normalize('NFC'), text.normalize('NFD')]]) {
      assert.strictEqual(finds(a, b), true, `${JSON.stringify(b)} finds ${JSON.stringify(a)}`);
    }
  }
  assert.strictEqual(finds('한', '한'), true, 'Hangul letters written one by one are the syllable');
  assert.strictEqual(finds('한', '한'), true);
  assert.strictEqual(finds('がき', 'がき'), true, 'a kana and its voiced mark written apart are the voiced kana');
  assert.strictEqual(finds('й', 'й'), true);
  assert.strictEqual(finds('й', 'и'), false, 'and й is still not и');
});

test('odd text never throws or stalls: lone surrogates, a huge string of only combining marks, marks in every place', () => {
  const marks = '́'.repeat(200000);
  const started = Date.now();
  const titles = ['a\ud800b', '\udc00', '\ud800́é', marks, `${marks}a`, `a${marks}`, `e${'̣́̈'.repeat(3000)}`, 'é'.repeat(100000)];
  for (const title of titles) {
    for (const query of ['a', '\ud800', '\udc00x', '́', marks, 'é', 'e', ' ', '́á']) {
      assert.doesNotThrow(() => F.matches(titled(title), { query }), `${title.length} characters, query ${JSON.stringify(query.slice(0, 8))}`);
    }
  }
  // A stall, not a speed: it takes about 0.2 s on a quiet machine, and a busy one takes many times that
  assert.ok(Date.now() - started < 60000, `${Date.now() - started} ms`);
  assert.strictEqual(finds('a\ud800b', '\ud800'), true, 'a lone surrogate is a character like another');
});

test('a query with no letter in it (only combining marks, with or without spaces) matches nothing, whatever the text holds', () => {
  const marks = '́'.repeat(200000);
  // A stress mark on a Cyrillic vowel stays in the text: it must not be found by a query that is only the mark
  const pages = [titled('сло́во'), titled('ло́'), titled(marks), titled('Café'), item('u', 'https://a.example/', [], { title: '́' })];
  for (const query of ['́', '́̀', ' ́ ', '́ ́', marks]) {
    assert.deepStrictEqual(ids(F.filter(pages, { query })), [], JSON.stringify(query.slice(0, 6)));
  }
  assert.deepStrictEqual(ids(F.filter(pages, { query: '   ' })).length, pages.length, 'an empty search still keeps everything');
  assert.strictEqual(finds('сло́во', 'ло́'), true, 'a mark with its letter is searched as written');
});

test('Error status keeps the pages that answered 4xx or 5xx; one with no known status (saved before 3.1.9) is not one of them', () => {
  const pages = [
    item('ok', 'https://ok.example/', [det('Cloudflare', 'Anti-Bot')], { httpStatus: 200 }),
    item('forbidden', 'https://forbidden.example/', [det('Cloudflare', 'Anti-Bot')], { httpStatus: 403 }),
    item('down', 'https://down.example/', [], { httpStatus: 503, pinned: true }),
    item('old', 'https://old.example/', [det('Cloudflare', 'Anti-Bot')]),
    item('junk', 'https://junk.example/', [], { httpStatus: '500' })
  ];
  assert.deepStrictEqual(ids(F.filter(pages, { chips: { httpError: true } })), ['forbidden', 'down']);
  assert.deepStrictEqual(ids(F.filter(pages, { chips: { httpError: true, pinned: true } })), ['down'], 'combined with the other chips by AND');
  assert.deepStrictEqual(ids(F.filter(pages, { chips: { httpError: true, categories: ['antibot'] } })), ['forbidden']);
  assert.strictEqual(F.isHttpError(null), false);
});

test('the Error status chip is hidden until it is on, and the toolbar menu turns it on and off', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../sections/history/history.html'), 'utf8');
  assert.match(html, /<button type="button" class="history-filter-chip history-filter-chip--http" data-filter="httpError" aria-pressed="false" hidden>[\s\S]*?data-i18n="historyFilterHttpError">Error status</);
  const menu = html.slice(html.indexOf('id="historyMenu"'), html.indexOf('id="historyItemMenu"'));
  assert.match(menu, /<button id="historyHttpErrorsBtn" class="history-menu-item history-menu-check" role="menuitemcheckbox" aria-checked="false">[\s\S]*?data-i18n="historyFilterHttpErrorMenu">Only pages with an error status \(4xx, 5xx\)</);
});
