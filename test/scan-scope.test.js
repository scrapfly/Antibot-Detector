const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.self = global;
const DomainList = require('../modules/core/domain-list.js');
const ScanScope = require('../modules/core/scan-scope.js');

// Settings → Detection → Sites: either every site except the skipped ones, or only the chosen sites.

const blocklist = (...domains) => ({ scanMode: 'blocklist', blacklistedDomains: domains, allowedDomains: ['ignored.example'] });
const allowlist = (...domains) => ({ scanMode: 'allowlist', allowedDomains: domains, blacklistedDomains: ['ignored.example'] });

test('the mode defaults to the skipped-sites list, and each mode edits its own list', () => {
  for (const detection of [undefined, null, {}, { scanMode: 'bogus' }, { scanMode: 'blocklist' }]) assert.strictEqual(ScanScope.modeOf(detection), 'blocklist');
  assert.strictEqual(ScanScope.modeOf({ scanMode: 'allowlist' }), 'allowlist');
  assert.strictEqual(ScanScope.listKeyOf({}), 'blacklistedDomains');
  assert.strictEqual(ScanScope.listKeyOf({ scanMode: 'allowlist' }), 'allowedDomains');
  assert.deepStrictEqual([...ScanScope.MODES], ['blocklist', 'allowlist']);
});

test('blocklist: every site is scanned except the exact hosts on the list', () => {
  const d = blocklist('skip.example', 'www.news.example');
  assert.strictEqual(ScanScope.isExcluded('https://skip.example/page?x=1', d), true);
  assert.strictEqual(ScanScope.isExcluded('http://www.news.example/', d), true);
  assert.strictEqual(ScanScope.isExcluded('https://news.example/', d), false, 'the list holds exact hosts');
  assert.strictEqual(ScanScope.isExcluded('https://sub.skip.example/', d), false);
  assert.strictEqual(ScanScope.isExcluded('https://other.example/', d), false);
  assert.strictEqual(ScanScope.isExcluded('https://other.example/', {}), false);
  assert.strictEqual(ScanScope.isExcluded('https://ignored.example/', d), false, 'the allowed list means nothing in this mode');
});

test('allowlist: only the listed sites and their subdomains are scanned', () => {
  const d = allowlist('Shop.Example', 'https://www.bank.example/path');
  assert.strictEqual(ScanScope.isExcluded('https://shop.example/', d), false);
  assert.strictEqual(ScanScope.isExcluded('https://www.shop.example/cart', d), false);
  assert.strictEqual(ScanScope.isExcluded('http://a.b.shop.example:8080/x', d), false);
  assert.strictEqual(ScanScope.isExcluded('https://bank.example/', d), true, 'www.bank.example was listed, not bank.example');
  assert.strictEqual(ScanScope.isExcluded('https://www.bank.example/', d), false);
  assert.strictEqual(ScanScope.isExcluded('https://notshop.example/', d), true, 'a lookalike is not the site');
  assert.strictEqual(ScanScope.isExcluded('https://shop.example.evil.io/', d), true);
  assert.strictEqual(ScanScope.isExcluded('https://ignored.example/', d), true, 'the skipped list means nothing in this mode');
});

test('an empty allowlist scans no web page at all', () => {
  assert.strictEqual(ScanScope.isExcluded('https://anything.example/', { scanMode: 'allowlist', allowedDomains: [] }), true);
  assert.strictEqual(ScanScope.isExcluded('https://anything.example/', { scanMode: 'allowlist' }), true);
});

test('pages that are not web pages, empty addresses and broken ones are not decided by either list', () => {
  for (const mode of [allowlist('shop.example'), blocklist('shop.example')]) {
    for (const url of ['chrome://extensions/', 'about:blank', 'chrome-extension://abc/popup.html', 'file:///tmp/a.html', 'data:text/html,hi', '', undefined, null, 'not a url']) {
      assert.strictEqual(ScanScope.isExcluded(url, mode), false, String(url));
    }
  }
});

test('DomainList is the one place a list of sites is read and matched', () => {
  assert.deepStrictEqual(DomainList.normalize('Example.com\nhttps://user@Shop.Example.org:8443/path?q=1, *.cdn.net;  .dotted.io. example.com'), ['example.com', 'shop.example.org', 'cdn.net', 'dotted.io']);
  assert.deepStrictEqual(DomainList.normalize(['A.com', ' b.com ', '', 'a.com']), ['a.com', 'b.com']);
  assert.deepStrictEqual(DomainList.normalize('<script>, a$b, ok.dev'), ['ok.dev']);
  assert.strictEqual(DomainList.matches('WWW.Example.com', ['example.com']), true);
  assert.strictEqual(DomainList.matches('a.b.example.com.', 'example.com'), true);
  assert.strictEqual(DomainList.matches('notexample.com', ['example.com']), false);
  assert.strictEqual(DomainList.matches('', ['example.com']), false);
  const policy = require('../modules/core/history-policy.js');
  assert.strictEqual(policy.normalizeDomains, DomainList.normalize, 'History uses the same function');
  assert.strictEqual(policy.matchesDomain, DomainList.matches);
});

test('Utils.isUrlBlacklisted asks the scope: it reads the mode and the list from the saved settings', async () => {
  const context = vm.createContext({ console, URL, Logger: { error() {}, debug() {}, warn() {} }, Constants: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/core/domain-list.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/core/scan-scope.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../utils/utils.js'), 'utf8') + '\nthis.Utils = Utils;', context);
  const check = async (settings, url) => { context.Utils.getSettings = async () => settings; return context.Utils.isUrlBlacklisted(url); };
  assert.strictEqual(await check({ detection: { blacklistedDomains: ['skip.example'] } }, 'https://skip.example/'), true);
  assert.strictEqual(await check({ blacklistedDomains: ['legacy.example'] }, 'https://legacy.example/'), true, 'the flat list of older versions still counts');
  assert.strictEqual(await check({ detection: { scanMode: 'allowlist', allowedDomains: ['ok.example'] } }, 'https://ok.example/'), false);
  assert.strictEqual(await check({ detection: { scanMode: 'allowlist', allowedDomains: ['ok.example'] } }, 'https://other.example/'), true);
  assert.strictEqual(await check({}, 'https://any.example/'), false);
  assert.strictEqual(await check({ detection: { scanMode: 'allowlist' } }, ''), false);
});
