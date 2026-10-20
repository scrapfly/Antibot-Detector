const { test } = require('node:test');
const assert = require('node:assert');

require('../modules/core/message-sender.js');
require('../modules/core/history-store.js');
require('../modules/core/history-export.js');
const HistoryBackup = require('../background/history-backup.js');

// The automatic backup: History written to Downloads/Scrapfly on a schedule, in parts small
// enough for a data: URL, in the format chosen in Settings.

const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const entry = (i, extra = {}) => ({
  id: `e${i}`, url: `https://site${i}.com/`, hostname: `site${i}.com`, title: `Café ${i} — 漢字`, timestamp: NOW - i * 1000,
  detections: [{ detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 90 }], ...extra
});

function world({ items = [entry(1), entry(2)], settings = {}, notifications = true, failDownload = null } = {}) {
  const store = { scrapfly_history: JSON.stringify({ items }) };
  const downloads = [];
  const notes = [];
  const alarms = new Map();
  const listeners = { alarm: [], changed: [] };
  global.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, store[k]])),
        set: async (obj) => { Object.assign(store, obj); }
      },
      onChanged: { addListener: (fn) => listeners.changed.push(fn) }
    },
    downloads: { download: async (options) => { if (failDownload) throw new Error(failDownload); downloads.push(options); return downloads.length; } },
    notifications: { create: (id, options) => notes.push({ id, ...options }) },
    alarms: {
      get: async (name) => alarms.get(name) || null,
      create: (name, info) => alarms.set(name, { name, ...info }),
      clear: async (name) => alarms.delete(name),
      onAlarm: { addListener: (fn) => listeners.alarm.push(fn) }
    },
    runtime: { getURL: (p) => `chrome-extension://abc/${p}` }
  };
  const history = { exportFormat: 'json', includeTimestamps: true, historyBackup: 'daily', ...settings };
  global.Utils = { getHistorySettings: async () => history, getSettings: async () => ({ notificationsEnabled: notifications }) };
  return { store, downloads, notes, alarms, listeners, history };
}
const cleanup = () => { delete global.chrome; delete global.Utils; };
const fresh = () => Object.assign(Object.create(HistoryBackup), { _initialized: false, _running: null });
const decode = (url) => {
  const match = /^data:([^;]+);charset=utf-8;base64,(.*)$/.exec(url);
  assert.ok(match, url.slice(0, 60));
  return { type: match[1], text: Buffer.from(match[2], 'base64').toString('utf8') };
};
const withNow = async (fn) => {
  const real = Date.now;
  Date.now = () => NOW;
  try { return await fn(); } finally { Date.now = real; }
};

test('toDataUrl keeps every character (UTF-8, not Latin-1)', () => {
  const text = 'Café — 漢字 😀 "quoted"\n';
  const url = HistoryBackup.toDataUrl(text, 'text/plain');
  assert.deepStrictEqual(decode(url), { type: 'text/plain', text });
});

test('toDataUrl handles text larger than one argument list', () => {
  const text = 'é'.repeat(200000);
  assert.strictEqual(decode(HistoryBackup.toDataUrl(text, 'text/csv')).text, text);
});

test('periodOf: daily, weekly, monthly; anything else is off', () => {
  assert.strictEqual(HistoryBackup.periodOf('daily'), 1440);
  assert.strictEqual(HistoryBackup.periodOf('weekly'), 10080);
  assert.strictEqual(HistoryBackup.periodOf('monthly'), 43200);
  assert.strictEqual(HistoryBackup.periodOf('off'), 0);
  assert.strictEqual(HistoryBackup.periodOf(undefined), 0);
  assert.strictEqual(HistoryBackup.periodOf('hourly'), 0);
});

test('run writes one JSON file into Downloads/Scrapfly and records the outcome', async () => {
  const w = world();
  try {
    const result = await withNow(() => fresh().run('manual'));
    assert.deepStrictEqual(result, { ok: true, entries: 2, files: 1 });
    assert.strictEqual(w.downloads.length, 1);
    const [download] = w.downloads;
    assert.strictEqual(download.filename, 'Scrapfly/scrapfly-history-2026-10-19.json');
    assert.strictEqual(download.saveAs, false);
    assert.strictEqual(download.conflictAction, 'uniquify');
    const file = decode(download.url);
    assert.strictEqual(file.type, 'application/json');
    const data = JSON.parse(file.text);
    assert.strictEqual(data.itemsCount, 2);
    assert.deepStrictEqual(data.items.map(i => i.id), ['e1', 'e2']);
    assert.strictEqual(data.items[0].title, 'Café 1 — 漢字');
    assert.deepStrictEqual(w.store.scrapfly_history_backup, { at: NOW, ok: true, entries: 2, files: 1, format: 'json', trigger: 'manual' });
    assert.deepStrictEqual(w.notes, []);
  } finally { cleanup(); }
});

test('run uses the export format and the timestamp choice from Settings', async () => {
  const w = world({ settings: { exportFormat: 'csv', includeTimestamps: false } });
  try {
    await withNow(() => fresh().run('manual'));
    assert.strictEqual(w.downloads[0].filename, 'Scrapfly/scrapfly-history-2026-10-19.csv');
    const file = decode(w.downloads[0].url);
    assert.strictEqual(file.type, 'text/csv');
    assert.ok(file.text.startsWith('url,hostname,title,protection,'), file.text.split('\r\n')[0]);
    assert.strictEqual(w.store.scrapfly_history_backup.format, 'csv');
  } finally { cleanup(); }
});

test('run splits a large History into numbered parts that each stay under the limit', async () => {
  const items = Array.from({ length: 30 }, (_, i) => entry(i, { note: 'x'.repeat(300) }));
  const w = world({ items });
  try {
    const backup = fresh();
    backup.MAX_PART_BYTES = 6000;
    const result = await withNow(() => backup.run('manual'));
    assert.ok(result.files > 1);
    assert.strictEqual(w.downloads.length, result.files);
    assert.deepStrictEqual(w.downloads.map(d => d.filename), Array.from({ length: result.files }, (_, i) => `Scrapfly/scrapfly-history-2026-10-19-part-${i + 1}.json`));
    const ids = [];
    for (const d of w.downloads) {
      const { text } = decode(d.url);
      assert.ok(Buffer.byteLength(text) < 6000 + 1000);
      ids.push(...JSON.parse(text).items.map(i => i.id));   // every part imports on its own
    }
    assert.deepStrictEqual(ids, items.map(i => i.id), 'nothing lost, nothing repeated, same order');
  } finally { cleanup(); }
});

test('run of an empty History writes no file but still counts as done', async () => {
  const w = world({ items: [] });
  try {
    const result = await withNow(() => fresh().run('alarm'));
    assert.deepStrictEqual(result, { ok: true, entries: 0, files: 0 });
    assert.strictEqual(w.downloads.length, 0);
    assert.strictEqual(w.store.scrapfly_history_backup.ok, true);
  } finally { cleanup(); }
});

test('a failed download is recorded, notified once, and reported without throwing', async () => {
  const w = world({ failDownload: 'Download blocked by policy' });
  try {
    const result = await withNow(() => fresh().run('alarm'));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'Download blocked by policy');
    assert.deepStrictEqual(w.store.scrapfly_history_backup, { at: NOW, ok: false, error: 'Download blocked by policy', trigger: 'alarm' });
    assert.strictEqual(w.notes.length, 1);
    assert.strictEqual(w.notes[0].id, 'scrapfly-history-backup-failed');
    assert.ok(w.notes[0].title && w.notes[0].message);
  } finally { cleanup(); }
});

test('a failed backup stays silent when notifications are off', async () => {
  const w = world({ failDownload: 'nope', notifications: false });
  try {
    await withNow(() => fresh().run('alarm'));
    assert.strictEqual(w.notes.length, 0);
    assert.strictEqual(w.store.scrapfly_history_backup.ok, false);
  } finally { cleanup(); }
});

test('two runs at once share one backup', async () => {
  const w = world();
  try {
    const backup = fresh();
    const [a, b] = await withNow(() => Promise.all([backup.run('alarm'), backup.run('manual')]));
    assert.deepStrictEqual(a, b);
    assert.strictEqual(w.downloads.length, 1);
    await backup.run('manual');
    assert.strictEqual(w.downloads.length, 2, 'a later run starts a new backup');
  } finally { cleanup(); }
});

test('syncAlarm creates, re-times and clears the schedule', async () => {
  const w = world();
  try {
    const backup = fresh();
    await backup.syncAlarm('daily');
    assert.deepStrictEqual(w.alarms.get('scrapfly-history-backup'), { name: 'scrapfly-history-backup', delayInMinutes: 1440, periodInMinutes: 1440 });
    const before = w.alarms.get('scrapfly-history-backup');
    await backup.syncAlarm('daily');
    assert.strictEqual(w.alarms.get('scrapfly-history-backup'), before, 'an unchanged schedule is left alone');
    await backup.syncAlarm('weekly');
    assert.strictEqual(w.alarms.get('scrapfly-history-backup').periodInMinutes, 10080);
    await backup.syncAlarm('off');
    assert.strictEqual(w.alarms.has('scrapfly-history-backup'), false);
    await backup.syncAlarm('off');
  } finally { cleanup(); }
});

test('sync with catch-up runs a backup that came due while the browser was closed', async () => {
  const w = world();
  try {
    await withNow(async () => {
      // Never backed up: due now
      await fresh().sync(true);
      assert.strictEqual(w.downloads.length, 1);
      assert.strictEqual(w.store.scrapfly_history_backup.trigger, 'startup');
      // Backed up an hour ago: not due
      await fresh().sync(true);
      assert.strictEqual(w.downloads.length, 1);
      // Last backup two days ago: due again
      w.store.scrapfly_history_backup = { at: NOW - 2 * 86400000, ok: true };
      await fresh().sync(true);
      assert.strictEqual(w.downloads.length, 2);
    });
  } finally { cleanup(); }
});

test('sync without catch-up, or with backups off, never downloads', async () => {
  const w = world();
  try {
    await withNow(async () => {
      await fresh().sync(false);
      assert.strictEqual(w.downloads.length, 0);
      w.history.historyBackup = 'off';
      await fresh().sync(true);
      assert.strictEqual(w.downloads.length, 0);
      assert.strictEqual(w.alarms.size, 0);
    });
  } finally { cleanup(); }
});

test('init registers the alarm and settings listeners and applies the stored setting', async () => {
  const w = world();
  try {
    const backup = fresh();
    backup.init();
    backup.init();
    assert.strictEqual(w.listeners.alarm.length, 1, 'registered once');
    assert.strictEqual(w.listeners.changed.length, 1);
    await new Promise(r => setTimeout(r, 30));
    assert.ok(w.alarms.has('scrapfly-history-backup'));
    const before = w.downloads.length;
    w.listeners.alarm[0]({ name: 'some-other-alarm' });
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(w.downloads.length, before, 'other alarms are ignored');
    w.listeners.alarm[0]({ name: 'scrapfly-history-backup' });
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(w.downloads.length, before + 1);
    // Changing the setting re-times the alarm
    w.history.historyBackup = 'monthly';
    w.listeners.changed[0]({ scrapfly_settings: {} }, 'local');
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(w.alarms.get('scrapfly-history-backup').periodInMinutes, 43200);
  } finally { cleanup(); }
});

test('BACKUP_NOW answers extension pages and refuses web pages', async () => {
  const w = world();
  try {
    const registry = {};
    const backup = fresh();
    backup.registerHandlers(registry);
    const ask = (sender) => new Promise((resolve) => {
      const keep = registry[HistoryBackup.Messages.BACKUP_NOW]({ sender, sendResponse: resolve });
      if (keep === false) return; // answered synchronously
    });
    const ok = await ask({ url: 'chrome-extension://abc/popup.html' });
    assert.strictEqual(ok.status, 'ok');
    assert.strictEqual(ok.files, 1);
    assert.strictEqual(w.downloads.length, 1);
    const refused = await ask({ tab: { id: 3 }, url: 'https://evil.example/' });
    assert.strictEqual(refused.status, 'error');
    assert.strictEqual(w.downloads.length, 1, 'a web page cannot start a backup');
  } finally { cleanup(); }
});

test('BACKUP_NOW reports a failure to the page that asked', async () => {
  world({ failDownload: 'disk full' });
  try {
    const registry = {};
    fresh().registerHandlers(registry);
    const answer = await new Promise(resolve => registry[HistoryBackup.Messages.BACKUP_NOW]({ sender: { url: 'chrome-extension://abc/popup.html' }, sendResponse: resolve }));
    assert.strictEqual(answer.status, 'error');
    assert.strictEqual(answer.error, 'disk full');
  } finally { cleanup(); }
});
