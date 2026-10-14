const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Analyze Scripts classifiers: host-anchored, so a first-party path or a
// look-alike host never counts as the vendor.

function classifier(vendor, name) {
  const context = { self: {}, URL, Logger: { network() {}, error() {}, debug() {} }, AdvancedScriptAnalysis: { start() {} },
    chrome: { runtime: { onMessage: { addListener() {} } }, webRequest: { onBeforeRequest: { addListener() {} } } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, `../background/advanced/vendors/${vendor}/interceptor.js`), 'utf8'), context);
  return context[name];
}

const cases = {
  awswaf: ['awsWafClassifyUrl', {
    'https://0a1b2c3d4e5f.edge.sdk.awswaf.com/0a1b2c3d4e5f/5d6e7f/challenge.js': 'challenge',
    'https://0a1b2c3d4e5f.edge.captcha-sdk.awswaf.com/0a1b2c3d4e5f/jsapi.js': 'jsapi',
    'https://0a1b2c3d4e5f.us-east-1.captcha.awswaf.com/0a1b2c3d4e5f/captcha.js': 'captcha',
    'https://0a1b2c3d4e5f.token.awswaf.com/0a1b2c3d4e5f/telemetry': 'awswaf'
  }, ['https://shop.example/assets/challenge.js', 'https://cdn.example/captcha.js', 'https://awswaf.com.evil.example/challenge.js']],
  cloudflare: ['cloudflareClassifyUrl', {
    'https://challenges.cloudflare.com/turnstile/v0/api.js': 'Turnstile',
    'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1': 'Challenge',
    'https://shop.example/cdn-cgi/challenge-platform/scripts/jsd/main.js': 'Bot Management',
    'https://shop.example/cdn-cgi/challenge-platform/h/g/orchestrate/jsch/v1': 'Challenge',
    'https://shop.example/cdn-cgi/bm/cv/669835187/api.js': 'Bot Management',
    'https://shop.example/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js': 'CDN',
    'https://static.cloudflareinsights.com/beacon.min.js/v8b253dfea2ab4077af8c6f58422dfbfd1689876627854': 'Analytics'
  }, ['https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js', 'https://shop.example/js/cloudflare.com.js', 'https://challenges.cloudflare.com.evil.example/turnstile/v0/api.js']],
  funcaptcha: ['funcaptchaClassifyUrl', {
    'https://client-api.arkoselabs.com/v2/476068BF-9607-4799-B53D-966BE98E2B81/api.js': 'api',
    'https://roblox-api.arkoselabs.com/v2/2.13.0/enforcement.b3b1c9343f2ef3887d61d17b2e0cd65e.html': 'enforcement',
    'https://client-api.arkoselabs.com/fc/gt2/public_key/476068BF-9607-4799-B53D-966BE98E2B81': 'session',
    'https://client-api.arkoselabs.com/fc/a/': 'fc',
    'https://api.funcaptcha.com/fc/api/nojs/?pkey=476068BF': 'fc'
  }, ['https://shop.example/fc/gt2/public_key/abc', 'https://arkoselabs.com.evil.example/v2/abc/api.js']],
  hcaptcha: ['hcaptchaClassifyUrl', {
    'https://js.hcaptcha.com/1/api.js?render=explicit&onload=cb': 'api',
    'https://api.hcaptcha.com/checksiteconfig?v=1b0b8a6&host=example.com&sitekey=a5f74b19-9e45-40e0-b45d-47ff91b7a6c2&sc=1&swa=1': 'config',
    'https://api2.hcaptcha.com/getcaptcha/a5f74b19-9e45-40e0-b45d-47ff91b7a6c2': 'challenge',
    'https://newassets.hcaptcha.com/c/7f8e9d/hsw.js': 'hsw',
    'https://newassets.hcaptcha.com/captcha/v1/1b0b8a6/static/hcaptcha.html#frame=checkbox': 'frame'
  }, ['https://shop.example/1/api.js?hcaptcha.com', 'https://hcaptcha.com.evil.example/1/api.js']],
  turnstile: ['turnstileClassifyUrl', {
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit': 'api',
    'https://challenges.cloudflare.com/turnstile/v0/b/5f6b9e7a/api.js': 'api',
    'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv/abc/0x4AAAAAAADnPIDROrmt1Wwj/auto/fbE/new/normal': 'frame'
  }, ['https://shop.example/turnstile/widget.js', 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1']],
  datadome: ['datadomeClassifyUrl', {
    'https://js.datadome.co/tags.js': 'tags',
    'https://js.datadome.co/js/': 'collector',
    'https://api-js.datadome.co/js/': 'collector'
  }, ['https://js.datadome.co.evil.example/js/']]
};

for (const [vendor, [name, hits, misses]] of Object.entries(cases)) {
  test(`${vendor}: Analyze Scripts lists the vendor's requests and nothing else`, () => {
    const classify = classifier(vendor, name);
    assert.equal(typeof classify, 'function');
    for (const [url, type] of Object.entries(hits)) assert.equal(classify(url), type, url);
    for (const url of [...misses, 'not a url', 'data:text/javascript,1', 'chrome-extension://abc/challenge.js']) assert.equal(classify(url), null, url);
  });
}

test('the shared analysis skips images, fonts, CSS and media and records the request type', () => {
  const listeners = {};
  const context = { globalThis: null, chrome: { webRequest: { onBeforeRequest: { addListener: fn => { listeners.request = fn; }, removeListener() {} } },
    webNavigation: { onCompleted: { addListener: fn => { listeners.done = fn; }, removeListener() {} } } } };
  let finish;
  context.AdvancedJobManager = { begin: ({ onFinish }) => { finish = onFinish; return { job: { finished: false, setTimer() {}, addCleanup() {}, finish() {} }, reused: false }; }, snapshot: () => ({}) };
  vm.createContext(context);
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../background/advanced/script-analysis.js'), 'utf8'), context);
  const sent = [];
  context.chrome.runtime = { sendMessage: async message => { sent.push(message); } };
  context.saveToHistory = async () => {};
  context.AdvancedResultModel = { create: value => value };
  context.AdvancedScriptAnalysis.start({ tabId: 3, url: 'https://shop.example/', vendorId: 'hcaptcha', classify: () => 'hcaptcha' });
  for (const type of ['image', 'stylesheet', 'font', 'media', 'script', 'xmlhttprequest', 'sub_frame']) {
    listeners.request({ tabId: 3, type, url: `https://js.hcaptcha.com/${type}` });
  }
  return finish({ status: 'completed', requestId: 'r' }).then(() => {
    const scripts = sent[0].data.scripts;
    assert.deepEqual(JSON.parse(JSON.stringify(scripts.map(script => script.resourceType))), ['script', 'xmlhttprequest', 'sub_frame']);
  });
});
