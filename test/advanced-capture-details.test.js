const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const FormatUtils = require('../utils/format-utils');

// Advanced → History → capture details: every vendor uses the shared kit rows
// (facts + copyable fields), escapes page values, and no longer uses the old
// green code blocks.

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const vendors = [
  ['akamai', 'AkamaiAdvanced'], ['awswaf', 'AwsWafAdvanced'], ['cloudflare', 'CloudflareAdvanced'],
  ['funcaptcha', 'FunCaptchaAdvanced'], ['hcaptcha', 'HCaptchaAdvanced'], ['imperva', 'ImpervaAdvanced'],
  ['recaptcha', 'ReCaptchaAdvanced'], ['shapesecurity', 'ShapeSecurityAdvanced']
];

function load() {
  const messages = JSON.parse(read('_locales/en/messages.json'));
  const context = { window: {}, document: { querySelector: () => null }, console, URL,
    Logger: { ui() {}, debug() {}, network() {}, error() {} }, FormatUtils,
    AdvancedUtils: { escapeHtml: FormatUtils.escapeHtml },
    I18n: { get: key => messages[key]?.message || '', locale: () => 'en',
      format: (key, ...args) => args.reduce((text, arg, i) => text.replaceAll('{' + i + '}', String(arg)), messages[key]?.message || ''),
      tr: (key, fallback) => messages[key]?.message || fallback },
    NotificationHelper: { error() {} }, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(read('sections/advanced/base-advanced-module.js'), context);
  for (const component of ['components/tool-grid', 'components/dialogs', 'components/cookie-results', 'history/module-history']) {
    vm.runInContext(read(`sections/advanced/${component}.js`), context);
  }
  for (const [folder] of vendors) for (const part of ['module', 'view']) vm.runInContext(read(`sections/advanced/vendors/${folder}/${part}.js`), context);
  vm.runInContext(read('sections/advanced/vendors/akamai/lifecycle.js'), context);
  context.window.ImpervaAdvanced.prototype.setupExtractionListener = () => {};
  return context;
}

const evil = 'x"><img src=x onerror=alert(1)>';
const captureData = {
  akamai: { akamaiVersion: evil, abckCookie: true, abckCookieLevel: 'easy' },
  awswaf: { websiteURL: `https://shop.example/${evil}` },
  cloudflare: { type: 'Turnstile', sitekey: `0x4AAAA${evil}`, cdata: evil, cAction: evil, siteURL: evil },
  funcaptcha: { publicKey: evil, apiDomain: 'client-api.arkoselabs.com', websiteUrl: evil, userAgent: evil, bda: evil, isBlobRequired: true, blob: null },
  hcaptcha: { version: evil, websiteKey: evil, websiteURL: evil, isEnterprise: true },
  imperva: { requiresReese84: true, requiresUtmvc: false, incapSesCookies: [1, 2], interrogationUrls: [1] },
  recaptcha: { version: 'v2', siteKey: evil, action: evil, apiDomain: 'www.google.com', requiredCookie: evil, isEnterprise: true, siteUrl: evil },
  shapesecurity: { version: 'v2', headers: [{ name: 'X-DQ7Hy5L1-a' }, { name: 'X-DQ7Hy5L1-b' }], cookie: { name: evil } }
};

for (const [folder, className] of vendors) {
  test(`${folder}: capture details use kit rows and escape page values`, () => {
    const context = load();
    const module = new context.window[className]({}, { id: 1, url: 'https://shop.example/' });
    const html = module.renderCaptureDetailsContent({ timestamp: 1700000000000, url: `https://shop.example/${evil}`, captureData: captureData[folder] });
    assert.match(html, /adv-kit-(card|facts|section)/);
    assert.doesNotMatch(html, /advanced-modal-code-block|advanced-modal-info-row/);
    assert.doesNotMatch(html, /<img src=x/, 'page values are escaped');
    assert.doesNotMatch(html, /data-copy="x"/, 'quotes in copied values cannot end the attribute');
    assert.match(html, new RegExp(String(new Date(1700000000000).getFullYear())), 'shows when it was captured');
  });
}

test('no capture data shows a note instead of throwing', () => {
  const context = load();
  for (const [folder, className] of vendors.filter(([f]) => ['akamai', 'awswaf', 'imperva', 'recaptcha', 'shapesecurity'].includes(f))) {
    const module = new context.window[className]({}, { id: 1 });
    assert.match(module.renderCaptureDetailsContent({ timestamp: 1 }), /adv-kit-note/, folder);
  }
});
