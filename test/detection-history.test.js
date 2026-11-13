const { test } = require('node:test');
const assert = require('node:assert/strict');

// Detection tab, 3.1.8: where the results it shows were found (another page of the site, under the Domain cache scope) and
// what History says changed on the page. The pure part lives in modules/core/detection-history.js.

const D = require('../modules/core/detection-history.js');

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 10, 9, 0, 0);
const det = (name, category = 'antibot', confidence = 90) => ({ name, category, confidence });
const entry = (id, url, timestamp, detections, extra = {}) => ({ id, url, timestamp, detections, ...extra });

test('pageOf: the page as History counts pages, without the query and the fragment', () => {
  assert.equal(D.pageOf('https://shop.example/login?next=/cart#top'), 'https://shop.example/login');
  assert.equal(D.pageOf('https://shop.example/login'), D.pageOf('https://shop.example/login?x=1'));
  assert.notEqual(D.pageOf('https://shop.example/'), D.pageOf('https://shop.example/login'));
});

test('otherPage: a result found on another page of the site says which page and when', () => {
  const other = D.otherPage({ url: 'https://shop.example/', timestamp: T0, cacheScope: 'domain' }, 'https://shop.example/login');
  assert.deepEqual(other, { path: '/', url: 'https://shop.example/', at: T0 });
});

test('otherPage: the same page (whatever the query or fragment) is not another page', () => {
  assert.equal(D.otherPage({ url: 'https://shop.example/login?a=1', timestamp: T0, cacheScope: 'domain' }, 'https://shop.example/login#x'), null);
  assert.equal(D.otherPage({ url: 'https://shop.example/login', timestamp: T0 }, 'https://shop.example/login'), null);
});

test('otherPage: the Path and Full URL scopes never show the line', () => {
  for (const cacheScope of ['path', 'full']) {
    assert.equal(D.otherPage({ url: 'https://shop.example/', timestamp: T0, cacheScope }, 'https://shop.example/login'), null, cacheScope);
  }
});

test('otherPage: a result saved before the scope was recorded is treated as Domain', () => {
  assert.equal(D.otherPage({ url: 'https://shop.example/a', timestamp: T0 }, 'https://shop.example/b').path, '/a');
});

test('otherPage: another spelling of the site names its host; a long path is cut in its middle', () => {
  assert.equal(D.otherPage({ url: 'https://www.shop.example/cart', timestamp: T0 }, 'https://shop.example/cart').path, 'www.shop.example/cart');
  const long = `/${'a'.repeat(40)}/${'b'.repeat(40)}`;
  const other = D.otherPage({ url: `https://shop.example${long}`, timestamp: T0 }, 'https://shop.example/');
  assert.equal([...other.path].length, D.MAX_PATH);
  assert.ok(other.path.startsWith('/aaa') && other.path.endsWith('bbb') && other.path.includes('…'));
  assert.equal(other.url, `https://shop.example${long}`, 'the whole address stays for the hover');
});

test('otherPage: an address that cannot be read, or no metadata, shows nothing; an unknown time is 0', () => {
  assert.equal(D.otherPage(null, 'https://shop.example/'), null);
  assert.equal(D.otherPage({ url: 'not a url' }, 'https://shop.example/'), null);
  assert.equal(D.otherPage({ url: 'https://shop.example/a' }, ''), null);
  assert.equal(D.otherPage({ url: 'https://shop.example/a' }, 'https://shop.example/b').at, 0);
});

test('scansOf: the page\'s saved scans, newest first, without the entries recorded from the cache or of other pages', () => {
  const items = [
    entry('old', 'https://shop.example/login', T0, []),
    entry('cached', 'https://shop.example/login', T0 + 3 * HOUR, [], { fromCache: true }),
    entry('new', 'https://shop.example/login?x=1', T0 + 2 * HOUR, []),
    entry('home', 'https://shop.example/', T0 + 4 * HOUR, [])
  ];
  assert.deepEqual(D.scansOf(items, 'https://shop.example/login').map(item => item.id), ['new', 'old']);
  assert.deepEqual(D.scansOf(null, 'https://shop.example/login'), []);
  assert.deepEqual(D.scansOf(items, ''), []);
});

test('change: a Changed record on the newest scan is what changed since the earlier scan', () => {
  const items = [
    entry('a', 'https://shop.example/', T0, [det('Kasada')]),
    entry('b', 'https://shop.example/', T0 + HOUR, [det('DataDome')], { changed: { at: T0 + HOUR, added: ['DataDome'], removed: ['Kasada'] } })
  ];
  const info = D.change(items, 'https://shop.example/?q=1', [det('DataDome')]);
  assert.equal(info.entry.id, 'b');
  assert.equal(info.changed, true);
  assert.equal(info.since, T0, 'the date of the earlier scan, the one Compare scans opens with');
  assert.deepEqual(info.added, ['DataDome']);
  assert.deepEqual(info.removed, ['Kasada']);
  assert.equal(info.comparable, true);
  assert.equal(D.changeText(info.added, info.removed), '\u2068+DataDome\u2069 \u2068−Kasada\u2069');
});

test('change: no Changed record is no change since the earlier scan', () => {
  const items = [
    entry('a', 'https://shop.example/', T0, [det('Akamai')]),
    entry('b', 'https://shop.example/', T0 + HOUR, [det('Akamai')])
  ];
  const info = D.change(items, 'https://shop.example/', [det('Akamai')]);
  assert.equal(info.changed, false);
  assert.equal(info.since, T0);
  assert.deepEqual([info.added, info.removed], [[], []]);
});

test('change: nothing to say with no saved scan, with only one and no Changed record, or for another page', () => {
  assert.equal(D.change([], 'https://shop.example/', []), null);
  assert.equal(D.change([entry('a', 'https://shop.example/', T0, [])], 'https://shop.example/', []), null);
  assert.equal(D.change([entry('a', 'https://shop.example/x', T0, []), entry('b', 'https://shop.example/x', T0 + 1, [])], 'https://shop.example/', []), null);
});

test('change: a scan that is not what the tab shows (History has not saved the new one yet) is not described', () => {
  const items = [
    entry('a', 'https://shop.example/', T0, []),
    entry('b', 'https://shop.example/', T0 + HOUR, [])
  ];
  assert.equal(D.change(items, 'https://shop.example/', [det('Cloudflare')]), null);
  // fingerprinting is not a change, as in History
  assert.ok(D.change(items, 'https://shop.example/', [det('Canvas', 'fingerprint')]));
});

test('change: a Changed record left alone (the scan was updated in place) dates from the change; Compare scans has nothing to open', () => {
  const items = [entry('b', 'https://shop.example/', T0 + 5 * HOUR, [det('DataDome')], { changed: { at: T0 + 2 * HOUR, added: ['DataDome'], removed: [] } })];
  const info = D.change(items, 'https://shop.example/', [det('DataDome')]);
  assert.equal(info.since, T0 + 2 * HOUR);
  assert.equal(info.comparable, false);
});

test('changeText: one line, names as History shows them, a line break in a name cannot make a second line', () => {
  assert.equal(D.changeText(['Data\nDome'], []), '\u2068+Data Dome\u2069');
  assert.equal(D.changeText([], ['Kasada', '']), '\u2068−Kasada\u2069', 'each sign stays with its name in a right-to-left line');
  assert.equal(D.changeText(null, undefined), '');
});
