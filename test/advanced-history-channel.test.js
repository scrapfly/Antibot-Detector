const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Advanced history is extension UI data: a page's content script must never reach it, but the popup (and the popup or the
// stats page opened in a browser tab, which carries a tab) may. The check used to look only at "has a tab", so Settings →
// Data → Storage → Clear worked in the toolbar popup and failed in a popup opened in a tab.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function workerRegistry() {
  const event = () => ({ addListener() {}, removeListener() {}, emit() {} });
  const stored = {};
  const context = { URL, TextDecoder, Uint8Array, console, Logger: { debug() {}, network() {}, warn() {}, error() {} },
    UrlUtils: { normalizeFaviconForStorage: () => '' }, setTimeout, clearTimeout, clearInterval,
    chrome: { tabs: { onRemoved: event(), onUpdated: event(), get: async id => ({ id, url: 'https://shop.example/' }) },
      webNavigation: { onCompleted: event(), onCommitted: event() },
      webRequest: { onBeforeRequest: event(), onResponseStarted: event(), onBeforeSendHeaders: event() },
      runtime: { getURL: (file) => `chrome-extension://abc/${file}`, async sendMessage() {} },
      storage: { local: { async get(keys) { return Object.fromEntries([].concat(keys).filter(key => key in stored).map(key => [key, stored[key]])); }, async set(values) { Object.assign(stored, values); } } } } };
  context.self = context;
  vm.createContext(context);
  for (const file of ['modules/core/message-types.js', 'modules/core/message-sender.js', 'modules/core/capture-retention.js', 'modules/advanced/captcha-vendors.js', 'modules/advanced/vendor-registry.js',
    'modules/advanced/result-model.js', 'background/advanced/history-store.js', 'background/advanced/page-notice.js', 'background/advanced/collector-utils.js',
    'background/advanced/job-manager.js', 'background/advanced/script-analysis.js', 'background/advanced/vendors/captcha/interceptor.js', 'background/handlers/messages-advanced-capture.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const registry = {};
  context.registerAdvancedCaptureHandlers(registry, {});
  return { registry, stored };
}

const ask = (registry, sender, method = 'load') => new Promise((resolve) => {
  const handled = registry.ADVANCED_HISTORY({ request: { type: 'ADVANCED_HISTORY', method, args: [] }, sender, sendResponse: resolve });
  if (handled === false) return; // answered synchronously
});

test('extension pages reach Advanced history, a content script never does', async () => {
  const { registry } = workerRegistry();
  const answers = {
    'the toolbar popup (no tab)': await ask(registry, { id: 'abc', url: 'chrome-extension://abc/popup.html' }),
    'the popup opened in a tab': await ask(registry, { id: 'abc', url: 'chrome-extension://abc/popup.html', tab: { id: 4 } }),
    'the stats page in a tab': await ask(registry, { id: 'abc', url: 'chrome-extension://abc/sections/stats/stats.html', tab: { id: 5 } }),
    'a call from the worker itself': await ask(registry, undefined),
    'a content script': await ask(registry, { id: 'abc', url: 'https://shop.example/cart', tab: { id: 6 } }),
    'a content script in a frame': await ask(registry, { id: 'abc', url: 'https://evil.example/', origin: 'https://evil.example', tab: { id: 7 }, frameId: 3 }),
    'an address that only looks like the extension': await ask(registry, { id: 'abc', url: 'https://chrome-extension.evil.example/', tab: { id: 8 } })
  };
  const status = Object.fromEntries(Object.entries(answers).map(([who, answer]) => [who, answer.status]));
  assert.deepStrictEqual(status, {
    'the toolbar popup (no tab)': 'ok', 'the popup opened in a tab': 'ok', 'the stats page in a tab': 'ok', 'a call from the worker itself': 'ok',
    'a content script': 'error', 'a content script in a frame': 'error', 'an address that only looks like the extension': 'error'
  });
  assert.match(answers['a content script'].error, /only to extension pages/);
});

test('clearing from the popup in a tab empties the captures', async () => {
  const { registry, stored } = workerRegistry();
  stored.scrapfly_advanced_history = { akamai: [{ id: 'c1', timestamp: Date.now(), expiresAt: Date.now() + 60000, hostname: 'a.test', data: {} }] };
  const answer = await ask(registry, { id: 'abc', url: 'chrome-extension://abc/popup.html', tab: { id: 4 } }, 'clear');
  assert.strictEqual(answer.status, 'ok');
  assert.strictEqual(JSON.stringify(stored.scrapfly_advanced_history), '{}');
  const refused = await ask(registry, { id: 'abc', url: 'https://shop.example/', tab: { id: 9 } }, 'clear');
  assert.strictEqual(refused.status, 'error');
});
