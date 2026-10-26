'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// GeeTest, Imperva and Shape Security's Analyze Scripts read the page as already loaded first (no reload, so the
// popup stays open); only a page where nothing of the vendor is found goes on to the old reload flow.

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// ---- Worker: each vendor's loaded-page reader ------------------------------------------------------------------

function worker({ frames = [], recorded = [], cookies = [], scriptingFails = false } = {}) {
  const calls = [];
  const context = vm.createContext({
    console, URL, TextDecoder, Date, Map, Set,
    Logger: { network() {}, debug() {}, error() {} },
    networkUrlsStore: new Map([[9, recorded]]),
    chrome: {
      tabs: { get: async id => ({ id, url: 'https://www.shop.test/login' }), reload: async id => { calls.push(['reload', id]); } },
      scripting: {
        async executeScript(options) {
          calls.push(['executeScript', options]);
          if (scriptingFails) throw new Error('Cannot access a chrome:// URL');
          return frames.map(result => ({ result }));
        }
      },
      webRequest: { onBeforeRequest: { addListener() {}, removeListener() {} } },
      webNavigation: { onCompleted: { addListener() {}, removeListener() {} } },
      runtime: { sendMessage: async () => {} }
    }
  });
  context.self = context;
  context.globalThis = context;
  context.BaseInterceptorHelpers = {
    // The real helper matches by name pattern; the cookies given are the page's Imperva cookies
    checkCookies: async () => cookies
  };
  for (const file of ['background/advanced/script-analysis.js', 'background/advanced/vendors/imperva/interceptor.js',
    'background/advanced/vendors/shapesecurity/interceptor.js', 'background/advanced/vendors/geetest/interceptor.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return { context, calls };
}

test('the loaded-page readers are found by vendor; the other vendors keep the classified URL list', () => {
  const { context } = worker();
  const A = context.AdvancedScriptAnalysis;
  assert.equal(A.readerFor('geetest'), context.geetestFromLoadedPage);
  assert.equal(A.readerFor('imperva'), context.impervaFromLoadedPage);
  assert.equal(A.readerFor('shapesecurity'), context.shapeSecurityFromLoadedPage);
  assert.equal(A.readerFor('cloudflare'), null);
});

test('GeeTest: the page\'s own findings, without a reload; nothing found says so', async () => {
  const finding = { type: 'v4', source: 'script-url', url: 'https://gcaptcha4.geetest.com/load?captcha_id=x' };
  const found = worker({ frames: [[finding]] });
  const result = await found.context.geetestFromLoadedPage(9);
  assert.deepEqual(plain(result), { data: { scripts: [finding] }, found: true });
  const run = found.calls.find(([kind]) => kind === 'executeScript')[1];
  assert.equal(run.world, 'MAIN');
  assert.equal(run.func, found.context.geetestPageFindings, 'the same in-page analysis the reload flow runs');
  assert.equal(found.calls.some(([kind]) => kind === 'reload'), false);

  const empty = worker({ frames: [null] });
  assert.deepEqual(plain(await empty.context.geetestFromLoadedPage(9)), { data: { scripts: [] }, found: false });
});

test('Imperva: Reese84 and UTMVC scripts from the loaded page, first in the list, with the cookies; no cookie deleted, no reload', async () => {
  const f = worker({
    frames: [[
      ['https://cdn.other.test/v/2/app.js', 'script'],
      ['https://www.shop.test/assets/1/main.js', 'script'],
      ['https://www.shop.test/api/cart/42', 'xmlhttprequest'],
      ['https://www.shop.test/Ifainesse-Thine-Wert/1234567890?s=1', 'script'],
      ['https://www.shop.test/logo.png', 'img']
    ]],
    recorded: [{ url: 'https://www.shop.test/_Incapsula_Resource?SWKMTFSR=1&e=0.123', type: 'script' }],
    cookies: [{ name: 'reese84', value: 'r' }, { name: 'incap_ses_1_2', value: 's' }]
  });
  const { data, found } = await f.context.impervaFromLoadedPage(9);
  assert.equal(found, true);
  assert.deepEqual(plain(data.scriptUrls), [
    'https://www.shop.test/Ifainesse-Thine-Wert/1234567890?s=1',
    'https://www.shop.test/_Incapsula_Resource?SWKMTFSR=1&e=0.123',
    'https://www.shop.test/assets/1/main.js',
    'https://www.shop.test/api/cart/42'
  ], 'another site\'s scripts and images are left out; the real scripts come first for the result window');
  assert.equal(data.hostname, 'www.shop.test');
  assert.equal(data.cookies.reese84.name, 'reese84');
  assert.equal(data.cookies.incap_ses.length, 1);
  assert.deepEqual(plain(data.payloads), [], 'challenge payloads are only seen while a reload is watched');
  assert.equal(f.calls.some(([kind]) => kind === 'reload'), false);
});

test('Imperva: a page with no Imperva script listed is not found (the reload flow runs); unscriptable pages use what the worker recorded', async () => {
  const none = worker({ frames: [[['https://www.shop.test/assets/1/main.js', 'script'], ['https://www.shop.test/api/cart/42', 'fetch']]] });
  assert.equal((await none.context.impervaFromLoadedPage(9)).found, false);
  const recorded = worker({ scriptingFails: true, recorded: [{ url: 'https://shop.test/Thine-Wert/987', type: 'script' }] });
  const result = await recorded.context.impervaFromLoadedPage(9);
  assert.equal(result.found, true);
  assert.deepEqual(plain(result.data.scriptUrls), ['https://shop.test/Thine-Wert/987']);
});

test('Shape Security: the reload flow\'s collection, run on the page as it is; only Shape\'s own loaders count as found', async () => {
  const seeded = 'https://www.shop.test/abc/init.js?seed=AAAA&X-abcdefgh-z=q';
  const f = worker({ frames: [[{ url: 'https://www.shop.test/abc/init.js' }, { url: seeded }]] });
  const { data, found } = await f.context.shapeSecurityFromLoadedPage(9);
  assert.equal(found, true);
  assert.deepEqual(plain(data.initJsUrls), ['https://www.shop.test/abc/init.js']);
  assert.deepEqual(plain(data.seedUrls), [seeded]);
  assert.equal(f.calls.find(([kind]) => kind === 'executeScript')[1].func, f.context.shapeSecurityPageScripts);
  assert.equal(f.calls.some(([kind]) => kind === 'reload'), false);

  const appOnly = worker({ frames: [[{ url: 'https://www.shop.test/app.js?async' }]] });
  assert.equal((await appOnly.context.shapeSecurityFromLoadedPage(9)).found, false, 'a page\'s own ?async script is not Shape');
});

// ---- Popup: loaded first, reload only when nothing is found ------------------------------------------------------

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function popup(vendor, className, loaded) {
  const calls = [], notes = [], shown = [];
  class BaseAdvancedModule {
    static _tr(key, fallback) { return fallback; }
    static _fmt(key, fallback) { return fallback; }
  }
  const context = vm.createContext({
    console, URL, BaseAdvancedModule,
    Logger: { network() {}, debug() {}, error() {} },
    NotificationHelper: { info: m => notes.push(['info', m]), success: m => notes.push(['success', m]),
      warning: m => notes.push(['warning', m]), error: m => notes.push(['error', m]) },
    AdvancedMessageTypes: { ADVANCED_LOADED_SCRIPTS: 'ADVANCED_LOADED_SCRIPTS' },
    AdvancedToolClient: { subscribe() { return () => {}; }, unsubscribe() {} },
    AdvancedUtils: {
      notifications: { analyzeScripts: { start: name => `Analyzing ${name} scripts... Page will reload`, success: n => `Scripts found: ${n}`, none: name => `No ${name} scripts found` }, captureRunning: () => 'capture running' },
      async sendMessage(message) {
        calls.push(['message', message.type, message]);
        return loaded;
      }
    },
    PageCookies: { getAll: async () => [{ name: 'reese84' }], remove: async (url, cookie) => { calls.push(['remove', cookie.name]); } },
    chrome: {
      runtime: {
        onMessage: { addListener() {}, removeListener() {} },
        async sendMessage(message) { calls.push(['message', message.type, message]); return { status: 'success' }; }
      },
      tabs: { reload: async id => { calls.push(['reload', id]); } }
    },
    setTimeout: () => 0, clearTimeout() {}
  });
  vm.runInContext(`${className} = class extends BaseAdvancedModule {};`, context);
  vm.runInContext(read('sections/advanced/components/script-results.js'), context);
  vm.runInContext(read(`sections/advanced/vendors/${vendor}/actions.js`), context);
  const Module = vm.runInContext(className, context);
  const instance = new Module();
  Object.assign(instance, { moduleName: vendor, displayName: vendor, tabInfo: { id: 9, url: 'https://www.shop.test/login' } });
  instance._txt = (key, fallback) => fallback;
  // The vendor's own message to the worker (GeeTest and Shape send it through the module)
  instance.sendMessage = async message => {
    calls.push(['message', message.type, message]);
    return message.type === 'GEETEST_ANALYZE_SCRIPTS' ? { scripts: [] } : { status: 'success' };
  };
  for (const name of ['displayScriptsModal', 'displayExtractionResults', 'displayScriptDataModal']) {
    instance[name] = data => shown.push([name, data]);
  }
  return { instance, calls, notes, shown, context };
}

const vendors = [
  { vendor: 'geetest', className: 'GeetestAdvanced', run: 'analyzeScripts', display: 'displayScriptsModal', reloadMessage: 'GEETEST_ANALYZE_SCRIPTS',
    data: { scripts: [{ type: 'v4', source: 'script-url', url: 'https://gcaptcha4.geetest.com/load' }] }, shownData: data => data.scripts },
  { vendor: 'imperva', className: 'ImpervaAdvanced', run: 'extractScripts', display: 'displayExtractionResults', reloadMessage: 'IMPERVA_EXTRACT_SCRIPTS',
    data: { scriptUrls: ['https://www.shop.test/Thine-Wert/987'], hostname: 'www.shop.test', cookies: {}, payloads: [], challengeUrls: [] }, shownData: data => data },
  { vendor: 'shapesecurity', className: 'ShapeSecurityAdvanced', run: 'extractScripts', display: 'displayScriptDataModal', reloadMessage: 'SHAPESECURITY_START_EXTRACTION',
    data: { initJsUrls: ['https://www.shop.test/abc/init.js'], seedUrls: [], allScripts: ['https://www.shop.test/abc/init.js'] }, shownData: data => data }
];

for (const { vendor, className, run, display, reloadMessage, data, shownData } of vendors) {
  test(`${vendor}: what the page already loaded shows at once, with no reload, no cookie deleted and no reload flow started`, async () => {
    const f = popup(vendor, className, { status: 'ok', data, found: true });
    const result = await f.instance[run]();
    assert.notEqual(result && result.awaitingResult, true, 'the tool card is not left waiting');
    assert.deepEqual(f.calls.map(([kind, type]) => [kind, type]), [['message', 'ADVANCED_LOADED_SCRIPTS']]);
    assert.equal(f.calls[0][2].vendorId, vendor);
    assert.equal(f.calls[0][2].tabId, 9);
    assert.equal(f.shown.length, 1);
    assert.equal(f.shown[0][0], display, 'the same result window as after a reload (it records the result in History)');
    assert.deepEqual(plain(f.shown[0][1]), plain(shownData(data)));
    assert.equal(f.notes.some(([, text]) => /Page will reload/.test(text)), false, 'no "page will reload" note');
  });

  test(`${vendor}: nothing found on the loaded page goes on to the existing reload flow`, async () => {
    for (const loaded of [{ status: 'ok', data: {}, found: false }, { status: 'error', error: 'No tab' }, undefined]) {
      const f = popup(vendor, className, loaded);
      const action = f.instance[run]();
      await flush();
      await action;
      const types = f.calls.filter(([kind]) => kind === 'message').map(([, type]) => type);
      assert.deepEqual(types.slice(0, 2), ['ADVANCED_LOADED_SCRIPTS', reloadMessage], 'loaded page first, then the old flow');
      assert.equal(f.shown.length, 0);
      if (vendor !== 'geetest') {
        // Imperva and Shape reload from the popup (GeeTest's worker reloads)
        assert.equal(f.calls.filter(([kind]) => kind === 'reload').length, 1);
      }
      if (vendor === 'imperva') {
        assert.ok(f.calls.findIndex(([kind]) => kind === 'remove') < f.calls.findIndex(([kind]) => kind === 'reload'), 'cookies reset before the reload');
      }
    }
  });
}

// ---- The ADVANCED_LOADED_SCRIPTS handler -----------------------------------------------------------------------------

test('the handler answers these vendors in their own result shape, and leaves History to their result window', async () => {
  const event = () => ({ addListener() {}, removeListener() {}, emit() {} });
  const stored = {};
  const context = { URL, TextDecoder, Uint8Array, console, Logger: { debug() {}, network() {}, warn() {}, error() {} },
    UrlUtils: { normalizeFaviconForStorage: () => '' }, setTimeout, clearTimeout, clearInterval,
    chrome: { tabs: { onRemoved: event(), onUpdated: event(), get: async id => ({ id, url: 'https://shop.example/' }) },
      webNavigation: { onCompleted: event(), onCommitted: event() },
      webRequest: { onBeforeRequest: event(), onResponseStarted: event(), onBeforeSendHeaders: event() },
      runtime: { getURL: file => `chrome-extension://abc/${file}`, async sendMessage() {} },
      storage: { local: { async get(keys) { return Object.fromEntries([].concat(keys).filter(key => key in stored).map(key => [key, stored[key]])); }, async set(values) { Object.assign(stored, values); } } } } };
  context.self = context;
  vm.createContext(context);
  for (const file of ['modules/core/message-types.js', 'modules/core/message-sender.js', 'modules/core/capture-retention.js', 'modules/advanced/captcha-vendors.js', 'modules/advanced/vendor-registry.js',
    'modules/advanced/result-model.js', 'background/advanced/history-store.js', 'background/advanced/page-notice.js', 'background/advanced/collector-utils.js',
    'background/advanced/job-manager.js', 'background/advanced/script-analysis.js', 'background/handlers/messages-advanced-capture.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const asked = [];
  context.geetestFromLoadedPage = async tabId => { asked.push(tabId); return { data: { scripts: [{ type: 'v3', gt: 'g' }] }, found: true }; };
  context.impervaFromLoadedPage = async () => ({ data: { scriptUrls: [] }, found: false });
  const registry = {};
  context.registerAdvancedCaptureHandlers(registry, {});
  const popupSender = { id: 'abc', url: 'chrome-extension://abc/popup.html' };
  const ask = (vendorId, sender = popupSender) => new Promise(resolve => {
    registry.ADVANCED_LOADED_SCRIPTS({ request: { type: 'ADVANCED_LOADED_SCRIPTS', tabId: 4, vendorId }, sender, sendResponse: resolve });
  });
  assert.deepEqual(plain(await ask('geetest')), { status: 'ok', data: { scripts: [{ type: 'v3', gt: 'g' }] }, found: true });
  assert.deepEqual(asked, [4]);
  assert.deepEqual(plain(await ask('imperva')), { status: 'ok', data: { scriptUrls: [] }, found: false });
  assert.deepEqual(Object.keys(stored), [], 'nothing saved by the worker: the popup window records what it shows');
  assert.equal((await ask('geetest', { id: 'abc', url: 'https://shop.example/', tab: { id: 4 } })).status, 'error', 'extension pages only');
});
