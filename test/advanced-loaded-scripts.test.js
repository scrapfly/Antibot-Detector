const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Analyze Scripts without a reload: the vendor's scripts among what the tab already loaded (what the worker recorded,
// and the page's own Resource Timing list and script tags), classified by the vendor's own rules.

function load({ recorded = [], frames = [], scriptingFails = false } = {}) {
  const context = vm.createContext({
    console, URL,
    networkUrlsStore: new Map([[7, recorded]]),
    chrome: { scripting: { executeScript: async () => { if (scriptingFails) throw new Error('Cannot access a chrome:// URL'); return frames.map(result => ({ result })); } } },
    cloudflareClassifyUrl: url => (/\/cdn-cgi\/challenge-platform\//.test(url) ? 'Challenge' : null),
    AdvancedCaptchaVendors: { list: [{ vendorId: 'mtcaptcha', scripts: [/mtcaptcha\.com/] }], classify: (vendor, url) => (/mtcaptcha\.com/.test(url) ? 'Widget' : null) }
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../background/advanced/script-analysis.js'), 'utf8'), context);
  return context.AdvancedScriptAnalysis;
}

const plain = value => JSON.parse(JSON.stringify(value));

test('recorded requests and the page\'s own list are merged once, images and the page itself left out', async () => {
  const A = load({
    recorded: [{ url: 'https://shop.test/cdn-cgi/challenge-platform/h/b/main.js', type: 'script' },
      { url: 'https://shop.test/', type: 'main_frame' }, { url: 'https://shop.test/cdn-cgi/challenge-platform/logo.png', type: 'image' }],
    frames: [[['https://shop.test/cdn-cgi/challenge-platform/h/b/main.js', 'script'], ['https://shop.test/cdn-cgi/challenge-platform/h/b/pat', 'fetch'],
      ['https://shop.test/cdn-cgi/challenge-platform/x.css', 'css'], ['https://other.test/app.js', 'script']], [['', 'script']]]
  });
  const scripts = await A.fromLoadedPage({ tabId: 7, vendorId: 'cloudflare' });
  assert.deepEqual(plain(scripts.map(s => [s.url, s.type, s.resourceType])), [
    ['https://shop.test/cdn-cgi/challenge-platform/h/b/main.js', 'Challenge', 'script'],
    ['https://shop.test/cdn-cgi/challenge-platform/h/b/pat', 'Challenge', 'fetch']
  ]);
});

test('a page the extension cannot script still answers from what the worker recorded; data-described CAPTCHAs classify too', async () => {
  const A = load({ scriptingFails: true, recorded: [{ url: 'https://service.mtcaptcha.com/mtcv1/client/mtcaptcha.min.js', type: 'script' }] });
  assert.deepEqual(plain((await A.fromLoadedPage({ tabId: 7, vendorId: 'mtcaptcha' })).map(s => s.type)), ['Widget']);
  assert.equal(await A.fromLoadedPage({ tabId: 7, vendorId: 'akamai' }), null, 'no classifier: not this tool');
});
