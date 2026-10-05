const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// In-page notices are drawn by the service worker, whose UI language may still
// be loading when a notice is requested. pageText() defers the translation;
// showNotification() waits for I18n.ready() and resolves it.

const root = path.join(__dirname, '..');

function load({ messages = {}, ready = Promise.resolve() } = {}) {
  const injected = [];
  const I18n = {
    get: (key) => messages[key] || null,
    format: (key, ...args) => {
      let msg = messages[key];
      if (!msg) return null;
      args.forEach((a, i) => { msg = msg.split('{' + i + '}').join(String(a)); });
      return msg;
    },
    ready: () => ready
  };
  const context = vm.createContext({
    console, Promise, Map, Set, Uint8Array, String, Array, Object, JSON, Math, Date, Number,
    I18n,
    Logger: { ui() {}, warn() {}, error() {}, network() {}, debug() {} },
    fetch: async () => { throw new Error('no fonts in tests'); },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    chrome: {
      runtime: { getURL: (p) => p },
      scripting: { executeScript: async (opts) => { injected.push(opts.args); } },
      notifications: { create() {} }
    }
  });
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'sections/advanced/base-interceptor-helpers.js'), 'utf8'), context);
  return { context, injected, I18n };
}

test('pageText resolves through I18n, with placeholders', () => {
  const { context } = load({ messages: { pageNoticeMonitoringStartedFmt: 'Monitorización de {0} iniciada' } });
  const value = context.pageText('pageNoticeMonitoringStartedFmt', '{0} Monitoring Started', 'Akamai');
  assert.strictEqual(context.resolvePageText(value), 'Monitorización de Akamai iniciada');
});

test('pageText falls back to the English text with placeholders filled', () => {
  const { context } = load();
  const value = context.pageText('missingKey', 'Captured {0} of {1}', 2, 5);
  assert.strictEqual(context.resolvePageText(value), 'Captured 2 of 5');
  assert.strictEqual(context.resolvePageText('plain'), 'plain');
  assert.strictEqual(context.resolvePageText(undefined), undefined);
});

test('pageText arguments may themselves be pageText values', () => {
  const { context } = load({ messages: { outer: 'Estado: {0}', inner: 'listo' } });
  const value = context.pageText('outer', 'Status: {0}', context.pageText('inner', 'ready'));
  assert.strictEqual(context.resolvePageText(value), 'Estado: listo');
});

test('showNotification translates only after the language has loaded', async () => {
  let finishLoading;
  const ready = new Promise((resolve) => { finishLoading = resolve; });
  const messages = {};
  const { context, injected } = load({ messages, ready });
  const shown = context.showNotification(1, {
    title: context.pageText('pageNoticeCaptureCompleted', 'Capture Completed'),
    message: 'raw text'
  });
  // The override arrives while the notice is waiting for it
  messages.pageNoticeCaptureCompleted = 'Captura completada';
  finishLoading();
  await shown;
  assert.strictEqual(injected.length, 1);
  // renderPageNotice(texts, config): texts are resolved strings
  assert.strictEqual(injected[0][0].title, 'Captura completada');
  assert.strictEqual(injected[0][0].message, 'raw text');
});

test('pageTextNow waits for the language and returns a string', async () => {
  const { context } = load({ messages: { k: 'hola {0}' } });
  assert.strictEqual(await context.pageTextNow('k', 'hi {0}', 'x'), 'hola x');
});
