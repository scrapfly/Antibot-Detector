const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The protection cookie timeline: which cookies count (the detectors' own rules), what the worker records (name,
// event, time, expiry, length and a salted marker, never a value), the caps and eviction, private windows, the
// worker message, and the line Check Cookies shows.

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const CookieTimeline = require('../modules/core/cookie-timeline.js');
global.CookieTimeline = CookieTimeline;
global.WorkerMessages = require('../modules/core/worker-messages.js');
global.MessageSender = require('../modules/core/message-sender.js');
const CookieTimelineRecorder = require('../background/cookie-timeline.js');

function bundledDetectors() {
  const index = JSON.parse(read('detectors/index.json'));
  const out = {};
  for (const category of ['antibot', 'captcha', 'fingerprint']) {
    out[category] = {};
    for (const id of index[category].detectors) {
      const file = path.join(ROOT, 'detectors', category, `${id}.json`);
      if (fs.existsSync(file)) out[category][id] = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }
  return out;
}

function fakeStorage() {
  const data = {};
  return {
    data,
    async get(key) { return key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {}; },
    async set(items) { Object.assign(data, JSON.parse(JSON.stringify(items))); }
  };
}

function recorder({ detectors = bundledDetectors(), limits, enabled } = {}) {
  let clock = 1_000_000;
  const storage = fakeStorage();
  const rec = CookieTimelineRecorder.createRecorder({
    storage, subtle: globalThis.crypto.subtle, detectors: async () => detectors, enabled,
    now: () => clock, randomSalt: () => 'salt-1', limits, writeDelay: 0
  });
  return { rec, storage, tick: (ms) => { clock += ms; }, now: () => clock };
}

const change = (name, value, { removed = false, cause = 'explicit', domain = '.shop.example.com', storeId = '0', expires } = {}) => ({
  removed, cause, cookie: { name, value, domain, storeId, session: expires === undefined, ...(expires !== undefined ? { expirationDate: expires } : {}) }
});

test('the registrable site of hosts, cookie domains and addresses', () => {
  assert.equal(CookieTimeline.siteOf('.shop.example.com'), 'example.com');
  assert.equal(CookieTimeline.siteOf('www.example.co.uk'), 'example.co.uk');
  assert.equal(CookieTimeline.siteOf('https://a.b.example.com.br/path?q=1'), 'example.com.br');
  assert.equal(CookieTimeline.siteOf('example.com'), 'example.com');
  assert.equal(CookieTimeline.siteOf('192.168.0.10'), '192.168.0.10');
  assert.equal(CookieTimeline.siteOf(''), '');
});

test('the cookies that count come from the loaded detectors, matched as the engine matches them', () => {
  const rules = CookieTimeline.cookieRules(bundledDetectors());
  assert.ok(rules.length > 20, 'the bundled detectors name many protection cookies');
  const counts = CookieTimeline.matcher(rules);
  for (const name of ['_abck', 'bm_sz', 'ak_bmsc', 'cf_clearance', '__cf_bm', 'datadome', 'reese84', '_px3', '_pxhd', 'incap_ses_123_456', 'aws-waf-token']) {
    assert.ok(counts(name), `${name} counts`);
  }
  for (const name of ['sessionid', '_ga', 'theme', 'cf_clearance_x']) assert.ok(!counts(name), `${name} does not count`);
  // No list of names in the module itself: a detector switched off takes its cookies with it
  const detectors = bundledDetectors();
  detectors.antibot['detect-datadome'].enabled = false;
  assert.ok(!CookieTimeline.matcher(CookieTimeline.cookieRules(detectors))('datadome'));
  // Plain, wildcard and case options follow the engine
  const m = CookieTimeline.matcher([{ pattern: 'awswaf*' }, { pattern: 'Exact', caseSensitive: true }, { pattern: '[', regex: true }]);
  assert.ok(m('awswaf_session') && m('Exact') && m('Exactly') && !m('exact') && !m('['));
});

test('the marker is six hex characters of a salted digest: it tells values apart and never holds the value', async () => {
  const subtle = globalThis.crypto.subtle;
  const a = await CookieTimeline.marker('secret-token-value', 'salt-1', subtle);
  assert.match(a, /^[0-9a-f]{6}$/);
  assert.equal(a, await CookieTimeline.marker('secret-token-value', 'salt-1', subtle));
  assert.notEqual(a, await CookieTimeline.marker('secret-token-valuf', 'salt-1', subtle));
  assert.notEqual(a, await CookieTimeline.marker('secret-token-value', 'salt-2', subtle), 'salted per session');
});

test('set, changed, the same value again, the removal half of an overwrite, removed, set again and expired', async () => {
  const { rec, storage, tick } = recorder();
  const expiry = 2_000_000;
  assert.equal(await rec.handle(change('_abck', 'AAAA~0~', { expires: expiry })), 'set');
  tick(1000);
  assert.equal(await rec.handle(change('_abck', 'AAAA~0~', { removed: true, cause: 'overwrite', expires: expiry })), null);
  assert.equal(await rec.handle(change('_abck', 'BBBBBB~-1~', { expires: expiry })), 'changed');
  tick(1000);
  assert.equal(await rec.handle(change('_abck', 'BBBBBB~-1~', { expires: expiry + 60 })), 'refresh');
  tick(1000);
  assert.equal(await rec.handle(change('_abck', 'BBBBBB~-1~', { removed: true, cause: 'explicit' })), 'removed');
  assert.equal(await rec.handle(change('_abck', 'CC', { expires: expiry })), 'set');
  assert.equal(await rec.handle(change('_abck', 'CC', { removed: true, cause: 'expired' })), 'expired');
  assert.equal(await rec.handle(change('_abck', 'DD', { removed: true, cause: 'expired_overwrite' })), 'removed', 'deleted by the site');
  assert.equal(await rec.handle(change('_ga', 'GA1.2.3')), null, 'not a protection cookie');

  const { site, cookies } = await rec.get('https://www.example.com/checkout');
  assert.equal(site, 'example.com');
  assert.deepEqual(Object.keys(cookies), ['_abck']);
  const events = cookies._abck;
  assert.deepEqual(events.map(e => e.e), ['set', 'changed', 'removed', 'set', 'expired', 'removed']);
  assert.equal(events[0].l, 7);
  assert.equal(events[1].x, (expiry + 60) * 1000, 'the same value written again moves the expiry');
  assert.notEqual(events[0].m, events[1].m);

  // storage.session holds names, times and markers only: no value, in any form
  await rec.flush();
  const stored = JSON.stringify(storage.data);
  assert.ok(stored.includes('_abck'));
  for (const value of ['AAAA~0~', 'BBBBBB~-1~', 'GA1.2.3', '_ga']) assert.ok(!stored.includes(value), `${value} is not stored`);
});

test('private windows and a switched-off extension are not recorded', async () => {
  const { rec } = recorder();
  assert.equal(await rec.handle(change('cf_clearance', 'x', { storeId: '1' })), null);
  const off = recorder({ enabled: async () => false });
  assert.equal(await off.rec.handle(change('cf_clearance', 'x')), null);
  assert.deepEqual((await rec.get('https://shop.example.com')).cookies, {});
});

test('caps: events per cookie, cookies per site, and the least recently active site gives way', async () => {
  const limits = { sites: 2, cookiesPerSite: 2, eventsPerCookie: 3 };
  const detectors = { antibot: { d: { name: 'D', detection: { cookie: [{ name: '^c\\d$', nameRegex: true }] } } } };
  const { rec, tick } = recorder({ detectors, limits });
  for (let i = 0; i < 5; i++) { tick(10); await rec.handle(change('c1', `value-${i}`)); }
  let cookies = (await rec.get('https://example.com')).cookies;
  assert.deepEqual(cookies.c1.map(e => e.e), ['changed', 'changed', 'changed'], 'the oldest events fall off');
  tick(10); await rec.handle(change('c2', 'a'));
  tick(10); await rec.handle(change('c1', 'again'));
  tick(10); await rec.handle(change('c3', 'a'));
  cookies = (await rec.get('https://example.com')).cookies;
  assert.deepEqual(Object.keys(cookies).sort(), ['c1', 'c3'], 'the least recently active cookie gives way');

  tick(10); await rec.handle(change('c1', 'a', { domain: 'other.org' }));
  tick(10); await rec.handle(change('c1', 'b', { domain: '.example.com' }));
  tick(10); await rec.handle(change('c1', 'a', { domain: 'third.net' }));
  assert.deepEqual((await rec.get('https://other.org')).cookies, {}, 'the least recently active site was evicted');
  assert.ok((await rec.get('https://example.com')).cookies.c1);
  assert.ok((await rec.get('https://third.net')).cookies.c1);
});

test('the record survives a worker restart through storage.session and starts empty without it', async () => {
  const first = recorder();
  await first.rec.handle(change('datadome', 'abc'));
  await first.rec.flush();
  const again = CookieTimelineRecorder.createRecorder({
    storage: first.storage, subtle: globalThis.crypto.subtle, detectors: async () => bundledDetectors(),
    randomSalt: () => 'other-salt', writeDelay: 0
  });
  assert.equal(await again.handle(change('datadome', 'abc')), 'refresh', 'same salt, same marker');
  assert.deepEqual((await again.get('https://example.com')).cookies.datadome.map(e => e.e), ['set']);
});

test('the worker message is registered by name and answers extension pages only', async () => {
  const registry = {};
  CookieTimelineRecorder.recorder = recorder().rec;
  CookieTimelineRecorder.registerHandlers(registry);
  const handler = registry[WorkerMessages.COOKIE_TIMELINE_GET];
  assert.equal(typeof handler, 'function');
  let answer;
  assert.equal(handler({ request: { url: 'https://example.com' }, sender: { tab: { id: 1 }, url: 'https://evil.test/' }, sendResponse: r => { answer = r; } }), false);
  assert.equal(answer.status, 'error');
  const done = new Promise(resolve => handler({ request: { url: 'https://example.com' }, sender: undefined, sendResponse: resolve }));
  const ok = await done;
  assert.equal(ok.status, 'ok');
  assert.equal(ok.site, 'example.com');
  // Loaded by the worker after its dependencies, never in storage.local or the backups
  const worker = read('background.js');
  assert.ok(worker.indexOf('modules/core/cookie-timeline.js') < worker.indexOf('background/cookie-timeline.js'));
  assert.doesNotMatch(read('background/cookie-timeline.js'), /chrome\.storage\.local/);
  assert.match(read('background/init.js'), /CookieTimelineRecorder\.init\(\)/);
});

test('summaries: the current life, an ended one, and relative times in the person\'s language', () => {
  const live = CookieTimeline.summarize([
    { e: 'set', t: 0, x: 10_000_000, l: 4, m: 'aaaaaa' }, { e: 'changed', t: 1000, x: 10_000_000, l: 4, m: 'bbbbbb' },
    { e: 'changed', t: 5000, x: 9_000_000, l: 4, m: 'cccccc' }
  ]);
  assert.deepEqual([live.state, live.setAt, live.changes, live.lastChangeAt, live.expiresAt], ['live', 0, 2, 5000, 9_000_000]);
  const ended = CookieTimeline.summarize([{ e: 'set', t: 0, x: null }, { e: 'changed', t: 10, x: null }, { e: 'expired', t: 50 }]);
  assert.deepEqual([ended.state, ended.setAt, ended.changes, ended.endedAt], ['expired', 0, 1, 50]);
  assert.equal(CookieTimeline.summarize([]).state, 'none');
  assert.equal(CookieTimeline.relative(-4 * 60_000, 'en'), '4 min. ago');
  assert.equal(CookieTimeline.relative(3_600_000, 'en'), 'in 1 hr.');
  assert.equal(CookieTimeline.relative(-40_000, 'en'), '40 sec. ago');
  assert.match(CookieTimeline.relative(-4 * 60_000, 'es'), /hace 4 min/);
});

function loadPopup(locale = 'en') {
  const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
  const FormatUtils = require('../utils/format-utils');
  const context = { window: {}, document: { querySelector: () => null }, console, URL, Intl, Date, FormatUtils,
    Logger: { ui() {}, debug() {}, network() {}, error() {} }, AdvancedUtils: { escapeHtml: FormatUtils.escapeHtml },
    I18n: { get: key => messages[key]?.message || '', locale: () => locale.replace('_', '-'),
      format: (key, ...args) => args.reduce((text, arg, i) => text.replaceAll('{' + i + '}', String(arg)), messages[key]?.message || '') },
    NotificationHelper: { error() {} }, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(read('modules/core/cookie-timeline.js'), context);
  vm.runInContext(`${read('sections/advanced/base-advanced-module.js')}\nthis.BaseAdvancedModule = BaseAdvancedModule;`, context);
  for (const file of ['sections/advanced/components/dialogs.js', 'sections/advanced/components/cookie-results.js']) vm.runInContext(read(file), context);
  return context.BaseAdvancedModule;
}

test('Check Cookies: the summary line, the folded timeline, the empty state and cookies recorded earlier', () => {
  const K = loadPopup();
  const now = 10 * 3_600_000;
  const events = [
    { e: 'set', t: now - 4 * 60_000, x: now + 3_600_000, l: 120, m: 'a1b2c3' },
    { e: 'changed', t: now - 3 * 60_000, x: now + 3_600_000, l: 121, m: 'd4e5f6' },
    { e: 'changed', t: now - 2 * 60_000, x: now + 3_600_000, l: 121, m: '0a0b0c' },
    { e: 'changed', t: now - 40_000, x: now + 3_600_000, l: 122, m: '112233' }
  ];
  assert.equal(K.cookieTimelineSummary(events, now), 'set 4 min. ago · changed 3 times · last change 40 sec. ago · expires in 1 hr.');
  assert.equal(K.cookieTimelineSummary([{ e: 'set', t: now - 1000, x: null, l: 1, m: 'aaaaaa' }], now), 'set 1 sec. ago · session cookie');
  assert.equal(K.cookieTimelineSummary([events[0], { e: 'removed', t: now - 1000 }], now), 'removed 1 sec. ago · set 4 min. ago');

  const block = K.cookieTimelineBlock(events, now);
  assert.match(block, /<details class="adv-cookie-timeline-details">/);
  assert.equal((block.match(/adv-cookie-timeline-event /g) || []).length, 4);
  assert.ok(block.indexOf('112233') < block.indexOf('a1b2c3'), 'newest first');
  assert.match(K.cookieTimelineBlock([], now), /Recording starts when the page sets the cookie/);

  const result = { vendor: 'Akamai', total: 2, expected: ['_abck', 'bm_sz'], missing: ['bm_sz'],
    cookies: [{ name: '_abck', value: 'v', domain: '.example.com', path: '/', expires: null }] };
  const timeline = { now, cookies: { _abck: events, bm_sz: [{ e: 'set', t: now - 9000, x: null, l: 3, m: 'ffffff' }, { e: 'expired', t: now - 1000 }], other: [{ e: 'set', t: now, x: null, l: 1, m: 'eeeeee' }] } };
  const body = K.cookieResultsBody(result, timeline);
  assert.match(body, /changed 3 times/);
  assert.match(body, /Recorded earlier/);
  assert.match(body, /expired 1 sec\. ago/);
  assert.doesNotMatch(body, />other</, 'only the vendor\'s cookies are listed');
  // Without a timeline (a saved result from History) nothing of it shows
  assert.doesNotMatch(K.cookieResultsBody(result), /adv-cookie-timeline/);
  // A cookie found with nothing recorded shows when recording starts
  assert.match(K.cookieResultsBody(result, { now, cookies: {} }), /Recording starts/);
});

test('Check Cookies reads the timeline by name, never saves it with the result, and every language has the texts', () => {
  const source = read('sections/advanced/components/cookie-results.js');
  assert.match(source, /type: WorkerMessages\.COOKIE_TIMELINE_GET/);
  assert.match(source, /saveToolResult\(\{ \.\.\.result,/, 'the saved result is the one without the timeline');
  const K = loadPopup('de');
  const line = K.cookieTimelineSummary([{ e: 'set', t: 0, x: 3_600_000, l: 1, m: 'aaaaaa' }], 60_000);
  assert.match(line, /^gesetzt vor 1 Min\. · läuft ab in 59 Min\.$/);
});
