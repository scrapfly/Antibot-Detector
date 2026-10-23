const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The watchlist on screen: Settings → History → Watch pinned pages, and "Watch for changes" in the entry menu.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const HistoryStore = require('../modules/core/history-store.js');
const HistoryPolicy = require('../modules/core/history-policy.js');
const format = (key, fallback, ...args) => args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), fallback);

// ---- Settings
function settingsHarness({ stored = {}, reply, fail = false } = {}) {
  const toasts = [], sent = [];
  const last = { textContent: '' };
  const button = { disabled: false };
  const ctx = vm.createContext({
    console, self: {}, HistoryStore, HistoryPolicy,
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: { t: format, formatDateTime: (time) => `at ${time}` },
    NotificationHelper: { error: (text) => toasts.push(['error', text]), success: (text) => toasts.push(['success', text]) },
    document: { querySelector: (selector) => (selector === '#historyWatchLast' ? last : null) },
    chrome: {
      storage: { local: { get: async () => stored } },
      runtime: { sendMessage: async (message) => { sent.push(message); if (fail) throw new Error('worker gone'); return reply; } }
    }
  });
  vm.runInContext(read('sections/settings/settings-ui.js'), ctx, { filename: 'settings-ui.js' });
  return { SettingsUI: vm.runInContext('SettingsUI', ctx), toasts, sent, last, button };
}
const watchedItems = (count) => JSON.stringify({ items: Array.from({ length: count }, (_, i) => ({ id: `w${i}`, url: `https://w${i}.example/`, pinned: true, watch: true })).concat([{ id: 'other', pinned: true }, { id: 'unpinned', watch: true }]) });

test('the History tab declares the watchlist controls, and only an offered mode is saved', () => {
  const html = read('sections/settings/settings.html');
  for (const id of ['historyWatch', 'historyWatchLast', 'historyWatchNowBtn']) assert.ok(html.includes(`id="${id}"`), id);
  const options = [...html.match(/<select id="historyWatch"[\s\S]*?<\/select>/)[0].matchAll(/<option value="([a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(options, [...HistoryPolicy.WATCH_MODES], 'one choice per mode');
  const ui = read('sections/settings/settings-ui.js');
  assert.match(ui, /HistoryPolicy\.WATCH_MODES\.includes\(settings\.history\.historyWatch\)/);
  assert.match(ui, /historyWatch: document\.querySelector\('#historyWatch'\)\?\.value/);
  assert.match(ui, /choose\('historyWatch', HistoryPolicy\.watchModeOf\(h\)\)/);
});

test('the watchlist line says how many pages are watched and how the last check went', async () => {
  const never = settingsHarness({ stored: { scrapfly_history: watchedItems(3) } });
  await never.SettingsUI.refreshHistoryWatch();
  assert.equal(never.last.textContent, '3 of 10 pages watched · No check yet.');
  const done = settingsHarness({ stored: { scrapfly_history: watchedItems(1), scrapfly_history_watch: { at: 1234, ok: true, checked: 4, changed: 1 } } });
  await done.SettingsUI.refreshHistoryWatch();
  assert.equal(done.last.textContent, '1 of 10 pages watched · Last check: at 1234 · 4 checked, 1 changed');
  const noWindow = settingsHarness({ stored: { scrapfly_history_watch: { at: 1, ok: false, error: 'no_window' } } });
  await noWindow.SettingsUI.refreshHistoryWatch();
  assert.equal(noWindow.last.textContent, '0 of 10 pages watched · The last check found no browser window to open pages in.');
  const failed = settingsHarness({ stored: { scrapfly_history_watch: { at: 1, ok: false, error: 'boom' } } });
  await failed.SettingsUI.refreshHistoryWatch();
  assert.match(failed.last.textContent, /The last check failed\.$/);
});

test('Check now asks the worker and says how it went', async () => {
  const run = async (options) => {
    const h = settingsHarness(options);
    await h.SettingsUI.checkWatchNow.call({}, h.button);
    assert.equal(h.button.disabled, false, 'the button is back');
    assert.deepEqual(plain(h.sent), [{ type: 'HISTORY_WATCH_NOW' }]);
    return h.toasts;
  };
  assert.deepEqual(await run({ reply: { status: 'ok', checked: 3, changed: 1, skipped: 0, failed: 0 } }), [['success', 'Checked 3 pages, 1 changed']]);
  assert.deepEqual(await run({ reply: { status: 'ok', checked: 0, changed: 0, skipped: 0, failed: 0 } }), [['success', 'No page is watched yet: pin a page in History and choose Watch for changes.']]);
  assert.deepEqual(await run({ reply: { status: 'error', ok: false, error: 'no_window' } }), [['error', 'The last check found no browser window to open pages in.']]);
  assert.deepEqual(await run({ reply: { status: 'error', ok: false, error: 'paused' } }), [['error', 'History is paused, so nothing is checked.']]);
  assert.match((await run({ reply: { status: 'unknown' } }))[0][1], /out of date/);
  assert.deepEqual(await run({ reply: { status: 'error', ok: false, error: 'boom' } }), [['error', 'The last check failed.']]);
  assert.deepEqual(await run({ fail: true }), [['error', 'The last check failed.']]);
});

test('pages that could not be checked are said: in the last-check line, and as an error when every page failed', async () => {
  const some = settingsHarness({ stored: { scrapfly_history: watchedItems(3), scrapfly_history_watch: { at: 1234, ok: true, checked: 2, changed: 0, failed: 1 } } });
  await some.SettingsUI.refreshHistoryWatch();
  assert.equal(some.last.textContent, '3 of 10 pages watched · Last check: at 1234 · 2 checked, 0 changed · 1 could not be checked');
  const run = async (reply) => { const h = settingsHarness({ reply }); await h.SettingsUI.checkWatchNow.call({}, h.button); return h.toasts; };
  assert.deepEqual(await run({ status: 'ok', checked: 2, changed: 1, skipped: 0, failed: 1 }), [['success', 'Checked 2 pages, 1 changed · 1 could not be checked']]);
  assert.deepEqual(await run({ status: 'ok', checked: 0, changed: 0, skipped: 0, failed: 3 }), [['error', 'Checked 0 pages, 0 changed · 3 could not be checked']], 'every site down is not a success');
});

// ---- The entry menu and the card
function historyView({ reply = { status: 'ok', updated: 1 }, mode = 'daily' } = {}) {
  const toasts = [], changes = [];
  const context = vm.createContext({
    console, Date, JSON, Math, Set, Map, URL, Intl,
    Logger: new Proxy({}, { get: () => () => {} }),
    FormatUtils: require('../utils/format-utils.js'),
    HistoryStore, HistoryPolicy, HistoryCompare: require('../modules/core/history-compare.js'),
    Utils: { getHistorySettings: async () => ({ historyWatch: mode }) },
    NotificationHelper: { success: (text) => toasts.push(['success', text]), error: (text) => toasts.push(['error', text]) },
    chrome: { runtime: { getURL: p => p, sendMessage: async (message) => { changes.push(message); return reply; } } }
  });
  context.self = context; context.globalThis = context;
  vm.runInContext(read('sections/history/history.js') + '\n;globalThis.History = History;', context);
  const view = Object.create(context.History.prototype);
  view.historyItems = [];
  view.loadHistoryFromStorage = async () => {};
  view.renderHistory = () => {};
  return { view, toasts, changes };
}

test('"Watch for changes" pins and watches the page, and says when the watchlist is off', async () => {
  const on = historyView();
  await on.view.toggleWatch({ id: 'a', pinned: true });
  assert.deepEqual(plain(on.changes), [{ type: 'HISTORY_UPDATE_ITEM', id: 'a', patch: { watch: true } }]);
  assert.deepEqual(on.toasts, [['success', 'Watching this page']]);

  const off = historyView({ mode: 'off' });
  await off.view.toggleWatch({ id: 'a' });
  assert.deepEqual(off.toasts, [['success', 'Watching this page. Turn on Watch pinned pages in Settings → History for it to be checked.']]);
});

test('"Stop watching" stops it, and a full watchlist says so', async () => {
  const stop = historyView();
  await stop.view.toggleWatch({ id: 'a', pinned: true, watch: true });
  assert.deepEqual(plain(stop.changes), [{ type: 'HISTORY_UPDATE_ITEM', id: 'a', patch: { watch: false } }]);
  assert.deepEqual(stop.toasts, [['success', 'No longer watching this page']]);

  const full = historyView({ reply: { status: 'ok', updated: 0, limit: 10 } });
  await full.view.toggleWatch({ id: 'b' });
  assert.deepEqual(full.toasts, [['error', 'You can watch up to 10 pages. Stop watching one first.']]);

  const broken = historyView({ reply: { status: 'error', error: 'History update failed' } });
  await broken.view.toggleWatch({ id: 'c' });
  assert.deepEqual(broken.toasts, [['error', 'History update failed']]);
});

test('the entry menu names the action for the entry it opens on', () => {
  const { view } = historyView();
  const labels = {};
  const menu = { querySelector: (selector) => { const found = /data-menu-label="(\w+)"/.exec(selector); if (!found) return null; const name = found[1]; return labels[name] || (labels[name] = { textContent: '' }); } };
  view.syncItemMenu(menu, { id: 'a' });
  assert.equal(labels.watch.textContent, 'Watch for changes');
  view.syncItemMenu(menu, { id: 'a', pinned: true, watch: true });
  assert.equal(labels.watch.textContent, 'Stop watching');
  assert.equal(labels.pin.textContent, 'Unpin');
});

test('Compare with… is disabled, and says why, when the page has no other saved scan', () => {
  const { view } = historyView();
  const compare = { disabled: false, title: '' };
  const menu = { querySelector: (selector) => (selector === '[data-action="compare"]' ? compare : null) };
  const entry = (id, timestamp) => ({ id, timestamp, url: 'https://shop.example.test/p?x=' + id, hostname: 'shop.example.test' });

  view.historyItems = [entry('a', 2)];
  view.syncItemMenu(menu, view.historyItems[0]);
  assert.equal(compare.disabled, true);
  assert.equal(compare.title, 'No other saved scan of this page to compare with');

  view.historyItems = [entry('a', 2), entry('b', 1)];
  view.syncItemMenu(menu, view.historyItems[0]);
  assert.equal(compare.disabled, false);
  assert.equal(compare.title, '');
});
