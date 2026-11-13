'use strict';
// A page that loaded while its capture was refused (its site skipped or left out of "only these sites", or the settings
// unreadable, when it started loading) kept none of its headers, cookies, request bodies or requests, and its JS hooks were never
// installed. The worker remembers such a page by its document (background/uncaptured-pages.js), from the commit that shows it
// (background/header-capture.js), so that turning the site back on while the page stays open does not let a scan of it without a
// reload be cached, recorded and sent as if complete. The record lives in chrome.storage.session too: Chrome stops an idle worker,
// and the person who turns the site back on in Settings and returns to the tab wakes a new one.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

/** chrome.storage.session as Chrome keeps it: memory shared by every worker of the browser session. */
function sessionArea(data = {}) {
  const calls = { get: 0, set: 0 };
  return {
    data, calls, fail: false,
    async get(key) { calls.get++; if (this.fail) throw new Error('session storage did not answer'); return key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {}; },
    async set(items) { calls.set++; if (this.fail) throw new Error('session storage did not answer'); Object.assign(data, JSON.parse(JSON.stringify(items))); }
  };
}

/** A worker's UncapturedPages, in a context of its own (a new worker starts with nothing in memory). */
function worker(session) {
  const context = vm.createContext({ Promise, Map, Set, chrome: session ? { storage: { session } } : {} });
  vm.runInContext(read('background/uncaptured-pages.js'), context, { filename: 'background/uncaptured-pages.js' });
  return vm.runInContext('UncapturedPages', context);
}

// ---- The record

test('a page whose capture was refused is remembered by its document; one that captured, another tab or no document are not', async () => {
  const pages = worker(sessionArea());
  await pages.noteCommit(5, 'doc-skipped', Promise.resolve(false));
  await pages.noteCommit(5, 'doc-normal', Promise.resolve(true));
  assert.equal(await pages.has(5, 'doc-skipped'), true);
  assert.equal(await pages.has(5, 'doc-normal'), false);
  assert.equal(await pages.has(6, 'doc-skipped'), false, 'the document of another tab');
  assert.equal(await pages.has(5, undefined), false, 'nothing to go by');
  assert.equal(await pages.has(5, 'doc-never-seen'), false);
});

test('asked while the verdict of the commit is still being read, the answer waits for it', async () => {
  const pages = worker(sessionArea());
  const verdict = deferred();
  pages.noteCommit(5, 'doc-a', verdict.promise);
  let answer = null;
  pages.has(5, 'doc-a').then((value) => { answer = value; });
  await flush();
  assert.equal(answer, null, 'no answer before the settings were read');
  verdict.resolve(false);
  await flush();
  assert.equal(answer, true);
  // A verdict that cannot be read counts as refused, as the capture itself does
  pages.noteCommit(5, 'doc-b', Promise.reject(new Error('unreadable')));
  assert.equal(await pages.has(5, 'doc-b'), true);
});

test('a page brought back from the back/forward cache is the page that loaded uncaptured, also once its site is scanned again', async () => {
  const pages = worker(sessionArea());
  await pages.noteCommit(5, 'doc-a', Promise.resolve(false)); // loaded while its site was skipped
  await pages.noteCommit(5, 'doc-b', Promise.resolve(true));  // the tab moved on to a scanned page
  await pages.noteCommit(5, 'doc-a', Promise.resolve(true));  // back to the first page, restored, after the site was turned back on
  assert.equal(await pages.has(5, 'doc-a'), true);
  assert.equal(await pages.has(5, 'doc-b'), false);
});

test('a closed tab is forgotten, and the list keeps the newest pages only', async () => {
  const session = sessionArea();
  const pages = worker(session);
  await pages.noteCommit(5, 'doc-a', Promise.resolve(false));
  await pages.noteCommit(6, 'doc-b', Promise.resolve(false));
  await pages.forgetTab(5);
  assert.equal(await pages.has(5, 'doc-a'), false);
  assert.equal(await pages.has(6, 'doc-b'), true, 'another tab keeps its own');
  assert.deepEqual(session.data[pages.STORAGE_KEY], [['doc-b', 6]], 'the stored list too');
  for (let i = 0; i < pages.MAX + 10; i++) await pages.noteCommit(7, `doc-${i}`, Promise.resolve(false));
  assert.equal(session.data[pages.STORAGE_KEY].length, pages.MAX);
  assert.equal(await pages.has(7, 'doc-0'), false, 'the oldest went');
  assert.equal(await pages.has(7, `doc-${pages.MAX + 9}`), true);
});

test('a worker Chrome stopped and started again still knows the page; only tab and document ids are stored, never an address', async () => {
  const session = sessionArea();
  const first = worker(session);
  await first.noteCommit(5, 'doc-a', Promise.resolve(false));
  await first.noteCommit(5, 'doc-b', Promise.resolve(true));
  assert.deepEqual(session.data, { [first.STORAGE_KEY]: [['doc-a', 5]] });
  const second = worker(session); // the same browser session, a new worker with nothing in memory
  assert.equal(await second.has(5, 'doc-a'), true);
  assert.equal(await second.has(5, 'doc-b'), false);
  // What the new worker notes joins what the old one stored, and a closed tab goes from both
  await second.noteCommit(9, 'doc-c', Promise.resolve(false));
  assert.deepEqual(session.data[second.STORAGE_KEY], [['doc-a', 5], ['doc-c', 9]]);
  const third = worker(session);
  await third.forgetTab(5);
  assert.deepEqual(session.data[third.STORAGE_KEY], [['doc-c', 9]]);
  assert.equal(session.calls.get, 3, 'each worker reads the stored list once');
});

test('without session storage, or with one that fails, the worker still knows the pages it saw', async () => {
  const bare = worker(null);
  await bare.noteCommit(5, 'doc-a', Promise.resolve(false));
  assert.equal(await bare.has(5, 'doc-a'), true);
  const session = sessionArea();
  session.fail = true;
  const failing = worker(session);
  await failing.noteCommit(5, 'doc-a', Promise.resolve(false));
  assert.equal(await failing.has(5, 'doc-a'), true);
  await failing.forgetTab(5);
  assert.equal(await failing.has(5, 'doc-a'), false);
  // Stored garbage is not a page
  const odd = sessionArea({ session_uncaptured_pages: [['', 5], ['doc-x', 'five'], 'doc-y', null, ['doc-z', 5]] });
  const reader = worker(odd);
  assert.equal(await reader.has(5, 'doc-z'), true);
  assert.equal(await reader.has(5, ''), false);
});

// ---- Fed by the capture (background/header-capture.js): what commits decides

const SETTINGS_KEY = 'scrapfly_settings';
const SKIP = { detection: { scanMode: 'blocklist', blacklistedDomains: ['skipped.example'] } };

/** The worker's capture listeners with the real settings reader, skip rules and UncapturedPages, around a fake browser. */
function captureWorld({ settings = SKIP, session = sessionArea() } = {}) {
  const local = { [SETTINGS_KEY]: JSON.stringify({ settings }) };
  const state = { raw: null };
  const listeners = { beforeRequest: [], headersReceived: [], beforeSendHeaders: [], committed: [], errorOccurred: [], removed: [] };
  const on = (list) => ({ addListener: (fn, filter) => list.push({ fn, filter }) });
  const unref = (fn, ms) => { const timer = setTimeout(fn, ms); if (timer && timer.unref) timer.unref(); return timer; };
  const context = vm.createContext({
    console, URL, TextDecoder, Uint8Array, JSON, Promise, Date, Math, Set, Map, setTimeout: unref, clearTimeout,
    Logger: new Proxy({}, { get: () => () => {} }),
    chrome: {
      storage: {
        session,
        local: {
          async get(keys) {
            const out = {};
            for (const key of [].concat(keys)) {
              if (key === SETTINGS_KEY && state.raw !== null) out[key] = state.raw;
              else if (key in local) out[key] = local[key];
            }
            return out;
          },
          async set(values) { Object.assign(local, values); }
        }
      },
      webRequest: { onBeforeRequest: on(listeners.beforeRequest), onHeadersReceived: on(listeners.headersReceived), onBeforeSendHeaders: on(listeners.beforeSendHeaders) },
      webNavigation: { onCommitted: on(listeners.committed), onErrorOccurred: on(listeners.errorOccurred) },
      tabs: { get: async () => { throw new Error('No tab with id'); }, onRemoved: on(listeners.removed) }
    },
    isExtensionEnabled: async () => true,
    detectionStates: new Map()
  });
  context.self = context;
  for (const file of ['modules/core/constants.js', 'modules/core/ttl-map.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js',
    'modules/core/storage-manager.js', 'utils/utils.js']) vm.runInContext(read(file), context, { filename: file });
  const runtimeState = read('background/runtime-state.js');
  vm.runInContext(runtimeState.slice(runtimeState.indexOf('const headersStore'), runtimeState.indexOf('// ─── Advanced Capture States')), context, { filename: 'runtime-state.js' });
  vm.runInContext('const tabsUsingCache = new Set(); let cachedEnabledState = { value: true, timestamp: 0 };', context);
  for (const file of ['background/uncaptured-pages.js', 'background/header-capture.js']) vm.runInContext(read(file), context, { filename: file });
  vm.runInContext('setupHeaderCapture();', context);
  const pages = vm.runInContext('UncapturedPages', context);
  const fire = (name, details) => listeners[name]
    .filter((l) => !(l.filter && l.filter.types) || l.filter.types.includes(details.type))
    .map((l) => l.fn(details));
  let sequence = 0;
  const world = {
    context, local, state, pages, session,
    setSettings(next) { local[SETTINGS_KEY] = JSON.stringify({ settings: next }); },
    /** One hop of a page's main-frame request. */
    async request(tabId, url, requestId) {
      await Promise.all(fire('beforeRequest', { tabId, frameId: 0, url, type: 'main_frame', method: 'GET', requestId }));
    },
    /** The page commits as this document (the last hop's address, or a page restored from the back/forward cache). */
    async commit(tabId, url, documentId) {
      await Promise.all(listeners.committed.map((l) => l.fn({ tabId, frameId: 0, url, documentId })));
      await flush();
    },
    /** A page load: its request, then its commit. */
    async load(tabId, url, documentId) {
      await world.request(tabId, url, `nav${++sequence}`);
      await world.commit(tabId, url, documentId);
    }
  };
  return world;
}

test('a page that loaded on a skipped site is remembered; the next page of the tab, on a scanned site, is not', async () => {
  const w = captureWorld();
  await w.load(1, 'https://skipped.example/account', 'doc-1');
  await w.load(1, 'https://shop.example/', 'doc-2');
  assert.equal(await w.pages.has(1, 'doc-1'), true);
  assert.equal(await w.pages.has(1, 'doc-2'), false);
  // "Only these sites": a site that is not chosen
  const only = captureWorld({ settings: { detection: { scanMode: 'allowlist', allowedDomains: ['shop.example'] } } });
  await only.load(2, 'https://bank.example/', 'doc-3');
  await only.load(3, 'https://www.shop.example/', 'doc-4');
  assert.equal(await only.pages.has(2, 'doc-3'), true);
  assert.equal(await only.pages.has(3, 'doc-4'), false);
});

test('the site turned back on while its page stays open: that page is still one that kept nothing', async () => {
  const w = captureWorld();
  await w.load(1, 'https://skipped.example/', 'doc-1');
  w.setSettings({ detection: { scanMode: 'blocklist', blacklistedDomains: [] } }); // Settings, or Resume without a reload
  assert.equal(await w.pages.has(1, 'doc-1'), true);
  // The page loaded again is another document: it captures and is not remembered
  await w.load(1, 'https://skipped.example/', 'doc-2');
  assert.equal(await w.pages.has(1, 'doc-2'), false);
});

test('a page that loaded while the settings could not be read is remembered, as its capture was refused', async () => {
  const w = captureWorld();
  w.state.raw = '{ not json';
  await w.load(1, 'https://shop.example/', 'doc-1');
  w.state.raw = null;
  assert.equal(await w.pages.has(1, 'doc-1'), true);
});

test('a redirect is judged by the page it ends on', async () => {
  const w = captureWorld();
  await w.request(1, 'https://skipped.example/login', 'load-1');
  await w.request(1, 'https://shop.example/home', 'load-1');
  await w.commit(1, 'https://shop.example/home', 'doc-1');
  assert.equal(await w.pages.has(1, 'doc-1'), false);
  await w.request(2, 'https://shop.example/out', 'load-2');
  await w.request(2, 'https://skipped.example/in', 'load-2');
  await w.commit(2, 'https://skipped.example/in', 'doc-2');
  assert.equal(await w.pages.has(2, 'doc-2'), true);
});

test('a page restored from the back/forward cache after its site was turned back on is still remembered', async () => {
  const w = captureWorld();
  await w.load(1, 'https://skipped.example/a', 'doc-a');
  await w.load(1, 'https://shop.example/b', 'doc-b');
  w.setSettings({ detection: { scanMode: 'blocklist', blacklistedDomains: [] } });
  await w.commit(1, 'https://skipped.example/a', 'doc-a'); // back: no request, the same document
  assert.equal(await w.pages.has(1, 'doc-a'), true);
  assert.equal(await w.pages.has(1, 'doc-b'), false);
});

test('the extension switched off: nothing is judged and nothing remembered (its pages have no content script to scan them)', async () => {
  const w = captureWorld();
  vm.runInContext('cachedEnabledState = { value: false, timestamp: Date.now() }', w.context);
  await w.load(1, 'https://skipped.example/', 'doc-1');
  assert.equal(await w.pages.has(1, 'doc-1'), false);
  assert.deepEqual(w.session.data, {}, 'nothing stored');
});

test('a prerendered page shown on a skipped site is remembered; one on a scanned site, or with the extension off, is not', async () => {
  const w = captureWorld();
  await w.load(1, 'https://shop.example/', 'doc-1');
  // Chrome prerendered the next page under the tab (a request of its own frame, never the tab's page), then showed it
  vm.runInContext("activatePrerenderedPage(1, 'https://skipped.example/account', 'doc-pre')", w.context);
  await flush();
  assert.equal(await w.pages.has(1, 'doc-pre'), true, 'its capture was refused: a scan of it in place would be incomplete');
  w.setSettings({ detection: { scanMode: 'blocklist', blacklistedDomains: [] } }); // the site turned back on while it stays
  assert.equal(await w.pages.has(1, 'doc-pre'), true);
  vm.runInContext("activatePrerenderedPage(1, 'https://shop.example/next', 'doc-pre-2')", w.context);
  await flush();
  assert.equal(await w.pages.has(1, 'doc-pre-2'), false);
  const off = captureWorld();
  vm.runInContext('cachedEnabledState = { value: false, timestamp: Date.now() }', off.context);
  vm.runInContext("activatePrerenderedPage(2, 'https://skipped.example/', 'doc-off')", off.context);
  await flush();
  assert.equal(await off.pages.has(2, 'doc-off'), false);
});

test('the page of a closed tab is forgotten, through the tab clean-up the worker runs', () => {
  const source = read('background/tab-events.js');
  const removed = source.slice(source.indexOf('chrome.tabs.onRemoved.addListener'), source.indexOf('chrome.tabs.onUpdated.addListener'));
  assert.match(removed, /UncapturedPages\.forgetTab\(tabId\)/);
  const imports = read('background.js');
  assert.ok(imports.indexOf("'./background/uncaptured-pages.js'") > 0 && imports.indexOf("'./background/uncaptured-pages.js'") < imports.indexOf("'./background/header-capture.js'"),
    'the worker loads the record before the capture that feeds it');
});
