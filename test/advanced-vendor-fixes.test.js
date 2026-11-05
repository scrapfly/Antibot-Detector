const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Regression tests for the 2.8.7 Advanced vendor fixes.

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function worker(vendor, extra = {}) {
  const context = { self: { BaseInterceptorHelpers: {} }, URL, URLSearchParams, TextDecoder, TextEncoder, console,
    Logger: { network() {}, error() {}, debug() {}, warn() {} }, Constants: { CAPTURE_AUTO_STOP_TIMEOUT: 60000 },
    AdvancedScriptAnalysis: { start() {} }, pageText: (key, fallback) => fallback,
    chrome: { runtime: { sendMessage: async () => {}, onMessage: { addListener() {} } },
      webRequest: { onBeforeRequest: { addListener() {}, removeListener() {} } }, webNavigation: { onCompleted: { addListener() {}, removeListener() {} } } },
    setTimeout, clearTimeout, ...extra };
  vm.createContext(context);
  vm.runInContext(read(`background/advanced/vendors/${vendor}/interceptor.js`), context);
  return context;
}
const bytes = text => ({ bytes: new TextEncoder().encode(text).buffer });

test('hCaptcha: version, site key and every Enterprise sign come from one parser, request bodies included', () => {
  const { hcaptchaInspectRequest } = worker('hcaptcha');
  const target = () => ({ version: '', websiteKey: '', websiteURL: '', isEnterprise: false, detectionMethods: [] });
  const config = target();
  const url = 'https://api.hcaptcha.com/checksiteconfig?v=1b0b8a6&host=shop.example&sitekey=a5f74b19-9e45-40e0-b45d-47ff91b7a6c2&sc=1';
  assert.equal(hcaptchaInspectRequest({ url }, config), url, 'checksiteconfig is fetched for its Enterprise-only features');
  assert.deepEqual(plain(config), { version: '1b0b8a6', websiteKey: 'a5f74b19-9e45-40e0-b45d-47ff91b7a6c2', websiteURL: 'shop.example', isEnterprise: false, detectionMethods: [] });
  // rqdata: raw bytes (JSON or form text) and formData, the shapes Chrome actually gives
  for (const requestBody of [{ raw: [bytes('{"v":"1","rqdata":"abc"}')] }, { raw: [bytes('v=1&rqdata=abc')] }, { formData: { v: ['1'], rqdata: ['abc'] } }]) {
    const data = target();
    hcaptchaInspectRequest({ url: 'https://api2.hcaptcha.com/getcaptcha/a5f74b19', requestBody }, data);
    assert.equal(data.isEnterprise, true, JSON.stringify(requestBody));
    assert.deepEqual(plain(data.detectionMethods), ['rqdata']);
  }
  const plainChallenge = target();
  hcaptchaInspectRequest({ url: 'https://api2.hcaptcha.com/getcaptcha/a5f74b19', requestBody: { raw: [bytes('v=1&motionData=rqdata-like-text')] } }, plainChallenge);
  assert.equal(plainChallenge.isEnterprise, false, 'the word inside another value is not the rqdata field');
  const api = target();
  hcaptchaInspectRequest({ url: 'https://js.hcaptcha.com/1/api.js?render=explicit&sentry=false&custom=true' }, api);
  assert.deepEqual(plain(api.detectionMethods), ['api-param-custom'], 'sentry=false is off; custom=true counts');
  // hCaptcha's own demo: custom=False and reportapi on hCaptcha's own host are not Enterprise
  const demo = target();
  hcaptchaInspectRequest({ url: 'https://js.hcaptcha.com/1/api.js?reportapi=https%3A%2F%2Faccounts.hcaptcha.com&custom=False&pstissuer=https://pst-issuer.hcaptcha.com' }, demo);
  assert.equal(demo.isEnterprise, false);
  const ownEndpoint = target();
  hcaptchaInspectRequest({ url: 'https://js.hcaptcha.com/1/api.js?endpoint=https%3A%2F%2Fcaptcha.shop.example&recaptchacompat=off' }, ownEndpoint);
  assert.deepEqual(plain(ownEndpoint.detectionMethods), ['api-param-endpoint'], 'a custom endpoint is Enterprise; recaptchacompat is not');
  const none = target();
  hcaptchaInspectRequest({ url: 'https://js.hcaptcha.com/1/api.js?render=explicit&onload=cb' }, none);
  assert.equal(none.isEnterprise, false);
});

test('hCaptcha: only Enterprise-only checksiteconfig features count (enc_get_req comes back even for an unregistered key)', () => {
  const { hcaptchaHasEnterpriseFeature } = worker('hcaptcha');
  // Real responses: an unregistered key, the all-zeros key, hCaptcha's demo key, hCaptcha's test key
  assert.equal(hcaptchaHasEnterpriseFeature({ features: { enc_get_req: true }, pass: true }), false);
  assert.equal(hcaptchaHasEnterpriseFeature({ features: {}, pass: true }), false);
  assert.equal(hcaptchaHasEnterpriseFeature({ features: { enc_get_req: true, andint: true }, pass: true }), false);
  assert.equal(hcaptchaHasEnterpriseFeature({ features: { custom_theme: true, enc_get_req: true }, pass: true }), true);
  assert.equal(hcaptchaHasEnterpriseFeature(null), false);
});

test('FunCaptcha: the public_key POST is read from formData as well as raw bytes', () => {
  const { funcaptchaBodyParams } = worker('funcaptcha');
  const fromForm = funcaptchaBodyParams({ formData: { public_key: ['476068BF'], site: ['https://www.roblox.com'], 'data[blob]': ['b10b'] } });
  const fromRaw = funcaptchaBodyParams({ raw: [bytes('public_key=476068BF&site=https%3A%2F%2Fwww.roblox.com&data%5Bblob%5D=b10b')] });
  for (const params of [fromForm, fromRaw]) {
    assert.equal(params.get('public_key'), '476068BF');
    assert.equal(params.get('site'), 'https://www.roblox.com');
    assert.equal(params.get('data[blob]'), 'b10b');
  }
  assert.equal(funcaptchaBodyParams(null), null);
  assert.equal(funcaptchaBodyParams({}), null);
});

test('Imperva: Analyze Scripts that times out still sends its (empty) result instead of throwing', async () => {
  const sent = [];
  const states = new Map();
  const context = worker('imperva', {});
  context.chrome.runtime.sendMessage = async message => { sent.push(message); };
  context.chrome.tabs = { get: async id => ({ id, url: 'https://shop.example/' }) };
  context.checkCookies = async () => [{ name: '___utmvc', value: 'x' }, { name: 'reese84', value: 'y' }];
  context.impervaCaptureStateRef = states;
  states.set(5, { tabId: 5, extractMode: true, extractedData: { challengeUrls: [], payloads: [], cookies: {}, scriptUrls: [] } });
  const result = context.impervaStopCapture(5);
  assert.equal(result.status, 'stopped');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'IMPERVA_EXTRACTION_COMPLETED');
  assert.equal(sent[0].tabId, 5);
  assert.equal(sent[0].extractedData.cookies.utmvc.name, '___utmvc', 'the real cookie name is ___utmvc');
  assert.equal(states.has(5), false);
});

test('Imperva: Check Cookies counts ___utmvc', async () => {
  const shown = [];
  const context = { window: {}, console, Logger: { network() {}, error() {} }, ImpervaAdvanced: function() {},
    NotificationHelper: { success() {}, info() {}, error() {} },
    AdvancedUtils: { notifications: { checkCookies: { success: (a, b) => `${a}/${b}`, none: () => '' } } },
    chrome: { cookies: { getAll: async () => [{ name: '___utmvc' }, { name: 'reese84' }, { name: 'incap_ses_123_456' }, { name: 'unrelated' }] } } };
  context.ImpervaAdvanced.tr = (key, fallback) => fallback;
  context.ImpervaAdvanced.fmt = (key, fallback) => fallback;
  vm.createContext(context);
  vm.runInContext(read('utils/page-cookies.js'), context);
  vm.runInContext(read('sections/advanced/vendors/imperva/actions.js'), context);
  const module = new context.ImpervaAdvanced();
  module.tabInfo = { id: 1, url: 'https://shop.example/' };
  module.showCookieResults = options => shown.push(options);
  await module.checkCookies();
  assert.deepEqual(plain(shown[0].cookies.map(cookie => cookie.name)), ['___utmvc', 'reese84', 'incap_ses_123_456']);
  assert.equal(shown[0].facts[0].value, 'Advanced (reese84 + utmvc)');
  assert.ok(shown[0].expected.includes('___utmvc'));
});

function pageFunction(vendor, handler, message) {
  let injected = null;
  const context = worker(vendor, { setTimeout: fn => fn() });
  context.chrome.tabs = { get: async id => ({ id, url: 'https://shop.example/' }), reload() {} };
  context.chrome.scripting = { executeScript: async ({ func }) => { injected = func; return [{ result: null }]; } };
  return new Promise(resolve => context[handler](message, {}, () => resolve(injected)));
}
function runInPage(func, { scripts = [], html = '', globals = {} } = {}) {
  const page = { URL, document: { querySelectorAll: () => scripts.map(src => ({ src })), documentElement: { outerHTML: html } }, ...globals };
  page.window = page;
  vm.createContext(page);
  return vm.runInContext(`(${func.toString()})()`, page);
}

test('GeeTest: Check Version says v4 or v3 only when GeeTest is on the page', async () => {
  const func = await pageFunction('geetest', 'handleGeetestCheckVersion', { tabId: 3 });
  assert.equal(runInPage(func, { html: '<html><p>captchaId mentioned in a blog post</p></html>' }), null, 'no GeeTest, no version');
  assert.equal(runInPage(func, { scripts: ['https://static.geetest.com/v4/gt4.js'] }), 'v4');
  assert.equal(runInPage(func, { scripts: ['https://static.geevisit.com/v4/gt4.js'] }), 'v4');
  assert.equal(runInPage(func, { scripts: ['https://static.geetest.com/static/js/gt.0.5.0.js'] }), 'v3');
  assert.equal(runInPage(func, { globals: { initGeetest: function() {} } }), 'v3');
  assert.equal(runInPage(func, { html: 'initGeetest4({captchaId: "x"})' }), 'v4');
});

test('Shape Security: Check Version reports v2 only with Shape\'s loader, v1 with its runtime global', async () => {
  let injected = null;
  const context = worker('shapesecurity');
  context.chrome.scripting = { executeScript: async ({ func }) => { injected = func; return [{ result: runInPage(func, pages.current) }]; } };
  const pages = { current: {} };
  const ask = async page => { pages.current = page; return new Promise(resolve => context.handleShapeSecurityCheckVersion({ tabId: 1 }, {}, resolve)); };
  assert.equal((await ask({ scripts: ['https://shop.example/app.js'] })).version, null);
  assert.equal((await ask({ scripts: ['https://www.target.com/assets/ssx.mod.js?async'] })).version, 'v2');
  assert.equal((await ask({ scripts: [`https://shop.example/x/y.js?seed=${'A'.repeat(48)}`] })).version, 'v2');
  assert.equal((await ask({ globals: { __xr_bmobdb: {} } })).version, 'v1');
  assert.ok(injected);
});

test('Akamai: Start Capture checks for a running capture before deleting _abck', async () => {
  const calls = [];
  const context = { window: {}, console, Logger: { network() {}, error() {}, debug() {} }, AkamaiAdvanced: function() {},
    BaseAdvancedModule: { prototype: {} }, NotificationHelper: { error() {}, info() {} }, AdvancedMessageTypes: {},
    chrome: { cookies: { getAll: async () => [{ name: '_abck', value: 'v' }], remove: async query => calls.push(['remove', query.name]) } } };
  context.AkamaiAdvanced.tr = (key, fallback) => fallback;
  vm.createContext(context);
  vm.runInContext(read('utils/page-cookies.js'), context);
  vm.runInContext(read('sections/advanced/vendors/akamai/lifecycle.js'), context);
  const module = new context.AkamaiAdvanced();
  module.tabInfo = { id: 1, url: 'https://shop.example/' };
  module.sendMessage = async message => { calls.push(['state', message.type]); return { isCapturing: true }; };
  module.stopCapturing = async () => { calls.push(['stop']); };
  assert.equal(await module.beforeCapture(), false);
  assert.deepEqual(plain(calls), [['state', 'AKAMAI_GET_CAPTURE_STATE'], ['stop']], 'stopping a capture keeps the cookie');
});

// Found by the browser suite of every Advanced tool (scripts/e2e-v313-advanced-tools.js)
test('Shape Security: a capture that ends by itself tells the open popup, with its job\'s request id, after it is saved and its state is gone', async () => {
  const sent = [];
  const saved = [];
  const states = new Map();
  const helpers = {
    getCaptureState: (ref, tabId) => ref.get(tabId),
    removeCaptureState: (ref, tabId) => { ref.delete(tabId); },
    clearCaptureTimeout() {},
    saveToHistory: async (tabId, data, options) => { saved.push({ tabId, data: plain(data), options: plain(options) }); return { id: 'capture-1' }; },
    showNotification: async () => {}
  };
  const context = worker('shapesecurity', {
    BaseInterceptorHelpers: helpers, self: { BaseInterceptorHelpers: helpers }, pageText: (key, fallback) => fallback,
    AdvancedJobManager: {
      captureIdentity: (state, tabId, vendorId) => ({ tabId, vendorId, operation: 'capture', requestId: `job-${tabId}` }),
      completionMessage: (identity, payload) => ({ ...payload, tabId: identity.tabId, vendorId: identity.vendorId, operation: identity.operation, requestId: identity.requestId })
    },
    chrome: {
      runtime: { sendMessage: async message => { sent.push({ message: plain(message), saved: saved.length, stateGone: !states.has(message.tabId) }); }, onMessage: { addListener() {} } },
      scripting: { executeScript: async () => [] },
      webRequest: { onResponseStarted: { removeListener() {} }, onBeforeSendHeaders: { removeListener() {} } },
      webNavigation: { onCommitted: { removeListener() {} }, onCompleted: { removeListener() {} } }
    }
  });
  context.window = context;
  vm.runInContext(read('modules/core/message-types.js'), context);
  context.shapeSecurityInitializeInterceptor(states, new Map());
  const capture = (tabId, version) => states.set(tabId, { active: true, startTime: Date.now() - 2000, headers: [], cookie: { name: 'AbCd1234', value: 'x' }, version });

  capture(7, 'v1');
  await context.autoStopCapture(7, 'complete');
  assert.equal(saved.length, 1, 'the capture is saved');
  const done = sent.filter(item => item.message.type === 'SHAPESECURITY_CAPTURE_COMPLETED');
  assert.equal(done.length, 1, 'the popup is told once');
  const message = done[0].message;
  assert.deepEqual({ tabId: message.tabId, vendorId: message.vendorId, operation: message.operation, requestId: message.requestId, reason: message.reason },
    { tabId: 7, vendorId: 'shapesecurity', operation: 'capture', requestId: 'job-7', reason: 'complete' }, 'the popup matches its Stop card to the capture by the job\'s request id');
  assert.equal(message.captureData.cookie.name, 'AbCd1234');
  assert.deepEqual({ saved: done[0].saved, stateGone: done[0].stateGone }, { saved: 1, stateGone: true }, 'told after the save and after the state is gone, so a state query on receipt says it is not capturing');

  // A second trigger of the same capture (another header, the timer) tells nobody again
  await context.autoStopCapture(7, 'timeout');
  assert.equal(sent.filter(item => item.message.type === 'SHAPESECURITY_CAPTURE_COMPLETED').length, 1);

  // The time running out ends a capture the same way, and says so
  capture(8, 'v2');
  await context.autoStopCapture(8, 'timeout');
  const timed = sent.filter(item => item.message.type === 'SHAPESECURITY_CAPTURE_COMPLETED' && item.message.tabId === 8);
  assert.equal(timed.length, 1);
  assert.equal(timed[0].message.reason, 'timeout');
  assert.equal(timed[0].message.requestId, 'job-8');
});

test('Imperva: the Analyze Scripts window gives the page\'s own address, scheme and port included, and the host over https only without one', () => {
  const opened = [];
  const K = { kitFacts: items => `FACTS ${JSON.stringify(items)}`, kitCard: body => `CARD ${body}`, kitField: (label, value) => `FIELD ${value};`, kitChip: text => `CHIP ${text}`,
    kitNote: text => `NOTE ${text}`, toolIcon: () => '' };
  const context = { window: {}, console, URL, Logger: { network() {}, error() {}, debug() {} }, BaseAdvancedModule: K, ImpervaAdvanced: class {},
    NotificationHelper: { success() {}, info() {}, error() {} }, AdvancedUtils: { notifications: { analyzeScripts: { success: () => '' } } } };
  context.ImpervaAdvanced.tr = (key, fallback) => fallback;
  context.ImpervaAdvanced.fmt = (key, fallback) => fallback;
  vm.createContext(context);
  vm.runInContext(read('sections/advanced/vendors/imperva/actions.js'), context);
  vm.runInContext(read('sections/advanced/vendors/imperva/view.js'), context);
  const module = new context.ImpervaAdvanced();
  module.recordStructuredResult = () => {};
  module.generateParsingCode = () => null;
  module.openKitModal = options => opened.push(options);
  const addresses = data => {
    module.displayExtractionResults(data);
    return [...opened.pop().body.matchAll(/FIELD ([^;]*);/g)].map(match => match[1]);
  };
  const scripts = origin => [`${origin}/Thine-Wert/987`, `${origin}/_Incapsula_Resource?SWKMTFSR=1&e=0.1234`];
  const expected = (origin, host) => [`${origin}/Thine-Wert/987`, `${origin}/Thine-Wert/987?d=${host}`, `${origin}/_Incapsula_Resource?SWKMTFSR=1&e=0.1234`];

  // An http page, and a host on a port: neither is https on 443
  assert.deepEqual(addresses({ url: 'http://127.0.0.1:8080/page', hostname: '127.0.0.1', scriptUrls: scripts('http://127.0.0.1:8080') }), expected('http://127.0.0.1:8080', '127.0.0.1'));
  assert.deepEqual(addresses({ url: 'https://shop.example:8443/cart', hostname: 'shop.example', scriptUrls: scripts('https://shop.example:8443') }), expected('https://shop.example:8443', 'shop.example'));
  // A site that runs Imperva as everyone does: https on the default port, as before
  assert.deepEqual(addresses({ url: 'https://shop.example/cart', hostname: 'shop.example', scriptUrls: scripts('https://shop.example') }), expected('https://shop.example', 'shop.example'));
  // A result with no address of its own, or one that is not a web page: the host over https
  assert.deepEqual(addresses({ hostname: 'shop.example', scriptUrls: scripts('') }), expected('https://shop.example', 'shop.example'));
  assert.deepEqual(addresses({ url: 'about:blank', hostname: 'shop.example', scriptUrls: scripts('') }), expected('https://shop.example', 'shop.example'));
});

// Akamai's Start Capturing deleted the _abck cookie before the worker had armed the capture: a start that failed had already cost the
// person the cookie. Arm first, delete last
function akamaiPopup({ answer, removeFails = false }) {
  const events = [];
  const context = { console, window: { close: () => events.push('popup closed') }, setTimeout: fn => fn(),
    Logger: { debug() {}, error() {}, network() {} },
    NotificationHelper: { error: text => events.push(`error: ${text}`), info() {}, success() {} },
    AkamaiAdvanced: function() {}, AdvancedMessageTypes: { ADVANCED_PAGE_NOTICE: 'ADVANCED_PAGE_NOTICE' },
    chrome: { cookies: { getAll: async () => [{ name: '_abck', value: 'v' }, { name: 'bm_sz', value: 'b' }],
      remove: async query => { if (removeFails) throw new Error('cookie store busy'); events.push(`cookie deleted: ${query.name}`); } } } };
  context.AkamaiAdvanced.tr = (key, fallback) => fallback;
  context.AkamaiAdvanced.fmt = (key, fallback) => fallback;
  vm.createContext(context);
  vm.runInContext(read('utils/page-cookies.js'), context);
  vm.runInContext(read('sections/advanced/base-advanced-module.js'), context);
  vm.runInContext(read('sections/advanced/vendors/akamai/lifecycle.js'), context);
  const module = Object.create(context.window.BaseAdvancedModule.prototype);
  Object.assign(module, { moduleName: 'akamai', tabInfo: { id: 5, url: 'https://shop.example/' }, isCapturing: false, captureStateRevision: 0 });
  module.beforeCapture = context.AkamaiAdvanced.prototype.beforeCapture;
  // Akamai's own hook where it has one; otherwise the base class's, which only closes the popup
  if (context.AkamaiAdvanced.prototype.afterCaptureStart) module.afterCaptureStart = context.AkamaiAdvanced.prototype.afterCaptureStart;
  module.updateCaptureButtonState = () => {};
  module.sendMessage = async message => {
    events.push(`sent ${message.type}`);
    if (message.type === 'AKAMAI_GET_CAPTURE_STATE') return { isCapturing: false };
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { module, events };
}

test('Akamai: Start Capturing deletes _abck only once the worker has confirmed the capture is armed, and not when it did not', async () => {
  const run = async options => { const { module, events } = akamaiPopup(options); await module.startCapturing(); return events; };
  const asked = ['sent AKAMAI_GET_CAPTURE_STATE', 'sent AKAMAI_START_CAPTURE'];
  assert.deepEqual(await run({ answer: { status: 'started', requestId: 'r1' } }), [...asked, 'cookie deleted: _abck', 'popup closed'], 'armed first, the cookie last, then the popup closes');
  assert.deepEqual(await run({ answer: { status: 'already_capturing', requestId: 'r1' } }), [...asked, 'cookie deleted: _abck', 'popup closed'], 'armed already');
  // Nothing is armed: the cookie is left alone
  assert.deepEqual(await run({ answer: { status: 'error', error: 'worker busy' } }), [...asked, 'error: Failed to start capture: worker busy'], 'a start the worker refused');
  assert.deepEqual(await run({ answer: new Error('no worker') }), [...asked, 'error: Failed to start capture: no worker'], 'a start that threw');
  assert.deepEqual(await run({ answer: undefined }), asked, 'no answer');
  // A cookie that cannot be deleted does not undo an armed capture, and the popup still closes
  assert.deepEqual(await run({ answer: { status: 'started' }, removeFails: true }), [...asked, 'popup closed']);
});
