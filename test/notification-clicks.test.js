'use strict';
// A click on a History notification opens something useful: the page whose
// protections changed, or Settings → History for the backup and storage notices.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const NotificationClicks = require('../background/notification-clicks.js');

function fakeChrome() {
  const session = {};
  const opened = [];
  const cleared = [];
  let listener = null;
  return {
    opened, cleared, session,
    click: (id) => listener(id),
    runtime: { getURL: p => `chrome-extension://abc/${p}` },
    storage: { session: {
      async get(key) { return key in session ? { [key]: session[key] } : {}; },
      async set(obj) { Object.assign(session, JSON.parse(JSON.stringify(obj))); }
    } },
    tabs: { async create(opts) { opened.push(opts); return { id: 1 }; } },
    notifications: { clear(id) { cleared.push(id); return Promise.resolve(true); }, onClicked: { addListener(fn) { listener = fn; } } }
  };
}

const settle = () => new Promise(r => setTimeout(r, 0));

test('a change notification opens the page it is about and is cleared', async () => {
  const chrome = fakeChrome();
  NotificationClicks.register(chrome);
  await NotificationClicks.remember('scrapfly-history-change-1', 'https://shop.example/item?id=3', chrome);
  chrome.click('scrapfly-history-change-1');
  await settle(); await settle();
  assert.deepStrictEqual(chrome.opened, [{ url: 'https://shop.example/item?id=3', active: true }]);
  assert.deepStrictEqual(chrome.cleared, ['scrapfly-history-change-1']);
});

test('backup and storage notices open Settings → History in the popup page', async () => {
  const chrome = fakeChrome();
  for (const id of ['scrapfly-history-backup-failed', 'scrapfly-history-storage']) {
    const target = await NotificationClicks.handleClick(id, chrome);
    assert.strictEqual(target.url, 'chrome-extension://abc/popup.html?settings=history');
  }
  assert.strictEqual(chrome.opened.length, 2);
});

test('unknown ids, non-web addresses and forgotten notifications open nothing', async () => {
  const chrome = fakeChrome();
  await NotificationClicks.remember('scrapfly-history-change-2', 'javascript:alert(1)', chrome);
  await NotificationClicks.remember('scrapfly-history-change-3', 'chrome://settings', chrome);
  assert.strictEqual(await NotificationClicks.targetFor('scrapfly-history-change-2', chrome), null);
  assert.strictEqual(await NotificationClicks.targetFor('scrapfly-history-change-3', chrome), null);
  assert.strictEqual(await NotificationClicks.targetFor('scrapfly-history-change-404', chrome), null);
  assert.strictEqual(await NotificationClicks.targetFor('some-other-id', chrome), null);
  assert.strictEqual(await NotificationClicks.handleClick('scrapfly-history-change-404', chrome), null);
  assert.deepStrictEqual(chrome.opened, []);
});

test('Advanced page notices are left to their own handling', async () => {
  const chrome = fakeChrome();
  NotificationClicks.register(chrome);
  chrome.click('a1b2c3-generated-id');
  await settle();
  assert.deepStrictEqual(chrome.cleared, []);
});

test('at most 20 pages are remembered, newest first, and never on disk', async () => {
  const chrome = fakeChrome();
  for (let i = 0; i < 25; i++) await NotificationClicks.remember(`scrapfly-history-change-${i}`, `https://s${i}.example/`, chrome);
  const kept = chrome.session[NotificationClicks.STORAGE_KEY];
  assert.strictEqual(kept.length, 20);
  assert.strictEqual(kept[0].id, 'scrapfly-history-change-24');
  assert.strictEqual(await NotificationClicks.targetFor('scrapfly-history-change-0', chrome), null);
  assert.deepStrictEqual((await NotificationClicks.targetFor('scrapfly-history-change-10', chrome)), { url: 'https://s10.example/' });
});

test('the change notification remembers its page before it is shown', () => {
  const source = fs.readFileSync(path.join(root, 'background/history-recorder.js'), 'utf8');
  const notify = source.slice(source.indexOf('static async notifyChange'), source.indexOf('static async checkStorage'));
  assert.ok(notify.indexOf('NotificationClicks.remember') !== -1 && notify.indexOf('NotificationClicks.remember') < notify.indexOf('notifications.create'));
  assert.ok((source.match(/url: (fresh\.url|updated\.url)/g) || []).length === 2, 'both alert paths carry the page address');
});

test('popup.html?tab=&settings= picks a known tab and Settings sub-tab, nothing else', () => {
  const context = vm.createContext({ console, URLSearchParams, globalThis: {}, document: { addEventListener() {} } });
  context.globalThis = context;
  context.ScrapflyBridgeProtocol = { MESSAGE_TYPES: {} };
  context.window = { addEventListener() {} };
  vm.runInContext(fs.readFileSync(path.join(root, 'popup.js'), 'utf8') + '\n;globalThis.ScrapflyPopup = ScrapflyPopup;', context);
  const route = context.ScrapflyPopup.routeFrom;
  assert.deepStrictEqual({ ...route('?settings=history') }, { tab: null, settingsTab: 'history', search: null });
  assert.deepStrictEqual({ ...route('?tab=rules&settings=data') }, { tab: 'rules', settingsTab: 'data', search: null });
  assert.deepStrictEqual({ ...route('?tab=evil&settings=<x>') }, { tab: null, settingsTab: null, search: null });
  assert.deepStrictEqual({ ...route('') }, { tab: null, settingsTab: null, search: null });
  // the History search from Statistics: plain text, control characters dropped, 200 characters at most
  assert.deepStrictEqual({ ...route('?tab=history&search=shop.example') }, { tab: 'history', settingsTab: null, search: 'shop.example' });
  assert.strictEqual(route('?search=' + encodeURIComponent('a\nb\u0000c')).search, 'a b c');
  assert.strictEqual(route('?search=' + 'x'.repeat(500)).search.length, 200);
  assert.strictEqual(route('?search=%20%20').search, null);
});
