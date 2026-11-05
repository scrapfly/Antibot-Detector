#!/usr/bin/env node
/**
 * Every Advanced tool in the real extension (unpacked in Chromium), the way the popup uses it: a local page per protection is
 * detected by the extension's own detectors, the Advanced tab offers that protection's tools for the tab, and each action that
 * can run offline is run and its result read: Check Cookies, Check Version, Extract Site Key / Public Key / Sensor, Obtain
 * selector, callbacks, Analyze Scripts (from what the page loaded, and from a reload), Start and Stop Capturing with the reload
 * that feeds them, the result windows, their Export Code dialogs, Scrape with Scrapfly, and what reaches Advanced → History.
 *
 *   Part A  the 16 CAPTCHA vendors described as data (Extract Site Key where the vendor has a key, Analyze Scripts)
 *   Part B  the 11 tools with their own module: akamai, awswaf, cloudflare, datadome, funcaptcha, geetest, hcaptcha, imperva,
 *           recaptcha, shapesecurity, turnstile
 *   Part C  the Advanced tab itself: several protections on one page, no protection, a protection below the minimum,
 *           Advanced → History (cards by vendor, filters, details, copy, delete, export, clear)
 *
 * Offline: every name outside this machine resolves to nothing (so no request leaves it); the extension still sees each request,
 * which is what detection and Analyze Scripts read. What needs a vendor's own backend is printed as SKIP with the reason, never
 * tested against a stand-in. The popup is a tab here, pointed at the test page's tab (chrome.tabs.query answers with it, as
 * scripts/e2e-popup-guards.js does); window.close is counted instead of closing it, since the real popup closes after Start
 * Capturing so the person can reload.
 *
 * Fixtures: the data below can be required from node without a browser (test/advanced-e2e-fixtures.test.js runs the detection
 * engine over every page, so a detector change fails there first).
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium (npm run e2e:setup).
 *   npm run e2e:all -- --only v313-advanced-tools          (or: node scripts/e2e-v313-advanced-tools.js [--only=<text>])
 */
'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || path.join(__dirname, '..'));
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const LEMIN_ID = 'CROPPED_3dfdd5c_d1872b526b794d83ba3b365eb15a200b';
const RECAPTCHA_KEY = '6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-';
const HCAPTCHA_KEY = '10000000-ffff-ffff-ffff-000000000001';
const ARKOSE_KEY = '476068BF-9607-4799-B53D-966BE98E2B81';
const TURNSTILE_KEY = '1x00000000000000000000AA';
const GEETEST_ID = 'ec6ba5a1c9c2e5d46d0a09d7f0d1a8f1';
const ALTCHA_KEY = 'key_AbC-123_xyz789';
const SHAPE_SEED = 'AMACZQihAQAAI5_7SIGNL66-PTUUnAvyzPFZTpfj5iQVtZuYN2dfrszHMGw-';
const AKAMAI_SENSOR = '3;0;1;0;4733506;sensor-e2e-0123456789';
const CF_BM = 'k9cCU2HrMT2qW8nXb.V4Jm3Lp0RzYtQe7sHfGaIdCw1-1759600000.0255423-1.0.1.1-Zx3nQ7vLm2Pq9Rt4Yw8Kc1Hb6Jd5Fg0Sa_Ve2Nu7Mi4Ol9Pk3Tr8Wq1Xz6Cy5Bv0An.Df4Gh7Jk2Lz9Xc3Vb6Nm1Qw8Er5Ty0Ui4Op7As2Sd';
const CF_CLEARANCE = 'v3Gscaiyet.HqL8mN2pR5tW9zXb1CdF4gJ7kM0nQ3sV-1759600000-1.2.1.1-Hs2Kd8Lf4Mg0Nh6Pj1Qk7Rl3Sm9Tn5Uo2Vp8Wq4Xr0Ys6Zt1Au7Bv3Cw9Dx5Ey2Fz8Ga4Hb0Ic6Jd1Ke7Lf3Mg9Nh5Oi2Pj8Qk4Rl0Sm6Tn1Uo7Vp3Wq9Xr5Ys2Zt8_Au4Bv0Cw.Dx6';
const AWS_TOKEN = 'd0f5c1b8-1a2b-4c3d-9e8f-0123456789ab:EAoAjVKQhY4BAAAA:Q2x1c3RlclZhbHVlRXhhbXBsZTAxMjM0NTY3ODlhYmNkZWY=/ZmluZ2VycHJpbnQxMjM0NTY3ODkwYWJjZGVm';
const AWS_HOST = 'https://fe4385362baa.ead381d8.eu-west-1.token.awswaf.com/fe4385362baa/306922cde096/8b22eb923d34';
const AWS_CAPTCHA_HOST = 'https://fe4385362baa.ead381d8.eu-west-1.captcha.awswaf.com/fe4385362baa/306922cde096/8b22eb923d34';

const div = (attrs, text = '') => ({ tag: 'div', attrs, text });
// A Reese84-free, valid reCAPTCHA reload body: protobuf strings (field 6 and 14), as the worker decodes them
const RELOAD_BODY = [50, 2, 97, 98, 114, 1, 120];

/**
 * Bespoke protections: the 11 tools with their own module. `tools` lists every card the tool shows (ids as the popup builds
 * them), in the order the popup shows them with the capture card last.
 */
const BESPOKE = [
  {
    id: 'akamai', detectorId: 'detect-akamai', name: 'Akamai Bot Manager', title: 'Akamai probe',
    cookies: [['_abck', '68D1309F026260AE758FB2DD72720FEF~-1~YAAQ3W1lX0RagPKgAQ'], ['bm_sz', 'BC8B72F9C991A5AD809FBFD17CCC7935~YAAQ3W1l'], ['ak_bmsc', '7BCCDFC532391C579E0AE5BB0EFCD7BC~000~YAAQ']],
    body: '<script type="text/javascript" src="/Xk3-aB/9f2e7c1d"></script>',
    scripts: ['/akam/13/26dcf39b'],
    inline: ['var bmak = { sensor_data: "x" }; var abck = "_abck"; var bazadebezolkohpepadr="123456789";'],
    // Posted after the page has loaded: a capture ignores requests until the reloaded page is complete
    requests: [{ method: 'POST', url: '/akam/13/26dcf39b', body: JSON.stringify({ sensor_data: AKAMAI_SENSOR }), delay: 1500 }],
    tools: ['akamaiCheckCookies', 'akamaiAnalyzeContent', 'akamaiExtractSensor', 'akamaiStartCapture']
  },
  {
    id: 'awswaf', detectorId: 'detect-aws-waf', name: 'AWS WAF', title: 'AWS WAF probe',
    cookies: [['aws-waf-token', AWS_TOKEN]],
    scripts: [`${AWS_HOST}/challenge.js`, `${AWS_CAPTCHA_HOST}/captcha.js`, `${AWS_CAPTCHA_HOST}/jsapi.js`],
    analyze: [['challenge', `${AWS_HOST}/challenge.js`], ['captcha', `${AWS_CAPTCHA_HOST}/captcha.js`], ['jsapi', `${AWS_CAPTCHA_HOST}/jsapi.js`]],
    tools: ['awswafCheckCookies', 'awswafAnalyzeScripts']
  },
  {
    id: 'cloudflare', detectorId: 'detect-cloudflare', name: 'Cloudflare Bot Management', title: 'Cloudflare probe',
    cookies: [['__cf_bm', CF_BM], ['cf_clearance', CF_CLEARANCE]],
    scripts: ['/cdn-cgi/challenge-platform/h/b/scripts/jsd/d2d3316b729e/main.js', 'https://static.cloudflareinsights.com/beacon.min.js'],
    analyze: [['Bot Management', '/cdn-cgi/challenge-platform/h/b/scripts/jsd/d2d3316b729e/main.js'], ['Analytics', 'https://static.cloudflareinsights.com/beacon.min.js']],
    tools: ['cloudflareCheckCookies', 'cloudflareAnalyzeScripts']
  },
  {
    id: 'datadome', detectorId: 'detect-datadome', name: 'DataDome', title: 'DataDome probe',
    cookies: [['datadome', '~kQhG7w9T0yHq']],
    scripts: ['https://js.datadome.co/tags.js'],
    requests: [{ method: 'POST', url: 'https://api-js.datadome.co/js/' }],
    analyze: [['tags', 'https://js.datadome.co/tags.js'], ['collector', 'https://api-js.datadome.co/js/']],
    tools: ['datadomeCheckCookies', 'datadomeAnalyzeScripts']
  },
  {
    id: 'funcaptcha', detectorId: 'detect-funcaptcha', name: 'FunCaptcha (Arkose Labs)', title: 'FunCaptcha probe',
    dom: [div({ id: 'FunCaptcha', 'data-pkey': ARKOSE_KEY })],
    scripts: [`https://client-api.arkoselabs.com/v2/${ARKOSE_KEY}/api.js`],
    // What the widget posts for a session: the capture reads the public key, the site, the blob and the browser data
    requests: [{ method: 'POST', url: `/fc/gt2/public_key/${ARKOSE_KEY}`,
      form: { bda: 'QkRBLWUyZS0xMjM0NTY3ODkw', public_key: ARKOSE_KEY, site: 'http://127.0.0.1', userbrowser: 'Mozilla/5.0 e2e', 'data[blob]': 'BLOB-e2e-0123456789' } }],
    key: ARKOSE_KEY,
    analyze: [['api', `https://client-api.arkoselabs.com/v2/${ARKOSE_KEY}/api.js`]],
    tools: ['funcaptchaExtractSiteKey', 'funcaptchaAnalyzeScripts', 'funcaptchaStartCapture']
  },
  {
    id: 'geetest', detectorId: 'detect-geetest', name: 'GeeTest', title: 'GeeTest probe',
    scripts: ['https://static.geetest.com/v4/gt4.js'],
    inline: [`window.initGeetest4 = function () {}; initGeetest4({ captchaId: "${GEETEST_ID}", product: "bind" }, function (captcha) {});`],
    tools: ['geetestVersion', 'geetestAnalyze']
  },
  {
    id: 'hcaptcha', detectorId: 'detect-hcaptcha', name: 'hCaptcha', title: 'hCaptcha probe',
    dom: [div({ class: 'h-captcha', 'data-sitekey': HCAPTCHA_KEY })],
    scripts: ['https://js.hcaptcha.com/1/api.js?render=explicit'],
    // The widget asks for its configuration: the version, the site and the key are in that address
    requests: [{ url: `https://api.hcaptcha.com/checksiteconfig?v=05219f0822161da4c4a6f3aed6bf6d6fae1ba8e1&host=127.0.0.1&sitekey=${HCAPTCHA_KEY}&sc=1&swa=1&spst=1` }],
    key: HCAPTCHA_KEY,
    analyze: [['api', 'https://js.hcaptcha.com/1/api.js?render=explicit'], ['config', `https://api.hcaptcha.com/checksiteconfig?v=05219f0822161da4c4a6f3aed6bf6d6fae1ba8e1&host=127.0.0.1&sitekey=${HCAPTCHA_KEY}&sc=1&swa=1&spst=1`]],
    tools: ['hcaptchaExtractSiteKey', 'hcaptchaCheckVersion', 'hcaptchaStartCapture', 'hcaptchaAnalyzeScripts']
  },
  {
    id: 'imperva', detectorId: 'detect-incapsula', name: 'Incapsula (Imperva)', title: 'Imperva probe',
    cookies: [['incap_ses_315_2405640', 'AbCd=='], ['visid_incap_2405640', 'AbCd=='], ['nlbi_2405640', 'AbCd'], ['reese84', '3:abc=='], ['___utmvc', 'navigator%3Dtrue']],
    // Its UTMVC script and its Reese84 script (a first-party /<words>/<number> path), as the result window parses them
    scripts: ['/_Incapsula_Resource?SWKMTFSR=1&e=0.1234', '/Thine-Wert/987'],
    tools: ['impervaCheckCookies', 'impervaAnalyzeScripts', 'impervaStartCapture']
  },
  {
    id: 'recaptcha', detectorId: 'detect-recaptcha', name: 'Google reCAPTCHA', title: 'reCAPTCHA probe',
    dom: [div({ class: 'g-recaptcha', 'data-sitekey': RECAPTCHA_KEY, 'data-callback': 'onSolved' }, 'reCAPTCHA widget')],
    scripts: ['https://www.google.com/recaptcha/api.js?render=explicit'],
    inline: ['window.__rcClicks = 0; function onSolved(token) { window.__solved = token; } '
      + 'document.querySelector(".g-recaptcha").addEventListener("click", function () { window.__rcClicks++; }); '
      + 'window.addEventListener("load", function () { try { grecaptcha.render("x", { sitekey: "' + RECAPTCHA_KEY + '", callback: onSolved }); } catch (e) {} });'],
    // The challenge frame's request and the answer it posts, as the capture decodes them
    requests: [{ url: `https://www.google.com/recaptcha/api2/anchor?ar=1&k=${RECAPTCHA_KEY}&co=aHR0cDovLzEyNy4wLjAuMTo4MA..&hl=en&v=e2e&size=normal&cb=e2e` },
      { method: 'POST', url: `https://www.google.com/recaptcha/api2/reload?k=${RECAPTCHA_KEY}`, bytes: RELOAD_BODY }],
    key: RECAPTCHA_KEY,
    tools: ['recaptchaClick', 'recaptchaExtract', 'recaptchaCallback', 'recaptchaStartCapture']
  },
  {
    id: 'shapesecurity', detectorId: 'detect-shapesecurity', name: 'Shape Security', title: 'Shape Security probe',
    // v1: Shape's loader (seeded) and its runtime global; the cookie is an 8-character name with |1|0| in the value
    cookies: [['AbCd1234', 'ab|1|0|cd', 'Max-Age=1577847600']],
    scripts: ['/ssx/ssx.mod.js?async', `/ssx/ssx.mod.js?seed=${SHAPE_SEED}`],
    stubs: { '/ssx/ssx.mod.js': 'window.__xr_bmobdb = function () {};' },
    // The page signs a request with Shape's X-xxxxxxxx-* headers
    requests: [{ url: '/api/shape', mode: 'same-origin', headers: { 'X-AbCd1234-a': 'a1', 'X-AbCd1234-b': 'b2', 'X-AbCd1234-c': 'c3', 'X-AbCd1234-d': 'd4', 'X-AbCd1234-f': 'f5', 'X-AbCd1234-z': 'z6' } }],
    tools: ['shapesecurityCheckVersion', 'shapesecurityCheckCookies', 'shapesecurityStartCapture', 'shapesecurityAnalyzeScripts']
  },
  {
    id: 'turnstile', detectorId: 'detect-turnstile', name: 'Cloudflare Turnstile', title: 'Turnstile probe',
    dom: [div({ class: 'cf-turnstile', 'data-sitekey': TURNSTILE_KEY, 'data-action': 'login' })],
    scripts: ['https://challenges.cloudflare.com/turnstile/v0/api.js'],
    key: TURNSTILE_KEY,
    analyze: [['api', 'https://challenges.cloudflare.com/turnstile/v0/api.js']],
    tools: ['turnstileExtractSiteKey', 'turnstileAnalyzeScripts']
  }
];

/**
 * The 16 CAPTCHA vendors described as data (modules/advanced/captcha-vendors.js). `key` is the site key Extract Site Key must
 * find (absent: the vendor has none, or only for a deployment this page is not); `analyze` is every [classification, url] the
 * vendor's Analyze Scripts lists for the page. Addresses and embeds are those of test/captcha-vendors.test.js.
 */
const GENERIC = [
  { id: 'prosopo', detectorId: 'detect-prosopo', name: 'Prosopo Procaptcha',
    dom: [div({ class: 'procaptcha', 'data-sitekey': '5C7bfXYwachNuvmasEFtWi9BMS41uBvo6KpYHVSQmad4nWzw', 'data-captcha-type': 'frictionless' })],
    scripts: ['https://js.prosopo.io/js/procaptcha.bundle.js'],
    requests: [{ url: 'https://pronode4.prosopo.io/v1/prosopo/provider/client/captcha/image' }],
    key: '5C7bfXYwachNuvmasEFtWi9BMS41uBvo6KpYHVSQmad4nWzw',
    analyze: [['bundle', 'https://js.prosopo.io/js/procaptcha.bundle.js'], ['provider', 'https://pronode4.prosopo.io/v1/prosopo/provider/client/captcha/image']] },
  { id: 'friendlycaptcha', detectorId: 'detect-friendlycaptcha', name: 'Friendly Captcha',
    dom: [div({ class: 'frc-captcha', 'data-sitekey': 'FCMGEMUD2KTDSQ5H', 'data-start': 'auto' })],
    scripts: ['https://cdn.jsdelivr.net/npm/friendly-challenge@0.9.19/widget.module.min.js'],
    requests: [{ url: 'https://api.friendlycaptcha.com/api/v1/puzzle?sitekey=FCMGEMUD2KTDSQ5H' }],
    key: 'FCMGEMUD2KTDSQ5H',
    analyze: [['widget v1', 'https://cdn.jsdelivr.net/npm/friendly-challenge@0.9.19/widget.module.min.js'], ['api v1', 'https://api.friendlycaptcha.com/api/v1/puzzle?sitekey=FCMGEMUD2KTDSQ5H']] },
  { id: 'mtcaptcha', detectorId: 'detect-mtcaptcha', name: 'MTCaptcha',
    dom: [div({ class: 'mtcaptcha' })],
    scripts: ['https://service.mtcaptcha.com/mtcv1/client/mtcaptcha.min.js'],
    inline: ['var mtcaptchaConfig = { "sitekey": "MTPublic-tqNCRE0GS", "lang": "en" };'],
    requests: [{ url: 'https://service.mtcaptcha.com/mtcv1/api/getchallenge.json?sk=MTPublic-tqNCRE0GS&bd=127.0.0.1' }],
    key: 'MTPublic-tqNCRE0GS',
    analyze: [['client', 'https://service.mtcaptcha.com/mtcv1/client/mtcaptcha.min.js'], ['api', 'https://service.mtcaptcha.com/mtcv1/api/getchallenge.json?sk=MTPublic-tqNCRE0GS&bd=127.0.0.1']] },
  { id: 'smartcaptcha', detectorId: 'detect-smartcaptcha', name: 'Yandex SmartCaptcha',
    dom: [div({ class: 'smart-captcha', 'data-sitekey': 'ysc1_5ZOqOqA4uXjAsEbVkjQabcdef123456', 'data-hl': 'en' })],
    scripts: ['https://smartcaptcha.yandexcloud.net/captcha.js'],
    requests: [{ url: 'https://smartcaptcha.yandexcloud.net/check?host=127.0.0.1&sitekey=ysc1_5ZOqOqA4uXjAsEbVkjQabcdef123456' }],
    key: 'ysc1_5ZOqOqA4uXjAsEbVkjQabcdef123456',
    analyze: [['sdk', 'https://smartcaptcha.yandexcloud.net/captcha.js'], ['check', 'https://smartcaptcha.yandexcloud.net/check?host=127.0.0.1&sitekey=ysc1_5ZOqOqA4uXjAsEbVkjQabcdef123456']] },
  { id: 'captchaeu', detectorId: 'detect-captchaeu', name: 'Captcha.eu',
    scripts: ['https://www.captcha.eu/sdk.js?v7aaaa1aa'],
    inline: ["KROT.setup('pub_1234567890abcdef');"],
    requests: [{ url: 'https://www.captcha.eu/challenge?publicSecret=pub_1234567890abcdef' }],
    key: 'pub_1234567890abcdef',
    analyze: [['sdk', 'https://www.captcha.eu/sdk.js?v7aaaa1aa'], ['challenge', 'https://www.captcha.eu/challenge?publicSecret=pub_1234567890abcdef']] },
  { id: 'qcloud', detectorId: 'detect-qcloud', name: 'QCloud Captcha',
    scripts: ['https://turing.captcha.qcloud.com/TCaptcha.js'],
    inline: ["var captcha = new TencentCaptcha('190012345', function () {}, { userLanguage: 'en' });"],
    requests: [{ url: 'https://turing.captcha.qcloud.com/cap_union_prehandle?aid=190012345&protocol=https&clientype=2' }],
    key: '190012345',
    analyze: [['sdk', 'https://turing.captcha.qcloud.com/TCaptcha.js'], ['api', 'https://turing.captcha.qcloud.com/cap_union_prehandle?aid=190012345&protocol=https&clientype=2']] },
  { id: 'yidun', detectorId: 'detect-yidun', name: 'NetEase Yidun',
    dom: [div({ class: 'yidun_intellisense yidun_intellisense--light' })],
    scripts: ['https://cstaticdun.126.net/load.min.js'],
    inline: ["initNECaptcha({ captchaId: '0123456789abcdef0123456789abcdef', element: '#c', mode: 'popup' }, function () {}, function () {});"],
    requests: [{ url: 'https://c.dun.163.com/api/v3/get?id=0123456789abcdef0123456789abcdef' }],
    key: '0123456789abcdef0123456789abcdef',
    analyze: [['loader', 'https://cstaticdun.126.net/load.min.js'], ['api', 'https://c.dun.163.com/api/v3/get?id=0123456789abcdef0123456789abcdef']] },
  { id: 'aliyun', detectorId: 'detect-aliyun', name: 'Aliyun Captcha 2.0',
    scripts: ['https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js'],
    inline: ["window.AliyunCaptchaConfig = { region: 'cn', prefix: 'xyz123' }; initAliyunCaptcha({ SceneId: 'c9h3hnfv', mode: 'popup' });"],
    requests: [{ url: 'https://1a2b3c.captcha-open.aliyuncs.com/' }],
    key: 'c9h3hnfv',
    analyze: [['sdk', 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js'], ['api', 'https://1a2b3c.captcha-open.aliyuncs.com/']] },
  { id: 'dingxiang', detectorId: 'detect-dingxiang', name: 'Dingxiang Captcha',
    dom: [div({ class: 'dx_captcha dx_captcha_oneclick' })],
    scripts: ['https://cdn.dingxiang-inc.com/ctu-group/captcha-ui/v5/index.js'],
    inline: ["var myCaptcha = _dx.Captcha(document.getElementById('c'), { appId: 'abcdef0123456789abcdef0123456789', style: 'popup' });"],
    requests: [{ url: 'https://cap.dingxiang-inc.com/api/a?w=380&ak=abcdef0123456789abcdef0123456789&jsv=5.1.53' }],
    key: 'abcdef0123456789abcdef0123456789',
    analyze: [['sdk', 'https://cdn.dingxiang-inc.com/ctu-group/captcha-ui/v5/index.js'], ['api', 'https://cap.dingxiang-inc.com/api/a?w=380&ak=abcdef0123456789abcdef0123456789&jsv=5.1.53']] },
  { id: 'shumei', detectorId: 'detect-shumei', name: 'Shumei Captcha',
    dom: [div({ class: 'shumei_captcha shumei_captcha_wrapper' })],
    scripts: ['https://castatic.fengkongcloud.cn/pr/v1.0.4/smcp.min.js'],
    inline: ["initSMCaptcha({ organization: 'AbCdEfGhIjKlMnOp', product: 'popup' }, function () {});"],
    requests: [{ url: 'https://captcha1.fengkongcloud.cn/ca/v1/register?organization=AbCdEfGhIjKlMnOp&appId=default&channel=web' }],
    key: 'AbCdEfGhIjKlMnOp',
    analyze: [['sdk', 'https://castatic.fengkongcloud.cn/pr/v1.0.4/smcp.min.js'], ['api', 'https://captcha1.fengkongcloud.cn/ca/v1/register?organization=AbCdEfGhIjKlMnOp&appId=default&channel=web']] },
  { id: 'capy', detectorId: 'detect-capy', name: 'Capy Puzzle Captcha',
    dom: [div({ id: 'capy-captcha' }), { tag: 'input', attrs: { type: 'hidden', name: 'capy_captchakey', value: 'PUZZLE_Abcdefghijklmnopqrstuvwxyz' } }],
    scripts: ['https://jp.api.capy.me/puzzle/get_js/?k=PUZZLE_Abcdefghijklmnopqrstuvwxyz'],
    requests: [{ url: 'https://jp.api.capy.me/puzzle/get_image/?k=1' }],
    key: 'PUZZLE_Abcdefghijklmnopqrstuvwxyz',
    analyze: [['sdk', 'https://jp.api.capy.me/puzzle/get_js/?k=PUZZLE_Abcdefghijklmnopqrstuvwxyz'], ['puzzle', 'https://jp.api.capy.me/puzzle/get_image/?k=1']] },
  { id: 'lemin', detectorId: 'detect-lemin', name: 'Lemin Cropped Captcha',
    dom: [div({ id: 'lemin-cropped-captcha' })],
    scripts: [`https://api.leminnow.com/captcha/v1/cropped/${LEMIN_ID}/js`],
    key: LEMIN_ID,
    analyze: [['sdk', `https://api.leminnow.com/captcha/v1/cropped/${LEMIN_ID}/js`]] },
  { id: 'altcha', detectorId: 'detect-altcha', name: 'ALTCHA',
    dom: [{ tag: 'altcha-widget', attrs: { challenge: `https://sentinel.shop.example/v1/challenge?apiKey=${ALTCHA_KEY}`, auto: 'onload' } }],
    scripts: ['https://cdn.jsdelivr.net/npm/altcha@1.2.0/dist/altcha.min.js'],
    // Cloud (named: its request is what the detector and Analyze Scripts read) and a Sentinel on its owner's host (answered by
    // the suite, so Resource Timing lists it: that is where the key is read)
    requests: [{ url: `https://eu.altcha.org/v1/challenge?apiKey=${ALTCHA_KEY}` }, { url: `https://sentinel.shop.example/v1/challenge?apiKey=${ALTCHA_KEY}`, answered: true }],
    key: ALTCHA_KEY,
    analyze: [['widget', 'https://cdn.jsdelivr.net/npm/altcha@1.2.0/dist/altcha.min.js'], ['challenge', `https://eu.altcha.org/v1/challenge?apiKey=${ALTCHA_KEY}`]] },
  { id: 'binance', detectorId: 'detect-binance-captcha', name: 'Binance Captcha',
    scripts: ['https://bin.bnbstatic.com/static/js/se/captcha/v1/captcha.min.js?v=1728600000'],
    requests: [{ method: 'POST', url: 'https://www.binance.com/bapi/composite/v1/public/antibot/getCaptcha' }],
    analyze: [['sdk', 'https://bin.bnbstatic.com/static/js/se/captcha/v1/captcha.min.js?v=1728600000'], ['antibot api', 'https://www.binance.com/bapi/composite/v1/public/antibot/getCaptcha']] },
  { id: 'basilisk', detectorId: 'detect-basilisk', name: 'Basilisk Captcha',
    scripts: ['https://basiliskcaptcha.com/static/js/basilisk.min.js'],
    requests: [{ url: 'https://basiliskcaptcha.com/challenge/check-site?site_key=0f1a2b3c' }],
    analyze: [['basilisk', 'https://basiliskcaptcha.com/static/js/basilisk.min.js'], ['check-site', 'https://basiliskcaptcha.com/challenge/check-site?site_key=0f1a2b3c']] },
  { id: 'aliexpress', detectorId: 'detect-aliexpress', name: 'AliExpress CAPTCHA',
    scripts: ['https://g.alicdn.com/bsop-static/sufei-punish/0.1.114/build/punishpage.min.js'],
    requests: [{ url: 'https://www.aliexpress.com/_____tmd_____/punish?x5step=1&x5secdata=sample' }],
    analyze: [['punish script', 'https://g.alicdn.com/bsop-static/sufei-punish/0.1.114/build/punishpage.min.js'], ['punish page', 'https://www.aliexpress.com/_____tmd_____/punish?x5step=1&x5secdata=sample']] }
];
for (const spec of GENERIC) { spec.generic = true; spec.title = `${spec.name} probe`; }
for (const spec of BESPOKE) spec.generic = false;

const ALL = [...BESPOKE, ...GENERIC];
const byId = id => ALL.find(spec => spec.id === id);

const esc = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const absolute = (url, origin) => (/^https?:\/\//.test(url) ? url : `${origin}${url}`);
const attrs = map => Object.entries(map || {}).map(([name, value]) => ` ${name}="${esc(value)}"`).join('');

/** The fetches a page makes at load, as one inline script. */
function requestsScript(requests, origin) {
  if (!requests || !requests.length) return '';
  const list = requests.map(request => ({
    url: absolute(request.url, origin), method: request.method || 'GET', body: request.body, form: request.form, bytes: request.bytes,
    headers: request.headers, delay: request.delay || 0, mode: request.mode || (request.url.startsWith('/') ? 'same-origin' : 'no-cors')
  }));
  return `<script>(function () { ${JSON.stringify(list)}.forEach(function (r) {
    var init = { method: r.method, mode: r.mode };
    if (r.body !== undefined && r.body !== null) init.body = r.body;
    if (r.form) init.body = new URLSearchParams(r.form);
    if (r.bytes) init.body = new Uint8Array(r.bytes);
    if (r.headers) init.headers = r.headers;
    setTimeout(function () { fetch(r.url, init).catch(function () {}); }, r.delay);
  }); })();</script>`;
}

/** What a local server answers for a spec: status, headers (cookies included) and the page. */
function renderPage(spec, origin) {
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...(spec.headers || {}) };
  const cookies = (spec.cookies || []).map(([name, value, extra]) => `${name}=${value}; Path=/${extra ? `; ${extra}` : ''}`);
  const body = [
    ...(spec.dom || []).map(el => `<${el.tag}${attrs(el.attrs)}>${el.text ? esc(el.text) : ''}</${el.tag}>`),
    spec.body || '',
    ...(spec.scripts || []).map(src => `<script src="${esc(absolute(src, origin))}"></script>`),
    ...(spec.inline || []).map(code => `<script>${code}</script>`),
    requestsScript(spec.requests, origin)
  ].filter(Boolean).join('\n');
  return { status: 200, headers, cookies, html: `<!doctype html><html><head><meta charset="utf-8"><title>${esc(spec.title || spec.id)}</title></head><body>\n${body}\n</body></html>` };
}

/** The local script paths a spec asks for (query dropped) and what each answers: a script that defines nothing. */
function stubsOf(spec) {
  const out = {};
  for (const src of spec.scripts || []) {
    if (!src.startsWith('/')) continue;
    const path = src.split('?')[0];
    out[path] = (spec.stubs && spec.stubs[path]) || '/* e2e stub */';
  }
  const body = spec.body || '';
  for (const match of body.matchAll(/src="(\/[^"?]*)"/g)) out[match[1]] = (spec.stubs && spec.stubs[match[1]]) || '/* e2e stub */';
  for (const [path, code] of Object.entries(spec.stubs || {})) out[path] = code;
  return out;
}

/** One page carrying the signals of several protections. */
function merge(id, ...specs) {
  const out = { id, title: `${id} probe`, cookies: [], headers: {}, dom: [], scripts: [], inline: [], requests: [], stubs: {}, body: '' };
  for (const spec of specs) {
    out.cookies.push(...(spec.cookies || []));
    Object.assign(out.headers, spec.headers || {});
    out.dom.push(...(spec.dom || []));
    out.scripts.push(...(spec.scripts || []));
    out.inline.push(...(spec.inline || []));
    out.requests.push(...(spec.requests || []));
    Object.assign(out.stubs, spec.stubs || {});
    out.body += spec.body || '';
  }
  return out;
}

/** The page as the detection engine takes it (what the worker and the content script collect): cookies, headers, requests, source, nodes. */
function pageSignals(spec, origin) {
  const urls = [...(spec.scripts || []).map(src => absolute(src, origin)), ...(spec.requests || []).map(request => absolute(request.url, origin))];
  return {
    url: `${origin}/p/${spec.id}`,
    allCookies: (spec.cookies || []).map(([name, value]) => ({ name, value })),
    responseCookies: [],
    headers: Object.fromEntries(Object.entries(spec.headers || {}).map(([name, value]) => [name.toLowerCase(), value])),
    networkUrls: urls.map(url => ({ url, type: 'script', method: 'GET' })),
    payloads: (spec.requests || []).filter(request => request.method === 'POST' && (request.body || request.form)).map(request => ({
      method: 'POST', url: absolute(request.url, origin), type: 'text', data: request.body || new URLSearchParams(request.form).toString() })),
    responses: [],
    content: (spec.inline || []).map(code => ({ type: 'inline', content: code })),
    dom: (spec.dom || []).map(el => ({ tagName: el.tag, id: (el.attrs || {}).id || '', class: (el.attrs || {}).class || '', attributes: { ...(el.attrs || {}) } }))
  };
}

// ---- Pages that are not one protection's own ----------------------------------------------------------------------------------
const shape = byId('shapesecurity');
const VARIANTS = [
  // Shape v2: the same loader, without the runtime global v1 has (its own script path, so the server answers it differently)
  { ...shape, id: 'shapesecurity-v2', title: 'Shape Security v2 probe', scripts: shape.scripts.map(src => src.replace('/ssx/', '/ssx2/')), stubs: {} },
  // The scripts and requests of these two come only from the second load on: the first one is a page with nothing to list, so
  // Analyze Scripts has to reload it (the cookie that detects the protection is there from the start)
  { ...byId('datadome'), id: 'datadome-late', title: 'DataDome late probe', late: true },
  { ...byId('cloudflare'), id: 'cloudflare-late', title: 'Cloudflare late probe', late: true },
  // The same for a CAPTCHA described as data: its widget markup alone detects it (60%), the script and the requests come with the second load
  { ...byId('altcha'), id: 'altcha-late', title: 'ALTCHA late probe', late: true },
  { id: 'plain', title: 'Plain page', dom: [{ tag: 'p', attrs: {}, text: 'Nothing here is protected' }] },
  // A page that only names a vendor (10%): below the minimum, so no tools
  { id: 'weak', title: 'Weak signal', inline: ['var vendor = "grecaptcha";'] },
  merge('multi', byId('akamai'), byId('datadome'), byId('recaptcha'))
];
const SPECS = [...ALL, ...VARIANTS];

// ---- The local site ------------------------------------------------------------------------------------------------------------
const specById = new Map(SPECS.map(spec => [spec.id, spec]));
const stubs = {};
for (const spec of SPECS) Object.assign(stubs, stubsOf(spec));
const loads = {};          // page address -> how many times the server sent it
const cookiesSeen = {};    // page address -> the Cookie header of its last request
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const origin = `http://${req.headers.host}`;
  if (req.method === 'POST') {
    req.resume();
    req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); });
    return;
  }
  const match = /^\/p\/([a-z0-9-]+)$/.exec(url.pathname);
  if (match && specById.has(match[1])) {
    const key = url.pathname + url.search;
    loads[key] = (loads[key] || 0) + 1;
    cookiesSeen[key] = req.headers.cookie || '';
    let spec = specById.get(match[1]);
    if (spec.late && loads[key] === 1) spec = { ...spec, scripts: [], requests: [], inline: [], body: '' };
    const page = renderPage(spec, origin);
    const headers = { ...page.headers };
    if (page.cookies.length) headers['set-cookie'] = page.cookies;
    res.writeHead(page.status, headers);
    return res.end(page.html);
  }
  if (Object.hasOwn(stubs, url.pathname)) {
    res.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' });
    return res.end(stubs[url.pathname]);
  }
  if (url.pathname.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
  res.writeHead(404); res.end();
});

// ---- Results -------------------------------------------------------------------------------------------------------------------
const results = [];
const only = (process.argv.find(arg => arg.startsWith('--only=')) || '').slice(7).toLowerCase().split(',').filter(Boolean);
const wanted = name => !only.length || only.some(part => name.toLowerCase().includes(part));
const seconds = started => `${Math.round((Date.now() - started) / 1000)}s`;
function record(status, name, started, detail = '') {
  results.push({ status, name, detail });
  const lines = String(detail).split('\n').slice(0, status === 'fail' ? 7 : 2).join('\n      ');
  console.log(`${status.toUpperCase().padEnd(4)}  ${name}${started ? ` (${seconds(started)})` : ''}${lines ? `\n      ${lines}` : ''}`);
}
const skip = (name, reason) => { if (wanted(name)) record('skip', name, 0, reason); };

async function main() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (_) {
    console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium');
    process.exit(2);
  }
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-advanced-tools-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 420, height: 650 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`,
      // Every name outside this machine resolves to nothing: no request leaves it, and the extension still sees each one
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']
  });
  let extId;
  const problems = [];
  const noise = /Failed to load resource|net::ERR_|favicon/i;
  const watch = (page, label) => {
    page.on('pageerror', error => problems.push(`${label} pageerror: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error' && !noise.test(message.text())) problems.push(`${label} console.error: ${message.text().slice(0, 240)}`); });
  };

  // ---- Browser plumbing ---------------------------------------------------------------------------------------------------
  const wait = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { polling: 250, timeout: ms });
  async function getWorker(ms = 40000) {
    const end = Date.now() + ms;
    let woke = 0;
    for (;;) {
      const sw = ctx.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
      if (sw) return sw;
      if (Date.now() > end) throw new Error('the extension service worker did not start');
      if (extId && Date.now() - woke > 4000) {
        woke = Date.now();
        const wake = await ctx.newPage();
        await wake.goto(`chrome-extension://${extId}/popup.html`).catch(() => {});
        await sleep(800);
        await wake.close();
      }
      await sleep(200);
    }
  }
  const W = async (fn, arg) => (await getWorker()).evaluate(fn, arg);
  async function until(check, ms = 20000, what = 'condition') {
    const end = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(300);
    }
  }
  async function open(url) {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'commit' }).catch(() => {});
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    return page;
  }
  const tabOf = url => W(async u => (await chrome.tabs.query({})).find(tab => tab.url === u) || null, url);

  // ---- Start-up -----------------------------------------------------------------------------------------------------------
  await W(() => 1);
  extId = new URL((await getWorker()).url()).host;
  await sleep(2500);
  await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
  // The pages here share one host: with the default scope (the domain) every page after the first would be answered from the
  // first one's saved result. The full address, with a run number of its own on each visit, scans each page for itself.
  assert.equal(await W(patch => SettingsStore.mutate({ operation: 'patch', patch }).then(result => result.success === true), { detection: { cacheScope: 'full' } }), true, 'the cache scope is set to the full address');
  const admin = await ctx.newPage();
  watch(admin, 'admin');
  await admin.goto(`chrome-extension://${extId}/popup.html`);
  await wait(admin, () => window.popupInstance?.detectorManager?.initialized, null, 30000);
  await sleep(1500);

  // ---- Detection and the popup --------------------------------------------------------------------------------------------
  const detections = tabId => admin.evaluate(id => chrome.runtime.sendMessage({ type: 'GET_DETECTION_DATA', tabId: id }), tabId);
  /** Wait until the worker holds a result for the tab that names the detector above the Advanced minimum (50%). */
  async function awaitDetected(tab, detectorId) {
    return until(async () => {
      const answer = await detections(tab.id);
      const list = (answer && answer.status === 'ok' && answer.data && answer.data.detectionResults) || [];
      return list.find(item => item.detector && item.detector.id === detectorId && Number(item.confidence) > 50) || null;
    }, 45000, `${detectorId} above 50% on ${tab.url}`);
  }
  /** The popup, pointed at the test page's tab: chrome.tabs.query answers with it, as the real popup would see it. */
  async function popupFor(tab) {
    const popup = await ctx.newPage();
    watch(popup, 'popup');
    await popup.addInitScript((target) => {
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = (info, callback) => {
        if (info && info.active) { if (callback) { callback([target]); return undefined; } return Promise.resolve([target]); }
        return query(info, callback);
      };
      // The real popup closes after Start Capturing; here it is counted
      window.__closed = 0;
      window.close = () => { window.__closed++; };
    }, tab);
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await wait(popup, () => window.popupInstance?.detection?.initialized && window.popupInstance?.settings?.settingsBaseline, null, 30000);
    // The clipboard is the one thing a page cannot be given in a test: what the person copies is recorded instead
    await popup.evaluate(() => { window.__copied = []; AdvancedUtils.copyToClipboard = async (text) => { window.__copied.push(String(text)); return true; }; });
    return popup;
  }
  /** Advanced tab, and the protection's tools open (at once when it is the only one, else from its card). */
  async function openTools(popup, detectorId) {
    await popup.$eval('.tab-btn[data-tab="advanced"]', el => el.click());
    await wait(popup, () => document.querySelector('#detectionToolsPanel .advanced-tool-card') || document.querySelector('.advanced-launch-card')
      || document.querySelector('#advancedNoTools'), null, 30000);
    if (!(await popup.$('#detectionToolsPanel .advanced-tool-card'))) {
      assert.ok(await popup.$(`.advanced-launch-card[data-detector-id="${detectorId}"]`), `Advanced offers ${detectorId}: ${await popup.$$eval('.advanced-launch-card', cards => cards.map(card => card.dataset.detectorId).join(', ') || 'no protection')}`);
      await popup.$eval(`.advanced-launch-card[data-detector-id="${detectorId}"]`, el => el.click());
      await wait(popup, () => !!document.querySelector('#detectionToolsPanel .advanced-tool-card'), null, 15000);
    }
  }

  // ---- What a result window and a dialog say -----------------------------------------------------------------------------
  /** The newest result window (kit overlay): title, text, copyable values, footer buttons, cookies and script rows. */
  async function modalOpen(popup, ms = 40000) {
    await wait(popup, () => !!document.querySelector('.adv-kit-overlay .adv-kit-title'), null, ms);
    return popup.evaluate(() => {
      const overlay = [...document.querySelectorAll('.adv-kit-overlay')].pop();
      const chip = node => (node ? node.textContent.trim() : '');
      return {
        title: overlay.querySelector('.adv-kit-title').textContent.trim(),
        subtitle: chip(overlay.querySelector('.adv-kit-subtitle')),
        text: overlay.querySelector('.adv-kit-body').innerText,
        copies: [...overlay.querySelectorAll('[data-copy]')].map(node => node.getAttribute('data-copy')),
        buttons: [...overlay.querySelectorAll('.adv-kit-footer .adv-kit-btn')].map(button => button.textContent.trim()),
        cookies: [...overlay.querySelectorAll('.adv-cookie-name-text')].map(node => node.textContent.trim()),
        rows: [...overlay.querySelectorAll('.adv-script-row')].map(row => ({
          type: chip(row.querySelector('.adv-kit-chip')), resource: chip(row.querySelectorAll('.adv-kit-chip')[1]), url: row.getAttribute('data-copy') }))
      };
    });
  }
  async function closeModal(popup) {
    await popup.evaluate(() => { const overlay = [...document.querySelectorAll('.adv-kit-overlay')].pop(); overlay && overlay.querySelector('.advanced-modal-close-btn').click(); });
    await wait(popup, () => !document.querySelector('.adv-kit-overlay'), null, 8000);
  }
  /** Press a result window's footer button by its label. */
  const footer = (popup, label) => popup.evaluate(text => {
    const overlay = [...document.querySelectorAll('.adv-kit-overlay')].pop();
    const button = [...overlay.querySelectorAll('.adv-kit-footer .adv-kit-btn')].find(item => item.textContent.trim() === text);
    if (!button) throw new Error(`no footer button "${text}"`);
    button.click();
  }, label);
  /** The Export Code dialog (script parsing code generator): what it offers; then switches language and closes. */
  async function codeDialog(popup, { mustContain = [], minLanguages = 2 } = {}) {
    await wait(popup, () => !!document.querySelector('.advanced-code-dialog textarea'), null, 15000);
    const first = await popup.evaluate(() => ({
      title: document.querySelector('.advanced-code-dialog__title').textContent.trim(),
      types: [...document.querySelectorAll('.advanced-code-dialog__type')].map(button => button.textContent.trim()),
      languages: [...document.querySelectorAll('.advanced-code-dialog__language')].map(button => button.textContent.trim()),
      code: document.querySelector('.advanced-code-dialog textarea').value
    }));
    assert.ok(first.code.length > 40, `the dialog shows code: "${first.code.slice(0, 60)}"`);
    for (const text of mustContain) assert.ok(first.code.includes(text), `the code names ${text}`);
    assert.ok(first.languages.length >= minLanguages, `languages: ${first.languages.join(', ')}`);
    // Another language, when there is one: other code. Copy Code copies what is shown
    let shown = first.code;
    if (first.languages.length >= 2) {
      await popup.evaluate(() => document.querySelectorAll('.advanced-code-dialog__language')[1].click());
      shown = await popup.$eval('.advanced-code-dialog textarea', el => el.value);
      assert.notEqual(shown, first.code, 'a second language shows other code');
    }
    await popup.evaluate(() => { window.__copied = []; document.querySelector('.advanced-code-dialog__copy').click(); });
    await until(() => popup.evaluate(() => window.__copied.length), 5000, 'Copy Code');
    assert.equal((await popup.evaluate(() => window.__copied))[0], shown);
    // Escape closes it
    await popup.keyboard.press('Escape');
    await wait(popup, () => !document.querySelector('.advanced-code-dialog'), null, 8000);
    return first;
  }
  const toasts = popup => popup.$$eval('.notification-toast', nodes => nodes.map(node => node.innerText.trim()));
  const countOf = (popup, moduleId) => popup.evaluate(async id => ((await AdvancedHistoryStore.load())[id] || []).length, moduleId);
  const entriesOf = (popup, moduleId) => popup.evaluate(async id => (await AdvancedHistoryStore.load())[id] || [], moduleId);
  async function reset(popup) {
    await popup.evaluate(() => document.querySelectorAll('.adv-kit-overlay .advanced-modal-close-btn, .tool-modal .advanced-modal-close-btn').forEach(button => button.click()));
    await wait(popup, () => !document.querySelector('.adv-kit-overlay, .tool-modal'), null, 8000).catch(() => {});
    await popup.evaluate(() => { window.__copied = []; document.querySelectorAll('.notification-toast .notification-close').forEach(button => button.click()); });
  }

  // ---- A protection's session: its page, its tab, its popup with the tools open ---------------------------------------------
  let runs = 0;
  async function openSession(spec, { variant = spec.id } = {}) {
    await ctx.clearCookies();
    const url = `${origin}/p/${variant}?run=${++runs}`;
    const page = await open(url);
    let tab; let hit; let popup = null;
    try {
      tab = await until(() => tabOf(url), 15000, `the tab of ${url}`);
      hit = await awaitDetected(tab, spec.detectorId);
      assert.equal(hit.detector.name, spec.name, 'the detector is the one this fixture stands for');
      popup = await popupFor(tab);
      await openTools(popup, spec.detectorId);
    } catch (error) {
      // A session that does not open leaves neither its page nor its popup behind for the next one
      if (popup) await popup.close().catch(() => {});
      await page.close().catch(() => {});
      throw error;
    }
    const session = {
      spec, url, page, tab, popup, hit, origin,
      toolIds: () => popup.$$eval('#detectionToolsPanel .advanced-tool-card', cards => cards.map(card => card.id)),
      async idle(id, ms = 60000) { await wait(popup, tool => { const card = document.querySelector(`#${tool}`); return !!card && !card.disabled && !card.classList.contains('is-working'); }, id, ms); },
      async click(id) { await session.idle(id); await popup.$eval(`#${id}`, el => el.click()); },
      modal: (ms) => modalOpen(popup, ms),
      closeModal: () => closeModal(popup),
      count: moduleId => countOf(popup, moduleId),
      entries: moduleId => entriesOf(popup, moduleId),
      async saved(moduleId, before) { return until(async () => (await countOf(popup, moduleId)) > before, 15000, `a new ${moduleId} entry in Advanced → History`); },
      async reloadPage() { await page.reload({ waitUntil: 'load' }); },
      async close() { await popup.close().catch(() => {}); await page.close().catch(() => {}); }
    };
    return session;
  }

  // ---- Actions -------------------------------------------------------------------------------------------------------------
  async function action(name, fn) {
    if (!wanted(name)) return;
    const started = Date.now();
    const before = problems.length;
    try {
      await fn();
      const fresh = problems.slice(before);
      if (fresh.length) throw new Error(`an extension page reported: ${fresh.join(' | ')}`);
      record('pass', name, started);
    } catch (error) {
      record('fail', name, started, String((error && error.stack) || error).split('\n').slice(0, 7).join('\n'));
    }
  }
  /** One protection: open its session once, run each action against it, close. A session that cannot open fails every action. */
  async function protection(spec, actions, { before, after, variant } = {}) {
    const names = ['detected above 50%, and Advanced opens its tools', ...actions.map(([name]) => name)].map(name => `${variant || spec.id} › ${name}`);
    if (!names.some(wanted)) return;
    let session = null;
    const started = Date.now();
    try {
      if (before) await before();
      session = await openSession(spec, { variant });
      record('pass', names[0], started);
    } catch (error) {
      record('fail', names[0], started, String((error && error.stack) || error).split('\n').slice(0, 7).join('\n'));
      for (const name of names.slice(1)) if (wanted(name)) record('fail', name, 0, 'not run: the tools did not open');
      if (after) await after().catch(() => {});
      return;
    }
    for (const [name, fn] of actions) {
      await action(`${variant || spec.id} › ${name}`, async () => {
        await reset(session.popup);
        await fn(session);
        await reset(session.popup);
      });
    }
    await session.close();
    if (after) await after().catch(() => {});
  }

  // ---- Reusable actions ------------------------------------------------------------------------------------------------------
  const sorted = list => [...list].sort();
  /** The cards the tools panel shows: this protection's tools, Scrape with Scrapfly, and the capture card last. */
  const toolsAction = spec => ['Advanced shows exactly its tools, the capture card last', async t => {
    const ids = await t.toolIds();
    assert.deepEqual(sorted(ids), sorted([...spec.tools, `${spec.id}ScrapeWithScrapfly`]), `cards: ${ids.join(', ')}`);
    const capture = ids.findIndex(id => id.endsWith('StartCapture'));
    if (capture !== -1) assert.equal(capture, ids.length - 1, 'the capture card is the last row');
    assert.equal(await t.popup.$eval('#compactDetectionName', el => el.textContent.trim()).catch(() => spec.name), spec.name);
  }];
  const scrapflyAction = spec => ['Scrape with Scrapfly opens its export dialog and closes', async t => {
    await t.click(`${spec.id}ScrapeWithScrapfly`);
    await wait(t.popup, () => !!document.querySelector('.adv-kit-overlay .scrapfly-export-modal'), null, 15000);
    const shown = await t.popup.evaluate(() => ({ title: document.querySelector('.scrapfly-export-modal .adv-kit-title').textContent.trim(),
      code: document.querySelector('.scrapfly-export-pre code').textContent }));
    assert.ok(shown.code.length > 30, `the export dialog shows code: ${shown.title}`);
    await t.popup.keyboard.press('Escape');
    await wait(t.popup, () => !document.querySelector('.adv-kit-overlay'), null, 8000);
  }];
  /** A click on a value of a result window puts exactly that value on the clipboard (the clipboard is recorded, see popupFor). */
  async function copyByClick(t, value) {
    await t.popup.evaluate(() => { window.__copied = []; });
    await t.popup.evaluate(wanted => {
      const node = [...document.querySelectorAll('.adv-kit-overlay [data-copy]')].reverse().find(item => item.getAttribute('data-copy') === wanted);
      if (!node) throw new Error(`nothing to copy with the value ${wanted}`);
      node.click();
    }, value);
    await until(() => t.popup.evaluate(() => window.__copied.length), 5000, `a click on ${String(value).slice(0, 40)} to copy it`);
    assert.equal((await t.popup.evaluate(() => window.__copied))[0], value, 'a click copies the value it shows');
  }
  /** Check Cookies: the window, the cookies it lists, what it says about them, and a History entry. */
  const cookiesAction = (spec, { title, found, names, facts = [] }) => ['Check Cookies lists the page\'s cookies and saves the result', async t => {
    const before = await t.count(spec.id);
    await t.click(`${spec.id}CheckCookies`);
    const modal = await t.modal();
    assert.equal(modal.title, title);
    assert.match(modal.text, new RegExp(`Found ${found} cookies`));
    for (const name of names) assert.ok(modal.cookies.includes(name), `${name} among ${modal.cookies.join(', ')}`);
    for (const fact of facts) assert.ok(modal.text.includes(fact), `${fact} in the window`);
    await t.closeModal();
    await t.saved(spec.id, before);
  }];
  /** Analyze Scripts from what the page already loaded: every expected address with its classification; Export Code. */
  const scriptsAction = (spec, toolId, { title, labels = {}, exact = false, export: exportCode = true }) => ['Analyze Scripts lists the vendor\'s scripts of the loaded page, with Export Code', async t => {
    const before = await t.count(spec.id);
    await t.click(toolId);
    const modal = await t.modal();
    const at = url => (/^https?:\/\//.test(url) ? url : `${t.origin}${url}`);
    const expected = spec.analyze.map(([type, url]) => [labels[type] || type, at(url)]);
    assert.equal(modal.title, title(modal.rows.length), `the title counts the rows shown (${modal.rows.length}): ${modal.title}`);
    for (const [type, url] of expected) assert.ok(modal.rows.some(row => row.url === url && row.type === type), `${type} ${url} among ${JSON.stringify(modal.rows)}`);
    if (exact) assert.equal(modal.rows.length, expected.length, `only the vendor's own requests: ${JSON.stringify(modal.rows.map(row => row.url))}`);
    await copyByClick(t, expected[0][1]);
    if (exportCode) {
      await footer(t.popup, 'Export Code');
      const dialog = await codeDialog(t.popup, { mustContain: [expected[0][1]] });
      assert.equal(dialog.title, 'Export Code');
    }
    await t.closeModal();
    await t.saved(spec.id, before);
  }];
  /** Extract Site Key / Public Key: the window shows the key; it is saved. */
  const siteKeyAction = (spec, toolId, { title, key }) => ['Extract Site Key shows the key of the page and saves the result', async t => {
    const before = await t.count(spec.id);
    await t.click(toolId);
    const modal = await t.modal();
    assert.equal(modal.title, title);
    assert.ok(modal.copies.includes(key), `${key} among ${modal.copies.join(', ')}`);
    await copyByClick(t, key);
    await t.closeModal();
    await t.saved(spec.id, before);
  }];
  /** A capture: Start (the card turns into Stop, the popup would close), the reload that feeds it, the entry in History. */
  async function startCapture(t, spec) {
    const id = `${spec.id}StartCapture`;
    await t.click(id);
    await wait(t.popup, card => document.querySelector(`#${card}`).getAttribute('aria-pressed') === 'true', id, 20000);
    assert.equal(await t.popup.$eval(`#${id} .advanced-tool-label`, el => el.textContent.trim()), 'Stop Capturing');
    await until(() => t.popup.evaluate(() => window.__closed > 0), 5000, 'the popup closing after Start Capturing');
  }
  const stopLabelBack = (t, spec) => wait(t.popup, card => document.querySelector(`#${card}`).getAttribute('aria-pressed') === 'false'
    && document.querySelector(`#${card} .advanced-tool-label`).textContent.trim() === 'Start Capturing', `${spec.id}StartCapture`, 30000);
  /** Start, reload (the user's), wait for the capture entry; returns the saved entry. */
  async function captureFlow(t, spec, { reloads = 1 } = {}) {
    const before = await t.count(spec.id);
    await startCapture(t, spec);
    for (let i = 0; i < reloads; i++) await t.reloadPage();
    await t.saved(spec.id, before);
    await stopLabelBack(t, spec);
    const [latest] = await t.entries(spec.id);
    return latest;
  }
  /**
   * The tool's own Captured Data list under its cards. It is drawn when a capture ends while the popup is open, which is how this
   * suite keeps it (the real popup closes after Start Capturing). It lists this site's captures, a click opens one, and Clear asks
   * first and empties this tool only. A new capture follows, so Advanced → History still holds one of this tool's for its scenarios.
   */
  const capturedDataAction = spec => ['Captured Data under the tools lists the captures, opens one, and Clear asks first and empties this tool only', async t => {
    const id = spec.id;
    const clearButton = `#clear${id.charAt(0).toUpperCase()}${id.slice(1)}History`;
    const section = () => t.popup.evaluate(moduleId => {
      const root = document.querySelector('#detectionToolsPanel .capture-history-section');
      if (!root) return null;
      return { count: root.querySelector('.history-count').textContent.trim(), cards: root.querySelectorAll(`#${moduleId}HistoryList .capture-card[data-capture-id]`).length,
        empty: !!root.querySelector('.empty-capture-state'), clear: !!root.querySelector('.clear-history-btn') };
    }, id);
    const stored = (await t.entries(id)).length;
    assert.ok(stored >= 1, 'the capture scenario before this one saved something');
    // Every fixture is 127.0.0.1, so the list of this site holds all of this tool's captures
    const shown = await until(async () => { const view = await section(); return view && view.count === `Captures: ${stored}` ? view : null; }, 20000, `the Captured Data section counting ${stored}`);
    assert.ok(shown.cards >= 1 && shown.clear, JSON.stringify(shown));
    // A click on one opens its details
    await t.popup.evaluate(moduleId => document.querySelector(`#${moduleId}HistoryList .capture-card[data-capture-id]`).click(), id);
    const modal = await t.modal();
    assert.equal(modal.title, 'Capture Details');
    assert.ok(modal.text.trim().length > 20, `details: ${modal.text.slice(0, 80)}`);
    await t.closeModal();
    // Clear asks first: Cancel loses nothing
    const confirmOpen = () => wait(t.popup, () => !!document.querySelector('.notification-confirm[data-open="true"] .notification-btn-confirm'), null, 8000);
    await t.popup.$eval(clearButton, el => el.click());
    await confirmOpen();
    await t.popup.$eval('.notification-confirm[data-open="true"] .notification-btn-cancel', el => el.click());
    await wait(t.popup, () => !document.querySelector('.notification-confirm[data-open="true"]'), null, 8000);
    assert.equal((await t.entries(id)).length, stored, 'Cancel keeps the captures');
    // Clear Data empties this tool's captures and nothing else
    const othersOf = () => t.popup.evaluate(async moduleId => Object.entries(await AdvancedHistoryStore.load()).filter(([key]) => key !== moduleId)
      .reduce((sum, [, list]) => sum + list.length, 0), id);
    const others = await othersOf();
    await t.popup.$eval(clearButton, el => el.click());
    await confirmOpen();
    await t.popup.$eval('.notification-confirm[data-open="true"] .notification-btn-confirm', el => el.click());
    await until(async () => (await t.entries(id)).length === 0, 10000, `${id}'s captures to be cleared`);
    assert.equal(await othersOf(), others, 'the other tools keep their captures');
    await until(async () => { const view = await section(); return view && view.empty && !view.clear ? view : null; }, 10000, 'the empty Captured Data state');
    // The next capture lands again
    await captureFlow(t, spec);
  }];
  /** Start, then Stop with nothing captured: the card is back, nothing saved, the worker says it is not capturing. */
  const stopAction = spec => ['Stop Capturing ends a capture that has seen nothing, and saves nothing', async t => {
    const before = await t.count(spec.id);
    await startCapture(t, spec);
    await t.click(`${spec.id}StartCapture`);
    await stopLabelBack(t, spec);
    const state = await t.popup.evaluate(({ type, tabId }) => chrome.runtime.sendMessage({ type, tabId }), { type: `${spec.id.toUpperCase()}_GET_CAPTURE_STATE`, tabId: t.tab.id });
    assert.equal(state.isCapturing, false, JSON.stringify(state));
    assert.equal(await t.count(spec.id), before);
  }];

  // =================================================================================================================================
  // Part A: the 16 CAPTCHA vendors described as data
  // =================================================================================================================================
  for (const spec of GENERIC) {
    const actions = [toolsAction({ ...spec, tools: [...(spec.key ? [`${spec.id}ExtractSiteKey`] : []), `${spec.id}AnalyzeScripts`] })];
    const options = ctxSetup(spec);
    if (spec.key) actions.push(siteKeyAction(spec, `${spec.id}ExtractSiteKey`, { title: `${spec.name} site key`, key: spec.key }));
    actions.push(scriptsAction(spec, `${spec.id}AnalyzeScripts`, { title: n => `${spec.name} Scripts (${n})`, exact: true }));
    actions.push(scrapflyAction(spec));
    await protection(spec, actions, options);
  }
  /** ALTCHA's key is read from a request the page made and the suite answers (so Resource Timing lists it). */
  function ctxSetup(spec) {
    if (spec.id !== 'altcha') return {};
    const pattern = 'https://sentinel.shop.example/**';
    return {
      before: () => ctx.route(pattern, route => route.fulfill({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' }, body: '{"algorithm":"SHA-256"}' })),
      after: () => ctx.unroute(pattern)
    };
  }

  // The reload path every CAPTCHA described as data shares: nothing of the vendor loaded yet (the page names it only in its markup),
  // so Analyze Scripts asks the worker to watch the tab, reloads it, and shows what the reload loaded
  const altcha = byId('altcha');
  await protection(altcha, [
    ['Analyze Scripts of a page with nothing loaded yet reloads it and lists what the reload loaded', async t => {
      const key = new URL(t.url).pathname + new URL(t.url).search;
      assert.equal(loads[key], 1, 'one load so far');
      const before = await t.count('altcha');
      await t.click('altchaAnalyzeScripts');
      const modal = await t.modal(60000);
      assert.equal(modal.title, 'ALTCHA Scripts (2)');
      assert.ok(loads[key] >= 2, 'the page was reloaded');
      for (const [type, url] of altcha.analyze) assert.ok(modal.rows.some(row => row.type === type && row.url === url), `${type} ${url} among ${JSON.stringify(modal.rows)}`);
      await t.closeModal();
      await t.saved('altcha', before);
    }]
  ], { variant: 'altcha-late', ...ctxSetup(altcha) });

  // =================================================================================================================================
  // Part B: the tools with their own module
  // =================================================================================================================================
  // ---- Akamai -------------------------------------------------------------------------------------------------------------------
  const akamai = byId('akamai');
  await protection(akamai, [
    toolsAction(akamai),
    cookiesAction(akamai, { title: 'Akamai Cookies', found: '3/12', names: ['_abck', 'bm_sz', 'ak_bmsc'], facts: ['Protection Level', 'Standard'] }),
    ['Analyze Scripts reloads the page and lists its sensor script, pixel challenge and endpoints, with Export Code', async t => {
      const before = await t.count('akamai');
      await t.click('akamaiAnalyzeContent');
      const modal = await t.modal();
      assert.equal(modal.title, 'Akamai Analysis');
      assert.match(modal.subtitle, /^Found [1-9]\d* relevant script\(s\)$/);
      assert.ok(modal.copies.includes(`${t.origin}/Xk3-aB/9f2e7c1d`), `the sensor script among ${modal.copies.join(', ')}`);
      assert.ok(modal.copies.includes('bazadebezolkohpepadr="123456789"'), 'the pixel variable');
      assert.ok(modal.copies.includes(`${t.origin}/akam/13/26dcf39b`), 'the pixel script');
      await footer(t.popup, 'Export Code');
      const dialog = await codeDialog(t.popup);
      assert.equal(dialog.title, 'Script Parsing Code Generator');
      assert.ok(dialog.types.includes('All Types'), dialog.types.join(', '));
      await t.closeModal();
      await t.saved('akamai', before);
    }],
    ['Extract Sensor Information deletes the cookies, reloads, and shows the sensor the page sent', async t => {
      const before = await t.count('akamai');
      await t.click('akamaiExtractSensor');
      const modal = await t.modal(60000);
      assert.equal(modal.title, 'Extracted Sensor Information');
      assert.ok(modal.copies.some(value => value === AKAMAI_SENSOR), `the sensor among ${modal.copies.map(value => value.slice(0, 40)).join(' | ')}`);
      assert.ok(modal.buttons.includes('Copy All Data as JSON'), modal.buttons.join(', '));
      await footer(t.popup, 'Copy All Data as JSON');
      await until(() => t.popup.evaluate(() => window.__copied.length), 5000, 'Copy All Data as JSON');
      assert.ok(JSON.parse((await t.popup.evaluate(() => window.__copied))[0]).sensorData === AKAMAI_SENSOR);
      await t.closeModal();
      await t.saved('akamai', before);
    }],
    ['Start Capturing, the reload, and the capture lands in Advanced → History', async t => {
      const saved = await captureFlow(t, akamai);
      const data = saved.captureData || saved.data;
      assert.equal(data.abckCookie, true, JSON.stringify(data).slice(0, 200));
      assert.match(String(data.akamaiVersion), /^Akamai V3$/);
    }],
    capturedDataAction(akamai),
    stopAction(akamai),
    scrapflyAction(akamai)
  ]);

  // ---- AWS WAF ------------------------------------------------------------------------------------------------------------------
  const awswaf = byId('awswaf');
  await protection(awswaf, [
    toolsAction(awswaf),
    cookiesAction(awswaf, { title: 'AWS WAF Cookies', found: '1/1', names: ['aws-waf-token'] }),
    scriptsAction(awswaf, 'awswafAnalyzeScripts', { title: n => `AWS WAF Scripts (${n})`, labels: { challenge: 'Challenge', captcha: 'Captcha', jsapi: 'jsapi.js' } }),
    scrapflyAction(awswaf)
  ]);

  // ---- Cloudflare ---------------------------------------------------------------------------------------------------------------
  const cloudflare = byId('cloudflare');
  await protection(cloudflare, [
    toolsAction(cloudflare),
    cookiesAction(cloudflare, { title: 'Cloudflare Cookies', found: '2/5', names: ['__cf_bm', 'cf_clearance'] }),
    ['Analyze Scripts of a page that already loaded them lists them and deletes no cookie', async t => {
      const before = await t.count('cloudflare');
      await t.click('cloudflareAnalyzeScripts');
      const modal = await t.modal();
      assert.equal(modal.title, 'Cloudflare Scripts (2)');
      for (const [type, url] of cloudflare.analyze) assert.ok(modal.rows.some(row => row.type === type && row.url === (url.startsWith('/') ? `${t.origin}${url}` : url)), `${type} among ${JSON.stringify(modal.rows)}`);
      await footer(t.popup, 'Export Code');
      await codeDialog(t.popup);
      await t.closeModal();
      await t.saved('cloudflare', before);
      const cookies = await W(async u => (await chrome.cookies.getAll({ url: u })).map(cookie => cookie.name), t.url);
      assert.ok(cookies.includes('cf_clearance'), `cf_clearance still there: ${cookies.join(', ')}`);
    }],
    scrapflyAction(cloudflare)
  ]);
  // The reload path: nothing to list on the first load, so the cookie that clears the challenge is deleted and the page reloaded
  await protection(cloudflare, [
    ['Analyze Scripts of a page with nothing loaded yet deletes cf_clearance, reloads, and lists what the reload loaded', async t => {
      const key = new URL(t.url).pathname + new URL(t.url).search;
      assert.equal(loads[key], 1, 'one load so far');
      await t.click('cloudflareAnalyzeScripts');
      const modal = await t.modal(60000);
      assert.equal(modal.title, 'Cloudflare Scripts (2)');
      assert.ok(loads[key] >= 2, 'the page was reloaded');
      assert.ok(!/cf_clearance=/.test(cookiesSeen[key]), `the reload went without cf_clearance: ${cookiesSeen[key].slice(0, 80)}`);
      await t.closeModal();
    }]
  ], { variant: 'cloudflare-late' });

  // ---- DataDome -----------------------------------------------------------------------------------------------------------------
  const datadome = byId('datadome');
  await protection(datadome, [
    toolsAction(datadome),
    cookiesAction(datadome, { title: 'DataDome Cookies', found: '1/1', names: ['datadome'] }),
    scriptsAction(datadome, 'datadomeAnalyzeScripts', { title: n => `DataDome Scripts (${n})`, labels: { tags: 'tags.js', collector: 'Collector' } }),
    scrapflyAction(datadome)
  ]);
  await protection(datadome, [
    ['Analyze Scripts of a page with nothing loaded yet reloads it and lists what the reload loaded', async t => {
      const key = new URL(t.url).pathname + new URL(t.url).search;
      await t.click('datadomeAnalyzeScripts');
      const modal = await t.modal(60000);
      assert.equal(modal.title, 'DataDome Scripts (2)');
      assert.ok(loads[key] >= 2, 'the page was reloaded');
      await t.closeModal();
    }]
  ], { variant: 'datadome-late' });

  // ---- FunCaptcha ---------------------------------------------------------------------------------------------------------------
  const funcaptcha = byId('funcaptcha');
  await protection(funcaptcha, [
    toolsAction(funcaptcha),
    siteKeyAction(funcaptcha, 'funcaptchaExtractSiteKey', { title: 'FunCaptcha site key', key: ARKOSE_KEY }),
    scriptsAction(funcaptcha, 'funcaptchaAnalyzeScripts', { title: n => `FunCaptcha Scripts (${n})`, labels: { api: 'api.js' } }),
    ['Start Capturing, the reload that posts the session, and the capture lands in Advanced → History', async t => {
      const saved = await captureFlow(t, funcaptcha);
      const data = saved.captureData || saved.data;
      assert.equal(data.publicKey, ARKOSE_KEY, JSON.stringify(data).slice(0, 240));
      assert.equal(data.isBlobRequired, true);
      assert.equal(data.blob, 'BLOB-e2e-0123456789');
    }],
    capturedDataAction(funcaptcha),
    stopAction(funcaptcha),
    scrapflyAction(funcaptcha)
  ]);

  // ---- GeeTest ------------------------------------------------------------------------------------------------------------------
  const geetest = byId('geetest');
  await protection(geetest, [
    toolsAction(geetest),
    ['Check Version reloads the page and says which version it found', async t => {
      await t.click('geetestVersion');
      await until(async () => (await toasts(t.popup)).find(text => /Detected: Geetest V4/.test(text)), 60000, 'the version notification');
    }],
    ['Analyze Scripts lists what GeeTest left in the page, with Export Parsing Code', async t => {
      const before = await t.count('geetest');
      await t.click('geetestAnalyze');
      const modal = await t.modal();
      assert.match(modal.title, /^Geetest Scripts \(\d+\)$/);
      assert.ok(modal.copies.includes(GEETEST_ID) || modal.text.includes(GEETEST_ID), `the captchaId among ${modal.text.slice(0, 200)}`);
      await footer(t.popup, 'Export Parsing Code');
      const dialog = await codeDialog(t.popup, { mustContain: ['initGeetest4'], minLanguages: 1 });
      assert.equal(dialog.title, 'Export Parsing Code');
      await t.closeModal();
      await t.saved('geetest', before);
    }],
    scrapflyAction(geetest)
  ]);

  // ---- hCaptcha -----------------------------------------------------------------------------------------------------------------
  const hcaptcha = byId('hcaptcha');
  await protection(hcaptcha, [
    toolsAction(hcaptcha),
    siteKeyAction(hcaptcha, 'hcaptchaExtractSiteKey', { title: 'hCaptcha site key', key: HCAPTCHA_KEY }),
    scriptsAction(hcaptcha, 'hcaptchaAnalyzeScripts', { title: n => `hCaptcha Scripts (${n})`, labels: { api: 'api.js', config: 'checksiteconfig' } }),
    ['Check Version reloads the page and shows the version, the site key and the page the widget asked about', async t => {
      const before = await t.count('hcaptcha');
      await t.click('hcaptchaCheckVersion');
      const modal = await t.modal(60000);
      assert.equal(modal.title, 'hCaptcha Version');
      assert.ok(modal.copies.includes('05219f0822161da4c4a6f3aed6bf6d6fae1ba8e1'), `the version among ${modal.copies.join(', ')}`);
      assert.ok(modal.copies.includes(HCAPTCHA_KEY), 'the site key');
      assert.match(modal.text, /Enterprise Mode\s+No/);
      await t.closeModal();
      await t.saved('hcaptcha', before);
    }],
    ['Start Capturing, the reload, and the capture (version, site key, website) lands in Advanced → History', async t => {
      const saved = await captureFlow(t, hcaptcha);
      const data = saved.captureData || saved.data;
      assert.equal(data.websiteKey, HCAPTCHA_KEY, JSON.stringify(data).slice(0, 240));
      assert.equal(data.version, '05219f0822161da4c4a6f3aed6bf6d6fae1ba8e1');
      assert.equal(data.isEnterprise, false);
    }],
    capturedDataAction(hcaptcha),
    stopAction(hcaptcha),
    scrapflyAction(hcaptcha)
  ]);
  skip('hcaptcha › Enterprise mode from the checksiteconfig answer (Check Version, Start Capturing)',
    'needs hCaptcha\'s own checksiteconfig response (its custom_theme feature); offline the worker\'s request to it fails, and the capture finishes on the address alone');

  // ---- Imperva ------------------------------------------------------------------------------------------------------------------
  const imperva = byId('imperva');
  await protection(imperva, [
    toolsAction(imperva),
    cookiesAction(imperva, { title: 'Imperva Cookies', found: '5/5', names: ['reese84', '___utmvc', 'incap_ses_315_2405640', 'nlbi_2405640', 'visid_incap_2405640'], facts: ['Protection Level'] }),
    ['Analyze Scripts reads the Reese84 and UTMVC scripts the page loaded, with Export Code', async t => {
      const before = await t.count('imperva');
      await t.click('impervaAnalyzeScripts');
      const modal = await t.modal();
      assert.equal(modal.title, 'Imperva Analysis');
      assert.ok(modal.copies.includes(`${t.origin}/Thine-Wert/987`), `the Reese84 script among ${modal.copies.join(', ')}`);
      assert.ok(modal.copies.includes(`${t.origin}/_Incapsula_Resource?SWKMTFSR=1&e=0.1234`), 'the UTMVC script');
      assert.ok(modal.copies.includes(`${t.origin}/Thine-Wert/987?d=127.0.0.1`), 'the sensor URL (?d=<host>)');
      await footer(t.popup, 'Export Code');
      const dialog = await codeDialog(t.popup);
      assert.equal(dialog.title, 'Script Parsing Code Generator');
      assert.ok(dialog.types.includes('All Types'), dialog.types.join(', '));
      await t.closeModal();
      await t.saved('imperva', before);
    }],
    ['Start Capturing, the reload, and the capture (cookies the page set) lands in Advanced → History', async t => {
      const saved = await captureFlow(t, imperva);
      const data = saved.captureData || saved.data;
      assert.equal(data.requiresReese84, true, JSON.stringify(data).slice(0, 240));
      assert.equal(data.requiresUtmvc, true);
      assert.deepEqual(data.incapSesCookies, ['incap_ses_315_2405640']);
    }],
    capturedDataAction(imperva),
    stopAction(imperva),
    scrapflyAction(imperva)
  ]);
  skip('imperva › Analyze Scripts after a reload (extraction of the challenge payloads)', 'covered by scripts/e2e-v313-advanced.js (real webRequest bodies of Reese84\'s sensor); the loaded-page path above is the popup\'s first answer');

  // ---- reCAPTCHA ----------------------------------------------------------------------------------------------------------------
  const recaptcha = byId('recaptcha');
  await protection(recaptcha, [
    toolsAction(recaptcha),
    ['Obtain selector clicks the widget on the page and shows how', async t => {
      await t.click('recaptchaClick');
      const modal = await t.modal();
      assert.equal(modal.title, 'Selector Detection');
      assert.ok(modal.copies.includes('.g-recaptcha') && modal.copies.includes('direct-click'), `method and selector among ${modal.copies.join(', ')}`);
      assert.equal(await t.page.evaluate(() => window.__rcClicks), 1, 'the widget on the page was clicked once');
      await t.closeModal();
    }],
    siteKeyAction(recaptcha, 'recaptchaExtract', { title: 'reCAPTCHA site key', key: RECAPTCHA_KEY }),
    ['reCAPTCHA callback lists the callback the widget names', async t => {
      const before = await t.count('recaptcha');
      await t.click('recaptchaCallback');
      const modal = await t.modal();
      assert.equal(modal.title, 'reCAPTCHA Callbacks');
      assert.ok(modal.copies.includes('onSolved'), `the callback among ${modal.copies.join(', ')}`);
      await t.closeModal();
      await t.saved('recaptcha', before);
    }],
    ['Start Capturing, the reload that makes the anchor and reload requests, and the capture lands in Advanced → History', async t => {
      const saved = await captureFlow(t, recaptcha);
      const data = saved.captureData || saved.data;
      assert.equal(data.siteKey, RECAPTCHA_KEY, JSON.stringify(data).slice(0, 240));
      assert.match(String(data.version), /v2/);
    }],
    capturedDataAction(recaptcha),
    stopAction(recaptcha),
    scrapflyAction(recaptcha)
  ]);
  skip('recaptcha › Start Capturing with a solved challenge (v3 score, session cookie, Enterprise flags)', 'needs Google\'s real anchor and reload traffic: the capture decodes their protobuf; offline only a hand-built request is available');

  // ---- Shape Security -----------------------------------------------------------------------------------------------------------
  const shapeSecurity = byId('shapesecurity');
  await protection(shapeSecurity, [
    toolsAction(shapeSecurity),
    ['Check Version finds the v1 runtime global', async t => {
      await t.click('shapesecurityCheckVersion');
      const modal = await t.modal();
      assert.equal(modal.title, 'Shape Security Version');
      assert.match(modal.text, /V1/);
      assert.match(modal.text, /Cookie/);
      await t.closeModal();
    }],
    cookiesAction(shapeSecurity, { title: 'Shape Security Cookies', found: '1/1', names: ['AbCd1234'] }),
    ['Analyze Scripts lists Shape\'s loaders of the loaded page, with Export Code', async t => {
      const before = await t.count('shapesecurity');
      await t.click('shapesecurityAnalyzeScripts');
      const modal = await t.modal();
      assert.equal(modal.title, 'Shape Security Analysis');
      assert.ok(modal.copies.includes(`${t.origin}/ssx/ssx.mod.js?seed=${SHAPE_SEED}`), `the seed script among ${modal.copies.join(', ')}`);
      assert.match(modal.text, /Seed Scripts\s+1/);
      assert.match(modal.text, /Init\.js Scripts\s+1/);
      await footer(t.popup, 'Export Code');
      const dialog = await codeDialog(t.popup);
      assert.equal(dialog.title, 'Script Parsing Code Generator');
      await t.closeModal();
      await t.saved('shapesecurity', before);
    }],
    ['Start Capturing, the reload, and the cookie (v1: no headers needed) lands in Advanced → History', async t => {
      const saved = await captureFlow(t, shapeSecurity);
      const data = saved.captureData || saved.data;
      assert.equal(data.cookie && data.cookie.name, 'AbCd1234', JSON.stringify(data).slice(0, 240));
      assert.equal(data.version, 'v1');
    }],
    capturedDataAction(shapeSecurity),
    stopAction(shapeSecurity),
    scrapflyAction(shapeSecurity)
  ]);
  await protection(shapeSecurity, [
    ['v2: Check Version finds Shape\'s loader without the runtime global', async t => {
      await t.click('shapesecurityCheckVersion');
      const modal = await t.modal();
      assert.equal(modal.title, 'Shape Security Version');
      assert.match(modal.text, /V2/);
      assert.match(modal.text, /Cookie \+ Headers/);
      await t.closeModal();
    }],
    ['v2: Start Capturing needs the cookie and the signed request, and saves both', async t => {
      const saved = await captureFlow(t, shapeSecurity);
      const data = saved.captureData || saved.data;
      assert.equal(data.version, 'v2', JSON.stringify(data).slice(0, 240));
      assert.equal(data.cookie && data.cookie.name, 'AbCd1234');
      assert.equal((data.headers || []).length, 6, `headers: ${JSON.stringify(data.headers || []).slice(0, 200)}`);
    }]
  ], { variant: 'shapesecurity-v2' });

  // ---- Turnstile ----------------------------------------------------------------------------------------------------------------
  const turnstile = byId('turnstile');
  await protection(turnstile, [
    toolsAction(turnstile),
    ['Extract Site Key shows the key of the widget and saves the result', async t => {
      const before = await t.count('turnstile');
      await t.click('turnstileExtractSiteKey');
      const modal = await t.modal();
      assert.equal(modal.title, 'Turnstile site keys');
      assert.ok(modal.copies.includes(TURNSTILE_KEY), `${TURNSTILE_KEY} among ${modal.copies.join(', ')}`);
      await t.closeModal();
      await t.saved('turnstile', before);
    }],
    scriptsAction(turnstile, 'turnstileAnalyzeScripts', { title: n => `Turnstile Scripts (${n})`, labels: { api: 'api.js' } }),
    scrapflyAction(turnstile)
  ]);

  // =================================================================================================================================
  // Part C: the Advanced tab itself
  // =================================================================================================================================
  /** Development aid (E2E_SEED_HISTORY=1): a few saved results when this part runs alone. The official run uses the real ones. */
  async function seedHistory(popup) {
    await popup.evaluate(async () => {
      for (const [id, tool] of [['akamai', 'akamaiCheckCookies'], ['hcaptcha', 'hcaptchaExtractSiteKey'], ['recaptcha', 'recaptchaExtract'], ['prosopo', 'prosopoAnalyzeScripts'], ['shapesecurity', 'shapesecurityCheckCookies']]) {
        for (let i = 0; i < 3; i++) await AdvancedHistoryStore.appendCapture(id, { id: `seed-${id}-${i}`, timestamp: Date.now() - i, url: 'http://127.0.0.1/p/seed', hostname: '127.0.0.1',
          data: { schemaVersion: 1, tool, vendorId: id, label: tool, result: { kind: 'seed' } } }, { expiryMinutes: 30 });
      }
    });
  }
  async function openPage(variant) {
    await ctx.clearCookies();
    const url = `${origin}/p/${variant}?run=${++runs}`;
    const page = await open(url);
    const tab = await until(() => tabOf(url), 15000, `the tab of ${url}`);
    return { page, tab, url };
  }
  const advancedTab = async (popup) => { await popup.$eval('.tab-btn[data-tab="advanced"]', el => el.click()); };
  if (wanted('Advanced tab')) {
    // Several protections on one page
    {
      const started = Date.now();
      let page; let popup;
      try {
        const opened = await openPage('multi');
        page = opened.page;
        const tab = opened.tab;
        for (const detectorId of ['detect-akamai', 'detect-datadome', 'detect-recaptcha']) await awaitDetected(tab, detectorId);
        popup = await popupFor(tab);
        await advancedTab(popup);
        await wait(popup, () => document.querySelectorAll('.advanced-launch-card').length >= 3, null, 30000);
        await action('Advanced tab › a page with three protections lists three cards and opens none', async () => {
          const ids = await popup.$$eval('.advanced-launch-card', cards => cards.map(card => card.dataset.detectorId));
          assert.deepEqual(sorted(ids), ['detect-akamai', 'detect-datadome', 'detect-recaptcha']);
          assert.equal(await popup.$('#detectionToolsPanel .advanced-tool-card'), null, 'no tools opened on their own');
        });
        await action('Advanced tab › the information window lists the supported protections by group, and closes with its button and with Escape', async () => {
          await popup.$eval('#showAdvancedHelp', el => el.click());
          await wait(popup, () => getComputedStyle(document.querySelector('#advancedInfoModal')).display === 'flex', null, 8000);
          const info = await popup.evaluate(() => ({
            titles: [...document.querySelectorAll('#advancedInfoModal .advanced-info-item-title')].map(node => node.textContent.trim()),
            counts: [...document.querySelectorAll('#advancedInfoModal .advanced-info-group-count')].map(node => Number(node.textContent)),
            vendors: AdvancedCaptchaVendors.list.map(vendor => vendor.productName) }));
          for (const name of info.vendors) assert.ok(info.titles.includes(name), `${name} among the supported systems`);
          assert.equal(info.counts.reduce((sum, n) => sum + n, 0), info.titles.length, `group counts ${info.counts.join('+')} against ${info.titles.length} items`);
          await popup.$eval('#closeAdvancedInfoModal', el => el.click());
          await wait(popup, () => getComputedStyle(document.querySelector('#advancedInfoModal')).display === 'none', null, 8000);
          await popup.$eval('#showAdvancedHelp', el => el.click());
          await wait(popup, () => getComputedStyle(document.querySelector('#advancedInfoModal')).display === 'flex', null, 8000);
          await popup.keyboard.press('Escape');
          await wait(popup, () => getComputedStyle(document.querySelector('#advancedInfoModal')).display === 'none', null, 8000);
        });
        await action('Advanced tab › choosing a protection opens its tools; Change goes back; another protection opens', async () => {
          await popup.$eval('.advanced-launch-card[data-detector-id="detect-akamai"]', el => el.click());
          await wait(popup, () => !!document.querySelector('#akamaiCheckCookies'), null, 15000);
          assert.equal(await popup.$eval('#compactDetectionName', el => el.textContent.trim()), 'Akamai Bot Manager');
          await popup.$eval('#changeDetectionBtn', el => el.click());
          await wait(popup, () => !document.querySelector('#detectionToolsPanel .advanced-tool-card'), null, 8000);
          await popup.$eval('.advanced-launch-card[data-detector-id="detect-datadome"]', el => el.click());
          await wait(popup, () => !!document.querySelector('#datadomeCheckCookies'), null, 15000);
          assert.equal(await popup.$eval('#compactDetectionName', el => el.textContent.trim()), 'DataDome');
          await popup.$eval('#datadomeCheckCookies', el => el.click());
          const modal = await modalOpen(popup);
          assert.equal(modal.title, 'DataDome Cookies');
          await closeModal(popup);
          await popup.$eval('#changeDetectionBtn', el => el.click());
          await wait(popup, () => !document.querySelector('#detectionToolsPanel .advanced-tool-card'), null, 8000);
          await popup.$eval('.advanced-launch-card[data-detector-id="detect-recaptcha"]', el => el.click());
          await wait(popup, () => !!document.querySelector('#recaptchaExtract'), null, 15000);
        });
      } catch (error) {
        record('fail', 'Advanced tab › a page with several protections', started, String((error && error.stack) || error).split('\n').slice(0, 7).join('\n'));
      }
      if (popup) await popup.close().catch(() => {});
      if (page) await page.close().catch(() => {});
    }
    // No protection, and a protection below the minimum
    for (const [variant, label, check] of [
      ['plain', 'a page with no protection says so and lists the supported protections', async popup => {
        await wait(popup, () => !!document.querySelector('#advancedNoTools'), null, 30000);
        assert.equal(await popup.$eval('#advancedNoTools .state-card-title', el => el.textContent.trim()), 'No protection detected');
        const shown = await popup.evaluate(() => ({ logos: document.querySelectorAll('.advanced-supported-logo').length,
          counts: [...document.querySelectorAll('.advanced-supported-count')].map(node => Number(node.textContent)),
          expected: Advanced.supportedProtectionGroups().reduce((sum, group) => sum + group.items.length, 0) }));
        assert.equal(shown.logos, shown.expected, `logos for every supported protection: ${JSON.stringify(shown)}`);
        assert.equal(shown.counts.reduce((sum, n) => sum + n, 0), shown.expected);
        // Not only the list agreeing with itself: every CAPTCHA described as data is on it, and so are the tools with a module of their own
        const names = await popup.$$eval('.advanced-supported-logo', items => items.map(item => item.getAttribute('title')));
        const vendors = await popup.evaluate(() => AdvancedCaptchaVendors.list.map(vendor => vendor.productName));
        for (const name of vendors) assert.ok(names.includes(name), `${name} among the supported protections shown: ${names.join(', ')}`);
        assert.ok(names.length >= 27, `the 11 tools with their own module and the 16 described as data: ${names.length}`);
        assert.equal(await popup.$eval('#advancedNoTools .state-card-description', el => el.textContent.trim()),
          'No supported protection on this page is above 50% confidence. You can change this minimum in Settings → Detection.');
      }],
      ['weak', 'a page that only names a vendor says it was detected with low confidence', async popup => {
        await wait(popup, () => !!document.querySelector('#advancedNoTools'), null, 30000);
        assert.equal(await popup.$eval('#advancedNoTools .state-card-title', el => el.textContent.trim()), 'Protection detected with low confidence');
        assert.match(await popup.$eval('#advancedNoTools .state-card-description', el => el.textContent.trim()), /^reCAPTCHA was detected with \d+% confidence\. Tools appear only above 50%/);
      }]
    ]) {
      const name = `Advanced tab › ${label}`;
      if (!wanted(name)) continue;
      const started = Date.now();
      let page; let popup;
      try {
        const opened = await openPage(variant);
        page = opened.page;
        const tab = opened.tab;
        await sleep(variant === 'weak' ? 6000 : 3000); // the scan of a page with nothing above the minimum has no result to wait for
        popup = await popupFor(tab);
        await advancedTab(popup);
        await action(name, () => check(popup));
      } catch (error) {
        record('fail', name, started, String((error && error.stack) || error).split('\n').slice(0, 7).join('\n'));
      }
      if (popup) await popup.close().catch(() => {});
      if (page) await page.close().catch(() => {});
    }
    // Advanced → History, with what the sessions above saved
    {
      const started = Date.now();
      let page; let popup;
      try {
        const opened = await openPage('plain');
        page = opened.page;
        const tab = opened.tab;
        popup = await popupFor(tab);
        if (process.env.E2E_SEED_HISTORY) await seedHistory(popup);
        await advancedTab(popup);
        // The page has no protection: the Tools / History switch is hidden, and the empty state offers one link to the saved captures
        await wait(popup, () => !!document.querySelector('#advancedNoTools') && !!document.querySelector('#advancedCaptureTab'), null, 30000);
        await action('Advanced tab › the empty state links to the saved captures and says how many there are', async () => {
          await wait(popup, () => { const link = document.querySelector('#advancedNoToolsHistoryBtn'); return !!link && !link.hidden && link.textContent.trim() !== ''; }, null, 15000);
          const shown = await popup.evaluate(async () => ({ text: document.querySelector('#advancedNoToolsHistoryBtn').textContent.trim(),
            total: Object.values(await AdvancedHistoryStore.load()).reduce((sum, list) => sum + list.filter(item => item && item.id && item.timestamp).length, 0) }));
          assert.ok(shown.total >= 10, `captures saved by the sessions above: ${shown.total}`);
          assert.equal(shown.text, `View capture history (${shown.total})`);
          await popup.$eval('#advancedNoToolsHistoryBtn', el => el.click());
          await wait(popup, () => document.querySelector('#capturesPanel').classList.contains('active'), null, 10000);
        });
        // Whether or not the link worked, the scenarios below need the History view
        if (!(await popup.$eval('#capturesPanel', el => el.classList.contains('active')))) await popup.$eval('#advancedCaptureTab', el => el.click());
        await wait(popup, () => document.querySelectorAll('#captureGrid .capture-card').length > 0 || !!document.querySelector('#captureEmptyState[style*="flex"]'), null, 20000);
        // The History tab shows the whole machine's captures when the current site has none: all fixtures are 127.0.0.1
        await action('Advanced tab › History lists the captures by vendor, with a vendor chip for each', async () => {
          const view = await popup.evaluate(() => ({
            cards: [...document.querySelectorAll('#captureGrid .capture-card')].map(card => card.getAttribute('data-module-id')),
            chips: [...document.querySelectorAll('#captureChips .cap-chip[data-filter-group="module"]')].map(chip => chip.dataset.filterValue),
            badge: document.querySelector('#captureCountBadge').textContent.trim() }));
          assert.ok(view.cards.length >= 10, `captures listed: ${view.cards.length}`);
          const vendors = new Set(view.cards);
          for (const id of ['akamai', 'hcaptcha', 'recaptcha', 'prosopo', 'shapesecurity']) assert.ok(vendors.has(id), `${id} among ${[...vendors].join(', ')}`);
          assert.ok(view.chips.length >= 5, `vendor chips: ${view.chips.join(', ')}`);
          assert.ok(Number(view.badge) > 0, `the History badge: "${view.badge}"`);
        });
        await action('Advanced tab › a vendor chip narrows the list to that vendor, pressed again shows everything', async () => {
          const all = await popup.$$eval('#captureGrid .capture-card', cards => cards.length);
          await popup.$eval('#captureChips .cap-chip[data-filter-group="module"][data-filter-value="akamai"]', el => el.click());
          await wait(popup, () => [...document.querySelectorAll('#captureGrid .capture-card')].every(card => card.getAttribute('data-module-id') === 'akamai'), null, 8000);
          assert.ok((await popup.$$eval('#captureGrid .capture-card', cards => cards.length)) < all, 'narrower');
          await popup.$eval('#captureChips .cap-chip[data-filter-group="module"][data-filter-value="akamai"]', el => el.click());
          await wait(popup, expected => document.querySelectorAll('#captureGrid .capture-card').length === expected, all, 8000);
        });
        await action('Advanced tab › a tool chip narrows the list to that kind of result, pressed again shows everything', async () => {
          const all = await popup.$$eval('#captureGrid .capture-card', cards => cards.length);
          const kinds = await popup.$$eval('#captureChips .cap-chip[data-filter-group="tool"]', chips => chips.map(chip => chip.dataset.filterValue));
          assert.ok(kinds.length >= 3, `kinds of result among the captures: ${kinds.join(', ')}`);
          const chip = `#captureChips .cap-chip[data-filter-group="tool"][data-filter-value="${kinds[0]}"]`;
          await popup.$eval(chip, el => el.click());
          await wait(popup, expected => { const shown = document.querySelectorAll('#captureGrid .capture-card').length; return shown > 0 && shown < expected; }, all, 8000);
          await popup.$eval(chip, el => el.click());
          await wait(popup, expected => document.querySelectorAll('#captureGrid .capture-card').length === expected, all, 8000);
        });
        await action('Advanced tab › search finds a vendor\'s captures', async () => {
          const all = await popup.$$eval('#captureGrid .capture-card', cards => cards.length);
          await popup.fill('#captureSearchInput', 'shape');
          await wait(popup, expected => { const cards = [...document.querySelectorAll('#captureGrid .capture-card')];
            return cards.length > 0 && cards.length < expected && cards.every(card => /shape/i.test(card.getAttribute('data-module-id') + card.textContent)); }, all, 8000);
          await popup.fill('#captureSearchInput', '');
          await wait(popup, expected => document.querySelectorAll('#captureGrid .capture-card').length === expected, all, 8000);
        });
        await action('Advanced tab › every kind of saved result opens its details window (each vendor, each tool)', async () => {
          const pairs = await popup.$$eval('#captureGrid .capture-card', cards => {
            const seen = new Map();
            for (const card of cards) {
              const key = `${card.getAttribute('data-module-id')} › ${card.querySelector('.cap-row-tool').textContent.trim()}`;
              if (!seen.has(key)) seen.set(key, card.getAttribute('data-capture-id'));
            }
            return [...seen].map(([key, id]) => ({ key, id }));
          });
          // The sessions above save one kind of result per tool (about 50); seeded history (a development aid) holds five
          assert.ok(pairs.length >= (process.env.E2E_SEED_HISTORY ? 5 : 20), `vendor and tool kinds listed: ${pairs.length}`);
          for (const { key, id } of pairs) {
            await popup.evaluate(captureId => document.querySelector(`#captureGrid .capture-card[data-capture-id="${captureId}"]`).click(), id);
            const modal = await modalOpen(popup, 10000).catch(error => { throw new Error(`${key}: ${error.message}`); });
            assert.ok(modal.title && modal.text.trim().length > 10, `${key}: a details window with something in it ("${modal.title}")`);
            await closeModal(popup);
          }
        });
        await action('Advanced tab › a capture opens its details, and its Copy puts its data on the clipboard', async () => {
          await popup.$eval('#captureGrid .capture-card[data-module-id="akamai"]', el => el.click());
          const modal = await modalOpen(popup);
          assert.ok(modal.text.length > 20, `details: ${modal.text.slice(0, 80)}`);
          await closeModal(popup);
          await popup.evaluate(() => { window.__copied = []; document.querySelector('#captureGrid .capture-card[data-module-id="akamai"] [data-action="copy"]').click(); });
          await until(() => popup.evaluate(() => window.__copied.length), 8000, 'Copy on a capture card');
          assert.equal(JSON.parse((await popup.evaluate(() => window.__copied))[0]).type, 'akamai');
        });
        await action('Advanced tab › deleting a capture removes its card and the entry', async () => {
          const before = await popup.$$eval('#captureGrid .capture-card', cards => cards.length);
          await popup.$eval('#captureGrid .capture-card[data-module-id="akamai"] [data-action="delete"]', el => el.click());
          await wait(popup, expected => document.querySelectorAll('#captureGrid .capture-card').length === expected, before - 1, 10000);
        });
        await action('Advanced tab › Export captures downloads the listed captures as JSON', async () => {
          const listed = await popup.$$eval('#captureGrid .capture-card', cards => cards.length);
          await popup.$eval('#captureMenuBtn', el => el.click());
          const [download] = await Promise.all([popup.waitForEvent('download', { timeout: 15000 }), popup.$eval('#exportCapturesBtn', el => el.click())]);
          assert.match(download.suggestedFilename(), /^scrapfly-captures-\d+\.json$/);
          const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
          assert.equal(exported.count, listed);
          assert.equal(exported.captures.length, listed);
          assert.ok(exported.captures.every(capture => capture.moduleId && capture.id));
        });
        await action('Advanced tab › Clear all captures asks first, empties the list and shows the empty state', async () => {
          await popup.$eval('#captureMenuBtn', el => el.click());
          await popup.$eval('#clearAllCapturesBtn', el => el.click());
          await wait(popup, () => !!document.querySelector('.notification-confirm[data-open="true"] .notification-btn-confirm'), null, 8000);
          // Cancel first: nothing is lost
          await popup.$eval('.notification-confirm[data-open="true"] .notification-btn-cancel', el => el.click());
          await wait(popup, () => !document.querySelector('.notification-confirm[data-open="true"]'), null, 8000);
          assert.ok((await popup.$$eval('#captureGrid .capture-card', cards => cards.length)) > 0, 'Cancel keeps the captures');
          await popup.$eval('#captureMenuBtn', el => el.click());
          await popup.$eval('#clearAllCapturesBtn', el => el.click());
          await wait(popup, () => !!document.querySelector('.notification-confirm[data-open="true"] .notification-btn-confirm'), null, 8000);
          await popup.$eval('.notification-confirm[data-open="true"] .notification-btn-confirm', el => el.click());
          await wait(popup, () => getComputedStyle(document.querySelector('#captureEmptyState')).display !== 'none', null, 10000);
          assert.equal(await popup.evaluate(async () => Object.values(await AdvancedHistoryStore.load()).reduce((sum, list) => sum + list.length, 0)), 0);
        });
      } catch (error) {
        record('fail', 'Advanced tab › Advanced → History', started, String((error && error.stack) || error).split('\n').slice(0, 7).join('\n'));
      }
      if (popup) await popup.close().catch(() => {});
      if (page) await page.close().catch(() => {});
    }
  }

  // ---- Report -------------------------------------------------------------------------------------------------------------------
  const count = status => results.filter(result => result.status === status).length;
  console.log(`\n${count('pass')} passed, ${count('fail')} failed, ${count('skip')} not testable offline`);
  if (problems.length) console.log(`Extension page problems seen:\n  ${[...new Set(problems)].join('\n  ')}`);
  console.log(count('fail') ? `RESULT ${count('fail')} FAILED (${count('pass')} passed, ${count('skip')} not testable offline)`
    : `RESULT ALL PASS (${count('pass')} scenarios, ${count('skip')} not testable offline)`);
  await ctx.close();
  server.close();
  process.exit(count('fail') ? 1 : 0);
}

module.exports = { BESPOKE, GENERIC, ALL, VARIANTS, SPECS, byId, renderPage, stubsOf, merge, pageSignals, requestsScript };
if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });
