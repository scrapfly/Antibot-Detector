'use strict';
// Retrying failed webhook deliveries in the service worker: what is held (in memory only), the alarm, the automatic
// retries after 1, 5 and 15 minutes, a manual Retry, and what the record and the held data never contain.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const WebhookBody = require('../modules/core/webhook-body.js');

const plain = (value) => JSON.parse(JSON.stringify(value));
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const det = (name, category, confidence) => ({ detector: { name }, category, confidence });
const FOUND = [det('Cloudflare', 'Anti-Bot', 90)];
const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 21, 12);
const PAGE = { url: 'https://shop.example/cart?id=1', title: 'Cart' };

function harness(initial, { session = true } = {}) {
  const clock = { t: T0 };
  const local = {}, sessionStore = {}, alarms = new Map(), calls = [];
  let webhook = { ...initial };
  let respond = () => ({ ok: true, status: 200 });
  class FakeDate extends Date { constructor(...args) { if (args.length) super(...args); else super(clock.t); } static now() { return clock.t; } }
  const area = (store) => ({
    async get(key) { await Promise.resolve(); return key in store ? { [key]: JSON.parse(JSON.stringify(store[key])) } : {}; },
    async set(values) { await Promise.resolve(); for (const [k, v] of Object.entries(values)) store[k] = JSON.parse(JSON.stringify(v)); },
    async remove(key) { await Promise.resolve(); delete store[key]; }
  });
  const context = vm.createContext({
    WebhookBody, URL, URLSearchParams, FormData, console, Date: FakeDate, JSON, Math, Promise,
    Logger: { network() {}, warn() {}, error() {}, ui() {}, debug() {} },
    UrlUtils: { getFaviconUrl: (h) => `https://icons.example/${h}.png` },
    Utils: { getSettings: async () => ({ webhook }) },
    chrome: {
      storage: { local: area(local), ...(session ? { session: area(sessionStore) } : {}) },
      alarms: { create: (name, info) => alarms.set(name, info), clear: async (name) => alarms.delete(name) }
    },
    fetch: async (url, options) => { calls.push({ url, options, at: clock.t }); const result = respond(url, options); if (result instanceof Error) throw result; return result; }
  });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/webhook-filter.js', 'modules/core/webhook-log.js',
    'modules/core/webhook-retry.js', 'modules/settings/settings-runtime.js', 'modules/settings/webhook-runtime.js']) vm.runInContext(read(file), context);
  const runtime = context.SettingsRuntime;
  return {
    runtime, calls, alarms, clock,
    log: () => JSON.parse(JSON.stringify(local[runtime.WEBHOOK_LOG_KEY] || [])),
    held: () => JSON.parse(JSON.stringify(sessionStore[runtime.WEBHOOK_HELD_KEY] || {})),
    local, sessionStore,
    set: (next) => { webhook = { ...webhook, ...next }; },
    reply: (fn) => { respond = fn; },
    advance: (ms) => { clock.t += ms; }
  };
}

const ON = { enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC_TOKEN', webhookMethod: 'POST', webhookContentType: 'application/json',
  webhookPayload: WebhookBody.DEFAULT_TEMPLATE, webhookHeaders: [{ name: 'Authorization', value: 'Bearer SYNTHETIC_KEY' }], webhookSecret: 'SYNTHETICSECRET' };

test('a failed delivery is held in memory and logged with its id and the time of the next retry', async () => {
  const h = harness(ON);
  h.reply(() => ({ ok: false, status: 503 }));
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  const [entry] = h.log();
  assert.deepEqual([entry.outcome, entry.status, entry.trigger, entry.retryAt], ['failed', 503, 'scan', T0 + MIN]);
  assert.match(entry.id, /^[a-z0-9]+$/);
  const held = h.held();
  assert.deepEqual(Object.keys(held), [entry.id]);
  assert.equal(held[entry.id].attempts, 1);
  assert.equal(held[entry.id].ctx.hostname, 'shop.example');
  assert.equal(h.alarms.get('scrapfly-webhook-retry').when, T0 + MIN);
  // The held data and the log never hold the address, a header, the secret or a signature
  for (const dump of [JSON.stringify(h.held()), JSON.stringify(h.log()), JSON.stringify(h.local)]) {
    assert.ok(!/SYNTHETIC|Bearer|hooks\.example|[A-F0-9]{64}/.test(dump), dump.slice(0, 200));
  }
  assert.deepEqual(Object.keys(h.sessionStore), [h.runtime.WEBHOOK_HELD_KEY], 'only storage.session holds it');
});

test('the alarm retries it with the settings of that moment, and a success empties the hold and the alarm', async () => {
  const h = harness(ON);
  h.reply(() => ({ ok: false, status: 502 }));
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  h.set({ webhookUrl: 'https://fixed.example/path', webhookSecret: 'NEWSECRET' });
  h.reply(() => ({ ok: true, status: 200 }));
  h.advance(MIN + 1000);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].url, 'https://fixed.example/path', 'the corrected address is used');
  const expected = await WebhookBody.signature('NEWSECRET', h.calls[1].options.body);
  assert.equal(h.calls[1].options.headers[WebhookBody.SIGNATURE_HEADER_LOWERCASE], expected, 'signed with the secret of that moment');
  const [first, second] = h.log();
  assert.equal(first.outcome, 'failed');
  assert.deepEqual([second.outcome, second.trigger, second.attempt, second.status], ['sent', 'retry', 2, 200]);
  assert.deepEqual(h.held(), {});
  assert.equal(h.alarms.has('scrapfly-webhook-retry'), false);
});

test('a failure that keeps failing is retried after 1, 5 and 15 minutes, then left to a manual Retry', async () => {
  const h = harness(ON);
  h.reply(() => new Error('offline'));
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  const id = h.log()[0].id;
  assert.equal(h.log()[0].error, 'network');
  const due = [];
  for (const wait of [MIN, 5 * MIN, 15 * MIN]) {
    assert.equal(h.alarms.get('scrapfly-webhook-retry').when, h.clock.t + wait);
    due.push(wait);
    h.advance(wait + 100);
    await h.runtime.runDueWebhookRetries();
  }
  assert.equal(h.calls.length, 4, 'the first try and three retries');
  assert.deepEqual(h.log().map(e => e.attempt), [undefined, 2, 3, 4]);
  assert.equal(h.log().at(-1).retryAt, undefined, 'no fifth try by itself');
  assert.equal(h.alarms.has('scrapfly-webhook-retry'), false);
  assert.ok(h.held()[id], 'still held for a manual Retry');
  // A manual Retry works while it is held, and delivers
  h.reply(() => ({ ok: true, status: 200 }));
  assert.deepEqual(plain(await h.runtime.retryWebhook(id, { manual: true })), { status: 'sent' });
  assert.deepEqual(h.held(), {});
});

test('a refusal only the person can fix (403, an address not allowed) is held for Retry but not retried by itself', async () => {
  const h = harness(ON);
  h.reply(() => ({ ok: false, status: 403 }));
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  const [entry] = h.log();
  assert.equal(entry.retryAt, undefined);
  assert.ok(entry.id && h.held()[entry.id]);
  assert.equal(h.alarms.size, 0);
  const blocked = harness({ ...ON, webhookUrl: 'http://localhost/x' });
  await blocked.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.deepEqual([blocked.log()[0].outcome, blocked.log()[0].error, blocked.log()[0].retryAt], ['failed', 'blocked', undefined]);
});

test('Retry failed deliveries off, or no storage.session: nothing is held and the record is as before', async () => {
  const off = harness({ ...ON, webhookRetry: false });
  off.reply(() => ({ ok: false, status: 503 }));
  await off.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.deepEqual(Object.keys(off.log()[0]).sort(), ['ms', 'outcome', 'page', 'status', 't', 'trigger']);
  assert.deepEqual(off.sessionStore, {});
  const none = harness(ON, { session: false });
  none.reply(() => ({ ok: false, status: 503 }));
  await none.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.equal(none.log()[0].id, undefined);
});

test('a delivery that is not held (unknown, expired) is gone; a webhook switched off keeps it for manual only', async () => {
  const h = harness(ON);
  h.reply(() => ({ ok: false, status: 503 }));
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  const id = h.log()[0].id;
  assert.deepEqual(plain(await h.runtime.retryWebhook('nope', { manual: true })), { status: 'gone' });
  h.set({ enableWebhook: false });
  assert.deepEqual(plain(await h.runtime.retryWebhook(id, { manual: true })), { status: 'off' });
  assert.ok(h.held()[id], 'a manual attempt with the webhook off keeps it');
  h.advance(MIN + 1);
  await h.runtime.runDueWebhookRetries();
  assert.deepEqual(h.held(), {}, 'an automatic one drops it');
  const e = harness(ON);
  e.reply(() => ({ ok: false, status: 503 }));
  await e.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  const eid = e.log()[0].id;
  e.advance(61 * MIN);
  assert.deepEqual(plain(await e.runtime.retryWebhook(eid, { manual: true })), { status: 'gone' }, 'over an hour old');
});

test('the worker keeps at most 20 failed deliveries, the newest', async () => {
  const h = harness(ON);
  h.reply(() => ({ ok: false, status: 503 }));
  for (let i = 0; i < 24; i++) {
    h.advance(1000);
    await h.runtime.sendWebhookIfEnabled({ url: `https://p${i}.example/`, title: `p${i}` }, FOUND);
  }
  const held = h.held();
  assert.equal(Object.keys(held).length, 20);
  assert.ok(Object.values(held).every(item => !/^p[0-3]\.example$/.test(item.ctx.hostname)), 'the first four went');
  assert.equal(h.log().length, 20, 'the log keeps its own 20 lines');
});

test('two retries that are due run one after the other and the alarm moves to what is left', async () => {
  const h = harness(ON);
  h.reply(() => ({ ok: false, status: 503 }));
  await h.runtime.sendWebhookIfEnabled({ url: 'https://a.example/' }, FOUND);
  h.advance(10 * 1000);
  await h.runtime.sendWebhookIfEnabled({ url: 'https://b.example/' }, FOUND);
  h.reply(() => ({ ok: true, status: 200 }));
  h.advance(MIN);
  await h.runtime.runDueWebhookRetries();
  assert.deepEqual(h.log().filter(e => e.trigger === 'retry').map(e => [e.page, e.outcome]), [['a.example', 'sent'], ['b.example', 'sent']]);
  assert.deepEqual(h.held(), {});
  assert.equal(h.alarms.size, 0);
});

test('switching Retry failed deliveries off after a delivery is held stops its retries: nothing is sent again', async () => {
  const h = harness(ON);
  h.reply(() => ({ ok: false, status: 503 }));
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.equal(Object.keys(h.held()).length, 1);
  h.set({ webhookRetry: false });
  // The alarm fires again and again for an hour: with the switch off it sends nothing and lets the delivery go
  for (let i = 0; i < 10; i++) { h.advance(MIN); await h.runtime.runDueWebhookRetries(); }
  assert.equal(h.calls.length, 1, 'only the first delivery reached the endpoint');
  assert.deepEqual(h.held(), {});
  assert.equal(h.alarms.has('scrapfly-webhook-retry'), false, 'no alarm is left');
});

test('a manual Retry that fails while the switch is off lets the delivery go instead of planning another retry', async () => {
  const h = harness(ON);
  h.reply(() => ({ ok: false, status: 503 }));
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  const [id] = Object.keys(h.held());
  h.set({ webhookRetry: false });
  assert.equal((await h.runtime.retryWebhook(id, { manual: true })).status, 'failed');
  assert.deepEqual(h.held(), {});
  h.advance(30 * MIN);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.calls.length, 2, 'the first delivery and the manual Retry, nothing more');
});

test('a Retry press while the automatic retry of the same delivery is being sent does not send it twice', async () => {
  const h = harness(ON);
  h.reply(() => ({ ok: false, status: 503 }));
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  const [id] = Object.keys(h.held());
  h.advance(MIN);
  let release;
  h.reply(() => new Promise((resolve) => { release = () => resolve({ ok: true, status: 200 }); }));
  const automatic = h.runtime.runDueWebhookRetries();
  for (let i = 0; i < 50 && !release; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(typeof release, 'function', 'the automatic retry is in flight');
  assert.equal((await h.runtime.retryWebhook(id, { manual: true })).status, 'busy');
  release();
  await automatic;
  assert.equal(h.calls.length, 2, 'the first delivery and one retry');
  assert.deepEqual(h.held(), {}, 'the success let it go');
  assert.equal(h.log().filter((e) => e.trigger === 'retry').length, 1, 'one retry line');
});


test('a worker stopped while it was sending an automatic retry does not lose it: the next worker retries it once the claim runs out', async () => {
  const h = harness(ON);
  h.reply(() => ({ ok: false, status: 503 }));
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  const [id] = Object.keys(h.held());
  h.advance(MIN);
  let sending = false;
  h.reply(() => { sending = true; return new Promise(() => {}); }); // the worker stops here: no answer, ever
  h.runtime.runDueWebhookRetries();
  for (let i = 0; i < 50 && !sending; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(sending, 'the retry is in flight');
  const left = h.held();
  assert.equal(typeof left[id].due, 'number', 'still due once the claim runs out');

  // A new worker: same storage.session, the claim has run out
  const next = harness(ON);
  next.sessionStore[next.runtime.WEBHOOK_HELD_KEY] = left;
  next.clock.t = h.clock.t + next.runtime.WEBHOOK_RETRY_CLAIM_MS + 1000;
  next.reply(() => ({ ok: true, status: 200 }));
  await next.runtime.runDueWebhookRetries();
  assert.equal(next.calls.length, 1, 'sent again');
  assert.deepEqual(next.held(), {});
});
