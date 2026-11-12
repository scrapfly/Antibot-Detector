'use strict';
// The page's HTTP status (3.1.8): the status code of the response that loaded the document a scan reads, shown beside Cache
// on the Detection tab, in each Bulk scan row and its exports, and as the webhook's <HTTP_STATUS>. A block page (403, 429, a
// 503 from a challenge) is itself a signal; a status that is not the document's own is hidden rather than guessed.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const HttpStatus = require('../modules/core/http-status.js');

test('of(): a whole status code from 100 to 599 is known; 304, junk and older results without one are not', () => {
  for (const code of [100, 200, 204, 301, 403, 429, 503, 599]) assert.equal(HttpStatus.of(code), code);
  for (const value of [undefined, null, 0, 99, 600, 304, 200.5, '200', NaN, {}]) assert.equal(HttpStatus.of(value), null, String(value));
});

test('tone(): graphite for 2xx and 3xx, amber for 4xx, red for 5xx, nothing when unknown', () => {
  assert.deepEqual([200, 301, 403, 429, 404, 503, 500, undefined, 304].map(HttpStatus.tone),
    ['ok', 'ok', 'warn', 'warn', 'warn', 'error', 'error', '', '']);
  assert.deepEqual([200, 302, 403, 503, null].map(HttpStatus.isError), [false, false, true, true, false]);
});

// header-capture.js up to its listeners, with the events Chrome sends driven by hand
function capture() {
  const src = read('background/header-capture.js');
  const ctx = vm.createContext({ URL, TextDecoder, Uint8Array, HttpStatus, tabsUsingCache: new Set(), responseStore: new Map(),
    headersStore: new Map(), payloadStore: new Map(), networkUrlsStore: new Map(), requestHeadersStore: new Map(), responseCookiesStore: new Map() });
  vm.runInContext(`${src.slice(0, src.indexOf('function setupHeaderCapture'))}
    this.pageHttpStatus = pageHttpStatus; this.navigationStarted = navigationStarted; this.navigationFailed = navigationFailed;
    this.navigationCommitted = navigationCommitted; this.forgetTabRequests = forgetTabRequests;
    this.tabPageRequests = tabPageRequests;`, ctx);
  const tab = 5;
  return {
    ctx,
    // webRequest.onBeforeRequest (main_frame): the first listener of setupHeaderCapture
    request(requestId) {
      if (ctx.tabPageRequests.get(tab) !== requestId) ctx.navigationStarted(tab);
      ctx.forgetTabRequests(tab, requestId);
    },
    // webRequest.onHeadersReceived (main_frame): the record the capture keeps
    headers(requestId, url, statusCode) { ctx.headersStore.set(tab, { url, headers: {}, statusCode, requestId, timestamp: 0 }); },
    commit(documentId, url, extra = {}) { ctx.navigationCommitted({ tabId: tab, frameId: 0, documentId, url, ...extra }); },
    status(documentId) { return ctx.pageHttpStatus(tab, documentId); }
  };
}

test('a plain load shows its own status, a block page included', () => {
  const page = capture();
  page.request('r1');
  page.headers('r1', 'https://shop.example/', 403);
  page.commit('doc-1', 'https://shop.example/');
  assert.equal(page.status('doc-1'), 403);
  assert.equal(page.status('doc-other'), null, 'another document of the tab');
  assert.equal(page.status(undefined), null, 'a sender without a document id');
});

test('a redirect chain shows the status of its last hop (301 then 200: 200)', () => {
  const page = capture();
  page.request('r1');
  page.headers('r1', 'http://shop.example/', 301);
  page.request('r1'); // the redirect reuses the request id
  page.headers('r1', 'https://shop.example/home', 200);
  page.commit('doc-1', 'https://shop.example/home');
  assert.equal(page.status('doc-1'), 200);
});

test('a page with no response of its own shows none: browser cache, service worker, back/forward cache', () => {
  // Served from the browser's cache or by the site's service worker: the load started, but no headers were reported for it
  const cached = capture();
  cached.request('r1');
  cached.headers('r1', 'https://a.example/', 200);
  cached.commit('doc-1', 'https://a.example/');
  cached.request('r2');
  cached.commit('doc-2', 'https://a.example/');
  assert.equal(cached.status('doc-2'), null, 'the page before\'s 200 is not borrowed');
  assert.equal(cached.status('doc-1'), null, 'and the left page no longer has it either');

  // Restored from the back/forward cache: a commit with no load pending
  const restored = capture();
  restored.request('r1');
  restored.headers('r1', 'https://a.example/', 503);
  restored.commit('doc-1', 'https://a.example/');
  restored.commit('doc-0', 'https://a.example/earlier');
  assert.equal(restored.status('doc-0'), null);
  assert.equal(restored.status('doc-1'), null, 'the tab no longer shows it');
});

test('a prerendered page\'s commit leaves the shown page\'s status alone; a load that committed nothing borrows nothing', () => {
  const page = capture();
  page.request('r1');
  page.headers('r1', 'https://a.example/', 200);
  page.commit('doc-1', 'https://a.example/');
  page.commit('doc-pre', 'https://a.example/next', { documentLifecycle: 'prerender' });
  assert.equal(page.status('doc-1'), 200);
  assert.equal(page.status('doc-pre'), null, 'a prerendered page has no recorded request');

  // A download or a 204: the load fails, the tab keeps showing doc-1, whose headers that load cleared
  page.request('r2');
  page.headers('r2', 'https://a.example/file.zip', 200);
  page.ctx.navigationFailed(5);
  assert.equal(page.status('doc-1'), null, 'never another response\'s status');
});

test('a single-page app\'s later scans keep the status of the document load; a fragment does not matter', () => {
  const page = capture();
  page.request('r1');
  page.headers('r1', 'https://app.example/#/start', 429);
  page.commit('doc-1', 'https://app.example/');
  // history.pushState and fragment changes fire no onCommitted and no main-frame request
  assert.equal(page.status('doc-1'), 429);
});

test('a 304 revalidation shows nothing rather than the 304', () => {
  const page = capture();
  page.request('r1');
  page.headers('r1', 'https://a.example/', 304);
  page.commit('doc-1', 'https://a.example/');
  assert.equal(page.status('doc-1'), null);
});

test('the capture keeps the status and request id with the main-frame headers, in one line', () => {
  const setup = read('background/header-capture.js');
  assert.match(setup, /headersStore\.set\(details\.tabId, \{\n\s+url: details\.url,\n\s+headers: headers,\n\s+statusCode: details\.statusCode, requestId: details\.requestId,/);
});

test('the scan records the status of its document, saves it with the result and hands it on', () => {
  const lifecycle = read('background/detection-lifecycle.js');
  assert.match(lifecycle, /state\.httpStatus = typeof pageHttpStatus === 'function' \? pageHttpStatus\(tabId, sender\.documentId\) : null;/);
  assert.match(lifecycle, /\.\.\.\(state\.httpStatus \? \{ httpStatus: state\.httpStatus \} : \{\}\)/, 'saved with the result');
  assert.match(lifecycle, /BackgroundTabScan\.scanFinished\(tabId, state\.url, finalResults, \{ httpStatus: state\.httpStatus \}\)/, 'a Bulk scan gets it');
  assert.match(lifecycle, /httpStatus: state\.httpStatus\n\s+\}, finalResults, \{ trigger: 'scan' \}\)/, 'the webhook gets it');
  const late = lifecycle.slice(lifecycle.indexOf('async function addLateEvidenceNow'), lifecycle.indexOf('async function finalizeDetection'));
  assert.match(late, /const httpStatus = stored \? stored\.httpStatus/, 'late evidence keeps the status saved with the result');

  const manager = read('modules/detection/engine/detection-engine-manager.js');
  assert.match(manager, /\.\.\.\(Number\.isInteger\(pageData\.httpStatus\) \? \{ httpStatus: pageData\.httpStatus \} : \{\}\)/, 'the cache entry keeps it');
  assert.match(manager, /cacheScope: storedData\.cacheScope,\n\s+\/\/ The page's HTTP status[^\n]*\n\s+httpStatus: storedData\.httpStatus/, 'the tab\'s cached result returns it');
  assert.match(manager, /httpStatus: storedData\.httpStatus\n\s+\}, storedData\.detectionResults, \{ trigger: 'cache' \}\)/, 'a cache hit\'s webhook sends the saved one');

  const tabEvents = read('background/tab-events.js');
  assert.match(tabEvents, /committedPages\.delete\(tabId\)/, 'a closed tab forgets its page');
});

test('BackgroundTabScan passes the status to the Bulk runner only when it is known', async () => {
  const src = read('background/background-tab-scan.js');
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Map, Set, Promise });
  vm.runInContext(`${src}\nthis.BackgroundTabScan = BackgroundTabScan;`, ctx);
  const scan = ctx.BackgroundTabScan;
  const outcomes = [];
  for (const extra of [{ httpStatus: 503 }, {}]) {
    scan._waiters.set(9, { resolve: (value) => outcomes.push(value) });
    scan.scanFinished(9, 'https://a.example/', [], extra);
  }
  assert.equal(outcomes[0].httpStatus, 503);
  assert.equal('httpStatus' in outcomes[1], false);
});
