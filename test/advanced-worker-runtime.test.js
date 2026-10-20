const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const flush = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };
function event() {
    const listeners = new Set();
    return { listeners, addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener),
        emit(...args) { for (const listener of Array.from(listeners)) listener(...args); } };
}
function fixture(initial = {}) {
    let saved = structuredClone(initial), failNextWrite = false, nextTimer = 0;
    const timers = new Map(), messages = [], writes = [];
    const context = { URL, TextDecoder, Uint8Array, console,
        Logger: { debug() {}, network() {}, warn() {}, error() {} },
        UrlUtils: { normalizeFaviconForStorage: () => '' },
        setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
        clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
        chrome: {
            tabs: { onRemoved: event(), onUpdated: event(), get: async id => ({ id, url: 'https://example.test/' }) },
            webNavigation: { onCompleted: event(), onCommitted: event() },
            webRequest: { onBeforeRequest: event(), onResponseStarted: event(), onBeforeSendHeaders: event() },
            runtime: { async sendMessage(message) { messages.push(message); throw new Error('Popup closed'); } },
            storage: { local: {
                async get() { await Promise.resolve(); return structuredClone({ scrapfly_advanced_history: saved }); },
                async set(value) { await Promise.resolve(); if (failNextWrite) { failNextWrite = false; throw new Error('quota'); }
                    saved = structuredClone(value.scrapfly_advanced_history); writes.push(saved); }
            } }
        }
    };
    context.self = context;
    vm.createContext(context);
    for (const file of ['modules/core/capture-retention.js', 'modules/advanced/vendor-registry.js', 'modules/advanced/result-model.js',
        'background/advanced/history-store.js', 'background/advanced/page-notice.js',
        'background/advanced/collector-utils.js', 'background/advanced/job-manager.js', 'background/advanced/script-analysis.js']) {
        vm.runInContext(read(file), context, { filename: file });
    }
    return { context, timers, messages, writes, saved: () => saved, fail: () => { failNextWrite = true; },
        async tick(delay) { const matching = Array.from(timers).filter(([, timer]) => timer.delay === delay);
            for (const [id, timer] of matching) { timers.delete(id); timer.fn(); } await flush(); } };
}

test('Advanced history serializes concurrent vendors and retries a failed write without losing later captures', async () => {
    const f = fixture(), store = f.context.AdvancedHistoryStore;
    const tasks = Array.from({ length: 40 }, (_, i) => store.appendCapture(i % 2 ? 'cloudflare' : 'akamai', { id: `capture-${i}`, data: { number: i } }));
    await Promise.all(tasks);
    assert.equal(f.saved().cloudflare.length, 20);
    assert.equal(f.saved().akamai.length, 20);
    f.fail();
    await assert.rejects(store.appendCapture('cloudflare', { id: 'failed' }), /quota/);
    await store.appendCapture('akamai', { id: 'after-failure' });
    assert.equal(f.saved().akamai[0].id, 'after-failure');
    assert.equal(f.saved().cloudflare.some(item => item.id === 'failed'), false);
});

test('history completion IDs deduplicate retries and expiry pruning preserves concurrent appends', async () => {
    const f = fixture({ cloudflare: [{ id: 'old', timestamp: 1, expiresAt: 2, captureData: { old: true } }] });
    const store = f.context.AdvancedHistoryStore;
    await Promise.all([store.appendCapture('cloudflare', { id: 'same', data: { scripts: [] } }),
        store.pruneExpired(), store.appendCapture('cloudflare', { id: 'same', data: { scripts: [] } })]);
    assert.equal(f.saved().cloudflare.length, 1);
    assert.equal(f.saved().cloudflare[0].id, 'same');
});

test('legacy Advanced history stays readable without changing its storage key', async () => {
    const f = fixture({ items: [{ id: 'legacy', type: 'recaptcha', timestamp: 10, captureData: { siteKey: 'public-test-key' } }] });
    const history = await f.context.AdvancedHistoryStore.load();
    assert.equal(history.recaptcha[0].data.siteKey, 'public-test-key');
    assert.equal(history.recaptcha[0].captureData.siteKey, 'public-test-key');
    assert.equal(f.context.AdvancedHistoryStore.STORAGE_KEY, 'scrapfly_advanced_history');
});

function analysis(f, vendorId, tabId = 7) {
    return f.context.AdvancedScriptAnalysis.start({ tabId, vendorId, url: 'https://example.test/', classify: url => url.includes(vendorId) ? vendorId : null });
}

test('simultaneous vendors and tabs have isolated jobs and duplicate starts reuse listeners', async () => {
    const f = fixture();
    const first = analysis(f, 'cloudflare'), second = analysis(f, 'datadome'), otherTab = analysis(f, 'cloudflare', 8);
    const duplicate = analysis(f, 'cloudflare');
    assert.equal(duplicate.requestId, first.requestId);
    assert.equal(duplicate.reused, true);
    assert.notEqual(second.requestId, first.requestId);
    assert.notEqual(otherTab.requestId, first.requestId);
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 3);
    f.context.chrome.tabs.onRemoved.emit(7);
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 1);
    assert.equal(f.context.AdvancedJobManager.state(8, 'cloudflare', 'analysis').status, 'running');
    await flush();
});

test('analysis times out without navigation and disposes network listeners and timers', async () => {
    const f = fixture();
    const started = analysis(f, 'turnstile');
    await f.tick(30000);
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 0);
    assert.equal(f.context.chrome.webNavigation.onCompleted.listeners.size, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0].status, 'timeout');
    assert.equal(f.messages[0].requestId, started.requestId);
    assert.equal(f.writes.length, 0, 'timeout is not a completed-empty result');
});

test('a page that reloads but never finishes loading reports the scripts seen by the limit', async () => {
    const f = fixture();
    const started = analysis(f, 'turnstile');
    f.context.chrome.webRequest.onBeforeRequest.emit({ tabId: 7, type: 'main_frame', url: 'https://turnstile.example.test/' });
    f.context.chrome.webRequest.onBeforeRequest.emit({ tabId: 7, type: 'script', url: 'https://challenges.turnstile.test/api.js' });
    await f.tick(30000);
    assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0].status, 'completed');
    assert.equal(f.messages[0].requestId, started.requestId);
    assert.deepEqual(Array.from(f.messages[0].data.scripts, script => script.url), ['https://challenges.turnstile.test/api.js'],
        'the reloaded page is not listed as one of its own scripts');
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 0);
    assert.equal(f.timers.size, 0);
});

test('analysis observes once for five seconds, persists while popup is closed, and reports request identity', async () => {
    const f = fixture();
    const started = analysis(f, 'cloudflare');
    f.context.chrome.tabs.onUpdated.emit(7, { url: 'https://example.test/', status: 'loading' });
    f.context.chrome.webRequest.onBeforeRequest.emit({ tabId: 8, url: 'https://cloudflare.test/wrong.js' });
    f.context.chrome.webRequest.onBeforeRequest.emit({ tabId: 7, url: 'https://cloudflare.test/api.js' });
    f.context.chrome.webNavigation.onCompleted.emit({ tabId: 7, frameId: 0 });
    f.context.chrome.webNavigation.onCompleted.emit({ tabId: 7, frameId: 0 });
    assert.equal(Array.from(f.timers.values()).filter(timer => timer.delay === 5000).length, 1);
    await f.tick(5000);
    assert.equal(f.saved().cloudflare.length, 1);
    assert.equal(f.saved().cloudflare[0].id, started.requestId);
    assert.equal(f.saved().cloudflare[0].data.result.scripts.length, 1);
    assert.equal(f.messages[0].status, 'completed');
    assert.equal(f.messages[0].tabId, 7);
    assert.equal(f.messages[0].vendorId, 'cloudflare');
    assert.equal(f.messages[0].operation, 'analysis');
    await f.tick(30000);
    assert.equal(f.messages.length, 1);
});

test('navigating elsewhere cancels an analysis but its expected same-page reload survives', async () => {
    const f = fixture();
    analysis(f, 'cloudflare');
    f.context.chrome.tabs.onUpdated.emit(7, { url: 'https://example.test/' });
    assert.equal(f.context.AdvancedJobManager.state(7, 'cloudflare', 'analysis').status, 'running');
    f.context.chrome.tabs.onUpdated.emit(7, { url: 'https://other.test/' });
    assert.equal(f.context.AdvancedJobManager.state(7, 'cloudflare', 'analysis').status, 'cancelled');
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 0);
    await flush();
});

test('managed listener cleanup removes only the stopping vendor on the requested tab', () => {
    const f = fixture(), removed = [], helpers = f.context.BaseInterceptorHelpers;
    for (const [tab, kind] of [[7, 'recaptcha-navigation'], [7, 'hcaptcha-capture'], [8, 'recaptcha-navigation']]) {
        helpers.registerManagedListener(tab, kind, () => {}, () => removed.push(`${tab}:${kind}`));
    }
    assert.equal(helpers.cleanupManagedListeners(7, 'recaptcha'), 1);
    assert.deepEqual(removed, ['7:recaptcha-navigation']);
    assert.equal(helpers.cleanupManagedListeners(7, 'hcaptcha'), 1);
    assert.equal(helpers.cleanupManagedListeners(8), 1);
});

test('reCAPTCHA shared interception remains active while another tab is capturing', () => {
    const f = fixture();
    vm.runInContext(read('background/advanced/vendors/recaptcha/interceptor.js'), f.context);
    const states = new Map([[7, { isCapturing: false }], [8, { isCapturing: true }]]);
    f.context.reCaptchaInitializeInterceptor(states);
    f.context.startRecaptchaInterception();
    f.context.stopRecaptchaInterception();
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 1);
    states.delete(8);
    f.context.stopRecaptchaInterception();
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 0);
});

test('new structured tool results and old text results both render without reading a dialog', () => {
    const f = fixture(), model = f.context.AdvancedResultModel;
    const result = model.create({ vendorId: 'cloudflare', operation: 'sitekeys', data: ['public-test-key'] });
    assert.match(model.text(result), /public-test-key/);
    assert.equal(model.text({ lines: ['old', 'capture'] }), 'old\ncapture');
});

test('capture dispatch reuses pending starts and cancelled initialization cannot erase a replacement capture', () => {
    const f = fixture(), context = f.context;
    const pending = [];
    context.reCaptchaCaptureState = new Map();
    context.reCaptchaHandleMessage = (request, sendResponse) => { pending.push(() => {
        context.reCaptchaCaptureState.set(request.tabId, { isCapturing: true, captureUrl: request.url });
        sendResponse({ status: 'started' });
    }); return true; };
    vm.runInContext(read('modules/core/message-types.js'), context);
    vm.runInContext(read('modules/core/message-sender.js'), context);
    vm.runInContext(read('background/handlers/messages-advanced-capture.js'), context);
    const registry = {};
    context.registerAdvancedCaptureHandlers(registry, {});
    const replies = [];
    const args = { request: { type: 'RECAPTCHA_START_CAPTURE', tabId: 7, url: 'https://example.test/' },
        sendResponse: reply => replies.push(reply) };
    registry.RECAPTCHA_START_CAPTURE(args);
    registry.RECAPTCHA_START_CAPTURE(args);
    assert.equal(pending.length, 1);
    assert.equal(replies[0].status, 'already_capturing');
    context.AdvancedJobManager.cancelTab(7);
    registry.RECAPTCHA_START_CAPTURE(args);
    assert.equal(replies[1].status, 'error', 'cancelled initialization must settle before a new start');
    pending.shift()();
    assert.equal(context.reCaptchaCaptureState.size, 0);
    registry.RECAPTCHA_START_CAPTURE(args);
    pending.shift()();
    assert.equal(context.reCaptchaCaptureState.size, 1);
    assert.equal(replies.at(-1).status, 'started');
    assert.notEqual(replies.at(-1).requestId, replies[0].requestId);
});

test('analysis storage failure reports failure and still removes worker listeners', async () => {
    const f = fixture();
    analysis(f, 'cloudflare');
    f.fail();
    f.context.chrome.webNavigation.onCompleted.emit({ tabId: 7, frameId: 0 });
    await f.tick(5000);
    assert.equal(f.messages[0].status, 'error');
    assert.equal(f.messages[0].error, 'quota');
    assert.equal(f.context.chrome.webRequest.onBeforeRequest.listeners.size, 0);
});

test('closing popup disposes only subscriptions and sends no capture stop', () => {
    const listeners = event(), lifecycle = {};
    const context = { window: { addEventListener: (name, listener) => { lifecycle[name] = listener; } },
        chrome: { runtime: { onMessage: listeners, sendMessage() { assert.fail('closing popup must not send a stop'); } } } };
    vm.runInNewContext(read('sections/advanced/runtime/tool-client.js'), context);
    const client = context.window.AdvancedToolClient;
    const listener = () => {};
    client.subscribe(listener);
    client.subscribe(listener);
    assert.equal(listeners.listeners.size, 1);
    lifecycle.pagehide();
    assert.equal(listeners.listeners.size, 0);
});

test('FunCaptcha stopping one tab retains the other listener and permits a fresh capture job', async () => {
    const f = fixture(), context = f.context;
    vm.runInContext(read('background/advanced/vendors/funcaptcha/interceptor.js'), context);
    context.showNotification = null;
    const states = new Map([[7, { isCapturing: true, capturedData: [] }], [8, { isCapturing: true, capturedData: [] }]]);
    context.funcaptchaInitializeInterceptor(states);
    const { job } = context.AdvancedJobManager.begin({ tabId: 7, vendorId: 'funcaptcha', operation: 'capture' });
    context.AdvancedJobManager.bindCaptureState(states.get(7), job);
    context.startFuncaptchaInterception(7);
    context.startFuncaptchaInterception(8);
    await context.funcaptchaStopCapture(7);
    assert.equal(context.chrome.webRequest.onBeforeRequest.listeners.size, 1);
    assert.equal(states.get(8).isCapturing, true);
    assert.equal(context.AdvancedJobManager.state(7, 'funcaptcha', 'capture').status, 'completed');
    const next = context.AdvancedJobManager.begin({ tabId: 7, vendorId: 'funcaptcha', operation: 'capture' });
    assert.equal(next.reused, false);
});

for (const vendorId of ['akamai', 'imperva', 'hcaptcha', 'funcaptcha', 'recaptcha']) {
    test(`${vendorId} late completion retains its identity and cannot erase the next capture`, async () => {
        const f = fixture(), context = f.context;
        vm.runInContext(read(`background/advanced/vendors/${vendorId}/interceptor.js`), context);
        context.showNotification = null;
        context.checkCookies = async () => [];
        const oldState = { isCapturing: true, capturedData: [{ websiteKey: 'public-test-key' }], anchorData: {}, reloadData: [] };
        const states = new Map([[7, oldState]]);
        const prefix = vendorId === 'recaptcha' ? 'reCaptcha' : vendorId;
        context[`${prefix}InitializeInterceptor`](states);
        const oldJob = context.AdvancedJobManager.begin({ tabId: 7, vendorId, operation: 'capture', requestId: 'old-job' }).job;
        context.AdvancedJobManager.bindCaptureState(oldState, oldJob);
        let finishSave;
        context.saveToHistory = () => new Promise(resolve => { finishSave = resolve; });
        context.processCaptureData = async () => [{ siteKey: 'public-test-key' }];
        const completion = vendorId === 'funcaptcha' ? context.funcaptchaStopCapture(7)
            : vendorId === 'recaptcha' ? context.reCaptchaStopCapture(7)
            : context[{ akamai: 'handleAkamaiCaptureCompleted', imperva: 'handleImpervaCaptureCompleted', hcaptcha: 'handleHCaptchaCaptureCompleted' }[vendorId]](7, {});
        await flush();
        assert.equal(typeof finishSave, 'function', 'completion reached asynchronous history write');
        oldJob.finish('cancelled');
        const replacement = { isCapturing: true };
        states.set(7, replacement);
        const nextJob = context.AdvancedJobManager.begin({ tabId: 7, vendorId, operation: 'capture', requestId: 'new-job' }).job;
        context.AdvancedJobManager.bindCaptureState(replacement, nextJob);
        finishSave({ id: 'saved' });
        await completion;
        assert.equal(states.get(7), replacement);
        assert.equal(nextJob.finished, false);
        assert.equal(f.messages.at(-1)?.requestId, 'old-job');
        assert.equal(f.messages.at(-1)?.vendorId, vendorId);
    });
}

test('a delayed stop acknowledgement finishes only the job it was dispatched for', () => {
    const f = fixture(), context = f.context;
    let acknowledge;
    context.reCaptchaCaptureState = new Map();
    context.reCaptchaHandleMessage = (_, sendResponse) => { acknowledge = sendResponse; return true; };
    vm.runInContext(read('modules/core/message-types.js'), context);
    vm.runInContext(read('modules/core/message-sender.js'), context);
    vm.runInContext(read('background/handlers/messages-advanced-capture.js'), context);
    const registry = {}, replies = [];
    context.registerAdvancedCaptureHandlers(registry, {});
    const old = context.AdvancedJobManager.begin({ tabId: 7, vendorId: 'recaptcha', operation: 'capture', requestId: 'old-job' }).job;
    registry.RECAPTCHA_STOP_CAPTURE({ request: { type: 'RECAPTCHA_STOP_CAPTURE', tabId: 7 }, sendResponse: value => replies.push(value) });
    old.finish('cancelled');
    const next = context.AdvancedJobManager.begin({ tabId: 7, vendorId: 'recaptcha', operation: 'capture', requestId: 'next-job' }).job;
    acknowledge({ status: 'stopped' });
    assert.equal(next.finished, false);
    assert.equal(replies[0].requestId, 'old-job');
});

test('an old Imperva completion timer does not complete the next capture', async () => {
    const f = fixture(), context = f.context;
    vm.runInContext(read('background/advanced/vendors/imperva/interceptor.js'), context);
    const state = { foundCookies: { reese84: true }, incapResourceUrls: [], interrogationUrls: [] };
    const states = new Map([[7, state]]);
    context.impervaInitializeInterceptor(states);
    let completed = 0;
    context.handleImpervaCaptureCompleted = () => { completed++; };
    context.checkAndCompleteCapture(7);
    const next = { ...state };
    states.set(7, next);
    await f.tick(5000);
    assert.equal(completed, 0);
    assert.equal(next.completed, undefined);
});
