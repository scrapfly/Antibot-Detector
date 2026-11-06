const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { storageWorld, plain } = require('./helpers/unreadable-storage');

// "Unreadable settings" is a real state: the storage did not answer, or scrapfly_settings holds text that is not JSON (only
// Settings → Data → Reset repairs that). Utils.getSettings answers {} then, which is also what settings that were never saved read
// as, and every decision made from defaults is the wrong one for what the person turned OFF: a paused History recorded, a skipped
// site was scanned and cached, the alarms of the backup, the watchlist and the rule updates were cleared as if switched off, and
// Bulk scan opened every page. Now the answer says it is unreadable (a mark no copy or JSON text carries), and those decisions
// stay off. Nothing stored is deleted or overwritten because a read failed. The real StorageManager, Utils, HistoryRecorder and
// UpdateManager run here in a vm context, over a storage the test controls.

const DAMAGED = [
  ['a read that fails', (w) => { w.state.failGet = (key) => key === 'scrapfly_settings'; }],
  ['text that is not JSON', (w) => { w.store.scrapfly_settings = 'S3CR3T-WEBHOOK-VALUE is not json'; }],
  ['JSON that is not an object', (w) => { w.store.scrapfly_settings = '42'; }],
  ['JSON text of null', (w) => { w.store.scrapfly_settings = 'null'; }]
];
const settingsOf = (settings) => JSON.stringify({ timestamp: '2026-11-06T00:00:00.000Z', settings });

const FILES = ['modules/core/constants.js', 'modules/core/storage-manager.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js', 'utils/utils.js'];

function utilsWorld(settings) {
  const store = {};
  if (settings !== undefined) store.scrapfly_settings = settings;
  const w = storageWorld({ store, files: FILES });
  return { ...w, Utils: w.ctx.Utils, StorageManager: w.ctx.StorageManager };
}

// ---- The answer says it is unreadable

test('settings that cannot be read answer {} marked unreadable; settings that were never saved, or are saved, are not', async () => {
  for (const [what, spoil] of DAMAGED) {
    const w = utilsWorld(settingsOf({ debugMode: false }));
    spoil(w);
    const settings = await w.Utils.getSettings();
    assert.equal(w.StorageManager.settingsUnreadable(settings), true, what);
    assert.deepEqual(Object.keys(settings), [], `${what}: still {}, for every caller that reads a key of it`);
    assert.equal(JSON.stringify(settings), '{}');
    assert.equal(({ ...settings }).settingsUnreadable, undefined, 'a copy does not carry the mark');
    assert.equal(settings.history, undefined);
  }
  const never = utilsWorld();
  assert.equal(never.StorageManager.settingsUnreadable(await never.Utils.getSettings()), false, 'never saved: nothing to read, the defaults are right');
  const saved = utilsWorld(settingsOf({ history: { historyEnabled: false } }));
  const settings = await saved.Utils.getSettings();
  assert.equal(saved.StorageManager.settingsUnreadable(settings), false);
  assert.equal(settings.history.historyEnabled, false);
  // The shapes older builds stored still read
  assert.equal((await utilsWorld(JSON.stringify({ history: { historyLimit: 5 } })).Utils.getSettings()).history.historyLimit, 5, 'JSON text of the settings themselves');
  assert.equal((await utilsWorld({ history: { historyLimit: 6 } }).Utils.getSettings()).history.historyLimit, 6, 'an object');
});

test('the failure is told once per episode, as the kind of error and never with the stored text; a new failure is told again', async () => {
  const w = utilsWorld('S3CR3T-WEBHOOK-VALUE is not json');
  for (let i = 0; i < 4; i++) await w.Utils.getSettings();
  const told = w.warnings.filter(([level, , message]) => level === 'warn' && /settings cannot be read/i.test(String(message)));
  assert.equal(told.length, 1, 'one line for four reads');
  assert.ok(!JSON.stringify(w.warnings).includes('S3CR3T'), 'a JSON error quotes the text, and a webhook secret may be in it');
  assert.ok(JSON.stringify(told).includes('SyntaxError'), 'the kind of error is');

  w.store.scrapfly_settings = settingsOf({});
  await w.Utils.getSettings();
  assert.equal(w.warnings.filter(([level]) => level === 'warn').length, 1, 'readable again: nothing to tell');
  w.state.failGet = () => true;
  await w.Utils.getSettings();
  await w.Utils.getSettings();
  assert.equal(w.warnings.filter(([level]) => level === 'warn').length, 2, 'unreadable again: told again, once');
});

test('nothing stored is deleted or overwritten by reading it', async () => {
  for (const [what, spoil] of DAMAGED) {
    const w = utilsWorld(settingsOf({}));
    spoil(w);
    const before = plain(w.store);
    await w.Utils.getSettings();
    await w.Utils.getHistorySettings();
    await w.Utils.isUrlBlacklisted('https://a.example/', { failClosed: true });
    assert.deepEqual(plain(w.store), before, what);
    assert.equal(w.writes.length, 0, what);
  }
});

test('Utils.getHistorySettings carries the mark, so whoever decides from the History settings can stay off', async () => {
  for (const [what, spoil] of DAMAGED) {
    const w = utilsWorld(settingsOf({ history: { historyEnabled: false } }));
    spoil(w);
    const history = await w.Utils.getHistorySettings();
    assert.equal(history.settingsUnreadable, true, what);
    assert.equal(history.historyEnabled, true, 'the rest are the defaults, as before: the popup keeps drawing from them');
    assert.equal(history.historyBackup, 'off');
  }
  const paused = await utilsWorld(settingsOf({ history: { historyEnabled: false } })).Utils.getHistorySettings();
  assert.equal(paused.historyEnabled, false);
  assert.equal('settingsUnreadable' in paused, false, 'a read that worked carries no mark');
  assert.equal('settingsUnreadable' in await utilsWorld().Utils.getHistorySettings(), false, 'nor does one of settings never saved');
});

test('Utils.isUrlBlacklisted answers as before, and skips every page when asked to fail closed and the settings cannot be read', async () => {
  const url = 'https://anywhere.example/page';
  for (const [what, spoil] of DAMAGED) {
    const w = utilsWorld(settingsOf({ detection: { blacklistedDomains: ['skip.example'] } }));
    spoil(w);
    assert.equal(await w.Utils.isUrlBlacklisted(url), false, `${what}: the default is unchanged (the popup and the page badges ask it)`);
    assert.equal(await w.Utils.isUrlBlacklisted(url, { failClosed: true }), true, `${what}: a scan that must not keep a skipped site skips`);
    assert.equal(await w.Utils.isUrlBlacklisted(url, {}), false);
    assert.equal(await w.Utils.isUrlBlacklisted('', { failClosed: true }), false, 'no address is nothing to skip');
  }
  // Readable: the scope decides, with or without the option
  const readable = utilsWorld(settingsOf({ detection: { blacklistedDomains: ['skip.example'] } }));
  for (const options of [undefined, { failClosed: true }]) {
    assert.equal(await readable.Utils.isUrlBlacklisted('https://skip.example/', options), true);
    assert.equal(await readable.Utils.isUrlBlacklisted(url, options), false);
  }
  const only = utilsWorld(settingsOf({ detection: { scanMode: 'allowlist', allowedDomains: ['ok.example'] } }));
  assert.equal(await only.Utils.isUrlBlacklisted('https://other.example/', { failClosed: true }), true);
  assert.equal(await only.Utils.isUrlBlacklisted('https://ok.example/', { failClosed: true }), false);
  assert.equal(await utilsWorld().Utils.isUrlBlacklisted(url, { failClosed: true }), false, 'settings never saved scan everything, as before');
});

// ---- History records nothing while it cannot tell whether it is paused

const RECORDER_FILES = [...FILES, 'modules/core/categories.js', 'modules/core/history-store.js', 'modules/core/history-policy.js', 'background/history-recorder.js'];

function recorderWorld(settings) {
  const store = {};
  if (settings !== undefined) store.scrapfly_settings = settings;
  const notes = [];
  const w = storageWorld({
    store, files: RECORDER_FILES,
    globals: {
      UrlUtils: { normalizeFaviconForStorage: (f) => f || '', getHostnameFromUrl: (u) => { try { return new URL(u).hostname; } catch (_) { return ''; } } },
      FormatUtils: { convertToMilliseconds: (n, unit) => n * ({ minutes: 60000, hours: 3600000, days: 86400000 }[unit] || 0) }
    },
    chrome: {
      tabs: { get: async (id) => ({ id, url: 'https://shop.example/', title: 'Shop', incognito: false }) },
      windows: { getAll: async () => [] },
      notifications: { create: (id, options) => notes.push({ id, ...options }) }
    }
  });
  const Recorder = vm.runInContext('HistoryRecorder', w.ctx);
  const detections = [{ detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 90 }];
  const items = () => vm.runInContext('HistoryStore', w.ctx).parse(w.store.scrapfly_history).items;
  const save = (options = {}) => Recorder.saveDetectionToHistory(1, { url: 'https://shop.example/', hostname: 'shop.example', title: 'Shop' }, detections, w.ctx.chrome, { source: 'test', ...options });
  return { ...w, Recorder, save, items, notes, detections };
}

test('a page is recorded while the settings read, and not while History is paused in them', async () => {
  const on = recorderWorld(settingsOf({ history: { historyEnabled: true } }));
  assert.equal(await on.save(), true);
  assert.equal(on.items().length, 1);
  const paused = recorderWorld(settingsOf({ history: { historyEnabled: false } }));
  assert.equal(await paused.save(), false);
  assert.equal(paused.store.scrapfly_history, undefined, 'nothing is written');
});

test('nothing is recorded while the settings cannot be read: a paused History is not recorded because its pause could not be read', async () => {
  for (const [what, spoil] of DAMAGED) {
    const w = recorderWorld(settingsOf({ history: { historyEnabled: false, historyExcludedDomains: ['shop.example'] } }));
    spoil(w);
    // As the worker does it: no settings handed over, so the recorder reads them
    assert.equal(await w.save(), false, `${what}: read by the recorder`);
    // As the scan pipeline does it: the History settings read earlier are handed over
    const handed = await w.ctx.Utils.getHistorySettings();
    assert.equal(await w.save({ historySettings: handed }), false, `${what}: handed over`);
    assert.equal(w.store.scrapfly_history, undefined, `${what}: History was not written`);
    // The settings read again: the choice made is the person's own again (paused here), whatever was handed over before
    w.state.failGet = null;
    w.store.scrapfly_settings = settingsOf({ history: { historyEnabled: false } });
    assert.equal(await w.save(), false);
    assert.equal(await w.save({ historySettings: handed }), false, 'settings read while unreadable stay unreadable settings');
  }
});

test('History records again as soon as the settings read, and a failure of the read does not undo what was recorded', async () => {
  const w = recorderWorld(settingsOf({ history: { historyEnabled: true } }));
  assert.equal(await w.save(), true);
  w.state.failGet = (key) => key === 'scrapfly_settings';
  assert.equal(await w.save({ historySettings: undefined }), false);
  assert.equal(w.items().length, 1, 'the earlier entry is still there');
  w.state.failGet = null;
  assert.equal(await w.save(), true);
  assert.equal(w.items().length, 2);
});

test('a change alert is not shown while the settings that say whether notifications are on cannot be read', async () => {
  const alert = { hostname: 'shop.example', url: 'https://shop.example/', added: ['Cloudflare'], removed: [] };
  const readable = recorderWorld(settingsOf({ notificationsEnabled: true }));
  await readable.Recorder.notifyChange(alert, readable.ctx.chrome);
  assert.equal(readable.notes.length, 1, 'with notifications on, it shows');
  const off = recorderWorld(settingsOf({ notificationsEnabled: false }));
  await off.Recorder.notifyChange(alert, off.ctx.chrome);
  assert.equal(off.notes.length, 0);
  for (const [what, spoil] of DAMAGED) {
    const w = recorderWorld(settingsOf({ notificationsEnabled: false }));
    spoil(w);
    await w.Recorder.notifyChange(alert, w.ctx.chrome);
    assert.equal(w.notes.length, 0, what);
  }
});

// ---- The rule update schedule keeps its alarm and its waiting updates

const UPDATE_FILES = [...FILES, 'modules/core/categories.js', 'utils/format-utils.js', 'utils/detection-utils.js', 'modules/detection/rules/detector-schema.js',
  'modules/detection/rules/historical-migrations.js', 'modules/detection/rules/detector-manager.js', 'modules/detection/rules/update-manager.js'];
const waiting = [
  { id: 'detect-from-github', category: 'antibot', remoteVersion: '2.0.0', localVersion: '1.0.0', source: 'github', tag: 'v9.9.9' },
  { id: 'detect-from-this-build', category: 'antibot', remoteVersion: '1.1.0', localVersion: '1.0.0', source: 'bundled' }
];

function updateWorld(settings) {
  const alarms = new Map([['scrapfly-update-check', { name: 'scrapfly-update-check', periodInMinutes: 720 }]]);
  const log = { cleared: [], created: [], timers: 0 };
  const store = { scrapfly_pending_updates: plain(waiting) };
  if (settings !== undefined) store.scrapfly_settings = settings;
  const w = storageWorld({
    store, files: UPDATE_FILES,
    globals: { setTimeout: () => { log.timers++; return 0; } },
    chrome: {
      alarms: {
        get: async (name) => alarms.get(name),
        clear: (name) => { log.cleared.push(name); return Promise.resolve(alarms.delete(name)); },
        create: (name, info) => { log.created.push([name, info]); alarms.set(name, { name, ...info }); },
        onAlarm: { addListener() {} }
      }
    }
  });
  return { ...w, UM: w.ctx.UpdateManager, alarms, log };
}

test('while the settings cannot be read, the update check keeps its alarm and the updates waiting for a decision', async () => {
  for (const [what, spoil] of DAMAGED) {
    const w = updateWorld(settingsOf({ updates: { autoUpdate: true, checkIntervalHours: 12 } }));
    spoil(w);
    await w.UM.scheduleCheck();
    assert.deepEqual(w.log.cleared, [], `${what}: the alarm is not cleared`);
    assert.ok(w.alarms.has('scrapfly-update-check'), what);
    assert.deepEqual(plain(w.store.scrapfly_pending_updates), waiting, `${what}: the waiting updates stay, the GitHub one included`);
    assert.equal(w.writes.length, 0, what);
  }
});

test('with automatic updates switched off in settings that read, the alarm and the GitHub updates still go, as before', async () => {
  const w = updateWorld(settingsOf({ updates: { autoUpdate: false } }));
  await w.UM.scheduleCheck();
  assert.deepEqual(w.log.cleared, ['scrapfly-update-check']);
  assert.deepEqual(plain(w.store.scrapfly_pending_updates).map(update => update.id), ['detect-from-this-build'], 'the update that came with this build waits for a decision');
});

test('with automatic updates on in settings that read, the check is scheduled', async () => {
  const w = updateWorld(settingsOf({ updates: { autoUpdate: true, checkIntervalHours: 6 } }));
  await w.UM.scheduleCheck();
  assert.equal(w.log.timers, 1, 'the first check');
  assert.deepEqual(plain(w.log.created), [['scrapfly-update-check', { periodInMinutes: 360 }]]);
  assert.deepEqual(w.log.cleared, []);
});
