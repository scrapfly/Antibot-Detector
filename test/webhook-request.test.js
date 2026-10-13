const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const WebhookBody = require('../modules/core/webhook-body.js');

function harness(webhook) {
  const calls = [], logs = [], notifications = [];
  const fields = {
    '#testWebhookBtn': { disabled: false, innerHTML: 'Test' },
    '#webhookUrl': { value: webhook.webhookUrl },
    '#webhookMethod': { value: webhook.webhookMethod || 'POST' },
    '#webhookPayload': { value: webhook.webhookPayload || '' }
  };
  const context = vm.createContext({
    WebhookBody, URL, URLSearchParams, FormData,
    Logger: Object.fromEntries(['network', 'warn', 'error', 'debug'].map(k => [k, (...args) => logs.push(args)])),
    UrlUtils: { getFaviconUrl: () => '' },
    Utils: { getSettings: async () => ({ webhook }) },
    SettingsUI: {},
    document: { querySelector: key => fields[key] },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200 }; },
    NotificationHelper: { success: text => notifications.push(text), error: text => notifications.push(text) }
  });
  context.self = context;
  for (const file of ['modules/settings/settings-runtime.js', 'sections/settings/settings-ui-webhook.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  return { context, calls, logs, notifications, fields, test: () => context.SettingsUI.handleTestWebhook.call({
    settings: { webhook }, escapeHtml: text => text, getWebhookContentTypeValue: () => webhook.webhookContentType || 'application/json'
  }) };
}

test('Test and automatic delivery use identical body, headers and secure transport options', async () => {
  const webhook = { enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC_PATH_TOKEN', webhookMethod: 'POST', webhookHeaders: [{ name: 'X-Test', value: '<HOSTNAME>' }], webhookPayload: '{"site":"<HOSTNAME>"}' };
  const h = harness(webhook);
  const sample = WebhookBody.sampleContext();
  await h.test();
  await h.context.SettingsRuntime.sendWebhookIfEnabled({ hostname: sample.hostname, url: sample.url, title: sample.title }, sample.detections);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[0], h.calls[1]);
  assert.equal(h.calls[0].options.redirect, 'error');
  assert.equal(h.calls[0].options.credentials, 'omit');
  assert.equal(h.calls[0].options.referrerPolicy, 'no-referrer');
  assert.ok(!JSON.stringify(h.logs).includes('SYNTHETIC_PATH_TOKEN'));
});

test('both paths reject private, credential-bearing, non-HTTPS and malformed destinations before fetch', async () => {
  for (const url of ['http://hooks.example/a', 'https://127.0.0.1/a', 'https://10.1.2.3/a', 'https://[::ffff:7f00:1]/a', 'https://[febf::1]/a', 'https://[fc00::1]/a', 'https://user:SYNTHETIC_TOKEN@hooks.example/a', 'garbage']) {
    const h = harness({ enableWebhook: true, webhookUrl: url });
    await h.test();
    await h.context.SettingsRuntime.sendWebhookIfEnabled({ url: 'https://shop.example' }, []);
    assert.equal(h.calls.length, 0, url);
    assert.equal(h.fields['#testWebhookBtn'].disabled, false);
    assert.ok(!JSON.stringify(h.logs).includes(url));
  }
});

test('URL safety validates the substituted hostname, not only the saved template', () => {
  const h = harness({});
  assert.throws(() => h.context.SettingsRuntime.buildWebhookRequest({ webhookUrl: 'https://<HOSTNAME>/hook' }, { hostname: '127.0.0.1' }), /public host/);
  assert.equal(h.context.SettingsRuntime.buildWebhookRequest({ webhookUrl: 'https://<HOSTNAME>/hook' }, { hostname: 'hooks.example' }).url, 'https://hooks.example/hook');
});

test('network errors never expose destination tokens in logs or Test notifications', async () => {
  const h = harness({ enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC_PATH_TOKEN' });
  h.context.fetch = async url => { throw new Error('Failed request ' + url); };
  await h.test();
  await h.context.SettingsRuntime.sendWebhookIfEnabled({ url: 'https://shop.example' }, []);
  assert.ok(!JSON.stringify([...h.logs, ...h.notifications]).includes('SYNTHETIC_PATH_TOKEN'));
});
