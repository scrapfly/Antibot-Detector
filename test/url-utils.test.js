const { test } = require('node:test');
const assert = require('node:assert');

// Defensive stubs for globals the module may reference at call time.
globalThis.Logger = globalThis.Logger || { debug() {}, warn() {}, error() {}, detection() {} };
globalThis.Constants = globalThis.Constants || {};

const UrlUtils = require('../utils/url-utils.js');

test('hashUrl is deterministic for the same url + scope', () => {
  const a = UrlUtils.hashUrl('https://example.com/a?x=1', 'domain');
  const b = UrlUtils.hashUrl('https://example.com/a?x=1', 'domain');
  assert.strictEqual(a, b);
  assert.ok(typeof a === 'string' && a.length > 0);
});

test('hashUrl differs by scope for a url with a path', () => {
  const domain = UrlUtils.hashUrl('https://example.com/a?x=1', 'domain');
  const full = UrlUtils.hashUrl('https://example.com/a?x=1', 'full');
  assert.notStrictEqual(domain, full);
});

// Site icons (History, Advanced, Detection's Site tile): the page's icon link
// is read at scan time, so only real icon links may be taken.
const fakeDoc = (links) => ({
  querySelectorAll: () => links.map(([rel, href]) => ({ href, getAttribute: (name) => (name === 'rel' ? rel : null) }))
});

test('findPageIconHref takes the first rel "icon" link, in any spelling', () => {
  const doc = fakeDoc([
    ['stylesheet', 'https://site.example/app.css'],
    ['Shortcut Icon', 'https://site.example/favicon.ico'],
    ['icon', 'https://site.example/icon-32.png']
  ]);
  assert.strictEqual(UrlUtils.findPageIconHref(doc), 'https://site.example/favicon.ico');
  assert.strictEqual(UrlUtils.findPageIconHref(fakeDoc([['alternate icon', 'https://site.example/a.svg']])), 'https://site.example/a.svg');
});

test('findPageIconHref prefers a favicon over an Apple touch icon', () => {
  const doc = fakeDoc([
    ['apple-touch-icon', 'https://site.example/touch.png'],
    ['icon', 'https://site.example/favicon.svg']
  ]);
  assert.strictEqual(UrlUtils.findPageIconHref(doc), 'https://site.example/favicon.svg');
  assert.strictEqual(UrlUtils.findPageIconHref(fakeDoc([['apple-touch-icon-precomposed', 'https://site.example/t.png']])), 'https://site.example/t.png');
});

test('findPageIconHref never takes a page image, a mask icon or an empty link', () => {
  const doc = fakeDoc([
    ['preload', 'https://site.example/hero.png'],
    ['mask-icon', 'https://site.example/pinned.svg'],
    ['fluid-icon', 'https://site.example/fluid.png'],
    ['icon', '']
  ]);
  assert.strictEqual(UrlUtils.findPageIconHref(doc), '');
  assert.strictEqual(UrlUtils.findPageIconHref(null), '');
  assert.strictEqual(UrlUtils.findPageIconHref({}), '');
});

test('stored site icons: page URLs kept, unusable ones replaced by Google, none by the extension logo', () => {
  const google = 'https://www.google.com/s2/favicons?domain=site.example';
  assert.strictEqual(UrlUtils.normalizeFaviconForStorage('https://cdn.example/icon.png', 'https://site.example/p'), 'https://cdn.example/icon.png');
  assert.strictEqual(UrlUtils.normalizeFaviconForStorage('data:image/png;base64,AAAA', 'https://site.example/p'), google);
  assert.strictEqual(UrlUtils.normalizeFaviconForStorage('https://t0.gstatic.com/faviconV2?url=x', 'https://site.example/p'), google);
  assert.strictEqual(UrlUtils.normalizeFaviconForStorage('', 'https://site.example/p'), google);
  assert.match(UrlUtils.normalizeFaviconForStorage('', ''), /icons\/icon48\.png$/);
});

test('the fallback logo is the 48 px icon, sharp in 16 px slots on high-resolution screens', () => {
  assert.match(UrlUtils.getDefaultFaviconUrl(), /icons\/icon48\.png$/);
});
