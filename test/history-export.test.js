const { test } = require('node:test');
const assert = require('node:assert');

const E = require('../modules/core/history-export.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const det = (name, category, confidence, difficulty = 'Medium') => ({ detector: { name }, category, confidence, difficulty });
const item = (id, host, ageDays, detections, extra = {}) => ({
  id, url: `https://${host}/p?x=1`, hostname: host, title: `Title ${id}`, timestamp: NOW - ageDays * DAY, detections, ...extra
});

const items = [
  item('a', 'shop.example.com', 1, [det('Cloudflare', 'Anti-Bot', 95)], { pinned: true, note: 'check "later"' }),
  item('b', 'news.example.org', 10, [det('reCAPTCHA', 'CAPTCHA', 80), det('Canvas', 'Fingerprint', 30)]),
  item('c', 'old.example.net', 60, [det('Canvas', 'Fingerprint', 40)]),
  item('d', 'bank.test', 120, [det('Akamai', 'Anti-Bot', 70)], { pinned: true })
];

test('filter: no filters returns everything, ignoring empty entries', () => {
  assert.strictEqual(E.filter(items, {}, NOW).length, 4);
  assert.strictEqual(E.filter([null, undefined, ...items], { category: 'all' }, NOW).length, 4);
  assert.deepStrictEqual(E.filter(undefined, {}, NOW), []);
});

test('filter: by category', () => {
  assert.deepStrictEqual(E.filter(items, { category: 'antibot' }, NOW).map(i => i.id), ['a', 'd']);
  assert.deepStrictEqual(E.filter(items, { category: 'captcha' }, NOW).map(i => i.id), ['b']);
  assert.deepStrictEqual(E.filter(items, { category: 'fingerprint' }, NOW).map(i => i.id), ['b', 'c']);
});

test('filter: by period (0 = all time) counts whole days back from now', () => {
  assert.deepStrictEqual(E.filter(items, { days: 7 }, NOW).map(i => i.id), ['a']);
  assert.deepStrictEqual(E.filter(items, { days: 30 }, NOW).map(i => i.id), ['a', 'b']);
  assert.deepStrictEqual(E.filter(items, { days: 90 }, NOW).map(i => i.id), ['a', 'b', 'c']);
  assert.strictEqual(E.filter(items, { days: 0 }, NOW).length, 4);
  assert.strictEqual(E.filter(items, { days: '30' }, NOW).length, 2, 'a value from a form field is a string');
});

test('filter: by site text (host or address, any case) and pinned only', () => {
  assert.deepStrictEqual(E.filter(items, { domain: 'EXAMPLE.' }, NOW).map(i => i.id), ['a', 'b', 'c']);
  assert.deepStrictEqual(E.filter(items, { domain: 'bank' }, NOW).map(i => i.id), ['d']);
  assert.deepStrictEqual(E.filter(items, { pinnedOnly: true }, NOW).map(i => i.id), ['a', 'd']);
  assert.deepStrictEqual(E.filter(items, { pinnedOnly: false }, NOW).length, 4);
});

test('filter: every choice must match', () => {
  assert.deepStrictEqual(E.filter(items, { category: 'antibot', days: 90, pinnedOnly: true, domain: 'shop' }, NOW).map(i => i.id), ['a']);
  assert.deepStrictEqual(E.filter(items, { category: 'captcha', pinnedOnly: true }, NOW), []);
});

test('build json: the file History imports, always complete', () => {
  const out = E.build(items, { format: 'json', includeTimestamps: false, now: NOW });
  assert.strictEqual(out.extension, 'json');
  assert.strictEqual(out.type, 'application/json');
  const data = JSON.parse(out.text);
  assert.strictEqual(data.version, '1.0');
  assert.strictEqual(data.itemsCount, 4);
  assert.strictEqual(data.timestamp, new Date(NOW).toISOString());
  assert.deepStrictEqual(data.items, items, 'timestamps and annotations stay in JSON whatever the setting');
});

test('build csv: one row per detection, optional timestamp column, pin and note', () => {
  const withTime = E.build(items, { format: 'csv', includeTimestamps: true }).text.split('\r\n');
  assert.strictEqual(withTime[0], 'url,hostname,title,timestamp,protection,category,confidence,difficulty,pinned,note');
  assert.strictEqual(withTime.length, 1 + 5 + 1, 'header, five detections, trailing newline');
  assert.match(withTime[1], /^https:\/\/shop\.example\.com\/p\?x=1,shop\.example\.com,Title a,2026-10-18T12:00:00\.000Z,Cloudflare,Anti-Bot,95,Medium,yes,"check ""later"""$/);

  const noTime = E.build(items, { format: 'csv', includeTimestamps: false }).text.split('\r\n');
  assert.strictEqual(noTime[0], 'url,hostname,title,protection,category,confidence,difficulty,pinned,note');
  assert.ok(!/2026-10/.test(noTime.join('')), 'no date anywhere');
  assert.strictEqual(E.build(items, { format: 'csv' }).type, 'text/csv');
});

test('build csv: an entry without detections still has a row, and formulas are neutralised', () => {
  const odd = [{ url: 'https://x.com', hostname: 'x.com', title: '=HYPERLINK("http://evil")', timestamp: NOW, detections: [], note: '+1' }];
  const lines = E.build(odd, { format: 'csv', includeTimestamps: false }).text.split('\r\n');
  assert.strictEqual(lines.length, 3);
  assert.ok(lines[1].includes(`"'=HYPERLINK(""http://evil"")"`), lines[1]);
  assert.ok(lines[1].endsWith(",,,,,'+1"), lines[1]);
});

test('build txt: readable blocks, date only when asked', () => {
  const text = E.build(items.slice(0, 2), { format: 'txt', includeTimestamps: true }).text;
  assert.match(text, /^Title a\nhttps:\/\/shop\.example\.com\/p\?x=1\nDate: 2026-10-18T12:00:00\.000Z\nProtections: Cloudflare \(Anti-Bot, 95%\)\nPinned\nNote: check "later"\n\n---\n\nTitle b/);
  assert.match(text, /Protections: reCAPTCHA \(CAPTCHA, 80%\); Canvas \(Fingerprint, 30%\)\n$/);
  assert.ok(!/Date:/.test(E.build(items, { format: 'txt', includeTimestamps: false }).text));
  assert.strictEqual(E.build([], { format: 'txt' }).text, '');
});

test('build: an unknown format falls back to JSON', () => {
  assert.strictEqual(E.build(items, { format: 'xml' }).format, 'json');
  assert.strictEqual(E.build(items).format, 'json');
});

test('chunk: parts stay under the size and keep the order', () => {
  const many = Array.from({ length: 40 }, (_, i) => item(`e${i}`, `h${i}.com`, 0, [det('Cloudflare', 'Anti-Bot', 90)], { note: 'x'.repeat(200) }));
  const options = { format: 'json' };
  const parts = E.chunk(many, options, 3000);
  assert.ok(parts.length > 1);
  assert.deepStrictEqual(parts.flat().map(i => i.id), many.map(i => i.id));
  for (const part of parts) {
    const bytes = new TextEncoder().encode(E.build(part, options).text).length;
    assert.ok(part.length === 1 || bytes < 3000 + 300, `a part with ${part.length} entries is ${bytes} bytes`);
  }
  assert.strictEqual(E.chunk(many, options, 10 ** 9).length, 1);
  assert.deepStrictEqual(E.chunk([], options), []);
});

test('chunk counts UTF-8 bytes, not characters', () => {
  const wide = Array.from({ length: 4 }, (_, i) => item(`w${i}`, 'x.com', 0, [], { note: '漢'.repeat(200) }));
  const text = E.build([wide[0]], { format: 'json' }).text;
  const bytes = new TextEncoder().encode(text).length;
  assert.ok(bytes > text.length + 300, 'the sample has many multi-byte characters');
  // Room for two entries by character count, but not by bytes
  const limit = text.length * 2 + 10;
  assert.ok(bytes * 2 > limit);
  assert.deepStrictEqual(E.chunk(wide, { format: 'json' }, limit).map(p => p.length), [1, 1, 1, 1]);
});

test('an entry larger than the limit gets a part of its own', () => {
  const big = [item('a', 'a.com', 0, []), item('big', 'b.com', 0, [], { note: 'y'.repeat(5000) }), item('c', 'c.com', 0, [])];
  const parts = E.chunk(big, { format: 'json' }, 2000);
  assert.deepStrictEqual(parts.map(p => p.map(i => i.id)), [['a'], ['big'], ['c']]);
});

test('fileName: dated, numbered only when split', () => {
  assert.strictEqual(E.fileName('csv', NOW), 'scrapfly-history-2026-10-19.csv');
  assert.strictEqual(E.fileName('txt', NOW, 2), 'scrapfly-history-2026-10-19-part-2.txt');
  assert.strictEqual(E.fileName('exe', NOW), 'scrapfly-history-2026-10-19.json');
});

test('changedOnly keeps the pages marked Changed by their latest scan, and combines with the other filters', () => {
  const items = [
    { id: 'c1', url: 'https://a.example/', hostname: 'a.example', timestamp: NOW - 1000, pinned: true, changed: { at: NOW - 1000, added: ['X'], removed: [] }, detections: [{ category: 'Anti-Bot' }] },
    { id: 'c2', url: 'https://b.example/', hostname: 'b.example', timestamp: NOW - 1000, changed: { at: NOW - 1000, added: [], removed: ['Y'] }, detections: [{ category: 'Captcha' }] },
    { id: 'n1', url: 'https://c.example/', hostname: 'c.example', timestamp: NOW - 1000, pinned: true, detections: [{ category: 'Anti-Bot' }] }
  ];
  assert.deepStrictEqual(E.filter(items, { changedOnly: true }, NOW).map(i => i.id), ['c1', 'c2']);
  assert.deepStrictEqual(E.filter(items, { changedOnly: false }, NOW).length, 3);
  assert.deepStrictEqual(E.filter(items, { changedOnly: true, pinnedOnly: true }, NOW).map(i => i.id), ['c1']);
  assert.deepStrictEqual(E.filter(items, { changedOnly: true, category: 'captcha' }, NOW).map(i => i.id), ['c2']);
});
