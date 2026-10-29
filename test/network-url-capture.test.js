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
const ctx = vm.createContext({ URL, TextDecoder, Uint8Array });
vm.runInContext(src.slice(0, src.indexOf('function setupHeaderCapture')) + '\nthis.recordNetworkUrl = recordNetworkUrl; this.tabOfWorkerRequest = tabOfWorkerRequest; this.forgetTabRequests = forgetTabRequests; this.isPrerenderRequest = isPrerenderRequest; this.readRequestBody = readRequestBody; this.isOtherPageRequest = isOtherPageRequest; this.noteTabLeaving = noteTabLeaving; this.navigationStarted = navigationStarted; this.navigationFailed = navigationFailed; this.navigationCommitted = navigationCommitted;', ctx);
const { recordNetworkUrl, tabOfWorkerRequest, forgetTabRequests, isPrerenderRequest, readRequestBody, isOtherPageRequest, noteTabLeaving, navigationStarted, navigationFailed, navigationCommitted } = ctx;
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
  assert.match(listener, /if \(isPrerenderRequest\(details\)\) return;/);
  assert.match(listener, /forgetTabRequests\(details\.tabId, details\.requestId\)/);
  assert.match(listener, /types: \['main_frame'\]/);
  assert.doesNotMatch(listener, /async|await/);
});

test('a new page clears the "showing a cached result" flag before its headers arrive', () => {
  // The flag was cleared only when the tab's address changed, after the next page's response headers and
  // Set-Cookie had already been dropped as "cached"
  ctx.tabsUsingCache = new Set([7, 8]);
  forgetTabRequests(7, 'r10');
  assert.equal(ctx.tabsUsingCache.has(7), false, 'the new page captures its headers');
  assert.equal(ctx.tabsUsingCache.has(8), true, 'other tabs keep theirs');
  // A redirect of the same load does not clear a flag the new page's own cache hit set
  ctx.tabsUsingCache.add(7);
  forgetTabRequests(7, 'r10');
  assert.equal(ctx.tabsUsingCache.has(7), true);
});

test('requests of a page Chrome is prerendering leave the visible page\'s capture alone', () => {
  // A speculation-rules prerender reports its main-frame request under the visible tab's id
  assert.equal(isPrerenderRequest({ tabId: 7, type: 'main_frame', documentLifecycle: 'prerender' }), true);
  assert.equal(isPrerenderRequest({ tabId: 7, type: 'main_frame', documentLifecycle: 'active' }), false);
  assert.equal(isPrerenderRequest({ tabId: 7, type: 'main_frame' }), false, 'older Chrome without the field');
  // Every capture listener checks it first
  const setup = src.slice(src.indexOf('function setupHeaderCapture'));
  const listeners = setup.split(/chrome\.webRequest\.\w+\.addListener\(/).slice(1);
  assert.equal(listeners.length, 5);
  assert.match(listeners[0], /isPrerenderRequest\(details\)/, 'the clear');
  for (const body of listeners.slice(1)) assert.match(body, /isOtherPageRequest\(details\)/, 'every capture listener');
});

test('requests of the page the tab is leaving (unload beacons, last analytics) are not credited to the next page', () => {
  const tab = 31;
  const req = (extra) => ({ tabId: tab, frameId: 0, type: 'xmlhttprequest', documentLifecycle: 'active', ...extra });
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A' })), false, 'the shown page');
  noteTabLeaving(tab); // a new page starts loading
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A', type: 'ping' })), true, 'a beacon of the page being left');
  assert.equal(isOtherPageRequest({ tabId: tab, frameId: 4, parentDocumentId: 'doc-A', documentLifecycle: 'active' }), true, 'a frame of it');
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A', documentLifecycle: 'pending_deletion' })), true, 'unloading');
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-B' })), false, 'the new page');
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A', tabId: 32 })), false, 'another tab is not affected');
  assert.equal(isOtherPageRequest({ tabId: tab, type: 'main_frame', frameId: 0 }), false, 'the new page\'s own request');
});

test('a navigation that does not replace the page ends the "page being left" mark: the page keeps its requests and still knows it is the page a later navigation leaves', () => {
  const tab = 33;
  const req = (extra) => ({ tabId: tab, frameId: 0, type: 'xmlhttprequest', documentLifecycle: 'active', ...extra });
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A' })), false);
  navigationStarted(tab); // a click starts a navigation
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A' })), true, 'while the navigation is pending');
  navigationFailed(tab); // it was a download, a 204 or a cancelled load: page A stays
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A' })), false, 'page A still shown: its requests count again');
  navigationStarted(tab); // a real navigation later
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A', type: 'ping' })), true, 'A is known as the page being left, so its unload beacons are not the next page\'s');
  navigationFailed('not a tab id'); // an event without a tab changes nothing
});

test('a navigation superseded by another does not end the mark that protects the second', () => {
  const tab = 36;
  const req = (extra) => ({ tabId: tab, frameId: 0, type: 'xmlhttprequest', documentLifecycle: 'active', ...extra });
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A' })), false);
  navigationStarted(tab); // B
  navigationStarted(tab); // C replaces B (a script redirect)
  navigationFailed(tab);  // B is cancelled
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A', type: 'ping' })), true, 'A is still being left for C');
  navigationCommitted({ tabId: tab, frameId: 0, documentId: 'doc-C' });
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-C' })), false, 'C is shown');
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A', type: 'ping' })), false, 'the mark is over (Chrome marks the unloading page itself)');
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A', documentLifecycle: 'pending_deletion' })), true);
});

test('only the new page\'s commit ends the mark, not a prerendered page\'s or the left page\'s own', () => {
  const tab = 37;
  const req = (extra) => ({ tabId: tab, frameId: 0, type: 'xmlhttprequest', documentLifecycle: 'active', ...extra });
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A' })), false);
  navigationStarted(tab);
  navigationCommitted({ tabId: tab, frameId: 0, documentId: 'doc-P', documentLifecycle: 'prerender' });
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A' })), true, 'a prerendered page\'s commit is not the navigation');
  navigationCommitted({ tabId: tab, frameId: 0, documentId: 'doc-A' });
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A' })), true, 'a commit of the left page itself is not the new page');
  navigationCommitted({ tabId: tab, frameId: 0, documentId: 'doc-B' });
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-B' })), false);
});

test('a prerendered page just activated is not the page being left', () => {
  const tab = 34;
  const req = (extra) => ({ tabId: tab, frameId: 0, type: 'xmlhttprequest', documentLifecycle: 'active', ...extra });
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A' })), false);
  // Activated: the new page sent a request before the worker handled its page load, so the tab already names it
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-P' })), false);
  noteTabLeaving(tab, 'doc-P');
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-P' })), false, 'the activated page keeps its later requests');
  // The page before it, still named by the tab, is the one being left
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A2', tabId: 35 })), false);
  noteTabLeaving(35, 'doc-P2');
  assert.equal(isOtherPageRequest(req({ documentId: 'doc-A2', tabId: 35 })), true, 'the old page of a tab that has not seen the new one yet');
});

test('the main frame\'s commit and failure events are registered, and a started navigation is counted', () => {
  assert.match(src, /webNavigation\.onCommitted\.addListener\(\(details\) => \{ if \(details && details\.frameId === 0\) navigationCommitted\(details\)/);
  assert.match(src, /webNavigation\.onErrorOccurred\.addListener\(\(details\) => \{ if \(details && details\.frameId === 0\) navigationFailed\(details\.tabId\)/);
  assert.match(src, /navigationStarted\(details\.tabId\); \/\/ not a redirect/);
});

test('request bodies are kept to the captured-response limit', () => {
  const bytes = (text) => new TextEncoder().encode(text).buffer;
  // A multi-megabyte upload was decoded whole and held per tab
  const big = readRequestBody({ raw: [{ bytes: bytes('a'.repeat(3 * 1024 * 1024)) }] }, 65536);
  assert.equal(big.payloadType, 'raw');
  assert.equal(big.payloadData.length, 65536);
  // Small bodies and several parts are unchanged; multi-byte characters still decode
  assert.equal(readRequestBody({ raw: [{ bytes: bytes('{"a":') }, { file: 'x' }, { bytes: bytes('"é€"}') }] }, 65536).payloadData, '{"a":"é€"}');
  assert.equal(readRequestBody({ raw: [{ bytes: bytes('ééééé') }] }, 3).payloadData, 'ééé');
  // Form fields share the limit
  const form = readRequestBody({ formData: { a: ['x'.repeat(10)], b: ['y'.repeat(10), 'z'], c: ['w'] } }, 15);
  assert.equal(form.payloadType, 'formData');
  assert.deepEqual(JSON.parse(JSON.stringify(form.payloadData)), { a: ['x'.repeat(10)], b: ['yyyyy', ''] });
  assert.deepEqual(JSON.parse(JSON.stringify(readRequestBody({ formData: { k: ['v'] } }, 100).payloadData)), { k: ['v'] });
  assert.equal(readRequestBody({}, 100).payloadData, null);
  assert.equal(readRequestBody(undefined, 100).payloadData, null);
});
