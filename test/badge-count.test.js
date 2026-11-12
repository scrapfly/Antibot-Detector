const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → General → Toolbar number: the number on the toolbar icon counts every detection (the default, as before 3.1.8) or
// only the anti-bot and CAPTCHA ones. Fingerprinting fires on most sites (most fingerprint rules count on their own), so analytics
// scripts made the number high on every page. One count (DetectionUtils.badgeCount) serves every place that paints the number.

global.self = global;
require('../modules/core/categories.js');
const DetectionUtils = require('../utils/detection-utils.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const d = (name, category, confidence = 90) => ({ detector: { name }, category, confidence });
const page = [d('Cloudflare Bot Management', 'Anti-Bot'), d('hCaptcha', 'CAPTCHA', 10), d('Canvas', 'Fingerprint'), d('Audio', 'fingerprint'), d('WebGL', 'Fingerprint')];

test('every detection by default; anti-bot and CAPTCHA only when chosen, at any confidence', () => {
  assert.equal(DetectionUtils.badgeCount(page), 5);
  assert.equal(DetectionUtils.badgeCount(page, 'all'), 5);
  assert.equal(DetectionUtils.badgeCount(page, 'protections'), 2);
  assert.equal(DetectionUtils.badgeCount(page.slice(2), 'protections'), 0, 'a fingerprinting-only page gets the clean badge');
  // A missing or unknown saved value (an old file, a hand-edited backup) is every detection
  for (const value of [undefined, null, '', 'PROTECTIONS', 7, {}]) assert.equal(DetectionUtils.badgeCount(page, value), 5, String(value));
  assert.equal(DetectionUtils.badgeCountMode('protections'), 'protections');
  assert.equal(DetectionUtils.badgeCountMode('nonsense'), 'all');
  assert.equal(DetectionUtils.badgeCount(null, 'protections'), 0);
  assert.equal(DetectionUtils.badgeCount([null, 'x', d('DataDome', 'antibot')], 'protections'), 1);
});

test('a cached page keeps its saved count for every detection, as before; the anti-bot and CAPTCHA count comes from its results', () => {
  assert.equal(DetectionUtils.badgeCount(page, 'all', 5), 5);
  assert.equal(DetectionUtils.badgeCount([], 'all', 3), 3, 'a saved count without its results');
  assert.equal(DetectionUtils.badgeCount(page, 'all', 0), 0);
  assert.equal(DetectionUtils.badgeCount(page, 'all', 'x'), 5, 'an unreadable saved count falls back to the results');
  assert.equal(DetectionUtils.badgeCount(page, 'protections', 5), 2);
});

test('the setting: Every detection by default, in Settings → General next to the badge colours, kept by settings files and backups', () => {
  const defaults = JSON.parse(read('sections/settings/default-settings.json')).settings;
  assert.equal(defaults.badgeCount, 'all');
  const html = read('sections/settings/settings.html');
  const general = html.slice(html.indexOf('settingsGroupBadgeColors') - 200, html.indexOf('<!-- Category Colors Group -->'));
  assert.match(general, /<select id="badgeCount" class="select-field" aria-labelledby="badgeCountLabel">/);
  assert.deepEqual([...general.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]), ['all', 'protections']);
  for (const key of ['settingsBadgeCountTitle', 'settingsBadgeCountDesc', 'settingsBadgeCountAll', 'settingsBadgeCountProtections']) {
    assert.ok(general.includes(`data-i18n="${key}"`), key);
    assert.ok(JSON.parse(read('_locales/en/messages.json'))[key], key);
  }
  const ui = read('sections/settings/settings-ui.js');
  assert.match(ui, /settings\.badgeCount = DetectionUtils\.badgeCountMode\(document\.querySelector\('#badgeCount'\)/, 'saved from the form');
  assert.match(ui, /badgeCountSelect\.value = DetectionUtils\.badgeCountMode\(this\.settings\.badgeCount\)/, 'shown in the form');
  globalThis.ScanScope = require('../modules/core/scan-scope.js');
  require('../modules/settings/settings-transfer.js');
  assert.deepEqual(globalThis.SettingsTransfer.portable({ badgeCount: 'protections', debugMode: false }), { badgeCount: 'protections', debugMode: false });
});

test('the painters read the saved choice raw from storage, like the badge colours, and fall back to every detection', async () => {
  const stored = { value: undefined, fail: false };
  const context = vm.createContext({
    DetectionUtils, BADGE: { COLORS: {} }, console,
    chrome: { storage: { local: { get: async () => { if (stored.fail) throw new Error('closed'); return { scrapfly_settings: stored.value }; } } } }
  });
  vm.runInContext(read('modules/detection/managers/category-manager.js') + '\nglobalThis.CategoryManager = CategoryManager;', context);
  const mode = () => context.CategoryManager.getBadgeCountMode();
  assert.equal(await mode(), 'all', 'nothing saved');
  stored.value = { badgeCount: 'protections' };
  assert.equal(await mode(), 'protections');
  stored.value = JSON.stringify({ settings: { badgeCount: 'protections' } });
  assert.equal(await mode(), 'protections', 'the string and wrapped forms the badge colours accept');
  stored.value = { badgeCount: 'bogus' };
  assert.equal(await mode(), 'all');
  stored.fail = true;
  assert.equal(await mode(), 'all', 'unreadable storage');
});

// Every chrome.action.setBadgeText of the extension whose text is not a fixed state (BADGE.TEXT.*, '' or a spinner frame) paints
// the number: each one must take it from DetectionUtils.badgeCount, never count detections on its own
test('no painter counts on its own: every badge number comes from DetectionUtils.badgeCount', () => {
  const shipped = ['background', 'modules', 'sections', 'utils'].flatMap(function walk(dir) {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
      const file = path.posix.join(dir, entry.name);
      return entry.isDirectory() ? walk(file) : (file.endsWith('.js') ? [file] : []);
    });
  }).concat(['popup.js', 'content.js', 'background.js']);
  const painters = [];
  for (const file of shipped) {
    const source = read(file);
    for (const match of source.matchAll(/setBadgeText\(\s*\{\s*text:?\s*([^,}]*)/g)) {
      const text = match[1].trim();
      if (/^BADGE\.TEXT\.\w+$|^''$/.test(text)) continue;
      if (text === '' && /function paintSpinnerFrame|SPINNER_FRAMES/.test(source.slice(Math.max(0, match.index - 1500), match.index))) continue; // the spinner
      painters.push(`${file}: ${text}`);
      // The number painted here was worked out a few lines up, by the shared count
      const before = source.slice(Math.max(0, match.index - 1200), match.index);
      assert.match(before, /DetectionUtils\.badgeCount\(/, `${file} paints "${text}" without DetectionUtils.badgeCount`);
    }
  }
  assert.ok(painters.length >= 6, `the painters are found: ${painters.join('; ')}`);
  for (const file of shipped) {
    const source = read(file);
    // The length of a result list, or a saved page's own count, painted as it is
    assert.ok(!/setBadgeText\(\s*\{\s*text:\s*(?:[\w.]*(?:detections|detectionResults|results)\??\.length|\w+\.detectionCount)\b/.test(source), `${file} paints a raw count`);
  }
});

test('a page whose detections are not counted gets the clean badge, and its hover text still names them', () => {
  for (const file of ['background/handlers/messages-cache.js', 'modules/detection/engine/detection-engine-manager.js', 'modules/settings/settings-runtime.js']) {
    assert.match(read(file), /ToolbarTitle\.apply\(chrome, tabI?d?\.?i?d?, \w+\.length \? 'found' : 'clean', \w+\)/, file);
  }
  assert.match(read('background/utilities.js'), /detectionResults\.length \? setToolbarTitle\(tabId, 'found', detectionResults\) : setToolbarTitle\(tabId, 'clean'\)/);
});

test('changing the setting repaints the open tabs from their saved scans, skipping a tab being scanned', async () => {
  const painted = [];
  const tabs = [{ id: 1, url: 'https://a.example' }, { id: 2, url: 'https://b.example' }, { id: 3, url: 'chrome://settings' }, { id: 4, url: 'https://new.example' }];
  const context = vm.createContext({
    chrome: { storage: { local: { get: async () => ({ scrapfly_enabled: true }) } }, tabs: { query: async () => tabs } },
    Logger: { warn() {}, error() {}, debug() {}, ui() {} },
    activeDetections: new Map([[2, {}]]),
    DetectionEngineManager: { getStoredDetection: async (url) => (url === 'https://new.example' ? null : { detectionResults: page, detectionCount: 5 }) },
    setBadgeForDetections: async (tabId, url, results) => { painted.push([tabId, url, results.length]); }
  });
  vm.runInContext(read('modules/settings/settings-runtime.js'), context);
  await vm.runInContext('SettingsRuntime', context).repaintBadges();
  assert.deepEqual(painted, [[1, 'https://a.example', 5]]);
  // It is part of what a Settings save tells the worker
  const runtime = read('modules/settings/settings-runtime.js');
  const handler = runtime.slice(runtime.indexOf('SettingsRuntime.handleSettingsUpdated'), runtime.indexOf('SettingsRuntime.syncPausedIcons ='));
  assert.match(handler, /await SettingsRuntime\.repaintBadges\(\)/);
  // Switched off: nothing is painted
  painted.length = 0;
  context.chrome.storage.local.get = async () => ({ scrapfly_enabled: false });
  await vm.runInContext('SettingsRuntime', context).repaintBadges();
  assert.deepEqual(painted, []);
});

test('reading the choice never fails: a missing reader, or one that throws or rejects, is every detection', async () => {
  assert.equal(await DetectionUtils.readBadgeCountMode({ getBadgeCountMode: async () => 'protections' }), 'protections');
  assert.equal(await DetectionUtils.readBadgeCountMode({ getBadgeCountMode: async () => 'bogus' }), 'all');
  assert.equal(await DetectionUtils.readBadgeCountMode({}), 'all', 'no reader');
  assert.equal(await DetectionUtils.readBadgeCountMode(undefined), 'all');
  assert.equal(await DetectionUtils.readBadgeCountMode({ getBadgeCountMode() { throw new Error('boom'); } }), 'all', 'throws');
  assert.equal(await DetectionUtils.readBadgeCountMode({ getBadgeCountMode: async () => { throw new Error('closed'); } }), 'all', 'rejects');
  // Every painter reads it this way, never the manager's reader directly
  for (const file of ['background/utilities.js', 'background/handlers/messages-cache.js', 'modules/detection/engine/detection-engine-manager.js',
    'modules/settings/settings-runtime.js', 'sections/detection/detection-ui.js', 'sections/detection/detection-actions.js']) {
    const source = read(file);
    assert.match(source, /DetectionUtils\.readBadgeCountMode\((?:context\.)?CategoryManager\)/, file);
    assert.ok(!/await (?:context\.)?CategoryManager\.getBadgeCountMode\(\)/.test(source), `${file} reads the setting without the fallback`);
  }
});

test('a finished page is still painted, with its count and colour, when reading the choice throws', async () => {
  for (const reader of [undefined, () => { throw new Error('boom'); }, async () => { throw new Error('closed'); }]) {
    const calls = [];
    const action = {};
    for (const method of ['setBadgeText', 'setBadgeBackgroundColor', 'setBadgeTextColor', 'setIcon', 'setTitle']) {
      action[method] = async (details) => { calls.push({ method, ...details }); };
    }
    const CategoryManager = { getBadgeColors: async () => ({ low: '#00aa00', medium: '#aaaa00', high: '#aa0000' }) };
    if (reader) CategoryManager.getBadgeCountMode = reader;
    const context = vm.createContext({
      chrome: { action, storage: { local: { get: async () => ({}) } } },
      isExtensionEnabled: async () => true,
      Utils: { isUrlBlacklisted: async () => false },
      CategoryManager, DetectionUtils,
      Logger: { debugMode: false, background() {}, debug() {}, warn() {}, error() {} },
      detectionStates: new Map(), activeDetections: new Map(),
      setInterval: () => 1, clearInterval: () => {}
    });
    for (const file of ['modules/core/badge-constants.js', 'background/utilities.js']) vm.runInContext(read(file), context, { filename: file });
    await context.setBadgeForDetections(7, 'https://example.test', page);
    const text = calls.filter(call => call.method === 'setBadgeText').at(-1);
    const colour = calls.filter(call => call.method === 'setBadgeBackgroundColor').at(-1);
    assert.equal(text && text.text, '5', `every detection is counted (${reader ? 'reader fails' : 'no reader'})`);
    assert.equal(colour && colour.color, DetectionUtils.getBadgeColor(page, { low: '#00aa00', medium: '#aaaa00', high: '#aa0000' }), 'the colours are still read');
  }
});
