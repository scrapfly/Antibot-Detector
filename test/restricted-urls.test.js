const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The pages no extension can run on: the popup says so ("this page cannot be scanned") instead of offering a scan that can
// only end as "Scan interrupted", and the worker does not try. The browser's own pages differ by browser (Brave, Opera and
// Vivaldi have their own scheme), and the Chrome Web Store is closed to extensions everywhere.

const root = path.join(__dirname, '..');
function loadUtils() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'utils/utils.js'), 'utf8'), ctx, { filename: 'utils.js' });
  return ctx.window.Utils;
}

test('the pages of the browser and of its store are not scannable', () => {
  const Utils = loadUtils();
  for (const url of [
    'chrome://extensions/', 'edge://settings/', 'brave://settings/', 'brave://newtab/', 'opera://settings/', 'vivaldi://settings/',
    'chrome-search://local-ntp/local-ntp.html', 'chrome-untrusted://new-tab-page/', 'chrome-extension://abc/popup.html',
    'about:blank', 'view-source:https://shop.example/', 'file:///C:/page.html', 'data:text/html,hi',
    'https://chromewebstore.google.com/detail/scrapfly-anti-bot-detecto/pdpakdgmjhkfimgaihlgaaiijlbilkca', 'https://chrome.google.com/webstore/category/extensions', ''
  ]) {
    assert.equal(Utils.isValidContentScriptUrl(url), false, `${url || '(empty)'} is not scannable`);
  }
});

test('websites stay scannable, including ones that only look like the store', () => {
  const Utils = loadUtils();
  for (const url of [
    'https://shop.example/', 'http://127.0.0.1:8080/page?x=1', 'https://www.google.com/', 'https://chrome.google.com/',
    'https://chromewebstore.google.com.shop.example/', 'https://bravesoftware.example/brave://'
  ]) {
    assert.equal(Utils.isValidContentScriptUrl(url), true, `${url} is scannable`);
  }
});
