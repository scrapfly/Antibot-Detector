const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const WebhookBody = require('../modules/core/webhook-body.js');

// The service worker's side of the webhook: whether a page is sent (the filter), the send, and the record of recent
// deliveries. One request is still built by SettingsRuntime (test/webhook-request.test.js).

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const det = (name, category, confidence) => ({ detector: { name }, category, confidence });
const FOUND = [det('Cloudflare', 'Anti-Bot', 90), det('Canvas', 'Fingerprint', 30)];

function harness(webhook, { respond = () => ({ ok: true, status: 200 }), failStore = false } = {}) {
  const calls = [], store = {}, warnings = [];
  const context = vm.createContext({
    WebhookBody, URL, URLSearchParams, FormData, console,
    Logger: { network() {}, warn: (...args) => warnings.push(args), error() {}, ui() {}, debug() {} },
    UrlUtils: { getFaviconUrl: (h) => `https://icons.example/${h}.png` },
    Utils: { getSettings: async () => ({ webhook }) },
    chrome: { storage: { local: {
      async get(key) { await Promise.resolve(); return key in store ? { [key]: JSON.parse(JSON.stringify(store[key])) } : {}; },
      async set(values) { await Promise.resolve(); if (failStore) throw new Error('storage is full'); for (const [k, v] of Object.entries(values)) store[k] = JSON.parse(JSON.stringify(v)); },
      async remove(key) { await Promise.resolve(); delete store[key]; }
    } } },
    fetch: async (url, options) => { calls.push({ url, options }); const result = respond(url, options); if (result instanceof Error) throw result; return result; }
  });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/webhook-filter.js', 'modules/core/webhook-log.js',
    'modules/settings/settings-runtime.js', 'modules/settings/webhook-runtime.js']) vm.runInContext(read(file), context);
  const runtime = context.SettingsRuntime;
  const log = () => JSON.parse(JSON.stringify(store[runtime.WEBHOOK_LOG_KEY] || []));
  return { runtime, calls, log, store, warnings };
}

const ON = { enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC_TOKEN', webhookMethod: 'POST', webhookContentType: 'application/json',
  webhookPayload: WebhookBody.DEFAULT_TEMPLATE, webhookHeaders: [{ name: 'Authorization', value: 'Bearer SYNTHETIC_KEY' }] };
const PAGE = { url: 'https://shop.example/cart?id=1', title: 'Cart' };

test('a page is sent to a webhook that is on, and the record says so without naming the address', async () => {
  const h = harness(ON);
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].options.body, /Cloudflare/);
  const [entry] = h.log();
  assert.deepEqual([entry.page, entry.outcome, entry.status, entry.trigger], ['shop.example', 'sent', 200, 'scan']);
  assert.equal(typeof entry.ms, 'number');
  assert.ok(!JSON.stringify(h.log()).includes('SYNTHETIC'), 'no address, header or token in the record');
});

test('a webhook that is off, or has no address, sends and records nothing', async () => {
  for (const webhook of [{ ...ON, enableWebhook: false }, { ...ON, webhookUrl: '' }, {}]) {
    const h = harness(webhook);
    await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
    assert.equal(h.calls.length, 0);
    assert.deepEqual(h.log(), []);
  }
});

test('the filter keeps a page back and the record says why', async () => {
  const cases = [
    [{ webhookMinConfidence: 95 }, 'confidence'],
    [{ webhookCategories: ['captcha'] }, 'category'],
    [{ webhookDomains: ['other.example'] }, 'site']
  ];
  for (const [filter, reason] of cases) {
    const h = harness({ ...ON, ...filter });
    await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
    assert.equal(h.calls.length, 0, reason);
    assert.deepEqual(h.log().map(e => [e.outcome, e.reason, e.page]), [['skipped', reason, 'shop.example']]);
  }
  const passes = harness({ ...ON, webhookMinConfidence: 90, webhookCategories: ['antibot'], webhookDomains: ['shop.example'] });
  await passes.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.equal(passes.calls.length, 1);
});

test('a page whose result came from the cache is sent only when "send on every page load" is on', async () => {
  const off = harness(ON);
  await off.runtime.sendWebhookIfEnabled(PAGE, FOUND, { trigger: 'cache' });
  assert.equal(off.calls.length, 0);
  assert.deepEqual(off.log(), [], 'a switch that is off leaves no record');
  const on = harness({ ...ON, webhookOnCache: true });
  await on.runtime.sendWebhookIfEnabled(PAGE, FOUND, { trigger: 'cache' });
  assert.equal(on.calls.length, 1);
  assert.deepEqual(on.log().map(e => [e.outcome, e.trigger]), [['sent', 'cache']]);
  // The filter applies to cached pages too
  const filtered = harness({ ...ON, webhookOnCache: true, webhookMinConfidence: 99 });
  await filtered.runtime.sendWebhookIfEnabled(PAGE, FOUND, { trigger: 'cache' });
  assert.deepEqual(filtered.log().map(e => [e.outcome, e.reason, e.trigger]), [['skipped', 'confidence', 'cache']]);
});

test('a failed delivery is recorded as failed with its status or the kind of error, never the error text', async () => {
  const status = harness(ON, { respond: () => ({ ok: false, status: 503 }) });
  await status.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.deepEqual(status.log().map(e => [e.outcome, e.status, e.error]), [['failed', 503, undefined]]);
  const network = harness(ON, { respond: () => new Error('connect ECONNREFUSED hooks.example SYNTHETIC_TOKEN') });
  await network.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.deepEqual(network.log().map(e => [e.outcome, e.error]), [['failed', 'network']]);
  assert.ok(!JSON.stringify(network.log()).includes('SYNTHETIC'));
  const blocked = harness({ ...ON, webhookUrl: 'http://hooks.example/in' });
  await blocked.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.equal(blocked.calls.length, 0);
  assert.deepEqual(blocked.log().map(e => [e.outcome, e.error]), [['failed', 'blocked']]);
  const config = harness({ ...ON, webhookMethod: 'TRACE' });
  await config.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.deepEqual(config.log().map(e => [e.outcome, e.error]), [['failed', 'config']]);
});

test('deliveries that finish together are all recorded, and the record keeps the last twenty', async () => {
  const h = harness(ON);
  await Promise.all(Array.from({ length: 5 }, (_, i) => h.runtime.sendWebhookIfEnabled({ url: `https://p${i}.example/` }, FOUND)));
  assert.deepEqual(h.log().map(e => e.page).sort(), ['p0.example', 'p1.example', 'p2.example', 'p3.example', 'p4.example']);
  await Promise.all(Array.from({ length: 30 }, (_, i) => h.runtime.sendWebhookIfEnabled({ url: `https://q${i}.example/` }, FOUND)));
  assert.equal(h.log().length, 20);
  await h.runtime.clearWebhookLog();
  assert.deepEqual(h.log(), []);
});

test('a record that cannot be written never stops or fails a delivery', async () => {
  const h = harness(ON, { failStore: true });
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.equal(h.calls.length, 1, 'the page was sent');
  assert.deepEqual(h.log(), []);
});

// ---------------------------------------------------------------- signing
const { createHmac } = require('node:crypto');

test('a signed delivery is recorded like any other: the record holds neither the secret nor the signature', async () => {
  const h = harness({ ...ON, webhookSecret: 'SYNTHETIC_SECRET' });
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.equal(h.calls.length, 1);
  const digest = createHmac('sha256', 'SYNTHETIC_SECRET').update(h.calls[0].options.body).digest('hex');
  assert.equal(new Headers(h.calls[0].options.headers).get('X-Scrapfly-Webhook-Signature'), digest.toUpperCase());
  const record = JSON.stringify(h.log());
  assert.equal(h.log()[0].outcome, 'sent');
  for (const secretish of ['SYNTHETIC', digest, digest.toUpperCase()]) assert.ok(!record.includes(secretish));
});

test('a saved secret is used trimmed; one that is blank or not text sends unsigned', async () => {
  const trimmed = harness({ ...ON, webhookSecret: '  SYNTHETIC_SECRET \n' });
  await trimmed.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  const body = trimmed.calls[0].options.body;
  assert.equal(new Headers(trimmed.calls[0].options.headers).get('X-Scrapfly-Webhook-Signature-Lowercase'), createHmac('sha256', 'SYNTHETIC_SECRET').update(body).digest('hex'));
  for (const secret of ['   ', 42, {}, null, undefined]) {
    const h = harness({ ...ON, webhookSecret: secret });
    await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
    assert.equal(h.calls.length, 1, String(secret));
    assert.equal(new Headers(h.calls[0].options.headers).get('X-Scrapfly-Webhook-Signature'), null, String(secret));
  }
});
