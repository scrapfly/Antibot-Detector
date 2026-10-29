const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// What History records, and how: the rules of Settings → History → "What History saves"
// (pause, private windows, ignored sites, minimum confidence, fingerprint-only),
// updating an earlier entry, the "Changed" mark and its alerts, and the storage warning.
// The real worker files run in a vm context, like the extension's service worker.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const HOUR = 3600000;
const START = Date.UTC(2026, 9, 19, 9, 0, 0);

const antibot = (name, confidence = 90) => ({ detector: { name }, category: 'Anti-Bot', confidence });
const captcha = (name, confidence = 90) => ({ detector: { name }, category: 'CAPTCHA', confidence });
const fingerprint = (name, confidence = 40) => ({ detector: { name }, category: 'Fingerprint', confidence });

function makeWorld(options = {}) {
  const store = {};
  const notes = [];
  const clock = { t: START };
  const tabs = new Map();
  let windows = [];
  const storage = {
    get: async (keys) => Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, store[k]])),
    set: async (obj) => { Object.assign(store, obj); },
    remove: async (keys) => { for (const k of [].concat(keys)) delete store[k]; }
  };
  class FakeDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(clock.t); }
    static now() { return clock.t; }
  }
  const settingsState = { notificationsEnabled: true };
  const sw = {
    console, setTimeout, clearTimeout, JSON, Promise, Math, Set, Map, URL, Date: FakeDate,
    Logger: new Proxy({}, { get: () => () => {} }),
    Utils: {
      getHistorySettings: async () => ({ historyEnabled: true, historyLimit: 0, preventDuplicates: false, ...options.settings }),
      getSettings: async () => settingsState,
      getCacheScope: async () => 'domain'
    },
    UrlUtils: { normalizeFaviconForStorage: (f) => f || '', getHostnameFromUrl: (u) => { try { return new URL(u).hostname; } catch (_) { return ''; } } },
    FormatUtils: { convertToMilliseconds: (n, unit) => n * ({ minutes: 60000, hours: HOUR, days: 24 * HOUR }[unit] || 0) },
    chrome: {
      storage: { local: storage },
      runtime: { getURL: (p) => `chrome-extension://abc/${p}` },
      tabs: { get: async (id) => { if (!tabs.has(id)) throw new Error('No tab'); return tabs.get(id); } },
      windows: { getAll: async () => windows },
      notifications: { create: (id, opts) => notes.push({ id, ...opts }) }
    }
  };
  sw.self = sw; sw.globalThis = sw;
  vm.createContext(sw);
  vm.runInContext(read('modules/core/history-store.js'), sw);
  vm.runInContext(read('modules/core/categories.js'), sw);
  vm.runInContext(read('modules/core/domain-list.js'), sw);
  vm.runInContext(read('modules/core/history-policy.js'), sw);
  vm.runInContext(read('background/history-recorder.js') + '\n;globalThis.HistoryRecorder = HistoryRecorder;', sw);

  const items = () => JSON.parse(store.scrapfly_history || '{"items":[]}').items;
  const save = (url, detections, settings = {}, tabId = 1, extra = {}) => {
    let host = '';
    try { host = new URL(url).hostname; } catch (_) { /* leave empty */ }
    if (!tabs.has(tabId) && !options.closedTabs) tabs.set(tabId, { id: tabId, url, title: `Title of ${host}`, incognito: false });
    return sw.HistoryRecorder.saveDetectionToHistory(tabId, { url, hostname: host, title: host },
      detections, sw.chrome, { source: 'test', ...extra, historySettings: { historyEnabled: true, historyLimit: 0, preventDuplicates: false, ...settings } });
  };
  return {
    sw, store, notes, items, save, clock, tabs,
    advance: (ms) => { clock.t += ms; },
    setWindows: (w) => { windows = w; },
    settingsState
  };
}

test('a page with detections is recorded with its address, title and protections', async () => {
  const w = makeWorld();
  assert.strictEqual(await w.save('https://shop.example.com/a?x=1', [antibot('Cloudflare'), captcha('reCAPTCHA')]), true);
  const [item] = w.items();
  assert.strictEqual(item.url, 'https://shop.example.com/a?x=1');
  assert.strictEqual(item.hostname, 'shop.example.com');
  assert.strictEqual(item.title, 'Title of shop.example.com');
  assert.strictEqual(item.detectionCount, 2);
  assert.deepStrictEqual(item.categories.sort(), ['Anti-Bot', 'CAPTCHA']);
  assert.ok(item.id.startsWith('detection_'));
  assert.ok(!('changed' in item) && !('pinned' in item));
});

test('Pause History: nothing is recorded while the master switch is off', async () => {
  const w = makeWorld();
  assert.strictEqual(await w.save('https://a.com/', [antibot('A')], { historyEnabled: false }), false);
  assert.deepStrictEqual(w.items(), []);
  assert.strictEqual(await w.save('https://a.com/', [antibot('A')], { historyEnabled: true }), true);
});

test('private windows are skipped by default and recorded when Settings allows it', async () => {
  const w = makeWorld();
  w.tabs.set(7, { id: 7, url: 'https://secret.example/', title: 'S', incognito: true });
  assert.strictEqual(await w.save('https://secret.example/', [antibot('A')], {}, 7), false);
  assert.strictEqual(await w.save('https://secret.example/', [antibot('A')], { historySkipIncognito: true }, 7), false);
  assert.deepStrictEqual(w.items(), []);
  assert.strictEqual(await w.save('https://secret.example/', [antibot('A')], { historySkipIncognito: false }, 7), true);
  assert.strictEqual(w.items().length, 1);
  // A normal tab is always recorded
  w.tabs.set(8, { id: 8, url: 'https://open.example/', title: 'O', incognito: false });
  assert.strictEqual(await w.save('https://open.example/', [antibot('A')], { historySkipIncognito: true }, 8), true);
});

test('a tab that closed mid-scan counts as private only while a private window is open', async () => {
  const w = makeWorld({ closedTabs: true });
  w.setWindows([{ id: 1, incognito: false }, { id: 2, incognito: true }]);
  assert.strictEqual(await w.save('https://gone.example/', [antibot('A')], {}, 99), false, 'it may have been a private tab');
  w.setWindows([{ id: 1, incognito: false }]);
  assert.strictEqual(await w.save('https://gone.example/', [antibot('A')], {}, 99), true);
  w.setWindows([{ id: 2, incognito: true }]);
  assert.strictEqual(await w.save('https://gone2.example/', [antibot('A')], { historySkipIncognito: false }, 99), true, 'unless private pages are allowed');
});

test('ignored sites, and their subdomains, are not recorded', async () => {
  const w = makeWorld();
  const s = { historyExcludedDomains: ['bank.com', 'intranet.local'] };
  assert.strictEqual(await w.save('https://bank.com/', [antibot('A')], s), false);
  assert.strictEqual(await w.save('https://login.bank.com/x', [antibot('A')], s), false);
  assert.strictEqual(await w.save('https://wiki.intranet.local/', [antibot('A')], s), false);
  assert.strictEqual(await w.save('https://bank.com.evil.io/', [antibot('A')], s), true);
  assert.strictEqual(await w.save('https://notbank.com/', [antibot('A')], s), true);
  assert.deepStrictEqual(w.items().map(i => i.hostname), ['notbank.com', 'bank.com.evil.io']);
});

test('minimum confidence: a page whose strongest detection is below it is not recorded', async () => {
  const w = makeWorld();
  const s = { historyMinConfidence: 60 };
  assert.strictEqual(await w.save('https://weak.com/', [antibot('A', 30), captcha('C', 59)], s), false);
  assert.strictEqual(await w.save('https://exact.com/', [antibot('A', 30), captcha('C', 60)], s), true);
  assert.strictEqual(await w.save('https://strong.com/', [antibot('A', 95)], s), true);
  assert.deepStrictEqual(w.items().map(i => i.hostname), ['strong.com', 'exact.com']);
});

test('skip fingerprint-only pages: a page with an anti-bot or CAPTCHA is still recorded', async () => {
  const w = makeWorld();
  const s = { historySkipFingerprintOnly: true };
  assert.strictEqual(await w.save('https://fp.com/', [fingerprint('Canvas'), fingerprint('WebGL')], s), false);
  assert.strictEqual(await w.save('https://mixed.com/', [fingerprint('Canvas'), captcha('hCaptcha', 20)], s), true);
  assert.strictEqual(await w.save('https://fp.com/', [fingerprint('Canvas')], {}), true, 'off by default');
});

test('duplicate action "update": the earlier entry is refreshed, moved to the top and keeps its pin and note', async () => {
  const w = makeWorld();
  const s = { preventDuplicates: true, duplicateScope: 'full_url', duplicateDuration: 1, duplicateUnit: 'hours', duplicateAction: 'update' };
  await w.save('https://a.com/', [antibot('Cloudflare')], s);
  w.advance(1000);
  await w.save('https://b.com/', [antibot('Akamai')], s);
  const first = w.items()[1];
  // Pin and annotate the older entry the way the History tab does
  const stored = JSON.parse(w.store.scrapfly_history);
  stored.items[1].pinned = true;
  stored.items[1].note = 'watch this';
  w.store.scrapfly_history = JSON.stringify(stored);

  w.advance(10 * 60000);
  assert.strictEqual(await w.sw.HistoryRecorder.shouldSaveToHistory('https://a.com/', s, w.sw.chrome), true, 'not blocked up front');
  assert.strictEqual(await w.save('https://a.com/', [antibot('Cloudflare'), captcha('Turnstile')], s), true);

  const items = w.items();
  assert.strictEqual(items.length, 2, 'no second entry for the same page');
  assert.strictEqual(items[0].hostname, 'a.com', 'moved to the top');
  assert.strictEqual(items[0].id, first.id);
  assert.strictEqual(items[0].firstSeen, first.timestamp, 'the first-seen date is kept');
  assert.strictEqual(items[0].timestamp, START + 1000 + 10 * 60000);
  assert.strictEqual(items[0].pinned, true);
  assert.strictEqual(items[0].note, 'watch this');
  assert.strictEqual(items[0].detections.length, 2, 'the new scan replaced the old one');
});

test('duplicate action "skip" (the default) leaves the earlier entry untouched', async () => {
  const w = makeWorld();
  const s = { preventDuplicates: true, duplicateScope: 'full_url', duplicateDuration: 1, duplicateUnit: 'hours', duplicateAction: 'skip' };
  await w.save('https://a.com/', [antibot('Cloudflare')], s);
  w.advance(1000);
  assert.strictEqual(await w.save('https://a.com/', [antibot('Cloudflare'), captcha('Turnstile')], s), false);
  assert.strictEqual(w.items().length, 1);
  assert.strictEqual(w.items()[0].detections.length, 1);
  w.advance(2 * HOUR);
  assert.strictEqual(await w.save('https://a.com/', [antibot('Cloudflare')], s), true, 'outside the window it is a new entry');
});

test('an updated entry whose protections differ is marked Changed', async () => {
  const w = makeWorld();
  const s = { preventDuplicates: true, duplicateScope: 'full_url', duplicateDuration: 1, duplicateUnit: 'days', duplicateAction: 'update' };
  await w.save('https://a.com/', [antibot('Cloudflare'), fingerprint('Canvas')], s);
  assert.ok(!('changed' in w.items()[0]), 'the first scan has nothing to compare with');
  w.advance(HOUR);
  await w.save('https://a.com/', [antibot('Cloudflare'), fingerprint('WebGL')], s);
  assert.ok(!('changed' in w.items()[0]), 'fingerprinting changes do not count');
  w.advance(HOUR);
  await w.save('https://a.com/', [antibot('DataDome'), captcha('reCAPTCHA')], s);
  assert.deepStrictEqual(w.items()[0].changed, { at: START + 2 * HOUR, added: ['DataDome', 'reCAPTCHA'], removed: ['Cloudflare'] });
  w.advance(HOUR);
  await w.save('https://a.com/', [antibot('DataDome'), captcha('reCAPTCHA')], s);
  assert.deepStrictEqual(w.items()[0].changed.added, ['DataDome', 'reCAPTCHA'], 'the mark stays while the page stays as it changed');
  w.advance(HOUR);
  await w.save('https://a.com/', [antibot('Cloudflare')], s);
  assert.deepStrictEqual(w.items()[0].changed.removed, ['DataDome', 'reCAPTCHA'], 'another scan agreed with the change: going back is a change of its own, not a blip');
  assert.strictEqual(w.items().length, 1);
});

test('updated in place: a change the very next scan undoes was a blip, one confirmed or days old was not', async () => {
  const s = { preventDuplicates: true, duplicateScope: 'full_url', duplicateDuration: 30, duplicateUnit: 'days', duplicateAction: 'update' };
  const blip = makeWorld();
  await blip.save('https://a.com/', [antibot('Cloudflare')], s);
  blip.advance(HOUR);
  await blip.save('https://a.com/', [antibot('Cloudflare'), captcha('reCAPTCHA')], s);
  assert.deepStrictEqual(blip.items()[0].changed.added, ['reCAPTCHA']);
  blip.advance(HOUR);
  await blip.save('https://a.com/', [antibot('Cloudflare')], s);
  assert.ok(!('changed' in blip.items()[0]), 'gone on the next scan: a blip, no mark');
  const days = makeWorld();
  await days.save('https://a.com/', [antibot('Cloudflare')], s);
  days.advance(HOUR);
  await days.save('https://a.com/', [antibot('Cloudflare'), captcha('reCAPTCHA')], s);
  days.advance(7 * 24 * HOUR);
  await days.save('https://a.com/', [antibot('Cloudflare')], s);
  assert.deepStrictEqual(days.items()[0].changed.removed, ['reCAPTCHA'], 'a week later it is a removal, reported');
});

test('a mark confirmed by scans that found nothing new keeps its meaning when the protection comes back', async () => {
  const w = makeWorld();
  await w.save('https://gone.example/', [antibot('Cloudflare')]);
  w.advance(HOUR);
  await w.save('https://gone.example/', [], {}, 1, { onlyIfChanged: true });
  assert.deepStrictEqual(w.items()[0].changed.removed, ['Cloudflare']);
  for (let i = 0; i < 2; i++) { // two more clean scans: nothing new to record, but they agree with the removal
    w.advance(HOUR);
    await w.save('https://gone.example/', [], {}, 1, { onlyIfChanged: true });
  }
  assert.strictEqual(w.items().length, 2, 'a clean scan equal to the last is not recorded');
  assert.strictEqual(w.items()[0].changed.seen, 2, 'but the mark knows it was confirmed');
  w.advance(HOUR);
  await w.save('https://gone.example/', [antibot('Cloudflare')]);
  assert.deepStrictEqual(w.items().map(item => 'changed' in item), [true, true, false], 'the removal stays marked and the return is a change too');
});

test('a "domain" duplicate of another page is not compared with this one, and its mark does not stay on the new page', async () => {
  const w = makeWorld();
  const s = { preventDuplicates: true, duplicateScope: 'domain', duplicateDuration: 1, duplicateUnit: 'days', duplicateAction: 'update', historyChangeAlerts: 'all' };
  await w.save('https://a.com/home', [antibot('Cloudflare')], s);
  w.advance(HOUR);
  await w.save('https://a.com/checkout', [antibot('Cloudflare'), captcha('reCAPTCHA')], s);
  assert.strictEqual(w.items().length, 1, 'updated in place');
  assert.ok(!('changed' in w.items()[0]), 'two pages of a site are not a change');
  assert.deepStrictEqual(w.notes, []);
});

test('alerts for pinned pages follow the page: a later copy of a pinned address still alerts', async () => {
  const w = makeWorld();
  const s = { historyChangeAlerts: 'pinned' };
  await w.save('https://watch.example.com/', [antibot('Cloudflare')], s);
  const stored = JSON.parse(w.store.scrapfly_history);
  stored.items[0].pinned = true;
  w.store.scrapfly_history = JSON.stringify(stored);
  w.advance(HOUR);
  await w.save('https://watch.example.com/', [antibot('Cloudflare')], s); // a new, unpinned copy
  assert.ok(!('pinned' in w.items()[0]) || w.items()[0].pinned !== true);
  w.advance(HOUR);
  await w.save('https://watch.example.com/', [antibot('Cloudflare'), captcha('reCAPTCHA')], s);
  assert.strictEqual(w.notes.length, 1, 'the page is pinned through its older copy');
});

test('updated in place: a cached result never replaces what a scan of the page found, and is never compared', async () => {
  const w = makeWorld();
  const s = { preventDuplicates: true, duplicateScope: 'full_url', duplicateDuration: 1, duplicateUnit: 'days', duplicateAction: 'update' };
  await w.save('https://b.com/p', [antibot('Akamai')], s);
  w.advance(HOUR);
  await w.save('https://b.com/p', [antibot('Cloudflare')], s, 1, { fromCache: true });
  assert.deepStrictEqual(w.items()[0].detections.map(d => d.detector.name), ['Akamai'], 'the scan of the page stays');
  assert.ok(!('changed' in w.items()[0]) && !w.items()[0].fromCache);
  assert.strictEqual(w.items()[0].timestamp, START + HOUR, 'seen again');
  assert.strictEqual(w.items()[0].firstSeen, START, 'the first-seen date is kept');
});

test('a new entry for a page seen before is marked Changed too (no duplicate prevention), ignoring the query string', async () => {
  const w = makeWorld();
  await w.save('https://a.com/p?v=1', [antibot('Cloudflare')]);
  w.advance(HOUR);
  await w.save('https://a.com/p?v=2', [antibot('Akamai')]);
  const [newest, oldest] = w.items();
  assert.deepStrictEqual(newest.changed, { at: START + HOUR, added: ['Akamai'], removed: ['Cloudflare'] });
  assert.ok(!('changed' in oldest));
  w.advance(HOUR);
  await w.save('https://other.com/', [antibot('Akamai')]);
  assert.ok(!('changed' in w.items()[0]), 'another page is not compared');
});

async function scanTwice(w, settings, { pinFirst = false } = {}) {
  await w.save('https://watch.example.com/', [antibot('Cloudflare')], settings);
  if (pinFirst) {
    const stored = JSON.parse(w.store.scrapfly_history);
    stored.items[0].pinned = true;
    w.store.scrapfly_history = JSON.stringify(stored);
  }
  w.advance(HOUR);
  await w.save('https://watch.example.com/', [antibot('DataDome')], settings);
}

test('change alerts off: no notification', async () => {
  const w = makeWorld();
  await scanTwice(w, { historyChangeAlerts: 'off' });
  assert.deepStrictEqual(w.notes, []);
});

test('change alerts for all pages: one notification naming the site and what changed', async () => {
  const w = makeWorld();
  await scanTwice(w, { historyChangeAlerts: 'all' });
  assert.strictEqual(w.notes.length, 1);
  assert.strictEqual(w.notes[0].title, 'Protections changed on watch.example.com');
  assert.strictEqual(w.notes[0].message, 'Added: DataDome. Removed: Cloudflare');
  assert.strictEqual(w.notes[0].type, 'basic');
});

test('change alerts for pinned pages only', async () => {
  const a = makeWorld();
  await scanTwice(a, { historyChangeAlerts: 'pinned' });
  assert.deepStrictEqual(a.notes, [], 'not pinned: silent');
  const b = makeWorld();
  await scanTwice(b, { historyChangeAlerts: 'pinned' }, { pinFirst: true });
  assert.strictEqual(b.notes.length, 1, 'pinned: alert');
});

test('no alert for a first scan, an unchanged page, or when notifications are off', async () => {
  const first = makeWorld();
  await first.save('https://new.example.com/', [antibot('Cloudflare')], { historyChangeAlerts: 'all' });
  assert.deepStrictEqual(first.notes, []);
  const same = makeWorld();
  await same.save('https://same.example.com/', [antibot('Cloudflare')], { historyChangeAlerts: 'all' });
  same.advance(HOUR);
  await same.save('https://same.example.com/', [antibot('Cloudflare')], { historyChangeAlerts: 'all' });
  assert.deepStrictEqual(same.notes, []);
  const off = makeWorld();
  off.settingsState.notificationsEnabled = false;
  await scanTwice(off, { historyChangeAlerts: 'all' });
  assert.deepStrictEqual(off.notes, []);
  assert.ok(off.items()[0].changed, 'the Changed mark is still recorded');
});

test('the entry limit never counts or removes pinned entries', async () => {
  const w = makeWorld();
  await w.save('https://pin.com/', [antibot('A')]);
  const stored = JSON.parse(w.store.scrapfly_history);
  stored.items[0].pinned = true;
  w.store.scrapfly_history = JSON.stringify(stored);
  for (let i = 0; i < 4; i++) { w.advance(1000); await w.save(`https://n${i}.com/`, [antibot('A')], { historyLimit: 2 }); }
  assert.deepStrictEqual(w.items().map(i => i.hostname), ['n3.com', 'n2.com', 'pin.com']);
});

test('storage warning: once when History nears its limit, again only after it was emptied', async () => {
  const w = makeWorld();
  const R = w.sw.HistoryRecorder;
  const max = w.sw.HistoryStore.MAX_BYTES;
  await R.checkStorage(max * 0.5, 0, w.sw.chrome);
  assert.strictEqual(w.notes.length, 0);
  await R.checkStorage(max * 0.9, 0, w.sw.chrome);
  assert.strictEqual(w.notes.length, 1);
  assert.strictEqual(w.notes[0].id, 'scrapfly-history-storage');
  assert.strictEqual(w.notes[0].title, 'History is almost full');
  await R.checkStorage(max * 0.95, 0, w.sw.chrome);
  assert.strictEqual(w.notes.length, 1, 'already warned');
  await R.checkStorage(max * 0.8, 0, w.sw.chrome);
  assert.strictEqual(w.notes.length, 1, 'between 70% and 90% it neither warns nor resets');
  await R.checkStorage(max * 0.6, 0, w.sw.chrome);
  await R.checkStorage(max * 0.92, 0, w.sw.chrome);
  assert.strictEqual(w.notes.length, 2, 'warns again after dropping under 70%');
});

test('storage warning: entries removed by the size limit warn at once', async () => {
  const w = makeWorld();
  await w.sw.HistoryRecorder.checkStorage(1000, 3, w.sw.chrome);
  assert.strictEqual(w.notes.length, 1);
});

test('storage warning respects notifications being off but still records that it warned', async () => {
  const w = makeWorld();
  w.settingsState.notificationsEnabled = false;
  await w.sw.HistoryRecorder.checkStorage(w.sw.HistoryStore.MAX_BYTES, 0, w.sw.chrome);
  assert.strictEqual(w.notes.length, 0);
  assert.strictEqual(w.store.scrapfly_history_storage_notice.warned, true);
});

// ---- Pages that pin themselves (Settings → History → Pin pages automatically)

const hard = (name, confidence = 90) => ({ ...antibot(name, confidence), difficulty: 'High' });
const HARD = { historyAutoPinHard: true };

test('a page with a hard protection is recorded pinned, marked as pinned by itself; any other page is not', async () => {
  const w = makeWorld();
  await w.save('https://guarded.example/', [hard('Akamai')], HARD);
  await w.save('https://plain.example/', [antibot('Easy')], HARD);
  await w.save('https://off.example/', [hard('Akamai')]);
  const byHost = Object.fromEntries(w.items().map(item => [item.hostname, item]));
  assert.strictEqual(byHost['guarded.example'].pinned, true);
  assert.strictEqual(byHost['guarded.example'].autoPinned, true);
  assert.ok(!('pinned' in byHost['plain.example']) && !('autoPinned' in byHost['plain.example']));
  assert.ok(!('pinned' in byHost['off.example']), 'the rule is off by default');
});

test('a protection the person named pins the page', async () => {
  const w = makeWorld();
  await w.save('https://dd.example/', [antibot('DataDome'), fingerprint('Canvas')], { historyAutoPinVendors: ['datadome'] });
  assert.strictEqual(w.items()[0].pinned, true);
});

test('a scan that updates an entry pins it once, unless the person unpinned it', async () => {
  const w = makeWorld();
  const settings = { ...HARD, preventDuplicates: true, duplicateAction: 'update', duplicateScope: 'full_url', duplicateDuration: 99, duplicateUnit: 'days' };
  await w.save('https://guarded.example/a', [antibot('Easy')], settings);
  assert.ok(!('pinned' in w.items()[0]));
  w.advance(HOUR);
  await w.save('https://guarded.example/a', [hard('Akamai')], settings);
  assert.strictEqual(w.items().length, 1, 'the same entry');
  assert.strictEqual(w.items()[0].pinned, true, 'a later scan found a hard protection');
  assert.strictEqual(w.items()[0].autoPinned, true);

  // The person unpins it: it stays unpinned however hard the page is
  const [kept] = w.items();
  w.store.scrapfly_history = JSON.stringify({ items: [{ ...kept, pinned: undefined, autoPinned: undefined, unpinned: true }] });
  w.advance(HOUR);
  await w.save('https://guarded.example/a', [hard('Akamai')], settings);
  assert.ok(!w.items()[0].pinned, 'never pinned again by itself');
  assert.strictEqual(w.items()[0].unpinned, true);
});

test('with duplicates allowed (the default), a page the person unpinned is not pinned again by its next entries either', async () => {
  const w = makeWorld();
  const settings = { ...HARD, preventDuplicates: false };
  await w.save('https://guarded.example/a', [hard('Akamai')], settings);
  assert.strictEqual(w.items()[0].pinned, true);
  assert.strictEqual(w.items()[0].autoPinned, true);

  // The person unpins it; the next scan makes a new entry, which must not pin itself
  const [kept] = w.items();
  w.store.scrapfly_history = JSON.stringify({ items: [{ ...kept, pinned: undefined, autoPinned: undefined, unpinned: true }] });
  w.advance(HOUR);
  await w.save('https://guarded.example/a', [hard('Akamai')], settings);
  assert.strictEqual(w.items().length, 2, 'a new entry');
  assert.ok(!w.items()[0].pinned, 'the new entry is not pinned by itself');
  assert.strictEqual(w.items()[0].unpinned, true, 'and carries the mark on, as the page\'s newest entry');

  // And the one after it, now that the marked entry is no longer the newest of the page
  w.advance(HOUR);
  await w.save('https://guarded.example/a', [hard('Akamai')], settings);
  assert.strictEqual(w.items().length, 3);
  assert.ok(!w.items()[0].pinned, 'still never pinned by itself');
  assert.strictEqual(w.items()[0].unpinned, true);

  // Another page of the same site is not affected
  await w.save('https://guarded.example/b', [hard('Akamai')], settings);
  assert.strictEqual(w.items()[0].pinned, true, 'a different page still pins itself');
  // And neither is the same path with another query (a different product page, say)
  await w.save('https://guarded.example/a?item=2', [hard('Akamai')], settings);
  assert.strictEqual(w.items()[0].pinned, true, 'a sibling address still pins itself');
});

test('an entry the person pinned keeps its pin, and is not counted as one that pinned itself', async () => {
  const w = makeWorld();
  const settings = { ...HARD, preventDuplicates: true, duplicateAction: 'update', duplicateScope: 'full_url', duplicateDuration: 99, duplicateUnit: 'days' };
  await w.save('https://mine.example/', [antibot('Easy')], settings);
  const [kept] = w.items();
  w.store.scrapfly_history = JSON.stringify({ items: [{ ...kept, pinned: true }] });
  w.advance(HOUR);
  await w.save('https://mine.example/', [hard('Akamai')], settings);
  assert.strictEqual(w.items()[0].pinned, true);
  assert.ok(!('autoPinned' in w.items()[0]), 'still the person\'s own pin');
});

test('at most 50 pages pin themselves: the next one is recorded unpinned, and a page the person pinned does not count', async () => {
  const w = makeWorld();
  const pinned = Array.from({ length: 50 }, (_, i) => ({ id: `old${i}`, url: `https://old${i}.example/`, hostname: `old${i}.example`, title: 'old', timestamp: START - (i + 1) * HOUR, detections: [], pinned: true, autoPinned: true }));
  const mine = { id: 'mine', url: 'https://mine.example/', hostname: 'mine.example', title: 'mine', timestamp: START - 99 * HOUR, detections: [], pinned: true };
  w.store.scrapfly_history = JSON.stringify({ items: [...pinned, mine] });
  assert.strictEqual(w.sw.HistoryPolicy.MAX_AUTO_PINS, 50);
  await w.save('https://one-too-many.example/', [hard('Akamai')], HARD);
  const added = w.items().find(item => item.hostname === 'one-too-many.example');
  assert.ok(added && !('pinned' in added), 'no room: recorded, not pinned');

  // One of them is unpinned: there is room for exactly one more
  const items = w.items().map(item => (item.id === 'old0' ? (({ pinned, autoPinned, ...rest }) => ({ ...rest, unpinned: true }))(item) : item));
  w.store.scrapfly_history = JSON.stringify({ items });
  await w.save('https://room.example/', [hard('Akamai')], HARD);
  await w.save('https://no-more.example/', [hard('Akamai')], HARD);
  const byHost = Object.fromEntries(w.items().map(item => [item.hostname, item]));
  assert.strictEqual(byHost['room.example'].pinned, true);
  assert.ok(!('pinned' in byHost['no-more.example']));
});

test('a page that is not recorded is not pinned either', async () => {
  const w = makeWorld();
  assert.strictEqual(await w.save('https://skip.example/', [hard('Akamai')], { ...HARD, historyEnabled: false }), false);
  assert.deepStrictEqual(w.items(), []);
});

test('storage warning: the share is of the limit the save was written under, not always 6 MB', async () => {
  const w = makeWorld();
  const R = w.sw.HistoryRecorder;
  const MB = 1024 * 1024;
  await R.checkStorage(10 * MB, 0, w.sw.chrome, 25 * MB);
  assert.strictEqual(w.notes.length, 0, '10 of 25 MB is not nearly full');
  await R.checkStorage(23 * MB, 0, w.sw.chrome, 25 * MB);
  assert.strictEqual(w.notes.length, 1, '23 of 25 MB is');
  const other = makeWorld();
  await other.sw.HistoryRecorder.checkStorage(5.8 * MB, 0, other.sw.chrome);
  assert.strictEqual(other.notes.length, 1, 'no limit given: 6 MB');
});

// ---- A watchlist check updates the page it watches

const watched = (id, extra = {}) => ({ id, url: `https://${id}.example/`, hostname: `${id}.example`, title: id, timestamp: START - 5 * HOUR, detections: [antibot('Cloudflare')], pinned: true, watch: true, note: 'keep', ...extra });
function watchWorld(items, settings) {
  const w = makeWorld({ settings });
  w.store.scrapfly_history = JSON.stringify({ items });
  return w;
}

test('an unchanged page only has the time of its check recorded: same entry, same place, nothing else touched', async () => {
  const w = watchWorld([watched('a'), watched('b')], { historyChangeAlerts: 'all' });
  const result = await w.sw.HistoryRecorder.applyWatchResult('b', [antibot('Cloudflare'), fingerprint('Canvas')], w.sw.chrome, START);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { found: true, changed: false });
  const [a, b] = w.items();
  assert.deepStrictEqual(a, watched('a'));
  assert.deepStrictEqual(b, watched('b', { watchedAt: START }), 'fingerprinting is never a change');
  assert.strictEqual(w.notes.length, 0);
});

test('a page that changed takes the new scan in the same entry, moves to the top, is marked Changed and notifies', async () => {
  const w = watchWorld([watched('a'), watched('b', { pinned: true })], { historyChangeAlerts: 'pinned' });
  const fresh = [antibot('DataDome'), antibot('Cloudflare')];
  const result = await w.sw.HistoryRecorder.applyWatchResult('b', fresh, w.sw.chrome, START);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { found: true, changed: true, added: ['DataDome'], removed: [] });
  const items = w.items();
  assert.deepStrictEqual(items.map(i => i.id), ['b', 'a'], 'moved to the top');
  const b = items[0];
  assert.strictEqual(b.timestamp, START);
  assert.strictEqual(b.watchedAt, START);
  assert.strictEqual(b.detectionCount, 2);
  assert.deepStrictEqual(b.categories, ['Anti-Bot']);
  assert.deepStrictEqual({ pinned: b.pinned, watch: b.watch, note: b.note, id: b.id, url: b.url }, { pinned: true, watch: true, note: 'keep', id: 'b', url: 'https://b.example/' }, 'pin, watch and note stay');
  assert.deepStrictEqual(b.changed, { at: START, added: ['DataDome'], removed: [] });
  assert.strictEqual(w.items().length, 2, 'no new entry');
  assert.strictEqual(w.notes.length, 1);
  assert.strictEqual(w.notes[0].title, 'Protections changed on b.example');
});

test('a lost protection is a change too, and alerts follow Settings: off sends nothing but the Changed mark stays', async () => {
  const off = watchWorld([watched('a')], { historyChangeAlerts: 'off' });
  const result = await off.sw.HistoryRecorder.applyWatchResult('a', [], off.sw.chrome, START);
  assert.strictEqual(result.changed, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.removed)), ['Cloudflare']);
  assert.strictEqual(off.notes.length, 0);
  assert.deepStrictEqual(off.items()[0].changed.removed, ['Cloudflare']);
  const all = watchWorld([watched('a')], { historyChangeAlerts: 'all' });
  await all.sw.HistoryRecorder.applyWatchResult('a', [], all.sw.chrome, START);
  assert.strictEqual(all.notes.length, 1);
});

test('a page that is no longer pinned or watched, or no longer there, is left alone', async () => {
  const w = watchWorld([watched('a', { watch: false }), watched('b', { pinned: false })], { historyChangeAlerts: 'all' });
  for (const id of ['a', 'b', 'gone']) {
    const result = await w.sw.HistoryRecorder.applyWatchResult(id, [antibot('Other')], w.sw.chrome, START);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { found: false, changed: false }, id);
  }
  assert.deepStrictEqual(w.items().map(i => i.id), ['a', 'b']);
  assert.strictEqual(w.items()[0].watchedAt, undefined);
  assert.strictEqual(w.notes.length, 0);
});

test('auto-pin pins an address once: sixty visits of a hard page leave one pinned copy and room for other pages', async () => {
  const w = makeWorld();
  const hard = (name) => ({ ...antibot(name, 90), difficulty: 'High' });
  for (let i = 0; i < 60; i++) { await w.save('https://shop.example/', [hard('Akamai')], { historyAutoPinHard: true }); w.advance(60000); }
  await w.save('https://other.example/', [hard('DataDome')], { historyAutoPinHard: true });
  const items = w.items();
  assert.equal(items.filter(i => i.pinned && i.hostname === 'shop.example').length, 1, 'one pinned entry for the page');
  assert.equal(items.find(i => i.hostname === 'other.example').pinned, true, 'another hard page still pins itself');
});


// ---- Changed: only what a scan really found, compared with what a scan found before

test('a result served from the cache is recorded but never compared, and is not what the next scan is compared with', async () => {
  const w = makeWorld();
  await w.save('https://shop.com/login', [antibot('Cloudflare'), captcha('reCAPTCHA')]);
  w.advance(HOUR);
  // The site's cached result (found on its home page) served for /login: reCAPTCHA is not in it
  await w.save('https://shop.com/login', [antibot('Cloudflare')], {}, 1, { fromCache: true });
  assert.ok(!('changed' in w.items()[0]), 'a cached result says nothing about this page now');
  assert.strictEqual(w.items()[0].fromCache, true);
  w.advance(HOUR);
  await w.save('https://shop.com/login', [antibot('Cloudflare'), captcha('reCAPTCHA')]);
  assert.ok(!('changed' in w.items()[0]), 'compared with the last scan of /login, not with the cached entry');
});

test('a protection gone and back on the next scan was a blip: neither scan stays marked', async () => {
  const w = makeWorld();
  await w.save('https://reddit.example/', [antibot('Cloudflare'), captcha('reCAPTCHA', 100)]);
  w.advance(HOUR);
  await w.save('https://reddit.example/', [antibot('Cloudflare')]);
  assert.deepStrictEqual(w.items()[0].changed.removed, ['reCAPTCHA'], 'marked when it is gone');
  w.advance(HOUR);
  await w.save('https://reddit.example/', [antibot('Cloudflare'), captcha('reCAPTCHA', 100)]);
  assert.deepStrictEqual(w.items().map(item => 'changed' in item), [false, false, false], 'back as before: the mark goes');
  assert.strictEqual(w.notes.length, 0, 'alerts are off by default');
});

test('a page that lost every protection is recorded with the change, though a scan finding nothing is not kept otherwise', async () => {
  const w = makeWorld();
  await w.save('https://gone.example/', [antibot('DataDome')]);
  w.advance(HOUR);
  await w.save('https://gone.example/', [], {}, 1, { onlyIfChanged: true });
  assert.strictEqual(w.items().length, 2);
  assert.deepStrictEqual(w.items()[0].changed.removed, ['DataDome']);
  assert.deepStrictEqual(w.items()[0].detections, []);
  w.advance(HOUR);
  await w.save('https://never.example/', [], {}, 1, { onlyIfChanged: true });
  assert.strictEqual(w.items().length, 2, 'a page with nothing before and nothing now is not recorded');
});

test('Skip fingerprint-only and Minimum confidence always win: a page below them is not recorded, even one that lost a protection', async () => {
  const w = makeWorld();
  const s = { historySkipFingerprintOnly: true, historyMinConfidence: 80 };
  await w.save('https://fp.example/', [antibot('Akamai', 95), fingerprint('Canvas')], s);
  w.advance(HOUR);
  await w.save('https://fp.example/', [fingerprint('Canvas')], s);
  assert.strictEqual(w.items().length, 1, 'fingerprint-only: skipped as the setting says');
  w.advance(HOUR);
  await w.save('https://fp.example/', [captcha('hCaptcha', 40)], s);
  assert.strictEqual(w.items().length, 1, 'below the minimum confidence: skipped');
  w.advance(HOUR);
  await w.save('https://fp.example/', [], s, 1, { onlyIfChanged: true });
  assert.strictEqual(w.items().length, 1, 'a page that found nothing is below the minimum too');
  assert.ok(!('changed' in w.items()[0]));
});

test('a watched entry recorded from the cache is not compared: the first check becomes its scan, unmarked', async () => {
  const w = watchWorld([watched('pricing', { fromCache: true })], { historyChangeAlerts: 'all' });
  const result = await w.sw.HistoryRecorder.applyWatchResult('pricing', [], w.sw.chrome);
  assert.deepStrictEqual({ found: result.found, changed: result.changed }, { found: true, changed: false });
  const [entry] = w.items();
  assert.ok(!('changed' in entry) && !('fromCache' in entry));
  assert.deepStrictEqual(entry.detections, []);
  assert.strictEqual(w.notes.length, 0, 'no alert for a protection the page never had');
});

test('a watch check with no answer records when it was tried, and touches nothing else', async () => {
  const w = watchWorld([watched('flaky')]);
  const before = JSON.stringify(w.items()[0]);
  await w.sw.HistoryRecorder.noteWatchAttempt('flaky', w.sw.chrome, START);
  const after = w.items()[0];
  assert.strictEqual(after.watchAttemptAt, START);
  const { watchAttemptAt: _t, ...rest } = after;
  assert.strictEqual(JSON.stringify(rest), before);
});

test('a watch check that agrees with a mark confirms it: the page going back later is a change, not a blip', async () => {
  const w = makeWorld();
  await w.save('https://watch.example/', [antibot('Cloudflare')]);
  w.advance(HOUR);
  await w.save('https://watch.example/', [antibot('Cloudflare'), captcha('reCAPTCHA', 100)]);
  const id = w.items()[0].id;
  assert.deepStrictEqual(w.items()[0].changed.added, ['reCAPTCHA']);
  const stored = JSON.parse(w.store.scrapfly_history);
  stored.items[0].pinned = true;
  stored.items[0].watch = true;
  w.store.scrapfly_history = JSON.stringify(stored);
  w.advance(HOUR);
  const checked = await w.sw.HistoryRecorder.applyWatchResult(id, [antibot('Cloudflare'), captcha('reCAPTCHA', 100)], w.sw.chrome, w.clock.t);
  assert.strictEqual(checked.changed, false);
  assert.strictEqual(w.items()[0].changed.seen, 1, 'the check agreed with the mark');
  w.advance(HOUR);
  await w.save('https://watch.example/', [antibot('Cloudflare')]);
  assert.deepStrictEqual(w.items()[0].changed.removed, ['reCAPTCHA'], 'confirmed by the check: its removal is reported');
});

test('a scan that finds nothing and undoes the last mark was a blip: the mark goes', async () => {
  const w = makeWorld();
  await w.save('https://blip.example/', [fingerprint('Canvas')]);
  w.advance(HOUR);
  await w.save('https://blip.example/', [antibot('Cloudflare')]);
  assert.deepStrictEqual(w.items()[0].changed.added, ['Cloudflare']);
  w.advance(HOUR);
  await w.save('https://blip.example/', [], {}, 1, { onlyIfChanged: true });
  assert.strictEqual(w.items().length, 2, 'the empty scan is not recorded');
  assert.ok(!('changed' in w.items()[0]), 'and the mark of a protection that was gone the next scan is removed');
});

