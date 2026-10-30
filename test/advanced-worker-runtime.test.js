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

test('a saved capture takes every tool\'s expired captures with it; a private window\'s capture is never saved', async () => {
    const f = fixture({ cloudflare: [{ id: 'expired', timestamp: 1, expiresAt: 2, captureData: { cookie: 'cf_clearance=SYNTHETIC' } }],
        akamai: [{ id: 'live', timestamp: Date.now(), expiresAt: Date.now() + 60000, captureData: {} }] });
    await f.context.AdvancedHistoryStore.appendCapture('recaptcha', { id: 'new', data: {} });
    assert.deepEqual(f.saved().cloudflare, [], 'expired cookie values do not wait for Advanced to be opened');
    assert.equal(f.saved().akamai[0].id, 'live');

    f.context.chrome.tabs.get = async id => ({ id, url: 'https://private.example/', incognito: true });
    const result = await f.context.saveToHistory(7, { cookie: 'datadome=SYNTHETIC' }, { type: 'datadome' });
    assert.equal(result.notSaved, true);
    assert.equal(f.saved().datadome, undefined, 'nothing kept from a private window');
});

test('a private window\'s capture is kept in memory only: listed with the others, never in storage.local, deletable', async () => {
    const f = fixture(), context = f.context;
    const memory = {};
    context.chrome.storage.session = {
        async get(keys) { await Promise.resolve(); return structuredClone(Object.fromEntries([].concat(keys).filter(k => k in memory).map(k => [k, memory[k]]))); },
        async set(value) { await Promise.resolve(); Object.assign(memory, structuredClone(value)); }
    };
    const store = context.AdvancedHistoryStore;
    assert.equal(store.canKeepPrivate(), true);
    context.chrome.tabs.get = async id => ({ id, url: 'https://private.example/', incognito: true });
    const kept = await context.saveToHistory(7, { cookie: 'datadome=SYNTHETIC' }, { type: 'datadome' });
    assert.notEqual(kept.notSaved, true, 'shown with the others, not dropped');
    assert.deepEqual((f.saved().datadome || []).length, 0, 'nothing of it in storage.local');
    assert.equal(memory[store.PRIVATE_KEY].datadome.length, 1, 'kept in memory');
    const loadedPrivate = (await store.load()).datadome[0];
    assert.equal(loadedPrivate.privateSession, true);
    assert.equal(loadedPrivate.captureData, loadedPrivate.data, 'a private entry reads back with both names, as the stored ones do');

    context.chrome.tabs.get = async id => ({ id, url: 'https://shop.example/', incognito: false });
    await context.saveToHistory(8, { cookie: 'datadome=OTHER' }, { type: 'datadome' });
    assert.equal(f.saved().datadome.length, 1, 'a normal window\'s capture is stored as before');
    assert.equal(f.saved().datadome[0].privateSession, undefined);
    const both = (await store.getModule('datadome'));
    assert.equal(both.length, 2, 'both are listed');

    await store.deleteCapture('datadome', kept.id);
    assert.equal((await store.getModule('datadome')).length, 1);
    assert.deepEqual(memory[store.PRIVATE_KEY], {}, 'the private one is gone from memory');
    await context.chrome.tabs.get(7);
    context.chrome.tabs.get = async id => ({ id, url: 'https://private.example/', incognito: true });
    await context.saveToHistory(7, { cookie: 'datadome=AGAIN' }, { type: 'datadome' });
    await store.clear();
    assert.deepEqual(memory[store.PRIVATE_KEY], {}, 'Clear all takes the private ones too');
});

test('a capture is written once: storage holds `data`, loading gives readers of the older `captureData` name the same object', async () => {
    const f = fixture({ akamai: [{ id: 'old', timestamp: Date.now(), expiresAt: Date.now() + 60000, captureData: { cookie: 'a' } }] });
    const store = f.context.AdvancedHistoryStore;
    await store.appendCapture('cloudflare', { id: 'new', data: { cookie: 'b' }, captureData: { cookie: 'b' } });
    const stored = f.saved();
    assert.equal('captureData' in stored.cloudflare[0], false, 'not written twice');
    assert.deepEqual(stored.cloudflare[0].data, { cookie: 'b' });
    assert.equal('captureData' in stored.akamai[0], false, 'an older entry is written once with the next write');
    assert.deepEqual(stored.akamai[0].data, { cookie: 'a' }, 'and keeps what it held');
    const loaded = await store.load();
    assert.equal(loaded.cloudflare[0].captureData, loaded.cloudflare[0].data, 'both names for readers');
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.akamai[0].captureData)), { cookie: 'a' });
});

test('FunCaptcha: two stops of the same capture (Stop pressed during the auto-stop) save its entries once', async () => {
    const f = fixture(), context = f.context;
    vm.runInContext(read('background/advanced/vendors/funcaptcha/interceptor.js'), context);
    context.showNotification = null;
    const capture = { publicKey: 'SYNTHETIC-KEY', apiDomain: 'client-api.arkoselabs.com' };
    const states = new Map([[7, { isCapturing: true, capturedData: [capture] }]]);
    context.funcaptchaInitializeInterceptor(states);
    const { job } = context.AdvancedJobManager.begin({ tabId: 7, vendorId: 'funcaptcha', operation: 'capture' });
    context.AdvancedJobManager.bindCaptureState(states.get(7), job);
    const [first, second] = await Promise.all([context.funcaptchaStopCapture(7, 'captured'), context.funcaptchaStopCapture(7, 'manual')]);
    assert.equal(second.status, 'stopping');
    assert.notEqual(first.status, 'stopping');
    assert.equal((f.saved().funcaptcha || []).length, 1, 'one entry, saved once');
});

for (const vendorId of ['akamai', 'imperva']) {
    test(`${vendorId}: a capture that ends without its own stop (tab closed, page left) takes the request listener on every page with it`, async () => {
        const f = fixture(), context = f.context;
        vm.runInContext(read(`background/advanced/vendors/${vendorId}/interceptor.js`), context);
        const states = new Map([[7, { isCapturing: true }]]);
        context[`${vendorId}InitializeInterceptor`](states);
        const listener = () => {};
        context.chrome.webRequest.onBeforeRequest.addListener(listener);
        vm.runInContext(`${vendorId}InterceptionListener = this.__listener`, Object.assign(context, { __listener: listener }));
        const { job } = context.AdvancedJobManager.begin({ tabId: 7, vendorId, operation: 'capture' });
        context.AdvancedJobManager.bindCaptureState(states.get(7), job);
        states.delete(7); // the job's own cleanup when the tab closes
        job.finish('cancelled');
        assert.equal(context.chrome.webRequest.onBeforeRequest.listeners.size, 0, 'no listener left on every request');
    });
}

test('reCAPTCHA auto-stop marks the capture stopped before it awaits the save, as a manual stop does', () => {
    const source = read('background/advanced/vendors/recaptcha/interceptor.js');
    const auto = source.slice(source.indexOf('const captureTimeout = setTimeout'));
    const stopped = auto.indexOf('captureState.isCapturing = false');
    const saved = auto.indexOf('await saveRecaptchaResults');
    assert.ok(stopped > 0 && saved > 0, 'both steps are there');
    assert.ok(stopped < saved, 'a Stop or a late request during the save finds the capture stopped and saves nothing twice');
    // A manual Stop while the auto-stop saves (or a second Stop) returns at once: the first one reports when it is done
    assert.ok(auto.indexOf('captureState.stopping = true') > 0 && auto.indexOf('captureState.stopping = true') < saved, 'the auto-stop claims the capture first');
    assert.match(source, /if \(stateStop\.stopping\) return \{ status: 'stopping'/);
    assert.match(source, /stateStop\.stopping = true;/);
});

test('hCaptcha: the worker fetches a checksiteconfig address the page named only when it is https on a public name', async () => {
    const f = fixture(), context = f.context;
    vm.runInContext(read('background/advanced/vendors/hcaptcha/interceptor.js'), context);
    const fetched = [];
    context.fetch = async (url, options) => { fetched.push([url, options]); return { json: async () => ({ features: { custom_theme: true } }) }; };
    const refused = ['http://192.168.1.1/cgi-bin/x/checksiteconfig?v=1', 'https://192.168.1.1/checksiteconfig', 'https://[::1]/checksiteconfig',
        'https://localhost/checksiteconfig', 'https://nas.local/checksiteconfig', 'https://intranet/checksiteconfig', 'https://user:pw@hcaptcha.example.com/checksiteconfig',
        'ftp://hcaptcha.example.com/checksiteconfig', 'not a url'];
    for (const url of refused) assert.equal(await context.hcaptchaFetchFeatures(url), false, url);
    assert.deepEqual(fetched, [], 'nothing was requested for any of them');
    assert.equal(await context.hcaptchaFetchFeatures('https://hcaptcha.shop.example/checksiteconfig?v=1&host=a&sitekey=b'), true, 'a public https name, an Enterprise custom endpoint');
    assert.equal(fetched.length, 1);
    assert.deepEqual({ ...fetched[0][1] }, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' }, 'no cookies, no redirect followed');
});

