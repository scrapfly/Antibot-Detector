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
