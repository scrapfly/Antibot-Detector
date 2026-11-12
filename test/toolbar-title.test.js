'use strict';
// The toolbar icon's hover text names what the page has, so a glance answers
// without opening the popup.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
globalThis.FormatUtils = require('../utils/format-utils.js');
const ToolbarTitle = require('../modules/core/toolbar-title.js');

const d = (name, confidence) => ({ detector: { name }, confidence });

test('names up to three protections, strongest first, then how many more', () => {
  assert.strictEqual(ToolbarTitle.text('found', [d('DataDome', 90), d('Cloudflare', 95)]), 'Scrapfly: Cloudflare 95%, DataDome 90%');
  assert.strictEqual(
    ToolbarTitle.text('found', [d('A', 10), d('B', 20), d('C', 30), d('D', 40), d('E', 50)]),
    'Scrapfly: E 50%, D 40%, C 30%, +2 more'
  );
});

test('the same protection found twice is named once, at its higher confidence', () => {
  assert.strictEqual(ToolbarTitle.text('found', [d('Akamai', 60), d('Akamai', 80.4)]), 'Scrapfly: Akamai 80%');
});

test('clean, skipped and off pages say so; nameless results count as nothing found', () => {
  assert.strictEqual(ToolbarTitle.text('clean', []), 'Scrapfly: No protections found');
  assert.strictEqual(ToolbarTitle.text('found', [{}, null]), 'Scrapfly: No protections found');
  assert.strictEqual(ToolbarTitle.text('skipped'), 'Scrapfly: This site is not scanned');
  assert.strictEqual(ToolbarTitle.text('off'), 'Scrapfly: Detection is switched off');
});

test('the texts come from the translator it is given', () => {
  const tr = (key, fallback, ...args) => `[${key}${args.length ? ':' + args.join(',') : ''}]`;
  assert.strictEqual(ToolbarTitle.text('off', null, tr), 'Scrapfly: [toolbarTitleOff]');
  assert.strictEqual(ToolbarTitle.text('found', [d('A', 1), d('B', 2), d('C', 3), d('D', 4)], tr), 'Scrapfly: D 4%, C 3%, B 2%, [toolbarTitleMoreFmt:1]');
});

test('apply() sets the tab title and survives a closed tab or a browser without setTitle', async () => {
  const calls = [];
  const chrome = { action: { async setTitle(opts) { calls.push(opts); } } };
  assert.strictEqual(await ToolbarTitle.apply(chrome, 7, 'found', [d('Kasada', 88)]), 'Scrapfly: Kasada 88%');
  assert.deepStrictEqual(calls, [{ tabId: 7, title: 'Scrapfly: Kasada 88%' }]);
  assert.strictEqual(await ToolbarTitle.apply({ action: { async setTitle() { throw new Error('No tab with id'); } } }, 1, 'clean'), null);
  assert.strictEqual(await ToolbarTitle.apply({ action: {} }, 1, 'clean'), null);
  await ToolbarTitle.reset(chrome, 7);
  assert.deepStrictEqual(calls.at(-1), { tabId: 7, title: ToolbarTitle.DEFAULT });
});

test('the default is the extension name, in the manifest as in the worker, and the keys exist in English', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  // The manifest's title is the translated name (the browser picks the language); the worker's reset says the same in the language
  // of the interface, with the English name as the last resort
  assert.strictEqual(manifest.action.default_title, '__MSG_extensionName__');
  const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
  assert.strictEqual(ToolbarTitle.DEFAULT, en.extensionName.message);
  for (const key of ['toolbarTitleOff', 'toolbarTitleSkipped', 'toolbarTitleClean', 'toolbarTitleMoreFmt']) assert.ok(en[key], key);
});

test('every badge state of setBadgeForDetections sets its title', () => {
  const source = fs.readFileSync(path.join(root, 'background/utilities.js'), 'utf8');
  const body = source.slice(source.indexOf('async function setBadgeForDetections'), source.indexOf('async function requestDetectionForTab'));
  for (const state of ["'off'", "'skipped'", "'found', detectionResults", "'clean'"]) {
    assert.ok(body.includes(`setToolbarTitle(tabId, ${state}`), state);
  }
});

test('every place that paints a skipped, clean, off or count badge also sets the hover text', () => {
  const files = ['background/utilities.js', 'background/init.js', 'background/tab-events.js', 'background/handlers/messages-cache.js',
    'modules/detection/engine/detection-engine-manager.js', 'modules/settings/settings-runtime.js'];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const badges = (source.match(/text: BADGE\.TEXT\.(BLACKLISTED|CLEAN|DISABLED)/g) || []).length;
    const titles = (source.match(/ToolbarTitle\.apply\(|setToolbarTitle\(tabId/g) || []).length;
    assert.ok(titles >= badges, `${file}: ${badges} badge states, ${titles} hover texts`);
  }
});

test('an apply that waited for the texts and was overtaken by a newer scan sets nothing', async () => {
  const calls = [];
  let release;
  const saved = globalThis.I18n;
  globalThis.I18n = { ready: () => new Promise(r => { release = r; }), format: () => null };
  try {
    const chrome = { action: { async setTitle(opts) { calls.push(opts.title); } } };
    const late = ToolbarTitle.apply(chrome, 3, 'clean');
    await ToolbarTitle.reset(chrome, 3);
    release();
    assert.strictEqual(await late, null);
    assert.deepStrictEqual(calls, [ToolbarTitle.DEFAULT]);
  } finally {
    globalThis.I18n = saved;
  }
});

test('after a reset the hover text is the extension name in the interface language, not English in every language', async () => {
  const saved = globalThis.I18n;
  const titles = [];
  const chrome = { action: { async setTitle(opts) { titles.push(opts.title); } } };
  try {
    globalThis.I18n = { get: (key) => (key === 'extensionName' ? 'Scrapfly: Anti-Bot-Detektor' : null) };
    await ToolbarTitle.reset(chrome, 5);
    globalThis.I18n = { get: () => null }; // the name is not loaded yet
    await ToolbarTitle.reset(chrome, 5);
    globalThis.I18n = { get: () => '   ' };
    await ToolbarTitle.reset(chrome, 5);
    delete globalThis.I18n; // no translator in this context at all
    await ToolbarTitle.reset(chrome, 5);
  } finally {
    globalThis.I18n = saved;
  }
  assert.deepStrictEqual(titles, ['Scrapfly: Anti-Bot-Detektor', ToolbarTitle.DEFAULT, ToolbarTitle.DEFAULT, ToolbarTitle.DEFAULT]);
});

// The cleared and empty badges say nothing about the page any more: the hover text goes back to the extension name with them,
// or it keeps naming a result that is gone ("Scrapfly: Cloudflare 95%" over the cleared mark)
const BADGE_CALL = /setBadgeText\(\{\s*text:\s*(BADGE\.TEXT\.(BLACKLISTED|CLEAN|DISABLED|CLEARED|EMPTY)|''|"")/g;
const TITLE_CALL = /ToolbarTitle\.(apply|reset|resetIf)\(|setToolbarTitle\(tabId/;

test('every badge the worker paints, cleared and empty included, sets the hover text beside it', () => {
  const files = ['background/utilities.js', 'background/init.js', 'background/tab-events.js', 'background/handlers/messages-cache.js',
    'background/handlers/messages-settings.js', 'background/handlers/messages-detection.js', 'background/detection-session-store.js',
    'modules/detection/engine/detection-engine-manager.js', 'modules/settings/settings-runtime.js'];
  const missing = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const lines = source.split(/\r?\n/);
    const at = (index) => source.slice(0, index).split(/\r?\n/).length - 1;
    {
      for (const match of source.matchAll(BADGE_CALL)) {
        const line = at(match.index);
        const near = lines.slice(Math.max(0, line - 12), line + 13).join('\n');
        // A tab that is gone has no hover text to fix; the place says so
        if (TITLE_CALL.test(near) || /no hover text/i.test(near)) continue;
        missing.push(`${file}:${line + 1} ${match[1]}`);
      }
    }
  }
  assert.deepStrictEqual(missing, []);
});

function clearCacheWorld() {
  const titles = [];
  const context = vm.createContext({
    WorkerMessages: require('../modules/core/worker-messages.js'),
    Logger: new Proxy({}, { get: () => () => {} }),
    Constants: { RECENTLY_CLEARED_TAB_TIMEOUT: 1000 },
    BADGE: { TEXT: { CLEARED: 'CLR' }, COLORS: { CLEARED: '#999' } },
    setBadgeTextColor: async () => {},
    chrome: { action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async (opts) => { titles.push(opts); } } },
    DetectionEngineManager: { handleClearDetectionCache: async (request, sendResponse) => sendResponse({ status: 'cleared' }) },
    DetectionSessionStore: { cancel() {} },
    tabsUsingCache: new Set(), recentlyClearedTabs: new Set(),
    setTimeout: () => 0,
    ToolbarTitle
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'background/handlers/messages-cache.js'), 'utf8'), context, { filename: 'messages-cache.js' });
  return { context, titles };
}

test('Detection → Clear cache puts the hover text back to the extension name with the cleared mark', async () => {
  const { context, titles } = clearCacheWorld();
  await ToolbarTitle.apply(context.chrome, 9, 'found', [d('Cloudflare', 95)]);
  await context.clearTabDetectionCache({ tabId: 9, url: 'https://shop.example/' });
  assert.deepStrictEqual(titles.at(-1), { tabId: 9, title: ToolbarTitle.DEFAULT });
});

test('resetIf() resets a tab whose hover text is that state, and leaves any other text alone', async () => {
  const titles = new Map([[1, 'Scrapfly: This site is not scanned'], [2, 'Scrapfly: Cloudflare 95%']]);
  const chrome = { action: { async setTitle({ tabId, title }) { titles.set(tabId, title); }, async getTitle({ tabId }) { return titles.get(tabId); } } };
  assert.strictEqual(await ToolbarTitle.resetIf(chrome, 1, 'skipped'), true);
  assert.strictEqual(titles.get(1), ToolbarTitle.DEFAULT);
  assert.strictEqual(await ToolbarTitle.resetIf(chrome, 2, 'skipped'), false);
  assert.strictEqual(titles.get(2), 'Scrapfly: Cloudflare 95%');
  // A closed tab or a browser without getTitle: nothing happens, nothing throws
  assert.strictEqual(await ToolbarTitle.resetIf({ action: { async setTitle() {}, async getTitle() { throw new Error('No tab with id'); } } }, 3, 'skipped'), false);
  assert.strictEqual(await ToolbarTitle.resetIf({ action: { async setTitle() {} } }, 3, 'skipped'), false);
});

test('a site that stops being skipped in Settings no longer says "This site is not scanned" on hover', async () => {
  const titles = new Map([[7, 'Scrapfly: This site is not scanned'], [8, 'Scrapfly: Cloudflare 95%']]);
  let blocked = new Set(['https://a.example/', 'https://b.example/']);
  const action = {
    async setTitle({ tabId, title }) { titles.set(tabId, title); }, async getTitle({ tabId }) { return titles.get(tabId); },
    async setIcon() {}, async setBadgeText() {}, async setBadgeBackgroundColor() {}, async setBadgeTextColor() {}
  };
  const context = vm.createContext({
    WorkerMessages: require('../modules/core/worker-messages.js'),
    chrome: {
      action, runtime: { sendMessage: async () => {} },
      storage: { local: { get: async () => ({ scrapfly_enabled: true }), set: async () => {} } },
      tabs: { query: async () => [{ id: 7, url: 'https://a.example/' }, { id: 8, url: 'https://b.example/' }] }
    },
    Utils: { isUrlBlacklisted: async (url) => blocked.has(url) },
    Logger: new Proxy({}, { get: () => () => {} }),
    ToolbarTitle
  });
  for (const file of ['modules/core/badge-constants.js', 'modules/settings/settings-runtime.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  blocked = new Set();
  await vm.runInContext('SettingsRuntime', context).syncPausedIcons();
  assert.strictEqual(titles.get(7), ToolbarTitle.DEFAULT, 'no longer skipped: the extension name until the next scan');
  assert.strictEqual(titles.get(8), 'Scrapfly: Cloudflare 95%', 'a tab that shows a result keeps it');
});
