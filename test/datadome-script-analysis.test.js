const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// DataDome → Analyze Scripts: which requests of the reloaded page it lists.

function load() {
  const started = [];
  const context = { self: {}, URL, Logger: { network() {} },
    AdvancedScriptAnalysis: { start: options => { started.push(options); return { status: 'started' }; } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../background/advanced/vendors/datadome/interceptor.js'), 'utf8'), context);
  return { context, started };
}

test('lists the tag, its collector, the challenge scripts and the CAPTCHA / interstitial pages', () => {
  const { context } = load();
  const classify = context.datadomeClassifyUrl;
  const cases = {
    'https://js.datadome.co/tags.js': 'tags',
    'https://www.shop.example/tags.js?id=1': 'tags',
    'https://api-js.datadome.co/js/': 'collector',
    'https://ct.captcha-delivery.com/c.js': 'captchaScript',
    'https://ct.captcha-delivery.com/i.js': 'interstitialScript',
    'https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAA&hash=ABC&cid=x&t=fe&referer=https%3A%2F%2Fshop.example%2F&s=1': 'captcha',
    'https://geo.captcha-delivery.com/captcha/check?cid=x': 'captchaCheck',
    'https://geo.captcha-delivery.com/interstitial/?initialCid=AHrl&hash=ABC': 'interstitial',
    'https://ct.captcha-delivery.com/other.js': 'challengeScript'
  };
  for (const [url, type] of Object.entries(cases)) assert.equal(classify(url), type, url);
  for (const url of ['https://ct.captcha-delivery.com/logo.png',
    'https://static.captcha-delivery.com/captcha/assets/set/26e5/logo.png?update_cache=1',
    'https://static.captcha-delivery.com/captcha/assets/tpl/6dc4/index.html',
    'https://static.captcha-delivery.com/common/fonts/roboto/font-face.css', 'https://www.shop.example/app.js',
    'https://evil.example/captcha-delivery.com/c.js', 'https://captcha-delivery.com.evil.example/c.js', 'not a url']) {
    assert.equal(classify(url), null, url);
  }
});

test('Analyze Scripts uses that classifier', () => {
  const { context, started } = load();
  context.datadomeStartAnalysis(7, 'https://shop.example/', 'r1');
  assert.equal(started[0].vendorId, 'datadome');
  assert.equal(started[0].classify, context.datadomeClassifyUrl);
});
