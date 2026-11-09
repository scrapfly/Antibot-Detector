'use strict';
// A failed delivery is held for up to an hour and sent again by the alarm or the Retry button. What the person changed in
// that time still applies: a page the webhook would not send now (the filter, a skipped site, "Send on every page load"
// turned off) is let go instead of being sent. Settings that cannot be read are not "the webhook is off": the held
// deliveries wait for the next run. And the record of deliveries never names a page that History is told to keep out.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const WebhookBody = require('../modules/core/webhook-body.js');
const WebhookRetry = require('../modules/core/webhook-retry.js');

const plain = (value) => JSON.parse(JSON.stringify(value));
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const det = (name, category, confidence) => ({ detector: { name }, category, confidence });
const FOUND = [det('Cloudflare', 'Anti-Bot', 90)];
const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 21, 12);
const PAGE = { url: 'https://shop.example/cart?id=1', title: 'Cart' };

function harness(initial, { history = {} } = {}) {
  const clock = { t: T0 };
  const local = {}, sessionStore = {}, alarms = new Map(), calls = [];
  let webhook = { ...initial };
  let historySettings = { ...history };
  let unreadable = false;
  let listFails = false;
  const skipped = new Set();
  let respond = () => ({ ok: true, status: 200 });
  class FakeDate extends Date { constructor(...args) { if (args.length) super(...args); else super(clock.t); } static now() { return clock.t; } }
  const area = (store) => ({
    async get(key) { await Promise.resolve(); return key in store ? { [key]: JSON.parse(JSON.stringify(store[key])) } : {}; },
    async set(values) { await Promise.resolve(); for (const [k, v] of Object.entries(values)) store[k] = JSON.parse(JSON.stringify(v)); },
    async remove(key) { await Promise.resolve(); delete store[key]; }
  });
  const settingsNow = () => ({ webhook, history: historySettings });
  const context = vm.createContext({
    WebhookBody, URL, URLSearchParams, FormData, console, Date: FakeDate, JSON, Math, Promise,
    Logger: { network() {}, warn() {}, error() {}, ui() {}, debug() {} },
    UrlUtils: { getFaviconUrl: (h) => `https://icons.example/${h}.png` },
    // What the worker has: Utils.getSettings answers {} when the settings cannot be read, StorageManager.readSettingsStrict throws
    Utils: {
      getSettings: async () => (unreadable ? {} : settingsNow()),
      // Like Utils.isUrlBlacklisted: a read of the skip list that fails answers "skipped" for a caller that asks to fail closed
      isUrlBlacklisted: async (url, options = {}) => (listFails ? options.failClosed === true : skipped.has(new URL(url).hostname))
    },
    StorageManager: { readSettingsStrict: async () => { if (unreadable) throw new Error('Stored settings are invalid'); return settingsNow(); } },
    chrome: {
      storage: { local: area(local), session: area(sessionStore) },
      alarms: { create: (name, info) => alarms.set(name, info), clear: async (name) => alarms.delete(name) }
    },
    fetch: async (url, options) => { calls.push({ url, options, at: clock.t }); const result = respond(url, options); if (result instanceof Error) throw result; return result; }
  });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/webhook-filter.js', 'modules/core/webhook-log.js',
    'modules/core/webhook-retry.js', 'modules/settings/settings-runtime.js', 'modules/settings/webhook-runtime.js']) vm.runInContext(read(file), context);
  const runtime = context.SettingsRuntime;
  return {
    runtime, context, calls, alarms, clock,
    log: () => JSON.parse(JSON.stringify(local[runtime.WEBHOOK_LOG_KEY] || [])),
    held: () => JSON.parse(JSON.stringify(sessionStore[runtime.WEBHOOK_HELD_KEY] || {})),
    set: (next) => { webhook = { ...webhook, ...next }; },
    setHistory: (next) => { historySettings = { ...historySettings, ...next }; },
    skip: (host) => skipped.add(host),
    unreadable: (value) => { unreadable = value; },
    listFails: (value) => { listFails = value; },
    reply: (fn) => { respond = fn; },
    advance: (ms) => { clock.t += ms; }
  };
}

const ON = { enableWebhook: true, webhookUrl: 'https://hooks.example/SYNTHETIC_TOKEN', webhookMethod: 'POST', webhookContentType: 'application/json',
  webhookPayload: WebhookBody.DEFAULT_TEMPLATE, webhookHeaders: [] };

/** The delivery of PAGE fails with a 503 and is held for an automatic retry in a minute. */
async function failedAndHeld(h, extra = {}, options) {
  h.reply(() => ({ ok: false, status: 503 }));
  await h.runtime.sendWebhookIfEnabled(PAGE, FOUND, options);
  const [id] = Object.keys(h.held());
  assert.ok(id, 'the failed delivery is held');
  h.reply(() => ({ ok: true, status: 200 }));
  return id;
}

// ---------------------------------------------------------------- W1: what the person changed while it was held

test('narrowing "Send only when" after a delivery is held lets it go at the automatic retry: nothing is sent, and the record says why', async () => {
  const narrowed = [
    [{ webhookDomains: ['other.example'] }, 'site'],
    [{ webhookCategories: ['captcha'] }, 'category'],
    [{ webhookMinConfidence: 95 }, 'confidence']
  ];
  for (const [filter, reason] of narrowed) {
    const h = harness(ON);
    await failedAndHeld(h);
    h.set(filter);
    h.advance(MIN + 1000);
    await h.runtime.runDueWebhookRetries();
    assert.equal(h.calls.length, 1, `${reason}: only the first attempt reached the endpoint`);
    assert.deepEqual(h.held(), {}, `${reason}: it is not held any more`);
    assert.equal(h.alarms.has('scrapfly-webhook-retry'), false, `${reason}: no alarm is left for it`);
    const last = h.log().at(-1);
    assert.deepEqual([last.outcome, last.reason, last.trigger, last.page], ['skipped', reason, 'retry', 'shop.example'], reason);
  }
});

test('a page that still passes the filter is retried and sent as before', async () => {
  const h = harness({ ...ON, webhookDomains: ['shop.example'], webhookCategories: ['antibot'], webhookMinConfidence: 80 });
  await failedAndHeld(h);
  h.advance(MIN + 1000);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.calls.length, 2, 'the retry went out');
  assert.deepEqual(h.held(), {});
  assert.deepEqual(h.log().at(-1), { ...h.log().at(-1), outcome: 'sent', trigger: 'retry' });
});

test('adding the site to the skipped sites after a delivery is held lets it go: nothing is sent, and no line names the site', async () => {
  const h = harness(ON);
  await failedAndHeld(h);
  h.skip('shop.example');
  h.advance(MIN + 1000);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.held(), {});
  const lines = h.log();
  assert.equal(lines.length, 1, 'only the line of the first attempt: a skipped site gets no new line');
  assert.equal(lines[0].outcome, 'failed');
});

test('a delivery held for a cached page is let go once "Send on every page load" is off; one held for a scan is not affected', async () => {
  const cached = harness({ ...ON, webhookOnCache: true });
  const id = await failedAndHeld(cached, {}, { trigger: 'cache' });
  assert.equal(cached.held()[id].trigger, 'cache', 'the hold knows what it was for');
  cached.set({ webhookOnCache: false });
  cached.advance(MIN + 1000);
  await cached.runtime.runDueWebhookRetries();
  assert.equal(cached.calls.length, 1);
  assert.deepEqual(cached.held(), {});
  const last = cached.log().at(-1);
  assert.deepEqual([last.outcome, last.trigger, last.page], ['skipped', 'retry', 'shop.example']);

  const scanned = harness({ ...ON, webhookOnCache: true });
  const sid = await failedAndHeld(scanned, {}, { trigger: 'scan' });
  assert.equal(scanned.held()[sid].trigger, 'scan');
  scanned.set({ webhookOnCache: false });
  scanned.advance(MIN + 1000);
  await scanned.runtime.runDueWebhookRetries();
  assert.equal(scanned.calls.length, 2, 'a scanned page does not depend on that switch');
  assert.deepEqual(scanned.held(), {});
});

test('the trigger stays with a delivery that fails again, so the check still applies to its later retries', async () => {
  const h = harness({ ...ON, webhookOnCache: true });
  const id = await failedAndHeld(h, {}, { trigger: 'cache' });
  h.reply(() => ({ ok: false, status: 503 }));
  h.advance(MIN + 1000);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.calls.length, 2);
  assert.equal(h.held()[id].trigger, 'cache');
  assert.equal(h.held()[id].attempts, 2);
  h.set({ webhookOnCache: false });
  h.advance(5 * MIN + 1000);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.calls.length, 2, 'the second retry is not sent');
  assert.deepEqual(h.held(), {});
});

test('the Retry button follows the same rules: a delivery the webhook would not send now is let go, not sent', async () => {
  const h = harness(ON);
  const id = await failedAndHeld(h);
  h.set({ webhookDomains: ['other.example'] });
  assert.deepEqual(plain(await h.runtime.retryWebhook(id, { manual: true })), { status: 'gone' });
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.held(), {});

  const skippedSite = harness(ON);
  const sid = await failedAndHeld(skippedSite);
  skippedSite.skip('shop.example');
  assert.deepEqual(plain(await skippedSite.runtime.retryWebhook(sid, { manual: true })), { status: 'gone' });
  assert.equal(skippedSite.calls.length, 1);
  assert.deepEqual(skippedSite.held(), {});

  const fine = harness(ON);
  const fid = await failedAndHeld(fine);
  assert.deepEqual(plain(await fine.runtime.retryWebhook(fid, { manual: true })), { status: 'sent' });
});

test('hold() keeps what a delivery was triggered by, and nothing else in its place', () => {
  const ctx = { url: 'https://a.example/', hostname: 'a.example', detections: [] };
  const base = { id: 'a', ctx, first: T0, attempts: 1, due: null };
  assert.equal(WebhookRetry.hold({}, { ...base, trigger: 'cache' }, T0).a.trigger, 'cache');
  assert.equal(WebhookRetry.hold({}, { ...base, trigger: 'scan' }, T0).a.trigger, 'scan');
  for (const odd of [undefined, 'retry', 'test', 7, null, {}]) {
    assert.ok(!('trigger' in WebhookRetry.hold({}, { ...base, trigger: odd }, T0).a), String(odd));
  }
});

// ---------------------------------------------------------------- W1: settings that cannot be read

test('settings that cannot be read at an automatic retry are not "the webhook is off": the delivery stays held and is tried again', async () => {
  const h = harness(ON);
  const id = await failedAndHeld(h);
  h.unreadable(true);
  h.advance(MIN + 1000);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.calls.length, 1, 'nothing is sent while the settings cannot be read');
  assert.ok(h.held()[id], 'and the delivery is still held');
  assert.equal(h.log().length, 1, 'with no new line');
  assert.ok(h.alarms.has('scrapfly-webhook-retry'), 'an alarm is left to look again');
  assert.ok(h.alarms.get('scrapfly-webhook-retry').when > h.clock.t, 'in the future, not at once');

  // the next run, with the settings back: the retry goes out
  h.unreadable(false);
  h.advance(MIN + 1000);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.held(), {});
});

test('unreadable settings do not drop deliveries even when the run is made again and again', async () => {
  const h = harness(ON);
  const id = await failedAndHeld(h);
  h.unreadable(true);
  for (let i = 0; i < 5; i++) { h.advance(MIN); await h.runtime.runDueWebhookRetries(); }
  assert.ok(h.held()[id]);
  assert.equal(h.calls.length, 1);
});

test('a Retry press while the settings cannot be read says it failed (not "off" or "gone") and keeps the delivery', async () => {
  const h = harness(ON);
  const id = await failedAndHeld(h);
  h.unreadable(true);
  assert.deepEqual(plain(await h.runtime.retryWebhook(id, { manual: true })), { status: 'failed' });
  assert.deepEqual(plain(await h.runtime.retryWebhook(id)), { status: 'failed' }, 'an automatic one too');
  assert.ok(h.held()[id]);
  assert.equal(h.calls.length, 1);
  h.unreadable(false);
  assert.deepEqual(plain(await h.runtime.retryWebhook(id, { manual: true })), { status: 'sent' });
});

test('settings that were never saved are a normal read: the webhook is off, and an automatic retry lets the delivery go as before', async () => {
  const h = harness(ON);
  const id = await failedAndHeld(h);
  h.set({ enableWebhook: false });
  h.advance(MIN + 1000);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.held()[id], undefined);
  assert.equal(h.calls.length, 1);
});

// ---------------------------------------------------------------- L1: the record names no page History keeps out

test('a page that is not sent is not named in the record when History keeps it out (an ignored site, or History paused)', async () => {
  const shown = harness({ ...ON, webhookDomains: ['other.example'] });
  await shown.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.deepEqual(shown.log().map(e => [e.outcome, e.reason, e.page]), [['skipped', 'site', 'shop.example']], 'a normal site keeps its line');

  const ignored = harness({ ...ON, webhookDomains: ['other.example'] }, { history: { historyExcludedDomains: ['shop.example'] } });
  await ignored.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.deepEqual(ignored.log(), [], 'an ignored site leaves no line about a page that was not sent');

  const lookalike = harness({ ...ON, webhookDomains: ['other.example'] }, { history: { historyExcludedDomains: ['hop.example'] } });
  await lookalike.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.equal(lookalike.log().length, 1, 'only the site and its subdomains: "hop.example" is not "shop.example"');

  const sibling = harness({ ...ON, webhookDomains: ['other.example'] }, { history: { historyExcludedDomains: ['shop.example'] } });
  await sibling.runtime.sendWebhookIfEnabled({ url: 'https://deep.shop.example/' }, FOUND);
  assert.deepEqual(sibling.log(), [], 'a subdomain of an ignored site is ignored too');

  const paused = harness({ ...ON, webhookDomains: ['other.example'] }, { history: { historyEnabled: false } });
  await paused.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.deepEqual(paused.log(), [], 'with History paused nothing about a page that was not sent is kept');
});

test('a delivery to a page History keeps out is still recorded, as what happened and not where', async () => {
  for (const history of [{ historyExcludedDomains: ['shop.example'] }, { historyEnabled: false }]) {
    const h = harness(ON, { history });
    await h.runtime.sendWebhookIfEnabled(PAGE, FOUND);
    assert.equal(h.calls.length, 1, 'the delivery itself is the webhook\'s business: it is sent');
    const [line] = h.log();
    assert.deepEqual([line.outcome, line.status, line.trigger, line.page], ['sent', 200, 'scan', ''], JSON.stringify(history));
    assert.ok(!JSON.stringify(h.log()).includes('shop.example'), 'no host in the record');
  }
  const normal = harness(ON);
  await normal.runtime.sendWebhookIfEnabled(PAGE, FOUND);
  assert.equal(normal.log()[0].page, 'shop.example');
});

test('a failed delivery to a page History keeps out is held and retried, and its lines carry no host', async () => {
  const h = harness(ON, { history: { historyExcludedDomains: ['shop.example'] } });
  const id = await failedAndHeld(h);
  assert.equal(h.log()[0].page, '');
  assert.equal(h.log()[0].id, id, 'the Retry button still has its delivery');
  h.advance(MIN + 1000);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.log().map(e => [e.outcome, e.trigger, e.page]), [['failed', 'scan', ''], ['sent', 'retry', '']]);
  assert.ok(!JSON.stringify(h.log()).includes('shop.example'));
});

test('a page that is let go at a retry is not named when History keeps it out', async () => {
  const h = harness(ON, { history: { historyExcludedDomains: ['shop.example'] } });
  await failedAndHeld(h);
  h.set({ webhookDomains: ['other.example'] });
  h.advance(MIN + 1000);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.calls.length, 1);
  assert.equal(h.log().length, 1, 'no new line');
  assert.ok(!JSON.stringify(h.log()).includes('shop.example'));
});

test('a held delivery is not sent when the list of skipped sites cannot be read at the retry', async () => {
  const h = harness(ON);
  await failedAndHeld(h);
  h.listFails(true);
  h.advance(MIN + 1000);
  await h.runtime.runDueWebhookRetries();
  assert.equal(h.calls.length, 1, 'nothing more is sent');
});
