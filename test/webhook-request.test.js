const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const WebhookBody = require('../modules/core/webhook-body.js');
const { createHmac } = require('node:crypto');

// opts.secretField: the Signing secret field's value (no field on the page when absent); opts.body: a WebhookBody stand-in
function harness(webhook, opts = {}) {
  const calls = [], logs = [], notifications = [];
  const fields = {
    '#testWebhookBtn': { disabled: false, innerHTML: 'Test' },
    '#webhookUrl': { value: webhook.webhookUrl },
    '#webhookMethod': { value: webhook.webhookMethod || 'POST' },
    '#webhookPayload': { value: webhook.webhookPayload || '' }
  };
  if (opts.secretField !== undefined) {
    fields['#webhookSecret'] = { value: opts.secretField, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    fields['#webhookSecretError'] = { hidden: true };
    fields['#webhookSecretCopyBtn'] = { disabled: true };
  }
  const context = vm.createContext({
    WebhookBody: opts.body || WebhookBody, URL, URLSearchParams, FormData,
    Logger: Object.fromEntries(['network', 'warn', 'error', 'debug'].map(k => [k, (...args) => logs.push(args)])),
    UrlUtils: { getFaviconUrl: () => '' },
    Utils: { getSettings: async () => ({ webhook }) },
    SettingsUI: {},
    document: { querySelector: key => fields[key] },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200 }; },
    NotificationHelper: { success: text => notifications.push(text), error: text => notifications.push(text), info: text => notifications.push(text) }
  });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/webhook-filter.js', 'modules/core/webhook-log.js', 'modules/settings/settings-runtime.js', 'modules/settings/webhook-runtime.js', 'sections/settings/settings-ui-webhook.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
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

// ---------------------------------------------------------------- signing
const SIGNATURE = 'X-Scrapfly-Webhook-Signature';
const SIGNATURE_LOWER = 'X-Scrapfly-Webhook-Signature-Lowercase';
const hmac = (secret, body) => createHmac('sha256', secret).update(body).digest('hex');

test('Test and delivery sign alike: same body, same signature headers, no forged copy, nothing about the secret in the logs', async () => {
  const webhook = { enableWebhook: true, webhookUrl: 'https://hooks.example/in', webhookMethod: 'POST', webhookPayload: '{"site":"<HOSTNAME>"}',
    webhookHeaders: [{ name: SIGNATURE.toLowerCase(), value: 'forged' }], webhookSecret: 'SYNTHETIC_SECRET' };
  const h = harness(webhook);
  const sample = WebhookBody.sampleContext();
  await h.test();
  await h.context.SettingsRuntime.sendWebhookIfEnabled({ hostname: sample.hostname, url: sample.url, title: sample.title }, sample.detections);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[0], h.calls[1]);
  const headers = new Headers(h.calls[0].options.headers);
  const expected = hmac('SYNTHETIC_SECRET', h.calls[0].options.body);
  assert.equal(headers.get(SIGNATURE), expected.toUpperCase());
  assert.equal(headers.get(SIGNATURE_LOWER), expected);
  const said = JSON.stringify([...h.logs, ...h.notifications]);
  for (const secretish of ['SYNTHETIC_SECRET', expected, expected.toUpperCase()]) assert.ok(!said.includes(secretish));
});

test('Test signs with the secret in the field, saved or not, trimmed; an empty field sends unsigned', async () => {
  const webhook = { enableWebhook: true, webhookUrl: 'https://hooks.example/in', webhookMethod: 'POST', webhookPayload: '{"a":1}', webhookSecret: 'SYNTHETIC_SAVED' };
  const h = harness(webhook, { secretField: '  SYNTHETIC_UNSAVED ' });
  await h.test();
  assert.equal(new Headers(h.calls[0].options.headers).get(SIGNATURE_LOWER), hmac('SYNTHETIC_UNSAVED', h.calls[0].options.body));
  const empty = harness(webhook, { secretField: '' });
  await empty.test();
  assert.equal(empty.calls.length, 1);
  assert.equal(new Headers(empty.calls[0].options.headers).get(SIGNATURE), null);
});

test('an invalid secret in the field stops Test before anything is sent, and says why under the field', async () => {
  const h = harness({ enableWebhook: true, webhookUrl: 'https://hooks.example/in' }, { secretField: 'clé' });
  await h.test();
  assert.equal(h.calls.length, 0);
  assert.ok(h.notifications.some(text => /512 ASCII/.test(text)));
  assert.equal(h.fields['#webhookSecretError'].hidden, false);
  assert.equal(h.fields['#webhookSecret'].attributes['aria-invalid'], 'true');
  assert.equal(h.fields['#testWebhookBtn'].disabled, false);
});

test('a signing failure sends nothing on either path and names neither the secret nor the body', async () => {
  const webhook = { enableWebhook: true, webhookUrl: 'https://hooks.example/in', webhookMethod: 'POST', webhookPayload: '{"a":"SYNTHETIC_BODY"}', webhookSecret: 'SYNTHETIC_SECRET' };
  const failing = { ...WebhookBody, signature: async () => { throw new Error('bad SYNTHETIC_SECRET SYNTHETIC_BODY'); } };
  const h = harness(webhook, { body: failing });
  await h.test();
  await h.context.SettingsRuntime.sendWebhookIfEnabled({ url: 'https://shop.example' }, []);
  assert.equal(h.calls.length, 0);
  const said = JSON.stringify([...h.logs, ...h.notifications]);
  assert.ok(said.includes('Webhook signing failed'));
  assert.ok(!said.includes('SYNTHETIC_SECRET') && !said.includes('SYNTHETIC_BODY'));
});
