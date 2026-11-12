'use strict';
// A page the scan is refused for (a skipped site, or a site outside "only these sites") leaves nothing in the worker's memory
// either. Its response headers and Set-Cookie, its request headers (Cookie, Authorization), its POST bodies and the addresses of
// its requests were read for every page and held for five minutes, scan or no scan. The webRequest listeners now ask first,
// and the answer is the one that refuses the scan (Utils.isUrlBlacklisted: ScanScope). It is settled when the tab's page starts
// loading (its main-frame request), because the address of a request the page makes is not the page. A normal site records
// exactly what it did before.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const SETTINGS_KEY = 'scrapfly_settings';
const NETWORK_STORES = ['headersStore', 'requestHeadersStore', 'responseCookiesStore', 'payloadStore', 'networkUrlsStore'];
const bytes = (text) => new TextEncoder().encode(text).buffer;
const BODY = '{"token":"SYNTHETIC_BODY_SECRET"}';

/** The worker's header-capture.js with its real stores, the real settings reader and skip rules, and a fake browser around them. */
function world({ settings = {}, tabs = {}, readDelay = 0 } = {}) {
  const local = { [SETTINGS_KEY]: JSON.stringify({ settings }) };
  const state = { raw: null, fail: false, reads: 0, delay: readDelay, tabs: { ...tabs }, enabled: true };
  const errors = [];
  const late = [];
  const listeners = { beforeRequest: [], headersReceived: [], beforeSendHeaders: [], committed: [], errorOccurred: [], removed: [] };
  const on = (list) => ({ addListener: (fn, filter) => list.push({ fn, filter }) });
  const area = {
    async get(keys) {
      const out = {};
      for (const key of [].concat(keys)) {
        if (key === SETTINGS_KEY) state.reads++;
        if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay)); else await Promise.resolve();
        if (key === SETTINGS_KEY && state.fail) throw new Error('storage did not answer');
        if (key === SETTINGS_KEY && state.raw !== null) out[key] = state.raw;
        else if (key in local) out[key] = local[key];
      }
      return out;
    },
    async set(values) { Object.assign(local, values); },
    async remove(keys) { for (const key of [].concat(keys)) delete local[key]; }
  };
  const unref = (fn, ms) => { const timer = setTimeout(fn, ms); if (timer && timer.unref) timer.unref(); return timer; };
  const context = vm.createContext({
    console, URL, TextDecoder, Uint8Array, JSON, Promise, Date, Math, Set, Map, setTimeout: unref, clearTimeout,
    Logger: new Proxy({}, { get: (_, name) => (name === 'error' ? (...args) => errors.push(args) : () => {}) }),
    chrome: {
      storage: { local: area },
      webRequest: { onBeforeRequest: on(listeners.beforeRequest), onHeadersReceived: on(listeners.headersReceived), onBeforeSendHeaders: on(listeners.beforeSendHeaders) },
      webNavigation: { onCommitted: on(listeners.committed), onErrorOccurred: on(listeners.errorOccurred) },
      tabs: {
        get: async (id) => { if (!(id in state.tabs)) throw new Error('No tab with id'); return { id, url: state.tabs[id] }; },
        onRemoved: on(listeners.removed)
      }
    },
    isExtensionEnabled: async () => state.enabled,
    detectionStates: new Map(),
    noteLateNetworkUrl: (tabId, entry) => late.push([tabId, plain(entry)])
  });
  context.self = context;
  for (const file of ['modules/core/constants.js', 'modules/core/ttl-map.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js',
    'modules/core/storage-manager.js', 'utils/utils.js']) vm.runInContext(read(file), context, { filename: file });
  // The stores as the worker declares them (background/runtime-state.js), and the cache flag its listeners read
  const runtimeState = read('background/runtime-state.js');
  vm.runInContext(runtimeState.slice(runtimeState.indexOf('const headersStore'), runtimeState.indexOf('// ─── Advanced Capture States')), context, { filename: 'runtime-state.js' });
  vm.runInContext('const tabsUsingCache = new Set(); let cachedEnabledState = { value: true, timestamp: 0 };', context);
  vm.runInContext(read('background/header-capture.js'), context, { filename: 'background/header-capture.js' });
  vm.runInContext('setupHeaderCapture();', context);

  let sequence = 0;
  /** Chrome calls every listener of an event that its filter lets through, in the order they were registered, without waiting for any. */
  const fire = (name, details) => listeners[name]
    .filter((l) => !(l.filter && l.filter.types) || l.filter.types.includes(details.type))
    .map((l) => l.fn(details));
  const store = (name) => vm.runInContext(name, context);
  const world = {
    context, local, state, errors, late, listeners, fire,
    store,
    /** Everything the stores hold for a tab, as plain data. */
    held(tabId) {
      const out = {};
      for (const name of NETWORK_STORES) if (store(name).has(tabId)) out[name] = plain(store(name).get(tabId));
      return out;
    },
    /** The main-frame request of a page, and what comes with it: request headers, the response (headers, Set-Cookie), a POST body. */
    async navigate(tabId, url, { method = 'GET', body, requestId = `nav${++sequence}`, set = ['sid=abc123; Path=/; HttpOnly'], commit = true } = {}) {
      const base = { tabId, frameId: 0, url, type: 'main_frame', method, requestId };
      await Promise.all(fire('beforeRequest', { ...base, ...(body ? { requestBody: { raw: [{ bytes: bytes(body) }] } } : {}) }));
      await Promise.all(fire('beforeSendHeaders', { ...base, requestHeaders: [{ name: 'Cookie', value: 'session=SYNTHETIC_COOKIE' }, { name: 'Authorization', value: 'Bearer SYNTHETIC_TOKEN' }, { name: 'Accept', value: 'text/html' }] }));
      await Promise.all(fire('headersReceived', { ...base, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }, ...set.map((value) => ({ name: 'Set-Cookie', value })), { name: 'X-Vendor', value: 'v1' }] }));
      if (commit) await world.commit(tabId, url);
    },
    async commit(tabId, url) { await Promise.all(listeners.committed.map((l) => l.fn({ tabId, frameId: 0, url, documentId: `doc-${++sequence}` }))); },
    /** A request the page makes. */
    async sub(tabId, url, { type = 'xmlhttprequest', method = 'GET', body } = {}) {
      await Promise.all(fire('beforeRequest', { tabId, frameId: 0, url, type, method, requestId: `sub${++sequence}`, ...(body ? { requestBody: { raw: [{ bytes: bytes(body) }] } } : {}) }));
    },
    /** What a typical page does after it loads. */
    async traffic(tabId) {
      await world.sub(tabId, 'https://js.vendor.net/tag.js', { type: 'script' });
      await world.sub(tabId, 'https://api.site.example/login', { method: 'POST', body: BODY });
      await world.sub(tabId, 'https://api.site.example/me');
      await world.sub(tabId, 'https://cdn.site.example/pixel.gif', { type: 'image' });
    },
    nothingHeld(tabId) { assert.deepEqual(world.held(tabId), {}, `nothing is held for tab ${tabId}`); assert.deepEqual(late.filter(([id]) => id === tabId), [], 'and no late request was noted'); }
  };
  return world;
}

const SKIP = { detection: { scanMode: 'blocklist', blacklistedDomains: ['skipped.example'] } };
const ONLY = { detection: { scanMode: 'allowlist', allowedDomains: ['shop.example'] } };

test('a skipped site: its page and everything the page makes leave nothing in any store', async () => {
  const w = world({ settings: SKIP });
  await w.navigate(1, 'https://skipped.example/account', { method: 'POST', body: BODY });
  await w.traffic(1);
  w.nothingHeld(1);
  assert.deepEqual(w.errors, [], 'and nothing broke');
});

test('a normal site records what it always did: response headers, Set-Cookie, request headers, bodies and addresses', async () => {
  const w = world({ settings: SKIP });
  await w.navigate(1, 'https://shop.example/cart', { method: 'POST', body: BODY });
  await w.traffic(1);
  const held = w.held(1);
  assert.deepEqual(Object.keys(held).sort(), [...NETWORK_STORES].sort());
  assert.equal(held.headersStore.url, 'https://shop.example/cart');
  assert.deepEqual(held.headersStore.headers, { 'content-type': 'text/html', 'set-cookie': 'sid=abc123; Path=/; HttpOnly', 'x-vendor': 'v1' });
  assert.deepEqual(held.responseCookiesStore.cookies, [{ name: 'sid', value: 'abc123' }]);
  assert.deepEqual(held.requestHeadersStore.headers, { cookie: 'session=SYNTHETIC_COOKIE', authorization: 'Bearer SYNTHETIC_TOKEN', accept: 'text/html' });
  assert.deepEqual(held.payloadStore.map((p) => [p.url, p.method, p.payload, p.type]), [
    ['https://shop.example/cart', 'POST', BODY, 'raw'],
    ['https://api.site.example/login', 'POST', BODY, 'raw']
  ]);
  assert.deepEqual(held.networkUrlsStore.map((e) => [e.type, e.method, e.url]), [
    ['main_frame', 'POST', 'https://shop.example/cart'],
    ['script', 'GET', 'https://js.vendor.net/tag.js'],
    ['xmlhttprequest', 'POST', 'https://api.site.example/login'],
    ['xmlhttprequest', 'GET', 'https://api.site.example/me'],
    ['image', 'GET', 'https://cdn.site.example/pixel.gif']
  ]);
  assert.equal(w.late.filter(([id]) => id === 1).length, 5, 'every request is handed to the late check, as before');
  assert.deepEqual(w.errors, []);
});

test('a request takes the verdict of the page that makes it, not of its own address', async () => {
  const w = world({ settings: SKIP });
  // A normal page that loads a script from a skipped host: the script is the page's evidence
  await w.navigate(1, 'https://shop.example/', { set: [] });
  await w.sub(1, 'https://skipped.example/lib.js', { type: 'script' });
  assert.deepEqual(w.held(1).networkUrlsStore.map((e) => e.url), ['https://shop.example/', 'https://skipped.example/lib.js']);
  // A skipped page that loads the very scripts a scan looks for: not kept
  await w.navigate(2, 'https://skipped.example/', { set: [] });
  await w.sub(2, 'https://js.datadome.co/tags.js', { type: 'script' });
  await w.sub(2, 'https://shop.example/lib.js', { type: 'script' });
  w.nothingHeld(2);
});

test('"only these sites": a page that is not on the list leaves nothing, a listed one and its subdomains record', async () => {
  const w = world({ settings: ONLY });
  await w.navigate(1, 'https://bank.example/', { method: 'POST', body: BODY });
  await w.traffic(1);
  w.nothingHeld(1);
  await w.navigate(2, 'https://shop.example/', { method: 'POST', body: BODY });
  await w.traffic(2);
  assert.deepEqual(Object.keys(w.held(2)).sort(), [...NETWORK_STORES].sort());
  await w.navigate(3, 'https://www.shop.example/', { set: [] });
  await w.sub(3, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.deepEqual(w.held(3).networkUrlsStore.map((e) => e.url), ['https://www.shop.example/', 'https://js.vendor.net/tag.js'], 'the subdomain is the site');
  // The mode decides, not the list kept for the other one
  const blocklist = world({ settings: { detection: { scanMode: 'blocklist', blacklistedDomains: [], allowedDomains: ['shop.example'] } } });
  await blocklist.navigate(1, 'https://bank.example/', { set: [] });
  assert.equal(blocklist.held(1).networkUrlsStore.length, 1);
  assert.deepEqual(w.errors, []);
});

test('a page that is not a web page is neither skipped nor chosen, and a tab that cannot be found is not read', async () => {
  const w = world({ settings: ONLY });
  await w.sub(7, 'https://js.vendor.net/tag.js', { type: 'script' }); // no main-frame request seen, and the tab says nothing
  assert.deepEqual(w.held(7), {}, 'a tab that cannot be found is not read');
  w.state.tabs[8] = 'chrome://newtab/';
  await w.sub(8, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.equal(w.held(8).networkUrlsStore.length, 1, 'even in "only these sites" mode: as before');
});

test('a redirect from a skipped site to a normal one records the normal one only, and the other way round records nothing of the skipped', async () => {
  const w = world({ settings: SKIP });
  // skipped.example -> shop.example: one load, two hops, one request id
  const id = 'load-1';
  await w.navigate(1, 'https://skipped.example/login', { requestId: id, commit: false, set: ['hop=1'] });
  assert.deepEqual(w.held(1), {}, 'the first hop is the skipped site\'s');
  await w.navigate(1, 'https://shop.example/home', { requestId: id, set: ['sid=2'] });
  await w.traffic(1);
  const held = w.held(1);
  assert.equal(held.headersStore.url, 'https://shop.example/home');
  assert.deepEqual(held.responseCookiesStore.cookies, [{ name: 'sid', value: '2' }]);
  assert.ok(!JSON.stringify(held).includes('skipped.example'), 'nothing of the skipped hop');
  // shop.example -> skipped.example: the first hop is recorded as it always was, the skipped one and what follows are not
  await w.navigate(2, 'https://shop.example/out', { requestId: 'load-2', commit: false, set: ['hop=1'] });
  await w.navigate(2, 'https://skipped.example/in', { requestId: 'load-2', set: ['sid=3'] });
  await w.traffic(2);
  const second = w.held(2);
  assert.equal(second.headersStore.url, 'https://shop.example/out', 'the skipped hop did not replace what the first one recorded');
  assert.ok(!JSON.stringify(second.networkUrlsStore).includes('skipped.example'));
  assert.equal(second.networkUrlsStore.some((e) => e.url.includes('api.site.example')), false, 'and what the skipped page makes is not recorded');
  assert.equal(second.payloadStore, undefined);
  assert.deepEqual(w.errors, []);
});

test('the events of a redirect hop are judged by that hop\'s address even when the next hop has started', async () => {
  // Chrome does not wait for a listener: the next hop's request starts while the first hop's listeners still wait for the settings
  const w = world({ settings: SKIP, readDelay: 15 });
  const events = [];
  const hop = (url, requestId) => ({ tabId: 1, frameId: 0, type: 'main_frame', method: 'GET', requestId, url });
  const first = hop('https://skipped.example/login', 'redirect');
  events.push(...w.fire('beforeRequest', first));
  events.push(...w.fire('beforeSendHeaders', { ...first, requestHeaders: [{ name: 'Cookie', value: 'skipped=1' }] }));
  events.push(...w.fire('headersReceived', { ...first, responseHeaders: [{ name: 'Set-Cookie', value: 'skipped=2' }] }));
  const second = hop('https://shop.example/home', 'redirect');
  events.push(...w.fire('beforeRequest', second));
  events.push(...w.fire('beforeSendHeaders', { ...second, requestHeaders: [{ name: 'Cookie', value: 'shop=1' }] }));
  events.push(...w.fire('headersReceived', { ...second, responseHeaders: [{ name: 'Set-Cookie', value: 'shop=2' }] }));
  await Promise.all(events);
  const held = w.held(1);
  assert.equal(held.requestHeadersStore.headers.cookie, 'shop=1');
  assert.deepEqual(held.responseCookiesStore.cookies, [{ name: 'shop', value: '2' }]);
  assert.deepEqual(held.networkUrlsStore.map((e) => e.url), ['https://shop.example/home']);
  assert.ok(!JSON.stringify(held).includes('skipped'), 'nothing of the skipped hop, though the page had moved on when its listeners resumed');
  // The other way round: the normal hop is recorded though the skipped one took the tab's place before its listeners resumed
  const back = world({ settings: SKIP, readDelay: 15 });
  const more = [];
  const one = hop('https://shop.example/out', 'redirect-2');
  more.push(...back.fire('beforeRequest', one), ...back.fire('headersReceived', { ...one, responseHeaders: [{ name: 'Set-Cookie', value: 'shop=9' }] }));
  const two = hop('https://skipped.example/in', 'redirect-2');
  more.push(...back.fire('beforeRequest', two), ...back.fire('headersReceived', { ...two, responseHeaders: [{ name: 'Set-Cookie', value: 'skipped=9' }] }));
  await Promise.all(more);
  assert.deepEqual(back.held(1).responseCookiesStore.cookies, [{ name: 'shop', value: '9' }]);
  assert.deepEqual(back.held(1).networkUrlsStore.map((e) => e.url), ['https://shop.example/out']);
});

test('a prerendered page just activated is judged by the tab\'s own address, not by the page it replaced', async () => {
  const w = world({ settings: SKIP, tabs: { 1: 'https://shop.example/next' } });
  await w.navigate(1, 'https://skipped.example/', { set: [] });
  // The worker handles the activation as a page load that sent no request of this tab (DetectionEngineManager, prerender_activation)
  vm.runInContext('forgetTabRequests(1)', w.context);
  await w.sub(1, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.deepEqual(w.held(1).networkUrlsStore.map((e) => e.url), ['https://js.vendor.net/tag.js']);
});

test('the verdict is read once for a page, not for every request it makes', async () => {
  const w = world({ settings: SKIP });
  await w.navigate(1, 'https://shop.example/', { method: 'POST', body: BODY });
  for (let i = 0; i < 30; i++) await w.sub(1, `https://cdn.site.example/a${i}.js`, { type: 'script' });
  assert.equal(w.state.reads, 1, 'the main-frame request settled it for the four listeners and the thirty requests');
  await w.navigate(1, 'https://shop.example/two');
  assert.equal(w.state.reads, 2, 'the next page reads the settings again: a change applies at the next load');
});

test('requests that arrive before the settings were read are recorded when they have been, not dropped', async () => {
  // A worker just started: the read of the settings takes a while, and the page's first requests do not wait for it
  const w = world({ settings: SKIP, readDelay: 15 });
  const events = [];
  const base = { tabId: 1, frameId: 0, type: 'main_frame', method: 'GET', requestId: 'cold', url: 'https://shop.example/' };
  events.push(...w.fire('beforeRequest', base));
  events.push(...w.fire('beforeSendHeaders', { ...base, requestHeaders: [{ name: 'Cookie', value: 'a=1' }] }));
  events.push(...w.fire('headersReceived', { ...base, responseHeaders: [{ name: 'Set-Cookie', value: 'sid=9' }] }));
  for (let i = 0; i < 5; i++) events.push(...w.fire('beforeRequest', { tabId: 1, frameId: 0, type: 'script', method: 'GET', requestId: `s${i}`, url: `https://cdn.shop.example/${i}.js` }));
  events.push(...w.fire('beforeRequest', { tabId: 1, frameId: 0, type: 'xmlhttprequest', method: 'POST', requestId: 'p', url: 'https://api.shop.example/p', requestBody: { raw: [{ bytes: bytes(BODY) }] } }));
  assert.deepEqual(w.held(1), {}, 'nothing yet: the verdict is not known');
  await Promise.all(events);
  const held = w.held(1);
  assert.deepEqual(held.networkUrlsStore.map((e) => e.url), ['https://shop.example/', ...[0, 1, 2, 3, 4].map((i) => `https://cdn.shop.example/${i}.js`), 'https://api.shop.example/p'], 'every request, in the order it was made');
  assert.equal(held.payloadStore.length, 1);
  assert.deepEqual(held.responseCookiesStore.cookies, [{ name: 'sid', value: '9' }]);
  assert.equal(held.requestHeadersStore.headers.cookie, 'a=1');
  // The same start for a skipped site
  const skipped = world({ settings: SKIP, readDelay: 15 });
  const more = [];
  const page = { ...base, url: 'https://skipped.example/' };
  more.push(...skipped.fire('beforeRequest', page), ...skipped.fire('beforeSendHeaders', { ...page, requestHeaders: [{ name: 'Cookie', value: 'a=1' }] }));
  more.push(...skipped.fire('beforeRequest', { tabId: 1, frameId: 0, type: 'xmlhttprequest', method: 'POST', requestId: 'p', url: 'https://api.skipped.example/p', requestBody: { raw: [{ bytes: bytes(BODY) }] } }));
  await Promise.all(more);
  skipped.nothingHeld(1);
});

test('settings that cannot be read: nothing is recorded for the page, nothing breaks, and the next page records again once they can be', async () => {
  const w = world({ settings: SKIP });
  w.state.raw = '{ not json';
  await w.navigate(1, 'https://shop.example/', { method: 'POST', body: BODY });
  await w.traffic(1);
  w.nothingHeld(1);
  assert.deepEqual(w.errors, [], 'a listener that failed would have been logged');
  w.state.raw = null;
  w.state.fail = true; // the storage does not answer either
  await w.navigate(2, 'https://shop.example/', { method: 'POST', body: BODY });
  await w.traffic(2);
  w.nothingHeld(2);
  assert.deepEqual(w.errors, []);
  // Readable again: the next page load is judged afresh
  w.state.fail = false;
  await w.navigate(1, 'https://shop.example/again', { set: [] });
  await w.sub(1, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.deepEqual(w.held(1).networkUrlsStore.map((e) => e.url), ['https://shop.example/again', 'https://js.vendor.net/tag.js']);
  assert.deepEqual(w.errors, []);
});

test('a tab this worker saw no page start in (the worker restarted while the page stayed) takes the verdict of the tab\'s own address', async () => {
  const w = world({ settings: SKIP, tabs: { 5: 'https://skipped.example/dash', 6: 'https://shop.example/dash' } });
  await w.traffic(5);
  w.nothingHeld(5);
  await w.traffic(6);
  assert.equal(w.held(6).networkUrlsStore.length, 4, 'the page that is not skipped records its requests');
  assert.equal(w.held(6).payloadStore.length, 1);
  assert.equal(w.state.reads, 2, 'one read for each tab, not for each request');
  // A tab that cannot be found is not read, and not remembered as skipped: it is asked again
  await w.sub(9, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.deepEqual(w.held(9), {});
  w.state.tabs[9] = 'https://shop.example/';
  await w.sub(9, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.equal(w.held(9).networkUrlsStore.length, 1);
  assert.deepEqual(w.errors, []);
});

test('a navigation that does not replace the page (a download, a 204, a cancel) leaves the page its own verdict', async () => {
  const w = world({ settings: SKIP, tabs: { 1: 'https://shop.example/page', 2: 'https://skipped.example/page' } });
  // On a normal page, a link to a skipped host that turns out to be a download
  await w.navigate(1, 'https://shop.example/page', { set: [] });
  await w.navigate(1, 'https://skipped.example/file.zip', { set: [], commit: false });
  w.listeners.errorOccurred.forEach((l) => l.fn({ tabId: 1, frameId: 0 }));
  await w.sub(1, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.deepEqual(w.held(1).networkUrlsStore.map((e) => e.url), ['https://js.vendor.net/tag.js'], 'the normal page that stayed records what it makes after it');
  // On a skipped page, a link to a normal host that turns out to be a download
  await w.navigate(2, 'https://skipped.example/page', { set: [] });
  await w.navigate(2, 'https://shop.example/file.zip', { set: [], commit: false });
  w.listeners.errorOccurred.forEach((l) => l.fn({ tabId: 2, frameId: 0 }));
  await w.sub(2, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.deepEqual(w.held(2).networkUrlsStore.map((e) => e.url), ['https://shop.example/file.zip'], 'the skipped page that stayed still records nothing: only the download\'s own request, to a normal host, is there');
  // A navigation that does replace the page decides for the page that follows
  await w.navigate(2, 'https://shop.example/home', { set: [] });
  await w.sub(2, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.equal(w.held(2).networkUrlsStore.length, 2);
  assert.deepEqual(w.errors, []);
});

test('a page restored from the back/forward cache sends no request: what commits decides', async () => {
  const w = world({ settings: SKIP });
  await w.navigate(1, 'https://shop.example/a', { set: [] });
  await w.navigate(1, 'https://skipped.example/b', { set: [] });
  await w.sub(1, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.deepEqual(w.held(1), {}, 'the skipped page holds nothing, and the page before it was forgotten when this one started');
  assert.equal(w.late.some(([, entry]) => /skipped\.example|vendor\.net/.test(entry.url)), false, 'and no late request of it was noted');
  await w.commit(1, 'https://shop.example/a#frag'); // back to the first page, restored: no main-frame request
  await w.sub(1, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.deepEqual(w.held(1).networkUrlsStore.map((e) => e.url), ['https://js.vendor.net/tag.js']);
  await w.commit(1, 'https://skipped.example/b'); // forward, restored
  await w.sub(1, 'https://js.vendor.net/more.js', { type: 'script' });
  assert.equal(w.held(1).networkUrlsStore.length, 1, 'nothing more from the skipped page');
  // A commit of the page the request already settled costs no read
  const reads = w.state.reads;
  await w.navigate(2, 'https://shop.example/c', { set: [] });
  await w.commit(2, 'https://shop.example/c#top');
  assert.equal(w.state.reads, reads + 1);
});

test('a closed tab is forgotten', async () => {
  const w = world({ settings: SKIP });
  await w.navigate(1, 'https://skipped.example/', { set: [] });
  w.listeners.removed.forEach((l) => l.fn(1));
  w.state.tabs[1] = 'https://shop.example/'; // the id belongs to a normal page now
  await w.sub(1, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.equal(w.held(1).networkUrlsStore.length, 1);
});

test('a request that belongs to no tab is recorded as it was: there is no page to judge it by', async () => {
  const w = world({ settings: SKIP });
  await w.sub(-1, 'https://api.site.example/beacon', { method: 'POST', body: BODY });
  assert.equal(w.held(-1).payloadStore.length, 1);
});

test('the extension switched off records nothing, as before, and reads no settings to find out which page would', async () => {
  const w = world({ settings: SKIP });
  w.state.enabled = false;
  w.context.cachedEnabledState = { value: false, timestamp: Date.now() };
  vm.runInContext('cachedEnabledState = { value: false, timestamp: Date.now() }', w.context);
  await w.navigate(1, 'https://shop.example/', { method: 'POST', body: BODY });
  await w.traffic(1);
  w.nothingHeld(1);
  assert.equal(w.state.reads, 0, 'a page load while the extension is off costs no read');
  // A page that was loaded before the extension was switched off does not lend its verdict to the next one
  const before = world({ settings: SKIP });
  await before.navigate(3, 'https://shop.example/', { set: [] });
  before.state.enabled = false;
  vm.runInContext('cachedEnabledState = { value: false, timestamp: Date.now() }', before.context);
  await before.navigate(3, 'https://skipped.example/', { set: [] });
  before.state.enabled = true;
  vm.runInContext('cachedEnabledState = { value: true, timestamp: Date.now() }', before.context);
  before.state.tabs[3] = 'https://skipped.example/';
  await before.sub(3, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.deepEqual(before.held(3), {}, 'the skipped page it moved to is not recorded');
  // Switched on again while the page stays: its requests are judged by the tab's own address
  w.state.enabled = true;
  vm.runInContext('cachedEnabledState = { value: true, timestamp: Date.now() }', w.context);
  w.state.tabs[1] = 'https://shop.example/';
  await w.sub(1, 'https://js.vendor.net/tag.js', { type: 'script' });
  assert.deepEqual(w.held(1).networkUrlsStore.map((e) => e.url), ['https://js.vendor.net/tag.js']);
  w.state.tabs[2] = 'https://skipped.example/';
  await w.sub(2, 'https://js.vendor.net/tag.js', { type: 'script' });
  w.nothingHeld(2);
});

test('the clear stays first and synchronous, and every capture listener asks the same question', () => {
  const source = read('background/header-capture.js');
  const setup = source.slice(source.indexOf('function setupHeaderCapture'));
  const listeners = setup.split(/chrome\.webRequest\.\w+\.addListener\(/).slice(1);
  assert.equal(listeners.length, 5, 'no listener was added: the verdict is a question the existing ones ask');
  assert.doesNotMatch(listeners[0], /async|await/);
  assert.match(listeners[0], /noteCaptureScope\(details\)/, 'the page\'s verdict starts with its main-frame request');
  for (const body of listeners.slice(1)) assert.match(body, /await captureOpen\(details/, 'every capture listener');
});
