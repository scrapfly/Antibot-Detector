const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { storageWorld, plain } = require('./helpers/unreadable-storage');

// The backup and the watchlist keep their schedule in alarms that follow Settings → History. A worker that cannot read the settings
// used to take their defaults, which are "off", and clear the alarms: they came back only at the next worker start or settings
// change, so a backup or a check that was set could silently stop. And a watch check that ran meanwhile opened pages with
// History's pause and ignored sites unknown. Now the settings that cannot be read leave the alarms as they are and no page is
// visited. The watchlist's catch-up alarm is also set only when it is not: every worker start asked for it again, which moved an
// alarm that was due in two minutes two minutes further each time. The real History modules run here in a vm context, with the
// real StorageManager and Utils over a storage the test controls, and a browser whose alarms and tabs the test sees.

const DAMAGED = [
  ['a read that fails', (w) => { w.state.failGet = (key) => key === 'scrapfly_settings'; }],
  ['text that is not JSON', (w) => { w.store.scrapfly_settings = 'S3CR3T-WEBHOOK-VALUE is not json'; }],
  ['JSON that is not an object', (w) => { w.store.scrapfly_settings = '42'; }]
];
const settingsOf = (history) => JSON.stringify({ timestamp: '2026-11-06T00:00:00.000Z', settings: { history } });
const entry = { id: 'a', url: 'https://a.example/page', hostname: 'a.example', title: 'A', timestamp: 1000, pinned: true, watch: true,
  detections: [{ detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 90 }] };

const FILES = ['modules/core/constants.js', 'modules/core/storage-manager.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js', 'utils/utils.js',
  'modules/core/categories.js', 'utils/url-utils.js', 'modules/core/message-sender.js', 'modules/core/history-store.js', 'modules/core/history-policy.js', 'modules/core/history-export.js',
  'background/history-backup.js', 'background/history-watch.js'];

function world(history = { historyBackup: 'daily', historyWatch: 'daily' }) {
  const alarms = new Map();
  const log = { created: [], cleared: [], downloads: [], scans: [], applied: [] };
  const w = storageWorld({
    store: { scrapfly_settings: settingsOf(history), scrapfly_history: JSON.stringify({ items: [entry] }) },
    files: FILES,
    globals: {
      BackgroundTabScan: {
        OPEN_TABS_KEY: 'open-tabs', ownerOf: () => null, scanFinished() {}, closeLeftoverTabs: async () => {},
        normalWindowId: async () => 7,
        scan: async (url) => { log.scans.push(url); return { ok: true, url, results: plain(entry.detections) }; }
      },
      HistoryRecorder: { applyWatchResult: async (id) => { log.applied.push(id); return { found: true, changed: false }; }, noteWatchAttempt: async () => {} }
    },
    chrome: {
      alarms: {
        get: async (name) => alarms.get(name),
        create: (name, info) => { log.created.push(name); alarms.set(name, { name, ...info }); },
        clear: async (name) => { log.cleared.push(name); return alarms.delete(name); },
        onAlarm: { addListener() {} }
      },
      downloads: { download: async (options) => { log.downloads.push(options); return log.downloads.length; } },
      notifications: { create() {} }
    }
  });
  const Backup = vm.runInContext('HistoryBackup', w.ctx);
  const Watch = vm.runInContext('HistoryWatch', w.ctx);
  Watch.sleep = () => Promise.resolve();
  return { ...w, Backup, Watch, alarms, log };
}

test('the alarms follow the settings that read: set, re-timed and cleared', async () => {
  const w = world({ historyBackup: 'weekly', historyWatch: 'weekly' });
  await w.Backup.sync(false);
  await w.Watch.sync(false);
  assert.equal(w.alarms.get(w.Backup.ALARM_NAME).periodInMinutes, 10080);
  assert.equal(w.alarms.get(w.Watch.ALARM_NAME).periodInMinutes, 10080);
  w.store.scrapfly_settings = settingsOf({ historyBackup: 'off', historyWatch: 'off' });
  await w.Backup.sync(false);
  await w.Watch.sync(false);
  assert.equal(w.alarms.has(w.Backup.ALARM_NAME), false, 'switched off in settings that read: cleared, as before');
  assert.equal(w.alarms.has(w.Watch.ALARM_NAME), false);
});

test('settings that cannot be read leave the backup and watchlist alarms as they are, and run nothing from a default', async () => {
  for (const [what, spoil] of DAMAGED) {
    const w = world({ historyBackup: 'daily', historyWatch: 'daily' });
    await w.Backup.sync(false);
    await w.Watch.sync(false);
    w.alarms.set(w.Watch.SOON_ALARM_NAME, { name: w.Watch.SOON_ALARM_NAME, delayInMinutes: 2 });
    const before = plain([...w.alarms.values()]);
    w.log.cleared.length = 0;
    w.log.created.length = 0;
    spoil(w);

    // What the worker does at every start (with a catch-up) and when settings change
    await w.Backup.sync(true);
    await w.Watch.sync(true);
    await w.Backup.sync(false);
    await w.Watch.sync(false);
    assert.deepEqual(w.log.cleared, [], `${what}: nothing is cleared`);
    assert.deepEqual(w.log.created, [], `${what}: nothing is set again`);
    assert.deepEqual(plain([...w.alarms.values()]), before, `${what}: the alarms are as they were`);
    assert.deepEqual(w.log.downloads, [], `${what}: no backup runs from a default`);
  }
});

test('a check of the watchlist does not open a page while History\'s pause and ignored sites cannot be read, and leaves no record that holds the next one back', async () => {
  for (const [what, spoil] of DAMAGED) {
    const w = world({ historyEnabled: false, historyExcludedDomains: ['a.example'], historyWatch: 'daily' });
    spoil(w);
    const result = await w.Watch.run('alarm');
    assert.equal(result.ok, false, what);
    assert.equal(result.error, 'unreadable_settings', what);
    assert.deepEqual(w.log.scans, [], `${what}: no page was opened`);
    assert.deepEqual(w.log.applied, [], what);
    assert.equal(w.store.scrapfly_history_watch, undefined, `${what}: the check is not recorded, so the next one is not "too soon"`);
  }
  // With the settings readable the check goes on to the page, as before (History is on and watching)
  const w = world({ historyEnabled: true, historyWatch: 'daily' });
  const ran = await w.Watch.run('manual');
  assert.equal(ran.ok, true);
  assert.deepEqual(w.log.scans, ['https://a.example/page']);
  // and a paused History is still "paused"
  const paused = world({ historyEnabled: false, historyWatch: 'daily' });
  assert.equal((await paused.Watch.run('manual')).error, 'paused');
});

test('when the settings stop reading in the middle of a check, the pages left are not opened on a guess', async () => {
  const w = world({ historyEnabled: true, historyWatch: 'daily' });
  const other = { ...entry, id: 'b', url: 'https://b.example/page', hostname: 'b.example' };
  w.store.scrapfly_history = JSON.stringify({ items: [entry, other] });
  const scan = w.ctx.BackgroundTabScan.scan;
  w.ctx.BackgroundTabScan.scan = async (url, ...rest) => {
    const done = await scan(url, ...rest);
    w.store.scrapfly_settings = 'not json';   // the settings stop reading after the first page
    return done;
  };
  const result = await w.Watch.run('manual');
  assert.deepEqual(w.log.scans, ['https://a.example/page'], 'the second page is not opened on a guess');
  // The check stops there and says why, rather than going through the pages left and counting them skipped; and the page whose
  // scan came in as the settings stopped reading is not written either (they no longer say whether History is paused)
  assert.deepEqual([result.ok, result.error, result.stopped, result.skipped], [false, 'unreadable_settings', true, 0]);
  assert.deepEqual(w.log.applied, [], 'nothing is written on a guess');
  assert.deepEqual([w.store.scrapfly_history_watch.error, w.store.scrapfly_history_watch.stopped], ['unreadable_settings', true]);
});

// ---- The catch-up alarm

test('the catch-up alarm is set when a check is overdue and not set again while it waits, however often the worker starts', async () => {
  const w = world({ historyWatch: 'daily' });
  await w.Watch.sync(true);
  assert.deepEqual(w.log.created.filter(name => name === w.Watch.SOON_ALARM_NAME), [w.Watch.SOON_ALARM_NAME], 'never checked: due, set once');
  assert.equal(w.alarms.get(w.Watch.SOON_ALARM_NAME).delayInMinutes, 2);
  const first = w.alarms.get(w.Watch.SOON_ALARM_NAME);
  for (let wake = 0; wake < 5; wake++) await w.Watch.sync(true);
  assert.deepEqual(w.log.created.filter(name => name === w.Watch.SOON_ALARM_NAME), [w.Watch.SOON_ALARM_NAME], 'five more starts: still the one');
  assert.equal(w.alarms.get(w.Watch.SOON_ALARM_NAME), first, 'it is not moved');

  // Once it has fired it is gone, and a later start that finds the check still due sets it again
  w.alarms.delete(w.Watch.SOON_ALARM_NAME);
  await w.Watch.sync(true);
  assert.equal(w.log.created.filter(name => name === w.Watch.SOON_ALARM_NAME).length, 2);
});

test('when the browser cannot say whether the catch-up alarm is set, it is set', async () => {
  const w = world({ historyWatch: 'daily' });
  w.ctx.chrome.alarms.get = async (name) => { if (name === w.Watch.SOON_ALARM_NAME) throw new Error('alarms are unavailable'); return w.alarms.get(name); };
  await w.Watch.sync(true);
  assert.ok(w.alarms.has(w.Watch.SOON_ALARM_NAME));
});

test('a check that is not due sets no catch-up, as before', async () => {
  const w = world({ historyWatch: 'daily' });
  w.store.scrapfly_history_watch = { at: Date.now() - 60 * 60 * 1000, trigger: 'alarm', ok: true, checked: 1, changed: 0, skipped: 0, failed: 0 };
  await w.Watch.sync(true);
  assert.equal(w.alarms.has(w.Watch.SOON_ALARM_NAME), false);
});
