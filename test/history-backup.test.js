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
 * Chrome's:
 *  - download() answers with an id as soon as the download has started; the file is written afterwards, and onChanged tells when (or
 *    that the download was interrupted: a full disk, a folder that cannot be written, a download blocked or cancelled). How each one
 *    ends is browser.ends: 'complete' (the default), 'interrupted' (with browser.reason), 'never' (still in progress, until finish(id)),
 *    'before' (written, and told, before download() answers) or 'unheard' (written before download() answers, and never told).
 *  - ids are the browser's own (not a count), and they are handed out again: after restart() the next id follows the highest one
 *    still in the list, so 1 again once the list was cleared, as Chrome numbers them.
 *  - a taken name is made unique; a finished download can have its file removed from the disk and its entry erased from the list; a
 *    file deleted by hand is reported with exists: false; and a call that cannot work throws what Chrome throws.
 *
 *   downloads  what the extension asked to download, in order     made     the ids the browser gave, in order (paths: where each was written)
 *   list       the browser's downloads list (id -> item)           disk     the paths of the files on the disk
 *   removed    the ids whose file was removed                      log      every call, in order: download:41, set:key, search:41, removeFile:41, erase:41
 *   fail       { download, after, remove, hang }: make downloads fail (after that many have worked), make removeFile fail with a
 *              message, or never answer (a worker that is stopped in the middle of a delete)
 *   browser    { ends, reason }: how the downloads end (a value, or a function of the download's number, 0 first), and why one is interrupted
 *   seen       the storage as it was when the first file was about to be removed
 *   finish(id, how)  ends a download still in progress     restart({ clear })  the browser restarts (after "Clear all")     settle()  lets the downloads end
 */
function world({ items = [entry(1), entry(2)], settings = {}, notifications = true, failDownload = null } = {}) {
  const store = { scrapfly_history: JSON.stringify({ items }) };
  const downloads = [];
  const notes = [];
  const alarms = new Map();
  const listeners = { alarm: [], changed: [], downloads: [] };
  const log = [];
  const list = new Map();
  const disk = new Set();
  const made = [];
  const paths = [];
  const removed = [];
  const fail = { download: failDownload, after: 0, remove: null, hang: false };
  const browser = { ends: 'complete', reason: 'FILE_NO_SPACE' };
  const seen = { atFirstRemoval: null };
  let lastId = 40;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  /** A download in progress ends: 'complete' writes its file, anything else interrupts it ('interrupted': for browser.reason). */
  const finish = (id, how = 'complete', { told = true } = {}) => {
    const item = list.get(id);
    if (!item || item.state !== 'in_progress') return;
    if (how === 'complete') {
      item.state = 'complete';
      disk.add(item.filename);
    } else {
      item.state = 'interrupted';
      item.error = how === 'interrupted' ? browser.reason : how;
    }
    // What Chrome sends: only what changed, each as { previous, current }
    const delta = { id, state: { previous: 'in_progress', current: item.state }, ...(item.error ? { error: { current: item.error } } : {}) };
    if (told) for (const fn of listeners.downloads.slice()) fn(clone(delta));
  };
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
        // A name is taken by a file on the disk, or by a download still writing it
        const taken = (file) => disk.has(file) || [...list.values()].some(item => item.state === 'in_progress' && item.filename === file);
        let file = `/home/me/Downloads/${options.filename}`;
        for (let n = 1; taken(file); n++) file = `/home/me/Downloads/${options.filename.replace(/(\.[^./]+)$/, ` (${n})$1`)}`;
        list.set(id, { id, filename: file, byExtensionId: 'ext-abc', state: 'in_progress', startTime: new Date(Date.now()).toISOString() });
        made.push(id);
        paths.push(file);
        log.push(`download:${id}`);
        const how = typeof browser.ends === 'function' ? browser.ends(made.length - 1, options) : browser.ends;
        if (how === 'before') finish(id);
        else if (how === 'unheard') finish(id, 'complete', { told: false });
        else if (how !== 'never') setTimeout(() => finish(id, how), 0);
        return id;
      },
      search: async (query) => {
        log.push(`search:${query.id}`);
        return list.has(query.id) ? [{ ...clone(list.get(query.id)), exists: disk.has(list.get(query.id).filename) }] : [];
      },
      removeFile: async (id) => {
        log.push(`removeFile:${id}`);
        if (!seen.atFirstRemoval) seen.atFirstRemoval = clone(store);
        if (fail.hang) await new Promise(() => {});
        const item = list.get(id);
        if (!item) throw new Error('Invalid downloadId');
        if (item.state !== 'complete') throw new Error('Download must be complete');
        if (!disk.has(item.filename)) throw new Error('Download file already deleted');
        if (fail.remove) throw new Error(fail.remove);
        disk.delete(item.filename);
        removed.push(id);
      },
      erase: async (query) => { log.push(`erase:${query.id}`); return list.delete(query.id) ? [query.id] : []; },
      onChanged: {
        addListener: (fn) => listeners.downloads.push(fn),
        removeListener: (fn) => { const at = listeners.downloads.indexOf(fn); if (at >= 0) listeners.downloads.splice(at, 1); }
      }
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
  /**
   * The browser restarts, after "Clear all" in chrome://downloads when `clear` (the files stay on the disk): a download still in
   * progress is cut short, the worker that listened is gone, and the next id follows the highest one left in the list.
   */
  const restart = ({ clear = false } = {}) => {
    if (clear) list.clear();
    for (const item of list.values()) if (item.state === 'in_progress') Object.assign(item, { state: 'interrupted', error: 'USER_SHUTDOWN' });
    listeners.downloads.length = 0;
    lastId = Math.max(0, ...list.keys());
  };
  const settle = () => new Promise(resolve => setTimeout(resolve, 5));
  return { store, downloads, notes, alarms, listeners, history, log, list, disk, made, paths, removed, fail, browser, seen, finish, restart, settle };
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
/** The calls about any download but the ones these backups made (a backup asks the browser whether its own files are written). */
const callsAboutOthers = (w, name) => callsTo(w, name).filter(op => !w.made.some(id => op === `${name}:${id}`));
/** A download already in the browser's list, its file on the disk: what an earlier version, or the person, left there. */
const listed = (w, id, file, startedAt, extra = {}) => {
  const filename = `/home/me/Downloads/${file}`;
  w.list.set(id, { id, filename, byExtensionId: 'ext-abc', state: 'complete', startTime: new Date(startedAt).toISOString(), ...extra });
  w.disk.add(filename);
};
/** What the record holds for the backup made on `day` by the downloads numbered `from` (0 first) on: their ids, and when and where each file was written. */
const onRecordAs = (w, day, from, count = 1, extra = {}) => ({
  at: NOW + day * DAY,
  ids: w.made.slice(from, from + count),
  files: w.made.slice(from, from + count).map((id, i) => ({ id, start: NOW + day * DAY, name: w.paths[from + i] })),
  ...extra
});
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
    assert.deepStrictEqual(recordOf(w), [3, 4, 5].map(day => onRecordAs(w, day, day)), 'each with when its file started and where it was written');
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
      assert.deepStrictEqual(w.log.filter(op => /^(removeFile|erase):/.test(op)), [], `keep ${String(keep)}: nothing is removed or erased`);
      assert.deepStrictEqual(callsAboutOthers(w, 'search'), [], `keep ${String(keep)}: the browser is not even asked about a download but the new backups' own`);
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
    // Each started with the run that recorded it, so only what it is decides
    const add = (id, file, extra = {}) => listed(w, id, file, NOW - 10 * DAY + 2000, { byExtensionId: undefined, ...extra });
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
    assert.deepStrictEqual(callsAboutOthers(w, 'search'), ['search:7', 'search:11']);
    assert.deepStrictEqual(recordOf(w).map(run => run.ids), [[w.made[0]], [w.made[1]], [w.made[2]]], 'what was kept is clean');
  } finally { cleanup(); }
  for (const damaged of [null, 5, 'text', {}, { runs: [] }, true]) {
    const v = world({ settings: { historyBackupKeep: 3 } });
    try {
      v.store[HistoryBackup.RUNS_KEY] = damaged;
      const [result] = await backUp(1);
      assert.strictEqual(result.ok, true, JSON.stringify(damaged));
      assert.deepStrictEqual(recordOf(v), [onRecordAs(v, 0, 0)], JSON.stringify(damaged));
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
    await w.settle();                                             // the part's file is written after download() answered
    assert.strictEqual(w.disk.size, before.length + 1);
    assert.deepStrictEqual(w.removed, [], 'and a failed backup still deletes nothing');
    assert.deepStrictEqual(recordOf(w).slice(-1), [onRecordAs(w, 4, w.made.length - 1, 1, { partial: true })]);
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

// ---- A backup counts once its files are written: download() answers when a download starts, and the file can still fail after that

/** A backup that waits `ms` at most for its files (the real wait is a minute). */
const waiting = (ms) => () => Object.assign(fresh(), { WRITE_WAIT_MS: ms });
const lastOf = (w) => recordOf(w)[recordOf(w).length - 1];

test('Backups to keep: nothing older is deleted until the new backup is written; a backup whose download is interrupted fails, says why, notifies and deletes nothing', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    await backUp(3);
    const good = onDisk(w);
    assert.deepStrictEqual(good, [nameOf(0), nameOf(1), nameOf(2)]);
    // The disk fills up: every download starts (download() answers with its id), then is interrupted
    w.browser.ends = 'interrupted';
    const failed = await backUp(3, { from: 3 });
    for (const result of failed) assert.deepStrictEqual(result, { ok: false, entries: 0, files: 0, error: 'Download interrupted (FILE_NO_SPACE)' });
    assert.deepStrictEqual(onDisk(w), good, 'three broken backups in a row and the three good ones are all still there');
    assert.deepStrictEqual(w.removed, []);
    assert.deepStrictEqual(callsTo(w, 'removeFile'), [], 'not one file was even asked to go');
    assert.deepStrictEqual(w.store.scrapfly_history_backup, { at: NOW + 5 * DAY, ok: false, error: 'Download interrupted (FILE_NO_SPACE)', trigger: 'alarm' }, 'Settings shows that the backup failed');
    assert.deepStrictEqual(w.notes.map(note => note.id), Array(3).fill('scrapfly-history-backup-failed'), 'with the failure notification each time');
    assert.deepStrictEqual(recordOf(w).map(run => run.partial === true), [false, false, false, true, true, true], 'the broken runs are on record, never as backups to keep');
    // Space is freed: the next backup is written, and only then does the oldest good one go (with the broken runs' entries)
    w.browser.ends = 'complete';
    const [next] = await backUp(1, { from: 6 });
    assert.deepStrictEqual(next, { ok: true, entries: 2, files: 1 });
    assert.deepStrictEqual(onDisk(w), [nameOf(1), nameOf(2), nameOf(6)]);
    assert.deepStrictEqual(w.removed, [w.made[0]]);
    assert.deepStrictEqual(recordOf(w).map(run => run.at), [1, 2, 6].map(day => NOW + day * DAY));
    for (const id of w.made.slice(3, 6)) assert.ok(!w.list.has(id), `the interrupted download ${id} left the browser list`);
  } finally { cleanup(); }
});

test('Backups to keep: a download still not written when the wait is over fails the backup and deletes nothing; it is on record from the start, never as a backup to keep', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    await backUp(3);
    w.browser.ends = 'never';
    const real = Date.now;
    Date.now = () => NOW + 3 * DAY;
    let stuck;
    try {
      const running = waiting(40)().run('alarm');
      await new Promise(resolve => setTimeout(resolve, 10));
      // While it waits, the started download is on record (a worker stopped now would lose track of no file), but not as a backup
      assert.deepStrictEqual(lastOf(w), { at: NOW + 3 * DAY, ids: [w.made[3]], partial: true });
      assert.deepStrictEqual(callsTo(w, 'removeFile'), [], 'and nothing older is deleted while it is not written');
      stuck = await running;
    } finally { Date.now = real; }
    assert.strictEqual(stuck.ok, false);
    assert.strictEqual(stuck.error, 'Download did not finish within 1 s', 'the time limit is a minute; this test waits 40 ms');
    assert.strictEqual(HistoryBackup.WRITE_WAIT_MS, 60000);
    assert.strictEqual(w.store.scrapfly_history_backup.ok, false);
    assert.strictEqual(w.notes.length, 1);
    assert.deepStrictEqual(w.removed, []);
    assert.deepStrictEqual(onDisk(w), [nameOf(0), nameOf(1), nameOf(2)]);
    assert.strictEqual(lastOf(w).partial, true);
    // The download ends later, after the backup gave up on it: it was never a backup to keep, so the next good one takes it along
    const late = w.made[3];
    w.finish(late);
    w.browser.ends = 'complete';
    await backUp(1, { from: 4 });
    assert.deepStrictEqual(onDisk(w), [nameOf(1), nameOf(2), nameOf(4)]);
    assert.deepStrictEqual([...w.removed].sort(), [w.made[0], late].sort());
  } finally { cleanup(); }
});

test('Backups to keep: a backup in parts with one part interrupted is no backup; it fails and deletes nothing, and its written parts go with the next good one', async () => {
  const w = world({ items: bigHistory(), settings: { historyBackupKeep: 3 } });
  try {
    const make = inParts();
    const parts = (await backUp(3, { make }))[0].files;
    assert.ok(parts > 2, `several parts: ${parts}`);
    const before = onDisk(w);
    const first = w.made.length;
    w.browser.ends = (n) => (n === first + 1 ? 'interrupted' : 'complete');    // the second part of the fourth backup
    const [cut] = await backUp(1, { from: 3, make });
    assert.strictEqual(cut.ok, false);
    assert.strictEqual(cut.error, 'Download interrupted (FILE_NO_SPACE)');
    await w.settle();
    assert.deepStrictEqual(w.removed, []);
    assert.strictEqual(onDisk(w).length, before.length + parts - 1, 'its other parts were written');
    assert.deepStrictEqual([lastOf(w).ids, lastOf(w).partial], [w.made.slice(first), true], 'every part is on record, as no backup to keep');
    w.browser.ends = 'complete';
    const [good] = await backUp(1, { from: 4, make });
    assert.strictEqual(good.ok, true);
    assert.deepStrictEqual(onDisk(w), [1, 2, 4].flatMap(day => Array.from({ length: parts }, (_, i) => nameOf(day, 'json', i + 1))).sort(), 'the backups kept are days 1, 2 and 4: day 0 and what day 3 wrote are gone');
  } finally { cleanup(); }
});

test('Backups to keep: a file written before download() answers, or whose news never comes, is still known to be written, without waiting for the time limit', async () => {
  for (const ends of ['before', 'unheard']) {
    const w = world({ settings: { historyBackupKeep: 3 } });
    try {
      w.browser.ends = ends;
      const started = process.hrtime.bigint();
      const results = await backUp(4, { make: waiting(5000) });
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      assert.ok(results.every(r => r.ok), `${ends}: ${JSON.stringify(results)}`);
      assert.ok(ms < 2000, `${ends}: four backups took ${Math.round(ms)} ms, so one waited for the time limit`);
      assert.deepStrictEqual(onDisk(w), [nameOf(1), nameOf(2), nameOf(3)], ends);
      assert.deepStrictEqual(w.listeners.downloads, [], `${ends}: the backup stopped listening when it was done`);
    } finally { cleanup(); }
  }
});

test('a backup keeps the worker awake while it waits for its files, and lets it go when it is done, whatever the outcome', async () => {
  const calls = [];
  for (const ends of ['never', 'complete', 'interrupted']) {
    const w = world();
    global.workerKeepaliveManager = { startOperation: (id, info) => calls.push(['start', id, info && info.reason]), endOperation: (id) => calls.push(['end', id]) };
    try {
      calls.length = 0;
      w.browser.ends = ends;
      const running = waiting(40)().run('manual');
      await new Promise(resolve => setTimeout(resolve, ends === 'never' ? 15 : 0));
      if (ends === 'never') {
        assert.ok(calls.some(([what, id, reason]) => what === 'start' && id === 'history-backup' && reason === 'history_backup'), `${ends}: awake while it waits: ${JSON.stringify(calls)}`);
        assert.ok(!calls.some(([what]) => what === 'end'), `${ends}: not let go before the file is written`);
      }
      await running;
      assert.deepStrictEqual(calls[0], ['start', 'history-backup', 'history_backup'], `${ends}: ${JSON.stringify(calls)}`);
      assert.deepStrictEqual(calls[calls.length - 1], ['end', 'history-backup'], `${ends}: ${JSON.stringify(calls)}`);
    } finally { delete global.workerKeepaliveManager; cleanup(); }
  }
});

test('Back up now tells the page that asked when its file could not be written', async () => {
  const w = world();
  try {
    w.browser.ends = 'interrupted';
    w.browser.reason = 'FILE_ACCESS_DENIED';
    const registry = {};
    fresh().registerHandlers(registry);
    const answer = await new Promise(resolve => registry[HistoryBackup.Messages.BACKUP_NOW]({ sender: { url: 'chrome-extension://abc/popup.html' }, sendResponse: resolve }));
    assert.deepStrictEqual(answer, { status: 'error', ok: false, entries: 0, files: 0, error: 'Download interrupted (FILE_ACCESS_DENIED)' });
  } finally { cleanup(); }
});

// ---- An id is not for ever: Chrome numbers downloads again from the highest one left in its list when it starts, so once the list is
// cleared (chrome://downloads → Clear all, or clearing the download history) and the browser restarts, an old backup's id goes to a new download


test('Backups to keep: each backup is on record with when its files started and where the browser wrote them', async () => {
  const w = world({ items: bigHistory() });
  try {
    await backUp(1, { make: inParts() });
    const parts = w.made.length;
    assert.ok(parts > 1);
    await withNow(() => inParts()().run('manual'), NOW + 60000);       // a second backup the same day: the browser makes the names unique
    assert.deepStrictEqual(recordOf(w)[0], onRecordAs(w, 0, 0, parts));
    const second = recordOf(w)[1];
    assert.deepStrictEqual(second.files.map(file => file.name), w.paths.slice(parts));
    assert.ok(second.files.every(file => / \(1\)\.json$/.test(file.name) && file.start === NOW + 60000), JSON.stringify(second));
  } finally { cleanup(); }
});

test('Backups to keep: after the downloads list is cleared and the browser restarts, a new backup that gets an old backup\'s id is never deleted for it', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    w.restart();                                              // a profile whose list is empty: the first download is 1
    await backUp(3);
    assert.deepStrictEqual(w.made, [1, 2, 3]);
    w.restart({ clear: true });                               // Clear all (the files stay on the disk), then a restart
    for (let day = 3; day < 6; day++) {
      const [result] = await backUp(1, { from: day });
      assert.strictEqual(result.ok, true);
      assert.ok(onDisk(w).includes(nameOf(day)), `day ${day}: the backup just made is still there (${onDisk(w).join(', ')})`);
    }
    assert.deepStrictEqual(w.made, [1, 2, 3, 1, 2, 3], 'the new backups got the old ids');
    assert.deepStrictEqual(w.removed, [], 'nothing was deleted: the old backups cannot be reached by their ids any more');
    assert.deepStrictEqual(onDisk(w), [0, 1, 2, 3, 4, 5].map(day => nameOf(day)), 'so they stay, like the ones made before 3.1.7');
    assert.deepStrictEqual(recordOf(w), [3, 4, 5].map(day => onRecordAs(w, day, day)), 'only what can still be reached is on record');
    assert.strictEqual(w.store.scrapfly_history_backup.removed, undefined);
    // From there on it works as before
    await backUp(1, { from: 6 });
    assert.deepStrictEqual(w.removed, [1], 'day 3\'s file, by its new id');
    assert.deepStrictEqual(onDisk(w), [0, 1, 2, 4, 5, 6].map(day => nameOf(day)));
  } finally { cleanup(); }
});

test('Backups to keep: lowered from All to 3 after the downloads list was cleared, it deletes only the oldest of the backups it can still reach', async () => {
  const w = world();
  try {
    w.restart();
    await backUp(10);                                         // ids 1 to 10
    w.restart({ clear: true });
    await backUp(5, { from: 10 });                            // ids 1 to 5 again
    w.history.historyBackupKeep = 3;
    const [result] = await backUp(1, { from: 15 });           // id 6
    assert.strictEqual(result.ok, true);
    assert.strictEqual(w.store.scrapfly_history_backup.removed, 3);
    const days = (from, to) => Array.from({ length: to - from }, (_, i) => nameOf(from + i));
    assert.deepStrictEqual(onDisk(w), [...days(0, 10), ...days(13, 16)].sort(), 'days 10 to 12 went; the newest three stay, and the ten it can no longer reach');
    assert.deepStrictEqual(recordOf(w).map(run => run.at), [13, 14, 15].map(day => NOW + day * DAY));
  } finally { cleanup(); }
});

test('Backups to keep: a record written by 3.1.7 holds only ids, so a download is taken for that backup only if it started within minutes of it', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    const at = NOW - 10 * DAY;
    listed(w, 901, 'Scrapfly/scrapfly-history-2026-10-09-part-1.json', at + 2000);         // the backup itself
    listed(w, 902, 'Scrapfly/scrapfly-history-2026-10-09-part-2.json', at + 9 * 60000);    // its last part, slow to start
    listed(w, 903, 'Scrapfly/scrapfly-history-2026-10-12.json', at + 3 * DAY);             // a later backup that got an old id
    listed(w, 904, 'Scrapfly/scrapfly-history-2026-10-09 (1).json', at + 11 * 60000);      // eleven minutes after it: another run's
    listed(w, 905, 'Scrapfly/scrapfly-history-2026-10-08.json', at - DAY);                 // a day before it
    listed(w, 906, 'Scrapfly/scrapfly-history-2026-10-09 (2).json', at + 2000, { startTime: 'not a time' });
    w.store[HistoryBackup.RUNS_KEY] = [{ at, ids: [901, 902, 903, 904, 905, 906] }];
    await backUp(3);
    assert.deepStrictEqual(w.removed, [901, 902], 'only the downloads that started with that run');
    for (const id of [903, 904, 905, 906]) assert.ok(w.list.has(id) && w.disk.has(w.list.get(id).filename), `${id} is still there, and in the list`);
    assert.deepStrictEqual(callsAboutOthers(w, 'erase'), ['erase:901', 'erase:902']);
    assert.deepStrictEqual(recordOf(w).map(run => run.at), [0, 1, 2].map(day => NOW + day * DAY));
  } finally { cleanup(); }
});

test('Backups to keep: a download is taken for a recorded file only while it is the same one: same start, same file', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    await backUp(1);
    const [first] = w.made;
    // The browser now has another download under that id (the list was cleared and it restarted): a backup of this extension in the
    // same folder, started the same day; first one that started later, then one that wrote another file
    const item = w.list.get(first);
    w.list.set(first, { ...item, startTime: new Date(NOW + 1000).toISOString() });
    await backUp(3, { from: 1 });
    assert.deepStrictEqual(w.removed, [], 'started a second later: not the recorded file');
    assert.ok(w.list.has(first), 'and its entry stays in the list');
    const v = world({ settings: { historyBackupKeep: 3 } });
    await backUp(1);
    const other = v.made[0];
    v.list.set(other, { ...v.list.get(other), filename: '/home/me/Downloads/Scrapfly/scrapfly-history-2026-10-19 (1).json' });
    v.disk.add('/home/me/Downloads/Scrapfly/scrapfly-history-2026-10-19 (1).json');
    await backUp(3, { from: 1 });
    assert.deepStrictEqual(v.removed, [], 'another file under the same start: not the recorded file');
  } finally { cleanup(); }
});

test('Backups to keep: an id that belongs to a backup being kept is never deleted, whatever older record names it', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    w.restart();
    // 3.1.7 recorded a backup as id 1. The downloads list was cleared and the browser restarted, and three backups followed within
    // minutes: the first got id 1 again, and started close enough to the old record to pass for its file
    w.store[HistoryBackup.RUNS_KEY] = [{ at: NOW - 60000, ids: [1] }];
    for (let i = 0; i < 3; i++) await withNow(() => fresh().run('manual'), NOW + i * 60000);
    assert.deepStrictEqual(w.made, [1, 2, 3]);
    assert.deepStrictEqual(w.removed, [], 'the old record\'s id belongs to a backup being kept');
    assert.deepStrictEqual(callsAboutOthers(w, 'search'), [], 'so the browser is not even asked about it for the old record');
    assert.strictEqual(onDisk(w).length, 3);
    assert.deepStrictEqual(recordOf(w).map(run => run.ids), [[1], [2], [3]], 'and the old record is done with');
  } finally { cleanup(); }
});

test('Backups to keep: a damaged description of a file is left out and the run\'s time stands in for it; it never fails a backup', async () => {
  const w = world({ settings: { historyBackupKeep: 3 } });
  try {
    const at = NOW - 10 * DAY;
    listed(w, 901, 'Scrapfly/scrapfly-history-2026-10-09.json', at + 2000);
    listed(w, 902, 'Scrapfly/scrapfly-history-2026-10-09 (1).json', at + 3000);
    const second = '/home/me/Downloads/Scrapfly/scrapfly-history-2026-10-09 (1).json';
    w.store[HistoryBackup.RUNS_KEY] = [{ at, ids: [901, 902], files: [{ id: 901, start: 'yesterday', name: 5 }, null, 'junk', { id: 902, start: at + 4000, name: second }, { id: 77, start: at, name: '' }] }];
    const results = await backUp(3);
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.deepStrictEqual(w.removed, [901], '901 by the run\'s time; 902\'s description is whole, and says it started a second later than the download under its id');
    assert.ok(w.list.has(902) && w.disk.has(second));
  } finally { cleanup(); }
});
