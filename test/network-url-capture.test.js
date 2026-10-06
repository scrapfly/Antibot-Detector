const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// URL rules read the per-tab list of request URLs. Busy pages fire hundreds
// of requests (one site in testing fired over 20 identical tracking beacons),
// and the old first-in-first-out cap of 200 dropped the oldest ones: exactly
// the security SDKs, which load first. Repeats are now stored once and, at
// the cap, low-value request types go before scripts and API calls.

const src = fs.readFileSync(path.join(__dirname, '..', 'background/header-capture.js'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(src.slice(0, src.indexOf('function setupHeaderCapture')) + '\nthis.recordNetworkUrl = recordNetworkUrl;', ctx);
const { recordNetworkUrl } = ctx;
const req = (url, type = 'image', method = 'GET') => ({ url, type, method, timestamp: 0 });

test('repeats of the same request are stored once', () => {
  const list = [];
  for (let i = 0; i < 50; i++) recordNetworkUrl(list, req('https://www.facebook.com/tr/', 'image'), 10);
  recordNetworkUrl(list, req('https://www.facebook.com/tr/', 'image', 'POST'), 10);
  assert.strictEqual(list.length, 2);
});

test('an early vendor script survives a page full of later images and pings', () => {
  const list = [];
  recordNetworkUrl(list, req('https://fpnpmcdn.net/v3/KEY/loader_v3.11.9.js', 'script'), 20);
  recordNetworkUrl(list, req('https://api.fpjs.io/?ci=js/3.12.15', 'xmlhttprequest', 'POST'), 20);
  for (let i = 0; i < 500; i++) recordNetworkUrl(list, req(`https://cdn.example/img/${i}.png`, i % 2 ? 'image' : 'ping'), 20);
  assert.strictEqual(list.length, 20);
  assert.ok(list.some(r => r.url.includes('fpnpmcdn.net')), 'vendor script kept');
  assert.ok(list.some(r => r.url.includes('api.fpjs.io')), 'vendor API call kept');
});

test('with only scripts left, the oldest goes first', () => {
  const list = [];
  for (let i = 0; i < 5; i++) recordNetworkUrl(list, req(`https://x.example/${i}.js`, 'script'), 3);
  assert.deepStrictEqual(list.map(r => r.url), ['https://x.example/2.js', 'https://x.example/3.js', 'https://x.example/4.js']);
});
