const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings → Detection → Sites without JS hooks: on a listed site (and its subdomains) the page's API calls are not
// watched. The scan still runs, so what it finds there differs from what it finds elsewhere: a cached result belongs to
// one setting or the other, and the popup says that fingerprinting was not checked.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

global.self = global;
global.Logger = { error() {}, debug() {}, warn() {} };
require('../modules/core/categories.js');
const DomainList = require('../modules/core/domain-list.js');
const ScanScope = require('../modules/core/scan-scope.js');
require('../modules/core/storage-manager.js');
const StorageManager = global.StorageManager;
require('../modules/settings/settings-transfer.js');
const SettingsPresets = require('../modules/settings/settings-presets.js');

test('JS hooks are off on a listed site and its subdomains, never on a look-alike, and on by default', () => {
  const detection = { hooksOffDomains: ['example.com', 'Shop.Test'] };
  for (const host of ['example.com', 'www.example.com', 'a.b.shop.test']) assert.equal(ScanScope.hooksOff(detection, host), true, host);
  for (const host of ['notexample.com', 'example.com.evil.test', 'test', '', undefined]) assert.equal(ScanScope.hooksOff(detection, host), false, String(host));
  for (const none of [undefined, null, {}, { hooksOffDomains: [] }]) assert.equal(ScanScope.hooksOff(none, 'example.com'), false);
  assert.equal(ScanScope.isExcluded('https://example.com/', detection), false, 'hooks off is not "not scanned"');
  assert.equal(DomainList.matches('example.com', detection.hooksOffDomains), true);
});

test('every list of sites is written once: exported, kept by a reset, merged by additions and removals, and empty by default', () => {
  assert.deepEqual([...ScanScope.SITE_LIST_KEYS], ['blacklistedDomains', 'allowedDomains', 'hooksOffDomains']);
  assert.ok(Object.isFrozen(ScanScope.SITE_LIST_KEYS));
  const defaults = JSON.parse(read('sections/settings/default-settings.json')).settings;
  const portable = globalThis.SettingsTransfer.portable({ detection: Object.fromEntries(ScanScope.SITE_LIST_KEYS.map(key => [key, ['a.example']])) });
  for (const key of ScanScope.SITE_LIST_KEYS) {
    assert.deepEqual(defaults.detection[key], [], `${key} is empty by default`);
    assert.deepEqual(portable.detection[key], ['a.example'], `${key} is exported`);
    assert.ok(SettingsPresets.KEEP.includes(`detection.${key}`), `${key} is kept by a reset`);
    const merged = StorageManager.mergeSettingsChanges(
      { detection: { [key]: ['a.example', 'b.example'] } },
      { detection: { [key]: ['b.example', 'c.example'] } },
      { detection: { [key]: ['a.example', 'd.example'] } });
    assert.deepEqual(merged.detection[key], ['d.example', 'c.example'], `${key} merges the additions and removals of both sides`);
  }
});

// ---- The install the page's world receives
function engineContext(extra = {}) {
  const context = vm.createContext({
    URL, Date, JSON, Math, Map, Set, Promise, console,
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
    Logger: { warn() {}, debug() {}, detection() {}, cache() {}, error() {}, debugMode: false },
    StorageManager: { normalizeSettings: settings => settings || {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setTimeout, clearTimeout,
    ...extra
  });
  context.self = context;
  for (const file of ['utils/url-utils.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js',
    'modules/core/hooks-config.js', 'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
    ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(name => `modules/detection/engine/detection-engine-${name}.js`)]) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return { context, Engine: vm.runInContext('DetectionEngineManager', context), UrlUtils: vm.runInContext('UrlUtils', context) };
}

const DETECTORS = {
  fingerprint: { 'detect-fp': { id: 'detect-fp', name: 'FP', enabled: true, detection: {
    js_hooks: [{ target: 'HTMLCanvasElement.prototype.toDataURL', confidence: 80 }], window: [{ name: 'fpGlobal', confidence: 90 }] } } },
  antibot: { 'detect-resp': { id: 'detect-resp', name: 'Resp', enabled: true, detection: {
    payload: [{ id: 'challenge', urlPattern: 'https://api.example.test/challenge', body: 'response', pattern: 'x', confidence: 80 }] } } }
};

async function installFor(hostname, detection, options) {
  const { Engine } = engineContext();
  const events = [];
  await Engine.installHooksOrchestrator({ location: { hostname, href: `https://${hostname}/` }, dispatchEvent(event) { events.push(event); } }, {
    storage: { local: { async get() { return { scrapfly_detectors: { detectors: DETECTORS }, scrapfly_settings: { detection } }; } } }
  }, options);
  assert.equal(events.length, 1);
  return JSON.parse(JSON.stringify(events[0].detail));
}

test('a site without JS hooks gets an install with no hooks and no response capture, and keeps its window checks', async () => {
  for (const host of ['example.com', 'shop.example.com']) {
    const off = await installFor(host, { hooksOffDomains: ['example.com'] });
    assert.deepEqual(off.hookDefinitions, [], host);
    assert.equal(off.hooksOff, true, host);
    assert.ok(!('responseCapture' in off), `${host}: nothing is wrapped to read a response`);
    assert.equal(off.windowProperties.length, 1, `${host}: the window checks only read the page's globals`);
    assert.equal(off.windowProperties[0].detectorId, 'detect-fp');
    assert.equal(off.fingerprintEnabled, true);
  }
});

test('a site left out of scanning gets an install with no hooks, no response capture and no window checks', async () => {
  const skipped = [
    ['shop.example.com', { scanMode: 'blocklist', blacklistedDomains: ['shop.example.com'] }],
    ['other.test', { scanMode: 'allowlist', allowedDomains: ['example.com'] }]
  ];
  for (const [host, detection] of skipped) {
    const install = await installFor(host, detection);
    assert.deepEqual(install.hookDefinitions, [], host);
    assert.equal(install.hooksOff, true, host);
    assert.ok(!('responseCapture' in install), host);
    assert.deepEqual(install.windowProperties, [], `${host}: nothing of the page is checked`);
  }
  // The chosen site and a site off the blocklist are installed as usual
  for (const [host, detection] of [['example.com', { scanMode: 'allowlist', allowedDomains: ['example.com'] }], ['www.example.com', { scanMode: 'blocklist', blacklistedDomains: ['shop.example.com'] }]]) {
    const install = await installFor(host, detection);
    assert.equal(install.hookDefinitions.length, 1, host);
    assert.ok(!('hooksOff' in install), host);
    assert.equal(install.windowProperties.length, 1, host);
  }
});

test('every other site, and a site when the list is empty, is installed with its hooks and its response capture as before', async () => {
  for (const [host, detection] of [['other.test', { hooksOffDomains: ['example.com'] }], ['example.com', { hooksOffDomains: [] }], ['example.com', {}], ['notexample.com', { hooksOffDomains: ['example.com'] }]]) {
    const on = await installFor(host, detection);
    assert.equal(on.hookDefinitions.length, 1, host);
    assert.equal(on.hookDefinitions[0].id, 'detect-fp');
    assert.ok(!('hooksOff' in on), host);
    assert.equal(on.responseCapture.patterns.length, 1, `${host}: response capture`);
    assert.equal(on.windowProperties.length, 1);
  }
});

test('a re-arm install (rescan or SPA navigation after a cached load) tells the MAIN world so; the first install does not', async () => {
  const first = await installFor('other.test', {});
  assert.ok(!('rearm' in first));
  const rearm = await installFor('other.test', {}, { rearm: true });
  assert.equal(rearm.rearm, true);
  assert.equal(rearm.hookDefinitions.length, 1);
  const rearmOff = await installFor('example.com', { hooksOffDomains: ['example.com'] }, { rearm: true });
  assert.equal(rearmOff.rearm, true);
  assert.equal(rearmOff.hooksOff, true);
});

// ---- A cached result belongs to one setting or the other
function cacheHarness(cacheScope, state) {
  const stored = {};
  const { context, Engine, UrlUtils } = engineContext({
    Utils: { getCacheScope: async () => cacheScope, getSettings: async () => state.settings },
    chrome: { storage: { local: {
      get: async () => ({ scrapfly_detection_storage: stored }),
      set: async (values) => { Object.assign(stored, values.scrapfly_detection_storage); }
    } } }
  });
  void context;
  const detection = (id) => [{ id, category: 'fingerprint', confidence: 90, detector: { id, name: id }, matches: [{ type: 'js_hooks', pattern: 'x', confidence: 90 }] }];
  return { Engine, UrlUtils, stored, detection };
}
const off = (...sites) => ({ detection: { hooksOffDomains: sites } });

test('a result found with JS hooks off is marked, and only answers while they are off', async () => {
  const state = { settings: off() };
  const { Engine, detection, stored } = cacheHarness('full', state);
  const url = 'https://shop.example.com/a';
  const page = { url, hostname: 'shop.example.com' };

  const first = await Engine.storeDetection(url, page, detection('with-hooks'));
  assert.ok(!('hooksOff' in first), 'a result found with the hooks carries no mark');
  assert.equal((await Engine.getStoredDetection(url)).detectionResults[0].id, 'with-hooks');

  state.settings = off('example.com');
  assert.equal(await Engine.getStoredDetection(url), null, 'the setting changed: the earlier result does not describe this scan');
  assert.equal(Object.keys(stored).length, 1, 'it is not deleted, a later scan replaces it');
  const second = await Engine.storeDetection(url, page, detection('without-hooks'));
  assert.equal(second.hooksOff, true);
  assert.equal(Object.keys(stored).length, 1, 'the same address, so the same entry');
  assert.equal((await Engine.getStoredDetection(url)).detectionResults[0].id, 'without-hooks');

  state.settings = off();
  assert.equal(await Engine.getStoredDetection(url), null, 'and the other way round');
});

test('a rescan that finds nothing keeps an earlier result only if it was found under the same setting', async () => {
  const state = { settings: off() };
  const { Engine, detection } = cacheHarness('full', state);
  const url = 'https://example.com/p';
  const page = { url, hostname: 'example.com' };
  await Engine.storeDetection(url, page, detection('with-hooks'));

  const same = await Engine.storeDetection(url, page, []);
  assert.equal(same.preservedExisting, true, 'same setting: a weak rescan does not erase a positive result');

  state.settings = off('example.com');
  const other = await Engine.storeDetection(url, page, []);
  assert.ok(!other.preservedExisting, 'JS hooks are off now: the earlier fingerprinting is not this page\'s result');
  assert.equal(other.detectionCount, 0);
  assert.equal(other.hooksOff, true);
});

test('under the Domain scope the www and bare host share a result only under the same setting', async () => {
  const state = { settings: off('example.com') };
  const { Engine, detection } = cacheHarness('domain', state);
  await Engine.storeDetection('https://www.example.com/x', { url: 'https://www.example.com/x', hostname: 'www.example.com' }, detection('without-hooks'));
  assert.equal((await Engine.getStoredDetection('https://example.com/y')).detectionResults[0].id, 'without-hooks');
  state.settings = off();
  assert.equal(await Engine.getStoredDetection('https://example.com/y'), null);
});

test('results cached before the setting existed count as found with the hooks, and an unreadable setting never costs a lookup', async () => {
  const state = { settings: off() };
  const { Engine, UrlUtils, stored } = cacheHarness('full', state);
  const url = 'https://legacy.example/';
  const NOW = Date.now();
  stored[UrlUtils.hashUrl(url, 'full')] = { url, hostname: 'legacy.example', cacheScope: 'full', timestamp: NOW, expiry: NOW + 60000, detectionCount: 1, detectionResults: [{ id: 'legacy' }] };
  assert.equal((await Engine.getStoredDetection(url)).detectionResults[0].id, 'legacy');
  state.settings = off('legacy.example');
  assert.equal(await Engine.getStoredDetection(url), null);

  assert.equal(await Engine.hooksOffFor(url), true);
  state.settings = null;
  assert.equal(await Engine.hooksOffFor(url), false);
  const broken = cacheHarness('full', { get settings() { throw new Error('unreadable'); } });
  assert.equal(await broken.Engine.hooksOffFor(url), false);
});

// ---- What the popup says
class Element {
  constructor() { this.attributes = {}; this.hidden = false; this.textContent = ''; this.classes = new Set(); this.classList = { toggle: (name, on) => { if (on) this.classes.add(name); else this.classes.delete(name); } }; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

function noteHarness({ url, detection, outcome = 'complete', failing = false }) {
  const note = new Element(), badge = new Element(), description = new Element();
  badge.textContent = '✓ No Fingerprinting';
  description.textContent = 'No matching antibot, CAPTCHA, or fingerprinting signals were found on this page.';
  note.hidden = true;
  const debug = [];
  const context = vm.createContext({
    Logger: { debug: (...args) => debug.push(args) },
    ScanScope, UrlUtils: { getHostnameFromUrl: address => new URL(address).hostname },
    Utils: { getSettings: async () => ({ detection }) },
    chrome: { tabs: { query: async () => { if (failing) throw new Error('no tab'); return [{ url }]; } } },
    I18n: { tr: (key, fallback) => `<${key}>` },
    document: { querySelector: selector => ({ '#hooksOffNote': note, '#emptyState [data-badge="fingerprint"]': badge, '#emptyState .state-card-description': description })[selector] || null }
  });
  vm.runInContext(read('sections/detection/detection-ui.js'), context, { filename: 'detection-ui.js' });
  const ui = vm.runInContext('DetectionUI', context);
  return { run: () => ui.syncHooksOffNote.call({ scanOutcome: outcome }), note, badge, description, debug };
}

test('on a site without JS hooks the results say fingerprinting is not checked, and "No Fingerprinting" is not claimed', async () => {
  const h = noteHarness({ url: 'https://shop.example.com/a', detection: { hooksOffDomains: ['example.com'] } });
  await h.run();
  assert.equal(h.note.hidden, false);
  assert.equal(h.badge.textContent, '<hooksOffBadge>');
  assert.equal(h.badge.attributes['data-i18n'], 'hooksOffBadge');
  assert.ok(h.badge.classes.has('state-card-badge--off'));
  assert.equal(h.description.textContent, '<hooksOffEmptyDesc>');
  assert.equal(h.description.attributes['data-i18n'], 'hooksOffEmptyDesc');
});

test('anywhere else the note is hidden and the badge is the usual one', async () => {
  const h = noteHarness({ url: 'https://other.test/', detection: { hooksOffDomains: ['example.com'] } });
  h.note.hidden = false;
  h.badge.classList.toggle('state-card-badge--off', true);
  await h.run();
  assert.equal(h.note.hidden, true);
  assert.equal(h.badge.textContent, '<detectionBadgeNoFingerprint>');
  assert.equal(h.badge.attributes['data-i18n'], 'detectionBadgeNoFingerprint');
  assert.ok(!h.badge.classes.has('state-card-badge--off'));
  assert.equal(h.description.attributes['data-i18n'], undefined, 'the description is left as the screen set it');
});

test('a scan that did not finish keeps its own words, and a failed lookup leaves the page as it was', async () => {
  const failed = noteHarness({ url: 'https://example.com/', detection: { hooksOffDomains: ['example.com'] }, outcome: 'failed' });
  await failed.run();
  assert.equal(failed.note.hidden, false, 'the note still applies');
  assert.equal(failed.description.attributes['data-i18n'], undefined, 'but a failed scan does not claim "nothing was found"');

  const broken = noteHarness({ url: 'https://example.com/', detection: { hooksOffDomains: ['example.com'] }, failing: true });
  await broken.run();
  assert.equal(broken.note.hidden, true);
  assert.equal(broken.debug.length, 1, 'it is only logged');
});

test('the pages declare what the scripts fill: the note, the fingerprint badge, the box of sites', () => {
  const detection = read('sections/detection/detection.html');
  assert.match(detection, /<div id="hooksOffNote" class="hooks-off-note" role="note" hidden>/);
  assert.match(detection, /data-badge="fingerprint" data-i18n="detectionBadgeNoFingerprint"/);
  const settings = read('sections/settings/settings.html');
  assert.match(settings, /<textarea id="hooksOffDomains" class="textarea-field textarea-field--mono site-list-box"/);
  for (const id of ['historyExcludedDomains', 'webhookDomains']) assert.match(settings, new RegExp(`<textarea id="${id}"[^>]*site-list-box`), `${id} shares the box style`);
  for (const key of ['hooksOffGroupTitle', 'hooksOffLabel', 'hooksOffHint']) assert.ok(settings.includes(`data-i18n="${key}"`), key);
  const en = JSON.parse(read('_locales/en/messages.json'));
  for (const key of ['hooksOffGroupTitle', 'hooksOffLabel', 'hooksOffHint', 'hooksOffNote', 'hooksOffBadge', 'hooksOffEmptyDesc']) assert.ok(en[key] && en[key].message, `${key} is an English message`);
});

test('Settings reads the box as a clean list, and saves it with the other lists', () => {
  const ui = read('sections/settings/settings-ui.js');
  assert.match(ui, /hooksOffDomains: SettingsUI\.readSiteList\('#hooksOffDomains', this\.settings\.detection\?\.hooksOffDomains\)/);
  assert.match(ui, /for \(const key of ScanScope\.SITE_LIST_KEYS\)/, 'a list of sites must hold site names only, for every list');
  const context = vm.createContext({ DomainList, document: { querySelector: selector => (selector === '#box' ? { value: 'HTTPS://Shop.Example.com/cart\n example.org, *.cdn.net' } : null) }, self: {}, console });
  vm.runInContext(ui, context, { filename: 'settings-ui.js' });
  const SettingsUI = vm.runInContext('SettingsUI', context);
  assert.deepEqual(JSON.parse(JSON.stringify(SettingsUI.readSiteList('#box', ['kept.example']))), ['shop.example.com', 'example.org', 'cdn.net']);
  assert.deepEqual(JSON.parse(JSON.stringify(SettingsUI.readSiteList('#missing', ['kept.example']))), ['kept.example'], 'no box on the page: what is saved stays');
  assert.deepEqual(JSON.parse(JSON.stringify(SettingsUI.readSiteList('#missing'))), []);
});
