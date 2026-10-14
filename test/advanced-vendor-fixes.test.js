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
  assert.deepEqual(plain(api.detectionMethods), ['api-param-sentry']);
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
  vm.runInContext(read('sections/advanced/vendors/akamai/lifecycle.js'), context);
  const module = new context.AkamaiAdvanced();
  module.tabInfo = { id: 1, url: 'https://shop.example/' };
  module.sendMessage = async message => { calls.push(['state', message.type]); return { isCapturing: true }; };
  module.stopCapturing = async () => { calls.push(['stop']); };
  assert.equal(await module.beforeCapture(), false);
  assert.deepEqual(plain(calls), [['state', 'AKAMAI_GET_CAPTURE_STATE'], ['stop']], 'stopping a capture keeps the cookie');
});
