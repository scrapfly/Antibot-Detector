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
const ctx = vm.createContext({ URL });
vm.runInContext(src.slice(0, src.indexOf('function setupHeaderCapture')) + '\nthis.recordNetworkUrl = recordNetworkUrl; this.tabOfWorkerRequest = tabOfWorkerRequest; this.forgetTabRequests = forgetTabRequests;', ctx);
const { recordNetworkUrl, tabOfWorkerRequest, forgetTabRequests } = ctx;
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

test('a request from the site\'s own service worker goes to the tab scanning that origin', () => {
  // Chrome reports requests a page's service worker makes for it with tabId -1
  // (seen on a betting site whose PWA worker fetched the anti-bot scripts)
  const sw = { tabId: -1, initiator: 'https://bets.example', url: 'https://bets.example/hd-api/external/verify' };
  ctx.detectionStates = new Map([[7, { url: 'https://bets.example/en' }], [8, { url: 'https://other.example/' }]]);
  assert.strictEqual(tabOfWorkerRequest(sw), 7);
  assert.strictEqual(tabOfWorkerRequest({ ...sw, initiator: 'https://unknown.example' }), -1);
  assert.strictEqual(tabOfWorkerRequest({ ...sw, initiator: undefined }), -1);
  // Two tabs scanning the same origin: no guess
  ctx.detectionStates.set(9, { url: 'https://bets.example/live' });
  assert.strictEqual(tabOfWorkerRequest(sw), -1);
});

test('a tab starting a new page forgets what the page before sent and received, once per load', () => {
  // A late beacon of the previous page (or a challenge it solved) was matched as part of the next page's scan
  const two = (a, b) => new Map([[7, a], [8, b]]);
  for (const name of ['payloadStore', 'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore', 'responseStore']) {
    ctx[name] = two([{ url: 'https://a.example/x' }], [{ url: 'https://b.example/x' }]);
  }
  forgetTabRequests(7, 'r1');
  for (const name of ['payloadStore', 'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore', 'responseStore']) {
    assert.equal(ctx[name].has(7), false, name);
    assert.equal(ctx[name].has(8), true, `${name}: other tabs keep theirs`);
  }
  // A redirect of the same load keeps what its earlier hops recorded
  ctx.networkUrlsStore.set(7, [req('https://a.example/challenge', 'main_frame')]);
  forgetTabRequests(7, 'r1');
  assert.equal(ctx.networkUrlsStore.has(7), true);
  forgetTabRequests(7, 'r2');
  assert.equal(ctx.networkUrlsStore.has(7), false, 'the next load starts empty');
  forgetTabRequests(-1, 'r3'); // requests outside a tab
  assert.equal(ctx.networkUrlsStore.size, 1);
});

test('the clear runs first and synchronously, only for top-level pages', () => {
  const setup = src.slice(src.indexOf('function setupHeaderCapture'));
  const first = setup.indexOf('chrome.webRequest.');
  assert.equal(setup.indexOf('chrome.webRequest.onBeforeRequest.addListener', first), first, 'the first listener registered');
  const listener = setup.slice(first, setup.indexOf('\n    );', first));
  assert.match(listener, /forgetTabRequests\(details\.tabId, details\.requestId\)/);
  assert.match(listener, /types: \['main_frame'\]/);
  assert.doesNotMatch(listener, /async|await/);
});
