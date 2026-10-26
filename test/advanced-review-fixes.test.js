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
