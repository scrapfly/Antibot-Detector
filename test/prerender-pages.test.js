'use strict';
// Pages Chrome prerenders (speculation rules, the address bar guessing the next page) load and run before anyone sees them, in
// a document of their own that is not the tab's page yet. 3.1.8 kept them from replacing the shown page's capture, but the
// page itself lost what it did while hidden: its JS hook and window reports were refused by the worker (they came from a frame
// that was not the tab's frame 0) and its main-frame response headers, Set-Cookie, request headers and HTTP status were never
// kept. Now the content script holds its reports until the page is shown (modules/core/prerender-outbox.js), the worker keeps
// the page's own load aside per tab and gives it to the tab when the page is shown (header-capture.js), and a report that
// left just before the page was shown is accepted once Chrome confirms the page is the tab's (messages-detection.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const PrerenderOutbox = require('../modules/core/prerender-outbox.js');
const WorkerMessages = require('../modules/core/worker-messages.js');
const HttpStatus = require('../modules/core/http-status.js');

// ─── The content script: held while prerendered ─────────────────────────────────────────────────────────────

function prerenderedDocument(prerendering = true) {
  const listeners = [];
  return {
    prerendering,
    listeners,
    addEventListener: (type, callback, options) => listeners.push({ type, callback, options }),
    show() {
      this.prerendering = false;
      for (const listener of listeners.filter(item => item.type === 'prerenderingchange')) listener.callback();
    }
  };
}

function outbox({ prerendering = true, max } = {}) {
  const document = prerenderedDocument(prerendering);
  const sent = [];
  const box = PrerenderOutbox.create({
    document,
    send: async (message) => { sent.push(message); return { answer: message.type }; },
    shownMessage: () => ({ type: WorkerMessages.PRERENDER_SHOWN, url: 'https://next.example/' }),
    max
  });
  return { document, sent, box };
}

test('a prerendered page\'s reports wait until it is shown, then follow the notice that it is, in their order', async () => {
  const page = outbox();
  const answers = [page.box.send({ type: 'JS_HOOK_DETECTION_BATCH', n: 1 }), page.box.send({ type: 'WINDOW_DETECTIONS' }),
    page.box.send({ type: 'JS_HOOKS_COMPLETE' })];
  let started = 0;
  page.box.whenShown(() => { started++; assert.equal(page.sent.length, 4, 'the scan starts after the held reports went out'); });
  await flush();
  assert.deepEqual(page.sent, [], 'nothing reaches the worker while the page is hidden');
  assert.equal(page.box.holding(), true);
  assert.equal(page.document.listeners.length, 1);
  assert.equal(page.document.listeners[0].options.once, true);

  page.document.show();
  await flush();
  assert.deepEqual(page.sent.map(message => message.type),
    ['PRERENDER_SHOWN', 'JS_HOOK_DETECTION_BATCH', 'WINDOW_DETECTIONS', 'JS_HOOKS_COMPLETE']);
  assert.equal(started, 1);
  assert.deepEqual(await Promise.all(answers), [{ answer: 'JS_HOOK_DETECTION_BATCH' }, { answer: 'WINDOW_DETECTIONS' }, { answer: 'JS_HOOKS_COMPLETE' }],
    'each caller gets the worker\'s own answer (the completion relays retry on a failure)');
  assert.equal(page.box.holding(), false);

  await page.box.send({ type: 'RESPONSE_BODY' });
  assert.equal(page.sent.at(-1).type, 'RESPONSE_BODY', 'once shown, straight to the worker');
  page.box.whenShown(() => started++);
  assert.equal(started, 2, 'a caller after the page was shown runs at once');
});

test('a visible page sends at once and sends no notice; a worker that does not answer the notice still gets the reports', async () => {
  const visible = outbox({ prerendering: false });
  await visible.box.send({ type: 'WINDOW_DETECTIONS' });
  assert.deepEqual(visible.sent.map(message => message.type), ['WINDOW_DETECTIONS']);
  assert.equal(visible.document.listeners.length, 0);

  const document = prerenderedDocument();
  const sent = [];
  const box = PrerenderOutbox.create({
    document,
    send: async (message) => {
      sent.push(message.type);
      if (message.type === WorkerMessages.PRERENDER_SHOWN) throw new Error('Receiving end does not exist');
      return 'ok';
    },
    shownMessage: () => ({ type: WorkerMessages.PRERENDER_SHOWN })
  });
  const answer = box.send({ type: 'JS_HOOKS_COMPLETE' });
  document.show();
  assert.equal(await answer, 'ok');
  assert.deepEqual(sent, ['PRERENDER_SHOWN', 'JS_HOOKS_COMPLETE']);
});

test('a page that reports a lot while hidden is held within bounds; its completions are never the ones dropped', async () => {
  const page = outbox({ max: 3 });
  const complete = page.box.send({ type: 'JS_HOOKS_COMPLETE' });
  const first = page.box.send({ type: 'JS_HOOK_DETECTION_BATCH', n: 1 });
  page.box.send({ type: 'JS_HOOK_DETECTION_BATCH', n: 2 });
  page.box.send({ type: 'JS_HOOK_DETECTION_BATCH', n: 3 });
  assert.equal(await first, undefined, 'the oldest batch made room');
  page.document.show();
  await flush();
  assert.deepEqual(page.sent.map(message => message.n || message.type), ['PRERENDER_SHOWN', 'JS_HOOKS_COMPLETE', 2, 3]);
  assert.deepEqual(await complete, { answer: 'JS_HOOKS_COMPLETE' });
});

test('the content script sends its hook, window and response reports through the outbox, and starts its scan after it', () => {
  const content = read('content.js');
  assert.match(content, /PrerenderOutbox\.create\(\{[\s\S]*?shownMessage: \(\) => \(\{ type: WorkerMessages\.PRERENDER_SHOWN/);
  assert.match(content, /createHookBatcher\(workerChrome\)/, 'hook batches');
  assert.match(content, /handleHookMessage\(\{ source: window, data \}, workerChrome,/, 'the hooks and window completions');
  for (const type of ['WINDOW_DETECTIONS', 'RESPONSE_BODY', 'HOOK_FAILURE_REPORT']) {
    assert.match(content, new RegExp(`workerOutbox\\.send\\(\\{\\s*type: BRIDGE_TYPES\\.${type},`), type);
  }
  assert.doesNotMatch(content, /chrome\.runtime\.sendMessage\(\{\s*type: BRIDGE_TYPES\.(WINDOW_DETECTIONS|RESPONSE_BODY|JS_HOOK_DETECTION_BATCH)/);
  const whenPageShown = content.match(/function whenPageShown\([^)]*\) \{[\s\S]*?\n\}/)[0];
  assert.match(whenPageShown, /workerOutbox\.whenShown\(/);

  const isolated = JSON.parse(read('manifest.json')).content_scripts.find(entry => entry.world !== 'MAIN').js;
  assert.ok(isolated.indexOf('modules/core/worker-messages.js') < isolated.indexOf('modules/core/prerender-outbox.js'));
  assert.ok(isolated.indexOf('modules/core/prerender-outbox.js') < isolated.indexOf('content.js'));
});

// ─── The worker: reports of the page just shown ─────────────────────────────────────────────────────────────

function worker() {
  const current = { url: 'https://next.example/', documentId: 'doc-next' };
  const activated = [];
  const context = {
    MessageSender: require('../modules/core/message-sender.js'), WorkerMessages,
    URL, Map, Set, Date, Promise, AbortController, console,
    Logger: new Proxy({}, { get: () => () => {} }),
    cachedHooksConfig: { MAX_DETECTION_MS: 100 }, getHooksDeadline: now => now + 100,
    workerKeepaliveManager: null, Constants: {},
    setTimeout: () => 1, clearTimeout: () => {},
    chrome: { webNavigation: { getFrame: async () => ({ ...current }) } },
    detectorManager: { getDetector: () => ({ id: 'detect-demo', name: 'Demo' }), findDetectorById: () => null },
    ensureDetectorManagerInitialized: async () => {},
    DetectionEngineManager: { getStoredDetection: async () => null, scansFresh: () => false },
    checkAndFinalizeDetection: () => {},
    markMethodComplete: (tabId, method) => context.detectionStates.get(tabId)?.completedMethods.add(method),
    activatePrerenderedPage: (...args) => { activated.push(args); return true; }
  };
  for (const key of ['detectionStates', 'activeDetections', 'interruptedDetections', 'finalizationDebounce', 'batchProcessingFlags',
    'payloadStore', 'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore', 'recentDetectionRequests']) context[key] = new Map();
  context.tabsUsingCache = new Set();
  vm.createContext(context);
  for (const file of ['modules/core/bridge-protocol.js', 'modules/core/categories.js', 'background/detection-session-store.js', 'background/handlers/messages-detection.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const registry = {};
  context.registerDetectionHandlers(registry, {});
  const send = async (type, request, sender) => {
    let response;
    registry[type]({ request, sender, sendResponse: value => { response = value; }, context: {} });
    await flush(); await flush();
    return response;
  };
  // A message the page sent while Chrome still named it by its own frame: Chrome gives a prerendered page a frame id of its own
  const sender = (extra = {}) => ({ frameId: 3, documentLifecycle: 'active', url: current.url, documentId: current.documentId, tab: { id: 7, url: current.url }, ...extra });
  const hookBatch = { detections: [{ detection: { detectorId: 'detect-demo', category: 'fingerprint', detectorName: 'Demo', hook: { target: 'HTMLCanvasElement.prototype.toDataURL', confidence: 80 } } }] };
  return { context, current, activated, send, sender, hookBatch };
}

test('a hook batch the page sent as it was being shown counts once Chrome confirms that page is the tab\'s', async () => {
  const w = worker();
  await w.send('JS_HOOK_DETECTION_BATCH', w.hookBatch, w.sender());
  const state = w.context.detectionStates.get(7);
  assert.ok(state, 'the batch was accepted');
  assert.ok(state.hooksData.has('detect-demo'), 'and its evidence kept');
  assert.equal(state.documentId, 'doc-next');
});

test('a page still being prerendered, another frame, or a page no longer shown cannot report', async () => {
  for (const [why, extra] of [
    ['still prerendering', { documentLifecycle: 'prerender' }],
    ['still prerendering, even as frame 0', { frameId: 0, documentLifecycle: 'prerender' }],
    ['a frame with no document id', { documentId: undefined }],
    ['a frame that is not the tab\'s top document', { documentId: 'doc-iframe' }]
  ]) {
    const w = worker();
    await w.send('JS_HOOK_DETECTION_BATCH', w.hookBatch, w.sender(extra));
    assert.equal(w.context.detectionStates.has(7), false, why);
    assert.equal((await w.send('JS_HOOKS_COMPLETE', { url: w.current.url }, w.sender(extra))).status, 'url_changed', why);
  }
  const w = worker();
  w.context.chrome.webNavigation.getFrame = undefined;
  await w.send('WINDOW_DETECTIONS', { detections: [] }, w.sender());
  assert.equal(w.context.detectionStates.has(7), false, 'unconfirmed: Chrome could not say which document the tab shows');
});

test('PRERENDER_SHOWN hands the tab to the page that is shown, and only to it', async () => {
  const w = worker();
  const shown = await w.send(WorkerMessages.PRERENDER_SHOWN, { url: w.current.url }, w.sender({ frameId: 0 }));
  assert.deepEqual({ ...shown }, { status: 'ok', adopted: true });
  assert.deepEqual(JSON.parse(JSON.stringify(w.activated)), [[7, 'https://next.example/', 'doc-next']]);
  const stale = await w.send(WorkerMessages.PRERENDER_SHOWN, { url: w.current.url }, w.sender({ frameId: 0, documentId: 'doc-gone' }));
  assert.equal(stale.status, 'url_changed');
  const hidden = await w.send(WorkerMessages.PRERENDER_SHOWN, { url: w.current.url }, w.sender({ documentLifecycle: 'prerender' }));
  assert.equal(hidden.status, 'url_changed');
  assert.equal(w.activated.length, 1);
});

// ─── The worker: the page's own load, kept aside ────────────────────────────────────────────────────────────

function capture({ skipped = [], enabled = true } = {}) {
  const src = read('background/header-capture.js');
  const ctx = vm.createContext({
    URL, TextDecoder, Uint8Array, HttpStatus, Date, Promise,
    tabsUsingCache: new Set(), responseStore: new Map(),
    headersStore: new Map(), payloadStore: new Map(), networkUrlsStore: new Map(), requestHeadersStore: new Map(), responseCookiesStore: new Map(),
    isExtensionEnabled: async () => enabled,
    Utils: { isUrlBlacklisted: async (url) => skipped.some(host => new URL(url).hostname === host) }
  });
  vm.runInContext(`${src.slice(0, src.indexOf('function setupHeaderCapture'))}
    Object.assign(this, { pageHttpStatus, navigationStarted, navigationCommitted, forgetTabRequests, tabPageRequests, keepPrerenderMainFrame,
      notePrerenderCommit, activatePrerenderedPage, prerenderShownHandled, forgetPrerenderPages, prerenderPages, isOtherPageRequest,
      PRERENDER_PAGES_PER_TAB, PRERENDER_PAGE_TTL_MS });`, ctx);
  const tab = 5;
  return {
    ctx,
    // The shown page's own load: onBeforeRequest, onHeadersReceived and onCommitted in its frame 0
    async shownPage(url, documentId, statusCode = 200) {
      ctx.navigationStarted(tab);
      ctx.forgetTabRequests(tab, 'r-shown');
      ctx.headersStore.set(tab, { url, headers: { server: 'shown' }, statusCode, requestId: 'r-shown', timestamp: 0 });
      ctx.navigationCommitted({ tabId: tab, frameId: 0, documentId, url, documentLifecycle: 'active' });
    },
    // A prerendered page's main-frame request and response: its own frame, documentLifecycle 'prerender'
    async prerender({ requestId = 'r-pre', url, statusCode = 200, cookie = null, frameId = 9, server = 'next' }) {
      const details = { tabId: tab, frameId, requestId, type: 'main_frame', url, documentLifecycle: 'prerender' };
      await ctx.keepPrerenderMainFrame({ ...details, requestHeaders: [{ name: 'User-Agent', value: 'test' }, { name: 'Cookie', value: 'a=1' }] });
      await ctx.keepPrerenderMainFrame({ ...details, statusCode, responseHeaders: [{ name: 'Server', value: server },
        ...(cookie ? [{ name: 'Set-Cookie', value: cookie }] : [])] });
    },
    commitPrerender(documentId, url, frameId = 9) {
      ctx.notePrerenderCommit({ tabId: tab, frameId, documentId, url, documentLifecycle: 'prerender' });
    },
    show(url, documentId) { return ctx.activatePrerenderedPage(tab, url, documentId); },
    status(documentId) { return ctx.pageHttpStatus(tab, documentId); },
    tab
  };
}

test('a prerendered page shown in the tab gets its own response headers, Set-Cookie, request headers and HTTP status', async () => {
  const page = capture();
  await page.shownPage('https://a.example/', 'doc-a');
  await page.prerender({ url: 'https://b.example/next', statusCode: 403, cookie: '__cf_bm=xyz; path=/' });
  page.commitPrerender('doc-b', 'https://b.example/next');
  assert.equal(page.ctx.headersStore.get(page.tab).headers.server, 'shown', 'while hidden, the shown page keeps its own');
  assert.equal(page.status('doc-a'), 200);

  assert.equal(page.show('https://b.example/next', 'doc-b'), true);
  const response = page.ctx.headersStore.get(page.tab);
  assert.equal(response.headers.server, 'next');
  assert.equal(response.url, 'https://b.example/next');
  assert.deepEqual(JSON.parse(JSON.stringify(page.ctx.responseCookiesStore.get(page.tab).cookies)), [{ name: '__cf_bm', value: 'xyz' }]);
  assert.equal(page.ctx.requestHeadersStore.get(page.tab).headers.cookie, 'a=1');
  assert.equal(page.status('doc-b'), 403, 'the status tile shows the page\'s own status');
  assert.equal(page.status('doc-a'), null);
  assert.equal(page.ctx.prerenderPages.has(page.tab), false, 'nothing is kept once used');
  assert.equal(page.ctx.prerenderShownHandled(page.tab, 'doc-b'), true);
  // Requests of the page that was left are no longer this page's
  assert.equal(page.ctx.isOtherPageRequest({ tabId: page.tab, frameId: 0, documentId: 'doc-a', documentLifecycle: 'active', type: 'script' }), true);
  page.ctx.navigationStarted(page.tab);
  assert.equal(page.ctx.prerenderShownHandled(page.tab, 'doc-b'), false, 'a later load in the tab is a page of its own');
});

test('the page is found by its document even after it changed its address; without one, by its address', async () => {
  const page = capture();
  await page.prerender({ url: 'https://b.example/?utm_source=x', server: 'b' });
  page.commitPrerender('doc-b', 'https://b.example/?utm_source=x');
  assert.equal(page.show('https://b.example/', 'doc-b'), true, 'replaceState stripped the query while hidden');
  assert.equal(page.ctx.headersStore.get(page.tab).headers.server, 'b');

  const uncommitted = capture();
  await uncommitted.prerender({ url: 'https://c.example/page', server: 'c' });
  assert.equal(uncommitted.show('https://c.example/page#top', 'doc-c'), true, 'no commit seen: by its address, fragment aside');
  assert.equal(uncommitted.status('doc-c'), 200);

  const other = capture();
  await other.shownPage('https://a.example/', 'doc-a');
  await other.prerender({ url: 'https://c.example/page' });
  assert.equal(other.show('https://d.example/', 'doc-d'), false, 'another page\'s load is not borrowed');
  assert.equal(other.ctx.headersStore.has(other.tab), false, 'and the page before\'s headers are gone');
  assert.equal(other.status('doc-d'), null);
});

test('a redirect while prerendering keeps the last hop: its status, and no Set-Cookie of the redirect itself', async () => {
  const page = capture();
  await page.prerender({ url: 'http://b.example/', statusCode: 301, cookie: 'redirect=1' });
  await page.prerender({ url: 'https://b.example/home', statusCode: 200 });
  page.commitPrerender('doc-b', 'https://b.example/home');
  page.show('https://b.example/home', 'doc-b');
  assert.equal(page.status('doc-b'), 200);
  assert.equal(page.ctx.headersStore.get(page.tab).url, 'https://b.example/home');
  assert.equal(page.ctx.responseCookiesStore.has(page.tab), false);
});

test('a prerendered page of a skipped site, or with the extension off, keeps nothing', async () => {
  const skipped = capture({ skipped: ['b.example'] });
  await skipped.prerender({ url: 'https://b.example/', cookie: 'session=secret' });
  assert.equal(skipped.ctx.prerenderPages.has(skipped.tab), false);
  assert.equal(skipped.show('https://b.example/', 'doc-b'), false);
  assert.equal(skipped.ctx.headersStore.has(skipped.tab), false);
  assert.equal(skipped.ctx.responseCookiesStore.has(skipped.tab), false);
  assert.equal(skipped.ctx.requestHeadersStore.has(skipped.tab), false);

  const off = capture({ enabled: false });
  await off.prerender({ url: 'https://b.example/' });
  assert.equal(off.ctx.prerenderPages.has(off.tab), false);

  // Only the page's own request is kept, never a request it makes
  const page = capture();
  assert.equal(await page.ctx.keepPrerenderMainFrame({ tabId: 5, frameId: 9, requestId: 'x', type: 'script', url: 'https://b.example/a.js',
    documentLifecycle: 'prerender', responseHeaders: [] }), false);
  assert.equal(await page.ctx.keepPrerenderMainFrame({ tabId: 5, frameId: 0, requestId: 'y', type: 'main_frame', url: 'https://b.example/',
    documentLifecycle: 'active', responseHeaders: [] }), false, 'the shown page\'s own load is captured as before, not here');
});

test('what is kept is bounded per tab and in time, and goes with the tab', async () => {
  const page = capture();
  for (let i = 0; i < page.ctx.PRERENDER_PAGES_PER_TAB + 2; i++) await page.prerender({ requestId: `r${i}`, url: `https://b.example/${i}`, frameId: 10 + i });
  const kept = page.ctx.prerenderPages.get(page.tab);
  assert.equal(kept.length, page.ctx.PRERENDER_PAGES_PER_TAB);
  assert.equal(kept[0].requestId, 'r2', 'the oldest go first');
  kept[kept.length - 1].timestamp -= page.ctx.PRERENDER_PAGE_TTL_MS + 1;
  assert.equal(page.show(`https://b.example/${page.ctx.PRERENDER_PAGES_PER_TAB + 1}`, 'doc-x'), false, 'too old to be the page shown now');

  const closed = capture();
  await closed.prerender({ url: 'https://b.example/' });
  closed.ctx.forgetPrerenderPages(closed.tab);
  assert.equal(closed.ctx.prerenderPages.has(closed.tab), false);

  const src = read('background/header-capture.js');
  assert.match(src, /onRemoved\.addListener\(\(tabId\) => \{[^}]*forgetPrerenderPages\(tabId\)/, 'a closed tab forgets them');
  assert.match(src, /documentLifecycle === 'prerender'\) notePrerenderCommit\(details\)/, 'the prerendered commit names the page');
  for (const listener of ['onHeadersReceived', 'onBeforeSendHeaders']) {
    const body = src.slice(src.indexOf(`chrome.webRequest.${listener}.addListener`));
    assert.match(body.slice(0, 400), /if \(isPrerenderRequest\(details\)\) \{ await keepPrerenderMainFrame\(details\); return; \}/, listener);
  }
});
