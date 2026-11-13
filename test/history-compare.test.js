'use strict';
// History → … → Compare with…: the same page's other scans, and what changed between two of them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const C = require('../modules/core/history-compare.js');

const det = (name, category, confidence, types = []) => ({ detector: { name }, category, confidence, matches: types.map(type => ({ type })) });
const entry = (id, url, at, detections) => ({ id, url, hostname: new URL(url).hostname, timestamp: at, detections });
const T0 = Date.UTC(2026, 9, 19, 9);
const HOUR = 3600000;

test('the page of an entry is its address without the query and the fragment, like the recorder\'s change mark', () => {
  const sandbox = vm.createContext({ console, URL, Logger: new Proxy({}, { get: () => () => {} }), UrlUtils: { getHostnameFromUrl: u => { try { return new URL(u).hostname; } catch (_) { return ''; } } } });
  sandbox.globalThis = sandbox;
  vm.runInContext(fs.readFileSync(path.join(root, 'background/history-recorder.js'), 'utf8') + '\n;globalThis.HistoryRecorder = HistoryRecorder;', sandbox);
  for (const [url, hostname] of [
    ['https://Shop.Example/cart?id=3#top', 'shop.example'], ['http://a.example:8080/x/y/', 'a.example'], ['https://a.example', 'a.example'],
    ['not a url', 'fallback.example'], ['', 'only.example'], ['', ''], ['chrome-extension://abc/popup.html', 'abc']
  ]) {
    const expected = sandbox.HistoryRecorder.normalizeDuplicateKey(url, hostname, 'path');
    assert.strictEqual(C.pageKey({ url, hostname }) || null, expected, `${url} | ${hostname}`);
  }
});

test('others(): the same page\'s other entries, newest first; never the entry itself or another page', () => {
  const a = entry('a', 'https://s.example/cart?x=1', T0, []);
  const items = [a, entry('b', 'https://s.example/cart?x=2', T0 + HOUR, []), entry('c', 'https://s.example/cart', T0 - HOUR, []),
    entry('d', 'https://s.example/other', T0 + 2 * HOUR, []), entry('e', 'https://t.example/cart', T0 + 3 * HOUR, []), null];
  assert.deepEqual(C.others(items, a).map(i => i.id), ['b', 'c']);
  assert.deepEqual(C.others(items, { id: 'x', url: '', hostname: '' }), []);
  assert.deepEqual(C.others(null, a), []);
});

test('compare(): added, removed, changed and unchanged, with the earlier scan first whatever the order given', () => {
  const earlier = entry('old', 'https://s.example/', T0, [
    det('Akamai', 'Anti-Bot', 85, ['cookie']), det('Cloudflare', 'Anti-Bot', 70, ['cookie']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Canvas Fingerprint', 'Fingerprint', 30, ['js_hooks'])]);
  const later = entry('new', 'https://s.example/', T0 + HOUR, [
    det('Cloudflare', 'Anti-Bot', 95, ['cookie', 'header']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('DataDome', 'Anti-Bot', 80, ['cookie']), det('Canvas Fingerprint', 'Fingerprint', 30, ['js_hooks'])]);
  for (const [x, y] of [[earlier, later], [later, earlier]]) {
    const r = C.compare(x, y);
    assert.equal(r.earlier.id, 'old'); assert.equal(r.later.id, 'new');
    assert.deepEqual(r.added.map(d => d.name), ['DataDome']);
    assert.deepEqual(r.removed.map(d => d.name), ['Akamai']);
    assert.deepEqual(r.changed, [{ name: 'Cloudflare', category: 'antibot', from: 70, to: 95, delta: 25, methodsAdded: ['header'], methodsRemoved: [] }]);
    assert.deepEqual(r.same.map(d => d.name), ['Turnstile', 'Canvas Fingerprint'], 'anti-bot and CAPTCHA before fingerprinting');
    assert.equal(r.identical, false);
  }
});

test('compare(): names match without case, a missing score is not a change, evidence alone is', () => {
  const a = entry('a', 'https://s.example/', T0, [det('DataDome', 'Anti-Bot', null, ['cookie']), det('Kasada', 'Anti-Bot', 80, ['url'])]);
  const b = entry('b', 'https://s.example/', T0 + HOUR, [det('DATADOME', 'Anti-Bot', 90, ['cookie']), det('kasada', 'Anti-Bot', 80, ['headers', 'urls'])]);
  const r = C.compare(a, b);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.removed, []);
  const dd = r.changed.find(row => row.name === 'DATADOME');
  assert.equal(dd, undefined, 'no score on one side and the same evidence: not a change');
  assert.ok(r.same.some(row => row.name === 'DATADOME'));
  const k = r.changed.find(row => row.name === 'kasada');
  assert.deepEqual(k.methodsAdded, ['header'], 'plural legacy type names are read as header and url');
  assert.deepEqual(k.methodsRemoved, []);
  assert.equal(k.delta, 0);
});

test('compare(): two identical scans say so, and odd entries do not throw', () => {
  const a = entry('a', 'https://s.example/', T0, [det('Kasada', 'Anti-Bot', 80, ['url'])]);
  const b = entry('b', 'https://s.example/', T0 + HOUR, [det('Kasada', 'Anti-Bot', 80, ['url'])]);
  assert.equal(C.compare(a, b).identical, true);
  assert.doesNotThrow(() => C.compare({ id: 'x' }, { id: 'y', detections: [null, 'Cloudflare', {}] }));
  assert.equal(C.compare({}, {}).identical, true);
});

test('changeText(): the confidence move and the evidence, translated through the callbacks it is given', () => {
  const row = { name: 'Cloudflare', from: 70, to: 95, delta: 25, methodsAdded: ['header'], methodsRemoved: ['dom'] };
  assert.equal(C.changeText(row), '70% → 95% (+25) · New evidence: header · Evidence gone: dom');
  assert.equal(C.changeText({ ...row, from: 90, to: 60, delta: -30, methodsAdded: [], methodsRemoved: [] }), '90% → 60% (−30)');
  const t = (key, fallback, ...args) => `[${key}:${args.join(',')}]`;
  assert.equal(C.changeText(row, { t, methodLabel: m => m.toUpperCase() }), '[historyCompareChangeFmt:70,95,+25] · [historyCompareEvidenceAddedFmt:HEADER] · [historyCompareEvidenceRemovedFmt:DOM]');
});

test('toMarkdown(): a heading, the range and one section per kind of difference, escaped', () => {
  const a = entry('a', 'https://s.example/cart', T0, [det('Akamai', 'Anti-Bot', 85, ['cookie']), det('Pipe|Name', 'CAPTCHA', 90)]);
  const b = entry('b', 'https://s.example/cart', T0 + HOUR, [det('![x](https://t.example/p.gif)', 'Anti-Bot', 80, ['cookie']), det('Pipe|Name', 'CAPTCHA', 70)]);
  const md = C.toMarkdown(C.compare(a, b), { host: 's.example', address: 'https://s.example/cart' });
  assert.ok(md.startsWith('## Compare scans: s.example\n\nhttps://s.example/cart\n\nFrom 2026-10-19 09:00 to 2026-10-19 10:00\n'), md.slice(0, 120));
  assert.ok(md.includes('### Added\n- !\\[x\\](https://t.example/p.gif) (antibot, 80%)'), md);
  assert.ok(md.includes('### Removed\n- Akamai (antibot, 85%)'));
  assert.ok(md.includes('### Changed\n- Pipe\\|Name (captcha): 90% → 70% (−20)'));
  assert.ok(!md.includes('### Unchanged'));
  const same = C.toMarkdown(C.compare(a, a), { host: 's.example' });
  assert.ok(same.includes('These two scans found the same protections'), same);
  assert.ok(same.includes('### Unchanged'));
});

test('pickDefault(): the scan just before this entry, else the first one after it', () => {
  const mine = entry('m', 'https://s.example/', T0 + 5 * HOUR, []);
  const list = C.others([mine, entry('a', 'https://s.example/', T0, []), entry('b', 'https://s.example/', T0 + 3 * HOUR, []), entry('c', 'https://s.example/', T0 + 9 * HOUR, [])], mine);
  assert.equal(C.pickDefault(list, mine).id, 'b', 'the previous scan');
  const first = entry('f', 'https://s.example/', T0 - HOUR, []);
  const after = C.others([first, entry('x', 'https://s.example/', T0 + HOUR, []), entry('y', 'https://s.example/', T0 + 4 * HOUR, [])], first);
  assert.equal(C.pickDefault(after, first).id, 'x', 'no earlier scan: the next one');
  assert.equal(C.pickDefault([], first), null);
  assert.equal(C.pickDefault(null, first), null);
});

// ---- The dialog's pieces: dates, the address line, the rows ------------------------------------------------------------

const t = (key, fallback, ...args) => fallback.replace(/\{(\d)\}/g, (_, i) => args[i]);
const compared = (earlier, later) => C.compare(entry('a', 'https://s.example/', T0, earlier), entry('b', 'https://s.example/', T0 + HOUR, later));
const unicodeMinus = '−';

test('shortDateTime(): the date and time of a scan without the seconds, in the language it is given', () => {
  const at = Date.UTC(2026, 9, 15, 16, 28, 59);
  const flat = (text) => text.replace(/\s/g, ' ');
  assert.equal(flat(C.shortDateTime(at, 'en', 'UTC')), 'Oct 15, 2026, 4:28 PM');
  assert.equal(flat(C.shortDateTime(new Date(at), 'en', 'UTC')), 'Oct 15, 2026, 4:28 PM', 'a Date works as well as a number');
  for (const locale of ['de', 'ar', 'ja', 'th', 'hi', 'ru', 'zh-CN', 'pt-BR', 'tr', undefined, null, 'not a locale']) {
    const short = C.shortDateTime(at, locale, 'UTC');
    const known = locale && locale !== 'not a locale' ? locale : undefined;
    const withSeconds = new Intl.DateTimeFormat(known, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(at);
    assert.ok(short && short.length < withSeconds.length, `${locale}: "${short}" is shorter than "${withSeconds}"`);
  }
  assert.equal(typeof C.shortDateTime(NaN, 'en'), 'string');
  assert.equal(typeof C.shortDateTime(undefined), 'string');
});

test('timeOf(): when a saved scan was made, whatever form its time was saved in; 0 when it has none', () => {
  assert.equal(C.timeOf({ timestamp: T0 }), T0);
  assert.equal(C.timeOf({ timestamp: new Date(T0).toISOString() }), T0);
  assert.equal(C.timeOf({}), 0);
  assert.equal(C.timeOf(null), 0);
});

test('whereText(): the other scan\'s page path, only when its address is not the entry\'s own', () => {
  const own = { url: 'https://s.example/u/1/search?x=1' };
  assert.equal(C.pagePath('https://s.example/cart?ref=mail#top'), '/cart?ref=mail#top');
  assert.equal(C.pagePath('https://s.example'), '/');
  assert.equal(C.pagePath('not a url'), '');
  assert.equal(C.pagePath(undefined), '');
  assert.equal(C.whereText(own, { url: 'https://s.example/u/1/search?x=1' }), '', 'the same address: nothing to say');
  assert.equal(C.whereText(own, { url: 'https://S.EXAMPLE/u/1/search?x=1' }), '', 'a host name in capitals is the same address');
  assert.equal(C.whereText(own, { url: 'https://s.example/u/1/search?x=2#results' }), '/u/1/search?x=2#results', 'the query and the fragment are what tells two scans of one page apart');
  assert.equal(C.whereText(own, { url: 'not a url' }), '');
  assert.equal(C.whereText(own, null), '');
});

test('rangeDates(): the two dates of the range line, with their seconds only when the short ones would read the same', () => {
  const short = (ms) => `short ${Math.floor(ms / 60000)}`;
  const long = (ms) => `long ${ms / 1000}`;
  assert.deepEqual(C.rangeDates({ earlier: { timestamp: 1000 }, later: { timestamp: 61000 } }, { short, long }), ['short 0', 'short 1']);
  assert.deepEqual(C.rangeDates({ earlier: { timestamp: 1000 }, later: { timestamp: 5000 } }, { short, long }), ['long 1', 'long 5'], 'two scans in one minute: the seconds tell them apart');
});

test('optionDates(): the "Compare with" list keeps the seconds only for scans whose line would read the same as another\'s', () => {
  const short = (ms) => `short ${Math.floor(ms / 60000)}`;
  const long = (ms) => `long ${ms / 1000}`;
  const scans = [{ time: 1000, count: 2 }, { time: 5000, count: 2 }, { time: 9000, count: 3 }, { time: 61000, count: 2 }];
  assert.deepEqual(C.optionDates(scans, { short, long }), ['long 1', 'long 5', 'short 0', 'short 1'],
    'two scans in one minute with the same count get their seconds; the same minute with another count, or another minute, does not');
  assert.deepEqual(C.optionDates([], { short, long }), []);
});

test('view(): the four counts, and a group for each kind that has rows, in the order added, removed, changed, unchanged', () => {
  const r = compared(
    [det('Akamai', 'Anti-Bot', 85, ['cookie']), det('Cloudflare', 'Anti-Bot', 70, ['cookie']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Canvas Fingerprint', 'Fingerprint', 30)],
    [det('Cloudflare', 'Anti-Bot', 95, ['cookie', 'header']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('DataDome', 'Anti-Bot', 80, ['cookie']), det('Canvas Fingerprint', 'Fingerprint', 30)]);
  const v = C.view(r, { t });
  assert.equal(v.identical, false);
  assert.deepEqual(v.chips, [
    { kind: 'added', label: 'Added', count: 1 }, { kind: 'removed', label: 'Removed', count: 1 },
    { kind: 'changed', label: 'Changed', count: 1 }, { kind: 'same', label: 'Unchanged', count: 2 }]);
  assert.deepEqual(v.groups.map((g) => [g.kind, g.title, g.count, g.open, g.collapsible]),
    [['added', 'Added (1)', 1, true, false], ['removed', 'Removed (1)', 1, true, false], ['changed', 'Changed (1)', 1, true, false], ['same', 'Unchanged (2)', 2, true, true]]);
  assert.deepEqual(v.groups[0].rows, [{ name: 'DataDome', category: 'antibot', confidence: 80, from: null, to: null, delta: null, deltaText: '', tone: '', notes: '' }]);
  assert.deepEqual(v.groups[1].rows.map((row) => [row.name, row.confidence]), [['Akamai', 85]]);
  assert.deepEqual(v.groups[3].rows.map((row) => [row.name, row.category, row.confidence]), [['Turnstile', 'captcha', 90], ['Canvas Fingerprint', 'fingerprint', 30]]);

  const nothingNew = C.view(compared([det('Kasada', 'Anti-Bot', 80)], [det('Kasada', 'Anti-Bot', 80)]), { t });
  assert.deepEqual(nothingNew.chips.map((chip) => chip.count), [0, 0, 0, 1], 'an empty kind keeps its chip, dimmed by the dialog');
  assert.deepEqual(nothingNew.groups.map((g) => g.kind), ['same'], 'and has no group');
  assert.equal(nothingNew.identical, true);
});

test('view(): a score with no value is no number; the names and labels come through the translator it is given', () => {
  const r = compared([det('Kasada', 'Anti-Bot', null), det('Akamai', 'Anti-Bot', null)], [det('Kasada', 'Anti-Bot', null), det('Imperva', 'Anti-Bot', null)]);
  const v = C.view(r, { t: (key) => `[${key}]` });
  assert.deepEqual(v.chips.map((chip) => chip.label), ['[historyCompareAdded]', '[historyCompareRemoved]', '[historyCompareChanged]', '[historyCompareUnchanged]']);
  assert.deepEqual(v.groups.map((g) => g.title), ['[historyCompareAdded] (1)', '[historyCompareRemoved] (1)', '[historyCompareUnchanged] (1)']);
  assert.deepEqual(v.groups.map((g) => g.rows[0].confidence), [null, null, null]);
});

test('view(): a changed protection carries both scores, the signed difference with its direction, and the evidence on a line of its own', () => {
  const r = compared(
    [det('Up', 'Anti-Bot', 70, ['cookie']), det('Down', 'CAPTCHA', 90, ['url']), det('Evidence', 'Anti-Bot', 60, ['cookie']), det('NoScore', 'Anti-Bot', null, ['cookie'])],
    [det('Up', 'Anti-Bot', 95, ['cookie', 'header']), det('Down', 'CAPTCHA', 60, ['url']), det('Evidence', 'Anti-Bot', 60, ['header']), det('NoScore', 'Anti-Bot', 80, ['cookie', 'url'])]);
  const rows = C.view(r, { t, methodLabel: (type) => type[0].toUpperCase() + type.slice(1) }).groups.find((g) => g.kind === 'changed').rows;
  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
  assert.deepEqual(byName.Up, { name: 'Up', category: 'antibot', confidence: 95, from: 70, to: 95, delta: 25, deltaText: '+25', tone: 'up', notes: 'New evidence: Header' });
  assert.deepEqual(byName.Down, { name: 'Down', category: 'captcha', confidence: 60, from: 90, to: 60, delta: -30, deltaText: `${unicodeMinus}30`, tone: 'down', notes: '' });
  assert.deepEqual(byName.Evidence, { name: 'Evidence', category: 'antibot', confidence: 60, from: null, to: null, delta: null, deltaText: '', tone: '', notes: 'New evidence: Header · Evidence gone: Cookie' },
    'the score did not move: it shows as it is, with no difference');
  assert.deepEqual(byName.NoScore, { name: 'NoScore', category: 'antibot', confidence: 80, from: null, to: null, delta: null, deltaText: '', tone: '', notes: 'New evidence: Url' },
    'no score on one side: no move to show, the later score as it is');
  assert.deepEqual(rows.map((row) => row.name), ['Evidence', 'NoScore', 'Up', 'Down'], 'anti-bot before CAPTCHA, then by name');
});

test('view(): Unchanged folds when it holds more than three protections, and stays open when short or when the scans are identical', () => {
  const many = (n) => Array.from({ length: n }, (_, i) => det(`Protection ${i}`, 'Fingerprint', 20));
  const group = (n, later) => C.view(compared([...many(n), det('Cloudflare', 'Anti-Bot', 70)], [...many(n), det('Cloudflare', 'Anti-Bot', later)]), { t }).groups.find((g) => g.kind === 'same');
  assert.equal(C.COLLAPSE_AFTER, 3);
  assert.equal(group(3, 95).open, true, 'three rows are short enough');
  assert.equal(group(4, 95).open, false, 'a fourth folds it');
  assert.equal(group(9, 95).open, false);
  const identical = C.view(compared(many(9), many(9)), { t });
  assert.equal(identical.identical, true);
  assert.equal(identical.groups[0].open, true, 'identical scans: it is all there is');
  assert.ok(C.view(compared(many(9), many(9)), { t }).groups.every((g) => g.kind === 'same'));
  for (const kind of ['added', 'removed', 'changed']) {
    const rows = Array.from({ length: 12 }, (_, i) => det(`Row ${i}`, 'Anti-Bot', 50 + i, ['cookie']));
    const long = C.view(kind === 'added' ? compared([], rows) : kind === 'removed' ? compared(rows, []) : compared(rows, rows.map((d) => ({ ...d, confidence: d.confidence + 5 }))), { t });
    assert.equal(long.groups.find((g) => g.kind === kind).open, true, `${kind} is never folded`);
    assert.equal(long.groups.find((g) => g.kind === kind).collapsible, false);
  }
});

test('changeText() and toMarkdown() read the same after the dialog\'s rows were split out of them', () => {
  const row = { name: 'Cloudflare', from: 70, to: 95, delta: 25, methodsAdded: ['header'], methodsRemoved: ['dom'] };
  assert.equal(C.changeText(row), '70% → 95% (+25) · New evidence: header · Evidence gone: dom');
  assert.equal(C.changeText({ ...row, from: 90, to: 60, delta: -30, methodsAdded: [], methodsRemoved: [] }), `90% → 60% (${unicodeMinus}30)`);
  assert.equal(C.changeText({ ...row, delta: 0 }), 'New evidence: header · Evidence gone: dom');
  assert.equal(C.changeText({ ...row, delta: null, methodsAdded: [], methodsRemoved: [] }), '');
});

// ---- The one-line summary ("Copy summary"): what changed, in a line for a chat or a ticket ---------------------------------

test('toOneLine(): the host, then what was added, removed and changed, then how many stayed the same, on one line', () => {
  const before = [det('Kasada', 'Anti-Bot', 60, ['url']), det('Cloudflare', 'Anti-Bot', 70, ['cookie']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Canvas Fingerprint', 'Fingerprint', 30), det('Audio Fingerprint', 'Fingerprint', 20)];
  const after = [det('reCAPTCHA', 'CAPTCHA', 85, ['url']), det('Cloudflare', 'Anti-Bot', 95, ['cookie']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Canvas Fingerprint', 'Fingerprint', 30), det('Audio Fingerprint', 'Fingerprint', 20)];
  assert.equal(C.toOneLine(compared(before, after), { host: 'shop.example' }), `shop.example: +reCAPTCHA 85%, ${unicodeMinus}Kasada, Cloudflare 70% → 95% (+25), Unchanged (3)`);
});

test('toOneLine(): several of each kind keep the dialog\'s order; a score that went down has the real minus sign; no score is no number', () => {
  const before = [det('Akamai', 'Anti-Bot', 85, ['cookie']), det('hCaptcha', 'CAPTCHA', 60, ['url']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Cloudflare', 'Anti-Bot', 70, ['cookie'])];
  const after = [det('Turnstile', 'CAPTCHA', 60, ['url']), det('Kasada', 'Anti-Bot', 70, ['url']), det('DataDome', 'Anti-Bot', 80, ['cookie']), det('Unscored', 'Fingerprint', null), det('Cloudflare', 'Anti-Bot', 95, ['cookie'])];
  assert.equal(C.toOneLine(compared(before, after), { host: 's.example' }),
    `s.example: +DataDome 80%, +Kasada 70%, +Unscored, ${unicodeMinus}Akamai, ${unicodeMinus}hCaptcha, Cloudflare 70% → 95% (+25), Turnstile 90% → 60% (${unicodeMinus}30)`,
    'anti-bot before CAPTCHA before fingerprinting, then by name, in each kind; nothing unchanged, so no count');
});

test('toOneLine(): a protection whose score is the same but whose evidence changed says so, and is never left out', () => {
  const r = compared([det('Kasada', 'Anti-Bot', 80, ['cookie']), det('Akamai', 'Anti-Bot', 70, ['cookie'])], [det('Kasada', 'Anti-Bot', 80, ['header']), det('Akamai', 'Anti-Bot', 90, ['cookie', 'header'])]);
  assert.equal(C.toOneLine(r, { host: 's.example', methodLabel: (type) => type.toUpperCase() }),
    's.example: Akamai 70% → 90% (+20), Kasada (New evidence: HEADER · Evidence gone: COOKIE)',
    'a score that moved is the headline; the evidence only when it is all there is');
});

test('toOneLine(): two scans that found the same say how many, or the dialog\'s own sentence when they found nothing', () => {
  const same = compared([det('Kasada', 'Anti-Bot', 80, ['url']), det('Canvas Fingerprint', 'Fingerprint', 30)], [det('Kasada', 'Anti-Bot', 80, ['url']), det('Canvas Fingerprint', 'Fingerprint', 30)]);
  assert.equal(C.toOneLine(same, { host: 'news.example' }), 'news.example: Unchanged (2)');
  assert.equal(C.toOneLine(compared([], []), { host: 'news.example' }), 'news.example: These two scans found the same protections, with the same confidence and evidence.');
});

test('toOneLine(): the host only, never a path, a query or a fragment, whatever it is given or the scans hold', () => {
  const r = C.compare(entry('a', 'https://shop.example/cart?token=SECRET123#top', T0, [det('Kasada', 'Anti-Bot', 80)]), entry('b', 'https://shop.example/cart?token=SECRET456#end', T0 + HOUR, []));
  assert.equal(C.toOneLine(r, { host: 'shop.example' }), `shop.example: ${unicodeMinus}Kasada`);
  assert.equal(C.toOneLine(r), `shop.example: ${unicodeMinus}Kasada`, 'no host given: the scans\' own, without the rest of the address');
  assert.equal(C.toOneLine(r, { host: 'https://user:pw@shop.example:8080/cart?token=SECRET123#top' }), `shop.example: ${unicodeMinus}Kasada`, 'an address given as the host is cut to its host');
  assert.equal(C.toOneLine(r, { address: 'https://other.example/x?token=SECRET789' }), `other.example: ${unicodeMinus}Kasada`, 'or an address in its place');
  assert.equal(C.toOneLine(r, { host: 'not a url?token=SECRET123#top' }), `not a url: ${unicodeMinus}Kasada`);
  assert.equal(C.toOneLine(C.compare({}, {})), '?: These two scans found the same protections, with the same confidence and evidence.', 'no host anywhere');
  for (const options of [{ host: 'shop.example' }, {}, { host: 'https://user:pw@shop.example:8080/cart?token=SECRET123#top' }]) {
    assert.ok(!/SECRET|token|cart|#|pw|8080/.test(C.toOneLine(r, options)), JSON.stringify(options));
  }
});

test('toOneLine(): a line break in a name, a host or a translation cannot make a second line', () => {
  const r = compared(
    [det('Old\nname', 'Anti-Bot', 80), det('Keep', 'Fingerprint', 20), det('Move', 'Anti-Bot', 50)],
    [det('Two\r\nlines\u2028here', 'Anti-Bot', 70), det('Pipe | name', 'CAPTCHA', 60), det('Keep', 'Fingerprint', 20), det('Move', 'Anti-Bot', 60)]);
  // A translator whose every text ends with a line break reaches the changed and the unchanged words
  const line = C.toOneLine(r, { host: 'my host\nname', t: (key, fallback, ...args) => `${t(key, fallback, ...args)}\n` });
  assert.ok(!/[\r\n\u0085\u2028\u2029]/.test(line), JSON.stringify(line));
  assert.equal(line, `my host name: +Two lines here 70%, +Pipe | name 60%, ${unicodeMinus}Old name, Move 50% → 60% (+10), Unchanged (1)`);
});

test('toOneLine(): every word and the move go through the translator it is given, and all of them are the dialog\'s own', () => {
  const words = { historyCompareUnchanged: 'Unverändert', historyCompareChangeFmt: '{0} % → {1} % ({2})', historyCompareIdentical: 'Gleich.' };
  const german = (key, fallback, ...args) => (words[key] || fallback).replace(/\{(\d)\}/g, (_, i) => args[i]);
  const r = compared([det('Cloudflare', 'Anti-Bot', 70, ['cookie']), det('Canvas Fingerprint', 'Fingerprint', 30)], [det('Cloudflare', 'Anti-Bot', 95, ['cookie']), det('Canvas Fingerprint', 'Fingerprint', 30)]);
  assert.equal(C.toOneLine(r, { host: 's.example', t: german }), 's.example: Cloudflare 70 % → 95 % (+25), Unverändert (1)');
  assert.equal(C.toOneLine(compared([], []), { host: 's.example', t: german }), 's.example: Gleich.');
  // Whatever the line asks to translate is a text the Compare dialog had before: no new words for the languages to write
  const asked = new Set();
  const spy = (key, fallback, ...args) => { asked.add(key); return t(key, fallback, ...args); };
  const evidence = compared([det('Kasada', 'Anti-Bot', 80, ['cookie']), det('Akamai', 'Anti-Bot', 70, ['cookie']), det('Canvas Fingerprint', 'Fingerprint', 30)],
    [det('Kasada', 'Anti-Bot', 80, ['header']), det('Akamai', 'Anti-Bot', 90, ['cookie']), det('Canvas Fingerprint', 'Fingerprint', 30)]);
  for (const result of [r, evidence, compared([], [])]) C.toOneLine(result, { host: 's.example', t: spy });
  const english = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
  assert.deepEqual([...asked].sort(), ['historyCompareChangeFmt', 'historyCompareEvidenceAddedFmt', 'historyCompareEvidenceRemovedFmt', 'historyCompareIdentical', 'historyCompareUnchanged']);
  for (const key of asked) assert.ok(english[key], `${key} is a message the extension has`);
});

test('toOneLine() never changes the result it is given, and a result with missing parts does not throw', () => {
  const r = compared([det('Kasada', 'Anti-Bot', 80, ['url'])], [det('Kasada', 'Anti-Bot', 95, ['url']), det('DataDome', 'Anti-Bot', 70)]);
  const before = JSON.stringify(r);
  C.toOneLine(r, { host: 'a.example' });
  assert.equal(JSON.stringify(r), before);
  for (const odd of [undefined, null, {}, { added: null, changed: 'x' }]) assert.doesNotThrow(() => C.toOneLine(odd, { host: 'a.example' }), JSON.stringify(odd));
  assert.equal(C.toOneLine({}, { host: 'a.example' }), 'a.example: These two scans found the same protections, with the same confidence and evidence.');
});

// ---- The dialog itself: History.compareHistoryItem builds it in a vm with a small stand-in for the DOM -------------------

class Dom {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.handlers = {}; this.classes = new Set(); this._text = ''; this.style = {}; this.hidden = false; this.value = ''; this.title = ''; this.id = ''; this.innerHTML = ''; this.scrollTop = 0; }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get classList() {
    const set = this.classes;
    return { add: (name) => set.add(name), remove: (name) => set.delete(name), contains: (name) => set.has(name), toggle: (name, force) => { const on = force === undefined ? !set.has(name) : !!force; if (on) set.add(name); else set.delete(name); return on; } };
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
  removeAttribute(name) { delete this.attrs[name]; }
  appendChild(child) { this.children.push(child); return child; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text; }
  set textContent(value) { this._text = String(value); this.children = []; }
  addEventListener(type, handler) { (this.handlers[type] = this.handlers[type] || []).push(handler); }
  fire(type) { for (const handler of this.handlers[type] || []) handler({ target: this }); }
  click() { this.fire('click'); }
  find(className) { const found = []; const walk = (node) => { for (const child of node.children) { if (child.classes.has(className)) found.push(child); walk(child); } }; walk(this); return found; }
  first(className) { return this.find(className)[0]; }
}

function compareDialog(items, entryToCompare) {
  const listeners = [];
  const copied = [];
  const infos = [];
  // The list is not part of these tests: closing the dialog finds no card to give the focus back to
  const document = { createElement: (tag) => new Dom(tag), activeElement: null, querySelector: () => null };
  const window = {
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener: (type, fn) => { const at = listeners.findIndex((l) => l.type === type && l.fn === fn); if (at !== -1) listeners.splice(at, 1); }
  };
  let opened = null;
  let close;
  const FormatUtils = Object.assign(Object.create(require('../utils/format-utils.js')), { copyToClipboard: async (text) => { copied.push(text); return true; } });
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, URL, Intl, Promise, document, window, FormatUtils, HistoryCompare: C,
    Logger: new Proxy({}, { get: () => () => {} }),
    NotificationHelper: { info: (text) => infos.push(text), form: (options) => { opened = options; return new Promise((resolve) => { close = resolve; }); } }
  });
  context.self = context; context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/history/history.js'), 'utf8') + '\n;globalThis.History = History;', context);
  const view = Object.create(context.History.prototype);
  view.historyItems = items;
  const done = view.compareHistoryItem(entryToCompare);
  const form = opened && opened.content;
  const choose = (id) => { const select = form.first('ui-select'); select.value = id; select.fire('change'); };
  return { view, done, form, options: opened, listeners, copied, infos, document, choose, close: (value) => close(value),
    select: form && form.first('ui-select'), where: form && form.first('history-compare-where'), range: form && form.first('history-compare-range'),
    chips: () => form.find('history-compare-chip'), groups: () => form.find('history-compare-group'), rows: (group) => group.find('history-compare-row') };
}

const SEARCH = 'https://search.example/u/1/search-console/performance/search-analytics';
const NINE = ['Canvas Fingerprint', 'CSS Fingerprint', 'Font Fingerprint', 'Hardware Fingerprint', 'Navigator Fingerprint', 'Performance Fingerprint', 'Screen Fingerprint', 'Timezone/Intl Fingerprint', 'Web Storage Fingerprint']
  .map((name) => det(name, 'Fingerprint', 20));
const NOW = T0 + 5 * HOUR;
const shortAt = (ms) => C.shortDateTime(ms, null);

test('the dialog: one short line to pick the scan, its page path under it only when the address differs, one range line', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', `${SEARCH}?resource_id=sc-domain%3Aexample.com`, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const same = entry('same', SEARCH, T0 + HOUR, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const d = compareDialog([later, earlier, same], later);
  assert.deepEqual([d.options.title, d.options.confirmText, d.options.cancelText, d.options.focus === d.select], ['Compare scans', 'Copy as Markdown', 'Close', true]);
  assert.ok(d.form.classes.has('history-dialog-form') && d.form.classes.has('history-compare'));
  assert.ok(d.select.classes.has('ui-select'), 'a dropdown the interface draws');
  assert.equal(d.select.getAttribute('dir'), 'auto');
  const choices = d.select.children;
  assert.deepEqual(choices.map((option) => option.value), ['same', 'earlier'], 'newest first');
  assert.equal(choices[0].textContent, `${shortAt(T0 + HOUR)} · 10 found`, 'a date without seconds and the count: no path, no address');
  assert.equal(choices[1].textContent, `${shortAt(T0)} · 10 found`);
  assert.equal(d.select.value, 'same', 'the scan just before this one, as before');
  assert.equal(d.where.hidden, true, 'the same address: nothing under the list');
  assert.equal(d.select.getAttribute('aria-describedby'), null);
  assert.equal(d.range.textContent, `From ${shortAt(T0 + HOUR)} to ${shortAt(NOW)}`);
  assert.equal(d.range.getAttribute('role'), 'status');
  assert.ok(!/\d:\d\d:\d\d/.test(d.range.textContent), 'no seconds in the range line');

  d.choose('earlier');
  assert.equal(d.where.hidden, false, 'another address: its page path shows');
  assert.equal(d.where.textContent, '/u/1/search-console/performance/search-analytics?resource_id=sc-domain%3Aexample.com');
  assert.equal(d.where.getAttribute('data-tip'), `${SEARCH}?resource_id=sc-domain%3Aexample.com`, 'the full address is the hover text (the shared tooltip)');
  assert.equal(d.select.getAttribute('data-tip'), null, 'the list, focused as the dialog opens, has no tip to cover it');
  assert.match(d.range.getAttribute('data-tip'), /\d:\d\d:\d\d.*\d:\d\d:\d\d/, 'the range with its seconds is the hover text');
  assert.equal(d.select.getAttribute('aria-describedby'), d.where.id, 'a screen reader hears it with the list');
  assert.ok(d.where.id, 'the line has an id to be described by');
  assert.equal(d.range.textContent, `From ${shortAt(T0)} to ${shortAt(NOW)}`);
  d.choose('same');
  assert.equal(d.where.hidden, true);
  assert.equal(d.where.getAttribute('data-tip'), null, 'no stale address left on the hidden line');
  assert.equal(d.select.getAttribute('aria-describedby'), null);
  d.close(false);
  await d.done;
});

test('the dialog: four counts at a glance, the empty ones dimmed, then a group for each kind that has rows', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', SEARCH, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const d = compareDialog([later, earlier], later);
  assert.deepEqual(d.chips().map((chip) => chip.textContent), ['Added0', 'Removed0', 'Changed1', 'Unchanged9']);
  assert.deepEqual(d.chips().map((chip) => chip.classes.has('is-zero')), [true, true, false, false]);
  assert.deepEqual(d.chips().map((chip) => [...chip.classes].find((name) => /^is-(added|removed|changed|same)$/.test(name))), ['is-added', 'is-removed', 'is-changed', 'is-same']);
  const [changed, unchanged] = d.groups();
  assert.equal(d.groups().length, 2, 'no group for a kind with no rows');
  assert.ok(changed.classes.has('history-compare-changed') && unchanged.classes.has('history-compare-same'));
  assert.equal(changed.first('history-compare-heading').textContent, 'Changed (1)');
  assert.equal(changed.first('history-compare-heading').tagName, 'H4');
  assert.equal(changed.first('history-compare-toggle'), undefined, 'Changed has no button: it is always open');
  assert.equal(unchanged.first('history-compare-heading').textContent, 'Unchanged (9)', 'the heading text and the count, as before');
  d.close(false);
  await d.done;
});

test('the dialog: Unchanged is a real button, folded while it holds more than three rows; a click opens it and the choice is kept for the next scan picked', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', SEARCH, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const older = entry('older', SEARCH, T0 - HOUR, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 12)]);
  const d = compareDialog([later, earlier, older], later);
  let unchanged = d.groups()[1];
  let toggle = unchanged.first('history-compare-toggle');
  let list = unchanged.first('history-compare-list');
  assert.equal(toggle.tagName, 'BUTTON');
  assert.equal(toggle.getAttribute('type'), 'button');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false', 'nine rows: folded');
  assert.equal(toggle.getAttribute('aria-controls'), list.id);
  assert.ok(list.id);
  assert.equal(list.hidden, true);
  assert.equal(list.getAttribute('role'), 'list');
  assert.equal(toggle.textContent, 'Unchanged (9)');
  assert.equal(d.rows(unchanged).length, 9, 'the rows are in the page, hidden, not left out');
  toggle.click();
  assert.deepEqual([toggle.getAttribute('aria-expanded'), list.hidden], ['true', false]);
  toggle.click();
  assert.deepEqual([toggle.getAttribute('aria-expanded'), list.hidden], ['false', true]);
  toggle.click();

  d.choose('older');
  unchanged = d.groups()[1];
  toggle = unchanged.first('history-compare-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true', 'opened by the person: it stays open on the next comparison');
  assert.equal(unchanged.first('history-compare-list').hidden, false);
  d.close(false);
  await d.done;
});

test('the dialog: identical scans say so and keep Unchanged open, however long', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const twin = entry('twin', SEARCH, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const d = compareDialog([later, twin], later);
  assert.equal(d.form.first('history-compare-identical').textContent, 'These two scans found the same protections, with the same confidence and evidence.');
  assert.deepEqual(d.chips().map((chip) => chip.textContent), ['Added0', 'Removed0', 'Changed0', 'Unchanged10']);
  assert.equal(d.groups().length, 1);
  const toggle = d.groups()[0].first('history-compare-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(d.groups()[0].first('history-compare-list').hidden, false);
  d.close(false);
  await d.done;
});

test('the dialog: a row is the category\'s icon, the name, the score; a changed row shows the move, its difference and the evidence under the name', async () => {
  const later = entry('later', SEARCH, NOW, [
    det('Cloudflare', 'Anti-Bot', 95, ['cookie', 'header']), det('Turnstile', 'CAPTCHA', 60, ['url']), det('DataDome', 'Anti-Bot', 80, ['cookie']),
    det('Kasada', 'Anti-Bot', 70, ['header']), det('Canvas Fingerprint', 'Fingerprint', 30), det('Unscored', 'Anti-Bot', null, ['url'])]);
  const earlier = entry('earlier', SEARCH, T0, [
    det('Cloudflare', 'Anti-Bot', 70, ['cookie']), det('Turnstile', 'CAPTCHA', 90, ['url']), det('Akamai', 'Anti-Bot', 85, ['cookie']),
    det('Kasada', 'Anti-Bot', 70, ['cookie']), det('Canvas Fingerprint', 'Fingerprint', 30), det('Unscored', 'Anti-Bot', null, ['url'])]);
  const d = compareDialog([later, earlier], later);
  const [added, removed, changed, unchanged] = d.groups();
  assert.deepEqual([added, removed, changed, unchanged].map((g) => g.first('history-compare-heading').textContent), ['Added (1)', 'Removed (1)', 'Changed (3)', 'Unchanged (2)']);

  const row = d.rows(added)[0];
  assert.equal(row.tagName, 'LI');
  const icon = row.first('category-icon');
  assert.equal(icon.getAttribute('aria-hidden'), 'true', 'the icon is decoration');
  assert.ok(icon.innerHTML.includes('<svg'), 'the icon History cards use');
  assert.equal(icon.style.color, '#FF5733', 'in its category colour');
  assert.equal(row.first('history-compare-name').textContent, 'DataDome');
  assert.equal(row.first('history-compare-name').children[0].getAttribute('dir'), 'auto', 'a name is the person\'s text: its own direction');
  assert.equal(row.first('history-compare-cat').textContent, 'Anti-bot', 'the category name stays, for a screen reader');
  assert.equal(row.first('history-compare-conf').textContent, '80%');
  assert.equal(d.rows(removed)[0].first('history-compare-conf').textContent, '85%');
  assert.equal(d.rows(unchanged).find((r) => r.first('history-compare-name').textContent === 'Unscored').first('history-compare-conf'), undefined, 'no score, no number');

  const byName = (name) => d.rows(changed).find((r) => r.first('history-compare-name').textContent === name);
  const up = byName('Cloudflare');
  assert.deepEqual(['history-compare-from', 'history-compare-arrow', 'history-compare-to'].map((c) => up.first(c).textContent), ['70%', '→', '95%']);
  assert.equal(up.first('history-compare-delta').textContent, '+25');
  assert.ok(up.first('history-compare-delta').classes.has('is-up'));
  assert.equal(up.first('history-compare-notes').textContent, 'New evidence: HEADER');
  const down = byName('Turnstile');
  assert.equal(down.first('history-compare-delta').textContent, `${unicodeMinus}30`);
  assert.ok(down.first('history-compare-delta').classes.has('is-down'));
  assert.equal(down.first('history-compare-notes'), undefined, 'no evidence change, no second line');
  const evidenceOnly = byName('Kasada');
  assert.equal(evidenceOnly.first('history-compare-conf').textContent, '70%', 'the score did not move: it shows as it is');
  assert.equal(evidenceOnly.first('history-compare-delta'), undefined);
  assert.equal(evidenceOnly.first('history-compare-notes').textContent, 'New evidence: HEADER · Evidence gone: COOKIE');
  d.close(false);
  await d.done;
});

test('the dialog: Enter on the Unchanged button is the button\'s, not the dialog\'s "Copy as Markdown" (the dialog answers Enter by closing)', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', SEARCH, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const d = compareDialog([later, earlier], later);
  const guards = d.listeners.filter((l) => l.type === 'keydown' && l.capture === true);
  assert.equal(guards.length, 1, 'registered before the dialog\'s own handler, which is on the same target and phase');
  const press = (key) => { const event = { key, stopped: false, prevented: false, stopImmediatePropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } }; guards[0].fn(event); return event; };
  d.document.activeElement = d.groups()[1].first('history-compare-toggle');
  const enter = press('Enter');
  assert.deepEqual([enter.stopped, enter.prevented], [true, false], 'the dialog never sees it; the button is still pressed by it');
  assert.equal(press('Escape').stopped, false, 'Escape still closes the dialog');
  d.document.activeElement = d.select;
  assert.equal(press('Enter').stopped, false, 'anywhere else Enter is the dialog\'s');
  d.close(false);
  await d.done;
  assert.equal(d.listeners.filter((l) => l.type === 'keydown').length, 0, 'removed when the dialog closes');
});

test('the dialog: "Copy as Markdown" copies the same report as before, with the dates as the report wrote them; Close copies nothing', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', `${SEARCH}?x=1`, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const copy = compareDialog([later, earlier], later);
  copy.close(true);
  await copy.done;
  assert.equal(copy.copied.length, 1);
  const md = copy.copied[0];
  assert.ok(md.startsWith(`## Compare scans: search.example\n\n${SEARCH}\n\nFrom ${new Date(T0).toLocaleString()} to ${new Date(NOW).toLocaleString()}\n`), md.slice(0, 200));
  assert.ok(md.includes('### Changed\n- Crypto Fingerprint (Fingerprint): 10% → 15% (+5)'), md);
  assert.ok(md.includes('### Unchanged\n- Canvas Fingerprint (Fingerprint, 20%)'), md);
  const shut = compareDialog([later, earlier], later);
  shut.close(false);
  assert.equal(await shut.done, true);
  assert.deepEqual(shut.copied, []);
});

test('the dialog: a page with no other scan says so and opens nothing', async () => {
  const lonely = entry('lonely', SEARCH, NOW, []);
  const d = compareDialog([lonely, entry('other', 'https://other.example/', T0, [])], lonely);
  assert.equal(d.options, null);
  assert.deepEqual(d.infos, ['No other saved scan of this page to compare with']);
  assert.equal(await d.done, false);
});

// ---- "Copy summary": a button of the dialog's own content (the dialog's footer has room for Close and Copy as Markdown only) ---

const flush = () => new Promise((resolve) => setImmediate(resolve));
/** The dialog's capture-phase keydown guards, and a way to press a key through the first of them. */
const keyGuard = (d) => {
  const guards = d.listeners.filter((l) => l.type === 'keydown' && l.capture === true);
  const press = (key) => { const event = { key, stopped: false, prevented: false, stopImmediatePropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } }; guards[0].fn(event); return event; };
  return { guards, press };
};

test('the dialog: "Copy summary" is a real button of the content, after the four counts and before the results, named by its text', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', SEARCH, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const d = compareDialog([later, earlier], later);
  const copy = d.form.first('history-compare-copy');
  assert.ok(copy, 'a button in the dialog\'s content');
  assert.equal(copy.tagName, 'BUTTON');
  assert.equal(copy.getAttribute('type'), 'button', 'a button of the page, so it submits nothing');
  assert.equal(copy.textContent, 'Copy summary', 'its own text is its name');
  assert.equal(copy.first('history-compare-copy-icon').getAttribute('aria-hidden'), 'true', 'its icon is decoration');
  const order = d.form.children.map((node) => [...node.classes].find((name) => /^history-compare-(pick|range|http|summary|copy|result)$/.test(name)));
  assert.deepEqual(order, ['history-compare-pick', 'history-compare-range', 'history-compare-http', 'history-compare-summary', 'history-compare-copy', 'history-compare-result'],
    'the Tab order is the reading order: the list, the button for the counts above it, then the scrolling results');
  assert.deepEqual([d.options.confirmText, d.options.cancelText, d.options.focus === d.select], ['Copy as Markdown', 'Close', true], 'the footer and the first focus are as before');
  d.close(false);
  await d.done;
});

test('the dialog: "Copy summary" copies one line for the scan picked, keeps the dialog open, and follows the list', async () => {
  const later = entry('later', `${SEARCH}?tab=1#top`, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15), det('Kasada', 'Anti-Bot', 70, ['url'])]);
  const earlier = entry('earlier', `${SEARCH}?resource_id=sc-domain%3Aexample.com`, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10), det('Akamai', 'Anti-Bot', 85, ['cookie'])]);
  const older = entry('older', SEARCH, T0 - HOUR, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const d = compareDialog([later, earlier, older], later);
  const copy = d.form.first('history-compare-copy');
  let closed = false;
  d.done.then(() => { closed = true; });
  copy.click();
  await flush();
  assert.deepEqual(d.copied, [`search.example: +Kasada 70%, ${unicodeMinus}Akamai, Crypto Fingerprint 10% → 15% (+5), Unchanged (9)`], 'the host, then what changed since the scan picked');
  assert.equal(closed, false, 'the dialog stays open: another scan can be picked, or the report copied');
  d.choose('older');
  copy.click();
  await flush();
  assert.equal(d.copied[1], 'search.example: +Kasada 70%, Unchanged (10)', 'the other scan, the other line');
  assert.ok(d.copied.every((line) => !/[?#]|resource_id|tab=1|top/.test(line)), 'no query string or fragment, though the scans\' addresses had them');
  assert.ok(d.copied.every((line) => !/\n/.test(line)), 'one line');
  d.close(false);
  await d.done;
  assert.equal(d.copied.length, 2, 'Close copies nothing more');
});

test('the dialog: "Copy summary" and "Copy as Markdown" are two copies of the same comparison, the second one as before', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', `${SEARCH}?x=1`, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const d = compareDialog([later, earlier], later);
  d.form.first('history-compare-copy').click();
  await flush();
  d.close(true);
  await d.done;
  assert.equal(d.copied.length, 2);
  assert.equal(d.copied[0], 'search.example: Crypto Fingerprint 10% → 15% (+5), Unchanged (9)');
  assert.ok(d.copied[1].startsWith(`## Compare scans: search.example\n\n${SEARCH}\n\nFrom `), d.copied[1].slice(0, 120));
  assert.ok(d.copied[1].includes('### Changed\n- Crypto Fingerprint (Fingerprint): 10% → 15% (+5)'));
});

test('the dialog: for two identical scans "Copy summary" says how many protections stayed the same', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const twin = entry('twin', SEARCH, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const d = compareDialog([later, twin], later);
  d.form.first('history-compare-copy').click();
  await flush();
  assert.deepEqual(d.copied, ['search.example: Unchanged (10)']);
  d.close(false);
  await d.done;
});

test('the dialog: Enter on "Copy summary" presses the button, as it does on Unchanged; the dialog\'s own Enter (Copy as Markdown) stays for everything else', async () => {
  const later = entry('later', SEARCH, NOW, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 15)]);
  const earlier = entry('earlier', SEARCH, T0, [...NINE, det('Crypto Fingerprint', 'Fingerprint', 10)]);
  const d = compareDialog([later, earlier], later);
  const { guards, press } = keyGuard(d);
  assert.equal(guards.length, 1, 'one guard for both buttons, registered before the dialog\'s own handler (same target, same phase)');
  d.document.activeElement = d.form.first('history-compare-copy');
  const enter = press('Enter');
  assert.deepEqual([enter.stopped, enter.prevented], [true, false], 'the dialog never sees it, so it does not copy the Markdown and close; the browser still presses the button');
  assert.equal(press('Escape').stopped, false, 'Escape still closes the dialog');
  d.document.activeElement = d.groups()[1].first('history-compare-toggle');
  assert.equal(press('Enter').stopped, true, 'Unchanged keeps its Enter');
  d.document.activeElement = d.select;
  assert.equal(press('Enter').stopped, false, 'anywhere else Enter is the dialog\'s');
  d.close(false);
  await d.done;
  assert.equal(d.listeners.filter((l) => l.type === 'keydown').length, 0, 'removed when the dialog closes');
});

test('the two scans\' HTTP status: the move, the same code once, a dash for a scan that did not know it, nothing when neither did', () => {
  const at = (id, time, httpStatus) => ({ ...entry(id, 'https://shop.example/p', time, [det('Cloudflare', 'Anti-Bot', 90)]), ...(httpStatus === undefined ? {} : { httpStatus }) });
  assert.equal(C.statusText(C.compare(at('b', T0 + 1000, 403), at('a', T0, 200))), 'HTTP status: 200 → 403', 'earlier first, whatever order they come in');
  assert.equal(C.statusText(C.compare(at('a', T0, 200), at('b', T0 + 1000, 403)), { rtl: true }), 'HTTP status: 200 ← 403', 'a right-to-left line reads the arrow its own way');
  assert.equal(C.statusText(C.compare(at('a', T0, 503), at('b', T0 + 1000, 503))), 'HTTP status: 503');
  assert.equal(C.statusText(C.compare(at('a', T0), at('b', T0 + 1000, 429))), 'HTTP status: - → 429', 'an entry saved before 3.1.9');
  assert.equal(C.statusText(C.compare(at('a', T0), at('b', T0 + 1000, 304))), '', 'neither known (a 304 says nothing)');
  const t = (key, fallback, ...args) => `[${key}]${args.join('|')}`;
  assert.equal(C.statusText(C.compare(at('a', T0, 200), at('b', T0 + 1000, 403)), { t }), '[detectionHttpStatusFmt]200 → 403', 'the Detection tab\'s own words');
  const md = C.toMarkdown(C.compare(at('a', T0, 200), at('b', T0 + 1000, 403)), { host: 'shop.example' });
  assert.match(md, /\nFrom .+\n\nHTTP status: 200 → 403\n/, 'the report says it under the dates');
  assert.ok(!/HTTP status/.test(C.toMarkdown(C.compare(at('a', T0), at('b', T0 + 1000)), { host: 'shop.example' })), 'and nothing when it is not known');
});
