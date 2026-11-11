const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

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

/**
 * A browser with History in its storage, the extension's settings, alarms and notifications, and a downloads list that behaves like
 * Chrome's: ids are the browser's own (not a count), a taken name is made unique, a finished download can have its file removed
 * from the disk and its entry erased from the list, and a call that cannot work throws what Chrome throws.
 *
 *   downloads  what the extension asked to download, in order     made     the ids the browser gave, in order
 *   list       the browser's downloads list (id -> item)           disk     the paths of the files on the disk
 *   removed    the ids whose file was removed                      log      every call, in order: download:41, set:key, search:41, removeFile:41, erase:41
 *   fail       { download, after, remove, hang }: make downloads fail (after that many have worked), make removeFile fail with a
 *              message, or never answer (a worker that is stopped in the middle of a delete)
 *   seen       the storage as it was when the first file was about to be removed
 */
function world({ items = [entry(1), entry(2)], settings = {}, notifications = true, failDownload = null } = {}) {
  const store = { scrapfly_history: JSON.stringify({ items }) };
  const downloads = [];
  const notes = [];
  const alarms = new Map();
  const listeners = { alarm: [], changed: [] };
  const log = [];
  const list = new Map();
  const disk = new Set();
  const made = [];
  const removed = [];
  const fail = { download: failDownload, after: 0, remove: null, hang: false };
  const seen = { atFirstRemoval: null };
  let lastId = 40;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  global.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, clone(store[k])])),
        set: async (obj) => { log.push(`set:${Object.keys(obj).join(',')}`); Object.assign(store, clone(obj)); }
      },
      onChanged: { addListener: (fn) => listeners.changed.push(fn) }
    },
    downloads: {
      download: async (options) => {
        if (fail.download) {
          if (fail.after > 0) fail.after--;
          else throw new Error(fail.download);
        }
        downloads.push(options);
        const id = ++lastId;
        let file = `/home/me/Downloads/${options.filename}`;
        for (let n = 1; disk.has(file); n++) file = `/home/me/Downloads/${options.filename.replace(/(\.[^./]+)$/, ` (${n})$1`)}`;
        disk.add(file);
        list.set(id, { id, filename: file, byExtensionId: 'ext-abc', state: 'complete' });
        made.push(id);
        log.push(`download:${id}`);
        return id;
      },
      search: async (query) => {
        log.push(`search:${query.id}`);
        return list.has(query.id) ? [{ ...list.get(query.id), exists: disk.has(list.get(query.id).filename) }] : [];
      },
      removeFile: async (id) => {
        log.push(`removeFile:${id}`);
        if (!seen.atFirstRemoval) seen.atFirstRemoval = clone(store);
        if (fail.hang) await new Promise(() => {});
        const item = list.get(id);
        if (!item) throw new Error('Invalid download id');
        if (item.state !== 'complete') throw new Error('Download not complete');
        if (!disk.has(item.filename)) throw new Error('Download file already deleted');
        if (fail.remove) throw new Error(fail.remove);
        disk.delete(item.filename);
        removed.push(id);
      },
      erase: async (query) => { log.push(`erase:${query.id}`); return list.delete(query.id) ? [query.id] : []; }
    },
    notifications: { create: (id, options) => notes.push({ id, ...options }) },
    alarms: {
      get: async (name) => alarms.get(name) || null,
      create: (name, info) => alarms.set(name, { name, ...info }),
      clear: async (name) => alarms.delete(name),
      onAlarm: { addListener: (fn) => listeners.alarm.push(fn) }
    },
    runtime: { id: 'ext-abc', getURL: (p) => `chrome-extension://abc/${p}` }
  };
  const history = { exportFormat: 'json', includeTimestamps: true, historyBackup: 'daily', ...settings };
  global.Utils = { getHistorySettings: async () => history, getSettings: async () => ({ notificationsEnabled: notifications }) };
  return { store, downloads, notes, alarms, listeners, history, log, list, disk, made, removed, fail, seen };
}
const cleanup = () => { delete global.chrome; delete global.Utils; };
const fresh = () => Object.assign(Object.create(HistoryBackup), { _initialized: false, _running: null });
const decode = (url) => {
  const match = /^data:([^;]+);charset=utf-8;base64,(.*)$/.exec(url);
  assert.ok(match, url.slice(0, 60));
  return { type: match[1], text: Buffer.from(match[2], 'base64').toString('utf8') };
};
const withNow = async (fn, at = NOW) => {
  const real = Date.now;
  Date.now = () => at;
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
    // A CSV file starts with the byte-order mark, so Excel reads it as UTF-8 (a title like "Café – 東京" is not garbage)
    assert.ok(file.text.startsWith('\uFEFFurl,hostname,title,protection,'), file.text.split('\r\n')[0]);
    assert.strictEqual(w.store.scrapfly_history_backup.format, 'csv');
  } finally { cleanup(); }
});

test('a scheduled backup in the Markdown format writes a .md table', async () => {
  const w = world({ settings: { exportFormat: 'md', includeTimestamps: false } });
  try {
    await withNow(() => fresh().run('manual'));
    assert.strictEqual(w.downloads[0].filename, 'Scrapfly/scrapfly-history-2026-10-19.md');
    const file = decode(w.downloads[0].url);
    assert.strictEqual(file.type, 'text/markdown');
    assert.ok(file.text.startsWith('# Scrapfly Antibot Detector: History\n'), file.text.split('\n')[0]);
    assert.ok(file.text.includes('| Page | Address | Protections | Pinned | Note |'), 'no Date column without timestamps');
    assert.strictEqual(w.store.scrapfly_history_backup.format, 'md');
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

test('a backup that failed is tried again at the next start, an hour later at the earliest, and a failed retry waits for the next period', async () => {
  const w = world();
  try {
    await withNow(async () => {
      w.store.scrapfly_history_backup = { at: NOW - 10 * 60000, ok: false, error: 'Download blocked', trigger: 'alarm' };
      await fresh().sync(true);
      assert.strictEqual(w.downloads.length, 0, 'ten minutes after the failure: not yet');
      w.store.scrapfly_history_backup = { at: NOW - 2 * 3600000, ok: false, error: 'Download blocked', trigger: 'alarm' };
      await fresh().sync(true);
      assert.strictEqual(w.downloads.length, 1, 'two hours after: the period would have counted it as done');
      assert.strictEqual(w.store.scrapfly_history_backup.trigger, 'startup');
      w.store.scrapfly_history_backup = { at: NOW - 2 * 3600000, ok: false, error: 'Download blocked', trigger: 'startup' };
      await fresh().sync(true);
      assert.strictEqual(w.downloads.length, 1, 'a retry that failed is not retried at every start');
    });
  } finally { cleanup(); }
});

// ---- The Automatic backup text (Settings → History) says what can be imported back

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const messagesOf = (locale) => JSON.parse(read(`_locales/${locale}/messages.json`));
const LOCALES = fs.readdirSync(path.join(__dirname, '..', '_locales')).sort();

test('the Automatic backup text says, in every language, that only JSON can be imported back into History', () => {
  // The file is written in the export format chosen above, and History imports JSON only: a CSV, text or Markdown backup cannot be restored
  assert.ok(LOCALES.length >= 22, `the language folders were found: ${LOCALES.length}`);
  const english = messagesOf('en').settingsHistoryBackupDesc.message;
  assert.match(english, /in the export format chosen above\./);
  assert.match(english, /Only JSON files can be imported back into History\.$/);
  for (const locale of LOCALES) {
    const text = messagesOf(locale).settingsHistoryBackupDesc.message;
    assert.match(text, /JSON/, `${locale}: ${text}`);
  }
  const html = read('sections/settings/settings.html');
  assert.strictEqual(/data-i18n="settingsHistoryBackupDesc">([^<]*)</.exec(html)[1], english, 'the text shown before the translations load is the English one');
  // The History tab's own file picker takes .json only: that is why
  assert.match(read('sections/history/history.html'), /id="importHistoryFile" accept="\.json"/);
});

// ---- Backups to keep: the files of the older backups are deleted, and only files these backups made

const HistoryExport = require('../modules/core/history-export.js');
const DAY = 86400000;
const nameOf = (day, extension = 'json', part = 0) => HistoryExport.fileName(extension, NOW + day * DAY, part);
const onDisk = (w) => [...w.disk].map(file => file.split('/').pop()).sort();
const recordOf = (w) => w.store[HistoryBackup.RUNS_KEY];
const callsTo = (w, name) => w.log.filter(op => op.startsWith(`${name}:`));
/** `count` backups on consecutive days, the first on day `from`; each is a run of its own, as after a worker restart. */
async function backUp(count, { trigger = 'alarm', make = fresh, from = 0 } = {}) {
  const results = [];
  for (let day = from; day < from + count; day++) results.push(await withNow(() => make().run(typeof trigger === 'function' ? trigger(day) : trigger), NOW + day * DAY));
  return results;
}
const inParts = (bytes = 6000) => () => Object.assign(fresh(), { MAX_PART_BYTES: bytes });
const bigHistory = () => Array.from({ length: 30 }, (_, i) => entry(i, { note: 'x'.repeat(300) }));

test('keepOf: only the offered numbers keep fewer than all', () => {
  assert.deepStrictEqual([...HistoryBackup.KEEP_CHOICES], [3, 7, 14, 30]);
  for (const keep of HistoryBackup.KEEP_CHOICES) assert.strictEqual(HistoryBackup.keepOf(keep), keep);
  // Anything else is "all": a value nobody chose must never be able to delete a file (1 or 0 runs would delete nearly everything)
  for (const other of [undefined, null, 0, 1, 2, 4, 15, 31, 100, -7, 7.5, '7', 'all', NaN, Infinity, true, [], {}]) assert.strictEqual(HistoryBackup.keepOf(other), 0, String(other));
});

test('madeHere: a file this extension saved in the Scrapfly folder as a backup, on any system, and nothing else', () => {
  world();
  try {
    const ours = (filename, byExtensionId = 'ext-abc') => HistoryBackup.madeHere({ filename, byExtensionId });
    // What every format and part of fileName() makes, in the folders of the three systems, with the browser's own " (1)" for a taken name
    for (const folder of ['/home/me/Downloads/Scrapfly/', 'C:\\Users\\me\\Downloads\\Scrapfly\\', '/Users/me/Downloads/Scrapfly/', 'D:\\Descargas\\Scrapfly\\']) {
      for (const format of HistoryExport.FORMATS) {
        for (const part of [0, 2]) {
          const name = HistoryExport.fileName(format, NOW, part);
          assert.ok(ours(`${folder}${name}`), `${folder}${name}`);
          assert.ok(ours(`${folder}${name.replace(/(\.[a-z]+)$/, ' (1)$1')}`), `${folder}${name} (1)`);
        }
      }
    }
    assert.ok(!ours('/home/me/Downloads/Scrapfly/scrapfly-history-2026-10-19.json', 'another-extension'), 'another extension\'s file');
    assert.ok(!HistoryBackup.madeHere({ filename: '/home/me/Downloads/Scrapfly/scrapfly-history-2026-10-19.json' }), 'a file no extension saved');
    assert.ok(!ours('/home/me/Downloads/scrapfly-history-2026-10-19.json'), 'not in the Scrapfly folder');
    assert.ok(!ours('/home/me/Downloads/MyScrapfly/scrapfly-history-2026-10-19.json'), 'another folder that ends the same');
    assert.ok(!ours('/home/me/Downloads/Scrapfly/sub/scrapfly-history-2026-10-19.json'), 'a deeper folder');
    assert.ok(!ours('/home/me/Downloads/Scrapfly/scrapfly-logs-1767225600000.json'), 'not named like a backup');
    assert.ok(!ours('/home/me/Downloads/Scrapfly/notes.txt'));
    assert.ok(!ours(''), 'no name');
    assert.ok(!ours(undefined), 'no name');
    assert.ok(!HistoryBackup.madeHere(null));
    assert.ok(!HistoryBackup.madeHere(undefined));
    delete chrome.runtime.id;
    assert.ok(!HistoryBackup.madeHere({ filename: '/home/me/Downloads/Scrapfly/scrapfly-history-2026-10-19.json' }), 'without an id of its own nothing counts as ours');
    assert.ok(!ours('/home/me/Downloads/Scrapfly/scrapfly-history-2026-10-19.json', ''), 'not even an empty one');
  } finally { cleanup(); }
});

test('Backups to keep: with 3 kept, every new backup deletes the older ones, so the newest three stay on the disk and in the browser list', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    const results = await backUp(6);
    assert.ok(results.every(r => r.ok && r.files === 1), JSON.stringify(results));
    assert.deepStrictEqual(onDisk(w), [nameOf(3), nameOf(4), nameOf(5)], 'the first three backups are gone, the newest three stay');
    assert.deepStrictEqual(w.removed, w.made.slice(0, 3), 'each file went when a newer backup made it one too many');
    assert.deepStrictEqual([...w.list.keys()], w.made.slice(3), 'and its entry left the browser list too, so that list stays clean');
    assert.deepStrictEqual(recordOf(w), [3, 4, 5].map(day => ({ at: NOW + day * DAY, ids: [w.made[day]] })));
    assert.strictEqual(w.store.scrapfly_history_backup.removed, 1, 'the last backup says how many files it deleted');
    assert.strictEqual(w.store.scrapfly_history_backup.ok, true);
  } finally { cleanup(); }
});

test('Backups to keep: Back up now and the scheduled backups count the same', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    const triggers = ['manual', 'alarm', 'manual', 'startup', 'manual'];
    const results = await backUp(5, { trigger: (day) => triggers[day] });
    assert.deepStrictEqual(results.map(r => r.ok), [true, true, true, true, true]);
    assert.deepStrictEqual(onDisk(w), [nameOf(2), nameOf(3), nameOf(4)]);
  } finally { cleanup(); }
});

test('Backups to keep: a backup saved in several parts is one backup, and all its parts go together', async () => {
  const w = world({ items: bigHistory(), settings: { historyBackupKeep: 3 } });
  try {
    const results = await backUp(5, { make: inParts() });
    const parts = results[0].files;
    assert.ok(parts > 1 && results.every(r => r.files === parts), `several parts every time: ${JSON.stringify(results)}`);
    const expected = [2, 3, 4].flatMap(day => Array.from({ length: parts }, (_, i) => nameOf(day, 'json', i + 1))).sort();
    assert.deepStrictEqual(onDisk(w), expected, 'every part of the newest 3 backups stays; every part of the older two is gone');
    assert.strictEqual(w.removed.length, 2 * parts);
    assert.deepStrictEqual(recordOf(w).map(run => run.ids.length), [parts, parts, parts]);
  } finally { cleanup(); }
});

test('Backups to keep: All, and any value that is not one of the choices, deletes nothing', async () => {
  for (const keep of [undefined, 0, null, 1, 2, 5, -3, 3.5, '7', 'all', NaN, true, {}]) {
    const w = world({ settings: { historyBackupKeep: keep } });
    try {
      await backUp(5);
      assert.strictEqual(onDisk(w).length, 5, `keep ${String(keep)}: every backup is still there`);
      assert.deepStrictEqual(w.log.filter(op => /^(search|removeFile|erase):/.test(op)), [], `keep ${String(keep)}: the browser is not even asked about a download`);
      assert.strictEqual(w.store.scrapfly_history_backup.removed, undefined, `keep ${String(keep)}: no count of deleted files`);
    } finally { cleanup(); }
  }
});

test('Backups to keep: choosing a number later deletes the backups made while it was All, at the next backup; All again deletes nothing more', async () => {
  const w = world();
  try {
    await backUp(4);
    assert.strictEqual(onDisk(w).length, 4);
    w.history.historyBackupKeep = 3;
    await backUp(1, { from: 4 });
    assert.deepStrictEqual(onDisk(w), [nameOf(2), nameOf(3), nameOf(4)]);
    w.history.historyBackupKeep = 0;
    await backUp(2, { from: 5 });
    assert.strictEqual(onDisk(w).length, 5);
  } finally { cleanup(); }
});

test('Backups to keep: the record of backups is bounded, so keeping all never grows it without end', async () => {
  const w = world();
  try {
    await backUp(5, { make: () => Object.assign(fresh(), { MAX_TRACKED_RUNS: 3 }) });
    assert.deepStrictEqual(recordOf(w).map(run => run.at), [NOW + 2 * DAY, NOW + 3 * DAY, NOW + 4 * DAY]);
    assert.strictEqual(onDisk(w).length, 5, 'keeping all deletes nothing, whatever the record holds');
  } finally { cleanup(); }
});

test('Backups to keep: the new backup is on record before anything older is deleted, so a worker stopped mid-way loses no file', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    await backUp(3);
    // The fourth backup starts deleting the first, and the worker is stopped while the browser removes that file
    w.fail.hang = true;
    const real = Date.now;
    Date.now = () => NOW + 3 * DAY;
    fresh().run('alarm');
    await new Promise(resolve => setTimeout(resolve, 25));
    Date.now = real;
    const first = w.log.findIndex(op => op.startsWith('removeFile:'));
    assert.ok(first > 0, w.log.join(' '));
    assert.ok(w.log.indexOf(`set:${HistoryBackup.RUNS_KEY}`, w.log.indexOf(`download:${w.made[3]}`)) < first, `the record is written before the first removal: ${w.log.join(' ')}`);
    const ids = (record) => record.map(run => run.ids);
    assert.deepStrictEqual(ids(w.seen.atFirstRemoval[HistoryBackup.RUNS_KEY]), w.made.slice(0, 4).map(id => [id]), 'at that moment the new backup is on record next to the one being deleted');
    assert.deepStrictEqual(ids(recordOf(w)), w.made.slice(0, 4).map(id => [id]), 'and the stopped worker left it there');
    assert.strictEqual(w.removed.length, 0);
    // The worker starts again: the next backup finds the record and finishes the job
    w.fail.hang = false;
    const after = await backUp(1, { from: 4 });
    assert.strictEqual(after[0].ok, true);
    assert.deepStrictEqual(onDisk(w), [nameOf(2), nameOf(3), nameOf(4)]);
    assert.deepStrictEqual(w.removed, [w.made[0], w.made[1]]);
  } finally { cleanup(); }
});

test('Backups to keep: a file already deleted by hand is only taken off the list, and the backup carries on', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    await backUp(3);
    w.disk.delete([...w.disk][0]);                   // the person deleted the first backup's file themselves
    const [fourth] = await backUp(1, { from: 3 });
    assert.strictEqual(fourth.ok, true);
    assert.deepStrictEqual(w.removed, [], 'there was nothing left to remove');
    assert.ok(!w.list.has(w.made[0]), 'but its entry is erased from the list all the same');
    assert.deepStrictEqual(recordOf(w).map(run => run.ids), [[w.made[1]], [w.made[2]], [w.made[3]]]);
    assert.strictEqual(w.store.scrapfly_history_backup.removed, undefined);
  } finally { cleanup(); }
});

test('Backups to keep: a download the browser has forgotten (its list was cleared) cannot be reached, and the backup carries on', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    await backUp(3);
    w.list.clear();
    const [fourth] = await backUp(1, { from: 3 });
    assert.strictEqual(fourth.ok, true);
    assert.deepStrictEqual(w.removed, []);
    assert.deepStrictEqual(callsTo(w, 'removeFile'), [], 'nothing is removed by a name: an id the browser does not know is left alone');
    assert.strictEqual(onDisk(w).length, 4, 'the forgotten file stays where it is');
    assert.deepStrictEqual(recordOf(w).map(run => run.ids), [[w.made[1]], [w.made[2]], [w.made[3]]], 'and it is no longer on record');
  } finally { cleanup(); }
});

test('Backups to keep: a removal the browser refuses does not fail the backup, and is tried again at the next one', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    w.fail.remove = 'Unable to remove file';          // for example, the file is open in another program
    const results = await backUp(5);
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.strictEqual(w.store.scrapfly_history_backup.ok, true);
    assert.deepStrictEqual(w.notes, [], 'no failure is shown: the backup itself worked');
    assert.strictEqual(onDisk(w).length, 5, 'the two older files are still there');
    assert.ok(recordOf(w).some(run => run.ids.includes(w.made[0])) && recordOf(w).some(run => run.ids.includes(w.made[1])), 'and still on record');
    w.fail.remove = null;
    await backUp(1, { from: 5 });
    assert.deepStrictEqual(onDisk(w), [nameOf(3), nameOf(4), nameOf(5)]);
    assert.deepStrictEqual(w.removed, w.made.slice(0, 3));
    assert.deepStrictEqual(recordOf(w).map(run => run.ids), [[w.made[3]], [w.made[4]], [w.made[5]]]);
  } finally { cleanup(); }
});

test('Backups to keep: if the browser cannot say what a download is, nothing is deleted', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    delete chrome.downloads.search;
    const results = await backUp(6);
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.strictEqual(onDisk(w).length, 6);
    assert.deepStrictEqual(callsTo(w, 'removeFile'), []);
    assert.deepStrictEqual(callsTo(w, 'erase'), []);
  } finally { cleanup(); }
});

test('Backups to keep: only what these backups made is ever deleted, even when an old id now belongs to something else', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    const add = (id, file, extra = {}) => { w.list.set(id, { id, filename: `/home/me/Downloads/${file}`, state: 'complete', ...extra }); w.disk.add(`/home/me/Downloads/${file}`); };
    add(901, 'Scrapfly/scrapfly-history-2026-01-01.json', { byExtensionId: 'ext-abc' });                       // an older backup of this extension
    add(902, 'report.pdf');                                                                                    // the person's own download, which got an old id after the list was cleared
    add(903, 'Scrapfly/scrapfly-history-2026-01-02.json', { byExtensionId: 'another-extension' });             // another extension's file with a name like ours
    add(904, 'scrapfly-logs-1767225600000.json', { byExtensionId: 'ext-abc' });                                // this extension's, but a log export, not a backup
    add(905, 'Scrapfly/notes.txt', { byExtensionId: 'ext-abc' });                                              // in our folder, not named like a backup
    add(906, 'Scrapfly/scrapfly-history-2026-01-03.json');                                                     // named like a backup, but not saved by an extension
    w.store[HistoryBackup.RUNS_KEY] = [{ at: NOW - 10 * DAY, ids: [901, 902, 903, 904, 905, 906] }];
    await backUp(3);
    assert.deepStrictEqual(recordOf(w).length, 3, 'the old record was the oldest of four backups: it is done with');
    assert.deepStrictEqual(w.removed, [901], 'only the backup file was deleted');
    assert.deepStrictEqual(callsTo(w, 'removeFile'), ['removeFile:901']);
    assert.deepStrictEqual(callsTo(w, 'erase'), ['erase:901']);
    for (const id of [902, 903, 904, 905, 906]) assert.ok(w.list.has(id), `${id} is still in the list`);
    assert.strictEqual(onDisk(w).filter(name => !name.startsWith('scrapfly-history-2026-10')).length, 5, 'and its file is still on the disk');
  } finally { cleanup(); }
});

test('Backups to keep: a damaged record never fails a backup, and only whole-number ids ever reach the browser', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    w.store[HistoryBackup.RUNS_KEY] = [{ at: NOW - 9 * DAY, ids: [7, -3, 1.5, '9', null, 11, 2 ** 53, { id: 12 }] }, 'junk', null, 5, { at: 'x', ids: [5] }, { at: NOW - 8 * DAY, ids: 'nope' }, { ids: [6] }];
    const results = await backUp(3);
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.deepStrictEqual(callsTo(w, 'search'), ['search:7', 'search:11']);
    assert.deepStrictEqual(recordOf(w).map(run => run.ids), [[w.made[0]], [w.made[1]], [w.made[2]]], 'what was kept is clean');
  } finally { cleanup(); }
  for (const damaged of [null, 5, 'text', {}, { runs: [] }, true]) {
    const v = world({ settings: { historyBackupKeep: 3 } });
    try {
      v.store[HistoryBackup.RUNS_KEY] = damaged;
      const [result] = await backUp(1);
      assert.strictEqual(result.ok, true, JSON.stringify(damaged));
      assert.deepStrictEqual(recordOf(v), [{ at: NOW, ids: [v.made[0]] }], JSON.stringify(damaged));
    } finally { cleanup(); }
  }
});

test('Backups to keep: a record that cannot be read or written does not fail the backup, and nothing is deleted without it', async () => {
  for (const what of ['written', 'read']) {
    const w = world({ settings: { historyBackupKeep: 3 } });
    try {
      const { get, set } = chrome.storage.local;
      if (what === 'written') chrome.storage.local.set = async (obj) => { if (HistoryBackup.RUNS_KEY in obj) throw new Error('QUOTA_BYTES quota exceeded'); return set(obj); };
      else chrome.storage.local.get = async (keys) => { if ([].concat(keys).includes(HistoryBackup.RUNS_KEY)) throw new Error('storage is unavailable'); return get(keys); };
      const results = await backUp(6);
      assert.ok(results.every(r => r.ok), `${what}: ${JSON.stringify(results)}`);
      assert.strictEqual(w.store.scrapfly_history_backup.ok, true, what);
      assert.strictEqual(onDisk(w).length, 6, `${what}: no file is deleted when the record is not safe`);
      assert.deepStrictEqual(callsTo(w, 'removeFile'), [], what);
    } finally { cleanup(); }
  }
});

test('Backups to keep: a backup that failed deletes nothing; the parts it did write are remembered and go with the next good backup', async () => {
  const w = world({ items: bigHistory(), settings: { historyBackupKeep: 3 } });
  try {
    const make = inParts();
    const parts = (await backUp(3, { make }))[0].files;
    assert.ok(parts > 1);
    const before = [...w.disk].sort();
    // The browser refuses the downloads: the backup fails at its first part and deletes nothing
    w.fail.download = 'Download blocked by policy';
    const refused = await withNow(() => make().run('alarm'), NOW + 3 * DAY);
    assert.strictEqual(refused.ok, false);
    assert.deepStrictEqual([...w.disk].sort(), before);
    assert.deepStrictEqual(w.removed, []);
    assert.strictEqual(recordOf(w).length, 3, 'it wrote no file, so it is not on record');
    // The next one writes its first part and then fails (a full disk): that part is a file these backups made, so it is on record, but it is not a backup to keep
    w.fail.after = 1;
    const cut = await withNow(() => make().run('alarm'), NOW + 4 * DAY);
    assert.strictEqual(cut.ok, false);
    const lonely = w.made[w.made.length - 1];
    assert.strictEqual(w.disk.size, before.length + 1);
    assert.deepStrictEqual(w.removed, [], 'and a failed backup still deletes nothing');
    assert.deepStrictEqual(recordOf(w).slice(-1), [{ at: NOW + 4 * DAY, ids: [lonely], partial: true }]);
    // A good backup follows: the newest three real backups stay (days 1, 2 and 5), the cut one goes with the oldest
    w.fail.download = null;
    const good = await withNow(() => make().run('alarm'), NOW + 5 * DAY);
    assert.strictEqual(good.ok, true);
    assert.ok(w.removed.includes(lonely), 'the leftover part was deleted');
    assert.deepStrictEqual(onDisk(w), [1, 2, 5].flatMap(day => Array.from({ length: parts }, (_, i) => nameOf(day, 'json', i + 1))).sort());
    assert.deepStrictEqual(recordOf(w).map(run => run.at), [NOW + DAY, NOW + 2 * DAY, NOW + 5 * DAY]);
  } finally { cleanup(); }
});

test('Backups to keep: a run that had nothing to write is not a backup, so a string of them cannot push the real ones out', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    await backUp(3);
    w.store.scrapfly_history = JSON.stringify({ items: [] });     // History was cleared
    const results = await backUp(4, { from: 3 });
    assert.ok(results.every(r => r.ok && r.files === 0), JSON.stringify(results));
    assert.deepStrictEqual(onDisk(w), [nameOf(0), nameOf(1), nameOf(2)]);
    assert.strictEqual(recordOf(w).length, 3);
    assert.deepStrictEqual(w.removed, []);
  } finally { cleanup(); }
});
