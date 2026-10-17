'use strict';
// Statistics → Domains: what a page gained or lost between two saved copies of itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const HistoryStats = require('../sections/stats/history-stats.js');

const DAY = 86400000;
const NOW = new Date(2026, 8, 29, 15, 0, 0).getTime();
const det = (name, category = 'antibot') => ({ name, category, confidence: 90 });
const visit = (hostname, pathAndQuery, names, timestamp, extra = {}) => ({
  hostname, url: 'https://' + hostname + pathAndQuery, timestamp,
  detections: names.map((n) => typeof n === 'string' ? det(n) : n), ...extra });

test('pageKey keeps the lower-cased path, drops query, hash and trailing slashes', () => {
  const key = (url) => HistoryStats.pageKey({ url });
  assert.equal(key('https://a.com'), '/');
  assert.equal(key('https://a.com/'), '/');
  assert.equal(key('https://a.com///'), '/');
  assert.equal(key('https://A.com/Shop/Cart/'), '/shop/cart');
  assert.equal(key('https://a.com/a/b?x=1&y=2#frag'), '/a/b');
  assert.equal(key('https://a.com/a/b?x=1'), key('https://a.com/a/b/?x=2#other'));
  assert.equal(key('https://a.com/search?q=SECRET'), '/search');
  assert.equal(key('http://a.com:8080/x'), '/x');
});

test('pageKey replaces ids with :id', () => {
  const key = (url) => HistoryStats.pageKey({ url });
  assert.equal(key('https://a.com/product/871'), '/product/:id');
  assert.equal(key('https://a.com/product/871/reviews'), '/product/:id/reviews');
  assert.equal(key('https://a.com/orders/123e4567-e89b-12d3-a456-426614174000/view'), '/orders/:id/view');
  assert.equal(key('https://a.com/orders/123E4567-E89B-12D3-A456-426614174000'), '/orders/:id', 'UUIDs are matched whatever their case');
  assert.equal(key('https://a.com/u/abcdefghij0123456789xyz'), '/u/:id', 'a long token with a digit is an id');
  assert.equal(key('https://a.com/u/abcdefghijklmnopqrstuvwxyz'), '/u/abcdefghijklmnopqrstuvwxyz', 'a long word without a digit is a page');
  assert.equal(key('https://a.com/u/abc123'), '/u/abc123', 'a short token is a page');
  assert.equal(key('https://a.com/u/' + 'a'.repeat(19) + '1'), '/u/:id', 'twenty characters with a digit is an id');
  assert.equal(key('https://a.com/u/' + 'a'.repeat(18) + '1'), '/u/' + 'a'.repeat(18) + '1', 'nineteen is a page');
  assert.equal(key('https://a.com/u/' + 'a'.repeat(19) + '!'), '/u/' + 'a'.repeat(19) + '!', 'and so is a token with other characters');
  assert.equal(key('https://a.com/v2/items'), '/v2/items');
  assert.equal(key('https://a.com/2026/10/post'), '/:id/:id/post');
  assert.equal(key('https://a.com/product/1'), key('https://a.com/product/99999'));
});

test('pageKey is empty without a usable URL', () => {
  for (const item of [null, undefined, {}, { url: '' }, { url: 3 }, { url: 'not a url' }, { url: '/relative/path' }, 'junk', 5, []]) {
    assert.equal(HistoryStats.pageKey(item), '', JSON.stringify(item));
  }
  assert.equal(HistoryStats.pageKey('https://a.com/x'), '/x', 'a bare URL string is accepted');
});

test('three different pages of one host that differ in protections are not a change', () => {
  const items = [visit('a.com', '/', ['Cloudflare'], NOW - 3 * DAY), visit('a.com', '/blog', ['DataDome'], NOW - 2 * DAY), visit('a.com', '/cart', ['Akamai'], NOW - DAY)];
  const changes = HistoryStats.protectionChanges(items, { now: NOW });
  assert.deepEqual(changes, { rows: [], count: 0, hostnames: [] });
});

test('the same page gaining a protection is one gained row', () => {
  const items = [visit('a.com', '/login', ['Cloudflare'], NOW - 2 * DAY), visit('a.com', '/login', ['Cloudflare', det('hCaptcha', 'captcha')], NOW - DAY),
    visit('a.com', '/other', ['DataDome'], NOW)];
  const changes = HistoryStats.protectionChanges(items, { now: NOW });
  assert.equal(changes.count, 1);
  assert.deepEqual(changes.hostnames, ['a.com']);
  assert.deepEqual(changes.rows, [{ hostname: 'a.com', path: '/login', timestamp: NOW - DAY, previous: NOW - 2 * DAY,
    added: [{ name: 'hCaptcha', category: 'captcha' }], removed: [], kind: 'gained' }]);
});

test('replaced, dropped and gained are told apart, and a protection kept is no change', () => {
  const items = [
    visit('a.com', '/p', ['Cloudflare', 'reCAPTCHA'], NOW - 5 * DAY), visit('a.com', '/p', ['Cloudflare', 'Turnstile'], NOW - 4 * DAY),
    visit('b.com', '/p', ['DataDome'], NOW - 3 * DAY), visit('b.com', '/p', [], NOW - 2 * DAY),
    visit('c.com', '/p', ['Akamai'], NOW - 2 * DAY), visit('c.com', '/p', ['akamai'], NOW - DAY),
    visit('d.com', '/p', [], NOW - 2 * DAY), visit('d.com', '/p', ['Kasada'], NOW - DAY)
  ];
  const { rows, count } = HistoryStats.protectionChanges(items, { now: NOW });
  assert.equal(count, 3, 'the same protection under another letter case is no change');
  assert.deepEqual(rows.map((r) => [r.hostname, r.kind]), [['d.com', 'gained'], ['b.com', 'dropped'], ['a.com', 'replaced']], 'newest first');
  const replaced = rows.find((r) => r.kind === 'replaced');
  assert.deepEqual(replaced.added.map((p) => p.name), ['Turnstile']);
  assert.deepEqual(replaced.removed.map((p) => p.name), ['reCAPTCHA']);
});

test('the first saved copy inside the range is compared with the last one before it', () => {
  const since = HistoryStats.rangeStart(30, NOW);
  const items = [
    visit('a.com', '/', ['Cloudflare'], NOW - 60 * DAY), visit('a.com', '/', ['Cloudflare', 'DataDome'], NOW - 50 * DAY), // before the range
    visit('a.com', '/', ['Cloudflare'], NOW - 40 * DAY), // last copy before the range
    visit('a.com', '/', ['Cloudflare', 'Turnstile'], NOW - 10 * DAY), // first in range: the change we want
    visit('a.com', '/', ['Cloudflare', 'Turnstile'], NOW - DAY)
  ];
  const all = HistoryStats.protectionChanges(items, { now: NOW });
  assert.equal(all.count, 3);
  const inRange = HistoryStats.protectionChanges(items, { since, now: NOW });
  assert.equal(inRange.count, 1);
  assert.deepEqual(inRange.rows[0].added.map((p) => p.name), ['Turnstile']);
  assert.equal(inRange.rows[0].timestamp, NOW - 10 * DAY);
  assert.equal(inRange.rows[0].previous, NOW - 40 * DAY);
  assert.deepEqual(inRange.hostnames, ['a.com']);
  assert.equal(HistoryStats.protectionChanges(items, { since: NOW - DAY + 1, now: NOW }).count, 0);
});

test('ids and queries do not make a different page; entries are read in time order whatever the array order', () => {
  const items = [
    visit('shop.com', '/product/200?ref=x', ['Cloudflare', 'DataDome'], NOW - DAY),
    visit('shop.com', '/product/100', ['Cloudflare'], NOW - 3 * DAY),
    visit('shop.com', '/product/300/', ['Cloudflare', 'DataDome'], NOW)
  ];
  const { rows } = HistoryStats.protectionChanges(items, { now: NOW });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, '/product/:id');
  assert.equal(rows[0].timestamp, NOW - DAY);
  assert.equal(rows[0].previous, NOW - 3 * DAY);
});

test('a page whose detections were all scoped away is still a visit, so a lost protection shows as dropped', () => {
  const items = [visit('a.com', '/', ['Cloudflare', det('Canvas', 'fingerprint')], NOW - 2 * DAY), visit('a.com', '/', [det('Canvas', 'fingerprint')], NOW - DAY)];
  const scoped = HistoryStats.scopeItems(items, HistoryStats.DEFAULT_SCOPE);
  const changes = HistoryStats.protectionChanges(scoped, { now: NOW });
  assert.deepEqual(changes.rows.map((r) => [r.kind, r.removed.map((p) => p.name)]), [['dropped', ['Cloudflare']]]);
  assert.equal(HistoryStats.protectionChanges(items, { now: NOW }).rows[0].removed.map((p) => p.name).join(), 'Cloudflare', 'fingerprint unchanged is no change either');
});

test('entries without a date, from the future, without a host or malformed are ignored', () => {
  const items = [visit('a.com', '/', ['Cloudflare'], NOW - DAY), visit('a.com', '/', ['DataDome'], undefined, { timestamp: undefined }),
    visit('a.com', '/', ['Akamai'], NOW + DAY), { url: 'not a url', timestamp: NOW - 5, detections: [det('X')] }, { timestamp: NOW - 4, detections: [det('Y')] },
    null, 'junk', [], { hostname: 'a.com', timestamp: 'bad' }];
  assert.equal(HistoryStats.protectionChanges(items, { now: NOW }).count, 0);
  assert.deepEqual(HistoryStats.protectionChanges(null), { rows: [], count: 0, hostnames: [] });
  assert.deepEqual(HistoryStats.protectionChanges(undefined, null), { rows: [], count: 0, hostnames: [] });
  assert.equal(HistoryStats.protectionChanges([...items, visit('a.com', '/', ['Akamai'], NOW)], { now: NOW }).count, 1, 'a copy dated exactly now counts');
});

test('rows are capped at 200 but count and hostnames cover every change', () => {
  const items = [];
  for (let i = 0; i < 250; i++) {
    const host = 'site' + String(i).padStart(3, '0') + '.com';
    items.push(visit(host, '/', ['Cloudflare'], NOW - 3 * DAY - i), visit(host, '/', ['Cloudflare', 'DataDome'], NOW - 2 * DAY - i));
  }
  const changes = HistoryStats.protectionChanges(items, { now: NOW });
  assert.equal(changes.rows.length, 200);
  assert.equal(changes.count, 250);
  assert.equal(changes.hostnames.length, 250, 'a host with a change is listed even when its row was cut');
  assert.equal(new Set(changes.hostnames).size, 250);
  assert.ok(changes.rows.every((row, i) => i === 0 || changes.rows[i - 1].timestamp >= row.timestamp));
});

test('the input is not mutated and compute().domainChanges keeps its own per-host meaning', () => {
  const items = [visit('a.com', '/x', ['Cloudflare'], NOW - 2 * DAY), visit('a.com', '/y', ['DataDome'], NOW - DAY)];
  const before = JSON.stringify(items);
  assert.equal(HistoryStats.protectionChanges(items, { now: NOW }).count, 0);
  assert.equal(JSON.stringify(items), before);
  const stats = HistoryStats.compute(items, { now: NOW });
  assert.equal(stats.domainChangeCount, 1, 'per hostname the two pages still look like a change');
  assert.deepEqual(stats.domainChanges[0].added, ['DataDome']);
});
