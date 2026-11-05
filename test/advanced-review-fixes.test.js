const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Regression tests for the Advanced tab review fixes: one capture saved once,
// jobs that survive a page's own address rewrite, extract tools that never take
// over a running capture, history handlers bound to their own list once, Akamai's
// bound listener removal, one stop vocabulary, hCaptcha's timeout and single
// completion, waiting for the page load, and reCAPTCHA's shared listener.

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

// A Chrome event whose removeListener needs its receiver, like the real one
function event() {
    return {
        listeners: new Set(),
        addListener(listener) { this.listeners.add(listener); },
        removeListener(listener) { this.listeners.delete(listener); },
        hasListener(listener) { return this.listeners.has(listener); },
        emit(...args) { for (const listener of Array.from(this.listeners)) listener(...args); }
    };
}

function fixture() {
    let nextTimer = 0;
    const timers = new Map(), messages = [], notices = [], saves = [], reloads = [];
    const context = { URL, URLSearchParams, TextDecoder, TextEncoder, Uint8Array, console,
        Logger: { debug() {}, network() {}, warn() {}, error() {} },
        Constants: { CAPTURE_AUTO_STOP_TIMEOUT: 60000 },
        UrlUtils: { normalizeFaviconForStorage: () => '' },
        setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
        clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
        chrome: {
            tabs: { onRemoved: event(), onUpdated: event(), get: async id => ({ id, url: 'https://shop.example/login' }),
                reload: async id => { reloads.push(id); } },
            webNavigation: { onCompleted: event(), onCommitted: event() },
            webRequest: { onBeforeRequest: event(), onResponseStarted: event(), onBeforeSendHeaders: event() },
            scripting: { executeScript: async () => [{ result: false }] },
            runtime: { async sendMessage(message) { messages.push(message); } },
            storage: { local: { async get() { return {}; }, async set() {} } }
        }
    };
    context.self = context;
    vm.createContext(context);
    for (const file of ['modules/core/capture-retention.js', 'modules/advanced/vendor-registry.js', 'modules/advanced/result-model.js',
        'background/advanced/history-store.js', 'background/advanced/page-notice.js',
        'background/advanced/collector-utils.js', 'background/advanced/job-manager.js', 'background/advanced/script-analysis.js']) {
        vm.runInContext(read(file), context, { filename: file });
    }
    const load = vendor => {
        vm.runInContext(read(`background/advanced/vendors/${vendor}/interceptor.js`), context);
        context.showNotification = async (tabId, options) => { notices.push(options); };
        context.showCaptureStarted = async () => {};
        context.saveToHistory = async (tabId, data) => { saves.push(data); await Promise.resolve(); };
        context.BaseInterceptorHelpers.saveToHistory = context.saveToHistory;
        return context;
    };
    return { context, timers, messages, notices, saves, reloads, load,
        async tick(delay) {
            const matching = Array.from(timers).filter(([, timer]) => timer.delay === delay);
            for (const [id, timer] of matching) { timers.delete(id); timer.fn(); }
            await flush();
        } };
}

test('Shape Security: one request carrying all six headers saves the capture once', async () => {
    const f = fixture(), context = f.load('shapesecurity');
    const states = new Map();
    await new Promise(resolve => context.shapeSecurityHandleMessage({ type: 'SHAPESECURITY_START_CAPTURE', tabId: 7 }, resolve, states, new Map()));
    f.context.chrome.webRequest.onResponseStarted.emit({ tabId: 7, responseHeaders: [{ name: 'set-cookie', value: 'AbCdEfGh=xyz; Max-Age=1577847600; Path=/' }] });
    states.get(7).version = 'v2';
    const headers = ['a', 'b', 'c', 'd', 'f', 'z'].map(letter => ({ name: `X-AbCd1234-${letter}`, value: 'v' }));
    // Chrome may still deliver a request queued before the listener came off
    const [headerListener] = Array.from(f.context.chrome.webRequest.onBeforeSendHeaders.listeners);
    headerListener({ tabId: 7, requestHeaders: headers });
    headerListener({ tabId: 7, requestHeaders: [{ name: 'X-AbCd1234-y', value: 'late' }] });
    // A manual stop while the automatic one is saving does not save again
    const stop = await new Promise(resolve => context.shapeSecurityHandleMessage({ type: 'SHAPESECURITY_STOP_CAPTURE', tabId: 7 }, resolve));
    await flush();
    assert.equal(f.saves.length, 1, 'one History entry per capture');
    assert.equal(f.saves[0].headers.length, 6, 'every header of that request is in it');
    assert.equal(stop.status, 'not_capturing');
    assert.equal(f.notices.filter(notice => notice.type === 'success').length, 1, 'one completion notice');
    assert.equal(states.has(7), false);
});

test('Jobs: the page rewriting its own query or hash does not cancel; another page does', () => {
    const f = fixture(), jobs = f.context.AdvancedJobManager;
    const { job } = jobs.begin({ tabId: 3, vendorId: 'imperva', operation: 'analysis', url: 'https://shop.example.com/login' });
    let cleaned = false;
    job.addCleanup(() => { cleaned = true; });
    f.context.chrome.tabs.onUpdated.emit(3, { url: 'https://shop.example.com/login?utm_source=x' });
    f.context.chrome.tabs.onUpdated.emit(3, { url: 'https://shop.example.com/login#consent' });
    f.context.chrome.tabs.onUpdated.emit(4, { url: 'https://elsewhere.example/' });
    assert.equal(job.status, 'running');
    assert.equal(cleaned, false);
    f.context.chrome.tabs.onUpdated.emit(3, { url: 'https://shop.example.com/account' });
    assert.equal(job.status, 'cancelled');
    assert.equal(cleaned, true);
});

test('Analyze Scripts: a cancelled or timed-out run is not reported as a failed start', async () => {
    const shown = [];
    let listener = null;
    const context = { console, BaseAdvancedModule: function() {}, Logger: { error() {} },
        NotificationHelper: { error: text => shown.push(text), info() {} },
        AdvancedToolClient: { subscribe(fn) { listener = fn; return () => { listener = null; }; }, unsubscribe() { listener = null; } },
        AdvancedUtils: { sendMessage: async () => ({ status: 'started', requestId: 'r1' }) },
        PageCookies: {}, setTimeout: fn => fn(), chrome: { tabs: { reload: async () => {} } } };
    context.BaseAdvancedModule._tr = (key, fallback) => fallback;
    context.BaseAdvancedModule._fmt = (key, fallback) => fallback;
    vm.createContext(context);
    vm.runInContext(read('sections/advanced/components/script-results.js'), context);
    const ended = async status => {
        const module = Object.create(context.BaseAdvancedModule.prototype);
        Object.assign(module, { moduleName: 'imperva', displayName: 'Imperva', tabInfo: { id: 3, url: 'https://shop.example/' } });
        await module.startScriptAnalysis();
        listener({ type: 'IMPERVA_ANALYSIS_RESULT', tabId: 3, requestId: 'r1', status });
        return shown.at(-1);
    };
    assert.match(await ended('cancelled'), /moved to another page/);
    assert.match(await ended('timeout'), /timed out/);
    assert.equal(await ended('failed'), 'Failed to start analysis');
});

test('Imperva: Analyze Scripts refuses while a capture runs on the tab and leaves the capture alone', async () => {
    const f = fixture(), context = f.load('imperva');
    const states = new Map();
    context.impervaCaptureState = states;
    const capture = { tabId: 5, captureUrl: 'https://shop.example/login', foundCookies: {} };
    states.set(5, capture);
    // A worker restart: only the global store exists, the interceptor ref is not set yet
    const response = await new Promise(resolve => context.impervaHandleMessage({ type: 'IMPERVA_EXTRACT_SCRIPTS', tabId: 5 }, resolve));
    assert.equal(response.status, 'capture_running');
    assert.equal(states.get(5), capture, 'the running capture keeps its state (and its job)');
    // No capture: extraction starts, after the restart too
    const ok = await new Promise(resolve => context.impervaHandleMessage({ type: 'IMPERVA_EXTRACT_SCRIPTS', tabId: 6 }, resolve));
    assert.equal(ok.status, 'success');
    assert.equal(states.get(6).extractMode, true);
});

test('Akamai: Extract Sensor refuses during a capture, initializes after a worker restart, and reloads only from the popup', async () => {
    const f = fixture(), context = f.load('akamai');
    const removed = [];
    context.PageCookies = { getAll: async () => [{ name: '_abck' }], remove: async (url, cookie) => { removed.push(cookie.name); } };
    const states = new Map();
    context.akamaiCaptureState = states;
    const capture = { tabId: 5, captureUrl: 'https://shop.example/login', waitingForReload: true };
    states.set(5, capture);
    const refused = await new Promise(resolve => context.akamaiHandleMessage({ type: 'AKAMAI_EXTRACT_SENSOR', tabId: 5 }, resolve));
    assert.equal(refused.status, 'capture_running');
    assert.equal(states.get(5), capture);
    assert.deepEqual(removed, [], 'no cookie deleted for a refused extraction');
    const started = await new Promise(resolve => context.akamaiHandleMessage({ type: 'AKAMAI_EXTRACT_SENSOR', tabId: 6 }, resolve));
    assert.equal(started.status, 'success');
    assert.equal(states.get(6).extractMode, true);
    assert.deepEqual(f.reloads, [], 'the worker no longer reloads: the popup does, once');
});

// Extract Sensor deletes the _abck cookie so the page sends a fresh sensor: the request listener and the extraction state
// are armed first and the cookie goes last, so nothing that fails along the way costs the person the cookie for nothing
const akamaiExtract = (context, tabId = 6) => new Promise(resolve => context.akamaiHandleMessage({ type: 'AKAMAI_EXTRACT_SENSOR', tabId }, resolve));

test('Akamai: Extract Sensor arms the request listener and the extraction before it deletes the _abck cookie', async () => {
    const f = fixture(), context = f.load('akamai');
    const states = new Map();
    context.akamaiCaptureState = states;
    const seen = [];
    context.PageCookies = { getAll: async () => [{ name: '_abck' }],
        remove: async (url, cookie) => { seen.push({ cookie: cookie.name, armed: states.get(6)?.extractMode === true, listeners: f.context.chrome.webRequest.onBeforeRequest.listeners.size }); } };
    const started = await akamaiExtract(context);
    assert.equal(started.status, 'success');
    assert.deepEqual(seen, [{ cookie: '_abck', armed: true, listeners: 1 }], 'the state and the request listener exist before the cookie is deleted');
    assert.equal(states.get(6).extractMode, true, 'the extraction stays armed for the reload');
});

test('Akamai: an Extract Sensor that cannot arm (addListener throws) deletes no cookie, leaves nothing armed and can be retried', async () => {
    const f = fixture(), context = f.load('akamai');
    const states = new Map(), removed = [];
    context.akamaiCaptureState = states;
    context.PageCookies = { getAll: async () => [{ name: '_abck' }], remove: async (url, cookie) => { removed.push(cookie.name); } };
    const onBeforeRequest = f.context.chrome.webRequest.onBeforeRequest, addListener = onBeforeRequest.addListener;
    onBeforeRequest.addListener = () => { throw new Error('addListener failed'); };
    const refused = await akamaiExtract(context);
    assert.equal(refused.status, 'error');
    assert.match(refused.error, /addListener failed/);
    assert.deepEqual(removed, [], 'the cookie is still there');
    assert.equal(states.size, 0, 'no extraction state left waiting for a reload that will not come');
    // The retry registers the listener: the failed arming did not leave a variable that only claims to be registered
    onBeforeRequest.addListener = addListener;
    assert.equal((await akamaiExtract(context)).status, 'success');
    assert.equal(onBeforeRequest.listeners.size, 1);
    assert.deepEqual(removed, ['_abck']);
});

test('Akamai: an Extract Sensor whose cookie delete fails disarms again: no state, no listener, no pending stop', async () => {
    const f = fixture(), context = f.load('akamai');
    const states = new Map();
    context.akamaiCaptureState = states;
    context.PageCookies = { getAll: async () => [{ name: '_abck' }], remove: async () => { throw new Error('cookie store busy'); } };
    const failed = await akamaiExtract(context);
    assert.equal(failed.status, 'error');
    assert.match(failed.error, /cookie store busy/);
    assert.equal(states.size, 0, 'the extraction state is removed');
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 0, 'the request listener is removed');
    assert.equal(context.akamaiInterceptionListener, null);
    assert.equal(Array.from(f.timers.values()).filter(timer => timer.delay === 30000).length, 0, 'the 30 s stop is cleared');
});

test('Akamai: a failed Extract Sensor delete does not remove a capture the person started in the meantime', async () => {
    const f = fixture(), context = f.load('akamai');
    const states = new Map();
    context.akamaiCaptureState = states;
    let failDelete;
    context.PageCookies = { getAll: async () => [{ name: '_abck' }], remove: () => new Promise((resolve, reject) => { failDelete = reject; }) };
    const pending = akamaiExtract(context);
    await flush();
    context.akamaiStartCapture(6, 'https://shop.example/login');
    const capture = states.get(6);
    assert.equal(capture.extractMode, undefined, 'a capture replaced the extraction');
    failDelete(new Error('cookie store busy'));
    assert.equal((await pending).status, 'error');
    assert.equal(states.get(6), capture, 'the capture the person started is not removed by the failed extraction');
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 1, 'its request listener stays');
});

test('Akamai: stopping the last capture removes the request listener (removeListener keeps its receiver)', async () => {
    const f = fixture(), context = f.load('akamai');
    const states = new Map();
    context.akamaiInitializeInterceptor(states);
    context.akamaiStartCapture(9, 'https://shop.example/');
    const onBeforeRequest = f.context.chrome.webRequest.onBeforeRequest;
    assert.equal(onBeforeRequest.listeners.size, 1);
    assert.doesNotThrow(() => context.akamaiStopCapture(9));
    assert.equal(onBeforeRequest.listeners.size, 0);
    assert.equal(context.akamaiInterceptionListener, null);
});

// Imperva's request listener keeps what it reads only from Imperva's own requests (the _Incapsula_Resource and /interrogation
// endpoints, and Reese84's sensor, posted to the protected site with ?d=<host>), once per path, and bounded: a capture is saved
// to History, and a page sends many other requests whose bodies and queries are not Imperva's to keep
const impervaBody = text => ({ raw: [{ bytes: new TextEncoder().encode(text) }] });
const reeseBody = '{"solution":{"interrogation":{"p":"AAAA","st":1,"sr":2},"version":"stable"},"old_token":null,"error":null,"performance":{"interval":8}}';

function impervaTab(mode) {
    const f = fixture(), context = f.load('imperva');
    const states = new Map();
    context.impervaInitializeInterceptor(states);
    if (mode === 'extract') {
        context.impervaStartExtraction(7, 'https://shop.example/login');
    } else {
        context.impervaStartCapture(7, 'https://shop.example/login');
        states.get(7).waitingForReload = false;
    }
    const [listener] = Array.from(f.context.chrome.webRequest.onBeforeRequest.listeners);
    return { f, context, states, state: () => states.get(7),
        request: (url, extra = {}) => listener({ tabId: 7, method: 'GET', type: 'xmlhttprequest', url, ...extra }) };
}

test('Imperva: Analyze Scripts stores a POST body only from an Imperva request, however the body reads', () => {
    const t = impervaTab('extract');
    // A beacon of another site, a form of the page, a third party that copies the ?d= naming, a form post: none is Imperva's
    t.request('https://analytics.other.example/collect', { method: 'POST', requestBody: impervaBody('{"event":"performance","solution":"x"}') });
    t.request('https://shop.example/api/comments', { method: 'POST', requestBody: impervaBody('my solution and its performance') });
    t.request('https://tracker.example/collect?d=tracker.example', { method: 'POST', requestBody: impervaBody(reeseBody) });
    t.request('https://rum.example/beacon?u=https%3A%2F%2Fshop.example%2F_Incapsula_Resource', { method: 'POST', requestBody: impervaBody('{"performance":{"entries":[]}}') });
    t.request('https://shop.example/checkout', { method: 'POST', requestBody: { formData: { note: ['old_token'] } } });
    assert.deepEqual(Array.from(t.state().extractedData.payloads), [], 'no body of another address is kept');
    assert.deepEqual(Array.from(t.state().extractedData.challengeUrls), []);
    assert.equal(Array.from(t.f.timers.values()).filter(timer => timer.delay === 2000).length, 0, 'and none of them ends the analysis early');

    // Imperva's own: Reese84's sensor posted to the page's site with ?d=, and the _Incapsula_Resource endpoint
    t.request('https://shop.example/Disk-Lack-Be-Take-Dried?d=shop.example', { method: 'POST', requestBody: impervaBody(reeseBody) });
    t.request('https://www.shop.example/_Incapsula_Resource?SWKMTFSR=1&e=0.5', { method: 'POST', requestBody: impervaBody('{"solution":"x"}') });
    const { payloads, challengeUrls } = t.state().extractedData;
    assert.deepEqual(Array.from(payloads, item => item.url), ['https://shop.example/Disk-Lack-Be-Take-Dried?d=shop.example', 'https://www.shop.example/_Incapsula_Resource?SWKMTFSR=1&e=0.5']);
    assert.equal(payloads[0].payload, reeseBody);
    assert.deepEqual(Array.from(payloads[0].keywords), ['old_token', 'performance', 'solution']);
    assert.equal(challengeUrls.length, 2);
    assert.equal(Array.from(t.f.timers.values()).filter(timer => timer.delay === 2000).length, 2, 'an Imperva challenge still completes the analysis shortly after');
});

test('Imperva: a stored POST body is cut at a fixed size and says so', () => {
    const t = impervaTab('extract');
    const big = `{"solution":"${'x'.repeat(100000)}"}`;
    t.request('https://shop.example/Disk-Lack-Be-Take-Dried?d=shop.example', { method: 'POST', requestBody: impervaBody(big) });
    const [stored] = t.state().extractedData.payloads;
    assert.equal(stored.payload.length, 8192);
    assert.equal(stored.payload, big.slice(0, 8192));
    assert.equal(stored.truncated, true);
    assert.equal(stored.length, big.length, 'the original size is kept');
    t.request('https://shop.example/Disk-Lack-Be-Take-Dried?d=shop.example', { method: 'POST', requestBody: impervaBody(reeseBody) });
    assert.equal(t.state().extractedData.payloads[1].truncated, false);
});

test('Imperva: Analyze Scripts keeps the script URLs with their queries, which the result window parses', () => {
    const t = impervaTab('extract');
    t.request('https://shop.example/_Incapsula_Resource?SWKMTFSR=1&e=0.1234', { type: 'script' });
    t.request('https://shop.example/Thine-Wert/987', { type: 'script' });
    assert.deepEqual(Array.from(t.state().extractedData.scriptUrls), ['https://shop.example/_Incapsula_Resource?SWKMTFSR=1&e=0.1234', 'https://shop.example/Thine-Wert/987']);
});

test('Imperva: a body that says "interrogation" adds an interrogation URL only on an Imperva request, by path', () => {
    const t = impervaTab('capture');
    t.request('https://analytics.other.example/collect', { method: 'POST', requestBody: impervaBody('{"note":"interrogation"}') });
    t.request('https://shop.example/api/comments', { method: 'POST', requestBody: impervaBody('the interrogation room') });
    assert.deepEqual(Array.from(t.state().interrogationUrls), [], 'no address that merely carries the word');
    t.request('https://shop.example/Disk-Lack-Be-Take-Dried?d=shop.example&x=secret-token', { method: 'POST', requestBody: impervaBody(reeseBody) });
    t.request('https://shop.example/Disk-Lack-Be-Take-Dried?d=shop.example&x=another-token', { method: 'POST', requestBody: impervaBody(reeseBody) });
    assert.deepEqual(Array.from(t.state().interrogationUrls), ['https://shop.example/Disk-Lack-Be-Take-Dried'], 'Reese84\'s sensor, once, without its query');
});

test('Imperva: the endpoint lists a capture saves hold each path once, without its query, at most 20', async () => {
    const t = impervaTab('capture');
    for (let i = 0; i < 100; i++) {
        t.request(`https://shop.example/_Incapsula_Resource?SWKMTFSR=1&e=0.${i}`, { type: 'script' });
        t.request(`https://shop.example/v${i}/interrogation?id=${i}`);
    }
    t.request('https://shop.example/_Incapsula_Resource?SWKMTFSR=1&e=0.0', { type: 'script' });
    t.request('https://shop.example/v0/interrogation?id=0');
    assert.deepEqual(Array.from(t.state().incapResourceUrls), ['https://shop.example/_Incapsula_Resource'], 'one endpoint however often it is asked');
    assert.equal(t.state().interrogationUrls.length, 20);
    assert.equal(new Set(t.state().interrogationUrls).size, 20, 'no repeats');
    assert.ok(t.state().interrogationUrls.every(url => !url.includes('?')), 'no query kept');
    assert.deepEqual(Array.from(t.state().interrogationUrls.slice(0, 2)), ['https://shop.example/v0/interrogation', 'https://shop.example/v1/interrogation']);

    // What History receives is that
    const saved = [];
    t.context.checkCookies = async () => [];
    t.context.saveToHistory = async (tabId, data) => { saved.push(data); return { id: 'saved' }; };
    await t.context.handleImpervaCaptureCompleted(7, t.state());
    assert.equal(saved.length, 1);
    assert.deepEqual(Array.from(saved[0].incapResourceUrls), ['https://shop.example/_Incapsula_Resource']);
    assert.equal(saved[0].interrogationUrls.length, 20);
});

test('FunCaptcha: a stop with nothing running answers with the status the popup accepts', async () => {
    const f = fixture(), context = f.load('funcaptcha');
    context.funcaptchaInitializeInterceptor(new Map());
    const response = await context.funcaptchaStopCapture(4);
    assert.equal(response.status, 'not_capturing');
    // The popup's stop accepts exactly that answer
    const errors = [];
    const popup = { console, window: {}, Logger: { debug() {}, error() {}, network() {} },
        NotificationHelper: { error: text => errors.push(text), info() {}, success() {} },
        document: { querySelector: () => null }, I18n: undefined };
    vm.createContext(popup);
    vm.runInContext(read('sections/advanced/base-advanced-module.js'), popup);
    const module = Object.create(popup.window.BaseAdvancedModule.prototype);
    Object.assign(module, { moduleName: 'funcaptcha', tabInfo: { id: 4 }, captureStateRevision: 0, isCapturing: true,
        sendMessage: async () => response, renderCapturedDataSection: async () => {}, getToolHint: () => '' });
    await module.stopCapturing();
    assert.deepEqual(errors, []);
    assert.equal(module.isCapturing, false);
});

test('hCaptcha: the 60 s timeout tells the page and the popup instead of dropping the capture silently', async () => {
    const f = fixture(), context = f.load('hcaptcha');
    const states = new Map();
    context.hcaptchaInitializeInterceptor(states);
    const { job } = context.AdvancedJobManager.begin({ tabId: 7, vendorId: 'hcaptcha', operation: 'capture', requestId: 'cap-1' });
    context.hcaptchaStartCapture(7, 'https://shop.example/');
    context.AdvancedJobManager.bindCaptureState(states.get(7), job);
    await f.tick(60000);
    assert.equal(states.has(7), false);
    assert.equal(job.status, 'completed');
    const warning = f.notices.find(notice => notice.type === 'warning');
    assert.ok(warning, 'a timeout notice is shown');
    assert.equal(warning.message.fallback, 'No hCaptcha data detected (60s timeout)');
    const done = f.messages.find(message => message.type === 'HCAPTCHA_CAPTURE_COMPLETED');
    assert.equal(done.reason, 'timeout');
    assert.equal(done.requestId, 'cap-1');
    assert.equal(done.tabId, 7);
    assert.equal(f.saves.length, 0);
});

test('hCaptcha: two checksiteconfig requests in flight complete the capture once', async () => {
    const f = fixture(), context = f.load('hcaptcha');
    const pending = [];
    context.fetch = () => new Promise(resolve => pending.push(() => resolve({ json: async () => ({ features: {} }) })));
    const states = new Map();
    context.hcaptchaInitializeInterceptor(states);
    context.hcaptchaStartCapture(7, 'https://shop.example/');
    const [listener] = Array.from(f.context.chrome.webRequest.onBeforeRequest.listeners);
    const url = 'https://api.hcaptcha.com/checksiteconfig?v=1b0b8a6&host=shop.example&sitekey=a5f74b19-9e45-40e0-b45d-47ff91b7a6c2&sc=1';
    listener({ tabId: 7, url });
    listener({ tabId: 7, url: url + '&again=1' });
    assert.equal(pending.length, 2);
    pending.forEach(resolve => resolve());
    await flush();
    await flush();
    assert.equal(f.saves.length, 1, 'one History entry');
    assert.equal(f.messages.filter(message => message.type === 'HCAPTCHA_CAPTURE_COMPLETED').length, 1);
    // A late stop after completion does not run a second completion either
    assert.equal(context.hcaptchaStopCapture(7).status, 'not_capturing');
});

test('Reload helpers wait for the main frame to load, with a time limit', async () => {
    const f = fixture(), reloadTabAndWait = f.context.BaseInterceptorHelpers.reloadTabAndWait;
    const loaded = reloadTabAndWait(3, { timeoutMs: 15000 });
    await flush();
    assert.deepEqual(f.reloads, [3]);
    f.context.chrome.webNavigation.onCompleted.emit({ tabId: 3, frameId: 2 });
    f.context.chrome.webNavigation.onCompleted.emit({ tabId: 4, frameId: 0 });
    f.context.chrome.webNavigation.onCompleted.emit({ tabId: 3, frameId: 0 });
    assert.equal(await loaded, true);
    assert.equal(f.context.chrome.webNavigation.onCompleted.listeners.size, 0);
    const slow = reloadTabAndWait(3, { timeoutMs: 15000 });
    await f.tick(15000);
    assert.equal(await slow, false);
    assert.equal(f.context.chrome.webNavigation.onCompleted.listeners.size, 0);
    // No fixed sleeps left in GeeTest or Akamai's Analyze Content
    assert.doesNotMatch(read('background/advanced/vendors/geetest/interceptor.js'), /\}, 3000\)/);
    assert.doesNotMatch(read('sections/advanced/vendors/akamai/actions.js'), /setTimeout\(resolve, 2000\)/);
});

test('Popup reload helper resolves on the reloaded tab completing, not on another tab', async () => {
    let timerFn = null;
    const onUpdated = event();
    const context = { console, window: {}, Logger: { debug() {} }, FormatUtils: {}, document: { addEventListener() {} },
        setTimeout: fn => { timerFn = fn; return 1; }, clearTimeout() {},
        chrome: { tabs: { onUpdated, reload: async () => {} } } };
    vm.createContext(context);
    vm.runInContext(read('sections/advanced/advanced-utils.js'), context);
    const done = context.window.AdvancedUtils.reloadTabAndWait(5);
    await flush();
    onUpdated.emit(5, { status: 'complete' });
    onUpdated.emit(6, { status: 'loading' });
    onUpdated.emit(6, { status: 'complete' });
    onUpdated.emit(5, { status: 'loading' });
    onUpdated.emit(5, { status: 'complete' });
    assert.equal(await done, true);
    assert.equal(onUpdated.listeners.size, 0);
    assert.equal(typeof timerFn, 'function');
});

test('reCAPTCHA: a capture job ended by the worker cleanup also stops the shared request listener', () => {
    const f = fixture(), context = f.load('recaptcha');
    const states = new Map();
    context.reCaptchaInitializeInterceptor(states);
    const { job } = context.AdvancedJobManager.begin({ tabId: 7, vendorId: 'recaptcha', operation: 'capture' });
    const state = { isCapturing: true };
    states.set(7, state);
    context.startRecaptchaInterception();
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 1);
    // The worker's job cleanup removes the tab's state first (tab closed, page left)
    job.addCleanup(() => states.delete(7));
    job.finish('cancelled');
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 0);
    assert.equal(context.recaptchaInterceptionListener, null);
});

test('Captures panel binds only its own grid, once per card', () => {
    const context = { console, window: {}, Advanced: function() {}, document: { querySelectorAll() { throw new Error('document-wide query'); } } };
    vm.createContext(context);
    vm.runInContext(read('sections/advanced/history/controller.js'), context);
    const card = { listeners: [], getAttribute: key => (key === 'data-module-id' ? 'akamai' : 'c1'), querySelector: () => null,
        addEventListener(type) { this.listeners.push(type); } };
    const grid = { querySelectorAll: selector => (selector === '.capture-card' ? [card] : []) };
    const advanced = new context.Advanced();
    advanced.setupCaptureCardListeners(grid);
    advanced.setupCaptureCardListeners(grid);
    assert.deepEqual(card.listeners, ['click', 'keydown']);
    assert.doesNotThrow(() => advanced.setupCaptureCardListeners());
});

test('Vendor Captured Data binds only its own list, once per element', () => {
    const make = () => ({ listeners: [], getAttribute: () => 'c1', addEventListener(type) { this.listeners.push(type); } });
    const card = make(), expand = make(), img = make();
    const list = { querySelectorAll: selector => ({ '.capture-card': [card], '.capture-expand': [expand], 'img[data-fallback]': [img] })[selector] || [] };
    const asked = [];
    const context = { console, window: {}, Logger: { debug() {}, error() {} },
        document: { querySelector: selector => { asked.push(selector); return selector === '#akamaiHistoryList' ? list : null; },
            querySelectorAll() { throw new Error('document-wide query'); } } };
    vm.createContext(context);
    vm.runInContext(read('sections/advanced/base-advanced-module.js'), context);
    vm.runInContext(read('sections/advanced/history/module-history.js'), context);
    const module = Object.create(context.window.BaseAdvancedModule.prototype);
    module.moduleName = 'akamai';
    module.setupExpandListeners();
    module.setupExpandListeners();
    assert.deepEqual(asked, ['#akamaiHistoryList', '#akamaiHistoryList']);
    assert.deepEqual(card.listeners, ['click']);
    assert.deepEqual(expand.listeners, ['click']);
    assert.deepEqual(img.listeners, ['error']);
});

test('one capture with an address that does not parse no longer empties Advanced → History', () => {
    const context = { console, URL, window: {}, Advanced: function() {}, document: {} };
    vm.createContext(context);
    vm.runInContext(read('sections/advanced/history/controller.js'), context);
    const site = vm.runInContext('_advCaptureSite', context);
    assert.equal(site('https://shop.example/login'), 'shop.example');
    assert.equal(site('not an address'), 'unknown');
    assert.equal(site(''), 'unknown');
    assert.equal(site(undefined), 'unknown');
    assert.doesNotMatch(read('sections/advanced/history/controller.js'), /new URL\(capture\.url\)/, 'every capture list uses the guarded form');
});
