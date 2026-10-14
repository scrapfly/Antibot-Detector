const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Analyze Scripts → Export Code: every vendor offers it, and the shared
// script-URL generator writes code that runs outside the extension.

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function dialog() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(read('sections/advanced/components/code-generator-dialog.js'), context);
  return context.window.AdvancedCodeDialog;
}

test('every Analyze Scripts result offers Export Code', () => {
  // URL-only results use the shared window, whose footer opens the shared generator
  for (const vendor of ['awswaf', 'cloudflare', 'datadome', 'funcaptcha', 'hcaptcha', 'turnstile']) {
    const view = read(`sections/advanced/vendors/${vendor}/view.js`);
    assert.match(view, /this\.showScriptResults\(data, \{ vendor: '[^']+'/, vendor);
    assert.doesNotMatch(view, /modal-export-code-btn|displayExportCodeModal/, `${vendor}: no copy of the old window`);
  }
  assert.match(read('sections/advanced/components/script-results.js'), /AdvancedCodeDialog\.openScriptUrls\(this, name, scripts\)/);
  // Results with more than URLs keep their own generators
  for (const vendor of ['imperva', 'shapesecurity']) {
    assert.match(read(`sections/advanced/vendors/${vendor}/view.js`), /\('advCommonExportCode', 'Export Code'\)/, vendor);
  }
});

test('the script-URL code lists every URL, in all six languages, with quotes and $ kept literal', () => {
  const D = dialog();
  const urls = ["https://a.example/x.js?a='1'&b=$c", 'https://b.example/y.js'];
  assert.deepEqual([...D.SCRIPT_URL_LANGUAGES], ['JavaScript', 'Python', 'Node.js', 'PHP', 'C#', 'Go']);
  for (const language of D.SCRIPT_URL_LANGUAGES) {
    const code = D.scriptUrlsCode('FunCaptcha', urls, language);
    assert.ok(code.includes('https://b.example/y.js'), language);
    assert.doesNotMatch(code, /Logger\./, `${language}: no extension-internal helpers`);
  }
  assert.ok(D.scriptUrlsCode('FunCaptcha', urls, 'PHP').includes("'https://a.example/x.js?a=\\'1\\'&b=$c'"), 'PHP single quotes, $ not interpolated');
  assert.ok(D.scriptUrlsCode('FunCaptcha', urls, 'Go').includes('"https://a.example/x.js?a=\'1\'&b=$c",'));
  new Function(`return (async () => { ${D.scriptUrlsCode('FunCaptcha', urls, 'JavaScript')} })`);
  new Function(D.scriptUrlsCode('FunCaptcha', urls, 'Node.js').replace("const axios = require('axios');", ''));
  assert.throws(() => D.scriptUrlsCode('FunCaptcha', urls, 'Ruby'));
});

test('the shared Scripts window escapes URLs, labels types, notes an empty result and exports the URLs', () => {
  const FormatUtils = require('../utils/format-utils');
  const context = { window: {}, console, URL, FormatUtils, Logger: { ui() {}, debug() {}, network() {}, error() {} },
    I18n: { get: () => '', tr: (key, fallback) => fallback, format: () => '' }, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(read('sections/advanced/base-advanced-module.js'), context);
  for (const file of ['components/dialogs', 'components/code-generator-dialog', 'components/script-results']) {
    vm.runInContext(read(`sections/advanced/${file}.js`), context);
  }
  const exported = [];
  context.AdvancedCodeDialog = { openScriptUrls: (owner, name, scripts) => exported.push({ name, urls: scripts.map(s => s.url) }) };
  const module = new context.window.BaseAdvancedModule({}, { id: 1, url: 'https://shop.example/page' }, 'datadome');
  const opened = [];
  module.openKitModal = options => opened.push(options);
  module.recordStructuredResult = () => {};
  module.showScriptResults({ scripts: [
    { url: 'https://ct.captcha-delivery.com/c.js?a="><img src=x>', type: 'captchaScript', resourceType: 'script' },
    { url: 'https://geo.captcha-delivery.com/captcha/', type: 'captcha', resourceType: 'sub_frame' }
  ] }, { vendor: 'DataDome', label: type => ({ captchaScript: 'c.js' })[type] });
  const [result] = opened;
  assert.equal(result.title, 'DataDome Scripts (2)');
  assert.equal(result.subtitle, 'shop.example');
  assert.doesNotMatch(result.body, /<img src=x>/);
  assert.match(result.body, /adv-kit-chip--blue">c\.js</);
  assert.match(result.body, /adv-kit-chip--blue">captcha</, 'a type with no label shows as stored');
  assert.match(result.body, /adv-kit-chip--neutral">frame</);
  assert.equal(result.actions.length, 1);
  result.actions[0].onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(exported)), [{ name: 'DataDome', urls: ['https://ct.captcha-delivery.com/c.js?a="><img src=x>', 'https://geo.captcha-delivery.com/captcha/'] }]);
  module.showScriptResults({ scripts: [] }, { vendor: 'DataDome' });
  assert.match(opened[1].body, /adv-kit-note/);
  assert.match(opened[1].body, /No DataDome scripts found/);
  assert.equal(opened[1].actions.length, 0, 'nothing to export');
});
