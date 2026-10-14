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
  for (const vendor of ['awswaf', 'cloudflare', 'datadome', 'funcaptcha', 'hcaptcha', 'imperva', 'shapesecurity', 'turnstile']) {
    const view = read(`sections/advanced/vendors/${vendor}/view.js`);
    assert.match(view, /\('advCommonExportCode', 'Export Code'\)/, vendor);
  }
  for (const vendor of ['funcaptcha', 'hcaptcha']) {
    const view = read(`sections/advanced/vendors/${vendor}/view.js`);
    assert.match(view, /AdvancedCodeDialog\.openScriptUrls\(this, '(FunCaptcha|hCaptcha)', scripts\)/, vendor);
    assert.doesNotMatch(view, />\$\{script\.url\}</, `${vendor}: the URL is escaped`);
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

test('Turnstile export code does not call the extension logger', () => {
  const view = read('sections/advanced/vendors/turnstile/view.js');
  const start = view.indexOf('displayExportCodeModal = function');
  assert.doesNotMatch(view.slice(start), /Logger\.(network|error)\(\\`|Logger\.error\('NETWORK', \\`/);
});
