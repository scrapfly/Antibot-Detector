const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isExtensionPage, extensionPagesOnly } = require('../modules/core/message-sender.js');

const runtime = { getURL: (suffix) => `chrome-extension://abc123/${suffix}` };

test('the extension\'s own pages are accepted, in a popup or opened in a tab', () => {
  assert.equal(isExtensionPage({ url: 'chrome-extension://abc123/popup.html' }, runtime), true);
  assert.equal(isExtensionPage({ url: 'chrome-extension://abc123/sections/stats/stats.html', tab: { id: 4 } }, runtime), true);
  assert.equal(isExtensionPage({ origin: 'chrome-extension://abc123' }, runtime), true);
});

test('a content script is refused: it carries the address of the page it runs in', () => {
  assert.equal(isExtensionPage({ url: 'https://example.com/', tab: { id: 4 } }, runtime), false);
  assert.equal(isExtensionPage({ url: 'https://example.com/' }, runtime), false);
  assert.equal(isExtensionPage({ tab: { id: 4 } }, runtime), false);
  // Another extension's address that merely starts the same way is not this extension
  assert.equal(isExtensionPage({ url: 'chrome-extension://abc1234/popup.html' }, runtime), false);
});

test('a call inside the worker, and another extension context with no tab and no address, are accepted', () => {
  assert.equal(isExtensionPage(undefined, runtime), true);
  assert.equal(isExtensionPage(null, runtime), true);
  assert.equal(isExtensionPage({}, runtime), true);
});

test('the runtime comes from the page\'s chrome when it is not passed', () => {
  globalThis.chrome = { runtime };
  try {
    assert.equal(isExtensionPage({ url: 'chrome-extension://abc123/popup.html' }), true);
    assert.equal(isExtensionPage({ url: 'https://example.com/', tab: { id: 1 } }), false);
  } finally { delete globalThis.chrome; }
});

test('without a runtime nothing but an address-less sender is accepted', () => {
  assert.equal(isExtensionPage({ url: 'chrome-extension://abc123/popup.html' }, {}), false);
  assert.equal(isExtensionPage({}, {}), true);
});

test('the check is written once: no other script compares the sender\'s address itself', () => {
  const root = path.join(__dirname, '..');
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'test', 'scripts', 'store', 'assets', '.claude'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(root);
  const spelled = files.filter(file => /sender\.url\s*\|\|\s*sender\.origin/.test(fs.readFileSync(file, 'utf8'))).map(file => path.relative(root, file).split(path.sep).join('/'));
  assert.deepStrictEqual(spelled, ['modules/core/message-sender.js']);
});

test('extensionPagesOnly runs the handler for an extension page and answers a content script with an error', () => {
  const calls = [];
  const handler = extensionPagesOnly((args) => { calls.push(args.request); return true; }, runtime);
  const answers = [];
  assert.equal(handler({ request: 'popup', sender: { url: 'chrome-extension://abc123/popup.html' }, sendResponse: a => answers.push(a) }), true);
  assert.equal(handler({ request: 'worker', sendResponse: a => answers.push(a) }), true, 'a call inside the worker');
  assert.deepEqual(calls, ['popup', 'worker']);
  assert.equal(handler({ request: 'page', sender: { url: 'https://example.com/', tab: { id: 2 } }, sendResponse: a => answers.push(a) }), false);
  assert.deepEqual(calls, ['popup', 'worker'], 'the handler did not run for the page');
  assert.equal(answers.length, 1);
  assert.equal(answers[0].status, 'error');
  assert.doesNotThrow(() => handler({ request: 'page', sender: { url: 'https://example.com/' } }), 'no sendResponse is not a crash');
});

