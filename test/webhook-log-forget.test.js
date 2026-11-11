'use strict';
// "Recent deliveries" names pages. The line of a page History is told to keep out is written without a host, but only the lines
// written after the person said so: a site added to Skipped sites or to History's ignored sites (or History paused, or "only
// these sites" chosen) later still showed in the lines already there. The worker now blanks the host of those lines when the
// settings change, and once at start: what happened, when and the status stay.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const WebhookLog = require('../modules/core/webhook-log.js');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------- the pure part

const LINES = () => [
  { t: 1, page: 'shop.example', outcome: 'sent', status: 200, trigger: 'scan', ms: 40 },
  { t: 2, page: 'bank.example', outcome: 'failed', status: 503, trigger: 'scan', ms: 90, id: 'abc', attempt: 2, retryAt: 5000 },
  { t: 3, page: 'news.example', outcome: 'skipped', reason: 'site', trigger: 'cache' }
];

test('forget blanks the page of the line that names a page kept out, and keeps everything else of it', () => {
  const log = LINES();
  const next = WebhookLog.forget(log, (page) => page === 'bank.example');
  assert.deepEqual(next.map((line) => line.page), ['shop.example', '', 'news.example'], 'only the matching line');
  assert.deepEqual(next[1], { t: 2, page: '', outcome: 'failed', status: 503, trigger: 'scan', ms: 90, id: 'abc', attempt: 2, retryAt: 5000 },
    'what happened, when, the status and the retry stay: the Retry button still has its delivery');
  assert.strictEqual(next[0], log[0], 'a line with nothing to blank is the same line');
  assert.strictEqual(next[2], log[2]);
  assert.deepEqual(plain(log), plain(LINES()), 'the log it was given is not changed');
  assert.equal(WebhookLog.clean(next[1]).page, '', 'and the log still reads it as a line');
});

test('forget asks about each page as the log names it, never about a line that names none', () => {
  const asked = [];
  const log = [...LINES(), { t: 4, page: '', outcome: 'sent', status: 200, trigger: 'scan' }, { t: 5, outcome: 'sent', status: 204, trigger: 'test' }];
  WebhookLog.forget(log, (page) => { asked.push(page); return false; });
  assert.deepEqual(asked, ['shop.example', 'bank.example', 'news.example']);
});

test('forget hands back the same log when nothing is blanked, so a caller can tell that nothing changed', () => {
  const log = LINES();
  assert.strictEqual(WebhookLog.forget(log, () => false), log);
  assert.strictEqual(WebhookLog.forget([], () => true).length, 0);
  assert.notStrictEqual(WebhookLog.forget(log, () => true), log);
  assert.deepEqual(WebhookLog.forget(log, () => true).map((line) => line.page), ['', '', '']);
  // Only a plain true blanks: an answer that is not one (a promise from an async check) never blanks a page it did not judge
  assert.strictEqual(WebhookLog.forget(log, async () => true), log);
  assert.strictEqual(WebhookLog.forget(log, () => 1), log);
});

test('forget reads what is not a log as an empty one', () => {
  for (const value of [undefined, null, 'x', 5, {}]) assert.deepEqual(WebhookLog.forget(value, () => true), []);
});

// ---------------------------------------------------------------- the worker

const KEY = 'scrapfly_webhook_log';
const SETTINGS_KEY = 'scrapfly_settings';

/** The worker's side of the webhook with the real settings reader, skip lists and History rule over a fake storage. */
function world({ settings = {}, log = LINES(), logger = {} } = {}) {
  const local = { [SETTINGS_KEY]: JSON.stringify({ settings }) };
  if (log) local[KEY] = log;
  const logWrites = [];
  const warnings = [];
  const changed = [];
  const state = { settingsRaw: null, settingsFail: false, reads: 0, failAfter: null };
  const area = {
    async get(keys) {
      await Promise.resolve();
      const out = {};
      for (const key of [].concat(keys)) {
        if (key === SETTINGS_KEY) state.reads++;
        if (key === SETTINGS_KEY && (state.settingsFail || (state.failAfter !== null && state.reads > state.failAfter))) throw new Error('storage did not answer');
        if (key === SETTINGS_KEY && state.settingsRaw !== null) out[key] = state.settingsRaw;
        else if (key in local) out[key] = typeof local[key] === 'string' ? local[key] : plain(local[key]);
      }
      return out;
    },
    async set(values) {
      await Promise.resolve();
      for (const [key, value] of Object.entries(values)) {
        if (key === KEY) logWrites.push(plain(value));
        local[key] = typeof value === 'string' ? value : plain(value);
      }
    },
    async remove(keys) { await Promise.resolve(); for (const key of [].concat(keys)) delete local[key]; }
  };
  const context = vm.createContext({
    console, URL, JSON, Promise, Date, Math, Set, Map,
    Logger: new Proxy({}, { get: (_, name) => (name === 'warn' ? (...args) => warnings.push(args) : () => {}) }),
    UrlUtils: { getFaviconUrl: (host) => `https://icons.example/${host}.png` },
    chrome: { storage: { local: area, onChanged: { addListener: (fn) => changed.push(fn) } } },
    ...logger
  });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js', 'modules/core/storage-manager.js', 'utils/utils.js',
    'modules/core/webhook-filter.js', 'modules/core/webhook-log.js', 'modules/settings/settings-runtime.js', 'modules/settings/webhook-runtime.js']) vm.runInContext(read(file), context, { filename: file });
  const runtime = context.SettingsRuntime;
  // The record's own queue: every pass and every line the worker writes goes through it, one at a time
  const settle = async () => { for (let i = 0; i < 6; i++) { await vm.runInContext('webhookLogQueue', context); await new Promise((resolve) => setTimeout(resolve, 0)); } };
  const stored = () => JSON.parse(local[SETTINGS_KEY]).settings;
  return {
    runtime, context, local, logWrites, warnings, state, settle,
    pages: () => (local[KEY] || []).map((line) => line.page),
    /** The person changes a setting: storage holds it, and Chrome tells the worker's listener, as it does for any write. */
    async change(patch) {
      const before = local[SETTINGS_KEY];
      const next = patch(plain(stored()));
      local[SETTINGS_KEY] = JSON.stringify({ timestamp: 'now', settings: next });
      for (const listener of changed) listener({ [SETTINGS_KEY]: { oldValue: before, newValue: local[SETTINGS_KEY] } }, 'local');
      await settle();
    },
    /** A write of another key: no settings change. */
    async otherWrite() {
      for (const listener of changed) listener({ scrapfly_enabled: { oldValue: true, newValue: false } }, 'local');
      for (const listener of changed) listener({ [SETTINGS_KEY]: { oldValue: 'x', newValue: 'y' } }, 'sync');
      await settle();
    },
    start() { runtime.initWebhookLogScope(); return settle(); },
    listeners: changed
  };
}

const pagesOf = (lines) => lines.map((line) => line.page);

test('a site added to Skipped sites is no longer named by the lines already written, and the change is written once', async () => {
  const w = world({ settings: { detection: { scanMode: 'blocklist', blacklistedDomains: [] }, history: {} } });
  await w.start();
  assert.equal(w.logWrites.length, 0, 'nothing is left out yet: nothing is written');
  await w.change((s) => { s.detection.blacklistedDomains = ['bank.example']; return s; });
  assert.deepEqual(w.pages(), ['shop.example', '', 'news.example']);
  assert.equal(w.logWrites.length, 1, 'the record is rewritten once');
  const [line] = w.logWrites[0].filter((entry) => entry.id === 'abc');
  assert.deepEqual([line.outcome, line.status, line.t, line.attempt, line.retryAt], ['failed', 503, 2, 2, 5000], 'the line itself stays');
  assert.ok(!JSON.stringify(w.local[KEY]).includes('bank.example'), 'the host is not in the record any more');
});

test('a change that adds nothing to what is left out rewrites nothing', async () => {
  const w = world({ settings: { detection: { scanMode: 'blocklist', blacklistedDomains: ['bank.example'] }, history: {} } });
  await w.start();
  assert.equal(w.logWrites.length, 1, 'the start blanks the line of a site that was left out before');
  await w.change((s) => { s.detection.blacklistedDomains = ['bank.example', 'unseen.example']; return s; });
  await w.change((s) => { s.detection.cacheScope = 'path'; return s; });
  await w.change((s) => { s.history.historyLimit = 100; return s; });
  await w.change((s) => { s.webhook = { enableWebhook: true }; return s; });
  await w.otherWrite();
  assert.equal(w.logWrites.length, 1, 'a site the record never named, and settings that leave nothing out, write nothing');
  assert.deepEqual(w.pages(), ['shop.example', '', 'news.example']);
});

test('History\'s ignored sites: the site and its subdomains, not a lookalike', async () => {
  const log = [
    { t: 1, page: 'shop.example', outcome: 'sent', status: 200, trigger: 'scan' },
    { t: 2, page: 'deep.shop.example', outcome: 'sent', status: 200, trigger: 'scan' },
    { t: 3, page: 'notshop.example', outcome: 'sent', status: 200, trigger: 'scan' }
  ];
  const w = world({ log, settings: { history: { historyExcludedDomains: [] } } });
  await w.start();
  await w.change((s) => { s.history.historyExcludedDomains = ['shop.example']; return s; });
  assert.deepEqual(w.pages(), ['', '', 'notshop.example']);
  assert.equal(w.logWrites.length, 1);
});

test('History paused: the lines name no page at all, as the lines written while it is paused', async () => {
  const w = world({ settings: { history: { historyEnabled: true } } });
  await w.start();
  await w.change((s) => { s.history.historyEnabled = false; return s; });
  assert.deepEqual(w.pages(), ['', '', '']);
  assert.deepEqual(w.local[KEY].map((line) => line.outcome), ['sent', 'failed', 'skipped'], 'what happened stays');
  assert.equal(w.logWrites.length, 1);
});

test('"Only these sites": every site that is not on the list is left out, the listed ones and their subdomains are not', async () => {
  const log = [
    { t: 1, page: 'shop.example', outcome: 'sent', status: 200, trigger: 'scan' },
    { t: 2, page: 'www.shop.example', outcome: 'sent', status: 200, trigger: 'scan' },
    { t: 3, page: 'bank.example', outcome: 'sent', status: 200, trigger: 'scan' },
    { t: 4, page: 'notshop.example', outcome: 'skipped', reason: 'site', trigger: 'scan' }
  ];
  const w = world({ log, settings: { detection: { scanMode: 'blocklist', blacklistedDomains: [], allowedDomains: ['shop.example'] } } });
  await w.start();
  assert.equal(w.logWrites.length, 0, 'the list of chosen sites means nothing while the sites to skip are what counts');
  await w.change((s) => { s.detection.scanMode = 'allowlist'; return s; });
  assert.deepEqual(w.pages(), ['shop.example', 'www.shop.example', '', '']);
  assert.equal(w.logWrites.length, 1);
  // An empty list of chosen sites leaves out every site
  await w.change((s) => { s.detection.allowedDomains = []; return s; });
  assert.deepEqual(w.pages(), ['', '', '', '']);
  assert.equal(w.logWrites.length, 2);
});

test('a skipped site is read as the scan reads it: the exact host, written however the list was written, and the old flat list', async () => {
  const log = () => [
    { t: 1, page: 'bank.example', outcome: 'sent', status: 200, trigger: 'scan' },
    { t: 2, page: 'www.bank.example', outcome: 'sent', status: 200, trigger: 'scan' },
    { t: 3, page: 'old.example', outcome: 'sent', status: 200, trigger: 'scan' }
  ];
  const nested = world({ log: log(), settings: { detection: { blacklistedDomains: ['https://Bank.Example/'] } } });
  await nested.start();
  assert.deepEqual(nested.pages(), ['', 'www.bank.example', 'old.example'], 'the list holds exact hosts: the subdomain is another site');
  // An install that never saved its settings since the lists moved into Detection still has the flat one, and the scan reads it
  const flat = world({ log: log(), settings: { blacklistedDomains: ['Old.Example'] } });
  await flat.start();
  assert.deepEqual(flat.pages(), ['bank.example', 'www.bank.example', '']);
});

test('settings that cannot be read change nothing, and say so', async () => {
  const w = world({ settings: { detection: { blacklistedDomains: [] } } });
  await w.start();
  w.state.settingsRaw = '{ not json';
  await w.change((s) => s);
  assert.deepEqual(w.pages(), ['shop.example', 'bank.example', 'news.example'], 'no line is blanked for settings nobody can read');
  assert.equal(w.logWrites.length, 0);
  assert.ok(w.warnings.some((args) => /record of webhook deliveries/.test(String(args[1]))), 'and it does not stay silent');
  assert.ok(!JSON.stringify(w.warnings).includes('not json'), 'only the kind of failure, never the stored text');
  // A storage that does not answer is the same
  w.state.settingsRaw = null;
  w.state.settingsFail = true;
  await w.change((s) => s);
  assert.deepEqual(w.pages(), ['shop.example', 'bank.example', 'news.example']);
  assert.equal(w.logWrites.length, 0);
  // Once they can be read, the next change catches up with everything that was left out meanwhile
  w.state.settingsFail = false;
  await w.change((s) => { s.detection.blacklistedDomains = ['bank.example']; return s; });
  assert.deepEqual(w.pages(), ['shop.example', '', 'news.example']);
  assert.equal(w.logWrites.length, 1);
});

test('a read that fails while the pages are judged blanks none of the pages it could not judge', async () => {
  const w = world({ settings: { history: {} } });
  await w.start();
  w.state.reads = 0;
  w.state.failAfter = 1; // the pass has read the settings for itself; the read of the skip list inside it does not answer
  await w.change((s) => { s.history.historyExcludedDomains = ['shop.example']; return s; });
  assert.deepEqual(w.pages(), ['', 'bank.example', 'news.example'], 'the page History\'s own rule judged is forgotten, the others are not "skipped" for want of an answer');
  assert.equal(w.logWrites.length, 1);
});

test('what is left out is judged by what is stored when the pass runs, so two quick changes end in the same record', async () => {
  const w = world({ settings: { detection: { blacklistedDomains: [] } } });
  await w.start();
  const before = w.local[SETTINGS_KEY];
  w.local[SETTINGS_KEY] = JSON.stringify({ settings: { detection: { blacklistedDomains: ['bank.example', 'news.example'] } } });
  for (const listener of w.listeners) {
    listener({ [SETTINGS_KEY]: { oldValue: before, newValue: w.local[SETTINGS_KEY] } }, 'local');
    listener({ [SETTINGS_KEY]: { oldValue: before, newValue: w.local[SETTINGS_KEY] } }, 'local');
  }
  await w.settle();
  assert.deepEqual(w.pages(), ['shop.example', '', '']);
  assert.equal(w.logWrites.length, 1, 'the second pass finds nothing left to blank');
});

test('a line written while the pass runs is kept, and the pass never reads a log older than the lines before it', async () => {
  const w = world({ settings: { detection: { blacklistedDomains: [] } } });
  await w.start();
  const change = w.change((s) => { s.detection.blacklistedDomains = ['bank.example']; return s; });
  const recorded = w.runtime.recordWebhookDelivery({ t: 9, page: 'late.example', outcome: 'sent', status: 200, trigger: 'scan' });
  await Promise.all([change, recorded]);
  await w.settle();
  assert.deepEqual(w.pages(), ['shop.example', '', 'news.example', 'late.example']);
});

test('a record that is empty, or was cleared, is left alone', async () => {
  const w = world({ log: null, settings: { history: { historyEnabled: false } } });
  await w.start();
  await w.change((s) => s);
  assert.equal(w.logWrites.length, 0);
  assert.equal(KEY in w.local, false, 'no record is made of nothing');
  const blank = world({ log: [{ t: 1, page: '', outcome: 'sent', status: 200, trigger: 'scan' }], settings: { history: { historyEnabled: false } } });
  await blank.start();
  assert.equal(blank.logWrites.length, 0, 'a line that names no page has nothing to blank');
});

test('a record that cannot be written never throws, and the next change tries again', async () => {
  const w = world({ settings: { detection: { blacklistedDomains: [] } } });
  await w.start();
  const set = w.context.chrome.storage.local.set;
  let fails = true;
  w.context.chrome.storage.local.set = async (values) => { if (fails) throw new Error('storage is full'); return set(values); };
  await w.change((s) => { s.detection.blacklistedDomains = ['bank.example']; return s; });
  assert.deepEqual(w.pages(), ['shop.example', 'bank.example', 'news.example'], 'not written');
  fails = false;
  await w.change((s) => { s.detection.cacheScope = 'domain'; return s; });
  assert.deepEqual(w.pages(), ['shop.example', '', 'news.example'], 'the next settings change catches up');
});

test('the listener is registered once, for settings of the local storage only', async () => {
  const w = world({ settings: { detection: { blacklistedDomains: ['bank.example'] } } });
  w.runtime.initWebhookLogScope();
  w.runtime.initWebhookLogScope();
  assert.equal(w.listeners.length, 1);
  await w.settle();
  assert.deepEqual(w.pages(), ['shop.example', '', 'news.example'], 'the start judges the record by the settings that are stored');
  w.local[KEY] = LINES();
  await w.otherWrite();
  assert.deepEqual(w.pages(), ['shop.example', 'bank.example', 'news.example'], 'neither another key nor another area is a settings change');
});

test('the worker registers it in its first turn, and the stubs of the other worker tests do not need it', () => {
  const init = read('background/init.js');
  assert.match(init, /SettingsRuntime\.initWebhookLogScope\(\)/);
  assert.ok(init.indexOf('initWebhookLogScope') > init.indexOf('SettingsRuntime.initWebhookRetries()'), 'beside the retries it shares a module with');
});
